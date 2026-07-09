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
  @field('done') done!: boolean | null; // v3: 수행 완료 체크. null(레거시)=수행됨
  @field('completed_at') completedAt!: number | null;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @immutableRelation('workout_exercises', 'workout_exercise_id') workoutExercise!: Relation<WorkoutExercise>;
}
