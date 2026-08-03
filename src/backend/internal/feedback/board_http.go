// @plm SRS-006  아이디어보드 어댑터 — PLM `/ideas`에 말하는 유일한 곳
//
// ─────────────────────────────────────────────────────────────────────────────
// 규칙(service.go)은 HTTP를 모른다. 바깥이 어떤 모양으로 대답하는지 아는 것은 이 파일뿐이라,
// 보드가 바뀌면 여기만 고치면 된다.
//
// ── 안 될 때 무엇을 말하나 ──────────────────────────────────────────────────
// 보드가 죽었거나 느린 것은 **우리 잘못이 아니다** — 그럴 땐 Unavailable을 준다(화면이 "다시 시도"를
// 권할 수 있는 유일한 실패다). 우리가 잘못 부른 것(4xx)은 Internal로 감춘다 —
// 바깥 API의 응답 문구를 사용자에게 그대로 흘리지 않는다.
//
// ── 토큰이 없으면 켜지지 않는다 ─────────────────────────────────────────────
// 토큰 없이 부팅을 막지는 않는다(피드백 하나 때문에 전 기능이 죽으면 안 된다).
// 대신 부르는 순간 Unavailable로 답하고, 그 사실을 로그로 남긴다.
// ─────────────────────────────────────────────────────────────────────────────
package feedback

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// 바깥을 기다리는 시간. 이보다 오래 걸리면 화면이 먼저 지친다.
const boardTimeout = 20 * time.Second

// PLM `/ideas` 한 행. **여기 적힌 필드만** 우리가 아는 전부다.
type plmIdea struct {
	ID           int64   `json:"id"`
	Title        string  `json:"title"`
	Body         *string `json:"body"`
	State        string  `json:"state"`
	PromotedCode *string `json:"promoted_code"`
}

type HTTPBoard struct {
	baseURL string
	token   string
	project string
	client  *http.Client
}

func NewHTTPBoard(baseURL, token, project string) *HTTPBoard {
	if project == "" {
		project = "liftgram"
	}
	return &HTTPBoard{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   token,
		project: project,
		client:  &http.Client{Timeout: boardTimeout},
	}
}

func (b *HTTPBoard) configured() error {
	if b.baseURL == "" || b.token == "" {
		return errs.New(errs.Unavailable, "feedback board not configured")
	}
	return nil
}

func (b *HTTPBoard) do(ctx context.Context, method, path string, body []byte) ([]byte, error) {
	if err := b.configured(); err != nil {
		return nil, err
	}
	var rdr io.Reader
	if body != nil {
		rdr = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, b.baseURL+path, rdr)
	if err != nil {
		return nil, errs.New(errs.Unavailable, "bad board request")
	}
	req.Header.Set("Authorization", "Bearer "+b.token)
	// Cloudflare가 기본 UA를 막는다 — 이름을 밝히지 않으면 403이 온다.
	req.Header.Set("User-Agent", "liftgram-server/1")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	res, err := b.client.Do(req)
	if err != nil {
		// 못 닿았다 — 우리 잘못이 아니다.
		slog.ErrorContext(ctx, "idea board unreachable", "path", path, "err", err.Error())
		return nil, errs.New(errs.Unavailable, "idea board unreachable")
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if err != nil {
		return nil, errs.New(errs.Unavailable, "idea board read failed")
	}
	if res.StatusCode >= 500 {
		slog.ErrorContext(ctx, "idea board 5xx", "path", path, "status", res.StatusCode)
		return nil, errs.New(errs.Unavailable, "idea board failing")
	}
	if res.StatusCode >= 400 {
		// 우리가 잘못 불렀다. 바깥의 문구를 사용자에게 흘리지 않고 로그에만 남긴다.
		slog.ErrorContext(ctx, "idea board rejected", "path", path, "status", res.StatusCode,
			"body", truncate(string(raw), 200))
		return nil, fmt.Errorf("idea board %s %d", path, res.StatusCode)
	}
	return raw, nil
}

func (b *HTTPBoard) Create(ctx context.Context, title, body string) (int64, error) {
	payload, err := json.Marshal(map[string]any{
		"project": b.project, "title": title, "body": body, "anonymous": false,
	})
	if err != nil {
		return 0, err
	}
	raw, err := b.do(ctx, http.MethodPost, "/ideas", payload)
	if err != nil {
		return 0, err
	}
	var out struct {
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(raw, &out); err != nil || out.ID == 0 {
		slog.ErrorContext(ctx, "idea board create: unexpected body", "body", truncate(string(raw), 200))
		return 0, fmt.Errorf("unexpected idea board response")
	}
	return out.ID, nil
}

func (b *HTTPBoard) List(ctx context.Context) ([]Idea, error) {
	raw, err := b.do(ctx, http.MethodGet, "/ideas?project="+url.QueryEscape(b.project), nil)
	if err != nil {
		return nil, err
	}
	var rows []plmIdea
	if err := json.Unmarshal(raw, &rows); err != nil {
		slog.ErrorContext(ctx, "idea board list: unexpected body", "body", truncate(string(raw), 200))
		return nil, fmt.Errorf("unexpected idea board response")
	}
	out := make([]Idea, 0, len(rows))
	for _, r := range rows {
		out = append(out, Idea{
			ID: r.ID, Title: r.Title, Body: deref(r.Body),
			State: r.State, PromotedCode: deref(r.PromotedCode),
		})
	}
	return out, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
