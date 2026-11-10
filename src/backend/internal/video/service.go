// Package video — 유튜브 링크로 루틴을 가져올 때 영상 정보(제목·채널·설명란·길이·임베드 가능)를 읽는다(SPEC-054 Phase 2 · SRS-116).
//
// 규칙만 여기 있다 — HTTP·connect 를 모른다(Fetcher 는 client.go 가 구현). 그래서 가짜 Fetcher·가짜 시계로 2ms 에 시험된다.
//
// 지키는 것(ADR-063 · 스펙 리뷰 REV-112):
//   - 자막·음성은 읽지 않는다. Fetcher 는 videos.list(snippet·contentDetails·status) 하나뿐이다.
//   - 설명란은 응답으로만 — 로그·DB 에 쓰지 않는다(로그에는 영상 id·사유만). 캐시는 메모리 24시간(YouTube API 정책 30일 안).
//   - 할당량(하루 10,000)을 지킨다: 사용자당 분당 6·하루 50(바깥 호출만 센다 — 캐시 적중은 안 셈) · 서버 전체 하루 8,000 ·
//     quotaExceeded 면 다음 태평양시 자정까지, 키 거절이면 10분 멈춘다 · 같은 id 동시 호출은 한 번만(singleflight).
//   - 없는 영상도 10분 캐시한다(같은 id 되풀이로 할당량을 깎지 못하게 — 매번 새 id 는 사용자·IP 하루 제한과 서버 예산이 막는다).
//   - 예산·정지 동안에는 사용자 횟수를 깎지 않는다(먼저 본다). 남의 호출에 합류(singleflight)한 요청은 센다 — 되돌리기 어렵고 드물다.
//   - 예산·정지는 프로세스 메모리 — 인스턴스 하나 전제(h2500-3). 재시작하면 0 부터(최종 상한은 GCP 할당량).
package video

import (
	"container/list"
	"context"
	"errors"
	"log/slog"
	"math"
	"regexp"
	"sync"
	"time"

	// 운영 이미지(alpine)에 시간대 자료가 없다 — 없으면 태평양시가 PST 고정으로 떨어져 서머타임 동안 하루 경계가 1시간 어긋난다(리뷰 G1)
	_ "time/tzdata"

	"golang.org/x/sync/singleflight"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// Info — 영상 정보. 설명란은 화면이 규칙으로 해석하고 버린다.
type Info struct {
	VideoID     string
	Title       string
	Channel     string
	Description string
	DurationSec int
	Embeddable  bool
}

// 바깥(Data API) 실패 종류 — client 가 이 값들로 바꿔 돌려준다(키가 든 주소가 오류 문장에 실리지 않게 · B1).
var (
	ErrNotFound      = errors.New("video: not found")
	ErrQuotaExceeded = errors.New("video: quota exceeded")
	ErrKeyRejected   = errors.New("video: key rejected")
	// ErrRateLimited — 분당 쿼리 한도(하루 할당량과 다르다 · 리뷰 G2/S1) → 1분만 멈춘다
	ErrRateLimited = errors.New("video: rate limited")
	ErrUpstream    = errors.New("video: upstream failed")
)

// Fetcher — Data API 한 번 부르기. 없는 영상이면 ErrNotFound.
type Fetcher interface {
	Fetch(ctx context.Context, videoID string) (Info, error)
}

// Limiter — 사용자별 횟수 제한(middleware.Limiter 가 구현 · usage 와 같은 인터페이스).
type Limiter interface {
	Allow(ctx context.Context, key string, limit int, window time.Duration) bool
}

const (
	PerUserPerMinute = 6
	PerUserPerDay    = 50
	PerIPPerDay      = 100
	ServerPerDay     = 8_000

	cacheSize    = 2_000
	hitTTL       = 24 * time.Hour
	missTTL      = 10 * time.Minute
	keyPause     = 10 * time.Minute
	ratePause    = time.Minute
	fetchTimeout = 5 * time.Second

	maxTitle = 200
	maxDesc  = 5_000
)

var idRe = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)

