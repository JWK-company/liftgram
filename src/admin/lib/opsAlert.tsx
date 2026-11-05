"use client";

// 메뉴 「운영 상태」의 경고 점. 관리자일 때만 묻고, 보이는 동안 10분마다, 화면이 다시 보일 때 다시 묻는다.
// 실패하면 직전 값을 둔다(점이 깜빡이지 않게). 권한이 사라졌으면 끈다.
import { Code, ConnectError } from "@connectrpc/connect";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { opsApi } from "./rpc";

const INTERVAL_MS = 10 * 60_000;

const Ctx = createContext<{ alert: boolean; checked: boolean; setAlert: (on: boolean) => void }>({
  alert: false,
  checked: false,
  setAlert: () => {},
});

export function useOpsAlert() {
  return useContext(Ctx);
}

export function OpsAlertProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [alert, setAlertValue] = useState(false);
  const [checked, setChecked] = useState(false);
  const setAlert = useCallback((on: boolean) => {
    setAlertValue(on);
    setChecked(true);
  }, []);

  const asking = useRef(false);
  const refresh = useCallback(() => {
    if (!enabled || asking.current) return;
    asking.current = true;
    opsApi
      .getOpsAlert({})
      .then((r) => setAlert(r.alert))
      .catch((e) => {
        // 권한이 없어지면 끈다. 일시 실패는 직전 값을 유지한다.
        if (e instanceof ConnectError && e.code === Code.PermissionDenied) setAlertValue(false);
      })
      .finally(() => {
        asking.current = false;
      });
  }, [enabled, setAlert]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = setInterval(tick, INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled, refresh]);

  return <Ctx.Provider value={{ alert, checked, setAlert }}>{children}</Ctx.Provider>;
}
