// 서버 동기 이음매 — **이 파일은 파생물이 아니라 core가 직접 소유한다.**
//
// ─────────────────────────────────────────────────────────────────────────────
// app의 `sync/` 는 옛 백엔드(NestJS REST)를 향하고, 그 계층의 절반이 플랫폼에 묶여 있었다
// (`serverApi.ts`=react-native · `tokenStore.ts`=expo-secure-store). 그래서 이 계층만은
// **옮기는 대상이 아니라 다시 쓰는 대상**이었다(ADR-032가 말한 '서버 책임').
//
// 규칙은 여기 있고, **말하는 방법은 밖에서 꽂는다**(`installSyncTransport`). 그래야 core가
// Connect도 세션도 모르는 채로 남고, 저장소(`data/*Repository.ts`)는 지금처럼 `scheduleSync()`만
// 부르면 된다 — 다섯 군데의 호출을 손대지 않아도 되는 이유다.
//
// ── 동기는 한 번에 하나 ─────────────────────────────────────────────────────
// `synchronize()`는 겹쳐 돌면 안 된다(커서가 깨진다). 그래서 모든 방아쇠(로그인·부팅·복귀·주기·
// 저장)를 **하나의 비행**으로 합친다 — 진행 중이면 그 약속을 함께 기다린다.
//
// ── 내부 필드는 오가지 않는다 ───────────────────────────────────────────────
// WatermelonDB의 살림(`_status`·`_changed`)이 서버에 남으면, 다음 pull에서 되돌아와
// **동기 자체가 죽는다**("raw record must not contain _status"). 그러면 커서가 멈추고,
// 화면에는 "서버에 연결할 수 없어요"라고만 뜬다 — 원인이 완전히 가려진다.
// 서버도 걸러내지만(이중), 여기서도 양방향으로 걷어낸다.
//
// ── 진행 중인 운동은 건너온 것을 적용하지 않는다 ────────────────────────────
// '하는 중'은 **그 기기의 상태**다. 받아서 적용하면 다른 기기에 유령 세션이 뜨고, 폐기해도
// 서버가 계속 되밀어 되살아난다. 완료된 것만 기기 사이를 오간다(=기록). 삭제는 상태와 무관하다.
// ─────────────────────────────────────────────────────────────────────────────
import { synchronize, type SyncDatabaseChangeSet } from '@nozbe/watermelondb/sync';
import { database } from '../db/database';
import { SCHEMA_VERSION } from '../db/schema';
import { isSchemaDowngradeBlocked } from '../db/schemaGuard'; // v26 다운그레이드 가드 @plm SRS-073
import { bootPipelineSettled } from '../migrations/runner';
import { dropCatalogRows } from './catalogFilter';
import { countPendingUserChanges } from './pending';
import { isSyncBlocked } from './syncOwner';

/** 한 컬렉션의 변화분 — 계약과 같은 모양이다(레코드는 JSON 문자열). */
export interface SyncTableChanges {
  created?: string[];
  updated?: string[];
  deleted?: string[];
}

/**
 * 서버와 말하는 방법. 구현은 플랫폼 쪽에 있다(웹은 Connect 클라이언트).
 *
 * 꽂히지 않았으면 동기는 **아무 일도 하지 않는다** — 로컬 저장은 그대로 동작한다.
 */
export interface SyncTransport {
  /** 로그인 상태인가. 아니면 동기는 건너뛴다(익명 사용자의 기록은 이 기기의 것이다). */
  isLoggedIn(): Promise<boolean>;
  pull(lastPulledAt: number): Promise<{ changes: Record<string, SyncTableChanges>; timestamp: number }>;
  push(changes: Record<string, SyncTableChanges>): Promise<void>;
  /**
   * 받은 것을 **디스크에 내려쓴다**(웹만 해당 — 네이티브는 곧바로 쓴다).
   *
   * 이게 없으면 받은 직후 화면을 옮길 때 그 데이터가 사라진다. 그냥 사라지는 게 아니라,
   * **커서는 이미 전진했으므로 서버가 다시 보내지 않는다** — 조용한 데이터 유실이다.
   */
  flush?: () => Promise<void>;
  /** 동기 건강(마지막 성공 시각)을 앱을 다시 열어도 기억하는 자리. 웹은 localStorage */
  store?: { get(key: string): string | null; set(key: string, value: string): void };
}