type entry struct {
	id      string
	info    Info
	missing bool
	until   time.Time
}

// Service — 캐시·제한·예산·정지. 키가 없으면(Fetcher nil) 늘 Unavailable.
type Service struct {
	fetch   Fetcher
	limiter Limiter
	now     func() time.Time
	group   singleflight.Group

	mu          sync.Mutex
	lru         *list.List
	byID        map[string]*list.Element
	day         string // 태평양시 날짜 — Data API 할당량이 그 자정에 다시 찬다
	dayCalls    int
	pausedUntil time.Time
}

func NewService(fetch Fetcher, limiter Limiter, now func() time.Time) *Service {
	return &Service{fetch: fetch, limiter: limiter, now: now, lru: list.New(), byID: map[string]*list.Element{}}
}

// Enabled — 키가 있어 링크 해석을 할 수 있나(부팅 로그용).
func (s *Service) Enabled() bool { return s.fetch != nil }

var pacific = func() *time.Location {
	if l, err := time.LoadLocation("America/Los_Angeles"); err == nil {
		return l
	}
	slog.Warn("[video] 시간대 자료 없음 — 태평양시를 PST 고정으로 쓴다")
	return time.FixedZone("PST", -8*3600)
}()

// Describe — viewerID 가 비면 Unauthorized. ip 는 하루 제한 열쇠(비면 사용자 제한만).
func (s *Service) Describe(ctx context.Context, viewerID, ip, videoID string) (Info, error) {
	if viewerID == "" {
		return Info{}, errs.New(errs.Unauthorized, "로그인하면 링크로 불러올 수 있어요")
	}
	if !idRe.MatchString(videoID) {
		return Info{}, errs.New(errs.Validation, "유튜브 영상 id 형식이 아니에요")
	}
	if s.fetch == nil {
		return Info{}, errs.New(errs.Unavailable, "영상 정보를 불러올 수 없어요")
	}
	if info, missing, ok := s.cached(videoID); ok {
		if missing {
			return Info{}, errs.New(errs.NotFound, "비공개거나 삭제된 영상이에요")
		}
		return info, nil
	}
	// 멈춤·예산 끝이면 사용자 횟수를 깎기 전에 돌려보낸다(리뷰 G3/S5)
	if s.blocked() {
		return Info{}, errs.New(errs.Unavailable, "영상 정보를 불러올 수 없어요")
	}
	// 바깥 호출에만 사용자 제한을 센다(캐시 적중은 위에서 끝)
	if s.limiter != nil {
		if !s.limiter.Allow(ctx, "video:user:min:"+viewerID, PerUserPerMinute, time.Minute) {
			return Info{}, errs.New(errs.ResourceExhausted, "잠시 뒤 다시 시도해 주세요")
		}
		if !s.limiter.Allow(ctx, "video:user:day:"+viewerID, PerUserPerDay, 24*time.Hour) ||
			(ip != "" && !s.limiter.Allow(ctx, "video:ip:day:"+ip, PerIPPerDay, 24*time.Hour)) {
			return Info{}, errs.New(errs.ResourceExhausted, "오늘은 링크로 불러오기를 더 할 수 없어요 — 내일 다시 하거나 글을 붙여 넣어 주세요")
		}
	}
	v, err, _ := s.group.Do(videoID, func() (any, error) {
		// 다른 사람이 막 채웠을 수 있다
		if info, missing, ok := s.cached(videoID); ok {
			if missing {
				return nil, ErrNotFound
			}
			return info, nil
		}
		if err := s.takeBudget(); err != nil {
			return nil, err
		}
		// 요청과 떨어진 문맥 — 한 사람이 취소해도 같이 기다리던 사람이 실패하지 않게(B11)
		fctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), fetchTimeout)
		defer cancel()
		info, err := s.fetch.Fetch(fctx, videoID)
		switch {
		case err == nil:
			info = trim(info)
			s.store(videoID, info, false)
			return info, nil
		case errors.Is(err, ErrNotFound):
			s.store(videoID, Info{}, true)
			return nil, ErrNotFound
		case errors.Is(err, ErrQuotaExceeded):
			s.pause(nextPacificMidnight(s.now()))
			slog.WarnContext(ctx, "[video] Data API 할당량 초과 — 태평양시 자정까지 멈춤")
			return nil, err
		case errors.Is(err, ErrRateLimited):
			s.pause(s.now().Add(ratePause))
			slog.WarnContext(ctx, "[video] Data API 분당 한도 — 1분 멈춤")
			return nil, err
		case errors.Is(err, ErrKeyRejected):
			s.pause(s.now().Add(keyPause))
			slog.WarnContext(ctx, "[video] Data API 키 거절 — 10분 멈춤(키·API 사용 설정 확인)")
			return nil, err
		default:
			slog.WarnContext(ctx, "[video] Data API 호출 실패", "video", videoID, "reason", reasonOf(err))
			return nil, ErrUpstream
		}
	})
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return Info{}, errs.New(errs.NotFound, "비공개거나 삭제된 영상이에요")
		}
		return Info{}, errs.New(errs.Unavailable, "영상 정보를 불러올 수 없어요")
	}
	return v.(Info), nil
}

