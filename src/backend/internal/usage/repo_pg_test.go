// 이용 기록 저장소 — 실제 Postgres(LIFTGRAM_TEST_DATABASE_URL 이 있을 때만)
//
// 가짜로는 못 보는 것: 재전송 멱등 · 2분 안 신호가 쓰지 않는가 · 운영진이 집계에서 빠지는가 ·
// 날짜 경계 · 재집계 · 90일 정리 · 고아 행 청소 · 동시 잠금.
package usage

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

func clean(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	for _, q := range []string{`DELETE FROM usage_events`, `DELETE FROM usage_presence`, `DELETE FROM usage_active_days`, `DELETE FROM usage_daily`} {
		if _, err := pool.Exec(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
}

func metric(t *testing.T, pool *pgxpool.Pool, day, kind, m string) (int64, int64) {
	t.Helper()
	var a, e int64
	err := pool.QueryRow(context.Background(), `SELECT coalesce(max(actors),0), coalesce(max(events),0) FROM usage_daily WHERE day=$1::date AND actor_kind=$2 AND metric=$3`, day, kind, m).Scan(&a, &e)
	if err != nil {
		t.Fatal(err)
	}
	return a, e
}

func TestPgRepo_이용기록(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	clean(t, pool)
	t.Cleanup(func() { clean(t, pool) })
	r := NewRepo(pool)

	base := fmt.Sprintf("usg-%d", time.Now().UnixNano())
	u1, staff := base+"-u", base+"-s"
	for id, role := range map[string]string{u1: "user", staff: "coworker"} {
		if _, err := pool.Exec(ctx, `INSERT INTO users (id, email, display_name, role) VALUES ($1,$2,'x',$3)`, id, id+"@t.example", role); err != nil {
			t.Fatal(err)
		}
		id := id
		t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, id) })
	}
	if ok, err := r.UserExists(ctx, u1); err != nil || !ok {
		t.Fatalf("계정: %v %v", ok, err)
	}
	if ok, _ := r.UserExists(ctx, "없음"); ok {
		t.Fatal("없는 계정")
	}

	now := time.Date(2026, 11, 20, 12, 0, 0, 0, KST)
	today := "2026-11-20"
	guest := uuid.NewString()
	cid := uuid.NewString()

	// 재전송 멱등.
	row := []EventRow{{At: now, ClientEventID: cid, Event: "workout_finish"}}
	if n, err := r.InsertEvents(ctx, "guest", guest, "web", "1.0.0", row); err != nil || n != 1 {
		t.Fatalf("첫 저장 %d %v", n, err)
	}
	if n, err := r.InsertEvents(ctx, "guest", guest, "web", "1.0.0", row); err != nil || n != 0 {
		t.Fatalf("재전송 %d %v", n, err)
	}
	if n, _ := r.CountActorEvents(ctx, "guest", guest, now.Add(-time.Hour)); n != 1 {
		t.Fatalf("주체 건수 %d", n)
	}
	if n, _ := r.CountEventsSince(ctx, now.Add(-time.Hour)); n != 1 {
		t.Fatalf("전체 건수 %d", n)
	}
	// 같은 ID 라도 다른 주체면 다른 행이다.
	if n, _ := r.InsertEvents(ctx, "user", u1, "ios", "", row); n != 1 {
		t.Fatalf("다른 주체 %d", n)
	}
	// 운영진 행은 들어가도 집계에서 빠진다.
	if n, _ := r.InsertEvents(ctx, "user", staff, "web", "", row); n != 1 {
		t.Fatalf("운영진 %d", n)
	}

	// 접속 신호 — 2분 안은 쓰지 않는다.
	seen := func(kind, id string) (first, last time.Time) {
		if err := pool.QueryRow(ctx, `SELECT first_seen, last_seen FROM usage_presence WHERE actor_kind=$1 AND actor_id=$2`, kind, id).Scan(&first, &last); err != nil {
			t.Fatal(err)
		}
		return
	}
	days := func(kind, id string) int {
		var n int
		if err := pool.QueryRow(ctx, `SELECT count(*) FROM usage_active_days WHERE actor_kind=$1 AND actor_id=$2`, kind, id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	for _, id := range []struct{ k, i string }{{"guest", guest}, {"user", u1}, {"user", staff}} {
		if err := r.TouchPresence(ctx, id.k, id.i, now, today); err != nil {
			t.Fatal(err)
		}
	}
	if err := r.TouchPresence(ctx, "guest", guest, now.Add(time.Minute), today); err != nil {
		t.Fatal(err)
	}
	if _, last := seen("guest", guest); !last.Equal(now) {
		t.Fatalf("2분 안에 썼다: %v", last)
	}
	if err := r.TouchPresence(ctx, "guest", guest, now.Add(2*time.Minute), "2026-11-20"); err != nil {
		t.Fatal(err)
	}
	first, last := seen("guest", guest)
	if !first.Equal(now) || !last.Equal(now.Add(2*time.Minute)) {
		t.Fatalf("첫 시각은 그대로, 끝 시각만: %v %v", first, last)
	}
	if days("guest", guest) != 1 {
		t.Fatalf("활성일 %d", days("guest", guest))
	}
	if ok, _ := r.PresenceExists(ctx, "guest", guest); !ok {
		t.Fatal("접속 기록이 있어야 한다")
	}

	// 집계.
	if ran, err := r.Aggregate(ctx, now); err != nil || !ran {
		t.Fatalf("집계 %v %v", ran, err)
	}
	if a, e := metric(t, pool, today, "user", "event:workout_finish"); a != 1 || e != 1 {
		t.Fatalf("운영진은 빠져야 한다: %d %d", a, e)
	}
	if a, e := metric(t, pool, today, "guest", "event:workout_finish"); a != 1 || e != 1 {
		t.Fatalf("비로그인: %d %d", a, e)
	}
	if _, e := metric(t, pool, today, "user", "platform:ios"); e != 1 {
		t.Fatalf("플랫폼: %d", e)
	}
	if a, _ := metric(t, pool, today, "user", "dau"); a != 1 {
		t.Fatalf("dau: %d", a)
	}
	// 재집계는 같은 값을 낸다(멱등)·제외를 켜면 최근 7일 안에서는 빠진다.
	if _, err := r.Aggregate(ctx, now); err != nil {
		t.Fatal(err)
	}
	if a, _ := metric(t, pool, today, "user", "dau"); a != 1 {
		t.Fatalf("재집계 dau: %d", a)
	}
	if _, err := pool.Exec(ctx, `UPDATE users SET stats_excluded=true WHERE id=$1`, u1); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Aggregate(ctx, now); err != nil {
		t.Fatal(err)
	}
	if a, _ := metric(t, pool, today, "user", "dau"); a != 0 {
		t.Fatalf("제외 뒤 dau: %d", a)
	}
	if _, err := pool.Exec(ctx, `UPDATE users SET stats_excluded=false WHERE id=$1`, u1); err != nil {
		t.Fatal(err)
	}

	// 한국 날짜 경계: 전날 15:00 UTC(= 오늘 0시 KST) 는 오늘, 14:59 UTC 는 어제다.
	edge := uuid.NewString()
	bound := time.Date(2026, 11, 20, 0, 0, 0, 0, KST)
	if _, err := r.InsertEvents(ctx, "guest", edge, "web", "", []EventRow{
		{At: bound, ClientEventID: uuid.NewString(), Event: "rest_timer"},
		{At: bound.Add(-time.Hour), ClientEventID: uuid.NewString(), Event: "gym_search"},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Aggregate(ctx, now); err != nil {
		t.Fatal(err)
	}
	if _, e := metric(t, pool, "2026-11-20", "guest", "event:rest_timer"); e != 1 {
		t.Fatalf("오늘 0시: %d", e)
	}
	if _, e := metric(t, pool, "2026-11-19", "guest", "event:gym_search"); e != 1 {
		t.Fatalf("어제 23시: %d", e)
	}

	// 다른 트랜잭션이 잠금을 쥐면 조용히 건너뛴다.
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, jobLockKey); err != nil {
		t.Fatal(err)
	}
	if ran, err := r.Aggregate(ctx, now); err != nil || ran {
		t.Fatalf("잠금 중: %v %v", ran, err)
	}
	_ = tx.Rollback(ctx)

	// 90일 정리: 오래된 원본은 지우고, 합계는 남긴다.
	old := uuid.NewString()
	ancient := now.AddDate(0, 0, -100)
	if _, err := r.InsertEvents(ctx, "guest", old, "web", "", []EventRow{{At: ancient, ClientEventID: uuid.NewString(), Event: "app_open"}}); err != nil {
		t.Fatal(err)
	}
	if err := r.TouchPresence(ctx, "guest", old, ancient, DayOf(ancient)); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO usage_daily (day, actor_kind, metric, actors, events) VALUES ($1::date,'guest','dau',1,0)`, DayOf(ancient)); err != nil {
		t.Fatal(err)
	}
	// 고아 행: 탈퇴 순간 들어온 보고.
	if _, err := r.InsertEvents(ctx, "user", "탈퇴함", "web", "", []EventRow{{At: now, ClientEventID: uuid.NewString(), Event: "app_open"}}); err != nil {
		t.Fatal(err)
	}
	if err := r.TouchPresence(ctx, "user", "탈퇴함", now, today); err != nil {
		t.Fatal(err)
	}
	cutoff := now.AddDate(0, 0, -RetainDays)
	if err := r.Purge(ctx, cutoff, DayOf(cutoff)); err != nil {
		t.Fatal(err)
	}
	var evOld, prOld, dayOld, orphan, keptDaily, keptRecent int
	q := func(sql string, dst *int, args ...any) {
		if err := pool.QueryRow(ctx, sql, args...).Scan(dst); err != nil {
			t.Fatal(err)
		}
	}
	q(`SELECT count(*) FROM usage_events WHERE actor_id=$1`, &evOld, old)
	q(`SELECT count(*) FROM usage_presence WHERE actor_id=$1`, &prOld, old)
	q(`SELECT count(*) FROM usage_active_days WHERE actor_id=$1`, &dayOld, old)
	q(`SELECT count(*) FROM usage_events WHERE actor_id='탈퇴함'`, &orphan)
	q(`SELECT count(*) FROM usage_daily WHERE day=$1::date`, &keptDaily, DayOf(ancient))
	q(`SELECT count(*) FROM usage_events WHERE actor_id=$1`, &keptRecent, guest)
	if evOld != 0 || prOld != 0 || dayOld != 0 || orphan != 0 {
		t.Fatalf("정리 실패: %d %d %d %d", evOld, prOld, dayOld, orphan)
	}
	if keptDaily != 1 || keptRecent != 1 {
		t.Fatalf("합계·최근 원본은 남아야 한다: %d %d", keptDaily, keptRecent)
	}
}
