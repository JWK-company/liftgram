// 코치 루틴 보내기 규칙(SPEC-050 P3b) — 접근·상한·종목·처방 정리·알림 묶음 · 레코드 모양(결정적 id·회원 칸 안 덮기)
// · SetMemberPrescription 거절 · 처방 편집기 목록에서 코치 루틴 빼기. 트랜잭션 자체는 routines_pg_test.go.
package coaching

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type fakeRoutines struct {
	catalog    map[string]CatalogRow
	custom     map[string]string
	sendsHour  int
	recentUpd  bool
	plans      []SendRoutinePlan
	created    bool // 다음 SendRoutineTx 가 「처음」인가(기본 = 처음)
	notCreated bool
	sent       []SentRoutine
}

func (f *fakeRepo) ExerciseCatalogRows(_ context.Context, ids []string) (map[string]CatalogRow, error) {
	out := map[string]CatalogRow{}
	for _, id := range ids {
		if r, ok := f.rt.catalog[id]; ok {
			out[id] = r
		}
	}
	return out, nil
}
func (f *fakeRepo) CustomExerciseName(_ context.Context, _, id string) (string, error) {
	return f.rt.custom[id], nil
}
func (f *fakeRepo) CountRoutineSendsSince(context.Context, string, time.Time) (int, error) {
	return f.rt.sendsHour, nil
}
func (f *fakeRepo) HasRecentRoutineUpdate(context.Context, string, string, time.Time) (bool, error) {
	return f.rt.recentUpd, nil
}
func (f *fakeRepo) SendRoutineTx(_ context.Context, p SendRoutinePlan) (SendRoutineOutcome, error) {
	f.rt.plans = append(f.rt.plans, p)
	g, err := f.GetGrantByPair(context.Background(), p.TrainerID, p.MemberID)
	if err != nil {
		return SendRoutineOutcome{}, err
	}
	return SendRoutineOutcome{
		Routine: SentRoutine{ID: "cr-1", MemberRoutineID: memberRoutineID("cr-1"), SourceRoutineID: p.SourceRoutineID, Name: p.Name, Status: RoutineActive},
		GrantID: g.ID, Created: !f.rt.notCreated,
	}, nil
}
func (f *fakeRepo) ListSentRoutines(context.Context, string, string) ([]SentRoutine, error) {
	return f.rt.sent, nil
}

// 코치 t·회원 m 의 활성 관계(범위 sc) + 카탈로그 두 종목.
func routineFixture(sc Scope) (*fakeRepo, *Service, *fakeRefNotifier) {
	repo := newRepo()
	repo.grants["g1"] = Grant{ID: "g1", TrainerID: "t", MemberID: "m", Status: StatusActive, Scope: sc.asMap(), ConsentAt: time.Unix(1, 0)}
	repo.peers["t"] = Peer{ID: "t", DisplayName: "김코치"}
	repo.rt.catalog = map[string]CatalogRow{
		"ex-bench": {NameKo: "바벨 벤치프레스"},
		"ex-row":   {NameKo: "바벨 로우"},
		"ex-old":   {NameKo: "옛 종목", IsArchived: true},
	}
	repo.rt.custom = map[string]string{"my-ex": "내 동작"}
	svc, n, _ := v2Svc(repo)
	return repo, svc, n
}

func baseInput() SendRoutineInput {
	return SendRoutineInput{
		MemberID: "m", SourceRoutineID: "draft1", Name: "  상체 A  ", Notes: "천천히",
		Lines: []SendRoutineLine{
			{ID: "l1", ExerciseID: "ex-bench", TargetSets: 3, RepsMin: 5, RepsMax: 5, RestSeconds: 180, SortOrder: 0,
				PrescriptionJSON: `[{"setType":"feeder","targetRir":null,"repMin":3,"repMax":3,"loadHint":null,"loadBasis":"start","loadKg":40,"rest":120},` +
					`{"setType":"top","targetRir":9,"repMin":null,"repMax":null,"loadHint":"heavy","amrap":true,"scheme":"topBackoff","rest":240},` +
					`{"setType":"이상한","targetRir":2,"repMin":8,"repMax":10,"loadHint":"x","loadBasis":"pctTop","loadPct":80,"scheme":"모름","rest":5000}]`},
			{ID: "l2", ExerciseID: "ex-row", TargetSets: 99, RestSeconds: -5, SupersetGroup: "s1", Note: " 등 펴기 ", SortOrder: 1,
				CardioTargetJSON: `{"durationSec":0,"evil":"x"}`},
		},
	}
}

