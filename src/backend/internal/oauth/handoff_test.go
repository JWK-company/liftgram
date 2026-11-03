//go:build oauthfake

// @plm SRS-095  앱 로그인 교환 — 시작(app=1·ac) → 콜백(앱 스킴으로) → handoff(v 확인) → 웹 착지
//
// 지키는 것: ① 앱 모드 콜백은 성공·실패 모두 앱 스킴으로 돌아간다(시스템 인증 창에 갇히지 않게)
// ② 교환 코드는 v 를 가진 쪽만 쓴다 · 틀린 v 는 코드를 소모하지 않는다 ③ 한 번만 ④ 웹 모드는 그대로.
package oauth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

type stubSessions struct{ signInErr error }

func (s stubSessions) SocialSignIn(context.Context, auth.SocialProfile, string) (string, bool, error) {
	return "u-1", false, s.signInErr
}
func (stubSessions) IssueLoginCode(context.Context, string, bool) (string, error) {
	return "LOGIN-CODE", nil
}
func (stubSessions) ConsumeLinkTicket(context.Context, string) (string, error) { return "", nil }

func newTestHandler(svc Sessions) *Handler {
	f := NewFake("google")
	f.Next = Profile{ProviderUserID: "g-1", Email: "a@b.c", EmailVerified: true}
	return NewHandler(map[string]Provider{"google": f}, svc, Config{
		AppURL: "https://liftgram.example", Secret: []byte("test-secret-0123456789"),
		SignInPath: "/account", CompletePath: "/auth/complete",
	}, nil)
}

func pair() (v, ac string) {
	v = "verifier-" + strings.Repeat("x", 40)
	sum := sha256.Sum256([]byte(v))
	return v, base64.RawURLEncoding.EncodeToString(sum[:])
}

