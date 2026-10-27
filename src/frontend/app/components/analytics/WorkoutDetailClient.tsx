"use client";
// @plm SRS-005 SRS-054  세션 상세 — app의 features/analytics/WorkoutDetailScreen.tsx를 웹으로
//
// 지난 운동 하나를 펼쳐 본다: 총 볼륨·소요 시간 + 종목마다 세트 표(무게×횟수·RPE·태그)와
// 볼륨·추정 1RM. 값은 전부 `getWorkoutDetail`이 준 것을 그대로 놓는다(집계는 저장소 몫).
//
// 하위 화면 앱바(← · 제목 · ⋯). 잘못 완료한 기록의 삭제는 ⋯ 안에 있다 — 목록의 휴지통을 여기로 옮겼다(시안 05).
import { displayWeight, formatEnteredWeight, formatWeight, type WeightUnit } from "@app/core";
import { enteredWeightToKg } from "@app/core/domain/blockUnit"; // /qa code M-1 @plm SRS-067
import { type GripKey, gripLabel, variantLabelFromKey } from "@app/core/domain/variants";
import type { AppLanguage } from "@app/core/domain/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useToast } from "../Toast";
import { SubAppBar } from "../ui/AppBar";
import { ConfirmDialog, SheetShell } from "../ui/Dialog";
import { Button } from "../ui/Button";
import { MoreMenu } from "../ui/MoreMenu";
import { KpiRow } from "../ui/rows";
import { AppText, Card, Divider, EmptyState } from "../ui/primitives";
import { MetaLine } from "../ui/quiet";
import { LogoSpinner } from "../ui/LogoSpinner";
import { NameRoutine } from "../session/FinishRoutineSheets";
import { WorkoutNoteField } from "../session/WorkoutNoteField";
import { useExerciseName } from "@/lib/exerciseNames";
import { useStartGuard } from "../useStartGuard";
import { formatWorkoutDuration } from "@/lib/duration";

type AnalyticsRepo = typeof import("@app/core/data/analyticsRepository");
type Detail = Awaited<ReturnType<AnalyticsRepo["getWorkoutDetail"]>>;
type ExerciseDetail = Detail["exercises"][number];

