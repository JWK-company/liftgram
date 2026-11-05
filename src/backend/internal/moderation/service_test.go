// @plm SRS-020  모더레이션 규칙 테스트 — DB 없이
//
// 여기서 보는 것은 **무엇을 신고할 수 있고, 누가 검토하고, 내린다는 것이 무슨 뜻인가**다.
// 이게 틀리면 신고 창구가 남의 비공개 글의 존재를 알려 주거나, 내려간 글의 사진이 계속 나간다.
package moderation

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// ── 가짜 저장소 ──────────────────────────────────────────────────────────────

type reportRow struct {
	id, targetID, reporterID, reason, details string
	targetType                                TargetType
	status                                    string
	createdAt                                 time.Time
}

type postRow struct {
	authorID, visibility, status string
}

func (f *fakeRepo) UserRole(_ context.Context, userID string) (string, bool, error) {
	if r, ok := f.dbRoles[userID]; ok {
		return r, true, nil
	}
	return "admin", true, nil
}

type fakeRepo struct {
	dbRoles map[string]string // 비어 있으면 누구나 admin — 역할 인자 시험을 그대로 둔다
	reports []reportRow
	posts   map[string]postRow
	targets map[string]Target // "type:id"
	follows map[string]bool   // "follower→followee"
	auto    []QueueItem
	// 처리 결과 — 무엇이 어떻게 바뀌었는지 확인용.
	set          []string        // "type:id:status:removed:mediaKeys"
	blocks       map[string]bool // "a>b"
	sensitive    bool
	blockedMedia []string
	resolvedAs   []string // "type:id:status:action"
	now          time.Time
	seq          int
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		posts:   map[string]postRow{},
		targets: map[string]Target{},
		follows: map[string]bool{},
		now:     time.Date(2026, 8, 3, 9, 0, 0, 0, time.UTC),
	}
}

func (f *fakeRepo) CreateReport(_ context.Context, id string, t TargetType, targetID, reporterID, reason, details string) error {
	// 유일 제약과 같은 판단: 같은 사람·같은 대상은 한 건이다.
	for _, r := range f.reports {
		if r.reporterID == reporterID && r.targetType == t && r.targetID == targetID {
			return nil
		}
	}
	f.seq++
	f.reports = append(f.reports, reportRow{
		id: id, targetType: t, targetID: targetID, reporterID: reporterID,
		reason: reason, details: details, status: "pending",
		createdAt: f.now.Add(time.Duration(f.seq) * time.Second),
	})
	return nil
}

func (f *fakeRepo) ListPendingReports(_ context.Context, _ int32) ([]Report, error) {
	var out []Report
	for i := len(f.reports) - 1; i >= 0; i-- { // 최신부터
		r := f.reports[i]
		if r.status != "pending" {
			continue
		}
		out = append(out, Report{TargetType: r.targetType, TargetID: r.targetID, Reason: r.reason, CreatedAt: r.createdAt})
	}
	return out, nil
}

func (f *fakeRepo) ResolveReports(_ context.Context, t TargetType, targetID, _, status, action string) error {
	for i := range f.reports {
		if f.reports[i].targetType == t && f.reports[i].targetID == targetID && f.reports[i].status == "pending" {
			f.reports[i].status = status
		}
	}
	f.resolvedAs = append(f.resolvedAs, string(t)+":"+targetID+":"+status+":"+action)
	return nil
}

func (f *fakeRepo) CountPendingReporters(_ context.Context, t TargetType, targetID string) (int, error) {
	n := 0
	for _, r := range f.reports {
		if r.targetType == t && r.targetID == targetID {
			n++
		}
	}
	return n, nil
}

func (f *fakeRepo) GetTarget(_ context.Context, t TargetType, targetID string) (Target, bool, error) {
	target, ok := f.targets[string(t)+":"+targetID]
	return target, ok, nil
}

func (f *fakeRepo) PostVisibility(_ context.Context, postID string) (string, string, string, bool, error) {
	p, ok := f.posts[postID]
	if !ok {
		return "", "", "", false, nil
	}
	return p.authorID, p.visibility, p.status, true, nil
}

func (f *fakeRepo) IsFollowing(_ context.Context, a, b string) (bool, error) {
	return f.follows[a+"→"+b], nil
}

func (f *fakeRepo) IsBlockedEitherWay(_ context.Context, a, b string) (bool, error) {
	return f.blocks[a+">"+b] || f.blocks[b+">"+a], nil
}

func (f *fakeRepo) HasSensitivePendingReport(_ context.Context, t TargetType, targetID string) (bool, error) {
	return f.sensitive, nil
}

