// @plm SRS-052  OIDC 공통 — 토큰 교환과 프로필 조회의 **한 벌** (P4)
//
// ─────────────────────────────────────────────────────────────────────────────
// 구글·카카오·네이버는 인가 코드 교환이 사실상 같다(client_secret_post + PKCE verifier).
// 어댑터마다 따로 쓰면 세 벌이 되고, **한쪽만 고치는 사고**가 난다 — 실제로 위험한 것들이다:
//
//	· client_secret 을 쿼리에 실었다가 URL·프록시 로그에 남기는 것
//	· 오류 본문을 그대로 로그에 올려 code 가 되비치는 것
//	· 타임아웃 없는 클라이언트로 고루틴이 쌓이는 것
//
// 그래서 한 곳에 둔다. 어댑터가 다른 것은 **URL 과 프로필 파싱**뿐이다.
// ─────────────────────────────────────────────────────────────────────────────
package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// 프로필 응답을 읽을 때의 상한. 제공자가 거대한 본문을 흘려도 메모리를 먹지 않는다.
const maxProfileBytes = 1 << 20 // 1MiB

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	IDToken      string `json:"id_token"`
}

// exchangeCode — 인가 코드를 토큰으로. 제공자 이름은 오류 문구에만 쓴다.
//
// ⚠ client_secret 은 **body** 로 보낸다(client_secret_post). 쿼리에 실으면 URL 에 남고,
// 그 URL 은 프록시·접근 로그·리퍼러로 새어 나간다. 네이버 문서의 GET 예제를 따라 하면 안 된다.
func exchangeCode(ctx context.Context, c *http.Client, name, tokenURL string,
	cfg ProviderConfig, code, verifier, redirectURI string) (tokenResponse, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"client_id":     {cfg.ClientID},
		"client_secret": {cfg.ClientSecret},
		"code":          {code},
		"redirect_uri":  {redirectURI},
	}
	if verifier != "" {
		form.Set("code_verifier", verifier)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return tokenResponse{}, err
	}
	req.Header.Set("content-type", "application/x-www-form-urlencoded")
	res, err := c.Do(req)
	if err != nil {
		return tokenResponse{}, fmt.Errorf("%s: 토큰 교환 요청 실패: %w", name, err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		// ⚠ 본문에 code 가 되비칠 수 있다 — 상태 코드만 올린다.
		return tokenResponse{}, fmt.Errorf("%s: 토큰 교환 거절(HTTP %d)", name, res.StatusCode)
	}
	var tok tokenResponse
	if err := json.NewDecoder(io.LimitReader(res.Body, maxProfileBytes)).Decode(&tok); err != nil {
		return tokenResponse{}, fmt.Errorf("%s: 토큰 응답을 읽을 수 없습니다: %w", name, err)
	}
	if tok.AccessToken == "" {
		// ⚠ 카카오·네이버는 실패해도 HTTP 200 에 오류 본문을 싣는 경우가 있다.
		//   상태 코드만 보면 빈 토큰으로 다음 단계에 들어가 엉뚱한 오류를 낸다.
		return tokenResponse{}, fmt.Errorf("%s: access_token 이 비어 있습니다", name)
	}
	return tok, nil
}

// fetchProfile — Bearer 로 프로필 엔드포인트를 읽어 out 에 디코딩한다.
func fetchProfile(ctx context.Context, c *http.Client, name, userInfoURL, accessToken string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, userInfoURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("authorization", "Bearer "+accessToken)
	res, err := c.Do(req)
	if err != nil {
		return fmt.Errorf("%s: 프로필 조회 실패: %w", name, err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: 프로필 조회 거절(HTTP %d)", name, res.StatusCode)
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, maxProfileBytes)).Decode(out); err != nil {
		return fmt.Errorf("%s: 프로필을 읽을 수 없습니다: %w", name, err)
	}
	return nil
}

// authorizeURL — 인가 URL 조립. scope 는 제공자마다 다르므로 인자로 받는다.
func authorizeURL(base string, cfg ProviderConfig, scope, state, challenge, redirectURI string, extra url.Values) string {
	q := url.Values{
		"response_type": {"code"},
		"client_id":     {cfg.ClientID},
		"redirect_uri":  {redirectURI},
		"state":         {state},
	}
	if scope != "" {
		q.Set("scope", scope)
	}
	if challenge != "" {
		q.Set("code_challenge", challenge)
		q.Set("code_challenge_method", "S256")
	}
	for k, vs := range extra {
		for _, v := range vs {
			q.Set(k, v)
		}
	}
	return base + "?" + q.Encode()
}

// scalarString — JSON 스칼라(문자열 또는 숫자)를 **원문 그대로의** 문자열로.
// 문자열이면 따옴표만 벗기고, 숫자면 바이트를 그대로 쓴다 — float64 를 거치지 않는 것이 핵심이다.
func scalarString(raw json.RawMessage) string {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return ""
	}
	if s[0] == '"' {
		var out string
		if err := json.Unmarshal(raw, &out); err != nil {
			return ""
		}
		return out
	}
	return s
}
