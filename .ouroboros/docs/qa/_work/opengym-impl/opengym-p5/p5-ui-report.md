<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# openGym P5 화면 — Strong·Hevy CSV 가져오기 결과 보고 (2026-10-27)

## 커밋
- `6b94511` feat(opengym): P5 화면 — Strong·Hevy CSV 가져오기(전체 화면 단계·종목 맞추기·묶음 되돌리기) (SRS-081·082 · 미배포)
- 브랜치 feat/opengym-p5(577a100 위) · push·merge·배포 안 함 · 경로를 지정해 add 함(`lefthook.yml`·`.ouroboros-work/` 는 넣지 않음)

## 파일 (12개)
- 새 파일
  - `frontend/lib/importTask.ts`: 계산 본체(analyze·plan · 순수 함수)
  - `frontend/lib/importWorker.ts`: 실행기(Worker 먼저, 안 되면 메인)
  - `frontend/lib/importWorker.entry.ts`: Worker 진입점
  - `frontend/app/components/sync/ImportCard.tsx`: 입구 + 「가져오기 기록」 묶음별 되돌리기
  - `frontend/app/components/sync/ImportFlow.tsx`: 전체 화면 5단계
  - `frontend/app/account/import/page.tsx`
  - `frontend/e2e/opengym-import.spec.ts`
- 기존 파일(최소 diff)
  - `AuthClient.tsx` +9줄: import 1줄, 로그인·로그아웃 두 분기에 `<div id="import"><ImportCard/></div>`
  - `e2e/helpers/opengym.ts` +127줄(P5 헬퍼): 큰 파일 생성, 시험 파일 읽기, 가져오기 단계, IDB 행 수, 서버 숫자(psql)
  - core `i18n/locales/{ko,en}.ts` 끝 「openGym 추천」 구역에 `import.*` 90키
  - core `data/importRepository.ts` +8줄(아래 「스펙과 다른 점」 3번 · D-2 결함 수정)
- 건드리지 않음: 공용 ui 4개(Dialog·charts·quiet·primitives), TabBar, LinkInterceptor, sw.template.js, 로컬 스키마(v26), Go
- 새 코드에는 전부 `@plm SRS-081`/`SRS-082` 를 달았다.

