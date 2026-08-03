"use client";
// @plm SRS-004  세트 한 줄(근력) — app의 features/session/ExerciseBlock 안 SetRowEdit을 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 한 줄에 들어가는 것:  [타입칩] [이전 기록] [무게] [횟수] [체크] [▼ 상세]
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
  DEFAULT_PLATES_KG,
  GRIP_KEYS,
  type GripKey,
  calcPlates,
  formatWeight,
  fromKg,
  gripLabel,
  gripShortLabel,
  repRangeLabel,
  toKg,
  type WeightUnit,
} from "@app/core";
import { useEffect, useState } from "react";
import { lang, t } from "@/lib/i18n";
import { ActionSheet, InfoDialog, SheetShell } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { AppText } from "../ui/primitives";

/** 저장소 모델에서 이 줄이 읽는 필드만. */
export interface SetRow {
  id: string;
  setNumber: number;
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
  // 유산소 지표(SRS-030) — 같은 세트 행이 근력·유산소 둘 다를 담는다.
  // 근력 종목에서는 늘 비어 있고, 유산소에서는 무게·횟수 쪽이 비어 있다.
  durationSec?: number | null;
  distanceM?: number | null;
  inclinePct?: number | null;
  level?: number | null;
  speedKmh?: number | null;
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
}

