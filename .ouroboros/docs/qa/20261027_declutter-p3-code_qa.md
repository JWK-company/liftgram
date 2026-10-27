# /qa code — 화면 정리 P3 (홈·피드·칸 시트 + 결함) · SRS-071

- 대상: `e6c3dd7` (src/) · 스펙 `.ouroboros/docs/spec/20261027_declutter/spec.md` Phase 3
- 검증: `cd src && make verify` → **통과**(lint·typecheck·unit·core/catalog/docs check). e2e 는 이번 검토에서 실행하지 않음(코드·캡처 판독).
- 캡처 판독: `shots/p3/after/{home-390-light,home-390-dark,feed-390-dark,feed-360x640,sheet-390-light}.png`

## 패널

| 역할 | 전문 분야 | 관점 |
|---|---|---|
| 모바일 UI·접근성 검토자 | 정보 위계·색 의미 규칙·탭 목표·다크 대비 | D7·D8·D9 화면 |
| 상태·데이터 회귀 분석가 | 로컬 DB(LokiJS)·완료 흐름·이름/기록 일관성·쌓임 맥락 | F7·getRecentBrands·F4·홈 진행 상태 |
| 테스트 품질 감사관 | e2e 게이트가 실제로 막는 범위·단위 테스트 빈칸 | 바뀐 e2e 4건 + declutter-p3 |

## 총평

스펙 D7·D8·D9·F1·F2·F6·F7 이 모두 구현되었고 코드 보존 규칙(원본 주석)도 지켰다. `make verify` 는 통과한다. **치명·높음 결함은 없다.**
남은 결함은 중간 5건, 낮음 8건이다. 사용자 눈에 바로 띄는 것은 main 이 짚은 두 가지다. 시간 자리에 「-」·「00:00」이 남는 것과, 빈 루틴 상태에서 빨강 채움 버튼이 여럿인 것이다.
F7 자동 이름은 「완료 시점·기본 이름일 때만」 규칙이 맞게 동작한다. 다만 이름이 복사되는 경로(그대로 다시 시작·피드 바로 시작)에서 낡은 「n종목」이 남을 수 있고, 테스트는 「바꾸지 않아야 할 때」를 지키지 않는다.

---

## 결함

### M1. 소요시간이 0이거나 없으면 홈은 「-」, 피드는 「00:00」을 보인다 — 중간 (main 지적 1)
- 파일:줄
  - `src/frontend/app/components/routines/WeekSummary.tsx:70-72`(`minutes()` → `"-"`)와 `:208`(subtitle 조립)
  - `src/frontend/app/components/feed/WorkoutBox.tsx:28-31`(`duration()`)와 `:289`
- 재현
  1. 빠른 운동을 시작하고 1분 안에 세트 하나를 체크한 뒤 마친다. 소요시간이 0이거나 60초 미만이다.
  2. 홈 「최근 운동」에 `10월 27일 (화) · - · 1000kg` 이 나온다(캡처 home-390-*). 30초 미만이면 `Math.round` 결과가 0이 되어 「0분」으로 나온다.
  3. 피드 카드 메타에는 `1000kg · 00:00 · 2세트` 가 나온다(캡처 feed-*). 라벨 없는 `00:00` 은 시각(자정)으로도 읽힌다.
- 추가 문제: 같은 값을 홈은 「n분」, 피드는 「MM:SS」로 보여 단위가 다르다. 90분 운동은 피드에서 「90:00」이 된다.
- 수정안
  - 공용 포맷 함수를 하나 둔다(예: core `formatWorkoutDuration(sec)`). 60초 미만이거나 null 이면 **그 조각을 아예 빼고**, 나머지는 「n분」, 60분 이상은 「1시간 5분」으로 쓴다.
  - 홈 subtitle 은 배열로 만들고 빈 조각을 걸러 `· `로 잇는다. 피드 MetaLine 도 같은 함수를 쓰고, 값이 없으면 `<span>` 을 렌더하지 않는다.
  - 회귀 단위 테스트를 추가한다: 0, null, 59, 60, 3900.