func TestSendRoutine_정리해서_한_트랜잭션에_넘기고_알림은_처음_보냄(t *testing.T) {
	repo, svc, n := routineFixture(DefaultScope())
	r, created, err := svc.SendRoutine(context.Background(), "t", baseInput())
	if err != nil || !created || r.MemberRoutineID != "coach-cr-1" {
		t.Fatalf("보내기: %+v %v %v", r, created, err)
	}
	p := repo.rt.plans[0]
	if p.Name != "상체 A" || p.CoachName != "김코치" || p.Notes == nil || *p.Notes != "천천히" || p.TrainerID != "t" {
		t.Fatalf("계획: %+v", p)
	}
	l1, l2 := p.Lines[0], p.Lines[1]
	if l2.TargetSets != maxTargetSets || l2.RestSeconds != 0 || *l2.Note != "등 펴기" || *l2.SupersetGroup != "s1" || l2.Cardio != nil {
		t.Fatalf("줄 2 정리: %+v", l2)
	}
	var rx []map[string]any
	if err := json.Unmarshal([]byte(*l1.Prescription), &rx); err != nil || len(rx) != 3 {
		t.Fatalf("처방: %v %v", l1.Prescription, err)
	}
	// feeder·start(회원 시작 무게)·rest · amrap·scheme·RIR 클램프 · 모르는 타입 → normal · 범위 밖 rest 는 버림
	checks := []struct {
		i    int
		k    string
		want any
	}{
		{0, "setType", "feeder"}, {0, "loadBasis", "start"}, {0, "loadKg", 40.0}, {0, "rest", 120.0},
		{1, "amrap", true}, {1, "scheme", "topBackoff"}, {1, "targetRir", 6.0}, {1, "rest", 240.0},
		{2, "setType", "normal"}, {2, "loadBasis", "pctTop"}, {2, "loadPct", 80.0},
	}
	for _, c := range checks {
		if rx[c.i][c.k] != c.want {
			t.Errorf("rx[%d].%s = %v, want %v", c.i, c.k, rx[c.i][c.k], c.want)
		}
	}
	if _, ok := rx[2]["rest"]; ok {
		t.Errorf("범위 밖 휴식은 버린다: %v", rx[2])
	}
	if _, ok := rx[2]["scheme"]; ok {
		t.Errorf("모르는 방식은 버린다: %v", rx[2])
	}
	if len(n.got) != 1 || n.got[0] != (refNote{"m", "t", notifyKindCoachingRoutine, "coach-cr-1"}) {
		t.Fatalf("알림: %+v", n.got)
	}
	if last := repo.audits[len(repo.audits)-1]; last.Action != ActionRoutineSend {
		t.Fatalf("감사: %+v", last)
	}
}

func TestSendRoutine_다시_보내면_바꿨어요_알림은_10분에_한_번(t *testing.T) {
	repo, svc, n := routineFixture(DefaultScope())
	repo.rt.notCreated = true
	if _, created, err := svc.SendRoutine(context.Background(), "t", baseInput()); err != nil || created {
		t.Fatal(err)
	}
	if len(n.got) != 1 || n.got[0].kind != notifyKindCoachingRoutineUpdate {
		t.Fatalf("바꿨어요 알림: %+v", n.got)
	}
	repo.rt.recentUpd = true
	if _, _, err := svc.SendRoutine(context.Background(), "t", baseInput()); err != nil {
		t.Fatal(err)
	}
	if len(n.got) != 1 {
		t.Fatalf("10분 안 두 번째는 알리지 않는다: %+v", n.got)
	}
	if last := repo.audits[len(repo.audits)-1]; last.Action != ActionRoutineUpdate {
		t.Fatalf("감사는 매번: %+v", last)
	}
}

