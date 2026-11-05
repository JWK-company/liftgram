// 동작 주의 문구 (SPEC-028 · REV-035) — 어깨·척추 가동범위를 많이 쓰거나 숙련이 필요한 종목에 상세 화면 한 줄로 보인다.
// 위험하다고 단정하지 않고 어떤 조건에서 하는 동작인지만 적는다(진단·치료 표현 금지 — SRS-015).
export type ExerciseCaution = 'shoulderRange' | 'spineLight' | 'advancedStrength';

const CAUTION_BY_ID: Readonly<Record<string, ExerciseCaution>> = {
  'seed-barbell-guillotine-press': 'shoulderRange',
  'seed-behind-the-neck-pull-up': 'shoulderRange',
  'seed-barbell-bradford-press': 'shoulderRange',
  'seed-barbell-sots-press': 'shoulderRange',
  'seed-korean-dip': 'shoulderRange',
  'seed-barbell-behind-the-neck-press': 'shoulderRange',
  'seed-cable-behind-the-neck-pulldown': 'shoulderRange',
  'seed-smith-behind-the-neck-press': 'shoulderRange',
  'seed-barbell-jefferson-curl': 'spineLight',
  'seed-dumbbell-jefferson-curl': 'spineLight',
  'seed-planche': 'advancedStrength',
  'seed-planche-push-up': 'advancedStrength',
  'seed-human-flag': 'advancedStrength',
  'seed-kettlebell-bent-press': 'advancedStrength',
};

export function exerciseCautionOf(exerciseId: string): ExerciseCaution | null {
  return CAUTION_BY_ID[exerciseId] ?? null;
}

export const EXERCISE_CAUTION_IDS: readonly string[] = Object.keys(CAUTION_BY_ID);
