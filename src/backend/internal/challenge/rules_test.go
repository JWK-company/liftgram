package challenge

import (
	"testing"
	"time"
)

func kst(y int, m time.Month, d, h, min int) time.Time { return time.Date(y, m, d, h, min, 0, 0, KST) }

// 2026-11-16 = 월요일
var mon = DayFromDate(2026, 11, 16)

func rule() Rule {
	return Rule{StartsOn: mon, Weeks: 2, RuleKind: "daily", Weekdays: 127, MinSets: 5, ProofMode: ModeGym, PassPerWeek: 1}
}

func wk(id string, start time.Time, mins, sets int) Workout {
	return Workout{ID: id, StartedAt: start, CompletedAt: start.Add(time.Duration(mins) * time.Minute), Sets: sets}
}

func pf(id, wid string, issued, captured time.Time) Proof {
	return Proof{ID: id, WorkoutID: wid, IssuedAt: issued, CapturedAt: captured, Status: ProofOK}
}

func TestDayOf_새벽4시_경계(t *testing.T) {
	if got := DayOf(kst(2026, 11, 17, 3, 59)); got.String() != "2026-11-16" {
		t.Fatalf("03:59 → %s", got)
	}
	if got := DayOf(kst(2026, 11, 17, 4, 0)); got.String() != "2026-11-17" {
		t.Fatalf("04:00 → %s", got)
	}
	d := DayFromDate(2026, 11, 16)
	if !d.Start().Equal(kst(2026, 11, 16, 4, 0)) || !d.End().Equal(kst(2026, 11, 17, 4, 0)) {
		t.Fatal("경계")
	}
	if !d.FirstJudge().Equal(kst(2026, 11, 17, 16, 0)) || !d.Finalize().Equal(kst(2026, 11, 18, 16, 0)) {
		t.Fatal("판정 시각")
	}
	if mon.Weekday0Mon() != 0 || mon.Add(6).Weekday0Mon() != 6 {
		t.Fatal("요일")
	}
}

func TestRule_요일과_주번호(t *testing.T) {
	r := rule()
	r.RuleKind, r.Weekdays = "weekdays", 1|4|16 // 월·수·금
	if !r.IsRequired(mon) || r.IsRequired(mon.Add(1)) || !r.IsRequired(mon.Add(2)) {
		t.Fatal("요일 비트")
	}
	if r.IsRequired(mon.Add(-1)) || r.IsRequired(mon.Add(14)) || !r.InRange(mon.Add(13)) {
		t.Fatal("기간")
	}
	if r.WeekIndex(mon.Add(6)) != 0 || r.WeekIndex(mon.Add(7)) != 1 {
		t.Fatal("주 번호")
	}
	if Judge2(r, mon.Add(1), nil, kst(2026, 11, 30, 0, 0)) != nil {
		t.Fatal("쉬는 날은 행을 만들지 않는다")
	}
}

func Judge2(r Rule, d Day, ws []Workout, now time.Time) *DayRow {
	row, _ := Judge(JudgeInput{Rule: r, Day: d, Workouts: ws, Now: now})
	return row
}

func TestJudge_완료는_사진이_운동에_붙어야(t *testing.T) {
	r := rule()
	s := kst(2026, 11, 16, 19, 0)
	w := wk("w1", s, 60, 6)
	in := JudgeInput{Rule: r, Day: mon, Workouts: []Workout{w}, Proofs: []Proof{pf("p1", "w1", s.Add(5*time.Minute), s.Add(6*time.Minute))}, Now: mon.FirstJudge()}
	// 첫 판정 전에는 아무것도 하지 않는다
	in.Now = mon.FirstJudge().Add(-time.Second)
	if _, ok := Judge(in); ok {
		t.Fatal("첫 판정 전")
	}
	in.Now = mon.FirstJudge()
	row, ok := Judge(in)
	if !ok || row.Result != ResDone || !row.Final || row.ProofID != "p1" || row.Sets != 6 {
		t.Fatalf("완료: %+v", row)
	}
	// 확정 행은 다시 판정하지 않는다(얼림) — 기록이 바뀌어도
	in.Prev = row
	in.Workouts = nil
	if _, ok := Judge(in); ok {
		t.Fatal("얼림")
	}
	// 사진 없음 → missed_open
	in.Prev, in.Workouts, in.Proofs = nil, []Workout{w}, nil
	if row, _ := Judge(in); row.Result != ResMissedOpen || row.Final {
		t.Fatalf("사진 없음: %+v", row)
	}
	// 기록 방식은 사진 없이 완료
	r2 := r
	r2.ProofMode = ModeRecord
	in.Rule = r2
	if row, _ := Judge(in); row.Result != ResDone {
		t.Fatal("기록 방식")
	}
}

