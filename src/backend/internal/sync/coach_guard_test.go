// 코치 루틴 보호(SPEC-050 P3b · REV-102 H-1) — 회원 기기의 Push 가 서버가 쓴 코치 루틴을 덮거나 위조하지 못한다.
// 가짜 저장소와 실제 Postgres(LIFTGRAM_TEST_DATABASE_URL) 둘 다에서 Service.Push 로 확인한다.
package sync

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// 서버(코칭 SendRoutine)가 써 둔 모양 — guard 없이 심는다.
const (
	gRoutine = `{"id":"coach-c1","name":"코치 상체","notes":"코치 메모","folder":null,"sort_order":3,"is_archived":false,` +
		`"origin":"coach","coach_id":"u-coach","coach_name":"김코치","user_id":null,"created_at":1,"updated_at":100}`
	gLine = `{"id":"coach-c1-l1","routine_id":"coach-c1","exercise_id":"ex-bench","target_sets":3,"rest_seconds":120,` +
		`"sort_order":0,"prescription":"[{\"setType\":\"top\",\"repMin\":5,\"repMax\":5,\"rest\":240}]","variant_grip":null,"updated_at":100}`
)

func seed(t *testing.T, r Repo, user string, recs ...Record) {
	t.Helper()
	if err := r.Apply(context.Background(), user, recs, nil, nil); err != nil {
		t.Fatalf("seed: %v", err)
	}
}

func rec(coll, payload string) Record {
	var obj map[string]any
	_ = json.Unmarshal([]byte(payload), &obj)
	return Record{Collection: coll, RecordID: obj["id"].(string), Payload: []byte(payload)}
}

// row 는 스냅숏에서 한 행을 찾아 (payload 맵, deleted) 를 돌려준다.
func row(t *testing.T, h harness, user, coll, id string) (map[string]any, bool, bool) {
	t.Helper()
	for _, line := range h.snapshot(t, user) {
		parts := strings.SplitN(line, "|", 4)
		if parts[0] == coll && parts[1] == id {
			var obj map[string]any
			_ = json.Unmarshal([]byte(parts[3]), &obj)
			return obj, parts[2] == "true", true
		}
	}
	return nil, false, false
}

func gpush(t *testing.T, h harness, user string, changes map[string]TableChanges) {
	t.Helper()
	svc := NewService(h.repo(t, user), func() string { return "x" })
	if err := svc.Push(context.Background(), user, changes); err != nil {
		t.Fatalf("push: %v", err)
	}
}

func TestPush_코치_루틴은_폴더_순서_보관만_회원_것(t *testing.T) {
	eachHarness(t, func(t *testing.T, h harness) {
		u := h.newUser(t)
		seed(t, h.repo(t, u), u, rec(collRoutines, gRoutine), rec(collRoutineExercise, gLine))
		// 옛 앱(v29)·손댄 기기 — 이름·메모·출처를 바꾸고 폴더도 바꿔 통째로 올린다
		gpush(t, h, u, map[string]TableChanges{collRoutines: {Updated: []string{
			`{"id":"coach-c1","name":"내 이름","notes":"","folder":"받은 루틴","sort_order":0,"is_archived":true,` +
				`"origin":null,"coach_id":null,"coach_name":null,"updated_at":200,"_status":"updated"}`,
		}}})
		got, deleted, ok := row(t, h, u, collRoutines, "coach-c1")
		if !ok || deleted {
			t.Fatalf("행이 없거나 지워졌다: %v", got)
		}
		want := map[string]any{
			"name": "코치 상체", "notes": "코치 메모", "origin": "coach", "coach_id": "u-coach", "coach_name": "김코치",
			"folder": "받은 루틴", "sort_order": float64(0), "is_archived": true, "updated_at": float64(200),
		}
		for k, v := range want {
			if got[k] != v {
				t.Errorf("%s = %v, want %v", k, got[k], v)
			}
		}
	})
}

