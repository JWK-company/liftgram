"use client";
// @plm SRS-001  종목 관리 — 내가 만든 종목 고치기 · 목록에서 보관하기
//
// ─────────────────────────────────────────────────────────────────────────────
// 종목 상세는 서버 컴포넌트다(첫 값을 서버가 확정해 준다). 그런데 고치기·보관은 눌러야
// 일어나는 일이라 이 줄만 클라이언트로 뗀다.
//
// ── 지우지 않고 보관한다 ────────────────────────────────────────────────────
// 지난 기록이 이 종목을 가리키고 있다. 지우면 그 기록의 이름이 사라지므로, 목록에서
// 감추기만 한다(`archiveExercise`). 감춘 종목은 새 운동에 담을 수 없지만 예전 기록은 그대로다.
//
// ── 고치기는 내가 만든 것만 ─────────────────────────────────────────────────
// 기본 카탈로그는 앱이 함께 배포하는 자료다. 고치면 다음 시드에서 덮이거나, 같은 이름의
// 종목이 사람마다 다른 뜻이 된다 — 보관은 되지만 편집은 막는다.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { t } from "@/lib/i18n";
import { navigateAfterFlush } from "@/lib/localDb";
import { useToast } from "./Toast";
import { Button } from "./ui/Button";
import { ConfirmDialog } from "./ui/Dialog";

export function ExerciseAdminBar({ exerciseId, isCustom }: { exerciseId: string; isCustom: boolean }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function archive() {
    if (busy) return;
    setBusy(true);
    try {
      const repo = await import("@app/core/data/exerciseRepository");
      await repo.archiveExercise(exerciseId);
      // 목록으로 돌아간다 — 방금 감춘 종목의 상세에 남아 있을 이유가 없다.
      await navigateAfterFlush("/exercises");
    } catch {
      toast(t("common.error"), "error");
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
        {isCustom ? (
          <a href={`/exercises/${encodeURIComponent(exerciseId)}/edit`} className="flex-1">
            <Button
              title={t("common.edit")}
              icon="create-outline"
              variant="secondary"
              testId="btn-edit-exercise"
            />
          </a>
        ) : null}
        <div className="flex-1">
          <Button
            title={t("exercises.archive")}
            icon="archive-outline"
            variant="secondary"
            onPress={() => setConfirming(true)}
            testId="btn-archive-exercise"
          />
        </div>
      </div>

      {confirming ? (
        <ConfirmDialog
          testId="confirm-archive-exercise"
          title={t("exercises.archiveTitle")}
          message={t("exercises.archiveMessage")}
          confirmLabel={t("exercises.archive")}
          destructive
          onCancel={() => setConfirming(false)}
          onConfirm={() => void archive()}
        />
      ) : null}
    </>
  );
}
