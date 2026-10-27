# /qa code — 기록 돌아보기·다시 하기(묶음 2) · 커밋 4b17bf7

> 검토일: 2026-10-27 · 대상: `git show 4b17bf7`(src/) · 스펙: `.ouroboros/docs/spec/20261027_history-replay/spec.md` · 요구: SRS-064·065·066
> 코드는 고치지 않았다. `make verify`를 돌렸다: typecheck 통과, 유닛 273/273 통과, **lint 1건 실패**(L-1).

## 참여 전문가
| 역할 | 전문분야 | 검토 관점 |
|---|---|---|
| 로컬 우선 데이터 설계자 | WatermelonDB·동기·시작 프리레이 | 루틴 시작 리팩터가 같은지, 다시 시작, 총평 저장과 동기 |
| 웹 셸·레이아웃 엔지니어 | CSS sticky·overflow·safe-area·모바일 키보드 | clip 전환, 하단 고정 기준, 다른 화면 회귀 |
| 클라이언트 보안 검토자 | 남의 데이터 신뢰 경계·입력 상한 | 피드 「바로 시작」, 총평 노출 경로 |

## 총평
루틴 시작 리팩터(`startWorkoutFromRoutine` → `startWorkoutFromRows`)는 V1과 줄 단위로 대조했고 **동작이 같다**. 변형 승계, 이전 기록 프리필, 처방·% 채움, 배수, 유산소·맨몸, routine_exercise_id, 슈퍼셋 id를 모두 봤다. 다시 시작의 블록 계획(planReplay)과 요약 화면 상태 전환도 대체로 맞다. 치명 결함은 없다. 고칠 것은 네 가지다. **「폐기하고 새로 시작」이 시작 실패 전에 폐기부터 한다(H-1).** 피드 「바로 시작」이 남의 데이터에 크기 상한을 두지 않는다(M-1). 데스크톱에서 하단 고정 요소가 진행 중 막대와 겹친다(M-2). lint가 실패한다(L-1).

## 결함 목록

### 높음

**H-1. 「폐기하고 새로 시작」: 폐기한 뒤에 시작이 실패하면 진행 중이던 운동만 사라진다**
- 위치: `src/frontend/app/components/useStartGuard.tsx:33-58` (`run`: `discardWorkout` → `start()` 순서)
- 재현: 운동 A를 진행 중이다. 워밍업 세트만 완료된 지난 기록 B의 상세를 연다. 상세 버튼은 `detail.exercises.length > 0`이면 보이므로 B에서도 보인다(`WorkoutDetailClient.tsx:188`). 「이 운동 그대로 다시 시작」 → 「폐기하고 새로 시작」을 누른다. A가 폐기되고, `planReplay`가 빈 목록을 돌려주면서 `NOTHING_TO_REPLAY` 토스트가 뜬다. **새 운동은 없고 A만 사라진다.** 피드 「바로 시작」도 같다. `resolveExercises`가 실패하면(잘못된 페이로드·DB 오류) 똑같이 된다.
- 운동 탭(RoutinesClient)에도 같은 순서가 있다. 다만 그쪽 루틴 시작은 사실상 실패하지 않는다. 다시 시작과 피드 시작은 **실패하도록 설계된 경로**가 있어서 위험이 커졌다.
- 수정안:
  - 시작할 것이 있는지 폐기보다 먼저 확인한다. core에 `planReplayFor(workoutId)`나 `canReplay`를 두고 시트를 띄우기 전에 확인한다. 피드는 종목을 먼저 해석한다.
  - 더 단단한 방법도 있다. core에 `startReplacingActive(activeId, startFn)`를 두고 새 운동을 만든 다음 A를 폐기한다. 한 write 안에서 하거나, 실패하면 폐기하지 않는다.
  - 상세 버튼은 `planReplay` 결과가 있을 때만 보인다. 요약은 이미 `workingSets > 0` 조건이 있다.

### 중간

