// @plm SRS-019  스토리 RPC — proto ↔ 도메인 변환과 신원 꺼내기뿐
package story

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	storyv1 "github.com/JWK-company/liftgram/src/backend/gen/story/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/story/v1/storyv1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

type Handler struct {
	storyv1connect.UnimplementedStoryServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func viewer(ctx context.Context) string {
	id, _ := auth.UserIDFrom(ctx)
	return id
}

func (h *Handler) CreateStory(ctx context.Context, req *connect.Request[storyv1.CreateStoryRequest]) (*connect.Response[storyv1.CreateStoryResponse], error) {
	s, pending, err := h.svc.Create(ctx, viewer(ctx), req.Msg.GetMediaUrl(), req.Msg.GetCaption())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&storyv1.CreateStoryResponse{Story: toProto(s), Pending: pending}), nil
}

func (h *Handler) ListActiveStories(ctx context.Context, _ *connect.Request[storyv1.ListActiveStoriesRequest]) (*connect.Response[storyv1.ListActiveStoriesResponse], error) {
	groups, err := h.svc.ListActive(ctx, viewer(ctx))
	if err != nil {
		return nil, err
	}
	out := make([]*storyv1.StoryGroup, 0, len(groups))
	for _, g := range groups {
		stories := make([]*storyv1.Story, 0, len(g.Stories))
		for _, s := range g.Stories {
			stories = append(stories, toProto(s))
		}
		out = append(out, &storyv1.StoryGroup{
			Author: &storyv1.StoryAuthor{
				Id:          g.Author.ID,
				DisplayName: g.Author.DisplayName,
				AvatarUrl:   g.Author.AvatarURL,
			},
			Stories: stories,
		})
	}
	return connect.NewResponse(&storyv1.ListActiveStoriesResponse{Groups: out}), nil
}

func toProto(s Story) *storyv1.Story {
	return &storyv1.Story{
		Id:        s.ID,
		MediaUrl:  s.MediaURL,
		Caption:   s.Caption,
		CreatedAt: timestamppb.New(s.CreatedAt),
		ExpiresAt: timestamppb.New(s.ExpiresAt),
	}
}
