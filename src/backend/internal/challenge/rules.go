// 그룹 챌린지 규칙(SPEC-064 · SRS-118~120) — DB·서버 없이 시험하는 순수 함수만 둔다.
//
// 하루 = 04:00 KST ~ 다음 날 04:00(밤늦게 한 운동도 그날로). 시각은 늘 인자(now)로 받는다.
// 판정 순서(REV-159):
//
//	첫 판정(D 끝 + 12시간)  그때 서버에 있는 기록으로 done(확정) 또는 missed_open
//	확정(D+1 끝 + 12시간)   missed_open → made_up(다음 날 한 운동 세트 ≥ 최소×2) → pass(그 주 면제권) → missed(+벌칙 1)
//	얼림                    final 행은 다시 읽지 않는다 — 이의로 인증이 무효가 될 때만 다시 판정한다
package challenge

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

var KST = mustLoc("Asia/Seoul")

func mustLoc(name string) *time.Location {
	l, err := time.LoadLocation(name)
	if err != nil {
		return time.FixedZone("KST", 9*3600) // 한국은 서머타임이 없다
	}
	return l
}

const (
	DayBoundaryHour = 4
	JudgeGrace      = 12 * time.Hour // 하루 끝 뒤 동기 여유
	PromptTTL       = 3 * time.Minute
	ProofBefore     = 10 * time.Minute // 운동 시작 −10분까지 지시 발급 허용(시계 어긋남)
	ProofAfter      = 30 * time.Minute // 운동 끝 +30분까지 사진 인정
	MaxWorkout      = 4 * time.Hour
	ReminderHour    = 21
	MaxMembers      = 10
	MaxActive       = 5
	PhotoRetention  = 30 * 24 * time.Hour
)

const (
	StatusRecruiting = "recruiting"
	StatusActive     = "active"
	StatusEnded      = "ended"
	StatusCancelled  = "cancelled"

	ModeGym      = "gym"
	ModeAnyPhoto = "any_photo"
	ModeRecord   = "record"

	ResDone       = "done"
	ResMadeUp     = "made_up"
	ResPass       = "pass"
	ResMissedOpen = "missed_open"
	ResMissed     = "missed"
	ResRest       = "rest"

	ProofOK      = "ok"
	ProofSuspect = "suspect_dup"
	ProofInvalid = "invalid"
)

// Day 는 KST 달력 날짜다(UTC 자정으로 정규화한 time.Time — 비교·더하기가 쉽다).
type Day struct{ t time.Time }

func DayFromDate(y int, m time.Month, d int) Day {
	return Day{time.Date(y, m, d, 0, 0, 0, 0, time.UTC)}
}

func ParseDay(s string) (Day, error) {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return Day{}, err
	}
	return Day{t}, nil
}

// DayFromTime 은 DB date(UTC 자정 time)를 그대로 Day 로 읽는다.
func DayFromTime(t time.Time) Day { return DayFromDate(t.Year(), t.Month(), t.Day()) }

func (d Day) String() string    { return d.t.Format("2006-01-02") }
func (d Day) Time() time.Time   { return d.t }
func (d Day) Add(n int) Day     { return Day{d.t.AddDate(0, 0, n)} }
func (d Day) Before(o Day) bool { return d.t.Before(o.t) }
func (d Day) After(o Day) bool  { return d.t.After(o.t) }
func (d Day) Equal(o Day) bool  { return d.t.Equal(o.t) }
func (d Day) IsZero() bool      { return d.t.IsZero() }
func (d Day) Sub(o Day) int     { return int(d.t.Sub(o.t).Hours() / 24) }
func (d Day) Weekday0Mon() int  { return (int(d.t.Weekday()) + 6) % 7 } // 0 = 월 … 6 = 일
func (d Day) Start() time.Time {
	return time.Date(d.t.Year(), d.t.Month(), d.t.Day(), DayBoundaryHour, 0, 0, 0, KST)
}
func (d Day) End() time.Time        { return d.Add(1).Start() }
func (d Day) FirstJudge() time.Time { return d.End().Add(JudgeGrace) }
func (d Day) Finalize() time.Time   { return d.Add(1).End().Add(JudgeGrace) }
func (d Day) Reminder() time.Time {
	return time.Date(d.t.Year(), d.t.Month(), d.t.Day(), ReminderHour, 0, 0, 0, KST)
}

// DayOf 는 시각 t 가 속한 챌린지 날짜다(04:00 KST 경계).
func DayOf(t time.Time) Day {
	k := t.In(KST).Add(-DayBoundaryHour * time.Hour)
	return DayFromDate(k.Year(), k.Month(), k.Day())
}

