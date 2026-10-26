// @plm SRS-056  종목 검색 — 성공 기준 1: 흔히 부르는 이름·띄어쓰기·초성·영문으로 친 말이 첫 화면(첫 결과)에 나온다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CATALOG } from '../../data/catalog/catalog.generated';
import { buildExerciseSearchIndex, chosungKey, matchedLabel, searchExercises, type SearchableExercise } from '../exerciseSearch';
import { normalizeNameKey } from '../nameKey';

const LIST: SearchableExercise[] = CATALOG.map((r) => ({
  id: r.id,
  nameKo: r.nameKo,
  nameEn: r.nameEn,
  aliases: [...r.aliasesKo, ...r.aliasesEn],
  family: r.family,
  equipment: r.equipment,
  similar: r.similar,
  isArchived: r.isArchived,
}));
const INDEX = buildExerciseSearchIndex(LIST);
const NAME = new Map(LIST.map((e) => [e.id, e.nameKo]));
const first = (q: string) => NAME.get(searchExercises(INDEX, q).hits[0]?.id ?? '');
const top = (q: string, n: number) => searchExercises(INDEX, q).hits.slice(0, n).map((h) => NAME.get(h.id));

// 질의 → 첫 결과(대표 이름). 사용자 피드백(#49·#58)과 스펙 성공 기준 1의 표.
const FIRST: [string, string][] = [
  ['랫풀', '케이블 랫풀다운'],
  ['랫 풀', '케이블 랫풀다운'],
  ['랫풀다운', '케이블 랫풀다운'],
  ['렛풀', '케이블 랫풀다운'],
  ['lat pulldown', '케이블 랫풀다운'],
  ['latpull', '케이블 랫풀다운'],
  ['이너타이', '머신 힙 어덕션'],
  ['이너 타이', '머신 힙 어덕션'],
  ['롱풀', '케이블 시티드 로우'],
  ['시티드 케이블 로우', '케이블 시티드 로우'],
  ['스컬크러셔', '바벨 스컬크러셔'],
  ['스컬 크러셔', '바벨 스컬크러셔'],
  ['라잉 트라이셉스 익스텐션', '바벨 스컬크러셔'],
  ['벤트오버 로우', '바벨 로우'],
  ['벤트오버', '바벨 로우'],
  ['바벨로우', '바벨 로우'],
  ['밀프', '바벨 오버헤드 프레스'],
  ['OHP', '바벨 오버헤드 프레스'],
  ['오버헤드프레스', '바벨 오버헤드 프레스'],
  ['사레레', '덤벨 레터럴 레이즈'],
  ['사이드 레터럴 레이즈', '덤벨 레터럴 레이즈'],
  ['풀업', '풀업'],
  ['턱걸이', '풀업'],
  ['벤치', '바벨 벤치프레스'],
  ['벤치프레스', '바벨 벤치프레스'],
  ['벤치 프레스', '바벨 벤치프레스'],
  ['bench press', '바벨 벤치프레스'],
  ['로프 푸시다운', '케이블 푸시다운'],
  ['푸시다운', '케이블 푸시다운'],
  ['푸쉬다운', '케이블 푸시다운'],
  ['삼두 푸시다운', '케이블 푸시다운'],
  ['데드', '바벨 데드리프트'],
  ['데드리프트', '바벨 데드리프트'],
  ['스쿼트', '바벨 스쿼트'],
  ['레그프레스', '레그 프레스'],
  ['레그 프레스', '레그 프레스'],
  ['힙 어덕션', '머신 힙 어덕션'],
  ['펙덱', '펙 덱 플라이'],
  ['인클라인 프레스 (바벨)', '바벨 인클라인 프레스'],
  ['인클라인프레스', '바벨 인클라인 프레스'],
  ['암 익스텐션', '머신 트라이셉스 익스텐션'],
  ['ㄹㅍㄷㅇ', '케이블 랫풀다운'],
  ['ㅅㄹㄹ', '덤벨 레터럴 레이즈'],
];

test('성공 기준 1 — 흔히 부르는 이름·띄어쓰기·초성·영문이 첫 결과로 온다', () => {
  const fails: string[] = [];
  for (const [q, want] of FIRST) {
    const got = first(q);
    if (got !== want) fails.push(`「${q}」 → ${got ?? '(없음)'} (기대 ${want}) · 상위 ${top(q, 3).join(' / ')}`);
  }
  assert.equal(FIRST.length >= 40, true, '표는 40건 이상이어야 한다');
  assert.deepEqual(fails, []);
});

