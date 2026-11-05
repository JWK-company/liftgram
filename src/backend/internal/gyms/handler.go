// Package gyms — 주변 헬스장 검색(SPEC-029). 카카오 로컬 키를 브라우저에 두지 않으려고 서버를 거친다.
//
// 좌표는 민감한 값이라 POST 본문으로만 받고 저장·캐시·로그를 하지 않는다. 카카오 호출 오류는
// *url.Error 가 좌표가 든 주소를 품으므로 오류 값을 로그에 넘기지 않고 종류만 남긴다.
//
// 이 서버가 200 이 아닌 값을 주면 앱은 언제나 Overpass 로 넘어간다 — 그래서 상태 코드를 세세히
// 나누지 않고, 「틀린 빈 목록」만 내보내지 않게 조심한다(필터 뒤 0건은 503).
package gyms

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"math"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultBaseURL = "https://dapi.kakao.com/v2/local/search/keyword.json"
	searchQuery    = "헬스장"
	pageSize       = 15
	maxPages       = 3

	defaultPageTimeout  = 3 * time.Second
	defaultTotalTimeout = 6 * time.Second // 앱은 8초 기다린다

	// Path — 앱이 부르는 경로.
	Path = "/api/gyms/nearby"

	maxConcurrent = 16
	maxBodyBytes  = 256
	maxKakaoBytes = 1 << 20

	// 카카오 한도의 정확한 값은 콘솔에서 확인해야 한다. 넘기 전에 Overpass 로 넘기는 안전선이다.
	dailyCallBudget = 20_000
	// 키 문제·한도 초과는 금방 풀리지 않으니 잠시 부르지 않는다.
	rejectedPause = 10 * time.Minute
)

// Gym — 응답 항목. 카카오 응답에서 필요한 칸만 옮긴다.
type Gym struct {
	ID      string  `json:"id"`
	Name    string  `json:"name"`
	Lat     float64 `json:"lat"`
	Lon     float64 `json:"lon"`
	Address string  `json:"address,omitempty"`
}

// Response — 200 본문. Truncated 는 거리순 앞쪽만 담겼다는 뜻이다.
type Response struct {
	Gyms      []Gym `json:"gyms"`
	Truncated bool  `json:"truncated"`
}

// Handler — POST /api/gyms/nearby.
type Handler struct {
	key     string
	since   time.Time
	baseURL string
	client  *http.Client
	allow   func(string) bool
	slots   chan struct{}

	pageTimeout  time.Duration
	totalTimeout time.Duration

	mu          sync.Mutex
	day         string
	dayCalls    int
	pausedUntil time.Time
	now         func() time.Time
}

// kst — 하루 예산의 날짜 경계. 컨테이너 시간대와 상관없이 한국 자정에 넘어간다.
var kst = time.FixedZone("KST", 9*60*60)

// WithSince — 이 시각 전에는 카카오를 부르지 않는다.
func (h *Handler) WithSince(t time.Time) *Handler {
	h.since = t
	return h
}

// NewHandler — key 가 비면 언제나 503 이고 카카오를 부르지 않는다. allow 는 클라이언트 IP 제한(nil 이면 끔).
func NewHandler(key string, allow func(string) bool) *Handler {
	return &Handler{
		key:     strings.TrimSpace(key),
		baseURL: defaultBaseURL,
		// 시간 상한은 요청 문맥으로 건다. 넘겨주기를 따라가면 좌표가 다른 곳으로 가므로 막는다.
		client: &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		}},
		allow: allow,
		slots: make(chan struct{}, maxConcurrent),
		now:   time.Now,

		pageTimeout:  defaultPageTimeout,
		totalTimeout: defaultTotalTimeout,
	}
}