## 검증
- `bun run test:core`: 462/462
- `tsc`(core·frontend): 오류 0
- biome(바꾼 파일 전부): 깨끗
- `make verify`: exit 0(lint·typecheck·go test·core-check·catalog-check·docs-check)
- 3500/3501 운영 빌드 e2e. DB `e2e_og_p5_10271916`(끝난 뒤 삭제).
- 새 `opengym-import.spec.ts` **10/10 통과**. 고친 뒤 마지막 빌드에서 두 번 연속 10/10.
  1. 로그아웃 기기, Strong 표본
     - 계정 화면 입구에서 /account/import 로 간다.
     - 단위를 고르기 전에는 「다음」이 막힌다. 표본 줄은 kg면 「80kg × 5」, lb면 「80lb × 5」.
     - 계산이 Worker 에서 돈다(`data-import-via=worker`).
     - PR 폭죽·완료 요약이 0개다.
     - 기록 2개가 생긴다. 상세에서 RPE 8 → **「≈RIR 2」**, RPE 8.5 → **「≈RIR 1.5」**.
     - 캘린더 8월 25·27일이 운동한 날로 표시된다. 통계 「전체」 운동 2회.
     - 재가져오기: 「새로 가져올 운동이 없어요」 + 「이미 있는 운동 2개는 건너뛰었어요」. 가져오기 기록은 1줄 그대로.
     - 가져온 세트 하나를 IDB 에서 user_edited=true 로 바꾸면 되돌리기 확인창에 「고친 세트 1개」 경고가 뜬다.
     - 되돌리기 → 가져온 행 0, 묶음은 undone 1줄로 남는다.
  2. 나가기 확인과 임시 저장
     - 탭바 링크를 누르면 확인창이 뜨고, 취소하면 그대로다.
     - 새로고침 뒤 「앞에서 고른 종목이 남아 있어요」가 뜬다. 같은 파일을 고르면 결정(가져오지 않기)과 단위(kg)가 되살아난다.
     - 뒤로 가기 → 확인창(주소 그대로) → 나가기 → 앞 화면으로 가고, sessionStorage 결정이 지워진다.
  3. n번째 묶음 실패(`throw:2`)
     - 「쓴 것은 모두 지웠어요」가 뜨고 IDB 에 남은 행 0, 묶음 0.
     - 쓰는 도중 강제 새로고침(`reload:2`): 새로고침으로 온 문서를 빈 문서로 받아, 부팅 정리 **전** 디스크를 직접 본다. 묶음 status=`writing` 1개와 일부 행(0 < 운동 < 300)이 실제로 남아 있었다.
     - 앱을 다시 열면 부팅 정리 뒤 0이 된다. 같은 파일을 다시 가져오면 300개 성공(삭제 표시 없음 · D-3).
  4. 진행 화면은 닫을 수 없다(`hold:1`)
     - 탭바·앱바 뒤로·브라우저 뒤로 모두 화면을 옮기지 않는다. 확인창도 뜨지 않는다.
     - 새로고침하면 부팅 정리 뒤 0.
  5. 서비스워커가 켜진 셸
     - Hevy lb 파일: 단위가 파일에서 오고, 계산은 Worker 에서 돈다.
     - 오프라인에서 새로 연 화면: 메인 대체(또는 Worker)로 끝까지 가져온다.
  6. 로그인 + Hevy kg
     - 「서버로 올리는 중」 한 줄이 뜬다.
     - 피드 글 0. 서버 `posts`·`stories` 도 이 사람 것 0.
     - 되돌린 뒤 오프라인 → 「온라인에서 다시 시도」, 고르기 버튼 막힘. 온라인 복귀 → 풀림.
     - 진행 중 운동이 있으면 「운동을 마친 뒤 가져올 수 있어요」, 고르기 버튼 막힘.
  7. 1만 세트(D-1)
     - 끝 화면 「운동 1,000개 · 세트 10,000개」 → 동기 성공.
     - 로컬 IDB 행 = 서버 sync_records(imp-, 살아 있음): 1000 / 5000 / 10000.
     - 다른 기기 로그인 + pull 뒤 같은 수.
     - 되돌리기 → 동기 성공 → 서버의 살아 있는 가져온 레코드 0.
  8. D-2
     - A: 가져오기 → 동기 → 되돌리기 → 동기.
     - 새 기기: 로그인 → 동기 → 같은 파일 가져오기 → 동기 두 번 → 운동 60·세트 600. 서버 60.
     - 처음 기기도 동기 뒤 60.
     - **고치기 전에는 실패했다**(아래 3번).
- 관련 기존 spec
  - sync·data-safety·history-replay·analytics·offline·local-db·profile·auth·opengym-rir·opengym-qa1: 46/47
  - 마지막 빌드에서 import·sync·data-safety·history-replay·analytics·offline·local-db·profile·auth: 41/42
  - 실패한 두 건은 매번 다른 건(offline:28 한 번, sync:234 한 번)이고, 단독 재실행에서 각각 9/9·3/3 통과했다. 긴 연속 실행 중 시간에 걸린 흔들림으로 본다.
- 백업 가져오기 회귀(D-1): data-safety spec 이 통과했다.

## 성능 — 1만 세트(운동 1000 × 종목 5 × 세트 2 = 16,000행)
- 측정 방법
  - DevTools 프로토콜 `Emulation.setCPUThrottlingRate`(Playwright CDP 세션) · 360×640 · 운영 빌드 3500 · 로그인 계정 · Worker 경로.
  - long task 는 PerformanceObserver 로 쟀다.
  - flush 는 IndexedDB readwrite 트랜잭션 가운데 가장 긴 것이다.

| 항목 | CPU 4× | CPU 6× |
|---|---|---|
| 파일 고르기 → 확인 화면(읽기·해시·파싱·맞추기 · Worker) | 561ms | 799ms |
| 「가져오기」 → 쓰기 단계 시작(계획 · Worker) | 120ms | 188ms |
| 쓰기 단계 전체 ※(가져오기 전 동기 2회 + 1.1초 대기 + 8묶음 쓰기 + flush) | 2,307ms | 2,831ms |
| 가장 긴 long task(가져오기 동안) | **389ms** | **588ms** |
| long task 수 · 합 | 10 · 1,017ms | 11 · 1,536ms |
| flush(가장 긴 IDB 쓰기 트랜잭션) | 175ms | 403ms |
| 첫 push(끝난 뒤 자동 동기 · 9요청) | 981ms | 1,049ms |
| 다른 기기: 「지금 동기」 → 통계 「전체」 1000회 보일 때까지 | 2,777ms | 4,700ms |
| 다른 기기: Pull 요청 하나 | 392ms | 808ms |
| 가져온 기기: 통계 「전체」 누름 → 1000회 | 1,118ms | 2,100ms |
| 같은 측정, 새로고침 직후 | 986ms | 1,467ms |

