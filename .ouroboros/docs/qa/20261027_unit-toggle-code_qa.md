# /qa code — 운동 블록별 kg/lb 토글 · 운동 중 막대 취소 (dc4bdbd)

> 일자: 2026-10-27 · 대상: `git show dc4bdbd -- src/` · 스펙: `.ouroboros/docs/spec/20261027_unit-toggle/spec.md` · 요구: SRS-067·SRS-068
> 검증: `cd src && make verify` 통과(core·go·문서 검사). 수치는 스크래치 스크립트로 직접 따라감(아래 표).
> 코드는 수정하지 않았다.

## 패널
| 역할 | 전문분야 | 관점 |
|---|---|---|
| 측정·단위 정밀도 엔지니어 | 부동소수 왕복·반올림·PR/볼륨 산식 | 숫자가 끝까지 맞는가 |
| 로컬 우선 동기·동시성 엔지니어 | WatermelonDB writer 큐·동기·proto 하위호환 | 겹친 호출·옛 클라이언트에서 깨지는가 |
| 모바일 운동 UX 검토자 | 운동 중 한 손 조작·오조작 복구 | 사용자가 보는 숫자와 의도가 같은가 |

## 총평 — **조건부 통과(높음 4건 조치 후 배포)**
순수 도메인(`displayWeight`·`planUnitSwitch`·`pickStartUnit`)은 정확하다. 100lb와 102.5lb는 정확히 왕복하고, kg→lb→kg 재토글도 정확히 원복된다. 피드 proto 필드 5·Go 왕복·`null=kg` 하위호환도 맞다. 결함은 주로 **저장소/화면 경계**에 있다. ① 토글이 writer 밖에서 읽고 계획해, 이번 커밋이 `syncBlockLoadMultiplier`에서 고친 것과 같은 종류의 경합을 다시 만든다. ② 칸을 바꾸면 사람이 고른 단위를 덮는다. ③ Q4 B가 「사람이 적지 않은」 처방·목표 무게에도 적용되어 실제 하중이 2.2배 달라진다. ④ `.proto` 원본이 커밋에서 빠졌다. 표시 일관성은 요약 PR 줄·원판 계산·칸 시트에 일부가 남았다.

## 수치 추적
| 시나리오 | 계산 | 결과 |
|---|---|---|
| 100lb 입력 | toKg=45.359237 → displayWeight(lb)=100 | 정확 ✓ |
| 102.5lb | 46.4932… → 102.5 | 정확 ✓ |
| kg 블록 100 → lb 토글 → kg 토글 | 45.359237 → 100(그대로 kg 정본) | 정확 원복 ✓ |
| 한쪽 입력 ×2 + 토글 | 적힌(한쪽) 숫자만 환산·배수는 그대로 → 계산 무게 = 숫자×2 in 새 단위 | ✓ |
| lb 블록에 kg 정본 60(PR 채우기·처방) → 무게 칸 포커스·블러 | 132.28lb → 60.0011987kg (+1.2e-3) | **드리프트 > EPS 1e-6 → 거짓 PR**(M-1) |
| kg 블록에 lb 유래 45.359237(칸 자동 단위) → 블러 | 45.36 → +7.6e-4 | **거짓 PR**(M-1) |
| 처방 1RM 100kg×70% = 70kg 채움 → lb 토글 | 70lb = 31.75kg | **실제 하중 55% 감소**(H-3) |
| 연타 kg→lb→kg(아래 H-1) | 최종 DB lb + 45.359237 / 화면 kg | 화면 45.36kg(**사용자 100 소실**) |

---

## 높음

