# /qa spec — 종목 카탈로그 대개편 (20261026_exercise-catalog-revamp)

- 검토일: 2026-10-26 · 대상: `spec.md`·`_context.md`·`_analysis.md`·`catalog-master.csv`(480행)·`catalog-review.md`·ADR-033~037·현황 지식 · 코드 대조(읽기 전용)
- 범위: D1~D11 은 확정 결정으로 보고 다시 따지지 않았다. **구현 전에 고쳐야 할 스펙 결함만** 적었다.
- 경로 약어: `core/`=`src/core/src/` · `fe/`=`src/frontend/` · `be/`=`src/backend/` · `db/`=`src/database/` · 스펙 줄=`spec.md:N`

## 참여 전문가

| 역할 | 전문 분야 | 본 관점 |
|---|---|---|
| 데이터 이관 감사관 | PostgreSQL jsonb 이관·트랜잭션·검증 쿼리 | 0014/0015 의 안전성, 멱등성, 합계 검증 정의, ROLLBACK |
| 오프라인 동기 아키텍트 | WatermelonDB/LokiJS 동기·스키마 진화 | 기기와 서버 이관의 경합·수렴, D10 부작용, v22 하위호환 |
| 운동 도메인 전문가 | 종목 분류·기구·변형 축 | CSV 매핑의 정확성, family·축 허용값, 이름 규칙 |
| QA 엔지니어 | 단계별 배포·회귀·게이트 설계 | Phase 사이 배포 상태의 안전성, 테스트가 실제로 막는지 |

## 요약

| 심각도 | 건수 | 항목 |
|---|---|---|
| 차단 | 3 | B1 `load_multiplier` 기본값 · B2 이관 표식이 계정 동기됨 · B3 0015 실패 = 서비스 중단 |
| 높음 | 9 | H1~H9 |
| 중간 | 7 | M1~M7 |
| 낮음 | 6 | L1~L6 |

---

## 차단

### B1. `set_logs.load_multiplier`「기본 1」은 WatermelonDB에서 0이 된다. 기존 세트 볼륨·PR이 전부 0으로 계산된다 (오프라인 동기 아키텍트)
- **근거**: `spec.md:117`(1.3 「`set_logs.load_multiplier`(기본 1)」) · `spec.md:118`(1.4 볼륨·1RM·PR 에 반영). WatermelonDB는 컬럼 기본값을 지원하지 않는다. `app/node_modules/@nozbe/watermelondb/RawRecord/index.js:49-55`를 보면 non-optional number는 값이 없거나 잘못되면 **0**, optional은 **null**이 된다. `addColumns` 마이그레이션도 기존 행을 같은 규칙으로 채운다. 서버 payload에도 이 키가 없으니 pull로 받은 1,514세트도 같은 값이 된다. 「무게×횟수×배수」로 계산하면 전부 0이 나온다.
- **수정안**: 1.3에 「`load_multiplier`는 `isOptional: true`로 두고 **null = 1**로 해석한다(읽기 헬퍼 `effectiveMultiplier(s) = s.loadMultiplier ?? 1` 하나로 통일)」를 추가한다. 1.4에는 단위 테스트를 추가한다: 「v21 세트를 v22로 마이그레이션한 뒤 볼륨이 그대로인지」, 「payload에 키가 없는 pull 세트의 볼륨이 그대로인지」. ADR-037의 「피드 공유」와 서버 코칭 볼륨(H4)도 같은 헬퍼 규칙을 쓰게 한다.

### B2. 부팅 이관의 버전 표식을 `app_prefs`에 두면 계정과 함께 동기된다. 미동기 기기가 이관을 건너뛴다 (오프라인 동기 아키텍트)
- **근거**: `spec.md:99`(0.4 「버전 표식(`app_prefs`의 `migration_version`…)」). `core/db/schema.ts:29`에 따르면 `app_prefs`는 v21에서 「계정과 함께 옮기는」 `user_profiles` 컬럼이다. 동기되는 값이라는 뜻이다. 기기 A가 이관을 마치고 표식을 올리면, 미동기 기록을 가진 기기 B는 pull로 그 표식을 먼저 받는다. 그러면 B는 이관을 건너뛰고 옛 칸 그대로 push한다. 프로필이 기기마다 따로 생긴 사례(한 계정 14개, `core/sync/syncEngine.ts:247-250` 주석)도 있어서, 어느 프로필의 표식을 볼지도 정해져 있지 않다.
- **수정안**: 0.4의 표식 위치를 **기기 로컬 전용**으로 바꾼다. 웹은 `localStorage`나 별도 IndexedDB 키, 네이티브는 기기 KV를 쓴다. `syncOwner.wipeFor` 뒤에는 표식을 초기화한다. 「표식은 동기 대상 컬럼에 두지 않는다」는 단위 테스트를 추가한다. 더 근본적인 해결은 H1처럼 이관을 표식 없이 매번 멱등하게 도는 정규화로 만드는 것이다.

