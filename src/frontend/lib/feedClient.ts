// @plm SRS-007  피드 클라이언트 — 소셜 화면이 서버와 말하는 단 하나의 문
//
// 인증은 lib/session이 이미 해결해 둔 것을 그대로 쓴다(access는 메모리, 401이면 한 번 갱신).
// 여기서 따로 토큰을 만지지 않는다 — 두 곳에서 갱신하면 refresh 회전이 서로를 무효로 만든다.
//
// ── 화면이 이 파일에서만 하는 판단 ──────────────────────────────────────────
// "로그인이 필요하다"와 "네트워크가 죽었다"는 사용자에게 완전히 다른 말이다.
// 서버는 Connect 코드로 구분해 주므로, 그 구분을 화면이 쓸 말로 옮기는 것도 여기서 한다.
import { FeedService } from "@app/contracts";
import { Code, ConnectError, createClient, type Client } from "@connectrpc/connect";
import { authedTransport } from "./session";
import { t } from "./i18n";

export function feedClient(): Client<typeof FeedService> {
  return createClient(FeedService, authedTransport());
}

/** 로그인이 필요해서 실패한 것인가 — 화면이 "로그인 안내"와 "오류"를 가른다. */
export function isUnauthenticated(e: unknown): boolean {
  return e instanceof ConnectError && e.code === Code.Unauthenticated;
}

/**
 * 사용자에게 보일 한 줄.
 *
 * 서버 원문을 그대로 띄우지 않는다 — 오프라인은 "연결할 수 없다"이지 "internal error"가 아니다.
 * (app의 sync/apiError.ts가 하던 일과 같다.)
 */
export function feedErrorMessage(e: unknown): string {
  if (isUnauthenticated(e)) return t("feed.loginRequiredTitle");
  if (e instanceof ConnectError) {
    switch (e.code) {
      case Code.Unavailable:
      case Code.DeadlineExceeded:
        return t("common.loadErrorMessage");
      case Code.NotFound:
        return t("common.loadError");
      default:
        // 서버가 사람이 읽을 문구를 줬으면 그것을 쓴다(도메인 오류는 우리말로 온다).
        return e.rawMessage || t("common.loadError");
    }
  }
  return t("common.loadError");
}
