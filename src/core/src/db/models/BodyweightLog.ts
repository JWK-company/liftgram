// v26: 체중 이력 — 측정 한 번이 한 줄(SRS-077). user_profiles.bodyweight_kg 는 최신 측정의 캐시(미러)다 —
// 미러 규칙은 한 곳(data/bodyweightRepository · P3)에서만 맞춘다(D-10). 계정과 함께 동기된다. @plm SRS-077
// 옛 행은 없다(새 표). 칸이 전부 optional 인 이유: WatermelonDB 는 기본값이 없어 non-optional number 가 0 이 된다(ADR-037 QA B1).
import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly } from '@nozbe/watermelondb/decorators';

/** 기록 출처 — null 은 manual 로 읽는다(D-6). */
export type BodyweightSource = 'checkin' | 'manual' | 'legacy';

export default class BodyweightLog extends Model {
  static table = 'bodyweight_logs';

  @field('measured_at') declare measuredAt: number | null; // 측정 시각(ms)
  @field('weight_kg') declare weightKg: number | null; // 정규 kg
  @field('source') declare source: BodyweightSource | null; // null = manual
  @text('note') declare note: string | null;
  @readonly @date('created_at') declare createdAt: Date;
  @readonly @date('updated_at') declare updatedAt: Date;
}
