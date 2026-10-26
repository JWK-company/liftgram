# 종목 카탈로그 대개편 — 현황(As-Is) 전수 분석

- 작성일: 2026-10-26 · 범위: 읽기 전용 조사(코드 수정 없음) · 운영 DB는 READ ONLY 트랜잭션 SELECT만 실행
- 진실 원본: `src/core/src` (app/은 2026-10-26 은퇴 — `src/scripts/sync-core.mjs:30-35` `APP_RETIRED = true`)
- 경로 약어: `core/` = `src/core/src/`, `fe/` = `src/frontend/`, `be/` = `src/backend/`, `db/` = `src/database/`
- 부록 A에 시드 336종 전수 표가 있다.

---

## 0. 한눈 요약 (스펙에 바로 영향 주는 사실)

1. **카탈로그 경로가 3개다.** ① 번들 시드 `core/data/seed/exercises.seed.ts` → 로컬 `seedRunner`(웹에서는 계정 wipe 시에만 실행) ② 서버 PG `exercises` 테이블(시드 SQL 마이그레이션 `db/migrations/0002_seed_exercises.sql`) → `PullCatalog` → `fe/lib/catalogSync.ts`(종목 탭 진입 시에만) ③ **사용자 동기(`sync_records` collection='exercises')** — 운영 DB에 시드 종목 행이 사용자별로 999건 복제되어 있고, 18건은 **옛 이름**을 들고 있다(§H).
2. **서버 시드는 "한 번만 적용"되는 마이그레이션이다.** `0002`는 이미 운영에 적용됐다(`_migrations` 14행). `be/internal/db/migrate.go:17-18` "한 번 적용된 뒤에는 고치지 않는다 — 새 파일을 만든다". 카탈로그를 바꾸려면 **`0014_*.sql` 신규 마이그레이션**이 필요하다. 생성 스크립트 `src/scripts/gen-exercise-seed.mjs:23-25`는 아직 **`app/src/...`를 읽고 `0002`를 덮어쓴다**(은퇴한 경로 — 반드시 고쳐야 함).
3. **서버 `exercises`에 `UNIQUE(name_ko)`·`UNIQUE(name_en)`** (`db/migrations/0000_init.sql:44-45`). 별칭을 같은 테이블의 별도 행으로 만들면 이름은 유일해야 하고, 커서 키도 name_ko다.
4. **삭제가 전파되지 않는다.** seedRunner는 top-up(추가)+nameKo 동기만(`core/data/seedRunner.ts:10-52`), `catalogSync`는 갱신/생성만 하고 지우지 않으며(`fe/lib/catalogSync.ts:83-121`), `PullCatalog`는 `is_archived=false`만 준다(`db/queries/exercise.sql:37-42`). → 서버에서 archive해도 **로컬 행은 영원히 남는다.** 종목 삭제는 "archive + 클라이언트 측 이관/숨김 마이그레이션"을 따로 설계해야 한다.
5. **웹 스택은 부팅 백필을 하나도 실행하지 않는다.** V6/V8/V10/V11/V12/V22 백필은 `core/data/workoutRepository.ts:103-271`에 있지만 호출처는 은퇴한 `app/App.tsx:13,91-99`뿐. 그래서 예: 서버 시드의 `로잉 머신`은 `kind=NULL`(근력)이고 catalogSync가 로컬 kind를 그 값으로 덮는다(`0002:128`, `catalogSync.ts:99`). 레코드 이관(종목 병합·변형→별도 종목)을 하려면 **웹 부팅 백필 진입점부터 만들어야** 한다.
6. **요구 5(기구 교체 = 다른 종목)의 실데이터 근거가 있다.** 운영에서 `인클라인 프레스 (바벨)`+`equip:dumbbell` 9회, `오버헤드 트라이셉스 익스텐션`(덤벨)+`equip:newtech` 13회, `딥스`+`equip:technogym/cybex` 5회 등 "프리웨이트 종목에 다른 기구 변형"이 실제로 쓰였다(§H.3). 이 행들은 새 모델에서 다른 종목으로 옮겨야 한다.
7. **브랜드는 종목 1개(`해머스트렝스 체스트 프레스`) + 변형 키 13개(`hammer` 등)** 두 곳에 있다. 변형 키 쪽은 운영에서 많이 쓰인다(newtech 42·hammer 19·technogym 11·hoist 9·cybex 8 — workout_exercises 기준). 키를 지우면 기록이 사라진 것처럼 보인다.
8. **검색은 `includes` 부분일치 하나**(소문자화만 함). 공백 제거·초성·별칭은 없다(`fe/app/components/ExercisePicker.tsx:48-55`, `CatalogClient.tsx:136-142`). "랫풀" → "랫 풀다운"은 현재 **안 걸린다.**
9. **그립은 이미 세트 속성**(`set_logs.grip`, 스키마 v11, `core/db/schema.ts:161`)이고 값은 손 방향·폭 5종(`over/under/neutral/wide/close`, `core/domain/variants.ts:8`)뿐이다. 로프·일자바·V바 같은 **부착물(attachment) 개념은 없다.** "이전 그립 기억"은 세트 단위로 이미 부분 구현(지난 세션 세트의 grip을 프리필 `workoutRepository.ts:493-495`, 새 세트는 직전 세트 상속 `:810-811`).
10. **미디어: 근력 311종 중 이미지 215(직접 183 + 괄호 폴백 상속 32) · 스텝만 96 · 없음 0 / 유산소 25종은 전부 없음.** 출처는 free-exercise-db(Unlicense) 단일. 생성 스크립트는 `app/scripts/gen-exercise-media.js`에만 있고 `app/src` 경로를 쓴다(§D).

---

## A. 시드 카탈로그 (`core/data/seed/exercises.seed.ts`)

### A.1 총수·분포
- **총 336종** (근력 311 · 유산소 `kind:'cardio'` 25 · `loadMode:'assisted'` 3). 테스트 하한 `>=336`(`core/domain/__tests__/catalogGap.test.ts:78-81`).
- 시드 필드: `nameKo, nameEn, primaryMuscles, secondaryMuscles?, equipment, category?, kind?, loadMode?` (`exercises.seed.ts:6-15`). **별칭 필드 없음.**

| 주근육(primary[0]) | 수 | | 기구 | 수 |
|---|---|---|---|---|
| quads | 45 | | bodyweight | 95 |
| chest | 44 | | barbell | 64 |
| back | 44 | | machine | 53 |
| fullBody | 44 | | dumbbell | 50 |
| abs | 39 | | cable | 35 |
| shoulders | 30 | | other | 21 |
| biceps | 21 | | smith | 10 |
| glutes | 21 | | kettlebell | 6 |
| triceps | 17 | | band | 2 |
| forearms 9 · hamstrings 9 · traps 6 · calves 5 · other(넥) 2 | | | | |

(유산소 25종도 위 표에 포함 — 대부분 fullBody/quads.)

### A.2 이름 규칙 불일치 (근력 311종 기준)
- 괄호형 `'X (기구)'` **41** · 접두형 `'기구 X'` **43** · 후미형 `'X 머신'` **16** · 기구 토큰 없음 **211**.
- 같은 동작 안에서도 섞여 있다:
  - 벤치: `바벨 벤치프레스`(접두, :19) · `덤벨 벤치프레스`(:27) · `스미스 벤치프레스`(:35) · 머신은 `체스트 프레스 머신`(후미, :34) — 반면 인클라인/디클라인은 괄호형(:22-28, :243).
  - 힙 쓰러스트: `힙 쓰러스트 (바벨)`(:125) · `(머신)`(:226) · `(덤벨)`(:342) 인데 스미스만 `스미스 힙 쓰러스트`(:185).
  - 머신: 접두 `머신 로우`·`머신 레터럴 레이즈`·`머신 컬` 3종 vs 후미 `~ 머신` 16종 vs 괄호 `(머신)` 3종(인클라인 프레스·힙 쓰러스트·슈러그).
  - 리버스 컬: `리버스 바벨 컬`(:99) vs `리버스 컬 (덤벨)`(:311)·`리버스 컬 (케이블)`(:312) — 같은 동작인데 다른 규칙이라 베이스로 안 묶임.
  - 띄어쓰기: `클로즈그립 풀다운`(:50) vs `클로즈 그립 벤치프레스`(:86) vs `와이드 그립 푸시업`(:244); `원암 랫풀다운`(:173) vs `랫 풀다운`(:49).
  - 괄호값이 기구가 아닌 것: `프론트 레이즈 (플레이트)`(:292, equipment `other`), `히트 (HIIT)`(:412). 괄호 폴백 정규식(`exerciseMedia.ts:31`, `movementPatterns.ts:211`)이 이것도 잘라낸다.
- 베이스명 축약 함정(`core/domain/exerciseName.ts:41-56`): 세션 화면은 `baseExerciseName`을 쓴다(`fe/app/components/session/ExerciseName.tsx:60`). 결과적으로 서로 다른 종목이 같은 이름으로 보인다 — `바벨 컬`/`덤벨 컬`/`케이블 컬`/`머신 컬` → 모두 **"컬"**, `크런치`(맨몸)와 `케이블 크런치` → 둘 다 **"크런치"**, `바벨 로우`/`덤벨 로우`/`머신 로우`/`로우 (스미스)` → **"로우"**, `바벨 스쿼트`·`스미스 스쿼트` → "스쿼트". 중간 토큰(`인클라인 덤벨 플라이`, `디클라인 체스트 프레스 머신`의 '머신'은 후미라 축약됨)은 규칙이 제각각.
- nameEn ↔ nameKo 불일치(과거 rename 흔적 — id 보존 때문에 nameEn 유지): `바벨 클린`=`Power Clean`(:155), `덤벨 레터럴 레이즈`=`Side Lateral Raise`(:64), `덤벨 리어 델트 플라이`=`Rear Delt Fly`(:68), `인클라인 프레스 (바벨)`=`Incline Press`(:22), `러닝머신`=`Treadmill Running`(:200). **nameEn은 id 슬러그 원천이라 바꾸면 안 된다**(§B).

### A.3 브랜드명·이상한 종목 후보
- **브랜드명 종목**: `해머스트렝스 체스트 프레스`/`Hammer Strength Chest Press` (:233, machine). 테스트가 존재를 **강제**한다(`catalogGap.test.ts:22-31`), FINDER_TREE(`exerciseFinder.ts:17`), movementPatterns(`movementPatterns.ts:29`), SUBSTITUTES(`substitutes.seed.ts:265,267,269`)에 키/값으로 등장. 운영 사용 0회(§H.2 상위 70에 없음).
- 사실상 머신 모델명: `하이 로우`(:169)·`로우 로우`(:170) — 해머스트렝스 iso-lateral 계열 이름. 운영에서 하이 로우 38세트·로우 로우 11세트 사용 중 → 삭제 아닌 별칭/정리 대상.
- 규약 위반(세트 속성을 종목으로 만든 것 — 2026-08 대확장 규약 "그립·원암은 별도 엔트리 금지", :251-253): `원암 체스트 프레스 머신`(:237), `원암 랫풀다운`(:173), `클로즈그립 풀다운`(:50), `와이드 그립 푸시업`(:244), `리버스 그립 푸시다운`(:306), `로프 푸시다운`(:88, 부착물을 종목으로). 원암/와이드 푸시업은 칼리스데닉스 예외로 볼 수 있음.
- 분류 이상: `글루트 브릿지` equipment `barbell`(:126 — 보통 맨몸), `숄더 탭` primary `abs`인데 어깨 섹션(:294), `프론트 레버 홀드/레이즈` primary `back`인데 전신 블록(:396,:402), 넥 2종 primary `other`(:315-316), `로잉 머신`은 시드에 kind 없음(:161 — 백필 V10에 의존, 웹에선 안 돎).
- `케이블 킥백`(:127, glutes) — 이름만으론 삼두 `트라이셉스 킥백 (케이블)`(:219)과 혼동.

