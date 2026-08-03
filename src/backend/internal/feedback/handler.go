// @plm SRS-006  개발 피드백 RPC
//
// 분류·상태의 enum ↔ 문자열 변환이 여기 있다. 도메인은 문자열로 생각하고(마커에 그대로 실린다),
// 계약은 enum으로 말한다.
//
// **모르는 상태는 UNSPECIFIED로 두되 원문을 함께 싣는다** — 보드가 새 상태를 추가해도
// 화면이 빈칸을 보이지 않는다.
package feedback

import (
	"context"

	"connectrpc.com/connect"

	feedbackv1 "github.com/JWK-company/liftgram/src/backend/gen/feedback/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/feedback/v1/feedbackv1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

type Handler struct {
	feedbackv1connect.UnimplementedFeedbackServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func who(ctx context.Context) (string, string) {
	id, _ := auth.UserIDFrom(ctx)
	role, _ := auth.RoleFrom(ctx)
	return id, role
}

func (h *Handler) Submit(ctx context.Context, req *connect.Request[feedbackv1.SubmitRequest]) (*connect.Response[feedbackv1.SubmitResponse], error) {
	id, role := who(ctx)
	newID, err := h.svc.Submit(ctx, id, role,
		categoryName(req.Msg.GetCategory()), req.Msg.GetTitle(), req.Msg.GetDetail())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedbackv1.SubmitResponse{Id: newID}), nil
}

func (h *Handler) List(ctx context.Context, _ *connect.Request[feedbackv1.ListRequest]) (*connect.Response[feedbackv1.ListResponse], error) {
	id, role := who(ctx)
	items, err := h.svc.List(ctx, id, role)
	if err != nil {
		return nil, err
	}
	out := make([]*feedbackv1.FeedbackItem, 0, len(items))
	for _, it := range items {
		out = append(out, &feedbackv1.FeedbackItem{
			Id:           it.ID,
			Category:     categoryEnum(it.Category),
			Title:        it.Title,
			Detail:       it.Detail,
			State:        stateEnum(it.State),
			StateRaw:     it.State,
			Mine:         it.Mine,
			PromotedCode: it.PromotedCode,
		})
	}
	return connect.NewResponse(&feedbackv1.ListResponse{Items: out}), nil
}

// ── enum ↔ 문자열 ────────────────────────────────────────────────────────────

func categoryName(c feedbackv1.FeedbackCategory) string {
	switch c {
	case feedbackv1.FeedbackCategory_FEEDBACK_CATEGORY_BUG:
		return "bug"
	case feedbackv1.FeedbackCategory_FEEDBACK_CATEGORY_IMPROVEMENT:
		return "improvement"
	}
	return ""
}

func categoryEnum(name string) feedbackv1.FeedbackCategory {
	switch name {
	case "bug":
		return feedbackv1.FeedbackCategory_FEEDBACK_CATEGORY_BUG
	case "improvement":
		return feedbackv1.FeedbackCategory_FEEDBACK_CATEGORY_IMPROVEMENT
	}
	return feedbackv1.FeedbackCategory_FEEDBACK_CATEGORY_UNSPECIFIED
}

// 보드의 상태 어휘 → 우리 enum. `adopted_pending_promotion`·`deferred`처럼
// 사람에게는 같은 뜻인 값들을 한 칸으로 모은다.
var stateNames = map[string]feedbackv1.FeedbackState{
	"submitted":                 feedbackv1.FeedbackState_FEEDBACK_STATE_SUBMITTED,
	"discussion":                feedbackv1.FeedbackState_FEEDBACK_STATE_DISCUSSION,
	"voting":                    feedbackv1.FeedbackState_FEEDBACK_STATE_VOTING,
	"adopted":                   feedbackv1.FeedbackState_FEEDBACK_STATE_ADOPTED,
	"adopted_pending_promotion": feedbackv1.FeedbackState_FEEDBACK_STATE_ADOPTED,
	"rejected":                  feedbackv1.FeedbackState_FEEDBACK_STATE_REJECTED,
	"hold":                      feedbackv1.FeedbackState_FEEDBACK_STATE_HOLD,
	"deferred":                  feedbackv1.FeedbackState_FEEDBACK_STATE_HOLD,
}

func stateEnum(name string) feedbackv1.FeedbackState { return stateNames[name] }
