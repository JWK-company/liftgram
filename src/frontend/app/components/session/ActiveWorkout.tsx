"use client";
// @plm SRS-004  세션 화면 — app의 features/session/ActiveWorkoutScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 앱에서 제일 오래 켜져 있는 화면이다. 위에서 아래로:
//
//   헤더        경과 시간(MM:SS) · 이름(탭하면 변경) · 라이브 볼륨 · 일시정지 · 완료
//   가이드      RIR · 웜업
//   종목들      슈퍼셋은 파란 테두리 컨테이너로 묶인다
//   푸터        운동 추가 · 운동 취소(삭제)
//   휴식 바     세트를 체크하면 아래에 뜬다(전역 타이머)
//
// ── 규칙은 전부 저장소·도메인에 있다 ────────────────────────────────────────
// 볼륨·PR·이전기록·휴식 길이·제안 무게 — 하나도 여기서 계산하지 않는다(ADR-032).
// 화면이 하는 일은 "무엇을 어디에 놓고, 누르면 어느 저장소 함수를 부르는가"뿐이다.
//
// ── 반응형 쿼리의 빈틈 ──────────────────────────────────────────────────────
// 로컬 저장소의 관찰은 행의 증감만 알린다. 그래서 app과 같이 볼륨은 1.5초 폴링으로,
// 순서·슈퍼셋 변경은 `version` 을 올려 다시 읽는다.
// ─────────────────────────────────────────────────────────────────────────────
import { formatWeight } from "@app/core";
import { useQueryData } from "@app/core/db/hooks";
import { useUser } from "@app/core/state/userContext";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import ExercisePicker from "../ExercisePicker";
import { PrCelebrationHost } from "../PrCelebration";
import { useSession } from "../SessionProvider";
import { ErrorState } from "../States";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { ConfirmDialog, SheetShell } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { TextField } from "../ui/inputs";
import { AppText, EmptyState } from "../ui/primitives";
import { ExerciseBlock, type WorkoutExerciseRow } from "./ExerciseBlock";
import { ExerciseName } from "./ExerciseName";
import { RestBar, clock } from "./RestBar";
import { SessionGuideButtons } from "./SessionGuides";
import { WorkoutSummary, type Summary } from "./WorkoutSummary";

type WorkoutRepo = typeof import("@app/core/data/workoutRepository");
type WorkoutRow = {
  id: string;
  name: string | null;
  startedAt: number;
  state: string;
  pausedAt: number | null;
  accumulatedPauseMs: number;
};

/** 한 줄에 놓일 것 — 단독 종목이거나 슈퍼셋 묶음이다. */
type Row =
  | { kind: "single"; we: WorkoutExerciseRow }
  | { kind: "group"; group: string; members: WorkoutExerciseRow[] };