test('띄어쓰기는 결과를 바꾸지 않는다(랫풀 = 랫 풀 = 랫  풀)', () => {
  const a = searchExercises(INDEX, '랫풀').hits.map((h) => h.id);
  assert.deepEqual(searchExercises(INDEX, '랫 풀').hits.map((h) => h.id), a);
  assert.deepEqual(searchExercises(INDEX, ' 랫  풀 ').hits.map((h) => h.id), a);
});

test('결과 줄에 맞은 별칭을 함께 준다 — 대표 이름이 맞았으면 없다', () => {
  const h = searchExercises(INDEX, '롱풀').hits[0];
  assert.equal(matchedLabel(h, NAME.get(h.id) ?? ''), '롱풀');
  const n = searchExercises(INDEX, '케이블 시티드 로우').hits[0];
  assert.equal(matchedLabel(n, NAME.get(n.id) ?? ''), null);
});

test('보관된(통합된) 종목은 결과에 없다 — 옛 이름은 대상 종목의 별칭으로 찾힌다(QA M2)', () => {
  const archived = new Set(CATALOG.filter((r) => r.isArchived).map((r) => r.id));
  assert.ok(archived.size > 0);
  for (const r of CATALOG.filter((x) => x.isArchived)) {
    const hits = searchExercises(INDEX, r.nameKo).hits;
    assert.ok(hits.every((h) => !archived.has(h.id)), `${r.nameKo} 가 보관 종목을 돌려준다`);
    if (r.mergeInto) assert.equal(hits[0]?.id, r.mergeInto, `${r.nameKo} → 첫 결과가 대상 종목이 아니다`);
  }
});

test('한글 대표명 정확 일치가 다른 종목의 영문 이름 정확 일치보다 앞선다(QA L3)', () => {
  const h = searchExercises(INDEX, '글루트 브릿지').hits[0];
  assert.equal(normalizeNameKey(NAME.get(h.id)), normalizeNameKey('글루트 브릿지'));
});

test('비슷한 운동 — 같은 동작의 다른 기구가 결과 밖 구역으로 온다', () => {
  const r = searchExercises(INDEX, '바벨 벤치프레스');
  const names = r.similar.map((id) => NAME.get(id));
  assert.ok(names.includes('덤벨 벤치프레스'), `비슷한 운동: ${names.join(', ')}`);
  assert.ok(!r.hits.slice(0, 1).some((h) => r.similar.includes(h.id)));
});

test('빈 질의는 전 종목(보관 제외)을 가나다순으로', () => {
  const r = searchExercises(INDEX, '  ');
  assert.equal(r.hits.length, CATALOG.filter((x) => !x.isArchived).length);
  assert.equal(r.similar.length, 0);
});

test('초성 키', () => {
  assert.equal(chosungKey(normalizeNameKey('랫 풀다운')), 'ㄹㅍㄷㅇ');
  assert.equal(chosungKey('ohp'), 'ohp');
  // 호환 자모로 친 초성(ㄹㅍ)도 NFKC 를 지나 찾힌다 — 「ㄹㅍ」은 랙 풀·레그 프레스와도 겹치니 첫 화면(상위 3) 안이면 된다
  assert.ok(top('ㄹㅍ', 3).includes('케이블 랫풀다운'), top('ㄹㅍ', 3).join(' / '));
});

test('성능 — 500종 색인 위에서 검색 한 번이 50ms 안', () => {
  const big = [...LIST];
  for (let i = 0; big.length < 500; i++) big.push({ ...LIST[i % LIST.length], id: `x-${i}` });
  const idx = buildExerciseSearchIndex(big);
  const qs = ['랫풀', '벤치', 'ㄹㅍ', 'pull', '덤벨 로우', '스'];
  for (const q of qs) searchExercises(idx, q); // 워밍업
  for (const q of qs) {
    const t0 = performance.now();
    searchExercises(idx, q);
    const ms = performance.now() - t0;
    assert.ok(ms < 50, `「${q}」 ${ms.toFixed(1)}ms`);
  }
});
