// @plm SRS-006 SRS-081 SRS-082  나눠 보내기 멱등 · 삭제 뒤 되살림 · 옛 기기 병합 — 서버 동기의 성질 고정
//
// 클라이언트는 5000건 상한(maxRecordsPerPush) 때문에 큰 변화분을 ≤2000건씩 순서대로 나눠 보낸다
// (frontend/lib/syncTransport.ts · core/src/sync/pushChunks.ts). 중간 묶음이 실패하면 WatermelonDB 는
// 아무것도 synced 로 표시하지 않아 **다음 회차에 전부 다시 보낸다**. 이게 안전하려면 서버가 다음을 지켜야 한다:
//
//	① 같은 변화분을 ㉠ 한 번에 ㉡ 2000건씩 나눠 ㉢ 중간 묶음 실패 뒤 전체 재전송 — 셋의 최종 sync_records
//	   (행·payload·deleted)가 같다. 실패한 묶음은 한 트랜잭션이라 절반도 남지 않는다.
//	② 삭제 표시 뒤 같은 record_id 를 다시 올리면 되살아난다(deleted=false) — 다른 기기 재가져오기(D-2)가 기댄다.
//	   payload 는 얕은 병합이라 삭제 전 키도 남는다(삭제 표시가 payload 를 비우지 않는다).
//	③ v25 기기가 v26 칸(rir·source·import_batch_id)을 모른 채 같은 세트를 올려도 그 칸이 남는다(D-17) —
//	   merge_test.go 가 parseRecord·SQL 문구·jsonb `||` 를 따로 본다면, 여기는 Push→저장소 전체 경로로 본다.
//
// 같은 시나리오를 두 저장소에 돌린다: memRepo(sync.sql 의 upsert·삭제 표시 규칙을 그대로 흉내 · 항상 돎)와
// 실제 pgRepo(LIFTGRAM_TEST_DATABASE_URL 이 있을 때만 — internal/testpg).
package sync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

// 클라이언트 PUSH_CHUNK_MAX 와 같은 값(core/src/sync/pushChunks.ts).
const clientChunkMax = 2000

// ── 저장소 둘 ────────────────────────────────────────────────────────────────

type memRow struct {
	payload map[string]json.RawMessage
	deleted bool
}

// memRepo는 sync.sql 의 UpsertSyncRecords·MarkSyncDeleted 규칙을 흉내 낸다:
// upsert = 있으면 `payload || EXCLUDED.payload`·deleted=false, 없으면 새 행 / 삭제 = 있으면 deleted=true(payload 그대로),
// 없으면 payload `{}` 로 새 행. Apply 는 사본에 쓰고 끝까지 가야 바꿔 낀다(트랜잭션 흉내).
type memRepo struct{ rows map[string]*memRow }

func newMemRepo() *memRepo { return &memRepo{rows: map[string]*memRow{}} }

func memKey(user, coll, id string) string { return user + "\x1f" + coll + "\x1f" + id }

func (m *memRepo) apply(user string, upserts, deletes []Record) error {
	next := make(map[string]*memRow, len(m.rows))
	for k, v := range m.rows {
		p := make(map[string]json.RawMessage, len(v.payload))
		for pk, pv := range v.payload {
			p[pk] = pv
		}
		next[k] = &memRow{payload: p, deleted: v.deleted}
	}
	for _, r := range upserts {
		var obj map[string]json.RawMessage
		if err := json.Unmarshal(r.Payload, &obj); err != nil {
			return err
		}
		k := memKey(user, r.Collection, r.RecordID)
		if row, ok := next[k]; ok {
			for pk, pv := range obj {
				row.payload[pk] = pv
			}
			row.deleted = false
		} else {
			next[k] = &memRow{payload: obj}
		}
	}
	for _, r := range deletes {
		// Postgres text 는 NUL 을 담지 못한다 — 실제 DB 와 같은 자리(두 번째 문장)에서 실패한다.
		if strings.ContainsRune(r.RecordID, 0) {
			return errors.New("invalid byte sequence for encoding \"UTF8\": 0x00")
		}
		k := memKey(user, r.Collection, r.RecordID)
		if row, ok := next[k]; ok {
			row.deleted = true
		} else {
			next[k] = &memRow{payload: map[string]json.RawMessage{}, deleted: true}
		}
	}
	m.rows = next
	return nil
}

