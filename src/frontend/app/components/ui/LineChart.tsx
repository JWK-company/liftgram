"use client";
// @plm SRS-078  선 그래프(인라인 SVG) — 체중 추세용. 공용 charts.tsx(막대)는 고치지 않고 새 파일로 둔다.
//
// 규칙(U-21): 가로축은 **날짜 비례**(기록 간격이 불규칙해도 거리가 시간과 같다) · 선 2px · 끝점만 크게(바탕색 고리) ·
//   목표선은 점선 + 오른쪽 끝 「목표」 글자 · 축 라벨은 가로·세로 각각 최대 4개 · 격자는 흐리게 ·
//   role="img" + aria-label 요약(부르는 쪽이 만든다). 누르거나 올려 두면 가장 가까운 점의 날짜·값을 위 한 줄에 보인다.
// 글자는 글자색 토큰(ink2·ink3)만 쓴다 — 선 색(brand)으로 글자를 칠하지 않는다.
// 폭은 그려진 상자의 실제 px 로 잰다(ResizeObserver) — viewBox 를 늘려 쓰면 점과 글자가 찌그러진다.
import { useEffect, useRef, useState } from "react";

export interface LinePoint {
  /** 가로 값(ms) */
  x: number;
  /** 세로 값(표시 단위) */
  y: number;
}

/** 보기 좋은 눈금 간격(1·2·5 ×10ⁿ) */
function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/** 세로 범위와 눈금(≤4) — 값·목표를 모두 담고 위아래 여백을 둔다 */
export function yScale(values: number[], minSpan = 2): { min: number; max: number; ticks: number[] } {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, ticks: [0, 1] };
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  let step = niceStep(hi - lo, 3);
  let min = Math.floor(lo / step) * step;
  let max = Math.ceil(hi / step) * step;
  // 눈금이 4개를 넘으면 간격을 두 배로(축 라벨 ≤ 4 · U-21)
  while (Math.round((max - min) / step) + 1 > 4) {
    step *= 2;
    min = Math.floor(lo / step) * step;
    max = Math.ceil(hi / step) * step;
  }
  const ticks: number[] = [];
  for (let i = 0; i <= Math.round((max - min) / step); i += 1)
    ticks.push(Math.round((min + i * step) * 1000) / 1000);
  return { min, max, ticks };
}

/** 가로 눈금(≤4) — 양끝 + 사이 둘 */
export function xTicks(from: number, to: number, count = 4): number[] {
  if (to <= from) return [from];
  const n = Math.max(2, Math.min(4, count));
  return Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
}