func (f *fakeRepo) HoldWithMediaBlocked(_ context.Context, t TargetType, targetID string, mediaKeys []string) error {
	f.blockedMedia = append(f.blockedMedia, mediaKeys...)
	return f.SetModeration(context.Background(), t, targetID, "pending", "", false, nil)
}

func (f *fakeRepo) ListAutoPending(_ context.Context, _ int32) ([]QueueItem, error) {
	return f.auto, nil
}

func (f *fakeRepo) SetModeration(_ context.Context, t TargetType, targetID, status, _ string, removed bool, mediaKeys []string) error {
	f.set = append(f.set, string(t)+":"+targetID+":"+status+":"+boolStr(removed)+":"+strings.Join(mediaKeys, ","))
	if target, ok := f.targets[string(t)+":"+targetID]; ok {
		target.ModerationStatus = status
		f.targets[string(t)+":"+targetID] = target
	}
	return nil
}

func boolStr(b bool) string {
	if b {
		return "removed"
	}
	return "kept"
}

func newTestService() (*Service, *fakeRepo) {
	repo := newFakeRepo()
	n := 0
	return NewService(repo, func() string {
		n++
		return "rep-" + string(rune('a'+n-1))
	}), repo
}

func domainCode(t *testing.T, err error) errs.Code {
	t.Helper()
	var de *errs.DomainError
	if !errors.As(err, &de) {
		t.Fatalf("도메인 오류가 아님: %v", err)
	}
	return de.Code
}

// 공개 글 하나를 세워 둔다.
func (f *fakeRepo) seedPost(id, author, visibility string) {
	f.posts[id] = postRow{authorID: author, visibility: visibility, status: "approved"}
	f.targets["post:"+id] = Target{
		AuthorID: author, ModerationStatus: "approved",
		Author:  Author{ID: author, DisplayName: author},
		Preview: Preview{Kind: "text", Text: "본문"},
	}
}

// ── 신고 ─────────────────────────────────────────────────────────────────────

// 역할을 회수하면 토큰이 살아 있어도 바로 막힌다(SPEC-032).
func TestRevokedModeratorIsBlockedImmediately(t *testing.T) {
	repo := newFakeRepo()
	repo.dbRoles = map[string]string{"m": "user"}
	svc := NewService(repo, func() string { return "id" })
	_, err := svc.ListQueue(context.Background(), "m", "moderator", 0)
	if domainCode(t, err) != errs.Forbidden {
		t.Fatalf("막혀야 한다: %v", err)
	}
}

func TestReportRequiresLogin(t *testing.T) {
	svc, repo := newTestService()
	repo.seedPost("p1", "author", "public")
	if err := svc.Report(context.Background(), "", TargetPost, "p1", "spam", ""); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("로그인 없이 신고했다")
	}
}

func TestReportRejectsUnknownReason(t *testing.T) {
	svc, repo := newTestService()
	repo.seedPost("p1", "author", "public")
	if err := svc.Report(context.Background(), "me", TargetPost, "p1", "그냥싫어서", ""); domainCode(t, err) != errs.Validation {
		t.Fatal("목록에 없는 사유가 통과했다")
	}
}

// 내 것은 신고할 수 없다 — 지우면 된다.
func TestCannotReportOwnContent(t *testing.T) {
	svc, repo := newTestService()
	repo.seedPost("p1", "me", "public")
	if err := svc.Report(context.Background(), "me", TargetPost, "p1", "spam", ""); domainCode(t, err) != errs.Validation {
		t.Fatal("내 글을 신고했다")
	}
}

// **못 보는 것은 없는 것이다** — 신고 창구가 존재 여부를 알려 주면 안 된다.
func TestCannotReportInvisibleContent(t *testing.T) {
	svc, repo := newTestService()
	repo.seedPost("secret", "author", "private")

	if err := svc.Report(context.Background(), "stranger", TargetPost, "secret", "spam", ""); domainCode(t, err) != errs.NotFound {
		t.Fatal("남의 비공개 글을 신고할 수 있다 — 존재가 새 나간다")
	}
	// 아예 없는 글도 **같은 답**이어야 한다.
	if err := svc.Report(context.Background(), "stranger", TargetPost, "없는글", "spam", ""); domainCode(t, err) != errs.NotFound {
		t.Fatal("없는 글과 못 보는 글의 답이 다르다")
	}
}

