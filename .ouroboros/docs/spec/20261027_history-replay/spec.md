# Feature Spec — 기록 돌아보기·다시 하기: 세트 조합 표시·총평·그대로 다시 시작·피드 바로 시작·하단 고정 요소 수정

> 생성일: 2026-10-27 · 등급: **Feature** (core 저장소 + 프론트 기록 상세·요약·캘린더·피드·앱 셸 레이아웃 · 로컬 스키마 변경 없음)
> 추적: SRS-064 · SRS-065 · SRS-066 (URS-021) · 피드백 #52 · #59 · #45 · #43 · 출시 **v0.37.0**
> 확정 결정(2026-10-27 사용자): 52 A · 59(설명대로) · 45/43(직접 점검 → 재현됨)

## 작업 의도
지난 운동을 실제로 한 그대로 보고, 총평을 남기고, 같은 구성(또는 피드의 남의 운동)으로 바로 다시 시작한다. 운동 중 휴식 막대가 화면 밖으로 밀리던 문제를 고친다.

## 확정 결정
| # | 결정 |
|---|------|
| D1 | 총평 = 운동 1개당 1개, **요약에서 입력 · 기록 상세에서 쓰기/고치기(52 A)** · 캘린더 날짜 상세에 표시 · 나만 봄 · 피드 글과 별개 |
| D2 | 기록 상세에 세트 조합(브랜드·핀/플레이트·부착물·그립·원암·한쪽 입력). **목록 요약 카드는 그대로**(루틴 이름·PR 수·시간·볼륨) |
| D3 | 「이 운동 그대로 다시 시작」 = 종목·순서·세트 수·슈퍼셋·조합, 무게는 이전 기록(기록 상세·요약) |
| D4 | 피드 남의 운동: 「내 루틴으로 가져오기」(있음) + 「바로 시작」. 매칭은 가져오기 규칙(id → 이름·별칭 정확 → 커스텀) |
| D5 | 하단 고정 요소: 앱 셸 `main` 의 `overflow-x-hidden` → `overflow-x-clip`, 안전 영역 여백 |

