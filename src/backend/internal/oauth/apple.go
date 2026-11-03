// @plm SRS-095 [ADR-046]  Apple 제공자 — Sign in with Apple (P6)
//
// ─────────────────────────────────────────────────────────────────────────────
// Apple 은 다른 셋과 **근본이 두 군데 다르다.** 그 둘이 이 파일의 전부다.
//
// ① **콜백이 form_post(cross-site POST)** 다. 그래서 CallbackMethod=POST · StateCookieSameSite=None.
//
//	(base 를 임베드하지 않는 유일한 어댑터 — 다수파 기본 GET/Lax 를 덮어야 한다.)
//
// ② **userinfo 엔드포인트가 없다.** sub·email·email_verified 는 오직 토큰 교환 응답의
//
//	**id_token(JWT) 안**에만 있다(구글/네이버의 fetchProfile 패턴을 못 쓴다).
//
// ── 신뢰 경계 (계정 탈취 등급 · qa BLOCKER B1) ───────────────────────────────
// 저장소 규약은 id_token **서명검증을 생략**한다(백채널 TLS+client_secret 교환이라 안전).
// 그 규약이 Apple 에서 성립하려면 다음이 필수다:
//
//	· id_token 은 **오직 백채널 token 응답**에서만 취한다. **form_post 콜백 body 의
//	  user/email/id_token 은 절대 신뢰하지 않는다**(위조 시 임의 sub·email = 탈취).
//	  → 구조적 방어막: Exchange 시그니처는 code 만 받아 body 에 닿지 못한다. 여기 그대로 둔다.
//	· Apple 첫 로그인의 `user`(이름) 필드는 **아예 배선하지 않는다** — DisplayName 은 빈값으로
//	  두고 CompleteForm 닉네임 입력에 맡긴다(프런트채널 신뢰 0).
//	· 서명검증을 생략하는 대신 **aud/iss/exp claim 을 검증**한다(우리 client 로 발급된·안 만료된 토큰).
//	· nonce 는 지금 넣지 않는다 — Provider 인터페이스(AuthorizeURL·Exchange)에 nonce 를 흘리려면
//	  넷 다 시그니처가 바뀌어 D1("어댑터 1개 추가")이 깨진다. code 1회용 + 백채널 + aud/exp 로 갈음
//	  한다(옵션 A · qa H3). 훗날 필요하면 인터페이스 확장으로 승격한다.
//
// ── client_secret 은 ES256 JWT 다 (qa H1) ───────────────────────────────────
// Apple 의 client_secret 은 정적 문자열이 아니라 **매번 서명하는 토큰**이다. 서명은 JWS 규약대로
// **R‖S 64바이트 raw**(각 32B) 여야 한다 — Go 의 ecdsa.SignASN1/DER 을 쓰면 Apple 이 거절한다.
// ─────────────────────────────────────────────────────────────────────────────
package oauth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	appleAuthURL  = "https://appleid.apple.com/auth/authorize"
	appleTokenURL = "https://appleid.apple.com/auth/token"
	appleIssuer   = "https://appleid.apple.com"
	// client_secret 수명 — Apple 상한은 6개월이지만 짧게 잡는다(매 교환 시 새로 서명하므로 길 이유가 없다).
	appleSecretTTL = 5 * time.Minute
)

// AppleConfig — Apple 은 id/secret 2필드로 부족하다. Services ID(=client_id)와 서명 3종.
type AppleConfig struct {
	ServicesID    string // client_id (App ID 가 아니다 — 별개다)
	TeamID        string // client_secret JWT 의 iss
	KeyID         string // client_secret JWT 헤더의 kid
	PrivateKeyPEM string // Sign in with Apple 용 .p8(PKCS8 EC) 원문
}

// filled — 넷이 **전부** 있어야 켠다. 하나만 비면 첫 로그인에서 client_secret 생성이 실패한다.
func (c AppleConfig) filled() bool {
	return c.ServicesID != "" && c.TeamID != "" && c.KeyID != "" && c.PrivateKeyPEM != ""
}

type apple struct {
	cfg    AppleConfig
	key    *ecdsa.PrivateKey
	client *http.Client
}

// NewApple — .p8 를 **부팅 시** 파싱한다(qa M4). 실패하면 error 로 알려 registry 가 apple 을
// 켜지 않는다(사용자 로그인 시점이 아니라 조립 시점에 드러난다).
func NewApple(cfg AppleConfig) (Provider, error) {
	key, err := parseAppleKey(cfg.PrivateKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("apple: .p8 개인키 파싱 실패: %w", err)
	}
	return &apple{cfg: cfg, key: key, client: newHTTPClient()}, nil
}

