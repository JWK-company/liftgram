"use client";
// @plm SRS-005 SRS-054  세션 상세 — app의 features/analytics/WorkoutDetailScreen.tsx를 웹으로
//
// 지난 운동 하나를 펼쳐 본다: 총 볼륨·소요 시간 + 종목마다 세트 표(무게×횟수·RPE·태그)와
// 볼륨·추정 1RM. 값은 전부 `getWorkoutDetail`이 준 것을 그대로 놓는다(집계는 저장소 몫).
//
// 하위 화면 앱바(← · 제목 · ⋯). 잘못 완료한 기록의 삭제는 ⋯ 안에 있다 — 목록의 휴지통을 여기로 옮겼다(시안 05).
import { formatWeight, fromKg, toKg, type WeightUnit } from "@app/core";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useToast } from "../Toast";
import { SubAppBar } from "../ui/AppBar";
import { ConfirmDialog, SheetShell } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { MoreMenu } from "../ui/MoreMenu";
import { KpiRow } from "../ui/rows";
import { AppText, Card, Divider, EmptyState, Tag } from "../ui/primitives";
import { LogoSpinner } from "../ui/LogoSpinner";
import { NameRoutine } from "../session/FinishRoutineSheets";

type AnalyticsRepo = typeof import("@app/core/data/analyticsRepository");
type Detail = Awaited<ReturnType<AnalyticsRepo["getWorkoutDetail"]>>;
type ExerciseDetail = Detail["exercises"][number];