func (m *memRepo) snapshot(user string) []string {
	var out []string
	prefix := user + "\x1f"
	for k, v := range m.rows {
		if !strings.HasPrefix(k, prefix) {
			continue
		}
		parts := strings.SplitN(strings.TrimPrefix(k, prefix), "\x1f", 2)
		b, _ := json.Marshal(v.payload)
		out = append(out, snapLine(parts[0], parts[1], v.deleted, b))
	}
	sort.Strings(out)
	return out
}

// memRepo 를 사용자 하나에 묶어 Repo 로 쓴다.
type memUserRepo struct {
	m *memRepo
}

func (r memUserRepo) Now(context.Context) (time.Time, error) { return time.UnixMilli(1_000_000), nil }
func (r memUserRepo) List(_ context.Context, userID string, _, _ time.Time) ([]Record, error) {
	var out []Record
	prefix := userID + "\x1f"
	for k, v := range r.m.rows {
		if !strings.HasPrefix(k, prefix) {
			continue
		}
		parts := strings.SplitN(strings.TrimPrefix(k, prefix), "\x1f", 2)
		b, _ := json.Marshal(v.payload)
		out = append(out, Record{Collection: parts[0], RecordID: parts[1], Payload: b, Deleted: v.deleted})
	}
	return out, nil
}
func (r memUserRepo) Apply(_ context.Context, userID string, upserts, deletes []Record) error {
	return r.m.apply(userID, upserts, deletes)
}

// snapLine은 한 행을 비교 가능한 한 줄로 만든다. payload 는 키 순서·공백을 정규화한다(jsonb::text 와 Go Marshal 이 다르다).
func snapLine(coll, id string, deleted bool, payload []byte) string {
	var v any
	if err := json.Unmarshal(payload, &v); err != nil {
		return fmt.Sprintf("%s|%s|%v|<깨짐 %s>", coll, id, deleted, payload)
	}
	b, _ := json.Marshal(v)
	return fmt.Sprintf("%s|%s|%v|%s", coll, id, deleted, b)
}

// faultRepo는 failAt 번째 Apply 에 **두 번째 문장(삭제 표시)에서 실패할 레코드**를 끼운다 —
// upsert 문장은 이미 실행된 뒤라, 트랜잭션이 정말로 통째로 되돌아가는지를 본다.
type faultRepo struct {
	Repo
	failAt int
	calls  int
}

var errInjected = errors.New("주입한 실패")

func (f *faultRepo) Apply(ctx context.Context, userID string, upserts, deletes []Record) error {
	f.calls++
	if f.calls != f.failAt {
		return f.Repo.Apply(ctx, userID, upserts, deletes)
	}
	poisoned := append(append([]Record{}, deletes...), Record{Collection: "workouts", RecordID: "poison\x00", Deleted: true})
	if err := f.Repo.Apply(ctx, userID, upserts, poisoned); err != nil {
		return errors.Join(errInjected, err)
	}
	return errors.New("독이 든 묶음이 반영됐다 — 실패를 주입하지 못했다")
}

// harness는 한 저장소 종류다: 사용자별 Repo 와 그 사용자의 sync_records 스냅숏.
type harness struct {
	repo     func(t *testing.T, user string) Repo
	snapshot func(t *testing.T, user string) []string
	newUser  func(t *testing.T) string
}

func memHarness() harness {
	m := newMemRepo()
	n := 0
	return harness{
		repo:     func(*testing.T, string) Repo { return memUserRepo{m} },
		snapshot: func(_ *testing.T, user string) []string { return m.snapshot(user) },
		newUser: func(*testing.T) string {
			n++
			return fmt.Sprintf("mem-u%d", n)
		},
	}
}

func pgHarness(t *testing.T) harness {
	pool := testpg.Pool(t)
	return harness{
		repo: func(*testing.T, string) Repo { return NewRepo(pool, uuid.NewString) },
		snapshot: func(t *testing.T, user string) []string {
			return pgSnapshot(t, pool, user)
		},
		newUser: func(t *testing.T) string {
			ctx := context.Background()
			u := "it-sync-" + uuid.NewString()[:8]
			if _, err := pool.Exec(ctx, `INSERT INTO users (id, display_name) VALUES ($1, $1)`, u); err != nil {
				t.Fatal(err)
			}
			// sync_records 는 ON DELETE CASCADE 로 같이 지워진다.
			t.Cleanup(func() { _, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, u) })
			return u
		},
	}
}

