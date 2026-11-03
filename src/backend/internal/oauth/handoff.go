// @plm SRS-095 [ADR-046]  앱 로그인 교환 — 시스템 인증 창에서 끝난 로그인을 앱 웹뷰로 넘긴다
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜 필요한가: 구글은 앱 안 웹뷰에서 하는 로그인을 막는다(disallowed_useragent). 그래서 앱은 시스템 인증 창
// (iOS ASWebAuthenticationSession · Android Custom Tabs)으로 로그인한다. 그 창과 앱 웹뷰는 **저장소가 다르다** —
// 평소처럼 /auth/complete?code= 로 보내면 일회용 로그인 코드가 그 창에서 소모되고 앱은 로그아웃 그대로다.
//
// 그래서 앱 모드(`start?app=1&ac=…`)의 콜백은 착지 경로(성공이면 /auth/complete?code=…, 실패면 /account?err=…)를
// **서버 메모리에 2분** 맡기고, 무작위 교환 코드만 앱 스킴(`liftgram://auth?code=`)으로 돌려준다.
// 앱 웹뷰가 `/api/auth/oauth/app/handoff?code=&v=` 를 열면 코드를 **한 번만** 소모하고 착지 경로로 302 한다 —
// 그다음은 웹과 똑같다(/auth/complete 가 ExchangeLoginCode 로 토큰을 받고 /api/session 이 refresh 쿠키를 굽는다).
// 로그인 코드는 앱 웹뷰 안에서만 URL 에 나타난다.
//
// ── 가로채기 ──────────────────────────────────────────────────────────────────
// 다른 앱이 같은 스킴을 등록해 교환 코드를 가로챌 수 있다(커스텀 스킴의 고질). 그래서 PKCE 처럼 묶는다:
// 웹뷰가 무작위 v 를 자기 메모리에 두고 `ac = S256(v)` 만 start 에 싣는다. 교환은 v 를 가진 쪽(=그 웹뷰)만 한다.
//
// 메모리 보관인 이유: 백엔드는 한 컨테이너이고 수명이 2분이다 — 재기동으로 잃으면 사용자가 다시 누르면 된다.
// 북타래 oauth/handoff.go 와 같은 설계 — 리프트그램은 세션을 화면 쪽이 굽기 때문에 「착지 경로」만 맡긴다.
// ─────────────────────────────────────────────────────────────────────────────
package oauth

import (
	"crypto/subtle"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

// AppScheme — 앱 껍데기가 등록한 URL 스킴(iOS Info.plist CFBundleURLSchemes · Android intent-filter).
const AppScheme = "liftgram"

const handoffTTL = 2 * time.Minute

// ac = base64url(sha256(v)) — 43자.
var reChallenge = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

func validChallenge(ac string) bool { return reChallenge.MatchString(ac) }

type handoffEntry struct {
	target    string // AppURL 뒤에 붙을 경로(/auth/complete?code=… 또는 /account?err=…)
	challenge string
	exp       time.Time
}

type handoffStore struct {
	mu sync.Mutex
	m  map[string]handoffEntry
}

func newHandoffStore() *handoffStore { return &handoffStore{m: map[string]handoffEntry{}} }

func (s *handoffStore) put(e handoffEntry, now time.Time) string {
	code := randToken()
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, v := range s.m { // 만료 청소 — 동시에 몇 개 안 되므로 put 마다 훑어도 싸다
		if now.After(v.exp) {
			delete(s.m, k)
		}
	}
	e.exp = now.Add(handoffTTL)
	s.m[code] = e
	return code
}

// take — 코드를 소모한다. v 가 안 맞으면 **소모하지 않는다**(가로챈 쪽의 헛시도로 정당한 웹뷰가 막히지 않게).
func (s *handoffStore) take(code, verifier string, now time.Time) (handoffEntry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.m[code]
	if !ok {
		return handoffEntry{}, false
	}
	if now.After(e.exp) {
		delete(s.m, code)
		return handoffEntry{}, false
	}
	if verifier == "" || subtle.ConstantTimeCompare([]byte(challengeS256(verifier)), []byte(e.challenge)) != 1 {
		return handoffEntry{}, false
	}
	delete(s.m, code)
	return e, true
}

// PutAppHandoff — SPEC-018 §7  웹 → 앱 넘기기(auth.CreateAppContinue)가 착지 경로를 맡긴다(auth.AppHandoff 구현).
// challenge 형식이 틀리면 ok=false. target 은 같은 사이트 경로만(handoffServe 도 다시 본다).
func (h *Handler) PutAppHandoff(target, challenge string) (string, bool) {
	if !validChallenge(challenge) || !strings.HasPrefix(target, "/") || strings.HasPrefix(target, "//") {
		return "", false
	}
	return h.handoff.put(handoffEntry{target: target, challenge: challenge}, time.Now()), true
}

// appLand — 앱 모드 콜백의 끝(성공·실패 모두). 착지 경로를 맡기고 교환 코드를 앱 스킴으로 돌려준다.
func (h *Handler) appLand(w http.ResponseWriter, r *http.Request, challenge, target string) {
	code := h.handoff.put(handoffEntry{target: target, challenge: challenge}, time.Now())
	// http.Redirect 는 스킴이 있는 절대 URL 을 그대로 둔다.
	http.Redirect(w, r, AppScheme+"://auth?code="+urlQueryEscape(code), http.StatusFound)
}

// handoffServe — GET /api/auth/oauth/app/handoff?code=&v= (앱 웹뷰가 연다).
func (h *Handler) handoffServe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.NotFound(w, r)
		return
	}
	q := r.URL.Query()
	e, ok := h.handoff.take(q.Get("code"), q.Get("v"), time.Now())
	if !ok {
		// ⚠ code 를 로그에 남기지 않는다.
		h.fail(w, r, errCodeState)
		return
	}
	if !strings.HasPrefix(e.target, "/") || strings.HasPrefix(e.target, "//") {
		h.fail(w, r, errCodeInternal)
		return
	}
	h.redirect(w, r, e.target)
}
