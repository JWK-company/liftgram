// @plm SRS-073  「세트 힘든 정도 기록」 설정 — 켜야만 세트 줄에 RIR 칩이 생긴다(기본 끔 · 화면 조용함)
//
// 값은 계정과 함께 옮긴다(SYNCED_PREF_KEYS · 프로필 app_prefs). 읽기는 localStorage 에서 동기식으로 —
// 다른 기기에서 바꾼 값은 PrefsBridge 가 내려 주며 PREFS_EVENT 를 쏘고, 이 기기에서 바꾸면 여기서 같은 이벤트를 쏜다.
// 그래서 운동 화면이 열려 있는 채로 프로필에서 바꿔도 세트 줄이 곧바로 따라간다.
//
// 분석(EffortCard·기록 상세 RIR·진척 막대 채움)은 이 설정을 보지 않는다 — 데이터가 있으면 보인다(U-22 · 의도된 동작).
import { useSyncExternalStore } from "react";
import { PREFS_EVENT, getPref, setPref } from "./prefs";

export const EFFORT_LOGGING_KEY = "liftgram.effortLogging";

function read(): boolean {
  try {
    return getPref(EFFORT_LOGGING_KEY) === "1";
  } catch {
    return false; // 저장소를 못 쓰면 끈 채로(기본값)
  }
}

function subscribe(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === EFFORT_LOGGING_KEY) cb();
  };
  window.addEventListener(PREFS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PREFS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** 지금 켜져 있나 — 서버 그림은 끔(하이드레이션 안전), 첫 클라이언트 그림부터 저장값. */
export function useEffortLogging(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

/** 켜고 끈다 — 이 기기에 쓰고 프로필에도 올린다(동기). 열린 화면들이 곧바로 다시 읽는다. */
export function setEffortLogging(on: boolean): void {
  try {
    setPref(EFFORT_LOGGING_KEY, on ? "1" : "0");
  } catch {
    return;
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
}