func pgSnapshot(t *testing.T, pool *pgxpool.Pool, user string) []string {
	t.Helper()
	rows, err := pool.Query(context.Background(),
		`SELECT collection, record_id, deleted, payload::text FROM sync_records WHERE user_id = $1`, user)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var coll, id, payload string
		var deleted bool
		if err := rows.Scan(&coll, &id, &deleted, &payload); err != nil {
			t.Fatal(err)
		}
		out = append(out, snapLine(coll, id, deleted, []byte(payload)))
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	sort.Strings(out)
	return out
}

func eachHarness(t *testing.T, run func(t *testing.T, h harness)) {
	t.Run("가짜_저장소", func(t *testing.T) { run(t, memHarness()) })
	t.Run("실제_Postgres", func(t *testing.T) { run(t, pgHarness(t)) })
}

// ── 변화분 · 나누기 ──────────────────────────────────────────────────────────

type namedChanges struct {
	table string
	TableChanges
}

func toMap(list []namedChanges) map[string]TableChanges {
	out := make(map[string]TableChanges, len(list))
	for _, c := range list {
		out[c.table] = c.TableChanges
	}
	return out
}

// splitOrdered는 core splitSyncChanges 와 같은 규칙이다: 컬렉션 순서 → created → updated → deleted, ≤max 건씩.
func splitOrdered(list []namedChanges, max int) []map[string]TableChanges {
	var out []map[string]TableChanges
	cur := map[string]TableChanges{}
	room := max
	for _, c := range list {
		for kind := 0; kind < 3; kind++ {
			src := [][]string{c.Created, c.Updated, c.Deleted}[kind]
			for i := 0; i < len(src); {
				if room == 0 {
					out = append(out, cur)
					cur, room = map[string]TableChanges{}, max
				}
				take := min(room, len(src)-i)
				t := cur[c.table]
				part := append([]string{}, src[i:i+take]...)
				switch kind {
				case 0:
					t.Created = append(t.Created, part...)
				case 1:
					t.Updated = append(t.Updated, part...)
				default:
					t.Deleted = append(t.Deleted, part...)
				}
				cur[c.table] = t
				i += take
				room -= take
			}
		}
	}
	if len(cur) > 0 {
		out = append(out, cur)
	}
	return out
}

// 기존 서버 상태: v26 칸이 있는 세트 100건 · 곧 지울 운동 300건.
func seedChanges() map[string]TableChanges {
	var sets, workouts []string
	for i := 0; i < 100; i++ {
		sets = append(sets, fmt.Sprintf(`{"id":"s%d","reps":8,"rir":2,"source":"strong","import_batch_id":"ib-1"}`, i))
	}
	for i := 0; i < 300; i++ {
		workouts = append(workouts, fmt.Sprintf(`{"id":"w%d","state":"completed"}`, i))
	}
	return map[string]TableChanges{"set_logs": {Updated: sets}, "workouts": {Updated: workouts}}
}

// 큰 변화분 4800건 — 2000건씩 나누면 3묶음이고, 가운데 묶음에 올리기와 지우기가 함께 든다.
//
//	1묶음: set_logs 2000 · 2묶음: set_logs 500 + workouts 올리기 200·지우기 300 + exercises 1000 · 3묶음: exercises 800
func bigChanges() []namedChanges {
	var sets, newWorkouts, delWorkouts, exercises []string
	for i := 0; i < 2500; i++ {
		// s0..s99 는 이미 있다 — v26 칸 없이 올라오므로 얕은 병합으로 rir 등이 남아야 한다.
		sets = append(sets, fmt.Sprintf(`{"id":"s%d","reps":%d,"_status":"updated"}`, i, 10+i%5))
	}
	for i := 300; i < 500; i++ {
		newWorkouts = append(newWorkouts, fmt.Sprintf(`{"id":"w%d","state":"in_progress"}`, i))
	}
	for i := 0; i < 300; i++ {
		delWorkouts = append(delWorkouts, fmt.Sprintf("w%d", i))
	}
	for i := 0; i < 1800; i++ {
		exercises = append(exercises, fmt.Sprintf(`{"id":"e%d","name_ko":"종목%d"}`, i, i))
	}
	return []namedChanges{
		{"set_logs", TableChanges{Updated: sets}},
		{"workouts", TableChanges{Updated: newWorkouts, Deleted: delWorkouts}},
		{"exercises", TableChanges{Created: exercises}},
	}
}

