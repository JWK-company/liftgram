// [sync-core] 이 파일은 파생물이다 — 원본 app/src/db/models/ 에서 옮기며 데코레이터 필드를
// `declare` 형태로 바꿨다(SWC에서 class-fields가 접근자를 가리는 것을 막는다 · scripts/sync-core.mjs).
// 사용자 프로필 모델 (SRS-006). Phase 0: 로컬 단일 사용자. @plm SRS-006
import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly, json } from '@nozbe/watermelondb/decorators';
import type { AppLanguage, EquipmentType, ExperienceLevel, GearTag, WeeklySchedule, WeightUnit } from '../../domain';
import { sanitizeCalendarNotesJson, sanitizeGearTags, sanitizeManualWorkoutDaysJson, sanitizeStringArray, sanitizeWeeklyScheduleJson } from './_sanitizers';

export default class UserProfile extends Model {
  static table = 'user_profiles';

  @text('server_id') declare serverId: string | null;
  @text('email') declare email: string | null;
  @text('display_name') declare displayName: string | null;
  @field('auth_provider') declare authProvider: string; // 'local' | 'email' | 'google' | 'apple'
  @field('preferred_language') declare preferredLanguage: AppLanguage;
  @field('weight_unit') declare weightUnit: WeightUnit;
  @json('available_equipment', sanitizeStringArray) declare availableEquipment: EquipmentType[]; // 빈=전체(필터 없음)
  @json('machine_variant_labels', sanitizeStringArray) declare machineVariantLabels: string[]; // v5: 커스텀 기구 이름(전역 공용, 최대 3)
  @json('my_gear', sanitizeGearTags) declare myGear: GearTag[]; // v14: 내 장비함 — 작성 선택기 재사용. @plm SRS-041
  @json('weekly_schedule', sanitizeWeeklyScheduleJson) declare weeklySchedule: WeeklySchedule | null; // v17: 주단위 스케줄·블록. @plm SRS-044
  @text('experience_level') declare experienceLevel: ExperienceLevel | null; // v18: 운동 경력(선택). @plm SRS-045
  @field('trainer_intent') declare trainerIntent: boolean | null; // v18: 코칭 의향 — 자격 보증 아님. @plm SRS-045
  @json('manual_workout_days', sanitizeManualWorkoutDaysJson) declare manualWorkoutDays: number[] | null; // v19: 수동 '운동했어요' 표시일(dayNumber). @plm SRS-011
  @json('calendar_notes', sanitizeCalendarNotesJson) declare calendarNotes: Record<string, string> | null; // v20: 날짜별 간단 메모(dayNumber 키). @plm SRS-011
  @field('bar_weight_kg') declare barWeightKg: number;
  @field('bodyweight_kg') declare bodyweightKg: number | null; // v12: 체중 — 맨몸±가중/보조 볼륨 계산. @plm SRS-033
  @field('last_sync_at') declare lastSyncAt: number | null;
  @readonly @date('created_at') declare createdAt: Date;
  @readonly @date('updated_at') declare updatedAt: Date;
}
