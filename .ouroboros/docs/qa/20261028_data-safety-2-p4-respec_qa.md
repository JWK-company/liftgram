# /qa spec (재검토) — P4 다중 탭 rev2 (`spec.md` §11.4)

- 대상: `.ouroboros/docs/spec/20261028_data-safety-2/spec.md` §11.4 (§7 을 대체)
- 이전 검토: `qa/20261028_data-safety-2-spec_qa.md` — B-1~B-3 · H-4 · M-4~M-7 · M-9 · L-1
- 검토일: 2026-10-28 · 코드 기준: `liftgram-wt-safety` 5de8810 (읽기만)
- 전문가 패널
  - **오프라인 우선 웹앱 데이터 무결성 엔지니어** — 넘겨주기 순서, 소실 경로, 부팅 파이프라인·표식, e2e 반증력
  - **브라우저 저장소/LokiJS 내부 전문가** — IncrementalIndexedDBAdapter 트랜잭션, Loki autosave/throttle, Watermelon 어댑터 옵션 경로
- 경로 약어
  - `IIA` = `node_modules/.bun/@nozbe+watermelondb@0.28.0/node_modules/lokijs/src/incremental-indexeddb-adapter.js` (`@nozbe/lokijs@1.5.12-wmelon6`)
  - `LJ` = 같은 패키지 `src/lokijs.wmelon.js` (package.json `main`)
  - `WM` = `node_modules/.bun/@nozbe+watermelondb@0.28.0/node_modules/@nozbe/watermelondb/adapters/lokijs/`

## 판정: **조건부 통과**

방향은 맞다. 「디스크 덮어쓰기는 가장 아래에서 거부한다」를 1순위로 둔 것은 옳고, 이전 지적 B-3·M-4·M-7·L-1은 닫혔다. 다만 아래 B 3건 때문에 **지금 문구대로 execute 하면 안 된다.**
- 안전망을 어디서 어떻게 비교하는지가 정해지지 않았다. 바깥에서 감싸면 경합이 남는다(B-1).
- rev2에서 「B 새로고침」이 빠졌다. 그래서 넘겨주기가 성공해도 새 탭이 **스스로 봉인된다**(B-2).
- 버리는 DB 탭이 공유 localStorage 표식을 망가뜨린다(B-3).

B를 고치는 가장 단순한 방법은 §6(대안)이다. 그 방안을 채택하면 H-1·H-2·M-3 상당 부분이 함께 사라진다. B 반영 뒤 **다시 /qa spec 할 필요는 없다**. execute 첫 checkpoint에서 B-1 구현(트랜잭션 안 비교)을 단위 테스트로 증명하면 된다.

### 이전 지적이 닫혔는가

| 이전 | rev2 | 판정 |
|------|------|------|
| B-1 넘겨주기 전 B의 autosave 덮어쓰기 | autosave:false로 열고 뒤에 enable · runBootPipeline이 writerReady를 기다림 | **부분** — B가 넘겨주기 **전에** 디스크를 읽는다. A의 마지막 flush 뒤 B의 사본이 낡아 첫 저장에서 거부·봉인된다(B-2). enable 핸들이 깨지는 경로도 있다(H-1) |
| B-2 flush 97곳 | `sealLocalDb()` 어댑터 수준 차단 | **부분** — 인스턴스 바꿔 끼우기는 `unsafeResetDatabase` 뒤에 사라진다(H-2). 버리는 DB 탭은 새 구멍을 낸다(B-3) |
| B-3 늦게 깬 이전 주인 | 안전망 1순위 | **방향 닫힘 · 구현 미확정**(B-1) |
| H-4 다단계 쓰기 | 문 닫기 → 장벽 → flush → 봉인 → released | 닫힘(L-3 보충) |
| M-4 /diag/db | 모든 문서가 writer 절차 | 닫힘 |
| M-5 presence | 봉인 탭은 presence를 놓는다 | 닫힘(전제: 봉인이 리셋 뒤에도 유지 — H-2) |
| M-6 e2e 반증력 | ① 덮개와 무관한 소실 단언 | **부분** — ①·③이 수정 전 빌드에서 실제로 실패하지 않거나, 수정 뒤에 거짓으로 실패한다(H-5) |
| M-7 순서 | presence → import 판정 → steal → claim | 닫힘 |
| M-9 가져오는 중 탭 | 봉인 호출 | 닫힘 |
| L-1 이름 | saved/failed/unreachable/deferred/sealed | 닫힘(호출부 처리는 M-1) |

