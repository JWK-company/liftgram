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
	}), nil
}
