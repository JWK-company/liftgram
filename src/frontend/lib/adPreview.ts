// 광고 자리 미리 보기(관리자 · 이 기기에만) — 실광고가 없어도 자리를 눈으로 확인한다(SPEC-022).
const KEY = "liftgram.adPreview";

export function adPreviewOn(): boolean {
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
