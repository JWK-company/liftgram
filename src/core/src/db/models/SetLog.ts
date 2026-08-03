// [sync-core] 이 파일은 파생물이다 — 원본 app/src/db/models/ 에서 옮기며 데코레이터 필드를
// `declare` 형태로 바꿨다(SWC에서 class-fields가 접근자를 가리는 것을 막는다 · scripts/sync-core.mjs).
// 세트 로그 — append-only 원자 단위 (SRS-003, ADR-002). @plm SRS-003
import { Model, Relation, associations } from '@nozbe/watermelondb';
import { field, date, readonly, immutableRelation } from '@nozbe/watermelondb/decorators';
import type WorkoutExercise from './WorkoutExercise';

export default class SetLog extends Model {
  static table = 'set_logs';
  static associations = associations(['workout_exercises', { type: 'belongs_to', key: 'workout_exercise_id' }]);

  @field('workout_exercise_id') declare workoutExerciseId: string;
  @field('set_number') declare setNumber: number;
  @field('weight_kg') declare weightKg: number; // 정규 kg
  @field('reps') declare reps: number;
  @field('rpe') declare rpe: number | null;
  @field('is_warmup') declare isWarmup: boolean;
  @field('is_failed') declare isFailed: boolean;
  @field('is_drop') declare isDrop: boolean | null; // v4: 드롭세트(세트타입 표시용)
  // v6: 로깅 정밀도 (SRS-029). @plm SRS-029
  @field('strict_reps') declare strictReps: number | null; // (레거시 v6) 폐기 — 하위호환
  @field('load_adjust_kg') declare loadAdjustKg: number | null; // (레거시 v6) 폐기 — 하위호환
  @field('partial_reps') declare partialReps: number | null; // v9: 부분반복(깔짝) — 볼륨/PR 제외 표시전용
  @field('duration_sec') declare durationSec: number | null; // v10: 유산소 수행 시간(초) — 볼륨/PR 제외. @plm SRS-030
  @field('distance_m') declare distanceM: number | null; // v10: 유산소 거리(미터·정규 저장). @plm SRS-030
  @field('incline_pct') declare inclinePct: number | null; // v13: 러닝머신 등 경사(%). @plm SRS-030
  @field('level') declare level: number | null; // v13: 사이클·천국의 계단 등 단계. @plm SRS-030
  @field('speed_kmh') declare speedKmh: number | null; // v15: 러닝머신 속도(km/h). @plm SRS-030
  @field('arm') declare arm: string | null; // v8: 세트별 편측 — 'uni'(원암/원레그), null=투암/투레그(기본)
  @field('grip') declare grip: string | null; // v11: 세트별 그립 — over/under/neutral/wide/close, null=기본(표시전용)
  // v16: 처방 어휘 — 세트 타입·목표 RIR. null=비처방(기존 세트·기존 동작 불변). @plm SRS-043
  @field('set_type') declare setType: string | null; // 'warmup'|'top'|'backoff'
  @field('target_rir') declare targetRir: number | null; // 0~6
  @field('done') declare done: boolean | null; // v3: 수행 완료 체크. null(레거시)=수행됨
  @field('completed_at') declare completedAt: number | null;
  @readonly @date('created_at') declare createdAt: Date;
  @readonly @date('updated_at') declare updatedAt: Date;

  @immutableRelation('workout_exercises', 'workout_exercise_id') declare workoutExercise: Relation<WorkoutExercise>;
}
