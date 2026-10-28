// @plm SRS-086  로그인 권유 — 비로그인 완료 수·마지막 표시 시각을 이 기기에 적고, 이번 완료에 띄울지 정한다
//
// 둘 다 기기 로컬 값이다(SYNCED_PREF_KEYS 아님) — 로그인하지 않은 기기의 이야기라 계정에 실을 곳이 없다.
// 같은 운동을 두 번 세지 않는다(완료가 두 번 불려도 · 다시 시작한 운동은 새 id).
import { shouldShowLoginNudge } from "@app/core/domain/loginNudge";
import { getPref, setPref } from "./prefs";

const COUNT_KEY = "liftgram.nudge.anonCompleted";
const LAST_COUNTED_KEY = "liftgram.nudge.lastCountedWorkout";
const LAST_SHOWN_KEY = "liftgram.nudge.lastShownAt";
/** 띄울 차례였는데 아직 안 보인 권유(루틴 질문 중 앱을 닫음 등) — 다음 완료에 띄운다(qa code M-3) */
const DUE_KEY = "liftgram.nudge.due";
/** 띠 「나중에」와 같은 키 — 시트의 「나중에」가 띠도 하루 접는다(qa code M-2) */
const BANNER_DISMISS_KEY = "sync_localonly_dismissed_at";

/**
 * e2e 기본 상태 표식 — 첫 실행 안내(onboarding_seen_v1)와 같은 이유다. 비로그인으로 운동을 마치는 수십 개 테스트가
 * 권유 시트·띠부터 닫아야 하지 않게, playwright 설정이 이 값을 넣고 시작한다(`login-nudge.spec.ts`만 지운다).
 * 있으면 세지도 띄우지도 않는다(완료 수 0 → 띠는 예전 기준).
 */
const SUPPRESS_KEY = "liftgram.nudge.suppressed";

/** 비로그인으로 마친 운동 하나를 세고, 이번에 권유 시트를 띄울지 돌려준다. */
export function noteAnonCompletion(workoutId: string, now = Date.now()): boolean {
  if (getPref(SUPPRESS_KEY)) return false;
  let count = Number(getPref(COUNT_KEY) ?? 0) || 0;
  if (getPref(LAST_COUNTED_KEY) !== workoutId) {
    count += 1;
    setPref(COUNT_KEY, String(count));
    setPref(LAST_COUNTED_KEY, workoutId);
  } else {
    // 이미 센 운동 — 이번 완료에서 또 띄우지 않는다
    return false;
  }
  const last = Number(getPref(LAST_SHOWN_KEY) ?? 0);
  const show =
    !!getPref(DUE_KEY) ||
    shouldShowLoginNudge({ anonCompletedCount: count, lastShownAt: last > 0 ? last : null, now });
  if (show) setPref(DUE_KEY, workoutId);
  return show;
}

/** 이 기기에서 비로그인으로 마친 운동 수(띠 판정이 쓴다). */
export function anonCompletedCount(): number {
  return Number(getPref(COUNT_KEY) ?? 0) || 0;
}

/** 권유 시트가 보였다. */
export function markLoginNudgeShown(now = Date.now()): void {
  setPref(LAST_SHOWN_KEY, String(now));
  try {
    localStorage.removeItem(DUE_KEY);
  } catch {
    /* 저장소를 못 쓰면 다음 완료에 한 번 더 뜬다 — 해롭지 않다 */
  }
}

/** 시트에서 「나중에」 — 같은 말을 하는 띠도 하루 접는다. */
export function snoozeLocalOnlyBanner(now = Date.now()): void {
  setPref(BANNER_DISMISS_KEY, String(now));
}
