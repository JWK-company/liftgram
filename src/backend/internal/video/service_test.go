package video

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type fakeFetch struct {
	calls atomic.Int32
	err   error
	info  Info
	block chan struct{}
}

func (f *fakeFetch) Fetch(ctx context.Context, id string) (Info, error) {
	f.calls.Add(1)
	if f.block != nil {
		<-f.block
	}
	if f.err != nil {
		return Info{}, f.err
	}
	i := f.info
	i.VideoID = id
	return i, nil
}

// countLimiter — 열쇠마다 창(window) 시작·개수를 가짜 시계로 센다(리뷰 G4)
type countLimiter struct {
	mu  sync.Mutex
	clk *clock
	n   map[string]int
	at  map[string]time.Time
}

func (l *countLimiter) Allow(_ context.Context, key string, limit int, window time.Duration) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.n == nil {
		l.n, l.at = map[string]int{}, map[string]time.Time{}
	}
	now := l.clk.now()
	if start, ok := l.at[key]; !ok || !now.Before(start.Add(window)) {
		l.at[key], l.n[key] = now, 0
	}
	l.n[key]++
	return l.n[key] <= limit
}

type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

const vid = "dQw4w9WgXcQ"

func codeOf(err error) errs.Code {
	var d *errs.DomainError
	if errors.As(err, &d) {
		return d.Code
	}
	return ""
}

func newSvc(f Fetcher) (*Service, *clock, *countLimiter) {
	c := &clock{t: time.Date(2026, 11, 10, 12, 0, 0, 0, time.UTC)}
	l := &countLimiter{clk: c}
	return NewService(f, l, c.now), c, l
}

func TestDescribe_LoginAndFormat(t *testing.T) {
	s, _, _ := newSvc(&fakeFetch{})
	if _, err := s.Describe(context.Background(), "", "", vid); codeOf(err) != errs.Unauthorized {
		t.Fatalf("로그인 없이 = %v", err)
	}
	if _, err := s.Describe(context.Background(), "u1", "", "short"); codeOf(err) != errs.Validation {
		t.Fatalf("잘못된 id = %v", err)
	}
	off := NewService(nil, nil, time.Now)
	if off.Enabled() {
		t.Fatal("키 없으면 꺼짐")
	}
	if _, err := off.Describe(context.Background(), "u1", "", vid); codeOf(err) != errs.Unavailable {
		t.Fatalf("키 없음 = %v", err)
	}
}

func TestDescribe_CacheAndTrim(t *testing.T) {
	f := &fakeFetch{info: Info{Title: strings.Repeat("가", 300), Description: strings.Repeat("d", 6000), DurationSec: 600}}
	s, c, _ := newSvc(f)
	a, err := s.Describe(context.Background(), "u1", "", vid)
	if err != nil {
		t.Fatal(err)
	}
	if len([]rune(a.Title)) != maxTitle || len(a.Description) != maxDesc {
		t.Fatalf("자르기: %d %d", len([]rune(a.Title)), len(a.Description))
	}
	if _, err := s.Describe(context.Background(), "u2", "", vid); err != nil || f.calls.Load() != 1 {
		t.Fatalf("캐시 적중이어야: calls=%d err=%v", f.calls.Load(), err)
	}
	c.t = c.t.Add(hitTTL + time.Second)
	if _, err := s.Describe(context.Background(), "u1", "", vid); err != nil || f.calls.Load() != 2 {
		t.Fatalf("24시간 뒤 다시 부름: calls=%d", f.calls.Load())
	}
}

func TestDescribe_NotFoundCached(t *testing.T) {
	f := &fakeFetch{err: ErrNotFound}
	s, c, _ := newSvc(f)
	for i := 0; i < 3; i++ {
		if _, err := s.Describe(context.Background(), "u1", "", vid); codeOf(err) != errs.NotFound {
			t.Fatalf("없음 = %v", err)
		}
	}
	if f.calls.Load() != 1 {
		t.Fatalf("없는 영상도 캐시: calls=%d", f.calls.Load())
	}
	c.t = c.t.Add(missTTL + time.Second)
	_, _ = s.Describe(context.Background(), "u1", "", vid)
	if f.calls.Load() != 2 {
		t.Fatal("10분 뒤 다시")
	}
}

func idN(n int) string { return fmt.Sprintf("id%09d", n) }

