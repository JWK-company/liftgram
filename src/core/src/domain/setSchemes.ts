// 세트 방식(SPEC-041 · SRS-105) — 종목의 세트를 이름 있는 틀(탑세트+백오프·5×5·피라미드…)로 짠다. 순수 로직.
//
// 처방은 사람이 쓴다(ADR-028). 세트 방식은 사람이 고르는 틀이고, 이 모듈은 고른 틀을 처방 줄로 펼치기만 한다.
// 무게는 「추정 1RM 의 N%」(pct1rm)로 적는다 — 횟수마다 들 수 있는 무게가 달라서, 같은 「100%」로 6회와 10회를
// 채우면 한쪽은 못 드는 무게가 된다(REV 스펙 리뷰 · 코치 1). 백오프는 그날 탑세트의 N%(pctTop)다.
// [원본] 퍼센트는 목표 횟수의 한계 무게(10회 ≈ 1RM 75% · 6회 ≈ 85% · 5회 ≈ 87% · 3회 ≈ 93%)에서 한두 개 남기도록 몇 % 낮췄다.
// [개선] 앱의 1RM 추정식(Epley) 기준 한계 무게 — 10회 75% · 8회 79% · 6회 83% · 5회 86% · 3회 91% — 에서
//   목표 횟수의 위쪽 끝을 한두 개 남기도록 낮췄다(REV-076 코치 4 · 84%×6 은 처음부터 한계를 넘었다).
// 5×5 의 80% 는 다섯 세트 피로를 감안한 값이다.
// 기록이 없으면 무게를 채우지 않는다 — 첫 작업 세트를 하면 그 세트로 1RM 을 추정해 나머지를 채운다(기존 흐름).
//
// 「일반」은 세트 방식 표시가 없는 표다(무게는 지난 기록부터 — 세트 방식 전 동작 그대로).
import type { PrescribedSet, PrescribedSetType, SchemeId } from './prescription';

interface TplRow {
  t: PrescribedSetType;
  /** 추정 1RM 의 % */
  pct?: number;
  /** 그날 탑세트의 % */
  top?: number;
  reps?: [number, number];
  amrap?: true;
}

export interface SchemeDef {
  id: SchemeId;
  rows: TplRow[];
}

// [근거] 탑+백오프: 숙련자 실험(싱글 + 탑의 80% 백오프)·백오프 리뷰 · 5×5: 선형 증량 관행(웜업 40·60·80% 계단)
//       피라미드·역피라미드: 일반 세트와 결과가 비슷 — 고르는 기준은 선호·변화 · 드롭세트: 메타분석상 효과 비슷, 시간 절약
const W = (pct: number, reps: number): TplRow => ({ t: 'warmup', pct, reps: [reps, reps] });
export const SCHEMES: SchemeDef[] = [
  {
    id: 'straight',
    rows: [
      { t: 'normal', reps: [8, 10] },
      { t: 'normal', reps: [8, 10] },
      { t: 'normal', reps: [8, 10] },
    ],
  },
  {
    id: 'topBackoff',
    rows: [
      W(40, 10),
      W(60, 5),
      { t: 'feeder', pct: 75, reps: [2, 2] },
      { t: 'top', pct: 82, reps: [3, 5] },
      { t: 'backoff', top: 85, reps: [6, 8] },
    ],
  },
  {
    id: 'fiveByFive',
    rows: [
      W(40, 5),
      W(60, 3),
      W(70, 2),
      ...Array.from({ length: 5 }, (): TplRow => ({ t: 'normal', pct: 80, reps: [5, 5] })),
    ],
  },
  {
    id: 'pyramid',
    rows: [
      W(40, 10),
      { t: 'normal', pct: 65, reps: [10, 12] },
      { t: 'normal', pct: 72, reps: [8, 10] },
      { t: 'normal', pct: 78, reps: [6, 8] },
      // [원본] { t: 'normal', pct: 84, reps: [4, 6] },
      { t: 'normal', pct: 82, reps: [4, 5] },
    ],
  },
  {
    id: 'reversePyramid',
    rows: [
      W(40, 10),
      W(60, 5),
      { t: 'feeder', pct: 75, reps: [1, 1] },
      // [원본] { t: 'top', pct: 84, reps: [4, 6] },
      { t: 'top', pct: 82, reps: [4, 6] },
      { t: 'backoff', top: 90, reps: [6, 8] },
      { t: 'backoff', top: 80, reps: [8, 10] },
    ],
  },
  {
    id: 'dropSet',
    rows: [
      W(40, 10),
      { t: 'normal', pct: 70, reps: [8, 10] },
      { t: 'normal', pct: 70, reps: [8, 10] },
      { t: 'drop', pct: 52, amrap: true },
      { t: 'drop', pct: 38, amrap: true },
    ],
  },
];