func TestSendRoutine_막히는_경우(t *testing.T) {
	ctx := context.Background()
	mut := func(f func(*SendRoutineInput)) SendRoutineInput {
		in := baseInput()
		f(&in)
		return in
	}
	cases := []struct {
		name  string
		setup func(*fakeRepo)
		in    SendRoutineInput
		code  errs.Code
		msg   string
	}{
		{"관계 없음", func(r *fakeRepo) { delete(r.grants, "g1") }, baseInput(), errs.Forbidden, msgNotActive},
		{"해지됨", func(r *fakeRepo) { g := r.grants["g1"]; g.Status = StatusRevoked; r.grants["g1"] = g }, baseInput(), errs.Forbidden, msgNotActive},
		{"루틴 받기 꺼짐", func(r *fakeRepo) { g := r.grants["g1"]; g.Scope = Scope{LogView: true}.asMap(); r.grants["g1"] = g }, baseInput(), errs.Forbidden, msgNoRoutineScope},
		{"차단", func(r *fakeRepo) { r.blocked = true }, baseInput(), errs.Forbidden, msgBlocked},
		{"이름 없음", nil, mut(func(in *SendRoutineInput) { in.Name = "  " }), errs.Validation, msgRoutineNameEmpty},
		{"이름 김", nil, mut(func(in *SendRoutineInput) { in.Name = strings.Repeat("가", 61) }), errs.Validation, fmt.Sprintf(msgRoutineNameLong, 60)},
		{"메모 김", nil, mut(func(in *SendRoutineInput) { in.Notes = strings.Repeat("가", 501) }), errs.Validation, fmt.Sprintf(msgRoutineNotesLong, 500)},
		{"종목 없음", nil, mut(func(in *SendRoutineInput) { in.Lines = nil }), errs.Validation, msgRoutineNoLines},
		{"줄 31개", nil, mut(func(in *SendRoutineInput) {
			in.Lines = nil
			for i := 0; i < 31; i++ {
				in.Lines = append(in.Lines, SendRoutineLine{ID: fmt.Sprintf("l%d", i), ExerciseID: "ex-bench", TargetSets: 3})
			}
		}), errs.Validation, fmt.Sprintf(msgRoutineTooManyLines, 30)},
		{"같은 줄 id", nil, mut(func(in *SendRoutineInput) { in.Lines[1].ID = "l1" }), errs.Validation, msgRoutineBadLine},
		{"줄 id 모양", nil, mut(func(in *SendRoutineInput) { in.Lines[1].ID = "a/b" }), errs.Validation, msgRoutineBadLine},
		{"처방 21줄", nil, mut(func(in *SendRoutineInput) {
			in.Lines[0].PrescriptionJSON = "[" + strings.TrimSuffix(strings.Repeat(`{"setType":"normal"},`, 21), ",") + "]"
		}), errs.Validation, fmt.Sprintf(msgRoutineRxTooLong, 20)},
		{"처방 깨짐", nil, mut(func(in *SendRoutineInput) { in.Lines[0].PrescriptionJSON = "{" }), errs.Validation, msgRoutineBadLine},
		{"직접 만든 종목", nil, mut(func(in *SendRoutineInput) { in.Lines[1].ExerciseID = "my-ex" }), errs.Validation, "「내 동작」은 직접 만든 종목이라 보낼 수 없어요"},
		{"이름 모르는 종목", nil, mut(func(in *SendRoutineInput) { in.Lines[1].ExerciseID = "nope" }), errs.Validation, "「이 종목」은 직접 만든 종목이라 보낼 수 없어요"},
		{"내린 종목", nil, mut(func(in *SendRoutineInput) { in.Lines[1].ExerciseID = "ex-old" }), errs.Validation, "「옛 종목」은 지금 고를 수 없는 종목이라 보낼 수 없어요"},
		{"시간당 60번", func(r *fakeRepo) { r.rt.sendsHour = 60 }, baseInput(), errs.ResourceExhausted, msgTryLater},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			repo, svc, n := routineFixture(DefaultScope())
			if c.setup != nil {
				c.setup(repo)
			}
			_, _, err := svc.SendRoutine(ctx, "t", c.in)
			if codeOf(t, err) != c.code || domainMsg(t, err) != c.msg {
				t.Fatalf("%v (want %s %q)", err, c.code, c.msg)
			}
			if len(repo.rt.plans) != 0 || len(n.got) != 0 {
				t.Fatalf("막히면 쓰지도 알리지도 않는다: %d %d", len(repo.rt.plans), len(n.got))
			}
		})
	}
	// 회원은 자기에게 못 보낸다 · 로그인 필수
	_, svc, _ := routineFixture(DefaultScope())
	if _, _, err := svc.SendRoutine(ctx, "m", mut(func(in *SendRoutineInput) { in.MemberID = "m" })); codeOf(t, err) != errs.Validation {
		t.Fatalf("자기 자신: %v", err)
	}
	if _, _, err := svc.SendRoutine(ctx, "", baseInput()); codeOf(t, err) != errs.Unauthorized {
		t.Fatalf("로그인: %v", err)
	}
}

