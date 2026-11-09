"use client";
// @plm SRS-002  루틴 편집기 — app의 features/routines/RoutineEditorScreen.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
//   머리   이름 · 폴더(칩 또는 입력) · 메모
//   종목   행마다 세트·휴식·무게 스테퍼 + 처방 칩 + 변형 칩 + 슈퍼셋/대체/삭제
//   발     운동 추가 · 완료 · 루틴 삭제
//
// ── 저장 방식(app과 같다) ───────────────────────────────────────────────────
// 각 칸은 **고치는 즉시** 저장된다(blur 커밋). "완료"는 타이핑 중이던 값을 확정하고 나가는 버튼이지
// 이때 처음 저장되는 것이 아니다 — 헬스장에서 앱이 죽어도 방금 고친 값이 남아야 하기 때문이다.
//
// ── 새 루틴을 언제 만드는가 ─────────────────────────────────────────────────
// app은 화면에 들어오는 순간 초안을 만들고, 아무것도 안 하고 나가면 뒤로가기 훅에서 지운다.
// 웹에는 그 훅이 없다(주소창·뒤로가기·탭 닫기로도 나갈 수 있다). 그래서 **첫 변경이 생길 때까지
// 만들지 않는다** — 결과는 같고(빈 초안이 쌓이지 않는다) 지우는 코드가 필요 없다.
// ─────────────────────────────────────────────────────────────────────────────
import { errorText } from "@/lib/errorText";
import {
  // blockLoadMultiplier, // [원본] V1 — 피드백 #63 뒤 usePlateOneSide(V2)
  canonicalVariantKey,
  cardioMetricsFor,
  fromKg,
  inputToIncline,
  inputToLevel,
  inputToSpeed,
  kmInputToM,
  mToKmInput,
  minInputToSec,
  resolveLoadMode,
  secToMinInput,
  toKg,
  type CardioMetric,
  type EquipmentType,
  type PrescribedSet,
  type VariantDims,
} from "@app/core";
import { useQueryData } from "@app/core/db/hooks";
import { useUser } from "@app/core/state/userContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { scheduleFlush } from "@/lib/localDb";
import { usePlateOneSide } from "@/lib/usePlateOneSide";
// import ExercisePicker from "../ExercisePicker"; // [원본] 작은 카드 피커 — SRS-093 에서 전체 화면으로
import ExercisePickerScreen from "../ExercisePickerScreen";
import { useToast } from "../Toast";
import { Button } from "../ui/Button";
import { closeTopOverlay, ConfirmDialog, SheetShell } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { NumberStepper, TextField } from "../ui/inputs";
import { AppText, Card, Divider, SectionHeader, Tag } from "../ui/primitives";
import { RecordSlotSelector } from "../ui/RecordSlotSelector";
import { ExerciseName } from "../session/ExerciseName";
import { useSession } from "../SessionProvider";
import { SubAppBar } from "../ui/AppBar";
import { LogoSpinner } from "../ui/LogoSpinner";
// import { MoreMenu } from "../ui/MoreMenu"; // [원본] 앱바 ⋯ — S-104 에서 뺐다
import { type RoutineLineSets, routineLinePatch, rowsFromRoutineLine } from "@app/core/domain/routineSets";
import { PrescriptionRows } from "./PrescriptionRows";
import { RxTypeHint } from "../CoachHints";
import { trackUsage } from "@/lib/usage";
import { runAfterOverlays } from "@/lib/useBackToClose"; // 창 칸 정리 뒤에(REV-077)
import { markCoachRoutineSeen } from "@/lib/coachRoutineSeen"; // 새로 받은 코치 루틴 점(SPEC-050 P3a)
import { RoutineLinesList } from "./RoutinePreviewSheet"; // 코치 루틴 읽기 보기(SPEC-050 P3a)
import { CoachRoutineBanner } from "./RoutineOrigin";

type RoutineRepo = typeof import("@app/core/data/routineRepository");

/** 이 화면이 모델에서 읽는 것만. */
interface RoutineExerciseRow {
  id: string;
  exerciseId: string;
  targetSets: number;
  restSeconds: number;
  targetWeightKg: number | null;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  supersetGroup: string | null;
  variant: VariantDims | null;
  prescription: PrescribedSet[] | null;
  cardioTarget: {
    durationSec?: number | null;
    distanceM?: number | null;
    incline?: number | null;
    level?: number | null;
    speed?: number | null;
  } | null;
}

// 세트 표가 따라가는 칸 — 동기로 온 값·다른 탭의 변경이 표에 반영되게(SPEC-023)
const SET_TABLE_COLUMNS = [
  "target_sets",
  "target_weight_kg",
  "target_reps_min",
  "target_reps_max",
  "prescription",
];

