// 사진 자동 검사 호출(SPEC-031) — imagescan 컨테이너에 바이트를 보내 점수를 받는다.
package media

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

// scanTimeout — 올리기가 이만큼까지만 기다린다. 넘으면 「검사 못 함」으로 두고 나중에 다시 본다.
const scanTimeout = 3 * time.Second

// scoreLogFrom — 이 점수부터 기록한다. 기준값을 조정할 근거이고 사진 내용은 남지 않는다.
const scoreLogFrom = 0.5

// ErrUnscannable — 검사기가 살아 있지만 이 사진을 판단하지 못했다. 다시 해도 같으므로 사람에게 넘긴다.
var ErrUnscannable = errors.New("검사할 수 없는 사진")

type HTTPScanner struct {
	url       string
	threshold float64
	client    *http.Client
}

func NewHTTPScanner(baseURL string, threshold float64) *HTTPScanner {
	return &HTTPScanner{
		url:       baseURL + "/scan",
		threshold: threshold,
		client:    &http.Client{Timeout: scanTimeout},
	}
}

func (s *HTTPScanner) Scan(ctx context.Context, data []byte, _ string) (ScanResult, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.url, bytes.NewReader(data))
	if err != nil {
		return ScanResult{}, err
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	res, err := s.client.Do(req)
	if err != nil {
		return ScanResult{}, err
	}
	defer func() { _ = res.Body.Close() }()
	if res.StatusCode == http.StatusBadRequest || res.StatusCode == http.StatusRequestEntityTooLarge {
		return ScanResult{}, ErrUnscannable
	}
	if res.StatusCode != http.StatusOK {
		return ScanResult{}, fmt.Errorf("imagescan 응답 %d", res.StatusCode)
	}
	var body struct {
		Score float64 `json:"score"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return ScanResult{}, err
	}
	if body.Score >= scoreLogFrom {
		slog.Info("[media] 사진 검사 점수", "score", body.Score, "threshold", s.threshold)
	}
	return ScanResult{Flagged: body.Score >= s.threshold, Reason: "auto_scan"}, nil
}

// ScheduledScanner — 방침이 시행되기 전에는 검사하지 않는다(방침이 시행 7일 전 공지를 약속한다).
type ScheduledScanner struct {
	Since time.Time
	Inner Scanner
	Now   func() time.Time
}

func (s ScheduledScanner) Scan(ctx context.Context, data []byte, contentType string) (ScanResult, error) {
	if s.Now().Before(s.Since) {
		return ScanResult{}, nil
	}
	return s.Inner.Scan(ctx, data, contentType)
}
