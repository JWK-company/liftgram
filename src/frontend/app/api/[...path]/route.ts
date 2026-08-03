// @plm SRS-008  API 프록시 — 브라우저는 web만 본다 (ADR-010)
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일의 책임: **브라우저의 `/api/*` 요청을 내부 api(NestJS)로 그대로 넘기는 것.**
//
// 왜 프록시를 두는가:
//   · 브라우저가 보는 출처가 하나뿐이라 **CORS 설정이 필요 없다**
//   · 인증(P2)이 붙을 때 쿠키·세션 경계가 여기 한 곳에 남는다
//   · api를 외부에 노출하지 않아도 된다(내부 네트워크 전용)
//
// 여기서 하지 않는 것: 도메인 판단·응답 변형. **경로도 고쳐 쓰지 않는다** —
// api가 같은 경로 체계를 쓰므로 그대로 넘기면 된다. 프록시가 경로를 알기 시작하면
// 규칙이 두 곳에 생긴다.
//
// SSE(스트림)도 이 라우트가 처리한다 — fetch의 body를 그대로 흘려보내면 프레임이 유지된다.
// WebSocket만 예외다(업그레이드는 Route Handler가 받지 못한다) — server.mjs가 터널링한다.
// ─────────────────────────────────────────────────────────────────────────────
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** 프록시가 옮기지 않아야 할 홉 단위 헤더 — 그대로 넘기면 연결이 깨진다. */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "host",
  "content-length",
]);

function forwardHeaders(src: Headers, requestId: string): Headers {
  const out = new Headers();
  src.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase())) out.set(k, v);
  });
  // 요청 식별자를 이어 붙인다 — frontend와 backend 로그에서 같은 id로 한 요청을 따라갈 수 있다.
  out.set("x-request-id", requestId);

  // Next가 감싼 fetch는 캐시 의도를 알리려고 요청에 `cache-control: no-cache`를 덧붙인다.
  // 그러면 backend의 신선도 판정이 항상 "낡음"이 되어 **조건부 조회가 늘 200**이 된다
  // (ETag를 줘도 304가 오지 않는다 — 실측으로 잡은 함정).
  // 클라이언트가 보낸 값이 있으면 그대로 존중하고, 없으면 우리가 먼저 무해한 값을 넣어
  // 프레임워크가 끼어들 자리를 없앤다(no-transform은 신선도 판정에 영향이 없다).
  if (!src.has("cache-control")) out.set("cache-control", "no-transform");
  return out;
}

async function proxy(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  // 브라우저가 부른 경로를 **그대로** 넘긴다. `/api/exercise.v1.ExerciseService/…` 는
  // api에서도 같은 경로다(main.go가 /api 접두사로 마운트한다) — 프록시가 경로를 알 필요가 없다.
  const target = `${env.API_URL.replace(/\/$/, "")}${url.pathname}${url.search}`;

  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers: forwardHeaders(req.headers, requestId),
    // 본문이 있는 요청은 스트림으로 넘긴다(duplex는 Node fetch가 요구한다).
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
    duplex: "half",
    redirect: "manual",
    // 스트림 응답(SSE)이 끊기지 않게 클라이언트의 중단 신호를 그대로 전달한다.
    signal: req.signal,
  };

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    // api가 죽었거나 네트워크가 끊긴 경우 — 오류 형식은 api와 같은 problem+json으로 통일한다.
    return Response.json(
      {
        type: "about:blank#upstream",
        title: "upstream_unavailable",
        status: 502,
        detail: "API에 연결할 수 없습니다",
      },
      { status: 502, headers: { "content-type": "application/problem+json", "x-request-id": requestId } },
    );
  }

  const headers = new Headers();
  upstream.headers.forEach((v, k) => {
    const key = k.toLowerCase();
    if (HOP_BY_HOP.has(key)) return;
    // **압축 헤더는 옮기지 않는다.** fetch가 이미 본문을 풀어서 주기 때문에,
    // content-encoding을 그대로 붙이면 브라우저가 평문을 다시 gunzip하려다 터진다
    // ("failed to decompress 'gzip': incorrect header check" — 브라우저 e2e가 잡아낸 결함).
    // curl은 --compressed 없이는 풀지 않아서 smoke test에서는 드러나지 않았다.
    if (key === "content-encoding" || key === "content-length") return;
    headers.set(k, v);
  });
  headers.set("x-request-id", requestId);

  // body를 그대로 흘려보낸다 — SSE는 여기서 버퍼링되면 실시간이 아니게 된다.
  return new Response(upstream.body, { status: upstream.status, headers });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
