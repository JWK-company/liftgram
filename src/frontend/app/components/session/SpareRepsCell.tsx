"use client";
// SPEC-055 Phase 3(S-86 · B안) — 세트 줄 「여유」 칸: 몇 개 더 할 수 있었나(set_logs.rir)
//
// 「힘든 정도」 설정 없이 누구나 쓴다(옛 RirChip·RirSheet 를 대신한다 — 그 파일들은 다른 곳이 쓰는 formatRir 때문에 남긴다).
//   · 누를 때마다 비움 → 0 → 1 → 2 → 3 → 4+ → 비움. 시트는 없다. 4+ 는 4 로 저장한다(ADR-038).
//   · 옛 0.5 단위 값은 그대로 보이고, 누르면 다음 정수로 간다. 4 보다 큰 옛 값은 「4+」로 보이고 누르면 비움.
//   · 길게 누르면(500ms) 비움 — 키보드는 Delete·Backspace.
//     [개선] 0.5초 안에 8px 넘게 움직이면(스크롤) 길게 누르기를 취소 · 길게 누르기 상태는 pointerup·leave·cancel 어디서든 풀린다(REV L-2·L-3).
//   · 화면 값은 바로 바꾸고, 저장은 마지막 탭 600ms 뒤 한 번만(연타가 쓰기 대기열을 채우지 않게 · REV-118 U5).
//     칸이 사라지면(화면 이동 등) 기다리던 저장을 곧바로 보낸다.
//     [개선] pagehide·visibilitychange(hidden) 에서도 곧바로 보낸다(앱 닫기·탭 전환 · REV M-2).
//     [개선] 그 저장이 이미 지워진 세트에 가면(세트 삭제·완료 시 안 한 세트 삭제·운동 버림) 조용히 건너뛴다 — 오류 토스트 없음(REV M-1).
//     [개선] 기다리는 사이 세트가 워밍업이 되면 저장하지 않는다(SetRowEdit 가 막는다 · REV L-5).
//   · 낙관 표시: 세트 표는 행 증감만 관찰해 필드 변경이 다음 그림(≤1.5초)에 온다(메모리 「세트 입력칸 묶인 그림」).
//     저장값이 고른 값과 같아지면 저장값을 따르고, 이 저장이 끝난 **뒤에** 온 다른 저장(다른 기기 동기 등)만 고른 값을 이긴다
//     (RirChip QA CU-7 과 같은 규칙). 끝난 저장인데 5초 안에 따라오지 않으면 푼다.
//   · 완료한 세트에서도 눌린다(kg·회는 잠기지만 여유는 완료 뒤에 적는 값이다).
//   · 모양: 겉보기 32px(≤36 · U3) · 높이 40(입력칸과 같음) + 위아래 2px ::before 로 누르는 자리 44px.
//     늘어난 2px 은 세트 줄의 바깥 여백(py-[4px]) 안이라 위·아래 줄의 버튼과 겹치지 않는다.
//   · [원본] 바뀐 값은 눈에 안 보이는 aria-live="polite" 영역으로 읽어 준다(U7). 처음 그림에서는 비어 있어 읽지 않는다.
//   · [개선] 접근 이름은 보이는 글자로 시작한다(「+2 · 세트 1 여유 — 눌러서 바꾸기」 · WCAG 2.5.3 · REV M-4).
//     바뀐 값은 페이지에 하나뿐인 aria-live 영역(버튼 바깥 · body 끝)으로 짧게(「여유 2개」) — 칸마다 두지 않는다.
//   · rpe 에서 바꾼 값은 칸에 보이지 않는다 — 실제로 적은 rir 만(U8).
// [원본] import { normalizeRir } from "@app/core";
// [개선] 다음 값·글자는 core 순수 함수로(단위 시험 · REV M-5)
import { nextSpareRir, normalizeRir, SPARE_RIR_MAX, spareRirText } from "@app/core";
import { useEffect, useRef, useState } from "react";
import { errorText } from "@/lib/errorText";
import { t } from "@/lib/i18n";
import { useToast } from "../Toast";
import { formatRir } from "./RirSheet";

