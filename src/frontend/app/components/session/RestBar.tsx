"use client";
// @plm SRS-004  휴식 바 — app의 ActiveWorkoutScreen 하단 플로팅 바를 웹으로
//
// 골드(PR 색)로 칠한 알약. 세트를 체크하면 나타나 남은 시간을 세고, 다 되면 사라진다.
// **+15초**와 **건너뛰기** 두 갈래만 둔다 — 헬스장에서 한 손으로 누르는 자리다.
// 하단은 안전 영역(홈 인디케이터·삼성 하단 막대)만큼 띄운다 @plm SRS-066
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
      // [원본] className="sticky bottom-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))] z-40 mx-[var(--spacing-lg)] flex items-center gap-[var(--spacing-sm)] rounded-[var(--radius-pill)] px-[var(--spacing-lg)] py-[var(--spacing-sm)] shadow-lg" — 떠 있는 띠는 8px(SPEC-057 R4)
      className="sticky bottom-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))] z-40 mx-[var(--spacing-lg)] flex items-center gap-[var(--spacing-sm)] rounded-[var(--radius-lg)] px-[var(--spacing-lg)] py-[var(--spacing-sm)] shadow-lg"
    >
      <Icon name="timer-outline" size={18} color="var(--color-bg)" />
      <AppText variant="body" className="flex-1 font-bold" style={{ color: "var(--color-bg)" }}>
        {t("session.restCountdown", { clock: clock(restRemaining) })}
      </AppText>
      <button
        type="button"
        data-testid="rest-plus"
        onClick={() => startRest(restRemaining + 15)}
        // [원본] className="px-[4px] py-[2px]" — 누르는 자리 24px(REV-131) → 위아래 늘려 44px
        className="relative rounded-[var(--radius-sm)] border border-(--color-bg) px-[8px] py-[2px] before:absolute before:inset-x-0 before:-inset-y-[10px] before:content-['']"
      >
        <AppText variant="caption" className="font-bold" style={{ color: "var(--color-bg)" }}>
          +15s
        </AppText>
      </button>
      {/* [원본] className="px-[4px] py-[2px]" — 위와 같다 */}
      {/* [개선 SPEC-061] 뒤집힌 띠 안이라 바탕색 테두리 상자(REV-149 7) — 글자만이면 띠의 안내 글과 같아 보였다 */}
      <button
        type="button"
        data-testid="rest-skip"
        onClick={clearRest}
        className="relative rounded-[var(--radius-sm)] border border-(--color-bg) px-[8px] py-[2px] before:absolute before:inset-x-0 before:-inset-y-[10px] before:content-['']"
      >
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
