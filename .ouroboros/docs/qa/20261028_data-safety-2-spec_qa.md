# /qa spec — 정식 오픈 전 기록 보호 2차 (20261028_data-safety-2)

- 대상: `.ouroboros/docs/spec/20261028_data-safety-2/spec.md` · URS-027 · SRS-086~089
- 검토일: 2026-10-28 · 코드 기준: `feat/web-stack-tarae` 7b1b935 (읽기만)
- 전문가 패널
  - **오프라인 우선 웹앱 데이터 무결성 엔지니어** — LokiJS/WatermelonDB 저장 경로, 다중 탭, 넘겨주기 순서
  - **Go/PostgreSQL 백엔드·운영 엔지니어** — 0020, OpsService, 권한, 백업·복원 스크립트, cron
  - **모바일 웹 UX 설계자** — 권유 시트·띠·덮개·운영 화면의 흐름과 판정 경계
- 범위 밖(사용자 확정): 백업을 h2500-3 안에 두는 결정 자체

## 판정: **조건부 통과**

- P1(SRS-086)·P2+P3(SRS-087/088)는 아래 H·M을 스펙에 반영하면 execute 해도 된다.
- **P4(SRS-089)는 이대로 execute 하면 안 된다.** §7.1의 두 선택지 (a)·(b)가 실제 코드에서 둘 다 그대로는 안 되고, 멈춘 탭이 디스크를 덮는 경로가 스펙 바깥에 여럿 남아 있다(B-1~B-3). §7을 고친 뒤 P4만 다시 /qa spec 받는다.

---

## 핵심 사실(코드로 확인한 것)

1. **Loki 는 `@app/core/db`를 임포트하는 순간 열린다.** `core/src/db/database.ts:8-11`이 모듈 최상단에서 `new Database({ adapter: buildAdapter() })`를 만들고, `adapter.ts:36-45`는 autosave 기본값(`lokiExtensions.js:96-100` — `autosave: true, autosaveInterval: 500`)으로 진짜 DB `repset`를 연다. 정적 임포트 사슬: `layout.tsx:80` AuthProvider → `AuthProvider.tsx:126` `installSync()` → `lib/syncTransport.ts:17-28`(정적 import `syncEngine`·`runner`) → `syncEngine.ts:27` `import { database }`. **앱 셸 JS가 평가되는 순간 DB가 열리고, React effect·잠금 대기보다 먼저다.**
2. **명시적 `saveDatabase`는 바뀐 것이 없어도 디스크에 쓴다.** `lokijs.js:2744-2790`(incremental 모드는 dirty를 확인하지 않는다) → `incremental-indexeddb-adapter.js:245-253`: 디스크의 `loki` 청크 versionId가 자기가 마지막에 본 값과 다르면(다른 탭이 썼으면) `getAllKeysThenSave` **slow path로 자기 메모리 사본 전체를 덮어쓰고 남는 청크를 지운다**(232-243). 멈춘 탭이 `flushLocalDb()`를 **한 번만** 불러도 새 주인의 기록이 디스크에서 사라진다.
3. **flush 호출 지점이 97곳이다**(`grep flushLocalDb|scheduleFlush|navigateAfterFlush` · `localDb.ts` 제외). 화면이 숨을 때 자동으로 부르는 곳도 있다: `ActiveWorkout.tsx:133`·`CatalogClient.tsx:206`의 `flushOnHide()`(`localDb.ts:63-74` — visibilitychange hidden·pagehide), `prefs.ts:143`, `appUpdate.ts:287`, 동기 전송 `syncTransport.ts:110-113`.
4. `pauseSync`(`syncEngine.ts:352-375`)는 동기만 멈춘다. autosave·flush·화면 쓰기에는 손대지 않는다. 지금의 「다른 탭에서 가져오는 중」(`tabGuard.ts:63-74`)도 동기만 멈추므로 **같은 종류의 구멍이 SRS-082에 이미 있다**(M-9).
5. `SyncHealth.lastAttemptAt`은 동기를 **시작할 때** 바뀐다(`syncEngine.ts:408-409`). 결과(`lastSuccessAt`·`consecutiveFailures`)는 끝난 뒤에 바뀐다(414-424).
6. 역할은 access 토큰 claim에서 온다(`auth/middleware.go:76-85` `VerifyAccess` → `RoleFrom`) · access TTL 15분(`auth/service.go:45`). moderation은 `requireModerator(viewerID, role)` + `canModerate` 맵을 쓴다(`moderation/service.go:50,327-333`).

