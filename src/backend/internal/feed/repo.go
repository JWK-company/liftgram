// @plm SRS-007  피드 저장소 — 저장소와의 대화만 한다
//
// SQL은 database/queries/feed.sql 에 있고 Go는 생성물이다(make sqlc).
// 여기 있는 것은 생성 타입 ↔ 도메인 타입 변환과 저장소 오류 → 도메인 오류 옮기기뿐이다.
//
// ── 트랜잭션을 쓰는 곳 ──────────────────────────────────────────────────────
// 좋아요·댓글은 **행을 넣고 카운트를 함께 올린다.** 둘이 갈라지면 화면의 숫자가 영영 틀린다.
// 그래서 그 둘만 한 트랜잭션으로 묶는다 — 나머지는 단일 문장이라 필요 없다.
package feed

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type pgRepo struct {
	pool *pgxpool.Pool
	q    *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) Repo {
	return &pgRepo{pool: pool, q: sqlcgen.New(pool)}
}

func (r *pgRepo) ListFeed(ctx context.Context, viewerID string, cur *Cursor, limit int32) ([]Post, error) {
	at, id, has := cursorArgs(cur)
	rows, err := r.q.ListFeed(ctx, sqlcgen.ListFeedParams{
		ViewerID:  viewerID,
		HasCursor: has,
		CursorAt:  at,
		CursorID:  id,
		Lim:       limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]Post, 0, len(rows))
	for _, row := range rows {
		out = append(out, feedRowToPost(row))
	}
	return out, nil
}

func (r *pgRepo) ListUserPosts(ctx context.Context, viewerID, authorID string, allowed []string, cur *Cursor, limit int32) ([]Post, error) {
	at, id, has := cursorArgs(cur)
	rows, err := r.q.ListUserPosts(ctx, sqlcgen.ListUserPostsParams{
		ViewerID:          viewerID,
		AuthorID:          authorID,
		AllowedVisibility: allowed,
		HasCursor:         has,
		CursorAt:          at,
		CursorID:          id,
		Lim:               limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]Post, 0, len(rows))
	for _, row := range rows {
		out = append(out, userPostRowToPost(row))
	}
	return out, nil
}

func (r *pgRepo) GetPost(ctx context.Context, viewerID, postID string) (Post, error) {
	row, err := r.q.GetPost(ctx, sqlcgen.GetPostParams{ViewerID: viewerID, PostID: postID})
	if errors.Is(err, pgx.ErrNoRows) {
		return Post{}, errs.New(errs.NotFound, "게시물을 찾을 수 없습니다")
	}
	if err != nil {
		return Post{}, err
	}
	// 내려간(또는 검토 중인) 글은 **없는 것으로 친다.**
	// 목록 쿼리는 이 조건을 갖고 있지만 단건 조회는 id를 알면 그냥 열린다 —
	// 그러면 내려간 글에 좋아요·댓글이 계속 달린다(실측으로 잡은 결함).
	if row.ModerationStatus != "approved" {
		return Post{}, errs.New(errs.NotFound, "게시물을 찾을 수 없습니다")
	}

	p := getRowToPost(row)

	// 볼 수 없는 글이면 **없는 것처럼** 답한다 — "권한 없음"은 그 글이 있다는 사실을 알려 준다.
	if !r.canView(ctx, viewerID, p) {
		return Post{}, errs.New(errs.NotFound, "게시물을 찾을 수 없습니다")
	}
	return p, nil
}

// 목록 쿼리는 SQL이 걸러 주지만, 단건 조회는 여기서 같은 판단을 한 번 더 한다.
func (r *pgRepo) canView(ctx context.Context, viewerID string, p Post) bool {
	if p.Author.ID == viewerID {
		return true
	}
	if p.Visibility == VisibilityPrivate {
		return false
	}
	blocked, err := r.q.IsBlockedEitherWay(ctx, sqlcgen.IsBlockedEitherWayParams{A: viewerID, B: p.Author.ID})
	if err != nil || blocked {
		return false
	}
	if p.Visibility == VisibilityPublic {
		return true
	}
	following, err := r.q.IsFollowing(ctx, sqlcgen.IsFollowingParams{FollowerID: viewerID, FolloweeID: p.Author.ID})
	return err == nil && following
}

