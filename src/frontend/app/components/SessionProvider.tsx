"use client";
// @plm SRS-004  진행 중 세션 상태 — 특히 **전역 휴식 카운트다운**
//
// ─────────────────────────────────────────────────────────────────────────────
// 휴식은 **운동 전체에 하나**다. 세트를 체크하면 시작되고, 다른 화면으로 옮겨 가도 계속 흐른다
// (app이 v7에서 화면 지역 타이머를 전역으로 승격시킨 이유 — 헬스장에서 화면을 옮겨 다니기 때문).
//
// ── 남은 시간을 세는 방법(중요) ──────────────────────────────────────────────
// 초를 1씩 빼지 **않는다.** 끝나는 시각(월클럭)을 잡아 두고 매 틱 그것과 지금의 차를 잰다.
// 브라우저는 탭이 가려지면 타이머를 늦추거나 멈춘다 — 빼기 방식이면 그만큼 휴식이 길어진다.
// 끝시각 기준이면 돌아왔을 때 곧바로 맞는 값이 나온다. 틱은 500ms(초 표시가 늦게 넘어가지 않게).
//
// app의 sessionContext는 react-native와 네이티브 알람에 묶여 있어 **옮기지 않고 다시 썼다**
// (ADR-032의 플랫폼 책임). 규칙 — 전역 1개 · 월클럭 · 500ms — 은 그대로다.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

interface SessionContextValue {
  /** 남은 휴식 초. null이면 휴식 중이 아니다. */
  restRemaining: number | null;
  startRest: (seconds: number) => void;
  clearRest: () => void;
  /** 전역 운동 바가 읽는다 — 어느 화면에서든 진행 중인 운동을 보여 주기 위해. */
  activeWorkoutId: string | null;
  activeStartedAt: number | null;
  activeName: string | null;
  setActive: (v: { id: string; startedAt: number; name: string | null } | null) => void;
  /** 저장소에서 진행 중인 운동을 다시 읽는다(다른 화면에서 시작·종료했을 때). */
  refreshActive: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [active, setActiveState] = useState<{
    id: string;
    startedAt: number;
    name: string | null;
  } | null>(null);

  const endAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * 진행 중인 운동을 저장소에서 읽는다.
   *
   * 저장소는 브라우저에만 있으므로 **동적 import**로만 부른다 — 이 파일이 셸(모든 화면)에
   * 올라가 있어서, 모듈 최상단에서 불러오면 서버 렌더가 통째로 터진다.
   */
  const refreshActive = useCallback(async () => {
    try {
      const repo = await import("@app/core/data/workoutRepository");
      const w = (await repo.getActiveWorkout()) as unknown as {
        id: string;
        startedAt: number;
        name: string | null;
      } | null;
      setActiveState(w ? { id: w.id, startedAt: w.startedAt, name: w.name } : null);
    } catch {
      // 저장소를 못 열었다 — 바를 띄우지 않을 뿐 화면은 그대로 돈다.
    }
  }, []);

  useEffect(() => {
    void refreshActive();
  }, [refreshActive]);

  const stopTicking = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const clearRest = useCallback(() => {
    endAtRef.current = null;
    stopTicking();
    setRestRemaining(null);
  }, [stopTicking]);

  const startRest = useCallback(
    (seconds: number) => {
      stopTicking();
      if (seconds <= 0) {
        endAtRef.current = null;
        setRestRemaining(null);
        return;
      }
      endAtRef.current = Date.now() + seconds * 1000;
      setRestRemaining(seconds);

      timerRef.current = setInterval(() => {
        const end = endAtRef.current;
        if (end == null) return;
        const left = Math.round((end - Date.now()) / 1000);
        if (left <= 0) {
          endAtRef.current = null;
          stopTicking();
          setRestRemaining(null);
          void import("@/lib/restSound").then((m) => m.notifyRestDone());
          return;
        }
        setRestRemaining(left);
      }, 500);
    },
    [stopTicking],
  );

  // 탭이 가려졌다 돌아오면 곧바로 맞춘다 — 틱이 늦어졌더라도 표시가 튀지 않게.
  useEffect(() => {
    const onVisible = () => {
      const end = endAtRef.current;
      if (end == null) return;
      const left = Math.round((end - Date.now()) / 1000);
      if (left <= 0) clearRest();
      else setRestRemaining(left);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [clearRest]);

  useEffect(() => stopTicking, [stopTicking]);

  const value = useMemo<SessionContextValue>(
    () => ({
      restRemaining,
      startRest,
      clearRest,
      activeWorkoutId: active?.id ?? null,
      activeStartedAt: active?.startedAt ?? null,
      activeName: active?.name ?? null,
      setActive: setActiveState,
      refreshActive,
    }),
    [restRemaining, startRest, clearRest, active, refreshActive],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession은 SessionProvider 안에서만 쓸 수 있다");
  return ctx;
}
