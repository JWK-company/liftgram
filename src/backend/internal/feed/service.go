// @plm SRS-007  피드 규칙 — Connect도 proto도 pgx도 import하지 않는다 (레이어 경계)
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 아는 것: **누가 무엇을 볼 수 있고, 누가 무엇을 지울 수 있는가.**
//
// ── 지키는 규칙 ─────────────────────────────────────────────────────────────
//
//	· 소셜은 **로그인이 있어야** 뜻이 있다 — "누구를 팔로우하는가"가 없으면 피드가 정의되지 않는다.
//	  (운동 기록은 계정 없이도 된다. 그건 로컬이고, 이건 서버다.)
//	· 자기 글만 지운다. 댓글은 **쓴 사람과 글 주인**이 지운다(내 글의 악플을 지울 수 있어야 한다).
//	· 좋아요는 멱등이다 — 두 번 눌러도 하나. 카운트는 **실제로 바뀐 때만** 움직인다.
//	· 남의 글이라도 못 보는 것(비공개·차단·내려간 글)은 **NotFound**로 답한다.
//	  "권한이 없다"고 하면 그 글이 존재한다는 사실을 알려 주는 셈이다.
//
// ─────────────────────────────────────────────────────────────────────────────
package feed

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

const (
	maxLimit     = 50
	defaultLimit = 20
	// 한 글에서 가져가는 태그 수. 캡션을 태그로 도배해 트렌딩을 흔들지 못하게 막는다.
	maxHashtags = 10
)

// 유니코드 글자·숫자·밑줄 1~50자. 옛 서버의 정규식과 같다.
var hashtagRe = regexp.MustCompile(`#([\p{L}\p{N}_]{1,50})`)

// ── 도메인 어휘 ──────────────────────────────────────────────────────────────

type Visibility string

const (
	VisibilityPublic    Visibility = "public"
	VisibilityFollowers Visibility = "followers"
	VisibilityPrivate   Visibility = "private"
)

type Kind string

const (
	KindText    Kind = "text"
	KindWorkout Kind = "workout"
	KindImage   Kind = "image"
)

type Author struct {
	ID          string
	DisplayName string
	AvatarURL   string
}

// WorkoutSummary는 오운완에 붙는 운동 요약이다. **서버가 다시 계산하지 않는다** —
// 계산 규칙은 도메인에 하나뿐이고 그 하나가 이미 기기에서 돌았다(ADR-032).
type WorkoutSummary struct {
	WorkoutID       string
	WorkoutName     string
	TotalVolumeKg   float64
	WorkingSets     int32
	DurationSeconds int32
	PRCount         int32
	// 게시 시점의 자랑거리. 나중에 다시 세지 않는다 — 그날의 숫자여야 뜻이 있다.
	StreakDays    int32
	WeeklyReached bool
	Exercises     []WorkoutExercise
}

// 무게는 항상 kg. 보는 사람이 자기 단위로 바꿔 읽는다.
type WorkoutSet struct {
	WeightKg    float64
	Reps        int32
	IsWarmup    bool
	PartialReps int32
}

type WorkoutExercise struct {
	Name string
	Note string
	Sets []WorkoutSet
}

// GearTag는 글에 붙는 착용장비다. 규칙(허용 분류·링크 생성)은 **화면 쪽 도메인**이 갖고 있고,
// 서버는 실어 나르며 분류 이름만 확인한다 — 링크를 서버가 만들지 않는 것이 이 기능의 전제다(ADR-027 D2).
type GearTag struct {
	Category string
	Source   string
	Brand    string
	Note     string
}

type Post struct {
	ID           string
	Author       Author
	Kind         Kind
	Caption      string
	Visibility   Visibility
	Workout      *WorkoutSummary
	MediaURLs    []string
	LikeCount    int32
	CommentCount int32
	LikedByMe    bool
	CreatedAt    time.Time
	// 저장은 나만 본다 — 글쓴이에게 알려지지 않는다.
	BookmarkedByMe bool
	Gear           []GearTag
}

type Comment struct {
	ID         string
	PostID     string
	Author     Author
	Body       string
	CreatedAt  time.Time
	ParentID   string
	LikeCount  int32
	LikedByMe  bool
	ReplyCount int32
}

