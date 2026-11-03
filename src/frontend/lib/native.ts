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
// import 0 — 클라이언트 전용.

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
  const app = plugin("App");
  const browser = plugin("Browser");
  if (!app || !browser) return false;
  let sub: Listener | null = null;
  sub = (await (
    app.addListener as unknown as (ev: string, fn: (d: { url?: string }) => void) => Promise<Listener>
  )("appUrlOpen", (d) => {
    if (!d.url?.startsWith(`${APP_SCHEME}://auth`)) return;
    void sub?.remove();
    void browser.close().catch(() => {});
    finish(d.url);
  })) as Listener;
  await browser.open({ url });
  return true;
}

/**
 * @plm SRS-095  계정 삭제·로그아웃 뒤 — 네이티브 사본(잠금화면 카드·위젯 요약·조작 대기열)을 비운다.
 * 다리가 없는 껍데기(P0)·웹 브라우저에서는 아무 일도 없다.
 */
export async function clearNativeState(): Promise<void> {
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
