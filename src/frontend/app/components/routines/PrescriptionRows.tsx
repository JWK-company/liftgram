"use client";
// @plm SRS-043  세트별 처방 행 — app의 features/routines/PrescriptionRows.tsx를 웹으로
//
// 루틴 편집기(로컬 저장)와 코칭 화면(원격 저장)이 **같이 쓰는** 표현 전용 컴포넌트다.
// 저장은 부르는 쪽 책임이고, 여기서는 행을 보여 주고 고치는 것만 한다.
//
// [개선] 세트 표(SPEC-023) — 운동 화면처럼 줄마다 타입·무게·횟수를 넣는다. 표의 무게는 시작 값이고 지난 기록이 먼저다.
// 숫자 칸은 초안을 두고 칸을 떠날 때 올린다(「8」→「80」 중간값이 저장되지 않게). 줄 key 는 자리가 아니라 줄의 정체성이다.
import type { PrescribedSet, PrescribedSetType } from "@app/core";
import type { SchemeId } from "@app/core/domain/prescription";
import { roundLoadKg } from "@app/core/domain/prescription";
import { isSchemeEdited, SCHEMES, schemeAllowed, schemeOf, schemeRows } from "@app/core/domain/setSchemes";
import { displayWeight } from "@app/core";
import { enteredWeightToKg } from "@app/core/domain/blockUnit";
import { LOAD_KG_MAX, LOAD_PCT_RANGE } from "@app/core/domain/prescription";
import {
  effortGoalOf,
  emptySetRow,
  rowHasMeaning,
  ROUTINE_SETS_MAX,
  withEffortGoal,
} from "@app/core/domain/routineSets";
import { useEffect, useRef, useState } from "react";
import { markCoachMarkSeen } from "@/lib/coachMarks";
import { t } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { ActionSheet } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { SelectChip } from "../ui/RecordSlotSelector";
import { AppText } from "../ui/primitives";
import { keepSelectAllOnMouseUp, selectAllOnFocus } from "../ui/selectAllOnFocus";
import { copyTargetIndexes, isPrepSetType } from "@app/core/domain/copySetValues";

/** 칩 요약에 쓰는 한 글자 — "W W T B" 식으로 이어 붙인다. */
export const RX_SUMMARY_CHAR: Record<PrescribedSetType, string> = {
  normal: "·",
  warmup: "W",
  top: "T",
  backoff: "B",
  drop: "D",
  feeder: "P", // SPEC-041 — F 는 운동 화면의 실패 세트
};

export function emptyRxRow(): PrescribedSet {
  return emptySetRow();
}

export function rxSummary(rx: PrescribedSet[] | null | undefined): string | null {
  if (!rx || rx.length === 0) return null;
  return rx.map((r) => RX_SUMMARY_CHAR[r.setType] ?? "·").join(" ");
}

/** 한 행이라도 뜻이 있으면 처방이다(루틴·코칭이 같은 판정을 쓴다). */
export function rxMeaningful(rows: PrescribedSet[]): boolean {
  return rows.some(rowHasMeaning);
}

// [원본] const SET_TYPES: PrescribedSetType[] = ["normal", "warmup", "drop", "top", "backoff"];
// [개선] 루틴은 피더까지 여섯(SPEC-041) · 코칭 계약에는 피더가 없어 코치 화면은 다섯 그대로
const SET_TYPES: PrescribedSetType[] = ["normal", "warmup", "feeder", "top", "backoff", "drop"];
const COACH_SET_TYPES: PrescribedSetType[] = ["normal", "warmup", "drop", "top", "backoff"];
const TYPE_LABEL = {
  normal: "session.setType.normal",
  warmup: "session.setType.warmup",
  drop: "session.setType.drop",
  top: "session.setType.top",
  backoff: "session.setType.backoff",
  feeder: "session.setType.feeder",
} as const;

/** 표 이름 — 세트 방식이 붙어 있으면 그 이름, 아니면 일반 모양이면 「일반」, 그 밖은 「직접 구성」(SPEC-041). */
function schemeChipName(rows: PrescribedSet[], allowLoad: boolean): string {
  const id = schemeOf(rows);
  if (id) {
    const name = t(`scheme.name.${id}` as Parameters<typeof t>[0]);
    return isSchemeEdited(rows, { allowLoad }) ? `${name} · ${t("scheme.edited")}` : name;
  }
  const plain = rows.every(
    (r) => r.setType === "normal" && !r.amrap && (!r.loadBasis || r.loadBasis === "start"),
  );
  return plain ? t("scheme.name.straight") : t("scheme.custom");
}
const EFFORT_VALUES = [0, 1, 2, 3, 4];
const cellClass =
  "h-[44px] w-full min-w-0 rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-surface) px-[2px] text-center text-(--color-ink)";

