// 진행 중 세션 상태 컨텍스트 (SRS-004). 앱 시작 시 active/paused 세션을 복구 대상으로 로드.
// ActiveWorkout 화면이 시작/종료/취소 시 activeWorkoutId를 갱신, WorkoutTab이 복구 배너에 사용.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { workoutRepo } from '../data';

interface SessionContextValue {
  activeWorkoutId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setActiveWorkoutId: (id: string | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const active = await workoutRepo.getActiveWorkout();
      setActiveWorkoutId(active?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<SessionContextValue>(
    () => ({ activeWorkoutId, loading, refresh, setActiveWorkoutId }),
    [activeWorkoutId, loading, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