### A.4 중복·유사(별칭 그룹 후보)
| 그룹(같은 동작·다른 이름) | 시드 엔트리 |
|---|---|
| 오버헤드/밀리터리 | `오버헤드 프레스`(:59) · `밀리터리 프레스`(:60) — 둘 다 barbell |
| 레그 컬 | `레그 컬`(:121, 일반) · `라잉 레그 컬`(:119) · `시티드 레그 컬`(:120) · `스탠딩 레그 컬`(:338) |
| 스쿼트 | `바벨 스쿼트`(:103) · `하이바 스쿼트`(:105) |
| 바벨 로우 | `바벨 로우`(:44) — 사용자 요구 "벤트오버로우"는 **별칭 엔트리 없음** |
| 시티드 로우 | `시티드 케이블 로우`(:48) · `로우 로우`(:170 machine) · `머신 로우`(:54) — "롱풀" 없음 |
| 스컬크러셔 | `스컬 크러셔 (바벨)`(:91)·`(덤벨)`(:218) — "라잉 트라이셉스 익스텐션" 없음 |
| 삼두 머신 | `트라이셉스 익스텐션 머신`(:307) · `딥 머신`(:188) · `어시스트 딥스`(:166) — 사용자 요구 "머신 암 익스텐션"은 **이미 있는 종목의 별칭**으로 해결 가능 |
| 이두 머신 | `머신 컬`(:83) — "암컬 머신"은 별칭 |
| 푸시다운 | `트라이셉스 푸시다운`(:87) · `로프 푸시다운`(:88) · `리버스 그립 푸시다운`(:306) — 요구 7(부착물 옵션)과 직결 |
| 체스트 프레스 머신 | `체스트 프레스 머신`(:34) · `해머스트렝스 체스트 프레스`(:233) · `컨버징 ~ 머신`(:236) · `라잉 ~ 머신`(:235) · `원암 ~ 머신`(:237) |
| 플라이 | `케이블 크로스오버`(:31) · `시티드 케이블 플라이`(:265) · `로우 케이블 플라이`(:32) · `펙 덱 플라이`(:33) |
| 리어델트 | `덤벨 리어 델트 플라이`(:68) · `케이블 리어 델트 플라이`(:179) · `리버스 펙 덱`(:69) |
| 어브/어덕션 | `힙 어브덕션 머신`(:128)·`케이블 힙 어브덕션`(:349) / `힙 어덕션 머신`(:184)·`케이블 힙 어덕션`(:350) — "이너/아웃 싸이" 별칭 없음 |
| 레그레이즈 | `행잉 레그 레이즈`(:142) · `라잉 레그 레이즈`(:191) · `패러럴 바 레그 레이즈`(:367) (+ 니 레이즈 3종) |
| 싯업 | `싯업`(:248) · `디클라인 싯업`(:147) · `V 싯업`(:355) |
| 클린 | `바벨 클린`(:155, en Power Clean) · `행 클린`(:379) · `클린 풀`(:381) |
| 런지 | `런지 (덤벨/바벨/스미스)` · `워킹 런지`(:111, dumbbell) · `리버스 런지`(:330, bodyweight) |

### A.5 빠진 종목 후보(기구 대응 갭 — 운영 사용 흔적 포함)
"같은 동작의 다른 기구" 엔트리가 없어 사용자가 변형 키로 메운 것(§H.3)이 1순위다.
- `프리처 컬 (머신)` — 운영: `프리처 컬 (바벨)`+`equip:machine`.
- 머신 랫풀다운(플레이트로드) — 운영: `랫 풀다운`+`equip:cybex/hammer`.
- 머신 시티드 로우 — 운영: `시티드 케이블 로우`+`equip:technogym` 4회.
- `클로즈 그립 벤치프레스 (스미스)` — 운영: +`equip:smith`.
- 머신 딥스(시티드 딥) — `딥 머신`(:188)이 있으나 운영은 `딥스`+`equip:technogym/cybex`로 기록.
- 그 외 일반 갭(근거=시드 부재 확인): 트랩바(헥스바) 데드리프트, 덤벨 스쿼트, 덤벨 데드리프트, 이지바/바벨 오버헤드 트라이셉스 익스텐션, 케이블 프리처 컬, 인클라인 케이블 플라이, 스미스 루마니안 데드리프트(메모리엔 2026-07-21 추가로 적혀 있으나 **현재 시드에 없음** — 미확인), 덤벨 프론트 스쿼트, 덤벨 업라이트는 있음.
- 사용자 커스텀 4종(운영)도 갭 신호: `레그 프레스 (호이스트)`, `라잉 레그 컬 (호이스트)`, `프론트 스쿼트 (바벨)`, `바벨 스쿼트 (바벨)` — 브랜드·기구를 이름으로 붙인 커스텀이며 모두 사용 0회, equipment/muscle은 `other`.

---

## B. 시드 적재 · 서버 카탈로그 · 동기

### B.1 로컬 seedRunner (`core/data/seedRunner.ts`)
- `seedExercisesIfNeeded`(:10-52): ① 비커스텀 기존 행 조회 → ② `syncSeedNames`(:55-68) nameEn 기준으로 nameKo in-place 갱신 → ③ **nameEn 미보유 시드만 생성**(top-up), id=`seedId(nameEn)`=`seed-<슬러그>`(:93-99) → 배치 실패 시 개별 생성 폴백(soft-deleted 잔존 id 충돌 방어, :35-48) → ④ `syncSubstitutes`(:71-90) nameKo→id 해소(정확일치, 미일치 침묵 드롭).
- **삭제·archive 처리 없음.** 시드에서 빼도 로컬 행은 남는다.
- 함정(메모리·테스트로 확인): nameEn이 기존과 겹치면 top-up 미생성 + koByEn Map에서 **뒤 엔트리가 기존 nameKo를 rename**(:56) → KEY 파괴. 슬러그 유일성 테스트(`catalogGap.test.ts:83-92`)가 막는다.
- 웹에서의 호출처: `core/sync/syncOwner.ts:101`(계정 wipe 직후)뿐. 일반 부팅에선 안 돈다.

### B.2 consolidate·백필 (`core/data/workoutRepository.ts`)
| 함수 | 줄 | 하는 일 |
|---|---|---|
| `backfillVariantKeysV6` | 103-122 | 레거시 `machine_variant` → `variant_key/variant_equipment` |
| `consolidateExercisesV8` | 127-176 | `EXERCISE_CONSOLIDATIONS`(:131-141): 인클라인 바벨/덤벨/머신 프레스 → **target nameKo `'인클라인 프레스'`** 로 workout/routine_exercises 재지정 + 기구를 변형으로 승계 + 원본 `prepareMarkAsDeleted`. **target nameKo가 현재 시드에 없어(현재 `인클라인 프레스 (바벨)`) 자동 no-op**. 요구 5와 정반대 방향(별도 종목 → 변형)의 선례 |
| `backfillCardioKindV10` | 181-191 | 이름 목록(:180)으로 kind='cardio' |
| `backfillLoadModeV12` | 196-205 | 어시스트 3종 load_mode |
| `backfillDropGripArmV11` | 210-231 | 종목 단위 grip/arm을 버킷에서 제거 |
| `backfillNormalizeIntrinsicEquipmentV22` | 239-271 | 고유 기구 = null 정규화 + `machine_variant` 미러 비움 |

- **호출처는 `app/App.tsx:91-99`(은퇴)뿐 — 웹(`fe/`)에서 grep 0건.** 새 이관 백필을 넣으려면 웹 부팅 경로(예: `fe/lib/localDb.ts`/세션 진입)에 호출 지점을 새로 만들어야 한다.
- 이관 패턴 참고: V8은 "참조 재지정(exercise_id 변경) + 원본 soft-delete"이고 동기(`_status=updated/deleted`)로 서버 sync_records에도 퍼진다.

### B.3 서버 카탈로그 (Go + PG)
- 테이블 `exercises`(`db/migrations/0000_init.sql:22-50`): `id text PK, name_ko NOT NULL UNIQUE, name_en UNIQUE, primary_muscles text[], secondary_muscles text[], equipment, kind, load_mode, substitute_ids text[], image_url, is_custom, is_archived, created_at, updated_at`. **user_id 없음**(전역).
- 시드 SQL: `0002_seed_exercises.sql` — 생성물(`gen-exercise-seed.mjs`), `ON CONFLICT (id) DO UPDATE ... WHERE IS DISTINCT FROM`(멱등). **운영 적용 완료 → 재생성해도 재적용되지 않음**(`migrate.go:72-75` 파일명으로 skip).
- 생성 스크립트 `src/scripts/gen-exercise-seed.mjs:22-25` — 입력 경로가 `REPO/app/src/data/seed/*.ts`, 출력이 `0002`로 하드코딩. **은퇴 경로 + 적용 완료 파일 덮어쓰기** 두 문제.
- 쿼리(`db/queries/exercise.sql`): `PullCatalogAfter`(:37-42, `is_archived=false`, 커서=name_ko), `CreateCustomExercise`(:46-49, name_ko unique 충돌 시 Conflict — `be/internal/exercise/repo.go:99`), `ArchiveCustomExercise`(:54-56, 커스텀만), `GetCatalogRevision`(:60-, count+max(updated_at)).
- 계약 `src/proto/exercise/v1/exercise.proto:78-96` `Exercise` 메시지: id·name_ko·name_en·muscles·equipment(enum, band 포함 :27-38)·kind·load_mode·substitute_ids·image_url·is_custom·updated_at. **alias 필드 없음** — 추가 시 proto→`make proto`→handler·catalogSync 매핑까지.
- 운영 카탈로그: 336행, custom 0, archived 0(§H).

### B.4 웹 로컬 배포 (`fe/lib/catalogSync.ts`)
- 개정키 `count:updatedAt` 비교(:34-71) → 전량 받아 **있는 id는 갱신, 없는 id는 생성, 커스텀·서버에 없는 행은 그대로**(:83-121). 서버 값으로 nameKo·kind·loadMode·substituteIds·imageUrl을 덮는다.
- 호출: `CatalogClient.tsx:76-83,148-149`(종목 탭), `app/diag/db/page.tsx:110-119`. 세션·루틴 화면은 부르지 않는다.

### B.5 사용자 동기 (`sync_records`) — 카탈로그의 세 번째 경로
- `db/migrations/0011_sync.sql:11-24`: `(user_id, collection, record_id)` 유일, payload jsonb, 삭제는 `deleted` 표시. 서버는 payload를 해석하지 않음(코칭 리포트만 `exercise_id` 읽음 — `be/internal/coaching/report.go:137,150,259`).
- `core/sync/syncEngine.ts`는 WatermelonDB `synchronize`로 **모든 컬렉션**을 주고받는다(컬렉션 필터 없음 — grep 0건). 그래서 **시드 종목 행도 사용자별로 push/pull** 된다(운영 999행).
- 의미: 시드 rename/삭제를 해도 사용자의 sync_records에 옛 행이 남아 있고, 다른 기기가 pull하면 **옛 nameKo로 덮일 수 있다**(catalogSync와 sync pull 중 나중에 쓴 쪽이 이김). 운영에 이미 옛 이름 18건 존재(§H.1).

### B.6 커스텀 종목
- 웹은 로컬에만 생성(`core/data/exerciseRepository.ts:57-73` `createCustomExercise`, `is_custom=true`, nameEn 선택) → sync_records로만 서버에 간다(서버 `exercises`엔 0행). 로컬엔 nameKo 유일 제약이 없다 → **신규 시드 nameKo가 사용자 커스텀 이름과 같아질 수 있음**. `getExerciseIdsByNames`(:12-18)는 Map이라 뒤 행이 이김.

### B.7 추가·삭제·병합이 기록에 미치는 경로
- 기록 참조는 전부 `exercise_id`(id) 기반: `workout_exercises.exercise_id`, `routine_exercises.exercise_id`(`core/db/schema.ts:75,121`). 세트는 `set_logs.workout_exercise_id`로 간접 참조.
- PR·이전기록·볼륨은 저장 테이블 없이 **조회 시 계산**: `(exercise_id × variant_key)` 버킷(`workoutRepository.ts:1110-1155` completeWorkout, `getPreviousExerciseSets` :352-383 `Q.where('variant_key', variant)`, analytics `analyticsRepository.ts:282`).
- **추가**: 안전(새 id). 단 nameEn 슬러그 충돌·nameKo 충돌만 피하면 됨.
- **rename(nameKo)**: id 불변이라 기록은 유지되지만 nameKo-KEY 서브시스템(§F)이 전부 끊김 + sync_records 옛 이름 역류(§B.5).
- **삭제**: 시드에서 빼도 로컬·sync_records에 남음. 진짜로 없애려면 그 id를 참조하는 workout/routine_exercises를 다른 id로 **재지정**하는 클라이언트 백필이 필요(V8 패턴). 재지정하지 않고 soft-delete만 하면 그 종목 기록이 화면에서 이름을 잃는다(`getExercise` find 실패).
- **병합(A→B)**: V8처럼 참조 재지정. 버킷 키를 함께 정규화해야 함(B의 고유기구=null 불변식).

---

## C. 변형 모델

### C.1 도메인 (`core/domain/variants.ts`)
- 축: `equipment`(implement 7종 `IMPLEMENT_KEYS` :14 = barbell·dumbbell·machine·cable·smith·kettlebell·band, 또는 머신 브랜드/커스텀 키) · `grip`(`GRIP_KEYS` :8 = over·under·neutral·wide·close) · `arm`(:10 bi/uni).
- 버킷 키 `canonicalVariantKey`(:28-37) = `equip:<v>|grip:<v>|arm:uni`, 전부 기본이면 null. **현재 실제 버킷은 기구 1축**(ADR-026 Approved; 그립을 버킷으로 되돌리는 ADR-030은 Draft — `.ouroboros/docs/decisions/ADR-030.json`). V11이 종목 단위 grip/arm을 비웠고 운영 `variant_grip` 0건(§H.3).
- `normalizeVariantEquipment`(:74-81) — 고유 기구 선택=null. 쓰기 경로 `setVariant`(`workoutRepository.ts:901-915`), 루틴 `routineRepository.ts:149-160`이 통과.
- `equipmentOptionsFor`(:180-193) — 머신 종목이면 `[null, 브랜드13, custom1-3]`, 아니면 `[null, implement7]`(+머신 선택 시 브랜드).

