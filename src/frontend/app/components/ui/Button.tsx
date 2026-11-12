// @plm SRS-051  버튼 — app의 components/Button.tsx를 웹으로 옮긴 것
//
// props는 app과 같다: `<Button title="저장" variant="primary" icon="checkmark" />`.
// 모양은 booktarae(피그마 디자인 시스템 v2.0)를 따른다(2026-10-26): 기본 높이 48(터치 기본) · 반경 8 ·
// 라벨 SemiBold · 보조 버튼은 테두리 없는 회색 판(booktarae tertiary) · 키보드 포커스 링.
"use client";

import type { CSSProperties, ReactNode } from "react";
import { LogoSpinner } from "./LogoSpinner";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet" | "tonal" | "tonalOnTint" | "outline";
type Size = "sm" | "md" | "lg";

const HEIGHT: Record<Size, number> = { sm: 36, md: 48, lg: 54 };

/** app의 getPalette와 같은 표. 테두리가 있는 변형만 border를 준다. */
function palette(variant: Variant): { bg: string; fg: string; border?: string } {
  switch (variant) {
    case "primary":
      return { bg: "var(--color-brand)", fg: "var(--color-on-brand)" };
    // [원본] case "secondary": return { bg: "var(--color-surface-alt)", fg: "var(--color-ink)" }; — 회색 채움 막대
    // [개선] 평평한 기록지(SPEC-056 F4) — 채움 없이 테두리만(컨트롤 경계 line-strong · 흰 바탕 4.67:1)
    case "secondary":
      return { bg: "transparent", fg: "var(--color-ink)", border: "var(--color-line-strong)" };
    case "ghost":
      // [원본] return { bg: "transparent", fg: "var(--color-brand)" }; — 판 없는 빨강 글자(REV-149 8). 다크에서 「이 루틴 시작」·「▶ 시작」이
      //   안내 글처럼 보였다(사용자 지시 2650) → [개선] 회색 테두리 상자 + 빨강 글자·▶ — 루틴마다 되풀이되는 행동이라
      //   빨강 테두리(outline — 「새 루틴」·「빠른 운동」)와 갈리고 빨강이 화면을 덮지 않는다(SPEC-061 REV-149: 되풀이 = neutral · 리뷰 M-2)
      return { bg: "transparent", fg: "var(--color-brand)", border: "var(--color-line-strong)" };
    case "danger":
      return { bg: "transparent", fg: "var(--color-bad)", border: "var(--color-bad)" };
    // 조용한 부가 행동 — 상자·빨강 없이 회색 글자(화면 정리 공용 규칙: 빨강은 화면의 주 행동 하나) @plm SRS-072
    case "quiet":
      // [원본] return { bg: "transparent", fg: "var(--color-ink2)" }; — 회색 글자만(SPEC-061 1A)
      // [개선] 회색 테두리 상자 · 진한 글자 — 입력칸과 같은 4px 직사각형(SPEC-057 R1)
      return { bg: "transparent", fg: "var(--color-ink)", border: "var(--color-line-strong)" };
    // 옅은 강조 — 연한 빨강 판 + 빨간 글자. 여러 개 놓여도 화면이 빨강으로 덮이지 않는 「눌러서 시작」(내 루틴 「▶ 시작」 · 2026-11-09)
    // 빨강 채움(primary)은 여전히 화면에 하나다
    case "tonal":
      return { bg: "var(--color-brand-muted)", fg: "var(--color-brand)" };
    // 옅은 강조를 연한 빨강 카드(오늘 할 운동·추천 카드) 위에 둘 때 — 판이 카드와 같은 색이라 사라지므로 카드 바탕 판
    case "tonalOnTint":
      return { bg: "var(--color-card)", fg: "var(--color-brand)" };
    // 테두리 강조 — 카드 판 + 빨간 테두리·글자. 큰 보조 버튼이 회색 판이라 밋밋할 때(운동 홈 새 루틴·빠른 운동 · 2026-11-09)
    case "outline":
      // [원본] return { bg: "var(--color-card)", fg: "var(--color-brand)", border: "var(--color-brand)" };
      // [개선] 바탕 투명 — 다크에서 카드 판(#2B2B2B)이 바탕(#161616) 위에 회색 판으로 떠 보였다(SPEC-056 P5 리뷰 M-1)
      return { bg: "transparent", fg: "var(--color-brand)", border: "var(--color-brand)" };
  }
}

