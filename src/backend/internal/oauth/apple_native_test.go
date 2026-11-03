//go:build oauthfake

// @plm SRS-095  Apple 네이티브 로그인 — 코드 → (백채널 교환) → 일회용 로그인 코드 착지 · 실패도 착지로
package oauth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

type fakeExchanger struct {
	prof Profile
	err  error
	got  string
}

func (f *fakeExchanger) Exchange(_ context.Context, code, _, _ string) (Profile, error) {
	f.got = code
	return f.prof, f.err
}

func postNative(h http.Handler, body string) (int, string) {
	r := httptest.NewRequest(http.MethodPost, "/api/auth/oauth/apple/native", strings.NewReader(body))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	var out struct{ To string }
	_ = json.NewDecoder(w.Body).Decode(&out)
	return w.Code, out.To
}

func TestApple네이티브_성공은_일회용코드_착지(t *testing.T) {
	ex := &fakeExchanger{prof: Profile{ProviderUserID: "apple-sub", Email: "x@privaterelay.appleid.com", EmailVerified: true}}
	h := newTestHandler(stubSessions{}).WithAppleNative(ex)
	code, to := postNative(h, `{"code":"c-1","returnTo":"/feed"}`)
	if code != http.StatusOK || !strings.HasPrefix(to, "/auth/complete?code=LOGIN-CODE&via=apple") || !strings.Contains(to, "return_to=%2Ffeed") {
		t.Fatalf("%d %q", code, to)
	}
	if ex.got != "c-1" {
		t.Fatalf("교환에 넘긴 코드 %q", ex.got)
	}
}

func TestApple네이티브_교환실패와_이메일충돌은_오류착지(t *testing.T) {
	h := newTestHandler(stubSessions{}).WithAppleNative(&fakeExchanger{err: errors.New("x")})
	if _, to := postNative(h, `{"code":"c"}`); to != "/account?err=oauth_failed" {
		t.Fatalf("%q", to)
	}
	h = newTestHandler(stubSessions{signInErr: auth.ErrEmailTaken}).WithAppleNative(&fakeExchanger{prof: Profile{ProviderUserID: "s"}})
	if _, to := postNative(h, `{"code":"c"}`); to != "/account?err=oauth_email_taken" {
		t.Fatalf("%q", to)
	}
}

func TestApple네이티브_코드없음_GET_미설정(t *testing.T) {
	h := newTestHandler(stubSessions{}).WithAppleNative(&fakeExchanger{})
	if _, to := postNative(h, `{}`); to != "/account?err=oauth_state" {
		t.Fatalf("%q", to)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/auth/oauth/apple/native", nil))
	if w.Code != http.StatusNotFound {
		t.Fatalf("GET %d", w.Code)
	}
	bare := newTestHandler(stubSessions{})
	if c, _ := postNative(bare, `{"code":"c"}`); c != http.StatusNotFound {
		t.Fatalf("미설정 %d", c)
	}
}
