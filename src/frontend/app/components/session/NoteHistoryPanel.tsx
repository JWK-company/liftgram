"use client";
// @plm SRS-004  메모 이력 — app의 ExerciseBlock 안 타임라인을 웹으로
//
// "지난 메모"는 직전 것 하나만 보여 준다. 더 거슬러 보고 싶을 때 여는 자리가 여기다.
// **열 때 처음 한 번만 읽는다** — 종목마다 매번 이력을 읽으면 세션 화면이 무거워진다.
import { useState } from "react";
import { t } from "@/lib/i18n";
import { Icon } from "../ui/Icon";
import { AppText } from "../ui/primitives";

type WorkoutRepo = typeof import("@app/core/data/workoutRepository");
type Entry = { completedAt: number; note: string };

export function NoteHistoryPanel({
  repo,
  exerciseId,
  variantKey,
}: {
  repo: WorkoutRepo;
  exerciseId: string;
  variantKey: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || entries !== null) return;
    setLoading(true);
    void repo
      .getExerciseNoteHistory(exerciseId, variantKey)
      .then((r) => setEntries(r as Entry[]))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <button
        type="button"
        data-testid="note-history-toggle"
        onClick={toggle}
        className="flex items-center gap-[4px] self-start py-[2px]"
      >
        <Icon name="time-outline" size={13} color="var(--color-ink2)" />
        <AppText variant="caption" color="textMuted">
          {t("session.noteHistoryToggle")}
        </AppText>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={13} color="var(--color-ink2)" />
      </button>

      {open ? (
        <div className="mt-[4px] rounded-[var(--radius-sm)] bg-(--color-surface-alt) px-[var(--spacing-sm)] py-[4px]">
          {loading ? (
            <AppText variant="caption" color="textFaint">
              {t("common.loading")}
            </AppText>
          ) : !entries || entries.length === 0 ? (
            <AppText variant="caption" color="textFaint">
              {t("session.noteHistoryEmpty")}
            </AppText>
          ) : (
            <ul>
              {entries.map((e, i) => (
                <li
                  key={`${e.completedAt}`}
                  style={{ borderTopWidth: i === 0 ? 0 : 1, borderColor: "var(--color-line)" }}
                  className="flex gap-[var(--spacing-sm)] py-[4px]"
                >
                  <span className="w-[58px] shrink-0">
                    <AppText variant="caption" color="textFaint">
                      {shortDate(e.completedAt)}
                    </AppText>
                  </span>
                  <AppText variant="caption" color="textMuted" className="flex-1">
                    {e.note}
                  </AppText>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** `YY.M.D` — 좁은 칸에 들어가야 해서 app과 같은 축약을 쓴다. */
function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getFullYear()).slice(2)}.${d.getMonth() + 1}.${d.getDate()}`;
}
