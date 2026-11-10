// 코치 코멘트·담당 회원 점검 규칙(SPEC-050 P4) — 쓰기 조건(활성·logView·차단·완료 운동·visibleFrom·300자·하루 20)
// · 읽기(코치는 활성일 때 자기 것만 · 회원은 언제나) · 숨기기(코치 자기 것·회원) · 알림·감사 · 점검 숫자 · 처방 대 실제 칸.
package coaching

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type digestCall struct {
	trainer           string
	week, toMs, nowMs int64
	limit             int
}

type fakeComments struct {
	rows       []Comment
	countSince int // CountCommentsSince 가 돌려줄 수(설정 안 하면 rows 로 센다)
	digest     map[string]DigestCounts
	calls      []digestCall
	coachRts   map[string]map[string]bool // 코치 → 보낸 루틴의 회원 쪽 id(ListCoachMemberRoutineIDs)
}

// InsertCommentCapped — 진짜와 같은 순서(관계 다시 확인 → 차단 → 세기 → 넣기). 동시성은 PG 시험이 본다.
func (f *fakeRepo) InsertCommentCapped(ctx context.Context, c Comment, since time.Time, maxPerDay int) (Comment, error) {
	var g *Grant
	for _, x := range f.grants {
		if x.TrainerID == c.TrainerID && x.MemberID == c.MemberID {
			x := x
			g = &x
		}
	}
	switch {
	case g == nil || g.Status != StatusActive:
		return Comment{}, errs.New(errs.Forbidden, msgNotActive)
	case !g.Scope[ScopeLogView]:
		return Comment{}, errs.New(errs.Forbidden, msgLogOff)
	case f.blocked:
		return Comment{}, errs.New(errs.Forbidden, msgBlocked)
	}
	if n, _ := f.CountCommentsSince(ctx, c.TrainerID, c.MemberID, since); n >= maxPerDay {
		return Comment{}, errs.New(errs.ResourceExhausted, msgCommentDaily, maxPerDay)
	}
	c.GrantID, c.CreatedAt = g.ID, f.clock
	f.cm.rows = append(f.cm.rows, c)
	return c, nil
}
func (f *fakeRepo) CountCommentsSince(_ context.Context, trainerID, memberID string, _ time.Time) (int, error) {
	if f.cm.countSince > 0 {
		return f.cm.countSince, nil
	}
	n := 0
	for _, c := range f.cm.rows {
		if c.TrainerID == trainerID && c.MemberID == memberID {
			n++
		}
	}
	return n, nil
}
func (f *fakeRepo) ListCommentsForWorkout(_ context.Context, memberID, workoutID, trainerID string) ([]Comment, error) {
	var out []Comment
	for _, c := range f.cm.rows {
		if c.MemberID == memberID && c.WorkoutID == workoutID && c.HiddenAt.IsZero() &&
			(trainerID == "" || c.TrainerID == trainerID) {
			out = append(out, c)
		}
	}
	return out, nil
}
func (f *fakeRepo) ListCommentsByPair(_ context.Context, trainerID, memberID string) ([]Comment, error) {
	var out []Comment
	for _, c := range f.cm.rows {
		if c.TrainerID == trainerID && c.MemberID == memberID && c.HiddenAt.IsZero() {
			out = append(out, c)
		}
	}
	return out, nil
}
func (f *fakeRepo) GetComment(_ context.Context, id string) (Comment, error) {
	for _, c := range f.cm.rows {
		if c.ID == id {
			return c, nil
		}
	}
	return Comment{}, errs.New(errs.NotFound, msgCommentNotFound)
}
func (f *fakeRepo) HideComment(_ context.Context, id string) (bool, error) {
	for i, c := range f.cm.rows {
		if c.ID == id {
			if !c.HiddenAt.IsZero() {
				return false, nil
			}
			f.cm.rows[i].HiddenAt = f.clock
			return true, nil
		}
	}
	return false, nil
}