func TestProofFits_시각_구간(t *testing.T) {
	s := kst(2026, 11, 16, 19, 0)
	w := wk("w1", s, 60, 6)
	cases := []struct {
		name             string
		issued, captured time.Time
		want             bool
	}{
		{"운동 중", s.Add(10 * time.Minute), s.Add(11 * time.Minute), true},
		{"시작 10분 전 발급", s.Add(-10 * time.Minute), s.Add(-8 * time.Minute), true},
		{"시작 11분 전 발급", s.Add(-11 * time.Minute), s.Add(-9 * time.Minute), false},
		{"끝 30분 뒤", s.Add(80 * time.Minute), s.Add(90 * time.Minute), true},
		{"끝 31분 뒤", s.Add(85 * time.Minute), s.Add(91 * time.Minute), false},
	}
	for _, c := range cases {
		if got := ProofFits(w, pf("p", "w1", c.issued, c.captured)); got != c.want {
			t.Errorf("%s: %v", c.name, got)
		}
	}
	if ProofFits(w, pf("p", "w2", s, s)) {
		t.Error("다른 운동")
	}
	inv := pf("p", "w1", s, s)
	inv.Status = ProofInvalid
	if ProofFits(w, inv) {
		t.Error("무효")
	}
	sus := pf("p", "w1", s, s)
	sus.Status = ProofSuspect
	if !ProofFits(w, sus) {
		t.Error("중복 의심은 판정에서 유효")
	}
	long := wk("w1", s, 241, 6)
	if _, ok := BestCredit(rule(), mon, []Workout{long}, []Proof{pf("p", "w1", s, s)}, 5); ok {
		t.Error("4시간 넘는 운동")
	}
}

func TestJudge_만회_면제권_빠짐(t *testing.T) {
	r := rule()
	next := kst(2026, 11, 17, 19, 0)
	make10 := wk("w2", next, 70, 10)
	make9 := wk("w2", next, 70, 9)
	proofNext := []Proof{pf("p2", "w2", next.Add(time.Minute), next.Add(2*time.Minute))}
	open := &DayRow{Day: mon, Result: ResMissedOpen}

	// 확정 시각 전에는 missed_open 그대로
	if _, ok := Judge(JudgeInput{Rule: r, Day: mon, Prev: open, Workouts: []Workout{make10}, Proofs: proofNext, Now: mon.Finalize().Add(-time.Minute)}); ok {
		t.Fatal("확정 전")
	}
	at := mon.Finalize()
	row, _ := Judge(JudgeInput{Rule: r, Day: mon, Prev: open, Workouts: []Workout{make10}, Proofs: proofNext, Now: at})
	if row.Result != ResMadeUp || !row.Final || row.ProofID != "p2" {
		t.Fatalf("10세트 만회: %+v", row)
	}
	// 9세트(2배 미달) + 면제권 남음 → 면제
	row, _ = Judge(JudgeInput{Rule: r, Day: mon, Prev: open, Workouts: []Workout{make9}, Proofs: proofNext, Now: at})
	if row.Result != ResPass {
		t.Fatalf("면제: %+v", row)
	}
	// 그 주 면제권을 이미 씀 → 빠짐
	row, _ = Judge(JudgeInput{Rule: r, Day: mon, Prev: open, Workouts: []Workout{make9}, Proofs: proofNext, PassesUsed: 1, Now: at})
	if row.Result != ResMissed || !row.Final {
		t.Fatalf("빠짐: %+v", row)
	}
	// 면제권 0 규칙
	r0 := r
	r0.PassPerWeek = 0
	row, _ = Judge(JudgeInput{Rule: r0, Day: mon, Prev: open, Now: at})
	if row.Result != ResMissed {
		t.Fatal("면제권 없음")
	}
	// 첫 판정을 확정 시각 뒤에 처음 돌려도(서버가 오래 꺼져 있었음) 한 번에 확정
	row, _ = Judge(JudgeInput{Rule: r, Day: mon, Workouts: []Workout{make10}, Proofs: proofNext, Now: at.Add(time.Hour)})
	if row.Result != ResMadeUp {
		t.Fatalf("늦은 첫 판정: %+v", row)
	}
	// 같은 입력이면 같은 결과
	a, _ := Judge(JudgeInput{Rule: r, Day: mon, Prev: open, Workouts: []Workout{make9}, Proofs: proofNext, Now: at})
	b, _ := Judge(JudgeInput{Rule: r, Day: mon, Prev: open, Workouts: []Workout{make9}, Proofs: proofNext, Now: at})
	if *a != *b {
		t.Fatal("멱등")
	}
}

