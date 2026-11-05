package gyms

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const fitness = "스포츠,레저 > 스포츠시설 > 헬스클럽"

type doc struct {
	ID        string `json:"id"`
	PlaceName string `json:"place_name"`
	Category  string `json:"category_name"`
	Road      string `json:"road_address_name"`
	Address   string `json:"address_name"`
	X         string `json:"x"`
	Y         string `json:"y"`
}

func kakaoJSON(isEnd bool, docs ...doc) string {
	if docs == nil {
		docs = []doc{}
	}
	b, _ := json.Marshal(map[string]any{"meta": map[string]any{"is_end": isEnd}, "documents": docs})
	return string(b)
}

func fake(t *testing.T, fn http.HandlerFunc) (*Handler, *atomic.Int32) {
	t.Helper()
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		fn(w, r)
	}))
	t.Cleanup(srv.Close)
	h := NewHandler("test-key", nil)
	h.baseURL = srv.URL
	return h, &calls
}

func post(h http.Handler, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/gyms/nearby", strings.NewReader(body))
	req.RemoteAddr = "198.51.100.7:4000"
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

const seoul = `{"lat":37.5665,"lon":126.978,"radius":2000}`

func TestSearchReturnsOnlyAllowedFields(t *testing.T) {
	var auth, sort string
	h, _ := fake(t, func(w http.ResponseWriter, r *http.Request) {
		auth, sort = r.Header.Get("Authorization"), r.URL.Query().Get("sort")
		fmt.Fprint(w, kakaoJSON(true,
			doc{ID: "123", PlaceName: "역삼 피트니스", Category: fitness, Road: "서울 강남구 1", Address: "옛 주소", X: "127.03", Y: "37.5"},
			doc{ID: "9", PlaceName: "헬스장 앞 카페", Category: "음식점 > 카페", X: "127", Y: "37"},
		))
	})
	rec := post(h, seoul)
	if rec.Code != 200 {
		t.Fatalf("상태 %d", rec.Code)
	}
	if auth != "KakaoAK test-key" || sort != "distance" {
		t.Fatalf("요청 auth=%q sort=%q", auth, sort)
	}
	var got Response
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Gyms) != 1 || got.Gyms[0] != (Gym{ID: "123", Name: "역삼 피트니스", Lat: 37.5, Lon: 127.03, Address: "서울 강남구 1"}) {
		t.Fatalf("결과 %+v", got)
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("no-store 가 없다")
	}
}

func TestInvalidInputDoesNotCallKakao(t *testing.T) {
	h, calls := fake(t, func(http.ResponseWriter, *http.Request) {})
	cases := map[string]int{
		`{"lat":37,"lon":127,"radius":3000}`:       400,
		`{"lon":127,"radius":2000}`:                400,
		`{"lat":"x","lon":127,"radius":2000}`:      400,
		`nope`:                                     400,
		`{"lat":35.68,"lon":139.76,"radius":2000}`: 422, // 도쿄
		`{"lat":33.59,"lon":130.40,"radius":2000}`: 422, // 후쿠오카 — 상자 안이지만 뺀다
	}
	for body, want := range cases {
		if rec := post(h, body); rec.Code != want {
			t.Errorf("%s: 상태 %d, 기대 %d", body, rec.Code, want)
		}
	}
	if calls.Load() != 0 {
		t.Fatalf("카카오를 %d번 불렀다", calls.Load())
	}
	for _, in := range [][2]float64{{33.5, 126.5}, {35.1, 129.1}, {35.05, 129.08}, {34.85, 128.62}, {37.5, 130.9}, {37.24, 131.87}} {
		if !inKorea(in[0], in[1]) {
			t.Errorf("국내로 봐야 한다: %v", in)
		}
	}
	for _, in := range [][2]float64{{34.67, 131.84}, {34.65, 129.45}, {33.59, 130.40}} {
		if inKorea(in[0], in[1]) {
			t.Errorf("국외로 봐야 한다: %v", in)
		}
	}
}

