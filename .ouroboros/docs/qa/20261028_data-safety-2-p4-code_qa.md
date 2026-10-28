# /qa code — P4 다중 탭 기록 덮어쓰기 방지 (SRS-089)

- 대상: worktree `/Users/woobi/Desktop/tarae/liftgram-wt-tabs` · `feat/multi-tab-rebased` · `e231a56..029ee13`(9306531·49d6521·76cd6c5·20e85ee·029ee13)
- 기준: spec `20261028_data-safety-2/spec.md` §11.5(rev3) · 검토 이력 `20261028_data-safety-2-spec_qa.md`·`…-p4-respec_qa.md` · 구현 보고 `report/_work/20261028_p4_execute.md`
- 검토 역할: **오프라인 우선 웹앱 데이터 무결성 엔지니어** · **브라우저 저장소(LokiJS·IndexedDB) 전문가**
- 코드 수정 없음. 실측: 로컬 운영 빌드 `http://127.0.0.1:3200`(격리 브라우저 문맥 1회) · `bun run test:core` 3회 반복

## 판정: **조건부 통과 (H 0 · M 5 · L 7)**

소실 방지의 핵심인 패치와 쓰기 문은 맞게 만들어졌다. 비교와 중단이 한 readwrite 트랜잭션 안에서 일어나고, 거부할 때 getLokiCopy 를 부르지 않아 dirty 가 남는다. 콜백은 한 번만 불리고, 빈 DB·리셋·삭제 경로에서 `_prevLokiVersionId` 도 맞다. 운영 Docker 빌드에도 패치가 들어간다. 이미 디스크에 있는 기록을 이 변경이 지우는 경로는 찾지 못했다.
남은 것은 다음 두 갈래다.
- 혼자 쓰는 사용자에게 거짓 덮개나 거짓 새로고침이 뜨는 경로 2건. 하나는 앱을 iframe 으로 띄우는 경우로 실측으로 확인했고(M-1), 다른 하나는 주소창 미리 렌더다(M-2).
- 배포 과도기의 옛 번들 탭(M-3). 패치 전에는 대개 "앞에서 쓰는 탭"이 이겼는데, 이제는 "뒤에 숨은 옛 탭"이 이긴다. 크기가 바뀐 위험이다.

M-1·M-3 은 **배포 전에 조치**하기를 권한다. 둘 다 몇 줄이면 된다.

---

## 1. 패치 정확성 — 확인 결과(문제 없음)

| 점검 | 근거 | 결과 |
|---|---|---|
| 트랜잭션 안 비교 | `incremental-indexeddb-adapter.js:266-299` — `store.get('loki')` 성공 콜백(같은 readwrite tx) 안에서 비교하고, 다르면 `tx.abort()` | 경합 창 없음. 동시 저장 단위 테스트도 「하나만 이김」 |
| 거부 시 dirty 보존 | `getLokiCopy` 를 부르지 않음. lokijs 코어 `saveDatabaseInternal` 은 getLokiCopy 안에서만 dirty 를 비운다(`lokijs.wmelon.js:1736-1770`). `ignoreAutosave` 는 콜백에서 false 로 되돌린다 | 맞음 |
| finish 이중 호출 | 거부 모드에서만 `finished` 가드를 두고, abort 이벤트에도 `staleError` 를 넘긴다. `onForeignWrite`(봉인)는 abort 이벤트(비동기)보다 **먼저** 동기로 불린다 → 콜백이 받는 시점엔 이미 봉인 상태라 `classifyFlushError` 가 "sealed" 로 분류 | 맞음 |
| 첫 저장(빈 DB) | 로드에 청크가 0개면 `finish(null)` 이라 prev 가 null 그대로이고, 디스크 loki 청크도 없어 null. 같으므로 fast path | 맞음 |
| 로드 직후 prev | `_getAllChunks` 의 한 트랜잭션 스냅샷에서 `loki.idbVersionId` 를 읽는다(`:483`) | 맞음 |
| 계정 전환 리셋 | Watermelon `newLoki(this.options)` 가 같은 `extraIncrementalIDBOptions` 객체로 새 어댑터를 만든다(`lokiExtensions.js:62-64`). prev=null · 빈 DB. 자기 연결을 먼저 닫으므로(`:815-820`) 자기 자신에게는 versionchange 가 오지 않는다 | 맞음(단위 2건 + e2e ④-2) |
| 삭제 경로 | 봉인 탭은 `{success:false, code}` 를 받고, Watermelon `deleteDatabase` 가 reject 한다 → 봉인 탭의 리셋이 공유 DB 를 지우지 못한다. 다른 탭이 지우면 `onversionchange` 로 봉인. 핸들러가 없어도 다시 열린 빈 DB 와 비교해 STALE | 맞음 |
| useWebWorker:false | 옵션 객체가 structured clone 을 거치지 않고 참조 그대로 간다 → 함수 옵션이 살아 있다 | 맞음(워커 모드로 바꾸면 깨진다 — 주석 권장, L-7) |
| Docker | `Dockerfile:67` `COPY patches` 가 `bun install`(`:68`) 앞에 있다. `.dockerignore` 는 patches 를 빼지 않는다. 로컬 설치본은 `.bun/@nozbe+lokijs…` 와 호이스트된 `node_modules/lokijs` **둘 다** 패치 반영(각 11곳), Watermelon 의 `lokijs` 심링크도 패치본을 가리킨다 | 적용됨. 다만 실패를 조용히 넘기는 문제는 L-1 |

