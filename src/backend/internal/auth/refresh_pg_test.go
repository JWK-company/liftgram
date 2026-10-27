//go:build pgtest

// @plm SRS-083  세션 갱신 실 DB 테스트 — SQL 의미·동시성·잠금(/qa code M-4·H-3)
//
// fakeRepo 는 SQL 의미를 손으로 흉내 낸다. 여기서는 진짜 Postgres 에 마이그레이션을 올리고 고루틴으로 경합을 만든다.
//
//	TEST_ADMIN_DATABASE_URL=postgres://user:pw@127.0.0.1:5434/postgres?sslmode=disable \
//	  go test -tags pgtest -race ./internal/auth/ -run PG
//
// 테스트마다 임시 DB 를 만들고 지운다. 환경변수가 없으면 건너뛴다.
package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db"
)

func pgService(t *testing.T) (*Service, *pgxpool.Pool) {
	t.Helper()
	admin := os.Getenv("TEST_ADMIN_DATABASE_URL")
	if admin == "" {
		t.Skip("TEST_ADMIN_DATABASE_URL 없음 — 실 DB 테스트 건너뜀")
	}
	ctx := context.Background()
	ap, err := pgxpool.New(ctx, admin)
	if err != nil {
		t.Fatal(err)
	}
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	name := "liftgram_rt_" + hex.EncodeToString(b)
	if _, err := ap.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		t.Fatal(err)
	}
	u, _ := url.Parse(admin)
	u.Path = "/" + name
	pool, err := pgxpool.New(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		_, _ = ap.Exec(context.Background(), "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
		ap.Close()
	})
	if _, _, err := db.Migrate(ctx, pool, "../../../database/migrations"); err != nil {
		t.Fatal(err)
	}
	return NewService(NewRepo(pool), NewHMACSigner("test-secret-0123456789abcdefghijkl")), pool
}

func pgSignUp(t *testing.T, svc *Service) (User, Tokens) {
	t.Helper()
	u, tok, err := svc.SignUp(context.Background(), fmt.Sprintf("%s@x.test", uuid.NewString()[:8]), "password1", "")
	if err != nil {
		t.Fatal(err)
	}
	return u, tok
}

func pgLive(t *testing.T, pool *pgxpool.Pool, userID string) int {
	t.Helper()
	var n int
	if err := pool.QueryRow(context.Background(),
		`SELECT count(*) FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()`, userID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// 같은 쿠키로 여러 문서가 동시에 갱신한다 — 모두 성공하고, 살아 있는 토큰은 하나다.
func TestPGConcurrentSameTokenKeepsOneLive(t *testing.T) {
	svc, pool := pgService(t)
	u, t0 := pgSignUp(t, svc)
	var wg sync.WaitGroup
	errsCh := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _, err := svc.Refresh(context.Background(), t0.RefreshToken)
			errsCh <- err
		}()
	}
	wg.Wait()
	close(errsCh)
	for err := range errsCh {
		if err != nil {
			t.Fatalf("동시 갱신 하나가 실패했다: %v", err)
		}
	}
	if n := pgLive(t, pool, u.ID); n != 1 {
		t.Fatalf("살아 있는 토큰 %d개(1이어야)", n)
	}
}

// 회전된 토큰으로 갱신을 퍼붓는 중에 전체 폐기가 끼어들어도, 끝나고 나면 살아 있는 토큰이 없다(H-3).
func TestPGRevokeAllDuringRefreshStormLeavesNothing(t *testing.T) {
	svc, pool := pgService(t)
	acct := Account{Repo: NewRepo(pool).(AccountRepo)}
	svc.WithAccount(acct)
	u, t0 := pgSignUp(t, svc)
	if _, _, err := svc.Refresh(context.Background(), t0.RefreshToken); err != nil {
		t.Fatal(err)
	}
	stop := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
					_, _, _ = svc.Refresh(context.Background(), t0.RefreshToken)
				}
			}
		}()
	}
	time.Sleep(150 * time.Millisecond)
	if err := acct.Repo.RevokeAllRefreshTokens(context.Background(), u.ID); err != nil {
		t.Fatal(err)
	}
	time.Sleep(150 * time.Millisecond)
	close(stop)
	wg.Wait()
	if n := pgLive(t, pool, u.ID); n != 0 {
		t.Fatalf("전체 폐기 뒤 살아남은 토큰 %d개", n)
	}
}

// 로그아웃도 같다 — 갱신 폭주와 섞여도 계열에 살아 있는 토큰이 남지 않는다.
func TestPGLogOutDuringRefreshStormLeavesNothing(t *testing.T) {
	svc, pool := pgService(t)
	u, t0 := pgSignUp(t, svc)
	_, t1, err := svc.Refresh(context.Background(), t0.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	stop := make(chan struct{})
	var wg sync.WaitGroup
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-stop:
					return
				default:
					_, _, _ = svc.Refresh(context.Background(), t0.RefreshToken)
				}
			}
		}()
	}
	time.Sleep(150 * time.Millisecond)
	if err := svc.LogOut(context.Background(), t1.RefreshToken); err != nil {
		t.Fatal(err)
	}
	time.Sleep(150 * time.Millisecond)
	close(stop)
	wg.Wait()
	if n := pgLive(t, pool, u.ID); n != 0 {
		t.Fatalf("로그아웃 뒤 살아남은 토큰 %d개", n)
	}
}

// SQL 의미 — 재사용 탐지가 실 DB 에서도 계열을 끊고, 만료된 토큰은 살아 있는 것으로 치지 않는다.
func TestPGReuseDetectionAndExpiry(t *testing.T) {
	svc, pool := pgService(t)
	ctx := context.Background()
	u, t0 := pgSignUp(t, svc)
	_, t1, err := svc.Refresh(ctx, t0.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	_, t2, err := svc.Refresh(ctx, t1.RefreshToken) // t1 이 쓰였다 → t0 의 후계는 이미 사용됨
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Refresh(ctx, t0.RefreshToken); err == nil {
		t.Fatal("후계가 이미 쓰인 옛 토큰이 통했다")
	}
	if _, _, err := svc.Refresh(ctx, t2.RefreshToken); err == nil {
		t.Fatal("재사용 탐지 뒤 살아 있던 토큰이 통했다")
	}
	if n := pgLive(t, pool, u.ID); n != 0 {
		t.Fatalf("재사용 탐지 뒤 살아 있는 토큰 %d개", n)
	}
	var reason string
	if err := pool.QueryRow(ctx, `SELECT revoke_reason FROM refresh_tokens WHERE token_hash = $1`, hashToken(t2.RefreshToken)).Scan(&reason); err != nil {
		t.Fatal(err)
	}
	if reason != revokeReuse {
		t.Fatalf("사유 %q (reuse 여야)", reason)
	}
	// 만료 — 살아 있는 토큰을 과거로 돌리면 갱신이 거절된다.
	_, t3, err := svc.LogIn(ctx, u.Email, "password1")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE refresh_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1`, hashToken(t3.RefreshToken)); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Refresh(ctx, t3.RefreshToken); err == nil {
		t.Fatal("만료된 토큰이 통했다")
	}
}
