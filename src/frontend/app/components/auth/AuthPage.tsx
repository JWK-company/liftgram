// 인증 흐름 화면(비밀번호 찾기·재설정·이메일 확인·소셜 완료)의 공통 껍데기 — 계정 화면과 같은 머리.
import type { ReactNode } from "react";
import { Logo } from "../ui/Logo";
import { AppText } from "../ui/primitives";

// 로그인 화면(시안 10)과 같은 배치: 탭바 없는 전체 화면 · 위에 로고 · 큰 제목 · 한 열.
export function AuthPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-[var(--spacing-lg)] pt-[var(--spacing-xxl)] pb-[var(--spacing-xl)]">
      <a href="/" aria-label="Liftgram 홈" className="self-start">
        <Logo height={26} className="text-(--color-ink)" />
      </a>
      <AppText variant="title" className="mt-[var(--spacing-xl)] mb-[var(--spacing-lg)] block">
        {title}
      </AppText>
      <div>{children}</div>
      <AuthFooter />
    </div>
  );
}

/** 인증 화면 바닥 한 줄 — 약관 · 개인정보처리방침 · 회사(사업자 정보는 약관 페이지와 프로필 맨 아래에 있다). */
export function AuthFooter() {
  return (
    <p className="mt-auto flex flex-wrap justify-center gap-x-[var(--spacing-md)] pt-[var(--spacing-xxl)] text-(--color-ink3) text-xs">
      <a href="/terms" className="underline">
        이용약관
      </a>
      <a href="/privacy" className="underline">
        개인정보처리방침
      </a>
      <span>타래(TARAE)</span>
    </p>
  );
}
