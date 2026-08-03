"use client";
// @plm SRS-005  분석 탭 — app의 features/analytics/StatsTabScreen.tsx를 웹으로
//
// 기간(주·월·전체)을 고르면 그 구간의 볼륨·세션 수·세트 수, 추정 1RM 상위, 주간 볼륨 추세,
// 근육군 분포, 최근 PR을 보여 준다.
//
// **집계는 전부 저장소가 한다**(getOverview·getVolumeTrend·getMuscleDistribution·getRecentPRs).
// 화면에서 다시 세면 app과 숫자가 갈라진다 — 그건 사용자가 제일 먼저 알아채는 종류의 어긋남이다.
//
// 맨 아래 고지는 지우지 않는다: 이 앱은 웰니스 도구이지 의학적 판단을 하지 않는다(SRS-015).
import { formatWeight, muscleLabel, type MuscleGroup } from "@app/core";
import { useUser } from "@app/core/state/userContext";
import { useEffect, useState } from "react";
import { lang, t, type TransKey } from "@/lib/i18n";
import { SimpleBarChart, DistributionBars } from "../ui/charts";
import { AppText, Card, Divider, EmptyState, SectionHeader, StatTile, Tag } from "../ui/primitives";

type AnalyticsRepo = typeof import("@app/core/data/analyticsRepository");
type Overview = Awaited<ReturnType<AnalyticsRepo["getOverview"]>>;
type TrendPoint = Awaited<ReturnType<AnalyticsRepo["getVolumeTrend"]>>[number];
type RecentPR = Awaited<ReturnType<AnalyticsRepo["getRecentPRs"]>>[number];

type Period = "week" | "month" | "all";

