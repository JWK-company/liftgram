// @plm SRS-001  도메인 오류 → Connect 코드 (단일 매퍼)
//
// 도메인은 errs.DomainError를 그냥 돌려준다. 전송 코드로 옮기는 일은 여기서만 한다 —
// 그래야 RPC·스트림·WebSocket 어디서 실패하든 같은 규칙이 적용되고,
// 응답 형식을 바꾸고 싶을 때 고칠 곳이 한 군데다.
//
// Connect는 오류 코드를 HTTP 상태로도 옮겨 준다(예: CodeNotFound → 404).
// 그래서 브라우저 쪽 코드는 평범한 HTTP 오류처럼 다뤄도 되고, gRPC 클라이언트는 코드를 본다.
package middleware

import (
	"context"
	"errors"
	"log/slog"

	"connectrpc.com/connect"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

var codeMap = map[errs.Code]connect.Code{
	errs.NotFound:   connect.CodeNotFound,
	errs.Conflict:   connect.CodeAlreadyExists,
	errs.Validation:   connect.CodeInvalidArgument,
	errs.Unauthorized: connect.CodeUnauthenticated,
	errs.Forbidden:    connect.CodePermissionDenied,
	errs.Unavailable:  connect.CodeUnavailable,
}

// ErrorInterceptor는 핸들러가 돌려준 오류를 Connect 오류로 옮긴다.
// 도메인 오류가 아니면 **내부 메시지를 밖으로 내보내지 않는다** — 로그에만 남긴다.
func ErrorInterceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			res, err := next(ctx, req)
			if err == nil {
				return res, nil
			}
			return nil, Translate(ctx, err)
		}
	}
}

// Translate는 스트림 핸들러도 쓸 수 있게 밖으로 뺀 변환 함수다.
func Translate(ctx context.Context, err error) error {
	var de *errs.DomainError
	if errors.As(err, &de) {
		code, ok := codeMap[de.Code]
		if !ok {
			code = connect.CodeInvalidArgument
		}
		return connect.NewError(code, errors.New(de.Message))
	}
	// 이미 Connect 오류면(검증 인터셉터 등) 그대로 통과시킨다.
	var ce *connect.Error
	if errors.As(err, &ce) {
		return err
	}
	slog.ErrorContext(ctx, "unhandled", "err", err.Error())
	return connect.NewError(connect.CodeInternal, errors.New("internal error"))
}
