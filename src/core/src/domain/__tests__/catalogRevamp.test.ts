// @plm SRS-055 SRS-056  카탈로그 개편 무결성 — 마스터 표(생성물)가 규칙을 지키는가, 옛 시드라면 게이트가 막는가.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOG, CATALOG_FAMILIES } from '../../data/catalog/catalog.generated';
import { MIGRATION_OVERRIDES } from '../../data/catalog/catalogMigration.data';
import type { CatalogRow } from '../../data/catalog/catalogTypes';
import { SEED_EXERCISES } from '../../data/seed/exercises.seed';
import { CATALOG_EQUIPMENT, checkCatalogIntegrity } from '../catalogIntegrity';
import { normalizeNameKey, seedIdOf } from '../nameKey';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', '..', '..', '..');

/** 운영 기록이 가리키는 종목 id(읽기 전용 쿼리 결과 — QA M6). */
function usedIds(): Set<string> {
  const csv = readFileSync(join(HERE, '..', '..', 'data', 'catalog', 'usage.prod.csv'), 'utf8').trim().split('\n');
  return new Set(csv.slice(1).map((l) => l.split(',')[1]));
}

test('생성물이 정본 CSV 와 같다(드리프트 없음)', () => {
  execFileSync('node', [join(SRC, 'scripts', 'gen-catalog.mjs'), '--check'], { stdio: 'pipe' });
});

test('마스터 표가 무결성 규칙을 전부 지킨다', () => {
  const v = checkCatalogIntegrity(CATALOG, CATALOG_FAMILIES, {
    minRows: 450,
    usedIds: usedIds(),
    overrides: MIGRATION_OVERRIDES,
  });
  assert.deepEqual(v, []);
});

test('게이트가 진짜 막는다 — 옛 시드(이름 규칙·family·별칭 없음)는 위반이 난다', () => {
  const legacy: CatalogRow[] = SEED_EXERCISES.map((s) => ({
    id: seedIdOf(s.nameEn),
    nameEn: s.nameEn,
    nameKo: s.nameKo,
    oldNameKo: null,
    status: 'keep',
    nameRule: 'prefix',
    equipment: s.equipment,
    primaryMuscles: s.primaryMuscles,
    secondaryMuscles: s.secondaryMuscles ?? [],
    kind: s.kind === 'cardio' ? 'cardio' : null,
    loadMode: null,
    family: '',
    aliasesKo: [],
    aliasesEn: [],
    mergeInto: null,
    impliedAxes: {},
    similar: [],
    media: null,
    usageSets: 0,
    isArchived: false,
  }));
  const v = checkCatalogIntegrity(legacy, [], { minRows: 450 });
  assert.ok(v.some((x) => x.includes('family 없음')), '옛 시드에서 family 검사가 실패해야 한다');
  assert.ok(v.some((x) => x.includes('이름 규칙')), '옛 시드에서 이름 규칙 검사가 실패해야 한다');
  assert.ok(v.some((x) => x.startsWith('행 수')), '옛 시드는 행 수 하한에 걸려야 한다');
});

test('옛 시드 종목은 하나도 빠지지 않는다(id·nameEn 불변 — 기록 보존)', () => {
  const en = new Set(CATALOG.map((r) => r.nameEn));
  for (const s of SEED_EXERCISES) assert.ok(en.has(s.nameEn), `마스터에서 빠짐: ${s.nameEn}`);
});

test('운영 기록이 가리키는 종목은 전부 마스터에 있다', () => {
  const ids = new Set(CATALOG.map((r) => r.id));
  for (const id of usedIds()) assert.ok(ids.has(id), `운영 기록의 종목이 마스터에 없음: ${id}`);
});

test('기구 값: CSV ⊆ 카탈로그 기구 ⊆ proto enum(EZ바·트랩바 포함 — QA H8)', () => {
  const proto = readFileSync(join(SRC, 'proto', 'exercise', 'v1', 'exercise.proto'), 'utf8');
  for (const e of CATALOG_EQUIPMENT) assert.ok(proto.includes(`EQUIPMENT_${e.toUpperCase()} =`), `proto 에 없음: ${e}`);
  for (const r of CATALOG) assert.ok((CATALOG_EQUIPMENT as readonly string[]).includes(r.equipment));
});

test('통계(QA L1) — 활성 = 근력 + 유산소, 근력 ≥ 440', () => {
  const active = CATALOG.filter((r) => !r.isArchived);
  const cardio = active.filter((r) => r.kind === 'cardio').length;
  assert.equal(CATALOG.length, 480);
  assert.equal(active.length, 469);
  assert.equal(cardio, 26);
  assert.ok(active.length - cardio >= 440);
});

test('이름 키 정규화 — 띄어쓰기·하이픈·대소문자 무시', () => {
  assert.equal(normalizeNameKey('랫 풀다운'), normalizeNameKey('랫풀다운'));
  assert.equal(normalizeNameKey('Lat Pull-Down'), normalizeNameKey('latpulldown'));
  assert.equal(normalizeNameKey('인클라인 프레스 (바벨)'), '인클라인프레스바벨');
});
