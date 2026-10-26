// @plm SRS-052  미확인 계정 유예 — 가입 72시간이 지나도록 이메일을 확인하지 않으면 **소셜에 쓰는 것**을 막는다
//
// ─────────────────────────────────────────────────────────────────────────────
// 운동 기록·읽기는 그대로 둔다(로그인 없이도 되는 것들이다). 막는 것은 남에게 보이는 글을 **새로 쓰는** 길뿐이다:
// 게시물·댓글·스토리·DM 보내기·그룹 만들기. 주소를 확인하지 않은 계정이 스팸 발신처가 되는 것을 막는 바닥이다.
//
// 확인할 주소가 없는 계정(보증하지 않는 제공자로만 가입 — 예: 네이버)은 막지 않는다. 막으면 풀 길이 없다.
// 메일이 꺼진 환경(MAIL_TRANSPORT=console)에서는 확인 메일이 갈 수 없으므로 막지 않는다.
//
// 인터셉터로 두는 이유: 각 도메인 서비스가 auth 를 import 하지 않게(레이어 경계) — 절차 이름 목록 하나로 끝난다.
// 사용자 조회는 5분 캐시한다(쓰기 요청마다 DB를 두드리지 않게). 확인을 마치면 캐시가 지나는 대로 풀린다.
// ─────────────────────────────────────────────────────────────────────────────
package auth

import (
	"context"
	"sync"
	"time"

	"connectrpc.com/connect"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// UnverifiedGrace — 가입 뒤 이 시간까지는 확인하지 않아도 쓸 수 있다.
const UnverifiedGrace = 72 * time.Hour

// GatedProcedures — 확인이 필요한 소셜 쓰기.
var GatedProcedures = map[string]bool{
	"/feed.v1.FeedService/CreatePost":    true,
	"/feed.v1.FeedService/CreateComment": true,
	"/story.v1.StoryService/CreateStory": true,
	"/dm.v1.DmService/SendMessage":       true,
	"/dm.v1.DmService/CreateGroup":       true,
}

type gateEntry struct {
	blocked bool
	at      time.Time
}

type verifiedGate struct {
	svc *Service
	mu  sync.Mutex
	c   map[string]gateEntry
}

// VerifiedGate — 미확인 계정의 소셜 쓰기를 막는 인터셉터. 신원 인터셉터(Interceptor) **뒤**에 둔다.
func VerifiedGate(svc *Service) connect.Interceptor {
	return &verifiedGate{svc: svc, c: map[string]gateEntry{}}
}

func (g *verifiedGate) blocked(ctx context.Context, userID string) bool {
	if !g.svc.MailEnabled() {
		return false
	}
	g.mu.Lock()
	e, ok := g.c[userID]
	g.mu.Unlock()
	if ok && time.Since(e.at) < 5*time.Minute {
		return e.blocked
	}
	u, err := g.svc.repo.GetUserByID(ctx, userID)
	if err != nil {
		return false // 조회 실패로 정상 사용자를 막지 않는다 — 핸들러가 자기 판단을 한다
	}
	b := u.Email != "" && !u.EmailVerified && g.svc.now().Sub(u.CreatedAt) > UnverifiedGrace
	g.mu.Lock()
	if len(g.c) > 50_000 {
		g.c = map[string]gateEntry{}
	}
	g.c[userID] = gateEntry{blocked: b, at: time.Now()}
	g.mu.Unlock()
	return b
}

func (g *verifiedGate) check(ctx context.Context, procedure string) error {
	if !GatedProcedures[procedure] {
		return nil
	}
	id, ok := UserIDFrom(ctx)
	if !ok || !g.blocked(ctx, id) {
		return nil
	}
	return errs.New(errs.Forbidden, "이메일 주소를 확인한 뒤에 글을 쓸 수 있어요. 계정 화면에서 확인 메일을 다시 받을 수 있어요")
}

func (g *verifiedGate) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		if err := g.check(ctx, req.Spec().Procedure); err != nil {
			return nil, err
		}
		return next(ctx, req)
	}
}

func (g *verifiedGate) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		if err := g.check(ctx, conn.Spec().Procedure); err != nil {
			return err
		}
		return next(ctx, conn)
	}
}

func (g *verifiedGate) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}
