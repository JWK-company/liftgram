// @plm SRS-007  피드 RPC
//
// 핸들러가 하는 일은 셋뿐이다: proto ↔ 도메인 변환 · 신원 꺼내기 · 서비스 호출.
// 규칙도 SQL도 여기 없다. 로그인이 필요한지 판단하는 것도 service가 한다 —
// 여기서는 컨텍스트의 신원을 넘겨줄 뿐이다(없으면 빈 문자열이고, service가 거절한다).
package feed

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	feedv1 "github.com/JWK-company/liftgram/src/backend/gen/feed/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/feed/v1/feedv1connect"
	gearv1 "github.com/JWK-company/liftgram/src/backend/gen/gear/v1"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
	"github.com/JWK-company/liftgram/src/backend/internal/gear"
)

type Handler struct {
	feedv1connect.UnimplementedFeedServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// 로그인하지 않았으면 빈 문자열 — service가 Unauthorized로 답한다.
func viewer(ctx context.Context) string {
	id, _ := auth.UserIDFrom(ctx)
	return id
}

func (h *Handler) ListFeed(ctx context.Context, req *connect.Request[feedv1.ListFeedRequest]) (*connect.Response[feedv1.ListFeedResponse], error) {
	posts, next, err := h.svc.ListFeed(ctx, viewer(ctx), fromProtoCursor(req.Msg.GetCursor()), req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.ListFeedResponse{
		Posts:      toProtoPosts(posts),
		NextCursor: toProtoCursor(next),
	}), nil
}

func (h *Handler) ListUserPosts(ctx context.Context, req *connect.Request[feedv1.ListUserPostsRequest]) (*connect.Response[feedv1.ListUserPostsResponse], error) {
	posts, next, err := h.svc.ListUserPosts(ctx, viewer(ctx), req.Msg.GetUserId(), fromProtoCursor(req.Msg.GetCursor()), req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.ListUserPostsResponse{
		Posts:      toProtoPosts(posts),
		NextCursor: toProtoCursor(next),
	}), nil
}

func (h *Handler) CreatePost(ctx context.Context, req *connect.Request[feedv1.CreatePostRequest]) (*connect.Response[feedv1.CreatePostResponse], error) {
	p, err := h.svc.CreatePost(ctx, viewer(ctx), NewPost{
		Caption:        req.Msg.GetCaption(),
		Visibility:     fromProtoVisibility(req.Msg.GetVisibility()),
		Workout:        fromProtoWorkout(req.Msg.GetWorkout()),
		MediaURLs:      req.Msg.GetMediaUrls(),
		Gear:           fromProtoGear(req.Msg.GetGear()),
		IdempotencyKey: req.Msg.GetIdempotencyKey(),
	})
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.CreatePostResponse{Post: toProtoPost(p)}), nil
}

func (h *Handler) DeletePost(ctx context.Context, req *connect.Request[feedv1.DeletePostRequest]) (*connect.Response[feedv1.DeletePostResponse], error) {
	if err := h.svc.DeletePost(ctx, viewer(ctx), req.Msg.GetPostId()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.DeletePostResponse{}), nil
}

func (h *Handler) LikePost(ctx context.Context, req *connect.Request[feedv1.LikePostRequest]) (*connect.Response[feedv1.LikePostResponse], error) {
	count, liked, err := h.svc.SetLike(ctx, viewer(ctx), req.Msg.GetPostId(), true)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.LikePostResponse{LikeCount: count, LikedByMe: liked}), nil
}

func (h *Handler) UnlikePost(ctx context.Context, req *connect.Request[feedv1.UnlikePostRequest]) (*connect.Response[feedv1.UnlikePostResponse], error) {
	count, liked, err := h.svc.SetLike(ctx, viewer(ctx), req.Msg.GetPostId(), false)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.UnlikePostResponse{LikeCount: count, LikedByMe: liked}), nil
}

