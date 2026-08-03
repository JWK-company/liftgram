"use client";
// @plm SRS-004  종목 블록 — app의 features/session/ExerciseBlock.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 세션에서 종목 하나가 차지하는 카드. 위에서 아래로:
//
//   헤더        ▲▼ · 종목명 · 상세 · 슈퍼셋 · 교체 · 삭제
//   메타 칩     기구 변형 · 슈퍼셋 배지 · **PR** · 이 종목 볼륨 · 체중 미설정 경고
//   팁 패널     운동 방법(2컷 시연 ↔ 단계 설명)
//   표 머리     세트 · 이전 · 무게 · 횟수
//   세트 줄들
//   세트 추가 · 메모 · 지난 메모 · 메모 이력 · 휴식 시간
//
// ── 여기서 계산하지 않는 것 ─────────────────────────────────────────────────
// 볼륨·PR·이전기록·제안 무게는 **전부 저장소와 도메인이 한다**(ADR-032). 이 파일은 그 결과를
// 배치할 뿐이다. 어시스트/맨몸의 유효무게 같은 규칙이 화면으로 새면 app과 갈라진다.
//
// ── 반응형 쿼리의 빈틈 ──────────────────────────────────────────────────────
// WatermelonDB의 관찰은 **행이 늘고 주는 것**은 알려 주지만 필드 수정은 알려 주지 않는다.
// 그래서 볼륨처럼 값이 바뀌어야 다시 그려야 하는 것은 app과 같이 1.5초 폴링으로 따라간다.
// ─────────────────────────────────────────────────────────────────────────────
import {
  canonicalVariantKey,
  effectiveWeightKg,
  formatWeight,
  resolveLoadMode,
  restSecondsForSetType,
  suggestNextSetWeightKg,
  type EquipmentType,
  type VariantDims,
  type WeightUnit,
  cardioMetricsFor,
  formatDistanceKm,
  formatDurationClock,
  sumCardio,
  type CardioMetric,
} from "@app/core";
import { getExerciseMedia } from "@app/core/data/exerciseMedia";
import { useQueryData } from "@app/core/db/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { firePrCelebration } from "../PrCelebration";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { NumberStepper } from "../ui/inputs";
import { AppText, Card, Tag } from "../ui/primitives";
import { VariantSelector } from "../ui/VariantSelector";
import { ExerciseName } from "./ExerciseName";
import { ExerciseTipPanel } from "./ExerciseTipPanel";
import { NoteHistoryPanel } from "./NoteHistoryPanel";
import { CARDIO_COL_LABEL, SetRowCardio } from "./SetRowCardio";
import { SetRowEdit, type PrevSet, type SetRow, type Suggestion } from "./SetRowEdit";

type WorkoutRepo = typeof import("@app/core/data/workoutRepository");

/** 이 블록이 모델에서 읽는 것만. */
export interface WorkoutExerciseRow {
  id: string;
  exerciseId: string;
  supersetGroup: string | null;
  restSeconds: number | null;
  note: string | null;
  variant: VariantDims | null;
  prescription: { repMin?: number | null; repMax?: number | null }[] | null;
}

