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
//   시작 버튼      새 루틴 · 빠른 운동 시작
//   내 루틴        폴더 그룹 + 낱개 루틴 + 빈 상태
//   프로 루틴      주제 → 버전 → 내 루틴에 저장
//   초보자 루틴    프로 루틴과 같은 흐름 · 구역만 따로
//   최근 운동      맨 아래
//
// ── 판단은 전부 도메인·저장소가 한다 ────────────────────────────────────────
// 오늘 무엇을 할지(todayPlan) · 무엇을 놓쳤는지(missedCatchUp) · 무엇을 추천할지
// (getTodayRoutineRecommendation) · 콘셉트 루틴의 내용(CONCEPT_ROUTINES) — 전부 core다.
// 여기서 다시 계산하면 app과 갈라진다(ADR-032).
// ─────────────────────────────────────────────────────────────────────────────
import { errorText } from "@/lib/errorText";
import { navigate } from "@/lib/nav";
import {
  type CreatorTopic,
  creatorRoutinesFor,
  // [원본] visibleCreatorTopics,
  visibleCreatorSections,
  currentBlockWeek,
  missedCatchUp,
  muscleLabel,
  todayPlan,
  type MissedPlan,
  type TipTopic,
  tipsFor,
  visibleTipTopics,
} from "@app/core";
import { useQueryDataStatus } from "@app/core/db/hooks";
import { type HomePrimary, pickHomePrimary } from "@app/core/domain/homePrimary";
import { useUser } from "@app/core/state/userContext";
import { useCallback, useEffect, useMemo, useState } from "react";
import { lang, t, tw } from "@/lib/i18n";
import { useSession } from "../SessionProvider";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { ActionSheet, ConfirmDialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { AppText, Card, EmptyState } from "../ui/primitives";
import { ScheduleEditor } from "./ScheduleEditor";
import { CreatorTopicSheet } from "./CreatorRoutineSheet"; // 크리에이터 루틴 @plm SRS-091
import { CreatorTipTopicSheet } from "./CreatorTipSheet"; // 운동 팁(SPEC-047)
import { AppBar, AppBarAction } from "../ui/AppBar";
import { GuideButton } from "../guide/GuideButton"; // 탭 사용법 ?(SPEC-058)
import { ListGroup, SectionLabel } from "../ui/rows";
import { AdSlot } from "../ads/AdSlot";
import { RecentWorkouts, WeekSummary } from "./WeekSummary";
import { RoutineMuscleFocus, RoutineMuscleMini } from "./RoutineMuscleMini"; // 오늘·추천 카드 근육 그림 @plm SRS-075

type RoutineRepo = typeof import("@app/core/data/routineRepository");
import { trackUsage } from "@/lib/usage";
// [원본] import { ExerciseLine, RoutinePreviewSheet } from "./RoutinePreviewSheet"; // 루틴 한눈에(SPEC-045)
import { ExerciseLineWithOrigin, RoutinePreviewSheet } from "./RoutinePreviewSheet"; // 루틴 한눈에(SPEC-045) · 출처 칩(SPEC-050 P3a)
import { isFromCoach, originStripeStyle, RoutineOriginChip } from "./RoutineOrigin"; // 루틴 출처(SPEC-050 P3a)
import { HomeMembersCard } from "../coaching/HomeMembersCard"; // 홈 「담당 회원 N명」(SPEC-050 P2)
type WorkoutRepo = typeof import("@app/core/data/workoutRepository");
type AnalyticsRepo = typeof import("@app/core/data/analyticsRepository");

// [원본] type Routine = { id: string; name: string; folder: string | null };
// [개선] 출처 칸(로컬 스키마 v30 · SPEC-050 P3a) — 코치 루틴 띠·칩·잠금
type Routine = {
  id: string;
  name: string;
  folder: string | null;
  origin: string | null;
  coachName: string | null;
};
/** 목록이 따라가는 칸 — 동기로 코칭이 끝나(coach → coach_ended) 칩이 바뀌거나 이름이 바뀌어도 다시 그린다(SPEC-050 P3a) */
const ROUTINE_LIST_COLUMNS = ["name", "folder", "sort_order", "origin", "coach_name"];
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
  // loading — 사용자 레코드(스케줄)를 읽기 전의 null 을 「스케줄 없음」으로 보지 않으려고(qa M-1)
  const { user, weeklySchedule, loading: userLoading } = useUser();
  // [원본] activeName 도 꺼냈다 — 진행 카드 제목(화면 정리 D8 로 렌더 중단)
  // activeLoaded — 진행 중인 운동을 읽기 전의 null 은 「없음」이 아니라 「모름」(화면 정리 M-2 /qa H-2) @plm SRS-072
  const { activeWorkoutId, setActive, activeLoaded } = useSession();
  const toast = useToast();
  // [원본] 가져오기에서 여러 날을 저장하고 왔으면 한 번 알린다(SPEC-054) — 2026-11-10 앱에서 뗌(ADR-064 보류)
  // useEffect(() => {
  //   void import("@/lib/importDraft").then((m) => {
  //     const n = m.takeImportToast();
  //     if (n) toast(t("routineImport.saved", { count: n }));
  //   });
  // }, [toast]);
  // [개선] 알림 없음 — 가져오기 화면이 없다(ADR-064)

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
  const [creatorTopic, setCreatorTopic] = useState<CreatorTopic | null>(null); // @plm SRS-091
  // [원본] const creatorTopics = useMemo(() => visibleCreatorTopics(), []);
  // [개선] 초보자 주제를 프로 루틴과 따로 묶는다(사용자 지시 2026-11-06)
  const creatorSections = useMemo(() => visibleCreatorSections(), []);
  // 운동 팁 — 루틴 구역 다음(SPEC-047 · SRS-112). 팁 0개 주제는 숨긴다
  const tipTopics = useMemo(() => visibleTipTopics(), []);
  const [tipTopic, setTipTopic] = useState<TipTopic | null>(null);
  const [actionsFor, setActionsFor] = useState<Routine | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Routine | null>(null);
  const [activeExists, setActiveExists] = useState<null | (() => Promise<void>)>(null);
  const [editingSchedule, setEditingSchedule] = useState(false);
  /** 최근 8일 중 운동을 마친 날. 캐치업 판정이 이걸 본다. */
  const [doneDayNums, setDoneDayNums] = useState<Set<number>>(() => new Set());
  // 완료일을 읽었나 — 읽기 전 빈 집합으로는 「놓친 루틴」이 떴다가 사라진다(버튼 위 카드라 버튼이 밀린다 · SRS-093).
  // 추천과 같은 열쇠로 — 자정·운동 시작으로 열쇠가 바뀌면 지난 완료일로 판단하지 않는다(qa L-2)
  const [doneKey, setDoneKey] = useState<string | null>(null);

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
    ROUTINE_LIST_COLUMNS,
  );
  const routines: Routine[] = useMemo(() => models.map((m) => m as unknown as Routine), [models]);

  // SPEC-034 내 루틴 종목의 운동 영상을 미리 받아 고정한다 — 운동 중에는 받지 않는다(체육관 망·데이터 절약).
  useEffect(() => {
    if (!routinesLoaded || !activeLoaded || activeWorkoutId) return;
    let cancelled = false;
    const stop = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        const [{ EXERCISE_MOTION }, { pinMotionClips }] = await Promise.all([
          import("@app/core/data/exerciseMotion.data"),
          import("@/lib/motionCache"),
        ]);
        const ids = new Set<string>();
        for (const m of models as unknown as {
          routineExercises: { fetch(): Promise<{ exerciseId: string }[]> };
        }[]) {
          for (const re of await m.routineExercises.fetch()) ids.add(re.exerciseId);
        }
        if (cancelled) return;
        const clips = [...ids].map((id) => EXERCISE_MOTION[id]).filter((c): c is string => !!c);
        await pinMotionClips([...new Set(clips)], stop.signal);
      })().catch(() => {
        /* 미리 받기는 덤이다 — 실패해도 화면에 영향 없음 */
      });
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stop.abort(); // 운동을 시작하거나 화면을 떠나면 받기를 멈춘다
    };
  }, [routinesLoaded, activeLoaded, models, activeWorkoutId]);

  // 추천은 완료 이력을 훑어야 나온다 — 목록·진행 상태가 바뀔 때만 다시 읽는다.
  const analytics = repos?.analytics ?? null;
  const routineCount = routines.length;
  // 루틴이 늘거나 운동을 시작·끝내거나 날이 바뀌면 추천이 달라진다 — 그 셋을 열쇠로 묶어 다시 읽는 계기로 쓴다.
  // 추천이 무엇을 보고 계산됐나 — 루틴 수·진행 중 운동·오늘. 셋 중 하나라도 바뀌면 지난 추천은 쓰지 않는다.
  const recoKey = `${routineCount}|${activeWorkoutId ?? ""}|${todayNum}`;
  const doneLoaded = doneKey === recoKey;
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
      .catch(() => !cancelled && setDoneDayNums(new Set()))
      .finally(() => !cancelled && setDoneKey(key));
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
        toast(errorText(e), "error");
      } finally {
        setBusy(false);
      }
    })();

  /** 「내 루틴으로 복사」 — 복제와 같은 함수(복사본은 출처 칸이 빈 내 루틴 · SPEC-050 P3a) */
  const copyToMine = (id: string) =>
    run(async () => {
      await repos?.routine.duplicateRoutine(id);
      toast(t("routines.copiedToMine"));
    });

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
    trackUsage("workout_start");
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
    trackUsage("workout_start_routine");
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
    (!!activeWorkoutId || routines.length === 0 || reco !== null) &&
    // [원본] 여기까지(… || reco !== null) — v0.54.1 에서 아래 두 조건을 더함
    // 사용자 레코드(스케줄)를 읽었고, 스케줄을 쓰면 놓친 루틴 판단(완료일)까지 — 그 카드들이 버튼 위라
    // 판단 뒤에 나타나면 이미 누를 수 있는 버튼이 밀려 오탭이다(SRS-093 · qa M-1)
    !userLoading &&
    (!weeklySchedule || doneLoaded);
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
  // 루틴이 하나도 없으면 주 행동은 「새 루틴 만들기」 — 루틴을 짜서 하는 것이 이 앱의 주 동선이다 @plm SRS-093
  const newRoutinePrimary = primary?.kind === "quick" && primary.reason === "noRoutines";
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
        // [원본] actions=<AppBarAction … testId="home-exercises" /> 하나 — 오른쪽에 ? 를 더했다(SPEC-058)
        actions={
          <>
            <AppBarAction
              icon="search-outline"
              label={t("nav.exerciseList")}
              href="/exercises"
              testId="home-exercises"
            />
            <GuideButton tab="workout" />
          </>
        }
      />
      <div className="flex flex-1 flex-col p-[var(--spacing-lg)]">
        {/* ── 주간 스케줄 — 맨 위(2026-11-05 사용자 지시) · 사용자 기록을 읽기 전에는 자리만 잡는다(만들기 줄이 카드로 바뀌며 깜빡이지 않게) ── */}
        {userLoading ? (
          <div aria-hidden className="mb-[var(--spacing-sm)] min-h-[50px]" data-testid="schedule-skeleton" />
        ) : weeklySchedule ? (
          <Card
            // [원본] className={`mb-[var(--spacing-sm)] ${block?.isDeload ? "border-(--color-pr)!" : ""}`}
            // [개선] 평평한 구역 — 디로드는 테두리 색 대신 왼쪽 금색 강조선(SPEC-056 REV-122)
            // [원본] accent={block?.isDeload ? "var(--color-pr)" : undefined} — 금색은 PR 전용(SPEC-057 R2 · REV-131)
            accent={block?.isDeload ? "var(--color-warn)" : undefined}
          >
            {/* 첫 줄은 꺾이지 않게 — 좁거나 글자를 키우면 편집 단추가 오른쪽 위에 남고 나머지가 다음 줄로(REV S-96 3) */}
            <div className="flex flex-wrap items-center gap-x-[var(--spacing-sm)] gap-y-[2px] whitespace-nowrap">
              {/* [원본] <AppText variant="label" color="primary"> — 누를 수 없는 머리글은 빨강 대신 회색 굵은 글자(SRS-069 · SPEC-057 REV-131 H1 — 「다음 운동」 머리글과 같은 꼴) */}
              <AppText variant="label" color="textMuted" className="font-semibold">
                {t("schedule.title")}
              </AppText>
              {block ? (
                // [원본] 판 있는 알약(디로드 surface-alt · 주차 brand-muted) + 주차 빨강 글자
                // [개선] 누를 수 없는 정보는 판 없이 글자만 — 주차 ink2 · 디로드 warn(SPEC-057 R2 색 표)
                <span data-testid="schedule-week-badge">
                  <AppText
                    variant="label"
                    color={block.isDeload ? "warning" : "textMuted"}
                    className="font-bold!"
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
              {/* [개선 2026-11-09 · S-96] 편집은 첫 줄 오른쪽 끝에 「📅 편집」 — 아래 따로 빠진 버튼 줄을 없앴다 */}
              <button
                type="button"
                onClick={() => setEditingSchedule(true)}
                data-testid="btn-edit-schedule"
                // [원본] className="-my-[8px] -mr-[var(--spacing-xs)] ml-auto flex min-h-[44px] shrink-0 items-center gap-[4px] rounded-[var(--radius-pill)] px-[var(--spacing-sm)] focus-visible:outline-2 focus-visible:outline-(--color-brand) focus-visible:outline-offset-2" — 4px(R1)
                className="-my-[8px] -mr-[var(--spacing-xs)] ml-auto flex min-h-[44px] shrink-0 items-center gap-[4px] rounded-[var(--radius-sm)] px-[var(--spacing-sm)] focus-visible:outline-2 focus-visible:outline-(--color-brand) focus-visible:outline-offset-2"
              >
                {/* 누를 수 있는 값은 옅은 칩(v0.82.0 규칙) — 제목·배지와 같은 글자로만 두면 단추로 안 보인다 */}
                {/* [원본] <span className="flex items-center gap-[4px] rounded-[var(--radius-pill)] border border-(--color-line) bg-(--color-surface-alt) px-[10px] py-[4px]"> — 누를 수 있는 값 판 4px · 테두리 없음(SPEC-057 R1c) */}
                <span className="flex items-center gap-[4px] rounded-[var(--radius-sm)] bg-(--color-surface-alt) px-[10px] py-[4px]">
                  {/* [원본] Icon color brand · AppText color primary — 누를 수 있는 값은 판이 말한다, 빨강은 주 행동에만(SRS-069 · REV-131) */}
                  <Icon name="calendar-outline" size={16} color="var(--color-ink2)" />
                  <AppText variant="label" color="text" className="font-semibold">
                    <span className="sr-only">{t("schedule.title")} </span>
                    {t("schedule.editShort")}
                  </AppText>
                </span>
              </button>
            </div>
            <WeekStrip schedule={weeklySchedule} routines={routines} dotColor={dotColor} />
            {/* [원본] 주간 스케줄 카드 아래 따로 「주간 스케줄 편집」 버튼 줄(secondary · sm) — 첫 줄 옆으로 옮겼다(S-96)
            <div className="mt-[var(--spacing-sm)]">
              <Button title={t("schedule.editTitle")} icon="calendar-outline" variant="secondary" size="sm" fullWidth={false} onPress={() => setEditingSchedule(true)} testId="btn-edit-schedule" />
            </div> */}
          </Card>
        ) : (
          <EntryRow
            icon="calendar-outline"
            label={t("schedule.createEntry")}
            testId="entry-schedule"
            onPress={() => setEditingSchedule(true)}
          />
        )}

        {/* ── 이번 주 — 목표·연속일·볼륨 한 장(시안 01 · 결정 D3) ── */}
        <WeekSummary />

        {/* 주 행동 계산이 끝났다는 표식(e2e 가 깜빡임 도중을 재지 않게) */}
        {homeReady ? <span hidden data-testid="home-ready" /> : null}

        {/* ── 오늘 할 루틴이 주 행동이면 그 카드가 빠른 시작보다 위(주 행동이 먼저 보인다 · M-2) ── */}
        {primary?.kind === "routine" ? todayGuide() : null}
        {/* 판단 전 — 루틴이 있으면 그 카드 자리를 미리 잡아 둔다(빠른 시작이 밀려 내려가 오탭되지 않게 · /qa M-2 M-2) */}
        {!homeReady && routinesLoaded && routines.length > 0 ? <NextCardSkeleton /> : null}

        {/* [개선] 할 루틴 카드(오늘 할 운동 → 놓친 루틴)를 먼저, 그다음 새 루틴·빠른 운동 버튼 줄 — 판단(homeReady) 뒤에만 그린다 @plm SRS-093 */}
        {/* 놓친 루틴 — 오늘 예정과 같으면 카드 한 장으로 충분하다. */}
        {/* [개선] 오늘 할 루틴(주 행동)과 같은 루틴이면 카드 한 장이면 된다(/qa M-2 M-3) */}
        {homeReady &&
        catchUp &&
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

        {/* ── 빈 운동 시작 ── */}
        {/* [원본] 빠른 운동 시작 한 개만 화면 폭 — 「+ 새 루틴」은 섹션 머리의 작은 글자라 잘 안 보였다(피드백 2026-10-30)
        <div className="mb-[var(--spacing-md)]">
          <Button title={t("routines.quickStart")} icon="play" variant={primary?.kind === "quick" ? "primary" : "secondary"}
            loading={busy} disabled={!homeReady} testId="btn-quick-start" onPress={() => guardActive(startBlank)} />
        </div> */}
        {/* [개선] 새 루틴 만들기 · 빠른 운동 시작을 같은 크기로 나란히 — 루틴을 짜서 하는 것이 주 동선이다.
            루틴이 없으면 새 루틴이 유일한 빨강, 빠른 운동은 보조(noRoutines) · 그 밖은 기존 주 행동 규칙 @plm SRS-093 */}
        <div className="mb-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
          <div className="flex-1">
            <Button
              title={t("routines.createRoutine")}
              icon="add"
              // [원본] variant={newRoutinePrimary ? "primary" : "secondary"} — 회색 판이 밋밋하다(사용자 의견 2026-11-09) → 테두리 강조
              // 판단 전(누를 수 없는 동안)에는 회색 — 분홍 테두리 둘이 「강조 둘」처럼 보이지 않게(리뷰)
              variant={!homeReady ? "secondary" : newRoutinePrimary ? "primary" : "outline"}
              // 판단 전에는 누를 수 없다 — 위 카드 수가 정해지기 전이라 자리가 바뀐다(빠른 시작과 같은 이유 · qa M-2)
              disabled={!homeReady}
              testId="btn-new-routine"
              onPress={() => {
                void import("@/lib/localDb").then((m) => m.navigateAfterFlush("/routines/new"));
              }}
            />
          </div>
          <div className="flex-1">
            {/* [원본] 진행 중이 아니면 늘 빨강 — 루틴이 있는 사람의 주 동선(루틴으로 시작)과 위계가 거꾸로였다(P4 /qa M-2)
            variant={activeWorkoutId ? "secondary" : "primary"} */}
            {/* [개선] 주 행동이 「빠른 운동」일 때만 빨강 — 오늘 이미 운동·휴식일(pickHomePrimary) @plm SRS-072 */}
            <Button
              title={t("routines.quickStart")}
              icon="play"
              // [원본] variant={primary?.kind === "quick" && !newRoutinePrimary ? "primary" : "secondary"} — 위와 같은 이유로 테두리 강조
              variant={
                !homeReady
                  ? "secondary"
                  : primary?.kind === "quick" && !newRoutinePrimary
                    ? "primary"
                    : "outline"
              }
              loading={busy}
              // 판단 전에는 누를 수 없다 — 아래로 밀려 다른 카드의 「시작」이 눌리는 오탭을 막는다(/qa M-2 M-2)
              disabled={!homeReady}
              testId="btn-quick-start"
              onPress={() => guardActive(startBlank)}
            />
          </div>
        </div>

        {/* [원본] 영상·글로 가져오기(SPEC-054) 진입 링크 — 2026-11-10 앱에서 뗌(정확도·편의 미달 · ADR-064 보류). 다시 붙이면 이 블록을 살린다
        {homeReady ? (
          <div className="-mt-[var(--spacing-xs)] mb-[var(--spacing-md)]">
            <a
              href="/routines/import"
              data-testid="btn-routine-import"
              className="inline-flex min-h-[44px] items-center text-(--color-ink2) text-[length:var(--text-sm)] underline underline-offset-2"
            >
              {t("routineImport.entry")}
            </a>
          </div>
        ) : null}
        */}
        {/* [개선] 진입 링크 없음(ADR-064) */}

        {/* ── 오늘의 안내 ── */}
        {primary?.kind === "routine" ? null : todayGuide()}

        {/* [원본] 놓친 루틴 카드는 「오늘의 안내」 아래(버튼 줄 아래)였다 — 피드백 2026-10-30 으로 버튼 줄 위로 옮김
        {catchUp &&
        !reco?.alreadyWorkedOutToday &&
        catchUp.routineId !== primaryRoutineId &&
        !(plan.kind === "routine" && plan.routineId === catchUp.routineId) ? (
          <CatchUpCard catchUp={catchUp} name={routines.find((r) => r.id === catchUp.routineId)?.name ?? null}
            busy={busy} onStart={() => guardActive(startFromRoutine(catchUp.routineId))} />
        ) : null} */}

        {/* ── 내 루틴 — 줄마다 바로 시작(시안 01) ── */}
        <SectionLabel
          className="mt-[var(--spacing-xl)]"
          title={t("routines.myRoutines")}
          // [원본] right={<a href="/routines/new" data-testid="btn-new-routine" className="font-semibold text-(--color-brand)">+ {t("routines.newRoutine")}</a>}
          // [개선] 같은 행동이 바로 위 「새 루틴 만들기」 버튼에 있다 @plm SRS-093
        />

        {folderGroups.map(([name, members], i) => (
          <FolderGroup
            key={name}
            first={i === 0}
            name={name}
            members={members}
            open={openFolders[name] ?? false}
            repo={repos?.routine ?? null}
            // 판단 전에는 막는다 — 위 스케줄 카드가 나타나며 줄이 밀려 다른 루틴이 눌릴 수 있다
            busy={busy || !homeReady}
            onToggle={() => setOpenFolders((m) => ({ ...m, [name]: !m[name] }))}
            onStart={(id) => guardActive(startFromRoutine(id))}
            onActions={setActionsFor}
            onCopy={copyToMine}
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
          // [원본] <ListGroup testId="routine-list"> · [개선] 폴더 묶음 바로 아래면 윗선이 겹치지 않게(SPEC-056 F1)
          <ListGroup
            testId="routine-list"
            // 루틴이 전부 폴더 안이면 빈 묶음의 아랫선이 겹선이 된다(P3 코드 리뷰 L-3)
            className={`${folderGroups.length ? "border-t-0!" : ""} ${loose.length === 0 ? "border-b-0!" : ""}`}
          >
            {loose.map((r) => (
              <RoutineRow
                key={r.id}
                routine={r}
                repo={repos?.routine ?? null}
                // 판단 전에는 막는다 — 위 스케줄 카드가 나타나며 줄이 밀려 다른 루틴이 눌릴 수 있다
                busy={busy || !homeReady}
                today={r.id === primaryRoutineId}
                onStart={() => guardActive(startFromRoutine(r.id))}
                onActions={() => setActionsFor(r)}
                onCopy={() => copyToMine(r.id)}
              />
            ))}
          </ListGroup>
        )}

        {/* 2026-11-05 사용자 지시 — 내 루틴 → 프로 루틴 → 최근 운동 기록 순서(2026-11-06 프로 루틴 다음에 초보자 루틴).
            [원본] <RecentWorkouts /> 다음에 <SectionLabel title="더 해 보기" /> · 주간 스케줄 · 프로그램 생성·주변 헬스장 줄 · 프로 루틴 순서였다.
            [원본] <ListRow href="/program" testId="btn-program" icon="sparkles" title={t("program.title")} /> — 프로그램 생성 기능 삭제
            [원본] <ListRow href="/gyms" testId="btn-gyms" icon="location" title={t("gyms.entry")} /> — 피드 탭으로 옮김 */}
        {/* [개선] 콘셉트 루틴 = 크리에이터 루틴 주제(버전 0개 주제는 숨김) @plm SRS-091 */}
        {/* [원본] 분류 없이 주제 전체를 「프로 루틴」 한 구역에 — 프로·초보자 두 구역으로 나눴다(사용자 지시 2026-11-06)
            {creatorTopics.length ? (
                <SectionLabel className="mt-[var(--spacing-xl)]" title={t("concept.sectionTitle")} />
                  {creatorTopics.map((c) => (
        */}
        {creatorSections.map(({ section, topics }) => (
          <div key={section} data-testid={`creator-section-${section}`} className="mb-[var(--spacing-sm)]">
            {/* [원본] 「더 해 보기」 아래의 작은 글자(AppText label) — 내 루틴 바로 아래로 오며 같은 급의 섹션 머리로 */}
            <SectionLabel
              className="mt-[var(--spacing-xl)]"
              title={t(section === "beginner" ? "concept.sectionBeginner" : "concept.sectionTitle")}
            />
            {/* [원본] <div className="grid grid-cols-2 gap-[var(--spacing-sm)]"> · [개선] 칸 사이 세로 틈 없이 아래 선만 이어지게(SPEC-056 F1) */}
            <div className="grid grid-cols-2 gap-x-[var(--spacing-lg)]">
              {topics.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`concept-topic-${c.id}`}
                  onClick={() => setCreatorTopic(c)}
                  // min-w-0 이 없으면 긴 이름이 카드를 밀어 화면 전체가 가로로 넘친다(flex 기본값 함정).
                  // [원본] className="flex min-w-0 flex-1 flex-col gap-[2px] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface) p-[var(--spacing-md)] text-left"
                  // [개선] 상자 타일 대신 아래 가는 선 한 칸(SPEC-056 F1)
                  className="flex min-h-[44px] min-w-0 flex-1 flex-col gap-[2px] border-(--color-line) border-b py-[var(--spacing-md)] text-left active:opacity-70"
                >
                  {/* [개선] 꺾쇠 — 누르면 목록 시트(SPEC-061 3A) */}
                  <span className="flex min-w-0 items-center gap-[2px]">
                    <AppText variant="body" className="block min-w-0 truncate font-bold">
                      {lang === "ko" ? c.nameKo : c.nameEn}
                    </AppText>
                    <span aria-hidden className="inline-flex shrink-0">
                      <Icon name="chevron-forward" size={16} color="var(--color-ink3)" />
                    </span>
                  </span>
                  <AppText variant="label" color="textMuted">
                    {t("creator.topicCount", { count: creatorRoutinesFor(c.id).length })}
                  </AppText>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* 운동 팁(SPEC-047) — 루틴이 아닌 지식이라 소개 한 줄로 구분한다(스펙 리뷰 U8) */}
        {tipTopics.length ? (
          <div data-testid="tip-section" className="mb-[var(--spacing-sm)]">
            <SectionLabel className="mt-[var(--spacing-xl)]" title={t("tips.sectionTitle")} />
            {/* [원본] <AppText variant="caption" color="textMuted" className="-mt-[2px] mb-[var(--spacing-sm)] block">
              {t("tips.sectionBlurb")}
            </AppText> */}
            {/* [개선] 설명 줄 없앰(SPEC-055 Phase 4) */}
            {/* [원본] <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-[var(--spacing-sm)]"> · [개선] 아래 선만(SPEC-056 F1) */}
            <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-[var(--spacing-lg)]">
              {tipTopics.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-testid={`tip-topic-${c.id}`}
                  onClick={() => setTipTopic(c)}
                  // [원본] className="flex min-w-0 flex-1 flex-col gap-[2px] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface) p-[var(--spacing-md)] text-left"
                  // [개선] 상자 타일 대신 아래 가는 선 한 칸(SPEC-056 F1)
                  className="flex min-h-[44px] min-w-0 flex-1 flex-col gap-[2px] border-(--color-line) border-b py-[var(--spacing-md)] text-left active:opacity-70"
                >
                  {/* [개선] 꺾쇠 — 누르면 목록 시트(SPEC-061 3A) */}
                  <span className="flex min-w-0 items-center gap-[2px]">
                    <AppText variant="body" className="block min-w-0 truncate font-bold">
                      {lang === "ko" ? c.nameKo : c.nameEn}
                    </AppText>
                    <span aria-hidden className="inline-flex shrink-0">
                      <Icon name="chevron-forward" size={16} color="var(--color-ink3)" />
                    </span>
                  </span>
                  <AppText variant="label" color="textMuted">
                    {t("tips.topicCount", { count: tipsFor(c.id).length })}
                  </AppText>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <RecentWorkouts />

        {/* 담당 회원 카드(SPEC-050 P2) — 활성 회원이 있는 코치만 · 맨 아래라 늦게 떠도 위 줄이 밀리지 않는다 */}
        <HomeMembersCard />

        {/* ── 대화상자들 ── */}
        {tipTopic ? <CreatorTipTopicSheet topic={tipTopic} onClose={() => setTipTopic(null)} /> : null}
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
              // 코치 루틴(SPEC-050 P3a) — 맨 위 「내 루틴으로 복사」(복제와 합침) · 「편집」 → 「보기」
              ...(isFromCoach(actionsFor)
                ? [
                    {
                      label: t("routines.copyToMine"),
                      testId: "btn-routine-copy-mine",
                      onPress: () => copyToMine(actionsFor.id),
                    },
                  ]
                : []),
              {
                // [원본] label: t("routines.edit"),
                label: isFromCoach(actionsFor) ? t("routines.view") : t("routines.edit"),
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
              // 코치 루틴은 위 「내 루틴으로 복사」가 복제다(합침)
              ...(isFromCoach(actionsFor)
                ? []
                : [
                    {
                      label: t("routines.duplicate"),
                      onPress: () =>
                        run(async () => void (await repos?.routine.duplicateRoutine(actionsFor.id))),
                    },
                  ]),
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
        {/* 광고 자리 — 시작 버튼보다 아래, 맨 끝(SPEC-022) */}
        {homeReady ? <AdSlot placement="home" /> : null}
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
      // [원본] className="mb-[var(--spacing-sm)] flex w-full items-center gap-[var(--spacing-sm)] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-surface) px-[var(--spacing-md)] py-[var(--spacing-md)] disabled:opacity-45"
      // [개선] 평평한 기록지(SPEC-056 F1) — 상자 없이 아래 가는 선으로 나뉜 한 줄(누르는 자리 44px 이상)
      className="flex min-h-[44px] w-full items-center gap-[var(--spacing-sm)] border-(--color-line) border-b py-[var(--spacing-md)] disabled:opacity-45"
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
            // [원본] style={{ borderColor: isToday ? "var(--color-brand)" : "var(--color-line)", backgroundColor: isToday ? "var(--color-brand-muted)" : "var(--color-surface-alt)" }}
            // [개선] 회색 판 일곱 칸을 걷고 오늘만 빨강 테두리(채움 없음 · SPEC-056 F1·F6)
            style={{ borderColor: isToday ? "var(--color-brand)" : "transparent" }}
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
      // [원본] <Card className="mb-[var(--spacing-sm)] border-(--color-brand)! bg-(--color-brand-muted)!" style={originStripeStyle(routine)}>
      // [개선] 분홍 판·빨강 테두리 대신 왼쪽 빨강 강조선(코치 루틴이면 그 띠 색 · SPEC-056 REV-122)
      <Card accent={isFromCoach(routine) ? "var(--color-coaching)" : "var(--color-brand)"}>
        <div className="flex items-center" data-testid="today-card">
          <div className="mr-[var(--spacing-md)] min-w-0 flex-1">
            {/* [원본] <AppText variant="label" color="primary"> — 누를 수 없는 머리글은 빨강 대신 회색 굵은 글자(SRS-069 · SPEC-057 REV-131 H1 — 「다음 운동」 머리글과 같은 꼴) */}
            <AppText variant="label" color="textMuted" className="font-semibold">
              {t("schedule.todayLabel")}
            </AppText>
            <span className="mt-[2px] flex items-center gap-[6px]">
              <span style={{ backgroundColor: dotColor(routine.id) }} className="h-2 w-2 rounded-[4px]" />
              <AppText variant="heading" className="block truncate">
                {routine.name}
              </AppText>
            </span>
            {/* 출처 칩(SPEC-050 P3a) */}
            <span className="mt-[2px] flex empty:hidden">
              <RoutineOriginChip routine={routine} />
            </span>
            {/* [원본] <AppText variant="caption" color="textMuted" className="mt-[2px] block">
              {t("schedule.todayHint")}
            </AppText> */}
            {/* [개선] 설명 줄 없앰(SPEC-055 Phase 4) */}
            <RoutineMuscleFocus routineId={routine.id} />
          </div>
          {/* 오른쪽 열 = 「시작」 + 그 아래 근육 그림(이름 칸 폭을 지킨다 · P2 /qa P2-2) @plm SRS-075 */}
          <div className="flex shrink-0 flex-col items-center">
            {/* 화면 정리 P4 /qa M-1 — 루틴 「시작」은 회색 상자. 단 오늘 할 루틴이 주 행동이면 빨강(M-2) @plm SRS-072 */}
            <Button
              title={t("routines.start")}
              icon="play"
              size="sm"
              // [원본] variant={primary ? "primary" : "secondary"} — 주 행동이 아니면 회색이라 아래 루틴 줄(옅은 강조)보다 약해 보였다(리뷰 2026-11-09)
              // [원본] variant={primary ? "primary" : "tonalOnTint"} — 분홍 카드 위 판이었다
              // [개선] 카드가 평평해져(왼쪽 강조선) 판 없는 빨강 글자 — 루틴 「▶ 시작」과 같은 규칙(SPEC-056 F4)
              variant={primary ? "primary" : "ghost"}
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
    // [원본] <Card alt className="mb-[var(--spacing-sm)]"> — 옅은 판
    // [개선] 안내뿐인 구역이라 평평하게(SPEC-056 F1)
    <Card>
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
  // [원본] const reason =
  //   source === "schedule"
  //     ? t("schedule.todayHint")
  //     : source === "reco"
  //       ? muscle
  //         ? t("routines.todayRecoHint", {
  //             muscle: muscleLabel(muscle as Parameters<typeof muscleLabel>[0], lang),
  //           })
  //         : null
  //       : source === "recent"
  //         ? t("routines.nextReasonRecent")
  //         : t("routines.nextReasonFirst");
  // [개선] 설명 줄 없앰(SPEC-055 Phase 4) — 스케줄·최근·첫 루틴은 머리말이 근거를 말한다 · 추천 근거 부위(내용)만 남김
  const reason =
    source === "reco" && muscle
      ? t("routines.todayRecoHint", {
          muscle: muscleLabel(muscle as Parameters<typeof muscleLabel>[0], lang),
        })
      : null;
  return (
    // [원본] <Card className="mb-[var(--spacing-sm)]" style={originStripeStyle(routine)}>
    // [개선] 평평한 구역은 아래 선으로 나뉘어 사이 여백이 필요 없다 · 코치 띠는 Card 가 안쪽 여백을 준다(SPEC-056)
    <Card style={originStripeStyle(routine)}>
      <div className="flex items-center" data-testid="next-card">
        <div className="mr-[var(--spacing-md)] min-w-0 flex-1">
          <AppText variant="label" color="textMuted">
            {label}
          </AppText>
          <AppText variant="heading" className="mt-[2px] block truncate">
            {routine.name}
          </AppText>
          {/* 출처 칩(SPEC-050 P3a) */}
          <span className="mt-[2px] flex empty:hidden">
            <RoutineOriginChip routine={routine} />
          </span>
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
    // [원본] <Card className="mb-[var(--spacing-sm)]" aria-hidden> · [개선] 평평한 구역(SPEC-056)
    <Card aria-hidden>
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
      // [원본] className="ml-[6px] shrink-0 rounded-[var(--radius-pill)] bg-(--color-surface-alt) px-[8px] py-[1px] text-[length:var(--text-xs)] font-semibold text-(--color-ink2)" — 정보는 판 없이 글자만(SPEC-057 R2)
      className="ml-[6px] shrink-0 text-[length:var(--text-xs)] font-semibold text-(--color-ink2)"
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
      // [원본] <Card alt className="mb-[var(--spacing-sm)]"> — 옅은 판 · [개선] 평평한 구역(SPEC-056 F1)
      <Card>
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
    // [원본] <Card className="mb-[var(--spacing-sm)] border-(--color-brand)! bg-(--color-brand-muted)!">
    // [개선] 분홍 판·빨강 테두리 대신 왼쪽 빨강 강조선(SPEC-056 REV-122)
    <Card accent="var(--color-brand)">
      <div className="flex items-center" data-testid="reco-card">
        <div className="mr-[var(--spacing-md)] min-w-0 flex-1">
          {/* [원본] <AppText variant="label" color="primary"> — 누를 수 없는 머리글은 빨강 대신 회색 굵은 글자(SRS-069 · SPEC-057 REV-131 H1 — 「다음 운동」 머리글과 같은 꼴) */}
          <AppText variant="label" color="textMuted" className="font-semibold">
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
            // [원본] variant={primary ? "primary" : "secondary"} — 주 행동이 아니면 회색이라 아래 루틴 줄(옅은 강조)보다 약해 보였다(리뷰 2026-11-09)
            // [원본] variant={primary ? "primary" : "tonalOnTint"} — 분홍 카드 위 판이었다
            // [개선] 판 없는 빨강 글자(SPEC-056 F4)
            variant={primary ? "primary" : "ghost"}
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
  onCopy,
  todayId = null,
  first = false,
}: {
  /** 맨 위 폴더 — 평평한 목록의 윗선을 긋는다(SPEC-056 F1) */
  first?: boolean;
  name: string;
  members: Routine[];
  open: boolean;
  repo: RoutineRepo | null;
  busy: boolean;
  onToggle: () => void;
  onStart: (routineId: string) => void;
  onActions: (r: Routine) => void;
  /** 코치 루틴 「내 루틴으로 복사」(SPEC-050 P3a) */
  onCopy: (routineId: string) => void;
  /** 오늘 할 루틴 id — 그 줄에 「오늘」 칩. */
  todayId?: string | null;
}) {
  const [preview, setPreview] = useState<Routine | null>(null); // 루틴 미리보기(SPEC-045)
  return (
    // [원본] <Card className="mb-[var(--spacing-md)]" data-testid="folder-group">
    // [개선] 폴더도 구분선 목록의 한 칸 — 사이 여백 없이 이어지고 맨 위 폴더만 윗선(SPEC-056 F1)
    <Card className={first ? "border-t" : ""} data-testid="folder-group">
      {preview ? (
        <RoutinePreviewSheet
          repo={repo}
          routineId={preview.id}
          name={preview.name}
          busy={busy}
          onClose={() => setPreview(null)}
          onStart={() => {
            const id = preview.id;
            setPreview(null);
            onStart(id);
          }}
          onEdit={() => {
            const id = preview.id;
            setPreview(null);
            navigate(`/routines/${id}`);
          }}
          origin={preview}
          onCopy={() => {
            const id = preview.id;
            setPreview(null);
            onCopy(id);
          }}
        />
      ) : null}
      <button
        type="button"
        onClick={onToggle}
        data-testid="folder-toggle"
        // [원본] className="flex w-full items-center gap-[var(--spacing-sm)]"
        // [개선] 루틴 줄과 같은 왼쪽 여백 — 폴더 머리·루틴 줄·코치 루틴의 왼쪽 끝이 맞는다(사용자 지시 2626 · 리뷰 중간 5)
        className="flex w-full items-center gap-[var(--spacing-sm)] pl-[var(--spacing-md)]"
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
              style={originStripeStyle(r)} // 코치 루틴 왼쪽 청록 띠(SPEC-050 P3a)
              data-origin={r.origin ?? undefined}
            >
              {/* [개선] 폴더 안 줄도 종목 한 줄 · 누르면 미리보기(SPEC-045) */}
              <button
                type="button"
                data-testid="open-routine-preview"
                aria-haspopup="dialog"
                onClick={() => setPreview(r)}
                className="mr-[var(--spacing-sm)] min-h-[44px] min-w-0 flex-1 rounded-[var(--radius-sm)] text-left focus-visible:outline-2 focus-visible:outline-(--color-brand) active:opacity-70"
              >
                <span className="flex min-w-0 items-center">
                  <AppText variant="body" className="block truncate font-bold">
                    {r.name}
                  </AppText>
                  {r.id === todayId ? <TodayChip /> : null}
                  {/* [개선] 꺾쇠 — 누르면 미리보기 시트(SPEC-061 3A) */}
                  <span aria-hidden className="ml-[2px] inline-flex shrink-0">
                    <Icon name="chevron-forward" size={16} color="var(--color-ink3)" />
                  </span>
                </span>
                {/* [원본] <ExerciseLine repo={repo} routineId={r.id} /> — 종목 줄 쪽에 출처 칩(SPEC-050 P3a) */}
                <ExerciseLineWithOrigin repo={repo} routine={r} />
                {/* aria-label 은 안의 글(오늘 칩·종목 한 줄)을 덮어 화면 읽기에서 빠졌다 → 보이는 글 + 숨긴 안내(UX 1) */}
                <span className="sr-only">{t("routines.previewHint")}</span>
              </button>
              {/* 화면 정리 P4 /qa M-1 — 폴더 밖 루틴 줄과 같은 회색 상자 @plm SRS-072 */}
              {/* [개선 2026-11-09] 폴더 밖 줄과 같이 옅은 강조 · [원본] variant="secondary" */}
              <Button
                title={t("routines.start")}
                size="sm"
                variant="ghost" // [원본] variant="tonal" — 연한 빨강 판 · [개선] 판 없는 빨강 글자(SPEC-056 F4 · 사용자 피드백)
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
  onCopy,
}: {
  routine: Routine;
  repo: RoutineRepo | null;
  busy: boolean;
  /** 오늘 할 루틴(위 카드와 같은 루틴)이면 「오늘」 칩. */
  today?: boolean;
  onStart: () => void;
  onActions: () => void;
  /** 코치 루틴 「내 루틴으로 복사」(SPEC-050 P3a) */
  onCopy: () => void;
}) {
  const [preview, setPreview] = useState(false);
  return (
    // 코치 루틴 왼쪽 청록 띠(SPEC-050 P3a) — 안쪽 그림자라 줄 자리가 그대로다
    <div
      // [원본] className="px-[var(--spacing-lg)] py-[var(--spacing-md)]" — 상자 목록 안쪽 여백
      // [개선] 판 없는 구분선 목록이라 좌우 여백 없음 · 코치 띠가 있으면 띠 옆만 띄운다(SPEC-056 F1)
      // [원본] className={`py-[var(--spacing-md)] ${originStripeStyle(routine) ? "pl-[var(--spacing-md)]" : ""}`} — 띠 없는 줄은 왼쪽으로 붙어 코치 루틴과 글자 줄이 어긋났다
      // [개선] 띠가 없어도 같은 왼쪽 여백 — 제목·종목 줄이 위아래로 맞는다(사용자 지시 2626)
      className="py-[var(--spacing-md)] pl-[var(--spacing-md)]"
      style={originStripeStyle(routine)}
      data-origin={routine.origin ?? undefined}
    >
      {preview ? (
        <RoutinePreviewSheet
          repo={repo}
          routineId={routine.id}
          name={routine.name}
          busy={busy}
          onClose={() => setPreview(false)}
          onStart={() => {
            setPreview(false);
            onStart();
          }}
          onEdit={() => {
            setPreview(false);
            navigate(`/routines/${routine.id}`);
          }}
          origin={routine}
          onCopy={() => {
            setPreview(false);
            onCopy();
          }}
        />
      ) : null}
      <div className="flex items-center justify-between" data-testid={`routine-${routine.id}`}>
        {/* [원본] 이름 + 「종목 n개」(ExerciseCount) — 누를 수 없었다
            [개선] 이름 + 종목 한 줄(외 N) · 누르면 미리보기 시트(SPEC-045 · SRS-110) */}
        <button
          type="button"
          data-testid="open-routine-preview"
          aria-haspopup="dialog"
          onClick={() => setPreview(true)}
          className="mr-[var(--spacing-md)] min-h-[44px] min-w-0 flex-1 rounded-[var(--radius-sm)] text-left focus-visible:outline-2 focus-visible:outline-(--color-brand) active:opacity-70"
        >
          <span className="flex min-w-0 items-center">
            <AppText variant="heading" className="block truncate">
              {routine.name}
            </AppText>
            {today ? <TodayChip /> : null}
            {/* [개선] 꺾쇠 — 누르면 미리보기 시트(SPEC-061 3A) */}
            <span aria-hidden className="ml-[2px] inline-flex shrink-0">
              <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
            </span>
          </span>
          {/* [원본] <ExerciseLine repo={repo} routineId={routine.id} /> — 종목 줄 쪽에 출처 칩(SPEC-050 P3a) */}
          <ExerciseLineWithOrigin repo={repo} routine={routine} />
          {/* aria-label 은 안의 글(오늘 칩·종목 한 줄)을 덮어 화면 읽기에서 빠졌다 → 보이는 글 + 숨긴 안내(UX 1) */}
          <span className="sr-only">{t("routines.previewHint")}</span>
        </button>
        <div className="flex items-center gap-[var(--spacing-xs)]">
          {/* [원본] 루틴마다 빨강 채움 「시작」 — 위 「빠른 운동 시작」과 주 행동이 둘(셋, 넷…)이 됐다(화면 정리 P4)
          <Button title={t("routines.start")} size="sm" fullWidth={false} disabled={busy} testId="btn-start-routine" onPress={onStart} /> */}
          {/* [개선] 회색 상자 버튼 — 빨강 채움은 화면에 하나(빠른 운동 시작) @plm SRS-072 */}
          {/* [개선 2026-11-09] 회색이라 「누르면 시작」이 눈에 덜 띄었다(사용자 의견) → 옅은 강조(연한 빨강 판·빨간 글자).
              빨강 채움은 그대로 화면에 하나 — 오늘/다음 운동 카드 · 빠른 운동 · 새 루틴 중 상황별(pickHomePrimary)
              [원본] variant="secondary" */}
          <Button
            title={t("routines.start")}
            size="sm"
            variant="ghost" // [원본] variant="tonal" — 연한 빨강 판 · [개선] 판 없는 빨강 글자(SPEC-056 F4 · 사용자 피드백)
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

// [원본] 루틴에 든 종목 수(「종목 3개」) — SPEC-045 에서 종목 이름 한 줄(ExerciseLine · RoutinePreviewSheet.tsx)로 바꿨다
// function ExerciseCount({ repo, routineId }: { repo: RoutineRepo | null; routineId: string }) {
//   const rows = useQueryData(() => (repo ? repo.queryRoutineExercises(routineId) : null), [repo, routineId]);
//   return (
//     <AppText variant="caption" color="textMuted" className="mt-[2px] block">
//       {t("routines.exerciseCount", { count: rows.length })}
//     </AppText>
//   );
// }

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
    // [원본] <Card className="mb-[var(--spacing-sm)]" data-testid="catchup-card">
    // [개선] 놓친 루틴 = 왼쪽 주황(경고) 강조선의 평평한 구역(SPEC-056 REV-122)
    <Card accent="var(--color-warn)" data-testid="catchup-card">
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
        {/* [개선 2026-11-09] 내 루틴 「▶ 시작」과 같은 옅은 강조(빨강 채움 아님) · [원본] variant="secondary" */}
        <Button
          title={t("schedule.startThis")}
          size="sm"
          variant="ghost" // [원본] variant="tonal" — 연한 빨강 판 · [개선] 판 없는 빨강 글자(SPEC-056 F4 · 사용자 피드백)
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
