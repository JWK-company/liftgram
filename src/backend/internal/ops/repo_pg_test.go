// @plm SRS-088  운영 상태 저장소 — 실제 Postgres(LIFTGRAM_TEST_DATABASE_URL 이 있을 때만)
//
// 가짜 저장소로는 못 보는 것: upsert 가 first_reported_at 을 바꾸지 않는가 · 정리가 같은 트랜잭션에서
// 사용자당 8줄만 남기는가 · 운영 화면 쿼리(서브쿼리 max · NULLS LAST)가 실제로 도는가.
package ops

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

func TestPgRepo_보고_upsert_정리_조회(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	uid := fmt.Sprintf("ops-pg-%d", time.Now().UnixNano())
	if _, err := pool.Exec(ctx, `INSERT INTO users (id, email, display_name) VALUES ($1, $2, '운영시험')`, uid, uid+"@example.com"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = $1`, uid) })

	r := NewRepo(pool)
	base := time.Now().UTC().Truncate(time.Millisecond)
	first, _ := Normalize(uid, Report{DeviceID: "dev00", Pending: i64(2)}, base)
	if err := r.UpsertHealth(ctx, first, KeepDevicesPerUser); err != nil {
		t.Fatal(err)
	}
	var fr0 time.Time
	if err := pool.QueryRow(ctx, `SELECT first_reported_at FROM client_health WHERE user_id=$1 AND device_id='dev00'`, uid).Scan(&fr0); err != nil {
		t.Fatal(err)
	}
	// 같은 기기를 다시 보고 — 첫 보고 시각은 그대로, 나머지는 바뀐다.
	again, _ := Normalize(uid, Report{DeviceID: "dev00", Pending: i64(5), ConsecutiveFailures: 3, LastError: "boom"}, base.Add(time.Minute))
	if err := r.UpsertHealth(ctx, again, KeepDevicesPerUser); err != nil {
		t.Fatal(err)
	}
	var fr1 time.Time
	var pending, failures int32
	if err := pool.QueryRow(ctx, `SELECT first_reported_at, pending, consecutive_failures FROM client_health WHERE user_id=$1 AND device_id='dev00'`, uid).Scan(&fr1, &pending, &failures); err != nil {
		t.Fatal(err)
	}
	if !fr1.Equal(fr0) || pending != 5 || failures != 3 {
		t.Fatalf("첫 보고 유지(%v→%v)·값 갱신(%d,%d)", fr0, fr1, pending, failures)
	}

	// 기기 12대 — 최신 8줄만 남는다.
	for i := 1; i < 12; i++ {
		h, _ := Normalize(uid, Report{DeviceID: fmt.Sprintf("dev%02d", i)}, base.Add(time.Duration(i+1)*time.Minute))
		if err := r.UpsertHealth(ctx, h, KeepDevicesPerUser); err != nil {
			t.Fatal(err)
		}
	}
	rows, err := r.ListHealthSince(ctx, base.Add(-time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	mine := []string{}
	for _, h := range rows {
		if h.UserID == uid {
			mine = append(mine, h.DeviceID)
		}
	}
	if len(mine) != KeepDevicesPerUser || mine[0] != "dev11" || mine[len(mine)-1] != "dev04" {
		t.Fatalf("최신 8줄·최신순: %v", mine)
	}

	users, err := r.ListUsers(ctx, 5000)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, u := range users {
		if u.ID == uid {
			found = true
			if u.LastSyncAt != nil || u.LastActiveAt != nil || u.DisplayName != "운영시험" {
				t.Fatalf("동기·활동 없음은 nil: %+v", u)
			}
		}
	}
	if !found {
		t.Fatal("사용자 목록에 있다")
	}
	if role, ok, err := r.UserRole(ctx, uid); err != nil || !ok || role != "user" {
		t.Fatalf("DB 역할: %q %v %v", role, ok, err)
	}
	if _, ok, _ := r.UserRole(ctx, uid+"-none"); ok {
		t.Fatal("없는 사용자")
	}

	// 백업 줄 읽기(넣는 쪽은 스크립트 psql — 여기서는 같은 모양으로 넣는다).
	if _, err := pool.Exec(ctx, `INSERT INTO ops_backup_runs (kind, ok, size_bytes, tables, disk_free_bytes, detail, counts, created_at)
		VALUES ('daily', true, 1234, 40, 99, 'test', '{"users":1}', now() + interval '100 years'),
		       ('daily', false, NULL, NULL, NULL, 'stage=dump', NULL, now() + interval '101 years')`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM ops_backup_runs WHERE created_at > now() + interval '99 years'`)
	})
	last, ok, err := r.LastBackupRun(ctx, "daily", false)
	if err != nil || !ok || last.OK || last.Detail != "stage=dump" || last.SizeBytes != 0 {
		t.Fatalf("마지막 daily(실패): %+v %v %v", last, ok, err)
	}
	lastOK, ok, err := r.LastBackupRun(ctx, "daily", true)
	if err != nil || !ok || !lastOK.OK || lastOK.SizeBytes != 1234 || lastOK.Tables != 40 {
		t.Fatalf("마지막 성공 daily: %+v %v %v", lastOK, ok, err)
	}
}