### B3. 0015 「합계가 다르면 ROLLBACK」은 이 마이그레이터에서 서비스 중단으로 이어진다. 0014만 커밋된 반쪽 상태도 남는다 (데이터 이관 감사관)
- **근거**: `spec.md:139`(2.5) · `spec.md:180`(「0015는 합계 불일치 시 자동 ROLLBACK」). `be/internal/db/migrate.go:81-93`은 파일 하나를 트랜잭션 하나로 실행하고, 실패하면 오류로 종료한다. `src/compose.yaml:119`은 `backend`가 `migrate: service_completed_successfully`를 기다리게 한다. 따라서 0015가 RAISE하면 백엔드가 뜨지 않는다. 배포 스크립트(`src/scripts/deploy-h2500-3.sh:95-98` `up -d --wait`)도 이 상태를 되돌리지 않는다. 0014는 앞선 별도 트랜잭션에서 이미 커밋된 뒤다. 그 결과 「카탈로그는 개편됨 + 기록은 미이관 + API 중단」 상태가 된다. 또 SQL 파일 안에 `ROLLBACK`을 직접 쓰면 pgx 트랜잭션과 충돌한다.
- **수정안**: 2.5를 다음처럼 바꾼다.
  - ① 0015는 `migrations/` 자동 적용 대상에서 뺀다. 대신 `be/cmd/migrate-records`(또는 `make records-migrate`)로 `--dry-run`/`--apply`를 명시해 실행하는 별도 one-shot으로 만든다.
  - ② 검증 실패는 `DO $$ … RAISE EXCEPTION $$`로 그 명령의 트랜잭션만 되돌린다. API는 계속 뜬다.
  - ③ 0014는 0015 없이도 앱이 동작하도록 설계한다. 기기 부팅 이관이 로컬 데이터를 고치므로 가능하다.
  - ④ 배포 절차는 `pg_dump` → 0014 자동 → 드라이런 리포트 확인 → `--apply` 순서로 고정한다(2.6과 같은 줄).

---

## 높음

### H1. 수렴하려면 이관이 「매 pull 뒤 멱등 정규화」여야 한다. 지금 설계는 한 번 돌고 끝난다 (오프라인 동기 아키텍트)
- **근거**: `_analysis.md:13`은 「첫 pull 전 1회 + pull 뒤 1회」라고 하지만, `spec.md:99`(0.4)는 버전 표식이 있으면 1회만 실행한다. 둘이 모순이다. 서버 push는 충돌 검사 없이 payload를 통째로 덮는다(`db/queries/sync.sql:22-34` `payload = EXCLUDED.payload`, `core/sync/syncEngine.ts:235-236`은 lastPulledAt을 보내지 않는다). 그래서 0015 뒤에도 옛 JS(갱신 전 PWA 캐시)를 쓰는 오프라인 기기가 옛 `exercise_id`·`equip:dumbbell` 레코드를 다시 올릴 수 있다. 이미 표식을 올린 다른 기기는 그 레코드를 pull해도 다시 이관하지 않는다. 0015도 다시 돌지 않는다. 옛 칸이 영구히 남는다.
- **수정안**: 2.4 `catalogMigration`을 「버전 1회」가 아니라 **pull 직후마다 도는 멱등 정규화**로 정의한다. 대상은 받은 changes에 포함된 `workout_exercises`·`routine_exercises`이고, 변경이 없으면 no-op이다. `syncEngine.runSynchronize`의 pull 적용 뒤, push 전에 실행한다. 0.4 러너는 스키마 데이터 백필에만 표식을 쓴다. 테스트를 추가한다: 「0015 이후 옛 형식 레코드가 pull로 들어와도 같은 결과로 수렴하는지」(`catalogMigration.test.ts`).

