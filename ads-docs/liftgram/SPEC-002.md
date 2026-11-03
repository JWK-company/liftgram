# SPEC-002 — Project Spec — 종목 카탈로그 대개편

> 타입 Spec · 그룹 liftgram · ADStudio가 `SPEC-002.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

## Project Spec — 종목 카탈로그 대개편

> 생성일: 2026-10-26 등급: **Project** (9점 — 파일 40+ · core/frontend/backend/database 4층 · 로컬 스키마 v22 + 서버 마이그레이션 2 · 운영 기록 이관) 추적(implements): SRS-055 · SRS-056 · SRS-057 · SRS-058 (URS-018 · UCS-020 · UCS-021) / 결정: ADR-033 · 034 · 035 · 036 · 037 spec 경로: `.ouroboros/docs/spec/20261026_exercise-catalog-revamp/`

> **구성 파일** - 본 문서 (spec.md) — 의도·결정·Phase 정의·검증 - `catalog-master.csv` — **종목 마스터 표(480행, 이 개편의 데이터 정본)** · `catalog-review.md` — 판정 근거·통계·애매 항목 - `_context.md` — 데이터 경로·코드 지도·이관 매핑 규칙 · `_analysis.md` — 리스크·메모리·검증 전략 - 현황 근거: `.ouroboros/docs/knowledge/20261026_exercise-catalog-asis_knowledge.md`

---

### 작업 의도

종목 카탈로그는 앱 정체성의 중심이다. 지금은 ① 이름 형식이 세 갈래로 섞이고 브랜드명·부착물을 이름에 박은 종목이 있으며 ② 같은 동작이 이름·경로(기구 변형 칸)에 따라 다른 기록 칸으로 흩어지고(#42·#44) ③ 「랫풀」처럼 띄어쓰기만 달라도 검색이 안 되고 ④ 머신 적재 방식·케이블 부착물·손 그립처럼 무게를 바꾸는 조건이 기록에 반영되지 않으며 ⑤ 근력 96종·유산소 25종에 그림이 없다. 이번 개편은 「종목 = 동작 × 기구」(ADR-033)를 기준으로 카탈로그를 다시 세우고, **두 사용자의 기존 운영 기록까지 새 규칙으로 이관**한다(사용자 지시 2026-10-26).

### 확정 결정 (스펙 단계 질의응답 — 2026-10-26 사용자)

| # | 결정 | 근거 |
| --- | --- | --- |
| D1 | 같은 동작 = 한 종목 + 별칭 + **사용자별 표시 이름**(마지막으로 고른 별칭), 다른 동작·기구 = 별도 종목 + 「비슷한 운동」 | ADR-033 |
| D2 | 기구 교체 = 종목 교체. 프리웨이트·케이블·스미스·케틀벨·밴드의 `equip:` 변형 칸 폐지, 머신 브랜드 13키 유지 | ADR-033·034 |
| D3 | 기록 칸 = 종목 × [머신 브랜드 × 적재 방식] × [케이블 부착물] × **손 그립**. 지난 조합 승계. 원암은 세트 속성 | ADR-034 (026·030 대체) |
| D4 | 플레이트 머신 「한쪽 무게로 입력」(사용자×종목 선호), 볼륨·PR 은 ×2 | ADR-037 |
| D5 | 이름 형식 「기구 + 동작」, 머신 고유 동작(레그 프레스·펙덱 등)은 접두 생략, 옛 이름은 별칭 | ADR-035 |
| D6 | 그림 = 자체 제작 SVG 픽토그램(전 종목, **마지막 Phase**) + 퍼블릭 도메인 사진 보조. GPU 미사용 | ADR-036 |
| D7 | 부착물·그립·원암을 이름에 박은 종목은 기본 종목으로 **통합**, 옛 이름 별칭이 축 값을 함축(「로프 푸시다운」으로 추가 → 케이블 푸시다운 + 로프 선택 + 표시 이름 「로프 푸시다운」) | S1 |
| D8 | 근력 ≈450(마스터 443 · 재집계 QA L1) — 흔한 동작의 흔한 기구 대응까지 | S3 |
| D9 | 운영 기록 판정: 덤벨 OHE+newtech 13 → **머신 오버헤드 트라이셉스 익스텐션**+newtech(R1 — 앉아서 머리 위 손잡이를 위로 미는 기구; 프리처형 암 익스텐션과 다른 종목) · 딥스+technogym/cybex → 머신 딥스 · 레그 컬 → 라잉 레그 컬 · 바벨 프리처 컬 유지 · 친업 유지 · 대표 이름 「케이블 랫풀다운」 | R1~R6 |
| D10 | 사용자 동기에 실린 **시드 종목 행은 무시**(카탈로그 정본 = 서버 카탈로그), 커스텀 종목만 동기 | 기술 판단(운영 옛 이름 역류 18건) |
| D11 | 이관은 **서버 SQL(정본) + 기기 부팅 마이그레이션(미동기분)** 이중·멱등·같은 매핑. 실행 전 백업, 사용자별 세트 수·볼륨 합 보존 검증 | 사용자 지시 |

### 추적 매핑 (구현 ↔ 요구)

| 심볼/파일 | 실현 | @plm |
| --- | --- | --- |
| `core/data/seed/exercises.seed.ts` · `catalog.master.csv` · 생성기 `scripts/gen-catalog.mjs` | SRS-055 | `@plm SRS-055` |
| `core/migrations/catalogMigration.ts`(부팅 이관 엔진) · `database/migrations/0014_catalog_revamp.sql`·`0015_records_migrate.sql` | SRS-055·057 | `@plm SRS-057` |
| `core/domain/exerciseSearch.ts`(정규화·초성·별칭 색인) · `ExercisePicker`·`CatalogClient` · `exercise_user_prefs` | SRS-056 | `@plm SRS-056` |
| `core/domain/variants.ts`(load·attach·grip 축) · `VariantSelector` · 「기구 바꾸기」 · 플레이트 한쪽 입력 | SRS-057·058 | `@plm SRS-058` |
| `core/data/pictograms/*` · 픽토그램 리그 | SRS-055 | `@plm SRS-055` |

#### 성공 기준

1. 검색 표(랫풀·랫 풀·latpull·이너타이·롱풀·스컬크러셔·벤트오버·밀프·사레레 등 40건)가 전부 첫 화면 노출 — 단위 테스트.
2. 운영 이관 후 **사용자별 수행 세트 수·볼륨 합이 이관 전과 같다**(SQL 대조) · `equip:(implement)` 변형 칸 세트 0 · 머신 브랜드 칸 보존.
3. 바벨 벤치프레스를 덤벨로 바꿔 마친 세션 = 덤벨 벤치프레스를 처음부터 고른 세션(기록·PR 동일) — e2e.
4. 같은 머신의 핀로드/플레이트, 케이블 부착물, 손 그립별 이전 기록·PR이 섞이지 않고 지난 조합이 기본 선택 — 단위+e2e.
5. 카탈로그 무결성 테스트(이름·별칭 유일, family 내 기구 유일, 이름 규칙, 키 참조 ⊆ 시드, 스무고개 완결성, 이관 매핑 완결성) 통과.
6. 근력 종목 100% 픽토그램 + license 허용 목록 테스트(마지막 Phase).

---

### 사전 분석 요약

#### 영향 범위

| 레이어 | 파일 수(추정) | 주요 변경 |
| --- | --- | --- |
| core | 20+ | 시드·생성기·variants 축·검색·부팅 이관 엔진·KEY 참조(nameKo→id) 이전·스키마 v22·동기 시드 무시 |
| frontend | 12+ | 피커·종목 탭 검색·표시 이름·VariantSelector(브랜드·적재·부착물·그립)·기구 바꾸기·플레이트 입력·이관 진입점 |
| backend | 5 | proto Exercise 필드(aliases·family·similar)·PullCatalog archived 포함·catalog 핸들러 |
| database | 3 | 0014 카탈로그(컬럼+upsert+rename+archive) · 0015 운영 기록 이관 · 쿼리 |

#### 핵심 리스크

| # | 리스크 | 확률 | 영향 | 대응 |
| --- | --- | --- | --- | --- |
| R1 | 이관 오류로 기록이 엉뚱한 종목으로 감 | 중 | 높 | 매핑 = CSV 단일 정본에서 생성(서버·기기 공유) · 드라이런 리포트 · 전후 합계 대조 · pg_dump 백업 · 이관은 멱등 |
| R2 | 동기가 옛 이름·옛 칸을 되살림 | 높 | 높 | D10 시드 행 무시 · 서버 이관이 updated_at 을 올려 기기가 pull · 기기 부팅 이관이 미동기분 재적용 |
| R3 | nameKo KEY 13곳 단절 | 높 | 중 | KEY 를 seed id 로 이전(이번 개편에서 일괄) + ⊆시드 테스트 |
| R4 | 서버 UNIQUE(name_ko) 충돌(이름 교환·글루트 브릿지) | 중 | 중 | 0014 에서 2단계 rename(임시명 경유) |
| R5 | 검색 성능(480종 × 별칭 1,000+) | 낮 | 중 | 시작 시 정규화 색인 1회 구축 · 50ms 예산 테스트 |
| R6 | 픽토그램 품질 | 중 | 낮 | 마지막 Phase · 렌더 시트 육안 검수 · 데이터만 교체 가능 |

---

### 범위

#### 범위 외

- AI 일러스트(GPU) — ADR-036, 나중에 데이터 교체로.
- 머신 브랜드 키 정리·추가(13키 유지) · 원암 축(세트 속성 유지) · 유산소 지표 체계.
- 운동 완료 화면 공유 작성기 통합(재설계 잔여).

---

### Phase 0: 기반 — 데이터 정본·생성기·부팅 이관 엔진·동기 시드 무시 (출시: v0.30.0, 사용자 화면 변화 없음)

#### 목표

이후 모든 Phase 가 기대는 바닥: 마스터 CSV 를 정본으로 커밋하고, 시드·서버 SQL·이관 매핑을 한 생성기로 만든다. 웹 부팅 이관 진입점을 세우고, 사용자 동기에서 시드 종목 행을 무시한다. 테스트를 데이터보다 먼저 늘린다.

#### 작업

- [ ] **0.1** `src/core/src/data/seed/catalog.master.csv` 로 마스터 표 커밋(정본). 열 의미는 `_context.md` §2.
- [ ] **0.2** `src/scripts/gen-catalog.mjs` 신설(옛 `gen-exercise-seed.mjs` 는 경로가 은퇴한 `app/`·`0002` 덮어쓰기라 폐기 → 주석으로 안내): CSV → ① `exercises.seed.ts`(SeedExercise 에 `family`·`aliasesKo`·`aliasesEn`·`similar`·`media` 필드 추가) ② `catalogMigration.data.ts`(merge/delete 매핑·implied axes·equip 변형 → 형제 종목 표) ③ `database/migrations/0014_catalog_revamp.sql` ④ `0015_records_migrate.sql`. `make catalog` 타깃 + CI `catalog-check`(생성물 드리프트).
- [ ] **0.3** 테스트 선행(`catalogGap.test.ts` 확장 → 새 `catalogRevamp.test.ts`): 대표 이름·별칭 정규화 유일(공백 무시) · id 슬러그 유일 · 과거 soft-delete id 재사용 금지 · family 안 기구 유일 · 이름 규칙(「기구 + 동작」 / 맨몸·머신 고유 예외 목록) · merge/delete 대상 실재·순환 없음 · 운영 사용 종목 delete 금지 목록 · 모든 근력 종목 family 보유.
- [ ] **0.4** `core/migrations/runner.ts`: 버전 표식(`app_prefs` 의 `migration_version`, 없으면 로컬 저장소) + 순서대로 멱등 실행 + 실패 시 중단·다음 부팅 재시도 + 결과 요약 로그. 프론트 진입점은 로컬 DB 준비 직후·첫 동기 **전**(`localDb` 초기화 경로) 1회.
- [ ] **0.5** 동기 시드 무시(D10): `syncEngine` push 에서 `exercises` 중 `is_custom=false` 제외, pull 에서 `exercises` 의 `seed-` id 행은 적용하지 않음. 카탈로그는 `catalogSync` 만 갱신. 부팅 때 catalogSync 를 백그라운드로 1회(지금은 종목 탭에서만).
- [ ] **0.6** `@plm` 주석·`_context.md` 의 코드 지도 갱신.

#### Checkpoint 검증

- [ ] tsc · biome · `make verify` · core 단위 테스트(새 무결성 테스트가 **현재 데이터에서 실패하고** 생성물 반영 뒤 통과하는지 — 게이트가 진짜 막는지 확인)
- [ ] e2e 데이터 안전·오프라인 통과(운영) · 동기 시드 무시 단위 테스트(옛 이름 행 pull → nameKo 불변)

---

### Phase 1: 기록 칸 축 확장 (도메인) (v0.30.0 에 함께)

#### 목표

ADR-034 의 축(load·attach·grip)을 변형 키 문법·정규화·조회에 넣는다. 기존 키는 그대로 해석(하위호환), 축 기본값 = null.

#### 작업

- [ ] **1.1** `variants.ts`: `LOAD_KEYS = pin|plate`, `ATTACH_KEYS = rope|straight|v|ez|single|mag_wide|mag_close|neutral_bar|stirrup …`(라벨·짧은 라벨 한/영), canonical 순서 `[equip(brand), load, attach, grip]`, `parseVariantKey`·`variantColumns`·`normalizeVariantDims` 확장. arm 은 키에서 제외 유지.
- [ ] **1.2** 축 적용 범위: load = 머신 종목만, attach = 케이블 종목만(family 메타 `attachments` 로 허용 목록 — 예 pushdown: rope·straight·v·ez·single), grip = family 메타 `grips`(예 lat_pulldown: wide·close·neutral·under, bench: wide·close) — 해당 없으면 UI 미노출·정규화 시 제거.
- [ ] **1.3** 로컬 스키마 v22: `workout_exercises`·`routine_exercises` 에 `variant_load`·`variant_attach` 컬럼(그립은 기존 `variant_grip` 재사용), `set_logs.load_multiplier`(기본 1), `exercises` 에 `family`·`aliases`(JSON)·`similar`(JSON)·`media_ref`, 새 사용자 테이블 `exercise_user_prefs`(exercise_id·display_name·plate_one_side·updated_at — 동기 대상). 마이그레이션 + Model.
- [ ] **1.4** 이전기록·PR·볼륨 조회가 새 키로 동작하는지 단위 테스트(같은 종목 rope/straight 분리, pin/plate 분리, grip 분리, 옛 키 = 기본 칸). `load_multiplier` 를 볼륨·1RM·PR 계산에 반영(analytics·completeWorkout·통계 화면).
- [ ] **1.5** 메모리 `liftgram-variant-bucket-invariant` 를 ADR-034 로 갱신.

#### Checkpoint

- [ ] variantBucket 테스트 확장 통과 · 스키마 마이그레이션 v21→v22 실기기(로컬 IndexedDB) 확인 · 데이터 안전 e2e

#### 커밋/배포

`feat(catalog): P0·P1 기반 — 마스터 정본·생성기·부팅 이관 엔진·동기 시드 무시·기록 칸 축 확장 (v0.30.0)`

---

### Phase 2: 카탈로그 정합·확장 + 운영 기록 이관 (v0.31.0)

#### 목표

480행 마스터를 시드·서버·기기에 반영하고(rename 142 · new 144 · merge 10 · delete 1), 기존 기록을 새 규칙으로 옮긴다: ① merge/delete 종목 → 대상 종목 + implied axes ② `equip:(implement)` 변형 칸 → 같은 family 의 그 기구 종목 ③ 프리웨이트/케이블 종목 + 브랜드 키 → 머신 종목 + 같은 브랜드(D9).

#### 작업

- [ ] **2.1** 생성기로 시드 갱신. nameEn 불변·신규 novel nameEn. 로잉 머신 kind=cardio 명시.
- [ ] **2.2** KEY 이전(R3): FINDER_TREE·SUBSTITUTES·RAW_MEDIA·movementPatterns·conceptRoutines·V10/V12 이름 목록·테스트 하드코딩을 **seed id(nameEn 슬러그)** 키로 바꾼다. 스무고개 트리에 신규 종목 편입(완결성 테스트 — 같은 커밋). 세션 화면 이름 축약(`baseExerciseName`) 폐지.
- [ ] **2.3** 서버 `0014_catalog_revamp.sql`: `exercises` 에 `aliases text[]`·`family text`·`similar text[]`·`media_ref text` · 2단계 rename(임시명) · upsert(멱등 `IS DISTINCT FROM`) · merge/delete 행 `is_archived=true`. proto `Exercise` 에 필드 추가 → `make proto` · `PullCatalog` 가 archived 도 내려 주고(`is_archived`) catalogSync 가 로컬 archive · 해당 쿼리 sqlc.
- [ ] **2.4** 기기 부팅 이관 v1(`catalogMigration.ts`): 위 ①②③ 을 `workout_exercises`·`routine_exercises` 에 적용(exercise_id 재지정 + variant 컬럼 재계산 + `machine_variant` 미러 비움), implied `arm=uni` 는 그 블록의 `set_logs.arm` 에, 원 종목은 archive. 멱등(이미 대상이면 건너뜀) · 사용자 데이터만(시드 행 불변).
- [ ] **2.5** 서버 `0015_records_migrate.sql`(정본 이관): 같은 매핑으로 `sync_records` payload(jsonb) 의 `workout_exercises`·`routine_exercises`·`set_logs` 를 갱신하고 `updated_at=now()` 로 올려 기기가 pull 하게 한다. 이관 전후 사용자별 수행 세트 수·볼륨 합 대조 쿼리를 같은 트랜잭션 안에서 검사해 **다르면 ROLLBACK**. 실행 전 `pg_dump` 백업(배포 스크립트 단계로).
- [ ] **2.6** 드라이런: 운영 DB 사본(백업 복원 로컬 컨테이너)에 0015 를 먼저 돌려 리포트(옮겨질 행·종목별 세트 수 전후) → `_analysis.md` 에 첨부 → 통과 시 운영.
- [ ] **2.7** 커스텀 종목 이름이 새 시드명과 같으면(로컬 nameKo 유일 없음) 커스텀 쪽 표시에 「(내 종목)」 — 운영 커스텀 4종은 충돌 없음 확인.

#### Checkpoint

- [ ] 무결성·이관 단위 테스트(픽스처: 로프 푸시다운 기록 → 케이블 푸시다운+rope, 해머스트렝스 → 머신 체스트 프레스+hammer, 인클라인(바벨)+equip:dumbbell → 덤벨 인클라인 프레스, 덤벨 OHE+newtech → 머신 OHE+newtech, 원암 랫풀다운 → 랫풀다운+single+세트 arm=uni)
- [ ] 드라이런 리포트 합계 일치 → 운영 적용 → 운영 합계 일치 · 두 사용자 계정으로 이전 기록 화면 실확인(chrome-devtools, 운영자 계정은 사용자 세션 없이 DB 대조로)
- [ ] 재실행 멱등(0015·부팅 이관 2회 실행 결과 동일)

---

### Phase 3: 검색·별칭·표시 이름 (v0.32.0)

#### 작업

- [ ] **3.1** `core/domain/exerciseSearch.ts`: 정규화(NFKC·소문자·공백/하이픈/구두점 제거) · 한글 초성 키 · 별칭·영문 색인 · 순위(정확 > 시작 > 부분 > 초성 > 비슷한 운동) · 결과에 맞은 별칭 표시. 피커·종목 탭이 공유(복제 2벌 제거). 40건 자르기 → 관련도 순.
- [ ] **3.2** 결과 UI: 「대표 이름 · 맞은 별칭」, 아래 「비슷한 운동」 구역(같은 family 다른 기구 + `similar`).
- [ ] **3.3** 별칭으로 추가 → `exercise_user_prefs.display_name`=그 별칭(마지막 선택), 함축 축이 있으면(D7) 그 블록 variant 에 적용. 표시 이름 훅 `useExerciseName(id)` 로 루틴·운동 중·기록·분석·피드(본인 화면) 일괄. 종목 상세 ⋯ 「이름 바꾸기」(대표·별칭 중 선택).
- [ ] **3.4** 검색 단위 테스트(성공 기준 1의 표) + 500종 50ms 예산.

---

### Phase 4: 운동 중 UI — 기구 바꾸기·적재 방식·부착물·그립·플레이트 한쪽 (v0.33.0)

#### 작업

- [ ] **4.1** 종목 ⋯ 「기구 바꾸기」: 같은 family 의 다른 기구 종목 목록(없는 기구는 안 보임) → `swapWorkoutExercise` 재사용 + 입력 세트 이동 + 「이번만 / 루틴에도」. #47(대체 두 번 눌러야 바뀜) 원인 수정. VariantSelector 의 implement 칩 제거.
- [ ] **4.2** 옵션 시트: 머신 = 브랜드 + 적재 방식, 케이블 = 부착물, family 가 허용하면 손 그립. 지난 조합 기본 선택(`resolveStartVariant` 확장). 이전 기록 칸 제목에 조합 표시 + 「다른 조합 기록 보기」.
- [ ] **4.3** 플레이트 한쪽 입력: 적재=plate 인 머신에서 토글, `plate_one_side` 선호 저장, 세트 저장 시 `load_multiplier=2`, 입력·표시는 한쪽, 볼륨·PR 은 ×2. 루틴 편집에도 같은 옵션.
- [ ] **4.4** e2e: 바벨→덤벨 기구 바꾸기(성공 기준 3) · 로프/일자바 분리·기억 · 핀/플레이트 분리 · 그립 분리 · 한쪽 입력 볼륨.

---

### Phase 5: 픽토그램 (마지막 · v0.34.0)

#### 작업

- [ ] **5.1** 리그(`core/data/pictograms/rig.ts` — 관절 비율·선 굵기·CSS 변수 색) + 기구 부품(바벨·덤벨·케틀벨·케이블 기둥·벤치·머신 프레임·밴드·바·EZ/트랩바).
- [ ] **5.2** family 별 시작/끝 자세(≈100) → 종목은 family 자세 + 기구 부품 + 근육 강조(primary). 목록 썸네일(정지)·팁/상세(시작↔끝 애니메이션, `prefers-reduced-motion` 존중).
- [ ] **5.3** 렌더 시트(부위별) 육안 검수 · 이상 자세 수정 · 운영 상위 70 종목 우선.
- [ ] **5.4** `media_ref` 소스 추상화(픽토그램·fedb 사진·향후 AI) + license 메타 + 허용 목록 테스트. 상세는 fedb 사진(같은 동작·기구만) 보조.

---

### /qa spec 반영 (2026-10-26 — 조건부 통과 → 아래가 각 작업보다 우선)

근거: `.ouroboros/docs/qa/20261026_catalog-revamp-spec_qa.md`(차단 3 · 높음 9 · 중간 7 · 낮음 6).

| QA | 바뀐 결정 | 적용 작업 |  |  |
| --- | --- | --- | --- | --- |
| B1 | `set_logs.load_multiplier` 는 **optional, null = 1**. 읽기는 `effectiveMultiplier(s) = s.loadMultiplier ?? 1` 하나로만 · v21→v22 이관 뒤와 키 없는 pull 세트의 볼륨 불변 테스트 | 1.3 · 1.4 |  |  |
| B2·H1 | 기록 이관은 버전 표식 없이 **멱등 정규화** `normalizeCatalogRecords()` — 부팅 때(동기 전) 1회 + **pull 적용 직후·push 전 매번**(받은 workout_exercises·routine_exercises 대상, 변화 없으면 no-op). 러너 표식은 스키마 데이터 백필 전용이고 **기기 로컬 전용**(localStorage — 동기 컬럼 금지, wipeFor 뒤 초기화) | 0.4 · 2.4 |  |  |
| B3·M7 | 0015 는 자동 마이그레이션에서 뺀다 → **`be/cmd/migrate-records` one-shot**(`--dry-run` 리포트 / `--apply`, 검증 실패 = 그 트랜잭션만 되돌리고 오류 종료, API 무관). 0014 는 0015 없이도 앱이 동작(기기 정규화가 로컬을 고친다). 배포 순서 = `pg_dump -Fc`(크기·`pg_restore --list` 확인, 실패 시 중단) → compose up(0014 자동) → 드라이런 리포트 → `--apply` → 리포트 재생성 대조 | 2.5 · 2.6 · 배포 |  |  |
| H2 | 로컬 `SCHEMA_VERSION` 이 올라간 첫 부팅에 **lastPulledAt=0 으로 전량 재수신**. 서버 `UpsertSyncRecords` 는 `payload = sync_records.payload |  | EXCLUDED.payload`(얕은 병합 — 옛 클라이언트가 모르는 키 보존). 멱등 판정은 목표 상태 전체(exercise_id·variant 컬럼·variant_key) 비교 | 1.3 · 2.3 · 2.4 |
| H3 | 부팅 순서 = ① 번들 시드 **top-up 매 부팅**(신규·필드·archived 반영, 사용자 행 불변) → ② 정규화 → ③ 동기 → ④ catalogSync(온라인 시 덮어쓰기). 대상 id 가 로컬에 없으면 옮기지 않고 다음 기회에 재시도. 빈 DB+오프라인+서버 기록 pull 테스트 | 0.4 · 0.5 · 2.4 |  |  |
| H4 | 코칭 리포트(`be/internal/coaching/report.go`)는 종목을 서버 `exercises` 테이블에서 먼저 해석, 커스텀만 sync_records 보완 · 볼륨 `×coalesce(load_multiplier,1)` · report_test 추가 | 2.3 |  |  |
| H5 | **P2 에서** VariantSelector 의 implement 칩 제거(대신 「기구 바꾸기」 최소판 = 같은 family 종목 swap) + attach·grip 칩(허용 목록 안에서 선택·해제) 노출. P4 는 이를 완성(브랜드×적재 시트·지난 조합·다른 조합 기록 보기·플레이트 한쪽). 표시 이름 연속성은 M3 로 P2 에 | 2.8(신규) · 4.1 · 4.2 |  |  |
| H6 | 생성기 입력에 **`migration-overrides.csv`**(원 종목 × 변형 키 → 대상 id·축, A20 체스트 서포티드 티바+machine → 머신 체스트 서포티드 로우 포함). 규칙 순서 0→1→2→3→예외 표, 고정점 최대 2회. `custom1~3` 은 비머신 종목에서 **유지 + 리포트**(machine_variant_labels 동봉), 비머신+브랜드 대상 없음 = 유지 + 리포트. 운영 변형 분포 전 행 분류(미분류 0) 테스트. 성공 기준 2 = 「equip:implement = 0, 예외 표 유지 항목 제외」 | 0.2 · 0.3 · §3 |  |  |
| H7 | 검증 정의: raw 볼륨 `Σ weight_kg×reps×coalesce(load_multiplier,1)`(워밍업·실패 제외·done≠false·deleted 제외·살아 있는 블록) 사용자별 불변 + 불변식(사용자×원 블록 세트 수 불변 · 브랜드 키별 블록 수 불변 · 모든 exercise_id 실재(활성 카탈로그 ∪ 그 사용자 커스텀) · archived 가리키는 블록 0 · equip:implement = 예외 표 수 · payload `_status`/`_changed` 0 · deleted 행 불변). 드라이런 리포트에 「원 → 대상 × 블록/세트」 표. load_mode 가 바뀌는 종목은 리포트에 별도 표시 | 2.5 · 2.6 |  |  |
| H8 | proto `EQUIPMENT_EZBAR=10`·`EQUIPMENT_TRAPBAR=11` + Go 매핑 + `contractMap.EQUIPMENT_KEY` + core `EquipmentType`·라벨 + 필터 칩 · 「CSV 기구 ⊆ proto ⊆ contractMap」 테스트 | 0.3 · 2.3 |  |  |
| H9 | 규칙 0: `variant_key` null + `machine_variant` 미러 있음 → 먼저 미러로 `variant_equipment`·`variant_key` 실체화(V6 의미) → 규칙 1~5. 0015 동일. 드라이런에 해당 블록 수 집계 | §3 · 2.4 · 2.5 |  |  |
| M1 | `PullCatalogRequest.include_archived`(기본 false, 새 클라이언트 true) · `Exercise.is_archived` · revision 쿼리 archived 포함 · catalogSync 가 isArchived·family·aliases·similar·mediaRef 매핑 · GetExercise 는 archived 도 반환, 상세 「통합됨 → 대상」 | 2.3 |  |  |
| M2 | merge/delete 행은 시드·0014 에서 **old_name_ko 유지 + is_archived=true**. 이름 유일 검사는 활성 행만, 「보관 행 이름 ∈ 대상 별칭」 강제, 검색 색인에서 archived 제외 | 0.2 · 0.3 · 3.1 |  |  |
| M3 | 이관 때 rename/merge 종목을 옛 이름으로 쓴 (사용자×종목) 마다 `display_name = 옛 이름` 시드 → 표시 이름 훅은 **P2 에 최소판**(이름 해석만), P3 에서 검색·선택 연동. prefs id = 결정적 `pref-<exercise_id>` · `USER_TABLES` 추가 · 「대표 이름으로 보기」 되돌리기 | 1.3 · 2.4 · 2.5 · 3.3 |  |  |
| M4 | family 메타 정본 `catalog.families.csv`(family·attachments·grips·load 적용) · implied_axes ⊆ 허용 목록 · cable 외 attach 없음 · machine 외 load 없음 테스트 | 0.1 · 0.2 · 0.3 |  |  |
| M5 | 옛 백필 처리: V8 폐기(호출 주석 처리) · V6 → 규칙 0 흡수 · V10/V12 seed id 기반 재작성 · V11/V22 → 새 정규화로 대체 · 등록 목록 고정 테스트 | 0.4 |  |  |
| M6 | delete 금지·이관 대상 목록은 운영 DB 읽기 전용 쿼리 결과로 생성·커밋(`usage.prod.csv`) · 0015 와 검증은 sync_records 의 **모든 user_id** 대상 | 0.3 · 2.6 |  |  |
| L1~L6 | 통계 재집계(480행 · new 144 · 활성 469 = 근력 443 + 유산소 26) · similar ⊆ family ∪ id 테스트+`triceps_extension` 8건 수정 · 맨몸 글루트 브릿지 영문 별칭에서 `glute bridge` 제거 · CSV `name_rule` 열(prefix·intrinsic·bodyweight) · status 무관 전 필드 `IS DISTINCT FROM` upsert · fedb 커밋 고정 · 2페이지 카탈로그 수신 테스트 | 0.1~0.3 · 2.3 |  |  |

---

### 배포·운영 규칙(전 Phase 공통)

- Phase 마다 minor 버전 + git tag + `deploy-h2500-3.sh` + 서버 `DEPLOYED_REF==HEAD` + 운영 390px 라이트/다크 눈 확인.
- Phase 2 운영 이관 직전 `pg_dump`(배포 스크립트가 백업 경로·크기 출력) · 0015 는 합계 불일치 시 자동 ROLLBACK.
- 스펙 승인 뒤 질문 없이 /qa spec → /execute → /qa code → 배포까지 진행(메모리 liftgram-spec-ask-then-autorun). 5회 hard limit 시에만 보고.

## _context — 종목 카탈로그 대개편 공유 분석

상세 근거: `.ouroboros/docs/knowledge/20261026_exercise-catalog-asis_knowledge.md`(§A~I, 파일:줄). 여기에는 구현자가 매번 봐야 할 지도만 둔다.

### 1. 카탈로그가 기기에 닿는 길 (개편 후)

```
catalog.master.csv ──gen-catalog.mjs──┬─▶ core/data/seed/exercises.seed.ts ──▶ seedRunner(계정 비울 때) ─▶ 로컬 exercises
                                      ├─▶ core/migrations/catalogMigration.data.ts ──▶ 부팅 이관(미동기 사용자 기록)
                                      ├─▶ database/migrations/0014_catalog_revamp.sql ──▶ 서버 exercises ─PullCatalog─▶ catalogSync(부팅 1회+종목 탭) ─▶ 로컬 exercises(정본)
                                      └─▶ database/migrations/0015_records_migrate.sql ──▶ 서버 sync_records(정본 이관, updated_at↑) ─pull─▶ 기기
사용자 동기(sync_records): exercises 는 is_custom=true 만 push/pull — 시드 행은 무시(D10)
```

- 서버 마이그레이션은 파일명으로 한 번만 적용(`be/internal/db/migrate.go`) — `0002` 는 손대지 않는다.
- sync pull = `updated_at > lastPulledAt`(`0011_sync.sql` 인덱스) → 서버에서 payload 를 고치고 `updated_at=now()` 면 기기가 받는다. 서버는 컬렉션 이름을 검증만 하고 목록을 모른다 → 새 테이블 `exercise_user_prefs` 도 그대로 동기된다.

### 2. 마스터 CSV 열

| 열 | 의미 |
| --- | --- |
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

### 3. 이관 매핑 규칙 (서버·기기 공통 — 생성기가 한 표로 만든다)

1. **종목 병합/삭제**: `exercise_id = 원본` → `대상`, implied axes 를 블록 변형에(brand·attach·grip) · arm=uni 는 그 블록의 세트들 `arm` 에.
2. **기구 변형 칸 → 형제 종목**: 블록의 `variant_equipment ∈ implement(barbell·dumbbell·cable·smith·kettlebell·band·machine)` 이고 종목 고유 기구와 다르면 → 같은 family 에서 그 기구의 종목으로 `exercise_id` 교체, `variant_equipment=null`.
3. **비머신 종목 + 브랜드 키**: 같은 family 의 머신 종목으로 교체 + 브랜드 승계(D9: 덤벨 OHE+newtech → 머신 OHE+newtech, 딥스+technogym/cybex → 머신 딥스, 인클라인(바벨)+hammer → 머신 인클라인 프레스 등).
4. 대상이 없으면 **옮기지 않고** 리포트에 남긴다(엉뚱한 종목 금지).
5. 모든 쓰기 후 `variant_key` 를 ADR-034 정규화로 재계산, `machine_variant` 미러 비움.
6. 멱등: 이미 규칙의 결과 상태면 아무것도 안 한다.

### 4. 코드 지도 (주요 수정 지점)

**P0·P1 에서 실제로 생긴 자리(v0.30.0)**

| 무엇 | 파일 |  |  |
| --- | --- | --- | --- |
| 정본 CSV 4종 | `core/src/data/catalog/catalog.master.csv`(+`name_rule` 열) · `catalog.families.csv`(family 축 허용 목록) · `migration-overrides.csv`(예외 표) · `usage.prod.csv`(운영 변형 분포 — 읽기 전용 쿼리 결과) |  |  |
| 생성기 | `scripts/gen-catalog.mjs` → `catalog.generated.ts` · `catalogMigration.data.ts` · `database/staged/0014_catalog_revamp.sql`(P2 에서 migrations/ 로 옮겨 켬) · `make catalog`/`catalog-check`(verify 포함) |  |  |
| 순수 규칙 | `core/domain/catalogIntegrity.ts`(무결성) · `catalogMigrationPlan.ts`(블록 이관 계획 — 서버·기기 공용) · `nameKey.ts`(공백 무시 키·seedIdOf) |  |  |
| 기기 | `core/migrations/runner.ts`(부팅 파이프라인: 시드 top-up → 백필(등록 0) → 정규화) · `catalogNormalize.ts`(**`CATALOG_NORMALIZE_ENABLED=false` — P2 에서 켠다**) · `sync/catalogFilter.ts`(D10) · `syncEngine`(부팅 대기·스키마 커서 리셋·동기 뒤 정규화) |  |  |
| 축 | `domain/variants.ts`(LOAD_KEYS·ATTACH_KEYS·canonicalVariantKeyV34·dimsFromColumns·normalizeVariantDimsV34) · 모델 getter `variant` · `volume.effectiveMultiplier` |  |  |
| 서버 | `UpsertSyncRecords` 얕은 병합(`payload |  | EXCLUDED.payload`) · proto `EQUIPMENT_EZBAR/TRAPBAR` |

| 영역 | 파일 |
| --- | --- |
| 시드·적재 | `core/data/seed/exercises.seed.ts` · `core/data/seedRunner.ts` · `src/scripts/gen-catalog.mjs`(신규) |
| KEY 참조(→ seed id) | `core/domain/exerciseFinder.ts` · `core/data/seed/substitutes.seed.ts` · `core/data/exerciseMedia*.ts` · `core/domain/movementPatterns.ts` · `core/domain/conceptRoutines.ts` · `core/data/workoutRepository.ts`(V8/V10/V12 목록) |
| 변형 | `core/domain/variants.ts` · `core/domain/machineVariants.ts` · `fe/app/components/ui/VariantSelector.tsx` · `core/data/workoutRepository.ts`(setVariant·resolveStartVariant·swapWorkoutExercise·completeWorkout) · `core/data/routineRepository.ts` |
| 스키마 | `core/db/schema.ts`(v22) · `core/db/migrations.ts` · Model 파일 |
| 동기 | `core/sync/syncEngine.ts` · `fe/lib/catalogSync.ts` |
| 검색·표시 | `fe/app/components/ExercisePicker.tsx` · `fe/app/components/CatalogClient.tsx` · `fe/app/components/session/ExerciseName.tsx` · `core/domain/exerciseName.ts` |
| 서버 | `src/proto/exercise/v1/exercise.proto` · `be/internal/exercise/*` · `database/queries/exercise.sql` · `database/migrations/0014·0015` |
| 테스트 | `core/domain/__tests__/catalogGap.test.ts` · `domain.test.ts` · `variantBucket.test.ts` · 신규 `catalogRevamp.test.ts`·`catalogMigration.test.ts`·`exerciseSearch.test.ts` · e2e |

## _analysis — 리스크·메모리·검증 전략

### 메모리 조회 결과(반영)

- liftgram-exercise-catalog-variants: nameKo 는 KEY(13곳) · nameEn 충돌 3연쇄 · 시드 추가와 FINDER_TREE 편입은 원자 · 테스트 선행 → Phase 0.3·2.2.
- liftgram-variant-bucket-invariant: 읽기/쓰기 키 파생이 달라 깨지기 쉬움 · 키 의미 변경 시 멱등 백필 · machine_variant 미러 비우기 → Phase 1·2.4 (이 메모리는 ADR-034 로 갱신 대상).
- liftgram-offline-data-loss-lessons: 서버 레코드의 `_status` 하나가 동기 전체를 죽임 → 0015 는 payload 의 `_status`/`_changed` 를 건드리지 않고, 쓰기 전에 그 키가 없는지 검사.
- liftgram-plm-sync-fallback: Bash 로 만든 아티팩트는 훅 미발동 → Write/Edit 로 마무리.
- liftgram-browser-verify-gotchas: LokiJS 비동기 flush → 부팅 이관 뒤 flushLocalDb.
- liftgram-gpu-shared-ask-first: 픽토그램은 GPU 없이(ADR-036).

### 리스크 상세 · 대응

1. **이관 정확성** — 운영 기록은 두 사용자 1,514 세트. 매핑 대상(§H.3): implement 변형 22블록 · 비머신+브랜드 ~30블록 · merge 종목(로프 푸시다운 52세트 등). 대응: 매핑 표 하나(생성) → 드라이런 리포트(블록·세트·볼륨 전후) → 운영 0015(합계 불일치 시 ROLLBACK) → 기기 부팅 이관(같은 표). 백업 `backups/pre-catalog-revamp-<ts>.dump`.
2. **동기 경합** — 기기에 미동기 변경이 있는 같은 레코드를 서버가 고치면 pull 시 Watermelon 은 로컬 변경 컬럼을 유지한다 → 부팅 이관이 다시 같은 결과를 만들고 push → 수렴. 순서: 부팅 이관은 **첫 pull 전** 1회 + pull 뒤 1회(빠른 no-op).
3. **시드 행 무시(D10)의 부작용** — 기존 기기에 시드 행이 sync 로 들어와 있던 것은 로컬에 그대로 있음(정상) · 다른 사용자 데이터 아님. 커스텀 판정은 `is_custom` 컬럼 — 운영 커스텀 4종 is_custom=true 확인됨.
4. **표시 이름 범위** — 피드에서 남이 본인 게시물의 종목을 볼 때는 보는 사람 선호 → 없으면 대표 이름(UCS-020). 공유 루틴 가져오기는 종목 id 만 옮긴다.
5. **스무고개 완결성** — 신규 143종을 트리 슬롯에 넣어야 테스트 통과. 생성기가 family → 기존 슬롯 매핑 제안, 남는 것은 수동 배치.
6. **성능** — 별칭 1,000+ 정규화 색인은 앱 시작 시 1회(≈ms). 초성 키는 이름당 1회 계산.

### 검증 전략(게이트가 진짜 막는지)

- 무결성 테스트는 **현재 시드로 먼저 돌려 실패**함을 확인한 뒤 데이터 반영(gate-must-fail-without-the-fix).
- 이관 테스트 픽스처는 운영 실제 패턴을 축약해 만든다(로프 푸시다운·해머스트렝스·인클라인+덤벨·OHE+newtech·원암 랫풀다운·레그 컬).
- 운영 검증은 DB 합계 대조 + 운영 화면(390 라이트/다크) + 이전 기록 표시.

#### 옮김 정보 (PLM)

- 원본: `.ouroboros/docs/spec/20261026_exercise-catalog-revamp`(PLM식 md 스펙 폴더 — _intent·_context·_analysis·phase-*.md를 이어 붙임)
