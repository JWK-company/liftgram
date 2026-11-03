// 잠금화면 운동 카드 — 순수 규칙(SPEC-017 §3~§8 · SRS-096 · ADR-046)
//
// 정본은 웹의 로컬 기록이다. 네이티브는 이 파일이 만든 **표시 사본**(LockSnapshot)과 **조작 대기열**(LockAction)만 가진다.
// 잠금 중 버튼을 누르면 네이티브가 사본에서 그 단계의 세트 id 를 빼고(rebaseLockQueue 와 같은 규칙) 조작을 쌓는다.
// 앱이 열리면 웹이 대기열을 seq 순서로 적용한다(drain) — 자리(queue[0]) 연산은 어디에도 없다. 모든 갱신은 세트 id 기반이다.
//
// 이 파일은 DB·화면·플랫폼을 모른다(node --test 로 바로 돈다). 저장소에서 값을 모아 넘기는 쪽은 웹 셸(Phase 3)이다.
import { planPrescribedLoadFills, type LoadFill, type PrescribedSet } from './prescription';
import { roundKeyOf } from './supersetRound';
import { displayWeight } from './units';
import type { WeightUnit } from './types';

// ── 타입(§3) ────────────────────────────────────────────────────────────────

export interface RestState {
  endsAt: number | null; // epoch ms · null = 휴식 없음
  totalSec: number | null;
  setAt: number; // 사람이 이 값을 정한 시각(epoch ms) — LWW 기준
  by: 'web' | 'native';
}

export interface LockMember {
  setId: string;
  exerciseName: string;
  setNo: number; // 화면과 같은 번호 — 일반·백오프 세트만 1·2·3(라벨 세트는 0)
  setTotal: number; // 번호가 붙는 세트 수
  /** 화면과 같은 라벨 — 'W' 워밍업 · 'D' 드롭 · 'F' 실패 · 'T' 탑셋 · 그 밖은 번호(REV-005 도메인 M-2) */
  label: string;
  unit: WeightUnit;
  /** 한쪽 입력 블록(배수 > 1) — 카드에 「한쪽」(§5) */
  oneSide: boolean;
  display: { weight: number | null; reps: number | null; seconds: number | null; distanceM: number | null };
  expect: LockExpect;
}

export interface LockExpect {
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
}

export interface LockStep {
  setIds: string[];
  members: LockMember[];
  restAfterSec: number;
  openApp: boolean;
}

export interface LockSnapshot {
  v: 3;
  sessionId: string;
  title: string;
  steps: LockStep[];
  /** 12단계 상한으로 잘렸나 — 카드는 「앱을 열어 다음 세트를 보세요」(L-8 · REV-005 도메인 L-3) */
  truncated: boolean;
  rest: RestState;
  appliedThroughSeq: number;
  storeId: string;
  dbEpoch: string;
  paused: boolean;
  sound: { enabled: boolean; preset: string; volume: 1 | 2 | 3 };
  updatedAt: number;
}

export interface LockAction {
  id: string;
  storeId: string;
  /** 조작을 만든 스냅샷의 웹 DB id — 다른 dbEpoch 의 조작은 버린다(§6 · REV-005 도메인 M-7) */
  dbEpoch: string;
  seq: number;
  kind: 'complete';
  sessionId: string;
  setIds: string[];
  expect: ({ setId: string } & LockExpect)[];
  at: number;
}

/** 카드 단계 상한(묶음 한 단계 = 1) — 다 쓰면 카드는 「앱을 열어 다음 세트를 보세요」(SPEC-017 §4-4). */
export const LOCK_STEP_LIMIT = 12;

// ── 화면 행(§4-1) ───────────────────────────────────────────────────────────

export type SessionRow<T> = { kind: 'single'; we: T } | { kind: 'group'; group: string; members: T[] };