## #45·#43 운영 점검 결과 (2026-10-27, chrome-devtools · liftgram.tarae.org v0.35.0)
| 폭×높이 | 화면 | 결과 |
|---|---|---|
| 360×560 | 운동(종목 1·휴식 중) | 휴식 막대 bottom 571 > 화면 560 → **아래 잘림** · `shots/rest-bar-360x560.png` |
| 390×844 | 운동(종목 4·휴식 중) | 휴식 막대 top 1566 > 화면 844 → **화면 밖(맨 끝)으로 밀림** · `shots/rest-bar-hidden-390x844.png` |
| 360×560 | 기록 탭 | 탭바·진행 중 막대 정상(셸 바깥이라 영향 없음) |
- **원인**: `src/frontend/app/layout.tsx:79` `<main className="… overflow-x-hidden">` — overflow-x:hidden 은 overflow-y 를 auto 로 바꿔 main 을 스크롤 컨테이너로 만든다. main 은 실제로 스크롤하지 않으므로 그 안의 `sticky bottom-*` 는 화면이 아니라 main 상자 끝에 붙는다.
- **같은 원인 영향 범위**(sticky bottom, main 안): `session/RestBar.tsx:19` · `routines/RoutineEditor.tsx:375`(루틴 편집 하단 버튼 = #43 「푸터」 후보) · `session/WorkoutSummary.tsx:201` · `feed/CommentsClient.tsx:261` · `dm/ConversationClient.tsx:297`. 탭바(`ui/TabBar.tsx`)는 main 바깥이라 정상.

## 설계

### 하단 고정 요소 (SRS-066)
- `layout.tsx` main: `overflow-x-hidden` → `overflow-x-clip`(가로 넘침은 계속 막고 스크롤 컨테이너는 만들지 않음). [원본] 클래스 주석 보존.
- `RestBar`: `bottom-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))]`. 운동 화면 내용 끝에 휴식 막대 높이(≈64px) 여백 — 막대가 마지막 「운동 추가」를 가리지 않게.
- 다른 sticky 하단 4곳에 안전 영역 여백 점검.
- 전역 영향 확인: main 안에서 가로로 넘치는 요소(칩 줄·표)가 clip 으로 잘리는지(hidden 과 같음) · iOS Safari 16+ / 삼성 인터넷 clip 지원(2022+ 지원).

### 세트 조합 표시 (SRS-065)
- `analyticsRepository.getWorkoutDetail` 이미 `variantKey`·세트 `arm`·`loadMultiplier` 를 준다 → 프론트 `WorkoutDetailClient` 종목 머리에 `variantLabelFromKey`(P4 의 라벨 함수) 조합 라벨, 세트 줄에 원암·「한쪽 40kg ×2」. 표시 이름은 `useExerciseName`.

### 총평 (SRS-064)
- 저장: `workouts.notes`(스키마 v1 부터 있음 · 동기 컬럼 · 현재 화면 미사용) 재사용 — 다른 쓰임 없음 확인(`git grep "\.notes"` → 루틴·프로그램만). 새 저장소 함수 `setWorkoutNote(workoutId, text)` (2,000자 자르기·공백만이면 null).
- 요약 화면(`WorkoutSummary`) 하단에 입력란(자동 저장 — blur·닫기 때) · 기록 상세에 같은 입력란.
- 캘린더(`CalendarClient`) 날짜 상세의 운동 줄 아래 총평 두 줄 미리보기 → 탭하면 기록 상세. 기존 날짜 메모(`calendarNotes`)와 별개.
- 공유 경로(피드 오운완·공유 데이터 생성)에 notes 를 싣지 않음 — 공유 페이로드 생성 코드에 notes 가 안 들어가는지 테스트.

### 그대로 다시 시작 (SRS-065)
- core `startWorkoutFromWorkout(sourceWorkoutId)` 신규: `startWorkoutFromRoutine` 과 같은 프리레이 규칙(이전 기록·지난 조합)을 쓰되 원본 블록의 `exerciseId·sortOrder·supersetGroup(새 id 로 재매핑)·variant 컬럼` 과 **완료한 워킹 세트 수**(워밍업 세트는 원본 수만큼 워밍업으로)로 만든다. 새 운동의 `routineId` = 원본 운동의 routineId(루틴이 남아 있으면 — 완료 시 루틴 반영 흐름이 그대로 작동), 이름 = 원본 이름. 공통 프리레이 코드를 내부 함수로 추출(복붙 금지).
- 진입: 기록 상세 ⋯ / 요약 버튼 「그대로 다시 시작」 → 진행 중 운동 가드(기존 `guardActive` 와 같은 「이어 하기 / 버리고 시작」).

### 피드 바로 시작 (SRS-065)
- `WorkoutBox`: 「바로 시작」 버튼. 가져오기의 종목 해석 부분(id → 이름·별칭 → 커스텀)을 함수로 추출해 공유 → `startWorkoutFromSpec(name, exercises[{exerciseId, sets, supersetGroup?}])`(core 신규 — 위 공통 프리레이 사용, routineId=null). 루틴을 만들지 않는다.

## 테스트
- 단위: `startWorkoutFromWorkout` 의 블록 계획(순수 함수 `planReplay(source)` — 세트 수·워밍업·슈퍼셋 재매핑·조합) · 공유 페이로드에 notes 없음 · 총평 자르기.
- e2e: 360×560·390×844(종목 4) 휴식 막대 좌표가 화면 안 · 루틴 편집 하단 버튼 좌표 · 기록 상세 조합 라벨 · 총평 요약 입력 → 상세 → 캘린더 · 그대로 다시 시작(순서·세트 수·슈퍼셋) · 피드 바로 시작(가능하면 — 피드 데이터 생성 e2e 헬퍼 사용).

## Phase (한 번에 출시 v0.37.0)
1. 레이아웃 수정(SRS-066) + 좌표 e2e(먼저 실패 확인)
2. 저장소(setWorkoutNote·planReplay·startWorkoutFromWorkout·startWorkoutFromSpec·공통 프리레이 추출)
3. 화면(기록 상세 조합·총평·다시 시작 · 요약 · 캘린더 · 피드)
4. e2e · make verify · /qa code · 배포 · PLM #52·#59·#45·#43 완료

## 리스크
| 리스크 | 대응 |
|---|---|
| overflow 변경이 다른 화면 가로 넘침을 드러냄 | clip 은 hidden 과 같이 잘라 냄 · 주요 화면 390px 스크린샷 대조 |
| 프리레이 공통화가 기존 루틴 시작을 깨뜨림 | 추출 전후 기존 e2e(routines·session·record-slots) 그대로 통과 |
| 총평이 공유에 새어 나감 | 공유 페이로드 테스트 |

## /qa spec 반영 (2026-10-27 — 조건부 통과 → 아래가 위 설계보다 우선)
근거: `.ouroboros/docs/qa/20261027_history-replay-spec_qa.md`

| QA | 바뀐 결정 | 적용 |
|---|---|---|
| R1 | 하단 고정 좌표 e2e(스크롤 위·아래, 360×560·390×844 종목 4)를 **수정 전 실패 확인** 후 고정 | Phase 1 |
| R2 | 진행 중 운동 가드(`guardActive`)를 공용으로 추출(`lib/startGuard.ts` 또는 SessionProvider 훅) — 운동 탭·기록 상세·요약·피드 공유 | 다시 시작·피드 |
| R3 | 다시 시작 블록은 원본 블록의 `targetRepsMin/Max·restSeconds·prescription` 을 복사, 무게는 이전 기록 | startWorkoutFromWorkout |
| R4 | 총평 입력은 완료 시트가 닫힌 뒤 요약 본문에 · 자동 저장(blur·닫기·떠남) | 총평 |
| R5 | 공유 페이로드 키 목록 고정 테스트(notes 미포함) | 테스트 |
| R6 | `overflow-x: clip` 미지원 옛 브라우저는 허용(메모) | 레이아웃 |
