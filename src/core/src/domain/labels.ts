// 근육군·기구 표시 라벨 (ko/en). UI 표시용 순수 맵 — i18n 번들과 별개로 도메인 레이어에서 보유.
// 호출부는 현재 언어를 넘긴다: muscleLabel(m, lang). 미지정 시 ko 폴백(그레이스풀). @plm SRS-013
import { AppLanguage, EquipmentType, MuscleGroup } from './types';

export const MUSCLE_LABELS: Record<AppLanguage, Record<MuscleGroup, string>> = {
  ko: {
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
  },
  en: {
    chest: 'Chest',
    back: 'Back',
    shoulders: 'Shoulders',
    biceps: 'Biceps',
    triceps: 'Triceps',
    forearms: 'Forearms',
    quads: 'Quads',
    hamstrings: 'Hamstrings',
    glutes: 'Glutes',
    calves: 'Calves',
    abs: 'Abs',
    traps: 'Traps',
    fullBody: 'Full Body',
    other: 'Other',
  },
};

export const EQUIPMENT_LABELS: Record<AppLanguage, Record<EquipmentType, string>> = {
  ko: {
    barbell: '바벨',
    dumbbell: '덤벨',
    machine: '머신',
    cable: '케이블',
    bodyweight: '맨몸',
    kettlebell: '케틀벨',
    band: '밴드',
    smith: '스미스머신',
    other: '기타',
  },
  en: {
    barbell: 'Barbell',
    dumbbell: 'Dumbbell',
    machine: 'Machine',
    cable: 'Cable',
    bodyweight: 'Bodyweight',
    kettlebell: 'Kettlebell',
    band: 'Band',
    smith: 'Smith Machine',
    other: 'Other',
  },
};

export function muscleLabel(m: MuscleGroup, lang: AppLanguage = 'ko'): string {
  return MUSCLE_LABELS[lang][m] ?? m;
}

export function equipmentLabel(e: EquipmentType, lang: AppLanguage = 'ko'): string {
  return EQUIPMENT_LABELS[lang][e] ?? e;
}
