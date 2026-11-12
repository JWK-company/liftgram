// 운영 웹의 RPC 클라이언트와 오류 분류.
import {
  AdminService,
  AwardAdminService,
  FeedbackService,
  ModerationService,
  OpsService,
} from "@app/contracts";
import { Code, ConnectError, createClient } from "@connectrpc/connect";
import { binaryTransport, hasSession, transport } from "./session";

export const adminApi = createClient(AdminService, transport);
export const feedbackApi = createClient(FeedbackService, transport);
export const moderationApi = createClient(ModerationService, transport);
export const moderationMediaApi = createClient(ModerationService, binaryTransport);
export const opsApi = createClient(OpsService, transport);
export const awardAdminApi = createClient(AwardAdminService, transport);

/** 대상의 상태가 이미 바뀌었거나 사라져, 다시 눌러도 소용없는 실패. 창을 닫고 다시 읽는다. */
export function isStale(e: unknown): boolean {
  return (
    e instanceof ConnectError &&
    (e.code === Code.AlreadyExists ||
      e.code === Code.FailedPrecondition ||
      e.code === Code.Aborted ||
      e.code === Code.NotFound)
  );
}

/** 처리 동작의 오류 문구. 읽기 문구(「불러오지 못했습니다」)와 다르다. */
export function actionErrorText(e: unknown): string {
  if (e instanceof ConnectError) {
    if (e.code === Code.NotFound) return "이미 없어진 대상입니다. 목록을 다시 읽었습니다.";
    if (isStale(e)) return "다른 운영자가 먼저 처리했습니다. 목록을 다시 읽었습니다.";
    if (e.code === Code.InvalidArgument) return "입력한 내용을 받아들일 수 없습니다. 내용을 확인하세요.";
    if (
      e.code === Code.PermissionDenied ||
      e.code === Code.Unauthenticated ||
      e.code === Code.ResourceExhausted ||
      e.code === Code.Unavailable
    ) {
      return errorText(e);
    }
  }
  return "처리하지 못했습니다. 잠시 뒤 다시 시도하세요.";
}

/** 화면에 보일 오류 문구. 서버 원문은 보이지 않는다. */
export function errorText(e: unknown): string {
  if (e instanceof ConnectError) {
    if (e.code === Code.PermissionDenied)
      return "이 화면을 볼 권한이 없습니다. 권한이 바뀌었다면 다시 로그인하세요.";
    if (e.code === Code.Unauthenticated) {
      // 세션이 살아 있는 401 은 갱신이 503 으로 실패한 것이다. 로그인이 끝난 것이 아니다.
      return hasSession()
        ? "백엔드에 연결할 수 없습니다. 잠시 뒤 다시 시도하세요."
        : "로그인이 끝났습니다. 다시 로그인하세요.";
    }
    if (e.code === Code.ResourceExhausted) return "요청이 너무 많습니다. 잠시 뒤 다시 시도하세요.";
    if (e.code === Code.Unavailable) return "백엔드에 연결할 수 없습니다. 잠시 뒤 다시 시도하세요.";
    if (e.code === Code.AlreadyExists || e.code === Code.FailedPrecondition || e.code === Code.Aborted) {
      return "다른 운영자가 먼저 처리했을 수 있습니다. 새로고침한 뒤 확인하세요.";
    }
  }
  return "불러오지 못했습니다. 잠시 뒤 다시 시도하세요.";
}
