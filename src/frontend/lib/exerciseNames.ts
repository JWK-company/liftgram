"use client";
// @plm SRS-056  표시 이름 훅 — 「내가 부르는 이름」을 모든 화면이 같은 값으로(ADR-033 · QA M3)
//
// 이름은 로컬 저장소(종목 + exercise_user_prefs)에서 읽는다. 한 화면에 같은 종목이 여러 번 나오고
// (세션 블록·피커·기록), 이름을 바꾸면 이미 그려진 곳도 바뀌어야 하므로 모듈 캐시 + 구독으로 둔다.
import { useEffect, useState } from "react";

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const listeners = new Set<() => void>();

async function load(id: string): Promise<string | null> {
  const hit = cache.get(id);
  if (hit != null) return hit;
  const pending = inflight.get(id);
  if (pending) return pending;
  const p = (async () => {
    try {
      const { getExerciseDisplayNameMap } = await import("@app/core/data/exerciseNames");
      const name = (await getExerciseDisplayNameMap([id])).get(id) ?? null;
      if (name != null) cache.set(id, name);
      return name;
    } catch {
      return null;
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, p);
  return p;
}

/** 종목 id → 화면 이름(훅 밖에서 · 확인창 문구 등). 없으면 null. */
export function getExerciseDisplayName(id: string): Promise<string | null> {
  return load(id);
}

/** 이름이 바뀌었다 — 캐시를 비우고 그려진 곳에 알린다(id 없으면 전부). */
export function invalidateExerciseNames(id?: string): void {
  if (id) cache.delete(id);
  else cache.clear();
  for (const l of listeners) l();
}

/** 종목 id → 화면 이름(표시 이름 ?? 대표 이름). 읽는 동안·없는 종목은 null. */
export function useExerciseName(id: string | null | undefined): string | null {
  const [name, setName] = useState<string | null>(() => (id ? (cache.get(id) ?? null) : null));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!id) {
      setName(null);
      return;
    }
    let alive = true;
    void tick;
    void load(id).then((n) => {
      if (alive) setName(n);
    });
    return () => {
      alive = false;
    };
  }, [id, tick]);

  return name;
}

/**
 * 종목 id 여러 개 → 화면 이름 지도(SPEC-045 코드 리뷰 정확성 1·2). 모듈 캐시를 거치고, 이름이 바뀌면(invalidate) 다시 읽는다.
 * 지금 ids 로 읽은 값만 돌려준다 — 구성이 바뀌면 새 이름을 받을 때까지 null(옛 지도로 그리지 않는다 · 열쇠 붙은 비동기 값).
 * 이 기기에 없는 종목은 지도에 없다.
 */
export function useExerciseNames(ids: string[]): Map<string, string> | null {
  const key = ids.join(",");
  const [state, setState] = useState<{ key: string; map: Map<string, string> } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const l = () => setTick((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void tick;
    const list = key ? key.split(",") : [];
    void Promise.all(list.map((id) => load(id).then((n) => [id, n] as const))).then((pairs) => {
      if (!alive) return;
      const map = new Map<string, string>();
      for (const [id, n] of pairs) if (n != null) map.set(id, n);
      setState({ key, map });
    });
    return () => {
      alive = false;
    };
  }, [key, tick]);

  return state && state.key === key ? state.map : null;
}

/**
 * 피커에서 고른 직후 — 표시 이름(정확히 친 이름이면 그 이름으로)과 별칭이 함축하는 기록 칸(D7: 「로프 푸시다운」 → 부착물 로프)을
 * 방금 만든(또는 바꾼) 블록에 적용한다. 목록에서 그냥 골랐으면(info 없음) 아무것도 하지 않는다.
 */
export async function applyPick(
  exerciseId: string,
  info: { matched: string; matchedKind: "name" | "alias" | "nameEn"; exact: boolean } | undefined,
  target: { workoutExerciseId?: string; routineExerciseId?: string },
): Promise<void> {
  if (!info) return;
  const names = await import("@app/core/data/exerciseNames");
  await names.applyPickedName(exerciseId, info);
  if (info.matchedKind === "alias") {
    const axes = await names.impliedAxesForAlias(exerciseId, info.matched);
    if (axes) {
      if (target.workoutExerciseId)
        await names.applyImpliedAxesToWorkoutExercise(target.workoutExerciseId, axes);
      if (target.routineExerciseId)
        await names.applyImpliedAxesToRoutineExercise(target.routineExerciseId, axes);
    }
  }
  invalidateExerciseNames(exerciseId);
}
