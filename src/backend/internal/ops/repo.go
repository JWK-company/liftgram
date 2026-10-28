// @plm SRS-088  운영 상태 저장소
//
// ── 트랜잭션을 쓰는 곳 ──────────────────────────────────────────────────────
// 보고 = upsert + 사용자당 최신 8줄 정리. 갈라지면 기기 id 를 바꿔 가며 보낸 줄이 정리 전에 쌓인다.
package ops

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
)

type pgRepo struct {
	pool *pgxpool.Pool
	q    *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) Repo {
	return &pgRepo{pool: pool, q: sqlcgen.New(pool)}
}

func (r *pgRepo) UpsertHealth(ctx context.Context, h Health, keep int) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)
	if err := q.UpsertClientHealth(ctx, sqlcgen.UpsertClientHealthParams{
		UserID:              h.UserID,
		DeviceID:            h.DeviceID,
		AppVersion:          h.AppVersion,
		LastSuccessAt:       ts(h.LastSuccessAt),
		LastAttemptAt:       ts(h.LastAttemptAt),
		ConsecutiveFailures: h.ConsecutiveFailures,
		Pending:             h.Pending,
		Blocked:             h.Blocked,
		LastError:           strPtr(h.LastError),
		ReportedAt:          pgtype.Timestamptz{Time: h.ReportedAt, Valid: true},
	}); err != nil {
		return err
	}
	if err := q.TrimClientHealth(ctx, sqlcgen.TrimClientHealthParams{UserID: h.UserID, Keep: int32(keep)}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

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

func (r *pgRepo) ListUsers(ctx context.Context, limit int) ([]UserRow, error) {
	rows, err := r.q.ListOpsUsers(ctx, int32(limit))
	if err != nil {
		return nil, err
	}
	out := make([]UserRow, 0, len(rows))
	for _, u := range rows {
		out = append(out, UserRow{
			ID:           u.ID,
			Email:        deref(u.Email),
			DisplayName:  deref(u.DisplayName),
			LastSyncAt:   timePtr(u.LastSyncAt),
			LastActiveAt: timePtr(u.LastActiveAt),
		})
	}
	return out, nil
}

func (r *pgRepo) ListHealthSince(ctx context.Context, since time.Time) ([]Health, error) {
	rows, err := r.q.ListClientHealthSince(ctx, pgtype.Timestamptz{Time: since, Valid: true})
	if err != nil {
		return nil, err
	}
	out := make([]Health, 0, len(rows))
	for _, h := range rows {
		out = append(out, Health{
			UserID:              h.UserID,
			DeviceID:            h.DeviceID,
			AppVersion:          h.AppVersion,
			LastSuccessAt:       timePtr(h.LastSuccessAt),
			LastAttemptAt:       timePtr(h.LastAttemptAt),
			ConsecutiveFailures: h.ConsecutiveFailures,
			Pending:             h.Pending,
			Blocked:             h.Blocked,
			LastError:           deref(h.LastError),
			FirstReportedAt:     h.FirstReportedAt.Time,
			ReportedAt:          h.ReportedAt.Time,
		})
	}
	return out, nil
}

func (r *pgRepo) LastBackupRun(ctx context.Context, kind string, okOnly bool) (BackupRun, bool, error) {
	var row sqlcgen.OpsBackupRun
	var err error
	if okOnly {
		row, err = r.q.LastOkBackupRun(ctx, kind)
	} else {
		row, err = r.q.LastBackupRun(ctx, kind)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return BackupRun{}, false, nil
	}
	if err != nil {
		return BackupRun{}, false, err
	}
	b := BackupRun{Kind: row.Kind, OK: row.Ok, Detail: deref(row.Detail), CreatedAt: row.CreatedAt.Time}
	if row.SizeBytes != nil {
		b.SizeBytes = *row.SizeBytes
	}
	if row.Tables != nil {
		b.Tables = *row.Tables
	}
	if row.DiskFreeBytes != nil {
		b.DiskFreeBytes = *row.DiskFreeBytes
	}
	return b, true, nil
}

func ts(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: *t, Valid: true}
}

func timePtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time
	return &v
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
