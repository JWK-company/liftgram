// @plm SRS-088  운영 상태 규칙 테스트 — DB 없이
// @plm SRS-087
//
// 여기서 보는 것: 기기 보고를 어떻게 자르고 시각을 다시 계산하는지 · 멈춤 판정이 기기와 같은 식인지 ·
// 경보 이유의 경계(36시간·40일·실패·low_disk·기록 없음) · admin 판정이 DB 역할을 다시 읽는지.
// 멈춤 경계 표는 core/src/domain/__tests__/syncStall.test.ts 와 **같은 줄**을 복제한다(qa spec H-1).
package ops

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

var t0 = time.Date(2026, 10, 28, 12, 0, 0, 0, time.UTC)

type fakeRepo struct {
	roles    map[string]string
	health   map[string]map[string]Health // user → device → row
	users    []UserRow
	backups  []BackupRun // 시간순
	upserts  int
	lastSync map[string]time.Time // 사용자 → 서버 마지막 동기 쓰기
	syncAsks int                  // LastSyncByUser 호출 수
}

func newFake() *fakeRepo {
	return &fakeRepo{roles: map[string]string{}, health: map[string]map[string]Health{}}
}

func (f *fakeRepo) UpsertHealth(_ context.Context, h Health, keep int) error {
	f.upserts++
	m := f.health[h.UserID]
	if m == nil {
		m = map[string]Health{}
		f.health[h.UserID] = m
	}
	if old, ok := m[h.DeviceID]; ok {
		h.FirstReportedAt = old.FirstReportedAt // upsert 는 첫 보고 시각을 바꾸지 않는다
	}
	m[h.DeviceID] = h
	// 최신 keep 줄만
	for len(m) > keep {
		var oldest string
		for id, r := range m {
			if oldest == "" || r.ReportedAt.Before(m[oldest].ReportedAt) {
				oldest = id
			}
		}
		delete(m, oldest)
	}
	return nil
}

func (f *fakeRepo) UserRole(_ context.Context, id string) (string, bool, error) {
	r, ok := f.roles[id]
	return r, ok, nil
}

func (f *fakeRepo) ListUsers(_ context.Context, _ int) ([]UserRow, error) { return f.users, nil }

func (f *fakeRepo) ListHealthSince(_ context.Context, since time.Time) ([]Health, error) {
	var out []Health
	for _, m := range f.health {
		for _, h := range m {
			if !h.ReportedAt.Before(since) {
				out = append(out, h)
			}
		}
	}
	return out, nil
}

func (f *fakeRepo) LastBackupRun(_ context.Context, kind string, okOnly bool) (BackupRun, bool, error) {
	for i := len(f.backups) - 1; i >= 0; i-- {
		b := f.backups[i]
		if b.Kind == kind && (!okOnly || b.OK) {
			return b, true, nil
		}
	}
	return BackupRun{}, false, nil
}

func (f *fakeRepo) LastSyncByUser(_ context.Context, ids []string) (map[string]time.Time, error) {
	f.syncAsks++
	out := map[string]time.Time{}
	for _, id := range ids {
		if t, ok := f.lastSync[id]; ok {
			out[id] = t
		}
	}
	return out, nil
}

func i64(v int64) *int64 { return &v }
func i32(v int32) *int32 { return &v }
func at(d time.Duration) *time.Time {
	v := t0.Add(-d)
	return &v
}

func codeOf(err error) errs.Code {
	var de *errs.DomainError
	if errors.As(err, &de) {
		return de.Code
	}
	return ""
}

// 백업이 멀쩡한 상태(경보 없음) — 각 테스트가 하나씩 망가뜨린다.
func healthyBackups() []BackupRun {
	return []BackupRun{
		{Kind: "restore_test", OK: true, CreatedAt: t0.Add(-10 * 24 * time.Hour)},
		{Kind: "daily", OK: true, CreatedAt: t0.Add(-8 * time.Hour)},
	}
}

func svcAt(f *fakeRepo, now *time.Time) *Service {
	return NewService(f, func() time.Time { return *now })
}

// ── 보고: 자르기 · 시각 계산 ─────────────────────────────────────────────────

