"use client";
// @plm SRS-007  오운완 상자 — 게시물 안의 운동 요약과 "루틴 가져오기"
//
// ─────────────────────────────────────────────────────────────────────────────
// 서버가 준 값을 **그대로** 놓는다. 볼륨도 세트 수도 여기서 다시 세지 않는다 —
// 계산 규칙은 도메인에 하나뿐이고, 그 하나가 올린 사람의 기기에서 이미 돌았다(ADR-032).
//
// ── 루틴 가져오기 ───────────────────────────────────────────────────────────
// 남의 오운완을 내 루틴으로 만든다. 종목은 **이름으로** 찾는다(nameKo/nameEn, 대소문자 무시).
// 못 찾으면 그 이름으로 커스텀 종목을 만든다 — 남의 루틴에 있는 종목이 내 카탈로그에 없다고
// 해서 가져오기가 실패하면, 되는 경우가 거의 없어진다.
//
// 목표 세트·횟수·무게는 **워킹세트만** 보고 정한다(웜업이 섞이면 목표가 내려간다).
// 웜업만 있는 종목은 어쩔 수 없이 전체 세트를 쓴다.
// ─────────────────────────────────────────────────────────────────────────────
import { formatWeight, type WeightUnit } from "@app/core";
import type { WorkoutSummary } from "@app/contracts";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { scheduleFlush } from "@/lib/localDb";
import { useToast } from "../Toast";
import { ConfirmDialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { AppText, Tag } from "../ui/primitives";

function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <AppText variant="label" color="textFaint">
        {label}
      </AppText>
      <AppText variant="body" className="block font-medium!">
        {value}
      </AppText>
    </div>
  );
}

