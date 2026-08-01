// 카탈로그 갭 이관·무브먼트 패턴·콘셉트 루틴 무결성 테스트 (SRS-047) — `npm test`. @plm SRS-047
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SEED_EXERCISES } from '../../data/seed/exercises.seed';
import { SUBSTITUTES } from '../../data/seed/substitutes.seed';
import { RAW_MEDIA } from '../../data/exerciseMedia.data'; // @plm SRS-032
import { movementPatternOf, movementPatternMapKeys, samePatternNames } from '../movementPatterns';
import { FINDER_TREE } from '../exerciseFinder'; // @plm SRS-031
import { IMPLEMENT_KEYS, equipmentVariantLabel } from '../variants'; // @plm SRS-028
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

// ── 카탈로그 대확장 무결성 (spec 20260801 — 시드 추가 '전' 선행 작성, qa 리뷰 #2) ──

// 카탈로그 대확장 신규 유산소 15종 — spec 유산소 표가 정본. @plm SRS-030
const NEW_CARDIO_15 = [
  '수영', '복싱', '클라이밍', '하이킹', '스프린트', '야외 사이클', '리컴번트 바이크',
  '히트 (HIIT)', '에어로빅', '요가', '필라테스', '스케이팅', '스키', '스노우보드', '스트레칭',
];

test('카탈로그 확장: 시드 총수 하한(>=336) + nameKo 유일', () => {
  assert.ok(SEED_EXERCISES.length >= 336, `시드 총수 부족: ${SEED_EXERCISES.length} < 336`);
  assert.equal(seedNames.size, SEED_EXERCISES.length, 'nameKo 중복 존재');
});

test('카탈로그 확장: nameEn 결정적 슬러그(seedId) 유일 — 기존↔신규 완전 충돌 포함(파워 클린 사례)', () => {
  // seedRunner.seedId와 동일 규칙. 충돌 시 top-up 미생성 + syncSeedNames가 기존 nameKo를 rename해 KEY 계약 파괴.
  const slug = (en: string) => en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const seen = new Map<string, string>();
  for (const e of SEED_EXERCISES) {
    const s = slug(e.nameEn);
    assert.ok(!seen.has(s), `nameEn 슬러그 충돌: '${e.nameEn}' ↔ '${seen.get(s)}' (${s})`);
    seen.set(s, e.nameEn);
  }
});

test('대체운동: SUBSTITUTES 키·값 전건이 시드 nameKo 정확일치(침묵 드롭 금지)', () => {
  // syncSubstitutes는 정확일치만 해소하고 미일치를 조용히 버린다 — 베이스 폴백 없음.
  for (const [key, vals] of Object.entries(SUBSTITUTES)) {
    assert.ok(seedNames.has(key), `SUBSTITUTES 죽은 키: ${key}`);
    for (const v of vals) assert.ok(seedNames.has(v), `SUBSTITUTES 죽은 값: ${key} → ${v}`);
  }
});

test('파인더: FINDER_TREE 전 슬롯 names가 시드 실존(베이스 폴백 허용)', () => {
  for (const [muscle, options] of Object.entries(FINDER_TREE)) {
    for (const opt of options ?? []) {
      for (const n of opt.names) assert.ok(known(n), `FINDER_TREE 죽은 이름: ${muscle}/${opt.key} → ${n}`);
    }
  }
});

test('미디어: RAW_MEDIA 키 전건이 시드 실존(베이스 폴백 허용)', () => {
  for (const k of Object.keys(RAW_MEDIA)) {
    assert.ok(known(k), `RAW_MEDIA 죽은 키: ${k}`);
  }
});

test('변형 축: IMPLEMENT_KEYS 전건이 라벨 보유(원시 키 노출 금지) + band 축 존재', () => {
  assert.ok((IMPLEMENT_KEYS as string[]).includes('band'), 'band 변형 축 누락');
  for (const k of IMPLEMENT_KEYS) {
    const ko = equipmentVariantLabel(k, 'ko');
    const en = equipmentVariantLabel(k, 'en');
    assert.ok(ko && ko !== k, `IMPLEMENT_LABELS ko 누락: ${k}`);
    assert.ok(en && en !== k, `IMPLEMENT_LABELS en 누락: ${k}`);
  }
});

test('유산소 신규 15종: 시드 실존 + kind=cardio(무게 UI 회귀 방지)', () => {
  const byKo = new Map(SEED_EXERCISES.map((e) => [e.nameKo, e]));
  for (const n of NEW_CARDIO_15) {
    const e = byKo.get(n);
    assert.ok(e, `유산소 시드 누락: ${n}`);
    assert.equal(e!.kind, 'cardio', `kind!=cardio: ${n}`);
  }
});

test('3D 움짤 오버레이: 매핑 키 전부 시드 실존 + 자체 호스팅 경로(/media3d/) 강제', () => {
  for (const [k, v] of Object.entries(RAW_MEDIA_3D)) {
    assert.ok(known(k), `media3d 매핑이 시드에 없는 종목을 참조: ${k}`);
    assert.ok(v.startsWith('/media3d/'), `외부 URL 금지(자체 호스팅 — ADR-029): ${k} → ${v}`);
  }
});
