"use client";
// @plm SRS-077  프로필 설정 한 줄 — 「운동 전 체중 체크인」 스위치(기본 끔 · 화면 조용함)
//
// MuscleMapRow·EffortLoggingRow 와 같은 모양·같은 구조(줄 전체가 role="switch" 버튼 하나 · 보이는 스위치는 aria-hidden 모양 · QA CU-13).
import { useId } from "react";
import { setWeighInEnabled, useWeighInEnabled } from "@/lib/bodyweightPref";
import { t } from "@/lib/i18n";

export function WeighInSettingRow() {
  const on = useWeighInEnabled();
  const descId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={t("bodyweight.settingTitle")}
      aria-describedby={descId}
      data-testid="switch-weighin"
      onClick={() => setWeighInEnabled(!on)}
      // ListRow(ui/rows.tsx)와 같은 줄 모양
      className="flex min-h-[52px] w-full items-center gap-[var(--spacing-md)] px-[var(--spacing-lg)] py-[var(--spacing-md)] text-left active:bg-(--color-surface-alt)"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-(--color-ink) text-[length:var(--text-md)]">
          {t("bodyweight.settingTitle")}
        </span>
        <span id={descId} className="break-words text-(--color-ink2) text-[length:var(--text-sm)]">
          {t("bodyweight.settingCaption")}
        </span>
      </span>
      <span aria-hidden className="flex h-[44px] w-[56px] shrink-0 items-center justify-center">
        <span
          style={{ backgroundColor: on ? "var(--color-brand)" : "var(--color-line-strong)" }}
          className="relative block h-[28px] w-[48px] rounded-[var(--radius-pill)] transition-colors"
        >
          <span
            style={{ transform: on ? "translateX(20px)" : "translateX(0)" }}
            className="absolute top-[2px] left-[2px] block h-[24px] w-[24px] rounded-full bg-(--color-on-brand) shadow transition-transform"
          />
        </span>
      </span>
    </button>
  );
}
