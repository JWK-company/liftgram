# Feature Spec — 피드백 #62·#63·#64 (블록 도구 꺼내기 · 플레이트 머신 한쪽 기본 · 완료 직후 새 버전 새로고침)

> 생성일: 2026-10-27 · 등급: **Feature**(파일 10+ · core 도메인/저장소 + 프론트 화면 3곳 + e2e · 스키마 변경 없음 · 서버 변경 없음)
> 추적: URS-019·URS-018·URS-023 → **SRS-084**(신규) · 관련 SRS-051(서비스워커)·SRS-058(한쪽 입력)·SRS-069(화면 정리 P1)
> 작업 위치: worktree `../liftgram-wt-fb6264`(브랜치 `feat/feedback-62-64`, cab9bbe 위) · 포트 3200/3201(로컬 운영 빌드 e2e) — 병행 openGym 세션(3300·3400·3500 worktree)과 분리 · 커밋 뒤 main 이 qa code → ff-only 합치기·배포
> QA: `.ouroboros/docs/qa/20261027_feedback-62-64-spec_qa.md`(H-1·M-1~M-4·L-1~L-5 반영)
> 사용자 결정(2026-10-27 · main 전달): 아래 「확정 결정」 표. 질문 없이 진행.

## 작업 의도
1. **#64 [버그]** 운동을 완료하면 「바뀐 루틴 저장」 시트가 떴다가 곧바로 사라지고 홈으로 간다. 루틴에 반영되지 않는다.
2. **#63 [버그]** 플레이트 머신은 원판 한쪽 무게로 적는데 볼륨이 ×2 가 안 된다(운영 오늘 기록의 머신 세트 load_multiplier 전부 null).
3. **#62 [개선]** 메모·휴식 시간·종목 순서 바꾸기가 ⋯ 메뉴 안에 숨어 있다. 밖으로 꺼내되, 난잡함이 돌아오지 않게.

