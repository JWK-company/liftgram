# /qa code — 운동 화면 보조(묶음 1) · 커밋 3e549b1

- 대상: `git show 3e549b1`의 `src/` 전부 (SRS-061 PR 칩·기록 바로잡기 / SRS-062 슈퍼셋 함께 완료 / SRS-063 처방 무게 기준)
- 스펙: `.ouroboros/docs/spec/20261027_session-assist/spec.md` (+ 「/qa spec 반영」 Q1~Q8)
- 참여 전문가
  - **오프라인 데이터·동기 아키텍트** (WatermelonDB/LokiJS, Go 코칭 서버, 직렬화 하위호환)
  - **운동 도메인·PR 로직 검토관** (1RM 추정, PR 판정, 처방 계산, 원판 단위)
  - **모바일 웹 상호작용 QA** (터치·길게 누르기, 입력 커밋 경합, 테스트 커버리지)
- 실행 확인: `make verify` 통과(lint·typecheck·core 단위 255건·카탈로그·문서), `go test ./internal/coaching/` 통과.
  e2e(`session-assist.spec.ts`)는 이번 검토에서 돌리지 않았다.
- 코드는 수정하지 않았다.

## 총평

기능의 큰 흐름(칩 2종, 기록 상세 편집 후 재계산, 묶음 한 번의 write, 처방 계산을 순수 함수로 분리, Go와 앱의 범위 상수 일치)은 스펙대로 구현됐다.
**치명 결함은 없다.** 다만 아래 두 가지는 배포 전에 고쳐야 한다.

1. 기록이 없을 때 「1RM의 N%」를 **워밍업 세트로 추정**해 채운다. 처방이 「워밍업 → 1RM 80%」 모양이면 거의 항상 엉뚱하게 가벼운 무게가 들어간다.
2. 운영 DB에 이미 저장된 PascalCase 처방(`SetType`…)은 서버만 제대로 읽는다. 앱은 여전히 전부 「일반 세트」로 읽는다.

PR 재계산은 규칙은 맞지만 비용이 O(이후 운동 수 × 종목 수 × 전체 운동 수)이다. 운동 중 화면의 PR 캐시도 무효화되지 않는다.
테스트는 순수 함수만 확인하고, 저장소 함수(재계산·채움·묶음)의 결함 시나리오는 막지 못한다.

| # | 심각도 | 요약 |
|---|--------|------|
| H1 | 높음 | 기록 없는 pct1rm 채움이 워밍업·실패 세트로도 1RM을 추정 → 과소 무게로 고정 |
| H2 | 높음 | 운영의 옛 PascalCase 처방 JSON — 앱 읽기 하위호환·백필 없음(서버는 대소문자 무시로 정상) |
| M1 | 중간 | `recomputeWorkoutTotals` 비용 O(L×G×W) + 무관한 운동도 다 계산한 뒤에 건너뜀 |
| M2 | 중간 | 기록 상세에서 고친 뒤 `liveHistCache` 무효화 없음 → 진행 중 세션의 PR 축하 오판 |
| M3 | 중간 | 슈퍼셋 「같은 번호」가 `set_number`(워밍업 포함) 기준 → 표시 번호와 다른 세트를 완료 |
| M4 | 중간 | 묶음 완료 때 누른 칸이 비었거나 잘못된 입력이면 무게·횟수 0을 저장 |
| M5 | 중간 | 묶음 완료 때 다른 멤버의 탑셋 → 백오프 % 채움·제안이 돌지 않음 |
| M6 | 중간 | 테스트 공백 — 저장소 함수의 결함 시나리오 미검증 |
| L1~L9 | 낮음 | 아래 표 |

---

## 높음

