// 코치 코멘트·점검 실제 Postgres(SPEC-050 P4) — LIFTGRAM_TEST_DATABASE_URL 이 있을 때만
//
// 회원이 운동을 올림(동의 1초 전·뒤·코치 루틴) → 코치 코멘트 → 알림 행(kind·ref_id·post_id 비움) → 목록(코치/회원) →
// 하루 상한 쿼리 → 차단하면 회원 목록에서도 빠짐 → 숨기기 → 점검 숫자(컷·주 시작·코치 루틴).
package coaching

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/JWK-company/liftgram/src/backend/internal/auth"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
	syncdomain "github.com/JWK-company/liftgram/src/backend/internal/sync"
	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

func TestComments_Postgres_코멘트_알림_목록_차단_숨김_점검(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	svc := pgV2Svc(pool)
	syncSvc := syncdomain.NewService(syncdomain.NewRepo(pool, uuid.NewString), uuid.NewString)
	u := pgUsers(t, pool, "cm", 2)
	member, trainer := u[0], u[1]

	g, err := svc.RequestCoaching(ctx, member, RequestInput{TrainerID: trainer})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Accept(ctx, trainer, g.ID); err != nil {
		t.Fatal(err)
	}
	var consent time.Time
	if err := pool.QueryRow(ctx, `SELECT consent_at FROM coaching_grants WHERE id=$1`, g.ID).Scan(&consent); err != nil {
		t.Fatal(err)
	}
	// 코치가 보낸 루틴 하나(점검의 「코치 루틴 운동」) — 회원 루틴 id coach-<crid>
	crid := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO coaching_routines (id, grant_id, trainer_id, member_id, source_routine_id, member_routine_id)
		VALUES ($1,$2,$3,$4,'draft1',$5)`, crid, g.ID, trainer, member, "coach-"+crid); err != nil {
		t.Fatal(err)
	}
	cut := consent.UnixMilli()
	w := func(id string, at int64, routine string) string {
		r := "null"
		if routine != "" {
			r = fmt.Sprintf("%q", routine)
		}
		return fmt.Sprintf(`{"id":%q,"state":"completed","started_at":%d,"routine_id":%s,"updated_at":1}`, id, at, r)
	}
	if err := syncSvc.Push(ctx, member, map[string]syncdomain.TableChanges{"workouts": {Created: []string{
		w("w-before", cut-1000, ""),
		w("w-after", cut+1000, ""),
		w("w-coach", cut+2000, "coach-"+crid),
		`{"id":"w-live","state":"in_progress","started_at":` + fmt.Sprint(cut+3000) + `,"updated_at":1}`,
	}}}); err != nil {
		t.Fatal(err)
	}

	// 동의 1초 전 운동·진행 중 운동에는 남길 수 없다(같은 NotFound)
	for _, wid := range []string{"w-before", "w-live"} {
		if _, err := svc.AddComment(ctx, trainer, member, wid, "안 됨"); codeOf(t, err) != errs.NotFound {
			t.Fatalf("%s: %v", wid, err)
		}
	}
	c, err := svc.AddComment(ctx, trainer, member, "w-coach", "탑셋 RIR 지켰네요")
	if err != nil {
		t.Fatal(err)
	}
	if c.TrainerName != trainer || c.CreatedAt.IsZero() {
		t.Fatalf("코멘트: %+v", c)
	}
	// 알림 — 회원에게 coaching_comment · ref_id = 운동 id · post_id 비움
	if n := pgCount(t, pool, `SELECT count(*) FROM notifications WHERE user_id=$1 AND actor_id=$2 AND kind='coaching_comment'
		AND ref_id='w-coach' AND post_id IS NULL`, member, trainer); n != 1 {
		t.Fatalf("알림 행 %d", n)
	}
	if n := pgCount(t, pool, `SELECT count(*) FROM coaching_audits WHERE grant_id=$1 AND action='comment_add'`, g.ID); n != 1 {
		t.Fatalf("감사 %d", n)
	}
	if n, err := svc.repo.CountCommentsSince(ctx, trainer, member, time.Now().Add(-time.Hour)); err != nil || n != 1 {
		t.Fatalf("하루 상한 세기: %d %v", n, err)
	}

	// 목록 — 회원(운동 하나) · 코치(운동 하나 · 전부)
	mine, err := svc.ListComments(ctx, member, "", "w-coach")
	if err != nil || len(mine) != 1 || mine[0].Body != "탑셋 RIR 지켰네요" || mine[0].TrainerName != trainer {
		t.Fatalf("회원 목록: %+v %v", mine, err)
	}
	if all, err := svc.ListComments(ctx, trainer, member, ""); err != nil || len(all) != 1 {
		t.Fatalf("코치 전체: %+v %v", all, err)
	}

	// 점검 — 동의 뒤 2회(w-after·w-coach) · 코치 루틴 1회 · 마지막 = w-coach · 동의 전·진행 중은 세지 않는다
	weekStart := time.Now().Add(-7 * 24 * time.Hour).UnixMilli()
	ds, truncated, err := svc.ListMemberDigest(ctx, trainer, weekStart)
	if err != nil || len(ds) != 1 || truncated {
		t.Fatalf("점검: %+v %v %v", ds, truncated, err)
	}
	if d := ds[0]; d.MemberID != member || !d.LogView || d.WeekWorkouts != 2 || d.WeekCoachWorkouts != 1 ||
		d.LastWorkoutAt.UnixMilli() != cut+2000 {
		t.Fatalf("점검 숫자: %+v (cut %d)", d, cut)
	}
	farTo := time.Now().Add(time.Hour).UnixMilli()
	digestOf := func(trainerID string, week int64) DigestRow {
		t.Helper()
		rows, err := svc.repo.ListMemberDigestRows(ctx, trainerID, week, farTo, time.Now().UnixMilli(), 10)
		if err != nil {
			t.Fatal(err)
		}
		for _, r := range rows {
			if r.MemberID == member {
				return r
			}
		}
		return DigestRow{}
	}
	// 주 시작을 w-after 뒤로 옮기면 이번 주는 1회
	if c := digestOf(trainer, cut+1500); c.WeekWorkouts != 1 || c.WeekCoachWorkouts != 1 {
		t.Fatalf("주 시작: %+v", c)
	}
	// 지난 기록 켬(컷 0) → 동의 전 운동도 센다 · 끄면 다시 동의 뒤만
	setScope := func(js string) {
		t.Helper()
		if _, err := pool.Exec(ctx, `UPDATE coaching_grants SET scope=$2::jsonb WHERE id=$1`, g.ID, js); err != nil {
			t.Fatal(err)
		}
	}
	setScope(`{"logView":true,"routineEdit":true,"bodyView":false,"pastRecords":true}`)
	if c := digestOf(trainer, 1); c.WeekWorkouts != 3 {
		t.Fatalf("컷 없음: %+v", c)
	}
	// 기록 보기 끔 → 숫자 0(관계 줄은 나온다)
	setScope(`{"logView":false,"routineEdit":true,"bodyView":false,"pastRecords":true}`)
	if c := digestOf(trainer, 1); c.MemberID != member || c.WeekWorkouts != 0 || c.LastStartedAtMs != 0 {
		t.Fatalf("기록 보기 끔: %+v", c)
	}
	setScope(`{"logView":true,"routineEdit":true,"bodyView":false,"pastRecords":false}`)
	if c := digestOf(trainer, 1); c.WeekWorkouts != 2 {
		t.Fatalf("컷 다시: %+v", c)
	}
	// 다른 코치가 보낸 루틴(끝난 관계) 운동은 이 코치의 「코치 루틴」으로 세지 않는다 · 처방 칸도 없다
	other := pgUsers(t, pool, "cmo", 1)[0]
	og := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO coaching_grants (id, trainer_id, member_id, status, requested_by) VALUES ($1,$2,$3,'revoked','member')`,
		og, other, member); err != nil {
		t.Fatal(err)
	}
	ocr := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO coaching_routines (id, grant_id, trainer_id, member_id, source_routine_id, member_routine_id)
		VALUES ($1,$2,$3,$4,'draft9',$5)`, ocr, og, other, member, "coach-"+ocr); err != nil {
		t.Fatal(err)
	}
	if err := syncSvc.Push(ctx, member, map[string]syncdomain.TableChanges{
		"workouts": {Created: []string{w("w-other", cut+2500, "coach-"+ocr), w("w-forged", cut+2600, "coach-forged")}},
		"workout_exercises": {Created: []string{
			`{"id":"b-coach","workout_id":"w-coach","exercise_id":"seed-bench","prescription":"[]","target_sets":3,"updated_at":1}`,
			`{"id":"b-other","workout_id":"w-other","exercise_id":"seed-bench","prescription":"[]","target_sets":3,"updated_at":1}`,
			`{"id":"b-forged","workout_id":"w-forged","exercise_id":"seed-bench","prescription":"[]","target_sets":3,"updated_at":1}`,
		}},
	}); err != nil {
		t.Fatal(err)
	}
	if c := digestOf(trainer, cut+1500); c.WeekWorkouts != 3 || c.WeekCoachWorkouts != 1 {
		t.Fatalf("다른 코치·위조 루틴: %+v", c)
	}
	recs, err := svc.GetMemberRecords(ctx, trainer, member, cut, time.Now().Add(time.Minute).UnixMilli())
	if err != nil {
		t.Fatal(err)
	}
	rx := map[string]bool{}
	for _, b := range recs.WorkoutExercises {
		if strings.Contains(b, `"prescription"`) {
			rx[strings.SplitN(strings.SplitN(b, `"id":"`, 2)[1], `"`, 2)[0]] = true
		}
	}
	if !rx["b-coach"] || rx["b-other"] || rx["b-forged"] {
		t.Fatalf("처방 칸 = 이 코치 루틴 운동만: %v / %v", rx, recs.WorkoutExercises)
	}

	// 회원이 코치를 차단 → 회원 목록에서도 빠진다 · 코치는 막힌다 · 점검에서 빠진다
	if _, err := pool.Exec(ctx, `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2)`, member, trainer); err != nil {
		t.Fatal(err)
	}
	if got, err := svc.ListComments(ctx, member, "", "w-coach"); err != nil || len(got) != 0 {
		t.Fatalf("차단 뒤 회원 목록: %+v %v", got, err)
	}
	if _, err := svc.ListComments(ctx, trainer, member, ""); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("차단 뒤 코치: %v", err)
	}
	if ds, _, err := svc.ListMemberDigest(ctx, trainer, weekStart); err != nil || len(ds) != 0 {
		t.Fatalf("차단 뒤 점검: %+v %v", ds, err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM blocks WHERE blocker_id=$1`, member); err != nil {
		t.Fatal(err)
	}

	// 숨기기 — 회원이 숨기면 양쪽 다 안 보인다 · 다시 숨겨도 성공 · 감사 한 번
	if err := svc.HideComment(ctx, member, c.ID); err != nil {
		t.Fatal(err)
	}
	if err := svc.HideComment(ctx, trainer, c.ID); err != nil {
		t.Fatal(err)
	}
	if n := pgCount(t, pool, `SELECT count(*) FROM coaching_audits WHERE grant_id=$1 AND action='comment_hide'`, g.ID); n != 1 {
		t.Fatalf("숨김 감사 %d", n)
	}
	if got, _ := svc.ListComments(ctx, member, "", "w-coach"); len(got) != 0 {
		t.Fatalf("숨긴 뒤 회원: %+v", got)
	}
	if got, _ := svc.ListComments(ctx, trainer, member, ""); len(got) != 0 {
		t.Fatalf("숨긴 뒤 코치: %+v", got)
	}

	// 해지 뒤 — 회원은 여전히 읽는다(새 코멘트로) · 코치는 쓰기·읽기 막힘
	c2, err := svc.AddComment(ctx, trainer, member, "w-after", "다음엔 한 세트 더")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Revoke(ctx, member, g.ID); err != nil {
		t.Fatal(err)
	}
	if got, err := svc.ListComments(ctx, member, "", "w-after"); err != nil || len(got) != 1 || got[0].ID != c2.ID {
		t.Fatalf("해지 뒤 회원: %+v %v", got, err)
	}
	if _, err := svc.AddComment(ctx, trainer, member, "w-after", "해지 뒤"); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("해지 뒤 코치 쓰기: %v", err)
	}
}

