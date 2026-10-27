# /qa spec — 데이터·동기 검토 (openGym 추천 1~5)

> 검토자: **오프라인 우선 데이터·동기 아키텍트**(WatermelonDB LokiJS/IndexedDB 마이그레이션 · 결정적 id·동기 충돌 · Postgres 마이그레이션 · 대량 쓰기 원자성·성능)
> 대상: `.ouroboros/docs/spec/20261027_opengym-recs/spec.md` (+ _analysis·_context · SAD-023·025 · ADR-038·042·043 · SRS-073·077·081·082)
> 코드 대조: HEAD 2c7735c 근처 `src/` 읽기 전용 · WatermelonDB 0.28.0 소스(node_modules) 직접 확인

## 핵심 의견
v26 스키마 자체(optional 칸 추가 + 새 테이블 3개)는 기존 데이터와 섞여 쓰는 기기에 안전하다. 서버가 jsonb 얕은 병합을 하고, 옛 앱은 모르는 표를 건너뛰고, 백업은 없는 표를 허용하기 때문이다. 문제는 **가져오기(P5)가 기존 동기 장치의 한계와 정면으로 부딪친다**는 점이다. 서버 push 상한이 5000건인데 클라이언트는 나눠 보내지 않는다. 원격 삭제 표시(tombstone)는 로컬에서 막 만든 같은 id 행을 지운다. LokiJS batch는 트랜잭션이 아니다. ADR-042의 markLocalWins는 막으려던 손실을 오히려 일으킨다. 그리고 **v26은 P1에서 동결되는데**, 가져오기 복구·되돌리기와 체중 미러에 필요한 칸이 빠져 있어서 P1 착수 전에 스키마를 다시 정해야 한다.

---

## 지적 목록

### D-1 · 높음 · 가져오기 뒤 동기가 영구히 실패한다 — push 상한 5000건, 클라이언트는 안 나눈다
- **근거**
  - `src/backend/internal/sync/service.go:46` `maxRecordsPerPush = 5000`, `:158-159` 넘으면 `Validation` 오류("too many records in one push")로 push 전체를 거부한다.
  - `src/frontend/lib/syncTransport.ts:96-102` push는 받은 변화분을 그대로 **한 번에** 보낸다. 주석(service.go:45)의 "클라이언트가 알아서 나눈다"는 구현되어 있지 않다.
  - 1만 세트를 가져오면 운동 ~1000 + 운동 종목 ~5000 + 세트 10000 + 커스텀 종목·묶음·별칭으로 **약 1.6만 건의 created 행**이 생긴다(spec.md:137·138, SRS-082). 첫 push에서 거부되고, WatermelonDB는 아무것도 synced로 표시하지 않으니 **그 뒤 모든 동기가 같은 이유로 실패한다**. 이후에 하는 운동 기록도 서버에 안 올라간다. 2026-08 "_status 한 건이 동기 전체를 죽인" 사고와 같은 종류다(syncEngine.ts:65-68).
  - 되돌리기(`undoImportBatch`)도 삭제 1.6만 건이라 똑같이 막힌다. 백업 가져오기(backup.ts:102-154)도 이미 같은 위험을 안고 있다.
  - 위험이 커지는 경우: 스키마 버전을 올린 뒤 첫 동기에서 push가 실패하면 `SYNCED_SCHEMA_KEY`가 저장되지 않는다(syncEngine.ts:236·262). 그러면 **동기할 때마다 커서를 지우고 전량 pull을 반복한다**(2분 주기 + 저장할 때마다).
- **개선안**
  1. P5의 선행 작업(core·frontend, 화면 겹침 없음)으로 `syncTransport.push`에 **나눠 보내기**를 넣는다. 컬렉션 경계와 상관없이 ≤2000건씩 순서대로 보낸다. 서버 upsert는 멱등이라, 중간 묶음이 실패해도 WatermelonDB가 다음 회차에 전부 다시 보내면 결과가 같다. 이 성질을 Go 테스트 주석에 고정한다.
  2. 대안으로 서버 상한을 올리는 방법도 있지만 요청 크기·트랜잭션 길이 때문에 권하지 않는다. 나눠 보내기가 정석이다.
  3. P5 검증에 「1만 세트 가져오기 → 동기 성공 → 서버 sync_records 수 = 로컬 수 → 다른 기기 pull 수 일치」와 「되돌리기 → 동기 성공」 e2e를 추가한다.
  4. 백업 가져오기에도 같은 경로가 적용되는지 회귀 테스트를 추가한다.