let transport: SyncTransport | null = null;
let warned = false;

// ── 동기 건강 — **조용한 실패를 보이게 한다** (2026-10-26) ───────────────────
// 옛 앱은 8월부터 동기가 매번 실패했는데(서버 레코드의 `_status` 한 건이 pull을 죽였다) 화면은
// 아무 말도 하지 않았다. 그 사이 쌓인 기록은 기기에만 남았고, 주소를 옮기자 찾을 수 없게 됐다.
// 그래서 마지막 성공 시각·연속 실패·올라가지 않은 기록 수를 들고 있다가 화면에 내보인다.
export interface SyncHealth {
  /** 마지막으로 끝까지 성공한 시각(ms). 한 번도 없으면 null */
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  /** 마지막 실패의 이유(사람이 읽을 말이 아니라 진단용 원문) */
  lastError: string | null;
  consecutiveFailures: number;
  /** 서버로 아직 안 올라간 **사용자 기록** 수(기본 카탈로그 제외). 모르면 null */
  pending: number | null;
  /** 다른 계정의 기록이 남아 있어 동기를 멈춘 상태(syncOwner) */
  blocked: boolean;
}

const LAST_SUCCESS_KEY = 'sync_last_success_at';
// 연속 실패 수도 기억한다(2026-10-26). 메모리에만 두면 앱을 다시 여는 순간 0 이 되어, 계속 실패하는 기기가
// 「경고 없음」으로 돌아간다 — 시드 행을 더는 올리지 않아(D10) 첫 동기가 빨리 성공하게 되자 드러났다.
const FAILURES_KEY = 'sync_consecutive_failures';
let health: SyncHealth = {
  lastSuccessAt: null,
  lastAttemptAt: null,
  lastError: null,
  consecutiveFailures: 0,
  pending: null,
  blocked: false,
};
const listeners = new Set<(h: SyncHealth) => void>();

function setHealth(patch: Partial<SyncHealth>): void {
  health = { ...health, ...patch };
  for (const fn of listeners) fn(health);
}

export function getSyncHealth(): SyncHealth {
  return health;
}

/** 건강 상태가 바뀔 때마다 부른다. 정리 함수를 돌려준다. */
export function subscribeSyncHealth(fn: (h: SyncHealth) => void): () => void {
  listeners.add(fn);
  fn(health);
  return () => listeners.delete(fn);
}

export { countPendingUserChanges } from './pending';

/** 올라가지 않은 기록 수를 다시 센다(저장 뒤·동기 뒤·화면이 열릴 때). */
export async function refreshPendingCount(): Promise<number> {
  const pending = await countPendingUserChanges().catch(() => null);
  setHealth({ pending, blocked: isSyncBlocked() });
  return pending ?? 0;
}

/** 앱 시작 때 한 번 꽂는다. `null`을 주면 다시 뽑는다(로그아웃·테스트). */
export function installSyncTransport(t: SyncTransport | null): void {
  transport = t;
  if (!t) markFirstSettled();
  else
    void t.isLoggedIn().then((ok) => {
      if (!ok) markFirstSettled();
    });
  const saved = Number(t?.store?.get(LAST_SUCCESS_KEY) ?? 0);
  const failures = Number(t?.store?.get(FAILURES_KEY) ?? 0);
  setHealth({ lastSuccessAt: saved > 0 ? saved : null, consecutiveFailures: failures > 0 ? failures : 0 });
  void refreshPendingCount();
}

/** 다른 계정의 기록이 남아 있어 동기를 멈춘 상태에서 부르면 이 오류가 난다. */
export class SyncBlockedError extends Error {
  constructor() {
    super('다른 계정의 기록이 이 기기에 남아 있어 동기를 멈췄습니다');
    this.name = 'SyncBlockedError';
  }
}

