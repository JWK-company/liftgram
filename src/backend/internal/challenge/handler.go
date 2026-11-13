// 그룹 챌린지 RPC(SPEC-064) + 인증 사진 읽기 HTTP(/challenge-proof/<id> · SRS-121).
package challenge

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	challengev1 "github.com/JWK-company/liftgram/src/backend/gen/challenge/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/challenge/v1/challengev1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// ReadMaxBytes — 사진 4.5MB + 여유(이 서비스에만 건다 · REV-159).
const ReadMaxBytes = MaxPhotoBytes + 64<<10

func uidOf(ctx context.Context) string {
	id, _ := auth.UserIDFrom(ctx)
	return id
}

type Handler struct {
	challengev1connect.UnimplementedChallengeServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

// NewConnectHandler 는 이 서비스에만 본문 상한을 건다.
func NewConnectHandler(svc *Service, opts ...connect.HandlerOption) (string, http.Handler) {
	return challengev1connect.NewChallengeServiceHandler(NewHandler(svc),
		append(append([]connect.HandlerOption{}, opts...), connect.WithReadMaxBytes(ReadMaxBytes))...)
}

func toDraft(r *challengev1.Rule) (Draft, error) {
	if r == nil {
		return Draft{}, errs.New(errs.Validation, "규칙이 필요해요")
	}
	d, err := ParseDay(r.GetStartsOn())
	if err != nil {
		return Draft{}, errs.New(errs.Validation, "시작일을 확인해 주세요")
	}
	return Draft{Title: r.GetTitle(), StartsOn: d, Weeks: int(r.GetWeeks()), RuleKind: r.GetRuleKind(),
		Weekdays: int(r.GetWeekdays()), MinSets: int(r.GetMinSets()), ProofMode: r.GetProofMode(),
		Penalty: r.GetPenaltyText(), PassPerWeek: int(r.GetPassPerWeek())}, nil
}

func ruleMsg(c Challenge) *challengev1.Rule {
	r := c.Rule
	return &challengev1.Rule{Title: c.Title, StartsOn: r.StartsOn.String(), Weeks: int32(r.Weeks), RuleKind: r.RuleKind,
		Weekdays: int32(r.Weekdays), MinSets: int32(r.MinSets), ProofMode: r.ProofMode, PenaltyText: c.Penalty,
		PassPerWeek: int32(r.PassPerWeek)}
}

func tsp2(t *time.Time) *timestamppb.Timestamp {
	if t == nil {
		return nil
	}
	return timestamppb.New(*t)
}

func summaryMsg(s Summary) *challengev1.Summary {
	return &challengev1.Summary{Id: s.ID, Rule: ruleMsg(s.Challenge), Status: s.Status, MemberCount: int32(s.MemberCount),
		IsOwner: s.IsOwner, MyToday: s.MyToday, LastDay: s.Rule.LastDay().String(), EndedAt: tsp2(s.EndedAt)}
}

func detailMsg(d Detail) *challengev1.Detail {
	m := &challengev1.Detail{Summary: summaryMsg(d.Summary), Week: int32(d.Week), WeekCount: int32(d.WeekCount),
		Today: d.Today.String(), MyPassesLeft: int32(d.MyPassesLeft), InviteToken: d.InviteToken}
	if d.PurgeOn != nil {
		m.PhotosPurgeOn = d.PurgeOn.String()
	}
	for _, x := range d.Members {
		m.Members = append(m.Members, &challengev1.Member{UserId: x.UserID, DisplayName: x.Name, AvatarUrl: x.Avatar,
			IsOwner: x.UserID == d.OwnerID, Left: x.LeftAt != nil})
	}
	for _, c := range d.Cells {
		m.Cells = append(m.Cells, &challengev1.Cell{UserId: c.UserID, Day: c.Day.String(), Result: c.Result, Final: c.Final,
			ProofId: c.ProofID, Web: c.Web, Suspect: c.Suspect})
	}
	for _, t := range d.Tallies {
		m.Tallies = append(m.Tallies, &challengev1.Tally{UserId: t.UserID, Done: int32(t.Done), MadeUp: int32(t.MadeUp),
			Pass: int32(t.Pass), Missed: int32(t.Missed), Debts: int32(t.Debts), DebtsPaid: int32(t.Paid)})
	}
	for _, x := range d.Debts {
		m.Debts = append(m.Debts, &challengev1.Debt{UserId: x.UserID, Day: x.Day.String(), Paid: x.PaidAt != nil})
	}
	return m
}

func proofMsg(p ProofView) *challengev1.ProofInfo {
	return &challengev1.ProofInfo{Id: p.ID, UserId: p.UserID, Day: p.Day.String(), PromptCode: p.PromptCode,
		CapturedAt: timestamppb.New(p.CapturedAt), Status: p.Status, Web: p.Source == "web", Flags: int32(p.Flags),
		FlaggedByMe: p.FlaggedByMe, Flaggable: p.Flaggable}
}

func (h *Handler) Create(ctx context.Context, req *connect.Request[challengev1.CreateRequest]) (*connect.Response[challengev1.CreateResponse], error) {
	d, err := toDraft(req.Msg.GetRule())
	if err != nil {
		return nil, err
	}
	v, err := h.svc.Create(ctx, uidOf(ctx), d)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&challengev1.CreateResponse{Detail: detailMsg(v)}), nil
}