---

## M (배포 전 조치 권장 = M-1·M-3)

### M-1 앱을 iframe 으로 띄우면 쓰기 주인을 빼앗는다 → 혼자 쓰는 사용자의 업데이트 흐름에 거짓 덮개 (**실측**)
- 근거: `frontend/lib/tabGuard.ts:137-190`(`startTabGuard` → `claimWriter` 를 막는 조건 없음) · `lib/swActivate.ts:41-60`(업데이트 중 숨은 iframe 으로 `/sw-nudge.html`) · `public/sw.js:127-155`
  - `sw.js` `page()` 의 내비게이션 처리: 3초 넘게 걸리거나 오프라인이면 캐시를 찾고, 없으면 **`/offline` 앱 셸**을 돌려준다. `/sw-nudge.html` 은 한 번 성공해야 캐시에 남으므로, 첫 nudge 가 느린 망이거나 오프라인이면 iframe 안에 **앱 전체**(root layout → AuthProvider → installSync → startTabGuard)가 뜬다.
- 실측(3200 · 격리 문맥 · 탭 하나): 같은 출처 iframe 으로 `/offline` 을 붙이자 iframe 은 `tabWriter=owner` 가 되고, 본 탭은 `lost` 로 바뀌며 덮개 `tab-elsewhere` 가 떴다(`{"w0":"owner","inner":"owner","after":"lost","overlay":true}`). 그 iframe 은 Loki 를 열고 부팅 파이프라인으로 디스크에도 쓴다.
- 영향: 수동 업데이트(SRS-085)를 누른 사용자에게 「다른 탭에서 열려 있어요」가 뜬다. 활성화가 끝내 안 되면 덮개에 갇힌다(「여기서 계속하기」로 풀린다). 혼자 쓰는 사용자 회귀다(스펙 §11.5-5 위반). 디스크 소실은 아니다.
- 수정안:
  - ① `startTabGuard` 맨 앞에서 `if (window.top !== window) { sealLocalDb(...) 또는 DB 를 열지 않음; return; }` 로 막는다. 최소한 `claimWriter` 는 하지 않는다.
  - ② `sw.js` 에서 `/sw-nudge.html` 은 오프라인 대체 없이 네트워크만 쓰거나 PRECACHE 에 넣는다.
  - ③ 앱 문서가 프레임 안이면 DB 를 열지 않는다(가장 견고).
  - e2e: 본 탭에서 `/offline` iframe 을 붙였다 뗀 뒤 덮개 0·봉인 로그 0.

