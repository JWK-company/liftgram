// 이 프로세스가 살아 있는가. 실패하면 컨테이너를 재시작하므로 백엔드 상태와 묶지 않는다.
export const dynamic = "force-dynamic";
export function GET(): Response {
  return new Response("ok", { headers: { "cache-control": "no-store" } });
}
