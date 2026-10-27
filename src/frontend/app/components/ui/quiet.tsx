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
//   MetaAction 누를 수 있는 메타 조각 — 꺾쇠(›·▾) 하나로 누를 수 있음을 알린다(점선 밑줄은 새 소음이라 뺐다 · /qa code L-1)
//              최소 높이 32px(장갑 낀 손가락 · /qa spec Q7)
//   QuietChip  무테·무채 작은 칩 — 선택 상태만 브랜드 테두리(글자는 ink2 — ink3 는 surface-alt 위 대비 미달 · Q1)
//   Fold       「더 보기 ▾」 한 줄 접기 — 펼침은 **이번 운동 동안만** 기억(scope 에 운동 id · /qa code M-1)
//              첫 그림부터 저장된 값(useSyncExternalStore · M-2) · 다른 탭의 변경도 따른다(storage 이벤트 · M-3)
//   PrText     금색 PR 조각 — 금색 한 가지가 「누를 수 있음」 신호. 누르면 콜백, 옆 ⓘ 는 기록으로(길게 누르기 안 씀 · Q7)
// ─────────────────────────────────────────────────────────────────────────────
import { Children, Fragment, type ReactNode, isValidElement, useSyncExternalStore } from "react";
import { Icon, type IconName } from "./Icon";

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

/** 누를 수 있는 메타 조각 — 회색 글자 + 꺾쇠. 상자·밑줄을 두지 않는다(꺾쇠를 따로 주지 않으면 ›). */
export function MetaAction({
  children,
  onPress,
  testId,
  ariaLabel,
  tone = "muted",
  disabled = false,
  trailingIcon,
  ariaExpanded,
  ariaControls,
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
  ariaControls?: string;
}) {
  const color = tone === "pr" ? "text-(--color-pr)" : "text-(--color-ink2)";
  // [원본] 꺾쇠는 주는 쪽만 — 밑줄이 누를 수 있다는 신호였다
  // [개선] 밑줄을 빼는 대신 꺾쇠는 늘 하나(금색 PR 조각은 PrText 가 따로 그린다) @plm SRS-069
  const icon = trailingIcon ?? "chevron-forward";
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      disabled={disabled}
      onClick={onPress}
      className={`inline-flex min-h-[32px] min-w-0 items-center gap-[2px] ${color} disabled:opacity-60`}
    >
      {/* [원본] <span className="min-w-0 truncate underline decoration-dotted decoration-[1px] underline-offset-[3px]"> */}
      <span className="min-w-0 truncate">{children}</span>
      <Icon name={icon} size={12} color={tone === "pr" ? "var(--color-pr)" : "var(--color-ink3)"} />
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
const FOLD_EVENT = "liftgram:fold";

function readFold(scope: string): boolean {
  try {
    return localStorage.getItem(FOLD_PREFIX + scope) === "1";
  } catch {
    return false; // 저장소를 못 쓰면 접힌 채로
  }
}

/**
 * 펼침을 적는다. scope 가 「무리:id」 꼴이면(예: block:<운동 id>) 같은 무리의 **다른 id** 기록은 지운다 —
 * 지난 운동의 펼침이 새 운동으로 넘어오지 않고, 저장소에 쌓이지도 않게(/qa code M-1).
 */
function writeFold(scope: string, open: boolean) {
  try {
    const cut = scope.indexOf(":");
    if (cut > 0) {
      const group = FOLD_PREFIX + scope.slice(0, cut + 1);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(group) && k !== FOLD_PREFIX + scope) localStorage.removeItem(k);
      }
    }
    localStorage.setItem(FOLD_PREFIX + scope, open ? "1" : "0");
  } catch {
    // 기억하지 못해도 이번 화면에서는 펼쳐진다
  }
}

// [원본] useState(false) + useEffect 로 저장값을 읽었다 — 첫 그림은 늘 접힘이라 펼쳐 둔 블록이 마운트마다 한 번 튀었다(M-2),
//        다른 탭의 변경은 몰랐다(M-3). 원복 시 이 주석의 옛 useFold 를 되살린다(커밋 432f53f).
function subscribeFold(scope: string, onChange: () => void): () => void {
  const onLocal = (e: Event) => {
    if ((e as CustomEvent<{ scope: string }>).detail?.scope === scope) onChange();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === FOLD_PREFIX + scope) onChange();
  };
  window.addEventListener(FOLD_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(FOLD_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * 접기 상태 — 같은 scope 는 화면 어디서든 하나(/qa spec Q6). 열린 블록들이 함께 따라 바뀐다.
 * 첫 그림부터 저장값(서버 그림은 접힘 — 하이드레이션 안전) · 다른 탭에서 바꿔도 따른다.
 */
export function useFold(scope: string): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(
    (cb) => subscribeFold(scope, cb),
    () => readFold(scope),
    () => false,
  );
  const set = (next: boolean) => {
    writeFold(scope, next);
    window.dispatchEvent(new CustomEvent(FOLD_EVENT, { detail: { scope, open: next } }));
  };
  return [open, set];
}

/**
 * 「더 보기 ▾」 토글 — 내용은 부르는 쪽이 open 일 때 그린다(자리를 자유롭게 두려고 토글만 따로).
 * 라벨은 고정, 상태는 aria-expanded 와 꺾쇠 방향만 말한다(APG disclosure · /qa code L-5). `openLabel` 은 더 쓰지 않는다.
 */
export function FoldToggle({
  open,
  onToggle,
  label,
  testId,
  controls,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  /** @deprecated 라벨을 바꾸지 않는다(L-5) — 옛 호출 호환용 */
  openLabel?: string;
  testId?: string;
  /** 펼친 내용의 id — 열렸을 때만 aria-controls 로 잇는다 */
  controls?: string;
}) {
  return (
    <MetaAction
      onPress={onToggle}
      testId={testId}
      ariaExpanded={open}
      ariaControls={open ? controls : undefined}
      trailingIcon={open ? "chevron-up" : "chevron-down"}
    >
      {/* [원본] {open ? (openLabel ?? label) : label} */}
      {label}
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
        {/* [원본] 점선 밑줄 — 금색 한 가지로 「누를 수 있음」을 말한다(/qa code L-1) */}
        <span className="min-w-0 truncate">{label}</span>
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

/**
 * 조용한 부가 행동 — 아이콘 위·짧은 글자 아래, 상자 없이(요약의 「루틴 저장·다시 시작·공유」 한 줄 · D5) @plm SRS-070
 * 주 행동(채운 빨강 버튼)은 화면에 하나만 두고, 나머지는 이 모양으로 한 줄에 나란히 둔다. 누르는 칸 44px 이상.
 */
export function QuietAction({
  icon,
  label,
  onPress,
  testId,
  ariaLabel,
  disabled = false,
  busy = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  testId?: string;
  ariaLabel?: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      onClick={onPress}
      className="flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-[4px] rounded-[var(--radius-sm)] px-[var(--spacing-xs)] text-(--color-ink2) text-[length:var(--text-sm)] active:bg-(--color-surface-alt) disabled:opacity-60"
    >
      <Icon name={icon} size={20} color="var(--color-ink2)" />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