// reasonOf — 로그에는 종류만(오류 문장에 주소·키가 실릴 수 있다)
func reasonOf(err error) string {
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		return "timeout"
	case errors.Is(err, ErrUpstream):
		return "upstream"
	default:
		return "other"
	}
}

func (s *Service) cached(id string) (Info, bool, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	el, ok := s.byID[id]
	if !ok {
		return Info{}, false, false
	}
	e := el.Value.(*entry)
	if !s.now().Before(e.until) {
		s.lru.Remove(el)
		delete(s.byID, id)
		return Info{}, false, false
	}
	s.lru.MoveToFront(el)
	return e.info, e.missing, true
}

func (s *Service) store(id string, info Info, missing bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ttl := hitTTL
	if missing {
		ttl = missTTL
	}
	if el, ok := s.byID[id]; ok {
		s.lru.Remove(el)
	}
	s.byID[id] = s.lru.PushFront(&entry{id: id, info: info, missing: missing, until: s.now().Add(ttl)})
	for s.lru.Len() > cacheSize {
		last := s.lru.Back()
		s.lru.Remove(last)
		delete(s.byID, last.Value.(*entry).id)
	}
}

// blocked — 지금 멈춤이거나 오늘 예산이 끝났나(읽기만)
func (s *Service) blocked() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	if now.Before(s.pausedUntil) {
		return true
	}
	return s.day == now.In(pacific).Format("2006-01-02") && s.dayCalls >= ServerPerDay
}

// takeBudget — 서버 전체 하루 예산과 정지를 본다(바깥 호출 직전에만)
func (s *Service) takeBudget() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	if now.Before(s.pausedUntil) {
		return ErrUpstream
	}
	day := now.In(pacific).Format("2006-01-02")
	if day != s.day {
		s.day, s.dayCalls = day, 0
	}
	if s.dayCalls >= ServerPerDay {
		return ErrQuotaExceeded
	}
	s.dayCalls++
	return nil
}

func (s *Service) pause(until time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if until.After(s.pausedUntil) {
		s.pausedUntil = until
	}
}

func nextPacificMidnight(now time.Time) time.Time {
	p := now.In(pacific)
	return time.Date(p.Year(), p.Month(), p.Day()+1, 0, 0, 0, 0, pacific)
}

func trim(i Info) Info {
	i.Title = cut(i.Title, maxTitle)
	i.Channel = cut(i.Channel, maxTitle)
	i.Description = cut(i.Description, maxDesc)
	if i.DurationSec < 0 {
		i.DurationSec = 0
	}
	if i.DurationSec > math.MaxInt32 {
		i.DurationSec = math.MaxInt32
	}
	return i
}

// cut — 글자(rune) 단위로 자른다(한글이 반쪽 나지 않게)
func cut(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}
