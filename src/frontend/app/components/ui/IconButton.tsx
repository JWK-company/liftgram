// @plm SRS-051  아이콘 버튼 — app의 components/IconButton을 웹으로 옮긴 것
//
// 40×40 원형. `filled`면 surfaceAlt 배경을 깐다. 세션 헤더·종목 블록 헤더가 쓴다.
"use client";

import { Icon, type IconName } from "./Icon";

export function IconButton({
  icon,
  onPress,
  size = 20,
  color = "var(--color-ink2)",
  filled,
  disabled,
  label,
  testId,
  className = "",
  hasPopup,
}: {
  icon: IconName;
  onPress?: () => void;
  size?: number;
  color?: string;
  filled?: boolean;
  disabled?: boolean;
  /** 스크린리더용 이름 — 아이콘만 있는 버튼이라 없으면 무엇인지 알 수 없다. */
  label: string;
  testId?: string;
  className?: string;
  /** 누르면 창이 뜨는가(확인창 등 · SPEC-059) */
  hasPopup?: "dialog" | "menu";
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      aria-haspopup={hasPopup}
      disabled={disabled}
      onClick={onPress}
      // [원본] className={`flex h-10 w-10 shrink-0 … — 누르는 자리 40px
      // [개선] 보이는 크기 40 · 누르는 자리 ::before 44(SPEC-056 F7)
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-pill)] before:absolute before:-inset-[2px] before:content-[''] focus-visible:outline-2 focus-visible:outline-(--color-brand) ${
        /* [원본] filled ? "bg-(--color-surface-alt)" : "" — 회색 원 판 · [개선] 판 없이, 누를 때만 옅은 판(SPEC-056 F5) */ filled
          ? "active:bg-(--color-surface-alt)"
          : ""
      } ${disabled ? "opacity-40" : "active:opacity-70"} ${className}`}
    >
      <Icon name={icon} size={size} color={color} />
    </button>
  );
}