/**
 * 세션 화면의 행 순서 — 슈퍼셋 묶음은 첫 멤버 자리에 한 줄로 접는다(멤버 2개 이상일 때만).
 * 화면(ActiveWorkout)과 잠금 카드가 **같은 함수**를 쓴다 — 단계 순서가 화면 순서와 어긋나지 않게.
 */
export function groupSessionRows<T extends { supersetGroup?: string | null }>(exercises: T[]): SessionRow<T>[] {
  const done = new Set<string>();
  const out: SessionRow<T>[] = [];
  for (const we of exercises) {
    if (we.supersetGroup) {
      if (done.has(we.supersetGroup)) continue;
      const members = exercises.filter((x) => x.supersetGroup === we.supersetGroup);
      if (members.length >= 2) {
        done.add(we.supersetGroup);
        out.push({ kind: 'group', group: we.supersetGroup, members });
        continue;
      }
    }
    out.push({ kind: 'single', we });
  }
  return out;
}

// ── 순서 규칙(§4) ───────────────────────────────────────────────────────────

export interface LockSetInput {
  id: string;
  setNumber: number;
  done: boolean | null;
  isWarmup?: boolean | null;
  isDrop?: boolean | null;
  isFailed?: boolean | null;
  setType?: string | null;
}
export interface LockBlockInput<S extends LockSetInput = LockSetInput> {
  weId: string;
  sets: S[];
}
export type LockRowInput<S extends LockSetInput = LockSetInput> =
  | { kind: 'single'; block: LockBlockInput<S> }
  | { kind: 'group'; members: LockBlockInput<S>[] };

export interface LockStepPlan {
  /** 이 단계에서 완료할 세트(미완료만 · 화면 묶음 순서). */
  setIds: string[];
  /** 라운드 단계면 그 라운드의 세트 전부(이미 완료한 짝 포함) — 처방 다시 채우기 기준(§5 planRoundFills). */
  roundSetIds: string[];
}

const isOpen = (s: { done: boolean | null }) => s.done !== true;
const bySetNumber = <S extends LockSetInput>(sets: S[]) => [...sets].sort((a, b) => a.setNumber - b.setNumber);

/**
 * 묶음 멤버를 라운드로 편다 — 짝은 **화면과 같은 짝 키**(supersetRound.roundKeyOf: 일반 n:k · 탑셋 t:k · 워밍업·드롭·실패 null).
 * [원본] 위치 기준(멤버의 r 번째 짝 세트끼리 · REV-003 도메인 H-1) — 화면 묶음 완료(getSupersetRoundSetsFor)는 짝 키라
 *   탑셋이 섞인 묶음에서 화면과 잠금의 짝이 달랐다(REV-005 도메인 M-3). 라운드 순서는 키 문자열이 아니라 멤버 안 실제 위치를
 *   차례로 훑어 처음 나온 순서다. 짝 없는 세트는 바로 앞 짝 세트의 키(attach — 맨 앞이면 null)로 원래 자리를 기억한다.
 */
function spreadRounds<S extends LockSetInput>(members: LockBlockInput<S>[]) {
  const per = members.map((m) => {
    const sorted = bySetNumber(m.sets);
    const items = sorted.map((set) => ({ set, key: roundKeyOf(sorted, set.id) }));
    const loose: { set: S; attach: string | null }[] = [];
    let last: string | null = null;
    for (const it of items) {
      if (it.key == null) loose.push({ set: it.set, attach: last });
      else last = it.key;
    }
    return { weId: m.weId, items, loose };
  });
  const order: string[] = [];
  const longest = Math.max(0, ...per.map((p) => p.items.length));
  for (let i = 0; i < longest; i++)
    for (const p of per) {
      const k = p.items[i]?.key;
      if (k && !order.includes(k)) order.push(k);
    }
  const roundOf = (key: string) =>
    per.map((p) => p.items.find((it) => it.key === key)?.set).filter((x): x is S => !!x);
  return { per, order, roundOf };
}

