# _context — 종목 카탈로그 대개편 공유 분석

상세 근거: `.ouroboros/docs/knowledge/20261026_exercise-catalog-asis_knowledge.md`(§A~I, 파일:줄). 여기에는 구현자가 매번 봐야 할 지도만 둔다.

## 1. 카탈로그가 기기에 닿는 길 (개편 후)

```
catalog.master.csv ──gen-catalog.mjs──┬─▶ core/data/seed/exercises.seed.ts ──▶ seedRunner(계정 비울 때) ─▶ 로컬 exercises
                                      ├─▶ core/migrations/catalogMigration.data.ts ──▶ 부팅 이관(미동기 사용자 기록)
                                      ├─▶ database/migrations/0014_catalog_revamp.sql ──▶ 서버 exercises ─PullCatalog─▶ catalogSync(부팅 1회+종목 탭) ─▶ 로컬 exercises(정본)
                                      └─▶ database/migrations/0015_records_migrate.sql ──▶ 서버 sync_records(정본 이관, updated_at↑) ─pull─▶ 기기
사용자 동기(sync_records): exercises 는 is_custom=true 만 push/pull — 시드 행은 무시(D10)
```

- 서버 마이그레이션은 파일명으로 한 번만 적용(`be/internal/db/migrate.go`) — `0002` 는 손대지 않는다.
- sync pull = `updated_at > lastPulledAt`(`0011_sync.sql` 인덱스) → 서버에서 payload 를 고치고 `updated_at=now()` 면 기기가 받는다. 서버는 컬렉션 이름을 검증만 하고 목록을 모른다 → 새 테이블 `exercise_user_prefs` 도 그대로 동기된다.

## 2. 마스터 CSV 열

| 열 | 의미 |
|----|------|
| status | keep · rename · merge · delete · new |
| id_en | nameEn = seed id 원천(`seed-<slug>`). 기존 값 불변 |
| old_name_ko / new_name_ko | 기존 / 대표 이름(ADR-035) |
| equipment · primary · secondary · kind · load_mode | 시드 필드(ezbar·trapbar 신설) |
| family | 동작 그룹 — 기구 바꾸기·비슷한 운동·픽토그램 자세 단위. family 안 기구 유일 |
| aliases_ko · aliases_en | 검색·표시 이름 후보(공백 무시 유일) |
| merge_into · implied_axes | merge/delete 대상과 함축 축(`attach=rope;grip=under;arm=uni;brand=hammer`) |
| similar | 「비슷한 운동」 family/id |
| media | `fedb:<id>`(퍼블릭 도메인 사진) · `inherit:` · `gen`(픽토그램만) |
| usage_sets · note | 운영 세트 수 · 판단 메모 |

## 3. 이관 매핑 규칙 (서버·기기 공통 — 생성기가 한 표로 만든다)

1. **종목 병합/삭제**: `exercise_id = 원본` → `대상`, implied axes 를 블록 변형에(brand·attach·grip) · arm=uni 는 그 블록의 세트들 `arm` 에.
2. **기구 변형 칸 → 형제 종목**: 블록의 `variant_equipment ∈ implement(barbell·dumbbell·cable·smith·kettlebell·band·machine)` 이고 종목 고유 기구와 다르면 → 같은 family 에서 그 기구의 종목으로 `exercise_id` 교체, `variant_equipment=null`.
3. **비머신 종목 + 브랜드 키**: 같은 family 의 머신 종목으로 교체 + 브랜드 승계(D9: 덤벨 OHE+newtech → 머신 OHE+newtech, 딥스+technogym/cybex → 머신 딥스, 인클라인(바벨)+hammer → 머신 인클라인 프레스 등).
4. 대상이 없으면 **옮기지 않고** 리포트에 남긴다(엉뚱한 종목 금지).
5. 모든 쓰기 후 `variant_key` 를 ADR-034 정규화로 재계산, `machine_variant` 미러 비움.
6. 멱등: 이미 규칙의 결과 상태면 아무것도 안 한다.

## 4. 코드 지도 (주요 수정 지점)

| 영역 | 파일 |
|------|------|
| 시드·적재 | `core/data/seed/exercises.seed.ts` · `core/data/seedRunner.ts` · `src/scripts/gen-catalog.mjs`(신규) |
| KEY 참조(→ seed id) | `core/domain/exerciseFinder.ts` · `core/data/seed/substitutes.seed.ts` · `core/data/exerciseMedia*.ts` · `core/domain/movementPatterns.ts` · `core/domain/conceptRoutines.ts` · `core/data/workoutRepository.ts`(V8/V10/V12 목록) |
| 변형 | `core/domain/variants.ts` · `core/domain/machineVariants.ts` · `fe/app/components/ui/VariantSelector.tsx` · `core/data/workoutRepository.ts`(setVariant·resolveStartVariant·swapWorkoutExercise·completeWorkout) · `core/data/routineRepository.ts` |
| 스키마 | `core/db/schema.ts`(v22) · `core/db/migrations.ts` · Model 파일 |
| 동기 | `core/sync/syncEngine.ts` · `fe/lib/catalogSync.ts` |
| 검색·표시 | `fe/app/components/ExercisePicker.tsx` · `fe/app/components/CatalogClient.tsx` · `fe/app/components/session/ExerciseName.tsx` · `core/domain/exerciseName.ts` |
| 서버 | `src/proto/exercise/v1/exercise.proto` · `be/internal/exercise/*` · `database/queries/exercise.sql` · `database/migrations/0014·0015` |
| 테스트 | `core/domain/__tests__/catalogGap.test.ts` · `domain.test.ts` · `variantBucket.test.ts` · 신규 `catalogRevamp.test.ts`·`catalogMigration.test.ts`·`exerciseSearch.test.ts` · e2e |
