// @plm SRS-049  피드백 클라이언트 — 운영 피드백과 사용자 의견 모두 우리 서버에 쌓인다(SPEC-032)
import { FeedbackService } from "@app/contracts";
import { createClient, type Client } from "@connectrpc/connect";
import { authedTransport } from "./session";

export function feedbackClient(): Client<typeof FeedbackService> {
  return createClient(FeedbackService, authedTransport());
}
