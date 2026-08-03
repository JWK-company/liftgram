// @plm SRS-012  rate limit — 헤더만이 아니라 실제로 막는다 (ADR-009)
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일의 책임: **"이 키가 이번 창에서 몇 번 왔는가"를 세고 한도를 넘기면 거절하는 것.**
//
// 왜 공유 저장소인가:
//
//	인스턴스별로 세면 스케일 아웃이 제한을 무력화한다 — 인스턴스가 3개면 한도가 3배가 된다.
//	그래서 propagation 버스·idempotency 저장소와 **같은 방식**으로 memory|redis를 갈아 끼운다.
//
// 왜 고정 윈도우인가(ADR-009):
//
//	구현이 단순하고 Redis 원자 연산 두 줄(INCR + EXPIRE)이면 된다.
//	대가는 창 경계에서 최대 2배가 통과할 수 있다는 것 — 템플릿 기본값 수준에서는 감수한다.
//
// 무엇을 키로 세는가:
//
//	**프록시 뒤라는 점이 중요하다**(ADR-010): 브라우저는 web에 붙고 web이 api로 넘기므로,
//	api가 보는 소켓 주소는 항상 web이다. 그래서 web이 붙여 준 x-forwarded-for의
//	**첫 번째** 값을 쓴다(그 뒤는 위조 가능). 이 헤더가 없으면 전원이 한 키로 묶인다.
//
// ─────────────────────────────────────────────────────────────────────────────
package middleware

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"connectrpc.com/connect"
	"github.com/redis/go-redis/v9"
)

type Limiter struct {
	limit     int
	window    time.Duration
	counter   counter
	redisMode bool
}

type counter interface {
	hit(ctx context.Context, key string, window time.Duration) (int64, error)
}

func NewLimiter(mode string, redisURL string, limit, windowSec int) (*Limiter, error) {
	l := &Limiter{limit: limit, window: time.Duration(windowSec) * time.Second}
	if mode == "redis" {
		opt, err := redis.ParseURL(redisURL)
		if err != nil {
			return nil, err
		}
		l.counter = &redisCounter{client: redis.NewClient(opt)}
		l.redisMode = true
	} else {
		l.counter = newMemoryCounter()
	}
	return l, nil
}

// Interceptor는 RPC마다 센다. 읽기와 쓰기를 다른 버킷으로 나눈다 —
// 목록 조회가 잦다고 해서 쓰기까지 막히면 곤란하다.
func (l *Limiter) Interceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			if l.limit <= 0 { // 0 이하 = 비활성(개발 편의)
				return next(ctx, req)
			}
			bucket := "read"
			if strings.Contains(req.Spec().Procedure, "Apply") {
				bucket = "write"
			}
			key := bucket + ":" + clientIP(req.Header())
			n, err := l.counter.hit(ctx, key, l.window)
			if err != nil {
				// 저장소가 흔들릴 때 제한이 서비스를 막는 것이 더 큰 손해다 — 통과시킨다.
				return next(ctx, req)
			}
			remaining := int64(l.limit) - n
			if remaining < 0 {
				remaining = 0
			}
			if n > int64(l.limit) {
				e := connect.NewError(connect.CodeResourceExhausted,
					errors.New("요청이 너무 잦습니다 — "+strconv.Itoa(int(l.window.Seconds()))+"초 뒤에 다시 시도하세요"))
				e.Meta().Set("Retry-After", strconv.Itoa(int(l.window.Seconds())))
				l.setHeaders(e.Meta(), remaining)
				return nil, e
			}
			res, err := next(ctx, req)
			if res != nil {
				// 통과할 때도 붙인다 — 클라이언트가 남은 횟수를 보고 스스로 조절할 수 있게.
				l.setHeaders(res.Header(), remaining)
			}
			return res, err
		}
	}
}

func (l *Limiter) setHeaders(h http.Header, remaining int64) {
	h.Set("RateLimit-Limit", strconv.Itoa(l.limit))
	h.Set("RateLimit-Remaining", strconv.FormatInt(remaining, 10))
	h.Set("RateLimit-Reset", strconv.Itoa(int(l.window.Seconds())))
	h.Set("RateLimit-Policy", strconv.Itoa(l.limit)+";w="+strconv.Itoa(int(l.window.Seconds())))
}

func clientIP(h http.Header) string {
	if fwd := h.Get("X-Forwarded-For"); fwd != "" {
		return strings.TrimSpace(strings.Split(fwd, ",")[0])
	}
	if ip := h.Get("X-Real-Ip"); ip != "" {
		return ip
	}
	return "unknown"
}

// ── 세는 구현 ────────────────────────────────────────────────────────────────

type memoryCounter struct {
	mu      sync.Mutex
	buckets map[string]*bucketState
}

type bucketState struct {
	n       int64
	expires time.Time
}

func newMemoryCounter() *memoryCounter {
	return &memoryCounter{buckets: map[string]*bucketState{}}
}

func (c *memoryCounter) hit(_ context.Context, key string, window time.Duration) (int64, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	b, ok := c.buckets[key]
	if !ok || now.After(b.expires) {
		if len(c.buckets) > 10000 { // 가끔 청소한다 — 요청마다 전체 순회는 하지 않는다
			for k, v := range c.buckets {
				if now.After(v.expires) {
					delete(c.buckets, k)
				}
			}
		}
		c.buckets[key] = &bucketState{n: 1, expires: now.Add(window)}
		return 1, nil
	}
	b.n++
	return b.n, nil
}

type redisCounter struct{ client *redis.Client }

// INCR로 세고 첫 요청에만 만료를 건다(원자적).
func (c *redisCounter) hit(ctx context.Context, key string, window time.Duration) (int64, error) {
	n, err := c.client.Incr(ctx, "rl:"+key).Result()
	if err != nil {
		return 0, err
	}
	if n == 1 {
		c.client.Expire(ctx, "rl:"+key, window)
	}
	return n, nil
}
