// @plm SRS-052 [ADR-015]  OAuth 제공자 계약 — 제공자별 차이를 여기 한 곳에 가둔다
//
// ─────────────────────────────────────────────────────────────────────────────
// P0은 **계약만** 둔다. 플로우(state·PKCE·콜백)와 실제 제공자는 P3·P4가 채운다.
// 계약을 먼저 두는 이유는 하나다 — 인터페이스가 나중에 정해지면 애플을 못 얹는다(아래 D1).
//
// ── 표준 라이브러리로 직접 구현한다(ADR-015 기각 대안) ──────────────────────
// golang.org/x/oauth2 가 주는 것은 토큰 교환 form POST 하나뿐인데, 제공자별 차이
// (카카오 이메일 선택 동의 · 네이버 검증 플래그 부재 · 애플 ES256 client_secret)는
// 어차피 직접 다뤄야 한다. go.mod 를 12개 직접 의존으로 유지한다.
//
// ── id_token 서명 검증을 하지 않는 이유 ─────────────────────────────────────
// 인가 코드를 **백채널로 우리 서버가 직접** 교환하므로(TLS + client_secret) 응답 안의
// 프로필을 신뢰하는 데 서명 검증이 추가로 필요하지 않다. JWKS 회전·캐시 만료라는
// 새 실패 모드만 는다. 프로필은 제공자의 OIDC userinfo 로 받는다.
// ⚠ 구글의 구형 oauth2/v2/userinfo 는 쓰지 않는다 — 필드명이 verified_email 이고
//
//	문서가 "always true" 라, 잘못 고르면 **무조건 검증됨**이 된다(ADR-015 D26).
//
// ─────────────────────────────────────────────────────────────────────────────
package oauth

import (
	"context"
	"net/http"
)

// Profile은 제공자에게서 얻는 것 전부다. 판정 엔진(auth.LinkOrCreate)이 이것만 본다.
type Profile struct {
	// 불변 앵커. **절대 이메일이 아니다** — 제공자 쪽에서 이메일을 바꿔도 계정이 갈아타면 안 된다.
	// 0006 이 provider_identity claim key 를 둔 이유와 같다.
	ProviderUserID string
	// 없을 수 있다. 카카오는 선택 동의, 네이버는 추가 제공이라 거부 가능하다 —
	// 이메일 없는 계정은 예외가 아니라 **정상 경로**다(SRS-028).
	Email string
	// 제공자가 소유를 **명시적으로 보증**할 때만 true (불변식 I-4).
	// ⚠ 네이버는 보증하지 않는다 → 항상 false. 계정 정책을 근거로 추론하지 않는다.
	EmailVerified bool
	// 닉네임 기본값 후보. **그대로 공개하지 않는다** — 제공자 실명이 피드에 노출되면 안 된다
	// (WF SIGNUP.10: 사용자가 고칠 수 있어야 한다).
	DisplayName string
	// 제공자 refresh token. 있으면 봉인해 저장한다(탈퇴 시 연결 해제 의무 이행용 · Q2 A안).
	// ⚠ 구글은 대개 주지 않는다 — 로그인 목적으로 offline access 를 요구하지 않기 때문이다.
	RefreshToken string
}

// Provider는 제공자 하나다. 구현은 P3(구글)·P4(카카오·네이버)·P6 이후(애플)가 채운다.
type Provider interface {
	// 설정·로그·경로에 쓰이는 식별자("google"·"kakao"·"naver"·"apple").
	Name() string

	// 인가 화면으로 보낼 URL.
	// ⚠ 두 번째 인자는 **code_challenge**(S256 해시)다. verifier 원문이 아니다 —
	//   원문을 인가 URL 에 실으면 PKCE 가 아무것도 막지 못한다(그 값이 곧 교환 열쇠다).
	//   PKCE 미지원 제공자에서는 빈 문자열이 온다.
	AuthorizeURL(state, challenge, redirectURI string) string

	// 인가 코드를 백채널로 교환하고 프로필을 돌려준다.
	// ⚠ 호출 전에 state 검증이 끝나 있어야 한다 — 순서가 뒤집히면 무인증 아웃바운드 증폭이 된다.
	Exchange(ctx context.Context, code, verifier, redirectURI string) (Profile, error)

	// PKCE(S256) 지원 여부. 미지원이면 state 만으로 CSRF 를 막는다.
	SupportsPKCE() bool

	// ── 아래 둘은 애플 때문에 지금 계약에 있다(ADR-015 D1 조건화) ──────────────
	//
	// 애플 콜백은 form_post 강제라 **cross-site POST** 로 돌아온다. 그러면
	// SameSite=Lax 상태 쿠키가 실리지 않아 콜백이 전부 실패한다 — 다른 3종과 근본이 다르다.
	// 이 결정권이 인터페이스에 없으면 애플을 얹는 순간 flow·handler 를 뜯어야 하고,
	// D1 이 적어 둔 "뒤집기 비용: 낮음"이 거짓이 된다. **어댑터 1개 추가**로 끝나야 한다.

	// "GET" 또는 "POST". 콜백 핸들러가 이 값으로 파라미터를 어디서 읽을지 정한다.
	CallbackMethod() string

	// 상태 쿠키의 SameSite. GET 콜백은 Lax(제공자에서 오는 top-level 내비게이션을 허용),
	// form_post 는 Lax 로는 실리지 않으므로 구현체가 다른 값을 고를 수 있어야 한다.
	StateCookieSameSite() http.SameSite
}

// base는 GET 콜백 · Lax 쿠키라는 **다수파 기본값**을 준다.
// 구글·카카오·네이버 어댑터가 이것을 묻어 두면 각자 두 메서드를 쓰지 않아도 된다.
type base struct{}

func (base) CallbackMethod() string             { return http.MethodGet }
func (base) StateCookieSameSite() http.SameSite { return http.SameSiteLaxMode }
