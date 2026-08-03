// @plm SRS-048  회원 리포트·루틴 집계 — **사실만** (ADR-028)
//
// ─────────────────────────────────────────────────────────────────────────────
// 회원이 동기해 둔 레코드를 읽어 숫자로 만든다. 여기 있는 것은 전부 **일어난 일**이다:
// 몇 번 했는지, 얼마나 들었는지, 어느 부위에 얼마나. "이 부위가 부족하다" 같은 판단은 없다 —
// 그 말은 트레이너가 할 말이고, 서버가 하면 근거 없는 처방이 된다(ADR-028).
//
// ── 서버가 레코드의 속을 읽는 유일한 자리 ───────────────────────────────────
// 동기(sync)는 payload를 해석하지 않는다. 여기만 예외다. 그래서 **모르는 모양에 관대하다** —
// 필드가 없거나 타입이 다르면 그 레코드만 건너뛰고 나머지로 집계한다. 앱이 컬럼을 하나 바꿨다고
// 트레이너 화면이 통째로 비면 안 된다.
//
// ── 세지 않는 것 ────────────────────────────────────────────────────────────
// 워밍업·실패한 세트·체크하지 않은 세트는 볼륨에서 뺀다. 넣으면 "많이 든 것처럼" 보이는데,
// 그 숫자를 보고 트레이너가 무게를 올리면 다치는 쪽은 회원이다.
// ─────────────────────────────────────────────────────────────────────────────
package coaching

import (
	"encoding/json"
	"sort"
	"time"
)

// 리포트가 보는 기간. 8주면 한 사이클을 넘겨 추세가 보이고, 옛날 일에 휘둘리지 않는다.
const reportWeeks = 8

var reportCollections = []string{"workouts", "workout_exercises", "set_logs", "exercises"}
var routineCollections = []string{"routines", "routine_exercises", "exercises"}

type MuscleVolume struct {
	Muscle   string
	VolumeKg float64
}

type SessionSummary struct {
	Name            string
	StartedAt       time.Time
	DurationSeconds int
	TotalVolumeKg   float64
	PRCount         int
}

type Report struct {
	Weeks           int
	SessionsCount   int
	SessionsPerWeek float64
	TotalVolumeKg   float64
	MuscleVolume    []MuscleVolume
	RecentSessions  []SessionSummary
}

type PrescribedSet struct {
	SetType   string
	TargetRIR *int
	RepMin    *int
	RepMax    *int
	LoadHint  string
}

type RoutineExercise struct {
	ID           string
	ExerciseID   string
	ExerciseName string
	TargetSets   int
	Prescription []PrescribedSet
}

type Routine struct {
	ID        string
	Name      string
	Exercises []RoutineExercise
}

// raw는 레코드 하나를 느슨하게 읽기 위한 도우미다. **없는 필드는 없는 대로** 둔다.
type raw map[string]any

func decode(payload []byte) (raw, bool) {
	var m raw
	if err := json.Unmarshal(payload, &m); err != nil {
		return nil, false
	}
	return m, true
}

func (r raw) str(key string) string {
	if v, ok := r[key].(string); ok {
		return v
	}
	return ""
}

func (r raw) num(key string) float64 {
	if v, ok := r[key].(float64); ok {
		return v
	}
	return 0
}

// boolAt은 세 값을 구분한다: 참·거짓·**없음**. 없는 것과 거짓은 다르다 —
// 예전 레코드에는 `done` 필드가 아예 없어서, 없으면 "한 것"으로 본다.
func (r raw) boolAt(key string) (value, present bool) {
	v, ok := r[key].(bool)
	return v, ok
}

func byCollection(recs []MemberRecord) map[string][]raw {
	out := make(map[string][]raw, 4)
	for _, rec := range recs {
		if m, ok := decode(rec.Payload); ok {
			out[rec.Collection] = append(out[rec.Collection], m)
		}
	}
	return out
}