/** 숫자 칸 — 입력 중에는 초안만 바뀌고, 칸을 떠나거나 Enter 에 올린다. 포커스 중에는 밖의 값으로 덮지 않는다. */
function NumCell({
  value,
  decimal,
  onCommit,
  testId,
  label,
  placeholder = "–",
}: {
  value: string;
  decimal?: boolean;
  onCommit: (text: string) => void;
  testId: string;
  label: string;
  /** 빈칸에 보일 글자 — 「최대」 줄·계산 무게(SPEC-041) */
  placeholder?: string;
}) {
  // [원본] 초안을 항상 두고 포커스가 아닐 때 value 로 맞췄다 — 저장값이 그대로면(잘못된 입력) 칸에 초안이 남고,
  // 포커스만 둔 칸이 옛 값을 되덮었다. 입력 중에만 초안을 보이고, 고친 칸만 올린다(REV-028).
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const dirty = useRef(false);
  const latest = useRef({ draft, onCommit });
  latest.current = { draft, onCommit };
  // 칸을 떠나지 않은 채 화면이 사라져도(기기 뒤로) 입력을 잃지 않는다
  useEffect(
    () => () => {
      if (!dirty.current) return;
      dirty.current = false;
      latest.current.onCommit(latest.current.draft);
    },
    [],
  );
  return (
    <input
      inputMode={decimal ? "decimal" : "numeric"}
      placeholder={placeholder}
      aria-label={label}
      data-testid={testId}
      value={editing ? draft : value}
      // [원본] onFocus={() => { setDraft(value); setEditing(true); }} — 누른 자리에 커서만 놓였다
      // [개선] 숫자 전체를 선택해 바로 새로 친다(SPEC-042)
      onFocus={(e) => {
        setDraft(value);
        setEditing(true);
        selectAllOnFocus(e);
      }}
      onMouseUp={keepSelectAllOnMouseUp}
      onChange={(e) => {
        dirty.current = true;
        setDraft(e.target.value);
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onBlur={() => {
        setEditing(false);
        if (!dirty.current) return;
        dirty.current = false;
        if (draft !== value) onCommit(draft);
      }}
      className={cellClass}
    />
  );
}

export function PrescriptionRows({
  rows,
  onChange,
  allowLoad = true,
  unit = "kg",
  weightLabel,
  mode = "routine",
  fixedMultiplier = 1,
  equipment = null,
  est1rmKg = 0,
}: {
  rows: PrescribedSet[];
  onChange: (next: PrescribedSet[]) => void;
  /** 무게 칸을 둘 것인가 — 맨몸·어시스트는 스테퍼 하나로 받는다(SRS-063). */
  allowLoad?: boolean;
  unit?: "kg" | "lb";
  weightLabel?: string;
  /** coach = 코칭 저장 — 계약에 시작 무게가 없어 무게 칸은 고정 무게다(SPEC-023). */
  mode?: "routine" | "coach";
  /** 한쪽 입력 배수 — 고정 무게는 저장이 합계라 칸에는 나눠 보인다(세션 채우기와 같은 뜻 · REV-028). 시작 값은 입력값 그대로다. */
  fixedMultiplier?: number;
  /** 종목 기구 — 세트 방식 제한(바벨류 드롭세트 등 · SPEC-041) */
  equipment?: string | null;
  /** 추정 1RM(계산 kg · 없으면 0) — 「1RM 의 %」 줄에 계산 무게를 보인다 */
  est1rmKg?: number;
}) {
  // 줄의 정체성 — 가운데 줄을 지워도 초안이 옆 줄로 옮겨 가지 않게.
  const nextKey = useRef(0);
  const keysRef = useRef<number[]>([]);
  if (keysRef.current.length !== rows.length) {
    keysRef.current = rows.map((_, i) => keysRef.current[i] ?? nextKey.current++);
  }
  const [typeRow, setTypeRow] = useState<number | null>(null);
  const [menuRow, setMenuRow] = useState<number | null>(null);
  // [원본] const [offerKg, setOfferKg] = useState<number | null>(null); — 「나머지 일반 세트도 Nkg」(무게만)
  // [개선] 「다른 세트도 똑같이」 — 방금 고친 줄의 무게·횟수를 같은 갈래(준비/작업) 다른 줄에(SPEC-042 · SRS-106)
  const [offerRow, setOfferRow] = useState<number | null>(null);
  // 세트 방식(SPEC-041) — 루틴 편집에서만. 고르기 직전 표를 한 번 되돌릴 수 있다.
  const [schemeOpen, setSchemeOpen] = useState(false);
  const [undoRows, setUndoRows] = useState<PrescribedSet[] | null>(null);
  const routine = mode === "routine";
  const emit = (next: PrescribedSet[]) => {
    setUndoRows(null);
    onChange(next);
  };
  const resetKeys = (n: number) => {
    keysRef.current = Array.from({ length: n }, () => nextKey.current++);
  };
  const applyScheme = (id: SchemeId) => {
    const next = schemeRows(id, { allowLoad });
    if (next.length === 0) return;
    setOfferRow(null);
    resetKeys(next.length);
    setUndoRows(rows);
    onChange(next);
  };
  const undoScheme = () => {
    if (!undoRows) return;
    const prev = undoRows;
    setUndoRows(null);
    resetKeys(prev.length);
    onChange(prev);
  };
  /** 「1RM 의 %」 줄의 계산 무게(표시 단위 · 한쪽 입력이면 나눈다) — 추정 1RM 이 없으면 null */
  const pctKgShown = (r: PrescribedSet): string | null => {
    if (r.loadBasis !== "pct1rm" || !est1rmKg || est1rmKg <= 0 || r.loadPct == null) return null;
    const kg = roundLoadKg((est1rmKg * r.loadPct) / 100, equipment, unit);
    return kg > 0 ? String(displayWeight(kg / (fixedMultiplier || 1), unit)) : null;
  };

  const patch = (i: number, p: Partial<PrescribedSet>) => {
    setOfferRow(null);
    emit(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  };
  const directBasis = mode === "coach" ? "fixed" : "start";
  const followsDirect = (r: PrescribedSet) =>
    !r.loadBasis || r.loadBasis === "start" || (mode === "coach" && r.loadBasis === "fixed");

  const commitWeight = (i: number, text: string) => {
    const r = rows[i];
    const n = Number.parseFloat(text.replace(",", "."));
    // [개선] 루틴 편집의 % 줄은 칸에 계산 무게를 보인다 — 숫자를 넣으면 그 줄은 시작 무게가 된다(수정함 · SPEC-041)
    if (routine && (r.loadBasis === "pct1rm" || r.loadBasis === "pctTop")) {
      if (Number.isNaN(n) || n <= 0) return;
      const kg = enteredWeightToKg(n, unit, Number.NaN);
      if (kg == null) return;
      patch(i, {
        loadBasis: "start",
        loadKg: Math.round(Math.min(LOAD_KG_MAX, kg) * 10000) / 10000,
        loadPct: undefined,
      });
      setOfferRow(i);
      return;
    }
    if (r.loadBasis === "pct1rm" || r.loadBasis === "pctTop") {
      if (Number.isNaN(n)) return;
      const [lo, hi] = LOAD_PCT_RANGE[r.loadBasis];
      patch(i, { loadPct: Math.min(hi, Math.max(lo, Math.round(n))) });
      setOfferRow(i);
      return;
    }
    if (Number.isNaN(n) || n <= 0) {
      patch(i, { loadBasis: undefined, loadKg: undefined });
      return;
    }
    const fixedRow = r.loadBasis === "fixed";
    const scale = fixedRow ? fixedMultiplier : 1;
    const kg = enteredWeightToKg(n, unit, r.loadKg != null ? r.loadKg / scale : Number.NaN);
    if (kg == null) return;
    // lb 왕복 꼬리를 저장 규칙(넷째 자리)과 맞춘다 — 저장 뒤 서명이 어긋나 표가 다시 그려지지 않게
    const clamped = Math.round(Math.min(LOAD_KG_MAX / scale, kg) * 10000) / 10000;
    patch(i, { loadBasis: fixedRow ? "fixed" : directBasis, loadKg: clamped * scale });
    // [원본] const others = rows.some((x, j) => j !== i && x.setType === "normal" && followsDirect(x) && x.loadKg !== clamped);
    // [원본] setOfferKg(r.setType === "normal" && others ? clamped : null);
    setOfferRow(i);
  };

  const commitRep = (i: number, key: "repMin" | "repMax", text: string) => {
    const n = Number.parseInt(text, 10);
    patch(i, { [key]: Number.isNaN(n) || n <= 0 ? null : n } as Partial<PrescribedSet>);
    setOfferRow(i);
  };
  /** 「최대」 줄 — 숫자를 실제로 넣어야 풀린다(비운 채 나오면 그대로 · REV-074). */
  const commitAmrap = (i: number, text: string) => {
    const n = Number.parseInt(text, 10);
    if (Number.isNaN(n) || n <= 0) return;
    patch(i, { amrap: undefined, repMin: n, repMax: n });
    setOfferRow(i);
  };

  // ── 다른 세트도 똑같이(SPEC-042) — 무게(기준·값·%)와 횟수(최소·최대·최대 반복)를 그대로 ──
  const copyValueOf = (r: PrescribedSet) => ({
    loadBasis: allowLoad ? (r.loadBasis ?? null) : null,
    loadKg: allowLoad ? (r.loadKg ?? null) : null,
    loadPct: allowLoad ? (r.loadPct ?? null) : null,
    repMin: r.repMin ?? null,
    repMax: r.repMax ?? null,
    amrap: r.amrap === true,
  });
  type CopyValue = ReturnType<typeof copyValueOf>;
  // 빈 칸은 복사하지 않는다 — 무게만 적고 누르면 다른 줄의 횟수는 그대로(REV-077 C-1)
  const hasLoad = (v: CopyValue) => v.loadBasis != null;
  const hasReps = (v: CopyValue) => v.amrap || v.repMin != null || v.repMax != null;
  const sameLoad = (a: CopyValue, b: CopyValue) =>
    a.loadBasis === b.loadBasis && a.loadKg === b.loadKg && a.loadPct === b.loadPct;
  const sameReps = (a: CopyValue, b: CopyValue) =>
    a.repMin === b.repMin && a.repMax === b.repMax && a.amrap === b.amrap;
  const copyTargets = (i: number): number[] => {
    const src = rows[i];
    if (!src) return [];
    const v = copyValueOf(src);
    if (!hasLoad(v) && !hasReps(v)) return [];
    return copyTargetIndexes(
      rows.map((r) => ({ prep: isPrepSetType(r.setType), open: true, value: copyValueOf(r) })),
      i,
      (a, b) => (!hasLoad(b) || sameLoad(a, b)) && (!hasReps(b) || sameReps(a, b)),
    );
  };
  const copyFrom = (i: number) => {
    const targets = new Set(copyTargets(i));
    if (!targets.size) return;
    const v = copyValueOf(rows[i]);
    setOfferRow(null);
    emit(
      rows.map((x, j) => {
        if (!targets.has(j)) return x;
        const next: PrescribedSet = { ...x };
        if (hasReps(v)) {
          next.repMin = v.repMin;
          next.repMax = v.repMax;
          if (v.amrap) next.amrap = true;
          else delete next.amrap;
        }
        if (allowLoad && hasLoad(v)) {
          if (v.loadBasis) next.loadBasis = v.loadBasis;
          else delete next.loadBasis;
          if (v.loadKg != null) next.loadKg = v.loadKg;
          else delete next.loadKg;
          if (v.loadPct != null) next.loadPct = v.loadPct;
          else delete next.loadPct;
        }
        return next;
      }),
    );
  };

  const remove = (i: number) => {
    if (rows.length <= 1) return;
    keysRef.current = keysRef.current.filter((_, idx) => idx !== i);
    setOfferRow(null);
    emit(rows.filter((_, idx) => idx !== i));
  };

  // 세트 휴지통 — 입력 중인 칸이 있으면 먼저 올리고(blur) 다음 그림의 표에서 지운다.
  // 버튼을 눌러도 칸이 blur 되지 않는 기기(iOS)에서 사라지는 칸이 옛 표로 값을 올려 지운 줄이 되살아나지 않게(리뷰 #1).
  const removeRef = useRef(remove);
  removeRef.current = remove;
  const tableRef = useRef<HTMLDivElement>(null);
  const focusAfterRemove = useRef<number | null>(null);
  const removeFromTrash = (i: number) => {
    const a = document.activeElement;
    if (a instanceof HTMLInputElement && tableRef.current?.contains(a)) a.blur();
    focusAfterRemove.current = i;
    setTimeout(() => removeRef.current(i), 0);
  };
  // 지운 뒤 포커스 — 같은 자리(없으면 위) 줄의 🗑, 한 줄만 남으면 그 줄 번호(리뷰 #4)
  // biome-ignore lint/correctness/useExhaustiveDependencies: 줄 수가 바뀐 그림 뒤에 한 번 — 값은 ref 로 읽는다
  useEffect(() => {
    const i = focusAfterRemove.current;
    if (i == null) return;
    focusAfterRemove.current = null;
    const rowEls = tableRef.current?.querySelectorAll('[data-testid="set-table-row"]');
    const row = rowEls?.[Math.min(i, rowEls.length - 1)];
    const target =
      row?.querySelector<HTMLElement>('[data-testid="rx-remove"]') ??
      row?.querySelector<HTMLElement>('[data-testid="rx-type"]');
    target?.focus();
  }, [rows.length]);

  const addSet = () => {
    if (rows.length >= ROUTINE_SETS_MAX) return;
    const last = rows[rows.length - 1];
    const goal = effortGoalOf(rows);
    const tableScheme = schemeOf(rows);
    const next: PrescribedSet = {
      ...emptySetRow(),
      // [원본] targetRir: typeof goal === "number" ? goal : null, — 루틴 편집은 강도 목표를 안 보이니 물려주지 않는다(REV-076 M-5)
      targetRir: !routine && typeof goal === "number" ? goal : null,
      // 표에 세트 방식이 있으면 새 줄에도 — 한 줄 더해도 「<방식> · 수정함」으로 남는다(REV-076 M-3)
      ...(tableScheme ? { scheme: tableScheme } : {}),
      repMin: last?.repMin ?? null,
      repMax: last?.repMax ?? null,
      ...(last?.loadBasis === "start" || last?.loadBasis === "fixed"
        ? { loadBasis: last.loadBasis, loadKg: last.loadKg }
        : {}),
    };
    keysRef.current = [...keysRef.current, nextKey.current++];
    setOfferRow(null);
    emit([...rows, next]);
  };

  const addWarmup = () => {
    if (rows.length >= ROUTINE_SETS_MAX) return;
    keysRef.current = [nextKey.current++, ...keysRef.current];
    setOfferRow(null);
    // [원본] emit([{ ...emptySetRow(), setType: "warmup" }, ...rows]);
    const tableScheme = schemeOf(rows);
    emit([{ ...emptySetRow(), setType: "warmup", ...(tableScheme ? { scheme: tableScheme } : {}) }, ...rows]);
  };

  // [원본] const applyOffer = () => {
  // [원본]   if (offerKg == null) return;
  // [원본]   const kg = offerKg;
  // [원본]   setOfferRow(null);
  // [원본]   emit(
  // [원본]     rows.map((x) =>
  // [원본]       x.setType === "normal" && followsDirect(x) ? { ...x, loadBasis: directBasis, loadKg: kg } : x,
  // [원본]     ),
  // [원본]   );
  // [원본] };

  const pickBasis = (i: number, basis: "start" | "fixed" | "pct1rm" | "pctTop") => {
    const r = rows[i];
    if (basis === "pct1rm" || basis === "pctTop") {
      patch(i, { loadBasis: basis, loadPct: basis === "pct1rm" ? 80 : 90, loadKg: undefined });
    } else if (basis === "fixed") {
      // [원본] loadKg: r.loadKg ?? 20 — 한쪽 입력이면 칸의 값이 절반이 됐고, lb 칸에는 44.09 가 떴다
      if (r.loadBasis === "fixed") return;
      const entered =
        r.loadKg != null && r.loadKg > 0
          ? r.loadKg
          : (enteredWeightToKg(unit === "lb" ? 45 : 20, unit, Number.NaN) ?? 20);
      patch(i, {
        loadBasis: "fixed",
        loadKg: Math.min(LOAD_KG_MAX, entered * fixedMultiplier),
        loadPct: undefined,
      });
    } else {
      const entered = r.loadBasis === "fixed" && r.loadKg ? r.loadKg / fixedMultiplier : r.loadKg;
      patch(i, {
        loadBasis: entered ? "start" : undefined,
        loadKg: entered || undefined,
        loadPct: undefined,
      });
    }
  };

  /** 타입을 바꾸면 강도 목표도 맞춘다 — 웜업·드롭은 비우고, 작업 세트가 되면 나머지 줄의 목표를 따른다(REV-028). */
  const pickType = (i: number, type: PrescribedSetType) => {
    const r = rows[i];
    // [개선] 피더도 준비 세트 — 강도 목표를 두지 않는다(SPEC-041)
    const working = type !== "warmup" && type !== "drop" && type !== "feeder";
    const wasWorking = r.setType !== "warmup" && r.setType !== "drop" && r.setType !== "feeder";
    const rest = rows.filter((_, j) => j !== i);
    // [원본] const others = rest.filter((x) => x.setType !== "warmup" && x.setType !== "drop");
    const others = rest.filter(
      (x) => x.setType !== "warmup" && x.setType !== "drop" && x.setType !== "feeder",
    ); // REV-076 L-3
    const restGoal = effortGoalOf(rest);
    const targetRir = !working
      ? null
      : others.length > 0 && typeof restGoal === "number"
        ? restGoal
        : others.length > 0 && restGoal === null
          ? null
          : wasWorking
            ? r.targetRir
            : null;
    // [원본] patch(i, { setType: type, targetRir }); — 루틴 편집은 강도 목표를 다루지 않는다(타입만 · REV-076 M-5)
    patch(i, routine ? { setType: type } : { setType: type, targetRir });
  };

  const goal = effortGoalOf(rows);
  const effortChips = [
    ...EFFORT_VALUES,
    ...(typeof goal === "number" && !EFFORT_VALUES.includes(goal) ? [goal] : []),
  ];
  let normal = 0;

  return (
    <div data-testid="set-table" ref={tableRef}>
      {/* 세트 방식(SPEC-041) — 루틴 편집에서만. 코칭은 지금 처방 화면 그대로다. */}
      {routine ? (
        <div className="flex flex-col gap-[4px] pb-[var(--spacing-xs)]">
          <button
            type="button"
            data-testid="scheme-chip"
            data-scheme={schemeOf(rows) ?? ""}
            onClick={() => setSchemeOpen(true)}
            // [원본] className="… rounded-full border border-(--color-line) bg-(--color-surface-alt) px-[14px]" — 누르는 값 칩(판 유지) · [개선] 둥근 정도는 토큰(SPEC-056 F2)
            className="flex min-h-[44px] items-center self-start rounded-[var(--radius-pill)] border border-(--color-line) bg-(--color-surface-alt) px-[14px]"
          >
            <AppText variant="label" color="text">
              {t("scheme.chip", { name: schemeChipName(rows, allowLoad) })} ▾
            </AppText>
          </button>
          {/* [원본] {schemeOf(rows) ? (
            <AppText variant="caption" color="textMuted" data-testid="scheme-guide">
              {t(`scheme.guide.${schemeOf(rows)}` as Parameters<typeof t>[0])}
              {rows.some((r) => r.setType === "feeder") ? ` · ${t("scheme.legendFeeder")}` : ""}
            </AppText>
          ) : null} */}
          {/* [개선] 설명 줄 없앰(SPEC-055 Phase 4) — 세트 줄 「P」 글자를 푸는 범례만 남긴다(피더가 있을 때 · 문구 리뷰 M4) */}
          {rows.some((r) => r.setType === "feeder") ? (
            <AppText variant="caption" color="textMuted" data-testid="scheme-legend">
              {t("scheme.legendFeeder")}
            </AppText>
          ) : null}
          {undoRows ? (
            <div className="flex items-center gap-[var(--spacing-sm)]" data-testid="scheme-undo-bar">
              <AppText variant="caption" color="textMuted">
                {t("scheme.changed")}
              </AppText>
              <button
                type="button"
                data-testid="scheme-undo"
                onClick={undoScheme}
                className="min-h-[44px] px-[var(--spacing-sm)]"
              >
                <AppText variant="label" color="primary" className="font-bold">
                  {t("scheme.undo")}
                </AppText>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-[4px] pb-[4px]">
        {/* [원본] <span className="w-[34px] shrink-0" /> — 번호 버튼을 44px 로(REV-074) */}
        <span className={`${routine ? "w-[44px]" : "w-[34px]"} shrink-0`} />
        {allowLoad ? (
          <span className="w-[78px] shrink-0 text-center">
            <AppText variant="label" color="textFaint">
              {weightLabel ?? t("routines.setColWeight")}
            </AppText>
          </span>
        ) : null}
        <span className="min-w-0 flex-1 text-center">
          <AppText variant="label" color="textFaint">
            {t("routines.setColReps")}
          </AppText>
        </span>
        {/* [원본] {routine ? null : <span className="w-[44px] shrink-0" />} */}
        {/* [개선] 루틴 편집도 줄 끝에 🗑 칸이 있어 머리 칸을 맞춘다(세트 휴지통) */}
        <span className="w-[44px] shrink-0" />
      </div>

      {rows.map((r, i) => {
        const pct = r.loadBasis === "pct1rm" || r.loadBasis === "pctTop";
        if (r.setType === "normal") normal += 1;
        const glyph = r.setType === "normal" ? String(normal) : RX_SUMMARY_CHAR[r.setType];
        return (
          <div
            key={keysRef.current[i]}
            className="py-[2px]"
            data-testid="set-table-row"
            data-type={r.setType}
          >
            <div className="flex items-center gap-[4px]">
              <button
                type="button"
                data-testid="rx-type"
                aria-label={`${t("session.setTypeTitle")}: ${t(`routines.rxType.${r.setType}` as Parameters<typeof t>[0])}`}
                aria-haspopup="dialog"
                onClick={() => {
                  markCoachMarkSeen("rxType"); // 첫 안내는 본 것(SPEC-046)
                  setTypeRow(i);
                }}
                className={`flex h-[44px] ${routine ? "w-[44px]" : "w-[34px]"} shrink-0 items-center justify-center`}
              >
                {/* [원본] 테두리 상자(border-line + surface-alt) — 입력칸과 같은 모양이라 고르는 곳인지 몰랐다(사용성 1)
                    [개선] ② 메타 꺾쇠 — 번호 + 작은 ▾(SVG · 글자는 그대로 · 운동 중 세트 번호와 같게 · SPEC-046) */}
                <span className="flex min-w-[28px] items-center justify-center gap-[1px] py-[2px]">
                  <AppText variant="caption" className="font-bold">
                    {glyph}
                  </AppText>
                  <Icon name="chevron-down" size={12} color="var(--color-ink3)" className="shrink-0" />
                </span>
              </button>
              {allowLoad ? (
                <div className="relative w-[78px] shrink-0">
                  <NumCell
                    decimal
                    testId="rx-weight"
                    label={weightLabel ?? t("routines.setColWeight")}
                    // [개선] 루틴 편집의 % 줄은 칸에 계산 무게(없으면 빈칸) — % 는 줄 밑 글씨로(SPEC-041)
                    value={
                      routine && pct
                        ? (pctKgShown(r) ?? "")
                        : pct
                          ? String(r.loadPct ?? "")
                          : r.loadKg != null && r.loadKg > 0
                            ? String(
                                displayWeight(
                                  r.loadBasis === "fixed" ? r.loadKg / fixedMultiplier : r.loadKg,
                                  unit,
                                ),
                              )
                            : ""
                    }
                    onCommit={(text) => commitWeight(i, text)}
                  />
                  {pct && !routine ? (
                    <span className="pointer-events-none absolute top-1/2 right-[4px] -translate-y-1/2">
                      <AppText variant="caption" color="textMuted">
                        %
                      </AppText>
                    </span>
                  ) : null}
                </div>
              ) : null}
              {r.amrap ? (
                <div className="flex min-w-0 flex-1 items-center">
                  <NumCell
                    testId="rx-rep-amrap"
                    label={`${t("routines.setColReps")} ${t("scheme.amrap")}`}
                    value=""
                    placeholder={t("scheme.amrap")}
                    onCommit={(text) => commitAmrap(i, text)}
                  />
                </div>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-[2px]">
                  <NumCell
                    testId="rx-rep-min"
                    label={`${t("routines.setColReps")} ${t("routines.rxColRepMin")}`}
                    value={r.repMin == null ? "" : String(r.repMin)}
                    onCommit={(text) => commitRep(i, "repMin", text)}
                  />
                  <AppText variant="caption" color="textFaint">
                    ~
                  </AppText>
                  <NumCell
                    testId="rx-rep-max"
                    label={`${t("routines.setColReps")} ${t("routines.rxColRepMax")}`}
                    value={r.repMax == null ? "" : String(r.repMax)}
                    onCommit={(text) => commitRep(i, "repMax", text)}
                  />
                </div>
              )}
              {/* [원본] 루틴 편집에도 줄마다 … (무게 기준·삭제) — 세트 방식이 무게 기준을 정하고 삭제는 번호 시트로(SPEC-041) */}
              {/* [원본] {routine ? null : allowLoad || rows.length > 1 ? ( */}
              {/* [개선] 루틴 편집은 줄 끝 🗑 — 번호 시트의 「삭제」를 밖으로(흐린 회색 · 빨강은 주 행동만 · 한 줄이면 빈 칸) */}
              {routine ? (
                rows.length > 1 ? (
                  <button
                    type="button"
                    data-testid="rx-remove"
                    aria-label={t("routines.rxRemoveSet", { n: i + 1 })}
                    onClick={() => removeFromTrash(i)}
                    className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[var(--radius-pill)] focus-visible:outline-2 focus-visible:outline-(--color-ink3) active:bg-(--color-surface-alt)"
                  >
                    <Icon name="trash-outline" size={18} color="var(--color-ink3)" />
                  </button>
                ) : (
                  <span className="w-[44px] shrink-0" />
                )
              ) : allowLoad || rows.length > 1 ? (
                <button
                  type="button"
                  data-testid="rx-more"
                  aria-label={t("routines.setMenuTitle")}
                  onClick={() => setMenuRow(i)}
                  className="flex h-[44px] w-[44px] shrink-0 items-center justify-center"
                >
                  <Icon name="ellipsis-horizontal" size={18} color="var(--color-ink3)" />
                </button>
              ) : (
                <span className="w-[44px] shrink-0" />
              )}
            </div>
            {r.loadBasis === "fixed" && mode === "routine" ? (
              <div className="pl-[48px]" data-testid="rx-fixed-tag">
                <AppText variant="label" color="textMuted">
                  {t("routines.setFixedTag")}
                </AppText>
              </div>
            ) : routine && pct ? (
              // 세트 방식 무게의 근거 — 「1RM 추정 Nkg의 75%」·「1RM의 75% · 첫 기록 뒤 계산」·「탑×85%」(SPEC-041)
              <div className="pl-[48px]" data-testid="rx-pct-note">
                <AppText variant="label" color="textMuted">
                  {r.loadBasis === "pctTop"
                    ? t("scheme.topNote", { pct: r.loadPct ?? 0 })
                    : est1rmKg > 0
                      ? t("scheme.pctNote", {
                          base: `${displayWeight(roundLoadKg(est1rmKg, equipment, unit), unit)}${unit}`,
                          pct: r.loadPct ?? 0,
                        })
                      : t("scheme.pctNoteNone", { pct: r.loadPct ?? 0 })}
                </AppText>
              </div>
            ) : pct ? (
              <div className="pl-[38px]">
                <AppText variant="label" color="textMuted">
                  {t(r.loadBasis === "pct1rm" ? "routines.setBasisPct1rm" : "routines.setBasisPctTop")}
                </AppText>
              </div>
            ) : null}
          </div>
        );
      })}

      {/* [원본] offerKg != null ? <Button title={t("routines.setApplyRest", …)} testId="rx-apply-rest" onPress={applyOffer} /> — 무게만 · 일반 세트만 */}
      {offerRow != null && copyTargets(offerRow).length > 0 ? (
        <div className="mt-[4px]">
          <Button
            title={t("routines.copyToOthers", { n: copyTargets(offerRow).length })}
            size="sm"
            variant="quiet"
            fullWidth={false}
            testId="rx-copy-rest"
            onPress={() => copyFrom(offerRow)}
          />
        </div>
      ) : null}

      <div className="mt-[var(--spacing-xs)] flex gap-[var(--spacing-xs)]">
        <div className="flex-1">
          <Button
            title={t("routines.rxAddSet")}
            icon="add"
            // [원본] variant="secondary" · [개선] 종목마다 반복되는 보조 행동이라 회색 글자(SPEC-056 F4 · 운동 화면 「세트 추가」와 같다)
            variant="quiet"
            size="sm"
            testId="rx-add-set"
            onPress={addSet}
          />
        </div>
        <div className="flex-1">
          <Button
            title={t("routines.setAddWarmup")}
            // [원본] variant="secondary" · [개선] 종목마다 반복되는 보조 행동이라 회색 글자(SPEC-056 F4 · 운동 화면 「세트 추가」와 같다)
            variant="quiet"
            size="sm"
            testId="rx-add-warmup"
            onPress={addWarmup}
          />
        </div>
      </div>

      {/* [원본] 강도 목표는 루틴 편집에도 있었다 — 세트 방식 안내가 맡는다(SPEC-041). 코칭 화면에는 남긴다. */}
      {routine ? null : (
        <div className="mt-[var(--spacing-md)]" data-testid="effort-goal" data-goal={String(goal)}>
          <AppText variant="label" color="textMuted" className="block">
            {t("routines.effortTitle")}
            {goal === "mixed" ? ` · ${t("routines.effortMixed")}` : ""}
          </AppText>
          <div className="mt-[4px] flex flex-wrap gap-[6px]">
            <SelectChip
              label={t("routines.effortNone")}
              active={goal === null}
              tall
              testId="effort-none"
              onPress={() => emit(withEffortGoal(rows, null))}
            />
            {effortChips.map((rir) => (
              <SelectChip
                key={rir}
                label={t("routines.effortValue", { rir })}
                active={goal === rir}
                tall
                testId={`effort-${rir}`}
                onPress={() => emit(withEffortGoal(rows, rir))}
              />
            ))}
          </div>
        </div>
      )}

      {typeRow != null && rows[typeRow] ? (
        <ActionSheet
          testId="rx-type-sheet"
          title={t("session.setTypeTitle")}
          onClose={() => setTypeRow(null)}
          // [원본] options={SET_TYPES.map(…)} — 루틴 편집은 피더 · 맨 아래 세트 삭제(… 메뉴에서 옮김 · SPEC-041)
          options={[
            ...(routine ? SET_TYPES : COACH_SET_TYPES).map((type) => ({
              label: t(TYPE_LABEL[type]),
              selected: rows[typeRow].setType === type,
              testId: `rx-type-${type}`,
              onPress: () => pickType(typeRow, type),
            })),
            // 다른 세트도 똑같이(SPEC-042) — 이 줄의 무게·횟수를 같은 갈래 다른 줄에
            ...(copyTargets(typeRow).length > 0
              ? [
                  {
                    label: t("routines.copyToOthers", { n: copyTargets(typeRow).length }),
                    testId: "rx-copy",
                    onPress: () => copyFrom(typeRow),
                  },
                ]
              : []),
            // [원본] 루틴 편집 맨 아래 「삭제」 — 줄 끝 🗑 로 옮겼다(세트 휴지통)
            // ...(routine && rows.length > 1
            //   ? [{ label: t("common.delete"), destructive: true, testId: "rx-delete", onPress: () => remove(typeRow) }]
            //   : []),
          ]}
        />
      ) : null}

      {schemeOpen ? (
        <ActionSheet
          testId="scheme-sheet"
          title={t("scheme.title")}
          onClose={() => setSchemeOpen(false)}
          options={SCHEMES.map((def) => {
            const allowed = schemeAllowed(def.id, equipment);
            const current = schemeOf(rows);
            return {
              label: t(`scheme.name.${def.id}` as Parameters<typeof t>[0]),
              description: allowed
                ? t(`scheme.desc.${def.id}` as Parameters<typeof t>[0])
                : t("scheme.blocked"),
              selected: current
                ? current === def.id
                : def.id === "straight" && schemeChipName(rows, allowLoad) === t("scheme.name.straight"),
              disabled: !allowed,
              testId: `scheme-${def.id}`,
              onPress: () => applyScheme(def.id),
            };
          })}
        />
      ) : null}

      {menuRow != null && rows[menuRow] ? (
        <ActionSheet
          testId="rx-menu-sheet"
          title={t("routines.setMenuTitle")}
          onClose={() => setMenuRow(null)}
          options={[
            ...(allowLoad
              ? [
                  ...(mode === "routine"
                    ? [
                        {
                          label: t("routines.setBasisStart"),
                          selected: !rows[menuRow].loadBasis || rows[menuRow].loadBasis === "start",
                          onPress: () => pickBasis(menuRow, "start"),
                        },
                        {
                          label: t("routines.setBasisFixed"),
                          selected: rows[menuRow].loadBasis === "fixed",
                          testId: "rx-basis-fixed",
                          onPress: () => pickBasis(menuRow, "fixed"),
                        },
                      ]
                    : [
                        {
                          label: t("routines.setColWeight"),
                          selected: !rows[menuRow].loadBasis || rows[menuRow].loadBasis === "fixed",
                          onPress: () => pickBasis(menuRow, "fixed"),
                        },
                      ]),
                  {
                    label: t("routines.setBasisPct1rm"),
                    selected: rows[menuRow].loadBasis === "pct1rm",
                    testId: "rx-basis-pct1rm",
                    onPress: () => pickBasis(menuRow, "pct1rm"),
                  },
                  {
                    label: t("routines.setBasisPctTop"),
                    selected: rows[menuRow].loadBasis === "pctTop",
                    testId: "rx-basis-pctTop",
                    onPress: () => pickBasis(menuRow, "pctTop"),
                  },
                ]
              : []),
            ...(rows.length > 1
              ? [
                  {
                    label: t("common.delete"),
                    destructive: true,
                    testId: "rx-delete",
                    onPress: () => remove(menuRow),
                  },
                ]
              : []),
          ]}
        />
      ) : null}
    </div>
  );
}

// [원본] 처방 시트의 행(SPEC-023 이전) — 타입 순환·RIR 칸·반복 칸·무게 기준 순환
// /** 타입은 버튼을 누를 때마다 이 순서로 돈다. */
// const CYCLE: PrescribedSetType[] = ["normal", "warmup", "top", "backoff"];
//
// /** 무게 기준도 누를 때마다 돈다 — 없음 → 1RM % → 탑셋 % → 직접(kg). @plm SRS-063 */
// const LOAD_CYCLE: (LoadBasis | null)[] = [null, "pct1rm", "pctTop", "fixed"];
// const LOAD_DEFAULT: Record<LoadBasis, Partial<PrescribedSet>> = {
//   pct1rm: { loadPct: 80, loadKg: undefined },
//   pctTop: { loadPct: 90, loadKg: undefined },
//   fixed: { loadKg: 20, loadPct: undefined },
// };
//
// /** 한 행이라도 뜻이 있으면 처방이다 — 무게 기준도 뜻이다(편집기 두 곳이 같은 판정을 쓴다). */
// export function rxMeaningful(rows: PrescribedSet[]): boolean {
//   return rows.some(
//     (r) =>
//       r.setType !== "normal" || r.targetRir != null || r.repMin != null || r.repMax != null || !!r.loadBasis,
//   );
// }
//
// export function PrescriptionRows({
//   rows,
//   onChange,
//   allowLoad = true,
// }: {
//   rows: PrescribedSet[];
//   onChange: (next: PrescribedSet[]) => void;
//   /** 무게 기준을 고를 수 있는가 — 맨몸·어시스트 종목은 % 기준이 뜻이 없다(SRS-063). */
//   allowLoad?: boolean;
// }) {
//   const patch = (i: number, p: Partial<PrescribedSet>) =>
//     onChange(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
//
//   /** 빈칸·음수·숫자가 아니면 null. RIR은 0~6이 의미 있는 범위라 위를 자른다. */
//   const setNum = (i: number, key: "targetRir" | "repMin" | "repMax", txt: string) => {
//     const n = Number.parseInt(txt, 10);
//     const v = Number.isNaN(n) || n < 0 ? null : key === "targetRir" ? Math.min(6, n) : n;
//     patch(i, { [key]: v } as Partial<PrescribedSet>);
//   };
//
//   return (
//     <div>
//       <div className="flex items-center gap-[4px] pb-[4px]">
//         <span className="w-[86px]">
//           <AppText variant="label" color="textFaint">
//             {t("routines.rxColType")}
//           </AppText>
//         </span>
//         {(["routines.rxColRir", "routines.rxColRepMin", "routines.rxColRepMax"] as const).map((k) => (
//           <span key={k} className="flex-1 text-center">
//             <AppText variant="label" color="textFaint">
//               {t(k)}
//             </AppText>
//           </span>
//         ))}
//         <span className="w-8" />
//       </div>
//
//       <div className="max-h-[320px] overflow-y-auto">
//         {rows.map((r, i) => (
//           // 처방 행은 **자리 자체가 뜻**이다(1세트·2세트…). 순서를 바꾸는 조작이 없고 값도 전부
//           // props에서 오므로, 인덱스를 키로 써도 상태가 엉키지 않는다.
//           // biome-ignore lint/suspicious/noArrayIndexKey: 위치가 곧 정체성인 행이다
//           <div key={i} className="py-[3px]">
//             <div className="flex items-center gap-[4px]">
//               <div className="w-[86px]">
//                 <Button
//                   title={t(`routines.rxType.${r.setType}` as Parameters<typeof t>[0])}
//                   size="sm"
//                   variant={r.setType === "normal" ? "ghost" : "secondary"}
//                   fullWidth={false}
//                   testId="rx-type"
//                   onPress={() => patch(i, { setType: CYCLE[(CYCLE.indexOf(r.setType) + 1) % CYCLE.length] })}
//                 />
//               </div>
//               {(["targetRir", "repMin", "repMax"] as const).map((key) => (
//                 <input
//                   key={key}
//                   inputMode="numeric"
//                   placeholder="–"
//                   data-testid={`rx-${key}`}
//                   value={r[key] == null ? "" : String(r[key])}
//                   onChange={(e) => setNum(i, key, e.target.value)}
//                   className="h-[38px] min-w-0 flex-1 rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-surface-alt) text-center text-[length:var(--text-md)] text-(--color-ink) placeholder:text-(--color-ink3)"
//                 />
//               ))}
//               <IconButton
//                 icon="close"
//                 size={16}
//                 label={t("common.delete")}
//                 color="var(--color-ink3)"
//                 className="h-8! w-8!"
//                 // 행이 하나뿐이면 지우지 않는다 — 빈 표가 되면 무엇을 고쳐야 할지 알 수 없다.
//                 onPress={() => rows.length > 1 && onChange(rows.filter((_, idx) => idx !== i))}
//               />
//             </div>
//             {/* 무게 기준(#56) — 그 세트의 무게를 어떻게 정하는지. 계산은 운동 시작·탑셋을 마칠 때 한다. @plm SRS-063 */}
//             {allowLoad ? (
//               <div className="flex items-center gap-[4px] pb-[4px] pl-[90px]">
//                 <Button
//                   title={t(`routines.rxLoad.${r.loadBasis ?? "none"}` as Parameters<typeof t>[0])}
//                   size="sm"
//                   variant={r.loadBasis ? "secondary" : "ghost"}
//                   fullWidth={false}
//                   testId="rx-load-basis"
//                   onPress={() => {
//                     const next =
//                       LOAD_CYCLE[(LOAD_CYCLE.indexOf(r.loadBasis ?? null) + 1) % LOAD_CYCLE.length];
//                     patch(
//                       i,
//                       next
//                         ? { loadBasis: next, ...LOAD_DEFAULT[next] }
//                         : { loadBasis: undefined, loadPct: undefined, loadKg: undefined },
//                     );
//                   }}
//                 />
//                 {r.loadBasis ? (
//                   <>
//                     <input
//                       inputMode="decimal"
//                       data-testid="rx-load-value"
//                       value={String(r.loadBasis === "fixed" ? (r.loadKg ?? "") : (r.loadPct ?? ""))}
//                       onChange={(e) => {
//                         const n = Number.parseFloat(e.target.value.replace(",", "."));
//                         if (r.loadBasis === "fixed") {
//                           patch(i, {
//                             loadKg: Number.isNaN(n) ? undefined : Math.min(LOAD_KG_MAX, Math.max(0, n)),
//                           });
//                         } else {
//                           const [, hi] = LOAD_PCT_RANGE[r.loadBasis as "pct1rm" | "pctTop"];
//                           patch(i, {
//                             loadPct: Number.isNaN(n) ? undefined : Math.min(hi, Math.max(0, Math.round(n))),
//                           });
//                         }
//                       }}
//                       // 입력 중에는 하한을 강제하지 않고(「8」→「80」), 칸을 떠날 때 하한까지 올린다 — 범위 밖 % 는
//                       // 저장 때 기준째 조용히 사라졌다(/qa code L4) @plm SRS-063
//                       onBlur={() => {
//                         if (r.loadBasis === "fixed" || r.loadPct == null) return;
//                         const [lo] = LOAD_PCT_RANGE[r.loadBasis as "pct1rm" | "pctTop"];
//                         if (r.loadPct < lo) patch(i, { loadPct: lo });
//                       }}
//                       className="h-[34px] w-[64px] rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-surface-alt) text-center text-[length:var(--text-md)] text-(--color-ink)"
//                     />
//                     <AppText variant="caption" color="textMuted">
//                       {r.loadBasis === "fixed" ? "kg" : "%"}
//                     </AppText>
//                   </>
//                 ) : null}
//               </div>
//             ) : null}
//           </div>
//         ))}
//       </div>
//
//       <div className="mt-[var(--spacing-sm)]">
//         <Button
//           title={t("routines.rxAddSet")}
//           icon="add"
//           variant="secondary"
//           size="sm"
//           onPress={() => onChange([...rows, emptyRxRow()])}
//         />
//       </div>
//     </div>
//   );
// }
