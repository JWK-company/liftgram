// 루틴 내 종목 + 목표(세트/반복범위/휴식/슈퍼셋) (SRS-002). @plm SRS-002
import { Model, Relation, associations } from '@nozbe/watermelondb';
import { field, text, date, readonly, relation, immutableRelation } from '@nozbe/watermelondb/decorators';
import type Routine from './Routine';
import type Exercise from './Exercise';

export default class RoutineExercise extends Model {
  static table = 'routine_exercises';
  static associations = associations(
    ['routines', { type: 'belongs_to', key: 'routine_id' }],
    ['exercises', { type: 'belongs_to', key: 'exercise_id' }],
  );

  @field('routine_id') routineId!: string;
  @field('exercise_id') exerciseId!: string;
  @field('target_sets') targetSets!: number;
  @field('target_reps_min') targetRepsMin!: number | null;
  @field('target_reps_max') targetRepsMax!: number | null;
  @field('target_weight_kg') targetWeightKg!: number | null;
  @field('rest_seconds') restSeconds!: number;
  @text('superset_group') supersetGroup!: string | null;
  @field('sort_order') sortOrder!: number;
  @text('note') note!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @immutableRelation('routines', 'routine_id') routine!: Relation<Routine>;
  // 대체운동 스왑 시 exercise_id 변경 가능 → 가변 relation (SRS-001)
  @relation('exercises', 'exercise_id') exercise!: Relation<Exercise>;
}