// ListMemberDigestRows — 이 코치의 활성 관계(차단이면 없음)를 grant id 순으로 · 숫자는 digest 맵 그대로
// (logView 꺼짐도 숫자를 준다 — 서비스가 0 으로 두는지 본다). 컷 계산은 SQL 이라 PG 시험이 본다.
func (f *fakeRepo) ListMemberDigestRows(_ context.Context, trainerID string, week, to, now int64, limit int) ([]DigestRow, error) {
	f.cm.calls = append(f.cm.calls, digestCall{trainerID, week, to, now, limit})
	ids := make([]string, 0, len(f.grants))
	for id := range f.grants {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	var out []DigestRow
	for _, id := range ids {
		g := f.grants[id]
		if g.TrainerID != trainerID || g.Status != StatusActive || f.blocked {
			continue
		}
		if len(out) >= limit {
			break
		}
		out = append(out, DigestRow{MemberID: g.MemberID, Scope: g.Scope, DigestCounts: f.cm.digest[g.MemberID]})
	}
	return out, nil
}
func (f *fakeRepo) ListCoachMemberRoutineIDs(_ context.Context, trainerID, _ string) (map[string]bool, error) {
	return f.cm.coachRts[trainerID], nil
}

// 코치 t1 · 회원 m1 · 동의 = now−10일 · 기본 범위(logView·routineEdit).
var cmConsent = testNow.Add(-10 * day)

func commentRepo() *fakeRepo {
	repo := newRepo()
	repo.grants["g1"] = Grant{
		ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusActive,
		Scope: DefaultScope().asMap(), ConsentAt: cmConsent,
	}
	repo.peers["t1"] = Peer{ID: "t1", DisplayName: "박코치"}
	repo.records = []MemberRecord{
		rec("workouts", "w-after", map[string]any{"id": "w-after", "state": "completed", "started_at": testNow.Add(-2 * day).UnixMilli()}),
		rec("workouts", "w-before", map[string]any{"id": "w-before", "state": "completed", "started_at": cmConsent.Add(-time.Second).UnixMilli()}),
		rec("workouts", "w-live", map[string]any{"id": "w-live", "state": "in_progress", "started_at": testNow.Add(-time.Hour).UnixMilli()}),
	}
	return repo
}

func TestAddComment_남기면_알림_감사_코치이름(t *testing.T) {
	repo := commentRepo()
	svc, n, _ := v2Svc(repo)
	c, err := svc.AddComment(context.Background(), "t1", "m1", "w-after", "  하체 좋았어요  ")
	if err != nil {
		t.Fatal(err)
	}
	if c.Body != "하체 좋았어요" || c.TrainerName != "박코치" || !c.CanHide || c.GrantID != "g1" || c.WorkoutID != "w-after" {
		t.Fatalf("코멘트: %+v", c)
	}
	if len(n.got) != 1 || n.got[0] != (refNote{"m1", "t1", notifyKindCoachingComment, "w-after"}) {
		t.Fatalf("알림 = 회원에게 coaching_comment · ref = 운동 id: %+v", n.got)
	}
	if last := repo.audits[len(repo.audits)-1]; last.Action != ActionCommentAdd {
		t.Fatalf("감사 comment_add: %+v", repo.audits)
	}
}

func TestAddComment_글자_상한(t *testing.T) {
	repo := commentRepo()
	svc, _, _ := v2Svc(repo)
	if _, err := svc.AddComment(context.Background(), "t1", "m1", "w-after", "   "); codeOf(t, err) != errs.Validation ||
		domainMsg(t, err) != msgCommentEmpty {
		t.Fatalf("빈 코멘트: %v", err)
	}
	if _, err := svc.AddComment(context.Background(), "t1", "m1", "w-after", strings.Repeat("가", 301)); codeOf(t, err) != errs.Validation ||
		!strings.Contains(domainMsg(t, err), "300자") {
		t.Fatalf("301자: %v", err)
	}
	if _, err := svc.AddComment(context.Background(), "t1", "m1", "w-after", strings.Repeat("가", 300)); err != nil {
		t.Fatalf("300자(룬)는 된다: %v", err)
	}
}

func TestAddComment_제어_서식_문자를_지운다(t *testing.T) {
	ctx := context.Background()
	// 폭 없는 문자·방향 바꿈·NUL 만 → 지운 뒤 빈 글
	for _, body := range []string{"\x00", "\u200b\u200c\u200d\ufeff", "\u202e\u2066\u2069", " \x00\u200f "} {
		repo := commentRepo()
		svc, n, _ := v2Svc(repo)
		if _, err := svc.AddComment(ctx, "t1", "m1", "w-after", body); codeOf(t, err) != errs.Validation ||
			domainMsg(t, err) != msgCommentEmpty {
			t.Fatalf("%q: %v", body, err)
		}
		if len(repo.cm.rows) != 0 || len(n.got) != 0 {
			t.Fatalf("%q: 쓰지 않는다", body)
		}
	}
	// 섞여 있으면 지우고 남긴다 · 줄바꿈·탭은 그대로 · 합친 이모지의 ZWJ 는 남긴다
	repo := commentRepo()
	svc, _, _ := v2Svc(repo)
	c, err := svc.AddComment(ctx, "t1", "m1", "w-after", "좋\x00아\u202e요\r\n다음\t세트 \U0001F468\u200d\U0001F469\u200b")
	if err != nil {
		t.Fatal(err)
	}
	if want := "좋아요\n다음\t세트 \U0001F468\u200d\U0001F469"; c.Body != want {
		t.Fatalf("정리: %q (want %q)", c.Body, want)
	}
	// 길이는 지운 뒤에 센다 — 300자 + 폭 없는 문자 50개는 된다
	repo = commentRepo()
	svc, _, _ = v2Svc(repo)
	if _, err := svc.AddComment(ctx, "t1", "m1", "w-after", strings.Repeat("가", 300)+strings.Repeat("\u200b", 50)); err != nil {
		t.Fatalf("지운 뒤 300자: %v", err)
	}
}

func TestAddComment_볼_수_없는_운동은_같은_NotFound(t *testing.T) {
	for _, wid := range []string{"w-before", "w-live", "없는-운동"} {
		repo := commentRepo()
		svc, n, _ := v2Svc(repo)
		_, err := svc.AddComment(context.Background(), "t1", "m1", wid, "좋아요")
		if codeOf(t, err) != errs.NotFound || domainMsg(t, err) != msgCommentNoWorkout {
			t.Fatalf("%s: %v", wid, err)
		}
		if len(n.got) != 0 || len(repo.cm.rows) != 0 {
			t.Fatalf("%s: 막히면 쓰지도 알리지도 않는다", wid)
		}
	}
	// 지난 기록을 열면 동의 1초 전 운동에도 남긴다
	repo := commentRepo()
	g := repo.grants["g1"]
	g.Scope = Scope{LogView: true, PastRecords: true}.asMap()
	repo.grants["g1"] = g
	svc, _, _ := v2Svc(repo)
	if _, err := svc.AddComment(context.Background(), "t1", "m1", "w-before", "옛 기록"); err != nil {
		t.Fatalf("pastRecords 면 동의 전 운동도: %v", err)
	}
}

func TestAddComment_연결_범위_차단_하루상한(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name  string
		setup func(r *fakeRepo)
		code  errs.Code
		msg   string
	}{
		{"기록 보기 꺼짐", func(r *fakeRepo) {
			g := r.grants["g1"]
			g.Scope = Scope{RoutineEdit: true}.asMap()
			r.grants["g1"] = g
		}, errs.Forbidden, msgLogOff},
		{"해지", func(r *fakeRepo) {
			g := r.grants["g1"]
			g.Status = StatusRevoked
			r.grants["g1"] = g
		}, errs.Forbidden, msgNotActive},
		{"연결 없음", func(r *fakeRepo) { delete(r.grants, "g1") }, errs.Forbidden, msgNotActive},
		{"차단", func(r *fakeRepo) { r.blocked = true }, errs.Forbidden, msgBlocked},
		{"하루 20", func(r *fakeRepo) { r.cm.countSince = maxCommentsPerDay }, errs.ResourceExhausted, ""},
	}
	for _, tc := range cases {
		repo := commentRepo()
		tc.setup(repo)
		svc, n, _ := v2Svc(repo)
		_, err := svc.AddComment(ctx, "t1", "m1", "w-after", "좋아요")
		if codeOf(t, err) != tc.code || (tc.msg != "" && domainMsg(t, err) != tc.msg) {
			t.Fatalf("%s: %v", tc.name, err)
		}
		if len(n.got) != 0 || len(repo.cm.rows) != 0 {
			t.Fatalf("%s: 쓰지도 알리지도 않는다", tc.name)
		}
	}
	// 19개까지는 된다
	repo := commentRepo()
	repo.cm.countSince = maxCommentsPerDay - 1
	svc, _, _ := v2Svc(repo)
	if _, err := svc.AddComment(ctx, "t1", "m1", "w-after", "스무 번째"); err != nil {
		t.Fatalf("20번째는 된다: %v", err)
	}
	// 회원이 자기에게 — 막힌다
	if _, err := svc.AddComment(ctx, "m1", "m1", "w-after", "나"); codeOf(t, err) != errs.Validation {
		t.Fatalf("자기에게: %v", err)
	}
}