func TestPush_코치_줄은_변형_칸만_회원_것_새_줄_되살리기는_버린다(t *testing.T) {
	eachHarness(t, func(t *testing.T, h harness) {
		u := h.newUser(t)
		gone := `{"id":"coach-c1-l2","routine_id":"coach-c1","exercise_id":"ex-row","target_sets":3,"rest_seconds":90,"sort_order":1,"updated_at":100}`
		r := h.repo(t, u)
		seed(t, r, u, rec(collRoutines, gRoutine), rec(collRoutineExercise, gLine), rec(collRoutineExercise, gone))
		if err := r.Apply(context.Background(), u, nil, []Record{{Collection: collRoutineExercise, RecordID: "coach-c1-l2", Deleted: true}}, nil); err != nil {
			t.Fatal(err) // 코치가 다시 보내며 뺀 줄
		}
		gpush(t, h, u, map[string]TableChanges{collRoutineExercise: {Updated: []string{
			// 세트·처방을 바꾸고 그립을 고른다 → 그립만
			`{"id":"coach-c1-l1","routine_id":"coach-c1","exercise_id":"ex-other","target_sets":9,"rest_seconds":10,"sort_order":5,` +
				`"prescription":null,"variant_grip":"wide","variant_key":"grip=wide","updated_at":300}`,
			// 서버가 지운 코치 줄을 되살리려는 옛 기기
			`{"id":"coach-c1-l2","routine_id":"coach-c1","exercise_id":"ex-row","target_sets":4,"rest_seconds":90,"sort_order":1,"updated_at":300}`,
		}, Created: []string{
			// 코치 루틴에 내 줄을 붙인다
			`{"id":"mine-1","routine_id":"coach-c1","exercise_id":"ex-curl","target_sets":3,"rest_seconds":60,"sort_order":2,"updated_at":300}`,
		}}})
		got, _, _ := row(t, h, u, collRoutineExercise, "coach-c1-l1")
		for k, v := range map[string]any{
			"exercise_id": "ex-bench", "target_sets": float64(3), "rest_seconds": float64(120), "sort_order": float64(0),
			"variant_grip": "wide", "variant_key": "grip=wide",
		} {
			if got[k] != v {
				t.Errorf("l1 %s = %v, want %v", k, got[k], v)
			}
		}
		if p, _ := got["prescription"].(string); !strings.Contains(p, `"rest":240`) {
			t.Errorf("처방(세트별 휴식 포함)이 지켜지지 않았다: %v", got["prescription"])
		}
		if _, deleted, _ := row(t, h, u, collRoutineExercise, "coach-c1-l2"); !deleted {
			t.Error("지운 코치 줄이 되살아났다")
		}
		if _, deleted, ok := row(t, h, u, collRoutineExercise, "mine-1"); ok && !deleted {
			t.Error("코치 루틴에 회원 줄이 붙었다")
		}
	})
}

func TestPush_코칭_끝남은_다_고치되_출처는_되돌리지_못한다(t *testing.T) {
	eachHarness(t, func(t *testing.T, h harness) {
		u := h.newUser(t)
		ended := strings.Replace(gRoutine, `"origin":"coach"`, `"origin":"coach_ended"`, 1)
		seed(t, h.repo(t, u), u, rec(collRoutines, ended), rec(collRoutineExercise, gLine))
		gpush(t, h, u, map[string]TableChanges{
			collRoutines: {Updated: []string{
				`{"id":"coach-c1","name":"이제 내 루틴","notes":"내 메모","origin":"coach","coach_name":"사칭","updated_at":300}`,
			}},
			collRoutineExercise: {Updated: []string{
				`{"id":"coach-c1-l1","routine_id":"coach-c1","exercise_id":"ex-bench","target_sets":5,"rest_seconds":90,"sort_order":0,"updated_at":300}`,
			}, Created: []string{
				`{"id":"mine-2","routine_id":"coach-c1","exercise_id":"ex-curl","target_sets":3,"rest_seconds":60,"sort_order":1,"updated_at":300}`,
			}},
		})
		got, _, _ := row(t, h, u, collRoutines, "coach-c1")
		for k, v := range map[string]any{"name": "이제 내 루틴", "notes": "내 메모", "origin": "coach_ended", "coach_name": "김코치"} {
			if got[k] != v {
				t.Errorf("%s = %v, want %v", k, got[k], v)
			}
		}
		line, _, _ := row(t, h, u, collRoutineExercise, "coach-c1-l1")
		if line["target_sets"] != float64(5) {
			t.Errorf("끝난 코칭의 줄을 못 고쳤다: %v", line)
		}
		if _, deleted, ok := row(t, h, u, collRoutineExercise, "mine-2"); !ok || deleted {
			t.Error("끝난 코칭 루틴에 줄을 못 붙였다")
		}
	})
}

