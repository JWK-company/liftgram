// 잠금 조작 적용기(drain · SPEC-017 Phase 3 §5·§6) — 앱이 열리면 네이티브 대기열의 조작을 seq 순서로 웹 기록에 반영한다.
//
// 조작 하나의 순서(불변식 — 바꾸지 않는다):
//   ① 판정·기대값 비교·완료 = 한 database.write(applyLockAction)
//   ② 처방 다시 채우기(라운드 전부 기준 · 실패해도 완료는 남는다)
//   ③ 워터마크 쓰기(같은 Loki DB 의 로컬 저장소)
// ack 는 호출자(웹 셸)가 내려쓰기 성공을 확인한 뒤에 한다. 워터마크를 완료보다 먼저 쓰면 kill 때 완료를 잃으므로 금지(§6).
// 「세트는 남고 워터마크는 없음」으로 끊기면 다음 drain 이 같은 조작을 다시 적용한다 — 이미 완료라 noop 이고, noop 이어도
// ②를 다시 돌려 완료~채우기 사이에 끊긴 채우기를 되살린다(REV-005 도메인 M-8).
// 저장소는 주입한다(메모리 DB 단위 테스트 · 웹 셸).
import { alreadyApplied, planRoundFills, type LockAction, type LockApplyVerdict, type LockExpect, type LockWatermark, type SimBlock } from './lockScreen';

export interface LockDrainMismatch {
  setId: string;
  weId: string;
  exerciseId: string;
  unit: 'kg' | 'lb';
  seen: LockExpect;
  saved: LockExpect;
  /** 이 세트의 운동(세션) — 끝난 운동의 표식을 다음 운동에 보이지 않게(REV-006 화면 M-5) */
  workoutId?: string;
  /** 한쪽 입력 블록 — 카드와 같이 「한쪽」을 붙인다(REV-006 화면 L-4) */
  oneSide?: boolean;
}

export interface LockDrainRepo {
  applyLockAction(
    action: LockAction,
    dbEpoch: string,
    now?: number,
  ): Promise<{
    verdict: LockApplyVerdict;
    setIds: string[];
    changed: string[];
    mismatches: LockDrainMismatch[];
    roundSetIds: string[];
    workoutExerciseIds: string[];
  }>;
  loadSimBlocks(workoutExerciseIds: string[]): Promise<SimBlock[]>;
  applyLoadFills(fills: { setLogId: string; weightKg: number }[]): Promise<string[]>;
  getLockWatermark(): Promise<LockWatermark | null>;
  setLockWatermark(wm: LockWatermark): Promise<void>;
}

export interface LockDrainResult {
  /** 처리한 조작 id(이미 적용됨·noop·버림 포함) — 내려쓰기가 성공하면 ack 한다. */
  handled: string[];
  applied: number;
  noop: number;
  /** 버린 조작 수(다른 세션·없는 세트·끝난 세션·다른 dbEpoch) — 화면에 한 번 알린다(§6 L-5). */
  discarded: number;
  /** 이번에 완료로 바뀐 세트 — 화면이 휴식·축하를 다시 걸지 않는다(drain 은 휴식을 무시 · §7). */
  changed: string[];
  mismatches: LockDrainMismatch[];
  watermark: LockWatermark | null;
  /** 채우기 실패(완료는 끝났다 · 진단 로그용) */
  fillErrors: unknown[];
  /** 형식이 깨져 버린 조작 수(진단) */
  malformed: number;
  /** 적용 중 예외로 멈췄다 — 남은 조작은 다음 drain 에서(호출자가 백오프) */
  stalled?: boolean;
}

/** 같은 조작이 이만큼 연달아 던지면 버린다 */
export const POISON_LIMIT = 3;

const DISCARDED = { verdict: 'discarded' as const, setIds: [], changed: [], mismatches: [], roundSetIds: [], workoutExerciseIds: [] };

/** 네이티브가 보낸 조작의 형식 — id·storeId·dbEpoch·sessionId 문자열 · seq 정수 · setIds·expect 배열 · at 수 */
export function wellFormed(a: unknown): a is LockAction {
  const x = a as Partial<LockAction> | null;
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.storeId === 'string' &&
    typeof x.dbEpoch === 'string' &&
    typeof x.sessionId === 'string' &&
    Number.isInteger(x.seq) &&
    Array.isArray(x.setIds) &&
    x.setIds.every((id) => typeof id === 'string') &&
    Array.isArray(x.expect) &&
    typeof x.at === 'number'
  );
}

