# SPEC-023 — 루틴 세트 표와 세트 타입 통일

> 타입 Spec · 그룹 할일/루틴-세트표 · ADStudio가 `SPEC-023.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **refs_legacy** → PLM:SRS-043, PLM:SRS-046, PLM:SRS-063, PLM:SRS-075

## 루틴 세트 표와 세트 타입 통일

### 목표

할 일 #T5를 구현합니다. 루틴을 짤 때도 운동 화면처럼 세트를 줄 단위로 설정하고, 세트 타입을 두 화면에서 같게 합니다. 강도 목표는 운동마다 하나만 선택으로 둡니다. 운동 화면은 가이드를 빼고 「오늘 근육」을 헤더로 옮깁니다. 새 루틴을 완료 없이 벗어나면 만들어지던 오작동을 고칩니다.

사용자 결정(2026-11-04): 세트 표 + 운동당 강도 목표 하나, 강도는 RIR만 「여유 N회」로 표기, 뒤로 가면 내용이 있을 때만 묻고 비어 있으면 버림. 코칭 화면도 같은 방식으로 맞춥니다.

### 범위

- 도메인: `src/core/src/domain/prescription.ts`, 새 파일 `src/core/src/domain/routineSets.ts`, `src/core/src/data/workoutRepository.ts`, `src/core/src/data/routineRepository.ts`, `src/core/src/i18n/locales/ko.ts`, `src/core/src/i18n/locales/en.ts`
- 계약·서버: `src/proto/coaching/v1/coaching.proto`, 생성물, `src/backend/internal/coaching/prescription.go`와 enum 번역 코드
- 운동 화면: `src/frontend/app/components/session/SetRowEdit.tsx`, `src/frontend/app/components/session/ExerciseBlock.tsx`, `src/frontend/app/components/session/ActiveWorkout.tsx`, `src/frontend/app/components/session/SessionGuides.tsx`, `src/frontend/app/components/session/TodayMuscleSheet.tsx`
- 루틴·코칭: `src/frontend/app/components/routines/PrescriptionRows.tsx`, `src/frontend/app/components/routines/RoutineEditor.tsx`, `src/frontend/app/components/coaching/PrescriptionEditor.tsx`
- 시험: 위 기능을 쓰는 `src/frontend/e2e/*.spec.ts`와 core 단위 시험

범위 밖: 운동팁 탭, RPE, 강도 범위(여유 1~2회처럼 두 값), 앱 강제 종료·새로고침·탭 닫기 때의 새 루틴 정리, 지난 기록을 세트 타입별로 맞추기, DB 스키마 변경.

### 설계

#### 세트 타입

- 공통 타입은 일반·웜업·드롭·탑·백오프 5개입니다. `PrescribedSetType`에 `drop`을 더합니다. 코어 정리 함수, Go `validSetTypes`와 `src/backend/internal/coaching/handler.go` 번역, proto `SET_TYPE_DROP = 5`, 화면 enum 번역을 함께 고칩니다. `REST_BY_TYPE`에는 드롭 값을 두지 않아 블록 휴식을 씁니다. 요약 글자는 `D`입니다.
- 세션 시작 때 처방 `drop`은 `isDrop=true`로 심고 `setType` 칸은 비웁니다(가져오기와 같은 방식). 볼륨 계산은 지금처럼 드롭을 작업 세트로 더하며 이번에 바꾸지 않습니다.
- `setSetType`은 타입별로 네 칸을 함께 맞춥니다.

| 타입 | isWarmup·isDrop·isFailed | setType |
| --- | --- | --- |
| 일반 | 모두 false | null |
| 웜업 | isWarmup만 true | warmup |
| 드롭 | isDrop만 true | null |
| 탑·백오프 | 모두 false | top·backoff |

- 메뉴의 선택 표시는 세트 번호 라벨과 같은 우선순위로 판단합니다. 백오프 라벨 `B`를 운동 화면과 잠금 화면(`src/core/src/domain/lockScreen.ts`)에 함께 더합니다.
- 메뉴에서 실패와 플레이트 계산을 뺍니다. 플레이트 계산은 다른 경로가 없어 기능이 없어지며, 이 계산만 쓰던 프로필의 봉 무게 설정도 숨깁니다. `isFailed` 칸과 F 표시, 볼륨 제외 규칙은 옛 기록을 위해 그대로 둡니다. 옛 실패 세트는 메뉴에서 다른 타입을 고르면 풀립니다.
- 처방 무게 채우기(`planPrescribedLoadFills`)는 처방 줄 대신 세트의 현재 타입을 보고, 드롭 세트를 기준에서 뺍니다. 그래야 세션에서 바꾼 타입을 따릅니다. 「그대로 다시 시작」은 지금처럼 처방을 복사하므로 세션에서 바꾼 타입이 이어지지 않습니다.
- 표에 무게를 넣은 줄(시작 값·고정)에는 다음 세트 무게 제안을 띄우지 않습니다.

#### 표의 무게 규칙

규칙을 하나로 둡니다. **표의 무게는 시작 값이고, 지난 기록이 있으면 지난 기록이 먼저입니다.**

- 새 무게 기준 `start`를 더합니다. 입력칸 값 그대로(사용자 단위를 kg로 바꾼 값, 플레이트 배수 환산 없음) 저장하고, 세션 시작에서 `지난 기록 → start → targetWeightKg → 기본값` 순서로 채웁니다. 맨몸·어시스트 종목에는 적용하지 않습니다.
- 지난 기록을 이겨야 하는 줄은 사용자가 줄 메뉴에서 「이 무게로 고정」을 고릅니다. 기존 `fixed`이며 줄에 「고정」 표시를 붙입니다. 무게가 같다고 자동으로 빼지 않고, 줄을 고치지 않으면 옛 `fixed`·% 기준·`loadHint`를 그대로 둡니다.
- 표 위에 안내 한 줄을 늘 둡니다: 「지난 기록이 있으면 지난 기록부터 시작해요」.
- 옛 번들과 서버 정리는 `start`를 모르므로 기준을 버리고 `targetWeightKg`로 시작합니다. 코칭 경로에는 `start`를 쓰지 않습니다.
- lb 왕복의 꼬리를 막기 위해 `fixed`의 소수 자릿수를 코어·Go 모두 넷째 자리로 올립니다.

#### 세트 표(코칭과 공용)

`PrescriptionRows`를 세트 표로 바꿉니다. 카드 안 약 294px에 맞춥니다: 타입 한 글자 34 · 무게 78 · 횟수 최소 54 · 최대 54 · 줄 메뉴 44, 입력칸 높이 44px, 안쪽 세로 스크롤 없음.

- 타입 버튼은 운동 화면과 같은 `ActionSheet`를 엽니다.
- 줄 메뉴는 `ActionSheet`로 시작 값·이 무게로 고정·1RM %·탑세트 %·삭제를 고릅니다. % 기준이면 무게 칸이 % 입력으로 바뀌고 범위 규칙은 지금과 같습니다.
- 표 아래 버튼: 「세트 추가」(마지막 줄의 무게·횟수 복사, 타입 일반), 「웜업 추가」(맨 앞에 빈 웜업 줄). 최대 20줄, 최소 1줄입니다.
- 무게를 고친 직후 다른 일반 세트의 값이 다르면 「나머지 일반 세트도 N」 버튼을 한 번 보여 줍니다.
- 맨몸·어시스트 종목은 줄의 무게 칸 없이 기존 `re-weight` 스테퍼 하나를 유지합니다.
- 저장 시점: 숫자 칸은 줄 id별 초안을 두고 blur·Enter에 저장합니다. 타입·메뉴·추가·삭제는 즉시 저장합니다. 쓰기는 직렬화하고, 완료·시작·이탈은 활성 칸을 blur한 뒤 쓰기가 끝나길 기다립니다.
- 동기 수신을 표에 반영하도록 처방·세트 수·무게 칸 변경을 관찰합니다. 포커스 중인 칸은 덮지 않습니다.
- 무게는 사용자 단위와 한쪽 입력 라벨로 보여 줍니다.

#### 저장 변환(순수 함수, `src/core/src/domain/routineSets.ts`)

- `rowsFromRoutineLine(line)`: 처방이 있으면 그 줄을, 없으면 `targetSets`개의 일반 줄을 만듭니다. 줄 무게는 `loadKg`, 없으면 `targetWeightKg`입니다. 횟수는 `repMin/Max`, 없으면 루틴 횟수입니다.
- `routineLinePatch(rows, line)`: `{ targetSets, targetWeightKg, targetRepsMin, targetRepsMax, prescription }`을 돌려줍니다.

  - `targetWeightKg`는 첫 작업 세트(탑 우선)의 시작 값입니다. 직접 입력 무게가 없으면 `line`의 값을 유지합니다(맨몸·전 줄 %).
  - 그 값과 같은 `start` 줄은 기준을 빼고, 횟수도 같은 방식으로 묶습니다. 남는 값이 없으면 `prescription`은 null이어서 옛 루틴과 같은 모양입니다.
  - `rxMeaningful`은 `loadHint`까지 뜻으로 봅니다.
- `effortGoalOf(rows)`와 `withEffortGoal(rows, rir)`: 웜업·드롭을 뺀 줄의 `targetRir`을 읽고 씁니다. 값이 섞여 있으면 「세트마다 다름」으로 보이고, 고르기 전까지 바꾸지 않습니다.
- 저장소 `setRoutineExerciseSets(id, patch)`는 이 값들을 한 번의 쓰기로 저장합니다.

#### 코칭 저장

코칭 계약에는 목표 무게 칸이 없으므로 `routineLinePatch`를 쓰지 않습니다. 줄 값을 그대로 보내고, 무게가 있는 줄은 `fixed`로 저장합니다(지금의 코치 처방과 같은 뜻). 코치도 세트별 RIR 칸 대신 강도 목표 칩을 씁니다. 옛 세트별 값은 고르기 전까지 유지합니다. 회원 루틴의 `start` 줄은 코칭 화면에서 기준 없음으로 보입니다.

#### 강도 목표

- 세트 표 아래에 칩을 둡니다: 없음·여유 0회·1회·2회·3회·4회. 기존 값(5·6)은 지우지 않고 그 값 칩을 더해 보여 줍니다.
- 운동 화면의 `session.rxRir`과 힘든 정도 칩의 목표 문구(`effort.chipTarget` 계열)를 「여유 N회」로 바꿉니다. 저장 형식은 숫자 하나입니다.

#### 끝낼 때 세트 수 시트

`targetSets`는 웜업 줄을 포함하므로, 세트 수 비교(`src/core/src/domain/routineDiff.ts`)에서 처방의 웜업 수를 뺍니다. 표에 웜업을 넣었다고 매번 시트가 뜨지 않게 합니다. 처방이 있는 루틴의 반영 차단 범위는 바꾸지 않습니다.

#### 운동 화면

- `SessionGuideButtons` 줄을 뺍니다. 가이드 문구(i18n)와 `GuideModal`은 운동팁 탭을 위해 남깁니다.
- 헤더의 이름 영역과 일시정지 사이에 「오늘 근육」 아이콘 버튼을 둡니다. `aria-label`로 이름을 주고, 보이는 크기는 작게 두되 `::before`로 누르는 자리를 44px로 넓힙니다. 설정이 꺼져 있으면 그리지 않습니다. 시트와 데이터는 그대로입니다.
- 360px 폭을 위해 헤더 간격을 4px로, 완료 버튼 여백을 줄이고, 이름·볼륨 줄이 말줄임되도록 고칩니다.

#### 새 루틴 벗어나기

새 루틴(`paramId`가 없음)이고 완료·시작을 누르지 않았을 때만 적용합니다. 기존 루틴의 자동 저장은 그대로입니다.

- **경로:** 앱바 뒤로, 기기·브라우저 뒤로(가드 칸, `ExercisePickerScreen`과 같은 토큰 규약), 화면 안 링크(캡처 단계 click)를 가로챕니다.
- **열린 시트:** `Overlay`가 열린 수를 셉니다. 시트가 열린 채 뒤로 가면 가드 칸을 다시 쌓고 맨 위 시트만 Escape로 닫습니다. 확인창이 열린 채 뒤로 가면 「계속 편집」과 같습니다.
- **판정 전 대기:** 활성 칸 blur, `creatingRef`, 종목 추가와 표 쓰기가 끝나길 기다린 뒤 판정합니다. 앱바의 이름 저장은 판정 뒤로 옮기고, `exitingRef`로 이후 쓰기를 막습니다.
- **판정:** 이름·메모·폴더·종목 중 하나라도 있으면 확인창을 띄웁니다: 「저장하지 않고 나갈까요?」, [나가기] [계속 편집]. 없으면 묻지 않습니다.
- **버리기:** 판정과 무관하게 만들어 둔 행이 있으면 지웁니다. 이미 서버에 올라갔을 수 있으므로 삭제 표식이 전파되도록 삭제 뒤 동기화를 부릅니다.
- **칸 정리:** 이동 전에 가드 칸을 걷고, 새 루틴 화면의 모든 이탈(나가기·완료·시작·메뉴 삭제)은 `location.replace`로 이동해 `/routines/new`로 되돌아오지 않게 합니다.

### 구현 중 바뀐 점(REV-028)

- 표에서 비운 무게 칸은 다른 줄에 무게가 있으면 `{start, loadKg: 0}` 표식으로 남깁니다. 다시 열어도 빈칸이고, 운동을 시작하면 블록 값을 물려받지 않고 지난 기록이나 기본값으로 시작합니다.
- 웜업·드롭 값은 블록 값(`targetWeightKg`, 횟수)이 되지 않습니다.
- 고정 무게는 저장값이 합계입니다. 한쪽 입력 종목의 표에서는 칸에 나눠 보이고 저장할 때 곱합니다. 시작 값은 입력값 그대로입니다.
- 코치 저장은 회원 줄의 `start`를 지우지 않습니다. 줄 수가 같고 코치가 그 줄에 무게 기준을 정하지 않았을 때 서버가 이어 받습니다(`src/backend/internal/coaching/prescription.go`).

### 작업 단계

#### Phase 1 — 타입·변환·계약

- [x] `drop` 타입(코어·Go·proto·생성물·번역)과 세션 심기, `setSetType` 확장
- [x] `src/core/src/domain/routineSets.ts`, `setRoutineExerciseSets`, `start` 기준과 세션 채우기 순서
- [x] `planPrescribedLoadFills`·제안 조건·잠금 화면 라벨·`routineDiff` 웜업 보정·소수 자릿수
- [x] i18n 문구
- 완료 기준: `make verify`, `go test ./internal/coaching/...` 통과. 단위 시험: 변환 왕복(lb·한쪽 배수 포함)·강도 목표·옛 처방 보존·`drop` 정리(Go 번역 포함)

#### Phase 2 — 운동 화면

- [x] 타입 메뉴 정리와 `B` 표시
- [x] 가이드 줄 제거, 오늘 근육 헤더 이동
- [x] 프로필 봉 무게 설정 숨김
- [x] 관련 e2e 갱신(가이드 좌표를 기준으로 삼는 시험은 다시 작성, `src/frontend/e2e/opengym-muscle.spec.ts`, `src/frontend/e2e/opengym-rir.spec.ts`, `src/frontend/e2e/session-assist.spec.ts`, `src/frontend/e2e/session.spec.ts`)
- 완료 기준: 위 e2e 통과, 360px에서 `1:00:00`·긴 이름·큰 볼륨일 때 가로 넘침 없음과 누르는 자리 44px를 시험으로 확인, 사진 확인

#### Phase 3 — 루틴·코칭 세트 표

- [x] 세트 표, 강도 칩, `RoutineEditor` 연결(세트·무게 스테퍼와 처방 시트 대체)
- [x] 코칭 편집기를 세트 표로 교체
- [x] 관련 e2e 갱신과 추가: 표에서 웜업·탑·드롭·횟수·강도를 설정 → 시작하면 운동 화면에 같은 타입·무게·목표가 나타남
- 포커스를 둔 채 시작해도 입력값이 반영되는 시험과 지난 기록 우선 시험을 포함합니다.
- 완료 기준: `src/frontend/e2e/routines.spec.ts`, `src/frontend/e2e/coaching.spec.ts`, `src/frontend/e2e/history-replay.spec.ts`, `src/frontend/e2e/creator-routines.spec.ts`, `src/frontend/e2e/declutter-p4.spec.ts` 통과, 360px 사진 확인

#### Phase 4 — 새 루틴 벗어나기

- [x] 판정·확인창·삭제와 세 가지 이탈 경로
- [x] e2e: 내용 있음(나가기·계속 편집), 비어 있음, 폴더 「없음」만 누름, 종목 넣었다 뺌, 추가 중 이탈, 브라우저 뒤로·연타, 시트·피커·확인창이 열린 채 뒤로, 탭 막대, 나가기·완료·시작 뒤 뒤로 가도 갇히지 않음, 완료 후에는 남음, 기존 루틴은 묻지 않음
- 완료 기준: 위 e2e 통과, 나간 루틴이 동기화·새로고침 뒤에도 목록과 서버에 없음

### 수용 기준

1. 루틴과 운동 화면의 세트 타입 메뉴가 일반·웜업·드롭·탑·백오프로 같고, 실패·플레이트 계산이 없습니다.
2. 옛 실패 세트의 F 표시와 볼륨 제외는 그대로입니다.
3. 루틴에서 세트별로 타입·무게·횟수를 설정하면, 지난 기록이 없을 때와 고정 줄은 그대로 시작합니다. 지난 기록이 있으면 무게·횟수는 지난 기록이 우선하고 타입은 표를 따릅니다.
4. 강도 목표를 하나 고르면 웜업·드롭을 뺀 세트에 「여유 N회」가 보입니다. 힘든 정도 기록을 켜도 같은 표기입니다.
5. 옛 처방(% 기준, 고정 무게, 중량 힌트, 세트별 다른 RIR)이 깨지지 않고, 그 값을 고치기 전에는 바뀌지 않습니다.
6. 운동 화면에 RIR·웜업 가이드 버튼이 없고, 오늘 근육은 스크롤과 무관하게 헤더에서 열립니다.
7. 화면 안 경로(앱바·기기 뒤로·탭 막대)로 완료 없이 벗어난 새 루틴은 기기와 서버에 남지 않으며, 내용이 있으면 먼저 묻습니다.
8. 코칭 편집기도 같은 세트 표를 쓰고 저장 값이 서버를 왕복합니다.

### 테스트 계획

단위: `src/core/src/domain/__tests__/`에 변환·타입 시험, Go `service_test.go`에 `drop` 시험. e2e: 위 단계별 파일. 로컬 운영 빌드(웹 3220·API 3221·PG 55470)에서 실행하고, 코칭 왕복은 같은 서버로 확인합니다. 앱 안 확인은 웹뷰 공유 코드라 에뮬레이터로 세트 표 화면만 봅니다.

### 위험·주의

- 옛 번들 기기는 `drop`을 `normal`로 읽고 `start`를 버립니다. 그 기기에서 다시 저장하면 해당 값이 없어집니다.
- 지난 기록은 타입이 아니라 세트 자리로 맞춥니다(기존 동작). 있던 루틴에 웜업 줄을 맨 앞에 넣으면 다음 한 번은 줄별 값이 밀려 보일 수 있습니다.
- 강도는 저장 형식과 proto가 숫자 하나라 범위를 넣지 않습니다. 질문 때 예시로 든 「여유 1~2회」와 달리 한 값만 고르며, 탑과 백오프에 다른 강도를 줄 수 없습니다.
- 처방이 있는 루틴은 끝낼 때 루틴 전체 반영이 지금처럼 막힙니다. 표를 쓰면 이런 루틴이 늘어납니다.
- 플레이트 계산은 요청대로 없어지며 대체 화면을 만들지 않습니다.
- 앱 강제 종료·새로고침·탭 닫기로 벗어나면 만들던 새 루틴이 남을 수 있습니다.