export default function ActiveWorkout() {
  const { weightUnit, barWeightKg, bodyweightKg } = useUser();
  const { startRest, clearRest, setActive } = useSession();
  const toast = useToast();

  const [repo, setRepo] = useState<WorkoutRepo | null>(null);
  const [workout, setWorkout] = useState<WorkoutRow | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [liveVolume, setLiveVolume] = useState(0);
  const [version, setVersion] = useState(0);

  const [picking, setPicking] = useState<null | { mode: "add" } | { mode: "swap"; weId: string }>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [supersetTarget, setSupersetTarget] = useState<WorkoutExerciseRow | null>(null);
  const [confirmFinish, setConfirmFinish] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // ── 부팅 ──
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const w = await import("@app/core/data/workoutRepository");
        const active = await w.getActiveWorkout();
        if (cancelled) return;
        setRepo(w);
        const row = active ? (active as unknown as WorkoutRow) : null;
        setWorkout(row);
        setActive(row ? { id: row.id, startedAt: row.startedAt, name: row.name } : null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setActive]);

  // 기록한 직후 탭을 닫아도 남아야 한다(SRS-006).
  useEffect(() => {
    let stop: (() => void) | undefined;
    void import("@/lib/localDb").then((m) => {
      stop = m.flushOnHide();
    });
    return () => stop?.();
  }, []);

  const paused = workout?.state === "paused";

  // 경과 시간 — 일시정지 중에는 멈춘다. 서버 렌더와 값이 다르므로 첫 렌더는 비운다.
  useEffect(() => {
    setNow(Date.now());
    if (paused) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [paused]);

  const models = useQueryData(
    () => (repo && workout ? repo.queryWorkoutExercises(workout.id) : null),
    [repo, workout, version],
  );
  const exercises: WorkoutExerciseRow[] = useMemo(
    () => models.map((m) => m as unknown as WorkoutExerciseRow),
    [models],
  );

  /** 쓰기 하나가 끝날 때마다 — 볼륨을 다시 재고 **디스크로 내려쓴다**(웹 저장소는 메모리에 먼저 쓴다). */
  const afterWrite = useCallback(async () => {
    const { flushLocalDb } = await import("@/lib/localDb");
    await flushLocalDb();
    if (!repo || !workout) return;
    setLiveVolume(await repo.getWorkoutLiveVolume(workout.id));
  }, [repo, workout]);

  useEffect(() => {
    void afterWrite();
    const iv = setInterval(() => {
      if (repo && workout) void repo.getWorkoutLiveVolume(workout.id).then(setLiveVolume);
    }, 1500);
    return () => clearInterval(iv);
  }, [afterWrite, repo, workout]);

  const guard = (fn: () => Promise<void>) =>
    void (async () => {
      setBusy(true);
      setErr(null);
      try {
        await fn();
        await afterWrite();
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        setErr(detail);
        toast(detail, "error");
      } finally {
        setBusy(false);
      }
    })();

  // ── 종목 배치: 슈퍼셋 묶음은 한 줄로 접는다 ──
  const rows: Row[] = useMemo(() => {
    const done = new Set<string>();
    const out: Row[] = [];
    for (const we of exercises) {
      if (we.supersetGroup) {
        if (done.has(we.supersetGroup)) continue;
        const members = exercises.filter((x) => x.supersetGroup === we.supersetGroup);
        if (members.length >= 2) {
          done.add(we.supersetGroup);
          out.push({ kind: "group", group: we.supersetGroup, members });
          continue;
        }
      }
      out.push({ kind: "single", we });
    }
    return out;
  }, [exercises]);

  /** 행 단위 이동 — 묶음은 통째로 움직이고, 안의 순서는 그대로 둔다. */
  const moveRow = (index: number, delta: number) => {
    const next = [...rows];
    const to = index + delta;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    const ids = next.flatMap((r) => (r.kind === "group" ? r.members.map((m) => m.id) : [r.we.id]));
    guard(async () => {
      if (!repo) return;
      await repo.reorderWorkoutExercises(ids);
      setVersion((v) => v + 1);
    });
  };

  if (err && !repo) return <ErrorState message={err} onRetry={() => location.reload()} />;
  if (summary) return <WorkoutSummary summary={summary} unit={weightUnit} onClose={() => setSummary(null)} />;

  if (!repo) {
    return <EmptyState icon="hourglass-outline" title={t("session.loading")} />;
  }

  if (!workout) {
    return (
      // app에서는 이 자리가 없다 — 진행 중인 운동이 없으면 세션 화면 자체가 열리지 않고
      // 운동 탭(루틴 화면)이 뜬다. 웹은 주소로 바로 들어올 수 있어 이 상태가 생긴다.
      <EmptyState
        icon="barbell-outline"
        title={t("routines.activeWorkout")}
        message={t("session.noExercises.message")}
        action={
          <Button
            testId="btn-start"
            title={t("routines.quickStart")}
            icon="play"
            fullWidth={false}
            disabled={busy}
            onPress={() =>
              guard(async () => {
                const w = (await repo.startBlankWorkout()) as unknown as WorkoutRow;
                setWorkout(w);
                // 셸의 전역 운동 바가 곧바로 뜨도록 알린다.
                setActive({ id: w.id, startedAt: w.startedAt, name: w.name });
              })
            }
          />
        }
      />
    );
  }

  const elapsed =
    now == null
      ? 0
      : Math.max(
          0,
          Math.round(
            ((paused && workout.pausedAt ? workout.pausedAt : now) -
              workout.startedAt -
              (workout.accumulatedPauseMs ?? 0)) /
              1000,
          ),
        );

  return (
    <div className="flex flex-1 flex-col">
      {/* ── 헤더 ── */}
      <div className="flex items-start gap-[var(--spacing-sm)] border-(--color-line) border-b px-[var(--spacing-md)] py-[var(--spacing-sm)]">
        {/* 세션을 **끝내지 않고** 화면만 벗어난다 — 진행 중인 운동은 그대로 남는다(app과 같다). */}
        <a
          href="/"
          data-testid="btn-close-session"
          aria-label={t("routines.activeWorkout")}
          className="flex h-10 w-10 shrink-0 items-center justify-center"
        >
          <Icon name="chevron-down" size={22} color="var(--color-ink)" />
        </a>

        <div className="ml-[4px] min-w-0 flex-1">
          <AppText variant="title" data-testid="elapsed" className="block font-bold">
            {now == null ? "" : clock(elapsed)}
          </AppText>
          <button
            type="button"
            data-testid="workout-name"
            onClick={() => {
              setNameDraft(workout.name ?? "");
              setRenaming(true);
            }}
            className="flex items-center"
          >
            <AppText variant="label" color={paused ? "warning" : "textMuted"} className="truncate">
              {paused ? t("session.paused") : (workout.name ?? t("session.inProgress"))}
            </AppText>
            <Icon name="pencil" size={12} color="var(--color-ink3)" className="ml-[4px]" />
          </button>
          <AppText variant="caption" color="pr" data-testid="live-volume" className="block">
            {t("session.liveVolume", { volume: formatWeight(liveVolume, weightUnit) })}
          </AppText>
        </div>

        <IconButton
          icon={paused ? "play" : "pause"}
          label={paused ? t("session.done") : t("session.paused")}
          color="var(--color-ink)"
          filled
          testId="btn-pause"
          onPress={() =>
            guard(async () => {
              if (paused) await repo.resumeWorkout(workout.id);
              else await repo.pauseWorkout(workout.id);
              const w = await repo.getWorkout(workout.id);
              setWorkout(w as unknown as WorkoutRow);
            })
          }
        />

        <Button
          title={t("session.done")}
          size="sm"
          fullWidth={false}
          loading={busy}
          testId="btn-complete"
          className="rounded-[var(--radius-pill)]!"
          onPress={() =>
            void (async () => {
              const undone = await repo.getWorkoutUndoneSetCount(workout.id).catch(() => 0);
              setConfirmFinish(
                undone > 0
                  ? `${t("session.finishUndoneCount", { count: undone })}\n${t("session.finishWorkout.message")}`
                  : t("session.finishWorkout.message"),
              );
            })()
          }
        />
      </div>

      <SessionGuideButtons />

      <div className="flex-1 p-[var(--spacing-lg)]">
        {exercises.length === 0 ? (
          <EmptyState
            icon="add-circle"
            title={t("session.noExercises.title")}
            message={t("session.noExercises.message")}
          />
        ) : (
          <div data-testid="workout-exercises">
            {rows.map((row, i) =>
              row.kind === "group" ? (
                <SupersetContainer
                  key={row.group}
                  onUnlink={() => unlink(row.members)}
                  onMoveUp={i > 0 ? () => moveRow(i, -1) : undefined}
                  onMoveDown={i < rows.length - 1 ? () => moveRow(i, 1) : undefined}
                >
                  {row.members.map((m, mi) => (
                    <div key={m.id}>
                      {mi > 0 ? <div className="my-[4px] h-px bg-(--color-line)" /> : null}
                      {block(m, { insideSuperset: true })}
                    </div>
                  ))}
                </SupersetContainer>
              ) : (
                <div key={row.we.id}>
                  {block(row.we, {
                    onMoveUp: i > 0 ? () => moveRow(i, -1) : undefined,
                    onMoveDown: i < rows.length - 1 ? () => moveRow(i, 1) : undefined,
                  })}
                </div>
              ),
            )}
          </div>
        )}

        <div className="mt-[var(--spacing-sm)]">
          <Button
            title={t("session.addExercise")}
            icon="add"
            variant="secondary"
            disabled={busy}
            testId="btn-add-exercise"
            onPress={() => setPicking({ mode: "add" })}
          />
        </div>
        <div className="mt-[var(--spacing-xl)]">
          <Button
            title={t("session.discardWorkoutButton")}
            variant="danger"
            icon="trash-outline"
            disabled={busy}
            testId="btn-discard"
            onPress={() => setConfirmDiscard(true)}
          />
        </div>
      </div>

      <RestBar />
      <PrCelebrationHost />

      {picking ? (
        <div className="p-[var(--spacing-lg)] pt-0">
          <ExercisePicker
            onClose={() => setPicking(null)}
            onPick={(exerciseId) =>
              guard(async () => {
                if (picking.mode === "swap") {
                  await repo.swapWorkoutExercise(picking.weId, exerciseId);
                  setVersion((v) => v + 1);
                } else {
                  await repo.addExerciseToWorkout(workout.id, exerciseId);
                }
                setPicking(null);
              })
            }
          />
        </div>
      ) : null}

      {renaming ? (
        <SheetShell
          title={t("session.renameTitle")}
          onClose={() => setRenaming(false)}
          hideOk
          testId="rename-sheet"
        >
          <div className="mt-[var(--spacing-sm)]">
            <TextField
              testId="rename-input"
              value={nameDraft}
              placeholder={t("session.renamePlaceholder")}
              onChange={(e) => setNameDraft(e.target.value)}
              // 이름을 고치러 연 창이라 바로 입력할 수 있어야 한다
              autoFocus
            />
          </div>
          <div className="flex gap-[var(--spacing-sm)]">
            <div className="flex-1">
              <Button title={t("common.cancel")} variant="secondary" onPress={() => setRenaming(false)} />
            </div>
            <div className="flex-1">
              <Button
                title={t("common.save")}
                testId="rename-save"
                onPress={() => {
                  setRenaming(false);
                  guard(async () => {
                    await repo.renameWorkout(workout.id, nameDraft);
                    const w = (await repo.getWorkout(workout.id)) as unknown as WorkoutRow;
                    setWorkout(w);
                    setActive({ id: w.id, startedAt: w.startedAt, name: w.name });
                  });
                }}
              />
            </div>
          </div>
        </SheetShell>
      ) : null}

      {supersetTarget ? (
        <SheetShell
          title={t("routines.supersetPickTitle")}
          onClose={() => setSupersetTarget(null)}
          hideOk
          testId="superset-sheet"
        >
          <ul className="mt-[var(--spacing-sm)] max-h-[320px] overflow-y-auto">
            {exercises
              .filter((x) => x.id !== supersetTarget.id)
              .map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    data-testid="superset-option"
                    onClick={() => pairSuperset(supersetTarget, x)}
                    className="flex w-full items-center justify-between border-(--color-line) border-b py-[var(--spacing-sm)] text-left"
                  >
                    <ExerciseName exerciseId={x.exerciseId} variant="body" base />
                    {x.supersetGroup ? (
                      <span className="rounded-[var(--radius-pill)] bg-(--color-brand-muted) px-[var(--spacing-sm)] py-[2px]">
                        <AppText variant="label" color="primary">
                          {t("session.superset")}
                        </AppText>
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
          </ul>
          <div className="mt-[var(--spacing-md)]">
            <Button title={t("common.cancel")} variant="secondary" onPress={() => setSupersetTarget(null)} />
          </div>
        </SheetShell>
      ) : null}

      {confirmFinish ? (
        <ConfirmDialog
          testId="confirm-finish"
          title={t("session.finishWorkout.title")}
          message={confirmFinish}
          confirmLabel={t("session.finishWorkout.confirm")}
          onCancel={() => setConfirmFinish(null)}
          onConfirm={() => {
            setConfirmFinish(null);
            guard(async () => {
              const s = await repo.completeWorkout(workout.id);
              const { flushLocalDb } = await import("@/lib/localDb");
              await flushLocalDb();
              clearRest();
              setActive(null);
              setSummary(s as Summary);
              setWorkout(null);
            });
          }}
        />
      ) : null}

      {confirmDiscard ? (
        <ConfirmDialog
          testId="confirm-discard"
          title={t("session.discardWorkout.title")}
          message={t("session.discardWorkout.message")}
          confirmLabel={t("common.delete")}
          destructive
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false);
            guard(async () => {
              await repo.discardWorkout(workout.id);
              clearRest();
              setActive(null);
              setWorkout(null);
            });
          }}
        />
      ) : null}
    </div>
  );

  function block(we: WorkoutExerciseRow, extra: Partial<Parameters<typeof ExerciseBlock>[0]> = {}) {
    return (
      <ExerciseBlock
        we={we}
        repo={repo as WorkoutRepo}
        unit={weightUnit}
        barWeightKg={barWeightKg}
        bodyweightKg={bodyweightKg}
        onStartRest={startRest}
        onSwap={(weId) => setPicking({ mode: "swap", weId })}
        canSuperset={exercises.length > 1}
        onSuperset={() => setSupersetTarget(we)}
        onUnsuperset={() =>
          unlink(
            exercises.filter((x) => x.supersetGroup === we.supersetGroup),
            we,
          )
        }
        onChanged={afterWrite}
        {...extra}
      />
    );
  }

  /** 두 종목을 한 묶음으로 — 이미 묶여 있던 상대의 멤버까지 전부 합친다. */
  function pairSuperset(a: WorkoutExerciseRow, b: WorkoutExerciseRow) {
    const ids = new Set<string>([a.id, b.id]);
    for (const x of exercises) {
      if (x.supersetGroup && (x.supersetGroup === a.supersetGroup || x.supersetGroup === b.supersetGroup)) {
        ids.add(x.id);
      }
    }
    setSupersetTarget(null);
    guard(async () => {
      if (!repo) return;
      await repo.groupWorkoutExercisesAsSuperset([...ids]);
      setVersion((v) => v + 1);
    });
  }

  /**
   * 묶음 해제 — 멤버가 둘뿐이면 통째로 풀고, 셋 이상이면 **자기 자신만** 뺀다
   * (셋 중 하나를 빼도 남은 둘은 여전히 슈퍼셋이기 때문이다).
   */
  function unlink(members: WorkoutExerciseRow[], self?: WorkoutExerciseRow) {
    const ids = members.length <= 2 || !self ? members.map((m) => m.id) : [self.id];
    guard(async () => {
      if (!repo) return;
      await repo.ungroupWorkoutExercisesSuperset(ids);
      setVersion((v) => v + 1);
    });
  }
}

