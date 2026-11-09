// v29 기기가 루틴을 올려도 v30 칸(routines.origin·coach_id·coach_name·coach_for)이 지워지지 않고,
// v30 기기가 null 을 올리면 지워진다 — SPEC-050 Phase 4(P3a)
//
// 서버는 레코드를 해석하지 않는 jsonb 얕은 병합이라 바꾸지 않는다. merge_v29_test.go 와 같은 전제를 v30 칸에 고정한다.
// 코칭이 끝날 때 서버가 쓰는 한 칸 패치(`payload || {"origin":"coach_ended",...}` · P3b)도 같은 병합이라 나머지 칸이 남는다.
package sync

import (
	"encoding/json"
	"strings"
	"testing"
)

// 서버가 회원 sync_records 에 써 둔 코치 루틴(P3b SendRoutine 모양).
const storedV30 = `{"id":"coach-c1","name":"코치 상체","folder":null,"notes":"메모","sort_order":3,"is_archived":false,` +
	`"origin":"coach","coach_id":"u-coach","coach_name":"김코치","user_id":null,"updated_at":100}`

func TestPush_v29_기기가_올려도_루틴_출처_칸은_남는다(t *testing.T) {
	// 옛 앱(v29)은 출처 칸을 모른다 — 폴더만 바꿔 올린다
	pushedV29 := `{"id":"coach-c1","name":"코치 상체","folder":"받은 루틴","notes":"메모","sort_order":3,"is_archived":false,` +
		`"user_id":null,"updated_at":200,"_status":"updated","_changed":"folder"}`
	_, cleaned, err := parseRecord(pushedV29)
	if err != nil {
		t.Fatalf("parseRecord: %v", err)
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(cleaned, &obj); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"origin", "coach_id", "coach_name", "coach_for"} {
		if _, ok := obj[k]; ok {
			t.Fatalf("%s 가 들어가면 안 된다: %s", k, cleaned)
		}
	}
	merged := jsonbConcat(t, []byte(storedV30), cleaned)
	for k, want := range map[string]string{
		"origin": `"coach"`, "coach_id": `"u-coach"`, "coach_name": `"김코치"`, "folder": `"받은 루틴"`,
	} {
		if got := strings.TrimSpace(string(merged[k])); got != want {
			t.Errorf("%s = %s, want %s (병합 결과 %v)", k, got, want, merged)
		}
	}
}

func TestPush_v30_기기가_null_을_올리면_출처_칸이_지워진다(t *testing.T) {
	pushedV30 := `{"id":"coach-c1","name":"코치 상체","folder":null,"notes":"메모","sort_order":3,"is_archived":false,` +
		`"origin":null,"coach_id":null,"coach_name":null,"coach_for":null,"updated_at":300,"_status":"updated","_changed":"origin"}`
	_, cleaned, err := parseRecord(pushedV30)
	if err != nil {
		t.Fatalf("parseRecord: %v", err)
	}
	merged := jsonbConcat(t, []byte(storedV30), cleaned)
	for _, k := range []string{"origin", "coach_id", "coach_name", "coach_for"} {
		if got := strings.TrimSpace(string(merged[k])); got != "null" {
			t.Errorf("%s = %s, want null (병합 결과 %v)", k, got, merged)
		}
	}
}

func TestMerge_코칭_끝남_한_칸_패치는_나머지_칸을_남긴다(t *testing.T) {
	patch := []byte(`{"origin":"coach_ended","updated_at":400}`)
	merged := jsonbConcat(t, []byte(storedV30), patch)
	for k, want := range map[string]string{
		"origin": `"coach_ended"`, "coach_name": `"김코치"`, "name": `"코치 상체"`, "sort_order": "3", "updated_at": "400",
	} {
		if got := strings.TrimSpace(string(merged[k])); got != want {
			t.Errorf("%s = %s, want %s (병합 결과 %v)", k, got, want, merged)
		}
	}
}