func (h *Handler) ListComments(ctx context.Context, req *connect.Request[feedv1.ListCommentsRequest]) (*connect.Response[feedv1.ListCommentsResponse], error) {
	comments, next, err := h.svc.ListComments(ctx, viewer(ctx), req.Msg.GetPostId(), fromProtoCursor(req.Msg.GetCursor()), req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	out := make([]*feedv1.Comment, 0, len(comments))
	for _, c := range comments {
		out = append(out, toProtoComment(c))
	}
	return connect.NewResponse(&feedv1.ListCommentsResponse{Comments: out, NextCursor: toProtoCursor(next)}), nil
}

func (h *Handler) CreateComment(ctx context.Context, req *connect.Request[feedv1.CreateCommentRequest]) (*connect.Response[feedv1.CreateCommentResponse], error) {
	c, err := h.svc.CreateComment(ctx, viewer(ctx), req.Msg.GetPostId(), req.Msg.GetBody(), req.Msg.GetParentId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.CreateCommentResponse{Comment: toProtoComment(c)}), nil
}

func (h *Handler) DeleteComment(ctx context.Context, req *connect.Request[feedv1.DeleteCommentRequest]) (*connect.Response[feedv1.DeleteCommentResponse], error) {
	if err := h.svc.DeleteComment(ctx, viewer(ctx), req.Msg.GetCommentId()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.DeleteCommentResponse{}), nil
}

func (h *Handler) UpdatePost(ctx context.Context, req *connect.Request[feedv1.UpdatePostRequest]) (*connect.Response[feedv1.UpdatePostResponse], error) {
	edit := PostEdit{Caption: req.Msg.GetCaption()}
	// UNSPECIFIED면 공개범위는 건드리지 않는다 — "안 보냈다"와 "public으로 바꿔라"는 다르다.
	if v := fromProtoVisibility(req.Msg.GetVisibility()); v != "" {
		edit.Visibility = &v
	}
	p, err := h.svc.UpdatePost(ctx, viewer(ctx), req.Msg.GetPostId(), edit)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.UpdatePostResponse{Post: toProtoPost(p)}), nil
}

func (h *Handler) BookmarkPost(ctx context.Context, req *connect.Request[feedv1.BookmarkPostRequest]) (*connect.Response[feedv1.BookmarkPostResponse], error) {
	on, err := h.svc.SetBookmark(ctx, viewer(ctx), req.Msg.GetPostId(), true)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.BookmarkPostResponse{Bookmarked: on}), nil
}

func (h *Handler) UnbookmarkPost(ctx context.Context, req *connect.Request[feedv1.UnbookmarkPostRequest]) (*connect.Response[feedv1.UnbookmarkPostResponse], error) {
	on, err := h.svc.SetBookmark(ctx, viewer(ctx), req.Msg.GetPostId(), false)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.UnbookmarkPostResponse{Bookmarked: on}), nil
}

func (h *Handler) ListBookmarks(ctx context.Context, req *connect.Request[feedv1.ListBookmarksRequest]) (*connect.Response[feedv1.ListBookmarksResponse], error) {
	posts, next, err := h.svc.ListBookmarks(ctx, viewer(ctx), fromProtoCursor(req.Msg.GetCursor()), req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.ListBookmarksResponse{Posts: toProtoPosts(posts), NextCursor: toProtoCursor(next)}), nil
}

func (h *Handler) ListHashtagPosts(ctx context.Context, req *connect.Request[feedv1.ListHashtagPostsRequest]) (*connect.Response[feedv1.ListHashtagPostsResponse], error) {
	posts, next, err := h.svc.ListHashtagPosts(ctx, viewer(ctx), req.Msg.GetTag(), fromProtoCursor(req.Msg.GetCursor()), req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.ListHashtagPostsResponse{Posts: toProtoPosts(posts), NextCursor: toProtoCursor(next)}), nil
}

func (h *Handler) TrendingHashtags(ctx context.Context, req *connect.Request[feedv1.TrendingHashtagsRequest]) (*connect.Response[feedv1.TrendingHashtagsResponse], error) {
	tags, err := h.svc.TrendingHashtags(ctx, viewer(ctx), req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	out := make([]*feedv1.HashtagCount, 0, len(tags))
	for _, t := range tags {
		out = append(out, &feedv1.HashtagCount{Tag: t.Tag, Count: t.Uses})
	}
	return connect.NewResponse(&feedv1.TrendingHashtagsResponse{Tags: out}), nil
}

func (h *Handler) GetProfile(ctx context.Context, req *connect.Request[feedv1.GetProfileRequest]) (*connect.Response[feedv1.GetProfileResponse], error) {
	p, err := h.svc.GetProfile(ctx, viewer(ctx), req.Msg.GetUserId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.GetProfileResponse{Profile: &feedv1.SocialProfile{
		Author:         toProtoAuthor(p.Author),
		PostCount:      p.PostCount,
		FollowerCount:  p.FollowerCount,
		FollowingCount: p.FollowingCount,
		IsSelf:         p.IsSelf,
		IsFollowing:    p.IsFollowing,
		IsBlocked:      p.IsBlocked,
	}}), nil
}

func (h *Handler) BlockUser(ctx context.Context, req *connect.Request[feedv1.BlockUserRequest]) (*connect.Response[feedv1.BlockUserResponse], error) {
	blocked, err := h.svc.SetBlock(ctx, viewer(ctx), req.Msg.GetUserId(), true)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.BlockUserResponse{Blocked: blocked}), nil
}

