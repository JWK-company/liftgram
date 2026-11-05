package access

import (
	"context"
	"errors"
	"testing"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type fakeRoles struct {
	role string
	ok   bool
	err  error
}

func (f fakeRoles) UserRole(context.Context, string) (string, bool, error) {
	return f.role, f.ok, f.err
}

func code(t *testing.T, err error) errs.Code {
	t.Helper()
	var d *errs.DomainError
	if !errors.As(err, &d) {
		t.Fatalf("도메인 오류가 아니다: %v", err)
	}
	return d.Code
}

func TestRequire(t *testing.T) {
	ctx := context.Background()
	if c := code(t, Require(ctx, fakeRoles{}, "", "admin", "admin")); c != errs.Unauthorized {
		t.Fatalf("신원이 없으면 401: %v", c)
	}
	if c := code(t, Require(ctx, fakeRoles{role: "admin", ok: true}, "u", "user", "admin")); c != errs.Forbidden {
		t.Fatalf("토큰 역할이 아니면 403: %v", c)
	}
	// 회수: 토큰은 아직 관리자지만 DB 는 아니다.
	if c := code(t, Require(ctx, fakeRoles{role: "user", ok: true}, "u", "admin", "admin")); c != errs.Forbidden {
		t.Fatalf("회수되면 바로 막힌다: %v", c)
	}
	if c := code(t, Require(ctx, fakeRoles{}, "u", "admin", "admin")); c != errs.Forbidden {
		t.Fatalf("없는 사용자는 막힌다: %v", c)
	}
	boom := errors.New("db")
	if err := Require(ctx, fakeRoles{err: boom}, "u", "admin", "admin"); !errors.Is(err, boom) {
		t.Fatalf("DB 오류는 그대로 전한다: %v", err)
	}
	if err := Require(ctx, fakeRoles{role: "admin", ok: true}, "u", "admin", "moderator", "admin"); err != nil {
		t.Fatal(err)
	}
}