### D-2 · 높음 · 예전 되돌리기의 삭제 표시가 새로 가져온 행을 조용히 지운다
- **근거**
  - 서버는 삭제를 **행을 지우지 않는 삭제 표시**로 남긴다(`database/queries/sync.sql:40-54`). pull은 그 표시를 `deleted`로 돌려준다(service.go:128-129).
  - WatermelonDB `applyRemote`는 원격 deleted id와 같은 로컬 레코드를 **상태(created 포함)와 무관하게** `prepareDestroyPermanently` 한다(`@nozbe/watermelondb/sync/impl/applyRemote.js:88-91·273-276`).
  - 결정적 id(spec.md:131)라서 「A 기기에서 가져오기 → 되돌리기 → 동기」 뒤에 B 기기(커서가 그 이전)에서 같은 파일을 가져오면, B의 다음 pull이 그 삭제 표시를 받아 **방금 가져온 행을 영구 삭제**한다. 이미 push된 뒤라면 서버에서는 되살아나 기기마다 상태가 갈린다. 같은 기기에서도 오프라인으로 되돌리기 → 재가져오기 → 동기 순서면 같은 일이 생길 수 있다.
  - 스키마를 올린 뒤 첫 동기는 **커서 0부터 전량 pull**이라(syncEngine.ts:233-236) 지금까지의 모든 삭제 표시가 한꺼번에 온다(검증 항목 5와 연결).
- **개선안**
  1. **로그인 상태에서는 가져오기 직전에 동기 한 번을 필수로 한다**(pull로 삭제 표시를 먼저 적용). 오프라인이면 가져오기를 허용하되, 이 계정에 `undone` 묶음이 있으면(D-6 status 칸) 「온라인에서 다시 시도」 안내로 막는다.
  2. 기존 id 판정은 계획 단계(Worker)가 아니라 **write 안에서 다시** 한다. 아래 D-3과 같이 고친다.
  3. e2e: 「되돌리기 → 동기 → 다른 컨텍스트(새 DB)에서 같은 파일 가져오기 → 동기 두 번 → 남은 운동 수 = 파일 운동 수」.

### D-3 · 높음 · 로컬 삭제 표시가 남은 id로 다시 만들면 LokiJS 드라이버가 「망가짐」 상태가 된다
- **근거**
  - Watermelon 쿼리는 `_status='deleted'` 행을 숨긴다. 되돌리기 뒤 아직 push되지 않은 삭제 표시 행은 「이미 있는 id」 판정(spec.md:131 "이미 있는 id는 skipped")에 잡히지 않는다. 그 상태에서 같은 id를 `prepareCreate` 하면 Loki의 id 고유 인덱스에 걸린다.
  - LokiJS batch는 **트랜잭션이 아니다**. 실패하면 드라이버가 "broken" 상태로 들어가 이후 저장·변경을 거부한다(`adapters/lokijs/worker/DatabaseDriver.js:110-118`). 그 뒤의 세트 기록이 디스크에 남지 않는다.
  - 계획을 만든 시점과 write 사이에 배경 동기가 다른 기기의 같은 id를 받아도 같은 충돌이 난다. 계획은 Worker에서 만든다(spec.md:139).
- **개선안**
  1. `importPlan` write 안에서 batch 직전에 `Q.where('id', Q.oneOf(ids))` 결과와 `database.adapter.getDeletedRecords(table)`를 **둘 다** 보고, 걸리는 운동을 통째로 skipped로 옮긴다.
  2. 로컬 삭제 표시가 있는 id는 「동기 후 다시」로 돌린다. `destroyPermanently`로 지우면 삭제가 서버로 안 가므로 쓰지 않는다.
  3. 가져오기 진행 중에는 `syncWithServer`를 미루도록 플래그를 둔다. 동기는 겹치면 안 되므로 기존 inFlight 장치와 같은 자리에 둔다.

