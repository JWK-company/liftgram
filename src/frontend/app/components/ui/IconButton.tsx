// @plm SRS-007  아이콘 버튼 — app의 components/IconButton을 웹으로 옮긴 것
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
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-pill)] ${
        filled ? "bg-(--color-surface-alt)" : ""
      } ${disabled ? "opacity-40" : "active:opacity-70"} ${className}`}
    >
      <Icon name={icon} size={size} color={color} />
    </button>
  );
}
