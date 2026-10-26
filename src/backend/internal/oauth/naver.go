// @plm SRS-052 [ADR-015]  네이버 제공자 — OIDC · **EmailVerified 항상 false** (P4)
//
// ─────────────────────────────────────────────────────────────────────────────
// D15′ — **네이버는 이메일 소유를 보증하지 않는다. 그러므로 우리도 보증하지 않는다.**
//
// 초판(D15)은 "네이버 계정은 가입 시 인증을 거치므로 검증된 것으로 본다"고 적었는데
// **그 근거가 존재하지 않는다.** 네이버 문서는 그 값을 *"내정보에 등록된 **연락처** 이메일 ·
// 사용자가 **외부 메일로 변경 가능**"* 으로 정의하고, 소유를 확인했다는 플래그를 **어떤 형태로도
// 주지 않는다.**
//
// 그대로 두면 공격이 상수 하나로 열린다: 피해자의 주소를 자기 네이버 연락처로 적어 두기만 하면
// 우리가 그것을 "증명된 이메일"로 읽고 피해자 계정에 붙여 준다(_analysis §2.2 방향 B).
//
// → **`EmailVerified: false` 고정.** 그래서 네이버는 언제나 소유 증명을 거친다.
//
// ⚠ **요구 ②는 그대로 성립한다.** 새 계정이 생기지 않고, 메일 확인 1회 뒤 같은 계정에 연결된다.
//
//	자동이 아니라 1단계 늘어날 뿐이며, 그 1단계가 없으면 남의 계정에 붙는다.
//
// ── 검수 전 상태 ──────────────────────────────────────────────────────────
// 사전 검수 전에는 **[멤버관리] 탭에 등록된 테스터/관리자 아이디로만** 로그인된다.
// 그 외 계정은 네이버가 거절한다 — 우리 쪽 고장이 아니다(phase-4 §7 전제).
// ─────────────────────────────────────────────────────────────────────────────
package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

const (
	// ⚠ OIDC 경로(`/oauth2/*`)다. 레거시(`/oauth2.0/*`)와 **경로가 다르다** —
	//   레거시는 PKCE 가 없고 문서 예제가 client_secret 을 GET 쿼리로 보낸다.
	naverAuthURL     = "https://nid.naver.com/oauth2/authorize"
	naverTokenURL    = "https://nid.naver.com/oauth2/token"
	naverUserInfoURL = "https://openapi.naver.com/v1/nid/me"
)

type naver struct {
	base
	cfg    ProviderConfig
	client *http.Client
}

func NewNaver(cfg ProviderConfig) Provider {
	return &naver{cfg: cfg, client: newHTTPClient()}
}

func (n *naver) Name() string       { return "naver" }
func (n *naver) SupportsPKCE() bool { return true } // S256 — 초판 표의 "미지원"은 틀렸다

func (n *naver) AuthorizeURL(state, challenge, redirectURI string) string {
	// OIDC 경로는 `scope=openid` 가 필수다.
	return authorizeURL(naverAuthURL, n.cfg, "openid", state, challenge, redirectURI, nil)
}

func (n *naver) Exchange(ctx context.Context, code, verifier, redirectURI string) (Profile, error) {
	tok, err := exchangeCode(ctx, n.client, n.Name(), naverTokenURL, n.cfg, code, verifier, redirectURI)
	if err != nil {
		return Profile{}, err
	}
	var raw json.RawMessage
	if err := fetchProfile(ctx, n.client, n.Name(), naverUserInfoURL, tok.AccessToken, &raw); err != nil {
		return Profile{}, err
	}
	p, err := parseNaver(raw)
	if err != nil {
		return Profile{}, err
	}
	p.RefreshToken = tok.RefreshToken
	return p, nil
}

// naverUser — `/v1/nid/me` 응답. 성공/실패가 **HTTP 상태가 아니라 본문의 resultcode** 로 온다.
type naverUser struct {
	ResultCode string `json:"resultcode"`
	Message    string `json:"message"`
	Response   struct {
		// ⚠ 2021-05-01 이후 생성 앱은 **64자 이내 BASE64 문자열**, 그 전 앱은 INT64 숫자다.
		//   **세 가지 흔한 선택이 전부 틀린다:**
		//     string      → 현행(문자열) 앱은 되지만 옛 앱의 숫자에서 디코딩이 죽는다
		//     json.Number → 옛 앱은 되지만 **현행 문자열에서 죽는다**(오늘 만든 앱이 전부 여기다)
		//     any         → 둘 다 받지만 숫자가 float64 를 거쳐 지수 표기가 된다(카카오 D16′)
		//   그래서 원문 바이트로 받아 우리가 벗긴다.
		ID       json.RawMessage `json:"id"`
		Email    string          `json:"email"`
		Nickname string          `json:"nickname"`
		Name     string          `json:"name"`
	} `json:"response"`
}

func parseNaver(raw []byte) (Profile, error) {
	var u naverUser
	if err := json.Unmarshal(raw, &u); err != nil {
		return Profile{}, fmt.Errorf("naver: 프로필을 읽을 수 없습니다: %w", err)
	}
	// ⚠ HTTP 200 인데 resultcode 가 실패인 경우가 있다 — 상태 코드만 보면 빈 프로필로 진행한다.
	if u.ResultCode != "00" {
		return Profile{}, fmt.Errorf("naver: 프로필 조회 거절(resultcode=%s)", u.ResultCode)
	}
	id := scalarString(u.Response.ID)
	if id == "" {
		return Profile{}, fmt.Errorf("naver: id 가 비어 있습니다 — 불변 앵커가 없으면 연결할 수 없다")
	}
	name := u.Response.Nickname
	if name == "" {
		name = u.Response.Name
	}
	return Profile{
		ProviderUserID: id,
		Email:          u.Response.Email,
		// ★ D15′ — 제공자 응답에 무엇이 오든 **여기는 상수 false 다.**
		//   네이버는 소유 확인 플래그를 주지 않으므로 보증할 근거가 없다(I-4).
		//   이 줄을 조건식으로 바꾸는 순간 방향 B 탈취가 열린다 — 회귀 테스트가 이것을 지킨다.
		EmailVerified: false,
		DisplayName:   name,
	}, nil
}
