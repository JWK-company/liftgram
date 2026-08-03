// @plm SRS-019  스토리 규칙 테스트 — DB도 저장소도 없이, 시계를 손으로 돌려 가며
//
// 여기서 보는 것은 **언제 사라지고, 누구에게 보이고, 어떤 순서로 놓이는가**다.
package story

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// ── 가짜들 ───────────────────────────────────────────────────────────────────

type fakeRepo struct {
	rows    []row
	authors map[string]Author
	// "follower→followee" — 진짜 필터는 SQL이 한다.
	follows map[string]bool
	// 시계를 흉내 내기 위해 만료 판정을 여기서 한다(진짜는 SQL의 expires_at > now()).
	now func() time.Time
}

type row struct {
	story  Story
	status string
}

func newFakeRepo(now func() time.Time) *fakeRepo {
	return &fakeRepo{authors: map[string]Author{}, now: now}
}

func (f *fakeRepo) Create(_ context.Context, s Story, status string) (Story, error) {
	f.rows = append(f.rows, row{story: s, status: status})
	if _, ok := f.authors[s.AuthorID]; !ok {
		f.authors[s.AuthorID] = Author{ID: s.AuthorID, DisplayName: s.AuthorID}
	}
	return s, nil
}

// 팔로우 관계는 여기서 흉내 낸다 — 진짜 필터는 SQL이 한다.
func (f *fakeRepo) ListActive(_ context.Context, viewerID string) ([]Story, map[string]Author, error) {
	var out []Story
	for _, r := range f.rows {
		if r.status != "approved" {
			continue // 보류된 것은 안 보인다
		}
		if !r.story.ExpiresAt.After(f.now()) {
			continue // 만료됐다
		}
		if r.story.AuthorID != viewerID && !f.follows[viewerID+"→"+r.story.AuthorID] {
			continue
		}
		out = append(out, r.story)
	}
	// 저장소 계약: (사람, 오래된 것 먼저)
	for i := 1; i < len(out); i++ {
		for j := i; j > 0; j-- {
			a, b := out[j-1], out[j]
			if a.AuthorID > b.AuthorID || (a.AuthorID == b.AuthorID && a.CreatedAt.After(b.CreatedAt)) {
				out[j-1], out[j] = b, a
				continue
			}
			break
		}
	}
	return out, f.authors, nil
}

type fakeMedia struct {
	owner   map[string]string
	flagged map[string]bool
}

func (m *fakeMedia) CheckOwned(_ context.Context, url, ownerID string) (bool, error) {
	who, ok := m.owner[url]
	if !ok || who != ownerID {
		return false, errs.New(errs.Validation, "사진을 찾을 수 없습니다")
	}
	return m.flagged[url], nil
}

type clock struct{ t time.Time }

func (c *clock) now() time.Time      { return c.t }
func (c *clock) add(d time.Duration) { c.t = c.t.Add(d) }

func newTestService() (*Service, *fakeRepo, *fakeMedia, *clock) {
	c := &clock{t: time.Date(2026, 8, 3, 9, 0, 0, 0, time.UTC)}
	repo := newFakeRepo(c.now)
	repo.follows = map[string]bool{}
	m := &fakeMedia{owner: map[string]string{}, flagged: map[string]bool{}}
	n := 0
	return NewService(repo, m, func() string {
		n++
		return "story-" + string(rune('a'+n-1))
	}, c.now), repo, m, c
}

func domainCode(t *testing.T, err error) errs.Code {
	t.Helper()
	var de *errs.DomainError
	if !errors.As(err, &de) {
		t.Fatalf("도메인 오류가 아님: %v", err)
	}
	return de.Code
}

// ── 만들기 ───────────────────────────────────────────────────────────────────

func TestCreateRequiresLogin(t *testing.T) {
	svc, _, _, _ := newTestService()
	_, _, err := svc.Create(context.Background(), "", "/media/file/a.png", "")
	if domainCode(t, err) != errs.Unauthorized {
		t.Fatal("로그인 없이 올릴 수 있다")
	}
}

// 남의 사진·바깥 주소는 실을 수 없다(판정은 media가, 거절은 여기가).
func TestCreateRejectsUnownedMedia(t *testing.T) {
	svc, _, m, _ := newTestService()
	m.owner["/media/file/a.png"] = "other"
	if _, _, err := svc.Create(context.Background(), "me", "/media/file/a.png", ""); domainCode(t, err) != errs.Validation {
		t.Fatal("남의 사진으로 스토리를 만들었다")
	}
}

// 24시간 뒤에 만료된다 — app·옛 서버와 같은 값이어야 한다.
func TestCreateSetsTwentyFourHourExpiry(t *testing.T) {
	svc, _, m, c := newTestService()
	m.owner["/media/file/a.png"] = "me"

	s, pending, err := svc.Create(context.Background(), "me", "/media/file/a.png", " 오늘 ")
	if err != nil {
		t.Fatal(err)
	}
	if pending {
		t.Fatal("깨끗한 사진이 보류됐다")
	}
	if got := s.ExpiresAt.Sub(c.now()); got != 24*time.Hour {
		t.Fatalf("수명이 24시간이 아니다: %v", got)
	}
	if s.Caption != "오늘" {
		t.Fatalf("앞뒤 공백이 그대로다: %q", s.Caption)
	}
}