**M-1. 피드 「바로 시작」이 남의 공유 데이터를 크기 상한 없이 그대로 쓴다**
- 위치: `src/frontend/app/components/feed/WorkoutBox.tsx:99-131,139-148`, `src/core/src/domain/replay.ts:104-120`(`planFromSpec`), 서버 `backend/internal/feed/handler.go:416`(`fromProtoExercises`)도 개수 제한이 없다.
- 재현: 조작한 클라이언트가 종목 300개 × 세트 2,000개짜리 오운완을 올린다. 보는 사람이 「바로 시작」을 누른다. 커스텀 종목 최대 300개(이름 길이도 제한 없음)와 세트 60만 행이 한 write로 만들어진다. 기기가 멈추고 IndexedDB가 부푼다. 이 행들은 동기를 타고 서버로도 올라간다. `planFromSpec`은 `Math.max(1, Math.round(sets))`로 하한만 있고 상한이 없다.
- 커스텀 종목 생성 남발 문제도 있다. 「바로 시작」은 맞는 종목이 없으면 **누르는 순간** 커스텀 종목을 영구로 만든다. 확인 창도 없다. 시작한 뒤 바로 폐기해도 커스텀 종목은 남는다. 같은 글에 모르는 이름이 두 번 나오면 커스텀이 2개 생긴다(루프 안에서 index를 갱신하지 않는다). H-2 매칭 규칙 자체(id → 이름·별칭 정확 → 커스텀)는 가져오기와 같은 함수라 일관된다.
- 수정안:
  - 클라이언트 해석 단계에서 상한을 둔다. 종목 ≤ 30, 세트 ≤ 20(최대값으로 자름), 이름 ≤ 80자, `ex.sets`가 배열인지 확인한다. 서버 `CreatePost`에도 같은 상한을 검증한다.
  - 「바로 시작」에서 맞는 종목이 없는 줄은 건너뛰고 「n개 종목을 찾지 못했어요」로 알리거나, 확인을 받은 뒤 만든다.
  - 해석 루프 안에서 새로 만든 이름을 Map에 넣어 중복 생성을 막는다.

**M-2. 데스크톱(lg)에서 하단 고정 요소가 진행 중 막대 밑으로 약 9px 깔린다**
- 위치: `GlobalWorkoutBar.tsx:41`(`--shell-workout-bar: 60px` 고정), `GlobalWorkoutBar.tsx:57`(막대 위치 `lg:bottom-4`), `CommentsClient.tsx:261`·`ConversationClient.tsx:297`·`RoutineEditor.tsx:375`(`lg:bottom-[var(--shell-workout-bar)]`)
- 계산:
  - 막대 높이 = py 8+8 + h-9(36) + 테두리 1 ≈ 53px.
  - 모바일에서 막대는 57~110px(+safe)에 있고, 고정 요소 아래 끝은 56+60 = 116px이다. 6px 여유가 있어 정상이다.
  - **lg에서 막대는 16~69px에 있는데 고정 요소 아래 끝은 60px이다.** 막대(z-40)가 입력창·「시작」 버튼(z-20)의 아래 9px를 덮는다. 보내기 버튼(items-end)의 아래쪽이 가려진다.
- e2e `sticky-bottom.spec`은 모바일 폭만 잰다.
- 수정안: lg 값을 `lg:bottom-[calc(var(--shell-workout-bar,0px)+16px)]`로 하거나, 막대가 lg에서 쓰는 값(16+53 ≈ 72px)을 따로 알린다. 높이를 상수로 두지 말고 `ResizeObserver`로 실제 높이를 변수에 쓰는 편이 낫다. 글자 크기를 키우거나 두 줄로 줄바꿈되면 60px도 틀린다.

**M-3. 총평이 잠금·앱 전환 때 저장되지 않을 수 있다(의심)**
- 위치: `src/frontend/app/components/session/WorkoutNoteField.tsx:31-38`
- 재현: iOS PWA 요약 화면에서 총평을 몇 글자 적고, 칸을 떠나지 않은 채 전원 버튼으로 잠그거나 앱을 전환한다. iOS는 이때 `pagehide`를 보장하지 않고(`visibilitychange: hidden`만 확실하다), 포커스가 남아 있으면 blur도 오지 않는다. 그 사이 OS가 탭을 정리하면 입력이 사라진다. 스펙 R4는 「헬스장에서 바로 폰을 내려놓아도」 남기를 요구한다.
- 수정안: `document.visibilitychange`(hidden)에서도 `save()`를 부른다. 입력 중 1~2초 디바운스 저장을 더하면 더 안전하다. `save()`는 `saved.current`로 중복을 이미 막으므로 여러 번 불러도 괜찮다.

