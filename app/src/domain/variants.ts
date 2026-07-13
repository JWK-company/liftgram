// @plm SRS-028  종목 변형(variant) 일반화 — 같은 종목이라도 기구·그립·팔모드가 수행 무게를 바꾸므로
// (종목 × variant_key) 버킷으로 이전기록·PR·볼륨을 분리 추적. machine_variant(v5)를 equipment 차원으로 흡수(무손실).
// 순수 도메인(RN 의존 0). 계산·리포지토리·UI가 공유.
import type { AppLanguage, EquipmentType } from './types';
import { MACHINE_BRAND_KEYS, CUSTOM_VARIANT_KEYS, machineVariantLabel, machineVariantShortLabel } from './machineVariants';

// --- 차원 값공간 ---
export const GRIP_KEYS = ['over', 'under', 'neutral', 'wide', 'close'] as const;
export type GripKey = (typeof GRIP_KEYS)[number];
export type ArmKey = 'bi' | 'uni'; // bi(양팔)=기본=null, uni(원암)만 별도 버킷

// equipment 변형 차원: 머신 종목은 브랜드/커스텀, 프리웨이트는 대체 기구로 전환(#21).
export const IMPLEMENT_KEYS: EquipmentType[] = ['barbell', 'dumbbell', 'machine', 'cable', 'smith', 'kettlebell'];

export interface VariantDims {
  equipment?: string | null; // 브랜드/커스텀 키 또는 implement type. null=기본
  grip?: GripKey | null;
  arm?: ArmKey | null; // null|'bi'=기본
}

const norm = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

// canonical 버킷 키 — 고정순서 [equip, grip, arm], "dim:value" 를 "|"로 조인. 전부 기본 → null(v5 기본버킷과 동일 표현 = 하위호환).
export function canonicalVariantKey(v: VariantDims): string | null {
  const parts: string[] = [];
  const eq = norm(v.equipment);
  const gr = norm(v.grip);
  const ar = v.arm === 'uni' ? 'uni' : null;
  if (eq) parts.push(`equip:${eq}`);
  if (gr) parts.push(`grip:${gr}`);
  if (ar) parts.push(`arm:${ar}`);
  return parts.length ? parts.join('|') : null;
}

export function parseVariantKey(key: string | null | undefined): VariantDims {
  const out: VariantDims = { equipment: null, grip: null, arm: null };
  if (!key) return out;
  for (const seg of key.split('|')) {
    const i = seg.indexOf(':');
    if (i < 0) continue;
    const dim = seg.slice(0, i);
    const val = seg.slice(i + 1) || null;
    if (dim === 'equip') out.equipment = val;
    else if (dim === 'grip') out.grip = (val as GripKey) ?? null;
    else if (dim === 'arm') out.arm = (val as ArmKey) ?? null;
  }
  return out;
}

// 쓰기용 — 선택 차원에서 저장 컬럼 파생(variant_key + 개별 차원).
export function variantColumns(v: VariantDims): {
  variantKey: string | null;
  variantEquipment: string | null;
  variantGrip: string | null;
  variantArm: string | null;
} {
  return {
    variantKey: canonicalVariantKey(v),
    variantEquipment: norm(v.equipment),
    variantGrip: v.grip ?? null,
    variantArm: v.arm === 'uni' ? 'uni' : null,
  };
}

// v5 machine_variant(브랜드/커스텀 키) → v6 차원/키 무손실 승계. 브랜드는 equipment 차원으로.
export function legacyMachineVariantToV6(mv: string | null | undefined): { dims: VariantDims; key: string | null } {
  const dims: VariantDims = { equipment: norm(mv), grip: null, arm: null };
  return { dims, key: canonicalVariantKey(dims) };
}

// --- 라벨 ---
const GRIP_LABELS: Record<GripKey, { ko: string; en: string }> = {
  over: { ko: '오버그립', en: 'Overhand' },
  under: { ko: '언더그립', en: 'Underhand' },
  neutral: { ko: '뉴트럴그립', en: 'Neutral' },
  wide: { ko: '와이드그립', en: 'Wide grip' },
  close: { ko: '클로즈그립', en: 'Close grip' },
};
// 축약 그립 라벨 — 변형 칩(트리거)용. 여러 차원이 잘리지 않고 모두 보이도록 짧게.
const GRIP_SHORT_LABELS: Record<GripKey, { ko: string; en: string }> = {
  over: { ko: '오버', en: 'Over' },
  under: { ko: '언더', en: 'Under' },
  neutral: { ko: '뉴트럴', en: 'Neutral' },
  wide: { ko: '와이드', en: 'Wide' },
  close: { ko: '클로즈', en: 'Close' },
};
const IMPLEMENT_LABELS: Partial<Record<EquipmentType, { ko: string; en: string }>> = {
  barbell: { ko: '바벨', en: 'Barbell' },
  dumbbell: { ko: '덤벨', en: 'Dumbbell' },
  machine: { ko: '머신', en: 'Machine' },
  cable: { ko: '케이블', en: 'Cable' },
  smith: { ko: '스미스', en: 'Smith' },
  kettlebell: { ko: '케틀벨', en: 'Kettlebell' },
};

