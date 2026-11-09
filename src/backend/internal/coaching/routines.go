// 코치가 짠 루틴 보내기 (SPEC-050 P3b · ADR-062 · SRS-115)
//
// ─────────────────────────────────────────────────────────────────────────────
// 코치 기기의 초안(source_routine_id)을 **회원의 sync 레코드에 서버가 직접 쓴다** — 회원 기기는 다음 동기에서 받는다.
//
//	① 결정적 id — 루틴 `coach-<crid>` · 줄 `coach-<crid>-<초안 줄 id>`(crid = coaching_routines 행 id)
//	   같은 초안을 다시 보내면 같은 회원 루틴이 바뀐다(id 그대로). 빠진 줄은 지운다(실제 자식 행과 비교).
//	② 회원 것은 덮지 않는다 — 폴더·순서·보관은 처음 보낼 때만 정하고, 변형 칸(기구·그립…)은 처음만 null 로 둔다.
//	   회원 기기가 거꾸로 코치 칸을 덮는 길은 sync/coach_guard.go 가 막는다(REV-102 H-1).
//	③ 짧은 트랜잭션 — grant FOR UPDATE(해지와 줄 세우기) → 쓰기 → 커밋. 알림·감사는 커밋 뒤.
//	④ 해지·탈퇴면 회원 루틴은 origin coach_ended(회원 것) — 다시 보내면 새 crid(새 루틴)다.
//	⑤ 종목은 서버 카탈로그(직접 만든 것·내린 것 제외)만 — 회원 기기에 없는 종목은 보낼 수 없다.
//
// 이 파일은 pgx·connect·proto 를 모른다(service 경계). 레코드 모양 만들기(buildCoachRoutineRecords)는 저장소가
// 트랜잭션 안에서 부르는 순수 함수다.
// ─────────────────────────────────────────────────────────────────────────────
package coaching