### H-1 토글 연타·입력 겹침 경합 — 단위와 숫자가 어긋나고 사용자 입력을 덮는다
- 위치: `src/core/src/data/workoutRepository.ts:575-597`(`switchBlockWeightUnit`) · `src/frontend/app/components/session/ExerciseBlock.tsx:220-226`(`switchUnit`) · `ExerciseBlock.tsx:373-379`(`write`는 직렬 큐가 아니다)
- 원인: `we`·`sets`를 **writer 밖에서** 읽고, `from`과 plan을 미리 계산한 뒤 `database.write`에 들어간다. 화면은 낙관적으로 `setBlockUnit(to)`를 하고 호출을 기다리지도 막지도 않는다. 그리고 `blockUnit` state는 이후 `we.weightUnit`을 다시 따라가지 않는다(초기값과 `ensureBlockUnit` 1회만).
- 재현 1(연타): kg 블록에 100 → lb 탭 → 곧바로 kg 탭.
  - A(to=lb)는 from=kg로 plan 45.359237을 만든다. A가 쓰기 전에 B(to=kg)가 `we.weightUnit==='kg'`을 읽어 즉시 return한다.
  - 최종 DB는 `lb` + 45.359237, 화면 `blockUnit`은 `kg`다. 칸에 **45.36**이 보이고, 이후 입력은 kg로 저장되는데 블록은 lb로 표시된다(다음 마운트부터 lb로 보임).
  - `weightUnit=null` 블록이면 B가 plan 없이 `kg`를 써서 **lb로 환산된 kg가 kg 단위로 영구 고정**된다.
- 재현 2(의심 · 타이밍 의존): 사전 채움 60인 세트에 100을 입력하고 블러하지 않은 채 토글을 탭한다.
  - 블러로 `updateSetLog(100kg)`가 쓰기 대기에 들어간다. 그사이 switch의 sets 조회가 먼저 끝나면 plan은 60을 근거로 만들어진다(27.2kg). 그 batch가 100kg 위에 덮어써 **사용자 입력이 소실**된다.
- 수정안:
  1. `syncBlockLoadMultiplier`와 같이 **읽기·from 결정·plan·쓰기를 한 writer 안에서** 한다.
  2. 화면이 본 `from`을 인자로 넘기고, DB 단위가 다르면 no-op 처리한다.
  3. 토글은 호출이 끝날 때까지 `disabled`로 두고, 끝나면 `we.weightUnit`에서 다시 읽는다.
  4. `blockUnit`은 `we.weightUnit ?? 자리값`에서 파생한다(state 제거). 그래야 동기·경합 뒤에도 화면과 DB가 같다.
- 테스트: 저장소 단위 테스트에서 `Promise.all([switch(lb), switch(kg)])`와 `Promise.all([updateSetLog, switch])`의 최종 (단위, kg)가 일관되는지 확인한다.

### H-2 칸(기구·그립)이나 종목을 바꾸면 사람이 고른 단위가 조용히 kg로 되돌아간다
- 위치: `workoutRepository.ts:553-569`(`adoptSlotUnit`) · `ExerciseBlock.tsx:611-621`(RecordSlotSelector onChange) · `ExerciseBlock.tsx:203-217`(exerciseId 변경 effect)
- 원인: `adoptSlotUnit`은 완료 세트가 없으면 **무조건** 새 칸의 기억 단위로 바꾼다. 기억이 없으면 legacy, 곧 kg다. 사람이 막 누른 토글인지 구분하지 않는다.
- 재현: 새 종목 블록에서 lb를 탭하고 100을 입력(45.36kg 저장)한다. 완료 전에 그립·기구 칩을 바꾸면 단위가 kg가 되고 칸에 **45.36**이 보인다. 완료하면 이 칸은 kg로 기억되어 다음에도 kg로 시작한다(기구는 lb).
- 수정안: 블록에 「사람이 고른 단위」 표시를 둔다(예: 토글 시각을 로컬 Map이나 열에 기록). 그 블록에서는 `adoptSlotUnit`을 건너뛴다. 또는 새 칸에 **명시적 기억이 있을 때만** 바꾸고, 기억이 없으면 현재 단위를 유지한다(최소 수정 — `getBlockStartUnit`이 legacy로 떨어질 때 no-op).
- 테스트: e2e「lb 토글 → 100 입력 → 그립 변경 → 여전히 lb·100」.