---

## B — 차단

### B-1. §7.1 넘겨주기 (a)·(b) 둘 다 그대로는 안 되고, 새 탭 B가 넘겨주기 전에 autosave로 디스크를 덮는다
- 근거: 사실 1·2. `adapter.ts:36-45`(진짜 DB는 autosave 켜짐) · `syncTransport.ts:51-60`(`runBootPipeline`이 곧바로 시드 top-up·백필 쓰기) · `syncEngine.ts:27`.
- (a) 「셸이 DB를 처음 만지기 전에 기다린다」: DB가 **모듈 평가 때** 열려 기다릴 자리가 없다. 정적 import 사슬 전체를 동적으로 바꾸는 큰 리팩터가 되는데, 스펙 §8 파일 범위에 들어 있지 않다.
- (b) 「B가 연 뒤 released=saved면 한 번 새로고침」: 순서가 이렇게 되면 기록을 잃는다.
  ① B가 디스크 v1을 읽기 시작한다 → ② A가 claim을 받고 flush해서 디스크가 v2(A의 마지막 세트)가 된다 → ③ B의 부팅 파이프라인·pull이 메모리를 dirty로 만든다 → ④ released가 오기 전(최대 1.5초 기다림) B의 500ms autosave가 돈다. 디스크 versionId가 v2라 B가 본 값과 다르다 → slow path → **B의 낡은 사본이 A의 마지막 세트를 지운다** → ⑤ B가 새로고침해도 이미 늦었다.
- 수정안(스펙에 못 박을 것):
  1. `core/src/db/adapter.ts`의 진짜 DB도 **autosave를 끈 채 연다**(`extraLokiOptions: { autosave: false }`). 넘겨주기가 끝난 뒤(released를 받았거나 이전 주인이 없거나 시간이 다 됐을 때) `loki.autosaveEnable()`로 켠다. 그때까지 `flushLocalDbResult()`는 `"deferred"`를 돌려주고 디스크에 닿지 않는다. 파일 범위에 `core/src/db/adapter.ts`를 넣는다.
  2. B는 넘겨주기가 끝날 때까지 `pauseSync()`를 쥐고, `runBootPipeline`이 그것을 기다리게 한다(`installSync`에서 `startTabGuard()` 다음에 `await writerReady`).
  3. (b) 경로를 고르면 released=saved에서 새로고침하기 **전에 B는 아무것도 저장하지 않는다**(위 1이 보장한다). 새로고침한 B는 같은 탭 sessionStorage 표식이 있어 다시 claim하지 않는다. 그래도 넘겨주기 순서는 다시 지킨다.
  4. 결국 (a)는 빼고 「autosave 끈 채로 열기 + 넘겨주기 뒤 켜기 + 필요하면 새로고침」 하나로 확정한다. execute 재량으로 남기지 않는다.

