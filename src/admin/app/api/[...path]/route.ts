// 브라우저의 운영 RPC 를 백엔드로 넘긴다(SPEC-033). 허용 목록 밖은 존재하지 않는 것처럼 404 다.
// 헤더는 넘길 것만 고른다. 넘겨야 할 이유가 없는 쿠키(refresh, CF_Authorization)가 백엔드로 새지 않게 한다.
import { audit, backendUrl, clientIpHeaders } from "@/lib/backend";
import { isAllowedRpc } from "@/lib/rpcAllow";

export const dynamic = "force-dynamic";

const REQUEST_HEADERS = [
  "authorization",
  "content-type",
  "accept",
  "connect-protocol-version",
  "connect-timeout-ms",
];
// 응답도 넘길 것만 고른다. 백엔드 내부 정보와 쿠키가 브라우저로 나가지 않는다.
const RESPONSE_HEADERS = ["content-type", "connect-protocol-version", "retry-after"];
// 사진 열람과 처리는 누가·언제·어디서를 남긴다. 토큰은 백엔드가 검증하므로 여기서는 기록용으로 읽기만 한다.
const AUDITED = /\/(GetReviewMedia|Resolve|SetStatus)$/;

// 일반 HTTP 상태로 실패를 알리는 형식만 받는다. grpc 계열은 인증 실패에도 200 을 줘서 감사 줄이 성공처럼 찍힌다.
const CONTENT_TYPES = new Set(["application/json", "application/proto"]);

/** 백엔드가 받아들인 토큰의 신원. 형식과 길이를 제한하고, 실패 응답에는 쓰지 않는다(위조된 값일 수 있다). */
function tokenSubject(req: Request): string {
  try {
    const payload = (req.headers.get("authorization") ?? "").split(".")[1] ?? "";
    const sub = (JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: unknown }).sub;
    return typeof sub === "string" && /^[\w-]{1,64}$/.test(sub) ? sub : "";
  } catch {
    return "";
  }
}

async function proxy(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (!isAllowedRpc(pathname)) return new Response("not found", { status: 404 });
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!CONTENT_TYPES.has(contentType)) return new Response("unsupported media type", { status: 415 });

  const headers = new Headers(clientIpHeaders(req));
  for (const k of REQUEST_HEADERS) {
    const v = req.headers.get(k);
    if (v) headers.set(k, v);
  }
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers,
    body: req.body,
    duplex: "half",
    redirect: "manual",
    signal: req.signal,
  };
  const upstream = await fetch(backendUrl(pathname), init).catch(() => null);
  if (!upstream) {
    return Response.json({ code: "unavailable", message: "백엔드에 연결할 수 없습니다" }, { status: 502 });
  }
  if (AUDITED.test(pathname)) {
    audit(req, "admin_action", {
      rpc: pathname.slice(pathname.lastIndexOf("/") + 1),
      status: String(upstream.status),
      userId: upstream.ok ? tokenSubject(req) : "",
    });
  }
  const out = new Headers();
  for (const k of RESPONSE_HEADERS) {
    const v = upstream.headers.get(k);
    if (v) out.set(k, v);
  }
  out.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const POST = proxy;
