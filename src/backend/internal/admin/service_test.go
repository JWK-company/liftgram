package admin

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type retentionCall struct {
	from, to time.Time
	n        int
}

type fakeRepo struct {
	usageBytes, usageRows int64
	usageCalls            atomic.Int64
	retention             []retentionCall
	role                  string
	calls                 atomic.Int64
	workout               atomic.Int64
	block                 chan struct{}
	err                   error
}

func (f *fakeRepo) UserRole(context.Context, string) (string, bool, error) {
	return f.role, f.role != "", nil
}
func (f *fakeRepo) SignupTotals(context.Context) (int64, int64, error) {
	f.calls.Add(1)
	if f.block != nil {
		<-f.block
	}
	return 10, 4, f.err
}
func (f *fakeRepo) SignupDaily(context.Context, time.Time) ([]DailyCount, error) {
	return []DailyCount{{Day: "2026-11-20", Count: 3}}, nil
}
func (f *fakeRepo) SignupProviders(context.Context) ([]NamedCount, error) {
	return []NamedCount{{Name: "email", Count: 4}}, nil
}
func (f *fakeRepo) FirstWorkout(context.Context, time.Time, time.Time) (int64, int64, error) {
	f.workout.Add(1)
	return 5, 2, nil
}
func (f *fakeRepo) RoutineBuckets(context.Context, time.Time) ([]NamedCount, error) {
	f.workout.Add(1)
	return []NamedCount{{Name: "0", Count: 1}}, nil
}
func (f *fakeRepo) WorkoutStats(context.Context, time.Time, int64, int64) (int64, int64, int64, int64, error) {
	f.workout.Add(1)
	return 8, 6, 3, 2400, nil
}
func (f *fakeRepo) ContentRows(context.Context, time.Time, time.Time) ([]ContentRow, error) {
	return []ContentRow{{Key: "post", Total: 1}}, nil
}
func (f *fakeRepo) Operations(context.Context) (int64, int64, int64, error) { return 1, 2, 3, nil }

var (
	since = time.Date(2026, 11, 5, 0, 0, 0, 0, KST)
	now   = time.Date(2026, 11, 20, 12, 0, 0, 0, KST)
)

func clock(t time.Time) func() time.Time { return func() time.Time { return t } }

func TestStats_권한(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name, viewer, claim, dbRole string
		want                        errs.Code
	}{
		{"비로그인", "", "", "", errs.Unauthorized},
		{"일반", "u", "user", "user", errs.Forbidden},
		{"검토자", "u", "moderator", "moderator", errs.Forbidden},
		{"동업자", "u", "coworker", "coworker", errs.Forbidden},
		{"토큰만 admin — 회수됨", "u", "admin", "user", errs.Forbidden},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			f := &fakeRepo{role: c.dbRole}
			s := NewService(f, clock(now), since, time.Minute)
			_, err := s.GetSignupStats(ctx, c.viewer, c.claim)
			var e *errs.DomainError
			if !errors.As(err, &e) || e.Code != c.want {
				t.Fatalf("오류 = %v, 원하는 것 = %v", err, c.want)
			}
			if f.calls.Load() != 0 {
				t.Fatal("권한 없는 호출이 집계를 돌렸다")
			}
		})
	}
}

func TestStats_캐시_뒤에도_권한을_본다(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{role: "admin"}
	s := NewService(f, clock(now), since, time.Minute)
	if _, err := s.GetSignupStats(ctx, "a", "admin"); err != nil {
		t.Fatal(err)
	}
	f.role = "user" // 회수
	if _, err := s.GetSignupStats(ctx, "a", "admin"); err == nil {
		t.Fatal("캐시가 권한 판정을 건너뛰었다")
	}
}