type nearbyRequest struct {
	Lat    *float64 `json:"lat"`
	Lon    *float64 `json:"lon"`
	Radius int      `json:"radius"`
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in nearbyRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(&in); err != nil ||
		in.Lat == nil || in.Lon == nil || !validRadius(in.Radius) || !finite(*in.Lat) || !finite(*in.Lon) {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if !inKorea(*in.Lat, *in.Lon) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		return
	}
	if h.allow != nil && !h.allow(clientIP(r)) {
		w.WriteHeader(http.StatusTooManyRequests)
		return
	}
	// 방침 시행 전에는 키가 있어도 좌표를 보내지 않는다(SPEC-031). 화면은 503 이면 대체 검색으로 간다.
	if h.key == "" || h.now().Before(h.since) || h.paused() {
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	select {
	case h.slots <- struct{}{}:
		defer func() { <-h.slots }()
	default:
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), h.totalTimeout)
	defer cancel()
	out, err := h.search(ctx, *in.Lat, *in.Lon, in.Radius)
	if err != nil {
		if !errors.Is(err, context.Canceled) {
			slog.Warn("카카오 헬스장 검색 실패", "kind", err.Error())
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

func validRadius(r int) bool { return r == 2000 || r == 5000 || r == 10000 }

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

// inKorea — 한국을 덮는 상자에서 규슈·혼슈 서쪽을 뺀다. 그곳을 카카오로 물으면 「없다」는
// 빈 목록이 와서 Overpass 로 넘어가지 못한다.
func inKorea(lat, lon float64) bool {
	if lat < 33 || lat > 39 || lon < 124 || lon > 132 {
		return false
	}
	return !(lat < 35 && lon > 129)
}

// clientIP — 웹 가장자리(frontend/server.mjs)가 정해 준 값만 온다. 없으면 소켓 주소.
func clientIP(r *http.Request) string {
	if v := r.Header.Get("X-Forwarded-For"); v != "" {
		return strings.TrimSpace(strings.Split(v, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// LimitKeys — 제한을 셀 열쇠. IPv6 는 한 가입자가 /64 를, 무료 터널로 /48 까지 받을 수 있어
// 가입자(/64)와 넓은 대역(/48)을 함께 돌려준다. IPv4 는 둘이 같다.
func LimitKeys(ip string) (host, wide string) {
	parsed := net.ParseIP(ip)
	if parsed == nil || parsed.To4() != nil {
		return ip, ip
	}
	return parsed.Mask(net.CIDRMask(64, 128)).String(), parsed.Mask(net.CIDRMask(48, 128)).String()
}

func (h *Handler) paused() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.now().Before(h.pausedUntil)
}

func (h *Handler) pause(status int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.pausedUntil = h.now().Add(rejectedPause)
	slog.Warn("카카오 헬스장 검색 정지", "status", status, "until", h.pausedUntil.Format(time.RFC3339))
}

// takeCall — 서버 전체의 하루 호출 예산에서 한 번을 뗀다.
func (h *Handler) takeCall() bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	today := h.now().In(kst).Format("2006-01-02")
	if h.day != today {
		h.day, h.dayCalls = today, 0
	}
	if h.dayCalls >= dailyCallBudget {
		return false
	}
	h.dayCalls++
	return true
}

type kakaoResponse struct {
	Meta *struct {
		IsEnd         *bool `json:"is_end"`
		TotalCount    int   `json:"total_count"`
		PageableCount int   `json:"pageable_count"`
	} `json:"meta"`
	Documents []struct {
		ID           string `json:"id"`
		PlaceName    string `json:"place_name"`
		CategoryName string `json:"category_name"`
		RoadAddress  string `json:"road_address_name"`
		Address      string `json:"address_name"`
		X            string `json:"x"` // 경도
		Y            string `json:"y"` // 위도
	} `json:"documents"`
}

var (
	placeID        = regexp.MustCompile(`^[0-9]{1,20}$`)
	errBudget      = errors.New("budget")
	errRejected    = errors.New("rejected")
	errUpstream    = errors.New("upstream")
	errFormat      = errors.New("format")
	errAllFiltered = errors.New("all-filtered")
)

// search — 거리순으로 최대 3쪽. 첫 쪽이 실패하면 오류, 뒤쪽이 실패하면 받은 만큼 돌려준다.
func (h *Handler) search(ctx context.Context, lat, lon float64, radius int) (*Response, error) {
	out := &Response{Gyms: []Gym{}}
	seen := map[string]bool{}
	raw := 0
	for page := 1; page <= maxPages; page++ {
		res, err := h.fetchPage(ctx, lat, lon, radius, page)
		if err != nil {
			if page == 1 {
				return nil, err
			}
			out.Truncated = true
			break
		}
		raw += len(res.Documents)
		for _, d := range res.Documents {
			gym, ok := toGym(d.ID, d.PlaceName, d.CategoryName, d.RoadAddress, d.Address, d.X, d.Y)
			if !ok || seen[gym.ID] {
				continue
			}
			seen[gym.ID] = true
			out.Gyms = append(out.Gyms, gym)
		}
		// 카카오는 45곳까지만 넘겨 주고 그 끝에서 is_end=true 를 줄 수 있어 개수로도 본다.
		if res.Meta.TotalCount > res.Meta.PageableCount {
			out.Truncated = true
		}
		if *res.Meta.IsEnd {
			break
		}
		if page == maxPages {
			out.Truncated = true
		}
	}
	if raw > 0 && len(out.Gyms) == 0 {
		return nil, errAllFiltered // 응답 모양이 바뀌었을 수 있다 — 「주변에 없음」으로 말하지 않는다
	}
	return out, nil
}

func (h *Handler) fetchPage(ctx context.Context, lat, lon float64, radius, page int) (*kakaoResponse, error) {
	if !h.takeCall() {
		return nil, errBudget
	}
	q := url.Values{
		"query":  {searchQuery},
		"x":      {strconv.FormatFloat(lon, 'f', 6, 64)},
		"y":      {strconv.FormatFloat(lat, 'f', 6, 64)},
		"radius": {strconv.Itoa(radius)},
		"sort":   {"distance"},
		"size":   {strconv.Itoa(pageSize)},
		"page":   {strconv.Itoa(page)},
	}
	pageCtx, cancel := context.WithTimeout(ctx, h.pageTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(pageCtx, http.MethodGet, h.baseURL+"?"+q.Encode(), nil)
	if err != nil {
		return nil, errUpstream
	}
	req.Header.Set("Authorization", "KakaoAK "+h.key)
	res, err := h.client.Do(req)
	if err != nil {
		if errors.Is(ctx.Err(), context.Canceled) {
			return nil, context.Canceled
		}
		return nil, errUpstream // err 는 좌표가 든 주소를 품는다 — 버린다
	}
	defer res.Body.Close()
	switch {
	case res.StatusCode == http.StatusUnauthorized, res.StatusCode == http.StatusForbidden, res.StatusCode == http.StatusTooManyRequests:
		h.pause(res.StatusCode)
		return nil, errRejected
	case res.StatusCode == http.StatusBadRequest:
		// 카카오 문서의 쿼터 초과 예시(code -10)는 400 으로 오기도 한다. 실측 전이라 함께 멈춘다.
		var body struct {
			Code int `json:"code"`
		}
		if json.NewDecoder(io.LimitReader(res.Body, maxKakaoBytes)).Decode(&body) == nil && body.Code == -10 {
			h.pause(res.StatusCode)
			return nil, errRejected
		}
		return nil, errUpstream
	case res.StatusCode != http.StatusOK:
		return nil, errUpstream
	}
	var body kakaoResponse
	if err := json.NewDecoder(io.LimitReader(res.Body, maxKakaoBytes)).Decode(&body); err != nil ||
		body.Meta == nil || body.Meta.IsEnd == nil || body.Documents == nil {
		return nil, errFormat
	}
	return &body, nil
}

// toGym — 카테고리가 맞고 좌표·id 가 온전한 장소만 통과시킨다.
func toGym(id, name, category, road, addr, x, y string) (Gym, bool) {
	if !isGymCategory(category) || !placeID.MatchString(id) || strings.TrimSpace(name) == "" {
		return Gym{}, false
	}
	lon, errX := strconv.ParseFloat(x, 64)
	lat, errY := strconv.ParseFloat(y, 64)
	if errX != nil || errY != nil || !finite(lat) || !finite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180 {
		return Gym{}, false
	}
	address := road
	if address == "" {
		address = addr
	}
	return Gym{ID: id, Name: name, Lat: lat, Lon: lon, Address: address}, true
}

func isGymCategory(c string) bool {
	return strings.Contains(c, "헬스") || strings.Contains(c, "피트니스") || strings.Contains(c, "스포츠")
}