func TestListComments_회원은_언제나_코치는_활성일_때_자기_것만(t *testing.T) {
	ctx := context.Background()
	repo := commentRepo()
	svc, _, _ := v2Svc(repo)
	if _, err := svc.AddComment(ctx, "t1", "m1", "w-after", "첫 코멘트"); err != nil {
		t.Fatal(err)
	}
	// 다른(옛) 코치의 코멘트 — 회원에게는 보이고, 지금 코치에게는 안 보인다
	repo.cm.rows = append(repo.cm.rows, Comment{ID: "old", TrainerID: "t0", MemberID: "m1", WorkoutID: "w-after", Body: "옛 코치"})

	// 회원 — workout_id 필수
	if _, err := svc.ListComments(ctx, "m1", "", ""); codeOf(t, err) != errs.Validation {
		t.Fatalf("회원은 운동을 골라야: %v", err)
	}
	mine, err := svc.ListComments(ctx, "m1", "m1", "w-after")
	if err != nil || len(mine) != 2 || !mine[0].CanHide {
		t.Fatalf("회원은 모든 코치의 코멘트·숨기기 가능: %+v %v", mine, err)
	}
	// 코치 — 운동 하나 / 전부 모두 자기 것만
	one, err := svc.ListComments(ctx, "t1", "m1", "w-after")
	if err != nil || len(one) != 1 || one[0].TrainerID != "t1" {
		t.Fatalf("코치는 자기 것만: %+v %v", one, err)
	}
	all, err := svc.ListComments(ctx, "t1", "m1", "")
	if err != nil || len(all) != 1 {
		t.Fatalf("코치 전체 목록: %+v %v", all, err)
	}
	// 코치 — 컷 앞 운동은 물을 수 없다
	if _, err := svc.ListComments(ctx, "t1", "m1", "w-before"); codeOf(t, err) != errs.NotFound {
		t.Fatalf("컷 앞 운동: %v", err)
	}

	// 해지 뒤 — 코치는 막히고 회원은 그대로
	g := repo.grants["g1"]
	g.Status = StatusRevoked
	repo.grants["g1"] = g
	if _, err := svc.ListComments(ctx, "t1", "m1", ""); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("해지 뒤 코치: %v", err)
	}
	if got, err := svc.ListComments(ctx, "m1", "", "w-after"); err != nil || len(got) != 2 {
		t.Fatalf("해지 뒤 회원은 그대로: %+v %v", got, err)
	}
}

