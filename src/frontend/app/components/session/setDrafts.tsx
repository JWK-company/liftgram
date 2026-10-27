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
};

const NOOP: SetDraftRegistry = { set: () => {}, get: () => undefined, clear: () => {} };
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
  };
}

export function useSetDrafts(): SetDraftRegistry {
  return useContext(SetDraftContext);
}
