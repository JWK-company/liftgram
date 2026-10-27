# Feature Spec — 운동 블록별 kg/lb 토글 · 운동 중 막대 취소

> 생성일: 2026-10-27 · 등급: **Feature** (core 도메인·저장소 + 로컬 스키마 v25 + 피드 proto 1필드 + 프론트 10여 곳)
> 추적: SRS-067(단위) · SRS-068(막대 취소) ← URS-022
> 확정 결정(2026-10-27 사용자): Q1 A · Q2 A · Q3 A · **Q4 B**

## 확정 결정
| # | 결정 |
|---|------|
| Q1 A | 단위는 **종목 × 기록 칸(variant key)** 마다 기억한다 — 같은 칸으로 가장 최근에 **완료한** 블록의 단위가 다음 블록의 기본값 |
| Q2 A | 기록 상세·이전 기록·PR 칩·피드는 **그 블록에 입력한 단위**로 보인다. 볼륨·총무게·통계·그래프·코칭·이관 검증은 **kg** |
| Q3 A | 프로필 kg/lb 선택 제거(노출만 막음 — 코드 보존). 바 무게·체중은 kg 고정. 예전 프로필 단위는 「칸 기록이 없을 때의 첫 기본값」으로만 |
| Q4 B | 토글을 누르면 **그 운동·그 블록의 세트(완료 포함) 숫자는 그대로, 단위만** 바뀐다(저장 kg 재환산). 지난 운동은 불변 |
| Q4 B 보완(H-3 · /qa code 뒤 main 결정 2026-10-27) | Q4 B 는 **사람이 적었거나 완료한 세트**에만 적용한다. 아직 손대지 않은 자동 채움(처방 무게·% 채움·이전 기록 프리필·루틴 목표)은 **실제 무게 그대로** 새 단위 원판으로 반올림한다(70kg 처방 → 155lb, 70lb 가 아님). 「사람이 고친 세트」 판정은 v25 `set_logs.user_edited`(만들 때 false · 사람이 무게·횟수를 고치면 true · null=옛 세트는 updated_at 판정) — 시스템 환산이 updated_at 을 바꿔 처방 채움이 멈추던 것도 함께 막는다. 사람이 고른 단위는 `workout_exercises.unit_by_user` 로 표시해 칸을 바꿔도 유지(H-2) |
| D5 | 막대 취소 = 운동 화면 ⋯ 「운동 취소」와 같은 확인창(제목·문구·삭제). 순서 discard → flush → setActive(null) → clearRest. 화면 유지 |

## 운영 데이터 (읽기 전용 확인 2026-10-27)
`sync_records` 의 `user_profiles.weight_unit` = 전 사용자 `kg`(5 계정). → 기존 블록(`weight_unit` 없음)은 **kg 입력으로 간주**. 이관·백필 없음.

## 설계
### 저장
- 로컬 스키마 **v25**: `workout_exercises.weight_unit`(string, optional, `null` = kg). Q4 B 로 한 블록의 세트는 늘 한 단위를 공유하므로 **블록 단위 열 하나**면 된다(세트 열 불필요). 동기 대상(서버는 컬렉션 이름만 검증 → 서버 스키마 변경 없음). 스키마 상승 첫 동기의 전량 재수신 규칙(QA H2)을 그대로 탄다.
- 칸별 기억은 별도 선호 행을 두지 않고 **완료 블록에서 유도**한다(블록이 이미 동기되므로 기기 간 일관 · 새 테이블 없음).

### 정밀도(왕복)
- kg 정본은 부동소수 그대로 저장(`lbToKg(100)=45.359237`). 표시는 `displayWeight(kg, unit) = round(fromKg(kg,unit), 2자리)` → 100lb 는 100 으로 돌아온다. 입력 칸·이전 기록·PR 칩·기록 상세·피드의 세트 무게는 이 함수(0.5·1 증분 반올림 금지 — 102.5lb 가 103 으로 보이던 것 방지). 볼륨·통계 같은 합계는 기존 `formatWeight(…,'kg')`.

### 도메인 `core/domain/blockUnit.ts`(순수)
- `pickStartUnit(history: {variantKey, weightUnit, completedAt}[], variantKey, legacy)` — 같은 키(null≡'')·단위 명시·가장 늦은 완료 → 그 단위, 없으면 legacy(없으면 kg).
- `planUnitSwitch(sets: {id, weightKg}[], from, to)` — 숫자 유지 환산: `toKg(displayWeight(kg, from), to)`, 0·빈 무게는 그대로.
- `units.ts`: `displayWeight`, `formatEnteredWeight(kg, unit)`.

### 저장소 `workoutRepository`
- `getBlockStartUnit(exerciseId, variantKey)` — 그 종목 블록 중 `weight_unit` 있고 완료된 운동 → `pickStartUnit`. legacy = 프로필 단위.
- `startWorkoutFromRows`: 줄마다 시작 단위를 정해 `we.weightUnit` 에 쓰고, 처방 원판 반올림도 그 단위로.
- `ensureBlockUnit(weId)` — 단위가 비어 있으면 시작 단위를 쓴다(**환산 없음** — 실제 무게 보존). 종목 추가·교체 경로 공용(화면이 블록을 열 때).
- `adoptSlotUnit(weId)` — 칸이 바뀌었고 그 블록에 완료 세트가 없으면 새 칸의 기억 단위로(환산 없음).
- `switchBlockWeightUnit(weId, to)` — Q4 B: 한 번의 write 로 블록 단위 + 세트 kg 재환산. 진행 중 운동만(완료 운동이면 거부).
- 처방 채움(`fillPrescribedLoadsAfter`·`planPrescribedLoadFills`)의 반올림 단위 = 블록 단위.

