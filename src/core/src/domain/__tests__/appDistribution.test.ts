// [원본] import { describe, expect, test } from 'bun:test'; — make verify 는 node:test 로 돈다
import { describe, expect, test } from './expectShim';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  RELEASE_CERT_SHA256,
  appIntentUrl,
  recordCheckVerdict,
  browserKind,
  decideOffer,
  dismissDays,
  type Latest,
  nextDismiss,
  offerKey,
  parseLatest,
  type Shell,
  sizeLabel,
  updateErrorCode,
  webOs,
} from '../appDistribution';

const SHA = '76a28bfb81c80fa25e0f26aa92f5775f9e3f2920f6e37fb5cb04da6150bd2583';
const CERT = '7d124a8d64e38b3f2ed6e4308188d336d18f87f23f0a42a3fa7e1e23fae780b8';
const OTHER = '50ef6650b9c6345aacbde2e998fb1808c3f9be0dd41790b5b46435b926ac91a4';
const JSON_OK = {
  v: 1,
  versionName: '1.2.1',
  versionCode: 4,
  url: '/downloads/liftgram-1.2.1-4-76a28bfb.apk',
  sha256: SHA,
  size: 3202532,
  certSha256: CERT,
  minVersionCode: 1,
  minSignedVersionCode: 3,
  builtAt: '2026-11-03T08:20:42Z',
  commit: 'cf5b46d',
};
const L = parseLatest(JSON_OK) as Latest;
const NOW = 1_800_000_000_000;
const ctx = { activeWorkout: false, loggedIn: true, now: NOW };

const app = (o: Partial<Extract<Shell, { kind: 'app' }>> = {}): Shell => ({
  kind: 'app',
  os: 'android',
  bridge: 'ready',
  versionCode: 3,
  certSha256: CERT,
  expectedCertSha256: CERT,
  installer: null,
  ...o,
});
const web = (o: Partial<Extract<Shell, { kind: 'web' }>> = {}): Shell => ({
  kind: 'web',
  os: 'android',
  browser: 'chrome',
  standalone: true,
  ...o,
});

describe('parseLatest', () => {
  test('맞는 모양', () => {
    expect(L.versionCode).toBe(4);
    expect(Object.keys(L)).not.toContain('commit'); // 쓰지 않는 값은 버린다
  });
  test('틀린 모양은 null', () => {
    const bad: Array<Record<string, unknown>> = [
      { v: 2 },
      { versionCode: 0 },
      { versionCode: 4.5 },
      { versionCode: '4' },
      { minVersionCode: 5 }, // > versionCode
      { minSignedVersionCode: 5 },
      { url: 'https://evil.com/liftgram-1.2.1-4-76a28bfb.apk' },
      { url: '/downloads/../api/x.apk' },
      { url: '/downloads/liftgram-1.2.1-4-00000000.apk' }, // 이름 해시 ≠ sha256
      { sha256: SHA.toUpperCase() },
      { size: 0 },
      { size: 300 * 1024 * 1024 },
      { certSha256: 'x' },
      { versionName: '<script>' },
    ];
    for (const b of bad) expect(parseLatest({ ...JSON_OK, ...b })).toBeNull();
    expect(parseLatest(null)).toBeNull();
    expect(parseLatest('x')).toBeNull();
  });
});

