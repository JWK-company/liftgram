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
import { navigate } from "@/lib/nav";
import ExercisePicker from "../ExercisePicker";
import { PrCelebrationHost } from "../PrCelebration";
import { useSession } from "../SessionProvider";
import { ErrorState } from "../States";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { ActionSheet, ConfirmDialog, Overlay, SheetShell } from "../ui/Dialog";
import { MoreMenu } from "../ui/MoreMenu";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { TextField } from "../ui/inputs";
import { AppText, EmptyState } from "../ui/primitives";
import { ExerciseBlock, type WorkoutExerciseRow } from "./ExerciseBlock";
import { ExerciseName } from "./ExerciseName";
import { RestBar, clock } from "./RestBar";
import { SessionGuideButtons } from "./SessionGuides";
import { WorkoutSummary, type Summary } from "./WorkoutSummary";
import { FinishRoutineSheets, type FinishPromptState } from "./FinishRoutineSheets";
import { SetDraftContext, createSetDraftRegistry } from "./setDrafts";
import { firePrCelebration } from "../PrCelebration";

type WorkoutRepo = typeof import("@app/core/data/workoutRepository");
type WorkoutRow = {
  id: string;
  routineId: string | null;
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
  // 입력 중인 세트 값 — 슈퍼셋 함께 완료가 멤버 칸의 미저장 값을 반영하려고(QA Q3) @plm SRS-062
  const [drafts] = useState(createSetDraftRegistry);

  const [picking, setPicking] = useState<null | { mode: "add" } | { mode: "swap"; weId: string }>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [supersetTarget, setSupersetTarget] = useState<WorkoutExerciseRow | null>(null);
  const [confirmFinish, setConfirmFinish] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // 완료 직후 — 루틴과 달라진 점·루틴으로 저장을 묻는다(요약 위에 뜬다). @plm SRS-059 SRS-060
  const [finishPrompt, setFinishPrompt] = useState<FinishPromptState | null>(null);
  const [routineSaved, setRoutineSaved] = useState(false); // 완료 시트에서 새 루틴으로 저장했다(QA L5)
  // 루틴으로 시작한 운동에서 종목을 바꾸면 「이번만 / 루틴에도」를 묻는다(SRS-057 · 4.1)
  const [swapScope, setSwapScope] = useState<null | {
    routineId: string;
    routineName: string;
    from: string;
    to: string;
  }>(null);

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

  // ── 진행 중인 운동이 없으면 운동 탭으로 (#61) ──
  // 취소·완료(요약을 닫은 뒤)·뒤로 가기로 다시 온 경우·주소 직접 입력이 모두 여기로 모인다.
  // replace — 뒤로 가기가 빈 세션 화면으로 되돌아오지 않게.
  const leaveSession = useCallback(() => navigate("/", { replace: true }), []);
  useEffect(() => {
    if (repo && !workout && !summary) leaveSession();
  }, [repo, workout, summary, leaveSession]);

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
  // [원본] 요약을 닫으면 세션 화면에 그대로 남아 빈 「진행 중인 운동」이 떴다(탭바도 숨겨진 채 — 피드백 #61)
  // if (summary) return <WorkoutSummary summary={summary} unit={weightUnit} onClose={() => setSummary(null)} />;
  // [개선] 요약을 닫으면 운동 탭으로 — app 과 같다
  if (summary)
    return (
      <>
        <WorkoutSummary
          summary={summary}
          unit={weightUnit}
          onClose={leaveSession}
          routineSaved={routineSaved}
          // 「그대로 다시 시작」 — 같은 운동 화면에서 요약을 닫고 새 운동을 띄운다(주소가 같아 이동으로는 안 바뀐다) @plm SRS-065
          onReplayStarted={(w) => {
            setFinishPrompt(null);
            setRoutineSaved(false);
            setSummary(null);
            setWorkout(w as unknown as WorkoutRow);
            setVersion((v) => v + 1);
          }}
        />
        {finishPrompt ? (
          <FinishRoutineSheets
            prompt={finishPrompt}
            onDone={(saved) => {
              setFinishPrompt(null);
              if (saved) setRoutineSaved(true);
            }}
          />
        ) : null}
      </>
    );

  // [개선] 진행 중인 운동이 없으면(취소 직후·완료 뒤 뒤로 가기·주소 직접 입력) 이 화면에 머물지 않는다.
  // 세션 화면은 탭바를 숨기므로 여기 남으면 갈 곳이 없다(#61). 이동하는 동안은 불러오는 중으로 보인다.
  if (!repo || !workout) {
    return <EmptyState icon="hourglass-outline" title={t("session.loading")} />;
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
    <SetDraftContext.Provider value={drafts}>
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

          {/* 드문·위험 동작은 ⋯ 안으로(SRS-054) — 이름 바꾸기 · 운동 취소(삭제). 취소는 확인창을 그대로 거친다. */}
          <MoreMenu
            testId="btn-session-menu"
            options={[
              {
                label: t("session.renameTitle"),
                testId: "btn-rename",
                onPress: () => {
                  setNameDraft(workout.name ?? "");
                  setRenaming(true);
                },
              },
              {
                label: t("session.discardWorkoutButton"),
                destructive: true,
                testId: "btn-discard",
                onPress: () => setConfirmDiscard(true),
              },
            ]}
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
                        {block(m, {
                          insideSuperset: true,
                          onRoundToggle: (setNumber, next, setId, kg, reps) =>
                            roundToggle(row.members, setNumber, next, setId, kg, reps),
                        })}
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
          {/* 「운동 취소(삭제)」는 머리의 ⋯ 안에 있다 — 세트 추가보다 크고 붉게 늘 떠 있던 자리(SRS-054). */}
          <div className="h-[var(--spacing-xxl)]" />
        </div>

        <RestBar />
        <PrCelebrationHost />

        {picking ? (
          // 운동 추가는 화면 이동 없이 바닥 시트(시안 03) — 흐름이 끊기지 않는다.
          <Overlay onClose={() => setPicking(null)} placement="bottom" testId="picker-sheet">
            <ExercisePicker
              bare
              onClose={() => setPicking(null)}
              onPick={(exerciseId, info) =>
                guard(async () => {
                  // 고른 이름(별칭)이 표시 이름·함축 칸(로프 등)을 정한다 — lib/exerciseNames.applyPick @plm SRS-056
                  const { applyPick } = await import("@/lib/exerciseNames");
                  if (picking.mode === "swap") {
                    const from = exercises.find((x) => x.id === picking.weId)?.exerciseId ?? null;
                    await repo.swapWorkoutExercise(picking.weId, exerciseId);
                    await applyPick(exerciseId, info, { workoutExerciseId: picking.weId });
                    setVersion((v) => v + 1);
                    // [원본] 운동 중 「이번만 / 루틴에도」 — 완료 때 한 번에 고르므로 묻지 않는다(D3 · SRS-059)
                    // if (from) await askRoutineScope(from, exerciseId);
                    void from;
                  } else {
                    const we = await repo.addExerciseToWorkout(workout.id, exerciseId);
                    await applyPick(exerciseId, info, { workoutExerciseId: we.id });
                    if (info) setVersion((v) => v + 1);
                  }
                  setPicking(null);
                })
              }
            />
          </Overlay>
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
              <Button
                title={t("common.cancel")}
                variant="secondary"
                onPress={() => setSupersetTarget(null)}
              />
            </div>
          </SheetShell>
        ) : null}

        {swapScope ? (
          <ActionSheet
            testId="swap-scope"
            title={t("session.swapScopeTitle", { routine: swapScope.routineName })}
            onClose={() => setSwapScope(null)}
            options={[
              { label: t("session.swapThisTime"), testId: "btn-swap-this-time", onPress: () => {} },
              {
                label: t("session.swapAlsoRoutine"),
                testId: "btn-swap-routine",
                onPress: () => {
                  const s = swapScope;
                  guard(async () => {
                    const rr = await import("@app/core/data/routineRepository");
                    const n = await rr.swapExerciseInRoutine(s.routineId, s.from, s.to);
                    if (n > 0) toast(t("session.swapRoutineDone"));
                  });
                },
              },
            ]}
          />
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
                // 완료 **전에** 무엇을 물을지 본다 — 완료가 세트 0 블록·체크 안 한 세트를 지운다(QA Q1). 실패해도 완료는 막지 않는다.
                const fr = await import("@app/core/data/finishRoutine");
                // [원본] 순서를 화면이 지켰다 — core 함수가 순서를 고정한다(QA M3)
                // const ask = await fr.getFinishPrompt(workout.id).catch(() => null);
                // const s = await repo.completeWorkout(workout.id);
                const { summary: s, prompt: ask } = await fr.finishWorkoutWithPrompt(
                  workout.id,
                  repo.completeWorkout,
                );
                const { flushLocalDb } = await import("@/lib/localDb");
                await flushLocalDb();
                clearRest();
                setActive(null);
                setSummary(s as Summary);
                if (ask && ask.kind !== "none")
                  setFinishPrompt({
                    kind: ask.kind,
                    workoutId: workout.id,
                    routineName: ask.routineName,
                    plan: ask.plan,
                    blocks: ask.blocks,
                  });
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
                const { flushLocalDb } = await import("@/lib/localDb");
                await flushLocalDb();
                clearRest();
                setActive(null);
                setWorkout(null);
              });
            }}
          />
        ) : null}
      </div>
    </SetDraftContext.Provider>
  );

  /**
   * 슈퍼셋 한 바퀴 함께 완료(#48 A) — 누른 세트와 같은 번호의 멤버 세트를 한 번의 write 로 바꾼다.
   * 멤버 칸의 입력 중 값은 등록부에서 가져와 먼저 반영하고(QA Q3), PR 축하는 모아서 한 번(QA Q6).
   * 휴식은 누른 블록이 한 번 건다. 같은 번호가 없는 멤버는 건너뛴다. @plm SRS-062
   */
  async function roundToggle(
    members: WorkoutExerciseRow[],
    setNumber: number,
    next: boolean,
    pressedId: string,
    kg: number | undefined,
    reps: number | undefined,
  ) {
    if (!repo) return;
    // [원본] set_number(워밍업 포함) 로 짝지었다 — 화면 번호와 다른 세트가 함께 완료됐다(/qa code M3)
    // const round = await repo.getSupersetRoundSets(members.map((m) => m.id), setNumber);
    // [개선] 화면에 보이는 번호로 짝짓는다(워밍업·드롭·실패 칸은 그 종목만)
    void setNumber;
    const round = await repo.getSupersetRoundSetsFor(
      members.map((m) => m.id),
      pressedId,
    );
    const entries = round.map((r) => {
      if (r.setLogId === pressedId) return { setLogId: r.setLogId, weightKg: kg, reps };
      const d = drafts.get(r.setLogId);
      return { setLogId: r.setLogId, weightKg: d?.weightKg, reps: d?.reps };
    });
    await repo.completeSupersetRound(entries, next);
    for (const e of entries) drafts.clear(e.setLogId);
    if (!next) return;
    // 누른 칸이 비어 있었으면 0 으로 저장하지 않고 원래 값을 둔다 — 왜 그대로인지 알린다(M4)
    if (kg === undefined || reps === undefined) toast(t("session.supersetEmptyKept"));
    // 묶음으로 함께 완료된 다른 종목에도 처방 무게(탑셋 → 백오프 %)를 채운다(M5) — 누른 블록은 자기가 채운다
    try {
      for (const r of round) {
        if (r.setLogId === pressedId) continue;
        const e = entries.find((x) => x.setLogId === r.setLogId);
        const w = e?.weightKg ?? r.weightKg;
        if (w > 0) await repo.fillPrescribedLoadsAfter(r.workoutExerciseId, r.setLogId, w, e?.reps ?? r.reps);
      }
    } catch {
      // 채우지 못해도 기록은 남는다
    }
    try {
      const names: string[] = [];
      const types = new Set<string>();
      const exRepo = await import("@app/core/data/exerciseNames");
      for (const r of round) {
        const e = entries.find((x) => x.setLogId === r.setLogId);
        const got = await repo.evalLiveSetPr(r.workoutExerciseId, r.setLogId, e?.weightKg, e?.reps);
        if (!got.length) continue;
        const exId = members.find((m) => m.id === r.workoutExerciseId)?.exerciseId;
        const name = exId ? ((await exRepo.getExerciseDisplayNameMap([exId])).get(exId) ?? "") : "";
        if (name) names.push(name);
        for (const p of got) types.add(p.type);
      }
      if (types.size) {
        firePrCelebration({
          exerciseName: names.join(" · "),
          types: [...types] as Parameters<typeof firePrCelebration>[0]["types"],
        });
      }
    } catch {
      // 축하가 실패해도 기록은 남는다
    }
  }

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
        onSwapTo={(weId, exerciseId) =>
          guard(async () => {
            if (!repo) return;
            const from = we.exerciseId;
            await repo.swapWorkoutExercise(weId, exerciseId);
            setVersion((v) => v + 1);
            // [원본] 운동 중 「이번만 / 루틴에도」 — 완료 때 한 번에 고른다(D3 · SRS-059)
            // await askRoutineScope(from, exerciseId);
            void from;
          })
        }
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

  /**
   * 루틴으로 시작한 운동이고 그 루틴에 바꾸기 전 종목이 아직 있으면 「이번만 / 루틴에도」를 묻는다.
   * 빠른 운동이거나 루틴에서 이미 빠진 종목이면 묻지 않는다(이번만). @plm SRS-057
   */
  // biome-ignore lint/correctness/noUnusedVariables: 원복용 보존 — 운동 중 질문은 D3 로 막았다(SRS-059)
  async function askRoutineScope(from: string, to: string) {
    if (!workout?.routineId || from === to) return;
    try {
      const rr = await import("@app/core/data/routineRepository");
      const routine = (await rr.getRoutine(workout.routineId)) as unknown as { id: string; name: string };
      const rows = (await rr.queryRoutineExercises(routine.id).fetch()) as unknown as {
        exerciseId: string;
      }[];
      if (!rows.some((r) => r.exerciseId === from)) return;
      setSwapScope({ routineId: routine.id, routineName: routine.name, from, to });
    } catch {
      // 루틴이 지워졌다 — 이번만 바뀐다
    }
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
    // [원본] 빨간 테두리 + 빨간 머리띠 — 묶음은 「구역」 표시라 진한 회색 테두리 + 회색 caption(화면 정리 P1) @plm SRS-069
    // <div className="… border-[1.5px] border-(--color-brand) …"><div className="… bg-(--color-brand-muted) …">
    <div className="mb-[var(--spacing-lg)] overflow-hidden rounded-[var(--radius-lg)] border-[1.5px] border-(--color-line-strong) bg-(--color-surface)">
      <div className="flex items-center bg-(--color-surface-alt) px-[var(--spacing-md)] py-[var(--spacing-xs)]">
        {onMoveUp || onMoveDown ? (
          <div className="mr-[6px] flex flex-col gap-[2px]">
            <IconButton
              icon="chevron-up"
              size={16}
              label={t("session.moveUp")}
              disabled={!onMoveUp}
              color={onMoveUp ? "var(--color-ink2)" : "var(--color-line)"}
              onPress={onMoveUp}
              className="h-5! w-5!"
            />
            <IconButton
              icon="chevron-down"
              size={16}
              label={t("session.moveDown")}
              disabled={!onMoveDown}
              color={onMoveDown ? "var(--color-ink2)" : "var(--color-line)"}
              onPress={onMoveDown}
              className="h-5! w-5!"
            />
          </div>
        ) : null}
        <Icon name="git-merge-outline" size={15} color="var(--color-ink2)" />
        <AppText variant="caption" color="textMuted" className="ml-[6px] flex-1 font-semibold">
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