/** 묶음 안에서 이 세트와 같은 라운드의 세트 id(화면과 같은 짝 키) — 짝 없는 세트면 자기 하나. 잠금 drain·시뮬레이션 공용. */
export function lockRoundOf(members: LockBlockInput[], setId: string): string[] {
  const { per, roundOf } = spreadRounds(members);
  for (const p of per) {
    const it = p.items.find((x) => x.set.id === setId);
    if (it) return it.key ? roundOf(it.key).map((x) => x.id) : [setId];
  }
  return [setId];
}

/** 남은 단계(§4) — 일반 블록은 미완료 세트를 차례로, 묶음은 앞쪽 짝 없는 세트 → 라운드(+ 사이의 짝 없는 세트) 순서. */
export function buildLockSteps(rows: LockRowInput[], limit = LOCK_STEP_LIMIT): LockStepPlan[] {
  return buildLockStepsAll(rows).slice(0, limit);
}

/** 상한 없이 전부 — 잘렸는지 판단용. */
export function buildLockStepsAll(rows: LockRowInput[]): LockStepPlan[] {
  const out: LockStepPlan[] = [];
  const push = (setIds: string[], roundSetIds: string[]) => {
    if (setIds.length) out.push({ setIds, roundSetIds });
  };
  for (const row of rows) {
    if (row.kind === 'single') {
      for (const s of bySetNumber(row.block.sets)) if (isOpen(s)) push([s.id], [s.id]);
      continue;
    }
    const { per, order, roundOf } = spreadRounds(row.members);
    const looseAt = (attach: string | null) => {
      for (const p of per) for (const l of p.loose) if (l.attach === attach && isOpen(l.set)) push([l.set.id], [l.set.id]);
    };
    looseAt(null);
    for (const key of order) {
      const round = roundOf(key);
      push(
        round.filter(isOpen).map((s) => s.id),
        round.map((s) => s.id),
      );
      looseAt(key);
    }
  }
  return out;
}

// ── 값 시뮬레이션(§5) ───────────────────────────────────────────────────────

export interface SimSet extends LockSetInput {
  weightKg: number; // 입력 칸 무게(한쪽 입력이면 한쪽 · 저장 kg)
  reps: number;
  seconds?: number | null;
  /** 사람이 고친 세트인가(isUserTouched) — 처방 채우기가 건너뛴다. */
  touched: boolean;
  loadMultiplier: number | null;
  /** v27 값 출처(칸별 인코딩 — encodeValueSource) — 시뮬레이션이 채우기를 따라 무게 칸을 rx 로 올린다 */
  valueSource?: string | null;
}
export interface SimBlock {
  weId: string;
  /** 블록 전체 세트(완료·워밍업 포함) — 세트 번호 순서로 넘긴다(REV-003 도메인 L-8). */
  sets: SimSet[];
  rx: PrescribedSet[] | null;
  has1rm: boolean;
  equipment: string | null | undefined;
  unit: WeightUnit;
  /** 묶음이면 같은 묶음의 블록 id 전부(자기 포함 · 화면 묶음 순서). */
  groupWeIds?: string[];
}

/**
 * 묶음 완료 뒤 다시 채우기(§5 · REV-003 도메인 H-2) — 화면은 라운드의 **모든 멤버**(이미 완료한 짝 포함)로 그 블록의
 * 다음 세트를 다시 채운다. 이 함수가 그 계획이고, 시뮬레이션과 completeSetsFlow 가 같이 쓴다. 저장은 호출자가.
 * values: 이번에 완료하며 확정한 입력 칸 값(없으면 블록의 저장값).
 */
