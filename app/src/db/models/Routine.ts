// 루틴(세션 템플릿) 모델 (SRS-002). @plm SRS-002
import { Model, Query, associations } from '@nozbe/watermelondb';
import { field, text, date, readonly, children } from '@nozbe/watermelondb/decorators';
import type RoutineExercise from './RoutineExercise';

export default class Routine extends Model {
  static table = 'routines';
  static associations = associations(['routine_exercises', { type: 'has_many', foreignKey: 'routine_id' }]);

  @field('user_id') userId!: string | null;
  @text('name') name!: string;
  @text('folder') folder!: string | null;
  @text('notes') notes!: string | null;
  @field('sort_order') sortOrder!: number;
  @field('is_archived') isArchived!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @children('routine_exercises') routineExercises!: Query<RoutineExercise>;
}
