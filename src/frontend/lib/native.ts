// @plm SRS-095 [ADR-046]  스토어 앱 껍데기의 네이티브 기능 — 웹 화면이 부르는 다리
//
// 웹앱은 Capacitor 를 번들에 넣지 않는다. 앱 웹뷰가 주입하는 `window.Capacitor` 가 있을 때만 움직이고,
// 웹 브라우저에서는 `nativeOS()` 가 null 이라 아무 길도 타지 않는다. 플러그인·메서드가 없으면(낡은 껍데기)
// 조용히 웹 길로 돌아간다 — 예외로 화면을 깨지 않는다(스펙 §12.1 M-5).
//
// 로그인(서버 oauth/handoff.go 와 한 벌 · 북타래 lib/native.ts 와 같은 설계):
//   1. 웹뷰가 무작위 v 를 만들고 ac = S256(v) 만 start 에 싣는다(app=1).
//   2. 시스템 인증 창(iOS ASWebAuthenticationSession · Android Custom Tabs)에서 제공자 로그인.
//   3. 서버가 착지 경로를 맡기고 교환 코드를 liftgram://auth?code= 로 돌려준다(성공·실패 모두).
//   4. 웹뷰가 /api/auth/oauth/app/handoff?code=&v= 로 이동 → 서버가 v 를 확인하고 웹 착지(/auth/complete…)로 302.
// import 0 — 클라이언트 전용.(SPEC-018 §7 부터 순수 규칙 하나 — @app/core/domain/appContinue)
//
// SPEC-018 §7  앱 스킴 주소(appUrlOpen)는 **리스너 하나**가 갈래(auth·workout·start)로 나눠 보낸다(onAppLink).
// 앱이 링크로 처음 켜진 경우(콜드 스타트)는 App.getLaunchUrl() 을 한 번 읽어 같은 길로 보낸다.
import { type AppLinkKind, appLinkKind } from "@app/core/domain/appContinue";

type Plugin = Record<string, (o?: Record<string, unknown>) => Promise<Record<string, unknown>>>;
type Listener = { remove(): Promise<void> };
type CapWindow = Window & {
  Capacitor?: {
    getPlatform?: () => string;
    isNativePlatform?: () => boolean;
    isPluginAvailable?: (n: string) => boolean;
    Plugins?: Record<string, unknown>;
  };
};

/** 앱 스킴 — 서버 oauth.AppScheme · AndroidManifest · Info.plist 와 같은 값. */
export const APP_SCHEME = "liftgram";

function cap() {
  return typeof window === "undefined" ? undefined : (window as CapWindow).Capacitor;
}

/** 스토어 앱 안이면 그 운영체제, 아니면 null. */
export function nativeOS(): "ios" | "android" | null {
  const c = cap();
  if (!c?.isNativePlatform?.()) return null;
  const p = c.getPlatform?.();
  return p === "ios" || p === "android" ? p : null;
}

function plugin(name: string): Plugin | null {
  const c = cap();
  if (!c?.isPluginAvailable?.(name)) return null;
  return (c.Plugins?.[name] as Plugin | undefined) ?? null;
}

/** 이 껍데기가 앱 로그인(시스템 인증 창)을 할 수 있나 — iOS 는 우리 플러그인, 안드로이드는 Browser + App. */
export function canAppSignIn(): boolean {
  const os = nativeOS();
  if (os === "ios") return !!plugin("LiftgramNative");
  if (os === "android") return !!plugin("Browser") && !!plugin("App");
  return false;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PKCE 식 묶음 — v(웹뷰만 앎)와 ac = base64url(sha256(v)). 서버 challengeS256 과 같은 식. */
export async function newHandoffPair(): Promise<{ v: string; ac: string }> {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const v = b64url(raw);
  const sum = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)));
  return { v, ac: b64url(sum) };
}

/** 앱 스킴 콜백 → 교환 주소. 코드가 없으면 null. */
export function handoffPath(callbackUrl: string, v: string): string | null {
  let code: string | null = null;
  try {
    code = new URL(callbackUrl).searchParams.get("code");
  } catch {
    return null;
  }
  if (!code) return null;
  return `/api/auth/oauth/app/handoff?code=${encodeURIComponent(code)}&v=${encodeURIComponent(v)}`;
}