// 팔로워 전용 글은 팔로우해야 신고할 수 있다(볼 수 있어야 신고한다).
func TestFollowersOnlyPostNeedsFollow(t *testing.T) {
	svc, repo := newTestService()
	repo.seedPost("p1", "author", "followers")

	if err := svc.Report(context.Background(), "fan", TargetPost, "p1", "spam", ""); domainCode(t, err) != errs.NotFound {
		t.Fatal("팔로우하지 않았는데 신고됐다")
	}
	repo.follows["fan→author"] = true
	if err := svc.Report(context.Background(), "fan", TargetPost, "p1", "spam", ""); err != nil {
		t.Fatalf("팔로워인데 거절됐다: %v", err)
	}
}

// 같은 사람이 여러 번 신고해도 한 건이다.
func TestReportIsIdempotentPerReporter(t *testing.T) {
	svc, repo := newTestService()
	repo.seedPost("p1", "author", "public")
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		if err := svc.Report(ctx, "me", TargetPost, "p1", "spam", ""); err != nil {
			t.Fatal(err)
		}
	}
	if len(repo.reports) != 1 {
		t.Fatalf("신고가 %d건 쌓였다", len(repo.reports))
	}
}

// 댓글은 **부모 글**을 볼 수 있어야 신고할 수 있다.
func TestCommentFollowsParentVisibility(t *testing.T) {
	svc, repo := newTestService()
	repo.posts["p1"] = postRow{authorID: "author", visibility: "private", status: "approved"}
	repo.targets["comment:c1"] = Target{
		AuthorID: "commenter", ModerationStatus: "approved", PostID: "p1",
		Author: Author{ID: "commenter"}, Preview: Preview{Kind: "comment", Text: "댓글"},
	}

	if err := svc.Report(context.Background(), "stranger", TargetComment, "c1", "spam", ""); domainCode(t, err) != errs.NotFound {
		t.Fatal("못 보는 글의 댓글을 신고할 수 있다")
	}
}

// 이미 사라진 스토리는 신고할 것이 없다.
func TestExpiredStoryCannotBeReported(t *testing.T) {
	svc, repo := newTestService()
	repo.targets["story:s1"] = Target{
		AuthorID: "author", ModerationStatus: "approved",
		ExpiresAt: time.Now().Add(-time.Hour),
		Author:    Author{ID: "author"},
	}
	repo.follows["fan→author"] = true

	if err := svc.Report(context.Background(), "fan", TargetStory, "s1", "spam", ""); domainCode(t, err) != errs.NotFound {
		t.Fatal("만료된 스토리가 신고됐다")
	}
}

// ── 큐 ───────────────────────────────────────────────────────────────────────

// 검토는 **역할이 있는 사람만**.
func TestQueueRequiresModerator(t *testing.T) {
	svc, _ := newTestService()
	// 로그인하지 않은 것과 권한이 없는 것은 **다른 답**이다 —
	// 401이어야 화면이 토큰을 갱신해 다시 시도한다(403이면 정당한 모더레이터도 막힌다).
	if _, err := svc.ListQueue(context.Background(), "", "", 0); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("로그인하지 않은 요청이 401이 아니다")
	}
	if _, err := svc.ListQueue(context.Background(), "u1", "user", 0); domainCode(t, err) != errs.Forbidden {
		t.Fatal("일반 사용자가 큐를 봤다")
	}
	for _, role := range []string{"moderator", "admin"} {
		if _, err := svc.ListQueue(context.Background(), "u1", role, 0); err != nil {
			t.Fatalf("%q 역할이 막혔다: %v", role, err)
		}
	}
}

// 같은 대상의 신고는 **한 줄로 묶인다** — 사유는 모으고 건수는 센다.
func TestQueueGroupsReportsPerTarget(t *testing.T) {
	svc, repo := newTestService()
	repo.seedPost("p1", "author", "public")
	ctx := context.Background()

	for i, reporter := range []string{"a", "b", "c"} {
		reason := "spam"
		if i == 2 {
			reason = "nudity"
		}
		if err := svc.Report(ctx, reporter, TargetPost, "p1", reason, ""); err != nil {
			t.Fatal(err)
		}
	}

	items, err := svc.ListQueue(ctx, "mod", "moderator", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("한 줄로 묶이지 않았다: %d줄", len(items))
	}
	if items[0].ReportCount != 3 {
		t.Fatalf("건수가 틀리다: %d", items[0].ReportCount)
	}
	if len(items[0].Reasons) != 2 || items[0].Reasons[0] != "nudity" || items[0].Reasons[1] != "spam" {
		t.Fatalf("사유가 틀리다(이름순이어야 한다): %v", items[0].Reasons)
	}
	if items[0].Source != "report" {
		t.Fatalf("출처가 틀리다: %s", items[0].Source)
	}
}