### B-2. 멈춘 탭의 「쓰기 차단」이 스펙대로는 디스크 쓰기를 막지 못한다 — flush 경로 97곳과 숨김 시 자동 flush
- 근거: 사실 2·3. `localDb.ts:45-55`(`saveDatabase`를 그대로 부른다) · `localDb.ts:63-74`(`flushOnHide`) · `ActiveWorkout.tsx:133` · `CatalogClient.tsx:206` · `prefs.ts:143` · `appUpdate.ts:287`.
- 흔히 생길 시나리오: A(운동 중)가 덮개 상태 → 사용자가 A 탭을 잠깐 봤다가 B로 돌아간다 → A가 visibilitychange hidden으로 `flushOnHide` → `saveDatabase` → slow path → **B에서 저장한 세트가 디스크에서 사라진다.** 스펙의 「동기 pause · autosave 끄기 · database.write 문지기」로는 막지 못한다. write를 거부해도 바뀌지 않은 사본의 **저장**이 덮어쓰기다.
- 수정안: 차단은 **가장 아래 한 곳**에서 한다.
  1. dormant에 들어가는 순간 `loki.autosaveDisable()`을 부르고, 어댑터의 `persistenceAdapter.saveDatabase`(또는 `loki.saveDatabase`)를 「디스크에 닿지 않고 오류 콜백」 함수로 바꿔 끼운다. 이 바꿔 끼우기는 `lib/localDb.ts`의 `findLoki()` 옆에 `sealLocalDb()`로 둔다. 그러면 97곳·Watermelon 내부·throttled 대기열이 전부 막힌다.
  2. `flushLocalDbResult`는 봉인 상태에서 `"sealed"`를 돌려준다. 호출부(prefs 대기 표식·appUpdate)가 이것을 성공으로 오인하지 않는지 확인 목록을 스펙에 넣는다.
  3. 「새로고침해서 DB 없이 덮개만」을 고르면, 새로고침한 dormant 탭은 `buildAdapter()`에서 sessionStorage 표식을 **동기적으로** 읽어 schema-guard처럼 버리는 DB(`GUARD_DB_NAME` 패턴 · `adapter.ts:15,24-34` · autosave false)를 연다. 지금 코드 구조에서 「DB 없이」를 실제로 지키는 유일한 길이다. 스펙에 이 패턴을 지정한다.
  4. e2e 7.3 「5초 기다려도 IndexedDB 불변」은 **숨김 이벤트를 일부러 일으켜** 증명한다. `document.visibilityState`를 hidden으로 정의하고 `visibilitychange`·`pagehide`를 dispatch한 다음, `liftgram.updating` 없이 prefs 쓰기를 한 번 하고, 휴식 타이머가 돌던 상태에서 그 뒤 IndexedDB 전체 키·`loki` 청크 versionId가 그대로인지 본다.

### B-3. 늦게 깨어난 이전 주인(백그라운드에서 얼어 있던 모바일 탭)이 넘겨주기 flush로 새 주인을 덮는다
- 근거: §7.1 2단계 「빼앗김 감지 → 즉시 flush」, 3단계 「답이 없으면 1.5초 뒤 그냥 연다」 · 사실 2.
- 흔한 경우: 모바일 Chrome·Safari는 숨은 탭을 얼린다(JS 정지). B가 1.5초 기다리다 그냥 열고 기록한다. 몇 분 뒤 사용자가 A로 돌아가면 A가 깨어나 AbortError/claim을 처리하면서 **flush한다** → 디스크 versionId가 다르니 slow path → B의 기록을 지운다. 스펙 순서가 그대로 소실 경로다.
- 수정안:
  1. 넘겨주기 flush는 **디스크가 자기가 마지막에 본 것과 같을 때만** 한다. 저장 전에 `loki` 청크 versionId를 읽어 `_prevLokiVersionId`와 다르면 저장하지 않고 봉인한다(B-2의 봉인). 어댑터의 `getLokiThenSave`(245-253)가 slow path로 가는 바로 그 조건을 「덮어쓰기」 대신 「거부 + 봉인」으로 바꾸는 감싸기다. 이 안전망이 있으면 잠금·채널이 어긋나도 **어느 탭도 남의 쓰기를 slow path로 덮지 않는다.** R4를 근본에서 막으므로 P4의 1순위로 둔다.
  2. 감싸기를 넘어 덮어쓰기를 막은 탭은 B-2처럼 덮개를 띄우고, 메모리에만 있던 자기 변경은 잃는다는 사실을 덮개 문구·로그에 남긴다(조용한 실패 금지). 얼기 전에 `flushOnHide`가 이미 내려써 두었으므로 보통은 잃을 것이 없다.
  3. e2e: CDP `Page.setWebLifecycleState({state:"frozen"})`로 A를 얼리고 → B를 열어 1.5초 시간 초과 → B에서 저장 → A를 `active`로 되돌린다 → 새 page에서 IndexedDB를 다시 읽어 B의 세트가 남았는지 본다.

