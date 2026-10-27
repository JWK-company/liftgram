"use client";
// @plm SRS-005 SRS-054  종목 상세 위의 「내 기록」 — 이 종목의 추정 1RM 추세(시안 29개 표 · 운동 묶음)
//
// 종목 상세는 서버가 그리는 공유 URL이지만, 내 기록은 기기의 로컬 저장소에만 있다 — 그래서 이 조각만 클라이언트다.
// 집계는 저장소의 getExercise1RMTrend 그대로(분석 탭과 같은 함수 → 숫자가 갈라지지 않는다).
// 기록이 없으면 아무것도 그리지 않는다(처음 보는 종목에 빈 차트를 띄울 이유가 없다).
import { formatWeight } from "@app/core";
import { useUser } from "@app/core/state/userContext";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { AppText, Card } from "../ui/primitives";
import { effortFill, useExerciseEffortByWorkout } from "./exerciseEffort"; // 막대 채움 = 그날 평균 RIR @plm SRS-074

type Point = { bucketMs: number; label: string; value: number };

const MAX = 12;

export default function ExerciseProgress({ exerciseId }: { exerciseId: string }) {
  const { weightUnit } = useUser();
  const [points, setPoints] = useState<Point[] | null>(null);
  const effort = useExerciseEffortByWorkout(exerciseId);

  useEffect(() => {
    let cancelled = false;
    void import("@app/core/data/analyticsRepository")
      .then((repo) => repo.getExercise1RMTrend(exerciseId))
      .then((p) => !cancelled && setPoints(p))
      .catch(() => !cancelled && setPoints([]));
    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  if (!points || points.length === 0) return null;
  const recent = points.slice(-MAX);
  const best = Math.max(...points.map((p) => p.value));
  const last = recent[recent.length - 1];
  const max = Math.max(1, ...recent.map((p) => p.value));
  const min = Math.min(...recent.map((p) => p.value));
  const H = 64;
  const hasEffort = recent.some((p) => effort.has(p.bucketMs));

  return (
    <Card>
      <div className="flex items-start justify-between" data-testid="exercise-progress">
        <div>
          <AppText variant="caption" color="textMuted" className="block">
            내 추정 1RM · 최근
          </AppText>
          <span className="font-bold text-(--color-ink) text-[length:var(--text-xl)] tabular-nums">
            {formatWeight(last.value, weightUnit)}
          </span>
        </div>
        <div className="text-right">
          <AppText variant="caption" color="textMuted" className="block">
            최고
          </AppText>
          <span className="font-semibold text-(--color-ink) text-[length:var(--text-md)] tabular-nums">
            {formatWeight(best, weightUnit)}
          </span>
        </div>
      </div>
      {/* 막대 바닥을 최솟값 조금 아래에 둔다 — 1RM 은 몇 kg 씩 변해 0부터 그리면 차이가 안 보인다. */}
      <div style={{ height: H }} className="mt-[var(--spacing-md)] flex items-end gap-[6px]">
        {recent.map((p, i) => {
          const floor = min * 0.85;
          const h = Math.max(4, ((p.value - floor) / Math.max(1, max - floor)) * H);
          const rir = effort.get(p.bucketMs);
          return (
            <span
              key={p.bucketMs}
              // [원본] title={`${p.label} · ${Math.round(p.value)}`}
              title={`${p.label} · ${Math.round(p.value)}${rir != null ? ` · RIR ${Math.round(rir * 10) / 10}` : ""}`}
              style={{
                height: h,
                backgroundColor:
                  i === recent.length - 1
                    ? "var(--color-brand)"
                    : "color-mix(in srgb, var(--color-brand) 35%, transparent)",
              }}
              // [원본] className="max-w-6 flex-1 rounded-[4px]" />
              className="relative max-w-6 flex-1 overflow-hidden rounded-[4px]"
            >
              {/* 진한 채움 — 그날 작업 세트의 평균 여유가 적을수록 길다(범례 아래 한 줄) @plm SRS-074 */}
              {rir != null ? (
                <span
                  data-testid="progress-effort-fill"
                  style={{ height: `${effortFill(rir) * 100}%` }}
                  className="absolute inset-x-0 bottom-0 block bg-black/35"
                />
              ) : null}
            </span>
          );
        })}
      </div>
      <div className="mt-[var(--spacing-xs)] flex justify-between text-(--color-ink3) text-[length:var(--text-xs)] tabular-nums">
        <span>{recent[0].label}</span>
        <span>{`${points.length}회 기록`}</span>
        <span>{last.label}</span>
      </div>
      {hasEffort ? (
        <AppText
          variant="caption"
          color="textMuted"
          className="mt-[2px] block"
          data-testid="progress-effort-legend"
        >
          {t("effort.progressLegend")}
        </AppText>
      ) : null}
    </Card>
  );
}
