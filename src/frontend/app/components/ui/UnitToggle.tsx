"use client";
// @plm SRS-067  kg/lb 세그먼트 토글 — 운동 블록 머리의 PR 칩 옆
//
// 한 헬스장 안에서도 해머스트렝스 플레이트는 lb, 국산 핀로드는 kg 처럼 기구마다 단위가 다르다. 그래서 단위는 블록마다
// 바꾼다. 칩 줄(PR 칩·볼륨 칩)과 같은 높이의 작은 알약 두 칸 — 켜진 쪽만 브랜드색으로 채운다. 누르는 자리는
// 시각보다 넓게(위아래 패딩) 잡아 장갑 낀 손가락에도 맞게 한다.
import type { WeightUnit } from "@app/core";
import { t } from "@/lib/i18n";

const UNITS: WeightUnit[] = ["kg", "lb"];

export function UnitToggle({ value, onChange }: { value: WeightUnit; onChange: (u: WeightUnit) => void }) {
  return (
    <fieldset
      aria-label={t("session.unitToggleLabel")}
      data-testid="unit-toggle"
      className="m-0 inline-flex min-w-0 shrink-0 items-center rounded-[var(--radius-pill)] border border-(--color-line) bg-(--color-surface-alt) p-[2px]"
    >
      {UNITS.map((u) => {
        const on = u === value;
        return (
          <button
            key={u}
            type="button"
            data-testid={`unit-toggle-${u}`}
            aria-pressed={on}
            onClick={() => onChange(u)}
            className={`min-w-[34px] rounded-[var(--radius-pill)] px-[var(--spacing-sm)] py-[2px] font-semibold text-[length:var(--text-xs)] leading-[18px] ${
              on
                ? "bg-(--color-brand) text-(--color-on-brand)"
                : "text-(--color-ink3) active:bg-(--color-line)"
            }`}
          >
            {u}
          </button>
        );
      })}
    </fieldset>
  );
}
