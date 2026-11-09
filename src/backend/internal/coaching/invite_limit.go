// 초대 코드 요청 제한(SPEC-050) — 코드 맞히기를 막는다
//
// 8자 base32(40비트)라 무작정 맞히기는 어렵지만, 로그인한 한 사람·한 IP 가 계속 두드리는 길은 닫는다:
//
//	· 분당 10번(사용자 · IP 각각) — 초대 코드 RPC(CreateInvite·GetInvite·AcceptInvite) 전부
//	· 하루 실패 50번(사용자 · IP 각각) — 없는 코드(NotFound)·내 코드(Validation)를 50번 넘게 틀리면 그날은 막는다
//
// 넘으면 ResourceExhausted 「잠시 뒤 다시 해 주세요」. 인스턴스 하나짜리 운영이라 메모리면 충분하다(auth 제한과 같은 판단).
// 전송 계층(헤더·IP)을 아는 제한이라 handler 쪽에 둔다 — service 는 모른다.
package coaching

import (
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/auth"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// InviteLimits — 0 이하면 그 제한을 끈다(개발·e2e 는 AUTH_RATE_LIMIT<=0 일 때 main.go 가 끈다).
type InviteLimits struct {
	PerMinute   int
	FailsPerDay int
}

// DefaultInviteLimits — 분당 10 · 하루 실패 50(SPEC-050).
var DefaultInviteLimits = InviteLimits{PerMinute: 10, FailsPerDay: 50}

type inviteGuard struct {
	perMinute *auth.AuthLimiter
	fails     *failCounter
	// IP 실패 상한은 넉넉히(사용자 상한 × 4) — 헬스장 와이파이처럼 한 IP 를 여럿이 쓸 때 한 사람이 남의 하루를 막지 않게(P1a 리뷰)
	ipFails *failCounter
}

func newInviteGuard(l InviteLimits) *inviteGuard {
	return &inviteGuard{
		perMinute: auth.NewAuthLimiter(l.PerMinute, time.Minute),
		fails:     newFailCounter(l.FailsPerDay, 24*time.Hour),
		ipFails:   newFailCounter(l.FailsPerDay*4, 24*time.Hour),
	}
}

func (g *inviteGuard) counterFor(key string) *failCounter {
	if strings.HasPrefix(key, "ip|") {
		return g.ipFails
	}
	return g.fails
}

func guardKeys(userID string, hd http.Header) []string {
	var keys []string
	if userID != "" {
		keys = append(keys, "user|"+userID)
	}
	if ip := inviteClientIP(hd); ip != "" {
		keys = append(keys, "ip|"+ip)
	}
	return keys
}

// allow — 하루 실패 상한을 먼저 보고(세지 않는다), 분당 횟수를 센다.
func (g *inviteGuard) allow(userID string, hd http.Header) error {
	if g == nil {
		return nil
	}
	keys := guardKeys(userID, hd)
	for _, k := range keys {
		if g.counterFor(k).over(k) {
			return errs.New(errs.ResourceExhausted, msgTryLater)
		}
	}
	for _, k := range keys {
		if !g.perMinute.Allow("coaching-invite|" + k) {
			return errs.New(errs.ResourceExhausted, msgTryLater)
		}
	}
	return nil
}

// recordFailure — 코드를 틀린 실패(NotFound·Validation)만 센다. 그 밖(코치 있음·서버 오류)은 세지 않는다.
func (g *inviteGuard) recordFailure(userID string, hd http.Header, err error) {
	if g == nil {
		return
	}
	var de *errs.DomainError
	if !errors.As(err, &de) || (de.Code != errs.NotFound && de.Code != errs.Validation) {
		return
	}
	for _, k := range guardKeys(userID, hd) {
		g.counterFor(k).add(k)
	}
}

func inviteClientIP(hd http.Header) string {
	if hd == nil {
		return ""
	}
	if v := hd.Get("X-Forwarded-For"); v != "" {
		return strings.TrimSpace(strings.Split(v, ",")[0])
	}
	return ""
}

// failCounter — 창 안의 실패 횟수. limit <= 0 이면 끈다.
type failCounter struct {
	mu     sync.Mutex
	limit  int
	window time.Duration
	hits   map[string][]time.Time
	now    func() time.Time
}

func newFailCounter(limit int, window time.Duration) *failCounter {
	return &failCounter{limit: limit, window: window, hits: map[string][]time.Time{}, now: time.Now}
}

func (f *failCounter) prune(key string, now time.Time) []time.Time {
	kept := f.hits[key][:0]
	for _, t := range f.hits[key] {
		if now.Sub(t) < f.window {
			kept = append(kept, t)
		}
	}
	// [원본] f.hits[key] = kept — 처음 보는 키도 빈 항목으로 남아 표가 자랐다(P1a 리뷰)
	if len(kept) == 0 {
		delete(f.hits, key)
		return nil
	}
	f.hits[key] = kept
	return kept
}

func (f *failCounter) over(key string) bool {
	if f == nil || f.limit <= 0 {
		return false
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.prune(key, f.now())) >= f.limit
}

func (f *failCounter) add(key string) {
	if f == nil || f.limit <= 0 {
		return
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	now := f.now()
	f.hits[key] = append(f.prune(key, now), now)
	// [원본] 5만 키를 넘으면 통째로 비웠다 — 막혀 있던 키도 함께 풀렸다(P1a 리뷰)
	// [개선] 창이 지난 키만 걷는다. 그래도 넘치면 새 키는 세지 않는다(이미 막힌 키는 그대로)
	if len(f.hits) > 50_000 {
		for k := range f.hits {
			f.prune(k, now)
		}
		if len(f.hits) > 50_000 && len(f.hits[key]) == 1 {
			delete(f.hits, key)
		}
	}
}
