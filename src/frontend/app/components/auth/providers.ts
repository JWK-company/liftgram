// 소셜 제공자 이름·표시 — 화면 여러 곳이 같은 이름을 쓰게 한 자리에 둔다.
import { t, type TransKey } from "@/lib/i18n";

export type Provider = "google" | "kakao" | "naver";

const LABEL: Record<Provider, TransKey> = {
  google: "auth.providerGoogle",
  kakao: "auth.providerKakao",
  naver: "auth.providerNaver",
};

export function providerLabel(p: string): string {
  return p in LABEL ? t(LABEL[p as Provider]) : p;
}

/**
 * 제공자 색 — 각 사의 **브랜드 가이드가 정한 값**이라 우리 토큰을 쓰지 않는다(다크에서도 그대로여야 한다 —
 * 구글 버튼을 어둡게 칠하면 가이드 위반이다). booktarae SocialButtons 와 같은 값. 디자인 토큰 규칙의 유일한 예외다.
 */
export const PROVIDER_STYLE: Record<Provider, { bg: string; fg: string; border?: string }> = {
  google: { bg: "#FFFFFF", fg: "#141619", border: "var(--color-line-strong)" },
  kakao: { bg: "#FEE500", fg: "#191600" },
  naver: { bg: "#03C75A", fg: "#FFFFFF" },
};

/** 소셜 로그인 시작 주소. 브라우저 전면 이동이라 RPC가 아니라 링크다(backend internal/oauth). */
export function startUrl(p: string, opts: { link?: string; returnTo?: string } = {}): string {
  const q = new URLSearchParams();
  if (opts.link) q.set("link", opts.link);
  if (opts.returnTo) q.set("return_to", opts.returnTo);
  const qs = q.toString();
  return `/api/auth/oauth/${encodeURIComponent(p)}/start${qs ? `?${qs}` : ""}`;
}
