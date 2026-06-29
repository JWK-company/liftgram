// 운동 카탈로그 시드 — 멱등 top-up (SRS-001). 매 실행 시 nameKo 기준으로 DB에 없는
// 기본(비커스텀) 종목만 추가한다. 신규 설치=전건 주입, 기존 DB=신규 추가분만 보강.
// 추가로 대체운동(SUBSTITUTES)을 nameKo->id로 해소해 substituteIds에 멱등 적용(기존 DB 보강 포함).
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { Exercise } from '../db/models';
import { SEED_EXERCISES } from './seed/exercises.seed';
import { SUBSTITUTES } from './seed/substitutes.seed';

export async function seedExercisesIfNeeded(): Promise<number> {
  const exercises = database.get<Exercise>('exercises');
  const existing = await exercises.query(Q.where('is_custom', false)).fetch();
  const haveNames = new Set(existing.map((e) => e.nameKo));
  const missing = SEED_EXERCISES.filter((seed) => !haveNames.has(seed.nameKo));
  if (missing.length) {
    await database.write(async () => {
      await database.batch(
        ...missing.map((seed) =>
          exercises.prepareCreate((e) => {
            e.nameKo = seed.nameKo;
            e.nameEn = seed.nameEn ?? null;
            e.primaryMuscles = seed.primaryMuscles;
            e.secondaryMuscles = seed.secondaryMuscles ?? [];
            e.equipment = seed.equipment;
            e.category = seed.category ?? null;
            e.isCustom = false;
            e.substituteIds = [];
            e.isArchived = false;
          }),
        ),
      );
    });
  }
  await syncSubstitutes();
  return missing.length;
}

// 대체운동 큐레이션을 현재 DB id로 해소해 substituteIds에 반영(멱등). 큐레이션 갱신·기존 DB 보강 모두 처리.
async function syncSubstitutes(): Promise<void> {
  const exercises = database.get<Exercise>('exercises');
  const all = await exercises.query(Q.where('is_custom', false)).fetch();
  const idByName = new Map(all.map((e) => [e.nameKo, e.id]));
  const pending = all
    .map((e) => {
      const subNames = SUBSTITUTES[e.nameKo];
      if (!subNames) return null;
      const ids = subNames.map((n) => idByName.get(n)).filter((x): x is string => !!x);
      return arraysEqual(e.substituteIds, ids) ? null : { e, ids };
    })
    .filter((x): x is { e: Exercise; ids: string[] } => x !== null);
  if (!pending.length) return;
  await database.write(async () => {
    await database.batch(
      ...pending.map(({ e, ids }) =>
        e.prepareUpdate((rec) => {
          rec.substituteIds = ids;
        }),
      ),
    );
  });
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
