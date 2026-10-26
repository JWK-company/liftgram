// @plm SRS-057  기기 기록 정규화 — 로컬 운동·루틴 블록을 새 카탈로그 규칙(catalogMigrationPlan)으로 맞춘다.
//
// ─────────────────────────────────────────────────────────────────────────────
// **버전 표식 없이 매번 도는 멱등 정규화**다(QA B2·H1). 한 번만 돌고 끝나는 이관은
//   · 동기로 표식을 먼저 받은 다른 기기가 미동기 기록을 옛 칸 그대로 올리거나
//   · 서버 이관 뒤에 옛 PWA 가 옛 형식 레코드를 다시 올리는 경우
// 에 영영 수렴하지 않는다. 그래서 부팅 때 한 번(동기 전) + 동기 직후마다 돈다. 바꿀 것이 없으면 쓰지 않는다.
//
// 대상 종목이 아직 로컬에 없으면(새 기기·카탈로그 미수신) 그 블록은 옮기지 않고 다음 기회로 미룬다(QA H3).
// 서버 이관(be/cmd/migrate-records, P2)과 같은 계획 함수를 쓴다 — 어느 쪽이 먼저 돌든 결과가 같다.
// ─────────────────────────────────────────────────────────────────────────────
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { RoutineExercise, SetLog, WorkoutExercise } from '../db/models';
import { buildCatalogIndex, planBlockMigration, type CatalogIndex } from '../domain/catalogMigrationPlan';

/**
 * 켜는 시점은 P2(v0.31) — 서버 카탈로그 개편(0014)·시드 갱신·기록 칸 선택 UI 가 함께 나가야 한다.
 * 그 전에 켜면 「로프 푸시다운」 기록이 아직 이름이 안 바뀐 종목과 고를 수 없는 부착물 칸으로 옮겨진다(QA H5).
 */
export const CATALOG_NORMALIZE_ENABLED = false;

let index: CatalogIndex | null = null;
async function catalogIndex(): Promise<CatalogIndex> {
  if (index) return index;
  // 카탈로그 표(≈480행)는 앱 셸 첫 로드에 싣지 않는다 — 정규화가 처음 돌 때 받는다.
  const [{ CATALOG, CATALOG_FAMILIES }, { MIGRATION_OVERRIDES }] = await Promise.all([
    import('../data/catalog/catalog.generated'),
    import('../data/catalog/catalogMigration.data'),
  ]);
  index = buildCatalogIndex(CATALOG, CATALOG_FAMILIES, MIGRATION_OVERRIDES);
  return index;
}

export interface NormalizeResult {
  /** 고친 블록 수 */
  changed: number;
  /** 대상 종목이 로컬에 없어 미룬 블록 수 */
  deferred: number;
}

/** 로컬 블록을 정규화한다. 꺼져 있으면 아무것도 하지 않는다. */
export async function normalizeCatalogRecords(force = false): Promise<NormalizeResult> {
  if (!CATALOG_NORMALIZE_ENABLED && !force) return { changed: 0, deferred: 0 };
  const idx = await catalogIndex();
  const localIds = new Set((await database.get('exercises').query().fetchIds()) as string[]);
  const wes = await database.get<WorkoutExercise>('workout_exercises').query().fetch();
  const res = await database.get<RoutineExercise>('routine_exercises').query().fetch();

  let deferred = 0;
  let changed = 0;
  const ops: Parameters<typeof database.batch> = [];
  const armUni: string[] = [];
  for (const rec of [...wes, ...res]) {
    const plan = planBlockMigration(rec, idx);
    if (!plan.changed) continue;
    if (!localIds.has(plan.exerciseId)) {
      deferred += 1;
      continue;
    }
    changed += 1;
    ops.push(
      rec.prepareUpdate((r: WorkoutExercise | RoutineExercise) => {
        r.exerciseId = plan.exerciseId;
        r.variantKey = plan.columns.variantKey;
        r.variantEquipment = plan.columns.variantEquipment;
        r.variantGrip = plan.columns.variantGrip;
        r.variantArm = null; // 팔은 세트 속성(ADR-034) — 아래에서 세트로 내린다
        r.variantLoad = plan.columns.variantLoad;
        r.variantAttach = plan.columns.variantAttach;
        r.machineVariant = null;
      }),
    );
    if (plan.setArmUni && rec.table === 'workout_exercises') armUni.push(rec.id);
  }
  if (armUni.length) {
    const sets = await database
      .get<SetLog>('set_logs')
      .query(Q.where('workout_exercise_id', Q.oneOf(armUni)), Q.where('arm', null))
      .fetch();
    for (const s of sets)
      ops.push(
        s.prepareUpdate((r) => {
          r.arm = 'uni';
        }),
      );
  }
  if (ops.length) {
    await database.write(async () => {
      await database.batch(...ops);
    });
  }
  return { changed, deferred };
}
