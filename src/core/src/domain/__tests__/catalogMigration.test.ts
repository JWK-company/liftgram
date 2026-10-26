// @plm SRS-057  기록 블록 이관 계획 — 운영 실제 패턴 픽스처 + 운영 변형 분포 전수 분류(QA H6) + 멱등(QA H1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATALOG, CATALOG_FAMILIES } from '../../data/catalog/catalog.generated';
import { MIGRATION_OVERRIDES } from '../../data/catalog/catalogMigration.data';
import { buildCatalogIndex, planBlockMigration, planDisplayNames, type BlockColumns } from '../catalogMigrationPlan';
import { IMPLEMENT_KEYS, normalizeVariantDimsV34 } from '../variants';

const HERE = dirname(fileURLToPath(import.meta.url));
const idx = buildCatalogIndex(CATALOG, CATALOG_FAMILIES, MIGRATION_OVERRIDES);

const block = (exerciseId: string, equip: string | null = null, extra: Partial<BlockColumns> = {}): BlockColumns => ({
  exerciseId,
  variantKey: equip ? `equip:${equip}` : null,
  variantEquipment: equip,
  variantGrip: null,
  variantArm: null,
  machineVariant: equip,
  ...extra,
});

/** 계획을 적용한 뒤의 블록 — 두 번째 계획이 아무것도 바꾸지 않아야 한다(멱등). */
function applied(b: BlockColumns): BlockColumns {
  const p = planBlockMigration(b, idx);
  return { exerciseId: p.exerciseId, ...p.columns };
}

test('로프 푸시다운 → 케이블 푸시다운 + 부착물 로프', () => {
  const p = planBlockMigration(block('seed-rope-pushdown'), idx);
  assert.equal(p.exerciseId, 'seed-triceps-pushdown');
  assert.equal(p.columns.variantKey, 'attach:rope');
  assert.equal(p.columns.variantAttach, 'rope');
});

test('해머스트렝스 체스트 프레스(삭제) → 머신 체스트 프레스 + 해머', () => {
  const p = planBlockMigration(block('seed-hammer-strength-chest-press'), idx);
  assert.equal(p.exerciseId, 'seed-chest-press-machine');
  assert.equal(p.columns.variantKey, 'equip:hammer');
});

test('바벨 인클라인 + 기구 칸 덤벨 → 덤벨 인클라인 프레스(기구 칸 비움)', () => {
  const p = planBlockMigration(block('seed-incline-press', 'dumbbell'), idx);
  assert.equal(p.exerciseId, 'seed-incline-press-dumbbell');
  assert.equal(p.columns.variantKey, null);
  assert.equal(p.columns.machineVariant, null);
});

test('덤벨 오버헤드 익스텐션 + 뉴텍 → 머신 오버헤드 트라이셉스 익스텐션 + 뉴텍(D9·R1)', () => {
  const p = planBlockMigration(block('seed-overhead-triceps-extension', 'newtech'), idx);
  assert.equal(p.exerciseId, 'seed-machine-overhead-triceps-extension');
  assert.equal(p.columns.variantKey, 'equip:newtech');
});

test('원암 랫풀다운 → 케이블 랫풀다운 + 싱글 핸들 + 세트 원암', () => {
  const p = planBlockMigration(block('seed-single-arm-lat-pulldown'), idx);
  assert.equal(p.exerciseId, 'seed-lat-pulldown');
  assert.equal(p.columns.variantKey, 'attach:single');
  assert.equal(p.setArmUni, true);
});

test('레그 컬 → 라잉 레그 컬 · 딥스+테크노짐 → 머신 딥스+테크노짐', () => {
  assert.equal(planBlockMigration(block('seed-leg-curl'), idx).exerciseId, 'seed-lying-leg-curl');
  const d = planBlockMigration(block('seed-dips', 'technogym'), idx);
  assert.equal(d.exerciseId, 'seed-dip-machine');
  assert.equal(d.columns.variantKey, 'equip:technogym');
});

test('밀리터리 프레스 + 머신 칸 → (병합) 바벨 오버헤드 프레스 → (형제) 머신 숄더 프레스', () => {
  const p = planBlockMigration(block('seed-military-press', 'machine'), idx);
  assert.equal(p.exerciseId, 'seed-shoulder-press-machine');
  assert.equal(p.columns.variantKey, null);
});

