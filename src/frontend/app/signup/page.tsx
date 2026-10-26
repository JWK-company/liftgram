// @plm SRS-052  signup — booktarae 형식으로 로그인·회원가입을 나눈 화면(같은 컴포넌트 · 시작 화면만 다르다)
import AuthClient from "../components/profile/AuthClient";
import { env } from "@/lib/env";
import { previewProviders } from "@/lib/oauthPreview";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  return (
    <AuthClient
      initialMode="signup"
      siteKey={env.TURNSTILE_SITE_KEY}
      oauthError={err ?? ""}
      preview={previewProviders()}
    />
  );
}