func TestListSentRoutines_관계가_없으면_빈_목록(t *testing.T) {
	repo, svc, _ := routineFixture(DefaultScope())
	repo.rt.sent = []SentRoutine{{ID: "cr-1"}}
	got, err := svc.ListSentRoutines(context.Background(), "t", "m")
	if err != nil || len(got) != 1 {
		t.Fatalf("%v %v", got, err)
	}
	got, err = svc.ListSentRoutines(context.Background(), "t", "stranger")
	if err != nil || got == nil || len(got) != 0 {
		t.Fatalf("모르는 사이: %v %v", got, err)
	}
}

func TestBuildCoachRoutineRecords_처음과_다시(t *testing.T) {
	notes := "메모"
	sg := "s1"
	p := SendRoutinePlan{
		TrainerID: "t", CoachName: "김코치", Name: "상체", Notes: &notes, NowMs: 1000,
		Lines: []cleanLine{{DraftID: "b", ExerciseID: "ex-row", TargetSets: 3, SortOrder: 1, SupersetGroup: &sg},
			{DraftID: "a", ExerciseID: "ex-bench", TargetSets: 4, SortOrder: 0}},
	}
	writes, ids, removed := buildCoachRoutineRecords(p, "cr", true, 7, nil)
	if !slices.Equal(ids, []string{"coach-cr-b", "coach-cr-a"}) || len(removed) != 0 {
		t.Fatalf("줄 id: %v %v", ids, removed)
	}
	// (컬렉션, id) 순서 — Push 잠금과 같은 순서
	order := []string{}
	for _, w := range writes {
		order = append(order, w.Collection+"/"+w.RecordID)
	}
	if !slices.Equal(order, []string{"routine_exercises/coach-cr-a", "routine_exercises/coach-cr-b", "routines/coach-cr"}) {
		t.Fatalf("순서: %v", order)
	}
	var routine, line map[string]any
	_ = json.Unmarshal(writes[2].Payload, &routine)
	_ = json.Unmarshal(writes[0].Payload, &line)
	for k, v := range map[string]any{"origin": "coach", "coach_id": "t", "coach_name": "김코치", "sort_order": 7.0,
		"is_archived": false, "created_at": 1000.0, "notes": "메모"} {
		if routine[k] != v {
			t.Errorf("루틴 %s = %v, want %v", k, routine[k], v)
		}
	}
	if _, ok := routine["folder"]; !ok {
		t.Error("처음엔 folder 를 null 로 둔다")
	}
	if _, ok := line["variant_grip"]; !ok || line["variant_grip"] != nil || line["created_at"] != 1000.0 {
		t.Errorf("새 줄 = 변형 null · created_at: %v", line)
	}

	// 다시 — 회원 것(폴더·순서·보관·created_at)과 남아 있던 줄의 변형은 넘기지 않는다 · 빠진 줄은 지운다
	p.NowMs = 2000
	p.Lines = p.Lines[1:]
	writes, ids, removed = buildCoachRoutineRecords(p, "cr", false, 0, []string{"coach-cr-a", "coach-cr-b", "coach-cr-x"})
	routine, line = nil, nil // 새로 읽는다(Unmarshal 은 있는 맵에 합친다)
	_ = json.Unmarshal(writes[1].Payload, &routine)
	_ = json.Unmarshal(writes[0].Payload, &line)
	for _, k := range []string{"folder", "sort_order", "is_archived", "created_at"} {
		if _, ok := routine[k]; ok {
			t.Errorf("다시 보낼 때 %s 를 덮었다", k)
		}
	}
	for _, k := range append([]string{"created_at"}, lineVariantFields...) {
		if _, ok := line[k]; ok {
			t.Errorf("남은 줄의 %s 를 덮었다", k)
		}
	}
	if routine["updated_at"] != 2000.0 || !slices.Equal(ids, []string{"coach-cr-a"}) || !slices.Equal(removed, []string{"coach-cr-b", "coach-cr-x"}) {
		t.Fatalf("다시: %v %v %v", routine, ids, removed)
	}
	if ids == nil {
		t.Fatal("line_ids 는 nil 이 아니다(NOT NULL)")
	}
}