### H1. 기록 없는 「1RM의 N%」를 워밍업 세트로 추정해 채운다
- **파일:줄**: `src/core/src/data/workoutRepository.ts:544`(`estimateFromSet(doneCalcKg, doneReps)`), `:555`, `:567-569`(`isWarmup:false` 고정). 호출부 `src/frontend/app/components/session/ExerciseBlock.tsx:377`(완료한 세트가 어떤 타입이든 `kg>0`이면 호출).
- **원인**:
  - `fillPrescribedLoadsAfter`는 완료한 세트가 워밍업(처방 행 `setType:'warmup'` 또는 `isWarmup`)이든 실패 세트든 그 세트로 1RM을 추정한다.
  - `estimateFromSet`이 `isWarmup:false, isFailed:false`를 하드코딩해서 `bestEstimatedOneRepMax`의 「워밍업·실패 제외」 규칙을 우회한다.
  - 채운 세트는 `updated_at`이 바뀌어 「손댄 세트」가 된다(`:551`). 그래서 이후 진짜 작업 세트를 해도 다시 채워지지 않고 틀린 값이 남는다.
- **재현**:
  1. 기록이 없는 종목의 루틴 처방을 [워밍업, 워밍업, 탑 1RM 80%, 일반 1RM 75%]로 만든다.
  2. 운동을 시작한다. 1RM 칸은 기록이 없어 대기(pending)한다.
  3. 첫 워밍업 20kg×10을 완료한다. 추정 1RM = 20×(1+10/30) ≈ 26.7kg이다.
  4. 탑셋에 80% = 20kg(2.5 반올림), 다음 세트에 20kg이 채워진다. 근거 문구는 「추정 1RM 26.7kg의 80%」로 나온다.
  5. 이어서 탑셋 100kg×5를 해도 75% 세트는 이미 손댄 세트라 20kg에 머문다.
- **수정안**:
  - 완료 세트가 `rx[doneIdx]?.setType === 'warmup'`이거나 `done.isWarmup`·`done.isFailed`·`setType∈{warmup,failed}`이면 pct1rm 채움을 건너뛴다.
  - `estimateFromSet`에 실제 `isWarmup/isFailed`를 넘긴다.
  - (선택) 워밍업 다음 「첫 작업 세트」를 기다린다는 pending 문구를 넣는다.
  - 단위 테스트: 「워밍업 완료로는 pct1rm이 채워지지 않는다」.

### H2. 운영 DB의 옛 처방 JSON(PascalCase)을 앱이 여전히 「일반 세트」로 읽는다 — 하위호환 읽기·백필 없음
- **파일:줄**: `src/backend/internal/coaching/report.go:55-64`(태그 추가), `src/backend/internal/coaching/service.go:404`(저장), `src/core/src/domain/prescription.ts:36-54`(`o.setType`·`o.targetRir`… camelCase만 읽음), `src/core/src/db/models/RoutineExercise.ts:38`(`@json(..., sanitizePrescription)`이 읽을 때 정리).
- **사실 관계**(코드로 추론, 운영 DB는 접속하지 않음):
  - 코칭(`SetMemberPrescription`)은 v0.18.0부터 배포됐다(`git tag --contains eddc5e4`). 그때부터 트레이너가 저장한 처방은 태그 없는 `json.Marshal`이라 `{"SetType":"top","TargetRIR":2,"RepMin":5,"RepMax":8,"LoadHint":"heavy"}` 키로 `routine_exercises.prescription` 문자열에 들어갔다. 동기 레코드 jsonb 안에 있다.
  - sync 서버는 레코드를 opaque jsonb로 다루고, SQL에서 처방을 읽는 곳이 없다(`database/queries` grep 0건). 그래서 sync 경로는 영향이 없다.
  - **서버 읽기는 정상이다.** Go `encoding/json`은 키를 대소문자 무시로 매칭한다. `SetType`→`setType`, `TargetRIR`→`targetRir` 모두 읽힌다(스크래치 Go 프로그램으로 확인). 트레이너 화면·리포트는 옛 데이터도 바르게 보인다. 이번 커밋이 서버 읽기를 깨뜨리지는 않는다.
  - **앱 읽기는 여전히 틀린다.** `sanitizePrescriptionValue`는 `o.setType`만 본다. 옛 행은 전부 `setType:'normal'`·RIR/반복 null로 읽히고, 휴식·RIR 라벨·웜업 사다리가 사라진다.
  - 이 잘못된 값은 두 경로로 굳는다. 운동 시작 때 `we.prescription = re.prescription`(`workoutRepository.ts:781`)으로 정리된 값이 복사된다. 회원이 루틴 편집기에서 저장하면 정리된 「일반」 값으로 원본이 덮인다. 트레이너가 다시 저장하기 전에는 복구되지 않는다.
