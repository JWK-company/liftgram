// @plm SRS-048  코칭 클라이언트
//
// 회원 기록을 다루는 유일한 통로다. 화면은 여기를 거치지 않고 남의 데이터에 닿을 방법이 없다 —
// 그리고 서버가 관계·범위를 다시 확인하므로, 화면의 실수가 곧 노출로 이어지지 않는다.
import { CoachingService } from "@app/contracts";
import { createClient, type Client } from "@connectrpc/connect";
import { authedTransport } from "./session";

export function coachingClient(): Client<typeof CoachingService> {
  return createClient(CoachingService, authedTransport());
}
