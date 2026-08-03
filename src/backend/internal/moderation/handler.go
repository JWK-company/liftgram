// @plm SRS-020  모더레이션 RPC — 신원·역할을 꺼내 service에 넘긴다
//
// 역할 판정은 여기서 하지 않는다(service가 한다) — 판단이 규칙 옆에 있어야 테스트로 못박을 수 있다.
package moderation

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	moderationv1 "github.com/JWK-company/liftgram/src/backend/gen/moderation/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/moderation/v1/moderationv1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

type Handler struct {
	moderationv1connect.UnimplementedModerationServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func who(ctx context.Context) (string, string) {
	id, _ := auth.UserIDFrom(ctx)
	role, _ := auth.RoleFrom(ctx)
	return id, role
}

func (h *Handler) Report(ctx context.Context, req *connect.Request[moderationv1.ReportRequest]) (*connect.Response[moderationv1.ReportResponse], error) {
	id, _ := who(ctx)
	err := h.svc.Report(ctx, id,
		fromProtoTarget(req.Msg.GetTargetType()),
		req.Msg.GetTargetId(),
		fromProtoReason(req.Msg.GetReason()),
		req.Msg.GetDetails(),
	)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&moderationv1.ReportResponse{}), nil
}

func (h *Handler) ListQueue(ctx context.Context, req *connect.Request[moderationv1.ListQueueRequest]) (*connect.Response[moderationv1.ListQueueResponse], error) {
	id, role := who(ctx)
	items, err := h.svc.ListQueue(ctx, id, role, req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	out := make([]*moderationv1.QueueItem, 0, len(items))
	for _, it := range items {
		reasons := make([]moderationv1.Reason, 0, len(it.Reasons))
		for _, r := range it.Reasons {
			reasons = append(reasons, toProtoReason(r))
		}
		out = append(out, &moderationv1.QueueItem{
			TargetType:  toProtoTarget(it.TargetType),
			TargetId:    it.TargetID,
			Source:      it.Source,
			Reasons:     reasons,
			ReportCount: it.ReportCount,
			Author:      &moderationv1.ContentAuthor{Id: it.Author.ID, DisplayName: it.Author.DisplayName},
			Preview:     &moderationv1.Preview{Kind: it.Preview.Kind, Text: it.Preview.Text, MediaUrl: it.Preview.MediaURL},
			CreatedAt:   timestamppb.New(it.CreatedAt),
		})
	}
	return connect.NewResponse(&moderationv1.ListQueueResponse{Items: out}), nil
}

func (h *Handler) Resolve(ctx context.Context, req *connect.Request[moderationv1.ResolveRequest]) (*connect.Response[moderationv1.ResolveResponse], error) {
	id, role := who(ctx)
	remove := req.Msg.GetAction() == moderationv1.Action_ACTION_REMOVE
	if err := h.svc.Resolve(ctx, id, role, fromProtoTarget(req.Msg.GetTargetType()), req.Msg.GetTargetId(), remove, req.Msg.GetReason()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&moderationv1.ResolveResponse{}), nil
}

// ── 변환 ─────────────────────────────────────────────────────────────────────

func fromProtoTarget(t moderationv1.TargetType) TargetType {
	switch t {
	case moderationv1.TargetType_TARGET_TYPE_POST:
		return TargetPost
	case moderationv1.TargetType_TARGET_TYPE_STORY:
		return TargetStory
	case moderationv1.TargetType_TARGET_TYPE_COMMENT:
		return TargetComment
	}
	return ""
}

func toProtoTarget(t TargetType) moderationv1.TargetType {
	switch t {
	case TargetPost:
		return moderationv1.TargetType_TARGET_TYPE_POST
	case TargetStory:
		return moderationv1.TargetType_TARGET_TYPE_STORY
	case TargetComment:
		return moderationv1.TargetType_TARGET_TYPE_COMMENT
	}
	return moderationv1.TargetType_TARGET_TYPE_UNSPECIFIED
}

// 사유 이름은 DB에 문자열로 남는다(옛 서버와 같은 값) — enum은 계약의 표현일 뿐이다.
var reasonNames = map[moderationv1.Reason]string{
	moderationv1.Reason_REASON_SPAM:           "spam",
	moderationv1.Reason_REASON_NUDITY:         "nudity",
	moderationv1.Reason_REASON_HARASSMENT:     "harassment",
	moderationv1.Reason_REASON_VIOLENCE:       "violence",
	moderationv1.Reason_REASON_SELF_HARM:      "self_harm",
	moderationv1.Reason_REASON_MINOR_SAFETY:   "minor_safety",
	moderationv1.Reason_REASON_MISINFORMATION: "misinformation",
	moderationv1.Reason_REASON_OTHER:          "other",
}

func fromProtoReason(r moderationv1.Reason) string { return reasonNames[r] }

func toProtoReason(name string) moderationv1.Reason {
	for k, v := range reasonNames {
		if v == name {
			return k
		}
	}
	// 자동 스캔(auto_scan)처럼 사람이 고른 사유가 아닌 것 — 화면이 source로 구분한다.
	return moderationv1.Reason_REASON_UNSPECIFIED
}
