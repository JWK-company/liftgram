// 숨은 동작 첫 안내(SPEC-046 · SRS-111 R4·R5) — 모양만으로 알리기 어려운 세 가지를 처음 한 번 말풍선으로.
//
// · 키 liftgram.hint.<id> = "seen" — 이 기기 사실이라 동기하지 않는다(SYNCED_PREF_KEYS 에 넣지 않는다)
// · liftgram.hint.suppressed 가 있으면 아무 안내도 띄우지 않는다(e2e 기본 상태 · 다시 보기로 지우지 않는다)
// · 한 번에 하나만(모듈 잠금) · 첫 실행 안내를 보기 전에는 띄우지 않는다
// [원본] · 「알겠어요」나 그 동작(「이전」 누름 등)을 하면 본 것 · 누르지 않고 떠나면 안 본 것(다음에 다시)
// [개선] #T18 · 몇 초 지나 저절로 사라지거나 · 화면 어디를 누르거나 · 그 동작(「이전」 누름 등)을 하면 본 것 ·
//        다 보기 전에 떠나면 안 본 것(다음에 다시)
import { useCallback, useEffect, useState } from "react";
import { useInputFocused, useOverlayOpen } from "./overlayPresence";

export const COACH_MARK_IDS = ["prev", "rxType", "longDone"] as const;
export type CoachMarkId = (typeof COACH_MARK_IDS)[number];

const key = (id: CoachMarkId) => `liftgram.hint.${id}`;
export const HINT_SUPPRESSED_KEY = "liftgram.hint.suppressed";
const ONBOARDING_KEY = "onboarding_seen_v1"; // OnboardingOverlay 의 SEEN_KEY 와 같다
const EVENT = "liftgram-hint";

function read(k: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(k);
  } catch {
    return null;
  }
}
function emit() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

// 저장소를 못 쓸 때도 이번 실행 동안은 닫혀 있게(P3 리뷰 2)
const seenThisRun = new Set<CoachMarkId>();

export function isCoachMarkSeen(id: CoachMarkId): boolean {
  return seenThisRun.has(id) || read(key(id)) === "seen";
}

/** 첫 실행 안내를 닫았을 때 등 — 안내 조건을 다시 보게 알린다(P3 리뷰 5) */
export function notifyCoachMarks(): void {
  emit();
}

/** 본 것으로 친다 — 「알겠어요」 · 그 동작을 했을 때 */
export function markCoachMarkSeen(id: CoachMarkId): void {
  if (isCoachMarkSeen(id)) return;
  seenThisRun.add(id);
  try {
    localStorage.setItem(key(id), "seen");
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 닫힌다
  }
  if (holder === id) holder = null;
  emit();
}

/** 설정 「안내 다시 보기」 — 세 안내를 다시 띄운다(suppressed 는 남긴다) */
export function resetCoachMarks(): void {
  for (const id of COACH_MARK_IDS) {
    try {
      localStorage.removeItem(key(id));
    } catch {
      // 무시
    }
  }
  seenThisRun.clear();
  shownThisRun.clear();
  triggered.clear();
  emit();
}

// 지금 떠 있는(또는 창에 가려 잠시 숨은) 안내 — 한 번에 하나만
let holder: CoachMarkId | null = null;
// 일이 일어나야 뜨는 안내(longDone = 슈퍼셋 묶음 완료로 휴식 시작) — 이번 화면에서 한 번이라도 일어났나
const triggered = new Set<CoachMarkId>();

/** 그 안내가 기다리는 일이 일어났다(예: 슈퍼셋 묶음 완료로 휴식이 걸림) */
export function triggerCoachMark(id: CoachMarkId): void {
  if (isCoachMarkSeen(id) || triggered.has(id)) return;
  triggered.add(id);
  emit();
}

function useHintVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const on = () => setV((x) => x + 1);
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return v;
}

// 이번 실행에서 실제로 화면에 떴던 안내
const shownThisRun = new Set<CoachMarkId>();

/** 떠 있던 안내를 본 것으로 — 안내가 뜬 채로 세트를 마쳤으면 읽었다고 본다(운동 내내 떠 있지 않게 · P3 리뷰) */
export function dismissIfShown(id: CoachMarkId): void {
  if (shownThisRun.has(id)) markCoachMarkSeen(id);
}

/** 그 일이 끝났다 — 기다리던 순간이 지나면 버린다(다음 다른 휴식에 뜨지 않게 · P3 리뷰 1) */
export function clearCoachMarkTrigger(id: CoachMarkId): void {
  if (triggered.delete(id)) emit();
}

/** triggerCoachMark 가 불렸나 */
export function useCoachMarkTriggered(id: CoachMarkId): boolean {
  useHintVersion();
  return triggered.has(id);
}

/**
 * @param when 그 안내가 맞는 상황인가(예: 이전 기록이 있는 「이전」 칩이 화면에 있음)
 * @returns open — 지금 그릴지 · dismiss — 「알겠어요」(본 것으로)
 */
export function useCoachMark(
  id: CoachMarkId,
  when: boolean,
  /** 그 순간에만 맞는 안내(longDone) — 다른 안내가 쥔 잠금을 빼앗는다(P3 리뷰 3) */
  urgent = false,
): { open: boolean; dismiss: () => void } {
  const version = useHintVersion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const seen = mounted ? isCoachMarkSeen(id) : true;
  const allowed = mounted && read(HINT_SUPPRESSED_KEY) == null && read(ONBOARDING_KEY) === "yes";
  const candidate = !seen && allowed && when;
  // 후보일 때만 화면을 지켜본다(안내를 다 본 사람의 운동 화면에 관찰자를 두지 않는다)
  const overlay = useOverlayOpen(candidate);
  const typing = useInputFocused(candidate);
  const [mine, setMine] = useState(false);

  // 내가 쥐었던 잠금을 남이 가져갔으면 숨는다
  const lost = mine && holder !== id;
  // 잠금 잡기·놓기 — 후보이면 잡고(비어 있을 때만), 후보가 아니면 놓는다. 창에 가려도 잠금은 쥐고 있는다(닫히면 다시 뜨게)
  // biome-ignore lint/correctness/useExhaustiveDependencies: version — 다른 안내가 잠금을 놓았을 때 다시 잡아 본다
  useEffect(() => {
    if (candidate) {
      if (holder == null || holder === id || urgent) {
        const took = holder != null && holder !== id;
        holder = id;
        setMine(true);
        if (took) emit(); // 빼앗긴 쪽이 숨게
      } else setMine(false);
    } else {
      if (holder === id) {
        holder = null;
        emit();
      }
      setMine(false);
    }
  }, [candidate, id, version, urgent]);
  useEffect(
    () => () => {
      if (holder === id) {
        holder = null;
        emit();
      }
    },
    [id],
  );

  const dismiss = useCallback(() => markCoachMarkSeen(id), [id]);
  const open = candidate && mine && !lost && !overlay && !typing;
  useEffect(() => {
    if (open) shownThisRun.add(id);
  }, [open, id]);
  return { open, dismiss };
}
