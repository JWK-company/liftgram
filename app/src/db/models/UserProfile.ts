// 사용자 프로필 모델 (SRS-006). Phase 0: 로컬 단일 사용자. @plm SRS-006
import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly, json } from '@nozbe/watermelondb/decorators';
import type { AppLanguage, EquipmentType, ExperienceLevel, GearTag, WeeklySchedule, WeightUnit } from '../../domain';
import { sanitizeGearTags, sanitizeStringArray, sanitizeWeeklyScheduleJson } from './_sanitizers';

export default class UserProfile extends Model {
  static table = 'user_profiles';

  @text('server_id') serverId!: string | null;
  @text('email') email!: string | null;
  @text('display_name') displayName!: string | null;
  @field('auth_provider') authProvider!: string; // 'local' | 'email' | 'google' | 'apple'
  @field('preferred_language') preferredLanguage!: AppLanguage;
  @field('weight_unit') weightUnit!: WeightUnit;
  @json('available_equipment', sanitizeStringArray) availableEquipment!: EquipmentType[]; // 빈=전체(필터 없음)
  @json('machine_variant_labels', sanitizeStringArray) machineVariantLabels!: string[]; // v5: 커스텀 기구 이름(전역 공용, 최대 3)
  @json('my_gear', sanitizeGearTags) myGear!: GearTag[]; // v14: 내 장비함 — 작성 선택기 재사용. @plm SRS-041
  @json('weekly_schedule', sanitizeWeeklyScheduleJson) weeklySchedule!: WeeklySchedule | null; // v17: 주단위 스케줄·블록. @plm SRS-044
  @text('experience_level') experienceLevel!: ExperienceLevel | null; // v18: 운동 경력(선택). @plm SRS-045
  @field('trainer_intent') trainerIntent!: boolean | null; // v18: 코칭 의향 — 자격 보증 아님. @plm SRS-045
  @field('bar_weight_kg') barWeightKg!: number;
  @field('bodyweight_kg') bodyweightKg!: number | null; // v12: 체중 — 맨몸±가중/보조 볼륨 계산. @plm SRS-033
  @field('last_sync_at') lastSyncAt!: number | null;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