func TestDescribe_UserLimitCountsOnlyOutbound(t *testing.T) {
	f := &fakeFetch{}
	s, c, _ := newSvc(f)
	ctx := context.Background()
	// 같은 영상 20번 = 바깥 1번 → 제한에 안 걸린다
	for i := 0; i < 20; i++ {
		if _, err := s.Describe(ctx, "u1", "", vid); err != nil {
			t.Fatalf("캐시 적중은 안 셈: %d %v", i, err)
		}
	}
	// 분당 6 — vid 가 1번을 썼으니 새 id 5개는 통과, 6번째 새 id 는 거절 · 바깥 호출 없음
	for i := 0; i < 5; i++ {
		if _, err := s.Describe(ctx, "u1", "", idN(i)); err != nil {
			t.Fatalf("분당 %d번째: %v", i+2, err)
		}
	}
	before := f.calls.Load()
	if _, err := s.Describe(ctx, "u1", "", idN(99)); codeOf(err) != errs.ResourceExhausted || f.calls.Load() != before {
		t.Fatalf("분당 7번째 = %v calls %d→%d", err, before, f.calls.Load())
	}
	if _, err := s.Describe(ctx, "u2", "", idN(99)); err != nil {
		t.Fatalf("다른 사용자는 따로: %v", err)
	}
	// 1분 뒤 다시 허용
	c.t = c.t.Add(time.Minute)
	if _, err := s.Describe(ctx, "u1", "", idN(100)); err != nil {
		t.Fatalf("분 창이 지난 뒤: %v", err)
	}
}

func TestDescribe_UserDailyLimit(t *testing.T) {
	f := &fakeFetch{}
	s, c, _ := newSvc(f)
	ctx := context.Background()
	for i := 0; i < PerUserPerDay; i++ {
		if i > 0 && i%PerUserPerMinute == 0 {
			c.t = c.t.Add(time.Minute) // 분당 제한은 넘기지 않게
		}
		if _, err := s.Describe(ctx, "u1", "", idN(i)); err != nil {
			t.Fatalf("하루 %d번째: %v", i+1, err)
		}
	}
	c.t = c.t.Add(time.Minute)
	before := f.calls.Load()
	_, err := s.Describe(ctx, "u1", "", idN(1000))
	if codeOf(err) != errs.ResourceExhausted || f.calls.Load() != before {
		t.Fatalf("하루 51번째 = %v calls %d→%d", err, before, f.calls.Load())
	}
	if !strings.Contains(err.Error(), "내일") {
		t.Fatalf("하루 제한 문구: %v", err)
	}
}

func TestDescribe_IPDailyLimit(t *testing.T) {
	s, c, _ := newSvc(&fakeFetch{})
	ctx := context.Background()
	// 사용자를 바꿔 가며 한 IP 에서 100번 — 101번째 거절
	for i := 0; i < PerIPPerDay; i++ {
		if _, err := s.Describe(ctx, fmt.Sprintf("u%d", i), "1.2.3.4", idN(i)); err != nil {
			t.Fatalf("IP %d번째: %v", i+1, err)
		}
	}
	c.t = c.t.Add(time.Second)
	if _, err := s.Describe(ctx, "new", "1.2.3.4", idN(500)); codeOf(err) != errs.ResourceExhausted {
		t.Fatalf("IP 101번째 = %v", err)
	}
	if _, err := s.Describe(ctx, "new", "5.6.7.8", idN(500)); err != nil {
		t.Fatalf("다른 IP: %v", err)
	}
}

func TestNextPacificMidnight(t *testing.T) {
	for _, tc := range []struct{ now, want string }{
		{"2026-11-10T12:00:00Z", "2026-11-11T08:00:00Z"}, // PST
		{"2026-07-10T12:00:00Z", "2026-07-11T07:00:00Z"}, // PDT
		{"2026-03-08T06:00:00Z", "2026-03-08T08:00:00Z"}, // 3/7 22:00 PST → 3/8 00:00 PST
		{"2026-03-08T12:00:00Z", "2026-03-09T07:00:00Z"}, // 서머타임 시작일 → 다음 자정은 PDT
		{"2026-11-01T12:00:00Z", "2026-11-02T08:00:00Z"}, // 서머타임 끝난 날
	} {
		now, _ := time.Parse(time.RFC3339, tc.now)
		want, _ := time.Parse(time.RFC3339, tc.want)
		if got := nextPacificMidnight(now); !got.Equal(want) {
			t.Errorf("%s → %s, want %s", tc.now, got.UTC().Format(time.RFC3339), tc.want)
		}
	}
}

func TestDescribe_QuotaPausesUntilPacificMidnight(t *testing.T) {
	f := &fakeFetch{err: ErrQuotaExceeded}
	s, c, l := newSvc(f)
	ctx := context.Background()
	if _, err := s.Describe(ctx, "u1", "", vid); codeOf(err) != errs.Unavailable {
		t.Fatalf("할당량 = %v", err)
	}
	f.err = nil
	midnight := time.Date(2026, 11, 11, 8, 0, 0, 0, time.UTC) // 11/10 12:00Z 의 다음 태평양시 자정(고정값)
	c.t = midnight.Add(-time.Second)
	used := l.n["video:user:day:u2"]
	if _, err := s.Describe(ctx, "u2", "", "bbbbbbbbbbb"); codeOf(err) != errs.Unavailable || f.calls.Load() != 1 {
		t.Fatalf("자정 1초 전에도 멈춤: calls=%d err=%v", f.calls.Load(), err)
	}
	if l.n["video:user:day:u2"] != used {
		t.Fatal("멈춘 동안 사용자 횟수를 깎으면 안 된다(리뷰 G3)")
	}
	c.t = midnight.Add(time.Second)
	if _, err := s.Describe(ctx, "u2", "", "bbbbbbbbbbb"); err != nil {
		t.Fatalf("자정 뒤 다시: %v", err)
	}
}

