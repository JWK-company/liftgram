// @plm SRS-055  종목 픽토그램 — 커버리지 100%(근력·유산소) · 자세 데이터 무결성 · 그림 출처 라이선스 허용 목록(ADR-036)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, CATALOG_FAMILIES } from '../../data/catalog/catalog.generated';
import { MEDIA_KEY_BY_ID } from '../../data/exerciseMediaKeys.data';
import { RAW_MEDIA } from '../../data/exerciseMedia.data';
import { BORROWED_PHOTO_IDS } from '../../data/exerciseMediaOwn.data';
import { getExerciseMediaOwn } from '../../data/exerciseMedia';
import { VISUAL_LICENSE_ALLOWLIST, VISUAL_SOURCES, hasPictogram, visualSourcesFor } from '../../data/exerciseVisual';
import { ARCH } from '../../data/pictograms/poses';
import {
  CARDIO_ARCH,
  FAMILY_ARCH,
  pictogramFrames,
  pictogramSvg,
  resolveArch,
  specFor,
  specForId,
  viewBoxFor,
} from '../../data/pictograms/render';
import { joints, lerpPose } from '../../data/pictograms/rig';

const active = CATALOG.filter((r) => !r.isArchived);
const strength = active.filter((r) => r.kind !== 'cardio');
const cardio = active.filter((r) => r.kind === 'cardio');

test('근력 종목 100% 픽토그램(성공 기준 6)', () => {
  const missing = strength.filter((r) => !specFor(r)).map((r) => `${r.nameKo}(${r.family})`);
  assert.deepEqual(missing, []);
  assert.ok(strength.length > 400, `근력 종목 수가 이상하다: ${strength.length}`);
});

test('유산소 종목도 전부 그림이 있다', () => {
  const missing = cardio.filter((r) => !specFor(r)).map((r) => r.nameEn);
  assert.deepEqual(missing, []);
});

test('카탈로그의 모든 동작 그룹이 원형을 갖고, 원형 이름은 실재한다', () => {
  const families = new Set(CATALOG_FAMILIES.map((f) => f.family));
  families.delete('cardio');
  for (const f of families) assert.ok(FAMILY_ARCH[f], `원형 없는 family: ${f}`);
  const names = [
    ...Object.values(FAMILY_ARCH).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v))),
    ...Object.values(CARDIO_ARCH),
  ];
  for (const n of names) assert.ok(ARCH[n], `없는 원형: ${n}`);
  for (const [k, a] of Object.entries(ARCH)) {
    for (const u of Object.values(a.use ?? {})) assert.ok(ARCH[u as string], `${k}.use → 없는 원형 ${u}`);
  }
});

test('모든 원형의 시작·끝 자세가 같은 시점(옆/앞)이다 — 섞으면 움직임이 튄다', () => {
  for (const [k, a] of Object.entries(ARCH)) {
    assert.equal(a.start.view ?? 'side', a.end.view ?? 'side', k);
  }
});

test('모든 종목의 그림이 숫자만으로 된 올바른 SVG 다(NaN·undefined 없음)', () => {
  for (const r of active) {
    const spec = specFor(r);
    if (!spec) continue;
    const svg = pictogramSvg(spec);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), r.nameKo);
    assert.ok(!/NaN|undefined|Infinity/.test(svg), `${r.nameKo}: ${svg.match(/.{20}(NaN|undefined|Infinity).{10}/)?.[0]}`);
    const vb = viewBoxFor(spec).split(' ').map(Number);
    assert.equal(vb.length, 4);
    assert.ok(vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0, r.nameKo);
  }
});

test('움직임 프레임의 관절이 창(viewBox) 밖으로 나가지 않는다 — 머리·손이 잘리지 않게', () => {
  for (const r of active) {
    const spec = specFor(r);
    if (!spec) continue;
    const [x, y, w, h] = viewBoxFor(spec).split(' ').map(Number);
    const a = resolveArch(spec);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const j = joints(lerpPose(a.start, a.end, t));
      for (const [name, p] of Object.entries(j)) {
        assert.ok(p[0] >= x - 1 && p[0] <= x + w + 1 && p[1] >= y - 1 && p[1] <= y + h + 1, `${r.nameKo} t=${t} ${name} (${p}) ∉ ${x},${y},${w},${h}`);
      }
    }
  }
});

