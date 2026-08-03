// @plm SRS-005  인스턴스 간 변경 propagation — 추상화 계층
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일의 책임: **"무언가 바뀌었다"는 사실을 프로세스 경계 너머로 옮기는 것.**
//
// 계약은 네 개뿐이다:
//
//	Publish(ctx, name)      바뀐 대상의 **식별자만** 보낸다
//	Subscribe(fn) → cancel  구독하고, 해제 함수를 돌려준다
//	Close()                 종료 시 연결 정리
//	Kind()                  "memory" | "redis" — 화면·로그에 표시할 이름
//
// ── 왜 값을 싣지 않고 이름만 보내나 ─────────────────────────────────────────
//
//	· 메시지 순서가 뒤바뀌어도 낡은 값이 화면에 남지 않는다(받는 쪽이 항상 최신을 다시 읽는다).
//	· 브로커에 **영속성이 필요 없다** — 메시지를 잃어도 다음 알림이나 재연결 스냅샷이 덮는다.
//	· 페이로드에 민감 데이터가 흐르지 않는다.
//	대가: 알림 1건당 읽기 1회. 카운터 규모에선 무시할 수 있고, 커지면 캐시를 앞에 두면 된다.
//
// ── 새 어댑터(NATS·Kafka·Postgres LISTEN/NOTIFY)를 추가하는 법 ──────────────
//  1. 아래 인터페이스를 만족하는 타입 하나 추가
//  2. New()의 분기에 한 줄 + config의 enum에 값 추가
//  3. 도메인·핸들러·화면은 **한 줄도 바뀌지 않는다** — 그게 이 추상화의 존재 이유다.
//
// ─────────────────────────────────────────────────────────────────────────────
package realtime

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// 브로커 채널 이름. 지금은 모든 도메인이 이 채널 하나를 쓰고 **주제 이름**으로 서로를 구분한다
// (구독자가 자기 주제가 아니면 흘려보낸다 — exercise의 CatalogTopic이 그 예다).
// 주제가 많아져 흘려보내는 비용이 눈에 띄면 "<도메인>.changed"로 채널을 나눈다.
const channel = "liftgram.changed"

type Bus interface {
	Publish(ctx context.Context, name string) error
	Subscribe(fn func(name string)) (cancel func())
	Close() error
	Kind() string
}

// New는 설정에 따라 구현을 고른다. 도메인은 어느 쪽이 왔는지 모른다.
func New(mode, redisURL string) (Bus, error) {
	if mode == "redis" {
		return newRedisBus(redisURL)
	}
	return newMemoryBus(), nil
}

// ── 메모리 ───────────────────────────────────────────────────────────────────

// 단일 프로세스용. 브로커 없이 개발할 때의 기본값이다.
// 인스턴스가 하나뿐이면 이걸로도 스트림·WebSocket이 완전히 동작한다.
type memoryBus struct {
	mu   sync.RWMutex
	subs map[int]func(string)
	next int
}

func newMemoryBus() *memoryBus {
	return &memoryBus{subs: map[int]func(string){}}
}

func (b *memoryBus) Publish(_ context.Context, name string) error {
	b.mu.RLock()
	fns := make([]func(string), 0, len(b.subs))
	for _, fn := range b.subs {
		fns = append(fns, fn)
	}
	b.mu.RUnlock()
	// 락 밖에서 호출한다 — 구독자가 다시 Subscribe/Unsubscribe를 불러도 교착되지 않는다.
	for _, fn := range fns {
		fn(name)
	}
	return nil
}

func (b *memoryBus) Subscribe(fn func(string)) func() {
	b.mu.Lock()
	id := b.next
	b.next++
	b.subs[id] = fn
	b.mu.Unlock()
	// 해제를 잊으면 연결이 끊긴 뒤에도 구독자가 남는다 — 반드시 defer로 부른다.
	return func() {
		b.mu.Lock()
		delete(b.subs, id)
		b.mu.Unlock()
	}
}

func (b *memoryBus) Close() error { return nil }
func (b *memoryBus) Kind() string { return "memory" }

// ── Redis ────────────────────────────────────────────────────────────────────

// 인스턴스가 둘 이상일 때. pub/sub으로 다른 프로세스의 구독자에게도 알림이 간다.
type redisBus struct {
	client *redis.Client
	pubsub *redis.PubSub
	mu     sync.RWMutex
	subs   map[int]func(string)
	next   int
	done   chan struct{}
}

func newRedisBus(url string) (*redisBus, error) {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	c := redis.NewClient(opt)
	ps := c.Subscribe(context.Background(), channel)

	// **구독이 실제로 성립할 때까지 기다린다.**
	// go-redis의 Subscribe는 지연 실행이다 — 객체만 만들고 SUBSCRIBE 명령은 나중에 나간다.
	// 확인 없이 돌아가면 부팅 직후의 알림이 조용히 유실된다: 서버는 healthz 200을 답하는데
	// 그 시점에 발행된 변경은 아무 구독자에게도 닿지 않는다.
	// (실측 — 컨테이너를 새로 띄운 직후 e2e의 스트림 테스트가 간헐적으로 실패했다.
	//  스냅샷은 오는데 delta가 오지 않아 값이 0에 멈춰 있었다.)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := ps.Receive(ctx); err != nil {
		_ = ps.Close()
		_ = c.Close()
		return nil, fmt.Errorf("redis 구독 성립 실패(%s): %w", url, err)
	}

	b := &redisBus{
		client: c,
		pubsub: ps,
		subs:   map[int]func(string){},
		done:   make(chan struct{}),
	}
	// 원격 메시지를 로컬 구독자에게 흘려보내는 한 갈래. 프로세스당 하나면 충분하다.
	go b.fanIn()
	return b, nil
}

func (b *redisBus) fanIn() {
	ch := b.pubsub.Channel()
	for {
		select {
		case <-b.done:
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			b.mu.RLock()
			fns := make([]func(string), 0, len(b.subs))
			for _, fn := range b.subs {
				fns = append(fns, fn)
			}
			b.mu.RUnlock()
			for _, fn := range fns {
				fn(msg.Payload)
			}
		}
	}
}

func (b *redisBus) Publish(ctx context.Context, name string) error {
	// 페이로드는 대상 식별자만 — 값은 각 인스턴스가 조회한다(위 주석 참고).
	return b.client.Publish(ctx, channel, name).Err()
}

func (b *redisBus) Subscribe(fn func(string)) func() {
	b.mu.Lock()
	id := b.next
	b.next++
	b.subs[id] = fn
	b.mu.Unlock()
	return func() {
		b.mu.Lock()
		delete(b.subs, id)
		b.mu.Unlock()
	}
}

func (b *redisBus) Close() error {
	close(b.done)
	if err := b.pubsub.Close(); err != nil {
		slog.Warn("bus pubsub close", "err", err)
	}
	return b.client.Close()
}

func (b *redisBus) Kind() string { return "redis" }