export function planRoundFills(
  blocks: SimBlock[],
  roundSetIds: string[],
  values: Map<string, { weightKg?: number; reps?: number }> = new Map(),
): (LoadFill & { weId: string })[] {
  const out: (LoadFill & { weId: string })[] = [];
  for (const id of roundSetIds) {
    const b = blocks.find((x) => x.sets.some((s) => s.id === id));
    if (!b) continue;
    const sets = bySetNumber(b.sets);
    const doneIdx = sets.findIndex((s) => s.id === id);
    const d = sets[doneIdx];
    const v = values.get(id);
    const kg = v?.weightKg ?? d.weightKg;
    const reps = v?.reps ?? d.reps;
    if (!(kg > 0)) continue;
    const mult = d.loadMultiplier && d.loadMultiplier > 0 ? d.loadMultiplier : 1;
    const plan = planPrescribedLoadFills({
      rx: b.rx,
      sets: sets.map((s) => ({ id: s.id, done: s.done, touched: s.touched, loadMultiplier: s.loadMultiplier })),
      doneIdx,
      done: { isWarmup: d.isWarmup ?? null, isFailed: d.isFailed ?? null, setType: d.setType ?? null },
      doneCalcKg: kg * mult,
      doneReps: reps,
      has1rm: b.has1rm,
      equipment: b.equipment,
      unit: b.unit,
    });
    for (const f of plan) out.push({ ...f, weId: b.weId });
  }
  return out;
}

/**
 * 대기열 순서 전체를 시뮬레이션해 단계마다 **저장될 값**(expect)과 그때의 **값 출처**를 낸다(§5 · H-5).
 * 단계 k 완료(처방 채우기 포함)의 결과가 단계 k+1 의 입력이 된다 — 「1RM 의 N%」·탑셋 → 백오프 연쇄까지.
 * 채운 세트는 무게 칸 출처가 rx 가 된다(저장소 writeSetValues 와 같다 · REV-005 도메인 H-1). 블록 입력은 복사해 쓴다.
 */
export function simulateLockQueue(
  blocks: SimBlock[],
  steps: LockStepPlan[],
): { expect: Map<string, LockExpect>; source: Map<string, string | null> } {
  const sim = blocks.map((b) => ({ ...b, sets: bySetNumber(b.sets).map((s) => ({ ...s })) }));
  const find = (id: string) => {
    for (const b of sim) {
      const s = b.sets.find((x) => x.id === id);
      if (s) return s;
    }
    return null;
  };
  const expect = new Map<string, LockExpect>();
  const source = new Map<string, string | null>();
  for (const step of steps) {
    for (const id of step.setIds) {
      const s = find(id);
      if (!s) continue;
      expect.set(id, { weightKg: s.weightKg, reps: s.reps, seconds: s.seconds ?? null });
      source.set(id, s.valueSource ?? null);
      s.done = true;
      s.touched = true; // 완료한 세트는 사람이 든 값(isUserTouched)
    }
    for (const f of planRoundFills(sim, step.roundSetIds)) {
      const s = find(f.setLogId);
      if (!s) continue;
      s.weightKg = f.weightKg;
      s.valueSource = withFieldSource(s.valueSource, 'weight', 'rx');
    }
  }
  return { expect, source };
}

/** 저장될 값만(simulateLockQueue 의 expect). */
export function planLockQueueValues(blocks: SimBlock[], steps: LockStepPlan[]): Map<string, LockExpect> {
  return simulateLockQueue(blocks, steps).expect;
}

/** 저장값이 카드에 보인 값과 같은가 — kg 그대로가 아니라 **블록 단위 입력칸의 표시 정밀도**로(lb 반올림 거짓 「다름」 방지). */
export function sameAtDisplayPrecision(a: LockExpect, b: LockExpect, unit: WeightUnit): boolean {
  const w = (x: number | null) => (x == null ? null : displayWeight(x, unit));
  return w(a.weightKg) === w(b.weightKg) && (a.reps ?? null) === (b.reps ?? null) && (a.seconds ?? null) === (b.seconds ?? null);
}

// ── 대기열 rebase(§6) ───────────────────────────────────────────────────────

