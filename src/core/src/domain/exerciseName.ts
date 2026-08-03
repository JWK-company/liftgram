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

// --- 기구 변형 종목명 처리(SRS-028) ---
// '바벨 벤치프레스'/'벤치프레스 (바벨)'처럼 기구가 이름에 포함된 종목을 베이스명 + 기구로 분리.
// 세션에선 베이스명('벤치프레스')만 + 변형 태그(바벨), 목록에선 '벤치프레스 (바벨)'. @plm SRS-028
export interface EquippedExercise extends NamedExercise {
  equipment?: string | null;
  kind?: string | null; // 'cardio'면 기구 변형 표기 제외.
}
const EQUIP_NAME_TOKENS: Record<string, { ko: string; en: string }> = {
  barbell: { ko: '바벨', en: 'Barbell' },
  dumbbell: { ko: '덤벨', en: 'Dumbbell' },
  machine: { ko: '머신', en: 'Machine' },
  cable: { ko: '케이블', en: 'Cable' },
  smith: { ko: '스미스', en: 'Smith' },
  kettlebell: { ko: '케틀벨', en: 'Kettlebell' },
};

// 종목명에서 (해당 종목의 기구) 토큰을 접두 '바벨 ' 또는 괄호접미 ' (바벨)'로 떼어 베이스명 반환.
// 기구 토큰이 없으면 원래 이름 그대로. '데드리프트'→'데드리프트', '사이드 레터럴 레이즈'→그대로.
export function baseExerciseName(ex: EquippedExercise, lang: AppLanguage = 'ko'): string {
  const name = exerciseDisplayName(ex, lang);
  if (ex.kind === 'cardio') return name; // 유산소는 기구 변형 표기 안 함(로잉 머신 등)
  const tok = ex.equipment ? EQUIP_NAME_TOKENS[ex.equipment] : null;
  if (!tok) return name;
  const label = tok[lang] ?? tok.ko;
  // 괄호접미 ' (바벨)'
  const paren = ` (${label})`;
  if (name.endsWith(paren)) return name.slice(0, -paren.length).trim();
  // 접두 '바벨 '
  if (name.startsWith(label + ' ')) return name.slice(label.length + 1).trim();
  // 후미 단어 ' 머신'('체스트 프레스 머신'→'체스트 프레스'). 이름이 기구 단어만인 경우는 제외.
  const trailing = ` ${label}`;
  if (name.endsWith(trailing) && name.length > trailing.length) return name.slice(0, -trailing.length).trim();
  return name;
}

// 이름에 기구 토큰이 있는(=베이스명이 원본과 다른) 종목인지.
export function hasEquipmentInName(ex: EquippedExercise, lang: AppLanguage = 'ko'): boolean {
  return baseExerciseName(ex, lang) !== exerciseDisplayName(ex, lang);
}

// 목록/피커 표기 — 베이스명 + ' (기구)'. 기구 토큰이 이름에 없으면 원래 이름 그대로.
export function exerciseListName(ex: EquippedExercise, lang: AppLanguage = 'ko'): string {
  const base = baseExerciseName(ex, lang);
  const full = exerciseDisplayName(ex, lang);
  if (base === full) return full;
  const tok = ex.equipment ? EQUIP_NAME_TOKENS[ex.equipment] : null;
  const label = tok ? (tok[lang] ?? tok.ko) : '';
  return label ? `${base} (${label})` : base;
}