**M-4. 테스트가 중점 결함을 막지 못한다**
- 루틴 시작 리팩터의 회귀 테스트가 없다. V1과 새 함수가 같은 결과(세트 수·프리필 무게·처방 무게·배수·routine_exercise_id·그룹 id)를 내는지 비교하는 테스트가 없다. 이번 대조에서는 같았지만, 이후 수정을 지켜 줄 장치가 없다. `startWorkoutFromRows`는 DB가 필요하다. 행을 받아 레코드 값 계획을 돌려주는 순수 함수로 일부를 떼어 내거나, 기존 루틴 시작 e2e(처방·슈퍼셋) 통과를 /qa 기록에 남긴다.
- e2e 다시 시작 시나리오에 **슈퍼셋·워밍업이 없다.** 스펙 54행 「순서·세트 수·슈퍼셋」에 어긋난다. 「이어서 하기」 분기와 H-1(실패 시 폐기) 경로도 테스트하지 않는다.
- `sharePayload.test`는 `buildSharedWorkout`의 키만 고정한다. 실제로 서버에 보내는 객체는 `ShareWorkout.tsx:153-160`이 필드를 하나씩 따로 고른다. 그래서 「총평이 새지 않음」은 그쪽 코드 덕분이고, 테스트는 그 경로를 지키지 않는다(지금은 새지 않는다). 전송 객체 생성도 `buildSharedWorkout` 결과를 그대로 쓰게 묶어야 테스트가 의미를 가진다.

### 낮음

**L-1. `make verify`가 lint에서 실패한다**: `src/frontend/e2e/history-replay.spec.ts` 132행, 146행, 174행 근처가 포맷 위반이다. 커밋 메시지에는 「make verify lint 통과」라고 적혀 있다. `bunx biome format --write`가 필요하다.

**L-2. 피드 「바로 시작」은 별칭이 정한 칸을 적용하지 않는다**: `WorkoutBox.tsx:146`은 `axesByIndex`를 버린다. 가져오기에서는 「로프 푸시다운」이 로프 칸으로 들어가지만, 바로 시작에서는 지난 조합을 승계한다. 두 경로의 결과가 다르다. `planFromSpec` 항목에 variant를 넘기도록 확장한다.

**L-3. 지난 루틴 운동을 다시 시작하면, 끝낼 때 루틴을 옛 구성으로 되돌리자는 제안이 나올 수 있다(의심)**: `workoutRepository.ts`의 `startWorkoutFromWorkout`은 원본의 routineId와 아직 남은 routine_exercise_id를 잇는다. 몇 주 전 운동을 다시 하고 끝내면, 루틴 반영(SRS-059)이 지금 루틴과 옛 구성의 차이를 「루틴에도 반영할까요?」로 묻는다. 사람이 고르는 단계라 데이터가 바로 망가지지는 않는다. 그래도 가장 최근 운동이 아닌 원본에서 다시 시작했다면 연결하지 않거나, 제안 문구를 구분하는 것을 검토한다.

**L-4. 연타 가드가 state에만 의존한다(의심)**: `useStartGuard.tsx:34`의 `if (busy)`는 렌더 시점의 값을 읽는다. 지금은 클릭(이산 이벤트)이 동기로 렌더를 내보내고 버튼이 disabled·loading이 되므로 실제로 두 번 들어갈 가능성은 낮다. MoreMenu 항목 경로도 메뉴가 닫히면서 막힌다. 그래도 운동이 2개 진행 중이 되면 복구하기 어렵다. `useRef`로 바쁨 상태를 함께 잡는다.

**L-5. 활성 운동 가드는 기기 메모리의 세션 상태만 본다**: 기록 상세로 바로 들어와 SessionProvider가 활성 운동을 아직 다 읽지 못했을 때 누르면, 가드 없이 두 번째 active가 생길 수 있다. 운동 탭에도 있던 문제다. `startWorkoutFromRows` 시작 부분에서 DB의 `getActiveWorkout()`을 확인하고 `ACTIVE_EXISTS`를 던지면 모든 경로가 막힌다.

