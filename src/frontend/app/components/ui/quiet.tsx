"use client";
// @plm SRS-069  조용한 조각 — 화면 정리(정보는 그대로, 소음은 덜어 내기)의 공용 부품
//
// ─────────────────────────────────────────────────────────────────────────────
// 화면마다 정보가 각자 테두리 칩·빨간 글자로 같은 무게로 경쟁하던 것을 줄이는 조각들이다(URS-023).
//
//   색 의미는 둘뿐 — 빨강(--color-brand) = 주 행동·완료·선택 상태, 금색(--color-pr) = PR.
//   그 밖의 상태·메타는 회색(--color-ink2/--color-ink3). 경고·오류 색은 의미 색이라 그대로 쓴다.
//   새 색 토큰은 만들지 않는다(원본 core/src/theme/tokens.ts 그대로).
//
//   MetaLine   회색 caption 한 줄 — 조각을 「 · 」로 잇는다(텍스트·누를 수 있는 텍스트 혼용)
//   MetaAction 누를 수 있는 메타 조각 — 점선 밑줄 + 최소 높이 32px(장갑 낀 손가락 · /qa spec Q7)
//   QuietChip  무테·무채 작은 칩 — 선택 상태만 브랜드 테두리(글자는 ink2 — ink3 는 surface-alt 위 대비 미달 · Q1)
//   Fold       「더 보기 ▸」 한 줄 접기 — 펼침은 기기에 기억(동기 대상 아님 · 실패하면 접힘)
//   PrText     금색 PR 조각 — 누르면 콜백, 옆 ⓘ 는 기록으로(길게 누르기 안 씀 · Q7)
// ─────────────────────────────────────────────────────────────────────────────
import { Children, Fragment, type ReactNode, isValidElement, useEffect, useState } from "react";
import { Icon } from "./Icon";

/** 「 · 」 로 잇는 회색 한 줄. 빈 조각(null·false)은 건너뛴다. 넘치면 다음 줄로 흐른다. */
export function MetaLine({
  children,
  className = "",
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  // toArray 가 null·false·undefined 를 이미 버린다 — 빈 글자만 더 거른다
  const parts = Children.toArray(children).filter((c) => c !== "");
  if (parts.length === 0) return null;
  return (
    <div
      data-testid={testId}
      className={`flex min-w-0 flex-wrap items-center gap-x-[6px] text-[length:var(--text-sm)] text-(--color-ink2) ${className}`}
    >
      {parts.map((p, i) => (
        <Fragment key={isValidElement(p) && p.key != null ? p.key : i}>
          {i > 0 ? (
            <span aria-hidden className="text-(--color-ink3)">
              ·
            </span>
          ) : null}
          {p}
        </Fragment>
      ))}
    </div>
  );
}

/** 누를 수 있는 메타 조각 — 회색 글자 + 점선 밑줄. 상자를 두지 않는다. */
export function MetaAction({
  children,
  onPress,
  testId,
  ariaLabel,
  tone = "muted",
  disabled = false,
  trailingIcon,
  ariaExpanded,
}: {
  children: ReactNode;
  onPress: () => void;
  testId?: string;
  ariaLabel?: string;
  /** muted = 회색(기본) · pr = 금색(PR 조각) */
  tone?: "muted" | "pr";
  disabled?: boolean;
  trailingIcon?: "chevron-down" | "chevron-forward" | "chevron-up";
  ariaExpanded?: boolean;
}) {
  const color = tone === "pr" ? "text-(--color-pr)" : "text-(--color-ink2)";
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      disabled={disabled}
      onClick={onPress}
      className={`inline-flex min-h-[32px] min-w-0 items-center gap-[2px] ${color} disabled:opacity-60`}
    >
      <span className="min-w-0 truncate underline decoration-dotted decoration-[1px] underline-offset-[3px]">
        {children}
      </span>
      {trailingIcon ? (
        <Icon name={trailingIcon} size={12} color={tone === "pr" ? "var(--color-pr)" : "var(--color-ink3)"} />
      ) : null}
    </button>
  );
}

