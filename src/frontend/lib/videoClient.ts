// 영상 정보 클라이언트(SPEC-054) — 유튜브 링크의 설명란·길이·임베드 가능 여부를 서버에 묻는다.
// 서버만 Data API 키를 가진다. 로그인한 사람만 부를 수 있다(할당량 보호). 원문(붙여 넣은 글)은 이 요청에 싣지 않는다 — id 만.
import { VideoService } from "@app/contracts";
import { createClient, type Client } from "@connectrpc/connect";
import { authedTransport } from "./session";

export function videoClient(): Client<typeof VideoService> {
  return createClient(VideoService, authedTransport());
}