/**
 * 가져오기·되돌리기가 동기를 멈춘 동안 **사람이 부른** 동기(지금 동기·로그아웃 전 동기)는 기다리지 않고 이 오류로 곧바로 끝난다(CD-6).
 * 멈춘 채 두는 길(write_failed_reload)에서는 재개가 오지 않으므로, 기다리면 그 화면이 영원히 반응하지 않는다.
 * 배경 동기(scheduleSync)는 오류 없이 재개 뒤로 미룬다. @plm SRS-082
 */
export class SyncPausedError extends Error {
  constructor() {
    super('가져오기 중이라 동기를 잠시 멈췄어요 — 끝나면 이어서 해요');
    this.name = 'SyncPausedError';
  }
}

type RawRec = Record<string, unknown>;
type Tbl = { created?: RawRec[]; updated?: RawRec[]; deleted?: string[] };

/** WatermelonDB 살림 필드를 걷어낸다. 오가는 양쪽에서 부른다. */
function stripInternalFields(changes: SyncDatabaseChangeSet): SyncDatabaseChangeSet {
  const clean = (rec: RawRec): RawRec => {
    const copy = { ...rec };
    delete copy._status;
    delete copy._changed;
    return copy;
  };
  const out: Record<string, { created: RawRec[]; updated: RawRec[]; deleted: string[] }> = {};
  for (const [table, t] of Object.entries(changes) as Array<[string, Tbl]>) {
    out[table] = {
      created: (t.created ?? []).map(clean),
      updated: (t.updated ?? []).map(clean),
      deleted: t.deleted ?? [],
    };
  }
  return out as unknown as SyncDatabaseChangeSet;
}

/** 받은 변화분에서 '하는 중'인 운동을 뺀다(삭제는 남긴다). */
function dropInProgressWorkouts(changes: SyncDatabaseChangeSet): SyncDatabaseChangeSet {
  const all = changes as unknown as Record<string, Tbl>;
  const wk = all.workouts;
  if (!wk) return changes;
  const isDone = (r: RawRec) => r.state === 'completed';
  return {
    ...all,
    workouts: {
      created: (wk.created ?? []).filter(isDone),
      updated: (wk.updated ?? []).filter(isDone),
      deleted: wk.deleted ?? [],
    },
  } as unknown as SyncDatabaseChangeSet;
}

/** 계약(JSON 문자열) → WatermelonDB 변화분. 읽을 수 없는 레코드는 **버리지 않고 건너뛴다**. */
function decode(changes: Record<string, SyncTableChanges>): SyncDatabaseChangeSet {
  const out: Record<string, { created: RawRec[]; updated: RawRec[]; deleted: string[] }> = {};
  for (const [table, t] of Object.entries(changes)) {
    const parse = (list: string[] | undefined): RawRec[] => {
      const acc: RawRec[] = [];
      for (const raw of list ?? []) {
        try {
          const obj = JSON.parse(raw) as unknown;
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) acc.push(obj as RawRec);
        } catch {
          // 한 건이 깨졌다고 동기 전체를 멈추지 않는다 — 나머지는 받아야 한다.
        }
      }
      return acc;
    };
    out[table] = { created: parse(t.created), updated: parse(t.updated), deleted: t.deleted ?? [] };
  }
  return out as unknown as SyncDatabaseChangeSet;
}

/** WatermelonDB 변화분 → 계약(JSON 문자열). */
function encode(changes: SyncDatabaseChangeSet): Record<string, SyncTableChanges> {
  const out: Record<string, SyncTableChanges> = {};
  for (const [table, t] of Object.entries(changes) as Array<[string, Tbl]>) {
    out[table] = {
      created: (t.created ?? []).map((r) => JSON.stringify(r)),
      updated: (t.updated ?? []).map((r) => JSON.stringify(r)),
      deleted: t.deleted ?? [],
    };
  }
  return out;
}

