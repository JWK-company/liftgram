// @plm SRS-053  동기 설정의 「이 기기 쓰기 대기」 표식 — 판정만 하는 순수 함수(저장소는 부르는 쪽 · frontend/lib/prefs.ts)
//
// 왜: 동기 설정(SYNCED_PREF_KEYS)은 localStorage 에 **동기로** 먼저 쓰고, 프로필(app_prefs) 쓰기 → 디스크 내려쓰기는
// **비동기로** 따로 돈다. 그 사이에 새로고침·앱 종료가 끼면 로컬 DB 에는 옛 프로필 값이 남고, 다음 부팅에 PrefsBridge 가
// 그 옛 값을 localStorage 로 내려 「방금 바꾼 설정이 되돌아간다」(2026-10-27 release1 검증 · opengym-rir 좌표 흔들림).
//
// 그래서 setPref 가 키별로 { value, at } 표식을 **먼저** 남기고, 프로필 쓰기가 디스크까지 끝나면 그 표식을 지운다.
//   · 표식이 있는 키는 프로필 값으로 덮지 않는다(planProfilePrefsApply).
//   · 부팅 때 표식이 남아 있으면 프로필에 다시 써서 마무리한다(재시도 — 같은 값이면 쓰지 않고 내려쓰기만).
//   · 지울 때는 **내가 쓴 그 표식**(value·at 이 같은 것)만 지운다 — 쓰는 도중 또 바꾼 더 새 표식은 남긴다(settlePendingPrefs).
//   · 오래된 표식(7일)은 버린다 — 영영 마무리 못 한 표식이 그 키를 이 기기에 묶어 두지 않게.
//
// 충돌 규칙(의도적으로 단순): 표식이 남아 있는 동안 다른 기기에서 같은 키를 바꿨더라도 **이 기기에서 마지막으로 바꾼 값이
// 이긴다** — 재시도가 그 값을 프로필에 다시 쓰고 동기가 서버로 올린다. 시각 비교(서버 시계·기기 시계)는 하지 않는다.
// 표식은 쓰기가 끝나면 곧 사라지므로 이 규칙이 실제로 작동하는 창은 「바꾸고 곧바로 닫은 뒤 다른 기기에서 또 바꾼」 경우뿐이다.
//
// 프로필 값이 표식 값과 같아졌다고 **화면 쪽에서** 표식을 지우지 않는다: PrefsBridge 가 받는 값은 메모리 DB 의 것이라
// 아직 디스크에 없을 수 있다(그 순간 새로고침하면 다시 되돌아간다). 지우는 곳은 내려쓰기를 확인한 쓰기 경로 하나다.

export type PendingPref = { value: string; at: number };
export type PendingPrefs = Record<string, PendingPref>;

/** 이보다 오래된 표식은 버린다(마무리를 못 한 채 남은 것). */
export const PREFS_PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** 저장된 문자열을 읽는다 — 모양이 틀리거나 동기 대상이 아닌 키는 버린다(던지지 않는다). */
export function parsePendingPrefs(raw: string | null, keys: readonly string[]): PendingPrefs {
  if (!raw) return {};
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const allowed = new Set(keys);
  const out: PendingPrefs = {};
  for (const [k, e] of Object.entries(v as Record<string, unknown>)) {
    if (!allowed.has(k) || !e || typeof e !== 'object') continue;
    const { value, at } = e as { value?: unknown; at?: unknown };
    if (typeof value === 'string' && typeof at === 'number' && Number.isFinite(at)) out[k] = { value, at };
  }
  return out;
}

/** 오래된 표식을 걸러 낸다. 미래 시각(기기 시계를 되돌린 경우)은 남긴다 — 버리면 방금 바꾼 값이 되돌아갈 수 있다. */
export function prunePendingPrefs(
  pending: PendingPrefs,
  now: number,
  maxAgeMs: number = PREFS_PENDING_MAX_AGE_MS,
): { kept: PendingPrefs; dropped: string[] } {
  const kept: PendingPrefs = {};
  const dropped: string[] = [];
  for (const [k, e] of Object.entries(pending)) {
    if (now - e.at > maxAgeMs) dropped.push(k);
    else kept[k] = e;
  }
  return { kept, dropped };
}

/**
 * 프로필 값을 이 기기로 내릴 때 실제로 localStorage 에 쓸 것.
 * 표식이 있는 키는 건너뛴다(이 기기에서 방금 바꾼 값이 아직 프로필·디스크에 닿지 않았다).
 */
export function planProfilePrefsApply(input: {
  keys: readonly string[];
  profile: Record<string, string> | null | undefined;
  local: Record<string, string | null>;
  pending: PendingPrefs;
}): Record<string, string> {
  const writes: Record<string, string> = {};
  if (!input.profile) return writes;
  for (const k of input.keys) {
    if (input.pending[k]) continue;
    const v = input.profile[k];
    if (typeof v === 'string' && input.local[k] !== v) writes[k] = v;
  }
  return writes;
}

/** 쓰기를 마친 뒤 남길 표식 — `settled`(내가 쓴 표식)와 value·at 이 똑같은 것만 지운다. */
export function settlePendingPrefs(current: PendingPrefs, settled: PendingPrefs): PendingPrefs {
  const out: PendingPrefs = {};
  for (const [k, e] of Object.entries(current)) {
    const s = settled[k];
    if (s && s.value === e.value && s.at === e.at) continue;
    out[k] = e;
  }
  return out;
}

/** 프로필에 합쳐 쓸 다음 app_prefs 와, 실제로 바뀌는 것이 있는지. */
export function mergeAppPrefs(
  base: Record<string, string> | null | undefined,
  patch: Record<string, string>,
): { next: Record<string, string>; changed: boolean } {
  const prev = base ?? {};
  const next = { ...prev, ...patch };
  const changed = Object.keys(patch).some((k) => prev[k] !== patch[k]);
  return { next, changed };
}
