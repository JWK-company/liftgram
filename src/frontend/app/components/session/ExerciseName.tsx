"use client";
// @plm SRS-001  종목 이름 — app의 features/session/ExerciseName.tsx를 웹으로
//
// 세션 화면은 좁아서 이름을 한 줄로 자른다. 대신 **탭하면 3초간 펼쳐** 전체를 보여 준다
// (긴 종목명이 잘려 무엇인지 모르겠다는 피드백으로 app에 들어온 동작이다).
//
// 이름 규칙(카탈로그 개편 P2 · ADR-033·035):
//   · 사용자가 고른 표시 이름(이관이 심은 옛 이름 포함)이 있으면 그것, 없으면 대표 이름(「기구 + 동작」)
//   · 기구 토큰을 떼던 축약(`base`)은 없앴다 — 기구가 곧 종목이라(바벨 벤치 ≠ 덤벨 벤치) 떼면 다른 종목과 구별이 안 된다
// [원본] import { baseExerciseName, exerciseDisplayName } from "@app/core/domain/exerciseName";
// [원본] import { exerciseDisplayName } from "@app/core/domain/exerciseName";
import { useEffect, useRef, useState } from "react";
import { useExerciseName } from "@/lib/exerciseNames";
import { AppText } from "../ui/primitives";

/** 펼친 뒤 다시 접히기까지 — app과 같은 3초. */
const REVEAL_MS = 3000;

export function ExerciseName({
  exerciseId,
  variant = "heading",
  color = "text",
  base = false,
  revealOnTap = false,
  testId,
}: {
  exerciseId: string;
  variant?: "heading" | "body" | "caption";
  color?: "text" | "textMuted" | "textFaint";
  base?: boolean;
  revealOnTap?: boolean;
  testId?: string;
}) {
  // [P3] 표시 이름은 공용 훅에서 — 이름 바꾸기를 하면 그려진 블록도 곧바로 바뀐다(lib/exerciseNames) @plm SRS-056
  const name = useExerciseName(exerciseId);
  const [expanded, setExpanded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // [원본] const label = ex ? (base ? baseExerciseName(ex) : exerciseDisplayName(ex)) : "…";
  void base; // 축약 폐지(P2) — 호출부의 base 는 무시한다
  const label = name ?? "…";

  const text = (
    <AppText
      variant={variant}
      color={color}
      data-testid={testId}
      className={expanded ? "block" : "block truncate"}
    >
      {label}
    </AppText>
  );

  if (!revealOnTap) return text;

  return (
    <button
      type="button"
      className="block min-w-0 max-w-full text-left"
      onClick={() => {
        setExpanded(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setExpanded(false), REVEAL_MS);
      }}
    >
      {text}
    </button>
  );
}