test('비머신 종목의 커스텀 슬롯은 유지 + 사유(QA H6)', () => {
  const p = planBlockMigration(block('seed-military-press', 'custom2'), idx);
  assert.equal(p.exerciseId, 'seed-overhead-press');
  assert.equal(p.columns.variantKey, 'equip:custom2');
  assert.deepEqual(p.kept, ['custom-on-non-machine']);
});

test('체스트 서포티드 티바 로우 + 머신 → 예외 표로 머신 체스트 서포티드 로우(A20)', () => {
  const p = planBlockMigration(block('seed-chest-supported-t-bar-row', 'machine'), idx);
  assert.equal(p.exerciseId, 'seed-chest-supported-row');
  assert.equal(p.columns.variantKey, null);
});

test('규칙 0: 키 없이 레거시 미러만 있는 블록은 브랜드를 실체화한다(QA H9)', () => {
  const p = planBlockMigration(
    { ...block('seed-chest-press-machine'), machineVariant: 'hammer', variantEquipment: null, variantKey: null },
    idx,
  );
  assert.equal(p.exerciseId, 'seed-chest-press-machine');
  assert.equal(p.columns.variantKey, 'equip:hammer');
  assert.equal(p.columns.machineVariant, null);
});

test('카탈로그 밖(커스텀) 종목은 건드리지 않는다', () => {
  const p = planBlockMigration(block('cust_abc', 'hammer'), idx);
  assert.equal(p.changed, false);
});

test('머신 종목의 정상 브랜드 칸은 그대로(미러만 비움)', () => {
  const p = planBlockMigration(block('seed-pec-deck-fly', 'newtech'), idx);
  assert.equal(p.exerciseId, 'seed-pec-deck-fly');
  assert.equal(p.columns.variantKey, 'equip:newtech');
});

/** 운영 변형 분포(읽기 전용 쿼리 결과)의 모든 행. */
function prodRows(): (BlockColumns & { sets: number })[] {
  const lines = readFileSync(join(HERE, '..', '..', 'data', 'catalog', 'usage.prod.csv'), 'utf8').trim().split('\n');
  const q = (s: string) => (s === '""' || s === '' ? null : s);
  return lines.slice(1).map((l) => {
    const [, ex, ve, vk, mv, vg, , sets] = l.split(',');
    return {
      exerciseId: ex,
      variantEquipment: q(ve),
      variantKey: q(vk),
      machineVariant: q(mv),
      variantGrip: q(vg),
      variantArm: null,
      sets: Number(sets),
    };
  });
}

test('운영 변형 분포 전수 — 기구 변형 칸 0 · 남는 칸은 아는 목록뿐 · 두 번째 계획은 no-op', () => {
  const kept: string[] = [];
  for (const r of prodRows()) {
    const p = planBlockMigration(r, idx);
    const eq = p.columns.variantEquipment;
    if (eq && (IMPLEMENT_KEYS as string[]).includes(eq)) assert.fail(`기구 변형 칸이 남음: ${r.exerciseId} ${eq}`);
    assert.ok(idx.byId.get(p.exerciseId) && !idx.byId.get(p.exerciseId)?.isArchived, `보관 종목에 남음: ${p.exerciseId}`);
    if (p.kept.length) kept.push(`${r.exerciseId}|${r.variantEquipment}|${p.kept.join('+')}`);
    const again = planBlockMigration(applied(r), idx);
    assert.equal(again.changed, false, `멱등 아님: ${r.exerciseId}|${r.variantEquipment}`);
  }
  // 고를 수 없게 됐지만 기록은 그대로 두는 칸 — 드라이런 리포트에 실린다(QA H6).
  assert.deepEqual([...new Set(kept)].sort(), [
    'seed-cable-lateral-raise|custom1|custom-on-non-machine',
    'seed-military-press|custom2|custom-on-non-machine',
    'seed-rope-pushdown|custom1|custom-on-non-machine',
    'seed-seated-cable-row|custom1|custom-on-non-machine',
    'seed-triceps-pushdown|cybex|brand-no-machine',
  ]);
});

