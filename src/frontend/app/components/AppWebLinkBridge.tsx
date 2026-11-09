"use client";
// 앱 링크로 앱이 열리면 그 글·프로필·해시태그로 옮긴다(화면 지도 2026-11-09 「앱 링크 도착지」).
// 스토어 앱은 웹앱을 그대로 띄우므로, 링크로 앱이 켜지거나 앞으로 와도 웹뷰는 보던 화면 그대로였다.
// 앱이 아니면 아무것도 하지 않는다. 이미 그 화면이면 옮기지 않는다.
import { appWebLinkPath } from "@app/core/domain/appContinue";
import { useEffect } from "react";
import { navigate } from "@/lib/nav";
import { onAppWebLink } from "@/lib/native";

export function AppWebLinkBridge() {
  useEffect(() => {
    let off: (() => void) | null = null;
    let alive = true;
    // iOS 는 콜드 스타트 링크가 getLaunchUrl 재생과 appUrlOpen 으로 두 번 올 수 있다 — 2초 안 같은 링크는 한 번만(REV 낮음)
    let last = { url: "", at: 0 };
    void onAppWebLink((url) => {
      const path = appWebLinkPath(url, location.host);
      if (!path || path === location.pathname + location.search + location.hash) return;
      const now = Date.now();
      if (last.url === url && now - last.at < 2000) return;
      last = { url, at: now };
      navigate(path);
    }).then((o) => {
      if (alive) off = o;
      else o?.();
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);
  return null;
}
