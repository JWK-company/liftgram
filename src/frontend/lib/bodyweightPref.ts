// @plm SRS-077 SRS-078  체중 설정 두 개 — 「운동 전 체중 체크인」(기본 끔 · 화면 조용함)과 목표 체중(kg)
//
// effortPref.ts·muscleMapPref.ts 와 같은 구조다: 값은 계정과 함께 옮기고(SYNCED_PREF_KEYS · 프로필 app_prefs · 키별 쓰기 대기 표식),
// 읽기는 localStorage 에서 동기식으로 한다. 이 기기에서 바꾸면 PREFS_EVENT 를 쏴 열린 화면이 곧바로 따른다.
//   · liftgram.weighInBeforeWorkout  "1" = 켬 · 없음/"0" = 끔
//   · liftgram.bodyweightGoalKg      kg 숫자 문자열 · ""(빈 문자열) = 목표 없음 — setPref 는 지우기가 없어 빈 값으로 지운다
// 「이 운동에서 시트를 띄웠다」 표시(weighin:<workoutId>)는 이 기기 사실이라 동기하지 않는다 — 여기 헬퍼만 둔다.
import { isValidBodyweightKg } from "@app/core/domain/bodyweight";
import { WEIGH_IN_MARK_PREFIX, weighInMarkKey } from "@app/core/domain/weighIn";
import { useSyncExternalStore } from "react";
import { PREFS_EVENT, getPref, setPref } from "./prefs";

export const WEIGH_IN_KEY = "liftgram.weighInBeforeWorkout";
export const BODYWEIGHT_GOAL_KEY = "liftgram.bodyweightGoalKg";

function subscribe(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === WEIGH_IN_KEY || e.key === BODYWEIGHT_GOAL_KEY) cb();
  };
  window.addEventListener(PREFS_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PREFS_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function readWeighInEnabled(): boolean {
  try {
    return getPref(WEIGH_IN_KEY) === "1";
  } catch {
    return false;
  }
}

/** 목표 체중(kg) — 없거나 깨진 값이면 null. useSyncExternalStore 비교를 위해 원시값을 돌려준다. */
export function readBodyweightGoalKg(): number | null {
  try {
    const v = Number.parseFloat(getPref(BODYWEIGHT_GOAL_KEY) ?? "");
    return isValidBodyweightKg(v) ? v : null;
  } catch {
    return null;
  }
}

export function useWeighInEnabled(): boolean {
  return useSyncExternalStore(subscribe, readWeighInEnabled, () => false);
}

export function useBodyweightGoalKg(): number | null {
  return useSyncExternalStore(subscribe, readBodyweightGoalKg, () => null);
}

export function setWeighInEnabled(on: boolean): void {
  try {
    setPref(WEIGH_IN_KEY, on ? "1" : "0");
  } catch {
    return;
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
}

/** 목표를 정하거나(kg) 지운다(null) */
export function setBodyweightGoalKg(kg: number | null): void {
  try {
    setPref(
      BODYWEIGHT_GOAL_KEY,
      kg != null && isValidBodyweightKg(kg) ? String(Math.round(kg * 1000) / 1000) : "",
    );
  } catch {
    return;
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
}

// ── 「이 운동에서 띄웠다」 표시(이 기기만) ─────────────────────────────────

export function hasWeighInMark(workoutId: string): boolean {
  try {
    return localStorage.getItem(weighInMarkKey(workoutId)) !== null;
  } catch {
    return true; // 저장소를 못 쓰면 띄우지 않는다(매번 뜨는 것보다 낫다)
  }
}

export function setWeighInMark(workoutId: string): void {
  try {
    localStorage.setItem(weighInMarkKey(workoutId), String(Date.now()));
  } catch {
    // 표시를 못 남기면 다음 진입에 다시 뜰 수 있다 — 10분 창이 막는다
  }
}

/**
 * 운동이 끝나면(완료·취소) 그 표시를 지운다. `keep` 을 주면 그 운동 표시만 남기고 **다른 운동의 남은 표시**를 지운다
 * (다른 기기에서 끝낸 운동 · 탭을 닫은 채 끝난 운동 — 표시가 쌓이지 않게).
 */
export function clearWeighInMarks(opts: { workoutId?: string; keep?: string }): void {
  try {
    if (opts.workoutId) {
      localStorage.removeItem(weighInMarkKey(opts.workoutId));
      return;
    }
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k?.startsWith(WEIGH_IN_MARK_PREFIX) && k !== (opts.keep ? weighInMarkKey(opts.keep) : null))
        drop.push(k);
    }
    for (const k of drop) localStorage.removeItem(k);
  } catch {
    // 무시 — 표시는 판정 보조일 뿐이다
  }
}
