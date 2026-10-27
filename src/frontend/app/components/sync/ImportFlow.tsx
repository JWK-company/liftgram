"use client";
// @plm SRS-081 SRS-082  다른 앱 기록 가져오기 — 전체 화면 단계(/account/import · U-18·U-19)
//
// ─────────────────────────────────────────────────────────────────────────────
// 단계: 파일 → 확인(단위 kg/lb + 표본 한 줄) → 종목 맞추기(자동·확인 필요·못 맞춤) → 진행(닫을 수 없음) → 끝.
//   · 파싱·맞추기·계획은 lib/importWorker(Worker, 안 되면 메인)가 하고 실제 단계 진행률을 보낸다.
//   · 쓰기는 importRepository.importPlan 이 운동 단위 묶음(≤2000행)으로 하고 묶음 진행률을 보낸다(ADR-043 개정).
//     그 안에서: 가져오기 전 조건 → (로그인 ∧ 온라인) 동기 → 동기 멈춤 → 묶음 쓰기 → flush(여기서 넘김) → 동기 재개.
//   · 맞추기 결정은 sessionStorage 에 임시 저장한다 — **파일 해시와 결정표만**(원본 CSV 본문은 저장하지 않는다).
//     새로고침 뒤 같은 파일을 다시 고르면 이어서 한다. 확인을 받고 나가면 지운다(「고른 내용이 사라져요」).
//   · 나가기: 확인·맞추기 단계는 확인창, 진행 단계는 막는다(링크·뒤로 가기·새로고침).
//   · 가져오기 전 조건(U-19·D-2): 진행 중 운동 → 막음 · 로그인 ∧ 오프라인 ∧ 되돌린 묶음 → 막음 · 다른 가져오기 중 → 막음.
//   · 가져온 운동은 피드·스토리·PR 폭죽·완료 요약을 타지 않는다 — finishWorkout 경로를 쓰지 않는다(importRepository).
// 원본 내용(파일 본문·종목 이름)은 console 에 찍지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import type { ExerciseDecision, ExerciseMatch, ImportWeightUnit } from "@app/core/domain/import/index";
import type {
  ImportContext,
  ImportProgress,
  ImportReadiness,
  ImportResult,
} from "@app/core/data/importRepository";
import { importFileLabel } from "@app/core/domain/import/index";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushLocalDb } from "@/lib/localDb";
import { navigate } from "@/lib/nav";
import { t, type TransKey } from "@/lib/i18n";
import {
  disposeImportWorker,
  ImportTaskError,
  runImportTask,
  type AnalyzeResult,
  type ImportTaskProgress,
  type ImportTaskVia,
} from "@/lib/importWorker";
import ExercisePicker from "../ExercisePicker";
import { SubAppBar } from "../ui/AppBar";
import { Button } from "../ui/Button";
import { ConfirmDialog, Overlay } from "../ui/Dialog";
import { AppText, Card, Tag } from "../ui/primitives";
import { FoldToggle, MetaAction, MetaLine, QuietChip } from "../ui/quiet";
import { Segmented } from "../ui/rows";
import { importSourceLabel } from "./ImportCard";

type Repo = typeof import("@app/core/data/importRepository");
type Step = "file" | "summary" | "match" | "progress" | "done";

/** 한 종목 줄의 상태 — confirmed = 사람이 고르거나 「이대로 맞아요」를 눌렀다(별칭으로 남긴다) */
interface RowState {
  decision: ExerciseDecision;
  confirmed: boolean;
}

// ── 임시 저장(sessionStorage · 파일 해시와 결정표만) ──────────────────────────
const DRAFT_KEY = "liftgram.importDraft";
interface Draft {
  v: 1;
  hash: string;
  unit: ImportWeightUnit | null;
  rows: Record<string, RowState>;
}
function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    return d && d.v === 1 && typeof d.hash === "string" && d.rows && typeof d.rows === "object" ? d : null;
  } catch {
    return null;
  }
}
function writeDraft(d: Draft): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    // 저장 공간이 없거나 막혔다 — 임시 저장은 편의일 뿐이다
  }
}
function clearDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // 무시
  }
}