// 자동 스캔에 걸린 사진은 **거절이 아니라 보류**다 — 올라가되 아직 안 보인다.
func TestFlaggedMediaBecomesPending(t *testing.T) {
	svc, _, m, _ := newTestService()
	m.owner["/media/file/bad.png"] = "me"
	m.flagged["/media/file/bad.png"] = true

	_, pending, err := svc.Create(context.Background(), "me", "/media/file/bad.png", "")
	if err != nil {
		t.Fatalf("보류인데 거절됐다: %v", err)
	}
	if !pending {
		t.Fatal("보류 표시가 없다 — 화면이 '검토 중'을 말할 수 없다")
	}
	groups, err := svc.ListActive(context.Background(), "me")
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 0 {
		t.Fatal("보류된 스토리가 트레이에 떴다")
	}
}

// ── 보기 ─────────────────────────────────────────────────────────────────────

// 24시간이 지나면 사라진다. 그 직전까지는 보인다.
func TestExpiresAfterTwentyFourHours(t *testing.T) {
	svc, _, m, c := newTestService()
	m.owner["/media/file/a.png"] = "me"
	if _, _, err := svc.Create(context.Background(), "me", "/media/file/a.png", ""); err != nil {
		t.Fatal(err)
	}

	c.add(23*time.Hour + 59*time.Minute)
	if groups, _ := svc.ListActive(context.Background(), "me"); len(groups) != 1 {
		t.Fatal("아직 살아 있어야 한다")
	}
	c.add(2 * time.Minute)
	if groups, _ := svc.ListActive(context.Background(), "me"); len(groups) != 0 {
		t.Fatal("24시간이 지났는데 남아 있다")
	}
}

// 팔로우하지 않은 사람의 스토리는 안 보인다.
func TestOnlyMineAndFollowees(t *testing.T) {
	svc, repo, m, _ := newTestService()
	m.owner["/media/file/star.png"] = "star"
	m.owner["/media/file/stranger.png"] = "stranger"
	if _, _, err := svc.Create(context.Background(), "star", "/media/file/star.png", ""); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Create(context.Background(), "stranger", "/media/file/stranger.png", ""); err != nil {
		t.Fatal(err)
	}
	repo.follows["fan→star"] = true

	groups, err := svc.ListActive(context.Background(), "fan")
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 1 || groups[0].Author.ID != "star" {
		t.Fatalf("팔로우한 사람만 보여야 한다: %+v", groups)
	}
}

// 내 그룹은 **언제나 첫 칸**이다 — 트레이의 첫 타일이 "내 스토리"이기 때문이다.
func TestMyGroupComesFirst(t *testing.T) {
	svc, repo, m, c := newTestService()
	for _, id := range []string{"a", "b", "me"} {
		m.owner["/media/file/"+id+".png"] = id
	}
	// 남들이 먼저, 내가 제일 나중에 올린다(시간순이면 내가 맨 앞이 아니게).
	if _, _, err := svc.Create(context.Background(), "a", "/media/file/a.png", ""); err != nil {
		t.Fatal(err)
	}
	c.add(time.Minute)
	if _, _, err := svc.Create(context.Background(), "me", "/media/file/me.png", ""); err != nil {
		t.Fatal(err)
	}
	c.add(time.Minute)
	if _, _, err := svc.Create(context.Background(), "b", "/media/file/b.png", ""); err != nil {
		t.Fatal(err)
	}
	repo.follows["me→a"] = true
	repo.follows["me→b"] = true

	groups, err := svc.ListActive(context.Background(), "me")
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 3 {
		t.Fatalf("세 사람이어야 한다: %d", len(groups))
	}
	if groups[0].Author.ID != "me" {
		t.Fatalf("내 그룹이 첫 칸이 아니다: %s", groups[0].Author.ID)
	}
	// 나머지는 최신 컷이 새로운 사람 먼저(b가 a보다 나중).
	if groups[1].Author.ID != "b" || groups[2].Author.ID != "a" {
		t.Fatalf("최신순이 아니다: %s %s", groups[1].Author.ID, groups[2].Author.ID)
	}
}

// 한 사람의 여러 컷은 **오래된 것부터** 나온다 — 넘겨 보는 순서 그대로.
func TestGroupKeepsChronologicalOrder(t *testing.T) {
	svc, _, m, c := newTestService()
	m.owner["/media/file/1.png"] = "me"
	m.owner["/media/file/2.png"] = "me"

	first, _, err := svc.Create(context.Background(), "me", "/media/file/1.png", "첫 컷")
	if err != nil {
		t.Fatal(err)
	}
	c.add(time.Hour)
	second, _, err := svc.Create(context.Background(), "me", "/media/file/2.png", "둘째 컷")
	if err != nil {
		t.Fatal(err)
	}

	groups, err := svc.ListActive(context.Background(), "me")
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != 1 || len(groups[0].Stories) != 2 {
		t.Fatalf("한 사람 두 컷이어야 한다: %+v", groups)
	}
	if groups[0].Stories[0].ID != first.ID || groups[0].Stories[1].ID != second.ID {
		t.Fatal("순서가 뒤집혔다 — 넘겨 보면 시간이 거꾸로 간다")
	}
}