/** 결함 주입(e2e 빌드 전용) — 'kill-before-watermark': ① 완료 뒤 ③ 워터마크 전에 멈춘다(앱이 죽은 것처럼). */
export type LockDrainFault = 'kill-before-watermark' | null;

export class LockDrainKilled extends Error {
  constructor() {
    super('lock drain killed (e2e fault)');
  }
}

export async function drainLockActions(
  repo: LockDrainRepo,
  input: { actions: LockAction[]; dbEpoch: string; now?: number; fault?: LockDrainFault; failCounts?: Map<string, number> },
): Promise<LockDrainResult> {
  const out: LockDrainResult = { handled: [], applied: 0, noop: 0, discarded: 0, changed: [], mismatches: [], watermark: null, fillErrors: [], malformed: 0 };
  let wm = await repo.getLockWatermark();
  // 같은 저장소 안에서 seq 순서 — 저장소가 여럿 섞이면(재설치 직후) 저장소별로 순서를 지킨다
  const actions = [...input.actions].sort((a, b) => (a?.storeId === b?.storeId ? (a?.seq ?? 0) - (b?.seq ?? 0) : String(a?.storeId) < String(b?.storeId) ? -1 : 1));
  for (const a of actions) {
    if (wellFormed(a) && alreadyApplied(a, wm, input.dbEpoch)) {
      // 이미 적용됨 — 사용자가 그 뒤에 해제한 세트를 다시 완료하지 않는다(H-3)
      out.handled.push(a.id);
      continue;
    }
    // 형식이 깨진 조작(필드 누락)은 버린다 — 하나가 매번 던져 뒤 대기열 전체를 막지 않게(REV-006 동시성 M-1 · 저장소 M-5)
    if (!wellFormed(a)) {
      // 워터마크는 움직이지 않는다(seq 를 믿을 수 없다) — id 가 있으면 ack 로 지운다
      out.discarded += 1;
      out.malformed += 1;
      const aid = (a as { id?: unknown } | null)?.id;
      if (typeof aid === 'string') out.handled.push(aid);
      continue;
    }
    // [원본] const r = await repo.applyLockAction(a, input.dbEpoch, input.now); — 예외가 나면 drain 전체가 멈췄다
    let r: Awaited<ReturnType<LockDrainRepo['applyLockAction']>>;
    try {
      r = await repo.applyLockAction(a, input.dbEpoch, input.now);
    } catch (e) {
      // 한 번의 실패(일시 오류)로 사람의 완료를 버리지 않는다 — 여기서 멈추고 다시 시도한다.
      // 같은 조작이 연달아 POISON_LIMIT 번 던지면 그때 버린다(독 조작 격리 · REV-006 동시성 M-1).
      const n = (input.failCounts?.get(a.id) ?? 0) + 1;
      input.failCounts?.set(a.id, n);
      out.fillErrors.push(e);
      if (n < POISON_LIMIT) {
        out.stalled = true;
        break;
      }
      r = DISCARDED;
    }
    input.failCounts?.delete(a.id);
    if (r.verdict === 'discarded') out.discarded += 1;
    else {
      if (r.verdict === 'apply') out.applied += 1;
      else out.noop += 1;
      out.changed.push(...r.changed);
      out.mismatches.push(...r.mismatches);
      try {
        const blocks = await repo.loadSimBlocks(r.workoutExerciseIds);
        const plan = planRoundFills(blocks, r.roundSetIds.length ? r.roundSetIds : r.setIds, new Map());
        await repo.applyLoadFills(plan);
      } catch (e) {
        out.fillErrors.push(e);
      }
    }
    if (input.fault === 'kill-before-watermark') throw new LockDrainKilled();
    // 워터마크는 저장소가 바뀌면 그 저장소 기준으로 다시 시작(alreadyApplied 가 다른 storeId 를 0 으로 본다)
    const next: LockWatermark = { storeId: a.storeId, dbEpoch: input.dbEpoch, seq: wm && wm.storeId === a.storeId && wm.dbEpoch === input.dbEpoch ? Math.max(wm.seq, a.seq) : a.seq };
    await repo.setLockWatermark(next);
    wm = next;
    out.handled.push(a.id);
  }
  out.watermark = wm;
  return out;
}
