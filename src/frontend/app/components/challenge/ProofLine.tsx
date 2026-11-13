"use client";
// 운동 화면 「인증 사진」 줄(SPEC-064 Phase 3a) — 사진 인증 챌린지가 진행 중일 때만.
//
// 운동 화면(「오늘 체중」 줄 아래)과 요약 화면(끝난 뒤 30분 안)이 같이 쓴다. 챌린지가 여럿이면 줄도 여럿(챌린지마다 지시가 다르다).
// 서버 계정이 없거나 목록을 못 받으면 아무것도 그리지 않는다(운동 기록을 막지 않는다).
import type { Summary } from "@app/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { challengeClient } from "@/lib/challengeClient";
import { t } from "@/lib/i18n";
import { hasSession, onSessionChange } from "@/lib/session";
import { useAuth } from "../AuthProvider";
import { actionBoxClass } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ProofCamera } from "./ProofCamera";

export type ActiveProofs = { items: Summary[]; proved: Set<string> };

// 운동 화면 줄이 마지막으로 받은 값 — 「마치기」 확인창이 다시 묻지 않고 바로 쓴다(REV-162 M-4)
let last: { at: number; value: ActiveProofs } | null = null;
const LAST_TTL_MS = 10 * 60_000;
// 로그아웃·다른 계정 로그인이면 지운다 — 앞 계정의 챌린지로 경고가 뜨지 않게(REV-163 M-1)
if (typeof window !== "undefined") {
  onSessionChange(() => {
    last = null;
  });
}

/** 사진 인증 챌린지 목록 + 오늘 찍은 것. 실패하면 null */
export async function loadActiveProofs(): Promise<ActiveProofs | null> {
  if (!hasSession()) return null; // 서버 계정이 없으면 부르지 않는다
  try {
    const r = await challengeClient().activeForWorkout({});
    const value = { items: r.items, proved: new Set(r.provedToday) };
    last = { at: Date.now(), value };
    return value;
  } catch {
    return null;
  }
}

/** 완료 확인창에 덧붙일 한 줄 — 오늘 인증 사진이 없는 챌린지가 있으면 */
export async function unprovedWarning(): Promise<string | null> {
  // [원본] 늘 서버에 다시 묻고 1.5초까지 기다렸다 — 그동안 「마치기」가 반응이 없었다(REV-162 M-4)
  // [개선] 운동 화면 줄이 받아 둔 값(10분 안)을 바로 쓴다. 없을 때만 묻고 0.8초까지만 기다린다
  let a: ActiveProofs | null = last && Date.now() - last.at < LAST_TTL_MS && hasSession() ? last.value : null;
  if (!a) {
    let timer = 0;
    a = await Promise.race([
      loadActiveProofs(),
      new Promise<null>((res) => {
        timer = window.setTimeout(() => res(null), 800);
      }),
    ]);
    window.clearTimeout(timer);
  }
  if (!a) return null;
  const left = a.items.filter((s) => !a.proved.has(s.id));
  if (left.length === 0) return null;
  return t("challenge.proofLine.finishWarn", { title: left.map((s) => s.rule?.title ?? "").join(", ") });
}

export function ProofLine({ workoutId, testId = "proof-line" }: { workoutId: string; testId?: string }) {
  const { user } = useAuth();
  const [data, setData] = useState<ActiveProofs | null>(null);
  const [open, setOpen] = useState<Summary | null>(null);

  const lastAt = useRef(0);
  const load = useCallback(async () => {
    lastAt.current = Date.now();
    const v = await loadActiveProofs();
    // 일시 실패면 보이던 줄을 지우지 않는다(REV-163 2차 L-1)
    setData((old) => v ?? old);
  }, []);

  useEffect(() => {
    if (user) void load();
    else setData(null);
  }, [user, load]);

  // 오프라인으로 시작했으면 망이 돌아올 때·화면에 돌아올 때 다시 받는다(REV-162 L-7)
  useEffect(() => {
    if (!user) return;
    // 세트 사이 화면 잠금마다 부르지 않게 — 마지막으로 받은 지 1분 안이면 건너뛴다(REV-163 2차 L-1)
    const again = () => {
      if (document.visibilityState === "visible" && Date.now() - lastAt.current > 60_000) void load();
    };
    const online = () => void load(); // 망이 돌아오면 바로
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("online", online);
      document.removeEventListener("visibilitychange", again);
    };
  }, [user, load]);

  if (!user || !data || data.items.length === 0) return null;
  return (
    <div className="flex flex-col" data-testid={testId}>
      {data.items.map((s) => {
        const done = data.proved.has(s.id);
        return (
          <div
            key={s.id}
            className="flex min-h-[48px] items-center gap-[var(--spacing-sm)] border-(--color-line) border-b"
            data-testid={`proof-line-${s.id}`}
          >
            <Icon name="camera" size={20} color="var(--color-ink2)" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[length:var(--text-sm)]">
                {t("challenge.proofLine.title")}
              </span>
              <span className="block truncate text-(--color-ink2) text-[length:var(--text-xs)]">
                {s.rule?.title}
              </span>
            </span>
            {done ? (
              <span
                className="flex items-center gap-[4px] text-[length:var(--text-sm)] font-semibold"
                data-testid={`proof-line-done-${s.id}`}
              >
                <Icon name="checkmark-circle" size={18} color="var(--color-ink)" />
                {t("challenge.proofLine.done")}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(s)}
              data-testid={`proof-line-shoot-${s.id}`}
              className={`${actionBoxClass(done ? "neutral" : "brand")} min-h-11 gap-[4px] px-[var(--spacing-sm)] text-[length:var(--text-sm)]`}
            >
              {done ? t("challenge.proofLine.again") : t("challenge.proofLine.shoot")}
            </button>
          </div>
        );
      })}
      {open ? (
        <ProofCamera
          challenge={open}
          workoutId={workoutId}
          onClose={() => {
            setOpen(null);
            // 올렸는데 응답만 잃었을 수 있다 — 닫을 때도 다시 받는다(REV-162 L-8)
            void load();
          }}
          onDone={() => {
            setOpen(null);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

/** 마친 뒤 이만큼 안이면 요약 화면에서도 찍을 수 있다(서버 인정 구간 「끝 +30분」과 같다) */
const AFTER_MS = 30 * 60 * 1000;

/**
 * 요약 화면 줄 — 그 운동이 끝난 지 30분 안일 때만 같은 줄을 보인다(지나면 서버가 인정하지 않는다).
 * 끝난 시각은 이 기기 기록에서 읽는다. 30분이 지나는 순간 줄이 사라진다.
 */
export function SummaryProofLine({ workoutId }: { workoutId: string }) {
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const repo = await import("@app/core/data/workoutRepository");
        const w = await repo.getWorkout(workoutId);
        if (alive && w.completedAt) setUntil(w.completedAt + AFTER_MS);
      } catch {
        // 못 읽으면 줄을 보이지 않는다
      }
    })();
    return () => {
      alive = false;
    };
  }, [workoutId]);
  useEffect(() => {
    if (until === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [until]);
  if (until === null || now >= until) return null;
  return <ProofLine workoutId={workoutId} testId="summary-proof-line" />;
}
