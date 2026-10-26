// 생성 당시 값 — 다른 기구(또는 다른 동작)의 사진을 빌려 쓰던 종목 id(ADR-036 · 카탈로그 개편 P5).
// 규칙: 미디어 표의 사진 폴더가 이 종목의 마스터 표 media(fedb:<id>)와 다르고, 폴더 이름의 기구가 이 종목의 기구와
// 다르면 「빌린 사진」. 여기에 사람이 본 4건(같은 이름의 맨몸·평지 동작 사진)을 더했다.
// 이 종목들은 사진을 쓰지 않고 픽토그램 + 단계 설명만 보여 준다. 드리프트는 pictograms.test.ts 가 막는다.
// @plm SRS-055
export const BORROWED_PHOTO_IDS: ReadonlySet<string> = new Set([
  'seed-incline-press-dumbbell',
  'seed-incline-press-machine',
  'seed-incline-press-smith',
  'seed-skull-crusher',
  'seed-walking-lunge',
  'seed-assisted-pull-up',
  'seed-smith-hip-thrust',
  'seed-front-raise-cable',
  'seed-front-raise-barbell',
  'seed-upright-row-cable',
  'seed-upright-row-dumbbell',
  'seed-preacher-curl-dumbbell',
  'seed-skull-crusher-dumbbell',
  'seed-triceps-kickback-cable',
  'seed-wrist-curl-dumbbell',
  'seed-lunge-barbell',
  'seed-lunge-smith',
  'seed-bulgarian-split-squat-barbell',
  'seed-bulgarian-split-squat-smith',
  'seed-hip-thrust-machine',
  'seed-chest-supported-row-dumbbell',
  'seed-plate-front-raise',
  'seed-shrug-machine',
  'seed-hip-thrust-dumbbell',
  // 사람이 본 것 — 맨몸 사진(어시스트 머신)·평지 싯업(디클라인)·다른 동작(랜드마인 재머)
  'seed-assisted-chin-up',
  'seed-assisted-dip',
  'seed-decline-sit-up',
  'seed-landmine-press',
]);