func (a *apple) Name() string       { return "apple" }
func (a *apple) SupportsPKCE() bool { return true }

// form_post 는 cross-site POST 라 Lax 쿠키가 안 실린다 — None(+Secure) 으로 덮는다.
func (a *apple) CallbackMethod() string             { return http.MethodPost }
func (a *apple) StateCookieSameSite() http.SameSite { return http.SameSiteNoneMode }

func (a *apple) AuthorizeURL(state, challenge, redirectURI string) string {
	// 공통 authorizeURL 헬퍼를 쓴다(client_id=Services ID · challenge 있으면 S256 자동).
	// response_mode=form_post 는 Apple 에서 scope 에 name/email 이 있으면 **강제**다.
	return authorizeURL(appleAuthURL, ProviderConfig{ClientID: a.cfg.ServicesID},
		"name email", state, challenge, redirectURI,
		url.Values{"response_mode": {"form_post"}})
}

func (a *apple) Exchange(ctx context.Context, code, verifier, redirectURI string) (Profile, error) {
	secret, err := a.clientSecret(time.Now())
	if err != nil {
		return Profile{}, fmt.Errorf("apple: client_secret 서명 실패: %w", err)
	}
	// client_secret 자리에 방금 서명한 JWT 를 넣어 공통 교환기를 그대로 쓴다(body POST · code_verifier).
	tok, err := exchangeCode(ctx, a.client, "apple", appleTokenURL,
		ProviderConfig{ClientID: a.cfg.ServicesID, ClientSecret: secret}, code, verifier, redirectURI)
	if err != nil {
		return Profile{}, err
	}
	if tok.IDToken == "" {
		return Profile{}, fmt.Errorf("apple: id_token 이 비어 있습니다 — 프로필의 유일한 출처다")
	}
	// ⚠ **오직** 백채널 token 응답의 id_token 만 본다. form_post body 는 handler 가 Exchange 로
	//    넘기지 않으므로 여기서 애초에 닿을 수 없다(B1 구조적 방어막).
	return a.profileFromIDToken(tok.IDToken, time.Now())
}

// profileFromIDToken — id_token(백채널 응답)을 검증해 Profile 로. Exchange 에서 분리해 둔 것은
// HTTP 없이 신뢰 경계(aud/iss/exp·truthiness)를 테스트로 잠그기 위해서다(qa B1·H2).
func (a *apple) profileFromIDToken(idToken string, now time.Time) (Profile, error) {
	claims, err := decodeAppleIDToken(idToken)
	if err != nil {
		return Profile{}, err
	}
	// 서명검증 생략의 대가 — claim 을 검증한다(우리 client 로 발급된·안 만료된 토큰인가).
	if claims.Iss != appleIssuer {
		return Profile{}, fmt.Errorf("apple: id_token iss 불일치")
	}
	if !audContains(claims.Aud, a.cfg.ServicesID) {
		return Profile{}, fmt.Errorf("apple: id_token aud 가 우리 client 가 아니다")
	}
	// 서명검증을 생략하므로 exp 는 토큰 내부의 유일한 신선도 방어다 — **부재(0)도 거부**한다
	// (백채널 취득이라 실도달성은 낮지만, "안 만료되는 토큰"을 수용하지 않는다 · qa 하드닝).
	if claims.Exp == 0 || now.Unix() >= claims.Exp {
		return Profile{}, fmt.Errorf("apple: id_token 이 만료되었거나 exp 가 없습니다")
	}
	if claims.Sub == "" {
		return Profile{}, fmt.Errorf("apple: sub 가 비어 있습니다 — 불변 앵커가 없으면 연결할 수 없다")
	}
	return Profile{
		ProviderUserID: claims.Sub,
		Email:          claims.Email,
		// I-4 — Apple 이 email_verified 로 소유를 보증할 때만 true. private relay 도 Apple 통제
		// 주소라 보통 verified 로 온다. string|bool 이중형은 appleBool 이 흡수한다(qa H2).
		EmailVerified: appleBool(claims.EmailVerified),
		// DisplayName 은 의도적으로 빈값 — Apple 이름은 첫 form_post body 로만 오는데 그것을
		// 신뢰·배선하지 않는다(B1). 닉네임은 CompleteForm 이 받는다.
		DisplayName: "",
	}, nil
}

