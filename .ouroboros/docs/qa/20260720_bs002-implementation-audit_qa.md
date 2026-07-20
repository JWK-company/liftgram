# BS-002 파생 아티팩트 구현 감사 (2026-07-20)

> 워크플로우 산출 문서(아티팩트 아님). 28개 서브에이전트 병렬 감사 — 아티팩트 16건 수용기준↔코드 대조 + 구현완료 주장 7건 적대적 반증 + 테마별 백로그 5건 재판정. 총 646 tool call.
> 방법: 각 아티팩트 본문(ProseMirror doc)에서 수용기준을 항목별로 분해 → `app/src`·`server/src`에서 `path:line` 근거 확보 → **UI 진입점 도달 여부**까지 추적(도메인 함수만 있고 화면에서 안 쓰이면 partial) → full 판정 건은 별도 에이전트가 반증 시도.

## 1. 판정 요약

| 아티팩트 | PLM 상태 | 감사 판정 | 비고 |
|---|---|---|---|
| SRS-028 종목 변형 모델 | Approved | **full** | 반증 실패(확정). 도메인 테스트 81/81 pass |
| SRS-031 종목 찾기 도우미 | Approved | **full** | 반증 실패(확정) |
| SRS-032 종목 자세 미디어 | Approved | **full** | 반증 실패(확정) |
| SRS-034 오늘의 추천 루틴 | Approved | **full** | 반증 실패(확정) |
| SRS-035 주변 헬스장 | Approved | **full** | 반증 실패(확정) |
| SRS-029 세트 로깅 정밀도 | Approved | ⚠ partial | 반증 성공 — 아래 §2-A |
| SRS-030 유산소 통합 기록 | Approved | ⚠ partial | 반증 성공 — 아래 §3-A (실버그) |
| SRS-033 몸무게 기반 유효 볼륨 | Approved | ⚠ partial | 아래 §3-B (실버그) |
| URS-016 변형 분리 기록 | Approved | ⚠ partial | §2-A·2-B |
| UCS-017 변형 선택 시나리오 | Approved | ⚠ partial | §2-A·2-B |
| SAD-019 변형 데이터 모델 | Approved | ⚠ partial | §2-A·2-B |
| ADR-025 다차원 variant 키 | Approved | ⚠ partial | §2-A — supersede ADR 부재 |
| RM-015 P1 코어 강화 | Approved | ⚠ partial | §2-A·2-B |
| SRS-036 카카오 로컬 연동 | Draft | **none** | 정상 — 카카오 REST 키 발급이 블로커. Draft 유지 |
| URS-011 여성·직장인 입문자 | Draft | partial | 정상 — 여성 매칭·검증배지·버디 미구현. Draft 유지 |
| UCS-012 여성 입문자 온보딩 | Draft | partial | 정상 — 성별 필드조차 부재(schema.prisma). Draft 유지 |

**상태 전이 결론**: 상향 전이가 필요한 Draft 아티팩트는 **없음**. 직전 커밋 `791e2ac`에서 SRS-030~035 전이가 이미 완료되었고, 남은 Draft(SRS-036·URS-011~015·UCS-012~016·SRS-021~027·SAD-014~018·ADR-020~024·RM-009~014)는 모두 실제 미구현이 확인되어 Draft가 정확하다. 이번 세션에서는 **BS-002 자신만 Draft→Approved**로 전이했다(백로그 판정 확정 + 본문을 실측치로 갱신).

## 2. 문서-코드 드리프트 (Approved 문서 6건이 코드와 어긋남)

구현이 부족한 게 아니라 **코드가 앞서 나간 뒤 문서가 따라오지 않은** 경우다. 두 갈래 모두 v9~v12에서 의도적으로 바뀐 설계 변경인데, 어느 문서에도 반영되지 않았고 supersede ADR도 없다.

### A. 그립·팔이 "종목 변형 버킷"에서 "세트 속성"으로 이동 (v8/v11)

- `app/src/data/workoutRepository.ts:190-211` `backfillDropGripArmV11()` — 기존 행의 `variant_key`를 기구만으로 재계산하고 `variant_grip`/`variant_arm`을 null로 삭제. `app/App.tsx:95`에서 **부팅마다 실행**.
- `app/src/features/session/ExerciseBlock.tsx:68-70` `recordVariant()` — grip/arm을 항상 null 고정. 즉 `equip:barbell|grip:under|arm:uni` 같은 3차원 키는 **도메인 함수·단위테스트에만 존재하고 UI 경로로는 절대 생성되지 않는다.**
- `app/src/components/VariantSelector.tsx:110` 주석이 "그립·팔은 세트별로 설정(v11/v8)"이라고 명시.
- 대신 세트 단위 `set_logs.grip`/`set_logs.arm`(`schema.ts:151-152`, 주석 "표시전용")에 기록되며 prev/PR/volume 어느 조회에도 필터로 쓰이지 않는다.

