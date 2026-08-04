"use client";
// @plm SRS-003  운동 탭(루틴) — app의 features/routines/WorkoutTabScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 앱을 열면 처음 보이는 화면이다. 위에서 아래로:
//
//   헤더            "운동" + (진행 중이면) 이어서 운동하기
//   진행 중 카드    폐기
//   주간 스케줄     없으면 만들기 엔트리, 있으면 요일 칩
//   오늘의 안내     스케줄이 있으면 오늘 배정 · 없으면 추천 루틴
//   3버튼          새 루틴 · 빠른 운동 시작 · 프로그램 생성
//   콘셉트 루틴     4종(도메인 상수) → 미리보기 → 내 루틴에 저장
//   내 루틴        폴더 그룹 + 낱개 루틴 + 빈 상태
//
// ── 판단은 전부 도메인·저장소가 한다 ────────────────────────────────────────
// 오늘 무엇을 할지(todayPlan) · 무엇을 놓쳤는지(missedCatchUp) · 무엇을 추천할지
// (getTodayRoutineRecommendation) · 콘셉트 루틴의 내용(CONCEPT_ROUTINES) — 전부 core다.
// 여기서 다시 계산하면 app과 갈라진다(ADR-032).
// ─────────────────────────────────────────────────────────────────────────────
import {
  CONCEPT_ROUTINES,
  currentBlockWeek,
  missedCatchUp,
  muscleLabel,
  todayPlan,
  type ConceptRoutine,
  type MissedPlan,
  type WeeklySchedule,
} from "@app/core";
import { useQueryData } from "@app/core/db/hooks";
import { useUser } from "@app/core/state/userContext";
import { useCallback, useEffect, useMemo, useState } from "react";
import { lang, t, tw } from "@/lib/i18n";
import { useSession } from "../SessionProvider";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { ActionSheet, ConfirmDialog, SheetShell } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { AppText, Card, EmptyState, SectionHeader } from "../ui/primitives";
import { ScheduleEditor } from "./ScheduleEditor";

type RoutineRepo = typeof import("@app/core/data/routineRepository");
type WorkoutRepo = typeof import("@app/core/data/workoutRepository");
type AnalyticsRepo = typeof import("@app/core/data/analyticsRepository");

type Routine = { id: string; name: string; folder: string | null };
type Reco = Awaited<ReturnType<AnalyticsRepo["getTodayRoutineRecommendation"]>>;

/** 요일 칩·오늘 카드의 색 점 — 루틴 순서에 따라 고정 배정한다(app과 같은 팔레트). */
const ROUTINE_DOT_PALETTE = [
  "#4F8EF7",
  "#A78BFA",
  "#34D399",
  "#F59E0B",
  "#F472B6",
  "#22D3EE",
  "#F87171",
  "#A3E635",
];

