"use client";
// @plm SRS-005  라이브 PR 축하 — app의 components/PrCelebration.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 세트를 체크한 순간 최고 기록이면 폭죽과 함께 쓱 떴다 **알아서 사라진다**(누를 필요 없다 —
// 운동 중에 손이 바쁘기 때문이다). 이건 알림일 뿐 기록이 아니다: 최종 PR은 운동을 완료할 때
// `completeWorkout`이 확정한다.
//
// 어디서든 부를 수 있어야 해서(세트 줄 깊숙한 곳) 모듈 이벤트 버스를 쓴다 — app과 같은 구조다.
// 호스트는 세션 화면 루트에 한 번만 둔다.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";
import { AppText } from "./ui/primitives";

export interface PrCelebrationPayload {
  exerciseName: string;
  /** 'maxWeight' | 'maxVolumeSet' — 지금 인정하는 PR은 이 둘뿐이다(도메인의 MAJOR_PR_TYPES). */
  types: string[];
}

type PrToast = PrCelebrationPayload & { id: number };

let listener: ((toast: PrToast) => void) | null = null;
let seq = 0;

export function firePrCelebration(p: PrCelebrationPayload): void {
  listener?.({ id: ++seq, ...p });
}

/** 총 표시 시간 — 페이드인 180 → 유지 → 페이드아웃 420(app과 같다). */
const SHOW_MS = 2400;
const CONFETTI_COLORS = ["#F59E0B", "#F472B6", "#4F8EF7", "#34D399", "#A78BFA", "#F87171", "#22D3EE"];
const PARTICLES = 14;

export function PrCelebrationHost() {
  const [toast, setToast] = useState<PrToast | null>(null);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    listener = setToast;
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    setPhase("in");
    const out = setTimeout(() => setPhase("out"), SHOW_MS - 420);
    const done = setTimeout(() => setToast(null), SHOW_MS);
    return () => {
      clearTimeout(out);
      clearTimeout(done);
    };
  }, [toast]);

  // 파티클 — 토스트마다 각도·거리·색이 달라진다(사방으로 흩어지는 단순 버스트).
  const particles = useMemo(() => {
    if (!toast) return [];
    return Array.from({ length: PARTICLES }, (_, i) => {
      const angle = (Math.PI * 2 * i) / PARTICLES + Math.random() * 0.5;
      const dist = 60 + Math.random() * 70;
      return {
        key: `${toast.id}_${i}`,
        dx: Math.cos(angle) * dist,
        // 살짝 아래로 떨어지는 느낌을 준다.
        dy: Math.sin(angle) * dist * 0.75 + 20,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        spin: (Math.random() - 0.5) * 540,
        size: 5 + Math.random() * 4,
      };
    });
  }, [toast]);

  if (!toast) return null;

  const label = toast.types
    .map((ty) => t(ty === "maxWeight" ? "session.prTypeWeight" : "session.prTypeVolume"))
    .join(" · ");

  return (
    <div
      data-testid="pr-celebration"
      className="pointer-events-none fixed inset-0 z-[999] flex justify-center pt-[22%]"
    >
      <div
        style={{
          opacity: phase === "in" ? 1 : 0,
          transform: `translateY(${phase === "in" ? 0 : 14}px)`,
          transition:
            phase === "in" ? "opacity 180ms ease-out, transform 180ms ease-out" : "opacity 420ms ease-in",
        }}
        className="relative flex flex-col items-center"
      >
        {particles.map((p) => (
          <span
            key={p.key}
            style={
              {
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                "--dx": `${p.dx}px`,
                "--dy": `${p.dy}px`,
                "--spin": `${p.spin}deg`,
              } as React.CSSProperties
            }
            className="absolute top-1/2 left-1/2 animate-[pr-burst_850ms_cubic-bezier(0.22,1,0.36,1)_forwards] rounded-[1px]"
          />
        ))}

        <div className="max-w-[320px] rounded-[var(--radius-lg)] border border-(--color-pr) bg-(--color-surface) px-[var(--spacing-lg)] py-[var(--spacing-sm)]">
          <AppText variant="body" center className="block font-bold">
            🎉 {t("session.prToast", { name: toast.exerciseName, label })}
          </AppText>
          <AppText variant="label" color="textMuted" center className="mt-[2px] block">
            {t("session.prToastHint")}
          </AppText>
        </div>
      </div>
    </div>
  );
}
