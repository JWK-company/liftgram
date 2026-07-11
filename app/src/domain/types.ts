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
  strictReps?: number | null; // v6: 정자세 반복(null=전부 정자세). 나머지(reps−strict)=보조/치팅 — 볼륨/PR 제외. @plm SRS-029
  loadAdjustKg?: number | null; // v6: 보정무게 signed(어시스티드−/가중+). null=0
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
