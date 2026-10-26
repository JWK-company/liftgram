// @plm SRS-052  이메일 확인 — 가입 확인 메일의 링크(/verify-email?token=…)가 여기로 온다
import VerifyClient from "./VerifyClient";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <VerifyClient token={token ?? ""} />;
}
