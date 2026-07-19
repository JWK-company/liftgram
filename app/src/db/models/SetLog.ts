// 세트 로그 — append-only 원자 단위 (SRS-003, ADR-002). @plm SRS-003
import { Model, Relation, associations } from '@nozbe/watermelondb';
import { field, date, readonly, immutableRelation } from '@nozbe/watermelondb/decorators';
import type WorkoutExercise from './WorkoutExercise';

export default class SetLog extends Model {
  static table = 'set_logs';
  static associations = associations(['workout_exercises', { type: 'belongs_to', key: 'workout_exercise_id' }]);

  @field('workout_exercise_id') workoutExerciseId!: string;
  @field('set_number') setNumber!: number;
  @field('weight_kg') weightKg!: number; // 정규 kg
  @field('reps') reps!: number;
  @field('rpe') rpe!: number | null;
  @field('is_warmup') isWarmup!: boolean;
  @field('is_failed') isFailed!: boolean;
  @field('is_drop') isDrop!: boolean | null; // v4: 드롭세트(세트타입 표시용)
  // v6: 로깅 정밀도 (SRS-029). @plm SRS-029
  @field('strict_reps') strictReps!: number | null; // (레거시 v6) 폐기 — 하위호환
  @field('load_adjust_kg') loadAdjustKg!: number | null; // (레거시 v6) 폐기 — 하위호환
  @field('partial_reps') partialReps!: number | null; // v9: 부분반복(깔짝) — 볼륨/PR 제외 표시전용
  @field('duration_sec') durationSec!: number | null; // v10: 유산소 수행 시간(초) — 볼륨/PR 제외. @plm SRS-030
  @field('distance_m') distanceM!: number | null; // v10: 유산소 거리(미터·정규 저장). @plm SRS-030
  @field('incline_pct') inclinePct!: number | null; // v13: 러닝머신 등 경사(%). @plm SRS-030
  @field('level') level!: number | null; // v13: 사이클·천국의 계단 등 단계. @plm SRS-030
  @field('arm') arm!: string | null; // v8: 세트별 편측 — 'uni'(원암/원레그), null=투암/투레그(기본)
  @field('grip') grip!: string | null; // v11: 세트별 그립 — over/under/neutral/wide/close, null=기본(표시전용)
  @field('done') done!: boolean | null; // v3: 수행 완료 체크. null(레거시)=수행됨
  @field('completed_at') completedAt!: number | null;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @immutableRelation('workout_exercises', 'workout_exercise_id') workoutExercise!: Relation<WorkoutExercise>;
}
