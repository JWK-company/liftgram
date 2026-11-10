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
// · 인바디(SPEC-049 Phase 3): 골격근량·체지방률을 적은 기록이 하나라도 있으면 카드 안에 「체중/골격근량/체지방률」 고르기가 생긴다.
//   체중이 아닌 수치는 최근 값·기간 변화·곡선만 — 목표선·남은 차이·주간 변화는 체중 전용이라 숨긴다(REV-094).
// 문구는 숫자만 — 감량·증량 권고나 평가 없음(웰니스 · guideCopy `bodyweight.`).
import {
  goalGap,
  isBodyweightClearMarker,
  isValidBodyFatPct,
  isValidSkeletalMuscleKg,
  latestEntry,
  sortBodyweightLogs,
  weeklyRate,
  weeklyRateDaysNeeded,
} from "@app/core/domain/bodyweight";
import { bodyweightUnitOf, formatBodyweight, shownBodyweight } from "@app/core/domain/weighIn";
import { fromKg } from "@app/core";
import { useUser } from "@app/core/state/userContext";
import { useState } from "react";
// [원본] import { setBodyweightGoalKg, useBodyweightGoalKg } from "@/lib/bodyweightPref"; — 목표 바꾸기·지우기는 체중 패널로
import { useBodyweightGoalKg } from "@/lib/bodyweightPref";
import { useBodyweightLogs } from "@/lib/bodyweightLogs";
import { lang, t } from "@/lib/i18n";
// [원본] import { BodyweightRecordSheet } from "../profile/BodyweightRow"; · WeighInSheet · Button · MoreMenu — 머리 버튼·목표 시트를 체중 패널로
import { BodyweightHistorySheet } from "../profile/BodyweightRow";
import { formatBodyweightDate } from "../session/WeighInSheet";
import { Icon } from "../ui/Icon";
import { LineChart } from "../ui/LineChart";
import { AppText, Card } from "../ui/primitives";
import { SectionLabel, Segmented } from "../ui/rows";

type Range = "1m" | "3m" | "1y" | "all";
/** 카드가 보는 수치(SPEC-049 Phase 3) */
type Metric = "weight" | "smm" | "pbf";
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

/** 머리의 측정 날짜 — 「오늘」·「어제」·「N일 전」·날짜(SPEC-049 · 알림과 같은 달력 날 계산) */
export function bodyweightWhen(ms: number, now = Date.now()): string {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const days = Math.round((a.getTime() - new Date(ms).setHours(0, 0, 0, 0)) / DAY_MS); // round — 서머타임 23·25시간 날
  if (days <= 0) return t("bodyweight.today");
  if (days === 1) return t("notif.yesterday");
  if (days < 7) return t("notif.daysAgo", { n: days });
  return formatBodyweightDate(ms, new Date(ms).getFullYear() !== a.getFullYear());
}