---

## 확인한 사실

1. **비교와 쓰기는 이미 같은 readwrite 트랜잭션 안에 있다.** `IIA:186`에서 tx를 만들고 `IIA:245-258` `getLokiThenSave`가 같은 tx에서 `store.get('loki')`를 읽는다. 같으면 `performSave`(205-221)로 가고, 다르면 slow path `getAllKeysThenSave`(233-243)가 전부 덮어쓰고 남는 청크를 지운다. 같은 store를 쓰는 readwrite tx는 탭 사이에서도 직렬화된다. 그래서 **이 분기 안에서** 거부하면 경합이 0이다. 바깥에서 따로 읽은 뒤 원래 `saveDatabase`를 부르면 두 tx 사이에 창이 생긴다.
2. `_prevLokiVersionId`는 load 성공 때(`IIA:441`)와 save tx **완료** 때(`IIA:210-215` · `oncomplete` 187-193)에만 바뀐다. `deleteDatabase`는 null로 되돌린다(`IIA:773-774`). 실패하거나 중단된 tx는 디스크도 prev도 바꾸지 않는다. 자기 저장끼리는 `LJ:1811-1840` throttle 큐와 `operationInProgress`(`IIA:163-166`)로 겹치지 않는다. **정상 단일 탭의 연속 저장만으로는 거짓 봉인이 나지 않는다.**
3. 어댑터는 사후 알림만 준다. `options.onDidOverwrite`(`IIA:40-42,190-192`)는 이미 덮어쓴 **뒤**에 불린다. `options.onversionchange`(`IIA:569-586`)는 다른 탭이 DB를 지울 때 불리며, 그 뒤 `idb=null`이 되고 다음 저장에서 다시 연다(156-161).
4. **Watermelon 옵션은 참조 그대로 Loki까지 간다.** `WM/index.js:37` `call('setUp',[options])`의 cloneMethod 기본값은 `'immutable'`이다(`WM/dispatcher.js:50`). 거기서 `DatabaseDriver.options` → `newLoki` → `new Loki(dbName, {autosave:true, autosaveInterval:500, ...extraLokiOptions})`(`WM/worker/lokiExtensions.js:96-101`)로 이어진다. `extraIncrementalIDBOptions`도 어댑터 생성자로 간다(53,64). 함수 콜백도 산다. `_testLokiAdapter`가 있으면 그 어댑터를 그대로 쓴다(55-56).
5. `autosave:false`여도 Loki는 `autosaveInterval:500`을 기억한다(`LJ:972-975`). `autosaveEnable()`은 이전 interval을 지우지 않는다(`LJ:1913-1935`). 핸들은 `database.adapter.underlyingAdapter._driver.loki`이다(`WM/index.js:150-153` → `bridge.driver`). **setUp이 끝나기 전에는 없다.**
6. **`unsafeResetDatabase`는 Loki와 어댑터를 새로 만든다.** `WM/worker/DatabaseDriver.js:198-216`에서 `deleteDatabase` → `_openDatabase` → `newLoki(this.options)`(259)로 간다. 앱은 계정 전환 때 이것을 부른다(`core/src/sync/syncOwner.ts:115-117`).
7. autosave의 저장 오류는 조용히 삼켜진다. throttle 경로가 콜백을 늘 넘기기 때문이다(`LJ:1823-1836`). 어댑터가 `getLokiCopy`를 부르기 전에 거부하면 dirty 표시가 남는다(`LJ:1734-1765`). 그러면 500ms마다 재시도한다.
8. 부팅 백필 표식은 **메모리에서 돌린 직후** localStorage에 남는다(`core/src/migrations/runner.ts:59-62`). 디스크 반영을 확인하지 않는다. 소유자·카탈로그 판·동기 건강 표식도 localStorage다(`syncTransport.ts:57-63,83-86,124` · `syncOwner.ts:123-126`). 이 표식들은 **탭 사이에 공유**되고 안전망 밖이다.
9. `installSync()`는 AuthProvider의 effect에서 돈다(`AuthProvider.tsx:124-126`). DB는 그보다 먼저 모듈 평가 때 열리고 load가 시작된다(`database.ts:8-11`). 그래서 steal·claim은 **B의 load가 이미 시작된 뒤**에 일어난다.