### H2. 스키마 v21에서 v22로 넘어갈 때 커서를 되감지 않아 새 컬럼이 영구 유실된다. 서버 upsert도 모르는 키를 지운다 (오프라인 동기 아키텍트)
- **근거**: `core/sync/syncEngine.ts:238-239`에서 migration sync를 쓰지 않는다. v21 기기(옛 PWA)가 0015 결과(`variant_attach=rope` 등)를 pull하면 WatermelonDB가 모르는 컬럼을 버린다. 그래도 커서는 전진한다. 그 기기가 v22로 올라오면 그 값을 다시 받지 못한다. 2.4의 「이미 대상이면 건너뜀」(`_context.md:40`)이 `exercise_id`만 보면 attach는 null로 남는다. 다음 편집 때 그 null이 push되어 서버의 rope까지 지운다. 서버 upsert는 payload를 통째로 교체하므로(`db/queries/sync.sql:32`) 옛 스키마 클라이언트의 push도 새 키를 지운다.
- **수정안**: 1.3에 「로컬 `SCHEMA_VERSION`이 올라간 첫 부팅에는 lastPulledAt을 0으로 초기화해 전량 다시 받는다(사용자 2명·레코드 수천 건이라 비용이 작다)」를 추가한다. 2.3 또는 별도 작업으로 `UpsertSyncRecords`를 `payload = sync_records.payload || EXCLUDED.payload`(얕은 병합)로 바꾼다. 클라이언트는 자기 스키마 컬럼을 전부(null 포함) 보내므로, 남는 것은 옛 클라이언트가 모르는 키뿐이다. 2.4의 멱등 판정은 `exercise_id`만이 아니라 **목표 상태 전체(exercise_id·variant 컬럼·variant_key)**를 비교하도록 바꾼다.

### H3. D10이 새 기기의 카탈로그 공급 경로를 끊는다. 부팅 이관의 대상 종목도 로컬에 없을 수 있다 (오프라인 동기 아키텍트)
- **근거**: 처음 로그인하는 기기는 `reconcileAccount`가 `adopted`를 반환하고 시드를 심지 않는다(`core/sync/syncOwner.ts:64-69`). 시드는 `wipeFor`(:99-105)에서만 심긴다. 웹 카탈로그는 번들 시드가 아니라 서버에서 받는 구조다(`fe/lib/catalogSync.ts:8-11`). catalogSync는 종목 탭에서만 호출된다(`CatalogClient.tsx:76-83,148-149`). 지금 새 기기의 카탈로그는 사실상 **sync pull로 받는 시드 행(운영 999행)**이 채운다. D10으로 그 경로가 막히면, 0.5의 「부팅 백그라운드 catalogSync」가 실패하거나 늦을 때(오프라인 헬스장) 기록 화면의 종목 이름이 사라진다(`getExercise` find 실패). 또 2.4는 「첫 동기 전」에 돈다(`spec.md:99`). 이때 신규 대상 종목(예: `머신 오버헤드 트라이셉스 익스텐션`, CSV 234행)이 로컬에 없으면 `exercise_id`가 없는 행을 가리키게 된다.
- **수정안**: 0.4·0.5에 순서를 명시한다. 「부팅 순서 = ① 번들 시드 top-up(`seedExercisesIfNeeded`를 매 부팅 실행, 신규 필드와 archived 상태 포함) → ② 이관/정규화 → ③ 동기 → ④ catalogSync(온라인일 때 덮어쓰기)」. 2.4에 사전조건을 추가한다: 「대상 id가 로컬에 없으면 옮기지 않고 다음 부팅에 재시도」. 테스트를 추가한다: 「빈 DB + 오프라인 + 서버 기록 pull 상태에서 모든 블록의 종목이 해석되는지」.

### H4. 서버 코칭 리포트가 종목 정보를 sync_records의 `exercises`에서 읽는다. D10 뒤에는 신규·이관 대상 종목의 근육·이름이 비고, 옛 이름이 남는다 (데이터 이관 감사관)
- **근거**: `be/internal/coaching/report.go:28-29`(수집 대상 collection에 `exercises` 포함) · `:142-145`(근육 해석) · `:236-239`(루틴 종목 이름은 `name_ko`). D10 뒤에는 신규 144종과 이관 대상 종목이 sync_records에 올라오지 않는다. 그래서 부위별 볼륨이 `other`로 몰리고, 트레이너가 보는 루틴 종목 이름은 빈 값이 된다. 남아 있는 999행은 옛 이름 18건을 그대로 보여 준다. 볼륨 계산(`:163`)도 `load_multiplier`를 무시한다. 스펙 백엔드 범위(`spec.md:62`, 5개 파일)에는 coaching이 빠져 있다.
- **수정안**: 2.3에 「coaching report는 종목 해석을 서버 `exercises` 테이블에서 먼저 하고, 커스텀만 sync_records로 보완한다. 볼륨은 `weight_kg×reps×coalesce(load_multiplier,1)`로 계산한다」를 추가한다. `report_test`에 「신규 시드 id 블록의 근육·이름이 해석되는지」를 추가한다.

