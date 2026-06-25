// 근육군·기구 한국어 라벨 (UI 표시용 순수 맵). KR 우선 로컬라이즈 — @plm SRS-013
import { EquipmentType, MuscleGroup } from './types';

export const MUSCLE_LABELS_KO: Record<MuscleGroup, string> = {
  chest: '가슴',
  back: '등',
  shoulders: '어깨',
  biceps: '이두',
  triceps: '삼두',
  forearms: '전완',
  quads: '대퇴사두',
  hamstrings: '햄스트링',
  glutes: '둔근',
  calves: '종아리',
  abs: '복근',
  traps: '승모',
  fullBody: '전신',
  other: '기타',
};

export const EQUIPMENT_LABELS_KO: Record<EquipmentType, string> = {
  barbell: '바벨',
  dumbbell: '덤벨',
  machine: '머신',
  cable: '케이블',
  bodyweight: '맨몸',
  kettlebell: '케틀벨',
  band: '밴드',
  smith: '스미스머신',
  other: '기타',
};

export function muscleLabel(m: MuscleGroup): string {
  return MUSCLE_LABELS_KO[m] ?? m;
}

export function equipmentLabel(e: EquipmentType): string {
  return EQUIPMENT_LABELS_KO[e] ?? e;
}