async function runSynchronize(): Promise<void> {
  const t = transport;
  if (!t) {
    if (!warned) {
      warned = true;
      console.warn('[sync] 전송 계층이 꽂히지 않았습니다 — 변경은 로컬에만 남습니다.');
    }
    return;
  }
  // 다른 계정의 기록이 남아 있으면 **올리지도 받지도 않는다** — 올리면 남의 기록이 이 계정에 붙는다.
  if (isSyncBlocked()) {
    setHealth({ blocked: true });
    throw new SyncBlockedError();
  }

  // 부팅 데이터 파이프라인(시드 top-up → 백필 → 정규화)이 끝난 뒤에 동기한다(QA H3 순서).
  await bootPipelineSettled();

  // 스키마가 올라간 첫 동기는 **처음부터 다시 받는다**(QA H2). 옛 스키마로 받은 레코드는 그때 모르던 컬럼이
  // 버려졌는데 커서는 이미 지나갔다 — 그대로 두면 그 값(예: 서버 이관이 채운 variant_attach)을 영영 못 받는다.
  const syncedSchema = await database.adapter.getLocal(SYNCED_SCHEMA_KEY);
  if (syncedSchema !== String(SCHEMA_VERSION)) await database.adapter.removeLocal(LAST_PULLED_KEY);

  const knownTables = new Set(Object.keys(database.schema.tables));
  await synchronize({
    database,
    // 서버는 살아 있는 레코드를 전부 updated로 보낸다. 받는 쪽이 없으면 만들게 해서
    // "이미 존재한다" 오류를 없앤다.
    sendCreatedAsUpdated: true,
    pullChanges: async ({ lastPulledAt }) => {
      const res = await t.pull(lastPulledAt ?? 0);
      return {
        changes: dropCatalogRows(dropInProgressWorkouts(stripInternalFields(decode(res.changes))), knownTables),
        timestamp: res.timestamp,
      };
    },
    pushChanges: async ({ changes }) => {
      // 시드 종목 행은 올리지 않는다(D10). 걸러낸 행도 WatermelonDB 는 '보냈다'로 표시한다 — 그래서 매번 다시 세지 않는다.
      await t.push(encode(dropCatalogRows(stripInternalFields(changes))));
    },
    // migration sync는 쓰지 않는다 — 서버가 스키마를 모르므로(권위는 클라이언트) 컬럼이 늘어도
    // 평범한 델타로 넘어온다. 켜면 옛 스키마의 기기가 서버가 모르는 요청을 보낸다.
  });

  // **받은 것을 확실히 남긴다.** 여기서 내려쓰지 않으면, 동기 직후 화면을 옮기는 순간
  // 받은 데이터가 사라지는데 커서는 이미 전진해 있어 서버가 다시 보내지 않는다.
  await t.flush?.();
  await database.adapter.setLocal(SYNCED_SCHEMA_KEY, String(SCHEMA_VERSION));

  // 받은 것 중 옛 형식 기록(옛 클라이언트가 올린 것)을 새 카탈로그 규칙으로 맞춘다 — 매번, 멱등(QA H1).
  // 고친 것이 있으면 곧 다시 올린다.
  try {
    const { normalizeCatalogRecords } = await import('../migrations/catalogNormalize');
    const r = await normalizeCatalogRecords();
    if (r.changed > 0) {
      await t.flush?.();
      scheduleSync(0);
    }
  } catch (e) {
    console.warn('[sync] 기록 정규화 실패 — 다음 동기에 다시', e);
  }

  // 체중 미러 정리(D-10) — 다른 기기 이력이 pull 로 들어왔거나 옛 경로가 프로필 칸을 고쳤으면 미러를 최신 측정에 맞춘다(멱등).
  // 정규화와 따로 잡는다: 한쪽이 실패해도 다른 쪽은 돈다. @plm SRS-077
  try {
    const { reconcileBodyweightMirror } = await import('../data/bodyweightRepository');
    const r = await reconcileBodyweightMirror();
    if (r.created || r.mirrorChanged) {
      await t.flush?.();
      scheduleSync(0);
    }
  } catch (e) {
    console.warn('[sync] 체중 미러 정리 실패 — 다음 동기에 다시', e);
  }
}

/** WatermelonDB 의 pull 커서 키(sync/impl). 스키마가 바뀌면 지워서 전량 다시 받는다. */
const LAST_PULLED_KEY = '__watermelon_last_pulled_at';
/** 마지막으로 동기에 성공한 로컬 스키마 버전 — 기기 로컬(어댑터 local storage, DB 와 함께 비워진다). */
const SYNCED_SCHEMA_KEY = 'liftgram_synced_schema_version';