const byId = new Map(SCHEMES.map((s) => [s.id, s]));

export function schemeDef(id: SchemeId): SchemeDef | undefined {
  return byId.get(id);
}

/** 드롭세트는 바벨류·맨몸에 권하지 않는다 — 무게를 빨리 내리기 어렵고, 한계까지 혼자 하면 위험하다. */
// [원본] const DROP_BLOCKED = new Set(['barbell', 'smith', 'ezbar', 'trapbar', 'bodyweight']);
// [개선] 케틀벨도 — 무게 칸이 4kg 단위라 52%·38% 로 내릴 수 없다(REV-076 코치 8)
const DROP_BLOCKED = new Set(['barbell', 'smith', 'ezbar', 'trapbar', 'bodyweight', 'kettlebell']);
export function schemeAllowed(id: SchemeId, equipment: string | null | undefined): boolean {
  if (id === 'dropSet') return !DROP_BLOCKED.has(equipment ?? '');
  return true;
}

function toRow(id: SchemeId, r: TplRow, allowLoad: boolean): PrescribedSet {
  const out: PrescribedSet = {
    setType: r.t,
    targetRir: null,
    repMin: r.amrap ? null : (r.reps?.[0] ?? null),
    repMax: r.amrap ? null : (r.reps?.[1] ?? null),
    loadHint: null,
  };
  if (r.amrap) out.amrap = true;
  if (allowLoad && r.pct != null) {
    out.loadBasis = 'pct1rm';
    out.loadPct = r.pct;
  } else if (allowLoad && r.top != null) {
    out.loadBasis = 'pctTop';
    out.loadPct = r.top;
  }
  if (id !== 'straight') out.scheme = id;
  return out;
}

/** 세트 방식 → 처방 줄. allowLoad=false(맨몸·어시스트)면 무게 기준 없이 타입·횟수만. 「일반」은 표시 없는 3세트 표. */
export function schemeRows(id: SchemeId, opts: { allowLoad: boolean }): PrescribedSet[] {
  const def = byId.get(id);
  if (!def) return [];
  return def.rows.map((r) => toRow(id, r, opts.allowLoad));
}

/** 표의 세트 방식 — 모든 줄이 같은 방식이면 그 방식, 아니면 null(일반·직접 구성). */
export function schemeOf(rows: PrescribedSet[] | null | undefined): SchemeId | null {
  if (!rows || rows.length === 0) return null;
  const s = rows[0].scheme;
  if (!s) return null;
  return rows.every((r) => r.scheme === s) ? s : null;
}

/** 방식이 붙어 있는데 틀과 다르게 고쳤나 — 저장하지 않고 계산한다(타입·횟수·최대·무게 기준·%). */
export function isSchemeEdited(rows: PrescribedSet[] | null | undefined, opts: { allowLoad: boolean }): boolean {
  const id = schemeOf(rows);
  if (!id || !rows) return false;
  const tpl = schemeRows(id, opts);
  if (tpl.length !== rows.length) return true;
  return tpl.some((t, i) => {
    const r = rows[i];
    const repsDiffer = !t.amrap && ((t.repMin ?? null) !== (r.repMin ?? null) || (t.repMax ?? null) !== (r.repMax ?? null));
    return (
      t.setType !== r.setType ||
      !!t.amrap !== !!r.amrap ||
      (t.loadBasis ?? null) !== (r.loadBasis ?? null) ||
      (t.loadPct ?? null) !== (r.loadPct ?? null) ||
      repsDiffer
    );
  });
}

