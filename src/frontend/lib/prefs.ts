// @plm SRS-011  앱 설정 — 대부분 localStorage, 그중 **계정과 함께 옮길 것**은 프로필에도 쓴다
//
// 주간 목표(주 N일)·스트릭 주말 제외·휴식 알림음은 예전엔 이 기기에만 두었다. 2026-10-26 주소를
// 옮기자 그 값이 전부 기본값으로 돌아갔다 — 기기 저장소는 주소(origin)마다 따로이기 때문이다.
// 그래서 `SYNCED_PREF_KEYS` 의 값은 **프로필(app_prefs · v21)에도 써서** 서버로 동기한다.
// 읽기는 지금처럼 동기식으로 localStorage에서 한다 — PrefsBridge가 프로필 값을 localStorage로 내려 준다.
//
// 키는 app과 똑같이 둔다(옛 기기에서 가져온 백업 파일이 그대로 이어지도록).
//
// **쓰기 대기 표식**(2026-10-27): localStorage 쓰기는 동기, 프로필 쓰기·내려쓰기는 비동기다. 그 사이에 새로고침하면
// PrefsBridge 가 디스크의 옛 프로필 값을 localStorage 로 다시 내려 「방금 바꾼 설정이 되돌아갔다」. 그래서 setPref 는
// `PENDING_KEY` 에 키별 { value, at } 를 먼저 남기고, 프로필 쓰기가 **디스크까지** 끝나야 지운다. 표식이 있는 키는
// 프로필 값으로 덮지 않고, 부팅 때 남은 표식은 프로필에 다시 써서 마무리한다. 판정·충돌 규칙 = core/domain/prefsPending.ts.
import {
  type PendingPrefs,
  mergeAppPrefs,
  parsePendingPrefs,
  planProfilePrefsApply,
  prunePendingPrefs,
  settlePendingPrefs,
} from "@app/core/domain/prefsPending";

const has = () => typeof localStorage !== "undefined";

/** 계정과 함께 옮기는 설정. 온보딩 표시·스토리 열람 같은 **이 기기 사실**은 넣지 않는다. */
export const SYNCED_PREF_KEYS = [
  "liftgram.weeklyGoal",
  "liftgram.streakSkipWeekends",
  "liftgram.restSound",
  "liftgram.restVolume",
  "liftgram.theme", // 시스템·라이트·다크 — lib/theme.ts
  "liftgram.effortLogging", // 세트 힘든 정도 기록("1" = 켬 · 없음/"0" = 끔 — 기본 끔) — lib/effortPref.ts @plm SRS-073
  "liftgram.muscleMap", // 근육 그림 보기("0" = 끔 · 없음/"1" = 켬 — 기본 켬) — lib/muscleMapPref.ts @plm SRS-075
] as const;
const SYNCED = new Set<string>(SYNCED_PREF_KEYS);

/** 프로필에서 설정이 내려왔을 때 화면이 다시 읽도록 쏘는 이벤트 */
export const PREFS_EVENT = "liftgram-prefs";

export function getPref(key: string): string | null {
  return has() ? localStorage.getItem(key) : null;
}

/** 이 기기에서 바꿨지만 아직 프로필·디스크에 닿지 않은 동기 설정 표식 — `{ [키]: { value, at } }` (JSON) */
export const PENDING_KEY = "liftgram.prefsPending";

function readPending(): PendingPrefs {
  try {
    return parsePendingPrefs(localStorage.getItem(PENDING_KEY), SYNCED_PREF_KEYS);
  } catch {
    return {};
  }
}

function writePending(p: PendingPrefs): void {
  try {
    if (Object.keys(p).length) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // 저장소가 가득 찼거나 막혔다 — 표식 없이도 예전처럼은 동작한다(경합 창만 다시 열린다).
  }
}

export function setPref(key: string, value: string): void {
  if (!has()) return;
  if (!SYNCED.has(key)) {
    localStorage.setItem(key, value);
    return;
  }
  // 표식을 **값보다 먼저** 남긴다 — 둘 사이에서 끊겨도 「표식 있음 · 값 옛것」이면 부팅 마무리가 표식 값으로 맞춘다.
  const entry = { value, at: Date.now() };
  writePending({ ...readPending(), [key]: entry });
  localStorage.setItem(key, value);
  void writeToProfile({ [key]: value }, { [key]: entry }).catch(() => {
    // 표식이 남아 있다 — 다음 부팅(resumePendingPrefs)이 다시 쓴다.
  });
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
  const local: Record<string, string | null> = {};
  for (const k of SYNCED_PREF_KEYS) local[k] = localStorage.getItem(k);
  // 쓰기 대기 표식이 있는 키는 덮지 않는다 — 프로필 쪽이 아직 옛 값이다(되돌림 경합).
  const writes = planProfilePrefsApply({
    keys: SYNCED_PREF_KEYS,
    profile: prefs,
    local,
    pending: readPending(),
  });
  for (const [k, v] of Object.entries(writes)) localStorage.setItem(k, v);
  const changed = Object.keys(writes).length > 0;
  if (changed) announcePrefs();
  return changed;
}

