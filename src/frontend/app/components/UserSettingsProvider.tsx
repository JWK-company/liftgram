"use client";
// @plm SRS-006  사용자 설정 컨텍스트를 브라우저에서만 켠다
//
// ─────────────────────────────────────────────────────────────────────────────
// 단위(kg/lb)·바 무게·체중·보유 기구·머신 라벨은 화면 곳곳이 읽는다. 그 컨텍스트는 **이전해 온
// 그대로**(`@app/core/state/userContext`) 쓴다 — 웹에서 다시 쓰면 두 구현이 갈라진다(ADR-032).
//
// 다만 그 컨텍스트는 로컬 저장소(WatermelonDB)를 모듈 최상단에서 연다. 서버에는 그런 저장소가
// 없으므로 **서버 렌더 대상에서 빼야 한다**(`ssr: false`). 그래서 이 얇은 껍데기가 필요하다:
//   · 이 파일은 클라이언트 컴포넌트다(서버 컴포넌트에서는 `ssr: false` 를 쓸 수 없다)
//   · 감싸인 화면은 브라우저에서만 그려진다 — 어차피 로컬 저장소를 읽어야 보이는 화면들이다
//
// **서버 렌더가 필요한 화면(종목 상세)은 감싸지 않는다.** 공유 URL이라 첫 HTML과 상태 코드가
// 정확해야 하기 때문이다 — 거기서 설정이 필요해지면 그 부분만 작은 클라이언트 섬으로 뗀다.
// ─────────────────────────────────────────────────────────────────────────────
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const CoreUserProvider = dynamic(() => import("@app/core/state/userContext").then((m) => m.UserProvider), {
  ssr: false,
});

export function UserSettingsProvider({ children }: { children: ReactNode }) {
  return <CoreUserProvider>{children}</CoreUserProvider>;
}
