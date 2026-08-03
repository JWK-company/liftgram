// @plm SRS-017  DM 노출 — 단항 + 서버 스트리밍
//
// 스트림도 **같은 service를 부른다.** 참여자 확인·차단 필터가 두 벌이 되지 않는다.
package dm

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	dmv1 "github.com/JWK-company/liftgram/src/backend/gen/dm/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/dm/v1/dmv1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
	"github.com/JWK-company/liftgram/src/backend/internal/realtime"
)

// 조용한 연결이 중간 장비에 끊기지 않게 주기적으로 신호를 보낸다.
const heartbeat = 25 * time.Second

type Handler struct {
	dmv1connect.UnimplementedDmServiceHandler
	svc *Service
	bus realtime.Bus
}

func NewHandler(svc *Service, bus realtime.Bus) *Handler {
	return &Handler{svc: svc, bus: bus}
}

func viewer(ctx context.Context) string {
	id, _ := auth.UserIDFrom(ctx)
	return id
}

func (h *Handler) ListConversations(ctx context.Context, _ *connect.Request[dmv1.ListConversationsRequest]) (*connect.Response[dmv1.ListConversationsResponse], error) {
	convs, err := h.svc.ListConversations(ctx, viewer(ctx))
	if err != nil {
		return nil, err
	}
	out := make([]*dmv1.Conversation, 0, len(convs))
	for _, c := range convs {
		out = append(out, toProtoConversation(c))
	}
	return connect.NewResponse(&dmv1.ListConversationsResponse{Conversations: out}), nil
}

func (h *Handler) GetOrCreateDirect(ctx context.Context, req *connect.Request[dmv1.GetOrCreateDirectRequest]) (*connect.Response[dmv1.GetOrCreateDirectResponse], error) {
	conv, err := h.svc.GetOrCreateDirect(ctx, viewer(ctx), req.Msg.GetUserId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&dmv1.GetOrCreateDirectResponse{Conversation: toProtoConversation(conv)}), nil
}

func (h *Handler) CreateGroup(ctx context.Context, req *connect.Request[dmv1.CreateGroupRequest]) (*connect.Response[dmv1.CreateGroupResponse], error) {
	conv, err := h.svc.CreateGroup(ctx, viewer(ctx), req.Msg.GetUserIds(), req.Msg.GetTitle())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&dmv1.CreateGroupResponse{Conversation: toProtoConversation(conv)}), nil
}

func (h *Handler) LeaveConversation(ctx context.Context, req *connect.Request[dmv1.LeaveConversationRequest]) (*connect.Response[dmv1.LeaveConversationResponse], error) {
	if err := h.svc.Leave(ctx, viewer(ctx), req.Msg.GetConversationId()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&dmv1.LeaveConversationResponse{}), nil
}

func (h *Handler) ListMessages(ctx context.Context, req *connect.Request[dmv1.ListMessagesRequest]) (*connect.Response[dmv1.ListMessagesResponse], error) {
	var before *time.Time
	if ts := req.Msg.GetBefore(); ts != nil {
		t := ts.AsTime()
		before = &t
	}
	msgs, err := h.svc.ListMessages(ctx, viewer(ctx), req.Msg.GetConversationId(), before, req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&dmv1.ListMessagesResponse{Messages: toProtoMessages(msgs)}), nil
}

func (h *Handler) SendMessage(ctx context.Context, req *connect.Request[dmv1.SendMessageRequest]) (*connect.Response[dmv1.SendMessageResponse], error) {
	msg, err := h.svc.Send(ctx, viewer(ctx), req.Msg.GetConversationId(), NewMessage{
		Kind:     fromProtoKind(req.Msg.GetKind()),
		Body:     req.Msg.GetBody(),
		MediaURL: req.Msg.GetMediaUrl(),
	})
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&dmv1.SendMessageResponse{Message: toProtoMessage(msg)}), nil
}

func (h *Handler) MarkRead(ctx context.Context, req *connect.Request[dmv1.MarkReadRequest]) (*connect.Response[dmv1.MarkReadResponse], error) {
	if err := h.svc.MarkRead(ctx, viewer(ctx), req.Msg.GetConversationId()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&dmv1.MarkReadResponse{}), nil
}

func (h *Handler) Typing(ctx context.Context, req *connect.Request[dmv1.TypingRequest]) (*connect.Response[dmv1.TypingResponse], error) {
	if err := h.svc.Typing(ctx, viewer(ctx), req.Msg.GetConversationId()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&dmv1.TypingResponse{}), nil
}