export default function RoutineEditor({ routineId: paramId }: { routineId: string | null }) {
  const toast = useToast();
  const [repo, setRepo] = useState<RoutineRepo | null>(null);
  const [routineId, setRoutineId] = useState<string | null>(paramId);
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [notes, setNotes] = useState("");
  const [folderOptions, setFolderOptions] = useState<string[]>([]);
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const [picking, setPicking] = useState<null | { mode: "add" } | { mode: "swap"; reId: string }>(null);
  const [supersetTarget, setSupersetTarget] = useState<RoutineExerciseRow | null>(null);
  const [confirmDeleteRoutine, setConfirmDeleteRoutine] = useState(false);
  const [starting, setStarting] = useState(false);
  /** 피커에서 고른 종목을 넣는 중 — 끝나기 전에 시작·완료를 누르지 못하게(qa code M-1) */
  const [adding, setAdding] = useState(false);
  const { activeWorkoutId, setActive } = useSession();
  const [confirmRemove, setConfirmRemove] = useState<RoutineExerciseRow | null>(null);
  // 코치가 보낸 루틴이면 읽기 보기(SPEC-050 P3a) — 회원은 이름·메모·종목·세트를 못 고친다(저장소도 막는다)
  const [coachView, setCoachView] = useState<{ coachName: string | null } | null>(null);

  // 만들기가 두 번 겹치지 않게 하는 자물쇠(빠르게 두 번 누르거나 개발 모드의 이중 실행 대비).
  const creatingRef = useRef<Promise<string> | null>(null);

  // ── 새 루틴 벗어나기(SPEC-023) ── 첫 변경에 행이 만들어지므로, 완료·시작 없이 벗어나면 그 행을 치운다.
  const isNewRoutine = !paramId;
  const pendingWrites = useRef<Set<Promise<unknown>>>(new Set());
  const trackWrite = useCallback((p: Promise<unknown>) => {
    pendingWrites.current.add(p);
    void p.finally(() => pendingWrites.current.delete(p));
  }, []);
  /** 나가는 중 — 이후의 저장·행 만들기를 막는다. */
  const exitingRef = useRef(false);
  const guardTokenRef = useRef<string | null>(null);
  const [exitTarget, setExitTarget] = useState<string | null>(null);
  const latest = useRef({ name: "", notes: "", folder: "" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await import("@app/core/data/routineRepository");
      if (cancelled) return;
      setRepo(r);

      const folders = await r.getFolderNames().catch(() => []);
      if (cancelled) return;
      setFolderOptions(folders);

      if (paramId) {
        const routine = (await r.getRoutine(paramId)) as unknown as {
          name: string;
          folder: string | null;
          notes: string | null;
          origin: string | null;
          coachName: string | null;
        };
        if (cancelled) return;
        setName(routine.name ?? "");
        setFolder(routine.folder ?? "");
        setNotes(routine.notes ?? "");
        setCoachView(r.isCoachLocked(routine) ? { coachName: routine.coachName ?? null } : null);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [paramId]);

  // 잠금은 처음 한 번만 읽으면 화면을 연 채 동기로 출처가 바뀔 때(코치가 보냄 coach · 코칭 끝남 coach_ended) 옛 화면이 남는다
  // → 루틴 모델을 지켜보며 다시 정한다(REV L-3). 잠긴 동안은 회원이 못 고치니 이름·메모도 모델 값을 따른다.
  useEffect(() => {
    if (!repo || !routineId || !loaded) return;
    let sub: { unsubscribe(): void } | null = null;
    let cancelled = false;
    void repo
      .getRoutine(routineId)
      .then((model) => {
        if (cancelled) return;
        const m = model as unknown as {
          name: string;
          folder: string | null;
          notes: string | null;
          origin: string | null;
          coachName: string | null;
          observe(): { subscribe(o: { next(v: unknown): void; error(): void }): { unsubscribe(): void } };
        };
        sub = m.observe().subscribe({
          next: () => {
            if (!repo.isCoachLocked(m)) {
              setCoachView(null);
              return;
            }
            setName(m.name ?? "");
            setNotes(m.notes ?? "");
            setFolder(m.folder ?? ""); // 읽기 보기에서 고친 폴더도 — 풀려 편집기로 넘어갈 때 옛 값이 남지 않게
            setCoachView((prev) =>
              prev && prev.coachName === (m.coachName ?? null) ? prev : { coachName: m.coachName ?? null },
            );
          },
          error: () => {}, // 지워진 루틴 — 지우기 흐름이 화면을 떠난다
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, [repo, routineId, loaded]);

  /** 메모리에만 있는 변경을 디스크로 — 완료를 누르면 곧바로 다른 화면으로 넘어가기 때문이다. */
  const flush = useCallback(async () => {
    const { flushLocalDb } = await import("@/lib/localDb");
    await flushLocalDb();
  }, []);

  /** 저장할 것이 생겼을 때 비로소 루틴을 만든다. 이미 있으면 그 id를 그대로 준다. */
  const ensureId = useCallback(async (): Promise<string | null> => {
    if (exitingRef.current) return null;
    if (routineId) return routineId;
    if (!repo) return null;
    if (!creatingRef.current) {
      trackUsage("routine_create");
      creatingRef.current = repo
        .createRoutine({ name: name.trim() || t("routines.newRoutineName") })
        .then((r) => (r as unknown as { id: string }).id);
      trackWrite(creatingRef.current);
    }
    const id = await creatingRef.current;
    setRoutineId(id);
    return id;
  }, [repo, routineId, name, trackWrite]);

  const models = useQueryData(
    () => (repo && routineId ? repo.queryRoutineExercises(routineId) : null),
    [repo, routineId, version],
    SET_TABLE_COLUMNS,
  );
  const exercises = models.map((m) => m as unknown as RoutineExerciseRow);

  const save = useCallback(
    async (patch: { name?: string; folder?: string | null; notes?: string | null }) => {
      if (!repo) return;
      const id = await ensureId();
      if (!id) return;
      await repo.updateRoutine(id, patch).catch(() => {});
      // 글자마다 세지 않는다 — 10분에 한 번.
      trackUsage("routine_edit", { throttleMs: 600_000 });
      await flush();
    },
    [repo, ensureId, flush],
  );

  latest.current = { name, notes, folder };

  /** 진행 중인 입력·쓰기를 끝낸다 — 활성 칸을 떠나 저장을 올린 뒤 기다린다. */
  const committingRef = useRef(false); // 완료·시작을 눌렀다 — 이 뒤로는 벗어나기가 행을 지우면 안 된다(REV-028)
  const settleWrites = useCallback(async () => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) active.blur();
    await new Promise((r) => setTimeout(r, 0));
    while (pendingWrites.current.size > 0) {
      await Promise.allSettled([...pendingWrites.current]);
    }
  }, []);

  /** 가드 칸을 걷는다 — 이동 뒤 칸이 남으면 뒤로 가기가 이 화면에 갇힌다. */
  const dropGuard = useCallback(async () => {
    // [개선] 막 닫힌 확인창이 자기 칸을 걷는 중이면 끝난 뒤에 본다 — 맨 위가 확인창 칸이라 가드를 못 걷던 것(REV-077 M-5)
    await new Promise<void>((r) => runAfterOverlays(r));
    const token = guardTokenRef.current;
    guardTokenRef.current = null;
    if (!token || history.state?.liftgramTop !== token) return;
    await new Promise<void>((resolve) => {
      const done = () => {
        window.removeEventListener("popstate", done);
        resolve();
      };
      window.addEventListener("popstate", done);
      history.back();
      setTimeout(done, 400);
    });
  }, []);

  /** 이 화면을 떠난다. 새 루틴은 화면 칸을 바꿔치기해 뒤로 가기로 빈 편집기가 다시 뜨지 않게 한다. */
  const leaveTo = useCallback(
    async (href: string) => {
      const { navigateAfterFlush } = await import("@/lib/localDb");
      if (!isNewRoutine) {
        await navigateAfterFlush(href);
        return;
      }
      await dropGuard();
      await navigateAfterFlush(href, { replace: true });
    },
    [isNewRoutine, dropGuard],
  );

  /** 만들던 새 루틴을 버리고 떠난다 — 이미 올라갔을 수 있어 삭제 표식이 전파되도록 동기화를 부른다. */
  const discardAndLeave = useCallback(
    async (href: string) => {
      if (committingRef.current) return;
      exitingRef.current = true;
      await settleWrites();
      const id = creatingRef.current ? await creatingRef.current.catch(() => null) : null;
      const r = await import("@app/core/data/routineRepository");
      if (id) await r.deleteRoutine(id).catch(() => {});
      await leaveTo(href);
      if (id) void import("@/lib/syncTransport").then((m) => m.syncNow()).catch(() => {});
    },
    [settleWrites, leaveTo],
  );

  /** 완료·시작 없이 벗어나려 할 때 — 끝나지 않은 쓰기를 기다린 뒤, 내용이 있으면 묻고 없으면 치운다. */
  const requestExit = useCallback(
    (href: string) => {
      if (exitingRef.current || committingRef.current) return;
      void (async () => {
        await settleWrites();
        if (committingRef.current) return;
        const id = creatingRef.current ? await creatingRef.current.catch(() => null) : null;
        const r = await import("@app/core/data/routineRepository");
        const count = id ? await r.queryRoutineExercises(id).fetchCount() : 0;
        const { name: n, notes: m, folder: f } = latest.current;
        if (n.trim() || m.trim() || f.trim() || count > 0) setExitTarget(href);
        else await discardAndLeave(href);
      })();
    },
    [settleWrites, discardAndLeave],
  );

  // 기기·브라우저 뒤로와 화면 안 링크(탭 막대 등)를 받는다. 칸 규약은 ExercisePickerScreen 과 같다.
  const requestExitRef = useRef(requestExit);
  requestExitRef.current = requestExit;
  useEffect(() => {
    if (!isNewRoutine || !loaded) return;
    const token = `routine-${Math.random().toString(36).slice(2)}`;
    const pushGuard = () => {
      history.pushState({ ...(history.state ?? {}), liftgramTop: token }, "");
      guardTokenRef.current = token;
    };
    pushGuard();
    const onPop = () => {
      if (exitingRef.current || guardTokenRef.current !== token) return;
      if (history.state?.liftgramTop === token) return; // 위 칸(피커)이 닫혀 우리 칸으로 돌아왔다
      pushGuard();
      if (!closeTopOverlay()) requestExitRef.current("/");
    };
    const onClick = (e: MouseEvent) => {
      if (exitingRef.current || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      const href = a?.getAttribute("href");
      if (!a || !href?.startsWith("/") || (a.target && a.target !== "_self")) return;
      if (href === location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      requestExitRef.current(href);
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("click", onClick, true);
    };
  }, [isNewRoutine, loaded]);

  if (!loaded || !repo) {
    return (
      <div className="flex flex-1 items-center justify-center p-[var(--spacing-xl)]">
        <span role="status" className="inline-flex">
          <LogoSpinner size={36} label={t("common.loading")} />
        </span>
      </div>
    );
  }

  // 코치 루틴 — 편집기 대신 읽기 보기(안내·「내 루틴으로 복사」·폴더·삭제 · SPEC-050 P3a)
  if (coachView && routineId) {
    return (
      <CoachRoutineView
        repo={repo}
        routineId={routineId}
        name={name}
        notes={notes}
        initialFolder={folder}
        initialFolderOptions={folderOptions}
        coachName={coachView.coachName}
      />
    );
  }

  // 저장된 루틴이고 종목이 있고, 이미 진행 중인 운동이 없을 때만 바로 시작할 수 있다
  // (진행 중이면 홈의 「이어 하기」 가 먼저다 — 두 운동이 겹치지 않게).
  const canStart = !!routineId && exercises.length > 0 && !activeWorkoutId;

  const pickFolder = (next: string) => {
    setFolder(next);
    setNewFolderMode(false);
    void save({ folder: next.trim() || null });
  };

  return (
    <div className="flex flex-1 flex-col">
      {/* 하위 화면 앱바(SRS-054 시안 12) — ← · 가운데 루틴 이름 · ⋯(삭제). 삭제는 화면에 늘 드러내지 않는다. */}
      <SubAppBar
        title={name.trim() || t("routines.editorTitle")}
        onBack={() => {
          // 새 루틴은 저장 없이 판정부터(SPEC-023). 기존 루틴은 지금처럼 이름을 확정하고 나간다.
          if (isNewRoutine) {
            requestExit("/");
            return;
          }
          void (async () => {
            await settleWrites(); // 포커스가 남은 세트 칸도 올린다(REV-028)
            if (name.trim()) await save({ name: name.trim() });
            const { navigateAfterFlush } = await import("@/lib/localDb");
            await navigateAfterFlush("/");
          })();
        }}
        // [원본] right={<MoreMenu testId="btn-routine-menu" sheetTestId="routine-menu" options={[{ label: 루틴 삭제, destructive, testId: "btn-delete-routine", onPress: () => setConfirmDeleteRoutine(true) }]} />}
        //   — 항목이 「루틴 삭제」 하나뿐인데 시트를 한 번 더 올렸다(S-104 · 피드백 2026-11-09)
        // [개선] ⋯ 없이 편집 화면 맨 아래 「루틴 삭제」 버튼(아래) → 바로 삭제 확인(S-107)
      />

      <div className="flex-1 p-[var(--spacing-lg)]">
        <TextField
          testId="routine-name"
          label={t("routines.nameLabel")}
          placeholder={t("routines.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && save({ name: name.trim() })}
        />

        {/* 폴더 — 이미 만든 폴더가 있으면 칩으로 고르고, 없으면 그냥 입력한다. */}
        {folderOptions.length === 0 && !newFolderMode ? (
          <TextField
            testId="routine-folder"
            label={t("routines.folderLabel")}
            placeholder={t("routines.folderPlaceholder")}
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            onBlur={() => folder.trim() && save({ folder: folder.trim() })}
          />
        ) : (
          <div className="mb-[var(--spacing-md)]">
            <AppText variant="label" color="textMuted" className="mb-[4px] block">
              {t("routines.folderLabel")}
            </AppText>
            <div className="flex flex-wrap gap-[4px]">
              <FolderChip label={t("routines.folderNone")} active={!folder} onPress={() => pickFolder("")} />
              {folderOptions.map((f) => (
                <FolderChip
                  key={f}
                  label={f}
                  icon="folder-outline"
                  active={folder === f}
                  onPress={() => pickFolder(f)}
                />
              ))}
              <FolderChip
                label={t("routines.folderNew")}
                icon="add"
                active={newFolderMode}
                onPress={() => {
                  setFolder("");
                  setNewFolderMode(true);
                }}
              />
            </div>
            {newFolderMode ? (
              <div className="mt-[var(--spacing-sm)]">
                <TextField
                  testId="routine-folder-new"
                  placeholder={t("routines.folderNewPlaceholder")}
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  // 새 폴더를 만들려고 연 입력이라 바로 칠 수 있어야 한다
                  autoFocus
                  onBlur={() => {
                    const v = folder.trim();
                    void save({ folder: v || null });
                    if (v) {
                      setFolderOptions((opts) =>
                        opts.includes(v) ? opts : [...opts, v].sort((a, b) => a.localeCompare(b, "ko")),
                      );
                      setNewFolderMode(false);
                    }
                  }}
                />
              </div>
            ) : null}
          </div>
        )}

        <TextField
          testId="routine-notes"
          label={t("routines.notesLabel")}
          placeholder={t("routines.notesPlaceholder")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes.trim() && save({ notes: notes.trim() })}
        />

        <Divider />
        <SectionHeader title={t("routines.exercisesSection")} />
        {exercises.length > 0 ? (
          <AppText
            variant="caption"
            color="textMuted"
            className="-mt-[var(--spacing-sm)] mb-[var(--spacing-md)] block"
            data-testid="set-table-hint"
          >
            {t("routines.setTableHint")}
          </AppText>
        ) : null}

        {/* [원본] 종목이 없으면 큰 빈 상태(아이콘·「종목이 없습니다」·「아래 버튼으로…」)를 그렸다 — 휴대폰에서 「운동 추가」가
            하단 「완료」 밑으로 밀려 완료를 잘못 누르게 했다(피드백 2026-11-09 · S-13)
        {exercises.length === 0 ? (
          <EmptyState icon="add-circle" title={t("routines.editorEmptyTitle")} message={t("routines.editorEmptyMessage")} />
        ) : ( */}
        {/* [개선] 비어 있으면 빈 상태 없이 「운동 추가」 하나를 주 버튼으로 바로 아래에 — 하단 「완료」는 보조로 낮춘다 */}
        {exercises.length === 0 ? null : (
          <div data-testid="routine-exercises">
            {exercises.map((re, i) => (
              <ExerciseEditRow
                key={re.id}
                re={re}
                index={i}
                total={exercises.length}
                repo={repo}
                onSwap={() => setPicking({ mode: "swap", reId: re.id })}
                onSwapTo={(exerciseId) => {
                  // [원본] void (async () => { … })(); — 실패(코치 잠금 COACH_LOCKED 등)가 조용히 묻혔다
                  // [개선] 실패는 토스트로(SPEC-050 P3a · REV L-3)
                  void (async () => {
                    await repo.swapRoutineExercise(re.id, exerciseId);
                    await flush();
                    setVersion((v) => v + 1);
                  })().catch((e) => toast(errorText(e), "error"));
                }}
                trackWrite={trackWrite}
                onRemove={() => setConfirmRemove(re)}
                onSuperset={() => setSupersetTarget(re)}
                onUnsuperset={() => {
                  const members = exercises.filter((x) => x.supersetGroup === re.supersetGroup);
                  const ids = members.length <= 2 ? members.map((m) => m.id) : [re.id];
                  // [원본] void repo.ungroupSuperset(ids).then(() => { … }); — 실패가 조용히 묻혔다
                  // [개선] 실패는 토스트로(REV L-3)
                  void repo
                    .ungroupSuperset(ids)
                    .then(() => {
                      scheduleFlush();
                      setVersion((v) => v + 1);
                    })
                    .catch((e) => toast(errorText(e), "error"));
                }}
              />
            ))}
          </div>
        )}

        <div className="mt-[var(--spacing-md)]">
          <Button
            title={t("routines.addExercise")}
            icon="add"
            // [원본] variant="secondary"
            variant={exercises.length === 0 ? "primary" : "secondary"}
            testId="btn-add-routine-exercise"
            onPress={() => setPicking({ mode: "add" })}
          />
        </div>

        {/* 루틴 삭제 — 앱바 ⋯ 시트 대신 화면 맨 아래(S-104). 저장된 루틴에만 · 누르면 삭제 확인(S-107) */}
        {routineId ? (
          <div className="mt-[var(--spacing-xl)] flex justify-center border-(--color-line) border-t pt-[var(--spacing-lg)]">
            <Button
              title={t("routines.deleteRoutineTitle")}
              icon="trash-outline"
              variant="danger"
              size="sm"
              fullWidth={false}
              testId="btn-delete-routine"
              onPress={() => setConfirmDeleteRoutine(true)}
            />
          </div>
        ) : null}

        {/* [원본] 편집 화면 아래에 끼운 작은 카드 피커 — 몇 줄밖에 안 보이고 부위로 못 좁히고 하나씩만 골랐다(피드백 2026-10-30)
        // {picking ? (
        //   <div className="mt-[var(--spacing-md)]">
        //     <ExercisePicker
        //       onClose={() => setPicking(null)}
        //       onPick={(exerciseId, info) => {
        //         const p = picking;
        //         setPicking(null);
        //         void (async () => {
        //           // 고른 이름(별칭)이 표시 이름·함축 칸을 정한다 @plm SRS-056
        //           const { applyPick } = await import("@/lib/exerciseNames");
        //           if (p.mode === "swap") {
        //             await repo.swapRoutineExercise(p.reId, exerciseId);
        //             await applyPick(exerciseId, info, { routineExerciseId: p.reId });
        //           } else {
        //             const id = await ensureId();
        //             if (id) {
        //               const re = await repo.addExerciseToRoutine(id, exerciseId);
        //               await applyPick(exerciseId, info, { routineExerciseId: re.id });
        //             }
        //           }
        //           await flush();
        //           setVersion((v) => v + 1);
        //         })();
        //       }}
        //     />
        //   </div>
        // ) : null}
        */}
        {/* [개선] 전체 화면 피커 — 검색·부위·기구·도우미, 추가는 여러 개를 고른 순서대로 한 번에 · 교체는 한 개 즉시 @plm SRS-093 */}
        {picking ? (
          <ExercisePickerScreen
            mode={picking.mode === "add" ? "multi" : "single"}
            title={t(picking.mode === "add" ? "routines.pickerTitle" : "routines.pickerSwapTitle")}
            onClose={() => setPicking(null)}
            onDone={(picks) => {
              const p = picking;
              setPicking(null);
              setAdding(true);
              const addWork = (async () => {
                // 고른 이름(별칭)이 표시 이름·함축 칸을 정한다 @plm SRS-056
                const { applyPick } = await import("@/lib/exerciseNames");
                if (p.mode === "swap") {
                  const first = picks[0];
                  if (first) {
                    await repo.swapRoutineExercise(p.reId, first.exerciseId);
                    await applyPick(first.exerciseId, first.info, { routineExerciseId: p.reId });
                  }
                } else {
                  const id = await ensureId();
                  if (id) {
                    // 한 번의 write 로 고른 순서대로 — 일부만 들어간 채 시작되지 않는다(qa code M-1·M-2)
                    const res = await repo.addExercisesToRoutine(
                      id,
                      picks.map((x) => x.exerciseId),
                    );
                    for (const [i, pick] of picks.entries()) {
                      const re = res[i];
                      if (re) await applyPick(pick.exerciseId, pick.info, { routineExerciseId: re.id });
                    }
                  }
                }
                await flush();
                setVersion((v) => v + 1);
              })()
                .catch((e) => toast(errorText(e), "error"))
                .finally(() => setAdding(false));
              trackWrite(addWork); // 추가 중에 나가도 끝난 뒤 판정한다(SPEC-023)
            }}
          />
        ) : null}
      </div>

      {/* 첫 안내가 떠 있는 동안 그 높이만큼 아래를 비운다 — 마지막 줄이 말풍선 밑에 갇히지 않게(SPEC-046 P3 리뷰) */}
      <div aria-hidden style={{ height: "var(--coach-h, 0px)" }} />
      {/* 하단 고정 — 루틴 화면에서 할 일 1순위는 「시작」(시안 12). 완료는 저장하고 나가기. */}
      <div
        data-coach-anchor=""
        className="sticky bottom-[calc(56px+var(--shell-workout-bar,0px)+env(safe-area-inset-bottom))] z-20 flex gap-[var(--spacing-sm)] border-(--color-line) border-t bg-(--color-surface) px-[var(--spacing-lg)] py-[var(--spacing-md)] lg:bottom-[var(--shell-workout-bar,0px)]"
      >
        <div className={canStart ? "w-[38%]" : "flex-1"}>
          <Button
            title={t("common.done")}
            icon="checkmark"
            // [원본] variant={canStart ? "secondary" : "primary"} — 빈 루틴에서 빨간 완료가 「운동 추가」보다 먼저 눈에 띄었다
            variant={canStart || exercises.length === 0 ? "secondary" : "primary"}
            testId="btn-routine-done"
            loading={adding}
            onPress={() => {
              if (adding) return;
              committingRef.current = true;
              void (async () => {
                // 타이핑 중이던 이름을 확정하고(포커스가 아직 입력에 있을 수 있다) 내려쓴 뒤 나간다.
                await settleWrites(); // 세트 표의 입력 칸도 올린다(SPEC-023)
                if (name.trim()) await save({ name: name.trim() });
                exitingRef.current = true;
                await leaveTo("/");
              })();
            }}
          />
        </div>
        {canStart ? (
          <div className="flex-1">
            <Button
              title="이 루틴으로 시작"
              icon="play"
              testId="btn-routine-start"
              loading={starting || adding}
              onPress={() => {
                if (starting || adding || !routineId) return;
                setStarting(true);
                committingRef.current = true;
                void (async () => {
                  try {
                    await settleWrites(); // 세트 표의 입력 칸을 올린 뒤 읽는다(SPEC-023)
                    if (name.trim()) await save({ name: name.trim() });
                    const workout = await import("@app/core/data/workoutRepository");
                    trackUsage("workout_start_routine");
                    const w = (await workout.startWorkoutFromRoutine(routineId)) as unknown as {
                      id: string;
                      startedAt: number;
                      name: string | null;
                    };
                    setActive({ id: w.id, startedAt: w.startedAt, name: w.name });
                    exitingRef.current = true;
                    await leaveTo("/workout");
                  } catch (e) {
                    committingRef.current = false;
                    toast(errorText(e), "error");
                    setStarting(false);
                  }
                })();
              }}
            />
          </div>
        ) : null}
      </div>

      {supersetTarget ? (
        <SheetShell
          title={t("routines.supersetPickTitle")}
          onClose={() => setSupersetTarget(null)}
          hideOk
          testId="routine-superset-sheet"
        >
          <div className="mt-[var(--spacing-sm)] max-h-[360px] overflow-y-auto">
            {exercises.filter((x) => x.id !== supersetTarget.id).length === 0 ? (
              <AppText variant="caption" color="textMuted">
                {t("routines.supersetNoPartner")}
              </AppText>
            ) : (
              exercises
                .filter((x) => x.id !== supersetTarget.id)
                .map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    data-testid="routine-superset-option"
                    onClick={() => {
                      const ids = new Set<string>([supersetTarget.id, x.id]);
                      for (const m of exercises) {
                        if (
                          m.supersetGroup &&
                          (m.supersetGroup === supersetTarget.supersetGroup ||
                            m.supersetGroup === x.supersetGroup)
                        )
                          ids.add(m.id);
                      }
                      setSupersetTarget(null);
                      // [원본] void repo.groupAsSuperset([...ids]).then(() => { … }); — 실패가 조용히 묻혔다
                      // [개선] 실패는 토스트로(REV L-3)
                      void repo
                        .groupAsSuperset([...ids])
                        .then(() => {
                          scheduleFlush();
                          setVersion((v) => v + 1);
                        })
                        .catch((e) => toast(errorText(e), "error"));
                    }}
                    className="flex w-full items-center justify-between border-(--color-line) border-b py-[var(--spacing-sm)] text-left"
                  >
                    <ExerciseName exerciseId={x.exerciseId} variant="body" base />
                    {x.supersetGroup ? <Tag label={t("routines.supersetTag")} /> : null}
                  </button>
                ))
            )}
          </div>
          <div className="mt-[var(--spacing-md)]">
            <Button title={t("common.cancel")} variant="secondary" onPress={() => setSupersetTarget(null)} />
          </div>
        </SheetShell>
      ) : null}

      {confirmRemove ? (
        <ConfirmDialog
          testId="confirm-remove-routine-exercise"
          title={t("routines.removeExerciseTitle")}
          message={t("routines.removeExerciseMessage")}
          confirmLabel={t("common.delete")}
          destructive
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => {
            const target = confirmRemove;
            setConfirmRemove(null);
            void repo
              .removeRoutineExercise(target.id)
              .then(flush)
              .catch((e) => toast(errorText(e), "error"));
          }}
        />
      ) : null}

      {confirmDeleteRoutine ? (
        <ConfirmDialog
          testId="confirm-delete-routine"
          title={t("routines.deleteRoutineTitle")}
          message={t("routines.deleteRoutineMessage")}
          confirmLabel={t("common.delete")}
          destructive
          onCancel={() => setConfirmDeleteRoutine(false)}
          onConfirm={() => {
            setConfirmDeleteRoutine(false);
            void (async () => {
              // 아직 만들어지지 않은 새 루틴이면 지울 것이 없다.
              exitingRef.current = true;
              if (routineId) await repo.deleteRoutine(routineId).catch(() => {});
              await leaveTo("/");
            })();
          }}
        />
      ) : null}

      {exitTarget ? (
        <ConfirmDialog
          testId="confirm-exit-routine"
          title={t("routines.exitTitle")}
          message={t("routines.exitMessage")}
          confirmLabel={t("routines.exitLeave")}
          cancelLabel={t("routines.exitStay")}
          destructive
          onCancel={() => setExitTarget(null)}
          onConfirm={() => {
            const href = exitTarget;
            setExitTarget(null);
            void discardAndLeave(href);
          }}
        />
      ) : null}

      {/* 첫 안내(SPEC-046 (b)) — 세트 번호를 누르면 종류 바꾸기·복사·삭제 · 키보드 순서가 화면과 같게 맨 끝에(P3 리뷰) */}
      <RxTypeHint />
    </div>
  );
}

/**
 * 코치가 보낸 루틴 보기(SPEC-050 P3a · REV-097) — 회원 기기.
 *   머리   청록 띠 「코치 ○○님이 짠 루틴이에요」 + 안내 · 이름 · 메모(읽기만)
 *   폴더   회원 것 — 고칠 수 있다
 *   종목   미리보기와 같은 읽기 목록
 *   발     「내 루틴으로 복사」(복사본은 내 루틴 → 편집기로) · 「이 루틴으로 시작」 · 루틴 삭제(가능)
 */
function CoachRoutineView({
  repo,
  routineId,
  name,
  notes,
  initialFolder,
  initialFolderOptions,
  coachName,
}: {
  repo: RoutineRepo;
  routineId: string;
  name: string;
  notes: string;
  initialFolder: string;
  initialFolderOptions: string[];
  coachName: string | null;
}) {
  const toast = useToast();
  const { activeWorkoutId, setActive } = useSession();
  const [folder, setFolder] = useState(initialFolder);
  const [folderOptions, setFolderOptions] = useState(initialFolderOptions);
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const onReady = useCallback((n: number) => setCount(n), []);

  // 처음 열면 「새로 받음」 점이 사라진다
  useEffect(() => {
    markCoachRoutineSeen(routineId);
  }, [routineId]);

  const leave = useCallback(async (href: string, replace = false) => {
    const { navigateAfterFlush } = await import("@/lib/localDb");
    await navigateAfterFlush(href, replace ? { replace: true } : undefined);
  }, []);

  const saveFolder = (next: string) => {
    const v = next.trim() || null;
    void repo
      .updateRoutine(routineId, { folder: v })
      .then(() => scheduleFlush())
      .catch((e) => toast(errorText(e), "error"));
  };
  const pickFolder = (next: string) => {
    setFolder(next);
    setNewFolderMode(false);
    saveFolder(next);
  };

  const run = (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    void fn()
      .catch((e) => toast(errorText(e), "error"))
      .finally(() => setBusy(false));
  };

  const canStart = (count ?? 0) > 0 && !activeWorkoutId;
  const coachRoutine = { id: routineId, origin: "coach", coachName };

  return (
    <div className="flex flex-1 flex-col" data-testid="coach-routine-view">
      <SubAppBar title={name.trim() || t("routines.editorTitle")} onBack={() => void leave("/")} />
      <div className="flex-1 p-[var(--spacing-lg)]">
        <CoachRoutineBanner routine={coachRoutine} />
        <AppText variant="heading" className="block" data-testid="coach-routine-name">
          {name}
        </AppText>
        {notes.trim() ? (
          <AppText
            variant="body"
            color="textMuted"
            className="mt-[var(--spacing-xs)] block whitespace-pre-wrap"
            data-testid="coach-routine-notes"
          >
            {notes}
          </AppText>
        ) : null}

        {/* 폴더 — 회원 것(편집기와 같은 칩) */}
        <div className="mt-[var(--spacing-md)] mb-[var(--spacing-md)]">
          <AppText variant="label" color="textMuted" className="mb-[4px] block">
            {t("routines.folderLabel")}
          </AppText>
          <div className="flex flex-wrap gap-[4px]" data-testid="coach-routine-folders">
            <FolderChip label={t("routines.folderNone")} active={!folder} onPress={() => pickFolder("")} />
            {folderOptions.map((f) => (
              <FolderChip
                key={f}
                label={f}
                icon="folder-outline"
                active={folder === f}
                onPress={() => pickFolder(f)}
              />
            ))}
            <FolderChip
              label={t("routines.folderNew")}
              icon="add"
              active={newFolderMode}
              onPress={() => {
                setFolder("");
                setNewFolderMode(true);
              }}
            />
          </div>
          {newFolderMode ? (
            <div className="mt-[var(--spacing-sm)]">
              <TextField
                testId="routine-folder-new"
                placeholder={t("routines.folderNewPlaceholder")}
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                autoFocus
                onBlur={() => {
                  const v = folder.trim();
                  saveFolder(v);
                  if (v) {
                    setFolderOptions((opts) =>
                      opts.includes(v) ? opts : [...opts, v].sort((a, b) => a.localeCompare(b, "ko")),
                    );
                    setNewFolderMode(false);
                  }
                }}
              />
            </div>
          ) : null}
        </div>

        <Divider />
        <SectionHeader title={t("routines.exercisesSection")} />
        <RoutineLinesList repo={repo} routineId={routineId} onReady={onReady} />

        <div className="mt-[var(--spacing-xl)] flex justify-center border-(--color-line) border-t pt-[var(--spacing-lg)]">
          <Button
            title={t("routines.deleteRoutineTitle")}
            icon="trash-outline"
            variant="danger"
            size="sm"
            fullWidth={false}
            testId="btn-delete-routine"
            onPress={() => setConfirmDelete(true)}
          />
        </div>
      </div>

      {/* 하단 고정 — 편집기와 같은 자리. 「완료」 대신 「내 루틴으로 복사」(고치려면 복사본에서) */}
      <div className="sticky bottom-[calc(56px+var(--shell-workout-bar,0px)+env(safe-area-inset-bottom))] z-20 flex gap-[var(--spacing-sm)] border-(--color-line) border-t bg-(--color-surface) px-[var(--spacing-lg)] py-[var(--spacing-md)] lg:bottom-[var(--shell-workout-bar,0px)]">
        <div className={canStart ? "w-[46%]" : "flex-1"}>
          <Button
            title={t("routines.copyToMine")}
            variant="secondary"
            testId="btn-routine-copy-mine"
            loading={busy}
            onPress={() =>
              run(async () => {
                const copy = (await repo.duplicateRoutine(routineId)) as unknown as { id: string };
                toast(t("routines.copiedToMine"));
                // 복사본은 내 루틴 — 바로 고칠 수 있게 편집기로(뒤로 가면 홈 · 보기 화면을 바꿔치기)
                await leave(`/routines/${copy.id}`, true);
              })
            }
          />
        </div>
        {canStart ? (
          <div className="flex-1">
            <Button
              title={t("routines.startThisRoutine")}
              icon="play"
              testId="btn-routine-start"
              loading={busy}
              onPress={() =>
                run(async () => {
                  const workout = await import("@app/core/data/workoutRepository");
                  trackUsage("workout_start_routine");
                  const w = (await workout.startWorkoutFromRoutine(routineId)) as unknown as {
                    id: string;
                    startedAt: number;
                    name: string | null;
                  };
                  setActive({ id: w.id, startedAt: w.startedAt, name: w.name });
                  await leave("/workout");
                })
              }
            />
          </div>
        ) : null}
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          testId="confirm-delete-routine"
          title={t("routines.deleteRoutineTitle")}
          message={t("routines.deleteRoutineMessage")}
          confirmLabel={t("common.delete")}
          destructive
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            run(async () => {
              await repo.deleteRoutine(routineId);
              await leave("/");
            });
          }}
        />
      ) : null}
    </div>
  );
}

function FolderChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon?: "folder-outline" | "add";
  active: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      style={{
        backgroundColor: active ? "var(--color-brand-muted)" : "var(--color-surface-alt)",
        borderColor: active ? "var(--color-brand)" : "var(--color-line)",
      }}
      className="flex items-center gap-[4px] rounded-[var(--radius-md)] border px-[var(--spacing-sm)] py-[6px]"
    >
      {icon ? (
        <Icon name={icon} size={12} color={active ? "var(--color-brand)" : "var(--color-ink2)"} />
      ) : null}
      <AppText variant="caption" color={active ? "primary" : "text"}>
        {label}
      </AppText>
    </button>
  );
}

