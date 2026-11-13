// 그룹 챌린지 초대 링크(SPEC-064 · SRS-118) — /challenges/join/<token>.
// 비로그인이면 요약(인원 수만)과 이 자리 로그인·가입 → 같은 화면으로 돌아와 참가.
// 헤더: 토큰이 리퍼러로 새지 않게 no-referrer(next.config.ts).
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { LAST_LOGIN_COOKIE, parseLastLogin } from "@/lib/last-login";
import { previewProviders } from "@/lib/oauthPreview";
import JoinClient from "../../../components/challenge/JoinClient";

export const metadata = { title: "그룹 챌린지 초대" };
export const dynamic = "force-dynamic";

export default async function ChallengeJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lastLogin = parseLastLogin((await cookies()).get(LAST_LOGIN_COOKIE)?.value);
  return (
    <JoinClient
      token={safeDecode(token)}
      siteKey={env.TURNSTILE_SITE_KEY}
      preview={previewProviders()}
      lastLogin={lastLogin}
    />
  );
}

/** 깨진 퍼센트 인코딩(%E0 등)이면 원문 그대로 — URIError 로 500 이 나지 않게(REV-161 L-13) */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
