// 처방 어휘 — 파서·캐스케이드·휴식 테이블 순수 테스트 (SRS-043) — `npm test`. @plm SRS-043
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizePrescriptionValue,
  suggestNextSetWeightKg,
  restSecondsForSetType,
  repRangeLabel,
} from '../prescription';

test('sanitizePrescriptionValue: 정상 배열은 타입·클램프 정규화, 빈/불량은 null', () => {
  const ok = sanitizePrescriptionValue([
    { setType: 'warmup', targetRir: 6, repMin: 6, repMax: 6, loadHint: 'light' },
    { setType: 'top', targetRir: 1, repMin: 4, repMax: 7, loadHint: 'heavy' },
  ]);
  assert.equal(ok?.length, 2);
  assert.equal(ok?.[0].setType, 'warmup');
  assert.equal(ok?.[1].loadHint, 'heavy');
  assert.equal(sanitizePrescriptionValue([]), null);
  assert.equal(sanitizePrescriptionValue('garbage'), null);
  assert.equal(sanitizePrescriptionValue(null), null);
  assert.equal(sanitizePrescriptionValue(42), null);
});

test('sanitizePrescriptionValue: RIR 클램프(0~6)·불량 필드 무해화·미지의 타입은 normal', () => {
  const p = sanitizePrescriptionValue([
    { setType: 'top', targetRir: 99, repMin: -3, repMax: 'x', loadHint: 'ultra' },
    { setType: 'weird', targetRir: -1 },
  ]);
  assert.equal(p?.[0].targetRir, 6); // 상한 클램프
  assert.equal(p?.[0].repMin, null); // 음수 → null
  assert.equal(p?.[0].repMax, null);
  assert.equal(p?.[0].loadHint, null);
  assert.equal(p?.[1].setType, 'normal');
  assert.equal(p?.[1].targetRir, null); // 음수 RIR → null(num 가드)
});

test('suggestNextSetWeightKg: 웜업 래더 +12% (20 → 22.4 — RapidOverload 실측 재현)', () => {
  const s = suggestNextSetWeightKg({ prevWeightKg: 20, prevType: 'warmup', nextType: 'warmup' });
  assert.equal(s?.weightKg, 22.4);
  assert.equal(s?.reasonKey, 'prescription.reason.warmupLadder');
});

test('suggestNextSetWeightKg: 웜업→탑 +35%, 탑→백오프 −15%, 탑→탑 유지', () => {
  assert.equal(suggestNextSetWeightKg({ prevWeightKg: 40, prevType: 'warmup', nextType: 'top' })?.weightKg, 54);
  assert.equal(suggestNextSetWeightKg({ prevWeightKg: 100, prevType: 'top', nextType: 'backoff' })?.weightKg, 85);
  assert.equal(suggestNextSetWeightKg({ prevWeightKg: 100, prevType: 'top', nextType: 'top' })?.weightKg, 100);
});

test('suggestNextSetWeightKg: 경계 — 0/음수/NaN/타입없음/규칙 밖 조합은 null', () => {
  assert.equal(suggestNextSetWeightKg({ prevWeightKg: 0, prevType: 'warmup', nextType: 'warmup' }), null);
  assert.equal(suggestNextSetWeightKg({ prevWeightKg: -5, prevType: 'top', nextType: 'backoff' }), null);
  assert.equal(suggestNextSetWeightKg({ prevWeightKg: NaN, prevType: 'top', nextType: 'top' }), null);
  assert.equal(suggestNextSetWeightKg({ prevWeightKg: 50, prevType: null, nextType: 'top' }), null);
  assert.equal(suggestNextSetWeightKg({ prevWeightKg: 50, prevType: 'backoff', nextType: 'top' }), null); // 역행 조합 규칙 없음
});

test('suggestNextSetWeightKg: 0.1kg 반올림(소수점 제안 — UI가 근접 실중량 안내)', () => {
  const s = suggestNextSetWeightKg({ prevWeightKg: 23.3, prevType: 'warmup', nextType: 'warmup' });
  assert.equal(s?.weightKg, 26.1); // 23.3*1.12=26.096 → 26.1
});

test('restSecondsForSetType: 타입별 권장(웜업45/탑180/백오프120), 비처방은 fallback', () => {
  assert.equal(restSecondsForSetType('warmup', 120), 45);
  assert.equal(restSecondsForSetType('top', 120), 180);
  assert.equal(restSecondsForSetType('backoff', 90), 120);
  assert.equal(restSecondsForSetType('normal', 120), 120);
  assert.equal(restSecondsForSetType(null, 90), 90);
  assert.equal(restSecondsForSetType(undefined, 60), 60);
});

test('repRangeLabel: 범위/단일/부분/없음', () => {
  assert.equal(repRangeLabel(4, 7), '4-7');
  assert.equal(repRangeLabel(8, 8), '8');
  assert.equal(repRangeLabel(5, null), '5+');
  assert.equal(repRangeLabel(null, 12), '~12');
  assert.equal(repRangeLabel(null, null), '');
});
