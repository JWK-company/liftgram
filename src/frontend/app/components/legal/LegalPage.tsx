// 약관·개인정보처리방침의 공통 껍데기 — 읽기 쉬운 폭과 제목 계층만 준다.
import type { ReactNode } from "react";

export function LegalPage({
  title,
  effective,
  children,
}: {
  title: string;
  effective: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto flex w-full max-w-[640px] flex-col gap-[var(--spacing-md)] p-[var(--spacing-lg)] text-sm leading-relaxed text-(--color-ink2) [&_h2]:mt-[var(--spacing-md)] [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-(--color-ink) [&_li]:ml-[var(--spacing-lg)] [&_li]:list-disc">
      <h1 className="text-xl font-bold text-(--color-ink)">{title}</h1>
      <p className="text-xs text-(--color-ink3)">시행일 {effective}</p>
      {children}
    </article>
  );
}

/** 문의 창구 — 개인정보 열람·삭제 요청도 여기로 받는다. */
export const CONTACT_EMAIL = "admin@tarae.org";