---

## H — 높음

### H-1. 기기 보고가 동기 **시작** 시점 값을 보내 판정이 틀린다 · 3번째 실패가 10분 쓰로틀에 걸린다 (SRS-088 위반)
- 근거: 사실 5 · 스펙 §6.3 「lastAttemptAt이 바뀌면 보고」 · SRS-088 「동기를 시도한 **뒤**(성공·실패 모두)」.
- 문제 1: 시작 시점 스냅샷은 늘 `last_attempt_at > last_success_at`이다. 하루 넘게 앱을 안 연 사용자가 오프라인 기록을 들고 돌아오면, 스펙 §6.2 stalled 조건(pending>0 · 성공 24h 넘음 · 그 뒤 시도 있음)을 **곧바로 만족하는 거짓 경보**가 된다. 성공 직후 상태는 즉시 조건(0↔양수·blocked)에 걸리지 않아 최대 10분, 앱을 닫으면 무기한 거짓 「멈춤」으로 남는다.
- 문제 2: 실패 1→2→3은 「0↔양수」가 아니어서 쓰로틀(10분)에 걸린다. 수용 기준 「연속 3회 실패가 보인다」가 늦고, e2e(§6.5 3회 실패 → /ops)는 10분을 기다리거나 깨진다.
- 수정안: 보고 방아쇠를 **시도가 끝났을 때**(`lastSuccessAt` 또는 `consecutiveFailures`·`lastError`가 바뀐 순간)로 바꾼다. 즉시 보고 조건에 「consecutiveFailures가 3 이상이 된 순간」과 「실패→성공」을 넣는다. 서버 stalled 판정은 기기 `isBackupStalled`(`useSyncHealth.ts:29-36`)와 **같은 식**으로 한다(`stale && attempt && failures>0` · `failures>=3` · `blocked` · `pending>0`). 식을 core 한 곳에 두고, Go에는 같은 경계 표를 테스트로 복제한다.

### H-2. 「N일째」 계산에 필요한 「첫 보고 시각」 칸이 없다 · 기기 시계 틀어짐이 그대로 판정에 들어간다
- 근거: §6.1 표에 `reported_at`(upsert마다 갱신)만 있다 · §6.2 「없으면 첫 보고부터」 · 「미래 시각은 now로」만 막는다.
- 수정안: ① `first_reported_at timestamptz not null default now()`를 추가하고 upsert에서 갱신하지 않는다. ② 기기는 절대 시각과 함께 `*_age_ms`(= 기기 now − last_success / last_attempt)를 보낸다. 서버는 `server_now − age`로 시각을 다시 계산해 저장한다(기기 시계가 몇 시간·며칠 틀어져도 「24시간」·「N일째」가 맞다). 미래면 now, 음수 나이는 0으로 자른다. Go 경계 테스트(23h59m/24h1m)는 이 계산된 값 기준으로 쓴다.

### H-3. 「로컬 띠 1건부터」가 기록(운동)이 아니라 **행 수**라, 첫 운동 중·온보딩 직후에 띠가 뜬다
- 근거: `SyncHealthBanner.tsx:29-30`은 `h.pending`을 쓰고, `pending.ts:9-36`은 `workouts`·`set_logs`·`user_profiles`·`exercise_user_prefs` 등 **행**의 `_status`를 센다. 비로그인 사용자가 운동을 시작하면 workouts 행 하나로 pending=1이다. 띠가 셸 맨 위(`layout.tsx:88`)라 **진행 중인 운동 화면에도 뜬다.** 스펙 §9 「로그인 권유가 운동 흐름을 끊지 않게」와 어긋난다.
- 수정안: 띠 조건을 「비로그인 · **완료한 운동** 1건 이상(`liftgram.nudge.anonCompleted >= 1` 또는 `workouts` 중 completed && 미동기)」으로 정의한다. `/workout`(진행 중 세션) 경로에서는 띠를 숨긴다. e2e 「기록 1건에서 보임」은 「운동 1회 완료 뒤 보임 · 완료 전(세트만 저장)에는 안 보임」으로 바꾼다.

