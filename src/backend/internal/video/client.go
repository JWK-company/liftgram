// Data API 클라이언트 — videos.list 한 번(SPEC-054 Phase 2). Service 의 Fetcher 를 구현한다.
//
// 키는 주소가 아니라 X-Goog-Api-Key 헤더로 보낸다(오류 문장·프록시 로그에 키가 실리지 않게 · B1).
// 실패는 service.go 의 Err* 로만 바꿔 돌려준다 — 바깥 응답 본문·주소를 오류에 싣지 않는다.
package video

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const maxBody = 256 * 1024

// Client — baseURL 은 시험에서 httptest 주소로 바꾼다.
type Client struct {
	key     string
	baseURL string
	http    *http.Client
}

func NewClient(key string) *Client {
	return &Client{key: key, baseURL: "https://www.googleapis.com/youtube/v3", http: &http.Client{
		// 문맥(5초)이 먼저 끝나게 조금 길게 — 시간 초과 꼬리표가 맞게 남는다(리뷰 G14)
		Timeout: fetchTimeout + time.Second,
		// 리다이렉트를 따라가지 않는다 — 다른 호스트로 가도 직접 단 키 헤더는 복사된다(리뷰 S4)
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

type apiResp struct {
	Items []struct {
		ID      string `json:"id"`
		Snippet struct {
			Title        string `json:"title"`
			ChannelTitle string `json:"channelTitle"`
			Description  string `json:"description"`
		} `json:"snippet"`
		ContentDetails struct {
			Duration          string `json:"duration"`
			RegionRestriction *struct {
				Allowed []string `json:"allowed"`
				Blocked []string `json:"blocked"`
			} `json:"regionRestriction"`
			ContentRating struct {
				YtRating string `json:"ytRating"`
			} `json:"contentRating"`
		} `json:"contentDetails"`
		Status struct {
			Embeddable    bool   `json:"embeddable"`
			PrivacyStatus string `json:"privacyStatus"`
		} `json:"status"`
	} `json:"items"`
}

type apiErr struct {
	Error struct {
		Errors []struct {
			Reason string `json:"reason"`
		} `json:"errors"`
		Details []struct {
			Reason string `json:"reason"`
		} `json:"details"`
	} `json:"error"`
}

func (c *Client) Fetch(ctx context.Context, videoID string) (Info, error) {
	q := url.Values{}
	q.Set("part", "snippet,contentDetails,status")
	q.Set("id", videoID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/videos?"+q.Encode(), nil)
	if err != nil {
		return Info{}, ErrUpstream
	}
	req.Header.Set("X-Goog-Api-Key", c.key)
	req.Header.Set("Accept", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return Info{}, fmt.Errorf("%w: %w", ErrUpstream, context.DeadlineExceeded)
		}
		return Info{}, ErrUpstream
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, maxBody))
	if err != nil {
		return Info{}, ErrUpstream
	}
	if res.StatusCode != http.StatusOK {
		return Info{}, classify(res.StatusCode, body)
	}
	var r apiResp
	if err := json.Unmarshal(body, &r); err != nil {
		return Info{}, ErrUpstream
	}
	if len(r.Items) == 0 {
		return Info{}, ErrNotFound
	}
	it := r.Items[0]
	if it.Status.PrivacyStatus == "private" {
		return Info{}, ErrNotFound
	}
	embeddable := it.Status.Embeddable && it.ContentDetails.ContentRating.YtRating != "ytAgeRestricted"
	if rr := it.ContentDetails.RegionRestriction; rr != nil {
		if contains(rr.Blocked, "KR") || (len(rr.Allowed) > 0 && !contains(rr.Allowed, "KR")) {
			embeddable = false
		}
	}
	return Info{
		VideoID:     videoID,
		Title:       it.Snippet.Title,
		Channel:     it.Snippet.ChannelTitle,
		Description: it.Snippet.Description,
		DurationSec: parseISODuration(it.ContentDetails.Duration),
		Embeddable:  embeddable,
	}, nil
}

// classify — 사유로 할당량·분당 한도·키 문제·없는 영상을 가른다. 그 밖은 ErrUpstream.
func classify(status int, body []byte) error {
	var e apiErr
	_ = json.Unmarshal(body, &e)
	reasons := []string{}
	for _, x := range e.Error.Errors {
		reasons = append(reasons, x.Reason)
	}
	for _, x := range e.Error.Details {
		reasons = append(reasons, x.Reason)
	}
	// 하루 할당량이 가장 무겁다 — 같은 응답에 여러 사유가 오면 먼저 본다
	for _, r := range reasons {
		if r == "quotaExceeded" || r == "dailyLimitExceeded" {
			return ErrQuotaExceeded
		}
	}
	for _, r := range reasons {
		switch {
		// [원본] RATE_LIMIT_EXCEEDED 를 하루 할당량으로 — 분당 한도에도 와서 최대 24시간 멈췄다(리뷰 G2/S1)
		case r == "rateLimitExceeded" || r == "userRateLimitExceeded" || r == "RATE_LIMIT_EXCEEDED":
			return ErrRateLimited
		// [원본] "forbidden" 도 키 거절 — 영상 단위 권한 사유일 수 있어 한 사람이 기능 전체를 10분씩 끌 수 있었다(리뷰 S2)
		case r == "keyInvalid" || r == "accessNotConfigured" || r == "SERVICE_DISABLED" || r == "ipRefererBlocked" || strings.HasPrefix(r, "API_KEY_"):
			return ErrKeyRejected
		case r == "forbidden" || r == "videoNotFound" || r == "notFound":
			return ErrNotFound
		}
	}
	if status == http.StatusNotFound {
		return ErrNotFound // 리뷰 G6 — 문서상 404 videoNotFound 도 캐시되게
	}
	if status >= 300 && status < 400 {
		return ErrUpstream // 리다이렉트는 따라가지 않는다
	}
	return ErrUpstream
}

func contains(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}

var isoDur = regexp.MustCompile(`^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$`)

// parseISODuration — "PT1H2M3S"·"P1DT2H" → 초. 모르는 꼴이면 0.
func parseISODuration(s string) int {
	m := isoDur.FindStringSubmatch(s)
	if m == nil {
		return 0
	}
	n := func(x string) int {
		v, _ := strconv.Atoi(x)
		return v
	}
	// 주(W) 꼴도 — 아주 긴 라이브 다시보기(리뷰 G10) · 초 단위 정수로 더해 넘침을 피한다
	total := int64(n(m[1]))*7*86400 + int64(n(m[2]))*86400 + int64(n(m[3]))*3600 + int64(n(m[4]))*60 + int64(n(m[5]))
	if total > math.MaxInt32 {
		return math.MaxInt32
	}
	return int(total)
}
