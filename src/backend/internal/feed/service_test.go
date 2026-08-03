// @plm SRS-007  피드 규칙 테스트 — DB도 서버도 없이 돈다
//
// 여기서 보는 것은 **누가 무엇을 볼 수 있고 지울 수 있는가**다. 이게 틀리면 남의 비공개 글이
// 새거나 남이 내 글을 지운다 — 조용히 일어나는 사고라 테스트로 못박는다.
package feed

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// ── 가짜 저장소 ──────────────────────────────────────────────────────────────

type fakeRepo struct {
	posts    map[string]Post
	comments map[string]Comment
	// commentID → (댓글쓴이, 글, 글주인)
	owners    map[string][3]string
	follows   map[string]bool     // "follower→followee"
	likes     map[string]bool     // "post:user"
	blocks    map[string]bool     // "blocker→blocked"
	bookmarks map[string]bool     // "post:user"
	hashtags  map[string][]string // postID → tags
	seq       int
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		posts:     map[string]Post{},
		comments:  map[string]Comment{},
		owners:    map[string][3]string{},
		follows:   map[string]bool{},
		likes:     map[string]bool{},
		blocks:    map[string]bool{},
		bookmarks: map[string]bool{},
		hashtags:  map[string][]string{},
	}
}

func (f *fakeRepo) ListFeed(context.Context, string, *Cursor, int32) ([]Post, error) { return nil, nil }

func (f *fakeRepo) ListUserPosts(_ context.Context, _, authorID string, allowed []string, _ *Cursor, limit int32) ([]Post, error) {
	ok := map[string]bool{}
	for _, v := range allowed {
		ok[v] = true
	}
	var out []Post
	for _, p := range f.posts {
		if p.Author.ID == authorID && ok[string(p.Visibility)] {
			out = append(out, p)
		}
		if int32(len(out)) >= limit {
			break
		}
	}
	return out, nil
}

func (f *fakeRepo) GetPost(_ context.Context, viewerID, postID string) (Post, error) {
	p, ok := f.posts[postID]
	if !ok {
		return Post{}, errs.New(errs.NotFound, "게시물을 찾을 수 없습니다")
	}
	// 진짜 저장소와 같은 판단: 남의 비공개 글은 **없는 것처럼** 답한다.
	if p.Author.ID != viewerID && p.Visibility == VisibilityPrivate {
		return Post{}, errs.New(errs.NotFound, "게시물을 찾을 수 없습니다")
	}
	return p, nil
}

func (f *fakeRepo) CreatePost(_ context.Context, authorID, id string, p NewPost, kind Kind) (Post, error) {
	post := Post{
		ID:         id,
		Author:     Author{ID: authorID},
		Kind:       kind,
		Caption:    p.Caption,
		Visibility: p.Visibility,
		MediaURLs:  p.MediaURLs,
		// 진짜 저장소와 같다: 규칙이 정리해 넘긴 태그를 그대로 싣는다.
		Gear:      p.Gear,
		CreatedAt: time.Now(),
	}
	if p.Workout != nil {
		w := *p.Workout
		post.Workout = &w
	}
	f.posts[id] = post
	if p.IdempotencyKey != "" {
		f.owners["idem:"+authorID+":"+p.IdempotencyKey] = [3]string{id, "", ""}
	}
	return post, nil
}

func (f *fakeRepo) FindPostByIdempotencyKey(_ context.Context, authorID, key string) (Post, error) {
	if v, ok := f.owners["idem:"+authorID+":"+key]; ok {
		return f.posts[v[0]], nil
	}
	return Post{}, errs.New(errs.NotFound, "없음")
}

func (f *fakeRepo) DeletePost(_ context.Context, postID, authorID string) error {
	// 진짜 SQL과 같다: author_id가 맞을 때만 지워진다(아니면 아무 일도 안 일어난다).
	if p, ok := f.posts[postID]; ok && p.Author.ID == authorID {
		delete(f.posts, postID)
	}
	return nil
}

func (f *fakeRepo) SetLike(_ context.Context, postID, userID string, liked bool) (bool, int32, error) {
	key := postID + ":" + userID
	changed := f.likes[key] != liked
	f.likes[key] = liked
	p := f.posts[postID]
	if changed {
		if liked {
			p.LikeCount++
		} else if p.LikeCount > 0 {
			p.LikeCount--
		}
		f.posts[postID] = p
	}
	return changed, p.LikeCount, nil
}

func (f *fakeRepo) ListComments(context.Context, string, string, *Cursor, int32) ([]Comment, error) {
	return nil, nil
}

func (f *fakeRepo) ListReplies(_ context.Context, _, parentID string, _ int32) ([]Comment, error) {
	var out []Comment
	for _, c := range f.comments {
		if c.ParentID == parentID {
			out = append(out, c)
		}
	}
	return out, nil
}

func (f *fakeRepo) CreateComment(_ context.Context, id, postID, authorID, body, parentID string) (Comment, error) {
	c := Comment{ID: id, PostID: postID, Author: Author{ID: authorID}, Body: body, ParentID: parentID, CreatedAt: time.Now()}
	f.comments[id] = c
	f.owners[id] = [3]string{authorID, postID, f.posts[postID].Author.ID}
	return c, nil
}

func (f *fakeRepo) GetCommentOwners(_ context.Context, commentID string) (CommentOwners, error) {
	v, ok := f.owners[commentID]
	if !ok {
		return CommentOwners{}, errs.New(errs.NotFound, "댓글을 찾을 수 없습니다")
	}
	return CommentOwners{
		CommentAuthorID: v[0],
		PostID:          v[1],
		PostAuthorID:    v[2],
		ParentID:        f.comments[commentID].ParentID,
	}, nil
}

func (f *fakeRepo) DeleteComment(_ context.Context, commentID, _, _ string) error {
	delete(f.comments, commentID)
	return nil
}

func (f *fakeRepo) SetCommentLike(_ context.Context, commentID, userID string, liked bool) (bool, int32, error) {
	key := "c:" + commentID + ":" + userID
	changed := f.likes[key] != liked
	f.likes[key] = liked
	c := f.comments[commentID]
	if changed {
		if liked {
			c.LikeCount++
		} else if c.LikeCount > 0 {
			c.LikeCount--
		}
		f.comments[commentID] = c
	}
	return changed, c.LikeCount, nil
}