// ── 앱 링크 디스패처(SPEC-018 §7) ──────────────────────────────────────────────

type LinkFn = (url: string) => void;
const linkHandlers: Record<AppLinkKind, Set<LinkFn>> = {
  auth: new Set(),
  workout: new Set(),
  start: new Set(),
};
let linkReady: Promise<boolean> | null = null;
let launchKind: AppLinkKind | null = null;
const launchSeen = new Set<AppLinkKind>();

function dispatchLink(url: string | undefined) {
  const k = appLinkKind(url);
  if (!k || !url) return;
  for (const fn of [...linkHandlers[k]]) {
    try {
      fn(url);
    } catch (e) {
      console.warn("[app-link]", k, e);
    }
  }
}

/** App 리스너를 한 번만 단다 + 콜드 스타트 링크를 한 번 읽는다. 앱이 아니면 false. */
function ensureLinks(): Promise<boolean> {
  if (linkReady) return linkReady;
  linkReady = (async () => {
    const app = nativeOS() ? plugin("App") : null;
    if (!app || typeof app.addListener !== "function") return false;
    try {
      await (
        app.addListener as unknown as (ev: string, f: (d: { url?: string }) => void) => Promise<Listener>
      )("appUrlOpen", (d) => dispatchLink(d.url));
    } catch {
      return false;
    }
    try {
      const r = typeof app.getLaunchUrl === "function" ? await app.getLaunchUrl() : null;
      launchKind = appLinkKind(String(r?.url ?? ""));
    } catch {
      launchKind = null;
    }
    return true;
  })();
  return linkReady;
}

/**
 * 앱 스킴 갈래를 듣는다 — 돌려준 함수로 끊는다. 앱이 아니면 null.
 * 콜드 스타트로 그 갈래가 왔으면 처음 듣는 쪽에 한 번 알린다(start·workout — auth 는 v 가 메모리에 없어 버린다).
 */
// [원본] 콜드 스타트 링크를 그 갈래를 **처음 듣는 쪽**에 재생했다 — 로그인 탭의 start 리스너가 먼저 받으면 auth 처리기를 지웠고
//        (REV-012 화면 H-1), 새로고침마다 다시 재생돼 /workout 으로 끌려갔다(화면 M-2).
// export async function onAppLink(kind: AppLinkKind, fn: LinkFn): Promise<(() => void) | null> {
//   if (!(await ensureLinks())) return null;
//   linkHandlers[kind].add(fn);
//   if (launchKind === kind && kind !== "auth" && !launchSeen.has(kind)) {
//     launchSeen.add(kind);
//     fn(`${APP_SCHEME}://${kind}`);
//   }
//   return () => {
//     linkHandlers[kind].delete(fn);
//   };
// }
// [개선] 재생은 원하는 쪽(replayLaunch)만 · 한 실행(sessionStorage)에 한 번만 — 새로고침해도 다시 오지 않는다
const LAUNCH_SEEN_KEY = "liftgram.launchLinkSeen";
function launchAlreadySeen(kind: AppLinkKind): boolean {
  if (launchSeen.has(kind)) return true;
  try {
    return sessionStorage.getItem(`${LAUNCH_SEEN_KEY}:${kind}`) === "1";
  } catch {
    return false;
  }
}
function markLaunchSeen(kind: AppLinkKind): void {
  launchSeen.add(kind);
  try {
    sessionStorage.setItem(`${LAUNCH_SEEN_KEY}:${kind}`, "1");
  } catch {
    // 못 남기면 이 문서 안에서만 한 번
  }
}

export async function onAppLink(
  kind: AppLinkKind,
  fn: LinkFn,
  opts: { replayLaunch?: boolean } = {},
): Promise<(() => void) | null> {
  if (!(await ensureLinks())) return null;
  linkHandlers[kind].add(fn);
  if (opts.replayLaunch && launchKind === kind && kind !== "auth" && !launchAlreadySeen(kind)) {
    markLaunchSeen(kind);
    fn(`${APP_SCHEME}://${kind}`);
  }
  return () => {
    linkHandlers[kind].delete(fn);
  };
}

/** 앱이 `liftgram://start`(PWA 에서 바꾸기)로 처음 켜졌나 — 로그인 화면이 「계속」을 강조한다. */
export async function launchedForSwitch(): Promise<boolean> {
  return (await ensureLinks()) && launchKind === "start";
}