/** 루틴 안의 종목 한 줄 — 세트·휴식·무게·처방·변형을 여기서 정한다. */
function ExerciseEditRow({
  re,
  index,
  total,
  repo,
  onSwap,
  onSwapTo,
  onRemove,
  onSuperset,
  onUnsuperset,
  trackWrite,
}: {
  re: RoutineExerciseRow;
  index: number;
  total: number;
  repo: RoutineRepo;
  onSwap: () => void;
  /** 같은 동작의 다른 기구 종목으로 곧바로 바꾼다(기구 바꾸기) @plm SRS-057 */
  onSwapTo: (exerciseId: string) => void;
  onRemove: () => void;
  onSuperset: () => void;
  onUnsuperset: () => void;
  trackWrite: (p: Promise<unknown>) => void;
}) {
  const toast = useToast();
  const { weightUnit } = useUser();
  const [rest, setRest] = useState(re.restSeconds);
  const [weight, setWeight] = useState(() => (re.targetWeightKg ? fromKg(re.targetWeightKg, weightUnit) : 0));
  const [variant, setVariant] = useState<VariantDims>(() => re.variant ?? {});
  // 종목이 바뀌면(기구 바꾸기·대체) 저장소가 정한 새 칸을 따른다.
  // [원본] 종목이 바뀔 때만 따라갔다 — 별칭(「로프 푸시다운」)으로 대체하면 저장소가 정한 칸을 화면이 몰랐다
  // useEffect(() => setVariant(re.variant ?? {}), [re.exerciseId]);
  // [개선] 저장된 칸(키)이 바뀌어도 따른다(세션 블록과 같은 규칙 · #47 회귀 방지) @plm SRS-057
  const storedVariantKey = canonicalVariantKey(re.variant ?? {});
  // biome-ignore lint/correctness/useExhaustiveDependencies: 종목·저장된 칸이 바뀔 때만 따라간다
  useEffect(() => setVariant(re.variant ?? {}), [re.exerciseId, storedVariantKey]);
  // 플레이트 「한쪽 무게로 입력」(사용자 × 종목 선호 — 세션과 같은 값) @plm SRS-058
  // [원본] const [plateOneSide, setPlateOneSideState] = useState(false);
  // useEffect(() => { …m.getPlateOneSide(re.exerciseId)… setPlateOneSideState(on) }, [re.exerciseId]);
  // const oneSide = blockLoadMultiplier(variant, plateOneSide) === 2;
  // [개선] 세션 블록과 같은 규칙 — 플레이트 후보 머신은 기본이 한쪽(피드백 #63) @plm SRS-084
  const plate = usePlateOneSide(re.exerciseId);
  const oneSide = plate.multiplier(variant) === 2;
  const plateOneSide = plate.choice !== false && oneSide;
  const [baseEquipment, setBaseEquipment] = useState<EquipmentType | null>(null);
  const [isCardio, setIsCardio] = useState(false);
  // 줄마다 무게 칸을 둘 것인가 — 종목을 읽은 뒤에 정한다(맨몸·어시스트는 스테퍼 하나 · SRS-063)
  const [allowLoad, setAllowLoad] = useState<boolean | null>(null);
  const [metrics, setMetrics] = useState<CardioMetric[]>([]);

  // 밖에서 바뀐 값(대체·복제)을 따라간다.
  useEffect(() => setRest(re.restSeconds), [re.restSeconds]);
  useEffect(
    () => setWeight(re.targetWeightKg ? fromKg(re.targetWeightKg, weightUnit) : 0),
    [re.targetWeightKg, weightUnit],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const exRepo = await import("@app/core/data/exerciseRepository");
        const e = (await exRepo.getExercise(re.exerciseId)) as unknown as {
          equipment: EquipmentType;
          kind: string | null;
          nameEn: string | null;
        };
        if (!alive) return;
        setBaseEquipment(e.equipment);
        setIsCardio(e.kind === "cardio");
        setAllowLoad(
          e.kind !== "cardio" &&
            resolveLoadMode(e as unknown as Parameters<typeof resolveLoadMode>[0]) === "external",
        );
        setMetrics(cardioMetricsFor({ nameEn: e.nameEn }));
      } catch {
        // 삭제된 종목 — 기본값으로 둔다.
      }
    })();
    return () => {
      alive = false;
    };
  }, [re.exerciseId]);

  const grouped = !!re.supersetGroup;

  return (
    <Card className={`mb-[var(--spacing-md)] ${grouped ? "border-(--color-brand)!" : ""}`}>
      <div className="flex flex-col gap-[var(--spacing-md)]" data-testid={`re-${re.id}`}>
        {/* [원본] 이름 · 「1. 3세트 · 휴식 120초」 · 변형 칩 · (아래 줄) 휴식·무게 스테퍼 — 세로로만 쌓여 카드가 길고 오른쪽이 비었다.
            세트 수는 세트 표가, 휴식은 스테퍼가 이미 보여 요약 줄은 겹친 정보였다(S-14 · 2026-11-09)
            [개선] 1줄: 번호·이름 · 2줄: 변형 칩과 휴식(·무게) 스테퍼를 한 줄에 — 좁으면 다음 줄로 넘어간다(잘리지 않는다) */}
        <div className="flex items-center gap-[var(--spacing-sm)]">
          <div className="flex min-w-0 flex-1 items-baseline gap-[6px]">
            <AppText variant="body" color="textMuted" className="shrink-0">
              {`${index + 1}.`}
            </AppText>
            <ExerciseName exerciseId={re.exerciseId} variant="body" base />
            {isCardio ? (
              <AppText variant="caption" color="textMuted" className="shrink-0">
                {t("routines.cardioTag")}
              </AppText>
            ) : null}
          </div>
          {/* /qa P4 L-3 — 슈퍼셋 칩은 무채(빨강 = 주 행동만) @plm SRS-072 */}
          {grouped ? <Tag label={t("routines.supersetTag")} /> : null}
        </div>
        {!isCardio ? (
          <div className="flex flex-wrap items-end gap-x-[var(--spacing-md)] gap-y-[var(--spacing-sm)]">
            {/* 변형 칩 — 고를 것이 없는 종목은 아무것도 그리지 않으므로 칸도 숨긴다(빈 칸이 간격만 차지해 휴식이 밀렸다 · 리뷰 L-5) */}
            <div className="flex min-h-[40px] flex-wrap items-center gap-[6px] empty:hidden">
              <RecordSlotSelector
                exerciseId={re.exerciseId}
                baseEquipment={baseEquipment}
                value={variant}
                onChange={(dims) => {
                  setVariant(dims);
                  // [원본] void repo.setRoutineExerciseVariant(re.id, dims).then(scheduleFlush);
                  // [개선] 실패는 토스트로(REV L-3) — 아래 저장소 쓰기도 같다
                  void repo
                    .setRoutineExerciseVariant(re.id, dims)
                    .then(scheduleFlush)
                    .catch((e) => toast(errorText(e), "error"));
                }}
                onSwap={onSwapTo}
                plateOneSide={plateOneSide}
                plateDefaultLoad={plate.defaultLoad}
                onPlateOneSide={(on) => {
                  // [원본] setPlateOneSideState(on); … m.setPlateOneSide(re.exerciseId, on) — 끄기는 기억되지 않았다
                  plate.setChoiceLocal(on);
                  void import("@app/core/data/exercisePrefs")
                    .then((m) => m.setPlateOneSideChoice(re.exerciseId, on))
                    .then(scheduleFlush)
                    .catch((e) => toast(errorText(e), "error"));
                }}
              />
            </div>
            <div className="flex flex-wrap items-end gap-x-[var(--spacing-md)] gap-y-[var(--spacing-sm)]">
              <Field label={t("routines.restLabel")}>
                <NumberStepper
                  compact
                  testId="re-rest"
                  value={rest}
                  min={0}
                  step={15}
                  onChange={(v) => {
                    setRest(v);
                    // [원본] void repo.updateRoutineExercise(re.id, { restSeconds: v }).then(scheduleFlush);
                    void repo
                      .updateRoutineExercise(re.id, { restSeconds: v })
                      .then(scheduleFlush)
                      .catch((e) => toast(errorText(e), "error"));
                  }}
                />
              </Field>
              {allowLoad === false ? (
                <Field label={t("routines.weightLabel", { weightUnit })}>
                  <NumberStepper
                    compact
                    testId="re-weight"
                    value={weight}
                    min={0}
                    step={weightUnit === "kg" ? 2.5 : 5}
                    onChange={(v) => {
                      setWeight(v);
                      // 화면은 사용자 단위지만 **저장은 항상 kg**이다(단위를 바꿔도 기록이 흔들리지 않게).
                      void repo
                        .updateRoutineExercise(re.id, {
                          targetWeightKg: v > 0 ? toKg(v, weightUnit) : null,
                        })
                        .then(scheduleFlush)
                        .catch((e) => toast(errorText(e), "error"));
                    }}
                  />
                </Field>
              ) : null}
            </div>
          </div>
        ) : null}

        {isCardio ? (
          <CardioTargetFields re={re} metrics={metrics} repo={repo} />
        ) : (
          <>
            {allowLoad != null ? (
              <RoutineSetTable
                key={`${re.exerciseId}:${allowLoad}`}
                re={re}
                repo={repo}
                allowLoad={allowLoad}
                fixedMultiplier={plate.multiplier(variant) ?? 1}
                equipment={baseEquipment ?? null}
                variantKey={canonicalVariantKey(variant)}
                trackWrite={trackWrite}
                weightLabel={
                  oneSide
                    ? t("session.weightOneSideLabel", { weightUnit }) // 플레이트 한쪽 입력(ADR-037)
                    : t("routines.weightLabel", { weightUnit })
                }
              />
            ) : null}
          </>
        )}

        <div className="flex items-center gap-[var(--spacing-xs)]">
          <span className="flex-1" />
          {total >= 2 ? (
            <Button
              title={grouped ? t("routines.supersetUnlink") : t("routines.supersetLink")}
              size="sm"
              // [원본] variant="ghost" — 빨강 글자·아이콘(P4: 부가 행동은 회색) @plm SRS-072
              variant="quiet"
              icon="git-merge-outline"
              fullWidth={false}
              testId="btn-re-superset"
              onPress={grouped ? onUnsuperset : onSuperset}
            />
          ) : null}
          {/* [원본] 대체 = ghost(빨강 글자) · 삭제 = 빨강 아이콘 — 종목마다 빨강 셋이 화면의 「완료·시작」과 경쟁했다
          <Button title={t("routines.swap")} size="sm" variant="ghost" fullWidth={false} testId="btn-re-swap" onPress={onSwap} />
          <IconButton icon="trash-outline" size={18} label={t("routines.removeExerciseTitle")} color="var(--color-bad)" testId="btn-re-remove" onPress={onRemove} /> */}
          {/* [개선] 부가 행동은 회색 — 삭제의 위험은 확인창이 말한다(화면 정리 P4 · 빨강 = 주 행동만) @plm SRS-072 */}
          <Button
            title={t("routines.swap")}
            size="sm"
            variant="quiet"
            fullWidth={false}
            testId="btn-re-swap"
            onPress={onSwap}
          />
          <IconButton
            icon="trash-outline"
            size={18}
            label={t("routines.removeExerciseTitle")}
            color="var(--color-ink3)"
            testId="btn-re-remove"
            onPress={onRemove}
          />
        </div>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // [원본] className="flex-1" — 둘이 반씩 늘어나 좁은 폭에서 스테퍼가 카드 밖으로 밀렸다(S-14)
    <div className="shrink-0">
      <AppText variant="label" color="textMuted" className="mb-[4px] block">
        {label}
      </AppText>
      {children}
    </div>
  );
}

