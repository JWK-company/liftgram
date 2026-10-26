// @plm SRS-011  앱 설정 — 대부분 localStorage, 그중 **계정과 함께 옮길 것**은 프로필에도 쓴다
//
// 주간 목표(주 N일)·스트릭 주말 제외·휴식 알림음은 예전엔 이 기기에만 두었다. 2026-10-26 주소를
// 옮기자 그 값이 전부 기본값으로 돌아갔다 — 기기 저장소는 주소(origin)마다 따로이기 때문이다.
// 그래서 `SYNCED_PREF_KEYS` 의 값은 **프로필(app_prefs · v21)에도 써서** 서버로 동기한다.
// 읽기는 지금처럼 동기식으로 localStorage에서 한다 — PrefsBridge가 프로필 값을 localStorage로 내려 준다.
//
// 키는 app과 똑같이 둔다(옛 기기에서 가져온 백업 파일이 그대로 이어지도록).
const has = () => typeof localStorage !== "undefined";

/** 계정과 함께 옮기는 설정. 온보딩 표시·스토리 열람 같은 **이 기기 사실**은 넣지 않는다. */
export const SYNCED_PREF_KEYS = [
  "liftgram.weeklyGoal",
  "liftgram.streakSkipWeekends",
  "liftgram.restSound",
  "liftgram.restVolume",
  "liftgram.theme", // 시스템·라이트·다크 — lib/theme.ts
] as const;
const SYNCED = new Set<string>(SYNCED_PREF_KEYS);

/** 프로필에서 설정이 내려왔을 때 화면이 다시 읽도록 쏘는 이벤트 */
export const PREFS_EVENT = "liftgram-prefs";

export function getPref(key: string): string | null {
  return has() ? localStorage.getItem(key) : null;
}

export function setPref(key: string, value: string): void {
  if (!has()) return;
  localStorage.setItem(key, value);
  if (SYNCED.has(key)) void writeToProfile({ [key]: value });
}

/** 동기 대상 설정만 모은다(프로필로 올릴 때). */
export function localSyncedPrefs(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!has()) return out;
  for (const k of SYNCED_PREF_KEYS) {
    const v = localStorage.getItem(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

/** 프로필 값을 이 기기로 내린다. 바뀐 것이 있으면 true(화면에 알린다). */
export function applyProfilePrefs(prefs: Record<string, string> | null): boolean {
  if (!has() || !prefs) return false;
  let changed = false;
  for (const k of SYNCED_PREF_KEYS) {
    const v = prefs[k];
    if (typeof v === "string" && localStorage.getItem(k) !== v) {
      localStorage.setItem(k, v);
      changed = true;
    }
  }
  if (changed) {
    // 테마는 화면 전체에 곧바로 — 다른 기기에서 바꾼 값이 내려왔을 때도.
    const t = localStorage.getItem("liftgram.theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
    window.dispatchEvent(new Event(PREFS_EVENT));
  }
  return changed;
}

/** 프로필의 app_prefs 에 합쳐 쓴다(다른 키는 그대로). 저장 뒤 동기를 예약한다. */
export async function writeToProfile(patch: Record<string, string>): Promise<void> {
  const [{ getOrCreateLocalUser, updateUserSettings }, { scheduleSync }] = await Promise.all([
    import("@app/core/data/userRepository"),
    import("@app/core/sync/syncEngine"),
  ]);
  const u = await getOrCreateLocalUser();
  const next = { ...(u.appPrefs ?? {}), ...patch };
  await updateUserSettings(u.id, { appPrefs: next });
  // **곧바로 디스크에 내려쓴다.** LokiJS는 비동기로 내려쓰므로, 설정을 바꾸고 바로 화면을 옮기면
  // 프로필 쓰기가 사라진다(localStorage엔 남아 이 기기에선 멀쩡해 보이지만 서버로는 안 간다).
  const { flushLocalDb } = await import("./localDb");
  await flushLocalDb();
  scheduleSync();
}
