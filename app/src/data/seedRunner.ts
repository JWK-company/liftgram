// 운동 카탈로그 시드 — 멱등 top-up (SRS-001). 매 실행 시 nameKo 기준으로 DB에 없는
// 기본(비커스텀) 종목만 추가한다. 신규 설치=전건 주입, 기존 DB=신규 추가분만 보강.
// 추가로 대체운동(SUBSTITUTES)을 nameKo->id로 해소해 substituteIds에 멱등 적용(기존 DB 보강 포함).
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { Exercise } from '../db/models';
import { SEED_EXERCISES, type SeedExercise } from './seed/exercises.seed';
import { SUBSTITUTES } from './seed/substitutes.seed';

export async function seedExercisesIfNeeded(): Promise<number> {
  const exercises = database.get<Exercise>('exercises');
  const existing = await exercises.query(Q.where('is_custom', false)).fetch();
  const haveNames = new Set(existing.map((e) => e.nameKo));
  const missing = SEED_EXERCISES.filter((seed) => !haveNames.has(seed.nameKo));
  if (missing.length) {
    const fields = (e: Exercise, seed: SeedExercise) => {
      e._raw.id = seedId(seed.nameEn); // 결정적 id → 멀티기기 동기 시 중복 방지 (SRS-001)
      e.nameKo = seed.nameKo;
      e.nameEn = seed.nameEn ?? null;
      e.primaryMuscles = seed.primaryMuscles;
      e.secondaryMuscles = seed.secondaryMuscles ?? [];
      e.equipment = seed.equipment;
      e.category = seed.category ?? null;
      e.kind = seed.kind ?? null; // v10: 유산소 종목 표식('cardio'), 근력은 null. @plm SRS-030
      e.loadMode = seed.loadMode ?? null; // v12: 하중모드('assisted' 등). @plm SRS-033
      e.isCustom = false;
      e.substituteIds = [];
      e.isArchived = false;
    };
    try {
      await database.write(async () => {
        await database.batch(...missing.map((seed) => exercises.prepareCreate((e) => fields(e, seed))));
      });
    } catch {
      // 배치 실패(중복 id — 예: consolidate가 soft-delete한 종목의 결정적 id가 아직 DB에 잔존) →
      // 개별 생성으로 폴백해 충돌 건만 건너뛴다. 앱 초기화가 통째로 실패(크래시)하지 않도록 방어.
      for (const seed of missing) {
        try {
          await database.write(async () => {
            await exercises.create((e) => fields(e, seed));
          });
        } catch {
          /* 이미 존재(soft-deleted 포함) — 건너뜀 */
        }
      }
    }
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

// 시드 종목의 결정적 id — nameEn 슬러그 기반. 여러 기기가 같은 종목을 같은 id로 생성하므로
// 동기 시 recordId 일치로 병합돼 중복이 생기지 않는다(신규 설치에 적용; 기존 랜덤 id 레코드는 유지).
function seedId(nameEn: string): string {
  const slug = nameEn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `seed-${slug}`;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