function isCanceled(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === "CANCELED";
}

/**
 * 앱 로그인 — 구글·카카오·네이버. 취소하면 아무 일도 없다(화면 그대로).
 * @param startPath `/api/auth/oauth/<p>/start?...` (providers.startUrl 결과 — 연결 표·return_to 포함)
 * @returns 앱 길로 시작했으면 true(호출 쪽이 웹 이동을 하지 않게), 앱이 아니면 false.
 */
export async function appSignIn(startPath: string): Promise<boolean> {
  const os = nativeOS();
  if (!os || !canAppSignIn()) return false;
  const { v, ac } = await newHandoffPair();
  const u = new URL(startPath, window.location.origin);
  u.searchParams.set("app", "1");
  u.searchParams.set("ac", ac);
  const url = u.toString();
  const finish = (cb: string) => {
    const to = handoffPath(cb, v);
    if (to) window.location.assign(to);
  };

  if (os === "ios") {
    const native = plugin("LiftgramNative");
    if (!native) return false;
    try {
      const res = await native.authSession({ url, scheme: APP_SCHEME });
      finish(String(res.url ?? ""));
    } catch (e) {
      if (!isCanceled(e)) console.warn("[app-login] 로그인 창 실패", e);
    }
    return true;
  }

  // 안드로이드 — Custom Tabs 로 열고, 앱 스킴으로 돌아오면(App appUrlOpen) 탭을 닫고 교환.
  // [원본] 리스너를 여기서 따로 달았다 — 갈래마다 리스너가 늘었다(SPEC-018 §7 · 이제 디스패처 하나)
  // const app = plugin("App");
  // const browser = plugin("Browser");
  // if (!app || !browser) return false;
  // let sub: Listener | null = null;
  // sub = (await (app.addListener as …)("appUrlOpen", (d) => {
  //   if (!d.url?.startsWith(`${APP_SCHEME}://auth`)) return;
  //   void sub?.remove(); void browser.close().catch(() => {}); finish(d.url);
  // })) as Listener;
  // await browser.open({ url });
  // return true;
  // [개선]
  return androidAuthTab(url, finish);
}

/**
 * 안드로이드 시스템 인증 창(Custom Tabs) — `liftgram://auth` 로 돌아오면 탭을 닫고 finish.
 * 넘기기 확인 화면의 「다른 방법으로 로그인」은 `liftgram://auth?cancel=1`(코드 없음) — 탭만 닫고 교환하지 않는다.
 */
let activeTab: (() => void) | null = null;

async function androidAuthTab(url: string, finish: (cb: string) => void): Promise<boolean> {
  const browser = plugin("Browser");
  if (!plugin("App") || !browser) return false;
  activeTab?.(); // 앞서 연 창의 듣기를 끊는다 — 옛 v 로 교환하러 가지 않게
  const offs: Array<(() => void) | null> = [];
  const off = () => {
    for (const o of offs) o?.();
    if (activeTab === off) activeTab = null;
  };
  activeTab = off;
  const done = () => {
    off();
    void browser.close().catch(() => {});
  };
  offs.push(
    await onAppLink("auth", (u) => {
      done();
      finish(u);
    }),
  );
  // [원본] start 로도 탭을 닫았다 — start 는 위젯·PWA 바꾸기와 겹쳤다(REV-012 화면 M-1 · 「다른 방법」은 이제 auth?cancel=1)
  // offs.push(await onAppLink("start", () => done()));
  if (!offs[0]) return false;
  // [개선 REV-012 화면 M-6 · 보안 M-3] 사람이 탭을 그냥 닫으면 처리기를 거둔다 — 나중에 다른 앱이 밀어 넣은 auth 링크로
  // 화면이 끌려가지 않게. 탭이 앱 링크로 닫힐 때는 auth 가 조금 늦게 올 수 있어 잠깐(3초) 기다린 뒤 거둔다.
  const b = browser as unknown as {
    addListener?: (ev: string, f: () => void) => Promise<Listener>;
  };
  if (typeof b.addListener === "function") {
    try {
      const h = await b.addListener("browserFinished", () => {
        setTimeout(() => {
          if (activeTab === off) off();
        }, 3_000);
      });
      offs.push(() => void h.remove().catch(() => {}));
    } catch {
      // 없으면 다음 탭을 열 때 거둔다(위 activeTab)
    }
  }
  await browser.open({ url });
  return true;
}

