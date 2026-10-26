// 카탈로그 갭 이관·무브먼트 패턴·콘셉트 루틴 무결성 테스트 (SRS-047) — `npm test`. @plm SRS-047
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SEED_EXERCISES } from '../../data/seed/exercises.seed';
import { LEGACY_SEED_EXERCISES } from '../../data/seed/legacySeed';
import { MEDIA_KEY_BY_ID } from '../../data/exerciseMediaKeys.data';
import { SUBSTITUTES } from '../../data/seed/substitutes.seed';
import { RAW_MEDIA } from '../../data/exerciseMedia.data'; // @plm SRS-032
import { getExerciseMedia } from '../../data/exerciseMedia';
import { movementPatternOf, movementPatternMapKeys, samePatternIds } from '../movementPatterns';
import { FINDER_TREE } from '../exerciseFinder'; // @plm SRS-031
import { IMPLEMENT_KEYS, equipmentVariantLabel } from '../variants'; // @plm SRS-028
import { CONCEPT_ROUTINES } from '../conceptRoutines';
import { RAW_MEDIA_3D } from '../../data/exerciseMedia3d.data'; // @plm SRS-046
import { containsMedicalClaim } from '../wellness';

// P2(ADR-033): 큐레이션 표의 KEY 가 nameKo 에서 **seed id** 로 옮겨졌다 — 이름(대표·별칭)이 바뀌어도 끊기지 않는다.
const slugId = (en: string) => `seed-${en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`;
const seedNames = new Set(SEED_EXERCISES.map((e) => e.nameKo));
const seedIds = new Set(SEED_EXERCISES.map((e) => slugId(e.nameEn)));
const activeIds = new Set(SEED_EXERCISES.filter((e) => !e.isArchived).map((e) => slugId(e.nameEn)));
const idByName = new Map(SEED_EXERCISES.map((e) => [e.nameKo, slugId(e.nameEn)]));
// 미디어 표는 사진 출처 라벨(옛 이름)로 키를 둔다 — 옛 시드 이름·괄호 베이스명이 유효 키.
const legacyNames = new Set(LEGACY_SEED_EXERCISES.map((e) => e.nameKo));
const legacyBases = new Set(LEGACY_SEED_EXERCISES.map((e) => e.nameKo.replace(/\s*\([^)]*\)\s*$/, '').trim()));
const knownLegacy = (n: string) => legacyNames.has(n) || legacyBases.has(n);

test('갭 이관: RapidOverload 대조 신규 종목이 시드에 존재(id 불변 — 이름은 개편에서 바뀔 수 있다)', () => {
  for (const id of [
    'seed-hammer-strength-chest-press', // 보관(머신 체스트 프레스+해머로 접힘) — 행은 남는다
    'seed-converging-chest-press-machine',
    'seed-larsen-press',
    'seed-feet-up-bench-press',
    'seed-decline-press-smith',
    'seed-chest-supported-t-bar-row',
    'seed-sit-up',
  ]) {
    assert.ok(seedIds.has(id), `시드 누락: ${id}`);
  }
  for (const id of ['seed-barbell-bench-press', 'seed-smith-machine-bench-press', 'seed-lat-pulldown', 'seed-dips']) {
    assert.ok(activeIds.has(id), `기존 KEY 소실: ${id}`);
  }
});

test('무브먼트 패턴: 매핑 키 전부 시드 실존(dangling 금지)', () => {
  for (const key of movementPatternMapKeys()) {
    assert.ok(seedIds.has(key), `패턴 매핑이 시드에 없는 종목을 참조: ${key}`);
  }
});

test('무브먼트 패턴: id 조회와 같은 패턴 후보', () => {
  assert.equal(movementPatternOf('seed-barbell-bench-press'), 'horizontalPress');
  assert.equal(movementPatternOf('seed-incline-press'), 'horizontalPress');
  assert.equal(movementPatternOf('없는 종목'), null);
  const candidates = samePatternIds('horizontalPress', 'seed-barbell-bench-press');
  assert.ok(candidates.length >= 15, `수평 프레스 후보가 너무 적음: ${candidates.length}`);
  assert.ok(!candidates.includes('seed-barbell-bench-press'), '자기 자신 제외 실패');
  assert.ok(candidates.includes('seed-chest-press-machine'));
});