describe('decideOffer — 규칙 순서', () => {
  test('1 못 읽음 · 2 운동 중', () => {
    expect(decideOffer(app(), null, ctx).kind).toBe('none');
    expect(decideOffer(app({ versionCode: 1 }), L, { ...ctx, activeWorkout: true })).toEqual({ kind: 'none', why: 'workout' });
    expect(decideOffer(web(), L, { ...ctx, activeWorkout: true }).kind).toBe('none');
  });
  test('3 iOS 앱은 언제나 none(재설치 안내 없음)', () => {
    expect(decideOffer(app({ os: 'ios', bridge: 'missing' }), L, ctx)).toEqual({ kind: 'none', why: 'ios-app' });
  });
  test('4 안드로이드 앱', () => {
    expect(decideOffer(app({ bridge: 'missing', versionCode: null }), L, ctx).kind).toBe('reinstall'); // 옛 앱
    expect(decideOffer(app({ bridge: 'failed' }), L, ctx).kind).toBe('none');
    expect(decideOffer(app({ installer: 'com.android.vending' }), L, ctx)).toEqual({ kind: 'none', why: 'play' });
    expect(decideOffer(app({ versionCode: 2, certSha256: null }), L, ctx).kind).toBe('reinstall'); // < minSigned
    expect(decideOffer(app({ certSha256: OTHER }), L, ctx).kind).toBe('reinstall'); // 다른 키
    expect(decideOffer(app({ certSha256: OTHER.toUpperCase().replace(/(..)/g, '$1:').slice(0, -1) }), L, ctx).kind).toBe(
      'reinstall',
    );
    // 지문 모름 → 버전만
    expect(decideOffer(app({ certSha256: null }), L, ctx)).toEqual({ kind: 'update', mandatory: false, latest: L });
    // 같은 지문(콜론·대문자)
    const colon = CERT.toUpperCase().replace(/(..)/g, '$1:').slice(0, -1);
    expect(decideOffer(app({ certSha256: colon }), L, ctx).kind).toBe('update');
    // 최신 이상(되돌리기 배포 포함)
    expect(decideOffer(app({ versionCode: 4 }), L, ctx)).toEqual({ kind: 'none', why: 'latest' });
    expect(decideOffer(app({ versionCode: 9 }), L, ctx).kind).toBe('none');
    // 꼭 해야 하는 업데이트
    const L2 = { ...L, minVersionCode: 4 };
    expect(decideOffer(app(), L2, ctx)).toEqual({ kind: 'update', mandatory: true, latest: L2 });
    // 앱 안 상수가 없는 판(키 전) — json 지문으로 비교
    expect(decideOffer(app({ expectedCertSha256: null }), L, ctx).kind).toBe('update');
    expect(decideOffer(app({ expectedCertSha256: null, certSha256: OTHER }), L, ctx).kind).toBe('reinstall');
    // 개발 빌드 — 지문이 달라도 재설치 안내 없음
    expect(decideOffer(app({ debug: true, certSha256: OTHER }), L, ctx)).toEqual({ kind: 'none', why: 'debug' });
    // 로그인 안 해도 앱 업데이트는 안내한다
    expect(decideOffer(app(), L, { ...ctx, loggedIn: false }).kind).toBe('update');
  });
  test('5 웹', () => {
    expect(decideOffer(web(), L, ctx)).toEqual({ kind: 'switch', latest: L, manual: false });
    expect(decideOffer(web({ standalone: false }), L, ctx).kind).toBe('switch'); // 크롬 탭도
    expect(decideOffer(web({ browser: 'samsung' }), L, ctx)).toEqual({ kind: 'switch', latest: L, manual: true });
    expect(decideOffer(web({ browser: 'other' }), L, ctx)).toMatchObject({ kind: 'switch', manual: true });
    expect(decideOffer(web({ browser: 'inapp' }), L, ctx)).toEqual({ kind: 'none', why: 'inapp' });
    expect(decideOffer(web({ os: 'ios' }), L, ctx).kind).toBe('none');
    expect(decideOffer(web({ os: 'other' }), L, ctx).kind).toBe('none');
    expect(decideOffer(web(), L, { ...ctx, loggedIn: false })).toEqual({ kind: 'none', why: 'logged-out' });
  });
});