### D-4 · 높음 · ADR-042의 markLocalWins는 「가져온 직후 고친 값」을 지키지 못하고 오히려 지운다
- **근거**
  - ADR-042가 markLocalWins를 쓰는 이유는 "가져온 직후 고친 세트(user_edited)가 원격 원본에 덮이는 것을 막는다"이다. 그런데 Watermelon은 **created 행을 나중에 update해도 `_changed`를 기록한다**. `_changed`를 빠뜨리는 건 `prepareCreate` 빌더 안뿐이다(`Model/index.js:385` `'create' !== this._preparedState`, `sync/helpers.js:14-19`). 그러니 가져온 뒤 사람이 고친 칸은 markLocalWins가 없어도 로컬이 이긴다.
  - 반대로 **만들 때** 모든 칸에 markLocalWins를 걸면 이런 일이 생긴다. A 기기가 가져와 동기한 뒤 세트를 고쳐 동기했다. 그 뒤 B 기기가 pull 전에 같은 파일을 가져오면, B의 **원본 값이 A의 수정을 칸 단위로 이기고**(`sync/impl/helpers.js:22-40` resolveConflict) B의 push가 서버의 수정본을 덮는다. ADR-042가 "트레이드오프"로 적은 경우보다 넓은, 조용한 수정 손실이다.
  - 기존에 markLocalWins를 쓰는 곳(`sync/localWins.ts:1-7`, exercisePrefs)은 **사람이 오프라인에서 정한 값**이다. 내용이 같은 기계 생성 행과는 성격이 다르다.
- **개선안**
  1. 가져온 운동·운동 종목·세트에는 **markLocalWins를 쓰지 않는다**(원격 우선을 허용). 내용이 같으니 대부분 무해하고, 원격에 있는 사람의 수정이 보존된다.
  2. markLocalWins는 **사용자가 고른 값만** 지키는 데 쓴다. `import_aliases.exercise_id`(맞추기 결정)와 사용자가 이름을 붙인 커스텀 종목의 `name_ko`가 그 대상이다.
  3. ADR-042를 「결정 수정」으로 갱신한다. D-2의 「가져오기 전 동기 필수」와 합치면 두 기기 경합 자체가 드물어진다.
  4. 단위 테스트(Loki 메모리 어댑터, 메모리 「WatermelonDB 이관 node 검증」 레시피): 「원격 수정본 + 로컬 created 같은 id → 동기 → 원격 수정 유지」.

### D-5 · 높음 · v26 DB를 옛(v25) 번들이 열면 로컬 DB 전체가 초기화된다 — 롤백·옛 셸 대비가 없다
- **근거**
  - WatermelonDB LokiJS는 DB 버전이 앱 스키마보다 높으면 **"Database has newer version … Resetting database"로 전부 지운다**(`adapters/lokijs/worker/DatabaseDriver.js:367-368`). 동기 안 된 기록도 함께 사라진다.
  - 이 경로로 들어오는 현실적인 경우가 셋 있다.
    - ① 서비스워커는 새 버전을 스스로 활성화하지 않는다(sw.js:14). 옛 워커는 SWR 셸(`/`·`/workout`·`/stats`… sw.js:29-38)을 **기기 캐시 그대로** 준다. 셸 밖 경로(`/routines`·`/coaching`·`/stats/summary` 등)는 네트워크에서 받는다(sw.js:116-131). 그래서 「셸 밖 화면에서 새 번들(v26)로 마이그레이션 → 홈으로 전체 이동 → 옛 셸(v25) → DB 초기화」가 가능하다. 오프라인 대체 경로인 "앞 세대 셸"(sw.js:140)도 같다.
    - ② 배포 롤백(병렬 세션 규칙 6의 배포 경합 포함)이나 상대 세션이 v26이 합쳐지기 전 HEAD를 내보내는 경우.
    - ③ 열려 있던 옛 탭을 새로고침하는 경우.
  - 스펙의 P1 검증(spec.md:64)은 v25→v26 정방향만 본다.
