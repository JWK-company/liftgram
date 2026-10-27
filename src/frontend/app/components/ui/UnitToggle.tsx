"use client";
// @plm SRS-067  kg/lb 세그먼트 토글 — 운동 블록 머리의 PR 칩 옆
//
// 한 헬스장 안에서도 해머스트렝스 플레이트는 lb, 국산 핀로드는 kg 처럼 기구마다 단위가 다르다. 그래서 단위는 블록마다
// 바꾼다. 칩 줄(PR 칩·볼륨 칩)과 같은 높이의 작은 알약 두 칸 — 켜진 쪽만 브랜드색으로 채운다. 누르는 자리는
// 시각보다 넓게(위아래 패딩) 잡아 장갑 낀 손가락에도 맞게 한다.
import type { WeightUnit } from "@app/core";
import { t } from "@/lib/i18n";

const UNITS: WeightUnit[] = ["kg", "lb"];

export function UnitToggle({
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  value: WeightUnit;
  onChange: (u: WeightUnit) => void;
  /** 단위를 정하는 중·바꾸는 중 — 겹친 토글을 막는다(/qa code H-1·M-4) */
  disabled?: boolean;
  /**
   * 세트 표 머리 「무게」 칸 안에 넣는 모양(화면 정리 D2 · /qa spec Q8) — 라벨 없는 「kg│lb」 글자 둘.
   * 켜진 쪽은 진한 굵은 글자, 꺼진 쪽은 흐린 글자 — 상자·빨강 없이. @plm SRS-069
   */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <fieldset
        aria-label={t("session.unitToggleLabel")}
        data-testid="unit-toggle"
        className="m-0 inline-flex min-w-0 shrink-0 items-center border-0 p-0"
      >
        {/* 읽어 주는 legend — legend 없는 fieldset 의 그룹을 건너뛰는 스크린리더가 있다(/qa code L-6) */}
        <legend className="sr-only">{t("session.unitToggleLabel")}</legend>
        {UNITS.map((u, i) => {
          const on = u === value;
          return (
            <span key={u} className="inline-flex items-center">
              {/* 두 버튼 사이 간격 — 누르는 자리(아래 after:)가 서로 닿지 않게(/qa code H-1) */}
              {i > 0 ? (
                <span
                  aria-hidden
                  className="px-[3px] text-(--color-line-strong) text-[length:var(--text-xs)]"
                >
                  │
                </span>
              ) : null}
              <button
                type="button"
                data-testid={`unit-toggle-${u}`}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => onChange(u)}
                // [원본] h-7 min-w-[24px] — 누르는 자리 28×24px(잘못 누르면 숫자 그대로 단위만 바뀐다 · /qa code H-1)
                // [개선] 보이는 글자는 그대로, 누르는 자리만 위(12px)·아래(4px)로 넓힌다(after: 44px 높이) — 표 머리 높이는 그대로, 아래 무게 칸은 침범하지 않는다
                className={`relative inline-flex h-7 min-w-[22px] items-center justify-center px-[2px] text-[length:var(--text-xs)] after:absolute after:inset-x-[-2px] after:top-[-12px] after:bottom-[-4px] after:content-[''] disabled:opacity-60 ${
                  on ? "font-bold text-(--color-ink)" : "font-medium text-(--color-ink3)"
                }`}
              >
                {u}
              </button>
            </span>
          );
        })}
      </fieldset>
    );
  }
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
            disabled={disabled}
            onClick={() => onChange(u)}
            className={`min-w-[34px] disabled:opacity-60 rounded-[var(--radius-pill)] px-[var(--spacing-sm)] py-[2px] font-semibold text-[length:var(--text-xs)] leading-[18px] ${
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