describe('「나중에」', () => {
  test('열쇠 · 기간 3 → 7 → 30', () => {
    expect(offerKey('update', 4)).toBe('update:4');
    expect([0, 1, 2, 5].map(dismissDays)).toEqual([3, 7, 30, 30]);
    const a = nextDismiss(null, 'switch:4', NOW);
    expect(a.count).toBe(0);
    expect(a.until).toBe(NOW + 3 * 86_400_000);
    const b = nextDismiss(a, 'switch:4', NOW);
    expect(b.count).toBe(1);
    expect(b.until).toBe(NOW + 7 * 86_400_000);
    expect(nextDismiss(b, 'switch:4', NOW).until).toBe(NOW + 30 * 86_400_000);
    expect(nextDismiss(b, 'switch:5', NOW).count).toBe(0); // 새 버전이면 처음부터
  });
  test('숨김 · 새 버전 · 꼭 해야 하는 업데이트는 숨기지 않음 · 다시 보지 않기는 switch 만', () => {
    const d = { key: 'update:4', until: NOW + 1000 };
    expect(decideOffer(app(), L, { ...ctx, dismissed: d })).toEqual({ kind: 'none', why: 'dismissed' });
    expect(decideOffer(app(), L, { ...ctx, dismissed: { ...d, until: NOW - 1 } }).kind).toBe('update'); // 기간 지남
    expect(decideOffer(app(), { ...L, versionCode: 5, url: L.url }, { ...ctx, dismissed: d }).kind).toBe('update'); // 새 버전
    expect(decideOffer(app(), { ...L, minVersionCode: 4 }, { ...ctx, dismissed: d }).kind).toBe('update'); // 필수
    const never = nextDismiss(null, 'switch:4', NOW, true);
    expect(never.never).toBe(true);
    expect(decideOffer(web(), L, { ...ctx, now: NOW + 365 * 86_400_000, dismissed: never }).kind).toBe('none');
    expect(nextDismiss(null, 'update:4', NOW, true).never).toBe(false); // update 에는 없음
  });
});

