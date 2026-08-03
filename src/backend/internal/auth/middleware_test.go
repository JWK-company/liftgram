// @plm SRS-006  신원 인터셉터 테스트 — **단항과 스트리밍이 같은 신원을 본다**
//
// 이 파일이 있는 이유: 인터셉터가 단항만 감싸고 있었고, 그래서 로그인이 필요한 **스트리밍**은
// 늘 거절당했다. 실시간 DM이 폴링에 가려 되는 것처럼 보여 한참 뒤에야 드러났다 —
// 그 회귀를 여기서 못박는다.
package auth

import (
	"context"
	"errors"
	"net/http"
	"testing"

	"connectrpc.com/connect"
)

type stubVerifier struct{}

func (stubVerifier) VerifyAccess(token string) (string, string, error) {
	if token != "good" {
		return "", "", errors.New("nope")
	}
	return "user-1", "user", nil
}

// 스트리밍 핸들러가 실제로 받는 conn 자리 — 헤더만 있으면 된다.
type stubStreamConn struct {
	connect.StreamingHandlerConn
	header http.Header
}

func (c *stubStreamConn) RequestHeader() http.Header { return c.header }

func TestInterceptorIdentifiesUnary(t *testing.T) {
	var got string
	next := connect.UnaryFunc(func(ctx context.Context, _ connect.AnyRequest) (connect.AnyResponse, error) {
		got, _ = UserIDFrom(ctx)
		return nil, nil
	})
	req := connect.NewRequest(&struct{}{})
	req.Header().Set("Authorization", "Bearer good")

	if _, err := Interceptor(stubVerifier{}).WrapUnary(next)(context.Background(), req); err != nil {
		t.Fatal(err)
	}
	if got != "user-1" {
		t.Fatalf("단항에서 신원이 비었다: %q", got)
	}
}

// **스트리밍도 같아야 한다.** 이게 빠지면 로그인이 필요한 스트림이 전부 막힌다.
func TestInterceptorIdentifiesStreaming(t *testing.T) {
	var got string
	next := connect.StreamingHandlerFunc(func(ctx context.Context, _ connect.StreamingHandlerConn) error {
		got, _ = UserIDFrom(ctx)
		return nil
	})
	conn := &stubStreamConn{header: http.Header{"Authorization": []string{"Bearer good"}}}

	if err := Interceptor(stubVerifier{}).WrapStreamingHandler(next)(context.Background(), conn); err != nil {
		t.Fatal(err)
	}
	if got != "user-1" {
		t.Fatalf("스트리밍에서 신원이 비었다: %q", got)
	}
}

// 토큰이 틀려도 **막지 않는다** — 신원만 비운다(막는 일은 각 핸들러가 한다).
func TestInterceptorDoesNotBlockBadToken(t *testing.T) {
	called := false
	var got string
	next := connect.StreamingHandlerFunc(func(ctx context.Context, _ connect.StreamingHandlerConn) error {
		called = true
		got, _ = UserIDFrom(ctx)
		return nil
	})
	conn := &stubStreamConn{header: http.Header{"Authorization": []string{"Bearer 위조"}}}

	if err := Interceptor(stubVerifier{}).WrapStreamingHandler(next)(context.Background(), conn); err != nil {
		t.Fatal(err)
	}
	if !called {
		t.Fatal("인터셉터가 요청을 막았다 — 막는 일은 핸들러의 몫이다")
	}
	if got != "" {
		t.Fatalf("틀린 토큰인데 신원이 실렸다: %q", got)
	}
}

// "Bearer"의 대소문자는 클라이언트마다 다르다 — 둘 다 받는다.
func TestBearerPrefixIsCaseInsensitive(t *testing.T) {
	for _, header := range []string{"Bearer good", "bearer good", "BEARER good"} {
		if id, _, ok := identify(stubVerifier{}, header); !ok || id != "user-1" {
			t.Fatalf("이 형식을 못 읽었다: %q", header)
		}
	}
}
