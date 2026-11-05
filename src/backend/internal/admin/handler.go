// 운영자 통계 RPC(SPEC-032) — 신원을 꺼내 service 에 넘기고 집계 숫자만 싣는다.
package admin

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	adminv1 "github.com/JWK-company/liftgram/src/backend/gen/admin/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/admin/v1/adminv1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

type Handler struct {
	adminv1connect.UnimplementedAdminServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func who(ctx context.Context) (string, string) {
	id, _ := auth.UserIDFrom(ctx)
	role, _ := auth.RoleFrom(ctx)
	return id, role
}

func dailyPB(in []DailyCount) []*adminv1.DailyCount {
	out := make([]*adminv1.DailyCount, 0, len(in))
	for _, d := range in {
		out = append(out, &adminv1.DailyCount{Day: d.Day, Count: d.Count})
	}
	return out
}

func namedPB(in []NamedCount) []*adminv1.NamedCount {
	out := make([]*adminv1.NamedCount, 0, len(in))
	for _, n := range in {
		out = append(out, &adminv1.NamedCount{Name: n.Name, Count: n.Count})
	}
	return out
}

func (h *Handler) GetSignupStats(ctx context.Context, _ *connect.Request[adminv1.GetSignupStatsRequest]) (*connect.Response[adminv1.GetSignupStatsResponse], error) {
	id, role := who(ctx)
	s, err := h.svc.GetSignupStats(ctx, id, role)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&adminv1.GetSignupStatsResponse{
		GeneratedAt:        timestamppb.New(s.GeneratedAt),
		Total:              s.Total,
		Daily:              dailyPB(s.Daily),
		Providers:          namedPB(s.Providers),
		EmailVerified:      s.EmailVerified,
		StaffCount:         s.StaffCount,
		FirstWorkoutCohort: s.FirstWorkoutCohort,
		FirstWorkoutDone:   s.FirstWorkoutDone,
		Started:            s.Started,
		UsageSince:         timestamppb.New(s.UsageSince),
	}), nil
}

func (h *Handler) GetRoutineStats(ctx context.Context, _ *connect.Request[adminv1.GetRoutineStatsRequest]) (*connect.Response[adminv1.GetRoutineStatsResponse], error) {
	id, role := who(ctx)
	s, err := h.svc.GetRoutineStats(ctx, id, role)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&adminv1.GetRoutineStatsResponse{
		GeneratedAt:           timestamppb.New(s.GeneratedAt),
		Started:               s.Started,
		UsageSince:            timestamppb.New(s.UsageSince),
		RoutineBuckets:        namedPB(s.RoutineBuckets),
		Workouts:              s.Workouts,
		WorkoutsFromRoutine:   s.WorkoutsFromRoutine,
		ActiveUsers:           s.ActiveUsers,
		MedianDurationSeconds: s.MedianDurationSeconds,
	}), nil
}

func (h *Handler) GetContentStats(ctx context.Context, _ *connect.Request[adminv1.GetContentStatsRequest]) (*connect.Response[adminv1.GetContentStatsResponse], error) {
	id, role := who(ctx)
	s, err := h.svc.GetContentStats(ctx, id, role)
	if err != nil {
		return nil, err
	}
	rows := make([]*adminv1.ContentRow, 0, len(s.Rows))
	for _, r := range s.Rows {
		rows = append(rows, &adminv1.ContentRow{Key: r.Key, Last7D: r.Last7d, Last30D: r.Last30d, Total: r.Total})
	}
	return connect.NewResponse(&adminv1.GetContentStatsResponse{GeneratedAt: timestamppb.New(s.GeneratedAt), Rows: rows}), nil
}

func (h *Handler) GetOperationsStats(ctx context.Context, _ *connect.Request[adminv1.GetOperationsStatsRequest]) (*connect.Response[adminv1.GetOperationsStatsResponse], error) {
	id, role := who(ctx)
	s, err := h.svc.GetOperationsStats(ctx, id, role)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&adminv1.GetOperationsStatsResponse{
		GeneratedAt:      timestamppb.New(s.GeneratedAt),
		PendingReports:   s.PendingReports,
		OpenUserFeedback: s.OpenUserFeedback,
		OpenOpsFeedback:  s.OpenOpsFeedback,
		UsageBytes:       s.UsageBytes,
		UsageRows_24H:    s.UsageRows24h,
		UsageWarn:        s.UsageWarn,
	}), nil
}

func actorPB(a ActorCount) *adminv1.ActorCount {
	return &adminv1.ActorCount{User: a.User, Guest: a.Guest, Total: a.Total()}
}

func retentionPB(r Retention) *adminv1.Retention {
	return &adminv1.Retention{Cohort: actorPB(r.Cohort), Returned: actorPB(r.Returned)}
}

func (h *Handler) GetUsageStats(ctx context.Context, _ *connect.Request[adminv1.GetUsageStatsRequest]) (*connect.Response[adminv1.GetUsageStatsResponse], error) {
	id, role := who(ctx)
	s, err := h.svc.GetUsageStats(ctx, id, role)
	if err != nil {
		return nil, err
	}
	daily := make([]*adminv1.DailyActors, 0, len(s.Daily))
	for _, d := range s.Daily {
		daily = append(daily, &adminv1.DailyActors{Day: d.Day, User: d.User, Guest: d.Guest})
	}
	return connect.NewResponse(&adminv1.GetUsageStatsResponse{
		GeneratedAt: timestamppb.New(s.GeneratedAt),
		Started:     s.Started,
		UsageSince:  timestamppb.New(s.UsageSince),
		Online:      actorPB(s.Online),
		Dau:         actorPB(s.DAU),
		Wau:         actorPB(s.WAU),
		Mau:         actorPB(s.MAU),
		D1:          retentionPB(s.D1),
		D7:          retentionPB(s.D7),
		D30:         retentionPB(s.D30),
		Daily:       daily,
	}), nil
}

func featuresPB(in []FeatureRow) []*adminv1.FeatureRow {
	out := make([]*adminv1.FeatureRow, 0, len(in))
	for _, r := range in {
		out = append(out, &adminv1.FeatureRow{Name: r.Name, Last7D: r.Last7d, Last30D: r.Last30d})
	}
	return out
}

func (h *Handler) GetFeatureStats(ctx context.Context, _ *connect.Request[adminv1.GetFeatureStatsRequest]) (*connect.Response[adminv1.GetFeatureStatsResponse], error) {
	id, role := who(ctx)
	s, err := h.svc.GetFeatureStats(ctx, id, role)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&adminv1.GetFeatureStatsResponse{
		GeneratedAt: timestamppb.New(s.GeneratedAt),
		Started:     s.Started,
		UsageSince:  timestamppb.New(s.UsageSince),
		Screens:     featuresPB(s.Screens),
		Actions:     featuresPB(s.Actions),
		Platforms:   featuresPB(s.Platforms),
	}), nil
}
