// @plm SRS-052  OAuth 콜백 — Connect 밖의 http.Handler (booktarae oauth/handler.go를 liftgram 세션에 맞췄다)
//
// ─────────────────────────────────────────────────────────────────────────────
// OAuth 인가 코드 플로우는 **브라우저의 전면 리다이렉트**다. RPC 로는 이 왕복이 성립하지 않아 mux 에 직접 건다.
//
// ── liftgram 과 booktarae 가 다른 한 곳: 세션을 어떻게 건네나 ────────────────
// booktarae 는 콜백이 세션 쿠키를 직접 굽는다. liftgram 은 access 를 메모리에, refresh 를 화면 쪽 라우트
// (/api/session)가 굽는 httpOnly 쿠키에 둔다. 그래서 콜백은 **일회용 로그인 코드**(60초·1회)만 붙여
// /auth/complete 로 돌려보내고, 화면이 ExchangeLoginCode 로 토큰을 받아 평소 로그인과 같은 길로 저장한다.
// refresh 가 URL 에 실리는 일이 없다.
//
// ── 콜백 순서가 규칙이다 ────────────────────────────────────────────────────
//
//	① 쿠키 서명·만료 → ② state 상수시간 비교 → ③ path provider ↔ payload provider 대조
//	→ ④ 쿠키 삭제 → ⑤ **그제서야** 토큰 교환
//
// ⑤ 를 앞당기면 아무나 우리 서버를 시켜 제공자에게 요청을 날리게 하는 무인증 아웃바운드 증폭이 된다.
// ③ 이 없으면 provider_user_id 네임스페이스가 교차 오염된다(구글의 sub 로 카카오 수단을 만드는 요청).
//
// 인터셉터 밖이라 여기서 직접: per-IP 한도 · 오류를 302 로(흰 화면 금지) · no-store · code·state 를 로그에 남기지 않기.
// ─────────────────────────────────────────────────────────────────────────────
package oauth

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

// Sessions — 이 패키지가 auth 에 바라는 전부(인터페이스는 쓰는 쪽에).
type Sessions interface {
	SocialSignIn(ctx context.Context, p auth.SocialProfile, linkUserID string) (userID string, created bool, err error)
	IssueLoginCode(ctx context.Context, userID string, created bool) (string, error)
	ConsumeLinkTicket(ctx context.Context, ticket string) (string, error)
}

// Config — 조립 지점이 넘긴다. oauth 가 internal/config 를 import 하지 않는다.
type Config struct {
	AppURL       string
	Secret       []byte // JWT_SECRET — state 서명
	CookieSecure bool
	SignInPath   string // 오류 착지(계정 화면)
	CompletePath string // 성공 착지(일회용 코드를 받는 화면)
}

type Handler struct {
	providers map[string]Provider
	svc       Sessions
	cfg       Config
	limiter   func(key string) bool
}

func NewHandler(providers map[string]Provider, svc Sessions, cfg Config, limiter func(string) bool) *Handler {
	return &Handler{providers: providers, svc: svc, cfg: cfg, limiter: limiter}
}

// 오류 코드 화이트리스트 — 착지 화면이 이 값만 문구로 바꾼다(임의 문자열을 실으면 우리 화면에 공격자 문구가 뜬다).
const (
	errCodeState      = "oauth_state"
	errCodeExchange   = "oauth_failed"
	errCodeProvider   = "oauth_provider"
	errCodeEmailTaken = "oauth_email_taken"
	errCodeLinked     = "oauth_linked_elsewhere"
	errCodeLink       = "oauth_link_expired"
	errCodeRate       = "oauth_rate"
	errCodeInternal   = "oauth_internal"
)

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")

	// /api/auth/oauth/{provider}/{action}
	rest := strings.TrimPrefix(r.URL.Path, "/api/auth/oauth/")
	parts := strings.Split(strings.Trim(rest, "/"), "/")
	if len(parts) != 2 {
		http.NotFound(w, r)
		return
	}
	name, action := parts[0], parts[1]
	p, ok := h.providers[name]
	if !ok {
		http.NotFound(w, r)
		return
	}
	if h.limiter != nil && !h.limiter(name+"|"+action+"|"+clientIP(r)) {
		h.fail(w, r, errCodeRate)
		return
	}
	switch action {
	case "start":
		h.start(w, r, p)
	case "callback":
		h.callback(w, r, p)
	default:
		http.NotFound(w, r)
	}
}

