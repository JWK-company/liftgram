// 검증 스크립트가 공유하는 RPC 헬퍼 (ADR-011)
//
// Connect는 평범한 HTTP POST + JSON이다 — 그래서 검증 스크립트에 클라이언트 라이브러리가 필요 없다.
// 경로 convention: /api/<패키지>.<서비스>/<메서드>  (frontend의 프록시가 그대로 backend로 넘긴다)
//
// 이 얇은 헬퍼를 공유하는 이유: 경로 조립 규칙이 스크립트마다 흩어지면
// 계약이 바뀔 때 고칠 곳을 빠뜨린다.
export const SERVICE = "exercise.v1.ExerciseService";
export const META_SERVICE = "meta.v1.MetaService";

export function rpcUrl(base, method, service = SERVICE) {
  return `${base.replace(/\/$/, "")}/api/${service}/${method}`;
}

/** 한 번 부른다. 응답 본문(JSON)과 헤더를 함께 돌려준다 — 헤더도 검증 대상이기 때문이다. */
export async function rpc(base, method, body = {}, init = {}) {
  const res = await fetch(rpcUrl(base, method, init.service ?? SERVICE), {
    method: "POST",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    body: JSON.stringify(body),
    ...init,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, headers: res.headers, json, text };
}

/**
 * 검증용 커스텀 종목의 이름 — 실행마다 달라야 한다.
 *
 * 이름에 unique 제약이 있어서, 고정 이름을 쓰면 **두 번째 실행부터 항상 실패한다**.
 * 검사가 끝나면 archive로 치우지만(그래야 카탈로그가 실행마다 불어나지 않는다),
 * 중간에 죽어 남더라도 다음 실행을 막지 않도록 이름을 매번 새로 짓는다.
 */
export function probeName(prefix = "smoke") {
  return `zz-${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** 검증이 만든 종목을 치운다. 실패해도 검사 결과를 뒤집지 않는다(정리는 부수적이다). */
export async function cleanup(base, id) {
  if (!id) return;
  try {
    await rpc(base, "ArchiveCustomExercise", { id });
  } catch {}
}
