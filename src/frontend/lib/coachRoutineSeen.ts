// 코치가 보낸 루틴의 「새로 받음」 점(SPEC-050 P3a) — 처음 열면(미리보기·보기) 사라진다. 이 기기에만 둔다.
// 저장은 덤이다: 사생활 창·막힌 저장소에서는 매번 점이 보일 뿐 화면은 그대로 돈다(읽기·쓰기 모두 try).
import { useSyncExternalStore } from "react";

const KEY = "liftgram.coachRoutineSeen.v1";
/** 지운 루틴 id 가 끝없이 쌓이지 않게 — 최근 것만 남긴다 */
const CAP = 300;

let cache: string[] | null = null;
const listeners = new Set<() => void>();

function load(): string[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    cache = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function isCoachRoutineSeen(routineId: string): boolean {
  return load().includes(routineId);
}

export function markCoachRoutineSeen(routineId: string): void {
  const list = load();
  if (list.includes(routineId)) return;
  cache = [...list, routineId].slice(-CAP);
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* 저장이 막힌 브라우저 — 이번 화면에서만 사라진다 */
  }
  for (const l of listeners) l();
}

/**
 * 로그아웃 — 본 목록은 그 사람 것이다. 같은 기기의 다음 계정에게 남지 않게 지운다(REV L-4 · session.clearTokens 가 부른다).
 */
export function clearCoachRoutineSeen(): void {
  cache = [];
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 저장소를 못 쓰면 지울 것도 없다 */
  }
  for (const l of listeners) l();
}

// 다른 탭에서 열어 본 것도 반영한다(REV L-4) — storage 이벤트는 **다른** 탭이 쓸 때만 온다. 캐시를 비우고 다시 읽게 한다.
let storageBound = false;
function onStorage(e: StorageEvent) {
  if (e.key !== KEY && e.key !== null) return; // null = 다른 탭이 저장소 전체를 비움
  cache = null;
  for (const l of listeners) l();
}

// [원본] function subscribe(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; }
// [개선] 첫 구독 때 storage 이벤트를 한 번 건다 · 마지막 구독이 빠지면 뗀다
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!storageBound && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
    storageBound = true;
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && storageBound) {
      window.removeEventListener("storage", onStorage);
      storageBound = false;
    }
  };
}

/** 본 루틴인가 — 서버 렌더·첫 그림은 「봤음」(점 없음)으로 그려 깜빡임 대신 늦게 나타나게 한다. */
export function useCoachRoutineSeen(routineId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isCoachRoutineSeen(routineId),
    () => true,
  );
}