// WatchMessages는 이 대화에 새 메시지가 생길 때마다 흘려보낸다.
//
// ── 순서가 중요하다: 구독 먼저, 읽기 나중 ──────────────────────────────────
// 반대로 하면 읽은 뒤 구독이 걸리기까지의 틈에 온 메시지가 **영영 유실된다**
// (그 뒤로 조용하면 화면은 연결된 채 낡은 목록에 멈춘다).
//
// 버스는 **이름만** 나른다 — 신호를 받으면 DB에서 다시 읽는다. 그래서 여러 인스턴스에
// 흩어져 있어도, 알림이 겹쳐 와도 결과가 같다.
func (h *Handler) WatchMessages(ctx context.Context, req *connect.Request[dmv1.WatchMessagesRequest], stream *connect.ServerStream[dmv1.WatchMessagesResponse]) error {
	viewerID := viewer(ctx)
	conversationID := req.Msg.GetConversationId()
	// 남의 대화를 엿볼 수 없다 — 스트림도 같은 관문을 지난다.
	if err := h.svc.RequireParticipant(ctx, viewerID, conversationID); err != nil {
		return err
	}

	msgTopic := MessageTopic(conversationID)
	// 채널에 여유를 둔다: 전송이 늦어도 발행 쪽을 막지 않는다. 가득 차면 버린다 —
	// 다음 신호에서 어차피 **그 이후 전부**를 다시 읽으므로 유실되지 않는다.
	changed := make(chan struct{}, 8)
	typing := make(chan string, 8)
	cancel := h.bus.Subscribe(func(topic string) {
		if topic == msgTopic {
			select {
			case changed <- struct{}{}:
			default:
			}
			return
		}
		if convID, actorID, ok := ParseTypingTopic(topic); ok && convID == conversationID && actorID != viewerID {
			select {
			case typing <- actorID:
			default:
			}
		}
	})
	defer cancel()

	// 구독이 걸린 뒤부터를 본다. 이미 있는 메시지는 화면이 ListMessages로 갖고 있다.
	since := time.Now()

	ticker := time.NewTicker(heartbeat)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil // 화면이 닫혔다. 정상 종료다.

		case <-changed:
			msgs, err := h.svc.NewMessagesSince(ctx, viewerID, conversationID, since)
			if err != nil {
				return err
			}
			if len(msgs) == 0 {
				continue
			}
			since = msgs[len(msgs)-1].CreatedAt
			if err := stream.Send(&dmv1.WatchMessagesResponse{
				Kind:     dmv1.WatchMessagesResponse_KIND_MESSAGE,
				Messages: toProtoMessages(msgs),
			}); err != nil {
				return err
			}

		case actorID := <-typing:
			if err := stream.Send(&dmv1.WatchMessagesResponse{
				Kind:    dmv1.WatchMessagesResponse_KIND_TYPING,
				ActorId: actorID,
			}); err != nil {
				return err
			}

		case <-ticker.C:
			if err := stream.Send(&dmv1.WatchMessagesResponse{
				Kind: dmv1.WatchMessagesResponse_KIND_HEARTBEAT,
			}); err != nil {
				return err
			}
		}
	}
}

// ── 변환 ─────────────────────────────────────────────────────────────────────

func toProtoConversation(c Conversation) *dmv1.Conversation {
	parts := make([]*dmv1.Participant, 0, len(c.Participants))
	for _, p := range c.Participants {
		parts = append(parts, &dmv1.Participant{Id: p.ID, DisplayName: p.DisplayName, AvatarUrl: p.AvatarURL})
	}
	msg := &dmv1.Conversation{
		Id:           c.ID,
		IsGroup:      c.IsGroup,
		Title:        c.Title,
		Participants: parts,
		UnreadCount:  c.UnreadCount,
		UpdatedAt:    timestamppb.New(c.UpdatedAt),
	}
	if c.LastMessage != nil {
		msg.LastMessage = toProtoMessage(*c.LastMessage)
	}
	return msg
}

func toProtoMessages(msgs []Message) []*dmv1.Message {
	out := make([]*dmv1.Message, 0, len(msgs))
	for _, m := range msgs {
		out = append(out, toProtoMessage(m))
	}
	return out
}

func toProtoMessage(m Message) *dmv1.Message {
	return &dmv1.Message{
		Id:             m.ID,
		ConversationId: m.ConversationID,
		Sender:         &dmv1.Participant{Id: m.Sender.ID, DisplayName: m.Sender.DisplayName, AvatarUrl: m.Sender.AvatarURL},
		Kind:           toProtoKind(m.Kind),
		Body:           m.Body,
		MediaUrl:       m.MediaURL,
		CreatedAt:      timestamppb.New(m.CreatedAt),
	}
}

func toProtoKind(k Kind) dmv1.MessageKind {
	if k == KindImage {
		return dmv1.MessageKind_MESSAGE_KIND_IMAGE
	}
	return dmv1.MessageKind_MESSAGE_KIND_TEXT
}

// UNSPECIFIED는 빈 값으로 — service가 기본값(text)을 채운다.
func fromProtoKind(k dmv1.MessageKind) Kind {
	switch k {
	case dmv1.MessageKind_MESSAGE_KIND_TEXT:
		return KindText
	case dmv1.MessageKind_MESSAGE_KIND_IMAGE:
		return KindImage
	}
	return ""
}
