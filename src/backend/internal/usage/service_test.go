package usage

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

const (
	dev = "11111111-1111-4111-8111-111111111111"
	ev1 = "22222222-2222-4222-8222-222222222222"
)

var (
	since = time.Date(2026, 11, 5, 0, 0, 0, 0, KST)
	now   = time.Date(2026, 11, 20, 12, 34, 56, 0, KST)
)

type fake struct {
	users     map[string]bool
	presence  map[string]bool
	inserted  []EventRow
	kind, id  string
	platform  string
	version   string
	touches   int
	actor     int64
	global    int64
	globalN   int
	aggErr    error
	aggRan    bool
	purged    bool
	cutoffDay string
}

func newFake() *fake {
	return &fake{users: map[string]bool{"u1": true}, presence: map[string]bool{}, aggRan: true}
}

func (f *fake) UserExists(_ context.Context, id string) (bool, error) { return f.users[id], nil }
func (f *fake) PresenceExists(_ context.Context, kind, id string) (bool, error) {
	return f.presence[kind+id], nil
}
func (f *fake) InsertEvents(_ context.Context, kind, id, p, v string, rows []EventRow) (int64, error) {
	f.kind, f.id, f.platform, f.version = kind, id, p, v
	f.inserted = append(f.inserted, rows...)
	return int64(len(rows)), nil
}
func (f *fake) CountActorEvents(context.Context, string, string, time.Time) (int64, error) {
	return f.actor, nil
}
func (f *fake) CountEventsSince(context.Context, time.Time) (int64, error) {
	f.globalN++
	return f.global, nil
}
func (f *fake) TouchPresence(_ context.Context, kind, id string, _ time.Time, _ string) error {
	f.touches++
	f.presence[kind+id] = true
	return nil
}
func (f *fake) Aggregate(context.Context, time.Time) (bool, error) { return f.aggRan, f.aggErr }
func (f *fake) Purge(_ context.Context, _ time.Time, day string) error {
	f.purged, f.cutoffDay = true, day
	return nil
}

type allow struct {
	deny map[string]bool
	keys []string
}

func (a *allow) Allow(_ context.Context, key string, _ int, _ time.Duration) bool {
	a.keys = append(a.keys, key)
	return !a.deny[key]
}

func svc(f *fake, a *allow, at time.Time) *Service {
	return NewService(f, a, func() time.Time { return at }, Config{Enabled: true, Since: since})
}

func one(name string, age int64) []Incoming {
	return []Incoming{{ClientEventID: ev1, Event: name, AgeMs: age}}
}

func TestFilter_허용목록_형식_나이_시행일(t *testing.T) {
	in := []Incoming{
		{ClientEventID: ev1, Event: "workout_finish", AgeMs: 90 * 60 * 1000}, // 1시간 반 전
		{ClientEventID: ev1, Event: "모르는_이름", AgeMs: 0},
		{ClientEventID: ev1, Event: "모르는_이름", AgeMs: 0},
		{ClientEventID: "nope", Event: "app_open", AgeMs: 0},
		{ClientEventID: ev1, Event: "app_open", AgeMs: MaxAge.Milliseconds() + 1},
		{ClientEventID: ev1, Event: "app_open", AgeMs: -5000}, // 시계가 틀어져도 지금으로 본다
	}
	rows, unknown := Filter(in, now, since)
	if len(rows) != 2 || rows[0].Event != "workout_finish" || rows[1].Event != "app_open" {
		t.Fatalf("%+v", rows)
	}
	want := time.Date(2026, 11, 20, 11, 0, 0, 0, KST)
	if !rows[0].At.Equal(want) {
		t.Fatalf("시간 단위로 내려야 한다: %v", rows[0].At)
	}
	if len(unknown) != 1 {
		t.Fatalf("모르는 이름 한 번: %v", unknown)
	}
	// 나이로 계산한 시각이 시행일 전이면 버린다.
	near := since.Add(time.Hour)
	rows, _ = Filter(one("app_open", (2*time.Hour).Milliseconds()), near, since)
	if len(rows) != 0 {
		t.Fatalf("시행 전 이벤트: %+v", rows)
	}
}

