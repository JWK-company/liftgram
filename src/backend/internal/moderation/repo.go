// @plm SRS-020  모더레이션 저장소
//
// ── 트랜잭션을 쓰는 곳 ──────────────────────────────────────────────────────
// 처리(remove/approve) = 콘텐츠 상태 + **사진의 flagged**. 갈라지면 글은 내려갔는데 사진은
// 그대로 나가거나(제거가 반쪽), 되살렸는데 사진만 계속 막힌다.
package moderation

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
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

func (r *pgRepo) CreateReport(ctx context.Context, id string, t TargetType, targetID, reporterID, reason, details string) error {
	return r.q.CreateReport(ctx, sqlcgen.CreateReportParams{
		ID:         id,
		TargetType: string(t),
		TargetID:   targetID,
		ReporterID: reporterID,
		Reason:     reason,
		Details:    ptr(details),
	})
}

func (r *pgRepo) ListPendingReports(ctx context.Context, limit int32) ([]Report, error) {
	rows, err := r.q.ListPendingReports(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]Report, 0, len(rows))
	for _, row := range rows {
		out = append(out, Report{
			TargetType: TargetType(row.TargetType),
			TargetID:   row.TargetID,
			Reason:     row.Reason,
			CreatedAt:  row.CreatedAt.Time,
		})
	}
	return out, nil
}

func (r *pgRepo) ResolveReports(ctx context.Context, t TargetType, targetID, reviewerID, status, action string) error {
	return r.q.ResolveReportsForTarget(ctx, sqlcgen.ResolveReportsForTargetParams{
		Status:      status,
		ReviewedBy:  reviewerID,
		ActionTaken: action,
		TargetType:  string(t),
		TargetID:    targetID,
	})
}

func (r *pgRepo) GetTarget(ctx context.Context, t TargetType, targetID string) (Target, bool, error) {
	switch t {
	case TargetPost:
		row, err := r.q.GetPostForModeration(ctx, targetID)
		if errors.Is(err, pgx.ErrNoRows) {
			return Target{}, false, nil
		}
		if err != nil {
			return Target{}, false, err
		}
		return Target{
			AuthorID:         row.AuthorID,
			ModerationStatus: row.ModerationStatus,
			Author:           Author{ID: row.AuthorID, DisplayName: deref(row.AuthorName)},
			Preview:          Preview{Kind: row.Kind, Text: deref(row.Caption), MediaURL: first(row.MediaUrls)},
			CreatedAt:        row.CreatedAt.Time,
		}, true, nil

	case TargetStory:
		row, err := r.q.GetStoryForModeration(ctx, targetID)
		if errors.Is(err, pgx.ErrNoRows) {
			return Target{}, false, nil
		}
		if err != nil {
			return Target{}, false, err
		}
		return Target{
			AuthorID:         row.AuthorID,
			ModerationStatus: row.ModerationStatus,
			Author:           Author{ID: row.AuthorID, DisplayName: deref(row.AuthorName)},
			Preview:          Preview{Kind: "story", Text: deref(row.Caption), MediaURL: row.MediaUrl},
			CreatedAt:        row.CreatedAt.Time,
			ExpiresAt:        row.ExpiresAt.Time,
		}, true, nil

	case TargetComment:
		row, err := r.q.GetCommentForModeration(ctx, targetID)
		if errors.Is(err, pgx.ErrNoRows) {
			return Target{}, false, nil
		}
		if err != nil {
			return Target{}, false, err
		}
		return Target{
			AuthorID:         row.AuthorID,
			ModerationStatus: row.ModerationStatus,
			Author:           Author{ID: row.AuthorID, DisplayName: deref(row.AuthorName)},
			Preview:          Preview{Kind: "comment", Text: row.Body},
			CreatedAt:        row.CreatedAt.Time,
			PostID:           row.PostID,
		}, true, nil
	}
	return Target{}, false, nil
}

func (r *pgRepo) PostVisibility(ctx context.Context, postID string) (string, string, string, bool, error) {
	row, err := r.q.GetPostVisibility(ctx, postID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", "", false, nil
	}
	if err != nil {
		return "", "", "", false, err
	}
	return row.AuthorID, row.Visibility, row.ModerationStatus, true, nil
}

func (r *pgRepo) IsFollowing(ctx context.Context, followerID, followeeID string) (bool, error) {
	return r.q.IsFollowingSimple(ctx, sqlcgen.IsFollowingSimpleParams{
		FollowerID: followerID,
		FolloweeID: followeeID,
	})
}

func (r *pgRepo) ListAutoPending(ctx context.Context, limit int32) ([]QueueItem, error) {
	posts, err := r.q.ListPendingPosts(ctx, limit)
	if err != nil {
		return nil, err
	}
	stories, err := r.q.ListPendingStories(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]QueueItem, 0, len(posts)+len(stories))
	for _, p := range posts {
		out = append(out, QueueItem{
			TargetType: TargetPost,
			TargetID:   p.ID,
			Source:     "auto",
			Reasons:    []string{"auto_scan"},
			Author:     Author{ID: p.AuthorID, DisplayName: deref(p.AuthorName)},
			Preview:    Preview{Kind: p.Kind, Text: deref(p.Caption), MediaURL: first(p.MediaUrls)},
			CreatedAt:  p.CreatedAt.Time,
		})
	}
	for _, s := range stories {
		out = append(out, QueueItem{
			TargetType: TargetStory,
			TargetID:   s.ID,
			Source:     "auto",
			Reasons:    []string{"auto_scan"},
			Author:     Author{ID: s.AuthorID, DisplayName: deref(s.AuthorName)},
			Preview:    Preview{Kind: "story", Text: deref(s.Caption), MediaURL: s.MediaUrl},
			CreatedAt:  s.CreatedAt.Time,
		})
	}
	return out, nil
}

func (r *pgRepo) SetModeration(ctx context.Context, t TargetType, targetID, status, reason string, removed bool, mediaKey string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	switch t {
	case TargetPost:
		err = q.SetPostModeration(ctx, sqlcgen.SetPostModerationParams{Status: status, Removed: removed, Reason: reason, ID: targetID})
	case TargetStory:
		err = q.SetStoryModeration(ctx, sqlcgen.SetStoryModerationParams{Status: status, Removed: removed, Reason: reason, ID: targetID})
	case TargetComment:
		err = q.SetCommentModeration(ctx, sqlcgen.SetCommentModerationParams{Status: status, Removed: removed, ID: targetID})
	}
	if err != nil {
		return err
	}
	// 사진의 바이트까지 함께 막거나 푼다 — 같은 트랜잭션이어야 제거가 반쪽이 되지 않는다.
	if mediaKey != "" {
		if err := q.SetMediaFlagged(ctx, sqlcgen.SetMediaFlaggedParams{Flagged: removed, Key: mediaKey}); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
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

// 사진 글은 여러 장을 실을 수 있지만 미리보기는 첫 장이면 충분하다.
func first(xs []string) string {
	if len(xs) == 0 {
		return ""
	}
	return xs[0]
}
