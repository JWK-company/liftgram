"use client";
// @plm SRS-056  종목 상세 머리 — 내가 부르는 이름 + ⋯ 「이름 바꾸기」(대표 이름·별칭 중에서 · 대표 이름으로 되돌리기)
//
// 상세는 서버 컴포넌트라 대표 이름을 먼저 그린다(fallback). 기기 저장소에 표시 이름이 있으면 그것으로 바꾸고,
// 대표 이름은 아래 줄에 작게 남긴다 — 「롱풀」로 부르는 사람도 정식 이름을 알 수 있게.
import { useEffect, useState } from "react";
import { invalidateExerciseNames, useExerciseName } from "@/lib/exerciseNames";
import { ActionSheet } from "./ui/Dialog";
import { MoreMenu } from "./ui/MoreMenu";
import { AppText } from "./ui/primitives";

type Choices = { nameKo: string; aliases: string[]; current: string | null };

export function ExerciseNameHeader({ exerciseId, fallback }: { exerciseId: string; fallback: string }) {
  const name = useExerciseName(exerciseId);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [picking, setPicking] = useState(false);

  // 이름을 바꾸면(name 변경) 「지금 고른 이름」 점 표시도 다시 읽는다
  // biome-ignore lint/correctness/useExhaustiveDependencies: name 은 다시 읽기 신호다
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const m = await import("@app/core/data/exerciseNames");
        const c = await m.getExerciseNameChoices(exerciseId);
        if (alive) setChoices(c);
      } catch {
        // 기기에 아직 없는 종목 — 이름 바꾸기 없이 대표 이름만
      }
    })();
    return () => {
      alive = false;
    };
  }, [exerciseId, name]);

  const shown = name ?? fallback;
  const official = choices?.nameKo ?? fallback;

  async function choose(next: string | null) {
    const m = await import("@app/core/data/exerciseNames");
    await m.setExerciseDisplayName(exerciseId, next);
    const { flushLocalDb } = await import("@/lib/localDb");
    await flushLocalDb();
    invalidateExerciseNames(exerciseId);
  }

  return (
    <div className="flex items-start gap-[var(--spacing-sm)]">
      <div className="min-w-0 flex-1">
        <AppText variant="title" className="block" data-testid="exercise-name">
          {shown}
        </AppText>
        {shown !== official ? (
          <AppText variant="caption" color="textFaint" className="block" data-testid="exercise-official-name">
            {official}
          </AppText>
        ) : null}
      </div>
      {choices?.aliases.length ? (
        <MoreMenu
          testId="exercise-more"
          options={[{ label: "이름 바꾸기", testId: "btn-rename-exercise", onPress: () => setPicking(true) }]}
        />
      ) : null}
      {picking && choices ? (
        <ActionSheet
          title="이 종목을 무엇이라 부를까요?"
          testId="rename-exercise-sheet"
          onClose={() => setPicking(false)}
          options={[
            {
              label: `${choices.nameKo} (대표 이름)`,
              selected: !choices.current,
              testId: "name-choice-official",
              onPress: () => void choose(null),
            },
            ...choices.aliases.map((a, i) => ({
              label: a,
              selected: choices.current === a,
              testId: `name-choice-${i}`,
              onPress: () => void choose(a),
            })),
          ]}
        />
      ) : null}
    </div>
  );
}