func (h *Handler) UnblockUser(ctx context.Context, req *connect.Request[feedv1.UnblockUserRequest]) (*connect.Response[feedv1.UnblockUserResponse], error) {
	blocked, err := h.svc.SetBlock(ctx, viewer(ctx), req.Msg.GetUserId(), false)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.UnblockUserResponse{Blocked: blocked}), nil
}

func (h *Handler) ListFollows(ctx context.Context, req *connect.Request[feedv1.ListFollowsRequest]) (*connect.Response[feedv1.ListFollowsResponse], error) {
	followers := req.Msg.GetMode() != feedv1.FollowListMode_FOLLOW_LIST_MODE_FOLLOWING
	users, err := h.svc.ListFollows(ctx, viewer(ctx), req.Msg.GetUserId(), followers, req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.ListFollowsResponse{Users: toProtoUsers(users)}), nil
}

func (h *Handler) ListExplore(ctx context.Context, req *connect.Request[feedv1.ListExploreRequest]) (*connect.Response[feedv1.ListExploreResponse], error) {
	posts, err := h.svc.ListExplore(ctx, viewer(ctx), req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.ListExploreResponse{Posts: toProtoPosts(posts)}), nil
}

func (h *Handler) SuggestedUsers(ctx context.Context, req *connect.Request[feedv1.SuggestedUsersRequest]) (*connect.Response[feedv1.SuggestedUsersResponse], error) {
	users, err := h.svc.SuggestedUsers(ctx, viewer(ctx), req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.SuggestedUsersResponse{Users: toProtoUsers(users)}), nil
}

func (h *Handler) Search(ctx context.Context, req *connect.Request[feedv1.SearchRequest]) (*connect.Response[feedv1.SearchResponse], error) {
	users, tags, posts, err := h.svc.Search(ctx, viewer(ctx), req.Msg.GetQuery(), req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	out := make([]*feedv1.HashtagCount, 0, len(tags))
	for _, t := range tags {
		out = append(out, &feedv1.HashtagCount{Tag: t.Tag, Count: t.Uses})
	}
	return connect.NewResponse(&feedv1.SearchResponse{
		Users: toProtoUsers(users),
		Tags:  out,
		Posts: toProtoPosts(posts),
	}), nil
}

func (h *Handler) ListBlockedUsers(ctx context.Context, _ *connect.Request[feedv1.ListBlockedUsersRequest]) (*connect.Response[feedv1.ListBlockedUsersResponse], error) {
	users, err := h.svc.ListBlockedUsers(ctx, viewer(ctx))
	if err != nil {
		return nil, err
	}
	out := make([]*feedv1.Author, 0, len(users))
	for _, u := range users {
		out = append(out, toProtoAuthor(u))
	}
	return connect.NewResponse(&feedv1.ListBlockedUsersResponse{Users: out}), nil
}

func (h *Handler) ListReplies(ctx context.Context, req *connect.Request[feedv1.ListRepliesRequest]) (*connect.Response[feedv1.ListRepliesResponse], error) {
	comments, err := h.svc.ListReplies(ctx, viewer(ctx), req.Msg.GetCommentId(), req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	out := make([]*feedv1.Comment, 0, len(comments))
	for _, c := range comments {
		out = append(out, toProtoComment(c))
	}
	return connect.NewResponse(&feedv1.ListRepliesResponse{Comments: out}), nil
}

func (h *Handler) LikeComment(ctx context.Context, req *connect.Request[feedv1.LikeCommentRequest]) (*connect.Response[feedv1.LikeCommentResponse], error) {
	count, liked, err := h.svc.SetCommentLike(ctx, viewer(ctx), req.Msg.GetCommentId(), true)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.LikeCommentResponse{LikeCount: count, LikedByMe: liked}), nil
}

func (h *Handler) UnlikeComment(ctx context.Context, req *connect.Request[feedv1.UnlikeCommentRequest]) (*connect.Response[feedv1.UnlikeCommentResponse], error) {
	count, liked, err := h.svc.SetCommentLike(ctx, viewer(ctx), req.Msg.GetCommentId(), false)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.UnlikeCommentResponse{LikeCount: count, LikedByMe: liked}), nil
}