/**
 * 스냅샷 단계에서 아직 스냅샷에 들어가지 않은 조작(seq > appliedThroughSeq)의 세트를 뺀다 — id 기반(H-1).
 * 겹치는 세트가 없는 조작은 아무것도 안 한다(이미 화면에서 처리됨). 단계가 비면 그 단계를 지운다.
 * 네이티브 버튼 처리도 같은 규칙이다(누른 단계의 setIds 를 조작에 고정하고 사본에서 뺀다 · Kotlin·Swift 는 같은 JSON 픽스처).
 */
export function rebaseLockQueue<T extends { setIds: string[]; members?: { setId: string }[] }>(
  steps: T[],
  appliedThroughSeq: number,
  pending: Pick<LockAction, 'seq' | 'setIds'>[],
): T[] {
  const gone = new Set<string>();
  for (const a of pending) if (a.seq > appliedThroughSeq) for (const id of a.setIds) gone.add(id);
  if (!gone.size) return steps;
  const out: T[] = [];
  for (const st of steps) {
    const setIds = st.setIds.filter((id) => !gone.has(id));
    if (!setIds.length) continue;
    if (setIds.length === st.setIds.length) {
      out.push(st);
      continue;
    }
    out.push({ ...st, setIds, ...(st.members ? { members: st.members.filter((m) => !gone.has(m.setId)) } : {}) });
  }
  return out;
}

/** 새 스냅샷을 받을지 — 지금 것보다 appliedThroughSeq 가 작으면 버린다(거꾸로 가는 스냅샷 금지 · REV-003 동시성 H-2). */
export function acceptSnapshot(
  current: { appliedThroughSeq: number; storeId?: string; dbEpoch?: string; sessionId?: string } | null,
  next: { appliedThroughSeq: number; storeId?: string; dbEpoch?: string; sessionId?: string },
): boolean {
  if (!current) return true;
  // 저장소·웹 DB·세션이 바뀌면 seq 를 비교하지 않는다 — 계정 리셋·새 저장소 뒤 0 부터인 스냅샷이 거부되어 카드가 옛 세션에 멈추던 것(REV-005 도메인 M-5)
  if (current.storeId !== next.storeId || current.dbEpoch !== next.dbEpoch || current.sessionId !== next.sessionId) return true;
  return next.appliedThroughSeq >= current.appliedThroughSeq;
}

/** ack 된 조작을 지워도 되나 — 그 seq 이상을 담은 스냅샷이 덮은 뒤에만(ack 가 스냅샷보다 먼저 닿는 경우 · H-2). */
export function canForgetAcked(action: { seq: number }, snapshot: { appliedThroughSeq: number } | null): boolean {
  return !!snapshot && snapshot.appliedThroughSeq >= action.seq;
}

// ── drain 판정(§6) ──────────────────────────────────────────────────────────

export interface LockWatermark {
  storeId: string;
  dbEpoch: string;
  seq: number;
}

/** 이 조작이 이미 적용됐나 — 다른 저장소(storeId)의 워터마크는 0 으로 본다(새 저장소 조작이 조용히 버려지지 않게). */
export function alreadyApplied(action: Pick<LockAction, 'storeId' | 'seq'>, wm: LockWatermark | null, dbEpoch: string): boolean {
  if (!wm || wm.storeId !== action.storeId || wm.dbEpoch !== dbEpoch) return false;
  return action.seq <= wm.seq;
}

export type LockApplyVerdict = 'apply' | 'noop' | 'discarded';

/**
 * 조작 하나의 판정(§6 · L-5) — 같은 database.write 안에서 지금 DB 상태로 부른다.
 * discarded: 다른 세션 · 끝난 세션 · 다른 dbEpoch · 실린 세트가 하나도 없음
 * noop: 남은 세트가 전부 이미 완료
 * apply: 하나라도 미완료 — 짝이 바뀐 묶음도 버리지 않고 실린 id 대로 완료한다(REV-003 동시성 M-5).
 *   묶음 중 일부 세트가 지워졌으면 **남은 세트만** 완료한다(실제로 든 다른 멤버 기록을 잃지 않게 · REV-005 도메인 M-6).
 */
