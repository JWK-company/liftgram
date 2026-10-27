"use client";
// @plm SRS-081 SRS-082  다른 앱 기록 가져오기 입구 — 「다른 앱 기록 가져오기」 + 「가져오기 기록」 묶음별 되돌리기
//
// 카드는 **입구만** 맡는다(U-18). 파일 → 확인 → 종목 맞추기 → 진행 → 끝 단계는 전체 화면 `/account/import` 가 한다.
// 계정 화면의 로그인·로그아웃 두 분기에 모두 놓인다(U-20 · AuthClient).
//
// 되돌리기: 묶음의 운동·세트를 지운다(importRepository.undoImportBatch). 가져온 뒤 사람이 고친 세트(user_edited)가 있으면
// 확인창에 먼저 알린다(D-9). 끝나면 디스크까지 내려쓴 뒤 동기를 재개한다(flush 를 넘긴다 · D-11).
import type ImportBatch from "@app/core/db/models/ImportBatch";
import { useQueryData } from "@app/core/db/hooks";
import { useEffect, useState } from "react";
import { flushLocalDb } from "@/lib/localDb";
import { navigate } from "@/lib/nav";
import { t, type TransKey } from "@/lib/i18n";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/Dialog";
import { AppText, Card } from "../ui/primitives";
import { MetaAction, MetaLine } from "../ui/quiet";

type Repo = typeof import("@app/core/data/importRepository");
type UndoPreview = import("@app/core/data/importRepository").UndoPreview;

/** 가져온 곳 이름 — 상표라 번역하지 않는다 */
export function importSourceLabel(source: string | null | undefined): string {
  if (source === "strong") return "Strong";
  if (source === "hevy") return "Hevy";
  return source ?? "";
}

export function importDateLabel(ms: number): string {
  const d = new Date(ms);
  return t("import.dateShort", {
    y: d.getFullYear(),
    m: String(d.getMonth() + 1).padStart(2, "0"),
    d: String(d.getDate()).padStart(2, "0"),
  });
}

export function ImportCard() {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [asking, setAsking] = useState<UndoPreview | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("@app/core/data/importRepository").then((m) => !cancelled && setRepo(m));
    return () => {
      cancelled = true;
    };
  }, []);

  const batches = useQueryData<ImportBatch>(() => (repo ? repo.queryImportBatches() : null), [repo]);

  const askUndo = async (id: string) => {
    if (!repo || busyId) return;
    setMsg(null);
    const p = await repo.previewUndoImportBatch(id);
    if (p) setAsking(p);
  };

  const doUndo = async () => {
    if (!repo || !asking) return;
    const p = asking;
    setAsking(null);
    setBusyId(p.batchId);
    try {
      // 확인창에서 user_edited 경고를 이미 보였다 → confirmUserEdited
      const r = await repo.undoImportBatch(p.batchId, {
        confirmUserEdited: true,
        flush: async () => {
          await flushLocalDb();
        },
      });
      setMsg({ text: t("import.undoDone", { workouts: r.preview.workouts }) });
    } catch (e) {
      const reason = (e as { reason?: string } | null)?.reason;
      setMsg({
        text: reason ? t(`import.blocked.${reason}` as TransKey) : t("import.undoFailed"),
        bad: true,
      });
    } finally {
      setBusyId(null);
    }
  };

  const undoMessage = (p: UndoPreview) =>
    [
      t("import.undoConfirm", { workouts: p.workouts, sets: p.sets }),
      p.userEditedSets > 0 ? t("import.undoEditedWarn", { count: p.userEditedSets }) : "",
      p.customExercises.keep.length > 0
        ? t("import.undoKeepsExercises", { count: p.customExercises.keep.length })
        : "",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <Card className="mb-[var(--spacing-lg)]" data-testid="import-card">
      <AppText variant="label" color="textMuted">
        {t("import.entry")}
      </AppText>
      <AppText variant="caption" color="textMuted" className="mt-[2px] block">
        {t("import.entryCaption")}
      </AppText>
      <div className="mt-[var(--spacing-md)] [&>button]:whitespace-nowrap">
        <Button
          title={t("import.entryButton")}
          variant="secondary"
          icon="folder-open"
          onPress={() => navigate("/account/import")}
          testId="btn-import-open"
        />
      </div>
      {batches.length > 0 ? (
        <div className="mt-[var(--spacing-md)]" data-testid="import-history">
          <AppText variant="label" color="textMuted">
            {t("import.history")}
          </AppText>
          <ul className="mt-[var(--spacing-xs)] flex flex-col">
            {batches.map((b) => {
              const status = b.status === "undone" ? "undone" : b.status === "writing" ? "writing" : "done";
              return (
                <li
                  key={b.id}
                  data-testid={`import-batch-${b.id}`}
                  data-status={status}
                  className="border-(--color-line) border-t py-[var(--spacing-sm)] first:border-t-0"
                >
                  <div className="flex items-start justify-between gap-[var(--spacing-sm)]">
                    <div className="min-w-0">
                      <AppText variant="body" className="block truncate">
                        {t("import.historyRow", {
                          source: importSourceLabel(b.source),
                          label: b.fileLabel || "CSV",
                        })}
                      </AppText>
                      <MetaLine>
                        <span key="meta">
                          {t("import.historyMeta", {
                            workouts: b.workoutCount ?? 0,
                            sets: b.setCount ?? 0,
                            date: importDateLabel(b.createdAt?.getTime?.() ?? 0),
                          })}
                        </span>
                      </MetaLine>
                    </div>
                    {/* 상태·동작은 오른쪽 한 자리(줄이 꺾여도 메타와 섞이지 않게) */}
                    <div className="shrink-0 pt-[2px]">
                      {status === "undone" ? (
                        <AppText variant="caption" color="textMuted" data-testid="import-batch-undone">
                          {t("import.undone")}
                        </AppText>
                      ) : status === "writing" ? (
                        <AppText variant="caption" color="textMuted">
                          {t("import.writing")}
                        </AppText>
                      ) : (
                        <MetaAction
                          onPress={() => void askUndo(b.id)}
                          disabled={busyId != null}
                          testId="btn-import-undo"
                        >
                          {t("import.undo")}
                        </MetaAction>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {msg ? (
        <AppText
          variant="caption"
          color={msg.bad ? "danger" : "textMuted"}
          className="mt-[var(--spacing-sm)] block"
          data-testid="import-card-status"
        >
          {msg.text}
        </AppText>
      ) : null}
      {asking ? (
        <ConfirmDialog
          title={t("import.undoTitle")}
          message={undoMessage(asking)}
          confirmLabel={t("import.undo")}
          destructive
          onConfirm={() => void doUndo()}
          onCancel={() => setAsking(null)}
          testId="import-undo-dialog"
        />
      ) : null}
    </Card>
  );
}