- **개선안** (P1 필수)
  1. v26 번들 부팅 시 DB를 열기 **전에** localStorage `liftgram.maxSchemaSeen`을 쓴다. 이후 번들은 자기 SCHEMA_VERSION이 그 값보다 작으면 **DB를 열지 않고** 「새 버전으로 새로고침」 화면만 보인다. 다음 버전부터 효과가 있는 가드다.
  2. v26 자체를 지키려면 v26 번들이 마이그레이션을 끝낸 직후 **페이지 쪽에서 옛 세대 `liftgram-pages-*` 캐시를 지우고**(`caches.delete`는 창에서도 된다), 기다리는 워커가 있으면 운동 중이 아닐 때 `skip-waiting`을 보낸다. 그래야 옛 셸이 다시 나올 길이 없다.
  3. 배포 규칙에 "v26 배포 후에는 SCHEMA_VERSION<26 번들 배포 금지(롤백은 앞으로만 고치기)"를 명시한다. 배포 스크립트가 `SCHEMA_VERSION` 하강을 감지하면 중단하게 한다.
  4. e2e: v26으로 마이그레이션한 IndexedDB를 v25 빌드로 여는 시나리오를 재현해 1 또는 2가 막는지 본다.

### D-6 · 중간(P1 전 필수) · v26 동결인데 가져오기 복구·되돌리기·체중 미러에 필요한 칸이 빠져 있다
- **근거**
  - "로컬 v26은 P1에만, 이후 Phase는 로컬 스키마를 바꾸지 않는다"(spec.md:39·167). 그런데 `import_batches`는 `source · file_name · workout_count · set_count`만 있다(spec.md:44).
  - ADR-043 대안(나눠 쓰기 + 실패 시 묶음 삭제)은 **탭이 닫히거나 앱이 죽으면 보상 삭제가 돌지 않는다**. 부팅할 때 「끝나지 않은 묶음」을 알아볼 칸이 필요하다.
  - 되돌린 묶음은 「가져오기 기록」에 남기고(SRS-082), 다른 기기에도 같은 상태로 보여야 한다. D-2 판단에도 이 상태가 필요하다.
  - Strong 파일은 무게 단위가 없어 사용자가 kg/lb를 고르고(spec.md:129), 날짜에 시간대가 없다(D-7). 다시 가져올 때 같은 해석을 재현하려면 고른 값을 남겨야 한다.
  - 체중 미러 일관성(D-10)을 지키려면 이력 행의 출처(체크인·직접·초기 이관)를 구분해야 한다.
- **개선안** (P1 스키마에 미리 넣는다. 전부 optional)
  - `import_batches.status` string(`writing|done|undone`, null=done) · `undone_at` number · `weight_unit` string · `tz_offset_min` number
  - `bodyweight_logs.source` string(`checkin|manual|legacy`, null=manual) · `note` string(선택)
  - 부팅 파이프라인에 「`status='writing'`인 묶음의 행 삭제 → 묶음 삭제」 정리 단계를 넣는다. 단일 write 경로에서도 묶음 행을 첫 줄에 `writing`으로 만들고 마지막에 `done`으로 바꾸면, 두 전략이 같은 복구 규칙을 공유한다.

### D-7 · 중간 · 결정적 id 입력이 기기 시간대에 따라 달라지고, 해시 함수가 정해져 있지 않다
- **근거**
  - `imp-<source>-<hash(startedAt|title)>`(spec.md:131). Strong의 `Date`와 Hevy의 "25 Aug 2026, 10:10"은 **시간대 없는 현지 시각**이다. `startedAt`을 epoch로 바꾼 뒤 해시하면 시간대가 다른 기기·여행·서머타임 설정에 따라 id가 달라진다. 그러면 SRS-082 수용 기준 "다른 기기에서도 중복 0"이 깨진다.
  - `title`이 들어가 있어서 Strong에서 운동 이름만 고치고 다시 내보내도 중복이 된다.
  - 해시 종류·길이가 정해져 있지 않다. 32비트면 운동 1000개에서 충돌 확률이 ~1e-4이고, 충돌하면 다른 운동이 「이미 있음」으로 **건너뛰어져 빠진다**.