func push(t *testing.T, repo Repo, user string, changes map[string]TableChanges) error {
	t.Helper()
	return NewService(repo, uuid.NewString).Push(context.Background(), user, changes)
}

func mustPush(t *testing.T, repo Repo, user string, changes map[string]TableChanges) {
	t.Helper()
	if err := push(t, repo, user, changes); err != nil {
		t.Fatal(err)
	}
}

func sameSnapshot(t *testing.T, label string, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s: 행 수 %d, 기대 %d", label, len(got), len(want))
	}
	for i := range got {
		if got[i] != want[i] {
			t.Fatalf("%s: %d번째 행이 다르다\n  got  %s\n  want %s", label, i, got[i], want[i])
		}
	}
}

// ── ① 나눠 보내기 멱등 ───────────────────────────────────────────────────────

func TestPush_한번에_나눠서_실패뒤_재전송_결과가_같다(t *testing.T) {
	big := bigChanges()
	chunks := splitOrdered(big, clientChunkMax)
	if len(chunks) != 3 {
		t.Fatalf("시나리오 전제: 3묶음이어야 한다(%d)", len(chunks))
	}
	if c := chunks[1]["workouts"]; len(c.Updated) != 200 || len(c.Deleted) != 300 {
		t.Fatalf("시나리오 전제: 가운데 묶음에 올리기·지우기가 함께 들어야 한다: %+v", c)
	}

	eachHarness(t, func(t *testing.T, h harness) {
		// ㉠ 한 번에
		uA := h.newUser(t)
		repoA := h.repo(t, uA)
		mustPush(t, repoA, uA, seedChanges())
		mustPush(t, repoA, uA, toMap(big))
		want := h.snapshot(t, uA)
		if len(want) != 100+2400+300+200+1800 {
			t.Fatalf("한 번에 보낸 결과 행 수: %d", len(want))
		}
		// 얕은 병합 · 삭제 표시가 정말 일어났는지(같다는 비교만으로는 둘 다 틀려도 통과한다).
		for _, line := range []string{
			`set_logs|s0|false|{"id":"s0","import_batch_id":"ib-1","reps":10,"rir":2,"source":"strong"}`,
			`set_logs|s100|false|{"id":"s100","reps":10}`,
			`workouts|w0|true|{"id":"w0","state":"completed"}`,
			`workouts|w300|false|{"id":"w300","state":"in_progress"}`,
		} {
			if i := sort.SearchStrings(want, line); i >= len(want) || want[i] != line {
				t.Fatalf("한 번에 보낸 결과에 %s 가 없다", line)
			}
		}

		// ㉡ 2000건씩 나눠
		uB := h.newUser(t)
		repoB := h.repo(t, uB)
		mustPush(t, repoB, uB, seedChanges())
		for _, c := range chunks {
			mustPush(t, repoB, uB, c)
		}
		sameSnapshot(t, "나눠 보냄", h.snapshot(t, uB), want)

		// ㉢ 가운데 묶음 실패 → (WatermelonDB 처럼) 전체를 처음부터 다시 나눠 보냄
		uC := h.newUser(t)
		faulty := &faultRepo{Repo: h.repo(t, uC), failAt: 3} // 1번째 Apply = seed, 2 = 1묶음, 3 = 2묶음
		mustPush(t, faulty, uC, seedChanges())
		afterFirst := func() []string { // seed + 1묶음만 반영된 상태
			uRef := h.newUser(t)
			ref := h.repo(t, uRef)
			mustPush(t, ref, uRef, seedChanges())
			mustPush(t, ref, uRef, chunks[0])
			return h.snapshot(t, uRef) // 줄에 사용자 id 가 없어 다른 사용자끼리 비교할 수 있다
		}()
		var failed bool
		for i, c := range chunks {
			if err := push(t, faulty, uC, c); err != nil {
				if i != 1 || !errors.Is(err, errInjected) {
					t.Fatalf("%d번째 묶음 오류가 예상과 다르다: %v", i+1, err)
				}
				failed = true
				break // 클라이언트는 첫 실패에서 멈춘다(syncTransport push 가 그대로 던진다)
			}
		}
		if !failed {
			t.Fatal("가운데 묶음이 실패해야 한다")
		}
		// 실패한 묶음은 한 트랜잭션 — 올리기 문장이 이미 돌았어도 하나도 남지 않는다.
		sameSnapshot(t, "실패 직후(1묶음만)", h.snapshot(t, uC), afterFirst)
		for _, c := range chunks {
			mustPush(t, faulty, uC, c)
		}
		sameSnapshot(t, "실패 뒤 전체 재전송", h.snapshot(t, uC), want)
	})
}