export function ExerciseBlock({
  we,
  repo,
  unit,
  barWeightKg,
  bodyweightKg,
  onStartRest,
  onSwap,
  onMoveUp,
  onMoveDown,
  onSuperset,
  onUnsuperset,
  canSuperset,
  insideSuperset,
  onChanged,
}: {
  we: WorkoutExerciseRow;
  repo: WorkoutRepo;
  unit: WeightUnit;
  barWeightKg: number;
  bodyweightKg: number | null;
  onStartRest: (seconds: number) => void;
  onSwap?: (weId: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onSuperset?: () => void;
  onUnsuperset?: () => void;
  canSuperset?: boolean;
  insideSuperset?: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [prevSets, setPrevSets] = useState<PrevSet[]>([]);
  const [pr, setPr] = useState<{ weightKg: number; reps: number } | null>(null);
  const [prevCleared, setPrevCleared] = useState(false);
  const [loadMode, setLoadMode] = useState<"external" | "assisted" | "bodyweight">("external");
  const [baseEquipment, setBaseEquipment] = useState<EquipmentType | null>(null);
  const [isCardio, setIsCardio] = useState(false);
  // 종목마다 기록하는 지표가 다르다(러닝머신=경사·속도, 계단=단계, 줄넘기=시간만) — 도메인이 정한다.
  const [cardioMetrics, setCardioMetrics] = useState<CardioMetric[]>(["duration", "distance"]);
  const [exName, setExName] = useState<string | null>(null);
  const [variant, setVariant] = useState<VariantDims>(() => we.variant ?? {});
  const [restSeconds, setRestSeconds] = useState(we.restSeconds ?? 120);
  const [note, setNote] = useState(we.note ?? "");
  const [prevNote, setPrevNote] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [volTick, setVolTick] = useState(0);

  const variantKey = useMemo(() => canonicalVariantKey(variant), [variant]);

  // ── 종목 자체의 성질(기구·유산소·하중 모드) ──
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const exRepo = await import("@app/core/data/exerciseRepository");
        const e = (await exRepo.getExercise(we.exerciseId)) as unknown as {
          equipment: EquipmentType;
          kind: string | null;
          nameKo: string;
          nameEn: string | null;
        };
        if (!alive) return;
        setBaseEquipment(e.equipment);
        setIsCardio(e.kind === "cardio");
        setCardioMetrics(cardioMetricsFor({ nameEn: e.nameEn }));
        setExName(e.nameKo);
        setLoadMode(resolveLoadMode(e as Parameters<typeof resolveLoadMode>[0]));
      } catch {
        // 삭제된 종목 — 기본값으로 둔다.
      }
    })();
    return () => {
      alive = false;
    };
  }, [we.exerciseId]);

  // ── 이전 기록 · PR · 지난 메모 — 변형을 바꾸면 **버킷이 바뀌므로 전부 다시 읽는다** ──
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [sets, best, pnote] = await Promise.all([
        repo.getPreviousExerciseSets(we.exerciseId, variantKey).catch(() => []),
        repo.getExercisePR(we.exerciseId, variantKey).catch(() => null),
        repo.getPreviousExerciseNote(we.exerciseId, variantKey).catch(() => null),
      ]);
      if (!alive) return;
      setPrevSets(sets as PrevSet[]);
      setPr(best);
      setPrevNote(pnote);
      setPrevCleared(false);
    })();
    return () => {
      alive = false;
    };
  }, [repo, we.exerciseId, variantKey]);

  // ── 세트 목록(반응형) ──
  const models = useQueryData(() => repo.querySetLogs(we.id), [repo, we.id]);
  // `volTick`이 의존에 있는 것은 의도다 — 관찰은 **행의 증감**만 알리므로, 무게·완료 같은 **필드 변경**은
  // 주기적으로 다시 읽어야 화면에 반영된다(app도 같은 이유로 1.5초 폴링을 쓴다).
  // biome-ignore lint/correctness/useExhaustiveDependencies: 필드 변경을 따라잡기 위한 의도적 의존
  const sets: SetRow[] = useMemo(() => models.map((m) => m as unknown as SetRow), [models, volTick]);

  useEffect(() => {
    const iv = setInterval(() => setVolTick((v) => v + 1), 1500);
    return () => clearInterval(iv);
  }, []);

  /** 이 종목의 볼륨 — 완료한 워킹 세트만 센다(워밍업·실패 제외). 도메인의 유효무게 규칙을 쓴다. */
  const exVol = useMemo(() => {
    let volume = 0;
    let reps = 0;
    for (const s of sets) {
      if (!s.done || s.isWarmup || s.isFailed) continue;
      const w = effectiveWeightKg({
        weightKg: s.weightKg,
        reps: s.reps,
        loadMode,
        bodyweightKg: bodyweightKg ?? undefined,
      } as Parameters<typeof effectiveWeightKg>[0]);
      volume += w * s.reps;
      reps += s.reps;
    }
    return { volume, reps };
  }, [sets, loadMode, bodyweightKg]);

  /** 표시 순번 — 일반 세트만 번호가 오르고, 나머지는 W/D/F/T. app의 규칙 그대로다. */
  const labels = useMemo(() => {
    let normal = 0;
    return sets.map((s) => {
      if (s.isWarmup) return { label: "W", color: "pr" as const };
      if (s.isDrop === true) return { label: "D", color: "primary" as const };
      if (s.isFailed) return { label: "F", color: "danger" as const };
      if (s.setType === "top") return { label: "T", color: "textMuted" as const };
      normal += 1;
      return { label: String(normal), color: "textMuted" as const };
    });
  }, [sets]);

  const shownPrev = prevCleared ? [] : prevSets;

  /**
   * 유산소 합계 — **체크하지 않은 세트는 빼지 않는다**(`done !== false`).
   * 예전 레코드에는 `done`이 아예 없어서, 없는 것을 "안 한 것"으로 보면 옛 기록이 0이 된다.
   */
  const cardioTotal = (() => {
    if (!isCardio) return "";
    const { durationSec, distanceM } = sumCardio(sets.filter((s) => s.done !== false));
    const parts: string[] = [];
    if (durationSec > 0) parts.push(formatDurationClock(durationSec));
    if (distanceM > 0) parts.push(formatDistanceKm(distanceM));
    return parts.join(" · ");
  })();
  const hasPrev = prevSets.length > 0 || pr !== null || (!!prevNote && prevNote !== note.trim());
  const hasTip = !isCardio && !!exName && !!getExerciseMedia(exName);
  const bwRelative = loadMode === "assisted" || loadMode === "bodyweight";
  const bwMissing = bwRelative && bodyweightKg == null;

  const write = useCallback(
    async (fn: () => Promise<unknown>) => {
      await fn();
      await onChanged();
    },
    [onChanged],
  );

  const addSet = () =>
    void (async () => {
      setBusy(true);
      try {
        await write(() => repo.addSet(we.id, { cardio: isCardio, bodyweight: loadMode === "bodyweight" }));
      } finally {
        setBusy(false);
      }
    })();

  /**
   * 세트를 체크했을 때 — 휴식을 걸고, PR을 판정하고, 다음 세트 무게를 제안한다.
   *
   * 무게·횟수는 **화면 입력값**을 그대로 받는다(저장 커밋과 경합해 옛 값으로 PR을 판정하면 놓친다).
   */
  const onToggleDone = (s: SetRow) => (next: boolean, kg: number, reps: number) =>
    void (async () => {
      await write(() => repo.setSetDone(s.id, next));
      if (!next) return;

      // 휴식은 세트 타입이 정한다 — 웜업은 짧게, 탑세트는 길게(처방이 없으면 종목 설정값).
      onStartRest(
        restSecondsForSetType(s.setType as Parameters<typeof restSecondsForSetType>[0], restSeconds),
      );

      try {
        const prs = await repo.evalLiveSetPr(we.id, s.id, kg, reps);
        if (prs.length && exName) firePrCelebration({ exerciseName: exName, types: prs.map((p) => p.type) });
      } catch {
        // PR 판정이 실패해도 기록은 남는다 — 축하만 건너뛴다.
      }

      // 다음 처방 세트가 있으면 무게를 권한다(웜업 사다리·탑→백오프 비율은 도메인이 안다).
      if (kg > 0) {
        const idx = sets.findIndex((x) => x.id === s.id);
        const nextSet = sets.slice(idx + 1).find((x) => !x.done && x.setType != null);
        if (nextSet) {
          const sug = suggestNextSetWeightKg({
            prevWeightKg: kg,
            prevType: s.setType as Parameters<typeof suggestNextSetWeightKg>[0]["prevType"],
            nextType: nextSet.setType as Parameters<typeof suggestNextSetWeightKg>[0]["nextType"],
          });
          if (sug) setSuggestions((m) => ({ ...m, [nextSet.id]: sug }));
        }
      }
    })();

  const prevClearBtn =
    !isCardio && (hasPrev || prevCleared) ? (
      <button
        type="button"
        data-testid="prev-clear"
        onClick={() => setPrevCleared((v) => !v)}
        className="py-[2px]"
      >
        <AppText variant="label" color="textFaint">
          {prevCleared ? t("session.showPrev") : t("session.clearPrev")}
        </AppText>
      </button>
    ) : undefined;

  return (
    <Card
      className={
        insideSuperset ? "border-0! bg-transparent! p-0! py-[var(--spacing-sm)]!" : "mb-[var(--spacing-lg)]"
      }
    >
      <div data-testid={`we-${we.id}`}>
        {/* 헤더 */}
        <div className="flex items-start">
          {onMoveUp || onMoveDown ? (
            <div className="mr-[2px] flex w-[30px] shrink-0 flex-col gap-[2px]">
              <IconButton
                icon="chevron-up"
                size={20}
                label={t("session.moveUp")}
                disabled={!onMoveUp}
                color={onMoveUp ? "var(--color-ink2)" : "var(--color-line)"}
                onPress={onMoveUp}
                className="h-6! w-[30px]!"
              />
              <IconButton
                icon="chevron-down"
                size={20}
                label={t("session.moveDown")}
                disabled={!onMoveDown}
                color={onMoveDown ? "var(--color-ink2)" : "var(--color-line)"}
                onPress={onMoveDown}
                className="h-6! w-[30px]!"
              />
            </div>
          ) : null}

          <div className="min-w-0 flex-1">
            <ExerciseName exerciseId={we.exerciseId} variant="heading" base revealOnTap testId="we-name" />
          </div>

          <a
            href={`/exercise/${we.exerciseId}`}
            aria-label={t("nav.exerciseDetail")}
            className="flex h-10 w-10 shrink-0 items-center justify-center"
          >
            <Icon name="information-circle-outline" size={20} color="var(--color-ink2)" />
          </a>

          {!insideSuperset && canSuperset && (onSuperset || onUnsuperset) ? (
            <IconButton
              icon="git-merge-outline"
              label={t("session.superset")}
              color={we.supersetGroup ? "var(--color-brand)" : "var(--color-ink2)"}
              onPress={we.supersetGroup ? onUnsuperset : onSuperset}
              testId="btn-superset"
            />
          ) : null}

          {onSwap ? (
            <IconButton
              icon="swap-horizontal-outline"
              label={t("routines.swap")}
              onPress={() => onSwap(we.id)}
              testId="btn-swap"
            />
          ) : null}

          <IconButton
            icon="trash-outline"
            label={t("session.removeExerciseTitle")}
            onPress={() => setConfirmRemove(true)}
            testId="btn-remove-exercise"
          />
        </div>

        {/* 메타 칩 — 변형 · 슈퍼셋 · PR · 볼륨 · 경고 */}
        <div className="mt-[4px] flex flex-wrap items-center gap-[var(--spacing-sm)]">
          {!isCardio ? (
            <VariantSelector
              baseEquipment={baseEquipment}
              value={variant}
              onChange={(dims) => {
                setVariant(dims);
                void write(() => repo.setVariant(we.id, dims));
              }}
            />
          ) : null}

          {we.supersetGroup && !insideSuperset ? <Tag label={t("session.superset")} tone="primary" /> : null}

          {!isCardio && pr && !prevCleared ? (
            <AppText variant="caption" color="pr" data-testid="pr-chip">
              {t("session.prLine", { weight: formatWeight(pr.weightKg, unit), reps: pr.reps })}
            </AppText>
          ) : null}

          {!isCardio && (exVol.volume > 0 || exVol.reps > 0) ? (
            <Tag
              tone="primary"
              label={
                exVol.volume > 0
                  ? t("session.exVolume", { volume: formatWeight(exVol.volume, unit) })
                  : t("session.exTotalReps", { reps: exVol.reps })
              }
            />
          ) : null}

          {/* 유산소는 볼륨 대신 총 시간·거리를 보여 준다 — 무게·횟수가 없으니 볼륨 칩은 늘 0이다. */}
          {isCardio && cardioTotal ? (
            <Tag tone="primary" label={t("session.cardioTotal", { total: cardioTotal })} />
          ) : null}

          {bwMissing ? (
            <AppText variant="label" color="warning">
              {t("session.bodyweightNeeded")}
            </AppText>
          ) : null}

          {!hasTip ? prevClearBtn : null}
        </div>

        {!isCardio ? <ExerciseTipPanel nameKo={exName} trailing={hasTip ? prevClearBtn : undefined} /> : null}

        {/* 표 머리 */}
        <div className="mt-[var(--spacing-md)] flex gap-[4px] pb-[4px]">
          <HeadCell className="w-[34px]">{t("session.setColHeader")}</HeadCell>
          <HeadCell className="w-[66px]">{t("session.prevColHeader")}</HeadCell>
          {isCardio ? (
            cardioMetrics.map((m) => (
              <HeadCell key={m} className="flex-1">
                {t(CARDIO_COL_LABEL[m])}
              </HeadCell>
            ))
          ) : (
            <>
              <HeadCell className="flex-1">
                {loadMode === "assisted"
                  ? t("session.assistColHeader")
                  : loadMode === "bodyweight"
                    ? t("session.addedColHeader")
                    : t("session.weightLabel", { weightUnit: unit })}
              </HeadCell>
              <HeadCell className="flex-1">{t("session.repsLabel")}</HeadCell>
            </>
          )}
          <span className="w-[38px] shrink-0" />
          <span className="w-[34px] shrink-0" />
        </div>

        <div data-testid="set-list">
          {sets.map((s, i) =>
            isCardio ? (
              <SetRowCardio
                key={s.id}
                set={s}
                label={String(i + 1)}
                prev={shownPrev[i] ?? null}
                metrics={cardioMetrics}
                onUpdate={(patch: Record<string, number | null>) =>
                  void write(() => repo.updateSetLog(s.id, patch))
                }
                // 유산소에는 무게·횟수가 없다 — 완료 표시만 넘긴다(휴식은 같은 규칙으로 시작된다).
                onToggleDone={() => onToggleDone(s)(!(s.done === true), 0, 0)}
                onDelete={() => void write(() => repo.deleteSetLog(s.id))}
              />
            ) : (
              <SetRowEdit
                key={s.id}
                set={s}
                label={labels[i].label}
                labelColor={labels[i].color}
                prev={shownPrev[i] ?? null}
                rx={we.prescription?.[s.setNumber - 1] ?? null}
                suggestion={suggestions[s.id] ?? null}
                unit={unit}
                barWeightKg={barWeightKg}
                onUpdate={(patch) => void write(() => repo.updateSetLog(s.id, patch))}
                onToggleDone={onToggleDone(s)}
                onSetType={(type) => void write(() => repo.setSetType(s.id, type))}
                onSetArm={(arm) => void write(() => repo.setSetArm(s.id, arm))}
                onSetGrip={(grip) => void write(() => repo.setSetGrip(s.id, grip))}
                onDelete={() => void write(() => repo.deleteSetLog(s.id))}
                onApplySuggestion={() => {
                  const sug = suggestions[s.id];
                  if (!sug) return;
                  void write(() => repo.updateSetLog(s.id, { weightKg: sug.weightKg }));
                  setSuggestions((m) => {
                    const { [s.id]: _drop, ...rest } = m;
                    return rest;
                  });
                }}
              />
            ),
          )}
        </div>

        <div className="mt-[var(--spacing-sm)]">
          <Button
            title={t("session.addSet")}
            icon="add"
            variant="secondary"
            loading={busy}
            onPress={addSet}
            testId="btn-add-set"
          />
        </div>

        {/* 메모 — 그날의 느낌·포인트. 다음에 같은 종목을 할 때 지난 메모로 보인다. */}
        <textarea
          data-testid="we-note"
          value={note}
          rows={2}
          placeholder={t("session.notePlaceholder")}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => void write(() => repo.setWorkoutExerciseNote(we.id, note))}
          className="mt-[var(--spacing-sm)] min-h-[38px] w-full rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface-alt) p-[var(--spacing-md)] text-[length:var(--text-md)] text-(--color-ink) placeholder:text-(--color-ink3)"
        />

        {!prevCleared && prevNote && prevNote !== note.trim() ? (
          <AppText variant="caption" color="textFaint" className="mt-[2px] block">
            {t("session.prevNote", { note: prevNote })}
          </AppText>
        ) : null}

        {prevNote ? (
          <NoteHistoryPanel repo={repo} exerciseId={we.exerciseId} variantKey={variantKey} />
        ) : null}

        {/* 휴식 시간 — 이 종목의 **설정값**이다. 카운트다운 자체는 운동 전체에 하나뿐이다. */}
        <div className="mt-[var(--spacing-md)] flex min-h-[44px] items-center justify-between">
          <AppText variant="caption" color="textMuted">
            {t("session.restTime")}
          </AppText>
          <NumberStepper
            testId="rest-seconds"
            value={restSeconds}
            step={15}
            min={0}
            max={600}
            suffix={t("session.secondsSuffix")}
            // app과 같이 **이 세션 동안의 설정**이다 — 저장소에 쓰지 않는다.
            onChange={setRestSeconds}
          />
        </div>
      </div>

      {confirmRemove ? (
        <ConfirmDialog
          testId="confirm-remove-exercise"
          title={t("session.removeExerciseTitle")}
          message={t("session.removeExerciseMessage")}
          confirmLabel={t("common.delete")}
          destructive
          onCancel={() => setConfirmRemove(false)}
          onConfirm={() => {
            setConfirmRemove(false);
            void write(() => repo.removeWorkoutExercise(we.id));
          }}
        />
      ) : null}
    </Card>
  );
}

function HeadCell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`shrink-0 text-center ${className}`}>
      <AppText variant="label" color="textFaint">
        {children}
      </AppText>
    </span>
  );
}