func TestPush_출처_없는_행에_코치_출처를_올리면_그_칸을_버린다(t *testing.T) {
	eachHarness(t, func(t *testing.T, h harness) {
		u := h.newUser(t)
		gpush(t, h, u, map[string]TableChanges{collRoutines: {Created: []string{
			`{"id":"r-mine","name":"내 루틴","sort_order":0,"is_archived":false,"origin":"coach","coach_id":"u-x","coach_name":"가짜코치","updated_at":1}`,
			`{"id":"r-imp","name":"가져옴","sort_order":1,"is_archived":false,"origin":"import","updated_at":1}`,
		}}})
		got, _, _ := row(t, h, u, collRoutines, "r-mine")
		for _, k := range []string{"origin", "coach_id", "coach_name"} {
			if _, ok := got[k]; ok {
				t.Errorf("%s 가 남았다: %v", k, got)
			}
		}
		if got["name"] != "내 루틴" {
			t.Errorf("나머지 칸이 사라졌다: %v", got)
		}
		imp, _, _ := row(t, h, u, collRoutines, "r-imp")
		if imp["origin"] != "import" {
			t.Errorf("가져옴 출처는 남아야 한다: %v", imp)
		}
		// 서버가 쓴 적 없는 coach- id 는 반영하지 않는다(삭제 표시)
		gpush(t, h, u, map[string]TableChanges{collRoutines: {Created: []string{
			`{"id":"coach-forged","name":"위조","origin":"coach","coach_name":"가짜","sort_order":2,"is_archived":false,"updated_at":1}`,
		}}})
		if got, deleted, ok := row(t, h, u, collRoutines, "coach-forged"); ok && !deleted {
			t.Errorf("위조한 코치 루틴이 들어갔다: %v", got)
		}
	})
}

func TestPush_코치_루틴_지우기는_회원_것(t *testing.T) {
	eachHarness(t, func(t *testing.T, h harness) {
		u := h.newUser(t)
		seed(t, h.repo(t, u), u, rec(collRoutines, gRoutine), rec(collRoutineExercise, gLine))
		gpush(t, h, u, map[string]TableChanges{
			collRoutines:        {Deleted: []string{"coach-c1"}},
			collRoutineExercise: {Deleted: []string{"coach-c1-l1"}},
		})
		for _, k := range [][2]string{{collRoutines, "coach-c1"}, {collRoutineExercise, "coach-c1-l1"}} {
			if _, deleted, _ := row(t, h, u, k[0], k[1]); !deleted {
				t.Errorf("%s 가 지워지지 않았다", k[1])
			}
		}
		// 지운 코치 루틴을 다른 기기가 고쳐 올려도 되살아나지 않는다
		gpush(t, h, u, map[string]TableChanges{collRoutines: {Updated: []string{
			`{"id":"coach-c1","folder":"x","updated_at":500}`,
		}}})
		if _, deleted, _ := row(t, h, u, collRoutines, "coach-c1"); !deleted {
			t.Error("지운 코치 루틴이 되살아났다")
		}
	})
}

