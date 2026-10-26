// @plm SRS-052  OAuth 상태 — 서명 쿠키로 무상태 (P3)
//
// ─────────────────────────────────────────────────────────────────────────────
// state(CSRF) · code_verifier(PKCE) · return_to(복귀) · link_user_id(연결 의도)를 서버가
// 기억해야 하는데, 표를 만들면 정리(GC) 문제가 따라온다. **서명 쿠키로 대신한다.**
//
//	payload = base64url(JSON)
//	cookie  = payload "." base64url(HMAC-SHA256(secret, "oauth-state\x00" ‖ payload))
//
// ── 도메인 분리 라벨이 왜 있나 ──────────────────────────────────────────────
// 같은 시크릿(AUTH_JWT_SECRET)이 JWT 서명에도 쓰인다. 구분자 없이 같은 키로 두 가지를
// 서명하면 한쪽이 다른 쪽의 서명 오라클이 될 경로가 열린다. **별도 키를 만들지는 않는다** —
// 로테이션 대상이 둘이 되면 운영에서 하나만 갈아 끼우는 사고가 난다. prefix 하나로 족하다.
//
// ── link_user_id 가 여기 있는 이유 ──────────────────────────────────────────
// 콜백은 Connect 인터셉터 **밖**이라 세션을 읽을 수 없다. access 쿠키에 의존하면 15분 만료가
// 왕복 중에 터져 **간헐적 계정 분열**이 난다(연결하려던 사용자를 잃고 새 계정이 생긴다).
// 그래서 시작 시점에 확정해 서명 안에 담는다.
// ─────────────────────────────────────────────────────────────────────────────
package oauth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

const (
	stateCookieName = "oauth_state"
	// 쿠키 Path — 콜백과 시작만 이 쿠키를 본다. 다른 경로에 실릴 이유가 없다.
	// ⚠ 브라우저는 항상 /api 프록시를 지나므로 /api 접두사를 포함한다.
	stateCookiePath = "/api/auth/oauth/"
	// 도메인 분리 라벨(위 주석).
	stateLabel = "oauth-state\x00"
	// 왕복 수명. 사용자가 제공자 화면에서 머뭇거려도 충분하고, 남아 돌 만큼 길지도 않다.
	stateTTL = 10 * time.Minute
)

var errStateInvalid = errors.New("oauth: 상태가 유효하지 않습니다")

type statePayload struct {
	State      string `json:"s"`
	Verifier   string `json:"v,omitempty"`
	ReturnTo   string `json:"r,omitempty"`
	Provider   string `json:"p"`
	LinkUserID string `json:"l,omitempty"`
	Exp        int64  `json:"e"`
}

// newState — 무작위 state 와 PKCE verifier 를 만든다.
func newState() (state, verifier string) {
	return randToken(), randToken()
}

func randToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("crypto/rand 실패: " + err.Error()) // 난수가 없는 환경은 뜨면 안 된다
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// challengeS256 — PKCE code_challenge(S256).
func challengeS256(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func sign(secret []byte, payload []byte) string {
	m := hmac.New(sha256.New, secret)
	m.Write([]byte(stateLabel))
	m.Write(payload)
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// sealState — 쿠키 값으로 만든다.
func sealState(secret []byte, p statePayload) (string, error) {
	raw, err := json.Marshal(p)
	if err != nil {
		return "", err
	}
	enc := base64.RawURLEncoding.EncodeToString(raw)
	return enc + "." + sign(secret, []byte(enc)), nil
}

// openState — 서명·만료를 검증하고 payload 를 돌려준다.
//
// ⚠ 서명 비교는 **상수시간**이다(hmac.Equal). 바이트 비교로 하면 서명 위조 시도에
//
//	타이밍 힌트를 준다.
func openState(secret []byte, cookieValue string, now time.Time) (statePayload, error) {
	i := strings.LastIndex(cookieValue, ".")
	if i <= 0 {
		return statePayload{}, errStateInvalid
	}
	enc, gotSig := cookieValue[:i], cookieValue[i+1:]
	wantSig := sign(secret, []byte(enc))
	if !hmac.Equal([]byte(gotSig), []byte(wantSig)) {
		return statePayload{}, errStateInvalid
	}
	raw, err := base64.RawURLEncoding.DecodeString(enc)
	if err != nil {
		return statePayload{}, errStateInvalid
	}
	var p statePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return statePayload{}, errStateInvalid
	}
	if now.Unix() > p.Exp {
		return statePayload{}, errStateInvalid
	}
	return p, nil
}

// stateCookie — 설정용. SameSite 는 **제공자가 정한다**(애플은 form_post 라 Lax 로는 안 실린다).
//
// ⚠ SameSite=None 쿠키는 **Secure 가 없으면 현대 브라우저가 아예 폐기**한다(구형은 평문 전송).
//
//	그러면 애플 콜백이 상태 쿠키를 못 받아 **무음 실패**한다. None 이면 Secure 를 강제한다
//	(애플 redirect_uri 는 어차피 https 필수라 정합 · qa M1).
func stateCookie(value string, secure bool, sameSite http.SameSite) *http.Cookie {
	if sameSite == http.SameSiteNoneMode {
		secure = true
	}
	return &http.Cookie{
		Name:     stateCookieName,
		Value:    value,
		Path:     stateCookiePath,
		MaxAge:   int(stateTTL.Seconds()),
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	}
}

// clearStateCookie — 해제는 **설정과 같은 속성**이어야 브라우저가 같은 쿠키로 인식한다.
// 속성이 어긋나면 삭제가 발효되지 않고, 그러면 state 재생 방지가 무력해진다
// (handler.go:139 의 refresh 쿠키 해제가 같은 규율을 적어 두었다).
func clearStateCookie(secure bool, sameSite http.SameSite) *http.Cookie {
	if sameSite == http.SameSiteNoneMode {
		secure = true // 설정과 같은 속성이어야 브라우저가 같은 쿠키로 인식해 삭제가 발효된다(위 stateCookie 와 짝).
	}
	return &http.Cookie{
		Name:     stateCookieName,
		Value:    "",
		Path:     stateCookiePath,
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	}
}

// safeReturnTo — 내부 경로만 허용한다. **없으면 open redirect 다.**
//
// 문자열 prefix 검사만으로는 뚫린다:
//
//	"//evil.com"   → 스킴 상대 URL. 브라우저가 외부 호스트로 간다
//	"/\\evil.com"  → 일부 브라우저가 // 와 같이 해석한다
//	"/\tx"·"/\r\n" → 제어문자로 검사·헤더를 흔든다
func safeReturnTo(v, fallback string) string {
	if v == "" {
		return fallback
	}
	if strings.ContainsAny(v, "\r\n\t\x00") {
		return fallback
	}
	if !strings.HasPrefix(v, "/") {
		return fallback
	}
	if strings.HasPrefix(v, "//") || strings.HasPrefix(v, `/\`) {
		return fallback
	}
	return v
}