### H5. Phase 2와 Phase 4 사이(v0.31~v0.32)에 기구 변형 칩이 남아 있어 이관 직후부터 새 `equip:dumbbell` 칸이 다시 생긴다. 이관이 붙인 부착물·그립 칸은 화면에서 보이지도 바꾸지도 못한다 (QA 엔지니어)
- **근거**: implement 칩 제거는 `spec.md:163`(4.1, v0.33)에 있다. 성공 기준 2(「equip:(implement) 세트 0」, `spec.md:46`)는 Phase 2 직후부터 다시 깨진다. 0015는 한 번만 돈다. Phase 2는 `로프 푸시다운`을 `케이블 푸시다운 + attach=rope`로 옮기지만(CSV 61행), 부착물 선택 UI는 4.2에서야 나온다. 그 사이 모든 푸시다운이 「지난 조합 승계」로 rope 칸에 쌓인다. 일자바로 한 날도 rope 칸에 섞인다. 표시 이름(3.3)도 Phase 3 전에는 없어서 「로프 푸시다운」 기록이 「케이블 푸시다운」으로만 보인다.
- **수정안**: 2.4 또는 새 2.8을 추가한다. 「VariantSelector의 implement 칩을 Phase 2에서 제거하거나, 같은 family 종목으로 swap하는 동작으로 바꾼다(4.1의 최소판)」. 「VariantSelector에 attach·grip **표시 칩(읽기와 해제만)**을 Phase 2에 넣는다」. 대안은 attach·grip을 함축하는 병합(로프·리버스 그립 푸시다운·클로즈그립 풀다운·원암 랫풀다운·와이드 그립 푸시업)만 Phase 4 배포로 미루는 것이다. 각 Phase 체크포인트에 「이 버전에서 새로 만들 수 있는 칸이 ADR-034를 위반하지 않는가」를 추가한다.

### H6. 매핑 표에 구멍이 있다. 같은 family에 대상이 없는 운영 칸과 커스텀 슬롯의 처리가 정해져 있지 않고, 규칙을 적용하는 순서도 없다 (운동 도메인 전문가)
- **근거**:
  - `체스트 서포티드 티바 로우 + equip:machine` 1건(지식 §H.3): CSV 182행의 family `chest_supported_t_bar_row`에는 barbell밖에 없다. 규칙 2(같은 family, `_context.md:36`)로는 대상이 없어서 규칙 4에 따라 남는다. 그런데 `catalog-review.md` A20은 다른 family인 `머신 체스트 서포티드 로우`(CSV 124행, `chest_supported_row`)로 옮긴다고 적었다. 이대로면 성공 기준 2가 깨진다.
  - 비머신 종목의 브랜드·커스텀 키: `트라이셉스 푸시다운+cybex`(pushdown family에 머신 없음, CSV 60·394행), `로프 푸시다운+custom1`, `케이블 레터럴 레이즈+custom1`, `시티드 케이블 로우+custom1`, `밀리터리 프레스+custom2`×2(지식 §H.3). 규칙 3은 「브랜드 키」만 말하고 `custom1~3`이 여기에 들어가는지 말하지 않는다. custom2가 머신 숄더 프레스로 잘못 옮겨질 수도 있고, 비머신 종목에 화면에 안 보이는 고아 칸으로 남을 수도 있다. D2가 비머신의 equip 축을 없애므로 이 칸은 더 이상 고를 수 없다.
  - 병합(규칙 1)과 규칙 2·3이 겹칠 때의 순서가 없다. 예: `로프 푸시다운+custom1`은 먼저 병합해 cable이 된 뒤 규칙 3을 다시 볼지 정해져 있지 않다.
- **수정안**: 0.2 생성기 입력에 **명시 예외 표**(`migration-overrides.csv`: 원 종목 × 변형 키 → 대상 id·축)를 추가한다. A20을 여기에 넣는다. `_context.md` §3에 다음을 명시한다: 규칙 적용 순서 = 1 → 2 → 3 → 예외 표, 고정점까지 최대 2회. `custom1~3`은 비머신 종목에서 「유지(기본 칸으로 합치지 않음) + 리포트」로 처리하고, 해당 사용자의 `machine_variant_labels`를 리포트에 함께 싣는다. 비머신 + 브랜드인데 대상이 없으면 「유지 + 리포트」로 처리한다. 0.3에 테스트를 추가한다: 「운영 변형 분포(§H.3) 전 행이 이동/유지/예외 중 하나로 분류되고 미분류가 0인지」. 성공 기준 2는 「equip:implement = 0, 단 예외 표의 유지 항목 제외」로 고친다.

