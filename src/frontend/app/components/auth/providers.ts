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

/** 제공자 색 — 각 사 가이드의 기본 버튼색(로고 이미지는 싣지 않는다). */
export const PROVIDER_STYLE: Record<Provider, { bg: string; fg: string; border?: string }> = {
  google: { bg: "#ffffff", fg: "#1f1f1f", border: "#dadce0" },
  kakao: { bg: "#FEE500", fg: "#191919" },
  naver: { bg: "#03C75A", fg: "#ffffff" },
};

/** 소셜 로그인 시작 주소. 브라우저 전면 이동이라 RPC가 아니라 링크다(backend internal/oauth). */
export function startUrl(p: string, opts: { link?: string; returnTo?: string } = {}): string {
  const q = new URLSearchParams();
  if (opts.link) q.set("link", opts.link);
  if (opts.returnTo) q.set("return_to", opts.returnTo);
  const qs = q.toString();
  return `/api/auth/oauth/${encodeURIComponent(p)}/start${qs ? `?${qs}` : ""}`;
}
