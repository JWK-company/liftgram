"use client";
// 누를 수 있는 값 = 옅은 칩(SPEC-046 · SRS-111 R1) — 「바탕이 있으면 눌린다」
//
// 세 종류 기준(REV-084 5):
//   ① 값 칩(이것) — 바탕이 있다 · 누르면 이 줄의 값을 채우거나 바꾼다(「이전」 · PR · 휴식 · 메모)
//   ② 메타 꺾쇠 — 바탕 없이 글자 + chevron · 다른 창을 연다(세트 번호 · 세트 방식 이름 · 「해제」)
//   ③ 입력칸 — 네모 + 테두리
// 「눌리지 않으면 바탕 없음」 — disabled 면 바탕을 빼고 맨 글자로 그린다.
//
// 구조: 바깥 button 이 testid · 이름 · 44px 누르는 자리를 갖고, 칩 바탕은 안쪽 span 에 그린다
// (의사 요소로 넓히면 boundingBox 로 잴 수 없고 이웃 줄과 겹친다 · REV-084 3).
// [원본] 모양은 알약(rounded-full) — 입력칸(네모 · 테두리)과 윤곽부터 다르다(P1 코드 리뷰 시각 1).
// [개선] 모양은 앱 공통 4px(SPEC-057 R1c) — 입력칸과는 면(옅은 판 · 테두리 없음 대 흰 바탕 · 테두리)으로 갈린다.
// compact(메타 줄)는 줄 높이 32px 그대로 두고 누르는 자리만 위아래로 44px(-my-[6px]).
// 아이콘은 SVG(aria-hidden) — testid 요소의 글자가 바뀌지 않게(REV-084 2). 새 색 토큰은 만들지 않는다.
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type ValueChipIcon = "fill" | "pick" | "edit" | "view";
const ICON: Record<ValueChipIcon, IconName> = {
  fill: "return-down-forward",
  pick: "chevron-down",
  edit: "create-outline",
  view: "chevron-forward",
};

/** 칩 바탕 — 장식형(span)과 버튼형이 같은 모양을 쓴다 */
export function chipFaceClass(tone: "default" | "pr", disabled: boolean): string {
  if (disabled) return "";
  return tone === "pr" ? "bg-(--color-pr-soft)" : "bg-(--color-surface-alt)";
}

export function ValueChip({
  children,
  icon,
  tone = "default",
  onPress,
  disabled = false,
  testId,
  ariaLabel,
  className = "",
  faceClassName = "",
  as = "button",
  haspopup,
  dataAttrs,
  stretch = false,
  compact = false,
  softDisabled = false,
}: {
  children: ReactNode;
  icon?: ValueChipIcon;
  tone?: "default" | "pr";
  onPress?: () => void;
  disabled?: boolean;
  testId?: string;
  ariaLabel?: string;
  /** 바깥(누르는 자리) */
  className?: string;
  /** 안쪽 칩(바탕) */
  faceClassName?: string;
  /** span = 장식형(이미 버튼인 줄 안에서 · aria-hidden) */
  as?: "button" | "span";
  haspopup?: boolean;
  dataAttrs?: Record<string, string | undefined>;
  /** 칸 전체를 칩으로(세트 줄 「이전」 66px — 두 줄까지 · 아이콘 없음 · REV-084 6) */
  stretch?: boolean;
  /** 메타 줄(32px 줄) — 누르는 높이 32px(기존 PR 글자와 같은 자리 · 줄 높이를 늘리지 않음) */
  compact?: boolean;
  /** 눌러도 값은 못 채우지만 안내(토스트)는 띄운다 — 바탕 없음 · aria-disabled(PR 채울 세트 없음 · P1 코드 리뷰) */
  softDisabled?: boolean;
}) {
  const off = disabled || softDisabled;
  const face = (
    <span
      data-chip-face=""
      className={`${
        stretch
          ? "flex w-full flex-col justify-center px-[4px] py-[3px]"
          : compact
            ? // 메타 줄 — PR 두 조각이 360px 한 줄에 들어가게 좁게(declutter-block 머리 높이 ≤ 170)
              "inline-flex items-center gap-[2px] px-[4px] py-[1px]"
            : "inline-flex items-center gap-[3px] px-[6px] py-[2px]"
      } min-w-0 rounded-[var(--radius-sm)] ${chipFaceClass(tone, off)} ${faceClassName}`} // [원본] rounded-full(SPEC-057 R1c)
    >
      {children}
      {/* 메타 줄(compact)은 아이콘 없이 바탕만 — PR 두 조각이 360px 한 줄에 들어가야 한다(declutter-block 머리 높이) */}
      {icon && !off && !compact ? (
        <Icon
          name={ICON[icon]}
          size={12}
          color={tone === "pr" ? "var(--color-pr)" : "var(--color-ink3)"}
          className="shrink-0"
        />
      ) : null}
    </span>
  );
  if (as === "span")
    return (
      <span aria-hidden className={`inline-flex items-center ${className}`} data-testid={testId}>
        {face}
      </span>
    );
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={ariaLabel}
      aria-haspopup={haspopup ? "dialog" : undefined}
      aria-disabled={softDisabled || undefined}
      disabled={disabled}
      onClick={onPress}
      {...dataAttrs}
      className={`inline-flex min-h-[44px] ${compact ? "-my-[6px]" : ""} min-w-0 items-center rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-(--color-brand) active:opacity-70 ${className}`}
    >
      {face}
    </button>
  );
}