func TestStats_캐시_시간(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{role: "admin"}
	cur := now
	s := NewService(f, func() time.Time { return cur }, since, 5*time.Minute)
	for i := 0; i < 3; i++ {
		if _, err := s.GetSignupStats(ctx, "a", "admin"); err != nil {
			t.Fatal(err)
		}
	}
	if f.calls.Load() != 1 {
		t.Fatalf("5분 안 재조회가 집계를 다시 돌렸다: %d", f.calls.Load())
	}
	cur = cur.Add(5 * time.Minute)
	if _, err := s.GetSignupStats(ctx, "a", "admin"); err != nil {
		t.Fatal(err)
	}
	if f.calls.Load() != 2 {
		t.Fatalf("5분 뒤에는 다시 돌아야 한다: %d", f.calls.Load())
	}
}

func TestStats_동시_조회는_한_번만(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{role: "admin", block: make(chan struct{})}
	s := NewService(f, clock(now), since, time.Minute)
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := s.GetSignupStats(ctx, "a", "admin"); err != nil {
				t.Error(err)
			}
		}()
	}
	time.Sleep(50 * time.Millisecond)
	close(f.block)
	wg.Wait()
	if n := f.calls.Load(); n != 1 {
		t.Fatalf("집계 %d번", n)
	}
}

func TestStats_실패는_캐시하지_않는다(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{role: "admin", err: errors.New("db")}
	s := NewService(f, clock(now), since, time.Minute)
	if _, err := s.GetSignupStats(ctx, "a", "admin"); err == nil {
		t.Fatal("오류여야 한다")
	}
	f.err = nil
	if _, err := s.GetSignupStats(ctx, "a", "admin"); err != nil {
		t.Fatal(err)
	}
}

func TestStats_시행_전에는_운동_기록을_읽지_않는다(t *testing.T) {
	ctx := context.Background()
	f := &fakeRepo{role: "admin"}
	before := since.Add(-time.Hour)
	s := NewService(f, clock(before), since, 0)
	r, err := s.GetRoutineStats(ctx, "a", "admin")
	if err != nil || r.Started {
		t.Fatalf("시행 전이어야 한다: %+v %v", r, err)
	}
	su, err := s.GetSignupStats(ctx, "a", "admin")
	if err != nil || su.Started || su.Total != 10 {
		t.Fatalf("가입은 보여야 한다: %+v %v", su, err)
	}
	if f.workout.Load() != 0 {
		t.Fatal("시행 전에 운동·루틴 기록을 읽었다")
	}
	// 시행 뒤
	s2 := NewService(f, clock(since), since, 0)
	r2, _ := s2.GetRoutineStats(ctx, "a", "admin")
	if !r2.Started || r2.Workouts != 8 || r2.MedianDurationSeconds != 2400 {
		t.Fatalf("시행 뒤 값: %+v", r2)
	}
}

func TestFillDays_한국_날짜_경계(t *testing.T) {
	// UTC 로는 11-19 15:30 이지만 한국은 11-20 00:30 이다.
	end := time.Date(2026, 11, 19, 15, 30, 0, 0, time.UTC)
	out := FillDays([]DailyCount{{Day: "2026-11-20", Count: 2}, {Day: "2026-11-18", Count: 1}}, end, 3)
	want := []DailyCount{{"2026-11-18", 1}, {"2026-11-19", 0}, {"2026-11-20", 2}}
	if len(out) != 3 {
		t.Fatal(out)
	}
	for i := range want {
		if out[i] != want[i] {
			t.Fatalf("%d: %+v != %+v", i, out[i], want[i])
		}
	}
}