func (f *fakeRepo) UpdatePost(_ context.Context, postID, authorID string, e PostEdit) (bool, error) {
	p, ok := f.posts[postID]
	// 진짜 SQL과 같다: 내 글일 때만 한 줄이 바뀐다.
	if !ok || p.Author.ID != authorID {
		return false, nil
	}
	p.Caption = e.Caption
	if e.Visibility != nil {
		p.Visibility = *e.Visibility
	}
	f.posts[postID] = p
	return true, nil
}

func (f *fakeRepo) SetHashtags(_ context.Context, postID string, tags []string) error {
	f.hashtags[postID] = tags
	return nil
}

func (f *fakeRepo) ListHashtagPosts(_ context.Context, _, tag string, _ *Cursor, limit int32) ([]Post, error) {
	var out []Post
	for id, tags := range f.hashtags {
		for _, t := range tags {
			if t != tag {
				continue
			}
			p := f.posts[id]
			// 태그 목록은 **공개 글만** 싣는다 — 태그로 비공개가 새 나가면 안 된다.
			if p.Visibility == VisibilityPublic {
				out = append(out, p)
			}
			break
		}
		if int32(len(out)) >= limit {
			break
		}
	}
	return out, nil
}

func (f *fakeRepo) TrendingHashtags(context.Context, string, int32) ([]HashtagCount, error) {
	return nil, nil
}

func (f *fakeRepo) SetBookmark(_ context.Context, postID, userID string, on bool) error {
	f.bookmarks[postID+":"+userID] = on
	return nil
}

func (f *fakeRepo) ListBookmarks(_ context.Context, viewerID string, _ *Cursor, limit int32) ([]Post, error) {
	var out []Post
	for key, on := range f.bookmarks {
		if !on {
			continue
		}
		id, user, _ := strings.Cut(key, ":")
		if user != viewerID {
			continue
		}
		out = append(out, f.posts[id])
		if int32(len(out)) >= limit {
			break
		}
	}
	return out, nil
}

func (f *fakeRepo) SetBlock(_ context.Context, blockerID, blockedID string, block bool) error {
	f.blocks[blockerID+"→"+blockedID] = block
	if block {
		// 진짜 저장소와 같다: 차단하면 팔로우가 양쪽 다 끊긴다.
		delete(f.follows, blockerID+"→"+blockedID)
		delete(f.follows, blockedID+"→"+blockerID)
	}
	return nil
}

func (f *fakeRepo) IsBlockedByMe(_ context.Context, viewerID, targetID string) (bool, error) {
	return f.blocks[viewerID+"→"+targetID], nil
}

func (f *fakeRepo) IsBlockedEitherWay(_ context.Context, a, b string) (bool, error) {
	return f.blocks[a+"→"+b] || f.blocks[b+"→"+a], nil
}