※ 로그인 기기라 1.1초 대기(아래 3번)가 들어 있다. 순수 쓰기는 대략 「표 값 − 1.1초 − 동기 2회」다.
- 스로틀 없음(e2e 7번 측정): 분석 247ms · 가져오기 1,857ms · 첫 동기 3,514ms · 다른 기기 로그인+pull 1,176ms
- 메인 대체 경로(Worker 를 고치기 전에 잰 것): 4×에서 분석 649ms · 가장 긴 long task 376ms
  - 쓰기가 메인 스레드라 Worker 여부와 무관하게 가장 긴 long task 는 쓰기 묶음이다.

## 스펙과 다른 점·판단
1. **blob Worker 대신 번들러 Worker**(`new Worker(new URL("./importWorker.entry.ts", import.meta.url), {type:"module"})`)
   - blob 으로 하면 core 계산 코드를 두 번 번들해야 한다.
   - 실측으로 만난 함정 둘:
     - (a) Worker 진입점이 「Worker 를 만드는 파일」을 import 하면 Turbopack `next build` 가 CPU 0%로 영원히 멈췄다. 그래서 계산 본체를 `importTask.ts` 로 나눴다.
     - (b) 서비스워커가 /_next/static 을 캐시에서 내주면 Worker location 의 `#params=` 조각이 사라진다. 그러면 부트스트랩이 「Missing worker bootstrap config」로 죽는다. SW 를 막은 e2e 에서만 Worker 가 돌았던 이유다.
   - (b)의 해결: Worker 를 만드는 순간만 전역 Worker 를 감싸 `#params` 를 `?params` 로 옮긴다. Turbopack 부트스트랩이 둘 다 읽는다(`paramsToQuery`).
   - 쿼리가 붙은 주소는 SW 캐시에 없어 네트워크로 받는다. 오프라인에서 처음이면 메인 대체로 간다(e2e 5번).
2. **파싱·계획 진행률은 단계 단위**다(해시 → 파싱 → 맞추기 → 계획). core 함수가 한 번에 끝나는 동기 함수라 단계 안을 나누지 않았다.
   - 파일 읽기(`File.text()`)도 진행률을 내지 않는다.
   - 쓰기는 실제 묶음 n/m 이다.
3. **core 결함 수정(importRepository +8줄 · 코드 보존 규칙)**
   - 결함: 다른 기기에서 되돌린 직후(1초 안) 새 기기가 로그인하고 가져오면, 가져온 60개가 동기 뒤 전부 사라졌다(D-2 e2e 결정적 재현).
   - 원인
     - 서버 pull 커서는 조회 상한에서 1초 물린다(`cursorOverlap`).
     - 그래서 방금 받은 삭제 표시가 다음 pull 에 또 온다.
     - 그 pull 이 쓰기 **뒤**에 오면, Watermelon 의 원격 삭제 우선 규칙 때문에 같은 id 로 새로 쓴 created 행이 지워진다.
   - 수정: 가져오기 전 동기 뒤 1.1초를 기다렸다가 한 번 더 동기한다. 커서를 그 삭제 표시 너머로 옮긴다.
   - 대가: 로그인 ∧ 온라인 가져오기가 약 1.5초 길어진다.
4. **시험 전용 주입**: localStorage `liftgram.e2e.importFault` = `throw:n` · `reload:n` · `hold:n` 을 화면 코드가 읽는다.
   - reload·hold 는 끝나지 않는 `database.write` 하나로 다음 묶음을 세운다. 탭이 닫힌 것과 같게 만든다.
   - 운영에도 들어 있는 코드다. 영향 범위는 자기 기기뿐이다.
5. **별칭(remember)**: 사람이 고르거나(후보·피커) 「이대로 맞아요」를 누른 줄만 남긴다. 자동 매칭과 손대지 않은 「확인 필요」는 남기지 않는다(ADR-042 개정).
   - 기본값: 확인 필요 = 첫 후보, 못 맞춤 = 「내 종목 만들기」(이름은 원래 이름, 고칠 수 있음).
6. **나가기 확인은 확인·맞추기 두 단계에** 걸었다(파일을 읽은 뒤부터). 진행 단계는 막기만 한다.
   - 구현: 잡기 단계 링크 가로채기(LinkInterceptor 보다 먼저) + 같은 주소 보초 history 한 줄(popstate) + beforeunload.
   - 확인을 받고 나가면 임시 저장을 지운다. 그래서 「사라져요」 문구가 사실이 된다.