export function BodyweightCard() {
  const { user, bodyweightKg } = useUser();
  const { logs, loaded } = useBodyweightLogs();
  const goalKg = useBodyweightGoalKg();
  const [range, setRange] = useState<Range>("3m");
  // [원본] useState<null | "record" | "goal"> — 목표는 체중 패널 안으로 옮겼다
  const [sheet, setSheet] = useState<null | "record">(null);
  const [metricPick, setMetricPick] = useState<Metric>("weight");
  // 기준 시각은 기간을 바꿀 때만 다시 잡는다(그리기마다 창이 흔들리지 않게)
  const [nowMs, setNowMs] = useState(() => Date.now());
  const unit = bodyweightUnitOf(user?.weightUnit);
  const fmt = (kg: number) => `${formatBodyweight(kg, unit)}${unit}`;

  const valid = sortBodyweightLogs(logs);
  const days = RANGE_DAYS[range];
  const from = days ? nowMs - days * DAY_MS : (valid[0]?.measuredAt ?? nowMs);
  const inRange = valid.filter((l) => l.measuredAt >= from && l.measuredAt <= nowMs + DAY_MS);
  const latest = valid[valid.length - 1] ?? null;
  // 머리의 최근 값 — 프로필과 말이 같게, 가장 최근 줄이 「설정 안 함」 표식이면 보이지 않는다(P1-2 리뷰)
  const head = latestEntry(logs);
  const headLatest = head && !isBodyweightClearMarker(head) ? latest : null;
  // 인바디 — 적은 줄이 있을 때만 고르기가 생긴다. 다 지워지면 체중으로 돌아간다
  const hasSmm = valid.some((l) => isValidSkeletalMuscleKg(l.skeletalMuscleKg));
  const hasPbf = valid.some((l) => isValidBodyFatPct(l.bodyFatPct));
  const metric: Metric =
    (metricPick === "smm" && hasSmm) || (metricPick === "pbf" && hasPbf) ? metricPick : "weight";
  const metricOf = (l: (typeof valid)[number]): number | null =>
    metric === "smm"
      ? isValidSkeletalMuscleKg(l.skeletalMuscleKg)
        ? l.skeletalMuscleKg
        : null
      : isValidBodyFatPct(l.bodyFatPct)
        ? l.bodyFatPct
        : null;
  const mSuffix = metric === "pbf" ? "%" : "kg";
  const mSeries =
    metric === "weight"
      ? []
      : inRange.flatMap((l) => {
          const v = metricOf(l);
          return v == null ? [] : [{ x: l.measuredAt, y: v }];
        });
  const mAll = metric === "weight" ? [] : valid.filter((l) => metricOf(l) != null);
  const mLatest = mAll.length ? metricOf(mAll[mAll.length - 1]) : null;
  const mChange = mSeries.length >= 2 ? mSeries[mSeries.length - 1].y - mSeries[0].y : null;
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
        // [원본] 오른쪽 = 밑줄 글자 「기록」 하나 · 목표 바꾸기·지우기는 카드 바닥 밑줄 글자(S-4 · 앱의 다른 카드와 모양이 달랐다)
        // [개선] 최근 값·날짜 + 테두리 「기록」 + ⋯(목표) — SPEC-049 Phase 1
        right={
          // [원본] className="-my-[10px] flex items-center gap-[6px]" · span 에 truncate 없음 — 연도 붙은 날짜가 360px 에서 꺾였다(P1-2 리뷰)
          <div className="-my-[10px] flex min-w-0 items-center gap-[6px]">
            {headLatest ? (
              <span
                className="min-w-0 truncate text-(--color-ink2) tabular-nums"
                data-testid="bodyweight-head-latest"
              >
                {fmt(headLatest.weightKg)} · {bodyweightWhen(headLatest.measuredAt)}
              </span>
            ) : null}
            {/* [원본] 테두리 「기록」(Button outline sm · 빨간 테두리) + ⋯(목표 바꾸기·지우기 → 따로 뜨는 목표 시트) — 다른 카드 머리(「전체 ›」·기간 화살표)와 모양이 달랐고
                목표 바꾸기·지우기가 단계가 많았다(2026-11-10 사용자 지적)
                        <Button
                          title={t("bodyweight.record")}
                          variant="outline"
                          size="sm"
                          fullWidth={false}
                          onPress={() => setSheet("record")}
                          testId="btn-bodyweight-card-record"
                          className="min-h-11 px-[var(--spacing-md)]!"
                        />
                        <MoreMenu
                          testId="bodyweight-more"
                          sheetTestId="bodyweight-more-sheet"
                          title={t("bodyweight.cardTitle")}
                          options={[
                            {
                              label: goalKg != null ? t("bodyweight.goalChange") : t("bodyweight.goalSet"),
                              onPress: () => setSheet("goal"),
                              testId: "btn-bodyweight-goal",
                            },
                            ...(goalKg != null
                              ? [
                                  {
                                    label: t("bodyweight.goalClear"),
                                    onPress: () => setBodyweightGoalKg(null),
                                    destructive: true,
                                    testId: "btn-bodyweight-goal-clear",
                                  },
                                ]
                              : []),
                          ]}
                        /> */}
            {/* [개선] 다른 카드 머리처럼 회색 글자 + › 하나 — 누르면 체중 패널 시트(바로 입력 · 목표 · 지난 기록). 빨강 채움·테두리 없음 */}
            <button
              type="button"
              data-testid="btn-bodyweight-card-record"
              aria-label={t("bodyweight.cardRecordAria")}
              aria-haspopup="dialog"
              onClick={() => setSheet("record")}
              className="flex min-h-11 shrink-0 items-center gap-[2px] rounded-[var(--radius-sm)] pl-[var(--spacing-xs)] font-medium text-(--color-ink2) text-[length:var(--text-sm)] focus-visible:outline-2 focus-visible:outline-(--color-brand) active:bg-(--color-surface-alt)"
            >
              {t("bodyweight.record")}
              <Icon name="chevron-forward" size={16} color="var(--color-ink2)" />
            </button>
          </div>
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
            {hasSmm || hasPbf ? (
              <Segmented
                testId="bodyweight-metric"
                className="mb-[var(--spacing-md)]"
                value={metric}
                onChange={setMetricPick}
                items={[
                  {
                    value: "weight" as Metric,
                    label: t("bodyweight.metricWeight"),
                    testId: "bodyweight-metric-weight",
                  },
                  ...(hasSmm
                    ? [
                        {
                          value: "smm" as Metric,
                          label: t("bodyweight.metricSmm"),
                          testId: "bodyweight-metric-smm",
                        },
                      ]
                    : []),
                  ...(hasPbf
                    ? [
                        {
                          value: "pbf" as Metric,
                          label: t("bodyweight.metricPbf"),
                          testId: "bodyweight-metric-pbf",
                        },
                      ]
                    : []),
                ]}
              />
            ) : null}
            {metric !== "weight" ? (
              <div data-testid="bodyweight-metric-panel">
                <div className="flex flex-wrap items-baseline gap-x-[var(--spacing-sm)]">
                  <span
                    data-testid="bodyweight-metric-latest"
                    className="font-bold text-(--color-ink) text-[length:var(--text-xl)] tabular-nums leading-tight"
                  >
                    {t("bodyweight.latest", {
                      value: mLatest != null ? `${mLatest.toFixed(1)}${mSuffix}` : "—",
                    })}
                  </span>
                  {mChange != null ? (
                    <span
                      className="text-(--color-ink2) text-[length:var(--text-sm)] tabular-nums"
                      data-testid="bodyweight-metric-change"
                    >
                      {t("bodyweight.rangeChange", {
                        value: `${signed(mChange)}${metric === "pbf" ? "%p" : "kg"}`,
                      })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-[var(--spacing-sm)]">
                  {mSeries.length >= 2 ? (
                    <LineChart
                      hint={t("chip.chartHint")}
                      testId="bodyweight-metric-chart"
                      points={mSeries}
                      xDomain={[from, Math.max(nowMs, mSeries[mSeries.length - 1].x)]}
                      goal={null}
                      goalLabel=""
                      formatY={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
                      formatX={xFmt}
                      formatPoint={(p) =>
                        t("bodyweight.pointValue", {
                          date: formatBodyweightDate(p.x, true),
                          value: `${p.y.toFixed(1)}${mSuffix}`,
                        })
                      }
                      ariaLabel={`${t(metric === "smm" ? "bodyweight.metricSmm" : "bodyweight.metricPbf")} · ${mLatest != null ? `${mLatest.toFixed(1)}${mSuffix}` : "—"}`}
                    />
                  ) : (
                    <AppText
                      variant="caption"
                      color="textMuted"
                      className="block"
                      data-testid="bodyweight-metric-empty"
                    >
                      {/* 체중 주간 변화 기준 문구(needMoreText)가 아니라 곡선 기준(REV-096 M-2) */}
                      {mSeries.length === 1 ? t("bodyweight.metricNeedMore") : t("bodyweight.rangeEmpty")}
                    </AppText>
                  )}
                </div>
              </div>
            ) : null}
            {metric !== "weight" ? null : (
              <>
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
                      : t("bodyweight.goalRemaining", {
                          value: `${formatBodyweight(gap.absKg, unit)}${unit}`,
                        })}
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
                      hint={t("chip.chartHint")}
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
          </>
        )}

        {/* [원본] 카드 바닥 밑줄 글자 「목표 정하기/바꾸기」·「목표 지우기」 — ⋯ 메뉴로 옮겼다(SPEC-049). 옛 판은 git 47f940c. */}
      </Card>

      {/* [원본] 따로 뜨는 기록 시트 + 목표 시트(⋯ 에서)
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
      ) : null} */}
      {/* [개선] 프로필 「체중」과 같은 시트 — 체중 패널(바로 입력 · 목표 체중 · 지난 기록) */}
      {sheet === "record" ? <BodyweightHistorySheet onClose={() => setSheet(null)} /> : null}
    </>
  );
}
