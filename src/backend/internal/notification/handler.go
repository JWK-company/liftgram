// @plm SRS-020  알림 RPC
package notification

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	notificationv1 "github.com/JWK-company/liftgram/src/backend/gen/notification/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/notification/v1/notificationv1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

type Handler struct {
	notificationv1connect.UnimplementedNotificationServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func viewer(ctx context.Context) string {
	id, _ := auth.UserIDFrom(ctx)
	return id
}

func (h *Handler) ListNotifications(ctx context.Context, req *connect.Request[notificationv1.ListNotificationsRequest]) (*connect.Response[notificationv1.ListNotificationsResponse], error) {
	list, err := h.svc.List(ctx, viewer(ctx), req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	out := make([]*notificationv1.Notification, 0, len(list))
	for _, n := range list {
		out = append(out, &notificationv1.Notification{
			Id:        n.ID,
			Kind:      toProtoKind(n.Kind),
			Actor:     &notificationv1.Actor{Id: n.Actor.ID, DisplayName: n.Actor.DisplayName, AvatarUrl: n.Actor.AvatarURL},
			PostId:    n.PostID,
			Read:      n.Read,
			CreatedAt: timestamppb.New(n.CreatedAt),
		})
	}
	return connect.NewResponse(&notificationv1.ListNotificationsResponse{Notifications: out}), nil
}

func (h *Handler) UnreadCount(ctx context.Context, _ *connect.Request[notificationv1.UnreadCountRequest]) (*connect.Response[notificationv1.UnreadCountResponse], error) {
	n, err := h.svc.UnreadCount(ctx, viewer(ctx))
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&notificationv1.UnreadCountResponse{Count: n}), nil
}

func (h *Handler) MarkAllRead(ctx context.Context, _ *connect.Request[notificationv1.MarkAllReadRequest]) (*connect.Response[notificationv1.MarkAllReadResponse], error) {
	if err := h.svc.MarkAllRead(ctx, viewer(ctx)); err != nil {
		return nil, err
	}
	return connect.NewResponse(&notificationv1.MarkAllReadResponse{}), nil
}

func toProtoKind(k Kind) notificationv1.NotificationKind {
	switch k {
	case KindFollow:
		return notificationv1.NotificationKind_NOTIFICATION_KIND_FOLLOW
	case KindLike:
		return notificationv1.NotificationKind_NOTIFICATION_KIND_LIKE
	case KindComment:
		return notificationv1.NotificationKind_NOTIFICATION_KIND_COMMENT
	}
	return notificationv1.NotificationKind_NOTIFICATION_KIND_UNSPECIFIED
}
