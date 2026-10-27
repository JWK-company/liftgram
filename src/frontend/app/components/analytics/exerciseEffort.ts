// @plm SRS-074 ADR-038  종목 진척 막대의 「채움」 — 그날(운동 하나) 작업 세트의 평균 RIR
//
// 계산은 core 한 곳(summarizeEffort — 대상 = 완료 ∧ 워밍업 아님, 값 = rir ?? 10−rpe). 여기서는 운동별로 나눠 부를 뿐이다.
// 열쇠는 운동 완료 시각 — getExercise1RMTrend 의 막대(bucketMs)와 같은 값(completedAt ?? startedAt)이다.
import { summarizeEffort } from "@app/core";
import { useEffect, useState } from "react";

/** 막대 채움 비율 — 평균 여유 0개 = 가득(1), 4개 이상 = 비움(0). 여유가 적을수록 길다. */
export const EFFORT_FILL_SCALE = 4;
export function effortFill(avgRir: number): number {
  return Math.max(0, Math.min(1, (EFFORT_FILL_SCALE - avgRir) / EFFORT_FILL_SCALE));
}

/** 이 종목의 운동별 평균 RIR(완료 시각 → 평균). 아는 세트가 없는 운동은 빠진다. */
export function useExerciseEffortByWorkout(exerciseId: string): Map<number, number> {
  const [map, setMap] = useState<Map<number, number>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    void import("@app/core/data/analyticsRepository")
      .then((repo) => repo.getCompletedSets())
      .then((all) => {
        const byWorkout = new Map<number, typeof all>();
        for (const s of all) {
          if (s.exerciseId !== exerciseId) continue;
          const g = byWorkout.get(s.completedAt) ?? [];
          g.push(s);
          byWorkout.set(s.completedAt, g);
        }
        const out = new Map<number, number>();
        for (const [at, sets] of byWorkout) {
          const avg = summarizeEffort(sets).avg;
          if (avg != null) out.set(at, avg);
        }
        if (!cancelled) setMap(out);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [exerciseId]);
  return map;
}
