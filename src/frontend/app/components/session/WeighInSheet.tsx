"use client";
// @plm SRS-077  체중 시트 — 운동 전 체크인 · 프로필 「기록」 · 기록 고치기 · 목표 체중이 같은 시트를 쓴다(U-7·U-8·U-9)
//
// 모양(U-8): 값을 가운데 크게, 그 아래 두 줄 [−1][−0.5][−0.1] / [+0.1][+0.5][+1](lb 는 0.2·1·2 — core BODYWEIGHT_STEPS 한 곳) · 버튼 각 ≥44.
//   직접 입력칸은 「직접 입력」을 눌러야 열린다 — 자동 포커스하면 키보드가 시트와 헤더 타이머를 덮는다(U-7 ③).
//   높이 ≤ 50dvh(헤더 타이머가 보이게) — 공용 Overlay(최대 88dvh)는 고치지 않고 이 파일에서 같은 모양으로 포탈한다.
// 숫자(U-8): 상태는 kg 로 든다. ± 는 core stepBodyweightKg(보이는 숫자 + 스텝 → kg), 직접 입력은 enteredBodyweightToKg
//   (보이던 숫자 그대로면 kg 원값) — lb 로 보여도 75kg 가 74.98kg 로 바뀌지 않는다.
// 닫기: 스크림·Esc·(trapBack 이면) 브라우저 뒤로 = onDismiss — 체크인에서는 「체중 없이 계속」과 같다(U-7 ②).
//   직접 입력 중 스크림을 누르면 닫지 않고 입력만 확정한다(키보드를 내리려는 손짓 · iOS 숫자 키패드엔 Enter 가 없다 · qa P3-7).
// 접근성(qa P3-5): 스크림은 포커스·낭독 대상이 아니다(Esc·둘째 버튼이 같은 동작). Tab 은 패널 안에서 돈다. 닫으면 연 곳으로 포커스를 돌려준다.
// 오타 방지(qa P3-6): 직접 입력은 20~300kg 밖이면 받지 않고 이유를 한 줄로 알린다. 지난 값과 ±30% 넘게 다르면 한 번 더 눌러야 저장.
//
// WeighInCheckin: ActiveWorkout 첫 진입에서 띄울지 판정하고(core shouldOfferWeighIn) 저장은 source='checkin'.
import { errorText } from "@/lib/errorText";
import {
  BODYWEIGHT_MAX_KG,
  BODYWEIGHT_STEPS,
  PBF_MAX,
  PBF_MIN,
  SMM_MAX_KG,
  SMM_MIN_KG,
  isValidBodyFatPct,
  isValidSkeletalMuscleKg,
  latest,
  stepBodyweightKg,
  type BodyweightLogLike,
} from "@app/core/domain/bodyweight";
import {
  WEIGH_IN_MIN_ENTRY_KG,
  bodyweightUnitOf,
  enteredBodyweightToKg,
  formatBodyweight,
  hasLogOnLocalDay,
  isLargeBodyweightJump,
  // [원본] latestOnLocalDay, — 줄 판정은 표식까지 보는 weighInRowTarget 으로(P1-2 리뷰)
  localDayRange,
  shouldOfferWeighIn,
  weighInRowTarget,
  weighInStartKg,
} from "@app/core/domain/weighIn";
import { fromKg, type WeightUnit } from "@app/core";
import { useUser } from "@app/core/state/userContext";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clearWeighInMarks, hasWeighInMark, readWeighInEnabled, setWeighInMark } from "@/lib/bodyweightPref";
import { afterBodyweightWrite, useBodyweightLogs } from "@/lib/bodyweightLogs";
import { lang, t } from "@/lib/i18n";
import { useToast } from "../Toast";
// [원본] import { Button } from "../ui/Button"; — 「기록/고치기」는 ⌄/⌃ 펼침 버튼(aria-expanded)으로 직접 그린다
import { Icon } from "../ui/Icon";
import { Card } from "../ui/primitives";
// 체중 패널(2026-11-10) — 운동 카드·프로필·통계가 같은 패널을 쓴다(함수 안에서만 쓰여 서로 불러도 순환 문제 없음)
import { BodyweightPanel } from "../profile/BodyweightRow";

/** 인바디 두 칸(SPEC-049 Phase 3) — null = 안 적음 */
export interface InbodyValues {
  skeletalMuscleKg: number | null;
  bodyFatPct: number | null;
}

/** 칸 글자 → 값. 빈칸 = null(안 적음) · 숫자가 아니거나 범위 밖 = undefined(저장 막음) */
function parseInbody(text: string, valid: (v: number) => boolean): number | null | undefined {
  const tx = text.trim().replace(",", ".");
  if (tx === "") return null;
  // [원본] const v = Number(tx); … valid(v) 뒤 반올림 — 「0x21」·「1e1」을 받고, 4.96 은 막혔다(REV-096 L-2)
  if (!/^\d+(\.\d+)?$/.test(tx)) return undefined;
  const v = Math.round(Number(tx) * 10) / 10;
  return Number.isFinite(v) && valid(v) ? v : undefined;
}

const numText = (v: number | null | undefined) => (v == null ? "" : String(v));

/** 「10/27」·「Oct 27」 */
export function formatBodyweightDate(ms: number, withYear = false): string {
  return new Date(ms).toLocaleDateString(lang === "en" ? "en-US" : "ko-KR", {
    ...(withYear ? { year: "numeric" } : {}),
    month: "numeric",
    day: "numeric",
  });
}