### M2. 빈 루틴 상태에서 빨강 채움 주 버튼이 경쟁한다 — 중간 (main 지적 2)
- 파일:줄: `src/frontend/app/components/routines/RoutinesClient.tsx:278-285`(btn-quick-start, primary), `:347-350`(EmptyState action `<Button>` primary), `:316-323`(머리 「+ 새 루틴」 brand 글자)
- 재현: 루틴이 0개인 계정으로 홈에 들어간다(캡처 home-390-light/dark). 「빠른 운동 시작」과 「새 루틴 만들기」가 모두 brand 채움이다. 「+ 새 루틴」(머리)과 「새 루틴 만들기」는 같은 행동이다. 진행 중일 때는 하단 막대의 「열기」까지 채움이라 **채움 버튼이 세 개**가 된다.
- 판단: 「빨강 채움 = 화면당 행동 1개」 규칙에 어긋난다. 코드는 P3 이전부터 있었지만, D8 로 진행 카드가 빠지면서 화면 위계가 이 버튼들에 몰렸다. P3 범위에서 정리하는 것이 맞다.
- 수정안: EmptyState action 을 `variant="secondary"`(외곽선)로 바꾸거나 아예 지운다. 머리 「+ 새 루틴」이 이미 같은 행동이므로, 빈 상태는 안내 문구만 두는 쪽을 권장한다. 그리고 `<a><button/></a>` 중첩(대화형 요소 안 대화형 요소)도 함께 없앤다.

### M3. F7 자동 이름이 복사되는 경로에서 낡은 「n종목」이 남는다 — 중간
- 파일:줄
  - `src/core/src/data/workoutRepository.ts:1328`(그대로 다시 시작은 `source.name` 복사)과 `:1339`(startWorkoutFromSpec)
  - `src/frontend/app/components/feed/WorkoutBox.tsx:162`(피드 바로 시작은 `workout.workoutName` 복사)
  - `src/core/src/data/workoutRepository.ts:2273`(기본 이름일 때만 다시 지음)
- 재현
  1. 빠른 운동 「가슴·삼두 · 2종목」을 마친다.
  2. 요약에서 「그대로 다시 시작」을 누르고 종목 두 개를 더하거나 하나를 빼고 마친다. 이름은 여전히 「가슴·삼두 · 2종목」이고 실제는 4종목이다.
  3. 피드 「바로 시작」도 같다. 남의 자동 이름(「등·이두 · 3종목」)을 그대로 받는다. 내 종목에서 못 찾은 종목이 빠지면(`startNowUnmatched`) 시작 순간부터 종목 수가 틀린다.
- 판단: 사용자가 지은 이름이 아닌데도 「사용자가 지은 이름」처럼 보호된다. 자동 이름은 **내용을 요약한 값**이라 내용이 바뀌면 거짓이 된다.
- 수정안(택1)
  - (권장) 워크아웃에 `name_auto: boolean` 같은 표시를 둔다. 자동으로 지었거나 자동 이름을 복사한 경우 true, `renameWorkout` 을 호출하면 false 로 한다. 완료 시 true 면 다시 짓는다. 스키마 변경이 필요하다.
  - (경량) 복사 시작 경로(1328·1339·피드)에서 원본 이름이 `autoWorkoutName` 형식(`/ · \d+종목$/` 또는 `/\d+ exercises?$/`)이면 이름을 기본값 「빠른 운동」으로 시작한다. 그러면 완료 시 다시 지어진다.

### M4. F7 테스트가 「바꾸지 않아야 할 때」를 지키지 않는다 — 중간 (테스트 품질)
- 파일:줄: `src/core/src/domain/__tests__/workoutAutoName.test.ts:44-49`, `src/frontend/e2e/declutter-p3.spec.ts:56-71`
- 빈칸
  - 저장소 수준 분기(`completeWorkout` 의 `!workout.routineId && isDefaultWorkoutName && autoNameInput.length`)는 테스트가 없다. 다음 세 경우 모두 빠져 있다: 루틴 운동, 사용자 rename, 세트 0개로 완료.
  - e2e 는 「붙는다」만 본다. 운동 중 이름을 「하체 데이」로 바꾸고 마쳤을 때 그 이름이 유지되는지를 보는 음성 케이스가 없다. 회귀가 나도 게이트가 막지 못한다.
  - `isDefaultWorkoutName('Quick workout')` 도 검사하지 않는다.
  - 피드·기록 상세·캘린더가 같은 이름을 쓰는지(완료 뒤 공유 → `detail.workout.name`)도 e2e 가 확인하지 않는다. 코드상으로는 완료 후 DB 를 읽으므로 일관된다.
