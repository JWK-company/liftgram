// 운동 카탈로그 데이터 접근 (SRS-001). 화면은 DB를 직접 만지지 않고 이 repository만 사용.
// @plm SRS-001
import { Q } from '@nozbe/watermelondb';
import type { Query } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { Exercise } from '../db/models';
import type { EquipmentType, MuscleGroup } from '../domain';

const exercises = () => database.get<Exercise>('exercises');

export interface ExerciseFilter {
  search?: string;
  muscle?: MuscleGroup | null;
  equipment?: EquipmentType | null;
  includeArchived?: boolean;
}

// 반응형 쿼리(검색/근육군/기구 필터). 근육군은 JSON 컬럼 LIKE로 멤버십 근사 매칭.
export function queryExercises(filter: ExerciseFilter = {}): Query<Exercise> {
  const clauses: Q.Clause[] = [];
  if (!filter.includeArchived) clauses.push(Q.where('is_archived', false));
  if (filter.equipment) clauses.push(Q.where('equipment', filter.equipment));
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

export interface CustomExerciseInput {
  nameKo: string;
  nameEn?: string | null;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles?: MuscleGroup[];
  equipment: EquipmentType;
  category?: string | null;
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
      e.isCustom = true;
      e.substituteIds = [];
      e.isArchived = false;
    }),
  );
}

export async function updateExercise(
  id: string,
  patch: Partial<Pick<Exercise, 'nameKo' | 'nameEn' | 'primaryMuscles' | 'secondaryMuscles' | 'equipment' | 'category' | 'substituteIds'>>,
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
      if (patch.substituteIds !== undefined) rec.substituteIds = patch.substituteIds;
    });
  });
}

export async function archiveExercise(id: string): Promise<void> {
  await database.write(async () => {
    const e = await exercises().find(id);
    await e.update((rec) => {
      rec.isArchived = true;
    });
  });
}

// 대체운동: 명시적 substituteIds 우선, 없으면 같은 주근육군 후보로 폴백 (SRS-001).
export async function getSubstitutes(exercise: Exercise): Promise<Exercise[]> {
  if (exercise.substituteIds.length) {
    return exercises().query(Q.where('id', Q.oneOf(exercise.substituteIds))).fetch();
  }
  const primary = exercise.primaryMuscles[0];
  if (!primary) return [];
  const candidates = await exercises()
    .query(Q.where('is_archived', false), Q.where('primary_muscles', Q.like(`%"${primary}"%`)))
    .fetch();
  return candidates.filter((c) => c.id !== exercise.id);
}
