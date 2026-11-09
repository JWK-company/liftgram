// 사용자에게 보일 오류 문구 한 곳(SPEC-025 · #T7).
// 서버·기기 저장소의 한국어 도메인 문구만 그대로 보여 준다. 영어 원문(`internal error`·`Failed to fetch`·`[not_found] …`·
// 라이브러리 예외)은 사람이 읽을 말로 바꾼다. 원문은 화면에 올리지 않는다.
// 다시 눌러도 소용없는 오류에 「다시 시도해 주세요」가 뜨지 않게 코드별로 나눈다(REV-031).
import { Code, ConnectError } from "@connectrpc/connect";
import { t, type TransKey } from "./i18n";

const HANGUL = /[가-힣]/;
const NETWORK = /failed to fetch|networkerror|load failed/i;

/** 기기 저장소가 던지는 약속된 코드 → 사용자 문구 */
const LOCAL_CODES: Record<string, TransKey> = {
  NOTHING_TO_REPLAY: "replay.nothing",
  ACTIVE_EXISTS: "replay.activeExists",
  NOTHING_MATCHED: "replay.nothingMatched",
  COACH_LOCKED: "routines.coachLockedError", // 코치 루틴 잠금(SPEC-050 P3a · routineRepository)
  COACH_DRAFT_CUSTOM: "coaching.draft.customExercise", // 직접 만든 종목이 든 초안(SPEC-050 P3b · CoachDraft — params.name)
};

export function errorText(e: unknown, fallback: string = t("common.error")): string {
  if (e instanceof ConnectError) {
    if (HANGUL.test(e.rawMessage)) return e.rawMessage;
    if (NETWORK.test(e.rawMessage)) return t("common.loadErrorMessage");
    switch (e.code) {
      case Code.Unavailable:
      case Code.DeadlineExceeded:
        return t("common.loadErrorMessage");
      case Code.AlreadyExists:
        return t("common.errAlreadyExists");
      case Code.NotFound:
        return t("common.errNotFound");
      case Code.PermissionDenied:
        return t("common.errDenied");
      case Code.Unauthenticated:
        return t("common.errLogin");
      case Code.InvalidArgument:
      case Code.FailedPrecondition:
        return t("common.errStale");
      default:
        return fallback;
    }
  }
  if ((e as { code?: unknown } | null)?.code === "LOCAL_DB_SEALED") return t("common.errSealed");
  if (e instanceof Error) {
    const known = LOCAL_CODES[e.message];
    // [원본] if (known) return t(known);
    // [개선] 코드에 끼울 값(params)이 있으면 함께 — 예: 「{name}」은 직접 만든 종목이라…(SPEC-050 P3b 리뷰 L-1)
    if (known) return t(known, (e as { params?: Record<string, string | number> }).params);
    if (HANGUL.test(e.message)) return e.message;
    if (NETWORK.test(e.message)) return t("common.loadErrorMessage");
  }
  return fallback;
}
