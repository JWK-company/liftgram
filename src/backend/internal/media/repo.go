// @plm SRS-019  미디어 저장소 — 메타만 다룬다(바이트는 Storage가 안다)
package media

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type pgRepo struct {
	q *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) Repo {
	return &pgRepo{q: sqlcgen.New(pool)}
}

func (r *pgRepo) Create(ctx context.Context, a Asset) (Asset, error) {
	var reason *string
	if a.Flagged {
		s := "auto_scan"
		reason = &s
	}
	row, err := r.q.CreateMediaAsset(ctx, sqlcgen.CreateMediaAssetParams{
		ID:          a.ID,
		OwnerID:     a.OwnerID,
		Key:         a.Key,
		Url:         a.URL,
		ContentType: a.ContentType,
		Kind:        a.Kind,
		Bytes:       a.Bytes,
		Flagged:     a.Flagged,
		FlagReason:  reason,
		ScanPending: a.ScanPending,
	})
	if err != nil {
		return Asset{}, err
	}
	return rowToAsset(row), nil
}

func (r *pgRepo) GetByKey(ctx context.Context, key string) (Asset, error) {
	row, err := r.q.GetMediaAssetByKey(ctx, key)
	if errors.Is(err, pgx.ErrNoRows) {
		return Asset{}, errs.New(errs.NotFound, "파일을 찾을 수 없습니다")
	}
	if err != nil {
		return Asset{}, err
	}
	return rowToAsset(row), nil
}

func (r *pgRepo) ListScanPending(ctx context.Context, limit int32) ([]Asset, error) {
	rows, err := r.q.ListScanPending(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]Asset, 0, len(rows))
	for _, row := range rows {
		out = append(out, rowToAsset(row))
	}
	return out, nil
}

func (r *pgRepo) BumpScanAttempts(ctx context.Context, id string) error {
	return r.q.BumpScanAttempts(ctx, id)
}

func (r *pgRepo) ApplyRescan(ctx context.Context, a Asset, flagged bool) error {
	return r.q.ApplyRescan(ctx, sqlcgen.ApplyRescanParams{Flagged: flagged, Url: a.URL, Key: a.Key})
}

func rowToAsset(m sqlcgen.MediaAsset) Asset {
	return Asset{
		ID:          m.ID,
		OwnerID:     m.OwnerID,
		Key:         m.Key,
		URL:         m.Url,
		ContentType: m.ContentType,
		Kind:        m.Kind,
		Bytes:       m.Bytes,
		Flagged:     m.Flagged,
		ScanPending: m.ScanPending,
		CreatedAt:   m.CreatedAt.Time,
	}
}