describe('브라우저·주소·크기·코드', () => {
  test('UA', () => {
    const chrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
    expect(browserKind(chrome)).toBe('chrome');
    expect(webOs(chrome)).toBe('android');
    expect(browserKind(`${chrome.replace('Chrome/130', 'SamsungBrowser/26.0 Chrome/130')}`)).toBe('samsung');
    expect(browserKind(`${chrome} KAKAOTALK 10.8.0`)).toBe('inapp');
    expect(browserKind(chrome.replace('Android 14; Pixel 8)', 'Android 14; Pixel 8; wv)'))).toBe('inapp');
    expect(browserKind(`${chrome} EdgA/130 Edg/130`)).toBe('other');
    expect(browserKind('Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0')).toBe('other');
    expect(webOs('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(webOs('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('other');
  });
  test('intent 주소 — 코드 없음 · package · fallback /app', () => {
    const u = appIntentUrl('https://liftgram.tarae.org');
    expect(u).toBe(
      'intent://start#Intent;scheme=liftgram;package=org.tarae.liftgram;S.browser_fallback_url=https%3A%2F%2Fliftgram.tarae.org%2Fapp;end',
    );
    expect(u).not.toContain('code');
  });
  test('크기 · 코드표', () => {
    expect(sizeLabel(3202532)).toBe('3.1MB');
    expect(sizeLabel(15 * 1024 * 1024)).toBe('15MB');
    expect(updateErrorCode('hash')).toBe('hash');
    expect(updateErrorCode('aborted')).toBe('aborted');
    expect(updateErrorCode('HTTP 500')).toBe('failure');
    expect(updateErrorCode(undefined)).toBe('failure');
  });
});

describe('REV-013 반영', () => {
  test('지문이 맞으면 minSignedVersionCode 로 재설치를 권하지 않는다 · 지문을 모를 때만 버전으로', () => {
    expect(decideOffer(app({ versionCode: 2 }), L, ctx)).toEqual({ kind: 'update', mandatory: false, latest: L });
    expect(decideOffer(app({ versionCode: 2, certSha256: null }), L, ctx).kind).toBe('reinstall');
  });
  test('새 판 json 지문이 앱 상수와 다르면 업데이트를 권하지 않는다(네이티브가 늘 signature 로 거절)', () => {
    const bad = { ...L, certSha256: OTHER };
    expect(decideOffer(app(), bad, ctx)).toEqual({ kind: 'none', why: 'json-cert' });
    expect(decideOffer(app(), { ...bad, minVersionCode: 4 }, ctx).kind).toBe('none'); // 필수여도
    expect(decideOffer(app({ certSha256: OTHER }), bad, ctx).kind).toBe('reinstall'); // 설치본이 다른 키면 재설치가 먼저
  });
  test('경계 — mandatory 는 versionCode < min 만 · 숨김은 until 순간에 풀림 · 개발 빌드라도 같은 지문이면 업데이트', () => {
    expect(decideOffer(app({ versionCode: 3 }), { ...L, minVersionCode: 3 }, ctx)).toMatchObject({ kind: 'update', mandatory: false });
    const d = { key: 'update:4', until: NOW };
    expect(decideOffer(app(), L, { ...ctx, dismissed: d }).kind).toBe('update');
    expect(decideOffer(app({ debug: true }), L, ctx).kind).toBe('update');
  });
  test('다시 보지 않기는 새 판에도 유지', () => {
    const never = nextDismiss(null, 'switch:4', NOW, true);
    const L5 = { ...L, versionCode: 5 };
    expect(decideOffer(web(), L5, { ...ctx, dismissed: never }).kind).toBe('none');
    expect(decideOffer(app(), L5, { ...ctx, dismissed: never }).kind).toBe('update'); // 업데이트는 숨기지 않음
  });
  test('안드로이드 엣지 · 출시 키 상수 = src/mobile/release-cert.json', () => {
    const chrome = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
    expect(browserKind(`${chrome} EdgA/130.0`)).toBe('other');
    const f = fileURLToPath(new URL('../../../../mobile/release-cert.json', import.meta.url));
    expect(RELEASE_CERT_SHA256).toBe(JSON.parse(readFileSync(f, 'utf8')).sha256);
  });
  test('기록 확인 — 조건마다 막는다(위에서부터)', () => {
    const ok = {
      loggedIn: true,
      ownerConflict: false,
      online: true,
      activeWorkout: false,
      elsewhere: false,
      syncOk: true,
      lastSuccessAt: 1000,
      startedAt: 1000,
      pending: 0,
      prefsPending: false,
      outboxPending: 0,
      uploaded: 7,
    };
    expect(recordCheckVerdict(ok)).toEqual({ ok: true, uploaded: 7 });
    const cases: Array<[Partial<typeof ok> & Record<string, unknown>, string]> = [
      [{ loggedIn: false }, 'logged-out'],
      [{ ownerConflict: true }, 'conflict'],
      [{ online: false }, 'offline'],
      [{ activeWorkout: true }, 'workout'],
      [{ elsewhere: true }, 'elsewhere'],
      [{ syncOk: false }, 'sync-failed'],
      [{ lastSuccessAt: null }, 'sync-failed'],
      [{ lastSuccessAt: 999 }, 'sync-failed'], // 이번 확인보다 먼저 시작한 동기
      [{ prefsPending: true }, 'prefs'],
      [{ pending: 2 }, 'pending'],
      [{ pending: -1 }, 'pending'], // 못 셈 = 통과 아님
      [{ outboxPending: 1 }, 'outbox'],
    ];
    for (const [patch, why] of cases) expect(recordCheckVerdict({ ...ok, ...patch } as typeof ok)).toMatchObject({ ok: false, why });
    expect(recordCheckVerdict({ ...ok, pending: 3 })).toEqual({ ok: false, why: 'pending', count: 3 });
    expect(recordCheckVerdict({ ...ok, pending: -1 })).toEqual({ ok: false, why: 'pending', count: 0 });
  });
});
