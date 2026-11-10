// 영상 정보 RPC(SPEC-054 Phase 2) — 신원을 꺼내 service 에 넘긴다.
package video

import (
	"context"

	"connectrpc.com/connect"

	videov1 "github.com/JWK-company/liftgram/src/backend/gen/video/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/video/v1/videov1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
	"github.com/JWK-company/liftgram/src/backend/internal/middleware"
)

type Handler struct {
	videov1connect.UnimplementedVideoServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) DescribeVideo(ctx context.Context, req *connect.Request[videov1.DescribeVideoRequest]) (*connect.Response[videov1.DescribeVideoResponse], error) {
	id, _ := auth.UserIDFrom(ctx)
	info, err := h.svc.Describe(ctx, id, middleware.ClientIP(req.Header()), req.Msg.GetVideoId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&videov1.DescribeVideoResponse{
		VideoId:     info.VideoID,
		Title:       info.Title,
		Channel:     info.Channel,
		Description: info.Description,
		DurationSec: int32(info.DurationSec),
		Embeddable:  info.Embeddable,
	}), nil
}