/**
 * 이 기기의 사용자 기록이 「서버에 있는 것을 다 받은」 상태인가(또는 서버와 동기한 적이 아예 없는 로컬 기기인가).
 * 지금 스키마로 동기에 한 번 성공했으면 true · 동기 흔적이 전혀 없으면(로그인 안 한 기기) true ·
 * 옛 스키마로만 동기했으면 false(새 표 행을 아직 못 받았다 — 체중 초기 한 줄을 심으면 중복된다 · D-10). @plm SRS-077
 */
export async function isLocalPullComplete(): Promise<boolean> {
  const synced = await database.adapter.getLocal(SYNCED_SCHEMA_KEY);
  if (synced === String(SCHEMA_VERSION)) return true;
  if (synced != null) return false;
  return (await database.adapter.getLocal(LAST_PULLED_KEY)) == null;
}

// ── 첫 동기 ────────────────────────────────────────────────────────────────
// 새 기기에 로그인하면, 서버의 프로필이 내려오기 **전에** 화면이 빈 프로필을 만들곤 했다.
// 그러면 프로필이 기기마다 하나씩 늘고(한 계정에 14개까지 쌓였다), 그 사이 고친 설정은 엉뚱한
// 프로필에 남는다. 그래서 첫 동기가 한 번 끝날 때까지(성공이든 실패든) 기다릴 수 있게 한다.
let settleFirst: (() => void) | null = null;
const firstSettled = new Promise<void>((resolve) => {
  settleFirst = resolve;
});
function markFirstSettled(): void {
  settleFirst?.();
  settleFirst = null;
}

/** 이 앱 실행에서 첫 동기가 끝날 때까지 기다린다(로그인 안 했으면 곧바로). 최대 `ms`. */
export function awaitFirstSync(ms = 4000): Promise<void> {
  return Promise.race([firstSettled, new Promise<void>((r) => setTimeout(r, ms))]);
}

// 겹쳐 부르면 커서가 깨진다 — 진행 중이면 그 약속을 함께 기다린다.
let inFlight: Promise<void> | null = null;

// ── 가져오기 중 동기 미루기(D-3 · ADR-043 개정) ─────────────────────────────
// 가져오기·되돌리기는 여러 write 로 나눠 쓴다(운동 단위 ≤2000행). 그 사이에 동기가 돌면 ① 반쯤 쓴 묶음이 서버로 올라가
// 부팅 정리(status='writing' 묶음 삭제)가 지운 행이 다른 기기에 남고 ② pull 이 같은 id 를 받아 다음 묶음 insert 가
// Loki 드라이버를 망가뜨린다. 그래서 inFlight 와 같은 자리에서 막는다: 멈춘 동안 들어온 동기 요청은 **재개 뒤 한 번**으로 합친다.
let pauseDepth = 0;
let resumeWaiters: Array<() => void> = [];

/** 지금 동기가 멈춰 있는가(가져오기 중) */
export function isSyncPaused(): boolean {
  return pauseDepth > 0;
}

/**
 * 동기를 멈춘다 — 진행 중인 동기가 있으면 끝날 때까지 기다린 뒤 돌아온다(성공·실패 무관). 돌려준 함수로 푼다(여러 번 불러도 한 번).
 * 겹쳐 멈출 수 있다(깊이를 센다). 마지막으로 풀릴 때 미뤄 둔 요청이 이어서 돈다.
 * @plm SRS-082
 */
export async function pauseSync(): Promise<() => void> {
  pauseDepth++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    pauseDepth = Math.max(0, pauseDepth - 1);
    if (pauseDepth === 0) {
      const ws = resumeWaiters;
      resumeWaiters = [];
      for (const w of ws) w();
    }
  };
  if (inFlight) await inFlight.catch(() => undefined);
  return release;
}

/** 서버와 동기하는 기기인가(전송 계층이 꽂혔고 로그인 상태). 가져오기 전 조건·되돌리기 삭제 방식이 쓴다. @plm SRS-082 */
export async function isSyncLoggedIn(): Promise<boolean> {
  if (!transport) return false;
  return transport.isLoggedIn().catch(() => false);
}

