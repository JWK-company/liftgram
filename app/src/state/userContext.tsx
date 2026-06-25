// 로컬 사용자/설정 컨텍스트 (SRS-006). 단위·바 무게 등 전 화면 공유. 설정 변경은 반응형 반영.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { userRepo } from '../data';
import { UserProfile } from '../db/models';
import { useModelData } from '../db/hooks';
import { DEFAULT_BAR_KG, type WeightUnit, type AppLanguage } from '../domain';

interface UserContextValue {
  user: UserProfile | null;
  loading: boolean;
  weightUnit: WeightUnit;
  language: AppLanguage;
  barWeightKg: number;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [base, setBase] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const user = useModelData(base);

  const refresh = useCallback(async () => {
    setBase(await userRepo.getOrCreateLocalUser());
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setBase(await userRepo.getOrCreateLocalUser());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // useMemo로 user 참조에 의존하면 안 됨 — useModelData가 변경 시 동일 인스턴스를 반환하므로
  // 참조가 그대로다. UserProvider는 useModelData의 강제 리렌더로 다시 렌더되니, 매 렌더 새 값으로 구성.
  const value: UserContextValue = {
    user,
    loading,
    weightUnit: user?.weightUnit ?? 'kg',
    language: user?.preferredLanguage ?? 'ko',
    barWeightKg: user?.barWeightKg ?? DEFAULT_BAR_KG,
    refresh,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
