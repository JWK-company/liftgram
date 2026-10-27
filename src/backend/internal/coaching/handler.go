// @plm SRS-048  코칭 RPC
//
// 계약과 도메인 사이의 번역만 한다. 판단은 전부 service.go에 있다.
//
// RIR은 계약에서 `int32`인데 도메인에서는 **없을 수도 있는 값**(`*int`)이다.
// proto3에는 "값 없음"이 없어서 **-1을 미지정**으로 약속했다 — 그 약속을 지키는 곳이 여기다.
package coaching

import (
	"context"
	"net/http"

	"connectrpc.com/connect"

	coachingv1 "github.com/JWK-company/liftgram/src/backend/gen/coaching/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/coaching/v1/coachingv1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

// 미지정 RIR. proto3에 "값 없음"이 없어 정한 약속이다(0은 "실패까지"라는 뜻이라 쓸 수 없다).
const rirUnset int32 = -1

type Handler struct {
	coachingv1connect.UnimplementedCoachingServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func viewer(ctx context.Context) string {
	id, _ := auth.UserIDFrom(ctx)
	return id
}

func (h *Handler) SearchTrainers(ctx context.Context, req *connect.Request[coachingv1.SearchTrainersRequest]) (*connect.Response[coachingv1.SearchTrainersResponse], error) {
	peers, err := h.svc.SearchTrainers(ctx, viewer(ctx), req.Msg.GetQuery())
	if err != nil {
		return nil, err
	}
	out := make([]*coachingv1.Peer, 0, len(peers))
	for _, p := range peers {
		out = append(out, peerPB(p))
	}
	return connect.NewResponse(&coachingv1.SearchTrainersResponse{Peers: out}), nil
}

func (h *Handler) RequestCoaching(ctx context.Context, req *connect.Request[coachingv1.RequestCoachingRequest]) (*connect.Response[coachingv1.RequestCoachingResponse], error) {
	g, err := h.svc.Request(ctx, viewer(ctx), req.Msg.GetTrainerId(), req.Msg.GetMemberId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&coachingv1.RequestCoachingResponse{Grant: grantPB(g)}), nil
}

func (h *Handler) ListGrants(ctx context.Context, _ *connect.Request[coachingv1.ListGrantsRequest]) (*connect.Response[coachingv1.ListGrantsResponse], error) {
	grants, err := h.svc.ListGrants(ctx, viewer(ctx))
	if err != nil {
		return nil, err
	}
	out := make([]*coachingv1.Grant, 0, len(grants))
	for _, g := range grants {
		out = append(out, grantPB(g))
	}
	return connect.NewResponse(&coachingv1.ListGrantsResponse{Grants: out}), nil
}

func (h *Handler) AcceptGrant(ctx context.Context, req *connect.Request[coachingv1.AcceptGrantRequest]) (*connect.Response[coachingv1.AcceptGrantResponse], error) {
	g, err := h.svc.Accept(ctx, viewer(ctx), req.Msg.GetGrantId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&coachingv1.AcceptGrantResponse{Grant: grantPB(g)}), nil
}

func (h *Handler) RevokeGrant(ctx context.Context, req *connect.Request[coachingv1.RevokeGrantRequest]) (*connect.Response[coachingv1.RevokeGrantResponse], error) {
	g, err := h.svc.Revoke(ctx, viewer(ctx), req.Msg.GetGrantId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&coachingv1.RevokeGrantResponse{Grant: grantPB(g)}), nil
}

func (h *Handler) GetMemberReport(ctx context.Context, req *connect.Request[coachingv1.GetMemberReportRequest]) (*connect.Response[coachingv1.GetMemberReportResponse], error) {
	r, err := h.svc.GetMemberReport(ctx, viewer(ctx), req.Msg.GetMemberId())
	if err != nil {
		return nil, err
	}
	volumes := make([]*coachingv1.MuscleVolume, 0, len(r.MuscleVolume))
	for _, m := range r.MuscleVolume {
		volumes = append(volumes, &coachingv1.MuscleVolume{Muscle: m.Muscle, VolumeKg: m.VolumeKg})
	}
	sessions := make([]*coachingv1.SessionSummary, 0, len(r.RecentSessions))
	for _, s := range r.RecentSessions {
		sessions = append(sessions, &coachingv1.SessionSummary{
			Name: s.Name, StartedAt: s.StartedAt.UnixMilli(),
			DurationSeconds: int32(s.DurationSeconds), TotalVolumeKg: s.TotalVolumeKg,
			PrCount: int32(s.PRCount),
		})
	}
	return connect.NewResponse(&coachingv1.GetMemberReportResponse{
		Report: &coachingv1.MemberReport{
			Weeks: int32(r.Weeks), SessionsCount: int32(r.SessionsCount),
			SessionsPerWeek: r.SessionsPerWeek, TotalVolumeKg: r.TotalVolumeKg,
			MuscleVolume: volumes, RecentSessions: sessions,
		},
	}), nil
}

func (h *Handler) ListMemberRoutines(ctx context.Context, req *connect.Request[coachingv1.ListMemberRoutinesRequest]) (*connect.Response[coachingv1.ListMemberRoutinesResponse], error) {
	routines, err := h.svc.ListMemberRoutines(ctx, viewer(ctx), req.Msg.GetMemberId())
	if err != nil {
		return nil, err
	}
	out := make([]*coachingv1.Routine, 0, len(routines))
	for _, r := range routines {
		exercises := make([]*coachingv1.RoutineExercise, 0, len(r.Exercises))
		for _, e := range r.Exercises {
			exercises = append(exercises, &coachingv1.RoutineExercise{
				Id: e.ID, ExerciseId: e.ExerciseID, ExerciseName: e.ExerciseName,
				TargetSets: int32(e.TargetSets), Prescription: prescriptionPB(e.Prescription),
			})
		}
		out = append(out, &coachingv1.Routine{Id: r.ID, Name: r.Name, Exercises: exercises})
	}
	return connect.NewResponse(&coachingv1.ListMemberRoutinesResponse{Routines: out}), nil
}

func (h *Handler) SetMemberPrescription(ctx context.Context, req *connect.Request[coachingv1.SetMemberPrescriptionRequest]) (*connect.Response[coachingv1.SetMemberPrescriptionResponse], error) {
	rx, err := h.svc.SetMemberPrescription(ctx, viewer(ctx),
		req.Msg.GetMemberId(), req.Msg.GetRoutineId(), req.Msg.GetRoutineExerciseId(),
		prescriptionDomain(req.Msg.GetPrescription()))
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&coachingv1.SetMemberPrescriptionResponse{Prescription: prescriptionPB(rx)}), nil
}

func (h *Handler) ListAudit(ctx context.Context, req *connect.Request[coachingv1.ListAuditRequest]) (*connect.Response[coachingv1.ListAuditResponse], error) {
	entries, err := h.svc.ListAudit(ctx, viewer(ctx), req.Msg.GetGrantId())
	if err != nil {
		return nil, err
	}
	out := make([]*coachingv1.AuditEntry, 0, len(entries))
	for _, e := range entries {
		out = append(out, &coachingv1.AuditEntry{
			Id: e.ID, ActorId: e.ActorID, Action: e.Action, CreatedAt: e.CreatedAt.UnixMilli(),
		})
	}
	return connect.NewResponse(&coachingv1.ListAuditResponse{Entries: out}), nil
}

// ── 계약 ↔ 도메인 ────────────────────────────────────────────────────────────

func peerPB(p Peer) *coachingv1.Peer {
	return &coachingv1.Peer{
		Id: p.ID, DisplayName: p.DisplayName, AvatarUrl: p.AvatarURL,
		ExperienceLevel: p.ExperienceLevel, TrainerIntent: p.TrainerIntent,
	}
}

func grantPB(g Grant) *coachingv1.Grant {
	out := &coachingv1.Grant{
		Id: g.ID, Status: statusPB(g.Status), RequestedBy: sidePB(g.RequestedBy),
		RoleOfMe: sidePB(g.RoleOfMe), Peer: peerPB(g.Peer),
		CreatedAt: g.CreatedAt.UnixMilli(),
	}
	// 아직 동의하지 않았으면 0 — "언제 동의했나"에 거짓 시각을 넣지 않는다.
	if !g.ConsentAt.IsZero() {
		out.ConsentAt = g.ConsentAt.UnixMilli()
	}
	return out
}

func statusPB(s string) coachingv1.GrantStatus {
	switch s {
	case StatusPending:
		return coachingv1.GrantStatus_GRANT_STATUS_PENDING
	case StatusActive:
		return coachingv1.GrantStatus_GRANT_STATUS_ACTIVE
	case StatusRevoked:
		return coachingv1.GrantStatus_GRANT_STATUS_REVOKED
	}
	return coachingv1.GrantStatus_GRANT_STATUS_UNSPECIFIED
}

func sidePB(s string) coachingv1.Side {
	switch s {
	case SideTrainer:
		return coachingv1.Side_SIDE_TRAINER
	case SideMember:
		return coachingv1.Side_SIDE_MEMBER
	}
	return coachingv1.Side_SIDE_UNSPECIFIED
}

var setTypePB = map[string]coachingv1.SetType{
	"warmup":  coachingv1.SetType_SET_TYPE_WARMUP,
	"top":     coachingv1.SetType_SET_TYPE_TOP,
	"backoff": coachingv1.SetType_SET_TYPE_BACKOFF,
	"normal":  coachingv1.SetType_SET_TYPE_NORMAL,
}
var setTypeName = map[coachingv1.SetType]string{
	coachingv1.SetType_SET_TYPE_WARMUP:  "warmup",
	coachingv1.SetType_SET_TYPE_TOP:     "top",
	coachingv1.SetType_SET_TYPE_BACKOFF: "backoff",
	coachingv1.SetType_SET_TYPE_NORMAL:  "normal",
}
var loadHintPB = map[string]coachingv1.LoadHint{
	"light":  coachingv1.LoadHint_LOAD_HINT_LIGHT,
	"medium": coachingv1.LoadHint_LOAD_HINT_MEDIUM,
	"heavy":  coachingv1.LoadHint_LOAD_HINT_HEAVY,
}
var loadHintName = map[coachingv1.LoadHint]string{
	coachingv1.LoadHint_LOAD_HINT_LIGHT:  "light",
	coachingv1.LoadHint_LOAD_HINT_MEDIUM: "medium",
	coachingv1.LoadHint_LOAD_HINT_HEAVY:  "heavy",
}

// 무게 기준(#56) @plm SRS-063
var loadBasisPB = map[string]coachingv1.LoadBasis{
	"pct1rm": coachingv1.LoadBasis_LOAD_BASIS_PCT_1RM,
	"pctTop": coachingv1.LoadBasis_LOAD_BASIS_PCT_TOP,
	"fixed":  coachingv1.LoadBasis_LOAD_BASIS_FIXED,
}
var loadBasisName = map[coachingv1.LoadBasis]string{
	coachingv1.LoadBasis_LOAD_BASIS_PCT_1RM: "pct1rm",
	coachingv1.LoadBasis_LOAD_BASIS_PCT_TOP: "pctTop",
	coachingv1.LoadBasis_LOAD_BASIS_FIXED:   "fixed",
}

func prescriptionPB(rows []PrescribedSet) []*coachingv1.PrescribedSet {
	out := make([]*coachingv1.PrescribedSet, 0, len(rows))
	for _, r := range rows {
		row := &coachingv1.PrescribedSet{
			SetType: setTypePB[r.SetType], LoadHint: loadHintPB[r.LoadHint],
			TargetRir: rirUnset,
		}
		if r.TargetRIR != nil {
			row.TargetRir = int32(*r.TargetRIR)
		}
		if r.RepMin != nil {
			row.RepMin = int32(*r.RepMin)
		}
		if r.RepMax != nil {
			row.RepMax = int32(*r.RepMax)
		}
		row.LoadBasis = loadBasisPB[r.LoadBasis]
		if r.LoadPct != nil {
			row.LoadPct = int32(*r.LoadPct)
		}
		if r.LoadKg != nil {
			row.LoadKg = *r.LoadKg
		}
		out = append(out, row)
	}
	return out
}

func prescriptionDomain(rows []*coachingv1.PrescribedSet) []PrescribedSet {
	out := make([]PrescribedSet, 0, len(rows))
	for _, r := range rows {
		row := PrescribedSet{SetType: setTypeName[r.GetSetType()], LoadHint: loadHintName[r.GetLoadHint()]}
		if r.GetTargetRir() != rirUnset {
			v := int(r.GetTargetRir())
			row.TargetRIR = &v
		}
		// 0은 "미지정"이다 — 반복 0회를 처방하는 일은 없다.
		if r.GetRepMin() > 0 {
			v := int(r.GetRepMin())
			row.RepMin = &v
		}
		if r.GetRepMax() > 0 {
			v := int(r.GetRepMax())
			row.RepMax = &v
		}
		// 무게 기준 — 미지정(0)은 기준 없음. 범위 검사는 SanitizePrescription 몫.
		row.LoadBasis = loadBasisName[r.GetLoadBasis()]
		switch row.LoadBasis {
		case "pct1rm", "pctTop":
			v := int(r.GetLoadPct())
			row.LoadPct = &v
		case "fixed":
			v := r.GetLoadKg()
			row.LoadKg = &v
		}
		out = append(out, row)
	}
	return out
}

// ── 기간 성과 요약(SRS-080) ─────────────────────────────────────────────────
// @plm SRS-080
//
// 넷 다 응답에 `Cache-Control: no-store`를 붙인다(S-20) — 회원 기록이 브라우저·중간 캐시에 남지 않게.
// (계약에 NO_SIDE_EFFECTS 를 달지 않았으므로 connect-web 은 POST 로 부른다.)

// ReadMaxBytes는 코칭 RPC 요청 본문 상한이다(스냅샷 64KB + 여유 · S-6). NewConnectHandler 가 이 서비스에만 건다 —
// 전역으로 걸면 sync push(최대 5000 레코드)가 막힌다.
const ReadMaxBytes = 256 << 10

// NewConnectHandler는 코칭 Connect 핸들러를 **본문 상한을 붙여** 만든다(CS-8). main.go 와 테스트가 같이 쓴다 —
// 조립하는 쪽이 상한을 빠뜨릴 수 없게(상한은 opts 뒤에 붙어 같은 옵션을 덮어쓰지 못하게 한다).
func NewConnectHandler(svc *Service, opts ...connect.HandlerOption) (string, http.Handler) {
	return coachingv1connect.NewCoachingServiceHandler(NewHandler(svc),
		append(append([]connect.HandlerOption{}, opts...), connect.WithReadMaxBytes(ReadMaxBytes))...)
}

func noStore[T any](res *connect.Response[T]) *connect.Response[T] {
	res.Header().Set("Cache-Control", "no-store")
	return res
}

func (h *Handler) SendProgressSummary(ctx context.Context, req *connect.Request[coachingv1.SendProgressSummaryRequest]) (*connect.Response[coachingv1.SendProgressSummaryResponse], error) {
	m := req.Msg
	id, err := h.svc.SendProgressSummary(ctx, viewer(ctx), SendSummaryInput{
		TrainerID: m.GetTrainerId(), PeriodStartMs: m.GetPeriodStart(), PeriodEndMs: m.GetPeriodEnd(),
		SchemaVersion: int(m.GetSchemaVersion()), SnapshotJSON: m.GetSnapshotJson(), ClientID: m.GetClientId(),
	})
	if err != nil {
		return nil, err
	}
	return noStore(connect.NewResponse(&coachingv1.SendProgressSummaryResponse{SummaryId: id})), nil
}

func (h *Handler) GetProgressSummary(ctx context.Context, req *connect.Request[coachingv1.GetProgressSummaryRequest]) (*connect.Response[coachingv1.GetProgressSummaryResponse], error) {
	s, err := h.svc.GetProgressSummary(ctx, viewer(ctx), req.Msg.GetId())
	if err != nil {
		return nil, err
	}
	return noStore(connect.NewResponse(&coachingv1.GetProgressSummaryResponse{Summary: &coachingv1.ProgressSummary{
		Id: s.ID, MemberId: s.MemberID, TrainerId: s.TrainerID,
		PeriodStart: s.PeriodStart.UnixMilli(), PeriodEnd: s.PeriodEnd.UnixMilli(),
		SchemaVersion: int32(s.SchemaVersion), SnapshotJson: string(s.Snapshot),
		CreatedAt: s.CreatedAt.UnixMilli(),
	}})), nil
}

func (h *Handler) ListSentSummaries(ctx context.Context, req *connect.Request[coachingv1.ListSentSummariesRequest]) (*connect.Response[coachingv1.ListSentSummariesResponse], error) {
	rows, next, err := h.svc.ListSentSummaries(ctx, viewer(ctx), req.Msg.GetCursor())
	if err != nil {
		return nil, err
	}
	out := make([]*coachingv1.SentSummary, 0, len(rows))
	for _, s := range rows {
		out = append(out, &coachingv1.SentSummary{
			Id: s.ID, TrainerId: s.TrainerID,
			PeriodStart: s.PeriodStart.UnixMilli(), PeriodEnd: s.PeriodEnd.UnixMilli(),
			SchemaVersion: int32(s.SchemaVersion), Delivered: s.Delivered, CreatedAt: s.CreatedAt.UnixMilli(),
		})
	}
	return noStore(connect.NewResponse(&coachingv1.ListSentSummariesResponse{Summaries: out, NextCursor: next})), nil
}

func (h *Handler) GetMemberRecords(ctx context.Context, req *connect.Request[coachingv1.GetMemberRecordsRequest]) (*connect.Response[coachingv1.GetMemberRecordsResponse], error) {
	m := req.Msg
	r, err := h.svc.GetMemberRecords(ctx, viewer(ctx), m.GetMemberId(), m.GetPeriodStart(), m.GetPeriodEnd())
	if err != nil {
		return nil, err
	}
	return noStore(connect.NewResponse(&coachingv1.GetMemberRecordsResponse{
		Workouts: r.Workouts, WorkoutExercises: r.WorkoutExercises, SetLogs: r.SetLogs, Exercises: r.Exercises,
		ServedStart: r.ServedStart.UnixMilli(), ServedEnd: r.ServedEnd.UnixMilli(),
	})), nil
}
