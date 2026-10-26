// 사용자 × 종목 선호 — 표시 이름(마지막으로 고른 별칭)·플레이트 한쪽 입력(ADR-033·037). 계정과 함께 동기된다.
// 레코드 id 는 결정적 `pref-<exercise_id>` — 여러 기기·서버 이관이 같은 행을 가리킨다(QA M3). @plm SRS-056 SRS-058
import { Model } from '@nozbe/watermelondb';
import { field, text, date, readonly } from '@nozbe/watermelondb/decorators';

export const exercisePrefId = (exerciseId: string): string => `pref-${exerciseId}`;

export default class ExerciseUserPref extends Model {
  static table = 'exercise_user_prefs';

  @field('exercise_id') declare exerciseId: string;
  @text('display_name') declare displayName: string | null;
  @field('plate_one_side') declare plateOneSide: boolean | null;
  /** v23: 기본 종목 숨기기 — 계정과 함께 동기된다(/qa code M-4) */
  @field('hidden') declare hidden: boolean | null;
  @readonly @date('created_at') declare createdAt: Date;
  @readonly @date('updated_at') declare updatedAt: Date;
}
