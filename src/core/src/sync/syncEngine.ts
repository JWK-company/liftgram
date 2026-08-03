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
}

let transport: SyncTransport | null = null;
let warned = false;

/** 앱 시작 때 한 번 꽂는다. `null`을 주면 다시 뽑는다(로그아웃·테스트). */
export function installSyncTransport(t: SyncTransport | null): void {
  transport = t;
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

  await synchronize({
    database,
    // 서버는 살아 있는 레코드를 전부 updated로 보낸다. 받는 쪽이 없으면 만들게 해서
    // "이미 존재한다" 오류를 없앤다.
    sendCreatedAsUpdated: true,
    pullChanges: async ({ lastPulledAt }) => {
      const res = await t.pull(lastPulledAt ?? 0);
      return {
        changes: dropInProgressWorkouts(stripInternalFields(decode(res.changes))),
        timestamp: res.timestamp,
      };
    },
    pushChanges: async ({ changes }) => {
      await t.push(encode(stripInternalFields(changes)));
    },
    // migration sync는 쓰지 않는다 — 서버가 스키마를 모르므로(권위는 클라이언트) 컬럼이 늘어도
    // 평범한 델타로 넘어온다. 켜면 옛 스키마의 기기가 서버가 모르는 요청을 보낸다.
  });

  // **받은 것을 확실히 남긴다.** 여기서 내려쓰지 않으면, 동기 직후 화면을 옮기는 순간
  // 받은 데이터가 사라지는데 커서는 이미 전진해 있어 서버가 다시 보내지 않는다.
  await t.flush?.();
}

// 겹쳐 부르면 커서가 깨진다 — 진행 중이면 그 약속을 함께 기다린다.
let inFlight: Promise<void> | null = null;

/**
 * 지금 동기한다. 실패는 **부르는 쪽으로 그대로 전한다** —
 * 사람이 누른 '지금 동기'는 실패를 보여 줘야 하고, 배경 동기는 아래에서 삼킨다.
 */
export function syncWithServer(): Promise<void> {
  if (!inFlight) {
    inFlight = runSynchronize().finally(() => {
      inFlight = null;
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
export function scheduleSync(delayMs = 1500): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void (async () => {
      try {
        if (transport && (await transport.isLoggedIn())) await syncWithServer();
      } catch {
        // 오프라인·일시 오류는 무시 — 다음 방아쇠가 재시도한다.
      }
    })();
  }, delayMs);
}
