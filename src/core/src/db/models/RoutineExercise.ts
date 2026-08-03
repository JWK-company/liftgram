// [sync-core] 이 파일은 파생물이다 — 원본 app/src/db/models/ 에서 옮기며 데코레이터 필드를
// `declare` 형태로 바꿨다(SWC에서 class-fields가 접근자를 가리는 것을 막는다 · scripts/sync-core.mjs).
// 루틴 내 종목 + 목표(세트/반복범위/휴식/슈퍼셋) (SRS-002). @plm SRS-002
import { Model, Relation, associations } from '@nozbe/watermelondb';
import { field, text, date, readonly, relation, immutableRelation, json } from '@nozbe/watermelondb/decorators';
import { sanitizeCardioTarget, sanitizePrescription, type CardioTargetJson, type PrescribedSet } from './_sanitizers';
import type Routine from './Routine';
import type Exercise from './Exercise';

export default class RoutineExercise extends Model {
  static table = 'routine_exercises';
  static associations = associations(
    ['routines', { type: 'belongs_to', key: 'routine_id' }],
    ['exercises', { type: 'belongs_to', key: 'exercise_id' }],
  );

  @field('routine_id') declare routineId: string;
  @field('exercise_id') declare exerciseId: string;
  @field('target_sets') declare targetSets: number;
  @field('target_reps_min') declare targetRepsMin: number | null;
  @field('target_reps_max') declare targetRepsMax: number | null;
  @field('target_weight_kg') declare targetWeightKg: number | null;
  @field('rest_seconds') declare restSeconds: number;
  @text('machine_variant') declare machineVariant: string | null; // v5(레거시): 머신 브랜드 키
  // v6: 종목 변형(기구·그립·팔). @plm SRS-028
  @text('variant_key') declare variantKey: string | null; // canonical 버킷 키(파생, null=기본)
  @text('variant_equipment') declare variantEquipment: string | null;
  @text('variant_grip') declare variantGrip: string | null;
  @text('variant_arm') declare variantArm: string | null;
  @text('superset_group') declare supersetGroup: string | null;
  @field('sort_order') declare sortOrder: number;
  @text('note') declare note: string | null;
  @json('cardio_target', sanitizeCardioTarget) declare cardioTarget: CardioTargetJson | null; // v13: 유산소 목표. @plm SRS-030
  @json('prescription', sanitizePrescription) declare prescription: PrescribedSet[] | null; // v16: 세트별 처방(사람 작성 — ADR-028). @plm SRS-043
  @readonly @date('created_at') declare createdAt: Date;
  @readonly @date('updated_at') declare updatedAt: Date;

  @immutableRelation('routines', 'routine_id') declare routine: Relation<Routine>;
  // 대체운동 스왑 시 exercise_id 변경 가능 → 가변 relation (SRS-001)
  @relation('exercises', 'exercise_id') declare exercise: Relation<Exercise>;
}