/** 시험 전용 실패 주입(e2e) — localStorage `liftgram.e2e.importFault` = `throw:<n>` | `reload:<n>` | `hold:<n>`(n번째 묶음 뒤 멈춤 — 진행 화면 확인용) */
function readFault(): { kind: "throw" | "reload" | "hold"; chunk: number } | null {
  try {
    const m = /^(throw|reload|hold):(\d+)$/.exec(localStorage.getItem("liftgram.e2e.importFault") ?? "");
    return m ? { kind: m[1] as "throw" | "reload" | "hold", chunk: Number(m[2]) } : null;
  } catch {
    return null;
  }
}

function defaultRow(m: ExerciseMatch): RowState {
  if (m.status === "auto" && m.exerciseId)
    return {
      decision: { kind: "existing", exerciseId: m.exerciseId, variant: m.variant, remember: false },
      confirmed: true,
    };
  if (m.status === "review" && m.exerciseId)
    return { decision: { kind: "existing", exerciseId: m.exerciseId, remember: false }, confirmed: false };
  return {
    decision: { kind: "custom", nameKo: m.sourceName, equipment: m.equipmentHint ?? undefined },
    confirmed: false,
  };
}

function localDateLabel(local: string | null): string {
  if (!local) return "";
  const [y, m, d] = local.slice(0, 10).split("-");
  return t("import.dateShort", { y, m, d });
}

// ── 나가기 막기 ─────────────────────────────────────────────────────────────
type GuardMode = "off" | "confirm" | "block";
const GUARD_FLAG = "liftgramImportGuard";

/**
 * 링크(셸의 LinkInterceptor 보다 먼저 — 잡기 단계) · 뒤로 가기(같은 주소의 보초 기록 하나) · 새로고침·닫기(beforeunload)를 막는다.
 * confirm 이면 ask(계속할 함수)를 부르고, block 이면 아무 일도 일어나지 않는다.
 */
