// @plm SRS-051  입력 — app의 components/inputs.tsx를 웹으로 옮긴 것
//
// TextField와 NumberStepper. 세션 화면의 무게·횟수는 이 스테퍼로 넣는다 —
// ± 버튼과 **값을 눌러 직접 입력**하는 두 경로를 app과 같게 유지한다(점선 밑줄이 그 힌트다).
"use client";

import { useState } from "react";
import { AppText } from "./primitives";
import { Icon } from "./Icon";

export function TextField({
  label,
  hint,
  className = "",
  testId,
  ...rest
}: {
  label?: string;
  hint?: string;
  className?: string;
  testId?: string;
  /** React 19 — ref 는 보통 prop 이라 그대로 input 에 간다(선택 창 검색칸 포커스 · SPEC-054) */
  ref?: React.Ref<HTMLInputElement>;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "className">) {
  return (
    <div className={`mb-[var(--spacing-md)] ${className}`}>
      {label ? (
        <div className="mb-[var(--spacing-xs)]">
          <AppText variant="label" color="textMuted">
            {label}
          </AppText>
        </div>
      ) : null}
      <input
        {...rest}
        data-testid={testId}
        className="w-full rounded-[var(--radius-sm)] border border-(--color-line-strong) bg-(--color-card) outline-none focus:border-(--color-brand) focus:ring-1 focus:ring-(--color-brand) px-[var(--spacing-md)] py-[var(--spacing-md)] text-[length:var(--text-md)] text-(--color-ink) placeholder:text-(--color-ink3)"
      />
      {hint ? (
        <div className="mt-[var(--spacing-xs)]">
          <AppText variant="caption" color="textFaint">
            {hint}
          </AppText>
        </div>
      ) : null}
    </div>
  );
}

/**
 * 여러 줄 입력 — app의 `<TextField multiline>` 자리.
 *
 * 웹의 textarea는 기본 높이가 한 줄이라 짧게 쓰면 답답하고, 길게 고정하면 목록을 밀어낸다.
 * 그래서 최소 높이만 주고 **내용에 따라 늘어나게** 둔다(피드 캡션·댓글이 둘 다 이걸 쓴다).
 */
export function TextArea({
  label,
  className = "",
  testId,
  rows = 2,
  ...rest
}: {
  label?: string;
  className?: string;
  testId?: string;
  rows?: number;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "rows">) {
  return (
    <div className={`mb-[var(--spacing-md)] ${className}`}>
      {label ? (
        <div className="mb-[var(--spacing-xs)]">
          <AppText variant="label" color="textMuted">
            {label}
          </AppText>
        </div>
      ) : null}
      <textarea
        {...rest}
        rows={rows}
        data-testid={testId}
        className="w-full resize-y rounded-[var(--radius-sm)] border border-(--color-line-strong) bg-(--color-card) outline-none focus:border-(--color-brand) focus:ring-1 focus:ring-(--color-brand) px-[var(--spacing-md)] py-[var(--spacing-md)] text-[length:var(--text-md)] text-(--color-ink) leading-[22px] placeholder:text-(--color-ink3)"
      />
    </div>
  );
}

/**
 * 숫자 스테퍼 — ± 버튼 + 값 직접 입력.
 *
 * 반올림·상하한은 app의 clamp와 같다(소수 둘째 자리에서 반올림). 값 표시는 정수면 정수로,
 * 아니면 소수 첫째 자리까지 — 20.5kg 같은 원판 단위를 그대로 보여주기 위해서다.
 */
export function NumberStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  suffix,
  testId,
  compact = false,
}: {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  testId?: string;
  /** 좁은 카드에 둘을 나란히 둘 때 — 간격·값 칸을 줄인다(루틴 편집 S-14 · 2026-11-09) */
  compact?: boolean;
}) {
  // 값 칸의 최소 폭 — 「72.5kg」처럼 긴 값은 글자만큼 넓어진다(입력칸도 같은 폭 · 브라우저 기본 20글자 폭으로 늘지 않게)
  const valW = compact ? "min-w-12" : "min-w-14";
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const n = Number.parseFloat(draft.replace(",", "."));
    if (!Number.isNaN(n)) onChange(clamp(n));
    setEditing(false);
  };

  return (
    <div
      className={`flex items-center ${compact ? "gap-[4px]" : "gap-[var(--spacing-sm)]"}`}
      data-testid={testId}
    >
      <button
        type="button"
        data-testid={testId ? `${testId}-minus` : undefined}
        aria-label="감소"
        onClick={() => onChange(clamp(value - step))}
        // [원본] rounded-[var(--radius-md)] · [개선] 누르는 것은 4px(SPEC-057 R1)
        className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-(--color-surface-alt) text-(--color-ink)"
      >
        <Icon name="remove" size={18} />
      </button>

      {editing ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: 값을 눌러 편집으로 들어온 참이라 바로 입력할 수 있어야 한다
          autoFocus
          data-testid={testId ? `${testId}-input` : undefined}
          value={draft}
          inputMode="decimal"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          onFocus={(e) => e.currentTarget.select()}
          // [원본] h-10 min-w-14 … — 폭을 정하지 않아 입력칸이 브라우저 기본 폭(약 20글자)으로 늘어나 카드 밖으로 밀렸다(S-14)
          style={{ width: `${Math.max(draft.length, 2) + 1.5}ch` }}
          className={`h-10 ${valW} rounded-[var(--radius-sm)] border border-(--color-brand) bg-(--color-surface-alt) px-[2px] text-center text-[length:var(--text-lg)] font-bold text-(--color-ink)`}
        />
      ) : (
        <button
          type="button"
          data-testid={testId ? `${testId}-value` : undefined}
          // 값 칸 — 양옆 −·＋ 상자가 「조절하는 값」임을 말한다(세트 표 값 칸과 같이 단추 가드에서 뺀다 · SPEC-064 REV-161 M-6)
          data-affordance="cell"
          onClick={() => {
            setDraft(fmt(value));
            setEditing(true);
          }}
          // [원본] 점선 밑줄로 「눌러서 입력」을 알렸다 — 루틴 편집·프로필에 점선이 줄줄이 생겨 소음이 됐다(화면 정리 P4)
          // className="flex h-10 min-w-14 items-center justify-center border-(--color-ink3) border-b border-dashed"
          // [개선] 밑줄 없이 숫자만 — 양옆 −·＋ 상자가 이미 「조절하는 값」임을 말한다. 누르면 입력칸(그대로) @plm SRS-072
          className={`flex h-10 ${valW} shrink-0 items-center justify-center rounded-[var(--radius-sm)] active:bg-(--color-surface-alt)`}
        >
          <AppText variant="heading">
            {fmt(value)}
            {suffix ?? ""}
          </AppText>
        </button>
      )}

      <button
        type="button"
        data-testid={testId ? `${testId}-plus` : undefined}
        aria-label="증가"
        onClick={() => onChange(clamp(value + step))}
        // [원본] rounded-[var(--radius-md)] · [개선] 누르는 것은 4px(SPEC-057 R1)
        className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-(--color-surface-alt) text-(--color-ink)"
      >
        <Icon name="add" size={18} />
      </button>
    </div>
  );
}
