// 코치 코멘트·담당 회원 점검 RPC(SPEC-050 P4) — 계약 ↔ 도메인 번역만. 판단은 comments.go.
package coaching

import (
	"context"

	"connectrpc.com/connect"

	coachingv1 "github.com/JWK-company/liftgram/src/backend/gen/coaching/v1"
)

func commentPB(c Comment) *coachingv1.CoachComment {
	return &coachingv1.CoachComment{
		Id: c.ID, WorkoutId: c.WorkoutID, MemberId: c.MemberID, TrainerId: c.TrainerID,
		TrainerName: c.TrainerName, Body: c.Body, CreatedAt: c.CreatedAt.UnixMilli(), CanHide: c.CanHide,
	}
}

func (h *Handler) AddCoachComment(ctx context.Context, req *connect.Request[coachingv1.AddCoachCommentRequest]) (*connect.Response[coachingv1.AddCoachCommentResponse], error) {
	m := req.Msg
	c, err := h.svc.AddComment(ctx, viewer(ctx), m.GetMemberId(), m.GetWorkoutId(), m.GetBody())
	if err != nil {
		return nil, err
	}
	return noStore(connect.NewResponse(&coachingv1.AddCoachCommentResponse{Comment: commentPB(c)})), nil
}

func (h *Handler) ListCoachComments(ctx context.Context, req *connect.Request[coachingv1.ListCoachCommentsRequest]) (*connect.Response[coachingv1.ListCoachCommentsResponse], error) {
	rows, err := h.svc.ListComments(ctx, viewer(ctx), req.Msg.GetMemberId(), req.Msg.GetWorkoutId())
	if err != nil {
		return nil, err
	}
	out := make([]*coachingv1.CoachComment, 0, len(rows))
	for _, c := range rows {
		out = append(out, commentPB(c))
	}
	return noStore(connect.NewResponse(&coachingv1.ListCoachCommentsResponse{Comments: out})), nil
}

func (h *Handler) HideCoachComment(ctx context.Context, req *connect.Request[coachingv1.HideCoachCommentRequest]) (*connect.Response[coachingv1.HideCoachCommentResponse], error) {
	if err := h.svc.HideComment(ctx, viewer(ctx), req.Msg.GetId()); err != nil {
		return nil, err
	}
	return noStore(connect.NewResponse(&coachingv1.HideCoachCommentResponse{})), nil
}

func (h *Handler) ListMemberDigest(ctx context.Context, req *connect.Request[coachingv1.ListMemberDigestRequest]) (*connect.Response[coachingv1.ListMemberDigestResponse], error) {
	rows, truncated, err := h.svc.ListMemberDigest(ctx, viewer(ctx), req.Msg.GetWeekStart())
	if err != nil {
		return nil, err
	}
	out := make([]*coachingv1.MemberDigest, 0, len(rows))
	for _, d := range rows {
		var last int64
		if !d.LastWorkoutAt.IsZero() {
			last = d.LastWorkoutAt.UnixMilli()
		}
		out = append(out, &coachingv1.MemberDigest{
			MemberId: d.MemberID, LogView: d.LogView, WeekWorkouts: int32(d.WeekWorkouts),
			LastWorkoutAt: last, WeekCoachRoutineWorkouts: int32(d.WeekCoachWorkouts),
		})
	}
	return noStore(connect.NewResponse(&coachingv1.ListMemberDigestResponse{Members: out, Truncated: truncated})), nil
}
