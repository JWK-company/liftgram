// 운영자 통계 규칙(SPEC-032) — 권한 · 캐시 · 시행 전 상태 · 빈 날 채우기.
//
// 관리자만 읽는다. 집계는 5분 묶어 두고, 같은 순간의 조회는 한 번만 DB 로 보낸다(DB 연결이 10개뿐이다).
// 구역을 나눠 부르므로 한 구역이 실패해도 나머지는 보인다.
package admin

import (
	"context"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"

	"github.com/JWK-company/liftgram/src/backend/internal/access"
)

// RoleAdmin — 통계를 읽을 수 있는 유일한 역할.
const RoleAdmin = "admin"

// KST — 일 경계는 한국 시간이다. 컨테이너에 tzdata 가 없어도 같게 고정 오프셋을 쓴다.
var KST = time.FixedZone("KST", 9*60*60)

// loadTimeout — 집계 한 번의 상한. 부른 사람이 끊어도 함께 기다리는 사람을 위해 끝까지 돈다.
const loadTimeout = 15 * time.Second

// DailyCount 는 Asia/Seoul 기준 하루의 값이다.
type DailyCount struct {
	Day   string
	Count int64
}

// NamedCount 는 이름이 붙은 건수다.
type NamedCount struct {
	Name  string
	Count int64
}

type SignupStats struct {
	GeneratedAt        time.Time
	Total              int64
	Daily              []DailyCount
	Providers          []NamedCount
	EmailVerified      int64
	FirstWorkoutCohort int64
	FirstWorkoutDone   int64
	Started            bool
	UsageSince         time.Time
}

type RoutineStats struct {
	GeneratedAt           time.Time
	Started               bool
	UsageSince            time.Time
	RoutineBuckets        []NamedCount
	Workouts              int64
	WorkoutsFromRoutine   int64
	ActiveUsers           int64
	MedianDurationSeconds int64
}

type ContentRow struct {
	Key     string
	Last7d  int64
	Last30d int64
	Total   int64
}

type ContentStats struct {
	GeneratedAt time.Time
	Rows        []ContentRow
}

type OperationsStats struct {
	GeneratedAt      time.Time
	PendingReports   int64
	OpenUserFeedback int64
	OpenOpsFeedback  int64
	UsageBytes       int64
	UsageRows24h     int64
	UsageWarn        bool
}

// ActorCount 는 로그인·비로그인 수다. 합계는 단순 합이다.
type ActorCount struct {
	User, Guest int64
}

// Total 은 합계다.
func (a ActorCount) Total() int64 { return a.User + a.Guest }

// Add 는 주체 종류에 맞는 칸에 넣는다.
func (a *ActorCount) Add(kind string, n int64) {
	if kind == "user" {
		a.User += n
	} else {
		a.Guest += n
	}
}

type Retention struct {
	Cohort, Returned ActorCount
}

type DailyActors struct {
	Day         string
	User, Guest int64
}

type UsageStats struct {
	GeneratedAt           time.Time
	Started               bool
	UsageSince            time.Time
	Online, DAU, WAU, MAU ActorCount
	D1, D7, D30           Retention
	Daily                 []DailyActors
}

type FeatureRow struct {
	Name            string
	Last7d, Last30d int64
}

type FeatureStats struct {
	GeneratedAt                 time.Time
	Started                     bool
	UsageSince                  time.Time
	Screens, Actions, Platforms []FeatureRow
}

// UsageDailyRow · UsageFeatureRow 는 저장소가 돌려주는 줄이다.
type UsageDailyRow struct {
	Day, Kind string
	Actors    int64
}

const (
	// OnlineWindow — 「현재 접속」의 뜻.
	OnlineWindow = 5 * time.Minute
	// 표 크기·하루 행 경보. 하루 상한(usage.RowsGlobalDaily)의 80%.
	usageWarnBytes = 2 << 30
	usageWarnRows  = 400_000
)