/**
 * 유산소 목표 — 시간·거리·경사·단계·속도 중 **그 종목에 맞는 것만** 보여 준다.
 *
 * 어떤 지표를 쓸지는 도메인이 정한다(cardioMetricsFor). 저장 단위도 도메인 변환기를 그대로 쓴다:
 * 화면은 분·km, 저장은 초·m다.
 */
function CardioTargetFields({
  re,
  metrics,
  repo,
}: {
  re: RoutineExerciseRow;
  metrics: CardioMetric[];
  repo: RoutineRepo;
}) {
  const toast = useToast();
  const target = re.cardioTarget ?? {};
  const [vals, setVals] = useState<Record<string, string>>(() => ({
    duration: secToMinInput(target.durationSec ?? null),
    distance: mToKmInput(target.distanceM ?? null),
    incline: target.incline == null ? "" : String(target.incline),
    level: target.level == null ? "" : String(target.level),
    speed: target.speed == null ? "" : String(target.speed),
  }));

  const persist = () => {
    void repo
      .updateRoutineExercise(re.id, {
        cardioTarget: {
          durationSec: minInputToSec(vals.duration),
          distanceM: kmInputToM(vals.distance),
          incline: inputToIncline(vals.incline),
          level: inputToLevel(vals.level),
          speed: inputToSpeed(vals.speed),
        },
      })
      .then(scheduleFlush)
      .catch((e) => toast(errorText(e), "error")); // 실패는 토스트로(REV L-3)
  };

  const LABEL: Record<CardioMetric, string> = {
    duration: t("routines.cardioDurationLabel"),
    distance: t("routines.cardioDistanceLabel"),
    incline: t("routines.cardioInclineLabel"),
    level: t("routines.cardioLevelLabel"),
    speed: t("routines.cardioSpeedLabel"),
  };

  return (
    <div className="flex flex-wrap gap-[var(--spacing-md)]">
      {metrics.map((m) => (
        <div key={m} className="min-w-[90px] grow basis-[30%]">
          <AppText variant="label" color="textMuted" className="mb-[4px] block">
            {LABEL[m]}
          </AppText>
          <input
            data-testid={`cardio-${m}`}
            inputMode="decimal"
            placeholder="0"
            value={vals[m] ?? ""}
            onChange={(e) => setVals((v) => ({ ...v, [m]: e.target.value }))}
            onBlur={persist}
            className="w-full rounded-[var(--radius-sm)] border border-(--color-line) bg-(--color-surface) px-[var(--spacing-md)] py-[var(--spacing-sm)] text-center text-[length:var(--text-md)] text-(--color-ink) placeholder:text-(--color-ink3)"
          />
        </div>
      ))}
    </div>
  );
}