func TestMethodMustBePost(t *testing.T) {
	h := NewHandler("k", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/gyms/nearby?lat=37&lon=127", nil))
	if rec.Code != 405 {
		t.Fatalf("상태 %d", rec.Code)
	}
}

func TestNoKeyIs503(t *testing.T) {
	if rec := post(NewHandler(" ", nil), seoul); rec.Code != 503 {
		t.Fatalf("상태 %d", rec.Code)
	}
}

func TestRejectionPausesCalls(t *testing.T) {
	for _, status := range []int{401, 403, 429} {
		h, calls := fake(t, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(status) })
		now := time.Unix(1_800_000_000, 0)
		h.now = func() time.Time { return now }
		post(h, seoul)
		if rec := post(h, seoul); rec.Code != 503 {
			t.Fatalf("%d: 상태 %d", status, rec.Code)
		}
		if calls.Load() != 1 {
			t.Fatalf("%d: 정지 중에 %d번 불렀다", status, calls.Load())
		}
		now = now.Add(rejectedPause + time.Second)
		post(h, seoul)
		if calls.Load() != 2 {
			t.Fatalf("%d: 정지가 풀리지 않았다", status)
		}
	}
}

func TestServerErrorDoesNotPause(t *testing.T) {
	h, calls := fake(t, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(502) })
	post(h, seoul)
	if rec := post(h, seoul); rec.Code != 503 || calls.Load() != 2 {
		t.Fatalf("상태 %d, 호출 %d", rec.Code, calls.Load())
	}
}

