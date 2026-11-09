// 약관·개인정보처리방침의 공통 껍데기 — 읽기 쉬운 폭과 제목 계층만 준다.
import type { ReactNode } from "react";
import { BusinessInfo } from "../BusinessInfo";
import { BackLink } from "../ui/BackLink";
import { ScreenHeader } from "../ui/ScreenHeader";

export function LegalPage({
  title,
  effective,
  children,
}: {
  title: string;
  effective: string;
  children: ReactNode;
}) {
  // 하위 화면 앱바(SRS-054) + 본문 + 맨 아래 사업자 정보(로그인 화면에서 옮겨 온 자리 · 시안 10).
  return (
    <>
      <ScreenHeader
        title={title}
        // [원본] <a href="/profile" …> — 로그인·가입 화면에서 열어도 프로필로 갔다(화면 지도 2026-11-09)
        back={<BackLink fallbackHref="/profile" testId="legal-back" />}
      />
      <article className="mx-auto flex w-full max-w-[640px] flex-col gap-[var(--spacing-md)] p-[var(--spacing-lg)] text-sm leading-relaxed text-(--color-ink2) [&_h2]:mt-[var(--spacing-md)] [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-(--color-ink) [&_li]:ml-[var(--spacing-lg)] [&_li]:list-disc">
        <h1 className="text-xl font-bold text-(--color-ink)">{title}</h1>
        <p className="text-xs text-(--color-ink3)">시행일 {effective}</p>
        {children}
        <BusinessInfo className="mt-[var(--spacing-xl)] border-(--color-line) border-t pt-[var(--spacing-lg)]" />
      </article>
    </>
  );
}

/** 문의 창구 — 개인정보 열람·삭제 요청도 여기로 받는다. */
export const CONTACT_EMAIL = "admin@tarae.org";
