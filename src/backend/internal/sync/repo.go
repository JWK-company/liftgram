// @plm SRS-006  동기 저장소
//
// 두 가지만 한다: **DB 시각을 알려 주고**, 변화분을 **한 트랜잭션으로** 반영한다.
//
// 시각을 DB에게 묻는 이유는 service.go 머리말에 있다 — 커서와 `updated_at`이 다른 시계에서
// 나오면 그 틈의 레코드가 영영 누락된다.
package sync

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
)

type pgRepo struct {
	pool  *pgxpool.Pool
	q     *sqlcgen.Queries
	newID func() string
}

func NewRepo(pool *pgxpool.Pool, newID func() string) Repo {
	return &pgRepo{pool: pool, q: sqlcgen.New(pool), newID: newID}
}

func (r *pgRepo) Now(ctx context.Context) (time.Time, error) {
	ts, err := r.q.SyncNow(ctx)
	if err != nil {
		return time.Time{}, err
	}
	return ts.Time, nil
}

func (r *pgRepo) List(ctx context.Context, userID string, since, until time.Time) ([]Record, error) {
	rows, err := r.q.ListSyncChanges(ctx, sqlcgen.ListSyncChangesParams{
		UserID: userID,
		Since:  pgtype.Timestamptz{Time: since, Valid: true},
		Until:  pgtype.Timestamptz{Time: until, Valid: true},
	})
	if err != nil {
		return nil, err
	}
	out := make([]Record, 0, len(rows))
	for _, row := range rows {
		out = append(out, Record{
			Collection: row.Collection,
			RecordID:   row.RecordID,
			Payload:    row.Payload,
			Deleted:    row.Deleted,
		})
	}
	return out, nil
}

// Apply는 올리기와 지우기를 **한 트랜잭션**으로 반영한다.
// 절반만 남으면 클라이언트는 무엇을 다시 보내야 하는지 알 방법이 없다.
func (r *pgRepo) Apply(ctx context.Context, userID string, upserts, deletes []Record) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	if len(upserts) > 0 {
		ids, cols, recIDs, payloads := r.columns(upserts)
		if err := q.UpsertSyncRecords(ctx, sqlcgen.UpsertSyncRecordsParams{
			Ids: ids, UserID: userID, Collections: cols, RecordIds: recIDs, Payloads: payloads,
		}); err != nil {
			return err
		}
	}
	if len(deletes) > 0 {
		ids, cols, recIDs, _ := r.columns(deletes)
		if err := q.MarkSyncDeleted(ctx, sqlcgen.MarkSyncDeletedParams{
			Ids: ids, UserID: userID, Collections: cols, RecordIds: recIDs,
		}); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// columns는 레코드 묶음을 배열 넷으로 편다 — 한 문장으로 보내기 위해서다.
// `id`는 새 행일 때만 쓰인다(이미 있으면 충돌 절이 기존 행을 고친다).
func (r *pgRepo) columns(recs []Record) (ids, cols, recIDs []string, payloads [][]byte) {
	ids = make([]string, len(recs))
	cols = make([]string, len(recs))
	recIDs = make([]string, len(recs))
	payloads = make([][]byte, len(recs))
	for i, rec := range recs {
		ids[i] = r.newID()
		cols[i] = rec.Collection
		recIDs[i] = rec.RecordID
		payloads[i] = rec.Payload
	}
	return ids, cols, recIDs, payloads
}
