// 피드백 저장소 — 실제 Postgres(LIFTGRAM_TEST_DATABASE_URL 이 있을 때만)
//
// 가짜로는 못 보는 것: 동시 제출이 상한을 넘지 못하는가 · 승인 해시·지시·닫은 시각이 맞게 남는가 ·
// 감사 기록 · 1년 삭제와 탈퇴가 사용자 의견만 지우는가.
package feedback

import (
	"context"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

func TestPgRepo_피드백(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	uid := fmt.Sprintf("fb-pg-%d", time.Now().UnixNano())
	if _, err := pool.Exec(ctx, `INSERT INTO users (id, email, display_name) VALUES ($1, $2, '의견시험')`, uid, uid+"@example.com"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM feedback_items WHERE author_id = $1`, uid)
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, uid)
	})
	r := NewRepo(pool)
	svc := NewService(r, time.Now)
	since := time.Now().Add(-time.Hour)

	// 메일 미확인 → 확인.
	if ok, err := r.EmailConfirmed(ctx, uid); err != nil || ok {
		t.Fatalf("미확인이어야 한다: %v %v", ok, err)
	}
	if _, err := pool.Exec(ctx, `UPDATE users SET email_verified_at = now() WHERE id = $1`, uid); err != nil {
		t.Fatal(err)
	}
	if ok, _ := r.EmailConfirmed(ctx, uid); !ok {
		t.Fatal("확인되어야 한다")
	}

	// 동시 제출 20건 — 잠금 덕에 정확히 상한만 들어간다.
	var wg sync.WaitGroup
	var mu sync.Mutex
	created := 0
	var ids []int64
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			id, limited, err := r.CreateUserLimited(ctx, NewEntry{Kind: KindUser, AuthorID: uid, Body: "동시"}, since, userDailyLimit)
			if err != nil {
				t.Error(err)
				return
			}
			if !limited {
				mu.Lock()
				created++
				ids = append(ids, id)
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if created != userDailyLimit {
		t.Fatalf("상한 %d 인데 %d건", userDailyLimit, created)
	}

	// 승인 → 해시·지시 저장, 완료 → 닫은 시각, 승인 기록 유지, 이벤트 2건.
	id := ids[0]
	if _, err := pool.Exec(ctx, `UPDATE users SET role = 'admin' WHERE id = $1`, uid); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetStatus(ctx, uid, "admin", id, StatusApproved, "지시문"); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.SetStatus(ctx, uid, "admin", id, StatusDone, "끝"); err != nil {
		t.Fatal(err)
	}
	var sha, instr, res string
	var closed *time.Time
	if err := pool.QueryRow(ctx, `SELECT approved_body_sha256, approved_instruction, resolution, closed_at FROM feedback_items WHERE id=$1`, id).Scan(&sha, &instr, &res, &closed); err != nil {
		t.Fatal(err)
	}
	if len(sha) != 64 || instr != "지시문" || res != "끝" || closed == nil {
		t.Fatalf("승인 기록: %q %q %q %v", sha, instr, res, closed)
	}
	var events int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM feedback_events WHERE item_id=$1`, id).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if events != 2 {
		t.Fatalf("이벤트 %d건", events)
	}

	// 운영 피드백 한 건 — 1년 삭제 대상도, 목록 섞임 대상도 아니다.
	opsID, err := svc.SubmitOps(ctx, uid, "admin", "bug", "운영 제목", "운영 내용입니다")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE feedback_items SET closed_at = now() - interval '2 years' WHERE id = ANY($1)`, []int64{id, opsID}); err != nil {
		t.Fatal(err)
	}
	if _, err := r.PurgeClosedUser(ctx, time.Now().Add(-closedRetention)); err != nil {
		t.Fatal(err)
	}
	var left int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM feedback_items WHERE id = ANY($1)`, []int64{id, opsID}).Scan(&left); err != nil {
		t.Fatal(err)
	}
	if left != 1 {
		t.Fatalf("사용자 의견만 지워져야 한다: 남은 %d", left)
	}
	if list, err := r.List(ctx, KindOps, 200); err != nil {
		t.Fatal(err)
	} else {
		for _, e := range list {
			if e.Kind != KindOps {
				t.Fatalf("섞임: %+v", e)
			}
		}
	}

	// 사용자가 사라지면 운영 피드백은 작성자만 비워진다.
	if _, err := pool.Exec(ctx, `DELETE FROM feedback_items WHERE kind='user' AND author_id=$1`, uid); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, uid); err != nil {
		t.Fatal(err)
	}
	var author *string
	if err := pool.QueryRow(ctx, `SELECT author_id FROM feedback_items WHERE id=$1`, opsID).Scan(&author); err != nil {
		t.Fatal(err)
	}
	if author != nil {
		t.Fatalf("작성자가 비워져야 한다: %v", *author)
	}
	_, _ = pool.Exec(ctx, `DELETE FROM feedback_items WHERE id=$1`, opsID)
}
