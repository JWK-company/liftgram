// @plm SRS-055 SRS-056  카탈로그 무결성 검사 — 마스터 표가 지켜야 하는 규칙을 한 곳에 모은다(스펙 0.3 · QA M2·M4·L2·L4).
//
// 순수 함수다(DB·네트워크 없음). 테스트가 생성물(catalog.generated.ts)에 돌려 **통과**를, 옛 시드에 돌려
// **실패**를 확인한다 — 게이트가 정말 막는지 보려는 것이다. 위반은 사람이 읽을 문장 목록으로 돌려준다.
import type { CatalogFamily, CatalogRow, MigrationOverride } from '../data/catalog/catalogTypes';
import { MACHINE_BRAND_KEYS } from './machineVariants';
import { normalizeNameKey, seedIdOf } from './nameKey';

/** 카탈로그가 쓸 수 있는 기구 값 — 도메인 EquipmentType + 개편에서 생긴 EZ바·트랩바(QA H8). */
export const CATALOG_EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'band',
  'smith',
  'other',
  'ezbar',
  'trapbar',
] as const;

/** 이름 접두(ADR-035) — nameRule=prefix 인 종목은 대표 이름이 이것으로 시작한다. */
export const EQUIPMENT_NAME_PREFIX: Record<string, string> = {
  barbell: '바벨',
  dumbbell: '덤벨',
  cable: '케이블',
  machine: '머신',
  smith: '스미스',
  kettlebell: '케틀벨',
  band: '밴드',
  ezbar: 'EZ바',
  trapbar: '트랩바',
};

/** 과거에 soft-delete 된 시드 id — 재사용하면 기기마다 되살아난 옛 행과 부딪친다(운영 sync_records 삭제 표식 3건). */
export const RETIRED_SEED_IDS = [
  'seed-incline-barbell-press',
  'seed-incline-dumbbell-press',
  'seed-incline-chest-press-machine',
];

export interface IntegrityOptions {
  /** 최소 행 수(정본을 실제로 읽었는가) */
  minRows?: number;
  /** 운영 기록이 가리키는 종목 id — delete 금지(QA M6) */
  usedIds?: Iterable<string>;
  overrides?: MigrationOverride[];
}

