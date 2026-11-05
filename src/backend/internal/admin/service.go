// 운영자 통계 규칙(SPEC-032) — 권한 · 캐시 · 시행 전 상태 · 빈 날 채우기.
//
// 관리자만 읽는다. 집계는 5분 묶어 두고, 같은 순간의 조회는 한 번만 DB 로 보낸다(DB 연결이 10개뿐이다).
// 구역을 나눠 부르므로 한 구역이 실패해도 나머지는 보인다.
package admin

import (
	"context"
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
}

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
		return out, err
	})
}
