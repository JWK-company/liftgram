// 운동 카탈로그 모델 (SRS-001). @plm SRS-001
import { Model, associations } from '@nozbe/watermelondb';
import { field, text, date, readonly, json } from '@nozbe/watermelondb/decorators';
import { sanitizeStringArray } from './_sanitizers';
import type { EquipmentType, MuscleGroup } from '../../domain';

export default class Exercise extends Model {
  static table = 'exercises';
  static associations = associations(
    ['routine_exercises', { type: 'has_many', foreignKey: 'exercise_id' }],
    ['workout_exercises', { type: 'has_many', foreignKey: 'exercise_id' }],
  );

  @text('name_ko') nameKo!: string;
  @text('name_en') nameEn!: string | null;
  @json('primary_muscles', sanitizeStringArray) primaryMuscles!: MuscleGroup[];
  @json('secondary_muscles', sanitizeStringArray) secondaryMuscles!: MuscleGroup[];
  @field('equipment') equipment!: EquipmentType;
  @text('category') category!: string | null;
  @field('is_custom') isCustom!: boolean;
  @json('substitute_ids', sanitizeStringArray) substituteIds!: string[];
  @field('is_archived') isArchived!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