### C.2 머신 브랜드 (`core/domain/machineVariants.ts`)
- `MACHINE_BRAND_KEYS`(:6-20): `hammer, lifefitness, technogym, cybex, precor, matrix, nautilus, hoist, newtech, panatta, gym80, prime, arsenal` — **해머스트렝스는 여기 키로 존재**(라벨 :31). 커스텀 슬롯 `custom1~3`(:23), 이름은 `user_profiles.machine_variant_labels`(`schema.ts:22`).
- 핀로드/플레이트로드 개념 **없음**(grep 0). 브랜드와 같은 `equipment` 슬롯 하나만 있어, 브랜드와 로딩 방식을 동시에 표현할 수 없다.

### C.3 VariantSelector (`fe/app/components/ui/VariantSelector.tsx`)
- 레벨1: implement 7종 칩(고유 기구가 있으면 '기본' 생략, :51-56) → 고유 기구 선택 시 `equipment:null`(:106). 레벨2: 머신 활성 시 브랜드+커스텀(:112-135).
- 사용처: 세션 `ExerciseBlock.tsx:389-394` → `repo.setVariant(we.id, dims)`; 루틴 `RoutineEditor.tsx:607-612` → `setRoutineExerciseVariant`.
- **현재 동작(요구 5와의 차이)**: 바벨 벤치에서 '덤벨'을 고르면 **같은 exercise_id에 `variant_key='equip:dumbbell'`** 로 저장 → `덤벨 벤치프레스` 종목과 기록이 갈라진다. 종목 자체를 바꾸는 경로는 별도로 `swapWorkoutExercise`(`workoutRepository.ts:751-772`, ActiveWorkout `:395-401` 피커 'swap' 모드)가 있다 — 세트는 유지, exercise_id 교체, 새 종목의 마지막 수행 변형 승계. **요구 5는 "기구 칩 → 대응 종목 id 해소 → swap" 으로 재사용 가능**하나, 대응 종목을 찾을 매핑(같은 베이스의 기구별 엔트리)이 데이터로 없다(현재는 `baseExerciseName` 문자열 규칙뿐, §A.2 불일치 때문에 불완전).
- 승계 규칙: 세션 시작·즉석 추가·교체 모두 "변형 미지정이면 마지막 수행 변형 승계"(`resolveStartVariant` :738-744, `addExerciseToWorkout` :645-684, swap :751).

### C.4 그립·팔 (세트 속성)
- `set_logs.arm`(v8)·`set_logs.grip`(v11) (`schema.ts:160-161`). UI: `fe/app/components/session/SetRowEdit.tsx:157-161,447,473-476`(세트 옵션 시트), 저장 `setSetGrip`(`workoutRepository.ts:880-887`).
- 기억: 템플릿 세트 프리필이 지난 세션 같은 버킷의 세트별 grip/arm 복사(:493-495), `addSet`이 직전 세트 grip/arm 상속(:810-811). **종목 단위 "마지막 그립" 저장소는 없음**(세트별 복사로 대신).
- 부착물(로프·일자바·V바·벌컨·싱글핸들·EZ바)은 어휘 자체가 없다. GRIP_KEYS 확장 시 `GRIP_LABELS`·`GRIP_SHORT_LABELS`(:95-109) 동시 갱신 필요. 요구 7의 "기록 분리"를 원하면 버킷 축 추가 = ADR-026 개정(ADR-030 Draft 재검토)이 필요하다.

---

## D. 미디어

### D.1 구조
- `core/data/exerciseMedia.ts`: CDN `https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/`(:17), `getExerciseMedia(nameKo)`(:36-51) — **nameKo 정확 키 + 괄호 접미 제거 폴백**(`lookupWithBase` :28-34), `hasMediaImages`(:54-56), 크레딧 상수 `'free-exercise-db (Public Domain)'`(:58).
- `exerciseMedia.data.ts`: `RAW_MEDIA`(키=nameKo, 값 `{s?,e?,k[],en[]}`) 291키 — 이미지 195 · 스텝만 96. 12키는 괄호 베이스명(`인클라인 프레스`·`해머 컬`·`런지` 등)으로 변형들이 상속.
- `exerciseMedia3d.data.ts`: `RAW_MEDIA_3D = {}`(비어 있음, :5) — ADR-029 라이선스 게이트 통과 에셋만.
- 라이선스: free-exercise-db = Unlicense(퍼블릭 도메인), 이미지 원출처 미문서화로 chain-of-title 잔여 리스크 명시(`exerciseMedia.ts:2-3`). 크레딧은 관례 표기(의무 아님). **종목별 출처 필드 없음** — 출처가 여러 곳이 되면 per-entry 크레딧 필드가 필요.
- 서버 `exercises.image_url` 컬럼 존재(운영 전부 NULL, sync_records의 image_url도 비어 있음 0건) — 사용자 업로드 이미지용(`ExerciseFormClient.tsx:48-200`).

### D.2 커버리지(시드 336종 대비, 폴백 반영)
- **이미지 있음 215** (직접 키 183 + 괄호 폴백 상속 32 — 상속 목록: 인클라인 프레스 4종, 프론트 레이즈 (덤벨/케이블/바벨/플레이트), 업라이트 로우 3종, 해머 컬, 프리처 컬 2종, 스컬 크러셔 2종, 트라이셉스 킥백 2종, 리스트 컬 2종, 런지 3종, 불가리안 3종, RDL 2종, 힙 쓰러스트 (바벨/머신/덤벨), 체스트 서포티드 로우 (덤벨)). 주의: 상속은 **다른 기구의 사진**을 보여준다(예: `프리처 컬 (덤벨)`이 바벨 사진).
- **스텝만 96** (이미지 없음, 텍스트만): 펜들레이 로우, 머신 레터럴 레이즈, 노르딕 컬, 쓰러스터, 버피, 펜듈럼 스쿼트, 벨트 스쿼트, 로우/숄더 프레스/슈러그 (스미스), 해머스트렝스 체스트 프레스, 디클라인/라잉/컨버징/원암 체스트 프레스 머신, 시티드/라잉 케이블 체스트 프레스, 라슨 프레스, 피트 업 벤치프레스, 디클라인 프레스 (스미스), 와이드 그립·데피싯·클랩·닐링·플랭크·링 푸시업, 덤벨 스퀴즈 프레스, 시티드 케이블 플라이, 랜드마인/메도우스/씰/고릴라 로우, 체스트 서포티드 티바 로우, 풀오버 머신, 네거티브/키핑/링 풀업, 데드 행, 백 익스텐션 머신, 파이크 푸시업, 핸드스탠드 홀드, 케이블 Y 레이즈, 체스트 서포티드 Y 레이즈, 오버헤드 플레이트 레이즈, 숄더 탭, 케틀벨 헤일로, 웨이터 컬, 21 컬, 비하인드 백 케이블 컬, 플레이트 컬, 와이드 엘보 트라이셉스 프레스, 점프 슈러그, 라잉 넥 컬/익스텐션, 포즈/피스톨/레터럴/스플릿 스쿼트, 월 싯, 리버스/레터럴/점프/오버헤드 런지, 데드리프트 하이 풀, 파이어 하이드런트, 클램셸, 프로그 펌프, 버드 독, 글루트 킥백 머신, 케이블 힙 어브덕션, 레터럴 레그 레이즈, 레터럴 밴드 워크, 할로우 락, 라잉/행잉 니 레이즈, 패러럴 바 레그 레이즈, 드래곤 플래그, 리버스/스파이더맨 플랭크, 토즈 투 바, L-싯 홀드, 토르소 로테이션 머신, 프레스 언더, 랜드마인 스쿼트 앤 프레스, 케틀벨 어라운드 더 월드, 슬레드 풀, 수트케이스 캐리, 월 볼, 메디신 볼 슬램, 베어 크롤, 프론트 레버 홀드/레이즈, 버피 브로드 점프, 버피 오버 더 바, 점핑 잭, 하이 니.
- **없음 25** = 유산소 전부(러닝머신·러닝·걷기·실내 사이클·일립티컬·천국의 계단·줄넘기·어썰트 바이크·스텝퍼·스키에르그·수영·복싱·클라이밍·하이킹·스프린트·야외 사이클·리컴번트 바이크·히트·에어로빅·요가·필라테스·스케이팅·스키·스노우보드·스트레칭). 생성 스크립트가 유산소를 의도적으로 제외(`app/scripts/gen-exercise-media.js:11`).
- 운영 사용 상위 중 스텝만: `머신 레터럴 레이즈`(33세트). 상위 70개 중 나머지는 대부분 이미지 있음.

### D.3 생성 파이프라인
- `app/scripts/gen-exercise-media.js`(은퇴 디렉터리에만 존재) — 입력: free-exercise-db `dist/exercises.json` 덤프(비커밋, @main mutable), `scripts/media-supplement.json`; ALIAS 수동 매핑(:29-), 마커 `GENERATED_MARK`(:26) 아래 재생성, 소실·건수 가드, 의료 단정 카피 게이트. 경로 상수 `APP/src/data/...`(:20-25) — **core로 옮기며 경로 수정 필요.**
- `media-supplement.json`은 `app/scripts/`와 `src/core/scripts/` 두 곳(현재 동일). `ingest-3d-media.js`도 app에만.
- 수기 편집 금지(테스트 `catalogGap.test.ts:131-142` supplement↔RAW_MEDIA 드리프트 검사).

### D.4 프론트 소비처
- 종목 목록 썸네일: `fe/app/components/CatalogClient.tsx:364` `row.imageUrl || getExerciseMedia(nameKo)?.start` (40px `<img>` :385-392) — steps-only는 빈 문자열이라 자연히 아이콘 폴백.
- 운동 상세: `fe/app/exercise/[id]/page.tsx:103,140-144`(hasMediaImages 게이트+크레딧).
- 세션 팁 패널: `fe/app/components/session/ExerciseTipPanel.tsx:34-42`, 팁 버튼 노출 `ExerciseBlock.tsx:230`(미디어 있으면, 유산소 제외).
- **ExercisePicker(세션 추가·교체·루틴 편집 피커)는 썸네일 없음**(`ExercisePicker.tsx:90-103` 이름+기구 태그만).

### D.5 이미지 출처 후보(라이선스 관점 — 미검증 메모)
- free-exercise-db: 873종 규모, 현재 매칭은 일부. 무매칭 96종 중 추가 매칭 가능분 재탐색 여지(ALIAS 확장). 라이선스 Unlicense.
- 그 외 출처(wger 등)는 이미지별 라이선스가 CC-BY-SA 등으로 섞여 있어 **종목별 크레딧 필드 + ADR-029식 게이트**가 전제. (조사 범위 밖 — 미확인)
- 자체 제작(일러스트/AI 생성)은 저작권 문제 최소지만 `RAW_MEDIA_3D`처럼 자체 호스팅 경로(`/media3d/`, 테스트 `catalogGap.test.ts:171`) 규약을 따를 것.

---

## E. 검색

| 위치 | 구현 | 줄 |
|---|---|---|
| `fe/app/components/ExercisePicker.tsx` (세션 추가·교체, 루틴 편집 `RoutineEditor.tsx:337`) | `q = query.trim().toLowerCase()`, `nameKo.toLowerCase().includes(q) \|\| nameEn.includes(q)`, 최대 40건 | 48-55 |
| `fe/app/components/CatalogClient.tsx` (종목 탭) | 쿼리는 기구·부위·kind만(`queryExercises`), 검색어는 JS `includes`(동일 규칙), 스무고개 names 교집합 | 106-142 |
| `core/data/exerciseRepository.ts` `queryExercises` | `Q.like` 검색 지원하나 웹(LokiJS)에서 한글 미작동 → 화면은 쓰지 않음. 부위 필터는 JSON 문자열 LIKE | 28-42 |

- 공백 무시: **없음** — "랫풀" ⊄ "랫 풀다운". "벤치 프레스"(공백) ⊄ "바벨 벤치프레스".
- 초성 검색·자모 분해·오타 허용·별칭·정렬(관련도) **없음**. ExercisePicker는 정렬을 `name_ko` 오름차순(쿼리 :41)에 맡기고 40건에서 자른다 → 흔한 종목이 잘릴 수 있음.
- 부위 필터: CatalogClient 칩(:260-), ExercisePicker엔 부위 필터 없음.
- 재사용 가능한 정규화 유틸: 없음(`gear.ts:239-249 sanitizeText`는 공백 접기만). 검색 정규화 함수를 core/domain에 새로 두고 두 화면이 공유하는 것이 자연스럽다.

---

## F. nameKo(및 nameEn)를 KEY로 쓰는 곳 전수

