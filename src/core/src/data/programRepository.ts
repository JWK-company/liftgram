// 규칙기반 프로그램 — 카탈로그로 생성(buildProgram) + 루틴으로 채택(adoptProgram). @plm SRS-009
// 생성 로직은 순수 도메인(programGenerator), 여기선 DB 카탈로그 주입·루틴 영속화만 담당.
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { Routine, RoutineExercise, Exercise } from '../db/models';
import {
  generateProgram,
  generateFromSplits,
  type ProgramInput,
  type SplitProgramInput,
  type GeneratedProgram,
  type CatalogExercise,
} from '../domain';

const exercises = () => database.get<Exercise>('exercises');
const routines = () => database.get<Routine>('routines');
const routineExercises = () => database.get<RoutineExercise>('routine_exercises');

export async function buildProgram(input: ProgramInput): Promise<GeneratedProgram> {
  const list = await exercises().query(Q.where('is_archived', false)).fetch();
  const catalog: CatalogExercise[] = list.map((e) => ({
    id: e.id,
    primaryMuscles: e.primaryMuscles,
    secondaryMuscles: e.secondaryMuscles,
    equipment: e.equipment,
  }));
  return generateProgram(input, catalog);
}

// 커스텀 분할 생성 — 카탈로그 주입 후 순수 도메인(generateFromSplits) 위임. @plm SRS-009
export async function buildFromSplits(input: SplitProgramInput): Promise<GeneratedProgram> {
  const list = await exercises().query(Q.where('is_archived', false)).fetch();
  const catalog: CatalogExercise[] = list.map((e) => ({
    id: e.id,
    primaryMuscles: e.primaryMuscles,
    secondaryMuscles: e.secondaryMuscles,
    equipment: e.equipment,
  }));
  return generateFromSplits(input, catalog);
}

export interface AdoptRoutineInput {
  name: string;
  slots: Array<{
    exerciseId: string;
    targetSets: number;
    targetRepsMin: number;
    targetRepsMax: number;
    restSeconds: number;
  }>;
}

// 채택: 요일별 루틴 + 종목을 한 트랜잭션으로 생성. folder로 묶어 한 프로그램으로 식별.
export async function adoptProgram(folder: string, routinesInput: AdoptRoutineInput[]): Promise<void> {
  await database.write(async () => {
    const baseCount = await routines().query(Q.where('is_archived', false)).fetchCount();
    const ops: Array<Routine | RoutineExercise> = [];
    routinesInput.forEach((r, di) => {
      const routine = routines().prepareCreate((rec) => {
        rec.name = r.name;
        rec.folder = folder;
        rec.notes = null;
        rec.sortOrder = baseCount + di;
        rec.isArchived = false;
        rec.userId = null;
      });
      ops.push(routine);
      r.slots.forEach((slot, si) => {
        ops.push(
          routineExercises().prepareCreate((re) => {
            re.routineId = routine.id;
            re.exerciseId = slot.exerciseId;
            re.targetSets = slot.targetSets;
            re.targetRepsMin = slot.targetRepsMin;
            re.targetRepsMax = slot.targetRepsMax;
            re.targetWeightKg = null;
            re.restSeconds = slot.restSeconds;
            re.supersetGroup = null;
            re.sortOrder = si;
            re.note = null;
          }),
        );
      });
    });
    await database.batch(...ops);
  });
}
