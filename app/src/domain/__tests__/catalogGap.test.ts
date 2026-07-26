// 카탈로그 갭 이관·무브먼트 패턴·콘셉트 루틴 무결성 테스트 (SRS-047) — `npm test`. @plm SRS-047
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SEED_EXERCISES } from '../../data/seed/exercises.seed';
import { movementPatternOf, movementPatternMapKeys, samePatternNames } from '../movementPatterns';
import { CONCEPT_ROUTINES } from '../conceptRoutines';
import { RAW_MEDIA_3D } from '../../data/exerciseMedia3d.data'; // @plm SRS-046
import { containsMedicalClaim } from '../wellness';

const seedNames = new Set(SEED_EXERCISES.map((e) => e.nameKo));
// 괄호 변형 엔트리의 베이스명('인클라인 프레스 (바벨)' → '인클라인 프레스')도 유효 키로 취급.
const seedBases = new Set(SEED_EXERCISES.map((e) => e.nameKo.replace(/\s*\([^)]*\)\s*$/, '').trim()));
const known = (n: string) => seedNames.has(n) || seedBases.has(n);

test('갭 이관: RapidOverload 대조 신규 종목이 시드에 존재(rename 없이 추가만)', () => {
  for (const n of [
    '해머스트렝스 체스트 프레스',
    '컨버징 체스트 프레스 머신',
    '라슨 프레스',
    '피트 업 벤치프레스',
    '디클라인 프레스 (스미스)',
    '체스트 서포티드 티바 로우',
    '싯업',
  ]) {
    assert.ok(seedNames.has(n), `시드 누락: ${n}`);
  }
  // 기존 KEY 불변 스팟 체크(rename 금지 규약).
  for (const n of ['바벨 벤치프레스', '스미스 벤치프레스', '랫 풀다운', '딥스']) {
    assert.ok(seedNames.has(n), `기존 KEY 소실: ${n}`);
  }
});

test('무브먼트 패턴: 매핑 키 전부 시드 실존(dangling 금지)', () => {
  for (const key of movementPatternMapKeys()) {
    assert.ok(known(key), `패턴 매핑이 시드에 없는 종목을 참조: ${key}`);
  }
});

test('무브먼트 패턴: 직접·괄호 폴백 조회와 같은 패턴 후보', () => {
  assert.equal(movementPatternOf('바벨 벤치프레스'), 'horizontalPress');
  assert.equal(movementPatternOf('인클라인 프레스 (바벨)'), 'horizontalPress'); // 폴백
  assert.equal(movementPatternOf('없는 종목'), null);
  const candidates = samePatternNames('horizontalPress', '바벨 벤치프레스');
  assert.ok(candidates.length >= 15, `수평 프레스 후보가 너무 적음: ${candidates.length}`);
  assert.ok(!candidates.includes('바벨 벤치프레스'), '자기 자신 제외 실패');
  assert.ok(candidates.includes('해머스트렝스 체스트 프레스'));
});

test('콘셉트 루틴: 구성 종목 전부 시드 실존 + 스토리 카피 게이트 통과', () => {
  assert.ok(CONCEPT_ROUTINES.length >= 3);
  for (const c of CONCEPT_ROUTINES) {
    assert.ok(c.days.length >= 2, `${c.id}: Day 부족`);
    for (const d of c.days) {
      for (const ex of d.exercises) {
        assert.ok(seedNames.has(ex), `${c.id}/${d.nameKo}: 시드에 없는 종목 ${ex}`);
      }
    }
    assert.equal(containsMedicalClaim(c.storyKo), false, `${c.id} storyKo 의료 단정`);
    assert.equal(containsMedicalClaim(c.storyEn), false, `${c.id} storyEn 의료 단정`);
  }
});

test('3D 움짤 오버레이: 매핑 키 전부 시드 실존 + 자체 호스팅 경로(/media3d/) 강제', () => {
  for (const [k, v] of Object.entries(RAW_MEDIA_3D)) {
    assert.ok(known(k), `media3d 매핑이 시드에 없는 종목을 참조: ${k}`);
    assert.ok(v.startsWith('/media3d/'), `외부 URL 금지(자체 호스팅 — ADR-029): ${k} → ${v}`);
  }
});
