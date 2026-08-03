// @plm SRS-039  착용장비 규칙 테스트 — DB 없이
//
// 여기서 보는 것은 두 가지다:
//   · **설정을 잘못 넣어도 서버가 꺼짐으로 수렴하는가**(오타 하나로 광고가 켜지면 안 된다)
//   · **같은 클릭을 두 번 담지 않는가**(집계 부풀림·반복 클릭 제재 방어)
package gear

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type click struct {
	userID, postID, category, source, kind string
	at                                     time.Time
}

type fakeRepo struct {
	clicks []click
	now    func() time.Time
}

func (f *fakeRepo) RecentClickExists(_ context.Context, userID, postID, category string, since time.Time) (bool, error) {
	for _, c := range f.clicks {
		if c.userID == userID && c.postID == postID && c.category == category && !c.at.Before(since) {
			return true, nil
		}
	}
	return false, nil
}

func (f *fakeRepo) CreateClick(_ context.Context, _, userID, postID, category, source, kind string) error {
	f.clicks = append(f.clicks, click{userID: userID, postID: postID, category: category, source: source, kind: kind, at: f.now()})
	return nil
}

type clock struct{ t time.Time }

func (c *clock) now() time.Time      { return c.t }
func (c *clock) add(d time.Duration) { c.t = c.t.Add(d) }

func newTestService(cfg Config) (*Service, *fakeRepo, *clock) {
	c := &clock{t: time.Date(2026, 8, 3, 9, 0, 0, 0, time.UTC)}
	repo := &fakeRepo{now: c.now}
	n := 0
	return NewService(repo, cfg, func() string {
		n++
		return "click-" + string(rune('a'+n-1))
	}, c.now), repo, c
}

func domainCode(t *testing.T, err error) errs.Code {
	t.Helper()
	var de *errs.DomainError
	if !errors.As(err, &de) {
		t.Fatalf("도메인 오류가 아님: %v", err)
	}
	return de.Code
}

// ── 설정 ─────────────────────────────────────────────────────────────────────

// **"true" 정확 일치일 때만** 켜진다 — 광고 노출 스위치는 켜려는 의도가 명확할 때만 켜져야 한다.
func TestEnabledOnlyOnExactTrue(t *testing.T) {
	for _, raw := range []string{"", "false", "yes", "1", "TRUE", "True", " true"} {
		if ParseConfig(raw, "").Enabled {
			t.Fatalf("%q 가 켜짐으로 읽혔다", raw)
		}
	}
	if !ParseConfig("true", "").Enabled {
		t.Fatal("true가 꺼짐으로 읽혔다")
	}
}

// 링크 JSON이 깨져 있어도 **예외 없이** 꺼짐으로 수렴한다 — 오타 하나로 전 기능이 죽으면 안 된다.
func TestBrokenLinksFallBackQuietly(t *testing.T) {
	for _, raw := range []string{"{", "[]", "null", `"문자열"`, "12", `{"belt":`} {
		cfg := ParseConfig("true", raw)
		if len(cfg.Links) != 0 {
			t.Fatalf("%q 에서 링크가 생겼다: %v", raw, cfg.Links)
		}
	}
}

// env에 섞인 **임의 키는 새 나가지 않는다** — 8종 화이트리스트로 재구성한다.
func TestOnlyKnownCategoriesSurvive(t *testing.T) {
	cfg := ParseConfig("true", `{
		"belt": "https://link.coupang.com/a/belt",
		"partnerTag": "비밀값",
		"메모": "여기 적어둠",
		"unknownCat": "https://link.coupang.com/a/x"
	}`)
	if len(cfg.Links) != 1 || cfg.Links["belt"] != "https://link.coupang.com/a/belt" {
		t.Fatalf("화이트리스트가 새거나 막았다: %v", cfg.Links)
	}
	if _, ok := cfg.Links["partnerTag"]; ok {
		t.Fatal("파트너 태그가 화면으로 새 나간다")
	}
}

