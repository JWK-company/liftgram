// @plm SRS-057  부팅 데이터 파이프라인 — 로컬 DB 가 준비된 직후, **첫 동기 전에** 한 번 돈다(QA H3 순서).
//
//   ① 번들 시드 top-up(매 부팅)  ② 스키마 데이터 백필(한 번씩 — 표식은 기기 로컬)  ③ 기록 정규화(멱등)
//   ──▶ ④ 동기(syncEngine 이 ①~③을 기다린다)  ⑤ 서버 카탈로그 받기(온라인일 때 — 플랫폼 쪽에서)
//
// 표식은 **동기되는 컬럼에 두지 않는다**(QA B2). user_profiles.app_prefs 는 계정과 함께 옮겨 다니므로,
// 거기 두면 미동기 기록이 있는 다른 기기가 표식만 먼저 받고 백필을 건너뛴다. 웹은 localStorage 에 둔다.
// 실패한 단계는 다음 부팅에 다시 돈다. 어떤 실패도 동기를 영원히 막지 않는다.
//
// ── 옛 백필의 처리(QA M5 — 웹에서는 한 번도 돌지 않았다) ─────────────────────
//   V6  레거시 machine_variant 승계  → 정규화 규칙 0 으로 흡수(catalogMigrationPlan)
//   V8  인클라인 3종 → 한 종목 통합  → **폐기**(ADR-033 과 반대 방향 · 대상 nameKo 가 시드에 없어 원래도 no-op)
//   V10 유산소 kind · V12 어시스트 load_mode → 서버 카탈로그(catalogSync)가 kind·load_mode 를 내려 준다
//   V11 그립·팔 버킷 제거 · V22 고유 기구 정규화 → 정규화(ADR-034)로 대체
// 등록된 백필은 「번들 카탈로그 판 반영」 하나다(P2) — 판(내용 해시)이 id 에 들어 있어 CSV 가 바뀌면 다시 한 번 돈다.
// 새 백필은 BOOT_MIGRATIONS 에 id 와 함께 넣는다(id 는 바꾸지 않는다).
import { CATALOG_REVISION } from '../data/catalog/catalogRevision';

/** 표식을 두는 기기 로컬 저장소(웹 = localStorage). 동기 대상이 아니어야 한다. */
export interface MarkerStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove?(key: string): void;
  /**
   * 메모리 변경을 디스크에 내려쓰고 **실제로 남았는지** 돌려준다(웹 = flushLocalDbResult() === "saved").
   * 있으면 백필 표식은 이것이 true 일 때만 남긴다 — 저장이 거부·봉인되거나 실패한 뒤 새로고침하면 표식만 남고
   * 디스크에는 백필 결과가 없는 채로 영영 건너뛰기 때문이다(재검토 H-4). 백필은 멱등이라 다시 돌아도 안전하다. @plm SRS-089
   */
  persist?(): Promise<boolean>;
}

export interface BootMigration {
  /** 바꾸지 않는 이름 — 표식 키가 된다 */
  id: string;
  run(): Promise<unknown>;
}

export const BOOT_MIGRATIONS: BootMigration[] = [
  {
    // 이미 있는 시드 종목의 이름·보관·family·별칭을 새 번들 표에 맞춘다(오프라인으로 새 판을 연 기기의 안전망). @plm SRS-055
    id: `catalog-bundle-${CATALOG_REVISION}`,
    run: async () => {
      const { refreshSeedCatalog } = await import('../data/seedRunner');
      return refreshSeedCatalog();
    },
  },
];

const MARK_PREFIX = 'liftgram.migration.';

export interface BootReport {
  seeded: number;
  migrations: string[];
  normalized: number;
  deferred: number;
  errors: string[];
  /** 파이프라인 전체를 건너뛴 이유(다른 탭에서 가져오는 중 · P5-1) */
  skipped?: 'import_elsewhere';
}

