// 세트 방식별 휴식(SPEC-051) — 휴식을 「다음 세트」 기준으로 정한다. 순수 로직.
//
// 세트 방식(SPEC-041)으로 짠 블록은 방금 마친 세트 다음의 **아직 안 한 첫 세트**와 그 앞 세트의 종류로 「칸」을 정하고,
// 칸이 정한 값을 쉰다(웜업 사이 45 · 탑 직전 240 · 탑 뒤 180 · 백오프 사이 150 …). 드롭 앞은 쉬지 않는다(0 = 타이머 없음).
// 세트 방식 표시가 없는 블록(일반·직접 구성)은 지금 규칙 그대로다(restSecondsForRx · 드롭 처방 줄 앞 0초).
//
// 사람이 칸 값을 정할 수 있다 — 처방 줄의 선택 필드 `rest`(그 줄 **직전** 휴식)에 적는다. 같은 칸인 줄 전부에 같은 값을 적고,
// 읽을 때는 줄들에서 칸 → 값 맵을 만든다(세트를 더하거나 지워도 칸 맵은 그대로 읽힌다). 사람이 정한 값은 최소값 규칙보다 우선한다.
import { restSecondsForRx, type PrescribedSet, type PrescribedSetType, type SchemeId } from './prescription';
import { schemeOf } from './setSchemes';

/** 사람이 바꿀 수 있는 칸 — 시트에 이 순서로 보인다. */
export type RestSlot = 'warmup' | 'feeder' | 'beforeTop' | 'afterTop' | 'backoff' | 'beforeWork' | 'work' | 'ramp';
export const REST_SLOTS: RestSlot[] = ['warmup', 'feeder', 'beforeTop', 'afterTop', 'backoff', 'beforeWork', 'work', 'ramp'];
/** 칸 + 바꿀 수 없는 두 경우(드롭 앞 = 0 · 기본 = 종목 휴식). */
type Transition = RestSlot | 'drop' | 'base';

export type RestOverrides = Partial<Record<RestSlot, number>>;

/** 사람이 정하는 칸 값의 범위(초) — 15분 넘는 휴식은 실수다. */
export const REST_OVERRIDE_MAX = 900;

/** 세트 하나의 종류를 읽는 데 필요한 것 — 세션 세트(set_logs)와 처방 줄 모두. */
export interface RestSetKind {
  setType?: string | null;
  isWarmup?: boolean | null;
  isDrop?: boolean | null;
  done?: boolean | null;
}

/** 세션 세트의 종류 — 타입 칸이 비면 드롭·웜업 표시로(일반·드롭은 타입 칸을 비워 둔다). */
export function kindOfSet(s: RestSetKind): PrescribedSetType {
  const t = s.setType;
  if (t === 'feeder' || t === 'top' || t === 'backoff' || t === 'warmup' || t === 'drop') return t;
  if (s.isDrop === true) return 'drop';
  if (s.isWarmup === true) return 'warmup';
  return 'normal';
}

const isPrep = (t: PrescribedSetType) => t === 'warmup' || t === 'feeder';

/** 처방의 세트 방식 — 줄마다 같으면 그 방식, 섞였으면 표시가 있는 첫 줄의 방식. 「일반」(표시 없음)은 null. */
export function rxScheme(rx: PrescribedSet[] | null | undefined): SchemeId | null {
  if (!rx || rx.length === 0) return null;
  return schemeOf(rx) ?? rx.find((r) => r.scheme)?.scheme ?? null;
}

function transition(prev: PrescribedSetType, next: PrescribedSetType, scheme: SchemeId): Transition {
  if (next === 'warmup') return 'warmup';
  if (next === 'feeder') return 'feeder';
  if (next === 'top') return 'beforeTop';
  if (next === 'backoff') return prev === 'top' ? 'afterTop' : 'backoff';
  if (isPrep(prev)) return 'beforeWork'; // 일반·드롭 첫 세트
  if (next === 'drop') return 'drop';
  if (scheme === 'fiveByFive') return 'work';
  if (scheme === 'pyramid') return 'ramp';
  return 'base';
}

const isSlot = (t: Transition): t is RestSlot => t !== 'drop' && t !== 'base';

const validRest = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= REST_OVERRIDE_MAX;

/** 처방 줄들 → 사람이 정한 칸 값. 방식이 없는 처방은 빈 맵. */
export function restOverridesOf(rx: PrescribedSet[] | null | undefined): RestOverrides {
  const out: RestOverrides = {};
  const scheme = rxScheme(rx);
  if (!rx || !scheme) return out;
  for (let i = 1; i < rx.length; i++) {
    const tr = transition(rx[i - 1].setType, rx[i].setType, scheme);
    const v = rx[i].rest;
    if (isSlot(tr) && validRest(v) && out[tr] === undefined) out[tr] = Math.round(v);
  }
  return out;
}

