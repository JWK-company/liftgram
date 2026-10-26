// @plm SRS-052 [ADR-015]  카카오 제공자 — OIDC 기본 · 레거시 REST 는 명시 설정 (P4)
//
// ─────────────────────────────────────────────────────────────────────────────
// D16′ — **OIDC 경로를 쓴다.**
//
// 레거시 `/v2/user/me` 의 회원번호는 JSON **숫자**다. `any` 로 디코딩하면 float64 가 되고,
// 큰 값은 문자열로 만들 때 `1.23457e+15` 지수 표기가 된다 — 그 값이 provider_user_id 로
// 저장되면 **재로그인 때 같은 사람을 못 알아본다**(정밀도 손실이 아니라 표기 문제다).
// OIDC userinfo 는 `sub` 가 처음부터 문자열이라 이 문제 자체가 소멸한다.
//
// D25 — **`is_email_valid=false` 는 "형식 오류"가 아니다.**
//
// 뜻은 *"그 주소가 다른 카카오계정에 사용되어 만료됨"* 이다. `is_email_verified` 만 보면
// **남의 주소로 연결**된다. 무효 주소는 `ka***@kakao.com` 로 마스킹돼 그대로 들어오므로
// 형태로는 걸러지지 않는다. OIDC 의 `email_verified` 는 valid ∧ verified 합성값이라
// 이 함정도 함께 사라진다 — 레거시 경로에서만 우리가 직접 합성해야 한다.
//
// ── 레거시 경로를 왜 남기나 ────────────────────────────────────────────────
// 앱 설정에서 OIDC 를 켜지 않으면 `scope=openid` 가 거절된다. 그 상태의 앱을 쓰는 수밖에
// 없을 때를 위해 남기되, **조용히 폴백하지 않는다** — `OAUTH_KAKAO_LEGACY=1` 로 명시해야
// 켜진다. 조용한 폴백은 "OIDC 를 켰다고 믿는데 실은 레거시로 돌던" 상태를 만든다.
//
// ── 심사 전 상태 ──────────────────────────────────────────────────────────
// 비즈앱 전환 + `account_email` 동의항목 심사 전에는 **이메일이 오지 않는다**(로그인은 된다).
// 그것은 고장이 아니라 판정 엔진 ⑤ 경로이고, AddEmail 이 그 계정의 출구다(phase-4 §3).
// ─────────────────────────────────────────────────────────────────────────────
package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

const (
	kakaoAuthURL       = "https://kauth.kakao.com/oauth/authorize"
	kakaoTokenURL      = "https://kauth.kakao.com/oauth/token"
	kakaoOIDCUserURL   = "https://kapi.kakao.com/v1/oidc/userinfo"
	kakaoLegacyUserURL = "https://kapi.kakao.com/v2/user/me"
)

type kakao struct {
	base
	cfg    ProviderConfig
	legacy bool // OAUTH_KAKAO_LEGACY — 앱에서 OIDC 를 켤 수 없을 때만
	client *http.Client
}

func NewKakao(cfg ProviderConfig, legacy bool) Provider {
	return &kakao{cfg: cfg, legacy: legacy, client: newHTTPClient()}
}

func (k *kakao) Name() string       { return "kakao" }
func (k *kakao) SupportsPKCE() bool { return true } // S256

func (k *kakao) AuthorizeURL(state, challenge, redirectURI string) string {
	// ⚠ 수집 항목은 **콘솔의 동의항목 설정**이 정한다 — 여기에 scope 를 나열해 늘릴 수 없다.
	//   OIDC 경로만 `openid` 를 요구한다(켜져 있지 않으면 카카오가 거절한다).
	scope := ""
	if !k.legacy {
		scope = "openid"
	}
	return authorizeURL(kakaoAuthURL, k.cfg, scope, state, challenge, redirectURI, nil)
}

