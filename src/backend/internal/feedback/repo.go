// @plm SRS-006  피드백 저장소 — 읽는 것은 제출자 이름 하나뿐이다
//
// 피드백 본문은 우리 DB에 남지 않는다(아이디어보드가 원본이다). 이 저장소가 하는 일은
// "누가 올렸는지"를 사람이 읽는 이름으로 바꾸는 것뿐이라, 새 테이블도 새 쿼리도 없다.
package feedback

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
)

type pgRepo struct {
	q *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) Repo { return &pgRepo{q: sqlcgen.New(pool)} }

// DisplayLabel은 표시 이름 → 이메일 → id 순으로 고른다. 셋 다 없을 수는 없다(id는 항상 있다).
func (r *pgRepo) DisplayLabel(ctx context.Context, userID string) (string, error) {
	u, err := r.q.GetUserByID(ctx, userID)
	if err != nil {
		return "", err
	}
	if u.DisplayName != nil && *u.DisplayName != "" {
		return *u.DisplayName, nil
	}
	if u.Email != nil && *u.Email != "" {
		return *u.Email, nil
	}
	return userID, nil
}