### 화면
- `ExerciseBlock`: 블록 단위 상태(`we.weightUnit` → 없으면 `ensureBlockUnit`). 메타 줄 PR 칩 뒤에 세그먼트 토글 `[kg|lb]`(작은 알약 두 칸, 켜진 쪽 브랜드색, `aria-pressed`, testid `unit-toggle-kg|lb`). 무게 머리·입력·이전 기록·PR 칩·제안·원판 계산은 블록 단위, **볼륨 칩은 kg**.
- `SetRowEdit`: 표시 `displayWeight`.
- `ActiveWorkout` 라이브 볼륨·`WorkoutSummary` 합계·기록 목록·캘린더·통계·종목 추이·주간 요약 = kg.
- `WorkoutDetailClient`: 세트·편집 시트는 블록 단위, 합계 kg. `getWorkoutDetail` 이 블록 `weightUnit` 을 싣는다.
- 피드: proto `WorkoutExercise.weight_unit`(5, `kg|lb|""`) · Go 서비스 구조체·핸들러 왕복 · 공유 빌더가 블록 단위를 싣는다 · `WorkoutBox` 는 종목별 단위(비면 보는 사람 단위 — 전원 kg).
- `ProfileClient`: 단위 줄·시트 주석 처리, 바 무게·체중 kg.
- `GlobalWorkoutBar`: 링크(`<a>`)와 형제인 취소 버튼(`global-workout-cancel`, 아이콘+라벨) → `ConfirmDialog`(운동 화면과 같은 키) → 폐기.

## 테스트
- 단위(`unitToggle.test.ts`): 100lb 왕복 표시 100 · 102.5lb 그대로 · `pickStartUnit`(같은 칸 최신 · 다른 칸 무시 · 미완료 무시 · legacy) · `planUnitSwitch`(숫자 유지 · 0 유지 · kg→lb→kg 왕복).
- e2e(`unit-toggle.spec.ts`): 블록 lb 전환 → 100×10 → 머리 「무게 (lb)」·볼륨 kg(453.6kg) → 완료 → 다음 운동 같은 종목 lb 로 시작 · kg 100×10 완료 뒤 lb 토글 → 세트 100 유지 · 기록 상세 100lb · 프로필에 단위 줄 없음.
- e2e(`workout-bar-cancel`): 피드에서 막대 취소 → 확인창 취소(유지) → 다시 → 삭제 → 막대 없음·피드 유지·운동 탭 진행 카드 없음.
- 기존 `profile.spec` 「lb 로 바꾸면 세션이 lb」 → 「프로필엔 단위가 없고 세션 블록 토글로 lb」로 교체.

## 리스크
| 리스크 | 대응 |
|---|---|
| 토글을 잘못 눌러 완료 세트 숫자 단위가 바뀜(Q4 B 의 대가) | 토스트 「단위를 lb 로 바꿨어요 — 숫자는 그대로」+ 다시 누르면 원복(왕복 정확) |
| 표시 반올림 불일치(99.99lb) | `displayWeight` 한 곳 · 왕복 테스트 |
| 블록 단위 비어 있는 옛 운동 | null = kg(운영 전원 kg 확인) |
| 칸 바꿀 때 단위 자동 변경이 입력 중 값을 흔듦 | 완료 세트가 있으면 자동 변경 안 함 · 자동 변경은 환산 없이 표시만 |
| 피드 proto 추가 | 옛 앱·옛 글은 필드 없음 → 보는 사람 단위 |

## 출시
v0.38.0 한 번(이 스펙은 execute 까지 — /qa code 는 main 이 별도).

## /qa spec 반영 (2026-10-27 — 조건부 통과)
근거: `.ouroboros/docs/qa/20261027_unit-toggle-spec_qa.md`
| QA | 반영 |
|---|---|
| Q1·Q2 | 세트 무게 표시는 `displayWeight`/`formatEnteredWeight` 한 곳(증분 반올림 금지) — 입력 칸·이전 기록·PR 칩·제안·기록 상세·편집 시트·피드. 합계만 `formatWeight(…, 'kg')` |
| Q3 | 처방 원판 반올림 단위 = 블록 단위(시작 때는 줄별 시작 단위) |
| Q4 | 슈퍼셋 등록부는 각 블록 단위로 kg 를 만든다 — 블록 단위 prop 로 보장 |
| Q5 | 막대 취소는 링크의 형제 버튼(`pointer-events-auto`) |
| Q6 | 토글 토스트 + 재토글 정확 원복(테스트) |
| Q7 | 기억 = 완료 블록 기준(명시) |
| Q8 | lb 원판 계산 보류 |
| Q9 | 얕은 병합으로 옛 클라이언트 안전 |
