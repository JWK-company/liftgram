"use client";
// 분석 탭 — 근육별 주간 세트 표(SRS-101 · ADR-051)
// 진짜 table 이라 스크린리더가 행·열로 읽는다. 칸마다 숫자가 있어 바탕 농도는 보조일 뿐이다.
// 농도는 근육 지도와 같은 무채색(--color-ink2)이다 — 빨강은 통증·경고처럼 읽힌다(BodyMap.tsx · REV-029).
// 상한 40% — 글자(--color-ink)와 바탕 대비가 라이트·다크 모두 4.5 이상이다. 360px 에 맞게 칸을 고정한다.
import { muscleLabel } from "@app/core";
import type { WeeklyMuscleSets } from "@app/core/domain/exerciseProgress";
import type { MapMuscle } from "@app/core/domain/muscleLoad";
import { lang, t } from "@/lib/i18n";
import { formatMuscleSets } from "../ui/BodyMap";
import { AppText, Card } from "../ui/primitives";
import { SectionLabel } from "../ui/rows";

const MAX_MIX = 40;

/** 칸 머리글 두 줄 — 위는 달이 바뀌는 칸과 첫 칸의 「월」, 아래는 일. 좁은 칸에 「10/26」이 넘치지 않게 나눈다. 전체 날짜는 aria-label 로. */
function weekHead(ms: number, prevMs: number | null): { month: string; day: string } {
  const d = new Date(ms);
  const newMonth = prevMs == null || new Date(prevMs).getMonth() !== d.getMonth();
  return { month: newMonth ? `${d.getMonth() + 1}월` : "", day: String(d.getDate()) };
}

export function WeeklyMuscleCard({ data }: { data: WeeklyMuscleSets }) {
  const fullBody = data.fullBody.some((n) => n > 0) ? data.fullBody : null;
  if (data.rows.length === 0 && !fullBody) return null;
  const rows: { key: MapMuscle | "fullBody"; label: string; sets: number[] }[] = data.rows.map((r) => ({
    key: r.muscle,
    label: muscleLabel(r.muscle, lang),
    sets: r.sets,
  }));
  if (fullBody) rows.push({ key: "fullBody", label: muscleLabel("fullBody", lang), sets: fullBody });
  const max = Math.max(1, ...rows.flatMap((r) => r.sets));
  const last = data.weeks.length - 1;
  return (
    <section data-testid="stats-weekly" className="mb-[var(--spacing-lg)]">
      <SectionLabel title={t("analytics.weeklyTitle")} />
      <Card>
        <table className="w-full table-fixed border-separate border-spacing-[1px] text-[length:var(--text-xs)] tabular-nums">
          <caption className="sr-only">{t("analytics.weeklyCaption")}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[60px] text-left font-normal text-(--color-ink2)">
                {t("analytics.weeklyMuscle")}
              </th>
              {data.weeks.map((w, i) => {
                const d = new Date(w);
                const date = `${d.getMonth() + 1}/${d.getDate()}`;
                const head = weekHead(w, i === 0 ? null : data.weeks[i - 1]);
                return (
                  <th
                    key={w}
                    scope="col"
                    aria-label={
                      i === last ? t("analytics.weeklyThisWeek") : t("analytics.weeklyWeekOf", { date })
                    }
                    className={`text-center ${i === last ? "font-bold text-(--color-ink)" : "font-normal text-(--color-ink2)"}`}
                  >
                    <span aria-hidden="true" className="block h-[1.3em]">
                      {head.month}
                    </span>
                    <span aria-hidden="true" className="block">
                      {head.day}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} data-testid={`weekly-row-${r.key}`}>
                <th scope="row" className="truncate text-left font-normal text-(--color-ink)" title={r.label}>
                  {r.label}
                </th>
                {r.sets.map((n, i) => (
                  <td
                    key={data.weeks[i]}
                    data-testid="weekly-cell"
                    className="h-[28px] rounded-[4px] p-0 text-center text-(--color-ink)"
                    style={{
                      backgroundColor:
                        n > 0
                          ? `color-mix(in srgb, var(--color-ink2) ${Math.round((n / max) * MAX_MIX)}%, var(--color-surface))`
                          : undefined,
                      color: n > 0 ? undefined : "var(--color-ink3)",
                    }}
                  >
                    {n > 0 ? (
                      formatMuscleSets(n)
                    ) : (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="sr-only">{t("analytics.weeklyZero")}</span>
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <AppText variant="caption" color="textMuted" className="mt-[var(--spacing-sm)] block">
          {t("analytics.weeklyNote")}
        </AppText>
      </Card>
    </section>
  );
}