test('부팅 백필 등록 목록 고정(QA M5) — 옛 V6~V22 는 없고, 번들 카탈로그 판 반영 하나뿐', async () => {
  const { BOOT_MIGRATIONS, runBootMigrations } = await import('../../migrations/runner');
  const { CATALOG_REVISION } = await import('../../data/catalog/catalogRevision');
  assert.deepEqual(
    BOOT_MIGRATIONS.map((m) => m.id),
    [`catalog-bundle-${CATALOG_REVISION}`],
  );
  // 표식은 기기 로컬 저장소에 — 두 번째 실행은 건너뛴다, 실패는 다음 부팅에 다시
  const mem = new Map<string, string>();
  const store = { get: (k: string) => mem.get(k) ?? null, set: (k: string, v: string) => void mem.set(k, v) };
  let n = 0;
  const list = [{ id: 'x', run: async () => void n++ }];
  assert.deepEqual(await runBootMigrations(store, list), ['x']);
  assert.deepEqual(await runBootMigrations(store, list), []);
  assert.equal(n, 1);
  await assert.rejects(runBootMigrations(store, [{ id: 'y', run: async () => Promise.reject(new Error('boom')) }]));
  assert.equal(mem.has('liftgram.migration.y'), false);
});

// ── 표시 이름 연속성(QA M3) — 이관 뒤에도 사용자가 쓰던 이름 ──────────────────
test('표시 이름: 로프 푸시다운만 쓰던 사람 → 케이블 푸시다운이 「로프 푸시다운」으로 보인다', () => {
  const names = planDisplayNames(new Map([['seed-rope-pushdown', 5]]), idx);
  assert.equal(names.get('seed-triceps-pushdown'), '로프 푸시다운');
});

test('표시 이름: 대상 자신의 옛 이름이 우선 — 「트라이셉스 푸시다운」+「로프 푸시다운」 → 「트라이셉스 푸시다운」', () => {
  const names = planDisplayNames(new Map([['seed-rope-pushdown', 9], ['seed-triceps-pushdown', 1]]), idx);
  assert.equal(names.get('seed-triceps-pushdown'), '트라이셉스 푸시다운');
});

test('표시 이름: 대상을 이름 그대로 쓰던 사람은 대표 이름(null) — 접혀 들어온 이름으로 바꾸지 않는다', () => {
  const names = planDisplayNames(new Map([['seed-leg-curl', 3], ['seed-lying-leg-curl', 2]]), idx);
  assert.equal(names.get('seed-lying-leg-curl'), null);
});

test('표시 이름 멱등 — 옮겨 들어간 종목은 이름이 없어도 대표 이름 선호를 남긴다(재실행이 옛 이름을 착각하지 않게)', () => {
  // 딥스+테크노짐 → 머신 딥스(옛 이름 「딥 머신」): 사용자는 「딥 머신」이라고 부른 적이 없다.
  const first = planDisplayNames(new Map([['seed-dips', 2]]), idx, ['seed-dip-machine']);
  assert.equal(first.get('seed-dip-machine'), null);
});

test('쓰기 정규화(ADR-034 · P2) — 기구 값은 칸이 아니다(기구 바꾸기 = 종목 바꾸기), 브랜드는 머신에서만 남는다', () => {
  const machine = { baseEquipment: 'machine', attachments: [], grips: [], load: true };
  assert.equal(normalizeVariantDimsV34({ equipment: 'dumbbell' }, { baseEquipment: 'barbell' }).equipment, null);
  assert.equal(normalizeVariantDimsV34({ equipment: 'hammer' }, machine).equipment, 'hammer');
  assert.equal(normalizeVariantDimsV34({ equipment: 'machine' }, machine).equipment, null);
});

test('수렴(QA H1) — 서버 이관 뒤 옛 PWA 가 옛 형식(로프 푸시다운 + 미러)을 다시 올려도 같은 결과로 정규화된다', () => {
  const server = applied(block('seed-rope-pushdown'));
  const stale = applied(block('seed-rope-pushdown', null, { machineVariant: null }));
  assert.deepEqual(stale, server);
  assert.equal(planBlockMigration(server, idx).changed, false);
});