func (r *pgRepo) CreatePost(ctx context.Context, authorID, id string, p NewPost, kind Kind) (Post, error) {
	// nil 슬라이스는 SQL의 NULL이 된다 — 컬럼이 NOT NULL이라 그대로 넣으면 거절당한다
	// (DEFAULT는 값을 **안 보낼 때**만 쓰인다. 명시적 NULL에는 적용되지 않는다).
	media := p.MediaURLs
	if media == nil {
		media = []string{}
	}
	// 장비 태그는 통째로 싣는다 — 검색하지 않는 부가 정보다(운동 상세와 같은 판단).
	var gearBlob []byte
	if len(p.Gear) > 0 {
		blob, err := json.Marshal(p.Gear)
		if err != nil {
			return Post{}, err
		}
		gearBlob = blob
	}
	arg := sqlcgen.CreatePostParams{
		ID:             id,
		AuthorID:       authorID,
		Kind:           string(kind),
		Caption:        ptr(p.Caption),
		Visibility:     string(p.Visibility),
		MediaUrls:      media,
		Gear:           gearBlob,
		IdempotencyKey: ptr(p.IdempotencyKey),
	}
	if p.Workout != nil {
		arg.WorkoutID = ptr(p.Workout.WorkoutID)
		arg.WorkoutName = ptr(p.Workout.WorkoutName)
		arg.TotalVolumeKg = &p.Workout.TotalVolumeKg
		arg.WorkingSets = &p.Workout.WorkingSets
		arg.DurationSeconds = &p.Workout.DurationSeconds
		arg.PrCount = &p.Workout.PRCount
		arg.StreakDays = &p.Workout.StreakDays
		arg.WeeklyReached = &p.Workout.WeeklyReached
		if len(p.Workout.Exercises) > 0 {
			// 게시된 운동은 그때 찍힌 사진이다 — 통째로 넣고, 이 컬럼으로는 검색하지 않는다.
			blob, err := json.Marshal(p.Workout.Exercises)
			if err != nil {
				return Post{}, err
			}
			arg.Exercises = blob
		}
	}
	row, err := r.q.CreatePost(ctx, arg)
	if err != nil {
		return Post{}, err
	}
	// 방금 만든 글이므로 글쓴이는 요청자다 — 이름을 다시 읽지 않고 조회로 채운다.
	return r.GetPost(ctx, authorID, row.ID)
}