func TestListComments_코치_전체_목록은_지금_보이는_운동만(t *testing.T) {
	ctx := context.Background()
	repo := commentRepo()
	g := repo.grants["g1"]
	g.Scope = Scope{LogView: true, PastRecords: true}.asMap()
	repo.grants["g1"] = g
	svc, _, _ := v2Svc(repo)
	for _, w := range []string{"w-after", "w-before"} {
		if _, err := svc.AddComment(ctx, "t1", "m1", w, "코멘트 "+w); err != nil {
			t.Fatal(err)
		}
	}
	// 회원이 지난 기록을 다시 끈다 → 동의 전 운동의 코멘트는 코치 목록에서 빠진다
	g.Scope = DefaultScope().asMap()
	repo.grants["g1"] = g
	all, err := svc.ListComments(ctx, "t1", "m1", "")
	if err != nil || len(all) != 1 || all[0].WorkoutID != "w-after" {
		t.Fatalf("보이는 운동의 코멘트만: %+v %v", all, err)
	}
}

func TestHideComment_코치_자기_것_회원_남은_NotFound(t *testing.T) {
	ctx := context.Background()
	repo := commentRepo()
	svc, _, _ := v2Svc(repo)
	c, err := svc.AddComment(ctx, "t1", "m1", "w-after", "숨길 코멘트")
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.HideComment(ctx, "x9", c.ID); codeOf(t, err) != errs.NotFound {
		t.Fatalf("남의 코멘트: %v", err)
	}
	if err := svc.HideComment(ctx, "m1", "없는 id"); codeOf(t, err) != errs.NotFound {
		t.Fatalf("없는 코멘트: %v", err)
	}
	before := len(repo.audits)
	if err := svc.HideComment(ctx, "m1", c.ID); err != nil {
		t.Fatalf("회원이 숨긴다: %v", err)
	}
	if len(repo.audits) != before+1 || repo.audits[len(repo.audits)-1].Action != ActionCommentHide {
		t.Fatalf("감사 comment_hide: %+v", repo.audits)
	}
	var d map[string]any
	_ = json.Unmarshal(repo.auditDetails[len(repo.auditDetails)-1], &d)
	if d["by"] != SideMember || d["commentId"] != c.ID {
		t.Fatalf("감사 내용: %v", d)
	}
	// 다시 숨겨도 성공 · 감사는 한 번
	if err := svc.HideComment(ctx, "t1", c.ID); err != nil || len(repo.audits) != before+1 {
		t.Fatalf("이미 숨김: %v · 감사 %d", err, len(repo.audits))
	}
	// 숨긴 코멘트는 양쪽 다 안 보인다
	if got, _ := svc.ListComments(ctx, "m1", "", "w-after"); len(got) != 0 {
		t.Fatalf("회원에게 숨김: %+v", got)
	}
	if got, _ := svc.ListComments(ctx, "t1", "m1", "w-after"); len(got) != 0 {
		t.Fatalf("코치에게 숨김: %+v", got)
	}
	// 코치도 자기 것을 숨긴다
	c2, _ := svc.AddComment(ctx, "t1", "m1", "w-after", "두 번째")
	if err := svc.HideComment(ctx, "t1", c2.ID); err != nil {
		t.Fatalf("코치 자기 것: %v", err)
	}
}

