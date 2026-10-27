# openGym P4 화면 — 결과 보고 (2026-10-27)

- worktree `/Users/woobi/Desktop/tarae/liftgram-wt-opengym-p4` · 브랜치 `feat/opengym-p4`(cab9bbe 위) · 커밋 **`6debdc0`** · 미배포·push·merge 안 함
- 본인 파일만 add 했다. `.ouroboros-work/`·`lefthook.yml` 은 커밋하지 않았다. **서버 Go·proto·DB·로컬 스키마·공용 ui(Dialog·charts·quiet·primitives) 변경 0**

## 파일
**새 파일**
- `core/src/data/periodSummaryRepository.ts` — `buildMemberSummary(range,{lang})`(기기 `_raw` → summaryInputFromRaw → buildPeriodSummary, 읽기만) · `loadSummaryCatalog()`(트레이너 catalog 인자) · `PR_LIST_MAX_DAYS=100`
- `core/src/domain/__tests__/periodSummaryRepo.test.ts` — 실제 Watermelon(Loki 메모리) 3건: 기간·진행 중 제외·직전 대비·PR 목록 / **서버 모양 응답으로 만든 트레이너 결과 = 회원 결과**(세션·볼륨·부위별·prCount) / 100일 넘는 기간은 목록 없이 개수만
- `frontend/lib/summaryOutbox.ts` — 대기열(아래 규칙)
- `frontend/app/stats/summary/page.tsx` · `components/summary/{ProgressSummaryClient,SummaryView,SummaryOpen,SummaryBubble,MemberReportDialog,SummaryEntry}.tsx`
- `frontend/e2e/opengym-summary.spec.ts`(4건)

**기존 파일(최소 diff)**
- `StatsClient.tsx`: import 1줄과 `<SummaryEntry />` 1줄
- `CoachingClient.tsx`: openReport 안의 옛 GetMemberReport 호출은 [원본] 주석으로 막고 `setReportFor` 를 붙였다. `MemberReportDialog` 렌더 1개를 더했고 `MemberRoutinesDialog` 에 export 를 붙였다. 옛 ReportDialog 함수와 렌더는 보존했다
- `dm/ConversationClient.tsx`: SUMMARY 일 때 SummaryBubble 을 쓰는 분기(옛 map 은 주석으로 보존)와 `?highlight=summary` 강조 · `ConversationsClient.tsx`: 미리보기 「성과 요약」 · `NotificationsClient.tsx`: `coaching_summary` 문구와 클릭 시 getOrCreateDirect(actor) → 그 대화로 이동하면서 카드 강조
- `lib/syncTransport.ts`: onLoggedIn → `startSummaryOutbox`(wiped 면 전부 지움) · discardAndAdopt → 전부 지움 · onLoggedOut → `stopSummaryOutbox`
- i18n ko·en 「openGym 추천」 구역: `progressSummary.*` 104키 · `coaching.action.summary_send`·`summary_view`·`records_view` · `notif.coaching_summary`. guideCopy PREFIXES 에 `progressSummary.` 를 넣었다(게이트 통과)
- `e2e/coaching.spec.ts`: 리포트 기대값을 새 화면 기준으로 바꿨다(ps-workouts 1회 · 600kg · 가슴 1세트 · 고지 문구). 옛 기대값은 주석에 남겼다

