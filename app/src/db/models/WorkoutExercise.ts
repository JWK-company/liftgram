// 세션 내 종목 인스턴스 (SRS-004). @plm SRS-004
import { Model, Query, Relation, associations } from '@nozbe/watermelondb';
import { field, text, date, readonly, children, relation, immutableRelation } from '@nozbe/watermelondb/decorators';
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

  @field('workout_id') workoutId!: string;
  @field('exercise_id') exerciseId!: string;
  @field('sort_order') sortOrder!: number;
  @text('note') note!: string | null;
  @field('prev_weight_kg') prevWeightKg!: number | null;
  @field('prev_reps') prevReps!: number | null;
  // 루틴 목표 복사본(세션 시작 시 복사 — 세트 프리레이·휴식 기본값). v3
  @field('target_sets') targetSets!: number | null;
  @field('target_reps_min') targetRepsMin!: number | null;
  @field('target_reps_max') targetRepsMax!: number | null;
  @field('target_weight_kg') targetWeightKg!: number | null;
  @field('rest_seconds') restSeconds!: number | null;
  @text('machine_variant') machineVariant!: string | null; // v5(레거시): 머신 브랜드 키
  // v6: 종목 변형(기구·그립·팔) — variant_key=(exercise×variant) 버킷. @plm SRS-028
  @text('variant_key') variantKey!: string | null; // canonical 버킷 키(파생, null=기본)
  @text('variant_equipment') variantEquipment!: string | null;
  @text('variant_grip') variantGrip!: string | null;
  @text('variant_arm') variantArm!: string | null;
  @text('superset_group') supersetGroup!: string | null; // v7: 세션 슈퍼셋 그룹(#20)
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @immutableRelation('workouts', 'workout_id') workout!: Relation<Workout>;
  @relation('exercises', 'exercise_id') exercise!: Relation<Exercise>;
  @children('set_logs') setLogs!: Query<SetLog>;
}