- **개선안**
  1. id 입력은 **원본 문자열을 정규화한 현지 시각**(`YYYY-MM-DDTHH:mm[:ss]`, 시간대 해석 전)과 `source`로 한다. `title`은 같은 시각이 두 번 나올 때만 쓰는 구분자로 둔다(같은 시각의 원본 순번 `#n`).
  2. 해시는 SHA-256(crypto.subtle, Worker에서도 된다)의 앞 16바이트(hex 32자)로 고정한다. 순수 함수 대체(동기 FNV-1a 64비트 ×2)도 테스트로 같은 결과를 고정한다.
  3. 시간대 해석은 epoch 변환에만 쓰고, 그 값을 `import_batches.tz_offset_min`(D-6)에 남긴다.
  4. 테스트: TZ=Asia/Seoul과 TZ=America/New_York에서 같은 파일 → 같은 id 집합.

### D-8 · 중간 · `createCustomExercise`를 가져오기 write 안에서 부르면 교착된다
- **근거**: `src/core/src/data/exerciseRepository.ts:87-88` `createCustomExercise`는 자기 `database.write`를 연다. spec.md:137은 "database.write 한 번 + batch · 커스텀 종목 결정적 id(`createCustomExercise`에 id 인자)"라고 한다. write 안에서 write를 부르면 Watermelon writer 큐가 서로 기다려 멈춘다. batch에 넣으려면 prepare 형태가 필요하다.
- **개선안**: `prepareCustomExercise(input, {id, importBatchId})`(Model을 돌려주는 순수 prepare)를 새로 만들고, `createCustomExercise`는 그것을 감싸게 한다(코드 보존 규칙 §3.6). id 형식(예: `cx-<source>-<hash(정규화 이름)>`)을 스펙에 적고, `seed-`로 시작하지 않음을 테스트한다(catalogFilter.ts:11 — `seed-`면 동기에서 빠진다). 체중 미러 쪽도 같다. 프로필을 찾는 `getOrCreateLocalUser`(userRepository.ts:20-27)는 없으면 write를 여니, write 밖에서 먼저 확보한다.

### D-9 · 중간 · 묶음 되돌리기가 다른 묶음·앱 기록이 쓰는 커스텀 종목과 별칭을 지운다
- **근거**: 커스텀 종목 id가 결정적이면 두 번째 가져오기(겹치는 파일)는 같은 종목을 **다시 쓰지만** `exercises.import_batch_id`는 첫 묶음 값 그대로다(spec.md:43·137). 첫 묶음을 되돌리면 두 번째 묶음과, 그 사이 사용자가 루틴·앱 운동에서 쓴 기록의 `exercise_id`가 사라진 종목을 가리킨다. `import_aliases`도 지워진 종목을 가리키게 된다. SRS-082의 "다른 기록은 그대로다"를 어긴다.
- **개선안**: 되돌리기 때 커스텀 종목은 **같은 write 안에서 참조를 세어**(workout_exercises·routine_exercises에서 이 묶음 밖의 참조) 0일 때만 지운다. 참조가 남으면 남겨 두고 `import_batch_id`를 비운다. 별칭은 지운 종목을 가리키는 것만 지운다. `match.ts`는 별칭이 가리키는 종목이 없으면 그 별칭을 무시한다. 테스트로 고정한다.

### D-10 · 중간 · `bodyweight_logs` ↔ `user_profiles.bodyweight_kg` 미러가 쓰기 경로 하나에서만 맞춰진다
- **근거**
  - 미러는 「bodyweightRepository의 같은 write 안」에서만 갱신된다(spec.md:85, SAD-023 ⑤). 그런데 이력은 이 밖의 경로로도 바뀐다.
    - (a) 다른 기기의 이력이 **pull로** 들어올 때. 미러 재계산이 없다.
    - (b) 두 기기가 각자 미러를 쓰면 `bodyweight_kg`는 **마지막에 push한 쪽**이 이긴다(sync.sql:35-38 병합). 그 값이 측정 시각상 최신이라는 보장이 없다.
    - (c) 옛(v25) 클라이언트·캐시된 셸이 프로필 칸을 직접 고친다(userRepository.ts:83).
    - (d) 백업 가져오기는 bodyweight_logs·user_profiles를 날것으로 합친다(backup.ts:102-154). 새 계정에 가져오면 프로필 행이 둘이 되고, 읽기는 가장 오래된 프로필을 본다(workoutRepository.ts:77-79 `sortBy created_at asc take 1`).
  - 「최신」의 기준(측정 시각 vs 기록 시각)과 「삭제로 비면 …」 문구(spec.md:85)가 모호하다.
  - 기존 사용자는 v26 직후 이력이 0건이다. 프로필에 75kg이 있는데 BodyweightCard·weeklyRate·체크인 「지난 값」이 비어 있다.