## 구현 판단
- **보는 그대로 보낸다**: 미리보기는 `parseSummaryV1(omitSections(전체, 끈 항목))` 이고 보내는 snapshot_json 도 같은 값이다. 섹션 토글은 이 화면 미리보기 바로 아래에 있어서 바꾸면 즉시 반영된다. 시트에서는 코치를 고르고, 보낼 항목을 확인하고, 64KB·기간을 검사한 뒤 보낸다. 체중은 처음에 꺼져 있고 고른 값을 기억하지 않는다. 체중을 켜면 경고 한 줄이 보인다
- **client_id** 는 보내기를 누를 때마다 `crypto.randomUUID()` 로 새로 만든다. 대기열 재전송만 같은 id 를 쓴다
- **대기열** 키는 `liftgram.summaryOutbox:<userId>` 이고 항목마다 ownerUserId 를 적는다. 주인이 다르면 버린다. 대기는 10개까지이고(넘으면 「못 보냄 · 기다리는 요약이 너무 많아요」) 7일이 지나면 「못 보냄 · 7일 동안 연결되지 않았어요」로 옮긴다. 영구 실패 코드(PermissionDenied·NotFound·FailedPrecondition → ended · InvalidArgument · AlreadyExists · ResourceExhausted → 내일 다시)는 대기열에서 빼서 실패 목록으로 옮기고, 스냅샷은 지우고 이유만 남긴다. 나머지 오류는 다시 보낸다. 방아쇠는 로그인/앱 시작(onLoggedIn) · window online · 화면 onOnline 이다. 마지막으로 본 코치 목록(내 관계만)을 같은 키에 둬서, 화면을 연 뒤 연결이 끊겨도 받을 사람을 고를 수 있다. 로그아웃하거나 계정을 전환하면 같이 지워진다
- **ownerConflict**(다른 계정 기록이 있어 동기가 멈춘 상태)일 때는 보내기를 막는다. 남의 기록으로 만든 요약일 수 있기 때문이다
- **PR 목록**은 기간이 100일 이하(「3개월」 포함)일 때만 만들고, 이때는 기간 끝 전의 완료 운동을 전부 읽는다. 100일을 넘는 「직접」 기간은 개수만 보이고 [직전 시작, 끝) 만 읽는다. 측정상 1년 표본을 전부 읽어도 가벼워서(아래) 이 기준을 유지했다
- **DM 카드**는 고정 문구만 보인다(숫자는 열 때 Get 결과에서만 · 열람 감사도 열 때만 남는다). 열면 로딩 스켈레톤 · 오프라인 「연결되면 열 수 있어요」(다시 시도) · PermissionDenied 「코칭이 끝나 볼 수 없어요」 · NotFound · 파싱 실패 중 하나를 보인다. 라벨은 「회원이 보낸 요약(보낸 시점 날짜)」이고 무게는 보는 사람 단위다. 받는 쪽에만 「루틴 처방」 버튼이 있고, 누르면 그 회원의 MemberRoutinesDialog 가 **그 자리에서** 열린다(URL·저장소에 회원 id 를 남기지 않으려고 /coaching 이동 대신)
- **트레이너 리포트**: GetMemberRecords → memberReportFromRecords(catalog = 기기 exercises 전부) → buildPeriodSummary → parseSummaryV1 → SummaryView(trainerReport) 순서다. 기간은 7일·4주(기본)·3개월이고 「부위별 단위가 바뀌었어요 — 볼륨(kg) 대신 세트 수로 세요」 안내와 「새 기록은 개수만」을 보인다. ResourceExhausted 면 「기간을 줄여 주세요」를 보인다. 결과는 컴포넌트 상태에만 둔다

## 검증
| 항목 | 결과 |
|---|---|
| `bun run test:core` | 466/466(+3 새 저장소 테스트 · guideCopy 게이트에 progressSummary 포함) |
| tsc core·frontend · biome | 0 오류(make verify 안의 경고 3은 기존 것) |
| `make verify` | EXIT 0(go build/vet/test 포함 — 서버는 바꾸지 않음) |
| 3600/3601 운영 빌드 e2e 새 `opengym-summary` | **4/4** |
| 관련 기존 spec: coaching·dm·analytics·sync·data-safety·opengym-muscle·opengym-qa1·opengym-rir·auth + 새 spec | **52/52 통과** |