/** 마지막 탭 뒤 저장까지(ms) */
export const SPARE_SAVE_DELAY_MS = 600;
/** 길게 누르기(ms) — 비움 */
const LONG_PRESS_MS = 500;
/** 끝난 저장 뒤에도 저장값이 따라오지 않을 때 낙관 표시를 푸는 시간(ms) */
const PENDING_MAX_MS = 5000;
// [원본] /** 4+ — 저장값 4 */
// [원본] const SPARE_MAX = 4;
// [원본]
// [원본] /** 다음 값 — 비움 → 0 → 1 → 2 → 3 → 4+ → 비움. 옛 0.5 단위는 다음 정수로, 4 이상은 비움. */
// [원본] export function nextSpare(v: number | null): number | null {
// [원본]   if (v == null) return 0;
// [원본]   if (v >= SPARE_MAX) return null;
// [원본]   return Math.floor(v) + 1;
// [원본] }
// [원본]
// [원본] /** 칸 글자 — 비움 「–」 · 0 「0」 · 「+2」 · 4 이상 「4+」 · 옛 값 「+0.5」 */
// [원본] export function spareText(v: number | null): string {
// [원본]   if (v == null) return "–";
// [원본]   if (v >= SPARE_MAX) return "4+";
// [원본]   if (v === 0) return "0";
// [원본]   return `+${formatRir(v)}`;
// [원본] }
// [개선] 같은 규칙을 core(domain/effort · nextSpareRir·spareRirText)로 옮겨 단위 시험을 달았다 — 이름은 그대로 내보낸다
const SPARE_MAX = SPARE_RIR_MAX;
export const nextSpare = nextSpareRir;
export const spareText = spareRirText;

/** 길게 누르기를 취소하는 움직임(px) — 스크롤하다 값이 비워지지 않게(REV L-3) */
const LONG_PRESS_SLOP_PX = 8;
/** 페이지에 하나뿐인 읽어 주기 영역 id(REV M-4) */
const LIVE_ID = "set-spare-live";

/** 지워진 세트에 간 저장 — Watermelon find 「Record … not found」 · 지움 표시된 행 update 「Not allowed to change deleted record」 */
export function isGoneRecordError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /not found|deleted record/i.test(msg);
}

/** 읽어 주기 — body 끝의 aria-live 영역 하나(없으면 만든다). 같은 글을 두 번 골라도 다시 읽게 비웠다가 넣는다. */
let liveSeq = 0;
function announceSpare(text: string): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById(LIVE_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = LIVE_ID;
    el.className = "sr-only";
    el.setAttribute("aria-live", "polite");
    el.setAttribute("data-testid", LIVE_ID);
    document.body.appendChild(el);
  }
  const seq = ++liveSeq;
  el.textContent = "";
  setTimeout(() => {
    if (seq !== liveSeq) return;
    const cur = document.getElementById(LIVE_ID);
    if (cur) cur.textContent = text;
  }, 30);
}

/** 읽어 주는 값 — 「여유 2개」 · 「여유 4개 이상」 · 「여유 비움」 */
function spareSpoken(v: number | null): string {
  if (v == null) return t("effort.spareLiveEmpty");
  if (v >= SPARE_MAX) return t("effort.spareLiveMax");
  return t("effort.spareLive", { value: formatRir(v) });
}