func TestNormalize_자르기와_범위(t *testing.T) {
	h, err := Normalize("u1", Report{
		DeviceID:            "  abcDEF_12-xyz  ",
		AppVersion:          strings.Repeat("9", 50),
		ConsecutiveFailures: 99_999,
		Pending:             i64(-5),
		LastError:           "첫 줄\n둘째\x00줄\t" + strings.Repeat("가", 300),
	}, t0)
	if err != nil {
		t.Fatal(err)
	}
	if h.DeviceID != "abcDEF_12-xyz" {
		t.Errorf("device_id 공백 제거: %q", h.DeviceID)
	}
	if len([]rune(h.AppVersion)) != 32 {
		t.Errorf("버전 32자: %d", len([]rune(h.AppVersion)))
	}
	if h.ConsecutiveFailures != 10_000 {
		t.Errorf("연속 실패 상한 10000: %d", h.ConsecutiveFailures)
	}
	if h.Pending == nil || *h.Pending != 0 {
		t.Errorf("음수 미동기는 0: %v", h.Pending)
	}
	if n := len([]rune(h.LastError)); n != 200 {
		t.Errorf("오류 200자: %d", n)
	}
	if strings.ContainsAny(h.LastError, "\n\t\x00") {
		t.Errorf("제어문자 제거: %q", h.LastError[:20])
	}
	if !strings.HasPrefix(h.LastError, "첫 줄둘째줄") {
		t.Errorf("제어문자만 지우고 글자는 남긴다: %q", h.LastError[:30])
	}

	big, _ := Normalize("u1", Report{DeviceID: "d", Pending: i64(1 << 40)}, t0)
	if *big.Pending != 10_000_000 {
		t.Errorf("미동기 상한 10^7: %d", *big.Pending)
	}
	none, _ := Normalize("u1", Report{DeviceID: "d"}, t0)
	if none.Pending != nil {
		t.Error("미동기를 모르면 nil 로 남는다")
	}
}

func TestNormalize_device_id_문자검사(t *testing.T) {
	for _, bad := range []string{"", "   ", "a b", "한글", "a/b", "x'; drop", strings.Repeat("a", 65)} {
		if _, err := Normalize("u1", Report{DeviceID: bad}, t0); codeOf(err) != errs.Validation {
			t.Errorf("%q 는 거부: %v", bad, err)
		}
	}
	if _, err := Normalize("u1", Report{DeviceID: strings.Repeat("a", 64)}, t0); err != nil {
		t.Errorf("64자는 받는다: %v", err)
	}
}

func TestNormalize_나이로_서버시각_계산(t *testing.T) {
	h, _ := Normalize("u1", Report{
		DeviceID:     "d",
		SuccessAgeMs: i64((25 * time.Hour).Milliseconds()),
		AttemptAgeMs: i64(-60_000), // 기기 시계가 미래 — 나이 음수는 0
	}, t0)
	if h.LastSuccessAt == nil || !h.LastSuccessAt.Equal(t0.Add(-25*time.Hour)) {
		t.Errorf("성공 = now − 25h: %v", h.LastSuccessAt)
	}
	if h.LastAttemptAt == nil || !h.LastAttemptAt.Equal(t0) {
		t.Errorf("음수 나이 → now: %v", h.LastAttemptAt)
	}
	n, _ := Normalize("u1", Report{DeviceID: "d"}, t0)
	if n.LastSuccessAt != nil || n.LastAttemptAt != nil {
		t.Error("나이가 없으면 시각도 없다")
	}
	huge, _ := Normalize("u1", Report{DeviceID: "d", SuccessAgeMs: i64(1 << 62)}, t0)
	if huge.LastSuccessAt == nil || huge.LastSuccessAt.After(t0) || t0.Sub(*huge.LastSuccessAt) > maxAge {
		t.Errorf("터무니없는 나이는 상한: %v", huge.LastSuccessAt)
	}
}

func TestReport_로그인필수_역할무관(t *testing.T) {
	now := t0
	f := newFake()
	s := svcAt(f, &now)
	if _, err := s.ReportClientHealth(context.Background(), "", Report{DeviceID: "d"}); codeOf(err) != errs.Unauthorized {
		t.Fatalf("비로그인 401: %v", err)
	}
	// 역할 없는 일반 사용자도 보낸다.
	ok, err := s.ReportClientHealth(context.Background(), "u1", Report{DeviceID: "d", Pending: i64(3)})
	if err != nil || !ok {
		t.Fatalf("일반 사용자 보고: %v %v", ok, err)
	}
	if f.health["u1"]["d"].Pending == nil {
		t.Fatal("저장됐다")
	}
}

