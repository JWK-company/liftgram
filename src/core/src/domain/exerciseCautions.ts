// 동작 주의 문구 (SPEC-028 · REV-035) — 어깨·척추 가동범위를 많이 쓰거나 숙련이 필요한 종목에 상세 화면 한 줄로 보인다.
// 위험하다고 단정하지 않고 어떤 조건에서 하는 동작인지만 적는다(진단·치료 표현 금지 — SRS-015).
export type ExerciseCaution = 'shoulderRange' | 'spineLight' | 'advancedStrength' | 'neckLight';

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
  // SPEC-036 영상을 새로 붙인 고난도·탄도 동작
  'seed-power-clean': 'advancedStrength',
  'seed-hang-clean': 'advancedStrength',
  'seed-barbell-muscle-clean': 'advancedStrength',
  'seed-barbell-block-clean': 'advancedStrength',
  'seed-clean-and-jerk': 'advancedStrength',
  'seed-clean-and-press': 'advancedStrength',
  'seed-split-jerk': 'advancedStrength',
  'seed-power-jerk': 'advancedStrength',
  'seed-snatch': 'advancedStrength',
  'seed-power-snatch': 'advancedStrength',
  'seed-hang-snatch': 'advancedStrength',
  'seed-barbell-block-snatch': 'advancedStrength',
  'seed-barbell-muscle-snatch': 'advancedStrength',
  'seed-dumbbell-snatch': 'advancedStrength',
  'seed-kettlebell-snatch': 'advancedStrength',
  'seed-muscle-up': 'advancedStrength',
  'seed-rope-climb': 'advancedStrength',
  'seed-turkish-get-up': 'advancedStrength',
  'seed-back-lever': 'advancedStrength',
  'seed-dragon-flag': 'advancedStrength',
  'seed-front-lever-hold': 'advancedStrength',
  'seed-front-lever-raise': 'advancedStrength',
  'seed-handstand-hold': 'advancedStrength',
  'seed-handstand-walk': 'advancedStrength',
  'seed-handstand-push-up': 'advancedStrength',
  'seed-nordic-curl': 'advancedStrength',
  'seed-reverse-nordic': 'advancedStrength',
  'seed-pistol-squat': 'advancedStrength',
  'seed-pseudo-planche-push-up': 'advancedStrength',
  'seed-one-arm-pull-up': 'advancedStrength',
  'seed-box-jump': 'advancedStrength',
  'seed-lateral-box-jump': 'advancedStrength',
  'seed-burpee-box-jump': 'advancedStrength',
  'seed-kettlebell-windmill': 'advancedStrength',
  'seed-dumbbell-windmill': 'advancedStrength',
  'seed-clap-push-up': 'advancedStrength',
  'seed-kipping-pull-up': 'advancedStrength',
  'seed-archer-pull-up': 'advancedStrength',
  'seed-typewriter-pull-up': 'advancedStrength',
  'seed-glute-ham-raise': 'advancedStrength',
  'seed-ghd-sit-up': 'advancedStrength',
  'seed-dumbbell-clean': 'advancedStrength',
  'seed-kettlebell-clean': 'advancedStrength',
  'seed-dumbbell-clean-and-press': 'advancedStrength',
  'seed-kettlebell-clean-and-press': 'advancedStrength',
  'seed-clean-pull': 'advancedStrength',
  'seed-snatch-pull': 'advancedStrength',
  'seed-snatch-balance': 'advancedStrength',
  'seed-overhead-squat': 'advancedStrength',
  'seed-thruster': 'advancedStrength',
  'seed-dumbbell-thruster': 'advancedStrength',
  'seed-kettlebell-thruster': 'advancedStrength',
  'seed-jump-shrug': 'advancedStrength',
  'seed-barbell-jump-squat': 'advancedStrength',
  'seed-wall-walk': 'advancedStrength',
  'seed-ring-dip': 'advancedStrength',
  'seed-one-arm-push-up': 'advancedStrength',
  'seed-sissy-squat': 'advancedStrength',
  // SPEC-036 목 운동
  'seed-lying-neck-curl': 'neckLight',
  'seed-lying-neck-extension': 'neckLight',
  'seed-neck-harness-extension': 'neckLight',
  'seed-machine-neck-extension': 'neckLight',
  'seed-lying-neck-side-raise': 'neckLight',
};

export function exerciseCautionOf(exerciseId: string): ExerciseCaution | null {
  return CAUTION_BY_ID[exerciseId] ?? null;
}

export const EXERCISE_CAUTION_IDS: readonly string[] = Object.keys(CAUTION_BY_ID);

// SPEC-036 여러 동작으로 이뤄진 포괄 종목 — 영상은 그중 한 동작의 예시임을 함께 알린다.
const REPRESENTATIVE_MOTION_IDS: ReadonlySet<string> = new Set([
  'seed-hiit',
  'seed-yoga',
  'seed-pilates',
  'seed-aerobics',
  'seed-boxing',
  'seed-stretching',
  'seed-swimming',
  'seed-climbing',
]);

export function isRepresentativeMotion(exerciseId: string): boolean {
  return REPRESENTATIVE_MOTION_IDS.has(exerciseId);
}

export const REPRESENTATIVE_MOTION_ID_LIST: readonly string[] = [...REPRESENTATIVE_MOTION_IDS];