export function WeighInSheet({
  title,
  unit,
  initialKg,
  last,
  primaryLabel,
  secondaryLabel,
  onSave,
  onSecondary,
  onDismiss,
  trapBack = false,
  extra,
  compareKg,
  inbody,
  testId = "weighin-sheet",
  inline = false,
  inlineSecondary = false,
  primaryVariant = "brand",
  inlineShowTitle = false,
  onTypingChange,
}: {
  title: string;
  unit: WeightUnit;
  /** 출발값(kg) — null 이면 지난 값 없음(weighInStartKg) */
  initialKg: number | null;
  /** 제목 아래 한 줄 「지난 기록 75.0kg · 10/26」 — null 이면 「지난 기록이 없어요」, undefined 면 줄 없음 */
  last?: { kg: number; measuredAt: number } | null;
  primaryLabel: string;
  secondaryLabel: string;
  /**
   * 저장(kg). 실패하면 throw — 시트는 열린 채로 남는다.
   * [원본] extras = 인바디 칸을 펼쳤을 때만(빈칸은 null) — inbody 를 안 넘긴 시트(목표 체중)·접어 둔 채 저장하면 undefined(그대로 둔다).
   * [개선] 인바디 칸은 늘 보인다(2026-11-10 · 토글 없앰). extras = inbody 를 넘긴 시트에서 칸별로 —
   *   글자가 있으면 그 값 · 비었고 출발값도 없었으면 **키를 빼서 적지 않음(그대로 둔다)** · 출발값을 사람이 지웠으면 null(지움).
   *   inbody 를 안 넘긴 시트(목표 체중)는 undefined.
   */
  // [원본] onSave: (kg: number, extras?: InbodyValues) => Promise<void> | void;
  onSave: (kg: number, extras?: Partial<InbodyValues>) => Promise<void> | void;
  /** 둘째 버튼 — 없으면 onDismiss */
  onSecondary?: () => void;
  /** 스크림·Esc·뒤로(trapBack) */
  onDismiss: () => void;
  /** 브라우저 뒤로 가기를 닫기로 받는다(체크인) */
  trapBack?: boolean;
  /** 값 아래 덧붙일 것(고치기의 날짜 칸 등) */
  extra?: ReactNode;
  /** ±30% 확인의 기준값(kg) — 없으면 last 의 값. 목표 시트처럼 last 가 없으면 확인하지 않는다 */
  compareKg?: number | null;
  /** 인바디 두 칸의 출발값(SPEC-049 Phase 3) — 넘기면 두 칸이 늘 보인다([원본] 「인바디 수치도 적기」 펼침). 목표 시트는 넘기지 않는다 */
  inbody?: InbodyValues;
  testId?: string;
  /**
   * 안에 끼우는 모양(프로필 「체중」 시트의 바로 입력) — 포탈·스크림·제목·둘째 버튼·Esc·Tab 가두기 없이 입력과 저장만.
   * 저장해도 닫히지 않고 다음 기록을 받을 수 있게 남는다(인바디 칸은 비운다). 닫기는 바깥 시트가 맡는다.
   * [개선] 운동 화면 「오늘 체중」 카드도 이 모양으로 카드 안에 펼친다(저장하면 바깥이 접는다 · 2026-11-10).
   */
  inline?: boolean;
  /** [개선] 저장 버튼 모양 — 빨강 채움(brand · 기본)은 화면의 주 행동 하나. 운동 화면(「완료」)·패널 안 목표·고치기 입력은 outline(2026-11-10 리뷰 M-1) */
  primaryVariant?: "brand" | "outline";
  /** [개선] 안에 끼운 모양에서도 제목을 한 줄 보인다(패널 안 목표·고치기 — 바로 입력과 구분 · 리뷰 M-3) */
  inlineShowTitle?: boolean;
  /** [개선] 안에 끼운 모양에도 둘째 버튼(취소)을 둔다 — 체중 패널 안의 고치기·목표처럼 열었다 닫는 입력(2026-11-10) */
  inlineSecondary?: boolean;
  /** 직접 입력칸이 열리고 닫힐 때(inline) — 바깥 시트가 「입력 중 바깥 누름 = 입력 확정만」을 지키게(qa P3-7 · 리뷰 M-1) */
  onTypingChange?: (typing: boolean) => void;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [kg, setKg] = useState(() => weighInStartKg(initialKg, unit));
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /** 직접 입력을 받지 않은 이유(범위 밖·숫자 아님) — 입력칸 아래 한 줄 */
  const [entryError, setEntryError] = useState(false);
  /** ±30% 확인을 띄운 kg — 같은 값으로 한 번 더 누르면 저장 */
  const [jumpAsk, setJumpAsk] = useState<number | null>(null);
  // [원본] 인바디 — 출발값이 있으면 펼친 채로 연다
  // const [inbodyOpen, setInbodyOpen] = useState(
  //   () => inbody != null && (inbody.skeletalMuscleKg != null || inbody.bodyFatPct != null),
  // );
  // [개선] 토글 없이 늘 보인다(2026-11-10 사용자 요청) — 「펼치지 않음 = 손대지 않음」은 save 에서 「빈칸 = 적지 않음」으로 지킨다
  const inbodyOpen = inbody != null;
  // 출발값(연 순간) — 비었던 칸을 비운 채 저장하면 그 칸은 쓰지 않는다(save · 연 뒤 다른 기기 값이 들어와도 덮지 않게)
  const inbodyStart = useRef(inbody);
  const [smmText, setSmmText] = useState(() => numText(inbody?.skeletalMuscleKg));
  const [pbfText, setPbfText] = useState(() => numText(inbody?.bodyFatPct));
  const [smmError, setSmmError] = useState(false);
  const [pbfError, setPbfError] = useState(false);
  const closed = useRef(false);
  const focused = useRef(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const typingRef = useRef(false);
  typingRef.current = typing;
  // [개선] inline 리뷰(M-1·M-2·M-3) — 입력 중 알림 · 저장 뒤 저장 버튼으로 포커스 · 방금 저장한 같은 값의 되누름 무시
  const typingCb = useRef(onTypingChange);
  typingCb.current = onTypingChange;
  useEffect(() => typingCb.current?.(typing), [typing]);
  // [개선] 입력 중에 사라지면(Esc·취소로 닫힘) 「입력 중」 표시를 걷는다 — 바깥 시트의 다음 스크림 누름이 무시되지 않게(리뷰 L-2)
  useEffect(() => () => typingCb.current?.(false), []);
  const saveBtnRef = useRef<HTMLButtonElement | null>(null);
  const refocusSave = useRef(false);
  const lastSaved = useRef<{ kg: number; at: number } | null>(null);
  useEffect(() => {
    // 저장 중 disabled 가 된 버튼에서 포커스가 body 로 빠졌다 — 열린 채 남는 inline 은 저장 버튼으로 되돌린다
    if (busy || !refocusSave.current) return;
    refocusSave.current = false;
    const a = document.activeElement;
    if (!a || a === document.body) saveBtnRef.current?.focus({ preventScroll: true });
  }, [busy]);
  /** 스크림을 누르기 시작할 때 입력 중이었나 — 누르는 순간 입력칸이 blur 되어 click 때는 이미 typing=false 다 */
  const scrimDownWhileTyping = useRef(false);

  // 연 곳(버튼)을 기억했다가 닫힐 때 돌려준다(qa P3-5 ③) — 포탈이 붙기 전 첫 effect 에서 잡는다
  // biome-ignore lint/correctness/useExhaustiveDependencies: inline 은 연 뒤 바뀌지 않는 모양 — 처음 한 번만 판정한다
  useEffect(() => {
    if (inline) return; // [개선] 안에 끼운 모양 — 포커스는 바깥 시트(Overlay)가 맡는다
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRoot(document.getElementById("modal-root"));
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // Esc = 닫기(공용 Overlay 와 같다)
  // biome-ignore lint/correctness/useExhaustiveDependencies: inline 은 연 뒤 바뀌지 않는 모양 — 처음 한 번만 판정한다
  useEffect(() => {
    if (inline) return; // [개선] 안에 끼운 모양 — Esc·Tab 은 바깥 시트(Overlay)가 받는다
    const onKey = (e: KeyboardEvent) => {
      // Tab 은 패널 안에서 돈다(aria-modal · qa P3-5 ②)
      if (e.key === "Tab" && panelRef.current) {
        const items = [
          ...panelRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        const inside = active instanceof Node && panelRef.current.contains(active);
        if (e.shiftKey && (active === first || !inside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !inside)) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.key !== "Escape" || closed.current) return;
      closed.current = true;
      dismissRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // 뒤로 가기 = 닫기(체크인 · U-7 ②). 열 때 한 칸 쌓고, 버튼으로 닫으면 그 칸을 되돌린다(주소는 그대로).
  // [원본] 되돌림 popstate 를 무시하려던 ignorePop — 리스너를 먼저 떼어 아무 일도 하지 않았다(qa P3-10 · 정리).
  // 걷기(history.back)는 cleanup 에서 **바로** 부른다. 한 틱 미루면 바로 뒤의 이동(새로고침·링크)과 겹쳐 그 이동을 끊는다(e2e 로 확인).
  //   back 과 그 뒤의 pushState 는 브라우저 세션 기록 순회 큐에서 차례로 처리된다 — 뒤에 연 새 화면을 되돌리지 않는다.
  //   우리 칸(history.state.liftgramWeighIn)이 맨 위일 때만 걷는다. 개발 StrictMode 의 push→back→push 는 한 칸이 남는다(운영 무관).
  const pushed = useRef(false);
  useEffect(() => {
    if (!trapBack) return;
    // 칸마다 고유 토큰(liftgramTop) — 위 칸이 닫혀 돌아온 popstate 는 무시, 닫을 때도 맨 위가 우리 칸일 때만 걷는다(SRS-093 qa M-3)
    const token = `weighin-${Math.random().toString(36).slice(2)}`;
    history.pushState({ ...(history.state ?? {}), liftgramWeighIn: true, liftgramTop: token }, "");
    pushed.current = true;
    const onPop = () => {
      if (history.state?.liftgramTop === token) return;
      pushed.current = false;
      if (closed.current) return;
      closed.current = true;
      dismissRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // [원본] if (pushed.current && history.state?.liftgramWeighIn) history.back();
      if (pushed.current && history.state?.liftgramTop === token) history.back();
      pushed.current = false;
    };
  }, [trapBack]);

  const steps = BODYWEIGHT_STEPS[unit];
  const shown = formatBodyweight(kg, unit);

  /**
   * 직접 입력칸의 숫자를 반영한 kg — 보이던 숫자 그대로면 지금 kg(왕복 오차 없음).
   * 받지 않는 값(범위 밖·숫자 아님)은 예전 값을 두고 이유를 한 줄로 알린다 — ok=false.
   */
  const commitTyped = (): { kg: number; ok: boolean } => {
    if (!typingRef.current) return { kg, ok: true };
    typingRef.current = false;
    const v = Number.parseFloat(draft.replace(",", "."));
    const entered = enteredBodyweightToKg(v, unit, kg);
    setTyping(false);
    if (entered == null) {
      setEntryError(true);
      return { kg, ok: false };
    }
    setEntryError(false);
    setKg(entered);
    return { kg: entered, ok: true };
  };

  const refKg = compareKg !== undefined ? compareKg : (last?.kg ?? null);

  const save = () => {
    if (busy || closed.current) return;
    const { kg: value, ok } = commitTyped();
    if (!ok || entryError) return; // 받지 않은 입력 — 이유 줄을 본 뒤 다시 고치거나 ± 로 맞춘다
    // 인바디 — 펼쳤을 때만 읽는다. 범위 밖이면 칸 아래 이유를 보이고 저장하지 않는다(REV-094)
    // [원본] let extras: InbodyValues | undefined;
    let extras: Partial<InbodyValues> | undefined;
    if (inbody && inbodyOpen) {
      // [개선] 출발값 그대로인 칸(손대지 않음)은 읽지도 쓰지도 않는다 — 연 사이 다른 기기가 바꾼 값을 덮지 않게(리뷰 M-2)
      const start = inbodyStart.current;
      const smmSame = start?.skeletalMuscleKg != null && smmText.trim() === numText(start.skeletalMuscleKg);
      const pbfSame = start?.bodyFatPct != null && pbfText.trim() === numText(start.bodyFatPct);
      const smm = smmSame ? null : parseInbody(smmText, isValidSkeletalMuscleKg);
      const pbf = pbfSame ? null : parseInbody(pbfText, isValidBodyFatPct);
      setSmmError(smm === undefined);
      setPbfError(pbf === undefined);
      if (smm === undefined || pbf === undefined) return;
      // [원본] extras = { skeletalMuscleKg: smm, bodyFatPct: pbf };
      // [개선] 빈칸 = 적지 않음 — 비었고 출발값도 없던 칸·출발값 그대로인 칸은 키를 뺀다. 출발값을 사람이 지운 칸만 null(지움)
      extras = {
        ...(!smmSame && (smm != null || start?.skeletalMuscleKg != null) ? { skeletalMuscleKg: smm } : {}),
        ...(!pbfSame && (pbf != null || start?.bodyFatPct != null) ? { bodyFatPct: pbf } : {}),
      };
    }
    // 이번 저장에 인바디 값이 실렸나(빈칸만이면 체중만 저장한 것)
    const withInbody = extras != null && (extras.skeletalMuscleKg != null || extras.bodyFatPct != null);
    // [개선] inline — 저장 직후(2초 안) 같은 값을 또 누르면 같은 줄이 하나 더 쌓인다(두 번 누름 · 리뷰 M-3). 인바디를 적었으면 새 값일 수 있어 받는다
    if (
      inline &&
      // [원본] extras === undefined && — 칸이 늘 보여 extras 가 늘 있다 → 값이 실렸는지로
      !withInbody &&
      lastSaved.current?.kg === value &&
      Date.now() - lastSaved.current.at < 2_000
    )
      return;
    // 지난 값과 ±30% 넘게 다르면 한 번 더 누르게 한다(같은 값일 때만 통과 · qa P3-6)
    if (isLargeBodyweightJump(value, refKg) && jumpAsk !== value) {
      setJumpAsk(value);
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        await onSave(value, extras);
        // [원본] closed.current = true;
        // [개선] 안에 끼운 모양은 닫히지 않는다 — 다음 기록을 받게 풀어 두고, 인바디 칸은 비우고 접는다(같은 값이 새 줄에 또 붙지 않게)
        if (inline) {
          lastSaved.current = { kg: value, at: Date.now() };
          refocusSave.current = true;
          setBusy(false);
          setJumpAsk(null);
          // [원본] setInbodyOpen(false); — 늘 보이는 칸이라 접지 않고 비우기만
          // 비운 칸의 출발값도 「없음」으로(다음 저장이 지난 출발값을 기준으로 null 을 싣지 않게 · 리뷰 L-1)
          inbodyStart.current = { skeletalMuscleKg: null, bodyFatPct: null };
          setSmmText("");
          setPbfText("");
          setSmmError(false);
          setPbfError(false);
        } else closed.current = true;
      } catch {
        setBusy(false);
      }
    })();
  };

  const secondary = () => {
    if (closed.current) return;
    closed.current = true;
    (onSecondary ?? onDismiss)();
  };

  // [원본] if (!root) return null; — 안에 끼우는 모양(inline)은 포탈 뿌리가 없어도 그린다 → 아래 inline 갈래 뒤로 옮겼다
  const stepBtn = (s: number) => {
    const label = String(Math.abs(s));
    return (
      <button
        key={s}
        type="button"
        data-testid={`weighin-step-${s > 0 ? "p" : "m"}${label.replace(".", "_")}`}
        aria-label={t(s > 0 ? "bodyweight.stepInc" : "bodyweight.stepDec", { step: label, unit })}
        disabled={busy}
        onClick={() => {
          const base = commitTyped().kg;
          setEntryError(false);
          setKg(stepBodyweightKg(base, s, unit));
        }}
        className="flex h-[44px] min-w-[44px] flex-1 items-center justify-center rounded-[var(--radius-md)] bg-(--color-surface-alt) font-semibold text-(--color-ink) text-[length:var(--text-md)] tabular-nums active:bg-(--color-line) disabled:opacity-60"
      >
        {s > 0 ? "+" : "−"}
        {label}
      </button>
    );
  };

  // [개선] 패널 안 내용을 한 덩어리로 — 포탈 시트와 안에 끼우는 모양(inline · 프로필 「체중」 시트)이 같은 입력·저장을 쓴다
  const content = (
    <>
      {/* 제목 — 안에 끼울 때는 바깥 시트가 제목을 갖는다(이 덩어리는 fieldset 의 이름으로만) */}
      {/* [개선] 안에 끼운 모양의 보이는 제목 한 줄(패널 안 목표·고치기 · 리뷰 M-3) — 제목 요소가 아니라 fieldset 이름과 같은 글자 */}
      {inline && inlineShowTitle ? (
        <p
          data-testid={`${testId}-title`}
          className="font-semibold text-(--color-ink) text-[length:var(--text-sm)]"
        >
          {title}
        </p>
      ) : null}
      {inline ? null : (
        <h2
          id={`${testId}-title`}
          // 포탈이 붙는 순간 한 번 제목에 포커스 — 입력칸이 아니라(키보드가 뜨지 않게 · U-7 ③)
          ref={(el) => {
            if (el && !focused.current) {
              focused.current = true;
              el.focus();
            }
          }}
          tabIndex={-1}
          className="font-bold text-(--color-ink) text-[length:var(--text-lg)] outline-none"
        >
          {title}
        </h2>
      )}
      {last !== undefined ? (
        <p className="text-(--color-ink2) text-[length:var(--text-sm)]" data-testid="weighin-last">
          {last
            ? t("bodyweight.lastValue", {
                value: `${formatBodyweight(last.kg, unit)}${unit}`,
                date: formatBodyweightDate(last.measuredAt),
              })
            : t("bodyweight.noLast")}
        </p>
      ) : null}

      <div className="mt-[var(--spacing-xs)] flex min-h-[48px] items-center justify-center gap-[var(--spacing-sm)]">
        {typing ? (
          <label className="flex items-baseline gap-[4px]">
            <span className="sr-only">{t("bodyweight.inputLabel", { unit })}</span>
            <input
              data-testid="weighin-input"
              inputMode="decimal"
              // 눌러서 연 칸이라 여기서는 포커스한다(사람이 고른 동작) — 붙는 순간 한 번
              ref={(el) => {
                if (el && document.activeElement !== el && !el.dataset.focused) {
                  el.dataset.focused = "1";
                  el.focus();
                  el.select();
                }
              }}
              value={draft}
              enterKeyHint="done"
              onChange={(e) => {
                setDraft(e.target.value);
                setEntryError(false);
              }}
              onBlur={() => commitTyped()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTyped();
                }
              }}
              className="w-[120px] rounded-[var(--radius-md)] border border-(--color-line-strong) bg-(--color-surface) px-[var(--spacing-sm)] text-center font-bold text-(--color-ink) text-[32px] tabular-nums leading-tight"
            />
            <span className="text-(--color-ink2) text-[length:var(--text-md)]">{unit}</span>
          </label>
        ) : (
          <button
            type="button"
            data-testid="weighin-value"
            aria-label={`${t("bodyweight.directInput")} — ${shown}${unit}`}
            onClick={() => {
              setDraft(shown);
              setEntryError(false);
              setTyping(true);
            }}
            className="flex min-h-[44px] items-baseline gap-[4px] rounded-[var(--radius-md)] px-[var(--spacing-sm)]"
          >
            <span className="font-bold text-(--color-ink) text-[32px] tabular-nums leading-tight">
              {shown}
            </span>
            <span className="text-(--color-ink2) text-[length:var(--text-md)]">{unit}</span>
          </button>
        )}
        {typing ? (
          // 숫자 키패드에 Enter 가 없는 기기(iOS)에서 입력을 확정하는 길(qa P3-7) — 누르기 시작할 때 blur 가 확정한다
          <button
            type="button"
            data-testid="weighin-input-done"
            onClick={() => commitTyped()}
            className="flex h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-pill)] border border-(--color-line-strong) px-[var(--spacing-sm)] font-medium text-(--color-ink) text-[length:var(--text-sm)]"
          >
            {t("bodyweight.done")}
          </button>
        ) : (
          <button
            type="button"
            data-testid="weighin-type"
            onClick={() => {
              setDraft(shown);
              setEntryError(false);
              setTyping(true);
            }}
            className="flex h-[44px] items-center rounded-[var(--radius-pill)] px-[var(--spacing-sm)] text-(--color-ink2) text-[length:var(--text-sm)] underline underline-offset-2"
          >
            {t("bodyweight.directInput")}
          </button>
        )}
      </div>

      {entryError ? (
        <p
          role="alert"
          data-testid="weighin-entry-error"
          className="text-center text-(--color-bad) text-[length:var(--text-sm)]"
        >
          {t("bodyweight.entryOutOfRange", {
            min: Math.ceil(fromKg(WEIGH_IN_MIN_ENTRY_KG, unit)),
            max: Math.floor(fromKg(BODYWEIGHT_MAX_KG, unit)),
            unit,
          })}
        </p>
      ) : null}

      <div className="mt-[var(--spacing-xs)] flex flex-col gap-[6px]" data-testid="weighin-steps">
        <div className="flex gap-[6px]">{[-steps[2], -steps[1], -steps[0]].map(stepBtn)}</div>
        <div className="flex gap-[6px]">{[steps[0], steps[1], steps[2]].map(stepBtn)}</div>
      </div>

      {inbody ? (
        <div className="mt-[var(--spacing-sm)]" data-testid="weighin-inbody">
          {/* [원본] 펼침 버튼 — 「인바디 수치도 적기 ›」/「인바디 수치 접기 ⌄」(aria-expanded). 누르지 않으면 칸이 없었다
          <button
            type="button"
            data-testid="weighin-inbody-toggle"
            aria-expanded={inbodyOpen}
            onClick={() => setInbodyOpen((o) => !o)}
            className="flex min-h-11 w-full items-center gap-[var(--spacing-xs)] text-left text-(--color-ink) text-[length:var(--text-sm)]"
          >
            <Icon
              name={inbodyOpen ? "chevron-down" : "chevron-forward"}
              size={16}
              color="var(--color-ink2)"
            />
            <span className="font-medium">
              {t(inbodyOpen ? "bodyweight.inbodyHide" : "bodyweight.inbodyToggle")}
            </span>
          </button> */}
          {inbodyOpen ? (
            <div className="flex flex-col gap-[6px]">
              {/* [원본] <p className="text-(--color-ink2) text-[length:var(--text-xs)]">{t("bodyweight.inbodyOptional")}</p> */}
              {/* [개선] 소제목 「인바디 수치」 — 토글 글자가 하던 이름표를 잇는다(「선택 · 비워 두면…」 꼬리는 SPEC-055 Phase 4 에서 없앰) */}
              <p className="flex flex-wrap items-baseline gap-x-[var(--spacing-xs)] text-[length:var(--text-sm)]">
                <span className="font-medium text-(--color-ink)">{t("bodyweight.inbodyTitle")}</span>
                {/* [원본] <span
                  className="text-(--color-ink2) text-[length:var(--text-xs)]"
                  data-testid="weighin-inbody-optional"
                >
                  {t("bodyweight.inbodyOptional")}
                </span> */}
                {/* [개선] 설명 줄 없앰(SPEC-055 Phase 4) */}
              </p>
              {(
                [
                  [
                    "smm",
                    "bodyweight.smmLabel",
                    "kg",
                    smmText,
                    setSmmText,
                    smmError,
                    setSmmError,
                    "bodyweight.smmRange",
                    SMM_MIN_KG,
                    SMM_MAX_KG,
                  ],
                  [
                    "pbf",
                    "bodyweight.pbfLabel",
                    "%",
                    pbfText,
                    setPbfText,
                    pbfError,
                    setPbfError,
                    "bodyweight.pbfRange",
                    PBF_MIN,
                    PBF_MAX,
                  ],
                ] as const
              ).map(([key, label, suffix, text, setText, err, setErr, rangeKey, min, max]) => (
                <div key={key}>
                  <label className="flex min-h-11 items-center justify-between gap-[var(--spacing-sm)] text-(--color-ink) text-[length:var(--text-sm)]">
                    <span>{t(label)}</span>
                    <span className="flex items-baseline gap-[4px]">
                      <input
                        data-testid={`weighin-${key}`}
                        inputMode="decimal"
                        enterKeyHint="done"
                        value={text}
                        aria-invalid={err || undefined}
                        aria-describedby={err ? `weighin-${key}-error` : undefined}
                        onChange={(e) => {
                          setText(e.target.value);
                          setErr(false);
                        }}
                        className={`h-11 w-[96px] rounded-[var(--radius-md)] border bg-(--color-surface) px-[var(--spacing-sm)] text-right text-(--color-ink) text-[length:var(--text-md)] tabular-nums ${err ? "border-(--color-bad)" : "border-(--color-line-strong)"}`}
                      />
                      <span className="w-[20px] text-(--color-ink2)">{suffix}</span>
                    </span>
                  </label>
                  {err ? (
                    <p
                      id={`weighin-${key}-error`}
                      role="alert"
                      data-testid={`weighin-${key}-error`}
                      className="text-right text-(--color-bad) text-[length:var(--text-xs)]"
                    >
                      {t(rangeKey, { min, max })}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {extra ? <div className="mt-[var(--spacing-sm)]">{extra}</div> : null}

      {jumpAsk != null && jumpAsk === kg && refKg != null ? (
        <p
          role="alert"
          data-testid="weighin-jump-confirm"
          className="mt-[var(--spacing-sm)] text-(--color-ink) text-[length:var(--text-sm)]"
        >
          {t("bodyweight.jumpConfirm", { value: `${formatBodyweight(refKg, unit)}${unit}` })}
        </p>
      ) : null}

      {/* [원본] mt-md flex gap-sm — 인바디 칸이 붙어 50dvh 를 넘으면 저장 줄이 아래로 숨었다 → 시트 바닥에 붙인다(REV-096 M-1) */}
      {/* [원본] <div className="sticky bottom-0 mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)] bg-(--color-surface) pt-[var(--spacing-xs)]"> */}
      {/* [개선] 안에 끼울 때는 바닥에 붙이지 않는다(밑의 지난 기록 목록을 가리지 않게) · 둘째 버튼 없음 — 닫기는 바깥 시트가 */}
      <div
        className={
          inline
            ? "mt-[var(--spacing-sm)] flex gap-[var(--spacing-sm)]"
            : "sticky bottom-0 mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)] bg-(--color-surface) pt-[var(--spacing-xs)]"
        }
      >
        {/* [원본] {inline ? null : ( */}
        {inline && !inlineSecondary ? null : (
          <button
            type="button"
            data-testid="weighin-secondary"
            onClick={secondary}
            disabled={busy}
            className="h-[44px] flex-1 rounded-[var(--radius-md)] border border-(--color-line-strong) font-semibold text-(--color-ink) text-[length:var(--text-md)] disabled:opacity-60"
          >
            {secondaryLabel}
          </button>
        )}
        <button
          type="button"
          ref={saveBtnRef}
          data-testid="weighin-save"
          onClick={save}
          disabled={busy}
          aria-busy={busy}
          // [원본] className="h-[44px] flex-1 rounded-[var(--radius-md)] bg-(--color-brand) font-semibold text-(--color-on-brand) …"
          className={`h-[44px] flex-1 rounded-[var(--radius-md)] font-semibold text-[length:var(--text-md)] disabled:opacity-60 ${
            primaryVariant === "outline"
              ? "border border-(--color-brand) bg-(--color-card) text-(--color-brand)"
              : "bg-(--color-brand) text-(--color-on-brand)"
          }`}
        >
          {jumpAsk != null && jumpAsk === kg ? t("bodyweight.saveAnyway") : primaryLabel}
        </button>
      </div>
    </>
  );

  if (inline)
    return (
      // 묶음 이름 = title(「체중 기록」) — fieldset 은 min-content 너비를 고집해 좁은 화면에서 넘치므로 min-w-0
      <fieldset data-testid={testId} aria-label={title} className="m-0 min-w-0 border-0 p-0">
        {content}
      </fieldset>
    );
  if (!root) return null;

  return createPortal(
    <div data-testid={testId} className="fixed inset-0 z-50 flex items-end justify-center">
      {/* 스크림 — 포커스·낭독 대상이 아니다(같은 이름 버튼이 대화상자 밖에 하나 더 들리지 않게 · qa P3-5 ①). Esc·둘째 버튼이 같은 동작 */}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="weighin-scrim"
        onPointerDown={() => {
          scrimDownWhileTyping.current = typingRef.current;
        }}
        onClick={() => {
          // 직접 입력 중이었다 — 닫지 않고 입력만 확정(키보드 내리기 · qa P3-7). 다음 누름에 닫는다
          if (scrimDownWhileTyping.current || typingRef.current) {
            scrimDownWhileTyping.current = false;
            commitTyped();
            return;
          }
          if (closed.current) return;
          closed.current = true;
          onDismiss();
        }}
        className="absolute inset-0 bg-black/50"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testId}-title`}
        data-testid="weighin-panel"
        // 높이 ≤ 50dvh — 헤더 타이머가 시트 위로 보인다(U-7). 내용이 넘치면 시트 안에서 스크롤.
        //   2026-11-10 체중 패널 통일 뒤로 이 포탈 모양을 그리는 곳은 없다(WeighInCheckin 은 주석 처리 · 고치기·목표·통계 기록은 패널 안 inline)
        className="relative max-h-[50dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[var(--radius-lg)] bg-(--color-surface) px-[var(--spacing-lg)] pt-[var(--spacing-md)] pb-[calc(var(--spacing-md)+env(safe-area-inset-bottom))]"
      >
        {content}
      </div>
    </div>,
    root,
  );
}

/** 이력 → 시트의 「지난 기록」 한 줄 */
export function lastEntryOf(logs: readonly BodyweightLogLike[]): { kg: number; measuredAt: number } | null {
  const l = latest(logs);
  return l ? { kg: l.weightKg, measuredAt: l.measuredAt } : null;
}

type Gate = { last: { kg: number; measuredAt: number } | null };

/**
 * 운동 화면 첫 진입의 체크인(U-7). 운동마다 한 번만 판정한다 — 화면을 연 채 설정을 켜도 그 운동에서는 뜨지 않는다.
 * 띄우는 순간 `weighin:<workoutId>` 를 남긴다 → 새로고침·다시 들어와도 같은 운동에서 다시 뜨지 않는다(sessionStorage 가 아니라 localStorage).
 */
// [개선] 지금은 그리지 않는다(ActiveWorkout 주석). 다시 켜면 포탈 시트 높이를 50dvh 로 돌려야 헤더 타이머가 보인다(U-7 · 리뷰 L-4)
export function WeighInCheckin({ workoutId, startedAt }: { workoutId: string; startedAt: number }) {
  const { user, bodyweightKg, refresh } = useUser();
  const toast = useToast();
  const [gate, setGate] = useState<Gate | null>(null);
  const judged = useRef<string | null>(null);
  const unit = bodyweightUnitOf(user?.weightUnit);

  useEffect(() => {
    if (judged.current === workoutId) return;
    judged.current = workoutId;
    clearWeighInMarks({ keep: workoutId }); // 끝난 운동들의 남은 표시를 걷는다
    if (!readWeighInEnabled() || hasWeighInMark(workoutId)) return;
    // [원본] 표시는 비동기 판정이 끝난 뒤(setGate 직전)에 남겼다 — 같은 운동을 탭 두 개로 열면 둘 다 판정을 통과해 시트가 두 번 떴다.
    // [개선] 판정을 시작할 때 먼저 남기고(다른 탭은 이 표시를 보고 멈춘다), 띄우지 않기로 하면·판정이 끊기면 지운다(qa P3-9).
    setWeighInMark(workoutId);
    let cancelled = false;
    let decided = false;
    const release = () => clearWeighInMarks({ workoutId });
    void (async () => {
      try {
        const [w, bw] = await Promise.all([
          import("@app/core/data/workoutRepository"),
          import("@app/core/data/bodyweightRepository"),
        ]);
        const wes = await w.queryWorkoutExercises(workoutId).fetch();
        let doneSets = 0;
        for (const we of wes)
          doneSets += (await w.querySetLogs(we.id).fetch()).filter((s) => s.done === true).length;
        const now = Date.now();
        const today = localDayRange(now);
        const todayLogs = (await bw.listBodyweightLogs(today)).map(bw.toBodyweightLogLike);
        const offer = shouldOfferWeighIn({
          enabled: readWeighInEnabled(),
          doneSets,
          startedAt,
          now,
          loggedToday: hasLogOnLocalDay(todayLogs, now),
          marked: false, // 위에서 확인하고 이 판정이 남긴 표시다
        });
        if (cancelled) return;
        if (!offer) {
          decided = true;
          release();
          return;
        }
        const all = (await bw.listBodyweightLogs()).map(bw.toBodyweightLogLike);
        if (cancelled) return;
        decided = true;
        setGate({ last: lastEntryOf(all) });
      } catch {
        // 판정 실패 — 띄우지 않는다(운동을 막지 않는다)
        if (!cancelled) {
          decided = true;
          release();
        }
      }
    })();
    return () => {
      cancelled = true;
      judged.current = null;
      // 판정 도중 끊겼다(StrictMode 재실행·화면 이탈) — 남긴 표시를 걷어 다음 판정이 다시 볼 수 있게
      if (!decided) release();
    };
  }, [workoutId, startedAt]);

  if (!gate) return null;
  const close = () => setGate(null);
  return (
    <WeighInSheet
      testId="weighin-sheet"
      title={t("bodyweight.sheetCheckinTitle")}
      unit={unit}
      // 지난 값 = 「내 체중」(미러 — resolveBodyweightKg 의 캐시). 미설정이면 지난 측정, 그것도 없으면 출발값
      initialKg={bodyweightKg ?? gate.last?.kg ?? null}
      last={gate.last}
      primaryLabel={t("bodyweight.save")}
      secondaryLabel={t("bodyweight.skip")}
      trapBack
      onDismiss={close}
      onSave={async (kg) => {
        try {
          const repo = await import("@app/core/data/bodyweightRepository");
          await repo.addBodyweightLog({ weight: kg, unit: "kg", source: "checkin" });
          await afterBodyweightWrite(refresh);
          toast(t("bodyweight.saved"));
          close();
        } catch (e) {
          toast(errorText(e, t("bodyweight.saveFailed")), "error");
          throw e;
        }
      }}
    />
  );
}

/**
 * 운동 화면 맨 위 「오늘 체중」 한 줄(SPEC-049 Phase 2 · S-4) — 시작하자마자 뜨던 체크인 시트(WeighInCheckin) 대신.
 * 팝업이 아니고 안 써도 운동이 막히지 않는다. 오늘(로컬 날짜) 기록이 없으면 「오늘 체중 기록 · 지난 72.5kg」,
 * 있으면 「오늘 체중 72.6kg ✓」 — 누르면 같은 시트로 그날 가장 최근 줄을 고친다(latestOnLocalDay).
 * 날짜는 ActiveWorkout 이 매초 넘기는 now 로 판정한다 — 자정을 넘기면 다시 「오늘 체중 기록」.
 * 모양은 SPEC-046 「다른 창을 여는 줄」 — 바탕 없는 줄 + 아이콘 + › · 누르는 자리 44px.
 * [개선] 2026-11-10 사용자 요청 — 운동 중에는 밑에서 올라오는 시트를 띄우지 않는다. 「기록/고치기 ⌄」를 누르면 같은 입력
 *   (WeighInSheet inline · ±·직접 입력·인바디 칸·±30% 확인·저장)이 카드 안에 펼쳐지고, 저장하면 접히며 값·✓ 가 반영된다. 다시 누르면 접힘.
 * [개선] 2026-11-10 사용자 지시 — 「기록/고치기」 버튼을 없애고 카드 머리 ⌄/⌃ 하나로: 펼치면 입력이 열리고, 접거나 저장·Esc 면 닫힌다.
 */
// [원본] const WEIGHIN_CARD_KEY = "liftgram.weighinCardCollapsed"; — 접힘 기억을 쓰지 않는다(2026-11-10 · 아래 [원본] 참고)

export function WeighInRow({ now }: { now: number }) {
  const { user, bodyweightKg, refresh } = useUser();
  const { logs, loaded } = useBodyweightLogs();
  const toast = useToast();
  // [원본] const [open, setOpen] = useState(false); — 고칠 줄을 매초 다시 판정해 연 사이 생긴 남의 줄을 덮었다(P1-2 리뷰)
  // [개선] 열 때 고칠 줄 id 를 고정한다(null = 새 줄). 저장 때 그 줄이 사라졌으면 새로 쓴다
  // [원본] useState<{ id: string | null } | null>(null)
  // [개선] 열 때 그 줄의 값도 기억 — 손대지 않은 체중은 덮지 않고(같은 줄을 아래 「지난 기록」에서 고쳤어도), 그 줄이 사라져 새로 쓸 때는
  //   보이던 인바디를 잃지 않는다(2026-11-10 리뷰 M-1·M-2)
  const [target, setTarget] = useState<{
    id: string | null;
    startKg: number | null;
    smm: number | null;
    pbf: number | null;
  } | null>(null);
  const openTarget = (
    row: {
      id: string;
      weightKg: number;
      skeletalMuscleKg?: number | null;
      bodyFatPct?: number | null;
    } | null,
  ) => ({
    id: row?.id ?? null,
    startKg: row?.weightKg ?? null,
    smm: row?.skeletalMuscleKg ?? null,
    pbf: row?.bodyFatPct ?? null,
  });
  /* [원본] 접기 — 기기에 기억(운동마다 다시 펼치지 않게). 저장소가 막혀도 펼친 채로 동작
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(WEIGHIN_CARD_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleCollapsed = () => { setTarget(null); setCollapsedStored(); };
  const setCollapsedStored = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(WEIGHIN_CARD_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  */
  // [개선] 펼침 = 입력이 열림(2026-11-10 「기록/고치기」 버튼 없앰 — 머리 ⌄/⌃ 하나). 운동마다 접힌 채로 시작한다
  //   (펼친 기억을 따르면 입력칸이 매번 열린다) — 옛 기억 키(liftgram.weighinCardCollapsed)는 읽지도 쓰지도 않는다
  const [collapsed, setCollapsed] = useState(true);
  // 펼치면 바로 입력(오늘 줄이 있으면 그 줄 고치기), 접으면 닫는다 — 두 값을 같은 근거(지금 collapsed)로 함께 정한다
  const toggleCollapsed = () => {
    const opening = collapsed;
    setTarget(opening ? openTarget(today) : null);
    setCollapsed(!opening);
  };
  // 저장·Esc — 입력과 카드를 함께 접는다. 뒤집지 않고 「접힘」으로 정한다(저장 중에 머리를 눌러 이미 접혔어도 다시 펼치지 않게 · 리뷰 M-1)
  const closeEditor = () => {
    setTarget(null);
    setCollapsed(true);
  };
  const unit = bodyweightUnitOf(user?.weightUnit);
  // [개선] 펼친 입력을 닫으면(저장·다시 누름) 포커스를 「기록/고치기」 버튼으로 — 저장 버튼이 사라져 body 로 빠지지 않게
  const editBtnRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    const open = target != null;
    if (wasOpen.current && !open) {
      const a = document.activeElement;
      if (!a || a === document.body) editBtnRef.current?.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [target]);
  // 옛 체크인이 남긴 `weighin:<운동>` 표시를 한 번 걷는다(체크인을 막아 더는 지우는 곳이 없다 · P1-2 리뷰)
  useEffect(() => {
    clearWeighInMarks({});
  }, []);
  // 읽기 전에는 자리만(줄이 나타나며 세트 표가 밀리지 않게)
  if (!loaded)
    return <div className="mb-[var(--spacing-sm)] h-11" aria-hidden data-testid="weighin-row-pending" />;
  // [원본] const today = latestOnLocalDay(logs, now); — 오늘 측정 뒤 「설정 안 함」 표식이 있어도 ✓ 로 보였다(P1-2 리뷰)
  const today = weighInRowTarget(logs, now);
  const editing = target?.id ? (logs.find((l) => l.id === target.id) ?? null) : null;
  const sheetRow = target ? editing : today;
  // 「지난 기록」·±30% 기준 = 오늘 고칠 줄을 뺀 가장 최근 기록
  const before = lastEntryOf(sheetRow ? logs.filter((l) => l.id !== sheetRow.id) : logs);
  const fmt = (kg: number) => `${formatBodyweight(kg, unit)}${unit}`;
  // [원본] 한 줄 글(rowDone·rowLogLast·rowLog) — 카드에서는 제목·상태·지난 기록으로 나눴다
  /* [원본] 바탕 없는 한 줄(사람 아이콘 + 글 + ›) — 눈에 안 띄었고 사람 아이콘이 「오늘 근육」 버튼과 겹쳤다(11-09 사용자 지적)
  return (
    <>
      <button type="button" data-testid="weighin-row" data-done={today ? "1" : "0"} … onClick={() => setTarget({ id: today?.id ?? null })}
        className="mb-[var(--spacing-sm)] flex min-h-11 w-full items-center … active:bg-(--color-surface-alt)">
        <Icon name="body-outline" … /> <span …>{label}</span> {today ? <Icon name="checkmark" … /> : null} <Icon name="chevron-forward" … />
      </button>
  */
  // [개선] 운동 종목과 같은 카드 · 저울 아이콘 · 접기(접은 상태는 기기에 기억). 펼치면 오늘 값·지난 기록·인바디·「기록/고치기」
  const smm = today?.skeletalMuscleKg;
  const pbf = today?.bodyFatPct;
  const inbodyText = [
    smm != null ? `${t("bodyweight.smmLabel")} ${smm.toFixed(1)}kg` : null,
    pbf != null ? `${t("bodyweight.pbfLabel")} ${pbf.toFixed(1)}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // [개선] 저장 — 열 때 고정한 줄(target.id)을 고치고, 그 줄이 사라졌으면 새로 쓴다(옛 시트의 onSave 그대로) · 끝나면 접는다
  const saveToday = async (kg: number, extras?: Partial<InbodyValues>) => {
    try {
      const repo = await import("@app/core/data/bodyweightRepository");
      const id = target?.id ?? null;
      const still = id ? (await repo.listBodyweightLogs()).some((l) => l.id === id) : false;
      // [원본] if (id && still) await repo.updateBodyweightLog(id, { weight: kg, unit: "kg", ...(extras ?? {}) });
      // [원본] else await repo.addBodyweightLog({ weight: kg, unit: "kg", source: "checkin", ...(extras ?? {}) });
      // [개선] 고치기 — 바뀐 것만(체중은 연 값과 다를 때만 · 인바디는 extras 가 이미 바뀐 칸만). 새로 쓰기 — 연 줄의 인바디 위에 extras
      if (id && still) {
        const patch = {
          ...(kg !== target?.startKg ? { weight: kg, unit: "kg" as const } : {}),
          ...(extras ?? {}),
        };
        if (Object.keys(patch).length > 0) await repo.updateBodyweightLog(id, patch);
      } else
        await repo.addBodyweightLog({
          weight: kg,
          unit: "kg",
          source: "checkin",
          ...(id ? { skeletalMuscleKg: target?.smm ?? null, bodyFatPct: target?.pbf ?? null } : {}),
          ...(extras ?? {}),
        });
      await afterBodyweightWrite(refresh);
      toast(t("bodyweight.saved"));
      // [원본] setTarget(null);
      closeEditor();
    } catch (e) {
      toast(errorText(e, t("bodyweight.saveFailed")), "error");
      throw e;
    }
  };
  const status = today
    ? fmt(today.weightKg)
    : before
      ? t("bodyweight.cardNotYetLast", { value: fmt(before.kg) })
      : t("bodyweight.cardNotYet");
  return (
    <>
      {/* [원본] <Card className="mb-[var(--spacing-lg)]" … */}
      {/* [개선] 평평한 기록지 시험판 — 상자 대신 아래 구분선 */}
      <Card
        className="rounded-none! border-x-0! border-t-0! bg-transparent! px-0! py-[var(--spacing-md)]!"
        data-testid="weighin-card"
        data-done={today ? "1" : "0"}
      >
        <button
          type="button"
          data-testid="weighin-card-toggle"
          ref={editBtnRef}
          aria-expanded={!collapsed}
          // [원본] aria-controls="weighin-card-body" — [개선] 펼치면 본문과 입력이 함께 나타난다(리뷰 L-1)
          aria-controls="weighin-card-body weighin-card-editor"
          onClick={() => toggleCollapsed()}
          className="flex min-h-11 w-full items-center gap-[var(--spacing-sm)] rounded-[var(--radius-md)] text-left focus-visible:outline-2 focus-visible:outline-(--color-brand)"
        >
          {/* [원본] … rounded-[var(--radius-md)] bg-(--color-surface-alt) 판 · [개선] 아이콘만(SPEC-056 F5) */}
          <span className="flex h-11 w-11 shrink-0 items-center justify-center">
            <Icon name="scale-outline" size={22} color={today ? "var(--color-brand)" : "var(--color-ink2)"} />
          </span>
          <span className="min-w-0 flex-1 truncate whitespace-nowrap font-bold text-(--color-ink) text-[length:var(--text-lg)]">
            {t("bodyweight.sheetCheckinTitle")}
          </span>
          {collapsed ? (
            <span
              data-testid="weighin-card-summary"
              className="flex min-w-0 shrink items-center gap-[4px] truncate text-(--color-ink2) text-[length:var(--text-sm)] tabular-nums"
            >
              <span className="truncate">{status}</span>
              {today ? <Icon name="checkmark" size={16} color="var(--color-brand)" /> : null}
            </span>
          ) : null}
          <Icon name={collapsed ? "chevron-down" : "chevron-up"} size={20} color="var(--color-ink2)" />
        </button>
        {collapsed ? null : (
          <div
            id="weighin-card-body"
            className="mt-[var(--spacing-md)] flex items-center gap-[var(--spacing-md)]"
            data-testid="weighin-card-body"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-[6px]">
                <span
                  data-testid="weighin-card-value"
                  className={`tabular-nums ${today ? "font-bold text-(--color-ink) text-[length:var(--text-xl)]" : "text-(--color-ink2) text-[length:var(--text-md)]"}`}
                >
                  {today ? fmt(today.weightKg) : t("bodyweight.cardNotYet")}
                </span>
                {today ? <Icon name="checkmark-circle" size={20} color="var(--color-brand)" /> : null}
              </div>
              {inbodyText ? (
                <p className="truncate text-(--color-ink2) text-[length:var(--text-sm)] tabular-nums">
                  {inbodyText}
                </p>
              ) : null}
              {before ? (
                <p className="truncate text-(--color-ink3) text-[length:var(--text-sm)] tabular-nums">
                  {t("bodyweight.cardLast", {
                    value: fmt(before.kg),
                    date: formatBodyweightDate(before.measuredAt),
                  })}
                </p>
              ) : null}
            </div>
            {/* [원본] <Button title={today ? 고치기 : 기록} variant="outline" size="sm" fullWidth={false} testId="weighin-row"
                  className="min-h-11 shrink-0 self-center! px-[var(--spacing-lg)]!" onPress={() => setTarget({ id: today?.id ?? null })} />
                  — 누르면 바닥 시트(weighin-sheet)가 올라왔다 */}
            {/* [원본] 「기록/고치기 ⌄」 버튼(data-testid="weighin-row") — 머리 ⌄/⌃ 와 둘이라 하나로 합쳤다(2026-11-10 사용자 지시)
                            {/* [개선] 같은 모양(outline sm · 카드 판 + 빨간 테두리·글자) + ⌄/⌃ — 카드 안 입력을 펼치고 접는다(aria-expanded) * /}
                            <button
                              type="button"
                              ref={editBtnRef}
                              data-testid="weighin-row"
                              aria-expanded={target != null}
                              aria-controls={target ? "weighin-card-editor" : undefined}
                              // [원본] onClick={() => setTarget((cur) => (cur ? null : { id: today?.id ?? null }))}
                              onClick={() => setTarget((cur) => (cur ? null : openTarget(today)))}
                              className="relative inline-flex min-h-11 shrink-0 items-center justify-center gap-[4px] self-center rounded-[var(--radius-sm)] border border-(--color-brand) border-solid bg-(--color-card) px-[var(--spacing-md)] font-semibold text-(--color-brand) text-[length:var(--text-sm)] focus-visible:outline-2 focus-visible:outline-(--color-brand) focus-visible:outline-offset-2 active:opacity-85"
                            >
                              {today ? t("bodyweight.edit") : t("bodyweight.record")}
                              <Icon name={target ? "chevron-up" : "chevron-down"} size={16} color="var(--color-brand)" />
                            </button>
            */}
          </div>
        )}
        {/* [개선] 카드 안 입력(운동 화면엔 시트를 띄우지 않는다) — 프로필 「체중」 시트의 바로 입력과 같은 inline 모양 */}
        {/* [원본] {target && !collapsed ? ( — [개선] 펼침 = 입력 열림 */}
        {!collapsed && target ? (
          // biome-ignore lint/a11y/noStaticElementInteractions: 안의 입력에서 올라온 Esc 만 받아 접는다 — 누르는 자리가 아니다
          <div
            id="weighin-card-editor"
            data-testid="weighin-card-editor"
            // Esc = 접기(키보드 사용자가 「기록/고치기」로 돌아가지 않아도 · 포커스는 그 버튼으로 · 리뷰 L-3)
            //   패널 안 확인 창(포탈)의 Esc 는 React 트리로 여기까지 올라온다 — 이 묶음 DOM 안에서 눌린 것만 받는다
            onKeyDown={(e) => {
              if (e.key === "Escape" && e.currentTarget.contains(e.target as Node)) {
                e.stopPropagation();
                // [원본] setTarget(null);
                closeEditor();
              }
            }}
            className="mt-[var(--spacing-md)] border-(--color-line) border-t pt-[var(--spacing-sm)]"
          >
            {/* [원본] 바로 입력 하나(WeighInSheet inline testId="weighin-editor")
                [개선] 체중 패널(프로필·통계와 같은 구역·testid) — 맨 위 오늘 입력, 목표·지난 기록은 「목표 · 지난 기록 ⌄」 아래(2026-11-10) */}
            <BodyweightPanel
              compact
              entry={
                <WeighInSheet
                  inline
                  testId="bodyweight-entry"
                  // 운동 화면의 빨강 채움은 「완료」 하나 — 카드 안 저장은 테두리(리뷰 M-1)
                  primaryVariant="outline"
                  title={target.id ? t("bodyweight.sheetTodayEditTitle") : t("bodyweight.sheetCheckinTitle")}
                  unit={unit}
                  initialKg={editing?.weightKg ?? bodyweightKg ?? before?.kg ?? null}
                  // 「지난 72.5kg · 날짜」는 카드 본문에 이미 있다 — 지난 기록이 하나도 없을 때만 「값을 맞춰 주세요」 줄
                  // [원본] last={before ? undefined : null}
                  // [개선] 오늘 줄을 고칠 때는 그 값이 진짜 값 — 「값을 맞춰 주세요」를 띄우지 않는다
                  last={before || target.id ? undefined : null}
                  compareKg={before?.kg ?? null}
                  inbody={{
                    skeletalMuscleKg: editing?.skeletalMuscleKg ?? null,
                    bodyFatPct: editing?.bodyFatPct ?? null,
                  }}
                  primaryLabel={t("bodyweight.save")}
                  secondaryLabel={t("common.cancel")}
                  // [원본] onDismiss={() => setTarget(null)}
                  onDismiss={closeEditor}
                  onSave={saveToday}
                />
              }
            />
          </div>
        ) : null}
      </Card>
      {/* [원본] 바닥 시트 — 운동 화면 위로 올라오던 「오늘 체중」 시트(trapBack · 취소 · 스크림). 저장은 아래 saveToday 로 옮겼다
      {target ? (
        <WeighInSheet
          testId="weighin-sheet"
          title={target.id ? t("bodyweight.sheetTodayEditTitle") : t("bodyweight.sheetCheckinTitle")}
          unit={unit}
          initialKg={editing?.weightKg ?? bodyweightKg ?? before?.kg ?? null}
          last={before}
          compareKg={before?.kg ?? null}
          inbody={{
            skeletalMuscleKg: editing?.skeletalMuscleKg ?? null,
            bodyFatPct: editing?.bodyFatPct ?? null,
          }}
          primaryLabel={t("bodyweight.save")}
          secondaryLabel={t("common.cancel")}
          // 열린 채 뒤로 가기 = 시트만 닫기(운동 화면을 떠나지 않게 · P1-2 리뷰)
          trapBack
          onDismiss={() => setTarget(null)}
          onSave={async (kg, extras) => {
            try {
              const repo = await import("@app/core/data/bodyweightRepository");
              const id = target.id;
              const still = id ? (await repo.listBodyweightLogs()).some((l) => l.id === id) : false;
              if (id && still)
                await repo.updateBodyweightLog(id, { weight: kg, unit: "kg", ...(extras ?? {}) });
              else
                await repo.addBodyweightLog({ weight: kg, unit: "kg", source: "checkin", ...(extras ?? {}) });
              await afterBodyweightWrite(refresh);
              toast(t("bodyweight.saved"));
              setTarget(null);
            } catch (e) {
              toast(errorText(e, t("bodyweight.saveFailed")), "error");
              throw e;
            }
          }}
        />
      ) : null}
      */}
    </>
  );
}
