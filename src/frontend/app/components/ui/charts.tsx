// @plm SRS-005  경량 차트 — app의 components/charts.tsx를 웹으로
//
// 차트 라이브러리를 쓰지 않는다. app이 네이티브 의존을 피하려고 View만으로 그렸고,
// 웹에서도 같은 이유가 성립한다 — 막대 두 종류에 200KB짜리 라이브러리를 얹을 이유가 없다.
// 값의 비율만 높이/너비로 옮기면 끝이라 계산도 단순하다.
import { t } from "@/lib/i18n";
import { AppText } from "./primitives";

export interface ChartDatum {
  label: string;
  value: number;
  /** 이 막대만 다른 색으로(예: 이번 주). */
  highlight?: boolean;
}

/** 세로 막대 — 주간 볼륨·1RM 추세처럼 시간축이 있는 값. */
export function SimpleBarChart({
  data,
  height = 160,
  formatValue,
}: {
  data: ChartDatum[];
  height?: number;
  formatValue?: (v: number) => string;
}) {
  if (!data.length) {
    return (
      <AppText variant="caption" color="textFaint" center className="block">
        {t("analytics.chartEmpty")}
      </AppText>
    );
  }

  // 0으로 나누지 않도록 최소 1. 라벨 줄(28px)을 뺀 나머지가 막대가 쓸 높이다.
  const max = Math.max(1, ...data.map((d) => d.value));
  const barArea = height - 28;

  return (
    <div>
      <div style={{ height }} className="flex items-end gap-[var(--spacing-sm)]">
        {data.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center justify-end">
            <AppText variant="label" color="textFaint" className="block truncate">
              {formatValue ? formatValue(d.value) : String(Math.round(d.value))}
            </AppText>
            <span
              style={{
                height: Math.max(3, (d.value / max) * barArea),
                backgroundColor: d.highlight ? "var(--color-pr)" : "var(--color-brand)",
              }}
              className="mt-[var(--spacing-xs)] w-[64%] rounded-[var(--radius-sm)]"
            />
          </div>
        ))}
      </div>
      <div className="mt-[var(--spacing-xs)] flex gap-[var(--spacing-sm)]">
        {data.map((d) => (
          <AppText key={d.label} variant="label" color="textFaint" center className="block flex-1 truncate">
            {d.label}
          </AppText>
        ))}
      </div>
    </div>
  );
}

/** 가로 분포 — 근육군별 볼륨처럼 항목이 많고 이름이 긴 값. */
export function DistributionBars({
  data,
  formatValue,
}: {
  data: ChartDatum[];
  formatValue?: (v: number) => string;
}) {
  if (!data.length) {
    return (
      <AppText variant="caption" color="textFaint" center className="block">
        {t("analytics.chartEmpty")}
      </AppText>
    );
  }
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex flex-col gap-[var(--spacing-sm)]">
      {data.map((d) => (
        <div key={d.label}>
          <div className="mb-[2px] flex justify-between">
            <AppText variant="caption" color="textMuted">
              {d.label}
            </AppText>
            <AppText variant="caption" color="textFaint">
              {formatValue ? formatValue(d.value) : String(Math.round(d.value))}
            </AppText>
          </div>
          <div className="h-2 rounded-[var(--radius-pill)] bg-(--color-surface-alt)">
            <span
              style={{ width: `${(d.value / max) * 100}%` }}
              className="block h-2 rounded-[var(--radius-pill)] bg-(--color-brand)"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
