# 결과 보고 — 피드백 #62·#63·#64 (2026-10-27 · SRS-084)

> 브랜치 `feat/feedback-62-64`(worktree `/Users/woobi/Desktop/tarae/liftgram-wt-fb6264`) · **배포 안 함**(검토자 qa code 뒤 main 이 ff-only 합치기·배포)
> 커밋: `4219a66` fix(session) · `fb21767` chore(release) v0.45.0 — 둘 다 `40d6c46`(v0.44.0 openGym P3) 위로 리베이스, 충돌 없음
> 스펙 `.ouroboros/docs/spec/20261027_feedback-62-64/spec.md` · QA spec `.ouroboros/docs/qa/20261027_feedback-62-64-spec_qa.md` · 요구 `SRS-084`(URS-018·019·023)

## 무엇을 고쳤나
| # | 원인·결정 | 수정 |
|---|-----------|------|
| #64 버그 | `ServiceWorker.tsx` 가 「진행 중 운동 없음」이면 기다리던 새 워커에 곧바로 skip-waiting. 완료 버튼은 셸의 진행 중 운동을 먼저 null 로 만들어(`setActive(null)`), 요약·「바뀐 루틴 저장」 시트가 떠 있는 순간 controllerchange → `location.reload()` → 홈. 당일 배포가 있으면 매번 재현. `ActiveWorkout` 의 `leaveSession` effect 는 원인이 아님(같은 비동기 콜백 안의 `setSummary`·`setWorkout(null)` 이 한 그림에 묶임 — 기존 완료 e2e 가 증명). 새로고침 원천은 이 한 곳 | 판정을 순수 함수 `core/src/domain/swUpdatePolicy.ts` 로: **`/workout`(진행 중·요약·완료 시트)에 있는 동안은 자동 적용 안 함**, 다른 탭이 적용해 controllerchange 가 와도 **새로고침을 미뤘다가 떠날 때**, 새 버전 띠도 숨김. 홈으로 가면 경로가 바뀌어 다시 판단 → 적용 |
| #63 버그 | 배수 = (적재 칸 plate) × (사용자가 켠 「한쪽」) — 둘 다 켜지 않으면 null=1. 운영 머신 세트가 전부 null | **플레이트 후보** = 머신 + family 적재 축 + 하중 모드 external(어시스트 제외). 빈 적재 칸은 family 의 **흔한 적재 방식**(`catalog.families.csv` 새 열 `load_default`: plate 19 · pin 27)으로 본다 → plate 면 **기본 한쪽(×2)**. 입력 방식을 안 정한 종목은 세트 표 아래 한 줄 「원판 한쪽 무게로 적나요? ✓한쪽 · 양쪽 합·핀」(`plate-ask`)으로 **한 번** 묻고 종목별 기억(「양쪽 합」도 행을 만들어 기록 · 명시 배수 1). **답하지 않고 완료하면 한쪽을 답으로 기록**. 답은 이 블록 세트의 배수만 바꾼다(숫자 그대로 · 한 세트 포함). 옛 null 배수 기록은 프리필에서 **숫자 그대로**(옛 규칙은 절반으로 환산했다). 합계 무게는 따로 표시하지 않음 |
| #62 개선 | 메모·휴식·순서가 ⋯ 메뉴 안 | 세트 추가 아래 **도구 한 줄** `⏱ 휴식 2:00 · ✎ 메모(첫 줄 미리보기) ··· ⌃ ⌄` — 회색 글자·아이콘, 빨강 없음, 누르는 자리 44px(보이는 아이콘 18px), 첫 블록 ⌃·마지막 ⌄ 흐린 비활성, 블록 하나면 순서 버튼 없음, 슈퍼셋 멤버엔 없음(묶음 머리의 위아래도 같은 부품 — 보이는 28px·누르는 자리 44px로 바꿈). 메모는 누르면 입력칸(포커스)·벗어나면 저장 후 미리보기로 접힘. ⋯ 메뉴엔 운동 방법·슈퍼셋·교체·삭제만. testid 유지 |

