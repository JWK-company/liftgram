// 이용 기록 RPC(SPEC-032 Phase 3) — 헤더의 유무와 신원을 꺼내 service 에 넘긴다.
package usage

import (
	"context"

	"connectrpc.com/connect"

	usagev1 "github.com/JWK-company/liftgram/src/backend/gen/usage/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/usage/v1/usagev1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
	"github.com/JWK-company/liftgram/src/backend/internal/middleware"
)

type Handler struct {
	usagev1connect.UnimplementedUsageServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) ReportUsage(ctx context.Context, req *connect.Request[usagev1.ReportUsageRequest]) (*connect.Response[usagev1.ReportUsageResponse], error) {
	id, _ := auth.UserIDFrom(ctx)
	m := req.Msg
	events := make([]Incoming, 0, len(m.GetEvents()))
	for _, e := range m.GetEvents() {
		events = append(events, Incoming{ClientEventID: e.GetClientEventId(), Event: e.GetEvent(), AgeMs: e.GetAgeMs()})
	}
	res, err := h.svc.Report(ctx, Input{
		ViewerID:  id,
		HasBearer: req.Header().Get("Authorization") != "",
		IP:        middleware.ClientIP(req.Header()),
		DeviceID:  m.GetDeviceId(),
		Platform:  m.GetPlatform(),
		Version:   m.GetAppVersion(),
		Presence:  m.GetPresence(),
		Events:    events,
	})
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&usagev1.ReportUsageResponse{
		Accepted:      res.Accepted,
		UnknownEvents: res.Unknown,
		Enabled:       res.Enabled,
	}), nil
}
