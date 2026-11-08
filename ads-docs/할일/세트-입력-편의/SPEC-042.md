# SPEC-042 — 세트 입력 편의 — 다른 세트도 똑같이 · 숫자 칸 전체 선택 · 뒤로 가기는 창만 닫기

> 타입 Spec · 그룹 할일/세트-입력-편의 · ADStudio가 `SPEC-042.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → SRS-106, SRS-107

## 목표

- 한 세트의 무게·횟수를 다른 세트에 한 번에 맞춘다(루틴 편집 · 운동 중) — SRS-106.
- 무게·횟수 칸을 누르면 숫자 전체가 선택된다 — SRS-106.
- 기기·브라우저 뒤로는 맨 위 창만 닫는다 — SRS-107.

등급 Task — 입력 편의 한 관심사(파일은 많지만 저장 형식·API·DB 변경 없음, 화면 동작만).

## 범위

| 파일 | 무엇 |
| --- | --- |
| `src/core/src/domain/copySetValues.ts` | 새 파일 — 대상 고르기 규칙(체크 안 함 · 같은 갈래 · 이미 같은 값 제외) |
| `src/core/src/domain/__tests__/copySetValues.test.ts` | 규칙 시험 |
| `src/core/src/data/workoutRepository.ts` | `copySetValuesToOpenSets(sourceId)` — 한 번의 쓰기로 복사 |
| `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts` | `routines.copyToOthers` |
| `src/frontend/app/components/routines/PrescriptionRows.tsx` | 고친 직후 버튼 `rx-copy-rest` · 번호 시트 `rx-copy` · NumCell 전체 선택 · 옛 「나머지 일반 세트도」는 [원본] 주석 |
| `src/frontend/app/components/session/ExerciseBlock.tsx` | 고친 직후 버튼 `set-copy-rest` · 시트 항목 연결 |
| `src/frontend/app/components/session/SetRowEdit.tsx` | 번호 시트 `set-copy` · 무게·횟수·부분 반복 칸 전체 선택 |
| `src/frontend/app/components/ui/selectAllOnFocus.ts` | 새 파일 — 포커스 때 전체 선택 + 첫 mouseup 막기(휴대폰) |
| `src/frontend/lib/useBackToClose.ts` | 새 파일 — 창이 열리면 기록 한 칸 · 뒤로면 닫기 · 묻힌 칸 건너뛰기 |
| `src/frontend/app/components/ui/Dialog.tsx` | Overlay 에 `useBackToClose` |
| `src/frontend/app/components/ui/VariantSelector.tsx` · `src/frontend/app/components/ui/RecordSlotSelector.tsx` · `src/frontend/app/components/feed/StoryViewer.tsx` · `src/frontend/app/components/feed/FeedClient.tsx` | 직접 만든 창에도 같은 훅 |
| `src/frontend/e2e/set-table.spec.ts` · `src/frontend/e2e/set-input-ease.spec.ts` | e2e |

## 설계

- 대상 규칙 하나(`copyTargetIndexes`)를 루틴 표와 운동 중이 함께 쓴다. 준비 판정: 루틴 표는 setType warmup·feeder, 운동 중은 isWarmup(피더도 켜짐).
- 운동 중 열린 세트 = `done === false`(옛 null 은 수행됨). 원본 세트는 체크돼 있어도 된다(1세트를 하고 나서 나머지에 맞추기).
- 운동 중 복사는 블록 쓰기 줄(write)에 실린다 — 칸을 떠나며 올라가는 저장 뒤에 차례로 돈다. 값은 정규 kg 그대로, userEdited·값 출처 user.
- 버튼은 방금 무게·횟수를 고친 세트를 기준으로 하고, 바뀔 세트가 0이면 숨긴다.
- 전체 선택: focus 때 select + 한 박자 뒤 setSelectionRange, 포커스 직후 첫 mouseup 의 기본 동작을 막아 탭 끝의 커서 이동을 막는다. 키보드 포커스 표시는 600ms 뒤 지운다.
- 뒤로: ExercisePickerScreen·WeighInSheet 와 같은 liftgramTop 토큰 규약. 닫힐 때 맨 위가 우리 칸이면 history.back, 아니면(다른 화면으로 이동) 묵은 칸으로 적어 두고 popstate 로 그 칸에 닿으면 한 번 더 뒤로.

## 작업 단계

### Phase 1 — 구현과 검증

- [x] 대상 규칙·시험
- [x] 저장소 복사 함수
- [x] 루틴 표 버튼·시트 항목·전체 선택
- [x] 운동 중 버튼·시트 항목·전체 선택
- [x] 뒤로 가기 훅과 창 연결
- [x] e2e(로컬 운영 빌드)

완료 기준: core 시험 통과 · 타입 검사 통과 · e2e set-table·set-input-ease·set-scheme·session-assist·finish-routine 통과.

## 수용 기준

- SRS-106: 루틴 편집에서 웜업 1 + 일반 3, 일반 1줄에 100kg·5~5 → 버튼 「2세트」 → 일반 2줄이 같은 값, 웜업은 빈칸. 운동 중 1세트에 값 → 버튼 → 안 한 작업 세트가 같은 값, 체크한 세트·웜업은 그대로. 칸을 누르고 바로 치면 숫자가 바뀐다.
- SRS-107: 세트 방식 시트·세트 타입 시트를 연 채 뒤로 → 시트만 닫히고 주소는 그대로. 다시 뒤로 → 직전 화면.

## 테스트 계획

- `npx tsx --test src/domain/__tests__/copySetValues.test.ts`(src/core) 와 core 전체.
- `npx tsc --noEmit`(src/frontend · src/core).
- e2e: 로컬 운영 빌드(새 DB · 웹 3210 · API 3211) — set-table · set-input-ease(새) · set-scheme · session-assist · finish-routine · coaching.

## 위험·주의

- 기록 칸을 쌓는 창이 많아진다 — 창 선택지가 이동하면서 칸이 묻히는 경우는 건너뛰기로 막는다. 개발 모드(효과 두 번)에서는 창이 바로 닫힐 수 있어 e2e 는 운영 빌드로만 돌린다.
- 루틴 표의 옛 「나머지 일반 세트도 N kg」(무게만)은 새 버튼으로 바뀐다 — 기존 e2e 를 새 동작에 맞춘다([원본] 주석).
- 작업 세트끼리만 맞추므로 드롭 줄도 작업 무게가 된다 — 사용자가 「세트 방식 상관없이 같은 동작」을 원해 그대로 둔다.