### H-3 Q4 B가 사람이 적지 않은 숫자(처방 %·고정 무게·루틴 목표·PR 채우기)에도 적용되어 실제 하중이 바뀐다 — 결정 재확인 필요
- 위치: `src/core/src/domain/blockUnit.ts:34-48`(`planUnitSwitch` 전 세트 대상) · `workoutRepository.ts:575-597`
- 재현: 1RM 100kg 처방 70%인 루틴을 시작한다(기억 없음 → kg 블록, 70kg 채움). 기구가 lb라서 lb를 탭하면 **70lb(31.75kg)**가 된다. 의도한 하중은 154lb다. 루틴 목표 50kg도 50lb(22.7kg)가 된다.
- 부작용: 바뀐 세트는 `updatedAt≠createdAt`이 되어 「사람이 고친 세트」로 취급된다(`workoutRepository.ts:684`). 그래서 이후 탑셋→백오프 % 자동 채움이 **멈춘다**.
- 사용자 결정(Q4 B)은 「잘못 고른 단위를 바로잡는」 동작이다. 처방이나 목표가 계산한 숫자는 단위가 틀린 것이 아니다. 따라서 결정 범위 밖일 가능성이 높다.
- 수정안(사용자 확인 후):
  - 미완료이면서 사람이 손대지 않은 세트(`!done && updatedAt===createdAt`)는 kg 정본을 유지한다. 새 단위로 보이게 하고, 처방 세트는 새 단위 원판 증분으로 다시 반올림한다.
  - 완료 세트와 사람이 고친 세트만 숫자를 유지한다.
  - 최소한 처방·루틴 목표 세트는 건드리지 않고, 토스트로 알린다.

### H-4 `.proto` 원본이 커밋에 없다 — 생성물만 있다
- 위치: `src/proto/feed/v1/feed.proto:90-92`(작업 트리에만 수정됨 · `git status` M) · 커밋에는 `backend/gen/feed/v1/feed.pb.go`·`contracts/gen/feed/v1/feed_pb.ts`만 들어 있다.
- 영향: 다음 `make proto`가 필드 5를 지운다. 그러면 `handler.go`의 `WeightUnit` 참조가 컴파일 실패하거나, 피드 단위가 조용히 소실된다. 원본과 생성물이 어긋난다.
- 수정안: `feed.proto` 변경을 같은 기능 커밋에 포함한다(검증 규칙 `in: ["", "kg", "lb"]` 확인됨). `buf breaking` 기준으로는 필드 추가라 호환된다.

---

## 중간

### M-1 표시 2자리 반올림 + 블러/완료의 무조건 재환산 → 정밀도 드리프트·거짓 PR(이번 커밋에서 생긴 회귀)
- 위치: `src/frontend/app/components/session/SetRowEdit.tsx:154-158`(`commitWeight`) · `:178-185`(`currentValues`) · `:132` · `:144`
- 원인: 이전에는 `String(fromKg())`로 전체 정밀도를 썼다. 이제는 `displayWeight`가 2자리다. kg 정본이 표시 단위에서 2자리로 표현되지 않으면 문제가 생긴다. 예를 들어 lb 블록의 kg 유래 60kg, kg 블록의 lb 유래 45.359237이 그렇다. 이때 포커스(`select()`)→블러만 해도 `toKg(132.28,'lb')=60.0012`가 저장된다.
- 영향:
  - 완료 체크 때 `uiKg`도 같은 드리프트를 PR 판정에 쓴다. `personalRecords.ts` EPS가 1e-6이라 **+0.0012kg 거짓 「중량 PR」 축하**가 난다. 블러된 경우에는 저장도 되어 완료 PR 수에도 남는다.
  - 처방 「touched」 판정도 오염된다.
- 수정안: `n === displayWeight(set.weightKg, unit)`이면 `set.weightKg`를 그대로 쓴다(no-op). `commitWeight`·`currentValues`·draft 등록·EditSetSheet(`WorkoutDetailClient.tsx:478`) 공통 헬퍼로 묶는다.
- 테스트: `displayWeight(60,'lb')` 칸을 포커스·블러해도 kg 정본이 그대로인지 확인한다.

