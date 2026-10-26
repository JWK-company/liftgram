// @plm SRS-057  기록 블록 이관 계획 — 한 종목 인스턴스(운동·루틴 블록)를 새 카탈로그 규칙으로 어디에 둘지 정한다.
//
// ─────────────────────────────────────────────────────────────────────────────
// 서버 이관(정본)과 기기 정규화(미동기분·옛 클라이언트가 올린 옛 형식)가 **이 함수 하나**를 쓴다.
// 그래야 어느 쪽이 먼저 돌든, 몇 번 돌든 같은 결과로 수렴한다(멱등 — QA H1·H2).
//
// 규칙(spec _context.md §3 + QA H6·H9) — 고정점까지 최대 3바퀴
//   0. variant_key 가 비고 레거시 machine_variant 만 있으면 그 값을 기구 축으로 읽는다(V6 의미)
//   1. 보관(merge·delete) 종목 → 대상 종목 + 함축 축(브랜드·부착물·그립, 원암은 세트에)
//   ·  명시 예외 표(원 종목 × 기구 값) → 대상 종목
//   2. 기구 변형 칸(barbell·dumbbell·cable·smith·kettlebell·band·machine)이 고유 기구와 다르면 →
//      같은 family 의 그 기구 종목으로 교체, 기구 축 비움. 고유 기구와 같으면 그냥 비움
//   3. 비머신 종목 + 머신 브랜드 키 → 같은 family 의 머신 종목 + 같은 브랜드
//   대상이 없으면 **옮기지 않고** 이유를 남긴다(엉뚱한 종목 금지) — 커스텀 슬롯(custom1~3)은 비머신이면 유지
// 마지막에 ADR-034 정규화(허용 목록 밖 축 제거)로 키를 다시 만든다.
// ─────────────────────────────────────────────────────────────────────────────
import type { CatalogFamily, CatalogRow, MigrationOverride } from '../data/catalog/catalogTypes';
import { CUSTOM_VARIANT_KEYS, MACHINE_BRAND_KEYS } from './machineVariants';
import {
  IMPLEMENT_KEYS,
  dimsFromColumns,
  normalizeVariantDimsV34,
  variantColumns,
  type AttachKey,
  type GripKey,
  type VariantDims,
} from './variants';

/** 블록의 변형 관련 컬럼(workout_exercises·routine_exercises 공통). */
export interface BlockColumns {
  exerciseId: string;
  variantKey: string | null;
  variantEquipment: string | null;
  variantGrip: string | null;
  variantArm: string | null;
  variantLoad?: string | null;
  variantAttach?: string | null;
  machineVariant: string | null;
}

export type KeepReason =
  | 'unknown-exercise' // 카탈로그에 없는 종목(커스텀 등) — 손대지 않는다
  | 'no-sibling' // 같은 family 에 그 기구 종목이 없다
  | 'custom-on-non-machine' // 비머신 종목의 커스텀 슬롯 — 고를 수 없게 됐지만 기록은 그대로 둔다
  | 'brand-no-machine'; // 비머신 종목 + 브랜드인데 family 에 머신이 없다

export interface BlockPlan {
  /** 바뀌는 것이 있는가 */
  changed: boolean;
  exerciseId: string;
  columns: ReturnType<typeof variantColumns> & { machineVariant: null };
  /** 이 블록의 세트들에 원암(arm=uni)을 붙인다(함축 축) */
  setArmUni: boolean;
  /** 옮기지 못하고 남긴 이유(리포트용) */
  kept: KeepReason[];
  /** 어떤 규칙이 적용됐나(리포트·테스트용) */
  steps: string[];
}

export interface CatalogIndex {
  byId: Map<string, CatalogRow>;
  family: Map<string, CatalogFamily>;
  /** family → 기구 → 활성 종목 id */
  sibling: Map<string, Map<string, string>>;
  override: Map<string, MigrationOverride>;
}

export function buildCatalogIndex(
  rows: CatalogRow[],
  families: CatalogFamily[],
  overrides: MigrationOverride[] = [],
): CatalogIndex {
  const sibling = new Map<string, Map<string, string>>();
  for (const r of rows) {
    if (r.isArchived) continue;
    const m = sibling.get(r.family) ?? new Map<string, string>();
    m.set(r.equipment, r.id);
    sibling.set(r.family, m);
  }
  return {
    byId: new Map(rows.map((r) => [r.id, r])),
    family: new Map(families.map((f) => [f.family, f])),
    sibling,
    override: new Map(overrides.map((o) => [`${o.sourceId}|${o.variantEquipment}`, o])),
  };
}

const isImplement = (k: string) => (IMPLEMENT_KEYS as string[]).includes(k);
const isBrand = (k: string) => (MACHINE_BRAND_KEYS as readonly string[]).includes(k);
const isCustom = (k: string) => (CUSTOM_VARIANT_KEYS as readonly string[]).includes(k);

