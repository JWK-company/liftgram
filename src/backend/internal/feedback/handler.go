// @plm SRS-049  피드백 RPC. 옛 Submit·List 는 운영 피드백 고정이고, 사용자 의견은 새 RPC 로만 받는다(SPEC-032).
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
	"google.golang.org/protobuf/types/known/timestamppb"

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

// Submit 은 운영 피드백 등록이다. 옛 설치본도 이 RPC 를 부른다.
func (h *Handler) Submit(ctx context.Context, req *connect.Request[feedbackv1.SubmitRequest]) (*connect.Response[feedbackv1.SubmitResponse], error) {
	id, role := who(ctx)
	newID, err := h.svc.SubmitOps(ctx, id, role,
		categoryName(req.Msg.GetCategory()), req.Msg.GetTitle(), req.Msg.GetDetail())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedbackv1.SubmitResponse{Id: newID}), nil
}

// List 는 운영 피드백 목록이다. 사용자 의견은 여기 나오지 않는다. 새 상태는 옛 enum 으로 바꿔 내려 준다.
func (h *Handler) List(ctx context.Context, _ *connect.Request[feedbackv1.ListRequest]) (*connect.Response[feedbackv1.ListResponse], error) {
	id, role := who(ctx)
	entries, err := h.svc.ListEntries(ctx, id, role, KindOps)
	if err != nil {
		return nil, err
	}
	out := make([]*feedbackv1.FeedbackItem, 0, len(entries))
	for _, e := range entries {
		out = append(out, &feedbackv1.FeedbackItem{
			Id:       e.ID,
			Category: categoryEnum(e.Category),
			Title:    e.Title,
			Detail:   e.Body,
			State:    legacyState(e.Status),
			StateRaw: e.Status,
			Mine:     e.AuthorID == id,
		})
	}
	return connect.NewResponse(&feedbackv1.ListResponse{Items: out}), nil
}

func (h *Handler) SubmitUserFeedback(ctx context.Context, req *connect.Request[feedbackv1.SubmitUserFeedbackRequest]) (*connect.Response[feedbackv1.SubmitUserFeedbackResponse], error) {
	id, _ := who(ctx)
	newID, err := h.svc.SubmitUser(ctx, id, req.Msg.GetBody(), req.Msg.GetAppVersion(), req.Msg.GetPlatform())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedbackv1.SubmitUserFeedbackResponse{Id: newID}), nil
}

func (h *Handler) ListEntries(ctx context.Context, req *connect.Request[feedbackv1.ListEntriesRequest]) (*connect.Response[feedbackv1.ListEntriesResponse], error) {
	id, role := who(ctx)
	entries, err := h.svc.ListEntries(ctx, id, role, kindName(req.Msg.GetKind()))
	if err != nil {
		return nil, err
	}
	out := make([]*feedbackv1.FeedbackEntry, 0, len(entries))
	for _, e := range entries {
		out = append(out, entryProto(e))
	}
	return connect.NewResponse(&feedbackv1.ListEntriesResponse{Entries: out}), nil
}

func (h *Handler) SetStatus(ctx context.Context, req *connect.Request[feedbackv1.SetStatusRequest]) (*connect.Response[feedbackv1.SetStatusResponse], error) {
	id, role := who(ctx)
	e, err := h.svc.SetStatus(ctx, id, role, req.Msg.GetId(), statusName(req.Msg.GetStatus()), req.Msg.GetNote())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedbackv1.SetStatusResponse{Entry: entryProto(e)}), nil
}

func entryProto(e Entry) *feedbackv1.FeedbackEntry {
	return &feedbackv1.FeedbackEntry{
		Id:         e.ID,
		Kind:       kindEnum(e.Kind),
		Category:   categoryEnum(e.Category),
		Title:      e.Title,
		Body:       e.Body,
		Status:     statusEnum(e.Status),
		Resolution: e.Resolution,
		AuthorName: e.AuthorName,
		AppVersion: e.AppVersion,
		Platform:   e.Platform,
		CreatedAt:  timestamppb.New(e.CreatedAt),
	}
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

// [원본] 보드 경로(BoardService)를 되살릴 때 쓴다.
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

// 옛 화면이 읽는 상태. 새 상태를 빈칸으로 보이지 않게 한다(SPEC-032).
func legacyState(status string) feedbackv1.FeedbackState {
	switch status {
	case StatusNew:
		return feedbackv1.FeedbackState_FEEDBACK_STATE_SUBMITTED
	case StatusApproved, StatusDone:
		return feedbackv1.FeedbackState_FEEDBACK_STATE_ADOPTED
	case StatusInProgress:
		return feedbackv1.FeedbackState_FEEDBACK_STATE_DISCUSSION
	case StatusRejected:
		return feedbackv1.FeedbackState_FEEDBACK_STATE_REJECTED
	}
	return feedbackv1.FeedbackState_FEEDBACK_STATE_UNSPECIFIED
}

func kindName(k feedbackv1.FeedbackKind) string {
	switch k {
	case feedbackv1.FeedbackKind_FEEDBACK_KIND_OPS:
		return KindOps
	case feedbackv1.FeedbackKind_FEEDBACK_KIND_USER:
		return KindUser
	}
	return ""
}

func kindEnum(name string) feedbackv1.FeedbackKind {
	switch name {
	case KindOps:
		return feedbackv1.FeedbackKind_FEEDBACK_KIND_OPS
	case KindUser:
		return feedbackv1.FeedbackKind_FEEDBACK_KIND_USER
	}
	return feedbackv1.FeedbackKind_FEEDBACK_KIND_UNSPECIFIED
}

func statusName(st feedbackv1.FeedbackStatus) string {
	switch st {
	case feedbackv1.FeedbackStatus_FEEDBACK_STATUS_NEW:
		return StatusNew
	case feedbackv1.FeedbackStatus_FEEDBACK_STATUS_APPROVED:
		return StatusApproved
	case feedbackv1.FeedbackStatus_FEEDBACK_STATUS_REJECTED:
		return StatusRejected
	case feedbackv1.FeedbackStatus_FEEDBACK_STATUS_IN_PROGRESS:
		return StatusInProgress
	case feedbackv1.FeedbackStatus_FEEDBACK_STATUS_DONE:
		return StatusDone
	}
	return ""
}

func statusEnum(name string) feedbackv1.FeedbackStatus {
	switch name {
	case StatusNew:
		return feedbackv1.FeedbackStatus_FEEDBACK_STATUS_NEW
	case StatusApproved:
		return feedbackv1.FeedbackStatus_FEEDBACK_STATUS_APPROVED
	case StatusRejected:
		return feedbackv1.FeedbackStatus_FEEDBACK_STATUS_REJECTED
	case StatusInProgress:
		return feedbackv1.FeedbackStatus_FEEDBACK_STATUS_IN_PROGRESS
	case StatusDone:
		return feedbackv1.FeedbackStatus_FEEDBACK_STATUS_DONE
	}
	return feedbackv1.FeedbackStatus_FEEDBACK_STATUS_UNSPECIFIED
}
