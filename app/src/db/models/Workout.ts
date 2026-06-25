// 운동 세션(라이브/완료) 모델 (SRS-004). @plm SRS-004
import { Model, Query, associations } from '@nozbe/watermelondb';
import { field, text, date, readonly, children } from '@nozbe/watermelondb/decorators';
import type { WorkoutState } from '../../domain';
import type WorkoutExercise from './WorkoutExercise';

export default class Workout extends Model {
  static table = 'workouts';
  static associations = associations(['workout_exercises', { type: 'has_many', foreignKey: 'workout_id' }]);

  @field('user_id') userId!: string | null;
  @field('routine_id') routineId!: string | null;
  @text('name') name!: string | null;
  @field('state') state!: WorkoutState;
  @field('started_at') startedAt!: number;
  @field('paused_at') pausedAt!: number | null;
  @field('accumulated_pause_ms') accumulatedPauseMs!: number;
  @field('completed_at') completedAt!: number | null;
  @field('total_volume_kg') totalVolumeKg!: number;
  @field('duration_seconds') durationSeconds!: number | null;
  @field('pr_count') prCount!: number;
  @text('notes') notes!: string | null;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @children('workout_exercises') workoutExercises!: Query<WorkoutExercise>;
}
