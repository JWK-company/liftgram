"use client";
// @plm SRS-005 SRS-054  분석 탭 — app의 features/analytics/StatsTabScreen.tsx를 웹으로 · 시안 07 배치
//
// 기간(주·월·3개월·전체)을 구간 선택기로 고르면 그 구간의 볼륨·세션 수·세트 수, 추정 1RM 상위,
// 주간 볼륨 추세, 근육군 분포, 최근 PR을 보여 준다.
//
// 배치(시안 07): 맨 위 **대표 숫자 하나**(기간 볼륨)와 지난 같은 기간 대비 변화 + 추세 막대 →
// 숫자 한 줄(세션·워킹 세트·세션당 볼륨) → 1RM·부위·PR은 **줄 목록**(종목이 늘어도 카드가 길어지지 않게).
// 추세 막대는 언제나 최소 8칸이다 — 기록이 한 주뿐이어도 빈 칸을 보여 줘 막대 하나가 판을 꽉 채우지 않게.
//
// **집계는 전부 저장소가 한다**(getOverview·getVolumeTrend·getMuscleDistribution·getRecentPRs).
// 화면에서 다시 세면 app과 숫자가 갈라진다 — 그건 사용자가 제일 먼저 알아채는 종류의 어긋남이다.
// 지난 기간 대비는 같은 함수를 두 번(2배 구간 − 이번 구간) 불러 얻는다 — 새 집계를 만들지 않는다.
//
// 맨 아래 고지는 지우지 않는다: 이 앱은 웰니스 도구이지 의학적 판단을 하지 않는다(SRS-015).
import { AppBar } from "../ui/AppBar";
import { routes } from "@app/contracts";
import { formatWeight, muscleLabel, type MuscleGroup } from "@app/core";
import { useUser } from "@app/core/state/userContext";
import { useEffect, useState } from "react";
import { lang, t } from "@/lib/i18n";
import { DistributionBars } from "../ui/charts";
import { AppText, Card, EmptyState } from "../ui/primitives";
import { KpiRow, ListGroup, ListRow, SectionLabel, Segmented } from "../ui/rows";
import { LogoSpinner } from "../ui/LogoSpinner";

type AnalyticsRepo = typeof import("@app/core/data/analyticsRepository");
type Overview = Awaited<ReturnType<AnalyticsRepo["getOverview"]>>;
type TrendPoint = Awaited<ReturnType<AnalyticsRepo["getVolumeTrend"]>>[number];
type RecentPR = Awaited<ReturnType<AnalyticsRepo["getRecentPRs"]>>[number];

type Period = "week" | "month" | "quarter" | "all";

