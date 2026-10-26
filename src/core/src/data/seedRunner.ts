// 운동 카탈로그 시드 — 멱등 top-up (SRS-001). 매 실행 시 nameEn(안정 키) 기준으로 DB에 없는
// 기본(비커스텀) 종목만 추가한다. 신규 설치=전건 주입, 기존 DB=신규 추가분만 보강.
// 추가로 대체운동(SUBSTITUTES — seed id 키)을 substituteIds에 멱등 적용(기존 DB 보강 포함).
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { Exercise } from '../db/models';
import { SEED_EXERCISES, type SeedExercise } from './seed/exercises.seed';
import { SUBSTITUTES } from './seed/substitutes.seed';

export async function seedExercisesIfNeeded(): Promise<number> {
  const exercises = database.get<Exercise>('exercises');
  const existing = await exercises.query(Q.where('is_custom', false)).fetch();
  // 이름 정리 재동기 — nameEn(안정 키) 기준으로 기존 레코드 nameKo를 최신 시드명으로 갱신(id 불변 → 기록 보존). @plm SRS-028
  await syncSeedNames(existing);
  // top-up은 nameEn(안정 식별자) 기준으로 미보유만 추가 — 이름 정리로 nameKo가 바뀌어도 중복 생성 방지.
  const haveEn = new Set(existing.map((e) => e.nameEn).filter((x): x is string => !!x));
  const missing = SEED_EXERCISES.filter((seed) => !haveEn.has(seed.nameEn));
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
      e.isArchived = seed.isArchived ?? false;
      fillCatalogMeta(e, seed);
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

// @plm SRS-055  부팅 top-up(매 부팅 · QA H3) — 번들 시드에 있는데 로컬에 없는 종목만 만든다.
// 이름·대체운동은 건드리지 않는다: 카탈로그의 정본은 서버(catalogSync)이고, 여기서 이름을 되돌리면
// 서버가 고친 이름과 매 부팅 엎치락뒤치락한다(D10). 새 기기·오프라인 첫 실행에 종목 이름이 비지 않게 하는 안전망이다.
// 만든 행은 사용자 동기에 실리지 않는다(syncEngine 이 시드 행을 무시 — D10).
export async function topUpSeedCatalog(): Promise<number> {
  const exercises = database.get<Exercise>('exercises');
  const existing = await exercises.query().fetch();
  const haveId = new Set(existing.map((e) => e.id));
  const haveEn = new Set(existing.map((e) => e.nameEn).filter((x): x is string => !!x));
  const missing = SEED_EXERCISES.filter((seed) => !haveEn.has(seed.nameEn) && !haveId.has(seedId(seed.nameEn)));
  if (!missing.length) return 0;
  const fill = (e: Exercise, seed: SeedExercise) => {
    e._raw.id = seedId(seed.nameEn);
    e.nameKo = seed.nameKo;
    e.nameEn = seed.nameEn ?? null;
    e.primaryMuscles = seed.primaryMuscles;
    e.secondaryMuscles = seed.secondaryMuscles ?? [];
    e.equipment = seed.equipment;
    e.category = seed.category ?? null;
    e.kind = seed.kind ?? null;
    e.loadMode = seed.loadMode ?? null;
    e.isCustom = false;
    e.substituteIds = [];
    e.isArchived = seed.isArchived ?? false;
    fillCatalogMeta(e, seed);
  };
  try {
    await database.write(async () => {
      await database.batch(...missing.map((seed) => exercises.prepareCreate((e) => fill(e, seed))));
    });
    return missing.length;
  } catch {
    // 배치 실패(soft-deleted 잔존 id 충돌) → 하나씩, 충돌 건만 건너뛴다.
    let made = 0;
    for (const seed of missing) {
      try {
        await database.write(async () => {
          await exercises.create((e) => fill(e, seed));
        });
        made += 1;
      } catch {
        /* 이미 존재 — 건너뜀 */
      }
    }
    return made;
  }
}

// 시드 이름 정리 재동기 — nameEn 기준으로 기존(비커스텀) 레코드의 nameKo를 최신 시드명으로 갱신. id·기록 보존. @plm SRS-028
async function syncSeedNames(existing: Exercise[]): Promise<void> {
  const koByEn = new Map(SEED_EXERCISES.map((s) => [s.nameEn, s.nameKo]));
  const updates = existing.filter((e) => {
    const newKo = e.nameEn ? koByEn.get(e.nameEn) : undefined;
    return newKo != null && newKo !== e.nameKo;
  });
  if (!updates.length) return;
  await database.write(async () => {
    await database.batch(
      ...updates.map((e) => e.prepareUpdate((rec) => { rec.nameKo = koByEn.get(e.nameEn as string) as string; })),
    );
  });
}

// 대체운동 큐레이션을 현재 DB id로 해소해 substituteIds에 반영(멱등). 큐레이션 갱신·기존 DB 보강 모두 처리.
async function syncSubstitutes(): Promise<void> {
  const exercises = database.get<Exercise>('exercises');
  const all = await exercises.query(Q.where('is_custom', false)).fetch();
  // P2: 큐레이션 키·값이 seed id 다(ADR-033) — 이름이 바뀌어도 끊기지 않는다. 로컬에 있는 id 만 싣는다.
  const have = new Set(all.map((e) => e.id));
  const pending = all
    .map((e) => {
      const subIds = SUBSTITUTES[e.id];
      if (!subIds) return null;
      const ids = subIds.filter((x) => have.has(x));
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

// v22 카탈로그 메타(ADR-033·034) — 동작 그룹·별칭·비슷한 운동·그림 출처. @plm SRS-055 SRS-056
function fillCatalogMeta(e: Exercise, seed: SeedExercise): void {
  e.family = seed.family ?? null;
  e.aliases = seed.aliases ?? [];
  e.similar = seed.similar ?? [];
  e.mediaRef = seed.mediaRef ?? null;
}

/**
 * 번들 카탈로그 반영(번들 판이 바뀐 첫 부팅에 한 번 — 부팅 백필 `catalog-bundle-<판>`). @plm SRS-055
 *
 * 이미 로컬에 있는 시드 종목의 이름·기구·근육·보관·카탈로그 메타를 번들 표에 맞춘다. 서버 카탈로그(catalogSync)도
 * 같은 CSV 에서 나오므로 온라인이면 곧 같은 값으로 덮인다 — 이것은 **오프라인으로 새 판을 연 기기**가 새 이름·
 * 보관 상태·family 를 곧바로 갖게 하는 안전망이다. 판마다 한 번만 돌아, 서버가 더 새 값을 줘도 매 부팅 되돌리지 않는다.
 * 커스텀 종목은 건드리지 않는다. 바뀐 행 수를 돌려준다.
 */
export async function refreshSeedCatalog(): Promise<number> {
  const exercises = database.get<Exercise>('exercises');
  const rows = await exercises.query(Q.where('is_custom', false)).fetch();
  const byEn = new Map(SEED_EXERCISES.map((s) => [s.nameEn, s]));
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const updates = rows
    .map((e) => ({ e, seed: e.nameEn ? byEn.get(e.nameEn) : undefined }))
    .filter((x): x is { e: Exercise; seed: SeedExercise } => !!x.seed)
    .filter(
      ({ e, seed }) =>
        e.nameKo !== seed.nameKo ||
        e.equipment !== seed.equipment ||
        !same(e.primaryMuscles, seed.primaryMuscles) ||
        !same(e.secondaryMuscles, seed.secondaryMuscles ?? []) ||
        (e.kind ?? null) !== (seed.kind ?? null) ||
        (e.loadMode ?? null) !== (seed.loadMode ?? null) ||
        e.isArchived !== (seed.isArchived ?? false) ||
        (e.family ?? null) !== (seed.family ?? null) ||
        !same(e.aliases, seed.aliases ?? []) ||
        !same(e.similar, seed.similar ?? []) ||
        (e.mediaRef ?? null) !== (seed.mediaRef ?? null),
    );
  if (!updates.length) return 0;
  // 이름 교환(A↔B)이 있어도 로컬은 nameKo 유일 제약이 없어 한 배치로 된다.
  await database.write(async () => {
    await database.batch(
      ...updates.map(({ e, seed }) =>
        e.prepareUpdate((rec) => {
          rec.nameKo = seed.nameKo;
          rec.equipment = seed.equipment;
          rec.primaryMuscles = seed.primaryMuscles;
          rec.secondaryMuscles = seed.secondaryMuscles ?? [];
          rec.kind = seed.kind ?? null;
          rec.loadMode = seed.loadMode ?? null;
          rec.isArchived = seed.isArchived ?? false;
          fillCatalogMeta(rec, seed);
        }),
      ),
    );
  });
  return updates.length;
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