func TestReport_첫보고시각은_upsert에서_안바뀐다(t *testing.T) {
	now := t0
	f := newFake()
	s := svcAt(f, &now)
	_, _ = s.ReportClientHealth(context.Background(), "u1", Report{DeviceID: "d"})
	now = t0.Add(3 * time.Hour)
	_, _ = s.ReportClientHealth(context.Background(), "u1", Report{DeviceID: "d", ConsecutiveFailures: 2})
	row := f.health["u1"]["d"]
	if !row.FirstReportedAt.Equal(t0) || !row.ReportedAt.Equal(now) || row.ConsecutiveFailures != 2 {
		t.Fatalf("첫 보고 유지·나머지 갱신: %+v", row)
	}
}

func TestReport_사용자당_8줄(t *testing.T) {
	now := t0
	f := newFake()
	s := svcAt(f, &now)
	for i := range 12 {
		now = t0.Add(time.Duration(i) * time.Minute) // 분당 상한에 안 걸리게 1분씩
		if _, err := s.ReportClientHealth(context.Background(), "u1", Report{DeviceID: "dev" + string(rune('a'+i))}); err != nil {
			t.Fatal(err)
		}
	}
	if n := len(f.health["u1"]); n != KeepDevicesPerUser {
		t.Fatalf("최신 8줄만: %d", n)
	}
	if _, ok := f.health["u1"]["deva"]; ok {
		t.Fatal("가장 오래된 줄이 지워진다")
	}
	if _, ok := f.health["u1"]["devl"]; !ok {
		t.Fatal("가장 최근 줄은 남는다")
	}
}

func TestReport_분당_6회_넘으면_조용히_무시(t *testing.T) {
	now := t0
	f := newFake()
	s := svcAt(f, &now)
	accepted := 0
	for i := range 10 {
		now = t0.Add(time.Duration(i) * time.Second)
		ok, err := s.ReportClientHealth(context.Background(), "u1", Report{DeviceID: "d"})
		if err != nil {
			t.Fatalf("상한은 오류가 아니다: %v", err)
		}
		if ok {
			accepted++
		}
	}
	if accepted != ReportsPerMinute || f.upserts != ReportsPerMinute {
		t.Fatalf("1분에 6회: accepted=%d upserts=%d", accepted, f.upserts)
	}
	// 다른 사용자는 따로 센다.
	if ok, _ := s.ReportClientHealth(context.Background(), "u2", Report{DeviceID: "d"}); !ok {
		t.Fatal("다른 사용자는 영향 없음")
	}
	// 1분이 지나면 다시 받는다.
	now = t0.Add(61 * time.Second)
	if ok, _ := s.ReportClientHealth(context.Background(), "u1", Report{DeviceID: "d"}); !ok {
		t.Fatal("창이 지나면 다시 받는다")
	}
}

// ── 멈춤 판정(기기 isBackupStalled 와 같은 경계 표) ─────────────────────────