export function planBlockMigration(block: BlockColumns, idx: CatalogIndex): BlockPlan {
  const steps: string[] = [];
  const kept: KeepReason[] = [];
  let exerciseId = block.exerciseId;
  // 규칙 0: 레거시 미러만 있는 블록 — dimsFromColumns 가 machine_variant 를 기구 축으로 읽는다(H9).
  const dims: VariantDims = { ...dimsFromColumns(block), arm: null };
  if (!block.variantKey && !block.variantEquipment && block.machineVariant) steps.push('0:legacy-mirror');
  // 블록 단위 원암(옛 v6 의미)은 세트 속성으로 내린다(ADR-034 — 팔은 키에 넣지 않는다).
  let setArmUni = block.variantArm === 'uni';

  for (let pass = 0; pass < 3; pass++) {
    const row = idx.byId.get(exerciseId);
    if (!row) {
      if (!kept.includes('unknown-exercise')) kept.push('unknown-exercise');
      break;
    }
    // 규칙 1: 보관 종목 → 대상 + 함축 축
    if (row.isArchived && row.mergeInto) {
      exerciseId = row.mergeInto;
      const ax = row.impliedAxes;
      if (ax.brand && !dims.equipment) dims.equipment = ax.brand;
      if (ax.attach && !dims.attach) dims.attach = ax.attach as AttachKey;
      if (ax.grip && !dims.grip) dims.grip = ax.grip as GripKey;
      if (ax.arm === 'uni') setArmUni = true;
      steps.push(`1:merge→${exerciseId}`);
      continue;
    }
    const eq = dims.equipment ?? null;
    if (!eq) break;
    const ovr = idx.override.get(`${exerciseId}|${eq}`);
    if (ovr) {
      exerciseId = ovr.targetId;
      dims.equipment = ovr.axes.brand ?? null;
      if (ovr.axes.attach) dims.attach = ovr.axes.attach as AttachKey;
      if (ovr.axes.grip) dims.grip = ovr.axes.grip as GripKey;
      if (ovr.axes.arm === 'uni') setArmUni = true;
      steps.push(`ovr→${exerciseId}`);
      continue;
    }
    // 규칙 2: 기구 변형 칸 → 형제 종목
    if (isImplement(eq)) {
      if (eq === row.equipment) {
        dims.equipment = null;
        steps.push('2:intrinsic');
        break;
      }
      const sib = idx.sibling.get(row.family)?.get(eq);
      if (sib) {
        exerciseId = sib;
        dims.equipment = null;
        steps.push(`2:sibling→${sib}`);
        continue;
      }
      kept.push('no-sibling');
      break;
    }
    // 규칙 3: 비머신 종목 + 브랜드 → 머신 종목 + 같은 브랜드
    if (row.equipment !== 'machine') {
      if (isCustom(eq)) {
        kept.push('custom-on-non-machine');
        break;
      }
      if (isBrand(eq)) {
        const sib = idx.sibling.get(row.family)?.get('machine');
        if (sib) {
          exerciseId = sib;
          steps.push(`3:brand→${sib}`);
          continue;
        }
        kept.push('brand-no-machine');
      }
    }
    break;
  }

  // 카탈로그 밖 종목(커스텀)은 건드리지 않는다.
  if (kept.includes('unknown-exercise') && exerciseId === block.exerciseId) {
    return {
      changed: false,
      exerciseId,
      columns: { ...variantColumns(dimsFromColumns(block)), machineVariant: null },
      setArmUni: false,
      kept,
      steps,
    };
  }
  const final = idx.byId.get(exerciseId);
  const fam = final ? idx.family.get(final.family) : undefined;
  // 남겨 둔 칸(kept)은 고칠 수 없으므로 정규화로 지우지 않는다 — 기록 칸이 사라지면 다른 칸과 섞인다.
  const norm = final
    ? kept.length
      ? dims
      : normalizeVariantDimsV34(dims, {
          baseEquipment: final.equipment,
          attachments: fam?.attachments,
          grips: fam?.grips,
          load: fam?.load,
        })
    : dims;
  const columns = { ...variantColumns(norm), machineVariant: null as null };
  const changed =
    exerciseId !== block.exerciseId ||
    setArmUni ||
    columns.variantKey !== (block.variantKey ?? null) ||
    columns.variantEquipment !== (block.variantEquipment ?? null) ||
    columns.variantGrip !== (block.variantGrip ?? null) ||
    columns.variantLoad !== (block.variantLoad ?? null) ||
    columns.variantAttach !== (block.variantAttach ?? null) ||
    block.machineVariant != null;
  return { changed, exerciseId, columns, setArmUni, kept, steps };
}