- 수정안: `declutter-p3` F7 에 음성 케이스 하나를 추가한다(이름 연필 → 「하체 데이」 → 마침 → recent-workouts 에 「하체 데이」). 단위 테스트에 'Quick workout' 단언도 추가한다. 가능하면 completeWorkout 통합 테스트(루틴 운동이면 이름 불변)를 하나 둔다.

### M5. 진행 중 운동이 있을 때 홈 주 행동이 여전히 「빠른 운동 시작」이다 — 중간 (UI·상태)
- 파일:줄: `src/frontend/app/components/routines/RoutinesClient.tsx:278-285`, `:556-567`(진행 카드 주석), `:288-298`(TodayCard·RecoCard 는 진행 중이면 숨김)
- 재현: 운동을 시작한 뒤 ⌄ 로 내려 홈에 온다(캡처 home-390-*). 화면 위쪽의 유일한 채움 버튼이 「빠른 운동 시작」이다. 누르면 「이어서/버리고 시작」 시트(`active-exists`)가 뜨고, 「버리고 시작」은 파괴 행동이다. 진행 중이라는 사실은 화면 맨 아래 막대에만 있다.
- 판단: 하단 막대는 `/workout` 을 뺀 모든 경로에서 보이므로(`GlobalWorkoutBar.tsx:100`) 진행 운동에 **접근할 수는 있다**. 접근성 결함은 아니다. 다만 위계상 주 행동이 진행 상태와 맞지 않는다.
- 수정안: `activeWorkoutId` 가 있으면 btn-quick-start 를 `variant="secondary"` 로 낮추거나, 제목을 「이어서 하기」로 바꿔 `/workout` 으로 보낸다(testId 는 유지하거나 새로 둔다). D8 의 「막대 하나」 결정과 충돌하지 않는다.

---

### L1. `confirmDiscard` 고아 상태와 도달 불가 확인창 — 낮음
- 파일:줄: `src/frontend/app/components/routines/RoutinesClient.tsx:83`(state), `:540-556`(ConfirmDialog `confirm-discard-active`)
- 내용: 열어 주던 ⋯ 메뉴가 주석 처리되어 `setConfirmDiscard(true)` 호출이 없다. 확인창은 렌더 트리에 남아 있지만 영원히 열리지 않는다. 보존 규칙은 「호출부는 주석」인데 여기서는 **살아 있는 죽은 코드**다. `refreshActive` 도 이 확인창에서만 쓰인다.
- 수정안: ConfirmDialog 블록도 진행 카드와 함께 주석 처리하고 `[원본]` 표시를 단다. 또는 `/reflect` 에서 일괄 제거한다.

### L2. F7 이름이 언어 설정과 무관하게 한국어다 — 낮음
- 파일:줄: `src/core/src/data/workoutRepository.ts:2283`(`autoWorkoutName` 호출에 lang 을 넘기지 않음), `src/core/src/domain/workoutAutoName.ts:23`
- 재현: 앱 언어를 English 로 두고 빠른 운동을 마치면 「가슴·삼두 · 2종목」이 나온다.
- 판단: 기본 이름 「빠른 운동」 자체가 한국어로 박혀 있고(`:1360`), `suggestNameForWorkout` 도 같은 관행이다. 새 퇴행은 아니다. 다만 en 분기(`N exercises`)를 만들어 놓고 쓰지 않는다.
- 수정안: `completeWorkout(id, opts?: { lang })` 로 받아 넘긴다. 또는 사용자 설정 언어를 저장소에서 읽는다.

### L3. 자동 이름의 「종목 수」가 블록 수다 — 낮음
- 파일:줄: `src/core/src/data/workoutRepository.ts:2233`, `src/core/src/domain/workoutAutoName.ts:24-25,36`
- 재현: 같은 종목을 블록 두 개로 하면(슈퍼셋 중복 인스턴스 등) 「1종목」이 아니라 「2종목」이 된다.
- 수정안: `done` 을 exerciseId 기준으로 dedupe 하여 센다. 입력에 exerciseId 를 추가한다.

