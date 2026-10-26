// @plm SRS-052  봇 방어 — Cloudflare Turnstile 서버 검증 (auth-golive P1 · D4)
//
// ─────────────────────────────────────────────────────────────────────────────
// 공개 가입·재설정 요청·검증 재발송은 **로그인 없이** 메일을 내보내는 입구다. per-IP 한도와 받는 사람별
// 상한이 있어도, 주소를 바꿔 가며 두드리는 봇은 우리 도메인을 남의 메일함에 대는 확성기로 쓸 수 있고
// 발신 평판이 떨어지면 진짜 사용자의 메일이 스팸함으로 간다. 그래서 익명 요청에는 사람 확인을 요구한다.
//
// 판단 셋:
//   - 비밀키가 없으면 **검사하지 않는다**(NewTurnstile 이 nil) — 키 발급 전에 배포해도 동작이 그대로다
//   - 토큰이 없거나 Cloudflare 가 거절하면 **막는다**
//   - Cloudflare 에 닿지 못하면(네트워크·5xx) **통과시킨다** — 그들의 장애가 우리 가입 중단이 되면 안 된다.
//     그 순간에도 per-IP 한도·받는 사람별 상한은 그대로 서 있다
//
// ⚠ 프론트 사이트 키(TURNSTILE_SITE_KEY)와 **짝으로** 켠다. 백엔드만 켜면 위젯이 없어 토큰이 안 오고,
//
//	익명 가입이 전부 막힌다(spec 20261001 P1 · .env.example 주석).
//
// ─────────────────────────────────────────────────────────────────────────────
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// TurnstileHeader — 프론트가 위젯 토큰을 싣는 요청 헤더.
const TurnstileHeader = "X-Turnstile-Token"

const turnstileEndpoint = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

// ErrHumanCheck — 사람 확인 실패(토큰 없음·거절). 화면은 위젯을 다시 띄운다.
var ErrHumanCheck = errors.New("보안 확인을 다시 해 주세요")

type Turnstile struct {
	secret   string
	endpoint string
	client   *http.Client
}

// NewTurnstile — 비밀키가 비면 nil(검사 끔).
func NewTurnstile(secret string) *Turnstile {
	if strings.TrimSpace(secret) == "" {
		return nil
	}
	return &Turnstile{secret: secret, endpoint: turnstileEndpoint, client: &http.Client{Timeout: 5 * time.Second}}
}

// Verify — 토큰을 Cloudflare 에 묻는다. 닿지 못하면 nil(통과 · 위 판단 셋).
func (t *Turnstile) Verify(ctx context.Context, token, ip string) error {
	if t == nil {
		return nil
	}
	token = strings.TrimSpace(token)
	if token == "" || len(token) > 2048 {
		return ErrHumanCheck
	}
	form := url.Values{"secret": {t.secret}, "response": {token}}
	if ip != "" {
		form.Set("remoteip", ip)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, t.endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return nil
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := t.client.Do(req)
	if err != nil {
		slog.Warn("[turnstile] 검증 서버에 닿지 못했다 — 통과시킨다", "err", err)
		return nil
	}
	defer res.Body.Close()
	if res.StatusCode >= 500 {
		slog.Warn("[turnstile] 검증 서버 오류 — 통과시킨다", "status", res.StatusCode)
		return nil
	}
	var out struct {
		Success bool     `json:"success"`
		Codes   []string `json:"error-codes"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(nil, res.Body, 64<<10)).Decode(&out); err != nil {
		slog.Warn("[turnstile] 응답 해석 실패 — 통과시킨다", "err", err)
		return nil
	}
	if !out.Success {
		// invalid-input-secret 는 **우리 설정** 문제다 — 사용자를 탓하지 말고 크게 남긴다.
		for _, c := range out.Codes {
			if c == "invalid-input-secret" || c == "missing-input-secret" {
				slog.Error("[turnstile] 비밀키가 틀렸다 — TURNSTILE_SECRET 을 확인하세요", "codes", out.Codes)
			}
		}
		return fmt.Errorf("%w (%s)", ErrHumanCheck, strings.Join(out.Codes, ","))
	}
	return nil
}