export default function RoutinesClient() {
  const { user, weeklySchedule } = useUser();
  const { activeWorkoutId, activeName, setActive, refreshActive } = useSession();
  const toast = useToast();

  const [repos, setRepos] = useState<{
    routine: RoutineRepo;
    workout: WorkoutRepo;
    analytics: AnalyticsRepo;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reco, setReco] = useState<Reco | null>(null);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [concept, setConcept] = useState<ConceptRoutine | null>(null);
  const [actionsFor, setActionsFor] = useState<Routine | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Routine | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [activeExists, setActiveExists] = useState<null | (() => Promise<void>)>(null);
  const [editingSchedule, setEditingSchedule] = useState(false);
  /** 최근 8일 중 운동을 마친 날. 캐치업 판정이 이걸 본다. */
  const [doneDayNums, setDoneDayNums] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [routine, workout, analytics] = await Promise.all([
        import("@app/core/data/routineRepository"),
        import("@app/core/data/workoutRepository"),
        import("@app/core/data/analyticsRepository"),
      ]);
      if (!cancelled) setRepos({ routine, workout, analytics });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const models = useQueryData(() => (repos ? repos.routine.queryRoutines() : null), [repos]);
  const routines: Routine[] = useMemo(() => models.map((m) => m as unknown as Routine), [models]);

  // 추천은 완료 이력을 훑어야 나온다 — 목록·진행 상태가 바뀔 때만 다시 읽는다.
  const analytics = repos?.analytics ?? null;
  const routineCount = routines.length;
  // 아래 두 의존(routineCount·activeWorkoutId)은 **다시 읽는 계기**다 — 효과 본문이 값을 읽지는
  // 않지만, 루틴이 늘거나 운동을 시작·끝내면 추천이 달라지므로 그때 다시 계산해야 한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 값이 아니라 계기로 쓰는 의존
  useEffect(() => {
    if (!analytics) return;
    let cancelled = false;
    void analytics
      .getTodayRoutineRecommendation()
      .then((r) => !cancelled && setReco(r))
      .catch(() => !cancelled && setReco(null));
    void analytics
      .getCompletedDayNumsSince(8)
      .then((d) => !cancelled && setDoneDayNums(d))
      .catch(() => !cancelled && setDoneDayNums(new Set()));
    return () => {
      cancelled = true;
    };
  }, [analytics, routineCount, activeWorkoutId]);

  /**
   * 낱개 루틴의 순서를 한 칸 옮긴다.
   *
   * **폴더에 든 루틴은 대상이 아니다** — 폴더 안은 묶음의 순서라 목록 순서와 다른 축이다.
   * 저장은 전체 순서를 다시 매기는 한 번의 쓰기다(부분 갱신은 중간 값이 남는다).
   */
  function moveRoutine(id: string, delta: number) {
    const idx = loose.findIndex((r) => r.id === id);
    const to = idx + delta;
    if (idx < 0 || to < 0 || to >= loose.length) return;
    const next = [...loose];
    const [moved] = next.splice(idx, 1);
    next.splice(to, 0, moved);
    setActionsFor(null);
    run(async () => void (await repos?.routine.reorderRoutines(next.map((r) => r.id))));
  }

  const looseIndexOf = (id: string) => loose.findIndex((r) => r.id === id);

  /** 폴더가 있는 루틴은 묶고, 없는 것은 낱개로 — 순서는 루틴 정렬 순서를 따른다. */
  const { folderGroups, loose } = useMemo(() => {
    const groups = new Map<string, Routine[]>();
    const rest: Routine[] = [];
    for (const r of routines) {
      if (r.folder) {
        const arr = groups.get(r.folder) ?? [];
        arr.push(r);
        groups.set(r.folder, arr);
      } else rest.push(r);
    }
    return { folderGroups: [...groups.entries()], loose: rest };
  }, [routines]);

  const dotColor = useCallback(
    (routineId: string) => {
      const i = routines.findIndex((r) => r.id === routineId);
      return ROUTINE_DOT_PALETTE[(i < 0 ? 0 : i) % ROUTINE_DOT_PALETTE.length];
    },
    [routines],
  );

  const run = (fn: () => Promise<void>) =>
    void (async () => {
      setBusy(true);
      try {
        await fn();
        // 쓴 것을 디스크에 내려쓴다 — 곧바로 화면을 옮겨도 남아 있어야 한다.
        const { flushLocalDb } = await import("@/lib/localDb");
        await flushLocalDb();
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "error");
      } finally {
        setBusy(false);
      }
    })();

  /**
   * 새 운동을 시작하기 전에 **진행 중인 것이 있는지** 묻는다.
   *
   * 두 개를 동시에 진행할 수 없다 — 그냥 덮어쓰면 기록이 소리 없이 사라지므로,
   * app과 같이 "이어서 하기 / 폐기하고 새로 시작"을 고르게 한다.
   */
  const guardActive = (start: () => Promise<void>) => {
    if (!activeWorkoutId) {
      run(start);
      return;
    }
    setActiveExists(() => start);
  };

  const startBlank = async () => {
    if (!repos) return;
    const w = (await repos.workout.startBlankWorkout()) as unknown as {
      id: string;
      startedAt: number;
      name: string | null;
    };
    setActive({ id: w.id, startedAt: w.startedAt, name: w.name });
    const { navigateAfterFlush } = await import("@/lib/localDb");
    await navigateAfterFlush("/workout");
  };

  const startFromRoutine = (routineId: string) => async () => {
    if (!repos) return;
    const w = (await repos.workout.startWorkoutFromRoutine(routineId)) as unknown as {
      id: string;
      startedAt: number;
      name: string | null;
    };
    setActive({ id: w.id, startedAt: w.startedAt, name: w.name });
    const { navigateAfterFlush } = await import("@/lib/localDb");
    await navigateAfterFlush("/workout");
  };

  const plan = todayPlan(weeklySchedule, Date.now());
  // 놓친 루틴 — 가장 최근 배정일에 완료가 0건이면 후보다(스케줄을 쓰는 사람에게만 뜻이 있다).
  const catchUp: MissedPlan | null = weeklySchedule
    ? missedCatchUp(weeklySchedule, doneDayNums, Date.now())
    : null;
  const block = currentBlockWeek(weeklySchedule, Date.now());
  const assignedCount = weeklySchedule?.days.filter((d) => d !== null && d !== "rest").length ?? 0;

  return (
    <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
      {/* ── 헤더 ── */}
      <div className="mb-[var(--spacing-lg)] flex items-center justify-between">
        <AppText variant="display">{t("routines.title")}</AppText>
        {activeWorkoutId ? (
          <a href="/workout" data-testid="btn-resume">
            <Button title={t("routines.resumeWorkout")} icon="play" size="sm" fullWidth={false} />
          </a>
        ) : null}
      </div>

      {/* ── 진행 중인 운동 ── */}
      {activeWorkoutId ? (
        <Card className="mb-[var(--spacing-lg)] border-(--color-brand)!">
          <div className="flex items-center gap-[var(--spacing-md)]" data-testid="resume-card">
            <div className="min-w-0 flex-1">
              <AppText variant="heading" className="block truncate">
                {activeName || t("routines.activeWorkout")}
              </AppText>
              <AppText variant="caption" color="textMuted" className="mt-[2px] block">
                {t("routines.resumePrompt")}
              </AppText>
            </div>
            <Button
              title={t("routines.discardWorkoutButton")}
              variant="danger"
              size="sm"
              fullWidth={false}
              testId="btn-discard-active"
              onPress={() => setConfirmDiscard(true)}
            />
          </div>
        </Card>
      ) : null}

      {/* ── 주간 스케줄 ── */}
      {weeklySchedule ? (
        <Card className={`mb-[var(--spacing-sm)] ${block?.isDeload ? "border-(--color-pr)!" : ""}`}>
          <div className="flex items-center gap-[var(--spacing-sm)]">
            <AppText variant="label" color="primary">
              {t("schedule.title")}
            </AppText>
            {block ? (
              <span
                style={{
                  backgroundColor: block.isDeload ? "var(--color-surface-alt)" : "var(--color-brand-muted)",
                }}
                className="rounded-[var(--radius-pill)] px-[var(--spacing-sm)] py-[2px]"
              >
                <AppText variant="label" color={block.isDeload ? "warning" : "primary"} className="font-bold">
                  {block.isDeload ? t("schedule.deloadWeek") : t("schedule.weekN", { week: block.week })}
                </AppText>
              </span>
            ) : null}
            {assignedCount > 0 ? (
              <AppText variant="caption" color="textMuted">
                {t("schedule.timesPerWeek", { count: assignedCount })}
              </AppText>
            ) : null}
          </div>
          <WeekStrip schedule={weeklySchedule} routines={routines} dotColor={dotColor} />
          <div className="mt-[var(--spacing-sm)]">
            <Button
              title={t("schedule.editTitle")}
              icon="calendar-outline"
              variant="secondary"
              size="sm"
              fullWidth={false}
              onPress={() => setEditingSchedule(true)}
              testId="btn-edit-schedule"
            />
          </div>
        </Card>
      ) : (
        <EntryRow
          icon="calendar-outline"
          label={t("schedule.createEntry")}
          testId="entry-schedule"
          onPress={() => setEditingSchedule(true)}
        />
      )}

      {/* ── 오늘의 안내 ── */}
      {!activeWorkoutId && weeklySchedule ? (
        <TodayCard
          plan={plan}
          routines={routines}
          dotColor={dotColor}
          onStart={(id) => guardActive(startFromRoutine(id))}
          busy={busy}
        />
      ) : !activeWorkoutId && reco && !reco.alreadyWorkedOutToday ? (
        <RecoCard reco={reco} onStart={(id) => guardActive(startFromRoutine(id))} busy={busy} />
      ) : null}

      {/* 놓친 루틴 — 오늘 예정과 같으면 카드 한 장으로 충분하다. */}
      {catchUp &&
      !reco?.alreadyWorkedOutToday &&
      !(plan.kind === "routine" && plan.routineId === catchUp.routineId) ? (
        <CatchUpCard
          catchUp={catchUp}
          name={routines.find((r) => r.id === catchUp.routineId)?.name ?? null}
          busy={busy}
          onStart={() => guardActive(startFromRoutine(catchUp.routineId))}
        />
      ) : null}

      {/* ── 새 운동 진입 ── */}
      <div className="mb-[var(--spacing-sm)]">
        <a href="/routines/new" className="block">
          <Button title={t("routines.newRoutine")} icon="add" variant="secondary" testId="btn-new-routine" />
        </a>
      </div>
      <div className="mb-[var(--spacing-sm)]">
        <Button
          title={t("routines.quickStart")}
          icon="flash"
          loading={busy}
          testId="btn-quick-start"
          onPress={() => guardActive(startBlank)}
        />
      </div>
      <div className="mb-[var(--spacing-sm)]">
        <a href="/program" className="block">
          <Button title={t("program.title")} icon="sparkles" variant="secondary" testId="btn-program" />
        </a>
      </div>

      {/* ── 콘셉트 루틴 ── */}
      <div className="mb-[var(--spacing-sm)]">
        <AppText variant="label" color="textMuted" className="mb-[4px] block">
          {t("concept.sectionTitle")}
        </AppText>
        <div className="flex gap-[var(--spacing-sm)]">
          {CONCEPT_ROUTINES.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid={`concept-${c.id}`}
              onClick={() => setConcept(c)}
              // min-w-0 이 없으면 긴 이름이 카드를 밀어 화면 전체가 가로로 넘친다(flex 기본값 함정).
              className="flex min-w-0 flex-1 flex-col gap-[2px] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface) p-[var(--spacing-md)] text-left"
            >
              <AppText variant="body" className="block truncate font-bold">
                {lang === "ko" ? c.nameKo : c.nameEn}
              </AppText>
              <AppText variant="label" color="textMuted">
                {t("concept.dayCount", { count: c.days.length })}
              </AppText>
            </button>
          ))}
        </div>
      </div>

      {/* ── 주변 헬스장(SRS-035) ── 맥락상 "어디서 운동할까"라 이 자리다. */}
      <a
        href="/gyms"
        data-testid="btn-gyms"
        className="mt-[var(--spacing-md)] flex items-center gap-[var(--spacing-sm)] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface) px-[var(--spacing-md)] py-[var(--spacing-md)]"
      >
        <Icon name="location" size={18} color="var(--color-brand)" />
        <AppText variant="body" className="flex-1 font-medium!">
          {t("gyms.entry")}
        </AppText>
        <Icon name="chevron-forward" size={18} color="var(--color-ink2)" />
      </a>

      {/* ── 내 루틴 ── */}
      <div className="mt-[var(--spacing-lg)]">
        <SectionHeader title={t("routines.myRoutines")} />
      </div>

      {folderGroups.map(([name, members]) => (
        <FolderGroup
          key={name}
          name={name}
          members={members}
          open={openFolders[name] ?? false}
          repo={repos?.routine ?? null}
          busy={busy}
          onToggle={() => setOpenFolders((m) => ({ ...m, [name]: !m[name] }))}
          onStart={(id) => guardActive(startFromRoutine(id))}
          onActions={setActionsFor}
        />
      ))}

      {routines.length === 0 ? (
        <EmptyState
          icon="clipboard-outline"
          title={t("routines.listEmptyTitle")}
          message={t("routines.listEmptyMessage")}
          action={
            <a href="/routines/new">
              <Button title={t("routines.createRoutine")} icon="add" fullWidth={false} />
            </a>
          }
        />
      ) : (
        <div data-testid="routine-list">
          {loose.map((r) => (
            <RoutineRow
              key={r.id}
              routine={r}
              repo={repos?.routine ?? null}
              busy={busy}
              onStart={() => guardActive(startFromRoutine(r.id))}
              onActions={() => setActionsFor(r)}
            />
          ))}
        </div>
      )}

      {/* ── 대화상자들 ── */}
      {concept ? (
        <ConceptDialog
          concept={concept}
          existingNames={routines.map((r) => r.name)}
          onClose={() => setConcept(null)}
          onSaved={(count) => {
            setConcept(null);
            toast(t("concept.savedMessage", { count }));
          }}
        />
      ) : null}

      {editingSchedule ? (
        <ScheduleEditor
          schedule={weeklySchedule}
          routines={routines.map((r) => ({ id: r.id, name: r.name }))}
          onClose={() => setEditingSchedule(false)}
          onSave={async (next) => {
            if (!user) return;
            const userRepo = await import("@app/core/data/userRepository");
            await userRepo.updateUserSettings(user.id, { weeklySchedule: next });
            // 로컬 저장소는 비동기로 내려쓴다 — 판을 닫기 전에 확실히 남긴다.
            const { flushLocalDb } = await import("@/lib/localDb");
            await flushLocalDb();
            setEditingSchedule(false);
          }}
          onDelete={async () => {
            if (!user) return;
            const userRepo = await import("@app/core/data/userRepository");
            await userRepo.updateUserSettings(user.id, { weeklySchedule: null });
            const { flushLocalDb } = await import("@/lib/localDb");
            await flushLocalDb();
            setEditingSchedule(false);
          }}
        />
      ) : null}

      {actionsFor ? (
        <ActionSheet
          testId="routine-actions"
          title={actionsFor.name}
          onClose={() => setActionsFor(null)}
          options={[
            {
              label: t("routines.edit"),
              onPress: () => {
                location.href = `/routines/${actionsFor.id}`;
              },
            },
            // 순서 바꾸기 — app은 길게 눌러 끄는 방식이지만, 웹에서 그 제스처는 터치에서
            // 스크롤과 싸운다(길게 누르면 페이지가 따라 움직인다). 결과가 같은 조작으로 옮긴다.
            ...(looseIndexOf(actionsFor.id) > 0
              ? [{ label: tw("web.routines.moveUp"), onPress: () => moveRoutine(actionsFor.id, -1) }]
              : []),
            ...(looseIndexOf(actionsFor.id) >= 0 && looseIndexOf(actionsFor.id) < loose.length - 1
              ? [{ label: tw("web.routines.moveDown"), onPress: () => moveRoutine(actionsFor.id, 1) }]
              : []),
            {
              label: t("routines.duplicate"),
              onPress: () => run(async () => void (await repos?.routine.duplicateRoutine(actionsFor.id))),
            },
            {
              label: t("common.delete"),
              destructive: true,
              onPress: () => setConfirmDelete(actionsFor),
            },
          ]}
        />
      ) : null}

      {confirmDelete ? (
        <ConfirmDialog
          testId="confirm-delete-routine"
          title={t("routines.deleteTitle")}
          message={t("routines.deleteConfirm", { routineName: confirmDelete.name })}
          confirmLabel={t("common.delete")}
          destructive
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const target = confirmDelete;
            setConfirmDelete(null);
            run(async () => void (await repos?.routine.deleteRoutine(target.id)));
          }}
        />
      ) : null}

      {confirmDiscard ? (
        <ConfirmDialog
          testId="confirm-discard-active"
          title={t("routines.discardWorkoutTitle")}
          message={t("routines.discardWorkoutMessage")}
          confirmLabel={t("common.delete")}
          destructive
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => {
            setConfirmDiscard(false);
            run(async () => {
              if (activeWorkoutId) await repos?.workout.discardWorkout(activeWorkoutId).catch(() => {});
              setActive(null);
              await refreshActive();
            });
          }}
        />
      ) : null}

      {activeExists ? (
        <ActionSheet
          testId="active-exists"
          title={t("routines.activeExistsTitle")}
          onClose={() => setActiveExists(null)}
          options={[
            {
              label: t("routines.resumeInstead"),
              onPress: () => {
                location.href = "/workout";
              },
            },
            {
              label: t("routines.discardAndStart"),
              destructive: true,
              onPress: () => {
                const start = activeExists;
                setActiveExists(null);
                run(async () => {
                  if (activeWorkoutId) await repos?.workout.discardWorkout(activeWorkoutId).catch(() => {});
                  setActive(null);
                  await start();
                });
              },
            },
          ]}
        />
      ) : null}
    </div>
  );
}