func TestAllFilteredIsFailureAndNoResultIsEmpty(t *testing.T) {
	h, _ := fake(t, func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, kakaoJSON(true, doc{ID: "1", PlaceName: "카페", Category: "음식점", X: "127", Y: "37"}))
	})
	if rec := post(h, seoul); rec.Code != 503 {
		t.Fatalf("전부 걸러지면 503, 받은 값 %d", rec.Code)
	}
	empty, _ := fake(t, func(w http.ResponseWriter, _ *http.Request) { fmt.Fprint(w, kakaoJSON(true)) })
	rec := post(empty, seoul)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"gyms":[]`) {
		t.Fatalf("정말 없으면 빈 목록: %d %s", rec.Code, rec.Body)
	}
}

func TestBadPlaceValuesAreDropped(t *testing.T) {
	h, _ := fake(t, func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, kakaoJSON(true,
			doc{ID: "1/../2", PlaceName: "나쁜 id", Category: fitness, X: "127", Y: "37"},
			doc{ID: "3", PlaceName: "나쁜 좌표", Category: fitness, X: "NaN", Y: "37"},
			doc{ID: "4", PlaceName: "정상", Category: fitness, X: "127", Y: "37"},
		))
	})
	var got Response
	_ = json.Unmarshal(post(h, seoul).Body.Bytes(), &got)
	if len(got.Gyms) != 1 || got.Gyms[0].ID != "4" {
		t.Fatalf("결과 %+v", got.Gyms)
	}
}

func TestPaging(t *testing.T) {
	page := func(n int) doc {
		return doc{ID: fmt.Sprint(n), PlaceName: "곳", Category: fitness, X: "127", Y: "37"}
	}
	stops, calls := fake(t, func(w http.ResponseWriter, _ *http.Request) { fmt.Fprint(w, kakaoJSON(true, page(1))) })
	var got Response
	_ = json.Unmarshal(post(stops, seoul).Body.Bytes(), &got)
	if calls.Load() != 1 || got.Truncated {
		t.Fatalf("is_end 면 멈춘다: 호출 %d %+v", calls.Load(), got)
	}

	var n atomic.Int32
	capped, calls := fake(t, func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, kakaoJSON(false, page(int(n.Add(1)))))
	})
	got = Response{}
	_ = json.Unmarshal(post(capped, seoul).Body.Bytes(), &got)
	if calls.Load() != maxPages || !got.Truncated || len(got.Gyms) != maxPages {
		t.Fatalf("3쪽에서 멈추고 잘림 표시: 호출 %d %+v", calls.Load(), got)
	}

	var m atomic.Int32
	partial, _ := fake(t, func(w http.ResponseWriter, _ *http.Request) {
		if m.Add(1) == 2 {
			w.WriteHeader(500)
			return
		}
		fmt.Fprint(w, kakaoJSON(false, page(1)))
	})
	got = Response{}
	rec := post(partial, seoul)
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if rec.Code != 200 || !got.Truncated || len(got.Gyms) != 1 {
		t.Fatalf("뒤쪽 실패는 받은 만큼: %d %+v", rec.Code, got)
	}
}

func TestDailyBudget(t *testing.T) {
	h, calls := fake(t, func(w http.ResponseWriter, _ *http.Request) { fmt.Fprint(w, kakaoJSON(true)) })
	h.day = time.Now().Format("2006-01-02")
	h.dayCalls = dailyCallBudget
	if rec := post(h, seoul); rec.Code != 503 || calls.Load() != 0 {
		t.Fatalf("상태 %d 호출 %d", rec.Code, calls.Load())
	}
}

func TestClientIPComesFromEdgeHeader(t *testing.T) {
	var keys []string
	h := NewHandler("", func(ip string) bool { keys = append(keys, ip); return false })
	if rec := post(h, seoul); rec.Code != 429 {
		t.Fatalf("상태 %d", rec.Code)
	}
	req := httptest.NewRequest(http.MethodPost, Path, strings.NewReader(seoul))
	req.Header.Set("X-Forwarded-For", "8.8.8.8, 10.0.0.1")
	h.ServeHTTP(httptest.NewRecorder(), req)
	if len(keys) != 2 || keys[0] != "198.51.100.7" || keys[1] != "8.8.8.8" {
		t.Fatalf("키 %v", keys)
	}
}

func TestLimitKeys(t *testing.T) {
	a, wideA := LimitKeys("2001:db8:1:2:aaaa::1")
	b, _ := LimitKeys("2001:db8:1:2:bbbb::9")
	c, wideC := LimitKeys("2001:db8:1:3::1")
	if a != b || a == c {
		t.Fatalf("/64 로 묶어야 한다: %s %s %s", a, b, c)
	}
	if wideA != wideC {
		t.Fatalf("/48 로도 묶어야 한다: %s %s", wideA, wideC)
	}
	if h, w := LimitKeys("198.51.100.7"); h != "198.51.100.7" || w != h {
		t.Fatalf("IPv4 %s %s", h, w)
	}
}

func TestTruncatedByPageableCount(t *testing.T) {
	h, calls := fake(t, func(w http.ResponseWriter, _ *http.Request) {
		fmt.Fprint(w, `{"meta":{"is_end":true,"total_count":120,"pageable_count":45},"documents":[{"id":"1","place_name":"곳","category_name":"스포츠","x":"127","y":"37"}]}`)
	})
	var got Response
	_ = json.Unmarshal(post(h, seoul).Body.Bytes(), &got)
	if !got.Truncated || calls.Load() != 1 {
		t.Fatalf("개수로 잘림을 알아야 한다: %+v 호출 %d", got, calls.Load())
	}
}

func TestMalformedKakaoBodyIsFailure(t *testing.T) {
	for _, body := range []string{`{"meta":{"is_end":true}}`, `{"meta":{},"documents":[]}`, `{"documents":[]}`, `nope`} {
		h, calls := fake(t, func(w http.ResponseWriter, _ *http.Request) { fmt.Fprint(w, body) })
		if rec := post(h, seoul); rec.Code != 503 || calls.Load() != 1 {
			t.Errorf("%s: 상태 %d 호출 %d", body, rec.Code, calls.Load())
		}
	}
}

func TestQuotaAs400Pauses(t *testing.T) {
	h, calls := fake(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(400)
		fmt.Fprint(w, `{"code":-10,"msg":"quota"}`)
	})
	post(h, seoul)
	post(h, seoul)
	if calls.Load() != 1 {
		t.Fatalf("정지 중에 %d번 불렀다", calls.Load())
	}
	other, calls := fake(t, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(400) })
	post(other, seoul)
	post(other, seoul)
	if calls.Load() != 2 {
		t.Fatalf("다른 400 은 멈추지 않는다: %d", calls.Load())
	}
}

func TestTimeouts(t *testing.T) {
	release := make(chan struct{})
	h, _ := fake(t, func(http.ResponseWriter, *http.Request) { <-release })
	defer close(release)
	h.pageTimeout, h.totalTimeout = 50*time.Millisecond, 100*time.Millisecond
	start := time.Now()
	if rec := post(h, seoul); rec.Code != 503 {
		t.Fatalf("상태 %d", rec.Code)
	}
	if d := time.Since(start); d > time.Second {
		t.Fatalf("상한을 넘겼다: %s", d)
	}

	var n atomic.Int32
	slow, _ := fake(t, func(w http.ResponseWriter, _ *http.Request) {
		if n.Add(1) == 1 {
			fmt.Fprint(w, kakaoJSON(false, doc{ID: "1", PlaceName: "곳", Category: fitness, X: "127", Y: "37"}))
			return
		}
		<-release
	})
	slow.pageTimeout, slow.totalTimeout = 50*time.Millisecond, time.Second
	var got Response
	rec := post(slow, seoul)
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if rec.Code != 200 || !got.Truncated || len(got.Gyms) != 1 {
		t.Fatalf("뒤쪽이 멈추면 받은 만큼: %d %+v", rec.Code, got)
	}
}

func TestConcurrencySlotsAreReturned(t *testing.T) {
	h, calls := fake(t, func(w http.ResponseWriter, _ *http.Request) { fmt.Fprint(w, kakaoJSON(true)) })
	for range maxConcurrent {
		h.slots <- struct{}{}
	}
	if rec := post(h, seoul); rec.Code != 503 || calls.Load() != 0 {
		t.Fatalf("꽉 차면 503: %d 호출 %d", rec.Code, calls.Load())
	}
	<-h.slots
	for range 3 {
		if rec := post(h, seoul); rec.Code != 200 {
			t.Fatalf("슬롯이 돌아와야 한다: %d", rec.Code)
		}
	}
}

func TestBudgetRollsOverAtKSTMidnight(t *testing.T) {
	h, calls := fake(t, func(w http.ResponseWriter, _ *http.Request) { fmt.Fprint(w, kakaoJSON(true)) })
	now := time.Date(2026, 11, 5, 14, 59, 0, 0, time.UTC) // KST 23:59
	h.now = func() time.Time { return now }
	h.day, h.dayCalls = now.In(kst).Format("2006-01-02"), dailyCallBudget
	if rec := post(h, seoul); rec.Code != 503 {
		t.Fatalf("상태 %d", rec.Code)
	}
	now = now.Add(2 * time.Minute) // KST 00:01
	if rec := post(h, seoul); rec.Code != 200 || calls.Load() != 1 {
		t.Fatalf("상태 %d 호출 %d", rec.Code, calls.Load())
	}
}

func TestRedirectIsNotFollowed(t *testing.T) {
	var hit atomic.Int32
	other := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { hit.Add(1) }))
	defer other.Close()
	h, _ := fake(t, func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, other.URL, http.StatusFound) })
	if rec := post(h, seoul); rec.Code != 503 || hit.Load() != 0 {
		t.Fatalf("상태 %d, 다른 곳 호출 %d", rec.Code, hit.Load())
	}
}

func TestLogsHoldNoKeyOrCoordinates(t *testing.T) {
	var buf bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, nil)))
	defer slog.SetDefault(old)

	h := NewHandler("secret-key", nil)
	h.baseURL = "http://127.0.0.1:1" // 연결 실패 — *url.Error 가 주소를 품는다
	if rec := post(h, seoul); rec.Code != 503 {
		t.Fatalf("상태 %d", rec.Code)
	}
	out := buf.String()
	if !strings.Contains(out, "kind=upstream") {
		t.Fatalf("로그 %q", out)
	}
	for _, leak := range []string{"secret-key", "37.56", "126.97"} {
		if strings.Contains(out, leak) {
			t.Fatalf("로그에 %s: %q", leak, out)
		}
	}
}