**L-6. 여러 기기에서 총평이 덮어써질 수 있다(의심, 기존 구조)**: 서버 동기는 레코드 전체를 바꾼다(`backend/internal/sync/repo.go`의 payload upsert). 기기 A가 총평을 쓰고, 동기 전의 기기 B가 같은 운동의 `pr_count` 등을 고쳐(PR 재계산 SRS-061) 올리면 notes=null이 이긴다. 완료된 운동은 거의 갱신되지 않던 행이었는데, 이제 총평과 PR 재계산으로 갱신이 늘었다. 지금 구조에서 받아들일지 기록해 둔다.

**L-7. 레이아웃 부수 효과(확인 권장)**
- main이 더는 스크롤 상자가 아니어서 `ScreenHeader`·`AppBar`의 `sticky top-0`가 **처음으로 실제로 붙는다.** 의도에 맞는 개선이다. 다만 모든 화면 머리가 스크롤을 따라오는 시각 변화가 생긴다. 그 아래로 스크롤해 누르는 e2e가 가로막힐 수 있고, backdrop-blur 비용도 생긴다. 운영에서 한 번 훑는다.
- `overflow-x: clip`을 지원하지 않는 iOS 15 이하에서는 가로 넘침이 다시 생긴다. 스펙 R6에서 허용한 사항이다.
- 모바일 키보드가 올라오면 댓글·DM 입력창과 키보드 사이에 탭바 56px가 남을 수 있다(Android의 resizes-content일 때). 입력 중에 탭바를 숨기거나 `interactive-widget`을 지정하는 것을 검토한다.

**L-8. 피드 공유 데이터에 슈퍼셋이 실리지 않는다**: `planFromSpec`은 `supersetGroup`을 받지만 `buildSharedWorkout`과 proto에 그 필드가 없다. 그래서 「바로 시작」에서는 묶음이 늘 풀린다. 스펙 D4의 `supersetGroup?`이 사실상 쓰이지 않는다. 문서에 적거나 이후 작업으로 둔다.

## 중점 항목별 판정
| # | 항목 | 판정 |
|---|---|---|
| 1 | 루틴 시작 리팩터 | **같다.** 변형은 `variantExact:false`로 `resolveStartVariant`를 그대로 탄다. 프리필은 `vkey`·`prevSets`·`prevSnap`이 같다. 처방 `rxLoadAt`은 계산식이 같다. 배수는 `multiplierAt`이 같다. 유산소·맨몸 맵이 같다. `targetSets`는 +0이고 `target_sets`가 NOT NULL이라 같다. `count`도 같다. `note`·`cardioTarget`·`prescription`·`routineExerciseId`가 같다. 루틴 그룹 id는 `g:` 접두가 아니어서 그대로 통과한다(루틴 id는 `ss_` 접두). 다시 시작·피드의 그룹은 `randomId('ss_')`로 새로 받아 원본 세션·남의 id와 충돌하지 않는다. |
| 2 | 다시 시작 | 목표·세트 수·워밍업·조합 복사는 맞다. 워밍업 프리필도 맞다(`getPreviousExerciseSets`가 워밍업을 포함해 인덱스가 맞는다). 요약 → 다시 시작은 `setActive(null)`이 완료 때 먼저 돌아 가드에 걸리지 않는다. `onReplayStarted`가 summary·finishPrompt·routineSaved를 비우고 `version`을 올려 잔상이 없다. 같은 주소라 뒤로 가기 기록도 바뀌지 않는다. **H-1** 있음. |
| 3 | 피드 바로 시작 | 매칭 규칙은 가져오기와 같은 함수(H-2)다. **M-1**(상한 없음·커스텀 생성 남발), L-2, L-8 있음. |
| 4 | 총평 | 중복 저장 없음(`saved.current`를 await 전에 갱신). 2,000자 제한은 입력과 core 양쪽에 있다. 렌더는 React 텍스트 노드라 XSS 경로가 없다. 캘린더는 모델의 `notes`를 바로 읽는다. 코칭 리포트는 notes를 쓰지 않는다. 공유 전송 객체는 필드를 하나씩 골라 notes가 없다. **M-3**, L-6 있음. 저장이 실패하면 `saved.current`가 이미 바뀌어 다시 시도하지 않는다(사소). |
| 5 | 레이아웃 | clip으로 가로 넘침을 계속 막는다. 모바일 기준(탭바 56·막대 60·safe-area)은 맞다. **M-2**(lg 겹침), L-7 있음. |
| 6 | 테스트 | 유닛 273개 통과. **M-4**, L-1 있음. |

