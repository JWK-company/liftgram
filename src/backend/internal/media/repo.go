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
		CreatedAt:   m.CreatedAt.Time,
	}
}