### H-4. 넘겨주기 flush가 이전 주인의 **진행 중인 다단계 쓰기** 한가운데를 자른다
- 근거: 완료 흐름 `ActiveWorkout.tsx:579-590`은 `finishWorkoutWithPrompt` → `settleUndecidedPlateOneSide` → `flushLocalDb`의 여러 `database.write`로 되어 있다. claim이 그 사이에 오면 반쯤 된 상태(완료됐는데 플레이트 답이 안 붙음 등)가 디스크에 남는다. 그 뒤 쓰기는 봉인돼 사라진다.
- 수정안: 이전 주인은 claim을 받으면 ① 새 `database.write`를 거부하는 문을 먼저 닫고 ② Watermelon 작업 대기열을 비운다(`await database.write(async () => {})`를 장벽으로 쓰면 앞선 작업 뒤에 줄을 선다) ③ flush ④ 봉인 ⑤ released. ①~③을 1.5초 안에 끝내지 못할 수도 있으니 B의 기다림을 「released 또는 `{t:"releasing"}` 진행 신호가 오면 최대 5초」로 늘린다. `finishWorkoutWithPrompt`처럼 여러 쓰기로 된 사용자 동작은 가능하면 한 `database.write`로 묶을 후보로 기록한다.

### H-5. 보고 RPC 남용 — 사용자 하나가 기기 줄을 끝없이 만들고 admin 경보를 마음대로 켤 수 있다
- 근거: §6.2 「로그인 필수 · 역할 무관」 · device_id는 클라이언트가 정하고 PK가 (user_id, device_id)라 상한이 없다. 전역 limiter(`cmd/server/main.go:124,172`)는 IP·요청 수 기준이다. 가입이 열려 있어 계정은 얼마든지 만들 수 있다.
- 수정안: ① upsert와 같은 트랜잭션에서 사용자당 `reported_at` 최신 **8줄**만 남긴다(나머지 삭제). ② 사용자당 보고 RPC 분당 6회 상한(서비스 안 메모리 또는 redis 키), 넘으면 조용히 무시. ③ 정수 칸 범위 자르기: `consecutive_failures`는 0..10000, `pending`은 0..10^7, 음수는 0. ④ `device_id`는 `[A-Za-z0-9_-]{1,64}`만 받는다. ⑤ `last_error`는 제어문자를 지우고 200자로 자른다. ⑥ /ops는 경보 원인 사용자를 보여 주므로 남용이 있으면 바로 보인다(이것으로 충분 — 「경보는 안내」 원칙을 스펙에 적는다).

---

## M — 중간

### M-1. 백업 스크립트 실패 기록의 `trap`·SQL 인용이 구체적이지 않다
- 근거: `backup-h2500-3.sh:12,22`(`set -euo pipefail` · `docker exec … > "$f.part"`).
- `trap ERR`는 서브셸·파이프에서 기대대로 돌지 않고, `-c "insert … '$detail'"`은 오류 문자열에 `'`가 들어가면 깨지거나 주입된다.
- 수정안: `trap 'record $?' EXIT` 하나에 상태 변수(`STAGE`·`OK=0`)를 쓴다. insert는 `psql -v ok=… -v detail="$d" -c "insert … values (:'ok', :'detail', …)"`로 변수 인용한다(`ON_ERROR_STOP=1`). 기록 insert가 실패하면(DB가 죽어서) `backup.log`에 `RECORD_FAILED`를 남긴다. 이 경우 운영 화면은 「36시간 성공 없음」으로 결국 알린다는 점을 스펙에 적는다.

