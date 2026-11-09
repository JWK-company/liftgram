// 코치 루틴 보내기 실제 Postgres(SPEC-050 P3b) — LIFTGRAM_TEST_DATABASE_URL 이 있을 때만
//
// 보내기 → 회원 sync 레코드(결정적 id·출처·순서) → 회원 기기(Push · coach_guard)가 폴더·변형을 고침 → 다시 보내기
// (같은 id · 이름 바뀜 · 빠진 줄 지움 · 회원 칸 남음) → 알림 묶음 → 처방 편집 거절 → 해지(coach_ended) → 다시 연결해
// 보내면 새 루틴 → 회원이 지우면 새 루틴 → 코치 탈퇴(coach_ended).
package coaching

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/auth"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
	syncdomain "github.com/JWK-company/liftgram/src/backend/internal/sync"
	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

func pgSyncRow(t *testing.T, pool *pgxpool.Pool, user, coll, id string) (map[string]any, bool) {
	t.Helper()
	var raw []byte
	var deleted bool
	if err := pool.QueryRow(context.Background(),
		`SELECT payload, deleted FROM sync_records WHERE user_id=$1 AND collection=$2 AND record_id=$3`, user, coll, id).
		Scan(&raw, &deleted); err != nil {
		t.Fatalf("%s/%s: %v", coll, id, err)
	}
	var m map[string]any
	_ = json.Unmarshal(raw, &m)
	return m, deleted
}

func catalogIDs(t *testing.T, pool *pgxpool.Pool) (string, string) {
	t.Helper()
	rows, err := pool.Query(context.Background(),
		`SELECT id FROM exercises WHERE is_custom = false AND is_archived = false ORDER BY id LIMIT 2`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		_ = rows.Scan(&id)
		ids = append(ids, id)
	}
	if len(ids) < 2 {
		t.Skip("카탈로그 종목이 없다(마이그레이션 안 된 DB)")
	}
	return ids[0], ids[1]
}