export function judgeLockAction(input: {
  action: Pick<LockAction, 'sessionId' | 'setIds'>;
  activeSessionId: string | null;
  sessionActive: boolean;
  epochMatches: boolean;
  sets: Map<string, { done: boolean | null; sessionId: string }>;
}): { verdict: LockApplyVerdict; setIds: string[] } {
  const { action, activeSessionId, sessionActive, epochMatches, sets } = input;
  if (!epochMatches || !sessionActive || action.sessionId !== activeSessionId) return { verdict: 'discarded', setIds: [] };
  const present = action.setIds.filter((id) => sets.get(id)?.sessionId === action.sessionId);
  if (!present.length) return { verdict: 'discarded', setIds: [] };
  const open = present.filter((id) => sets.get(id)?.done !== true);
  return open.length ? { verdict: 'apply', setIds: present } : { verdict: 'noop', setIds: present };
}

/** 완료 시각 자르기(L-4) — 잠금 중 누른 시각을 세션 시작과 지금 사이로. */
export function clampCompletedAt(at: number, startedAt: number, now: number): number {
  if (!Number.isFinite(at)) return now;
  return Math.min(Math.max(at, startedAt), now);
}

/** 「앱 열기」로 바꿀 때인가 — 원인과 상관없이 가장 오래된 미확인 조작이 60초를 넘거나 30개를 넘으면(REV-003 동시성 M-6). */
export function queueStalled(pendingAts: number[], now: number): boolean {
  if (pendingAts.length > 30) return true;
  return pendingAts.length > 0 && now - Math.min(...pendingAts) > 60_000;
}

// ── 휴식 LWW(§7) ────────────────────────────────────────────────────────────

/** setAt 이 늦은 쪽이 이긴다 · 같으면 native(잠금 중 조작이 더 최근의 사람 의도). 스냅샷 안의 rest 와 setRest 두 길 공용. */
export function mergeRest(a: RestState | null, b: RestState | null): RestState | null {
  if (!a) return b;
  if (!b) return a;
  if (a.setAt !== b.setAt) return a.setAt > b.setAt ? a : b;
  if (a.by === b.by) return a;
  return a.by === 'native' ? a : b;
}

/** 지금 남은 휴식(초) — 시각이 지나 끝난 것은 **계산한 상태**일 뿐 쓰기가 아니다(REV-003 동시성 H-1). */
export function restRemainingSec(rest: RestState | null, now: number): number {
  if (!rest?.endsAt) return 0;
  return Math.max(0, Math.ceil((rest.endsAt - now) / 1000));
}

// ── 값 출처(§8) ─────────────────────────────────────────────────────────────

export const VALUE_SOURCES = ['default', 'copied_default', 'prev_snap', 'prev', 'routine', 'rx', 'user'] as const;
export type ValueSource = (typeof VALUE_SOURCES)[number];

export function isValueSource(x: unknown): x is ValueSource {
  return typeof x === 'string' && (VALUE_SOURCES as readonly string[]).includes(x);
}

/**
 * 칸별 출처를 한 칸(set_logs.value_source)에 담는다 — 「무게,횟수」(예 `rx,default`). 한 값만 있으면(옛 형식) 두 칸 다 그 값.
 * [원본] 세트의 가장 약한 출처 하나만 저장 — 처방이 무게를 채워도 횟수 때문인지 무게 때문인지 몰라 default 에 머물렀다(REV-005 H-1).
 * 유산소는 두 칸 모두 시간·거리의 출처를 쓴다.
 */