### M-2. 복원 시험의 ok 조건이 계정 삭제를 실패로 본다 — 백업 때 센 값과 **정확히** 대조하라
- 근거: §5.2 「복원 ≤ 운영 · 복원 > 0」 · `users` 삭제는 `sync_records`까지 CASCADE한다(`0011_sync.sql:13`). 백업 뒤 하루 안에 탈퇴가 있으면 복원 > 운영이 되어 거짓 실패가 난다. 반대로 「≤ 운영」은 덤프가 행을 일부 잃어도 통과한다(약한 검사).
- 수정안: daily 백업 때 같은 스냅샷에서 `users`·`sync_records` 행 수를 세어 `ops_backup_runs.detail`(또는 `jsonb counts` 칸)에 남긴다. pg_dump와 같은 시각이 되도록 덤프 직전에 `REPEATABLE READ`로 센다. 차이는 작다는 점을 스펙에 적는다. 복원 시험은 **그 덤프 파일의 기록된 수와 정확히 같으면 ok**로 하고, 운영 대조는 참고로만 detail에 싣는다. SRS-087 수용 기준 문구도 이에 맞춰 고친다.

### M-3. 복원 시험이 남긴 임시 DB 청소 · 디스크 사전 확인
- 근거: §5.2 「항상 dropdb(trap)」 — `kill -9`·서버 재부팅·docker 재시작이면 trap이 돌지 않는다. 같은 클러스터(`/var/lib/docker`)에 운영 DB 크기만큼을 더 쓴다.
- 수정안: 시작할 때 `liftgram_restore_test_%` 이름의 DB가 있으면 먼저 지운다. `/var/lib/docker` 여유가 덤프 크기의 3배보다 작으면 시험을 건너뛰고 `ok=false detail=low_disk_db`로 남긴다. `pg_restore`에 `--exit-on-error`를 쓴다. 대조 쿼리는 `-d liftgram_restore_test_<ts>`로 연결 대상을 명시한다.

### M-4. `/diag/db`가 Loki를 여는데 「탭으로 세지 않는다」
- 근거: `app/diag/db/page.tsx:39` `await import("@app/core/db")` — 같은 레이아웃이라 AuthProvider·installSync도 돈다. autosave가 켜진 writer인데 잠금을 안 쥐면 보호 밖이다.
- 수정안: 「앱 셸에서만 시작」을 「`@app/core/db`를 여는 모든 문서는 writer 절차를 탄다」로 바꾼다. 정적 페이지·`/sw-nudge.html`만 예외다.

### M-5. 멈춘 탭이 presence 잠금을 쥐고 있어 가져오기가 막힌다
- 근거: `tabGuard.ts:121-131`(presence 공유 잠금 평생 유지) · `acquireImportLock` → `countOtherTabs() > 0`이면 null(194-197).
- 덮개 탭 하나만 남아 있어도 가져오기·되돌리기가 「다른 탭이 열려 있어요」로 거부된다.
- 수정안: 봉인된(dormant) 탭은 presence 잠금을 놓거나(놓을 함수를 보관) 별도 `liftgram-tab-dormant`로 옮긴다. 가져오기 판정은 「쓰기 가능한 다른 탭 수」로 바꾼다. 봉인된 탭은 디스크를 쓰지 못하므로 가져오기에 안전하다(B-2·B-3이 전제).

### M-6. e2e 7.3 「수정 전 빌드 실패」가 **소실**이 아니라 **덮개 없음**으로 실패한다
- 근거: §7.3 시나리오는 `btn-tab-take-over` 누르기에 기대므로, 수정 전 빌드는 버튼을 찾지 못해 실패한다. 그래서 「세트 소실 재현」이 증명되지 않는다.
- 수정안: 덮개와 무관한 **소실 단언**을 따로 둔다. A 저장 → B 열기·저장 → A에서 한 번 더 저장(수정 전에는 가능)한 뒤 두 page를 닫고 **새 page**로 기록 탭의 세트 수를 센다. 수정 전 빌드에서는 B의 세트가 빠져 실패하고, 수정 뒤에는 A의 저장 시도가 덮개로 막혀 B까지 전부 남는다. 이것을 「수정 전 실패」 근거로 보고서에 남긴다.

