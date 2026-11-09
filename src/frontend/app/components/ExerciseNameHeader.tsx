"use client";
// @plm SRS-056  종목 상세 머리 — 내가 부르는 이름 + ⋯ 「이름 바꾸기」(대표 이름·별칭 중에서 · 대표 이름으로 되돌리기)
//
// 상세는 서버 컴포넌트라 대표 이름을 먼저 그린다(fallback). 기기 저장소에 표시 이름이 있으면 그것으로 바꾸고,
// 대표 이름은 아래 줄에 작게 남긴다 — 「롱풀」로 부르는 사람도 정식 이름을 알 수 있게.
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { invalidateExerciseNames, useExerciseName } from "@/lib/exerciseNames";
// import { ActionSheet } from "./ui/Dialog"; // [원본] ⋯ → 별칭 고르기 시트 — S-146 에서 ✎ 직접 입력으로
// import { MoreMenu } from "./ui/MoreMenu";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { AppText } from "./ui/primitives";
import { useToast } from "./Toast";

type Choices = { nameKo: string; aliases: string[]; current: string | null };

export function ExerciseNameHeader({ exerciseId, fallback }: { exerciseId: string; fallback: string }) {
  const name = useExerciseName(exerciseId);
  const [choices, setChoices] = useState<Choices | null>(null);
  // [원본] const [picking, setPicking] = useState(false); — 별칭 시트 열림
  // [개선] S-146: ✎ 를 누르면 이름이 그 자리에서 입력칸이 된다(아무 이름 · 별칭 칩 · 원래 이름으로)
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const toast = useToast();

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

  const startEdit = () => {
    setDraft(name ?? fallback);
    setEditing(true);
  };
  const save = async (next: string | null) => {
    setEditing(false);
    try {
      await choose(next);
    } catch {
      toast(t("common.error"), "error");
    }
  };

  // [원본] 이름 + (별칭이 있을 때만) ⋯ 「이름 바꾸기」 → 시트 「이 종목을 무엇이라 부를까요?」에서 대표 이름·별칭 중 고르기.
  //   항목이 하나뿐인 메뉴에 시트를 한 번 더 올렸고, 별칭에 없는 이름은 쓸 수 없었다(S-146 · 피드백 2026-11-09).
  //   옮기기 전 판은 git ec1030a 의 이 파일.
  if (editing && choices) {
    const trimmed = draft.trim();
    return (
      <form
        className="flex flex-col gap-[var(--spacing-sm)]"
        data-testid="rename-exercise"
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) void save(trimmed);
        }}
      >
        <input
          // biome-ignore lint/a11y/noAutofocus: ✎ 를 눌러 고치러 들어온 참이라 바로 쓸 수 있어야 한다
          autoFocus
          value={draft}
          maxLength={30}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("exercises.renameLabel")}
          data-testid="rename-input"
          className="h-[48px] w-full rounded-[var(--radius-sm)] border border-(--color-brand) bg-(--color-card) px-[var(--spacing-md)] font-bold text-(--color-ink) text-[length:var(--text-lg)] outline-none"
        />
        {/* [원본] 별칭 칩 줄 아래에 저장·취소 줄이 따로 있었다 — 한 줄로: 왼쪽 칩(넘치면 칩끼리 줄바꿈) · 오른쪽 저장·취소(11-09 사용자 지적) */}
        <div className="flex items-start gap-[var(--spacing-sm)]">
          {/* 별칭 칩 — 누르면 입력칸을 채운다(흔히 부르는 이름을 다시 칠 필요 없게) */}
          {choices.aliases.length ? (
            <div className="flex min-w-0 flex-1 flex-wrap gap-[6px]" data-testid="rename-aliases">
              {choices.aliases.map((a, i) => (
                <button
                  key={a}
                  type="button"
                  data-testid={`name-choice-${i}`}
                  onClick={() => setDraft(a)}
                  className={`min-h-[36px] rounded-full border px-[12px] text-[length:var(--text-sm)] ${
                    draft.trim() === a
                      ? "border-(--color-brand) bg-(--color-brand-muted) text-(--color-brand)"
                      : "border-(--color-line-strong) text-(--color-ink2)"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {/* [원본] <div className="flex flex-wrap items-center gap-[var(--spacing-sm)]"> */}
          <div className="flex shrink-0 items-center gap-[var(--spacing-xs)]" data-testid="rename-actions">
            <Button
              title={t("common.save")}
              size="sm"
              fullWidth={false}
              disabled={!trimmed}
              testId="rename-save"
              onPress={() => void save(trimmed)}
            />
            <Button
              title={t("common.cancel")}
              size="sm"
              variant="quiet"
              fullWidth={false}
              testId="rename-cancel"
              onPress={() => setEditing(false)}
            />
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-start gap-[var(--spacing-sm)]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[2px]">
          <AppText variant="title" className="block min-w-0 break-words" data-testid="exercise-name">
            {shown}
          </AppText>
          {/* ✎ — 기기에 종목이 있을 때만(이름 고르기는 기기 저장소에 남는다) */}
          {choices ? (
            <IconButton
              icon="pencil"
              size={18}
              label={t("exercises.renameLabel")}
              testId="btn-rename-exercise"
              onPress={startEdit}
              className="h-11! w-11!"
            />
          ) : null}
        </div>
        {shown !== official ? (
          <div className="flex flex-wrap items-center gap-x-[var(--spacing-sm)]">
            <AppText
              variant="caption"
              color="textFaint"
              className="block"
              data-testid="exercise-official-name"
            >
              {official}
            </AppText>
            {/* 원래 이름으로 — 앱이 가진 대표 이름으로 되돌린다 */}
            <button
              type="button"
              data-testid="name-reset"
              onClick={() => void save(null)}
              className="min-h-[44px] text-(--color-ink2) text-[length:var(--text-xs)] underline underline-offset-2"
            >
              {t("exercises.renameReset")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
