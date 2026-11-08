# SPEC-041 — 세트 방식 — 루틴·운동 화면에서 세트 방식으로 세트 짜기

> 타입 Spec · 그룹 할일/세트-방식 · ADStudio가 `SPEC-041.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → SRS-105

### 목표

루틴 종목의 세트를 「세트 방식」 하나로 짠다(SRS-105). 세트 줄의 … 메뉴와 강도 목표를 루틴 편집에서 없애고, 세트 방식을 고르면 세트 타입·횟수·무게 기준이 한 번에 채워진다. 운동 중에도 바꿀 수 있고, 운동 후 루틴에 반영할지 고르며, 기록에 남는다.

등급 판정: Project — 앱 core·루틴 편집·운동 화면·운동 후 반영·서버 코칭 정리 규칙에 걸친다(DB 칸 추가는 없다).

### 범위

- `src/core/src/domain/setSchemes.ts`(새 파일) — 세트 방식 정의·적용·판정
- `src/core/src/domain/prescription.ts` — 피더 타입, `amrap`, `scheme`, 무게 기준 `pctWork`
- `src/core/src/domain/routineSets.ts` — 뜻 판정에 새 필드
- `src/core/src/domain/routineDiff.ts`, `src/core/src/data/finishRoutine.ts` — 세트 방식 변경 항목·반영
- `src/core/src/data/workoutRepository.ts` — 시작 무게 계산(`pctWork`)·피더 타입·운동 중 세트 방식 바꾸기
- `src/core/src/i18n/locales/ko.ts`, `src/core/src/i18n/locales/en.ts`
- `src/frontend/app/components/routines/PrescriptionRows.tsx`, `src/frontend/app/components/routines/RoutineEditor.tsx`
- `src/frontend/app/components/session/ExerciseBlock.tsx`, `src/frontend/app/components/session/SetRowEdit.tsx`, `src/frontend/app/components/session/FinishRoutineSheets.tsx`, 기록 상세 화면
- `src/backend/internal/coaching/report.go`, `src/backend/internal/coaching/prescription.go` — 새 필드 보존
- 시험: core 단위 시험, Go 시험, e2e `src/frontend/e2e/set-scheme.spec.ts`(새 파일)

### 설계

#### 데이터(JSON 안 필드 — DB 칸 추가 없음)

처방 줄 `PrescribedSet` 에 선택 필드를 더한다(스펙 리뷰 REV-074 반영).

- `setType` 에 `feeder` 추가 — 준비 세트다. 세션에서는 `set_type='feeder'` 와 함께 `is_warmup` 을 켜서 볼륨·PR·1RM·근육 부하·세트 수에서 웜업처럼 빠진다. 표시 글자 P(F 는 실패 세트).
- `amrap?: true` — 횟수 「최대」. 드롭 줄에만 쓴다. 저장 왕복에서 블록 횟수를 물려받지 않는다.
- `scheme?: SchemeId` — 그 줄을 만든 세트 방식. 종목의 세트 방식 = 모든 줄의 `scheme` 이 같을 때 그 값.
- 무게는 기존 무게 기준을 쓴다: 「추정 1RM 의 %」(pct1rm)와 백오프의 「탑세트의 %」(pctTop). 퍼센트는 목표 횟수에서 한두 개 남기는 값이다. 기록이 없으면 첫 작업 세트로 1RM 을 추정해 나머지를 채우는 기존 흐름을 쓴다(피더·웜업으로는 추정하지 않는다).
- 「수정함」은 저장하지 않고 계산한다 — 줄의 타입·횟수·최대·무게 기준·%가 틀과 다르면 수정함.

#### 세트 방식 틀(`SCHEMES`)

| 이름 | 줄(타입 1RM%×횟수) | 안내 |
| --- | --- | --- |
| 일반 `straight` | 일반 ×8~10 ×3(무게는 지난 기록부터, 표시 없음) | 같은 무게·횟수로 여러 세트 |
| 탑세트+백오프 `topBackoff` | W 40%×10 · W 60%×5 · P 75%×2 · T 85%×3~6 · B 탑의 85%×6~8 | 탑세트는 한두 개 남기고 멈추기 · 백오프는 탑의 85% |
| 스트렝스 5×5 `fiveByFive` | W 40%×5 · W 60%×3 · P 70%×1~2 · 일반 80%×5 ×5 | 같은 무게로 5×5 · 다 성공하면 다음엔 직접 무게를 올려요 |
| 피라미드 `pyramid` | W 40%×10 · 65%×10~12 · 72%×8~10 · 78%×6~8 · 84%×4~6 | 무게를 올리며 횟수를 줄여요 · 마지막 세트는 횟수가 줄어도 괜찮아요 |
| 역피라미드 `reversePyramid` | W 40%×10 · W 60%×5 · P 75%×1 · T 84%×4~6 · B 탑의 90%×6~8 · B 탑의 80%×8~10 | 가장 무거운 세트를 먼저 |
| 드롭세트 `dropSet` | W 40%×10 · 70%×8~12 ×2 · D 52%×최대 · D 38%×최대 | 마지막에 쉬지 않고 무게를 내려 한계까지 · 시간 절약 |

- 드롭세트는 바벨류(barbell·smith·ezbar·trapbar)·맨몸에서 고를 수 없다. 다음 세트가 드롭이면 휴식 타이머를 띄우지 않는다.
- 맨몸·어시스트 종목(무게 칸 없음)은 무게 기준 없이 타입·횟수만 채운다.

#### 목업과 달라진 점(보고서 3절 대비)

- 용어 「운동법」 → 「세트 방식」(사용자 허락 id=1171).
- 피더 글자 F → P(F 는 운동 화면의 실패 세트).
- 무게 기준: 「지난 최고 작업 세트의 %」 → 「추정 1RM 의 %」(횟수가 다른 세트에 같은 무게가 채워지지 않게).
- 탑세트 횟수 「최대」 → 3~6회(무거운 세트를 실패까지 하지 않게). 「최대」는 드롭 줄만.
- 기록 상세 태그는 세트 방식 이름만(「오늘만」은 기록으로 알 수 없어 뺀다).
- DB 칸을 늘리지 않고 처방 JSON 안에 넣는다.

#### 함수(`setSchemes.ts`)

- `schemeRows(id, opts)` → 틀 줄(`scheme` 표시 포함). `opts.allowLoad=false` 면 무게 기준 없음.
- `schemeOf(rows)` → `SchemeId | null` · `isSchemeEdited(rows)` → boolean.
- `schemeAllowed(id, equipment)`.
- `remainingSchemeRows(id, doneSets, opts)` — 운동 중 바꾸기. 끝낸 웜업 수만큼 틀의 웜업을, 끝낸 작업 세트 수만큼 틀의 작업 줄을 앞에서 뺀다. 작업 세트를 이미 했으면 남은 웜업·피더도 뺀다.
- `resolveWorkLoadKg(pct, baseKg, equipment, unit)` — 반올림은 `roundLoadKg`.

#### 루틴 편집(`PrescriptionRows` mode=routine)

- 종목 표 위에 「세트 방식: <이름> ▾」 칩과 안내 한 줄(피더가 있으면 「P = 피더」 범례). 이름은 방식 · 고쳤으면 「· 수정함」 · 표시 없는 일반 모양이면 「일반」 · 그 밖은 「직접 구성」.
- 칩을 누르면 세트 방식 시트(이름 + 고르는 기준 한 줄, 기구 제한은 흐리게·누를 수 없음). 고르면 표 전체가 틀로 바뀌고 「세트 표를 바꿨어요 · 되돌리기」가 뜬다(직전 표로).
- 줄의 … 버튼과 강도 목표 줄을 없앤다. 세트 번호 버튼 44px. 번호 시트 = 일반·웜업·피더 (P)·탑·백오프·드롭 + 세트 삭제(줄이 2개 이상일 때).
- 1RM % 줄: 추정 1RM 이 있으면 칸에 계산 kg(회색), 줄 밑에 「1RM 추정 Nkg의 75%」. 없으면 빈칸과 「1RM의 75% · 첫 기록 뒤 계산」. 백오프 줄 밑은 「탑×85%」. 칸에 숫자를 넣으면 그 줄은 시작 무게(start)가 된다(수정함).
- 「최대」 줄은 횟수 두 칸 대신 「최대」 한 칸. 숫자를 실제로 넣어 저장할 때만 풀린다.
- 옛 처방(고정·RIR 목표)은 계산 그대로, 줄 밑 작은 글씨로만 보인다.
- 코칭(mode=coach)은 지금 화면 그대로다(피더는 보이지 않는다 — 코칭 계약에 없다).

#### 운동 화면

- 피더: 저장소 `setSetType('feeder')` = `set_type='feeder'`+`is_warmup`. 표시 P(운동 화면·잠금화면·슈퍼셋 순번). 타입 시트에 피더. 휴식 90초.
- 세트 방식 줄은 횟수도 처방 값이 지난 기록보다 먼저다(구조가 다른 지난 기록이 자리를 잘못 채우지 않게). 무게는 기존 순서(처방 무게 → 지난 기록).
- 종목 머리 아래 세트 방식 이름·안내 한 줄. 「최대」 줄은 처방 줄에 「최대」.
- ⋮ 메뉴 「세트 방식 바꾸기」 → 시트(맨 위 「루틴에 정한 방식」, 「끝낸 N세트는 그대로 · 남은 M세트를 다시 짜요」 미리보기). 체크 안 한 세트에 사람이 고친 값이 있으면 한 번 더 확인. 한 번의 쓰기로 체크 안 한 세트 삭제 → `remainingSchemeRows` 로 새 세트 생성 → 번호 다시 매김 → 처방 = [끝낸 세트 줄 + 새 줄], 모든 줄에 새 방식 표시. 새 세트 무게는 1RM % 로 계산(없으면 첫 작업 세트 뒤 채움).
- 세트 추가·삭제 때 처방이 있으면 같은 쓰기에서 처방 줄도 넣고 뺀다(자리 짝이 어긋나지 않게).

#### 운동 후

- `RoutineLine.scheme`·`SessionBlock.scheme` 을 더한다. 다르면 변경 `{kind:'scheme', from, to}`(기본 체크, 문구 「<종목> 세트 방식 일반 → 드롭세트」).
- 반영: 루틴 줄의 처방을 **새 틀 전체**(`schemeRows(to)`, 종목 기구로 allowLoad·`schemeAllowed` 검사)로, 세트 수를 그 줄 수로. `to` 가 없으면(일반·직접 구성) 처방을 지우지 않고 그대로 둔다(항목도 만들지 않는다). 반영 비교에 처방을 넣는다.
- 처방 루틴 잠금(`canApply`)을 푼다. 처방이 있는 줄은 세트 수 변경 항목을 만들지 않는다(세트 수는 처방이 정한다 — D5 의 이유). 잠금 문구는 [원본]으로 막는다.
- 기록 상세: 종목 이름 옆 세트 방식 태그.

#### 서버(코칭)

- `PrescribedSet` 에 `Scheme`·`Amrap` 필드, `setType` 에 feeder, 모르는 방식 이름은 버린다.
- 코치 저장 때 줄 수가 같으면 회원 줄의 값을 되살린다: 피더는 코치 값이 일반일 때만, 최대는 코치 횟수가 비었을 때만, 방식 이름은 비었을 때만.

### 작업 단계

#### Phase 1 — core 세트 방식 정의와 처방 데이터

- [x] `src/core/src/domain/prescription.ts`: feeder·amrap·scheme·pctWork(정리 규칙 포함)
- [x] `src/core/src/domain/setSchemes.ts`: 틀·적용·판정·운동 중 남은 줄·무게 계산
- [x] `src/core/src/domain/routineSets.ts`: 뜻 판정(scheme·amrap)
- [x] 서버 `src/backend/internal/coaching/report.go`·`src/backend/internal/coaching/prescription.go`: 새 필드·보존
- [x] 시험: core `src/core/src/domain/__tests__/setSchemes.test.ts`·처방 정리, Go 시험
- [x] 세트 방식 저장 왕복에서 「최대」 줄이 블록 횟수를 물려받지 않게(`src/core/src/domain/routineSets.ts`)

완료 기준: core·Go 시험 통과, 타입 검사 통과.

#### Phase 2 — 루틴 편집 화면

- [x] `src/frontend/app/components/routines/PrescriptionRows.tsx`: 세트 방식 칩·시트·되돌리기, … 메뉴·강도 목표 제거(routine), 번호 시트에 피더·삭제, 「최대」·% 표시
- [x] `src/frontend/app/components/routines/RoutineEditor.tsx`: 기구·지난 기록 기준 무게 전달
- [x] 문구(ko·en)
- [x] 기존 e2e 고침: `src/frontend/e2e/set-table.spec.ts`(… 메뉴·강도 목표·다섯 타입), `src/frontend/e2e/session-assist.spec.ts`(% 처방을 … 메뉴 대신 시드로)

완료 기준: 루틴에서 세트 방식을 고르고 저장·다시 열었을 때 표가 같다(e2e).

#### Phase 3 — 운동 화면

- [x] 시작 채우기 `pctWork`·세트 방식 횟수 우선
- [x] 피더 타입(저장소·표시·타입 시트·휴식)
- [x] 세트 방식 이름·안내·「최대」 표시
- [x] ⋮ 「세트 방식 바꾸기」(저장소 함수 + 시트 · 확인 · 루틴에 정한 방식)
- [x] 세트 추가·삭제 때 처방 줄 맞추기 · 다음 세트가 드롭이면 휴식 없음

완료 기준: 탑세트 루틴을 시작하면 무게가 지난 최고 기준으로 채워지고, 탑세트를 끝내면 백오프가 채워진다. 운동 중 바꾸면 끝낸 세트는 그대로다(e2e).

#### Phase 4 — 운동 후 반영과 기록

- [x] 세트 방식 변경 항목·반영(새 틀 전체·기구 검사)·처방 루틴 잠금 해제 · `src/core/src/domain/__tests__/routineDiff.test.ts` 고침
- [x] 기록 상세 태그

완료 기준: 운동 중 바꾼 세트 방식을 반영하면 루틴에 남고, 오늘만이면 루틴은 그대로다(e2e).

#### Phase 5 — 통합 시험과 배포

- [ ] 기존 e2e(세트 표·코칭·운동 보조) 회귀 확인과 수정
- [ ] 버전 올림·배포(운영)

완료 기준: 전체 시험 통과, 운영 배포 후 화면 확인.

### 수용 기준

- SRS-105: 세트 방식을 고르면 세트가 한 번에 바뀌고 되돌릴 수 있다 · … 메뉴와 강도 목표가 없다 · 번호 시트에 피더·삭제 · 운동 중 바꾸면 남은 세트만 바뀐다 · 운동 후 반영/오늘만 · 처방 루틴도 반영 · 기록에 세트 방식 태그.

### 테스트 계획

- core 단위: 틀 줄 수·타입·%·amrap, schemeOf·수정함 판정, 기구 제한, 남은 줄 계산(웜업만 함·작업 세트 함·다 함), 무게 반올림, 처방 정리(모르는 값 버림·범위), 변경 항목·반영 계획(처방 줄 세트 수 제외).
- Go: 정리 규칙·보존 함수.
- e2e: 루틴 만들기(세트 방식 고르기·되돌리기·저장 왕복·번호 시트 삭제) → 운동 시작(무게 채움·탑 후 백오프) → 운동 중 바꾸기 → 완료 반영/오늘만 → 기록 태그. 기존 `src/frontend/e2e/set-table.spec.ts`·`src/frontend/e2e/coaching.spec.ts`·`src/frontend/e2e/session-assist.spec.ts` 회귀.

### 위험·주의

- 처방은 사람이 쓴다(ADR-028): 세트 방식은 사람이 고른 틀이고, 앱이 몰래 처방을 바꾸지 않는다. 운동 중 무게 채움은 지금의 「1RM %·탑셋 %」와 같은 계산이며 사용자가 고칠 수 있다.
- 추정 1RM 은 지금 기능과 같이 지난 기록 전체의 최고값이다. 오래 쉬었으면 무게가 높게 나올 수 있다 — 칸은 고칠 수 있고, 안내에 계산 근거가 보인다.
- 옛 앱(배포 전 번들)이 세트 방식 루틴을 저장하면 피더가 일반으로, 방식 이름·최대가 빠진다. 기록은 안전하고 표시 정보만 준다(REV-074 보류).
- 코칭 계약(protobuf)에 새 값이 없다 — 서버 보존 함수가 지킨다. 코치가 줄 수를 바꾸면 지키지 못한다.
- 운동 중 바꾸기는 체크 안 한 세트를 지운다 — 미리보기와 확인으로 막는다.
