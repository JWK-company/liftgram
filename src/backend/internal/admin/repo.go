// 운영자 통계 저장소(SPEC-032) — 모든 집계를 읽기 전용 트랜잭션 + 문장 시간 상한 안에서 돌린다.
// 느린 집계가 연결을 오래 잡으면 앱 전체가 멈춘다(DB 연결 10개).
package admin

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
)

// statementTimeoutSQL — 문장 하나의 상한. 넘으면 그 구역만 실패로 보인다.
const statementTimeoutSQL = `SET LOCAL statement_timeout = '5s'`

type pgRepo struct {
	pool *pgxpool.Pool
	q    *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) Repo {
	return &pgRepo{pool: pool, q: sqlcgen.New(pool)}
}

// read 는 읽기 전용 트랜잭션 안에서 fn 을 돌린다.
func (r *pgRepo) read(ctx context.Context, fn func(q *sqlcgen.Queries) error) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, statementTimeoutSQL); err != nil {
		return err
	}
	if err := fn(r.q.WithTx(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func ts(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

// UserRole 은 DB 의 현재 역할이다(토큰의 역할은 낡을 수 있다).
func (r *pgRepo) UserRole(ctx context.Context, userID string) (string, bool, error) {
	u, err := r.q.GetUserByID(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return u.Role, true, nil
}

func (r *pgRepo) SignupTotals(ctx context.Context) (int64, int64, error) {
	var total, verified int64
	err := r.read(ctx, func(q *sqlcgen.Queries) error {
		row, err := q.AdminSignupTotals(ctx)
		total, verified = row.Total, row.EmailVerified
		return err
	})
	return total, verified, err
}

func (r *pgRepo) SignupDaily(ctx context.Context, from time.Time) ([]DailyCount, error) {
	var out []DailyCount
	err := r.read(ctx, func(q *sqlcgen.Queries) error {
		rows, err := q.AdminSignupDaily(ctx, ts(from))
		for _, row := range rows {
			out = append(out, DailyCount{Day: row.Day, Count: row.N})
		}
		return err
	})
	return out, err
}

func (r *pgRepo) SignupProviders(ctx context.Context) ([]NamedCount, error) {
	out := []NamedCount{}
	err := r.read(ctx, func(q *sqlcgen.Queries) error {
		email, err := q.AdminSignupEmailCount(ctx)
		if err != nil {
			return err
		}
		out = append(out, NamedCount{Name: "email", Count: email})
		rows, err := q.AdminSignupProviders(ctx)
		for _, row := range rows {
			out = append(out, NamedCount{Name: row.Provider, Count: row.N})
		}
		return err
	})
	return out, err
}

func (r *pgRepo) FirstWorkout(ctx context.Context, since, cutoff time.Time) (int64, int64, error) {
	var cohort, done int64
	err := r.read(ctx, func(q *sqlcgen.Queries) error {
		row, err := q.AdminFirstWorkout(ctx, sqlcgen.AdminFirstWorkoutParams{Since: ts(since), Cutoff: ts(cutoff)})
		cohort, done = row.Cohort, row.Done
		return err
	})
	return cohort, done, err
}

func (r *pgRepo) RoutineBuckets(ctx context.Context, since time.Time) ([]NamedCount, error) {
	var out []NamedCount
	err := r.read(ctx, func(q *sqlcgen.Queries) error {
		row, err := q.AdminRoutineBuckets(ctx, ts(since))
		out = []NamedCount{{"0", row.B0}, {"1", row.B1}, {"2-3", row.B2}, {"4-6", row.B4}, {"7+", row.B7}}
		return err
	})
	return out, err
}

func (r *pgRepo) WorkoutStats(ctx context.Context, since time.Time, fromMs, toMs int64) (int64, int64, int64, int64, error) {
	var w, fr, au, med int64
	err := r.read(ctx, func(q *sqlcgen.Queries) error {
		row, err := q.AdminWorkoutStats(ctx, sqlcgen.AdminWorkoutStatsParams{Since: ts(since), FromMs: fromMs, ToMs: toMs})
		w, fr, au, med = row.Workouts, row.FromRoutine, row.ActiveUsers, row.MedianSeconds
		return err
	})
	return w, fr, au, med, err
}

func (r *pgRepo) ContentRows(ctx context.Context, d7, d30 time.Time) ([]ContentRow, error) {
	var out []ContentRow
	err := r.read(ctx, func(q *sqlcgen.Queries) error {
		rows, err := q.AdminContentRows(ctx, sqlcgen.AdminContentRowsParams{D7: ts(d7), D30: ts(d30)})
		for _, row := range rows {
			out = append(out, ContentRow{Key: row.Key, Last7d: row.Last7d, Last30d: row.Last30d, Total: row.Total})
		}
		return err
	})
	return out, err
}

func (r *pgRepo) Operations(ctx context.Context) (int64, int64, int64, error) {
	var p, u, o int64
	err := r.read(ctx, func(q *sqlcgen.Queries) error {
		row, err := q.AdminOperations(ctx)
		p, u, o = row.PendingReports, row.OpenUserFeedback, row.OpenOpsFeedback
		return err
	})
	return p, u, o, err
}

func pgDate(day string) (pgtype.Date, error) {
	t, err := time.ParseInLocation("2006-01-02", day, time.UTC)
	if err != nil {
		return pgtype.Date{}, err
	}
	return pgtype.Date{Time: t, Valid: true}, nil
}

func (r *pgRepo) UsageTableStats(ctx context.Context, since time.Time) (int64, int64, error) {
	var b, n int64
	err := r.read(ctx, func(q *sqlcgen.Queries) error {
		row, err := q.AdminUsageTableStats(ctx, ts(since))
		b, n = row.Bytes, row.Rows24h
		return err
	})
	return b, n, err
}

func (r *pgRepo) UsageOnline(ctx context.Context, since time.Time) (ActorCount, error) {
	var out ActorCount
	err := r.read(ctx, func(q *sqlcgen.Queries) error {
		rows, err := q.AdminUsageOnline(ctx, ts(since))
		for _, row := range rows {
			out.Add(row.ActorKind, row.N)
		}
		return err
	})
	return out, err
}

func (r *pgRepo) UsageActive(ctx context.Context, today, d7, d30 string) (ActorCount, ActorCount, ActorCount, error) {
	var dau, wau, mau ActorCount
	t, err := pgDate(today)
	if err != nil {
		return dau, wau, mau, err
	}
	w, err := pgDate(d7)
	if err != nil {
		return dau, wau, mau, err
	}
	m, err := pgDate(d30)
	if err != nil {
		return dau, wau, mau, err
	}
	err = r.read(ctx, func(q *sqlcgen.Queries) error {
		rows, err := q.AdminUsageActive(ctx, sqlcgen.AdminUsageActiveParams{Today: t, D7: w, D30: m})
		for _, row := range rows {
			dau.Add(row.ActorKind, row.Dau)
			wau.Add(row.ActorKind, row.Wau)
			mau.Add(row.ActorKind, row.Mau)
		}
		return err
	})
	return dau, wau, mau, err
}

func (r *pgRepo) UsageDaily(ctx context.Context, from string) ([]UsageDailyRow, error) {
	d, err := pgDate(from)
	if err != nil {
		return nil, err
	}
	var out []UsageDailyRow
	err = r.read(ctx, func(q *sqlcgen.Queries) error {
		rows, err := q.AdminUsageDaily(ctx, d)
		for _, row := range rows {
			out = append(out, UsageDailyRow{Day: row.Day, Kind: row.ActorKind, Actors: row.Actors})
		}
		return err
	})
	return out, err
}

func (r *pgRepo) UsageRetention(ctx context.Context, from, to time.Time, n int) (Retention, error) {
	var out Retention
	err := r.read(ctx, func(q *sqlcgen.Queries) error {
		rows, err := q.AdminUsageRetention(ctx, sqlcgen.AdminUsageRetentionParams{FromAt: ts(from), ToAt: ts(to), N: int32(n)})
		for _, row := range rows {
			out.Cohort.Add(row.ActorKind, row.Cohort)
			out.Returned.Add(row.ActorKind, row.Returned)
		}
		return err
	})
	return out, err
}

func (r *pgRepo) UsageFeatures(ctx context.Context, d7, d30 string) ([]FeatureRow, error) {
	w, err := pgDate(d7)
	if err != nil {
		return nil, err
	}
	m, err := pgDate(d30)
	if err != nil {
		return nil, err
	}
	var out []FeatureRow
	err = r.read(ctx, func(q *sqlcgen.Queries) error {
		rows, err := q.AdminUsageFeatures(ctx, sqlcgen.AdminUsageFeaturesParams{D7: w, D30: m})
		for _, row := range rows {
			out = append(out, FeatureRow{Name: row.Metric, Last7d: row.Last7d, Last30d: row.Last30d})
		}
		return err
	})
	return out, err
}
