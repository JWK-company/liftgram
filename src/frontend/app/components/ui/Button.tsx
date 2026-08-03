// @plm SRS-007  버튼 — app의 components/Button.tsx를 웹으로 옮긴 것
//
// props와 시각 결과를 app과 맞춘다: `<Button title="저장" variant="primary" icon="checkmark" />`.
// 높이(36/46/54)·라운드·간격·비활성 투명도(0.45)·눌림 투명도(0.85)까지 같은 값이다.
"use client";

import type { CSSProperties } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const HEIGHT: Record<Size, number> = { sm: 36, md: 46, lg: 54 };

/** app의 getPalette와 같은 표. 테두리가 있는 변형만 border를 준다. */
function palette(variant: Variant): { bg: string; fg: string; border?: string } {
  switch (variant) {
    case "primary":
      return { bg: "var(--color-brand)", fg: "var(--color-on-brand)" };
    case "secondary":
      return { bg: "var(--color-surface-alt)", fg: "var(--color-ink)", border: "var(--color-line)" };
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
      className={`inline-flex items-center justify-center gap-[var(--spacing-sm)] rounded-[var(--radius-md)] px-[var(--spacing-lg)] font-bold
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
    </button>
  );
}