- **재현**: 운영과 같은 모양으로 `routine_exercises.prescription = "[{\"SetType\":\"top\",\"TargetRIR\":2}]"` 행을 동기로 받는다. 루틴 편집 시트에 「일반」이 보이고, 세션 시작 시 탑셋 휴식·RIR 라벨이 없다.
- **수정안**(권장 순서):
  1. **앱 읽기 하위호환**(필수, 싸고 멱등): `sanitizePrescriptionValue`에서 `o.setType ?? o.SetType`, `o.targetRir ?? o.TargetRIR`, `o.repMin ?? o.RepMin`, `o.repMax ?? o.RepMax`, `o.loadHint ?? o.LoadHint`로 읽는다. 단위 테스트 「PascalCase 옛 JSON → top·RIR 2로 읽힌다」를 추가한다.
  2. (선택) 서버 1회 백필: 코칭 감사 로그(`prescription_edit`)가 있는 회원의 `routine_exercises` 레코드를 `parsePrescription`→`json.Marshal`로 다시 쓰고 `updated_at`을 올린다. 기기가 다음 동기에서 받는다. 앱 하위호환이 있으면 필수는 아니다.
  3. 커밋 메시지의 「버그 수정」은 **새 저장분만** 해당한다고 PLM·릴리스 노트에 적는다.
- 참고: 새 태그는 `targetRir` 등을 `omitempty` 없이 `null`로 내보낸다. 앱의 `num(null)`→null이라 문제없다. 옛 앱 번들은 `loadBasis` 등 새 키를 무시하므로 읽기 쪽 하위호환은 성립한다. 다만 옛 번들로 저장하면 무게 기준이 지워진다(L9).

---

## 중간

### M1. `recomputeWorkoutTotals` 비용과 불필요한 계산
- **파일:줄**: `src/core/src/data/workoutRepository.ts:1372-1421`, `:1404`, `:1408`, `:1424-1441`.
- **원인**:
  1. 대상 이후의 **모든** 완료 운동마다 종목 그룹별로 `historicalSnapshotBefore`를 부른다. 이 함수는 매번 완료 운동 전체를 fetch하고 `Q.oneOf(prior ids)`·세트 조회를 한다. 비용은 O(L×G×W)이고, 운동 종목마다 세트를 따로 조회하는 N+1도 있다.
  2. `affectsLater`(이 종목이 들었는가) 판정은 **PR 계산을 다 한 뒤**(`:1408`)에야 한다. 무관한 운동도 전부 계산한 다음 버린다.
- **재현(추정, 실측 안 함)**: 완료 운동 300개인 사용자가 1년 전 운동의 세트를 고친다. 300 × 종목 6 × (300건 fetch + oneOf 쿼리 + 세트 쿼리)가 되어, 모바일 LokiJS에서 수 초~수십 초 동안 시트가 「저장 중」에 머문다.
- **수정안**:
  - 운동별로 `wes`를 읽은 직후 `touched`와 교집합이 없으면(대상이 아니면) 즉시 `continue`한다.
  - 완료 운동 목록·세트를 **한 번만** 읽어 시간순으로 훑으며 (종목×칸)별 누적 스냅샷을 갱신한다(prefix sweep, O(전체 세트)). `historicalSnapshotBefore`(보존)는 그대로 두고 새 함수를 추가한다(코드 보존 규칙 §3.6).
