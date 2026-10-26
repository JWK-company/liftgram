// @plm SRS-054  목록 줄 · 구역 제목 · 구간 선택기 · 밑줄 탭 · 숫자 한 줄
//
// 북타래 규칙: **목록은 줄, 카드는 요약 한 장에만.** 설정 한 줄·숫자 하나까지 카드에 넣으면 무엇이
// 중요한지 구분되지 않는다. 그래서 줄(ListRow)을 모은 묶음(ListGroup)과 그 위의 구역 제목(SectionLabel)을 둔다.
// 기간·보기 전환은 구간 선택기(Segmented), 화면 안 갈래는 밑줄 탭(UnderlineTabs). 칩은 필터에만 쓴다.
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/** 구역 제목 — 줄 묶음 위의 작은 제목. 오른쪽에 「전체 ›」 같은 링크 하나. */
export function SectionLabel({
  title,
  right,
  testId,
  className = "",
}: {
  title: string;
  right?: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-end justify-between px-[var(--spacing-xs)] pb-[var(--spacing-sm)] ${className}`}
    >
      <h2 data-testid={testId} className="font-bold text-(--color-ink) text-[length:var(--text-md)]">
        {title}
      </h2>
      {right ? <div className="text-(--color-ink2) text-[length:var(--text-sm)]">{right}</div> : null}
    </div>
  );
}

/** 줄 묶음 — 둥근 판 하나에 줄을 겹쳐 담고, 줄 사이에만 선을 긋는다. */
export function ListGroup({
  children,
  className = "",
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`overflow-hidden rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) [&>*+*]:border-(--color-line) [&>*+*]:border-t ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * 목록 줄 — 왼쪽(아이콘·선두) · 가운데(제목·부제) · 오른쪽(값 · › 또는 임의 노드).
 * href 면 링크, onPress 면 버튼, 둘 다 없으면 그냥 줄. 누르는 칸은 최소 52px.
 */
export function ListRow({
  title,
  subtitle,
  leading,
  icon,
  value,
  trailing,
  chevron,
  href,
  onPress,
  testId,
  danger,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  icon?: IconName;
  value?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  href?: string;
  onPress?: () => void;
  testId?: string;
  danger?: boolean;
}) {
  const body = (
    <>
      {leading ??
        (icon ? (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-(--color-surface-alt)">
            <Icon name={icon} size={19} color={danger ? "var(--color-bad)" : "var(--color-ink2)"} />
          </span>
        ) : null)}
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={`truncate text-[length:var(--text-md)] ${danger ? "text-(--color-bad)" : "text-(--color-ink)"} font-medium`}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="truncate text-(--color-ink2) text-[length:var(--text-sm)]">{subtitle}</span>
        ) : null}
      </span>
      {value != null ? (
        <span className="shrink-0 text-(--color-ink2) text-[length:var(--text-sm)]">{value}</span>
      ) : null}
      {trailing}
      {chevron || ((href || onPress) && chevron !== false && !trailing) ? (
        <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
      ) : null}
    </>
  );
  const cls =
    "flex min-h-[52px] w-full items-center gap-[var(--spacing-md)] px-[var(--spacing-lg)] py-[var(--spacing-md)] text-left";
  if (href)
    return (
      <a href={href} data-testid={testId} className={`${cls} active:bg-(--color-surface-alt)`}>
        {body}
      </a>
    );
  if (onPress)
    return (
      <button
        type="button"
        data-testid={testId}
        onClick={onPress}
        className={`${cls} active:bg-(--color-surface-alt)`}
      >
        {body}
      </button>
    );
  return (
    <div data-testid={testId} className={cls}>
      {body}
    </div>
  );
}

export type SegmentItem<V extends string> = { value: V; label: string; href?: string; testId?: string };

/** 구간 선택기 — 회색 틀 안의 흰 칸. href 를 주면 링크(주소가 곧 상태)로 그린다. */
export function Segmented<V extends string>({
  items,
  value,
  onChange,
  testId,
  className = "",
}: {
  items: SegmentItem<V>[];
  value: V;
  onChange?: (v: V) => void;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      data-testid={testId}
      className={`flex rounded-[10px] bg-(--color-surface-alt) p-[3px] ${className}`}
    >
      {items.map((it) => {
        const on = it.value === value;
        const cls = `flex h-9 flex-1 items-center justify-center rounded-[8px] text-[length:var(--text-sm)] ${
          on ? "bg-(--seg-on) font-semibold text-(--color-ink) shadow-sm" : "text-(--color-ink2)"
        }`;
        return it.href ? (
          <a
            key={it.value}
            href={it.href}
            role="tab"
            aria-selected={on}
            data-testid={it.testId}
            className={cls}
          >
            {it.label}
          </a>
        ) : (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={on}
            data-testid={it.testId}
            onClick={() => onChange?.(it.value)}
            className={cls}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** 밑줄 탭 — 화면 안의 갈래(팔로잉/발견 등). 현재 칸에 브랜드색 밑줄. */
export function UnderlineTabs<V extends string>({
  items,
  value,
  onChange,
  testId,
}: {
  items: SegmentItem<V>[];
  value: V;
  onChange?: (v: V) => void;
  testId?: string;
}) {
  return (
    <div role="tablist" data-testid={testId} className="flex border-(--color-line) border-b">
      {items.map((it) => {
        const on = it.value === value;
        const cls = `relative flex h-11 flex-1 items-center justify-center text-[length:var(--text-md)] ${
          on ? "font-semibold text-(--color-ink)" : "text-(--color-ink3)"
        }`;
        return it.href ? (
          <a
            key={it.value}
            href={it.href}
            role="tab"
            aria-selected={on}
            data-testid={it.testId}
            className={cls}
          >
            {it.label}
            {on ? <UnderlineBar /> : null}
          </a>
        ) : (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={on}
            data-testid={it.testId}
            onClick={() => onChange?.(it.value)}
            className={cls}
          >
            {it.label}
            {on ? <UnderlineBar /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** 숫자 한 줄 — 같은 무게의 숫자는 상자 셋 대신 칸 나눔으로. */
export function KpiRow({
  items,
  testId,
  className = "",
}: {
  items: { label: string; value: ReactNode; testId?: string }[];
  testId?: string;
  className?: string;
}) {
  return (
    <div data-testid={testId} className={`flex divide-x divide-(--color-line) ${className}`}>
      {items.map((k) => (
        <div key={k.label} className="flex min-w-0 flex-1 flex-col items-center px-[var(--spacing-xs)]">
          <span
            data-testid={k.testId}
            className="font-bold text-(--color-ink) text-[length:var(--text-lg)] tabular-nums"
          >
            {k.value}
          </span>
          <span className="text-(--color-ink2) text-[length:var(--text-xs)]">{k.label}</span>
        </div>
      ))}
    </div>
  );
}

function UnderlineBar() {
  return <span className="absolute inset-x-6 bottom-0 h-[2px] rounded-full bg-(--color-brand)" />;
}