---

## B — 차단

### B-1. 안전망의 「저장 직전 비교」 위치를 정해야 한다 — 바깥 감싸기는 경합이 남는다
- 근거: 사실 1·3. §11.4 ①은 「Loki 증분 어댑터의 저장을 감싼다. 저장 직전 디스크의 versionId를 읽어」라고만 적었다. 흔한 구현은 이렇게 된다: 별도 readonly tx로 읽음 → 같으면 원래 `saveDatabase` 호출. 그러면 두 tx 사이에 다른 탭이 커밋할 수 있고, 원래 함수는 그 불일치를 보고 **slow path로 덮어쓴다.** 이 창은 바로 위험한 순간에 열린다. 넘겨주기 중 A의 flush와 B의 첫 저장, 그리고 언 탭이 깨어날 때 양쪽 autosave(500ms)가 같은 시간대에 몰린다.
- `onDidOverwrite`로는 막지 못한다. 이미 지운 뒤에 불린다.
- 수정안: 다음을 스펙에 못 박는다. 「비교와 쓰기는 **같은 readwrite tx** 안에서 한다. 불일치면 `tx.abort()` 뒤 `callback(new Error('LOKI_FOREIGN_WRITE'))`이고, `getLokiCopy`는 부르지 않는다(dirty 보존). slow path는 실행되지 않는다.」 구현은 둘 중 하나로 고른다.
  - (가) `bun patch @nozbe/lokijs` — `IIA:249-252` else 분기를 `options.refuseForeignWrite`일 때 거부로 바꾼다. 몇 줄이면 되고 옵션은 `extraIncrementalIDBOptions`로 넘긴다(사실 4).
  - (나) 앱 코드에서 `saveDatabase`를 포크한 래퍼. 거부 모드에서는 slow path가 필요 없으므로 약 50줄이다. `_putInChunks`는 prototype에서 재사용하고 `idbReq`·`lokiChunkVersionId`만 복제한다.
  - 어느 쪽이든 lokijs 버전(`1.5.12-wmelon6`)을 고정한다. 단위 테스트(fake-indexeddb)도 단다: 「두 어댑터 인스턴스가 같은 DB에 번갈아 저장 → 늦은 쪽이 거부되고 디스크는 앞쪽 내용 그대로」, 「읽기와 쓰기 사이에 다른 인스턴스 커밋을 끼워도 slow path가 0번」.
  - 같은 자리에서 `onversionchange`를 받으면 곧바로 봉인한다(다른 탭이 지웠다). `onDidOverwrite`가 불리면 불변식 위반이므로 오류로 기록한다.

