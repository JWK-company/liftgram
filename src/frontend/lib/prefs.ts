// @plm SRS-011  기기-로컬 설정 — 스키마에 넣을 것도, 서버에 보낼 것도 아닌 값
//
// 주간 목표(주 N일)·스트릭 주말 제외 같은 **이 기기에서만 의미 있는 설정**을 둔다.
// app은 네이티브에서 expo-secure-store, 웹에서 localStorage를 쓴다 — 웹 전용인 여기서는
// localStorage 하나면 되고, **키를 app과 똑같이** 둬서 두 구현을 오갈 때 설정이 이어진다.
const has = () => typeof localStorage !== "undefined";

export function getPref(key: string): string | null {
  return has() ? localStorage.getItem(key) : null;
}

export function setPref(key: string, value: string): void {
  if (has()) localStorage.setItem(key, value);
}
