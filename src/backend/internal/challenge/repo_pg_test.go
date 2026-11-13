// 그룹 챌린지 — 실제 Postgres(LIFTGRAM_TEST_DATABASE_URL 이 있을 때만 · 이름에 test/e2e 가 든 스크래치 DB).
//
// 가짜로는 못 보는 것: 판정 입력 SQL(운동→블록→세트 · 웜업 · 지운 세트 · 가져온 기록 · 진행 중 · 04:00 경계) ·
// 정원과 동시 5개(행 잠금·advisory lock) · 루프 두 개 동시 실행 · 알림 한 번 · dHash 거리(bit_count) ·
// 비공개 사진 읽기 · 보관 삭제와 탈퇴 정리(파일이 실제로 지워지는가).
package challenge

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/config"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

// ── 시험 도구 ─────────────────────────────────────────────────────────────

type diskPhotos struct{ dir string }

func (d diskPhotos) Save(_ Ctx, data []byte, _ string) (string, error) {
	k := fmt.Sprintf("%d.jpg", time.Now().UnixNano())
	return k, os.WriteFile(filepath.Join(d.dir, k), data, 0o600)
}
func (d diskPhotos) Open(_ Ctx, key string) (io.ReadCloser, error) {
	return os.Open(filepath.Join(d.dir, key))
}
func (d diskPhotos) Delete(_ Ctx, key string) error {
	err := os.Remove(filepath.Join(d.dir, key))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

type notes struct {
	mu sync.Mutex
	xs []string
}

func (n *notes) NotifySelf(_ Ctx, user, kind, ref string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.xs = append(n.xs, user+"|"+kind)
}

func (n *notes) count(user, kind string) int {
	n.mu.Lock()
	defer n.mu.Unlock()
	c := 0
	for _, x := range n.xs {
		if x == user+"|"+kind {
			c++
		}
	}
	return c
}

// photo 는 씨앗마다 다른 무늬의 JPEG 다(dHash 거리가 크게 벌어지게).
func photo(t *testing.T, seed int64) []byte {
	t.Helper()
	r := rand.New(rand.NewSource(seed))
	img := image.NewRGBA(image.Rect(0, 0, 640, 480))
	for by := 0; by < 8; by++ {
		for bx := 0; bx < 9; bx++ {
			c := color.RGBA{uint8(r.Intn(256)), uint8(r.Intn(256)), uint8(r.Intn(256)), 255}
			for y := by * 60; y < (by+1)*60; y++ {
				for x := bx * 72; x < (bx+1)*72 && x < 640; x++ {
					img.SetRGBA(x, y, c)
				}
			}
		}
	}
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

type env struct {
	t     *testing.T
	pool  *pgxpool.Pool
	svc   *Service
	notes *notes
	dir   string
	tag   string
	now   time.Time
	seq   int
	// 서버가 그 행을 처음 받은 시각(sync_records.created_at) — 비우면 DB now()
	syncAt time.Time
}

func newEnv(t *testing.T) *env {
	pool := testpg.Pool(t)
	if u := config.IntegrationDatabaseURL(); !strings.Contains(u, "test") && !strings.Contains(u, "e2e") {
		t.Fatalf("시험 DB 이름에 test/e2e 가 없다 — 운영·개발 DB 에 쓰지 않는다: %s", u)
	}
	e := &env{t: t, pool: pool, notes: &notes{}, dir: t.TempDir(), tag: fmt.Sprintf("ch%d", time.Now().UnixNano())}
	n := 0
	e.svc = NewService(NewRepo(pool), diskPhotos{e.dir}, e.notes, func() string { n++; return fmt.Sprintf("%s-id%d", e.tag, n) })
	e.svc.SetNow(func() time.Time { return e.now })
	t.Cleanup(func() {
		ctx := context.Background()
		_, _ = pool.Exec(ctx, `DELETE FROM challenges WHERE id LIKE $1`, e.tag+"%")
		_, _ = pool.Exec(ctx, `DELETE FROM sync_records WHERE user_id LIKE $1`, e.tag+"%")
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id LIKE $1`, e.tag+"%")
	})
	return e
}

func (e *env) exec(q string, args ...any) {
	e.t.Helper()
	if _, err := e.pool.Exec(context.Background(), q, args...); err != nil {
		e.t.Fatalf("%v: %s", err, q)
	}
}

func (e *env) user(name string) string {
	id := e.tag + "-" + name
	e.exec(`INSERT INTO users (id, email, display_name, role, created_at, email_verified_at, age_confirmed_at) VALUES ($1,$2,$3,'user',now(),now(),now())`,
		id, id+"@example.com", "시험"+name)
	return id
}

func (e *env) rec(user, coll, rid string, payload map[string]any, deleted bool) {
	e.t.Helper()
	b, _ := json.Marshal(payload)
	e.seq++
	var at any
	if !e.syncAt.IsZero() {
		at = e.syncAt
	}
	e.exec(`INSERT INTO sync_records (id, user_id, collection, record_id, payload, deleted, created_at) VALUES ($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz, now()))`,
		fmt.Sprintf("%s-r%d", e.tag, e.seq), user, coll, rid, b, deleted, at)
}

// workout 은 완료 운동 하나와 세트 n 개(+ 웜업 1 · 지운 세트 1 · 안 한 세트 1)를 넣는다.
func (e *env) workout(user, wid string, start time.Time, mins, n int) {
	// 끝난 시각에 서버로 올라온 것으로(첫 판정 컷오프 · REV-160 4)
	prev := e.syncAt
	e.syncAt = start.Add(time.Duration(mins) * time.Minute)
	defer func() { e.syncAt = prev }()
	e.rec(user, "workouts", wid, map[string]any{"state": "completed", "started_at": start.UnixMilli(),
		"completed_at": start.Add(time.Duration(mins) * time.Minute).UnixMilli(), "source": nil}, false)
	e.rec(user, "workout_exercises", wid+"-b", map[string]any{"workout_id": wid}, false)
	for i := 0; i < n; i++ {
		e.rec(user, "set_logs", fmt.Sprintf("%s-s%d", wid, i), map[string]any{"workout_exercise_id": wid + "-b", "is_warmup": false, "done": i%2 == 0, "reps": 8}, false)
	}
	// 짝수만 done:true · 홀수는 done:false → 아래에서 null 로 바꿔 「옛 세트 = 완료」로 센다
	e.exec(`UPDATE sync_records SET payload = payload - 'done' WHERE user_id = $1 AND collection = 'set_logs' AND payload->>'done' = 'false' AND record_id LIKE $2`, user, wid+"-s%")
	e.rec(user, "set_logs", wid+"-w", map[string]any{"workout_exercise_id": wid + "-b", "is_warmup": true, "reps": 8}, false)
	e.rec(user, "set_logs", wid+"-x", map[string]any{"workout_exercise_id": wid + "-b", "reps": 8}, true)
	e.rec(user, "set_logs", wid+"-n", map[string]any{"workout_exercise_id": wid + "-b", "done": false, "reps": 8}, false)
	// 빈 세트(횟수·시간 0)는 세지 않는다(REV-160 10) · 유산소는 시간으로 센다 → n 에 들지 않게 빈 것만 넣는다
	e.rec(user, "set_logs", wid+"-e", map[string]any{"workout_exercise_id": wid + "-b", "reps": 0}, false)
}

func code(err error) errs.Code {
	var d *errs.DomainError
	if errors.As(err, &d) {
		return d.Code
	}
	return ""
}

func (e *env) mustDetail(uid, id string) Detail {
	e.t.Helper()
	d, err := e.svc.Get(context.Background(), uid, id, nil)
	if err != nil {
		e.t.Fatal(err)
	}
	return d
}

func cellOf(d Detail, uid string, day Day) Cell {
	for _, c := range d.Cells {
		if c.UserID == uid && c.Day.Equal(day) {
			return c
		}
	}
	return Cell{}
}

func dayRow(t *testing.T, pool *pgxpool.Pool, ch, uid string, d Day) (string, bool) {
	var res string
	var fin bool
	err := pool.QueryRow(context.Background(), `SELECT result, final FROM challenge_days WHERE challenge_id=$1 AND user_id=$2 AND day=$3`, ch, uid, d.Time()).Scan(&res, &fin)
	if err != nil {
		return "", false
	}
	return res, fin
}

// ── 시험 ──────────────────────────────────────────────────────────────────

func TestPg_판정_입력_SQL(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	a := e.user("a")
	s := kst(2020, 3, 2, 19, 0)
	e.workout(a, "w1", s, 60, 6) // 완료 세트 6(웜업·지운 것·done false 제외)
	e.rec(a, "workouts", "imp", map[string]any{"state": "completed", "started_at": s.UnixMilli(), "completed_at": s.Add(time.Hour).UnixMilli(), "source": "strong"}, false)
	e.rec(a, "workouts", "live", map[string]any{"state": "active", "started_at": s.UnixMilli()}, false)
	e.rec(a, "workouts", "gone", map[string]any{"state": "completed", "started_at": s.UnixMilli(), "completed_at": s.Add(time.Hour).UnixMilli()}, true)
	// 04:00 경계 — 03:59 시작은 전날
	e.workout(a, "w0", kst(2020, 3, 2, 3, 59), 30, 3)
	var ws []UserWorkout
	d := DayFromDate(2020, 3, 2)
	if err := e.svc.repo.InTx(ctx, func(tx Tx) error {
		var err error
		ws, err = tx.JudgeWorkouts(ctx, []string{a}, d.Start(), d.End())
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if len(ws) != 1 || ws[0].ID != "w1" || ws[0].Sets != 6 {
		t.Fatalf("%+v", ws)
	}
	if !ws[0].StartedAt.Equal(s) || !ws[0].CompletedAt.Equal(s.Add(time.Hour)) {
		t.Fatal("시각")
	}
	// 첫 판정 컷오프(REV-160 4) — 첫 판정(3/3 끝 + 12시간 = 3/4 16:00) 뒤에 처음 온 세트·운동은 세지 않는다
	e.syncAt = d.FirstJudge().Add(time.Minute)
	e.rec(a, "set_logs", "w1-late", map[string]any{"workout_exercise_id": "w1-b", "reps": 8}, false)
	e.rec(a, "workouts", "late", map[string]any{"state": "completed", "started_at": s.Add(2 * time.Hour).UnixMilli(), "completed_at": s.Add(3 * time.Hour).UnixMilli()}, false)
	e.syncAt = d.FirstJudge().Add(-time.Minute)
	e.rec(a, "set_logs", "w1-cardio", map[string]any{"workout_exercise_id": "w1-b", "reps": 0, "duration_sec": 600}, false)
	e.syncAt = time.Time{}
	if err := e.svc.repo.InTx(ctx, func(tx Tx) error {
		var err error
		ws, err = tx.JudgeWorkouts(ctx, []string{a}, d.Start(), d.End())
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if len(ws) != 1 || ws[0].ID != "w1" || ws[0].Sets != 7 {
		t.Fatalf("컷오프·유산소 %+v", ws)
	}
}

func TestPg_흐름_만들기부터_끝까지(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	a, b, c := e.user("a"), e.user("b"), e.user("c")
	// 2020-03-02 = 월요일. 만들기는 그 전 주 목요일.
	e.now = kst(2020, 2, 27, 12, 0)
	start := DayFromDate(2020, 3, 2)
	det, err := e.svc.Create(ctx, a, Draft{Title: "아침 근력", StartsOn: start, Weeks: 1, RuleKind: "daily", MinSets: 5,
		ProofMode: ModeGym, Penalty: "커피 쏘기", PassPerWeek: 1})
	if err != nil {
		t.Fatal(err)
	}
	id := det.ID
	tok := det.InviteToken
	if tok == "" || len(tok) < 20 {
		t.Fatal("토큰")
	}
	// 비멤버 Get 은 NotFound · 비로그인 초대 요약은 인원 수만
	if _, err := e.svc.Get(ctx, b, id, nil); code(err) != errs.NotFound {
		t.Fatalf("비멤버 %v", err)
	}
	inv, err := e.svc.GetInvite(ctx, "", tok)
	if err != nil || inv.MemberCount != 1 || inv.Title != "아침 근력" {
		t.Fatalf("%v %+v", err, inv)
	}
	// 동시 참가 두 개 — 둘 다 들어가고 인원은 3
	var wg sync.WaitGroup
	for _, u := range []string{b, c} {
		wg.Add(1)
		go func(u string) {
			defer wg.Done()
			if _, err := e.svc.Join(ctx, u, tok); err != nil {
				t.Error(err)
			}
		}(u)
	}
	wg.Wait()
	if d := e.mustDetail(a, id); d.MemberCount != 3 {
		t.Fatalf("인원 %d", d.MemberCount)
	}
	// 토큰 바꾸면 옛 링크 무효
	nt, err := e.svc.RotateInvite(ctx, a, id)
	if err != nil || nt == tok {
		t.Fatal("토큰 바꿈")
	}
	if _, err := e.svc.GetInvite(ctx, "", tok); code(err) != errs.NotFound {
		t.Fatal("옛 토큰")
	}
	// 멤버가 아닌 사람은 규칙을 못 고친다 · 멤버는 Forbidden
	if _, err := e.svc.Update(ctx, b, id, Draft{Title: "x", StartsOn: start, Weeks: 1, RuleKind: "daily", MinSets: 5, ProofMode: ModeGym}); code(err) != errs.Forbidden {
		t.Fatalf("멤버 고치기 %v", err)
	}

	// 시작
	e.now = kst(2020, 3, 2, 4, 0)
	if err := e.svc.RunOnce(ctx, e.now); err != nil {
		t.Fatal(err)
	}
	if d := e.mustDetail(a, id); d.Status != StatusActive {
		t.Fatalf("시작 %s", d.Status)
	}
	if _, err := e.svc.Join(ctx, e.user("late"), nt); code(err) != errs.Conflict {
		t.Fatal("시작 뒤 참가")
	}
	if _, err := e.svc.Update(ctx, a, id, Draft{Title: "x", StartsOn: start.Add(3), Weeks: 1, RuleKind: "daily", MinSets: 5, ProofMode: ModeGym}); code(err) != errs.Conflict {
		t.Fatalf("시작 뒤 고치기 %v", err)
	}

	// 월: a 는 운동 중 인증 + 6세트 → 완료
	s := kst(2020, 3, 2, 19, 0)
	e.now = s.Add(10 * time.Minute)
	pr, err := e.svc.IssuePrompt(ctx, a, id, "wa1")
	if err != nil || !strings.Contains(pr.Code, ":") {
		t.Fatalf("%v %+v", err, pr)
	}
	e.now = e.now.Add(time.Minute)
	pa, err := e.svc.UploadProof(ctx, a, pr.ID, photo(t, 1), "app")
	if err != nil || pa.Status != ProofOK {
		t.Fatalf("%v %+v", err, pa)
	}
	// 같은 지시 다시 → 거부
	if _, err := e.svc.UploadProof(ctx, a, pr.ID, photo(t, 2), "app"); code(err) != errs.Conflict {
		t.Fatal("일회용")
	}
	// 지시 만료(3분)
	pr2, _ := e.svc.IssuePrompt(ctx, a, id, "wa1")
	e.now = e.now.Add(4 * time.Minute)
	if _, err := e.svc.UploadProof(ctx, a, pr2.ID, photo(t, 3), "app"); code(err) != errs.Conflict {
		t.Fatal("만료")
	}
	// 같은 사진(본인 지난 인증) → 거부
	pr3, _ := e.svc.IssuePrompt(ctx, a, id, "wa1")
	if _, err := e.svc.UploadProof(ctx, a, pr3.ID, photo(t, 1), "app"); code(err) != errs.Conflict {
		t.Fatal("같은 사진")
	}
	// 남이 지시를 쓰려 함 → NotFound
	pr4, _ := e.svc.IssuePrompt(ctx, a, id, "wa1")
	if _, err := e.svc.UploadProof(ctx, b, pr4.ID, photo(t, 4), "app"); code(err) != errs.NotFound {
		t.Fatal("남의 지시")
	}
	// 서버가 다시 인코딩 — 저장한 파일은 원본과 다르고 JPEG
	rc, err := e.svc.ReadPhoto(ctx, b, pa.ID)
	if err != nil {
		t.Fatal(err)
	}
	stored, _ := io.ReadAll(rc)
	rc.Close()
	if bytes.Equal(stored, photo(t, 1)) || stored[0] != 0xFF || stored[1] != 0xD8 {
		t.Fatal("재인코딩")
	}
	if _, err := e.svc.ReadPhoto(ctx, e.user("stranger"), pa.ID); err == nil {
		t.Fatal("남이 사진")
	}
	e.workout(a, "wa1", s, 60, 6)

	// b: 그룹의 a 사진과 같은 사진 → 거부는 아니고 「중복 의심」
	e.now = s.Add(20 * time.Minute)
	prb, _ := e.svc.IssuePrompt(ctx, b, id, "wb1")
	pb, err := e.svc.UploadProof(ctx, b, prb.ID, photo(t, 1), "web")
	if err != nil || pb.Status != ProofSuspect {
		t.Fatalf("의심 %v %+v", err, pb)
	}
	e.workout(b, "wb1", s, 60, 6)
	// c: 월요일 안 함

	// 화요일: c 가 9세트(2배 미달) → 면제 · b 는 화요일도 안 함(그 주 면제권 남음)
	t2 := kst(2020, 3, 3, 19, 0)
	e.now = t2
	prc, _ := e.svc.IssuePrompt(ctx, c, id, "wc2")
	e.now = t2.Add(time.Minute)
	if _, err := e.svc.UploadProof(ctx, c, prc.ID, photo(t, 30), "app"); err != nil {
		t.Fatal(err)
	}
	e.workout(c, "wc2", t2, 70, 9)

	// 21시 미완료 알림은 한 번만
	e.now = kst(2020, 3, 3, 21, 5)
	_ = e.svc.RunOnce(ctx, e.now)
	_ = e.svc.RunOnce(ctx, e.now.Add(time.Minute))
	if e.notes.count(a, NoticeRemind) != 1 || e.notes.count(c, NoticeRemind) != 0 {
		t.Fatalf("21시 알림 %v", e.notes.xs)
	}

	// 월요일 첫 판정(화 16:00) — 루프 두 개 동시
	mon := DayFromDate(2020, 3, 2)
	e.now = mon.FirstJudge()
	var wg2 sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg2.Add(1)
		go func() { defer wg2.Done(); _ = e.svc.RunOnce(ctx, e.now) }()
	}
	wg2.Wait()
	if r, f := dayRow(t, e.pool, id, a, mon); r != ResDone || !f {
		t.Fatalf("a 월 %s %v", r, f)
	}
	if r, _ := dayRow(t, e.pool, id, c, mon); r != ResMissedOpen {
		t.Fatalf("c 월 %s", r)
	}
	if e.notes.count(c, NoticeMissed) != 1 {
		t.Fatal("빠짐 알림 한 번")
	}
	// 판정 뒤 운동 기록을 고쳐도(세트 지움) 확정된 날은 그대로(얼림)
	e.exec(`UPDATE sync_records SET deleted = true WHERE user_id = $1 AND collection = 'set_logs'`, a)
	e.now = mon.Finalize()
	_ = e.svc.RunOnce(ctx, e.now)
	if r, _ := dayRow(t, e.pool, id, a, mon); r != ResDone {
		t.Fatal("얼림")
	}
	// c 월: 화요일 9세트(<10) → 면제
	if r, f := dayRow(t, e.pool, id, c, mon); r != ResPass || !f {
		t.Fatalf("c 면제 %s", r)
	}

	// 이의 — 3명 그룹, b 의 사진에 a·c 두 명(과반 2) → 무효 → b 월 다시 판정
	e.now = mon.Finalize().Add(-time.Hour) // 마감 전으로 되돌려 이의
	if _, err := e.svc.Flag(ctx, b, pb.ID, true); code(err) != errs.Validation {
		t.Fatal("내 인증 이의")
	}
	v, err := e.svc.Flag(ctx, a, pb.ID, true)
	if err != nil || v.Status != ProofSuspect {
		t.Fatalf("이의 1 %v %+v", err, v)
	}
	v, err = e.svc.Flag(ctx, c, pb.ID, true)
	if err != nil || v.Status != ProofInvalid {
		t.Fatalf("이의 2 %v %+v", err, v)
	}
	if r, _ := dayRow(t, e.pool, id, b, mon); r != ResMissedOpen {
		t.Fatalf("b 다시 판정 %s", r)
	}
	if e.notes.count(b, NoticeProofInvalid) != 1 {
		t.Fatal("무효 알림")
	}
	// 무효는 되돌리지 않는다
	if _, err := e.svc.Flag(ctx, a, pb.ID, false); code(err) != errs.Conflict {
		t.Fatal("무효 철회")
	}
	// 마감 뒤 이의는 거부
	e.now = mon.Finalize().Add(time.Hour)
	if _, err := e.svc.Flag(ctx, b, pa.ID, true); code(err) != errs.Conflict {
		t.Fatalf("마감 뒤 %v", err)
	}

	// 확정 → b 월: 화요일 운동 없음 + 면제권 → 면제. 화요일(b·a 둘 다 안 함)은 면제권을 이미 써서 빠짐 + 벌칙
	_ = e.svc.RunOnce(ctx, e.now)
	if r, _ := dayRow(t, e.pool, id, b, mon); r != ResPass {
		t.Fatalf("b 월 %s", r)
	}
	tue := DayFromDate(2020, 3, 3)
	e.now = tue.Finalize()
	_ = e.svc.RunOnce(ctx, e.now)
	if r, f := dayRow(t, e.pool, id, b, tue); r != ResMissed || !f {
		t.Fatalf("b 화 %s", r)
	}
	if r, _ := dayRow(t, e.pool, id, a, tue); r != ResPass {
		t.Fatalf("a 화 %s", r) // a 는 그 주 면제권을 아직 안 썼다
	}
	if r, _ := dayRow(t, e.pool, id, c, tue); r != ResDone {
		t.Fatalf("c 화 %s", r)
	}
	// 벌칙 이행 체크 — 본인·방장만
	if err := e.svc.MarkDebtPaid(ctx, c, id, b, tue, true); code(err) != errs.Forbidden {
		t.Fatal("남이 체크")
	}
	if err := e.svc.MarkDebtPaid(ctx, a, id, b, tue, true); err != nil {
		t.Fatal(err)
	}
	d := e.mustDetail(b, id)
	for _, tl := range d.Tallies {
		if tl.UserID == b && (tl.Debts != 1 || tl.Paid != 1 || tl.Missed != 1 || tl.Pass != 1) {
			t.Fatalf("합계 %+v", tl)
		}
	}
	if cl := cellOf(d, b, mon); cl.Result != ResPass || !cl.Final {
		t.Fatalf("칸 %+v", cl)
	}

	// 진행 중 방장은 넘긴 뒤에만 나간다
	if err := e.svc.Leave(ctx, a, id); code(err) != errs.Conflict {
		t.Fatal("방장 나가기")
	}
	if err := e.svc.TransferOwner(ctx, a, id, c); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.Leave(ctx, a, id); err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.ReadPhoto(ctx, a, pb.ID); err == nil {
		t.Fatal("나간 멤버 사진")
	}

	// 끝 — 마지막 날 확정 시각 뒤 · 알림 한 번
	last := start.Add(6)
	e.now = last.Finalize().Add(time.Minute)
	_ = e.svc.RunOnce(ctx, e.now)
	_ = e.svc.RunOnce(ctx, e.now)
	if d := e.mustDetail(c, id); d.Status != StatusEnded || d.PurgeOn == nil {
		t.Fatalf("끝 %s", d.Status)
	}
	if e.notes.count(c, NoticeEnded) != 1 || e.notes.count(a, NoticeEnded) != 0 {
		t.Fatal("끝 알림")
	}

	// 보관 삭제 — 30일 뒤 파일이 실제로 사라진다(처리 안 된 신고가 걸린 사진은 미룸)
	files, _ := os.ReadDir(e.dir)
	if len(files) < 3 {
		t.Fatalf("파일 %d", len(files))
	}
	e.exec(`INSERT INTO reports (id, target_type, target_id, reporter_id, reason) VALUES ($1,'challenge_proof',$2,$3,'other')`, e.tag+"-rep", pa.ID, c)
	t.Cleanup(func() { _, _ = e.pool.Exec(context.Background(), `DELETE FROM reports WHERE id = $1`, e.tag+"-rep") })
	e.now = e.now.Add(PhotoRetention + time.Hour)
	_ = e.svc.RunOnce(ctx, e.now)
	files, _ = os.ReadDir(e.dir)
	if len(files) != 1 {
		t.Fatalf("신고 걸린 사진만 남아야 — %d", len(files))
	}
	e.exec(`UPDATE reports SET status = 'resolved' WHERE id = $1`, e.tag+"-rep")
	_ = e.svc.RunOnce(ctx, e.now)
	files, _ = os.ReadDir(e.dir)
	if len(files) != 0 {
		t.Fatalf("다 지워져야 — %d", len(files))
	}
	var purged *time.Time
	_ = e.pool.QueryRow(ctx, `SELECT photos_purged_at FROM challenges WHERE id=$1`, id).Scan(&purged)
	if purged == nil {
		t.Fatal("purged 표시")
	}
}

func TestPg_취소_정원_동시5개_탈퇴(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	a := e.user("a")
	e.now = kst(2020, 2, 27, 12, 0)
	start := DayFromDate(2020, 3, 2)
	dr := Draft{Title: "t", StartsOn: start, Weeks: 1, RuleKind: "daily", MinSets: 5, ProofMode: ModeGym, PassPerWeek: 1}
	ids := []string{}
	for i := 0; i < MaxActive; i++ {
		d, err := e.svc.Create(ctx, a, dr)
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, d.ID)
	}
	if _, err := e.svc.Create(ctx, a, dr); code(err) != errs.Conflict {
		t.Fatal("동시 5개")
	}
	// 정원 10 — 9명 미리 넣고 동시에 두 명이 참가하면 하나만
	d0 := e.mustDetail(a, ids[0])
	for i := 0; i < 8; i++ {
		e.exec(`INSERT INTO challenge_members (challenge_id, user_id) VALUES ($1,$2)`, ids[0], e.user(fmt.Sprintf("m%d", i)))
	}
	x, y := e.user("x"), e.user("y")
	var wg sync.WaitGroup
	var mu sync.Mutex
	okN := 0
	for _, u := range []string{x, y} {
		wg.Add(1)
		go func(u string) {
			defer wg.Done()
			if _, err := e.svc.Join(ctx, u, d0.InviteToken); err == nil {
				mu.Lock()
				okN++
				mu.Unlock()
			}
		}(u)
	}
	wg.Wait()
	if okN != 1 {
		t.Fatalf("정원 동시 참가 %d", okN)
	}
	// 차단 관계면 참가 거부
	bl := e.user("bl")
	e.exec(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1,$2)`, a, bl)
	if _, err := e.svc.Join(ctx, bl, e.mustDetail(a, ids[1]).InviteToken); code(err) != errs.Forbidden {
		t.Fatalf("차단 %v", err)
	}
	// 시작 때 1명이면 취소 + 알림
	e.now = start.Start()
	_ = e.svc.RunOnce(ctx, e.now)
	if d := e.mustDetail(a, ids[1]); d.Status != StatusCancelled {
		t.Fatalf("취소 %s", d.Status)
	}
	if e.notes.count(a, NoticeCancelled) != MaxActive-1 {
		t.Fatalf("취소 알림 %d", e.notes.count(a, NoticeCancelled))
	}
	// 탈퇴 — 인증 사진 파일과 행이 다음 회차에 지워진다
	e.now = kst(2020, 3, 2, 19, 0)
	if _, err := e.svc.Get(ctx, x, ids[0], nil); err != nil {
		x = y // 동시 참가에서 y 가 들어갔다
	}
	pr, err := e.svc.IssuePrompt(ctx, x, ids[0], "wx")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.UploadProof(ctx, x, pr.ID, photo(t, 77), "app"); err != nil {
		t.Fatal(err)
	}
	if files, _ := os.ReadDir(e.dir); len(files) != 1 {
		t.Fatal("업로드 파일")
	}
	e.exec(`DELETE FROM users WHERE id = $1`, x)
	_ = e.svc.RunOnce(ctx, e.now)
	if files, _ := os.ReadDir(e.dir); len(files) != 0 {
		t.Fatal("탈퇴 사진 파일")
	}
	var n int
	_ = e.pool.QueryRow(ctx, `SELECT count(*) FROM challenge_proofs WHERE challenge_id = $1`, ids[0]).Scan(&n)
	if n != 0 {
		t.Fatal("탈퇴 사진 행")
	}
}

func TestPhoto_검사_재인코딩_dHash(t *testing.T) {
	a := photo(t, 1)
	out, h1, err := ProcessPhoto(a)
	if err != nil || len(out) == 0 {
		t.Fatal(err)
	}
	_, h1b, _ := ProcessPhoto(a)
	_, h2, _ := ProcessPhoto(photo(t, 2))
	if HashDist(h1, h1b) != 0 || HashDist(h1, h2) <= DupSuspectDist {
		t.Fatalf("거리 같은=%d 다른=%d", HashDist(h1, h1b), HashDist(h1, h2))
	}
	// 거대한 사진(폭탄)·JPEG 아님·빈 것 거부
	big := image.NewGray(image.Rect(0, 0, 5000, 10))
	var b bytes.Buffer
	_ = jpeg.Encode(&b, big, nil)
	for name, data := range map[string][]byte{"큰 변": b.Bytes(), "png": []byte("\x89PNG\r\n\x1a\n"), "빈": nil, "너무 큼": make([]byte, MaxPhotoBytes+1)} {
		if _, _, err := ProcessPhoto(data); err == nil {
			t.Errorf("%s 통과", name)
		}
	}
	// 다시 인코딩한 결과에 EXIF(APP1) 가 없다
	exif := append([]byte{0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x10}, append([]byte("Exif\x00\x00GPSDATA!"), a[2:]...)...)
	o2, _, err := ProcessPhoto(exif)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(o2, []byte("Exif")) || bytes.Contains(o2, []byte("GPSDATA")) {
		t.Fatal("EXIF 남음")
	}
}

// 코드 리뷰 반영(REV-160) — 사진을 열기 전 지시 확인 · 업로드 횟수 · 방장 해산 알림.
func TestPg_리뷰160_업로드_전검사_해산알림(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	a, b := e.user("a"), e.user("b")
	e.now = kst(2020, 2, 27, 12, 0)
	det, err := e.svc.Create(ctx, a, Draft{Title: "해산", StartsOn: DayFromDate(2020, 3, 2), Weeks: 1, RuleKind: "daily", MinSets: 5, ProofMode: ModeGym})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.svc.Join(ctx, b, det.InviteToken); err != nil {
		t.Fatal(err)
	}
	// 없는 지시 → NotFound 이고 저장소에 파일이 생기지 않는다(디코드·저장 전에 막힘)
	if _, err := e.svc.UploadProof(ctx, a, "nope", photo(t, 1), "app"); code(err) != errs.NotFound {
		t.Fatalf("없는 지시 %v", err)
	}
	if fs, _ := os.ReadDir(e.dir); len(fs) != 0 {
		t.Fatalf("파일이 남음 %d", len(fs))
	}
	// 1분에 10번까지 — 11번째는 ResourceExhausted(사진을 열지 않는다)
	for i := 0; i < uploadsPerMinute-1; i++ {
		_, _ = e.svc.UploadProof(ctx, a, "nope", nil, "app")
	}
	if _, err := e.svc.UploadProof(ctx, a, "nope", nil, "app"); code(err) != errs.ResourceExhausted {
		t.Fatalf("횟수 %v", err)
	}
	e.now = e.now.Add(time.Minute)
	if _, err := e.svc.UploadProof(ctx, a, "nope", nil, "app"); code(err) != errs.NotFound {
		t.Fatalf("1분 뒤 %v", err)
	}
	// 모집 중 방장이 나가면 해산 + 남은 멤버에게 취소 알림 한 번
	if err := e.svc.Leave(ctx, a, det.ID); err != nil {
		t.Fatal(err)
	}
	if e.notes.count(b, NoticeCancelled) != 1 || e.notes.count(a, NoticeCancelled) != 0 {
		t.Fatalf("해산 알림 %v", e.notes.xs)
	}
	if d := e.mustDetail(b, det.ID); d.Status != StatusCancelled {
		t.Fatalf("상태 %s", d.Status)
	}
}