export function checkCatalogIntegrity(
  rows: CatalogRow[],
  families: CatalogFamily[],
  opts: IntegrityOptions = {},
): string[] {
  const v: string[] = [];
  const byId = new Map<string, CatalogRow>();
  const famByName = new Map(families.map((f) => [f.family, f]));
  const enSeen = new Set<string>();

  if (rows.length < (opts.minRows ?? 1)) v.push(`행 수 ${rows.length} < 최소 ${opts.minRows}`);

  // ── id · nameEn ──
  for (const r of rows) {
    if (r.id !== seedIdOf(r.nameEn)) v.push(`${r.nameEn}: id(${r.id}) ≠ nameEn 슬러그(${seedIdOf(r.nameEn)})`);
    if (byId.has(r.id)) v.push(`id 중복: ${r.id}`);
    byId.set(r.id, r);
    const en = normalizeNameKey(r.nameEn);
    if (enSeen.has(en)) v.push(`nameEn 중복(정규화): ${r.nameEn}`);
    enSeen.add(en);
    if (RETIRED_SEED_IDS.includes(r.id)) v.push(`과거 soft-delete id 재사용: ${r.id}`);
    if (!(CATALOG_EQUIPMENT as readonly string[]).includes(r.equipment)) v.push(`${r.nameEn}: 알 수 없는 기구 ${r.equipment}`);
  }

  const active = rows.filter((r) => !r.isArchived);

  // ── 이름·별칭 유일(활성 행끼리, 공백 무시) ──
  const owner = new Map<string, string>();
  for (const r of active) {
    const keys = new Set(
      [r.nameKo, r.nameEn, ...r.aliasesKo, ...r.aliasesEn].map(normalizeNameKey).filter((k) => k.length > 0),
    );
    for (const k of keys) {
      const prev = owner.get(k);
      if (prev && prev !== r.id) v.push(`이름·별칭 충돌 「${k}」: ${prev} ↔ ${r.id}`);
      else owner.set(k, r.id);
    }
  }

  // ── 병합·삭제 ──
  const used = new Set(opts.usedIds ?? []);
  for (const r of rows) {
    const archivedStatus = r.status === 'merge' || r.status === 'delete';
    if (archivedStatus !== r.isArchived) v.push(`${r.id}: status(${r.status})와 보관 표식이 어긋남`);
    if (!archivedStatus) {
      if (r.mergeInto) v.push(`${r.id}: 활성 종목에 merge_into 가 있음`);
      continue;
    }
    if (r.status === 'delete' && used.has(r.id)) v.push(`${r.id}: 운영 기록이 있는 종목은 delete 할 수 없다(merge 로)`);
    const t = r.mergeInto ? byId.get(r.mergeInto) : undefined;
    if (!t) {
      v.push(`${r.id}: 병합 대상이 없음(${r.mergeInto})`);
      continue;
    }
    if (t.isArchived) v.push(`${r.id}: 병합 대상 ${t.id} 도 보관됨(연쇄·순환 금지)`);
    // 보관 행의 옛 이름은 대상의 별칭이어야 한다 — 옛 이름으로 찾던 사람이 대상에 닿는다(QA M2).
    const targetKeys = new Set([t.nameKo, ...t.aliasesKo].map(normalizeNameKey));
    if (!targetKeys.has(normalizeNameKey(r.nameKo))) v.push(`${r.id}: 옛 이름 「${r.nameKo}」이 대상 ${t.id} 의 별칭에 없음`);
    const fam = famByName.get(t.family);
    const ax = r.impliedAxes;
    if (ax.attach && !fam?.attachments.includes(ax.attach)) v.push(`${r.id}: 함축 부착물 ${ax.attach} 가 ${t.family} 허용 목록 밖`);
    if (ax.grip && !fam?.grips.includes(ax.grip)) v.push(`${r.id}: 함축 그립 ${ax.grip} 가 ${t.family} 허용 목록 밖`);
    if (ax.brand && (t.equipment !== 'machine' || !(MACHINE_BRAND_KEYS as readonly string[]).includes(ax.brand)))
      v.push(`${r.id}: 함축 브랜드 ${ax.brand} 는 머신 대상에만`);
    if (ax.arm && ax.arm !== 'uni') v.push(`${r.id}: 함축 팔 값 ${ax.arm}`);
  }

  // ── family ──
  const famEquip = new Map<string, Set<string>>();
  for (const r of active) {
    if (!r.family) {
      v.push(`${r.id}: family 없음`);
      continue;
    }
    // 유산소는 기구 바꾸기 대상이 아니라 한 묶음(cardio)으로 둔다 — 기구 유일 규칙 밖.
    if (r.kind === 'cardio') continue;
    if (!famByName.has(r.family)) v.push(`${r.id}: family 메타에 없는 ${r.family}`);
    const s = famEquip.get(r.family) ?? new Set<string>();
    if (s.has(r.equipment)) v.push(`family ${r.family} 안에 기구 ${r.equipment} 중복(${r.id})`);
    s.add(r.equipment);
    famEquip.set(r.family, s);
  }
  for (const f of families) {
    const eq = famEquip.get(f.family) ?? new Set<string>();
    if (f.attachments.length && !eq.has('cable')) v.push(`family ${f.family}: 케이블 종목 없이 부착물 축`);
    if (f.load && !eq.has('machine')) v.push(`family ${f.family}: 머신 종목 없이 적재 방식 축`);
  }

  // ── 이름 규칙 ──
  for (const r of active) {
    const prefix = EQUIPMENT_NAME_PREFIX[r.equipment];
    if (r.nameRule === 'prefix' && !(prefix && r.nameKo.startsWith(prefix)))
      v.push(`${r.id}: 이름 규칙 prefix 인데 「${r.nameKo}」가 「${prefix ?? '?'}」로 시작하지 않음`);
    if (r.nameRule === 'bodyweight' && r.equipment !== 'bodyweight') v.push(`${r.id}: bodyweight 규칙인데 기구 ${r.equipment}`);
    if (!['prefix', 'intrinsic', 'bodyweight'].includes(r.nameRule)) v.push(`${r.id}: 이름 규칙 없음`);
  }

  // ── 비슷한 운동 참조 ──
  const enSet = new Set(rows.map((r) => r.nameEn));
  for (const r of rows)
    for (const s of r.similar) if (!famByName.has(s) && !enSet.has(s)) v.push(`${r.id}: similar 참조가 끊김 — ${s}`);

  // ── 이관 예외 표 ──
  for (const o of opts.overrides ?? []) {
    if (!byId.has(o.sourceId)) v.push(`예외 표: 원 종목 없음 ${o.sourceId}`);
    const t = byId.get(o.targetId);
    if (!t || t.isArchived) v.push(`예외 표: 대상이 없거나 보관됨 ${o.targetId}`);
  }

  return v;
}