func (h *Handler) Follow(ctx context.Context, req *connect.Request[feedv1.FollowRequest]) (*connect.Response[feedv1.FollowResponse], error) {
	following, err := h.svc.SetFollow(ctx, viewer(ctx), req.Msg.GetUserId(), true)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.FollowResponse{Following: following}), nil
}

func (h *Handler) Unfollow(ctx context.Context, req *connect.Request[feedv1.UnfollowRequest]) (*connect.Response[feedv1.UnfollowResponse], error) {
	following, err := h.svc.SetFollow(ctx, viewer(ctx), req.Msg.GetUserId(), false)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.UnfollowResponse{Following: following}), nil
}

func (h *Handler) SearchUsers(ctx context.Context, req *connect.Request[feedv1.SearchUsersRequest]) (*connect.Response[feedv1.SearchUsersResponse], error) {
	users, err := h.svc.SearchUsers(ctx, viewer(ctx), req.Msg.GetQuery(), req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&feedv1.SearchUsersResponse{Users: toProtoUsers(users)}), nil
}

// ── 변환 ─────────────────────────────────────────────────────────────────────

func toProtoUsers(users []UserResult) []*feedv1.UserResult {
	out := make([]*feedv1.UserResult, 0, len(users))
	for _, u := range users {
		out = append(out, &feedv1.UserResult{Author: toProtoAuthor(u.Author), Following: u.Following})
	}
	return out
}

func toProtoPosts(posts []Post) []*feedv1.Post {
	out := make([]*feedv1.Post, 0, len(posts))
	for _, p := range posts {
		out = append(out, toProtoPost(p))
	}
	return out
}

func toProtoPost(p Post) *feedv1.Post {
	msg := &feedv1.Post{
		Id:             p.ID,
		Author:         toProtoAuthor(p.Author),
		Kind:           toProtoKind(p.Kind),
		Caption:        p.Caption,
		Visibility:     toProtoVisibility(p.Visibility),
		MediaUrls:      p.MediaURLs,
		LikeCount:      p.LikeCount,
		CommentCount:   p.CommentCount,
		LikedByMe:      p.LikedByMe,
		BookmarkedByMe: p.BookmarkedByMe,
		Gear:           toProtoGear(p.Gear),
		CreatedAt:      timestamppb.New(p.CreatedAt),
	}
	if p.Workout != nil {
		msg.Workout = &feedv1.WorkoutSummary{
			WorkoutId:       p.Workout.WorkoutID,
			WorkoutName:     p.Workout.WorkoutName,
			TotalVolumeKg:   p.Workout.TotalVolumeKg,
			WorkingSets:     p.Workout.WorkingSets,
			DurationSeconds: p.Workout.DurationSeconds,
			PrCount:         p.Workout.PRCount,
			StreakDays:      p.Workout.StreakDays,
			WeeklyReached:   p.Workout.WeeklyReached,
			Exercises:       toProtoExercises(p.Workout.Exercises),
		}
	}
	return msg
}

func toProtoGear(tags []GearTag) []*gearv1.GearTag {
	if len(tags) == 0 {
		return nil
	}
	out := make([]*gearv1.GearTag, 0, len(tags))
	for _, t := range tags {
		out = append(out, &gearv1.GearTag{
			Category: gear.CategoryEnum(t.Category),
			Source:   gear.SourceEnum(t.Source),
			Brand:    t.Brand,
			Note:     t.Note,
		})
	}
	return out
}

func fromProtoGear(tags []*gearv1.GearTag) []GearTag {
	if len(tags) == 0 {
		return nil
	}
	out := make([]GearTag, 0, len(tags))
	for _, t := range tags {
		out = append(out, GearTag{
			Category: gear.CategoryName(t.GetCategory()),
			Source:   gear.SourceName(t.GetSource()),
			Brand:    t.GetBrand(),
			Note:     t.GetNote(),
		})
	}
	return out
}

