"use client";
// 「잠금화면에서 본 값과 다름」 표식(SPEC-017 §5 · REV-003 도메인 M-5) — 잠금 조작은 완료하되, 카드에 보인 값과 저장된 값이
// 달랐으면 두 값을 함께 보이고 「본 값으로 바꾸기」를 준다. 같은 블록의 연쇄 어긋남은 표식 하나로 묶는다. 로컬 전용(닫으면 사라짐).
// 첫 drain 이 끝나기 전에는 세션 화면이 입력을 받지 않는다(§6) — 그 덮개도 여기.
import { useEffect, useMemo, useState } from "react";
import type { LockDrainMismatch } from "@app/core/domain/lockDrain";
import { displayWeight } from "@app/core/domain/units";
import { t } from "@/lib/i18n";
import { lockAvailable } from "@/lib/native";
import { isLockReady } from "@/lib/lockBridge";
import { useSession } from "../SessionProvider";
import { AppText } from "../ui/primitives";
import { actionBoxClass } from "../ui/Button";

function fmt(e: LockDrainMismatch["seen"], unit: "kg" | "lb", oneSide?: boolean): string {
  const parts: string[] = [];
  // 카드와 같은 글자 — 한쪽 입력 블록은 「한쪽」(REV-006 화면 L-4)
  if (e.weightKg != null)
    parts.push(`${displayWeight(e.weightKg, unit)}${unit}${oneSide ? ` ${t("session.lockOneSide")}` : ""}`);
  if (e.reps != null) parts.push(`${e.reps}`);
  if (e.seconds != null) parts.push(t("session.secondsShort", { n: e.seconds }));
  return parts.join("×");
}

export function LockNotices() {
  const [items, setItems] = useState<LockDrainMismatch[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  // [원본] useState(true) — 동적 import 가 풀리기 전 한 박자 덮개 없이 그렸다(REV-006 화면 L-8)
  const [ready, setReady] = useState(isLockReady);
  const [busy, setBusy] = useState(false);
  const { activeWorkoutId } = useSession();
  useEffect(() => {
    let offA = () => {};
    let offB = () => {};
    void import("@/lib/lockBridge").then((m) => {
      offA = m.subscribeLockMismatches(setItems);
      offB = m.subscribeLockReady(setReady);
    });
    return () => {
      offA();
      offB();
    };
  }, []);
  useEffect(() => {
    const ids = [...new Set(items.map((m) => m.exerciseId))].filter(Boolean);
    if (!ids.length) return;
    let alive = true;
    void import("@app/core/data/exerciseNames").then(async (m) => {
      const map = await m.getExerciseDisplayNameMap(ids);
      if (alive) setNames(map);
    });
    return () => {
      alive = false;
    };
  }, [items]);
  const byBlock = useMemo(() => {
    const g = new Map<string, LockDrainMismatch[]>();
    // 지금 운동의 표식만 — 끝난 운동의 표식은 보이지 않는다(REV-006 화면 M-5)
    for (const m of items)
      if (!m.workoutId || m.workoutId === activeWorkoutId) g.set(m.weId, [...(g.get(m.weId) ?? []), m]);
    return [...g.values()];
  }, [items, activeWorkoutId]);

  const dismiss = (ids: string[]) =>
    void import("@/lib/lockBridge").then((m) => m.dismissLockMismatches(ids));
  const applySeen = async (ms: LockDrainMismatch[]) => {
    if (busy) return; // 연타 막음(REV-006 화면 L-6)
    setBusy(true);
    try {
      const repo = await import("@app/core/data/workoutRepository");
      await repo.applyLockSeenValues(ms.map((m) => ({ setId: m.setId, seen: m.seen })));
      // 탑셋을 바꿨으면 뒤 백오프도 본 값 기준으로 다시 채운다(REV-006 저장소 M-2)
      await repo
        .refillLoadsAfter(ms.map((m) => m.setId))
        .catch((e) => console.warn("[lock] 다시 채우기 실패", e));
      dismiss(ms.map((m) => m.setId));
    } catch (e) {
      console.warn("[lock] 본 값으로 바꾸기 실패", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!ready && lockAvailable() ? (
        <div
          data-testid="lock-draining"
          data-overlay=""
          aria-busy="true"
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-(--color-bg)/70"
        >
          <AppText variant="body" color="textMuted">
            {t("session.lockChecking")}
          </AppText>
        </div>
      ) : null}
      {byBlock.map((ms) => {
        const first = ms[0];
        return (
          <div
            key={first.weId}
            data-testid="lock-mismatch"
            role="status"
            className="mx-[var(--spacing-lg)] mt-[var(--spacing-sm)] rounded-[var(--radius-sm)] border border-(--color-warn) bg-(--color-card) p-[var(--spacing-sm)]"
          >
            <AppText variant="caption" className="block font-bold">
              {names.get(first.exerciseId)
                ? t("session.lockMismatchTitle", { name: names.get(first.exerciseId) ?? "" })
                : t("session.lockMismatchTitleNoName")}
            </AppText>
            {ms.map((m) => (
              <AppText
                key={m.setId}
                variant="caption"
                color="textMuted"
                className="block"
                data-testid="lock-mismatch-line"
              >
                {t("session.lockMismatchLine", {
                  seen: fmt(m.seen, m.unit, m.oneSide),
                  saved: fmt(m.saved, m.unit, m.oneSide),
                })}
              </AppText>
            ))}
            <div className="mt-[6px] flex gap-[var(--spacing-sm)]">
              <button
                type="button"
                data-testid="lock-mismatch-use-seen"
                disabled={busy}
                onClick={() => void applySeen(ms)}
                // [원본] border-(--color-line) — 다크(#424242)에서 테두리가 거의 안 보였다(SPEC-061)
                className={`${actionBoxClass()} min-h-[44px] px-[var(--spacing-sm)]`}
              >
                <AppText variant="caption" className="font-bold">
                  {t("session.lockMismatchUseSeen")}
                </AppText>
              </button>
              <button
                type="button"
                data-testid="lock-mismatch-dismiss"
                onClick={() => dismiss(ms.map((m) => m.setId))}
                // [원본] className="min-h-[44px] px-[var(--spacing-sm)]" + 흐린 글자(SPEC-061)
                className={`${actionBoxClass()} min-h-[44px] px-[var(--spacing-md)]`}
              >
                <AppText variant="caption" className="font-semibold">
                  {t("common.close")}
                </AppText>
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
