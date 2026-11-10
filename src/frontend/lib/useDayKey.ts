"use client";
// 기기 날짜 열쇠(SPEC-050 P4 리뷰) — 화면을 연 채 자정을 넘기면 「이번 주」·「N일째 쉬는 중」을 다시 세게 한다.
//   바뀜 감지 = 다음 자정 타이머 + 화면으로 돌아올 때(visibilitychange·focus — 잠자기 동안 타이머가 밀린 경우).
//   값은 「YYYY-M-D」(기기 시간대) — 날이 바뀔 때만 새 값이 되어 그때만 다시 그린다.
import { useEffect, useState } from "react";

export function dayKeyOf(ms: number = Date.now()): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function useDayKey(): string {
  const [key, setKey] = useState(() => dayKeyOf());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => setKey((prev) => (prev === dayKeyOf() ? prev : dayKeyOf()));
    const arm = () => {
      const next = new Date();
      next.setHours(24, 0, 1, 0); // 다음 자정 1초 뒤
      timer = setTimeout(
        () => {
          check();
          arm();
        },
        Math.max(1000, next.getTime() - Date.now()),
      );
    };
    const onShow = () => {
      if (document.visibilityState !== "hidden") check();
    };
    arm();
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, []);
  return key;
}