- **개선안**
  1. 규칙 하나로 정한다. **「내 체중」 = `measured_at` 최대인 이력(동률이면 `updated_at`)이고, 이력이 없으면 프로필 값.** 이 규칙은 core 함수 `resolveBodyweightKg(profile, logs)` 한 곳에 둔다.
  2. 미러는 캐시로 보고 **동기 뒤 멱등 정리 단계**에서 맞춘다. 기존 `normalizeCatalogRecords`(syncEngine.ts:264-275) 옆에 `reconcileBodyweightMirror()`를 두고, 백업 가져오기 직후에도 부른다. 모든 기기가 같은 이력에서 같은 값을 계산하므로 핑퐁이 없다.
  3. (c)는 프로필 `updated_at` > 최신 이력 `updated_at`이고 값이 다르면 옛 경로의 수정으로 보고 `source='legacy'` 이력 한 줄로 흡수한다.
  4. 첫 v26 부팅 때 프로필 값이 있고 이력이 0이면 **결정적 id `bw-init-<profileId>`**(measured_at = 프로필 updated_at, source=legacy)로 한 줄을 심는다. 기기 여럿이 같은 id라 중복이 없고, 내용이 같으니 원격 우선이어도 무해하다.
  5. 미러는 `getOrCreateLocalUser()`가 돌려주는 **가장 오래된 프로필**에 쓴다(읽기와 같은 행). 테스트: 두 기기 교차 기록·pull 뒤 미러 = 최신 측정 / 백업 가져오기 뒤 미러 / 옛 경로 수정 흡수.

### D-11 · 중간 · 「1만 세트 단일 write」의 원자성·무중단 전제가 웹에서 성립하지 않는다
- **근거**
  - 웹 어댑터는 `useWebWorker: false`(core/src/db/adapter.ts:11)라 Loki batch가 **메인 스레드에서 동기적으로** 돈다. Worker는 파싱·계획만 맡는다(spec.md:139). 약 1.6만 건 prepareCreate(sanitizedRaw) + Loki insert + 구독 쿼리 재실행 + 증분 IndexedDB 저장은 보통 폰에서 수 초 동안 입력을 막을 가능성이 크다. SRS-082 "처리 중 화면 입력이 막히지 않는다"와 충돌한다.
  - ADR-043·SAD-025의 "database.write 하나는 원자 단위"는 **SQLite 기준**이다. LokiJS는 트랜잭션이 없고, 실패하면 드라이버가 broken 상태가 된다(DatabaseDriver.js:110-118). 「강제 실패 시 하나도 안 남음」 테스트가 batch **전**에 예외를 넣으면 늘 통과해서 실제 위험을 못 본다.
  - 측정 환경이 "로컬 운영 빌드(3300)"(spec.md:138), 즉 데스크톱이라 "보통 폰"을 대표하지 않는다. ADR-043 본문은 포트 3200이라고 해서 병렬 세션 규칙과도 어긋난다.
  - SAD-025·ADR-043은 `scheduleFlush`(150ms 지연, localDb.ts:76-83)라고 한다. 대량 쓰기 직후 「완료」를 보이기 전에는 **`await flushLocalDb()`** 가 맞다. core는 frontend의 flush를 모르니 호출자(ImportCard)가 해야 한다.
- **개선안**
  1. 기본 전략을 **「운동 단위 묶음(≈1000~2000건)씩 write + 사이에 양보 + D-6 status 복구」**로 바꾸고 단일 write는 작은 파일(예: ≤2000건) 최적화로 둔다. 측정 전에도 메인 스레드 Loki라는 사실만으로 판단할 수 있다.
  2. 측정은 chrome-devtools CPU 4×·6× 제한 + 360×640 에뮬레이션에서 하고, 3300 포트를 쓴다. 기록 항목은 write 총 시간, 가장 긴 long task, flush 시간, **그 뒤 첫 push·다른 기기 pull 시간**, 통계 화면 「전체」 로딩 시간이다.
  3. 실패 주입은 「n번째 묶음 write 안에서 예외」와 「n번째 묶음 뒤 페이지 강제 새로고침」 두 가지로 하고, 부팅 정리 뒤 남은 행이 0인지 본다.
  4. 가져오기 중에는 운동 시작 버튼을 막는 안내(ADR-043 트레이드오프)를 스펙 항목으로 올린다.