func (h *Handler) Update(ctx context.Context, req *connect.Request[challengev1.UpdateRequest]) (*connect.Response[challengev1.UpdateResponse], error) {
	d, err := toDraft(req.Msg.GetRule())
	if err != nil {
		return nil, err
	}
	v, err := h.svc.Update(ctx, uidOf(ctx), req.Msg.GetId(), d)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&challengev1.UpdateResponse{Detail: detailMsg(v)}), nil
}

func (h *Handler) RotateInvite(ctx context.Context, req *connect.Request[challengev1.RotateInviteRequest]) (*connect.Response[challengev1.RotateInviteResponse], error) {
	t, err := h.svc.RotateInvite(ctx, uidOf(ctx), req.Msg.GetId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&challengev1.RotateInviteResponse{InviteToken: t}), nil
}

func (h *Handler) GetInviteInfo(ctx context.Context, req *connect.Request[challengev1.GetInviteInfoRequest]) (*connect.Response[challengev1.GetInviteInfoResponse], error) {
	v, err := h.svc.GetInvite(ctx, uidOf(ctx), req.Msg.GetToken())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&challengev1.GetInviteInfoResponse{Id: v.ID, Rule: ruleMsg(Challenge{Title: v.Title, Penalty: v.Penalty, Rule: v.Rule}),
		Status: v.Status, MemberCount: int32(v.MemberCount), AlreadyMember: v.AlreadyMember}), nil
}

func (h *Handler) Join(ctx context.Context, req *connect.Request[challengev1.JoinRequest]) (*connect.Response[challengev1.JoinResponse], error) {
	id, err := h.svc.Join(ctx, uidOf(ctx), req.Msg.GetToken())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&challengev1.JoinResponse{Id: id}), nil
}

func (h *Handler) Leave(ctx context.Context, req *connect.Request[challengev1.LeaveRequest]) (*connect.Response[challengev1.LeaveResponse], error) {
	if err := h.svc.Leave(ctx, uidOf(ctx), req.Msg.GetId()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&challengev1.LeaveResponse{}), nil
}

func (h *Handler) TransferOwner(ctx context.Context, req *connect.Request[challengev1.TransferOwnerRequest]) (*connect.Response[challengev1.TransferOwnerResponse], error) {
	if err := h.svc.TransferOwner(ctx, uidOf(ctx), req.Msg.GetId(), req.Msg.GetUserId()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&challengev1.TransferOwnerResponse{}), nil
}

func (h *Handler) Kick(ctx context.Context, req *connect.Request[challengev1.KickRequest]) (*connect.Response[challengev1.KickResponse], error) {
	if err := h.svc.Kick(ctx, uidOf(ctx), req.Msg.GetId(), req.Msg.GetUserId()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&challengev1.KickResponse{}), nil
}

func (h *Handler) ListMine(ctx context.Context, _ *connect.Request[challengev1.ListMineRequest]) (*connect.Response[challengev1.ListMineResponse], error) {
	xs, err := h.svc.ListMine(ctx, uidOf(ctx))
	if err != nil {
		return nil, err
	}
	out := &challengev1.ListMineResponse{}
	for _, x := range xs {
		out.Items = append(out.Items, summaryMsg(x))
	}
	return connect.NewResponse(out), nil
}

func (h *Handler) Get(ctx context.Context, req *connect.Request[challengev1.GetRequest]) (*connect.Response[challengev1.GetResponse], error) {
	var week *int
	if req.Msg.GetWeekSet() {
		w := int(req.Msg.GetWeek())
		week = &w
	}
	v, err := h.svc.Get(ctx, uidOf(ctx), req.Msg.GetId(), week)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&challengev1.GetResponse{Detail: detailMsg(v)}), nil
}

