// @plm SRS-010  요청 로그와 요청 식별자 — 무슨 일이 있었는지 재구성할 수 있게
//
// web이 붙여 보낸 x-request-id를 그대로 잇는다 — 브라우저 요청 하나가
// frontend·backend 두 로그에서 같은 id로 보인다. 없으면 여기서 만든다.
//
// 한 줄 = JSON 하나(구조화 로그) — 수집기가 파싱할 수 있고 grep으로도 읽힌다.
package middleware

import (
	"context"
	"log/slog"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
)

type ctxKey string

const requestIDKey ctxKey = "request-id"

// RequestID는 컨텍스트에서 요청 식별자를 꺼낸다(로그·오류 보고에서 쓴다).
func RequestID(ctx context.Context) string {
	if v, ok := ctx.Value(requestIDKey).(string); ok {
		return v
	}
	return ""
}

func RequestLogInterceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			started := time.Now()
			id := req.Header().Get("X-Request-Id")
			if id == "" {
				id = uuid.NewString()
			}
			ctx = context.WithValue(ctx, requestIDKey, id)

			res, err := next(ctx, req)

			level := slog.LevelInfo
			code := "ok"
			if err != nil {
				// 오류의 **최종 코드**로 기록한다 — 변환 전 값을 쓰면 검증 실패까지 internal로 남는다.
				translated := Translate(ctx, err)
				code = connect.CodeOf(translated).String()
				if connect.CodeOf(translated) == connect.CodeInternal {
					level = slog.LevelError
				} else {
					level = slog.LevelWarn
				}
			}
			slog.Log(ctx, level, "request",
				"svc", "api",
				"requestId", id,
				"procedure", req.Spec().Procedure,
				"code", code,
				"ms", time.Since(started).Milliseconds(),
			)
			if res != nil {
				res.Header().Set("X-Request-Id", id)
			}
			return res, err
		}
	}
}
