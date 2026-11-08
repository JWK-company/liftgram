// v27 기기가 올려도 v28 칸(set_logs.check_state)이 지워지지 않고, v28 기기가 null 을 올리면 지워진다 — SPEC-044(REV-079 D-9)
//
// 서버는 레코드를 해석하지 않는 jsonb 얕은 병합이라 바꾸지 않는다. merge_v27_test.go 와 같은 전제를 v28 칸에 고정한다.
package sync

import (
	"encoding/json"
	"strings"
	"testing"
)

// v28 기기가 올려 둔 세트 — 확인 필요 표시가 있다.
const storedV28 = `{"id":"s1","workout_exercise_id":"we1","set_number":1,"weight_kg":132,"reps":8,` +
	`"check_state":"suspect","done":true,"updated_at":100}`

func TestPush_v27_기기가_올려도_check_state_는_남는다(t *testing.T) {
	pushedV27 := `{"id":"s1","workout_exercise_id":"we1","set_number":1,"weight_kg":132,"reps":9,` +
		`"done":true,"updated_at":200,"_status":"updated","_changed":"reps"}`
	_, cleaned, err := parseRecord(pushedV27)
	if err != nil {
		t.Fatalf("parseRecord: %v", err)
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(cleaned, &obj); err != nil {
		t.Fatal(err)
	}
	if _, ok := obj["check_state"]; ok {
		t.Fatalf("check_state 가 들어가면 안 된다: %s", cleaned)
	}
	merged := jsonbConcat(t, []byte(storedV28), cleaned)
	for k, want := range map[string]string{"check_state": `"suspect"`, "reps": "9"} {
		if got := strings.TrimSpace(string(merged[k])); got != want {
			t.Errorf("%s = %s, want %s (병합 결과 %v)", k, got, want, merged)
		}
	}
}

func TestPush_v28_기기가_null_을_올리면_check_state_가_지워진다(t *testing.T) {
	pushedV28 := `{"id":"s1","workout_exercise_id":"we1","set_number":1,"weight_kg":59.874,"reps":8,` +
		`"check_state":null,"done":true,"updated_at":300,"_status":"updated","_changed":"weight_kg,check_state"}`
	_, cleaned, err := parseRecord(pushedV28)
	if err != nil {
		t.Fatalf("parseRecord: %v", err)
	}
	merged := jsonbConcat(t, []byte(storedV28), cleaned)
	if got := strings.TrimSpace(string(merged["check_state"])); got != "null" {
		t.Errorf("check_state = %s, want null (병합 결과 %v)", got, merged)
	}
	if got := strings.TrimSpace(string(merged["weight_kg"])); got != "59.874" {
		t.Errorf("weight_kg = %s, want 59.874", got)
	}
}