export function LineChart({
  points,
  xDomain,
  goal,
  goalLabel,
  formatY,
  formatX,
  formatPoint,
  ariaLabel,
  height = 168,
  testId,
}: {
  /** 가로 값 오름차순 */
  points: LinePoint[];
  xDomain: [number, number];
  goal?: number | null;
  goalLabel?: string;
  formatY: (v: number) => string;
  formatX: (ms: number) => string;
  /** 누른 점 한 줄(날짜·값) */
  formatPoint: (p: LinePoint) => string;
  ariaLabel: string;
  height?: number;
  testId?: string;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ys = points.map((p) => p.y);
  if (goal != null && Number.isFinite(goal)) ys.push(goal);
  const sy = yScale(ys);
  const padL = 40; // 세로 라벨 자리
  const padR = goal != null ? 34 : 10; // 「목표」 글자 자리
  const padT = 10;
  const padB = 22; // 가로 라벨 자리
  const plotW = Math.max(1, width - padL - padR);
  const plotH = height - padT - padB;
  const [x0, x1] = xDomain[1] > xDomain[0] ? xDomain : [xDomain[0] - 1, xDomain[0] + 1];
  const px = (x: number) => padL + ((x - x0) / (x1 - x0)) * plotW;
  const py = (y: number) => padT + (1 - (y - sy.min) / (sy.max - sy.min || 1)) * plotH;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  const xt = xTicks(x0, x1, width < 300 ? 3 : 4);
  const showDots = points.length <= 40;
  const pick = picked != null ? points[picked] : null;

  const onPointer = (clientX: number) => {
    const el = box.current;
    if (!el || !points.length) return;
    const x = clientX - el.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < points.length; i += 1)
      if (Math.abs(px(points[i].x) - x) < Math.abs(px(points[best].x) - x)) best = i;
    setPicked(best);
  };

  return (
    <div data-testid={testId}>
      {/* 누른 점 한 줄 — 자리를 늘 잡아 두어 그래프가 흔들리지 않는다 */}
      <p
        aria-live="polite"
        data-testid={testId ? `${testId}-readout` : undefined}
        className="h-[20px] text-(--color-ink2) text-[length:var(--text-sm)] tabular-nums"
      >
        {pick ? formatPoint(pick) : ""}
      </p>
      <div
        ref={box}
        className="relative w-full touch-pan-y"
        style={{ height }}
        onPointerDown={(e) => onPointer(e.clientX)}
        onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons ? onPointer(e.clientX) : undefined)}
        onPointerLeave={(e) => (e.pointerType === "mouse" ? setPicked(null) : undefined)}
      >
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={ariaLabel}
            data-testid={testId ? `${testId}-svg` : undefined}
          >
            {/* 가로 격자 + 세로 라벨(≤4) */}
            {sy.ticks.map((v) => (
              <g key={`y${v}`}>
                <line
                  x1={padL}
                  x2={padL + plotW}
                  y1={py(v)}
                  y2={py(v)}
                  stroke="var(--color-line)"
                  strokeWidth={1}
                />
                <text
                  x={padL - 6}
                  y={py(v)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="var(--color-ink2)"
                  data-axis="y"
                >
                  {formatY(v)}
                </text>
              </g>
            ))}
            {/* 가로 라벨(≤4) — 양끝은 안쪽으로 붙여 잘리지 않게 */}
            {xt.map((x, i) => (
              <text
                key={`x${x}`}
                x={px(x)}
                y={height - 6}
                textAnchor={i === 0 ? "start" : i === xt.length - 1 ? "end" : "middle"}
                fontSize={11}
                fill="var(--color-ink2)"
                data-axis="x"
              >
                {formatX(x)}
              </text>
            ))}
            {/* 목표선 — 점선 + 「목표」 글자(색만으로 구분하지 않는다) */}
            {goal != null && Number.isFinite(goal) ? (
              <g data-testid={testId ? `${testId}-goal` : undefined}>
                <line
                  x1={padL}
                  x2={padL + plotW}
                  y1={py(goal)}
                  y2={py(goal)}
                  stroke="var(--color-ink2)"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
                <text
                  x={padL + plotW + 4}
                  y={py(goal)}
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="var(--color-ink2)"
                >
                  {goalLabel}
                </text>
              </g>
            ) : null}
            {pick ? (
              <line
                x1={px(pick.x)}
                x2={px(pick.x)}
                y1={padT}
                y2={padT + plotH}
                stroke="var(--color-line-strong)"
                strokeWidth={1}
              />
            ) : null}
            <path
              d={path}
              fill="none"
              stroke="var(--color-brand)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              data-testid={testId ? `${testId}-line` : undefined}
            />
            {showDots
              ? dotKeys(points.slice(0, -1)).map(({ p, key }) => (
                  <circle
                    key={key}
                    cx={px(p.x)}
                    cy={py(p.y)}
                    r={2.5}
                    fill="var(--color-brand)"
                    data-point=""
                  />
                ))
              : null}
            {last ? (
              <circle
                cx={px(last.x)}
                cy={py(last.y)}
                r={5}
                fill="var(--color-brand)"
                stroke="var(--color-card)"
                strokeWidth={2}
                data-point="last"
              />
            ) : null}
            {pick ? (
              <circle
                cx={px(pick.x)}
                cy={py(pick.y)}
                r={5}
                fill="none"
                stroke="var(--color-ink)"
                strokeWidth={1.5}
              />
            ) : null}
          </svg>
        ) : null}
      </div>
    </div>
  );
}

/** 점 key — 같은 x(같은 측정 시각 두 줄: 가져오기·두 기기)도 겹치지 않게 같은 x 안 순번을 붙인다(qa P3-12 ⓐ) */
function dotKeys<P extends { x: number }>(points: readonly P[]): { p: P; key: string }[] {
  const seen = new Map<number, number>();
  return points.map((p) => {
    const n = seen.get(p.x) ?? 0;
    seen.set(p.x, n + 1);
    return { p, key: `p${p.x}-${n}` };
  });
}
