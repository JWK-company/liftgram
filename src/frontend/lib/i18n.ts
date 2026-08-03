// @plm SRS-013  문구 — app과 **같은 사전**을 쓴다
//
// ─────────────────────────────────────────────────────────────────────────────
// 화면의 한국어 문구를 여기 손으로 적지 않는다. app이 쓰는 사전(`core/src/i18n/locales`)을
// 그대로 읽는다 — 그래야 문구를 한 곳에서 고치고, 두 구현이 갈라지지 않는다.
//
// app의 `src/i18n/index.ts`는 React Context(userContext)에 묶여 있어 통째로 가져올 수 없다.
// 필요한 것은 **치환과 폴백** 두 가지뿐이라 그 부분만 여기 다시 적는다(규칙은 같다):
//   · 누락 키는 ko로 폴백, 그래도 없으면 키 자체를 노출한다(개발 중 누락이 눈에 띄도록)
//   · `{name}` 자리표시자는 split/join으로 치환한다
//
// 언어 선택(ko/en)은 사용자 설정이 옮겨올 때 붙인다. 지금은 ko 고정이다.
// ─────────────────────────────────────────────────────────────────────────────
import { en } from "@app/core/i18n/locales/en";
import { ko, type TransKey } from "@app/core/i18n/locales/ko";

export type { TransKey };
export type TransVars = Record<string, string | number>;
export type AppLanguage = "ko" | "en";

const RESOURCES: Record<AppLanguage, Record<TransKey, string>> = { ko, en };

function interpolate(template: string, vars?: TransVars): string {
  if (!vars) return template;
  let out = template;
  for (const k of Object.keys(vars)) out = out.split(`{${k}}`).join(String(vars[k]));
  return out;
}

export function translate(lang: AppLanguage, key: TransKey, vars?: TransVars): string {
  const table = RESOURCES[lang] ?? RESOURCES.ko;
  return interpolate(table[key] ?? RESOURCES.ko[key] ?? key, vars);
}

/** 지금 화면이 쓰는 언어. 설정 화면이 옮겨오면 여기에 사용자 값을 물린다. */
export const lang: AppLanguage = "ko";

export function t(key: TransKey, vars?: TransVars): string {
  return translate(lang, key, vars);
}
