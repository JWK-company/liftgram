// @plm SRS-052  제공자 등록 — 조립 지점이 무엇을 켤지 정한다 (booktarae oauth/registry.go에서 옮겼다)
//
// ⚠ 가짜 제공자는 **여기 나타나지 않는다.** `//go:build oauthfake` 파일이 init 으로 훅을 채우고,
//
//	프로덕션 빌드에는 그 파일이 컴파일되지 않아 훅이 nil 이다(fake_provider.go 서두 참조).
package oauth

// ProviderConfig — 제공자 하나의 자격증명. 비어 있으면 그 제공자를 켜지 않는다.
type ProviderConfig struct {
	ClientID     string
	ClientSecret string
}

// filled — **둘 다** 있어야 켠다. 하나만 있으면 제공자 화면에서 오류를 보게 된다.
func (c ProviderConfig) filled() bool { return c.ClientID != "" && c.ClientSecret != "" }

// fakeHook — oauthfake 빌드에서만 채워진다. 프로덕션에서는 nil 이고, 그래서 도달할 수 없다.
var fakeHook func() []Provider

// Registry — 조립부가 넘기는 제공자 설정 묶음. 구조체로 받는 이유: 같은 타입 인자를 나열하면
// 순서를 바꿔 넣어도 컴파일이 통과한다(구글 자격증명으로 카카오가 켜지는 사고).
type Registry struct {
	Google ProviderConfig
	Kakao  ProviderConfig
	Naver  ProviderConfig
	// KakaoLegacy — 앱 설정에서 OIDC 를 켤 수 없을 때만. 기본은 OIDC 다.
	KakaoLegacy bool
}

// NewRegistry — 자격증명이 채워진 제공자만 켠다(없는 제공자의 버튼은 아예 내리는 편이 낫다).
func NewRegistry(r Registry) map[string]Provider {
	m := map[string]Provider{}
	if r.Google.filled() {
		m["google"] = NewGoogle(r.Google)
	}
	if r.Kakao.filled() {
		m["kakao"] = NewKakao(r.Kakao, r.KakaoLegacy)
	}
	if r.Naver.filled() {
		m["naver"] = NewNaver(r.Naver)
	}
	if fakeHook != nil {
		for _, p := range fakeHook() {
			m[p.Name()] = p
		}
	}
	return m
}

// Names — 화면에 내려보낼 활성 제공자 목록(버튼 순서 고정).
func Names(m map[string]Provider) []string {
	order := []string{"google", "kakao", "naver"}
	out := make([]string, 0, len(m))
	for _, n := range order {
		if _, ok := m[n]; ok {
			out = append(out, n)
		}
	}
	return out
}