### H7. 합계 검증이 사실상 항상 통과한다. 잘못된 매핑을 잡지 못하고, 앱 볼륨이 정당하게 바뀌는 경우도 정의되어 있지 않다 (데이터 이관 감사관)
- **근거**: `spec.md:139`(2.5)·`spec.md:46`(성공 기준 2). 0015는 `exercise_id`·variant·`arm`만 바꾸고 무게·횟수는 건드리지 않는다. 그래서 「사용자별 세트 수·볼륨 합」은 매핑이 틀려도 같다. 앱의 볼륨은 종목의 `load_mode`에 따라 달라진다(`core/domain/volume.ts:5-23`, 맨몸은 체중+무게). 예를 들어 `딥스(bodyweight)+technogym`을 `머신 딥스(machine)`로 옮기면 앱 화면의 볼륨은 바뀐다. 「수행 세트」의 정의(done null 처리, 워밍업·실패 포함 여부, deleted 행, 고아 세트)도 없다.
- **수정안**: 2.5와 2.6에 검증 정의를 명시한다.
  - ① 볼륨 = `Σ weight_kg×reps×coalesce(load_multiplier,1)`(numeric 캐스트, 워밍업·실패 제외, `done IS DISTINCT FROM false`, `deleted=false`, 블록이 살아 있는 세트만). **raw 기준**으로 비교하고, load_mode 변경으로 앱 볼륨이 바뀌는 종목은 리포트에 따로 표시한다.
  - ② 정합성 불변식(하나라도 어기면 RAISE): (사용자×블록)별 세트 수 불변 · 브랜드 키별 블록 수 불변(성공 기준 2의 「브랜드 칸 보존」) · 이관 뒤 모든 `exercise_id`가 활성 카탈로그나 그 사용자의 커스텀에 실재 · archived 종목을 가리키는 블록 0 · `equip:implement` 블록 = 예외 표 수 · payload에 `_status`/`_changed` 0 · deleted 행 불변.
  - ③ 드라이런 리포트에 「원 종목 → 대상 종목 × 블록/세트 수」 표를 넣고 사람이 확인한다.

### H8. 기구 enum에 `ezbar`·`trapbar`를 추가하는 작업이 없다. 카탈로그 동기가 이 기구를 `other`로 떨어뜨린다 (QA 엔지니어)
- **근거**: CSV는 `ezbar` 8행·`trapbar` 3행을 쓴다(EZ바 컬 50행은 barbell에서 ezbar로 바뀐다). 반면 `src/proto/exercise/v1/exercise.proto:26-37` `Equipment`에는 이 두 값이 없다. `fe/lib/catalogSync.ts:98`은 `EQUIPMENT_KEY[it.equipment] ?? "other"`로 처리하고, `fe/lib/contractMap.ts:44-55`도 매핑이 없다. 작업 2.3(`spec.md:137`)은 aliases·family·similar 필드만 말한다. 고유 기구가 `other`가 되면 정규화(`normalizeVariantEquipment`)와 기구 필터가 어긋난다.
- **수정안**: 2.3에 다음을 추가한다: 「proto `EQUIPMENT_EZBAR=10`·`EQUIPMENT_TRAPBAR=11` + Go 매핑 + `contractMap.EQUIPMENT_KEY` + core `EquipmentType`·라벨(한/영) + 기구 필터 칩 + 가용 기구(`available_equipment`) 선택지」. 0.3에 테스트를 추가한다: 「CSV 기구 값 ⊆ proto enum ⊆ contractMap」.

### H9. legacy `machine_variant` compute-on-read 때문에, 미러를 비우기 전에 실체화하지 않으면 브랜드 칸이 사라진다 (오프라인 동기 아키텍트)
- **근거**: `core/data/workoutRepository.ts:96-98` `effectiveVariantKey`는 `variant_key ?? legacyMachineVariantToV6(machine_variant)`로 버킷을 정한다. PR 계산(:1131)과 이전 기록(:1220-1230)이 이 함수를 쓴다. V6 백필은 웹에서 한 번도 돌지 않았다(지식 §B.2). 운영 미러는 156건이 남아 있다(§H.3). `variant_key`가 null이고 미러에만 브랜드가 있는 블록에 규칙 5(`_context.md:39`, 「미러 비움」)를 그대로 적용하면 브랜드가 사라져 기본 칸에 합쳐진다. 이런 블록은 규칙 3의 판정(비머신 + 브랜드)에도 걸리지 않는다. V8은 미러에 implement 값(`dumbbell`)도 써 넣었다(:163).
- **수정안**: `_context.md` §3 맨 앞에 「규칙 0: `variant_key`가 null이고 미러가 있으면 먼저 `variant_equipment`·`variant_key`를 미러로 채운다(V6 의미)」를 추가한다. 그 뒤에 규칙 1~5를 적용한다. 2.6 드라이런에 「variant_key null + 미러 존재」 블록 수와 처리 결과를 집계한다. 0015 SQL에도 같은 규칙 0을 넣는다.