func (k *kakao) Exchange(ctx context.Context, code, verifier, redirectURI string) (Profile, error) {
	tok, err := exchangeCode(ctx, k.client, k.Name(), kakaoTokenURL, k.cfg, code, verifier, redirectURI)
	if err != nil {
		return Profile{}, err
	}
	if k.legacy {
		var raw json.RawMessage
		if err := fetchProfile(ctx, k.client, k.Name(), kakaoLegacyUserURL, tok.AccessToken, &raw); err != nil {
			return Profile{}, err
		}
		p, err := parseKakaoLegacy(raw)
		if err != nil {
			return Profile{}, err
		}
		p.RefreshToken = tok.RefreshToken
		return p, nil
	}

	var ui struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"` // valid ∧ verified 합성 — 우리가 원하는 바로 그 값
		Nickname      string `json:"nickname"`
	}
	if err := fetchProfile(ctx, k.client, k.Name(), kakaoOIDCUserURL, tok.AccessToken, &ui); err != nil {
		return Profile{}, err
	}
	if ui.Sub == "" {
		return Profile{}, fmt.Errorf("kakao: sub 가 비어 있습니다 — 불변 앵커가 없으면 연결할 수 없다")
	}
	return Profile{
		ProviderUserID: ui.Sub,
		Email:          ui.Email,
		EmailVerified:  ui.EmailVerified,
		DisplayName:    ui.Nickname,
		RefreshToken:   tok.RefreshToken,
	}, nil
}

// ── 레거시 REST 파싱 — 순수 함수라 픽스처로 전건 검사한다 ────────────────────

// kakaoLegacyUser 는 `/v2/user/me` 응답이다.
//
// ⚠ `id` 를 **원문 바이트**로 받는다. `any`(→float64) 로 받으면 큰 회원번호가 지수 표기가 되어
//
//	provider_user_id 가 매번 달라진다(D16′). `json.Number` 도 지수 표기는 막지만 **문자열 값을
//	받지 못한다** — 네이버에서 실제로 그것 때문에 파싱이 죽었다(현행 id 가 BASE64 문자열이다).
//	제공자가 표현을 바꿔도 견디도록 두 형태를 함께 받는다.
//
// ⚠ 세 플래그가 **전부 포인터**다. 동의하지 않은 항목은 응답에서 **키 자체가 빠지므로**,
//
//	bool 로 받으면 "미동의"와 "false"가 구분되지 않는다 — 미동의를 false 로 읽는 것은
//	우연히 안전한 쪽이지만, 그 우연에 기대면 다음 필드에서 반대 방향으로 물린다.
type kakaoLegacyUser struct {
	ID      json.RawMessage `json:"id"`
	Account struct {
		Email           *string `json:"email"`
		HasEmail        *bool   `json:"has_email"`
		IsEmailValid    *bool   `json:"is_email_valid"`
		IsEmailVerified *bool   `json:"is_email_verified"`
		Profile         struct {
			Nickname string `json:"nickname"`
		} `json:"profile"`
	} `json:"kakao_account"`
}

func parseKakaoLegacy(raw []byte) (Profile, error) {
	var u kakaoLegacyUser
	if err := json.Unmarshal(raw, &u); err != nil {
		return Profile{}, fmt.Errorf("kakao: 프로필을 읽을 수 없습니다: %w", err)
	}
	id := scalarString(u.ID)
	if id == "" || id == "0" {
		return Profile{}, fmt.Errorf("kakao: 회원번호가 비어 있습니다 — 불변 앵커가 없으면 연결할 수 없다")
	}

	// **셋 다 참일 때만** 이메일을 신뢰한다(D25).
	//
	//	has_email          그 계정에 이메일이 있는가(동의 여부와 별개)
	//	is_email_valid     ⚠ **다른 카카오계정이 그 주소를 가져가 만료되지 않았는가**
	//	is_email_verified  카카오가 소유를 확인했는가
	//
	// is_email_verified 만 보면 **남의 주소로 연결**된다 — 무효 주소는 마스킹돼 오므로
	// 형태 검사로는 절대 걸러지지 않는다.
	verified := deref(u.Account.HasEmail) && deref(u.Account.IsEmailValid) && deref(u.Account.IsEmailVerified)

	email := ""
	if u.Account.Email != nil {
		email = *u.Account.Email
	}
	// 보증되지 않은 주소는 **아예 싣지 않는다.** 판정 엔진은 EmailVerified=false 인 주소를
	// 연결 근거로 쓰지 않지만(I-4), 그래도 화면 표시나 pending 페이로드에 마스킹 주소
	// (`ka***@kakao.com`)가 흘러 들어가면 사용자가 자기 주소로 착각한다.
	if !verified {
		email = ""
	}
	return Profile{
		ProviderUserID: id,
		Email:          email,
		EmailVerified:  verified,
		DisplayName:    u.Account.Profile.Nickname,
	}, nil
}

func deref(b *bool) bool { return b != nil && *b }