func TestRoutines_Postgres_보내기_다시_해지_다시_연결_탈퇴(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	svc := pgV2Svc(pool)
	syncSvc := syncdomain.NewService(syncdomain.NewRepo(pool, uuid.NewString), uuid.NewString)
	u := pgUsers(t, pool, "rt", 2)
	member, trainer := u[0], u[1]
	exA, exB := catalogIDs(t, pool)

	connect := func() string {
		g, err := svc.RequestCoaching(ctx, member, RequestInput{TrainerID: trainer})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := svc.Accept(ctx, trainer, g.ID); err != nil {
			t.Fatal(err)
		}
		return g.ID
	}
	gid := connect()

	// 회원의 기존 루틴(순서 4) — 처음 보낸 루틴은 5 에 붙는다
	if err := syncSvc.Push(ctx, member, map[string]syncdomain.TableChanges{"routines": {Created: []string{
		`{"id":"mine","name":"내 루틴","sort_order":4,"is_archived":false,"updated_at":1}`,
	}}}); err != nil {
		t.Fatal(err)
	}

	in := SendRoutineInput{MemberID: member, SourceRoutineID: "draft1", Name: "상체 A", Notes: "메모", Lines: []SendRoutineLine{
		{ID: "l1", ExerciseID: exA, TargetSets: 3, RestSeconds: 120, SortOrder: 0,
			PrescriptionJSON: `[{"setType":"top","repMin":5,"repMax":5,"rest":240}]`},
		{ID: "l2", ExerciseID: exB, TargetSets: 3, RestSeconds: 90, SortOrder: 1},
	}}
	r1, created, err := svc.SendRoutine(ctx, trainer, in)
	if err != nil || !created {
		t.Fatalf("처음 보내기: %v %v", created, err)
	}
	rid := r1.MemberRoutineID
	if rid != "coach-"+r1.ID {
		t.Fatalf("결정적 id: %s / %s", rid, r1.ID)
	}
	routine, _ := pgSyncRow(t, pool, member, "routines", rid)
	for k, v := range map[string]any{"origin": "coach", "coach_id": trainer, "coach_name": trainer, "name": "상체 A",
		"notes": "메모", "sort_order": 5.0, "is_archived": false} {
		if routine[k] != v {
			t.Errorf("루틴 %s = %v, want %v", k, routine[k], v)
		}
	}
	line1, _ := pgSyncRow(t, pool, member, "routine_exercises", rid+"-l1")
	if line1["routine_id"] != rid || line1["exercise_id"] != exA {
		t.Fatalf("줄: %v", line1)
	}

	// 회원 기기 — 폴더·그립을 고르고, 옛 앱처럼 이름도 바꿔 올린다(이름은 막힌다)
	if err := syncSvc.Push(ctx, member, map[string]syncdomain.TableChanges{
		"routines":          {Updated: []string{`{"id":"` + rid + `","name":"바꿈","folder":"받은 루틴","sort_order":0,"updated_at":5}`}},
		"routine_exercises": {Updated: []string{`{"id":"` + rid + `-l1","routine_id":"` + rid + `","target_sets":9,"variant_grip":"wide","updated_at":5}`}},
	}); err != nil {
		t.Fatal(err)
	}

	// 다시 보내기 — 이름 바뀜 · l2 뺌 · l1 세트 4
	in.Name, in.Lines = "상체 B", in.Lines[:1]
	in.Lines[0].TargetSets = 4
	r2, created, err := svc.SendRoutine(ctx, trainer, in)
	if err != nil || created || r2.MemberRoutineID != rid {
		t.Fatalf("다시 보내기: %+v %v %v", r2, created, err)
	}
	routine, _ = pgSyncRow(t, pool, member, "routines", rid)
	for k, v := range map[string]any{"name": "상체 B", "folder": "받은 루틴", "sort_order": 0.0, "origin": "coach"} {
		if routine[k] != v {
			t.Errorf("다시 보낸 루틴 %s = %v, want %v", k, routine[k], v)
		}
	}
	line1, _ = pgSyncRow(t, pool, member, "routine_exercises", rid+"-l1")
	if line1["target_sets"] != 4.0 || line1["variant_grip"] != "wide" {
		t.Errorf("줄 1 = 코치 세트 · 회원 그립: %v", line1)
	}
	if _, deleted := pgSyncRow(t, pool, member, "routine_exercises", rid+"-l2"); !deleted {
		t.Error("빠진 줄이 지워지지 않았다")
	}
	// 10분 안 한 번 더 — 「바꿨어요」 알림은 하나
	if _, _, err := svc.SendRoutine(ctx, trainer, in); err != nil {
		t.Fatal(err)
	}
	if n := pgCount(t, pool, `SELECT count(*) FROM notifications WHERE user_id=$1 AND kind='coaching_routine' AND ref_id=$2 AND post_id IS NULL`, member, rid); n != 1 {
		t.Errorf("보냈어요 알림: %d", n)
	}
	if n := pgCount(t, pool, `SELECT count(*) FROM notifications WHERE user_id=$1 AND kind='coaching_routine_update'`, member); n != 1 {
		t.Errorf("바꿨어요 알림(10분 묶음): %d", n)
	}
	if n := pgCount(t, pool, `SELECT count(*) FROM coaching_audits WHERE grant_id=$1 AND action IN ('routine_send','routine_update')`, gid); n != 3 {
		t.Errorf("감사: %d", n)
	}

	// 코치 루틴 처방은 처방 편집기로 못 고친다
	if _, err := svc.SetMemberPrescription(ctx, trainer, member, rid, rid+"-l1", nil); codeOf(t, err) != errs.Validation {
		t.Fatalf("처방 편집 거절: %v", err)
	}
	sent, err := svc.ListSentRoutines(ctx, trainer, member)
	if err != nil || len(sent) != 1 || sent[0].Name != "상체 B" || sent[0].Status != RoutineActive || sent[0].SourceRoutineID != "draft1" {
		t.Fatalf("보낸 목록: %+v %v", sent, err)
	}

	// 해지 — 회원 루틴은 「코칭 끝남」 · 이름·폴더 그대로
	if _, err := svc.Revoke(ctx, member, gid); err != nil {
		t.Fatal(err)
	}
	routine, _ = pgSyncRow(t, pool, member, "routines", rid)
	if routine["origin"] != "coach_ended" || routine["name"] != "상체 B" || routine["folder"] != "받은 루틴" {
		t.Fatalf("코칭 끝남: %v", routine)
	}
	if _, _, err := svc.SendRoutine(ctx, trainer, in); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("해지 뒤 보내기: %v", err)
	}
	if sent, _ := svc.ListSentRoutines(ctx, trainer, member); len(sent) != 1 || sent[0].Status != RoutineEnded {
		t.Fatalf("끝난 목록: %+v", sent)
	}

	// 다시 연결해 같은 초안을 보내면 새 루틴(옛 루틴은 끝남 그대로)
	connect()
	r3, created, err := svc.SendRoutine(ctx, trainer, in)
	if err != nil || !created || r3.MemberRoutineID == rid {
		t.Fatalf("다시 연결 뒤: %+v %v %v", r3, created, err)
	}
	if old, _ := pgSyncRow(t, pool, member, "routines", rid); old["origin"] != "coach_ended" {
		t.Fatalf("옛 루틴: %v", old)
	}

	// 회원이 지우면 다음 보내기는 새 루틴
	if err := syncSvc.Push(ctx, member, map[string]syncdomain.TableChanges{"routines": {Deleted: []string{r3.MemberRoutineID}}}); err != nil {
		t.Fatal(err)
	}
	r4, created, err := svc.SendRoutine(ctx, trainer, in)
	if err != nil || !created || r4.MemberRoutineID == r3.MemberRoutineID {
		t.Fatalf("지운 뒤: %+v %v %v", r4, created, err)
	}

	// 코치 탈퇴 — 회원 루틴은 「코칭 끝남」
	if ok, _, err := auth.NewAccountRepo(auth.NewRepo(pool)).DeleteUserAccount(ctx, trainer); err != nil || !ok {
		t.Fatalf("탈퇴: %v %v", ok, err)
	}
	if r, _ := pgSyncRow(t, pool, member, "routines", r4.MemberRoutineID); r["origin"] != "coach_ended" {
		t.Fatalf("탈퇴 뒤: %v", r)
	}
}