func (f *fakeRepo) UsageTableStats(context.Context, time.Time) (int64, int64, error) {
	return f.usageBytes, f.usageRows, nil
}
func (f *fakeRepo) UsageOnline(context.Context, time.Time) (ActorCount, error) {
	f.usageCalls.Add(1)
	return ActorCount{User: 2, Guest: 3}, nil
}
func (f *fakeRepo) UsageActive(context.Context, string, string, string) (ActorCount, ActorCount, ActorCount, error) {
	f.usageCalls.Add(1)
	return ActorCount{User: 1, Guest: 1}, ActorCount{User: 2, Guest: 2}, ActorCount{User: 3, Guest: 3}, nil
}
func (f *fakeRepo) UsageDaily(context.Context, string) ([]UsageDailyRow, error) {
	return []UsageDailyRow{{Day: "2026-11-19", Kind: "user", Actors: 7}, {Day: "2026-11-20", Kind: "guest", Actors: 99}}, nil
}
func (f *fakeRepo) UsageRetention(_ context.Context, from, to time.Time, n int) (Retention, error) {
	f.retention = append(f.retention, retentionCall{from, to, n})
	return Retention{Cohort: ActorCount{User: 4}, Returned: ActorCount{User: 1}}, nil
}
func (f *fakeRepo) UsageFeatures(context.Context, string, string) ([]FeatureRow, error) {
	return []FeatureRow{
		{Name: "event:screen_home", Last7d: 5, Last30d: 9},
		{Name: "event:workout_finish", Last7d: 1, Last30d: 2},
		{Name: "platform:web", Last7d: 3, Last30d: 4},
	}, nil
}

func TestUsage_합계와_오늘은_살아_있는_값(t *testing.T) {
	f := &fakeRepo{role: "admin"}
	s := NewService(f, clock(now), since, 0)
	u, err := s.GetUsageStats(context.Background(), "a", "admin")
	if err != nil {
		t.Fatal(err)
	}
	if u.Online.Total() != 5 {
		t.Fatalf("합계 = 로그인 + 비로그인이어야 한다: %+v", u.Online)
	}
	if len(u.Daily) != 30 || u.Daily[28].User != 7 {
		t.Fatalf("일별: %+v", u.Daily[28])
	}
	last := u.Daily[29]
	if last.Day != "2026-11-20" || last.Guest != 1 || last.User != 1 {
		t.Fatalf("오늘은 살아 있는 값으로 덮어야 한다: %+v", last)
	}
	// 재방문 창: n=7 이면 첫날이 [오늘-14, 오늘-7).
	if len(f.retention) != 3 {
		t.Fatal(f.retention)
	}
	c := f.retention[1]
	day0 := StartOfDayKST(now)
	if c.n != 7 || !c.from.Equal(day0.AddDate(0, 0, -14)) || !c.to.Equal(day0.AddDate(0, 0, -7)) {
		t.Fatalf("재방문 창: %+v", c)
	}
}

func TestUsage_시행_전에는_읽지_않는다(t *testing.T) {
	f := &fakeRepo{role: "admin"}
	s := NewService(f, clock(since.Add(-time.Minute)), since, 0)
	u, err := s.GetUsageStats(context.Background(), "a", "admin")
	if err != nil || u.Started {
		t.Fatalf("%+v %v", u, err)
	}
	fe, err := s.GetFeatureStats(context.Background(), "a", "admin")
	if err != nil || fe.Started {
		t.Fatalf("%+v %v", fe, err)
	}
	if f.usageCalls.Load() != 0 {
		t.Fatal("시행 전에 이용 기록을 읽었다")
	}
}

func TestFeature_화면과_행동이_갈린다(t *testing.T) {
	f := &fakeRepo{role: "admin"}
	s := NewService(f, clock(now), since, 0)
	fe, err := s.GetFeatureStats(context.Background(), "a", "admin")
	if err != nil {
		t.Fatal(err)
	}
	if len(fe.Screens) != 1 || fe.Screens[0].Name != "screen_home" || len(fe.Actions) != 1 || fe.Actions[0].Name != "workout_finish" || len(fe.Platforms) != 1 || fe.Platforms[0].Name != "web" {
		t.Fatalf("%+v", fe)
	}
}

func TestOperations_표_경보(t *testing.T) {
	f := &fakeRepo{role: "admin", usageRows: usageWarnRows}
	s := NewService(f, clock(now), since, 0)
	o, err := s.GetOperationsStats(context.Background(), "a", "admin")
	if err != nil || !o.UsageWarn {
		t.Fatalf("%+v %v", o, err)
	}
	f.usageRows = 1
	o, _ = s.GetOperationsStats(context.Background(), "a", "admin")
	if o.UsageWarn {
		t.Fatal("경보가 아니어야 한다")
	}
}
