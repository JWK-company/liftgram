"use client";

// 통계 차트(SPEC-033). 앱의 막대 표현을 넓은 화면에 맞춰 옮겼다.
// 축은 하나, 쌓는 칸 사이는 2px 띄운다. 값 글자는 글자 색이고 계열 색을 쓰지 않는다.
import { useState } from "react";
import { num } from "@/lib/format";

export type ChartSeries = { label: string; color: "var(--series-1)" | "var(--series-2)" };
export type ChartDay = { day: string; values: number[] };

/** 2026-11-05 → 11/5 */
const shortDay = (d: string) => (d ? `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}` : "");

const HEIGHT = 140;

/** 일별 막대. 두 계열이면 쌓아서 합계가 높이로 보이고, 범례가 항상 있다. */
export function DailyBars({
  days,
  series,
  testid,
}: {
  days: ChartDay[];
  series: ChartSeries[];
  testid: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const totals = days.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const hit = hover === null ? null : days[hover];
  const mid = Math.floor(days.length / 2);

  return (
    <div data-testid={testid}>
      {series.length > 1 && (
        <div data-testid={`${testid}-legend`} className="mb-2 flex flex-wrap gap-4 text-muted text-xs">
          {series.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <button
        type="button"
        data-testid={`${testid}-toggle`}
        aria-pressed={table}
        className="mb-1 py-1 text-muted text-xs underline"
        onClick={() => setTable(!table)}
      >
        {table ? "차트로 보기" : "표로 보기"}
      </button>
      {table ? (
        <div data-testid={`${testid}-table`} className="max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-muted">
                <th scope="col" className="py-1 font-normal">
                  날짜
                </th>
                {series.map((s) => (
                  <th key={s.label} scope="col" className="py-1 text-right font-normal">
                    {s.label}
                  </th>
                ))}
                {series.length > 1 && (
                  <th scope="col" className="py-1 text-right font-normal">
                    합계
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => (
                <tr key={d.day} className="border-t border-line">
                  <th scope="row" className="py-1 text-left font-normal tabular-nums">
                    {d.day}
                  </th>
                  {d.values.map((v, j) => (
                    <td key={series[j]?.label ?? j} className="py-1 text-right tabular-nums">
                      {num(v)}
                    </td>
                  ))}
                  {series.length > 1 && (
                    <td className="py-1 text-right tabular-nums">{num(totals[i] ?? 0)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          {hit && hover !== null && (
            <div
              data-testid={`${testid}-tooltip`}
              className="pointer-events-none absolute top-0 z-10 rounded border border-line bg-surface px-2 py-1 text-xs shadow-sm"
              style={
                hover > days.length / 2
                  ? { right: `${100 - ((hover + 1) / days.length) * 100}%` }
                  : { left: `${(hover / days.length) * 100}%` }
              }
            >
              <div className="text-muted">{hit.day}</div>
              {series.map((s, i) => (
                <div key={s.label}>
                  {s.label} {num(hit.values[i] ?? 0)}
                </div>
              ))}
              {series.length > 1 && <div>합계 {num(totals[hover] ?? 0)}</div>}
            </div>
          )}
          <div data-testid={`${testid}-max`} className="text-muted text-xs">
            최대 {num(max)}
          </div>
          <div
            className="flex items-end border-b border-line"
            style={{ height: HEIGHT }}
            onPointerLeave={() => setHover(null)}
          >
            {days.map((d, i) => {
              const total = totals[i] ?? 0;
              return (
                <button
                  type="button"
                  key={d.day}
                  aria-label={`${d.day} ${series.map((s, j) => `${s.label} ${d.values[j] ?? 0}`).join(" ")}${series.length > 1 ? ` 합계 ${total}` : ""}`}
                  className="flex h-full min-w-0 flex-1 flex-col-reverse items-center gap-0.5 px-px"
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setHover(null);
                  }}
                  onClick={() => setHover(i)}
                >
                  {d.values.map((v, j) => {
                    if (v <= 0) return null;
                    const top = d.values.slice(j + 1).every((x) => x <= 0);
                    return (
                      <span
                        key={series[j]?.label ?? j}
                        className="block w-full max-w-5"
                        style={{
                          height: `${Math.max(2, (v / max) * (HEIGHT - 6 - (total > v ? 2 : 0)))}px`,
                          background: series[j]?.color,
                          borderRadius: top ? "3px 3px 0 0" : 0,
                          opacity: hover === null || hover === i ? 1 : 0.55,
                        }}
                      />
                    );
                  })}
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-muted text-xs">
            <span>{shortDay(days[0]?.day ?? "")}</span>
            <span>{shortDay(days[mid]?.day ?? "")}</span>
            <span>{shortDay(days[days.length - 1]?.day ?? "")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** 순위·분포 막대. 값이 줄마다 글자로 있으니 표 보기가 따로 필요 없다. */
export function BarList({
  rows,
  testid,
}: {
  rows: { key: string; label: string; value: number; display?: string }[];
  testid: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul data-testid={testid} className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li
          key={r.key}
          data-testid={`${testid}-${r.key}`}
          title={`${r.label}: ${r.display ?? num(r.value)}`}
          className="flex items-center gap-2"
        >
          <span className="w-2/5 shrink-0 truncate text-muted text-xs">{r.label}</span>
          <span className="h-2.5 min-w-0 flex-1">
            <span
              className="block h-full rounded-r"
              style={{
                width: `${r.value > 0 ? Math.max(2, (r.value / max) * 100) : 0}%`,
                background: "var(--series-1)",
              }}
            />
          </span>
          <span className="w-14 shrink-0 text-right text-xs tabular-nums">{r.display ?? num(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** 작은 숫자 칸. */
export function Tile({
  label,
  value,
  caption,
  testid,
}: {
  label: string;
  value: string;
  caption?: string;
  testid?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-bg p-3">
      <div className="text-muted text-xs">{label}</div>
      <div data-testid={testid} className="mt-0.5 text-xl font-semibold tabular-nums">
        {value}
      </div>
      {caption && <div className="mt-0.5 text-muted text-xs">{caption}</div>}
    </div>
  );
}
