"use client";
// @plm SRS-074 ADR-038  분석 탭 「세트 힘든 정도」 카드 — 기간 안 작업 세트의 RIR 요약(사실만)
//
// 기간은 페이지 위쪽 구간 선택기(주·월·3개월·전체)를 따른다(U-6) — StatsClient 가 고른 일수를 넘긴다.
// 계산은 core 한 곳: getCompletedSets(기간) → summarizeEffort(대상 = 완료 ∧ 워밍업 아님, 값 = rir ?? 10−rpe).
//
// 배치(U-21): 머리 한 줄(「평균 여유 1.8개 · 여유 3개 이하 64%」) + 적은 세트 비율 회색 한 줄 + 분포 막대(DistributionBars 재사용)
//   + 주별 추이는 접기(Fold). 「RIR 3 이하」 같은 전문 용어 대신 「여유 3개 이하」.
// 기록이 없으면 접힌 안내 한 줄 — 펼치면 「설정에서 켜면 운동 중에 적을 수 있어요」(입구를 잇는다 · U-22).
// 이 카드는 설정(effortLogging)을 보지 않는다 — 가져온 RPE 만 있어도 보인다(분석은 데이터가 있으면 보이고, 입력 칩만 설정을 따른다 · U-22 의도).
// 웰니스: 권고·평가 문구를 두지 않는다(「더 세게」 등 없음).
import { summarizeEffort, type EffortSummary } from "@app/core";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { DistributionBars } from "../ui/charts";
import { AppText, Card } from "../ui/primitives";
import { FoldToggle, MetaLine, useFold } from "../ui/quiet";
import { SectionLabel } from "../ui/rows";
import { formatRir } from "../session/RirSheet";

const DAY_MS = 24 * 60 * 60 * 1000;
const BUCKET_KEYS = [
  "effort.bucket0",
  "effort.bucket1",
  "effort.bucket2",
  "effort.bucket3",
  "effort.bucket4",
] as const;

/** 평균 표시 — 소수 한 자리(1.8) */
const avg1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

export function EffortCard({ days }: { /** 위쪽 기간의 일수(null = 전체) */ days: number | null }) {
  const [summary, setSummary] = useState<EffortSummary | null>(null);
  // 접기 기억은 기기 로컬(Fold 규칙) — scope 에 「:」를 넣지 않는다(같은 무리의 다른 키를 지우는 규칙에 걸리지 않게)
  const [weeklyOpen, setWeeklyOpen] = useFold("statsEffortWeekly");
  const [emptyOpen, setEmptyOpen] = useFold("statsEffortEmpty");

  useEffect(() => {
    let cancelled = false;
    const startMs = days ? Date.now() - days * DAY_MS : undefined;
    void import("@app/core/data/analyticsRepository")
      .then((repo) => repo.getCompletedSets(startMs))
      .then((sets) => !cancelled && setSummary(summarizeEffort(sets, { startMs })))
      .catch(() => !cancelled && setSummary(null));
    return () => {
      cancelled = true;
    };
  }, [days]);

  if (!summary) return null;

  if (summary.coverage.rated === 0) {
    return (
      <div className="mb-[var(--spacing-lg)] px-[var(--spacing-xs)]" data-testid="effort-empty">
        <FoldToggle
          open={emptyOpen}
          onToggle={() => setEmptyOpen(!emptyOpen)}
          label={t("effort.emptyFold")}
          testId="effort-empty-toggle"
          controls="effort-empty-hint"
        />
        {emptyOpen ? (
          <AppText id="effort-empty-hint" variant="caption" color="textMuted" className="block">
            {t("effort.emptyHint")}
          </AppText>
        ) : null}
      </div>
    );
  }

  const { avg, shareAtOrBelow3, buckets, weekly, coverage } = summary;
  const weeks = [...weekly].reverse(); // 최근 주가 위

  return (
    <>
      <SectionLabel title={t("effort.cardTitle")} testId="effort-title" />
      <Card className="mb-[var(--spacing-lg)]" data-testid="effort-card">
        <p
          data-testid="effort-head"
          className="font-semibold text-(--color-ink) text-[length:var(--text-md)]"
        >
          {t("effort.head", {
            avg: avg != null ? avg1(avg) : "-",
            pct: shareAtOrBelow3 != null ? String(Math.round(shareAtOrBelow3 * 100)) : "-",
          })}
        </p>
        <MetaLine className="mt-[2px]" testId="effort-coverage">
          <span key="cov">{t("effort.coverage", { rated: coverage.rated, total: coverage.total })}</span>
          {coverage.fromRpe > 0 ? (
            <span key="rpe">{t("effort.coverageRpe", { count: coverage.fromRpe })}</span>
          ) : null}
        </MetaLine>
        <div className="mt-[var(--spacing-md)]" data-testid="effort-buckets">
          <DistributionBars
            data={buckets.map((n, i) => ({ label: t(BUCKET_KEYS[i]), value: n }))}
            formatValue={(v) => t("effort.setsCount", { count: v })}
          />
        </div>
        <div className="mt-[var(--spacing-sm)]">
          <FoldToggle
            open={weeklyOpen}
            onToggle={() => setWeeklyOpen(!weeklyOpen)}
            label={t("effort.weekly")}
            testId="effort-weekly-toggle"
            controls="effort-weekly"
          />
        </div>
        {weeklyOpen ? (
          <ul id="effort-weekly" data-testid="effort-weekly" className="flex flex-col">
            {weeks.map((w) => {
              const d = new Date(w.weekStartMs);
              return (
                <li
                  key={w.weekStartMs}
                  className="flex items-baseline justify-between gap-[var(--spacing-sm)] border-(--color-line) border-t py-[var(--spacing-xs)] text-[length:var(--text-sm)]"
                >
                  <span className="text-(--color-ink2) tabular-nums">
                    {t("effort.weekOf", { date: `${d.getMonth() + 1}/${d.getDate()}` })}
                  </span>
                  <span className="text-(--color-ink) tabular-nums">
                    {w.avg != null
                      ? t("effort.weekValue", { avg: formatRirAvg(w.avg), count: w.count })
                      : t("effort.weekNone")}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>
    </>
  );
}

/** 주 평균 — 0.5 단위 값이면 그대로(2·2.5), 아니면 소수 한 자리 */
function formatRirAvg(v: number): string {
  return Number.isInteger(v * 2) ? formatRir(v) : avg1(v);
}
