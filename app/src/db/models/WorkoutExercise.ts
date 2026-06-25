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
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @immutableRelation('workouts', 'workout_id') workout!: Relation<Workout>;
  @relation('exercises', 'exercise_id') exercise!: Relation<Exercise>;
  @children('set_logs') setLogs!: Query<SetLog>;
}