### L4. 자동 이름 규칙이 `suggestRoutineName` 과 중복·불일치 — 낮음
- 파일:줄: `src/core/src/domain/workoutAutoName.ts:23-38` 대 `src/core/src/domain/routineDiff.ts:402-423`
- 내용: 스펙(79행)은 `suggestRoutineName` 규칙을 쓰라고 했는데, 구현은 거의 같은 상위 2 부위 계산을 새로 만들었다. 같은 운동이라도 루틴 저장 제안은 「10/27 가슴·삼두」, 운동 이름은 「가슴·삼두 · 2종목」이 된다. 세트를 세는 기준도 다르다(doneSets 대 워킹 세트).
- 수정안: 상위 부위 계산을 `topMuscles(blocks, lang)` 하나로 뽑아 두 곳이 공유한다.

### L5. 사용자가 일부러 「빠른 운동」이라고 지은 이름은 덮인다 — 낮음 (수용 가능)
- 파일:줄: `src/core/src/domain/workoutAutoName.ts:10-15`
- 내용: 기본값과 값이 같으면 구분할 수 없다. M3 의 `name_auto` 표시를 도입하면 함께 해결된다. 그전까지는 스펙 L1~L3(「새 완료분부터」)에 이 동작을 적어 둔다.
- 동기화: 진행 중 운동은 다른 기기로 건너가지 않고(sync.spec), 이름은 완료 write 한 번에 들어간 뒤 `scheduleSync()` 로 올라간다. 충돌 경로는 찾지 못했다.

