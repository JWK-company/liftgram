// @plm SRS-065  오운완 운동 상한 — 조작한 글의 종목·세트·이름을 서버에서 자른다(QA M-1)
package feed

import (
	"strings"
	"testing"

	feedv1 "github.com/JWK-company/liftgram/src/backend/gen/feed/v1"
)

func TestFromProtoExercisesClampsSharedWorkout(t *testing.T) {
	sets := make([]*feedv1.WorkoutSet, 2000)
	for i := range sets {
		sets[i] = &feedv1.WorkoutSet{WeightKg: 10, Reps: 5}
	}
	list := make([]*feedv1.WorkoutExercise, 300)
	for i := range list {
		list[i] = &feedv1.WorkoutExercise{Name: strings.Repeat("가", 500), Sets: sets}
	}
	out := fromProtoExercises(list)
	if len(out) != maxShareExercises {
		t.Fatalf("종목 수 %d, want %d", len(out), maxShareExercises)
	}
	for _, ex := range out {
		if len(ex.Sets) != maxShareSetsPerExercise {
			t.Fatalf("세트 수 %d, want %d", len(ex.Sets), maxShareSetsPerExercise)
		}
		if n := len([]rune(ex.Name)); n != maxShareNameRunes {
			t.Fatalf("이름 길이 %d, want %d", n, maxShareNameRunes)
		}
	}
}
