// @plm SRS-080  트레이너 리포트용 원본 레코드 — 허용 목록만 내준다 (ADR-040 개정 · S-2·S-3·S-15)
//
// ─────────────────────────────────────────────────────────────────────────────
// 트레이너 리포트는 이제 트레이너 기기의 core(memberReportFromRecords → periodSummary)가 계산한다 —
// 회원 요약과 **같은 함수**라 같은 숫자가 나온다(ADR-040). 서버는 원본을 내주되 최소한만:
//
//	· 컬렉션 = 서버 상수 4종(workouts·workout_exercises·set_logs·exercises). 요청에 컬렉션 칸은 없다.
//	  user_profiles(체중·이메일·설정)·bodyweight_logs·import_batches·import_aliases 는 **영원히 넣지 않는다**
//	  (SRS-048 신체정보 기본 제외 · 테스트가 고정한다)
//	· 칸 = 컬렉션별 허용 목록(projection). notes·note·image_url·prescription·prev_* 같은 자유 글·주소·처방은 없다
//	· 기간 = 요청 [start, end)에 대해 [start − 길이, end)(직전 기간 비교용). 길이 ≤ 400일
//	· 행 = 완료된 운동 → 그 운동의 블록 → 그 블록의 세트 → 그 블록이 실제로 쓴 커스텀 종목만
//	· 응답 2MB 를 넘으면 ResourceExhausted("기간을 줄여 주세요")
//
// ── 서버가 payload 를 읽는 예외 ─────────────────────────────────────────────
// 동기는 payload 를 해석하지 않는다. 기간 필터를 위해 여기서 started_at·state·*_id 를 읽는 것은
// ADR-040 개정이 명시한 예외다. 모르는 모양에는 관대하다 — 못 읽는 레코드는 그 레코드만 뺀다.
//
// ── 읽기 비용(S-15 · /qa code CS-4) ─────────────────────────────────────────
// 전 이력을 Go 로 올리지 않는다. SQL 이 ① 기간 안에 시작한 완료 운동 → ② 그 운동 id 의 블록 → ③ 그 블록 id 의
// 세트 → ④ 쓰인 종목 id 의 종목 순서로 거르고(record_id 키셋 500개씩), 읽은 payload 바이트를 16MB 예산에서 뺀다 —
// 넘으면 다음 페이지를 읽지 않고 ResourceExhausted. Go 필터(selectMemberRecords)는 그대로 한 번 더 돈다(방어).
// 표현식 인덱스는 아직 없다 — (user_id, collection, record_id) 유일 인덱스가 회원·컬렉션까지 좁히고, 나머지는 PG 가
// 그 회원의 행만 훑는다. 운영 표가 커져 응답 시간이 문제 되면 started_at·workout_id 표현식 인덱스를 새 마이그레이션으로.
//
// ── 내주는 기간(CS-9 · 문서화) ──────────────────────────────────────────────
// 요청 길이 ≤ 400일이고, 내주는 기간은 직전 같은 길이까지라 **최대 800일**이다(core periodSummary 의 직전 대비가
// 같은 길이를 요구한다). 동의 시각(consent_at)보다 앞선 기록도 포함된다 — 회원이 logView 를 켠 것이 "기록 열람" 동의이고,
// 옛 GetMemberReport 도 동의 이전 기록을 집계했다. 이 상한·정책은 ADR-040 개정에 적어 둔다(서버 상수 = maxPeriod).
// ─────────────────────────────────────────────────────────────────────────────
package coaching