### B-2. rev2에서 B 새로고침이 빠져, 넘겨주기가 성공해도 새 탭 B가 **스스로 봉인된다**
- 근거: 사실 2·9 · §11.4 ②·④.
- 순서: ① B가 모듈 평가 때 디스크 v1을 load하고 prev=v1이 된다. ② B가 steal·claim한다. ③ A가 문 닫기 → 장벽 → flush를 한다. A의 prev=v1=디스크라 fast path로 성공하고 디스크는 v2가 된다(**명시 flush는 바뀐 게 없어도 새 versionId를 쓴다** — `LJ:1811`·`IIA:372`). ④ A가 봉인되고 released를 보낸다. ⑤ B가 `autosaveEnable` 한다. B의 첫 저장에서 디스크 v2 ≠ prev v1 → **안전망이 B를 거부·봉인**한다.
- 결과: 두 탭이 모두 덮개 상태가 되고, B의 메모리에는 A의 마지막 세트가 없다. 안전망이 없었다면 slow path로 A의 마지막 쓰기가 지워졌을 것이다. 원래 §7.1(b)에 있던 「released=saved면 한 번 새로고침」이 rev2 ②에서 「(a)안 버림」과 함께 빠졌다. 그래서 「B가 낡은 사본을 버리는 단계」가 스펙 어디에도 없다.
- 수정안(셋 중 하나를 확정한다. 권장은 (가)+(다)):
  - (가) **load 자체를 넘겨주기 뒤로 미룬다.** `buildAdapter()`가 증분 어댑터를 직접 만들어 래퍼로 감싸고 `_testLokiAdapter`로 넘긴다(사실 4 · `lokiExtensions.js:55-56`). 래퍼의 `loadDatabase`는 `writerReady`(released 수신 · 이전 주인 없음 · 시간 초과)를 기다린 뒤 실제 load를 한다. Watermelon은 setUp 뒤에 모든 질의를 줄 세우므로 화면은 「불러오는 중」일 뿐이다. 그러면 B는 늘 A의 마지막 flush 뒤 디스크를 읽고, 새로고침이 필요 없다. autosave 끄기·`deferred`·`writerReady` 기다리기(②)도 필요 없다. 주의할 점:
    - `_testLokiAdapter`를 쓰면 `isIDBAvailable` 대체 경로(사생활 보호 모드 → 메모리)가 건너뛰어진다. 래퍼 안에서 IDB 열기에 실패하면 메모리로 동작(저장 no-op)하게 복제한다.
    - 래퍼 인스턴스는 `unsafeResetDatabase` 뒤에도 재사용된다(`newLoki(this.options)`가 같은 `_testLokiAdapter`를 받는다). 이것은 H-2에 유리하다.
  - (나) B가 enable 직전에 디스크 versionId를 readonly로 읽는다. prev와 다르면 **한 번 새로고침**한다(sessionStorage 1회 표식 · 새로고침 뒤 같은 절차).
  - (다) 규칙을 하나 추가한다: **writer 잠금을 쥔 탭이 안전망에 거부되면 덮개 대신 1회 새로고침, 잠금이 없는 탭이면 봉인+덮개.** (가)·(나)가 놓친 경합(아래 M-4 늦은 flush)도 이 규칙이 흡수한다.

### B-3. 버리는 DB로 다시 연 봉인 탭이 **공유 localStorage 표식**을 망가뜨린다
- 근거: 사실 8 · §11.4 ③ 「buildAdapter가 표식을 읽어 버리는 DB를 연다」. buildAdapter는 DB만 바꾸고, 셸·AuthProvider·`installSync()`는 그대로 돈다.
  1. `runBootPipeline`이 빈 DB에 백필을 돌리고 `liftgram.boot.*` 표식을 남긴다(`runner.ts:61`). 그러면 진짜 DB의 백필이 영영 건너뛰어진다.
  2. `awaitFirstSync → syncCatalogToLocal`이 빈 DB에 카탈로그를 받고 `liftgram.catalog.revision`을 올린다. 진짜 DB는 카탈로그 갱신을 놓친다.
  3. 로그인 대조 `reconcileAccount`가 빈 DB에서 pending=0을 보고 `wipeFor`로 간다. 이 함수는 버리는 DB를 지우는 데서 그치지 않고 **공유** `OWNER_KEY`·백필 표식·카탈로그 판을 바꾼다(`syncOwner.ts:115-127`). 진짜 DB는 지워지지 않은 채 다른 계정 소유로 표시된다.
  4. 동기 건강 `lastSuccessAt` 같은 store 값도 버리는 DB 기준으로 바뀐다.
  - 스키마 가드 탭(`GUARD_DB_NAME`)에도 같은 구조가 이미 있다. 다만 그 탭은 「새로고침」 화면뿐이고 드물다. 봉인 탭은 흔하다.