/** 슈퍼셋 묶음 — 파란 테두리 안에 멤버들을 넣는다(app과 같은 모양). */
function SupersetContainer({
  children,
  onUnlink,
  onMoveUp,
  onMoveDown,
}: {
  children: React.ReactNode;
  onUnlink: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div className="mb-[var(--spacing-lg)] overflow-hidden rounded-[var(--radius-lg)] border-[1.5px] border-(--color-brand) bg-(--color-surface)">
      <div className="flex items-center bg-(--color-brand-muted) px-[var(--spacing-md)] py-[var(--spacing-sm)]">
        {onMoveUp || onMoveDown ? (
          <div className="mr-[6px] flex flex-col gap-[2px]">
            <IconButton
              icon="chevron-up"
              size={16}
              label={t("session.moveUp")}
              disabled={!onMoveUp}
              color={onMoveUp ? "var(--color-brand)" : "var(--color-line)"}
              onPress={onMoveUp}
              className="h-5! w-5!"
            />
            <IconButton
              icon="chevron-down"
              size={16}
              label={t("session.moveDown")}
              disabled={!onMoveDown}
              color={onMoveDown ? "var(--color-brand)" : "var(--color-line)"}
              onPress={onMoveDown}
              className="h-5! w-5!"
            />
          </div>
        ) : null}
        <Icon name="git-merge-outline" size={15} color="var(--color-brand)" />
        <AppText variant="label" color="primary" className="ml-[6px] flex-1 font-bold">
          {t("session.superset")}
        </AppText>
        <button
          type="button"
          data-testid="btn-unlink-superset"
          onClick={onUnlink}
          className="px-[var(--spacing-sm)] py-[2px]"
        >
          <AppText variant="label" color="textMuted">
            {t("session.supersetUnlink")}
          </AppText>
        </button>
      </div>
      <div className="px-[var(--spacing-md)] py-[4px]">{children}</div>
    </div>
  );
}
