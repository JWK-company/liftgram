// 운동 카탈로그 시드 — 멱등 top-up (SRS-001). 매 실행 시 nameKo 기준으로 DB에 없는
// 기본(비커스텀) 종목만 추가한다. 신규 설치=전건 주입, 기존 DB=신규 추가분만 보강.
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { Exercise } from '../db/models';
import { SEED_EXERCISES } from './seed/exercises.seed';

export async function seedExercisesIfNeeded(): Promise<number> {
  const exercises = database.get<Exercise>('exercises');
  const existing = await exercises.query(Q.where('is_custom', false)).fetch();
  const haveNames = new Set(existing.map((e) => e.nameKo));
  const missing = SEED_EXERCISES.filter((seed) => !haveNames.has(seed.nameKo));
  if (!missing.length) return 0;
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
  return missing.length;
}
