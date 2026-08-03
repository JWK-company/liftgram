"use client";
// @plm SRS-004  운동 완료 요약 — app의 features/session/WorkoutSummaryScreen.tsx를 웹으로
//
// 운동을 마치면 뜨는 화면. 축하 헤더(트로피 · PR 내역) + 핵심 지표 3개.
//
// 값은 하나도 여기서 계산하지 않는다 — `completeWorkout`이 확정해 돌려준 요약을 그대로 놓는다
// (볼륨은 완료한 워킹 세트만, PR은 중량·볼륨 2종 — 전부 도메인 규칙이다).
//
// app에는 여기에 오운완 공유·연속일수·주간 목표도 있다. 그건 소셜·분석 계층을 옮길 때 따라온다.
import { formatWeight, type WeightUnit } from "@app/core";
import { t } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { AppText, StatTile, Tag } from "../ui/primitives";

export interface Summary {
  workoutId: string;
  totalVolumeKg: number;
  durationSeconds: number;
  workingSets: number;
  prCount: number;
  prs: {
    exerciseId: string;
    exerciseName: string;
    prs: { type: string; previous: number; current: number }[];
  }[];
}

export function WorkoutSummary({
  summary,
  unit,
  onClose,
}: {
  summary: Summary;
  unit: WeightUnit;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
      <div className="flex flex-col items-center">
        <Icon name="trophy" size={40} color="var(--color-pr)" />
        <AppText variant="display" center className="mt-[var(--spacing-sm)] block">
          {t("session.workoutComplete")}
        </AppText>

        {summary.prCount > 0 ? (
          <div className="mt-[var(--spacing-md)]">
            <Tag label={t("session.prCount", { count: summary.prCount })} tone="pr" />
          </div>
        ) : null}

        {/* 무엇이 갱신됐는지 종목별로 밝힌다 — "벤치프레스 · 중량 PR 105kg (이전 100kg)". */}
        {summary.prs.length > 0 ? (
          <div className="mt-[var(--spacing-sm)] flex flex-col items-center" data-testid="summary-pr-list">
            {summary.prs.flatMap((d) =>
              d.prs.map((p) => (
                <AppText
                  key={`${d.exerciseId}_${p.type}`}
                  variant="caption"
                  color="pr"
                  center
                  className="block"
                >
                  {`${d.exerciseName} · ${t(
                    p.type === "maxWeight" ? "session.prTypeWeight" : "session.prTypeVolume",
                  )} ${formatWeight(p.current, unit)}${
                    p.previous > 0
                      ? ` (${t("session.prPrev", { value: formatWeight(p.previous, unit) })})`
                      : ""
                  }`}
                </AppText>
              )),
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-[var(--spacing-lg)] flex gap-[var(--spacing-md)]">
        <StatTile
          testId="summary-volume"
          label={t("session.totalVolume")}
          value={formatWeight(summary.totalVolumeKg, unit)}
        />
        <StatTile
          testId="summary-duration"
          label={t("session.duration")}
          value={duration(summary.durationSeconds)}
        />
        <StatTile testId="summary-sets" label={t("session.setCount")} value={String(summary.workingSets)} />
      </div>
      <span className="hidden" data-testid="summary-prs">
        {summary.prCount}
      </span>

      {/* app은 여기서 탭으로 돌아간다 — 웹에서는 이 화면 자체가 세션 경로라 요약만 닫는다. */}
      <div className="mt-[var(--spacing-xl)]">
        <Button title={t("common.done")} testId="btn-summary-close" onPress={onClose} />
      </div>
    </div>
  );
}

/** `MM:SS` — app과 같이 분도 두 자리로 채운다. */
function duration(seconds: number | null): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
