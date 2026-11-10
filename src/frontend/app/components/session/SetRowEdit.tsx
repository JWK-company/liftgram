"use client";
// @plm SRS-004  세트 한 줄(근력) — app의 features/session/ExerciseBlock 안 SetRowEdit을 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// [원본] 한 줄에 들어가는 것:  [타입칩] [이전 기록] [무게] [횟수] [체크] [▼ 상세]
// [개선] 한 줄에 들어가는 것:  [타입칩] [이전 기록] [무게] [횟수] [여유] [체크] [▼ 상세] — 여유 칸(SPEC-055 Phase 3 · B안)
//
// 화면에서 제일 자주 만지는 줄이라 규칙이 몇 가지 있다 — 전부 app에서 이유가 있어 생긴 것들이다:
//
//   · **완료한 세트는 잠근다.** 체크를 풀어야 다시 고칠 수 있다(운동 중 손이 스쳐 값이 바뀌는 것을 막는다).
//   · **이전 칩을 누르면 그 값이 그대로 들어온다.** 지난주와 같은 무게로 하는 날이 대부분이라
//     헬스장에서 제일 빠른 길이다. 표기는 `100×9`, 깔짝이 있으면 `100×(9+1)`.
//   · **체크할 때 UI 입력값을 함께 넘긴다.** 입력칸의 blur 커밋과 체크가 경합해 방금 친 무게가
//     아직 저장 전일 수 있는데, PR 판정이 옛 값으로 이뤄지면 기록을 놓친다.
//   · 타입칩(W/D/F)은 색으로 구분한다 — 워밍업 골드 · 드롭 파랑 · 실패 빨강.
// ─────────────────────────────────────────────────────────────────────────────
import {
  // [원본] GRIP_KEYS, — 세트별 그립 선택을 없앴다(ADR-034: 그립은 블록 칸)
  // [개선] 세트 시트에서도 블록 칸의 그립·부착물을 고른다 — 여기서 찾는 사람이 많다(부착물만 — 그립은 ADR-055부터 세트 값)
  ATTACH_KEYS,
  GRIP_KEYS,
  attachLabel,
  type AttachKey,
  type VariantDims,
  type GripKey,
  roundSuggestionKg,
  displayWeight, // 세트 무게 표시는 한 곳 — 100lb 왕복이 정확(/qa spec Q1) @plm SRS-067
  gripLabel,
  gripShortLabel,
  repRangeLabel,
  type WeightUnit,
} from "@app/core";
// 보이던 숫자를 그대로 두고 떠나면 저장 kg 를 바꾸지 않는다(/qa code M-1) @plm SRS-067
import { enteredWeightToKg } from "@app/core/domain/blockUnit";
import { useEffect, useRef, useState } from "react";
import { useSetDrafts } from "./setDrafts";
// [원본] import { RirChip } from "./RirChip"; // 세트 힘든 정도 칩(켰을 때만) @plm SRS-073
// [원본] import { useEffortLogging } from "@/lib/effortPref";
// [개선] 설정 없이 누구나 쓰는 「여유」 칸 — 칩·시트 대신 누를 때마다 바뀐다(SPEC-055 Phase 3)
import { SpareRepsCell } from "./SpareRepsCell";
import { markCoachMarkSeen } from "@/lib/coachMarks";
import { lang, t } from "@/lib/i18n";
import { ActionSheet, SheetShell } from "../ui/Dialog";
import { keepSelectAllOnMouseUp, selectAllOnFocus } from "../ui/selectAllOnFocus";
import { repResult } from "@app/core/domain/progression";
import { Icon } from "../ui/Icon";
import { ValueChip } from "../ui/ValueChip";
import { AppText } from "../ui/primitives";

/** 저장소 모델에서 이 줄이 읽는 필드만. */
export interface SetRow {
  id: string;
  setNumber: number;
  /** 저장 시각 — 같은 값으로 되돌아온 저장(3 → 5 → … 마지막 그림은 둘 다 5)도 입력칸이 따라가게 한다 */
  updatedAt?: Date | null;
  weightKg: number;
  reps: number;
  done: boolean;
  isWarmup: boolean;
  isDrop: boolean | null;
  isFailed: boolean;
  partialReps: number | null;
  arm: string | null;
  grip: string | null;
  setType: string | null;
  targetRir: number | null;
  /** v26 실제 RIR(0~10, 0.5 단위 · null = 적지 않음) @plm SRS-073 */
  rir?: number | null;
  // 유산소 지표(SRS-030) — 같은 세트 행이 근력·유산소 둘 다를 담는다.
  // 근력 종목에서는 늘 비어 있고, 유산소에서는 무게·횟수 쪽이 비어 있다.
  durationSec?: number | null;
  distanceM?: number | null;
  inclinePct?: number | null;
  level?: number | null;
  speedKmh?: number | null;
  /** v22: 무게 배수(플레이트 한쪽 입력=2) — null=1. 볼륨 계산만 쓴다. @plm SRS-058 */
  loadMultiplier?: number | null;
  /** v28 기록 확인 상태 — 'suspect' 면 「확인 필요」 칩(SPEC-044) */
  checkState?: string | null;
}

/** 직전 세션의 같은 자리 세트 — "이전" 칩이 보여 준다. */
export interface PrevSet {
  weightKg: number;
  reps: number;
  partialReps?: number | null;
  arm?: string | null;
  grip?: string | null;
  // 유산소 지표(SRS-030). 근력 줄은 쓰지 않지만 **같은 조회에서 함께 온다** —
  // 타입을 근력 것만으로 좁혀 두면 유산소 줄이 이전 기록을 못 받는다.
  durationSec?: number | null;
  distanceM?: number | null;
  inclinePct?: number | null;
  level?: number | null;
  speedKmh?: number | null;
}

export interface Suggestion {
  weightKg: number;
  reasonKey: string;
}

export interface Prescription {
  repMin?: number | null;
  repMax?: number | null;
  /** 「최대」 — 할 수 있는 만큼(드롭세트 줄 · SPEC-041) */
  amrap?: boolean;
}