/**
 * 세트 표(SPEC-023) — 저장은 직렬로, 값은 routineLinePatch 가 만든다. 다른 곳의 변경(동기·교체)이 오면 표를 그 값으로 다시 맞춘다
 * (포커스 중인 칸은 NumCell 이 지킨다).
 */
function RoutineSetTable({
  re,
  repo,
  allowLoad,
  fixedMultiplier,
  weightLabel,
  trackWrite,
  equipment,
  variantKey,
}: {
  re: RoutineExerciseRow;
  repo: RoutineRepo;
  allowLoad: boolean;
  fixedMultiplier: number;
  weightLabel: string;
  trackWrite: (p: Promise<unknown>) => void;
  /** 종목 기구 — 세트 방식 제한(SPEC-041) */
  equipment: string | null;
  /** 이 줄의 조합 키 — 추정 1RM 을 운동 시작 때와 같은 칸에서 읽는다(REV-076 화면 M-1) */
  variantKey: string | null;
}) {
  const { weightUnit } = useUser();
  const toast = useToast();
  // 세트 방식의 「1RM 의 %」 줄에 계산 무게를 보이려고 추정 1RM 을 읽는다(전 조합 기준 — 운동 시작 때는 그날 칸 기준으로 다시 계산한다)
  const [est1rmKg, setEst1rmKg] = useState(0);
  useEffect(() => {
    if (!allowLoad) return;
    let alive = true;
    void (async () => {
      try {
        const w = await import("@app/core/data/workoutRepository");
        // [원본] const v = await w.estimatedOneRmForSlot(re.exerciseId); — 전 조합 기준이라 운동 화면 무게와 달랐다(REV-076 M-1)
        const v = await w.estimatedOneRmForSlotV2(re.exerciseId, variantKey, fixedMultiplier || 1);
        if (alive) setEst1rmKg(v > 0 ? v : 0);
      } catch {
        // 기록을 못 읽으면 % 만 보인다
      }
    })();
    return () => {
      alive = false;
    };
  }, [re.exerciseId, allowLoad, variantKey, fixedMultiplier]);
  const lineOf = useCallback(
    (): RoutineLineSets => ({
      targetSets: re.targetSets,
      targetWeightKg: re.targetWeightKg,
      targetRepsMin: re.targetRepsMin ?? null,
      targetRepsMax: re.targetRepsMax ?? null,
      prescription: re.prescription ?? null,
    }),
    [re],
  );
  const [rows, setRows] = useState<PrescribedSet[]>(() => rowsFromRoutineLine(lineOf(), { allowLoad }));
  const lastLine = useRef<RoutineLineSets>(lineOf());
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const writing = useRef(0);

  const signature = JSON.stringify(lineOf());
  // biome-ignore lint/correctness/useExhaustiveDependencies: 저장된 값(서명)·무게 칸 여부가 바뀔 때만 다시 맞춘다
  useEffect(() => {
    if (writing.current > 0 || signature === JSON.stringify(lastLine.current)) return;
    const line = lineOf();
    lastLine.current = line;
    setRows(rowsFromRoutineLine(line, { allowLoad }));
  }, [signature, allowLoad]);

  const change = (next: PrescribedSet[]) => {
    setRows(next);
    const patch = routineLinePatch(next, lastLine.current, { allowLoad });
    lastLine.current = patch;
    writing.current += 1;
    chain.current = chain.current
      .then(() => repo.setRoutineExerciseSets(re.id, patch))
      // [원본] .catch(() => {}) — 실패가 조용히 묻혀 표에만 값이 남았다
      .catch((e) => toast(errorText(e), "error"))
      .finally(() => {
        writing.current -= 1;
        scheduleFlush();
      });
    trackWrite(chain.current);
  };

  return (
    <div className="flex flex-col gap-[var(--spacing-xs)]">
      {/* [원본] 종목 카드마다 「지난 기록이 있으면 지난 기록부터 시작해요」 — 같은 말이 카드마다 되풀이됐다.
          [개선] 「종목」 제목 옆에 한 번만(S-14 · 2026-11-09) */}
      <PrescriptionRows
        rows={rows}
        onChange={change}
        allowLoad={allowLoad}
        fixedMultiplier={fixedMultiplier}
        unit={weightUnit}
        weightLabel={weightLabel}
        equipment={equipment}
        est1rmKg={est1rmKg}
      />
    </div>
  );
}