export default function WorkoutDetailClient({ workoutId }: { workoutId: string }) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  // [원본] 화면 하나의 단위(프로필) — 이제 블록마다 단위가 있고 합계는 kg 다 @plm SRS-067
  // const [unit, setUnit] = useState<WeightUnit>("kg");
  // 칸 라벨(브랜드·커스텀 슬롯 이름)·언어 — 기록 상세에 수행 조합을 보인다(#59) @plm SRS-065
  const [lang, setLang] = useState<AppLanguage>("ko");
  const [slotLabels, setSlotLabels] = useState<string[]>([]);
  const replay = useStartGuard(); // 「이 운동 그대로 다시 시작」 @plm SRS-065
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [makeRoutine, setMakeRoutine] = useState(false); // 「이 운동으로 루틴 만들기」 @plm SRS-060
  // 세트 고치기·지우기(#51 A — PR 칩 「이 기록 보기」로 와서 잘못 남은 기록을 바로잡는다) @plm SRS-061
  const [editing, setEditing] = useState<null | { set: DetailSet; isCardio: boolean; unit: WeightUnit }>(
    null,
  );
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

  const startReplay = () =>
    replay.guard(async (replacing) => {
      const repo = await import("@app/core/data/workoutRepository");
      const w = (await repo.startWorkoutFromWorkout(workoutId, { replacing })) as unknown as {
        id: string;
        startedAt: number;
        name: string | null;
      };
      return w;
    });

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
        const u = user as unknown as {
          weightUnit?: WeightUnit;
          preferredLanguage?: AppLanguage;
          machineVariantLabels?: string[];
        } | null;
        // [원본] setUnit((u?.weightUnit ?? "kg") as WeightUnit);
        setLang(u?.preferredLanguage ?? "ko");
        setSlotLabels(u?.machineVariantLabels ?? []);
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
                        label: t("replay.start"),
                        testId: "btn-replay-menu",
                        onPress: () => startReplay(),
                      },
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
                    value: formatWeight(detail.totalVolumeKg, "kg"), // 합계는 kg(Q2 A) @plm SRS-067
                    testId: "detail-volume",
                  },
                  // [원본] { label: t("analytics.durationLabel"), value: duration(detail.workout.durationSeconds) },
                  // [개선] 1분 미만이면 칸을 뺀다(「-」 금지 · P3 QA M1) @plm SRS-071
                  ...(formatWorkoutDuration(detail.workout.durationSeconds)
                    ? [
                        {
                          label: t("analytics.durationLabel"),
                          value: formatWorkoutDuration(detail.workout.durationSeconds),
                        },
                      ]
                    : []),
                  {
                    label: "세트",
                    value: String(detail.exercises.reduce((n, ex) => n + ex.sets.length, 0)),
                  },
                ]}
              />
            </Card>

            {/* 다시 시작할 것이 있을 때만(워킹 세트가 있는 종목 · 유산소는 세트 하나라도) — 워밍업만 한 운동에서
                눌러 진행 중 운동만 폐기되던 길을 화면에서도 막는다(QA H-1 · planReplay 와 같은 기준) */}
            {detail.exercises.some((ex) => ex.sets.some((st) => ex.isCardio || !st.isWarmup)) ? (
              <div className="mb-[var(--spacing-lg)]">
                <Button
                  title={t("replay.start")}
                  icon="play"
                  variant="secondary"
                  testId="btn-replay"
                  loading={replay.busy}
                  onPress={startReplay}
                />
              </div>
            ) : null}

            {detail.exercises.length === 0 ? (
              <EmptyState icon="barbell-outline" title={t("analytics.noSetsTitle")} />
            ) : (
              <div data-testid="detail-exercises">
                {detail.exercises.map((ex) => (
                  <ExerciseCard
                    key={ex.workoutExerciseId}
                    ex={ex}
                    // [원본] unit={unit}
                    unit={ex.weightUnit ?? "kg"} // 이 블록에 적은 단위 @plm SRS-067
                    focusSet={focusSet}
                    onEditSet={(set) =>
                      setEditing({ set, isCardio: !!ex.isCardio, unit: ex.weightUnit ?? "kg" })
                    }
                    lang={lang}
                    slotLabels={slotLabels}
                  />
                ))}
              </div>
            )}
            {detail.exercises.some((ex) => ex.bestEstimated1RM > 0) ? (
              // 추정 1RM 주석은 화면에 한 번(D6) — 종목마다 붙던 것
              <AppText variant="caption" color="textFaint" className="mb-[var(--spacing-lg)] block">
                {t("wellness.oneRepMaxCaption")}
              </AppText>
            ) : null}

            {/* 운동 총평 — 나만 본다 · 나중에 써도 된다(#52 A) @plm SRS-064 */}
            <WorkoutNoteField
              key={detail.workout.id}
              workoutId={detail.workout.id}
              initial={detail.workout.notes ?? null}
            />
          </>
        )}
      </div>

      {editing ? (
        <EditSetSheet
          set={editing.set}
          isCardio={editing.isCardio}
          // [원본] unit={unit}
          unit={editing.unit} // 고치는 세트는 그 블록 단위로 @plm SRS-067
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

      {replay.sheet}

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
  lang = "ko",
  slotLabels = [],
}: {
  ex: ExerciseDetail;
  unit: WeightUnit;
  focusSet?: string | null;
  onEditSet?: (set: DetailSet) => void;
  lang?: AppLanguage;
  slotLabels?: string[];
}) {
  // 표시 이름(사용자가 고른 이름 ?? 대표 이름) — 다른 화면과 같은 이름 @plm SRS-056
  const shown = useExerciseName(ex.exerciseId);
  // 수행 조합(브랜드·핀/플레이트·부착물·손 그립) — 기본 칸이면 적지 않는다(#59) @plm SRS-065
  const slot = !ex.isCardio && ex.variantKey ? variantLabelFromKey(ex.variantKey, lang, slotLabels) : null;
  // 한쪽 입력 — 세트마다 배지를 달던 것을 종목 머리에 한 번(D6). 가장 큰 배수(보통 2)를 적는다. @plm SRS-070
  // [원본] 가장 큰 배수 하나를 머리에 — ×1·×2 세트가 섞이면 어느 세트가 한쪽인지 알 수 없었다(P2 /qa code L-4)
  // const oneSide = ex.sets.reduce((m, s) => Math.max(m, s.loadMultiplier ?? 1), 1);
  // [개선] 배수가 모두 같을 때만 머리에 한 번, 섞였으면 그 세트 줄에 「한쪽」
  const mults = ex.sets.map((s) => s.loadMultiplier ?? 1);
  const mixedOneSide = new Set(mults).size > 1;
  const oneSide = mixedOneSide ? 1 : (mults[0] ?? 1);
  // RPE 를 하나도 적지 않은 종목은 RPE 열을 그리지 않는다(빈 「-」 열 · D6)
  const hasRpe = ex.sets.some((s) => s.rpe != null);
  return (
    <Card className="mb-[var(--spacing-lg)]">
      {/* 머리 — 이름(왼쪽) · 추정 1RM(오른쪽, 회색 · 그 블록에 적은 단위 · F5) */}
      <div className="flex items-baseline justify-between gap-[var(--spacing-sm)]">
        <AppText variant="heading" className="block min-w-0 truncate">
          {shown ?? ex.exerciseName}
        </AppText>
        {ex.bestEstimated1RM > 0 ? (
          <span
            data-testid="detail-1rm"
            className="shrink-0 text-(--color-ink2) text-[length:var(--text-sm)] tabular-nums"
          >
            {/* [원본] formatWeight(ex.bestEstimated1RM, "kg") — 카드 맨 아래 따로 한 줄, lb 블록도 kg(F5) */}
            {t("summary.oneRm", { value: formatWeight(ex.bestEstimated1RM, unit) })}
          </span>
        ) : null}
      </div>
      {/* 메타 한 줄 — 조합 · 한쪽 입력 · 볼륨(상자·배지 없이 · D6) */}
      <MetaLine className="mt-[2px]">
        {slot ? (
          <span key="slot" data-testid="detail-slot">
            {slot}
          </span>
        ) : null}
        {oneSide > 1 ? (
          <span key="oneside" data-testid="detail-set-oneside">
            {t("analytics.oneSideHeader", { n: oneSide })}
          </span>
        ) : null}
        {unit === "lb" ? <span key="lb">{t("summary.lbEntered")}</span> : null}
        <span key="vol">{`${t("analytics.volumeLabel")} ${formatWeight(ex.volumeKg, "kg")}`}</span>
      </MetaLine>

      {ex.note ? (
        <div className="mt-[var(--spacing-xs)] rounded-[var(--radius-sm)] bg-(--color-surface-alt) px-[var(--spacing-sm)] py-[var(--spacing-xs)]">
          <AppText variant="caption" color="textMuted">
            {t("analytics.exerciseNote", { note: ex.note })}
          </AppText>
        </div>
      ) : null}

      <div className="mt-[var(--spacing-md)] flex items-center">
        <span className="w-10">
          <AppText variant="caption" color="textFaint">
            {t("analytics.setColumnHeader")}
          </AppText>
        </span>
        <span className="flex-1">
          <AppText variant="caption" color="textFaint">
            {t("analytics.weightRepsColumnHeader")}
          </AppText>
        </span>
        {hasRpe ? (
          <span className="w-12 text-right">
            <AppText variant="caption" color="textFaint">
              RPE
            </AppText>
          </span>
        ) : null}
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
          <div className="min-w-0 flex-1">
            <AppText variant="body">
              {`${formatEnteredWeight(s.weightKg, unit)} × ${s.reps}`}
              {s.partialReps ? (
                <AppText variant="body" color="textFaint">{` +${s.partialReps}`}</AppText>
              ) : null}
            </AppText>
            {/* 세트 표시 — 태그 상자 대신 회색 한 줄(워밍업·실패·원암·옛 손 그립) · 한쪽 입력은 머리에 한 번(D6)
                [원본] Tag(muted·danger·primary) 여러 개 + 세트마다 「한쪽 40kg ×2」 빨간 배지 */}
            <MetaLine className="text-[length:var(--text-xs)]">
              {s.isWarmup ? <span key="w">{t("analytics.warmupTag")}</span> : null}
              {/* [원본] text-(--color-warn) — 다크에서 PR 금색과 거의 같았다(금색 = PR 만 · P2 /qa code M-4).
                  「실패」는 오류가 아니라 기록 속성이라 진한 회색 + 굵게 */}
              {s.isFailed ? (
                <span key="f" className="font-semibold text-(--color-ink)">
                  {t("analytics.failedTag")}
                </span>
              ) : null}
              {mixedOneSide && (s.loadMultiplier ?? 1) > 1 ? (
                <span key="o" data-testid="detail-set-oneside-row">
                  {t("analytics.oneSideSet")}
                </span>
              ) : null}
              {s.arm === "uni" ? <span key="a">{t("session.armUni")}</span> : null}
              {s.grip ? (
                <span key="g" data-testid="detail-set-grip">
                  {gripLabel(s.grip as GripKey, lang) || s.grip}
                </span>
              ) : null}
            </MetaLine>
          </div>
          {hasRpe ? (
            <span className="w-12 text-right">
              <AppText variant="body" color="textMuted">
                {s.rpe != null ? String(s.rpe) : "-"}
              </AppText>
            </span>
          ) : null}
        </button>
      ))}
      {/* [원본] 카드 끝 「볼륨」·「추정 1RM」 두 줄 + Epley 주석 — 볼륨은 메타 줄, 1RM 은 머리 오른쪽, 주석은 화면 끝 한 번(D6) */}
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
  const [w, setW] = useState(() => String(displayWeight(set.weightKg, unit)));
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

  // [원본] const kg = toKg(Number.parseFloat(w.replace(",", ".")), unit);
  // [개선] 무게 칸을 그대로 두고 횟수만 고쳐도 2자리 표시 반올림으로 kg 가 미세하게 바뀌던 것(/qa code M-1) @plm SRS-067
  const enteredW = Number.parseFloat(w.replace(",", "."));
  const kg = enteredWeightToKg(enteredW, unit, set.weightKg as number) ?? (set.weightKg as number);
  const reps = Number.parseInt(r, 10);
  const valid =
    Number.isFinite(enteredW) && enteredW >= 0 && Number.isFinite(kg) && Number.isFinite(reps) && reps >= 0;

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

// biome-ignore lint/correctness/noUnusedVariables: 원복용 보존(코드 변경 보존 규칙)
function duration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "-";
  return t("common.minutesShort", { minutes: Math.round(seconds / 60) });
}