func TestSetMemberPrescription_코치_루틴과_끝난_루틴은_거절(t *testing.T) {
	for _, c := range []struct {
		routineID, origin, msg string
	}{
		{"coach-cr", "coach", msgCoachRoutineRx},
		{"r-any", "coach", msgCoachRoutineRx},
		{"coach-cr", "coach_ended", msgEndedRoutineRx},
	} {
		repo, svc, _ := routineFixture(DefaultScope())
		repo.records = []MemberRecord{
			{Collection: "routines", RecordID: c.routineID, Payload: []byte(`{"id":"` + c.routineID + `","origin":"` + c.origin + `"}`)},
			{Collection: "routine_exercises", RecordID: "re1", Payload: []byte(`{"id":"re1","routine_id":"` + c.routineID + `"}`)},
		}
		_, err := svc.SetMemberPrescription(context.Background(), "t", "m", c.routineID, "re1", nil)
		if codeOf(t, err) != errs.Validation || domainMsg(t, err) != c.msg {
			t.Fatalf("%s/%s: %v", c.routineID, c.origin, err)
		}
		if len(repo.updated) != 0 {
			t.Fatal("거절이면 쓰지 않는다")
		}
	}
}

func TestBuildRoutines_코치_루틴은_처방_편집기_목록에_없다(t *testing.T) {
	recs := []MemberRecord{
		{Collection: "routines", RecordID: "mine", Payload: []byte(`{"id":"mine","name":"내 루틴"}`)},
		{Collection: "routines", RecordID: "coach-cr", Payload: []byte(`{"id":"coach-cr","name":"코치 루틴","origin":"coach"}`)},
		{Collection: "routines", RecordID: "coach-old", Payload: []byte(`{"id":"coach-old","name":"끝남","origin":"coach_ended"}`)},
	}
	for _, rid := range []string{"mine", "coach-cr", "coach-old"} {
		recs = append(recs, MemberRecord{Collection: "routine_exercises", RecordID: rid + "-1",
			Payload: []byte(`{"id":"` + rid + `-1","routine_id":"` + rid + `","exercise_id":"ex-bench","target_sets":3}`)})
	}
	got := buildRoutinesWith(recs, nil)
	if len(got) != 1 || got[0].ID != "mine" {
		t.Fatalf("회원이 만든 루틴만: %+v", got)
	}
}

func TestSendRoutine_슈퍼세트_묶음_id_는_20자까지(t *testing.T) {
	_, svc, _ := routineFixture(DefaultScope())
	in := baseInput()
	in.Lines[1].SupersetGroup = strings.Repeat("s", 21)
	if _, _, err := svc.SendRoutine(context.Background(), "t", in); codeOf(t, err) != errs.Validation {
		t.Fatalf("21자: %v", err)
	}
	in.Lines[1].SupersetGroup = strings.Repeat("s", 20)
	if _, _, err := svc.SendRoutine(context.Background(), "t", in); err != nil {
		t.Fatalf("20자: %v", err)
	}
}

func TestListSentRoutines_차단한_사이면_빈_목록(t *testing.T) {
	repo, svc, _ := routineFixture(DefaultScope())
	repo.rt.sent = []SentRoutine{{ID: "cr-1"}}
	repo.blocked = true
	got, err := svc.ListSentRoutines(context.Background(), "t", "m")
	if err != nil || got == nil || len(got) != 0 {
		t.Fatalf("차단: %v %v", got, err)
	}
}
