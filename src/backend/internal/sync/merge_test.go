// @plm SRS-073 SRS-077 SRS-081  v25 기기가 올려도 v26 칸이 지워지지 않는다 — 얕은 병합 회귀 (D-17)
//
// 로컬 스키마 v26 이 set_logs.rir · workouts.source·import_batch_id · exercises.import_batch_id 를 더했다.
// 아직 v25 번들을 쓰는 기기(옛 탭·서비스워커가 붙든 셸)는 이 칸을 **모른다** — 같은 세트를 고쳐 올리면
// 그 레코드에는 키가 아예 없다. 서버 upsert 가 `sync_records.payload || EXCLUDED.payload`(최상위 얕은 병합)라
// 보낸 쪽이 모르는 키는 남는다. 이 파일은 그 전제 셋을 고정한다:
//
//	① service 의 parseRecord 가 없는 키를 만들어 넣지 않는다(null 로 채우면 병합이 그 칸을 지운다)
//	② SQL 이 여전히 얕은 병합이다(누가 `payload = EXCLUDED.payload`로 바꾸면 여기서 깨진다)
//	③ 얕은 병합의 결과가 v26 칸을 보존한다(Postgres `||`의 최상위 규칙을 그대로 흉내 — DB 가 있으면 실제로도 본다)
package sync

import (
	"context"
	"encoding/json"
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// v26 기기가 올려 둔 세트(서버에 저장된 모양).
const storedV26 = `{"id":"s1","workout_exercise_id":"we1","set_number":1,"weight_kg":60,"reps":8,` +
	`"rir":2,"source":"strong","import_batch_id":"ib-1","done":true,"updated_at":100}`

// v25 기기가 같은 세트의 횟수를 고쳐 올린 것 — v26 칸을 모른다(키 자체가 없다).
const pushedV25 = `{"id":"s1","workout_exercise_id":"we1","set_number":1,"weight_kg":60,"reps":10,` +
	`"done":true,"updated_at":200,"_status":"updated","_changed":"reps"}`

// jsonbConcat은 Postgres `jsonb || jsonb`(둘 다 객체일 때)의 규칙이다: 최상위 키만 합치고, 같은 키는 오른쪽이 이긴다.
func jsonbConcat(t *testing.T, left, right []byte) map[string]json.RawMessage {
	t.Helper()
	var l, r map[string]json.RawMessage
	if err := json.Unmarshal(left, &l); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(right, &r); err != nil {
		t.Fatal(err)
	}
	for k, v := range r {
		l[k] = v
	}
	return l
}

func assertV26Kept(t *testing.T, merged map[string]json.RawMessage) {
	t.Helper()
	for k, want := range map[string]string{"rir": "2", "source": `"strong"`, "import_batch_id": `"ib-1"`, "reps": "10"} {
		if got := strings.TrimSpace(string(merged[k])); got != want {
			t.Errorf("%s = %s, want %s (병합 결과 %v)", k, got, want, merged)
		}
	}
}

func TestPush_v25_기기가_올려도_v26_칸은_남는다(t *testing.T) {
	// ① service 가 받은 레코드에 없는 키를 만들지 않는다.
	id, cleaned, err := parseRecord(pushedV25)
	if err != nil || id != "s1" {
		t.Fatalf("parseRecord: %s %v", id, err)
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(cleaned, &obj); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"rir", "source", "import_batch_id", "_status", "_changed"} {
		if _, ok := obj[k]; ok {
			t.Fatalf("%s 가 들어가면 안 된다(null 이면 병합이 그 칸을 지운다): %s", k, cleaned)
		}
	}

	// ③ 얕은 병합 결과 — v26 칸은 남고 고친 칸(reps)은 바뀐다.
	assertV26Kept(t, jsonbConcat(t, []byte(storedV26), cleaned))

	// 같은 흐름이 Push 전체를 지나도 저장소에 넘어가는 payload 는 같다.
	repo := &fakeRepo{}
	if err := newSvc(repo).Push(context.Background(), "u1", map[string]TableChanges{
		"set_logs": {Updated: []string{pushedV25}},
	}); err != nil {
		t.Fatal(err)
	}
	if len(repo.upserted) != 1 {
		t.Fatalf("한 건이 반영돼야 한다: %d", len(repo.upserted))
	}
	assertV26Kept(t, jsonbConcat(t, []byte(storedV26), repo.upserted[0].Payload))
}

// ② SQL 이 얕은 병합인지 — 원본(queries)과 생성물(sqlcgen) 둘 다.
func TestUpsertSQL_은_얕은_병합이다(t *testing.T) {
	merge := regexp.MustCompile(`SET\s+payload\s*=\s*sync_records\.payload\s*\|\|\s*EXCLUDED\.payload`)
	for _, path := range []string{"../../../database/queries/sync.sql", "../db/sqlcgen/sync.sql.go"} {
		b, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		if !merge.Match(b) {
			t.Fatalf("%s 의 upsert 가 얕은 병합(payload || EXCLUDED.payload)이 아니다 — v25 기기가 v26 칸을 지운다", path)
		}
	}
}

// ③ 실제 Postgres 로도 본다(선택) — LIFTGRAM_TEST_DATABASE_URL 이 있을 때만. 읽기 전용 SELECT 하나다.
func TestJsonbConcat_실제_Postgres(t *testing.T) {
	url := os.Getenv("LIFTGRAM_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("LIFTGRAM_TEST_DATABASE_URL 없음 — Go 흉내로만 확인")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	_, cleaned, err := parseRecord(pushedV25)
	if err != nil {
		t.Fatal(err)
	}
	var merged []byte
	if err := pool.QueryRow(ctx, `SELECT ($1::jsonb || $2::jsonb)::text`, storedV26, string(cleaned)).Scan(&merged); err != nil {
		t.Fatal(err)
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(merged, &obj); err != nil {
		t.Fatal(err)
	}
	assertV26Kept(t, obj)
}
