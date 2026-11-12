// 이달의 리프터 RPC(SPEC-063) — 앱용 AwardService 와 운영 웹용 AwardAdminService.
// 공개용 메시지(PublicAward)에는 쿠폰 칸이 없다. 번호는 GetMyAward 의 MyAward 에만 싣는다.
package award

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	awardv1 "github.com/JWK-company/liftgram/src/backend/gen/award/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/award/v1/awardv1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

func who(ctx context.Context) (string, string) {
	id, _ := auth.UserIDFrom(ctx)
	role, _ := auth.RoleFrom(ctx)
	return id, role
}

func tsp(t *time.Time) *timestamppb.Timestamp {
	if t == nil {
		return nil
	}
	return timestamppb.New(*t)
}

func publicMsg(a Award) *awardv1.PublicAward {
	return &awardv1.PublicAward{
		Id: a.ID, Month: a.Month, Category: a.Category, Rank: int32(a.Rank), UserId: a.UserID,
		DisplayName: a.Name, AvatarUrl: a.Avatar, Reason: a.Reason, Days: int32(a.Days), Likes: int32(a.Likes),
		Hidden: !a.Public, Withdrawn: a.Public && a.UserID == "",
	}
}

func publicList(xs []Award) []*awardv1.PublicAward {
	out := make([]*awardv1.PublicAward, 0, len(xs))
	for _, a := range xs {
		out = append(out, publicMsg(Public(a)))
	}
	return out
}

func myMsg(a Award, withCode bool) *awardv1.MyAward {
	m := &awardv1.MyAward{
		Id: a.ID, Month: a.Month, Category: a.Category, Rank: int32(a.Rank), Reason: a.Reason, Public: a.Public,
		HasCoupon: a.HasCoupon, CouponItem: a.CouponItem, CouponExpires: a.CouponExpires, ClaimedAt: tsp(a.ClaimedAt),
		Days: int32(a.Days), Likes: int32(a.Likes),
	}
	if withCode {
		m.CouponCode = a.CouponCode
	}
	return m
}

// ── 앱 ───────────────────────────────────────────────────────────────────

type Handler struct {
	awardv1connect.UnimplementedAwardServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) GetMonth(ctx context.Context, req *connect.Request[awardv1.GetMonthRequest]) (*connect.Response[awardv1.GetMonthResponse], error) {
	id, _ := who(ctx)
	v, err := h.svc.GetMonth(ctx, id, req.Msg.GetMonth())
	if err != nil {
		return nil, err
	}
	reasons := v.Reasons
	if reasons == nil {
		reasons = []string{}
	}
	return connect.NewResponse(&awardv1.GetMonthResponse{
		Month: v.Month.Month, MyDays: int32(v.MyDays), SteadyThreshold: SteadyThreshold, MyLikes: int32(v.MyLikes),
		MyEligibility: &awardv1.Eligibility{Eligible: v.Eligible, Reasons: reasons},
		SeedHash:      v.Month.SeedHash, Seed: v.Month.Seed, Announced: v.Month.Status == StatusAnnounced,
		Winners: publicList(v.Winners),
	}), nil
}

func (h *Handler) ListMonths(ctx context.Context, req *connect.Request[awardv1.ListMonthsRequest]) (*connect.Response[awardv1.ListMonthsResponse], error) {
	ms, err := h.svc.ListMonths(ctx, int(req.Msg.GetLimit()))
	if err != nil {
		return nil, err
	}
	out := make([]*awardv1.AwardMonth, 0, len(ms))
	for _, m := range ms {
		out = append(out, &awardv1.AwardMonth{
			Month: m.Month.Month, SeedHash: m.Month.SeedHash, Seed: m.Month.Seed,
			AnnouncedAt: tsp(m.Month.AnnouncedAt), Winners: publicList(m.Winners),
		})
	}
	return connect.NewResponse(&awardv1.ListMonthsResponse{Months: out}), nil
}

func (h *Handler) ListMyAwards(ctx context.Context, _ *connect.Request[awardv1.ListMyAwardsRequest]) (*connect.Response[awardv1.ListMyAwardsResponse], error) {
	id, _ := who(ctx)
	aw, err := h.svc.ListMyAwards(ctx, id)
	if err != nil {
		return nil, err
	}
	out := make([]*awardv1.MyAward, 0, len(aw))
	for _, a := range aw {
		out = append(out, myMsg(a, false))
	}
	return connect.NewResponse(&awardv1.ListMyAwardsResponse{Awards: out}), nil
}

func (h *Handler) GetMyAward(ctx context.Context, req *connect.Request[awardv1.GetMyAwardRequest]) (*connect.Response[awardv1.GetMyAwardResponse], error) {
	id, _ := who(ctx)
	a, err := h.svc.GetMyAward(ctx, id, req.Msg.GetId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&awardv1.GetMyAwardResponse{Award: myMsg(a, true)}), nil
}

func (h *Handler) MarkClaimed(ctx context.Context, req *connect.Request[awardv1.MarkClaimedRequest]) (*connect.Response[awardv1.MarkClaimedResponse], error) {
	id, _ := who(ctx)
	if err := h.svc.MarkClaimed(ctx, id, req.Msg.GetId(), req.Msg.GetClaimed()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&awardv1.MarkClaimedResponse{}), nil
}

func (h *Handler) SetPublic(ctx context.Context, req *connect.Request[awardv1.SetPublicRequest]) (*connect.Response[awardv1.SetPublicResponse], error) {
	id, _ := who(ctx)
	if err := h.svc.SetPublic(ctx, id, req.Msg.GetId(), req.Msg.GetPublic()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&awardv1.SetPublicResponse{}), nil
}

