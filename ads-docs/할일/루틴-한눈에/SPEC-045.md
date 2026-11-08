# SPEC-045 — 루틴 한눈에 — 종목 한 줄과 미리보기 시트

> 타입 Spec · 그룹 할일/루틴-한눈에 · ADStudio가 `SPEC-045.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → SRS-110

### 목표

루틴 목록 줄에서 종목 구성을 바로 알아보고(한 줄 + 「외 N」), 줄을 누르면 종목·세트 구성을 시트로 본 뒤 시작하거나 편집한다(SRS-110).

### 범위

| 파일 | 무엇을 |
| --- | --- |
| `src/frontend/app/components/routines/RoutinesClient.tsx` | `ExerciseCount` 자리를 `ExerciseLine` 으로 · 줄 누르기 → `RoutinePreviewSheet` · 폴더 안 줄도 같게 |
| `src/frontend/app/components/routines/RoutinePreviewSheet.tsx`(새) | 시트 — 종목·세트 요약·슈퍼셋 표시·시작·편집 |
| `src/core/src/domain/routineSummary.ts`(새) + 시험 | 줄 글자(앞 3개 + 외 N)·종목 줄 요약(세트 수·횟수 범위) 순수 함수 |
| `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts` | `routines.more`·`routines.noExercises`·`routines.previewSets` 등 |
| `src/frontend/e2e/routine-preview.spec.ts`(새) | e2e |

### 설계

- 순수 함수 `routineLineText(names: string[], max = 3) → { shown: string; more: number }` · `routineExerciseSummary(re) → { sets: number; repMin: number | null; repMax: number | null; cardio: boolean }` — 세트 수는 처방(`prescription`)이 있으면 그 길이(웜업 제외 없이 줄 수), 없으면 `targetSets`; 횟수 범위는 처방 작업 세트의 min~max, 없으면 `targetRepsMin~Max`.
- `ExerciseLine` 은 `queryRoutineExercises` 반응형 쿼리(편집이 곧바로 따라옴) + `getExerciseDisplayNameMap` 으로 이름 · 이름 칸은 `truncate`, 「외 N」은 `shrink-0` 별도 칸.
- 줄의 왼쪽(이름·종목 줄)을 `button` 으로 — 누르면 시트. 오른쪽 「시작」·⋯ 는 그대로(버튼 안 버튼 금지).
- 시트는 `SheetShell`(뒤로 가기는 맨 위 창만 닫는다 · v0.78.0) · 「시작」은 목록의 `guardActive(startFromRoutine(id))` 를 그대로 받는다 · 「편집」은 `navigate(/routines/<id>)`.

### 작업 단계

- [ ] `src/core/src/domain/routineSummary.ts` + `src/core/src/domain/__tests__/routineSummary.test.ts`
- [ ] `RoutinePreviewSheet` · `ExerciseLine` · 줄 누르기(폴더 안·밖)
- [ ] i18n ko·en
- [ ] e2e `src/frontend/e2e/routine-preview.spec.ts`(종목 4개 루틴 → 「외 1」 · 시트 세트 요약 · 시작 · 편집)
- 완료 기준: core 시험 통과 · e2e 통과 · 기존 `src/frontend/e2e/routines.spec.ts`·`src/frontend/e2e/home-primary.spec.ts` 통과.

### 수용 기준

| SRS | 기준 | 확인 |
| --- | --- | --- |
| SRS-110 R1 | 종목 4개 → 앞 3개 + 「외 1」 · 없으면 「종목 없음」 · 편집하면 곧바로 바뀜 | 단위 시험 · e2e |
| SRS-110 R2 | 시트에 종목마다 세트 요약 · 「시작」이 운동을 시작 · 「편집」이 편집 화면 | e2e |
| SRS-110 R3 | 줄 오른쪽 시작·⋯ 그대로 | 기존 e2e |

### 테스트 계획

- core: `routineLineText`(0·1·3·4개 · 긴 이름) · `routineExerciseSummary`(처방 있음·없음·유산소·횟수 하나).
- e2e: 새 루틴(벤치·스쿼트·데드·로우) → 목록 줄 「외 1」 → 줄 누르기 → 시트 4줄·세트 요약 → 「편집」 → 편집 화면 · 다시 목록 → 시트 「시작」 → 운동 화면에 4종목.

### 위험·주의

- 루틴이 많으면 줄마다 쿼리·이름 읽기 — 이름은 모듈 캐시(`src/frontend/lib/exerciseNames.ts`)를 거친다.
- 줄 전체가 눌리면 스크롤 중 잘못 눌림 — 왼쪽 글자 영역만 버튼.
- 첫 화면 판단 전(`homeReady` 전)에는 시트의 시작도 막는다(목록 버튼과 같은 busy).
