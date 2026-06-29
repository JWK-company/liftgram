// 경량 i18n — ko/en 리소스 + t()/useT(). 네이티브 의존 없는 순수 React 레이어.
// 언어는 userContext.language(=UserProfile.preferredLanguage)를 SSOT로 따른다(토글 시 자동 리렌더).
// @plm SRS-013
import { useCallback } from 'react';
import { useUser } from '../state/userContext';
import type { AppLanguage } from '../domain';
import { ko, type TransKey } from './locales/ko';
import { en } from './locales/en';

const RESOURCES: Record<AppLanguage, Record<TransKey, string>> = { ko, en };

export type { TransKey };
export type TransVars = Record<string, string | number>;

// {name} 플레이스홀더 치환. replaceAll/regex 회피(Hermes 호환·키 이스케이프 불필요) — split/join.
function interpolate(template: string, vars?: TransVars): string {
  if (!vars) return template;
  let out = template;
  for (const k of Object.keys(vars)) {
    out = out.split(`{${k}}`).join(String(vars[k]));
  }
  return out;
}

export function translate(lang: AppLanguage, key: TransKey, vars?: TransVars): string {
  const table = RESOURCES[lang] ?? RESOURCES.ko;
  // 누락 키는 ko로 폴백, 그래도 없으면 키 자체를 노출(개발 중 누락 가시화).
  const template = table[key] ?? RESOURCES.ko[key] ?? key;
  return interpolate(template, vars);
}

// ── 모듈 레벨 활성 언어 ──────────────────────────────────────────────
// 훅을 쓸 수 없는 비컴포넌트(알림 기본 버튼 등 렌더 밖 호출)용. <LanguageSync/>가 갱신.
let activeLang: AppLanguage = 'ko';
export function setActiveLang(l: AppLanguage): void {
  activeLang = l;
}
export function getActiveLang(): AppLanguage {
  return activeLang;
}

// imperative — 이벤트 핸들러·유틸 등 렌더 밖에서 사용. 현재 활성 언어 기준.
export function t(key: TransKey, vars?: TransVars): string {
  return translate(activeLang, key, vars);
}

// ── 컴포넌트용 반응형 훅 ─────────────────────────────────────────────
// 언어 토글 시 useUser가 리렌더되므로 자동 반영.
export function useT(): { t: (key: TransKey, vars?: TransVars) => string; lang: AppLanguage } {
  const { language } = useUser();
  const tt = useCallback(
    (key: TransKey, vars?: TransVars) => translate(language, key, vars),
    [language],
  );
  return { t: tt, lang: language };
}