/**
 * SPEC-018 §7  「웹에서 쓰던 계정으로 계속」 — 크롬 탭(크롬의 쿠키 = 크롬 PWA 의 세션)에서 확인 화면을 열고,
 * 거기서 「계속」을 누르면 서버가 맡긴 교환 코드가 liftgram://auth 로 돌아온다. 이후는 앱 로그인과 같다(v 를 가진 웹뷰만 교환).
 * @returns 안드로이드 앱 길로 시작했으면 true.
 */
export async function appContinue(): Promise<boolean> {
  if (nativeOS() !== "android" || !canAppSignIn()) return false;
  const { v, ac } = await newHandoffPair();
  const url = `${window.location.origin}/app/continue?ac=${encodeURIComponent(ac)}`;
  return androidAuthTab(url, (cb) => {
    const to = handoffPath(cb, v);
    if (to) window.location.assign(to);
  });
}

/** 넘기기 진입점을 보일 수 있나 — 안드로이드 앱 · 시스템 인증 창이 있을 때 */
export function canAppContinue(): boolean {
  return nativeOS() === "android" && canAppSignIn();
}

/**
 * @plm SRS-095  계정 삭제·로그아웃 뒤 — 네이티브 사본(잠금화면 카드·위젯 요약·조작 대기열)을 비운다.
 * 다리가 없는 껍데기(P0)·웹 브라우저에서는 아무 일도 없다.
 */
export async function clearNativeState(): Promise<void> {
  // [개선] 잠금 카드도 내린다 — clearAll 은 어느 플러그인에도 없어 카드·대기열이 남았다(SPEC-017 REV-008 플랫폼 L-7).
  //   지난 계정의 잠금 중 완료는 버린다(계정이 바뀌면 적용할 곳이 없다).
  const lk = lockPlugin();
  if (lk) {
    await call("sessionEnd").catch(() => {});
    await call("queueClear").catch(() => {});
  }
  const p = nativeOS() ? plugin("LiftgramNative") : null;
  if (!p || typeof p.clearAll !== "function") return;
  await p.clearAll().catch(() => {});
}

/** @plm SRS-095  iOS 앱의 「Apple로 계속」 네이티브 시트를 쓸 수 있나(심사 4.8). */
export function canAppleNative(): boolean {
  return nativeOS() === "ios" && !!plugin("LiftgramNative");
}

/**
 * iOS 「Apple로 계속」 — 네이티브 시트 → 인가 코드 → POST /api/auth/oauth/apple/native → 착지(/auth/complete…)로 이동.
 * 취소하면 아무 일도 없다. linkTicket 은 「계정에 연결」일 때(CreateLinkTicket).
 */
export async function appleNativeSignIn(
  opts: { returnTo?: string; linkTicket?: string } = {},
): Promise<boolean> {
  const native = canAppleNative() ? plugin("LiftgramNative") : null;
  if (!native) return false;
  let code = "";
  try {
    code = String((await native.signInWithApple()).code ?? "");
  } catch (e) {
    if (!isCanceled(e)) console.warn("[app-login] Apple 로그인 실패", e);
    return true;
  }
  if (!code) return true;
  const r = await fetch("/api/auth/oauth/apple/native", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, linkTicket: opts.linkTicket, returnTo: opts.returnTo }),
  }).catch(() => null);
  const to = r?.ok ? ((await r.json().catch(() => ({}))) as { to?: string }).to : undefined;
  window.location.assign(to?.startsWith("/") && !to.startsWith("//") ? to : "/account?err=oauth_internal");
  return true;
}

// ── 시작 화면(SPEC-017 Phase 1 · SRS-054) ─────────────────────────────────────
// 네이티브 스플래시(빈 로고 윤곽) → 웹 부팅 덮개 #app-boot-cover(같은 자리에서 로고가 차오름) → 첫 화면.
// 스플래시는 덮개 바로 뒤 인라인 스크립트(layout.tsx APP_BOOT_HIDE)가 먼저 내린다 — 안드로이드 12+ 는 스플래시가
// 떠 있는 동안 웹뷰 그리기를 막아 requestAnimationFrame 이 돌지 않을 수 있어서 rAF 를 기다리지 않는다.
// 여기 hideNativeSplash 는 그 호출이 빠졌을 때의 두 번째 길(멱등 — 이미 내려갔으면 아무 일 없음).

