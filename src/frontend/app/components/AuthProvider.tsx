"use client";
// @plm SRS-006  로그인 상태 — 화면들이 "지금 누구인가"를 여기서 읽는다
//
// 셸에 한 번 올려 두고, 새로고침하면 저장된 refresh로 조용히 세션을 되살린다.
// **로그인하지 않은 상태가 정상**이다 — user가 null이어도 화면 대부분은 그대로 동작한다.
import { type User, UserSchema } from "@app/contracts";
import { fromJson, toJson } from "@bufbuild/protobuf";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  authClient,
  cacheMe,
  clearTokens,
  hasSession,
  onSessionChange,
  readCachedMe,
  restoreSession,
  setTokens,
  takeRefreshedMe,
} from "@/lib/session";
import {
  discardAndAdopt,
  installSync,
  onLoggedIn,
  onLoggedOut,
  watchSyncTriggers,
} from "@/lib/syncTransport";
import { parseLastLogin } from "@/lib/last-login";

interface AuthValue {
  /** 로그인하지 않았으면 null. 아직 확인 중이어도 null이다(loading으로 구분한다). */
  user: User | null;
  loading: boolean;
  /** 세션 깃발이 있어 확인 중이다 — 이 동안 로그인 폼·비로그인 안내를 그리지 않는다(SRS-054). */
  restoring: boolean;
  /** humanToken = 사람 확인(Turnstile) 토큰. 키가 없는 환경에서는 비어도 된다. */
  signUp: (email: string, password: string, displayName: string, humanToken?: string | null) => Promise<void>;
  /** 소셜 로그인 콜백이 붙여 보낸 일회용 코드로 로그인한다(/auth/complete). 새 계정이면 true */
  /** via = 콜백이 붙인 제공자(연결일 때는 비어 있다) — 「최근」 배지용. */
  logInWithCode: (code: string, via?: string) => Promise<boolean>;
  /** 서버의 내 정보를 다시 읽는다(이메일 확인 뒤 등). */
  refreshMe: () => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
  /**
   * 이 기기에 **다른 계정의 올라가지 않은 기록**이 있다 — 동기를 멈췄다(syncOwner).
   * AccountGuard가 이 값을 보고 사람에게 고르게 한다.
   */
  ownerConflict: { pending: number } | null;
  /** 백업을 내보낸 뒤 이 기기 기록을 비우고 지금 계정으로 계속한다. */
  resolveConflictByDiscard: () => Promise<void>;
  /** 서버 프로필을 고친다. 로그인 상태에서만 뜻이 있다. */
  updateProfile: (patch: Parameters<ReturnType<typeof authClient>["updateProfile"]>[0]) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** 사람 확인 토큰을 싣는 헤더 — backend internal/auth/turnstile.go 의 TurnstileHeader 와 같은 이름 */
export const HUMAN_HEADER = "X-Turnstile-Token";

/** 서버 렌더에는 layout 효과가 없다 — 경고 없이 같은 자리에서 돌게. */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function parseUser(json: unknown): User | null {
  if (!json) return null;
  try {
    return fromJson(UserSchema, json as Parameters<typeof fromJson<typeof UserSchema>>[1], {
      ignoreUnknownFields: true,
    });
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [ownerConflict, setOwnerConflict] = useState<{ pending: number } | null>(null);

  // 사용자가 바뀔 때마다 요약을 남긴다 — 다음 실행의 첫 칠하기가 이것으로 선다(SRS-054).
  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    cacheMe(u ? toJson(UserSchema, u) : null);
  }, []);

  // 첫 칠하기 **전에** 직전 사용자로 세운다 — 로그인한 사람이 몇 초간 비로그인 화면(로그인 폼·피드백 탭 없음)을
  // 보던 깜빡임을 없앤다. 확인(load)이 끝나면 서버 값으로 바로잡고, 세션이 죽었으면 그때 내린다.
  useIsoLayoutEffect(() => {
    const cached = parseUser(readCachedMe());
    if (cached) setUserState(cached);
    else if (hasSession()) setRestoring(true);
  }, []);