export function SetRowEdit({
  set,
  label,
  labelColor,
  prev,
  rx,
  suggestion,
  unit,
  barWeightKg: _barWeightKg, // [원본] 플레이트 계산 — 메뉴에서 뺐다(SPEC-023)
  onUpdate,
  onToggleDone,
  onSetType,
  onSetArm,
  onSetGrip,
  blockVariant,
  onBlockVariant,
  onDelete,
  onApplySuggestion,
  onToggleDoneSingle,
  loadNote,
  copyCount = 0,
  onCopyToOthers,
  onCheck,
}: {
  set: SetRow;
  /** 표시 순번 — 일반 세트만 번호가 오르고 나머지는 W/D/F/T. */
  label: string;
  labelColor: "pr" | "primary" | "danger" | "textMuted";
  prev: PrevSet | null;
  rx: Prescription | null;
  suggestion: Suggestion | null;
  unit: WeightUnit;
  barWeightKg: number;
  // 저장 약속을 돌려줄 수 있다(블록 write) — RIR 칩이 그 약속이 끝난 뒤에만 다른 저장을 따른다(QA CU-7)
  onUpdate: (patch: {
    weightKg?: number;
    reps?: number;
    partialReps?: number | null;
    rir?: number | null;
  }) => unknown;
  onToggleDone: (next: boolean, weightKg: number | undefined, reps: number | undefined) => void;
  // [원본] onSetType: (type: "normal" | "warmup" | "drop" | "top" | "backoff") => void;
  onSetType: (type: "normal" | "warmup" | "drop" | "top" | "backoff" | "feeder") => void; // 피더(SPEC-041)
  onSetArm: (arm: "uni" | null) => unknown;
  onSetGrip: (grip: string | null) => unknown;
  /** 블록 칸(그립·부착물) — 유산소는 없다 */
  blockVariant?: VariantDims;
  onBlockVariant?: (dims: VariantDims) => void;
  onDelete: () => void;
  onApplySuggestion: () => void;
  /** 슈퍼셋 안에서 — 길게 누르거나 ⋯ 에서 「이 종목만」 완료(체크 한 번은 묶음 전체 · #48) @plm SRS-062 */
  onToggleDoneSingle?: (next: boolean, weightKg: number | undefined, reps: number | undefined) => void;
  /** 「다른 세트도 똑같이」로 바뀔 세트 수(0 이면 항목 없음 · SPEC-042) */
  copyCount?: number;
  onCopyToOthers?: () => void;
  /** 「확인 필요」 칩을 눌렀을 때 — 확인 시트(SPEC-044 · 운동 중에는 스스로 띄우지 않는다) */
  onCheck?: () => void;
  /** 처방 무게의 근거(「추정 1RM 100kg의 80%」) — 계산된 무게가 어디서 왔는지(ADR-028) @plm SRS-063 */
  loadNote?: string | null;
}) {
  const isDone = set.done;
  // 결과(SPEC-043) — 끝낸 세트의 횟수를 목표 범위와 견준다
  // 「확인 필요」 세트는 결과를 보이지 않는다 — 칩과 부딪히고, 확인 전까지는 맞는 기록인지 모른다(REV-079 UX-10)
  const suspect = isDone && set.checkState === "suspect";
  // [원본] const repOutcome = isDone ? repResult(set.reps, rx?.repMin, rx?.repMax) : null;
  const repOutcome = isDone && !suspect ? repResult(set.reps, rx?.repMin, rx?.repMax) : null;
  const drafts = useSetDrafts();
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  const [w, setW] = useState(() => String(displayWeight(set.weightKg, unit)));
  const [r, setR] = useState(() => String(set.reps));
  const [pt, setPt] = useState(() => (set.partialReps ? String(set.partialReps) : ""));
  const [expanded, setExpanded] = useState(false);
  const [typeMenu, setTypeMenu] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  // const [plates, setPlates] = useState<string | null>(null); // [원본] SPEC-023
  // [원본] const effortOn = useEffortLogging(); // 켰을 때만 처방 줄에 RIR 칩(끄면 DOM 0 · U-1) @plm SRS-073
  // [원본] // 워밍업은 칩 없음(분석 대상 밖 · QA CU-8) — 처방 RIR 글자는 꺼짐일 때처럼 그대로 보인다
  // [원본] const chipOn = effortOn && !set.isWarmup && set.setType !== "warmup";
  // [개선] 칩은 막았다 — 처방 줄은 처방이 있을 때만, 처방 RIR 글자는 늘 그대로(SPEC-055 Phase 3)
  const chipOn = false;
  // 워밍업(피더 포함 — isWarmup 이 켜진다)은 여유 칸 대신 같은 폭의 빈 자리(분석 대상 밖 · QA CU-8)
  const spareOn = !set.isWarmup && set.setType !== "warmup";
  // [개선] 기다리던 여유 저장(600ms)이 워밍업이 된 세트에 가지 않게(REV L-5) — 저장하는 순간에 본다.
  //   spareOnRef = 마지막 그림의 판정 · warmPicked = 종류 메뉴에서 워밍업·피더를 고른 순간(다시 그리기 전에 타이머가 돌 수 있다)
  const spareOnRef = useRef(spareOn);
  spareOnRef.current = spareOn;
  const warmPicked = useRef(false);

  // 밖에서 값이 바뀌면(이전 칩 적용·제안 적용) 입력칸도 따라간다.
  // 밖에서 값이 바뀌면 등록부의 입력 중 값도 버린다 — 옛 입력이 묶음 완료 때 새 값을 덮지 않게(SRS-062)
  // [원본] deps [set.weightKg, unit] / [set.reps] — 세트 표는 행의 증감만 관찰해 두 저장(입력 blur → PR 채우기)이 한 그림에
  //        묶이면 마지막 값이 처음 그림과 같아(5 → 3 → 5) 입력칸이 「3」에 남았다(화면 정리 P1 e2e). 저장 시각도 함께 본다.
  //        지금 그 칸에 입력 중이면 덮지 않는다 — 다른 칸 저장이 쓰던 숫자를 지우지 않게.
  const savedAt = set.updatedAt ? new Date(set.updatedAt).getTime() : 0;
  const weightRef = useRef<HTMLInputElement>(null);
  const repsRef = useRef<HTMLInputElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 저장된 무게·저장 시각이 바뀔 때만 따라간다
  useEffect(() => {
    if (typeof document !== "undefined" && document.activeElement === weightRef.current) return;
    setW(String(displayWeight(set.weightKg, unit)));
    drafts.set(set.id, { weightKg: undefined });
  }, [set.weightKg, unit, savedAt]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 저장된 횟수·저장 시각이 바뀔 때만 따라간다
  useEffect(() => {
    if (typeof document !== "undefined" && document.activeElement === repsRef.current) return;
    setR(String(set.reps));
    drafts.set(set.id, { reps: undefined });
  }, [set.reps, savedAt]);
  useEffect(() => setPt(set.partialReps ? String(set.partialReps) : ""), [set.partialReps]);

  // [원본] 누르고 떼기만 해도 toKg(표시 숫자) 로 다시 썼다 — 2자리 표시 반올림 때문에 60kg 이 60.0012 가 되어 거짓 PR(/qa code M-1)
  // const commitWeight = () => {
  //   drafts.set(set.id, { weightKg: undefined });
  //   const n = Number.parseFloat(w.replace(",", "."));
  //   if (!Number.isNaN(n) && n >= 0) onUpdate({ weightKg: toKg(n, unit) });
  //   else setW(String(displayWeight(set.weightKg, unit)));
  // };
  // [개선] 보이던 숫자 그대로면 아무것도 쓰지 않는다(사람이 고친 세트로 표시되지도 않는다) @plm SRS-067
  const commitWeight = () => {
    drafts.set(set.id, { weightKg: undefined });
    const n = Number.parseFloat(w.replace(",", "."));
    if (Number.isNaN(n) || n < 0) {
      setW(String(displayWeight(set.weightKg, unit)));
      return;
    }
    const kg = enteredWeightToKg(n, unit, set.weightKg);
    if (kg !== null) onUpdate({ weightKg: kg });
  };
  const commitReps = () => {
    drafts.set(set.id, { reps: undefined });
    const n = Number.parseInt(r, 10);
    if (!Number.isNaN(n) && n >= 0) onUpdate({ reps: n });
    else setR(String(set.reps));
  };
  const commitPartial = () => {
    const n = Number.parseInt(pt, 10);
    onUpdate({ partialReps: Number.isNaN(n) || n <= 0 ? null : n });
  };

  /** 지금 입력칸에 보이는 값(kg · 횟수) — 저장 커밋을 기다리지 않는다. */
  // [원본] 빈칸·잘못된 입력이 0 이 되어 묶음 완료가 0kg·0회를 저장했다(/qa code M4)
  // const currentValues = (): [number, number] => [
  //   toKg(Number.parseFloat(w.replace(",", ".")) || 0, unit),
  //   Number.parseInt(r, 10) || 0,
  // ];
  // [개선] 읽을 수 없으면 undefined — 저장소는 그 값을 쓰지 않는다(blur 커밋과 같은 규칙) @plm SRS-062
  const currentValues = (): [number | undefined, number | undefined] => {
    const kg = Number.parseFloat(w.replace(",", "."));
    const n = Number.parseInt(r, 10);
    // [원본] Number.isNaN(kg) || kg < 0 ? undefined : toKg(kg, unit), — 보이던 숫자면 저장 kg 그대로(/qa code M-1)
    const entered =
      Number.isNaN(kg) || kg < 0 ? undefined : (enteredWeightToKg(kg, unit, set.weightKg) ?? set.weightKg);
    return [entered, Number.isNaN(n) || n < 0 ? undefined : n];
  };

  const applyPrev = () => {
    if (!prev || isDone) return;
    markCoachMarkSeen("prev"); // 그 동작을 했으니 첫 안내는 본 것(SPEC-046)
    onUpdate({
      weightKg: prev.weightKg,
      reps: prev.reps,
      partialReps: prev.partialReps ?? null,
    });
  };

  // 세트 값은 모델에서 바로 읽는다 — 관찰은 행 증감만 알려서, 저장이 끝나면 이 줄만 바로 다시 그린다(REV-045 L-3)
  const [, bumpVariant] = useState(0);
  const saveVariant = (run: () => unknown) => {
    void Promise.resolve(run()).then(() => bumpVariant((n) => n + 1));
  };
  const variantSet = set.arm === "uni" || !!set.grip;
  const variantChipLabel = variantSet
    ? [
        set.arm === "uni" ? t("session.armUni") : null,
        set.grip ? gripShortLabel(set.grip as GripKey, lang) : null,
      ]
        .filter(Boolean)
        .join("·")
    : t("session.variantSet");

  // [원본] 플레이트 계산 — 세트 메뉴에서 뺐다(SPEC-023)
  // // 플레이트 계산 — 목표 무게를 만들려면 한쪽에 무엇을 끼우는지. app과 같은 문구·같은 계산이다.
  // const showPlates = () => {
  //   // [원본] kg 원판·프로필 봉만 썼다 — lb 블록에 「목표 103lb / 한쪽 20 + 1.25kg」가 섞여 보였다(/qa code M-2)
  //   // const bd = calcPlates(set.weightKg, { barKg: barWeightKg, platesKg: DEFAULT_PLATES_KG });
  //   // [개선] lb 블록은 45lb 봉·lb 원판으로 계산하고 lb 로 보인다. 목표는 적은 숫자 그대로 @plm SRS-067
  //   const inv = unit === "lb" ? lbPlateInventory() : { barKg: barWeightKg, platesKg: DEFAULT_PLATES_KG };
  //   const bd = calcPlates(set.weightKg, inv);
  //   if (!bd.perSide.length) {
  //     setPlates(t("session.plateBarOnly", { barWeight: formatEnteredWeight(inv.barKg, unit) }));
  //     return;
  //   }
  //   const perSide = bd.perSide
  //     .map((p) => `${displayWeight(p.plateKg, unit)}${p.count > 1 ? `×${p.count}` : ""}`)
  //     .join(" + ");
  //   const lines = [
  //     t("session.plateTarget", { targetWeight: formatEnteredWeight(set.weightKg, unit) }),
  //     t("session.platePerSide", { perSide }),
  //     bd.leftoverKg > 0.01
  //       ? t("session.plateLeftover", {
  //           shortWeight: formatWeight(bd.leftoverKg, unit),
  //           achievableWeight: formatWeight(bd.achievableKg, unit),
  //         })
  //       : null,
  //   ].filter(Boolean);
  //   setPlates(lines.join("\n"));
  // };

  const hasDetail = !!set.partialReps || variantSet;

  /** 「이전」 칩 이름 — 기호 대신 말 · 조합(둘째 줄)까지 · 마친 세트는 「채우기」 없이(P1 코드 리뷰 접근성 4 · 정확성 1) */
  function prevAria(): string {
    if (!prev) return t("chip.prevNone");
    const reps = prev.partialReps
      ? t("chip.repsPartial", { reps: prev.reps, partial: prev.partialReps })
      : t("chip.reps", { reps: prev.reps });
    const opt = prevOptionLabel(prev);
    const base = t(isDone ? "chip.prevDone" : "chip.prevFill", {
      weight: displayWeight(prev.weightKg, unit),
      unit,
      reps,
    });
    return opt ? `${base} · ${opt}` : base;
  }

  return (
    <div
      data-testid={`set-${set.id}`}
      // 마친 세트는 조용하게(SRS-054) — 붉은 판 대신 옅은 초록, 입력칸은 흐리게. 남은 세트가 눈에 띈다.
      // [원본] style={{ backgroundColor: isDone ? "var(--color-ok-soft)" : undefined }} · className="rounded-[var(--radius-sm)]"
      // [개선] 평평한 기록지 시험판 — 줄을 채우지 않는다. 세트 사이는 가는 선, 완료는 ✓ 색과 글자 진하기로
      className="border-(--color-line) border-t"
      // 완료 = 왼쪽 3px 초록 강조선(색만으로 가르지 않게 굵은 ✓ 와 함께 · SPEC-056 F6 · REV-122)
      style={isDone ? { boxShadow: "inset 3px 0 0 var(--color-ok)" } : undefined}
    >
      {/* [원본] <div className="flex items-center gap-[4px] py-[4px]"> */}
      {/* [개선] 칸 사이 2px — 이전 칸에 「102.5×12」 자리를 내려고(360px · REV H-1). ✓·⌄ 앞은 따로 여백을 둔다 */}
      <div className="flex items-center gap-[2px] py-[4px]">
        {/* 타입 — 탭하면 일반/워밍업/드롭/실패와 플레이트 계산을 고를 수 있다. */}
        <button
          type="button"
          data-testid="set-type"
          onClick={() => setTypeMenu(true)}
          aria-label={
            /^\d+$/.test(label)
              ? t("chip.setTypeAria", { label })
              : t("chip.setTypeAriaNamed", {
                  name: t(
                    `session.setType.${set.setType === "feeder" ? "feeder" : (set.setType ?? (set.isWarmup ? "warmup" : "normal"))}` as Parameters<
                      typeof t
                    >[0],
                  ),
                })
          }
          aria-haspopup="dialog"
          // [원본] className="flex w-[34px] shrink-0 justify-center" · 안쪽 상자 border border-(--color-line) bg-(--color-surface-alt) px-[4px] py-[4px]
          //   — 무게·횟수 입력칸과 같은 모양(테두리 상자)이라 「고르는 곳」인지 몰랐다(SPEC-046 · REV-084 8)
          // [개선] ② 메타 꺾쇠 — 테두리 없이 번호 + 작은 ▾(SVG · 글자는 그대로) · 누르는 높이 44px
          className="flex min-h-[44px] w-[34px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-(--color-brand)"
        >
          <span className="flex min-w-[28px] items-center justify-center gap-[1px] py-[4px]">
            <AppText variant="caption" color={labelColor} className="font-bold">
              {label}
            </AppText>
            <Icon name="chevron-down" size={12} color="var(--color-ink3)" className="shrink-0" />
          </span>
        </button>

        {/* [원본] 이전 기록 — <button data-testid="set-prev" className="w-[66px] shrink-0"> 안에 테두리·바탕 없는 회색 숫자
            (<span className="block px-[2px] py-[3px]"> + caption textMuted · 화면 정리 D4 @plm SRS-069 · 점선 밑줄은 /qa code L-1 에서 뺌).
            「눌린다」는 신호가 없어 몰랐다(사용성 1 · SPEC-046) */}
        {/* [개선] 값 칩 — 칸 전체가 옅은 바탕(아이콘 없음 · 뜻은 첫 안내) · 기록 없음·마친 세트는 바탕 없음(SRS-111 R1·R2) */}
        <ValueChip
          testId="set-prev"
          stretch
          disabled={!prev || isDone}
          onPress={applyPrev}
          // [원본] className="w-[66px] shrink-0 justify-center"
          // [원본] 여유 칸 자리를 이전 칸에서 — 360px 에서 kg 「102.5」·회 「12」가 잘리지 않게(REV-118 U3)
          // [원본] className="w-[52px] shrink-0 justify-center" — 「100×10」·「102.5×12」·「(8+2)」 횟수가 …로 잘렸다(REV H-1)
          // [개선] 64px + 칩 안쪽 여백 2px + 글자 13px — 「102.5×12」 가 한 줄에(✓·⌄ 겉보기와 칸 사이를 줄여 낸 자리)
          className="w-[64px] shrink-0 justify-center"
          faceClassName="px-[2px]!"
          ariaLabel={prevAria()}
        >
          {prev ? (
            <>
              {/* [원본] <AppText variant="caption" color={…} center className="block truncate tabular-nums">
                {`${displayWeight(prev.weightKg, unit)}×${prev.partialReps ? `(${prev.reps}+${prev.partialReps})` : prev.reps}`}
              </AppText> */}
              {/* [개선] 13px · 그래도 넘치면(「102.5×(8+2)」) 「×」 뒤에서 두 줄로 — 잘라 숨기지 않는다(REV H-1) */}
              <AppText
                variant="caption"
                color={isDone ? "textFaint" : "textMuted"}
                center
                data-testid="set-prev-text"
                className="block text-[13px]! leading-[16px] tabular-nums"
              >
                {`${displayWeight(prev.weightKg, unit)}×`}
                <wbr />
                {prev.partialReps ? `(${prev.reps}+${prev.partialReps})` : prev.reps}
              </AppText>
              {prevOptionLabel(prev) ? (
                <AppText variant="label" color="textFaint" center className="block truncate">
                  {prevOptionLabel(prev)}
                </AppText>
              ) : null}
            </>
          ) : (
            <AppText variant="caption" color="textFaint" center className="block">
              –
            </AppText>
          )}
        </ValueChip>

        <input
          ref={weightRef}
          data-testid="set-weight"
          inputMode="decimal"
          value={w}
          disabled={isDone}
          onChange={(e) => {
            setW(e.target.value);
            const n = Number.parseFloat(e.target.value.replace(",", "."));
            // [원본] toKg(n, unit) — 보이던 숫자면 저장 kg 그대로(/qa code M-1) @plm SRS-067
            drafts.set(set.id, {
              weightKg:
                Number.isNaN(n) || n < 0
                  ? undefined
                  : (enteredWeightToKg(n, unit, set.weightKg) ?? set.weightKg),
            });
          }}
          onBlur={commitWeight}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          // [원본] onFocus={(e) => e.currentTarget.select()} — 휴대폰은 탭이 끝날 때 선택이 풀려 커서만 남았다
          onFocus={selectAllOnFocus}
          onMouseUp={keepSelectAllOnMouseUp}
          // [원본] className="h-10 min-w-0 flex-1 …" — 무게·횟수 같은 폭
          // [개선] 무게 3 : 횟수 2 — 「102.5」 는 넓고 「12」 는 좁다(여유 칸이 들어온 360px · REV-118 U3)
          className="h-10 min-w-0 flex-[3] rounded-[var(--radius-sm)] border border-(--color-line-strong) bg-(--color-card) text-center font-semibold text-[length:var(--text-md)] text-(--color-ink) disabled:border-transparent disabled:bg-transparent disabled:text-(--color-ink2)"
        />
        <input
          ref={repsRef}
          data-testid="set-reps"
          inputMode="numeric"
          value={r}
          disabled={isDone}
          onChange={(e) => {
            setR(e.target.value);
            const n = Number.parseInt(e.target.value, 10);
            drafts.set(set.id, { reps: Number.isNaN(n) || n < 0 ? undefined : n });
          }}
          onBlur={commitReps}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          // [원본] onFocus={(e) => e.currentTarget.select()} — 휴대폰은 탭이 끝날 때 선택이 풀려 커서만 남았다
          onFocus={selectAllOnFocus}
          onMouseUp={keepSelectAllOnMouseUp}
          // [원본] className="h-10 min-w-0 flex-1 …"
          // [개선] 무게 3 : 횟수 2 — 회 칸은 「12」·「100」 이면 충분하다(무게 칸과 짝 · REV-118 U3)
          className="h-10 min-w-0 flex-[2] rounded-[var(--radius-sm)] border border-(--color-line-strong) bg-(--color-card) text-center font-semibold text-[length:var(--text-md)] text-(--color-ink) disabled:border-transparent disabled:bg-transparent disabled:text-(--color-ink2)"
        />

        {/* 여유(SPEC-055 Phase 3) — 완료한 세트에서도 눌린다 · 워밍업은 같은 폭의 빈 자리 */}
        {spareOn ? (
          <SpareRepsCell
            setId={set.id}
            setLabel={label}
            rir={set.rir}
            savedAt={savedAt}
            // [원본] onSave={(v) => onUpdate({ rir: v })} // 약속을 그대로 넘긴다(CU-7)
            // [개선] 저장하는 순간 워밍업이면 건너뛴다(REV L-5) — 약속은 그대로 넘긴다(CU-7)
            onSave={(v) => (spareOnRef.current && !warmPicked.current ? onUpdate({ rir: v }) : undefined)}
          />
        ) : (
          // [원본] <span aria-hidden="true" data-testid="set-spare-blank" className="mr-[4px] w-[32px] shrink-0" />
          // [개선] 여유 칸과 같은 폭·여백(✓ 앞 8px = gap 2 + mr 6)
          <span aria-hidden="true" data-testid="set-spare-blank" className="mr-[6px] w-[32px] shrink-0" />
        )}

        <button
          type="button"
          data-testid="set-done"
          aria-pressed={isDone}
          aria-label={isDone ? "완료 해제" : onToggleDoneSingle ? t("session.supersetDone") : "세트 완료"}
          // 슈퍼셋 안이면 길게 눌러(500ms) 이 종목만 — 한 번 누르기는 묶음 전체(#48 A) @plm SRS-062
          onPointerDown={(e) => {
            // 주 버튼(터치·왼쪽 클릭)만 — 오른쪽 버튼을 누르고 있어도 단독 토글이 되던 것(/qa code L8)
            if (!onToggleDoneSingle || e.button !== 0) return;
            longFired.current = false;
            pressTimer.current = setTimeout(() => {
              longFired.current = true;
              onToggleDoneSingle(!isDone, ...currentValues());
            }, 500);
          }}
          onPointerUp={() => pressTimer.current && clearTimeout(pressTimer.current)}
          onPointerLeave={() => pressTimer.current && clearTimeout(pressTimer.current)}
          onPointerCancel={() => pressTimer.current && clearTimeout(pressTimer.current)}
          onContextMenu={(e) => onToggleDoneSingle && e.preventDefault()}
          onClick={() => {
            if (longFired.current) {
              longFired.current = false;
              return;
            }
            // 입력칸의 blur 커밋을 기다리지 않고 **지금 화면의 값**을 함께 넘긴다.
            onToggleDone(!isDone, ...currentValues());
          }}
          style={{
            // [원본] backgroundColor: isDone ? "var(--color-ok)" : "var(--color-surface-alt)",
            // [원본] borderColor: isDone ? "var(--color-ok)" : "var(--color-line)",
            // [개선] 평평한 기록지 시험판 — 채운 초록 칸 대신 판 없는 ✓(완료=초록 굵은 ✓ · 남음=테두리만)
            backgroundColor: "transparent",
            borderColor: isDone ? "transparent" : "var(--color-line-strong)", // 누르는 것의 경계 3:1(F7)
          }}
          // [원본] className="flex h-10 w-[38px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border"
          // [개선] 겉보기 32 × 40 · 누르는 자리는 ::before 로 44 × 44(좌우 6 · 위아래 2 — 여유 칸과 ⌄ 의 누르는 자리와 겹치지 않는다 · REV H-1)
          className="relative flex h-10 w-[32px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border before:absolute before:-inset-x-[6px] before:-inset-y-[2px] before:content-[''] focus-visible:outline-2 focus-visible:outline-(--color-brand)"
        >
          {/* [원본] <Icon name="checkmark" size={16} color={isDone ? "var(--color-on-brand)" : "var(--color-ink3)"} /> */}
          {/* 미완료 = 빈 칸(✓ 없음) · 완료 = 굵은 초록 ✓(SPEC-056 F6) */}
          {isDone ? <Icon name="checkmark-bold" size={24} color="var(--color-ok)" /> : null}
        </button>

        <button
          type="button"
          data-testid="set-more"
          aria-label="세트 상세"
          onClick={() => setExpanded((v) => !v)}
          // [원본] 상세가 있으면 빨간 바탕·빨간 화살표 — 빨강은 완료·주 행동에만(화면 정리 공용 규칙) @plm SRS-069
          // style={{ backgroundColor: expanded || hasDetail ? "var(--color-brand-muted)" : undefined }}
          style={{ backgroundColor: expanded || hasDetail ? "var(--color-surface-alt)" : undefined }}
          // [원본] className="ml-[2px] flex h-10 w-[34px] …" — 표 머리와 2px 어긋났고 여유 칸 자리가 모자랐다
          // [원본] className="flex h-10 w-[34px] shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
          // [개선] 겉보기 28 × 40 · ✓ 와 10px(gap 2 + ml 8) · 누르는 자리 ::before 44 × 44(왼쪽 4 · 오른쪽 12 — 줄 밖 카드 여백으로 · REV H-1)
          className="relative ml-[8px] flex h-10 w-[28px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] before:absolute before:-inset-y-[2px] before:-right-[12px] before:-left-[4px] before:content-['']"
        >
          <Icon
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={expanded || hasDetail ? "var(--color-ink)" : "var(--color-ink3)"}
          />
        </button>
      </div>

      {/* 세트 변형 이름표 — 접혀 있어도 보이게 세트 줄 바로 아래 진한 알약으로. 빨강은 완료·주 행동 몫이라 잉크색(사용자 요청 2026-11-05) */}
      {variantSet ? (
        <div className="pb-[4px] pl-[42px]">
          <button
            type="button"
            data-testid="set-variant-badge"
            aria-label={`${t("session.setVariantTitle")}: ${variantChipLabel}`}
            disabled={isDone} // 완료한 세트는 잠근다 — 접힌 줄에 늘 보여 손이 스치기 쉽다(REV-045 L-4)
            onClick={() => setVarOpen(true)}
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-surface)" }}
            className="inline-flex h-[26px] max-w-full items-center truncate rounded-full px-[12px] font-bold text-[length:var(--text-sm)]"
          >
            {variantChipLabel}
          </button>
        </div>
      ) : null}

      {/* 튀는 기록 — 옅은 칩(누름 넓이 44px · 금색·빨강 아님 · SPEC-044 · REV-079 UX-10) */}
      {suspect ? (
        <div className="flex items-center pb-[2px] pl-[42px]">
          <button
            type="button"
            data-testid="set-check-chip"
            data-check-state="suspect"
            aria-label={t("check.chipAria", { n: set.setNumber })}
            onClick={onCheck}
            className="-my-[9px] inline-flex min-h-[44px] items-center"
          >
            <span className="inline-flex h-[26px] items-center gap-[4px] rounded-full bg-(--color-surface-alt) px-[10px] text-[length:var(--text-xs)] font-semibold text-(--color-ink)">
              <span aria-hidden="true">?</span>
              {t("check.chip")}
            </span>
          </button>
        </div>
      ) : null}
      {/* [원본] 처방(목표 반복·RIR) — 루틴이 지시한 값이 있을 때만. 힘든 정도 기록을 켜면 처방이 없어도 이 줄에 칩(U-1) @plm SRS-073 */}
      {/* [개선] 처방(목표 반복·RIR) — 루틴이 지시한 값이 있을 때만. 실제 여유는 첫 줄의 여유 칸에 적는다(칩·설정 없음 · SPEC-055 Phase 3) @plm SRS-073 */}
      {/* [원본] {set.targetRir != null || rx?.repMin != null || rx?.repMax != null ? ( */}
      {/* 워밍업 세트에는 칩을 두지 않는다 — 분석(isEffortTarget)이 워밍업을 빼서 적어도 어디에도 안 나온다(QA CU-8) */}
      {/* [원본] {effortOn || set.targetRir != null || rx?.repMin != null || rx?.repMax != null ? ( */}
      {chipOn || set.targetRir != null || rx?.repMin != null || rx?.repMax != null || rx?.amrap ? (
        <div className="flex items-center gap-[var(--spacing-sm)] pb-[2px] pl-[42px]">
          {rx?.amrap ? (
            <AppText variant="label" color="textMuted" data-testid="set-rx-amrap">
              {t("session.rxRepRange", { range: t("scheme.amrap") })}
            </AppText>
          ) : null}
          {!rx?.amrap && (rx?.repMin != null || rx?.repMax != null) ? (
            <AppText variant="label" color="textMuted">
              {t("session.rxRepRange", { range: repRangeLabel(rx.repMin ?? null, rx.repMax ?? null) })}
            </AppText>
          ) : null}
          {/* 끝낸 세트의 결과 — 범위 = 목표, 칸 = 실제(SPEC-043 · SRS-108) */}
          {isDone && !rx?.amrap && !set.isWarmup && repOutcome ? (
            <AppText
              variant="label"
              data-testid="set-rep-result"
              data-result={repOutcome}
              color={repOutcome === "top" ? "success" : repOutcome === "below" ? "textFaint" : "textMuted"}
              className={repOutcome === "top" ? "font-bold" : undefined}
            >
              {t(`session.repResult.${repOutcome}` as Parameters<typeof t>[0])}
            </AppText>
          ) : null}
          {/* [원본] {set.targetRir != null ? ( — 켜면 처방 RIR 글자는 칩 하나로 합친다(「목표 2」·「2 · 목표 2」 · U-10) */}
          {!chipOn && set.targetRir != null ? (
            <AppText variant="label" color="primary" className="font-bold">
              {t("session.rxRir", { rir: set.targetRir })}
            </AppText>
          ) : null}
          {/* [원본] 처방 줄 오른쪽 끝의 힘든 정도 칩 — 여유 칸(세트 줄 첫 줄)으로 옮겼다(SPEC-055 Phase 3)
          {chipOn ? (
            <RirChip
              setId={set.id}
              setLabel={label}
              rir={set.rir}
              savedAt={savedAt}
              target={set.targetRir}
              onSave={(v) => onUpdate({ rir: v })} // 약속을 그대로 넘긴다(CU-7)
            />
          ) : null} */}
        </div>
      ) : null}

      {/* 처방 무게의 근거 — 사람이 쓴 처방을 계산한 것임을 보인다(ADR-028) @plm SRS-063 */}
      {loadNote ? (
        <div className="pb-[2px] pl-[42px]">
          <AppText variant="label" color="textMuted" data-testid="set-load-note" className="block truncate">
            {loadNote}
          </AppText>
        </div>
      ) : null}

      {/* 중량 이어달리기 제안 — 앞 세트 결과에서 다음 무게를 계산해 권한다. */}
      {!isDone && suggestion ? (
        <div className="flex items-center gap-[var(--spacing-sm)] pb-[2px] pl-[42px]">
          <AppText variant="label" color="pr" className="min-w-0 shrink truncate">
            {`${t("session.rxSuggest", { weight: `${displayWeight(roundSuggestionKg(suggestion.weightKg, unit), unit)}` })} — ${t(
              suggestion.reasonKey as Parameters<typeof t>[0],
            )}`}
          </AppText>
          <button
            type="button"
            data-testid="set-apply-suggestion"
            onClick={onApplySuggestion}
            className="rounded-[var(--radius-pill)] bg-(--color-brand-muted) px-[var(--spacing-sm)] py-[2px]"
          >
            <AppText variant="label" color="primary" className="font-bold">
              {t("session.rxApply")}
            </AppText>
          </button>
        </div>
      ) : null}

      {expanded ? (
        <div className="pt-[4px] pb-[var(--spacing-sm)]">
          <div className="flex gap-[var(--spacing-sm)]">
            <div className="flex-1">
              <AppText variant="label" color="textMuted" className="mb-[4px] block">
                {t("session.partialFull")}
              </AppText>
              <input
                data-testid="set-partial"
                inputMode="numeric"
                value={pt}
                placeholder="0"
                onChange={(e) => setPt(e.target.value)}
                onBlur={commitPartial}
                onFocus={selectAllOnFocus}
                onMouseUp={keepSelectAllOnMouseUp}
                className="h-[42px] w-full rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-surface-alt) text-center font-semibold text-[length:var(--text-md)] text-(--color-ink)"
              />
            </div>
            <div className="flex-1">
              <AppText variant="label" color="textMuted" className="mb-[4px] block">
                {t("session.varColHeader")}
              </AppText>
              <button
                type="button"
                data-testid="set-variant"
                onClick={() => setVarOpen(true)}
                // [원본] 변형이 있으면 빨간 테두리·빨간 글자 — 빨강은 완료·주 행동에만, 이름표와 같은 잉크색으로
                // style={{
                //   backgroundColor: variantSet ? "var(--color-brand-muted)" : "var(--color-surface-alt)",
                //   borderColor: variantSet ? "var(--color-brand)" : "var(--color-line)",
                // }}
                // <AppText variant="caption" color={variantSet ? "primary" : "text"} className={variantSet ? "font-bold" : ""}>
                style={{
                  backgroundColor: variantSet ? "var(--color-ink)" : "var(--color-surface-alt)",
                  borderColor: variantSet ? "var(--color-ink)" : "var(--color-line)",
                  color: variantSet ? "var(--color-surface)" : "var(--color-ink)",
                }}
                className={`h-[42px] w-full rounded-[var(--radius-sm)] border text-[length:var(--text-xs)] ${variantSet ? "font-bold" : ""}`}
              >
                {variantChipLabel}
              </button>
            </div>
          </div>

          {/* 길게 누르기의 대안(접근성) — 슈퍼셋 안에서 이 종목만 완료·해제 @plm SRS-062 */}
          {onToggleDoneSingle ? (
            <button
              type="button"
              data-testid="set-done-single"
              onClick={() => onToggleDoneSingle(!isDone, ...currentValues())}
              className="mt-[var(--spacing-sm)] flex items-center gap-[4px] px-[var(--spacing-sm)] py-[4px]"
            >
              <Icon name="checkmark" size={16} color="var(--color-brand)" />
              <AppText variant="label" color="primary">
                {isDone ? t("session.onlyThisUndone") : t("session.onlyThisDone")}
              </AppText>
            </button>
          ) : null}

          <button
            type="button"
            data-testid="set-delete"
            onClick={onDelete}
            className="mt-[var(--spacing-sm)] ml-auto flex items-center gap-[4px] px-[var(--spacing-sm)] py-[4px]"
          >
            <Icon name="trash-outline" size={16} color="var(--color-bad)" />
            <AppText variant="label" color="danger">
              {t("common.delete")}
            </AppText>
          </button>
        </div>
      ) : null}

      {typeMenu ? (
        <ActionSheet
          testId="set-type-sheet"
          title={t("session.setTypeTitle")}
          onClose={() => setTypeMenu(false)}
          // [원본] 일반·워밍업·드롭·실패·플레이트 계산 — 실패·플레이트 계산은 뺐다(옛 F 기록은 표시만 남고, 다른 타입을 고르면 풀린다 · SPEC-023)
          options={[
            {
              label: t("session.setType.normal"),
              selected:
                !set.isWarmup &&
                set.isDrop !== true &&
                !set.isFailed &&
                set.setType !== "top" &&
                set.setType !== "backoff",
              // [원본] onPress: () => onSetType("normal"),
              onPress: () => {
                warmPicked.current = false; // 작업 세트로 — 여유 저장 다시 허용(REV L-5)
                onSetType("normal");
              },
            },
            {
              label: t("session.setType.warmup"),
              // [원본] selected: set.isWarmup, — 피더도 웜업 표시가 켜진다(SPEC-041)
              selected: set.isWarmup && set.setType !== "feeder",
              // [원본] onPress: () => onSetType("warmup"),
              // [개선] 기다리던 여유 저장을 막는다(REV L-5)
              onPress: () => {
                warmPicked.current = true;
                onSetType("warmup");
              },
            },
            {
              label: t("session.setType.feeder"),
              selected: set.setType === "feeder",
              testId: "set-type-feeder",
              // [원본] onPress: () => onSetType("feeder"),
              onPress: () => {
                warmPicked.current = true; // 피더도 워밍업(isWarmup) — 여유 저장 막음(REV L-5)
                onSetType("feeder");
              },
            },
            {
              label: t("session.setType.drop"),
              selected: !set.isWarmup && set.isDrop === true,
              // [원본] onPress: () => onSetType("drop"),
              onPress: () => {
                warmPicked.current = false; // 작업 세트로 — 여유 저장 다시 허용(REV L-5)
                onSetType("drop");
              },
            },
            {
              label: t("session.setType.top"),
              selected: !set.isWarmup && set.isDrop !== true && !set.isFailed && set.setType === "top",
              // [원본] onPress: () => onSetType("top"),
              onPress: () => {
                warmPicked.current = false; // 작업 세트로 — 여유 저장 다시 허용(REV L-5)
                onSetType("top");
              },
            },
            {
              label: t("session.setType.backoff"),
              selected: !set.isWarmup && set.isDrop !== true && !set.isFailed && set.setType === "backoff",
              // [원본] onPress: () => onSetType("backoff"),
              onPress: () => {
                warmPicked.current = false; // 작업 세트로 — 여유 저장 다시 허용(REV L-5)
                onSetType("backoff");
              },
            },
            // 다른 세트도 똑같이(SPEC-042) — 이 세트의 무게·횟수를 안 한 세트에
            ...(onCopyToOthers && copyCount > 0
              ? [
                  {
                    label: t("routines.copyToOthers", { n: copyCount }),
                    testId: "set-copy",
                    onPress: onCopyToOthers,
                  },
                ]
              : []),
          ]}
        />
      ) : null}

      {varOpen ? (
        <SetVariantSheet
          arm={set.arm}
          grip={set.grip}
          onArm={(v) => saveVariant(() => onSetArm(v))}
          onGrip={(v) => saveVariant(() => onSetGrip(v))}
          blockVariant={blockVariant}
          onBlockVariant={onBlockVariant}
          onClose={() => setVarOpen(false)}
        />
      ) : null}

      {/* [원본] 플레이트 계산 결과 창 — SPEC-023 */}
    </div>
  );
}

