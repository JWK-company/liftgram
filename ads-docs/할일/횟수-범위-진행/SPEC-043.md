# SPEC-043 — 루틴 횟수 범위 → 운동 중 목표·결과·다음 무게

> 타입 Spec · 그룹 할일/횟수-범위-진행 · ADStudio가 `SPEC-043.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → SRS-108

## 목표

- 루틴의 횟수 범위가 운동 중에 「목표」로 보이고, 결과와 다음 무게 제안으로 이어지게 한다(SRS-108 · 제안 A).

등급 Task — 운동 중 화면 한 관심사, 저장 형식 변경 없음.

## 범위

| 파일 | 무엇 |
| --- | --- |
| `src/core/src/domain/progression.ts` | `repResult` · `planDoubleProgression` 추가(옛 suggestNextSet 은 그대로) |
| `src/core/src/domain/__tests__/doubleProgression.test.ts` | 규칙 시험 |
| `src/core/src/data/workoutRepository.ts` | `getRoutineLineRepRange` · `fillOpenWorkSets` |
| `src/frontend/app/components/session/ExerciseBlock.tsx` | 줄 범위 읽기 · 세트에 목표 넘기기 · 제안 카드 `prog-plan`·`prog-apply` |
| `src/frontend/app/components/session/SetRowEdit.tsx` | 결과 글자 `set-rep-result` |
| `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts` | `session.repResult.*` · `session.prog.*` |
| `src/frontend/e2e/progression-range.spec.ts` | 운동 세 번 e2e |

## 설계

- 목표: 세트 방식 처방이 있으면 그 줄(지금 그대로), 없으면 루틴 줄의 targetRepsMin/Max 를 작업 세트의 rx 로 넘긴다 — 기존 「목표 a-b회」 글자가 그대로 보인다.
- 결과: 끝낸 세트의 횟수를 범위와 견준다. 위쪽 값 이상은 초록 굵게.
- 제안: 직전 기록(getPreviousExerciseSets — 같은 종목·같은 조합)의 작업 세트 중 최고 무게 세트들을 주 세트로 본다. 모두 위쪽 값 이상 → +증분·아래쪽 값, 하나라도 아래쪽 값 미만 → 같은 무게·아래쪽 값, 그 밖 → 같은 무게·가장 적은 횟수+1(위쪽 값까지). 무게는 블록 단위로 반올림(roundSuggestionKg).
- 채우기: 안 한 작업 세트(done=false · 웜업·피더 제외)에 같은 값, 사람이 적은 값으로 표시. 누르면 카드를 닫는다.

## 작업 단계

### Phase 1 — 구현과 검증

- [x] 규칙·시험
- [x] 저장소 함수
- [x] 세트 목표·결과
- [x] 제안 카드·채우기
- [x] e2e

완료 기준: core 시험 · 타입 검사 · e2e progression-range · set-scheme · set-table · session-assist 통과.

## 수용 기준

- SRS-108: e2e 로 첫 운동(목표 글자 · 12/10/7회 결과 세 가지 · 제안 없음) → 두 번째(같은 무게 8회부터 · 채우기) → 세 번째(62.5kg × 8회 · 채우기) 확인.

## 테스트 계획

- `bun run test:core`(src) · `npx tsc --noEmit`(src/frontend).
- e2e(로컬 운영 빌드 3210·3211): progression-range · set-scheme · set-table · session-assist · finish-routine.

## 위험·주의

- 세트 방식 표에는 제안을 띄우지 않는다(방식이 정한 % 무게와 겹친다).
- 지난 기록이 오타(단위 실수)면 제안도 틀린다 — 다음 작업(SRS-109 튀는 기록 확인)에서 다룬다.