/** 부팅 덮개를 켜는 표식 — layout.tsx 의 첫 칠하기 전 스크립트가 앱 UA 일 때 html 에 단다. */
export const APP_BOOT_ATTR = "data-app-boot";

/** 네이티브 스플래시를 내린다(앱 아니면·플러그인 없으면 아무것도 안 함 · 예외 금지). */
export async function hideNativeSplash(): Promise<void> {
  const p = plugin("SplashScreen");
  if (!p?.hide) return;
  try {
    await p.hide();
  } catch {
    // 낡은 껍데기·이미 내려감 — 상한(6초)이 내린다
  }
}

/**
 * 첫 화면이 준비되면(셸 하이드레이션 뒤) 부팅 덮개를 200ms 페이드로 내린다. 덮개가 없으면(웹 브라우저) 아무것도 안 한다.
 * 2프레임 기다리는 이유: 하이드레이션 직후 첫 그림이 화면에 올라간 뒤에 걷어야 빈 프레임이 없다.
 */
export function finishAppBootCover(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!root.hasAttribute(APP_BOOT_ATTR)) return;
  void hideNativeSplash();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      root.setAttribute(APP_BOOT_ATTR, "leaving");
      // 걷히는 동안엔 더 이상 «불러오는 중»이 아니다(스크린 리더 · REV-004 웹 L)
      document.getElementById("app-boot-cover")?.setAttribute("aria-busy", "false");
      window.setTimeout(() => root.removeAttribute(APP_BOOT_ATTR), 220);
    }),
  );
}

// ── 잠금화면 운동 카드 다리(SPEC-017 Phase 3 · SRS-096 · ADR-046) ─────────────────────────
// 네이티브 플러그인 `LiftgramLock`(Phase 4 안드로이드 · Phase 5 iOS)과 주고받는 얇은 면. 규칙은 lib/lockBridge.ts 와 core 에 있다.
// 플러그인·메서드가 없으면(낡은 껍데기·웹 브라우저) 전부 no-op — 「앱이 아니면 호출 0」(e2e 가 지킨다).
export const LOCK_PLUGIN = "LiftgramLock";

/** 네이티브가 돌려주는 대기열(drain) — 조작은 아직 ack 안 된 것 전부(ack 됐지만 덮이지 않은 것은 네이티브만 안다). */
export interface LockQueueDrain {
  actions: import("@app/core/domain/lockScreen").LockAction[];
  rest: import("@app/core/domain/lockScreen").RestState | null;
  storeId: string;
}

function lockPlugin(): Plugin | null {
  if (!nativeOS()) return null;
  const p = plugin(LOCK_PLUGIN);
  return p && typeof p.queueDrain === "function" && typeof p.sessionUpdate === "function" ? p : null;
}

/** 이 껍데기에 잠금 카드 다리가 있나. */
export function lockAvailable(): boolean {
  return !!lockPlugin();
}

/** 기능 확인 — 모르면 빈 목록(낡은 껍데기 · 예외 금지). notifications·exactAlarm 은 안드로이드 껍데기 1.1.0+(모르면 null). */
export async function lockInfo(): Promise<{
  version: string;
  features: string[];
  notifications: boolean | null;
  exactAlarm: boolean | null;
}> {
  const p = lockPlugin();
  const none = { version: "", features: [], notifications: null, exactAlarm: null };
  if (!p || typeof p.info !== "function") return none;
  try {
    const r = await p.info();
    return {
      version: String(r.version ?? ""),
      features: Array.isArray(r.features) ? (r.features as string[]) : [],
      notifications: typeof r.notifications === "boolean" ? r.notifications : null,
      exactAlarm: typeof r.exactAlarm === "boolean" ? r.exactAlarm : null,
    };
  } catch {
    return none;
  }
}

async function call(name: string, arg?: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const p = lockPlugin();
  const fn = p?.[name];
  if (typeof fn !== "function") return null;
  return fn.call(p, arg);
}

