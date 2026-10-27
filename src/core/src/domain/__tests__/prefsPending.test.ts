// @plm SRS-053  동기 설정 쓰기 대기 표식 — 판정 함수(되돌림 경합 2026-10-27) · `bun run test:core`
// 저장소(localStorage·로컬 DB)를 다루는 frontend/lib/prefs.ts 는 브라우저 전용이라, 판정부만 여기서 시나리오로 고정한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  PREFS_PENDING_MAX_AGE_MS,
  mergeAppPrefs,
  parsePendingPrefs,
  planProfilePrefsApply,
  prunePendingPrefs,
  settlePendingPrefs,
} from '../prefsPending';

const KEYS = ['liftgram.effortLogging', 'liftgram.theme', 'liftgram.weeklyGoal'] as const;
const E = 'liftgram.effortLogging';
const T = 'liftgram.theme';

test('되돌림 경합 재현 — 표식이 없으면 디스크의 옛 프로필 값이 방금 끈 값을 덮는다', () => {
  const w = planProfilePrefsApply({ keys: KEYS, profile: { [E]: '1' }, local: { [E]: '0' }, pending: {} });
  assert.deepEqual(w, { [E]: '1' });
});

test('표식이 있는 키는 프로필 값으로 덮지 않는다 · 다른 키는 그대로 내려온다', () => {
  const w = planProfilePrefsApply({
    keys: KEYS,
    profile: { [E]: '1', [T]: 'dark' },
    local: { [E]: '0', [T]: 'light' },
    pending: { [E]: { value: '0', at: 1 } },
  });
  assert.deepEqual(w, { [T]: 'dark' });
});

test('프로필이 없거나 같은 값이면 쓸 것이 없다 · 동기 대상 밖 키는 무시', () => {
  assert.deepEqual(planProfilePrefsApply({ keys: KEYS, profile: null, local: {}, pending: {} }), {});
  assert.deepEqual(
    planProfilePrefsApply({ keys: KEYS, profile: { [E]: '1', other: 'x' }, local: { [E]: '1' }, pending: {} }),
    {},
  );
});

test('settle 은 내가 쓴 표식(value·at 같음)만 지운다 — 쓰는 도중 또 바꾼 더 새 표식은 남는다', () => {
  const mine = { [E]: { value: '0', at: 100 } };
  // 그대로면 지워진다
  assert.deepEqual(settlePendingPrefs({ ...mine, [T]: { value: 'dark', at: 90 } }, mine), {
    [T]: { value: 'dark', at: 90 },
  });
  // 그 사이 다시 켰다(at 이 다름) → 남긴다
  const newer = { [E]: { value: '1', at: 150 } };
  assert.deepEqual(settlePendingPrefs(newer, mine), newer);
  // 같은 값이라도 at 이 다르면 남긴다(더 새 쓰기의 마무리를 기다린다)
  const sameValueLater = { [E]: { value: '0', at: 150 } };
  assert.deepEqual(settlePendingPrefs(sameValueLater, mine), sameValueLater);
});

test('parse — 깨진 JSON·배열·모양 틀림·동기 대상 밖 키는 버린다(던지지 않는다)', () => {
  assert.deepEqual(parsePendingPrefs(null, KEYS), {});
  assert.deepEqual(parsePendingPrefs('{깨짐', KEYS), {});
  assert.deepEqual(parsePendingPrefs('[1,2]', KEYS), {});
  assert.deepEqual(parsePendingPrefs('"x"', KEYS), {});
  const raw = JSON.stringify({
    [E]: { value: '0', at: 5 },
    [T]: { value: 3, at: 5 }, // 값이 문자열 아님
    'liftgram.weeklyGoal': { value: '4' }, // at 없음
    'onboarding_seen_v1': { value: 'yes', at: 5 }, // 동기 대상 아님
  });
  assert.deepEqual(parsePendingPrefs(raw, KEYS), { [E]: { value: '0', at: 5 } });
});

test('prune — 7일 넘은 표식은 버리고, 미래 시각(시계 되돌림)은 남긴다', () => {
  const now = 1_000_000_000_000;
  const p = {
    [E]: { value: '0', at: now - PREFS_PENDING_MAX_AGE_MS - 1 },
    [T]: { value: 'dark', at: now - 1000 },
    'liftgram.weeklyGoal': { value: '4', at: now + 60_000 },
  };
  const { kept, dropped } = prunePendingPrefs(p, now);
  assert.deepEqual(dropped, [E]);
  assert.deepEqual(Object.keys(kept).sort(), [T, 'liftgram.weeklyGoal'].sort());
  // 경계: 딱 7일은 남긴다
  assert.deepEqual(prunePendingPrefs({ [E]: { value: '0', at: now - PREFS_PENDING_MAX_AGE_MS } }, now).dropped, []);
});

test('merge — 다른 키는 그대로 · 같은 값이면 changed=false(부팅 마무리가 동기를 깨우지 않게)', () => {
  assert.deepEqual(mergeAppPrefs({ [T]: 'dark', [E]: '1' }, { [E]: '0' }), {
    next: { [T]: 'dark', [E]: '0' },
    changed: true,
  });
  assert.equal(mergeAppPrefs({ [E]: '0' }, { [E]: '0' }).changed, false);
  assert.deepEqual(mergeAppPrefs(null, { [E]: '1' }), { next: { [E]: '1' }, changed: true });
});

test('흐름 — 끄기 → (쓰기 전 새로고침) 부팅: 표식 덕에 꺼진 값 유지 → 마무리 쓰기 → 표식 정리 → 그 뒤엔 프로필 값을 다시 받는다', () => {
  let pending = { [E]: { value: '0', at: 10 } };
  const local: Record<string, string | null> = { [E]: '0' };
  // 부팅: 디스크 프로필은 옛 값 "1"
  assert.deepEqual(planProfilePrefsApply({ keys: KEYS, profile: { [E]: '1' }, local, pending }), {});
  // 마무리 쓰기
  const { next, changed } = mergeAppPrefs({ [E]: '1' }, { [E]: pending[E].value });
  assert.equal(changed, true);
  assert.equal(next[E], '0');
  pending = settlePendingPrefs(pending, { [E]: { value: '0', at: 10 } }) as typeof pending;
  assert.deepEqual(pending, {});
  // 이후 다른 기기에서 켠 값이 내려오면 그대로 받는다
  assert.deepEqual(planProfilePrefsApply({ keys: KEYS, profile: { [E]: '1' }, local, pending }), { [E]: '1' });
});