func do(h http.Handler, method, target string, cookies []*http.Cookie) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, target, nil)
	for _, c := range cookies {
		r.AddCookie(c)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

// start → 콜백 → 앱 스킴의 교환 코드까지
func runAppLogin(t *testing.T, h *Handler, ac string) string {
	t.Helper()
	w := do(h, "GET", "/api/auth/oauth/google/start?app=1&ac="+ac, nil)
	if w.Code != http.StatusFound {
		t.Fatalf("start %d", w.Code)
	}
	cb, _ := url.Parse(w.Header().Get("Location"))
	w2 := do(h, "GET", cb.RequestURI(), w.Result().Cookies())
	loc := w2.Header().Get("Location")
	if !strings.HasPrefix(loc, "liftgram://auth?code=") {
		t.Fatalf("앱 스킴으로 안 돌아왔다: %q", loc)
	}
	u, _ := url.Parse(loc)
	return u.Query().Get("code")
}

func Test앱로그인_성공_교환_후_웹착지(t *testing.T) {
	h := newTestHandler(stubSessions{})
	v, ac := pair()
	code := runAppLogin(t, h, ac)

	w := do(h, "GET", "/api/auth/oauth/app/handoff?code="+code+"&v="+v, nil)
	loc := w.Header().Get("Location")
	if !strings.HasPrefix(loc, "https://liftgram.example/auth/complete?code=LOGIN-CODE") {
		t.Fatalf("착지가 틀렸다: %q", loc)
	}
	// 한 번만
	w = do(h, "GET", "/api/auth/oauth/app/handoff?code="+code+"&v="+v, nil)
	if !strings.Contains(w.Header().Get("Location"), "/account?err=oauth_state") {
		t.Fatalf("두 번째 교환이 통했다: %q", w.Header().Get("Location"))
	}
}

func Test앱로그인_틀린_v_는_코드를_소모하지_않는다(t *testing.T) {
	h := newTestHandler(stubSessions{})
	v, ac := pair()
	code := runAppLogin(t, h, ac)
	w := do(h, "GET", "/api/auth/oauth/app/handoff?code="+code+"&v=wrong", nil)
	if !strings.Contains(w.Header().Get("Location"), "err=oauth_state") {
		t.Fatalf("틀린 v 가 통했다: %q", w.Header().Get("Location"))
	}
	w = do(h, "GET", "/api/auth/oauth/app/handoff?code="+code+"&v="+v, nil)
	if !strings.Contains(w.Header().Get("Location"), "/auth/complete?code=") {
		t.Fatalf("정당한 v 가 막혔다: %q", w.Header().Get("Location"))
	}
}

func Test앱로그인_실패도_앱으로_돌아간다(t *testing.T) {
	h := newTestHandler(stubSessions{signInErr: auth.ErrEmailTaken})
	v, ac := pair()
	code := runAppLogin(t, h, ac)
	w := do(h, "GET", "/api/auth/oauth/app/handoff?code="+code+"&v="+v, nil)
	if !strings.HasSuffix(w.Header().Get("Location"), "/account?err=oauth_email_taken") {
		t.Fatalf("오류 착지가 틀렸다: %q", w.Header().Get("Location"))
	}
}

func Test앱로그인_ac_없거나_틀리면_시작_거절(t *testing.T) {
	h := newTestHandler(stubSessions{})
	for _, q := range []string{"app=1", "app=1&ac=short", "app=1&ac=" + strings.Repeat("!", 43)} {
		w := do(h, "GET", "/api/auth/oauth/google/start?"+q, nil)
		if !strings.Contains(w.Header().Get("Location"), "err=oauth_state") {
			t.Fatalf("%s: 거절 안 됨 %q", q, w.Header().Get("Location"))
		}
	}
}

func Test웹로그인은_그대로(t *testing.T) {
	h := newTestHandler(stubSessions{})
	w := do(h, "GET", "/api/auth/oauth/google/start", nil)
	cb, _ := url.Parse(w.Header().Get("Location"))
	w2 := do(h, "GET", cb.RequestURI(), w.Result().Cookies())
	if !strings.HasPrefix(w2.Header().Get("Location"), "https://liftgram.example/auth/complete?code=LOGIN-CODE") {
		t.Fatalf("웹 착지가 바뀌었다: %q", w2.Header().Get("Location"))
	}
}

func Test교환코드_만료(t *testing.T) {
	s := newHandoffStore()
	v, ac := pair()
	now := time.Now()
	code := s.put(handoffEntry{target: "/x", challenge: ac}, now)
	if _, ok := s.take(code, v, now.Add(handoffTTL+time.Second)); ok {
		t.Fatal("만료된 코드가 통했다")
	}
}

// SPEC-018 §7  웹 → 앱 넘기기 — auth.CreateAppContinue 가 맡긴 착지도 같은 교환을 탄다(틀린 v 는 소모 안 함 · 한 번만).
func Test넘기기_맡김_교환(t *testing.T) {
	h := newTestHandler(stubSessions{})
	var _ auth.AppHandoff = h // 조립 지점이 넘기는 타입이 계약을 지킨다
	if auth.AppContinueScheme != AppScheme {
		t.Fatalf("스킴 불일치 %q != %q", auth.AppContinueScheme, AppScheme)
	}
	v, ac := pair()
	for _, bad := range []struct{ target, ch string }{
		{"/auth/complete?code=c&via=continue", "short"},
		{"//evil.example/x", ac},
		{"https://evil.example/x", ac},
	} {
		if _, ok := h.PutAppHandoff(bad.target, bad.ch); ok {
			t.Fatalf("맡김이 통했다: %+v", bad)
		}
	}
	code, ok := h.PutAppHandoff("/auth/complete?code=C1&via=continue", ac)
	if !ok {
		t.Fatal("맡김 실패")
	}
	w := do(h, "GET", "/api/auth/oauth/app/handoff?code="+code+"&v=wrong", nil)
	if !strings.Contains(w.Header().Get("Location"), "err=oauth_state") {
		t.Fatalf("틀린 v 가 통했다: %q", w.Header().Get("Location"))
	}
	w = do(h, "GET", "/api/auth/oauth/app/handoff?code="+code+"&v="+v, nil)
	if w.Header().Get("Location") != "https://liftgram.example/auth/complete?code=C1&via=continue" {
		t.Fatalf("착지: %q", w.Header().Get("Location"))
	}
	w = do(h, "GET", "/api/auth/oauth/app/handoff?code="+code+"&v="+v, nil)
	if !strings.Contains(w.Header().Get("Location"), "err=oauth_state") {
		t.Fatalf("두 번째 교환이 통했다: %q", w.Header().Get("Location"))
	}
}
