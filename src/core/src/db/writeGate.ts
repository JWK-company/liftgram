// @plm SRS-089  기기 DB 쓰기 문(모듈 수준) — 다중 탭 기록 덮어쓰기 방지의 마지막 겹
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜: LokiJS 증분 IndexedDB 어댑터는 다른 탭이 디스크를 바꾼 것을 보면 자기 메모리 사본으로 DB 전체를 덮어썼다(slow path).
//     그래서 탭 둘이 열려 있으면 한 탭이 다른 탭의 기록을 지웠다(메모리 「LokiJS 다중 탭 덮어쓰기」 · 실측).
//
// 어떻게(두 겹 — 스펙 data-safety-2 §11.5):
//   ① 트랜잭션 안 거부 — lokijs 패치(patches/@nozbe%2Flokijs@1.5.12-wmelon6.patch)가 저장 트랜잭션 **안에서** 디스크 versionId 를
//      비교해, 다르면 덮지 않고 트랜잭션을 중단한다(LOKI_STALE). 그 순간 `onForeignWrite` 로 이 문을 닫는다.
//   ② 이 문(봉인) — 한 번 닫히면 이 문서가 사라질 때까지 열리지 않는다. 패치가 저장·삭제 진입 때 `isSealed()` 를 보므로
//      autosave·명시 flush·Watermelon 내부·계정 리셋 뒤 새 Loki 까지 전부 디스크에 닿지 않는다.
//      상태는 globalThis 에 둔다 — 같은 파일이 두 번 평가돼도(모듈 경로 차이) 문은 하나다.
//
// 진 탭이 잃는 것은 메모리에만 있던 마지막 변경뿐이다. 이미 디스크에 있는 기록은 어떤 경로로도 지워지지 않는다.
// 거부 뒤 무엇을 할지(쓰기 잠금을 쥔 탭이면 1회 새로고침 · 아니면 덮개)는 웹 쪽(frontend/lib/tabGuard)이 정한다.
// ─────────────────────────────────────────────────────────────────────────────

/** 봉인 이유 — stale: 저장이 거부됐다 · versionchange: 다른 탭이 DB 를 지웠다 · writer_lost: 다른 탭이 쓰기 주인을 가져갔다 · import_elsewhere: 다른 탭이 가져오는 중 */
export type SealReason = 'stale' | 'versionchange' | 'writer_lost' | 'import_elsewhere';

export interface SealInfo {
  reason: SealReason;
  /** 이 탭이 마지막에 본 디스크 versionId(stale 일 때) */
  prev?: string | null;
  /** 거부 순간 디스크의 versionId(stale 일 때) */
  disk?: string | null;
  at: number;
}

type Listener = (info: SealInfo) => void;
interface GateState {
  sealed: SealInfo | null;
  /** 새 database.write 를 받지 않는다(넘겨주기 중 — 봉인 직전 단계) */
  writesClosed: boolean;
  listeners: Set<Listener>;
}

function gate(): GateState {
  const g = globalThis as typeof globalThis & { __liftgramWriteGate?: GateState };
  if (!g.__liftgramWriteGate) g.__liftgramWriteGate = { sealed: null, writesClosed: false, listeners: new Set() };
  return g.__liftgramWriteGate;
}

/** 이 문서의 기기 DB 가 봉인됐는가(디스크에 더는 쓰지 않는다) */
export function isLocalDbSealed(): boolean {
  return gate().sealed !== null;
}

export function getSealInfo(): SealInfo | null {
  return gate().sealed;
}

/** 새 쓰기(database.write)를 받는가 — 봉인됐거나 넘겨주기 중이면 false */
export function acceptsLocalDbWrites(): boolean {
  const s = gate();
  return !s.sealed && !s.writesClosed;
}

/** 새 쓰기를 받지 않는다(쓰기 주인을 빼앗긴 탭 — 대기열 장벽·마지막 내려쓰기 전에). 되돌릴 수 없다. */
export function closeLocalDbWrites(): void {
  gate().writesClosed = true;
}

/** 봉인 탭에서 database.write 가 돌려주는 오류 */
export class LocalDbSealedError extends Error {
  readonly code = 'LOCAL_DB_SEALED';
  constructor() {
    super('이 탭은 기기 DB 에 더 쓰지 않는다(다른 탭이 쓰기 주인이거나 디스크가 바뀌었다)');
    this.name = 'LocalDbSealedError';
  }
}

/** 문을 닫는다. 여러 번 불러도 첫 이유가 남는다(되돌릴 수 없다 — 새로고침만 푼다). */
export function sealLocalDb(reason: SealReason, extra?: { prev?: string | null; disk?: string | null }): void {
  const s = gate();
  if (s.sealed) return;
  const info: SealInfo = { reason, at: Date.now(), ...extra };
  s.sealed = info;
  // 패치는 IDB 요청 콜백 안에서 부른다 — 듣는 쪽 일은 그 밖에서
  for (const fn of [...s.listeners])
    queueMicrotask(() => {
      try {
        fn(info);
      } catch (e) {
        console.error('[DB] 봉인 알림 처리 실패', e);
      }
    });
}

/** 봉인되면 한 번 불린다(이미 봉인됐으면 곧바로). 정리 함수를 돌려준다. */
export function subscribeSeal(fn: Listener): () => void {
  const s = gate();
  s.listeners.add(fn);
  const now = s.sealed;
  if (now) queueMicrotask(() => fn(now));
  return () => s.listeners.delete(fn);
}

/**
 * 진짜 기록 DB 의 증분 IDB 어댑터 옵션(Watermelon `extraIncrementalIDBOptions` 로 넘긴다 — 참조 그대로 어댑터까지 간다).
 * 리셋(unsafeResetDatabase)이 새 어댑터를 만들어도 같은 객체를 다시 받으므로 문은 이어진다.
 */
export function lokiGateOptions() {
  return {
    rejectForeignWrites: true,
    isSealed: isLocalDbSealed,
    onForeignWrite: (info: { prev: string | null; disk: string | null }) => {
      console.warn('[DB] 다른 탭이 기기 DB 를 바꿨다 — 덮어쓰지 않고 이 탭을 봉인한다', info);
      sealLocalDb('stale', info);
    },
    // 다른 탭이 DB 를 지웠다(계정 전환 리셋 등) — 이 탭의 사본은 낡았다
    onversionchange: () => sealLocalDb('versionchange'),
    // 거부 모드에서는 slow path 덮어쓰기가 일어나면 안 된다 — 불리면 불변식 위반(패치가 빠진 번들 등)
    onDidOverwrite: () => console.error('[DB] 불변식 위반 — 거부 모드인데 다른 탭의 디스크를 덮어썼다(lokijs 패치 확인)'),
  };
}

/** 테스트 전용 — 한 프로세스에서 「탭」을 바꿔 가며 볼 때 */
export function __resetWriteGateForTests(): void {
  const s = gate();
  s.sealed = null;
  s.writesClosed = false;
  s.listeners.clear();
}