### D-12 · 중간 · 가져온 운동 행의 필수 칸 값이 정해져 있지 않다 — 일부는 동기에서 빠지거나 0이 된다
- **근거**
  - `dropInProgressWorkouts`는 `state === 'completed'`만 다른 기기로 보낸다(syncEngine.ts:166-178). state가 빠지면 다른 기기에 안 나타난다.
  - `workouts.total_volume_kg`·`pr_count`·`accumulated_pause_ms`는 non-optional number라 안 넣으면 0이다(schema.ts:114-118). 통계·피드 요약이 캐시를 읽으면 볼륨 0이 된다.
  - `set_logs.done`·`completed_at`·`user_edited`가 정해져 있지 않다. 되돌리기 경고는 `user_edited`로 판정하는데, null이면 `updated_at !== created_at`로 되돌아가 시스템 쓰기에도 「고침」으로 판정된다(blockUnit.ts:57-66, 메모리 「user_edited vs updated_at」).
- **개선안**: plan.ts 출력 계약에 칸별 값을 표로 고정한다.
  - workouts: `state='completed'`, `started_at`=원본, `completed_at`=started+duration(없으면 started), `duration_seconds`, `total_volume_kg`=core 볼륨 함수(가져올 때의 체중 규칙 명시), `pr_count`=0 + 통계는 읽을 때 계산, `accumulated_pause_ms=0`, `created_at=updated_at`=가져온 시각
  - set_logs: `done=true`, `completed_at=null`, `user_edited=false`, `is_warmup`·`is_drop`·`is_failed`=W/D/F 대응, `set_type`은 처방 어휘(warmup|top|backoff)라 warmup만 채움
  - 테스트로 고정한다.

### D-13 · 중간 · `liftgram.summaryOutbox`(localStorage)가 계정 전환 때 비워지지 않는다
- **근거**: 계정 전환은 WatermelonDB만 비운다(`sync/syncOwner.ts:99-113` unsafeResetDatabase + 몇몇 표식). P4의 오프라인 보내기 대기열은 localStorage에 있다(spec.md:118). A 계정에서 오프라인으로 쌓은 요약(A의 기록 스냅샷)이 B로 로그인한 뒤 재전송되면 **B 이름으로 B의 코치에게** 간다. 서버 가드(회원→트레이너 active)는 보낸 사람 기준이라 이걸 잡지 못한다.
- **개선안**: 대기열 항목마다 `ownerUserId`를 넣고, 재전송 때 현재 세션 사용자와 다르면 버린다(또는 보관만 한다). `wipeFor`·`discardLocalAndAdopt`·로그아웃 경로에서 대기열을 비운다. e2e에 계정 전환 시나리오 한 줄을 추가한다.

### D-14 · 낮음 · 스키마를 올릴 때마다 전량 pull — 가져오기 사용자는 비용이 크게 늘고, 서버 조회는 페이지가 없다
- **근거**: 커서 초기화(syncEngine.ts:233-236)는 v26에 **필요하다**. v25 기기가 받으면서 버린 새 칸(rir 등)을 다시 받아야 하기 때문이다. 다만 `ListSyncChanges`는 상한·페이지가 없다(sync.sql:6-12, service.go:120-135). 가져오기 사용자(1.6만 건 이상)는 버전을 올릴 때마다 수 MB 응답 하나를 받고, 1.6만 건을 한 batch로 적용한다(메인 스레드, D-11과 같은 제약). 트레이너의 `ListMemberRecords`도 기간 필터 없이 회원 전체 기록을 읽는다(coaching.sql:79-84). P4 `GetMemberRecords`가 가져온 몇 년치 기록을 통째로 보낸다.
- **개선안**: (1) v26 첫 동기 전량 pull 시간을 P1 검증에 기록한다(표본: 운동 1000·세트 1만). (2) 후속 과제로 pull 페이지(limit + 다음 커서)를 백로그에 등록한다. 이번 범위 밖이어도 스펙 「주의사항」에 한 줄 남긴다. (3) `GetMemberRecords`는 workouts를 `(payload->>'started_at')::bigint` 기간으로 먼저 거르고, 그 운동의 자식만 돌려주도록 쿼리를 따로 둔다(서버가 payload를 해석하지 않는다는 원칙의 예외이니 ADR-040·041에 명시한다).