- **pr_count 범위(질문 2 답)**: 바뀌는 것은 대상 운동과, **고친 종목이 들어 있는** 이후 운동이다. 이 운동들은 다른 종목 그룹까지 엄격한 「이전만」 이력으로 다시 센다. 그래서 백데이트·기기 간 순서 역전 등으로 원래 값이 엄격 규칙과 달랐다면 **고친 종목과 무관한 종목의 PR 수도 바뀐다**(교정이지만 사용자에게는 설명 없는 변화다). 고친 종목이 없는 운동은 바뀌지 않는다. 동률은 `completedAt` 같으면 id 사전순으로 결정적이다. completedAt이 null인 운동은 0으로 취급되어 맨 앞으로 간다(낮음).

### M2. 기록을 고친 뒤 진행 중 세션의 PR 판정 캐시가 낡는다
- **파일:줄**: `src/core/src/data/workoutRepository.ts:1624`(`liveHistCache` — 모듈 전역, 무효화 지점 없음), `:1649-1653`.
- **재현**:
  1. 운동 중 PR 칩 ⓘ를 눌러 기록 상세로 이동한다(바로 이 기능의 동선).
  2. 잘못 남은 120kg 세트를 지운다.
  3. 세션으로 돌아와 105kg을 완료한다. 실제로는 새 PR이지만, 캐시된 이력에 120kg이 남아 축하가 나오지 않는다. 반대로 값을 올려 고쳤다면 거짓 축하가 나온다.
  4. 완료 시 `completeWorkout`은 캐시를 쓰지 않으므로 요약의 PR 수와 운동 중 축하가 어긋난다.
- **수정안**: `recomputeWorkoutTotals`(또는 `updateSetLog`·`deleteSetLog`가 완료 운동을 고칠 때)에서 `liveHistCache.clear()`를 호출한다. 세션 화면의 `getExercisePRs`도 세션 복귀 시 다시 읽게 한다(현재는 `variantKey` 변화 때만 읽는다).

### M3. 슈퍼셋 「같은 번호」가 `set_number` 기준이라 워밍업이 섞이면 짝이 어긋난다
- **파일:줄**: `src/frontend/app/components/session/ExerciseBlock.tsx:352`(`s.setNumber` 전달), `src/core/src/data/workoutRepository.ts:1095-1104`(`Q.where('set_number', setNumber)`). 표시 번호는 SetRowEdit의 「일반 세트만 번호가 오른다」 규칙이다.
- **재현**: A=[W, 1, 2, 3] (set_number 1~4), B=[1, 2, 3] (set_number 1~3)로 슈퍼셋을 묶는다. A의 화면 번호 「1」(set_number 2)을 체크하면 B의 「2」가 함께 완료된다. A의 「W」를 체크하면 B의 「1」이 완료된다. A의 「3」(set_number 4)은 B에 짝이 없어 B가 건너뛰어진다. 수행하지 않은 세트가 done으로 바뀌어 볼륨·PR에 들어간다.
- **수정안**: 짝짓기 키를 「작업 세트 순번」(워밍업·드롭 제외 ordinal)으로 바꾼다. 워밍업을 체크하면 이 종목만 완료한다. 스펙 D3 문구 「같은 번호」를 「화면에 보이는 같은 번호」로 명확히 한다. e2e에 「한쪽만 워밍업」 케이스를 추가한다.

