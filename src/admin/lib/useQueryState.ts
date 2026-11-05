"use client";

// 거르기와 페이지를 주소에 둔다. 링크로 나눌 수 있고 뒤로 가기가 유지된다.
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function useQueryState(): [URLSearchParams, (patch: Record<string, string | null>) => void] {
  const params = useSearchParams();
  // 거르기는 브라우저에서 처리한다. history 를 직접 바꾸면 서버 왕복 없이 바로 반영되고 useSearchParams 도 따라온다.
  const set = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `${location.pathname}?${qs}` : location.pathname);
  }, []);
  return [new URLSearchParams(params.toString()), set];
}