const PERIODS: { key: Period; labelKey: TransKey }[] = [
  { key: "week", labelKey: "analytics.periodWeek" },
  { key: "month", labelKey: "analytics.periodMonth" },
  { key: "all", labelKey: "analytics.periodAll" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function sinceForPeriod(period: Period): number | undefined {
  const now = Date.now();
  if (period === "week") return now - 7 * DAY_MS;
  if (period === "month") return now - 30 * DAY_MS;
  return undefined;
}

export default function StatsClient() {
  const { weightUnit } = useUser();
  const [period, setPeriod] = useState<Period>("week");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [dist, setDist] = useState<{ muscle: MuscleGroup; volumeKg: number }[]>([]);
  const [recentPRs, setRecentPRs] = useState<RecentPR[]>([]);

  useEffect(() => {
    let cancelled = false;
    const sinceMs = sinceForPeriod(period);
    setLoading(true);
    void (async () => {
      try {
        const repo = await import("@app/core/data/analyticsRepository");
        const [o, tr, d, prs] = await Promise.all([
          repo.getOverview(sinceMs),
          repo.getVolumeTrend(sinceMs),
          repo.getMuscleDistribution(sinceMs),
          repo.getRecentPRs(10),
        ]);
        if (cancelled) return;
        setOverview(o);
        setTrend(tr);
        setDist(d);
        setRecentPRs(prs);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const hasData = !!overview && overview.sessionCount > 0;

  return (
    <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
      <AppText variant="title" className="mb-[var(--spacing-lg)] block">
        {t("analytics.title")}
      </AppText>

      <div className="mb-[var(--spacing-lg)] flex gap-[var(--spacing-sm)]">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            data-testid={`period-${p.key}`}
            onClick={() => setPeriod(p.key)}
            style={{
              backgroundColor: p.key === period ? "var(--color-brand)" : "var(--color-surface-alt)",
            }}
            className="rounded-[var(--radius-pill)] px-[var(--spacing-lg)] py-[var(--spacing-sm)]"
          >
            <AppText
              variant="caption"
              color={p.key === period ? "text" : "textMuted"}
              style={p.key === period ? { color: "var(--color-on-brand)" } : undefined}
              className={p.key === period ? "font-bold" : ""}
            >
              {t(p.labelKey)}
            </AppText>
          </button>
        ))}
      </div>

      {loading && !overview ? (
        <div className="flex justify-center py-[var(--spacing-xxl)]">
          <span
            role="status"
            aria-label={t("common.loading")}
            className="h-6 w-6 animate-spin rounded-full border-2 border-(--color-brand) border-t-transparent"
          />
        </div>
      ) : !hasData || !overview ? (
        <EmptyState
          icon="stats-chart"
          title={t("analytics.emptyTitle")}
          message={t("analytics.emptyMessage")}
        />
      ) : (
        <>
          <div className="mb-[var(--spacing-lg)] flex gap-[var(--spacing-sm)]">
            <StatTile
              testId="stat-volume"
              label={t("analytics.totalVolume")}
              value={formatWeight(overview.totalVolumeKg, weightUnit)}
            />
            <StatTile
              testId="stat-sessions"
              label={t("analytics.sessionCount")}
              value={String(overview.sessionCount)}
            />
            <StatTile
              testId="stat-sets"
              label={t("analytics.workingSets")}
              value={String(overview.workingSets)}
            />
          </div>

          <Card className="mb-[var(--spacing-lg)]">
            <SectionHeader title={t("wellness.oneRepMaxLabel")} />
            {overview.topOneRM.length === 0 ? (
              <AppText variant="caption" color="textFaint">
                {t("analytics.topOneRMEmpty")}
              </AppText>
            ) : (
              overview.topOneRM.map((row, i) => (
                <div key={row.exerciseId}>
                  {i > 0 ? <Divider /> : null}
                  <div className="flex items-center justify-between py-[var(--spacing-xs)]">
                    <AppText variant="body" className="mr-[var(--spacing-md)] flex-1 truncate">
                      {row.exerciseName}
                    </AppText>
                    <AppText variant="body" className="font-bold">
                      {formatWeight(row.estimated1RM, weightUnit)}
                    </AppText>
                  </div>
                </div>
              ))
            )}
            <AppText variant="caption" color="textFaint" className="mt-[var(--spacing-sm)] block">
              {t("wellness.oneRepMaxCaption")}
            </AppText>
          </Card>

          <Card className="mb-[var(--spacing-lg)]">
            <SectionHeader title={t("analytics.weeklyVolumeTrend")} />
            <SimpleBarChart
              data={trend.map((x) => ({ label: x.label, value: x.value }))}
              formatValue={(v) => String(Math.round(v))}
            />
          </Card>

          <Card className="mb-[var(--spacing-lg)]">
            <SectionHeader title={t("analytics.muscleDistribution")} />
            <DistributionBars
              data={dist.map((d) => ({ label: muscleLabel(d.muscle, lang), value: d.volumeKg }))}
              formatValue={(v) => formatWeight(v, weightUnit)}
            />
          </Card>

          <Card className="mb-[var(--spacing-lg)]">
            <SectionHeader title={t("analytics.recentPRs")} />
            {recentPRs.length === 0 ? (
              <AppText variant="caption" color="textFaint">
                {t("analytics.recentPRsEmpty")}
              </AppText>
            ) : (
              recentPRs.map((pr, i) => (
                <div key={`${pr.exerciseId}-${pr.completedAt}`}>
                  {i > 0 ? <Divider /> : null}
                  <div className="flex items-center justify-between py-[var(--spacing-xs)]">
                    <div className="mr-[var(--spacing-md)] min-w-0 flex-1">
                      <AppText variant="body" className="block truncate">
                        {pr.exerciseName}
                      </AppText>
                      <AppText variant="caption" color="textFaint" className="mt-[2px] block">
                        {new Date(pr.completedAt).toLocaleDateString("ko-KR")}
                      </AppText>
                    </div>
                    <div className="flex items-center gap-[var(--spacing-sm)]">
                      <AppText variant="body" className="font-bold">
                        {formatWeight(pr.estimated1RM, weightUnit)}
                      </AppText>
                      <Tag label={t("analytics.estimateTag")} tone="pr" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </Card>
        </>
      )}

      <AppText
        variant="caption"
        color="textFaint"
        center
        className="mt-[var(--spacing-sm)] mb-[var(--spacing-xl)] block"
      >
        {t("wellness.noMedicalClaimNotice")}
      </AppText>
    </div>
  );
}
