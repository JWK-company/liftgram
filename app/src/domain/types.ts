// 순수 도메인 타입 — React Native 의존성 0. 모든 계산 모듈과 UI가 공유하는 계약.
// @plm SRS-001 SRS-003 SRS-005

export type WeightUnit = 'kg' | 'lb';
export type AppLanguage = 'ko' | 'en';

export type EquipmentType =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'kettlebell'
  | 'band'
  | 'smith'
  | 'other';

// 종목 종류 — 근력(무게×횟수) vs 유산소(시간·거리). null/미지정=strength. @plm SRS-030
export type ExerciseKind = 'strength' | 'cardio';
export function isCardioKind(kind: ExerciseKind | null | undefined): boolean {
  return kind === 'cardio';
}

// 하중 모드 — 볼륨 계산 시 세트 무게의 의미. @plm SRS-033
// external(기본): 유효무게=무게(바벨/덤벨/머신). assisted: 유효무게=체중-무게(어시스트 머신, 보조하중 클수록 실무게↓).
// bodyweight: 유효무게=체중+무게(맨몸, 무게=가중분·0=순수 자체중).
export type LoadMode = 'external' | 'assisted' | 'bodyweight';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'abs'
  | 'traps'
  | 'fullBody'
  | 'other';

export type WorkoutState = 'active' | 'paused' | 'completed' | 'discarded';

// PR(개인 기록) 종류 — SRS-005
export type PRType = 'maxWeight' | 'maxReps' | 'maxVolumeSet' | 'estimated1RM';

// 프레임워크 독립적인 "기록된 세트" 표현. 모든 도메인 계산의 입력 단위.
// 무게는 항상 kg 정규화로 저장(단위 표시는 표현 계층에서 변환 — SRS-003).
export interface LoggedSet {
  weightKg: number;
  reps: number;
  rpe?: number | null;
  isWarmup: boolean;
  isFailed: boolean;
  partialReps?: number | null; // v9: 부분반복(깔짝) — 정자세 후 반동/보조로 추가한 횟수. 볼륨/PR 제외·표시전용. @plm SRS-029
  durationSec?: number | null; // v10: 유산소 수행 시간(초) — 볼륨/PR 제외. @plm SRS-030
  distanceM?: number | null; // v10: 유산소 거리(미터) — 볼륨/PR 제외. @plm SRS-030
  loadMode?: LoadMode | null; // v12: 하중모드(어시스트/맨몸) — 유효무게 계산. @plm SRS-033
  bodyweightKg?: number | null; // v12: 계산 시점 사용자 체중(assisted/bodyweight일 때만 사용). @plm SRS-033
  strictReps?: number | null; // (레거시 v6) 폐기 — 하위호환 읽기용
  loadAdjustKg?: number | null; // (레거시 v6) 폐기 — 하위호환 읽기용
}

export const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
  'traps',
  'fullBody',
  'other',
];

export const ALL_EQUIPMENT: EquipmentType[] = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'band',
  'smith',
  'other',
];
