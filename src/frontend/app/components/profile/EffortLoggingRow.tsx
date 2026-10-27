"use client";
// @plm SRS-073  프로필 설정 한 줄 — 「세트 힘든 정도 기록」 스위치(기본 끔)
//
// 켜면 운동 중 세트 줄의 처방 줄 자리에 RIR 칩이 생긴다. 끄면 칩은 DOM 에서 사라진다(화면 조용함 · 끈 상태 좌표 = 기준선).
// ProfileClient 에는 이 줄을 끼우는 한 줄만 둔다(병렬 세션과 겹치는 파일 · 최소 diff).
//
// [원본] ListRow + 오른쪽 스위치 버튼 — 스위치만 눌렸다. 모바일에서는 제목을 눌러도 켜지기를 기대한다(QA CU-13).
// [개선] 줄 전체가 스위치 하나(role="switch")다. ListRow 에 onPress 를 주면 줄이 <button> 이 되어 안의 스위치 버튼과 겹치므로
//   (버튼 안 버튼 · 같은 역할 두 번 읽힘) ListRow 와 같은 모양을 여기서 그린다. 보이는 스위치는 모양뿐(aria-hidden).
import { useId } from "react";
import { t } from "@/lib/i18n";
import { setEffortLogging, useEffortLogging } from "@/lib/effortPref";

export function EffortLoggingRow() {
  const on = useEffortLogging();
  const descId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={t("effort.settingTitle")}
      aria-describedby={descId}
      data-testid="switch-effort-logging"
      onClick={() => setEffortLogging(!on)}
      // ListRow(ui/rows.tsx)와 같은 줄 모양
      className="flex min-h-[52px] w-full items-center gap-[var(--spacing-md)] px-[var(--spacing-lg)] py-[var(--spacing-md)] text-left active:bg-(--color-surface-alt)"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-(--color-ink) text-[length:var(--text-md)]">
          {t("effort.settingTitle")}
        </span>
        <span id={descId} className="break-words text-(--color-ink2) text-[length:var(--text-sm)]">
          {t("effort.settingCaption")}
        </span>
      </span>
      <SwitchLook on={on} />
    </button>
  );
}

/** 스위치 모양 — 켠 상태만 브랜드색(선택 상태 · 화면 정리 공용 규칙). 누르는 자리는 줄 전체다. */
function SwitchLook({ on }: { on: boolean }) {
  return (
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
  );
}
