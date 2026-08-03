// @plm SRS-001  idempotency key 저장소 — 같은 요청이 두 번 와도 한 번만 반영되게 하는 기억 장치
//
// 네트워크는 재시도한다. 사용자가 버튼을 두 번 누르기도 한다.
// 그때 "이 키는 이미 처리했다"를 기억해 두면 부수효과가 두 번 일어나지 않는다.
//
// memory: 프로세스 안에서만. 인스턴스가 하나면 충분하다.
// redis : 인스턴스가 여럿이면 **반드시 이쪽**이어야 한다 — 재시도가 다른 인스턴스로 가면
//
//	메모리 저장소는 그 사실을 모르고 두 번 반영한다.
package idempotency

import (
	"context"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// 기억해 두는 기간. 재시도는 보통 초 단위 안에 온다 — 하루면 넉넉하다.
const ttl = 24 * time.Hour

type Store interface {
	Seen(ctx context.Context, key string) (string, bool, error)
	Remember(ctx context.Context, key, value string) error
}

func New(mode, redisURL string) (Store, error) {
	if mode == "redis" {
		opt, err := redis.ParseURL(redisURL)
		if err != nil {
			return nil, err
		}
		return &redisStore{client: redis.NewClient(opt)}, nil
	}
	return newMemoryStore(), nil
}

type memoryStore struct {
	mu   sync.RWMutex
	data map[string]entry
}

type entry struct {
	value   string
	expires time.Time
}

func newMemoryStore() *memoryStore { return &memoryStore{data: map[string]entry{}} }

func (s *memoryStore) Seen(_ context.Context, key string) (string, bool, error) {
	s.mu.RLock()
	e, ok := s.data[key]
	s.mu.RUnlock()
	if !ok || time.Now().After(e.expires) {
		return "", false, nil
	}
	return e.value, true, nil
}

func (s *memoryStore) Remember(_ context.Context, key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	// 가끔 청소한다 — 키가 무한히 쌓이지 않게(요청마다 전체 순회는 하지 않는다).
	if len(s.data) > 10000 {
		now := time.Now()
		for k, v := range s.data {
			if now.After(v.expires) {
				delete(s.data, k)
			}
		}
	}
	s.data[key] = entry{value: value, expires: time.Now().Add(ttl)}
	return nil
}

type redisStore struct{ client *redis.Client }

func (s *redisStore) Seen(ctx context.Context, key string) (string, bool, error) {
	v, err := s.client.Get(ctx, "idem:"+key).Result()
	if err == redis.Nil {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return v, true, nil
}

func (s *redisStore) Remember(ctx context.Context, key, value string) error {
	return s.client.Set(ctx, "idem:"+key, value, ttl).Err()
}