---

## 중간

### M1. catalogSync·PullCatalog의 archived 처리 작업이 덜 정의되어 있다. 옛 클라이언트에서는 보관 종목이 되살아난다 (오프라인 동기 아키텍트)
- **근거**: `fe/lib/catalogSync.ts:104`는 `rec.isArchived = false`로 고정되어 있다. `db/queries/exercise.sql:8`(GetExercise)·`:39`(PullCatalogAfter)·`:66`(GetCatalogRevision)은 모두 `is_archived=false`만 본다. proto `Exercise`에는 `is_archived` 필드가 없다(`exercise.proto:78-96`). PullCatalog가 기본으로 archived를 내려 주면, 캐시된 옛 JS가 병합 원본 11종을 활성으로 되살린다. 사용자가 그 종목을 다시 고를 수 있다. 2.3은 「로컬 archive」만 말하고, 새 필드(family·aliases·similar·media_ref)를 로컬에 쓰는 매핑도 적지 않았다.
- **수정안**: 2.3을 이렇게 구체화한다: `PullCatalogRequest.include_archived`(기본 false, 새 클라이언트만 true) · `Exercise.is_archived` 필드 · revision 쿼리에 archived 포함 · catalogSync가 `isArchived`·family·aliases·similar·mediaRef를 매핑 · GetExercise는 archived도 반환하고 상세 화면은 「통합됨 → 대상 종목」으로 안내.

### M2. 병합·삭제 행의 `new_name_ko`가 대상 종목 이름과 같다. 생성기가 이 값을 그대로 쓰면 UNIQUE(name_ko)를 어긴다 (데이터 이관 감사관)
- **근거**: CSV 29·37·61·73·88·126·169·172·173·180·232행의 `new_name_ko`가 모두 대상 이름이다(예: 61행 `로프 푸시다운 → 케이블 푸시다운`). `db/migrations/0000_init.sql:44`가 `UNIQUE(name_ko)`를 건다. 별칭 정규화 검사에서도 보관 원본의 옛 이름 11개가 대상 종목 별칭과 정확히 겹친다(의도된 겹침이지만 검색에서 보관 종목을 빼야 한다).
- **수정안**: 0.2에 「merge/delete 행은 0014·시드에서 `old_name_ko`를 유지하고 `is_archived=true`로 낸다」를 추가한다. 0.3의 「대표 이름 유일」 검사는 활성 행에만 적용하고, 「보관 행 이름 = 대상의 별칭」은 오히려 강제한다. 3.1 검색 색인에서는 archived를 뺀다.

### M3. 표시 이름의 연속성을 이관으로 보장하지 않는다. `exercise_user_prefs`의 중복 방지 규칙도 없다 (운동 도메인 전문가)
- **근거**: `catalog-review.md` §2.2 마지막 줄은 「표시 이름은 마지막으로 고른 별칭이라 사용자 화면의 이름이 갑자기 바뀌지 않는다」고 하지만, 2.4·2.5·3.3(`spec.md:138-139,155`) 어디에도 기존 사용자의 display_name을 채우는 작업이 없다. 실제로는 Phase 2부터 `로프 푸시다운`·`하이 로우`·`체스트 프레스 머신`이 새 대표 이름으로 바뀐다. 또 서버(0015)와 여러 기기가 같은 (사용자×종목) 선호 레코드를 각자 다른 id로 만들면 중복이 생긴다. 새 테이블이 `core/sync/pending.ts:9` `USER_TABLES`에 없어서 계정 전환 가드도 이를 세지 못한다.
- **수정안**: 2.4·2.5에 「rename/merge된 종목을 옛 이름으로 쓴 적 있는 (사용자×종목)마다 `display_name = 옛 이름`을 시드한다」를 추가한다. 1.3에는 「레코드 id = 결정적 `pref-<exercise_id>`(사용자 공간 안에서 유일)」와 「`USER_TABLES`에 추가」를 넣는다. 사용자가 「대표 이름으로 보기」를 원할 수 있으니 3.3의 「이름 바꾸기」에서 되돌릴 수 있게 한다.