### M4. 묶음 완료 때 누른 칸이 비었거나 잘못된 입력이면 0을 저장한다
- **파일:줄**: `src/frontend/app/components/session/SetRowEdit.tsx:172-175`(`|| 0`), `src/frontend/app/components/session/ActiveWorkout.tsx:632-636`, `src/core/src/data/workoutRepository.ts:1083-1084`(`>= 0`이면 기록).
- **원인**: 단독 경로(`setSetDone`)는 값을 쓰지 않는다. blur 커밋은 잘못된 입력을 원래 값으로 되돌린다. 그런데 묶음 경로는 화면 값 파싱 결과(빈칸 → 0)를 그대로 `weightKg`·`reps`에 쓴다.
- **재현**: 슈퍼셋 A 세트 1의 무게 칸을 지우고 다시 쓰려던 중에 체크를 누른다. A 세트 1이 0kg×(횟수)로 완료되고 저장된다. 횟수 칸을 비웠다면 0회다.
- **수정안**: `currentValues`가 파싱 실패를 `undefined`로 돌려주게 하고, 누른 칸도 draft와 같은 규칙(NaN이면 넘기지 않음)을 쓴다. 단독 경로의 `evalLiveSetPr` 인자와도 일관된다.

### M5. 묶음 완료 시 다른 멤버의 처방 % 채움·이어달리기 제안이 돌지 않는다
- **파일:줄**: `src/frontend/app/components/session/ExerciseBlock.tsx:352-400`(누른 블록의 `we.id`·`s.id`로만 `fillPrescribedLoadsAfter`·`suggestNextSetWeightKg` 호출), `ActiveWorkout.tsx:618-667`.
- **재현**: 슈퍼셋 B에 [탑, 백오프 탑셋 90%]가 처방돼 있다. A의 세트 1을 체크해 B의 탑셋이 함께 완료돼도, B의 백오프에는 90%가 채워지지 않고 제안 칩도 없다. B에서 직접 체크했을 때만 채워진다.
- **수정안**: `roundToggle`이 완료로 바뀐 각 멤버 세트에 `fillPrescribedLoadsAfter(r.workoutExerciseId, r.setLogId, e.weightKg ?? 저장값, e.reps ?? 저장값)`을 호출하거나, 채움을 저장소 `completeSupersetRound` 뒤 단계로 옮긴다. 근거 문구(loadNotes)는 블록 상태라, 결과를 멤버 블록에 전달할 경로가 필요하다(이벤트 또는 `onChanged` 후 재계산).

### M6. 테스트가 결함을 막지 못하는 지점
- `sessionAssist.test.ts`는 순수 함수(`pickPrSets`·`countMajorPrs`·`resolvePrescribedLoad`·`sanitizePrescriptionValue`)만 다룬다. `countMajorPrs` 테스트는 「앞선 기록만」을 **호출자가 넘긴 historyBest**로 확인할 뿐이다. 실제 이력 선별(`historicalSnapshotBefore`의 completedAt·동률·변형)은 검증하지 않는다.
- e2e(`session-assist.spec.ts`)는 해피 패스만 다룬다. 다음은 빠져 있다.
  - 재계산: 운동 3개를 시간순으로 두고 가운데를 고칠 때 이후 운동의 pr_count가 바뀌는지, 무관 종목은 그대로인지.
  - Q5 보호: 사람이 고친 백오프에 탑셋 %가 채워지지 않는지.
  - H1: 워밍업 완료로 pct1rm이 채워지지 않는지.
  - H2: PascalCase 옛 처방 읽기.
  - M3: 워밍업이 섞인 슈퍼셋 짝.
  - M4: 빈 입력 상태로 묶음 체크.
  - lb 사용자: 반올림, 칩 채움 표시.
  - 한쪽 입력(배수 2) 블록의 % 채움.
- Go 테스트는 새 저장분의 키와 왕복만 확인한다. **옛 PascalCase 문자열을 `parsePrescription`이 읽는지** 회귀 테스트가 없다. 지금은 대소문자 무시 덕에 통과하지만, 그 성질에 기대고 있다는 사실을 테스트로 고정해 두는 편이 좋다.
- **수정안**: 위 시나리오를 core 저장소 테스트(LokiJS 메모리 어댑터) 또는 e2e에 추가한다. 최소한 H1·H2·M3는 회귀 테스트로 고정한다.