// buildReport는 회원의 레코드를 8주치 사실로 압축한다.
func buildReport(recs []MemberRecord, now time.Time) Report {
	cols := byCollection(recs)
	since := now.Add(-time.Duration(reportWeeks) * 7 * 24 * time.Hour).UnixMilli()

	// ① 기간 안에 **끝난** 세션만. 하는 중인 운동은 아직 사실이 아니다.
	var sessions []raw
	workoutIDs := make(map[string]bool)
	for _, w := range cols["workouts"] {
		if w.str("state") != "completed" || w.num("started_at") < float64(since) {
			continue
		}
		sessions = append(sessions, w)
		workoutIDs[w.str("id")] = true
	}

	// ② 그 세션에 속한 종목만 추린다 — 기간 밖 세션의 세트가 볼륨에 섞이지 않게.
	exerciseOfBlock := make(map[string]string, len(cols["workout_exercises"]))
	for _, we := range cols["workout_exercises"] {
		if workoutIDs[we.str("workout_id")] {
			exerciseOfBlock[we.str("id")] = we.str("exercise_id")
		}
	}

	// ③ 종목 → 주 근육. 카탈로그도 회원의 기기에서 온다(커스텀 종목이 있을 수 있다).
	muscleOfExercise := make(map[string]string, len(cols["exercises"]))
	for _, e := range cols["exercises"] {
		muscleOfExercise[e.str("id")] = primaryMuscle(e.str("primary_muscles"))
	}

	// ④ 부위별 볼륨. **워밍업·실패·미체크 세트는 빼고**.
	muscleVol := make(map[string]float64)
	for _, s := range cols["set_logs"] {
		exerciseID, ok := exerciseOfBlock[s.str("workout_exercise_id")]
		if !ok {
			continue
		}
		if done, present := s.boolAt("done"); present && !done {
			continue
		}
		if warmup, present := s.boolAt("is_warmup"); present && warmup {
			continue
		}
		if failed, present := s.boolAt("is_failed"); present && failed {
			continue
		}
		volume := s.num("weight_kg") * s.num("reps")
		if volume <= 0 {
			continue
		}
		muscle := muscleOfExercise[exerciseID]
		if muscle == "" {
			muscle = "other"
		}
		muscleVol[muscle] += volume
	}

	volumes := make([]MuscleVolume, 0, len(muscleVol))
	var total float64
	for _, w := range sessions {
		total += w.num("total_volume_kg")
	}
	for muscle, v := range muscleVol {
		volumes = append(volumes, MuscleVolume{Muscle: muscle, VolumeKg: round(v)})
	}
	// 많이 한 부위부터. 같으면 이름 순 — 새로고침할 때마다 순서가 바뀌면 읽는 사람이 헷갈린다.
	sort.Slice(volumes, func(i, j int) bool {
		if volumes[i].VolumeKg != volumes[j].VolumeKg {
			return volumes[i].VolumeKg > volumes[j].VolumeKg
		}
		return volumes[i].Muscle < volumes[j].Muscle
	})

	// ⑤ 최근 세션 다섯 개 — 숫자만 보면 감이 안 온다.
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].num("started_at") > sessions[j].num("started_at")
	})
	recent := make([]SessionSummary, 0, 5)
	for _, w := range sessions {
		if len(recent) == 5 {
			break
		}
		recent = append(recent, SessionSummary{
			Name:            w.str("name"),
			StartedAt:       time.UnixMilli(int64(w.num("started_at"))),
			DurationSeconds: int(w.num("duration_seconds")),
			TotalVolumeKg:   round(w.num("total_volume_kg")),
			PRCount:         int(w.num("pr_count")),
		})
	}

	return Report{
		Weeks:           reportWeeks,
		SessionsCount:   len(sessions),
		SessionsPerWeek: roundTo1(float64(len(sessions)) / float64(reportWeeks)),
		TotalVolumeKg:   round(total),
		MuscleVolume:    volumes,
		RecentSessions:  recent,
	}
}

// primaryMuscle은 `["chest","triceps"]` 같은 **직렬화된 문자열**에서 첫 근육을 꺼낸다.
// 못 읽으면 빈 문자열 — 부르는 쪽이 'other'로 채운다.
func primaryMuscle(serialized string) string {
	if serialized == "" {
		return ""
	}
	var list []string
	if err := json.Unmarshal([]byte(serialized), &list); err != nil || len(list) == 0 {
		return ""
	}
	return list[0]
}

// buildRoutines는 회원의 루틴을 처방과 함께 돌려준다. 보관함에 넣은 루틴과
// 종목이 하나도 없는 루틴은 빼고 — 트레이너가 손댈 것이 없다.
func buildRoutines(recs []MemberRecord) []Routine {
	cols := byCollection(recs)

	nameOfExercise := make(map[string]string, len(cols["exercises"]))
	for _, e := range cols["exercises"] {
		nameOfExercise[e.str("id")] = e.str("name_ko")
	}

	blocksOfRoutine := make(map[string][]raw)
	for _, re := range cols["routine_exercises"] {
		id := re.str("routine_id")
		blocksOfRoutine[id] = append(blocksOfRoutine[id], re)
	}

	out := make([]Routine, 0, len(cols["routines"]))
	for _, r := range cols["routines"] {
		if archived, present := r.boolAt("is_archived"); present && archived {
			continue
		}
		blocks := blocksOfRoutine[r.str("id")]
		sort.SliceStable(blocks, func(i, j int) bool {
			return blocks[i].num("sort_order") < blocks[j].num("sort_order")
		})

		exercises := make([]RoutineExercise, 0, len(blocks))
		for _, b := range blocks {
			exerciseID := b.str("exercise_id")
			exercises = append(exercises, RoutineExercise{
				ID:           b.str("id"),
				ExerciseID:   exerciseID,
				ExerciseName: nameOfExercise[exerciseID],
				TargetSets:   int(b.num("target_sets")),
				Prescription: parsePrescription(b["prescription"]),
			})
		}
		if len(exercises) == 0 {
			continue
		}
		out = append(out, Routine{ID: r.str("id"), Name: r.str("name"), Exercises: exercises})
	}
	// 이름 순 — 저장 순서는 회원 기기마다 다르다.
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// parsePrescription은 `@json` 컬럼(직렬화된 문자열)에서 처방을 꺼낸다.
// 읽을 수 없으면 처방이 없는 것으로 본다 — 여기서 오류를 내면 루틴 전체가 안 보인다.
func parsePrescription(v any) []PrescribedSet {
	s, ok := v.(string)
	if !ok || s == "" {
		return nil
	}
	var rows []struct {
		SetType   string `json:"setType"`
		TargetRIR *int   `json:"targetRir"`
		RepMin    *int   `json:"repMin"`
		RepMax    *int   `json:"repMax"`
		LoadHint  string `json:"loadHint"`
	}
	if err := json.Unmarshal([]byte(s), &rows); err != nil {
		return nil
	}
	out := make([]PrescribedSet, 0, len(rows))
	for _, r := range rows {
		out = append(out, PrescribedSet{
			SetType: r.SetType, TargetRIR: r.TargetRIR, RepMin: r.RepMin, RepMax: r.RepMax, LoadHint: r.LoadHint,
		})
	}
	return SanitizePrescription(out)
}

func round(v float64) float64    { return float64(int64(v + 0.5)) }
func roundTo1(v float64) float64 { return float64(int64(v*10+0.5)) / 10 }
