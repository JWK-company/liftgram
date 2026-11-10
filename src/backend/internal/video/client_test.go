package video

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func testClient(t *testing.T, status int, body string, check func(r *http.Request)) *Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if check != nil {
			check(r)
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	c := NewClient("SECRETKEY")
	c.baseURL = srv.URL
	return c
}

func TestClient_KeyInHeaderNotURL(t *testing.T) {
	c := testClient(t, 200, `{"items":[{"id":"dQw4w9WgXcQ","snippet":{"title":"T","channelTitle":"C","description":"D"},"contentDetails":{"duration":"PT1H2M3S"},"status":{"embeddable":true,"privacyStatus":"public"}}]}`,
		func(r *http.Request) {
			if strings.Contains(r.URL.String(), "SECRETKEY") {
				t.Errorf("주소에 키: %s", r.URL)
			}
			if r.Header.Get("X-Goog-Api-Key") != "SECRETKEY" {
				t.Errorf("헤더 키 없음")
			}
			if r.URL.Query().Get("part") != "snippet,contentDetails,status" {
				t.Errorf("part = %s", r.URL.Query().Get("part"))
			}
		})
	info, err := c.Fetch(context.Background(), vid)
	if err != nil {
		t.Fatal(err)
	}
	if info.Title != "T" || info.Channel != "C" || info.Description != "D" || info.DurationSec != 3723 || !info.Embeddable {
		t.Fatalf("%+v", info)
	}
}

func TestClient_Errors(t *testing.T) {
	cases := []struct {
		name   string
		status int
		body   string
		want   error
	}{
		{"빈 items", 200, `{"items":[]}`, ErrNotFound},
		{"비공개", 200, `{"items":[{"status":{"privacyStatus":"private"}}]}`, ErrNotFound},
		{"할당량", 403, `{"error":{"errors":[{"reason":"quotaExceeded"}]}}`, ErrQuotaExceeded},
		{"키 무효", 400, `{"error":{"errors":[{"reason":"badRequest"}],"details":[{"reason":"API_KEY_INVALID"}]}}`, ErrKeyRejected},
		{"API 꺼짐", 403, `{"error":{"errors":[{"reason":"accessNotConfigured"}]}}`, ErrKeyRejected},
		{"keyInvalid", 400, `{"error":{"errors":[{"reason":"keyInvalid"}]}}`, ErrKeyRejected},
		{"키 만료", 400, `{"error":{"errors":[{"reason":"badRequest"}],"details":[{"reason":"API_KEY_EXPIRED"}]}}`, ErrKeyRejected},
		{"분당 한도", 403, `{"error":{"errors":[{"reason":"rateLimitExceeded"}],"details":[{"reason":"RATE_LIMIT_EXCEEDED"}]}}`, ErrRateLimited},
		{"할당량이 분당보다 먼저", 403, `{"error":{"errors":[{"reason":"quotaExceeded"}],"details":[{"reason":"RATE_LIMIT_EXCEEDED"}]}}`, ErrQuotaExceeded},
		{"영상 권한(forbidden)은 그 영상만", 403, `{"error":{"errors":[{"reason":"forbidden"}]}}`, ErrNotFound},
		{"404", 404, `{"error":{"errors":[{"reason":"videoNotFound"}]}}`, ErrNotFound},
		{"리다이렉트", 302, ``, ErrUpstream},
		{"500", 500, `oops`, ErrUpstream},
		{"깨진 JSON", 200, `{`, ErrUpstream},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := testClient(t, tc.status, tc.body, nil).Fetch(context.Background(), vid)
			if !errors.Is(err, tc.want) {
				t.Fatalf("= %v, want %v", err, tc.want)
			}
			if err != nil && strings.Contains(err.Error(), "SECRETKEY") {
				t.Fatal("오류에 키")
			}
		})
	}
}

func TestClient_Embeddable(t *testing.T) {
	cases := map[string]string{
		"KR 차단":    `"contentDetails":{"regionRestriction":{"blocked":["KR"]}},"status":{"embeddable":true}`,
		"KR 없는 허용": `"contentDetails":{"regionRestriction":{"allowed":["US"]}},"status":{"embeddable":true}`,
		"연령 제한":    `"contentDetails":{"contentRating":{"ytRating":"ytAgeRestricted"}},"status":{"embeddable":true}`,
		"임베드 끔":    `"status":{"embeddable":false}`,
	}
	for name, part := range cases {
		info, err := testClient(t, 200, `{"items":[{"id":"x",`+part+`}]}`, nil).Fetch(context.Background(), vid)
		if err != nil || info.Embeddable {
			t.Fatalf("%s: embeddable=%v err=%v", name, info.Embeddable, err)
		}
	}
}

func TestClient_EmbeddableKRAllowed(t *testing.T) {
	for name, part := range map[string]string{
		"KR 허용 목록": `"contentDetails":{"regionRestriction":{"allowed":["KR","US"]}},"status":{"embeddable":true}`,
		"다른 나라 차단": `"contentDetails":{"regionRestriction":{"blocked":["US"]}},"status":{"embeddable":true}`,
	} {
		info, err := testClient(t, 200, `{"items":[{"id":"x",`+part+`}]}`, nil).Fetch(context.Background(), vid)
		if err != nil || !info.Embeddable {
			t.Fatalf("%s: embeddable=%v err=%v", name, info.Embeddable, err)
		}
	}
}

func TestClient_NoRedirectFollow(t *testing.T) {
	var leaked atomic.Bool
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Goog-Api-Key") != "" {
			leaked.Store(true)
		}
	}))
	t.Cleanup(other.Close)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL+"/x", http.StatusFound)
	}))
	t.Cleanup(srv.Close)
	c := NewClient("SECRETKEY")
	c.baseURL = srv.URL
	if _, err := c.Fetch(context.Background(), vid); !errors.Is(err, ErrUpstream) {
		t.Fatalf("= %v", err)
	}
	if leaked.Load() {
		t.Fatal("리다이렉트로 키 헤더가 다른 호스트에 갔다")
	}
}

func TestClient_BodyCapAndTimeout(t *testing.T) {
	big := `{"items":[{"id":"x","snippet":{"description":"` + strings.Repeat("a", maxBody) + `"}}]}`
	if _, err := testClient(t, 200, big, nil).Fetch(context.Background(), vid); !errors.Is(err, ErrUpstream) {
		t.Fatalf("256KB 넘는 본문 = %v", err)
	}
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	t.Cleanup(slow.Close)
	c := NewClient("k")
	c.baseURL = slow.URL
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	_, err := c.Fetch(ctx, vid)
	if !errors.Is(err, ErrUpstream) || !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("시간 초과 = %v", err)
	}
}

func TestParseISODuration(t *testing.T) {
	for in, want := range map[string]int{"PT15M": 900, "PT1H": 3600, "P1DT1S": 86401, "P1W": 604800, "P1W2DT3H": 788400, "PT0S": 0, "P0D": 0, "": 0, "weird": 0, "P99999999D": 2147483647} {
		if got := parseISODuration(in); got != want {
			t.Errorf("%q = %d, want %d", in, got, want)
		}
	}
}
