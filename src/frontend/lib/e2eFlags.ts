// @plm SRS-082  e2e 빌드 전용 깃발 — 빌드 때 상수로 접히는 NEXT_PUBLIC_ 값 하나(P5-6).
//
// 설정 스키마(lib/env.ts) 예외인 이유: env.ts 는 서버 전용(node:fs)이라 브라우저 번들에서 읽을 수 없다. 이 값은 런타임 설정이 아니라
// **빌드 깃발**이다 — `NEXT_PUBLIC_E2E_FAULTS=1 bun run build` 로 만든 e2e 빌드에서만 "1" 이고, 운영 빌드에서는 빈 값으로 접혀
// 시험용 실패 주입 코드(ImportFlow readFault)가 죽은 코드가 된다. scripts/check-docs.mjs ALLOW 에 이 파일을 넣었다.
export const E2E_FAULTS = process.env.NEXT_PUBLIC_E2E_FAULTS === "1";