test('콘셉트 루틴: 구성 종목 전부 시드 실존 + 스토리 카피 게이트 통과', () => {
  assert.ok(CONCEPT_ROUTINES.length >= 3);
  for (const c of CONCEPT_ROUTINES) {
    assert.ok(c.days.length >= 2, `${c.id}: Day 부족`);
    for (const d of c.days) {
      for (const ex of d.exercises) {
        assert.ok(activeIds.has(ex), `${c.id}/${d.nameKo}: 활성 시드에 없는 종목 ${ex}`);
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

test('카탈로그 확장: 시드 총수 하한(>=450) + nameKo 유일', () => {
  assert.ok(SEED_EXERCISES.length >= 450, `시드 총수 부족: ${SEED_EXERCISES.length} < 450`);
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

test('대체운동: SUBSTITUTES 키·값 전건이 활성 시드 id(침묵 드롭 금지)', () => {
  // syncSubstitutes는 로컬에 있는 id 만 싣고 나머지를 조용히 버린다 — 보관 종목을 가리키면 안 된다.
  for (const [key, vals] of Object.entries(SUBSTITUTES)) {
    assert.ok(activeIds.has(key), `SUBSTITUTES 죽은 키: ${key}`);
    for (const v of vals) assert.ok(activeIds.has(v), `SUBSTITUTES 죽은 값: ${key} → ${v}`);
  }
});

test('파인더: FINDER_TREE 전 슬롯 ids 가 활성 시드 id', () => {
  for (const [muscle, options] of Object.entries(FINDER_TREE)) {
    for (const opt of options ?? []) {
      for (const n of opt.ids) assert.ok(activeIds.has(n), `FINDER_TREE 죽은 id: ${muscle}/${opt.key} → ${n}`);
    }
  }
});

test('미디어 키 표: 전 id 가 시드에 있고 값은 RAW_MEDIA 키', () => {
  for (const [id, key] of Object.entries(MEDIA_KEY_BY_ID)) {
    assert.ok(seedIds.has(id), `MEDIA_KEY_BY_ID 죽은 id: ${id}`);
    assert.ok(RAW_MEDIA[key], `MEDIA_KEY_BY_ID 값이 미디어 표에 없음: ${id} → ${key}`);
  }
  // 이름이 바뀐 종목도 그림이 그대로 — id 로 찾기 때문(ADR-033)
  assert.ok(getExerciseMedia('seed-barbell-bench-press'));
});

test('미디어: RAW_MEDIA 키 전건이 시드 실존(베이스 폴백 허용)', () => {
  for (const k of Object.keys(RAW_MEDIA)) {
    assert.ok(knownLegacy(k), `RAW_MEDIA 죽은 키: ${k}`);
  }
});

test('미디어 steps-only 렌더 계약: 이미지 없는 엔트리는 start/end 빈 문자열 + 한/영 스텝 보유', () => {
  // steps-only(s/e 없음) 엔트리가 최소 1건 존재하고, 조회 시 빈 URL(패널이 단계 설명만 렌더)이어야 한다.
  const stepsOnly = Object.entries(RAW_MEDIA).filter(([, v]) => !v.s);
  assert.ok(stepsOnly.length >= 50, `steps-only 엔트리 부족: ${stepsOnly.length}`);
  for (const [k, v] of stepsOnly) {
    assert.ok(!v.e, `${k}: s 없이 e만 존재`);
    assert.ok(v.k.length >= 3 && v.en.length >= 3, `${k}: 스텝 부족(ko ${v.k.length}/en ${v.en.length})`);
  }
  const m = getExerciseMedia(idByName.get('클랩 푸시업') ?? 'seed-clap-push-up');
  assert.ok(m, '클랩 푸시업 미디어 조회 실패');
  assert.equal(m!.start, '');
  assert.equal(m!.end, '');
  assert.ok(m!.instructionsKo.length >= 3);
});

test('미디어 supplement ↔ 생성 데이터 드리프트 금지: supplement 전 키가 RAW_MEDIA에 동일 콘텐츠로 존재', () => {
  // supplement(콘텐츠 정본 입력)만 고치고 gen-exercise-media.js 재실행을 잊으면 조용히 어긋난다 — 기계로 강제(qa code).
  const supplement = JSON.parse(
    readFileSync(new URL('../../../scripts/media-supplement.json', import.meta.url), 'utf8'),
  ) as Record<string, { k: string[]; en?: string[] }>;
  for (const [key, sup] of Object.entries(supplement)) {
    const entry = RAW_MEDIA[key];
    assert.ok(entry, `supplement 키가 RAW_MEDIA에 미방출: ${key} (gen-exercise-media.js 재실행 필요)`);
    assert.deepEqual(entry.k, sup.k, `supplement k 드리프트: ${key}`);
    if (!entry.s && sup.en) assert.deepEqual(entry.en, sup.en, `supplement en 드리프트(steps-only): ${key}`);
  }
});

test('미디어 카피 게이트: RAW_MEDIA 전 엔트리 스텝(한/영)에 의료 단정 없음', () => {
  for (const [k, v] of Object.entries(RAW_MEDIA)) {
    for (const s of [...v.k, ...v.en]) {
      assert.equal(containsMedicalClaim(s), false, `의료 단정 카피: ${k} → ${s}`);
    }
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
  // 유산소 이름은 개편에서 그대로거나 별칭으로 남는다 — 옛 이름 → id → 지금 시드.
  const legacyId = new Map(LEGACY_SEED_EXERCISES.map((e) => [e.nameKo, slugId(e.nameEn)]));
  const byId = new Map(SEED_EXERCISES.map((e) => [slugId(e.nameEn), e]));
  for (const n of NEW_CARDIO_15) {
    const e = byId.get(legacyId.get(n) ?? '');
    assert.ok(e, `유산소 시드 누락: ${n}`);
    assert.equal(e!.kind, 'cardio', `kind!=cardio: ${n}`);
  }
});

test('3D 움짤 오버레이: 매핑 키 전부 시드 실존 + 자체 호스팅 경로(/media3d/) 강제', () => {
  for (const [k, v] of Object.entries(RAW_MEDIA_3D)) {
    assert.ok(knownLegacy(k), `media3d 매핑이 시드에 없는 종목을 참조: ${k}`);
    assert.ok(v.startsWith('/media3d/'), `외부 URL 금지(자체 호스팅 — ADR-029): ${k} → ${v}`);
  }
});
