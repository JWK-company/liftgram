"use client";
// @plm SRS-073  프로필 설정 한 줄 — 「세트 힘든 정도 기록」 스위치(기본 끔)
//
// 켜면 운동 중 세트 줄의 처방 줄 자리에 RIR 칩이 생긴다. 끄면 칩은 DOM 에서 사라진다(화면 조용함 · 끈 상태 좌표 = 기준선).
// ProfileClient 에는 이 줄을 끼우는 한 줄만 둔다(병렬 세션과 겹치는 파일 · 최소 diff).
import { t } from "@/lib/i18n";
import { setEffortLogging, useEffortLogging } from "@/lib/effortPref";
import { ListRow } from "../ui/rows";

export function EffortLoggingRow() {
  const on = useEffortLogging();
  return (
    <ListRow
      title={t("effort.settingTitle")}
      subtitle={t("effort.settingCaption")}
      wrapSubtitle
      trailing={<Switch on={on} onChange={setEffortLogging} label={t("effort.settingTitle")} />}
    />
  );
}

/** 켜고 끄는 스위치 — 누르는 자리 44×44, 켠 상태만 브랜드색(선택 상태 · 화면 정리 공용 규칙). */
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      data-testid="switch-effort-logging"
      onClick={() => onChange(!on)}
      className="flex h-[44px] w-[56px] shrink-0 items-center justify-center"
    >
      <span
        aria-hidden
        style={{ backgroundColor: on ? "var(--color-brand)" : "var(--color-line-strong)" }}
        className="relative block h-[28px] w-[48px] rounded-[var(--radius-pill)] transition-colors"
      >
        <span
          style={{ transform: on ? "translateX(20px)" : "translateX(0)" }}
          className="absolute top-[2px] left-[2px] block h-[24px] w-[24px] rounded-full bg-(--color-on-brand) shadow transition-transform"
        />
      </span>
    </button>
  );
}