func (r *pgRepo) FindPostByIdempotencyKey(ctx context.Context, authorID, key string) (Post, error) {
	row, err := r.q.GetPostByIdempotencyKey(ctx, sqlcgen.GetPostByIdempotencyKeyParams{
		AuthorID:       authorID,
		IdempotencyKey: &key,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return Post{}, errs.New(errs.NotFound, "게시물을 찾을 수 없습니다")
	}
	if err != nil {
		return Post{}, err
	}
	return idemRowToPost(row), nil
}

func (r *pgRepo) DeletePost(ctx context.Context, postID, authorID string) error {
	return r.q.DeletePost(ctx, sqlcgen.DeletePostParams{ID: postID, AuthorID: authorID})
}

// 좋아요 행과 카운트를 **한 트랜잭션**에서 다룬다 — 갈라지면 숫자가 영영 틀린다.
func (r *pgRepo) SetLike(ctx context.Context, postID, userID string, liked bool) (bool, int32, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return false, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	var affected int64
	if liked {
		affected, err = q.LikePost(ctx, sqlcgen.LikePostParams{PostID: postID, UserID: userID})
	} else {
		affected, err = q.UnlikePost(ctx, sqlcgen.UnlikePostParams{PostID: postID, UserID: userID})
	}
	if err != nil {
		return false, 0, err
	}

	delta := int32(0)
	if affected > 0 {
		// 실제로 넣거나 뺐을 때만 움직인다 — 같은 버튼을 두 번 눌러도 하나다.
		if liked {
			delta = 1
		} else {
			delta = -1
		}
	}
	count, err := q.BumpLikeCount(ctx, sqlcgen.BumpLikeCountParams{Delta: delta, PostID: postID})
	if err != nil {
		return false, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, 0, err
	}
	return affected > 0, count, nil
}

func (r *pgRepo) ListComments(ctx context.Context, viewerID, postID string, cur *Cursor, limit int32) ([]Comment, error) {
	at, id, has := cursorArgs(cur)
	rows, err := r.q.ListComments(ctx, sqlcgen.ListCommentsParams{
		ViewerID:  viewerID,
		PostID:    postID,
		HasCursor: has,
		CursorAt:  at,
		CursorID:  id,
		Lim:       limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]Comment, 0, len(rows))
	for _, row := range rows {
		out = append(out, Comment{
			ID:         row.ID,
			PostID:     row.PostID,
			Author:     Author{ID: row.AuthorID, DisplayName: deref(row.AuthorName), AvatarURL: deref(row.AuthorAvatar)},
			Body:       row.Body,
			CreatedAt:  row.CreatedAt.Time,
			LikeCount:  row.LikeCount,
			LikedByMe:  row.LikedByMe,
			ReplyCount: row.ReplyCount,
		})
	}
	return out, nil
}

func (r *pgRepo) CreateComment(ctx context.Context, id, postID, authorID, body, parentID string) (Comment, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Comment{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	row, err := q.CreateComment(ctx, sqlcgen.CreateCommentParams{
		ID:       id,
		PostID:   postID,
		AuthorID: authorID,
		Body:     body,
		ParentID: ptr(parentID),
	})
	if err != nil {
		return Comment{}, err
	}
	if err := q.BumpCommentCount(ctx, sqlcgen.BumpCommentCountParams{Delta: 1, PostID: postID}); err != nil {
		return Comment{}, err
	}
	// 답글이면 루트 댓글의 "답글 N개"도 같은 트랜잭션에서 올린다.
	if parentID != "" {
		if err := q.BumpReplyCount(ctx, sqlcgen.BumpReplyCountParams{Delta: 1, CommentID: parentID}); err != nil {
			return Comment{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Comment{}, err
	}

	author, err := r.q.GetUserByID(ctx, authorID)
	if err != nil {
		return Comment{}, err
	}
	return Comment{
		ID:        row.ID,
		PostID:    row.PostID,
		Author:    Author{ID: authorID, DisplayName: deref(author.DisplayName), AvatarURL: deref(author.AvatarUrl)},
		Body:      row.Body,
		CreatedAt: row.CreatedAt.Time,
		ParentID:  parentID,
	}, nil
}

func (r *pgRepo) GetCommentOwners(ctx context.Context, commentID string) (CommentOwners, error) {
	c, err := r.q.GetComment(ctx, commentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return CommentOwners{}, errs.New(errs.NotFound, "댓글을 찾을 수 없습니다")
	}
	if err != nil {
		return CommentOwners{}, err
	}
	post, err := r.q.GetPostAuthor(ctx, c.PostID)
	if errors.Is(err, pgx.ErrNoRows) {
		return CommentOwners{}, errs.New(errs.NotFound, "게시물을 찾을 수 없습니다")
	}
	if err != nil {
		return CommentOwners{}, err
	}
	return CommentOwners{
		CommentAuthorID: c.AuthorID,
		PostID:          c.PostID,
		PostAuthorID:    post,
		ParentID:        deref(c.ParentID),
	}, nil
}

func (r *pgRepo) DeleteComment(ctx context.Context, commentID, postID, parentID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	// 루트 댓글을 지우면 딸린 답글도 함께 사라진다(ON DELETE CASCADE) —
	// 글의 댓글 수에서 **그 답글들까지** 빼야 숫자가 맞는다.
	dropped := int32(1)
	if parentID == "" {
		c, err := q.GetComment(ctx, commentID)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if err == nil {
			dropped += c.ReplyCount
		}
	}

	if err := q.DeleteComment(ctx, commentID); err != nil {
		return err
	}
	if err := q.BumpCommentCount(ctx, sqlcgen.BumpCommentCountParams{Delta: -dropped, PostID: postID}); err != nil {
		return err
	}
	if parentID != "" {
		if err := q.BumpReplyCount(ctx, sqlcgen.BumpReplyCountParams{Delta: -1, CommentID: parentID}); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (r *pgRepo) SetFollow(ctx context.Context, followerID, followeeID string, follow bool) (bool, error) {
	var n int64
	var err error
	if follow {
		n, err = r.q.Follow(ctx, sqlcgen.FollowParams{FollowerID: followerID, FolloweeID: followeeID})
	} else {
		n, err = r.q.Unfollow(ctx, sqlcgen.UnfollowParams{FollowerID: followerID, FolloweeID: followeeID})
	}
	return n > 0, err
}

func (r *pgRepo) IsFollowing(ctx context.Context, followerID, followeeID string) (bool, error) {
	return r.q.IsFollowing(ctx, sqlcgen.IsFollowingParams{FollowerID: followerID, FolloweeID: followeeID})
}

func (r *pgRepo) UpdatePost(ctx context.Context, postID, authorID string, e PostEdit) (bool, error) {
	arg := sqlcgen.UpdatePostParams{ID: postID, AuthorID: authorID, Caption: ptr(e.Caption)}
	if e.Visibility != nil {
		arg.SetVisibility = true
		arg.Visibility = string(*e.Visibility)
	}
	n, err := r.q.UpdatePost(ctx, arg)
	return n > 0, err
}

// 태그는 지우고 새로 넣는다 — 차이를 계산하는 것보다 틀릴 여지가 적다.
func (r *pgRepo) SetHashtags(ctx context.Context, postID string, tags []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	if err := q.ClearHashtags(ctx, postID); err != nil {
		return err
	}
	for _, tag := range tags {
		if err := q.AddHashtag(ctx, sqlcgen.AddHashtagParams{PostID: postID, Tag: tag}); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (r *pgRepo) ListHashtagPosts(ctx context.Context, viewerID, tag string, cur *Cursor, limit int32) ([]Post, error) {
	at, id, has := cursorArgs(cur)
	rows, err := r.q.ListHashtagPosts(ctx, sqlcgen.ListHashtagPostsParams{
		ViewerID:  viewerID,
		Tag:       tag,
		HasCursor: has,
		CursorAt:  at,
		CursorID:  id,
		Lim:       limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]Post, 0, len(rows))
	for _, row := range rows {
		out = append(out, hashtagRowToPost(row))
	}
	return out, nil
}

func (r *pgRepo) TrendingHashtags(ctx context.Context, viewerID string, limit int32) ([]HashtagCount, error) {
	rows, err := r.q.TrendingHashtags(ctx, sqlcgen.TrendingHashtagsParams{ViewerID: viewerID, Lim: limit})
	if err != nil {
		return nil, err
	}
	out := make([]HashtagCount, 0, len(rows))
	for _, row := range rows {
		out = append(out, HashtagCount{Tag: row.Tag, Uses: row.Uses})
	}
	return out, nil
}

// 저장은 카운트가 없다 — 넣고 빼기만 하면 된다(트랜잭션도 필요 없다).
func (r *pgRepo) SetBookmark(ctx context.Context, postID, userID string, on bool) error {
	var err error
	if on {
		_, err = r.q.BookmarkPost(ctx, sqlcgen.BookmarkPostParams{PostID: postID, UserID: userID})
	} else {
		_, err = r.q.UnbookmarkPost(ctx, sqlcgen.UnbookmarkPostParams{PostID: postID, UserID: userID})
	}
	return err
}

func (r *pgRepo) ListBookmarks(ctx context.Context, viewerID string, cur *Cursor, limit int32) ([]Post, error) {
	at, id, has := cursorArgs(cur)
	rows, err := r.q.ListBookmarks(ctx, sqlcgen.ListBookmarksParams{
		ViewerID:  viewerID,
		HasCursor: has,
		CursorAt:  at,
		CursorID:  id,
		Lim:       limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]Post, 0, len(rows))
	for _, row := range rows {
		out = append(out, bookmarkRowToPost(row))
	}
	return out, nil
}

func (r *pgRepo) ListReplies(ctx context.Context, viewerID, parentID string, limit int32) ([]Comment, error) {
	rows, err := r.q.ListReplies(ctx, sqlcgen.ListRepliesParams{ViewerID: viewerID, ParentID: parentID, Lim: limit})
	if err != nil {
		return nil, err
	}
	out := make([]Comment, 0, len(rows))
	for _, row := range rows {
		out = append(out, Comment{
			ID:         row.ID,
			PostID:     row.PostID,
			Author:     Author{ID: row.AuthorID, DisplayName: deref(row.AuthorName), AvatarURL: deref(row.AuthorAvatar)},
			Body:       row.Body,
			CreatedAt:  row.CreatedAt.Time,
			ParentID:   deref(row.ParentID),
			LikeCount:  row.LikeCount,
			LikedByMe:  row.LikedByMe,
			ReplyCount: row.ReplyCount,
		})
	}
	return out, nil
}

// 댓글 좋아요도 행과 카운트를 한 트랜잭션에서 다룬다(글 좋아요와 같은 이유).
func (r *pgRepo) SetCommentLike(ctx context.Context, commentID, userID string, liked bool) (bool, int32, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return false, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	var affected int64
	if liked {
		affected, err = q.LikeComment(ctx, sqlcgen.LikeCommentParams{CommentID: commentID, UserID: userID})
	} else {
		affected, err = q.UnlikeComment(ctx, sqlcgen.UnlikeCommentParams{CommentID: commentID, UserID: userID})
	}
	if err != nil {
		return false, 0, err
	}
	delta := int32(0)
	if affected > 0 {
		if liked {
			delta = 1
		} else {
			delta = -1
		}
	}
	count, err := q.BumpCommentLikeCount(ctx, sqlcgen.BumpCommentLikeCountParams{Delta: delta, CommentID: commentID})
	if err != nil {
		return false, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, 0, err
	}
	return affected > 0, count, nil
}

// 차단은 팔로우를 양쪽 다 끊는 것까지가 한 동작이다 — 갈라지면 차단이 반쪽이 된다.
func (r *pgRepo) SetBlock(ctx context.Context, blockerID, blockedID string, block bool) error {
	if !block {
		return r.q.UnblockUser(ctx, sqlcgen.UnblockUserParams{BlockerID: blockerID, BlockedID: blockedID})
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	if err := q.BlockUser(ctx, sqlcgen.BlockUserParams{BlockerID: blockerID, BlockedID: blockedID}); err != nil {
		return err
	}
	if err := q.DropFollowBothWays(ctx, sqlcgen.DropFollowBothWaysParams{A: blockerID, B: blockedID}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *pgRepo) IsBlockedByMe(ctx context.Context, viewerID, targetID string) (bool, error) {
	return r.q.IsBlockedByMe(ctx, sqlcgen.IsBlockedByMeParams{BlockerID: viewerID, BlockedID: targetID})
}

func (r *pgRepo) IsBlockedEitherWay(ctx context.Context, a, b string) (bool, error) {
	return r.q.IsBlockedEitherWay(ctx, sqlcgen.IsBlockedEitherWayParams{A: a, B: b})
}

func (r *pgRepo) GetAuthor(ctx context.Context, userID string) (Author, error) {
	u, err := r.q.GetUserByID(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Author{}, errs.New(errs.NotFound, "사용자를 찾을 수 없습니다")
	}
	if err != nil {
		return Author{}, err
	}
	return Author{ID: u.ID, DisplayName: deref(u.DisplayName), AvatarURL: deref(u.AvatarUrl)}, nil
}

func (r *pgRepo) ListExplore(ctx context.Context, viewerID string, limit int32) ([]Post, error) {
	rows, err := r.q.ListExplore(ctx, sqlcgen.ListExploreParams{ViewerID: viewerID, Lim: limit})
	if err != nil {
		return nil, err
	}
	out := make([]Post, 0, len(rows))
	for _, row := range rows {
		out = append(out, exploreRowToPost(row))
	}
	return out, nil
}

func (r *pgRepo) SearchPosts(ctx context.Context, viewerID, query string, limit int32) ([]Post, error) {
	rows, err := r.q.SearchPosts(ctx, sqlcgen.SearchPostsParams{ViewerID: viewerID, Q: query, Lim: limit})
	if err != nil {
		return nil, err
	}
	out := make([]Post, 0, len(rows))
	for _, row := range rows {
		out = append(out, searchRowToPost(row))
	}
	return out, nil
}

func (r *pgRepo) SearchHashtags(ctx context.Context, viewerID, query string, limit int32) ([]HashtagCount, error) {
	rows, err := r.q.SearchHashtags(ctx, sqlcgen.SearchHashtagsParams{ViewerID: viewerID, Q: query, Lim: limit})
	if err != nil {
		return nil, err
	}
	out := make([]HashtagCount, 0, len(rows))
	for _, row := range rows {
		out = append(out, HashtagCount{Tag: row.Tag, Uses: row.Uses})
	}
	return out, nil
}

func (r *pgRepo) SuggestFriendsOfFriends(ctx context.Context, viewerID string, limit int32) ([]UserResult, error) {
	rows, err := r.q.SuggestFriendsOfFriends(ctx, sqlcgen.SuggestFriendsOfFriendsParams{ViewerID: viewerID, Lim: limit})
	if err != nil {
		return nil, err
	}
	out := make([]UserResult, 0, len(rows))
	for _, row := range rows {
		// 추천은 정의상 **아직 팔로우하지 않은 사람**이다(쿼리가 이미 걸렀다).
		out = append(out, UserResult{
			Author: Author{ID: row.ID, DisplayName: deref(row.DisplayName), AvatarURL: deref(row.AvatarUrl)},
		})
	}
	return out, nil
}

func (r *pgRepo) SuggestPopular(ctx context.Context, viewerID string, exclude []string, limit int32) ([]UserResult, error) {
	if exclude == nil {
		exclude = []string{} // nil은 SQL의 NULL이 되어 `<> ALL(NULL)`이 전부 거짓이 된다
	}
	rows, err := r.q.SuggestPopular(ctx, sqlcgen.SuggestPopularParams{ViewerID: viewerID, Exclude: exclude, Lim: limit})
	if err != nil {
		return nil, err
	}
	out := make([]UserResult, 0, len(rows))
	for _, row := range rows {
		out = append(out, UserResult{
			Author: Author{ID: row.ID, DisplayName: deref(row.DisplayName), AvatarURL: deref(row.AvatarUrl)},
		})
	}
	return out, nil
}

func (r *pgRepo) ListBlockedUsers(ctx context.Context, viewerID string) ([]Author, error) {
	rows, err := r.q.ListBlockedUsers(ctx, viewerID)
	if err != nil {
		return nil, err
	}
	out := make([]Author, 0, len(rows))
	for _, row := range rows {
		out = append(out, Author{ID: row.ID, DisplayName: deref(row.DisplayName), AvatarURL: deref(row.AvatarUrl)})
	}
	return out, nil
}

func (r *pgRepo) GetProfileCounts(ctx context.Context, userID string) (int32, int32, int32, error) {
	row, err := r.q.GetProfileCounts(ctx, userID)
	if err != nil {
		return 0, 0, 0, err
	}
	return row.PostCount, row.FollowerCount, row.FollowingCount, nil
}

func (r *pgRepo) ListFollows(ctx context.Context, viewerID, userID string, followers bool, limit int32) ([]UserResult, error) {
	out := []UserResult{}
	if followers {
		rows, err := r.q.ListFollowers(ctx, sqlcgen.ListFollowersParams{ViewerID: viewerID, UserID: userID, Lim: limit})
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			out = append(out, UserResult{
				Author:    Author{ID: row.ID, DisplayName: deref(row.DisplayName), AvatarURL: deref(row.AvatarUrl)},
				Following: row.Following,
			})
		}
		return out, nil
	}
	rows, err := r.q.ListFollowing(ctx, sqlcgen.ListFollowingParams{ViewerID: viewerID, UserID: userID, Lim: limit})
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out = append(out, UserResult{
			Author:    Author{ID: row.ID, DisplayName: deref(row.DisplayName), AvatarURL: deref(row.AvatarUrl)},
			Following: row.Following,
		})
	}
	return out, nil
}

func (r *pgRepo) SearchUsers(ctx context.Context, viewerID, query string, limit int32) ([]UserResult, error) {
	rows, err := r.q.SearchUsers(ctx, sqlcgen.SearchUsersParams{ViewerID: viewerID, Q: query, Lim: limit})
	if err != nil {
		return nil, err
	}
	out := make([]UserResult, 0, len(rows))
	for _, row := range rows {
		out = append(out, UserResult{
			Author:    Author{ID: row.ID, DisplayName: deref(row.DisplayName), AvatarURL: deref(row.AvatarUrl)},
			Following: row.Following,
		})
	}
	return out, nil
}

// ── 변환 ─────────────────────────────────────────────────────────────────────

func cursorArgs(c *Cursor) (pgtype.Timestamptz, string, bool) {
	if c == nil {
		return pgtype.Timestamptz{Time: time.Unix(0, 0), Valid: true}, "", false
	}
	return pgtype.Timestamptz{Time: c.CreatedAt, Valid: true}, c.ID, true
}

func ptr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func derefF(p *float64) float64 {
	if p == nil {
		return 0
	}
	return *p
}

func derefI(p *int32) int32 {
	if p == nil {
		return 0
	}
	return *p
}

// 세 쿼리가 같은 열을 돌려주지만 sqlc가 각각 다른 타입을 만든다 —
// 공통 필드만 뽑아 한 곳에서 조립한다(변환 규칙이 세 벌로 갈라지지 않게).
type postFields struct {
	id, authorID, kind, visibility     string
	caption, authorName, authorAvatar  *string
	workoutID, workoutName             *string
	totalVolumeKg                      *float64
	workingSets, durationSeconds, prCt *int32
	streakDays                         *int32
	weeklyReached                      *bool
	exercises                          []byte
	gear                               []byte
	mediaURLs                          []string
	likeCount, commentCount            int32
	likedByMe, bookmarkedByMe          bool
	createdAt                          time.Time
}

func assemble(f postFields) Post {
	p := Post{
		ID:             f.id,
		Author:         Author{ID: f.authorID, DisplayName: deref(f.authorName), AvatarURL: deref(f.authorAvatar)},
		Kind:           Kind(f.kind),
		Caption:        deref(f.caption),
		Visibility:     Visibility(f.visibility),
		MediaURLs:      f.mediaURLs,
		LikeCount:      f.likeCount,
		CommentCount:   f.commentCount,
		LikedByMe:      f.likedByMe,
		BookmarkedByMe: f.bookmarkedByMe,
		CreatedAt:      f.createdAt,
	}
	// 태그가 깨져 있어도 글 전체를 버리지 않는다 — 장비는 부가 정보다.
	if len(f.gear) > 0 {
		var tags []GearTag
		if err := json.Unmarshal(f.gear, &tags); err == nil {
			p.Gear = tags
		}
	}

	// kind로 판정하지 않는다 — 예전 글이 kind 없이 운동 열만 채워져 있을 수 있다.
	if f.workoutID != nil || f.workoutName != nil {
		w := &WorkoutSummary{
			WorkoutID:       deref(f.workoutID),
			WorkoutName:     deref(f.workoutName),
			TotalVolumeKg:   derefF(f.totalVolumeKg),
			WorkingSets:     derefI(f.workingSets),
			DurationSeconds: derefI(f.durationSeconds),
			PRCount:         derefI(f.prCt),
			StreakDays:      derefI(f.streakDays),
			WeeklyReached:   f.weeklyReached != nil && *f.weeklyReached,
		}
		// 종목 상세가 깨져 있어도 글 전체를 버리지 않는다 — 요약만 보여 주면 된다.
		if len(f.exercises) > 0 {
			var ex []WorkoutExercise
			if err := json.Unmarshal(f.exercises, &ex); err == nil {
				w.Exercises = ex
			}
		}
		p.Workout = w
	}
	return p
}

func feedRowToPost(r sqlcgen.ListFeedRow) Post {
	return assemble(postFields{
		id: r.ID, authorID: r.AuthorID, kind: r.Kind, visibility: r.Visibility,
		caption: r.Caption, authorName: r.AuthorName, authorAvatar: r.AuthorAvatar,
		workoutID: r.WorkoutID, workoutName: r.WorkoutName, totalVolumeKg: r.TotalVolumeKg,
		workingSets: r.WorkingSets, durationSeconds: r.DurationSeconds, prCt: r.PrCount,
		streakDays: r.StreakDays, weeklyReached: r.WeeklyReached, exercises: r.Exercises, gear: r.Gear,
		mediaURLs: r.MediaUrls, likeCount: r.LikeCount, commentCount: r.CommentCount,
		likedByMe: r.LikedByMe, bookmarkedByMe: r.BookmarkedByMe, createdAt: r.CreatedAt.Time,
	})
}

func userPostRowToPost(r sqlcgen.ListUserPostsRow) Post {
	return assemble(postFields{
		id: r.ID, authorID: r.AuthorID, kind: r.Kind, visibility: r.Visibility,
		caption: r.Caption, authorName: r.AuthorName, authorAvatar: r.AuthorAvatar,
		workoutID: r.WorkoutID, workoutName: r.WorkoutName, totalVolumeKg: r.TotalVolumeKg,
		workingSets: r.WorkingSets, durationSeconds: r.DurationSeconds, prCt: r.PrCount,
		streakDays: r.StreakDays, weeklyReached: r.WeeklyReached, exercises: r.Exercises, gear: r.Gear,
		mediaURLs: r.MediaUrls, likeCount: r.LikeCount, commentCount: r.CommentCount,
		likedByMe: r.LikedByMe, bookmarkedByMe: r.BookmarkedByMe, createdAt: r.CreatedAt.Time,
	})
}

func getRowToPost(r sqlcgen.GetPostRow) Post {
	return assemble(postFields{
		id: r.ID, authorID: r.AuthorID, kind: r.Kind, visibility: r.Visibility,
		caption: r.Caption, authorName: r.AuthorName, authorAvatar: r.AuthorAvatar,
		workoutID: r.WorkoutID, workoutName: r.WorkoutName, totalVolumeKg: r.TotalVolumeKg,
		workingSets: r.WorkingSets, durationSeconds: r.DurationSeconds, prCt: r.PrCount,
		streakDays: r.StreakDays, weeklyReached: r.WeeklyReached, exercises: r.Exercises, gear: r.Gear,
		mediaURLs: r.MediaUrls, likeCount: r.LikeCount, commentCount: r.CommentCount,
		likedByMe: r.LikedByMe, bookmarkedByMe: r.BookmarkedByMe, createdAt: r.CreatedAt.Time,
	})
}

func idemRowToPost(r sqlcgen.GetPostByIdempotencyKeyRow) Post {
	return assemble(postFields{
		id: r.ID, authorID: r.AuthorID, kind: r.Kind, visibility: r.Visibility,
		caption: r.Caption, authorName: r.AuthorName, authorAvatar: r.AuthorAvatar,
		workoutID: r.WorkoutID, workoutName: r.WorkoutName, totalVolumeKg: r.TotalVolumeKg,
		workingSets: r.WorkingSets, durationSeconds: r.DurationSeconds, prCt: r.PrCount,
		streakDays: r.StreakDays, weeklyReached: r.WeeklyReached, exercises: r.Exercises, gear: r.Gear,
		mediaURLs: r.MediaUrls, likeCount: r.LikeCount, commentCount: r.CommentCount,
		likedByMe: r.LikedByMe, bookmarkedByMe: r.BookmarkedByMe, createdAt: r.CreatedAt.Time,
	})
}

func bookmarkRowToPost(r sqlcgen.ListBookmarksRow) Post {
	return assemble(postFields{
		id: r.ID, authorID: r.AuthorID, kind: r.Kind, visibility: r.Visibility,
		caption: r.Caption, authorName: r.AuthorName, authorAvatar: r.AuthorAvatar,
		workoutID: r.WorkoutID, workoutName: r.WorkoutName, totalVolumeKg: r.TotalVolumeKg,
		workingSets: r.WorkingSets, durationSeconds: r.DurationSeconds, prCt: r.PrCount,
		streakDays: r.StreakDays, weeklyReached: r.WeeklyReached, exercises: r.Exercises, gear: r.Gear,
		mediaURLs: r.MediaUrls, likeCount: r.LikeCount, commentCount: r.CommentCount,
		likedByMe: r.LikedByMe, bookmarkedByMe: r.BookmarkedByMe, createdAt: r.CreatedAt.Time,
	})
}

func hashtagRowToPost(r sqlcgen.ListHashtagPostsRow) Post {
	return assemble(postFields{
		id: r.ID, authorID: r.AuthorID, kind: r.Kind, visibility: r.Visibility,
		caption: r.Caption, authorName: r.AuthorName, authorAvatar: r.AuthorAvatar,
		workoutID: r.WorkoutID, workoutName: r.WorkoutName, totalVolumeKg: r.TotalVolumeKg,
		workingSets: r.WorkingSets, durationSeconds: r.DurationSeconds, prCt: r.PrCount,
		streakDays: r.StreakDays, weeklyReached: r.WeeklyReached, exercises: r.Exercises, gear: r.Gear,
		mediaURLs: r.MediaUrls, likeCount: r.LikeCount, commentCount: r.CommentCount,
		likedByMe: r.LikedByMe, bookmarkedByMe: r.BookmarkedByMe, createdAt: r.CreatedAt.Time,
	})
}

func exploreRowToPost(r sqlcgen.ListExploreRow) Post {
	return assemble(postFields{
		id: r.ID, authorID: r.AuthorID, kind: r.Kind, visibility: r.Visibility,
		caption: r.Caption, authorName: r.AuthorName, authorAvatar: r.AuthorAvatar,
		workoutID: r.WorkoutID, workoutName: r.WorkoutName, totalVolumeKg: r.TotalVolumeKg,
		workingSets: r.WorkingSets, durationSeconds: r.DurationSeconds, prCt: r.PrCount,
		streakDays: r.StreakDays, weeklyReached: r.WeeklyReached, exercises: r.Exercises, gear: r.Gear,
		mediaURLs: r.MediaUrls, likeCount: r.LikeCount, commentCount: r.CommentCount,
		likedByMe: r.LikedByMe, bookmarkedByMe: r.BookmarkedByMe, createdAt: r.CreatedAt.Time,
	})
}

func searchRowToPost(r sqlcgen.SearchPostsRow) Post {
	return assemble(postFields{
		id: r.ID, authorID: r.AuthorID, kind: r.Kind, visibility: r.Visibility,
		caption: r.Caption, authorName: r.AuthorName, authorAvatar: r.AuthorAvatar,
		workoutID: r.WorkoutID, workoutName: r.WorkoutName, totalVolumeKg: r.TotalVolumeKg,
		workingSets: r.WorkingSets, durationSeconds: r.DurationSeconds, prCt: r.PrCount,
		streakDays: r.StreakDays, weeklyReached: r.WeeklyReached, exercises: r.Exercises, gear: r.Gear,
		mediaURLs: r.MediaUrls, likeCount: r.LikeCount, commentCount: r.CommentCount,
		likedByMe: r.LikedByMe, bookmarkedByMe: r.BookmarkedByMe, createdAt: r.CreatedAt.Time,
	})
}
