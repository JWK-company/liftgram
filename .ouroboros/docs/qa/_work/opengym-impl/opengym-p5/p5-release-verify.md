<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# P5(가져오기) 배포 직전 재검증 — 2026-10-27

- 대상: `feat/opengym-p5` (5d7c938 · 0c80d56) — v0.45.0(1037250) 위로 rebase된 상태. 코드 수정 없음.
- 환경: 전용 스크래치 `/private/tmp/claude-501/-Users-woobi-Desktop-tarae-liftgram/6710ac69-de6f-4144-8f1a-dde1878c495b/scratchpad/p5rel/`(env.sh·로그 일체) · DB `e2e_og_p5rel_10272130`(종료 후 삭제) · 웹 3500 / API 3501(종료).

## 결과

| 항목 | 결과 |
|---|---|
| `make verify`(lint·typecheck·test·core-check·catalog-check·docs-check) | 통과(exit 0) · 단위 497/497 · 카탈로그 480행 정본 일치 · 문서 검사 일치 |
| `cd backend && go test ./...` | 통과(exit 0) · 13 패키지 ok |
| 운영 빌드(`NEXT_PUBLIC_E2E_FAULTS=1`) + migrate | 성공 · 마이그레이션 19/19 |
| e2e `opengym-import`(실패 주입 빌드) | **12/12 통과**(1.2m) · skip 0 |
| 운영 빌드(플래그 없음) | 성공 |
| e2e 회귀 24파일(아래) | **124 통과 · 1 실패(flake) · 6 skip**(9.8m) |
| 플래그 없는 산출물 실패 주입 흔적 | **없음**(아래) |

회귀 대상: analytics · data-safety · declutter-block/p3/p4/shots/summary · feedback-62-64(다른 세션 신규) · history-replay · home-primary · offline · opengym-bodyweight/muscle/qa1/rir · profile · profile-edit · record-slots(다른 세션 수정) · session · session-assist · session-cookie · session-refresh-race · sync · workout.
(`git diff 40d6c46..1037250 -- src/frontend/e2e` = feedback-62-64 신규, declutter-block·record-slots·fixtures/declutter-seed 수정 → 모두 포함.)

skip 6건 = declutter-shots 캡처 5 + opengym-muscle 시안 비교 캡처 1(원래 캡처 전용 skip).

### 실패 1건 — flake 판정

`feedback-62-64.spec.ts:58` 「#64 완료 직후 요약·루틴 저장 시트가 떠 있는 동안은 새 버전을 적용하지 않고, 홈으로 가면 적용한다」

- 오류: 마지막 단계 `expect.poll(() => page.evaluate(... __pageId))` 에서 `Execution context was destroyed, most likely because of a navigation`.
- 단독 재실행 3/3 통과 · 파일 전체 재실행 3회 중 2회 같은 지점 실패, 1회 전부 통과(8/8).
- 판단: 홈으로 간 뒤 **기대한 새로고침이 실제로 일어나는 순간** evaluate 가 걸려서 나는 시험 쪽 경합이다(poll 콜백이 던진 오류를 재시도하지 않음). 앞 단계(요약·시트가 떠 있는 동안 skip-waiting 없음, controllerchange 에도 pageId 유지)는 매번 통과. 제품 결함 아님.
- P5 관련성: P5 변경(27파일)은 서비스워커·요약·완료 경로를 건드리지 않는다(layout.tsx 에 `ImportElsewhereNotice` 추가, next.config 에 env 한 줄뿐). 이 spec 은 v0.45.0 세션이 넣은 것 → 그 세션에 시험 보강(evaluate 를 try/catch 로 감싸 undefined 반환 등) 전달 권장. 배포 차단 사유 아님.
- dm:157(기존 실패)은 이번 범위에 포함하지 않았다.

### 실패 주입 코드 제거 확인(플래그 없는 빌드)

- `readFault` · `liftgram.e2e.importFault`(`importFault`) · `throw|reload|hold` 정규식: `.next/static`·`.next/server` JS 에 **0건**(서버 쪽 소스맵 `ImportFlow_tsx…js.map` 1개에만 원문이 남음 — 브라우저 번들 아님).
- `NEXT_PUBLIC_E2E_FAULTS` 는 `required-server-files.json`·standalone `server.js` 설정 사본에 `""`(빈 값)으로만 존재.
- `public/sw.js` 0건.

## 판정

**배포 가능.** 남은 1건은 P5 와 무관한 시험 경합 flake(v0.45.0 신규 spec).

## 정리

3500·3501 서버 종료 · DB 삭제 · `src/frontend/next-env.d.ts` 원복 · e2e 부산물 `.media/` 삭제. (`src/frontend/test-results/` 는 gitignore — flake 추적용으로 둠.) 작업트리 추적 파일 변경 없음.