---

## 낮음

| # | 파일:줄 | 내용 · 재현 | 수정안 |
|---|---------|-------------|--------|
| L1 | `ExerciseBlock.tsx:426-427` | PR 칩 「안 한 첫 세트」가 워밍업 행도 포함한다. 프리레이에 W가 있으면 PR 100kg×3이 워밍업 칸에 들어간다. 스펙 D1의 문자 그대로이지만 의도와 다를 가능성이 크다(**의심**). | 첫 **작업** 세트(`setType` normal/top/backoff, `!isWarmup`)를 우선하고, 없으면 첫 미완료 세트 |
| L2 | `workoutRepository.ts:560`, `:622` | 한쪽 입력(배수 2) 블록은 **총 무게**를 반올림(머신 1kg)한 뒤 배수로 나눈다. 81kg → 한쪽 40.5kg처럼 원판으로 만들 수 없는 값이 나온다. | 입력 칸 기준(한쪽)으로 반올림(원판 최소 단위 1.25kg 등)하고 총 무게는 표시에만 쓴다 |
| L3 | `PrescriptionRows.tsx:149-167` | 「직접」 무게 입력이 단위를 모르고 항상 kg으로 받는다. lb 사용자가 135를 넣으면 135kg 처방이 된다. | 사용자 단위로 입력·표시하고 저장 때 `toKg` |
| L4 | `PrescriptionRows.tsx:160` | % 입력을 0~hi로만 자른다. 하한(1RM 30·탑셋 50) 미만은 저장 때 앱·서버 정리에서 **기준째 조용히 사라진다**(예: 1RM 25%). | 입력에서 하한까지 자르거나 범위 밖이면 경고 |
| L5 | `workoutRepository.ts:518` | 1RM 출처가 칸의 **역대 최고** 추정치다. 오래 쉰 뒤 시작하면 과중한 처방 무게가 채워진다(**의심** — 정책 문제, ADR-028상 계산일 뿐). | 최근 N주 또는 최근 K회 최고로 한정하고, 근거 문구에 날짜를 표시 |
| L6 | `workoutRepository.ts:1087` | 묶음 완료(next=true) 때 이미 완료된 멤버 세트의 `completedAt`도 지금 시각으로 덮는다. | `done`이 이미 같은 값인 항목은 건너뛴다(`getSupersetRoundSets`가 `done`을 이미 돌려준다) |
| L7 | `ExerciseBlock.tsx:352` + `ActiveWorkout.tsx:640-664` | 묶음 경로는 PR 판정(멤버마다 쿼리·동적 import)이 `write()` 래퍼 **안**에 있다. 체크 표시 갱신(`onChanged`)과 휴식 시작이 PR 판정이 끝날 때까지 늦어진다. | 저장 후 `onChanged`를 먼저 하고, PR 판정은 그 뒤 비동기로 |
| L8 | `SetRowEdit.tsx:304-313` | 길게 누르기: ① 마우스 우클릭을 0.5초 누르고 있어도 단독 토글이 된다. ② iOS에서 길게 누른 뒤 click이 오지 않으면 `longFired`가 남는다. 다음 입력이 pointerdown 없는 키보드 Enter이면 한 번 삼킨다(**의심**). ③ `onPointerCancel`이 없다(스크롤 시작 시 대부분 pointerleave가 따라오지만 보장 아님). 모바일 click 중복은 `longFired` 가드로 막혀 문제없다. | `e.button === 0`일 때만 타이머를 걸고, `onPointerCancel`에서도 해제하고, click에서 `longFired`를 쓴 뒤 항상 초기화(타임스탬프 비교) |
| L9 | `PrescriptionEditor.tsx`(트레이너) | 캐시된 옛 웹 번들로 트레이너가 저장하면 proto `load_basis=0`이 되어 회원의 무게 기준을 지운다(Q1의 남은 틈). 또 트레이너 편집기는 맨몸·어시스트 종목에도 무게 기준을 고를 수 있다(`allowLoad` 기본 true). | 배포 후 강제 새로고침(버전 검사)을 하고, 트레이너 편집기에도 종목 하중 모드를 전달 |
| L10 | `WorkoutDetailClient.tsx`(EditSetSheet) | 한쪽 입력 블록 세트는 한쪽 무게가 「kg」 라벨로만 보인다. 총 무게로 오해하고 고치기 쉽다. 세트를 모두 지우면 빈 종목 블록이 기록에 남는다. | 배수 표시(「한쪽」)를 하고, 마지막 세트를 지우면 종목 행도 정리할지 묻는다 |
| L11 | `workoutRepository.ts:1432` | 이력 조회가 `variant_key` **컬럼**을 effective 키로 찾는다. 레거시(`variant_key` null + `machine_variant`) 행이 남아 있으면 놓친다. 기존 `historicalSnapshotForExercise`와 같은 방식이라 회귀는 아니다(**의심** — 백필 완료 여부에 달림). | 변형 버킷 불변식 메모에 따라 백필 완료를 확인하거나, 메모리에서 effective 키로 거른다 |

