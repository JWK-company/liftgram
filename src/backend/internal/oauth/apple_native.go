// @plm SRS-095 [ADR-046]  Apple 네이티브 로그인 — iOS 앱의 「Apple로 계속」(App Store 심사 4.8)
//
// 웹의 Apple 로그인은 Services ID 로 리다이렉트 왕복을 한다(apple.go). iOS 앱은 ASAuthorization 이 화면 없이
// 인가 코드를 준다 — 앱 웹뷰가 그 코드를 `POST /api/auth/oauth/apple/native` 로 넘기면, 서버가
// **client_id = 앱 번들 ID** 로 Apple 토큰 엔드포인트와 백채널 교환을 한다. 신뢰 근거는 웹과 같다: 클라이언트가
// 내민 id_token 을 믿지 않고 **우리가 백채널로 받은 id_token 만** 본다(aud = 번들 ID · apple.go 의 claim 검증).
//
// 요청이 앱 웹뷰에서 오므로 교환 코드(handoff.go)는 필요 없다. 웹 콜백과 같은 일회용 로그인 코드를 발급해
// {"to": "/auth/complete?code=…&via=apple"} 로 답하고, 웹뷰가 그 경로로 이동한다 — 그다음은 웹과 같다.
// 북타래 apple_native.go 를 리프트그램 세션 방식(일회용 코드 → 화면이 refresh 쿠키)으로 옮겼다.
package oauth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

// NewAppleNative — 팀·키·.p8 와 번들 ID 가 있으면 켠다(Services ID 는 필요 없다 — 웹 흐름 전용).
func NewAppleNative(cfg AppleConfig, bundleID string) (*apple, error) {
	if cfg.TeamID == "" || cfg.KeyID == "" || cfg.PrivateKeyPEM == "" || bundleID == "" {
		return nil, fmt.Errorf("apple native: 팀·키·.p8·번들 ID 가 모두 있어야 한다")
	}
	cfg.ServicesID = bundleID // client_id(=client_secret 의 sub · id_token 의 aud) 자리를 번들 ID 로
	key, err := parseAppleKey(cfg.PrivateKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("apple native: .p8 개인키 파싱 실패: %w", err)
	}
	return &apple{cfg: cfg, key: key, client: newHTTPClient()}, nil
}

// codeExchanger — 테스트가 가짜를 넣는 자리(apple 이 구현한다).
type codeExchanger interface {
	Exchange(ctx context.Context, code, verifier, redirectURI string) (Profile, error)
}

// WithAppleNative — 조립부가 네이티브 교환기를 붙인다(없으면 /apple/native 는 404).
func (h *Handler) WithAppleNative(ex codeExchanger) *Handler {
	h.appleNative = ex
	return h
}

// appleNativeServe — POST /api/auth/oauth/apple/native {code, linkTicket?, returnTo?} → {"to": 착지}.
func (h *Handler) appleNativeServe(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	reply := func(to string) { _ = json.NewEncoder(w).Encode(map[string]string{"to": to}) }
	fail := func(code string) { reply(h.cfg.SignInPath + "?err=" + code) }
	if r.Method != http.MethodPost || h.appleNative == nil {
		http.NotFound(w, r)
		return
	}
	var in struct {
		Code       string `json:"code"`
		LinkTicket string `json:"linkTicket"`
		ReturnTo   string `json:"returnTo"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 8<<10)).Decode(&in); err != nil || in.Code == "" {
		fail(errCodeState)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	// 연결 의도 — 웹과 같은 2분짜리 표(CreateLinkTicket). 교환보다 먼저 소모해 무인증 아웃바운드를 막는다.
	linkUserID := ""
	if in.LinkTicket != "" {
		uid, err := h.svc.ConsumeLinkTicket(ctx, in.LinkTicket)
		if err != nil {
			fail(errCodeLink)
			return
		}
		linkUserID = uid
	}
	prof, err := h.appleNative.Exchange(ctx, in.Code, "", "")
	if err != nil {
		slog.Warn("[oauth] apple 네이티브 교환 실패", "err", err) // ⚠ code 는 남기지 않는다
		fail(errCodeExchange)
		return
	}
	userID, created, err := h.svc.SocialSignIn(ctx, auth.SocialProfile{
		Provider: "apple", ProviderUserID: prof.ProviderUserID, Email: prof.Email,
		EmailVerified: prof.EmailVerified, DisplayName: prof.DisplayName,
	}, linkUserID)
	switch {
	case errors.Is(err, auth.ErrEmailTaken):
		fail(errCodeEmailTaken)
		return
	case errors.Is(err, auth.ErrIdentityTaken):
		fail(errCodeLinked)
		return
	case err != nil:
		slog.Error("[oauth] apple 네이티브 로그인 판정 실패", "err", err)
		fail(errCodeInternal)
		return
	}
	loginCode, err := h.svc.IssueLoginCode(ctx, userID, created)
	if err != nil {
		fail(errCodeInternal)
		return
	}
	to := h.cfg.CompletePath + "?code=" + urlQueryEscape(loginCode)
	if linkUserID != "" {
		to += "&linked=apple"
	} else {
		to += "&via=apple"
	}
	if back := safeReturnTo(in.ReturnTo, ""); back != "" {
		to += "&return_to=" + urlQueryEscape(back)
	}
	reply(to)
}
