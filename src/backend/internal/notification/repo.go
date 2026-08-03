// @plm SRS-020  알림 저장소
package notification

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
)

type pgRepo struct {
	q *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) Repo {
	return &pgRepo{q: sqlcgen.New(pool)}
}

func (r *pgRepo) Create(ctx context.Context, id, userID string, kind Kind, actorID, postID string) error {
	var post *string
	if postID != "" {
		post = &postID
	}
	return r.q.CreateNotification(ctx, sqlcgen.CreateNotificationParams{
		ID:      id,
		UserID:  userID,
		Kind:    string(kind),
		ActorID: actorID,
		PostID:  post,
	})
}

func (r *pgRepo) List(ctx context.Context, viewerID string, limit int32) ([]Notification, error) {
	rows, err := r.q.ListNotifications(ctx, sqlcgen.ListNotificationsParams{ViewerID: viewerID, Lim: limit})
	if err != nil {
		return nil, err
	}
	out := make([]Notification, 0, len(rows))
	for _, n := range rows {
		out = append(out, Notification{
			ID:        n.ID,
			Kind:      Kind(n.Kind),
			Actor:     Actor{ID: n.ActorID, DisplayName: deref(n.ActorName), AvatarURL: deref(n.ActorAvatar)},
			PostID:    deref(n.PostID),
			Read:      n.ReadAt.Valid,
			CreatedAt: n.CreatedAt.Time,
		})
	}
	return out, nil
}

func (r *pgRepo) CountUnread(ctx context.Context, viewerID string) (int32, error) {
	return r.q.CountUnreadNotifications(ctx, viewerID)
}

func (r *pgRepo) MarkAllRead(ctx context.Context, viewerID string) error {
	return r.q.MarkAllNotificationsRead(ctx, viewerID)
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
