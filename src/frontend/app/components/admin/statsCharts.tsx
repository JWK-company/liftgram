"use client";
// 운영자 통계 차트(SPEC-032) — 일별 막대(1~2계열)와 순위 막대.
// 축은 하나, 막대는 얇게, 데이터 끝만 둥글게, 쌓는 칸 사이는 2px 띄운다. 값 글자는 글자 색이고 계열 색을 쓰지 않는다.
// 색은 globals.css 의 .stats-viz 에 라이트·다크 따로 고르고 검증기로 확인했다(운영자 전용 화면).
import { useState } from "react";
import { t } from "@/lib/i18n";
import { AppText } from "../ui/primitives";

export type ChartSeries = { label: string; color: "var(--stats-series-1)" | "var(--stats-series-2)" };
export type ChartDay = { day: string; values: number[] };

const fmt = (n: number) => n.toLocaleString();
/** 2026-11-05 → 11/5 */
const shortDay = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

const AXIS = "text-[11px] leading-none text-(--color-ink3)";

/** 일별 막대. 2계열이면 쌓아서 합계가 높이로 보이고, 범례가 항상 있다. */
export function DailyBars({
  days,
  series,
  testId,
}: {
  days: ChartDay[];
  series: ChartSeries[];
  testId: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const totals = days.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const H = 96;
  const mid = Math.floor(days.length / 2);
  const hit = hover === null ? null : days[hover];

  return (
    <div className="stats-viz" data-testid={testId}>
      {series.length > 1 ? (
        <div
          className="mb-[var(--spacing-xs)] flex flex-wrap gap-[var(--spacing-md)]"
          data-testid={`${testId}-legend`}
        >
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-[6px] text-xs text-(--color-ink2)">
              <span className="h-[10px] w-[10px] rounded-[3px]" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}

      {table ? (
        <div className="max-h-[220px] overflow-y-auto" data-testid={`${testId}-table`}>
          <table className="w-full text-xs text-(--color-ink2)">
            <thead>
              <tr className="text-left text-(--color-ink3)">
                <th className="py-[2px] font-normal">{t("admin.stats.date")}</th>
                {series.map((s) => (
                  <th key={s.label} className="py-[2px] text-right font-normal">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day} className="border-(--color-line) border-t">
                  <td className="py-[2px]">{d.day}</td>
                  {d.values.map((v, i) => (
                    <td key={series[i]?.label ?? i} className="py-[2px] text-right">
                      {fmt(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          {/* 호버·탭 툴팁 — 막대 위에 뜨고 화면 밖으로 나가지 않게 양끝에서 붙는다. */}
          {hit && hover !== null ? (
            <div
              role="status"
              data-testid={`${testId}-tooltip`}
              className="pointer-events-none absolute top-0 z-10 rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-card) px-[8px] py-[4px] text-xs text-(--color-ink) shadow-sm"
              style={
                hover > days.length / 2
                  ? { right: `${100 - ((hover + 1) / days.length) * 100}%` }
                  : { left: `${(hover / days.length) * 100}%` }
              }
            >
              <div className="text-(--color-ink3)">{hit.day}</div>
              {series.map((s, i) => (
                <div key={s.label}>
                  {s.label} {fmt(hit.values[i] ?? 0)}
                </div>
              ))}
            </div>
          ) : null}
          <div
            className="flex items-end border-(--color-line) border-b"
            style={{ height: H }}
            onPointerLeave={() => setHover(null)}
          >
            {days.map((d, i) => {
              const total = totals[i] ?? 0;
              return (
                // 누르는 칸은 막대보다 크다 — 기둥 전체가 칸이다.
                <button
                  type="button"
                  key={d.day}
                  aria-label={`${d.day} ${series.map((s, j) => `${s.label} ${d.values[j] ?? 0}`).join(" ")}`}
                  className="flex h-full min-w-0 flex-1 flex-col-reverse items-center justify-start gap-[2px] px-[1px]"
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onClick={() => setHover(i)}
                >
                  {d.values.map((v, j) => {
                    if (v <= 0) return null;
                    // 맨 위 칸만 둥글게 — 바닥은 축에 붙는다.
                    const top = d.values.slice(j + 1).every((x) => x <= 0);
                    return (
                      <span
                        key={series[j]?.label ?? j}
                        className="block w-full max-w-[12px]"
                        style={{
                          height: `${Math.max(2, (v / max) * (H - 4 - (total > v ? 2 : 0)))}px`,
                          background: series[j]?.color,
                          borderRadius: top ? "4px 4px 0 0" : 0,
                          opacity: hover === null || hover === i ? 1 : 0.55,
                        }}
                      />
                    );
                  })}
                </button>
              );
            })}
          </div>
          <div className={`mt-[4px] flex justify-between ${AXIS}`}>
            <span>{shortDay(days[0]?.day ?? "")}</span>
            <span>{shortDay(days[mid]?.day ?? "")}</span>
            <span>{shortDay(days[days.length - 1]?.day ?? "")}</span>
          </div>
          {/* 왼쪽 위 — 최근 날의 막대는 오른쪽 끝에 서므로 겹치지 않게. */}
          <div className={`pointer-events-none absolute top-0 left-0 ${AXIS}`} data-testid={`${testId}-max`}>
            {fmt(max)}
          </div>
        </div>
      )}
      <button
        type="button"
        className="mt-[var(--spacing-xs)] min-h-[32px] text-xs text-(--color-ink3) underline"
        data-testid={`${testId}-toggle`}
        onClick={() => setTable(!table)}
      >
        {t(table ? "admin.stats.viewChart" : "admin.stats.viewTable")}
      </button>
    </div>
  );
}

/** 순위·분포 막대 — 값이 줄마다 글자로 있으니 표 보기가 따로 필요 없다. */
export function BarList({
  rows,
  testId,
}: {
  rows: { key: string; label: string; value: number; display?: string }[];
  testId: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="stats-viz flex flex-col gap-[6px]" data-testid={testId}>
      {rows.map((r) => (
        <li
          key={r.key}
          className="flex items-center gap-[var(--spacing-sm)]"
          data-testid={`${testId}-${r.key}`}
          title={`${r.label}: ${r.display ?? fmt(r.value)}`}
        >
          <span className="w-[38%] shrink-0 truncate text-xs text-(--color-ink2)">{r.label}</span>
          <span className="h-[10px] min-w-0 flex-1">
            <span
              className="block h-full rounded-r-[4px]"
              style={{
                width: `${r.value > 0 ? Math.max(2, (r.value / max) * 100) : 0}%`,
                background: "var(--stats-series-1)",
              }}
            />
          </span>
          <span className="w-[56px] shrink-0 text-right text-xs tabular-nums text-(--color-ink)">
            {r.display ?? fmt(r.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** 작은 숫자 칸. 앱 칸(560px) 안에서 2열로 놓인다. */
export function Tile({
  label,
  value,
  caption,
  testId,
}: {
  label: string;
  value: string;
  caption?: string;
  testId?: string;
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) p-[var(--spacing-md)]">
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      <div className="mt-[2px]">
        <AppText variant="title" data-testid={testId}>
          {value}
        </AppText>
      </div>
      {caption ? (
        <div className="mt-[2px]">
          <AppText variant="caption" color="textFaint">
            {caption}
          </AppText>
        </div>
      ) : null}
    </div>
  );
}