### M-2 주소창 미리 렌더(prerender)된 문서가 DB 에 쓴다 → 열려 있던 주인 탭이 거짓 STALE 로 새로고침
- 근거: `tabGuard.ts:187-189` 는 미리 렌더 중 **잠금 빼앗기만** 미룬다. 그런데 `syncTransport.ts:57` `runBootPipeline`(시드 top-up·백필 쓰기)과 Loki 로드·autosave 는 미리 렌더 중에도 돈다.
- 시나리오: 앱 탭 M 이 열린 채 사용자가 주소창에 주소를 입력한다 → Chrome 이 미리 렌더 문서 P 를 띄운다. P 는 패치본이라 P 가 먼저 저장하면 디스크 versionId 가 바뀐다. M 의 다음 저장이 STALE 이 되고, M 은 주인이므로 **1회 새로고침**한다. M 의 메모리에만 있던 마지막 변경(≤500ms 분량, 입력 중이던 세트)을 잃는다. 반대로 M 이 먼저 저장했으면 P 가 거부·봉인되고 무해하다.
- 사용자가 실제로 자주 가는 사이트일수록 미리 렌더가 잘 일어난다. 데스크톱 상시 사용자에게 무작위 새로고침으로 나타난다.
- 수정안:
  - `document.prerendering` 이면 활성화(`prerenderingchange`) 전까지 `closeLocalDbWrites()` 와 같은 **되돌릴 수 있는** 문(쓰기 금지)을 걸고, 패치 `isSealed` 도 그 상태를 보게 한다. 부팅 파이프라인·동기도 그 뒤로 미룬다.
  - 또는 `<head>` 에 Speculation Rules 로 앱 경로의 prerender 를 끈다(`prerender` 대신 `prefetch`).
  - 실측 e2e 는 어렵다 — 최소한 미리 렌더 중 쓰기 0 을 단위로 확인한다.

### M-3 배포 과도기 옛 번들 탭 — 패치 뒤에는 「숨은 옛 탭이 항상 이긴다」 (구현 보고 M-2 미구현)
- 근거: 패치는 자기 저장만 지킨다. 옛 탭 O 는 slow path 를 그대로 가지고 있다.
- 변화의 크기:
  - 패치 전에는 앞에서 쓰는 탭 B 와 옛 탭 O 가 서로 덮어썼다. 대개 활동 중인 B 가 마지막에 써서 **B 의 입력이 살아남았다**.
  - 패치 후: O 가 dirty 일 때 slow path 로 B 의 세트를 지운다(B 의 마지막 동기 이후 분). B 는 다음 저장에서 STALE 이 되어 **1회 새로고침하고, O 가 덮어쓴 디스크를 그대로 받아들인다**. 60초 안에 또 거부되면 `external` 덮개에 머문다.
  - O 가 dirty 가 되는 계기는 주로 백그라운드 동기 pull·타이머 쓰기다. 로그인 사용자라면 B 가 이미 push 한 것은 이후 pull 로 되돌아온다. 하지만 **push 전 변경과 비로그인(동기 없음) 사용자의 기록은 영구 소실**된다.
- 수정안(작다 · 옛 프로토콜을 그대로 이용):
  - 옛 번들 tabGuard 는 채널 `liftgram-tabs` 의 `import-start` 를 받으면 `pauseSync` 와 함께 전체 화면 안내를 띄우고, 다시 none 으로 돌아오지 않는다. 그러면 옛 탭은 새 쓰기를 만들지 않아 사실상 얼어붙는다.
  - 새 번들은 부팅할 때 `ping` 을 보낸다. `proto` 필드 없이 `pong` 을 돌려주는 탭(옛 번들)이 있거나, presence 보유 수가 proto 응답 수보다 많으면 `{t:"import-start", legacyFreeze:true}` 를 한 번 보낸다. 새 번들은 `legacyFreeze` 를 무시한다.
  - 함께 「다른 탭을 새로고침해 주세요」 띠도 띄운다(spec 재검토 M-2 원안).
  - 릴리스 노트 안내만으로는 부족하다. 모바일 PWA 는 며칠씩 메모리에 남는다.

### M-4 bfcache 복귀 즉시 새로고침이 메모리의 미저장 변경을 버린다
- 근거: `tabGuard.ts:177-179` `pageshow.persisted → location.reload()`.
- 영향: Safari(WebKit)는 Web Lock·BroadcastChannel 을 쥔 문서도 bfcache 에 넣을 수 있다. 운동 중 같은 탭에서 바깥 링크로 나갔다가 「뒤로」 오면, pagehide 내려쓰기가 얼기 전에 끝나지 못했을 때 그 메모리 변경(≤500ms)을 그대로 버린다. 디스크에 있던 기록은 안전하다.
- 수정안: `persisted` 이면 `await flushLocalDbIfDirty()` 를 한 뒤 새로고침한다. 그사이 다른 탭이 썼다면 패치가 STALE 로 거부하므로 덮어쓸 위험이 없다. 봉인 탭은 곧바로 새로고침해도 된다.

### M-5 넘겨주기 다단계 쓰기 절단 + 「sealed=true」 이동 호출부
- 근거:
  - `localDb.ts:43`(`flushLocalDb()` 은 sealed 에서도 true)
  - `ActiveWorkout.tsx:614-622`(완료 흐름: `completeWorkout` → `settleUndecidedPlateOneSide` → flush → 요약 표시)
  - `tabGuard.ts:345`(문 닫기)