function useLeaveGuard(mode: GuardMode, ask: (proceed: () => void) => void): { disarm: () => void } {
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const askRef = useRef(ask);
  askRef.current = ask;
  const disarmed = useRef(false);
  const armed = mode !== "off";

  useEffect(() => {
    if (!armed) return;
    disarmed.current = false;
    const onClick = (e: MouseEvent) => {
      if (
        disarmed.current ||
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a?.hasAttribute("href")) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (
        url.origin === location.origin &&
        url.pathname === location.pathname &&
        url.search === location.search
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      if (modeRef.current !== "confirm") return;
      askRef.current(() => {
        disarmed.current = true;
        if (url.origin === location.origin) navigate(url.pathname + url.search + url.hash);
        else location.href = url.href;
      });
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (disarmed.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const pushSentinel = () =>
      history.pushState({ ...(history.state ?? {}), [GUARD_FLAG]: true }, "", location.href);
    const onPop = () => {
      if (disarmed.current) return;
      pushSentinel(); // 뒤로 가기를 되돌린다 — 화면은 그대로
      if (modeRef.current !== "confirm") return;
      askRef.current(() => {
        disarmed.current = true;
        history.go(-2); // 보초 + 이 화면을 건너 앞 화면으로
      });
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    if (!(history.state as Record<string, unknown> | null)?.[GUARD_FLAG]) pushSentinel();
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPop);
      // 막을 일이 끝났으면 보초 기록을 걷는다(뒤로 가기 한 번이 헛돌지 않게). 나가는 중이면 그대로 둔다.
      if (!disarmed.current && (history.state as Record<string, unknown> | null)?.[GUARD_FLAG])
        history.back();
    };
  }, [armed]);

  return {
    disarm: useCallback(() => {
      disarmed.current = true;
    }, []),
  };
}

// ── 진행 막대 ───────────────────────────────────────────────────────────────
function ProgressBar({ ratio, label, testId }: { ratio: number | null; label: string; testId?: string }) {
  const pct = ratio == null ? null : Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return (
    <div className="mt-[var(--spacing-sm)]">
      <AppText
        variant="caption"
        color="textMuted"
        className="block"
        data-testid={testId ? `${testId}-label` : undefined}
      >
        {label}
      </AppText>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        data-testid={testId}
        className="mt-[6px] h-2 w-full overflow-hidden rounded-full bg-(--color-surface-alt)"
      >
        <div
          className={`h-full rounded-full bg-(--color-brand) ${pct == null ? "w-1/3 animate-pulse" : ""}`}
          style={pct == null ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function stageLabel(p: ImportTaskProgress | null): string {
  return t(`import.stage.${p?.stage ?? "parse"}` as TransKey);
}

function writeLabel(p: ImportProgress | null): string {
  if (!p || p.phase === "sync") return t("import.progress.sync");
  if (p.phase === "finishing") return t("import.progress.finishing");
  return t("import.progress.writing", { done: p.chunk, total: p.chunks });
}

export default function ImportFlow() {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [ctx, setCtx] = useState<ImportContext | null>(null);
  const [ready, setReady] = useState<ImportReadiness | null>(null);
  const [step, setStep] = useState<Step>("file");
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [fileLabel, setFileLabel] = useState("");
  const [unit, setUnit] = useState<ImportWeightUnit | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [taskProgress, setTaskProgress] = useState<ImportTaskProgress | null>(null);
  const [writeProgress, setWriteProgress] = useState<ImportProgress | null>(null);
  const [planning, setPlanning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<{
    key: TransKey;
    vars?: Record<string, string | number>;
    reload?: boolean;
  } | null>(null);
  const [via, setVia] = useState<ImportTaskVia | null>(null);
  const [leaveAsk, setLeaveAsk] = useState<(() => void) | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [draftKept, setDraftKept] = useState(false);
  const textRef = useRef<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 재료: 저장소 · 계획 재료 · 가져오기 전 조건
  const refreshReadiness = useCallback(async (r: Repo) => {
    setReady(await r.checkImportReadiness({ online: navigator.onLine }));
  }, []);
  useEffect(() => {
    let cancelled = false;
    void import("@app/core/data/importRepository").then(async (r) => {
      if (cancelled) return;
      setRepo(r);
      await refreshReadiness(r);
      const c = await r.loadImportContext();
      if (!cancelled) setCtx(c);
    });
    setDraftKept(readDraft() != null);
    return () => {
      cancelled = true;
      disposeImportWorker();
    };
  }, [refreshReadiness]);
  useEffect(() => {
    if (!repo) return;
    const on = () => void refreshReadiness(repo);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, [repo, refreshReadiness]);

  // 임시 저장 — 확인·맞추기 단계에서 바뀔 때마다
  useEffect(() => {
    if (!analysis || (step !== "summary" && step !== "match")) return;
    writeDraft({ v: 1, hash: analysis.fileHash, unit, rows });
  }, [analysis, unit, rows, step]);

  const guardMode: GuardMode =
    step === "progress" ? "block" : step === "summary" || step === "match" ? "confirm" : "off";
  const { disarm } = useLeaveGuard(guardMode, (proceed) =>
    setLeaveAsk(() => () => {
      clearDraft();
      proceed();
    }),
  );

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of ctx?.exercises ?? []) m.set(e.id, e.nameKo);
    return (id: string) => m.get(id) ?? id;
  }, [ctx]);

  // ── 파일 → 분석 ──
  const onFile = async (file: File) => {
    if (!ctx) return;
    setError(null);
    setTaskProgress({ stage: "hash", ratio: 0 });
    try {
      const text = await file.text();
      textRef.current = text;
      const { result, via } = await runImportTask({ kind: "analyze", text, ctx }, setTaskProgress);
      setVia(via);
      if (result.kind !== "analyze") return;
      if (result.fatal) {
        setError({
          key: `import.fatal.${result.fatal}` as TransKey,
          vars: { columns: result.missingColumns.join(", ") },
        });
        return;
      }
      const draft = readDraft();
      const restored = draft && draft.hash === result.fileHash ? draft : null;
      const next: Record<string, RowState> = {};
      for (const m of result.matches) next[m.sourceName] = restored?.rows[m.sourceName] ?? defaultRow(m);
      setRows(next);
      setUnit(result.fileWeightUnit ?? restored?.unit ?? null);
      setFileLabel(importFileLabel(file.name));
      setAnalysis(result);
      setDraftKept(false);
      setStep("summary");
    } catch (e) {
      setError({ key: `import.fatal.${e instanceof ImportTaskError ? e.code : "unreadable"}` as TransKey });
    } finally {
      setTaskProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // ── 가져오기 ──
  const start = async () => {
    if (!repo || !ctx || !analysis) return;
    setError(null);
    setPlanning(true);
    setStep("progress");
    setWriteProgress(null);
    setTaskProgress({ stage: "parse", ratio: 0 });
    let plan: import("@app/core/domain/import/index").ImportPlan;
    try {
      // 별칭(remember)은 사람이 고르거나 확인한 줄만 — 자동·손대지 않은 「확인 필요」는 기계 값이라 남기지 않는다(ADR-042 개정)
      const decisions: [string, ExerciseDecision][] = Object.entries(rows).map(([name, r]) => [
        name,
        r.decision,
      ]);
      const { result, via } = await runImportTask(
        { kind: "plan", text: textRef.current, ctx, decisions, weightUnit: unit, fileLabel, now: Date.now() },
        setTaskProgress,
      );
      setVia(via);
      if (result.kind !== "plan") throw new ImportTaskError("failed");
      plan = result.plan;
    } catch (e) {
      setPlanning(false);
      setTaskProgress(null);
      setStep("match");
      setError({ key: `import.fatal.${e instanceof ImportTaskError ? e.code : "failed"}` as TransKey });
      return;
    }
    setPlanning(false);
    setTaskProgress(null);
    const fault = readFault();
    try {
      const r = await repo.importPlan(
        plan,
        (p) => {
          setWriteProgress(p);
          if (fault?.kind === "hold" && p.phase === "writing" && p.chunk === fault.chunk) {
            // 시험: 끝나지 않는 write 하나로 다음 묶음을 세운다 — 진행 화면이 그대로 남는다(닫기 막힘 확인 · 캡처)
            void import("@app/core/db").then(({ database }) =>
              database.write(() => new Promise<void>(() => {})),
            );
          }
          if (fault?.kind === "reload" && p.phase === "writing" && p.chunk === fault.chunk) {
            // 시험: 쓰는 도중 강제 새로고침(탭이 닫힌 것과 같게) — 끝나지 않는 write 하나로 다음 묶음을 세워 두고,
            // 지금까지 쓴 것(status='writing' 묶음 포함)을 디스크에 내린 뒤 새로고침한다. 부팅 정리가 지워야 한다.
            disarm();
            void import("@app/core/db")
              .then(({ database }) => {
                void database.write(() => new Promise<void>(() => {}));
                return flushLocalDb();
              })
              .then(() => location.reload());
          }
        },
        {
          online: navigator.onLine,
          flush: async () => {
            await flushLocalDb();
          },
          faultInjection: fault?.kind === "throw" ? { throwAfterChunk: fault.chunk } : undefined,
        },
      );
      setResult(r);
      clearDraft();
      setStep("done");
      void repo.loadImportContext().then(setCtx);
    } catch (e) {
      const reason = (e as { reason?: string } | null)?.reason ?? "write_failed";
      setError({ key: `import.blocked.${reason}` as TransKey, reload: reason === "write_failed_reload" });
      if (reason === "write_failed_reload") {
        setStep("done");
        setResult(null);
      } else {
        setStep(reason === "active_workout" || reason === "offline_with_undone" ? "summary" : "match");
      }
      void refreshReadiness(repo);
    }
  };

  const setRow = (name: string, r: RowState) => setRows((prev) => ({ ...prev, [name]: r }));
  const blockedKey =
    ready && !ready.ok && ready.reason ? (`import.blocked.${ready.reason}` as TransKey) : null;

  const steps: Step[] = ["file", "summary", "match", "progress", "done"];
  const stepName: Record<Step, TransKey> = {
    file: "import.stepFile",
    summary: "import.stepSummary",
    match: "import.stepMatch",
    progress: "import.stepProgress",
    done: "import.stepDone",
  };

  // 맞추기 집계
  const matches = analysis?.matches ?? [];
  const review = matches.filter((m) => m.status === "review");
  const none = matches.filter((m) => m.status === "none");
  const auto = matches.filter((m) => m.status === "auto");

  const sampleLine = (() => {
    const s = analysis?.sample;
    if (!s) return null;
    const r = rows[s.sourceName];
    const name = r?.decision.kind === "existing" ? nameOf(r.decision.exerciseId) : s.sourceName;
    return t("import.sample", { exercise: name, weight: s.weight, unit: unit ?? "", reps: s.reps });
  })();

  const renderRow = (m: ExerciseMatch) => {
    const r = rows[m.sourceName];
    if (!r) return null;
    const d = r.decision;
    const target =
      d.kind === "existing"
        ? t("import.match.to", { name: nameOf(d.exerciseId) })
        : d.kind === "custom"
          ? t("import.match.toCustom", { name: d.nameKo || m.sourceName })
          : t("import.match.toSkip");
    // 빨강은 주 행동(가져오기 버튼) 전용 — 확인 필요·못 맞춤은 주황 한 가지(화면 정리 공용 규칙)
    const tone = m.status === "auto" ? "muted" : "warning";
    return (
      <li
        key={m.sourceName}
        data-testid="import-match-row"
        data-status={m.status}
        data-decision={d.kind}
        className="border-(--color-line) border-t py-[var(--spacing-md)] first:border-t-0"
      >
        <div className="flex items-start justify-between gap-[var(--spacing-sm)]">
          <AppText
            variant="body"
            className="min-w-0 break-words font-semibold"
            data-testid="import-match-source"
          >
            {m.sourceName}
          </AppText>
          <span className="shrink-0">
            <Tag
              tone={r.confirmed && m.status !== "auto" ? "muted" : tone}
              label={
                r.confirmed && m.status !== "auto"
                  ? t("import.match.confirmed")
                  : t(`import.match.${m.status}` as TransKey)
              }
            />
          </span>
        </div>
        <AppText
          variant="caption"
          color="textMuted"
          className="mt-[2px] block break-words"
          data-testid="import-match-target"
        >
          {target}
        </AppText>
        {m.status === "review" && m.candidates.length > 1 ? (
          <div className="mt-[var(--spacing-sm)] flex flex-wrap gap-[6px]">
            {m.candidates.map((id) => (
              <QuietChip
                key={id}
                compact
                label={nameOf(id)}
                active={d.kind === "existing" && d.exerciseId === id}
                onPress={() =>
                  setRow(m.sourceName, {
                    decision: { kind: "existing", exerciseId: id, remember: true },
                    confirmed: true,
                  })
                }
                testId="import-match-candidate"
              />
            ))}
          </div>
        ) : null}
        {d.kind === "custom" ? (
          <input
            aria-label={t("import.match.customName")}
            data-testid="import-match-custom-name"
            value={d.nameKo ?? ""}
            maxLength={60}
            onChange={(e) =>
              setRow(m.sourceName, { decision: { ...d, nameKo: e.target.value }, confirmed: true })
            }
            className="mt-[var(--spacing-sm)] w-full rounded-[var(--radius-sm)] border border-(--color-line-strong) bg-(--color-card) px-[var(--spacing-md)] py-[var(--spacing-sm)] text-[length:var(--text-sm)] text-(--color-ink) outline-none focus:border-(--color-brand)"
          />
        ) : null}
        {/* 동작 묶음 — 줄이 꺾여도 끝에 「·」가 남지 않게 점 없이 간격으로 잇는다 */}
        <div className="mt-[var(--spacing-xs)] flex flex-wrap gap-x-[var(--spacing-md)]">
          {m.status === "review" && !r.confirmed && d.kind === "existing" ? (
            <MetaAction
              key="ok"
              onPress={() => setRow(m.sourceName, { decision: { ...d, remember: true }, confirmed: true })}
              testId="import-match-confirm"
            >
              {t("import.match.confirm")}
            </MetaAction>
          ) : null}
          <MetaAction key="pick" onPress={() => setPicking(m.sourceName)} testId="import-match-pick">
            {t("import.match.pick")}
          </MetaAction>
          {d.kind !== "custom" ? (
            <MetaAction
              key="mine"
              onPress={() =>
                setRow(m.sourceName, {
                  decision: { kind: "custom", nameKo: m.sourceName, equipment: m.equipmentHint ?? undefined },
                  confirmed: true,
                })
              }
              testId="import-match-create"
            >
              {t("import.match.createMine")}
            </MetaAction>
          ) : null}
          {d.kind !== "skip" ? (
            <MetaAction
              key="skip"
              onPress={() => setRow(m.sourceName, { decision: { kind: "skip" }, confirmed: true })}
              testId="import-match-skip"
            >
              {t("import.match.skip")}
            </MetaAction>
          ) : null}
        </div>
      </li>
    );
  };

  const idx = steps.indexOf(step);
  return (
    <div
      className="flex flex-1 flex-col"
      data-testid="import-flow"
      data-step={step}
      data-import-via={via ?? undefined}
    >
      <SubAppBar
        title={t("import.entry")}
        fallbackHref="/account"
        onBack={
          guardMode === "off"
            ? undefined
            : () => {
                if (guardMode === "block") return;
                setLeaveAsk(() => () => {
                  clearDraft();
                  disarm();
                  navigate("/account");
                });
              }
        }
      />
      {/* 맞추기 단계는 바닥 막대가 끝을 맡는다 — 아래 여백을 두지 않는다(탭바와 막대 사이 빈 띠) */}
      <div
        className={`flex flex-1 flex-col px-[var(--spacing-lg)] pt-[var(--spacing-md)] ${step === "match" ? "" : "pb-[var(--spacing-xl)]"}`}
      >
        <AppText
          variant="caption"
          color="textMuted"
          className="mb-[var(--spacing-sm)] block"
          data-testid="import-step"
        >
          {t("import.stepOf", { n: idx + 1, total: steps.length, name: t(stepName[step]) })}
        </AppText>

        {blockedKey && (step === "file" || step === "summary" || step === "match") ? (
          <Card className="mb-[var(--spacing-md)]" data-testid="import-blocked">
            <AppText variant="body" color="warning" role="status">
              {t(blockedKey)}
            </AppText>
          </Card>
        ) : null}

        {error ? (
          <Card className="mb-[var(--spacing-md)]" data-testid="import-error">
            <AppText variant="body" color="danger" role="alert">
              {t(error.key, error.vars)}
            </AppText>
            {error.reload ? (
              <div className="mt-[var(--spacing-md)]">
                <Button
                  title={t("import.reload")}
                  variant="secondary"
                  icon="refresh"
                  onPress={() => location.reload()}
                  testId="btn-import-reload"
                />
              </div>
            ) : null}
          </Card>
        ) : null}

        {step === "file" ? (
          <Card data-testid="import-step-file">
            <AppText variant="caption" color="textMuted" className="block">
              {t("import.fileHint")}
            </AppText>
            {draftKept ? (
              <AppText
                variant="caption"
                color="textMuted"
                className="mt-[var(--spacing-sm)] block"
                data-testid="import-draft-kept"
              >
                {t("import.draftKept")}
              </AppText>
            ) : null}
            <div className="mt-[var(--spacing-md)]">
              <Button
                title={t("import.pickFile")}
                icon="folder-open"
                variant="secondary"
                loading={taskProgress != null}
                disabled={!ctx || !ready?.ok}
                onPress={() => inputRef.current?.click()}
                testId="btn-import-pick"
              />
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              data-testid="import-file-input"
              disabled={!ctx || !ready?.ok}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            {taskProgress ? (
              <ProgressBar
                ratio={taskProgress.ratio}
                label={stageLabel(taskProgress)}
                testId="import-analyze-progress"
              />
            ) : null}
          </Card>
        ) : null}

        {step === "summary" && analysis ? (
          <>
            <Card className="mb-[var(--spacing-md)]" data-testid="import-step-summary">
              <AppText variant="heading" className="block" data-testid="import-summary-head">
                {t("import.summaryHead", {
                  source: importSourceLabel(analysis.source),
                  workouts: analysis.workouts.toLocaleString(),
                  sets: analysis.sets.toLocaleString(),
                })}
              </AppText>
              <MetaLine className="mt-[2px]">
                <span key="range">
                  {t("import.summaryRange", {
                    from: localDateLabel(analysis.firstLocal),
                    to: localDateLabel(analysis.lastLocal),
                  })}
                </span>
                {fileLabel ? <span key="label">{fileLabel}</span> : null}
              </MetaLine>
              {analysis.issueCount > 0 ? (
                <div className="mt-[var(--spacing-sm)]" data-testid="import-issues">
                  <FoldToggle
                    open={issuesOpen}
                    onToggle={() => setIssuesOpen(!issuesOpen)}
                    label={t("import.issues", { count: analysis.issueCount })}
                    controls="import-issue-list"
                    testId="import-issues-toggle"
                  />
                  {issuesOpen ? (
                    <ul id="import-issue-list" className="mt-[2px]">
                      {analysis.issues.map((i) => (
                        <li key={`${i.line}-${i.reason}-${i.column ?? ""}`}>
                          <AppText variant="caption" color="textMuted">
                            {t(`import.issue.${i.reason}` as TransKey, {
                              line: i.line,
                              column: i.column ?? "",
                            })}
                          </AppText>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </Card>
            <Card className="mb-[var(--spacing-md)]" data-testid="import-unit">
              {analysis.fileWeightUnit ? (
                <AppText variant="body" color="textMuted">
                  {t("import.unitFromFile", { unit: analysis.fileWeightUnit })}
                </AppText>
              ) : (
                <>
                  <AppText variant="body" className="block">
                    {t("import.unitAsk")}
                  </AppText>
                  <Segmented<ImportWeightUnit | "">
                    className="mt-[var(--spacing-sm)]"
                    testId="import-unit-select"
                    value={unit ?? ""}
                    onChange={(v) => v && setUnit(v)}
                    items={[
                      { value: "kg", label: "kg", testId: "import-unit-kg" },
                      { value: "lb", label: "lb", testId: "import-unit-lb" },
                    ]}
                  />
                </>
              )}
              {sampleLine && unit ? (
                <div className="mt-[var(--spacing-md)]">
                  <AppText variant="body" className="block font-semibold" data-testid="import-sample">
                    {sampleLine}
                  </AppText>
                  <AppText variant="caption" color="textMuted" className="block">
                    {t("import.sampleCheck")}
                  </AppText>
                </div>
              ) : null}
            </Card>
            <Button
              title={t("import.toMatch")}
              disabled={!unit || !ready?.ok}
              onPress={() => {
                setError(null);
                setStep("match");
              }}
              testId="btn-import-to-match"
            />
          </>
        ) : null}

        {step === "match" && analysis ? (
          <>
            <AppText
              variant="caption"
              color="textMuted"
              className="mb-[var(--spacing-sm)] block"
              data-testid="import-match-head"
            >
              {t("import.match.head", {
                count: matches.length,
                auto: auto.length,
                review: review.length,
                none: none.length,
              })}
            </AppText>
            {review.length + none.length > 0 ? (
              <Card className="mb-[var(--spacing-md)]" data-testid="import-match-attention">
                <ul>{[...review, ...none].map(renderRow)}</ul>
              </Card>
            ) : null}
            {auto.length > 0 ? (
              <div className="mb-[var(--spacing-md)] px-[var(--spacing-xs)]">
                <FoldToggle
                  open={autoOpen}
                  onToggle={() => setAutoOpen(!autoOpen)}
                  label={t("import.match.groupAuto", { count: auto.length })}
                  controls="import-match-auto"
                  testId="import-match-auto-toggle"
                />
                {autoOpen ? (
                  <Card
                    id="import-match-auto"
                    className="mt-[var(--spacing-xs)]"
                    data-testid="import-match-auto"
                  >
                    <ul>{auto.map(renderRow)}</ul>
                  </Card>
                ) : null}
              </div>
            ) : null}
            {/* 탭바 위에 붙는 바닥 막대(루틴 편집·댓글과 같은 자리 규칙) */}
            <div className="sticky bottom-[calc(56px+var(--shell-workout-bar,0px)+env(safe-area-inset-bottom))] z-20 -mx-[var(--spacing-lg)] mt-auto border-(--color-line) border-t bg-(--color-surface) px-[var(--spacing-lg)] py-[var(--spacing-md)] lg:bottom-[var(--shell-workout-bar,0px)]">
              <Button
                title={t("import.start", { workouts: analysis.workouts.toLocaleString() })}
                disabled={!ready?.ok}
                onPress={() => void start()}
                testId="btn-import-start"
              />
            </div>
          </>
        ) : null}

        {step === "progress" ? (
          <Card data-testid="import-step-progress" aria-busy="true">
            <AppText variant="heading" className="block" role="status">
              {t("import.progress.head")}
            </AppText>
            {planning ? (
              <ProgressBar
                ratio={taskProgress?.ratio ?? 0}
                label={stageLabel(taskProgress)}
                testId="import-plan-progress"
              />
            ) : (
              <ProgressBar
                ratio={
                  writeProgress && writeProgress.chunks > 0
                    ? writeProgress.chunk / writeProgress.chunks
                    : null
                }
                label={writeLabel(writeProgress)}
                testId="import-write-progress"
              />
            )}
          </Card>
        ) : null}

        {step === "done" && result ? (
          <Card data-testid="import-step-done">
            <AppText variant="heading" className="block">
              {result.workouts > 0 ? t("import.done") : t("import.nothingNew")}
            </AppText>
            {result.workouts > 0 ? (
              <AppText variant="body" className="mt-[2px] block" data-testid="import-done-summary">
                {t("import.summary", {
                  workouts: result.workouts.toLocaleString(),
                  sets: result.sets.toLocaleString(),
                })}
              </AppText>
            ) : null}
            <SkippedLines result={result} />
            {ready?.loggedIn && result.workouts > 0 ? (
              <AppText
                variant="caption"
                color="textMuted"
                className="mt-[var(--spacing-sm)] block"
                data-testid="import-uploading"
              >
                {t("import.doneUploading")}
              </AppText>
            ) : null}
            <div className="mt-[var(--spacing-md)] flex flex-col gap-[var(--spacing-sm)]">
              <Button
                title={t("import.goHistory")}
                onPress={() => navigate("/history")}
                testId="btn-import-go-history"
              />
              <Button
                title={t("import.goStats")}
                variant="secondary"
                onPress={() => navigate("/stats")}
                testId="btn-import-go-stats"
              />
              <Button
                title={t("import.again")}
                variant="quiet"
                onPress={() => {
                  setResult(null);
                  setAnalysis(null);
                  setRows({});
                  setError(null);
                  setStep("file");
                  if (repo) void refreshReadiness(repo);
                }}
                testId="btn-import-again"
              />
            </div>
          </Card>
        ) : null}
      </div>

      {picking ? (
        <Overlay onClose={() => setPicking(null)} placement="bottom" testId="import-picker-sheet">
          <ExercisePicker
            bare
            onClose={() => setPicking(null)}
            onPick={(exerciseId) => {
              setRow(picking, {
                decision: { kind: "existing", exerciseId, remember: true },
                confirmed: true,
              });
              setPicking(null);
            }}
          />
        </Overlay>
      ) : null}

      {leaveAsk ? (
        <ConfirmDialog
          title={t("import.leaveTitle")}
          message={t("import.leaveConfirm")}
          confirmLabel={t("import.leave")}
          destructive
          onConfirm={() => {
            const go = leaveAsk;
            setLeaveAsk(null);
            go();
          }}
          onCancel={() => setLeaveAsk(null)}
          testId="import-leave-dialog"
        />
      ) : null}
    </div>
  );
}

function SkippedLines({ result }: { result: ImportResult }) {
  const counts = new Map<string, number>();
  for (const s of result.skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  if (counts.size === 0) return null;
  return (
    <div className="mt-[var(--spacing-xs)]" data-testid="import-skipped">
      {[...counts].map(([reason, count]) => (
        <AppText key={reason} variant="caption" color="textMuted" className="block" data-reason={reason}>
          {t(`import.skip.${reason}` as TransKey, { count })}
        </AppText>
      ))}
    </div>
  );
}