// 값은 **가공하지 않는다** — 링크를 손대는 행위 자체가 제재 대상이다.
func TestLinkValueIsPassedThroughUnchanged(t *testing.T) {
	url := "https://link.coupang.com/a/AbCd?x=1&y=2"
	cfg := ParseConfig("true", `{"strap":"`+url+`"}`)
	if cfg.Links["strap"] != url {
		t.Fatalf("링크가 바뀌었다: %q", cfg.Links["strap"])
	}
}

// 터무니없이 긴 값은 오설정이거나 주입이다 — 버린다.
func TestOverlongLinkIsDropped(t *testing.T) {
	long := "https://link.coupang.com/a/"
	for len(long) <= maxLinkLen {
		long += "x"
	}
	if len(ParseConfig("true", `{"chalk":"`+long+`"}`).Links) != 0 {
		t.Fatal("지나치게 긴 링크가 통과했다")
	}
}

// 설정은 **복사본**으로 나간다 — 호출부가 바꿔도 서버 상태가 변하지 않는다.
func TestConfigIsCopied(t *testing.T) {
	svc, _, _ := newTestService(Config{Enabled: true, Links: map[string]string{"belt": "u"}})
	got := svc.GetConfig()
	got.Links["belt"] = "바꿔치기"
	if svc.GetConfig().Links["belt"] != "u" {
		t.Fatal("내부 설정이 밖에서 바뀌었다")
	}
}

// ── 클릭 ─────────────────────────────────────────────────────────────────────

func TestClickRequiresLogin(t *testing.T) {
	svc, _, _ := newTestService(Config{})
	if err := svc.RecordClick(context.Background(), "", "p1", "belt", "user", "search"); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("로그인 없이 집계됐다")
	}
}

func TestClickRejectsUnknownCategory(t *testing.T) {
	svc, _, _ := newTestService(Config{})
	if err := svc.RecordClick(context.Background(), "u1", "p1", "우주복", "user", "search"); domainCode(t, err) != errs.Validation {
		t.Fatal("모르는 분류가 집계됐다")
	}
}

// 짧은 시간의 반복은 **한 번만** 담는다.
func TestRepeatedClickIsSuppressed(t *testing.T) {
	svc, repo, c := newTestService(Config{})
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		if err := svc.RecordClick(ctx, "u1", "p1", "belt", "user", "search"); err != nil {
			t.Fatal(err)
		}
		c.add(time.Minute)
	}
	if len(repo.clicks) != 1 {
		t.Fatalf("반복 클릭이 %d건 쌓였다", len(repo.clicks))
	}

	// 시간창을 넘기면 다시 담는다 — 며칠에 걸친 진짜 관심까지 죽이지는 않는다.
	c.add(dedupeWindow)
	if err := svc.RecordClick(ctx, "u1", "p1", "belt", "user", "search"); err != nil {
		t.Fatal(err)
	}
	if len(repo.clicks) != 2 {
		t.Fatalf("시간창 밖의 클릭이 무시됐다: %d건", len(repo.clicks))
	}
}

// 다른 사람·다른 글·다른 장비는 서로 막지 않는다.
func TestDifferentClicksAreIndependent(t *testing.T) {
	svc, repo, _ := newTestService(Config{})
	ctx := context.Background()

	for _, c := range []struct{ user, post, cat string }{
		{"u1", "p1", "belt"},
		{"u2", "p1", "belt"},
		{"u1", "p2", "belt"},
		{"u1", "p1", "strap"},
	} {
		if err := svc.RecordClick(ctx, c.user, c.post, c.cat, "user", "search"); err != nil {
			t.Fatal(err)
		}
	}
	if len(repo.clicks) != 4 {
		t.Fatalf("서로 다른 클릭이 눌렸다: %d건", len(repo.clicks))
	}
}

// 모르는 값은 안전한 쪽으로 눕힌다 — 집계가 이상한 문자열로 오염되지 않게.
func TestUnknownSourceAndKindNormalize(t *testing.T) {
	svc, repo, _ := newTestService(Config{})
	if err := svc.RecordClick(context.Background(), "u1", "p1", "belt", "무엇", "무엇"); err != nil {
		t.Fatal(err)
	}
	if repo.clicks[0].source != "user" || repo.clicks[0].kind != "search" {
		t.Fatalf("정규화되지 않았다: %+v", repo.clicks[0])
	}
}