### M-2 요약·칸 시트·원판 계산에 단위가 반영되지 않았다(Q2 A 불일치)
- `src/frontend/app/components/session/WorkoutSummary.tsx:123,127`: 완료 요약 PR 줄 `previous/current`가 `unit`(이제 항상 kg)과 0.5 증분 반올림으로 보인다. lb 블록 100lb PR이 「45.5kg」로 보이고, 같은 화면 칩·기록 상세는 「100lb」다. → `PRResult`에 블록 단위를 실어 `formatEnteredWeight`로 표시한다.
- `ExerciseBlock.tsx:889-901`(칸 시트 `slot-last-sets`·`slotBest`): 다른 칸의 지난 세트가 **지금 블록의 단위**로 보인다. 해머(lb) 칸의 100lb가 kg 블록에서 45.36kg로 보인다. Q2 A(「적은 단위」)와 어긋난다. → `SlotSummary`에 그 칸 마지막 블록의 `weightUnit`을 싣는다.
- `SetRowEdit.tsx:207-222`(원판 계산): lb 블록에서 「목표: 103lb」(formatWeight 1lb 증분 — 102.5가 103으로 보임) / 「한쪽: 20 + 1.25kg」(kg 원판)이 섞인다. Q8 보류는 인정하더라도 **목표는 `formatEnteredWeight`로 표시하고, lb 블록에서는 원판 계산 버튼을 숨기거나 「kg 원판 기준」으로 표기**하는 것을 권한다.
- `SetRowEdit.tsx:386-390`(처방 제안): 0.1kg 반올림 제안값이 lb에서 89.95처럼 보인다. 제안은 블록 단위 증분으로 반올림한다(낮음에 가까움).

### M-3 막대 취소 실패 시 막대가 갇힌다 · 확인 연타 중복 폐기
- 위치: `src/frontend/app/components/GlobalWorkoutBar.tsx:33-55` · `:179-189`
- (a) 다른 기기에서 이미 지워졌거나 완료된 운동이면 `discardWorkout`의 `find`가 던지고, 오류 토스트만 뜬다. `setActive(null)`이 실행되지 않아 막대가 계속 남는다. 운동 화면 경로와 같은 결함이지만, 막대는 「어디서나 보이는」 진입점이라 노출이 크다. → not-found는 성공으로 보고 셸 상태를 해제한다.
- (b) `discarding` 가드는 클로저 state라, 같은 프레임 이중 탭이 둘 다 통과한다. `ConfirmDialog` 확인 버튼에 `busy/disabled`가 없다. 두 번째 호출은 이미 지운 레코드에 `prepareMarkAsDeleted`를 하다 오류 토스트를 띄운다(의심 — Watermelon 동작에 따라). → ref 가드를 쓰거나 운동 화면처럼 **먼저 다이얼로그를 닫은 뒤** 실행한다.
- 확인창 동일성: 같은 testId, title·message·confirmLabel 키, destructive 모두 일치 ✓. 순서(discard→flush→setActive→clearRest)는 스펙과 일치한다. 운동 화면은 clearRest→setActive 순이라 미세하게 다르지만 무해하다 ✓. 링크와 버튼은 형제라 링크 오클릭이 없다 ✓.

### M-4 `ensureBlockUnit` 확정 전 토글 — 첫 렌더 단위와 DB 단위의 경합
- 위치: `ExerciseBlock.tsx:177-192`
- `weightUnit=null` 블록(종목 추가·교체)은 처음에 `unit` prop(kg)으로 그린다. 그러다 `ensureBlockUnit`이 lb로 정하면 칸 숫자가 45.36 → 100으로 깜박인다.
- 그 사이에 lb를 탭하면 switch는 from=kg(null)로 **환산**한다. 동시에 ensure는 환산 없이 lb를 쓴다. 이기는 쪽에 따라 숫자 의미가 달라진다(H-1과 같은 뿌리). → 단위가 확정될 때까지 토글을 비활성화하고, H-1 수정(writer 안에서 판단)을 적용한다.

---

## 낮음