// 하루 20개 상한 — 같은 코치·회원의 동시 요청 30개도 20개만 들어간다(관계 FOR UPDATE 가 줄 세운다 · 리뷰).
func TestComments_Postgres_하루상한_동시_요청(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	svc := pgV2Svc(pool)
	syncSvc := syncdomain.NewService(syncdomain.NewRepo(pool, uuid.NewString), uuid.NewString)
	u := pgUsers(t, pool, "cc", 2)
	member, trainer := u[0], u[1]
	g, err := svc.RequestCoaching(ctx, member, RequestInput{TrainerID: trainer})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Accept(ctx, trainer, g.ID); err != nil {
		t.Fatal(err)
	}
	at := time.Now().Add(time.Minute).UnixMilli()
	if err := syncSvc.Push(ctx, member, map[string]syncdomain.TableChanges{"workouts": {Created: []string{
		fmt.Sprintf(`{"id":"w1","state":"completed","started_at":%d,"updated_at":1}`, at),
	}}}); err != nil {
		t.Fatal(err)
	}
	const n = 30
	var wg sync.WaitGroup
	var mu sync.Mutex
	ok, capped := 0, 0
	start := make(chan struct{})
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			_, err := svc.AddComment(ctx, trainer, member, "w1", fmt.Sprintf("코멘트 %d", i))
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				ok++
			case codeOf(t, err) == errs.ResourceExhausted:
				capped++
			default:
				t.Errorf("예상 밖 오류: %v", err)
			}
		}(i)
	}
	close(start)
	wg.Wait()
	if ok != maxCommentsPerDay || capped != n-maxCommentsPerDay {
		t.Fatalf("성공 %d · 상한 %d (want %d · %d)", ok, capped, maxCommentsPerDay, n-maxCommentsPerDay)
	}
	if got := pgCount(t, pool, `SELECT count(*) FROM coaching_comments WHERE trainer_id=$1 AND member_id=$2`, trainer, member); got != maxCommentsPerDay {
		t.Fatalf("DB 행 %d", got)
	}
}