export function encodeValueSource(weight: ValueSource | null, reps: ValueSource | null): string | null {
  if (!weight && !reps) return null;
  if (weight === reps) return weight;
  return `${weight ?? ''},${reps ?? ''}`;
}
export function decodeValueSource(v: string | null | undefined): { weight: ValueSource | null; reps: ValueSource | null } {
  if (!v) return { weight: null, reps: null };
  const [w, r] = v.includes(',') ? v.split(',') : [v, v];
  return { weight: isValueSource(w) ? w : null, reps: isValueSource(r) ? r : null };
}
/** 칸 하나의 출처를 바꾼다 — 다른 칸은 그대로. */
export function withFieldSource(v: string | null | undefined, field: 'weight' | 'reps' | 'both', src: ValueSource): string | null {
  const d = decodeValueSource(v);
  if (field === 'both') return encodeValueSource(src, src);
  return field === 'weight' ? encodeValueSource(src, d.reps) : encodeValueSource(d.weight, src);
}
/** 세트의 출처 = 표시 칸 중 가장 약한 것(§8). 옛 세트(null)는 null. */
export function effectiveValueSource(v: string | null | undefined): ValueSource | null {
  const d = decodeValueSource(v);
  return weakestValueSource(d.weight, d.reps);
}

/** 표시 칸 중 가장 약한 출처(REV-003 저장소 H-2) — 약한 순서 default < copied_default < prev_snap < prev < routine < rx < user. */
export function weakestValueSource(...sources: (ValueSource | null | undefined)[]): ValueSource | null {
  let best: ValueSource | null = null;
  for (const s of sources) {
    if (!s) continue;
    if (best == null || VALUE_SOURCES.indexOf(s) < VALUE_SOURCES.indexOf(best)) best = s;
  }
  return best;
}

/** 잠금 카드에서 버튼 대신 「앱 열기」인가 — 사람이 안 고친 기본값 세트(맨몸 0kg×8 포함). null(옛 세트)은 아님. */
export function lockNeedsOpenApp(s: { userEdited?: boolean | null; valueSource?: string | null }): boolean {
  if (s.userEdited === true) return false;
  const v = effectiveValueSource(s.valueSource);
  return v === 'default' || v === 'copied_default';
}

// ── 스냅샷 조립(§3 · §9) ────────────────────────────────────────────────────

export interface LockSnapshotSet extends SimSet {
  userEdited?: boolean | null;
  valueSource?: string | null;
  /** 유산소 — 거리·시간이 지표면 둘 다 카드에 보일 수 있어야 한다(REV-003 도메인 L-7).
   *  metrics = 그 종목의 지표(cardioMetricsFor) — 시간만 재는 종목(줄넘기 등)은 거리가 없어도 된다(REV-007 표시 H-2). 없으면 시간·거리 둘 다. */
  cardio?: { distance: number | null; seconds: number | null; metrics?: string[] } | null;
}
export interface LockSnapshotBlock extends SimBlock {
  exerciseName: string;
  restSec: number; // 블록 휴식(초)
  sets: LockSnapshotSet[];
}

/** 화면과 같은 라벨 — 워밍업 W · 드롭 D · 실패 F · 탑셋 T · 그 밖(일반·백오프)은 1·2·3(ExerciseBlock 표시 규칙 · REV-005 도메인 M-2). */
function setLabelOf(s: LockSetInput): string | null {
  if (s.isWarmup) return 'W';
  if (s.isDrop === true) return 'D';
  if (s.isFailed) return 'F';
  if (s.setType === 'top') return 'T';
  return null;
}
// [원본] function workingNo — 워밍업만 빼고 드롭·실패·탑셋까지 번호로 셌다(카드 1/4 ~ 4/4 vs 화면 1·D·2·F)
function workingNo(sets: LockSetInput[], id: string): { no: number; total: number; label: string } {
  const sorted = bySetNumber(sets);
  const numbered = sorted.filter((s) => setLabelOf(s) == null);
  const me = sorted.find((s) => s.id === id);
  const lab = me ? setLabelOf(me) : null;
  const i = numbered.findIndex((s) => s.id === id);
  return { no: lab ? 0 : i + 1, total: numbered.length, label: lab ?? String(i + 1) };
}