// Rule 은 시작 뒤 바뀌지 않는 챌린지 규칙이다.
type Rule struct {
	StartsOn    Day
	Weeks       int
	RuleKind    string // daily | weekdays
	Weekdays    int    // 비트 0 = 월 … 6 = 일
	MinSets     int
	ProofMode   string
	PassPerWeek int
}

func (r Rule) LastDay() Day { return r.StartsOn.Add(7*r.Weeks - 1) }

func (r Rule) InRange(d Day) bool { return !d.Before(r.StartsOn) && !d.After(r.LastDay()) }

// IsRequired: 기간 안이고 그 요일 비트가 켜졌는가.
func (r Rule) IsRequired(d Day) bool {
	return r.InRange(d) && r.Weekdays&(1<<d.Weekday0Mon()) != 0
}

// WeekIndex: 시작일부터 7일 단위 주 번호(면제권 단위).
func (r Rule) WeekIndex(d Day) int { return d.Sub(r.StartsOn) / 7 }

func (r Rule) NeedsPhoto() bool { return r.ProofMode != ModeRecord }

// ── 입력 검사 ─────────────────────────────────────────────────────────────

var ErrInvalid = errors.New("challenge: invalid argument")

type Draft struct {
	Title       string
	StartsOn    Day
	Weeks       int
	RuleKind    string
	Weekdays    int
	MinSets     int
	ProofMode   string
	Penalty     string
	PassPerWeek int
}

// Validate 는 만들기·고치기 입력을 검사하고 정규화한 값을 돌려준다. today = DayOf(now).
func (d Draft) Validate(today Day) (Draft, error) {
	d.Title = strings.TrimSpace(d.Title)
	d.Penalty = strings.TrimSpace(d.Penalty)
	n := utf8.RuneCountInString(d.Title)
	switch {
	case n < 1 || n > 30:
		return d, ErrInvalid
	case utf8.RuneCountInString(d.Penalty) > 60:
		return d, ErrInvalid
	case d.Weeks < 1 || d.Weeks > 8:
		return d, ErrInvalid
	case d.MinSets < 1 || d.MinSets > 30:
		return d, ErrInvalid
	case d.PassPerWeek != 0 && d.PassPerWeek != 1:
		return d, ErrInvalid
	case d.ProofMode != ModeGym && d.ProofMode != ModeAnyPhoto && d.ProofMode != ModeRecord:
		return d, ErrInvalid
	case d.StartsOn.Before(today.Add(1)) || d.StartsOn.After(today.Add(30)):
		return d, ErrInvalid
	}
	switch d.RuleKind {
	case "daily":
		d.Weekdays = 127
	case "weekdays":
		if d.Weekdays < 1 || d.Weekdays > 127 {
			return d, ErrInvalid
		}
	default:
		return d, ErrInvalid
	}
	return d, nil
}

// ── 판정 ──────────────────────────────────────────────────────────────────

// Workout 은 서버에 동기된 완료 운동 하나(앱 기록·지우지 않음)다. Sets = 웜업 뺀 완료 세트 수.
type Workout struct {
	ID          string
	StartedAt   time.Time
	CompletedAt time.Time
	Sets        int
}

// Proof 는 인증 사진 한 장이다(시각은 서버 시각).
type Proof struct {
	ID         string
	WorkoutID  string
	IssuedAt   time.Time
	CapturedAt time.Time
	Status     string
}

func (w Workout) usable() bool {
	return !w.CompletedAt.Before(w.StartedAt) && w.CompletedAt.Sub(w.StartedAt) <= MaxWorkout
}

// ProofFits: 그 운동에 붙은 유효 인증인가 — 운동 시작 −10분 ≤ 지시 발급, 받은 시각 ≤ 운동 끝 +30분(REV-159).
func ProofFits(w Workout, p Proof) bool {
	if p.WorkoutID != w.ID || p.Status == ProofInvalid {
		return false
	}
	if p.IssuedAt.Before(w.StartedAt.Add(-ProofBefore)) {
		return false
	}
	return !p.CapturedAt.After(w.CompletedAt.Add(ProofAfter))
}

// Credit 은 한 날의 인정 근거다.
type Credit struct {
	WorkoutID string
	Sets      int
	ProofID   string
}

// BestCredit: 그날(DayOf(started_at) == day) 운동 중 minSets 이상이고(사진 방식이면 유효 인증이 붙은) 세트가 가장 많은 것.
func BestCredit(r Rule, day Day, ws []Workout, ps []Proof, minSets int) (Credit, bool) {
	var best Credit
	ok := false
	for _, w := range ws {
		if !w.usable() || !DayOf(w.StartedAt).Equal(day) || w.Sets < minSets {
			continue
		}
		proofID := ""
		if r.NeedsPhoto() {
			for _, p := range ps {
				if ProofFits(w, p) {
					proofID = p.ID
					break
				}
			}
			if proofID == "" {
				continue
			}
		}
		if !ok || w.Sets > best.Sets {
			best, ok = Credit{WorkoutID: w.ID, Sets: w.Sets, ProofID: proofID}, true
		}
	}
	return best, ok
}