## 조치 (2026-10-27 · v0.37.0)
| 항목 | 조치 |
|---|---|
| H-1 | **수정** — 「폐기하고 새로 시작」은 바꿀 운동 id(`replacing`)를 넘기고, 저장소가 **새 운동을 만든 같은 batch** 에서 옛 운동을 지운다(`startWorkoutFromRows` · `prepareDiscardRecords`). 시작이 실패하면(시작할 줄 없음·피드 종목 해석 실패·DB 오류) 진행 중 운동은 그대로. 피드는 하나도 못 찾으면 `NOTHING_MATCHED` 로 시작 전에 멈춘다. 기록 상세 버튼은 다시 시작할 워킹 세트가 있을 때만(planReplay 기준). e2e 「워밍업만 한 운동은 다시 시작 버튼이 없다」 추가 |
| M-1 | **수정** — `clampSharedExercises`(종목 40·세트 50·이름 80자·메모 500자·모양 검증) + `planFromSpec` 세트 상한 20 + 서버 `fromProtoExercises` 같은 상한(Go 테스트). 「바로 시작」은 못 찾은 종목을 **건너뛰고 안내**(커스텀 자동 생성 안 함). 「가져오기」는 확인 창 뒤라 커스텀을 만들되 같은 이름은 한 번만 |
| M-2 | **수정** — `--shell-workout-bar` 를 ResizeObserver 로 실측(폰: 탭바 위끝 − 막대 위끝, lg: 화면 아래끝 − 막대 위끝). e2e 1280×560 좌표 검사 — 옛 60px 값으로는 실패(500 > 488.5) 확인 |
| M-3 | **수정** — `visibilitychange(hidden)` 저장 + 입력 멈춤 1.5초 디바운스 저장 + 저장 실패 시 재시도 가능하게 `saved` 되돌림 |
| M-4 | **수정** — 루틴 줄 → 시작할 줄 매핑을 순수 함수 `routineLinesToStartRows` 로 떼어 회귀 테스트 3건(목표·연결·그룹 id·레거시 미러). e2e 「슈퍼셋·워밍업 그대로 · 이어서 하기 유지」 추가. 공유 전송 객체를 `toCreatePostWorkout` 하나로 묶고 그 경로로 총평 미포함 테스트 |
| L-1 | **수정** — biome 포맷(`make verify` 통과) |
| L-2 | **수정** — 피드 「바로 시작」도 맞은 별칭의 함축 칸을 블록에 적용 |
| L-3 | **수정** — 다시 시작은 그 루틴의 **가장 최근 완료 운동**일 때만 루틴에 잇는다(아니면 빠른 운동처럼) |
| L-4 | **수정** — 연타 가드를 ref 로 함께 잡는다 |
| L-5 | **수정** — `startWorkoutFromRows` 가 시작 전 DB 의 진행 중 운동을 확인해 바꿀 운동 외에 있으면 `ACTIVE_EXISTS`(모든 시작 경로) |
| L-6 | **보류** — 동기 payload 전체 교체 구조(기존). 완료 운동 갱신은 총평·PR 재계산뿐이고 두 기기 동시 편집이 드물어 지금은 받아들인다 — 필드 단위 병합은 동기 계층 작업으로 |
| L-7 | **보류** — 상단 sticky 가 실제로 붙는 변화는 의도한 개선(운영 훑어봄·e2e 통과). iOS 15 이하 clip 미지원은 스펙 R6 허용. 키보드 위 탭바 56px 여백은 화면별 입력 중 탭바 숨김이 필요해 별도 작업으로 |
| L-8 | **보류** — 피드 공유에 슈퍼셋을 실으려면 proto·서버 필드 추가가 필요(공유 계약 변경) — 이후 작업 |