func (h *Handler) start(w http.ResponseWriter, r *http.Request, p Provider) {
	state, verifier := newState()

	// 연결 의도 — 로그인한 사람이 CreateLinkTicket 으로 받은 표를 들고 왔다. 여기서 사용자를 확정해 서명에 담는다
	// (콜백은 인터셉터 밖이라 세션을 못 읽는다).
	linkUserID := ""
	if t := r.URL.Query().Get("link"); t != "" {
		uid, err := h.svc.ConsumeLinkTicket(r.Context(), t)
		if err != nil {
			h.fail(w, r, errCodeLink)
			return
		}
		linkUserID = uid
	}

	payload := statePayload{
		State: state, Provider: p.Name(), LinkUserID: linkUserID,
		ReturnTo: safeReturnTo(r.URL.Query().Get("return_to"), ""),
		Exp:      time.Now().Add(stateTTL).Unix(),
	}
	if p.SupportsPKCE() {
		payload.Verifier = verifier
	}
	sealed, err := sealState(h.cfg.Secret, payload)
	if err != nil {
		h.fail(w, r, errCodeInternal)
		return
	}
	http.SetCookie(w, stateCookie(sealed, h.cfg.CookieSecure, p.StateCookieSameSite()))

	challenge := ""
	if p.SupportsPKCE() {
		challenge = challengeS256(verifier)
	}
	http.Redirect(w, r, p.AuthorizeURL(state, challenge, h.redirectURI(p.Name())), http.StatusFound)
}

func (h *Handler) callback(w http.ResponseWriter, r *http.Request, p Provider) {
	getParam := r.URL.Query().Get
	if p.CallbackMethod() == http.MethodPost {
		if err := r.ParseForm(); err != nil {
			h.fail(w, r, errCodeState)
			return
		}
		getParam = r.PostFormValue
	}

	// ① 쿠키 서명·만료
	c, err := r.Cookie(stateCookieName)
	if err != nil {
		h.fail(w, r, errCodeState)
		return
	}
	payload, err := openState(h.cfg.Secret, c.Value, time.Now())
	if err != nil {
		h.fail(w, r, errCodeState)
		return
	}
	// ② state 상수시간 비교
	if !constantTimeEqual(payload.State, getParam("state")) {
		h.fail(w, r, errCodeState)
		return
	}
	// ③ path provider ↔ payload provider
	if payload.Provider != p.Name() {
		h.fail(w, r, errCodeState)
		return
	}
	// ④ 쿠키 삭제(설정과 같은 속성) — 재생 방지
	http.SetCookie(w, clearStateCookie(h.cfg.CookieSecure, p.StateCookieSameSite()))

	if e := getParam("error"); e != "" {
		slog.Info("[oauth] 제공자가 거절", "provider", p.Name(), "error", e)
		h.fail(w, r, errCodeProvider)
		return
	}
	code := getParam("code")
	if code == "" {
		h.fail(w, r, errCodeState)
		return
	}

	// ⑤ 그제서야 교환
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	prof, err := p.Exchange(ctx, code, payload.Verifier, h.redirectURI(p.Name()))
	if err != nil {
		slog.Warn("[oauth] 토큰 교환 실패", "provider", p.Name(), "err", err) // ⚠ code·state 는 남기지 않는다
		h.fail(w, r, errCodeExchange)
		return
	}

	userID, created, err := h.svc.SocialSignIn(ctx, auth.SocialProfile{
		Provider: p.Name(), ProviderUserID: prof.ProviderUserID, Email: prof.Email,
		EmailVerified: prof.EmailVerified, DisplayName: prof.DisplayName,
	}, payload.LinkUserID)
	switch {
	case errors.Is(err, auth.ErrEmailTaken):
		h.fail(w, r, errCodeEmailTaken)
		return
	case errors.Is(err, auth.ErrIdentityTaken):
		h.fail(w, r, errCodeLinked)
		return
	case err != nil:
		slog.Error("[oauth] 로그인 판정 실패", "provider", p.Name(), "err", err)
		h.fail(w, r, errCodeInternal)
		return
	}

	loginCode, err := h.svc.IssueLoginCode(ctx, userID, created)
	if err != nil {
		h.fail(w, r, errCodeInternal)
		return
	}
	target := h.cfg.CompletePath + "?code=" + urlQueryEscape(loginCode)
	if payload.LinkUserID != "" {
		target += "&linked=" + urlQueryEscape(p.Name())
	}
	if back := safeReturnTo(payload.ReturnTo, ""); back != "" {
		target += "&return_to=" + urlQueryEscape(back)
	}
	h.redirect(w, r, target)
}

func (h *Handler) redirectURI(provider string) string {
	return strings.TrimRight(h.cfg.AppURL, "/") + "/api/auth/oauth/" + provider + "/callback"
}

func (h *Handler) redirect(w http.ResponseWriter, r *http.Request, path string) {
	http.Redirect(w, r, strings.TrimRight(h.cfg.AppURL, "/")+path, http.StatusFound)
}

// fail — 화이트리스트된 코드만 실어 계정 화면으로 돌려보낸다.
func (h *Handler) fail(w http.ResponseWriter, r *http.Request, code string) {
	h.redirect(w, r, h.cfg.SignInPath+"?err="+code)
}