/**
 * 스냅샷을 만든다 — 순서(buildLockSteps) · 값(planLockQueueValues) · 표시(블록 단위) · 「앱 열기」(§8) · 휴식(세트 유형 × 블록 휴식).
 * restAfter 는 호출자가 restSecondsForSetType 로(단계 첫 멤버의 세트 유형 × 그 블록 휴식 · M-2).
 */
export function buildLockSnapshot(input: {
  sessionId: string;
  title: string;
  rows: LockRowInput<LockSnapshotSet>[];
  blocks: LockSnapshotBlock[];
  rest: RestState;
  appliedThroughSeq: number;
  storeId: string;
  dbEpoch: string;
  paused: boolean;
  sound: LockSnapshot['sound'];
  now: number;
  restAfter: (set: LockSnapshotSet, block: LockSnapshotBlock) => number;
}): LockSnapshot {
  const all = buildLockStepsAll(input.rows);
  const plans = all.slice(0, LOCK_STEP_LIMIT);
  // 값과 출처를 함께 시뮬레이션 — 「앱 열기」는 그 단계 완료 직전(앞 단계 채우기 뒤)의 출처로 판정(REV-005 도메인 H-1)
  const { expect, source } = simulateLockQueue(input.blocks, plans);
  const locate = (id: string) => {
    for (const b of input.blocks) {
      const s = b.sets.find((x) => x.id === id);
      if (s) return { b, s };
    }
    return null;
  };
  const steps: LockStep[] = [];
  for (const p of plans) {
    const members: LockMember[] = [];
    let openApp = false;
    for (const id of p.setIds) {
      const hit = locate(id);
      if (!hit) continue;
      const { b, s } = hit;
      const e = expect.get(id) ?? { weightKg: s.weightKg, reps: s.reps, seconds: s.seconds ?? null };
      const n = workingNo(b.sets, id);
      const cardio = s.cardio ?? null;
      // [원본] if (lockNeedsOpenApp(s)) openApp = true; — 스냅샷 시점 저장 출처로 판정해 같은 대기열에서 채워질 세트도 막혔다
      if (lockNeedsOpenApp({ userEdited: s.userEdited, valueSource: source.has(id) ? source.get(id) : s.valueSource })) openApp = true;
      // [원본] if (cardio && (cardio.distance == null || cardio.seconds == null)) openApp = true; — 시간만 재는 종목이 영영 「앱 열기」
      const wantsDistance = !!cardio && (cardio.metrics ?? ['duration', 'distance']).includes('distance');
      const wantsDuration = !!cardio && (cardio.metrics ?? ['duration', 'distance']).includes('duration');
      if (cardio && ((wantsDistance && cardio.distance == null) || (wantsDuration && cardio.seconds == null))) openApp = true;
      members.push({
        setId: id,
        exerciseName: b.exerciseName,
        setNo: n.no,
        setTotal: n.total,
        label: n.label,
        unit: b.unit,
        oneSide: !cardio && (s.loadMultiplier ?? 1) > 1,
        display: {
          weight: cardio ? null : e.weightKg == null ? null : displayWeight(e.weightKg, b.unit),
          reps: cardio ? null : e.reps,
          seconds: cardio ? cardio.seconds : (e.seconds ?? null),
          distanceM: cardio && wantsDistance ? cardio.distance : null,
        },
        expect: e,
      });
    }
    if (!members.length) continue;
    const first = locate(members[0].setId);
    steps.push({
      setIds: members.map((m) => m.setId),
      members,
      restAfterSec: first ? input.restAfter(first.s, first.b) : 0,
      openApp,
    });
  }
  return {
    v: 3,
    sessionId: input.sessionId,
    title: input.title,
    steps,
    truncated: all.length > plans.length,
    rest: input.rest,
    appliedThroughSeq: input.appliedThroughSeq,
    storeId: input.storeId,
    dbEpoch: input.dbEpoch,
    paused: input.paused,
    sound: input.sound,
    updatedAt: input.now,
  };
}
