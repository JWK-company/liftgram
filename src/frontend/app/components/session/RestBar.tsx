"use client";
// @plm SRS-004  휴식 바 — app의 ActiveWorkoutScreen 하단 플로팅 바를 웹으로
//
// 골드(PR 색)로 칠한 알약. 세트를 체크하면 나타나 남은 시간을 세고, 다 되면 사라진다.
// **+15초**와 **건너뛰기** 두 갈래만 둔다 — 헬스장에서 한 손으로 누르는 자리다.
import { useSession } from "../SessionProvider";
import { t } from "@/lib/i18n";
import { Icon } from "../ui/Icon";
import { AppText } from "../ui/primitives";

export function RestBar() {
  const { restRemaining, startRest, clearRest } = useSession();
  if (restRemaining == null) return null;

  return (
    <div
      data-testid="rest-bar"
      style={{ backgroundColor: "var(--color-pr)" }}
      className="sticky bottom-[var(--spacing-lg)] z-40 mx-[var(--spacing-lg)] flex items-center gap-[var(--spacing-sm)] rounded-[var(--radius-pill)] px-[var(--spacing-lg)] py-[var(--spacing-sm)] shadow-lg"
    >
      <Icon name="timer-outline" size={18} color="var(--color-bg)" />
      <AppText variant="body" className="flex-1 font-bold" style={{ color: "var(--color-bg)" }}>
        {t("session.restCountdown", { clock: clock(restRemaining) })}
      </AppText>
      <button
        type="button"
        data-testid="rest-plus"
        onClick={() => startRest(restRemaining + 15)}
        className="px-[4px] py-[2px]"
      >
        <AppText variant="caption" className="font-bold" style={{ color: "var(--color-bg)" }}>
          +15s
        </AppText>
      </button>
      <button type="button" data-testid="rest-skip" onClick={clearRest} className="px-[4px] py-[2px]">
        <AppText variant="caption" className="font-bold" style={{ color: "var(--color-bg)" }}>
          {t("session.skip")}
        </AppText>
      </button>
    </div>
  );
}

/** `MM:SS` — 초는 두 자리로 채운다. */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