/** 등록된 백필을 순서대로, 아직 안 돈 것만. 실패하면 거기서 멈추고 다음 부팅에 다시. */
export async function runBootMigrations(store: MarkerStore | null, list: BootMigration[] = BOOT_MIGRATIONS) {
  const done: string[] = [];
  for (const m of list) {
    const key = MARK_PREFIX + m.id;
    if (store?.get(key)) continue;
    await m.run();
    // [원본] store?.set(key, String(Date.now()));
    // [개선] 디스크 반영을 확인한 뒤에만 표식 — 못 했으면 표식 없이 멈춘다(다음 부팅에 다시) @plm SRS-089
    if (store?.persist && !(await store.persist())) {
      console.warn(`[boot] 백필 ${m.id} — 디스크 반영을 확인하지 못해 표식을 남기지 않는다(다음 부팅에 다시)`);
      break;
    }
    store?.set(key, String(Date.now()));
    done.push(m.id);
  }
  return done;
}

/** 계정을 비웠다(syncOwner.wipeFor) — 표식도 지운다. 비운 DB 에는 백필이 다시 필요하다. */
export function clearBootMarkers(store: MarkerStore | null, list: BootMigration[] = BOOT_MIGRATIONS): void {
  for (const m of list) store?.remove?.(MARK_PREFIX + m.id);
}

let running: Promise<BootReport> | null = null;

/** 부팅 파이프라인 ①~③. 몇 번 불러도 한 번만 돈다(같은 약속을 돌려준다). */
export function runBootPipeline(store: MarkerStore | null): Promise<BootReport> {
  if (!running) running = pipeline(store);
  return running;
}

/** 파이프라인이 시작됐으면 끝날 때까지, 아니면 곧바로. 동기가 이것을 기다린다. */
export function bootPipelineSettled(): Promise<unknown> {
  return running ?? Promise.resolve();
}

async function pipeline(store: MarkerStore | null): Promise<BootReport> {
  const report: BootReport = { seeded: 0, migrations: [], normalized: 0, deferred: 0, errors: [] };
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      report.errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  // 다른 탭에서 가져오기·되돌리기가 진행 중이면 이 탭은 아무것도 쓰지 않는다(P5-1) — 쓰다 만 묶음을 지우지 않고, 이 탭의 쓰기가
  // 디스크를 덮어쓰지 않게. 화면은 「다른 탭에서 가져오는 중」 안내만 띄운다(웹 lib/tabGuard). @plm SRS-082
  try {
    const { isImportRunningElsewhere } = await import('../data/importTabGuard');
    if (await isImportRunningElsewhere()) {
      report.skipped = 'import_elsewhere';
      console.info('[boot] 데이터 파이프라인', report);
      return report;
    }
  } catch {
    // 판정 실패는 평소처럼 돈다
  }
  await step('seed', async () => {
    const { topUpSeedCatalog } = await import('../data/seedRunner');
    report.seeded = await topUpSeedCatalog();
  });
  await step('migrations', async () => {
    report.migrations = await runBootMigrations(store);
  });
  // 끝나지 않은 가져오기 묶음(status='writing' — 탭이 닫혔거나 쓰다 실패) 정리 — 그 행들을 지우고 묶음도 지운다(ADR-043 개정 · D-6).
  // 첫 동기 전에 돌아야 한다 — 반쯤 쓴 행이 서버로 올라가지 않게(쓰는 동안 동기를 멈췄으므로 이 행들은 아직 서버에 없다). @plm SRS-082
  await step('importCleanup', async () => {
    const { cleanupUnfinishedImports } = await import('../data/importRepository');
    await cleanupUnfinishedImports();
  });
  await step('normalize', async () => {
    const { normalizeCatalogRecords } = await import('./catalogNormalize');
    const r = await normalizeCatalogRecords();
    report.normalized = r.changed;
    report.deferred = r.deferred;
  });
  // v26 첫 부팅(로그인 안 한 기기 포함): 프로필 체중을 이력 첫 줄로 옮겨 심고 미러를 맞춘다(D-10 · 멱등 — 매 부팅 돈다).
  // 프로필이 아직 없으면(새 기기) 아무것도 안 하고 첫 동기 뒤 정리에 맡긴다. @plm SRS-077
  await step('bodyweightMirror', async () => {
    const { reconcileBodyweightMirror } = await import('../data/bodyweightRepository');
    await reconcileBodyweightMirror();
  });
  if (report.seeded || report.migrations.length || report.normalized || report.errors.length)
    console.info('[boot] 데이터 파이프라인', report);
  return report;
}