func TestDescribe_PauseLengths(t *testing.T) {
	for _, tc := range []struct {
		err   error
		pause time.Duration
	}{{ErrKeyRejected, keyPause}, {ErrRateLimited, ratePause}} {
		f := &fakeFetch{err: tc.err}
		s, c, _ := newSvc(f)
		ctx := context.Background()
		start := c.t
		_, _ = s.Describe(ctx, "u1", "", vid)
		f.err = nil
		c.t = start.Add(tc.pause - time.Second)
		_, _ = s.Describe(ctx, "u2", "", "ccccccccccc")
		if f.calls.Load() != 1 {
			t.Fatalf("%v: 멈춤 끝 1초 전에는 안 부름", tc.err)
		}
		c.t = start.Add(tc.pause + time.Second)
		if _, err := s.Describe(ctx, "u2", "", "ccccccccccc"); err != nil || f.calls.Load() != 2 {
			t.Fatalf("%v: 멈춤 뒤: %v", tc.err, err)
		}
	}
}

func TestDescribe_ServerBudget(t *testing.T) {
	f := &fakeFetch{}
	s, c, _ := newSvc(f)
	s.limiter = nil
	ctx := context.Background()
	s.day = c.t.In(pacific).Format("2006-01-02")
	s.dayCalls = ServerPerDay - 1
	if _, err := s.Describe(ctx, "u1", "", vid); err != nil {
		t.Fatalf("마지막 1회는 통과: %v", err)
	}
	if s.dayCalls != ServerPerDay {
		t.Fatalf("바깥 호출마다 1 — %d", s.dayCalls)
	}
	if _, err := s.Describe(ctx, "u1", "", vid); err != nil {
		t.Fatalf("캐시 적중은 예산 밖: %v", err)
	}
	if _, err := s.Describe(ctx, "u1", "", "ddddddddddd"); codeOf(err) != errs.Unavailable || f.calls.Load() != 1 {
		t.Fatalf("예산 끝 = %v calls=%d", err, f.calls.Load())
	}
	c.t = nextPacificMidnight(c.t).Add(time.Minute)
	if _, err := s.Describe(ctx, "u1", "", "ddddddddddd"); err != nil {
		t.Fatalf("다음 날 = %v", err)
	}
}

func TestDescribe_LRUEvicts(t *testing.T) {
	s, _, _ := newSvc(&fakeFetch{})
	for i := 0; i <= cacheSize; i++ {
		s.store(idN(i), Info{}, false)
	}
	if _, _, ok := s.cached(idN(0)); ok {
		t.Fatal("가장 오래된 것이 밀려나야")
	}
	if _, _, ok := s.cached(idN(cacheSize)); !ok || s.lru.Len() != cacheSize {
		t.Fatalf("크기 %d", s.lru.Len())
	}
}

type gateFetch struct {
	fakeFetch
	entered chan struct{}
}

func (g *gateFetch) Fetch(ctx context.Context, id string) (Info, error) {
	g.entered <- struct{}{}
	return g.fakeFetch.Fetch(ctx, id)
}

func TestDescribe_Singleflight(t *testing.T) {
	g := &gateFetch{fakeFetch: fakeFetch{block: make(chan struct{})}, entered: make(chan struct{}, 10)}
	s, _, l := newSvc(g)
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, _ = s.Describe(context.Background(), fmt.Sprintf("u%d", i), "", vid)
		}(i)
	}
	<-g.entered // 대표 하나가 바깥 호출에 들어갔다
	// 나머지 4명이 모두 제한기를 지나 합류할 때까지(캐시 적중으로 빠지지 않게 대표는 막혀 있다)
	deadline := time.Now().Add(2 * time.Second)
	for {
		l.mu.Lock()
		n := 0
		for k, v := range l.n {
			if strings.HasPrefix(k, "video:user:min:") {
				n += v
			}
		}
		l.mu.Unlock()
		if n == 5 || time.Now().After(deadline) {
			break
		}
		time.Sleep(time.Millisecond)
	}
	time.Sleep(5 * time.Millisecond)
	close(g.block)
	wg.Wait()
	if g.calls.Load() != 1 {
		t.Fatalf("같은 id 동시 호출은 한 번: %d", g.calls.Load())
	}
}

func TestDescribe_DescriptionNeverLogged(t *testing.T) {
	var buf bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	defer slog.SetDefault(old)
	secret := "비밀설명란-SECRET-DESC"
	for _, e := range []error{nil, ErrUpstream, ErrQuotaExceeded, ErrKeyRejected} {
		f := &fakeFetch{err: e, info: Info{Description: secret, Title: secret}}
		s, _, _ := newSvc(f)
		_, _ = s.Describe(context.Background(), "u1", "", vid)
	}
	if strings.Contains(buf.String(), "SECRET") {
		t.Fatalf("로그에 설명란: %s", buf.String())
	}
}