### M-7. claim과 가져오기 판정의 순서를 못 박을 것
- 근거: §7.1 「가져오기 중이면 claim하지 않는다」 · `startTabGuard`(117-144)는 가져오기 판정을 비동기로 한다.
- 수정안: 새 탭 순서 = presence 잠금 획득 → `isImportRunningElsewhere()` → (아니면) writer steal → claim. presence를 먼저 쥐므로 그 뒤 시작되는 가져오기는 `countOtherTabs`로 거부된다. 순서를 스펙에 적고 단위 테스트를 단다.

### M-8. admin 판정이 15분 낡은 토큰 claim이다 — 개인정보 화면은 DB 역할로
- 근거: 사실 6. admin을 회수해도 최대 15분 동안 /ops(이메일 앞부분·이름·오류)를 볼 수 있다.
- 수정안: `GetOpsStatus`·`GetOpsAlert`는 claim 검사(빠른 거부) 뒤 `users.role`을 다시 읽어 `admin`인지 확인한다. 검사 함수는 moderation처럼 `requireAdmin(viewerID, role)`로 service 안에 두고, service가 connect를 import하지 않는 경계(src/CLAUDE.md §4)를 지킨다. Go 테스트에 「claim은 admin인데 DB는 user → 거부」를 추가한다.

### M-9. (기존 결함 · P4와 같은 원인) 「다른 탭에서 가져오는 중」 탭도 flush로 가져온 행을 덮는다
- 근거: `tabGuard.ts:63-74`는 `pauseSync`만 부른다. 그 탭 화면(ActiveWorkout·CatalogClient)의 `flushOnHide`는 살아 있다(사실 2·3).
- 수정안: P4의 봉인(B-2)을 `setElsewhere("importing")`에서도 부른다. P4 e2e에 「가져오는 탭이 있을 때 다른 탭을 숨겼다 보여도 가져온 행이 남는다」를 넣는다.

### M-10. 프로필 「마지막 로그인」이 실제로는 「마지막 토큰 회전」
- 근거: §6.2 `refresh_tokens max created_at` — 회전(`0018`·`0019`)은 15분마다 새 줄을 만든다.
- 수정안: 라벨을 「마지막 활동(토큰 갱신)」으로 바꾼다. 진짜 로그인 시각이 필요하면 `parent_hash IS NULL`인 줄의 max(created_at)를 쓴다(새 로그인 = parent 없음 · `0019` 주석).

---

## L — 낮음

