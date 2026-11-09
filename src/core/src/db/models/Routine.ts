// [sync-core] 이 파일은 파생물이다 — 원본 app/src/db/models/ 에서 옮기며 데코레이터 필드를
// `declare` 형태로 바꿨다(SWC에서 class-fields가 접근자를 가리는 것을 막는다 · scripts/sync-core.mjs).
// 루틴(세션 템플릿) 모델 (SRS-002). @plm SRS-002
import { Model, Query, associations } from '@nozbe/watermelondb';
import { field, text, date, readonly, children } from '@nozbe/watermelondb/decorators';
import type RoutineExercise from './RoutineExercise';

export default class Routine extends Model {
  static table = 'routines';
  static associations = associations(['routine_exercises', { type: 'has_many', foreignKey: 'routine_id' }]);

  @field('user_id') declare userId: string | null;
  @text('name') declare name: string;
  @text('folder') declare folder: string | null;
  @text('notes') declare notes: string | null;
  @field('sort_order') declare sortOrder: number;
  @field('is_archived') declare isArchived: boolean;
  @readonly @date('created_at') declare createdAt: Date;
  @readonly @date('updated_at') declare updatedAt: Date;
  // v30(SPEC-050 P3a) 출처 — null=내가 만든 것 · 'coach' · 'coach_ended' · 'import'(domain/routineOrigin.ts)
  @field('origin') declare origin: string | null;
  @field('coach_id') declare coachId: string | null;
  @field('coach_name') declare coachName: string | null;
  @field('coach_for') declare coachFor: string | null; // 코치 기기 초안 — 보낼 회원 id(P3b)

  @children('routine_exercises') declare routineExercises: Query<RoutineExercise>;
}
