"use client";
// @plm SRS-007  스크롤 끝에서 다음 페이지 — app의 `onEndReached`를 웹으로
//
// app은 목록이 끝에 닿으면 다음 페이지를 가져온다("더 보기" 버튼이 없다). 웹에서 그 동작을
// 그대로 내려면 **끝에 보이지 않는 표식**을 두고, 그것이 화면에 들어오는 순간 부른다.
//
// 스크롤 이벤트를 듣지 않는 이유: 스크롤은 초당 수십 번 불리고, 어느 요소가 스크롤되는지도
// 화면마다 다르다. IntersectionObserver는 브라우저가 대신 판정해 준다.
//
// **더 가져올 게 없으면 아무것도 그리지 않는다** — 표식이 남아 있으면 빈 응답을 계속 조른다.
import { useEffect, useRef } from "react";

export function InfiniteSentinel({ onReach, disabled }: { onReach: () => void; disabled?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // 콜백이 매 렌더 새로 만들어져도 관찰자를 다시 만들지 않는다.
  const cb = useRef(onReach);
  cb.current = onReach;

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) cb.current();
      },
      // 화면에 닿기 전에 미리 부른다 — 끝까지 내린 뒤 기다리는 느낌을 없앤다.
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [disabled]);

  if (disabled) return null;
  return <div ref={ref} data-testid="infinite-sentinel" className="h-px w-full" />;
}
