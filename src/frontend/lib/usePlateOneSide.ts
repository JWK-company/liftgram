"use client";
// @plm SRS-084 SRS-058  플레이트 머신 입력 방식(한쪽 / 양쪽 합·핀) — 운동 블록·루틴 편집기가 같은 규칙으로 읽는다
//
// 2026-10-27 피드백 #63: 플레이트 후보 머신(기구 머신 + family 적재 축 + 하중 모드 external)은 적재 칸이 플레이트면
// (비면 family 의 흔한 적재 방식) **기본이 한쪽(×2)** 이다.
// 종목의 선택(exercise_user_prefs.plate_one_side)이 null 이면 「아직 안 정함」 — 블록이 한 번 묻는다.
// 배수 규칙 자체는 도메인(recordSlots.blockLoadMultiplierV2)이 정한다. 이 훅은 재료(선택·후보)만 읽어 둔다.
import { blockLoadMultiplierV2, needsPlateOneSideQuestion } from "@app/core/domain/recordSlots";
import type { VariantDims } from "@app/core";
import { useCallback, useEffect, useState } from "react";

export interface PlateOneSide {
  /** true 한쪽 · false 양쪽 합·핀 · null 아직 안 정함 · undefined 아직 읽는 중 */
  choice: boolean | null | undefined;
  /** 플레이트 후보 종목인가(읽기 전에는 false) */
  candidate: boolean;
  /** 후보의 흔한 적재 방식(빈 적재 칸의 기본) — 후보가 아니면 null */
  defaultLoad: "plate" | "pin" | null;
  /** 읽기를 마쳤나 — 마치기 전에는 질문을 띄우지 않는다(깜빡임 방지) */
  loaded: boolean;
  /** 이 칸의 블록 배수(도메인 규칙) */
  multiplier: (dims: Pick<VariantDims, "load"> | null | undefined) => number | null;
  /** 이 칸에서 물을 것인가 */
  needsAsk: (dims: Pick<VariantDims, "load"> | null | undefined) => boolean;
  /** 저장 뒤 화면 값만 바꾼다(저장은 부르는 쪽이 저장소로) */
  setChoiceLocal: (on: boolean) => void;
}

export function usePlateOneSide(exerciseId: string): PlateOneSide {
  const [choice, setChoice] = useState<boolean | null | undefined>(undefined);
  const [defaultLoad, setDefaultLoad] = useState<"plate" | "pin" | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    void (async () => {
      try {
        const [prefs, meta] = await Promise.all([
          import("@app/core/data/exercisePrefs"),
          import("@app/core/data/catalogMeta"),
        ]);
        const [c, loads] = await Promise.all([
          prefs.getPlateOneSideChoice(exerciseId),
          meta.plateDefaultLoadMap([exerciseId]),
        ]);
        if (!alive) return;
        setChoice(c);
        setDefaultLoad(loads.get(exerciseId) ?? null);
      } catch {
        if (alive) setChoice(null);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [exerciseId]);

  const multiplier = useCallback(
    (dims: Pick<VariantDims, "load"> | null | undefined) => blockLoadMultiplierV2(dims, choice, defaultLoad),
    [choice, defaultLoad],
  );
  const needsAsk = useCallback(
    (dims: Pick<VariantDims, "load"> | null | undefined) =>
      loaded && needsPlateOneSideQuestion(dims, choice, defaultLoad),
    [loaded, choice, defaultLoad],
  );
  return {
    choice,
    candidate: defaultLoad != null,
    defaultLoad,
    loaded,
    multiplier,
    needsAsk,
    setChoiceLocal: setChoice,
  };
}
