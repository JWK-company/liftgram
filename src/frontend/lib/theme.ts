// @plm SRS-051  화면 테마 — 시스템(기본) · 라이트 · 다크
//
// 기본은 **기기 설정을 따른다**(CSS 의 prefers-color-scheme — data-theme 을 달지 않는다).
// 사람이 프로필에서 고르면 그 값이 이긴다(data-theme="light"|"dark"). 값은 계정 설정과 함께 동기된다
// (lib/prefs.ts SYNCED_PREF_KEYS — 다른 기기에서도 같은 테마). 첫 칠하기 전 적용은 layout.tsx 의 THEME_INIT 이 한다.
import { getPref, setPref } from "./prefs";

export type ThemeChoice = "system" | "light" | "dark";
export const THEME_KEY = "liftgram.theme";

export function getTheme(): ThemeChoice {
  const v = getPref(THEME_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

/** 문서에 반영한다(저장은 하지 않는다 — 다른 기기에서 내려온 값을 적용할 때도 쓴다). */
export function applyTheme(t: ThemeChoice = getTheme()): void {
  if (typeof document === "undefined") return;
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}

export function setTheme(t: ThemeChoice): void {
  setPref(THEME_KEY, t);
  applyTheme(t);
}
