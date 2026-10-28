// @plm SRS-086  로그인 유도 — 비로그인 기기에서 기록을 계정에 보관하라고 권하는 때를 정한다 (2026-10-28)
//
// 로그인하지 않은 기기의 기록은 그 기기에만 있다. 폰을 바꾸거나 앱·브라우저 데이터를 지우면(Safari 는 7일 미방문 축출도)
// 전부 사라진다. 그래서 운동을 마칠 때 권하되, 운동할 때마다 끼어들지는 않는다:
//   · 이 기기의 비로그인 완료 1번째·3번째 → 권한다
//   · 그 뒤로는 마지막으로 보인 때부터 7일이 지난 다음 완료에 → 권한다
// 화면 위 「이 기기에만 있는 기록」 띠는 **운동을 한 번 마친 뒤**부터 뜨고, 「나중에」는 하루만 접는다(전에는 5건·7일 — SRS-053).
// 기준이 행 수가 아니라 완료한 운동인 것은 첫 운동 도중(운동 행 하나 = 미동기 1)에 띠가 끼어들지 않게 하려는 것이다(qa spec H-3).

export const LOGIN_NUDGE_REPEAT_MS = 7 * 24 * 3600_000;
/** 띠가 뜨는 「올라가지 않은 기록」 수(완료한 운동이 함께 있을 때) */
export const LOCAL_ONLY_MIN = 1;
/** 이 판정이 생기기 전부터 쓰던 기기(완료 수를 센 적 없음)는 예전 기준(5건)으로 본다 */
export const LOCAL_ONLY_LEGACY_MIN = 5;
/** 띠 「나중에」가 접어 두는 시간 */
export const LOCAL_ONLY_SNOOZE_MS = 24 * 3600_000;

export interface LoginNudgeInput {
  /** 이번 완료를 **포함한** 이 기기의 비로그인 완료 수 */
  anonCompletedCount: number;
  /** 권유 시트가 마지막으로 보인 시각(ms) · 없으면 null */
  lastShownAt: number | null;
  now: number;
}

/** 이번 완료에 권유 시트를 띄우는가. */
export function shouldShowLoginNudge({ anonCompletedCount: n, lastShownAt, now }: LoginNudgeInput): boolean {
  if (!Number.isFinite(n) || n < 1) return false;
  if (n === 1 || n === 3) return true;
  if (n < 3) return false;
  // 3번째에 못 띄웠거나(표시 기록 없음 · 시계를 되돌려 미래로 남은 표시도 없음으로 본다) 마지막 표시에서 7일이 지났다
  if (lastShownAt == null || lastShownAt > now) return true;
  return now - lastShownAt >= LOGIN_NUDGE_REPEAT_MS;
}

export interface LocalOnlyBannerInput {
  /** 서버로 안 올라간 사용자 기록 수 · 모르면 null */
  pending: number | null;
  /** 이 기기의 비로그인 완료 수(loginNudge 가 센 값) */
  anonCompletedCount: number;
  /** 「나중에」를 누른 시각(ms) · 없으면 0 */
  dismissedAt: number;
  now: number;
}

/** 비로그인 기기에 「이 기기에만 있는 기록」 띠를 보이는가(로그인 여부·진행 중 운동 화면은 부르는 쪽이 본다). */
export function localOnlyBannerVisible({ pending, anonCompletedCount, dismissedAt, now }: LocalOnlyBannerInput): boolean {
  const p = pending ?? 0;
  const enough = anonCompletedCount >= 1 ? p >= LOCAL_ONLY_MIN : p >= LOCAL_ONLY_LEGACY_MIN;
  return enough && now - dismissedAt > LOCAL_ONLY_SNOOZE_MS;
}
