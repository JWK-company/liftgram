// @plm SRS-088  동기 멈춤 판정 · 기기 건강 보고 시점 — 기기 화면과 운영 화면이 **같은 식**을 쓴다 (2026-10-28)
//
// 사용자 화면의 「백업이 멈췄어요」 띠(useSyncHealth → SyncHealthBanner)와 운영진 /ops 의 「동기가 멈춘 사용자」가
// 다른 식을 쓰면, 사용자는 경고를 보는데 운영진은 모르거나 그 반대가 된다(qa spec H-1). 그래서 식을 여기 한 곳에 두고,
// 서버(backend/internal/ops/service.go IsStalled)에는 같은 경계 표를 테스트로 복제한다.
//
// 보고 시점(qa spec H-1 · SRS-088 「동기를 시도한 뒤」):
//   · 방아쇠 = 시도가 **끝났을 때**(lastSuccessAt · consecutiveFailures · lastError 가 바뀐 순간). 시작 때 값을 보내면
//     「시도는 있었고 성공은 오래됨」이 늘 참이라 거짓 경보가 된다.
//   · 즉시 보낸다: 실패 0→양수 · 연속 실패가 3 이상이 된 순간 · 실패→성공 · blocked 변화 (마지막으로 **보낸** 값과 비교)
//   · 그 밖에는 10분에 한 번.

/** 판정에 필요한 동기 건강(core/sync/syncEngine 의 SyncHealth 와 같은 모양 — 그 모듈을 import 하지 않으려고 따로 적는다) */
export interface SyncHealthLike {
  lastSuccessAt: number | null;
  lastAttemptAt: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  pending: number | null;
  blocked: boolean;
}

export const STALL_STALE_MS = 24 * 3600_000;
export const STALL_FAILURES = 3;

/** 백업이 멈췄다고 **경고할** 때인가 — 올라갈 기록이 있는데 실패가 이어지거나 오래 성공이 없다. */
export function isBackupStalled(h: SyncHealthLike, now = Date.now()): boolean {
  if (!h.pending) return false;
  if (h.blocked) return true;
  if (h.consecutiveFailures >= STALL_FAILURES) return true;
  // 한 번도 성공 못 했거나 마지막 성공이 하루 넘었는데, 그 뒤로 시도는 있었다.
  const stale = !h.lastSuccessAt || now - h.lastSuccessAt > STALL_STALE_MS;
  return stale && h.lastAttemptAt !== null && h.consecutiveFailures > 0;
}

// ── 기기 건강 보고 시점 ──────────────────────────────────────────────────────

export const HEALTH_REPORT_THROTTLE_MS = 10 * 60_000;

/** 마지막으로 **보낸** 보고(즉시 조건 비교 · 쓰로틀 기준). 기기 저장소에 남긴다(새로고침에도 이어지게). */
export interface SentHealth {
  at: number;
  failures: number;
  blocked: boolean;
}

/** 직전에 본 값과 비교해 「시도가 끝났다」인가. 시작(lastAttemptAt 만 바뀜)·미동기 수 갱신은 아니다. */
export function attemptFinished(prev: SyncHealthLike, next: SyncHealthLike): boolean {
  return (
    prev.lastSuccessAt !== next.lastSuccessAt ||
    prev.consecutiveFailures !== next.consecutiveFailures ||
    prev.lastError !== next.lastError
  );
}

/** 쓰로틀을 건너뛰고 곧바로 보내야 하는 변화인가(마지막으로 보낸 값 기준). */
export function isUrgentHealthChange(sent: SentHealth, next: SyncHealthLike): boolean {
  const a = sent.failures;
  const b = next.consecutiveFailures;
  if (a === 0 && b > 0) return true; // 실패 시작
  if (a < STALL_FAILURES && b >= STALL_FAILURES) return true; // 멈춤 문턱(3회)을 넘은 순간
  if (a > 0 && b === 0) return true; // 실패 → 성공
  return sent.blocked !== next.blocked;
}

/** 이번에 보내는가. 보낸 적 없음·시계가 되돌아감(마지막 보냄이 미래)이면 보낸다. */
export function shouldReportHealth(input: { sent: SentHealth | null; next: SyncHealthLike; now: number }): boolean {
  const { sent, next, now } = input;
  if (!sent || sent.at > now) return true;
  if (isUrgentHealthChange(sent, next)) return true;
  return now - sent.at >= HEALTH_REPORT_THROTTLE_MS;
}

/** 서버로 보내는 나이(ms) — 기기 시계 틀어짐은 서버가 자기 시계로 다시 계산해 없앤다. 시각이 없으면 undefined. */
export function ageMs(at: number | null, now: number): number | undefined {
  if (at == null || !Number.isFinite(at)) return undefined;
  return Math.max(0, Math.round(now - at));
}