7. **임시 저장** `sessionStorage["liftgram.importDraft"]` = `{v, hash(sha16), unit, rows{원본 종목 이름: 결정·확인 여부}}`. 파일 본문은 없다. 같은 해시일 때만 되살린다.
8. **입구 위치**: 로그인 분기는 「기기와 서버」 구역 BackupCard 아래, 로그아웃 분기는 BackupCard 아래(`#import` 앵커). 프로필의 「데이터」 링크는 없어서 잇지 않았다.
9. 빨강은 「가져오기」·「기록 보기」 주 버튼만 쓴다. 확인 필요·못 맞춤 태그는 주황 하나, 되돌리기 확인창 버튼은 기존 ConfirmDialog 의 destructive 다. 맞추기 단계 바닥 막대는 탭바 위 자리 규칙을 따른다(루틴 편집·댓글과 같음).
10. 웰니스 게이트 PREFIXES 에 `import.` 는 넣지 않았다(권고·평가 문구 없음).
11. 성능은 chrome-devtools MCP 대신 Playwright 의 CDP 세션으로 같은 DevTools 프로토콜 스로틀을 걸어 쟀다. 1만 세트 파일 업로드와 두 기기 흐름을 스크립트로 돌리려고.

## 위험·후속
- **long task 389ms(4×)·588ms(6×)**: 2000행 묶음 batch 하나가 메인 스레드(LokiJS)에서 돈다. 진행 화면은 닫을 수 없게 해 두었지만 폰에서는 그동안 화면이 버벅인다. `IMPORT_WRITE_MAX_ROWS` 를 1000으로 줄일지 /qa 판단이 필요하다(쓰기 총 시간은 조금 는다).
- **D-2 오프라인 변형은 남는다**: B 기기가 A 의 되돌리기를 아직 못 받은 채 오프라인으로 같은 파일을 가져오면, 나중에 온라인에서 받는 삭제 표시가 B 가 새로 쓴 행을 지운다. 「오프라인 ∧ undone 묶음」 막기는 B 가 그 묶음을 이미 알 때만 걸린다. 스펙의 한계다.
- 3번 수정은 서버 `cursorOverlap`(1초)에 기댄다. 서버 값을 바꾸면 `PULL_OVERLAP_WAIT_MS` 도 같이 바꿔야 한다(주석에 적음). Go 쪽 테스트·주석 고정은 하지 않았다(Go 수정 금지).
- Worker 쿼리 우회는 Turbopack 부트스트랩이 `?params` 를 읽는다는 사실에 기댄다. Next 를 올려서 깨지면 메인 대체로 떨어진다. 기능은 유지되고 화면이 덜 부드러울 뿐이다. `data-import-via` 로 확인할 수 있다.
- 보초 history 기록: 맞추기 단계가 끝나면 `history.back()` 으로 걷는다. Next 라우터가 같은 주소로 소프트 이동하는데, e2e 에서 문제는 없었다.
- 실행 안 함: 전체 e2e(관련 spec 만) · `/plm-hub:codescan` · Go 쪽 나눠 보내기 멱등 테스트(core 보고의 「Go 쪽에 남길 일」 그대로).
- 병합 주의: `AuthClient.tsx` 는 화면 정리 세션도 만지는 파일이다(+9줄 · import 1 · 두 분기). ko/en 은 끝 구역만 바꿨다.

## 캡처
- 경로: `.ouroboros-work/shots/p5/` · 360×640 · DPR 2 · 라이트·다크 각 9장
- 목록: 01-file · 02-summary(깨진 줄 펼침·단위·표본) · 03-match · 04-match-auto · 05-leave-dialog · 06-progress(묶음 1/4) · 07-done · 08-card(가져오기 기록) · 09-undo-dialog

## 정리
- 3500·3501 프로세스를 종료했다. DB `e2e_og_p5_10271916` 를 삭제했다.
- `next-env.d.ts` 를 원복하고 `test-results/`·`.media` 를 지웠다.
- 임시 측정·캡처 spec(`_p5-perf`·`_p5-shots`·`_p5-dbg`)은 작업 트리에서 지웠다(scratchpad 에만 남음).
- 빌드 산출물 `.next`·`bin`·`public/sw.js` 는 git 무시 대상이다.