// Repo 는 집계 저장소다. 모든 읽기는 읽기 전용 + 문장 시간 상한으로 돈다.
type Repo interface {
	access.RoleReader
	SignupTotals(ctx context.Context) (total, emailVerified int64, err error)
	SignupDaily(ctx context.Context, from time.Time) ([]DailyCount, error)
	SignupProviders(ctx context.Context) ([]NamedCount, error)
	FirstWorkout(ctx context.Context, since, cutoff time.Time) (cohort, done int64, err error)
	RoutineBuckets(ctx context.Context, since time.Time) ([]NamedCount, error)
	WorkoutStats(ctx context.Context, since time.Time, fromMs, toMs int64) (workouts, fromRoutine, activeUsers, medianSeconds int64, err error)
	ContentRows(ctx context.Context, d7, d30 time.Time) ([]ContentRow, error)
	Operations(ctx context.Context) (pending, openUser, openOps int64, err error)
	UsageTableStats(ctx context.Context, since time.Time) (bytes, rows int64, err error)
	UsageOnline(ctx context.Context, since time.Time) (ActorCount, error)
	// today·d7·d30 은 KST YYYY-MM-DD.
	UsageActive(ctx context.Context, today, d7, d30 string) (dau, wau, mau ActorCount, err error)
	UsageDaily(ctx context.Context, from string) ([]UsageDailyRow, error)
	UsageRetention(ctx context.Context, from, to time.Time, n int) (Retention, error)
	UsageFeatures(ctx context.Context, d7, d30 string) ([]FeatureRow, error)
}

// Service 는 구역별 집계를 돌려준다.
type Service struct {
	repo  Repo
	now   func() time.Time
	since time.Time
	ttl   time.Duration

	sf    singleflight.Group
	mu    sync.Mutex
	cache map[string]cacheEntry
}

type cacheEntry struct {
	value any
	at    time.Time
}

// NewService — since 는 USAGE_SINCE(운동·루틴 기록·이용 기록 집계 시작), ttl 은 캐시 시간(0 이면 묶지 않는다).
func NewService(repo Repo, now func() time.Time, since time.Time, ttl time.Duration) *Service {
	return &Service{repo: repo, now: now, since: since, ttl: ttl, cache: map[string]cacheEntry{}}
}

// section 은 권한을 먼저 보고(캐시도 권한 뒤에 있다) 캐시 → 묶음 → 집계 순서로 값을 낸다.
func section[T any](ctx context.Context, s *Service, viewerID, claim, key string, load func(context.Context) (T, error)) (T, error) {
	var zero T
	if err := access.Require(ctx, s.repo, viewerID, claim, RoleAdmin); err != nil {
		return zero, err
	}
	now := s.now()
	if s.ttl > 0 {
		s.mu.Lock()
		e, ok := s.cache[key]
		s.mu.Unlock()
		if ok && now.Sub(e.at) < s.ttl {
			return e.value.(T), nil
		}
	}
	v, err, _ := s.sf.Do(key, func() (any, error) {
		lc, cancel := context.WithTimeout(context.WithoutCancel(ctx), loadTimeout)
		defer cancel()
		val, err := load(lc)
		if err != nil {
			return nil, err
		}
		if s.ttl > 0 {
			s.mu.Lock()
			s.cache[key] = cacheEntry{value: val, at: s.now()}
			s.mu.Unlock()
		}
		return val, nil
	})
	if err != nil {
		return zero, err
	}
	return v.(T), nil
}

// FillDays 는 [끝-days+1, 끝] 범위의 빈 날을 0 으로 채운다. 끝은 end 가 속한 KST 날짜다.
func FillDays(rows []DailyCount, end time.Time, days int) []DailyCount {
	by := make(map[string]int64, len(rows))
	for _, r := range rows {
		by[r.Day] = r.Count
	}
	out := make([]DailyCount, 0, days)
	last := end.In(KST)
	for i := days - 1; i >= 0; i-- {
		d := last.AddDate(0, 0, -i).Format("2006-01-02")
		out = append(out, DailyCount{Day: d, Count: by[d]})
	}
	return out
}

