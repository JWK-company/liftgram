// @plm SRS-039  착용장비 클라이언트 — 설정 조회와 클릭 집계
//
// 링크는 여기서 만들지 않는다. 서버가 준 설정을 도메인(`resolveGearLink`)에 넘길 뿐이다 —
// URL을 얻는 경로가 하나여야 고지 게이트가 실효를 갖는다(ADR-027 D6).
import { GearService } from "@app/contracts";
import { createClient, type Client } from "@connectrpc/connect";
import { authedTransport } from "./session";

export function gearClient(): Client<typeof GearService> {
  return createClient(GearService, authedTransport());
}
