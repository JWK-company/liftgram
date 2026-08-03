// @plm SRS-001  토글 칩 — app의 features/exercises/Chip.tsx를 웹으로 옮긴 것
//
// 필터(부위·기구)와 폼의 다중/단일 선택에 공용으로 쓴다. 활성이면 브랜드 채움 + 볼드,
// 비활성이면 surfaceAlt 배경 + 테두리 — app과 같은 두 상태다.
"use client";

import { AppText } from "./primitives";

export function Chip({
  label,
  active,
  onPress,
  testId,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onPress}
      style={{
        backgroundColor: active ? "var(--color-brand)" : "var(--color-surface-alt)",
        borderColor: active ? "var(--color-brand)" : "var(--color-line)",
      }}
      className="shrink-0 whitespace-nowrap rounded-[var(--radius-pill)] border px-[var(--spacing-md)] py-[var(--spacing-sm)] active:opacity-80"
    >
      <AppText
        variant="caption"
        color={active ? "text" : "textMuted"}
        className={active ? "font-bold" : ""}
        style={active ? { color: "var(--color-on-brand)" } : undefined}
      >
        {label}
      </AppText>
    </button>
  );
}