import (
	"context"
	"encoding/json"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// 감사 action(P3b).
const (
	ActionRoutineSend   = "routine_send"
	ActionRoutineUpdate = "routine_update"
)

// 코치 루틴 상태(coaching_routines.status).
const (
	RoutineActive = "active"
	RoutineEnded  = "ended"
)

// 회원 sync 레코드의 출처 값(로컬 스키마 v30 routines.origin).
const (
	originCoach      = "coach"
	originCoachEnded = "coach_ended"
	coachIDPrefix    = "coach-"
)

// 상한(SPEC-050).
const (
	maxRoutineNameRunes  = 60
	maxRoutineNotesRunes = 500
	maxRoutineLines      = 30
	maxLineNoteRunes     = 500
	maxSupersetGroupLen  = 20 // 앱의 묶음 id(randomId('ss_') ≈ 19자) — 레코드에 그대로 들어가므로 좁힌다(리뷰 L-2)
	maxRoutineSendsHour  = 60
	routineUpdateBundle  = 10 * time.Minute
	maxTargetSets        = 20
	maxRestSeconds       = 3600
	maxRepsValue         = 1000
	maxWeightKg          = 1000.0
)

// 화면이 그대로 보이는 문구.
const (
	msgRoutineNameEmpty    = "루틴 이름을 적어 주세요"
	msgRoutineNameLong     = "루틴 이름은 %d자까지 쓸 수 있어요"
	msgRoutineNotesLong    = "메모는 %d자까지 쓸 수 있어요"
	msgRoutineNoLines      = "종목을 하나 이상 넣어 주세요"
	msgRoutineTooManyLines = "종목은 %d개까지 보낼 수 있어요"
	msgRoutineRxTooLong    = "처방은 종목마다 %d줄까지예요"
	msgRoutineBadLine      = "루틴 내용을 읽을 수 없어요. 새로 고친 뒤 다시 보내 주세요"
	msgArchivedExercise    = "「%s」은 지금 고를 수 없는 종목이라 보낼 수 없어요"
	msgNoRoutineScope      = "회원이 루틴 받기를 꺼 두었어요"
	msgCoachRoutineRx      = "코치가 보낸 루틴은 여기서 고치지 않아요 — 초안을 고쳐 다시 보내 주세요"
	msgEndedRoutineRx      = "코칭이 끝난 루틴은 회원만 고칠 수 있어요"
	msgUnknownExerciseName = "이 종목"
)

// 초안 줄 id — Watermelon 의 random id(영숫자) · 결정적 id 에 그대로 들어가므로 모양을 좁힌다.
var lineIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// 회원 줄의 변형 칸 — 처음 보낼 때만 null 로 둔다(그 뒤는 회원 것 · REV-102 L-1).
var lineVariantFields = []string{
	"machine_variant", "variant_key", "variant_equipment", "variant_grip", "variant_arm", "variant_load", "variant_attach",
}

// SendRoutineLine은 초안 한 줄이다(계약의 SentRoutineLine). 0 은 「없음」.
type SendRoutineLine struct {
	ID               string
	ExerciseID       string
	TargetSets       int
	RepsMin          int
	RepsMax          int
	WeightKg         float64
	RestSeconds      int
	SupersetGroup    string
	Note             string
	SortOrder        int
	CardioTargetJSON string
	PrescriptionJSON string
}

type SendRoutineInput struct {
	MemberID        string
	SourceRoutineID string
	Name            string
	Notes           string
	Lines           []SendRoutineLine
}

// SentRoutine은 보낸 루틴 한 줄(coaching_routines + 회원 레코드의 이름)이다.
type SentRoutine struct {
	ID              string
	SourceRoutineID string
	MemberRoutineID string
	MemberID        string
	Name            string
	Status          string
	SentAt          time.Time
}

// cleanLine은 정리를 마친 줄이다 — 레코드에 그대로 들어간다.
type cleanLine struct {
	DraftID       string
	ExerciseID    string
	TargetSets    int
	RepsMin       *int
	RepsMax       *int
	WeightKg      *float64
	RestSeconds   int
	SupersetGroup *string
	Note          *string
	SortOrder     int
	Cardio        *string // 직렬화된 JSON(Watermelon @json 규약)
	Prescription  *string
}

// SendRoutinePlan은 저장소가 한 트랜잭션에서 반영할 내용이다.
type SendRoutinePlan struct {
	TrainerID       string
	MemberID        string
	SourceRoutineID string
	CoachName       string
	Name            string
	Notes           *string
	Lines           []cleanLine
	NowMs           int64
	// NewCRID는 새 coaching_routines 행이 필요할 때 쓸 id. RowID 는 sync_records 새 행 id.
	NewCRID string
	RowID   func() string
}

// SendRoutineOutcome — 저장소가 돌려준다.
type SendRoutineOutcome struct {
	Routine SentRoutine
	GrantID string
	Created bool
}

// RoutineRepo는 코치 루틴 저장소(P3b)다.
type RoutineRepo interface {
	// ExerciseCatalogRows — 서버 exercises 표에서 그 id 들(없는 id 는 맵에 없다).
	ExerciseCatalogRows(ctx context.Context, ids []string) (map[string]CatalogRow, error)
	// CustomExerciseName — 그 사람 sync 레코드의 직접 만든 종목 이름(없으면 "").
	CustomExerciseName(ctx context.Context, userID, exerciseID string) (string, error)
	CountRoutineSendsSince(ctx context.Context, trainerID string, since time.Time) (int, error)
	HasRecentRoutineUpdate(ctx context.Context, grantID, coachingRoutineID string, since time.Time) (bool, error)
	// SendRoutineTx — grant FOR UPDATE(active ∧ routineEdit 재확인) → 활성 행 찾기(회원이 지웠으면 끝내고 새로) →
	// 회원 sync 레코드 쓰기(buildCoachRoutineRecords) → 빠진 줄 지우기 → coaching_routines 쓰기. 한 트랜잭션.
	SendRoutineTx(ctx context.Context, p SendRoutinePlan) (SendRoutineOutcome, error)
	ListSentRoutines(ctx context.Context, trainerID, memberID string) ([]SentRoutine, error)
}

// CatalogRow는 서버 카탈로그 한 종목이다.
type CatalogRow struct {
	NameKo     string
	IsCustom   bool
	IsArchived bool
}

// SendRoutine은 코치(viewer)가 초안을 회원에게 보낸다(처음이면 새 루틴, 다시면 같은 루틴을 바꾼다).
func (s *Service) SendRoutine(ctx context.Context, viewerID string, in SendRoutineInput) (SentRoutine, bool, error) {
	if err := requireIdentity(viewerID); err != nil {
		return SentRoutine{}, false, err
	}
	if in.MemberID == viewerID {
		return SentRoutine{}, false, errs.New(errs.Validation, "cannot coach yourself")
	}
	// 정본 확인은 트랜잭션 안(grant FOR UPDATE)에서 한 번 더 — 여기는 문구를 정하려는 앞선 확인이다.
	g, err := s.repo.GetGrantByPair(ctx, viewerID, in.MemberID)
	if err != nil {
		if isNotFound(err) {
			return SentRoutine{}, false, errs.New(errs.Forbidden, msgNotActive)
		}
		return SentRoutine{}, false, err
	}
	if g.Status != StatusActive {
		return SentRoutine{}, false, errs.New(errs.Forbidden, msgNotActive)
	}
	if !g.Scope[ScopeRoutineEdit] {
		return SentRoutine{}, false, errs.New(errs.Forbidden, msgNoRoutineScope)
	}
	if err := s.assertNotBlocked(ctx, viewerID, in.MemberID); err != nil {
		return SentRoutine{}, false, err
	}

	name := strings.TrimSpace(in.Name)
	switch n := utf8.RuneCountInString(name); {
	case n == 0:
		return SentRoutine{}, false, errs.New(errs.Validation, msgRoutineNameEmpty)
	case n > maxRoutineNameRunes:
		return SentRoutine{}, false, errs.New(errs.Validation, msgRoutineNameLong, maxRoutineNameRunes)
	}
	var notes *string
	if v := strings.TrimSpace(in.Notes); v != "" {
		if utf8.RuneCountInString(v) > maxRoutineNotesRunes {
			return SentRoutine{}, false, errs.New(errs.Validation, msgRoutineNotesLong, maxRoutineNotesRunes)
		}
		notes = &v
	}
	if strings.TrimSpace(in.SourceRoutineID) == "" || !lineIDPattern.MatchString(in.SourceRoutineID) {
		return SentRoutine{}, false, errs.New(errs.Validation, msgRoutineBadLine)
	}
	lines, err := cleanRoutineLines(in.Lines)
	if err != nil {
		return SentRoutine{}, false, err
	}
	if err := s.assertSendableExercises(ctx, viewerID, lines); err != nil {
		return SentRoutine{}, false, err
	}

	// 코치당 시간당 60번 — 감사 기록으로 센다.
	n, err := s.repo.CountRoutineSendsSince(ctx, viewerID, s.now().Add(-time.Hour))
	if err != nil {
		return SentRoutine{}, false, err
	}
	if n >= maxRoutineSendsHour {
		return SentRoutine{}, false, errs.New(errs.ResourceExhausted, msgTryLater)
	}

	coach, err := s.repo.GetPeer(ctx, viewerID)
	if err != nil {
		return SentRoutine{}, false, err
	}
	out, err := s.repo.SendRoutineTx(ctx, SendRoutinePlan{
		TrainerID: viewerID, MemberID: in.MemberID, SourceRoutineID: in.SourceRoutineID,
		CoachName: coach.DisplayName, Name: name, Notes: notes, Lines: lines,
		NowMs: s.now().UnixMilli(), NewCRID: s.newID(), RowID: s.newID,
	})
	if err != nil {
		return SentRoutine{}, false, err
	}

	// ── 커밋 뒤: 알림(바꿨어요는 10분 묶음) → 감사 ──
	action, kind := ActionRoutineSend, notifyKindCoachingRoutine
	notify := true
	if !out.Created {
		action, kind = ActionRoutineUpdate, notifyKindCoachingRoutineUpdate
		recent, err := s.repo.HasRecentRoutineUpdate(ctx, out.GrantID, out.Routine.ID, s.now().Add(-routineUpdateBundle))
		notify = err == nil && !recent
	}
	if notify {
		s.notifyAfter(ctx, in.MemberID, viewerID, kind, out.Routine.MemberRoutineID)
	}
	detail, _ := json.Marshal(map[string]any{
		"coachingRoutineId": out.Routine.ID, "sourceRoutineId": in.SourceRoutineID,
		"memberRoutineId": out.Routine.MemberRoutineID, "lines": len(lines),
	})
	s.audit(ctx, g.ID, viewerID, action, detail)
	return out.Routine, out.Created, nil
}

// ListSentRoutines는 코치(viewer)가 이 회원에게 보낸 루틴이다(끝난 것 포함). 연결이 없었던 사이면 빈 목록.
func (s *Service) ListSentRoutines(ctx context.Context, viewerID, memberID string) ([]SentRoutine, error) {
	if err := requireIdentity(viewerID); err != nil {
		return nil, err
	}
	if _, err := s.repo.GetGrantByPair(ctx, viewerID, memberID); err != nil {
		if isNotFound(err) {
			return []SentRoutine{}, nil
		}
		return nil, err
	}
	// 차단한(된) 사이면 빈 목록 — 끝난 관계라도 보낸 기록을 보이지 않는다(리뷰 L-1)
	if blocked, err := s.repo.Blocked(ctx, viewerID, memberID); err != nil {
		return nil, err
	} else if blocked {
		return []SentRoutine{}, nil
	}
	return s.repo.ListSentRoutines(ctx, viewerID, memberID)
}

// assertSendableExercises — 서버 카탈로그에 있고(직접 만든 것 아님) 내리지 않은 종목만.
func (s *Service) assertSendableExercises(ctx context.Context, trainerID string, lines []cleanLine) error {
	ids := make([]string, 0, len(lines))
	seen := map[string]bool{}
	for _, l := range lines {
		if !seen[l.ExerciseID] {
			seen[l.ExerciseID] = true
			ids = append(ids, l.ExerciseID)
		}
	}
	rows, err := s.repo.ExerciseCatalogRows(ctx, ids)
	if err != nil {
		return err
	}
	for _, id := range ids {
		row, ok := rows[id]
		if !ok || row.IsCustom {
			name := ""
			if ok {
				name = row.NameKo
			}
			if name == "" {
				name, _ = s.repo.CustomExerciseName(ctx, trainerID, id)
			}
			if name == "" {
				name = msgUnknownExerciseName
			}
			return errs.New(errs.Validation, msgCustomExercise, name)
		}
		if row.IsArchived {
			return errs.New(errs.Validation, msgArchivedExercise, row.NameKo)
		}
	}
	return nil
}

// cleanRoutineLines — 줄 수·id·숫자 범위·처방·유산소 목표를 정리한다. 처방은 SetMemberPrescription 과 같은 규칙
// (SanitizePrescription) + 회원 시작 무게(start)도 지킨다 — 코치 초안에 있던 값이다.
func cleanRoutineLines(in []SendRoutineLine) ([]cleanLine, error) {
	if len(in) == 0 {
		return nil, errs.New(errs.Validation, msgRoutineNoLines)
	}
	if len(in) > maxRoutineLines {
		return nil, errs.New(errs.Validation, msgRoutineTooManyLines, maxRoutineLines)
	}
	out := make([]cleanLine, 0, len(in))
	seen := map[string]bool{}
	for _, l := range in {
		if !lineIDPattern.MatchString(l.ID) || seen[l.ID] || strings.TrimSpace(l.ExerciseID) == "" {
			return nil, errs.New(errs.Validation, msgRoutineBadLine)
		}
		seen[l.ID] = true
		c := cleanLine{
			DraftID: l.ID, ExerciseID: l.ExerciseID,
			TargetSets:  clampInt(l.TargetSets, 1, maxTargetSets),
			RestSeconds: clampInt(l.RestSeconds, 0, maxRestSeconds),
			SortOrder:   clampInt(l.SortOrder, 0, 10_000),
			RepsMin:     positiveInt(l.RepsMin, maxRepsValue),
			RepsMax:     positiveInt(l.RepsMax, maxRepsValue),
		}
		if l.WeightKg > 0 && l.WeightKg <= maxWeightKg {
			kg := float64(int64(l.WeightKg*10000+0.5)) / 10000
			c.WeightKg = &kg
		}
		if g := strings.TrimSpace(l.SupersetGroup); g != "" {
			if utf8.RuneCountInString(g) > maxSupersetGroupLen {
				return nil, errs.New(errs.Validation, msgRoutineBadLine)
			}
			c.SupersetGroup = &g
		}
		if n := strings.TrimSpace(l.Note); n != "" {
			if utf8.RuneCountInString(n) > maxLineNoteRunes {
				return nil, errs.New(errs.Validation, msgRoutineNotesLong, maxLineNoteRunes)
			}
			c.Note = &n
		}
		cardio, err := cleanCardio(l.CardioTargetJSON)
		if err != nil {
			return nil, err
		}
		c.Cardio = cardio
		rx, err := cleanSentPrescription(l.PrescriptionJSON)
		if err != nil {
			return nil, err
		}
		c.Prescription = rx
		out = append(out, c)
	}
	return out, nil
}

// cleanSentPrescription — core PrescribedSet[] JSON → 정리 → 다시 직렬화(빈 처방은 nil).
func cleanSentPrescription(raw string) (*string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" {
		return nil, nil
	}
	var rows []PrescribedSet
	if err := json.Unmarshal([]byte(raw), &rows); err != nil {
		return nil, errs.New(errs.Validation, msgRoutineBadLine)
	}
	if len(rows) > maxPrescriptionRows {
		return nil, errs.New(errs.Validation, msgRoutineRxTooLong, maxPrescriptionRows)
	}
	clean := SanitizePrescription(rows)
	// 회원 시작 무게(start) — SanitizePrescription 은 코치 계약의 기준(pct·fixed)만 안다. 초안의 start 는 같은 범위로 지킨다.
	for i := range clean {
		if i < len(rows) && clean[i].LoadBasis == "" && rows[i].LoadBasis == "start" &&
			rows[i].LoadKg != nil && *rows[i].LoadKg >= 0 && *rows[i].LoadKg <= loadKgMax {
			kg := float64(int64(*rows[i].LoadKg*10000+0.5)) / 10000
			clean[i].LoadBasis, clean[i].LoadKg = "start", &kg
		}
	}
	if len(clean) == 0 {
		return nil, nil
	}
	b, err := json.Marshal(clean)
	if err != nil {
		return nil, err
	}
	s := string(b)
	return &s, nil
}