export default function WorkoutDetailClient({ workoutId }: { workoutId: string }) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [unit, setUnit] = useState<WeightUnit>("kg");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [makeRoutine, setMakeRoutine] = useState(false); // 「이 운동으로 루틴 만들기」 @plm SRS-060
  // 세트 고치기·지우기(#51 A — PR 칩 「이 기록 보기」로 와서 잘못 남은 기록을 바로잡는다) @plm SRS-061
  const [editing, setEditing] = useState<null | { set: DetailSet; isCardio: boolean }>(null);
  const [reloadTick, setReloadTick] = useState(0);
  // ?set=<id> 로 오면 그 세트를 강조한다(PR 칩에서 온 경우)
  const [focusSet, setFocusSet] = useState<string | null>(null);
  useEffect(() => {
    try {
      setFocusSet(new URLSearchParams(window.location.search).get("set"));
    } catch {
      // 주소를 못 읽어도 화면은 그대로
    }
  }, []);
  const router = useRouter();
  const toast = useToast();

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadTick — 세트를 고친 뒤 다시 읽는다(#51)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [repo, userRepo] = await Promise.all([
          import("@app/core/data/analyticsRepository"),
          import("@app/core/data/userRepository"),
        ]);
        const [d, user] = await Promise.all([
          repo.getWorkoutDetail(workoutId),
          userRepo.getOrCreateLocalUser().catch(() => null),
        ]);
        if (cancelled) return;
        setDetail(d);
        setUnit(((user as unknown as { weightUnit?: WeightUnit } | null)?.weightUnit ?? "kg") as WeightUnit);
      } catch {
        // 지워졌거나 없는 세션 — 빈 상태로 알린다.
        if (!cancelled) setDetail(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workoutId, reloadTick]);

  // 강조할 세트가 그려지면 그 자리로 스크롤
  useEffect(() => {
    if (!focusSet || !detail) return;
    document.querySelector(`[data-set-id="${focusSet}"]`)?.scrollIntoView({ block: "center" });
  }, [focusSet, detail]);

  return (
    <div className="flex flex-1 flex-col">
      <SubAppBar
        title={t("analytics.historyTitle")}
        fallbackHref="/history"
        right={
          detail ? (
            <MoreMenu
              testId="btn-detail-menu"
              sheetTestId="detail-menu"
              options={[
                // 지난 운동 그대로 루틴으로(#59 일부) @plm SRS-060
                ...(detail.exercises.length > 0
                  ? [
                      {
                        label: t("finish.makeRoutine"),
                        testId: "btn-make-routine",
                        onPress: () => setMakeRoutine(true),
                      },
                    ]
                  : []),
                {
                  label: t("analytics.deleteWorkoutTitle"),
                  destructive: true,
                  testId: "btn-delete-workout",
                  onPress: () => setConfirmDelete(true),
                },
              ]}
            />
          ) : null
        }
      />

      <div className="flex-1 p-[var(--spacing-lg)]">
        {loading ? (
          <div className="flex justify-center py-[var(--spacing-xxl)]">
            <span role="status" className="inline-flex">
              <LogoSpinner size={36} label="불러오는 중" />
            </span>
          </div>
        ) : !detail ? (
          <EmptyState
            icon="alert-circle-outline"
            title={t("analytics.sessionNotFoundTitle")}
            message={t("analytics.sessionNotFoundMessage")}
          />
        ) : (
          <>
            <AppText variant="title" data-testid="detail-name" className="block">
              {detail.workout.name || t("analytics.workoutFallbackName")}
            </AppText>
            <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-xs)] block">
              {detail.workout.completedAt
                ? new Date(detail.workout.completedAt).toLocaleDateString("ko-KR")
                : ""}
            </AppText>

            <Card className="mt-[var(--spacing-lg)] mb-[var(--spacing-lg)]">
              <KpiRow
                items={[
                  {
                    label: t("analytics.totalVolumeLabel"),
                    value: formatWeight(detail.totalVolumeKg, unit),
                    testId: "detail-volume",
                  },
                  { label: t("analytics.durationLabel"), value: duration(detail.workout.durationSeconds) },
                  {
                    label: "세트",
                    value: String(detail.exercises.reduce((n, ex) => n + ex.sets.length, 0)),
                  },
                ]}
              />
            </Card>

            {detail.exercises.length === 0 ? (
              <EmptyState icon="barbell-outline" title={t("analytics.noSetsTitle")} />
            ) : (
              <div data-testid="detail-exercises">
                {detail.exercises.map((ex) => (
                  <ExerciseCard
                    key={ex.workoutExerciseId}
                    ex={ex}
                    unit={unit}
                    focusSet={focusSet}
                    onEditSet={(set) => setEditing({ set, isCardio: !!ex.isCardio })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {editing ? (
        <EditSetSheet
          set={editing.set}
          isCardio={editing.isCardio}
          unit={unit}
          onClose={() => setEditing(null)}
          onDone={(msg) => {
            setEditing(null);
            toast(msg);
            setReloadTick((n) => n + 1);
          }}
          onError={(e) => toast(e, "error")}
          workoutId={workoutId}
        />
      ) : null}

      {makeRoutine ? (
        <NameRoutine
          workoutId={workoutId}
          onCancel={() => setMakeRoutine(false)}
          onDone={() => setMakeRoutine(false)}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          testId="confirm-delete-workout"
          title={t("analytics.deleteWorkoutTitle")}
          message={t("analytics.deleteWorkoutMessage")}
          confirmLabel={t("common.delete")}
          destructive
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void (async () => {
              try {
                const workout = await import("@app/core/data/workoutRepository");
                await workout.discardWorkout(workoutId);
                const { flushLocalDb } = await import("@/lib/localDb");
                await flushLocalDb();
                router.replace("/history");
              } catch (e) {
                toast(e instanceof Error ? e.message : String(e), "error");
              }
            })();
          }}
        />
      ) : null}
    </div>
  );
}

function ExerciseCard({
  ex,
  unit,
  focusSet,
  onEditSet,
}: {
  ex: ExerciseDetail;
  unit: WeightUnit;
  focusSet?: string | null;
  onEditSet?: (set: DetailSet) => void;
}) {
  return (
    <Card className="mb-[var(--spacing-lg)]">
      <AppText variant="heading" className="block truncate">
        {ex.exerciseName}
      </AppText>

      {ex.note ? (
        <div className="mt-[var(--spacing-xs)] rounded-[var(--radius-sm)] bg-(--color-surface-alt) px-[var(--spacing-sm)] py-[var(--spacing-xs)]">
          <AppText variant="caption" color="textMuted">
            {t("analytics.exerciseNote", { note: ex.note })}
          </AppText>
        </div>
      ) : null}

      <div className="mt-[var(--spacing-md)] flex items-center">
        <span className="w-10">
          <AppText variant="label" color="textFaint">
            {t("analytics.setColumnHeader")}
          </AppText>
        </span>
        <span className="flex-1">
          <AppText variant="label" color="textFaint">
            {t("analytics.weightRepsColumnHeader")}
          </AppText>
        </span>
        <span className="w-12 text-right">
          <AppText variant="label" color="textFaint">
            RPE
          </AppText>
        </span>
      </div>
      <Divider className="my-[var(--spacing-xs)]!" />

      {ex.sets.map((s) => (
        // 세트 줄을 누르면 고치기·지우기 시트(#51) @plm SRS-061
        <button
          type="button"
          key={s.setNumber}
          data-testid="detail-set"
          data-set-id={s.id}
          disabled={!s.id || !onEditSet}
          onClick={() => onEditSet?.(s)}
          style={{ backgroundColor: focusSet && s.id === focusSet ? "var(--color-brand-muted)" : undefined }}
          className="flex w-full items-center rounded-[var(--radius-sm)] py-[var(--spacing-xs)] text-left"
        >
          <span className="w-10">
            <AppText variant="body" color="textMuted">
              {String(s.setNumber)}
            </AppText>
          </span>
          <div className="flex-1">
            <AppText variant="body">
              {`${formatWeight(s.weightKg, unit)} × ${s.reps}`}
              {s.partialReps ? (
                <AppText variant="body" color="textFaint">{` +${s.partialReps}`}</AppText>
              ) : null}
            </AppText>
            <div className="mt-[2px] flex gap-[var(--spacing-xs)]">
              {s.isWarmup ? <Tag label={t("analytics.warmupTag")} tone="muted" /> : null}
              {s.isFailed ? <Tag label={t("analytics.failedTag")} /> : null}
              {s.arm === "uni" ? <Tag label={t("session.armUni")} tone="primary" /> : null}
            </div>
          </div>
          <span className="w-12 text-right">
            <AppText variant="body" color="textMuted">
              {s.rpe != null ? String(s.rpe) : "-"}
            </AppText>
          </span>
        </button>
      ))}

      <Divider />
      <div className="flex items-center justify-between py-[var(--spacing-xs)]">
        <AppText variant="caption" color="textMuted">
          {t("analytics.volumeLabel")}
        </AppText>
        <AppText variant="body" className="font-semibold">
          {formatWeight(ex.volumeKg, unit)}
        </AppText>
      </div>
      <div className="flex items-center justify-between py-[var(--spacing-xs)]">
        <AppText variant="caption" color="textMuted">
          {t("wellness.oneRepMaxLabel")}
        </AppText>
        <AppText variant="body" className="font-bold">
          {formatWeight(ex.bestEstimated1RM, unit)}
        </AppText>
      </div>
      <AppText variant="caption" color="textFaint" className="mt-[2px] block">
        {t("wellness.oneRepMaxCaption")}
      </AppText>
    </Card>
  );
}

type DetailSet = ExerciseDetail["sets"][number];

/**
 * 지난 세트 고치기·지우기(#51 A) — 저장 뒤 그 운동의 볼륨과, 그 운동·이후 운동의 PR 수를 다시 센다
 * (`recomputeWorkoutTotals` · QA Q2). 유산소는 지우기만(QA Q7). @plm SRS-061
 */
function EditSetSheet({
  set,
  isCardio,
  unit,
  workoutId,
  onClose,
  onDone,
  onError,
}: {
  set: DetailSet;
  isCardio: boolean;
  unit: WeightUnit;
  workoutId: string;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [w, setW] = useState(() => String(fromKg(set.weightKg, unit)));
  const [r, setR] = useState(() => String(set.reps));
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = (
    fn: (repo: typeof import("@app/core/data/workoutRepository")) => Promise<void>,
    msg: string,
  ) => {
    if (busy || !set.id) return;
    setBusy(true);
    void (async () => {
      try {
        const repo = await import("@app/core/data/workoutRepository");
        await fn(repo);
        await repo.recomputeWorkoutTotals(workoutId);
        const { flushLocalDb } = await import("@/lib/localDb");
        await flushLocalDb();
        onDone(msg);
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    })();
  };

  const kg = toKg(Number.parseFloat(w.replace(",", ".")), unit);
  const reps = Number.parseInt(r, 10);
  const valid = Number.isFinite(kg) && kg >= 0 && Number.isFinite(reps) && reps >= 0;

  return (
    <SheetShell
      title={t("history.editSetTitle", { n: set.setNumber })}
      onClose={onClose}
      hideOk
      testId="edit-set-sheet"
    >
      {isCardio ? (
        <AppText variant="caption" color="textMuted" className="mb-[var(--spacing-md)] block">
          {t("history.cardioDeleteOnly")}
        </AppText>
      ) : (
        <div className="mb-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
          <label className="flex-1">
            <AppText variant="label" color="textMuted" className="mb-[4px] block">
              {unit}
            </AppText>
            <input
              data-testid="edit-set-weight"
              inputMode="decimal"
              value={w}
              onChange={(e) => setW(e.target.value)}
              className="h-11 w-full rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-surface-alt) text-center font-semibold text-(--color-ink)"
            />
          </label>
          <label className="flex-1">
            <AppText variant="label" color="textMuted" className="mb-[4px] block">
              {t("analytics.weightRepsColumnHeader")}
            </AppText>
            <input
              data-testid="edit-set-reps"
              inputMode="numeric"
              value={r}
              onChange={(e) => setR(e.target.value)}
              className="h-11 w-full rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-surface-alt) text-center font-semibold text-(--color-ink)"
            />
          </label>
        </div>
      )}
      <div className="flex gap-[var(--spacing-sm)]">
        <div className="flex-1">
          <Button
            title={t("history.deleteSet")}
            variant="secondary"
            testId="edit-set-delete"
            onPress={() => setConfirmDel(true)}
          />
        </div>
        {!isCardio ? (
          <div className="flex-1">
            <Button
              title={t("common.save")}
              testId="edit-set-save"
              loading={busy}
              disabled={!valid}
              onPress={() =>
                run(
                  (repo) => repo.updateSetLog(set.id as string, { weightKg: kg, reps }),
                  t("history.editSetSaved"),
                )
              }
            />
          </div>
        ) : null}
      </div>
      {confirmDel ? (
        <ConfirmDialog
          testId="confirm-delete-set"
          title={t("history.deleteSet")}
          message={t("history.deleteSetConfirm")}
          confirmLabel={t("common.delete")}
          destructive
          onCancel={() => setConfirmDel(false)}
          onConfirm={() => {
            setConfirmDel(false);
            run((repo) => repo.deleteSetLog(set.id as string), t("history.setDeleted"));
          }}
        />
      ) : null}
    </SheetShell>
  );
}

function duration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "-";
  return t("common.minutesShort", { minutes: Math.round(seconds / 60) });
}
