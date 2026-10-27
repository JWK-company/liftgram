# Feature Spec — 운동 중 보조: PR 칩·PR 기록 바로잡기·슈퍼셋 함께 완료·처방 무게 기준

> 생성일: 2026-10-27 · 등급: **Feature** (core 도메인·저장소 + 프론트 운동 화면·루틴 편집·기록 상세 + coaching proto 필드 · 로컬 스키마 변경 없음)
> 추적: SRS-061 · SRS-062 · SRS-063 (URS-020) · 피드백 #50 · #51 · #48 · #56 · 출시 **v0.36.0**
> 확정 결정(2026-10-27 사용자): 50 A · 51 A · 48 A · 56-1 A · 56-2(해석 승인) · 56-3 A

## 작업 의도
운동 중 손을 덜 쓰게 한다. PR 을 눌러 바로 다음 세트에 쓰고, 잘못 남은 PR 은 그 기록으로 가서 바로잡고, 슈퍼셋은 한 번에 완료하고, % 처방은 계산된 무게로 받는다.

## 확정 결정
| # | 결정 |
|---|------|
| D1 | 종목 머리에 **중량 PR**·**볼륨 PR** 칩 2개(같은 세트면 1개). 탭 = **아직 안 한 첫 세트 하나**에 무게·횟수 채움 (#50 A) |
| D2 | 칩 ⋯/길게 누르기 「기록 보기」 = PR 출처 세션 상세의 그 세트로 이동 → 거기서 고치기·지우기. PR 은 기록에서 재계산, 초기화 기준점 없음 (#51 A) |
| D3 | 슈퍼셋 세트 체크 = 묶음 전체의 같은 번호 세트 함께 완료·해제, 휴식 1회. **길게 누르기 = 그 종목만**. 같은 번호 없는 종목은 건너뜀 (#48 A) |
| D4 | 처방 무게 기준 `pct1rm`·`pctTop`·`fixed` — 작성자는 **본인·트레이너 모두**(#56-1 A). 1RM = **기록으로 추정한 값**(#56-3 A). 기록 없으면 직접 무게 또는 첫 세트 기준(#56-2) |
| D5 | 채움은 사람이 쓴 처방의 계산일 뿐 — 처방은 바꾸지 않고 근거를 표시(ADR-028) |

## 설계

### PR 칩 (SRS-061)
- core `workoutRepository.getExercisePRs(exerciseId, variantKey)` 신규(기존 `getExercisePR` 보존): 같은 칸의 완료 세션 워킹 세트(워밍업·실패 제외)에서
  - `weight`: 유효 무게 최대(동률 시 횟수) · `volume`: `setVolumeKg` 최대 — 둘 다 `{ weightKg(입력 무게), reps, effectiveKg, setLogId, workoutId, completedAt, loadMultiplier }`.
  - 규칙은 `personalRecords.snapshotFromSets` 와 같게(도메인 순수 함수 `pickPrSets(sets)` 로 뽑아 테스트).
- 프론트 `ExerciseBlock`: 기존 `pr-chip` 한 줄 → `pr-chip-weight`·`pr-chip-volume`. 탭 → 아직 `done=false` 인 첫 세트에 `updateSetLog(weight, reps)`. 한쪽 입력 블록이면 `입력 무게 = PR 총 무게 / 블록 배수`.
- 「기록 보기」 → `/history/{workoutId}?set={setLogId}`.

### 기록 상세 세트 편집 (SRS-061)
- `WorkoutDetailClient`: 세트 줄 탭 → 편집 시트(무게·횟수·삭제). 저장소 `updateSetLog`/`deleteSetLog` 재사용.
- 편집 뒤 `recomputeWorkoutTotals(workoutId)` 신규: `total_volume_kg` 재계산 + 그 종목이 들어 있는 **이후 완료 운동들의 `pr_count`** 를 시간순으로 다시 센다(completeWorkout 의 PR 판정과 같은 함수 — 판정 로직을 `countWorkoutPrs(workout, historyBefore)` 로 추출). 사용자 2명 · 수백 세션이라 비용 작음.
- `?set=` 로 열리면 그 세트로 스크롤·강조.

### 슈퍼셋 함께 완료 (SRS-062)
- 판정은 `ActiveWorkout` 의 `SupersetContainer` 가 묶음 멤버를 안다 → 세트 체크를 그룹 핸들러로 올린다.
- **입력 중 값**: 각 `SetRowEdit` 는 무게·횟수를 blur 때 저장한다. 그룹 완료 전에 멤버들의 미저장 입력을 반영하려고 세션 수준 `draftRegistry`(setLogId → {kg, reps}) 를 두고 SetRowEdit 가 입력할 때마다 등록한다.
- core `completeSupersetRound(entries: {setLogId, weightKg?, reps?}[], done)` 신규: 한 `database.write` 로 값 반영 + done 토글.
- 휴식: 누른 블록의 휴식 규칙(세트 타입별) 1회. PR 축하·다음 세트 제안은 멤버별로 기존 함수.
- 길게 누르기(500ms) = 기존 단일 토글. 접근성: 체크 버튼 aria-label 에 「묶음 함께 완료」, 길게 누르기 대안으로 ⋯ 메뉴 「이 종목만 완료」.

### 처방 무게 기준 (SRS-063)
- 도메인 `prescription.ts`: `PrescribedSet` 에 optional `loadBasis?: 'pct1rm' | 'pctTop' | 'fixed'`, `loadPct?: number`, `loadKg?: number`. `sanitizePrescriptionValue` 가 범위 검사(pct1rm 30~100 · pctTop 50~100 · fixed 0~500). 없으면 기존과 동일.
- 순수 함수 `resolvePrescribedLoad({ basis, pct, kg, est1rm, topKg, equipment, unit })` → `{ weightKg, reasonKey, params } | { pending: 'needFirstSet' | 'needTop' }`. 반올림: 바벨·스미스·EZ바·트랩바 2.5kg, 그 밖 1kg(lb 는 5/2.5lb).
- 추정 1RM: 같은 종목·칸의 완료 워킹 세트 `bestEstimatedOneRepMax`(유효 무게·배수 반영). 한쪽 입력 블록이면 결과를 배수로 나눠 입력 칸에 넣는다.
- 적용 시점: ① `startWorkoutFromRoutine` 의 세트 프리레이(`prepareTemplateSets`)에서 pct1rm·fixed 채움 ② 탑셋 완료 시(`ExerciseBlock.onToggleDone` 의 기존 cascade 자리) pctTop 세트, 그리고 기록 없는 pct1rm 세트(첫 완료 세트로 1RM 추정) 채움 — **그 세트가 아직 프리레이 값 그대로일 때만**(블록 마운트 때 프리레이 값을 기억해 비교), 아니면 기존 제안 칩으로.
- 근거 표시: 세트 줄 아래 작은 글씨 「1RM 100kg 의 80%」·「탑셋 100kg 의 90%」(i18n).
- 맨몸·어시스트(load_mode ≠ external) 종목은 % 기준을 고를 수 없다(편집기에서 숨김).
- 작성 UI: 루틴 편집기 `PrescriptionEditor` 와 코칭 `PrescriptionEditor` 둘 다 「무게 기준」 선택 + 값.
- 코칭 경로: `proto/coaching/v1/coaching.proto` `PrescribedSet` 에 `LoadBasis load_basis = 6; int32 load_pct = 7; double load_kg = 8;` + `make proto` + Go `prescriptionPB/prescriptionDomain` 매핑 + 서버 저장 경로 확인.

## 테스트
- 단위: `pickPrSets`(중량/볼륨 분리·동률·워밍업 제외·배수) · `resolvePrescribedLoad`(1RM%·탑셋%·직접·반올림·기록 없음 pending·범위 밖) · `sanitizePrescriptionValue` 옛 JSON 하위호환 · `countWorkoutPrs` 재계산.
- e2e: PR 칩 2개·탭 채움 · 기록 보기 → 세트 삭제 → 칩 변경 · 슈퍼셋 체크 1번 = 멤버 완료·휴식 1회·입력 중 값 반영 · 길게 누르기 단일 · % 처방 루틴 시작 → 무게·근거 · 탑셋 완료 → 백오프 채움.

## Phase (한 번에 출시 v0.36.0)
1. 도메인 순수 함수 + 테스트(먼저)
2. 저장소(getExercisePRs·completeSupersetRound·recomputeWorkoutTotals·프리레이 % 채움)
3. 화면(PR 칩·기록 상세 편집·슈퍼셋 그룹 체크·처방 편집기 2곳·근거 표시) + proto/Go
4. e2e · make verify · /qa code · 배포 · PLM #50·#51·#48·#56 완료

## 리스크
| 리스크 | 대응 |
|---|---|
| 그룹 완료가 멤버의 입력 중 값을 놓침 | draftRegistry + 한 번의 write · e2e 로 고정 |
| 과거 세트 편집 뒤 PR 수 캐시 불일치 | recomputeWorkoutTotals 가 이후 운동까지 시간순 재계산 |
| % 채움이 사용자가 고친 값을 덮음 | 프리레이 값 그대로일 때만 채움, 아니면 제안 칩 |
| 코칭 proto 필드 누락 → 트레이너 % 처방 유실 | proto·Go 매핑·왕복 테스트 |

## /qa spec 반영 (2026-10-27 — 조건부 통과 → 아래가 위 설계보다 우선)
근거: `.ouroboros/docs/qa/20261027_session-assist-spec_qa.md`

| QA | 바뀐 결정 | 적용 |
|---|---|---|
| Q1 | Go `coaching.PrescribedSet` + `SanitizePrescription` 에 `loadBasis·loadPct·loadKg` 추가(범위 검사) — 트레이너 편집이 회원 % 처방을 지우지 않게 · 왕복 테스트 | 설계 「코칭 경로」 |
| Q2 | PR 수 재계산은 `completedAt < 대상` 운동만 이력으로 보는 새 함수(기존 `historicalSnapshotForExercise` 보존) · 시간순 재계산 테스트 | recomputeWorkoutTotals |
| Q3 | draftRegistry 에 누른 행 포함 · `completeSupersetRound` 가 값 반영 → done 한 번의 write | 슈퍼셋 |
| Q4 | `getExercisePRs` 는 `inputWeightKg`·`effectiveKg` 분리, 칩 채움은 입력 무게(+배수 환산) | PR 칩 |
| Q5 | % 채움 조건 = 세트가 done=false 이고 **편집되지 않음(updated_at == created_at)** — 메모리 기준값 대신 | 처방 적용 시점 |
| Q6 | 그룹 완료의 PR 축하는 모아서 토스트 1회 | 슈퍼셋 |
| Q7 | 기록 상세 편집은 근력 세트만(유산소는 삭제만) | 기록 상세 편집 |
| Q8 | 반올림 v1 = 바벨류 2.5kg·그 밖 1kg(lb 5/2.5) 고정 | resolvePrescribedLoad |