/** 기준에서 뺄 세트 — 웜업·피더는 준비 세트, 드롭은 내린 무게다. */
const isPrep = (t: PrescribedSetType) => t === 'warmup' || t === 'feeder';

export interface DoneSetKind {
  /** 세션 세트의 지금 타입 — warmup·feeder·top·backoff·drop·normal */
  setType: PrescribedSetType;
  /** 웜업 표시(피더도 켜진다) — 타입 칸이 비어 있어도 준비 세트로 센다 */
  isWarmup?: boolean;
}

const isPrepDone = (d: DoneSetKind) => d.isWarmup === true || isPrep(d.setType);

/**
 * 운동 중 바꾸기 — 끝낸 세트는 그대로 두고 남은 자리에 넣을 줄. 끝낸 준비 세트(웜업·피더) 수만큼 틀의 준비 줄을,
 * 끝낸 작업 세트마다 틀의 작업 줄을 하나씩 뺀다(같은 타입 줄이 먼저 · 탑은 탑을 끝냈을 때만 뺀다).
 * 작업 세트를 이미 했으면 남은 준비 줄도 뺀다(몸은 이미 데워졌다).
 * 탑 없이 「탑의 %」 백오프만 남으면 채울 근거가 없다 — 그 줄은 「1RM 의 %」(틀의 탑 % × 백오프 %)로 바꾼다(REV-075).
 */
export function remainingSchemeRows(id: SchemeId, done: DoneSetKind[], opts: { allowLoad: boolean }): PrescribedSet[] {
  const tpl = schemeRows(id, opts);
  const prepDone = done.filter(isPrepDone);
  const workDone = done.filter((d) => !isPrepDone(d));
  const removed = new Set<number>();
  if (workDone.length > 0) {
    tpl.forEach((r, i) => {
      if (isPrep(r.setType)) removed.add(i);
    });
  } else {
    let left = prepDone.length;
    tpl.forEach((r, i) => {
      if (left > 0 && isPrep(r.setType)) {
        removed.add(i);
        left -= 1;
      }
    });
  }
  // [원본] 같은 타입 → 탑 아닌 첫 줄 → 아무 줄 — 일반 세트가 드롭·백오프를 먼저 지워 80% 다음 38% 드롭만 남거나,
  //   탑+백오프가 통째로 사라졌다(REV-076 코치 5).
  // [개선] 같은 타입 줄이 먼저 · 일반 세트는 일반·백오프 줄만(앞에서부터) 지운다 · 탑·드롭은 같은 타입 세트만 지운다.
  for (const d of workDone) {
    const open = tpl.map((r, i) => ({ r, i })).filter(({ r, i }) => !removed.has(i) && !isPrep(r.setType));
    const pick =
      open.find(({ r }) => r.setType === d.setType) ??
      (d.setType === 'normal' || d.setType === 'backoff'
        ? open.find(({ r }) => r.setType === 'normal' || r.setType === 'backoff')
        : undefined);
    if (pick) removed.add(pick.i);
  }
  const out = tpl.filter((_, i) => !removed.has(i));
  const topDone = done.some((d) => d.setType === 'top');
  if (!topDone && !out.some((r) => r.setType === 'top')) {
    const topPct = tpl.find((r) => r.setType === 'top')?.loadPct;
    return out.map((r) =>
      r.loadBasis === 'pctTop' && topPct != null && r.loadPct != null
        ? { ...r, loadBasis: 'pct1rm' as const, loadPct: Math.round((topPct * r.loadPct) / 100) }
        : r,
    );
  }
  return out;
}

/** 칩·태그에 쓰는 글자 — 일반은 번호, 나머지는 한 글자(피더는 P — F 는 실패 세트가 쓴다). */
export const SET_TYPE_GLYPH: Record<Exclude<PrescribedSetType, 'normal'>, string> = {
  warmup: 'W',
  feeder: 'P',
  top: 'T',
  backoff: 'B',
  drop: 'D',
};
