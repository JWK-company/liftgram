"use client";
// @plm SRS-005  기록 탭 — app의 features/analytics/HistoryTabScreen.tsx를 웹으로
//
// 완료한 세션 목록. 한 줄에 이름·날짜·PR 배지·볼륨·시간을 담고, 누르면 상세로 간다.
// 잘못 완료한 기록은 여기서 지운다(세트·종목까지 전부 — 되돌릴 수 없어 확인창을 세운다).
import { formatWeight } from "@app/core";
import { useQueryData } from "@app/core/db/hooks";
import { useUser } from "@app/core/state/userContext";
import { useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { useToast } from "../Toast";
import { ConfirmDialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { AppText, Card, EmptyState, Tag } from "../ui/primitives";

type AnalyticsRepo = typeof import("@app/core/data/analyticsRepository");
type WorkoutRepo = typeof import("@app/core/data/workoutRepository");

interface WorkoutRow {
  id: string;
  name: string | null;
  completedAt: number | null;
  totalVolumeKg: number;
  durationSeconds: number | null;
  prCount: number;
}

export default function HistoryClient() {
  const { weightUnit } = useUser();
  const toast = useToast();
  const [repos, setRepos] = useState<{ analytics: AnalyticsRepo; workout: WorkoutRepo } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WorkoutRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [analytics, workout] = await Promise.all([
        import("@app/core/data/analyticsRepository"),
        import("@app/core/data/workoutRepository"),
      ]);
      if (!cancelled) setRepos({ analytics, workout });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const models = useQueryData(() => (repos ? repos.analytics.queryWorkoutHistory() : null), [repos]);
  const workouts: WorkoutRow[] = useMemo(() => models.map((m) => m as unknown as WorkoutRow), [models]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-[var(--spacing-lg)] pt-[var(--spacing-lg)] pb-[var(--spacing-sm)]">
        <AppText variant="title">{t("analytics.historyTitle")}</AppText>
      </div>

      <div className="flex-1 p-[var(--spacing-lg)] pt-[var(--spacing-sm)]">
        {workouts.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title={t("analytics.historyEmptyTitle")}
            message={t("analytics.historyEmptyMessage")}
          />
        ) : (
          <div data-testid="history-list">
            {workouts.map((w) => (
              <Card key={w.id} className="mb-[var(--spacing-md)]">
                <div data-testid={`history-${w.id}`}>
                  <div className="flex items-start justify-between">
                    <a href={`/history/${w.id}`} className="mr-[var(--spacing-md)] min-w-0 flex-1">
                      <AppText variant="heading" className="block truncate">
                        {w.name || t("analytics.workoutNameFallback")}
                      </AppText>
                      <AppText variant="caption" color="textMuted" className="mt-[2px] block">
                        {w.completedAt ? new Date(w.completedAt).toLocaleDateString("ko-KR") : ""}
                      </AppText>
                    </a>
                    <div className="flex items-center gap-[var(--spacing-sm)]">
                      {w.prCount > 0 ? <Tag label={`PR ${w.prCount}`} tone="pr" /> : null}
                      <IconButton
                        icon="trash-outline"
                        size={18}
                        label={t("analytics.deleteWorkoutTitle")}
                        testId="btn-delete-workout"
                        onPress={() => setConfirmDelete(w)}
                      />
                      <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
                    </div>
                  </div>

                  <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-xl)]">
                    <Meta
                      label={t("analytics.metaVolume")}
                      value={formatWeight(w.totalVolumeKg, weightUnit)}
                    />
                    <Meta label={t("analytics.metaDuration")} value={duration(w.durationSeconds)} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          testId="confirm-delete-workout"
          title={t("analytics.deleteWorkoutTitle")}
          message={t("analytics.deleteWorkoutMessage")}
          confirmLabel={t("common.delete")}
          destructive
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const target = confirmDelete;
            setConfirmDelete(null);
            void (async () => {
              try {
                await repos?.workout.discardWorkout(target.id);
                const { flushLocalDb } = await import("@/lib/localDb");
                await flushLocalDb();
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

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <AppText variant="label" color="textFaint" className="block">
        {label}
      </AppText>
      <AppText variant="body" className="mt-[2px] block font-semibold">
        {value}
      </AppText>
    </div>
  );
}

/** 분 단위로만 보여 준다 — 초까지 볼 이유가 없다(app과 같다). */
function duration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "-";
  return t("common.minutesShort", { minutes: Math.round(seconds / 60) });
}
