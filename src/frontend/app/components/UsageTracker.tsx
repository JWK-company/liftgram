"use client";
// 이용 기록 수집기(SPEC-032 Phase 3) — 화면 이동·앱 열기·접속 신호. 아무것도 그리지 않고 화면을 막지 않는다.
// 접속 신호는 화면이 보일 때만, 60초마다. 끄면 전부 멈춘다(lib/usage).
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { onAppState } from "@/lib/native";
import {
  APP_OPEN_GAP_MS,
  FIRST_SEND_DELAY_MS,
  flushUsage,
  persistUsage,
  PERSIST_INTERVAL_MS,
  PRESENCE_INTERVAL_MS,
  screenEvent,
  setUsageActor,
  trackUsage,
} from "@/lib/usage";
import { useAuth } from "./AuthProvider";

export function UsageTracker() {
  const path = usePathname();
  const { user, loading } = useAuth();
  const userId = user?.id ?? "";

  // 신원 — 확인이 끝난 뒤에 정한다. 그 전 항목은 메모리에서 기다린다.
  useEffect(() => {
    setUsageActor(loading && !user ? null : userId);
  }, [loading, user, userId]);

  // 화면 구역 — 같은 구역 안 이동은 세지 않는다.
  const lastZone = useRef<string | null>(null);
  useEffect(() => {
    const ev = screenEvent(path ?? "/");
    if (ev === lastZone.current) return;
    lastZone.current = ev;
    trackUsage(ev);
  }, [path]);

  useEffect(() => {
    trackUsage("app_open");
    let hiddenAt: number | null = null;
    const visible = () => document.visibilityState === "visible";

    const onShow = () => {
      if (hiddenAt !== null && Date.now() - hiddenAt >= APP_OPEN_GAP_MS) trackUsage("app_open");
      hiddenAt = null;
      void flushUsage(true);
    };
    const onHide = () => {
      if (hiddenAt === null) hiddenAt = Date.now();
      persistUsage();
      void flushUsage(false);
    };
    const onVisibility = () => (visible() ? onShow() : onHide());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);

    let appListener: { remove: () => Promise<void> } | null = null;
    let gone = false;
    void onAppState((active) => (active ? onShow() : onHide())).then((l) => {
      if (gone) void l?.remove();
      else appListener = l;
    });

    const first = setTimeout(() => {
      if (visible()) void flushUsage(true);
    }, FIRST_SEND_DELAY_MS);
    const persist = setInterval(persistUsage, PERSIST_INTERVAL_MS);
    const presence = setInterval(() => {
      if (visible()) void flushUsage(true);
    }, PRESENCE_INTERVAL_MS);

    return () => {
      gone = true;
      clearTimeout(first);
      clearInterval(persist);
      clearInterval(presence);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      void appListener?.remove();
    };
  }, []);

  return null;
}