- L-1 `WorkoutBox.tsx:295`: 옛 글(필드 없음)은 `unit`(보는 사람 = 이제 항상 kg)으로 그린다. 옛 앱이 만든 lb 글은 없다(운영 전원 kg)는 전제가 맞다 ✓. 다만 `formatEnteredWeight`는 증분 반올림이 없어 옛 글의 kg 소수(예: 22.68)가 그대로 보인다. 무해하다.
- L-2 `userContext.weightUnit='kg'` 고정: 루틴 편집 목표 무게(`RoutineEditor.tsx:574`)·체중·바 무게는 kg 입력만 받는다. lb 기구 루틴의 목표를 kg로 적어야 한다. lb 블록에서 시작하면 110.23lb처럼 보인다(M-1 드리프트 대상). 기존 lb 사용자는 0명(운영 확인)이라 영향이 없다. `getUserWeightUnit`(저장소)은 여전히 프로필을 읽어 첫 기본값으로만 쓴다 — 스펙과 일치 ✓.
- L-3 피드 「바로 시작/가져오기」: lb 글의 종목을 받는 사람이 처음 하면 kg 블록으로 시작한다(45.36 표시). 받는 쪽 칸 기억이 없을 때는 글의 `weightUnit`을 시작 단위 힌트로 쓰는 것을 고려한다.
- L-4 다른 브라우저 탭에 운동 화면이 열려 있을 때: 탭 간 LokiJS 메모리 동기가 없어(기존 구조), 막대에서 폐기해도 다른 탭이 옛 상태를 계속 쓰고 flush할 수 있다(의심 · 기존 운동 화면 취소와 같은 한계). 별도 과제로 둔다.
- L-5 `adoptSlotUnit`·`ensureBlockUnit`이 `write()` 밖에서 불리고 `onChanged`를 부르지 않는다. 블록 레코드 갱신은 observe로 다시 그려지므로 실제 피해는 없다.
- L-6 `getBlockStartUnit`은 시작할 때 줄마다 종목 블록 전체와 운동 `oneOf`를 조회한다(N×2 쿼리). 루틴 10줄은 문제없다.

## 하위호환·동기 확인(문제 없음)
- v25 `addColumns` 선택 열, `null`→kg(`blockWeightUnit`·`getWorkoutDetail`) ✓. 스키마 상승 시 커서 리셋으로 전량 재수신된다(`syncEngine.ts:236`) ✓.
- 서버는 컬렉션 단위 얕은 병합이라, 옛 클라이언트(v24) push가 `weight_unit`을 지우지 않는다 ✓(sync.sql.go 주석 근거 · /qa spec Q9).
- 백업(`backup.ts`)은 raw 전체를 덤프한다. 옛 백업 복원은 열이 없어 kg로 처리된다 ✓.
- proto 필드 5: 옛 앱은 무시하고, 옛 글은 `""`. Go `shareWeightUnit`과 TS `clampSharedExercises`가 kg|lb만 통과시킨다 ✓. JSON 저장은 `omitempty` ✓. (원본 `.proto` 누락은 H-4.)
- `syncBlockLoadMultiplier` writer 내부화: 읽기·계획·쓰기가 한 writer에 들어가 겹친 호출이 직렬화된다 ✓. `blockMultiplierOf`가 writer 안에서 다른 `database.write`를 부르지 않는지 확인했다(읽기 전용) ✓.

## 테스트가 결함을 막는가
- 단위 테스트(`unitToggle.test.ts`)는 순수 함수의 왕복만 본다. **저장소 경합(H-1)·칸 변경(H-2)·처방 세트 토글(H-3)·블러 드리프트(M-1)**를 잡는 테스트가 없다.
- e2e(`unit-toggle.spec.ts`)는 「한 번 탭·기다림」 흐름만 있다. 연타, 칸 변경 후 단위 유지, 피드 lb 표시, 요약 PR 줄 단위가 빠졌다. 막대 취소 e2e는 확인창 유지/삭제/막대 사라짐/진행 카드 없음을 잘 막는다 ✓.
- 추가 권장: core 저장소 테스트 3건(H-1 두 시나리오, H-2), SetRowEdit 블러 no-op 단위 테스트(M-1), e2e 1건(lb 토글→그립 변경→lb 유지).

## 조치 우선순위
1. H-4(proto 커밋) — 즉시
2. H-1 + M-4(writer 안에서 판단 · 토글 비활성 · 단위 파생)
3. M-1(블러 no-op) — 거짓 PR 차단
4. H-2(사람이 고른 단위 보존)
5. H-3 — 사용자 결정 확인 후(미완료·손대지 않은 세트 범위)
6. M-2·M-3 → 낮음

---

## 조치 (2026-10-27 · v0.38.0)

