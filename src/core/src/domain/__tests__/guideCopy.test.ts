// 가이드·처방 카피 게이트 — 의료 단정 표현 금지(SRS-015·ADR-006) 검증 (SRS-046). @plm SRS-046
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { containsMedicalClaim } from '../wellness';
import { ko } from '../../i18n/locales/ko';
import { en } from '../../i18n/locales/en';

const PREFIXES = ['guide.', 'prescription.', 'session.rx', 'experience.', 'schedule.', 'onboarding.exp', 'onboarding.trainerIntent'];

function gatedEntries(bundle: Record<string, string>): [string, string][] {
  return Object.entries(bundle).filter(([k]) => PREFIXES.some((p) => k.startsWith(p)));
}

test('카피 게이트: 신규 가이드·처방·경력 문구에 의료 단정 표현 없음 (ko)', () => {
  const entries = gatedEntries(ko as Record<string, string>);
  assert.ok(entries.length >= 30, `게이트 대상 키가 예상보다 적음: ${entries.length}`);
  for (const [k, v] of entries) {
    assert.equal(containsMedicalClaim(v), false, `의료 단정 표현 검출: ${k} = ${v}`);
  }
});

test('카피 게이트: 신규 가이드·처방·경력 문구에 의료 단정 표현 없음 (en)', () => {
  for (const [k, v] of gatedEntries(en as Record<string, string>)) {
    assert.equal(containsMedicalClaim(v), false, `의료 단정 표현 검출: ${k} = ${v}`);
  }
});