| 소비처 | 파일:줄 | 키 | 매칭 | 미일치 시 |
|---|---|---|---|---|
| FINDER_TREE(스무고개) | `core/domain/exerciseFinder.ts:15-` | nameKo | 정확 | 테스트 실패 |
| SUBSTITUTES | `core/data/seed/substitutes.seed.ts`(329줄) → `seedRunner.ts:71-90`, `gen-exercise-seed.mjs:65-66` | nameKo(키·값) | 정확 | 침묵 드롭(테스트가 막음) |
| RAW_MEDIA | `core/data/exerciseMedia.data.ts` → `exerciseMedia.ts:28-51` | nameKo | 정확+괄호폴백 | 미디어 없음 |
| RAW_MEDIA_3D | `exerciseMedia3d.data.ts` | nameKo | 정확+괄호폴백 | — |
| 무브먼트 패턴 | `core/domain/movementPatterns.ts:21,208-213` | nameKo | 정확+괄호폴백 | null |
| 콘셉트 루틴 | `core/domain/conceptRoutines.ts:8` → `exerciseRepository.ts:12-18` | nameKo | 정확 | 루틴에서 종목 누락 |
| consolidate V8 | `workoutRepository.ts:131-141,146-148` | nameKo | 정확 | no-op |
| 유산소 승격 V10 | `workoutRepository.ts:180` | nameKo | 정확 | no-op |
| 어시스트 V12 | `workoutRepository.ts:195` | nameKo | 정확 | no-op |
| 유산소 지표 | `core/domain/cardio.ts:73-106` `CARDIO_METRICS_BY_NAME_EN` | **nameEn** | 정확 | 기본 지표 |
| 시드 id | `seedRunner.ts:93-99`, `gen-exercise-seed.mjs:43` | **nameEn 슬러그** | — | 중복/rename 사고 |
| 스무고개 결과 교집합 | `CatalogClient.tsx:136` | nameKo | 정확 | 목록 빔 |
| 서버 커서·유일 | `0000_init.sql:44-45`, `exercise.sql:37-42` | name_ko/name_en | — | 삽입 실패 |
| 테스트 하드코딩 | `catalogGap.test.ts:22-38`(해머스트렝스 등 7종+기존 4종) | nameKo | 정확 | 테스트 실패 |

### F.1 강제 테스트 계약
`core/domain/__tests__/catalogGap.test.ts`
1. :22 갭 이관 7종 존재(해머스트렝스 체스트 프레스 포함) + 기존 KEY 4종(바벨 벤치프레스·스미스 벤치프레스·랫 풀다운·딥스).
2. :40 무브먼트 패턴 키 ⊆ 시드(베이스 폴백 허용). :46 직접/폴백 조회 일관.
3. :56 콘셉트 루틴 종목 ⊆ 시드 + 카피 게이트.
4. :78 시드 ≥336 + nameKo 유일.
5. :83 nameEn 슬러그 유일.
6. :94 SUBSTITUTES 키·값 전건 시드 nameKo 정확일치.
7. :102 FINDER_TREE ⊆ 시드(베이스 폴백 허용).
8. :110 RAW_MEDIA 키 ⊆ 시드(베이스 폴백 허용).
9. :116 steps-only 렌더 계약(start/end 빈 문자열 + 한/영 스텝).
10. :131 supplement ↔ RAW_MEDIA 드리프트 금지.
11. :144 미디어 카피 의료 단정 금지.
12. :152 IMPLEMENT_KEYS 라벨 완비 + band 존재.
13. :162 유산소 15종 kind=cardio.
14. :171 3D 매핑 ⊆ 시드 + `/media3d/` 경로.

`core/domain/__tests__/domain.test.ts`
- :396 스무고개 완결성 — FINDER_TREE가 있는 부위(chest·back·shoulders·triceps·quads·hamstrings·glutes·calves·abs)의 **모든 근력 종목(primary[0])이 어느 슬롯엔가 속해야** 하고, 트리 이름은 실재(정확일치 — 여기선 베이스 폴백 없음), 슬롯 key 유일. → **시드 추가와 FINDER_TREE 편입은 같은 커밋.**
- :272-290 variant 키 canonical/parse/레거시 승계(`hammer→equip:hammer`).
- :230-256 프로그램 생성기(장비 필터).

`core/domain/__tests__/variantBucket.test.ts` :12-49 — 고유 기구=null 정규화, 대체 기구 별도 버킷, 정규화는 기구 축만, 두 경로 같은 키.

---

## G. 데이터 모델

### G.1 로컬 WatermelonDB (`core/db/schema.ts`, **SCHEMA_VERSION = 21** :5, 마이그레이션 `core/db/migrations.ts` 최종 toVersion 21 :285)
- `exercises`(:37-55): name_ko(idx), name_en, primary_muscles(JSON), secondary_muscles(JSON), equipment(idx), category, kind, load_mode, is_custom, substitute_ids(JSON), image_url, is_archived, created_at, updated_at.
- `routine_exercises`(:71-95) / `workout_exercises`(:117-144): exercise_id(idx), `machine_variant`(레거시 미러), `variant_key`(idx), `variant_equipment`, `variant_grip`, `variant_arm`, superset_group, cardio_target, prescription …
- `set_logs`(:146-177): arm(v8), grip(v11), strict_reps, load_adjust_kg, partial_reps, 유산소 지표, set_type, target_rir, done …
- `user_profiles.machine_variant_labels`(:22, 커스텀 슬롯 이름), `available_equipment`(:21).

### G.2 서버
- `exercises`(§B.3). 사용자 기록은 테이블이 아니라 `sync_records.payload`(jsonb)에 위 로컬 컬럼 그대로.

### G.3 별칭(alias) 필드 후보
| 안 | 위치 | 장단 |
|---|---|---|
| ① 시드 필드 `aliasGroup`(그룹 키) + `aliases?: string[]`(검색어) | `SeedExercise`(`exercises.seed.ts:6-15`) → 로컬 `exercises` 컬럼 추가(v22) → 서버 컬럼 + proto 필드 | "이름별 별도 종목 + 그룹으로 함께 검색" 요구에 정확히 맞음. 스키마 3곳(로컬·PG·proto)+catalogSync 매핑+seedRunner 필드 |
| ② 도메인 정적 매핑 `ALIAS_GROUPS: Record<groupKey, nameKo[]>` | `core/domain/`(movementPatterns·FINDER_TREE 선례 — `movementPatterns.ts:2` "DB 컬럼 대신 도메인 정적 매핑") | 스키마 변경 0, 번들 데이터. nameKo-KEY 계약이 하나 더 늘어남(⊆시드 테스트 필수). 서버/커스텀과 공유 불가 |
| ③ 검색 전용 동의어 사전(`SEARCH_SYNONYMS: 검색어→nameKo[]`) | core/domain | "롱풀"처럼 엔트리를 안 만들 별칭에 적합. ①/②와 병행 가능 |
- 기구 교체(요구 5)용 "같은 동작의 기구별 엔트리" 매핑도 필요: `baseExerciseName` 문자열 규칙은 §A.2 불일치로 신뢰 불가 → 명시 필드(`movementKey`/`familyKey` + equipment) 또는 정적 매핑.

---

## H. 운영 DB 실측 (h2500-3 `liftgram-db-1`, 2026-10-26, READ ONLY)

### H.1 규모
- `exercises`: 336행, custom 0, archived 0. `_migrations`: 0000~0013 14건 적용.
- `sync_records` (행 / 삭제 / 사용자수): set_logs 3276/1762/4 · exercises 1015/12/4 · workout_exercises 942/501/4 · routine_exercises 173/41/2 · workouts 162/76/4 · routines 63/44/4 · user_profiles 24/1/5.
- `sync_records(exercises)`: 시드 id 999(활성)+12(삭제 — 전부 `seed-incline-barbell-press/dumbbell-press/chest-press-machine`, 즉 V8 consolidate 흔적), 커스텀 4.
- **옛 이름 18건**: sync payload name_ko ≠ 서버 name_ko — 예 `인클라인 프레스`→`(바벨)`, `해머 컬`→`(덤벨)`, `런지`→`(덤벨)`, `사이드 레터럴 레이즈`→`덤벨 레터럴 레이즈`, `리어 델트 플라이`→`덤벨 리어 델트 플라이`, `트레드밀 러닝`→`러닝머신`, `스텝밀`→`천국의 계단`, `디클라인 바벨/덤벨 프레스`→`디클라인 프레스 (바벨/덤벨)` 등(사용자 1명분으로 추정).
- `seed-rowing-machine`의 kind: sync 3건 cardio, 1건 NULL / 서버 카탈로그 NULL.
- image_url 채워진 종목 행 0.

### H.2 종목별 사용 빈도 (수행 세트 = 미삭제·done≠false, 상위 30)
| 종목 | 기구 | 세트 | 인스턴스 | 사용자 |
|---|---|---|---|---|
| 덤벨 레터럴 레이즈 | dumbbell | 82 | 25 | 2 |
| 체스트 프레스 머신 | machine | 70 | 17 | 1 |
| 랫 풀다운 | cable | 67 | 17 | 2 |
| 오버헤드 트라이셉스 익스텐션 | dumbbell | 55 | 18 | 1 |
| 로프 푸시다운 | cable | 52 | 15 | 2 |
| 인클라인 프레스 (바벨) | barbell | 48 | 14 | 1 |
| 프리처 컬 (바벨) | barbell | 48 | 14 | 2 |
| 해머 컬 (덤벨) | dumbbell | 44 | 14 | 2 |
| 레그 프레스 | machine | 41 | 10 | 2 |
| 바벨 로우 | barbell | 40 | 13 | 4 |
| 바벨 벤치프레스 | barbell | 40 | 10 | 1 |
| 덤벨 리어 델트 플라이 | dumbbell | 40 | 11 | 2 |
| 덤벨 컬 | dumbbell | 39 | 10 | 2 |
| 머신 로우 | machine | 38 | 10 | 2 |
| 하이 로우 | machine | 38 | 11 | 1 |
| 펙 덱 플라이 | machine | 36 | 12 | 1 |
| 트라이셉스 푸시다운 | cable | 36 | 13 | 2 |
| 덤벨 숄더 프레스 | dumbbell | 35 | 9 | 2 |
| 풀업 | bodyweight | 34 | 8 | 1 |
| 머신 레터럴 레이즈 | machine | 33 | 11 | 1 |
| 페이스 풀 | cable | 33 | 10 | 2 |
| 케이블 오버헤드 익스텐션 | cable | 31 | 8 | 2 |
| 레그 익스텐션 | machine | 30 | 8 | 2 |
| 프론트 레이즈 (덤벨) | dumbbell | 28 | 7 | 1 |
| 레그 컬 | machine | 28 | 7 | 1 |
| 바벨 스쿼트 | barbell | 25 | 6 | 2 |
| 친업 | bodyweight | 24 | 6 | 1 |
| 어시스트 풀업 | machine | 21 | 5 | 2 |
| 힙 어브덕션 머신 | machine | 20 | 5 | 1 |
| 케이블 컬 | cable | 19 | 5 | 2 |
- 사용된 종목은 약 70종(세트 ≥2). 나머지 ~266종은 운영 기록 0 → rename/삭제 위험은 상위 사용 종목에 집중.
- 리네임 시 영향 큰 것: `로프 푸시다운`(52)·`하이 로우`(38)·`레그 컬`(28)·`오버헤드 트라이셉스 익스텐션`(55).

### H.3 변형 분포
- `variant_key` (활성 workout_exercises 441): null 311 · `equip:newtech` 42 · `custom1` 22 · `hammer` 19 · `technogym` 11 · `dumbbell` 9 · `hoist` 9 · `cybex` 8 · `machine` 3 · `cable` 2 · `custom2` 2 · `barbell` 2 · `smith` 1. routine_exercises 132: null 106, custom1 7, hammer 5, newtech 5, technogym 4, machine 2, hoist/dumbbell/barbell 각 1. 변형 사용자 2명.
- 고유기구 키(V22 위반) **0건** — 불변식 유지 중. `variant_grip` 0건, `machine_variant`(레거시 미러) 156건 잔존.
- **크로스 기구(요구 5 이관 대상)** — 종목 기구 ≠ 변형 기구(implement):
  - `인클라인 프레스 (바벨)` + equip:dumbbell **9** → `인클라인 프레스 (덤벨)`
  - `오버헤드 트라이셉스 익스텐션`(덤벨) + equip:barbell 2 → (대응 엔트리 없음)
  - `덤벨 컬` + equip:cable 1 → `케이블 컬`
  - `케이블 리어 델트 플라이` + equip:machine 1 → `리버스 펙 덱`?
  - `프리처 컬 (바벨)` + equip:machine 1 → (없음)
  - `체스트 서포티드 티바 로우`(바벨) + equip:machine 1 → `체스트 서포티드 로우`(머신)?
  - `머신 레터럴 레이즈` + equip:cable 1 → `케이블 레터럴 레이즈`
  - `클로즈 그립 벤치프레스` + equip:smith 1 → (없음)
- **프리웨이트/케이블 종목에 브랜드 키**(사실상 "머신 버전"): `오버헤드 트라이셉스 익스텐션`+newtech 13(→ `트라이셉스 익스텐션 머신`), `딥스`+technogym 4·cybex 1(→ `딥 머신`/`어시스트 딥스`), `인클라인 프레스 (바벨)`+hammer 3·technogym 1(→ `인클라인 프레스 (머신)`), `시티드 케이블 로우`+technogym 4·custom1 1, `랫 풀다운`+cybex·hammer, `트라이셉스 푸시다운`+cybex, `로프 푸시다운`+custom1, `케이블 레터럴 레이즈`+custom1, `밀리터리 프레스`+custom2 2, `프리처 컬 (덤벨)`+cybex.
- 머신 종목의 브랜드(정상 사용): 체스트 프레스 머신(hammer 11·custom1 3·cybex 2·newtech 1), 머신 레터럴 레이즈(newtech 10), 펙 덱(newtech 9·hoist 2·cybex 1), 하이 로우(newtech 7·custom1 4), 체스트 서포티드 로우(hoist 5) 등.
- 세트 grip/arm (활성 set_logs 1514): 기본 1371 · arm uni 94 · neutral 27(+uni 3) · over 8 · under 8 · wide 3. → 그립은 소수 사용, 원암은 상대적으로 많음.
- 커스텀 종목 4(사용 0): `레그 프레스 (호이스트)`, `라잉 레그 컬 (호이스트)`, `프론트 스쿼트 (바벨)`, `바벨 스쿼트 (바벨)`.