### 「플레이트 머신」 분류(load_default) — 검토 요청
- **plate(기본 한쪽)**: chest_press · incline_press · decline_press · bench_press(머신 라잉 체스트) · overhead_press(머신 숄더) · high_row · low_row · chest_supported_row · lat_pulldown(머신 랫풀다운) · hack_squat · leg_press · pendulum_squat · v_squat · belt_squat · hip_thrust · shrug · donkey_calf_raise · seated_calf_raise · leg_press_calf_raise
- **pin(묻지 않음 · ×1)**: 그 밖 27 family(레그 익스텐션·레그 컬 3종·펙 덱·리버스 펙 덱·래터럴·어브덕션/어덕션·머신 컬·프리처·트라이셉스·크런치·백 익스텐션·딥스·풀오버·킥백·토르소 로테이션·어시스트 3종 등). 핀 칸 기본이라도 사람이 칸 시트에서 「플레이트」를 고르면 그때 묻는다.
- 키 축(ADR-034)은 그대로 — 빈 적재 칸의 기본일 뿐이라 기록 버킷은 바뀌지 않는다. `CATALOG_REVISION` 이 바뀌어 기기가 한 번 `refreshSeedCatalog` 를 돈다(멱등).

## 바뀐 파일
- core: `domain/swUpdatePolicy.ts`(신규) · `domain/recordSlots.ts`(V2 함수 추가 — 옛 함수 보존) · `data/exercisePrefs.ts`(tri-state 선택) · `data/catalogMeta.ts`(`plateDefaultLoadMap`) · `data/workoutRepository.ts`(배수 4경로·프리필·동기 V2, `answerPlateOneSide`·`setPlateOneSideForExerciseV2`·`settleUndecidedPlateOneSide`) · `data/catalog/{catalog.families.csv,catalogTypes.ts,catalog.generated.ts,catalogRevision.ts}` · i18n ko·en 7키 · 테스트 `__tests__/{swUpdatePolicy,plateDefault}.test.ts`
- frontend: `ServiceWorker.tsx` · `session/{ExerciseBlock,ActiveWorkout}.tsx` · `session/{BlockTools,PlateAskLine}.tsx`(신규) · `lib/usePlateOneSide.ts`(신규) · `ui/RecordSlotSelector.tsx` · `routines/RoutineEditor.tsx`
- scripts: `gen-catalog.mjs`(load_default 검증·생성)
- e2e: `feedback-62-64.spec.ts`(신규 6건) · `declutter-block.spec.ts`(머리 화살표 단언 = 세트 표 **앞**만 · 순서 테스트는 도구 줄) · `record-slots.spec.ts`(한쪽으로 태어나 환산 없음 20) · `fixtures/declutter-seed.ts`(체크박스는 `.check()`)
- 원본 보존(§3.6): 바꾼 호출은 전부 `[원본]` 주석 + `[개선]` 새 호출

## 테스트
| 무엇 | 결과 |
|------|------|
| 단위(수정 전) | `swUpdatePolicy.test.ts`·`plateDefault.test.ts` — 모듈·export 없음으로 2/2 실패(`scratchpad/fb6264/unit-before.txt`) |
| `make verify`(리베이스 뒤) | 통과 · core 491 pass / 0 fail · 타입·lint·catalog-check·docs-check |
| 새 e2e 6건 — **옛 빌드(cab9bbe, 3210)** | **6/6 실패** — #64 「요약·완료 시트가 떠 있는 동안 skip-waiting」(버그 그대로 재현) · #64-2 같은 지점 · #63 3건 `plate-ask` 없음 · #62 도구 줄 없음(`scratchpad/fb6264/e2e-before.log`) |
| 새 e2e 6건 — 새 빌드(3200) | **6/6 통과**(`e2e-after.log`) |
| 전체 e2e — 새 빌드(리베이스 전 커밋 6b1346d · 3200) | **213 passed · 0 failed · 13 skipped(env 게이트)** · 8.4분(`e2e-full.log`) |
| 리베이스 뒤 다시 빌드(fb21767)한 관련 e2e 10파일 — feedback-62-64·declutter-block·record-slots·history-replay·finish-routine·session·workout·opengym-bodyweight·declutter-summary·offline | **55 passed**(`e2e-rebased.log`) |

