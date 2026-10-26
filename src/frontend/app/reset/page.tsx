// @plm SRS-052  비밀번호 재설정 — 메일의 링크(/reset?token=…)가 여기로 온다
import ResetClient from "./ResetClient";

export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ResetClient token={token ?? ""} />;
}
