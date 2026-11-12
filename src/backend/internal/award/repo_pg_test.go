// 이달의 리프터 저장소 — 실제 Postgres(LIFTGRAM_TEST_DATABASE_URL 이 있을 때만).
//
// 가짜로는 못 보는 것: 집계 SQL(KST 날짜 · 10분 · 가져온 기록 · 몰아 올린 기록 · 좋아요 조건과 상한 · 차단) ·
// 동시 확정에서 하나만 이기는가 · 쿠폰 번호가 바뀔 때만 받음이 지워지는가.
// 시험 사용자·행은 시험 DB 안에서 만들고 지운다(운영 DB 에 쓰지 않는다).
package award

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

func TestPgRepo_이달의_리프터(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	tag := fmt.Sprintf("aw%d", time.Now().UnixNano())
	month := "2020-03" // 시험 전용 달(실제 운영 달과 겹치지 않게)
	from, to, _ := MonthBounds(month)
	u := func(s string) string { return tag + "-" + s }
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := pool.Exec(ctx, q, args...); err != nil {
			t.Fatalf("%v: %s", err, q)
		}
	}
	// 계정: a(작성자) · b·c(좋아요 자격) · n(새 계정) · m(메일 미확인) · x(운영진)
	old := from.Add(-30 * 24 * time.Hour)
	for _, id := range []string{"a", "b", "c", "n", "m", "x"} {
		exec(`INSERT INTO users (id, email, display_name, role, created_at, email_verified_at, age_confirmed_at) VALUES ($1,$2,$3,'user',$4,$4,$4)`,
			u(id), u(id)+"@example.com", "시험"+id, old)
	}
	exec(`UPDATE users SET created_at = $2 WHERE id = $1`, u("n"), to.Add(-2*24*time.Hour))
	exec(`UPDATE users SET email_verified_at = NULL WHERE id = $1`, u("m"))
	exec(`UPDATE users SET role = 'admin' WHERE id = $1`, u("x"))
	t.Cleanup(func() {
		c := context.Background()
		_, _ = pool.Exec(c, `DELETE FROM awards WHERE month = $1`, month)
		_, _ = pool.Exec(c, `DELETE FROM award_months WHERE month = $1`, month)
		_, _ = pool.Exec(c, `DELETE FROM users WHERE id LIKE $1`, tag+"-%")
	})

	// ── 운동한 날 ──
	wk := 0
	workout := func(user string, start time.Time, dur any, source any, state string, recv time.Time) {
		wk++
		payload := fmt.Sprintf(`{"state":%q,"started_at":%d,"duration_seconds":%s,"source":%s}`, state, start.UnixMilli(), dur, source)
		exec(`INSERT INTO sync_records (id, user_id, collection, record_id, payload, created_at, updated_at) VALUES ($1,$2,'workouts',$3,$4::jsonb,$5,$5)`,
			fmt.Sprintf("%s-w%d", tag, wk), u(user), fmt.Sprintf("w%d", wk), payload, recv)
	}
	d1 := from.Add(10 * time.Hour)                                                            // 3월 1일 10시
	workout("a", d1, "1800", "null", "completed", d1)                                         // 셈
	workout("a", d1.Add(2*time.Hour), "1800", "null", "completed", d1.Add(2*time.Hour))       // 같은 날 — 하루
	workout("a", d1.Add(24*time.Hour), "300", "null", "completed", d1.Add(24*time.Hour))      // 10분 미만
	workout("a", d1.Add(48*time.Hour), "1800", `"strong"`, "completed", d1.Add(48*time.Hour)) // 가져온 기록
	workout("a", d1.Add(72*time.Hour), "1800", "null", "in_progress", d1.Add(72*time.Hour))   // 미완료
	workout("a", d1.Add(96*time.Hour), `"x"`, "null", "completed", d1.Add(96*time.Hour))      // 숫자 아님 — 쿼리가 깨지지 않는다
	workout("a", d1.Add(120*time.Hour), "1800", "null", "completed", d1.Add(20*24*time.Hour)) // 몰아 올림 → late
	lastNight := to.Add(-time.Minute)                                                         // 3월 31일 23:59 KST
	workout("a", lastNight, "1800", "null", "completed", lastNight)                           // 3월
	workout("a", to, "1800", "null", "completed", to)                                         // 4월 1일 0시 → 제외
	r := NewRepo(pool)
	days, err := r.WorkoutDays(ctx, from, to, u("a"))
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 1 || days[0].Days != 2 || days[0].Late != 1 {
		t.Fatalf("운동한 날 2(1일·31일) · 몰아 올림 1: %+v", days)
	}

	// ── 인정 좋아요 ──
	for i := 0; i < 7; i++ {
		exec(`INSERT INTO posts (id, author_id, caption, created_at) VALUES ($1,$2,'시험',$3)`, fmt.Sprintf("%s-p%d", tag, i), u("a"), d1)
	}
	exec(`INSERT INTO posts (id, author_id, caption, visibility, created_at) VALUES ($1,$2,'비공개','private',$3)`, tag+"-pp", u("a"), d1)
	like := func(post, user string, at time.Time) {
		exec(`INSERT INTO post_likes (post_id, user_id, created_at) VALUES ($1,$2,$3)`, post, u(user), at)
	}
	for i := 0; i < 7; i++ {
		like(fmt.Sprintf("%s-p%d", tag, i), "b", d1) // b 는 7개 → 5개까지
	}
	like(tag+"-p0", "c", d1)
	like(tag+"-p1", "c", to.Add(time.Hour)) // 다음 달 → 제외
	like(tag+"-p0", "n", d1)                // 새 계정 → 제외
	like(tag+"-p0", "m", d1)                // 메일 미확인 → 제외
	like(tag+"-p0", "x", d1)                // 운영진 → 제외
	like(tag+"-p0", "a", d1)                // 자기 글 → 제외
	like(tag+"-pp", "c", d1)                // 비공개 글 → 제외
	likes, err := r.Likes(ctx, from, to, u("a"), 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(likes) != 1 || likes[0].Likes != 6 || likes[0].Likers != 2 {
		t.Fatalf("인정 좋아요 6(b 5 상한 + c 1) · 누른 사람 2: %+v", likes)
	}
	exec(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2)`, u("a"), u("c"))
	likes, _ = r.Likes(ctx, from, to, u("a"), 5)
	if likes[0].Likes != 5 || likes[0].Likers != 1 {
		t.Fatalf("차단한 사람의 좋아요 제외: %+v", likes)
	}

	// ── 확정 경합 · 쿠폰 ──
	if _, err := r.EnsureMonth(ctx, month, "s", sha("s")); err != nil {
		t.Fatal(err)
	}
	m2, _ := r.EnsureMonth(ctx, month, "other", sha("other"))
	if m2.Seed != "s" {
		t.Fatal("씨앗은 처음 것 그대로")
	}
	var wg sync.WaitGroup
	wins := make(chan bool, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			ok, err := r.Announce(ctx, month, u("x"), "h", []NewAward{{ID: fmt.Sprintf("%s-aw%d", tag, i), Month: month, Category: CategorySteady, UserID: u("a"), Rank: 1, Days: 2}})
			if err != nil {
				t.Error(err)
			}
			wins <- ok
		}(i)
	}
	wg.Wait()
	close(wins)
	n := 0
	for ok := range wins {
		if ok {
			n++
		}
	}
	aw, _ := r.AwardsForMonths(ctx, []string{month})
	if n != 1 || len(aw) != 1 || aw[0].Name != "시험a" {
		t.Fatalf("하나만 이긴다: wins=%d awards=%+v", n, aw)
	}
	id := aw[0].ID
	if ok, _ := r.MarkClaimed(ctx, id, u("a"), true); ok {
		t.Fatal("번호 없으면 받음 불가")
	}
	if ok, _ := r.SetCoupon(ctx, id, "CODE-1", "닭가슴살", nil, u("x")); !ok {
		t.Fatal("쿠폰 등록")
	}
	if ok, _ := r.MarkClaimed(ctx, id, u("b"), true); ok {
		t.Fatal("남은 받음 표시 불가")
	}
	_, _ = r.MarkClaimed(ctx, id, u("a"), true)
	_, _ = r.SetCoupon(ctx, id, "CODE-1", "닭가슴살 2", nil, u("x")) // 번호 같음 → 받음 유지
	a1, _, _ := r.GetAward(ctx, id)
	if a1.ClaimedAt == nil || a1.CouponItem != "닭가슴살 2" {
		t.Fatalf("번호가 같으면 받음 유지: %+v", a1)
	}
	_, _ = r.SetCoupon(ctx, id, "CODE-2", "닭가슴살 2", nil, u("x")) // 번호 바뀜 → 받음 지움
	a2, _, _ := r.GetAward(ctx, id)
	if a2.ClaimedAt != nil || a2.CouponCode != "CODE-2" {
		t.Fatalf("번호가 바뀌면 받음 지움: %+v", a2)
	}
	exp := time.Date(2026, 12, 31, 0, 0, 0, 0, KST)
	_, _ = r.SetCoupon(ctx, id, "CODE-2", "닭가슴살 2", &exp, u("x"))
	if a4, _, _ := r.GetAward(ctx, id); a4.CouponExpires != "2026-12-31" {
		t.Fatalf("기한 왕복(KST 자정이 하루 밀리지 않음): %q", a4.CouponExpires)
	}
	// 탈퇴 → user_id NULL, 수상 기록은 남는다
	exec(`DELETE FROM users WHERE id = $1`, u("a"))
	a3, ok, _ := r.GetAward(ctx, id)
	if !ok || a3.UserID != "" {
		t.Fatalf("탈퇴해도 기록은 남고 사용자는 비어야: %v %+v", ok, a3)
	}
	if ok, _ := r.SetCoupon(ctx, id, "CODE-3", "x", nil, u("x")); ok {
		t.Fatal("탈퇴한 수상자에게는 쿠폰을 쓰지 않는다")
	}
}
