// @plm SRS-006  계정 — 로그인·가입·로그아웃
//
// 이 화면은 **선택**이다. 기록은 계정 없이도 기기에 남고(ADR-002), 로그인은 서버 백업과
// 소셜 기능을 여는 것뿐이다. 그래서 탭이 아니라 프로필에서 들어가는 화면으로 둔다.
import AuthClient from "../components/profile/AuthClient";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { LAST_LOGIN_COOKIE, parseLastLogin } from "@/lib/last-login";
import { previewProviders } from "@/lib/oauthPreview";

export const dynamic = "force-dynamic";

// 사람 확인 사이트 키는 **실행 시점** 설정이다(이미지에 굽지 않는다) — 서버 컴포넌트가 읽어 넘긴다.
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  // 「최근」 배지 — HttpOnly 라 화면 JS 는 못 읽는다. 서버에서 읽어 넘긴다.
  const lastLogin = parseLastLogin((await cookies()).get(LAST_LOGIN_COOKIE)?.value);
  return (
    <AuthClient
      siteKey={env.TURNSTILE_SITE_KEY}
      oauthError={err ?? ""}
      preview={previewProviders()}
      lastLogin={lastLogin}
    />
  );
}
