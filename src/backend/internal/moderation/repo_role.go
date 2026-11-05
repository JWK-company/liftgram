package moderation

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// UserRole 은 DB 의 현재 역할이다(토큰의 역할은 낡을 수 있다 · SPEC-032).
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