// 코치가 탈퇴해도 회원이 받은 코멘트는 남는다(0035 · trainer_id·grant_id SET NULL) · 회원이 탈퇴하면 함께 지운다.
func TestComments_Postgres_코치_탈퇴해도_회원_코멘트는_남는다(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	svc := pgV2Svc(pool)
	syncSvc := syncdomain.NewService(syncdomain.NewRepo(pool, uuid.NewString), uuid.NewString)
	u := pgUsers(t, pool, "cd", 4)
	member, trainer, member2, trainer2 := u[0], u[1], u[2], u[3]
	at := time.Now().Add(time.Minute).UnixMilli()
	pair := func(m, tr string) string {
		t.Helper()
		g, err := svc.RequestCoaching(ctx, m, RequestInput{TrainerID: tr})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := svc.Accept(ctx, tr, g.ID); err != nil {
			t.Fatal(err)
		}
		if err := syncSvc.Push(ctx, m, map[string]syncdomain.TableChanges{"workouts": {Created: []string{
			fmt.Sprintf(`{"id":"w1","state":"completed","started_at":%d,"updated_at":1}`, at),
		}}}); err != nil {
			t.Fatal(err)
		}
		c, err := svc.AddComment(ctx, tr, m, "w1", "잘했어요")
		if err != nil {
			t.Fatal(err)
		}
		return c.ID
	}
	cid := pair(member, trainer)
	cid2 := pair(member2, trainer2)

	acct := auth.NewAccountRepo(auth.NewRepo(pool))
	if ok, _, err := acct.DeleteUserAccount(ctx, trainer); err != nil || !ok {
		t.Fatalf("코치 탈퇴: %v %v", ok, err)
	}
	got, err := svc.ListComments(ctx, member, "", "w1")
	if err != nil || len(got) != 1 || got[0].ID != cid || got[0].TrainerID != "" || got[0].TrainerName != "" || got[0].Body != "잘했어요" {
		t.Fatalf("코치 탈퇴 뒤 회원 목록(코치 빈 칸 = 「탈퇴한 코치」): %+v %v", got, err)
	}
	// 회원은 여전히 숨길 수 있다(관계가 없어 감사는 남기지 않는다)
	if err := svc.HideComment(ctx, member, cid); err != nil {
		t.Fatalf("탈퇴한 코치 코멘트 숨기기: %v", err)
	}
	if got, _ := svc.ListComments(ctx, member, "", "w1"); len(got) != 0 {
		t.Fatalf("숨긴 뒤: %+v", got)
	}

	// 회원 탈퇴 → 그 회원의 코멘트는 지운다(CASCADE 그대로)
	if ok, _, err := acct.DeleteUserAccount(ctx, member2); err != nil || !ok {
		t.Fatalf("회원 탈퇴: %v %v", ok, err)
	}
	if n := pgCount(t, pool, `SELECT count(*) FROM coaching_comments WHERE id=$1`, cid2); n != 0 {
		t.Fatalf("회원 탈퇴 뒤 코멘트 %d", n)
	}
}
