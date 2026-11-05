// 특이 종목 보강 무결성 (SPEC-028) — 새 46종목, 기존 587행은 별칭 3건 말고 그대로, 검색 첫 결과, 주의 문구.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CATALOG } from '../../data/catalog/catalog.generated';
import { FAMILY_ARCH, specFor } from '../../data/pictograms/render';
import { EXERCISE_CAUTION_IDS, exerciseCautionOf } from '../exerciseCautions';
import { buildExerciseSearchIndex, searchExercises } from '../exerciseSearch';
import { movementPatternOf } from '../movementPatterns';

const BEFORE = 587;
const ADDED_ALIASES: Record<string, string[]> = {
  'seed-dumbbell-incline-shrug': ['켈소 슈러그', '덤벨 켈소 슈러그', 'kelso shrug'],
  'seed-chest-supported-row-dumbbell': ['헬름스 로우', 'helms row'],
  'seed-front-squat': ['좀비 스쿼트', 'zombie squat'],
};
const BEFORE_SHA1 = '71f29c5fe02f48cd2a29ba17eb09489629b7ee6e';

const added = CATALOG.slice(BEFORE);
const byId = new Map(CATALOG.map((r) => [r.id, r]));
const index = buildExerciseSearchIndex(
  CATALOG.filter((r) => !r.isArchived).map((r) => ({
    id: r.id, nameKo: r.nameKo, nameEn: r.nameEn, aliases: [...r.aliasesKo, ...r.aliasesEn],
    family: r.family, equipment: r.equipment, similar: r.similar, isArchived: r.isArchived,
  })),
);
const first = (q: string) => byId.get(searchExercises(index, q).hits[0]?.id ?? '')?.nameKo;

test('새 46종목은 활성 근력 종목이고 사진 없이 픽토그램을 쓴다', () => {
  assert.equal(added.length, 46);
  for (const r of added) {
    assert.equal(r.status, 'new', r.id);
    assert.equal(r.isArchived, false, r.id);
    assert.equal(r.media, 'gen', r.id);
    assert.ok(specFor(r), `${r.nameKo}: 그림 없음`);
    assert.ok(FAMILY_ARCH[r.family], r.family);
  }
});

test('기존 587행은 별칭 추가 말고 바뀌지 않았다', () => {
  const before = CATALOG.slice(0, BEFORE).map((r) => {
    const add = new Set(ADDED_ALIASES[r.id] ?? []);
    if (!add.size) return r;
    const ko = r.aliasesKo.filter((a) => !add.has(a));
    const en = r.aliasesEn.filter((a) => !add.has(a));
    assert.equal(r.aliasesKo.length + r.aliasesEn.length - ko.length - en.length, add.size, r.id);
    return { ...r, aliasesKo: ko, aliasesEn: en };
  });
  assert.equal(createHash('sha1').update(JSON.stringify(before)).digest('hex'), BEFORE_SHA1);
});

test('검색: 새 이름은 찾히고, 흔한 검색어의 첫 결과는 그대로다', () => {
  const expected: Record<string, string> = {
    '오버헤드 슈러그': '바벨 오버헤드 슈러그',
    '코리안 딥스': '코리안 딥스',
    '루 레이즈': '덤벨 루 레이즈',
    '이집션 레터럴 레이즈': '케이블 리닝 레터럴 레이즈',
    악력기: '핸드 그리퍼',
    '켈소 슈러그': '덤벨 인클라인 슈러그',
    슈러그: '바벨 슈러그',
    벤치프레스: '바벨 벤치프레스',
    풀업: '풀업',
    스쿼트: '바벨 스쿼트',
    데드리프트: '바벨 데드리프트',
    '레터럴 레이즈': '덤벨 레터럴 레이즈',
    트위스트: '러시안 트위스트',
    핀: '바벨 핀 프레스',
  };
  for (const [q, want] of Object.entries(expected)) assert.equal(first(q), want, q);
});

test('주의 문구 대상은 실재하고, 대체 패턴에 묶이지 않은 새 종목이 있다', () => {
  for (const id of EXERCISE_CAUTION_IDS) assert.ok(byId.get(id), id);
  assert.equal(exerciseCautionOf('seed-barbell-bench-press'), null);
  // [원본] 네 종목만 확인 — 플란체 푸시업·코리안 딥스가 패턴에 남은 것을 놓쳤다(qa code)
  for (const id of EXERCISE_CAUTION_IDS) {
    assert.equal(movementPatternOf(id), null, id);
    assert.ok(exerciseCautionOf(id), id);
  }
});