func TestListMemberDigest_활성_담당_회원만_범위_잘림(t *testing.T) {
	ctx := context.Background()
	repo := commentRepo()
	// m2 — 지난 기록 켬 · m3 — 기록 보기 꺼짐 · m4 — 대기 · 나(t1)가 회원인 관계 g5
	repo.grants["g2"] = Grant{ID: "g2", TrainerID: "t1", MemberID: "m2", Status: StatusActive,
		Scope: Scope{LogView: true, PastRecords: true}.asMap(), ConsentAt: cmConsent}
	repo.grants["g3"] = Grant{ID: "g3", TrainerID: "t1", MemberID: "m3", Status: StatusActive,
		Scope: Scope{RoutineEdit: true}.asMap(), ConsentAt: cmConsent}
	repo.grants["g4"] = Grant{ID: "g4", TrainerID: "t1", MemberID: "m4", Status: StatusPending, Scope: DefaultScope().asMap()}
	repo.grants["g5"] = Grant{ID: "g5", TrainerID: "t9", MemberID: "t1", Status: StatusActive, Scope: DefaultScope().asMap(), ConsentAt: cmConsent}
	last := testNow.Add(-4 * day)
	repo.cm.digest = map[string]DigestCounts{
		"m1": {WeekWorkouts: 2, LastStartedAtMs: last.UnixMilli(), WeekCoachWorkouts: 1},
		"m2": {},
		"m3": {WeekWorkouts: 5, LastStartedAtMs: last.UnixMilli()}, // 저장소가 숫자를 줘도 logView 꺼짐이면 0
	}
	svc, _, _ := v2Svc(repo)
	week := testNow.Add(-3 * day).UnixMilli()
	got, truncated, err := svc.ListMemberDigest(ctx, "t1", week)
	if err != nil || truncated {
		t.Fatal(err, truncated)
	}
	by := map[string]MemberDigest{}
	for _, d := range got {
		by[d.MemberID] = d
	}
	if len(got) != 3 || by["m4"].MemberID != "" || by["t1"].MemberID != "" {
		t.Fatalf("활성 담당 회원만(m1·m2·m3): %+v", got)
	}
	if d := by["m1"]; !d.LogView || d.WeekWorkouts != 2 || d.WeekCoachWorkouts != 1 || !d.LastWorkoutAt.Equal(time.UnixMilli(last.UnixMilli())) {
		t.Fatalf("m1 숫자: %+v", d)
	}
	if d := by["m2"]; !d.LogView || !d.LastWorkoutAt.IsZero() {
		t.Fatalf("m2 — 운동 없음이면 마지막 운동 제로: %+v", d)
	}
	if d := by["m3"]; d.LogView || d.WeekWorkouts != 0 || !d.LastWorkoutAt.IsZero() {
		t.Fatalf("m3 — 기록 보기 꺼짐이면 숫자 0: %+v", d)
	}
	// 한 질의(N+1 없음) · 잘림을 알려고 하나 더 읽는다
	if len(repo.cm.calls) != 1 {
		t.Fatalf("저장소는 한 번만: %+v", repo.cm.calls)
	}
	if c := repo.cm.calls[0]; c.week != week || c.trainer != "t1" || c.toMs <= testNow.UnixMilli() ||
		c.nowMs != testNow.UnixMilli() || c.limit != maxDigestMembers+1 {
		t.Fatalf("주 시작·코치·끝·지금·한도: %+v", c)
	}

	// 엉뚱한 주 시작(미래·너무 옛날·0) → 지금−7일
	for _, bad := range []int64{0, testNow.Add(time.Hour).UnixMilli(), testNow.Add(-30 * day).UnixMilli()} {
		repo.cm.calls = nil
		if _, _, err := svc.ListMemberDigest(ctx, "t1", bad); err != nil {
			t.Fatal(err)
		}
		if repo.cm.calls[0].week != testNow.Add(-7*day).UnixMilli() {
			t.Fatalf("주 시작 %d → %d", bad, repo.cm.calls[0].week)
		}
	}

	// 차단 사이는 뺀다(가짜 차단은 모두에게 걸린다)
	repo.blocked = true
	if got, _, err := svc.ListMemberDigest(ctx, "t1", week); err != nil || len(got) != 0 {
		t.Fatalf("차단: %+v %v", got, err)
	}

	// 200명 넘으면 200명 + truncated
	big := newRepo()
	for i := 0; i < maxDigestMembers+5; i++ {
		id := fmt.Sprintf("g%03d", i)
		big.grants[id] = Grant{ID: id, TrainerID: "t1", MemberID: fmt.Sprintf("m%03d", i), Status: StatusActive,
			Scope: DefaultScope().asMap(), ConsentAt: cmConsent}
	}
	bsvc, _, _ := v2Svc(big)
	if got, truncated, err := bsvc.ListMemberDigest(ctx, "t1", week); err != nil || len(got) != maxDigestMembers || !truncated {
		t.Fatalf("잘림: %d %v %v", len(got), truncated, err)
	}
	// 딱 200명이면 잘림 아님
	delete(big.grants, "g000")
	for i := 1; i < 5; i++ {
		delete(big.grants, fmt.Sprintf("g%03d", i))
	}
	if got, truncated, _ := bsvc.ListMemberDigest(ctx, "t1", week); len(got) != maxDigestMembers || truncated {
		t.Fatalf("200명: %d %v", len(got), truncated)
	}
}