func TestPush_내_줄을_코치_루틴으로_옮기면_routine_id_만_버린다(t *testing.T) {
	eachHarness(t, func(t *testing.T, h harness) {
		u := h.newUser(t)
		ended := strings.Replace(strings.Replace(gRoutine, `"origin":"coach"`, `"origin":"coach_ended"`, 1), `"coach-c1"`, `"coach-c0"`, 1)
		seed(t, h.repo(t, u), u,
			rec(collRoutines, gRoutine), rec(collRoutineExercise, gLine), rec(collRoutines, ended),
			rec(collRoutines, `{"id":"r-mine","name":"내 루틴","sort_order":0,"is_archived":false,"updated_at":100}`),
			rec(collRoutineExercise, `{"id":"m-1","routine_id":"r-mine","exercise_id":"ex-curl","target_sets":3,"rest_seconds":60,"sort_order":0,"updated_at":100}`),
			rec(collRoutineExercise, `{"id":"m-2","routine_id":"r-mine","exercise_id":"ex-row","target_sets":3,"rest_seconds":60,"sort_order":1,"updated_at":100}`),
			rec(collRoutineExercise, `{"id":"m-3","routine_id":"coach-c0","exercise_id":"ex-dip","target_sets":3,"rest_seconds":60,"sort_order":0,"updated_at":100}`),
			rec(collRoutines, `{"id":"r-other","name":"다른 내 루틴","sort_order":1,"is_archived":false,"updated_at":100}`),
		)
		gpush(t, h, u, map[string]TableChanges{collRoutineExercise: {Updated: []string{
			// 내 줄 → 코치 루틴(저장 출처 coach)
			`{"id":"m-1","routine_id":"coach-c1","exercise_id":"ex-curl","target_sets":4,"rest_seconds":60,"sort_order":0,"updated_at":300}`,
			// 내 줄 → 내 다른 루틴(그대로 옮겨진다)
			`{"id":"m-2","routine_id":"r-other","exercise_id":"ex-row","target_sets":3,"rest_seconds":60,"sort_order":1,"updated_at":300}`,
			// 끝난 코치 루틴의 줄 → 코치 루틴
			`{"id":"m-3","routine_id":"coach-c1","exercise_id":"ex-dip","target_sets":5,"rest_seconds":60,"sort_order":0,"updated_at":300}`,
		}}})
		m1, _, _ := row(t, h, u, collRoutineExercise, "m-1")
		if m1["routine_id"] != "r-mine" || m1["target_sets"] != float64(4) {
			t.Errorf("m-1 는 원래 루틴에 남고 나머지 칸만 반영돼야 한다: %v", m1)
		}
		if m2, _, _ := row(t, h, u, collRoutineExercise, "m-2"); m2["routine_id"] != "r-other" {
			t.Errorf("내 루틴 사이 옮기기는 반영돼야 한다: %v", m2)
		}
		if m3, _, _ := row(t, h, u, collRoutineExercise, "m-3"); m3["routine_id"] != "coach-c0" || m3["target_sets"] != float64(5) {
			t.Errorf("끝난 코칭 줄도 코치 루틴으로 못 옮긴다: %v", m3)
		}
	})
}

func TestGuard_루틴_아닌_올림은_읽지도_않는다(t *testing.T) {
	calls := 0
	lookup := func([]RecordKey) (map[RecordKey]StoredRow, error) {
		calls++
		return nil, nil
	}
	in := []Record{{Collection: "workouts", RecordID: "w1", Payload: []byte(`{"id":"w1","origin":"coach"}`)}}
	keep, drop, err := guardCoachRoutines(in, lookup)
	if err != nil || calls != 0 || len(drop) != 0 || len(keep) != 1 || string(keep[0].Payload) != string(in[0].Payload) {
		t.Fatalf("keep=%v drop=%v calls=%d err=%v", keep, drop, calls, err)
	}
}