func (h *Handler) GetUserBadges(ctx context.Context, req *connect.Request[awardv1.GetUserBadgesRequest]) (*connect.Response[awardv1.GetUserBadgesResponse], error) {
	id, _ := who(ctx)
	aw, err := h.svc.GetUserBadges(ctx, id, req.Msg.GetUserId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&awardv1.GetUserBadgesResponse{Badges: publicList(aw)}), nil
}

// ── 운영 ─────────────────────────────────────────────────────────────────

type AdminHandler struct {
	awardv1connect.UnimplementedAwardAdminServiceHandler
	svc *Service
}

func NewAdminHandler(svc *Service) *AdminHandler { return &AdminHandler{svc: svc} }

func candMsg(c Candidate) *awardv1.Candidate {
	reasons := c.Reasons
	if reasons == nil {
		reasons = []string{}
	}
	return &awardv1.Candidate{
		UserId: c.User.ID, DisplayName: c.User.Name, Days: int32(c.Days), Late: int32(c.Late),
		Likes: int32(c.Likes), Likers: int32(c.Likers),
		Eligibility: &awardv1.Eligibility{Eligible: c.Eligible, Reasons: reasons},
	}
}

func candList(xs []Candidate) []*awardv1.Candidate {
	out := make([]*awardv1.Candidate, 0, len(xs))
	for _, c := range xs {
		out = append(out, candMsg(c))
	}
	return out
}

func adminMsg(a Award) *awardv1.AdminAward {
	return &awardv1.AdminAward{
		Id: a.ID, Month: a.Month, Category: a.Category, Rank: int32(a.Rank), UserId: a.UserID, DisplayName: a.Name,
		Reason: a.Reason, Days: int32(a.Days), Likes: int32(a.Likes), Public: a.Public,
		CouponLast4: Last4(a.CouponCode), CouponItem: a.CouponItem, CouponExpires: a.CouponExpires,
		ClaimedAt: tsp(a.ClaimedAt), Withdrawn: a.UserID == "",
	}
}

func adminList(xs []Award) []*awardv1.AdminAward {
	out := make([]*awardv1.AdminAward, 0, len(xs))
	for _, a := range xs {
		out = append(out, adminMsg(a))
	}
	return out
}

func (h *AdminHandler) Candidates(ctx context.Context, req *connect.Request[awardv1.CandidatesRequest]) (*connect.Response[awardv1.CandidatesResponse], error) {
	id, role := who(ctx)
	b, err := h.svc.Candidates(ctx, id, role, req.Msg.GetMonth())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&awardv1.CandidatesResponse{
		Month: b.Month.Month, SeedHash: b.Month.SeedHash, Announced: b.Month.Status == StatusAnnounced,
		Confirmable: b.Confirmable, Steady: candList(b.Steady), Popular: candList(b.Popular),
	}), nil
}

func (h *AdminHandler) DrawPreview(ctx context.Context, req *connect.Request[awardv1.DrawPreviewRequest]) (*connect.Response[awardv1.DrawPreviewResponse], error) {
	id, role := who(ctx)
	picked, pool, err := h.svc.DrawPreview(ctx, id, role, req.Msg.GetMonth(), req.Msg.GetExcludeIds())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&awardv1.DrawPreviewResponse{Picked: candList(picked), Pool: int32(pool)}), nil
}

func (h *AdminHandler) Confirm(ctx context.Context, req *connect.Request[awardv1.ConfirmRequest]) (*connect.Response[awardv1.ConfirmResponse], error) {
	id, role := who(ctx)
	aw, already, err := h.svc.Confirm(ctx, id, role, ConfirmInput{
		Month: req.Msg.GetMonth(), PopularID: req.Msg.GetPopularUserId(),
		PickID: req.Msg.GetPickUserId(), PickReason: req.Msg.GetPickReason(),
	})
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&awardv1.ConfirmResponse{AlreadyConfirmed: already, Awards: adminList(aw)}), nil
}

func (h *AdminHandler) ListAwards(ctx context.Context, req *connect.Request[awardv1.ListAwardsRequest]) (*connect.Response[awardv1.ListAwardsResponse], error) {
	id, role := who(ctx)
	m, aw, err := h.svc.ListAwards(ctx, id, role, req.Msg.GetMonth())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&awardv1.ListAwardsResponse{
		Month: m.Month, Announced: m.Status == StatusAnnounced, Seed: m.Seed, Awards: adminList(aw),
	}), nil
}

func (h *AdminHandler) SetCoupon(ctx context.Context, req *connect.Request[awardv1.SetCouponRequest]) (*connect.Response[awardv1.SetCouponResponse], error) {
	id, role := who(ctx)
	if err := h.svc.SetCoupon(ctx, id, role, req.Msg.GetAwardId(), req.Msg.GetCouponCode(),
		req.Msg.GetCouponItem(), req.Msg.GetCouponExpires()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&awardv1.SetCouponResponse{}), nil
}

func (h *AdminHandler) SearchAwardUsers(ctx context.Context, req *connect.Request[awardv1.SearchAwardUsersRequest]) (*connect.Response[awardv1.SearchAwardUsersResponse], error) {
	id, role := who(ctx)
	us, err := h.svc.SearchUsers(ctx, id, role, req.Msg.GetQuery(), req.Msg.GetMonth())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&awardv1.SearchAwardUsersResponse{Users: candList(us)}), nil
}
