// 운영 역할 판정(SPEC-032) — 운영 RPC 가 함께 쓴다.
//
// 토큰의 역할은 최대 15분 낡았다. 그래서 토큰으로 먼저 거르고 DB의 users.role 을 다시 읽는다 —
// 회수된 사람은 토큰이 살아 있어도 바로 막힌다.
//
// 로그인하지 않은 것과 권한이 없는 것은 다른 답이다. 둘 다 403 이면 화면이 토큰을 갱신해 다시 시도할 기회를 잃는다.
package access

import (
	"context"
	"slices"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// RoleReader 는 DB 의 현재 역할을 읽는다. 사용자가 없으면 ok=false.
type RoleReader interface {
	UserRole(ctx context.Context, userID string) (role string, ok bool, err error)
}

// Require 는 토큰의 역할(claim)과 DB 의 역할이 모두 allowed 안에 있어야 통과시킨다.
func Require(ctx context.Context, r RoleReader, viewerID, claim string, allowed ...string) error {
	if viewerID == "" {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if !slices.Contains(allowed, claim) {
		return errs.New(errs.Forbidden, "권한이 없습니다")
	}
	role, ok, err := r.UserRole(ctx, viewerID)
	if err != nil {
		return err
	}
	if !ok || !slices.Contains(allowed, role) {
		return errs.New(errs.Forbidden, "권한이 없습니다")
	}
	return nil
}