## 화면(390×844 · 같은 시드: 푸시다운 + 메모 · 벤치프레스 · 머신 체스트 프레스)
스크린샷 `/private/tmp/claude-501/-Users-woobi-Desktop-tarae-liftgram/cc0fac10-a48f-447f-9b27-a359273dcc6f/scratchpad/fb6264/shots/` — `{before,after}-{light,dark}-{full,block0,block2-machine}.png`

| 블록 | 전 높이 | 후 높이 | 머리(블록 top→첫 세트 체크) | 구성 변화 |
|------|--------|--------|----------------------------|-----------|
| 푸시다운(메모 있음) | 339 | **296** | 133 → 133 | 2줄 입력칸 → 도구 줄의 메모 첫 줄 미리보기 |
| 벤치프레스(메모 없음) | 250 | 296(+46) | 133 → 133 | 도구 줄 한 줄 추가 |
| 머신 체스트 프레스 | 250 | 361 | 133 → 145 | 표 머리 「한쪽」(+12, 기존 디자인) · 질문 줄(답하면 사라짐) · 도구 줄 |
첫 세트 체크 top 285 → 285(불변) · 화면 정리 측정(declutter-block: 머리 ≤170 · 첫 세트 ≤320 · 빨강 0) 통과.

## 남은 위험
- **R1 첫 세션 볼륨·PR 2배**: 옛 머신 기록(null=×1) 대비 새 세트(×2)라 첫 운동에서 플레이트 머신 종목마다 PR 축하·볼륨 급증이 보일 수 있다(소급 없음 결정의 대가).
- **R2** 옛 기록을 실제로 「양쪽 합」으로 적었던 사람이 기본(한쪽)으로 두면 프리필 숫자가 그대로(80) — 질문에서 「양쪽 합·핀」을 고르면 맞다.
- **R3** 미답으로 완료하면 「한쪽」으로 굳는다. 바꾸려면 칸 시트의 「한쪽 무게로 입력」 토글(이미 한 세트는 바뀌지 않음 — 기존 규칙).
- **R4** load_default 분류는 국내 상업 헬스장의 흔한 기구 기준 추정이다(예: 머신 숄더 프레스·랫풀다운을 plate 로 봄). 피드백으로 조정 — CSV 한 칸.
- **R5** `/workout` 밖에서 입력 중(루틴 편집·글쓰기)일 때의 자동 적용은 이번 범위 밖.
- **R6** 배포 시점에 진행 중이던 운동의 세트는 옛 배수(null) — 질문에 답하면 맞춰진다.
- 서버 변경 없음(코칭 보고서·피드는 이미 `load_multiplier` 를 곱한다) · 로컬 스키마 v26 그대로.

## 사용자에게 알릴 점(main 전달용)
1. 플레이트 머신(하이 로우·체스트 서포티드 로우·체스트 프레스 등)은 이제 **처음부터 한쪽 무게(볼륨 ×2)**. 각 종목 처음 한 번 「원판 한쪽 무게로 적나요?」가 세트 표 아래에 뜬다 — 핀 머신이면 「양쪽 합·핀」, 그냥 두면 한쪽으로 기억.
2. **이미 저장된 오늘까지의 기록은 바꾸지 않았다**(×1 그대로). 그래서 다음 운동에서 그 종목의 볼륨·PR 이 지난번보다 크게(약 2배) 보일 수 있다.
3. 휴식·메모·순서 위/아래는 각 종목 카드 아래 한 줄에 있다(⋯ 메뉴 안 → 밖).
4. 완료 뒤 요약·루틴 저장 시트는 새 버전이 와도 사라지지 않는다 — 요약을 닫고 홈으로 갈 때 새 버전이 적용된다.

