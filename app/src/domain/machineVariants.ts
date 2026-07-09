// @plm SRS-002 SRS-003  머신 기구(브랜드) 구분 — 같은 머신 종목이라도 브랜드/기구별 무게감이 달라
// 이전기록·PR을 (종목 × 기구)로 분리 추적. 프리웨이트는 미적용(equipment==='machine'에서만 노출).
import type { AppLanguage } from './types';

// 인지도 높은 스트렝스 머신 브랜드(프리셋). 키는 영문 고정(기록 매칭 안정성), 표시명은 언어별.
export const MACHINE_BRAND_KEYS = [
  'hammer',
  'lifefitness',
  'technogym',
  'cybex',
  'precor',
  'matrix',
  'nautilus',
  'hoist',
  'newtech',
  'panatta',
  'gym80',
  'prime',
  'arsenal',
] as const;

// 커스텀 슬롯(전역 공용) — 같은 브랜드·다른 기구(앉아서/누워서 등) 커버. 이름은 사용자가 설정에서 변경.
export const CUSTOM_VARIANT_KEYS = ['custom1', 'custom2', 'custom3'] as const;
export const CUSTOM_VARIANT_COUNT = CUSTOM_VARIANT_KEYS.length;

export type MachineBrandKey = (typeof MACHINE_BRAND_KEYS)[number];
export type CustomVariantKey = (typeof CUSTOM_VARIANT_KEYS)[number];
export type MachineVariantKey = MachineBrandKey | CustomVariantKey;

const BRAND_LABELS: Record<MachineBrandKey, { ko: string; en: string }> = {
  hammer: { ko: '해머스트렝스', en: 'Hammer Strength' },
  lifefitness: { ko: '라이프피트니스', en: 'Life Fitness' },
  technogym: { ko: '테크노짐', en: 'Technogym' },
  cybex: { ko: '사이벡스', en: 'Cybex' },
  precor: { ko: '프리코', en: 'Precor' },
  matrix: { ko: '매트릭스', en: 'Matrix' },
  nautilus: { ko: '너틸러스', en: 'Nautilus' },
  hoist: { ko: '호이스트', en: 'Hoist' },
  newtech: { ko: '뉴텍', en: 'Newtech' },
  panatta: { ko: '파나타', en: 'Panatta' },
  gym80: { ko: '짐80', en: 'Gym80' },
  prime: { ko: '프라임', en: 'Prime Fitness' },
  arsenal: { ko: '아스날', en: 'Arsenal Strength' },
};

function customIndex(key: string): number {
  return (CUSTOM_VARIANT_KEYS as readonly string[]).indexOf(key);
}

// variant 키 → 표시 라벨. null = 기본(미지정). 커스텀은 사용자 지정명(없으면 기본명).
export function machineVariantLabel(
  key: string | null | undefined,
  lang: AppLanguage,
  customLabels: string[] = [],
): string {
  if (!key) return lang === 'ko' ? '기본' : 'Default';
  const ci = customIndex(key);
  if (ci >= 0) {
    const custom = customLabels[ci]?.trim();
    return custom || (lang === 'ko' ? `커스텀 ${ci + 1}` : `Custom ${ci + 1}`);
  }
  return BRAND_LABELS[key as MachineBrandKey]?.[lang] ?? key;
}

// 선택기 옵션 순서: 기본 → 브랜드 → 커스텀.
export const MACHINE_VARIANT_OPTIONS: (MachineVariantKey | null)[] = [
  null,
  ...MACHINE_BRAND_KEYS,
  ...CUSTOM_VARIANT_KEYS,
];
