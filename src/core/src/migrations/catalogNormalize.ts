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
import type { ExerciseUserPref, RoutineExercise, SetLog, WorkoutExercise } from '../db/models';
import { exercisePrefId } from '../db/models/ExerciseUserPref';
import { buildCatalogIndex, planBlockMigration, planDisplayNames, type CatalogIndex } from '../domain/catalogMigrationPlan';

/**
 * P2(v0.31)에서 켰다 — 서버 카탈로그 개편(0014)·시드 갱신·부착물/그립 칩·기구 바꾸기가 함께 나갔다.
 * (P0·P1 에서는 꺼 두었다: 이름이 안 바뀐 종목과 고를 수 없는 부착물 칸으로 옮겨지는 것을 막으려고 — QA H5)
 */
export const CATALOG_NORMALIZE_ENABLED = true;

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
  /** 옛 이름을 표시 이름으로 심은 종목 수(QA M3) */
  named?: number;
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

  // 표시 이름 연속성(QA M3) — 옮기기 **전의** 종목 id 로 옛 이름을 계산해, 선호 레코드가 아직 없는 종목에만 심는다.
  // 레코드 id 가 결정적(pref-<종목>)이라 여러 기기·서버 이관이 같은 행을 만든다. 있으면(사용자가 고른 이름 포함) 건드리지 않는다.
  const use = new Map<string, number>();
  const movedInto = new Set<string>();
  for (const r of [...wes, ...res]) {
    use.set(r.exerciseId, (use.get(r.exerciseId) ?? 0) + 1);
    const p = planBlockMigration(r, idx);
    if (p.changed && p.exerciseId !== r.exerciseId) movedInto.add(p.exerciseId);
  }
  const names = planDisplayNames(use, idx, movedInto);
  const prefs = database.get<ExerciseUserPref>('exercise_user_prefs');
  const toName: [string, string | null][] = [];
  if (names.size) {
    const have = new Set((await prefs.query().fetch()).map((p) => p.exerciseId));
    for (const [exerciseId, displayName] of names)
      if (!have.has(exerciseId) && localIds.has(exerciseId)) toName.push([exerciseId, displayName]);
  }
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
  // 이름 심기는 따로 — 지워진(soft-delete) 같은 id 가 남아 있어 만들기가 실패해도 기록 정규화는 이미 끝났다.
  let named = 0;
  if (toName.length) {
    try {
      await database.write(async () => {
        await database.batch(
          ...toName.map(([exerciseId, displayName]) =>
            prefs.prepareCreate((p) => {
              p._raw.id = exercisePrefId(exerciseId);
              p.exerciseId = exerciseId;
              p.displayName = displayName;
              p.plateOneSide = null;
            }),
          ),
        );
      });
      named = toName.length;
    } catch (e) {
      console.warn('[normalize] 표시 이름 심기 건너뜀', e);
    }
  }
  return { changed, deferred, named };
}