// Profile은 **남이 보는 나**다. 카운트는 저장하지 않고 셀 때 센다.
type Profile struct {
	Author         Author
	PostCount      int32
	FollowerCount  int32
	FollowingCount int32
	IsSelf         bool
	IsFollowing    bool
	IsBlocked      bool
}

type HashtagCount struct {
	Tag  string
	Uses int32
}

// Cursor는 정렬 키 두 개를 함께 든다 — 같은 시각의 글이 페이지 경계에서 새거나 겹치지 않게.
type Cursor struct {
	CreatedAt time.Time
	ID        string
}

func (c *Cursor) valid() bool { return c != nil && c.ID != "" && !c.CreatedAt.IsZero() }

type NewPost struct {
	Caption        string
	Visibility     Visibility
	Workout        *WorkoutSummary
	MediaURLs      []string
	IdempotencyKey string
	Gear           []GearTag
}

// PostEdit — 올린 뒤 고칠 수 있는 것. 운동 기록은 여기 없다(그때의 사실이라 바꾸지 않는다).
type PostEdit struct {
	Caption string
	// nil이면 공개범위는 그대로 둔다.
	Visibility *Visibility
}

type UserResult struct {
	Author    Author
	Following bool
}

// Repo는 이 도메인이 저장소에 바라는 전부다.
type Repo interface {
	ListFeed(ctx context.Context, viewerID string, cur *Cursor, limit int32) ([]Post, error)
	ListUserPosts(ctx context.Context, viewerID, authorID string, allowed []string, cur *Cursor, limit int32) ([]Post, error)
	GetPost(ctx context.Context, viewerID, postID string) (Post, error)
	CreatePost(ctx context.Context, authorID, id string, p NewPost, kind Kind) (Post, error)
	FindPostByIdempotencyKey(ctx context.Context, authorID, key string) (Post, error)
	UpdatePost(ctx context.Context, postID, authorID string, e PostEdit) (changed bool, err error)
	DeletePost(ctx context.Context, postID, authorID string) error

	// 캡션에서 뽑은 태그를 통째로 갈아 끼운다(차이 계산보다 안전하다).
	SetHashtags(ctx context.Context, postID string, tags []string) error
	ListHashtagPosts(ctx context.Context, viewerID, tag string, cur *Cursor, limit int32) ([]Post, error)
	TrendingHashtags(ctx context.Context, viewerID string, limit int32) ([]HashtagCount, error)

	SetBookmark(ctx context.Context, postID, userID string, on bool) error
	ListBookmarks(ctx context.Context, viewerID string, cur *Cursor, limit int32) ([]Post, error)

	// 실제로 바뀌었으면 true. 멱등 호출(이미 눌렀음)이면 false — 그때는 카운트를 건드리지 않는다.
	SetLike(ctx context.Context, postID, userID string, liked bool) (changed bool, count int32, err error)

	ListComments(ctx context.Context, viewerID, postID string, cur *Cursor, limit int32) ([]Comment, error)
	ListReplies(ctx context.Context, viewerID, parentID string, limit int32) ([]Comment, error)
	CreateComment(ctx context.Context, id, postID, authorID, body, parentID string) (Comment, error)
	GetCommentOwners(ctx context.Context, commentID string) (info CommentOwners, err error)
	DeleteComment(ctx context.Context, commentID, postID, parentID string) error
	SetCommentLike(ctx context.Context, commentID, userID string, liked bool) (changed bool, count int32, err error)

	SetFollow(ctx context.Context, followerID, followeeID string, follow bool) (bool, error)
	IsFollowing(ctx context.Context, followerID, followeeID string) (bool, error)
	SearchUsers(ctx context.Context, viewerID, query string, limit int32) ([]UserResult, error)

	SetBlock(ctx context.Context, blockerID, blockedID string, block bool) error
	IsBlockedByMe(ctx context.Context, viewerID, targetID string) (bool, error)
	IsBlockedEitherWay(ctx context.Context, a, b string) (bool, error)

	// 발견 화면이 쓰는 것들.
	ListExplore(ctx context.Context, viewerID string, limit int32) ([]Post, error)
	SearchPosts(ctx context.Context, viewerID, query string, limit int32) ([]Post, error)
	SearchHashtags(ctx context.Context, viewerID, query string, limit int32) ([]HashtagCount, error)
	SuggestFriendsOfFriends(ctx context.Context, viewerID string, limit int32) ([]UserResult, error)
	SuggestPopular(ctx context.Context, viewerID string, exclude []string, limit int32) ([]UserResult, error)

	GetAuthor(ctx context.Context, userID string) (Author, error)
	ListBlockedUsers(ctx context.Context, viewerID string) ([]Author, error)
	GetProfileCounts(ctx context.Context, userID string) (posts, followers, following int32, err error)
	ListFollows(ctx context.Context, viewerID, userID string, followers bool, limit int32) ([]UserResult, error)
}

