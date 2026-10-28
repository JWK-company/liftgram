// @plm SRS-086  로그인 권유 — 비로그인 완료 수·마지막 표시 시각을 이 기기에 적고, 이번 완료에 띄울지 정한다
//
// 둘 다 기기 로컬 값이다(SYNCED_PREF_KEYS 아님) — 로그인하지 않은 기기의 이야기라 계정에 실을 곳이 없다.
// 같은 운동을 두 번 세지 않는다(완료가 두 번 불려도 · 다시 시작한 운동은 새 id).
import { shouldShowLoginNudge } from "@app/core/domain/loginNudge";
import { getPref, setPref } from "./prefs";

const COUNT_KEY = "liftgram.nudge.anonCompleted";
const LAST_COUNTED_KEY = "liftgram.nudge.lastCountedWorkout";
const LAST_SHOWN_KEY = "liftgram.nudge.lastShownAt";

/** 비로그인으로 마친 운동 하나를 세고, 이번에 권유 시트를 띄울지 돌려준다. */
export function noteAnonCompletion(workoutId: string, now = Date.now()): boolean {
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
  return shouldShowLoginNudge({ anonCompletedCount: count, lastShownAt: last > 0 ? last : null, now });
}

/** 이 기기에서 비로그인으로 마친 운동 수(띠 판정이 쓴다). */
export function anonCompletedCount(): number {
  return Number(getPref(COUNT_KEY) ?? 0) || 0;
}

/** 권유 시트가 보였다. */
export function markLoginNudgeShown(now = Date.now()): void {
  setPref(LAST_SHOWN_KEY, String(now));
}
