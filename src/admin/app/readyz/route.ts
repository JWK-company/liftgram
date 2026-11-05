// 백엔드까지 닿는가. 오류 내용은 밖으로 내보내지 않고 상태만 답한다.
import { backendUrl } from "@/lib/backend";

export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  const res = await fetch(backendUrl("/api/readyz"), { signal: AbortSignal.timeout(3_000) }).catch(
    () => null,
  );
  return new Response(res?.ok ? "ready" : "not ready", {
    status: res?.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