export const lock = {
  /** 표시 사본을 바꾼다(스냅샷 통째). */
  sessionUpdate: (snapshot: unknown) => call("sessionUpdate", { snapshot }),
  /** 휴식만 즉시(§7) — 스냅샷과 따로. */
  sessionSetRest: (rest: unknown) => call("sessionSetRest", { rest }),
  /** 카드를 내린다(운동 끝 · 고아 카드 정리). */
  sessionEnd: () => call("sessionEnd"),
  queueDrain: async (): Promise<LockQueueDrain | null> => {
    const r = await call("queueDrain");
    if (!r) return null;
    return {
      actions: Array.isArray(r.actions) ? (r.actions as LockQueueDrain["actions"]) : [],
      rest: (r.rest as LockQueueDrain["rest"]) ?? null,
      storeId: String(r.storeId ?? ""),
    };
  },
  queueAck: (ids: string[]) => call("queueAck", { ids }),
  /** 리셋(새 DB·계정 비움) 직후 — 옛 DB 의 조작을 지운다(§6). */
  queueClear: () => call("queueClear"),
  /** 시스템 설정 열기 — 앱 알림(잠금 카드) · 정확한 알람(휴식 끝 시각) · SPEC-017 §11 프로필 「켜기」 */
  openSettings: (kind: "notifications" | "exactAlarm") => call("openSettings", { kind }),
  /** 앱이 앞에 있을 때 잠금 조작이 생기면(알림 버튼 등) — 같은 drain 을 깨운다. */
  onAction: async (fn: () => void): Promise<Listener | null> => {
    const p = lockPlugin();
    if (!p || typeof p.addListener !== "function") return null;
    try {
      return (
        (await (p.addListener as unknown as (ev: string, f: () => void) => Promise<Listener>)(
          "lockAction",
          fn,
        )) ?? null
      );
    } catch {
      return null;
    }
  },
};

/**
 * 잠금 카드의 「앱 열기」·카드 본문(`liftgram://workout`)으로 앱이 열렸다 — 운동 화면으로 보낸다(SPEC-017 REV-008 화면 M-9).
 * 로그인 교환(`liftgram://auth`)은 appSignIn·appContinue 가 같은 디스패처로 듣는다.
 */
export async function onWorkoutDeepLink(fn: () => void): Promise<Listener | null> {
  // [원본] 자기 리스너를 따로 달았다 — SPEC-018 §7 부터 디스패처 하나(onAppLink)
  // const app = nativeOS() ? plugin("App") : null; …addListener("appUrlOpen", (d) => { if (d.url?.startsWith(`${APP_SCHEME}://workout`)) fn(); })
  // [개선]
  const off = await onAppLink("workout", () => fn(), { replayLaunch: true });
  return off ? { remove: async () => off() } : null;
}

/** 앱이 다시 앞으로(resume) · 뒤로(pause) — Capacitor App 플러그인. 없으면 null(visibilitychange 가 대신한다). */
export async function onAppState(fn: (active: boolean) => void): Promise<Listener | null> {
  const app = nativeOS() ? plugin("App") : null;
  if (!app || typeof app.addListener !== "function") return null;
  try {
    return (
      (await (
        app.addListener as unknown as (
          ev: string,
          f: (d: { isActive?: boolean }) => void,
        ) => Promise<Listener>
      )("appStateChange", (d) => fn(d.isActive !== false))) ?? null
    );
  } catch {
    return null;
  }
}

// ── 첫 화면 준비 신호(SPEC-017 Phase 3 · REV-004 웹 M-2) ─────────────────────────────────
// 부팅 덮개는 「루트 하이드레이션」이 아니라 「첫 화면이 데이터를 받음」에 내린다(상한은 AppBootRelease).
let firstScreenReady = false;
const readyListeners = new Set<() => void>();
export function markFirstScreenReady(): void {
  if (firstScreenReady) return;
  firstScreenReady = true;
  for (const fn of readyListeners) fn();
  readyListeners.clear();
}
export function whenFirstScreenReady(fn: () => void): () => void {
  if (firstScreenReady) {
    fn();
    return () => {};
  }
  readyListeners.add(fn);
  return () => readyListeners.delete(fn);
}
