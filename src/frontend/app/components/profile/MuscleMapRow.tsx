"use client";
// @plm SRS-075  프로필 설정 한 줄 — 「근육 그림 보기」 스위치(기본 켬 · 카드 mini 그림과 운동 중 「오늘 근육」 버튼을 같이 켜고 끔 · U-14)
//
// EffortLoggingRow 와 같은 모양·같은 구조(줄 전체가 role="switch" 버튼 하나 · 보이는 스위치는 aria-hidden 모양 · QA CU-13).
// ProfileClient 에는 이 줄을 끼우는 한 줄만 둔다(병렬 세션과 겹치는 파일 · 최소 diff).
import { useId } from "react";
import { t } from "@/lib/i18n";
import { setMuscleMap, useMuscleMap } from "@/lib/muscleMapPref";

export function MuscleMapRow() {
  const on = useMuscleMap();
  const descId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={t("muscleMap.settingTitle")}
      aria-describedby={descId}
      data-testid="switch-muscle-map"
      onClick={() => setMuscleMap(!on)}
      // ListRow(ui/rows.tsx)와 같은 줄 모양
      className="flex min-h-[52px] w-full items-center gap-[var(--spacing-md)] px-[var(--spacing-lg)] py-[var(--spacing-md)] text-left active:bg-(--color-surface-alt)"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-(--color-ink) text-[length:var(--text-md)]">
          {t("muscleMap.settingTitle")}
        </span>
        <span id={descId} className="break-words text-(--color-ink2) text-[length:var(--text-sm)]">
          {t("muscleMap.settingCaption")}
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
