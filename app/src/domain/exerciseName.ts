// 운동명 언어 선택 — 한국어/영어 운동 DB(SRS-013). 모델 의존 없이 최소 형태만 받아 도메인 순수 유지.
// 규칙: en이면 nameEn 우선(없으면 nameKo 폴백), ko면 nameKo. alt는 보조로 표시할 '다른 언어 이름'.
// @plm SRS-013
import type { AppLanguage } from './types';

export interface NamedExercise {
  nameKo: string;
  nameEn?: string | null;
}

export function exerciseDisplayName(ex: NamedExercise, lang: AppLanguage = 'ko'): string {
  if (lang === 'en') return ex.nameEn?.trim() || ex.nameKo;
  return ex.nameKo;
}

// 보조 표기(부제) — 현재 언어 외의 다른 언어 이름. 동일하거나 없으면 null.
export function exerciseAltName(ex: NamedExercise, lang: AppLanguage = 'ko'): string | null {
  const primary = exerciseDisplayName(ex, lang);
  const other = lang === 'en' ? ex.nameKo : ex.nameEn?.trim() || null;
  return other && other !== primary ? other : null;
}
