"use client";
// @plm SRS-064  운동 총평 — 요약 화면·기록 상세가 같이 쓰는 입력란(나만 봄 · 피드 글과 별개)
//
// 저장 버튼이 없다 — 칸을 떠날 때(blur)·화면을 닫을 때(언마운트)·페이지가 숨겨질 때(pagehide) 저절로 저장한다(QA R4).
// 헬스장에서 몇 글자 적고 바로 폰을 내려놓아도 남아야 하기 때문이다. 값은 workouts.notes(동기 컬럼)에 쓴다.
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { TextArea } from "../ui/inputs";
import { AppText } from "../ui/primitives";

export function WorkoutNoteField({ workoutId, initial }: { workoutId: string; initial: string | null }) {
  const [text, setText] = useState(initial ?? "");
  const latest = useRef(text);
  const saved = useRef(initial ?? "");
  latest.current = text;

  const save = async (): Promise<boolean> => {
    const v = latest.current.trim();
    if (v === saved.current.trim()) return false;
    saved.current = v;
    const repo = await import("@app/core/data/workoutRepository");
    await repo.setWorkoutNote(workoutId, v);
    // 곧바로 문서 이동(새로고침·주소 이동)해도 남게 기다려 내려쓴다 — 예약(scheduleFlush)은 그 사이에 사라졌다(e2e)
    const { flushLocalDb } = await import("@/lib/localDb");
    await flushLocalDb();
    return true;
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: save 는 ref 만 읽는다 — 마운트 한 번만 건다
  useEffect(() => {
    const onHide = () => void save().catch(() => {});
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void save().catch(() => {}); // 화면을 닫으면(요약 「완료」·뒤로) 그때 저장
    };
  }, [workoutId]);

  return (
    <div data-testid="workout-note" className="mt-[var(--spacing-lg)]">
      <TextArea
        label={t("note.title")}
        testId="workout-note-input"
        rows={3}
        maxLength={2000}
        value={text}
        placeholder={t("note.placeholder")}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void save().catch(() => {})}
        className="mb-[var(--spacing-xs)]!"
      />
      <AppText variant="caption" color="textFaint">
        {t("note.hint")}
      </AppText>
    </div>
  );
}