## 확인했으나 문제없음

- `updated_at == created_at` 판정: WatermelonDB 0.28 `createTimestampsFor`가 같은 `Date.now()`로 두 값을 넣는다(`Model/helpers.js`). 생성 직후 오차로 오판하지는 않는다. 무게 외 변경(타입·팔·그립·RPE·다른 세트 삭제 후 번호 재정렬)도 「손댐」으로 보는데, 이는 안전한 쪽 거짓 음성이다. 입력 중 값은 체크 탭 전에 blur 커밋이 먼저 일어나 보호된다.
- 묶음 완료: 한 번의 `database.write` + `batch`로 반쪽 상태가 남지 않는다. 휴식은 누른 블록이 1회 건다. PR 축하는 모아서 1회. 같은 번호가 없는 멤버는 쿼리 결과에 없어서 건너뛴다. 다른 멤버의 미저장 값은 draft 등록부로 반영되고, 저장값이 바뀌면 draft를 비워 옛 입력이 새 값을 덮지 않는다.
- PR 칩 채움: 입력 무게와 계산 무게를 분리했다(Q4). `carryWeightAcrossMultiplier`로 블록 배수에 맞춰 환산한다. lb는 kg 저장 + `formatWeight` 표시라 변환 오류가 없다.
- 서버 `SanitizePrescription`·`parsePrescription`: 범위 밖이면 기준째 버리고, 소수 % 반올림, 음수 처리(-0.6 → 0 → 범위 밖이라 버림)가 앱과 일치한다. proto 왕복 테스트로 Q1이 충족된다.
- 볼륨 재계산 규칙(수행 세트만, 유산소 PR 제외, 종목×칸 그룹)은 `completeWorkout`과 같다.

---

## 조치 (2026-10-27 · v0.36.0)

새 회귀 테스트: core `sessionAssistQa.test.ts` 12건(H2 는 수정 전 함수로 실패 확인 — `[{SetType:'top'}]` → `normal`·RIR null) ·
Go `TestParsePrescription_옛_PascalCase_키도_읽는다` · e2e 「슈퍼셋 — 한쪽에만 워밍업이 있어도 화면 번호끼리 짝짓는다」.

