# /qa code — 종목 카탈로그 대개편(v0.30.0~v0.34.0) + #61 세션 이동

- 일자: 2026-10-26
- 범위: `git diff 0f3db65..HEAD -- src` (a9be2b9 · 279be00 · 4eafaa2 · 7dfcbdd · cc930d0 · 96a61b0) + 852c61e(#61)
- 방식: 코드 정독, 임시 검증 테스트(실행 뒤 삭제), core 단위 테스트(`node --import tsx --test` 217/217 통과), Go `coaching`·`exercise`·`sync` 패키지 테스트 통과
- 코드는 고치지 않았다.

## 참여 전문가

| 역할 | 전문 분야 | 본 관점 |
|---|---|---|
| 데이터 정합성 감사관 | 이관·정규화의 멱등성, 불변식 | 정규화, 표시 이름 심기, 배수 null=1 |
| 오프라인 동기화 엔지니어 | WatermelonDB sync, LokiJS, 충돌 해결 | 시드 무시, 결정적 id, 스키마 재수신, 경합 |
| PostgreSQL·Go 백엔드 리뷰어 | 마이그레이션, sqlc, 트랜잭션 | 0014·0016, migrate-records, 코칭 리포트 |
| 프론트엔드 성능·UX 엔지니어 | React 렌더 비용, 접근성 | 검색, 표시 이름 훅, 픽토그램, #61 |
| 보안 감사관 | 주입·XSS | SQL·HTML로 들어가는 입력 |

## 요약

| 심각도 | 건수 |
|---|---:|
| 치명 | 0 |
| 높음 | 2 |
| 중간 | 4 |
| 낮음 | 7 |

총평: 이관 계획(`planBlockMigration`)은 멱등이다. 카탈로그 전 종목 × 기구 값 8종 조합을 두 번 적용해 봤는데, 두 번째 적용에서 바뀐 것이 0건이었다. 배수 null=1 처리도 볼륨·PR·1RM·분석·코칭·이관 검증까지 모두 `effectiveMultiplier` 또는 같은 의미의 코드로 통일되어 있다. 문제는 **이관 이후에 새로 생기는 사용**을 이관 때와 같은 규칙으로 처리하는 데서 나온다. 표시 이름 심기가 대표적이고, 이름이 바뀐 142종이 피드 가져오기와 맞지 않는 것도 같은 성격이다.

---

## 높음

### H-1. 바뀐 이름 142종을 처음 쓰기만 해도, 다음 부팅·동기 때 **옛 이름이 표시 이름으로 영구히 심긴다**
- 파일: `src/core/src/migrations/catalogNormalize.ts:59-73`, `src/core/src/domain/catalogMigrationPlan.ts:213-248`, `src/core/src/data/exerciseNames.ts:94`
- 원인: `normalizeCatalogRecords`는 매 부팅과 매 동기 직후에 돈다. 이때 로컬의 **모든** 블록(이관 전에 있던 기록인지 따지지 않는다)으로 `use`를 만들어 `planDisplayNames`에 넘긴다. `planDisplayNames`는 `oldNameKo !== nameKo`인 종목을 사용자가 쓰고 있고 선호 레코드가 없으면 `display_name = 옛 이름`을 낸다. 피커에서 대표 이름을 정확히 쳐서 고르면 `setExerciseDisplayName(id, null)`이 불리지만, 행이 없으면 아무것도 만들지 않고 끝난다(`if (next == null) return;`). 그래서 이 경로로도 막히지 않는다.
- 재현(임시 테스트로 확인): 신규 사용자, 또는 「바벨 인클라인 프레스」(seed-incline-press)를 처음 쓰는 기존 사용자가 목록에서 그 종목을 골라 기록한다. 다음 동기가 끝나면 `pref-seed-incline-press.display_name = "인클라인 프레스 (바벨)"`이 만들어지고 계정 전체에 동기된다. 그 뒤로 운동 화면·루틴·분석·PR 축하·피드 공유가 모두 옛 이름으로 나온다. `planDisplayNames(new Map([['seed-incline-press',1]]))`의 결과는 「인클라인 프레스 (바벨)」이다. 이름이 바뀐 활성 종목은 142개다.
- 수정안: (a) 기기 정규화에서 이름 심기를 **이관 전에 있던 블록**으로 제한한다. 예를 들어 `created_at < 개편 배포 시각`인 블록만 `use`에 넣거나, 「이번 실행에서 옮긴 블록의 원 종목」만 넣는다. (b) 아니면 이름 심기는 서버 이관(이미 58건 심음)에만 맡기고, 기기 쪽은 이관 표식(기기 로컬) 하나로 한 번만 돌린다. (c) 보조 조치로 `setExerciseDisplayName(id, null)`이 행이 없을 때도 `display_name=null` 행을 만들어 「대표 이름을 골랐음」을 남기게 한다. (d) 회귀 테스트로 「이름이 바뀐 종목을 새로 쓰기 시작한 사용자 → 이름을 심지 않는다」를 추가한다. 이미 잘못 심긴 행은 정리 백필이 필요하다. `created_at`이 개편 뒤이고 `display_name = oldNameKo`이며 사용자가 고른 적이 없는 행이 대상이다.

### H-2. 피드 「내 루틴으로 가져오기」가 이름이 바뀐 종목·표시 이름을 찾지 못해 **엉뚱한 커스텀 종목을 만든다**
- 파일: `src/frontend/app/components/feed/WorkoutBox.tsx:82-95` (매칭), `src/frontend/app/components/session/ShareWorkout.tsx:88,98` (공유 이름 = 표시 이름)
- 원인: 가져오기는 `nameKo` 또는 `nameEn`이 정확히 같은지만 본다. 개편으로 142종의 `nameKo`가 바뀌었고, 공유 이름은 이제 사용자별 표시 이름이다(옛 이름이나 「롱풀」 같은 별칭). `aliases`는 매칭에 쓰지 않는다.
- 재현: 개편 전에 올린 오운완에 「인클라인 프레스 (바벨)」이 있거나, 표시 이름이 「로프 푸시다운」인 사용자가 공유한 글을 다른 사용자가 가져온다. 그러면 `createCustomExercise({nameKo:"인클라인 프레스 (바벨)", primaryMuscles:["other"], equipment:"other"})`가 실행된다. 결과는 근육·기구가 「기타」인 커스텀 종목이고, 그 사람의 지난 기록·PR과 갈라진다. 별칭 함축 칸(로프)도 사라진다.
- 수정안: `buildExerciseSearchIndex` 정확 일치(tier 0)로 `nameKo`·별칭·`nameEn`을 모두 찾게 한다. 보관 행의 옛 이름은 대상 종목의 별칭으로 이미 들어 있다. 맞은 별칭이 축을 함축하면 `applyImpliedAxesToRoutineExercise`도 적용한다. 공유 payload에는 표시 이름과 함께 `exerciseId`(시드 id)를 실어, 받는 쪽이 id를 먼저 찾게 하는 편이 근본 해결이다.

---

## 중간

### M-1. 「한쪽 무게로 입력」을 운동 도중에 켜거나 끄면 **이미 완료한 세트의 볼륨·PR이 두 배 또는 절반으로 바뀐다**
- 파일: `src/core/src/data/workoutRepository.ts:997-1015` (`syncBlockLoadMultiplier`), `:1019-1028` (`setPlateOneSideForExercise`), `:824` (swap), `:984` (setVariant)
- 원인: 블록의 **모든** 세트(done 포함)에 배수를 다시 쓰고 무게는 그대로 둔다. 파일 머리 주석은 「과거 세트는 저장된 배수로 의미 보존」이라고 하지만, 같은 세션에서 완료한 세트는 보존되지 않는다. 미완료 프리필 세트도 양쪽 합 기준으로 환산된 값이 그대로 「한쪽」 값으로 다시 해석된다.
- 재현: 플레이트 머신에서 100kg(양쪽 합)으로 3세트를 완료한 뒤 토글을 켠다. 세 세트의 배수가 2가 되어 계산 무게가 200kg이 된다. 완료하면 maxWeight·maxVolumeSet PR이 거짓으로 잡히고 `total_volume_kg`가 부풀어 피드·코칭 리포트에 남는다. 적재 방식을 plate에서 pin으로 바꿀 때는 반대로 절반이 된다.
- 수정안: done 세트는 배수를 건드리지 않는다. 미완료 세트는 `carryWeightAcrossMultiplier(weight, old, new)`로 무게를 환산한 뒤 배수를 바꾼다. 완료 세트가 섞여 있으면 「다음 세트부터 적용」이라고 안내한다.

### M-2. 결정적 id `pref-<종목>` + WatermelonDB의 「created 레코드는 원격이 전부 이김」 → 기기에서 막 만든 선호가 **조용히 사라진다**
- 파일: `src/core/src/data/exercisePrefs.ts:33-60`, `src/core/src/data/exerciseNames.ts:71-101`, (라이브러리) `@nozbe/watermelondb/sync/impl/helpers.js:22-41`
- 원인: `prepareCreate` 중에는 `_changed`가 기록되지 않는다(`Model._setRaw`: `'create' !== _preparedState`일 때만 기록). 그래서 아직 올리지 않은 created 행이 같은 id의 원격 행을 받으면 `resolveConflict`가 원격 값을 전부 덮어쓴다. 상태는 created로 남아, 이후 push가 원격 값을 그대로 다시 올린다.
- 재현: 서버에 `pref-X`(이관이 심은 58건 중 하나, 또는 다른 기기에서 고른 별칭)가 있고, 이 기기는 아직 그것을 받지 못했다. 이 상태에서 오프라인으로 X의 「한쪽 무게로 입력」을 켜거나 별칭을 고른다. 다음 동기에서 `plate_one_side`·`display_name`이 서버 값으로 돌아간다. 진행 중이던 블록의 세트 배수는 2로 남아 선호와 어긋난다.
- 수정안: `pushChanges` 전에 `exercise_user_prefs`에 한해 conflictResolver(`synchronize({ conflictResolver })`)로 「로컬 created 행의 비어 있지 않은 칸 우선」을 적용한다. 또는 선호를 만들 때 `create` 뒤에 `update`를 한 번 더 해서 `_changed`가 남게 한다. 서버 이관이 심은 행에 `display_name`만 넣는 것도 충돌 범위를 줄인다.

### M-3. 카탈로그 생성기가 **이미 적용된 0014를 덮어쓴다** — CSV를 다시 고치면 서버는 바뀌지 않고 기기와 갈라진다
- 파일: `src/scripts/gen-catalog.mjs:34,247`, `src/backend/internal/db/migrate.go:57-74` (파일명으로 한 번만 적용), `src/core/src/migrations/runner.ts:35` (기기는 판 해시로 다시 돎)
- 원인: 생성기 주석에는 「이후 CSV 를 고치면 새 번호의 마이그레이션을 만든다」라고 쓰여 있지만, 코드는 `OUT_SQL`을 0014로 고정해 두었다. `make catalog` → 0014 내용 변경 → 운영 migrate는 skip. 기기는 `catalog-bundle-<새 판>`으로 번들 이름을 반영한다. 그 뒤 `catalogSync`가 서버 개정이 바뀌면 서버의 옛 값으로 다시 덮는다. 결과적으로 이름·보관 상태가 기기와 서버 사이에서 엎치락뒤치락한다.
- 재현: 마스터 CSV에서 종목 하나의 이름을 바꾸고 `make catalog` → 배포한다. 서버 `exercises`는 그대로이고, 기기는 부팅 직후 새 이름을 보였다가 종목 탭을 열면 옛 이름으로 돌아간다.
- 수정안: 생성기가 「적용된 마지막 카탈로그 마이그레이션」과 내용 해시를 비교해, 달라졌으면 **새 번호 파일**(예: `00NN_catalog_rev_<해시>.sql`)을 만들게 한다. `catalog-check`에 「0014 파일이 커밋된 내용과 다르면 실패」를 넣는다.

### M-4. 시드 종목 행을 동기에서 빼면서(D10) **사용자의 시드 종목 「보관」이 다른 기기로 가지 않고, 카탈로그를 다시 받으면 풀린다**
- 파일: `src/core/src/sync/catalogFilter.ts:24-29`, `src/frontend/lib/catalogSync.ts:113`, `src/frontend/app/components/ExerciseAdminBar.tsx:33` (시드도 보관 가능)
- 재현: 기기 A에서 기본 종목 「X」를 보관(목록에서 숨김)한다. 그 결과는 push에서 걸러지므로 기기 B에는 계속 보인다. 서버 카탈로그 개정이 바뀌면 A에서도 `rec.isArchived = it.isArchived`(false)로 다시 보인다. 예전에는 사용자 동기로 B에 전파됐으므로, 이번 변경으로 생긴 기능 퇴행이다.
- 수정안: 사용자별 숨김은 `exercise_user_prefs`에 `hidden` 같은 칸으로 옮겨 계정과 함께 동기한다. 또는 시드 행 중 `is_archived`만 바뀐 경우를 별도 사용자 레코드로 올린다. 목록·피커 필터는 그 칸을 따른다.

---

## 낮음

### L-1. 정규화가 「읽고 → 몇 번 await → 쓰는」 사이에 사용자가 바꾼 블록을 옛 계획으로 되돌릴 수 있다(의심)
- `src/core/src/migrations/catalogNormalize.ts:50-112`: 블록을 fetch한 뒤 prefs·set_logs 조회를 await하고 나서 `prepareUpdate`로 `exerciseId` 등을 덮는다. 같은 모델 인스턴스이므로, 그 사이에 실행된 `swapWorkoutExercise`·`setVariant`의 값이 옛 블록 기준 계획으로 다시 써질 수 있다. 대상이 옛 형식 블록뿐이라 창은 짧다. 수정안: 계획을 `database.write` 안에서 다시 계산하거나, 쓰기 직전에 `exerciseId`·`variantKey`가 계획 때와 같은지 확인한다.

### L-2. `clearBootMarkers`를 부르는 곳이 없다 — 주석(「syncOwner.wipeFor가 표식도 지운다」)과 실제 동작이 다르다
- `src/core/src/migrations/runner.ts:66-69`, `src/core/src/sync/syncOwner.ts` `wipeFor`. 지금은 `seedExercisesIfNeeded`가 번들 값을 채워 실제 피해는 거의 없다. 하지만 이후 데이터 백필이 BOOT_MIGRATIONS에 추가되면, 계정을 비운 DB에서 그 백필이 다시 돌지 않는다. 수정안: `wipeFor`에서 마커 저장소를 받아 `clearBootMarkers`를 호출하고, 카탈로그 `REVISION_KEY`(localStorage)도 함께 지운다.

### L-3. 마이그레이션 번호 구멍(0015 없음) → `make gen-migration`이 **0016을 또 만든다**
- `src/Makefile:132-133`: 파일 수(16개)로 번호를 매긴다. 다음 파일은 `0016_<name>.sql`이 되어 0016 접두가 둘이 되고, 적용 순서가 이름순에 맡겨진다. 수정안: 가장 큰 번호 + 1을 쓰거나, 빈 `0015_reserved.sql`을 둔다.

### L-4. 0014/후속 카탈로그 SQL: 새 시드 이름이 기존 커스텀 종목 이름과 같으면 `exercises_name_ko_unique` 위반으로 **migrate가 실패하고 API가 뜨지 않는다**(잠재)
- `src/database/migrations/0014_catalog_revamp.sql:500-521`: 임시 이름 2단계는 시드끼리의 이름 교환만 막는다. 운영에서는 통과했지만, 다음 카탈로그 SQL에서 같은 위험이 있다. 수정안: 적용 전에 `name_ko`가 커스텀 행과 겹치는지 검사해 커스텀 쪽을 `이름 (내 종목)`으로 바꾸거나, 생성기가 운영 덤프로 미리 확인한다.

### L-5. 공유·가져오기에 배수가 빠져 있다 — 피드의 세트 무게가 「한쪽」 값 그대로 보이고, 가져온 루틴의 목표 무게가 절반이 된다
- `src/frontend/app/components/session/ShareWorkout.tsx:41,93,150` (`{weightKg, reps}`만), `src/frontend/app/components/feed/WorkoutBox.tsx:100-105`. 같은 글의 총 볼륨은 ×2가 반영된 값이라 숫자끼리 맞지 않는다. 수정안: 공유 세트에 `loadMultiplier`를 싣고 표시는 「한쪽 40kg」으로, 가져오기는 `weight × 배수`로 한다.

### L-6. 표시 이름 캐시가 동기·카탈로그 갱신으로는 지워지지 않는다
- `src/frontend/lib/exerciseNames.ts:8-38`: `invalidateExerciseNames`는 이름 고르기·바꾸기에서만 불린다. 다른 기기에서 고른 별칭, 서버 카탈로그 이름 변경, 정규화가 심은 이름은 새로고침할 때까지 반영되지 않는다. 렌더 비용 자체는 문제없다. 쓰는 곳이 세션·루틴 블록뿐이고, 목록·분석은 `getExerciseDisplayNameMap`으로 한 번에 묶어 조회한다(N번 조회 아님). 수정안: 동기 성공 뒤(`syncWithServer.then`)와 `syncCatalogToLocal`의 written>0일 때 `invalidateExerciseNames()`를 호출한다.

### L-7. 옛 PWA(스키마 21)는 pull에 `exercise_user_prefs`가 섞여 오면 동기 전체가 실패할 수 있다(의심)
- 모르는 표를 거르는 코드(`catalogFilter.ts:19`)는 새 앱에만 있다. 서버는 클라이언트 스키마를 모른 채 모든 collection을 내려보낸다. 옛 앱이 서비스워커 갱신 전에 동기하면 `applyRemoteChanges`가 모르는 표에서 예외를 낼 수 있고, 갱신되면 저절로 풀린다. 사용자 2~4명이라 영향은 작다. 수정안: pull 요청에 클라이언트 스키마 버전을 실어, 서버가 모르는 collection을 빼고 보낸다.

### 참고(결함 아님 · 확인함)
- 루틴 행의 `variant_arm='uni'`은 정규화·서버 이관 모두에서 null이 된다(`catalogNormalize.ts:89`, `migrate-records.ts:144`). 루틴에는 세트가 없어 원암 정보가 어디에도 남지 않는다. 다만 예전에도 세트 프리필은 `prev.arm`만 따랐으므로 실제 기록 손실은 없다. ADR-034의 의도대로라면 루틴 편집 화면에서 원암 표시가 사라지는 것만 남는다.
- `swapExerciseInRoutine`은 루틴 안에서 같은 종목인 줄을 **모두** 바꾸고, 새 줄의 칸은 이번 블록 칸이 아니라 「새 종목의 마지막 수행 칸」이 된다. 주석에 적힌 의도대로이고, 다음 시작 때 지난 조합 승계로 수렴한다.

---

## 관점별 확인 결과(결함 없음 포함)

1. **정규화 멱등**: `planBlockMigration`을 전 종목 × {null, barbell, dumbbell, machine, cable, smith, hammer, custom1}에 두 번 적용했을 때 두 번째에 바뀐 블록이 0건이다. 원암을 세트로 내리는 처리는 `arm IS NULL`인 세트에만 적용된다. 대상 종목이 로컬에 없으면 미룬다. 사용자 데이터를 지우는 경로는 없다. pull 직후 정규화는 동기 잠금(`runSynchronize`) 안에서 돌고, 바꾼 것은 `scheduleSync(0)`로 곧바로 올린다. 다른 기기의 옛 형식 push와 주고받는 것은 수렴형이다(무한 루프 없음).
2. **load_multiplier null=1**: `effectiveWeightKg`(볼륨·PR·1RM·분석·ExerciseBlock 실시간 볼륨), `summarizeSlots`, Go `loadMultiplier`(≤0→1), migrate-records 검증 SQL의 `coalesce(nullif(..,0),1)`, `toLoggedSet`·`getCompletedSets`·세션 상세 모두 일관된다. 남은 것은 L-5 공유 payload뿐이다.
3. **기록 칸 키**: 쓰기는 `normalizeVariantDimsV34 → variantColumns`, 읽기는 `dimsFromColumns → canonicalVariantKey`로 같다(arm 제외, 축 순서 고정). `getPreviousExerciseSets`는 `variant_key` 열을, PR은 `effectiveVariantKey`(미러 폴백)를 쓴다. 정규화가 미러를 비우므로 같은 값으로 수렴한다.
4. **스키마 재수신**: `SYNCED_SCHEMA_KEY`는 동기에 성공한 뒤에만 기록되고, `unsafeResetDatabase`가 함께 비운다. 매 부팅 반복되지 않는다. 다만 `flush` 뒤에 `setLocal`을 하므로, 직후에 탭을 닫으면 한 번 더 전량을 받을 수 있다(무해).
5. **서버**: 0014는 트랜잭션 안에서 적용되고(`migrate.go`가 파일마다 BEGIN/COMMIT) `ON COMMIT DROP`이 안전하다. 전 필드 `IS DISTINCT FROM`으로 멱등이다. 0016은 `IS DISTINCT FROM`으로 재적용해도 안전하다. migrate-records는 한 트랜잭션 안에서 볼륨·세트 수·삭제 수·브랜드·보관 참조·dangling·`_status` 불변식을 확인하고, 계획 뒤에 바뀐 행은 `updated_at` 일치 조건으로 건너뛴다. `include_archived`는 옛 클라이언트 기본값이 false여서 호환된다. 코칭 리포트는 서버 카탈로그를 먼저 보고 커스텀 종목으로 폴백한다.
6. **#61**: 부팅 때 `setRepo`·`setWorkout`은 같은 비동기 콜백에서 함께 처리되어(React 18 자동 배칭) 「repo 있음·workout null」이라는 순간 상태가 생기지 않는다. 완료할 때는 `setSummary` 뒤에 `setWorkout(null)`을 같은 틱에 하므로 요약이 먼저 보인다. 다른 탭에서 시작한 운동은 이 탭의 메모리 Loki가 모르므로 `/workout` 진입 시 운동 탭으로 옮겨진다. 예전에는 빈 「빠른 시작」이 떠서 두 번째 운동을 만들 위험이 있었으니 오히려 개선이다. 결함 없음.
7. **프론트 성능**: 검색은 약 480 × 8개 말을 선형으로 훑는다. 피커는 색인을 `useMemo`로 둔다. 종목 탭은 키를 칠 때마다 색인을 다시 만들지만 수 ms 수준이다. 픽토그램 480장을 생성하는 데 실측 11.5ms(평균 2.6KB)가 걸렸고, 모듈은 지연 로드된다. `prefers-reduced-motion`이면 정지 그림 한 장만 보인다(렌더할 때 matchMedia로 판정 — 설정을 바꾸면 다시 그릴 때 반영).
8. **보안**: 픽토그램 SVG는 숫자·상수만으로 만들어진다(`dangerouslySetInnerHTML`에 외부 문자열 없음). 표시 이름·별칭은 React 텍스트로만 렌더된다. migrate-records의 SQL 리터럴은 `'`→`''`로 이스케이프하고(standard_conforming_strings 기본), psql 변수 치환은 따옴표 안에서는 일어나지 않는다. 0014는 신뢰할 수 있는 CSV에서 생성된다. 주입 경로는 찾지 못했다.

## 권장 처리 순서
1. H-1: 표시 이름 심기 범위를 제한하고, 잘못 심긴 행을 정리 백필한다(운영에서 이미 생겼을 수 있음 — `exercise_user_prefs` 중 `created_at` > 이관 시각이고 `display_name = oldNameKo`인 행을 조회).
2. H-2: 가져오기를 별칭으로 매칭하고, 공유 payload에 exerciseId를 싣는다.
3. M-1: 배수 토글은 미완료 세트에만 적용하고 무게를 환산한다.
4. M-3: 생성기 출력 경로를 새 번호 파일로 바꾼다(다음 CSV 수정 전에 반드시).
5. M-2·M-4 → 낮음 항목.

---

## 조치 (2026-10-26 · v0.34.1)

| 항목 | 조치 | 내용 |
|---|---|---|
| H-1 | **수정** | 표시 이름 출처를 「옛 종목(병합 원본)을 가리키는 블록 + 개편(`CATALOG_REVAMP_AT` = 2026-10-26T12:53:26Z) 전에 만든 블록」으로 제한(`displayNameSourceUse`). 만든 시각을 모르면 출처 아님. 대표 이름을 골라도 null 선호 행을 남긴다. 테스트 4건(현 코드에서 실패 확인 후 통과). **운영 정리: 0건** — 운영 `exercise_user_prefs` 58행은 전부 서버 이관(12:55:17Z)이 이관 전 기록으로 만든 것이고, 기기가 잘못 심은 행은 없었다(읽기 전용 조회). 그래서 정리 백필·백업은 하지 않았다. 기기 로컬에만 남은 잘못된 행은 「사용자가 고른 별칭」과 구분할 근거가 없어 지우지 않는다(보고만). |
| H-2 | **수정** | `resolveSharedExercise`: 공유 종목 id → 대표 이름·별칭·영문 **정확** 일치(정규화) → 없으면 커스텀. 맞은 별칭이 칸을 함축하면 가져온 루틴 줄에 적용. 공유 payload 에 `exercise_id`(proto 필드 4)를 싣는다. 테스트 2건. |
| M-1 | **수정** | `planBlockMultiplierResync`: 이미 한 세트(done ≠ false)는 그대로, 안 한 세트만 새 배수로 옮기고 무게를 계산 무게가 같게 환산. 「다음 세트부터 적용」 안내 문구는 보류(동작이 이미 그렇다). 테스트 2건. |
| M-2 | **수정** | `markLocalWins`: 사용자가 만든 선호 행은 정한 칸만 `_changed` 로 표시해 칸 단위로 로컬이 이긴다(정규화가 심는 이름은 표시 안 함 — 다른 기기의 선택이 이긴다). WatermelonDB `resolveConflict` 그대로 테스트 3건. |
| M-3 | **수정** | 생성기는 이미 있는 마이그레이션을 고치지 않는다 — 최근 카탈로그 마이그레이션과 내용이 다르면 「가장 큰 번호+1」 `NNNN_catalog_rev_<판>.sql` 을 새로 낸다. `catalog-check` 가 커밋된 카탈로그 마이그레이션이 바뀌면 실패. 시험: CSV 수정 → 0017 생성·0014 불변, 0014 손수정 → 검사 실패. |
| M-4 | **수정** | 로컬 스키마 v23: `exercise_user_prefs.hidden`. 기본 종목 감추기는 선호에도 적어 계정과 함께 동기, catalogSync 는 숨김을 유지, 정규화가 다른 기기의 숨김을 로컬 행에 반영. |
| L-1 | 보류 | 의심 단계 · 대상이 옛 형식 블록뿐이라 창이 짧다. 재현 근거가 생기면 쓰기 직전 비교를 넣는다. |
| L-2 | **수정** | `wipeFor` 가 부팅 표식·카탈로그 판 표식을 비운다. |
| L-3 | **수정** | `make gen-migration` 이 파일 수가 아니라 최대 번호+1 을 쓴다. |
| L-4 | 보류 | 카탈로그 SQL 템플릿을 바꾸면 곧바로 새 카탈로그 마이그레이션이 생겨 운영에 적용된다 — 다음 카탈로그 수정 때 함께 넣는다. 지금 운영 커스텀 4종과 충돌 없음. |
| L-5 | **수정** | 공유 세트에 `load_multiplier`(proto 필드 5) · 피드 세트 표시와 가져온 목표 무게는 계산 무게(×배수). |
| L-6 | **수정** | 동기 성공·카탈로그 갱신 뒤 표시 이름 캐시를 비운다. |
| L-7 | 보류 | 서버가 클라이언트 스키마를 알아야 한다(계약 변경). 옛 PWA 는 갱신되면 저절로 풀리고 사용자 2~4명이라 영향이 작다. |

검증: core 228/228 · `make verify`(go test 포함) · 별도 로컬 운영 빌드(새 DB, 3200) e2e 11종 56/56 통과(feed·catalog-revamp·record-slots·session·workout·profile-edit·sync·data-safety·catalog·pictogram·routines).
