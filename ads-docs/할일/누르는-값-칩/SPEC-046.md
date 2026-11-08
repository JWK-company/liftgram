# SPEC-046 — 누를 수 있는 값은 옅은 칩 — 앱 전체 규칙 · 반대 사례 · 숨은 동작 첫 안내

> 타입 Spec · 그룹 할일/누르는-값-칩 · ADStudio가 `SPEC-046.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → SRS-111

## 목표

- 눌러서 값을 채우거나 바꾸는 요소가 한눈에 「눌린다」고 보이게 한다. 방법은 앱 전체에 공용 칩 하나를 두는 것이다(SRS-111 R1·R2).
- 눌릴 것처럼 보이는데 안 눌리던 두 곳을 실제로 눌리게 한다(R3).
- 모양만으로 알리기 어려운 숨은 동작 세 가지는 처음 한 번 말풍선으로 알린다. 안내는 설정에서 다시 볼 수 있다(R4·R5).
- 등급 근거: 화면 10곳 이상 · 새 공용 컴포넌트 2개 · 저장소 반환값 1개 → Feature, 3단계.

## 범위

| 파일 | 무엇을 |
| --- | --- |
| `src/frontend/app/components/ui/ValueChip.tsx`(새) | 공용 칩 — 옅은 바탕 + 동작 아이콘(fill ↙ · pick ▾ · edit ✎ · view ›) · 누름 44px |
| `src/frontend/app/components/session/SetRowEdit.tsx` | 「이전」 칸(`set-prev`) → 칩 ↙ · 세트 번호(`set-type`) → 번호 옆 ▾ · 누름 높이 44px |
| `src/frontend/app/components/session/SetRowCardio.tsx` | 「이전」 칸(`cardio-prev`)을 근력과 같은 칩으로(지금은 분홍 상자에 빨강 글자) |
| `src/frontend/app/components/session/ExerciseBlock.tsx` · `src/frontend/app/components/ui/quiet.tsx` | 금색 PR(`PrText`) → pr 톤 칩 ↙ · 빨간 세트 방식 이름(`we-scheme`)을 누르면 `openSchemeSheet` |
| `src/frontend/app/components/session/BlockTools.tsx` | 휴식 「90초」 · 「메모」 → 칩 |
| `src/frontend/app/components/ui/UnitToggle.tsx` | compact 모양을 둘로 나뉜 토글(바탕 + 고른 쪽 흰 알약)로 |
| `src/frontend/app/components/session/ActiveWorkout.tsx` | 슈퍼셋 「해제」 → 칩 · 누름 44px |
| `src/frontend/app/components/session/ExerciseTipPanel.tsx` | 그림 위 「단계 보기」 칩 |
| `src/frontend/app/components/routines/PrescriptionRows.tsx` | 루틴 편집 세트 번호(`rx-type`) → 번호 옆 ▾ |
| `src/frontend/app/components/analytics/WorkoutDetailClient.tsx` | 세트 줄 끝 ✎를 칩 모양으로(지금은 맨 아이콘) |
| `src/frontend/app/components/analytics/CalendarClient.tsx` | 이번 달이 아니면 제목 옆에 「오늘」 칩을 따로 둔다(제목 누르기도 그대로 둔다) |
| `src/frontend/app/components/analytics/BodyweightCard.tsx` · `src/frontend/app/components/ui/LineChart.tsx` | 값을 고르기 전에 값 줄 자리에 「눌러서 값 보기」 |
| `src/frontend/app/components/ExerciseAnimation.tsx` | 재생 중에도 모서리에 ⏸ 늘 표시(정지 중 ▶) |
| `src/frontend/app/components/profile/LockScreenRow.tsx` | 「켜짐/꺼짐」 글자 → 다른 줄과 같은 스위치 모양 |
| `src/core/src/data/analyticsRepository.ts` · `src/frontend/app/components/analytics/StatsClient.tsx` | `RecentPR`에 `workoutId`를 더한다 · 최근 PR 줄에 ›를 붙이고 누르면 `/history/<workoutId>` |
| `src/frontend/app/components/ui/CoachMark.tsx`(새) · `src/frontend/lib/coachMarks.ts`(새) · `src/frontend/lib/overlayPresence.ts`(새) | 첫 안내 말풍선 · 본 안내 기록(기기 값 · 동기하지 않음) · 열린 창 신호 |
| `src/frontend/app/components/ui/Icon.tsx` | `return-down-forward` 아이콘 |
| `src/frontend/app/components/profile/HintsResetRow.tsx`(새) · `src/frontend/app/components/profile/ProfileClient.tsx` | 설정 「안내 다시 보기」(한 줄) |
| `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts` | 문구 |
| `src/frontend/e2e/value-chips.spec.ts`(새) | e2e |

## 설계

- **세 종류 기준**(REV-084 5). 「눌리지 않으면 바탕이 없다」는 규칙이지만 「바탕이 없으면 안 눌린다」는 규칙은 아니다.

  - ① **값 칩**: 바탕이 있다. 누르면 이 줄의 값을 채우거나 바꾼다. 대상: 「이전」, PR, 휴식, 메모, kg│lb.

  - ② **메타 꺾쇠**: 바탕 없이 글자 + chevron이다. 누르면 다른 창이나 시트가 열린다. 대상: 세트 번호, 세트 방식 이름, 「해제」, 최근 PR, 기존 메타 줄.

  - ③ **입력칸**: 네모 + 테두리.

- **ValueChip**(`src/frontend/app/components/ui/ValueChip.tsx`):

  - 바깥 `button`이 testid, `aria-label`, disabled, `min-h-[44px]`를 갖는다. 칩 바탕은 안쪽 span에 그린다.

    - 칩 모양: `rounded-[10px] px-[4px]~[6px] py-[2px]`, 테두리 없음.

    - 바탕: default는 `--color-surface-alt`, pr은 `--color-pr-soft`다. pr의 글자는 ink이고 아이콘만 금색이다(대비 · REV-084 7).

  - `as="span"`은 장식형이다(버튼 안에 쓸 때 · aria-hidden).

  - 아이콘은 `Icon`(SVG · aria-hidden)이다. fill = `return-down-forward`(Icon 표에 더한다) · pick = `chevron-down` · edit = `create-outline` · view = `chevron-forward`. 글자 아이콘은 쓰지 않는다. testid 요소의 글자가 바뀌지 않게 하기 위해서다(REV-084 2).

  - disabled면 바탕을 빼고 맨 글자로 그린다.

  - 기존 button을 **대신하고**, 감싸지 않는다(버튼 안 버튼 금지).

- **곳별 결정**:

  - 「이전」(근력·유산소): 66px 칸 전체가 칩이다. 아이콘은 없고, 둘째 줄이 있어도 같은 상자 안에 둔다. 이름은 「이전 60kg 8회 채우기」다. 기록이 없거나 완료한 세트면 바탕을 빼고 「이전 기록 없음」이다.

  - PR: 채우기 버튼만 칩(pr, fill 아이콘)으로 바꾼다. ⓘ는 형제로 그대로 둔다. 안 한 작업 세트가 없으면 disabled.

  - 세트 번호(운동 중 `set-type` · 루틴 `rx-type`): 번호 뒤에 작은 chevron-down을 붙이고 테두리를 뺀다. 너비는 그대로다. 이름은 「1세트 종류 바꾸기」이고 `aria-haspopup="dialog"`.

  - 휴식 · 메모: 칩이다. 메모는 `max-w`로 줄여 회색 막대가 되지 않게 한다. 바깥 버튼 44px를 유지한다(feedback-62-64 단언).

  - 「해제」: ② 메타 글자로 두고 누르는 높이만 44px로 늘린다. 파괴 동작이라 값 칩처럼 보이지 않게 한다.

  - 세트 방식 이름: `we-scheme` div와 `data-scheme`는 그대로 둔다. 이름만 button(`btn-scheme-name`) + chevron-down으로 만들고 `openSchemeSheet`를 부른다. 빨강 글자는 색 가드의 허용 예외다.

  - kg│lb(Phase 2): 트랙 바탕은 `surface-alt`. 고른 쪽은 `--color-surface` + 그림자 + 굵게. 누르는 자리(after)는 그대로 둔다.

  - 운동 팁(Phase 2): 그림 위 모서리에 「단계 보기」 칩.

  - 기록 상세: 줄 끝 ✎을 `ValueChip as="span"`(edit)으로 바꾼다. 줄 버튼 이름은 「N세트 고치기」.

  - 달력: 이번 달이 아니면 제목 옆에 「오늘」 칩(`btn-calendar-today`)을 둔다.

  - 체중 그래프: 값을 고르기 전에 「눌러서 값 보기」를 aria-live 밖(aria-hidden)에 둔다.

  - 시연 그림: 재생 중 ⏸, 정지 중 ▶를 늘 보인다.

  - 잠금화면: 알림 권한이 있을 때만 다른 줄과 같은 스위치 모양을 쓴다. 권한이 없으면 지금 「꺼짐 — 켜기」(설정 열기)를 그대로 둔다. `role="switch"`·`aria-checked`는 유지한다.

  - 최근 PR: `getRecentPRs`의 `cur`에 `workoutId`를 담아 돌려준다. 줄은 `ListRow href=/history/<workoutId>`, testid는 `recent-pr-<exerciseId>`.

- **열린 창 신호**(`src/frontend/lib/overlayPresence.ts`):

  - `openOverlay()`가 닫기 함수를 돌려주고, `useOverlayOpen()`으로 구독한다.

  - `src/frontend/app/components/ui/Dialog.tsx` Overlay와, Overlay를 쓰지 않는 전체 화면 창(종목 피커 · 체중 입력 · PR 축하 · 업데이트 화면 · 종목 찾기)이 등록한다.

- **CoachMark**(`src/frontend/app/components/ui/CoachMark.tsx` · `src/frontend/lib/coachMarks.ts`):

  - 키는 `liftgram.hint.<id>` = "seen"(id: `prev` · `rxType` · `longDone`)이다. 기기 값이라 동기하지 않는다.

  - `liftgram.hint.suppressed`가 있으면 아무 안내도 띄우지 않는다(e2e용 · 다시 보기로 지우지 않는다).

  - `useCoachMark(id, when)`은 다음을 모두 만족할 때만 open을 준다: 안 봤음 · when · 온보딩 봤음 · 열린 창 없음 · 입력 포커스 없음 · 지금 다른 안내 없음(모듈 잠금, 언마운트 때 해제).

  - 열린 동안 창이 열리면 숨겼다가 닫히면 다시 띄운다. 「알겠어요」나 대상 동작(「이전」 누름 등)을 하면 본 것으로 친다. 누르지 않고 떠나면 안 본 것이다.

  - 모양: 화면 아래 safe-area 위 16px(휴식 막대가 있으면 그 위)에 뜬다. `role="status"` `aria-live="polite"`. 포커스는 옮기지 않는다. 뒤 화면을 막지 않는다. Esc로 닫힌다. 뒤로 가기는 가로채지 않는다. reduced-motion이면 애니메이션 없음.

  - 화면 수준에서 한 번만 그린다(`ActiveWorkout` · `RoutineEditor`).

- **세 안내**:

  - (a) `prev`: 운동 중, 이전 기록이 있는 「이전」 칩이 하나라도 있을 때. 「회색 이전 칸을 누르면 지난 무게·횟수가 그대로 들어가요」

  - (b) `rxType`: 루틴 편집 세트 표가 보일 때. 「세트 번호를 누르면 종류 바꾸기·복사·삭제가 나와요」

  - (c) `longDone`: 슈퍼셋 묶음을 처음 체크해 휴식이 시작될 때, 휴식 막대 위에. 「방금은 묶음 전체가 완료됐어요. 체크를 길게 누르면 이 종목만 완료돼요」

- **안내 다시 보기**: `resetCoachMarks()`가 `liftgram.hint.<id>` 세 개를 지우고(suppressed는 남긴다) 토스트를 띄운다.

## 작업 단계

### Phase 1 — 공용 칩과 운동 중 세트 줄

- [x] `src/frontend/app/components/ui/ValueChip.tsx` · Icon에 `return-down-forward`를 더한다
- [x] 「이전」 근력·유산소 → 칩(같은 모양 · 이름 · 기록 없음은 바탕 없음)
- [x] PR → pr 칩(채울 곳 없으면 disabled)
- [x] 운동 중 세트 번호 chevron · 이름
- [x] 휴식 · 메모 칩 · 「해제」 44px
- [x] 세트 방식 이름 `btn-scheme-name` → 세트 방식 시트
- [x] e2e `src/frontend/e2e/value-chips.spec.ts`(바탕 probe 라이트·다크 · 이름 · 「이전」 칩 누르면 채워짐 · 세트 방식 이름 → 시트 · 빨강 가드에서 세트 방식 이름만 허용)
- 완료 기준: 위 e2e + 회귀 session · set-table · set-scheme · record-slots · cardio · declutter-block · declutter-p4 · feedback-62-64 · session-assist · history-replay · record-fix

### Phase 2 — 다른 화면과 반대 사례

- [x] kg│lb 토글 · 운동 팁 「단계 보기」 칩
- [x] 루틴 편집 세트 번호 chevron
- [x] 기록 상세 ✎ 칩(장식형) · 줄 이름
- [x] 달력 「오늘」 칩
- [x] 체중 그래프 안내
- [x] 시연 그림 ⏸/▶
- [x] 잠금화면 스위치(권한이 있을 때)
- [x] `RecentPR.workoutId` · 최근 PR 줄 › → 기록 상세(core 단위 시험)
- [x] e2e 더하기(최근 PR → `/history/` · 다른 달 → 「오늘」 · 잠금 스위치 보임 · 토글 다크 모드)
- 완료 기준: 위 e2e + 회귀 unit-toggle · declutter-block · analytics · analytics-deep · schedule · opengym-import · opengym-bodyweight · lock-bridge · routines · set-table · pictogram · motion-video · profile

### Phase 3 — 숨은 동작 첫 안내와 안내 다시 보기

- [x] `src/frontend/lib/overlayPresence.ts` · Overlay와 전체 화면 창 등록
- [x] `src/frontend/lib/coachMarks.ts` · `src/frontend/app/components/ui/CoachMark.tsx`
- [x] 세 안내 연결(ActiveWorkout · RoutineEditor · 휴식 시작)
- [x] 설정 「안내 다시 보기」(`src/frontend/app/components/profile/HintsResetRow.tsx`)
- [x] e2e용 `liftgram.hint.suppressed`: `src/frontend/playwright.config.ts`와 자체 storageState를 쓰는 곳(`src/frontend/e2e/helpers/opengym.ts` · `src/frontend/e2e/history-replay.spec.ts` · `src/frontend/e2e/declutter-p3.spec.ts` · `src/frontend/e2e/opengym-bodyweight.spec.ts`, newContext를 쓰는 시험)
- [x] e2e: 첫 화면 안내 → 「알겠어요」 → 다시 와도 안 뜸 → 설정에서 다시 보기 → 다시 뜸 · 포커스가 그대로 · 시트가 열리면 숨김 · (c)는 휴식 막대 위
- 완료 기준: 위 e2e + 회귀 onboarding · session · routines · set-table · profile · data-safety · app-continue · 전체 e2e 한 번

## 수용 기준

| SRS | 기준 | 확인 |
| --- | --- | --- |
| SRS-111 R1 | 칩은 바탕 + 아이콘 · 눌리지 않으면 바탕 없음 · 누름 44px | e2e(계산된 바탕색 · 크기) |
| SRS-111 R2 | 15곳 적용(체크 길게 누르기는 R4 · 종목 이름 잘림은 그대로) | e2e · 화면 확인 |
| SRS-111 R3 | 세트 방식 이름을 누르면 시트 · 최근 PR 줄 ›를 누르면 그 운동 기록 | e2e |
| SRS-111 R4 | 세 안내가 처음 한 번만 · 하나씩 · 창이 열린 동안 안 뜸 | e2e |
| SRS-111 R5 | 설정 「안내 다시 보기」를 누르면 다시 뜸 | e2e |

## 테스트 계획

- e2e `src/frontend/e2e/value-chips.spec.ts`: 단계마다 위 항목을 더한다.
- 기존 e2e 회귀:

  - session · set-table · set-scheme · record-slots · cardio · analytics · schedule · routines · profile · onboarding · record-fix · routine-preview

  - 안내 말풍선이 기존 시험을 가리지 않게 `src/frontend/playwright.config.ts` storageState에 `liftgram.hint.suppressed`를 둔다(자체 storageState를 쓰는 곳에도).

- core: `getRecentPRs`가 `workoutId`를 돌려주는지 단위 시험을 더한다.

## 위험·주의

- 세트 줄은 좁다. 칩 바탕과 여백 때문에 「이전」 칸(66px)의 숫자가 더 잘리면 안 된다. 칩 안 여백은 좌우 4~6px이고, 넘치면 지금처럼 말줄임한다.
- 기존 e2e가 testid로 찾는 요소(`set-prev`, `cardio-prev`, `pr-chip-*`, `btn-rest-setting`, `btn-note-open`, `unit-toggle-*`, `btn-unlink-superset`, `month-label`, `row-lock-screen`)는 같은 testid를 유지한다.
- 색 규칙 가드 e2e는 강조색이 화면에 하나뿐인지를 본다. pr 톤 칩은 금색이라 빨강 강조와 겹치지 않지만, 세트 방식 이름은 빨강 그대로 둔다(모양만 button).
- 길게 누르기를 ⋯ 메뉴에 더하지 않는 이유: ⋯는 종목 단위 메뉴이고 길게 누르기는 세트 단위 동작이다. 같은 일을 하는 세트 상세의 `set-done-single`이 이미 있다(SRS-111 R2 개정).
- 안내는 운동 중 방해 금지 원칙(입력 중 · 창이 열린 동안 안 뜸 · 화면을 막지 않음 · 포커스 이동 없음)을 따른다.
- 대비: 칩 바탕은 카드와의 대비가 낮다(1.12:1). 둥근 모양 · 아이콘 · 첫 안내로 보완하고, 토큰 값 조정은 보류한다(REV-084 23).
- 스펙 리뷰는 REV-084(채택 22 · 보류 4)
