"use client";
// @plm SRS-001  종목 이름 — app의 features/session/ExerciseName.tsx를 웹으로
//
// 세션 화면은 좁아서 이름을 한 줄로 자른다. 대신 **탭하면 3초간 펼쳐** 전체를 보여 준다
// (긴 종목명이 잘려 무엇인지 모르겠다는 피드백으로 app에 들어온 동작이다).
//
// 이름 규칙은 도메인이 정한다 — `base`면 기구 토큰을 뗀 이름을 쓴다
// (세션에서는 기구를 변형 칩이 따로 보여 주므로 이름에서 중복을 없앤다).
import { baseExerciseName, exerciseDisplayName } from "@app/core/domain/exerciseName";
import { useEffect, useRef, useState } from "react";
import { AppText } from "../ui/primitives";

/** 펼친 뒤 다시 접히기까지 — app과 같은 3초. */
const REVEAL_MS = 3000;

type Named = { nameKo: string; nameEn: string | null; equipment?: string | null; kind?: string | null };

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
  const [ex, setEx] = useState<Named | null>(null);
  const [expanded, setExpanded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const repo = await import("@app/core/data/exerciseRepository");
        const e = (await repo.getExercise(exerciseId)) as unknown as Named;
        if (alive) setEx(e);
      } catch {
        // 삭제된 종목 등 — 이름 없이 둔다.
      }
    })();
    return () => {
      alive = false;
    };
  }, [exerciseId]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const label = ex ? (base ? baseExerciseName(ex) : exerciseDisplayName(ex)) : "…";

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
