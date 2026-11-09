// 코치 루틴 보호 — 회원 기기가 서버가 쓴 코치 루틴을 덮거나 위조하지 못하게 (SPEC-050 P3b · REV-102 H-1)
//
// ─────────────────────────────────────────────────────────────────────────────
// 서버는 레코드를 해석하지 않는 jsonb 얕은 병합·나중 쓴 쪽 승리다(service.go ②). 그런데 코치 루틴만은 서버(코칭
// SendRoutine)가 회원 sync 레코드에 직접 쓴다 — 그래서 이 두 컬렉션(routines·routine_exercises)에 한해 **저장된 값을 보고**
// 올린 값을 고친다. 판단은 저장된 행 기준이다(올린 값의 출처 칸은 믿지 않는다):
//
//	코치 루틴(저장된 origin = coach · 또는 id 가 coach- 로 시작)
//	  루틴: 폴더·순서·보관(folder·sort_order·is_archived)만 회원 것 — 이름·메모·출처·코치 칸은 저장값 그대로
//	  줄  : 변형 칸(기구·그립·팔·적재·부착물 — REV-102 L-1)만 회원 것 — 종목·세트·처방은 저장값 그대로
//	        새 줄을 붙이거나, 서버가 지운 줄을 되살리는 올림은 버린다(삭제 표시로 바꿔 그 기기도 지우게)
//	코칭 끝남(저장된 origin = coach_ended) — 회원 것이라 다 고친다. 단 출처·코치 칸은 저장값 그대로(coach 로 되돌리기 막음)
//	줄 옮기기 — 저장된 줄의 routine_id 를 코치 루틴(coach·coach_ended·coach- id)으로 바꿔 올리면 routine_id 칸만 버린다
//	출처 없는 행 — 올린 origin 이 coach·coach_ended 면 그 칸(origin·coach_id·coach_name)을 버린다(내 루틴을 코치 루틴으로 위장 막음)
//
// 삭제는 언제나 회원 것이다(코치 루틴도 지울 수 있다 — 지운 루틴에 다시 보내면 새 루틴이 된다).
// 고친 올림도 그대로 반영해 행의 updated_at 이 움직인다 — 다음 pull 에서 그 기기가 저장값을 다시 받아 맞춰진다.
//
// 이 파일은 pgx 를 모른다 — 저장된 값은 저장소가 트랜잭션 안에서 잠그고 읽어 Lookup 으로 넘긴다.
// ─────────────────────────────────────────────────────────────────────────────
package sync

import (
	"encoding/json"
	"strings"
)

const (
	collRoutines        = "routines"
	collRoutineExercise = "routine_exercises"
	coachIDPrefix       = "coach-"
	originCoach         = "coach"
	originCoachEnded    = "coach_ended"
)

// 출처를 이루는 칸 — 코치 루틴·코칭 끝남이면 저장값을 지키고, 출처 없는 행에 coach 계열이 오면 버린다.
var originFields = []string{"origin", "coach_id", "coach_name", "coach_for"}

// 코치 루틴에서 회원이 바꿀 수 있는 루틴 칸(id·updated_at 은 늘 남긴다).
var memberRoutineFields = []string{"folder", "sort_order", "is_archived"}

// 코치 루틴 줄에서 회원이 바꿀 수 있는 칸 — 기록 칸(변형)뿐(ADR-034 · REV-102 L-1).
var memberLineFields = []string{
	"machine_variant", "variant_key", "variant_equipment", "variant_grip", "variant_arm", "variant_load", "variant_attach",
}

// RecordKey는 sync 행 하나를 가리킨다.
type RecordKey struct {
	Collection string
	RecordID   string
}

// StoredRow는 저장된 한 행이다(지운 것 포함).
type StoredRow struct {
	Payload []byte
	Deleted bool
}

// Lookup은 저장소가 트랜잭션 안에서 잠그고 읽어 준다. 없는 행은 맵에 없다.
type Lookup func(keys []RecordKey) (map[RecordKey]StoredRow, error)

// Guard는 올린 묶음을 저장된 값에 비춰 고친다 — keep 은 반영할 올림, drop 은 삭제 표시로 바꿀 올림.
type Guard func(upserts []Record, lookup Lookup) (keep []Record, drop []Record, err error)

