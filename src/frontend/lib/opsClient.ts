// @plm SRS-088  운영 상태 클라이언트 — 기기 건강 보고 · admin 운영 화면
import { OpsService } from "@app/contracts";
import { createClient, type Client } from "@connectrpc/connect";
import { authedTransport } from "./session";

export function opsClient(): Client<typeof OpsService> {
  return createClient(OpsService, authedTransport());
}