// 신고가 없어도 **자동 보류**는 큐에 올라온다.
func TestQueueIncludesAutoPending(t *testing.T) {
	svc, repo := newTestService()
	repo.auto = []QueueItem{{
		TargetType: TargetPost, TargetID: "auto1", Source: "auto",
		Reasons: []string{"auto_scan"}, CreatedAt: repo.now,
	}}
	items, err := svc.ListQueue(context.Background(), "mod", "moderator", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Source != "auto" {
		t.Fatalf("자동 보류가 큐에 없다: %+v", items)
	}
}

// 이미 내려간 대상은 큐에 두지 않는다(같은 것을 두 번 보지 않게).
func TestQueueSkipsAlreadyRemoved(t *testing.T) {
	svc, repo := newTestService()
	repo.seedPost("p1", "author", "public")
	ctx := context.Background()
	if err := svc.Report(ctx, "me", TargetPost, "p1", "spam", ""); err != nil {
		t.Fatal(err)
	}
	target := repo.targets["post:p1"]
	target.ModerationStatus = "removed"
	repo.targets["post:p1"] = target

	items, err := svc.ListQueue(ctx, "mod", "moderator", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("이미 내려간 글이 큐에 남았다: %+v", items)
	}
}

// ── 처리 ─────────────────────────────────────────────────────────────────────

func TestResolveRequiresModerator(t *testing.T) {
	svc, repo := newTestService()
	repo.seedPost("p1", "author", "public")
	if err := svc.Resolve(context.Background(), "me", "user", TargetPost, "p1", true, ""); domainCode(t, err) != errs.Forbidden {
		t.Fatal("일반 사용자가 글을 내렸다")
	}
	if err := svc.Resolve(context.Background(), "", "", TargetPost, "p1", true, ""); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("로그인하지 않은 요청이 401이 아니다")
	}
}

// 제거하면 **사진의 바이트까지** 막는다 — "내려갔다"가 참이려면 파일도 안 보여야 한다.
func TestRemoveAlsoFlagsMedia(t *testing.T) {
	svc, repo := newTestService()
	repo.targets["post:p1"] = Target{
		AuthorID: "author", ModerationStatus: "approved",
		Preview: Preview{Kind: "image", MediaURL: "/media/file/abc.png"},
	}

	if err := svc.Resolve(context.Background(), "mod", "moderator", TargetPost, "p1", true, "노출"); err != nil {
		t.Fatal(err)
	}
	if len(repo.set) != 1 || repo.set[0] != "post:p1:removed:removed:abc.png" {
		t.Fatalf("사진이 함께 막히지 않았다: %v", repo.set)
	}
	if len(repo.resolvedAs) != 1 || repo.resolvedAs[0] != "post:p1:resolved:removed" {
		t.Fatalf("신고가 종결되지 않았다: %v", repo.resolvedAs)
	}
}

// 승인하면 자동 보류가 풀리고 사진도 다시 나간다.
func TestApproveUnflagsMedia(t *testing.T) {
	svc, repo := newTestService()
	repo.targets["story:s1"] = Target{
		AuthorID: "author", ModerationStatus: "pending",
		Preview: Preview{Kind: "story", MediaURL: "/media/file/x.jpg"},
	}

	if err := svc.Resolve(context.Background(), "mod", "admin", TargetStory, "s1", false, ""); err != nil {
		t.Fatal(err)
	}
	if len(repo.set) != 1 || repo.set[0] != "story:s1:approved:kept:x.jpg" {
		t.Fatalf("승인이 반영되지 않았다: %v", repo.set)
	}
	if repo.resolvedAs[0] != "story:s1:dismissed:dismissed" {
		t.Fatalf("신고가 기각으로 종결되지 않았다: %v", repo.resolvedAs)
	}
}

// 바깥 주소가 실려 있으면 막을 것이 없다(우리 저장소의 파일이 아니다).
func TestMediaKeyOnlyMatchesOurPath(t *testing.T) {
	if MediaKey("/media/file/abc.png") != "abc.png" {
		t.Fatal("우리 경로를 못 읽었다")
	}
	for _, url := range []string{"", "https://evil.example/x.png", "/media/file/../etc/passwd", "/other/abc.png"} {
		if k := MediaKey(url); k != "" {
			t.Fatalf("엉뚱한 주소에서 키를 뽑았다: %q → %q", url, k)
		}
	}
}