export function WorkoutBox({
  workout,
  unit,
  authorName,
}: {
  workout: WorkoutSummary;
  unit: WeightUnit;
  authorName: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [importing, setImporting] = useState(false);
  const toast = useToast();

  const exercises = workout.exercises ?? [];
  const routineName =
    workout.workoutName?.trim() || t("feed.importRoutineDefaultName", { author: authorName });

  async function importRoutine() {
    if (importing) return;
    setImporting(true);
    setConfirm(false);
    try {
      // 저장소는 브라우저에서만 쓸 수 있다 — 서버 렌더에 끌려 들어가지 않게 눌러서 가져온다.
      const [exerciseRepo, routineRepo] = await Promise.all([
        import("@app/core/data/exerciseRepository"),
        import("@app/core/data/routineRepository"),
      ]);
      const catalog = await exerciseRepo.queryExercises({}).fetch();
      const resolved: Parameters<typeof routineRepo.importRoutine>[1] = [];
      let skipped = 0;

      for (const ex of exercises) {
        const nm = ex.name.trim();
        if (!nm) {
          skipped++;
          continue;
        }
        const lower = nm.toLowerCase();
        const match = catalog.find(
          (c) => c.nameKo.toLowerCase() === lower || (c.nameEn?.toLowerCase() ?? "") === lower,
        );
        let exerciseId: string;
        if (match) {
          exerciseId = match.id;
        } else {
          const created = await exerciseRepo.createCustomExercise({
            nameKo: nm,
            primaryMuscles: ["other"],
            equipment: "other",
          });
          exerciseId = created.id;
        }
        const working = ex.sets.filter((s) => !s.isWarmup);
        const src = working.length ? working : ex.sets;
        const reps = src.map((s) => s.reps).filter((r) => r > 0);
        const weights = src.map((s) => s.weightKg).filter((w) => w > 0);
        resolved.push({
          exerciseId,
          targetSets: src.length || undefined,
          targetRepsMin: reps.length ? Math.min(...reps) : undefined,
          targetWeightKg: weights.length ? Math.max(...weights) : undefined,
          note: ex.note || undefined, // 작성자 메모·팁도 함께 간다
        });
      }

      if (!resolved.length) {
        toast(t("feed.importRoutineNone"));
        return;
      }
      await routineRepo.importRoutine(routineName, resolved);
      // 로컬 저장소는 비동기로 flush된다 — 바로 /routines로 옮겨 가도 남아 있게 예약해 둔다.
      scheduleFlush();
      toast(t("feed.importRoutineResult", { imported: resolved.length, skipped }));
    } catch {
      toast(t("common.error"), "error");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div
      className="mt-[var(--spacing-sm)] rounded-[var(--radius-md)] bg-(--color-surface-alt) p-[var(--spacing-md)]"
      data-testid="post-workout"
    >
      {workout.workoutName ? (
        <AppText variant="heading" className="block truncate">
          {workout.workoutName}
        </AppText>
      ) : null}

      <div className="mt-[var(--spacing-sm)] flex gap-[var(--spacing-xl)]">
        <Stat label={t("session.totalVolume")} value={formatWeight(workout.totalVolumeKg, unit)} />
        <Stat label={t("session.duration")} value={duration(workout.durationSeconds)} />
        <Stat label={t("session.setCount")} value={String(workout.workingSets)} />
      </div>

      {workout.streakDays > 0 || workout.prCount > 0 ? (
        <div className="mt-[var(--spacing-sm)] flex flex-wrap items-center gap-[var(--spacing-xs)]">
          {workout.streakDays > 0 ? (
            <span className="flex items-center gap-[2px]">
              <Icon name="flame" size={14} color="var(--color-warn)" />
              <Tag label={t("session.streakDays", { count: workout.streakDays })} tone="primary" />
            </span>
          ) : null}
          {workout.prCount > 0 ? (
            <Tag label={t("session.prCount", { count: workout.prCount })} tone="pr" />
          ) : null}
        </div>
      ) : null}

      {exercises.length ? (
        <>
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              data-testid="post-routine-toggle"
              className="flex items-center gap-[4px] py-[var(--spacing-xs)]"
            >
              <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color="var(--color-brand)" />
              <AppText variant="caption" color="primary" className="font-medium!">
                {open ? t("feed.hideRoutine") : t("feed.showRoutine", { count: exercises.length })}
              </AppText>
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setConfirm(true)}
              disabled={importing}
              data-testid="post-routine-import"
              className="flex items-center gap-[4px] py-[var(--spacing-xs)]"
            >
              <Icon name="cloud-download-outline" size={16} color="var(--color-brand)" />
              <AppText variant="caption" color="primary" className="font-medium!">
                {importing ? t("feed.importing") : t("feed.importRoutine")}
              </AppText>
            </button>
          </div>

          {open ? (
            <div className="mt-[var(--spacing-xs)] border-(--color-line) border-t pt-[var(--spacing-xs)]">
              {/* 게시된 운동은 **바뀌지 않는 스냅샷**이다 — 순서가 흔들리지 않으므로 위치가 곧 신원이다.
                  (같은 종목을 두 번 한 루틴도 있어서 이름만으로는 키가 되지 못한다.) */}
              {exercises.map((ex, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 재정렬되지 않는 스냅샷 목록
                <div key={i} className="mt-[var(--spacing-sm)]">
                  <AppText variant="body" className="block truncate font-medium!">
                    {ex.name}
                  </AppText>
                  <AppText variant="caption" color="textMuted" className="mt-[2px] block">
                    {ex.sets
                      .map(
                        (s) =>
                          `${formatWeight(s.weightKg, unit)}×${s.reps}${s.partialReps ? `+${s.partialReps}` : ""}${
                            s.isWarmup ? " (W)" : ""
                          }`,
                      )
                      .join("   ·   ")}
                  </AppText>
                  {ex.note ? (
                    <AppText variant="caption" color="textFaint" className="mt-[2px] block">
                      {t("analytics.exerciseNote", { note: ex.note })}
                    </AppText>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {confirm ? (
        <ConfirmDialog
          title={t("feed.importRoutineTitle")}
          message={t("feed.importRoutineConfirm", { name: routineName, count: exercises.length })}
          confirmLabel={t("feed.importRoutineAction")}
          onCancel={() => setConfirm(false)}
          onConfirm={importRoutine}
          testId="import-routine-confirm"
        />
      ) : null}
    </div>
  );
}
