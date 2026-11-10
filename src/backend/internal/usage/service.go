// 이용 기록 규칙(SPEC-032 Phase 3) — 허용 목록 · 나이로 시각 계산 · 시간 단위 내림 · 상한.
//
// 내용은 받지 않는다. IP 는 횟수 제한의 키로만 쓰고 저장하지 않는다(IPv6 는 /64 로 묶는다).
package usage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"net"
	"regexp"
	"sync"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

const (
	MaxAge = 7 * 24 * time.Hour
	// 원본 보관 기간. 합계는 지우지 않는다.
	RetainDays = 90
	// 최근 며칠을 다시 계산하는가(늦게 온 보고를 받아들인다).
	// [원본] RecomputeDays = 7 — 받는 나이(7일)보다 하루 짧아 D-7 늦은 기록이 집계에서 빠졌다(코드 리뷰 L-2)
	RecomputeDays = 8

	// 통신사 NAT 뒤에는 한 IP 에 사람이 많다 — 넉넉히 잡고, 표가 끝없이 커지는 것만 막는다.
	RatePerIPPerMinute   = 600
	NewDevicesPerIPDaily = 200
	RowsPerActorDaily    = 2000
	RowsGlobalDaily      = 500_000
	// 한 IP 가 전체 상한을 혼자 채우지 못하게 한다 — 기록을 담은 요청 수로 센다(요청당 최대 50행 · 코드 리뷰 M-1).
	EventBatchesPerIPDaily = 2000
)

// KST — 일 경계. 컨테이너에 tzdata 가 없어도 같게 고정 오프셋을 쓴다.
var KST = time.FixedZone("KST", 9*60*60)

// 허용 이벤트. 소셜 행동(글·좋아요…)은 도메인 표로 세므로 여기 없다.
var allowedEvents = map[string]bool{
	"app_open": true, "workout_start": true, "workout_start_routine": true, "workout_finish": true,
	"routine_create": true, "routine_edit": true, "routine_import": true, "routine_import_draft": true, // 초안 만들기(SPEC-054 · REV-116 P19)
	"exercise_search": true, "exercise_finder": true, "rest_timer": true,
	"feed_tab_following": true, "feed_tab_recommended": true, "gym_search": true,
	"data_import": true, "data_export": true, "feedback_send": true, "ad_click": true,
	"screen_home": true, "screen_workout": true, "screen_routines": true, "screen_exercises": true,
	"screen_history": true, "screen_stats": true, "screen_calendar": true, "screen_feed": true,
	"screen_profile": true, "screen_messages": true, "screen_notifications": true, "screen_coaching": true,
	"screen_gyms": true, "screen_program": true, "screen_explore": true, "screen_account": true,
	"screen_gear": true, "screen_other": true,
}

var (
	uuidRe   = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	semverRe = regexp.MustCompile(`^\d{1,4}\.\d{1,5}\.\d{1,6}$`)
)

// Limiter 는 횟수 제한 — 저장소가 흔들리면 통과시킨다.
type Limiter interface {
	Allow(ctx context.Context, key string, limit int, window time.Duration) bool
}

// EventRow 는 저장할 한 줄이다.
type EventRow struct {
	At            time.Time
	ClientEventID string
	Event         string
}

// Repo 는 저장소다.
type Repo interface {
	UserExists(ctx context.Context, id string) (bool, error)
	PresenceExists(ctx context.Context, kind, id string) (bool, error)
	InsertEvents(ctx context.Context, kind, id, platform, version string, rows []EventRow) (int64, error)
	CountActorEvents(ctx context.Context, kind, id string, since time.Time) (int64, error)
	CountEventsSince(ctx context.Context, since time.Time) (int64, error)
	// 2분 지났을 때만 last_seen 을 쓰고, 그때 그날의 활성일도 적는다.
	TouchPresence(ctx context.Context, kind, id string, now time.Time, day string) error
	// 잠금을 잡지 못하면 ran=false.
	Aggregate(ctx context.Context, today time.Time) (ran bool, err error)
	Purge(ctx context.Context, cutoff time.Time, cutoffDay string) error
}