export function SetRowEdit({
  set,
  label,
  labelColor,
  prev,
  rx,
  suggestion,
  unit,
  barWeightKg,
  onUpdate,
  onToggleDone,
  onSetType,
  onSetArm,
  onSetGrip,
  onDelete,
  onApplySuggestion,
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
  onUpdate: (patch: { weightKg?: number; reps?: number; partialReps?: number | null }) => void;
  onToggleDone: (next: boolean, weightKg: number, reps: number) => void;
  onSetType: (type: "normal" | "warmup" | "drop" | "failed") => void;
  onSetArm: (arm: "uni" | null) => void;
  onSetGrip: (grip: string | null) => void;
  onDelete: () => void;
  onApplySuggestion: () => void;
}) {
  const isDone = set.done;
  const [w, setW] = useState(() => String(fromKg(set.weightKg, unit)));
  const [r, setR] = useState(() => String(set.reps));
  const [pt, setPt] = useState(() => (set.partialReps ? String(set.partialReps) : ""));
  const [expanded, setExpanded] = useState(false);
  const [typeMenu, setTypeMenu] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  const [plates, setPlates] = useState<string | null>(null);

  // 밖에서 값이 바뀌면(이전 칩 적용·제안 적용) 입력칸도 따라간다.
  useEffect(() => setW(String(fromKg(set.weightKg, unit))), [set.weightKg, unit]);
  useEffect(() => setR(String(set.reps)), [set.reps]);
  useEffect(() => setPt(set.partialReps ? String(set.partialReps) : ""), [set.partialReps]);

  const commitWeight = () => {
    const n = Number.parseFloat(w.replace(",", "."));
    if (!Number.isNaN(n) && n >= 0) onUpdate({ weightKg: toKg(n, unit) });
    else setW(String(fromKg(set.weightKg, unit)));
  };
  const commitReps = () => {
    const n = Number.parseInt(r, 10);
    if (!Number.isNaN(n) && n >= 0) onUpdate({ reps: n });
    else setR(String(set.reps));
  };
  const commitPartial = () => {
    const n = Number.parseInt(pt, 10);
    onUpdate({ partialReps: Number.isNaN(n) || n <= 0 ? null : n });
  };

  const applyPrev = () => {
    if (!prev || isDone) return;
    onUpdate({
      weightKg: prev.weightKg,
      reps: prev.reps,
      partialReps: prev.partialReps ?? null,
    });
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

  // 플레이트 계산 — 목표 무게를 만들려면 한쪽에 무엇을 끼우는지. app과 같은 문구·같은 계산이다.
  const showPlates = () => {
    const bd = calcPlates(set.weightKg, { barKg: barWeightKg, platesKg: DEFAULT_PLATES_KG });
    if (!bd.perSide.length) {
      setPlates(t("session.plateBarOnly", { barWeight: formatWeight(barWeightKg, unit) }));
      return;
    }
    const perSide = bd.perSide.map((p) => `${p.plateKg}${p.count > 1 ? `×${p.count}` : ""}`).join(" + ");
    const lines = [
      t("session.plateTarget", { targetWeight: formatWeight(set.weightKg, unit) }),
      t("session.platePerSide", { perSide }),
      bd.leftoverKg > 0.01
        ? t("session.plateLeftover", {
            shortWeight: formatWeight(bd.leftoverKg, unit),
            achievableWeight: formatWeight(bd.achievableKg, unit),
          })
        : null,
    ].filter(Boolean);
    setPlates(lines.join("\n"));
  };

  const hasDetail = !!set.partialReps || variantSet;

  return (
    <div
      data-testid={`set-${set.id}`}
      style={{ backgroundColor: isDone ? "var(--color-brand-muted)" : undefined }}
      className="rounded-[var(--radius-sm)]"
    >
      <div className="flex items-center gap-[4px] py-[4px]">
        {/* 타입 — 탭하면 일반/워밍업/드롭/실패와 플레이트 계산을 고를 수 있다. */}
        <button
          type="button"
          data-testid="set-type"
          onClick={() => setTypeMenu(true)}
          className="flex w-[34px] shrink-0 justify-center"
        >
          <span className="flex min-w-[28px] justify-center rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-surface-alt) px-[4px] py-[4px]">
            <AppText variant="caption" color={labelColor} className="font-bold">
              {label}
            </AppText>
          </span>
        </button>

        {/* 이전 기록 — 누르면 그대로 채운다. */}
        <button
          type="button"
          data-testid="set-prev"
          disabled={!prev || isDone}
          onClick={applyPrev}
          className="w-[66px] shrink-0"
        >
          {prev ? (
            <span className="block rounded-[var(--radius-sm)] border border-(--color-brand) bg-(--color-surface-alt) px-[5px] py-[3px]">
              <AppText variant="caption" color="primary" center className="block truncate">
                {`${fromKg(prev.weightKg, unit)}×${prev.partialReps ? `(${prev.reps}+${prev.partialReps})` : prev.reps}`}
              </AppText>
              {prevOptionLabel(prev) ? (
                <AppText variant="label" color="textFaint" center className="block truncate">
                  {prevOptionLabel(prev)}
                </AppText>
              ) : null}
            </span>
          ) : (
            <AppText variant="caption" color="textFaint" center className="block">
              –
            </AppText>
          )}
        </button>

        <input
          data-testid="set-weight"
          inputMode="decimal"
          value={w}
          disabled={isDone}
          onChange={(e) => setW(e.target.value)}
          onBlur={commitWeight}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-surface-alt) text-center font-semibold text-[length:var(--text-md)] text-(--color-ink) disabled:opacity-70"
        />
        <input
          data-testid="set-reps"
          inputMode="numeric"
          value={r}
          disabled={isDone}
          onChange={(e) => setR(e.target.value)}
          onBlur={commitReps}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-surface-alt) text-center font-semibold text-[length:var(--text-md)] text-(--color-ink) disabled:opacity-70"
        />

        <button
          type="button"
          data-testid="set-done"
          aria-pressed={isDone}
          aria-label={isDone ? "완료 해제" : "세트 완료"}
          onClick={() => {
            // 입력칸의 blur 커밋을 기다리지 않고 **지금 화면의 값**을 함께 넘긴다.
            const kg = toKg(Number.parseFloat(w.replace(",", ".")) || 0, unit);
            const reps = Number.parseInt(r, 10) || 0;
            onToggleDone(!isDone, kg, reps);
          }}
          style={{
            backgroundColor: isDone ? "var(--color-brand)" : "var(--color-surface-alt)",
            borderColor: isDone ? "var(--color-brand)" : "var(--color-line)",
          }}
          className="flex h-10 w-[38px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border"
        >
          <Icon name="checkmark" size={16} color={isDone ? "var(--color-on-brand)" : "var(--color-ink3)"} />
        </button>

        <button
          type="button"
          data-testid="set-more"
          aria-label="세트 상세"
          onClick={() => setExpanded((v) => !v)}
          style={{ backgroundColor: expanded || hasDetail ? "var(--color-brand-muted)" : undefined }}
          className="ml-[2px] flex h-10 w-[34px] shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
        >
          <Icon
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={expanded || hasDetail ? "var(--color-brand)" : "var(--color-ink3)"}
          />
        </button>
      </div>

      {/* 처방(목표 반복·RIR) — 루틴이 지시한 값이 있을 때만. */}
      {set.targetRir != null || rx?.repMin != null || rx?.repMax != null ? (
        <div className="flex items-center gap-[var(--spacing-sm)] pb-[2px] pl-[42px]">
          {rx?.repMin != null || rx?.repMax != null ? (
            <AppText variant="label" color="textMuted">
              {t("session.rxRepRange", { range: repRangeLabel(rx.repMin ?? null, rx.repMax ?? null) })}
            </AppText>
          ) : null}
          {set.targetRir != null ? (
            <AppText variant="label" color="primary" className="font-bold">
              {t("session.rxRir", { rir: set.targetRir })}
            </AppText>
          ) : null}
        </div>
      ) : null}

      {/* 중량 이어달리기 제안 — 앞 세트 결과에서 다음 무게를 계산해 권한다. */}
      {!isDone && suggestion ? (
        <div className="flex items-center gap-[var(--spacing-sm)] pb-[2px] pl-[42px]">
          <AppText variant="label" color="pr" className="min-w-0 shrink truncate">
            {`${t("session.rxSuggest", { weight: `${fromKg(suggestion.weightKg, unit)}` })} — ${t(
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
                style={{
                  backgroundColor: variantSet ? "var(--color-brand-muted)" : "var(--color-surface-alt)",
                  borderColor: variantSet ? "var(--color-brand)" : "var(--color-line)",
                }}
                className="h-[42px] w-full rounded-[var(--radius-sm)] border"
              >
                <AppText
                  variant="caption"
                  color={variantSet ? "primary" : "text"}
                  className={variantSet ? "font-bold" : ""}
                >
                  {variantChipLabel}
                </AppText>
              </button>
            </div>
          </div>

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
          options={[
            {
              label: t("session.setType.normal"),
              selected: !set.isWarmup && set.isDrop !== true && !set.isFailed,
              onPress: () => onSetType("normal"),
            },
            {
              label: t("session.setType.warmup"),
              selected: set.isWarmup,
              onPress: () => onSetType("warmup"),
            },
            {
              label: t("session.setType.drop"),
              selected: set.isDrop === true,
              onPress: () => onSetType("drop"),
            },
            {
              label: t("session.setType.failed"),
              selected: set.isFailed,
              onPress: () => onSetType("failed"),
            },
            { label: t("session.plateCalcTitle"), onPress: showPlates },
          ]}
        />
      ) : null}

      {varOpen ? (
        <SetVariantSheet
          arm={set.arm}
          grip={set.grip}
          onArm={onSetArm}
          onGrip={onSetGrip}
          onClose={() => setVarOpen(false)}
        />
      ) : null}

      {plates ? (
        <InfoDialog
          testId="plate-dialog"
          title={t("session.plateCalcPerSideTitle")}
          message={plates}
          onClose={() => setPlates(null)}
        />
      ) : null}
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
  onClose,
}: {
  arm: string | null;
  grip: string | null;
  onArm: (v: "uni" | null) => void;
  onGrip: (v: string | null) => void;
  onClose: () => void;
}) {
  const isUni = arm === "uni";
  return (
    <SheetShell title={t("session.setVariantTitle")} onClose={onClose}>
      <SheetRow label={t("session.armColHeader")}>
        <VarOpt label={t("session.armBi")} active={!isUni} onPress={() => onArm(null)} />
        <VarOpt label={t("session.armUni")} active={isUni} onPress={() => onArm("uni")} />
      </SheetRow>
      <SheetRow label={t("variant.grip")}>
        <VarOpt label={t("variant.default")} active={!grip} onPress={() => onGrip(null)} />
        {GRIP_KEYS.map((g) => (
          <VarOpt key={g} label={gripLabel(g, lang)} active={grip === g} onPress={() => onGrip(g)} />
        ))}
      </SheetRow>
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
