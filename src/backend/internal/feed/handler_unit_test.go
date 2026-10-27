// @plm SRS-067  공유 종목의 무게 단위 — kg|lb 만 왕복하고 그 밖은 비운다(옛 글처럼)
package feed

import (
	"testing"

	feedv1 "github.com/JWK-company/liftgram/src/backend/gen/feed/v1"
)

func TestShareWeightUnitRoundTrip(t *testing.T) {
	in := []*feedv1.WorkoutExercise{
		{Name: "머신 체스트 프레스", WeightUnit: "lb", Sets: []*feedv1.WorkoutSet{{WeightKg: 45.359237, Reps: 10}}},
		{Name: "바벨 벤치프레스", WeightUnit: "kg"},
		{Name: "옛 글", WeightUnit: ""},
		{Name: "조작", WeightUnit: "stone"},
	}
	got := toProtoExercises(fromProtoExercises(in))
	want := []string{"lb", "kg", "", ""}
	for i, ex := range got {
		if ex.GetWeightUnit() != want[i] {
			t.Fatalf("%s: weight_unit %q, want %q", ex.GetName(), ex.GetWeightUnit(), want[i])
		}
	}
	if w := got[0].GetSets()[0].GetWeightKg(); w != 45.359237 {
		t.Fatalf("무게는 kg 그대로여야 한다: %v", w)
	}
}