- 영향:
  - 완료 도중 주인을 빼앗기면 이미 끝난 write 만 내려쓰이고, 다음 단계는 `LocalDbSealedError` 로 거부된다. 플레이트 정착은 `.catch` 로 삼켜진다.
  - 그런데 `flushLocalDb()` 이 true 를 돌려주므로 화면은 「완료 요약」으로 넘어간다(덮개 뒤). 세트 기록은 지켜지고, 잃는 것은 부속 단계뿐이다.
  - 다만 사용자가 덮개 뒤에서 본 요약(PR 축하 등)은 새 탭에서 일부 다르게 보일 수 있다.
  - 백업 가져오기(`backupFile.ts:27`)·`ImportCard` 되돌리기의 flush 도 같은 패턴이다. 봉인 탭에서는 write 가 먼저 거부되어 예외가 나므로 거짓 성공 문구는 나오지 않는다(확인함).
- 수정안:
  - 완료 흐름처럼 **사용자에게 결과를 보여 주는** 호출부는 `flushLocalDbResult()` 를 쓰고, "sealed" 면 요약 대신 아무것도 하지 않는다(덮개가 이미 있다).
  - 또는 `completeWorkout`+정착을 한 write 로 묶는다.
  - 90여 이동 호출부는 지금 그대로 둬도 된다(주석 근거가 타당하다).

---

## L

- **L-1 Docker 설치 실패를 조용히 넘김** — `Dockerfile:68` `bun install --frozen-lockfile 2>/dev/null || bun install`. frozen 설치가 실패하면 lock 을 다시 풀고 진행한다. 해결 결과가 달라지면(예: lokijs 버전이 바뀜) 패치 키(`@nozbe/lokijs@1.5.12-wmelon6`)가 맞지 않아 **패치 없이 빌드**될 수 있다. 수정안: 설치 뒤 `RUN grep -q rejectForeignWrites node_modules/lokijs/src/incremental-indexeddb-adapter.js` 처럼 실패하면 멈추는 단언을 둔다. 런타임에도 `/diag/db` 에서 `IncrementalIDBAdapter.prototype.saveDatabase.toString().includes('LOKI_STALE')` 를 표시한다.
- **L-2 스키마 가드(다운그레이드) 문서도 쓰기 주인을 빼앗는다** — `adapter.ts:21-35` 가드 경로에서도 `startTabGuard` 가 claim 한다. 옛 캐시 번들을 연 탭이 새 번들 탭을 덮개로 만든다(그 탭은 「새로고침 필요」만 보인다). 수정안: `guard.blocked` 면 claim 하지 않는다.
- **L-3 백필 표식 `persist` 가 "unreachable" 을 실패로 본다** — `syncTransport.ts:64-67`(`=== "saved"`). 카탈로그(`catalogSync`)·prefs 는 unreachable 을 통과로 보는데 여기만 다르다. 어댑터 구조가 바뀌면 백필이 부팅마다 다시 돈다(멱등이라 비용만 든다). 같은 규칙으로 맞추거나 의도를 주석으로 남긴다.
- **L-4 Web Locks 없는 브라우저에서 동시에 열린 두 탭은 서로의 claim 을 받아 둘 다 lost** — `tabGuard.ts:114-117`. 자기 claim 시각을 싣고 나중 것만 이기게 한다(`{t:"claim", at}` 를 비교하고 같으면 tabId 로 결정).
- **L-5 거부 뒤 새로고침 고리 방지가 sessionStorage 에만 기댄다** — `tabGuard.ts:363-401`. 표식을 못 쓰는 환경은 덮개로 처리하니 안전하다. 다만 60초가 지나면 외부 writer(M-3 옛 탭)가 계속 쓸 때 **60초마다 새로고침**이 반복될 수 있다. 무한은 아니지만 사용자 체감은 고리다. 같은 탭의 연속 거부 횟수(예: 3회/10분)로 덮개로 넘어가게 한다.
- **L-6 e2e 의 범위**
  - ① 은 쓰기 주인 steal 로 A 가 먼저 봉인되므로 패치의 `isSealed` 진입 거부를 잰다. `LOKI_STALE` 분기 자체는 ②(언 탭)와 core 단위가 잰다 — 구성은 타당하다.
  - 「수정 전 실패」 근거는 두 겹이 모두 없는 운영 빌드에서 잰 것이다. 패치만 되돌린(steal 은 유지) 빌드에서도 ②가 실패하는지 1회 확인하면 「패치가 일을 한다」는 근거가 더 단단해진다.
  - ④ 는 `serviceWorkers: "block"` 이라 실제 skip-waiting·nudge iframe(M-1)·bfcache·prerender 를 재지 않는다.
  - IndexedDB 직접 읽기(`디스크_무게`·`디스크_버전`)는 읽기 전용 연결이라 결과에 영향이 없다 — 타당하다.
