// SPEC-018 §6  앱 배포 안내 판정 — 화면(배너·프로필·시트·/app)이 부르는 순수 함수(DOM·네트워크 없음).
//
// 무엇을 정하나: 지금 이 사람에게 ① 새 앱 설치 파일 업데이트(update) ② 한 번 지우고 다시 설치(reinstall — 옛 키 앱)
// ③ 웹(PWA·크롬)에서 전용 앱으로 바꾸기(switch) 중 무엇을 권할지, 아니면 아무것도(none).
// 서버의 `/downloads/android.json` 은 원격 값이라 parseLatest 가 모양을 좁힌 뒤에만 쓴다.

export type BrowserKind = 'chrome' | 'samsung' | 'inapp' | 'other';

export type Shell =
  | { kind: 'web'; os: 'android' | 'ios' | 'other'; browser: BrowserKind; standalone: boolean }
  | {
      kind: 'app';
      os: 'android' | 'ios';
      /** ready = LiftgramUpdate 다리 있음 · missing = 옛 앱(1.0.x·1.1.x) · failed = 호출 오류 */
      bridge: 'ready' | 'missing' | 'failed';
      versionCode: number | null;
      certSha256: string | null;
      expectedCertSha256: string | null;
      installer: string | null;
      /** 개발(디버그) 빌드 — 지문이 달라도 재설치를 권하지 않는다 */
      debug?: boolean;
    };

export type Latest = {
  v: 1;
  versionName: string;
  versionCode: number;
  minVersionCode: number;
  minSignedVersionCode: number;
  url: string;
  sha256: string;
  size: number;
  certSha256: string;
};

export type OfferKind = 'update' | 'reinstall' | 'switch';

export type Offer =
  | { kind: 'none'; why: string }
  | { kind: 'update'; mandatory: boolean; latest: Latest }
  | { kind: 'reinstall'; latest: Latest }
  | { kind: 'switch'; latest: Latest; manual: boolean };

const HEX64 = /^[0-9a-f]{64}$/;
// 배포 스크립트가 만드는 이름만(네이티브 ApkCheck.APK_PATH 와 같은 규칙)
const APK_PATH = /^\/downloads\/liftgram-[0-9A-Za-z.]+-[0-9]+-[0-9a-f]{8}\.apk$/;
const VERSION_NAME = /^[0-9]+(\.[0-9]+){0,3}([-+][0-9A-Za-z.]+)?$/;
const MAX_SIZE = 200 * 1024 * 1024;
const MAX_VC = 2_100_000_000; // 안드로이드 versionCode 상한(2100000000)

const isInt = (n: unknown, min: number, max: number): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;

/** 스키마 검사 — v===1 · 정수 범위 · min ≤ versionCode · 같은 사이트 APK 경로 · 64 hex. 아니면 null. */
export function parseLatest(json: unknown): Latest | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.versionName !== 'string' || !VERSION_NAME.test(o.versionName) || o.versionName.length > 32) return null;
  if (!isInt(o.versionCode, 1, MAX_VC)) return null;
  if (!isInt(o.minVersionCode, 1, o.versionCode)) return null;
  if (!isInt(o.minSignedVersionCode, 1, o.versionCode)) return null;
  if (typeof o.url !== 'string' || !APK_PATH.test(o.url)) return null;
  if (typeof o.sha256 !== 'string' || !HEX64.test(o.sha256)) return null;
  if (!o.url.endsWith(`-${o.sha256.slice(0, 8)}.apk`)) return null; // 이름의 해시 앞 8자 = sha256 앞 8자
  if (!isInt(o.size, 1, MAX_SIZE)) return null;
  if (typeof o.certSha256 !== 'string' || !HEX64.test(o.certSha256)) return null;
  return {
    v: 1,
    versionName: o.versionName,
    versionCode: o.versionCode,
    minVersionCode: o.minVersionCode,
    minSignedVersionCode: o.minSignedVersionCode,
    url: o.url,
    sha256: o.sha256,
    size: o.size,
    certSha256: o.certSha256,
  };
}

/** 지문 비교용(소문자·콜론 없음) */
export function normFp(fp: string | null | undefined): string {
  return (fp ?? '').replace(/:/g, '').trim().toLowerCase();
}

export const PLAY_INSTALLER = 'com.android.vending';

/**
 * 출시 키 지문 — `src/mobile/release-cert.json`(src/scripts/android-release-key.sh 가 만든다)과 같은 값이어야 한다(단위 시험이 대조).
 * 웹 이미지에는 mobile/ 이 없어 여기 둔다. 공개 /app 은 json 지문이 이 값과 다르면 받기를 숨긴다(REV-013 보안 M-3).
 */
export const RELEASE_CERT_SHA256 = '7d124a8d64e38b3f2ed6e4308188d336d18f87f23f0a42a3fa7e1e23fae780b8';

