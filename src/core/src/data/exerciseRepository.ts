// 운동 카탈로그 데이터 접근 (SRS-001). 화면은 DB를 직접 만지지 않고 이 repository만 사용.
// @plm SRS-001
import { Q } from '@nozbe/watermelondb';
import type { Query } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { Exercise, ExerciseUserPref } from '../db/models';
import type { EquipmentType, ExerciseKind, MuscleGroup } from '../domain';

const exercises = () => database.get<Exercise>('exercises');

// nameKo 정확 일치로 종목 id 조회(콘셉트 루틴 저장 등 — 시드 KEY 규약). 없는 이름은 결과에서 빠진다. @plm SRS-047
export async function getExerciseIdsByNames(namesKo: string[]): Promise<Map<string, string>> {
  if (namesKo.length === 0) return new Map();
  const rows = await exercises()
    .query(Q.where('name_ko', Q.oneOf(namesKo)), Q.where('is_archived', false))
    .fetch();
  return new Map(rows.map((e) => [e.nameKo, e.id]));
}

// 로컬에 있고 보관되지 않은 종목 id 만 — 콘셉트 루틴 저장(종목 KEY = seed id · P2 ADR-033). @plm SRS-047 SRS-055
export async function getActiveExerciseIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await exercises()
    .query(Q.where('id', Q.oneOf(ids)), Q.where('is_archived', false))
    .fetch();
  return new Set(rows.map((e) => e.id));
}

export interface ExerciseFilter {
  search?: string;
  muscle?: MuscleGroup | null;
  equipment?: EquipmentType | null;
  kind?: ExerciseKind | null; // v10: 'cardio'=유산소만. @plm SRS-030 (스무고개 유산소 경로)
  includeArchived?: boolean;
}

// 반응형 쿼리(검색/근육군/기구/종류 필터). 근육군은 JSON 컬럼 LIKE로 멤버십 근사 매칭.
export function queryExercises(filter: ExerciseFilter = {}): Query<Exercise> {
  const clauses: Q.Clause[] = [];
  if (!filter.includeArchived) clauses.push(Q.where('is_archived', false));
  if (filter.equipment) clauses.push(Q.where('equipment', filter.equipment));
  if (filter.kind) clauses.push(Q.where('kind', filter.kind));
  if (filter.muscle) clauses.push(Q.where('primary_muscles', Q.like(`%"${filter.muscle}"%`)));
  const search = filter.search?.trim();
  if (search) {
    const s = Q.sanitizeLikeString(search);
    clauses.push(Q.or(Q.where('name_ko', Q.like(`%${s}%`)), Q.where('name_en', Q.like(`%${s}%`))));
  }
  clauses.push(Q.sortBy('name_ko', Q.asc));
  return exercises().query(...clauses);
}

export function getExercise(id: string): Promise<Exercise> {
  return exercises().find(id);
}

// ── 표시 이름(ADR-033 · QA M3) ── 사용자가 고른 이름(별칭)이 있으면 그것, 없으면 대표 이름. @plm SRS-056
// 최소판(P2): 이관이 옛 이름을 심어 둔 종목이 갑자기 새 이름으로 바뀌지 않게 한다. 고르기·되돌리기는 P3.
export async function getExerciseDisplayName(id: string): Promise<{ nameKo: string; nameEn: string | null; displayName: string | null; kind: string | null; equipment: string } | null> {
  let ex: Exercise;
  try {
    ex = await exercises().find(id);
  } catch {
    return null;
  }
  let displayName: string | null = null;
  try {
    const { exercisePrefId } = await import('../db/models/ExerciseUserPref');
    const pref = await database.get<ExerciseUserPref>('exercise_user_prefs').find(exercisePrefId(id));
    displayName = pref.displayName?.trim() || null;
  } catch {
    // 선호 없음 — 대표 이름
  }
  return { nameKo: ex.nameKo, nameEn: ex.nameEn, displayName, kind: ex.kind, equipment: ex.equipment };
}

export interface CustomExerciseInput {
  nameKo: string;
  nameEn?: string | null;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles?: MuscleGroup[];
  equipment: EquipmentType;
  category?: string | null;
  imageUrl?: string | null;
}

export async function createCustomExercise(input: CustomExerciseInput): Promise<Exercise> {
  return database.write(async () =>
    exercises().create((e) => {
      e.nameKo = input.nameKo.trim();
      e.nameEn = input.nameEn?.trim() || null;
      e.primaryMuscles = input.primaryMuscles;
      e.secondaryMuscles = input.secondaryMuscles ?? [];
      e.equipment = input.equipment;
      e.category = input.category ?? null;
      e.imageUrl = input.imageUrl ?? null;
      e.isCustom = true;
      e.substituteIds = [];
      e.isArchived = false;
    }),
  );
}

export async function updateExercise(
  id: string,
  patch: Partial<Pick<Exercise, 'nameKo' | 'nameEn' | 'primaryMuscles' | 'secondaryMuscles' | 'equipment' | 'category' | 'imageUrl' | 'substituteIds'>>,
): Promise<void> {
  await database.write(async () => {
    const e = await exercises().find(id);
    await e.update((rec) => {
      if (patch.nameKo !== undefined) rec.nameKo = patch.nameKo;
      if (patch.nameEn !== undefined) rec.nameEn = patch.nameEn;
      if (patch.primaryMuscles !== undefined) rec.primaryMuscles = patch.primaryMuscles;
      if (patch.secondaryMuscles !== undefined) rec.secondaryMuscles = patch.secondaryMuscles;
      if (patch.equipment !== undefined) rec.equipment = patch.equipment;
      if (patch.category !== undefined) rec.category = patch.category;
      if (patch.imageUrl !== undefined) rec.imageUrl = patch.imageUrl;
      if (patch.substituteIds !== undefined) rec.substituteIds = patch.substituteIds;
    });
  });
}

export async function archiveExercise(id: string): Promise<void> {
  let isCustom = true;
  await database.write(async () => {
    const e = await exercises().find(id);
    isCustom = e.isCustom;
    await e.update((rec) => {
      rec.isArchived = true;
    });
  });
  // 기본 종목은 행이 동기되지 않는다(D10) — 숨김을 계정 선호에도 적어 다른 기기·카탈로그 재수신에도 유지한다(/qa code M-4)
  if (!isCustom) {
    const { setExerciseHidden } = await import('./exercisePrefs');
    await setExerciseHidden(id, true);
  }
}

// 대체운동: 명시적 substituteIds 우선(큐레이션 랭킹 순서 보존), 없으면 같은 주근육군 후보로 폴백 (SRS-001).
export async function getSubstitutes(exercise: Exercise): Promise<Exercise[]> {
  if (exercise.substituteIds.length) {
    const found = await exercises().query(Q.where('id', Q.oneOf(exercise.substituteIds))).fetch();
    const byId = new Map(found.map((e) => [e.id, e]));
    return exercise.substituteIds.map((id) => byId.get(id)).filter((x): x is Exercise => !!x);
  }
  const primary = exercise.primaryMuscles[0];
  if (!primary) return [];
  const candidates = await exercises()
    .query(Q.where('is_archived', false), Q.where('primary_muscles', Q.like(`%"${primary}"%`)))
    .fetch();
  return candidates.filter((c) => c.id !== exercise.id);
}
