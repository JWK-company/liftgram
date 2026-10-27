"use client";
// @plm SRS-078  통계 「체중」 카드 — 자기 기간(1개월·3개월·1년·전체) · 날짜 비례 곡선 · 목표선·남은 차이 · 주간 변화
//
// · 기간은 이 카드 안에서 고른다(체중은 운동 기간과 리듬이 달라 위쪽 7일 선택을 따르면 거의 늘 비어 보인다).
// · 계산은 core 한 곳: 유효 행 거르기(sortBodyweightLogs — 「설정 안 함」 표식은 안 보인다) · goalGap · weeklyRate(최근 28일
//   하루 평균 3점 이상 최소제곱, 기간 선택과 무관). 주간 변화가 없으면 「한 번 더 적으면 추세가 보여요」.
// · 기록이 기간 안에 하나뿐이면 곡선 대신 값과 안내(SRS-078). 하나도 없으면 「이 기간에 기록이 없어요」.
// · 「최근」 = 가장 최근 측정(유효 행). 남은 차이는 그 값과 목표의 차이.
// · 주간 변화의 기준 시각은 max(기간 기준 시각, 가장 최근 측정) — 카드에서 막 적은 기록이 바로 주간 변화에 들어간다(qa P3-2).
// · 안내 문구는 최근 28일의 서로 다른 날 수로 가른다 — 「한 번 더」가 약속을 지킬 때만 그 말을 쓴다(qa P3-12 ⓑ).
// · 이력을 읽기 전에는 곡선 자리만 비워 둔다(「기록이 없어요」가 잠깐 보이지 않게 · qa P3-12 ⓒ).
// · 이력 0 인데 프로필 값만 있으면 그 값을 보여 준다 — 프로필 화면과 말이 같게(qa P3-8).
// 문구는 숫자만 — 감량·증량 권고나 평가 없음(웰니스 · guideCopy `bodyweight.`).
import { goalGap, sortBodyweightLogs, weeklyRate, weeklyRateDaysNeeded } from "@app/core/domain/bodyweight";
import { bodyweightUnitOf, formatBodyweight, shownBodyweight } from "@app/core/domain/weighIn";
import { fromKg } from "@app/core";
import { useUser } from "@app/core/state/userContext";
import { useState } from "react";
import { setBodyweightGoalKg, useBodyweightGoalKg } from "@/lib/bodyweightPref";
import { useBodyweightLogs } from "@/lib/bodyweightLogs";
import { lang, t } from "@/lib/i18n";
import { BodyweightRecordSheet } from "../profile/BodyweightRow";
import { WeighInSheet, formatBodyweightDate } from "../session/WeighInSheet";
import { LineChart } from "../ui/LineChart";
import { AppText, Card } from "../ui/primitives";
import { SectionLabel, Segmented } from "../ui/rows";

type Range = "1m" | "3m" | "1y" | "all";
const DAY_MS = 86_400_000;
const RANGE_DAYS: Record<Range, number | null> = { "1m": 30, "3m": 90, "1y": 365, all: null };
const RANGE_LABEL: Record<Range, Parameters<typeof t>[0]> = {
  "1m": "bodyweight.range1m",
  "3m": "bodyweight.range3m",
  "1y": "bodyweight.range1y",
  all: "bodyweight.rangeAll",
};