| # | 조치 |
|---|------|
| H1 | 수정 — 순수 계획 `planPrescribedLoadFills`(prescription.ts): 마친 세트가 워밍업·실패(isWarmup·isFailed·setType/처방 warmup)면 채우지 않음 · `fillPrescribedLoadsAfter` 가 계획을 씀(옛 함수 `…V1` 보존) |
| H2 | 수정 — `sanitizePrescriptionValue` 가 옛 PascalCase 키(SetType·TargetRIR·RepMin·RepMax·LoadHint·Load*)를 읽음(새 키 우선) · 운영 백필 안 함(읽기 호환으로 충분, 다음 저장 때 camelCase) · 커밋 메시지의 「버그 수정」은 새 저장분 + 이번 읽기 호환 |
| M1 | 수정 — `sweepPrCounts`(prefix sweep) + 새 `recomputeWorkoutTotals`(완료 운동·종목·세트를 한 번씩 읽음 · 고친 종목이 없는 이후 운동은 건너뜀 · 옛 함수 `…V1` 보존). 고친 종목이 든 이후 운동은 엄격 「앞선 기록만」 규칙으로 전체를 다시 센다(교정) |
| M2 | 수정 — `invalidateLivePrCache()` 를 재계산 끝에 호출(세션으로 돌아오면 ExerciseBlock 이 다시 마운트되어 PR 칩도 새로 읽음) |
| M3 | 수정 — `supersetRound.ts`(roundKeyOf·pickRoundSets: 일반 `n:k`·탑 `t:k`, W/D/F 짝 없음) + `getSupersetRoundSetsFor(weIds, pressedSetId)`(옛 `getSupersetRoundSets` 보존) |
| M4 | 수정 — `currentValues` 가 읽을 수 없는 칸을 undefined 로(저장소는 쓰지 않음) · 누른 칸이 비었으면 토스트 「비어 있는 칸은 저장된 값 그대로…」 |
| M5 | 수정 — 묶음 완료 뒤 다른 멤버 세트마다 `fillPrescribedLoadsAfter` 호출. 근거 문구(loadNotes)는 누른 블록에만 보임 — 다른 블록은 채운 무게만(보류: 블록 간 이벤트 경로 필요) |
| M6 | 수정 — 위 회귀 테스트(H1·H2·M1·M3·L1 순수 + Go + e2e M3). 저장소 함수 자체(LokiJS)는 core 테스트 환경이 DB 없는 순수 함수만 돌려 e2e 로 대신 |
| L1 | 수정 — PR 칩 채움 = `firstOpenWorkingSet`(워밍업 아닌 첫 미완료, 없으면 첫 미완료) |
| L2 | 보류 — 한쪽 입력 블록의 원판 단위 반올림은 배수·기구별 원판 정책을 정해야 함(다음 처방 개선 때) |
| L3 | 보류 — 「직접」 무게 lb 입력은 PrescriptionRows 에 단위 전달 경로가 없어 화면 3곳 수정 필요(다음 묶음) |
| L4 | 수정 — % 칸을 떠날 때 하한까지 올림(입력 중에는 강제하지 않음) |
| L5 | 보류 — 1RM 출처 기간 한정은 정책 결정(ADR-028 상 계산일 뿐 · 사용자 판단 필요) |
| L6 | 수정 — 묶음 완료 때 이미 같은 상태이고 바꿀 값이 없는 세트는 건드리지 않음(완료 시각 보존) |
| L7 | 보류 — 묶음 경로의 PR 판정 순서 변경은 축하·휴식 타이밍 체감 확인 필요(실측 지연 없음) |
| L8 | 수정 — 주 버튼만 길게 누르기 타이머 · `onPointerCancel` 해제 |
| L9 | 보류 — 옛 번들 트레이너 저장 문제는 v0.34.3 자동 새 버전 적용으로 대부분 해소 · 맨몸 종목 기준 숨김은 트레이너 편집기 하중 모드 전달 필요 |
| L10 | 보류 — 기록 상세 편집 시트의 한쪽 표시·빈 블록 정리는 묶음 2(기록 상세 개편)에서 함께 |
| L11 | 보류 — 레거시 variant_key null 행은 P2 이관·정규화로 실체화됨(기존 함수와 같은 방식 · 회귀 아님) |
