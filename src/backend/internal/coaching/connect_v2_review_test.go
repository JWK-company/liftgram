package coaching

import (
	"testing"
	"time"
)

// P1a 코드 리뷰 — 동의 시각이 빈 활성 관계는 지난 기록을 열지 않는다.
func TestVisibleFromZeroConsentIsNow(t *testing.T) {
	before := time.Now()
	got := visibleFrom(Grant{Scope: map[string]bool{}})
	if got.Before(before) {
		t.Fatalf("동의 시각이 비면 지금부터여야 한다: %v", got)
	}
	if !visibleFrom(Grant{Scope: map[string]bool{ScopePastRecords: true}}).IsZero() {
		t.Fatal("pastRecords 면 제한 없음")
	}
}

// P1a 코드 리뷰 — 빈 키를 남기지 않고, 넘쳐도 막힌 키는 풀리지 않는다.
func TestFailCounterNoEmptyKeysAndKeepsBlocked(t *testing.T) {
	f := newFailCounter(2, time.Hour)
	f.over("a")
	if len(f.hits) != 0 {
		t.Fatalf("처음 보는 키는 남기지 않는다: %d", len(f.hits))
	}
	f.add("x")
	f.add("x")
	for i := 0; i < 50_010; i++ {
		f.add("k" + time.Duration(i).String())
	}
	if !f.over("x") {
		t.Fatal("표가 넘쳐도 막힌 키는 그대로")
	}
}
