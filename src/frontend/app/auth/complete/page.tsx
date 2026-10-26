// @plm SRS-052  소셜 로그인 착지 — 콜백이 붙여 보낸 일회용 코드(60초·1회)를 세션으로 바꾼다
import CompleteClient from "./CompleteClient";

export const dynamic = "force-dynamic";

export default async function CompletePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; linked?: string; via?: string; return_to?: string }>;
}) {
  const sp = await searchParams;
  return (
    <CompleteClient
      code={sp.code ?? ""}
      linked={sp.linked ?? ""}
      via={sp.via ?? ""}
      returnTo={sp.return_to ?? ""}
    />
  );
}
