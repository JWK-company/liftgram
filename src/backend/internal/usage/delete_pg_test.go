// 탈퇴 — 실제 탈퇴 저장소(auth)가 계정의 이용 기록 원본을 같은 트랜잭션에서 지우는가.
package usage

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/JWK-company/liftgram/src/backend/internal/auth"
	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

func TestPgRepo_탈퇴하면_원본을_지우고_합계는_남긴다(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	r := NewRepo(pool)
	id := fmt.Sprintf("usg-del-%d", time.Now().UnixNano())
	if _, err := pool.Exec(ctx, `INSERT INTO users (id, email, display_name) VALUES ($1,$2,'x')`, id, id+"@t.example"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM usage_daily WHERE metric='del-test'`) })

	now := time.Now()
	guest := uuid.NewString()
	for _, a := range [][2]string{{"user", id}, {"guest", guest}} {
		if _, err := r.InsertEvents(ctx, a[0], a[1], "web", "", []EventRow{{At: now, ClientEventID: uuid.NewString(), Event: "app_open"}}); err != nil {
			t.Fatal(err)
		}
		if err := r.TouchPresence(ctx, a[0], a[1], now, DayOf(now)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `INSERT INTO usage_daily (day, actor_kind, metric, actors, events) VALUES ('2026-11-06','user','del-test',1,1)`); err != nil {
		t.Fatal(err)
	}

	acct, ok := auth.NewRepo(pool).(auth.AccountRepo)
	if !ok {
		t.Fatal("저장소가 AccountRepo 가 아니다")
	}
	deleted, _, err := acct.DeleteUserAccount(ctx, id)
	if err != nil || !deleted {
		t.Fatalf("탈퇴 %v %v", deleted, err)
	}
	count := func(q string, arg string) int {
		var n int
		if err := pool.QueryRow(ctx, q, arg).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	for _, tbl := range []string{"usage_events", "usage_presence", "usage_active_days"} {
		if n := count(`SELECT count(*) FROM `+tbl+` WHERE actor_id=$1`, id); n != 0 {
			t.Fatalf("%s 에 %d 행이 남았다", tbl, n)
		}
		if n := count(`SELECT count(*) FROM `+tbl+` WHERE actor_id=$1`, guest); n != 1 {
			t.Fatalf("다른 주체는 남아야 한다: %s %d", tbl, n)
		}
	}
	if n := count(`SELECT count(*) FROM usage_daily WHERE metric=$1`, "del-test"); n != 1 {
		t.Fatalf("합계가 지워졌다: %d", n)
	}
}
