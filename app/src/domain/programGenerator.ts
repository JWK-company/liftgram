// 규칙기반 프로그램 생성 — 목표·경력·가용장비·주당일수 → 분할(PPL/상하체/전신) + 종목·세트·반복·강도.
// LLM 비의존(온디바이스 결정적). 점진적 과부하 원칙은 세트/반복 스킴 + 세션별 progression(SRS-010)으로 실현.
// 카탈로그는 최소 형태만 받아 도메인 순수 유지. 진단·치료 표현 없음(웰니스 — SRS-015). @plm SRS-009
import type { EquipmentType, MuscleGroup } from './types';

export type ProgramGoal = 'strength' | 'hypertrophy' | 'endurance';
export type ProgramExperience = 'beginner' | 'intermediate' | 'advanced';

export interface ProgramInput {
  goal: ProgramGoal;
  experience: ProgramExperience;
  daysPerWeek: number; // 2..6
  equipment: EquipmentType[]; // 빈 배열 = 전체(필터 없음)
}

export interface CatalogExercise {
  id: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  equipment: EquipmentType;
}

export interface ProgramSlot {
  exerciseId: string;
  alternatives: string[]; // 같은 근육군의 대체 후보(교체용)
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number;
}
export interface ProgramDay {
  templateKey: string;
  nameKey: string; // i18n 키(program.day.*)
  index: number; // 같은 템플릿 반복 시 A/B 구분용(0-based)
  slots: ProgramSlot[];
}
export interface GeneratedProgram {
  goal: ProgramGoal;
  experience: ProgramExperience;
  daysPerWeek: number;
  days: ProgramDay[];
}

// 분할별 요일 템플릿(타깃 근육 순서). 앞쪽=컴파운드 우선 슬롯.
const DAY_TEMPLATES: Record<string, { nameKey: string; muscles: MuscleGroup[] }> = {
  push: { nameKey: 'program.day.push', muscles: ['chest', 'chest', 'shoulders', 'shoulders', 'triceps', 'triceps'] },
  pull: { nameKey: 'program.day.pull', muscles: ['back', 'back', 'back', 'biceps', 'biceps', 'traps'] },
  legs: { nameKey: 'program.day.legs', muscles: ['quads', 'quads', 'hamstrings', 'glutes', 'calves', 'abs'] },
  upper: { nameKey: 'program.day.upper', muscles: ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'shoulders'] },
  lower: { nameKey: 'program.day.lower', muscles: ['quads', 'hamstrings', 'glutes', 'quads', 'calves', 'abs'] },
  full: { nameKey: 'program.day.full', muscles: ['quads', 'chest', 'back', 'shoulders', 'hamstrings', 'abs'] },
};

function splitFor(days: number): string[] {
  switch (Math.max(2, Math.min(6, Math.round(days)))) {
    case 2: return ['full', 'full'];
    case 3: return ['push', 'pull', 'legs'];
    case 4: return ['upper', 'lower', 'upper', 'lower'];
    case 5: return ['push', 'pull', 'legs', 'upper', 'lower'];
    default: return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
  }
}

const SCHEME: Record<ProgramGoal, { sets: number; repMin: number; repMax: number; rest: number }> = {
  strength: { sets: 5, repMin: 3, repMax: 5, rest: 180 },
  hypertrophy: { sets: 4, repMin: 8, repMax: 12, rest: 90 },
  endurance: { sets: 3, repMin: 12, repMax: 15, rest: 60 },
};

// 경력별 하루 종목 수.
const EX_COUNT: Record<ProgramExperience, number> = { beginner: 4, intermediate: 5, advanced: 6 };

function equipmentAllowed(eq: EquipmentType, available: EquipmentType[]): boolean {
  if (!available.length) return true; // 미설정 = 전체
  return eq === 'bodyweight' || available.includes(eq);
}

// 장비 우선순위(컴파운드성 도구 우선) — 동률 랭킹 보조.
const EQUIP_RANK: Record<string, number> = { barbell: 0, dumbbell: 1, smith: 2, machine: 3, cable: 4, kettlebell: 5, bodyweight: 6, band: 7, other: 8 };

// 근육군 후보를 컴파운드(보조근육 보유) 우선 + 장비 우선으로 정렬.
function rankedCandidates(catalog: CatalogExercise[], muscle: MuscleGroup, available: EquipmentType[]): string[] {
  return catalog
    .filter((e) => e.primaryMuscles[0] === muscle && equipmentAllowed(e.equipment, available))
    .map((e) => ({ id: e.id, compound: e.secondaryMuscles.length > 0 ? 0 : 1, eq: EQUIP_RANK[e.equipment] ?? 9 }))
    .sort((a, b) => a.compound - b.compound || a.eq - b.eq || (a.id < b.id ? -1 : 1))
    .map((x) => x.id);
}

export function generateProgram(input: ProgramInput, catalog: CatalogExercise[]): GeneratedProgram {
  const scheme = SCHEME[input.goal];
  const sets = Math.max(1, scheme.sets - (input.experience === 'beginner' ? 1 : 0));
  const exCount = EX_COUNT[input.experience];
  const splitKeys = splitFor(input.daysPerWeek);

  // 후보 풀 캐시(근육별) — 반복 템플릿 간 다양화 위해 dayIndex 오프셋 적용.
  const poolCache = new Map<MuscleGroup, string[]>();
  const pool = (m: MuscleGroup): string[] => {
    if (!poolCache.has(m)) poolCache.set(m, rankedCandidates(catalog, m, input.equipment));
    return poolCache.get(m)!;
  };

  // 같은 템플릿이 반복될 때(A/B) 구분 인덱스.
  const templateSeen = new Map<string, number>();

  const days: ProgramDay[] = splitKeys.map((key, dayIdx) => {
    const tmpl = DAY_TEMPLATES[key];
    const repeatIdx = templateSeen.get(key) ?? 0;
    templateSeen.set(key, repeatIdx + 1);

    const used = new Set<string>();
    const muscles = tmpl.muscles.slice(0, exCount);
    const slots: ProgramSlot[] = [];
    muscles.forEach((muscle, slotIdx) => {
      const candidates = pool(muscle).filter((id) => !used.has(id));
      if (!candidates.length) return; // 가용 장비로 채울 수 없는 슬롯 — 건너뜀
      // 반복 템플릿/슬롯마다 시작 오프셋을 줘 종목 다양화.
      const offset = (repeatIdx * 2 + slotIdx) % candidates.length;
      const chosen = candidates[offset];
      used.add(chosen);
      const alternatives = candidates.filter((id) => id !== chosen).slice(0, 4);
      slots.push({
        exerciseId: chosen,
        alternatives,
        targetSets: sets,
        targetRepsMin: scheme.repMin,
        targetRepsMax: scheme.repMax,
        restSeconds: scheme.rest,
      });
    });
    return { templateKey: key, nameKey: tmpl.nameKey, index: repeatIdx, slots };
  });

  return { goal: input.goal, experience: input.experience, daysPerWeek: input.daysPerWeek, days };
}