---

## I. 위험·함정과 스펙 필수 제약

### I.1 데이터·동기
1. **서버 카탈로그 변경 = 새 마이그레이션 파일**(`0014_…`). `0002` 수정·재생성 금지(적용 완료 → skip). `gen-exercise-seed.mjs`를 core 경로·새 출력 파일로 고칠 것. 새 SQL도 `ON CONFLICT … IS DISTINCT FROM` 멱등 + 실제 바뀐 행만 updated_at(WatchCatalog 구독자 폭주 방지, `0002:6-7`).
2. **PG UNIQUE(name_ko/name_en)**: 별칭을 별도 행으로 만들면 이름 유일. rename 순서가 서로 맞물리면(A↔B 교환) 한 트랜잭션 안에서도 즉시 제약 위반 → 임시명 경유 또는 제약 DEFERRABLE 검토.
3. **삭제는 전파 경로가 없다**: 시드 제거·서버 archive만으로는 로컬·sync_records에 남는다. 삭제 대상은 ① 대체 종목 지정 ② 클라이언트 부팅 백필로 workout/routine_exercises `exercise_id` 재지정(V8 패턴, 멱등) ③ 원 종목 `is_archived=true`(soft-delete보다 안전 — find가 안 깨짐) ④ catalogSync에 "서버에서 사라진/archived 시드 id → 로컬 archive" 규칙 추가.
4. **웹 부팅 백필 진입점 신설 필수**(현재 0개). 이관 백필은 멱등·NULL 의미차 회피(전건 조회 후 JS 필터 — 기존 백필 관례)·`machine_variant` 미러 동시 정리(안 하면 V6가 옛 키를 되살림 — `workoutRepository.ts:233-237`).
5. **sync_records의 시드 행 역류**: 사용자 동기가 시드 종목 행(name_ko 포함)을 실어 나른다. rename 후 다른 기기의 옛 행이 pull되면 nameKo가 되돌아갈 수 있다(운영 18건 실재). 대책 후보: 시드 행(`is_custom=false`)은 동기에서 제외/무시하거나, pull 뒤 catalogSync(또는 syncSeedNames)를 반드시 재실행. 결정 필요.
6. **id·nameEn 불변**: 기존 시드 nameEn은 절대 변경 금지(id 슬러그 원천). 신규는 novel nameEn(슬러그 유일 테스트 선행). 과거 soft-delete된 id(`seed-incline-barbell-press` 등) 재사용 금지.
7. **nameKo rename 시 전파 grep 필수**(§F 전수) + SUBSTITUTES·FINDER_TREE·RAW_MEDIA·movementPatterns·conceptRoutines·백필 이름 목록(V10/V12)·테스트 하드코딩. 운영 사용 종목 rename은 사용자 혼란(이전 이름 검색) → 별칭으로 옛 이름 유지 권장.
8. **로컬 nameKo 유일 제약 없음** — 신규 시드명이 사용자 커스텀명과 충돌 가능. 추가 전 정책(커스텀 우선 표시/접미사) 결정.

### I.2 변형·기록 버킷
9. **버킷 불변식 유지**: 버킷 축은 기구 하나, 고유 기구=null. 요구 5로 "기구 교체 = 종목 교체"가 되면 implement 변형(`equip:barbell/dumbbell/cable/smith/kettlebell/band`, 그리고 프리웨이트 종목의 `equip:machine`)은 **신규 생성 금지**가 되고, 기존 행은 대응 종목으로 이관해야 한다(§H.3 목록 — 대응 엔트리가 없는 것부터 시드 추가). 이관 시 이전기록·PR이 새 종목 쪽으로 합쳐짐(기존 대응 종목 기록과 병합) — 의도 확인.
10. **브랜드 변형 키는 보존**: newtech·hammer·technogym 등은 운영 핵심 데이터. 브랜드명 종목(`해머스트렝스 체스트 프레스`) 삭제는 별개 — 그 종목은 사용 0이지만 테스트·FINDER·패턴·SUBSTITUTES 4곳 동시 정리 필요. 대체 = `체스트 프레스 머신` + `equip:hammer` 변형(이관 시 이 키로).
11. **프리웨이트 종목 + 브랜드 키**(오버헤드 트라이셉스 익스텐션+newtech 13 등)는 "사실상 머신 종목"이라 요구 5 모델에서 머신 엔트리로 옮기고 브랜드 키를 승계해야 기록이 이어진다.
12. **핀로드/플레이트로드(요구 6)**: 현 `equipment` 슬롯은 브랜드와 공유 1값 → 동시 표현 불가. "기록 분리"면 버킷 축 추가 = ADR-026 개정 + `canonicalVariantKey` 순서 확장 + 버킷 키 의미 변경 없음(추가 축은 기본 null이라 백필 불필요 — band 선례). VariantSelector·루틴 저장·`normalizeVariantDims` 함께.
13. **그립/부착물(요구 7)**: 현재 세트 속성·버킷 아님(ADR-026). 부착물을 기록 분리하려면 ADR-030(Draft) 재결정 필요. "이전 그립 기억"은 세트 프리필(:493-495)로 일부 존재 — 종목 단위 기억(세트가 없을 때 첫 세트에 적용)은 신규. `로프 푸시다운`·`리버스 그립 푸시다운`·`클로즈그립 풀다운`처럼 부착물·그립을 이름에 박은 종목과의 관계(별칭? 유지?) 결정 필요 — `로프 푸시다운`은 52세트 사용 중.
14. **승계 규칙 일관성**: 세션 시작·즉석 추가·교체 모두 "마지막 수행 변형 승계". 요구 5 교체도 `swapWorkoutExercise`를 쓰면 같은 규칙을 따름. 교체 시 이미 입력된 세트 무게는 그대로 남는다(새 종목 이전기록으로 프리필할지 결정).

### I.3 검색·표시
15. 검색 정규화(공백 제거·소문자·괄호 제거, 선택: 초성)는 **ExercisePicker·CatalogClient 공용 함수 1개**로 — 두 곳이 현재 복붙 규칙. LokiJS `Q.like` 한글 미작동 → JS 필터 유지.
16. 별칭 그룹 결과 표시: 그룹 매칭 시 같은 그룹 전 엔트리 노출 + 사용자가 고른 이름의 id로 추가. ExercisePicker LIMIT 40·name_ko 정렬로 잘림 → 관련도 정렬 필요.
17. `baseExerciseName` 축약이 서로 다른 종목을 같은 이름으로 보이게 함("컬"·"크런치"·"로우") — 요구 5로 종목=기구가 되면 세션 표시는 축약 대신 전체명이 맞을 수 있다(결정).
18. 이름 규칙 통일(괄호형 등)은 **rename**이므로 §I.1-7 비용 전부 발생. 표시명과 KEY를 분리(예: 안정 키 필드 도입)할지 결정 권장.

### I.4 미디어
19. 미디어 키도 nameKo — rename 시 RAW_MEDIA 키 갱신은 **생성 스크립트 재실행**으로(수기 금지). 스크립트를 app→core로 이전·경로 수정 선행. 덤프는 커밋 해시 핀.
20. 괄호 폴백이 다른 기구 사진을 보여줌(프리처 컬 (덤벨)=바벨 사진) — 요구 5로 기구별 종목이 정식이 되면 기구별 이미지 매칭 필요.
21. 신규 출처 도입 시 종목별 출처/라이선스 필드 + 크레딧 표시(현재 상수 1개). 제3자 GIF는 ADR-029 게이트.
22. 새 소비처(예: ExercisePicker 썸네일)는 `hasMediaImages()` 또는 `start` 빈 문자열 체크 필수.

### I.5 테스트·작업 순서
23. 데이터 추가 **전에** 테스트부터(슬러그·⊆시드·FINDER 완결성). 시드 추가와 FINDER_TREE 편입은 원자 커밋(`domain.test.ts:396`).
24. `catalogGap.test.ts:22-31`의 해머스트렝스 존재 강제는 삭제 결정과 함께 개정.
25. 배포 시 SemVer(기능=minor), app.json+appInfo.ts 2곳(메모리 규칙 — 웹 스택의 위치는 미확인).

### I.6 미확인
- 웹 프론트가 세션/루틴 화면 진입 시 로컬 카탈로그가 비어 있을 때의 채움 경로(sync pull vs catalogSync) 실제 순서 — 코드상 catalogSync 호출은 종목 탭·진단뿐, 나머지는 사용자 동기 pull로 채워지는 것으로 보임(실측 안 함).
- 스미스 RDL 추가 이력(메모리)과 현재 시드 부재의 경위.
- free-exercise-db 미매칭 96종 중 추가 매칭 가능 수.
- 웹 스택에서 SemVer 버전 표기 파일 위치.

---

## 부록 A. 시드 전수 표 (336종 · 줄=`exercises.seed.ts` 줄번호 · 미디어=폴백 반영)

