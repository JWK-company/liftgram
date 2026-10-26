"use client";
// @plm SRS-005 SRS-054  세션 상세 — app의 features/analytics/WorkoutDetailScreen.tsx를 웹으로
//
// 지난 운동 하나를 펼쳐 본다: 총 볼륨·소요 시간 + 종목마다 세트 표(무게×횟수·RPE·태그)와
// 볼륨·추정 1RM. 값은 전부 `getWorkoutDetail`이 준 것을 그대로 놓는다(집계는 저장소 몫).
//
// 하위 화면 앱바(← · 제목 · ⋯). 잘못 완료한 기록의 삭제는 ⋯ 안에 있다 — 목록의 휴지통을 여기로 옮겼다(시안 05).
import { formatWeight, type WeightUnit } from "@app/core";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useToast } from "../Toast";
import { SubAppBar } from "../ui/AppBar";
import { ConfirmDialog } from "../ui/Dialog";
import { MoreMenu } from "../ui/MoreMenu";
import { KpiRow } from "../ui/rows";
import { AppText, Card, Divider, EmptyState, Tag } from "../ui/primitives";
import { LogoSpinner } from "../ui/LogoSpinner";

type AnalyticsRepo = typeof import("@app/core/data/analyticsRepository");
type Detail = Awaited<ReturnType<AnalyticsRepo["getWorkoutDetail"]>>;
type ExerciseDetail = Detail["exercises"][number];

export default function WorkoutDetailClient({ workoutId }: { workoutId: string }) {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [unit, setUnit] = useState<WeightUnit>("kg");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();
  const toast = useToast();

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
  }, [workoutId]);

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
                  <ExerciseCard key={ex.workoutExerciseId} ex={ex} unit={unit} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

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

function ExerciseCard({ ex, unit }: { ex: ExerciseDetail; unit: WeightUnit }) {
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
        <div key={s.setNumber} className="flex items-center py-[var(--spacing-xs)]">
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
        </div>
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

function duration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "-";
  return t("common.minutesShort", { minutes: Math.round(seconds / 60) });
}
