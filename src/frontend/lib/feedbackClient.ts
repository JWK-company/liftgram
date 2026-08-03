// @plm SRS-006  개발 피드백 클라이언트 — 아이디어보드로 가는 길은 우리 서버뿐이다
//
// PLM 토큰은 서버에만 있다. 화면은 이 클라이언트로 우리 서버에만 말하고,
// 서버가 대신 보드에 말한다(번들에 들어간 토큰은 회수할 수 없다).
import { FeedbackService } from "@app/contracts";
import { createClient, type Client } from "@connectrpc/connect";
import { authedTransport } from "./session";

export function feedbackClient(): Client<typeof FeedbackService> {
  return createClient(FeedbackService, authedTransport());
}
