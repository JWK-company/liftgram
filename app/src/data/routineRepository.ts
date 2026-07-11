// 루틴 빌더 데이터 접근 (SRS-002). 슈퍼셋·순서·복제·대체운동 스왑. @plm SRS-002
import { Q } from '@nozbe/watermelondb';
import type { Query } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { Routine, RoutineExercise } from '../db/models';
import { randomId } from '../utils/id';
import { variantColumns, type VariantDims } from '../domain/variants'; // @plm SRS-028

const routines = () => database.get<Routine>('routines');
const routineExercises = () => database.get<RoutineExercise>('routine_exercises');

export function queryRoutines(folder?: string | null): Query<Routine> {
  const clauses: Q.Clause[] = [Q.where('is_archived', false)];
  if (folder) clauses.push(Q.where('folder', folder));
  clauses.push(Q.sortBy('sort_order', Q.asc));
  return routines().query(...clauses);
}

export function getRoutine(id: string): Promise<Routine> {
  return routines().find(id);
}

export function queryRoutineExercises(routineId: string): Query<RoutineExercise> {
  return routineExercises().query(Q.where('routine_id', routineId), Q.sortBy('sort_order', Q.asc));
}

export async function createRoutine(input: {
  name: string;
  folder?: string | null;
  notes?: string | null;
}): Promise<Routine> {
  return database.write(async () => {
    const count = await routines().query(Q.where('is_archived', false)).fetchCount();
    return routines().create((r) => {
      r.name = input.name.trim() || '새 루틴';
      r.folder = input.folder ?? null;
      r.notes = input.notes ?? null;
      r.sortOrder = count;
      r.isArchived = false;
      r.userId = null;
    });
  });
}

export async function updateRoutine(
  id: string,
  patch: { name?: string; folder?: string | null; notes?: string | null },
): Promise<void> {
  await database.write(async () => {
    const r = await routines().find(id);
    await r.update((rec) => {
      if (patch.name !== undefined) rec.name = patch.name;
      if (patch.folder !== undefined) rec.folder = patch.folder;
      if (patch.notes !== undefined) rec.notes = patch.notes;
    });
  });
}

// 삭제 = 루틴 + 종목들 영구삭제(로컬). 동기 시엔 markAsDeleted가 삭제 플래그 전파.
export async function deleteRoutine(id: string): Promise<void> {
  await database.write(async () => {
    const r = await routines().find(id);
    const children = await routineExercises().query(Q.where('routine_id', id)).fetch();
    await database.batch(
      ...children.map((c) => c.prepareMarkAsDeleted()),
      r.prepareMarkAsDeleted(),
    );
  });
}

export interface RoutineExerciseInput {
  targetSets?: number;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetWeightKg?: number | null;
  restSeconds?: number;
  machineVariant?: string | null;
  supersetGroup?: string | null;
  note?: string | null;
}

export async function addExerciseToRoutine(
  routineId: string,
  exerciseId: string,
  input: RoutineExerciseInput = {},
): Promise<RoutineExercise> {
  return database.write(async () => {
    const count = await routineExercises().query(Q.where('routine_id', routineId)).fetchCount();
    return routineExercises().create((re) => {
      re.routineId = routineId;
      re.exerciseId = exerciseId;
      re.targetSets = input.targetSets ?? 3;
      re.targetRepsMin = input.targetRepsMin ?? 8;
      re.targetRepsMax = input.targetRepsMax ?? 12;
      re.targetWeightKg = input.targetWeightKg ?? null;
      re.restSeconds = input.restSeconds ?? 120;
      re.machineVariant = input.machineVariant ?? null;
      re.supersetGroup = input.supersetGroup ?? null;
      re.sortOrder = count;
      re.note = input.note ?? null;
    });
  });
}

export async function updateRoutineExercise(id: string, patch: RoutineExerciseInput): Promise<void> {
  await database.write(async () => {
    const re = await routineExercises().find(id);
    await re.update((rec) => {
      if (patch.targetSets !== undefined) rec.targetSets = patch.targetSets;
      if (patch.targetRepsMin !== undefined) rec.targetRepsMin = patch.targetRepsMin;
      if (patch.targetRepsMax !== undefined) rec.targetRepsMax = patch.targetRepsMax;
      if (patch.targetWeightKg !== undefined) rec.targetWeightKg = patch.targetWeightKg;
      if (patch.restSeconds !== undefined) rec.restSeconds = patch.restSeconds;
      if (patch.machineVariant !== undefined) rec.machineVariant = patch.machineVariant;
      if (patch.supersetGroup !== undefined) rec.supersetGroup = patch.supersetGroup;
      if (patch.note !== undefined) rec.note = patch.note;
    });
  });
}

