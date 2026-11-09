// v28 기기가 체중 줄을 올려도 v29 칸(bodyweight_logs.skeletal_muscle_kg·body_fat_pct)이 지워지지 않고,
// v29 기기가 null 을 올리면 지워진다 — SPEC-049 Phase 3(REV-094)
//
// 서버는 레코드를 해석하지 않는 jsonb 얕은 병합이라 바꾸지 않는다. merge_v28_test.go 와 같은 전제를 v29 칸에 고정한다.
package sync

import (
	"encoding/json"
	"strings"
	"testing"
)

// v29 기기가 올려 둔 체중 줄 — 인바디 두 칸이 있다.
const storedV29 = `{"id":"b1","measured_at":1700000000000,"weight_kg":72.4,"source":"manual",` +
	`"skeletal_muscle_kg":33.1,"body_fat_pct":18.5,"updated_at":100}`

func TestPush_v28_기기가_올려도_인바디_칸은_남는다(t *testing.T) {
	pushedV28 := `{"id":"b1","measured_at":1700000000000,"weight_kg":72.0,"source":"manual",` +
		`"updated_at":200,"_status":"updated","_changed":"weight_kg"}`
	_, cleaned, err := parseRecord(pushedV28)
	if err != nil {
		t.Fatalf("parseRecord: %v", err)
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(cleaned, &obj); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"skeletal_muscle_kg", "body_fat_pct"} {
		if _, ok := obj[k]; ok {
			t.Fatalf("%s 가 들어가면 안 된다: %s", k, cleaned)
		}
	}
	merged := jsonbConcat(t, []byte(storedV29), cleaned)
	for k, want := range map[string]string{"skeletal_muscle_kg": "33.1", "body_fat_pct": "18.5", "weight_kg": "72.0"} {
		if got := strings.TrimSpace(string(merged[k])); got != want {
			t.Errorf("%s = %s, want %s (병합 결과 %v)", k, got, want, merged)
		}
	}
}

func TestPush_v29_기기가_null_을_올리면_인바디_칸이_지워진다(t *testing.T) {
	pushedV29 := `{"id":"b1","measured_at":1700000000000,"weight_kg":72.4,"source":"manual",` +
		`"skeletal_muscle_kg":null,"body_fat_pct":19.2,"updated_at":300,"_status":"updated","_changed":"skeletal_muscle_kg,body_fat_pct"}`
	_, cleaned, err := parseRecord(pushedV29)
	if err != nil {
		t.Fatalf("parseRecord: %v", err)
	}
	merged := jsonbConcat(t, []byte(storedV29), cleaned)
	for k, want := range map[string]string{"skeletal_muscle_kg": "null", "body_fat_pct": "19.2"} {
		if got := strings.TrimSpace(string(merged[k])); got != want {
			t.Errorf("%s = %s, want %s (병합 결과 %v)", k, got, want, merged)
		}
	}
}