/** 칸 값을 처방 줄에 적는다 — 맵에 있는 칸의 줄엔 값, 없는 칸의 줄에선 지운다. 새 배열을 돌려준다. */
export function withRestOverrides(rx: PrescribedSet[], ov: RestOverrides): PrescribedSet[] {
  const scheme = rxScheme(rx);
  return rx.map((r, i) => {
    const row: PrescribedSet = { ...r };
    delete row.rest;
    if (!scheme || i === 0) return row;
    const tr = transition(rx[i - 1].setType, r.setType, scheme);
    const v = isSlot(tr) ? ov[tr] : undefined;
    if (validRest(v)) row.rest = Math.round(v);
    return row;
  });
}

/** 두 칸 맵이 같은가. */
export function sameRestOverrides(a: RestOverrides | null | undefined, b: RestOverrides | null | undefined): boolean {
  return REST_SLOTS.every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));
}

/** 기억 덧씌우기 — 처방에 방식이 있고 사람이 정한 값이 하나도 없으면 지난 칸 값을 싣는다(자기 값이 있으면 그대로). */
export function applyRememberedRest(
  rx: PrescribedSet[] | null | undefined,
  ov: RestOverrides | null | undefined,
): PrescribedSet[] | null {
  if (!rx) return rx ?? null;
  if (!rxScheme(rx) || !ov || Object.keys(ov).length === 0) return rx;
  if (rx.some((r) => r.rest !== undefined)) return rx;
  return withRestOverrides(rx, ov);
}

/**
 * 처방 줄의 1RM % — 「탑의 %」 백오프는 탑 줄의 1RM % × 백오프 %. 모르면 null.
 * i = 세트를 **세트 번호 순으로 늘어놓은 자리**(잠금 refillable·planPrescribedLoadFills 와 같은 짝 규칙 · SPEC-051 리뷰).
 * 세트를 더해 처방 줄보다 많아진 자리는 짝이 없다(null — 무겁다고 보지 않는다).
 */
function pctOf1rm(rx: PrescribedSet[] | null | undefined, i: number): number | null {
  // [원본] const r = rx?.[i];
  const r = i >= 0 && rx && i < rx.length ? rx[i] : undefined;
  if (!r) return null;
  if (r.loadBasis === 'pct1rm' && r.loadPct != null) return r.loadPct;
  if (r.loadBasis === 'pctTop' && r.loadPct != null) {
    const top = rx?.find((x) => x.setType === 'top' && x.loadBasis === 'pct1rm' && x.loadPct != null);
    return top ? ((top.loadPct as number) * r.loadPct) / 100 : null;
  }
  return null;
}

const HEAVY_PCT = 78;

/** 칸의 기본값(사람 값 없이) — 시트의 「권장」 값이기도 하다. ramp 는 시작 값. */
function slotDefault(slot: RestSlot, scheme: SchemeId, fallback: number, ov: RestOverrides): number {
  switch (slot) {
    case 'warmup':
      return 45;
    case 'feeder':
      return 90;
    case 'beforeTop':
      return scheme === 'reversePyramid' ? 180 : 240;
    case 'afterTop':
      return 180;
    case 'backoff':
      return 150;
    case 'work':
      return Math.max(fallback, 180);
    case 'ramp':
      return 120;
    case 'beforeWork': {
      // 본세트 휴식과 같게(최소 120) — 5×5 는 본세트 사이, 피라미드는 첫 간격, 그 밖은 종목 휴식
      const work =
        scheme === 'fiveByFive'
          ? (ov.work ?? Math.max(fallback, 180))
          : scheme === 'pyramid'
            ? (ov.ramp ?? 120)
            : fallback;
      return Math.max(120, work);
    }
  }
}

export interface RestSlotRow {
  slot: RestSlot;
  /** 권장값(사람 값 없이) */
  def: number;
  /** 지금 값(사람 값이 있으면 그것) */
  value: number;
  changed: boolean;
}

/** 시트에 보일 칸 — 처방 줄에 나오는 칸만(REST_SLOTS 순서). 방식이 없으면 빈 배열(시트는 기본 한 줄). */
export function restSlotsOf(rx: PrescribedSet[] | null | undefined, fallback: number, ov?: RestOverrides): RestSlotRow[] {
  const scheme = rxScheme(rx);
  if (!rx || !scheme) return [];
  const mine = ov ?? restOverridesOf(rx);
  const present = new Set<RestSlot>();
  for (let i = 1; i < rx.length; i++) {
    const tr = transition(rx[i - 1].setType, rx[i].setType, scheme);
    if (isSlot(tr)) present.add(tr);
  }
  return REST_SLOTS.filter((s) => present.has(s)).map((slot) => {
    const def = slotDefault(slot, scheme, fallback, mine);
    const v = mine[slot];
    return { slot, def, value: v ?? def, changed: v !== undefined };
  });
}