/** 무테·무채 작은 칩 — 선택 상태만 브랜드 테두리. 고르는 칩(필터·브랜드)에 쓴다. */
export function QuietChip({
  label,
  active = false,
  onPress,
  testId,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      onClick={onPress}
      style={{ borderColor: active ? "var(--color-brand)" : "transparent" }}
      className={`min-h-[32px] rounded-[var(--radius-pill)] border bg-(--color-surface-alt) px-[var(--spacing-md)] text-[length:var(--text-sm)] ${
        active ? "font-semibold text-(--color-ink)" : "text-(--color-ink2)"
      }`}
    >
      {label}
    </button>
  );
}

const FOLD_PREFIX = "fold:";

function readFold(scope: string): boolean {
  try {
    return localStorage.getItem(FOLD_PREFIX + scope) === "1";
  } catch {
    return false; // 저장소를 못 쓰면 접힌 채로
  }
}

function writeFold(scope: string, open: boolean) {
  try {
    localStorage.setItem(FOLD_PREFIX + scope, open ? "1" : "0");
  } catch {
    // 기억하지 못해도 이번 화면에서는 펼쳐진다
  }
}

/** 접기 상태 — 같은 scope 는 화면 어디서든 하나(전역 기억 · /qa spec Q6). 열린 블록들이 함께 따라 바뀐다. */
export function useFold(scope: string): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(readFold(scope));
    const onChange = (e: Event) => {
      const d = (e as CustomEvent<{ scope: string; open: boolean }>).detail;
      if (d?.scope === scope) setOpen(d.open);
    };
    window.addEventListener("liftgram:fold", onChange);
    return () => window.removeEventListener("liftgram:fold", onChange);
  }, [scope]);
  const set = (next: boolean) => {
    setOpen(next);
    writeFold(scope, next);
    window.dispatchEvent(new CustomEvent("liftgram:fold", { detail: { scope, open: next } }));
  };
  return [open, set];
}

/** 「더 보기 ▸」 토글 — 내용은 부르는 쪽이 open 일 때 그린다(자리를 자유롭게 두려고 토글만 따로). */
export function FoldToggle({
  open,
  onToggle,
  label,
  openLabel,
  testId,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  openLabel?: string;
  testId?: string;
}) {
  return (
    <MetaAction
      onPress={onToggle}
      testId={testId}
      ariaExpanded={open}
      trailingIcon={open ? "chevron-up" : "chevron-down"}
    >
      {open ? (openLabel ?? label) : label}
    </MetaAction>
  );
}

/** 금색 PR 조각 — 누르면 채우기(onPress), 옆 ⓘ 는 그 기록으로(onHistory). 상자 없이 글자만. */
export function PrText({
  label,
  ariaLabel,
  onPress,
  onHistory,
  historyLabel,
  testId,
  historyTestId,
}: {
  label: string;
  ariaLabel?: string;
  onPress: () => void;
  onHistory?: () => void;
  historyLabel?: string;
  testId?: string;
  historyTestId?: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-[2px]">
      <button
        type="button"
        data-testid={testId}
        aria-label={ariaLabel}
        onClick={onPress}
        className="inline-flex min-h-[32px] min-w-0 items-center font-semibold text-(--color-pr) text-[length:var(--text-sm)]"
      >
        <span className="min-w-0 truncate underline decoration-dotted decoration-[1px] underline-offset-[3px]">
          {label}
        </span>
      </button>
      {onHistory ? (
        <button
          type="button"
          data-testid={historyTestId}
          aria-label={historyLabel}
          onClick={onHistory}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center"
        >
          <Icon name="information-circle-outline" size={15} color="var(--color-ink3)" />
        </button>
      ) : null}
    </span>
  );
}
