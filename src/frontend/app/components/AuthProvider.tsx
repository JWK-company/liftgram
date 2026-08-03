"use client";
// @plm SRS-006  로그인 상태 — 화면들이 "지금 누구인가"를 여기서 읽는다
//
// 셸에 한 번 올려 두고, 새로고침하면 저장된 refresh로 조용히 세션을 되살린다.
// **로그인하지 않은 상태가 정상**이다 — user가 null이어도 화면 대부분은 그대로 동작한다.
import type { User } from "@app/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  authClient,
  clearTokens,
  hasSession,
  onSessionChange,
  restoreSession,
  setTokens,
} from "@/lib/session";
import { installSync, onLoggedIn, watchSyncTriggers } from "@/lib/syncTransport";

interface AuthValue {
  /** 로그인하지 않았으면 null. 아직 확인 중이어도 null이다(loading으로 구분한다). */
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  /** 서버 프로필을 고친다. 로그인 상태에서만 뜻이 있다. */
  updateProfile: (patch: Parameters<ReturnType<typeof authClient>["updateProfile"]>[0]) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!hasSession()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      await restoreSession();
      const res = await authClient().me({});
      setUser(res.user ?? null);
      // 앱을 열 때가 첫 방아쇠다 — 다른 기기에서 한 운동이 여기 있어야 한다.
      if (res.user) void onLoggedIn(res.user.id);
    } catch {
      // 세션이 죽었다 — 로그인하지 않은 상태로 둔다(화면은 그대로 돈다).
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // core의 동기 규칙에 "말하는 방법"을 꽂는다. 이 전까지 저장소의 예약은 아무 일도 하지 않는다.
    installSync();
    const stopTriggers = watchSyncTriggers();
    void load();
    // 다른 탭에서 로그아웃하면 여기도 따라간다.
    const stopSession = onSessionChange(() => {
      if (!hasSession()) setUser(null);
    });
    return () => {
      stopTriggers();
      stopSession();
    };
  }, [load]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      signUp: async (email, password, displayName) => {
        const res = await authClient().signUp({ email, password, displayName });
        if (res.tokens) setTokens(res.tokens);
        setUser(res.user ?? null);
        // 로그인 전에 쌓은 기록을 이 계정 것으로 삼는다(대조가 먼저, 그다음 동기).
        if (res.user) await onLoggedIn(res.user.id);
      },
      logIn: async (email, password) => {
        const res = await authClient().logIn({ email, password });
        if (res.tokens) setTokens(res.tokens);
        setUser(res.user ?? null);
        // **다른 계정이면 로컬을 비운 뒤** 받는다 — 이전 사람의 기록이 올라가면 안 된다.
        if (res.user) await onLoggedIn(res.user.id);
      },
      logOut: async () => {
        const { getRefreshToken } = await import("@/lib/session");
        const token = getRefreshToken();
        // 서버가 못 받아도 이 기기에서는 나간다 — 오프라인에서 로그아웃이 막히면 안 된다.
        if (token)
          await authClient()
            .logOut({ refreshToken: token })
            .catch(() => {});
        clearTokens();
        setUser(null);
      },
      updateProfile: async (patch) => {
        const res = await authClient().updateProfile(patch);
        setUser(res.user ?? null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 안에서만 쓸 수 있다");
  return ctx;
}