// CommentOwners — 댓글 하나에 걸린 세 신원. 삭제 권한 판정과 답글 수 되돌리기에 함께 쓰인다.
type CommentOwners struct {
	CommentAuthorID string
	PostID          string
	PostAuthorID    string
	ParentID        string
}

// MediaChecker는 media 패키지가 채워 준다. 이 도메인은 사진이 어디 저장되는지 모른다.
//
// 왜 필요한가: 사진은 먼저 올리고 **주소를 글에 싣는다.** 주소를 손으로 지어낼 수 있다는 뜻이라
// 남의 서버 그림(`https://evil…`)이나 남이 올린 사진을 내 글에 붙일 수 있다. 둘 다 막는다.
type MediaChecker interface {
	CheckOwned(ctx context.Context, url, ownerID string) (flagged bool, err error)
}

// Notifier는 notification 패키지가 채워 준다.
//
// **오류를 돌려주지 않는다.** 알림은 부수적이라, 저장이 실패해도 좋아요·팔로우 자체는 성공해야 한다
// (그 반대로 만들면 알림 테이블 장애가 소셜 전체를 멈춘다).
type Notifier interface {
	Notify(ctx context.Context, userID, actorID, kind, postID string)
}

type Service struct {
	repo   Repo
	media  MediaChecker
	notify Notifier
	newID  func() string
}

func NewService(repo Repo, checker MediaChecker, notifier Notifier, newID func() string) *Service {
	return &Service{repo: repo, media: checker, notify: notifier, newID: newID}
}

// 알림은 있으면 보내고 없으면 만다 — 테스트는 대개 주입하지 않는다.
func (s *Service) notifyIf(ctx context.Context, userID, actorID, kind, postID string) {
	if s.notify != nil {
		s.notify.Notify(ctx, userID, actorID, kind, postID)
	}
}

// ── 목록 ─────────────────────────────────────────────────────────────────────