/**
 * 세트를 마친 뒤 쉴 시간(초 · 0 = 타이머를 걸지 않는다).
 * sets = 블록 세트 전부(세트 번호 순) · doneIdx = 방금 마친 세트 자리 · rx = 블록 처방(세트 번호 순 자리) · fallback = 종목 휴식.
 */
// sets 는 세트 번호 순이어야 한다 — 처방 줄과의 짝은 그 자리(rx[i] ↔ sets[i])로 맞춘다(refillable 과 같은 규칙).
export function restBeforeNextSet(input: {
  sets: RestSetKind[];
  doneIdx: number;
  rx: PrescribedSet[] | null | undefined;
  fallback: number;
}): number {
  const { sets, doneIdx, rx, fallback } = input;
  const done = sets[doneIdx];
  if (!done) return fallback;
  const nextIdx = sets.findIndex((x, i) => i > doneIdx && x.done !== true);
  const scheme = rxScheme(rx);
  if (!scheme) {
    // [원본 규칙 그대로] 다음 세트가 처방 드롭이면 쉬지 않는다(SPEC-041 · REV-076 M-6) · 그 밖은 마친 세트 타입(REV-076 코치 7)
    const nextRxDrop = nextIdx >= 0 && rx?.[nextIdx]?.setType === 'drop' && sets[nextIdx].isDrop === true;
    if (nextRxDrop && done.isWarmup !== true) return 0;
    return restSecondsForRx((done.setType ?? null) as PrescribedSetType | null, fallback, rx?.[doneIdx] ?? null);
  }
  if (nextIdx < 0) return fallback; // 마지막 세트 뒤 — 종목 휴식
  const prevKind = kindOfSet(done);
  const nextKind = kindOfSet(sets[nextIdx]);
  // [원본] const tr = transition(prevKind, nextKind, scheme);
  // if (tr === 'drop') return 0;
  // [개선] 드롭 앞 0초는 **처방 줄도 드롭**일 때만 — 손으로 드롭을 표시한 세트는 종목 휴식으로(방식 없는 블록의 규칙과 같다 · SPEC-051 리뷰)
  let tr = transition(prevKind, nextKind, scheme);
  if (tr === 'drop') {
    if (rx?.[nextIdx]?.setType === 'drop') return 0;
    tr = 'base';
  }
  const ov = restOverridesOf(rx);
  if (isSlot(tr) && ov[tr] !== undefined) {
    if (tr !== 'ramp') return ov[tr] as number;
  }
  const heavyNext = (pctOf1rm(rx, nextIdx) ?? 0) >= HEAVY_PCT;
  switch (tr) {
    case 'base':
      return heavyNext ? Math.max(fallback, 180) : fallback;
    case 'backoff':
      return heavyNext ? 180 : 150;
    case 'ramp': {
      const base = ov.ramp ?? 120;
      const work = sets.map((s, i) => ({ k: kindOfSet(s), i })).filter((x) => x.k === 'normal');
      const j = work.findIndex((x) => x.i === nextIdx);
      if (j <= 0) return base;
      if (j === work.length - 1) return base + 60; // 마지막(가장 무거운) 직전
      return Math.min(base + 30 * (j - 1), base + 60);
    }
    case 'beforeWork': {
      if (scheme !== 'fiveByFive' && scheme !== 'pyramid')
        return Math.max(120, heavyNext ? Math.max(fallback, 180) : fallback);
      return slotDefault('beforeWork', scheme, fallback, ov);
    }
    default:
      return slotDefault(tr, scheme, fallback, ov);
  }
}

/**
 * 블록 안 세트 하나를 마쳤다고 보고 쉴 시간 — 잠금 카드 스냅숏(restAfterSec)이 쓴다(SPEC-051 · 화면·완료 흐름과 같은 함수).
 * 세트 번호 순으로 늘어놓고 그 세트를 끝낸 것으로 본다. 블록에서 못 찾으면 종목 휴식.
 */
export function restAfterInBlock(
  block: { sets: (RestSetKind & { id: string; setNumber: number })[]; rx: PrescribedSet[] | null | undefined; restSec: number },
  setId: string,
): number {
  const ordered = [...block.sets]
    .sort((x, y) => x.setNumber - y.setNumber)
    .map((x) => (x.id === setId ? { ...x, done: true } : x));
  const doneIdx = ordered.findIndex((x) => x.id === setId);
  if (doneIdx < 0) return block.restSec;
  return restBeforeNextSet({ sets: ordered, doneIdx, rx: block.rx, fallback: block.restSec });
}