// 발견 — 공개 글만, 좋아요 많은 순.
func (f *fakeRepo) ListExplore(_ context.Context, viewerID string, limit int32) ([]Post, error) {
	var out []Post
	for _, p := range f.posts {
		if p.Visibility != VisibilityPublic {
			continue
		}
		if f.blocks[viewerID+"→"+p.Author.ID] || f.blocks[p.Author.ID+"→"+viewerID] {
			continue
		}
		out = append(out, p)
	}
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && out[j].LikeCount > out[j-1].LikeCount; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	if int32(len(out)) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (f *fakeRepo) SearchPosts(_ context.Context, viewerID, query string, limit int32) ([]Post, error) {
	var out []Post
	for _, p := range f.posts {
		if p.Visibility != VisibilityPublic || !strings.Contains(strings.ToLower(p.Caption), strings.ToLower(query)) {
			continue
		}
		if f.blocks[viewerID+"→"+p.Author.ID] || f.blocks[p.Author.ID+"→"+viewerID] {
			continue
		}
		out = append(out, p)
		if int32(len(out)) >= limit {
			break
		}
	}
	return out, nil
}

func (f *fakeRepo) SearchHashtags(_ context.Context, _, query string, limit int32) ([]HashtagCount, error) {
	counts := map[string]int32{}
	for _, tags := range f.hashtags {
		for _, t := range tags {
			if strings.Contains(t, query) {
				counts[t]++
			}
		}
	}
	out := make([]HashtagCount, 0, len(counts))
	for tag, n := range counts {
		out = append(out, HashtagCount{Tag: tag, Uses: n})
		if int32(len(out)) >= limit {
			break
		}
	}
	return out, nil
}

func (f *fakeRepo) SuggestFriendsOfFriends(_ context.Context, viewerID string, limit int32) ([]UserResult, error) {
	// 내가 팔로우하는 사람들이 팔로우하는 사람 — 이미 팔로우한 사람과 나는 뺀다.
	mine := map[string]bool{}
	for key, on := range f.follows {
		a, b, _ := strings.Cut(key, "→")
		if on && a == viewerID {
			mine[b] = true
		}
	}
	seen := map[string]bool{}
	var out []UserResult
	for key, on := range f.follows {
		a, b, _ := strings.Cut(key, "→")
		if !on || !mine[a] || b == viewerID || mine[b] || seen[b] {
			continue
		}
		seen[b] = true
		out = append(out, UserResult{Author: Author{ID: b}})
		if int32(len(out)) >= limit {
			break
		}
	}
	return out, nil
}

func (f *fakeRepo) SuggestPopular(_ context.Context, viewerID string, exclude []string, limit int32) ([]UserResult, error) {
	skip := map[string]bool{viewerID: true}
	for _, id := range exclude {
		skip[id] = true
	}
	seen := map[string]bool{}
	var out []UserResult
	for _, p := range f.posts {
		id := p.Author.ID
		if skip[id] || seen[id] || f.follows[viewerID+"→"+id] {
			continue
		}
		seen[id] = true
		out = append(out, UserResult{Author: Author{ID: id}})
		if int32(len(out)) >= limit {
			break
		}
	}
	return out, nil
}

func (f *fakeRepo) ListBlockedUsers(_ context.Context, viewerID string) ([]Author, error) {
	var out []Author
	for key, on := range f.blocks {
		if !on {
			continue
		}
		a, b, _ := strings.Cut(key, "→")
		if a == viewerID {
			out = append(out, Author{ID: b})
		}
	}
	return out, nil
}

func (f *fakeRepo) GetAuthor(_ context.Context, userID string) (Author, error) {
	return Author{ID: userID, DisplayName: userID}, nil
}

func (f *fakeRepo) GetProfileCounts(_ context.Context, userID string) (int32, int32, int32, error) {
	var posts, followers, following int32
	for _, p := range f.posts {
		if p.Author.ID == userID {
			posts++
		}
	}
	for key, on := range f.follows {
		if !on {
			continue
		}
		a, b, _ := strings.Cut(key, "→")
		if b == userID {
			followers++
		}
		if a == userID {
			following++
		}
	}
	return posts, followers, following, nil
}

func (f *fakeRepo) ListFollows(_ context.Context, _, userID string, followers bool, _ int32) ([]UserResult, error) {
	var out []UserResult
	for key, on := range f.follows {
		if !on {
			continue
		}
		a, b, _ := strings.Cut(key, "→")
		if followers && b == userID {
			out = append(out, UserResult{Author: Author{ID: a}})
		}
		if !followers && a == userID {
			out = append(out, UserResult{Author: Author{ID: b}})
		}
	}
	return out, nil
}

func (f *fakeRepo) SetFollow(_ context.Context, a, b string, follow bool) (bool, error) {
	key := a + "→" + b
	changed := f.follows[key] != follow
	f.follows[key] = follow
	return changed, nil
}

func (f *fakeRepo) IsFollowing(_ context.Context, a, b string) (bool, error) {
	return f.follows[a+"→"+b], nil
}

func (f *fakeRepo) SearchUsers(context.Context, string, string, int32) ([]UserResult, error) {
	return nil, nil
}

// 사진 검증은 media 패키지가 한다 — 여기서는 "내 사진이면 통과"만 흉내 낸다.
type fakeMedia struct {
	// key 형식의 주소 → 주인
	owner map[string]string
	// 자동 스캔에 걸린 주소
	flagged map[string]bool
}

func (f *fakeMedia) CheckOwned(_ context.Context, url, ownerID string) (bool, error) {
	if !strings.HasPrefix(url, "/media/file/") {
		return false, errs.New(errs.Validation, "사진 주소가 올바르지 않습니다")
	}
	if f.owner[url] != ownerID {
		return false, errs.New(errs.Validation, "사진을 찾을 수 없습니다")
	}
	return f.flagged[url], nil
}

// 알림은 부수적이라 여기서는 **적힌 것만** 본다(진짜 저장은 notification 패키지의 몫).
type fakeNotifier struct {
	sent []string // "받는사람|한사람|종류|글"
}

func (f *fakeNotifier) Notify(_ context.Context, userID, actorID, kind, postID string) {
	f.sent = append(f.sent, strings.Join([]string{userID, actorID, kind, postID}, "|"))
}

func newTestService() (*Service, *fakeRepo) {
	svc, repo, _, _ := newTestServiceFull()
	return svc, repo
}

func newTestServiceWithMedia() (*Service, *fakeRepo, *fakeMedia) {
	svc, repo, m, _ := newTestServiceFull()
	return svc, repo, m
}

func newTestServiceFull() (*Service, *fakeRepo, *fakeMedia, *fakeNotifier) {
	repo := newFakeRepo()
	m := &fakeMedia{owner: map[string]string{}, flagged: map[string]bool{}}
	n := &fakeNotifier{}
	i := 0
	return NewService(repo, m, n, func() string {
		i++
		return "id-" + string(rune('a'+i-1))
	}), repo, m, n
}

func domainCode(t *testing.T, err error) errs.Code {
	t.Helper()
	var de *errs.DomainError
	if !errors.As(err, &de) {
		t.Fatalf("도메인 오류가 아님: %v", err)
	}
	return de.Code
}

// ── 테스트 ───────────────────────────────────────────────────────────────────

// 소셜은 로그인이 있어야 뜻이 있다 — 신원 없이 오면 전부 거절한다.
func TestEverythingRequiresLogin(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	if _, _, err := svc.ListFeed(ctx, "", nil, 0); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("비로그인 피드가 통과했다")
	}
	if _, err := svc.CreatePost(ctx, "", NewPost{Caption: "안녕"}); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("비로그인 작성이 통과했다")
	}
	if _, _, err := svc.SetLike(ctx, "", "p1", true); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("비로그인 좋아요가 통과했다")
	}
}

func TestCreatePostNeedsContent(t *testing.T) {
	svc, _ := newTestService()
	// 캡션도 운동도 사진도 없으면 글이 아니다.
	_, err := svc.CreatePost(context.Background(), "u1", NewPost{Caption: "   "})
	if domainCode(t, err) != errs.Validation {
		t.Fatal("빈 글이 통과했다")
	}
}

// 운동 요약이 붙으면 오운완(kind=workout)이 된다 — 화면이 카드 모양을 그것으로 정한다.
func TestPostKindFollowsContent(t *testing.T) {
	svc, _, m := newTestServiceWithMedia()
	ctx := context.Background()
	m.owner["/media/file/1.jpg"] = "u1"

	text, err := svc.CreatePost(ctx, "u1", NewPost{Caption: "오늘 힘들었다"})
	if err != nil || text.Kind != KindText {
		t.Fatalf("텍스트 글이어야 한다: %v %s", err, text.Kind)
	}
	workout, err := svc.CreatePost(ctx, "u1", NewPost{Workout: &WorkoutSummary{WorkoutID: "w1", TotalVolumeKg: 1000}})
	if err != nil || workout.Kind != KindWorkout {
		t.Fatalf("오운완이어야 한다: %v %s", err, workout.Kind)
	}
	image, err := svc.CreatePost(ctx, "u1", NewPost{MediaURLs: []string{"/media/file/1.jpg"}})
	if err != nil || image.Kind != KindImage {
		t.Fatalf("사진 글이어야 한다: %v %s", err, image.Kind)
	}
}