export function SpareRepsCell({
  setId,
  setLabel,
  rir,
  savedAt,
  onSave,
}: {
  setId: string;
  /** 세트 표시 순번(「1」·「D」) — 접근 이름에 넣는다 */
  setLabel: string;
  /** 저장된 실제 RIR(null = 적지 않음) */
  rir: number | null | undefined;
  /** 세트 저장 시각(ms) — 저장이 끝난 뒤 온 다른 저장을 알아보려고 */
  savedAt: number;
  /** 저장 약속을 돌려주면(블록 write) 그 약속이 끝난 뒤에만 다른 저장을 따른다 */
  onSave: (v: number | null) => unknown;
}) {
  // 낙관 표시 — { v } 가 있으면 저장 전이라도 그 값을 보인다. done = 이 저장이 끝난 시각(null = 아직 대기·저장 중)
  const [pending, setPending] = useState<{ v: number | null; at: number; done: number | null } | null>(null);
  // [원본] const [spoken, setSpoken] = useState(""); — 칸마다 읽어 주기 영역을 두었다(REV M-4 로 페이지에 하나)
  const toast = useToast();
  const saved = normalizeRir(rir);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  // 길게 누르기 시작점 — 8px 넘게 움직이면 취소(REV L-3)
  const pressAt = useRef<{ x: number; y: number } | null>(null);
  // 기다리는 저장(600ms) — 칸이 사라질 때 곧바로 보내려고 ref 에도 둔다
  const queued = useRef<{
    v: number | null;
    mine: { v: number | null; at: number; done: number | null };
  } | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  // 보낸 저장 수 — 버튼의 data-saves 로 센다(연타 3번 = 저장 1번 시험 · REV M-5). React 가 다루지 않는 속성이라 다시 그려도 남는다
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const saves = useRef(0);

  useEffect(() => {
    if (!pending) return;
    if (pending.done == null) return; // 아직 보내지 않았거나 저장 중 — 저장값을 따르지 않는다
    if (saved === pending.v || savedAt > pending.done) setPending(null);
  }, [saved, savedAt, pending]);

  // 끝난 저장인데 저장값이 끝내 따라오지 않으면 5초 뒤 푼다 — 영영 옛 낙관값에 묶이지 않게
  useEffect(() => {
    if (!pending || pending.done == null) return;
    const wait = Math.max(0, pending.done + PENDING_MAX_MS - Date.now());
    const id = setTimeout(() => setPending((p) => (p === pending ? null : p)), wait);
    return () => clearTimeout(id);
  }, [pending]);

  // [원본] 실패하면 늘 오류 토스트였다 — (p).then(finish, (e) => { setPending(…null…); toast(errorText(e), "error"); })
  // [개선] 지워진 세트에 간 저장은 조용히 건너뛴다 — 칸이 사라지며 보낸 저장이 삭제 뒤에 줄을 서서 오류 토스트가 떴다(REV M-1)
  const send = () => {
    const q = queued.current;
    queued.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!q) return;
    const finish = () => setPending((cur) => (cur === q.mine ? { ...q.mine, done: Date.now() } : cur));
    saves.current += 1;
    btnRef.current?.setAttribute("data-saves", String(saves.current));
    const p = saveRef.current(q.v);
    if (p && typeof (p as Promise<unknown>).then === "function")
      (p as Promise<unknown>).then(finish, (e: unknown) => {
        setPending((cur) => (cur === q.mine ? null : cur));
        if (isGoneRecordError(e)) return;
        toast(errorText(e), "error");
      });
    else finish();
  };
  const sendRef = useRef(send);
  sendRef.current = send;

  // [원본] 칸이 사라지면 기다리던 저장을 곧바로 보낸다(화면 이동·세트 삭제 등)
  // [원본] useEffect(() => () => { if (pressTimer.current) clearTimeout(pressTimer.current); sendRef.current(); }, []);
  // [개선] 페이지를 떠나거나 가려질 때(pagehide · visibilitychange hidden)도 곧바로 보낸다(REV M-2)
  useEffect(() => {
    const flush = () => sendRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      if (pressTimer.current) clearTimeout(pressTimer.current);
      flush();
    };
  }, []);

  const shown = pending ? pending.v : saved;

  const choose = (v: number | null) => {
    const mine = { v, at: Date.now(), done: null as number | null };
    setPending(mine);
    // [원본] setSpoken(spareSpoken(v));
    announceSpare(spareSpoken(v));
    queued.current = { v, mine };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => sendRef.current(), SPARE_SAVE_DELAY_MS);
  };

  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressAt.current = null;
  };
  // [개선] 길게 누르기 상태 풀기(REV L-2) — cancel = 클릭이 따라오지 않는 끝(pointercancel · 누른 채 벗어남).
  // 손을 떼면(pointerup) 바로 뒤 클릭 하나만 삼키고, 클릭이 안 와도(터치 길게 누르기) 곧 풀어 다음 키보드 Enter 를 막지 않는다.
  const endPress = (cancel: boolean) => {
    clearPress();
    if (cancel) longFired.current = false;
    else if (longFired.current)
      setTimeout(() => {
        longFired.current = false;
      }, 400);
  };

  // [원본] 「세트 1 여유 2개 …」 — 보이는 글자(「+2」)로 시작하지 않았다
  // [원본] const aria =
  // [원본]   shown == null
  // [원본]     ? t("effort.spareAriaEmpty", { set: setLabel })
  // [원본]     : shown >= SPARE_MAX
  // [원본]       ? t("effort.spareAriaMax", { set: setLabel })
  // [원본]       : t("effort.spareAria", { set: setLabel, value: formatRir(shown) });
  // [개선] 보이는 글자로 시작(WCAG 2.5.3 · REV M-4) — 「+2 · 세트 1 여유 — 눌러서 바꾸기」 · 비면 「여유 없음 · 세트 1 — …」
  const aria =
    shown == null
      ? t("effort.spareAriaEmpty", { set: setLabel })
      : t("effort.spareAria", { set: setLabel, shown: spareText(shown) });

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        data-testid={`set-spare-${setId}`}
        data-rir={shown ?? ""}
        aria-label={aria}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          longFired.current = false;
          clearPress();
          pressAt.current = { x: e.clientX, y: e.clientY };
          pressTimer.current = setTimeout(() => {
            pressTimer.current = null;
            longFired.current = true;
            choose(null);
          }, LONG_PRESS_MS);
        }}
        // [개선] 0.5초 안에 8px 넘게 움직이면 길게 누르기 취소 — 스크롤하다 값이 비워지지 않게(REV L-3)
        onPointerMove={(e) => {
          const at = pressAt.current;
          if (!pressTimer.current || !at) return;
          if (Math.hypot(e.clientX - at.x, e.clientY - at.y) > LONG_PRESS_SLOP_PX) clearPress();
        }}
        // [원본] onPointerUp={clearPress} onPointerLeave={clearPress} onPointerCancel={clearPress} — 길게 누르기 상태(longFired)는 남았다
        onPointerUp={() => endPress(false)}
        // 터치는 손을 뗀 뒤에도 pointerleave 가 온다(buttons 0) — 그때는 뒤따르는 클릭을 삼켜야 하니 누른 채 벗어날 때만 푼다
        onPointerLeave={(e) => (e.buttons !== 0 ? endPress(true) : clearPress())}
        onPointerCancel={() => endPress(true)}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            choose(null);
          }
        }}
        onClick={() => {
          if (longFired.current) {
            longFired.current = false;
            return;
          }
          choose(nextSpare(shown));
        }}
        // [원본] 겉보기 32 × 40 · ::before 위아래 2px 로 누르는 높이 44 · ✓ 와 8px(gap 4 + mr 4) — className={`relative mr-[4px] …`}
        // [개선] 줄 간격이 2px 가 되어 ✓ 와 8px = gap 2 + mr 6(표 머리 head-spare 도 mr 6 · REV H-1)
        // [원본] … rounded-[var(--radius-sm)] bg-(--color-surface-alt) … — 회색 판 · [개선] 입력칸과 같은 테두리 칸(SPEC-056 F5·F7)
        className={`relative mr-[6px] flex h-10 w-[32px] shrink-0 select-none items-center justify-center rounded-[var(--radius-sm)] border border-(--color-line-strong) bg-(--color-card) text-[length:var(--text-sm)] tabular-nums [-webkit-touch-callout:none] before:absolute before:inset-x-0 before:-inset-y-[2px] before:content-[''] focus-visible:outline-2 focus-visible:outline-(--color-brand) ${
          shown == null ? "text-(--color-ink3)" : "font-semibold text-(--color-ink)"
        }`}
      >
        <span aria-hidden="true">{spareText(shown)}</span>
      </button>
      {/* [원본] 바뀐 값을 읽어 준다(U7) — 처음엔 비어 있어 아무것도 읽지 않는다
      <span className="sr-only" aria-live="polite" data-testid={`set-spare-live-${setId}`}>
        {spoken}
      </span> */}
      {/* [개선] 읽어 주기는 페이지에 하나뿐인 영역으로(announceSpare · REV M-4) */}
    </>
  );
}