| # | 줄 | nameKo | nameEn | 기구 | 주근육(보조) | kind | loadMode | 미디어 |
|---|---|---|---|---|---|---|---|---|
| 1 | 19 | 바벨 벤치프레스 | Barbell Bench Press | barbell | chest (triceps,shoulders) | - | - | 이미지 |
| 2 | 22 | 인클라인 프레스 (바벨) | Incline Press | barbell | chest (shoulders,triceps) | - | - | 이미지 |
| 3 | 23 | 인클라인 프레스 (덤벨) | Incline Press (Dumbbell) | dumbbell | chest (shoulders,triceps) | - | - | 이미지 |
| 4 | 24 | 인클라인 프레스 (머신) | Incline Press (Machine) | machine | chest (shoulders,triceps) | - | - | 이미지 |
| 5 | 25 | 인클라인 프레스 (스미스) | Incline Press (Smith) | smith | chest (shoulders,triceps) | - | - | 이미지 |
| 6 | 26 | 디클라인 프레스 (바벨) | Decline Barbell Press | barbell | chest (triceps) | - | - | 이미지 |
| 7 | 27 | 덤벨 벤치프레스 | Dumbbell Bench Press | dumbbell | chest (triceps,shoulders) | - | - | 이미지 |
| 8 | 28 | 디클라인 프레스 (덤벨) | Decline Dumbbell Press | dumbbell | chest (triceps) | - | - | 이미지 |
| 9 | 29 | 덤벨 플라이 | Dumbbell Fly | dumbbell | chest | - | - | 이미지 |
| 10 | 30 | 인클라인 덤벨 플라이 | Incline Dumbbell Fly | dumbbell | chest | - | - | 이미지 |
| 11 | 31 | 케이블 크로스오버 | Cable Crossover | cable | chest | - | - | 이미지 |
| 12 | 32 | 로우 케이블 플라이 | Low Cable Fly | cable | chest | - | - | 이미지 |
| 13 | 33 | 펙 덱 플라이 | Pec Deck Fly | machine | chest | - | - | 이미지 |
| 14 | 34 | 체스트 프레스 머신 | Chest Press Machine | machine | chest (triceps) | - | - | 이미지 |
| 15 | 35 | 스미스 벤치프레스 | Smith Machine Bench Press | smith | chest (triceps) | - | - | 이미지 |
| 16 | 36 | 딥스 | Dips | bodyweight | chest (triceps) | - | - | 이미지 |
| 17 | 37 | 푸시업 | Push Up | bodyweight | chest (triceps,shoulders) | - | - | 이미지 |
| 18 | 38 | 인클라인 푸시업 | Incline Push Up | bodyweight | chest (triceps) | - | - | 이미지 |
| 19 | 41 | 데드리프트 | Deadlift | barbell | back (glutes,hamstrings) | - | - | 이미지 |
| 20 | 42 | 스모 데드리프트 | Sumo Deadlift | barbell | back (glutes,quads) | - | - | 이미지 |
| 21 | 43 | 랙 풀 | Rack Pull | barbell | back (traps) | - | - | 이미지 |
| 22 | 44 | 바벨 로우 | Barbell Row | barbell | back (biceps) | - | - | 이미지 |
| 23 | 45 | 펜들레이 로우 | Pendlay Row | barbell | back (biceps) | - | - | 스텝만 |
| 24 | 46 | 티바 로우 | T-Bar Row | barbell | back (biceps) | - | - | 이미지 |
| 25 | 47 | 덤벨 로우 | Dumbbell Row | dumbbell | back (biceps) | - | - | 이미지 |
| 26 | 48 | 시티드 케이블 로우 | Seated Cable Row | cable | back (biceps) | - | - | 이미지 |
| 27 | 49 | 랫 풀다운 | Lat Pulldown | cable | back (biceps) | - | - | 이미지 |
| 28 | 50 | 클로즈그립 풀다운 | Close Grip Pulldown | cable | back (biceps) | - | - | 이미지 |
| 29 | 51 | 스트레이트암 풀다운 | Straight Arm Pulldown | cable | back | - | - | 이미지 |
| 30 | 52 | 풀업 | Pull Up | bodyweight | back (biceps) | - | - | 이미지 |
| 31 | 53 | 친업 | Chin Up | bodyweight | back (biceps) | - | - | 이미지 |
| 32 | 54 | 머신 로우 | Machine Row | machine | back (biceps) | - | - | 이미지 |
| 33 | 55 | 하이퍼익스텐션 | Hyperextension | bodyweight | back (glutes,hamstrings) | - | - | 이미지 |
| 34 | 56 | 굿모닝 | Good Morning | barbell | back (hamstrings,glutes) | - | - | 이미지 |
| 35 | 59 | 오버헤드 프레스 | Overhead Press | barbell | shoulders (triceps) | - | - | 이미지 |
| 36 | 60 | 밀리터리 프레스 | Military Press | barbell | shoulders (triceps) | - | - | 이미지 |
| 37 | 61 | 덤벨 숄더 프레스 | Dumbbell Shoulder Press | dumbbell | shoulders (triceps) | - | - | 이미지 |
| 38 | 62 | 아놀드 프레스 | Arnold Press | dumbbell | shoulders (triceps) | - | - | 이미지 |
| 39 | 63 | 숄더 프레스 머신 | Shoulder Press Machine | machine | shoulders (triceps) | - | - | 이미지 |
| 40 | 64 | 덤벨 레터럴 레이즈 | Side Lateral Raise | dumbbell | shoulders | - | - | 이미지 |
| 41 | 65 | 케이블 레터럴 레이즈 | Cable Lateral Raise | cable | shoulders | - | - | 이미지 |
| 42 | 66 | 머신 레터럴 레이즈 | Machine Lateral Raise | machine | shoulders | - | - | 스텝만 |
| 43 | 67 | 프론트 레이즈 (덤벨) | Front Raise | dumbbell | shoulders | - | - | 이미지 |
| 44 | 68 | 덤벨 리어 델트 플라이 | Rear Delt Fly | dumbbell | shoulders | - | - | 이미지 |
| 45 | 69 | 리버스 펙 덱 | Reverse Pec Deck | machine | shoulders | - | - | 이미지 |
| 46 | 70 | 페이스 풀 | Face Pull | cable | shoulders (traps) | - | - | 이미지 |
| 47 | 71 | 업라이트 로우 (바벨) | Upright Row | barbell | shoulders (traps) | - | - | 이미지 |
| 48 | 74 | 바벨 컬 | Barbell Curl | barbell | biceps | - | - | 이미지 |
| 49 | 75 | 이지바 컬 | EZ-Bar Curl | barbell | biceps | - | - | 이미지 |
| 50 | 76 | 덤벨 컬 | Dumbbell Curl | dumbbell | biceps | - | - | 이미지 |
| 51 | 77 | 해머 컬 (덤벨) | Hammer Curl | dumbbell | biceps (forearms) | - | - | 이미지 |
| 52 | 78 | 인클라인 덤벨 컬 | Incline Dumbbell Curl | dumbbell | biceps | - | - | 이미지 |
| 53 | 79 | 프리처 컬 (바벨) | Preacher Curl | barbell | biceps | - | - | 이미지 |
| 54 | 80 | 컨센트레이션 컬 | Concentration Curl | dumbbell | biceps | - | - | 이미지 |
| 55 | 81 | 케이블 컬 | Cable Curl | cable | biceps | - | - | 이미지 |
| 56 | 82 | 스파이더 컬 | Spider Curl | dumbbell | biceps | - | - | 이미지 |
| 57 | 83 | 머신 컬 | Machine Curl | machine | biceps | - | - | 이미지 |
| 58 | 86 | 클로즈 그립 벤치프레스 | Close Grip Bench Press | barbell | triceps (chest) | - | - | 이미지 |
| 59 | 87 | 트라이셉스 푸시다운 | Triceps Pushdown | cable | triceps | - | - | 이미지 |
| 60 | 88 | 로프 푸시다운 | Rope Pushdown | cable | triceps | - | - | 이미지 |
| 61 | 89 | 오버헤드 트라이셉스 익스텐션 | Overhead Triceps Extension | dumbbell | triceps | - | - | 이미지 |
| 62 | 90 | 케이블 오버헤드 익스텐션 | Cable Overhead Extension | cable | triceps | - | - | 이미지 |
| 63 | 91 | 스컬 크러셔 (바벨) | Skull Crusher | barbell | triceps | - | - | 이미지 |
| 64 | 92 | 트라이셉스 킥백 (덤벨) | Triceps Kickback | dumbbell | triceps | - | - | 이미지 |
| 65 | 93 | 벤치 딥스 | Bench Dip | bodyweight | triceps | - | - | 이미지 |
| 66 | 94 | 다이아몬드 푸시업 | Diamond Push Up | bodyweight | triceps (chest) | - | - | 이미지 |
| 67 | 97 | 리스트 컬 (바벨) | Wrist Curl | barbell | forearms | - | - | 이미지 |
| 68 | 98 | 리버스 리스트 컬 | Reverse Wrist Curl | barbell | forearms | - | - | 이미지 |
| 69 | 99 | 리버스 바벨 컬 | Reverse Barbell Curl | barbell | forearms (biceps) | - | - | 이미지 |
| 70 | 100 | 파머스 워크 | None | dumbbell | forearms (traps) | - | - | 이미지 |
| 71 | 103 | 바벨 스쿼트 | Barbell Squat | barbell | quads (glutes,hamstrings) | - | - | 이미지 |
| 72 | 104 | 프론트 스쿼트 | Front Squat | barbell | quads (glutes) | - | - | 이미지 |
| 73 | 105 | 하이바 스쿼트 | High Bar Squat | barbell | quads (glutes) | - | - | 이미지 |
| 74 | 106 | 핵 스쿼트 | Hack Squat | machine | quads (glutes) | - | - | 이미지 |
| 75 | 107 | 레그 프레스 | Leg Press | machine | quads (glutes) | - | - | 이미지 |
| 76 | 108 | 레그 익스텐션 | Leg Extension | machine | quads | - | - | 이미지 |
| 77 | 109 | 고블릿 스쿼트 | Goblet Squat | dumbbell | quads (glutes) | - | - | 이미지 |
| 78 | 110 | 런지 (덤벨) | Lunge | dumbbell | quads (glutes) | - | - | 이미지 |
| 79 | 111 | 워킹 런지 | Walking Lunge | dumbbell | quads (glutes) | - | - | 이미지 |
| 80 | 112 | 불가리안 스플릿 스쿼트 (덤벨) | Bulgarian Split Squat | dumbbell | quads (glutes) | - | - | 이미지 |
| 81 | 113 | 스미스 스쿼트 | Smith Machine Squat | smith | quads (glutes) | - | - | 이미지 |
| 82 | 114 | 스텝업 | Step Up | dumbbell | quads (glutes) | - | - | 이미지 |
| 83 | 117 | 루마니안 데드리프트 (바벨) | Romanian Deadlift | barbell | hamstrings (glutes,back) | - | - | 이미지 |
| 84 | 118 | 스티프 레그 데드리프트 | Stiff Leg Deadlift | barbell | hamstrings (glutes) | - | - | 이미지 |
| 85 | 119 | 라잉 레그 컬 | Lying Leg Curl | machine | hamstrings | - | - | 이미지 |
| 86 | 120 | 시티드 레그 컬 | Seated Leg Curl | machine | hamstrings | - | - | 이미지 |
| 87 | 121 | 레그 컬 | Leg Curl | machine | hamstrings | - | - | 이미지 |
| 88 | 122 | 노르딕 컬 | Nordic Curl | bodyweight | hamstrings | - | - | 스텝만 |
| 89 | 125 | 힙 쓰러스트 (바벨) | Hip Thrust | barbell | glutes (hamstrings) | - | - | 이미지 |
| 90 | 126 | 글루트 브릿지 | Glute Bridge | barbell | glutes (hamstrings) | - | - | 이미지 |
| 91 | 127 | 케이블 킥백 | Cable Kickback | cable | glutes | - | - | 이미지 |
| 92 | 128 | 힙 어브덕션 머신 | Hip Abduction Machine | machine | glutes | - | - | 이미지 |
| 93 | 129 | 케틀벨 스윙 | Kettlebell Swing | kettlebell | glutes (hamstrings,back) | - | - | 이미지 |
| 94 | 132 | 스탠딩 카프 레이즈 | Standing Calf Raise | machine | calves | - | - | 이미지 |
| 95 | 133 | 시티드 카프 레이즈 | Seated Calf Raise | machine | calves | - | - | 이미지 |
| 96 | 134 | 레그 프레스 카프 레이즈 | Leg Press Calf Raise | machine | calves | - | - | 이미지 |
| 97 | 135 | 덤벨 카프 레이즈 | Dumbbell Calf Raise | dumbbell | calves | - | - | 이미지 |
| 98 | 138 | 플랭크 | Plank | bodyweight | abs | - | - | 이미지 |
| 99 | 139 | 사이드 플랭크 | Side Plank | bodyweight | abs | - | - | 이미지 |
| 100 | 140 | 크런치 | Crunch | bodyweight | abs | - | - | 이미지 |
| 101 | 141 | 바이시클 크런치 | Bicycle Crunch | bodyweight | abs | - | - | 이미지 |
| 102 | 142 | 행잉 레그 레이즈 | Hanging Leg Raise | bodyweight | abs | - | - | 이미지 |
| 103 | 143 | 리버스 크런치 | Reverse Crunch | bodyweight | abs | - | - | 이미지 |
| 104 | 144 | 케이블 크런치 | Cable Crunch | cable | abs | - | - | 이미지 |
| 105 | 145 | 러시안 트위스트 | Russian Twist | bodyweight | abs | - | - | 이미지 |
| 106 | 146 | 앱 휠 롤아웃 | Ab Wheel Rollout | other | abs | - | - | 이미지 |
| 107 | 147 | 디클라인 싯업 | Decline Sit Up | bodyweight | abs | - | - | 이미지 |
| 108 | 148 | 마운틴 클라이머 | Mountain Climber | bodyweight | abs (fullBody) | - | - | 이미지 |
| 109 | 151 | 바벨 슈러그 | Barbell Shrug | barbell | traps | - | - | 이미지 |
| 110 | 152 | 덤벨 슈러그 | Dumbbell Shrug | dumbbell | traps | - | - | 이미지 |
| 111 | 155 | 바벨 클린 | Power Clean | barbell | fullBody (back,quads) | - | - | 이미지 |
| 112 | 156 | 클린 앤 저크 | Clean and Jerk | barbell | fullBody (shoulders,quads) | - | - | 이미지 |
| 113 | 157 | 스내치 | Snatch | barbell | fullBody (shoulders,back) | - | - | 이미지 |
| 114 | 158 | 쓰러스터 | Thruster | barbell | fullBody (quads,shoulders) | - | - | 스텝만 |
| 115 | 159 | 버피 | Burpee | bodyweight | fullBody | - | - | 스텝만 |
| 116 | 160 | 배틀 로프 | Battle Rope | other | fullBody (shoulders) | - | - | 이미지 |
| 117 | 161 | 로잉 머신 | Rowing Machine | machine | fullBody (back) | - | - | 이미지 |
| 118 | 164 | 어시스트 풀업 | Assisted Pull Up | machine | back (biceps) | - | assisted | 이미지 |
| 119 | 165 | 어시스트 친업 | Assisted Chin Up | machine | biceps (back) | - | assisted | 이미지 |
| 120 | 166 | 어시스트 딥스 | Assisted Dip | machine | triceps (chest) | - | assisted | 이미지 |
| 121 | 169 | 하이 로우 | High Row | machine | back (biceps) | - | - | 이미지 |
| 122 | 170 | 로우 로우 | Low Row | machine | back (biceps) | - | - | 이미지 |
| 123 | 171 | 체스트 서포티드 로우 | Chest Supported Row | machine | back (biceps) | - | - | 이미지 |
| 124 | 172 | 인버티드 로우 | Inverted Row | bodyweight | back (biceps) | - | - | 이미지 |
| 125 | 173 | 원암 랫풀다운 | Single-arm Lat Pulldown | cable | back (biceps) | - | - | 이미지 |
| 126 | 174 | 덤벨 풀오버 | Dumbbell Pullover | dumbbell | back (chest) | - | - | 이미지 |
| 127 | 178 | 랜드마인 프레스 | Landmine Press | barbell | shoulders (chest,triceps) | - | - | 이미지 |
| 128 | 179 | 케이블 리어 델트 플라이 | Cable Rear Delt Fly | cable | shoulders | - | - | 이미지 |
| 129 | 181 | 시시 스쿼트 | Sissy Squat | bodyweight | quads | - | - | 이미지 |
| 130 | 182 | 펜듈럼 스쿼트 | Pendulum Squat | machine | quads (glutes) | - | - | 스텝만 |
| 131 | 183 | 벨트 스쿼트 | Belt Squat | machine | quads (glutes) | - | - | 스텝만 |
| 132 | 184 | 힙 어덕션 머신 | Hip Adduction Machine | machine | glutes | - | - | 이미지 |
| 133 | 185 | 스미스 힙 쓰러스트 | Smith Hip Thrust | smith | glutes (hamstrings) | - | - | 이미지 |
| 134 | 187 | JM 프레스 | JM Press | barbell | triceps | - | - | 이미지 |
| 135 | 188 | 딥 머신 | Dip Machine | machine | triceps (chest) | - | - | 이미지 |
| 136 | 189 | 케이블 해머 컬 | Cable Hammer Curl | cable | biceps (forearms) | - | - | 이미지 |
| 137 | 191 | 라잉 레그 레이즈 | Lying Leg Raise | bodyweight | abs | - | - | 이미지 |
| 138 | 192 | 케이블 우드촙 | Cable Woodchopper | cable | abs | - | - | 이미지 |
| 139 | 193 | 앱 크런치 머신 | Ab Crunch Machine | machine | abs | - | - | 이미지 |
| 140 | 195 | 케이블 슈러그 | Cable Shrug | cable | traps | - | - | 이미지 |
| 141 | 200 | 러닝머신 | Treadmill Running | machine | fullBody (quads,calves) | cardio | - | 없음 |
| 142 | 201 | 러닝 | Running | bodyweight | fullBody (quads,calves) | cardio | - | 없음 |
| 143 | 202 | 걷기 | Walking | bodyweight | fullBody (calves) | cardio | - | 없음 |
| 144 | 203 | 실내 사이클 | Indoor Cycling | machine | quads (calves) | cardio | - | 없음 |
| 145 | 204 | 일립티컬 | Elliptical | machine | fullBody (quads) | cardio | - | 없음 |
| 146 | 205 | 천국의 계단 | Stair Climber | machine | quads (glutes,calves) | cardio | - | 없음 |
| 147 | 206 | 줄넘기 | Jump Rope | other | calves (fullBody) | cardio | - | 없음 |
| 148 | 207 | 어썰트 바이크 | Assault Bike | machine | fullBody (quads) | cardio | - | 없음 |
| 149 | 208 | 스텝퍼 | Stepper | machine | quads (glutes,calves) | cardio | - | 없음 |
| 150 | 209 | 스키에르그 | SkiErg | machine | back (triceps,fullBody) | cardio | - | 없음 |
| 151 | 211 | 로우 (스미스) | Row (Smith) | smith | back (biceps) | - | - | 스텝만 |
| 152 | 212 | 숄더 프레스 (스미스) | Shoulder Press (Smith) | smith | shoulders (triceps) | - | - | 스텝만 |
| 153 | 213 | 프론트 레이즈 (케이블) | Front Raise (Cable) | cable | shoulders | - | - | 이미지 |
| 154 | 214 | 프론트 레이즈 (바벨) | Front Raise (Barbell) | barbell | shoulders | - | - | 이미지 |
| 155 | 215 | 업라이트 로우 (케이블) | Upright Row (Cable) | cable | shoulders (traps) | - | - | 이미지 |
| 156 | 216 | 업라이트 로우 (덤벨) | Upright Row (Dumbbell) | dumbbell | shoulders (traps) | - | - | 이미지 |
| 157 | 217 | 프리처 컬 (덤벨) | Preacher Curl (Dumbbell) | dumbbell | biceps | - | - | 이미지 |
| 158 | 218 | 스컬 크러셔 (덤벨) | Skull Crusher (Dumbbell) | dumbbell | triceps | - | - | 이미지 |
| 159 | 219 | 트라이셉스 킥백 (케이블) | Triceps Kickback (Cable) | cable | triceps | - | - | 이미지 |
| 160 | 220 | 리스트 컬 (덤벨) | Wrist Curl (Dumbbell) | dumbbell | forearms | - | - | 이미지 |
| 161 | 221 | 런지 (바벨) | Lunge (Barbell) | barbell | quads (glutes) | - | - | 이미지 |
| 162 | 222 | 런지 (스미스) | Lunge (Smith) | smith | quads (glutes) | - | - | 이미지 |
| 163 | 223 | 불가리안 스플릿 스쿼트 (바벨) | Bulgarian Split Squat (Barbell) | barbell | quads (glutes) | - | - | 이미지 |
| 164 | 224 | 불가리안 스플릿 스쿼트 (스미스) | Bulgarian Split Squat (Smith) | smith | quads (glutes) | - | - | 이미지 |
| 165 | 225 | 루마니안 데드리프트 (덤벨) | Romanian Deadlift (Dumbbell) | dumbbell | hamstrings (glutes,back) | - | - | 이미지 |
| 166 | 226 | 힙 쓰러스트 (머신) | Hip Thrust (Machine) | machine | glutes (hamstrings) | - | - | 이미지 |
| 167 | 227 | 슈러그 (스미스) | Shrug (Smith) | smith | traps | - | - | 스텝만 |
| 168 | 233 | 해머스트렝스 체스트 프레스 | Hammer Strength Chest Press | machine | chest (triceps) | - | - | 스텝만 |
| 169 | 234 | 디클라인 체스트 프레스 머신 | Decline Chest Press Machine | machine | chest (triceps) | - | - | 스텝만 |
| 170 | 235 | 라잉 체스트 프레스 머신 | Lying Chest Press Machine | machine | chest (triceps) | - | - | 스텝만 |
| 171 | 236 | 컨버징 체스트 프레스 머신 | Converging Chest Press Machine | machine | chest (triceps) | - | - | 스텝만 |
| 172 | 237 | 원암 체스트 프레스 머신 | Single-arm Chest Press Machine | machine | chest (triceps) | - | - | 스텝만 |
| 173 | 238 | 시티드 케이블 체스트 프레스 | Seated Cable Chest Press | cable | chest (triceps) | - | - | 스텝만 |
| 174 | 239 | 스탠딩 케이블 체스트 프레스 | Standing Cable Chest Press | cable | chest (triceps) | - | - | 이미지 |
| 175 | 240 | 라잉 케이블 체스트 프레스 | Lying Cable Chest Press | cable | chest (triceps) | - | - | 스텝만 |
| 176 | 241 | 라슨 프레스 | Larsen Press | barbell | chest (triceps) | - | - | 스텝만 |
| 177 | 242 | 피트 업 벤치프레스 | Feet-up Bench Press | barbell | chest (triceps) | - | - | 스텝만 |
| 178 | 243 | 디클라인 프레스 (스미스) | Decline Press (Smith) | smith | chest (triceps) | - | - | 스텝만 |
| 179 | 244 | 와이드 그립 푸시업 | Wide Grip Push Up | bodyweight | chest (shoulders) | - | - | 스텝만 |
| 180 | 245 | 데피싯 푸시업 | Deficit Push Up | bodyweight | chest (triceps) | - | - | 스텝만 |
| 181 | 246 | 체스트 서포티드 티바 로우 | Chest Supported T-Bar Row | barbell | back (biceps) | - | - | 스텝만 |
| 182 | 247 | 체스트 서포티드 로우 (덤벨) | Chest Supported Row (Dumbbell) | dumbbell | back (biceps) | - | - | 이미지 |
| 183 | 248 | 싯업 | Sit Up | bodyweight | abs | - | - | 이미지 |
| 184 | 255 | 디클라인 푸시업 | Decline Push Up | bodyweight | chest (shoulders,triceps) | - | - | 이미지 |
| 185 | 256 | 클랩 푸시업 | Clap Push Up | bodyweight | chest (triceps) | - | - | 스텝만 |
| 186 | 257 | 닐링 푸시업 | Kneeling Push Up | bodyweight | chest (triceps) | - | - | 스텝만 |
| 187 | 258 | 원암 푸시업 | One Arm Push Up | bodyweight | chest (triceps,abs) | - | - | 이미지 |
| 188 | 259 | 플랭크 푸시업 | Plank Push Up | bodyweight | chest (abs) | - | - | 스텝만 |
| 189 | 260 | 링 푸시업 | Ring Push Up | other | chest (triceps,abs) | - | - | 스텝만 |
| 190 | 261 | 플로어 프레스 | Floor Press | barbell | chest (triceps) | - | - | 이미지 |
| 191 | 262 | 덤벨 스퀴즈 프레스 | Dumbbell Squeeze Press | dumbbell | chest (triceps) | - | - | 스텝만 |
| 192 | 263 | 스벤드 프레스 | Svend Press | other | chest | - | - | 이미지 |
| 193 | 264 | 디클라인 덤벨 플라이 | Decline Dumbbell Fly | dumbbell | chest | - | - | 이미지 |
| 194 | 265 | 시티드 케이블 플라이 | Seated Cable Fly | cable | chest | - | - | 스텝만 |
| 195 | 266 | 덤벨 어라운드 더 월드 | Dumbbell Around the World | dumbbell | chest (shoulders) | - | - | 이미지 |
| 196 | 267 | 링 딥스 | Ring Dip | other | chest (triceps) | - | - | 이미지 |
| 197 | 269 | 랜드마인 로우 | Landmine Row | barbell | back (biceps) | - | - | 스텝만 |
| 198 | 270 | 메도우스 로우 | Meadows Row | barbell | back (biceps) | - | - | 스텝만 |
| 199 | 271 | 씰 로우 | Seal Row | barbell | back (biceps) | - | - | 스텝만 |
| 200 | 272 | 고릴라 로우 | Gorilla Row | kettlebell | back (biceps) | - | - | 스텝만 |
| 201 | 273 | 레니게이드 로우 | Renegade Row | dumbbell | back (abs,biceps) | - | - | 이미지 |
| 202 | 274 | 풀오버 머신 | Machine Pullover | machine | back (chest) | - | - | 스텝만 |
| 203 | 275 | 네거티브 풀업 | Negative Pull Up | bodyweight | back (biceps) | - | - | 스텝만 |
| 204 | 276 | 스캐퓰러 풀업 | Scapular Pull Up | bodyweight | back (traps) | - | - | 이미지 |
| 205 | 277 | 키핑 풀업 | Kipping Pull Up | bodyweight | back (biceps,fullBody) | - | - | 스텝만 |
| 206 | 278 | 스터넘 풀업 | Sternum Pull Up | bodyweight | back (biceps) | - | - | 이미지 |
| 207 | 279 | 머슬업 | Muscle Up | bodyweight | back (fullBody) | - | - | 이미지 |
| 208 | 280 | 링 풀업 | Ring Pull Up | other | back (biceps) | - | - | 스텝만 |
| 209 | 281 | 데드 행 | Dead Hang | bodyweight | back (forearms) | - | - | 스텝만 |
| 210 | 282 | 백 익스텐션 머신 | Back Extension Machine | machine | back (glutes) | - | - | 스텝만 |
| 211 | 283 | 슈퍼맨 | Superman | bodyweight | back (glutes) | - | - | 이미지 |
| 212 | 285 | 파이크 푸시업 | Pike Push Up | bodyweight | shoulders (triceps) | - | - | 스텝만 |
| 213 | 286 | 핸드스탠드 푸시업 | Handstand Push Up | bodyweight | shoulders (triceps) | - | - | 이미지 |
| 214 | 287 | 핸드스탠드 홀드 | Handstand Hold | bodyweight | shoulders (abs) | - | - | 스텝만 |
| 215 | 288 | 푸시 프레스 | Push Press | barbell | shoulders (triceps,quads) | - | - | 이미지 |
| 216 | 289 | 밴드 풀 어파트 | Band Pull Apart | band | shoulders (traps) | - | - | 이미지 |
| 217 | 290 | 케이블 Y 레이즈 | Cable Y Raise | cable | shoulders | - | - | 스텝만 |
| 218 | 291 | 체스트 서포티드 Y 레이즈 | Chest Supported Y Raise | dumbbell | shoulders | - | - | 스텝만 |
| 219 | 292 | 프론트 레이즈 (플레이트) | Plate Front Raise | other | shoulders | - | - | 이미지 |
| 220 | 293 | 오버헤드 플레이트 레이즈 | Overhead Plate Raise | other | shoulders | - | - | 스텝만 |
| 221 | 294 | 숄더 탭 | Shoulder Taps | bodyweight | abs (shoulders) | - | - | 스텝만 |
| 222 | 295 | 케틀벨 헤일로 | Kettlebell Halo | kettlebell | shoulders (abs) | - | - | 스텝만 |
| 223 | 297 | 드래그 컬 | Drag Curl | barbell | biceps | - | - | 이미지 |
| 224 | 298 | 조트맨 컬 | Zottman Curl | dumbbell | biceps (forearms) | - | - | 이미지 |
| 225 | 299 | 크로스 바디 해머 컬 | Cross Body Hammer Curl | dumbbell | biceps (forearms) | - | - | 이미지 |
| 226 | 300 | 웨이터 컬 | Waiter Curl | dumbbell | biceps | - | - | 스텝만 |
| 227 | 301 | 21 컬 | Bicep Curl 21s | barbell | biceps | - | - | 스텝만 |
| 228 | 302 | 오버헤드 케이블 컬 | Overhead Cable Curl | cable | biceps | - | - | 이미지 |
| 229 | 303 | 비하인드 백 케이블 컬 | Behind the Back Cable Curl | cable | biceps | - | - | 스텝만 |
| 230 | 304 | 플레이트 컬 | Plate Curl | other | biceps (forearms) | - | - | 스텝만 |
| 231 | 306 | 리버스 그립 푸시다운 | Reverse Grip Pushdown | cable | triceps | - | - | 이미지 |
| 232 | 307 | 트라이셉스 익스텐션 머신 | Triceps Extension Machine | machine | triceps | - | - | 이미지 |
| 233 | 308 | 와이드 엘보 트라이셉스 프레스 | Wide-Elbow Triceps Press | dumbbell | triceps | - | - | 스텝만 |
| 234 | 309 | 리스트 롤러 | Wrist Roller | other | forearms | - | - | 이미지 |
| 235 | 310 | 비하인드 백 리스트 컬 | Behind the Back Wrist Curl | barbell | forearms | - | - | 이미지 |
| 236 | 311 | 리버스 컬 (덤벨) | Reverse Curl (Dumbbell) | dumbbell | forearms (biceps) | - | - | 이미지 |
| 237 | 312 | 리버스 컬 (케이블) | Reverse Curl (Cable) | cable | forearms (biceps) | - | - | 이미지 |
| 238 | 313 | 슈러그 (머신) | Shrug (Machine) | machine | traps | - | - | 이미지 |
| 239 | 314 | 점프 슈러그 | Jump Shrug | barbell | traps (fullBody) | - | - | 스텝만 |
| 240 | 315 | 라잉 넥 컬 | Lying Neck Curl | bodyweight | other | - | - | 스텝만 |
| 241 | 316 | 라잉 넥 익스텐션 | Lying Neck Extension | bodyweight | other | - | - | 스텝만 |
| 242 | 318 | 박스 스쿼트 | Box Squat | barbell | quads (glutes) | - | - | 이미지 |
| 243 | 319 | 포즈 스쿼트 | Pause Squat | barbell | quads (glutes) | - | - | 스텝만 |
| 244 | 320 | 오버헤드 스쿼트 | Overhead Squat | barbell | quads (fullBody) | - | - | 이미지 |
| 245 | 321 | 저처 스쿼트 | Zercher Squat | barbell | quads (glutes,abs) | - | - | 이미지 |
| 246 | 322 | 스모 스쿼트 | Sumo Squat | dumbbell | quads (glutes) | - | - | 이미지 |
| 247 | 323 | 피스톨 스쿼트 | Pistol Squat | bodyweight | quads (glutes) | - | - | 스텝만 |
| 248 | 324 | 월 싯 | Wall Sit | bodyweight | quads | - | - | 스텝만 |
| 249 | 325 | 점프 스쿼트 | Jump Squat | bodyweight | quads (glutes) | - | - | 이미지 |
| 250 | 326 | 박스 점프 | Box Jump | bodyweight | quads (glutes) | - | - | 이미지 |
| 251 | 327 | 레터럴 박스 점프 | Lateral Box Jump | bodyweight | quads (glutes) | - | - | 이미지 |
| 252 | 328 | 프로그 점프 | Frog Jump | bodyweight | quads (glutes) | - | - | 이미지 |
| 253 | 329 | 레터럴 스쿼트 | Lateral Squat | bodyweight | quads (glutes) | - | - | 스텝만 |
| 254 | 330 | 리버스 런지 | Reverse Lunge | bodyweight | quads (glutes) | - | - | 스텝만 |
| 255 | 331 | 레터럴 런지 | Lateral Lunge | bodyweight | quads (glutes) | - | - | 스텝만 |
| 256 | 332 | 커시 런지 | Curtsy Lunge | bodyweight | quads (glutes) | - | - | 이미지 |
| 257 | 333 | 점프 런지 | Jump Lunge | bodyweight | quads (glutes) | - | - | 스텝만 |
| 258 | 334 | 오버헤드 런지 | Overhead Lunge | dumbbell | quads (glutes,shoulders) | - | - | 스텝만 |
| 259 | 335 | 스플릿 스쿼트 | Split Squat | dumbbell | quads (glutes) | - | - | 스텝만 |
| 260 | 337 | 글루트 햄 레이즈 | Glute Ham Raise | machine | hamstrings (glutes) | - | - | 이미지 |
| 261 | 338 | 스탠딩 레그 컬 | Standing Leg Curl | machine | hamstrings | - | - | 이미지 |
| 262 | 339 | 케이블 풀 스루 | Cable Pull Through | cable | glutes (hamstrings) | - | - | 이미지 |
| 263 | 340 | 리버스 하이퍼익스텐션 | Reverse Hyperextension | machine | glutes (hamstrings,back) | - | - | 이미지 |
| 264 | 341 | 데드리프트 하이 풀 | Deadlift High Pull | barbell | fullBody (back,traps) | - | - | 스텝만 |
| 265 | 342 | 힙 쓰러스트 (덤벨) | Hip Thrust (Dumbbell) | dumbbell | glutes (hamstrings) | - | - | 이미지 |
| 266 | 343 | 파이어 하이드런트 | Fire Hydrant | bodyweight | glutes | - | - | 스텝만 |
| 267 | 344 | 클램셸 | Clamshell | bodyweight | glutes | - | - | 스텝만 |
| 268 | 345 | 프로그 펌프 | Frog Pump | dumbbell | glutes (hamstrings) | - | - | 스텝만 |
| 269 | 346 | 버드 독 | Bird Dog | bodyweight | glutes (abs,back) | - | - | 스텝만 |
| 270 | 347 | 글루트 킥백 머신 | Glute Kickback Machine | machine | glutes | - | - | 스텝만 |
| 271 | 348 | 글루트 킥백 | Glute Kickback | bodyweight | glutes | - | - | 이미지 |
| 272 | 349 | 케이블 힙 어브덕션 | Cable Hip Abduction | cable | glutes | - | - | 스텝만 |
| 273 | 350 | 케이블 힙 어덕션 | Cable Hip Adduction | cable | glutes | - | - | 이미지 |
| 274 | 351 | 레터럴 레그 레이즈 | Lateral Leg Raise | bodyweight | glutes | - | - | 스텝만 |
| 275 | 352 | 레터럴 밴드 워크 | Lateral Band Walk | band | glutes | - | - | 스텝만 |
| 276 | 354 | 데드 버그 | Dead Bug | bodyweight | abs | - | - | 이미지 |
| 277 | 355 | V 싯업 | V Sit Up | bodyweight | abs | - | - | 이미지 |
| 278 | 356 | 할로우 락 | Hollow Rock | bodyweight | abs | - | - | 스텝만 |
| 279 | 357 | 플러터 킥 | Flutter Kick | bodyweight | abs | - | - | 이미지 |
| 280 | 358 | 시저 킥 | Scissor Kick | bodyweight | abs | - | - | 이미지 |
| 281 | 359 | 토 터치 | Toe Touch | bodyweight | abs | - | - | 이미지 |
| 282 | 360 | 힐 터치 | Heel Tap | bodyweight | abs | - | - | 이미지 |
| 283 | 361 | 사이드 크런치 | Side Crunch | bodyweight | abs | - | - | 이미지 |
| 284 | 362 | 사이드 벤드 | Side Bend | dumbbell | abs | - | - | 이미지 |
| 285 | 363 | 디클라인 크런치 | Decline Crunch | bodyweight | abs | - | - | 이미지 |
| 286 | 364 | 라잉 니 레이즈 | Lying Knee Raise | bodyweight | abs | - | - | 스텝만 |
| 287 | 365 | 행잉 니 레이즈 | Hanging Knee Raise | bodyweight | abs | - | - | 스텝만 |
| 288 | 366 | 패러럴 바 니 레이즈 | Parallel Bar Knee Raise | other | abs | - | - | 이미지 |
| 289 | 367 | 패러럴 바 레그 레이즈 | Parallel Bar Leg Raise | other | abs | - | - | 스텝만 |
| 290 | 368 | 드래곤 플래그 | Dragon Flag | bodyweight | abs (fullBody) | - | - | 스텝만 |
| 291 | 369 | 리버스 플랭크 | Reverse Plank | bodyweight | abs (glutes,back) | - | - | 스텝만 |
| 292 | 370 | 엘보 투 니 | Elbow to Knee | bodyweight | abs | - | - | 이미지 |
| 293 | 371 | 스파이더맨 플랭크 | Spiderman Plank | bodyweight | abs | - | - | 스텝만 |
| 294 | 372 | 팔로프 프레스 | Pallof Press | cable | abs | - | - | 이미지 |
| 295 | 373 | 랜드마인 180 | Landmine 180 | barbell | abs (shoulders) | - | - | 이미지 |
| 296 | 374 | 토즈 투 바 | Toes to Bar | bodyweight | abs (forearms) | - | - | 스텝만 |
| 297 | 375 | L-싯 홀드 | L-Sit Hold | bodyweight | abs (triceps) | - | - | 스텝만 |
| 298 | 376 | 토르소 로테이션 머신 | Torso Rotation Machine | machine | abs | - | - | 스텝만 |
| 299 | 379 | 행 클린 | Hang Clean | barbell | fullBody (back,quads) | - | - | 이미지 |
| 300 | 380 | 클린 앤 프레스 | Clean and Press | barbell | fullBody (shoulders,quads) | - | - | 이미지 |
| 301 | 381 | 클린 풀 | Clean Pull | barbell | fullBody (back,traps) | - | - | 이미지 |
| 302 | 382 | 파워 스내치 | Power Snatch | barbell | fullBody (shoulders,back) | - | - | 이미지 |
| 303 | 383 | 행 스내치 | Hang Snatch | barbell | fullBody (shoulders,back) | - | - | 이미지 |
| 304 | 384 | 스플릿 저크 | Split Jerk | barbell | fullBody (shoulders,quads) | - | - | 이미지 |
| 305 | 385 | 프레스 언더 | Press Under | barbell | fullBody (shoulders) | - | - | 스텝만 |
| 306 | 386 | 랜드마인 스쿼트 앤 프레스 | Landmine Squat to Press | barbell | fullBody (quads,shoulders) | - | - | 스텝만 |
| 307 | 387 | 케틀벨 하이 풀 | Kettlebell High Pull | kettlebell | fullBody (traps,shoulders) | - | - | 이미지 |
| 308 | 388 | 터키시 겟업 | Turkish Get Up | kettlebell | fullBody (abs,shoulders) | - | - | 이미지 |
| 309 | 389 | 케틀벨 어라운드 더 월드 | Kettlebell Around the World | kettlebell | fullBody (abs) | - | - | 스텝만 |
| 310 | 390 | 슬레드 푸시 | Sled Push | other | fullBody (quads) | - | - | 이미지 |
| 311 | 391 | 슬레드 풀 | Sled Pull | other | fullBody (back) | - | - | 스텝만 |
| 312 | 392 | 수트케이스 캐리 | Suitcase Carry | dumbbell | fullBody (forearms,abs) | - | - | 스텝만 |
| 313 | 393 | 월 볼 | Wall Ball | other | fullBody (quads,shoulders) | - | - | 스텝만 |
| 314 | 394 | 메디신 볼 슬램 | Medicine Ball Slam | other | fullBody (abs) | - | - | 스텝만 |
| 315 | 395 | 베어 크롤 | Bear Crawl | bodyweight | fullBody (abs,shoulders) | - | - | 스텝만 |
| 316 | 396 | 프론트 레버 홀드 | Front Lever Hold | bodyweight | back (abs) | - | - | 스텝만 |
| 317 | 398 | 버피 브로드 점프 | Burpee Broad Jump | bodyweight | fullBody | - | - | 스텝만 |
| 318 | 399 | 버피 오버 더 바 | Burpee Over the Bar | bodyweight | fullBody | - | - | 스텝만 |
| 319 | 400 | 점핑 잭 | Jumping Jack | bodyweight | fullBody (calves) | - | - | 스텝만 |
| 320 | 401 | 하이 니 | High Knees | bodyweight | fullBody (quads,calves) | - | - | 스텝만 |
| 321 | 402 | 프론트 레버 레이즈 | Front Lever Raise | bodyweight | back (abs) | - | - | 스텝만 |
| 322 | 405 | 수영 | Swimming | bodyweight | fullBody (back,shoulders) | cardio | - | 없음 |
| 323 | 406 | 복싱 | Boxing | bodyweight | fullBody (shoulders,abs) | cardio | - | 없음 |
| 324 | 407 | 클라이밍 | Climbing | bodyweight | fullBody (back,forearms) | cardio | - | 없음 |
| 325 | 408 | 하이킹 | Hiking | bodyweight | fullBody (quads,calves) | cardio | - | 없음 |
| 326 | 409 | 스프린트 | Sprint | bodyweight | fullBody (quads,hamstrings) | cardio | - | 없음 |
| 327 | 410 | 야외 사이클 | Outdoor Cycling | other | quads (calves) | cardio | - | 없음 |
| 328 | 411 | 리컴번트 바이크 | Recumbent Bike | machine | quads (calves) | cardio | - | 없음 |
| 329 | 412 | 히트 (HIIT) | HIIT | bodyweight | fullBody | cardio | - | 없음 |
| 330 | 413 | 에어로빅 | Aerobics | bodyweight | fullBody | cardio | - | 없음 |
| 331 | 414 | 요가 | Yoga | bodyweight | fullBody | cardio | - | 없음 |
| 332 | 415 | 필라테스 | Pilates | bodyweight | fullBody (abs) | cardio | - | 없음 |
| 333 | 416 | 스케이팅 | Skating | other | quads (glutes) | cardio | - | 없음 |
| 334 | 417 | 스키 | Skiing | other | quads (glutes) | cardio | - | 없음 |
| 335 | 418 | 스노우보드 | Snowboarding | other | quads (glutes,abs) | cardio | - | 없음 |
| 336 | 419 | 스트레칭 | Stretching | bodyweight | fullBody | cardio | - | 없음 |