/** 이전 기록의 그립·팔 축약 — 지난번에 어떤 자세로 했는지 한 줄로. */
function prevOptionLabel(prev: PrevSet): string {
  const parts = [
    prev.arm === "uni" ? t("session.armUni") : null,
    prev.grip ? gripShortLabel(prev.grip as GripKey, lang) : null,
  ].filter(Boolean);
  return parts.join("·");
}

/** 세트별 팔·그립 — 같은 종목이라도 세트마다 바꿔 하는 사람이 있다(원암 교대 등). */
function SetVariantSheet({
  arm,
  grip,
  onArm,
  onGrip,
  blockVariant,
  onBlockVariant,
  onClose,
}: {
  arm: string | null;
  grip: string | null;
  onArm: (v: "uni" | null) => void;
  onGrip: (v: string | null) => void;
  blockVariant?: VariantDims;
  onBlockVariant?: (dims: VariantDims) => void;
  onClose: () => void;
}) {
  const isUni = arm === "uni";
  return (
    <SheetShell title={t("session.setVariantTitle")} onClose={onClose} testId="set-variant-sheet">
      <SheetRow label={t("session.armColHeader")}>
        <VarOpt label={t("session.armBi")} active={!isUni} onPress={() => onArm(null)} />
        <VarOpt label={t("session.armUni")} active={isUni} onPress={() => onArm("uni")} />
      </SheetRow>
      {/* [원본] 세트별 그립 선택 — ADR-034: 손 그립은 블록 칸(종목 칩의 「손 그립」)이 정한다. 세트마다 고르면 칸과 겹친다.
      <SheetRow label={t("variant.grip")}>
        <VarOpt label={t("variant.default")} active={!grip} onPress={() => onGrip(null)} />
        {GRIP_KEYS.map((g) => (
          <VarOpt key={g} label={gripLabel(g, lang)} active={grip === g} onPress={() => onGrip(g)} />
        ))}
      </SheetRow> */}
      {/* [개선] 그립은 이 세트에만 저장한다 — 1세트 일반·2세트 뉴트럴처럼 세트마다 따로(사용자 요청 2026-11-05)
          기본 = 세트에 따로 적지 않음(종목 칩에서 고른 그립을 따른다) */}
      <SheetRow label={t("variant.grip")}>
        <VarOpt
          label={
            blockVariant?.grip
              ? `${t("variant.default")}(${gripLabel(blockVariant.grip, lang)})`
              : t("variant.default")
          }
          active={!grip}
          onPress={() => onGrip(null)}
        />
        {GRIP_KEYS.map((g) => (
          <VarOpt
            key={g}
            label={gripLabel(g, lang)}
            active={grip === g}
            // 종목 칩의 그립과 같으면 따로 적을 것이 없다 — 이름표도 붙지 않는다(REV-045 L-1)
            onPress={() => onGrip(g === blockVariant?.grip ? null : g)}
          />
        ))}
      </SheetRow>
      {blockVariant && onBlockVariant ? (
        <>
          {/* [원본] 세트 옵션의 그립이 블록 칸을 바꿨다(2026-11-04) — 세트를 따로 기록할 수 없었다
          <SheetRow label={t("variant.grip")}>
            <VarOpt
              label={t("variant.default")}
              active={!blockVariant.grip}
              onPress={() => onBlockVariant({ ...blockVariant, grip: null })}
            />
            {GRIP_KEYS.map((g) => (
              <VarOpt
                key={g}
                label={gripLabel(g, lang)}
                active={blockVariant.grip === g}
                onPress={() => onBlockVariant({ ...blockVariant, grip: g })}
              />
            ))}
          </SheetRow> */}
          <SheetRow label={t("variant.attachment")}>
            <VarOpt
              label={t("variant.default")}
              active={!blockVariant.attach}
              onPress={() => onBlockVariant({ ...blockVariant, attach: null })}
            />
            {ATTACH_KEYS.map((a) => (
              <VarOpt
                key={a}
                label={attachLabel(a as AttachKey, lang)}
                active={blockVariant.attach === a}
                onPress={() => onBlockVariant({ ...blockVariant, attach: a })}
              />
            ))}
          </SheetRow>
          {/* [원본] <div className="mt-[var(--spacing-sm)]">
            <AppText variant="caption" color="textMuted">
              {t("session.setVariantBlockHint")}
            </AppText>
          </div> */}
          {/* [개선] 설명 줄 없앰(SPEC-055 Phase 4) */}
        </>
      ) : null}
      {/* [원본] 예전에 세트에 적어 둔 그립은 보여 주기만 했다 — 이제 위 줄에서 고르고 지운다(2026-11-05)
            {grip ? (
        <div
          className="mt-[var(--spacing-md)] flex items-center gap-[var(--spacing-sm)]"
          data-testid="set-grip-legacy"
        >
          <AppText variant="caption" color="textMuted" className="flex-1">
            {t("session.setGripLegacy", { grip: gripLabel(grip as GripKey, lang) })}
          </AppText>
          <VarOpt label={t("variant.default")} active={false} onPress={() => onGrip(null)} />
        </div>
      ) : null} */}
    </SheetShell>
  );
}

/** 라벨 한 줄 + 칩 묶음. app의 varRowLabel/varOptRow와 같은 배치다. */
function SheetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="mt-[var(--spacing-md)] mb-[var(--spacing-xs)]">
        <AppText variant="label" color="textMuted">
          {label}
        </AppText>
      </div>
      <div className="flex flex-wrap gap-[var(--spacing-xs)]">{children}</div>
    </>
  );
}

function VarOpt({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        backgroundColor: active ? "var(--color-brand-muted)" : "var(--color-surface-alt)",
        borderColor: active ? "var(--color-brand)" : "var(--color-line)",
      }}
      className="rounded-[var(--radius-pill)] border px-[var(--spacing-md)] py-[var(--spacing-xs)]"
    >
      <AppText variant="caption" color={active ? "primary" : "text"} className={active ? "font-bold" : ""}>
        {label}
      </AppText>
    </button>
  );
}
