"use client";

// 화면이 공유하는 로그인 상태. 내 정보(역할 포함)는 늘 서버에서 새로 받는다.
import { AuthService, type Role, type User } from "@app/contracts";
import { Code, ConnectError, createClient } from "@connectrpc/connect";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { isStaff } from "@/lib/roles";
import {
  hasSession,
  logOut,
  onSessionChange,
  onSessionEnd,
  rememberUser,
  restoreSession,
  transport,
} from "@/lib/session";

const REVALIDATE_ON_FOCUS_MS = 30_000;

type State =
  | { status: "loading" }
  | { status: "in"; user: User }
  | { status: "denied" }
  | { status: "unavailable" };

const Ctx = createContext<{ user: User; role: Role; signOut: () => void } | null>(null);

/** 로그인된 화면에서 내 정보를 읽는다. */
export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("SessionProvider 밖에서 useSession 을 불렀다");
  return v;
}

function goLogin() {
  const here = `${location.pathname}${location.search}`;
  location.replace(`/login?next=${encodeURIComponent(here)}`);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const restored = await restoreSession();
    if (restored === "out") return goLogin();
    if (restored === "denied") return setState({ status: "denied" });
    if (restored === "unavailable") return setState({ status: "unavailable" });
    try {
      const me = await createClient(AuthService, transport).me({});
      if (!me.user) return goLogin();
      if (!isStaff(me.user.role)) {
        await logOut();
        return setState({ status: "denied" });
      }
      rememberUser(me.user.id);
      setState({ status: "in", user: me.user });
    } catch (e) {
      // 깃발이 살아 있는 401 은 갱신이 503 으로 실패한 것이다. 503 은 로그아웃이 아니다.
      if (e instanceof ConnectError && e.code === Code.Unauthenticated && !hasSession()) return goLogin();
      setState({ status: "unavailable" });
    }
  }, []);

  // 역할은 열린 탭에서도 바뀐다. 토큰 갱신·권한 거절·탭 복귀 때 다시 읽어 메뉴와 화면을 맞춘다.
  const checking = useRef(false);
  const lastCheck = useRef(0);
  const revalidate = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    lastCheck.current = Date.now();
    try {
      const me = await createClient(AuthService, transport).me({});
      if (!me.user) return;
      if (!isStaff(me.user.role)) {
        await logOut();
        setState({ status: "denied" });
        return;
      }
      const user = me.user;
      setState((prev) => (prev.status === "in" ? { status: "in", user } : prev));
    } catch {
      // 다음 기회에 다시 본다. 세션이 끝났다면 onSessionEnd 가 이미 화면을 옮겼다.
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    void load();
    const offEnd = onSessionEnd((r) => {
      if (r === "denied") setState({ status: "denied" });
      else goLogin();
    });
    const offChange = onSessionChange(() => void revalidate());
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastCheck.current >= REVALIDATE_ON_FOCUS_MS) void revalidate();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      offEnd();
      offChange();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load, revalidate]);

  const signOut = useCallback(() => {
    void logOut().then(() => location.replace("/login"));
  }, []);

  if (state.status === "loading") {
    return (
      <main>
        <p data-testid="session-loading" role="status" className="p-6 text-muted">
          불러오는 중…
        </p>
      </main>
    );
  }
  if (state.status === "denied") {
    return (
      <main data-testid="session-denied" role="alert" className="p-6 space-y-3">
        <h1 className="font-semibold">운영 권한이 없습니다</h1>
        <p>권한이 필요하면 관리자에게 요청하세요.</p>
        <a className="underline" href="/login">
          로그인 화면으로
        </a>
      </main>
    );
  }
  if (state.status === "unavailable") {
    return (
      <main data-testid="session-unavailable" role="alert" className="p-6 space-y-3">
        <h1 className="font-semibold">서버에 연결할 수 없습니다</h1>
        <p>잠시 뒤 다시 시도하세요. 로그인이 끝났다면 다시 로그인하라고 안내합니다.</p>
        {/* 새로고침: 입구(Access) 인증이 끝난 경우 fetch 로는 벗어날 수 없고, 전체 이동이어야 다시 인증한다. */}
        <button type="button" className="underline py-1.5" onClick={() => location.reload()}>
          다시 시도
        </button>
      </main>
    );
  }
  return <Ctx.Provider value={{ user: state.user, role: state.user.role, signOut }}>{children}</Ctx.Provider>;
}