### L6. 피드 버튼을 `!important` 로 덮어 쓴다 — 낮음 (UI)
- 파일:줄: `src/frontend/app/components/feed/WorkoutBox.tsx:344-363`
- 내용
  - Button 은 인라인 `style` 로 `borderWidth:0`·`backgroundColor` 를 준다. `border!`·`bg-(--color-card)!` 가 이 인라인 값을 이기는 것은 동작상 맞다. 다만 Button 의 계약을 우회한다. 다른 곳에서 secondary 가 surface-alt 위에 놓이면 같은 핵이 반복된다.
  - 다크 캡처(feed-390-dark)에서 「루틴 가져오기」는 card(#2a2a2a 계열) 바탕에 line 테두리라 버튼으로 읽힌다. 「바로 시작」은 coral 위 어두운 글자로 대비가 충분하다. **대비 결함은 없다.**
  - 높이는 36px(sm)로 44px 권장보다 낮다. 그래도 예전 글자 링크(약 24px)보다는 개선이다.
  - `whitespace-nowrap`+`min-w-0` 에 overflow 처리가 없다. 글자 크기를 키우거나 en 긴 문구일 때 글자가 버튼 밖으로 삐져나올 수 있다(의심 — 현재 en 「Import routine」은 약 148px 칸에 들어간다).
- 수정안: Button 에 `variant="outline"`(card 바탕+line 테두리)을 정식으로 추가하고 `!` 를 없앤다. 글자에는 `truncate` 를 준다.

### L7. 칸 시트 「최근」 줄에 이름표가 없고 작은 칩 글자가 작다 — 낮음 (UI·접근성)
- 파일:줄: `src/frontend/app/components/ui/RecordSlotSelector.tsx:326-360`, `src/frontend/app/components/ui/quiet.tsx:121-125`
- 내용: 캡처 sheet-390-light 에서 테크노짐만 위 줄에 따로 있다. 왜 따로 있는지(최근에 썼다는 것)를 알리는 표시가 없다. compact 칩은 text-xs·ink2·surface-alt 바탕(테두리 없음)이라 흰 시트 위에서 존재감이 약하다. 높이 32px 는 유지했다.
- testId: 위 줄에 오른 키는 `rest` 에서 제외되므로 `slot-brand-<키>` 는 **늘 유일**하다. 현재 선택이 rest 에 있어도 active 테두리로 보이고, 이름 없는 커스텀도 선택 중이면 보인다(`k === value`). 문제없다.
- 수정안: 위 줄 앞에 작은 「최근」 캡션을 달거나 `aria-label`/`title` 로 알린다. 다크 모드에서 compact 칩 글자 대비를 한 번 확인한다(다크 시트 캡처 미판독 — 의심).

### L8. 검색 결과 동점 정렬은 여전히 라틴 문자가 먼저다 — 낮음
- 파일:줄: `src/core/src/domain/exerciseSearch.ts:200`(비어 있지 않은 질의의 마지막 tie-break 는 `localeCompare(…, 'ko')`), `:227-231`(compareKoFirst)
- 내용: 빈 질의(종목 탭 첫 화면)는 compareKoFirst 로 고쳐졌다. 질의 「컬」처럼 tier·kind·equipRank·길이가 모두 같은 동점에서는 「EZ바 컬」이 한글 이름보다 앞설 수 있다(의심 — 보통 equipRank·길이에서 갈린다). 관련도 순위와 충돌하지는 않는다(마지막 tie-break 에만 해당).
- 숫자 접두(「3/4 스쿼트」)는 영문과 같은 무리로 한글 뒤에 간다. 단위 테스트가 이를 고정한다. 의도에 맞다.
- CatalogClient 는 `nameKo` 로 정렬하고 `exerciseListName(item)` 을 lang 없이 호출해(ko) 표시와 정렬 기준이 같다. en 표시로 바꾸면 어긋난다.
- 수정안: 마지막 tie-break 도 `compareKoFirst(a.entry.ex.nameKo, b.entry.ex.nameKo)` 로 통일한다.

---

## 중점 점검 결과(결함 아님 · 확인 완료)

| 항목 | 결론 |
|---|---|
| F7 바뀌는 시점 | `completeWorkout` 의 같은 write 안에서만 바뀐다(`:2301`). 루틴 운동·사용자 rename 은 제외한다. 요약 화면은 이름을 표시하지 않는다. 공유는 완료 뒤 `detail.workout.name` 을 읽으므로 피드·기록·캘린더 이름이 일관된다. |
| getRecentBrands 비용 | `performedInstancesOf` 쿼리 3개로, 대상은 **그 종목** 블록·완료 운동·세트에 한정된다. 완료 운동 전체를 읽지 않는다. 시트를 열 때마다 1회 실행되고 캐시는 없지만 수용 가능하다. 실패하면 `[]` 로 넘어간다. |
| 최근 브랜드 순서 | completedAt 최신순·중복 제거·상한 3. 허용 목록 밖(기구 키) 값은 건너뛴다. 단위 테스트가 있다. 운동 중 지금 고른 브랜드는 위 줄로 올라가지 않는다(이력 기준이라 위치가 흔들리지 않음 — 바람직). |
| F4 미재현 판단 | **타당하다.** RestBar 는 `main` 안의 sticky z-40 이다. `main`·셸 div 는 transform·z·isolation 이 없어 쌓임 맥락을 만들지 않는다. 시트는 `#modal-root`(body 끝) 아래 fixed z-50 이다. 따라서 스크림이 위에 있다. 스크림이 `bg-black/50` 으로 반투명이라 coral 막대가 비쳐 보이는데, 이것이 「위로 뜬다」로 관찰되었을 가능성이 크다. Dialog·VariantSelector 도 같은 z-50·black/50 구성이다. e2e 의 `elementFromPoint` 가드도 유효하다(시트 본문이 막대 좌표를 덮지 않는 390×844 기준). 필요하면 시트가 열린 동안 스크림을 `/60` 으로 올리거나 RestBar 에 `inert`/투명도를 준다(선택). |
| 진행 카드 제거 후 접근성 | GlobalWorkoutBar 는 `activeWorkoutId && !pathname.startsWith("/workout")` 이면 늘 보인다(홈 포함, lg 폭 포함). 막대가 숨는 유일한 경로는 운동 화면 자체다. **진행 운동에 접근하지 못하는 경로는 없다.** |
| F2 여백 | `pb-[96px]` 와 FAB bottom `76px+bar+safe-area` 를 계산하면 탭바 위 약 75px 를 차지한다. 막대는 흐름 spacer 가 받는다. e2e 는 좋아요 줄의 바닥이 FAB 위에 있는지까지 검사한다. 통과 조건이 타당하다. |
| 바뀐 e2e 범위 | routines·unit-toggle: `resume-card` 검사를 `global-workout-bar` 보임/없음으로 바꿨다. 등가이고, routines 는 `resume-card` 0개 단언까지 더했다. sync: `btn-resume` 0개를 `btn-quick-start` 준비 대기 + `global-workout-bar` 0개로 바꿨다. 대기가 생겨 오히려 경쟁(race)이 줄었다. profile-edit: 「PR 갱신 2회」(자동 문구 본문에 의존하던 단언)를 메타 「PR 2」로 바꿨다. 「루틴 보기」 글자 클릭은 testId 클릭으로 바꿨다. **검증 범위는 줄지 않았다.** 제거된 testId(`btn-active-menu`·`btn-discard-active`·`confirm-discard-active`)를 쓰던 e2e 도 없다. |
| 자동 문구 제거 | 빈 한마디는 빈 caption 으로 전송한다. D7 e2e 가 한마디 없이 공유한 뒤 피드에 「운동 완료」가 0건인지 확인한다. 서버가 빈 본문을 받아들이는 것도 간접 검증된다. 기존 글은 손대지 않았다. |

## 권장 처리 순서
1. M1(시간 표시)·M2(빨강 채움 정리)·M5(진행 중 주 행동): 화면에 바로 드러나며 파일 3개 이내의 패치다.
2. M4(F7 음성 e2e·단위 단언 추가) → M3(복사 경로 이름 초기화, 경량안).
3. L1·L6·L8 은 /reflect 정리 때, L2·L3·L4 는 F7 후속으로 묶는다.

---

## 조치 (2026-10-27 · v0.41.0)

| 항목 | 조치 | 내용 |
|---|---|---|
| M1 | 수정 | core `workoutDurationParts` + 프론트 `formatWorkoutDuration` 하나로 통일(「n분」·「n시간 m분」). 1분 미만·없음이면 칸 생략 — 홈 최근 운동·피드 메타·기록 목록·캘린더·요약 KPI·기록 상세 KPI. 단위 테스트 `workoutDuration.test.ts`, e2e 「F7 음성」 이 요약 시간 칸 0개·홈 「· - ·」 없음 확인 |
| M2 | 수정 | 빈 루틴 상태의 「새 루틴 만들기」 버튼 제거(안내 문구가 머리 「+ 새 루틴」을 가리킴) — `<a><button/>` 중첩도 함께 사라짐 |
| M5 | 수정 | 진행 중이면 홈 「빠른 운동 시작」을 secondary 로 — 주 행동은 하단 막대 「열기」 |
| M3 | 수정(경량안) | `inheritedWorkoutName` — 그대로 다시 시작(빠른 운동)·피드 바로 시작은 자동/기본 이름을 복사하지 않고 「빠른 운동」으로 시작해 완료 때 다시 짓는다. 루틴 운동 다시 시작은 루틴 이름 유지 |
| M4 | 수정 | 단위: `Quick workout` 기본 판정 · `isAutoWorkoutName` · `inheritedWorkoutName` · 종목 수 dedupe. e2e: 사용자 이름 「하체 데이」 유지 · 다시 시작 후 종목 추가 → 「가슴·삼두 · 2종목」 재작명. 루틴 운동 불변 통합 테스트는 보류(DB 없는 core 테스트 구조 — 저장소 분기 `!workout.routineId` 는 기존 e2e routines 가 루틴 이름 표시로 간접 확인) |
| L1 | 수정 | 고아 확인창·`confirmDiscard` 상태·`refreshActive` 구조분해를 `[원본]` 주석으로 |
| L2 | 보류 | 기본 이름 「빠른 운동」 부터 한국어 고정 — 언어 설정을 저장소가 아는 길이 생길 때 함께 |
| L3 | 수정 | 자동 이름 종목 수를 exerciseId 기준으로 센다 |
| L4 | 보류 | `suggestRoutineName` 과 상위 부위 계산 공유 — 동작 차이 없음, /reflect 정리 때 |
| L5 | 보류(수용) | 일부러 「빠른 운동」 이라 지은 이름은 덮인다 — `name_auto` 스키마 도입 시 해결 |
| L6 | 보류 | Button `outline` 변형 정식 추가 — 공용 컴포넌트 계약 변경이라 P4 점검 때 |
| L7 | 수정 | 칸 시트 브랜드 이름표에 「· 윗줄은 최근 쓴 것」 |
| L8 | 수정 | 검색 동점 마지막 tie-break 를 `compareKoFirst` 로 |

검증: `make verify` 통과(core 310) · 새 DB 로컬 운영 빌드 e2e 91건 통과(declutter-p3 8 · routines·history-replay·feed·workout·declutter-summary·record-slots·catalog·sync·unit-toggle·profile-edit·session·schedule·finish-routine·declutter-block). 새 e2e 의 「수정 전 실패」 는 별도 실행하지 않았다(M3 다시 시작 케이스는 옛 코드에서 이름이 「가슴 · 1종목」 으로 남아 실패하는 구조).
