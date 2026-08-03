// @plm SRS-017 @plm SRS-020  DM·알림 클라이언트 — 인증은 세션 것을 그대로 쓴다
import { DmService, NotificationService } from "@app/contracts";
import { createClient, type Client } from "@connectrpc/connect";
import { authedTransport } from "./session";

export function dmClient(): Client<typeof DmService> {
  return createClient(DmService, authedTransport());
}

export function notificationClient(): Client<typeof NotificationService> {
  return createClient(NotificationService, authedTransport());
}
