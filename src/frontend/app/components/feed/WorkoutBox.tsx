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
import { useStartGuard } from "../useStartGuard";

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
  const starter = useStartGuard(); // 「바로 시작」 — 진행 중인 운동이 있으면 묻는다 @plm SRS-065

  const exercises = workout.exercises ?? [];
  const routineName =
    workout.workoutName?.trim() || t("feed.importRoutineDefaultName", { author: authorName });

  /**
   * 글의 종목을 내 기기 종목으로 해석한다 — 「루틴 가져오기」와 「바로 시작」이 같은 규칙을 쓴다(SRS-065 · 복붙 금지).
   * 종목 id → 대표 이름·별칭·영문 정확 일치(정규화) → 그래도 없으면 커스텀(/qa code H-2).
   */
  async function resolveExercises(mode: "import" | "start") {
    // 저장소는 브라우저에서만 쓸 수 있다 — 서버 렌더에 끌려 들어가지 않게 눌러서 가져온다.
    const [exerciseRepo, routineRepo] = await Promise.all([
      import("@app/core/data/exerciseRepository"),
      import("@app/core/data/routineRepository"),
    ]);
    const [catalog, { buildExerciseSearchIndex, resolveSharedExercise }, names] = await Promise.all([
      exerciseRepo.queryExercises({}).fetch(),
      import("@app/core/domain/exerciseSearch"),
      import("@app/core/data/exerciseNames"),
    ]);
    // [원본] 대표 이름·영문명이 정확히 같을 때만 찾았다 — 개편으로 이름이 바뀐 142종·사용자 별칭으로 공유된 종목을 못 찾아
    // 근육·기구가 「기타」인 커스텀을 만들었다(/qa code H-2)
    // const match = catalog.find((c) => c.nameKo.toLowerCase() === lower || (c.nameEn?.toLowerCase() ?? "") === lower);
    // [개선] 종목 id → 대표 이름·별칭·영문 정확 일치(정규화) → 그래도 없으면 커스텀
    const index = buildExerciseSearchIndex(
      catalog.map((c) => ({
        id: c.id,
        nameKo: c.nameKo,
        nameEn: c.nameEn,
        aliases: c.aliases ?? [],
        family: c.family,
        equipment: c.equipment,
        isArchived: c.isArchived,
      })),
    );
    const resolved: Parameters<typeof routineRepo.importRoutine>[1] = [];
    /** 맞은 별칭이 칸을 함축하면(「로프 푸시다운」 → 로프) 가져온 루틴 줄에도 적용한다 — resolved 와 같은 순서 */
    const axesByIndex = new Map<number, Awaited<ReturnType<typeof names.impliedAxesForAlias>>>();
    let skipped = 0;
    let unmatched = 0;
    // 남의 글은 믿지 않는다 — 모양을 확인하고 상한(종목 40·세트 50·이름 80자)에서 자른다(QA M-1) @plm SRS-065
    const { clampSharedExercises } = await import("@app/core/domain/sharePayload");
    const received = clampSharedExercises(exercises);
    skipped += Math.max(0, exercises.length - received.length);
    /** 이번 가져오기에서 새로 만든 커스텀 — 같은 이름이 두 번 나와도 하나만 만든다(QA M-1) */
    const createdByName = new Map<string, string>();

    for (const ex of received) {
      const nm = ex.name;
      const match = resolveSharedExercise(index, { exerciseId: ex.exerciseId, name: nm });
      let exerciseId: string;
      if (match) {
        exerciseId = match.id;
        if (match.hit?.matchedKind === "alias") {
          const axes = await names.impliedAxesForAlias(match.id, match.hit.matched);
          if (axes) axesByIndex.set(resolved.length, axes);
        }
      } else if (mode === "start") {
        // 「바로 시작」은 누르는 순간 커스텀 종목을 영구로 만들지 않는다 — 못 찾은 종목은 빼고 알린다(QA M-1).
        // 「가져오기」는 확인 창을 거친 뒤라 그 줄을 내 종목으로 만든다.
        unmatched++;
        continue;
      } else {
        const key = nm.toLowerCase();
        const made = createdByName.get(key);
        if (made) exerciseId = made;
        else {
          const created = await exerciseRepo.createCustomExercise({
            nameKo: nm,
            primaryMuscles: ["other"],
            equipment: "other",
          });
          exerciseId = created.id;
          createdByName.set(key, exerciseId);
        }
      }
      const working = ex.sets.filter((s) => !s.isWarmup);
      const src = working.length ? working : ex.sets;
      const reps = src.map((s) => s.reps).filter((r) => r > 0);
      // 목표 무게는 계산 무게(한쪽 입력이면 ×배수) — 받는 사람은 한쪽 입력을 켰는지 모른다(/qa code L-5)
      const weights = src.map((s) => s.weightKg * (s.loadMultiplier || 1)).filter((w) => w > 0);
      resolved.push({
        exerciseId,
        targetSets: src.length || undefined,
        targetRepsMin: reps.length ? Math.min(...reps) : undefined,
        targetWeightKg: weights.length ? Math.max(...weights) : undefined,
        note: ex.note || undefined, // 작성자 메모·팁도 함께 간다
      });
    }

    return { resolved, axesByIndex, skipped, unmatched, routineRepo, names };
  }

  /** 남의 운동 그대로 바로 시작 — 루틴을 만들지 않는다. 무게는 내 이전 기록으로 채운다(남의 무게는 남의 것). @plm SRS-065 */
  function startNow() {
    starter.guard(async (replacing) => {
      const { resolved, axesByIndex, unmatched, names } = await resolveExercises("start");
      // 하나도 못 찾았으면 시작하지 않는다 — 진행 중인 운동도 그대로(QA H-1)
      if (!resolved.length) throw new Error("NOTHING_MATCHED");
      const repo = await import("@app/core/data/workoutRepository");
      const name = workout.workoutName?.trim() || t("feed.startNowFallback", { author: authorName });
      const w = (await repo.startWorkoutFromSpec(
        name,
        resolved.map((r) => ({ exerciseId: r.exerciseId, sets: r.targetSets ?? 1 })),
        { replacing },
      )) as unknown as { id: string; startedAt: number; name: string | null };
      // 맞은 별칭이 칸을 함축하면(「로프 푸시다운」 → 로프) 바로 시작에도 — 가져오기와 같은 결과(QA L-2)
      if (axesByIndex.size) {
        const blocks = await repo.queryWorkoutExercises(w.id).fetch();
        for (const [i, axes] of axesByIndex) {
          const b = blocks[i];
          if (b && axes) await names.applyImpliedAxesToWorkoutExercise(b.id, axes).catch(() => {});
        }
      }
      if (unmatched > 0) toast(t("feed.startNowUnmatched", { count: unmatched }));
      return w;
    });
  }

  async function importRoutine() {
    if (importing) return;
    setImporting(true);
    setConfirm(false);
    try {
      const { resolved, axesByIndex, skipped, routineRepo, names } = await resolveExercises("import");
      if (!resolved.length) {
        toast(t("feed.importRoutineNone"));
        return;
      }
      const routine = await routineRepo.importRoutine(routineName, resolved);
      if (axesByIndex.size) {
        const rows = await routineRepo.queryRoutineExercises(routine.id).fetch();
        for (const [i, axes] of axesByIndex) {
          const row = rows[i];
          if (row && axes) await names.applyImpliedAxesToRoutineExercise(row.id, axes);
        }
      }
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
              onClick={startNow}
              disabled={starter.busy}
              data-testid="post-start-now"
              className="mr-[var(--spacing-md)] flex items-center gap-[4px] py-[var(--spacing-xs)]"
            >
              <Icon name="play" size={16} color="var(--color-brand)" />
              <AppText variant="caption" color="primary" className="font-medium!">
                {t("feed.startNow")}
              </AppText>
            </button>
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
                          // 한쪽 입력으로 적은 세트도 계산 무게로 보인다 — 같은 글의 총 볼륨과 숫자가 맞게(/qa code L-5)
                          `${formatWeight(s.weightKg * (s.loadMultiplier || 1), unit)}×${s.reps}${s.partialReps ? `+${s.partialReps}` : ""}${
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

      {starter.sheet}

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
