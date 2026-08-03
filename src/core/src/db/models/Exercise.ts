// [sync-core] 이 파일은 파생물이다 — 원본 app/src/db/models/ 에서 옮기며 데코레이터 필드를
// `declare` 형태로 바꿨다(SWC에서 class-fields가 접근자를 가리는 것을 막는다 · scripts/sync-core.mjs).
// 운동 카탈로그 모델 (SRS-001). @plm SRS-001
import { Model, associations } from '@nozbe/watermelondb';
import { field, text, date, readonly, json } from '@nozbe/watermelondb/decorators';
import { sanitizeStringArray } from './_sanitizers';
import type { EquipmentType, ExerciseKind, LoadMode, MuscleGroup } from '../../domain';

export default class Exercise extends Model {
  static table = 'exercises';
  static associations = associations(
    ['routine_exercises', { type: 'has_many', foreignKey: 'exercise_id' }],
    ['workout_exercises', { type: 'has_many', foreignKey: 'exercise_id' }],
  );

  @text('name_ko') declare nameKo: string;
  @text('name_en') declare nameEn: string | null;
  @json('primary_muscles', sanitizeStringArray) declare primaryMuscles: MuscleGroup[];
  @json('secondary_muscles', sanitizeStringArray) declare secondaryMuscles: MuscleGroup[];
  @field('equipment') declare equipment: EquipmentType;
  @text('category') declare category: string | null;
  @field('kind') declare kind: ExerciseKind | null; // v10: null/'strength'=근력, 'cardio'=유산소. @plm SRS-030
  @field('load_mode') declare loadMode: LoadMode | null; // v12: 'assisted'|'bodyweight'|null(외부무게). @plm SRS-033
  @field('is_custom') declare isCustom: boolean;
  @json('substitute_ids', sanitizeStringArray) declare substituteIds: string[];
  @text('image_url') declare imageUrl: string | null; // v7: 종목 이미지(#8)
  @field('is_archived') declare isArchived: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @readonly @date('updated_at') declare updatedAt: Date;
}
