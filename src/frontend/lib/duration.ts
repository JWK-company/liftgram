// @plm SRS-071  운동 소요시간 한 곳 — 1분 미만·없음은 빈 문자열(그 칸을 그리지 않는다 · 화면 정리 P3 QA M1)
import { workoutDurationParts } from "@app/core/domain/workoutDuration";
import { t } from "@/lib/i18n";

export function formatWorkoutDuration(seconds: number | null | undefined): string {
  const p = workoutDurationParts(seconds);
  if (!p) return "";
  if (p.hours === 0) return t("common.minutesShort", { minutes: p.minutes });
  if (p.minutes === 0) return t("common.hoursShort", { hours: p.hours });
  return t("common.hoursMinutesShort", { hours: p.hours, minutes: p.minutes });
}