- 수정안(둘 중 하나를 확정):
  - (가) **버리는 DB 모드를 없앤다**(§6 권장). 봉인 탭을 새로고침하면 그냥 새 탭이다. 「나중 탭이 이긴다」 규칙 그대로 steal 하고 넘겨받는다. 「여기서 계속하기」 = 새로고침. sessionStorage 표식·동기 판정이 필요 없다.
  - (나) 버리는 DB 모드를 남긴다면, 그 모드에서 `installSync`·`watchSyncTriggers`·부팅 파이프라인·카탈로그 동기·`onLoggedIn` 대조·clientHealth 보고·`resumePendingPrefs`를 **아예 시작하지 않는다**(셸이 덮개만 그린다). 이 판정은 `@app/core/db`의 `isSealedBoot()` 하나에서 한다. 버리는 DB는 `GUARD_DB_NAME`과 다른 이름이나 메모리 어댑터로 둔다(opengym-rir e2e가 `repset-schema-guard`의 존재를 단언한다 — `e2e/opengym-rir.spec.ts:393-396`). sessionStorage는 탭 복제·`window.open` 때 복사된다는 점도 적는다. 복제된 봉인 탭은 봉인 상태로 열린다.
  - (3) 질문에 대한 답: 「동기적으로 고르기」 자체는 된다. `checkSchemaGuardOnBoot`처럼 `buildAdapter()` 안에서 try/catch로 `sessionStorage.getItem`을 하면 된다. 문제는 고르기가 아니라 **고른 뒤 셸이 하는 일**이다.

---

## H — 높음

### H-1. 「autosave 끈 채로 열고 나중에 enable」의 핸들이 두 곳에서 깨진다
- 근거: 사실 4·5·6.
  1. **enable 시점에 Loki가 없을 수 있다.** 넘겨주기가 1.5초 만에 끝나도 큰 DB의 setUp(load+마이그레이션)은 더 걸린다. 그 사이 `findLoki()`는 null(`localDb.ts:25-26`)이고 enable은 조용히 건너뛰어진다. 그 탭은 **autosave 없이 계속 쓴다.**
  2. **계정 전환 뒤 autosave가 영구히 꺼진다.** `wipeFor → unsafeResetDatabase → newLoki(this.options)`가 `autosave:false`로 새 Loki를 만든다. writer 탭이 그 뒤로 명시 flush에만 의존하게 된다.
  3. `autosaveEnable()` 두 번 = interval 두 개(`LJ:1913-1935`).
- 수정안: B-2 (가)를 채택하면 autosave를 기본값(켜짐)으로 두고 이 단계 전체가 없어진다. 남긴다면 「enable = setUp 완료(`database.adapter` 질의 1회 await) 뒤, `autosaveDisable()` 다음 `autosaveEnable()`」로 적는다. `unsafeResetDatabase`를 감싸 reset 뒤 다시 enable하는 것도 적는다. 단위 테스트: reset 뒤 500ms 안에 디스크 반영.

### H-2. 봉인을 「인스턴스 saveDatabase 바꿔 끼우기」로 하면 리셋 뒤 풀린다 · 거부가 스스로 봉인을 부르지 않으면 500ms 재시도 고리
- 근거: 사실 6·7. `sealLocalDb()`가 `driver.loki.saveDatabase`나 `persistenceAdapter.saveDatabase`를 바꾸면 `unsafeResetDatabase` 뒤 새 Loki·새 어댑터에는 없다. 봉인 탭이 리셋할 일은 드물지만, 가져오는 중(M-9) 탭이나 봉인 직전의 계정 전환 같은 경로가 있다. 또 거부된 autosave는 오류가 삼켜지고 dirty가 남아, 500ms마다 디스크를 읽고 거부되기를 반복한다.
- 수정안: 봉인 상태는 **모듈 수준 문(gate) 하나**(`open | sealed`)로 둔다. B-1의 패치·래퍼 어댑터가 저장 진입 때 그 문을 본다(인스턴스가 바뀌어도 같은 문). 안전망 거부는 그 자리에서 문을 `sealed`로 바꾸고, `autosaveDisable()`을 하고, 덮개 이벤트를 낸다. 거부 오류 콜백에 기대지 않는다. `lokiFatalError`(`lokiExtensions.js:149-167`)는 쓰지 않는다. `close()`까지 막아 리셋 경로를 깨뜨린다.