  // 대조 결과를 화면 상태로 옮긴다 — 멈췄으면 고르게 한다.
  const reconcile = useCallback(async (userId: string) => {
    const r = await onLoggedIn(userId);
    setOwnerConflict(r.kind === "blocked" ? { pending: r.pending } : null);
  }, []);

  const load = useCallback(async () => {
    if (!hasSession()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const alive = await restoreSession();
      // 갱신 라우트가 내 정보를 같이 실어 왔으면 Me 왕복을 건너뛴다(≈0.6s · SRS-054).
      const me = (alive ? parseUser(takeRefreshedMe()) : null) ?? (await authClient().me({})).user ?? null;
      setUser(me);
      // 앱을 열 때가 첫 방아쇠다 — 다른 기기에서 한 운동이 여기 있어야 한다.
      if (me) void reconcile(me.id);
    } catch {
      // 세션이 죽었다면 로그인하지 않은 상태로 둔다(화면은 그대로 돈다). 길이 끊긴 것(오프라인)이면
      // 깃발이 살아 있다 — 직전 사용자 표시를 지우지 않는다(오프라인에서 계정이 사라져 보이지 않게).
      if (!hasSession()) setUser(null);
    } finally {
      setLoading(false);
      setRestoring(false);
    }
  }, [reconcile, setUser]);

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
  }, [load, setUser]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      restoring,
      signUp: async (email, password, displayName, humanToken) => {
        const res = await authClient().signUp(
          { email, password, displayName },
          { headers: humanToken ? { [HUMAN_HEADER]: humanToken } : {} },
        );
        if (res.tokens) setTokens(res.tokens, "email");
        setUser(res.user ?? null);
        // 로그인 전에 쌓은 기록을 이 계정 것으로 삼는다(대조가 먼저, 그다음 동기).
        if (res.user) await reconcile(res.user.id);
      },
      logIn: async (email, password) => {
        const res = await authClient().logIn({ email, password });
        if (res.tokens) setTokens(res.tokens, "email");
        setUser(res.user ?? null);
        // **다른 계정이면** 이전 사람의 기록이 올라가면 안 된다 — 남은 기록이 없으면 비우고,
        // 있으면 멈추고 고르게 한다(AccountGuard).
        if (res.user) await reconcile(res.user.id);
      },
      logInWithCode: async (code, via) => {
        const res = await authClient().exchangeLoginCode({ code });
        // 착지 화면은 곧바로 떠난다 — 쿠키가 구워질 때까지 기다린다(session.ts setTokens).
        if (res.tokens) await setTokens(res.tokens, parseLastLogin(via) ?? undefined);
        setUser(res.user ?? null);
        if (res.user) await reconcile(res.user.id);
        return res.created;
      },
      refreshMe: async () => {
        if (!hasSession()) return;
        const res = await authClient().me({});
        setUser(res.user ?? null);
      },
      logOut: async () => {
        // refresh는 httpOnly 쿠키에 있어 여기서 읽을 수 없다 — 폐기까지 세션 라우트가 한다.
        // 서버가 못 받아도 이 기기에서는 나간다(오프라인에서 로그아웃이 막히면 안 된다).
        clearTokens();
        setUser(null);
        setOwnerConflict(null);
        await onLoggedOut();
      },
      ownerConflict,
      resolveConflictByDiscard: async () => {
        if (!user) return;
        await discardAndAdopt(user.id);
        setOwnerConflict(null);
      },
      updateProfile: async (patch) => {
        const res = await authClient().updateProfile(patch);
        setUser(res.user ?? null);
      },
    }),
    [user, loading, restoring, ownerConflict, reconcile, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 안에서만 쓸 수 있다");
  return ctx;
}