// cleanCardio — 알려진 숫자 칸(양수)만 남긴다(core sanitizeCardioTarget 과 같은 규칙). 다 비면 nil.
func cleanCardio(raw string) (*string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "null" {
		return nil, nil
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return nil, errs.New(errs.Validation, msgRoutineBadLine)
	}
	out := map[string]any{}
	has := false
	for _, k := range []string{"durationSec", "distanceM", "incline", "level", "speed"} {
		if v, ok := m[k].(float64); ok && v > 0 && v < 1e7 {
			out[k] = v
			has = true
		} else {
			out[k] = nil
		}
	}
	if !has {
		return nil, nil
	}
	b, _ := json.Marshal(out)
	s := string(b)
	return &s, nil
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func positiveInt(v, hi int) *int {
	if v <= 0 {
		return nil
	}
	if v > hi {
		v = hi
	}
	return &v
}

// ── 회원 sync 레코드 만들기(저장소가 트랜잭션 안에서 부른다) ─────────────────────

// MemberSyncWrite는 회원 sync_records 에 쓸 한 행이다(병합 · 넘기지 않은 칸은 남는다).
type MemberSyncWrite struct {
	Collection string
	RecordID   string
	Payload    []byte
}

// memberRoutineID / memberLineID — 결정적 id.
func memberRoutineID(crid string) string           { return coachIDPrefix + crid }
func memberLineID(crid, draftLineID string) string { return coachIDPrefix + crid + "-" + draftLineID }

// buildCoachRoutineRecords는 보낼 레코드와 지울 줄 id 를 만든다.
//
//	first        이 crid 로 처음 쓰나 — 그때만 created_at·sort_order·is_archived·folder 를 넣는다
//	sortOrder    처음일 때 회원 루틴 순서(최댓값+1)
//	existing     회원 루틴의 지금 자식 줄 id(지우지 않은 것) — 새 줄이면 created_at·변형 null, 빠진 줄은 지운다
//
// 돌려주는 writes 는 (컬렉션, id) 순서다 — Push 의 잠금(coach_guard · ORDER BY collection, record_id)과 같은 순서로 잡는다.
func buildCoachRoutineRecords(p SendRoutinePlan, crid string, first bool, sortOrder int64, existing []string) (writes []MemberSyncWrite, lineIDs []string, removed []string) {
	rid := memberRoutineID(crid)
	routine := map[string]any{
		"id": rid, "name": p.Name, "notes": p.Notes, "user_id": nil,
		"origin": originCoach, "coach_id": p.TrainerID, "coach_name": p.CoachName, "coach_for": nil,
		"updated_at": p.NowMs,
	}
	if first {
		routine["created_at"] = p.NowMs
		routine["sort_order"] = sortOrder
		routine["is_archived"] = false
		routine["folder"] = nil
	}
	rb, _ := json.Marshal(routine)
	writes = append(writes, MemberSyncWrite{Collection: "routines", RecordID: rid, Payload: rb})

	had := make(map[string]bool, len(existing))
	for _, id := range existing {
		had[id] = true
	}
	keep := make(map[string]bool, len(p.Lines))
	lineIDs = make([]string, 0, len(p.Lines)) // nil 이 아니게 — line_ids 는 NOT NULL
	for _, l := range p.Lines {
		id := memberLineID(crid, l.DraftID)
		keep[id] = true
		lineIDs = append(lineIDs, id)
		line := map[string]any{
			"id": id, "routine_id": rid, "exercise_id": l.ExerciseID, "target_sets": l.TargetSets,
			"target_reps_min": l.RepsMin, "target_reps_max": l.RepsMax, "target_weight_kg": l.WeightKg,
			"rest_seconds": l.RestSeconds, "superset_group": l.SupersetGroup, "sort_order": l.SortOrder,
			"note": l.Note, "cardio_target": l.Cardio, "prescription": l.Prescription, "updated_at": p.NowMs,
		}
		if !had[id] {
			line["created_at"] = p.NowMs
			for _, k := range lineVariantFields {
				line[k] = nil
			}
		}
		lb, _ := json.Marshal(line)
		writes = append(writes, MemberSyncWrite{Collection: "routine_exercises", RecordID: id, Payload: lb})
	}
	for _, id := range existing {
		if !keep[id] {
			removed = append(removed, id)
		}
	}
	sort.Slice(writes, func(i, j int) bool {
		if writes[i].Collection != writes[j].Collection {
			return writes[i].Collection < writes[j].Collection
		}
		return writes[i].RecordID < writes[j].RecordID
	})
	sort.Strings(removed)
	return writes, lineIDs, removed
}

// coachOriginOf — 회원 루틴 레코드의 출처(coach·coach_ended·"") — id 가 coach- 면 coach 로 본다.
func coachOriginOf(routineID string, payload []byte) string {
	var obj map[string]any
	_ = json.Unmarshal(payload, &obj)
	o, _ := obj["origin"].(string)
	return originKind(routineID, o)
}

// originKind — sync/coach_guard.go routineKind 와 같은 판단(끝남이 먼저 · coach- id 는 코치 루틴).
func originKind(routineID, origin string) string {
	switch {
	case origin == originCoachEnded:
		return originCoachEnded
	case origin == originCoach || strings.HasPrefix(routineID, coachIDPrefix):
		return originCoach
	}
	return ""
}