func TestGetMemberRecords_코치_루틴_운동만_처방_칸(t *testing.T) {
	repo := newRepo()
	repo.grants["g1"] = Grant{ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusActive,
		Scope: Scope{LogView: true, PastRecords: true}.asMap(), ConsentAt: testNow.Add(-100 * day)}
	// t1 이 보낸 루틴은 coach-cr1 하나 · coach-cr9 는 다른 코치(t9)가 보낸 것
	repo.cm.coachRts = map[string]map[string]bool{"t1": {"coach-cr1": true}, "t9": {"coach-cr9": true}}
	at := testNow.Add(-2 * day).UnixMilli()
	rx := `[{"setType":"normal","repMin":8,"repMax":10,"targetRir":2,"loadHint":null}]`
	repo.records = []MemberRecord{
		rec("workouts", "wc", map[string]any{"id": "wc", "state": "completed", "started_at": at, "routine_id": "coach-cr1"}),
		rec("workouts", "wm", map[string]any{"id": "wm", "state": "completed", "started_at": at + 1, "routine_id": "my-routine"}),
		rec("workout_exercises", "bc", map[string]any{"id": "bc", "workout_id": "wc", "exercise_id": "seed-bench",
			"prescription": rx, "target_sets": 3, "target_reps_min": 8, "target_reps_max": 10, "target_weight_kg": 60, "note": "회원 메모", "prev_reps": 9}),
		rec("workout_exercises", "bm", map[string]any{"id": "bm", "workout_id": "wm", "exercise_id": "seed-bench",
			"prescription": rx, "target_sets": 3}),
		// 다른 코치 루틴 운동 · routine_id 위조(coach- 접두어지만 이 코치가 보낸 적 없음) → 처방 없음
		rec("workouts", "wo", map[string]any{"id": "wo", "state": "completed", "started_at": at + 2, "routine_id": "coach-cr9"}),
		rec("workouts", "wf", map[string]any{"id": "wf", "state": "completed", "started_at": at + 3, "routine_id": "coach-forged"}),
		rec("workout_exercises", "bo", map[string]any{"id": "bo", "workout_id": "wo", "exercise_id": "seed-bench",
			"prescription": rx, "target_sets": 3}),
		rec("workout_exercises", "bf", map[string]any{"id": "bf", "workout_id": "wf", "exercise_id": "seed-bench",
			"prescription": rx, "target_sets": 3}),
	}
	svc := newSvc(repo)
	out, err := svc.GetMemberRecords(context.Background(), "t1", "m1", testNow.Add(-7*day).UnixMilli(), testNow.UnixMilli())
	if err != nil {
		t.Fatal(err)
	}
	blocks := map[string]map[string]any{}
	for _, s := range out.WorkoutExercises {
		var m map[string]any
		_ = json.Unmarshal([]byte(s), &m)
		blocks[m["id"].(string)] = m
	}
	if blocks["bc"]["prescription"] != rx || blocks["bc"]["target_sets"] != float64(3) || blocks["bc"]["target_weight_kg"] != float64(60) {
		t.Fatalf("코치 루틴 운동 블록 = 처방·목표 칸: %v", blocks["bc"])
	}
	if _, ok := blocks["bc"]["note"]; ok {
		t.Fatalf("메모는 여전히 안 나간다: %v", blocks["bc"])
	}
	if _, ok := blocks["bc"]["prev_reps"]; ok {
		t.Fatalf("이전 스냅샷은 여전히 안 나간다: %v", blocks["bc"])
	}
	for _, b := range []string{"bm", "bo", "bf"} {
		if blocks[b] == nil {
			t.Fatalf("블록 %s 자체는 나간다: %v", b, blocks)
		}
		for _, k := range coachBlockFields {
			if _, ok := blocks[b][k]; ok {
				t.Fatalf("%s(회원 루틴·다른 코치 루틴·위조)에는 %s 가 없다: %v", b, k, blocks[b])
			}
		}
	}
}