func (s *Service) ListFeed(ctx context.Context, viewerID string, cur *Cursor, limit int32) ([]Post, *Cursor, error) {
	if viewerID == "" {
		return nil, nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	n := clampLimit(limit)
	// 한 개를 더 읽어 "다음 페이지가 있는가"를 확인한다 — 따로 COUNT를 돌지 않기 위해서다.
	posts, err := s.repo.ListFeed(ctx, viewerID, cursorOrNil(cur), n+1)
	if err != nil {
		return nil, nil, err
	}
	return page(posts, n)
}

func (s *Service) ListUserPosts(ctx context.Context, viewerID, authorID string, cur *Cursor, limit int32) ([]Post, *Cursor, error) {
	if viewerID == "" {
		return nil, nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if authorID == "" {
		return nil, nil, errs.New(errs.Validation, "사용자를 지정해 주세요")
	}

	allowed, err := s.visibleTo(ctx, viewerID, authorID)
	if err != nil {
		return nil, nil, err
	}
	n := clampLimit(limit)
	posts, err := s.repo.ListUserPosts(ctx, viewerID, authorID, allowed, cursorOrNil(cur), n+1)
	if err != nil {
		return nil, nil, err
	}
	return page(posts, n)
}

// 보는 사람과의 관계가 공개범위를 정한다. 본인 > 팔로워 > 그 외 순으로 넓다.
func (s *Service) visibleTo(ctx context.Context, viewerID, authorID string) ([]string, error) {
	if viewerID == authorID {
		return []string{string(VisibilityPublic), string(VisibilityFollowers), string(VisibilityPrivate)}, nil
	}
	following, err := s.repo.IsFollowing(ctx, viewerID, authorID)
	if err != nil {
		return nil, err
	}
	if following {
		return []string{string(VisibilityPublic), string(VisibilityFollowers)}, nil
	}
	return []string{string(VisibilityPublic)}, nil
}

// ── 쓰기 ─────────────────────────────────────────────────────────────────────

func (s *Service) CreatePost(ctx context.Context, authorID string, p NewPost) (Post, error) {
	if authorID == "" {
		return Post{}, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}

	p.Caption = strings.TrimSpace(p.Caption)
	// 할 말도 운동도 사진도 없으면 글이 아니다.
	if p.Caption == "" && p.Workout == nil && len(p.MediaURLs) == 0 {
		return Post{}, errs.New(errs.Validation, "내용을 입력해 주세요")
	}
	if p.Visibility == "" {
		p.Visibility = VisibilityPublic
	}
	if !validVisibility(p.Visibility) {
		return Post{}, errs.New(errs.Validation, "알 수 없는 공개 범위입니다: %s", p.Visibility)
	}

	// 사진 주소는 **내가 올린 우리 사진**이어야 한다. 저장하기 전에 본다 —
	// 통과한 뒤에 확인하면 잘못된 주소가 이미 글이 되어 있다.
	if len(p.MediaURLs) > 0 {
		if s.media == nil {
			return Post{}, errs.New(errs.Validation, "사진을 실을 수 없습니다")
		}
		for _, url := range p.MediaURLs {
			if _, err := s.media.CheckOwned(ctx, url, authorID); err != nil {
				return Post{}, err
			}
		}
	}

	// 같은 키로 이미 올렸으면 그것을 그대로 돌려준다(재시도가 글을 두 개 만들지 않게).
	if p.IdempotencyKey != "" {
		if existing, err := s.repo.FindPostByIdempotencyKey(ctx, authorID, p.IdempotencyKey); err == nil {
			return existing, nil
		}
	}

	// 장비 태그는 **분류당 하나**다(같은 분류를 두 번 달 이유가 없다).
	// 모르는 분류는 조용히 버린다 — 태그 하나 때문에 글이 안 올라가면 안 된다.
	p.Gear = normalizeGear(p.Gear)

	kind := KindText
	switch {
	case p.Workout != nil:
		kind = KindWorkout
	case len(p.MediaURLs) > 0:
		kind = KindImage
	}
	post, err := s.repo.CreatePost(ctx, authorID, s.newID(), p, kind)
	if err != nil {
		return Post{}, err
	}
	// 태그 색인 실패가 글을 못 올리게 하지는 않는다 — 글은 이미 올라갔고, 태그는 부가 색인이다.
	// (다음 수정 때 다시 뽑히므로 영영 어긋나지도 않는다.)
	if tags := ExtractHashtags(post.Caption); len(tags) > 0 {
		_ = s.repo.SetHashtags(ctx, post.ID, tags)
	}
	return post, nil
}

// 캡션과 공개범위만 고칠 수 있다. 운동 기록은 그때의 사실이라 손대지 않는다.
func (s *Service) UpdatePost(ctx context.Context, viewerID, postID string, e PostEdit) (Post, error) {
	if viewerID == "" {
		return Post{}, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	e.Caption = strings.TrimSpace(e.Caption)
	if e.Visibility != nil && !validVisibility(*e.Visibility) {
		return Post{}, errs.New(errs.Validation, "알 수 없는 공개 범위입니다: %s", *e.Visibility)
	}
	changed, err := s.repo.UpdatePost(ctx, postID, viewerID, e)
	if err != nil {
		return Post{}, err
	}
	// 남의 글이면 한 줄도 바뀌지 않는다 — 있다는 사실조차 알려 주지 않는다.
	if !changed {
		return Post{}, errs.New(errs.NotFound, "게시물을 찾을 수 없습니다")
	}
	// 캡션이 바뀌면 태그도 다시 뽑는다(지우고 새로 넣는다).
	if err := s.repo.SetHashtags(ctx, postID, ExtractHashtags(e.Caption)); err != nil {
		return Post{}, err
	}
	return s.repo.GetPost(ctx, viewerID, postID)
}

func (s *Service) DeletePost(ctx context.Context, viewerID, postID string) error {
	if viewerID == "" {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	// 남의 글이면 아무것도 지워지지 않는다(쿼리에 author_id 조건이 있다).
	return s.repo.DeletePost(ctx, postID, viewerID)
}

// ── 좋아요 ───────────────────────────────────────────────────────────────────

// 두 번 눌러도 하나다. 실제로 바뀌지 않았으면 카운트를 건드리지 않는다.
func (s *Service) SetLike(ctx context.Context, viewerID, postID string, liked bool) (int32, bool, error) {
	if viewerID == "" {
		return 0, false, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	// 볼 수 없는 글에는 좋아요를 누를 수 없다 — 존재 여부도 알려 주지 않는다(NotFound).
	post, err := s.repo.GetPost(ctx, viewerID, postID)
	if err != nil {
		return 0, false, err
	}
	changed, count, err := s.repo.SetLike(ctx, postID, viewerID, liked)
	if err != nil {
		return 0, false, err
	}
	// **실제로 눌렀을 때만** 알린다 — 껐다 켰다를 반복해도 알림이 쌓이지 않는다.
	if liked && changed {
		s.notifyIf(ctx, post.Author.ID, viewerID, "like", postID)
	}
	return count, liked, nil
}

// ── 저장(북마크) ─────────────────────────────────────────────────────────────

// 저장은 **나만 본다.** 좋아요와 달리 카운트도 알림도 없다.
func (s *Service) SetBookmark(ctx context.Context, viewerID, postID string, on bool) (bool, error) {
	if viewerID == "" {
		return false, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	// 볼 수 없는 글은 저장도 못 한다 — 저장이 열람권을 만들어 주면 안 된다.
	if _, err := s.repo.GetPost(ctx, viewerID, postID); err != nil {
		return false, err
	}
	if err := s.repo.SetBookmark(ctx, postID, viewerID, on); err != nil {
		return false, err
	}
	return on, nil
}

func (s *Service) ListBookmarks(ctx context.Context, viewerID string, cur *Cursor, limit int32) ([]Post, *Cursor, error) {
	if viewerID == "" {
		return nil, nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	n := clampLimit(limit)
	posts, err := s.repo.ListBookmarks(ctx, viewerID, cursorOrNil(cur), n+1)
	if err != nil {
		return nil, nil, err
	}
	return page(posts, n)
}

// ── 해시태그 ─────────────────────────────────────────────────────────────────

// 캡션에서 #태그를 뽑는다 — 소문자 정규화 · 중복 제거 · 최대 10개.
// 옛 서버와 **같은 규칙**이다(유니코드 글자/숫자/밑줄, 1~50자). 두 구현이 다른 태그를 만들면
// 이행 중 같은 글이 서로 다른 태그로 색인된다.
func ExtractHashtags(caption string) []string {
	if caption == "" {
		return nil
	}
	seen := map[string]bool{}
	out := make([]string, 0, maxHashtags)
	for _, m := range hashtagRe.FindAllStringSubmatch(caption, -1) {
		tag := strings.ToLower(m[1])
		if seen[tag] {
			continue
		}
		seen[tag] = true
		out = append(out, tag)
		if len(out) >= maxHashtags {
			break
		}
	}
	return out
}

func (s *Service) ListHashtagPosts(ctx context.Context, viewerID, tag string, cur *Cursor, limit int32) ([]Post, *Cursor, error) {
	if viewerID == "" {
		return nil, nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	tag = strings.ToLower(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(tag), "#")))
	if tag == "" {
		return nil, nil, errs.New(errs.Validation, "태그를 지정해 주세요")
	}
	n := clampLimit(limit)
	posts, err := s.repo.ListHashtagPosts(ctx, viewerID, tag, cursorOrNil(cur), n+1)
	if err != nil {
		return nil, nil, err
	}
	return page(posts, n)
}

func (s *Service) TrendingHashtags(ctx context.Context, viewerID string, limit int32) ([]HashtagCount, error) {
	if viewerID == "" {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	return s.repo.TrendingHashtags(ctx, viewerID, clampLimit(limit))
}

// ── 댓글 ─────────────────────────────────────────────────────────────────────

func (s *Service) ListComments(ctx context.Context, viewerID, postID string, cur *Cursor, limit int32) ([]Comment, *Cursor, error) {
	if viewerID == "" {
		return nil, nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if _, err := s.repo.GetPost(ctx, viewerID, postID); err != nil {
		return nil, nil, err
	}
	n := clampLimit(limit)
	rows, err := s.repo.ListComments(ctx, viewerID, postID, cursorOrNil(cur), n+1)
	if err != nil {
		return nil, nil, err
	}
	if int32(len(rows)) <= n {
		return rows, nil, nil
	}
	rows = rows[:n]
	last := rows[len(rows)-1]
	return rows, &Cursor{CreatedAt: last.CreatedAt, ID: last.ID}, nil
}

// 답글은 **한 단계까지만**이다. 답글에 답글을 달면 그 답글의 부모(루트)에 붙인다 —
// 깊이가 늘면 화면이 옆으로 밀려 읽을 수 없게 되고, 되돌릴 방법이 없다.
func (s *Service) CreateComment(ctx context.Context, viewerID, postID, body, parentID string) (Comment, error) {
	if viewerID == "" {
		return Comment{}, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	body = strings.TrimSpace(body)
	if body == "" {
		return Comment{}, errs.New(errs.Validation, "댓글을 입력해 주세요")
	}
	post, err := s.repo.GetPost(ctx, viewerID, postID)
	if err != nil {
		return Comment{}, err
	}
	// 답글이면 **부모 댓글을 쓴 사람**에게 알린다(글쓴이가 아니라) — 대화가 이어지는 쪽이 그쪽이다.
	notifyTarget := post.Author.ID
	if parentID != "" {
		parent, err := s.repo.GetCommentOwners(ctx, parentID)
		if err != nil {
			return Comment{}, err
		}
		// 다른 글의 댓글에 답글을 달 수는 없다.
		if parent.PostID != postID {
			return Comment{}, errs.New(errs.Validation, "답글 대상이 이 게시물의 댓글이 아닙니다")
		}
		notifyTarget = parent.CommentAuthorID
		if parent.ParentID != "" {
			parentID = parent.ParentID // 깊이 1로 눌러 붙인다
		}
	}
	c, err := s.repo.CreateComment(ctx, s.newID(), postID, viewerID, body, parentID)
	if err != nil {
		return Comment{}, err
	}
	s.notifyIf(ctx, notifyTarget, viewerID, "comment", postID)
	return c, nil
}

func (s *Service) ListReplies(ctx context.Context, viewerID, commentID string, limit int32) ([]Comment, error) {
	if viewerID == "" {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	owners, err := s.repo.GetCommentOwners(ctx, commentID)
	if err != nil {
		return nil, err
	}
	// 글을 볼 수 없으면 답글도 볼 수 없다.
	if _, err := s.repo.GetPost(ctx, viewerID, owners.PostID); err != nil {
		return nil, err
	}
	return s.repo.ListReplies(ctx, viewerID, commentID, clampLimit(limit))
}

// 댓글 좋아요도 멱등이다.
func (s *Service) SetCommentLike(ctx context.Context, viewerID, commentID string, liked bool) (int32, bool, error) {
	if viewerID == "" {
		return 0, false, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	owners, err := s.repo.GetCommentOwners(ctx, commentID)
	if err != nil {
		return 0, false, err
	}
	if _, err := s.repo.GetPost(ctx, viewerID, owners.PostID); err != nil {
		return 0, false, err
	}
	_, count, err := s.repo.SetCommentLike(ctx, commentID, viewerID, liked)
	if err != nil {
		return 0, false, err
	}
	return count, liked, nil
}

// 댓글은 **쓴 사람과 글 주인**이 지울 수 있다 — 내 글에 달린 악플을 내가 지울 수 있어야 한다.
func (s *Service) DeleteComment(ctx context.Context, viewerID, commentID string) error {
	if viewerID == "" {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	owners, err := s.repo.GetCommentOwners(ctx, commentID)
	if err != nil {
		return err
	}
	if viewerID != owners.CommentAuthorID && viewerID != owners.PostAuthorID {
		return errs.New(errs.Forbidden, "이 댓글을 삭제할 수 없습니다")
	}
	return s.repo.DeleteComment(ctx, commentID, owners.PostID, owners.ParentID)
}

// ── 팔로우·검색 ──────────────────────────────────────────────────────────────

func (s *Service) SetFollow(ctx context.Context, viewerID, targetID string, follow bool) (bool, error) {
	if viewerID == "" {
		return false, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if viewerID == targetID {
		return false, errs.New(errs.Validation, "자기 자신은 팔로우할 수 없습니다")
	}
	changed, err := s.repo.SetFollow(ctx, viewerID, targetID, follow)
	if err != nil {
		return false, err
	}
	// 껐다 켜기를 반복해도 알림이 쌓이지 않게 **실제로 바뀐 때만** 알린다.
	if follow && changed {
		s.notifyIf(ctx, targetID, viewerID, "follow", "")
	}
	return follow, nil
}

// 차단하면 팔로우 관계도 양쪽 다 끊는다 — 남겨 두면 차단을 푸는 순간 다시 이어진다.
func (s *Service) SetBlock(ctx context.Context, viewerID, targetID string, block bool) (bool, error) {
	if viewerID == "" {
		return false, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if viewerID == targetID {
		return false, errs.New(errs.Validation, "자기 자신은 차단할 수 없습니다")
	}
	if err := s.repo.SetBlock(ctx, viewerID, targetID, block); err != nil {
		return false, err
	}
	return block, nil
}

// 공개 프로필. 나를 차단한 사람의 프로필은 **없는 것처럼** 답한다.
func (s *Service) GetProfile(ctx context.Context, viewerID, userID string) (Profile, error) {
	if viewerID == "" {
		return Profile{}, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if userID == "" {
		return Profile{}, errs.New(errs.Validation, "사용자를 지정해 주세요")
	}
	if viewerID != userID {
		blocked, err := s.repo.IsBlockedEitherWay(ctx, viewerID, userID)
		if err != nil {
			return Profile{}, err
		}
		if blocked {
			// 내가 차단한 경우에는 프로필을 보여 준다(차단 해제 버튼이 거기 있다).
			byMe, err := s.repo.IsBlockedByMe(ctx, viewerID, userID)
			if err != nil {
				return Profile{}, err
			}
			if !byMe {
				return Profile{}, errs.New(errs.NotFound, "사용자를 찾을 수 없습니다")
			}
		}
	}

	author, err := s.repo.GetAuthor(ctx, userID)
	if err != nil {
		return Profile{}, err
	}
	posts, followers, following, err := s.repo.GetProfileCounts(ctx, userID)
	if err != nil {
		return Profile{}, err
	}
	p := Profile{
		Author:         author,
		PostCount:      posts,
		FollowerCount:  followers,
		FollowingCount: following,
		IsSelf:         viewerID == userID,
	}
	if p.IsSelf {
		return p, nil
	}
	if p.IsFollowing, err = s.repo.IsFollowing(ctx, viewerID, userID); err != nil {
		return Profile{}, err
	}
	if p.IsBlocked, err = s.repo.IsBlockedByMe(ctx, viewerID, userID); err != nil {
		return Profile{}, err
	}
	return p, nil
}

// ── 발견(Explore) ────────────────────────────────────────────────────────────

// ListExplore는 **팔로우와 무관하게** 반응이 많은 공개 글을 준다 —
// 아직 아무도 팔로우하지 않은 사람에게 피드가 비어 보이지 않게 하는 화면이다.
func (s *Service) ListExplore(ctx context.Context, viewerID string, limit int32) ([]Post, error) {
	if viewerID == "" {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	return s.repo.ListExplore(ctx, viewerID, clampLimit(limit))
}

// Search는 사람·태그·글을 **한 번에** 찾는다. 셋 중 하나가 실패하면 전체가 실패한다 —
// 부분 결과를 성공처럼 돌려주면 "없다"와 "못 찾았다"를 화면이 구분할 수 없다.
func (s *Service) Search(ctx context.Context, viewerID, query string, limit int32) ([]UserResult, []HashtagCount, []Post, error) {
	if viewerID == "" {
		return nil, nil, nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil, nil, errs.New(errs.Validation, "검색어를 입력해 주세요")
	}
	n := clampLimit(limit)

	users, err := s.repo.SearchUsers(ctx, viewerID, query, n)
	if err != nil {
		return nil, nil, nil, err
	}
	tags, err := s.repo.SearchHashtags(ctx, viewerID, strings.ToLower(query), n)
	if err != nil {
		return nil, nil, nil, err
	}
	posts, err := s.repo.SearchPosts(ctx, viewerID, query, n)
	if err != nil {
		return nil, nil, nil, err
	}
	return users, tags, posts, nil
}

// SuggestedUsers는 팔로우할 만한 사람을 준다.
//
// **친구의 친구를 먼저** 놓는다 — 아는 사람과 겹칠수록 팔로우할 이유가 분명하다.
// 그것만으로 모자라면 팔로워가 많은 사람으로 채운다(새 계정에게는 이쪽이 전부다).
func (s *Service) SuggestedUsers(ctx context.Context, viewerID string, limit int32) ([]UserResult, error) {
	if viewerID == "" {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	n := clampLimit(limit)

	out, err := s.repo.SuggestFriendsOfFriends(ctx, viewerID, n)
	if err != nil {
		return nil, err
	}
	if int32(len(out)) >= n {
		return out[:n], nil
	}

	// 이미 고른 사람은 두 번 넣지 않는다.
	exclude := make([]string, 0, len(out))
	for _, u := range out {
		exclude = append(exclude, u.Author.ID)
	}
	popular, err := s.repo.SuggestPopular(ctx, viewerID, exclude, n-int32(len(out)))
	if err != nil {
		return nil, err
	}
	return append(out, popular...), nil
}

// 내가 차단한 사람들 — 풀려면 여기서 찾아야 한다(나를 차단한 사람은 알려 주지 않는다).
func (s *Service) ListBlockedUsers(ctx context.Context, viewerID string) ([]Author, error) {
	if viewerID == "" {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	return s.repo.ListBlockedUsers(ctx, viewerID)
}

func (s *Service) ListFollows(ctx context.Context, viewerID, userID string, followers bool, limit int32) ([]UserResult, error) {
	if viewerID == "" {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if userID == "" {
		return nil, errs.New(errs.Validation, "사용자를 지정해 주세요")
	}
	return s.repo.ListFollows(ctx, viewerID, userID, followers, clampLimit(limit))
}

func (s *Service) SearchUsers(ctx context.Context, viewerID, query string, limit int32) ([]UserResult, error) {
	if viewerID == "" {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, errs.New(errs.Validation, "검색어를 입력해 주세요")
	}
	return s.repo.SearchUsers(ctx, viewerID, query, clampLimit(limit))
}

// ── 내부 ─────────────────────────────────────────────────────────────────────

func clampLimit(n int32) int32 {
	if n <= 0 {
		return defaultLimit
	}
	if n > maxLimit {
		return maxLimit
	}
	return n
}

func cursorOrNil(c *Cursor) *Cursor {
	if c.valid() {
		return c
	}
	return nil
}

// 한 개 더 읽어 온 결과를 페이지와 다음 커서로 나눈다.
func page(posts []Post, n int32) ([]Post, *Cursor, error) {
	if int32(len(posts)) <= n {
		return posts, nil, nil
	}
	posts = posts[:n]
	last := posts[len(posts)-1]
	return posts, &Cursor{CreatedAt: last.CreatedAt, ID: last.ID}, nil
}

// 허용 분류는 화면 쪽 도메인(core의 GEAR_CATEGORIES)과 **같은 목록**이어야 한다.
var gearCategories = map[string]bool{
	"wristWrap": true, "strap": true, "belt": true, "kneeSleeve": true,
	"gloves": true, "shoes": true, "chalk": true, "armSleeve": true,
}

func normalizeGear(tags []GearTag) []GearTag {
	if len(tags) == 0 {
		return nil
	}
	seen := map[string]bool{}
	out := make([]GearTag, 0, len(tags))
	for _, t := range tags {
		if !gearCategories[t.Category] || seen[t.Category] {
			continue
		}
		seen[t.Category] = true
		if t.Source != "auto" {
			t.Source = "user"
		}
		t.Brand = strings.TrimSpace(t.Brand)
		t.Note = strings.TrimSpace(t.Note)
		out = append(out, t)
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func validVisibility(v Visibility) bool {
	switch v {
	case VisibilityPublic, VisibilityFollowers, VisibilityPrivate:
		return true
	}
	return false
}