### H-3. 정상 단일 탭 거짓 봉인을 지키는 규칙·테스트가 없다
- 근거: 사실 2는 단일 탭의 **연속 저장**만 보장한다. 아래 경계는 스펙에도 e2e에도 없다.
  - 같은 탭 전체 이동: 새로고침·`appUpdate` 새로고침(`appUpdate.ts:199`)·스키마 가드 새로고침. 옛 문서의 pagehide flush와 새 문서의 load 순서가 걸린다. IDB tx 생성 순서상 안전할 것으로 보이지만 실측이 필요하다.
  - 계정 전환 `wipeFor`(리셋 직후 첫 저장 — prev null·디스크 null).
  - bfcache 복원(같은 탭이 그 사이 앱을 다시 열어 썼다면 거부가 옳다. 다만 문구가 「다른 탭」이면 오해를 산다).
  - 같은 문서 안 Database 인스턴스가 둘인 경우(core는 `../db/database`와 `@app/core/db`를 섞어 import한다 — 심볼릭 링크 해석이 바뀌면 둘이 된다).
  - 깨진 DB load 실패로 prev=null(`IIA:449-451`)이 되는 경우.
- 지금은 이런 일이 생겨도 slow path가 조용히 처리한다. 안전망을 켜면 곧바로 덮개가 뜬다. 혼자 쓰는 사용자에게 「다른 탭」 덮개가 뜨면 P4가 회귀다.
- 수정안: ① B-2 (다) 규칙(잠금을 쥔 탭이 거부되면 1회 새로고침)으로 대부분을 흡수한다. ② 1회 표식이 있는데 다시 거부되면 덮개를 띄우고 문구를 「저장소가 바깥에서 바뀌었어요」로 중립화한다. ③ `database.ts`에 `globalThis.__liftgramDb` 단일 인스턴스 단언(개발 빌드 throw · 운영 console.error)을 둔다. ④ e2e `multi-tab.spec.ts`에 **단일 탭 회귀** 묶음을 넣는다: 저장 직후 새로고침 ×5 · 업데이트 새로고침 · 계정 전환 뒤 저장 · `/diag/db` 왕복 → 덮개 0회, 세트 수 그대로.

### H-4. 부팅 백필 표식이 디스크 반영 전에 찍혀, 거부·새로고침과 만나면 백필이 영영 빠진다
- 근거: 사실 8 · `runner.ts:59-62`. B-2 (나)·(다)처럼 거부된 뒤 새로고침하는 경로가 생기면 순서가 이렇게 된다: 백필 실행(메모리) → 표식 → 저장 거부 → 새로고침 → 표식이 있어 건너뜀 → **디스크에는 백필 결과가 없다.** (지금도 백필 직후 탭을 닫으면 같은 구멍이 있다. P4가 그것을 흔한 경로로 만든다.)
- 수정안: `runBootMigrations`는 각 `m.run()` 뒤 `flushLocalDbResult() === "saved"`를 확인하고 나서 표식을 남긴다. `"sealed"`·`"failed"`면 표식 없이 멈춘다. 백필은 멱등이므로 다시 돌아도 안전하다. 카탈로그 판(`liftgram.catalog.revision`)도 같은 규칙을 따른다. core는 flush를 모르므로 `MarkerStore` 옆에 `persist(): Promise<boolean>`을 꽂는다.

### H-5. e2e ①·③이 「수정 전 빌드 = 소실로 실패 · 수정 뒤 = 통과」를 실제로 보이지 못한다
- ① 「A에서 한 번 더 저장 시도」: 수정 뒤 A는 덮개 아래 `inert`라 Playwright `click`이 actionability에서 시간 초과로 끝난다. **수정 뒤에 테스트가 실패한다.** 시도를 `.catch`로 감싸면 통과하지만 무엇을 증명하는지 흐려진다.
  - 수정안: 쓰기 시도 대신 **A의 저장만 일으킨다.** A에서 `Object.defineProperty(document,'visibilityState',{get:()=> 'hidden'})` + `visibilitychange`·`pagehide`를 dispatch한다. ActiveWorkout의 `flushOnHide`가 낡은 사본을 저장하려 한다. 수정 전 빌드에서는 slow path로 B의 세트가 지워져 **소실로 실패**하고, 수정 뒤에는 거부되어 통과한다. 이 단계 전에 B의 저장이 디스크에 닿았는지(IDB `loki` 청크 versionId 변화 폴링)를 먼저 기다린다. 그렇지 않으면 A가 먼저 쓰고 B가 fast path… 순서가 바뀌어 수정 전에도 통과한다.
