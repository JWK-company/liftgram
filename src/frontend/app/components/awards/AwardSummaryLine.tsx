"use client";
// 운동 끝 화면의 「이번 달 운동한 날 n일 · 꾸준상 문턱 12일」(SPEC-063) — 이 기기 기록 기준(오프라인에서도 바로).
// 서버와 같은 기준(완료 · 앱 기록 · 10분 이상 · 한국 시간 날짜)으로 센다. 다 센 뒤에만 그린다.
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { kstMonth, kstMonthBounds, STEADY_GOAL } from "@/lib/awardClient";
import { Icon } from "../ui/Icon";

export function AwardSummaryLine() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [from, to] = kstMonthBounds(kstMonth());
        const repo = await import("@app/core/data/workoutRepository");
        const days = await repo.countWorkoutDaysInRange(from, to);
        if (alive) setN(days);
      } catch {
        // 줄은 덤이다
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (n === null || n < 1) return null;
  return (
    <a
      href="/awards"
      data-testid="summary-awards-line"
      className="mt-[var(--spacing-md)] flex min-h-11 items-center gap-[var(--spacing-xs)] text-[length:var(--text-sm)] text-(--color-ink2)"
    >
      <Icon name="trophy-outline" size={16} color="var(--color-ink2)" />
      <span className="min-w-0 flex-1">{t("awards.summaryLine", { n, goal: STEADY_GOAL })}</span>
      <Icon name="chevron-forward" size={16} color="var(--color-ink3)" />
    </a>
  );
}
