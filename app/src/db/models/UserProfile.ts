// 사용자 프로필 모델 (SRS-006). Phase 0: 로컬 단일 사용자. @plm SRS-006
import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly } from '@nozbe/watermelondb/decorators';
import type { AppLanguage, WeightUnit } from '../../domain';

export default class UserProfile extends Model {
  static table = 'user_profiles';

  @text('server_id') serverId!: string | null;
  @text('email') email!: string | null;
  @text('display_name') displayName!: string | null;
  @field('auth_provider') authProvider!: string; // 'local' | 'email' | 'google' | 'apple'
  @field('preferred_language') preferredLanguage!: AppLanguage;
  @field('weight_unit') weightUnit!: WeightUnit;
  @field('bar_weight_kg') barWeightKg!: number;
  @field('last_sync_at') lastSyncAt!: number | null;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;
}
