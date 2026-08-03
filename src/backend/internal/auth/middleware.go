// @plm SRS-006  신원 확인 — `Authorization: Bearer <access>` 를 읽어 컨텍스트에 담는다
//
// ─────────────────────────────────────────────────────────────────────────────
// **여기서 막지 않는다.** 토큰이 없거나 틀려도 그냥 통과시키고, 신원을 컨텍스트에 담지 않을 뿐이다.
// 막는 일은 각 핸들러가 한다(로그인이 필요한 것만).
//
// 왜 그런가: 이 앱은 계정 없이도 대부분 동작한다(ADR-002). 인터셉터가 일괄로 막으면
// "누구나 볼 수 있는 것"까지 로그인을 요구하게 되고, 그건 화면 흐름과 어긋난다.
//
// 대신 로그인이 필요한 핸들러는 `UserIDFrom(ctx)`가 비면 Unauthorized를 돌려준다 —
// 판단이 각 RPC 옆에 있어서, 새 RPC를 만들 때 "이건 로그인이 필요한가"를 반드시 마주하게 된다.
// ─────────────────────────────────────────────────────────────────────────────
package auth

import (
	"context"
	"strings"

	"connectrpc.com/connect"
)

type ctxKey int

const (
	userIDKey ctxKey = iota
	roleKey
)

// Verifier는 인터셉터가 서비스에 바라는 전부다.
type Verifier interface {
	VerifyAccess(token string) (userID, role string, err error)
}

// Interceptor는 헤더의 토큰을 확인해 신원을 컨텍스트에 담는다. 실패해도 요청은 그대로 흐른다.
//
// ── 단항만 감싸면 안 된다 ───────────────────────────────────────────────────
// `connect.UnaryInterceptorFunc`는 이름 그대로 **단항 호출만** 감싼다. 스트리밍 핸들러는
// 그 인터셉터를 지나지 않아 신원이 비고, 로그인이 필요한 스트림은 전부 Unauthorized가 된다.
// (실측: DM 실시간 스트림이 늘 거절당했다. 폴링이 대신 메시지를 날라 **되는 것처럼 보였다** —
//
//	그래서 더 늦게 드러났다.) 그래서 두 갈래를 다 구현한 인터셉터로 둔다.
func Interceptor(v Verifier) connect.Interceptor {
	return &identityInterceptor{v: v}
}

type identityInterceptor struct{ v Verifier }

// 신원을 컨텍스트에 담는다 — 단항·스트리밍이 같은 판정을 쓴다.
func (i *identityInterceptor) with(ctx context.Context, header string) context.Context {
	id, role, ok := identify(i.v, header)
	if !ok {
		return ctx
	}
	ctx = context.WithValue(ctx, userIDKey, id)
	return context.WithValue(ctx, roleKey, role)
}

func (i *identityInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		return next(i.with(ctx, req.Header().Get("Authorization")), req)
	}
}

func (i *identityInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		return next(i.with(ctx, conn.RequestHeader().Get("Authorization")), conn)
	}
}

// 이 서버는 다른 서버를 부르지 않는다 — 나가는 쪽은 그대로 흘려보낸다.
func (i *identityInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func identify(v Verifier, header string) (string, string, bool) {
	// "Bearer " 접두는 대소문자를 가리지 않는다(클라이언트마다 다르게 보낸다).
	const prefix = "bearer "
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return "", "", false
	}
	id, role, err := v.VerifyAccess(strings.TrimSpace(header[len(prefix):]))
	if err != nil {
		return "", "", false
	}
	return id, role, true
}

// UserIDFrom은 확인된 사용자 id를 꺼낸다. 로그인하지 않았으면 ok=false다.
func UserIDFrom(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(userIDKey).(string)
	return id, ok && id != ""
}

// RoleFrom은 확인된 역할을 꺼낸다. 인가가 필요한 핸들러가 쓴다.
func RoleFrom(ctx context.Context) (string, bool) {
	r, ok := ctx.Value(roleKey).(string)
	return r, ok && r != ""
}