e2e 가 본 것: 회원 4주 기본값 그대로 보내기 → 요청 본문과 **서버 저장 스냅샷(GetProgressSummary 응답)에 bodyweight 키 없음** · 체중을 켜면 미리보기에 들어오고 경고, 끄면 빠짐 · 트레이너 대화 목록 「성과 요약」 → 카드 → 열기 숫자 = 회원 미리보기 숫자 → 「루틴 처방」 판 · 알림 → `/messages/<id>?highlight=summary` 카드 강조 · **트레이너 리포트(세션·총 볼륨·부위별 data-sets) = 회원 숫자** · 트레이너 localStorage·sessionStorage·IndexedDB 전부에 회원 id 없음 · 해지 뒤 열기 → 「코칭이 끝나 볼 수 없어요」(처방 버튼 없음) · 오프라인 보냄 → 대기 1 → 복귀 → 서버 1건 · 다시 부팅해도 1건 · 트레이너 카드 1장 · A 대기열(보내기 RPC 끊김) → 로그아웃 → B 가입: 보내기 요청 0 · 대기열 키 없음 · A 다른 기기 「보낸 요약 0」 · 트레이너 대화 없음.

### 1년 표본 측정(208회 · 블록 1,248 · 세트 4,992 · CPU 4배 느림 · 360px) — `.ouroboros-work/p4-measure.json`
| | 7일 | 4주 | 3개월 |
|---|---|---|---|
| 회원 읽기/계산 ms (전 이력 208회·4,992세트 읽음) | 19 / 9 | 16 / 9 | 16 / 12 |
| 트레이너 GetMemberRecords 응답 바이트 | 35,869 | 158,393 | 535,787 |
| 트레이너 서버 시간(요청→첫 바이트) ms | 11 | 26 | 49 |
| 트레이너 계산 ms(카탈로그 읽기 포함) | 2 | 13 | 13 |
| 응답 행 수 | 217 | 961 | 3,255 |
→ 1초 기준에 한참 못 미친다. 기본 기간은 그대로 4주다. 스냅샷 크기는 core 보고의 1년 7,870B(상한 64KB의 12%)를 따른다.

### 캡처 `.ouroboros-work/shots/p4/`(24장)
`{stats-entry,summary(체중 켬 · 전체 페이지),send-sheet,dm-card,dm-open,report}-{360,390}-{light,dark}.png`

## 고친 버그(구현 중 발견)
- 대기열 flush 의 단일 비행 표식이 **보낼 것이 없을 때 동기로 끝나** `finally` 가 할당보다 먼저 돌았다. 그래서 「진행 중」이 영원히 남았고 → 오프라인 복귀 재전송이 조용히 멈췄다. `.finally` 에서 같은 promise 일 때만 비우도록 고쳤다(e2e 2 가 잡았다 · Ouroboros gotcha 에 저장).

## 남은 것 · 주의
- **SW 셸**: `/stats/summary` 는 오프라인 셸 목록에 없다(sw.template.js 는 손대지 않음). 그래서 오프라인에서 처음 열면 오프라인 안내로 간다. 「오프라인 대기」는 연 뒤에 끊긴 경우다. 셸에 넣을지는 다음 단계에서 정한다.
- 회원 화면에서 받는 쪽 이름은 이 기기 카탈로그 표시 이름이 먼저이고, 커스텀 종목은 스냅샷 이름을 쓴다. 트레이너 리포트 이름은 카탈로그 nameKo 다(트레이너 별칭은 반영하지 않음).
- 날짜는 스냅샷 range.tz(회원 시간대) 기준이다. 보낸 시각과 목록 날짜는 보는 기기 시간대다.
- `current.md`·`state.json` 은 원래 폴더 소관이라 갱신하지 않았다(지시: 다른 폴더 수정 금지) — 합칠 때 openGym 칸을 갱신해야 한다.
- 병합 주의: `StatsClient.tsx`(2줄)·`ko.ts`·`en.ts`·`guideCopy.test.ts` PREFIXES 한 줄·`syncTransport.ts` 는 다른 단계도 만지는 파일이다.

## 정리
3600·3601 종료 · DB `e2e_og_p4_10272021` 삭제(남은 `e2e_og_p4_%` 0) · `.media/`·`test-results/` 삭제 · `next-env.d.ts` 원복 · 디버그·캡처용 임시 spec 삭제.