export type Dismissed = { key: string; until: number; never?: boolean } | null;

export type DecideCtx = {
  activeWorkout: boolean;
  loggedIn: boolean;
  /** 배너 「나중에」 — 프로필·/app 은 이 값을 넘기지 않는다(늘 보인다) */
  dismissed?: Dismissed;
  now: number;
};

/** 「나중에」 열쇠 — 새 버전이면 다시 보인다 */
export function offerKey(kind: OfferKind, versionCode: number): string {
  return `${kind}:${versionCode}`;
}

const DAY = 24 * 60 * 60 * 1000;
/** 숨기는 기간 — 같은 열쇠로 n번째 「나중에」(0부터): 3일 → 7일 → 30일 */
export function dismissDays(count: number): number {
  return count <= 0 ? 3 : count === 1 ? 7 : 30;
}

/** 「나중에」를 눌렀다 — 다음 숨김 기록. 다른 열쇠면 처음부터. `never` 는 switch 에만. */
export function nextDismiss(
  prev: { key: string; count: number } | null,
  key: string,
  now: number,
  never = false,
): { key: string; count: number; until: number; never: boolean } {
  const count = prev && prev.key === key ? prev.count + 1 : 0;
  const allowNever = never && key.startsWith('switch:');
  return { key, count, until: now + dismissDays(count) * DAY, never: allowNever };
}

function hidden(d: Dismissed | undefined, key: string, now: number): boolean {
  // [원본] 열쇠가 다르면(새 판) 「다시 보지 않기」도 풀렸다 — 약속한 문구와 달랐다(REV-013 화면 M-7)
  // if (!d || d.key !== key) return false;
  // if (d.never) return key.startsWith('switch:');
  // [개선] 「다시 보지 않기」는 판과 상관없이 바꾸기 권유 전체를 숨긴다
  if (!d) return false;
  if (d.never) return d.key.startsWith('switch:') && key.startsWith('switch:');
  if (d.key !== key) return false;
  return now < d.until;
}

/** 판정(규칙은 위에서부터 먼저 맞는 것 — SPEC-018 §6) */
export function decideOffer(shell: Shell, latest: Latest | null, ctx: DecideCtx): Offer {
  if (!latest) return { kind: 'none', why: 'no-latest' };
  if (ctx.activeWorkout) return { kind: 'none', why: 'workout' };
  let offer: Offer;
  if (shell.kind === 'app') {
    if (shell.os !== 'android') return { kind: 'none', why: 'ios-app' };
    if (shell.bridge === 'missing') offer = { kind: 'reinstall', latest };
    else if (shell.bridge === 'failed') return { kind: 'none', why: 'bridge-failed' };
    else if (shell.installer === PLAY_INSTALLER) return { kind: 'none', why: 'play' };
    else if (shell.versionCode === null) return { kind: 'none', why: 'no-version' };
    else {
      const cert = normFp(shell.certSha256);
      const expected = normFp(shell.expectedCertSha256) || normFp(latest.certSha256);
      const wrongKey = cert !== '' && cert !== expected;
      if (shell.debug && wrongKey) return { kind: 'none', why: 'debug' };
      // [원본] if (shell.versionCode < latest.minSignedVersionCode || wrongKey) offer = { kind: 'reinstall', latest };
      // [개선 REV-013 보안 M-4] 지문이 맞는 앱에는 minSignedVersionCode 로 재설치를 권하지 않는다 — json 값 하나의 실수가
      // 정상 앱 전체에 「지우고 다시 설치」(기기 DB 삭제)를 권하지 않게. 지문을 모를 때만 버전으로 가른다.
      const legacy = cert === '' && shell.versionCode < latest.minSignedVersionCode;
      if (wrongKey || legacy) offer = { kind: 'reinstall', latest };
      else if (shell.versionCode >= latest.versionCode) return { kind: 'none', why: 'latest' };
      // [개선 REV-013 계약 H-3] 새 판 APK 의 지문이 이 앱의 상수와 다르면 네이티브가 늘 signature 로 거절한다 —
      // 받을 때마다 실패하는 「업데이트」(필수면 숨길 수도 없음)를 권하지 않는다(배포 설정 오류 · 서버에서 고칠 일).
      else if (normFp(latest.certSha256) !== expected) return { kind: 'none', why: 'json-cert' };
      else offer = { kind: 'update', mandatory: shell.versionCode < latest.minVersionCode, latest };
    }
  } else {
    if (shell.os !== 'android') return { kind: 'none', why: 'not-android' };
    if (!ctx.loggedIn) return { kind: 'none', why: 'logged-out' };
    if (shell.browser === 'inapp') return { kind: 'none', why: 'inapp' };
    offer = { kind: 'switch', latest, manual: shell.browser !== 'chrome' };
  }
  const key = offerKey(offer.kind, latest.versionCode);
  // 꼭 해야 하는 업데이트는 숨기지 않는다
  if (!(offer.kind === 'update' && offer.mandatory) && hidden(ctx.dismissed, key, ctx.now)) {
    return { kind: 'none', why: 'dismissed' };
  }
  return offer;
}

