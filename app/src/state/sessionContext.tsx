// 진행 중 세션 상태 컨텍스트 (SRS-004). 앱 시작 시 active/paused 세션을 복구 대상으로 로드.
// v7(#12): 휴식 카운트다운을 전역으로 승격 — 어느 화면으로 가도 휴식이 유지되고, 전역 운동 바가
// 모든 화면에 떠서 경과·휴식을 보여준다. 운동 메인 화면을 벗어나도 리셋되지 않는다.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { workoutRepo } from '../data';
import { primeRestSound, playRestDone } from '../utils/sound';

interface SessionContextValue {
  activeWorkoutId: string | null;
  activeStartedAt: number | null; // 전역 바 경과 표시용
  activeName: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setActiveWorkoutId: (id: string | null) => void;
  // 전역 휴식 카운트다운(#12) — 운동 전체 1개. 화면 이동에도 유지.
  restRemaining: number | null;
  startRest: (seconds: number) => void;
  clearRest: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [activeWorkoutId, setActiveWorkoutIdState] = useState<string | null>(null);
  const [activeStartedAt, setActiveStartedAt] = useState<number | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const restEndRef = useRef<number | null>(null);

  const loadActiveMeta = useCallback((id: string | null) => {
    if (!id) {
      setActiveStartedAt(null);
      setActiveName(null);
      return;
    }
    workoutRepo
      .getWorkout(id)
      .then((w) => {
        setActiveStartedAt(w.startedAt);
        setActiveName(w.name ?? null);
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const active = await workoutRepo.getActiveWorkout();
      setActiveWorkoutIdState(active?.id ?? null);
      setActiveStartedAt(active?.startedAt ?? null);
      setActiveName(active?.name ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setActiveWorkoutId = useCallback(
    (id: string | null) => {
      setActiveWorkoutIdState(id);
      loadActiveMeta(id);
      if (!id) {
        restEndRef.current = null;
        setRestRemaining(null); // 운동 종료/취소 시 휴식도 정리
      }
    },
    [loadActiveMeta],
  );

  const startRest = useCallback((seconds: number) => {
    primeRestSound(); // 세트 완료 체크(사용자 제스처) 시 웹 오디오 잠금 해제
    if (seconds > 0) {
      restEndRef.current = Date.now() + seconds * 1000;
      setRestRemaining(seconds);
    } else {
      restEndRef.current = null;
      setRestRemaining(null);
    }
  }, []);

  const clearRest = useCallback(() => {
    restEndRef.current = null;
    setRestRemaining(null);
  }, []);

  // 전역 카운트다운 틱 — restEndRef(월클럭 기준)로 계산해 백그라운드 복귀에도 정확.
  const restActive = restRemaining != null;
  useEffect(() => {
    if (!restActive) return;
    const iv = setInterval(() => {
      if (restEndRef.current == null) return;
      const rem = Math.round((restEndRef.current - Date.now()) / 1000);
      if (rem <= 0) {
        restEndRef.current = null;
        setRestRemaining(null);
        playRestDone(); // 휴식 종료 알림음 + 진동
      } else {
        setRestRemaining(rem);
      }
    }, 500);
    return () => clearInterval(iv);
  }, [restActive]);

  const value = useMemo<SessionContextValue>(
    () => ({
      activeWorkoutId,
      activeStartedAt,
      activeName,
      loading,
      refresh,
      setActiveWorkoutId,
      restRemaining,
      startRest,
      clearRest,
    }),
    [activeWorkoutId, activeStartedAt, activeName, loading, refresh, setActiveWorkoutId, restRemaining, startRest, clearRest],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