// StartOfDayKST 는 t 가 속한 KST 날짜의 0시다.
func StartOfDayKST(t time.Time) time.Time {
	k := t.In(KST)
	return time.Date(k.Year(), k.Month(), k.Day(), 0, 0, 0, 0, KST)
}

func (s *Service) GetSignupStats(ctx context.Context, viewerID, claim string) (SignupStats, error) {
	return section(ctx, s, viewerID, claim, "signup", func(ctx context.Context) (SignupStats, error) {
		now := s.now()
		out := SignupStats{GeneratedAt: now, UsageSince: s.since, Started: !now.Before(s.since)}
		var err error
		if out.Total, out.EmailVerified, err = s.repo.SignupTotals(ctx); err != nil {
			return out, err
		}
		rows, err := s.repo.SignupDaily(ctx, StartOfDayKST(now).AddDate(0, 0, -29))
		if err != nil {
			return out, err
		}
		out.Daily = FillDays(rows, now, 30)
		if out.Providers, err = s.repo.SignupProviders(ctx); err != nil {
			return out, err
		}
		if out.Started {
			out.FirstWorkoutCohort, out.FirstWorkoutDone, err = s.repo.FirstWorkout(ctx, s.since, now.AddDate(0, 0, -7))
			if err != nil {
				return out, err
			}
		}
		return out, nil
	})
}

func (s *Service) GetRoutineStats(ctx context.Context, viewerID, claim string) (RoutineStats, error) {
	return section(ctx, s, viewerID, claim, "routine", func(ctx context.Context) (RoutineStats, error) {
		now := s.now()
		out := RoutineStats{GeneratedAt: now, UsageSince: s.since, Started: !now.Before(s.since)}
		if !out.Started {
			// 시행 전에는 운동·루틴 기록을 읽지 않는다.
			return out, nil
		}
		var err error
		if out.RoutineBuckets, err = s.repo.RoutineBuckets(ctx, s.since); err != nil {
			return out, err
		}
		out.Workouts, out.WorkoutsFromRoutine, out.ActiveUsers, out.MedianDurationSeconds, err = s.repo.WorkoutStats(
			ctx, s.since, now.AddDate(0, 0, -28).UnixMilli(), now.UnixMilli())
		return out, err
	})
}

func (s *Service) GetContentStats(ctx context.Context, viewerID, claim string) (ContentStats, error) {
	return section(ctx, s, viewerID, claim, "content", func(ctx context.Context) (ContentStats, error) {
		now := s.now()
		rows, err := s.repo.ContentRows(ctx, now.AddDate(0, 0, -7), now.AddDate(0, 0, -30))
		if err != nil {
			return ContentStats{}, err
		}
		return ContentStats{GeneratedAt: now, Rows: rows}, nil
	})
}

func (s *Service) GetOperationsStats(ctx context.Context, viewerID, claim string) (OperationsStats, error) {
	return section(ctx, s, viewerID, claim, "operations", func(ctx context.Context) (OperationsStats, error) {
		now := s.now()
		out := OperationsStats{GeneratedAt: now}
		var err error
		out.PendingReports, out.OpenUserFeedback, out.OpenOpsFeedback, err = s.repo.Operations(ctx)
		if err != nil {
			return out, err
		}
		out.UsageBytes, out.UsageRows24h, err = s.repo.UsageTableStats(ctx, now.Add(-24*time.Hour))
		out.UsageWarn = out.UsageBytes >= usageWarnBytes || out.UsageRows24h >= usageWarnRows
		return out, err
	})
}

func dayStr(t time.Time) string { return t.Format("2006-01-02") }

