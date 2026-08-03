// @plm SRS-039  착용장비 클릭 저장소
package gear

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
)

type pgRepo struct {
	q *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) Repo {
	return &pgRepo{q: sqlcgen.New(pool)}
}

func (r *pgRepo) RecentClickExists(ctx context.Context, userID, postID, category string, since time.Time) (bool, error) {
	return r.q.RecentGearClickExists(ctx, sqlcgen.RecentGearClickExistsParams{
		UserID:   userID,
		PostID:   postID,
		Category: category,
		Since:    pgtype.Timestamptz{Time: since, Valid: true},
	})
}

func (r *pgRepo) CreateClick(ctx context.Context, id, userID, postID, category, source, kind string) error {
	return r.q.CreateGearClick(ctx, sqlcgen.CreateGearClickParams{
		ID:       id,
		UserID:   userID,
		PostID:   postID,
		Category: category,
		Source:   source,
		Kind:     kind,
	})
}
