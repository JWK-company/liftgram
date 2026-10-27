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
import {
  BODYWEIGHT_MAX_KG,
  BODYWEIGHT_STEPS,
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
  localDayRange,
  shouldOfferWeighIn,
  weighInStartKg,
} from "@app/core/domain/weighIn";
import { fromKg, type WeightUnit } from "@app/core";
import { useUser } from "@app/core/state/userContext";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { clearWeighInMarks, hasWeighInMark, readWeighInEnabled, setWeighInMark } from "@/lib/bodyweightPref";
import { afterBodyweightWrite } from "@/lib/bodyweightLogs";
import { lang, t } from "@/lib/i18n";
import { useToast } from "../Toast";

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
  testId = "weighin-sheet",
}: {
  title: string;
  unit: WeightUnit;
  /** 출발값(kg) — null 이면 지난 값 없음(weighInStartKg) */
  initialKg: number | null;
  /** 제목 아래 한 줄 「지난 기록 75.0kg · 10/26」 — null 이면 「지난 기록이 없어요」, undefined 면 줄 없음 */
  last?: { kg: number; measuredAt: number } | null;
  primaryLabel: string;
  secondaryLabel: string;
  /** 저장(kg). 실패하면 throw — 시트는 열린 채로 남는다 */
  onSave: (kg: number) => Promise<void> | void;
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
  testId?: string;
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
  const closed = useRef(false);
  const focused = useRef(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const typingRef = useRef(false);
  typingRef.current = typing;
  /** 스크림을 누르기 시작할 때 입력 중이었나 — 누르는 순간 입력칸이 blur 되어 click 때는 이미 typing=false 다 */
  const scrimDownWhileTyping = useRef(false);

  // 연 곳(버튼)을 기억했다가 닫힐 때 돌려준다(qa P3-5 ③) — 포탈이 붙기 전 첫 effect 에서 잡는다
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setRoot(document.getElementById("modal-root"));
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // Esc = 닫기(공용 Overlay 와 같다)
  useEffect(() => {
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
    history.pushState({ ...(history.state ?? {}), liftgramWeighIn: true }, "");
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      if (closed.current) return;
      closed.current = true;
      dismissRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushed.current && history.state?.liftgramWeighIn) history.back();
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
    // 지난 값과 ±30% 넘게 다르면 한 번 더 누르게 한다(같은 값일 때만 통과 · qa P3-6)
    if (isLargeBodyweightJump(value, refKg) && jumpAsk !== value) {
      setJumpAsk(value);
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        await onSave(value);
        closed.current = true;
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

  if (!root) return null;
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
        className="relative max-h-[50dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[var(--radius-lg)] bg-(--color-surface) px-[var(--spacing-lg)] pt-[var(--spacing-md)] pb-[calc(var(--spacing-md)+env(safe-area-inset-bottom))]"
      >
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

        <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
          <button
            type="button"
            data-testid="weighin-secondary"
            onClick={secondary}
            disabled={busy}
            className="h-[44px] flex-1 rounded-[var(--radius-md)] border border-(--color-line-strong) font-semibold text-(--color-ink) text-[length:var(--text-md)] disabled:opacity-60"
          >
            {secondaryLabel}
          </button>
          <button
            type="button"
            data-testid="weighin-save"
            onClick={save}
            disabled={busy}
            aria-busy={busy}
            className="h-[44px] flex-1 rounded-[var(--radius-md)] bg-(--color-brand) font-semibold text-(--color-on-brand) text-[length:var(--text-md)] disabled:opacity-60"
          >
            {jumpAsk != null && jumpAsk === kg ? t("bodyweight.saveAnyway") : primaryLabel}
          </button>
        </div>
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
          toast(e instanceof Error ? e.message : t("bodyweight.saveFailed"), "error");
          throw e;
        }
      }}
    />
  );
}
