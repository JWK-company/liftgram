// 사용자 프로필 모델 (SRS-006). Phase 0: 로컬 단일 사용자. @plm SRS-006
import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly, json } from '@nozbe/watermelondb/decorators';
import type { AppLanguage, EquipmentType, WeightUnit } from '../../domain';
import { sanitizeStringArray } from './_sanitizers';

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
  @field('bar_weight_kg') barWeightKg!: number;
  @field('bodyweight_kg') bodyweightKg!: number | null; // v12: 체중 — 맨몸±가중/보조 볼륨 계산. @plm SRS-033
  @field('last_sync_at') lastSyncAt!: number | null;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