func TestJudge_마지막날_다음날_만회(t *testing.T) {
	r := rule()
	last := r.LastDay()
	after := last.Add(1)
	s := after.Start().Add(15 * time.Hour)
	row, _ := Judge(JudgeInput{Rule: r, Day: last, Prev: &DayRow{Day: last, Result: ResMissedOpen},
		Workouts: []Workout{wk("w", s, 60, 10)}, Proofs: []Proof{pf("p", "w", s, s)}, Now: last.Finalize()})
	if row.Result != ResMadeUp {
		t.Fatalf("%+v", row)
	}
}

func TestRejudge_이의_무효(t *testing.T) {
	r := rule()
	s := kst(2026, 11, 16, 19, 0)
	w := wk("w1", s, 60, 6)
	p := pf("p1", "w1", s, s)
	p.Status = ProofInvalid
	// 확정 시각 전이면 missed_open 으로(다음 날 만회 가능)
	row := Rejudge(JudgeInput{Rule: r, Day: mon, Prev: &DayRow{Result: ResDone, Final: true}, Workouts: []Workout{w}, Proofs: []Proof{p}, Now: mon.FirstJudge().Add(time.Hour)})
	if row == nil || row.Result != ResMissedOpen {
		t.Fatalf("%+v", row)
	}
	// 확정 시각 뒤면 바로 확정
	row = Rejudge(JudgeInput{Rule: r, Day: mon, Workouts: []Workout{w}, Proofs: []Proof{p}, PassesUsed: 1, Now: mon.Finalize()})
	if row.Result != ResMissed {
		t.Fatalf("%+v", row)
	}
}

func TestMajority(t *testing.T) {
	for n, want := range map[int]int{0: 0, 1: 1, 2: 2, 3: 2, 4: 3, 9: 5} {
		if Majority(n) != want {
			t.Errorf("n=%d", n)
		}
	}
}

func TestDraft_검사(t *testing.T) {
	today := mon
	ok := Draft{Title: " 아침 운동 ", StartsOn: today.Add(1), Weeks: 4, RuleKind: "daily", Weekdays: 3, MinSets: 5, ProofMode: ModeGym, Penalty: "커피", PassPerWeek: 1}
	got, err := ok.Validate(today)
	if err != nil || got.Weekdays != 127 || got.Title != "아침 운동" {
		t.Fatalf("%v %+v", err, got)
	}
	bad := []func(d *Draft){
		func(d *Draft) { d.Title = "" },
		func(d *Draft) { d.StartsOn = today },
		func(d *Draft) { d.StartsOn = today.Add(31) },
		func(d *Draft) { d.Weeks = 9 },
		func(d *Draft) { d.MinSets = 0 },
		func(d *Draft) { d.ProofMode = "x" },
		func(d *Draft) { d.RuleKind = "weekdays"; d.Weekdays = 0 },
		func(d *Draft) { d.PassPerWeek = 2 },
		func(d *Draft) { d.Penalty = string(make([]rune, 61)) },
	}
	for i, f := range bad {
		d := ok
		f(&d)
		if _, err := d.Validate(today); err == nil {
			t.Errorf("bad %d 통과", i)
		}
	}
}

func TestPromptCode(t *testing.T) {
	if PromptCode(ModeGym, 0) != "v:rack" || PromptCode(ModeAnyPhoto, 7) != "thumb" {
		t.Fatal(PromptCode(ModeGym, 0), PromptCode(ModeAnyPhoto, 7))
	}
}

// 이의 마감은 챌린지 끝(마지막 날 확정)을 넘지 않는다(REV-160 5) — 마지막 날 만회 인증의 날은 LastDay+1.
func TestFlagDeadline_끝을_넘지_않음(t *testing.T) {
	c := Challenge{Rule: Rule{StartsOn: DayFromDate(2020, 3, 2), Weeks: 1, RuleKind: "daily", Weekdays: 127}}
	last := c.Rule.LastDay()
	if got := flagDeadline(c, last.Add(1)); !got.Equal(last.Finalize()) {
		t.Fatalf("만회 날 %v", got)
	}
	mid := DayFromDate(2020, 3, 3)
	if got := flagDeadline(c, mid); !got.Equal(mid.Finalize()) {
		t.Fatalf("중간 날 %v", got)
	}
}
