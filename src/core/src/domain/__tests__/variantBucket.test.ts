// @plm SRS-028  변형 버킷 정규화 — 같은 종목·같은 기구가 두 버킷(null vs equip:<고유기구>)으로
// 갈라져 루틴마다 이전기록·PR이 비어 보이던 회귀(2026-08-01 리포트)의 재발 방지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalVariantKey,
  normalizeVariantDims,
  normalizeVariantEquipment,
  variantColumns,
} from '../variants';

test('고유 기구 선택은 기본 버킷(null)로 정규화 — 바벨 종목의 barbell', () => {
  assert.equal(normalizeVariantEquipment('barbell', 'barbell'), null);
  assert.equal(normalizeVariantEquipment('machine', 'machine'), null);
});

test('다른 기구(대체 변형)는 그대로 별도 버킷', () => {
  assert.equal(normalizeVariantEquipment('smith', 'barbell'), 'smith');
  assert.equal(normalizeVariantEquipment('dumbbell', 'barbell'), 'dumbbell');
  assert.equal(normalizeVariantEquipment('hammer', 'machine'), 'hammer'); // 머신 브랜드
});

test('빈 값·기준 없음 처리 — 빈 문자열은 null, 기준 미상이면 보존', () => {
  assert.equal(normalizeVariantEquipment(null, 'barbell'), null);
  assert.equal(normalizeVariantEquipment('   ', 'barbell'), null);
  assert.equal(normalizeVariantEquipment('barbell', null), 'barbell');
});

test('정규화는 기구 축만 — 그립·팔 차원은 보존', () => {
  const dims = normalizeVariantDims({ equipment: 'barbell', grip: 'over', arm: 'uni' }, 'barbell');
  assert.deepEqual(dims, { equipment: null, grip: 'over', arm: 'uni' });
});

test('두 경로(미지정 vs 고유기구 선택)가 같은 버킷 키를 낳는다', () => {
  const unspecified = canonicalVariantKey(normalizeVariantDims({ equipment: null }, 'barbell'));
  const intrinsic = canonicalVariantKey(normalizeVariantDims({ equipment: 'barbell' }, 'barbell'));
  assert.equal(unspecified, null);
  assert.equal(intrinsic, unspecified); // 같은 벤치프레스(바벨) → 한 버킷
  // 정규화 없이는 갈라진다(= 이 버그의 원인).
  assert.notEqual(canonicalVariantKey({ equipment: 'barbell' }), canonicalVariantKey({ equipment: null }));
});

test('정규화된 dims의 저장 컬럼 — 키·개별 차원이 모두 기본값', () => {
  const cols = variantColumns(normalizeVariantDims({ equipment: 'barbell' }, 'barbell'));
  assert.equal(cols.variantKey, null);
  assert.equal(cols.variantEquipment, null);
});

test('대체 기구는 정규화 후에도 자기 버킷 유지', () => {
  const cols = variantColumns(normalizeVariantDims({ equipment: 'smith' }, 'barbell'));
  assert.equal(cols.variantKey, 'equip:smith');
  assert.equal(cols.variantEquipment, 'smith');
});

// ── ADR-034 기록 칸 축 확장 — 적재 방식·부착물·손 그립 (P1) @plm SRS-058 ──────────
import {
  dimsFromColumns,
  normalizeVariantDimsV34,
  parseVariantKey,
} from '../variants';
import { effectiveMultiplier, effectiveWeightKg, setVolumeKg, totalVolumeKg } from '../volume';
import { snapshotFromSets } from '../personalRecords';
import { dropCatalogRows } from '../../sync/catalogFilter';

test('적재 방식·부착물·그립은 서로 다른 칸 — 같은 종목이라도 키가 갈린다', () => {
  const keys = [
    canonicalVariantKey({ equipment: 'hammer', load: 'pin' }),
    canonicalVariantKey({ equipment: 'hammer', load: 'plate' }),
    canonicalVariantKey({ attach: 'rope' }),
    canonicalVariantKey({ attach: 'straight' }),
    canonicalVariantKey({ grip: 'wide' }),
    canonicalVariantKey({ grip: 'close' }),
    canonicalVariantKey({}),
  ];
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(canonicalVariantKey({ grip: 'wide', attach: 'v', load: 'plate', equipment: 'hoist' }), 'equip:hoist|load:plate|attach:v|grip:wide');
});

