"use client";
// 프로필 설정 한 줄 — 「사용 통계 보내기」(기본 켬 · 끄면 전송과 접속 신호가 모두 멈춘다 · SPEC-032).
// WeighInSettingRow 와 같은 모양·같은 구조다.
import { useId } from "react";
import { t } from "@/lib/i18n";
import { setUsageOptedOut, useUsageOptedOut } from "@/lib/usage";

export function UsageStatsRow() {
  const off = useUsageOptedOut();
  const on = !off;
  const descId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={t("usage.settingTitle")}
      aria-describedby={descId}
      data-testid="switch-usage-stats"
      onClick={() => setUsageOptedOut(on)}
      className="flex min-h-[52px] w-full items-center gap-[var(--spacing-md)] px-[var(--spacing-lg)] py-[var(--spacing-sm)] text-left"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-(--color-ink) text-[length:var(--text-md)]">
          {t("usage.settingTitle")}
        </span>
        <span id={descId} className="break-words text-(--color-ink2) text-[length:var(--text-sm)]">
          {t("usage.settingCaption")}
        </span>
      </span>
      <span aria-hidden className="flex h-[44px] w-[56px] shrink-0 items-center justify-center">
        <span
          style={{ backgroundColor: on ? "var(--color-brand)" : "var(--color-line-strong)" }}
          className="relative block h-[28px] w-[48px] rounded-[var(--radius-pill)] transition-colors"
        >
          <span
            style={{ transform: on ? "translateX(20px)" : "translateX(0)" }}
            className="absolute top-[2px] left-[2px] block h-[24px] w-[24px] rounded-full bg-(--color-card) transition-transform"
          />
        </span>
      </span>
    </button>
  );
}