- **L-1** `flushed:"saved"|"failed"|"nothing"`인데 실제 함수 반환은 `"saved"|"failed"|"unreachable"`(`localDb.ts:45`)이다. 이름을 맞추고, `"unreachable"`일 때 새 탭이 어떻게 하는지(= 새로고침 대신 경고 로그 + 진행)를 정한다.
- **L-2** 0020 SQL은 저장소 관례(`CREATE TABLE IF NOT EXISTS`·대문자·`@plm` 머리말 · 예: `0019_refresh_token_parent.sql`)를 따른다. 인덱스에 이름을 붙인다(`ops_backup_runs_kind_created_idx`).
- **L-3** 보관 행이 하나도 없을 때(daily 없음·restore_test 없음)도 경보 이유로 정의한다(「기록 없음」). 첫 배포 직후 손으로 돌리는 절차가 빠져도 조용하지 않게.
- **L-4** 배포 스크립트의 crontab 확인: 빈 crontab에서는 `crontab -l`이 1로 끝나 `set -e`에 걸린다 → `(crontab -l 2>/dev/null || true)`. 줄은 정확한 문자열 대신 스크립트 경로로 grep해 중복 추가를 막는다.
- **L-5** 탭 바 점: 비admin도 10분마다 `GetOpsAlert`를 부르지 않게 클라이언트에서 role로 먼저 거른다. 확인할 곳: AuthProvider가 role을 들고 있는지. ProfileClient는 `account.role`을 쓴다(`ProfileClient.tsx:352`).
- **L-6** `device_id`가 계정 전환 뒤에도 같아 admin 화면에서 두 계정이 같은 기기임이 드러난다. 보고 때 `sha256(device_id + user_id)` 앞 16자를 보내는 것을 고려한다.
- **L-7** 사진(media) 주간 백업은 결과 기록 대상이 아니다. 스펙에 「이번 범위 밖」이라고 적는다(침묵 실패 예방 원칙상 다음 작업 후보).
- **L-8** 로그인 유도 시트: 「그대로 다시 시작」(`ActiveWorkout.tsx:236-242` onReplayStarted)으로 요약이 닫히면 시트도 함께 닫힌다는 것과, 시트가 뜬 상태에서 휴식 알림음 등 덮개 겹침 순서(z-index · `#modal-root`)를 명시한다.
- **L-9** `count > 3 && lastShownAt == null → true` 경로는 업그레이드 직후 기존 비로그인 사용자의 첫 완료에서 count=1로 시작하므로 거의 쓰이지 않는다. 그래도 단위 테스트에 넣는다. lastShownAt이 미래(시계 되돌림)면 7일 계산이 음수로 영영 안 뜨므로 `lastShownAt > now`는 null로 본다.

---

## 테스트가 수정 전 빌드에서 정말 실패하는가

| 테스트 | 수정 전 실패? | 비고 |
|--------|---------------|------|
| P1 시트 1번째 | 실패(시트 없음) | 정상 |
| P1 띠 1건 | 실패(5건 기준) | H-3대로 「완료 1회」로 바꿔도 실패한다 |
| P3 Go 권한·판정 | 실패(서비스 없음) | 정상 |
| P3 e2e 3회 실패 → /ops | **H-1을 고치지 않으면 수정 뒤에도 불안정** | 쓰로틀 |
| P4 「사라진 것 없음」 | 덮개 없음으로 실패할 뿐, 소실은 증명되지 않음 | M-6 |
| P4 「5초 IndexedDB 불변」 | 숨김 이벤트를 안 일으키면 수정 전에도 통과할 수 있음 | B-2 ④ |
| P4 얼어 있던 이전 주인 | 스펙에 없음 | B-3 ③ 추가 |

## 스펙에 반영할 것(요약 체크리스트)

1. §7.1을 다시 쓴다: autosave 끈 채로 열기 → 넘겨주기 → 켜기(B-1). 「versionId가 다르면 저장 거부 + 봉인」 안전망(B-3). `sealLocalDb()` 한 곳에서 차단(B-2). 다단계 쓰기 장벽(H-4). /diag 포함(M-4). presence 정리(M-5). 순서(M-7). 가져오기 탭에도 봉인(M-9).
2. §8 P4 파일 범위에 `core/src/db/adapter.ts`·`lib/syncTransport.ts`·`lib/prefs.ts`·`lib/appUpdate.ts`(봉인 결과 처리)를 넣는다.
3. §6.3 보고 방아쇠를 「시도 끝남」 기준으로 바꾸고, 서버 stalled 식 = 기기 `isBackupStalled`로 한다(H-1). `first_reported_at`·나이 기반 시각(H-2). 남용 상한(H-5). DB 역할 재확인(M-8).
4. §4.2 띠 조건을 「완료한 운동」 기준으로 하고 `/workout`에서 숨긴다(H-3). SRS-086 수용 기준 문구도 맞춘다.
5. §5.2: EXIT trap·psql 변수(M-1). 백업 때 센 수와 정확히 대조(M-2) — SRS-087 수용 기준 수정. 임시 DB 선청소·디스크 확인(M-3).
6. §7.3 e2e를 보강한다: 새 page에서 소실 단언(M-6) · 숨김 이벤트(B-2) · frozen 탭(B-3).