/** 스케줄·헬스장처럼 "누르면 다른 화면으로 가는" 한 줄. */
function EntryRow({
  icon,
  label,
  onPress,
  testId,
  disabled,
}: {
  icon: "calendar-outline" | "location";
  label: string;
  onPress?: () => void;
  testId?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onPress}
      disabled={disabled}
      className="mb-[var(--spacing-sm)] flex w-full items-center gap-[var(--spacing-sm)] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface) px-[var(--spacing-md)] py-[var(--spacing-md)] disabled:opacity-45"
    >
      <Icon name={icon} size={18} color="var(--color-brand)" />
      <AppText variant="body" className="flex-1 text-left font-semibold">
        {label}
      </AppText>
      <Icon name="chevron-forward" size={18} color="var(--color-ink2)" />
    </button>
  );
}

/** 요일 칩 7개 — 루틴이면 색 점, 휴식이면 달, 미배정이면 빈칸(app과 같이 이름은 쓰지 않는다). */
function WeekStrip({
  schedule,
  routines,
  dotColor,
}: {
  schedule: { days: (string | null)[] };
  routines: Routine[];
  dotColor: (id: string) => string;
}) {
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  const today = (new Date().getDay() + 6) % 7;

  return (
    <div className="mt-[var(--spacing-sm)] flex gap-[4px]">
      {DAYS.map((d, i) => {
        const v = schedule.days[i];
        const isToday = i === today;
        const routine = v && v !== "rest" ? routines.find((r) => r.id === v) : null;
        return (
          <span
            key={d}
            style={{
              borderColor: isToday ? "var(--color-brand)" : "var(--color-line)",
              backgroundColor: isToday ? "var(--color-brand-muted)" : "var(--color-surface-alt)",
            }}
            className="flex flex-1 flex-col items-center rounded-[var(--radius-sm)] border py-[6px]"
          >
            <AppText
              variant="label"
              color={isToday ? "primary" : "textFaint"}
              className={isToday ? "font-bold" : ""}
            >
              {t(`schedule.dayShort.${d}` as Parameters<typeof t>[0])}
            </AppText>
            <span className="flex min-h-[12px] items-center gap-[3px]">
              {routine ? (
                <span
                  style={{ backgroundColor: dotColor(routine.id) }}
                  className="h-[6px] w-[6px] rounded-[3px]"
                />
              ) : v === "rest" ? (
                <Icon name="moon" size={9} color={isToday ? "var(--color-brand)" : "var(--color-ink2)"} />
              ) : null}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** 스케줄이 정한 오늘 — 루틴이면 시작 버튼, 휴식·미배정이면 안내만. */
function TodayCard({
  plan,
  routines,
  dotColor,
  onStart,
  busy,
}: {
  plan: { kind: string; routineId?: string | null };
  routines: Routine[];
  dotColor: (id: string) => string;
  onStart: (routineId: string) => void;
  busy: boolean;
}) {
  if (plan.kind === "routine" && plan.routineId) {
    const routine = routines.find((r) => r.id === plan.routineId);
    // 배정된 루틴이 지워졌으면 카드를 아예 띄우지 않는다(빈 카드가 더 헷갈린다).
    if (!routine) return null;
    return (
      <Card className="mb-[var(--spacing-sm)] border-(--color-brand)! bg-(--color-brand-muted)!">
        <div className="flex items-center" data-testid="today-card">
          <div className="mr-[var(--spacing-md)] min-w-0 flex-1">
            <AppText variant="label" color="primary">
              {t("schedule.todayLabel")}
            </AppText>
            <span className="mt-[2px] flex items-center gap-[6px]">
              <span style={{ backgroundColor: dotColor(routine.id) }} className="h-2 w-2 rounded-[4px]" />
              <AppText variant="heading" className="block truncate">
                {routine.name}
              </AppText>
            </span>
            <AppText variant="caption" color="textMuted" className="mt-[2px] block">
              {t("schedule.todayHint")}
            </AppText>
          </div>
          <Button
            title={t("routines.start")}
            icon="play"
            size="sm"
            fullWidth={false}
            disabled={busy}
            onPress={() => onStart(routine.id)}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card alt className="mb-[var(--spacing-sm)]">
      <AppText variant="label" color="textMuted">
        {t("schedule.todayLabel")}
      </AppText>
      <AppText variant="caption" color="textMuted" className="mt-[4px] block">
        {plan.kind === "rest" ? t("schedule.todayRest") : t("schedule.todayNone")}
      </AppText>
    </Card>
  );
}

/** 스케줄이 없을 때의 안내 — 꾸준히 하면 도메인이 다음 부위를 골라 준다. */
function RecoCard({
  reco,
  onStart,
  busy,
}: {
  reco: Reco;
  onStart: (routineId: string) => void;
  busy: boolean;
}) {
  if (reco.status !== "ok" || !reco.routineId || !reco.muscle) {
    return (
      <Card alt className="mb-[var(--spacing-sm)]">
        <AppText variant="label" color="textMuted">
          {t("routines.todayRecoLabel")}
        </AppText>
        <AppText variant="caption" color="textMuted" className="mt-[4px] block">
          {t("routines.todayRecoInsufficient")}
        </AppText>
      </Card>
    );
  }

  return (
    <Card className="mb-[var(--spacing-sm)] border-(--color-brand)! bg-(--color-brand-muted)!">
      <div className="flex items-center" data-testid="reco-card">
        <div className="mr-[var(--spacing-md)] min-w-0 flex-1">
          <AppText variant="label" color="primary">
            {t("routines.todayRecoLabel")}
          </AppText>
          <AppText variant="heading" className="mt-[2px] block truncate">
            {reco.routineName}
          </AppText>
          <AppText variant="caption" color="textMuted" className="mt-[2px] block">
            {t("routines.todayRecoHint", { muscle: muscleLabel(reco.muscle, lang) })}
          </AppText>
        </div>
        <Button
          title={t("routines.start")}
          icon="play"
          size="sm"
          fullWidth={false}
          disabled={busy}
          onPress={() => reco.routineId && onStart(reco.routineId)}
        />
      </div>
    </Card>
  );
}

/** 폴더로 묶인 루틴들 — 접었다 펼 수 있다. 폴더 안은 순서 변경 대상이 아니다. */
function FolderGroup({
  name,
  members,
  open,
  repo,
  busy,
  onToggle,
  onStart,
  onActions,
}: {
  name: string;
  members: Routine[];
  open: boolean;
  repo: RoutineRepo | null;
  busy: boolean;
  onToggle: () => void;
  onStart: (routineId: string) => void;
  onActions: (r: Routine) => void;
}) {
  return (
    <Card className="mb-[var(--spacing-md)]">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-[var(--spacing-sm)]">
        <Icon name={open ? "folder-open" : "folder"} size={20} color="var(--color-brand)" />
        <span className="min-w-0 flex-1 text-left">
          <AppText variant="heading" className="block truncate">
            {name}
          </AppText>
          <AppText variant="caption" color="textMuted" className="mt-[2px] block">
            {t("routines.folderRoutineCount", { count: members.length })}
          </AppText>
        </span>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={18} color="var(--color-ink2)" />
      </button>

      {open
        ? members.map((r) => (
            <div
              key={r.id}
              className="mt-[var(--spacing-sm)] flex items-center border-(--color-line) border-t pt-[var(--spacing-sm)] pl-[var(--spacing-md)]"
            >
              <span className="mr-[var(--spacing-sm)] min-w-0 flex-1">
                <AppText variant="body" className="block truncate font-bold">
                  {r.name}
                </AppText>
                <ExerciseCount repo={repo} routineId={r.id} />
              </span>
              <Button
                title={t("routines.start")}
                size="sm"
                fullWidth={false}
                disabled={busy}
                onPress={() => onStart(r.id)}
              />
              <IconButton
                icon="ellipsis-horizontal"
                label={t("routines.edit")}
                onPress={() => onActions(r)}
              />
            </div>
          ))
        : null}
    </Card>
  );
}

/** 폴더에 들어 있지 않은 루틴 한 줄. */
function RoutineRow({
  routine,
  repo,
  busy,
  onStart,
  onActions,
}: {
  routine: Routine;
  repo: RoutineRepo | null;
  busy: boolean;
  onStart: () => void;
  onActions: () => void;
}) {
  return (
    <Card className="mb-[var(--spacing-md)]">
      <div className="flex items-center justify-between" data-testid={`routine-${routine.id}`}>
        <div className="mr-[var(--spacing-md)] min-w-0 flex-1">
          <AppText variant="heading" className="block truncate">
            {routine.name}
          </AppText>
          <ExerciseCount repo={repo} routineId={routine.id} />
        </div>
        <div className="flex items-center gap-[var(--spacing-xs)]">
          <Button
            title={t("routines.start")}
            size="sm"
            fullWidth={false}
            disabled={busy}
            testId="btn-start-routine"
            onPress={onStart}
          />
          <IconButton
            icon="ellipsis-horizontal"
            label={t("routines.edit")}
            testId="btn-routine-actions"
            onPress={onActions}
          />
        </div>
      </div>
    </Card>
  );
}

/** 루틴에 든 종목 수 — 반응형 쿼리라 편집하면 곧바로 따라온다. */
function ExerciseCount({ repo, routineId }: { repo: RoutineRepo | null; routineId: string }) {
  const rows = useQueryData(() => (repo ? repo.queryRoutineExercises(routineId) : null), [repo, routineId]);
  return (
    <AppText variant="caption" color="textMuted" className="mt-[2px] block">
      {t("routines.exerciseCount", { count: rows.length })}
    </AppText>
  );
}

/** 콘셉트 루틴 미리보기 — 스토리와 Day 구성을 보여 주고, 저장하면 Day마다 루틴이 하나씩 생긴다. */
function ConceptDialog({
  concept,
  existingNames,
  onClose,
  onSaved,
}: {
  concept: ConceptRoutine;
  existingNames: string[];
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [dupe, setDupe] = useState(false);

  const routineName = (dayName: string) => `${lang === "ko" ? concept.nameKo : concept.nameEn} — ${dayName}`;

  const save = async () => {
    setSaving(true);
    try {
      const [exerciseRepo, routineRepo] = await Promise.all([
        import("@app/core/data/exerciseRepository"),
        import("@app/core/data/routineRepository"),
      ]);
      const names = [...new Set(concept.days.flatMap((d) => d.exercises))];
      const idByName = await exerciseRepo.getExerciseIdsByNames(names);

      let made = 0;
      for (const d of concept.days) {
        // 시드에 없는 종목은 조용히 뺀다 — 하나 없다고 Day 전체를 못 만들 이유가 없다.
        const items = d.exercises
          .map((n) => idByName.get(n))
          .filter((id): id is string => !!id)
          .map((exerciseId) => ({ exerciseId }));
        if (!items.length) continue;
        await routineRepo.importRoutine(routineName(lang === "ko" ? d.nameKo : d.nameEn), items);
        made += 1;
      }
      onSaved(made);
    } finally {
      setSaving(false);
    }
  };

  const onSave = () => {
    const willMake = concept.days.map((d) => routineName(lang === "ko" ? d.nameKo : d.nameEn));
    if (!dupe && willMake.some((n) => existingNames.includes(n))) {
      setDupe(true);
      return;
    }
    void save();
  };

  if (dupe) {
    return (
      <ConfirmDialog
        testId="concept-dupe"
        title={t("concept.dupeTitle")}
        message={t("concept.dupeMessage")}
        confirmLabel={t("common.save")}
        onCancel={() => setDupe(false)}
        onConfirm={() => void save()}
      />
    );
  }

  return (
    <SheetShell
      title={lang === "ko" ? concept.nameKo : concept.nameEn}
      onClose={onClose}
      hideOk
      testId="concept-sheet"
    >
      <AppText variant="body" color="textMuted" className="mt-[4px] block">
        {lang === "ko" ? concept.storyKo : concept.storyEn}
      </AppText>

      {concept.days.map((d) => (
        <div
          key={d.nameKo}
          className="mt-[var(--spacing-sm)] rounded-[var(--radius-sm)] bg-(--color-surface-alt) p-[var(--spacing-sm)]"
        >
          <AppText variant="caption" color="primary" className="font-bold">
            {lang === "ko" ? d.nameKo : d.nameEn}
          </AppText>
          <AppText variant="caption" color="textMuted" className="mt-[2px] block">
            {d.exercises.join(" · ")}
          </AppText>
        </div>
      ))}

      <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
        <div className="flex-1">
          <Button title={t("common.cancel")} variant="secondary" onPress={onClose} />
        </div>
        <div className="flex-1">
          <Button title={t("concept.saveButton")} loading={saving} testId="concept-save" onPress={onSave} />
        </div>
      </div>
    </SheetShell>
  );
}

/**
 * 놓친 루틴 — **지난 배정일에 아무것도 안 한 날**이 있으면 한 장 띄운다.
 *
 * 오늘 예정과 같은 루틴이면 띄우지 않는다(부르는 쪽이 판단한다) — 같은 말을 두 번 하는 셈이라
 * 카드만 늘고 무엇을 하라는 건지 흐려진다.
 */
function CatchUpCard({
  catchUp,
  name,
  busy,
  onStart,
}: {
  catchUp: MissedPlan;
  name: string | null;
  busy: boolean;
  onStart: () => void;
}) {
  if (!name) return null; // 지워진 루틴을 가리키고 있다 — 권할 것이 없다
  return (
    <Card className="mb-[var(--spacing-sm)]" data-testid="catchup-card">
      <AppText variant="label" color="warning" className="block">
        {t("schedule.catchUpLabel")}
      </AppText>
      <div className="mt-[var(--spacing-xs)] flex items-center gap-[var(--spacing-sm)]">
        <div className="min-w-0 flex-1">
          <AppText variant="body" className="block truncate font-medium!">
            {name}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {t("schedule.catchUpDaysAgo", { days: catchUp.daysAgo })}
          </AppText>
        </div>
        <Button
          title={t("schedule.startThis")}
          size="sm"
          fullWidth={false}
          disabled={busy}
          onPress={onStart}
          testId="btn-catchup-start"
        />
      </div>
    </Card>
  );
}