func TestNormalize(t *testing.T) {
	if NormalizePlatform("web") != "web" || NormalizePlatform("mac") != "unknown" {
		t.Fatal("플랫폼")
	}
	if NormalizeVersion("0.68.1") != "0.68.1" || NormalizeVersion("<script>") != "" || NormalizeVersion("1.0") != "" {
		t.Fatal("버전")
	}
}

func TestRateKey_IPv6는_64로_묶는다(t *testing.T) {
	a := RateKey("2001:db8:1:2:aaaa::1")
	b := RateKey("2001:db8:1:2:bbbb::9")
	c := RateKey("2001:db8:1:3::1")
	if a != b || a == c {
		t.Fatalf("%s %s %s", a, b, c)
	}
	if RateKey("1.2.3.4") != "1.2.3.4" || RateKey("쓰레기") != "unknown" {
		t.Fatal("IPv4·이상값")
	}
}

func TestReport_주체(t *testing.T) {
	ctx := context.Background()
	// 무효 토큰은 비로그인으로 떨어지지 않는다.
	f := newFake()
	_, err := svc(f, &allow{}, now).Report(ctx, Input{HasBearer: true, DeviceID: dev, Events: one("app_open", 0)})
	var de *errs.DomainError
	if !errors.As(err, &de) || de.Code != errs.Unauthorized || len(f.inserted) != 0 {
		t.Fatalf("무효 토큰: %v %d", err, len(f.inserted))
	}
	// 없는 계정.
	_, err = svc(f, &allow{}, now).Report(ctx, Input{ViewerID: "gone", HasBearer: true, Events: one("app_open", 0)})
	if !errors.As(err, &de) || de.Code != errs.Unauthorized {
		t.Fatalf("없는 계정: %v", err)
	}
	// 로그인이면 device_id 가 와도 계정으로 저장한다.
	f = newFake()
	r, err := svc(f, &allow{}, now).Report(ctx, Input{ViewerID: "u1", HasBearer: true, DeviceID: dev, Platform: "ios", Version: "1.2.3", Events: one("app_open", 0)})
	if err != nil || r.Accepted != 1 || f.kind != "user" || f.id != "u1" || f.platform != "ios" || f.version != "1.2.3" {
		t.Fatalf("로그인: %+v %v %+v", r, err, f)
	}
	// 비로그인은 UUID 기기 ID 만.
	f = newFake()
	_, err = svc(f, &allow{}, now).Report(ctx, Input{DeviceID: "abc", Events: one("app_open", 0)})
	if !errors.As(err, &de) || de.Code != errs.Validation {
		t.Fatalf("기기 ID: %v", err)
	}
	r, err = svc(f, &allow{}, now).Report(ctx, Input{DeviceID: dev, Events: one("app_open", 0)})
	if err != nil || r.Accepted != 1 || f.kind != "guest" || f.id != dev {
		t.Fatalf("비로그인: %+v %v", r, err)
	}
}

func TestReport_꺼짐과_시행_전(t *testing.T) {
	ctx := context.Background()
	f := newFake()
	s := NewService(f, &allow{}, func() time.Time { return now }, Config{Enabled: false, Since: since})
	r, err := s.Report(ctx, Input{DeviceID: dev, Presence: true, Events: one("app_open", 0)})
	if err != nil || r.Enabled || len(f.inserted) != 0 || f.touches != 0 {
		t.Fatalf("차단 스위치: %+v %v", r, err)
	}
	f = newFake()
	r, err = svc(f, &allow{}, since.Add(-time.Hour)).Report(ctx, Input{DeviceID: dev, Presence: true, Events: one("app_open", 0)})
	if err != nil || !r.Enabled || len(f.inserted) != 0 || f.touches != 0 {
		t.Fatalf("시행 전: %+v %v", r, err)
	}
}