// Config 는 서비스 설정이다.
type Config struct {
	Enabled bool
	Since   time.Time
}

// Service 는 받기와 밤 작업이다.
type Service struct {
	repo    Repo
	limiter Limiter
	now     func() time.Time
	cfg     Config

	mu          sync.Mutex
	globalCount int64
	globalAt    time.Time
}

func NewService(repo Repo, limiter Limiter, now func() time.Time, cfg Config) *Service {
	return &Service{repo: repo, limiter: limiter, now: now, cfg: cfg}
}

// Input 은 한 번의 보고다.
type Input struct {
	ViewerID  string // 토큰이 유효하면 계정
	HasBearer bool   // 인증 헤더가 있었는가
	IP        string
	DeviceID  string
	Platform  string
	Version   string
	Presence  bool
	Events    []Incoming
}

// Incoming 은 기기가 보낸 이벤트다.
type Incoming struct {
	ClientEventID string
	Event         string
	AgeMs         int64
}

// Result 는 응답이다.
type Result struct {
	Accepted int32
	Unknown  []string
	Enabled  bool
}

// NormalizePlatform 은 허용 값이 아니면 unknown 이다.
func NormalizePlatform(p string) string {
	switch p {
	case "web", "android", "ios":
		return p
	}
	return "unknown"
}

// NormalizeVersion 은 semver 가 아니면 비운다.
func NormalizeVersion(v string) string {
	if semverRe.MatchString(v) {
		return v
	}
	return ""
}

// RateKey 는 IP 를 횟수 제한 키로 바꾼다. IPv6 는 /64 로 묶는다(한 집이 주소를 수없이 갖는다).
func RateKey(ip string) string {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return "unknown"
	}
	// [원본] IP 를 그대로 돌려줬다 — 제한 키로 Redis 에 하루까지 남는다. 「IP 를 저장하지 않는다」에 맞게 해시한다(코드 리뷰 L-4)
	key := parsed.Mask(net.CIDRMask(64, 128)).String()
	if v4 := parsed.To4(); v4 != nil {
		key = v4.String()
	}
	sum := sha256.Sum256([]byte("usage-rate:" + key))
	return hex.EncodeToString(sum[:12])
}

// Filter 는 이벤트를 저장할 줄로 바꾼다. 허용 목록·형식·나이·시행일을 본다.
func Filter(in []Incoming, now, since time.Time) (rows []EventRow, unknown []string) {
	seen := map[string]bool{}
	for _, e := range in {
		if !allowedEvents[e.Event] {
			if !seen[e.Event] && len(unknown) < 10 && len(e.Event) <= 64 {
				seen[e.Event] = true
				unknown = append(unknown, e.Event)
			}
			continue
		}
		if !uuidRe.MatchString(e.ClientEventID) {
			continue
		}
		age := max(e.AgeMs, 0)
		if age > MaxAge.Milliseconds() {
			continue
		}
		at := now.Add(-time.Duration(age) * time.Millisecond)
		if at.Before(since) {
			continue
		}
		rows = append(rows, EventRow{At: at.UTC().Truncate(time.Hour), ClientEventID: e.ClientEventID, Event: e.Event})
	}
	return rows, unknown
}

// DayOf 는 KST 날짜(YYYY-MM-DD)다.
func DayOf(t time.Time) string { return t.In(KST).Format("2006-01-02") }

