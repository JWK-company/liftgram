// [sync-core] 이 파일은 파생물이다 — 원본 app/src/db/models/ 에서 옮기며 데코레이터 필드를
// `declare` 형태로 바꿨다(SWC에서 class-fields가 접근자를 가리는 것을 막는다 · scripts/sync-core.mjs).
// 운동 세션(라이브/완료) 모델 (SRS-004). @plm SRS-004
import { Model, Query, associations } from '@nozbe/watermelondb';
import { field, text, date, readonly, children } from '@nozbe/watermelondb/decorators';
import type { WorkoutState } from '../../domain';
import type WorkoutExercise from './WorkoutExercise';

export default class Workout extends Model {
  static table = 'workouts';
  static associations = associations(['workout_exercises', { type: 'has_many', foreignKey: 'workout_id' }]);

  @field('user_id') declare userId: string | null;
  @field('routine_id') declare routineId: string | null;
  @text('name') declare name: string | null;
  @field('state') declare state: WorkoutState;
  @field('started_at') declare startedAt: number;
  @field('paused_at') declare pausedAt: number | null;
  @field('accumulated_pause_ms') declare accumulatedPauseMs: number;
  @field('completed_at') declare completedAt: number | null;
  @field('total_volume_kg') declare totalVolumeKg: number;
  @field('duration_seconds') declare durationSeconds: number | null;
  @field('pr_count') declare prCount: number;
  @text('notes') declare notes: string | null;
  // v26: 기록 출처 — null = 앱에서 기록(옛 행 전부) · 'strong'|'hevy' = 가져옴. @plm SRS-081
  @field('source') declare source: string | null;
  // v26: 가져오기 묶음 id(null = 앱 기록) — 묶음 되돌리기(SRS-082). @plm SRS-082
  @field('import_batch_id') declare importBatchId: string | null;
  @readonly @date('created_at') declare createdAt: Date;
  @readonly @date('updated_at') declare updatedAt: Date;

  @children('workout_exercises') declare workoutExercises: Query<WorkoutExercise>;
}
