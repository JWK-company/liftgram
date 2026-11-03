"use client";
// @plm SRS-062  입력 중인 세트 값 등록부 — 슈퍼셋을 함께 완료할 때 멤버 칸의 **아직 저장 안 된** 무게·횟수
//
// 세트 칸은 blur 때 저장한다. 슈퍼셋 한 칸의 체크를 누르면 다른 종목의 칸은 blur 가 일어나지 않아,
// 거기 적어 둔 값이 저장되기 전에 완료되면 옛 값이 남는다(QA Q3). 그래서 칸이 입력될 때마다 여기 적어 두고,
// 묶음 완료가 이 값을 같은 write 안에서 먼저 반영한다. 화면을 벗어나면 함께 사라지는 휘발 상태다.
import { createContext, useContext } from "react";

export type SetDraft = { weightKg?: number; reps?: number };
export type SetDraftRegistry = {
  set: (setLogId: string, patch: SetDraft) => void;
  get: (setLogId: string) => SetDraft | undefined;
  clear: (setLogId: string) => void;
  /** 값이 있는 입력 중 칸 전부(SPEC-017 Phase 3 commitAll) */
  entries: () => [string, SetDraft][];
};

const NOOP: SetDraftRegistry = { set: () => {}, get: () => undefined, clear: () => {}, entries: () => [] };
/** 세션 화면이 하나 만들어 Provider 로 내려 준다 — 묶음 완료 핸들러도 같은 등록부를 읽는다. */
export const SetDraftContext = createContext<SetDraftRegistry>(NOOP);

export function createSetDraftRegistry(): SetDraftRegistry {
  const map = new Map<string, SetDraft>();
  return {
    set: (id, patch) => map.set(id, { ...map.get(id), ...patch }),
    get: (id) => map.get(id),
    clear: (id) => {
      map.delete(id);
    },
    entries: () => [...map.entries()].filter(([, d]) => d.weightKg !== undefined || d.reps !== undefined),
  };
}

// ── 입력 중 값 커밋(SPEC-017 Phase 3 §9 M-8) ─────────────────────────────────
// 잠금 drain 은 적용 **직전에**, 앱이 뒤로 갈 때(pause·hidden)는 스냅샷 **전에** 입력 중 값을 저장해 둔다 —
// 그래야 카드에 보이는 값 = 화면에 적어 둔 값이고, drain 이 옛 값으로 완료하지 않는다. 세션 화면이 커밋 함수를 등록한다.
const committers = new Set<() => Promise<void>>();

/** 세션 화면이 「등록부의 값을 저장하는 함수」를 건다. 돌려준 함수로 뗀다. */
export function registerDraftCommitter(fn: () => Promise<void>): () => void {
  committers.add(fn);
  return () => {
    committers.delete(fn);
  };
}

/** 등록된 모든 입력 중 값을 저장하고 끝나기를 기다린다(실패해도 던지지 않는다 — 진단 로그만). */
// [원본] Promise<void> — 실패를 삼켜 앱 설치 직전 저장이 실패를 몰랐다(SPEC-018 REV-013 화면 L-14)
// [개선] 실패한 수를 돌려준다(기존 호출은 그대로 await 만 한다)
export async function commitAllDrafts(): Promise<number> {
  const r = await Promise.all(
    [...committers].map((fn) =>
      fn().then(
        () => 0,
        (e) => {
          console.warn("[drafts] 입력 중 값 저장 실패", e);
          return 1;
        },
      ),
    ),
  );
  return r.reduce<number>((a, b) => a + b, 0);
}

export function useSetDrafts(): SetDraftRegistry {
  return useContext(SetDraftContext);
}
