// @plm SRS-080  /qa code R1 조치의 실제 Postgres 확인(선택) — LIFTGRAM_TEST_DATABASE_URL 이 있을 때만
//
// 가짜 저장소가 못 보는 것: jsonb 숫자 펼침(왜 막는지) · jsonb 동등 재전송 비교 · 하루 상한 잠금(동시 25건 → 20건) ·
// 기간·부모 id SQL 필터(글자 started_at·옛 큰 숫자 행에도 캐스트 오류 없음) · 감사 합치기 SQL · 차단 회수.
// 마이그레이션이 끝난 **빈 스크래치 DB**여야 한다(행을 만들고 지운다). 운영·개발 DB 금지.
package coaching

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	gosync "sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/dm"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
	"github.com/JWK-company/liftgram/src/backend/internal/notification"
	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

type pgPair struct {
	pool            *pgxpool.Pool
	svc             *Service
	member, trainer string
	grantID         string
}

func newPGPair(t *testing.T) pgPair {
	t.Helper()
	pool := testpg.Pool(t)
	ctx := context.Background()
	member, trainer := "qa-m-"+uuid.NewString()[:8], "qa-t-"+uuid.NewString()[:8]
	for _, u := range []string{member, trainer} {
		if _, err := pool.Exec(ctx, `INSERT INTO users (id, display_name, trainer_intent) VALUES ($1, $1, true)`, u); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = ANY($1)`, []string{member, trainer})
	})
	dmSvc := dm.NewService(dm.NewRepo(pool), nil, nil, uuid.NewString)
	notifSvc := notification.NewService(notification.NewRepo(pool), uuid.NewString)
	svc := NewService(NewRepo(pool), uuid.NewString, time.Now).WithSummaryDelivery(dmSvc, pgNotify{notifSvc})
	g, err := svc.Request(ctx, member, trainer, "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Accept(ctx, trainer, g.ID); err != nil {
		t.Fatal(err)
	}
	return pgPair{pool: pool, svc: svc, member: member, trainer: trainer, grantID: g.ID}
}

func (p pgPair) count(t *testing.T, q string, args ...any) int {
	t.Helper()
	var n int
	if err := p.pool.QueryRow(context.Background(), q, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func pgInput(p pgPair, snap string) SendSummaryInput {
	now := time.Now()
	return SendSummaryInput{
		TrainerID: p.trainer, PeriodStartMs: now.Add(-28 * day).UnixMilli(), PeriodEndMs: now.UnixMilli(),
		SchemaVersion: 1, SnapshotJSON: snap, ClientID: uuid.NewString(),
	}
}

// CS-1·CS-2 — 왜 막는지(PG 가 숫자를 펼친다)를 가볍게 재현하고, 서비스는 저장 전에 Validation 으로 끊는다.
func TestQA_Postgres_큰_숫자_펼침과_서로게이트(t *testing.T) {
	p := newPGPair(t)
	ctx := context.Background()

	// 재현(가벼운 판): 15바이트 입력이 jsonb → 글에서 10만 자가 된다. 64KB 에 7천 개면 ~910MB(보고서 실측).
	var stored, text int
	if err := p.pool.QueryRow(ctx, `SELECT pg_column_size('{"a":1e100000}'::jsonb), length('{"a":1e100000}'::jsonb::text)`).
		Scan(&stored, &text); err != nil {
		t.Fatal(err)
	}
	if stored > 64 || text < 100_000 {
		t.Fatalf("PG 펼침 재현: 저장 %dB · 글 %d자", stored, text)
	}

	for name, snap := range map[string]string{
		"1e130000":   `{"schemaVersion":1,"x":1e130000}`,
		"0e-99999":   `{"schemaVersion":1,"x":0e-99999}`,
		"\\ud800":    `{"schemaVersion":1,"x":"\ud800"}`,
		"1e20(값 상한)": `{"schemaVersion":1,"x":1e20}`,
	} {
		_, err := p.svc.SendProgressSummary(ctx, p.member, pgInput(p, snap))
		if codeOf(t, err) != errs.Validation {
			t.Fatalf("%s: Internal(PG 오류)이 아니라 Validation 이어야 한다: %v", name, err)
		}
	}
	if n := p.count(t, `SELECT count(*) FROM progress_summaries WHERE member_id=$1`, p.member); n != 0 {
		t.Fatalf("저장되면 안 된다: %d", n)
	}

	// 재전송 비교는 SQL jsonb 동등 — 키 순서·공백·1.0/1 이 달라도 같은 요약, 값이 다르면 Conflict.
	in := pgInput(p, `{"schemaVersion":1,"a":{"x":1.0,"y":[1,2]},"b":"가"}`)
	id, err := p.svc.SendProgressSummary(ctx, p.member, in)
	if err != nil {
		t.Fatal(err)
	}
	same := in
	same.SnapshotJSON = `{ "b":"가", "a":{"y":[1,2],"x":1}, "schemaVersion":1 }`
	if again, err := p.svc.SendProgressSummary(ctx, p.member, same); err != nil || again != id {
		t.Fatalf("같은 내용 재전송 → 같은 id: %s %v", again, err)
	}
	diff := in
	diff.SnapshotJSON = `{"schemaVersion":1,"a":{"x":2,"y":[1,2]},"b":"가"}`
	if _, err := p.svc.SendProgressSummary(ctx, p.member, diff); codeOf(t, err) != errs.Conflict {
		t.Fatalf("다른 내용은 Conflict: %v", err)
	}
}

// CS-5 — client_id 만 다른 동시 25건 → 정확히 20건만 들어가고 나머지는 ResourceExhausted.
func TestQA_Postgres_하루_상한_동시_요청(t *testing.T) {
	p := newPGPair(t)
	ctx := context.Background()
	const n = 25
	var wg gosync.WaitGroup
	errsOut := make([]error, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, errsOut[i] = p.svc.SendProgressSummary(ctx, p.member, pgInput(p, `{"schemaVersion":1}`))
		}(i)
	}
	wg.Wait()
	ok, capped := 0, 0
	for _, err := range errsOut {
		switch {
		case err == nil:
			ok++
		case codeOf(t, err) == errs.ResourceExhausted:
			capped++
		default:
			t.Fatalf("예상 밖 오류: %v", err)
		}
	}
	rows := p.count(t, `SELECT count(*) FROM progress_summaries WHERE member_id=$1`, p.member)
	msgs := p.count(t, `SELECT count(*) FROM messages WHERE kind='summary' AND sender_id=$1`, p.member)
	if ok != maxSummariesPerDay || capped != n-maxSummariesPerDay || rows != maxSummariesPerDay || msgs != maxSummariesPerDay {
		t.Fatalf("성공 %d · 상한 %d · 행 %d · 메시지 %d (20·5·20·20 이어야)", ok, capped, rows, msgs)
	}
}

// CS-4·CS-3·CS-7 — 기간·부모 SQL 필터, 차단 회수, 감사 합치기.
func TestQA_Postgres_원본_레코드_SQL_필터_차단_감사(t *testing.T) {
	p := newPGPair(t)
	ctx := context.Background()
	now := time.Now()
	in, prev, old := now.Add(-3*day).UnixMilli(), now.Add(-40*day).UnixMilli(), now.Add(-90*day).UnixMilli()
	put := func(collection, id, payload string) {
		t.Helper()
		if _, err := p.pool.Exec(ctx,
			`INSERT INTO sync_records (id, user_id, collection, record_id, payload) VALUES ($1, $2, $3, $4, $5::jsonb)`,
			uuid.NewString(), p.member, collection, id, payload); err != nil {
			t.Fatal(err)
		}
	}
	js := func(m map[string]any) string { b, _ := json.Marshal(m); return string(b) }
	put("workouts", "w1", js(map[string]any{"id": "w1", "state": "completed", "started_at": in, "notes": "비밀"}))
	put("workouts", "w2", js(map[string]any{"id": "w2", "state": "completed", "started_at": prev}))
	put("workouts", "w3", js(map[string]any{"id": "w3", "state": "in_progress", "started_at": in}))
	put("workouts", "w4", js(map[string]any{"id": "w4", "state": "completed", "started_at": old}))
	put("workouts", "w5", js(map[string]any{"id": "w5", "state": "completed", "started_at": "어제"})) // 글자 — 캐스트 오류 없이 빠진다
	put("workouts", "w6", `{"id":"w6","state":"completed","started_at":1e130000}`)                  // 옛 큰 숫자 — 펼치지 않고 빠진다
	put("workout_exercises", "we1", js(map[string]any{"id": "we1", "workout_id": "w1", "exercise_id": "cx1"}))
	put("workout_exercises", "we2", js(map[string]any{"id": "we2", "workout_id": "w2", "exercise_id": "seed-bench"}))
	put("workout_exercises", "we4", js(map[string]any{"id": "we4", "workout_id": "w4", "exercise_id": "cx4"}))
	put("workout_exercises", "we9", js(map[string]any{"id": "we9", "workout_id": 1})) // 숫자 부모 id — 빠진다
	put("set_logs", "s1", js(map[string]any{"id": "s1", "workout_exercise_id": "we1", "reps": 10}))
	put("set_logs", "s2", js(map[string]any{"id": "s2", "workout_exercise_id": "we2", "reps": 5}))
	put("set_logs", "s4", js(map[string]any{"id": "s4", "workout_exercise_id": "we4", "reps": 1}))
	put("exercises", "cx1", js(map[string]any{"id": "cx1", "name_ko": "내 종목", "is_custom": true}))
	put("exercises", "cx4", js(map[string]any{"id": "cx4", "name_ko": "옛 종목", "is_custom": true}))
	put("bodyweight_logs", "bw1", js(map[string]any{"id": "bw1", "weight_kg": 80, "measured_at": in}))
	// 지운 세트는 나가지 않는다.
	if _, err := p.pool.Exec(ctx,
		`INSERT INTO sync_records (id, user_id, collection, record_id, payload, deleted) VALUES ($1, $2, 'set_logs', 's1x', $3::jsonb, true)`,
		uuid.NewString(), p.member, js(map[string]any{"id": "s1x", "workout_exercise_id": "we1"})); err != nil {
		t.Fatal(err)
	}

	start, end := now.Add(-28*day).UnixMilli(), now.UnixMilli()

	// 저장소 단계에서 이미 걸러졌는지(Go 필터가 한 번 더 거르므로 서비스 결과만 보면 SQL 필터가 빠져도 모른다).
	repo := NewRepo(p.pool)
	servedFrom := now.Add(-56 * day).UnixMilli()
	recIDs := func(recs []MemberRecord, err error) []string {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		return recordIDs(recs)
	}
	if g := recIDs(repo.ListMemberWorkoutsStartedIn(ctx, p.member, servedFrom, end, newReadBudget(1<<20))); !slices.Equal(g, []string{"w1", "w2"}) {
		t.Fatalf("SQL 운동 필터: %v", g)
	}
	if g := recIDs(repo.ListMemberRecordsByParent(ctx, p.member, "workout_exercises", "workout_id", []string{"w1", "w2"}, newReadBudget(1<<20))); !slices.Equal(g, []string{"we1", "we2"}) {
		t.Fatalf("SQL 블록 필터: %v", g)
	}
	if g := recIDs(repo.ListMemberRecordsByParent(ctx, p.member, "set_logs", "workout_exercise_id", []string{"we1"}, newReadBudget(1<<20))); !slices.Equal(g, []string{"s1"}) {
		t.Fatalf("SQL 세트 필터(지운 것 제외): %v", g)
	}
	if g := recIDs(repo.ListMemberRecordsByIDs(ctx, p.member, "exercises", []string{"cx1", "seed-bench"}, newReadBudget(1<<20))); !slices.Equal(g, []string{"cx1"}) {
		t.Fatalf("SQL 종목 필터: %v", g)
	}
	// 읽기 예산을 넘으면 저장소가 멈춘다.
	if _, err := repo.ListMemberWorkoutsStartedIn(ctx, p.member, servedFrom, end, newReadBudget(10)); codeOf(t, err) != errs.ResourceExhausted {
		t.Fatalf("예산 초과 ResourceExhausted: %v", err)
	}

	r, err := p.svc.GetMemberRecords(ctx, p.trainer, p.member, start, end)
	if err != nil {
		t.Fatal(err)
	}
	got := func(list []string) []string {
		var out []string
		for _, s := range list {
			var m map[string]any
			_ = json.Unmarshal([]byte(s), &m)
			out = append(out, m["id"].(string))
		}
		return out
	}
	if g := got(r.Workouts); !slices.Equal(g, []string{"w1", "w2"}) {
		t.Fatalf("운동: %v", g)
	}
	if g := got(r.WorkoutExercises); !slices.Equal(g, []string{"we1", "we2"}) {
		t.Fatalf("블록: %v", g)
	}
	if g := got(r.SetLogs); !slices.Equal(g, []string{"s1", "s2"}) {
		t.Fatalf("세트: %v", g)
	}
	if g := got(r.Exercises); !slices.Equal(g, []string{"cx1"}) {
		t.Fatalf("종목: %v", g)
	}
	if all := strings.Join(r.Workouts, ""); strings.Contains(all, "비밀") {
		t.Fatal("허용 밖 칸")
	}

	// 감사 합치기 — 원본 5번 열어도 records_view 1건, 같은 요약 3번 열어도 summary_view 1건.
	for i := 0; i < 4; i++ {
		if _, err := p.svc.GetMemberRecords(ctx, p.trainer, p.member, start-int64(i), end); err != nil {
			t.Fatal(err)
		}
	}
	sid, err := p.svc.SendProgressSummary(ctx, p.member, pgInput(p, `{"schemaVersion":1}`))
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if _, err := p.svc.GetProgressSummary(ctx, p.trainer, sid); err != nil {
			t.Fatal(err)
		}
	}
	if n := p.count(t, `SELECT count(*) FROM coaching_audits WHERE grant_id=$1 AND action='records_view'`, p.grantID); n != 1 {
		t.Fatalf("records_view 1건: %d", n)
	}
	if n := p.count(t, `SELECT count(*) FROM coaching_audits WHERE grant_id=$1 AND action='summary_view'`, p.grantID); n != 1 {
		t.Fatalf("summary_view 1건: %d", n)
	}

	// 회원이 트레이너를 차단 → 요약·원본 모두 Forbidden(grant 는 active 그대로).
	if _, err := p.pool.Exec(ctx, `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)`, p.member, p.trainer); err != nil {
		t.Fatal(err)
	}
	if _, err := p.svc.GetProgressSummary(ctx, p.trainer, sid); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("차단 뒤 요약 Forbidden: %v", err)
	}
	if _, err := p.svc.GetMemberRecords(ctx, p.trainer, p.member, start, end); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("차단 뒤 원본 Forbidden: %v", err)
	}

	// 키셋 페이지(500개씩)가 빠짐·겹침 없이 끝까지 읽는다 — 세트 1,200개 + s1.
	if _, err := p.pool.Exec(ctx, `
		INSERT INTO sync_records (id, user_id, collection, record_id, payload)
		SELECT gen_random_uuid()::text, $1, 'set_logs', 'p' || lpad(i::text, 5, '0'),
		       jsonb_build_object('id', 'p' || lpad(i::text, 5, '0'), 'workout_exercise_id', 'we1', 'reps', i)
		FROM generate_series(1, 1200) i`, p.member); err != nil {
		t.Fatal(err)
	}
	all := recIDs(repo.ListMemberRecordsByParent(ctx, p.member, "set_logs", "workout_exercise_id", []string{"we1"}, newReadBudget(16<<20)))
	uniq := map[string]bool{}
	for _, id := range all {
		uniq[id] = true
	}
	if len(all) != 1201 || len(uniq) != 1201 || !slices.IsSorted(all) {
		t.Fatalf("페이지 읽기: %d개 · 고유 %d", len(all), len(uniq))
	}
}
