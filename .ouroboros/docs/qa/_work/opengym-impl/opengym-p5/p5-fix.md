<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# openGym P5 /qa code 조치 결과 (2026-10-27)

## 커밋
- `f51aa15` fix(opengym): P5 /qa code 조치 — 다른 탭 열림 시 가져오기 차단·원래 순번 id·가져온 행 삭제 표시 보호 외
- 브랜치 feat/opengym-p5(d6ddf73 위). push·merge·배포 안 함. 경로를 지정해 add 함(`lefthook.yml`·`.ouroboros-work/` 는 넣지 않음).
- 로컬 스키마 v26 그대로다(칸 추가 없음). 공용 ui 파일(components/ui/*)은 건드리지 않았다.

## 지적별 처리

| # | 처리 | 내용 |
|---|---|---|
| P5-1 | 고침 | 다른 탭 가드 · 아래 따로 |
| P5-2 | 고침 | pull 보호 필터. 1.1초 대기·재동기는 주석으로 걷음 |
| P5-3 | 고침 | 종목 줄 id = 파일 안 원래 순번(빠진 줄도 센다). 세트 id 는 원래도 원래 세트 순번이었다 |
| P5-4 | 고침 | 바닥 막대에 미확인 수 + 누르면 한 번 묻는 확인창 |
| P5-5 | 고침 | 운동 0개 파일은 확인 단계에서 막음 · 전부 skip 이면 시작 막음 · 결과 문구를 건너뛴 이유로 고름 |
| P5-6 | 고침 | 실패 주입은 e2e 빌드(`NEXT_PUBLIC_E2E_FAULTS=1`)에서만. 운영 빌드에는 코드가 없음(번들 grep 0) |
| P5-7 | 고침 | 같은 묶음 id → `ImportBlockedError('import_in_progress')`. 정리 경로를 타지 않음 |
| P5-8 | 고침(a) | 쓰기·지우기 묶음 2000 → 1000행 |
| P5-9 | 고침 | 진행 중 뒤로 → 「저장 중에는 나갈 수 없어요」 · 진행 라벨 `aria-live` · 단계가 바뀌면 단계 머리로 초점 |
| P5-10 | 고침 | 파일 30MB 상한 · Worker 가 한 번이라도 말했으면 침묵 판정 15초 → 60초 |
| P5-11 | 고침 | 지울 운동 0 ∧ 묶음 workout_count>0 → 「다른 기기에서 다시 가져간 기록」 안내 후 확인해야 undone |
| P5-12 | 고침 | 되돌리기 경고에 RPE·RIR 등 고친 세트와 이름·메모를 고친 운동을 포함 |
| P5-13 | 정보 | 할 일 없음. 원본은 새 코드 어디에도 싣지 않는다 |

### 세부
- **P5-3** (`core/domain/import/plan.ts`)
  - `importWorkoutExerciseId(wid, peIndex)`: `pw.exercises` 안의 원래 index 를 쓴다.
  - `sort_order` 는 가져온 줄 순번(0..n-1, 빈 자리 없음) 그대로다. 기록 화면의 「종목 추가」가 `count` 를 sort_order 로 쓰기 때문이다.
  - 테스트(`importPlan.test.ts` P5-3)
    - 전부 가져오기 vs 벤치·스쿼트 skip → 공통 줄의 id·종목·세트 id·세트 값이 같다.
    - 남은 줄은 `-e1` 이다.
    - 같은 결정 두 번 → 같은 id 집합.
- **P5-2** (`core/sync/importPullGuard.ts` + `syncEngine.pullChanges`)
  - 원격 `deleted` 가운데 다음을 모두 만족하는 것은 적용하지 않는다.
    - 표: workouts·workout_exercises·set_logs·exercises·import_aliases
    - id 가 `imp-|cx-|ia-` 로 시작한다.
    - 로컬 행이 `_status='created'` 다.
  - 같은 동기의 push 가 그 행을 올리고, 서버 upsert 가 deleted=false 로 되살린다. 서버 성질은 기존 Go 테스트 `push_idempotency_test` ②가 이미 고정한다.
  - 테스트(`importPullGuard.test.ts` · 실제 WatermelonDB)
    - created 가져온 행 5표: 남고 push 된다.
    - synced 가져온 행, 앱 행(synced·created): 지금처럼 지워진다(기존 동작 불변).
    - 보호를 빼면 실패하는 것도 확인했다.
  - D-2 e2e(새 기기 재가져오기 60개)는 1.1초 대기 없이도 통과한다.
- **P5-12**: 판정은 아래 셋 중 하나다. updated_at 기준이라 사람 말고 시스템이 쓴 경우도 센다. 다만 가져온 완료 운동·세트에 쓰는 부팅·동기 쓰기는 지금 없다.
  - `user_edited`
  - `rir != null`(가져온 세트는 늘 null)
  - `updated_at > created_at`(가져오기는 둘을 같게 쓴다)

## P5-1 다른 탭 가드 — 구조
- `frontend/lib/tabGuard.ts`
  - Web Locks
    - 탭마다 공유 잠금 `liftgram-tab` 을 평생 쥔다. `locks.query()` 의 held 수 − 1 = 다른 탭 수.
    - 가져오기·되돌리기는 배타 잠금 `liftgram-import` 를 시작부터 flush·동기 재개까지 쥔다.
  - BroadcastChannel `liftgram-tabs`
    - hello/bye 알림: 가져오기 화면이 곧바로 다시 판정한다. 알림을 놓칠 때를 위해 3초마다도 본다.
    - import-start/end 알림.
    - Web Locks 가 없는 브라우저는 ping→pong(250ms, 답에 「가져오는 중」을 싣는다)으로 대신한다.
  - 둘 다 없으면 막지 않는다(fail-open).
- core 쪽 갈고리는 `core/data/importTabGuard.ts`(`installImportTabGuard`) 다.
  - `checkImportReadiness` → `other_tab`
  - `importPlan`·`undoImportBatch` → 잠금을 쥐고 혼자인지 다시 센다. 아니면 `ImportBlockedError('other_tab')`.
  - `write_failed_reload` 에서는 잠금을 새로고침 때까지 쥔다. 그래야 새 탭이 반쯤 쓴 묶음을 건드리지 않는다.
- 가져오는 중에 새로 연 탭
  - 부팅 파이프라인이 처음에 `isImportRunningElsewhere()` 를 묻는다. 참이면 파이프라인 전체를 건너뛴다. 부팅 정리뿐 아니라 시드·정규화·체중 미러 쓰기도 하지 않는다.
  - `cleanupUnfinishedImports` 도 writing 묶음이 있으면 한 번 더 묻는다.
  - 그 탭은 동기를 멈추고(풀지 않음) `ImportElsewhereNotice` 를 띄운다. 화면 전체를 덮고 뒤 화면은 inert 다.
  - 다른 탭이 끝나면 문구가 「끝났어요 — 새로고침」으로 바뀐다.
- ImportCard 되돌리기: 확인창 전에 다른 탭 수를 보고 막는다.

## 검증
- `bun run test:core` 481/481. 새 테스트: P5-3 1건, pull 보호 2건.
- tsc(frontend·core) 오류 0. biome(바꾼 파일) 깨끗.
  - `frontend/app/components/ui/quiet.tsx:154` 의 useOptionalChain 지적은 원래 있던 것이고 공용 ui 라 손대지 않았다.
- `make verify`(src) exit 0.
  - 설정 접근 규칙 때문에 e2e 깃발을 `frontend/lib/e2eFlags.ts` 하나로 모았다.
  - `scripts/check-docs.mjs` ALLOW 에 이유와 함께 넣었다.
  - `next.config.ts` 의 `env` 로 번들에 상수를 박는다. Turbopack 이 `process.env.NEXT_PUBLIC_*` 를 lib 파일에서 접지 않은 일이 있었다.
- 3500/3501 운영 빌드(`NEXT_PUBLIC_E2E_FAULTS=1`) · DB `e2e_og_p5fix_10272055`(끝난 뒤 삭제)
  - `opengym-import` **12/12**. 기존 8 + 새 4:
    - 탭 둘 → 가져오기(파일 고르기 전부터)·되돌리기(확인창 전) 막힘 → 다른 탭을 닫으면 풀림.
    - hold:1 로 쓰는 중에 새 탭 → 안내(`data-state=importing`). 3초 뒤에도 디스크에 writing 묶음과 일부 행이 남아 있다. 가져오던 탭을 닫고 새 탭을 새로고침하면 부팅 정리 뒤 0. 진행 중 뒤로 → 「나갈 수 없어요」.
    - P5-5: 운동 0개 파일 막힘 · 전부 skip → 시작 막힘.
    - P5-4: 못 맞춤 1개 알림 → 확인창 → 취소하면 맞추기 단계 그대로 → 이름을 고쳐 확인하면 알림 없이 가져옴.
  - 관련 spec(sync·data-safety·offline·history-replay·analytics·opengym-bodyweight·muscle·qa1·rir): 53 passed · 1 skipped. 최종 빌드에서 두 번 돌렸다.
  - 1만 세트(스로틀 없음, 1000행 묶음): 분석 249ms · 가져오기 884ms · 첫 동기 4,062ms · 다른 기기 로그인+pull 1,253ms.
  - 운영 빌드(깃발 없음)에서 `liftgram.e2e.importFault` 가 든 청크는 0개였다.
- 360 캡처(라이트·다크 각 6장): `.ouroboros-work/shots/p5-fix/`
  - 01 운동 0개 · 02 미확인 알림 · 03 미확인 확인창 · 04 다른 탭 막힘 · 05 진행 중 「나갈 수 없어요」 · 06 다른 탭 가져오는 중 안내

## 알아 둘 것
- **스크래치 공유 사고**: 세션 스크래치 디렉터리를 다른 세션(P4 검토)도 쓰고 있었다. 21:00께 내 `env.sh`·`dbname`·pid 파일이 덮였다. 그 사이 다시 띄운 3501 이 `e2e_og_p4fix_10272100` 을 가리켜, import e2e 두 번이 그 DB 에 계정 3개를 만들었다.
  - 만든 계정: `e2e-og-imp-hevy-…`, `e2e-og-imp-10k-…`, `e2e-og-imp-d2-…`
  - 남의 DB 라 지우지 않았다. 계정별로 떨어져 있어 그쪽 검사에는 영향이 없을 것으로 본다. 그 DB 를 지우면 같이 사라진다.
  - 원인을 안 뒤로는 하위 폴더 `scratchpad/p5fix-own/` 에서 다시 돌렸다. 위 최종 결과는 전부 내 DB 에서 나온 것이다.
- 작업 트리의 `frontend/.next` 는 마지막 e2e 빌드(깃발 켬)다. 운영에 쓰려면 다시 빌드해야 한다(배포 스크립트는 새로 빌드한다).
- 새 번들이 배포되기 전에 열려 있던 **옛 번들 탭**은 잠금도 BroadcastChannel 도 없어 세지 못한다. 배포 직후 옛 탭이 열린 채로 가져오면 막지 못한다(SW 갱신 띠로 새로고침을 권하는 수준).
- 탭마다 공유 잠금을 평생 쥐면 Chrome 이 그 페이지를 bfcache 에 넣지 않을 수 있다. 앱 안 이동은 클라이언트 이동이라 영향이 작다. 외부 사이트 갔다 돌아올 때만 다시 읽는다.

## 앱 전체 다중 탭 덮어쓰기 위험(이번 범위 밖)
- **재현**(로그아웃 기기, 같은 브라우저)
  1. 탭 A·B 로 `/` 를 연다.
  2. A 에서 운동 하나를 끝까지 기록한다(완료).
  3. B 에서 새로고침 없이 「빠른 시작」을 누르거나 아무 저장을 한다.
  4. 결과: 디스크의 A 기록이 사라지고 B 의 메모리 사본으로 덮인다. 반대도 같다.
  - 가져오기 전용 경로는 이번에 막았지만, 일반 기록끼리는 그대로다.
- **원인**: LokiJS 증분 IndexedDB 어댑터는 다른 탭이 디스크를 바꾼 것을 감지하면 자기 메모리 사본으로 DB 전체를 덮어쓴다. `onDidOverwrite` 미설정이고 다중 탭 가드도 없다(`core/src/db/adapter.ts`).
- **영향**
  - 로그아웃 기기: 영구 손실이다.
  - 로그인 기기: 덮인 쪽이 이미 push 했으면 다음 pull 로 되살아난다. push 전(오프라인·동기 실패·디바운스 1.5초 안)이면 손실이다.
  - 진행 중 운동(기기 상태)은 동기로 돌아오지 않는다. 운동 중 다른 탭에서 저장하면 세션이 사라질 수 있다.
  - 사용자에게는 아무 표시가 없다.
- **권장 대책**(별도 작업 · 순서대로)
  1. `extraIncrementalIDBOptions.onDidOverwrite`(+ `onversionchange`)에서 「다른 탭에서 바뀌었어요 — 새로고침」 화면 전체 안내를 띄운다. 이번 `ImportElsewhereNotice` 와 같은 모양이다. 그 탭의 쓰기와 동기를 막는다.
  2. 쓰기 탭을 하나로: 이번 `lib/tabGuard` 의 `liftgram-tab` 잠금을 배타 「쓰기 탭」 잠금으로 넓힌다. 늦게 연 탭은 읽기 전용 + 「이 탭에서 계속하기」(앞 탭에 양보 요청)를 둔다.
  3. 회귀 e2e: 탭 둘에서 번갈아 저장 → 디스크 행 수가 합과 같은지(또는 늦은 탭이 막히는지) 확인한다.
  4. 운동 진행 중 탭이 있으면 다른 탭을 읽기 전용으로 둔다(세션 유실이 가장 아프다).