/** 부호 붙인 숫자 — 「+0.4」·「−1.2」·「0.0」(빼기는 U+2212) */
function signed(v: number, digits = 1): string {
  const r = Number(v.toFixed(digits));
  if (r === 0) return (0).toFixed(digits);
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(digits)}`;
}

export function BodyweightCard() {
  const { user, bodyweightKg } = useUser();
  const { logs, loaded } = useBodyweightLogs();
  const goalKg = useBodyweightGoalKg();
  const [range, setRange] = useState<Range>("3m");
  const [sheet, setSheet] = useState<null | "record" | "goal">(null);
  // 기준 시각은 기간을 바꿀 때만 다시 잡는다(그리기마다 창이 흔들리지 않게)
  const [nowMs, setNowMs] = useState(() => Date.now());
  const unit = bodyweightUnitOf(user?.weightUnit);
  const fmt = (kg: number) => `${formatBodyweight(kg, unit)}${unit}`;

  const valid = sortBodyweightLogs(logs);
  const days = RANGE_DAYS[range];
  const from = days ? nowMs - days * DAY_MS : (valid[0]?.measuredAt ?? nowMs);
  const inRange = valid.filter((l) => l.measuredAt >= from && l.measuredAt <= nowMs + DAY_MS);
  const latest = valid[valid.length - 1] ?? null;
  const gap = goalGap(latest?.weightKg, goalKg);
  // [원본] const rate = weeklyRate(valid, nowMs);
  // [개선] 카드를 연 뒤에 적은 기록도 들어가게(qa P3-2)
  const rateNow = Math.max(nowMs, latest?.measuredAt ?? 0);
  const rate = weeklyRate(valid, rateNow);
  const daysNeeded = weeklyRateDaysNeeded(valid, rateNow);
  const needMoreText =
    daysNeeded <= 1 ? t("bodyweight.weeklyNeedMore") : t("bodyweight.weeklyNeedMoreN", { count: daysNeeded });
  const first = inRange[0];
  const end = inRange[inRange.length - 1];
  const change = first && end && inRange.length >= 2 ? end.weightKg - first.weightKg : null;
  const longRange = !days || days > 120;
  const xFmt = (ms: number) =>
    new Date(ms).toLocaleDateString(
      lang === "en" ? "en-US" : "ko-KR",
      longRange ? { year: "2-digit", month: "numeric" } : { month: "numeric", day: "numeric" },
    );

  const aria = [
    t("bodyweight.chartAria", {
      latest: end ? fmt(end.weightKg) : "—",
      change: change != null ? `${signed(fromKg(change, unit))}${unit}` : "—",
    }),
    goalKg != null ? t("bodyweight.chartAriaGoal", { goal: fmt(goalKg) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <SectionLabel
        title={t("bodyweight.cardTitle")}
        testId="bodyweight-card-title"
        right={
          <button
            type="button"
            data-testid="btn-bodyweight-card-record"
            aria-label={t("bodyweight.recordAria")}
            onClick={() => setSheet("record")}
            className="-my-[10px] flex h-[44px] min-w-[44px] items-center justify-center px-[var(--spacing-sm)] font-medium text-(--color-ink) underline underline-offset-2"
          >
            {t("bodyweight.record")}
          </button>
        }
      />
      <Card className="mb-[var(--spacing-lg)]" data-testid="bodyweight-card">
        {!loaded ? (
          // 읽는 중 — 빈 안내를 잠깐 보이지 않는다(qa P3-12 ⓒ)
          <div aria-busy="true" data-testid="bodyweight-card-loading" className="min-h-[96px]" />
        ) : valid.length === 0 ? (
          <AppText variant="caption" color="textMuted" className="block" data-testid="bodyweight-card-empty">
            {bodyweightKg != null
              ? t("bodyweight.cardEmptyProfile", { value: fmt(bodyweightKg) })
              : t("bodyweight.cardEmpty")}
          </AppText>
        ) : (
          <>
            <Segmented
              testId="bodyweight-range"
              className="mb-[var(--spacing-md)]"
              value={range}
              onChange={(v) => {
                setRange(v);
                setNowMs(Date.now());
              }}
              items={(Object.keys(RANGE_DAYS) as Range[]).map((r) => ({
                value: r,
                label: t(RANGE_LABEL[r]),
                testId: `bodyweight-range-${r}`,
              }))}
            />
            {latest ? (
              <div className="flex flex-wrap items-baseline gap-x-[var(--spacing-sm)]">
                <span
                  data-testid="bodyweight-latest"
                  className="font-bold text-(--color-ink) text-[length:var(--text-xl)] tabular-nums leading-tight"
                >
                  {t("bodyweight.latest", { value: fmt(latest.weightKg) })}
                </span>
                {change != null ? (
                  <span
                    className="text-(--color-ink2) text-[length:var(--text-sm)] tabular-nums"
                    data-testid="bodyweight-change"
                  >
                    {t("bodyweight.rangeChange", { value: `${signed(fromKg(change, unit))}${unit}` })}
                  </span>
                ) : null}
              </div>
            ) : null}
            {gap ? (
              <p
                className="mt-[2px] text-(--color-ink) text-[length:var(--text-sm)] tabular-nums"
                data-testid="bodyweight-goal-gap"
              >
                {gap.direction === "reached"
                  ? t("bodyweight.goalReached")
                  : t("bodyweight.goalRemaining", { value: `${formatBodyweight(gap.absKg, unit)}${unit}` })}
                <span className="text-(--color-ink2)">
                  {" "}
                  · {t("bodyweight.goalLabel")} {fmt(goalKg as number)}
                </span>
              </p>
            ) : null}
            {/* 기록이 기간 안에 하나뿐이면 아래 곡선 자리가 같은 안내를 한다 — 같은 문장을 두 번 쓰지 않는다 */}
            {!rate && inRange.length === 1 ? null : (
              <p
                className="mt-[2px] text-(--color-ink2) text-[length:var(--text-sm)] tabular-nums"
                data-testid="bodyweight-weekly"
              >
                {rate
                  ? t("bodyweight.weekly", {
                      kg: `${signed(fromKg(rate.kgPerWeek, unit), Math.abs(fromKg(rate.kgPerWeek, unit)) >= 1 ? 1 : 2)}${unit}`,
                      pct: `${signed(rate.pctPerWeek)}%`,
                    })
                  : needMoreText}
              </p>
            )}
            {rate ? (
              <p className="text-(--color-ink3) text-[length:var(--text-xs)]">
                {t("bodyweight.weeklyCaption")}
              </p>
            ) : null}

            <div className="mt-[var(--spacing-sm)]">
              {inRange.length >= 2 ? (
                <LineChart
                  testId="bodyweight-chart"
                  points={inRange.map((l) => ({ x: l.measuredAt, y: shownBodyweight(l.weightKg, unit) }))}
                  xDomain={[from, Math.max(nowMs, end?.measuredAt ?? nowMs)]}
                  goal={goalKg != null ? shownBodyweight(goalKg, unit) : null}
                  goalLabel={t("bodyweight.goalLabel")}
                  formatY={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
                  formatX={xFmt}
                  formatPoint={(p) =>
                    t("bodyweight.pointValue", {
                      date: formatBodyweightDate(p.x, true),
                      value: `${p.y.toFixed(1)}${unit}`,
                    })
                  }
                  ariaLabel={aria}
                />
              ) : (
                <AppText
                  variant="caption"
                  color="textMuted"
                  className="block"
                  data-testid="bodyweight-chart-empty"
                >
                  {inRange.length === 1 ? needMoreText : t("bodyweight.rangeEmpty")}
                </AppText>
              )}
            </div>
          </>
        )}

        <div className="mt-[var(--spacing-sm)] flex flex-wrap gap-x-[var(--spacing-sm)]">
          <button
            type="button"
            data-testid="btn-bodyweight-goal"
            onClick={() => setSheet("goal")}
            className="flex h-[44px] items-center font-medium text-(--color-ink) text-[length:var(--text-sm)] underline underline-offset-2"
          >
            {goalKg != null ? t("bodyweight.goalChange") : t("bodyweight.goalSet")}
          </button>
          {goalKg != null ? (
            <button
              type="button"
              data-testid="btn-bodyweight-goal-clear"
              onClick={() => setBodyweightGoalKg(null)}
              className="flex h-[44px] items-center px-[var(--spacing-sm)] text-(--color-ink2) text-[length:var(--text-sm)] underline underline-offset-2"
            >
              {t("bodyweight.goalClear")}
            </button>
          ) : null}
        </div>
      </Card>

      {sheet === "record" ? <BodyweightRecordSheet onClose={() => setSheet(null)} /> : null}
      {sheet === "goal" ? (
        <WeighInSheet
          testId="bodyweight-goal-sheet"
          title={t("bodyweight.sheetGoalTitle")}
          unit={unit}
          initialKg={goalKg ?? latest?.weightKg ?? null}
          primaryLabel={t("bodyweight.save")}
          secondaryLabel={t("common.cancel")}
          onDismiss={() => setSheet(null)}
          onSave={(kg) => {
            setBodyweightGoalKg(kg);
            setSheet(null);
          }}
        />
      ) : null}
    </>
  );
}
