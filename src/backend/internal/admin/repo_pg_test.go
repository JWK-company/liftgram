// 운영자 통계 저장소 — 실제 Postgres(LIFTGRAM_TEST_DATABASE_URL 이 있을 때만)
//
// 가짜로는 못 보는 것: 운영진·제외 계정이 빠지는가 · 불러온 기록과 다른 컬렉션을 읽지 않는가 ·
// 글자 started_at 이 캐스트 오류를 내지 않는가 · 시행일 전 행이 빠지는가 · 분포 칸 경계.
package admin

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

func mkUser(t *testing.T, pool *pgxpool.Pool, id, role string, excluded bool) {
	t.Helper()
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `INSERT INTO users (id, email, display_name, role, stats_excluded, password_hash) VALUES ($1, $2, '통계시험', $3, $4, 'x')`,
		id, id+"@t.example", role, excluded); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, id) })
}

func mkRecord(t *testing.T, pool *pgxpool.Pool, user, coll, rid, payload string, created time.Time) {
	t.Helper()
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO sync_records (id, user_id, collection, record_id, payload, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
		user+":"+coll+":"+rid, user, coll, rid, payload, created); err != nil {
		t.Fatal(err)
	}
}

func TestPgRepo_통계(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	// 다른 시험의 행과 섞이지 않도록 전후 차이로 본다.
	r := NewRepo(pool)
	now := time.Now()
	since := now.Add(-48 * time.Hour)
	base := fmt.Sprintf("st-%d", now.UnixNano())
	before := func() (int64, []NamedCount, [4]int64) {
		total, _, err := r.SignupTotals(ctx)
		if err != nil {
			t.Fatal(err)
		}
		b, err := r.RoutineBuckets(ctx, since)
		if err != nil {
			t.Fatal(err)
		}
		w, fr, au, med, err := r.WorkoutStats(ctx, since, now.Add(-24*time.Hour).UnixMilli(), now.Add(time.Hour).UnixMilli())
		if err != nil {
			t.Fatal(err)
		}
		return total, b, [4]int64{w, fr, au, med}
	}
	t0, b0, w0 := before()

	u1, u2, staff, excl := base+"-u1", base+"-u2", base+"-staff", base+"-excl"
	mkUser(t, pool, u1, "user", false)
	mkUser(t, pool, u2, "user", false)
	mkUser(t, pool, staff, "coworker", false)
	mkUser(t, pool, excl, "user", true)

	startMs := now.Add(-time.Hour).UnixMilli()
	ok := func(extra string) string {
		return fmt.Sprintf(`{"state":"completed","started_at":%d,"duration_seconds":1800%s}`, startMs, extra)
	}
	for _, u := range []string{staff, excl} {
		mkRecord(t, pool, u, "workouts", "w", ok(""), now)
		mkRecord(t, pool, u, "routines", "r", `{"is_archived":false}`, now)
	}
	// u1: 루틴으로 시작 1건, 빈 운동 1건, 3600초 1건(중앙값 1800 · 3600 · 1800 → 1800)
	mkRecord(t, pool, u1, "workouts", "a", ok(`,"routine_id":"r1"`), now)
	mkRecord(t, pool, u1, "workouts", "b", ok(`,"routine_id":""`), now)
	mkRecord(t, pool, u1, "workouts", "c", fmt.Sprintf(`{"state":"completed","started_at":%d,"duration_seconds":3600,"routine_id":null}`, startMs), now)
	// 세지 않는 것: 불러온 기록 · 진행 중 · 글자 시각 · 시행일 전 · 삭제 · 다른 컬렉션 · 이상한 시간(건수엔 들어가나 중앙값엔 안 들어간다)
	mkRecord(t, pool, u1, "workouts", "imp", ok(`,"source":"opengym"`), now)
	mkRecord(t, pool, u1, "workouts", "act", fmt.Sprintf(`{"state":"active","started_at":%d}`, startMs), now)
	mkRecord(t, pool, u1, "workouts", "str", `{"state":"completed","started_at":"어제"}`, now)
	mkRecord(t, pool, u1, "workouts", "old", ok(""), since.Add(-time.Hour))
	mkRecord(t, pool, u1, "bodyweight_logs", "bw", ok(""), now)
	if _, err := pool.Exec(ctx, `INSERT INTO sync_records (id, user_id, collection, record_id, payload, deleted) VALUES ($1,$2,'workouts','del',$3::jsonb,true)`, u1+":del", u1, ok("")); err != nil {
		t.Fatal(err)
	}
	// u2: 루틴 4개(보관 1개 제외 → 3개, 2-3 칸), 시행일 전 1개 제외
	for i, p := range []string{`{"is_archived":false}`, `{"is_archived":false}`, `{}`, `{"is_archived":true}`} {
		mkRecord(t, pool, u2, "routines", fmt.Sprintf("r%d", i), p, now)
	}
	mkRecord(t, pool, u2, "routines", "old", `{"is_archived":false}`, since.Add(-time.Hour))

	t1, b1, w1 := before()
	if t1-t0 != 2 {
		t.Fatalf("가입 증가 = %d, 운영진·제외 계정은 빠져야 한다", t1-t0)
	}
	if w1[0]-w0[0] != 3 || w1[1]-w0[1] != 1 || w1[2]-w0[2] != 1 {
		t.Fatalf("운동 집계 전 %v 후 %v", w0, w1)
	}
	if w1[3] != 1800 && w0[0] == 0 {
		t.Fatalf("중앙값 = %d", w1[3])
	}
	// 0 칸 +1(u1), 2-3 칸 +1(u2)
	if b1[0].Count-b0[0].Count != 1 || b1[2].Count-b0[2].Count != 1 {
		t.Fatalf("분포 전 %v 후 %v", b0, b1)
	}

	// 일별 · 경로 · 첫 운동 · 콘텐츠 · 운영이 실제로 돈다.
	daily, err := r.SignupDaily(ctx, now.Add(-time.Hour))
	if err != nil || len(daily) == 0 {
		t.Fatalf("일별 %v %v", daily, err)
	}
	prov, err := r.SignupProviders(ctx)
	if err != nil || prov[0].Name != "email" {
		t.Fatalf("경로 %v %v", prov, err)
	}
	// 첫 운동: 지금보다 나중을 잘라 이번 계정을 분모에 넣는다.
	if _, err := pool.Exec(ctx, `UPDATE users SET created_at = $2 WHERE id = $1`, u1, now.Add(-2*time.Hour)); err != nil {
		t.Fatal(err)
	}
	c0, d0, err := r.FirstWorkout(ctx, now.Add(-3*time.Hour), now.Add(time.Hour))
	if err != nil || c0 < 1 || d0 < 1 {
		t.Fatalf("첫 운동 %d %d %v", c0, d0, err)
	}
	rows, err := r.ContentRows(ctx, now.Add(-7*24*time.Hour), now.Add(-30*24*time.Hour))
	if err != nil || len(rows) != 7 {
		t.Fatalf("콘텐츠 %v %v", rows, err)
	}
	if _, _, _, err := r.Operations(ctx); err != nil {
		t.Fatal(err)
	}
	role, found, err := r.UserRole(ctx, staff)
	if err != nil || !found || role != "coworker" {
		t.Fatalf("역할 %q %v %v", role, found, err)
	}
}