test('프레임 수 · 같은 종목은 같은 창', () => {
  const spec = specForId('seed-barbell-bench-press');
  assert.ok(spec);
  const frames = pictogramFrames(spec, 6);
  assert.equal(frames.length, 7);
  const vbs = new Set(frames.map((f) => f.match(/viewBox="([^"]+)"/)?.[1]));
  assert.equal(vbs.size, 1);
});

test('대표 종목의 원형·기구·강조가 맞다', () => {
  assert.deepEqual(specForId('seed-barbell-bench-press'), { arch: 'bench_press', equip: 'barbell', muscle: 'chest' });
  assert.equal(specForId('seed-lat-pulldown')?.arch, 'lat_pulldown');
  // 기구가 원형을 바꾼다: 머신 체스트 프레스는 앉아서
  const machineChest = specForId('seed-chest-press-machine');
  assert.ok(machineChest);
  assert.ok(resolveArch(machineChest) === ARCH.chest_press);
  assert.equal(specForId('seed-rowing-machine')?.arch, 'row');
  assert.equal(specForId('seed-not-a-thing'), null);
});

test('hasPictogram 은 시드 종목이면 참 — 그리고 실제로 그림이 있다', () => {
  for (const r of active) assert.equal(hasPictogram(r.id), true);
  for (const r of active) assert.ok(specForId(r.id), `${r.nameKo}`);
  assert.equal(hasPictogram('custom-abc'), false);
  assert.equal(hasPictogram(null), false);
});

test('그림 출처는 허용 목록 라이선스만 — 출처 표기 의무가 있는 라이선스 없음', () => {
  for (const r of active) {
    for (const s of visualSourcesFor(r.media)) {
      assert.ok(VISUAL_LICENSE_ALLOWLIST.includes(s.license), `${r.nameKo}: ${s.kind}/${s.license}`);
    }
    assert.equal(visualSourcesFor(r.media)[0]?.kind, 'picto', r.nameKo);
  }
  // AI 일러스트는 허용 목록에 들기 전까지 나오지 않는다
  assert.ok(!visualSourcesFor('ai:bench').some((s) => s.kind === 'ai'));
  assert.ok(!VISUAL_LICENSE_ALLOWLIST.includes(VISUAL_SOURCES.ai.license));
  assert.ok(!(VISUAL_LICENSE_ALLOWLIST as readonly string[]).some((l) => /cc-by/i.test(l)));
});

test('빌린 사진 목록이 규칙과 어긋나지 않는다(드리프트 방지) · 빌린 종목은 사진이 비고 설명은 남는다', () => {
  const TOK: [RegExp, string][] = [
    [/barbell/i, 'barbell'],
    [/dumbbell/i, 'dumbbell'],
    [/cable/i, 'cable'],
    [/machine|leverage|lever/i, 'machine'],
    [/smith/i, 'smith'],
    [/kettlebell/i, 'kettlebell'],
    [/ez-bar|ez_bar/i, 'ezbar'],
    [/band/i, 'band'],
    [/bodyweight/i, 'bodyweight'],
    [/plate/i, 'other'],
  ];
  const MANUAL = ['seed-assisted-chin-up', 'seed-assisted-dip', 'seed-decline-sit-up', 'seed-landmine-press'];
  const ruled: string[] = [];
  for (const r of active) {
    const key = MEDIA_KEY_BY_ID[r.id];
    if (!key) continue;
    const raw = RAW_MEDIA[key] ?? RAW_MEDIA[key.replace(/\s*\([^)]*\)\s*$/, '').trim()];
    if (!raw?.s) continue;
    const folder = raw.s.split('/')[0];
    const own = r.media?.startsWith('fedb:') ? r.media.slice(5) : null;
    if (own === folder) continue;
    const eqs = TOK.filter(([re]) => re.test(folder)).map(([, e]) => e);
    if (own != null || (eqs.length > 0 && !eqs.includes(r.equipment))) ruled.push(r.id);
  }
  assert.deepEqual([...BORROWED_PHOTO_IDS].sort(), [...ruled, ...MANUAL].sort());
  const m = getExerciseMediaOwn('seed-incline-press-dumbbell');
  assert.ok(m);
  assert.equal(m.start, '');
  assert.ok(m.instructionsKo.length > 0);
  // 자기 사진은 그대로
  assert.ok(getExerciseMediaOwn('seed-barbell-bench-press')?.start.includes('Barbell_Bench_Press'));
});
