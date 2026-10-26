// @plm SRS-052  signup — booktarae 형식으로 로그인·회원가입을 나눈 화면(같은 컴포넌트 · 시작 화면만 다르다)
import AuthClient from "../components/profile/AuthClient";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { LAST_LOGIN_COOKIE, parseLastLogin } from "@/lib/last-login";
import { previewProviders } from "@/lib/oauthPreview";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  // 「최근」 배지 — HttpOnly 라 화면 JS 는 못 읽는다. 서버에서 읽어 넘긴다.
  const lastLogin = parseLastLogin((await cookies()).get(LAST_LOGIN_COOKIE)?.value);
  return (
    <AuthClient
      initialMode="signup"
      siteKey={env.TURNSTILE_SITE_KEY}
      oauthError={err ?? ""}
      preview={previewProviders()}
      lastLogin={lastLogin}
    />
  );
}
