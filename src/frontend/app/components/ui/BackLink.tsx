"use client";
// 하위 화면 앱바의 ← — 앱 안에서 들어왔으면 들어온 곳으로, 아니면(공유 링크·새 탭) fallback 으로 간다.
// href 를 그대로 두어 스크립트가 늦어도 fallback 으로는 간다. 되돌아갈 때는 기본 이동을 막아 셸의 링크 가로채기도 건너뛴다.
import { canGoBackInApp } from "@/lib/nav";
import { Icon } from "./Icon";

export function BackLink({
  fallbackHref,
  label = "뒤로",
  testId,
}: {
  fallbackHref: string;
  label?: string;
  testId?: string;
}) {
  return (
    <a
      href={fallbackHref}
      aria-label={label}
      data-testid={testId}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (!canGoBackInApp()) return;
        e.preventDefault();
        window.history.back();
      }}
    >
      <Icon name="chevron-back" size={24} color="var(--color-ink)" />
    </a>
  );
}
