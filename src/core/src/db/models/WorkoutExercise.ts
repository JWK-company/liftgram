// [sync-core] 이 파일은 파생물이다 — 원본 app/src/db/models/ 에서 옮기며 데코레이터 필드를
// `declare` 형태로 바꿨다(SWC에서 class-fields가 접근자를 가리는 것을 막는다 · scripts/sync-core.mjs).
// 세션 내 종목 인스턴스 (SRS-004). @plm SRS-004
import { Model, Query, Relation, associations } from '@nozbe/watermelondb';
import { field, text, date, readonly, children, relation, immutableRelation, json } from '@nozbe/watermelondb/decorators';
import { sanitizeCardioTarget, sanitizePrescription, type CardioTargetJson, type PrescribedSet } from './_sanitizers';
import type Workout from './Workout';
import type Exercise from './Exercise';
import type SetLog from './SetLog';

export default class WorkoutExercise extends Model {
  static table = 'workout_exercises';
  static associations = associations(
    ['workouts', { type: 'belongs_to', key: 'workout_id' }],
    ['exercises', { type: 'belongs_to', key: 'exercise_id' }],
    ['set_logs', { type: 'has_many', foreignKey: 'workout_exercise_id' }],
  );

  @field('workout_id') declare workoutId: string;
  @field('exercise_id') declare exerciseId: string;
  @field('sort_order') declare sortOrder: number;
  @text('note') declare note: string | null;
  @field('prev_weight_kg') declare prevWeightKg: number | null;
  @field('prev_reps') declare prevReps: number | null;
  // 루틴 목표 복사본(세션 시작 시 복사 — 세트 프리레이·휴식 기본값). v3
  @field('target_sets') declare targetSets: number | null;
  @field('target_reps_min') declare targetRepsMin: number | null;
  @field('target_reps_max') declare targetRepsMax: number | null;
  @field('target_weight_kg') declare targetWeightKg: number | null;
  @field('rest_seconds') declare restSeconds: number | null;
  @text('machine_variant') declare machineVariant: string | null; // v5(레거시): 머신 브랜드 키
  // v6: 종목 변형(기구·그립·팔) — variant_key=(exercise×variant) 버킷. @plm SRS-028
  @text('variant_key') declare variantKey: string | null; // canonical 버킷 키(파생, null=기본)
  @text('variant_equipment') declare variantEquipment: string | null;
  @text('variant_grip') declare variantGrip: string | null;
  @text('variant_arm') declare variantArm: string | null;
  @text('superset_group') declare supersetGroup: string | null; // v7: 세션 슈퍼셋 그룹(#20)
  @json('cardio_target', sanitizeCardioTarget) declare cardioTarget: CardioTargetJson | null; // v13: 유산소 목표(루틴서 복사). @plm SRS-030
  @json('prescription', sanitizePrescription) declare prescription: PrescribedSet[] | null; // v16: 처방(루틴서 복사 — 세션 렌더). @plm SRS-043
  @readonly @date('created_at') declare createdAt: Date;
  @readonly @date('updated_at') declare updatedAt: Date;

  @immutableRelation('workouts', 'workout_id') declare workout: Relation<Workout>;
  @relation('exercises', 'exercise_id') declare exercise: Relation<Exercise>;
  @children('set_logs') declare setLogs: Query<SetLog>;
}
