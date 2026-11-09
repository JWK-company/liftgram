// 코치 루틴 RPC(SPEC-050 P3b) — 계약 ↔ 도메인 번역만. 판단은 routines.go.
package coaching

import (
	"context"

	"connectrpc.com/connect"

	coachingv1 "github.com/JWK-company/liftgram/src/backend/gen/coaching/v1"
)

func sentRoutinePB(r SentRoutine) *coachingv1.SentRoutine {
	st := coachingv1.SentRoutineStatus_SENT_ROUTINE_STATUS_UNSPECIFIED
	switch r.Status {
	case RoutineActive:
		st = coachingv1.SentRoutineStatus_SENT_ROUTINE_STATUS_ACTIVE
	case RoutineEnded:
		st = coachingv1.SentRoutineStatus_SENT_ROUTINE_STATUS_ENDED
	}
	return &coachingv1.SentRoutine{
		Id: r.ID, SourceRoutineId: r.SourceRoutineID, MemberRoutineId: r.MemberRoutineID,
		Name: r.Name, Status: st, SentAt: r.SentAt.UnixMilli(), MemberId: r.MemberID,
	}
}

func (h *Handler) SendRoutine(ctx context.Context, req *connect.Request[coachingv1.SendRoutineRequest]) (*connect.Response[coachingv1.SendRoutineResponse], error) {
	m := req.Msg
	lines := make([]SendRoutineLine, 0, len(m.GetLines()))
	for _, l := range m.GetLines() {
		lines = append(lines, SendRoutineLine{
			ID: l.GetId(), ExerciseID: l.GetExerciseId(), TargetSets: int(l.GetTargetSets()),
			RepsMin: int(l.GetTargetRepsMin()), RepsMax: int(l.GetTargetRepsMax()), WeightKg: l.GetTargetWeightKg(),
			RestSeconds: int(l.GetRestSeconds()), SupersetGroup: l.GetSupersetGroup(), Note: l.GetNote(),
			SortOrder: int(l.GetSortOrder()), CardioTargetJSON: l.GetCardioTargetJson(), PrescriptionJSON: l.GetPrescriptionJson(),
		})
	}
	r, created, err := h.svc.SendRoutine(ctx, viewer(ctx), SendRoutineInput{
		MemberID: m.GetMemberId(), SourceRoutineID: m.GetSourceRoutineId(), Name: m.GetName(), Notes: m.GetNotes(), Lines: lines,
	})
	if err != nil {
		return nil, err
	}
	return noStore(connect.NewResponse(&coachingv1.SendRoutineResponse{Routine: sentRoutinePB(r), Created: created})), nil
}

func (h *Handler) ListSentRoutines(ctx context.Context, req *connect.Request[coachingv1.ListSentRoutinesRequest]) (*connect.Response[coachingv1.ListSentRoutinesResponse], error) {
	rows, err := h.svc.ListSentRoutines(ctx, viewer(ctx), req.Msg.GetMemberId())
	if err != nil {
		return nil, err
	}
	out := make([]*coachingv1.SentRoutine, 0, len(rows))
	for _, r := range rows {
		out = append(out, sentRoutinePB(r))
	}
	return noStore(connect.NewResponse(&coachingv1.ListSentRoutinesResponse{Routines: out})), nil
}