- ③ 언 탭: A가 얼기 전에 이미 flush했다면 깨어난 뒤 dirty가 없어 autosave가 돌지 않는다(`LJ:1928`). 그러면 **수정 전 빌드도 통과**한다(반증력 0).
  - 수정안: 깨운 뒤 위와 같은 숨김 이벤트로 A의 flush를 일으킨다. 또는 얼리기 직전 A에 세트를 하나 더 기록하고 flush 전에 얼린다(이 경우 수정 뒤 A의 그 세트는 잃는 것이 정답이다 — 단언을 「B의 세트가 남는다 · A 덮개에 '반영되지 않았어요' 문구」로 둔다).
- 공통: 소실 판정은 새 page에서 기록 탭 화면 대신 **IndexedDB 직접 읽기**(`e2e/helpers/opengym.ts:232-` 패턴)로 세트 수를 센다(화면 렌더 타이밍 배제). 보고서에는 수정 전 빌드 실패 메시지(기대 3 · 실제 2)를 그대로 남긴다.

---

## M — 중간

- **M-1 flush 결과 호출부.** `prefs.ts:146` `flushed !== "failed"`는 `deferred`·`sealed`에서도 쓰기 대기 표식을 지운다. 디스크에 없는데 「끝났다」가 된다. `=== "saved" || === "unreachable"`(옛 동작 유지)로 바꾼다. `appUpdate.ts:288-291`은 `deferred`를 성공으로 보고 새로고침한다. B-2 (가)를 채택하면 `deferred` 자체가 없어진다. 남긴다면 `deferred`는 `fail("flush")`로 처리한다. `flushLocalDb()` boolean(`localDb.ts:36-38`)은 `deferred`·`sealed`에서 true다. 90여 호출부가 「내려썼다」로 읽지만 대부분 클라이언트 이동이라 해가 없다. 이 점을 주석으로 남긴다.
- **M-2 배포 과도기의 옛 번들 탭.** 이 코드가 없는 옛 번들 탭(잠금·안전망 없음)이 열려 있으면 그 탭의 slow path가 새 탭의 기록을 계속 지울 수 있다. 안전망은 **자기 저장만** 지킨다. 수정안: 새 번들은 `hello` 응답에 `writerProto:1`을 싣는다. presence 보유 수가 프로토콜 응답 탭 수보다 많으면 「다른 탭을 새로고침해 주세요」 띠를 띄운다. 릴리스 노트에도 적는다.
- **M-3 B의 기다림(최대 5초) 동안의 화면 쓰기.** rev2 설계(B-2 (나))에서는 B 화면이 이미 그려져 세트 입력을 받을 수 있다. 그 쓰기는 `deferred`였다가 새로고침으로 사라진다. B-2 (가)는 load 전이라 쓰기가 줄을 설 뿐이다. (나)를 고르면 writerReady 전에는 셸에 「다른 탭에서 넘겨받는 중」 얇은 덮개를 둔다.
- **M-4 늦은 flush 경합.** A가 바빠서(긴 작업) 시간 초과 뒤에 claim을 처리하는 경우다. B는 이미 load했다(prev=v1). 그 뒤 A의 flush는 prev=v1=디스크라 **fast path로 성공**한다. 결과로 B가 거부된다. 기록 소실은 없지만(안전망) UX가 깨진다. 수정안: claim에 `deadline`(B의 시계 기준 만료 시각)을 싣고, A가 받은 시점이 deadline을 넘었으면 flush하지 않고 봉인만 한다. 남는 경합은 B-2 (다) 규칙이 흡수한다.
- **M-5 넘겨주기 `released` 이름 공간.** 기존 채널 `liftgram-tabs`의 `Msg` 유니온(`tabGuard.ts:26-32`)에 `claim`·`releasing`·`released`를 더하면, 기존 `hello` 처리(가져오기 화면 재판정)와 섞인다. claim에 `nonce`를 붙이고 released가 그 nonce를 되돌려 주게 한다. 그래야 두 탭이 거의 동시에 열릴 때(steal 연쇄) 다른 claim에 대한 released를 자기 것으로 오인하지 않는다.

## L — 낮음