// ── ② 삭제 표시 뒤 되살림 ───────────────────────────────────────────────────

func TestPush_삭제_표시_뒤_같은_id_를_올리면_되살아난다(t *testing.T) {
	eachHarness(t, func(t *testing.T, h harness) {
		u := h.newUser(t)
		repo := h.repo(t, u)

		// 있던 레코드 → 지움 → 다시 올림
		mustPush(t, repo, u, map[string]TableChanges{"workouts": {Updated: []string{`{"id":"wq","state":"completed","note":"옛 메모"}`}}})
		mustPush(t, repo, u, map[string]TableChanges{"workouts": {Deleted: []string{"wq"}}})
		// 서버가 모르던 레코드 → 지움(빈 payload 로 행이 생긴다) → 다시 올림
		mustPush(t, repo, u, map[string]TableChanges{"workouts": {Deleted: []string{"wr"}}})
		sameSnapshot(t, "지운 직후", h.snapshot(t, u), []string{
			`workouts|wq|true|{"id":"wq","note":"옛 메모","state":"completed"}`,
			`workouts|wr|true|{}`,
		})

		mustPush(t, repo, u, map[string]TableChanges{"workouts": {Created: []string{
			`{"id":"wq","state":"in_progress"}`,
			`{"id":"wr","state":"completed"}`,
		}}})
		// deleted=false 로 돌아온다. payload 는 얕은 병합이라 삭제 전 키(note)도 남는다.
		sameSnapshot(t, "다시 올린 뒤", h.snapshot(t, u), []string{
			`workouts|wq|false|{"id":"wq","note":"옛 메모","state":"in_progress"}`,
			`workouts|wr|false|{"id":"wr","state":"completed"}`,
		})

		// 다른 기기는 pull 에서 이것을 Deleted 가 아니라 Updated 로 받는다.
		res, err := NewService(repo, uuid.NewString).Pull(context.Background(), u, 0)
		if err != nil {
			t.Fatal(err)
		}
		w := res.Changes["workouts"]
		if len(w.Deleted) != 0 || len(w.Updated) != 2 {
			t.Fatalf("되살린 레코드는 Updated 로 가야 한다: %+v", w)
		}
	})
}

// ── ③ v25 기기의 push 가 v26 칸을 지우지 않는다(D-17 · 저장소 전체 경로) ─────

func TestPush_v25_기기_push_뒤에도_v26_칸이_저장소에_남는다(t *testing.T) {
	eachHarness(t, func(t *testing.T, h harness) {
		u := h.newUser(t)
		repo := h.repo(t, u)
		mustPush(t, repo, u, map[string]TableChanges{"set_logs": {Updated: []string{storedV26}}})
		mustPush(t, repo, u, map[string]TableChanges{"set_logs": {Updated: []string{pushedV25}}})
		snap := h.snapshot(t, u)
		if len(snap) != 1 {
			t.Fatalf("한 행이어야 한다: %v", snap)
		}
		payload := snap[0][strings.Index(snap[0], "|{")+1:]
		var obj map[string]json.RawMessage
		if err := json.Unmarshal([]byte(payload), &obj); err != nil {
			t.Fatal(err)
		}
		assertV26Kept(t, obj)
		if !strings.HasPrefix(snap[0], "set_logs|s1|false|") {
			t.Fatalf("행 머리가 다르다: %s", snap[0])
		}
	})
}
