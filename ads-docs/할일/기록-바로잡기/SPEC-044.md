# SPEC-044 — 잘못 적은 기록 바로잡기 — 「확인 필요」 판정·계산 제외·기록 상세 고치기

> 타입 Spec · 그룹 할일/기록-바로잡기 · ADStudio가 `SPEC-044.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → SRS-109

### 목표

SRS-109 — 튀는 세트를 앱이 먼저 찾아 「확인 필요」로 두고(확인 전까지 PR·1RM·세트 방식·다음 무게 계산에서 뺀다), 「lb였어요 / 맞아요」로 바로잡게 한다. 지난 기록 상세에서 종목 단위로 단위·종목·세트를 고치고, 고치면 볼륨·PR 수를 다시 센다. 완료 운동을 지울 때 PR 수 재계산이 빠진 것도 고친다.

등급 Project — 로컬 스키마(v28)·저장소·도메인·화면 4곳(운동 중·완료 요약·기록 상세·종목 상세)을 함께 바꾼다.

### 범위

- `src/core/src/db/schema.ts` · `src/core/src/db/migrations.ts` · `src/core/src/db/models/SetLog.ts` — v28 `set_logs.check_state`(optional string)
- `src/core/src/domain/suspectSet.ts`(새) — 판정 순수 함수 · `src/core/src/domain/__tests__/suspectSet.test.ts`(새)
- `src/core/src/domain/types.ts` — `LoggedSet.suspect`
- `src/core/src/domain/oneRepMax.ts` · `src/core/src/domain/personalRecords.ts` — 확인 필요 세트 제외
- `src/core/src/data/workoutRepository.ts` — `toLoggedSet`, 판정·확인·단위 바꾸기 함수, 재계산 일반화, `discardWorkout`, `completeWorkout`, `getPreviousLineWorkSets`
- `src/core/src/data/analyticsRepository.ts` — `getCompletedSets`·`getWorkoutDetail` 에 표시·제외
- `src/backend/internal/sync/merge_v28_test.go`(새) — 옛 기기가 올려도 칸이 남는다
- `src/frontend/app/components/session/SuspectSetSheet.tsx`(새) — 확인 시트 공용
- `src/frontend/app/components/session/SetRowEdit.tsx` · `src/frontend/app/components/session/ExerciseBlock.tsx` — 운동 중 표시·판정
- `src/frontend/app/components/session/WorkoutSummary.tsx` — 완료 요약 카드
- `src/frontend/app/components/analytics/WorkoutDetailClient.tsx` — 표시 · 종목 ⋯(단위·종목·세트 추가) · ✎
- `src/frontend/app/components/analytics/ExerciseProgress.tsx` — 종목 상세 「확인 필요한 기록」
- `src/frontend/lib/i18n` 사전(ko·en) · `src/frontend/e2e/record-fix.spec.ts`(새)

### 설계

#### 저장(v28)

`set_logs.check_state`: `null`(보통) · `'suspect'`(확인 필요) · `'confirmed:<무게>x<횟수>x<배수>'`(사람이 「제대로 적었어요」 — **그때의 값 지문**과 함께 · REV-079 D-3). 지문이 지금 값과 다르면(어느 경로로든 값이 바뀌면) 확인함이 아니라 다시 판정한다. `suspect` 는 판정 결과를 적어 둔 것이라 지난 기록이 바뀌면 다시 만든다(재계산 훑기 · REV-079 D-2). v28 배포 뒤 SCHEMA_VERSION<28 번들을 내면 LokiJS 가 DB 를 지운다 — 되돌리기 금지. 서버 동기는 jsonb 얕은 병합이라 바꿀 것이 없다(v27 `value_source` 와 같다) — 옛 기기가 올린 레코드에 키가 없으면 칸이 남는다.

#### 판정(도메인 `judgeSuspectSet`)

- 입력: 후보 세트(LoggedSet), 지난 기록(지난 완료 운동 최대 6회의 작업 세트 · 확인 필요 제외), 지난 운동 수.
- 판정 안 함: 지난 운동 2회 미만 · 후보가 웜업·실패·무게 0·횟수 0 · 하중 모드가 맨몸·어시스트.
- 기준 = max(최근 6회 최고 추정 1RM, 그 칸의 전체 기간 최고) — 디로드·부상 복귀 오탐을 줄인다(REV-079 C-6). 같은 운동에서 앞서 「제대로 적었어요」한 세트도 기준에 넣는다(연속 오탐 방지). 옛 배수 null 기록은 지금 블록 배수로 맞춰 읽는다(`adoptLegacyMultiplier` · REV-079 C-1).
- 확인 필요: 후보 추정 1RM > 기준 × 1.3(정확히 1.3배는 아니다 · 1e-9 여유). 이유(`reason`)는 무게 비율(후보 무게 ÷ 지난 최고 무게)과 횟수 비율 중 큰 쪽 — `weight` / `reps`.
- 돌려주는 것: `{ suspect, reason, usualKg: [최저, 최고], lbPlausible }` — `lbPlausible` = 무게 이유이고 무게×0.45359237 이 평소 범위의 0.8~1.2배 안(REV-079 C-8 · 132 를 kg 칸에 적은 경우 → 59.9kg). 아니면 lb 버튼을 보이지 않는다.

#### 언제 판정하나(저장소)

- **훑기 하나**(`resweepSuspects` — 도메인 `planSuspectStates`): 완료 운동을 시간순으로 한 번 읽어 칸마다 지난 기록을 쌓으며 판정한다. 기록을 고치거나 지울 때(`recomputeWorkoutTotals`·`discardWorkout`)는 건드린 종목의 그 시각 이후를, 첫 실행 때는 전부(옛 기록 백필 · 기기마다 한 번 · REV-079 D-1)를 다시 판정하고 같은 쓰기에서 PR 수도 센다.
- `judgeSetSuspect(setId)` — 그 세트 하나. 지난 기록 = 이 운동보다 먼저 끝난 완료 운동(진행 중이면 전부)의 같은 종목·같은 칸. `confirmed` 는 값이 바뀌지 않았으면 그대로 둔다.
- 운동 중 체크: `evalLiveSetPr` 가 **화면 입력값으로** 먼저 판정해 적고, 확인 필요면 축하하지 않는다(단독·슈퍼셋 묶음 둘 다 이 함수 · REV-079 C-2). 처방 채우기 전에 판정해 확인 필요 세트는 채우기 근거가 되지 않는다.
- 운동 완료: 메모리에서 판정해 PR 을 세고, `check_state` 는 완료 쓰기와 같은 묶음으로(REV-079 D-5). 잠금화면에서 체크한 세트는 잠금 대기열 처리 뒤 한 번 판정(칩만).
- `updateSetLog` 로 무게·횟수·웜업·실패를 바꾼 뒤, `setSetType` 뒤 다시 판정(REV-079 C-10).

#### 계산에서 빼기

- `toLoggedSet`·분석 저장소가 `suspect: check_state === 'suspect'` 를 싣는다.
- `bestEstimatedOneRepMax`·`snapshotFromSets`·`pickPrSets` 가 `suspect` 세트를 뺀다 → 운동 완료 PR·실시간 PR·PR 수 재계산·슬롯 1RM(세트 방식 처방 무게)·기록 상세 1RM 이 한 번에 따라온다. 분석 저장소의 직접 계산(개요 최고 1RM·최근 PR)도 같은 조건을 넣는다.
- `getPreviousLineWorkSets`(다음 무게 제안)·`getPreviousExerciseSets`·`getPreviousExerciseSnapshot`(다음 운동 프리필)은 확인 필요 세트를 빼고, 다 빠지면 더 이전 운동으로 간다(REV-079 C-5).
- 기간 요약·트레이너 리포트(`src/core/src/domain/summaryRecords.ts`·`src/core/src/domain/periodSummary.ts`·`src/backend/internal/coaching/records.go` 허용 칸), 세트 방식 바꾸기의 직접 1RM(`changeWorkoutScheme`), 운동 중 처방 채우기(`planPrescribedLoadFills` 근거)에서도 뺀다(REV-079 C-3·C-4).
- 볼륨은 그대로 센다(적은 값).

#### 바로잡기(저장소)

- `confirmSuspectSet(setId)` → `confirmed`.
- `fixSuspectAsLb(setId)` → 무게를 `×KG_PER_LB` 로 바꾸고(사람이 고친 값 · `user_edited` · 1e-3 반올림) 다시 판정. 운동 중이면 남은 세트 처방 채우기를 다시(`refillLoadsAfter`).
- `undoSuspectFix(setId, prev)` — 처리 직후 토스트의 「되돌리기」(REV-079 UX-8).
- `reinterpretBlockUnit(weId, to)` — 숫자는 그대로 두고 단위만 바꾼다: kg 블록 → lb(무게 × KG_PER_LB), lb 블록 → kg(무게 × LB_PER_KG). 블록 단위도 바꾸고 세트마다 다시 판정.
- 종목 바꾸기 = 확인창(「이 기록이 {새 종목}으로 옮겨지고 PR 이 다시 계산돼요」) 뒤 `swapPastWorkoutExercise`. 세트 추가 = 마지막 세트 값을 채운 고치기 시트를 열고 **저장할 때** `addPastSet`(0×0 완료 줄을 남기지 않는다 · REV-079 UX-6).
- 재계산: `recomputeWorkoutTotals(workoutId, extraExerciseIds?)` — 옛 종목도 「건드린 종목」에 넣는다. `discardWorkout` 은 완료 운동이면 지운 뒤 `recomputeTotalsAfter(완료 시각, 그 운동의 종목들)` 로 이후 운동의 PR 수를 다시 센다.
- `listSuspectSets({ exerciseId?, workoutId? })` — 화면이 모아 보인다.
- `rebuildWorkoutSummary(workoutId)` — 완료 요약에서 처리한 뒤 PR 수·종목 PR·총볼륨·세트 수를 통째로 다시 받는다(공유 묶음도 새 요약으로 · REV-079 UX-9).

#### 화면

- **확인 시트**(`SuspectSetSheet`): 제목 「이 기록이 맞나요?」 · 본문 「{종목} {무게}{단위} × {횟수}회 — 평소 {최저}~{최고}{단위}보다 크게 높아요」(블록 단위로 · REV-079 UX-10) · 버튼 「lb로 적었어요 → 59.9kg」(lbPlausible 일 때만 · 주 버튼) · 「제대로 적었어요」 · 「직접 고치기」(조용한 버튼 · 운동 중이면 닫고 무게 칸, 기록 상세면 고치기 시트) · 아래 줄 「확인 전까지 이 세트는 PR·1RM·세트 방식 계산에서 빠집니다.」 · 처리 뒤 토스트 「되돌리기」. 운동 중에는 시트를 **스스로 띄우지 않는다**(휴식 중 포함 — 칩만).
- **운동 중**: 체크한 세트가 확인 필요면 세트 줄 아래에 옅은 칩 「확인 필요」(누름 넓이 44px · aria-label 「3세트 확인 필요, 눌러서 확인」 · 금색·빨강 아님 · 아이콘 aria-hidden) · 그 세트는 PR 축하·「목표 달성」 결과를 보이지 않는다.
- **완료 요약**: 머리 바로 아래·숫자 셋 위에 카드 「확인이 필요한 기록 N개」 — 세트마다 한 줄 + 버튼(lb·제대로). 처리하면 `rebuildWorkoutSummary` 로 요약 전체를 바꾸고, 처리한 줄은 「처리함 · 되돌리기」로 접힌다.
- **기록 상세**: 세트 줄 전체가 버튼(고치기 시트)이라 그 안에 버튼을 넣지 않는다 — 확인 필요는 줄 안의 글자 표시, ✎ 는 aria-hidden 힌트, 줄 aria-label 「3세트 80kg × 8회 고치기」. 고치기 시트 맨 위에 확인 안내와 버튼 셋(REV-079 UX-5). 종목 머리 ⋯(aria-label 「{종목} 더보기」) → 「lb로 적은 기록이에요」(부제 「숫자는 그대로 · 단위만 바꿔요」 · lb 블록이면 「kg로 적은 기록이에요」) 「종목 바꾸기」 「세트 추가」. 단위 바꾸기 확인창에 예시(첫 세트 80 kg → 80 lb(36.3kg) · 볼륨 전→후) · 바꾼 뒤 토스트 「되돌리기」(REV-079 UX-7).
- **종목 상세**: 확인 필요 세트가 있으면 진행 카드 위에 「확인이 필요한 기록」 목록(날짜 · 무게×횟수 · 버튼 두 개 · 그 기록으로 가기 ›).

### 작업 단계

#### Phase 1 — 저장·판정·계산 제외·재계산(core)

- [x] v28 스키마·마이그레이션·모델 `checkState` · 스키마 시험(v27 → v28 이관 · 옛 세트 null)
- [x] `src/core/src/domain/suspectSet.ts` 판정 함수 + 단위 시험
- [x] `LoggedSet.suspect` · `bestEstimatedOneRepMax`·`snapshotFromSets`·`pickPrSets` 제외 · 분석 저장소 제외
- [x] 저장소: `judgeSetSuspect`·`judgeWorkoutSuspects`·`confirmSuspectSet`·`fixSuspectAsLb`·`reinterpretBlockUnit`·`listSuspectSets`·`detectWorkoutPrs` · `completeWorkout` 판정 먼저 · `updateSetLog` 다시 판정 · `getPreviousLineWorkSets` 제외
- [x] `recomputeWorkoutTotals(workoutId, extra)` · `discardWorkout` 재계산 · 서버 병합 시험(`src/backend/internal/sync/merge_v28_test.go`)
- 완료 기준: `bun run test:core` 통과(새 판정·제외·재계산·지우기 시험 포함) · `go test ./internal/sync/` 통과 · 타입 검사 통과

#### Phase 2 — 화면 4곳과 e2e

- [ ] `SuspectSetSheet` · 운동 중 칩·판정·PR 축하 건너뛰기
- [ ] 완료 요약 카드(처리 뒤 PR 다시 받기)
- [ ] 기록 상세 칩·✎·종목 ⋯(단위 바꾸기 확인창·종목 바꾸기 피커·세트 추가)
- [ ] 종목 상세 목록 · i18n(ko·en)
- [ ] e2e `src/frontend/e2e/record-fix.spec.ts`(시드는 `src/frontend/e2e/fixtures/declutter-seed.ts` 의 빠른 운동 도우미 · testid·`data-check-state` 로 찾는다): 60kg×8 두 번 뒤 132kg×8 → 확인 필요 칩·축하 없음 → 완료 요약 카드 「lb로 적었어요」 → 59.9kg · 다른 세트 「제대로 적었어요」 → PR 수 다시 셈 · 새로고침 뒤 기록 상세의 볼륨·PR 수 · 기록 상세 단위 바꾸기·세트 추가 → 볼륨 다시 계산
- 완료 기준: 새 e2e 통과 · 관련 회귀 e2e(세트 표·완료 요약·기록 상세·진행) 통과 · 타입·lint 통과
- [ ] REV-080 보류 넘김: 배수 2 블록 단위 바꾸기 왕복(기록 상세 e2e) · 동기 pull 뒤 바뀐 세트 재훑기 검토 · 「지난 세트」 표시·공유 문구의 확인 필요 세트 표시 방식

### 수용 기준

| SRS | 기준 | 확인 |
| --- | --- | --- |
| SRS-109 R1 | 지난 2회 60kg×8 뒤 132kg×8 체크 → 확인 필요 · 지난 1회뿐이면 판정 안 함 · 맨몸 종목 판정 안 함 · 정확히 1.3배는 아님 · 옛 배수 null 기록은 오탐 없음 · 옛 기록 백필 | 단위·저장소 시험 · e2e |
| SRS-109 R2 | 확인 필요 세트는 완료 PR·슬롯 1RM·기록 상세 1RM·다음 무게 제안에서 빠지고 볼륨은 남는다 | 단위 시험 · e2e |
| SRS-109 R3 | lb로 적었어요 → 132 → 59.87kg(화면 59.9kg) · 제대로 적었어요 → 값 지문과 함께 확인함 · 값을 바꾸면 다시 판정 · PR 수 다시 셈 · 되돌리기 | 저장소 시험 · e2e |
| SRS-109 R4 | 기록 상세 ⋯ 단위 바꾸기·종목 바꾸기·세트 추가 | e2e |
| SRS-109 R5 | 고친 뒤 · 완료 운동을 지운 뒤 이후 운동 PR 수가 다시 맞는다 | 단위 시험 |
| SRS-109 R6 | v27 기기가 올려도 check_state 가 남는다 · v28 기기가 null 을 올리면 지워진다 · 트레이너 리포트 허용 칸 | Go 시험 |

### 테스트 계획

- core: `src/core/src/domain/__tests__/suspectSet.test.ts`(판정 경계 정확히 1.3배·한 칸 위·소수 조합 · 2회 미만(세트 수가 아니라 운동 수) · 7번째 오래된 운동 제외·전체 최고 기준 · 다른 칸 무시 · 맨몸 · 이유·lbPlausible · 훑기 planSuspectStates 시간순·확인함 지문) · `src/core/src/domain/__tests__/schemaV28.test.ts`(이관) · 제외 시험(`bestEstimatedOneRepMax`·`snapshotFromSets`·`pickPrSets`·기간 요약) · 저장소 시험 `src/core/src/domain/__tests__/suspectRepo.test.ts`(fixtures/wm 등록 · 체크 판정·확인·lb·되돌리기·단위 왕복(62.5·102.5·배수 2)·종목 바꾸기 뒤 옛 종목 이후 운동 PR 수·지우기 뒤 이후 운동 PR 수·백필 · completed_at 명시)
- 백엔드: `go test ./internal/sync/`
- e2e: 로컬 운영 빌드(웹 3210·API 3211) `src/frontend/e2e/record-fix.spec.ts` + 회귀

### 위험·주의

- 판정 오탐: 30% 는 크다 · 기준에 전체 기간 최고를 넣는다 · 지난 2회 미만은 판정 안 함 · 「제대로 적었어요」는 값이 그대로인 동안 유지.
- 미탐(범위 밖): 무게를 **낮게** 잘못 적은 경우(lb 블록에 kg 숫자) · 새 칸(처음 쓰는 기구)의 첫 두 번.
- 옛 기기가 확인 필요 세트의 무게를 고쳐 올리면 낡은 suspect 가 남는다 — 새 기기가 다음 훑기(고치기·완료·첫 실행)에서 다시 판정한다.
- 옛 기기(v27)는 확인 필요 세트를 계산에 넣는다 — 새 기기로 열면 다시 빠진다(판정은 저장값).
- `completeWorkout` 에 판정을 더하면 완료가 조금 느려진다 — 종목마다 지난 기록 1회 조회(PR 계산과 같은 크기).
- `discardWorkout` 재계산은 지운 **뒤** — 지우기 쓰기와 같은 쓰기 안에서 하지 않는다(Watermelon 중첩 쓰기 금지).
