//go:build pgtest

// SPEC-018 §7  웹 → 앱 넘기기 실 DB 시험(REV-012 시험 H-1 · 백엔드 M-1)
//
// 가짜 저장소는 「넘겨받은 세션은 최근 로그인이 아니다」를 흉내만 낸다 — 여기서 진짜 SQL(0022 · LastLoginAt ·
// CreateRefreshToken 의 COALESCE · pgRepo 의 Origin 전달 · CHECK 둘)을 본다.
//
//	TEST_ADMIN_DATABASE_URL=postgres://… go test -tags pgtest ./internal/auth/ -run PGAppContinue
package auth

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

func pgFamilyOrigins(t *testing.T, svc *Service, userID string) map[string]int {
	t.Helper()
	pool := svcPool[svc]
	rows, err := pool.Query(context.Background(),
		`SELECT origin, count(*) FROM refresh_tokens WHERE user_id = $1 AND family_id = token_hash GROUP BY origin`, userID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var o string
		var n int
		if err := rows.Scan(&o, &n); err != nil {
			t.Fatal(err)
		}
		out[o] = n
	}
	return out
}

func TestPGAppContinueOriginAndRecentLogin(t *testing.T) {
	svc, pool := pgService(t)
	svcPool[svc] = pool
	acct := Account{Repo: NewRepo(pool).(AccountRepo)}
	svc.WithAccount(acct)
	ctx := context.Background()
	u, _ := pgSignUp(t, svc)

	// 가입 계열 = login(COALESCE 기본값)
	if got := pgFamilyOrigins(t, svc, u.ID); got["login"] != 1 || got["continue"] != 0 {
		t.Fatalf("가입 계열 origin = %v", got)
	}
	// 가입을 한 시간 전으로 — 지금은 「최근 로그인」이 아니다
	if _, err := pool.Exec(ctx, `UPDATE refresh_tokens SET created_at = now() - interval '1 hour' WHERE user_id = $1`, u.ID); err != nil {
		t.Fatal(err)
	}
	before, err := acct.Repo.LastLoginAt(ctx, u.ID)
	if err != nil {
		t.Fatal(err)
	}

	// 넘기기 — purpose CHECK 가 app_continue 를 받는다 · 교환 계열은 continue
	h := &fakeHandoff{}
	if _, err := svc.CreateAppContinue(ctx, h, u.ID, s256(strings.Repeat("v", 43))); err != nil {
		t.Fatalf("CreateAppContinue: %v", err)
	}
	_, tok, created, err := svc.ExchangeLoginCode(ctx, continueCode(t, h))
	if err != nil || created {
		t.Fatalf("교환: created=%v err=%v", created, err)
	}
	if got := pgFamilyOrigins(t, svc, u.ID); got["continue"] != 1 || got["login"] != 1 {
		t.Fatalf("넘기기 뒤 계열 origin = %v", got)
	}
	after, _ := acct.Repo.LastLoginAt(ctx, u.ID)
	if !after.Equal(before) {
		t.Fatalf("넘겨받은 세션이 최근 로그인을 바꿨다: %v → %v", before, after)
	}
	// 계정 삭제·첫 비밀번호 설정이 쓰는 검사 — 다시 로그인하라고 막는다
	var de *errs.DomainError
	if err := svc.requireRecentLogin(ctx, &acct, u.ID); !errors.As(err, &de) || de.Code != errs.Forbidden || de.Message != ErrReauthRequiredMsg {
		t.Fatalf("최근 로그인 검사 = %v (reauth_required 여야)", err)
	}

	// 회전해도 넘겨받은 계열이 「최근 로그인」으로 바뀌지 않는다(REV-012 시험 M-4)
	if _, _, err := svc.Refresh(ctx, tok.RefreshToken); err != nil {
		t.Fatal(err)
	}
	if again, _ := acct.Repo.LastLoginAt(ctx, u.ID); !again.Equal(before) {
		t.Fatalf("회전 뒤 최근 로그인이 바뀌었다: %v", again)
	}

	// 사람이 다시 로그인하면 최근 로그인
	if _, _, err := svc.LogIn(ctx, u.Email, "password1"); err != nil {
		t.Fatal(err)
	}
	if now, _ := acct.Repo.LastLoginAt(ctx, u.ID); time.Since(now) > time.Minute {
		t.Fatalf("다시 로그인 뒤 최근 로그인 = %v", now)
	}
	if err := svc.requireRecentLogin(ctx, &acct, u.ID); err != nil {
		t.Fatalf("다시 로그인 뒤에도 막힘: %v", err)
	}
}

func TestPGAppContinueOriginCheck(t *testing.T) {
	svc, pool := pgService(t)
	ctx := context.Background()
	u, _ := pgSignUp(t, svc)
	_, err := pool.Exec(ctx, `INSERT INTO refresh_tokens (token_hash, user_id, expires_at, family_id, origin)
		VALUES ('h1', $1, now() + interval '1 day', 'h1', 'bogus')`, u.ID)
	if err == nil || !strings.Contains(err.Error(), "refresh_tokens_origin_check") {
		t.Fatalf("모르는 origin 이 들어갔다: %v", err)
	}
	_, err = pool.Exec(ctx, `INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at)
		VALUES ('a1', $1, 'bogus', now() + interval '1 minute')`, u.ID)
	if err == nil || !strings.Contains(err.Error(), "auth_tokens_purpose_check") {
		t.Fatalf("모르는 purpose 가 들어갔다: %v", err)
	}
}

// pgService 가 돌려준 풀을 서비스에 묶어 둔다(도우미가 풀을 따로 받지 않게).
var svcPool = map[*Service]*pgxpool.Pool{}
