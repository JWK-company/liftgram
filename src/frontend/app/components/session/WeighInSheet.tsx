"use client";
// @plm SRS-077  체중 시트 — 운동 전 체크인 · 프로필 「기록」 · 기록 고치기 · 목표 체중이 같은 시트를 쓴다(U-7·U-8·U-9)
//
// 모양(U-8): 값을 가운데 크게, 그 아래 두 줄 [−1][−0.5][−0.1] / [+0.1][+0.5][+1](lb 는 0.2·1·2 — core BODYWEIGHT_STEPS 한 곳) · 버튼 각 ≥44.
//   직접 입력칸은 「직접 입력」을 눌러야 열린다 — 자동 포커스하면 키보드가 시트와 헤더 타이머를 덮는다(U-7 ③).
//   높이 ≤ 50dvh(헤더 타이머가 보이게) — 공용 Overlay(최대 88dvh)는 고치지 않고 이 파일에서 같은 모양으로 포탈한다.
// 숫자(U-8): 상태는 kg 로 든다. ± 는 core stepBodyweightKg(보이는 숫자 + 스텝 → kg), 직접 입력은 enteredBodyweightToKg
//   (보이던 숫자 그대로면 kg 원값) — lb 로 보여도 75kg 가 74.98kg 로 바뀌지 않는다.
// 닫기: 스크림·Esc·(trapBack 이면) 브라우저 뒤로 = onDismiss — 체크인에서는 「체중 없이 계속」과 같다(U-7 ②).
//
// WeighInCheckin: ActiveWorkout 첫 진입에서 띄울지 판정하고(core shouldOfferWeighIn) 저장은 source='checkin'.
import {
  BODYWEIGHT_STEPS,
  latest,
  stepBodyweightKg,
  type BodyweightLogLike,
} from "@app/core/domain/bodyweight";
import {
  bodyweightUnitOf,
  enteredBodyweightToKg,
  formatBodyweight,
  hasLogOnLocalDay,
  localDayRange,
  shouldOfferWeighIn,
  weighInStartKg,
} from "@app/core/domain/weighIn";
import type { WeightUnit } from "@app/core";
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
  testId?: string;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [kg, setKg] = useState(() => weighInStartKg(initialKg, unit));
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const closed = useRef(false);
  const focused = useRef(false);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => setRoot(document.getElementById("modal-root")), []);

  // Esc = 닫기(공용 Overlay 와 같다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || closed.current) return;
      closed.current = true;
      dismissRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // 뒤로 가기 = 닫기(체크인 · U-7 ②). 열 때 한 칸 쌓고, 버튼으로 닫으면 그 칸을 되돌린다(주소는 그대로).
  const pushed = useRef(false);
  const ignorePop = useRef(false);
  useEffect(() => {
    if (!trapBack) return;
    history.pushState({ ...(history.state ?? {}), liftgramWeighIn: true }, "");
    pushed.current = true;
    const onPop = () => {
      if (ignorePop.current) {
        ignorePop.current = false;
        return;
      }
      pushed.current = false;
      if (closed.current) return;
      closed.current = true;
      dismissRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // 버튼으로 닫혔다 — 쌓아 둔 칸을 걷는다(되돌림 popstate 는 위에서 무시)
      if (pushed.current && history.state?.liftgramWeighIn) {
        ignorePop.current = true;
        pushed.current = false;
        history.back();
      }
    };
  }, [trapBack]);

  const steps = BODYWEIGHT_STEPS[unit];
  const shown = formatBodyweight(kg, unit);

  /** 직접 입력칸의 숫자를 반영한 kg — 보이던 숫자 그대로면 지금 kg(왕복 오차 없음) */
  const commitTyped = (): number => {
    if (!typing) return kg;
    const v = Number.parseFloat(draft.replace(",", "."));
    const next = enteredBodyweightToKg(v, unit, kg) ?? kg;
    setKg(next);
    setTyping(false);
    return next;
  };

  const save = () => {
    if (busy || closed.current) return;
    const value = commitTyped();
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
          const base = commitTyped();
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
      <button
        type="button"
        aria-label={secondaryLabel}
        data-testid="weighin-scrim"
        onClick={() => {
          if (closed.current) return;
          closed.current = true;
          onDismiss();
        }}
        className="absolute inset-0 bg-black/50"
      />
      <div
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
                onChange={(e) => setDraft(e.target.value)}
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
          {typing ? null : (
            <button
              type="button"
              data-testid="weighin-type"
              onClick={() => {
                setDraft(shown);
                setTyping(true);
              }}
              className="flex h-[44px] items-center rounded-[var(--radius-pill)] px-[var(--spacing-sm)] text-(--color-ink2) text-[length:var(--text-sm)] underline underline-offset-2"
            >
              {t("bodyweight.directInput")}
            </button>
          )}
        </div>

        <div className="mt-[var(--spacing-xs)] flex flex-col gap-[6px]" data-testid="weighin-steps">
          <div className="flex gap-[6px]">{[-steps[2], -steps[1], -steps[0]].map(stepBtn)}</div>
          <div className="flex gap-[6px]">{[steps[0], steps[1], steps[2]].map(stepBtn)}</div>
        </div>

        {extra ? <div className="mt-[var(--spacing-sm)]">{extra}</div> : null}

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
            {primaryLabel}
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
    let cancelled = false;
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
          marked: hasWeighInMark(workoutId),
        });
        if (cancelled || !offer) return;
        const all = (await bw.listBodyweightLogs()).map(bw.toBodyweightLogLike);
        if (cancelled) return;
        setWeighInMark(workoutId);
        setGate({ last: lastEntryOf(all) });
      } catch {
        // 판정 실패 — 띄우지 않는다(운동을 막지 않는다)
      }
    })();
    return () => {
      cancelled = true;
      judged.current = null;
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
