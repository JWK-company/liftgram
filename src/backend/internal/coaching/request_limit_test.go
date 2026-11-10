// 코칭 요청 분당 상한(SPEC-052 · REV-106 S3) — RequestCoaching 핸들러가 실제로 상한을 부르는가 · 초대 코드와 통이 따로인가
package coaching

import (
	"context"
	"testing"

	"connectrpc.com/connect"

	coachingv1 "github.com/JWK-company/liftgram/src/backend/gen/coaching/v1"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

func TestHandler_코칭_요청은_분당_상한에_걸리고_초대_코드_통은_따로(t *testing.T) {
	repo := newRepo()
	h := NewHandler(newSvc(repo))
	h.invite = newInviteGuard(InviteLimits{PerMinute: 1})
	ctx := context.Background()

	request := func() error {
		req := connect.NewRequest(&coachingv1.RequestCoachingRequest{TrainerId: "t1"})
		req.Header().Set("X-Forwarded-For", "203.0.113.7")
		_, err := h.RequestCoaching(ctx, req)
		return err
	}
	if err := request(); err != nil && codeOf(t, err) == errs.ResourceExhausted {
		t.Fatal("첫 요청은 상한 안이다")
	}
	if err := request(); err == nil || codeOf(t, err) != errs.ResourceExhausted {
		t.Fatalf("둘째 요청은 분당 상한에 걸린다: %v", err)
	}
	// 초대 코드 통은 따로 — 요청을 많이 보냈어도 코드 확인은 상한에 걸리지 않는다
	req := connect.NewRequest(&coachingv1.GetInviteRequest{Code: "ABCD2345"})
	req.Header().Set("X-Forwarded-For", "203.0.113.7")
	if _, err := h.GetInvite(ctx, req); err != nil && codeOf(t, err) == errs.ResourceExhausted {
		t.Fatal("초대 코드 통은 요청 통과 따로다")
	}
}
