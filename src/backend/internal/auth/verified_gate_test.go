// 미확인 계정 유예 테스트 — 72시간 안은 쓰고, 지나면 소셜 쓰기만 막히며, 확인하면 풀린다
package auth

import (
	"context"
	"testing"
	"time"
)

func TestVerifiedGate_유예_뒤_소셜_쓰기만_막는다(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _ := newAccountService(t)
	svc.acct.MailEnabled = true
	u, _, _ := svc.SignUp(ctx, "late@x.com", "password1", "")
	g := VerifiedGate(svc).(*verifiedGate)
	ctxU := context.WithValue(ctx, userIDKey, u.ID)

	if err := g.check(ctxU, "/feed.v1.FeedService/CreatePost"); err != nil {
		t.Fatalf("가입 직후(유예 안)인데 막았다: %v", err)
	}

	// 가입한 지 73시간이 지났다.
	old := repo.users[u.ID]
	old.CreatedAt = time.Now().Add(-73 * time.Hour)
	repo.users[u.ID] = old
	g.c = map[string]gateEntry{}
	if err := g.check(ctxU, "/feed.v1.FeedService/CreatePost"); codeOf(err) != "forbidden" {
		t.Fatalf("유예가 지났는데 막지 않았다: %v", err)
	}
	if err := g.check(ctxU, "/feed.v1.FeedService/ListFeed"); err != nil {
		t.Fatalf("읽기까지 막았다: %v", err)
	}

	// 확인하면 풀린다(캐시가 지나면).
	ok := repo.users[u.ID]
	ok.EmailVerified = true
	repo.users[u.ID] = ok
	g.c = map[string]gateEntry{}
	if err := g.check(ctxU, "/feed.v1.FeedService/CreatePost"); err != nil {
		t.Fatalf("확인했는데도 막았다: %v", err)
	}
}

func TestVerifiedGate_메일이_꺼져_있으면_막지_않는다(t *testing.T) {
	ctx := context.Background()
	svc, repo, _, _ := newAccountService(t)
	u, _, _ := svc.SignUp(ctx, "x@x.com", "password1", "")
	old := repo.users[u.ID]
	old.CreatedAt = time.Now().Add(-100 * time.Hour)
	repo.users[u.ID] = old
	g := VerifiedGate(svc).(*verifiedGate)
	if err := g.check(context.WithValue(ctx, userIDKey, u.ID), "/dm.v1.DmService/SendMessage"); err != nil {
		t.Fatalf("확인 메일이 갈 수 없는 환경에서 막았다: %v", err)
	}
}