### M4. family별 축 허용 목록(attachments·grips)의 출처가 없다. 함축 축이 정규화 과정에서 지워질 수 있다 (운동 도메인 전문가)
- **근거**: 1.2(`spec.md:116`)는 「family 메타 `attachments`·`grips`」를 말하지만, CSV 열(`_context.md` §2)에도 생성기 출력(0.2)에도 그 메타가 없다. 함축 축(CSV 29행 `grip=close`, 126행 `attach=single`, 180행 `grip=wide`, 232행 `grip=under`)이 허용 목록 밖이면 「정규화 시 제거」(1.2) 규칙에 걸려 지워진다. 그러면 기록이 기본 칸에 조용히 합쳐진다.
- **수정안**: 0.1·0.2에 family 메타 표(`catalog.families.csv`: family·attachments·grips·load 적용 여부)를 정본으로 추가한다. 0.3에 테스트를 추가한다: 「모든 implied_axes ⊆ 대상 family 허용 목록」·「cable 아닌 종목에 attach 없음」·「machine 아닌 종목에 load 없음」.

### M5. 옛 백필(V6·V8·V10·V11·V12·V22)을 새 러너에 넣을지 정하지 않았다 (QA 엔지니어)
- **근거**: 웹에서는 이 백필들이 한 번도 돌지 않았다(지식 §B.2, `workoutRepository.ts:103-271`). 0.4 러너는 「순서대로 멱등 실행」이라고만 한다. V8은 이번 개편과 반대 방향(종목을 변형 칸으로 흡수)이고, 대상 nameKo에 의존한다(:131-141). V6는 미러로 옛 키를 되살린다.
- **수정안**: 0.4에 등록 목록을 명시한다: 「V8은 폐기(코드 보존 규칙에 따라 호출만 막음) · V6는 H9의 규칙 0으로 흡수 · V10/V12는 seed id 기반으로 재작성 · V11/V22는 새 정규화로 대체」. 등록 목록 자체를 고정하는 단위 테스트를 추가한다.

### M6. 운영 사용 근거가 불완전하다. 사용자 수도 스펙과 다르다 (데이터 이관 감사관)
- **근거**: CSV `usage_sets`는 상위 30종 + 1종만 채웠다(`catalog-review.md` §8). 예를 들어 `밀리터리 프레스`(CSV 37행)는 비어 있지만 `custom2` 2블록으로 실제 쓰였다(§H.3). 0.3의 「운영 사용 종목 delete 금지 목록」을 이 열로 만들면 빠지는 종목이 생긴다. 또 `sync_records`의 set_logs·workouts에는 사용자 4명이 있다(지식 §H.1). 스펙은 2명이라고 한다.
- **수정안**: 0.3·2.6에 「delete 금지·이관 대상 목록은 운영 DB 읽기 전용 쿼리(블록·루틴 참조 전체, 변형 포함)로 생성해 커밋한다」를 추가한다. 0015와 검증은 sync_records의 **모든 user_id**를 대상으로 한다고 명시한다.

### M7. 백업 단계가 배포 스크립트에 없다. 드라이런 사본과 운영 사이에 데이터가 달라질 수 있다 (QA 엔지니어)
- **근거**: `src/scripts/deploy-h2500-3.sh`에는 `pg_dump`가 없다(grep 0건). migrate는 `up -d` 때 자동으로 돈다(:94-98). 2.5는 「배포 스크립트 단계로」라고만 적었다.
- **수정안**: 2.5에 「`compose up` **전에** `pg_dump -Fc`를 실행하고, 크기·경로·`pg_restore --list` 확인을 출력하며, 실패하면 배포를 중단한다」를 추가한다. 2.6은 「드라이런 직후 운영 적용까지 사용자 2명에게 동기 동결을 공지하거나, 운영 적용 시 같은 리포트를 다시 생성해 드라이런과 비교한다」로 바꾼다.

---

## 낮음

### L1. 통계가 서로 맞지 않는다
- **근거**: `spec.md:31`(마스터 근력 442) · `catalog-review.md:3,20-30`(479행·new 143·활성 468·근력 442). 실제 CSV는 480행·new 144·**활성 469(근력 443·유산소 26)**이다. 234행 `머신 오버헤드 트라이셉스 익스텐션`이 나중에 추가되면서 생긴 차이다.
- **수정안**: 검토서와 D8을 다시 집계해 고친다. 0.3의 개수 하한 테스트는 CSV에서 파생한다.

