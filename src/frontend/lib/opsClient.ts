// @plm SRS-088  기기 건강 보고 클라이언트. 운영 화면은 운영 웹에 있다(SPEC-033)
import { OpsService } from "@app/contracts";
import { createClient, type Client } from "@connectrpc/connect";
import { authedTransport } from "./session";

export function opsClient(): Client<typeof OpsService> {
  return createClient(OpsService, authedTransport());
}