## 확정 결정
| # | 결정 | 근거 |
|---|------|------|
| Q1 | (#64) **운동 화면(`/workout`)에 있는 동안은 새 버전을 자동 적용하지 않는다**(요약·완료 시트 포함). 화면을 떠나면(요약 닫기 → 홈) 그때 적용. 다른 탭이 새 워커를 활성화해 `controllerchange` 가 와도 `/workout` 에서는 새로고침을 **미뤘다가** 떠날 때 한다. 「새 버전」 띠도 `/workout` 에서는 띄우지 않는다 | 셸 상태(`activeWorkoutId`)는 완료 순간 null 이 되어 「운동 중 아님」으로 보인다 — 요약·완료 시트는 셸이 모르는 「결정 중」 상태. 경로는 셸이 확실히 아는 값이라 가장 단순·견고 |
| Q2 | (#63) **플레이트 후보 = 종목 기구 `machine` + family 메타 `load` 축(pin;plate) 있음 + 하중 모드 external**(어시스트·맨몸 기준 머신 제외 — /qa spec H-1). 그리고 **family 메타에 「흔한 적재 방식」 `load_default`(plate\|pin) 열을 추가** — 원판을 거는 머신 19 family(체스트·인클라인·디클라인·라잉 체스트 프레스, 숄더 프레스, 하이·로우·체스트 서포티드 로우, 머신 랫풀다운, 핵·레그 프레스, 펜듈럼·V·벨트 스쿼트, 힙 쓰러스트, 슈러그, 동키·시티드 카프, 레그 프레스 카프)는 plate, 핀 스택이 흔한 27 family(레그 익스텐션·레그 컬·펙 덱·래터럴·어브덕션 등)는 pin. 키 축(ADR-034)은 **변경 없음** — 빈 적재 칸의 기본일 뿐 | 실행 중 재검토: 적재 축이 있는 46 family 를 모두 한쪽 기본으로 보면 레그 익스텐션·펙 덱처럼 핀 머신이 대부분인 종목도 ×2 가 되고 미답 완료가 「한쪽」으로 굳는다. 「이 머신이 플레이트인가」는 헬스장마다 다르지만, 흔한 쪽을 기본으로 두고 칸 시트에서 바꿀 수 있게 한다 |
| Q3 | (#63) 후보 블록의 배수: 적재 칸(비면 `load_default`)이 **pin → 1(null)** · **plate → 한쪽 기본(×2)** · 사용자가 「양쪽 합·핀」으로 답했으면 **명시 1** | 「기본이 한쪽」(사용자). 핀 머신 사용자는 질문에서 「양쪽 합·핀」을 고르면 된다(사용자). 명시 1 은 아래 Q6 환산이 「양쪽 합」을 알기 위해 |
| Q4 | (#63) 질문 = 후보 블록이고 그 종목의 선택(`exercise_user_prefs.plate_one_side`)이 **null(아직 안 정함)** 이면 세트 표 바로 아래 조용한 한 줄 「원판 한쪽 무게로 적나요?  ✓한쪽 · 양쪽 합·핀」. 답하면 종목별로 기억하고(행이 없어도 false 를 쓴다) 다시 묻지 않는다. **답하지 않고 운동을 완료하면 기본(한쪽)을 답으로 기록**(그 종목 완료 세트가 있을 때) → 「한 번만」 | 운동 흐름을 막지 않는다(시트·모달 아님 · 빨강 없음 · 머리 높이 불변). 「처음 하는 종목」 = 선택이 없는 종목(기존 null 기록이 있는 종목 포함 — 이번 사용자가 바로 이 경우) |
| Q5 | (#63) 질문에 답하면 그 블록의 세트 **전부(한 세트 포함) 배수만 바꾸고 숫자는 그대로** — 「적은 숫자의 뜻을 밝힌 것」이라서. 칸 시트의 기존 「한쪽 무게로 입력」 토글은 지금처럼(안 한 세트만 환산 · 한 세트 보존) | 질문 전 기본(×2)으로 적은 세트가 「양쪽 합」 답에도 ×2 로 남으면 거짓 볼륨 |
| Q6 | (#63) 프리필 환산(`carryWeightAcrossMultiplier`): **지난 배수가 null(옛 기록·모름)이면 숫자 그대로**, 명시 1·2 일 때만 환산 | 옛 null 기록은 사람들이 「옵션을 안 누른」 기록 — 이번 사용자처럼 실제로는 한쪽 숫자다. 옛 규칙(null=양쪽)으로 절반 환산하면 40 → 20 으로 틀린 프리필 |
| Q7 | (#63) **합계 무게는 화면에 따로 표시하지 않는다**(기존 「한쪽」 표 머리 글자만). 볼륨·PR·1RM 등 계산 무게(`effectiveWeightKg`)만 정확히 | 사용자 |
| Q8 | (#63) **과거 null 기록은 소급 변경하지 않는다** | 사용자. 보고서에 남겨 main 이 알림(첫 세션의 볼륨·PR 이 옛 기록 대비 2배로 보일 수 있음) |
| Q9 | (#62) 블록 아래 **도구 한 줄**(세트 추가 버튼 아래): `⏱ 휴식 2:00 · ✎ 메모(또는 메모 첫 줄 미리보기) ··· ⌃ ⌄`. 회색 글자·아이콘, 누르는 자리 44px, 빨강 없음. ⋯ 메뉴에는 운동 방법·교체·슈퍼셋·삭제만 | 머리(첫 세트까지 거리 · 화면 정리 측정 ≤170/≤320)를 건드리지 않고 표 아래에 둔다 — 세트를 적는 동안 시선 밖, 필요할 때 바로 아래 |
| Q10 | (#62) 순서 버튼: 단독 블록만(슈퍼셋 안 멤버는 묶음 머리가 옮긴다). 첫 블록 ⌃ · 마지막 블록 ⌄ 는 **흐린 비활성**(자리 유지 — 위치가 흔들리지 않게), 블록이 하나면 둘 다 숨김. 슈퍼셋 묶음 머리의 20×20 위아래도 같은 부품(보이는 크기 작게·누르는 자리 44px)으로 | 원래 문제(22×28 두 개가 위아래로 붙어 잘못 눌림 · /qa code M-5): 좌우로 떨어뜨리고 누르는 자리를 키운다 |
| Q11 | (#62) 메모: 써 둔 메모가 있으면 도구 줄에 첫 줄 미리보기(말줄임), 없으면 「메모」. 누르면 입력칸이 열리고(포커스) 벗어나면 저장 후 미리보기로 접힌다 | 2줄 입력칸이 늘 펼쳐져 있던 것(메모 있는 블록)보다 조용하다 |
| Q12 | testId 유지: `btn-move-up`·`btn-move-down`·`btn-rest-setting`·`btn-note-open` 은 새 자리 버튼에. e2e 에서 메뉴를 열고 누르던 곳은 고친다 | 사용자 |

| Q13 | (/qa code M-1·M-2 뒤) 미정 종목에서 칸 시트로 「핀」·「한쪽」 토글을 바꾸면 **질문 답으로 기록**(핀 = 양쪽 합·핀)하고 숫자 그대로 배수만 바꾼다(`plateChangeMode`). 1RM % 처방의 1RM 추정은 옛 null 기록을 **이번 블록 배수로** 읽는다(`adoptLegacyMultiplier`) — 프리필 규칙과 같다. **고정 kg 처방 = 실제 계산 무게(양쪽 합)** 로 보고 블록 배수로 나눈다(한쪽 블록이면 처방 100 → 입력 50) | 같은 결정을 어디서 하든 결과가 같아야 한다 · 「옛 null 기록 = 예전과 같은 숫자」 하나의 규칙 |

## 설계

### #64 — `core/src/domain/swUpdatePolicy.ts`(신규 순수 함수) + `frontend/app/components/ServiceWorker.tsx`
- `isUpdateHoldPath(pathname)`: `/workout` 또는 `/workout/…` → true.
- `shouldAutoApplyUpdate({ hasWaiting, activeWorkoutId, pathname })`: waiting 있음 && 진행 중 운동 없음 && 보류 경로 아님.
- `controllerChangeAction({ hadController, reloaded, pathname })`: `ignore`(첫 설치·이미 새로고침) · `defer`(보류 경로) · `reload`.
- 화면: `usePathname()` 을 ref 로도 들고 있어 마운트 effect 의 `controllerchange` 처리기가 최신 경로를 본다. `defer` 면 `pendingReload` 상태를 켜고, 경로가 보류 밖으로 바뀌면 그때 한 번 새로고침. 자동 적용 effect 의 deps 에 `pathname` 추가 → 홈으로 가면 다시 판단해 적용(기기 DB 진행 중 운동 확인은 그대로). 띠도 보류 경로에서는 숨김.
- 원본 보존: 기존 판정 줄은 주석 `[원본]`, 새 판정 `[개선]`.
- 다른 원인 점검: `ActiveWorkout` 의 `leaveSession` effect(`repo && !workout && !summary`) — 완료 처리에서 `setSummary`·`setWorkout(null)` 이 같은 비동기 콜백 안이라 React 18 자동 묶음으로 한 그림에 반영 → 요약이 있는 동안 떠나지 않는다(기존 e2e 「완료 → 요약」이 증명). `FinishRoutineSheets`·`WorkoutSummary` 에 이동·새로고침 없음. 새로고침 원천은 `ServiceWorker.tsx` 50행 하나(워커 템플릿은 skipWaiting 을 스스로 하지 않음).

### #63 — core
- `domain/recordSlots.ts`(추가만):
  - `isPlateLoadCandidate(baseEquipment, axesLoad, loadMode)` = `machine && load 축 && loadMode external`(/qa spec H-1) · `plateDefaultLoad(…, loadDefault)` = 후보면 family `load_default`(없으면 plate), 아니면 null.
  - `blockLoadMultiplierV2(dims, choice, defaultLoad)`: 후보 아님 → null · (칸 ?? defaultLoad)=pin → null · choice=false → 1 · 그 밖(true·null) → 2.
  - `needsPlateOneSideQuestion(dims, choice, defaultLoad)` = 후보 && (칸 ?? defaultLoad)=plate && choice==null.
  - `carryWeightAcrossMultiplierV2(w, from, to)`: from==null → w, 아니면 기존 환산.
  - `planBlockMultiplierResyncV2(sets, to)`: 기존과 같되 V2 환산.
  - `planBlockMultiplierRetag(sets, to)`: 배수만(숫자 그대로 · 한 세트 포함) — 질문 답(Q5).
- `data/exercisePrefs.ts`(추가만): `getPlateOneSideChoice`·`getPlateOneSideChoiceMap`(tri-state) · `setPlateOneSideChoice`(false 도 행을 만들어 기록 — markLocalWins).
- `data/catalogMeta.ts`: `plateDefaultLoadMap(exerciseIds)`(기구·family 메타·하중 모드로). `catalog.families.csv` 에 `load_default` 열 + `gen-catalog.mjs`(값 검증) + `CatalogFamily.loadDefault` — 생성물 재생성(`CATALOG_REVISION` 이 바뀌어 기기가 refreshSeedCatalog 를 한 번 돈다 · 멱등).
- `data/workoutRepository.ts`: 배수 결정 4곳(루틴 시작·행 시작(다시 시작·피드)·즉석 추가·`blockMultiplierOf`)을 V2 로(원본 주석 보존), 프리필 환산 `createSets` 를 V2 로, `syncBlockLoadMultiplier` 계획을 V2 로. 새 export: `setPlateOneSideForExerciseV2`(토글 — 선택 기록 후 V2 동기) · `answerPlateOneSide(exerciseId, on)`(Q5 — 선택 기록 후 진행 중 운동 그 종목 블록 세트 배수만 바꿈) · `settleUndecidedPlateOneSide(workoutId)`(Q4 — 완료 세트가 있는 후보 블록의 미정 종목을 한쪽으로 기록).
- 서버: 변경 없음(코칭 보고서·피드가 이미 `load_multiplier`(null=1) 를 곱한다).

### #63 — 화면
- `frontend/lib/usePlateOneSide.ts`(신규 훅): 종목 id → `{ choice, candidate, multiplier(dims), needsAsk(dims), setChoiceLocal }`. `ExerciseBlock`·`RoutineEditor` 가 같이 쓴다.
- `ExerciseBlock`: `oneSide`·PR 채우기 환산을 V2 로. 세트 표 아래 `PlateAskLine`(신규 `session/PlateAskLine.tsx` · testid `plate-ask`·`plate-ask-one`·`plate-ask-both`) — 질문이 필요할 때만. 칸 시트 토글은 `setPlateOneSideForExerciseV2`.
- `RecordSlotSelector`: 토글 노출 = 후보 && (칸 ?? load_default)=plate, 체크 = 실효값(선택≠false). 요약 글자 규칙은 그대로(plate 칸 + 한쪽일 때만 덧붙임 — 빈 칸 머신마다 「한쪽…」을 붙이면 소음).
- `ActiveWorkout`: 완료 직후 `settleUndecidedPlateOneSide`(실패 무시).
- i18n(ko·en): `session.plateAsk`·`session.plateAskOne`·`session.plateAskBoth`.

### #62 — 화면
- `session/BlockTools.tsx`(신규): 도구 한 줄 + `MoveButtons`(보이는 아이콘 18px · 누르는 자리 44×44 · 좌우 4px 틈). testid: 줄 `block-tools`, 버튼은 기존 4종.
- `ExerciseBlock`: ⋯ 메뉴에서 위로/아래로·휴식·메모 항목을 주석 처리(원본 보존), 세트 추가 아래 `BlockTools`. 메모 상태: `noteOpen`=편집 중(처음엔 접힘, 미리보기는 도구 줄), 열면 `autoFocus`, blur 시 저장 후 접기.
- `ActiveWorkout.SupersetContainer`: 위아래를 `MoveButtons`(compact — 머리 줄 높이 유지, 누르는 자리는 의사 요소로 44px).
- i18n: `session.restShort`(「휴식 {time}」) · `session.noteShort`(「메모」).

## 테스트(먼저 쓰고 수정 전 실패 확인)
| 대상 | 종류 | 수정 전 기대 |
|------|------|-------------|
| `swUpdatePolicy` | core 단위(`__tests__/swUpdatePolicy.test.ts`) | 모듈 없음 → 실패 |
| `recordSlots` V2 함수 | core 단위(`__tests__/plateDefault.test.ts`) | 함수 없음 → 실패 |
| 완료 뒤 요약 동안 skip-waiting 안 보냄 · 홈 가면 보냄 | e2e `feedback-62-64.spec.ts`(가짜 waiting 워커 — `navigator.serviceWorker.register`·`controller` 를 init script 로 대체 · 운영 빌드에서만) | 요약 화면에서 skip-waiting 1회 → 실패 |
| 플레이트 머신 기본 한쪽 · 질문 1회 · 「양쪽 합」 답 = 볼륨 ×1·다음에 안 물음 · 미답 완료 = 다음에 안 물음·한쪽 | e2e 같은 파일 | 질문 없음·볼륨 400 → 실패 |
| 도구 줄: 메뉴 없이 위/아래·휴식·메모 · 누르는 자리 44 · 첫/끝 비활성 · 빨강 0 · 메뉴에 네 항목 없음 | e2e 같은 파일 | 메뉴 안에 있음 → 실패 |
| 기존 회귀 | e2e `declutter-block`(머리 화살표 단언·순서 테스트 수정)·`record-slots`(한쪽 기본으로 기대값 수정)·`history-replay`·`finish-routine*`·`session*` | — |

## 리스크
- **R1** 첫 세션의 볼륨·PR: 옛 null 기록(×1) 대비 새 세트(×2)가 2배 → 머신 종목마다 PR 축하가 뜰 수 있다(소급 없음 결정의 대가). 보고서·사용자 알림.
- **R2** 옛 null 기록을 「양쪽 합」으로 적던 사람이 한쪽을 고르면 프리필 숫자가 그대로(80) — 직접 고친다. 질문에서 「양쪽 합·핀」을 고르면 그대로 맞다.
- **R3** 미답으로 세트를 체크한 뒤 운동 중에 「양쪽 합」으로 답하면 Q5 로 다시 맞춰진다. 완료 뒤에 칸 시트에서 끄면 그 운동의 세트는 바뀌지 않는다(기존 규칙 — 한 세트 보존).
- **R4** 커스텀 머신 종목(family 없음)은 후보가 아니다(적재 축이 없다 — 기존과 같음).
- **R5** `/workout` 밖에서 무언가 적는 중(루틴 편집·글쓰기)에도 자동 적용될 수 있다 — 이번 범위 밖(루틴 편집은 바꿀 때마다 저장). 보고서에 남김.
- **R6** 진행 중 운동이 배포 시점에 이미 있으면 그 블록 세트는 옛 배수(null) — 질문에 답하면 Q5 로 맞춰진다.