/** localStorage 의 동기 설정이 바뀌었다고 화면에 알린다. */
function announcePrefs(): void {
  // 테마는 화면 전체에 곧바로 — 다른 기기에서 바꾼 값이 내려왔을 때도.
  const t = localStorage.getItem("liftgram.theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  else document.documentElement.removeAttribute("data-theme");
  window.dispatchEvent(new Event(PREFS_EVENT));
}

/**
 * 프로필의 app_prefs 에 합쳐 쓴다(다른 키는 그대로). 저장 뒤 동기를 예약한다.
 *
 * `settle` 을 주면 내려쓰기가 **성공한 뒤** 그 표식(value·at 이 같은 것만)을 지운다.
 * 쓰기는 한 줄로 세운다 — 두 설정을 연달아 바꾸면 둘 다 같은 옛 app_prefs 를 바탕으로 합쳐 앞의 것이 사라졌다.
 */
let writeChain: Promise<void> = Promise.resolve();
export function writeToProfile(patch: Record<string, string>, settle?: PendingPrefs): Promise<void> {
  const run = writeChain.then(() => writeToProfileNow(patch, settle));
  writeChain = run.catch(() => undefined);
  return run;
}

async function writeToProfileNow(patch: Record<string, string>, settle?: PendingPrefs): Promise<void> {
  const [{ getOrCreateLocalUser, updateUserSettings }, { scheduleSync }] = await Promise.all([
    import("@app/core/data/userRepository"),
    import("@app/core/sync/syncEngine"),
  ]);
  const u = await getOrCreateLocalUser();
  const { next, changed } = mergeAppPrefs(u.appPrefs, patch);
  // 같은 값이면 쓰지 않는다(부팅 마무리가 이미 닿은 값을 또 써서 동기를 깨우지 않게) — 내려쓰기 확인은 그래도 한다.
  if (changed) await updateUserSettings(u.id, { appPrefs: next });
  // **곧바로 디스크에 내려쓴다.** LokiJS는 비동기로 내려쓰므로, 설정을 바꾸고 바로 화면을 옮기면
  // 프로필 쓰기가 사라진다(localStorage엔 남아 이 기기에선 멀쩡해 보이지만 서버로는 안 간다).
  const { flushLocalDbResult } = await import("./localDb");
  const flushed = await flushLocalDbResult();
  // "saved" 일 때만 표식을 지운다. "failed" 면 남겨 다음 부팅에 다시 쓴다.
  // "unreachable"(어댑터 내부 구조가 바뀜 — /diag/db 가 잡는다)은 확인할 길이 없어 예전처럼 자동 저장을 믿고 지운다.
  if (settle && flushed !== "failed") writePending(settlePendingPrefs(readPending(), settle));
  if (changed) scheduleSync();
}

/**
 * 부팅 때 한 번 — 남은 쓰기 대기 표식을 마무리한다(앞 세션에서 프로필 쓰기·내려쓰기가 끝나기 전에 닫힌 경우).
 * 오래된 표식은 버리고, 나머지는 그 값을 localStorage 에 다시 맞춘 뒤 프로필에 쓴다(「이 기기에서 마지막으로 바꾼 값 우선」).
 */
export async function resumePendingPrefs(now: number = Date.now()): Promise<void> {
  if (!has()) return;
  const { kept, dropped } = prunePendingPrefs(readPending(), now);
  if (dropped.length) writePending(kept);
  const keys = Object.keys(kept);
  if (!keys.length) return;
  const patch: Record<string, string> = {};
  let fixed = false;
  for (const k of keys) {
    patch[k] = kept[k].value;
    if (localStorage.getItem(k) !== kept[k].value) {
      localStorage.setItem(k, kept[k].value);
      fixed = true;
    }
  }
  if (fixed) announcePrefs();
  await writeToProfile(patch, kept);
}