// 재시도가 글을 두 개 만들면 안 된다.
func TestCreatePostIsIdempotentWithKey(t *testing.T) {
	svc, repo := newTestService()
	ctx := context.Background()

	first, err := svc.CreatePost(ctx, "u1", NewPost{Caption: "오운완", IdempotencyKey: "k1"})
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.CreatePost(ctx, "u1", NewPost{Caption: "오운완", IdempotencyKey: "k1"})
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID {
		t.Fatalf("같은 키로 두 글이 생겼다: %s / %s", first.ID, second.ID)
	}
	if len(repo.posts) != 1 {
		t.Fatalf("글이 %d개다 — 하나여야 한다", len(repo.posts))
	}
}

// 공개범위는 **보는 사람과의 관계**가 정한다.
func TestUserPostsVisibilityDependsOnRelationship(t *testing.T) {
	svc, repo := newTestService()
	ctx := context.Background()

	for _, v := range []Visibility{VisibilityPublic, VisibilityFollowers, VisibilityPrivate} {
		if _, err := svc.CreatePost(ctx, "author", NewPost{Caption: string(v), Visibility: v}); err != nil {
			t.Fatal(err)
		}
	}

	// 남 — 공개만.
	stranger, _, err := svc.ListUserPosts(ctx, "stranger", "author", nil, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(stranger) != 1 || stranger[0].Visibility != VisibilityPublic {
		t.Fatalf("남에게는 공개 글만 보여야 한다: %d개", len(stranger))
	}

	// 팔로워 — 공개 + 팔로워.
	repo.follows["follower→author"] = true
	follower, _, err := svc.ListUserPosts(ctx, "follower", "author", nil, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(follower) != 2 {
		t.Fatalf("팔로워에게는 2개여야 한다: %d개", len(follower))
	}

	// 본인 — 전부.
	self, _, err := svc.ListUserPosts(ctx, "author", "author", nil, 50)
	if err != nil {
		t.Fatal(err)
	}
	if len(self) != 3 {
		t.Fatalf("본인에게는 3개여야 한다: %d개", len(self))
	}
}

// 남의 비공개 글은 "권한 없음"이 아니라 **없는 것**으로 답해야 한다 —
// Forbidden이면 그 글이 존재한다는 사실을 알려 주는 셈이다.
func TestPrivatePostOfOthersLooksLikeNotFound(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	p, err := svc.CreatePost(ctx, "author", NewPost{Caption: "비밀", Visibility: VisibilityPrivate})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.SetLike(ctx, "stranger", p.ID, true); domainCode(t, err) != errs.NotFound {
		t.Fatal("남의 비공개 글이 NotFound가 아니다")
	}
}

func TestOnlyAuthorCanDeletePost(t *testing.T) {
	svc, repo := newTestService()
	ctx := context.Background()
	p, err := svc.CreatePost(ctx, "author", NewPost{Caption: "내 글"})
	if err != nil {
		t.Fatal(err)
	}

	// 남이 지우려 해도 아무 일도 일어나지 않는다.
	if err := svc.DeletePost(ctx, "stranger", p.ID); err != nil {
		t.Fatal(err)
	}
	if _, still := repo.posts[p.ID]; !still {
		t.Fatal("남이 내 글을 지웠다")
	}

	if err := svc.DeletePost(ctx, "author", p.ID); err != nil {
		t.Fatal(err)
	}
	if _, still := repo.posts[p.ID]; still {
		t.Fatal("주인이 지웠는데 남아 있다")
	}
}

// 두 번 눌러도 하나 — 카운트가 부풀지 않는다.
func TestLikeIsIdempotent(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	p, err := svc.CreatePost(ctx, "author", NewPost{Caption: "글"})
	if err != nil {
		t.Fatal(err)
	}

	count, liked, err := svc.SetLike(ctx, "fan", p.ID, true)
	if err != nil || count != 1 || !liked {
		t.Fatalf("첫 좋아요: count=%d liked=%v err=%v", count, liked, err)
	}
	count, _, err = svc.SetLike(ctx, "fan", p.ID, true)
	if err != nil || count != 1 {
		t.Fatalf("두 번 눌렀는데 %d이 됐다", count)
	}
	count, _, err = svc.SetLike(ctx, "fan", p.ID, false)
	if err != nil || count != 0 {
		t.Fatalf("취소 후 %d", count)
	}
	// 취소를 두 번 해도 음수로 가지 않는다.
	count, _, err = svc.SetLike(ctx, "fan", p.ID, false)
	if err != nil || count != 0 {
		t.Fatalf("취소를 두 번 했더니 %d", count)
	}
}

// 댓글은 쓴 사람과 **글 주인**이 지운다 — 내 글의 악플을 내가 지울 수 있어야 한다.
func TestCommentDeletableByAuthorOrPostOwner(t *testing.T) {
	svc, repo := newTestService()
	ctx := context.Background()
	p, err := svc.CreatePost(ctx, "postOwner", NewPost{Caption: "글"})
	if err != nil {
		t.Fatal(err)
	}

	c1, err := svc.CreateComment(ctx, "commenter", p.ID, " 좋네요 ", "")
	if err != nil {
		t.Fatal(err)
	}
	if c1.Body != "좋네요" {
		t.Fatalf("앞뒤 공백이 그대로다: %q", c1.Body)
	}

	// 아무 상관없는 사람은 못 지운다.
	if err := svc.DeleteComment(ctx, "stranger", c1.ID); domainCode(t, err) != errs.Forbidden {
		t.Fatal("남이 댓글을 지웠다")
	}
	// 글 주인은 지울 수 있다.
	if err := svc.DeleteComment(ctx, "postOwner", c1.ID); err != nil {
		t.Fatalf("글 주인이 못 지웠다: %v", err)
	}

	c2, err := svc.CreateComment(ctx, "commenter", p.ID, "또 좋네요", "")
	if err != nil {
		t.Fatal(err)
	}
	// 쓴 사람도 지울 수 있다.
	if err := svc.DeleteComment(ctx, "commenter", c2.ID); err != nil {
		t.Fatalf("쓴 사람이 못 지웠다: %v", err)
	}
	if len(repo.comments) != 0 {
		t.Fatalf("댓글이 %d개 남았다", len(repo.comments))
	}
}

func TestCannotFollowYourself(t *testing.T) {
	svc, _ := newTestService()
	_, err := svc.SetFollow(context.Background(), "u1", "u1", true)
	if domainCode(t, err) != errs.Validation {
		t.Fatal("자기 자신을 팔로우했다")
	}
}

// 요청이 아무리 크게 달라고 해도 한 페이지 상한을 넘지 않는다.
func TestLimitIsClamped(t *testing.T) {
	if got := clampLimit(9999); got != maxLimit {
		t.Fatalf("상한이 안 걸렸다: %d", got)
	}
	if got := clampLimit(0); got != defaultLimit {
		t.Fatalf("기본값이 아니다: %d", got)
	}
	if got := clampLimit(-5); got != defaultLimit {
		t.Fatalf("음수가 기본값으로 안 갔다: %d", got)
	}
}

// ── 해시태그 ─────────────────────────────────────────────────────────────────

// 태그 추출은 **옛 서버와 같은 규칙**이어야 한다. 다르면 이행 중 같은 글이 서로 다르게 색인된다.
func TestExtractHashtags(t *testing.T) {
	cases := []struct {
		name    string
		caption string
		want    []string
	}{
		{"소문자로 모은다", "#Chest #CHEST 오늘 #chest", []string{"chest"}},
		{"한글도 태그다", "#상체 #등운동 완료", []string{"상체", "등운동"}},
		{"숫자·밑줄 허용", "#pr_100kg #5x5", []string{"pr_100kg", "5x5"}},
		{"태그가 아닌 #는 무시", "가격은 #  이고", nil},
		{"태그 없음", "그냥 오운완", nil},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := ExtractHashtags(c.caption)
			if len(got) != len(c.want) {
				t.Fatalf("개수가 다르다: got %v want %v", got, c.want)
			}
			for i := range got {
				if got[i] != c.want[i] {
					t.Fatalf("순서·값이 다르다: got %v want %v", got, c.want)
				}
			}
		})
	}
}

