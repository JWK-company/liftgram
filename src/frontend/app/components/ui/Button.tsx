// @plm SRS-051  버튼 — app의 components/Button.tsx를 웹으로 옮긴 것
//
// props는 app과 같다: `<Button title="저장" variant="primary" icon="checkmark" />`.
// 모양은 booktarae(피그마 디자인 시스템 v2.0)를 따른다(2026-10-26): 기본 높이 48(터치 기본) · 반경 8 ·
// 라벨 SemiBold · 보조 버튼은 테두리 없는 회색 판(booktarae tertiary) · 키보드 포커스 링.
"use client";

import type { CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const HEIGHT: Record<Size, number> = { sm: 36, md: 48, lg: 54 };

/** app의 getPalette와 같은 표. 테두리가 있는 변형만 border를 준다. */
function palette(variant: Variant): { bg: string; fg: string; border?: string } {
  switch (variant) {
    case "primary":
      return { bg: "var(--color-brand)", fg: "var(--color-on-brand)" };
    case "secondary":
      return { bg: "var(--color-surface-alt)", fg: "var(--color-ink)" };
    case "ghost":
      return { bg: "transparent", fg: "var(--color-brand)" };
    case "danger":
      return { bg: "transparent", fg: "var(--color-bad)", border: "var(--color-bad)" };
  }
}

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  icon,
  fullWidth = true,
  className = "",
  testId,
  adornment,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  fullWidth?: boolean;
  className?: string;
  testId?: string;
  /** 버튼 안에 덧붙이는 것(예: 「최근」 배지 — 버튼이 relative 라 absolute 로 걸칠 수 있다). */
  adornment?: ReactNode;
}) {
  const p = palette(variant);
  const isDisabled = disabled || loading;
  const style: CSSProperties = {
    height: HEIGHT[size],
    backgroundColor: p.bg,
    color: p.fg,
    borderColor: p.border,
    borderWidth: p.border ? 1 : 0,
    borderStyle: "solid",
  };

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onPress}
      disabled={isDisabled}
      style={style}
      className={`relative inline-flex items-center justify-center gap-[6px] rounded-[var(--radius-sm)] px-[var(--spacing-lg)] font-semibold focus-visible:outline-2 focus-visible:outline-(--color-brand) focus-visible:outline-offset-2
        ${size === "sm" ? "text-[length:var(--text-sm)]" : "text-[length:var(--text-md)]"}
        ${fullWidth ? "w-full" : "self-start px-[var(--spacing-xl)]"}
        ${isDisabled ? "opacity-45" : "active:opacity-85"} ${className}`}
    >
      {loading ? (
        // app은 ActivityIndicator를 쓴다 — 웹에는 없어 같은 색의 회전 링으로 대신한다.
        <span
          role="status"
          aria-label="처리 중"
          style={{ borderColor: p.fg, borderTopColor: "transparent" }}
          className="h-4 w-4 animate-spin rounded-full border-2"
        />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} color={p.fg} /> : null}
          {title}
        </>
      )}
      {adornment}
    </button>
  );
}