/**
 * 직접 그린 <button> 을 「누르는 단추」 모양으로 — 글자만 있는 단추가 다크에서 안내 글과 구별되지 않던 것(SPEC-061 1A).
 * 새 컴포넌트 대신 클래스만 돌려준다(각 자리의 testId·aria·여백을 그대로 둔다). 크기·여백은 쓰는 쪽이 붙인다.
 *   neutral = 회색 테두리 · 진한 글자 / brand = 브랜드 테두리·글자 / bad = 위험 테두리·글자 / brandFill = 브랜드 채움
 */
export function actionBoxClass(tone: "neutral" | "brand" | "bad" | "brandFill" = "neutral"): string {
  const base =
    // 최소 높이는 쓰는 쪽이 정한다 — 여기 두면 출력 순서상 쓰는 쪽의 min-h-11 을 덮었다(REV-150 1)
    "inline-flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] border font-semibold disabled:opacity-45 active:opacity-85";
  switch (tone) {
    case "brand":
      return `${base} border-(--color-brand) bg-transparent text-(--color-brand)`;
    case "bad":
      return `${base} border-(--color-bad) bg-transparent text-(--color-bad)`;
    case "brandFill":
      return `${base} border-(--color-brand) bg-(--color-brand) text-(--color-on-brand)`;
    default:
      return `${base} border-(--color-line-strong) bg-transparent text-(--color-ink)`;
  }
}

/** 36·40px 상자의 누르는 자리를 위아래 4px 씩 넓혀 44px 이상으로(SPEC-061 · REV-150 3) — 부모가 overflow 로 자르지 않는 곳에 */
export const touchPad = "relative before:absolute before:inset-x-0 before:-inset-y-[4px] before:content-['']";

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
  truncate = false,
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
  /** 긴 글자(사람 이름이 든 버튼 등)를 한 줄로 자르고 … — 기본은 그대로 */
  truncate?: boolean;
}) {
  const p = palette(variant);
  const isDisabled = disabled || loading;
  const quiet = variant === "quiet";
  const style: CSSProperties = {
    height: HEIGHT[size],
    // quiet 는 바탕을 인라인으로 박지 않는다 — 눌림·hover 바탕을 클래스로 줘야 「누를 수 있음」이 보인다(/qa P4 L-2)
    backgroundColor: quiet ? undefined : p.bg,
    color: p.fg,
    borderColor: p.border,
    borderWidth: p.border ? 1 : 0,
    borderStyle: "solid",
  };

  return (
    <button
      type="button"
      data-testid={testId}
      data-variant={variant}
      onClick={onPress}
      disabled={isDisabled}
      style={style}
      className={`relative inline-flex items-center justify-center gap-[6px] rounded-[var(--radius-sm)] px-[var(--spacing-lg)] font-semibold focus-visible:outline-2 focus-visible:outline-(--color-brand) focus-visible:outline-offset-2
        ${size === "sm" ? "text-[length:var(--text-sm)]" : "text-[length:var(--text-md)]"}
        ${size === "sm" ? touchPad : ""}
        ${fullWidth ? "w-full" : "self-start px-[var(--spacing-xl)]"}
        ${isDisabled ? "opacity-45" : "active:opacity-85"}
        ${quiet && !isDisabled ? "bg-transparent hover:bg-(--color-surface-alt) active:bg-(--color-surface-alt)" : ""} ${className}`}
    >
      {loading ? (
        // 앱 공용 로딩 = 로고 색 채우기(SRS-054 · booktarae 와 같다). 버튼 글자색을 따른다.
        <span role="status" style={{ color: p.fg }} className="inline-flex">
          <LogoSpinner size={18} tone="current" label="처리 중" />
        </span>
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} color={p.fg} /> : null}
          {/* [원본] {title} */}
          {/* [개선] truncate 면 글자 칸이 줄어들 수 있게(min-w-0) 자른다 — 「○○님께 보내기」의 긴 이름(SPEC-050 P3b 리뷰 L-4) */}
          {truncate ? <span className="min-w-0 truncate">{title}</span> : title}
        </>
      )}
      {adornment}
    </button>
  );
}