**어긋나는 문서**: ADR-025(결정문의 3차원 버킷 · Consequences #19·#26 해소 주장 · "UI 복잡도" 트레이드오프), SAD-019(VariantSelector가 equip·grip·arm 노출 규정), URS-016(AC1·AC2의 "언더그립 vs 뉴트럴그립, 원암 vs 투암" 분리 예시), UCS-017(주 흐름 1 · 대안 흐름 3), RM-015(M1 "(equip·grip·arm) 축으로 이전기록·PR·볼륨이 갈라진다").

### B. `strict_reps` / `load_adjust_kg` 폐기 → `partial_reps` + `load_mode`로 대체 (v9/v12)

- `app/src/db/models/SetLog.ts:19-20`·`app/src/domain/types.ts:63-64` — "(레거시 v6) 폐기 — 하위호환 읽기용". 값을 쓰는 코드 **0건**(dead column), i18n 키 `session.strictReps`(`ko.ts:568`)만 잔존.
- `app/src/domain/volume.ts:17-32` — `strictReps`/`loadAdjustKg` 미참조. `app/src/domain/__tests__/domain.test.ts:273-277`이 "loadAdjust 무시 / strict 무시"를 **명시적으로 단언**.
- 기능 의도는 v9 `partial_reps`(치팅분 볼륨 제외)와 v12 `load_mode`+`bodyweight_kg`(SRS-033)로 대체 구현됨.

**어긋나는 문서**: SAD-019(AnalysisEngine 접점 "유효무게=weight+load_adjust_kg, 유효반복=strict_reps ?? reps"), UCS-017(주 흐름 3·사후조건), RM-015(M2), URS-016(AC3·AC4).

### C. SRS-029 AC1 — 입력 위치가 "세트 행 인라인 컬럼"에서 "▼ 펼침 상세"로 변경

- SRS-029 본문: "세트 행에 정자세 reps **옆으로** 부분반복 입력 **컬럼**이 있고, 크기는 횟수보다 작되 **헤더와 정렬**된다".
- 실제: `ExerciseBlock.tsx:582-600` — ⋯/▼ 토글로 펼치는 상세 패널 안. 헤더(`:349-362`)에 부분반복 셀 없음. 크기도 더 큼(메인 셀 40 vs 상세 입력 42).
- 죽은 스타일 `colPartial`/`partialCell`(`:875-876`)이 인라인 컬럼 구현의 잔해로 남아 있음(참조 0건).
- **원인은 정당함** — 대시보드 아이디어 #36 "휴대폰 보기힘듬(세트별 정보 과밀)" 대응으로 커밋 `f59b3af`·`3e11e17`·`4837dfd`에서 의도적으로 옮긴 것. 문서만 안 따라왔다.

### 권고

1. **ADR-026 발급** — "종목 변형 축 축소(그립·팔 → 세트 속성) + 세트 정밀도 필드 교체" 결정을 기록하고 `supersedes: ADR-025`. ADR-025 스스로 "핵심 리스크는 초기 variant_key 규약 확정"이라 경고했던 지점이 실제로 바뀌었으므로 결정 이력이 남아야 한다.
2. URS-016·UCS-017·SAD-019·RM-015·SRS-029 본문을 현행 구현에 맞게 개정(로컬 SSOT 수정 → plm-sync).
3. 죽은 자산 정리: `colPartial`/`partialCell` 스타일, `session.strictReps` i18n 키, `strict_reps`/`load_adjust_kg` 컬럼(하위호환 유지 여부 결정).

## 3. 실제 버그 2건 (문서 문제 아님)

### A. 유산소 PR 오탐 — 체중이 "최대중량 신기록"으로 잡힘 (SRS-030 AC③ 위반)

- `app/src/data/seed/exercises.seed.ts:196-197` — '러닝'·'걷기'가 `equipment='bodyweight'`로 시드됨.
- `app/src/domain/volume.ts:5-8` `resolveLoadMode` — `equipment='bodyweight'` → `loadMode='bodyweight'` → `:22` `effectiveWeightKg = 체중 + 0 = 체중`.
- `app/src/data/workoutRepository.ts:919-953` `completeWorkout`의 PR 감지 루프에 **`kind='cardio'` 제외 가드가 없음** → `personalRecords.ts:24` `maxWeightKg`가 사용자 체중으로 잡히고 `maxWeight` PR 발생.
- 노출: `workout.prCount`(`:972`) → `WorkoutSummaryScreen.tsx:197-199` 트로피/PR 태그 → 같은 화면 `:121-126` 자동 캡션으로 **피드 게시물에 "PR n개"** 까지.
- 체중을 갱신할 때마다 "걷기 최대중량 신기록"이 반복 발생할 수 있음. 세션 화면에서 PR 줄을 `!isCardio`로 숨긴 것(`ExerciseBlock.tsx:269`)은 표시 억제일 뿐 계산을 막지 못함.
- **수정**: `completeWorkout` PR 루프에 cardio 제외 가드 추가(1~2줄).

### B. 통계탭 1RM이 유효무게 미반영 (SRS-033 AC6 위반)

- `app/src/data/analyticsRepository.ts:195` — `estimateOneRepMax(e.set.weightKg, e.set.reps)`가 enriched set의 `loadMode`/`bodyweightKg`를 무시하고 raw 무게 사용. → `StatsTabScreen.tsx:61` '최근 PR'에 노출.
- `app/src/domain/oneRepMax.ts:17` `bestEstimatedOneRepMax`도 `s.weightKg` raw 사용. → `getExercise1RMTrend`(`analyticsRepository.ts:172`) → `ExerciseDetailScreen.tsx:59` 1RM 추세 차트.
- 결과: **어시스트 종목은 보조무게가 클수록 1RM이 커지는 역설**이 이 두 화면에 남아 있고, 맨몸(가중 0) 종목은 1RM이 0이라 PR이 잡히지 않음.
- **수정**: 위 두 줄을 `effectiveWeightKg`로 전환하면 full 충족.

## 4. BS-002 백로그 최종 판정 (완료 12 · 부분 8 · 반려 3)

상세는 BS-002 본문 참조(본 감사 결과로 전면 갱신됨). 잔여 8건은 BS-002 "잔여 백로그" 절에 우선순위와 함께 기록.

가장 작은 비용으로 닫을 수 있는 것: **#19 그립 표시** — 세트별 그립 기록은 이미 되는데 완료 세션 상세·이전기록에 노출만 안 됨. `WorkoutDetailScreen` 세트 태그 + `LogSetInput`에 grip 포함이면 완료.

---

## 5. 후속 조치 실행 기록 (2026-07-20, 같은 세션)

### 5.1 버그 2건 수정 (§3)

| 대상 | 변경 | 검증 |
|---|---|---|
| 유산소 PR 오탐 | `workoutRepository.ts` — `cardioExerciseIdSet()` 헬퍼 추가 + `completeWorkout`의 `performedByVariant` 적재에서 `kind='cardio'` 종목 `continue`. 볼륨은 이미 0(reps=0)이라 영향 없음 | 리포지토리 계층이라 순수 도메인 테스트 대상 아님. tsc clean |
| 통계탭 1RM 유효무게 미반영 | `analyticsRepository.getRecentPRs` + `domain/oneRepMax.bestEstimatedOneRepMax` → `effectiveWeightKg` 기준으로 전환. §3.6 보존 규칙에 따라 원본 호출을 주석으로 남김 | 회귀 테스트 2건 추가(`domain.test.ts`) — "보조하중↑ → 추정1RM↓" 단언 포함. **83/83 pass** |

이로써 SRS-030 AC③·SRS-033 AC6이 충족되어 두 아티팩트의 partial 사유가 해소되었다.

### 5.2 드리프트 해소 (§2)

- **ADR-026 발급 → Approved** (`decisions/ADR-026.json`) — "종목 변형 축 축소 + 세트 정밀도 필드 교체". `supersedes: ADR-025`, `informs: SAD-019·SRS-028·SRS-029·SRS-033`. 결정 3·4항으로 ADR-025의 유효 메커니즘(canonical key 규약·derived-on-write·단일 등가 필터·machine_variant 흡수)을 명시 승계하고, dead column 보존 정책을 규정했다.
- **ADR-025 → Replaced** (ADR-012→ADR-001, ADR-013→ADR-009 선례와 동일 처리).
- **본문 개정 5건** (status는 Approved 유지 — 본문만 as-built로 정정): URS-016 · UCS-017 · SAD-019 · RM-015 · SRS-029. 각 문서 말미에 "개정 이력" 절 신설.
- **추적 관계 보강**: 개정본이 하중모드·유효무게를 다루게 되어 `SAD-019.refs += SRS-033`, `RM-015.covers += SRS-033`.
- 방법: 문서당 개정 에이전트 1 + 적대적 검증 에이전트 1(총 10). 검증에서 나온 지적 3건(UCS-017 1RM 산식을 곱셈으로 오기, SAD-019 RecordBucketQuery↔집계범위 자기모순, SRS-029 요약화면 집계 항목 누락 + 파일끝 개행 소실)은 전부 반영 수정했다. 메타 무결성(id·type·status·relations)은 5건 모두 보존 확인.
- PLM 동기 완료(8건 upsert, 관계 +2). `/gates` orphan 0.

### 5.3 남은 판단 대상 (미조치)

- **UCS-017 제목** — "종목 변형(그립·팔·기구)을 선택하고…"가 3차원 버킷을 전제하는 뉘앙스로 남아 있다. 본문은 정정됐고 시나리오상 세 축을 고르는 것 자체는 사실이라 오류는 아니나, SRS-028 제목("기구 변형 버킷 + 팔·그립 세트별 기록")처럼 층위를 드러내는 편이 정확하다. 제목 변경은 대시보드 표시명이 바뀌므로 승인 후 처리 권장.
- **dead column 4종 정리** — `strict_reps`·`load_adjust_kg`·`variant_grip`·`variant_arm` + i18n `session.strictReps` + 죽은 스타일 `colPartial`/`partialCell`. ADR-026이 "별도 정리 결정으로 다룬다"로 유보.
- **SRS-030~035가 어느 Roadmap에도 covered되지 않음** — RM-015는 SRS-028·029·033만 커버. 추적 매트릭스 관점의 별도 갭(G1/G2 게이트 대상은 아님).
- BS-002 잔여 백로그 8건(§4).
