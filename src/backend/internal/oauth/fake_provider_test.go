//go:build oauthfake

// @plm SRS-052  가짜 제공자 골격 검증(P0) — 계약이 애플까지 수용하는지 여기서 본다.
// 실제 플로우 테스트는 P3 이 채운다.
package oauth

import (
	"context"
	"net/http"
	"net/url"
	"testing"
)

// 인터페이스를 만족하는지 컴파일 시점에 고정한다.
var (
	_ Provider = (*FakeProvider)(nil)
	_ Provider = FakeFormPost{}
)

// AuthorizeURL 은 state 를 **그대로** 실어 보내야 한다 —
// 그래야 콜백의 state 대조가 진짜로 검사된다(가짜가 그 검사를 건너뛰면 의미가 없다).
func TestFake_state를_그대로_싣는다(t *testing.T) {
	f := NewFake("google")
	got := f.AuthorizeURL("st-123", "verifier", "http://localhost:3000/api/auth/oauth/google/callback")
	u, err := url.Parse(got)
	if err != nil {
		t.Fatal(err)
	}
	if u.Query().Get("state") != "st-123" {
		t.Fatalf("state 가 유실됐다: %s", got)
	}
	if u.Query().Get("code") == "" {
		t.Fatal("code 가 없다")
	}
	if u.Path != "/api/auth/oauth/google/callback" {
		t.Fatalf("콜백 경로가 바뀌었다: %s", u.Path)
	}
}

func TestFake_Exchange_주입한_프로필을_돌려준다(t *testing.T) {
	f := NewFake("kakao")
	f.Next = Profile{ProviderUserID: "k-1", Email: "a@x.com", EmailVerified: true, DisplayName: "홍길동"}
	got, err := f.Exchange(context.Background(), "fake-code", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if got != f.Next {
		t.Fatalf("프로필이 다르다: %+v", got)
	}
}

// 기본값은 다수파(GET · Lax)여야 한다 — 구글·카카오·네이버가 이것을 묻어 쓴다.
func TestFake_기본_콜백규약(t *testing.T) {
	f := NewFake("naver")
	if f.CallbackMethod() != http.MethodGet {
		t.Errorf("기본 콜백은 GET 이어야 한다: %s", f.CallbackMethod())
	}
	if f.StateCookieSameSite() != http.SameSiteLaxMode {
		t.Error("기본 SameSite 는 Lax 여야 한다 — 제공자에서 오는 top-level 내비게이션을 허용해야 콜백이 실린다")
	}
}

// ★ D1 조건화의 실증: 애플처럼 form_post 로 돌아오는 제공자를 **어댑터 교체만으로** 수용하는가.
// 이 테스트가 깨지면 애플 슬롯의 "뒤집기 비용: 낮음"이 더 이상 참이 아니다.
func TestFormPost_어댑터만으로_수용된다(t *testing.T) {
	p := FakeFormPost{NewFake("apple")}
	if p.CallbackMethod() != http.MethodPost {
		t.Fatal("form_post 제공자가 POST 를 선언하지 못한다")
	}
	if p.StateCookieSameSite() == http.SameSiteLaxMode {
		t.Fatal("cross-site POST 인데 Lax 를 강제당한다 — 상태 쿠키가 실리지 않아 콜백이 전부 실패한다")
	}
	// 나머지 계약은 그대로 상속된다 — 이것이 "어댑터 1개 추가"의 뜻이다.
	if p.Name() != "apple" || !p.SupportsPKCE() {
		t.Fatal("기반 동작이 상속되지 않았다")
	}
}