## 배포 메모(main)
- 버전은 `src/frontend/package.json` 하나(배포 스크립트가 읽고 같은 버전 재배포를 막는다) — v0.45.0 으로 올려 두었다. 태그는 붙이지 않았다(배포 스크립트 몫).
- 합치기: 원래 폴더 `feat/web-stack-tarae` 가 `40d6c46` 이면 `git merge --ff-only feat/feedback-62-64`.

## /qa code 조치 (2026-10-27 · `.ouroboros/docs/qa/20261027_feedback-62-64-code_qa.md` · 커밋 `1037250`)
| # | 조치 |
|---|------|
| **M-1** | 미정 종목에서 칸 시트로 「핀」·「한쪽 무게로 입력」을 바꾸면 **질문 답으로 기록**(핀 = 양쪽 합·핀)하고 숫자 그대로 배수만(`plateChangeMode`·`retagBlockLoadMultiplier`). e2e 2건 추가 — 새 종목(20 그대로)·**옛 null 기록이 있는 플레이트 머신**(IndexedDB 를 옛 모양으로 되돌려 재현 · 50 그대로). 직전 빌드 fb21767 에서 **20→40 · 50→100 으로 실패** 확인(`e2e-qa1-before.log`) |
| **M-2** | 1RM % 처방의 1RM 추정에서 옛 null 기록을 이번 블록 배수로 읽는다(`adoptLegacyMultiplier`·`estimatedOneRmForSlotV2`) — 프리필 규칙과 일치, 처방 프리필이 절반이 되지 않는다. 고정 kg 처방은 「실제 계산 무게(양쪽 합)」 뜻으로 지금처럼 블록 배수로 나눈다(스펙 Q13) — **트레이너 알림: 플레이트 머신 고정 kg 처방은 합계로 적는다**. 단위 테스트(수정 전 export 없음으로 실패) |
| L-1 | 슈퍼셋 머리 ⌄ 와 「해제」 사이 16px · 머리 줄 py 8px |
| L-3 | 미룬 새로고침 전에 flush · 진행 중 운동이 있으면 계속 미룸 |
| **M-3 (사용자 확인)** | 데이터 그대로. **확인 요청: 체스트 프레스·숄더 프레스 머신(chest_press·overhead_press)과 인클라인·디클라인·랫풀다운을 plate 기본으로 둘지** — 핀 스택이 흔하면 pin 으로 바꾸는 것은 CSV 한 칸. 알림 문구: 「체스트·숄더 프레스 머신이 핀이면 처음 한 번 『양쪽 합·핀』을 누르세요(질문 줄이나 칸 시트의 핀 — 둘 다 같다)」 · 칸 시트 토글로 나중에 바꿔도 이미 완료한 세트는 바뀌지 않는다 |
| 보류 | L-2(배포 시점 진행 중 운동의 머리 「한쪽」 vs 세트 ×1) · L-4(같은 종목 블록 둘의 선택 동기) · L-5(로드 전 「한쪽」 머리 깜빡임) · L-6(메모 없는 블록 도구 줄 +46px · 정보성) · L-7(루틴 편집기 옛 목표 무게가 한쪽으로 해석) · L-8(어시스트 머신에서 V1 한쪽을 켰던 사람 프리필 2배 · 매우 드묾) · L-9(시험 공백 — M-1 경로·옛 null 사례는 이번에 e2e 추가) · L-10(첫 세션 PR 축하 — 사용자 알림) |

검증(조치 뒤): `make verify` 통과(core 494 / 0) · 재빌드(1037250 코드) 관련 e2e 13파일 **71 passed** — feedback-62-64(8)·declutter-block·record-slots·history-replay·finish-routine·session·session-assist·workout·routines·opengym-bodyweight·declutter-summary·offline·unit-toggle(`e2e-qa1.log`). 버전 v0.45.0 그대로(병행 세션이 더 올리지 않음 · 40d6c46 위).