| 항목 | 조치 | 내용 |
|---|---|---|
| H-1 | 수정 | `switchBlockWeightUnit` v2 — 읽기·판단·계획·쓰기를 한 writer 안에서, 화면이 본 단위(`expectedFrom`)가 DB 와 다르면 no-op 하고 DB 단위를 돌려준다. 화면은 끝날 때까지 토글을 막고 돌려받은 단위를 따른다. 입력 커밋(blur)은 먼저 writer 에 줄을 서므로 사용자 입력을 덮지 않는다. e2e 「같은 프레임 lb→kg 연타 → 화면·DB 같은 단위·100 그대로(다시 열어도)」 |
| H-2 | 수정 | v25 `workout_exercises.unit_by_user` — 토글하면 true, `adoptSlotUnit` 은 이 표시가 있으면 건너뛴다(판단은 writer 안). e2e 「lb·100 → 그립 와이드 → lb·100」 |
| H-3 | 수정(main 결정) | `planUnitSwitchV2` — 사람이 적었거나 완료한 세트만 Q4 B, 손대지 않은 자동 채움은 실제 무게 그대로 새 단위 원판(`roundLoadKg`)으로 반올림해 **적은 숫자로** 저장. v25 `set_logs.user_edited`(생성 false · `updateSetLog` 무게/횟수 true) + `isUserTouched` — 처방 채움 판정도 이것으로(시스템 환산 뒤에도 채움 유지). 스펙 결정 표에 보완 기재. 단위 테스트 3건 |
| H-4 | 수정 | `feed.proto` 필드 5 원본 커밋 · `make proto` 재생성 결과 생성물 무변경(일치) |
| M-1 | 수정 | `enteredWeightToKg` — 보이던 숫자 그대로면 null(쓰지 않음 · 사람이 고친 세트로도 안 됨). SetRowEdit 커밋·입력 중 값·슈퍼셋 등록부·기록 상세 세트 편집 공통. 단위 테스트(60kg·lb 블록 132.28 → 그대로) |
| M-2 | 수정 | 요약 중량 PR 줄 = 그 블록 단위(`WorkoutPRDetail.weightUnit`) · 칸 시트 = 그 칸 마지막 블록 단위(`SlotSummary.weightUnit`) · lb 블록 원판 계산 = 45lb 봉·lb 원판(`lbPlateInventory`) · 제안 무게 = 블록 단위 증분(`roundSuggestionKg`) |
| M-3 | 수정 | 막대 취소 — ref 가드(같은 프레임 이중 탭 1회) · 확인창 먼저 닫기 · 이미 없는/끝난 운동이면 성공으로 보고 셸 상태 해제, 그 밖의 실패는 토스트만(막대 유지) |
| M-4 | 수정 | 단위가 정해지기 전(`ensureBlockUnit` 완료 전)·토글 진행 중에는 토글 비활성 + H-1 writer 판단 |
| (이전 보고) 한쪽 입력 환산이 입력 중 값을 덮음 | 수정 | `planBlockMultiplierResync` 에 touched — 사람이 적은 안 한 세트는 숫자 그대로 배수만. 단위 테스트 |
| L-1 | 보류 | 무해(옛 글 kg 소수 표시) |
| L-2 | 보류 | 루틴 편집 목표 무게 kg 입력 — 기존 lb 사용자 0명 · 블록 단위 입력은 별도 과제 |
| L-3 | 보류 | 피드 lb 글의 시작 단위 힌트 — 받는 쪽 칸 기억이 생기면 해결, 빈도 낮음 |
| L-4 | 보류 | 탭 간 LokiJS 동기 부재(기존 구조 한계) — 별도 과제 |
| L-5 | 보류 | 실제 피해 없음(observe 로 다시 그림) |
| L-6 | 보류 | 루틴 10줄 규모에서 무해 |

검증: `make verify`(core 297 · go) 통과 · `make proto` 생성물 일치 · 새 DB 로컬 운영 빌드 e2e 29/29(unit-toggle·record-slots·session-assist·session·profile·history-replay). 새 e2e 2건이 **수정 전 코드(dc4bdbd)에서 실패하는지는 따로 돌리지 않았다**(단위 테스트의 옛 판 회귀 단언으로 대신).