func TestThreeReportersHoldTheTarget(t *testing.T) {
	repo := newFakeRepo()
	repo.posts["p1"] = postRow{authorID: "author", visibility: "public", status: "approved"}
	repo.targets["post:p1"] = Target{AuthorID: "author", ModerationStatus: "approved"}
	n := 0
	svc := NewService(repo, func() string { n++; return "r" + strconv.Itoa(n) })
	ctx := context.Background()
	for _, who := range []string{"a", "a", "b"} { // 같은 사람이 두 번 눌러도 한 명이다
		if err := svc.Report(ctx, who, TargetPost, "p1", "nudity", ""); err != nil {
			t.Fatal(err)
		}
	}
	if len(repo.set) != 0 {
		t.Fatalf("두 명으로는 숨기지 않는다: %v", repo.set)
	}
	if err := svc.Report(ctx, "c", TargetPost, "p1", "nudity", ""); err != nil {
		t.Fatal(err)
	}
	if len(repo.set) != 1 || !strings.HasPrefix(repo.set[0], "post:p1:pending:") {
		t.Fatalf("검토 대기로 숨긴다: %v", repo.set)
	}
}

// 이미 다른 사유로 숨겨진 글에 나체 신고가 쌓여도 파일은 막는다.
func TestSensitiveReportBlocksAlreadyPendingTarget(t *testing.T) {
	repo := newFakeRepo()
	repo.posts["p1"] = postRow{authorID: "author", visibility: "public", status: "approved"}
	repo.targets["post:p1"] = Target{AuthorID: "author", ModerationStatus: "pending", MediaURLs: []string{"/media/file/k1"}}
	repo.sensitive = true
	n := 0
	svc := NewService(repo, func() string { n++; return "r" + strconv.Itoa(n) })
	for _, who := range []string{"a", "b", "c"} {
		if err := svc.Report(context.Background(), who, TargetPost, "p1", "nudity", ""); err != nil {
			t.Fatal(err)
		}
	}
	if len(repo.blockedMedia) != 1 || repo.blockedMedia[0] != "k1" {
		t.Fatalf("파일까지 막는다: %v", repo.blockedMedia)
	}
}

func TestBlockedReporterCannotReport(t *testing.T) {
	repo := newFakeRepo()
	repo.seedPost("p1", "author", "public")
	repo.blocks = map[string]bool{"author>troll": true}
	svc := NewService(repo, func() string { return "id" })
	err := svc.Report(context.Background(), "troll", TargetPost, "p1", "nudity", "")
	if domainCode(t, err) != errs.NotFound {
		t.Fatalf("차단 관계면 없는 것으로 답한다: %v", err)
	}
}

func TestRemoveBlocksEveryPhoto(t *testing.T) {
	repo := newFakeRepo()
	repo.targets["post:p1"] = Target{
		AuthorID: "author", ModerationStatus: "approved",
		MediaURLs: []string{"/media/file/a.jpg", "/media/file/b.jpg"},
		Preview:   Preview{MediaURL: "/media/file/a.jpg"},
	}
	svc := NewService(repo, func() string { return "id" })
	if err := svc.Resolve(context.Background(), "m", "admin", TargetPost, "p1", true, ""); err != nil {
		t.Fatal(err)
	}
	if got := repo.set[len(repo.set)-1]; !strings.HasSuffix(got, ":a.jpg,b.jpg") {
		t.Fatalf("모든 사진을 막아야 한다: %s", got)
	}
}

func TestGetReviewMediaIsForModeratorsOnly(t *testing.T) {
	svc := NewService(newFakeRepo(), func() string { return "id" }).WithReviewMedia(fakeMedia{})
	if _, _, err := svc.GetReviewMedia(context.Background(), "u", "user", "/media/file/a.jpg"); domainCode(t, err) != errs.Forbidden {
		t.Fatalf("일반 사용자는 볼 수 없다: %v", err)
	}
	for _, bad := range []string{"https://evil/x.jpg", "/media/file/../x", "/media/file/.hidden"} {
		if _, _, err := svc.GetReviewMedia(context.Background(), "m", "admin", bad); domainCode(t, err) != errs.NotFound {
			t.Fatalf("%s: 우리 사진 주소만 받는다: %v", bad, err)
		}
	}
	ct, data, err := svc.GetReviewMedia(context.Background(), "m", "moderator", "/media/file/a.jpg")
	if err != nil || ct != "image/jpeg" || string(data) != "a.jpg" {
		t.Fatalf("검토자는 볼 수 있다: %s %s %v", ct, data, err)
	}
}

type fakeMedia struct{}

func (fakeMedia) ReadForReview(_ context.Context, key string) (string, []byte, error) {
	return "image/jpeg", []byte(key), nil
}
