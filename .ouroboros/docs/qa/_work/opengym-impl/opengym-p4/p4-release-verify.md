# P4(성과 요약·코치에게 보내기) 배포 직전 재검증 — 2026-10-27

대상: `liftgram-wt-opengym-p4` · `feat/opengym-p4` HEAD `f0629aa`(v0.46.0 `015f376` 위 rebase · P4 커밋 3개) · 코드 수정 없음.
환경: 전용 스크래치 `scratchpad/p4rel/env.sh` · DB `e2e_og_p4rel_10272152`(새로 만들고 삭제) · 웹 3600 / API 3601 · **플래그 없는 운영 빌드**(`NEXT_PUBLIC_E2E_FAULTS` 해제) · SW build `Rz6kiPkSXkZ4inZ03zgCr`(미리 받기 122개) · migrate 19/19.

## 1. 정적·단위 검사
| 항목 | 결과 |
|---|---|
| `make verify` | exit 0 — biome 333파일 오류 0(경고 3: `scripts/gen-page.mjs`·`ui/quiet.tsx`, P4 변경 아님·기존) · 타입 통과 · core **501/501** · 토큰/카탈로그(480행) 드리프트 0 · 문서 검사 통과 |
| `go test ./...` | exit 0 (ok 13 패키지 · 테스트 없는 패키지 40) |
| `go vet ./...` | exit 0 |

## 2. e2e(운영 빌드) — 전체 스위트 257개
지정 묶음을 포함해 스위트 전부가 돌았다(필터 `opengym-` 가 폴더 이름에도 걸려 전체 실행 — 범위가 넓어진 것뿐).
**238 통과 · 6 실패 · 13 건너뜀**(18.4분).

| 묶음 | 통과 | 실패 | 건너뜀 |
|---|---|---|---|
| opengym-summary | 6 | 0 | 0 |
| opengym-*(전체) | 45 | 3 | 1 |
| coaching | 5 | 0 | 0 |
| dm(알림 포함) | 4 | 1 | 0 |
| analytics(통계) | 4 | 0 | 0 |
| sync | 6 | 0 | 0 |
| data-safety | 4 | 0 | 0 |
| offline | 3 | 0 | 0 |
| session* | 15 | 0 | 0 |
| home-primary | 9 | 0 | 0 |
| declutter* | 25 | 0 | 5(캡처 전용) |
| feedback-62-64 | 7 | 1 | 0 |
| profile* | 6 | 1 | 0 |

### 실패 판정
| 실패 | 판정 | 근거 |
|---|---|---|
| `opengym-import.spec.ts:193` · `:266` · `:533` | **해당 없음(건너뜀 취급)** | 모두 `liftgram.e2e.importFault`(throw/reload/hold) 실패 주입 — `NEXT_PUBLIC_E2E_FAULTS=1` 플래그 빌드에서만 동작. 운영 빌드라서 실패. 나머지 import 테스트는 전부 통과 |
| `dm.spec.ts:157` | **기존 실패** | 단독 3회 모두 실패(같은 click 타임아웃) — 알려진 이 환경 고유 실패 |
| `feedback-62-64.spec.ts:58` | **flake(알려진 시험 경합)** | 단독 3/3 통과 |
| `profile-edit.spec.ts:114`(오운완 피드 카드) | **flake** | 스위트 안에서 피드가 비어 20초 초과 → 단독 3/3 통과(9.6~13.6s). P4 와 무관한 피드 경로 |

건너뜀 13: auth-formal 3·auth-last-login 1(소셜 로그인)·declutter-shots 5·feedback 1·opengym-muscle 캡처 1 외 — 전부 설계상 건너뜀.

## 3. 서비스워커 셸 목록 대조
- `frontend/sw/sw.template.js` SHELLS = 생성물 `public/sw.js` SHELLS = `frontend/lib/shellCache.ts` SW_SHELLS =
  `/ · /workout · /history · /calendar · /stats · /stats/summary · /exercises · /profile · /offline`(9개) — **일치**(core `shellCache.test.ts` 대조 테스트도 501 안에서 통과).
- main(015f376) 대비 차이는 `/stats/summary` 추가 1줄뿐 — 5단계·다른 세션 변경과 합친 뒤에도 충돌·누락 없음. `SWR_SHELLS` 에는 의도대로 넣지 않음.
- 운영 서버에서 9개 셸 전부 HTTP 200. `/stats/summary` 는 다른 탭과 같은 ƒ(동적) 라우트이고 페이지가 cookies()/headers()를 읽지 않음.
- 오프라인 첫 진입 e2e(`opengym-summary` 「오프라인 첫 진입 — 셸로 열리고…」) 통과.

## 4. 360 라이트 캡처 `.ouroboros-work/shots/p4-rel/`
`summary-360-light.png`(전체 페이지) · `dm-card-360-light.png` · `dm-open-360-light.png` · `report-360-light.png`
- 요약: 4주 기본·체중 섹션 꺼짐·총 볼륨 600kg(맨몸 추가 무게만)·부위별 세트·보낼 항목 칩 정상. 전체 페이지 캡처 중간의 탭바는 고정 탭바가 fullPage 에 찍힌 것(화면 결함 아님).
- DM 카드: 「성과 요약 · 눌러서 보기」 고정 문구(숫자 없음) 정상.
- 트레이너 리포트: 숫자(1회·600kg·0.3회·직전 대비) 회원 요약과 같음 · 세트 수 안내 문구 정상.
- 잘림·겹침·대비 문제 없음.

## 5. 판정 — **배포 가능**
P4 관련(opengym-summary 6/6 · coaching · dm 요약 카드 · 알림 · 리포트 · 오프라인 셸) 전부 통과. 남은 실패는 플래그 빌드 전용 3건 · 기존 dm:157 · 단독 재실행 통과 flake 2건뿐. 배포 시 SemVer(app.json·appInfo.ts) 갱신 잊지 말 것.

## 정리
3600·3601 종료(리스너 0) · DB 삭제(남은 `e2e_og_p4rel_%` 0) · `.media/`·`frontend/test-results/`·임시 캡처 spec 삭제 · `next-env.d.ts` 원복 · 작업 트리 변경 없음(미추적 `.ouroboros-work/`·`lefthook.yml` 은 원래 있던 것).