// 루틴 종목의 변형(기구·그립·팔) 저장 — variant_key 파생 + 개별 차원, 레거시 machine_variant 미러. @plm SRS-028
export async function setRoutineExerciseVariant(id: string, dims: VariantDims): Promise<void> {
  const cols = variantColumns(dims);
  await database.write(async () => {
    const re = await routineExercises().find(id);
    await re.update((rec) => {
      rec.variantKey = cols.variantKey;
      rec.variantEquipment = cols.variantEquipment;
      rec.variantGrip = cols.variantGrip;
      rec.variantArm = cols.variantArm;
      rec.machineVariant = cols.variantEquipment; // 레거시 미러(기구 차원)
    });
  });
}

export async function removeRoutineExercise(id: string): Promise<void> {
  await database.write(async () => {
    const re = await routineExercises().find(id);
    await re.markAsDeleted();
  });
}

// 피드 게시물(운동)에서 종목 목록을 받아 새 루틴 + routine_exercises를 한 번의 write로 생성 — 소셜 루틴 가져오기.
// @plm SRS-002 @plm SRS-007
export interface ImportRoutineExercise {
  exerciseId: string;
  targetSets?: number;
  targetRepsMin?: number | null;
  targetWeightKg?: number | null;
}

export async function importRoutine(name: string, exercises: ImportRoutineExercise[]): Promise<Routine> {
  return database.write(async () => {
    const count = await routines().query(Q.where('is_archived', false)).fetchCount();
    const routine = await routines().create((r) => {
      r.name = name.trim() || '가져온 루틴';
      r.folder = null;
      r.notes = null;
      r.sortOrder = count;
      r.isArchived = false;
      r.userId = null;
    });
    await database.batch(
      ...exercises.map((ex, i) =>
        routineExercises().prepareCreate((re) => {
          re.routineId = routine.id;
          re.exerciseId = ex.exerciseId;
          re.targetSets = ex.targetSets ?? 3;
          re.targetRepsMin = ex.targetRepsMin ?? 8;
          re.targetRepsMax = 12;
          re.targetWeightKg = ex.targetWeightKg ?? null;
          re.restSeconds = 120;
          re.supersetGroup = null;
          re.sortOrder = i;
          re.note = null;
        }),
      ),
    );
    return routine;
  });
}

// 대체운동 스왑: 목표(세트/반복/휴식) 유지, exercise_id만 교체 (SRS-001/002).
export async function swapRoutineExercise(routineExerciseId: string, newExerciseId: string): Promise<void> {
  await database.write(async () => {
    const re = await routineExercises().find(routineExerciseId);
    await re.update((rec) => {
      rec.exerciseId = newExerciseId;
    });
  });
}

// 순서 재배치: orderedIds 순서대로 sort_order 재기록.
export async function reorderRoutineExercises(orderedIds: string[]): Promise<void> {
  await database.write(async () => {
    const records = await Promise.all(orderedIds.map((id) => routineExercises().find(id)));
    await database.batch(
      ...records.map((re, i) => re.prepareUpdate((rec) => { rec.sortOrder = i; })),
    );
  });
}

// 슈퍼셋 묶기/해제 (SRS-002).
export async function groupAsSuperset(routineExerciseIds: string[]): Promise<string> {
  const group = randomId('ss_');
  await database.write(async () => {
    const records = await Promise.all(routineExerciseIds.map((id) => routineExercises().find(id)));
    await database.batch(
      ...records.map((re) => re.prepareUpdate((rec) => { rec.supersetGroup = group; })),
    );
  });
  return group;
}

export async function ungroupSuperset(routineExerciseIds: string[]): Promise<void> {
  await database.write(async () => {
    const records = await Promise.all(routineExerciseIds.map((id) => routineExercises().find(id)));
    await database.batch(
      ...records.map((re) => re.prepareUpdate((rec) => { rec.supersetGroup = null; })),
    );
  });
}

// 루틴 복제(변형 워크플로우) — 새 루틴 + 종목 전체 복사 (SRS-002).
export async function duplicateRoutine(id: string): Promise<Routine> {
  return database.write(async () => {
    const src = await routines().find(id);
    const srcExercises = await routineExercises()
      .query(Q.where('routine_id', id), Q.sortBy('sort_order', Q.asc))
      .fetch();
    const count = await routines().query(Q.where('is_archived', false)).fetchCount();
    const copy = await routines().create((r) => {
      r.name = `${src.name} (복사본)`;
      r.folder = src.folder;
      r.notes = src.notes;
      r.sortOrder = count;
      r.isArchived = false;
      r.userId = src.userId;
    });
    await database.batch(
      ...srcExercises.map((se) =>
        routineExercises().prepareCreate((re) => {
          re.routineId = copy.id;
          re.exerciseId = se.exerciseId;
          re.targetSets = se.targetSets;
          re.targetRepsMin = se.targetRepsMin;
          re.targetRepsMax = se.targetRepsMax;
          re.targetWeightKg = se.targetWeightKg;
          re.restSeconds = se.restSeconds;
          re.supersetGroup = se.supersetGroup;
          re.sortOrder = se.sortOrder;
          re.note = se.note;
        }),
      ),
    );
    return copy;
  });
}