- **L-1** 안전망 거부 로그에 `prev`·`disk` versionId와 `document.visibilityState`, 그리고 writer 잠금 보유 여부를 남긴다(거짓 봉인 원인 추적).
- **L-2** `document.prerendering` 중에는 writer 절차를 시작하지 않는다. `prerenderingchange` 뒤에 시작한다(주소창 미리 렌더가 잠금을 뺏지 않게).
- **L-3** H-4의 「새 write 거부 문」은 Watermelon에 공개 API가 없다. `database.write`를 감싸는 방식이 되므로, `database.write` 밖의 쓰기(`database.localStorage.set` — 동기 커서)도 덮는지 확인 목록에 넣는다. 장벽 `await database.write(async()=>{})`는 문을 닫은 **뒤에** 걸어야 앞선 작업만 기다린다. 디스크는 어차피 문(gate)이 지킨다. 이것은 반쯤 된 다단계 동작의 정합성 문제다.
- **L-4** Web Locks `steal`은 Safari 15.4+·Chromium 69+(삼성 인터넷 포함)에서 지원된다. 미지원이면 BroadcastChannel만 쓰고, 둘 다 없으면 **안전망만으로** 동작한다(fail-open이 아니라 「먼저 저장한 쪽이 이기고 진 쪽은 봉인」). 이 점을 스펙 문구에 반영한다. 기존 「둘 다 없으면 막지 않는다」는 안전망 덕에 더 안전해졌다.

---

## (6) 더 단순한 대안 — 권장

**안전망이 기록 소실을 막고, 잠금·claim은 UX(진 탭이 다음 동작 하나를 잃지 않게)만 맡는다.**

1. **트랜잭션 안 비교·거부**(B-1) + **모듈 수준 문**(H-2). 이것만으로 「이미 디스크에 있는 기록이 다른 탭 때문에 사라지는 일」은 모든 경로에서 0이 된다. 잃을 수 있는 것은 진 탭이 메모리에만 들고 있던 마지막 변경뿐이고, 덮개 문구로 알린다.
2. **거부 처리 규칙 하나**: writer 잠금을 쥔 탭이면 1회 새로고침, 아니면 봉인+덮개(B-2 (다) · H-3).
3. **잠금**: 문서가 열리면 곧바로 steal한다. 빼앗긴 탭은 best-effort flush 한 번(안전망 덕에 안전 — 이미 새 탭이 썼으면 거부될 뿐) → 봉인 → 덮개. released 기다리기는 **선택 최적화**다. 넣는다면 B-2 (가)처럼 load를 미루는 형태로만 넣는다. 그러면 autosave 끄기·`deferred`·`writerReady`·5초/1.5초 두 시간이 모두 필요 없다.
4. **봉인 탭 새로고침 = 새 탭**(B-3 (가)). 버리는 DB·sessionStorage 표식이 없다. 「여기서 계속하기」 = 새로고침.
5. **표식은 저장 확인 뒤**(H-4).

잠금 없이 안전망만 두면 「먼저 저장한 탭이 이기고 다른 탭은 다음 저장에서 봉인」이 된다. 그러면 사용자가 지금 보고 있는 새 탭이 질 수 있다. 그래서 steal은 남기되 정확성의 근거로 쓰지 않는다. e2e는 H-5대로 바꾸고, 가져오기 탭(⑤)·넘겨받기 왕복(④)은 그대로 둔다.

## 수정 전 빌드 반증력 (재평가)

| e2e | rev2 문구대로 | H-5 반영 뒤 |
|-----|---------------|-------------|
| ① 소실 단언 | 수정 뒤 `inert` 클릭 시간 초과로 실패 | 숨김 flush 방아쇠 → 수정 전: B 세트 소실로 실패 · 수정 뒤: 통과 |
| ② 숨김 뒤 IDB 불변 | 정상(이전 B-2 ④ 반영) | 같음 |
| ③ 언 탭 | 깨운 뒤 dirty 없음 → 수정 전에도 통과 | 깨운 뒤 flush 방아쇠 → 수정 전 실패 |
| ④ 넘겨받기 왕복 | 수정 전: 덮개 없음으로 실패(소실 증명 아님) | 같음(UX 테스트로 분류) |
| ⑤ 가져오기 탭 | 정상 | 같음 |
| (신규) 단일 탭 회귀 | 없음 | H-3 ④ — 수정 전·뒤 모두 통과해야 한다(거짓 봉인 감시) |
