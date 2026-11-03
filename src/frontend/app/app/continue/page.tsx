// SPEC-018 §7  웹 → 앱 로그인 넘기기 확인 화면 — 앱이 크롬 탭(Custom Tabs)으로 연다: /app/continue?ac=<S256(v)>
// 크롬 탭은 크롬의 쿠키를 쓴다(크롬 PWA 와 같은 세션). 로그인돼 있으면 확인 → 「계속」(사용자 클릭만) → 서버가 맡긴 교환 코드를
// liftgram://auth 로 돌려준다. 로그인이 안 돼 있으면 이 자리에서 로그인한 뒤 같은 화면으로 돌아온다.
// 헤더(next.config.ts): frame-ancestors 'none' · no-store · 리퍼러 없음.
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { LAST_LOGIN_COOKIE, parseLastLogin } from "@/lib/last-login";
import { previewProviders } from "@/lib/oauthPreview";
import ContinueClient from "./ContinueClient";

export const dynamic = "force-dynamic";

export default async function AppContinuePage({ searchParams }: { searchParams: Promise<{ ac?: string }> }) {
  const { ac } = await searchParams;
  const lastLogin = parseLastLogin((await cookies()).get(LAST_LOGIN_COOKIE)?.value);
  return (
    <ContinueClient
      ac={ac ?? ""}
      siteKey={env.TURNSTILE_SITE_KEY}
      preview={previewProviders()}
      lastLogin={lastLogin}
    />
  );
}