// DayRow 는 challenge_days 한 행이다.
type DayRow struct {
	Day       Day
	Result    string
	Final     bool
	WorkoutID string
	Sets      int
	ProofID   string
}

// JudgeInput 은 한 사람·한 날의 판정 입력이다.
type JudgeInput struct {
	Rule       Rule
	Day        Day
	Prev       *DayRow   // 없으면 nil
	Workouts   []Workout // 그날과 다음 날 운동
	Proofs     []Proof
	PassesUsed int // 그 주에 이미 확정된 pass 수(이 날 제외)
	Now        time.Time
}

// Judge 는 다음 상태를 돌려준다. 바뀔 것이 없으면 (nil, false). 같은 입력이면 같은 결과다(멱등).
//   - 쉬는 날·기간 밖은 행을 만들지 않는다(화면이 계산한다).
//   - final 행은 건드리지 않는다(얼림). 다시 판정은 Rejudge 로.
func Judge(in JudgeInput) (*DayRow, bool) {
	r, d := in.Rule, in.Day
	if !r.IsRequired(d) {
		return nil, false
	}
	if in.Prev != nil && in.Prev.Final {
		return nil, false
	}
	if in.Prev == nil {
		if in.Now.Before(d.FirstJudge()) {
			return nil, false
		}
		if c, ok := BestCredit(r, d, in.Workouts, in.Proofs, r.MinSets); ok {
			return &DayRow{Day: d, Result: ResDone, Final: true, WorkoutID: c.WorkoutID, Sets: c.Sets, ProofID: c.ProofID}, true
		}
		row := &DayRow{Day: d, Result: ResMissedOpen}
		if !in.Now.Before(d.Finalize()) {
			return finalize(in, row), true
		}
		return row, true
	}
	// missed_open
	if in.Now.Before(d.Finalize()) {
		return nil, false
	}
	return finalize(in, &DayRow{Day: d, Result: ResMissedOpen}), true
}

func finalize(in JudgeInput, row *DayRow) *DayRow {
	r, d := in.Rule, in.Day
	if c, ok := BestCredit(r, d.Add(1), in.Workouts, in.Proofs, r.MinSets*2); ok {
		return &DayRow{Day: d, Result: ResMadeUp, Final: true, WorkoutID: c.WorkoutID, Sets: c.Sets, ProofID: c.ProofID}
	}
	if in.PassesUsed < r.PassPerWeek {
		return &DayRow{Day: d, Result: ResPass, Final: true}
	}
	return &DayRow{Day: d, Result: ResMissed, Final: true}
}

// Rejudge 는 이의로 인증이 무효가 된 날을 처음부터 다시 판정한다(얼림 예외 · REV-159).
// in.Prev 는 무시하고, 아직 첫 판정 시각 전이면 nil(행 지움)을 돌려준다.
func Rejudge(in JudgeInput) *DayRow {
	in.Prev = nil
	row, ok := Judge(in)
	if !ok {
		return nil
	}
	return row
}

// Majority: 인증 주인을 뺀 활성 멤버 n 명 중 과반. n = 0 이면 이의할 수 없다(0).
func Majority(n int) int {
	if n <= 0 {
		return 0
	}
	return n/2 + 1
}

// LiveStatus 는 아직 행이 없는 날의 화면용 값이다(확정 전 실시간 — 저장하지 않는다).
func LiveStatus(r Rule, d Day, today Day, credited bool) string {
	switch {
	case !r.InRange(d):
		return ""
	case !r.IsRequired(d):
		return ResRest
	case credited:
		return ResDone
	case d.After(today):
		return "upcoming"
	case d.Equal(today):
		return "today"
	default:
		return "pending" // 판정 대기(동기 여유 12시간)
	}
}

// ── 지시 ──────────────────────────────────────────────────────────────────

var (
	promptHands = []string{"v", "thumb", "palm", "fist", "ok", "three"}
	promptGear  = []string{"rack", "bench", "cable", "dumbbell", "machine", "plate"}
)

// PromptCode 는 n(난수)으로 지시 코드를 고른다 — gym = 「손:기구」, 그 밖 = 「손」.
func PromptCode(mode string, n uint32) string {
	h := promptHands[n%uint32(len(promptHands))]
	if mode == ModeGym {
		return h + ":" + promptGear[(n/uint32(len(promptHands)))%uint32(len(promptGear))]
	}
	return h
}