func (h *Handler) ActiveForWorkout(ctx context.Context, _ *connect.Request[challengev1.ActiveForWorkoutRequest]) (*connect.Response[challengev1.ActiveForWorkoutResponse], error) {
	xs, proved, err := h.svc.ActiveForWorkout(ctx, uidOf(ctx))
	if err != nil {
		return nil, err
	}
	out := &challengev1.ActiveForWorkoutResponse{ProvedToday: proved}
	for _, x := range xs {
		out.Items = append(out.Items, summaryMsg(x))
	}
	return connect.NewResponse(out), nil
}

func (h *Handler) IssuePrompt(ctx context.Context, req *connect.Request[challengev1.IssuePromptRequest]) (*connect.Response[challengev1.IssuePromptResponse], error) {
	p, err := h.svc.IssuePrompt(ctx, uidOf(ctx), req.Msg.GetChallengeId(), req.Msg.GetWorkoutId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&challengev1.IssuePromptResponse{PromptId: p.ID, PromptCode: p.Code,
		ExpiresAt: timestamppb.New(p.IssuedAt.Add(PromptTTL))}), nil
}

func (h *Handler) UploadProof(ctx context.Context, req *connect.Request[challengev1.UploadProofRequest]) (*connect.Response[challengev1.UploadProofResponse], error) {
	p, err := h.svc.UploadProof(ctx, uidOf(ctx), req.Msg.GetPromptId(), req.Msg.GetImage(), req.Msg.GetSource())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&challengev1.UploadProofResponse{Proof: proofMsg(ProofView{ProofRow: p, Day: DayOf(p.CapturedAt)})}), nil
}

func (h *Handler) ListProofs(ctx context.Context, req *connect.Request[challengev1.ListProofsRequest]) (*connect.Response[challengev1.ListProofsResponse], error) {
	xs, err := h.svc.ListProofs(ctx, uidOf(ctx), req.Msg.GetId(), req.Msg.GetDay(), req.Msg.GetUserId())
	if err != nil {
		return nil, err
	}
	out := &challengev1.ListProofsResponse{}
	for _, x := range xs {
		out.Items = append(out.Items, proofMsg(x))
	}
	return connect.NewResponse(out), nil
}

func (h *Handler) Flag(ctx context.Context, req *connect.Request[challengev1.FlagRequest]) (*connect.Response[challengev1.FlagResponse], error) {
	v, err := h.svc.Flag(ctx, uidOf(ctx), req.Msg.GetProofId(), req.Msg.GetOn())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&challengev1.FlagResponse{Proof: proofMsg(v)}), nil
}

func (h *Handler) MarkDebtPaid(ctx context.Context, req *connect.Request[challengev1.MarkDebtPaidRequest]) (*connect.Response[challengev1.MarkDebtPaidResponse], error) {
	d, err := ParseDay(req.Msg.GetDay())
	if err != nil {
		return nil, errs.New(errs.Validation, "날짜를 확인해 주세요")
	}
	if err := h.svc.MarkDebtPaid(ctx, uidOf(ctx), req.Msg.GetId(), req.Msg.GetUserId(), d, req.Msg.GetPaid()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&challengev1.MarkDebtPaidResponse{}), nil
}

// PhotoHandler 는 GET /challenge-proof/<proof id> 다 — Bearer 로 멤버를 확인하고 비공개 저장소에서 읽는다.
// 공개 캐시·엣지에 남지 않게 no-store(나간 멤버도 바로 404 · SRS-121). 어느 쪽이 없어도 같은 404.
func PhotoHandler(svc *Service, v auth.Verifier) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		id := strings.TrimPrefix(r.URL.Path, "/challenge-proof/")
		uid, ok := auth.IdentifyHeader(v, r.Header.Get("Authorization"))
		if id == "" || strings.Contains(id, "/") || !ok {
			http.NotFound(w, r)
			return
		}
		body, err := svc.ReadPhoto(r.Context(), uid, id)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer func() { _ = body.Close() }()
		w.Header().Set("Content-Type", "image/jpeg")
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if _, err := io.Copy(w, io.LimitReader(body, MaxPhotoBytes)); err != nil && !errors.Is(err, context.Canceled) {
			return
		}
	})
}
