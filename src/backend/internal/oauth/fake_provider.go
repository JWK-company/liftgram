//go:build oauthfake

// @plm SRS-052  가짜 제공자 — e2e 전용. **프로덕션 바이너리에 이 코드가 존재하지 않는다**
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜 ENV 플래그가 아니라 빌드 태그인가:
//
//	ENV 플래그(OAUTH_FAKE_PROVIDER=1)로 두면 "부팅 로그에 경고를 찍는다"가 유일한 방어가 되는데,
//	**경고는 통제가 아니다.** 이 저장소는 h2500-3 로 rsync 배포가 실재하고 .env 가 함께 옮겨 다닌다.
//	켜지는 순간 이것은 **임의 계정 로그인**이다 — 아무 이메일이나 넣으면 그 계정의 세션이 나온다.
//
//	빌드 태그는 그 가능성을 문법 수준에서 없앤다. `go build ./...` 산출물에는 이 파일이
//	컴파일되지 않으므로, 설정을 어떻게 잘못 넣어도 도달할 수 없다.
//	P6 완료 조건이 `go tool nm` 으로 심볼 부재를 확인한다.
//
// 실행: make test-oauth   (= go test -tags=oauthfake ./internal/oauth/...)
//
// ⚠ 주입 지점은 **Exchange 하나**다(P3 §6). 더 위(핸들러·flow)에서 가로채면
//
//	state·PKCE·쿠키 배선이 통째로 미검사로 남는다 — 정작 위험한 부분을 안 보게 된다.
//
// ─────────────────────────────────────────────────────────────────────────────
package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
)

// FakeProvider는 인가 왕복을 흉내 내되 **플로우는 진짜를 그대로 태운다**.
// AuthorizeURL 이 돌려주는 주소는 우리 콜백으로 즉시 돌아오는 루프백이라,
// state 쿠키 검증·PKCE·provider 대조가 실제와 같은 순서로 실행된다.
type FakeProvider struct {
	base
	name string
	// Exchange 가 돌려줄 프로필. 테스트가 분기마다 바꿔 끼운다
	// (검증 이메일 / 미검증 / 이메일 없음 / 기존 identity …).
	Next Profile
	// 교환 실패를 흉내 낼 때.
	Err error
	// PKCE 지원 여부까지 흉내 낸다 — 네이버 계열(미지원) 경로도 돌려 봐야 한다.
	PKCE bool
}

func NewFake(name string) *FakeProvider {
	return &FakeProvider{name: name, PKCE: true}
}

func (f *FakeProvider) Name() string       { return f.name }
func (f *FakeProvider) SupportsPKCE() bool { return f.PKCE }

// AuthorizeURL — 제공자로 나가지 않고 우리 콜백으로 되돌린다.
// code 는 아무 값이나 좋다(Exchange 가 Next 를 돌려준다) — 그러나 state 는 **그대로 실어 보낸다**.
// 그래야 콜백의 state 대조가 진짜로 검사된다.
//
// challenge 도 진짜 제공자와 같은 자리(code_challenge)에 싣는다. 버리면 PKCE 배선이
// **관측 불가**가 되어 verifier 원문이 새어 나가도 테스트가 눈치채지 못한다.
func (f *FakeProvider) AuthorizeURL(state, challenge, redirectURI string) string {
	u, err := url.Parse(redirectURI)
	if err != nil {
		return redirectURI
	}
	q := u.Query()
	q.Set("code", "fake-code")
	q.Set("state", state)
	if challenge != "" {
		q.Set("code_challenge", challenge)
		q.Set("code_challenge_method", "S256")
	}
	u.RawQuery = q.Encode()
	return u.String()
}

func (f *FakeProvider) Exchange(_ context.Context, code, _ /*verifier*/, _ /*redirectURI*/ string) (Profile, error) {
	if f.Err != nil {
		return Profile{}, f.Err
	}
	if code == "" {
		return Profile{}, fmt.Errorf("oauth(fake): code 가 비었습니다")
	}
	// 파일이 지정돼 있으면 **매 교환마다 다시 읽는다** — 서버를 재시작하지 않고 분기를 갈아
	// 끼우기 위해서다(실 DB 왕복 e2e 는 판정마다 다른 프로필이 필요하다).
	// 단위 테스트는 이 경로를 타지 않는다(f.Next 를 직접 넣는다).
	if path := os.Getenv("OAUTH_FAKE_PROFILE_FILE"); path != "" {
		raw, err := os.ReadFile(path)
		if err != nil {
			return Profile{}, fmt.Errorf("oauth(fake): 프로필 파일을 읽지 못했습니다: %w", err)
		}
		var p Profile
		if err := json.Unmarshal(raw, &p); err != nil {
			return Profile{}, fmt.Errorf("oauth(fake): 프로필 파일이 JSON 이 아닙니다: %w", err)
		}
		return p, nil
	}
	return f.Next, nil
}

// FakeFormPost — 애플처럼 form_post 로 돌아오는 제공자를 흉내 낸다.
// P6 애플 슬롯 확인이 "인터페이스가 이 경우를 수용하는가"를 이것으로 검사한다.
type FakeFormPost struct{ *FakeProvider }

func (FakeFormPost) CallbackMethod() string             { return http.MethodPost }
func (FakeFormPost) StateCookieSameSite() http.SameSite { return http.SameSiteNoneMode }

// init — 프로덕션 빌드에는 이 파일이 없으므로 훅이 nil 로 남는다(registry.go).
// 이름은 환경변수로 정한다: OAUTH_FAKE_PROVIDERS=google,kakao,naver
func init() {
	fakeHook = func() []Provider {
		names := strings.Split(os.Getenv("OAUTH_FAKE_PROVIDERS"), ",")
		out := make([]Provider, 0, len(names))
		for _, n := range names {
			if n = strings.TrimSpace(n); n != "" {
				out = append(out, NewFake(n))
			}
		}
		return out
	}
}
