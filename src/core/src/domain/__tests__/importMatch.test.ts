// @plm SRS-081  종목 맞추기 — 별칭(없는 종목이면 무시) → 정확 일치 → 괄호 기구 단서 → 후보 3 → 못 맞춤 · 변형 칸은 확실한 것만(ADR-034).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CATALOG } from '../../data/catalog/catalog.generated';
import { buildExerciseSearchIndex, type SearchableExercise } from '../exerciseSearch';
import { importAliasId } from '../import/hash';
import { matchExerciseName, matchExerciseNames, parseEquipmentHint, type MatchContext } from '../import/match';

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
const ctx = (aliases: [string, string][] = [], attach?: Record<string, string[]>): MatchContext => ({
  index: INDEX,
  aliases: new Map(aliases),
  attachmentsFor: attach ? (id) => attach[id] : undefined,
});

test('괄호 기구 단서 읽기', () => {
  assert.deepEqual(parseEquipmentHint('Bench Press (Barbell)'), { base: 'Bench Press', equipment: 'barbell', equipmentWord: 'Barbell', attach: null });
  assert.deepEqual(parseEquipmentHint('Triceps Pushdown (Cable - Rope)'), { base: 'Triceps Pushdown', equipment: 'cable', equipmentWord: 'Cable', attach: 'rope' });
  assert.equal(parseEquipmentHint('Squat (Smith Machine)').equipment, 'smith');
  assert.equal(parseEquipmentHint('Bicep Curl (EZ Bar)').equipment, 'ezbar');
  assert.equal(parseEquipmentHint('Bicep Curl (EZ Bar)').attach, null); // 케이블이 아니면 부착물 아님
  assert.deepEqual(parseEquipmentHint('Running'), { base: 'Running', equipment: null, equipmentWord: null, attach: null });
});

test('자동 — 정확 일치·기구+이름·이름+기구 같음', () => {
  const c = ctx();
  const cases: [string, string, string][] = [
    ['Running', 'seed-running', 'exact'],
    ['Bench Press (Barbell)', 'seed-barbell-bench-press', 'equipment_name'],
    ['Bench Press (Dumbbell)', 'seed-dumbbell-bench-press', 'equipment_name'],
    ['Squat (Barbell)', 'seed-barbell-squat', 'equipment_name'],
    ['Deadlift (Barbell)', 'seed-deadlift', 'equipment_name'],
    ['Lat Pulldown (Cable)', 'seed-lat-pulldown', 'base_equipment'],
    ['Leg Press (Machine)', 'seed-leg-press', 'base_equipment'],
  ];
  for (const [name, id, via] of cases) {
    const m = matchExerciseName('strong', name, c);
    assert.equal(m.status, 'auto', name);
    assert.equal(m.exerciseId, id, name);
    assert.equal(m.via, via, name);
  }
});

test('별칭 우선 · 가리키는 종목이 없으면 무시(D-9)', () => {
  const name = 'My Weird Squat';
  const a = matchExerciseName('hevy', name, ctx([[importAliasId('hevy', name), 'seed-front-squat']]));
  assert.equal(a.via, 'alias');
  assert.equal(a.exerciseId, 'seed-front-squat');
  const gone = matchExerciseName('hevy', 'Running', ctx([[importAliasId('hevy', 'Running'), 'cx-hevy-deadbeef']]));
  assert.equal(gone.via, 'exact');
  assert.equal(gone.exerciseId, 'seed-running');
  // 다른 출처의 별칭은 쓰지 않는다
  assert.notEqual(matchExerciseName('strong', name, ctx([[importAliasId('hevy', name), 'seed-front-squat']])).via, 'alias');
});

test('확인 필요 — 후보 3(기구 단서 같은 것 먼저) · 못 맞춤', () => {
  const r = matchExerciseName('strong', 'Bench Press (Kettlebell)', ctx());
  assert.equal(r.status, 'review');
  assert.ok(r.candidates.length > 0 && r.candidates.length <= 3);
  assert.equal(r.exerciseId, r.candidates[0]);
  assert.equal(r.variant, null);
  const none = matchExerciseName('strong', 'Qzxv Wplk', ctx());
  assert.equal(none.status, 'none');
  assert.equal(none.exerciseId, null);
  assert.deepEqual(none.candidates, []);
});

test('변형 칸 — 케이블 부착물만 · 허용 목록 안일 때만 · 기구 값은 칸에 넣지 않는다', () => {
  const rope = matchExerciseName('strong', 'Triceps Pushdown (Cable - Rope)', ctx([], { 'seed-triceps-pushdown': ['rope', 'straight'] }));
  assert.equal(rope.exerciseId, 'seed-triceps-pushdown');
  assert.deepEqual(rope.variant, { attach: 'rope' });
  const noList = matchExerciseName('strong', 'Triceps Pushdown (Cable - Rope)', ctx());
  assert.equal(noList.variant, null);
  const notAllowed = matchExerciseName('strong', 'Triceps Pushdown (Cable - Rope)', ctx([], { 'seed-triceps-pushdown': ['straight'] }));
  assert.equal(notAllowed.variant, null);
  assert.equal(matchExerciseName('strong', 'Bench Press (Barbell)', ctx()).variant, null);
});

test('여러 이름 — 입력 순서 · 같은 이름은 같은 결과', () => {
  const r = matchExerciseNames('strong', ['Running', 'Squat (Barbell)', 'Running'], ctx());
  assert.deepEqual(r.map((m) => m.exerciseId), ['seed-running', 'seed-barbell-squat', 'seed-running']);
  assert.equal(r[0], r[2]);
});
