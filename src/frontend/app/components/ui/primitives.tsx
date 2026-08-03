// @plm SRS-007  화면 프리미티브 — app의 components/primitives.tsx를 웹으로 옮긴 것
//
// ─────────────────────────────────────────────────────────────────────────────
// **목표는 "같은 앱으로 보이는 것"이다.** 그래서 이름·props·시각 결과를 app과 맞춘다 —
// 화면을 옮길 때 `<AppText variant="heading">` 을 그대로 쓸 수 있어야 옮기는 일이 기계적이 된다.
//
// 색·간격·라운드·크기는 전부 토큰이다(app/src/theme/tokens.ts에서 생성된 CSS 변수).
// 여기에 색을 직접 적지 않는다 — 적는 순간 app과 갈라진다.
//
// RN → DOM에서 달라지는 것은 **구현뿐**이다: View→div, Text→span/p, StyleSheet→Tailwind.
// ─────────────────────────────────────────────────────────────────────────────
import type { CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type TextVariant = "display" | "title" | "heading" | "body" | "caption" | "label";
export type ColorKey =
  | "text"
  | "textMuted"
  | "textFaint"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "pr";

/** app의 VARIANT 표와 같은 값(크기·굵기). */
const VARIANT: Record<TextVariant, string> = {
  display: "text-[length:var(--text-xxl)] font-bold",
  title: "text-[length:var(--text-xl)] font-bold",
  heading: "text-[length:var(--text-lg)] font-bold",
  body: "text-[length:var(--text-md)] font-normal",
  caption: "text-[length:var(--text-sm)] font-normal",
  label: "text-[length:var(--text-xs)] font-semibold",
};

const COLOR: Record<ColorKey, string> = {
  text: "text-(--color-ink)",
  textMuted: "text-(--color-ink2)",
  textFaint: "text-(--color-ink3)",
  primary: "text-(--color-brand)",
  success: "text-(--color-ok)",
  warning: "text-(--color-warn)",
  danger: "text-(--color-bad)",
  pr: "text-(--color-pr)",
};

export function AppText({
  variant = "body",
  color = "text",
  center,
  className = "",
  style,
  children,
  ...rest
}: {
  variant?: TextVariant;
  color?: ColorKey;
  center?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "color" | "style" | "className">) {
  return (
    <span
      {...rest}
      style={style}
      className={`${VARIANT[variant]} ${COLOR[color]} ${center ? "text-center" : ""} ${className}`}
    >
      {children}
    </span>
  );
}

/** 카드 — 표면색 · 12px 라운드 · 16px 패딩 · 1px 테두리(app과 동일). */
export function Card({
  children,
  className = "",
  alt,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  alt?: boolean;
  // 나머지 속성(예: data-testid)은 그대로 흘려보낸다 — 안 그러면 카드에 표식을 달 수 없고,
  // 테스트가 "화면에는 보이는데 못 찾는" 상태가 된다(실제로 한 번 밟았다).
} & Omit<React.HTMLAttributes<HTMLDivElement>, "className">) {
  return (
    <div
      {...rest}
      className={`rounded-[var(--radius-md)] border border-(--color-line) p-[var(--spacing-lg)] ${
        alt ? "bg-(--color-surface-alt)" : "bg-(--color-card)"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export type TagTone = "default" | "primary" | "pr" | "muted" | "success" | "warning" | "danger";

/**
 * 작은 칩. 배경은 각 색의 어두운 짝이다 — app이 손으로 고른 값이라 그대로 옮긴다
 * (토큰에 없는 값이므로 여기서만 쓰이는 상수로 둔다).
 */
const TAG_PALETTE: Record<TagTone, { bg: string; fg: string }> = {
  primary: { bg: "var(--color-brand-muted)", fg: "var(--color-brand)" },
  pr: { bg: "#4A3F12", fg: "var(--color-pr)" },
  success: { bg: "#12351F", fg: "var(--color-ok)" },
  warning: { bg: "#3A2E10", fg: "var(--color-warn)" },
  danger: { bg: "#3A1518", fg: "var(--color-bad)" },
  muted: { bg: "var(--color-surface-alt)", fg: "var(--color-ink2)" },
  default: { bg: "var(--color-surface-alt)", fg: "var(--color-ink2)" },
};

export function Tag({ label, tone = "default" }: { label: string; tone?: TagTone }) {
  const { bg, fg } = TAG_PALETTE[tone] ?? TAG_PALETTE.default;
  return (
    <span
      style={{ backgroundColor: bg, color: fg }}
      className="inline-flex self-start rounded-[var(--radius-pill)] px-[var(--spacing-sm)] py-[3px] text-[length:var(--text-xs)] font-semibold"
    >
      {label}
    </span>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`my-[var(--spacing-md)] h-px bg-(--color-line) ${className}`} />;
}

export function SectionHeader({
  title,
  right,
  titleTestId,
}: {
  title: string;
  right?: ReactNode;
  titleTestId?: string;
}) {
  return (
    <div className="mb-[var(--spacing-md)] flex items-center justify-between">
      <AppText variant="heading" data-testid={titleTestId}>
        {title}
      </AppText>
      {right}
    </div>
  );
}

/** 지표 타일 — 카드보다 좁은 패딩(12px)에 라벨·값·부연. */
export function StatTile({
  label,
  value,
  caption,
  testId,
}: {
  label: string;
  value: string;
  caption?: string;
  /** 값에 붙는다 — 테스트가 보이는 그 값을 그대로 읽게 하기 위해서다. */
  testId?: string;
}) {
  return (
    <Card className="flex-1 p-[var(--spacing-md)]!">
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      <div className="mt-[var(--spacing-xs)]">
        <AppText variant="title" data-testid={testId}>
          {value}
        </AppText>
      </div>
      {caption ? (
        <div className="mt-[2px]">
          <AppText variant="caption" color="textFaint">
            {caption}
          </AppText>
        </div>
      ) : null}
    </Card>
  );
}

/** 빈 상태 — 선택적 원형 아이콘 배지 + 제목 + 메시지 + CTA. */
export function EmptyState({
  title,
  message,
  action,
  icon,
  tone = "default",
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  icon?: IconName;
  tone?: "default" | "error";
}) {
  const isError = tone === "error";
  return (
    <div
      data-testid="empty-state"
      className="flex flex-1 flex-col items-center justify-center p-[var(--spacing-xl)]"
    >
      {icon ? (
        <div
          style={{ backgroundColor: isError ? "#3A1F1F" : "var(--color-surface-alt)" }}
          className="mb-[var(--spacing-lg)] flex h-16 w-16 items-center justify-center rounded-[var(--radius-pill)]"
        >
          <Icon name={icon} size={30} color={isError ? "var(--color-bad)" : "var(--color-ink3)"} />
        </div>
      ) : null}
      <AppText variant="heading" center>
        {title}
      </AppText>
      {message ? (
        <div className="mt-[var(--spacing-sm)]">
          <AppText variant="caption" color="textMuted" center>
            {message}
          </AppText>
        </div>
      ) : null}
      {action ? <div className="mt-[var(--spacing-lg)]">{action}</div> : null}
    </div>
  );
}
