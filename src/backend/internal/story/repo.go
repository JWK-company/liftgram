// @plm SRS-019  스토리 저장소
package story

import (
	"context"

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

func (r *pgRepo) Create(ctx context.Context, s Story, status string) (Story, error) {
	row, err := r.q.CreateStory(ctx, sqlcgen.CreateStoryParams{
		ID:               s.ID,
		AuthorID:         s.AuthorID,
		MediaUrl:         s.MediaURL,
		Caption:          ptr(s.Caption),
		ModerationStatus: status,
		ExpiresAt:        pgtype.Timestamptz{Time: s.ExpiresAt, Valid: true},
	})
	if err != nil {
		return Story{}, err
	}
	return Story{
		ID:        row.ID,
		AuthorID:  row.AuthorID,
		MediaURL:  row.MediaUrl,
		Caption:   deref(row.Caption),
		CreatedAt: row.CreatedAt.Time,
		ExpiresAt: row.ExpiresAt.Time,
	}, nil
}

// 글쓴이 정보를 따로 돌려준다 — 같은 사람의 컷마다 이름을 복사해 두면 그룹을 만들 때 중복이 된다.
func (r *pgRepo) ListActive(ctx context.Context, viewerID string) ([]Story, map[string]Author, error) {
	rows, err := r.q.ListActiveStories(ctx, viewerID)
	if err != nil {
		return nil, nil, err
	}
	out := make([]Story, 0, len(rows))
	authors := map[string]Author{}
	for _, row := range rows {
		out = append(out, Story{
			ID:        row.ID,
			AuthorID:  row.AuthorID,
			MediaURL:  row.MediaUrl,
			Caption:   deref(row.Caption),
			CreatedAt: row.CreatedAt.Time,
			ExpiresAt: row.ExpiresAt.Time,
		})
		if _, ok := authors[row.AuthorID]; !ok {
			authors[row.AuthorID] = Author{
				ID:          row.AuthorID,
				DisplayName: deref(row.AuthorName),
				AvatarURL:   deref(row.AuthorAvatar),
			}
		}
	}
	return out, authors, nil
}

func ptr(s string) *string {
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