// guardCoachRoutines는 Push 가 쓰는 Guard 다(위 머리말의 규칙).
func guardCoachRoutines(upserts []Record, lookup Lookup) ([]Record, []Record, error) {
	var keys []RecordKey
	for _, u := range upserts {
		if u.Collection == collRoutines || u.Collection == collRoutineExercise {
			keys = append(keys, RecordKey{u.Collection, u.RecordID})
		}
	}
	if len(keys) == 0 {
		return upserts, nil, nil // 루틴을 건드리지 않는 올림(운동·세트…) — 읽지 않는다
	}
	stored, err := lookup(keys)
	if err != nil {
		return nil, nil, err
	}

	// 줄의 부모 루틴 — 저장된 줄이면 저장된 routine_id(옮기기 위조를 믿지 않는다), 새 줄이면 올린 routine_id.
	// 저장된 줄의 routine_id 를 바꿔 올리면(옮기기) 올린 쪽 부모도 읽는다 — 내 줄을 코치 루틴으로 옮겨 붙이는 걸 막는다(REV M-1).
	parentOf := make(map[string]string)
	movedTo := make(map[string]string) // 줄 id → 올린 routine_id(저장값과 다를 때만)
	var parents []RecordKey
	want := func(p string) {
		if p == "" {
			return
		}
		k := RecordKey{collRoutines, p}
		if _, ok := stored[k]; !ok {
			parents = append(parents, k)
		}
	}
	for _, u := range upserts {
		if u.Collection != collRoutineExercise {
			continue
		}
		up := stringField(u.Payload, "routine_id")
		p := up
		if st, ok := stored[RecordKey{collRoutineExercise, u.RecordID}]; ok {
			if sp := stringField(st.Payload, "routine_id"); sp != "" {
				p = sp
				if up != "" && up != sp {
					movedTo[u.RecordID] = up
					want(up)
				}
			}
		}
		parentOf[u.RecordID] = p
		want(p)
	}
	if len(parents) > 0 {
		more, err := lookup(parents)
		if err != nil {
			return nil, nil, err
		}
		for k, v := range more {
			stored[k] = v
		}
	}

	keep := make([]Record, 0, len(upserts))
	var drop []Record
	for _, u := range upserts {
		switch u.Collection {
		case collRoutines:
			next, ok := guardRoutine(u, stored)
			if !ok {
				drop = append(drop, Record{Collection: u.Collection, RecordID: u.RecordID, Deleted: true})
				continue
			}
			keep = append(keep, next)
		case collRoutineExercise:
			next, ok := guardLine(u, parentOf[u.RecordID], stored)
			if !ok {
				drop = append(drop, Record{Collection: u.Collection, RecordID: u.RecordID, Deleted: true})
				continue
			}
			if to, moved := movedTo[u.RecordID]; moved {
				if k, _, _ := routineKind(to, stored); k != "" || strings.HasPrefix(to, coachIDPrefix) {
					// 코치 루틴(또는 끝난 코치 루틴)으로 옮기기 — routine_id 칸만 버린다(줄은 원래 루틴에 남고, 다음 pull 로 기기가 맞춰진다)
					next = withPayload(next, withoutFields(next.Payload, []string{"routine_id"}))
				}
			}
			keep = append(keep, next)
		default:
			keep = append(keep, u)
		}
	}
	return keep, drop, nil
}

// routineKind는 저장된 루틴의 출처다: "coach"·"coach_ended"·""(출처 없음) — 지운 행·없는 행은 found=false.
func routineKind(id string, stored map[RecordKey]StoredRow) (kind string, found bool, deleted bool) {
	st, ok := stored[RecordKey{collRoutines, id}]
	if !ok {
		return "", false, false
	}
	o := stringField(st.Payload, "origin")
	switch {
	case o == originCoachEnded:
		kind = originCoachEnded
	case o == originCoach || strings.HasPrefix(id, coachIDPrefix):
		kind = originCoach
	}
	return kind, true, st.Deleted
}

func guardRoutine(u Record, stored map[RecordKey]StoredRow) (Record, bool) {
	kind, found, deleted := routineKind(u.RecordID, stored)
	if strings.HasPrefix(u.RecordID, coachIDPrefix) && (!found || deleted) {
		// 서버가 쓴 적 없는(또는 회원이 지운) 코치 id — 위조이거나 지운 코치 루틴을 되살리려는 올림
		return u, false
	}
	switch kind {
	case originCoach:
		return withPayload(u, onlyFields(u.Payload, memberRoutineFields)), true
	case originCoachEnded:
		return withPayload(u, withoutFields(u.Payload, originFields)), true
	}
	if o := stringField(u.Payload, "origin"); o == originCoach || o == originCoachEnded {
		return withPayload(u, withoutFields(u.Payload, []string{"origin", "coach_id", "coach_name"})), true
	}
	return u, true
}

func guardLine(u Record, parentID string, stored map[RecordKey]StoredRow) (Record, bool) {
	st, lineFound := stored[RecordKey{collRoutineExercise, u.RecordID}]
	lineAlive := lineFound && !st.Deleted
	kind, parentFound, parentDeleted := routineKind(parentID, stored)
	coachLine := strings.HasPrefix(u.RecordID, coachIDPrefix)

	if kind == originCoachEnded && parentFound && !parentDeleted {
		return u, true // 코칭이 끝난 루틴 — 회원 것
	}
	if kind == originCoach || coachLine {
		if !lineAlive {
			// 코치 루틴에 새 줄을 붙이거나, 서버가 지운 코치 줄을 되살리려는 올림
			return u, false
		}
		return withPayload(u, onlyFields(u.Payload, memberLineFields)), true
	}
	return u, true
}

// ── JSON 도우미 ──────────────────────────────────────────────────────────────

func stringField(payload []byte, key string) string {
	var obj map[string]json.RawMessage
	if json.Unmarshal(payload, &obj) != nil {
		return ""
	}
	var s string
	if raw, ok := obj[key]; ok && json.Unmarshal(raw, &s) == nil {
		return s
	}
	return ""
}

// onlyFields — id·updated_at 과 keep 칸만 남긴다(병합이라 나머지 칸은 저장값이 남는다).
func onlyFields(payload []byte, keepKeys []string) []byte {
	var obj map[string]json.RawMessage
	if json.Unmarshal(payload, &obj) != nil {
		return payload
	}
	out := make(map[string]json.RawMessage, len(keepKeys)+2)
	for _, k := range append([]string{"id", "updated_at"}, keepKeys...) {
		if v, ok := obj[k]; ok {
			out[k] = v
		}
	}
	b, err := json.Marshal(out)
	if err != nil {
		return payload
	}
	return b
}

func withoutFields(payload []byte, drop []string) []byte {
	var obj map[string]json.RawMessage
	if json.Unmarshal(payload, &obj) != nil {
		return payload
	}
	for _, k := range drop {
		delete(obj, k)
	}
	b, err := json.Marshal(obj)
	if err != nil {
		return payload
	}
	return b
}

func withPayload(r Record, p []byte) Record {
	r.Payload = p
	return r
}