function waitForResume(): Promise<void> {
  return new Promise<void>((r) => resumeWaiters.push(r));
}

/**
 * 지금 동기한다. 실패는 **부르는 쪽으로 그대로 전한다** —
 * 사람이 누른 '지금 동기'는 실패를 보여 줘야 하고, 배경 동기는 아래에서 삼킨다.
 */
export function syncWithServer(): Promise<void> {
  // 다운그레이드 가드로 진짜 DB 를 열지 않은 실행(D-5)은 동기하지 않는다 — 빈 가드용 DB 로 받고 올리면 아무 이득 없이
  // 건강 기록(마지막 성공 시각)만 흐린다. 첫 동기 기다림도 곧바로 풀어 준다. @plm SRS-073 SAD-023
  if (isSchemaDowngradeBlocked()) {
    markFirstSettled();
    return Promise.resolve();
  }
  // 가져오기 중이면 재개 뒤로 미룬다(여러 요청은 재개 뒤 inFlight 하나로 합쳐진다). @plm SRS-082
  // [원본] if (pauseDepth > 0 && !inFlight) return waitForResume().then(() => syncWithServer());
  // [개선] 사람이 부른 동기는 기다리지 않는다 — 멈춘 채 두는 길에서는 재개가 오지 않는다(CD-6). 배경 동기는 scheduleSync 가 미룬다.
  if (pauseDepth > 0 && !inFlight) return Promise.reject(new SyncPausedError());
  if (!inFlight) {
    const startedAt = Date.now();
    setHealth({ lastAttemptAt: startedAt });
    inFlight = runSynchronize()
      .then(() => {
        if (!transport) return;
        transport.store?.set(LAST_SUCCESS_KEY, String(startedAt));
        transport.store?.set(FAILURES_KEY, '0');
        setHealth({ lastSuccessAt: startedAt, lastError: null, consecutiveFailures: 0, blocked: false });
      })
      .catch((e: unknown) => {
        // 실패를 **센다**. 배경 동기는 아래에서 삼키지만, 몇 번째 실패인지는 화면이 안다.
        setHealth({
          lastError: e instanceof Error ? e.message : String(e),
          consecutiveFailures: health.consecutiveFailures + 1,
        });
        transport?.store?.set(FAILURES_KEY, String(health.consecutiveFailures));
        throw e;
      })
      .finally(() => {
        inFlight = null;
        markFirstSettled();
        void refreshPendingCount();
      });
  }
  return inFlight;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 곧 동기하도록 예약한다(연달아 불러도 한 번).
 *
 * 저장소가 다섯 군데에서 부른다 — 운동 완료·루틴 저장 같은 **의미 있는 변화** 뒤다.
 * 오프라인·일시 실패는 조용히 넘긴다: 다음 방아쇠가 다시 시도하고, 로컬에는 이미 남아 있다.
 *
 * @param delayMs 몰아치는 호출을 합칠 시간
 */
let deferredWhilePaused = false;

export function scheduleSync(delayMs = 1500): void {
  // 멈춘 동안의 배경 동기는 재개 뒤 한 번으로 합친다(CD-6 — syncWithServer 는 멈춘 동안 곧바로 실패하므로 여기서 미룬다).
  if (pauseDepth > 0) {
    if (!deferredWhilePaused) {
      deferredWhilePaused = true;
      void waitForResume().then(() => {
        deferredWhilePaused = false;
        scheduleSync(0);
      });
    }
    return;
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void refreshPendingCount();
    void (async () => {
      try {
        // 예약과 실행 사이에 멈췄으면 재개 뒤로 다시 미룬다(CD-6)
        if (pauseDepth > 0) {
          scheduleSync(0);
          return;
        }
        if (transport && (await transport.isLoggedIn())) await syncWithServer();
        else markFirstSettled(); // 로그인 안 했다 — 기다릴 서버가 없다
      } catch {
        // 오프라인·일시 오류는 무시 — 다음 방아쇠가 재시도한다.
      }
    })();
  }, delayMs);
}
