// 이용 기록 저장소(SPEC-032 Phase 3).
package usage

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
)

// jobLockKey — 밤 작업 잠금 번호(다른 advisory lock 과 겹치지 않는 임의 값).
const jobLockKey int64 = 7_321_032

type pgRepo struct {
	pool *pgxpool.Pool
	q    *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) Repo {
	return &pgRepo{pool: pool, q: sqlcgen.New(pool)}
}

func ts(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t, Valid: true} }

func date(day string) (pgtype.Date, error) {
	t, err := time.ParseInLocation("2006-01-02", day, time.UTC)
	if err != nil {
		return pgtype.Date{}, err
	}
	return pgtype.Date{Time: t, Valid: true}, nil
}

func (r *pgRepo) UserExists(ctx context.Context, id string) (bool, error) {
	return r.q.UsageUserExists(ctx, id)
}

func (r *pgRepo) PresenceExists(ctx context.Context, kind, id string) (bool, error) {
	return r.q.UsagePresenceExists(ctx, sqlcgen.UsagePresenceExistsParams{ActorKind: kind, ActorID: id})
}

// InsertEvents 는 묶음을 한 트랜잭션에 넣는다. 같은 client_event_id 는 건너뛰어 재전송이 안전하다.
func (r *pgRepo) InsertEvents(ctx context.Context, kind, id, platform, version string, rows []EventRow) (int64, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)
	var total int64
	for _, row := range rows {
		cid, err := uuid.Parse(row.ClientEventID)
		if err != nil {
			continue
		}
		n, err := q.UsageInsertEvent(ctx, sqlcgen.UsageInsertEventParams{
			AtHour: ts(row.At), ActorKind: kind, ActorID: id,
			ClientEventID: pgtype.UUID{Bytes: cid, Valid: true}, EventName: row.Event,
			Platform: platform, AppVersion: version,
		})
		if err != nil {
			return 0, err
		}
		total += n
	}
	return total, tx.Commit(ctx)
}

func (r *pgRepo) CountActorEvents(ctx context.Context, kind, id string, since time.Time) (int64, error) {
	return r.q.UsageCountActorEvents(ctx, sqlcgen.UsageCountActorEventsParams{ActorKind: kind, ActorID: id, SinceAt: ts(since)})
}

func (r *pgRepo) CountEventsSince(ctx context.Context, since time.Time) (int64, error) {
	return r.q.UsageCountEventsSince(ctx, ts(since))
}

func (r *pgRepo) TouchPresence(ctx context.Context, kind, id string, now time.Time, day string) error {
	n, err := r.q.UsageTouchPresence(ctx, sqlcgen.UsageTouchPresenceParams{ActorKind: kind, ActorID: id, NowAt: ts(now)})
	if err != nil || n == 0 {
		return err
	}
	d, err := date(day)
	if err != nil {
		return err
	}
	return r.q.UsageMarkActiveDay(ctx, sqlcgen.UsageMarkActiveDayParams{Day: d, ActorKind: kind, ActorID: id})
}

// Aggregate 는 한 트랜잭션에서 [시작일, 오늘]을 다시 계산한다. 시작일은 「최근 7일」과 「마지막 집계일」 중 이른 날이라
// 서버가 며칠 꺼져 있어도 빠진 날이 채워진다.
func (r *pgRepo) Aggregate(ctx context.Context, today time.Time) (bool, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)
	locked, err := q.UsageTryLock(ctx, jobLockKey)
	if err != nil || !locked {
		return false, err
	}
	last, err := q.UsageLastDailyDay(ctx)
	if err != nil {
		return false, err
	}
	first, err := q.UsageFirstEventAt(ctx)
	if err != nil {
		return false, err
	}
	for _, day := range AggregateDays(today, last, first) {
		if err := aggregateDay(ctx, q, day); err != nil {
			return false, err
		}
	}
	return true, tx.Commit(ctx)
}

func aggregateDay(ctx context.Context, q *sqlcgen.Queries, day string) error {
	d, err := date(day)
	if err != nil {
		return err
	}
	from, err := time.ParseInLocation("2006-01-02", day, KST)
	if err != nil {
		return err
	}
	to := from.AddDate(0, 0, 1)
	if err := q.UsageDeleteDaily(ctx, d); err != nil {
		return err
	}
	if err := q.UsageAggregateEvents(ctx, sqlcgen.UsageAggregateEventsParams{Day: d, FromAt: ts(from), ToAt: ts(to)}); err != nil {
		return err
	}
	if err := q.UsageAggregatePlatforms(ctx, sqlcgen.UsageAggregatePlatformsParams{Day: d, FromAt: ts(from), ToAt: ts(to)}); err != nil {
		return err
	}
	d7, err := date(from.AddDate(0, 0, -6).Format("2006-01-02"))
	if err != nil {
		return err
	}
	d30, err := date(from.AddDate(0, 0, -29).Format("2006-01-02"))
	if err != nil {
		return err
	}
	return q.UsageAggregateActive(ctx, sqlcgen.UsageAggregateActiveParams{Day: d, D7: d7, D30: d30})
}

// Purge 는 90일 지난 원본을 묶음으로 지우고 고아 행을 청소한다.
func (r *pgRepo) Purge(ctx context.Context, cutoff time.Time, cutoffDay string) error {
	d, err := date(cutoffDay)
	if err != nil {
		return err
	}
	steps := []func() (int64, error){
		func() (int64, error) { return r.q.UsagePurgeEvents(ctx, ts(cutoff)) },
		func() (int64, error) { return r.q.UsagePurgePresence(ctx, ts(cutoff)) },
		func() (int64, error) { return r.q.UsagePurgeActiveDays(ctx, d) },
	}
	var firstErr error
	for _, step := range steps {
		for {
			n, err := step()
			if err != nil {
				firstErr = errors.Join(firstErr, err)
				break
			}
			if n < 5000 {
				break
			}
		}
	}
	return errors.Join(firstErr, r.q.UsagePurgeOrphans(ctx))
}
