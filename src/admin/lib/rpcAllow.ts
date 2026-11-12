// 운영 웹이 백엔드로 넘기는 RPC 의 전체 목록(SPEC-033 · REV-048 H-4).
// 서비스 단위로 열면 탈퇴, 소셜 연결 해제, 로그인 넘김 코드 발급까지 함께 열린다. 그래서 전체 문자열로 맞춘다.
// 로그인·갱신·로그아웃은 세션 라우트가 맡으므로 여기 없다.
export const ALLOWED_RPCS: ReadonlySet<string> = new Set([
  "/api/auth.v1.AuthService/Me",
  "/api/admin.v1.AdminService/GetUsageStats",
  "/api/admin.v1.AdminService/GetFeatureStats",
  "/api/admin.v1.AdminService/GetSignupStats",
  "/api/admin.v1.AdminService/GetRoutineStats",
  "/api/admin.v1.AdminService/GetContentStats",
  "/api/admin.v1.AdminService/GetOperationsStats",
  "/api/feedback.v1.FeedbackService/Submit",
  "/api/feedback.v1.FeedbackService/List",
  "/api/feedback.v1.FeedbackService/ListEntries",
  "/api/feedback.v1.FeedbackService/SetStatus",
  "/api/moderation.v1.ModerationService/ListQueue",
  "/api/moderation.v1.ModerationService/Resolve",
  "/api/moderation.v1.ModerationService/GetReviewMedia",
  "/api/ops.v1.OpsService/GetOpsStatus",
  "/api/ops.v1.OpsService/GetOpsAlert",
  // 이달의 리프터(SPEC-063) — 운영 RPC 6개(사용자 검색 포함). 앱 사용자 RPC(AwardService)는 열지 않는다.
  "/api/award.v1.AwardAdminService/Candidates",
  "/api/award.v1.AwardAdminService/DrawPreview",
  "/api/award.v1.AwardAdminService/Confirm",
  "/api/award.v1.AwardAdminService/ListAwards",
  "/api/award.v1.AwardAdminService/SetCoupon",
  "/api/award.v1.AwardAdminService/SearchAwardUsers",
]);

/** 인코딩으로 목록을 비껴가지 못하게 `%` 가 든 경로는 처음부터 받지 않는다. */
export function isAllowedRpc(pathname: string): boolean {
  return !pathname.includes("%") && ALLOWED_RPCS.has(pathname);
}
