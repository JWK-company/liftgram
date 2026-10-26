"use client";
// @plm SRS-054  앱 안 링크를 클라이언트 이동으로 — 탭·화면을 옮길 때마다 문서를 새로 받지 않게
//
// ─────────────────────────────────────────────────────────────────────────────
// 화면들은 옛 RN 앱을 옮기며 `<a href="/…">` 를 그대로 썼다. 그러면 누를 때마다 **문서 전체를 새로 받는다**:
// HTML 한 번(운영 경로에서 ≈0.6s) + JS 다시 실행 + 로컬 DB 다시 열기 + 세션 확인(갱신·내 정보) 다시.
// 로그인 상태가 몇 초간 비로그인처럼 보이던 것·피드백 탭이 있다 없다 하던 것이 전부 여기서 나왔다(2026-10-26 실측).
//
// 82곳을 하나씩 next/link 로 바꾸는 대신 셸에서 한 번 가로챈다: 같은 출처 · 앱 화면 주소 · 보조키 없는 왼쪽 클릭이면
// router.push. 가로채지 않는 것 — /api/*(소셜 로그인 시작 등 서버 리다이렉트) · 새 창(target) · 다운로드 ·
// data-hard(일부러 전체 이동) · 해시만 바뀌는 이동.
// ─────────────────────────────────────────────────────────────────────────────
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { setNavRouter } from "@/lib/nav";

export function LinkInterceptor() {
  const router = useRouter();
  useEffect(() => {
    setNavRouter(router);
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a?.hasAttribute("href")) return;
      if (a.target && a.target !== "_self") return;
      if (a.hasAttribute("download") || a.dataset.hard != null) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (
        url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/media/") ||
        /\.[a-z0-9]+$/i.test(url.pathname)
      )
        return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      e.preventDefault();
      router.push(url.pathname + url.search + url.hash);
    };
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      setNavRouter(null);
    };
  }, [router]);
  return null;
}
