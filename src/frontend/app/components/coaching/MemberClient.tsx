"use client";
// 코칭 회원 화면(SPEC-050 P2 · /coaching/m/[memberId]) — 코치가 담당 회원의 기록·분석·루틴을 본다.
//
// ── 무엇을 어디에 두나 ──────────────────────────────────────────────────────
//   · 머리 = 청록 띠 「○○님 기록 · 코칭 중」 + 「나가기」(→ /coaching). 내 기록 화면과 헷갈리지 않게 띠 색이 다르다.
//   · 탭 기록·분석·루틴(?tab=records|stats|routines) — 주소만 바꾸고(replaceState) 다시 그리지 않는다.
//   · 범위는 ListGrants 의 활성 연결 scope 로 판단한다(logView → 기록·분석 · routineEdit → 루틴 · bodyView → 체중 카드).
//     서버도 같은 판단을 한다 — 여기서 숨기는 것은 「눌러도 막힐 것」을 그리지 않으려는 것뿐이다.
//
// ── 메모리만(S-20) ──────────────────────────────────────────────────────────
//   GetMemberRecords 응답과 계산 결과는 이 컴포넌트 상태에만 둔다. Watermelon·localStorage·IndexedDB 어디에도 쓰지 않는다.
//   이 기기에서 읽는 것은 종목 이름(카탈로그·내 표시 이름)뿐이다(읽기만).
//
// ── 기록 탭의 기간 ──────────────────────────────────────────────────────────
//   서버는 요청 기간의 두 배 [start − (end − start), end) 를 내준다(직전 비교용 · coaching.proto). 그래서 [from, to) 를 받으려면
//   start = to − (to − from)/2 로 묻는다. 최근 3개월부터, 「더 보기」로 그 앞 3개월씩.
//   지난 기록을 열지 않았으면 served_start 가 동의 시각에서 멈춘다 → 그 아래는 「연결한 날(○월 ○일) 뒤 기록만 보여요」.
//
// ── 깜빡임 없음 ─────────────────────────────────────────────────────────────
//   연결을 다 읽기 전에는 판단하지 않는다(loading) — 「코칭이 끝났어요」·「기록 보기를 꺼 두었어요」가 잠깐 비치지 않게.
import { errorText } from "@/lib/errorText";
import type { CoachComment, Grant, Peer } from "@app/contracts";
import { GrantStatus, Side } from "@app/contracts";
import type { WeightUnit } from "@app/core";
import { type BodyweightLogLike, sortBodyweightLogs } from "@app/core/domain/bodyweight";
import type { SummaryPreset } from "@app/core/domain/periodSummary";
import { type ActualSetLike, type PlanVsActual, planVsActual } from "@app/core/domain/planVsActual"; // 처방 대 실제(P4)
import { displayWeight, formatWeight } from "@app/core/domain/units";
import { Code, ConnectError } from "@connectrpc/connect";
import { type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { lang, t, type TransKey } from "@/lib/i18n";
import { coachingClient } from "@/lib/coachingClient";
// [원본] import { scopeOf } from "@/lib/coaching";
import { auditLines, scopeOf } from "@/lib/coaching";
import { useAuth } from "../AuthProvider";
import { useWeightUnit } from "../feed/useWeightUnit";
import { MemberReportBody } from "../summary/MemberReportDialog";
import { MemberRoutinesBody } from "./CoachingClient";
import { SentRoutinesSection } from "./SentRoutines"; // 보낸 루틴(SPEC-050 P3b)
import { CoachCommentBox } from "./CoachComments"; // 코치 코멘트(SPEC-050 P4)
import { PlanActualTable } from "./PlanActual"; // 처방 대 실제(SPEC-050 P4)
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { LogoSpinner } from "../ui/LogoSpinner";
import { AppText, EmptyState, SectionHeader } from "../ui/primitives";
import { Skeleton } from "../ui/Skeleton";
import { segCellClass } from "../ui/rows";

export type MemberTab = "records" | "stats" | "routines";

const TAB_KEY: Record<MemberTab, TransKey> = {
  records: "coaching.member.tabRecords",
  stats: "coaching.member.tabStats",
  routines: "coaching.member.tabRoutines",
};

const DAY = 86_400_000;
/** 기록 탭 한 번에 읽는 길이(3개월) — 짝수 ms 라 반으로 나눠 물어도 경계가 맞는다 */
const WINDOW_MS = 90 * DAY;

type GrantState =
  | { kind: "loading" }
  | { kind: "ok"; grant: Grant; peer: Peer }
  | { kind: "ended" }
  | { kind: "login" }
  | { kind: "error"; message: string };

export default function MemberClient({ memberId, initialTab }: { memberId: string; initialTab: MemberTab }) {
  const { user, loading: authLoading } = useAuth();
  const unit = useWeightUnit() as WeightUnit;
  const [state, setState] = useState<GrantState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<MemberTab>(initialTab);
  const userId = user?.id;
  // PermissionDenied 뒤 다시 읽기(코드 리뷰 M-2) — 읽는 중으로 깜빡이지 않고(silent) 탭 내용만 새로 그린다(panelKey)
  const recheckRef = useRef(false);
  const [panelKey, setPanelKey] = useState(0);
  const uid = useId();

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 는 다시 시도 방아쇠다
  useEffect(() => {
    if (authLoading) return;
    if (!userId) {
      setState({ kind: "login" });
      return;
    }
    let cancelled = false;
    const silent = recheckRef.current;
    recheckRef.current = false;
    if (!silent) setState({ kind: "loading" });
    coachingClient()
      .listGrants({})
      .then((r) => {
        if (cancelled) return;
        const g = r.grants.find(
          (x) => x.peer?.id === memberId && x.roleOfMe === Side.TRAINER && x.status === GrantStatus.ACTIVE,
        );
        // [원본] setState(g?.peer ? { kind: "ok", grant: g, peer: g.peer } : { kind: "ended" });
        // [개선] 다시 읽기(silent)인데 범위가 그대로면 — 서버는 막는데 연결은 허락한다고 한다 → 끝남으로 단정하지 않고 오류(다시 시도).
        //   그대로 「ok」로 두면 탭이 다시 읽고 또 막혀 끝없이 돈다.
        setState((prev) => {
          if (!g?.peer) return { kind: "ended" };
          if (
            silent &&
            prev.kind === "ok" &&
            JSON.stringify(scopeOf(prev.grant.scope)) === JSON.stringify(scopeOf(g.scope))
          )
            return { kind: "error", message: t("common.error") };
          return { kind: "ok", grant: g, peer: g.peer };
        });
        if (silent) setPanelKey((n) => n + 1);
      })
      .catch((e) => {
        if (!cancelled) setState({ kind: "error", message: errorText(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, memberId, attempt]);

  // [원본] const ended = useCallback(() => setState({ kind: "ended" }), []);
  // [개선] PermissionDenied 를 곧바로 「코칭이 끝났어요」로 확정하지 않는다 — 연결을 다시 읽어(attempt 증가)
  //   해지(끝남)와 범위 끔(「회원이 기록 보기를 꺼 두었어요」 등)을 가른다(코드 리뷰 M-2).
  const ended = useCallback(() => {
    recheckRef.current = true;
    setAttempt((n) => n + 1);
  }, []);

  const tabs = Object.keys(TAB_KEY) as MemberTab[];
  const tabId = (k: MemberTab) => `${uid}-tab-${k}`;
  const panelId = `${uid}-panel`;

  function pick(next: MemberTab) {
    setTab(next);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("tab", next);
      window.history.replaceState(window.history.state, "", `${u.pathname}${u.search}`);
    } catch {
      // 주소를 못 바꿔도 탭은 바뀐다
    }
  }

  if (state.kind !== "ok") {
    return (
      <div className="flex flex-1 flex-col" data-testid="member-screen" data-state={state.kind}>
        <Band name={null} />
        <div className="flex-1 p-[var(--spacing-lg)]">
          {state.kind === "loading" ? (
            <Spinner testId="member-loading" />
          ) : state.kind === "login" ? (
            <EmptyState
              icon="lock-closed-outline"
              title={t("coaching.loginRequiredTitle")}
              message={t("coaching.loginRequiredMessage")}
            />
          ) : state.kind === "ended" ? (
            <Ended />
          ) : (
            <ErrorRetry message={state.message} onRetry={() => setAttempt((n) => n + 1)} />
          )}
        </div>
      </div>
    );
  }

  const scope = scopeOf(state.grant.scope);
  const name = state.peer.displayName || "?";
  return (
    <div className="flex flex-1 flex-col" data-testid="member-screen" data-state="ok">
      <Band name={name} />
      {/* [원본] 탭 id·aria-controls·화살표 이동이 없었다 — 탭 목록 규칙(roving tabindex)대로(코드 리뷰 L-5) */}
      <div
        role="tablist"
        aria-label={t("coaching.member.title")}
        data-testid="member-tabs"
        className="flex border-(--color-line) border-b bg-(--color-surface)"
        onKeyDown={(e) => {
          const next = rovingNext(e, tabs, tab);
          if (!next) return;
          pick(next);
          document.getElementById(tabId(next))?.focus();
        }}
      >
        {tabs.map((k) => {
          const on = k === tab;
          return (
            <button
              key={k}
              id={tabId(k)}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={on ? panelId : undefined}
              tabIndex={on ? 0 : -1}
              data-testid={`member-tab-${k}`}
              onClick={() => pick(k)}
              className={`min-h-11 min-w-0 flex-1 border-b-2 px-[var(--spacing-sm)] text-[length:var(--text-sm)] ${
                on
                  ? "border-(--color-coaching) font-semibold text-(--color-coaching-ink)"
                  : "border-transparent text-(--color-ink2)"
              }`}
            >
              {t(TAB_KEY[k])}
            </button>
          );
        })}
      </div>

      <div
        key={panelKey}
        id={panelId}
        className="min-w-0 flex-1 p-[var(--spacing-lg)]"
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        data-testid={`member-panel-${tab}`}
      >
        {tab === "routines" ? (
          scope.routineEdit ? (
            // [원본] <MemberRoutinesBody peer={state.peer} /> — 막히면 빈 목록으로 덮였다(코드 리뷰 M-1)
            // [원본] <MemberRoutinesBody peer={state.peer} onEnded={ended} />
            // [개선] 위에 「보낸 루틴」(코치가 짠 것) · 아래 「회원이 만든 루틴」(처방 고치기 · SPEC-050 P3b)
            <>
              <SentRoutinesSection memberId={memberId} onEnded={ended} />
              <SectionHeader title={t("coaching.member.memberRoutinesTitle")} />
              <MemberRoutinesBody peer={state.peer} onEnded={ended} />
              {/* 연결 이력 — 코칭 화면 ⋯ 「이력」을 옮겼다(SPEC-059 · 사용자 결정 3a: 루틴 탭 맨 아래) */}
              <ConnectionHistory grantId={state.grant.id} onEnded={ended} />
            </>
          ) : (
            // [원본] <Off testId="member-routine-off" text={t("coaching.member.routineOff")} />
            // [개선] 꺼져 있어도 이 기기 초안은 보인다 — 열어서 지울 수 있게(보내기는 막힘 · SPEC-050 P3b 리뷰 M-4)
            <>
              <Off testId="member-routine-off" text={t("coaching.member.routineOff")} />
              <SentRoutinesSection memberId={memberId} localOnly />
              {/* 루틴 편집이 꺼져 있어도 이력은 본다(SPEC-059) */}
              <ConnectionHistory grantId={state.grant.id} onEnded={ended} />
            </>
          )
        ) : !scope.logView ? (
          <Off testId="member-log-off" text={t("coaching.member.logOff")} />
        ) : tab === "records" ? (
          <RecordsTab
            memberId={memberId}
            unit={unit}
            consentAt={Number(state.grant.consentAt)}
            onEnded={ended}
          />
        ) : (
          <MemberReportBody
            peer={state.peer}
            unit={unit}
            onEnded={ended}
            periodPicker={(p) => <Period44 {...p} />}
            bodyCard={scope.bodyView ? (body, range) => <BodyCard body={body} range={range} /> : undefined}
          />
        )}
      </div>
    </div>
  );
}

/** 청록 띠 — 이름을 모르는 동안(읽는 중·끝남)은 제목만. */
function Band({ name }: { name: string | null }) {
  return (
    <header
      data-testid="member-band"
      className="sticky top-0 z-30 flex min-h-14 min-w-0 items-center gap-[var(--spacing-sm)] border-(--color-coaching) border-l-4 bg-(--color-coaching-soft) py-[var(--spacing-xs)] pr-[var(--spacing-xs)] pl-[var(--spacing-md)]"
    >
      <h1
        data-testid="member-band-title"
        className="min-w-0 flex-1 truncate font-semibold text-(--color-coaching-ink) text-[length:var(--text-md)]"
      >
        {name ? t("coaching.member.band", { name }) : t("coaching.member.title")}
      </h1>
      <a
        href="/coaching"
        data-testid="member-exit"
        // [원본] className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] px-[var(--spacing-sm)] font-semibold text-(--color-coaching-ink) text-[length:var(--text-sm)]" — 누르는 것 4px(R1a)
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] px-[var(--spacing-sm)] font-semibold text-(--color-coaching-ink) text-[length:var(--text-sm)]"
      >
        {t("coaching.member.exit")}
      </a>
    </header>
  );
}

function Spinner({ testId }: { testId?: string }) {
  return (
    <div className="flex justify-center py-[var(--spacing-xl)]" data-testid={testId}>
      <span role="status" className="inline-flex">
        <LogoSpinner size={32} label={t("common.loading")} />
      </span>
    </div>
  );
}

function Ended() {
  return (
    <div
      data-testid="member-ended"
      className="flex flex-col items-start gap-[var(--spacing-md)] py-[var(--spacing-md)]"
    >
      <AppText variant="body" color="textMuted" className="block">
        {t("coaching.member.ended")}
      </AppText>
      <a
        href="/coaching"
        data-testid="member-to-coaching"
        // [원본] className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] border border-(--color-line) px-[var(--spacing-lg)] font-semibold text-(--color-ink) text-[length:var(--text-sm)]"
        // [개선] Button secondary 와 같은 모양 — 둥근 sm · 누르는 것의 경계 line-strong(SPEC-056 F2·F7)
        className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-(--color-line-strong) px-[var(--spacing-lg)] font-semibold text-(--color-ink) text-[length:var(--text-sm)]"
      >
        {t("coaching.member.toCoaching")}
      </a>
    </div>
  );
}

function ErrorRetry({
  message,
  onRetry,
  testId = "member-error",
}: {
  message: string;
  onRetry: () => void;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-start gap-[var(--spacing-sm)] py-[var(--spacing-md)]"
    >
      <AppText variant="body" color="textMuted" className="block break-words">
        {message}
      </AppText>
      <Button
        title={t("common.retry")}
        variant="secondary"
        fullWidth={false}
        onPress={onRetry}
        testId={`${testId}-retry`}
        className="min-h-11"
      />
    </div>
  );
}

function Off({ text, testId }: { text: string; testId: string }) {
  return (
    <div data-testid={testId} className="py-[var(--spacing-md)]">
      <AppText variant="body" color="textMuted" className="block">
        {text}
      </AppText>
    </div>
  );
}

/** 분석 탭 기간 고르기 — 판의 Segmented(36px) 대신 44px 칸. 표식은 판과 같다(report-period-*). */
function Period44({
  value,
  onChange,
  items,
}: {
  value: SummaryPreset;
  onChange: (v: SummaryPreset) => void;
  items: { value: SummaryPreset; label: string; testId: string }[];
}) {
  const values = items.map((it) => it.value);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      role="tablist"
      // [원본] 이름 없는 tablist · 화살표 이동 없음(코드 리뷰 L-5)
      aria-label={t("coaching.member.period")}
      data-testid="report-period"
      // [원본] className="mb-[var(--spacing-sm)] flex rounded-[10px] bg-(--color-surface-alt) p-[3px]" · [개선] 분절 토글 판은 유지 · 둥근 정도만 토큰(SPEC-056 F2)
      // [원본] className="mb-[var(--spacing-sm)] flex rounded-[var(--radius-lg)] bg-(--color-surface-alt) p-[3px]" — 분할 토글 트랙은 sm(SPEC-057 R1d · REV-132)
      className="mb-[var(--spacing-sm)] flex rounded-[var(--radius-sm)] bg-(--color-surface-alt) p-[3px]"
      onKeyDown={(e) => {
        const next = rovingNext(e, values, value);
        if (!next) return;
        onChange(next);
        const i = values.indexOf(next);
        (ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[i] ?? null)?.focus();
      }}
    >
      {items.map((it) => {
        const on = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            data-testid={it.testId}
            onClick={() => onChange(it.value)}
            // [원본] rounded-[8px] · [개선] 토큰(SPEC-056 F2)
            // [원본] className={`flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-[var(--radius-md)] text-[length:var(--text-sm)] ${ — 누르는 것 4px(R1a)
            // [원본] className={`… rounded-[var(--radius-sm)] … ${on ? "bg-(--seg-on) font-semibold text-(--color-ink) shadow-sm" : "text-(--color-ink2)"}`} — 고른 칸 판 대비 1.12(REV-132)
            // [개선] 분할 토글 칸 하나의 꼴(segCellClass · SPEC-057 R1d) — 고른 칸에 line-strong 테두리
            className={`flex min-h-11 min-w-0 flex-1 items-center justify-center text-[length:var(--text-sm)] ${segCellClass(on)}`}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

/** 탭 목록 화살표 이동 — ←/→ 는 이웃(끝에서 돌아감), Home/End 는 처음·끝. 해당 키가 아니면 null. */
function rovingNext<T>(e: KeyboardEvent, list: readonly T[], cur: T): T | null {
  const i = list.indexOf(cur);
  let j: number;
  if (e.key === "ArrowRight") j = (i + 1) % list.length;
  else if (e.key === "ArrowLeft") j = (i - 1 + list.length) % list.length;
  else if (e.key === "Home") j = 0;
  else if (e.key === "End") j = list.length - 1;
  else return null;
  e.preventDefault();
  return list[j] ?? null;
}

// ── 기록 탭 ────────────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function parse(rows: readonly string[]): Raw[] {
  const out: Raw[] = [];
  for (const s of rows) {
    try {
      const v = JSON.parse(s) as unknown;
      if (v && typeof v === "object" && !Array.isArray(v)) out.push(v as Raw);
    } catch {
      // 깨진 줄은 건너뛴다
    }
  }
  return out;
}

interface SetView {
  id: string;
  label: string;
}
/** 처방 대 실제의 실제 한 줄 — 표가 같은 글자(setLabel)를 보인다 */
type ActualView = ActualSetLike & { label: string };
interface ExerciseView {
  id: string;
  name: string;
  sets: SetView[];
  // 코치가 보낸 루틴으로 한 운동이고 블록에 처방(또는 목표)이 있으면 — 처방 대 실제(SPEC-050 P4)
  plan: PlanVsActual | null;
}
interface WorkoutView {
  id: string;
  /** 코치가 보낸 루틴으로 한 운동(routine_id 가 coach-…) */
  coach: boolean;
  startedAt: number;
  durationSec: number | null;
  volumeKg: number;
  setCount: number;
  exercises: ExerciseView[];
}
interface Page {
  fromMs: number;
  toMs: number;
  workouts: WorkoutView[];
}

function setLabel(r: Raw, unit: WeightUnit): string {
  const kg = num(r.weight_kg) ?? 0;
  const reps = num(r.reps) ?? 0;
  const sec = num(r.duration_sec);
  const m = num(r.distance_m);
  if (kg > 0 && reps > 0) return `${displayWeight(kg, unit)}${unit} × ${reps}`;
  // [원본] if (reps > 0) return t("coaching.member.reps", { count: reps }); — en 「1 reps」
  if (reps > 0) return reps === 1 ? t("coaching.member.repsOne") : t("coaching.member.reps", { count: reps });
  if (sec && sec > 0) return t("coaching.member.seconds", { count: Math.round(sec) });
  if (m && m > 0) return `${Math.round(m)}m`;
  return kg > 0 ? `${displayWeight(kg, unit)}${unit}` : "—";
}

/** 한 기간 응답 → 운동 목록(최근 것이 위) */
async function toWorkouts(
  res: {
    workouts: readonly string[];
    workoutExercises: readonly string[];
    setLogs: readonly string[];
    exercises: readonly string[];
  },
  unit: WeightUnit,
): Promise<WorkoutView[]> {
  const workouts = parse(res.workouts);
  const blocks = parse(res.workoutExercises);
  const sets = parse(res.setLogs);
  // 이름: 응답의 커스텀 종목 → 이 기기 카탈로그·내 표시 이름(읽기만)
  const names = new Map<string, string>();
  for (const e of parse(res.exercises)) {
    const id = str(e.id);
    const n = (lang === "en" ? str(e.name_en) : null) ?? str(e.name_ko);
    if (id && n) names.set(id, n);
  }
  const need = [
    ...new Set(blocks.map((b) => str(b.exercise_id)).filter((x): x is string => !!x && !names.has(x))),
  ];
  if (need.length) {
    try {
      const { getExerciseDisplayNameMap } = await import("@app/core/data/exerciseNames");
      for (const [id, n] of await getExerciseDisplayNameMap(need)) names.set(id, n);
    } catch {
      // 이름을 못 읽으면 「알 수 없는 종목」
    }
  }
  const setsByBlock = new Map<string, Raw[]>();
  for (const s of sets) {
    const b = str(s.workout_exercise_id);
    if (!b || s.done === false || s.done === 0) continue; // 끝내지 않은 세트는 하지 않은 것
    const arr = setsByBlock.get(b) ?? [];
    arr.push(s);
    setsByBlock.set(b, arr);
  }
  const blocksByWorkout = new Map<string, Raw[]>();
  for (const b of blocks) {
    const w = str(b.workout_id);
    if (!w) continue;
    const arr = blocksByWorkout.get(w) ?? [];
    arr.push(b);
    blocksByWorkout.set(w, arr);
  }
  const out: WorkoutView[] = [];
  for (const w of workouts) {
    const id = str(w.id);
    const startedAt = num(w.started_at);
    if (!id || startedAt === null) continue;
    const bs = (blocksByWorkout.get(id) ?? []).sort(
      (a, b) => (num(a.sort_order) ?? 0) - (num(b.sort_order) ?? 0),
    );
    let setCount = 0;
    const exercises: ExerciseView[] = [];
    for (const b of bs) {
      const bid = str(b.id);
      const exId = str(b.exercise_id) ?? "";
      const ss = (bid ? (setsByBlock.get(bid) ?? []) : []).sort(
        (a, c) => (num(a.set_number) ?? 0) - (num(c.set_number) ?? 0),
      );
      setCount += ss.length;
      // [원본] exercises.push({ id, name, sets }) — P4 에서 처방 대 실제(plan)를 더한다
      const coach = (str(w.routine_id) ?? "").startsWith("coach-");
      // [원본] done: true(모든 세트를 끝낸 것으로) — [개선] 서버 done·is_warmup·set_type 그대로(묶음별 짝 · done === true 만 · 리뷰)
      const actual: ActualView[] = ss.map((s) => ({
        weightKg: num(s.weight_kg),
        reps: num(s.reps),
        setNumber: num(s.set_number),
        done: s.done === true,
        isWarmup: s.is_warmup === true,
        setType: str(s.set_type),
        label: setLabel(s, unit),
      }));
      exercises.push({
        id: bid ?? exId,
        name: names.get(exId) ?? t("coaching.member.unknownExercise"),
        sets: ss.map((s, i) => ({ id: str(s.id) ?? `${bid}-${i}`, label: setLabel(s, unit) })),
        plan: coach
          ? planVsActual({
              prescription: b.prescription,
              targetSets: num(b.target_sets),
              targetRepsMin: num(b.target_reps_min),
              targetRepsMax: num(b.target_reps_max),
              targetWeightKg: num(b.target_weight_kg),
              sets: actual,
            })
          : null,
      });
    }
    const completedAt = num(w.completed_at);
    out.push({
      id,
      coach: (str(w.routine_id) ?? "").startsWith("coach-"),
      startedAt,
      durationSec:
        num(w.duration_seconds) ?? (completedAt ? Math.max(0, (completedAt - startedAt) / 1000) : null),
      volumeKg: num(w.total_volume_kg) ?? 0,
      setCount,
      exercises,
    });
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

const locale = () => (lang === "en" ? "en-US" : "ko-KR");
const dayLabel = (ms: number) =>
  new Date(ms).toLocaleDateString(locale(), { month: "long", day: "numeric", weekday: "short" });
const shortDay = (ms: number) => new Date(ms).toLocaleDateString(locale(), { month: "long", day: "numeric" });
const timeLabel = (ms: number) =>
  new Date(ms).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });

function RecordsTab({
  memberId,
  unit,
  consentAt,
  onEnded,
}: {
  memberId: string;
  unit: WeightUnit;
  consentAt: number;
  onEnded: () => void;
}) {
  const [pages, setPages] = useState<Page[] | null>(null); // null = 첫 기간을 읽는 중
  const [cutAt, setCutAt] = useState<number | null>(null); // 서버가 멈춘 자리(지난 기록 꺼짐) — 그 아래는 더 없다
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [attempt, setAttempt] = useState(0);
  // 요청 세대 — 첫 읽기·다시 시도·언마운트마다 올린다. 늦게 온 「더 보기」 응답은 세대가 다르면 버린다(코드 리뷰 L-4)
  const genRef = useRef(0);
  // 코치 코멘트(SPEC-050 P4) — 이 회원에게 남긴 내 코멘트를 한 번에 읽어 운동마다 묶는다(메모리만). null = 읽는 중
  const [comments, setComments] = useState<Map<string, CoachComment[]> | null>(null);
  const [commentsError, setCommentsError] = useState(false);

  const fetchWindow = useCallback(
    async (fromMs: number, toMs: number) => {
      // 서버는 [start − (end − start), end) 를 내준다 → [from, to) 를 받으려고 반 길이로 묻는다
      const start = toMs - Math.floor((toMs - fromMs) / 2);
      const res = await coachingClient().getMemberRecords({
        memberId,
        periodStart: BigInt(start),
        periodEnd: BigInt(toMs),
      });
      const served = Number(res.servedStart);
      return {
        page: { fromMs, toMs, workouts: await toWorkouts(res, unit) },
        cut: served > fromMs + 1000 ? served : null,
      };
    },
    [memberId, unit],
  );

  const fail = useCallback(
    (e: unknown) => {
      if (ConnectError.from(e).code === Code.PermissionDenied) onEnded();
      else setError(errorText(e));
    },
    [onEnded],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 는 다시 시도 방아쇠다
  useEffect(() => {
    let cancelled = false;
    const gen = ++genRef.current;
    setPages(null);
    setError(null);
    setCutAt(null);
    setBusy(false);
    const toMs = Date.now() + 60_000; // 방금 끝낸 운동까지(서버는 지금+1일까지 받는다)
    fetchWindow(toMs - WINDOW_MS, toMs)
      .then((r) => {
        if (cancelled) return;
        setPages([r.page]);
        setCutAt(r.cut);
      })
      .catch((e) => {
        if (!cancelled) fail(e);
      });
    // 코멘트 — 기록과 따로 읽는다. 실패해도 기록은 보인다(막힘·끝남 판단은 기록 응답이 한다 — 두 번 다시 읽지 않게)
    setComments(null);
    setCommentsError(false);
    coachingClient()
      .listCoachComments({ memberId })
      .then((r) => {
        if (!cancelled) setComments(groupComments(r.comments));
      })
      .catch(() => {
        if (cancelled) return;
        setComments(new Map());
        setCommentsError(true);
      });
    return () => {
      cancelled = true;
      if (genRef.current === gen) genRef.current++;
    };
  }, [fetchWindow, fail, attempt, memberId]);

  const onAdded = useCallback((c: CoachComment) => {
    setComments((m) => {
      const next = new Map(m ?? []);
      next.set(c.workoutId, [...(next.get(c.workoutId) ?? []), c]);
      return next;
    });
  }, []);
  const onHidden = useCallback((id: string) => {
    setComments((m) => {
      const next = new Map<string, CoachComment[]>();
      for (const [k, v] of m ?? [])
        next.set(
          k,
          v.filter((c) => c.id !== id),
        );
      return next;
    });
  }, []);
  const onDenied = useCallback(
    (e: unknown) => {
      if (ConnectError.from(e).code !== Code.PermissionDenied) return false;
      onEnded();
      return true;
    },
    [onEnded],
  );

  async function more() {
    // [원본] if (!pages || busy || cutAt !== null) return;
    if (!pages || busy || cutAt !== null || noMore(pages)) return;
    const last = pages[pages.length - 1];
    const gen = genRef.current;
    setBusy(true);
    setError(null);
    try {
      const r = await fetchWindow(last.fromMs - WINDOW_MS, last.fromMs);
      if (gen !== genRef.current) return; // 그 사이 다시 읽었거나 화면을 떠났다
      setPages((p) => [...(p ?? []), r.page]);
      setCutAt(r.cut);
    } catch (e) {
      if (gen === genRef.current) fail(e);
    } finally {
      if (gen === genRef.current) setBusy(false);
    }
  }

  if (pages === null) {
    if (error) return <ErrorRetry message={error} onRetry={() => setAttempt((n) => n + 1)} />;
    return (
      <div
        data-testid="member-records-loading"
        role="status"
        aria-label={t("common.loading")}
        className="flex flex-col gap-[var(--spacing-sm)]"
      >
        <Skeleton height={20} width="40%" />
        <Skeleton height={64} radius="var(--radius-md)" />
        <Skeleton height={64} radius="var(--radius-md)" />
      </div>
    );
  }

  const all = pages.flatMap((p) => p.workouts);
  // 날짜별 묶음(최근 날이 위)
  const days: { key: string; label: string; items: WorkoutView[] }[] = [];
  for (const w of all) {
    const d = new Date(w.startedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(w);
    else days.push({ key, label: dayLabel(w.startedAt), items: [w] });
  }
  const lastPage = pages[pages.length - 1];

  return (
    <div data-testid="member-records" data-count={all.length}>
      {all.length === 0 && pages.length === 1 ? (
        <AppText
          variant="body"
          color="textMuted"
          className="block py-[var(--spacing-sm)]"
          data-testid="member-empty"
        >
          {t("coaching.member.empty")}
        </AppText>
      ) : null}

      {days.map((d) => (
        <section key={d.key} className="mb-[var(--spacing-md)]" data-testid="member-day">
          <AppText variant="label" color="textMuted" className="mb-[var(--spacing-xs)] block font-semibold">
            {d.label}
          </AppText>
          {d.items.map((w) => (
            <WorkoutRow
              key={w.id}
              w={w}
              unit={unit}
              memberId={memberId}
              comments={comments?.get(w.id) ?? EMPTY_COMMENTS}
              commentsReady={comments !== null}
              commentsError={commentsError}
              onAdded={onAdded}
              onHidden={onHidden}
              onDenied={onDenied}
              open={open.has(w.id)}
              onToggle={() =>
                setOpen((s) => {
                  const n = new Set(s);
                  if (n.has(w.id)) n.delete(w.id);
                  else n.add(w.id);
                  return n;
                })
              }
            />
          ))}
        </section>
      ))}

      {pages.length > 1 && lastPage.workouts.length === 0 ? (
        <AppText
          variant="caption"
          color="textMuted"
          className="mb-[var(--spacing-sm)] block"
          data-testid="member-empty-range"
        >
          {t("coaching.member.emptyRange", {
            from: shortDay(lastPage.fromMs),
            to: shortDay(lastPage.toMs - 1),
          })}
        </AppText>
      ) : null}

      {error ? (
        <AppText
          variant="caption"
          color="danger"
          className="mb-[var(--spacing-sm)] block"
          data-testid="member-more-error"
        >
          {error}
        </AppText>
      ) : null}

      {cutAt !== null ? (
        <AppText
          variant="caption"
          color="textMuted"
          className="block py-[var(--spacing-sm)]"
          data-testid="member-since"
        >
          {t("coaching.member.since", { date: shortDay(consentAt > 0 ? consentAt : cutAt) })}
        </AppText>
      ) : noMore(pages) ? (
        // [개선] 빈 구간이 두 번 이어지면 그 앞도 없다고 보고 멈춘다(끝없이 「더 보기」 · 코드 리뷰 L-3)
        <AppText
          variant="caption"
          color="textMuted"
          className="block py-[var(--spacing-sm)]"
          data-testid="member-no-more"
        >
          {t("coaching.member.noMore")}
        </AppText>
      ) : (
        <Button
          title={t("coaching.member.more")}
          variant="secondary"
          loading={busy}
          onPress={() => void more()}
          testId="member-more"
          className="min-h-11"
        />
      )}
    </div>
  );
}

const EMPTY_COMMENTS: CoachComment[] = [];

/** 코멘트를 운동마다 묶는다 — 운동 안에서는 오래된 것부터(대화 순서). */
function groupComments(rows: readonly CoachComment[]): Map<string, CoachComment[]> {
  const m = new Map<string, CoachComment[]>();
  for (const c of rows) {
    const arr = m.get(c.workoutId) ?? [];
    arr.push(c);
    m.set(c.workoutId, arr);
  }
  for (const arr of m.values()) arr.sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
  return m;
}

/** 마지막 두 구간이 모두 비었나 — 「더 이전 기록이 없어요」로 멈춘다(L-3) */
function noMore(pages: readonly Page[]): boolean {
  const n = pages.length;
  return n >= 2 && pages[n - 1].workouts.length === 0 && pages[n - 2].workouts.length === 0;
}

function WorkoutRow({
  w,
  unit,
  memberId,
  comments,
  commentsReady,
  commentsError,
  onAdded,
  onHidden,
  onDenied,
  open,
  onToggle,
}: {
  w: WorkoutView;
  unit: WeightUnit;
  memberId: string;
  comments: readonly CoachComment[];
  commentsReady: boolean;
  commentsError: boolean;
  onAdded: (c: CoachComment) => void;
  onHidden: (id: string) => void;
  onDenied: (e: unknown) => boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const first = w.exercises[0]?.name ?? t("coaching.member.unknownExercise");
  const title =
    w.exercises.length > 1
      ? t("coaching.member.more1", { name: first, count: w.exercises.length - 1 })
      : first;
  const bits = [
    timeLabel(w.startedAt),
    w.durationSec
      ? t("coaching.member.minutes", { count: Math.max(1, Math.round(w.durationSec / 60)) })
      : null,
    // [원본] t("coaching.member.sets", { count: w.setCount }) — en 「1 sets」(코드 리뷰 L-6)
    w.setCount === 1 ? t("coaching.member.setsOne") : t("coaching.member.sets", { count: w.setCount }),
    w.volumeKg > 0 ? formatWeight(w.volumeKg, unit) : null,
    // [개선] 코멘트가 있으면 줄에서도 보인다(SPEC-050 P4)
    // [원본] comments.length > 0 ? t("coaching.comment.count", …) — 영어 「1 comments」(리뷰 중간-3)
    comments.length === 1
      ? t("coaching.comment.countOne")
      : comments.length > 0
        ? t("coaching.comment.count", { count: comments.length })
        : null,
  ].filter(Boolean);
  return (
    <div
      // [원본] className="mb-[var(--spacing-sm)] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card)"
      // [개선] 운동마다 상자 대신 아래 가는 선으로 나뉜 줄(SPEC-056 F1 · 기록 탭 목록과 같다)
      className="border-(--color-line) border-b"
      data-testid="member-workout"
      data-id={w.id}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        data-testid="member-workout-toggle"
        // [원본] className="… px-[var(--spacing-md)] …" · [개선] 상자가 없어져 좌우 여백 px-xs(SPEC-056)
        className="flex min-h-11 w-full min-w-0 items-center gap-[var(--spacing-sm)] px-[var(--spacing-xs)] py-[var(--spacing-sm)] text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-[var(--spacing-xs)]">
            <AppText
              variant="body"
              className="min-w-0 truncate font-medium!"
              data-testid="member-workout-title"
            >
              {title}
            </AppText>
            {w.coach ? (
              <span
                data-testid="member-workout-coach"
                // [원본] className="inline-flex shrink-0 items-center rounded-[var(--radius-pill)] bg-(--color-coaching-soft) px-[var(--spacing-sm)] py-[1px] font-semibold text-(--color-coaching-ink) text-[length:var(--text-xs)]" — 정보는 판 없이 글자만 — 코칭은 coaching-ink + 점(SPEC-057 R2)
                className="inline-flex shrink-0 items-center gap-[4px] font-semibold text-(--color-coaching-ink) text-[length:var(--text-xs)]"
              >
                <span aria-hidden className="h-[6px] w-[6px] shrink-0 rounded-full bg-(--color-coaching)" />
                {t("coaching.plan.coachRoutine")}
              </span>
            ) : null}
          </div>
          <AppText
            variant="caption"
            color="textMuted"
            className="block truncate"
            data-testid="member-workout-meta"
          >
            {bits.join(" · ")}
          </AppText>
        </div>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={18} color="var(--color-ink3)" />
      </button>
      {open ? (
        <div
          // [원본] className="border-(--color-line) border-t px-[var(--spacing-md)] py-[var(--spacing-sm)]" · [개선] 상자가 없어져 px-xs(SPEC-056)
          className="border-(--color-line) border-t px-[var(--spacing-xs)] py-[var(--spacing-sm)]"
          data-testid="member-workout-detail"
        >
          {w.exercises.map((e) => (
            <div key={e.id} className="mb-[var(--spacing-xs)]" data-testid="member-exercise-row">
              <AppText variant="caption" className="block truncate font-semibold">
                {e.name}
              </AppText>
              {/* [개선] 코치 루틴 운동은 처방 대 실제 표(SPEC-050 P4) · 그 밖은 세트 줄 그대로 */}
              {e.plan ? (
                <PlanActualTable
                  pva={e.plan}
                  unit={unit}
                  actualLabel={(r) => (r.actual as ActualView | null)?.label ?? "—"}
                />
              ) : (
                <div className="flex flex-wrap gap-x-[var(--spacing-sm)] gap-y-[2px]">
                  {e.sets.map((s, i) => (
                    <AppText key={s.id} variant="caption" color="textMuted" data-testid="member-set">
                      {`${i + 1}. ${s.label}`}
                    </AppText>
                  ))}
                </div>
              )}
            </div>
          ))}
          {commentsReady ? (
            <>
              {commentsError ? (
                <AppText
                  variant="caption"
                  color="textMuted"
                  className="mt-[var(--spacing-xs)] block"
                  data-testid="coach-comments-error"
                >
                  {t("coaching.comment.loadFailed")}
                </AppText>
              ) : null}
              <CoachCommentBox
                memberId={memberId}
                workoutId={w.id}
                comments={comments}
                onAdded={onAdded}
                onHidden={onHidden}
                onDenied={onDenied}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── 체중 카드(bodyView 일 때만) ────────────────────────────────────────────

function BodyCard({ body, range }: { body: readonly string[]; range: { startMs: number; endMs: number } }) {
  const logs: BodyweightLogLike[] = parse(body).map((r) => ({
    id: str(r.id) ?? "",
    measuredAt: num(r.measured_at),
    weightKg: num(r.weight_kg),
    updatedAt: 0,
    skeletalMuscleKg: num(r.skeletal_muscle_kg),
    bodyFatPct: num(r.body_fat_pct),
  }));
  // 보는 기간 안(직전 비교 절반은 뺀다) · 측정 시각 오름차순
  const inPeriod = sortBodyweightLogs(logs).filter(
    (l) => l.measuredAt >= range.startMs && l.measuredAt < range.endMs,
  );
  const latest = inPeriod[inPeriod.length - 1];
  const firstLog = inPeriod[0];
  const change = latest && firstLog && inPeriod.length > 1 ? latest.weightKg - firstLog.weightKg : null;
  const kg = (v: number) => `${v.toFixed(1)}kg`; // 체중은 kg 고정(SRS-067)
  return (
    <div
      data-testid="member-body-card"
      // [원본] className="mt-[var(--spacing-md)] rounded-[var(--radius-md)] border border-(--color-line) bg-(--color-card) p-[var(--spacing-md)]"
      // [개선] 상자 대신 위 가는 선으로 나뉜 구역(SPEC-056 F1)
      className="mt-[var(--spacing-md)] border-(--color-line) border-t py-[var(--spacing-md)]"
    >
      <div className="mb-[var(--spacing-sm)] flex items-center gap-[var(--spacing-xs)]">
        <Icon name="scale-outline" size={18} color="var(--color-ink2)" />
        <AppText variant="body" className="font-semibold!">
          {t("coaching.member.bodyTitle")}
        </AppText>
      </div>
      {!latest ? (
        <AppText variant="caption" color="textMuted" className="block" data-testid="member-body-empty">
          {t("coaching.member.bodyEmpty")}
        </AppText>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-[var(--spacing-sm)]">
            <div className="min-w-0">
              <AppText variant="caption" color="textMuted" className="block">
                {t("coaching.member.bodyLatest")}
              </AppText>
              <AppText variant="body" className="block font-semibold!" data-testid="member-body-latest">
                {kg(latest.weightKg)}
              </AppText>
            </div>
            <div className="min-w-0">
              <AppText variant="caption" color="textMuted" className="block">
                {t("coaching.member.bodyChange")}
              </AppText>
              <AppText variant="body" className="block font-semibold!" data-testid="member-body-change">
                {change === null
                  ? "—"
                  : `${change > 0 ? "+" : change < 0 ? "−" : "±"}${Math.abs(change).toFixed(1)}kg`}
              </AppText>
            </div>
          </div>
          <div className="mt-[var(--spacing-sm)]">
            {inPeriod
              .slice(-5)
              .reverse()
              .map((l) => {
                const extra = [
                  l.skeletalMuscleKg
                    ? t("coaching.member.bodySmm", { value: l.skeletalMuscleKg.toFixed(1) })
                    : null,
                  l.bodyFatPct ? t("coaching.member.bodyPbf", { value: l.bodyFatPct.toFixed(1) }) : null,
                ].filter(Boolean);
                return (
                  <div
                    key={l.id}
                    className="flex min-w-0 items-baseline justify-between gap-[var(--spacing-sm)] py-[2px]"
                    data-testid="member-body-row"
                  >
                    <AppText variant="caption" color="textMuted" className="shrink-0">
                      {shortDay(l.measuredAt)}
                    </AppText>
                    <AppText variant="caption" className="min-w-0 truncate text-right">
                      {[kg(l.weightKg), ...extra].join(" · ")}
                    </AppText>
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 연결 이력 — 루틴 탭 맨 아래 접기 칸(SPEC-059 · #T19 3a). 처음 펼칠 때 한 번만 읽는다(줄 30개까지).
 * 줄 글은 코칭 화면 이름 시트와 같은 auditLines.
 */
function ConnectionHistory({ grantId, onEnded }: { grantId: string; onEnded: () => void }) {
  const [lines, setLines] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);
  function load() {
    if (asked.current) return;
    asked.current = true;
    coachingClient()
      .listAudit({ grantId })
      .then((r) => setLines(auditLines(r.entries).slice(0, 30)))
      .catch((e) => {
        asked.current = false; // 다음에 펼치거나 「다시 시도」로 다시 묻는다
        // 연결이 끝났으면 다른 구역처럼 화면 전체를 「끝남」으로(코드 리뷰 REV-144 A2)
        if (ConnectError.from(e).code === Code.PermissionDenied) onEnded();
        else setFailed(true);
      });
  }
  return (
    <details
      data-testid="member-history"
      className="group mt-[var(--spacing-xl)] border-(--color-line) border-t"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) {
          setFailed(false);
          load();
        }
      }}
    >
      <summary
        data-testid="member-history-toggle"
        className="flex min-h-11 cursor-pointer list-none items-center gap-[var(--spacing-xs)] font-semibold text-(--color-ink) text-[length:var(--text-sm)] focus-visible:outline-2 focus-visible:outline-(--color-brand) [&::-webkit-details-marker]:hidden"
      >
        {t("coaching.member.historyTitle")}
        <span aria-hidden className="inline-flex transition-transform group-open:rotate-180">
          <Icon name="chevron-down" size={14} color="var(--color-ink2)" />
        </span>
      </summary>
      {/* [원본] <div role="status"> 가 줄 30개까지 감싸 다 읽으면 한꺼번에 읽혔다 — 상태 한 줄만 라이브 영역(REV-144 A1) */}
      <div className="pb-[var(--spacing-md)]">
        <div role="status">
          {failed ? (
            <div className="flex items-center gap-[var(--spacing-sm)]">
              <AppText
                variant="caption"
                color="textMuted"
                className="block"
                data-testid="member-history-error"
              >
                {t("common.error")}
              </AppText>
              <Button
                title={t("common.retry")}
                variant="quiet"
                testId="member-history-retry"
                onPress={() => {
                  setFailed(false);
                  load();
                }}
              />
            </div>
          ) : lines === null ? (
            <AppText variant="caption" color="textMuted" className="block">
              {t("common.loading")}
            </AppText>
          ) : lines.length === 0 ? (
            <AppText variant="caption" color="textMuted" className="block">
              {t("coaching.historyEmpty")}
            </AppText>
          ) : null}
        </div>
        {lines && lines.length > 0 ? (
          <ul>
            {lines.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 읽은 뒤 바뀌지 않는 이력 줄 — 같은 때·같은 일이 겹칠 수 있다
              <li key={`${i}-${line}`} className="py-[2px]" data-testid="member-history-line">
                <AppText variant="caption" color="textMuted" className="block">
                  {line}
                </AppText>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