func TestIsStalled_경계표(t *testing.T) {
	cases := []struct {
		name string
		h    Health
		want bool
	}{
		{"미동기 0 이면 아니다", Health{Pending: i32(0), Blocked: true, ConsecutiveFailures: 9}, false},
		{"미동기 모름이면 아니다", Health{Pending: nil, Blocked: true}, false},
		{"blocked", Health{Pending: i32(1), Blocked: true}, true},
		{"연속 실패 3", Health{Pending: i32(1), ConsecutiveFailures: 3, LastSuccessAt: at(time.Minute)}, true},
		{"연속 실패 2·최근 성공", Health{Pending: i32(1), ConsecutiveFailures: 2, LastSuccessAt: at(time.Hour), LastAttemptAt: at(0)}, false},
		{"23h59m 전 성공·실패 1", Health{Pending: i32(1), ConsecutiveFailures: 1, LastSuccessAt: at(23*time.Hour + 59*time.Minute), LastAttemptAt: at(0)}, false},
		{"24h1m 전 성공·실패 1", Health{Pending: i32(1), ConsecutiveFailures: 1, LastSuccessAt: at(24*time.Hour + time.Minute), LastAttemptAt: at(0)}, true},
		{"24h1m 전 성공·실패 0(방금 시도 중)", Health{Pending: i32(1), ConsecutiveFailures: 0, LastSuccessAt: at(24*time.Hour + time.Minute), LastAttemptAt: at(0)}, false},
		{"성공 없음·시도 없음은 제외", Health{Pending: i32(5), ConsecutiveFailures: 1}, false},
		{"성공 없음·시도 있음·실패 1", Health{Pending: i32(5), ConsecutiveFailures: 1, LastAttemptAt: at(0)}, true},
	}
	for _, c := range cases {
		if got := IsStalled(c.h, t0); got != c.want {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}

// ── 서버 거름망(qa code H-1) ────────────────────────────────────────────────
// 위 표(IsStalled)는 기기와 같은 식이다. 서버는 그 앞에 거름망을 둔다 — 기기는 앱이 열려 있을 때만 판정하지만
// 서버는 마지막 보고를 그대로 둔 채 서버의 지금으로 판정하기 때문이다. 그래서 이 표는 기기 쪽(syncStall.test.ts)에 없다.

func TestClassify_경계표(t *testing.T) {
	h := func(user, dev string, reportedAgo time.Duration, failures int32, successAgo time.Duration) Health {
		rep := t0.Add(-reportedAgo)
		return Health{
			UserID: user, DeviceID: dev, Pending: i32(2), ConsecutiveFailures: failures,
			LastSuccessAt: at(successAgo), LastAttemptAt: &rep, FirstReportedAt: rep, ReportedAt: rep,
		}
	}
	healthy := func(user, dev string, reportedAgo time.Duration) Health {
		rep := t0.Add(-reportedAgo)
		return Health{UserID: user, DeviceID: dev, Pending: i32(0), LastSuccessAt: &rep, LastAttemptAt: &rep, FirstReportedAt: rep, ReportedAt: rep}
	}
	day := 24 * time.Hour
	cases := []struct {
		name         string
		health       []Health
		lastSync     map[string]time.Time
		stalled      int
		disconnected int
	}{
		{"보고 4일 전·실패 1·성공 (보고 시점) 25시간 전 → 경보 아님(연락 끊김)", []Health{h("u", "d", 4*day, 1, 4*day+25*time.Hour)}, nil, 0, 1},
		{"보고 4일 전·실패 3 → 경보 아님(연락 끊김)", []Health{h("u", "d", 4*day, 3, 5*day)}, nil, 0, 1},
		{"보고 71h 전·실패 3 → 멈춤", []Health{h("u", "d", 71*time.Hour, 3, 80*time.Hour)}, nil, 1, 0},
		{"보고 72h 전(경계 포함)·실패 3 → 멈춤", []Health{h("u", "d", 72*time.Hour, 3, 80*time.Hour)}, nil, 1, 0},
		{"보고 72h1m 전·실패 3 → 연락 끊김", []Health{h("u", "d", 72*time.Hour+time.Minute, 3, 80*time.Hour)}, nil, 0, 1},
		{"방금 보고·실패 3 → 멈춤", []Health{h("u", "d", 0, 3, time.Hour)}, nil, 1, 0},
		{"같은 사용자의 더 새 건강한 보고(기기 교체) → 뺌", []Health{healthy("u", "new", time.Hour), h("u", "old", 2*time.Hour, 3, 3*day)}, nil, 0, 0},
		{"더 새 건강한 보고는 오래된 끊김 줄도 뺀다", []Health{healthy("u", "new", time.Hour), h("u", "old", 10*day, 3, 11*day)}, nil, 0, 0},
		{"건강한 보고가 더 오래됐으면 멈춤 유지", []Health{h("u", "d2", time.Hour, 3, 2*day), healthy("u", "d1", 2*time.Hour)}, nil, 1, 0},
		{"더 새 보고도 멈춤이면 둘 다 멈춤", []Health{h("u", "a", time.Hour, 3, 2*day), h("u", "b", 2*time.Hour, 3, 2*day)}, nil, 2, 0},
		{"다른 사용자의 건강한 보고는 상관없다", []Health{healthy("v", "x", 0), h("u", "d", time.Hour, 3, 2*day)}, nil, 1, 0},
		{"서버 동기 쓰기가 보고보다 뒤 → 뺌", []Health{h("u", "d", 2*time.Hour, 3, 2*day)}, map[string]time.Time{"u": t0.Add(-time.Hour)}, 0, 0},
		{"서버 동기 쓰기가 보고보다 앞 → 멈춤", []Health{h("u", "d", 2*time.Hour, 3, 2*day)}, map[string]time.Time{"u": t0.Add(-3 * time.Hour)}, 1, 0},
		{"서버 동기 쓰기가 보고와 같은 시각 → 멈춤(뒤가 아님)", []Health{h("u", "d", 2*time.Hour, 3, 2*day)}, map[string]time.Time{"u": t0.Add(-2 * time.Hour)}, 1, 0},
		{"식에 안 걸리면 오래돼도 어느 목록에도 없다", []Health{healthy("u", "d", 10*day)}, nil, 0, 0},
	}
	for _, c := range cases {
		st, dc := Classify(c.health, c.lastSync, t0)
		if len(st) != c.stalled || len(dc) != c.disconnected {
			t.Errorf("%s: 멈춤 %d·끊김 %d (want %d·%d)", c.name, len(st), len(dc), c.stalled, c.disconnected)
		}
	}
}

func TestGetOpsStatus_오래된보고는_경보아님(t *testing.T) {
	f := newFake()
	f.roles = map[string]string{"admin1": "admin"}
	f.backups = healthyBackups()
	f.users = []UserRow{{ID: "gone", Email: "gone@example.com"}, {ID: "moved", Email: "moved@example.com"}}
	old := t0.Add(-4 * 24 * time.Hour)
	recent := t0.Add(-time.Hour)
	f.health = map[string]map[string]Health{
		// 4일 전 실패 1 보고 뒤 앱을 안 연 사용자 — 연락 끊김
		"gone": {"g1": {UserID: "gone", DeviceID: "g1", Pending: i32(3), ConsecutiveFailures: 1, LastSuccessAt: at(5 * 24 * time.Hour), LastAttemptAt: &old, FirstReportedAt: old, ReportedAt: old}},
		// 최근 실패 3 보고 — 그런데 그 뒤에 서버 동기 쓰기가 있었다(다른 기기로 옮김)
		"moved": {"m1": {UserID: "moved", DeviceID: "m1", Pending: i32(3), ConsecutiveFailures: 3, LastSuccessAt: at(2 * 24 * time.Hour), LastAttemptAt: &recent, FirstReportedAt: recent, ReportedAt: recent}},
	}
	f.lastSync = map[string]time.Time{"moved": t0.Add(-time.Minute)}
	s := svcAt(f, &t0)
	st, err := s.GetOpsStatus(context.Background(), "admin1", "admin")
	if err != nil {
		t.Fatal(err)
	}
	if st.Alert || len(st.Stalled) != 0 {
		t.Fatalf("경보 아님: alert=%v reasons=%v stalled=%+v", st.Alert, st.Reasons, st.Stalled)
	}
	if len(st.Disconnected) != 1 || st.Disconnected[0].User.ID != "gone" || st.Disconnected[0].User.Email == "" {
		t.Fatalf("연락 끊김은 gone 하나(사용자 정보 포함): %+v", st.Disconnected)
	}
	alert, n, err := s.GetOpsAlert(context.Background(), "admin1", "admin")
	if err != nil || alert || n != 0 {
		t.Fatalf("GetOpsAlert 도 경보 아님: %v %d %v", alert, n, err)
	}
	// 식에 걸린 줄이 없으면 동기 시각을 묻지 않는다
	f.health = map[string]map[string]Health{}
	f.syncAsks = 0
	if _, _, err := s.GetOpsAlert(context.Background(), "admin1", "admin"); err != nil || f.syncAsks != 0 {
		t.Fatalf("멈춤 후보 없으면 LastSyncByUser 안 부름: %d %v", f.syncAsks, err)
	}
}

func TestStalledDays(t *testing.T) {
	if d := StalledDays(Health{LastSuccessAt: at(3*24*time.Hour + time.Hour), FirstReportedAt: t0.Add(-30 * 24 * time.Hour)}, t0); d != 3 {
		t.Errorf("성공 기준 3일: %d", d)
	}
	if d := StalledDays(Health{FirstReportedAt: t0.Add(-5*24*time.Hour - time.Minute)}, t0); d != 5 {
		t.Errorf("성공 없으면 첫 보고 기준 5일: %d", d)
	}
	if d := StalledDays(Health{FirstReportedAt: t0.Add(time.Hour)}, t0); d != 0 {
		t.Errorf("음수는 0: %d", d)
	}
}

// ── 경보 이유 ────────────────────────────────────────────────────────────────

func reasonsFor(backups []BackupRun, stalled int) []string {
	f := newFake()
	f.backups = backups
	s := svcAt(f, &t0)
	b, _ := s.backupFacts(context.Background())
	return AlertReasons(stalled, b, t0)
}

func TestAlertReasons_경계(t *testing.T) {
	if r := reasonsFor(healthyBackups(), 0); len(r) != 0 {
		t.Fatalf("멀쩡하면 경보 없음: %v", r)
	}
	if r := reasonsFor(healthyBackups(), 2); strings.Join(r, ",") != "stalled" {
		t.Fatalf("멈춤: %v", r)
	}
	if r := reasonsFor(nil, 0); strings.Join(r, ",") != "daily_none,restore_none" {
		t.Fatalf("기록 없음(qa spec L-3): %v", r)
	}

	daily := func(ok bool, ago time.Duration, detail string) BackupRun {
		return BackupRun{Kind: "daily", OK: ok, Detail: detail, CreatedAt: t0.Add(-ago)}
	}
	restore := BackupRun{Kind: "restore_test", OK: true, CreatedAt: t0.Add(-time.Hour)}

	if r := reasonsFor([]BackupRun{restore, daily(true, 35*time.Hour+59*time.Minute, "")}, 0); len(r) != 0 {
		t.Errorf("35h59m 은 괜찮다: %v", r)
	}
	if r := reasonsFor([]BackupRun{restore, daily(true, 36*time.Hour+time.Minute, "")}, 0); strings.Join(r, ",") != "daily_stale" {
		t.Errorf("36h 넘음: %v", r)
	}
	// 마지막 daily 가 실패면 그 앞의 성공을 기준으로 본다.
	if r := reasonsFor([]BackupRun{restore, daily(true, 40*time.Hour, ""), daily(false, time.Hour, "stage=dump")}, 0); strings.Join(r, ",") != "daily_stale" {
		t.Errorf("실패 뒤 마지막 성공 40h: %v", r)
	}
	if r := reasonsFor([]BackupRun{restore, daily(false, time.Hour, "")}, 0); strings.Join(r, ",") != "daily_stale" {
		t.Errorf("성공한 daily 가 하나도 없음: %v", r)
	}
	if r := reasonsFor([]BackupRun{restore, daily(true, time.Hour, "low_disk free=12G")}, 0); strings.Join(r, ",") != "low_disk" {
		t.Errorf("low_disk: %v", r)
	}

	d := daily(true, time.Hour, "")
	old := func(days int) BackupRun {
		return BackupRun{Kind: "restore_test", OK: true, CreatedAt: t0.Add(-time.Duration(days)*24*time.Hour - time.Minute)}
	}
	if r := reasonsFor([]BackupRun{old(39), d}, 0); len(r) != 0 {
		t.Errorf("39일은 괜찮다: %v", r)
	}
	if r := reasonsFor([]BackupRun{old(40), d}, 0); strings.Join(r, ",") != "restore_old" {
		t.Errorf("40일 넘음: %v", r)
	}
	failed := BackupRun{Kind: "restore_test", OK: false, Detail: "low_disk_db", CreatedAt: t0.Add(-time.Hour)}
	if r := reasonsFor([]BackupRun{failed, d}, 0); strings.Join(r, ",") != "restore_failed" {
		t.Errorf("복원 시험 실패: %v", r)
	}
}

// ── 권한 ─────────────────────────────────────────────────────────────────────

func TestGetOpsStatus_권한(t *testing.T) {
	f := newFake()
	f.roles = map[string]string{"admin1": "admin", "co": "coworker", "u": "user", "demoted": "user"}
	f.backups = healthyBackups()
	s := svcAt(f, &t0)
	ctx := context.Background()

	if _, err := s.GetOpsStatus(ctx, "", ""); codeOf(err) != errs.Unauthorized {
		t.Errorf("비로그인 401: %v", err)
	}
	for _, c := range []struct{ id, role string }{{"u", "user"}, {"co", "coworker"}, {"co", "moderator"}} {
		if _, err := s.GetOpsStatus(ctx, c.id, c.role); codeOf(err) != errs.Forbidden {
			t.Errorf("%s/%s 거부: %v", c.id, c.role, err)
		}
		if _, _, err := s.GetOpsAlert(ctx, c.id, c.role); codeOf(err) != errs.Forbidden {
			t.Errorf("alert %s/%s 거부: %v", c.id, c.role, err)
		}
	}
	// claim 은 admin 인데 DB 는 user(회수됨) → 거부 (qa spec M-8)
	if _, err := s.GetOpsStatus(ctx, "demoted", "admin"); codeOf(err) != errs.Forbidden {
		t.Errorf("claim admin · DB user → 거부: %v", err)
	}
	if _, _, err := s.GetOpsAlert(ctx, "demoted", "admin"); codeOf(err) != errs.Forbidden {
		t.Errorf("alert: claim admin · DB user → 거부: %v", err)
	}
	// DB 에 없는 사용자
	if _, err := s.GetOpsStatus(ctx, "ghost", "admin"); codeOf(err) != errs.Forbidden {
		t.Errorf("없는 사용자 거부: %v", err)
	}
	if _, err := s.GetOpsStatus(ctx, "admin1", "admin"); err != nil {
		t.Errorf("admin 허용: %v", err)
	}
}

func TestGetOpsStatus_멈춘사용자와_목록(t *testing.T) {
	f := newFake()
	f.roles = map[string]string{"admin1": "admin"}
	f.backups = healthyBackups()
	f.users = []UserRow{
		{ID: "u1", Email: "stuckuser@example.com", DisplayName: "멈춘이"},
		{ID: "u2", Email: "ok@example.com"},
	}
	f.health = map[string]map[string]Health{
		"u1": {"d1": {UserID: "u1", DeviceID: "d1", Pending: i32(4), ConsecutiveFailures: 3, LastSuccessAt: at(50 * time.Hour), FirstReportedAt: t0.Add(-10 * 24 * time.Hour), ReportedAt: t0}},
		"u2": {"d2": {UserID: "u2", DeviceID: "d2", Pending: i32(0), LastSuccessAt: at(time.Minute), ReportedAt: t0}},
		// 90일 넘게 보고 없는 줄은 조회에서 빠진다
		"u3": {"d3": {UserID: "u3", DeviceID: "d3", Pending: i32(9), Blocked: true, ReportedAt: t0.Add(-91 * 24 * time.Hour)}},
	}
	s := svcAt(f, &t0)
	st, err := s.GetOpsStatus(context.Background(), "admin1", "admin")
	if err != nil {
		t.Fatal(err)
	}
	if len(st.Stalled) != 1 || st.Stalled[0].User.ID != "u1" || st.Stalled[0].Days != 2 {
		t.Fatalf("멈춘 사용자 u1·2일째: %+v", st.Stalled)
	}
	if !st.Alert || strings.Join(st.Reasons, ",") != "stalled" {
		t.Fatalf("경보: %v %v", st.Alert, st.Reasons)
	}
	if len(st.Users) != 2 || len(st.Users[0].Devices) != 1 {
		t.Fatalf("사용자 목록·기기: %+v", st.Users)
	}
	alert, n, err := s.GetOpsAlert(context.Background(), "admin1", "admin")
	if err != nil || !alert || n != 1 {
		t.Fatalf("GetOpsAlert: %v %d %v", alert, n, err)
	}
}

func TestEmailHint(t *testing.T) {
	cases := map[string]string{
		"jh21star@gmail.com": "jh2…",
		"ab@x.io":            "ab…",
		"가나다라@x.kr":          "가나다…",
		"":                   "",
		"@nolocal":           "",
	}
	for in, want := range cases {
		if got := EmailHint(in); got != want {
			t.Errorf("%q → %q (want %q)", in, got, want)
		}
	}
}
