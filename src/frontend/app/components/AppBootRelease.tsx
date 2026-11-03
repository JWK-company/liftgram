"use client";
// 시작 화면(SPEC-017 Phase 1 · SRS-054) — 첫 화면이 준비되면 앱 부팅 덮개를 내린다.
// 덮개·켜는 스크립트는 layout.tsx 에 있고(서비스 워커 캐시 셸에도 그대로 실린다), 여기는 끄는 쪽만 맡는다.
// 웹 브라우저에서는 덮개 표식이 없어 아무 일도 하지 않는다.
import { useEffect } from "react";
import { finishAppBootCover, whenFirstScreenReady } from "@/lib/native";

/** 첫 화면 준비 신호를 기다리는 상한 — 넘으면 그냥 내린다(신호가 끝내 안 와도 덮개에 갇히지 않게). */
const READY_CAP_MS = 2500;

export function AppBootRelease() {
  // [원본] useEffect(() => { finishAppBootCover(); }, []); — 루트 하이드레이션 직후 내렸다(빈 목록이 한 번 보였다 · REV-004 웹 M-2)
  // [개선] 「첫 화면 준비(활성 운동 읽기 + 앱이면 첫 drain)」 신호 또는 상한 — SessionProvider 가 신호를 낸다(SPEC-017 Phase 3)
  useEffect(() => {
    let done = false;
    const release = () => {
      if (done) return;
      done = true;
      finishAppBootCover();
    };
    const off = whenFirstScreenReady(release);
    const cap = window.setTimeout(release, READY_CAP_MS);
    return () => {
      off();
      window.clearTimeout(cap);
    };
  }, []);
  return null;
}
