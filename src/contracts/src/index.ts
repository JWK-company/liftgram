// @plm SRS-001  계약 entry point — 화면이 import 하는 단 하나의 문
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 패키지의 알맹이는 **사람이 쓰지 않는다.** `gen/` 아래는 buf가 proto에서 만들어낸다
// (make proto). 이 파일은 그 생성물을 화면이 쓰기 좋은 모양으로 다시 내보내고,
// 양쪽이 공유해야 하는 **경로 상수**를 얹는다.
//
// 그래서 계약을 바꾸는 방법은 하나뿐이다: proto를 고치고 make proto.
// 손으로 타입을 적어 맞추는 일이 없으므로 frontend와 backend가 어긋날 수 없다.
// ─────────────────────────────────────────────────────────────────────────────

// 메시지 타입과 서비스 기술자(Connect 클라이언트가 이걸 받는다)
export * from "../gen/auth/v1/auth_pb";
export * from "../gen/exercise/v1/exercise_pb";
export * from "../gen/feed/v1/feed_pb";
export * from "../gen/media/v1/media_pb";
export * from "../gen/story/v1/story_pb";
export * from "../gen/dm/v1/dm_pb";
export * from "../gen/notification/v1/notification_pb";
export * from "../gen/moderation/v1/moderation_pb";
export * from "../gen/gear/v1/gear_pb";
export * from "../gen/feedback/v1/feedback_pb";
export * from "../gen/sync/v1/sync_pb";
export * from "../gen/coaching/v1/coaching_pb";
export * from "../gen/meta/v1/meta_pb";

/**
 * 브라우저가 보는 경로.
 *
 * Connect가 만드는 RPC 경로는 `/exercise.v1.ExerciseService/ListExercises` 처럼 생겼는데,
 * 이 스택에서는 그 앞에 `/api`를 붙인다 — 브라우저는 frontend만 보고 frontend가 `/api/*`를
 * 통째로 backend에 넘기기 때문이다(ADR-010). 서버(RSC)는 프록시를 건너뛰고 backend를 직접 부른다.
 */
export const routes = {
  /** 브라우저에서 Connect 클라이언트를 만들 때의 baseUrl */
  apiPrefix: "/api",
  /** frontend 자신의 헬스(프록시 건너편의 backend가 아니다) */
  health: "/healthz",
  ready: "/readyz",
  /** backend의 헬스 — 프록시를 지나 backend가 답한다(backend도 같은 경로에 등록한다) */
  apiHealth: "/api/healthz",
  apiReady: "/api/readyz",
  /** 양방향 채널. frontend의 커스텀 서버가 backend로 터널링한다 */
  ws: "/ws",
  /** 종목 상세의 결정적 딥링크 — app/의 경로 규칙(`/exercise/seed-<슬러그>`)을 그대로 잇는다 */
  exercise: (id: string) => `/exercise/${encodeURIComponent(id)}`,
  /** 소셜 딥링크 — 화면들이 손으로 문자열을 만들지 않도록 여기 모은다. */
  postComments: (postId: string) => `/feed/${encodeURIComponent(postId)}`,
  userProfile: (userId: string) => `/u/${encodeURIComponent(userId)}`,
  follows: (userId: string, mode: "followers" | "following") =>
    `/u/${encodeURIComponent(userId)}/follows?mode=${mode}`,
  hashtag: (tag: string) => `/hashtag/${encodeURIComponent(tag)}`,
  conversation: (id: string) => `/messages/${encodeURIComponent(id)}`,
} as const;
