// SPDX-License-Identifier: GPL-3.0-or-later
// 카탈로그 전 종목 → 3D 모션 제작 입력(JSON). 픽토그램 자세(core/data/pictograms)가 원본이다.
// 사용: npx tsx scripts/motion/export-specs.ts <출력.json>
import { writeFileSync } from 'node:fs';
import { CATALOG } from '../../core/src/data/catalog/catalog.generated';
import { specFor, resolveArch } from '../../core/src/data/pictograms/render';
import { ARCH } from '../../core/src/data/pictograms/poses';

const archName = (a: unknown) => Object.entries(ARCH).find(([, v]) => v === a)?.[0] ?? null;
const rows: unknown[] = [];
const clips: Record<string, unknown> = {};
for (const r of CATALOG as any[]) {
  const spec = specFor(r);
  if (!spec) { rows.push({ id: r.id, nameKo: r.nameKo, key: null }); continue; }
  const a = resolveArch(spec);
  const arch = archName(a);
  const prim = [...new Set((r.primaryMuscles ?? []) as string[])].sort();
  const key = `${arch}__${spec.equip}__${r.kind === 'cardio' ? 'cardio' : prim.join('+') || 'none'}`;
  rows.push({ id: r.id, nameKo: r.nameKo, nameEn: r.nameEn, family: r.family, equip: spec.equip, kind: r.kind, primary: prim, key });
  clips[key] ??= { key, arch, equip: spec.equip, kind: r.kind, primary: prim, exampleKo: r.nameKo, exampleEn: r.nameEn, data: a };
}
writeFileSync(process.argv[2], JSON.stringify({ rows, clips }, null, 0));
const keys = Object.keys(clips);
console.log('rows', rows.length, 'noSpec', (rows as any[]).filter((x) => !x.key).length, 'clips', keys.length, 'archs', new Set(keys.map((k) => k.split('__')[0])).size);
