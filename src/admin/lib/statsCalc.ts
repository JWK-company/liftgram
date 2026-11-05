// 통계 계산. 화면에서 떼어 시험한다.
export const pct = (part: bigint | number, whole: bigint | number): string =>
  Number(whole) > 0 ? `${Math.round((Number(part) / Number(whole)) * 100)}%` : "—";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 주당 운동 횟수. 최근 28일 집계지만 집계 시작 뒤 4주가 안 됐으면 지난 주 수(최소 1주)로 나눈다. */
export function weeklyRate(workouts: number, activeUsers: number, sinceMs: number, nowMs: number): string {
  const weeks = Math.min(4, Math.max(1, (nowMs - sinceMs) / WEEK_MS));
  return (workouts / Math.max(1, activeUsers) / weeks).toFixed(1);
}
