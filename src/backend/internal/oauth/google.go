// @plm SRS-052  구글 제공자 — OIDC (P3)
//
// ⚠ **OIDC userinfo 만 쓴다.** 구형 `oauth2/v2/userinfo` 는 필드명이 verified_email 이고
//
//	문서가 "always true" 라, 잘못 고르면 **모든 계정이 검증됨**이 되어 불변식 I-1 이 통째로
//	무너진다(ADR-015 D26).
//
// ⚠ id_token 서명을 검증하지 않는다. 인가 코드를 **백채널로 우리 서버가 직접**(TLS + client_secret)
//
//	교환하므로 응답을 신뢰할 수 있고, JWKS 회전·캐시라는 새 실패 모드만 는다(ADR-015 기각 대안).
//
// ⚠ offline access 를 요구하지 않는다 — 로그인 목적에는 refresh token 이 필요 없다.
//
//	그래서 구글에서는 provider_refresh_token_enc 가 대개 NULL 이다(0040 주석).
package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

const (
	googleAuthURL     = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL    = "https://oauth2.googleapis.com/token"
	googleUserInfoURL = "https://openidconnect.googleapis.com/v1/userinfo" // OIDC — v2 아님
)

type google struct {
	base
	cfg    ProviderConfig
	client *http.Client
}

func NewGoogle(cfg ProviderConfig) Provider {
	return &google{cfg: cfg, client: newHTTPClient()}
}

func (g *google) Name() string       { return "google" }
func (g *google) SupportsPKCE() bool { return true }

func (g *google) AuthorizeURL(state, challenge, redirectURI string) string {
	q := url.Values{
		"client_id":     {g.cfg.ClientID},
		"redirect_uri":  {redirectURI},
		"response_type": {"code"},
		"scope":         {"openid email profile"},
		"state":         {state},
		// 매번 계정 선택을 보여 준다 — 기기를 공유하는 사용자가 남의 계정으로 조용히 붙는 것을 막는다.
		"prompt": {"select_account"},
	}
	if challenge != "" {
		q.Set("code_challenge", challenge)
		q.Set("code_challenge_method", "S256")
	}
	return googleAuthURL + "?" + q.Encode()
}

func (g *google) Exchange(ctx context.Context, code, verifier, redirectURI string) (Profile, error) {
	form := url.Values{
		"client_id":     {g.cfg.ClientID},
		"client_secret": {g.cfg.ClientSecret}, // ⚠ body 로 보낸다 — 쿼리에 실으면 URL·로그에 남는다
		"code":          {code},
		"grant_type":    {"authorization_code"},
		"redirect_uri":  {redirectURI},
	}
	if verifier != "" {
		form.Set("code_verifier", verifier)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, googleTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return Profile{}, err
	}
	req.Header.Set("content-type", "application/x-www-form-urlencoded")
	res, err := g.client.Do(req)
	if err != nil {
		return Profile{}, fmt.Errorf("google: 토큰 교환 요청 실패: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		// ⚠ 본문에 code 가 되비칠 수 있으므로 그대로 로그에 싣지 않는다 — 상태 코드만 올린다.
		return Profile{}, fmt.Errorf("google: 토큰 교환 거절(HTTP %d)", res.StatusCode)
	}
	var tok struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(res.Body).Decode(&tok); err != nil {
		return Profile{}, fmt.Errorf("google: 토큰 응답을 읽을 수 없습니다: %w", err)
	}
	if tok.AccessToken == "" {
		return Profile{}, fmt.Errorf("google: access_token 이 비어 있습니다")
	}

	ureq, err := http.NewRequestWithContext(ctx, http.MethodGet, googleUserInfoURL, nil)
	if err != nil {
		return Profile{}, err
	}
	ureq.Header.Set("authorization", "Bearer "+tok.AccessToken)
	ures, err := g.client.Do(ureq)
	if err != nil {
		return Profile{}, fmt.Errorf("google: 프로필 조회 실패: %w", err)
	}
	defer ures.Body.Close()
	if ures.StatusCode != http.StatusOK {
		return Profile{}, fmt.Errorf("google: 프로필 조회 거절(HTTP %d)", ures.StatusCode)
	}
	var ui struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"` // OIDC 는 boolean 이다(v2 의 verified_email 과 다르다)
		Name          string `json:"name"`
	}
	if err := json.NewDecoder(ures.Body).Decode(&ui); err != nil {
		return Profile{}, fmt.Errorf("google: 프로필을 읽을 수 없습니다: %w", err)
	}
	if ui.Sub == "" {
		return Profile{}, fmt.Errorf("google: sub 가 비어 있습니다 — 불변 앵커가 없으면 연결할 수 없다")
	}
	return Profile{
		ProviderUserID: ui.Sub,
		Email:          ui.Email,
		EmailVerified:  ui.EmailVerified, // I-4 — 제공자가 명시 보증한 값만 쓴다
		DisplayName:    ui.Name,
		RefreshToken:   tok.RefreshToken, // 대개 비어 있다(offline access 를 요구하지 않는다)
	}, nil
}
