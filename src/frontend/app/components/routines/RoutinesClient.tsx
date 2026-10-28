"use client";
// @plm SRS-002  운동 탭(루틴) — app의 features/routines/WorkoutTabScreen.tsx를 웹으로
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
import { navigate } from "@/lib/nav";
import {
  // [원본] CONCEPT_ROUTINES, — 옛 콘셉트 그리드 원복 시 살린다(SRS-091)
  type CreatorTopic,
  creatorRoutinesFor,
  visibleCreatorTopics,
  currentBlockWeek,
  missedCatchUp,
  muscleLabel,
  todayPlan,
  type ConceptRoutine,
  type MissedPlan,
} from "@app/core";
import { useQueryData, useQueryDataStatus } from "@app/core/db/hooks";
import { type HomePrimary, pickHomePrimary } from "@app/core/domain/homePrimary";
import { useUser } from "@app/core/state/userContext";
import { useCallback, useEffect, useMemo, useState } from "react";
import { lang, t, tw } from "@/lib/i18n";
import { useSession } from "../SessionProvider";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { ActionSheet, ConfirmDialog, SheetShell } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { AppText, Card, EmptyState } from "../ui/primitives";
import { ScheduleEditor } from "./ScheduleEditor";
import { CreatorTopicSheet } from "./CreatorRoutineSheet"; // 크리에이터 루틴 @plm SRS-091
import { AppBar, AppBarAction } from "../ui/AppBar";
// [원본] import { MoreMenu } from "../ui/MoreMenu"; — 진행 카드의 ⋯ 메뉴(화면 정리 D8 로 렌더 중단)
import { ListGroup, ListRow, SectionLabel } from "../ui/rows";
import { RecentWorkouts, WeekSummary } from "./WeekSummary";
import { RoutineMuscleFocus, RoutineMuscleMini } from "./RoutineMuscleMini"; // 오늘·추천 카드 근육 그림 @plm SRS-075

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
  // [원본] activeName 도 꺼냈다 — 진행 카드 제목(화면 정리 D8 로 렌더 중단)
  // [원본] const { activeWorkoutId, setActive, refreshActive } = useSession(); — refreshActive 는 아래 고아 확인창에서만 썼다
  // activeLoaded — 진행 중인 운동을 읽기 전의 null 은 「없음」이 아니라 「모름」(화면 정리 M-2 /qa H-2) @plm SRS-072
  const { activeWorkoutId, setActive, activeLoaded } = useSession();
  const toast = useToast();

  const [repos, setRepos] = useState<{
    routine: RoutineRepo;
    workout: WorkoutRepo;
    analytics: AnalyticsRepo;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // [원본] const [reco, setReco] = useState<Reco | null>(null); — 다시 읽는 동안 지난 값(운동 전·어제)이 그대로 쓰였다(/qa M-2 H-2·L-3)
  // [개선] 추천에 「무엇을 보고 계산했나」 열쇠를 붙여 둔다 — 열쇠가 지금과 다르면 지난 값이라 쓰지 않는다 @plm SRS-072
  const [recoEntry, setRecoEntry] = useState<{ key: string; value: Reco } | null>(null);
  // 오늘(로컬 달력일) — 홈을 띄워 둔 채 자정을 넘기면 추천의 「오늘 운동함」이 어제 값으로 남는다(/qa L-3)
  const [todayNum, setTodayNum] = useState(() => localDayNum(Date.now()));
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [concept, setConcept] = useState<ConceptRoutine | null>(null);
  const [creatorTopic, setCreatorTopic] = useState<CreatorTopic | null>(null); // @plm SRS-091
  const creatorTopics = useMemo(() => visibleCreatorTopics(), []);
  const [actionsFor, setActionsFor] = useState<Routine | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Routine | null>(null);
  // [원본] const [confirmDiscard, setConfirmDiscard] = useState(false); — 진행 카드 ⋯(D8 로 제거)만 열던 상태(P3 QA L1)
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

  // [원본] const models = useQueryData(() => (repos ? repos.routine.queryRoutines() : null), [repos]);
  // [개선] 첫 결과가 왔는지도 함께 — 읽기 전 []를 「루틴 0개」로 보면 빠른 시작이 잠깐 빨강이 된다(/qa M-2 H-1) @plm SRS-072
  const { data: models, loaded: routinesLoaded } = useQueryDataStatus(
    () => (repos ? repos.routine.queryRoutines() : null),
    [repos],
  );
  const routines: Routine[] = useMemo(() => models.map((m) => m as unknown as Routine), [models]);

  // 추천은 완료 이력을 훑어야 나온다 — 목록·진행 상태가 바뀔 때만 다시 읽는다.
  const analytics = repos?.analytics ?? null;
  const routineCount = routines.length;
  // 루틴이 늘거나 운동을 시작·끝내거나 날이 바뀌면 추천이 달라진다 — 그 셋을 열쇠로 묶어 다시 읽는 계기로 쓴다.
  // 추천이 무엇을 보고 계산됐나 — 루틴 수·진행 중 운동·오늘. 셋 중 하나라도 바뀌면 지난 추천은 쓰지 않는다.
  const recoKey = `${routineCount}|${activeWorkoutId ?? ""}|${todayNum}`;
  const reco: Reco | null = recoEntry && recoEntry.key === recoKey ? recoEntry.value : null;

  // 자정을 넘겨 돌아오면 오늘을 다시 잡는다(→ 열쇠가 바뀌어 추천을 다시 읽는다)
  useEffect(() => {
    const sync = () => setTodayNum(localDayNum(Date.now()));
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  useEffect(() => {
    if (!analytics) return;
    let cancelled = false;
    const key = recoKey;
    void analytics
      .getTodayRoutineRecommendation()
      .then((r) => !cancelled && setRecoEntry({ key, value: r }))
      // [원본] .catch(() => !cancelled && setReco(null)); — 실패하면 판단을 영원히 못 해 주 행동이 사라졌다(/qa M-5)
      // [개선] 실패는 「추천 없음」으로 — 스케줄·첫 루틴 규칙으로라도 주 행동을 정한다 @plm SRS-072
      .catch(
        () =>
          !cancelled &&
          setRecoEntry({
            key,
            value: {
              status: "insufficient",
              alreadyWorkedOutToday: false,
              weekdayHabit: null,
              lastRoutineId: null,
            },
          }),
      );
    void analytics
      .getCompletedDayNumsSince(8)
      .then((d) => !cancelled && setDoneDayNums(d))
      .catch(() => !cancelled && setDoneDayNums(new Set()));
    return () => {
      cancelled = true;
    };
  }, [analytics, recoKey]);

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

  // ── 주 행동 하나(화면 정리 M-2 확정 A) ── 빨강 채움은 화면에 하나다. 무엇을 빨강으로 할지는 core 가 고른다.
  // 추천(오늘 운동 여부·최근 루틴)을 읽기 전에는 판단하지 않는다 — 빠른 시작이 빨강이었다가 루틴으로 옮겨 가는 깜빡임을 막는다.
  // @plm SRS-072
  // [원본] const homeReady = !!repos && (routines.length === 0 || reco !== null);
  //   — 루틴 목록·진행 중 운동을 읽기 전 상태와 지난 추천으로도 판단해 빨강이 옮겨 다녔다(/qa M-2 H-1·H-2)
  // [개선] 루틴 목록·진행 중 운동을 다 읽었고, (운동 중이거나 루틴이 0개이거나) 지금 열쇠의 추천이 왔을 때만 판단한다
  const homeReady =
    !!repos &&
    routinesLoaded &&
    activeLoaded &&
    (!!activeWorkoutId || routines.length === 0 || reco !== null);
  const primary: HomePrimary | null = homeReady
    ? pickHomePrimary({
        active: !!activeWorkoutId,
        // [원본] routineIds: [...loose, ...folderGroups.flatMap(([, members]) => members)].map((r) => r.id),
        // [개선] 화면 순서 그대로 — 폴더 묶음이 위, 낱개가 아래(/qa L-1)
        routineIds: [...folderGroups.flatMap(([, members]) => members), ...loose].map((r) => r.id),
        plan:
          plan.kind === "routine" && plan.routineId
            ? { kind: "routine", routineId: plan.routineId }
            : plan.kind === "rest"
              ? { kind: "rest" }
              : { kind: "none" },
        workedOutToday: !!reco?.alreadyWorkedOutToday,
        recoRoutineId: reco?.status === "ok" ? (reco.routineId ?? null) : null,
        recentRoutineId: reco?.lastRoutineId ?? null,
      })
    : null;
  const primaryRoutineId = primary?.kind === "routine" ? primary.routineId : null;
  // 오늘 카드·추천 카드가 이미 그 루틴을 보여 주면 거기 「시작」이 주 행동이다. 아니면 「다음 운동」 카드를 하나 띄운다.
  // [원본] const todayCardShows = !activeWorkoutId && !!weeklySchedule;
  // [개선] 미배정일에 「다음 운동」을 권하면서 「오늘은 배정된 루틴이 없어요」를 함께 띄우지 않는다(/qa L-2)
  const todayCardShows =
    !activeWorkoutId && !!weeklySchedule && !(plan.kind === "none" && primary?.kind === "routine");
  // [원본] const recoCardShows = !activeWorkoutId && !weeklySchedule && !!reco && !reco.alreadyWorkedOutToday;
  // [개선] 화면 목록에 없는 루틴(보관 등)을 권하지 않는다(/qa M-4) · 루틴 0개면 「추천 불가 안내」는 소음(/qa L-5)
  const recoCardShows =
    !activeWorkoutId &&
    !weeklySchedule &&
    routines.length > 0 &&
    !!reco &&
    !reco.alreadyWorkedOutToday &&
    (reco.status !== "ok" || routines.some((r) => r.id === reco.routineId));
  const primaryInToday = primary?.kind === "routine" && primary.source === "schedule" && todayCardShows;
  const primaryInReco = primary?.kind === "routine" && primary.source === "reco" && recoCardShows;
  const primaryRoutine =
    primaryRoutineId && !primaryInToday && !primaryInReco
      ? (routines.find((r) => r.id === primaryRoutineId) ?? null)
      : null;
  const assignedCount = weeklySchedule?.days.filter((d) => d !== null && d !== "rest").length ?? 0;

  /** 오늘의 안내 한 덩어리 — 오늘 카드 / 추천 카드 / (주 행동이 그 둘에 없을 때) 다음 운동 카드. */
  const todayGuide = () => (
    <>
      {primaryRoutine ? (
        <NextCard
          routine={primaryRoutine}
          source={primary?.kind === "routine" ? primary.source : "first"}
          muscle={
            reco?.status === "ok" && reco.routineId === primaryRoutine.id ? (reco.muscle ?? null) : null
          }
          busy={busy}
          onStart={() => guardActive(startFromRoutine(primaryRoutine.id))}
        />
      ) : null}
      {todayCardShows ? (
        <TodayCard
          plan={plan}
          routines={routines}
          dotColor={dotColor}
          onStart={(id) => guardActive(startFromRoutine(id))}
          busy={busy}
          primary={primaryInToday}
        />
      ) : recoCardShows && reco && !(primaryRoutine && reco.status !== "ok") ? (
        // 「다음 운동」 카드가 이미 할 일을 보여 주면 「추천 불가 안내」는 소음 — 그때는 숨긴다(M-2)
        <RecoCard
          reco={reco}
          onStart={(id) => guardActive(startFromRoutine(id))}
          busy={busy}
          primary={primaryInReco}
        />
      ) : null}
    </>
  );

  return (
    <div className="flex flex-1 flex-col">
      {/* ── 앱바: 운동 홈만 로고(SRS-054 앱바 2형) ── */}
      <AppBar
        logo
        title={t("routines.title")}
        actions=<AppBarAction
          icon="search-outline"
          label={t("nav.exerciseList")}
          href="/exercises"
          testId="home-exercises"
        />
      />
      <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
        {/* ── 진행 중인 운동 ── [원본] 분홍 진행 카드 — 아래 진행 막대(열기·취소)와 같은 사실을 두 번 알렸다(화면 정리 D8).
            원복 시 아래 주석을 푼다. 진행 중 표시는 이제 셸의 하단 막대(GlobalWorkoutBar) 하나다. @plm SRS-071
        {activeWorkoutId ? (
          <div
            className="mb-[var(--spacing-lg)] flex items-center gap-[var(--spacing-md)] rounded-[var(--radius-md)] border border-(--color-brand) bg-(--color-brand-muted) py-[var(--spacing-md)] pr-[var(--spacing-xs)] pl-[var(--spacing-lg)]"
            data-testid="resume-card"
          >
            <a href="/workout" data-testid="btn-resume" className="min-w-0 flex-1">
              <AppText variant="heading" className="block truncate">
                {activeName || t("routines.activeWorkout")}
              </AppText>
              <AppText variant="caption" color="textMuted" className="mt-[2px] block">
                {t("routines.resumePrompt")}
              </AppText>
            </a>
            <MoreMenu
              testId="btn-active-menu"
              options={[
                {
                  label: t("routines.discardWorkoutButton"),
                  destructive: true,
                  testId: "btn-discard-active",
                  onPress: () => setConfirmDiscard(true),
                },
              ]}
            />
          </div>
        ) : null} */}

        {/* ── 이번 주 — 목표·연속일·볼륨 한 장(시안 01 · 결정 D3) ── */}
        <WeekSummary />

        {/* 주 행동 계산이 끝났다는 표식(e2e 가 깜빡임 도중을 재지 않게) */}
        {homeReady ? <span hidden data-testid="home-ready" /> : null}

        {/* ── 오늘 할 루틴이 주 행동이면 그 카드가 빠른 시작보다 위(주 행동이 먼저 보인다 · M-2) ── */}
        {primary?.kind === "routine" ? todayGuide() : null}
        {/* 판단 전 — 루틴이 있으면 그 카드 자리를 미리 잡아 둔다(빠른 시작이 밀려 내려가 오탭되지 않게 · /qa M-2 M-2) */}
        {!homeReady && routinesLoaded && routines.length > 0 ? <NextCardSkeleton /> : null}

        {/* ── 빈 운동 시작 ── */}
        <div className="mb-[var(--spacing-md)]">
          {/* [원본] 진행 중이 아니면 늘 빨강 — 루틴이 있는 사람의 주 동선(루틴으로 시작)과 위계가 거꾸로였다(P4 /qa M-2)
          variant={activeWorkoutId ? "secondary" : "primary"} */}
          {/* [개선] 주 행동이 「빠른 운동」일 때만 빨강 — 루틴 없음·오늘 이미 운동·휴식일(pickHomePrimary) @plm SRS-072 */}
          <Button
            title={t("routines.quickStart")}
            icon="play"
            variant={primary?.kind === "quick" ? "primary" : "secondary"}
            loading={busy}
            // 판단 전에는 누를 수 없다 — 아래로 밀려 다른 카드의 「시작」이 눌리는 오탭을 막는다(/qa M-2 M-2)
            disabled={!homeReady}
            testId="btn-quick-start"
            onPress={() => guardActive(startBlank)}
          />
        </div>

        {/* ── 오늘의 안내 ── */}
        {primary?.kind === "routine" ? null : todayGuide()}

        {/* 놓친 루틴 — 오늘 예정과 같으면 카드 한 장으로 충분하다. */}
        {/* [개선] 오늘 할 루틴(주 행동)과 같은 루틴이면 카드 한 장이면 된다(/qa M-2 M-3) */}
        {catchUp &&
        !reco?.alreadyWorkedOutToday &&
        catchUp.routineId !== primaryRoutineId &&
        !(plan.kind === "routine" && plan.routineId === catchUp.routineId) ? (
          <CatchUpCard
            catchUp={catchUp}
            name={routines.find((r) => r.id === catchUp.routineId)?.name ?? null}
            busy={busy}
            onStart={() => guardActive(startFromRoutine(catchUp.routineId))}
          />
        ) : null}

        {/* ── 내 루틴 — 줄마다 바로 시작(시안 01) ── */}
        <SectionLabel
          className="mt-[var(--spacing-xl)]"
          title={t("routines.myRoutines")}
          right={
            <a
              href="/routines/new"
              data-testid="btn-new-routine"
              className="font-semibold text-(--color-brand)"
            >
              + {t("routines.newRoutine")}
            </a>
          }
        />

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
            todayId={primaryRoutineId}
          />
        ))}

        {routines.length === 0 ? (
          <EmptyState
            icon="clipboard-outline"
            title={t("routines.listEmptyTitle")}
            message={t("routines.listEmptyMessage")}
            // [원본] action={<a href="/routines/new"><Button title={t("routines.createRoutine")} icon="add" fullWidth={false} /></a>}
            // [개선] 빈 상태는 안내만 — 같은 행동이 머리 「+ 새 루틴」에 있고, 빨강 채움이 「빠른 운동 시작」과 겹쳤다(P3 QA M2) @plm SRS-071
          />
        ) : (
          <ListGroup testId="routine-list">
            {loose.map((r) => (
              <RoutineRow
                key={r.id}
                routine={r}
                repo={repos?.routine ?? null}
                busy={busy}
                today={r.id === primaryRoutineId}
                onStart={() => guardActive(startFromRoutine(r.id))}
                onActions={() => setActionsFor(r)}
              />
            ))}
          </ListGroup>
        )}

        <RecentWorkouts />

        {/* ── 더 해 보기 — 자주 쓰지 않는 진입은 아래로 모은다 ── */}
        <SectionLabel className="mt-[var(--spacing-xl)]" title="더 해 보기" />
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
                  <AppText
                    variant="label"
                    color={block.isDeload ? "warning" : "primary"}
                    className="font-bold"
                  >
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

        <ListGroup className="mb-[var(--spacing-md)]">
          <ListRow href="/program" testId="btn-program" icon="sparkles" title={t("program.title")} />
          <ListRow href="/gyms" testId="btn-gyms" icon="location" title={t("gyms.entry")} />
        </ListGroup>
        {/* [원본] 옛 AI 콘셉트 루틴 4개 그리드 — 사용자 결정(2026-10-28)으로 크리에이터 루틴으로 교체. 원복 시 아래 주석을 풀고 새 섹션을 주석 처리
        // {/ * ── 콘셉트 루틴 ── * /}
        // <div className="mb-[var(--spacing-sm)]">
        //   <AppText variant="label" color="textMuted" className="mb-[4px] block">
        //     {t("concept.sectionTitle")}
        //   </AppText>
        //   <div className="grid grid-cols-2 gap-[var(--spacing-sm)]">
        //     {CONCEPT_ROUTINES.map((c) => (
        //       <button
        //         key={c.id}
        //         type="button"
        //         data-testid={`concept-${c.id}`}
        //         onClick={() => setConcept(c)}
        //         // min-w-0 이 없으면 긴 이름이 카드를 밀어 화면 전체가 가로로 넘친다(flex 기본값 함정).
        //         className="flex min-w-0 flex-1 flex-col gap-[2px] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface) p-[var(--spacing-md)] text-left"
        //       >
        //         <AppText variant="body" className="block truncate font-bold">
        //           {lang === "ko" ? c.nameKo : c.nameEn}
        //         </AppText>
        //         <AppText variant="label" color="textMuted">
        //           {t("concept.dayCount", { count: c.days.length })}
        //         </AppText>
        //       </button>
        //     ))}
        //   </div>
        // </div>
        */}
        {/* [개선] 콘셉트 루틴 = 크리에이터 루틴 주제(버전 0개 주제는 숨김) @plm SRS-091 */}
        {creatorTopics.length ? (
          <div className="mb-[var(--spacing-sm)]">
            <AppText variant="label" color="textMuted" className="mb-[4px] block">
              {t("concept.sectionTitle")}
            </AppText>
            <div className="grid grid-cols-2 gap-[var(--spacing-sm)]">
              {creatorTopics.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`concept-topic-${c.id}`}
                  onClick={() => setCreatorTopic(c)}
                  // min-w-0 이 없으면 긴 이름이 카드를 밀어 화면 전체가 가로로 넘친다(flex 기본값 함정).
                  className="flex min-w-0 flex-1 flex-col gap-[2px] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface) p-[var(--spacing-md)] text-left"
                >
                  <AppText variant="body" className="block truncate font-bold">
                    {lang === "ko" ? c.nameKo : c.nameEn}
                  </AppText>
                  <AppText variant="label" color="textMuted">
                    {t("creator.topicCount", { count: creatorRoutinesFor(c.id).length })}
                  </AppText>
                </button>
              ))}
            </div>
          </div>
        ) : null}

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

        {creatorTopic ? (
          <CreatorTopicSheet
            topic={creatorTopic}
            existingNames={routines.map((r) => r.name)}
            onClose={() => setCreatorTopic(null)}
            onSaved={(made, total) => {
              setCreatorTopic(null);
              toast(
                made < total
                  ? t("creator.savedPartial", { count: made, total })
                  : t("creator.savedMessage", { count: made }),
              );
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
                  navigate(`/routines/${actionsFor.id}`);
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

        {/* [원본] 진행 중 운동 폐기 확인창 — 열어 주던 진행 카드 ⋯ 가 D8 로 빠져 도달할 수 없었다(P3 QA L1). 취소는 하단 막대가 맡는다.
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
        */}

        {activeExists ? (
          <ActionSheet
            testId="active-exists"
            title={t("routines.activeExistsTitle")}
            onClose={() => setActiveExists(null)}
            options={[
              {
                label: t("routines.resumeInstead"),
                onPress: () => {
                  navigate("/workout");
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
  primary = false,
}: {
  plan: { kind: string; routineId?: string | null };
  routines: Routine[];
  dotColor: (id: string) => string;
  onStart: (routineId: string) => void;
  busy: boolean;
  /** 이 카드의 「시작」이 화면의 주 행동인가(M-2) — 빨강 채움은 화면에 하나. */
  primary?: boolean;
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
            <RoutineMuscleFocus routineId={routine.id} />
          </div>
          {/* 오른쪽 열 = 「시작」 + 그 아래 근육 그림(이름 칸 폭을 지킨다 · P2 /qa P2-2) @plm SRS-075 */}
          <div className="flex shrink-0 flex-col items-center">
            {/* 화면 정리 P4 /qa M-1 — 루틴 「시작」은 회색 상자. 단 오늘 할 루틴이 주 행동이면 빨강(M-2) @plm SRS-072 */}
            <Button
              title={t("routines.start")}
              icon="play"
              size="sm"
              variant={primary ? "primary" : "secondary"}
              fullWidth={false}
              disabled={busy}
              testId="btn-start-today"
              onPress={() => onStart(routine.id)}
            />
            <RoutineMuscleMini routineId={routine.id} />
          </div>
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

/**
 * 다음 운동 — 오늘 할 루틴이 오늘 카드·추천 카드에 없을 때(최근 수행·첫 루틴, 또는 스케줄 미배정일의 추천) 그 루틴을 한 장으로.
 * 「시작」이 화면의 주 행동(빨강 채움)이다(화면 정리 M-2 확정 A). @plm SRS-072
 */
function NextCard({
  routine,
  source,
  muscle,
  busy,
  onStart,
}: {
  routine: Routine;
  source: "schedule" | "reco" | "recent" | "first";
  /** 추천 근거 부위(추천일 때만). */
  muscle: string | null;
  busy: boolean;
  onStart: () => void;
}) {
  // [원본] 최근·첫 루틴 머리말이 「최근에 한 루틴」·「내 루틴」 — 아래 구역 제목 「내 루틴」과 겹치고 왜 위에 있는지 말하지 않았다(/qa M-2 M-1)
  // [개선] 머리말은 근거별(스케줄 「오늘 할 운동」·추천 「추천 루틴」·최근/첫 「다음 운동」) + 근거 한 줄 @plm SRS-072
  const label =
    source === "schedule"
      ? t("schedule.todayLabel")
      : source === "reco"
        ? t("routines.todayRecoLabel")
        : t("routines.nextLabel");
  const reason =
    source === "schedule"
      ? t("schedule.todayHint")
      : source === "reco"
        ? muscle
          ? t("routines.todayRecoHint", {
              muscle: muscleLabel(muscle as Parameters<typeof muscleLabel>[0], lang),
            })
          : null
        : source === "recent"
          ? t("routines.nextReasonRecent")
          : t("routines.nextReasonFirst");
  return (
    <Card className="mb-[var(--spacing-sm)]">
      <div className="flex items-center" data-testid="next-card">
        <div className="mr-[var(--spacing-md)] min-w-0 flex-1">
          <AppText variant="label" color="textMuted">
            {label}
          </AppText>
          <AppText variant="heading" className="mt-[2px] block truncate">
            {routine.name}
          </AppText>
          {reason ? (
            <AppText variant="caption" color="textMuted" className="mt-[2px] block" data-testid="next-reason">
              {reason}
            </AppText>
          ) : null}
        </div>
        <Button
          title={t("routines.start")}
          icon="play"
          size="sm"
          variant="primary"
          fullWidth={false}
          disabled={busy}
          testId="btn-start-next"
          onPress={onStart}
        />
      </div>
    </Card>
  );
}

/** 주 행동을 정하기 전 「다음 운동」 카드 자리 — 같은 높이로 비워 둔다(빠른 시작이 밀려 내려가지 않게 · /qa M-2 M-2). */
function NextCardSkeleton() {
  return (
    <Card className="mb-[var(--spacing-sm)]" aria-hidden>
      <div className="flex items-center" data-testid="next-card-skeleton">
        <div className="mr-[var(--spacing-md)] min-w-0 flex-1">
          <div className="h-[14px] w-[64px] rounded-[4px] bg-(--color-surface-alt)" />
          <div className="mt-[6px] h-[20px] w-[60%] rounded-[4px] bg-(--color-surface-alt)" />
          <div className="mt-[6px] h-[14px] w-[45%] rounded-[4px] bg-(--color-surface-alt)" />
        </div>
        <div className="h-[36px] w-[72px] rounded-[var(--radius-md)] bg-(--color-surface-alt)" />
      </div>
    </Card>
  );
}

/** 목록에서 오늘 할 루틴 표시 — 위 카드와 같은 루틴임을 알린다(무채 · 빨강 아님 · /qa M-2 M-1). */
function TodayChip() {
  return (
    <span
      data-testid="today-chip"
      className="ml-[6px] shrink-0 rounded-[var(--radius-pill)] bg-(--color-surface-alt) px-[8px] py-[1px] text-[length:var(--text-xs)] font-semibold text-(--color-ink2)"
    >
      {t("routines.todayChip")}
    </span>
  );
}

/** 스케줄이 없을 때의 안내 — 꾸준히 하면 도메인이 다음 부위를 골라 준다. */
function RecoCard({
  reco,
  onStart,
  busy,
  primary = false,
}: {
  reco: Reco;
  onStart: (routineId: string) => void;
  busy: boolean;
  /** 이 카드의 「시작」이 화면의 주 행동인가(M-2). */
  primary?: boolean;
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
          <RoutineMuscleFocus routineId={reco.routineId} />
        </div>
        {/* 오른쪽 열 = 「시작」 + 그 아래 근육 그림(P2 /qa P2-2) @plm SRS-075 */}
        <div className="flex shrink-0 flex-col items-center">
          {/* 화면 정리 P4 /qa M-1 · M-2(주 행동이면 빨강) @plm SRS-072 */}
          <Button
            title={t("routines.start")}
            icon="play"
            size="sm"
            variant={primary ? "primary" : "secondary"}
            fullWidth={false}
            disabled={busy}
            testId="btn-start-reco"
            onPress={() => reco.routineId && onStart(reco.routineId)}
          />
          <RoutineMuscleMini routineId={reco.routineId} />
        </div>
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
  todayId = null,
}: {
  name: string;
  members: Routine[];
  open: boolean;
  repo: RoutineRepo | null;
  busy: boolean;
  onToggle: () => void;
  onStart: (routineId: string) => void;
  onActions: (r: Routine) => void;
  /** 오늘 할 루틴 id — 그 줄에 「오늘」 칩. */
  todayId?: string | null;
}) {
  return (
    <Card className="mb-[var(--spacing-md)]">
      <button
        type="button"
        onClick={onToggle}
        data-testid="folder-toggle"
        className="flex w-full items-center gap-[var(--spacing-sm)]"
      >
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
                <span className="flex min-w-0 items-center">
                  <AppText variant="body" className="block truncate font-bold">
                    {r.name}
                  </AppText>
                  {r.id === todayId ? <TodayChip /> : null}
                </span>
                <ExerciseCount repo={repo} routineId={r.id} />
              </span>
              {/* 화면 정리 P4 /qa M-1 — 폴더 밖 루틴 줄과 같은 회색 상자 @plm SRS-072 */}
              <Button
                title={t("routines.start")}
                size="sm"
                variant="secondary"
                icon="play"
                fullWidth={false}
                disabled={busy}
                testId="btn-start-folder-routine"
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
  today = false,
  onStart,
  onActions,
}: {
  routine: Routine;
  repo: RoutineRepo | null;
  busy: boolean;
  /** 오늘 할 루틴(위 카드와 같은 루틴)이면 「오늘」 칩. */
  today?: boolean;
  onStart: () => void;
  onActions: () => void;
}) {
  return (
    <div className="px-[var(--spacing-lg)] py-[var(--spacing-md)]">
      <div className="flex items-center justify-between" data-testid={`routine-${routine.id}`}>
        <div className="mr-[var(--spacing-md)] min-w-0 flex-1">
          <span className="flex min-w-0 items-center">
            <AppText variant="heading" className="block truncate">
              {routine.name}
            </AppText>
            {today ? <TodayChip /> : null}
          </span>
          <ExerciseCount repo={repo} routineId={routine.id} />
        </div>
        <div className="flex items-center gap-[var(--spacing-xs)]">
          {/* [원본] 루틴마다 빨강 채움 「시작」 — 위 「빠른 운동 시작」과 주 행동이 둘(셋, 넷…)이 됐다(화면 정리 P4)
          <Button title={t("routines.start")} size="sm" fullWidth={false} disabled={busy} testId="btn-start-routine" onPress={onStart} /> */}
          {/* [개선] 회색 상자 버튼 — 빨강 채움은 화면에 하나(빠른 운동 시작) @plm SRS-072 */}
          <Button
            title={t("routines.start")}
            size="sm"
            variant="secondary"
            icon="play"
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
    </div>
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
      // [원본] 콘셉트 루틴이 nameKo 로 종목을 가리키던 때 — P2 에서 seed id 로 옮겼다(ADR-033)
      // const names = [...new Set(concept.days.flatMap((d) => d.exercises))];
      // const idByName = await exerciseRepo.getExerciseIdsByNames(names);
      const have = await exerciseRepo.getActiveExerciseIds([
        ...new Set(concept.days.flatMap((d) => d.exercises)),
      ]);

      let made = 0;
      for (const d of concept.days) {
        // 기기에 없는 종목은 조용히 뺀다 — 하나 없다고 Day 전체를 못 만들 이유가 없다.
        const items = d.exercises.filter((id) => have.has(id)).map((exerciseId) => ({ exerciseId }));
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
        {/* 빨강 채움은 화면에 하나(주 행동은 pickHomePrimary 가 고른다) — 놓친 루틴은 보조 @plm SRS-072 */}
        <Button
          title={t("schedule.startThis")}
          size="sm"
          variant="secondary"
          fullWidth={false}
          disabled={busy}
          onPress={onStart}
          testId="btn-catchup-start"
        />
      </div>
    </Card>
  );
}

/** 로컬 달력일 일련번호(streak.dayNumber 와 같은 관례) — 추천 열쇠의 「오늘」. */
function localDayNum(ms: number): number {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}
