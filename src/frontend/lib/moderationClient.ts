// @plm SRS-020  신고·모더레이션 클라이언트
import { ModerationService } from "@app/contracts";
import { createClient, type Client } from "@connectrpc/connect";
import { authedTransport } from "./session";

export function moderationClient(): Client<typeof ModerationService> {
  return createClient(ModerationService, authedTransport());
}