/** 브라우저 갈래 — UA 로(삼성 인터넷 · 인앱(카카오·네이버·인스타·페북·라인·웹뷰) · 크롬 · 그 밖) */
export function browserKind(ua: string): BrowserKind {
  const u = ua || '';
  if (/KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|everytimeApp|; wv\)/i.test(u)) return 'inapp';
  if (/SamsungBrowser/i.test(u)) return 'samsung';
  // [원본] … !/Edg\/|OPR\/|… — 안드로이드 엣지(EdgA/)가 크롬으로 판정됐다(REV-013 화면 L-7)
  if (/Chrome\/\d+/i.test(u) && !/EdgA?\/|OPR\/|Whale\/|YaBrowser|Firefox\//i.test(u)) return 'chrome';
  return 'other';
}

/** 운영체제 갈래(웹) */
export function webOs(ua: string): 'android' | 'ios' | 'other' {
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  return 'other';
}

/** PWA → 앱 열기 주소 — 코드를 싣지 않는다 · 앱이 없으면 /app 으로(SPEC-018 §8) */
export function appIntentUrl(origin: string): string {
  return `intent://start#Intent;scheme=liftgram;package=org.tarae.liftgram;S.browser_fallback_url=${encodeURIComponent(`${origin}/app`)};end`;
}

/** 크기 표시 — 「약 7MB」 */
export function sizeLabel(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 10 ? `${mb.toFixed(1)}MB` : `${Math.round(mb)}MB`;
}

/** 다리(LiftgramUpdate) 실패 코드 — 네이티브 ApkCheck.ERROR_CODES 와 같은 닫힌 표 + 설치 결과 상태 */
export const UPDATE_ERROR_CODES = [
  'origin',
  'invalid',
  'busy',
  'cancelled',
  'network',
  'size',
  'hash',
  'space',
  'storage',
  'missing',
  'store',
  'package',
  'downgrade',
  'signature',
  'notAllowed',
  'failure',
  // installResult 상태
  'aborted',
  'blocked',
  'conflict',
  'incompatible',
  'timeout',
  'expired',
] as const;
export type UpdateErrorCode = (typeof UPDATE_ERROR_CODES)[number];

/** 표 밖의 값 → failure */
export function updateErrorCode(c: unknown): UpdateErrorCode {
  return (UPDATE_ERROR_CODES as readonly string[]).includes(c as string) ? (c as UpdateErrorCode) : 'failure';
}

// ── 기록 확인(바꾸기·재설치 1단계 — SPEC-018 §8 · REV-013 시험 H-1: 판정만 순수 함수로) ─────────────────

export type RecordCheckFail =
  | 'logged-out'
  | 'conflict'
  | 'offline'
  | 'workout'
  | 'elsewhere'
  | 'sync-failed'
  | 'pending'
  | 'prefs'
  | 'outbox';

export type RecordCheck = { ok: true; uploaded: number } | { ok: false; why: RecordCheckFail; count?: number };

export type RecordCheckInput = {
  loggedIn: boolean;
  ownerConflict: boolean;
  online: boolean;
  activeWorkout: boolean;
  elsewhere: boolean;
  /** 이번 확인에서 부른 동기가 성공했나 */
  syncOk: boolean;
  /** 동기 엔진이 적은 마지막 성공 시각 · 이번 확인을 시작한 시각 */
  lastSuccessAt: number | null;
  startedAt: number;
  /** 미동기 사용자 변경 수(못 셌으면 -1) */
  pending: number;
  prefsPending: boolean;
  outboxPending: number;
  uploaded: number;
};

/** 위에서부터 먼저 걸리는 이유 하나 — 모두 통과해야 ok */
export function recordCheckVerdict(i: RecordCheckInput): RecordCheck {
  if (!i.loggedIn) return { ok: false, why: 'logged-out' };
  if (i.ownerConflict) return { ok: false, why: 'conflict' };
  if (!i.online) return { ok: false, why: 'offline' };
  if (i.activeWorkout) return { ok: false, why: 'workout' };
  if (i.elsewhere) return { ok: false, why: 'elsewhere' };
  if (!i.syncOk || i.lastSuccessAt == null || i.lastSuccessAt < i.startedAt) return { ok: false, why: 'sync-failed' };
  if (i.prefsPending) return { ok: false, why: 'prefs' };
  if (i.pending !== 0) return { ok: false, why: 'pending', count: Math.max(i.pending, 0) };
  if (i.outboxPending > 0) return { ok: false, why: 'outbox', count: i.outboxPending };
  return { ok: true, uploaded: i.uploaded };
}
