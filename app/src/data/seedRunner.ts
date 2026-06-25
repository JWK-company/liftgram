// 첫 실행 시 운동 카탈로그 시드 주입 (SRS-001). 기본(비커스텀) 운동이 0건일 때만 1회.
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { Exercise } from '../db/models';
import { SEED_EXERCISES } from './seed/exercises.seed';

export async function seedExercisesIfNeeded(): Promise<number> {
  const exercises = database.get<Exercise>('exercises');
  const count = await exercises.query(Q.where('is_custom', false)).fetchCount();
  if (count > 0) return 0;
  await database.write(async () => {
    await database.batch(
      ...SEED_EXERCISES.map((seed) =>
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
  return SEED_EXERCISES.length;
}