export function equipmentVariantLabel(key: string | null | undefined, lang: AppLanguage, customLabels: string[] = []): string {
  if (!key) return lang === 'ko' ? '기본' : 'Default';
  const impl = IMPLEMENT_LABELS[key as EquipmentType];
  if (impl) return impl[lang];
  return machineVariantLabel(key, lang, customLabels); // 브랜드/커스텀
}
export function gripLabel(key: GripKey | null | undefined, lang: AppLanguage): string {
  return key ? GRIP_LABELS[key]?.[lang] ?? key : '';
}
export function armLabel(key: ArmKey | null | undefined, lang: AppLanguage): string {
  // 팔뿐 아니라 다리(원레그/투레그)에도 쓰이는 편측(unilateral) 차원 — 라벨에 다리 병기.
  if (key === 'uni') return lang === 'ko' ? '원암(원레그)' : 'Single-arm/leg';
  if (key === 'bi') return lang === 'ko' ? '투암(투레그)' : 'Two-arm/leg';
  return '';
}

// --- 축약 라벨 (변형 칩/트리거용 — 모든 차원이 잘리지 않게) ---
export function equipmentVariantShortLabel(key: string | null | undefined, lang: AppLanguage, customLabels: string[] = []): string {
  if (!key) return lang === 'ko' ? '기본' : 'Default';
  const impl = IMPLEMENT_LABELS[key as EquipmentType];
  if (impl) return impl[lang]; // 바벨/덤벨/머신… 이미 짧음
  return machineVariantShortLabel(key, lang, customLabels); // 브랜드는 짧게, 커스텀은 그대로
}
export function gripShortLabel(key: GripKey | null | undefined, lang: AppLanguage): string {
  return key ? GRIP_SHORT_LABELS[key]?.[lang] ?? key : '';
}
export function armShortLabel(key: ArmKey | null | undefined, lang: AppLanguage): string {
  return key === 'uni' ? (lang === 'ko' ? '원암(원레그)' : '1-arm/leg') : '';
}

// 종합 라벨 — "해머 · 언더그립 · 원암". 전부 기본이면 '기본'.
export function variantLabel(v: VariantDims, lang: AppLanguage, customLabels: string[] = []): string {
  const parts: string[] = [];
  if (norm(v.equipment)) parts.push(equipmentVariantLabel(v.equipment, lang, customLabels));
  const g = gripLabel(v.grip, lang);
  if (g) parts.push(g);
  const a = armLabel(v.arm, lang);
  if (a) parts.push(a);
  return parts.length ? parts.join(' · ') : lang === 'ko' ? '기본' : 'Default';
}
export function variantLabelFromKey(key: string | null | undefined, lang: AppLanguage, customLabels: string[] = []): string {
  return variantLabel(parseVariantKey(key), lang, customLabels);
}

// 축약 종합 라벨 — "해머 · 언더 · 원암"(EN "Hammer · Under · 1-arm"). 트리거 칩에서 모든 차원 표시용.
export function variantShortLabel(v: VariantDims, lang: AppLanguage, customLabels: string[] = []): string {
  const parts: string[] = [];
  if (norm(v.equipment)) parts.push(equipmentVariantShortLabel(v.equipment, lang, customLabels));
  const g = gripShortLabel(v.grip, lang);
  if (g) parts.push(g);
  const a = armShortLabel(v.arm, lang);
  if (a) parts.push(a);
  return parts.length ? parts.join(' · ') : lang === 'ko' ? '기본' : 'Default';
}
export function variantShortLabelFromKey(key: string | null | undefined, lang: AppLanguage, customLabels: string[] = []): string {
  return variantShortLabel(parseVariantKey(key), lang, customLabels);
}

// --- 선택기 옵션 ---
// equipment는 종목 기본 기구에 따라: 머신이면 브랜드+커스텀, 아니면 대체 기구.
export function equipmentOptionsFor(
  baseEquipment: EquipmentType | null | undefined,
  selected?: string | null,
): (string | null)[] {
  if (baseEquipment === 'machine') return [null, ...MACHINE_BRAND_KEYS, ...CUSTOM_VARIANT_KEYS];
  const base: (string | null)[] = [null, ...IMPLEMENT_KEYS];
  // 프리웨이트 종목에서 '머신'(또는 특정 브랜드)을 고르면 브랜드 옵션을 이어서 노출(#13 · 머신 선택 시 브랜드).
  const sel = selected ?? '';
  const isMachineSel =
    sel === 'machine' ||
    (MACHINE_BRAND_KEYS as readonly string[]).includes(sel) ||
    (CUSTOM_VARIANT_KEYS as readonly string[]).includes(sel);
  return isMachineSel ? [...base, ...MACHINE_BRAND_KEYS, ...CUSTOM_VARIANT_KEYS] : base;
}
export const GRIP_OPTIONS: (GripKey | null)[] = [null, ...GRIP_KEYS];
export const ARM_OPTIONS: (ArmKey | null)[] = ['bi', 'uni'];