// clientSecret — ES256 로 서명한 JWT. 서명은 **JWS raw R‖S 64바이트**(DER 금지).
func (a *apple) clientSecret(now time.Time) (string, error) {
	header := map[string]string{"alg": "ES256", "kid": a.cfg.KeyID, "typ": "JWT"}
	claims := map[string]any{
		"iss": a.cfg.TeamID,
		"iat": now.Unix(),
		"exp": now.Add(appleSecretTTL).Unix(),
		"aud": appleIssuer,
		"sub": a.cfg.ServicesID,
	}
	hb, err := json.Marshal(header)
	if err != nil {
		return "", err
	}
	cb, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	signingInput := base64.RawURLEncoding.EncodeToString(hb) + "." + base64.RawURLEncoding.EncodeToString(cb)
	digest := sha256.Sum256([]byte(signingInput))
	r, s, err := ecdsa.Sign(rand.Reader, a.key, digest[:])
	if err != nil {
		return "", err
	}
	// P-256 은 R·S 각 32바이트. FillBytes 로 **고정길이**로 채운다 — DER/ASN.1 이 아니다.
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(sig), nil
}

// parseAppleKey — .p8(PKCS8) EC 개인키를 읽는다.
func parseAppleKey(pemStr string) (*ecdsa.PrivateKey, error) {
	// env 로 실려 오며 개행이 `\n` 이스케이프로 눌린 경우를 되돌린다.
	pemStr = strings.ReplaceAll(pemStr, `\n`, "\n")
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, fmt.Errorf("PEM 블록을 찾지 못했습니다")
	}
	k, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	ec, ok := k.(*ecdsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("EC 개인키가 아닙니다(%T)", k)
	}
	// ES256 은 P-256 을 강제한다(header alg 하드코딩). 비-P256 EC 키(P-384 등)를 넣으면 서명부
	// FillBytes(sig[:32]) 가 R/S 32B 를 넘겨 패닉한다 — 그 실패를 로그인 시점이 아니라 **부팅
	// 시점**에 드러낸다(qa M4 doctrine · 두 리뷰어 실증).
	if ec.Curve != elliptic.P256() {
		return nil, fmt.Errorf("ES256 은 P-256 키가 필요합니다(%s)", ec.Curve.Params().Name)
	}
	return ec, nil
}

// appleClaims — id_token payload 에서 우리가 쓰는 것.
// ⚠ email_verified·is_private_email 은 bool 또는 string("true"/"false") 으로 온다 → RawMessage.
type appleClaims struct {
	Iss           string          `json:"iss"`
	Sub           string          `json:"sub"`
	Aud           json.RawMessage `json:"aud"` // 문자열 또는 배열
	Exp           int64           `json:"exp"`
	Email         string          `json:"email"`
	EmailVerified json.RawMessage `json:"email_verified"`
	IsPrivate     json.RawMessage `json:"is_private_email"`
}

// decodeAppleIDToken — JWT 의 payload 세그먼트만 base64url 디코드한다(서명검증은 규약상 생략).
func decodeAppleIDToken(idToken string) (appleClaims, error) {
	parts := strings.Split(idToken, ".")
	if len(parts) != 3 {
		return appleClaims{}, fmt.Errorf("apple: id_token 형식이 JWT 가 아니다")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return appleClaims{}, fmt.Errorf("apple: id_token payload 디코드 실패: %w", err)
	}
	var c appleClaims
	if err := json.Unmarshal(payload, &c); err != nil {
		return appleClaims{}, fmt.Errorf("apple: id_token claim 파싱 실패: %w", err)
	}
	return c, nil
}

// appleBool — Apple 의 bool|string 이중형을 흡수한다. true(bool)·"true"(string)만 참,
// 그 외·부재·파싱불가는 전부 false(로그인은 성립 — 에러로 죽지 않는다). false 를 true 로
// 오독하면 I-4 가 무너지므로 **참의 조건만 좁게** 둔다.
func appleBool(raw json.RawMessage) bool {
	s := strings.TrimSpace(string(raw))
	return s == "true" || s == `"true"`
}

// audContains — aud 는 문자열 또는 문자열 배열이다. 우리 Services ID 가 있는가.
func audContains(raw json.RawMessage, want string) bool {
	if want == "" {
		return false
	}
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return false
	}
	if s[0] == '[' {
		var arr []string
		if err := json.Unmarshal(raw, &arr); err != nil {
			return false
		}
		for _, v := range arr {
			if v == want {
				return true
			}
		}
		return false
	}
	var one string
	if err := json.Unmarshal(raw, &one); err != nil {
		return false
	}
	return one == want
}
