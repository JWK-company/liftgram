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

/**
 * **웹에만 있는 문구.**
 *
 * 이 목록은 짧게 유지한다 — 문구가 두 곳에 흩어지면 고칠 때 한쪽을 빠뜨린다.
 * 여기 들어올 수 있는 것은 딱 하나, **네이티브 제스처를 웹 조작으로 바꾸면서 생긴 이름**이다.
 * 앱에는 그 조작이 없으므로 app의 사전(원본)에 넣을 자리가 없다.
 *
 * 예: 앱은 루틴을 꾹 눌러 끌어 옮기지만, 웹에서 그 제스처는 터치 스크롤과 싸운다.
 * 그래서 위/아래 이동 버튼으로 옮겼고, 그 버튼의 이름이 여기 있다.
 */
const WEB_ONLY: Record<string, Record<AppLanguage, string>> = {
  "web.routines.moveUp": { ko: "위로 이동", en: "Move up" },
  "web.routines.moveDown": { ko: "아래로 이동", en: "Move down" },
  // 앱은 헤더 아이콘 하나로 곧바로 나가지만, 웹에서는 되돌릴 수 없는 조작 앞에 한 번 묻는다
  // (마우스는 오조작이 잦고, 나간 그룹은 초대받기 전엔 돌아갈 수 없다). 그 확인창의 문구다.
  "web.dm.leaveGroup": { ko: "그룹 나가기", en: "Leave group" },
  "web.dm.leaveConfirm": {
    ko: "이 그룹에서 나갈까요? 다시 들어오려면 초대를 받아야 해요.",
    en: "Leave this group? You will need an invite to come back.",
  },
};

export type WebOnlyKey = keyof typeof WEB_ONLY;

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

/** 웹 전용 문구. 위 `WEB_ONLY`에 있는 키만 받는다(오타는 타입이 잡는다). */
export function tw(key: WebOnlyKey, vars?: TransVars): string {
  const entry = WEB_ONLY[key];
  return interpolate(entry?.[lang] ?? entry?.ko ?? key, vars);
}