- **L-7 주석·경고**: `adapter.ts` 에 「`useWebWorker:true` 로 바꾸면 함수 옵션이 복제되지 않아 안전망이 꺼진다」를 남긴다. `database.ts` 의 이중 인스턴스 경고는 운영에서 봉인으로 이어진다 — /diag 에 노출하면 좋다.

---

## 8. core 테스트 「Unable to deserialize cloned data」 간헐 실패

- 재현 시도: `node --import tsx --test core/src/domain/__tests__/*.test.ts` 3회 → 534/534 통과 3회, 해당 메시지 0회(재현 안 됨).
- 원인 판단(가장 유력, 확정 아님):
  - 이 메시지는 V8 ValueDeserializer 의 오류다. 테스트 안에서 IDB 에 넣는 값은 `{key, value: 문자열}` 뿐이다. fake-indexeddb 의 `structuredClone` 이 결정적으로 실패할 데이터가 아니므로, 간헐이라는 점과 맞지 않는다.
  - 남는 후보는 **node:test 러너의 프로세스 간 보고 채널**이다. 파일마다 자식 프로세스가 돌고, 결과를 v8 직렬화로 stdout 에 실어 보낸다. 이 파일은 Watermelon 로거가 `[🍉] [Loki] …` 를 **stdout** 에 대량으로 찍는다(실측: 12건 테스트에 수십 줄 · 4바이트 이모지 포함). 전체 실행에서는 자식 여럿이 동시에 돌아 파이프 조각이 잘게 쪼개진다. 그때 부모가 직렬화 프레임과 일반 출력을 섞어 읽으면 이 오류가 난다(Node 22 러너의 알려진 부류).
  - 부차 요인: 테스트가 연 「탭」(Loki·IDB 연결)을 닫지 않아(`openTab`·`diskSets`) 프로세스가 끝날 때 fake-indexeddb 예약 작업이 남는다.
- 처방:
  1. 테스트 머리에서 Watermelon 로거를 끈다(`import logger from '@nozbe/watermelondb/utils/common/logger'; logger.silence()`). Loki `verbose` 출력도 `console.log` 스텁으로 막는다 → stdout 을 직렬화 채널 전용으로.
  2. `openTab`/`diskSets` 가 쓴 Loki 를 `close()` 하고 어댑터 `idb.close()` 한다. `test.after` 에서 남은 연결도 정리한다.
  3. 그래도 나오면 IDB 테스트만 `--test-concurrency=1` 로 따로 돌리는 스크립트(`test:core:idb`)로 분리한다.
  4. 다음에 실패하면 **전체 출력**(오류가 테스트 본문 스택인지, 러너 `runner.js` 스택인지)을 남긴다 — 이것으로 확정한다.

---

## 요약 표

| ID | 등급 | 한 줄 | 배포 전 |
|---|---|---|---|
| M-1 | M | iframe(/offline 대체 셸)이 쓰기 주인을 빼앗아 업데이트 중 거짓 덮개 — 실측 | 권장 |
| M-2 | M | 주소창 미리 렌더 문서의 부팅 쓰기 → 주인 탭이 거짓 STALE 새로고침 | 권장(Speculation Rules 로 간단히) |
| M-3 | M | 옛 번들 탭이 항상 이김 — 옛 프로토콜 `import-start` 로 얼리기 | 권장 |
| M-4 | M | bfcache 복귀 즉시 새로고침이 미저장 변경을 버림 → 내려쓰기 뒤 새로고침 | 선택 |
| M-5 | M | 완료 흐름이 sealed 를 성공으로 보고 요약으로 넘어감(소실 아님) | 선택 |
| L-1~7 | L | Docker 단언 · 가드 문서 claim · persist unreachable · 채널 동시 claim · 60초 반복 · e2e 범위 · 주석 | 후속 |