### L2. `similar` 참조 8건이 끊어져 있다
- **근거**: `similar` 열에 쓰인 `triceps_extension`은 어느 family 이름이나 id_en과도 맞지 않는다(8행).
- **수정안**: 0.3에 「similar ⊆ family ∪ id_en」 테스트를 추가하고 CSV를 고친다.

### L3. 영문 `glute bridge`가 두 종목을 가리킨다
- **근거**: CSV 91행은 바벨이고 `id_en=Glute Bridge`로 바꿀 수 없다. 430행 맨몸 종목의 `aliases_en`에 `glute bridge`가 들어 있다. 정규화하면 nameEn과 별칭이 정확히 같다.
- **수정안**: 430행 영문 별칭에서 그 값을 빼거나, 3.1 순위 규칙에 「nameEn 정확일치 < 대표 한글명 정확일치」를 명시한다.

### L4. 이름 규칙 예외 목록이 데이터에 없다
- **근거**: 머신인데 접두가 없는 17종(14·46·75·76·77·86·87·97·119·120·121·131·132·262·263·265·412행)과 바벨·랜드마인·티바 8종이 있다. 0.3의 「예외 목록」을 손으로 관리하게 된다.
- **수정안**: CSV에 `name_rule` 열(prefix|intrinsic|bodyweight)을 추가하고 테스트가 이 열을 읽게 한다.

### L5. 상태가 `keep`인 행도 필드가 바뀐다
- **근거**: CSV 118행 `로잉 머신`은 keep인데 kind가 cardio로 바뀐다. EZ바 컬(50행)은 rename이면서 기구도 바뀐다.
- **수정안**: 0.2에 「status와 무관하게 전 필드를 `IS DISTINCT FROM`으로 upsert한다(실제로 바뀐 행만 updated_at 갱신)」를 명시한다.

### L6. 페이지 상한과 외부 덤프 고정
- **근거**: `PullCatalogRequest.limit ≤ 500`(`exercise.proto:181`) · `catalogSync.ts:23` PAGE=500. 480행에 보관 11행이 더해져 상한에 가깝다. fedb 덤프는 `@main`에 고정되지 않았다(`catalog-review.md` §8).
- **수정안**: 0.2에서 fedb 커밋 해시를 고정한다. 카탈로그 페이지 반복은 이미 커서로 처리되므로 테스트만 추가한다(「491행 이상에서 2페이지로 받는지」).

---

## 단계별 배포 안전성 점검표 (QA 엔지니어)

| 배포 시점 | 깨지는 것(현 스펙) | 대응 항목 |
|---|---|---|
| v0.30(P0·P1) | `load_multiplier` 0 때문에 볼륨·PR이 0 · 표식 동기로 다른 기기가 이관을 건너뜀 · D10으로 새 기기에 카탈로그가 없음 | B1·B2·H3 |
| v0.30→v0.31 사이 옛 PWA | 새 컬럼 유실 · 옛 형식 push가 되돌림 | H1·H2 |
| v0.31(P2) 배포 순간 | 0015 실패 시 API 중단 · 반쪽 상태 | B3·M7 |
| v0.31~v0.32 | 기구 변형 칩으로 새 implement 칸 생성 · 부착물 칸 수정 불가 · 이름이 갑자기 바뀜 · 코칭 리포트 근육·이름 공란 | H5·M3·H4 |
| v0.33(P4) | 축 허용 목록이 없어 함축 축이 지워짐 | M4 |

---

## 총평: **조건부 통과**

방향(D1~D11)과 데이터 정본(CSV 한 장에서 시드·SQL·매핑 생성), 테스트 선행 원칙은 견고하다. CSV 품질도 표본 검사에서 대체로 양호했다. 병합 대상은 모두 실재하고 순환이 없다. family 안 기구 중복과 운영 사용 종목 delete는 0건이다. 활성 종목 사이의 별칭 충돌도 0건이다(L3 하나만 예외).

다만 다음 조건을 스펙에 반영해야 /execute에 들어갈 수 있다.
1. **차단 3건(B1~B3)**: 반영하지 않으면 첫 배포(v0.30)나 이관 배포(v0.31)에서 기록 수치가 0이 되거나, 이관이 누락되거나, 서비스가 중단된다.
2. **높음 9건(H1~H9)**: 특히 수렴 설계(H1·H2·H9)와 매핑 예외 표(H6), 검증 불변식(H7)은 Phase 2 착수 전에 확정한다.

중간·낮음은 해당 작업 번호에 체크리스트로 흡수하면 된다.