const PERIODS: { key: Period; label: string; hero: string }[] = [
  { key: "week", label: t("analytics.periodWeek"), hero: "최근 7일 볼륨" },
  { key: "month", label: t("analytics.periodMonth"), hero: "최근 30일 볼륨" },
  { key: "quarter", label: "3개월", hero: "최근 3개월 볼륨" },
  { key: "all", label: t("analytics.periodAll"), hero: "전체 볼륨" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const SPAN: Record<Period, number | null> = { week: 7, month: 30, quarter: 90, all: null };
const MIN_BARS = 8;
const MAX_BARS = 12;

function weekStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // 월요일
  return d.getTime();
}

/** 주간 추세를 최소 8칸으로 — 빈 주는 0으로 채우고, 이번 주를 끝 칸에 둔다. */
function padTrend(points: TrendPoint[]): { label: string; value: number; current: boolean }[] {
  const byWeek = new Map(points.map((p) => [weekStart(p.bucketMs), p.value]));
  const thisWeek = weekStart(Date.now());
  const first = points.length ? weekStart(points[0].bucketMs) : thisWeek;
  const span = Math.round((thisWeek - first) / (7 * DAY_MS)) + 1;
  const n = Math.min(MAX_BARS, Math.max(MIN_BARS, span));
  return Array.from({ length: n }, (_, i) => {
    const wk = new Date(thisWeek);
    wk.setDate(wk.getDate() - (n - 1 - i) * 7);
    const ms = weekStart(wk.getTime());
    return {
      label: `${wk.getMonth() + 1}/${wk.getDate()}`,
      value: byWeek.get(ms) ?? 0,
      current: ms === thisWeek,
    };
  });
}

export default function StatsClient() {
  const { weightUnit } = useUser();
  const [period, setPeriod] = useState<Period>("week");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [prevVolume, setPrevVolume] = useState<number | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [dist, setDist] = useState<{ muscle: MuscleGroup; volumeKg: number }[]>([]);
  const [recentPRs, setRecentPRs] = useState<RecentPR[]>([]);

  useEffect(() => {
    let cancelled = false;
    const days = SPAN[period];
    const now = Date.now();
    const sinceMs = days ? now - days * DAY_MS : undefined;
    const prevSince = days ? now - 2 * days * DAY_MS : undefined;
    setLoading(true);
    void (async () => {
      try {
        const repo = await import("@app/core/data/analyticsRepository");
        const [o, o2, tr, d, prs] = await Promise.all([
          repo.getOverview(sinceMs),
          prevSince ? repo.getOverview(prevSince) : Promise.resolve(null),
          // 추세는 기간과 상관없이 최근 몇 주를 본다 — 「이번 주」 를 골라도 막대가 하나만 남지 않게.
          repo.getVolumeTrend(now - MAX_BARS * 7 * DAY_MS),
          repo.getMuscleDistribution(sinceMs),
          repo.getRecentPRs(10),
        ]);
        if (cancelled) return;
        setOverview(o);
        setPrevVolume(o2 ? o2.totalVolumeKg - o.totalVolumeKg : null);
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
  // 종목별 가장 최근 1RM 갱신 시각 · 위 1RM 목록에 없는 종목의 최근 PR(종목당 한 줄) — 화면 정리 P2
  const lastPrOf = new Map<string, number>();
  for (const pr of recentPRs) {
    if ((lastPrOf.get(pr.exerciseId) ?? 0) < pr.completedAt) lastPrOf.set(pr.exerciseId, pr.completedAt);
  }
  const topIds = new Set(overview?.topOneRM.map((r) => r.exerciseId) ?? []);
  const otherPRs = recentPRs.filter(
    (pr) => !topIds.has(pr.exerciseId) && lastPrOf.get(pr.exerciseId) === pr.completedAt,
  );
  const meta = PERIODS.find((p) => p.key === period) ?? PERIODS[0];

  return (
    <div className="flex flex-1 flex-col">
      <AppBar title={t("analytics.title")} />
      <div className="flex flex-1 flex-col px-[var(--spacing-lg)] pt-[var(--spacing-md)]">
        <Segmented
          testId="stats-period"
          className="mb-[var(--spacing-lg)]"
          value={period}
          onChange={setPeriod}
          items={PERIODS.map((p) => ({ value: p.key, label: p.label, testId: `period-${p.key}` }))}
        />

        {loading && !overview ? (
          <div className="flex justify-center py-[var(--spacing-xxl)]">
            <span role="status" className="inline-flex">
              <LogoSpinner size={36} label="불러오는 중" />
            </span>
          </div>
        ) : !hasData || !overview ? (
          <EmptyState
            icon="stats-chart"
            title={t("analytics.emptyTitle")}
            message={t("analytics.emptyMessage")}
          />
        ) : (
          <>
            <Card className="mb-[var(--spacing-md)]">
              <AppText variant="caption" color="textMuted" className="block">
                {meta.hero}
              </AppText>
              <div className="mt-[2px] flex items-baseline gap-[var(--spacing-sm)]">
                <span
                  data-testid="stat-volume"
                  className="font-bold text-(--color-ink) text-[length:var(--text-xxl)] tabular-nums leading-tight"
                >
                  {formatWeight(overview.totalVolumeKg, weightUnit)}
                </span>
                <Delta now={overview.totalVolumeKg} prev={prevVolume} period={period} />
              </div>
              <TrendBars data={padTrend(trend)} />
            </Card>

            <Card className="mb-[var(--spacing-lg)]">
              <KpiRow
                items={[
                  {
                    label: t("analytics.sessionCount"),
                    value: String(overview.sessionCount),
                    testId: "stat-sessions",
                  },
                  {
                    label: t("analytics.workingSets"),
                    value: String(overview.workingSets),
                    testId: "stat-sets",
                  },
                  {
                    label: "세션당 볼륨",
                    value: formatWeight(
                      overview.totalVolumeKg / Math.max(1, overview.sessionCount),
                      weightUnit,
                    ),
                  },
                ]}
              />
            </Card>

            <SectionLabel title={t("wellness.oneRepMaxLabel")} />
            {overview.topOneRM.length === 0 ? (
              <AppText
                variant="caption"
                color="textFaint"
                className="mb-[var(--spacing-lg)] block px-[var(--spacing-xs)]"
              >
                {t("analytics.topOneRMEmpty")}
              </AppText>
            ) : (
              <ListGroup className="mb-[var(--spacing-xs)]" testId="stats-1rm">
                {overview.topOneRM.map((row) => (
                  <ListRow
                    key={row.exerciseId}
                    title={row.exerciseName}
                    // 최근에 언제 깼는지 — 아래 「최근 PR」 목록과 같은 종목을 두 번 쓰지 않으려고 여기 붙인다(화면 정리 P2)
                    subtitle={
                      lastPrOf.get(row.exerciseId)
                        ? t("analytics.lastPrOn", {
                            date: new Date(lastPrOf.get(row.exerciseId) as number).toLocaleDateString(
                              "ko-KR",
                              {
                                month: "numeric",
                                day: "numeric",
                              },
                            ),
                          })
                        : undefined
                    }
                    value={
                      <span className="font-bold text-(--color-ink)">
                        {formatWeight(row.estimated1RM, weightUnit)}
                      </span>
                    }
                    href={routes.exercise(row.exerciseId)}
                  />
                ))}
              </ListGroup>
            )}
            {/* [원본] 추정 주석이 여기 — 아래 「최근 PR」 의 「추정치」 태그(줄마다)와 같은 말이었다. 주석은 두 목록 끝에 한 번. */}
            <div className="mb-[var(--spacing-lg)]" />

            <SectionLabel title={t("analytics.muscleDistribution")} />
            <Card className="mb-[var(--spacing-lg)]">
              <DistributionBars
                data={dist.map((d) => ({ label: muscleLabel(d.muscle, lang), value: d.volumeKg }))}
                formatValue={(v) => formatWeight(v, weightUnit)}
              />
            </Card>

            {/* 최근 PR — 위 1RM 목록에 있는 종목은 거기 「최근 갱신」 으로 붙었으니 뺀다 · 종목당 가장 최근 한 줄.
                [원본] 종목마다 갱신 이력 여러 줄 + 줄마다 금색 「추정치」 태그(7개) — 같은 종목이 위아래 두 번 나왔다 */}
            {/* 위 목록에 다 나왔으면 구역째 숨긴다(빈 안내 문장만 남지 않게) — 기록이 아예 없을 때만 빈 안내 */}
            {otherPRs.length > 0 || recentPRs.length === 0 ? (
              <>
                <SectionLabel title={t("analytics.recentPRs")} />
                {otherPRs.length === 0 ? (
                  <AppText
                    variant="caption"
                    color="textFaint"
                    className="mb-[var(--spacing-xs)] block px-[var(--spacing-xs)]"
                  >
                    {t("analytics.recentPRsEmpty")}
                  </AppText>
                ) : (
                  <ListGroup className="mb-[var(--spacing-xs)]" testId="stats-recent-prs">
                    {otherPRs.map((pr) => (
                      <ListRow
                        key={`${pr.exerciseId}-${pr.completedAt}`}
                        title={pr.exerciseName}
                        subtitle={new Date(pr.completedAt).toLocaleDateString("ko-KR")}
                        value={
                          <span className="font-bold text-(--color-ink) text-[length:var(--text-md)]">
                            {formatWeight(pr.estimated1RM, weightUnit)}
                          </span>
                        }
                      />
                    ))}
                  </ListGroup>
                )}
              </>
            ) : null}
            {overview.topOneRM.length > 0 || recentPRs.length > 0 ? (
              <AppText
                variant="caption"
                color="textFaint"
                className="mb-[var(--spacing-lg)] block px-[var(--spacing-xs)]"
              >
                {t("wellness.oneRepMaxCaption")}
              </AppText>
            ) : null}
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
    </div>
  );
}

/** 지난 같은 기간 대비 — 「전체」 와 지난 기간이 비었으면 그리지 않는다. */
function Delta({ now, prev, period }: { now: number; prev: number | null; period: Period }) {
  if (prev == null || prev <= 0) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  const up = pct >= 0;
  const what = period === "week" ? "지난주보다" : "지난 기간보다";
  return (
    <span
      data-testid="stat-delta"
      className="text-[length:var(--text-sm)] tabular-nums"
      style={{ color: up ? "var(--color-ok)" : "var(--color-ink2)" }}
    >
      {`${up ? "▲" : "▼"} ${Math.abs(pct)}% ${what}`}
    </span>
  );
}

/** 주간 볼륨 막대 — 최소 8칸. 이번 주는 브랜드색, 나머지는 옅게. 값 글자는 달지 않는다(대표 숫자가 위에 있다). */
function TrendBars({ data }: { data: { label: string; value: number; current: boolean }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const H = 72;
  return (
    <div className="mt-[var(--spacing-md)]" data-testid="stats-trend">
      <div style={{ height: H }} className="flex items-end gap-[6px]">
        {data.map((d) => (
          <span
            key={d.label}
            title={`${d.label} · ${Math.round(d.value)}`}
            style={{
              height: d.value > 0 ? Math.max(4, (d.value / max) * H) : 3,
              backgroundColor: d.current
                ? "var(--color-brand)"
                : d.value > 0
                  ? "color-mix(in srgb, var(--color-brand) 35%, transparent)"
                  : "var(--color-line)",
            }}
            className="flex-1 rounded-[4px]"
          />
        ))}
      </div>
      <div className="mt-[var(--spacing-xs)] flex justify-between text-(--color-ink3) text-[length:var(--text-xs)] tabular-nums">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>이번 주</span>
      </div>
    </div>
  );
}