test('옛 키는 그대로 해석된다 — 적재·부착물 미지정 = 기존 칸(하위호환)', () => {
  assert.equal(canonicalVariantKey(parseVariantKey('equip:hammer')), 'equip:hammer');
  assert.equal(canonicalVariantKey(parseVariantKey(null)), null);
  const d = parseVariantKey('equip:newtech|load:plate|attach:rope');
  assert.equal(d.load, 'plate');
  assert.equal(d.attach, 'rope');
});

test('저장 컬럼 → dims: 키가 정본, 키 없으면 개별 컬럼·레거시 미러', () => {
  assert.deepEqual(dimsFromColumns({ variantKey: 'equip:hammer|load:pin' }).load, 'pin');
  assert.equal(dimsFromColumns({ variantKey: null, machineVariant: 'cybex' }).equipment, 'cybex');
  assert.equal(dimsFromColumns({ variantKey: null, variantAttach: 'rope' }).attach, 'rope');
});

test('ADR-034 정규화 — 허용 목록 밖 축은 지운다(머신 아니면 load, 케이블 아니면 attach)', () => {
  const pushdown = { baseEquipment: 'cable', attachments: ['rope', 'straight'], grips: ['under'], load: false };
  assert.deepEqual(normalizeVariantDimsV34({ attach: 'rope', grip: 'under', load: 'pin' }, pushdown), {
    attach: 'rope',
    grip: 'under',
    load: null,
    equipment: null,
  });
  assert.equal(normalizeVariantDimsV34({ attach: 'mag_wide' }, pushdown).attach, null);
  const chest = { baseEquipment: 'machine', attachments: [], grips: [], load: true };
  assert.equal(normalizeVariantDimsV34({ equipment: 'hammer', load: 'plate', attach: 'rope' }, chest).attach, null);
  assert.equal(normalizeVariantDimsV34({ equipment: 'machine', load: 'plate' }, chest).equipment, null);
  assert.equal(normalizeVariantDimsV34({ load: 'plate' }, { baseEquipment: 'barbell' }).load, null);
});

test('무게 배수 — null·미지정·0 은 1(QA B1: 옛 세트 볼륨이 0 이 되면 안 된다)', () => {
  assert.equal(effectiveMultiplier({}), 1);
  assert.equal(effectiveMultiplier({ loadMultiplier: null }), 1);
  assert.equal(effectiveMultiplier({ loadMultiplier: 0 }), 1);
  assert.equal(effectiveMultiplier({ loadMultiplier: 2 }), 2);
  const legacy = { weightKg: 80, reps: 10, isWarmup: false, isFailed: false }; // v21 세트(키 없음)
  const migrated = { ...legacy, loadMultiplier: null }; // v22 이관 뒤(optional 컬럼 = null)
  assert.equal(setVolumeKg(legacy), 800);
  assert.equal(setVolumeKg(migrated), 800);
});

test('플레이트 한쪽 40kg × 배수 2 → 볼륨·PR 은 80kg 기준', () => {
  const one = { weightKg: 40, reps: 10, isWarmup: false, isFailed: false, loadMultiplier: 2 };
  assert.equal(effectiveWeightKg(one), 80);
  assert.equal(totalVolumeKg([one]), 800);
  const snap = snapshotFromSets([one]);
  assert.equal(snap.maxWeightKg, 80);
  // 같은 한쪽 40kg 이라도 배수 없는 기록(양쪽 합 40kg)보다 무겁다 — 배수가 PR 비교에 들어간다
  assert.ok(snapshotFromSets([{ ...one, loadMultiplier: null }]).maxWeightKg < snap.maxWeightKg);
});

test('동기 필터(D10) — 시드 종목 행·모르는 표는 버리고 커스텀만 남긴다', () => {
  const out = dropCatalogRows(
    {
      exercises: {
        created: [{ id: 'seed-lat-pulldown', is_custom: false }, { id: 'c1', is_custom: true }],
        updated: [{ id: 'seed-dips', is_custom: false }],
        deleted: ['seed-incline-barbell-press', 'c2'],
      },
      set_logs: { created: [{ id: 's1' }], updated: [], deleted: [] },
      future_table: { created: [{ id: 'x' }], updated: [], deleted: [] },
    } as never,
    new Set(['exercises', 'set_logs']),
  ) as unknown as Record<string, { created: { id: string }[]; updated: unknown[]; deleted: string[] }>;
  assert.deepEqual(out.exercises.created.map((r) => r.id), ['c1']);
  assert.equal(out.exercises.updated.length, 0);
  assert.deepEqual(out.exercises.deleted, ['c2']);
  assert.equal(out.set_logs.created.length, 1);
  assert.equal(out.future_table, undefined);
});
