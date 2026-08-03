// @plm SRS-001  backend 접근 — 서버에서만 쓰는 내부 주소와 Connect 클라이언트
//
// ─────────────────────────────────────────────────────────────────────────────
// 브라우저는 이 파일을 쓰지 않는다. 클라이언트 코드는 상대 경로(`/api`)로 frontend를 부르고,
// frontend(프록시)가 backend로 넘긴다 — 그래야 backend를 외부에 노출하지 않는다(ADR-010).
//
// 서버 컴포넌트(RSC)는 **프록시를 건너뛰고** backend를 직접 부른다. 왕복이 한 번 짧고,
// 어차피 같은 내부 네트워크다.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient, type Client } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-node";
import { ExerciseService, MetaService } from "@app/contracts";
import { env } from "@/lib/env";

/** 내부 backend의 절대 URL. 경로 접두사(/api)까지 포함한다 — 서버·브라우저가 같은 경로를 쓴다. */
export function apiBaseUrl(): string {
  return `${env.API_URL.replace(/\/$/, "")}/api`;
}

/**
 * RSC에서 쓰는 서버 전용 클라이언트.
 *
 * 요청마다 만들어도 되지만(전송 계층이 커넥션을 재사용한다), 모듈 최상단에서 만들면
 * **빌드 시점에 설정을 읽게 되므로** 반드시 함수 안에서 만든다 —
 * 설정 없이도 빌드되어야 같은 이미지를 여러 환경에 올릴 수 있다.
 */
export function exerciseClient(): Client<typeof ExerciseService> {
  return createClient(ExerciseService, transport());
}

export function metaClient(): Client<typeof MetaService> {
  return createClient(MetaService, transport());
}

function transport() {
  return createConnectTransport({ baseUrl: apiBaseUrl(), httpVersion: "1.1" });
}