// 리뷰 M-2·M-3 — 회원이 루틴을 지우는 트랜잭션이 잠금을 쥔 사이에 코치가 다시 보내면, 보내기는 기다렸다가
// 잠근 뒤의 값(지워짐)을 보고 새 루틴으로 보낸다(지운 루틴을 되살리지 않는다). 보낸 이름은 coaching_routines 에 남는다.
func TestRoutines_Postgres_지우는_중에_다시_보내도_되살리지_않는다(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	svc := pgV2Svc(pool)
	u := pgUsers(t, pool, "rl", 2)
	member, trainer := u[0], u[1]
	exA, _ := catalogIDs(t, pool)
	g, err := svc.RequestCoaching(ctx, member, RequestInput{TrainerID: trainer})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Accept(ctx, trainer, g.ID); err != nil {
		t.Fatal(err)
	}
	in := SendRoutineInput{MemberID: member, SourceRoutineID: "draftL", Name: "하체 A", Lines: []SendRoutineLine{
		{ID: "l1", ExerciseID: exA, TargetSets: 3, RestSeconds: 120},
	}}
	r1, _, err := svc.SendRoutine(ctx, trainer, in)
	if err != nil {
		t.Fatal(err)
	}

	// 회원 기기의 지우기 — 행을 잠그고 지운 채 커밋을 미룬다
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SELECT 1 FROM sync_records WHERE user_id=$1 AND collection='routines' AND record_id=$2 FOR UPDATE`,
		member, r1.MemberRoutineID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `UPDATE sync_records SET deleted=true, updated_at=now() WHERE user_id=$1 AND record_id=$2`,
		member, r1.MemberRoutineID); err != nil {
		t.Fatal(err)
	}

	type res struct {
		r       SentRoutine
		created bool
		err     error
	}
	done := make(chan res, 1)
	in.Name = "하체 B"
	go func() {
		r, c, err := svc.SendRoutine(ctx, trainer, in)
		done <- res{r, c, err}
	}()
	// 보내기가 잠금을 기다리기 시작할 때까지(최대 5초)
	waiting := false
	for i := 0; i < 100 && !waiting; i++ {
		waiting = pgCount(t, pool, `SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%LockMemberRoutineRows%'`) > 0
		if !waiting {
			select {
			case r := <-done:
				t.Fatalf("보내기가 잠금을 기다리지 않았다: %+v", r)
			case <-time.After(50 * time.Millisecond):
			}
		}
	}
	if !waiting {
		t.Fatal("보내기가 잠금을 기다리지 않았다")
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	var got res
	select {
	case got = <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("보내기가 끝나지 않았다")
	}
	if got.err != nil || !got.created || got.r.MemberRoutineID == r1.MemberRoutineID {
		t.Fatalf("지운 뒤 보내기 = 새 루틴이어야 한다: %+v", got)
	}
	if _, deleted := pgSyncRow(t, pool, member, "routines", r1.MemberRoutineID); !deleted {
		t.Fatal("회원이 지운 루틴이 되살아났다")
	}

	// 보낸 이름 — 회원 레코드가 아니라 보낸 때의 이름(코칭이 끝나 회원이 이름을 바꿔도 그대로)
	if _, err := pool.Exec(ctx, `UPDATE sync_records SET payload = payload || '{"name":"회원이 바꿈"}' WHERE user_id=$1 AND record_id=$2`,
		member, got.r.MemberRoutineID); err != nil {
		t.Fatal(err)
	}
	sent, err := svc.ListSentRoutines(ctx, trainer, member)
	if err != nil || len(sent) != 2 {
		t.Fatalf("보낸 목록: %+v %v", sent, err)
	}
	names := map[string]string{}
	for _, s := range sent {
		names[s.MemberRoutineID] = s.Name + "/" + s.Status
	}
	if names[got.r.MemberRoutineID] != "하체 B/"+RoutineActive || names[r1.MemberRoutineID] != "하체 A/"+RoutineEnded {
		t.Fatalf("보낸 이름·상태: %v", names)
	}
}
