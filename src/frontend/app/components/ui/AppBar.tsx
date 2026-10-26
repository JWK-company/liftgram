"use client";
// @plm SRS-054  앱바 2형 — 탭 첫 화면(로고·큰 제목 + 아이콘 ≤2) / 하위 화면(← · 가운데 제목 · ⋯)
//
// 북타래와 같은 규칙이다. 화면마다 머리 모양이 달라 "어디가 꼭대기인지" 흐려지던 것을 두 가지로만 묶는다.
//   · AppBar     탭의 첫 화면. 운동 홈만 로고를 쓰고 나머지는 큰 제목.
//   · SubAppBar  탭에서 들어간 화면. 왼쪽 ←, 가운데 제목, 오른쪽 한 자리(⋯ 메뉴 등).
// 제목 표식(screen-title)은 두 형 모두 같은 이름이다 — 기존 테스트가 그대로 읽는다.
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { Logo } from "./Logo";

const BAR =
  "sticky top-0 z-30 flex min-h-14 items-center border-(--color-line) border-b bg-(--color-surface)/95 backdrop-blur";

export function AppBar({
  title,
  logo,
  actions,
  testId,
}: {
  title?: string;
  /** 운동 홈 — 제목 대신 로고. */
  logo?: boolean;
  /** 오른쪽 아이콘 — 최대 2개(AppBarAction). */
  actions?: ReactNode;
  testId?: string;
}) {
  return (
    <header data-testid={testId} className={`${BAR} gap-[var(--spacing-sm)] px-[var(--spacing-lg)]`}>
      {logo ? (
        <span
          className="flex items-center"
          data-testid="screen-title"
          role="img"
          aria-label={title ?? "Liftgram"}
        >
          <Logo height={26} />
        </span>
      ) : (
        <h1
          data-testid="screen-title"
          className="truncate font-bold text-[length:var(--text-xl)] tracking-tight"
        >
          {title}
        </h1>
      )}
      {actions ? <div className="ml-auto flex items-center gap-[2px]">{actions}</div> : null}
    </header>
  );
}

/** 하위 화면 머리. back 이 없으면 브라우저 뒤로(없으면 fallback 주소). */
export function SubAppBar({
  title,
  right,
  onBack,
  fallbackHref = "/",
  backTestId = "btn-back",
}: {
  title: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
  fallbackHref?: string;
  backTestId?: string;
}) {
  const router = useRouter();
  const back = () => {
    if (onBack) return onBack();
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(fallbackHref);
  };
  return (
    <header className={`${BAR} grid grid-cols-[48px_1fr_48px] px-[var(--spacing-xs)]`}>
      <button
        type="button"
        aria-label="뒤로"
        data-testid={backTestId}
        onClick={back}
        className="flex h-11 w-11 items-center justify-center rounded-full active:opacity-60"
      >
        <Icon name="chevron-back" size={24} color="var(--color-ink)" />
      </button>
      <h1
        data-testid="screen-title"
        className="truncate text-center font-semibold text-[length:var(--text-md)]"
      >
        {title}
      </h1>
      <div className="flex items-center justify-end">{right}</div>
    </header>
  );
}

/** 앱바 오른쪽 아이콘 하나(44px 누름 칸). 링크면 href, 아니면 onPress. */
export function AppBarAction({
  icon,
  label,
  href,
  onPress,
  testId,
  badge,
}: {
  icon: Parameters<typeof Icon>[0]["name"];
  label: string;
  href?: string;
  onPress?: () => void;
  testId?: string;
  /** 안 읽음 점. */
  badge?: boolean;
}) {
  const inner = (
    <>
      <Icon name={icon} size={23} color="var(--color-ink)" />
      {badge ? (
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-(--color-brand) ring-2 ring-(--color-surface)" />
      ) : null}
    </>
  );
  const cls = "relative flex h-11 w-11 items-center justify-center rounded-full active:opacity-60";
  return href ? (
    <a href={href} aria-label={label} data-testid={testId} className={cls}>
      {inner}
    </a>
  ) : (
    <button type="button" aria-label={label} data-testid={testId} onClick={onPress} className={cls}>
      {inner}
    </button>
  );
}
