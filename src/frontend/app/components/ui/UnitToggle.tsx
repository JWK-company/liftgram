"use client";
// @plm SRS-067  kg/lb 세그먼트 토글 — 운동 블록 머리의 PR 칩 옆
//
// 한 헬스장 안에서도 해머스트렝스 플레이트는 lb, 국산 핀로드는 kg 처럼 기구마다 단위가 다르다. 그래서 단위는 블록마다
// 바꾼다. 칩 줄(PR 칩·볼륨 칩)과 같은 높이의 작은 알약 두 칸 — 켜진 쪽만 브랜드색으로 채운다. 누르는 자리는
// 시각보다 넓게(위아래 패딩) 잡아 장갑 낀 손가락에도 맞게 한다.
import { segCellClass } from "./rows";
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
        // [원본] className="m-0 inline-flex min-w-0 shrink-0 items-center border-0 p-0" — 글자 둘(굵기만 다름)이라 「바꾸는 곳」인지 몰랐다(사용성 1)
        // [원본] 둘로 나뉜 토글 — 옅은 트랙 + 고른 쪽 알약(surface + 그림자 + 굵게 · 다크에서도 토큰 · SPEC-046 · REV-084 15). 높이 h-7 그대로
        // [원본] rounded-full · [개선] 분할 토글 트랙 4px(SPEC-057 R1d)
        className="m-0 inline-flex h-7 min-w-0 shrink-0 items-center rounded-[var(--radius-sm)] border-0 bg-(--color-surface-alt) p-[2px]"
      >
        {/* 읽어 주는 legend — legend 없는 fieldset 의 그룹을 건너뛰는 스크린리더가 있다(/qa code L-6) */}
        <legend className="sr-only">{t("session.unitToggleLabel")}</legend>
        {UNITS.map((u, i) => {
          const on = u === value;
          return (
            <span key={u} className="inline-flex items-center">
              {/* 두 버튼 사이 간격 — 누르는 자리(아래 after:)가 서로 닿지 않게(/qa code H-1) */}
              {i > 0 ? (
                // 두 버튼 사이 틈 — 글자 「│」 대신 빈 틈(누르는 자리가 닿지 않게는 그대로 · /qa code H-1)
                <span aria-hidden className="w-[6px]" />
              ) : null}
              <button
                type="button"
                data-testid={`unit-toggle-${u}`}
                aria-pressed={on}
                disabled={disabled}
                onClick={() => onChange(u)}
                // [원본] h-7 min-w-[24px] — 누르는 자리 28×24px(잘못 누르면 숫자 그대로 단위만 바뀐다 · /qa code H-1)
                // [개선] 보이는 글자는 그대로, 누르는 자리만 위(12px)·아래(4px)로 넓힌다(after: 44px 높이) — 표 머리 높이는 그대로, 아래 무게 칸은 침범하지 않는다
                // [원본] … rounded-full … · [개선] 안쪽 칸 2px(SPEC-057 R1d)
                // [원본] on ? "bg-(--seg-on) font-bold text-(--color-ink) shadow-[0_1px_2px_rgba(0,0,0,0.18)]" : "font-medium text-(--color-ink3)"
                //   (bg-(--color-surface) 은 다크에서 트랙보다 어두워 「눌린 구멍」처럼 보였다 · P2 리뷰 → --seg-on)
                // [개선] 분할 토글 칸 하나의 꼴(segCellClass · SPEC-057 R1d · REV-129)
                className={`relative inline-flex h-6 min-w-[24px] items-center justify-center px-[4px] text-[length:var(--text-xs)] after:absolute after:inset-x-[-2px] after:top-[-14px] after:bottom-[-6px] after:content-[''] disabled:opacity-60 ${segCellClass(on)}`}
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
      // [원본] rounded-[var(--radius-pill)] border border-(--color-line) · [개선] 트랙 4px 옅은 판(SPEC-057 R1d)
      className="m-0 inline-flex min-w-0 shrink-0 items-center rounded-[var(--radius-sm)] bg-(--color-surface-alt) p-[2px]"
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
            // [원본] rounded-[var(--radius-pill)] · 켜진 칸 bg-(--color-brand) text-(--color-on-brand)
            // [개선] 안쪽 칸 2px · 켜진 칸은 흰 판 + 진한 굵은 글자(분할 토글 하나의 꼴 · SPEC-057 R1d — 빨강 채움은 주 행동에만)
            className={`min-w-[34px] disabled:opacity-60 px-[var(--spacing-sm)] py-[2px] text-[length:var(--text-xs)] leading-[18px] ${segCellClass(on)}`}
          >
            {u}
          </button>
        );
      })}
    </fieldset>
  );
}
