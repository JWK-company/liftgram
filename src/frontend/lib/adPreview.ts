// 광고 자리 미리 보기(관리자 · 이 기기에만) — 실광고가 없어도 자리를 눈으로 확인한다(SPEC-022).
// 켜고 끄는 입구는 운영 웹 /settings 의 링크다(SPEC-033). 저장 값은 기기마다 있어 운영 웹에 둘 수 없다.
const KEY = "liftgram.adPreview";
const PARAM = "adPreview";

/** 주소의 ?adPreview=on|off 를 저장하고 주소에서 지운다. 값을 켜도 관리자가 아니면 AdSlot 이 그리지 않는다. */
function applyLink(): void {
  try {
    const url = new URL(location.href);
    const value = url.searchParams.get(PARAM);
    if (value === null) return;
    if (value === "on") setAdPreview(true);
    if (value === "off") setAdPreview(false);
    url.searchParams.delete(PARAM);
    // 상태를 null 로 넘겨야 Next 라우터도 새 주소를 알게 되어 파라미터가 되살아나지 않는다.
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // 주소를 못 읽으면 저장 값만 따른다
  }
}

export function adPreviewOn(): boolean {
  applyLink();
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setAdPreview(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // 저장을 못 하면 미리 보기만 꺼진 채로 둔다
  }
}
