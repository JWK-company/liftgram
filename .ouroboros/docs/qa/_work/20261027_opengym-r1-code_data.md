# /qa code R1 — 데이터·동기 검토 (openGym 추천 첫 배포: P1 화면 + P2~P5 화면 없는 core)

> 검토자: 오프라인 우선 데이터·동기 코드 검토자(WatermelonDB 0.28 LokiJS/IndexedDB · 마이그레이션 · 동기 충돌 · 부팅 경로)
> 대상: `liftgram-wt-opengym` `git diff df4bf7e..HEAD`(878bbf4) 중 src/core/** · src/frontend/lib/** · components/SchemaGuard.tsx · app/layout.tsx · scripts/deploy-h2500-3.sh
> 실행: `bun run test:core` 414/414 통과. 별도 확인 = 순수 함수 `planBodyweightMirror` 재현 스크립트(scratchpad · 아래 CD-1 결과), LokiJS 드라이버 원본(`adapters/lokijs/worker/DatabaseDriver.js` · `lokijs/src/incremental-indexeddb-adapter.js`), 서버 `sync/repo.go`·`sync.sql.go`.

## 핵심 의견

1. **동기·부팅을 통째로 죽이는 결함은 못 찾았다.** 걱정했던 길은 대부분 막혀 있다.
   - v26 마이그레이션: 추가한 칸이 전부 optional이다. Loki `_executeAddColumnsMigration`이 모든 행에 null을 넣지만 새 칸이라 잃을 값이 없다. `createTable`도 새 표만 만든다. 남는 위험은 큰 DB에서 한 번 전체를 다시 저장하는 비용뿐이다. e2e로 v25 모양 → v26 이관도 확인했다(p1-ui-report).
   - push 나눠 보내기: 서버 `Apply`는 묶음마다 트랜잭션이다. 충돌 검사가 없고(lastPulledAt 비교 없음) `payload || EXCLUDED.payload` upsert라 다시 보내도 결과가 같다. WatermelonDB는 `pushChanges`가 다 끝나야 synced로 표시하므로 「중간 실패 → 다음에 전부 다시」가 실제로 성립한다. 순서(부모→자식)는 서버에 FK가 없어 정합성 문제가 아니다.
   - 동기 멈춤: 정상 경로·예외 경로 모두 `finally`에서 푼다. 일부러 멈춘 채 두는 `write_failed_reload`만 남는데, 이번 배포에는 가져오기 화면이 없어서 그 길에 들어갈 수 없다.
   - 가져오기 부팅 정리: `import_batch_id = 그 묶음`인 행만 지운다. 가져온 운동은 자식까지 묶음으로 찾고, 커스텀 종목은 묶음 밖에서 참조하면 남긴다. 화면이 없으니 `writing` 묶음도 생기지 않는다. 비용은 매 부팅 `status='writing'` 질의 하나다.
   - 다운그레이드 가드: localStorage가 막히거나 던지면 막지 않는 쪽(fail-open)이다. 정상 사용자를 잘못 막는 길은 찾지 못했다. 배포 스크립트 검사는 rsync **전에** 돈다(맞는 위치).
   - getCompletedSets: 기존 호출자는 결과가 그대로다(`endMs` 미지정 = 예전 질의, `set`에는 칸을 넣지 않고 바깥 칸만 덧붙였다).
2. **그러나 이번 배포에서 화면 없이도 모든 사용자에게 돌아가는 체중 미러 정리(reconcileBodyweightMirror)가 사용자가 직접 입력한 값을 조용히 되돌린다(CD-1·CD-2).** 이번 배포에는 체중 이력 화면이 없다. 그래서 체중을 바꾸는 길은 지금도 프로필 스테퍼(옛 경로 `updateUserSettings`) 하나뿐인데, 바로 그 길이 깨진다. 볼륨 계산(맨몸±가중)도 되돌려진 값을 쓴다.
3. **마이그레이션 직후 지우는 페이지 캐시가 지금 세대 셸과 `/offline`까지 지운다(CD-3).** 그 뒤에는 오프라인에서 시작 화면 말고 다른 탭을 열면 「offline」 글자만 나온다. 앱 안 이동은 클라이언트 이동(LinkInterceptor)이라 셸이 다시 채워질 기회가 거의 없고, 다음 배포 때 워커가 새로 설치될 때까지 그대로다. 대상은 기존 사용자 전원과 첫 방문자이고, 한 번씩 일어난다.
4. 테스트는 순수 함수만 잡는다. 이번에 위험한 길(부팅·동기 뒤 repository 쓰기, 멈춤/재개, 전송 나눠 보내기 실패)은 node 테스트가 없다. 체중 테스트 하나(`bodyweight.test.ts:204`)는 CD-1의 동작을 「의도」로 굳혀 놓았다.

## 지적

### CD-1 · 높음 · 체중을 예전에 쓴 적 있는 값으로 되돌리면, 다음 동기나 부팅 때 직전 값으로 조용히 되돌아간다
- **위치**: `core/src/domain/bodyweight.ts:232-241`(`legacyEdit`의 `!valid.some((l) => sameKg(l.weightKg, p))`) + `:249`(`mirrorKg = top.weightKg`). 부르는 곳은 `data/bodyweightRepository.ts:185-223`(부팅 `migrations/runner.ts`, 동기 뒤 `sync/syncEngine.ts:278-289`, 백업 뒤 `sync/backup.ts:155-161`). 입력 경로는 `frontend/app/components/profile/ProfileClient.tsx:277`(스테퍼 한 번 누를 때마다 `updateUserSettings` 저장).
- **재현**(순수 함수로 확인):
  1. v26 첫 정리: 프로필 80 → `bw-init-p1`(80)이 생긴다.
  2. 프로필 스테퍼로 82 → 동기 뒤 정리가 `bw-legacy-p1-<t>`(82)로 흡수한다. 여기까지는 정상이다.
  3. 며칠 뒤 다시 80으로 → 80이 이미 이력(bw-init)에 있어서 `legacyEdit=false`가 된다. 결과는 `{ create: null, mirrorKg: 82, updateMirror: true }`다. 다음 동기(로그인 기기는 몇 초 안) 또는 다음 부팅(로그인 안 한 기기)에 프로필이 82로 돌아간다. 화면 숫자도 되돌아가고 맨몸 운동 볼륨도 82로 계산된다.
  - 체중은 같은 값을 오가는 것이 보통이다(스테퍼 단위 0.5·1kg). 그래서 거의 모든 체중 입력 사용자가 언젠가 겪는다.
  - 기기 사이 시계 차이가 있어도 같은 증상이 난다. 프로필 `updated_at`(이 기기 시계)이 다른 기기가 만든 이력의 `updated_at`보다 작으면 흡수되지 않고 되돌아간다.
- **원인**: 「어느 이력 값과도 다르다」 조건은 「다른 설정과 함께 올라온 낡은 미러」를 막으려고 덧붙인 것이다. 그런데 WatermelonDB는 pull을 먼저 하고 칸 단위로 로컬 `_changed`만 지킨다. 그래서 그 경우는 「pull 뒤 push 사이에 다른 기기가 끼어든」 수 초짜리 경합에서만 생긴다. 드문 경합을 막으려고 흔한 사용자 동작을 깨뜨리고 있다.
- **수정안**(둘 중 하나. 이번 배포라면 ①을 권한다):
  1. **프로필 체중 입력을 미러 규칙 안으로 넣는다.** `bodyweightRepository`에 `setBodyweightFromProfile(kg | null)`을 두고 같은 write 안에서 `manual` 이력 한 줄과 미러를 함께 쓴다. ProfileClient·세션 체중 입력은 이 함수를 부른다. 스테퍼 연타는 짧은 debounce(예: 1초)로 한 줄로 합친다. 그러면 「옛 경로 흡수」는 v25 클라이언트만 남으니 지금 조건을 유지해도 된다.
  2. 또는 `legacyEdit`에서 `!valid.some(...)` 조건을 뺀다(`p != null ∧ profile.updatedAt > top.updatedAt ∧ p ≠ top`). 이 경우 낡은 미러 경합은 받아들이고, `:204` 테스트를 「예전 값으로 되돌린 사용자 입력은 흡수된다」로 바꾼다.
  - 어느 쪽이든 회귀 테스트를 넣는다: 80 → 82(정리) → 80(정리) ⇒ 미러 80, 이력 최신 80.

### CD-2 · 중간 · 프로필에서 체중을 「설정 안 함」(0)으로 바꿀 수 없다 — 정리가 이력 최신값으로 다시 채운다
- **위치**: `domain/bodyweight.ts:249`. 프로필 값이 null이면 `legacyEdit`에서 `p != null`이 false가 되고, `mirrorKg = top.weightKg`, `updateMirror = true`가 된다. 입력 쪽 `ProfileClient.tsx:276-277`의 주석은 「0은 설정 안 함이다 — 그래야 세션이 체중 기반 계산을 건너뛴다」이다.
- **재현**: 이력이 한 줄이라도 있는 사용자(v26 첫 동기 뒤 모든 체중 입력자)가 스테퍼를 0으로 내린다. 다음 동기·부팅에 원래 값으로 돌아온다(재현 스크립트 결과 `{create:null, mirrorKg:82, updateMirror:true}`).
- **수정안**: CD-1 ①의 `setBodyweightFromProfile(null)`이 「이력 전부 지우기(삭제 표시) + 미러 null」을 하도록 정한다(U-9 「체중 미설정으로 돌아가요」 확인과 같은 뜻). 또는 이 배포에서는 0 입력을 막는다. 제품 결정이 필요하면 스펙 U-9에 적는다.

### CD-3 · 높음 · 마이그레이션 직후 캐시 정리가 지금 세대 셸과 `/offline`까지 지워 오프라인 탭 열기가 깨진다
- **위치**: `frontend/lib/schemaGuard.ts:26-31`(`liftgram-pages-*` 전부 삭제), `:46-59`(`cleanupAfterMigration`). 워커는 `public/sw.js:43-52`(설치 때 SHELLS 8개를 precache)와 `:116-145`(못 찾으면 → 앞 세대 → `/offline` → 「offline」 503).
- **재현**:
  1. 기존 사용자가 온라인에서 v26을 처음 연다. 마이그레이션이 끝나면 v25 캐시와, 기다리는 v26 워커가 설치 때 받아 둔 셸 캐시가 **둘 다** 지워진다(p1-ui-report e2e: 「첫 부팅 뒤 liftgram-pages-* 0개」).
  2. 체육관(오프라인)에서 앱을 연다. 시작 URL이 마지막 전체 이동으로 다시 캐시되지 않았다면 첫 화면부터 「offline」이다. 시작 화면이 열리더라도 `/workout`·`/history` 탭은 RSC 실패 → 전체 이동 → 캐시 없음 → `/offline`도 없음 → 「offline」 글자만 나온다.
  - 앱 안 링크는 LinkInterceptor 때문에 클라이언트 이동이라, 셸이 다시 채워지는 경우는 「온라인에서 그 경로로 전체 이동」 또는 「다음 배포 워커 설치」뿐이다.
  - 첫 방문자도 같다. `upgraded`(seen=null)여서 방금 설치된 워커의 셸을 지운다. 지울 이유가 없는 경우다.
- **수정안**:
  1. 지우는 대신 **덮어쓴다.** `navigator.onLine`이면 SHELLS(`/`, `/workout`, `/history`, `/calendar`, `/stats`, `/exercises`, `/profile`, `/offline`. sw.js와 한 목록으로 내보낸다)를 각각 `fetch(u, { cache: 'reload' })`로 받는다. `res.ok && !res.redirected`이면 **모든** `liftgram-pages-*` 캐시에 `put`한다. 옛 v25 셸이 새 셸로 바뀌므로 위험(옛 번들 실행 → DB 초기화)도 사라진다. 받지 못한 경로만 그 캐시들에서 `delete(u)`한다.
  2. 오프라인에서 처음 v26이 돌았으면 지금처럼 지우되, `PAGES_CACHE_CLEANED_KEY`를 쓰지 않는다. 그러면 다음 온라인 부팅에 1을 한 번 더 한다.
  3. DB에 기존 기록이 없는 첫 방문 기기(예: `getSchemaGuardState().seen === null`이고 user_profiles 0건)는 정리하지 않는다.
  4. e2e: 정리 뒤 `caches.match('/workout')`·`caches.match('/offline')`가 있는지 확인한다(지금 e2e는 0개를 기대값으로 고정했다 → 기대값을 바꾼다).

### CD-4 · 중간 · 이번 배포의 위험한 길에 repository·전송 수준 테스트가 없다 — 지금 테스트는 순수 함수와 구조만 본다
- **위치**: `domain/__tests__/schemaV26.test.ts`(스키마와 마이그레이션 글자 대조), `pushChunks.test.ts`(자르기만), `bodyweight.test.ts`(순수 판정. `:204`가 CD-1을 굳힘), `schemaGuard.test.ts`(판정·저장소). 다음은 node 테스트가 없다: `reconcileBodyweightMirror`(taken id·`getDeletedRecords`·write 안 재조회), `isLocalPullComplete`, `pauseSync`/`release`/`waitForResume`, `cleanupUnfinishedImports`/`removeBatch`, `syncTransport.push` 나눠 보내기 중간 실패.
- **위험 예**: `isLocalPullComplete`의 세 갈래(26 / 25 / 흔적 없음)를 하나라도 틀리면, 모든 로그인 사용자가 v26 첫 부팅 때 서버 이력 옆에 `bw-init`을 하나씩 더 심는다. 지금은 아무 테스트도 이걸 지키지 않는다.
- **수정안**: 메모리 「WatermelonDB 이관 node 검증」 방식(LokiMemoryAdapter·빈 Model+`_raw`)으로 최소 넷을 넣는다.
  - (a) v25 DB(행 있음)에 v26 마이그레이션을 실행한다 → 기존 칸 값 보존, 새 칸 null.
  - (b) 체중 정리를 두 번 연속 실행한다 → 두 번째는 쓰기 0. CD-1 시나리오도 함께.
  - (c) `pauseSync` 중에 `syncWithServer`를 3번 부른다 → 재개 뒤 `runSynchronize` 1번. 예외가 나도 `release`가 불린다.
  - (d) 가짜 transport로 3묶음 중 2번째를 실패시킨다 → `synchronize`가 reject하고 로컬 `_status`는 그대로다. 다음 회차에 전부 다시 보낸다.

### CD-5 · 낮음 · 로그인 전에 쓰던 기기가 계정에 합쳐지면 그 기기의 낡은 프로필 체중이 계정 체중을 덮을 수 있다
- **위치**: `data/bodyweightRepository.ts:188-192` + `sync/syncEngine.ts:302-307`. 동기 흔적이 없는 기기는 `allowCreate=true`라 부팅 때 `bw-init-<로컬 프로필 id>`를 심는다.
- **재현**: 로그아웃 상태로 쓰던 기기(프로필 70kg, 오래전 값)에서 로그인한다 → `adopted` → 로컬 프로필과 `bw-init-P_local`이 계정으로 올라간다. 서버 프로필 P_server가 더 오래된 프로필이면, 이력에 `bw-init-P_server`(75)와 `bw-init-P_local`(70)이 함께 남는다. `measured_at`이 각 프로필 `updated_at`이라 P_local 쪽이 더 최근이면 모든 기기의 미러가 70으로 바뀐다. 예전에는 가장 오래된 프로필만 읽어서 로컬 프로필 값이 무시됐다.
- **수정안**: 정리는 「가장 오래된 프로필」의 id로만 init을 심는다는 규칙에 「로그인 상태에서만 init을 심는다(로그아웃 기기는 미러만 맞춘다)」를 더한다. 또는 합친 뒤 정리 때 가장 오래된 프로필이 아닌 `bw-init-*`(source=legacy)는 최신 판정에서 뺀다.

### CD-6 · 낮음 · 동기를 일부러 멈춘 채 두는 길(`write_failed_reload`)에서 `syncWithServer()`를 기다리는 쪽이 영원히 멈춘다
- **위치**: `core/src/data/importRepository.ts:248`(`keepPaused = true` → `release()` 안 부름), `core/src/sync/syncEngine.ts:386`(`waitForResume()`은 시간 제한 없음). `opts.flush`가 끝나지 않을 때도 `:256-263`에서 `release`에 닿지 않는다.
- **재현**: 이번 배포에는 가져오기 화면이 없어 들어갈 수 없다. P5 화면이 나오면 쓰기 실패 + 정리 실패 뒤에 「지금 동기」·로그아웃 전 동기처럼 `await syncWithServer()`를 쓰는 화면이 그 탭에서 반응하지 않는다.
- **수정안**: 멈춘 동안의 `syncWithServer()`는 `SyncPausedError`로 곧바로 reject하고, 배경 `scheduleSync`만 재개 뒤로 합친다. `flush`는 `Promise.race`로 시간 제한(예: 5초)을 둔다. P5 화면 착수 전에 고친다.

### CD-7 · 낮음 · 열려 있던 옛(v25) 탭은 가드가 지킬 수 없다 — 증분 IndexedDB 어댑터가 다른 탭의 변경을 덮어쓴다
- **위치**: `lokijs/src/incremental-indexeddb-adapter.js:184-251`(`didOverwrite` — 다른 탭이 바꾼 IDB를 이 탭 사본으로 덮는다). 저장되는 `_loki_schema_version`은 `local_storage` 컬렉션에 있다(DatabaseDriver.js:15·500-505).
- **재현**: PWA를 v25로 띄워 둔 채 새 탭에서 v26으로 마이그레이션하고 RIR을 적는다. 이후 v25 탭이 동기 커서를 쓰면(저장 발생) IDB 전체가 v25 사본으로 덮인다. v26 탭에서 적은 미동기 기록과 새 표가 사라지고, 다음 v26 부팅이 다시 이관한다(데이터는 서버에 있던 만큼만 돌아온다).
- 판단: 다중 탭 덮어쓰기는 스키마와 상관없이 원래 있던 문제다. 이번 변경이 새로 만든 것은 아니다. 다만 이번 배포가 탭 두 개가 공존하기 쉬운 상황이라 적어 둔다.
- **수정안**(후속): v26부터 어댑터에 `onDidOverwrite`(다른 탭 덮어쓰기 감지)와 BroadcastChannel 「새 스키마 탭 열림」 신호를 달고, 옛 번들 탭이면 새로고침 화면을 띄운다. 이것도 다음 세대부터 효과가 있다.

### CD-8 · 낮음 · 배포 스크립트 하강 검사가 서버 사본을 읽지 못하면 그냥 통과한다
- **위치**: `scripts/deploy-h2500-3.sh:76-81`. `PREV_SCHEMA`가 비면(ssh 일시 실패·파일 형식 변경) 검사를 건너뛴다. 기준도 「라이브 번들」이 아니라 「마지막으로 rsync한 소스」라서, 빌드가 실패한 배포 뒤에는 기준이 실제 라이브와 다를 수 있다.
- **수정안**: `DEPLOYED_REF`가 있는데 `PREV_SCHEMA`가 비면 멈춘다(`ALLOW_UNKNOWN_SCHEMA=1`로만 넘긴다). 기준은 `git show $PREV:src/core/src/db/schema.ts`(서버 DEPLOYED_REF 커밋)로 읽고, 서버 사본은 보조로만 쓴다.

### 참고(지적 아님)
- **스키마 상승 = 전량 pull**(D-14): v26 첫 동기에서 모든 로그인 사용자가 전체를 다시 받는다. 이번에는 가져오기 사용자가 없어 규모가 예전 상승(v22~v25) 때와 같다. 체중 init은 이 pull이 끝나고 `SYNCED_SCHEMA_KEY=26`을 쓴 뒤에만 돈다(순서 확인함: syncEngine.ts:257-289).
- **마이그레이션 비용**: Loki `addColumns`는 set_logs·workouts·exercises 모든 행을 고친다. 그래서 첫 부팅에서 IDB 전체 청크를 다시 저장한다(세트 수만 건이면 수 초). 증분 어댑터 저장은 한 IDB 트랜잭션이라 중간에 닫혀도 v25 상태가 남고, 다음 부팅에 다시 이관한다. 안전하다.
- **나눠 보내기 재시도 비용**: 2번째 묶음이 계속 실패하면 1번째 묶음 2000건이 매 회차 다시 upsert되고 `updated_at=now()`가 바뀐다. 그래서 다른 기기가 같은 2000건을 계속 다시 받는다. 정합성 문제는 아니고 비용이다. 한 레코드가 늘 거부되는 경우는 예전에도 영구 실패였다.
- **D-1~D-17 반영**: D-1(pushChunks·transport), D-3(삭제 표시 id 회피 — 체중 정리·가져오기), D-5(①가드 ②캐시 정리 ③배포 하강 차단 ④e2e — 단 ②는 CD-3), D-6(status·undone_at·weight_unit·tz 칸), D-8(prepareCustomExercise), D-9(묶음 밖 참조 재계산), D-10(규칙·정리 지점 셋·bw-init·가장 오래된 프로필 — 단 ③흡수 조건은 CD-1), D-11(≤2000 write·양보), D-16(40자 라벨), D-17(USER_TABLES)는 코드에서 확인했다. D-13(summaryOutbox 계정 전환)은 이 범위(core·lib)에 구현이 없다. P4 화면 때 다시 본다.

## 판정: **조건부 배포 가능**

- **배포 전 필수**: CD-1(체중 되돌림)과 CD-3(오프라인 셸 소실). 둘 다 화면 없이 모든 기존 사용자에게 돌아가는 길이다. CD-1은 사용자 입력을 조용히 바꾸고, CD-3은 오프라인 우선 앱의 「체육관에서 열기」를 깬다. CD-2는 CD-1 ①로 고치면 함께 해결된다. 따로 고치지 않으려면 0 입력을 막는다.
- **배포 전 권장**: CD-4 중 (b)(체중 정리 멱등·되돌림 회귀)와 (d)(나눠 보내기 중간 실패).
- **P5 화면 전**: CD-6. **후속**: CD-5·CD-7·CD-8.
- 동기 전체를 죽이거나 부팅을 막는 결함(2026-08 `_status` 사고 같은 것)은 이번 diff에서 찾지 못했다.