import (
	"context"
	"encoding/json"
	"sort"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// 응답 상한 — 1년 표본 추정 2–4MB 를 projection 이 1/3 로 줄인다(S-15). 넘으면 기간을 줄이게 한다.
const maxMemberRecordsBytes = 2 << 20

// 읽기 예산 — 저장소가 읽은 원본 payload 바이트 합(CS-4). 응답 상한의 8배: 허용 칸만 남기면 1/3 안팎이라
// 정상 기록은 응답 상한에 먼저 닿는다. 이 예산은 큰 레코드로 부풀린 이력을 끝까지 읽지 않게 하는 안전망이다.
const maxMemberRecordsReadBytes = 16 << 20

// 트레이너가 같은 회원 원본을 되풀이해 열면 감사는 10분에 한 번만(CS-7) — 기간이 달라도 같은 열람으로 본다.
const recordsViewAuditWindow = 10 * time.Minute

// ReadBudget은 저장소가 읽어도 되는 바이트가 얼마 남았는지다. 넘으면 ResourceExhausted.
type ReadBudget struct{ left int }

func newReadBudget(n int) *ReadBudget { return &ReadBudget{left: n} }

// Take는 n 바이트를 쓴다. 예산을 넘으면 오류 — 부르는 쪽은 더 읽지 않고 멈춘다.
func (b *ReadBudget) Take(n int) error {
	b.left -= n
	if b.left < 0 {
		return errs.New(errs.ResourceExhausted, "too many records for this period — choose a shorter period")
	}
	return nil
}

// memberRecordCollections는 GetMemberRecords 가 읽는 컬렉션 **전부**다. 여기 없는 컬렉션은 나가지 않는다.
// bodyweight_logs·import_batches·import_aliases·user_profiles 를 넣지 않는다(SRS-048 · S-2 · D-17 테스트).
var memberRecordCollections = []string{"workouts", "workout_exercises", "set_logs", "exercises"}

// memberRecordFields는 컬렉션별 허용 칸(projection)이다. 레코드에 없는 칸은 없는 대로 둔다.
// 이 목록 밖의 칸은 응답에 **절대** 나가지 않는다(테스트가 고정한다).
var memberRecordFields = map[string][]string{
	"workouts": {
		"id", "state", "started_at", "completed_at", "duration_seconds", "total_volume_kg", "pr_count",
		"routine_id", "source",
	},
	"workout_exercises": {
		"id", "workout_id", "exercise_id", "sort_order", "weight_unit",
		"variant_key", "variant_equipment", "variant_grip", "variant_arm", "variant_load", "variant_attach",
	},
	"set_logs": {
		"id", "workout_exercise_id", "set_number", "weight_kg", "reps", "rpe", "rir", "is_warmup", "is_failed",
		"is_drop", "set_type", "done", "load_multiplier", "load_adjust_kg", "strict_reps", "partial_reps",
		"duration_sec", "distance_m",
	},
	// 커스텀 종목만(시드 종목은 서버 카탈로그·기기 카탈로그에 있다). image_url 은 업로드 주소라 뺀다.
	"exercises": {
		"id", "name_ko", "name_en", "primary_muscles", "secondary_muscles", "equipment", "kind", "load_mode",
	},
}

// MemberRecords는 GetMemberRecords 의 결과다. 각 원소 = 허용 칸만 남긴 JSON 객체.
type MemberRecords struct {
	Workouts         []string
	WorkoutExercises []string
	SetLogs          []string
	Exercises        []string
	ServedStart      time.Time
	ServedEnd        time.Time
}

// GetMemberRecords는 트레이너(viewer)에게 회원의 원본 레코드를 허용 목록만큼 내준다(scope=logView).
func (s *Service) GetMemberRecords(ctx context.Context, viewerID, memberID string, startMs, endMs int64) (MemberRecords, error) {
	if err := requireIdentity(viewerID); err != nil {
		return MemberRecords{}, err
	}
	start, end, err := checkPeriod(startMs, endMs, s.now())
	if err != nil {
		return MemberRecords{}, err
	}
	// 차단도 본다(CS-3).
	g, err := s.assertCoachingAccess(ctx, viewerID, memberID, ScopeLogView)
	if err != nil {
		return MemberRecords{}, err
	}

	// 직전 같은 길이까지 — delta 계산용(ADR-040 개정 · S-3).
	servedStart := start.Add(-end.Sub(start))
	recs, err := s.loadMemberRecords(ctx, memberID, servedStart, end)
	if err != nil {
		return MemberRecords{}, err
	}
	out, err := selectMemberRecords(recs, servedStart, end)
	if err != nil {
		return MemberRecords{}, err
	}

	detail, _ := json.Marshal(map[string]any{
		"servedStart":      out.ServedStart.UnixMilli(),
		"servedEnd":        out.ServedEnd.UnixMilli(),
		"workouts":         len(out.Workouts),
		"workoutExercises": len(out.WorkoutExercises),
		"setLogs":          len(out.SetLogs),
		"exercises":        len(out.Exercises),
	})
	s.auditOnce(ctx, g.ID, viewerID, ActionRecordsView, detail, recordsViewAuditWindow, false)
	return out, nil
}

// loadMemberRecords는 [from, to)에 필요한 행만 SQL 로 거른다(CS-4) — 운동 → 블록 → 세트 → 쓰인 종목.
// 부모 id 가 하나도 없으면 다음 단계를 묻지 않는다. 컬렉션 이름은 memberRecordCollections 에서만 나온다.
func (s *Service) loadMemberRecords(ctx context.Context, memberID string, from, to time.Time) ([]MemberRecord, error) {
	b := newReadBudget(maxMemberRecordsReadBytes)
	workouts, err := s.repo.ListMemberWorkoutsStartedIn(ctx, memberID, from.UnixMilli(), to.UnixMilli(), b)
	if err != nil {
		return nil, err
	}
	out := append([]MemberRecord{}, workouts...)
	workoutIDs := recordIDs(workouts)
	if len(workoutIDs) == 0 {
		return out, nil
	}
	blocks, err := s.repo.ListMemberRecordsByParent(ctx, memberID, "workout_exercises", "workout_id", workoutIDs, b)
	if err != nil {
		return nil, err
	}
	out = append(out, blocks...)
	blockIDs := recordIDs(blocks)
	if len(blockIDs) == 0 {
		return out, nil
	}
	sets, err := s.repo.ListMemberRecordsByParent(ctx, memberID, "set_logs", "workout_exercise_id", blockIDs, b)
	if err != nil {
		return nil, err
	}
	out = append(out, sets...)
	seen := map[string]bool{}
	var exerciseIDs []string
	for _, we := range blocks {
		var obj map[string]json.RawMessage
		if json.Unmarshal(we.Payload, &obj) != nil {
			continue
		}
		if ex := rawStr(obj, "exercise_id"); ex != "" && !seen[ex] {
			seen[ex] = true
			exerciseIDs = append(exerciseIDs, ex)
		}
	}
	if len(exerciseIDs) == 0 {
		return out, nil
	}
	exercises, err := s.repo.ListMemberRecordsByIDs(ctx, memberID, "exercises", exerciseIDs, b)
	if err != nil {
		return nil, err
	}
	return append(out, exercises...), nil
}

func recordIDs(recs []MemberRecord) []string {
	out := make([]string, 0, len(recs))
	for _, r := range recs {
		if r.RecordID != "" {
			out = append(out, r.RecordID)
		}
	}
	return out
}

// selectMemberRecords는 [from, to)에 시작한 **완료된** 운동과 그 자식만 골라 허용 칸으로 줄인다.
func selectMemberRecords(recs []MemberRecord, from, to time.Time) (MemberRecords, error) {
	type row struct {
		id  string
		obj map[string]json.RawMessage
	}
	cols := map[string][]row{}
	for _, rec := range recs {
		fields, allowed := memberRecordFields[rec.Collection]
		if !allowed || len(fields) == 0 {
			continue // 저장소가 다른 컬렉션을 돌려줘도 여기서 막는다
		}
		var obj map[string]json.RawMessage
		if err := json.Unmarshal(rec.Payload, &obj); err != nil {
			continue
		}
		cols[rec.Collection] = append(cols[rec.Collection], row{id: rec.RecordID, obj: obj})
	}

	fromMs, toMs := float64(from.UnixMilli()), float64(to.UnixMilli())

	// ① 기간 안에 시작한 완료 운동.
	var workouts []row
	workoutIDs := map[string]bool{}
	for _, w := range cols["workouts"] {
		if rawStr(w.obj, "state") != "completed" {
			continue
		}
		at, ok := rawNum(w.obj, "started_at")
		if !ok || at < fromMs || at >= toMs {
			continue
		}
		id := rawStr(w.obj, "id")
		if id == "" {
			continue
		}
		workouts = append(workouts, w)
		workoutIDs[id] = true
	}

	// ② 그 운동의 블록 · 쓰인 종목.
	var blocks []row
	blockIDs := map[string]bool{}
	usedExercises := map[string]bool{}
	for _, we := range cols["workout_exercises"] {
		if !workoutIDs[rawStr(we.obj, "workout_id")] {
			continue
		}
		id := rawStr(we.obj, "id")
		if id == "" {
			continue
		}
		blocks = append(blocks, we)
		blockIDs[id] = true
		if ex := rawStr(we.obj, "exercise_id"); ex != "" {
			usedExercises[ex] = true
		}
	}

	// ③ 그 블록의 세트.
	var sets []row
	for _, sl := range cols["set_logs"] {
		if blockIDs[rawStr(sl.obj, "workout_exercise_id")] {
			sets = append(sets, sl)
		}
	}

	// ④ 실제로 쓰인 커스텀 종목만. is_custom 이 명시적으로 false 면(예전에 동기된 시드 종목) 뺀다.
	var exercises []row
	for _, e := range cols["exercises"] {
		if !usedExercises[rawStr(e.obj, "id")] {
			continue
		}
		if custom, present := rawBool(e.obj, "is_custom"); present && !custom {
			continue
		}
		exercises = append(exercises, e)
	}

	out := MemberRecords{ServedStart: from, ServedEnd: to}
	size := 0
	project := func(collection string, rows []row) ([]string, error) {
		sort.Slice(rows, func(i, j int) bool { return rows[i].id < rows[j].id }) // 매번 같은 순서
		fields := memberRecordFields[collection]
		list := make([]string, 0, len(rows))
		for _, r := range rows {
			// 허용 칸 구조만 다시 만든다 — 원본 map 을 그대로 내보내지 않는다(projection 이 저절로 지켜진다).
			kept := make(map[string]json.RawMessage, len(fields))
			for _, f := range fields {
				if v, ok := r.obj[f]; ok {
					kept[f] = v
				}
			}
			b, err := json.Marshal(kept)
			if err != nil {
				continue
			}
			size += len(b)
			if size > maxMemberRecordsBytes {
				return nil, errs.New(errs.ResourceExhausted, "too many records for this period — choose a shorter period")
			}
			list = append(list, string(b))
		}
		return list, nil
	}
	var err error
	if out.Workouts, err = project("workouts", workouts); err != nil {
		return MemberRecords{}, err
	}
	if out.WorkoutExercises, err = project("workout_exercises", blocks); err != nil {
		return MemberRecords{}, err
	}
	if out.SetLogs, err = project("set_logs", sets); err != nil {
		return MemberRecords{}, err
	}
	if out.Exercises, err = project("exercises", exercises); err != nil {
		return MemberRecords{}, err
	}
	return out, nil
}

func rawStr(obj map[string]json.RawMessage, key string) string {
	var s string
	if v, ok := obj[key]; ok && json.Unmarshal(v, &s) == nil {
		return s
	}
	return ""
}

func rawNum(obj map[string]json.RawMessage, key string) (float64, bool) {
	var n float64
	if v, ok := obj[key]; ok && json.Unmarshal(v, &n) == nil {
		return n, true
	}
	return 0, false
}

func rawBool(obj map[string]json.RawMessage, key string) (value, present bool) {
	var b bool
	if v, ok := obj[key]; ok && json.Unmarshal(v, &b) == nil {
		return b, true
	}
	return false, false
}
