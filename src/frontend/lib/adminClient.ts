// 운영자 통계 클라이언트(SPEC-032) — 관리자 화면에서만 부른다.
import { AdminService } from "@app/contracts";
import { createClient, type Client } from "@connectrpc/connect";
import { authedTransport } from "./session";

export function adminClient(): Client<typeof AdminService> {
  return createClient(AdminService, authedTransport());
}
