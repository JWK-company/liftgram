// @plm SRS-075  「근육 그림 보기」 설정 — 루틴 카드 mini 그림과 운동 중 「오늘 근육」 버튼을 같이 켜고 끈다(기본 켬 · U-14)
//
// effortPref.ts 와 같은 구조다: 값은 계정과 함께 옮기고(SYNCED_PREF_KEYS · 프로필 app_prefs · 키별 쓰기 대기 표식),
// 읽기는 localStorage 에서 동기식으로 한다. 이 기기에서 바꾸면 PREFS_EVENT 를 쏴 열린 화면이 곧바로 따른다.
// 기본이 켬이라 「"0" 일 때만 끔」으로 읽는다(없음·"1" = 켬).
//
// 통계의 근육 균형 카드는 이 설정을 보지 않는다 — 분석 화면은 데이터가 있으면 보인다(노력 카드와 같은 원칙).
import { useSyncExternalStore } from "react";
import { PREFS_EVENT, getPref, setPref } from "./prefs";

export const MUSCLE_MAP_KEY = "liftgram.muscleMap";

function read(): boolean {
  try {
    return getPref(MUSCLE_MAP_KEY) !== "0";
  } catch {
    return true; // 저장소를 못 쓰면 기본값(켬)
  }
}

function subscribe(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === MUSCLE_MAP_KEY) cb();
  };
  window.addEventListener(PREFS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PREFS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** 지금 켜져 있나 — 서버 그림은 기본값(켬)으로 자리를 잡아 두고, 첫 클라이언트 그림부터 저장값. */
export function useMuscleMap(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}

/** 켜고 끈다 — 이 기기에 쓰고 프로필에도 올린다(동기). */
export function setMuscleMap(on: boolean): void {
  try {
    setPref(MUSCLE_MAP_KEY, on ? "1" : "0");
  } catch {
    return;
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
}
