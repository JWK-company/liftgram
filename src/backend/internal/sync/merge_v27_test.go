// v26 기기가 올려도 v27 칸(set_logs.value_source)이 지워지지 않는다 — SPEC-017 Phase 2(REV-003 저장소 M-3)
//
// 서버는 레코드를 해석하지 않는 jsonb 얕은 병합이라 바꾸지 않는다. merge_test.go 의 전제(① parseRecord 가 없는 키를
// 만들지 않는다 ② SQL 이 얕은 병합)를 그대로 쓰고, v27 칸 하나를 더 고정한다.
package sync

import (
	"encoding/json"
	"strings"
	"testing"
)

// v27 기기가 올려 둔 세트 — 잠금화면 「앱 열기」 판정용 값 출처가 있다.
const storedV27 = `{"id":"s1","workout_exercise_id":"we1","set_number":1,"weight_kg":20,"reps":8,` +
	`"value_source":"default","user_edited":false,"done":false,"updated_at":100}`

// 옛(v26) 기기가 같은 세트의 무게를 고쳐 올린 것 — value_source 를 모른다(키가 없다).
const pushedV26 = `{"id":"s1","workout_exercise_id":"we1","set_number":1,"weight_kg":40,"reps":8,` +
	`"user_edited":true,"done":false,"updated_at":200,"_status":"updated","_changed":"weight_kg,user_edited"}`

func TestPush_v26_기기가_올려도_value_source_는_남는다(t *testing.T) {
	_, cleaned, err := parseRecord(pushedV26)
	if err != nil {
		t.Fatalf("parseRecord: %v", err)
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(cleaned, &obj); err != nil {
		t.Fatal(err)
	}
	if _, ok := obj["value_source"]; ok {
		t.Fatalf("value_source 가 들어가면 안 된다(null 이면 병합이 그 칸을 지운다): %s", cleaned)
	}
	merged := jsonbConcat(t, []byte(storedV27), cleaned)
	for k, want := range map[string]string{"value_source": `"default"`, "weight_kg": "40", "user_edited": "true"} {
		if got := strings.TrimSpace(string(merged[k])); got != want {
			t.Errorf("%s = %s, want %s (병합 결과 %v)", k, got, want, merged)
		}
	}
	// pull 로 돌아갈 때 그대로 — 사람이 고쳤으니(user_edited) 옛 출처가 남아도 「앱 열기」는 아니다(core lockNeedsOpenApp)
}