### D-15 · 낮음 · 리포트 컬렉션 고정(P1)과 요약·리포트 숫자 일치(P4)가 서로 어긋날 수 있다
- **근거**: P1은 "새 테이블이 리포트·이관에 필요 없는지 주석으로 고정"한다(spec.md:47). 반면 P4의 `periodSummary` 입력에는 체중 이력이 있고(spec.md:102), 검증은 "트레이너 리포트 숫자 = 회원 요약 숫자"다(spec.md:124). `reportCollections`(report.go:28)에는 bodyweight_logs가 없으니 트레이너 쪽은 체중 섹션이 늘 비어 있다. 이게 의도(동의 범위)인지 누락인지 스펙에 적혀 있지 않다.
- **개선안**: 「트레이너 원본 레코드에 체중 이력은 넣지 않는다(회원이 요약으로 보낼 때만 공유)」를 명시하고, 일치 테스트는 체중·노력 섹션을 빼고 비교한다고 적는다. 개인정보 검토자와 맞춘다.

### D-16 · 낮음 · `import_batches.file_name`이 서버로 동기된다
- **근거**: 원본 내용은 로그에 싣지 않는다는 원칙(SAD-025 제약, spec.md:139)이 있는데, 파일 이름(예: `strong_export_홍길동.csv`)은 sync_records로 서버에 저장된다.
- **개선안**: 표시용 짧은 이름(확장자 제외, 40자 자름)만 저장하거나, 「출처 + 가져온 날짜」로 대체한다. 원래 파일 이름은 이 기기의 화면 상태에만 둔다.

### D-17 · 낮음 · 확인된 안전 지점 — 테스트로 고정하자
- 옛 앱이 올린 레코드는 `payload || EXCLUDED.payload` 얕은 병합이라(sync.sql:22-38) **v25 기기가 같은 세트를 고쳐도 `rir`·`source`·`import_batch_id`가 지워지지 않는다**. 이번 칸으로 Go 회귀 테스트를 추가하면 좋다(variant_attach 때와 같은 방식).
- 옛 앱은 모르는 표(bodyweight_logs 등)를 건너뛴다(catalogFilter.ts:18-19). 백업 가져오기는 없는 표를 허용한다(backup.ts:109).
- 서버 고유키가 `(user_id, collection, record_id)`라서(sync.sql:35) **결정적 id(`imp-…`·`ia-…`)가 다른 사용자끼리 충돌하지 않는다**. ADR-042에 이 근거를 한 줄 적는다.
- 새 3테이블을 `USER_TABLES`에 넣으면 계정 전환 가드·대기 수·백업이 자동으로 따라온다(pending.ts:9-17, backup.ts:22). 다만 `exercises.import_batch_id` 칸은 is_custom만 세는 기존 규칙(pending.ts:25-28)으로 충분한지 확인한다.

---

## 판정: **조건부 통과**

- **P1 착수 전 필수**: D-5(다운그레이드 초기화 대비), D-6(v26에 칸 추가 — 동결이라 나중에 못 넣음), D-10의 규칙 확정(미러 = 측정 시각 최신 + 동기 뒤 정리 + 초기 한 줄).
- **P5 착수 전 필수**: D-1(push 나눠 보내기), D-2·D-3(삭제 표시·중복 id 처리, 가져오기 전 동기), D-4(ADR-042 수정), D-7(id 입력·해시 고정), D-8·D-9·D-11·D-12.
- **P4 전**: D-13, D-15. **기록만**: D-14, D-16, D-17.

설계 방향(core 순수 함수, optional 칸, 결정적 id, 묶음 id 되돌리기)은 맞다. 위 조건을 스펙·ADR-042·043에 반영하면 재작성할 필요는 없다.
