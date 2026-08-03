// @plm SRS-019  스토리 클라이언트 — 인증은 세션 것을 그대로 쓴다
import { StoryService } from "@app/contracts";
import { createClient, type Client } from "@connectrpc/connect";
import { authedTransport } from "./session";

export function storyClient(): Client<typeof StoryService> {
  return createClient(StoryService, authedTransport());
}