func toProtoExercises(list []WorkoutExercise) []*feedv1.WorkoutExercise {
	out := make([]*feedv1.WorkoutExercise, 0, len(list))
	for _, ex := range list {
		sets := make([]*feedv1.WorkoutSet, 0, len(ex.Sets))
		for _, st := range ex.Sets {
			sets = append(sets, &feedv1.WorkoutSet{
				WeightKg:    st.WeightKg,
				Reps:        st.Reps,
				IsWarmup:    st.IsWarmup,
				PartialReps: st.PartialReps,
			})
		}
		out = append(out, &feedv1.WorkoutExercise{Name: ex.Name, Note: ex.Note, Sets: sets})
	}
	return out
}

func fromProtoExercises(list []*feedv1.WorkoutExercise) []WorkoutExercise {
	out := make([]WorkoutExercise, 0, len(list))
	for _, ex := range list {
		sets := make([]WorkoutSet, 0, len(ex.GetSets()))
		for _, st := range ex.GetSets() {
			sets = append(sets, WorkoutSet{
				WeightKg:    st.GetWeightKg(),
				Reps:        st.GetReps(),
				IsWarmup:    st.GetIsWarmup(),
				PartialReps: st.GetPartialReps(),
			})
		}
		out = append(out, WorkoutExercise{Name: ex.GetName(), Note: ex.GetNote(), Sets: sets})
	}
	return out
}

func toProtoAuthor(a Author) *feedv1.Author {
	return &feedv1.Author{Id: a.ID, DisplayName: a.DisplayName, AvatarUrl: a.AvatarURL}
}

func toProtoComment(c Comment) *feedv1.Comment {
	return &feedv1.Comment{
		Id:         c.ID,
		PostId:     c.PostID,
		Author:     toProtoAuthor(c.Author),
		Body:       c.Body,
		CreatedAt:  timestamppb.New(c.CreatedAt),
		ParentId:   c.ParentID,
		LikeCount:  c.LikeCount,
		LikedByMe:  c.LikedByMe,
		ReplyCount: c.ReplyCount,
	}
}

func toProtoCursor(c *Cursor) *feedv1.Cursor {
	if c == nil {
		return nil
	}
	return &feedv1.Cursor{CreatedAt: timestamppb.New(c.CreatedAt), Id: c.ID}
}

func fromProtoCursor(c *feedv1.Cursor) *Cursor {
	if c == nil || c.GetId() == "" || c.GetCreatedAt() == nil {
		return nil
	}
	return &Cursor{CreatedAt: c.GetCreatedAt().AsTime(), ID: c.GetId()}
}

func toProtoKind(k Kind) feedv1.PostKind {
	switch k {
	case KindWorkout:
		return feedv1.PostKind_POST_KIND_WORKOUT
	case KindImage:
		return feedv1.PostKind_POST_KIND_IMAGE
	case KindText:
		return feedv1.PostKind_POST_KIND_TEXT
	}
	return feedv1.PostKind_POST_KIND_UNSPECIFIED
}

func toProtoVisibility(v Visibility) feedv1.Visibility {
	switch v {
	case VisibilityPublic:
		return feedv1.Visibility_VISIBILITY_PUBLIC
	case VisibilityFollowers:
		return feedv1.Visibility_VISIBILITY_FOLLOWERS
	case VisibilityPrivate:
		return feedv1.Visibility_VISIBILITY_PRIVATE
	}
	return feedv1.Visibility_VISIBILITY_UNSPECIFIED
}

// UNSPECIFIED는 빈 문자열로 — service가 기본값(public)을 채운다.
func fromProtoVisibility(v feedv1.Visibility) Visibility {
	switch v {
	case feedv1.Visibility_VISIBILITY_PUBLIC:
		return VisibilityPublic
	case feedv1.Visibility_VISIBILITY_FOLLOWERS:
		return VisibilityFollowers
	case feedv1.Visibility_VISIBILITY_PRIVATE:
		return VisibilityPrivate
	}
	return ""
}

func fromProtoWorkout(w *feedv1.WorkoutSummary) *WorkoutSummary {
	if w == nil {
		return nil
	}
	return &WorkoutSummary{
		WorkoutID:       w.GetWorkoutId(),
		WorkoutName:     w.GetWorkoutName(),
		TotalVolumeKg:   w.GetTotalVolumeKg(),
		WorkingSets:     w.GetWorkingSets(),
		DurationSeconds: w.GetDurationSeconds(),
		PRCount:         w.GetPrCount(),
		StreakDays:      w.GetStreakDays(),
		WeeklyReached:   w.GetWeeklyReached(),
		Exercises:       fromProtoExercises(w.GetExercises()),
	}
}