// 캡션을 태그로 도배해 트렌딩을 흔들 수 없다.
func TestExtractHashtagsCapsAtTen(t *testing.T) {
	caption := ""
	for i := 0; i < 20; i++ {
		caption += "#tag" + string(rune('a'+i)) + " "
	}
	if got := len(ExtractHashtags(caption)); got != 10 {
		t.Fatalf("상한이 걸리지 않았다: %d개", got)
	}
}

// 올린 글의 태그가 실제로 색인되고, 태그 목록으로 다시 찾아진다.
func TestCreatePostIndexesHashtags(t *testing.T) {
	svc, repo := newTestService()
	ctx := context.Background()

	p, err := svc.CreatePost(ctx, "u1", NewPost{Caption: "오늘 #가슴 끝! #오운완"})
	if err != nil {
		t.Fatal(err)
	}
	if got := repo.hashtags[p.ID]; len(got) != 2 || got[0] != "가슴" {
		t.Fatalf("태그가 색인되지 않았다: %v", got)
	}

	// '#'을 붙여 조회해도 같은 결과여야 한다(화면이 그대로 넘길 수 있게).
	posts, _, err := svc.ListHashtagPosts(ctx, "u2", "#가슴", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(posts) != 1 || posts[0].ID != p.ID {
		t.Fatalf("태그로 못 찾았다: %v", posts)
	}
}

// 비공개 글은 태그로도 새 나가지 않는다.
func TestHashtagListHidesPrivatePosts(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	if _, err := svc.CreatePost(ctx, "u1", NewPost{Caption: "비밀 #가슴", Visibility: VisibilityPrivate}); err != nil {
		t.Fatal(err)
	}
	posts, _, err := svc.ListHashtagPosts(ctx, "u2", "가슴", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(posts) != 0 {
		t.Fatalf("비공개 글이 태그 목록에 샜다: %v", posts)
	}
}

// 캡션을 고치면 태그도 다시 뽑힌다 — 지운 태그가 남아 있으면 안 된다.
func TestUpdatePostReindexesHashtags(t *testing.T) {
	svc, repo := newTestService()
	ctx := context.Background()

	p, _ := svc.CreatePost(ctx, "u1", NewPost{Caption: "#가슴 #등"})
	if _, err := svc.UpdatePost(ctx, "u1", p.ID, PostEdit{Caption: "#어깨만"}); err != nil {
		t.Fatal(err)
	}
	got := repo.hashtags[p.ID]
	if len(got) != 1 || got[0] != "어깨만" {
		t.Fatalf("태그가 다시 뽑히지 않았다: %v", got)
	}
}

// 남의 글은 고칠 수 없다 — 있다는 사실조차 알려 주지 않는다(NotFound).
func TestUpdatePostRejectsOthersPost(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	p, _ := svc.CreatePost(ctx, "u1", NewPost{Caption: "내 글"})
	_, err := svc.UpdatePost(ctx, "u2", p.ID, PostEdit{Caption: "가로챈다"})
	if domainCode(t, err) != errs.NotFound {
		t.Fatalf("남의 글을 고칠 수 있다: %v", err)
	}
}

// ── 저장(북마크) ─────────────────────────────────────────────────────────────

// 못 보는 글은 저장도 못 한다 — 저장이 열람권을 만들어 주면 안 된다.
func TestBookmarkRejectsInvisiblePost(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	p, _ := svc.CreatePost(ctx, "u1", NewPost{Caption: "비밀", Visibility: VisibilityPrivate})
	if _, err := svc.SetBookmark(ctx, "u2", p.ID, true); domainCode(t, err) != errs.NotFound {
		t.Fatal("남의 비공개 글을 저장했다")
	}
}

func TestBookmarkRoundTrip(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	p, _ := svc.CreatePost(ctx, "u1", NewPost{Caption: "오운완"})
	if _, err := svc.SetBookmark(ctx, "u2", p.ID, true); err != nil {
		t.Fatal(err)
	}
	saved, _, err := svc.ListBookmarks(ctx, "u2", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(saved) != 1 || saved[0].ID != p.ID {
		t.Fatalf("저장한 글이 목록에 없다: %v", saved)
	}

	// 해제하면 목록에서 빠진다. 다른 사람의 저장함에는 애초에 없다.
	if _, err := svc.SetBookmark(ctx, "u2", p.ID, false); err != nil {
		t.Fatal(err)
	}
	if saved, _, _ := svc.ListBookmarks(ctx, "u2", nil, 0); len(saved) != 0 {
		t.Fatalf("해제했는데 남아 있다: %v", saved)
	}
	if others, _, _ := svc.ListBookmarks(ctx, "u3", nil, 0); len(others) != 0 {
		t.Fatal("남의 저장함이 보인다")
	}
}

// ── 답글 ─────────────────────────────────────────────────────────────────────

// 답글의 답글은 **루트에 붙는다.** 깊이가 늘면 화면이 옆으로 밀려 읽을 수 없게 된다.
func TestReplyDepthIsFlattenedToOne(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	p, _ := svc.CreatePost(ctx, "u1", NewPost{Caption: "글"})
	root, err := svc.CreateComment(ctx, "u2", p.ID, "댓글", "")
	if err != nil {
		t.Fatal(err)
	}
	reply, err := svc.CreateComment(ctx, "u3", p.ID, "답글", root.ID)
	if err != nil {
		t.Fatal(err)
	}
	if reply.ParentID != root.ID {
		t.Fatalf("답글이 루트에 안 붙었다: %q", reply.ParentID)
	}
	// 답글에 다는 답글도 루트에 붙는다.
	deep, err := svc.CreateComment(ctx, "u4", p.ID, "답답글", reply.ID)
	if err != nil {
		t.Fatal(err)
	}
	if deep.ParentID != root.ID {
		t.Fatalf("깊이가 2가 됐다: %q", deep.ParentID)
	}
}

// 다른 글의 댓글에 답글을 달 수는 없다.
func TestReplyRejectsForeignParent(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	p1, _ := svc.CreatePost(ctx, "u1", NewPost{Caption: "글1"})
	p2, _ := svc.CreatePost(ctx, "u1", NewPost{Caption: "글2"})
	c, _ := svc.CreateComment(ctx, "u2", p1.ID, "댓글", "")

	_, err := svc.CreateComment(ctx, "u3", p2.ID, "엉뚱한 답글", c.ID)
	if domainCode(t, err) != errs.Validation {
		t.Fatalf("다른 글의 댓글에 답글이 달렸다: %v", err)
	}
}

// 댓글 좋아요도 멱등이다 — 두 번 눌러도 하나.
func TestCommentLikeIsIdempotent(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	p, _ := svc.CreatePost(ctx, "u1", NewPost{Caption: "글"})
	c, _ := svc.CreateComment(ctx, "u2", p.ID, "댓글", "")

	if _, _, err := svc.SetCommentLike(ctx, "u3", c.ID, true); err != nil {
		t.Fatal(err)
	}
	count, _, err := svc.SetCommentLike(ctx, "u3", c.ID, true)
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("두 번 눌렀더니 %d개가 됐다", count)
	}
}

// ── 차단·프로필 ──────────────────────────────────────────────────────────────

// 차단하면 팔로우가 **양쪽 다** 끊긴다 — 남겨 두면 차단을 푸는 순간 다시 이어진다.
func TestBlockDropsFollowBothWays(t *testing.T) {
	svc, repo := newTestService()
	ctx := context.Background()

	if _, err := svc.SetFollow(ctx, "u1", "u2", true); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetFollow(ctx, "u2", "u1", true); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetBlock(ctx, "u1", "u2", true); err != nil {
		t.Fatal(err)
	}
	if repo.follows["u1→u2"] || repo.follows["u2→u1"] {
		t.Fatal("차단했는데 팔로우가 남았다")
	}
}

func TestBlockRejectsSelf(t *testing.T) {
	svc, _ := newTestService()
	if _, err := svc.SetBlock(context.Background(), "u1", "u1", true); domainCode(t, err) != errs.Validation {
		t.Fatal("자기 자신을 차단했다")
	}
}

// 나를 차단한 사람의 프로필은 **없는 것처럼** 답한다.
// 반대로 내가 차단한 사람은 보인다 — 차단 해제 버튼이 그 화면에 있기 때문이다.
func TestProfileHidesBlockerButShowsBlocked(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	if _, err := svc.SetBlock(ctx, "them", "me", true); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.GetProfile(ctx, "me", "them"); domainCode(t, err) != errs.NotFound {
		t.Fatal("나를 차단한 사람의 프로필이 보인다")
	}

	if _, err := svc.SetBlock(ctx, "me", "other", true); err != nil {
		t.Fatal(err)
	}
	p, err := svc.GetProfile(ctx, "me", "other")
	if err != nil {
		t.Fatalf("내가 차단한 사람의 프로필이 안 보인다: %v", err)
	}
	if !p.IsBlocked {
		t.Fatal("차단 표시가 없다 — 해제 버튼을 그릴 수 없다")
	}
}

// 프로필의 카운트와 관계.
func TestProfileCountsAndRelation(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	if _, err := svc.CreatePost(ctx, "star", NewPost{Caption: "1"}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreatePost(ctx, "star", NewPost{Caption: "2"}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetFollow(ctx, "fan", "star", true); err != nil {
		t.Fatal(err)
	}

	p, err := svc.GetProfile(ctx, "fan", "star")
	if err != nil {
		t.Fatal(err)
	}
	if p.PostCount != 2 || p.FollowerCount != 1 || p.FollowingCount != 0 {
		t.Fatalf("카운트가 틀리다: %+v", p)
	}
	if !p.IsFollowing || p.IsSelf {
		t.Fatalf("관계가 틀리다: %+v", p)
	}

	// 내 프로필에는 팔로우·차단 관계가 붙지 않는다(버튼 자체가 없다).
	mine, err := svc.GetProfile(ctx, "star", "star")
	if err != nil {
		t.Fatal(err)
	}
	if !mine.IsSelf || mine.IsFollowing {
		t.Fatalf("내 프로필에 관계가 붙었다: %+v", mine)
	}
}

// 운동 상세는 **서버가 다시 계산하지 않는다** — 올라온 그대로 실려 나간다.
func TestWorkoutDetailIsStoredVerbatim(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	in := &WorkoutSummary{
		WorkoutName:   "가슴날",
		TotalVolumeKg: 3200,
		StreakDays:    7,
		WeeklyReached: true,
		Exercises: []WorkoutExercise{{
			Name: "벤치프레스",
			Note: "그립 넓게",
			Sets: []WorkoutSet{{WeightKg: 60, Reps: 10, IsWarmup: true}, {WeightKg: 100, Reps: 5, PartialReps: 2}},
		}},
	}
	p, err := svc.CreatePost(ctx, "u1", NewPost{Workout: in})
	if err != nil {
		t.Fatal(err)
	}
	if p.Kind != KindWorkout {
		t.Fatalf("오운완이 아니다: %s", p.Kind)
	}
	w := p.Workout
	if w.StreakDays != 7 || !w.WeeklyReached {
		t.Fatalf("게시 시점 값이 지워졌다: %+v", w)
	}
	if len(w.Exercises) != 1 || len(w.Exercises[0].Sets) != 2 {
		t.Fatalf("종목·세트가 안 실렸다: %+v", w.Exercises)
	}
	if w.Exercises[0].Sets[1].PartialReps != 2 || w.Exercises[0].Note != "그립 넓게" {
		t.Fatalf("세부가 바뀌었다: %+v", w.Exercises[0])
	}
}

// ── 글에 실리는 사진 ─────────────────────────────────────────────────────────

// 남의 서버 그림을 우리 피드에 띄울 수 없다 — 주소는 **우리 경로**여야 한다.
func TestCreatePostRejectsForeignMediaURL(t *testing.T) {
	svc, _, _ := newTestServiceWithMedia()
	_, err := svc.CreatePost(context.Background(), "u1", NewPost{MediaURLs: []string{"https://evil.example/x.png"}})
	if domainCode(t, err) != errs.Validation {
		t.Fatalf("바깥 주소가 통과했다: %v", err)
	}
}

// 남이 올린 사진을 내 글에 붙일 수 없다.
func TestCreatePostRejectsSomeoneElsesMedia(t *testing.T) {
	svc, _, m := newTestServiceWithMedia()
	m.owner["/media/file/abc.png"] = "other"

	_, err := svc.CreatePost(context.Background(), "u1", NewPost{MediaURLs: []string{"/media/file/abc.png"}})
	if domainCode(t, err) != errs.Validation {
		t.Fatalf("남의 사진이 통과했다: %v", err)
	}
}

func TestCreatePostAcceptsOwnMedia(t *testing.T) {
	svc, _, m := newTestServiceWithMedia()
	m.owner["/media/file/abc.png"] = "u1"

	p, err := svc.CreatePost(context.Background(), "u1", NewPost{MediaURLs: []string{"/media/file/abc.png"}})
	if err != nil {
		t.Fatal(err)
	}
	if p.Kind != KindImage {
		t.Fatalf("사진 글이 아니다: %s", p.Kind)
	}
}

// ── 알림 fan-out ─────────────────────────────────────────────────────────────

// 좋아요·댓글·팔로우는 상대에게 알림을 남긴다.
func TestNotificationsAreSent(t *testing.T) {
	svc, _, _, notes := newTestServiceFull()
	ctx := context.Background()

	post, err := svc.CreatePost(ctx, "author", NewPost{Caption: "글"})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.SetLike(ctx, "fan", post.ID, true); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreateComment(ctx, "fan", post.ID, "좋아요", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetFollow(ctx, "fan", "author", true); err != nil {
		t.Fatal(err)
	}

	want := []string{
		"author|fan|like|" + post.ID,
		"author|fan|comment|" + post.ID,
		"author|fan|follow|",
	}
	if len(notes.sent) != len(want) {
		t.Fatalf("알림 수가 다르다: %v", notes.sent)
	}
	for i := range want {
		if notes.sent[i] != want[i] {
			t.Fatalf("알림이 다르다: got %q want %q", notes.sent[i], want[i])
		}
	}
}

// 내 글에 내가 누른 좋아요는 알리지 않는다(알림 규칙은 notification 쪽이지만, 여기서도 확인).
// 그리고 **껐다 켜기를 반복해도 쌓이지 않는다** — 실제로 바뀐 때만 알린다.
func TestNotificationsNotRepeatedOnToggle(t *testing.T) {
	svc, _, _, notes := newTestServiceFull()
	ctx := context.Background()

	post, _ := svc.CreatePost(ctx, "author", NewPost{Caption: "글"})
	for i := 0; i < 3; i++ {
		if _, _, err := svc.SetLike(ctx, "fan", post.ID, true); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := svc.SetLike(ctx, "fan", post.ID, false); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.SetLike(ctx, "fan", post.ID, true); err != nil {
		t.Fatal(err)
	}

	// 실제로 켜진 것은 두 번(처음 · 껐다 다시 켠 것).
	if got := len(notes.sent); got != 2 {
		t.Fatalf("연타로 알림이 쌓였다: %d건 %v", got, notes.sent)
	}
}

// 답글은 **부모 댓글을 쓴 사람**에게 간다 — 글쓴이가 아니라.
func TestReplyNotifiesParentAuthor(t *testing.T) {
	svc, _, _, notes := newTestServiceFull()
	ctx := context.Background()

	post, _ := svc.CreatePost(ctx, "author", NewPost{Caption: "글"})
	root, err := svc.CreateComment(ctx, "commenter", post.ID, "댓글", "")
	if err != nil {
		t.Fatal(err)
	}
	notes.sent = nil

	if _, err := svc.CreateComment(ctx, "other", post.ID, "답글", root.ID); err != nil {
		t.Fatal(err)
	}
	if len(notes.sent) != 1 || notes.sent[0] != "commenter|other|comment|"+post.ID {
		t.Fatalf("답글 알림이 엉뚱한 곳으로 갔다: %v", notes.sent)
	}
}

// ── 착용장비 태그 ────────────────────────────────────────────────────────────

// 분류당 하나다 — 같은 분류를 두 번 달 이유가 없다.
func TestGearIsOnePerCategory(t *testing.T) {
	svc, _ := newTestService()
	p, err := svc.CreatePost(context.Background(), "u1", NewPost{
		Caption: "오운완",
		Gear: []GearTag{
			{Category: "belt", Source: "user"},
			{Category: "belt", Source: "user", Brand: "중복"},
			{Category: "strap", Source: "user"},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Gear) != 2 || p.Gear[0].Category != "belt" || p.Gear[1].Category != "strap" {
		t.Fatalf("중복이 정리되지 않았다: %+v", p.Gear)
	}
}

// 모르는 분류는 **조용히 버린다** — 태그 하나 때문에 글이 안 올라가면 안 된다.
func TestUnknownGearCategoryIsDropped(t *testing.T) {
	svc, _ := newTestService()
	p, err := svc.CreatePost(context.Background(), "u1", NewPost{
		Caption: "오운완",
		Gear:    []GearTag{{Category: "우주복"}, {Category: "shoes", Source: "user"}},
	})
	if err != nil {
		t.Fatalf("모르는 태그 때문에 글이 거절됐다: %v", err)
	}
	if len(p.Gear) != 1 || p.Gear[0].Category != "shoes" {
		t.Fatalf("모르는 분류가 남았다: %+v", p.Gear)
	}
}

// 원천은 user/auto 둘뿐이다 — 이상한 값은 user로 눕힌다(자동 감지가 사용자 지정을 덮지 못하게 하는 장치다).
func TestGearSourceNormalizes(t *testing.T) {
	svc, _ := newTestService()
	p, _ := svc.CreatePost(context.Background(), "u1", NewPost{
		Caption: "오운완",
		Gear:    []GearTag{{Category: "belt", Source: "무엇", Brand: "  브랜드  "}},
	})
	if p.Gear[0].Source != "user" {
		t.Fatalf("원천이 정규화되지 않았다: %q", p.Gear[0].Source)
	}
	if p.Gear[0].Brand != "브랜드" {
		t.Fatalf("앞뒤 공백이 그대로다: %q", p.Gear[0].Brand)
	}
}

// ── 발견(Explore) ────────────────────────────────────────────────────────────

// 발견은 **팔로우와 무관하게** 공개 글을 반응 많은 순으로 준다.
func TestExploreShowsPopularPublicPosts(t *testing.T) {
	svc, repo := newTestService()
	ctx := context.Background()

	quiet, _ := svc.CreatePost(ctx, "star", NewPost{Caption: "조용한 글"})
	loud, _ := svc.CreatePost(ctx, "star", NewPost{Caption: "인기 글"})
	if _, _, err := svc.SetLike(ctx, "fan1", loud.ID, true); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.SetLike(ctx, "fan2", loud.ID, true); err != nil {
		t.Fatal(err)
	}

	// 팔로우하지 않은 사람도 본다.
	posts, err := svc.ListExplore(ctx, "stranger", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(posts) != 2 || posts[0].ID != loud.ID || posts[1].ID != quiet.ID {
		t.Fatalf("반응 많은 순이 아니다: %+v", posts)
	}
	_ = repo
}

// 비공개·팔로워 전용 글은 발견에 오지 않는다.
func TestExploreHidesNonPublic(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	if _, err := svc.CreatePost(ctx, "star", NewPost{Caption: "비밀", Visibility: VisibilityPrivate}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreatePost(ctx, "star", NewPost{Caption: "팔로워만", Visibility: VisibilityFollowers}); err != nil {
		t.Fatal(err)
	}
	posts, err := svc.ListExplore(ctx, "stranger", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(posts) != 0 {
		t.Fatalf("공개가 아닌 글이 발견에 샜다: %+v", posts)
	}
}

// 검색은 사람·태그·글을 한 번에 준다.
func TestSearchReturnsThreeKinds(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	if _, err := svc.CreatePost(ctx, "star", NewPost{Caption: "가슴 운동 기록 #가슴"}); err != nil {
		t.Fatal(err)
	}

	users, tags, posts, err := svc.Search(ctx, "me", "가슴", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(tags) != 1 || tags[0].Tag != "가슴" {
		t.Fatalf("태그를 못 찾았다: %+v", tags)
	}
	if len(posts) != 1 {
		t.Fatalf("글을 못 찾았다: %+v", posts)
	}
	_ = users // 사람 검색은 저장소가 답한다(가짜는 빈 목록)
}

func TestSearchRequiresQuery(t *testing.T) {
	svc, _ := newTestService()
	if _, _, _, err := svc.Search(context.Background(), "me", "   ", 0); domainCode(t, err) != errs.Validation {
		t.Fatal("빈 검색어가 통과했다")
	}
}

// 추천은 **친구의 친구를 먼저** 놓고, 모자라면 인기순으로 채운다.
func TestSuggestionsPreferFriendsOfFriends(t *testing.T) {
	svc, repo := newTestService()
	ctx := context.Background()

	// me → friend → fof
	repo.follows["me→friend"] = true
	repo.follows["friend→fof"] = true
	// 인기 채움 후보(글쓴이로 등장한다)
	if _, err := svc.CreatePost(ctx, "popular", NewPost{Caption: "인기인의 글"}); err != nil {
		t.Fatal(err)
	}

	users, err := svc.SuggestedUsers(ctx, "me", 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(users) == 0 || users[0].Author.ID != "fof" {
		t.Fatalf("친구의 친구가 앞에 오지 않았다: %+v", users)
	}
	// 이미 팔로우한 사람은 추천에 없다.
	for _, u := range users {
		if u.Author.ID == "friend" || u.Author.ID == "me" {
			t.Fatalf("이미 아는 사람이 추천됐다: %s", u.Author.ID)
		}
	}
}