func TestReport_상한(t *testing.T) {
	ctx := context.Background()
	// IP 횟수 제한은 429 라 기기가 큐를 지키고 다음에 다시 보낸다.
	f := newFake()
	a := &allow{deny: map[string]bool{"usage:ip:1.2.3.4": true}}
	_, err := svc(f, a, now).Report(ctx, Input{IP: "1.2.3.4", DeviceID: dev, Events: one("app_open", 0)})
	var de *errs.DomainError
	if !errors.As(err, &de) || de.Code != errs.ResourceExhausted {
		t.Fatalf("IP 제한: %v", err)
	}
	// 새 기기 상한 — 새 기기는 조용히 버리고, 이미 있는 기기는 영향 없다.
	f = newFake()
	a = &allow{deny: map[string]bool{"usage:newdev:1.2.3.4": true}}
	r, err := svc(f, a, now).Report(ctx, Input{IP: "1.2.3.4", DeviceID: dev, Presence: true, Events: one("app_open", 0)})
	if err != nil || r.Accepted != 0 || f.touches != 0 {
		t.Fatalf("새 기기: %+v %v", r, err)
	}
	f.presence["guest"+dev] = true
	r, _ = svc(f, a, now).Report(ctx, Input{IP: "1.2.3.4", DeviceID: dev, Events: one("app_open", 0)})
	if r.Accepted != 1 {
		t.Fatalf("이미 있는 기기: %+v", r)
	}
	// 주체당 하루 상한 — 남은 칸만큼만.
	f = newFake()
	f.actor = RowsPerActorDaily - 1
	r, _ = svc(f, &allow{}, now).Report(ctx, Input{DeviceID: dev, Events: []Incoming{
		{ClientEventID: ev1, Event: "app_open"}, {ClientEventID: dev, Event: "app_open"},
	}})
	if r.Accepted != 1 {
		t.Fatalf("주체 상한: %+v", r)
	}
	f.actor = RowsPerActorDaily
	r, _ = svc(f, &allow{}, now).Report(ctx, Input{DeviceID: dev, Events: one("app_open", 0)})
	if r.Accepted != 0 {
		t.Fatalf("주체 상한 2: %+v", r)
	}
	// 전체 하루 상한 — 세는 쿼리는 1분에 한 번.
	f = newFake()
	f.global = RowsGlobalDaily
	s := svc(f, &allow{}, now)
	for range 3 {
		r, _ = s.Report(ctx, Input{DeviceID: dev, Events: one("app_open", 0)})
		if r.Accepted != 0 {
			t.Fatalf("전체 상한: %+v", r)
		}
	}
	if f.globalN != 1 {
		t.Fatalf("세는 쿼리 %d번", f.globalN)
	}
}

func TestRunJob_집계가_실패하면_지우지_않는다(t *testing.T) {
	ctx := context.Background()
	f := newFake()
	f.aggErr = errors.New("db")
	if err := svc(f, &allow{}, now).RunJob(ctx); err == nil || f.purged {
		t.Fatalf("실패 %v, 지움 %v", err, f.purged)
	}
	f = newFake()
	f.aggRan = false // 다른 인스턴스가 도는 중
	if err := svc(f, &allow{}, now).RunJob(ctx); err != nil || f.purged {
		t.Fatalf("잠금 %v, 지움 %v", err, f.purged)
	}
	f = newFake()
	if err := svc(f, &allow{}, now).RunJob(ctx); err != nil || !f.purged || f.cutoffDay != "2026-08-22" {
		t.Fatalf("정리 %v %v %s", err, f.purged, f.cutoffDay)
	}
}

func TestAggregateDays(t *testing.T) {
	days := AggregateDays(now, "", "")
	if len(days) != 7 || days[0] != "2026-11-14" || days[6] != "2026-11-20" {
		t.Fatalf("기본 7일: %v", days)
	}
	// 서버가 꺼져 있던 날을 채운다.
	days = AggregateDays(now, "2026-11-01", "")
	if days[0] != "2026-11-01" || days[len(days)-1] != "2026-11-20" {
		t.Fatalf("빠진 날: %v", days)
	}
	// 한 번도 안 돌았으면 첫 이벤트부터.
	days = AggregateDays(now, "", "2026-11-05")
	if days[0] != "2026-11-05" {
		t.Fatalf("첫 이벤트: %v", days)
	}
	// 원본 보관 범위를 넘지 않는다.
	days = AggregateDays(now, "2020-01-01", "")
	if len(days) != RetainDays+1 {
		t.Fatalf("상한: %d", len(days))
	}
	// 한국 날짜 경계: UTC 15시 이후는 다음 날이다.
	if d := AggregateDays(time.Date(2026, 11, 19, 15, 30, 0, 0, time.UTC), "", ""); d[6] != "2026-11-20" {
		t.Fatalf("경계: %v", d)
	}
}