// Report 는 보고 하나를 받는다.
func (s *Service) Report(ctx context.Context, in Input) (Result, error) {
	if !s.cfg.Enabled {
		return Result{Enabled: false}, nil
	}
	res := Result{Enabled: true}
	now := s.now()

	// 헤더가 있는데 신원이 없으면 토큰이 무효다 — 비로그인으로 떨어뜨리지 않는다.
	if in.HasBearer && in.ViewerID == "" {
		return res, errs.New(errs.Unauthorized, "다시 로그인이 필요합니다")
	}
	ipKey := RateKey(in.IP)
	if !s.limiter.Allow(ctx, "usage:ip:"+ipKey, RatePerIPPerMinute, time.Minute) {
		return res, errs.New(errs.ResourceExhausted, "요청이 너무 잦습니다")
	}

	kind, id := "guest", in.DeviceID
	if in.ViewerID != "" {
		kind, id = "user", in.ViewerID
		ok, err := s.repo.UserExists(ctx, id)
		if err != nil {
			return res, err
		}
		if !ok {
			return res, errs.New(errs.Unauthorized, "계정이 없습니다")
		}
	} else if !uuidRe.MatchString(id) {
		return res, errs.New(errs.Validation, "기기 ID 형식이 맞지 않습니다")
	}

	rows, unknown := Filter(in.Events, now, s.cfg.Since)
	res.Unknown = unknown

	// 시행 전에는 아무것도 쓰지 않는다.
	if now.Before(s.cfg.Since) {
		return res, nil
	}

	if kind == "guest" {
		exists, err := s.repo.PresenceExists(ctx, kind, id)
		if err != nil {
			return res, err
		}
		// 같은 IP 에서 새 기기를 끝없이 만들어 표를 키우지 못하게 한다. 이미 있는 기기는 영향이 없다.
		if !exists && !s.limiter.Allow(ctx, "usage:newdev:"+ipKey, NewDevicesPerIPDaily, 24*time.Hour) {
			return res, nil
		}
	}

	if in.Presence {
		if err := s.repo.TouchPresence(ctx, kind, id, now, DayOf(now)); err != nil {
			return res, err
		}
	}
	if len(rows) == 0 {
		return res, nil
	}

	if !s.limiter.Allow(ctx, "usage:batch:"+ipKey, EventBatchesPerIPDaily, 24*time.Hour) {
		return res, nil
	}
	since := now.Add(-24 * time.Hour)
	used, err := s.repo.CountActorEvents(ctx, kind, id, since)
	if err != nil {
		return res, err
	}
	room := RowsPerActorDaily - used
	if room <= 0 {
		return res, nil
	}
	if int64(len(rows)) > room {
		rows = rows[:room]
	}
	global, err := s.globalRows(ctx, now, since)
	if err != nil {
		return res, err
	}
	if global >= RowsGlobalDaily {
		// 요청마다 찍지 않는다 — 상한에 닿으면 로그가 넘친다
		if s.limiter.Allow(ctx, "usage:globalwarn", 1, time.Hour) {
			slog.Warn("이용 기록 전체 하루 상한에 닿았다", "rows", global)
		}
		return res, nil
	}
	n, err := s.repo.InsertEvents(ctx, kind, id, NormalizePlatform(in.Platform), NormalizeVersion(in.Version), rows)
	if err != nil {
		return res, err
	}
	res.Accepted = int32(n)
	return res, nil
}

// globalRows 는 전체 하루 행 수다. 비싸므로 1분 묶어 둔다.
func (s *Service) globalRows(ctx context.Context, now, since time.Time) (int64, error) {
	s.mu.Lock()
	if now.Sub(s.globalAt) < time.Minute {
		n := s.globalCount
		s.mu.Unlock()
		return n, nil
	}
	s.mu.Unlock()
	n, err := s.repo.CountEventsSince(ctx, since)
	if err != nil {
		return 0, err
	}
	s.mu.Lock()
	s.globalCount, s.globalAt = n, now
	s.mu.Unlock()
	return n, nil
}

// RunJob 은 집계 → 성공하면 원본 정리 순서로 돈다. 집계가 실패하면 원본을 지우지 않는다.
func (s *Service) RunJob(ctx context.Context) error {
	now := s.now()
	ran, err := s.repo.Aggregate(ctx, now)
	if err != nil || !ran {
		return err
	}
	cutoff := now.AddDate(0, 0, -RetainDays)
	return s.repo.Purge(ctx, cutoff, DayOf(cutoff))
}

// Loop 는 켤 때 한 번, 그 뒤 주기마다 집계한다.
func (s *Service) Loop(ctx context.Context, every time.Duration) {
	run := func() {
		if err := s.RunJob(ctx); err != nil && ctx.Err() == nil {
			slog.Error("이용 기록 집계 실패", "err", err)
		}
	}
	run()
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			run()
		}
	}
}
