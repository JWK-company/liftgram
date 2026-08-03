"use client";
// @plm SRS-007  보는 사람의 무게 단위
//
// 피드에 실린 무게는 항상 kg이고, **보는 사람의 단위로 그릴 때만** 바꾼다.
// 그 단위는 로컬 사용자 설정에 있다(계정과 무관하다 — 로그인하지 않아도 단위는 있다).
//
// 화면마다 이 조회를 다시 쓰지 않도록 훅 하나로 모은다. 실패하면 kg으로 둔다 —
// 단위를 못 읽었다고 피드가 안 뜨면 안 된다.
import type { WeightUnit } from "@app/core";
import { useEffect, useState } from "react";

export function useWeightUnit(): WeightUnit {
  const [unit, setUnit] = useState<WeightUnit>("kg");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const repo = await import("@app/core/data/userRepository");
        const user = await repo.getOrCreateLocalUser();
        if (cancelled) return;
        setUnit(((user as unknown as { weightUnit?: WeightUnit }).weightUnit ?? "kg") as WeightUnit);
      } catch {
        // kg으로 둔다.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return unit;
}