// FillDailyActors 는 일별 활성을 빈 날까지 채우고, 오늘은 살아 있는 값으로 덮는다(밤 작업이 아직 안 돌았을 수 있다).
func FillDailyActors(rows []UsageDailyRow, end time.Time, days int, today ActorCount) []DailyActors {
	by := map[string]*DailyActors{}
	for _, r := range rows {
		d := by[r.Day]
		if d == nil {
			d = &DailyActors{Day: r.Day}
			by[r.Day] = d
		}
		if r.Kind == "user" {
			d.User = r.Actors
		} else {
			d.Guest = r.Actors
		}
	}
	out := make([]DailyActors, 0, days)
	last := end.In(KST)
	for i := days - 1; i >= 0; i-- {
		key := dayStr(last.AddDate(0, 0, -i))
		v := DailyActors{Day: key}
		if d := by[key]; d != nil {
			v = *d
		}
		if i == 0 {
			v.User, v.Guest = today.User, today.Guest
		}
		out = append(out, v)
	}
	return out
}

func (s *Service) GetUsageStats(ctx context.Context, viewerID, claim string) (UsageStats, error) {
	return section(ctx, s, viewerID, claim, "usage", func(ctx context.Context) (UsageStats, error) {
		now := s.now()
		out := UsageStats{GeneratedAt: now, UsageSince: s.since, Started: !now.Before(s.since)}
		if !out.Started {
			return out, nil
		}
		var err error
		if out.Online, err = s.repo.UsageOnline(ctx, now.Add(-OnlineWindow)); err != nil {
			return out, err
		}
		start := StartOfDayKST(now)
		today, d7, d30 := dayStr(start), dayStr(start.AddDate(0, 0, -6)), dayStr(start.AddDate(0, 0, -29))
		if out.DAU, out.WAU, out.MAU, err = s.repo.UsageActive(ctx, today, d7, d30); err != nil {
			return out, err
		}
		rows, err := s.repo.UsageDaily(ctx, d30)
		if err != nil {
			return out, err
		}
		out.Daily = FillDailyActors(rows, now, 30, out.DAU)
		// 재방문: 첫날이 [오늘-n-7, 오늘-n) 인 7일 묶음 — n 일째가 어제까지라 다 지난 값만 본다.
		for _, c := range []struct {
			n   int
			dst *Retention
		}{{1, &out.D1}, {7, &out.D7}, {30, &out.D30}} {
			r, err := s.repo.UsageRetention(ctx, start.AddDate(0, 0, -c.n-7), start.AddDate(0, 0, -c.n), c.n)
			if err != nil {
				return out, err
			}
			*c.dst = r
		}
		return out, nil
	})
}

// SplitFeatures 는 집계 줄을 화면·행동·플랫폼으로 나눈다. 이름의 접두어(event: · platform:)는 뗀다.
func SplitFeatures(rows []FeatureRow) (screens, actions, platforms []FeatureRow) {
	screens, actions, platforms = []FeatureRow{}, []FeatureRow{}, []FeatureRow{}
	for _, r := range rows {
		switch {
		case strings.HasPrefix(r.Name, "platform:"):
			r.Name = strings.TrimPrefix(r.Name, "platform:")
			platforms = append(platforms, r)
		case strings.HasPrefix(r.Name, "event:screen_"):
			r.Name = strings.TrimPrefix(r.Name, "event:")
			screens = append(screens, r)
		case strings.HasPrefix(r.Name, "event:"):
			r.Name = strings.TrimPrefix(r.Name, "event:")
			actions = append(actions, r)
		}
	}
	return screens, actions, platforms
}

func (s *Service) GetFeatureStats(ctx context.Context, viewerID, claim string) (FeatureStats, error) {
	return section(ctx, s, viewerID, claim, "feature", func(ctx context.Context) (FeatureStats, error) {
		now := s.now()
		out := FeatureStats{GeneratedAt: now, UsageSince: s.since, Started: !now.Before(s.since)}
		if !out.Started {
			return out, nil
		}
		start := StartOfDayKST(now)
		rows, err := s.repo.UsageFeatures(ctx, dayStr(start.AddDate(0, 0, -6)), dayStr(start.AddDate(0, 0, -29)))
		if err != nil {
			return out, err
		}
		out.Screens, out.Actions, out.Platforms = SplitFeatures(rows)
		return out, nil
	})
}
