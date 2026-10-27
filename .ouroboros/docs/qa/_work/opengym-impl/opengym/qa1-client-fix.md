<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# openGym 첫 배포 /qa code 1회차 — 클라이언트(core·frontend) 조치 보고

- 브랜치 `feat/opengym-recs` · 커밋 `4a732db` (서버 조치 49737ae 위) · **미배포·미푸시**
- 대상 보고서: `20261027_opengym-r1-code_data.md`(CD-1~8) · `20261027_opengym-r1-code_ui.md`(CU-1~13)
- 수정 범위: src/core · src/frontend(+ CD-8 은 지시대로 src/scripts/deploy-h2500-3.sh). backend·proto·database·공용 ui(Dialog·charts·quiet·primitives)·sw.template.js 는 건드리지 않음.

## 검증 결과

| 항목 | 결과 |
|---|---|
| `bun run test:core` | 439/439 (이전 414 → +25: 체중 순수 12 · 체중 저장소 6 · 동기 3 · 셸 캐시 5 · 칸 이름 1 — 일부 기존 테스트 교체) |
| `tsc` core·frontend | 통과 |
| biome | 오류 0(경고 3·정보 2는 기존 — quiet.tsx·gen-page.mjs) |
| `make verify` | exit 0(go test 포함) |
| 3300 운영 빌드 e2e | **새 opengym-qa1 6/6** · opengym-rir 9/9 · session·session-assist·workout·analytics·profile·profile-edit·offline·local-db·sync·data-safety 전부 통과(합계 52건, 실패 0) |
| 다크 캡처 | `.ouroboros-work/shots/p1-fix/` — progress-360-{light,dark}.png(막대 4개), stats-effortcard-360-{light,dark}.png |
| 정리 | 3300·3301 프로세스 종료 · DB `e2e_og_fix_10271726` 삭제 · .media·next-env.d.ts 부산물 원복 · 임시 캡처 spec 삭제 |

## 지적별 조치

### 데이터(CD)

| ID | 조치 | 수치·근거 |
|---|---|---|
| **CD-1** 높음 | **① + 판정 보강.** `updateUserSettings` 의 bodyweightKg 가 같은 write 안에서 `writeProfileBodyweightInWrite` → manual 이력 한 줄(`bw-profile-*`) + 미러. 판정은 순수 `planProfileBodyweightWrite`. 스테퍼 연타는 1분 창 안이면 같은 줄을 고친다(가장 최근이면서 마지막에 쓴 프로필 입력 줄만). ProfileClient **변경 0줄**. 정리(`planBodyweightMirror`) 흡수 조건을 「어느 이력 값과도 다름」→「**가장 나중에 쓴 줄**보다 늦고 그 줄 값·최신 측정값과 다름」으로 바꿈 → v25 클라이언트의 되돌림 입력도 흡수. `bodyweight.test.ts:204` 의 잘못된 기대(되돌림)를 「흡수한다」로 교체 | 회귀: 순수(v26 경로 80→82→80 · v25 경로 80→82→80) + 저장소(실제 Watermelon) + e2e(입력 사이 줄을 2분 되감고 다시 열기 ×4) 모두 80 유지 · 두 기기 교차·늦게 적은 옛 측정·미래 시각 측정도 흡수하지 않음을 테스트로 고정 |
| **CD-2** 중간 | **「설정 안 함」 표식 규칙**: 측정 시각 있고 weight_kg 가 정확히 0 인 줄. 「내 체중」·미러 판정(latestEntry)에만 참여 → 가장 최근이 표식이면 null. 그래프·주간 변화·기간 요약·가져오기 볼륨은 지금처럼 유효 행만(표식 안 보임). 이력은 지우지 않음. 이미 미설정이면 줄을 안 씀 · 이력을 아직 다 못 받은 기기는 표식을 남김 | 순수·저장소·e2e: 0 → 정리 3회/다시 열기 2회 뒤에도 0kg, 미러 null · 표식 뒤 새 입력은 다시 그 값 |
| **CD-3** 높음 | `frontend/lib/shellCache.ts` 신설. 정리는 **지우지 않고** 온라인이면 SW 셸 목록 8개를 `cache:'reload'` 로 받아 **모든** `liftgram-pages-*` 에 put. 오프라인이면 아무것도 안 함·표시 안 남김. 망 오류가 하나라도 있으면 표시 안 남김(다음 온라인 부팅에 다시). 오류 응답·리다이렉트는 보관 안 함(SW 규칙과 같음). 가드 새로고침도 삭제 대신 같은 덮어쓰기. **sw.template.js 수정 없음**(원래 세션 범위 확인: 화면 정리 세션은 sw 미변경 — git log 마지막 v0.24.0) — 대신 셸 목록 대조 테스트(템플릿의 SHELLS 와 lib 목록이 다르면 실패) | node 테스트 5건(덮어쓰기·목록 밖 항목 보존·오프라인 무동작·partial·캐시 없음) · e2e: 옛 세대 캐시(OLDGEN, 「v25-shell」) 심고 오프라인 부팅 → 그대로·표시 null / 온라인 부팅 → OLDGEN 남아 있고 /workout·/history·/offline 전부 새 HTML / 그 뒤 오프라인에서 /history·/stats 열림. **수동 확인법**: 운영 빌드에서 DevTools > Application > Cache Storage 의 `liftgram-pages-*` 를 보고, localStorage `liftgram.pagesCacheCleanedFor` 를 지운 뒤 새로고침 → 캐시가 지워지지 않고 각 셸의 응답이 새 빌드 HTML 인지 확인. Network 를 Offline 으로 두고 같은 절차 → 아무것도 안 바뀌고 키도 안 생김 |
| **CD-4** 중간 | **node 에서 실제 WatermelonDB 로 저장소·동기 테스트를 돌리는 로더**(`__tests__/fixtures/wm/`): models/*.ts 만 `declare` 를 떼고 esbuild(experimentalDecorators) 변환 · `db/database.ts` 를 LokiJS 메모리 DB 로 바꿔 끼움. (b) 체중 정리 2회 연속 쓰기 0 + CD-1·CD-2 시나리오(`bodyweightRepo.test.ts`) · (c) 멈춤 중 동기 → 곧바로 SyncPausedError, 배경 예약 3번 → 재개 뒤 pull 1번 · 두 번 풀어도 한 번 · (d) 가짜 전송 계층 3묶음 중 2번째 실패 → synchronize reject, 루틴 5건 미동기 그대로 → 다음 회차 3묶음 전부 다시(`syncPause.test.ts`) | (a) v25→v26 이관은 기존 e2e(opengym-rir 「v25 모양 DB」)가 지킴 — node 판은 넣지 않음. 부산물: syncPause 테스트에 Watermelon 진단 로그 한 줄(첫 동기 실패 뒤) — 실패 아님 |
| **CD-5** 낮음 | 로그인 안 한 기기(`isSyncLoggedIn()=false`)는 정리가 bw-init 을 심지 않음(`allowInit`). 이 기기 안에서는 이력 없음 = 프로필 값이라 동작 차이 없음. 프로필 입력 줄은 진짜 측정이라 합쳐질 때 올라가는 것이 맞다 | 순수·저장소 테스트 각 1 |
| **CD-6** 낮음 | 멈춘 동안 `syncWithServer()` = 곧바로 `SyncPausedError`(사람이 부른 동기) · `scheduleSync` 는 재개 뒤 한 번으로 미룸 · import/undo 의 flush 는 5초 상한(`flushWithTimeout`) | syncPause 테스트 「풀지 않음 → 500ms 안에 paused」 |
| CD-7 낮음 | **기록만**(지시). 다중 탭 덮어쓰기는 원래 문제 — 후속 onDidOverwrite·BroadcastChannel |
| **CD-8** 낮음 | 기준 = 라이브 커밋(서버 DEPLOYED_REF)의 schema.ts(`git show`), 서버 사본은 보조. 라이브 커밋이 있는데 둘 다 못 읽으면 멈춤 — `ALLOW_UNKNOWN_SCHEMA=1` 로만 통과 | 블록 모의 실행 5경우: HEAD → v26 통과 · 모르는 커밋+ssh 실패 → 멈춤 · 같은 경우+ALLOW → 통과 · 서버 사본 v27 → 하강 멈춤 · 첫 배포(ref 없음) → 통과 |

### 화면(CU)

| ID | 조치 | 수치·근거 |
|---|---|---|
| **CU-1** 중간 | Epley 주석을 **1RM 구역에 붙임**: 최근 PR 구역이 숨으면 1RM 목록 바로 밑, 보이면 PR 목록 밑(「두 목록 끝에 한 번」 유지). 노력 카드는 원래 자리(근육군 분포 뒤)로 — 그 밑에 주석이 오지 않는다 | e2e: 주석이 노력 카드보다 앞 · 캡처 stats-effortcard-360-dark.png(주석 = 1RM 밑) |
| **CU-2** 중간 | 이중 부호화를 겹치지 않게: 마지막 아닌 막대 = **불투명 섞임** brand 75% + surface, 채움 = 막대 **가운데 3px 세로 줄**(on-brand). 막대 윤곽이 남아 1RM 높이가 흐려지지 않음. 범례 「가운데 줄이 길수록…」 | 대비(토큰 계산, :1) — 막대/바탕: 라이트 3.47(surface)·3.24(bg) · 다크 3.72(surface)·4.75(bg) · 줄/막대: 라이트 3.47 · 다크 4.75 · 줄/마지막 막대: 5.20 · 7.04 · 마지막 막대/바탕 4.85~5.51. 옛 값: 다크 채움/바탕 1.16~1.32 · 채움/막대 1.45~1.58. e2e: 줄 폭 3px · 높이 비율 0.46(평균 여유 2.17 → (4−2.17)/4). 캡처 막대 4개 라이트·다크 |
| **CU-3** 중간 | 칸 이름 = 실제 범위(core `rirBucket` 올림 규칙 그대로): `여유 0개` · `여유 0.5~1개` · `여유 1.5~2개` · `여유 2.5~3개` · `여유 3.5개 이상` (en `0 left` · `0.5–1 left` … `3.5+ left`) | core 테스트: 0~10 의 모든 0.5 값이 자기 칸 이름 범위 안(ko·en) · e2e: 0.5 → 「0.5~1개」 1세트, 3.5 → 「3.5개 이상」 1세트 |
| **CU-5** 중간 | 칩 aria-label 이 **보이는 글자로 시작**: `{label} — 세트 {n} 힘든 정도 적기|바꾸기, 여유 n개` + 목표가 있으면 `, 목표 여유 n개`. 세트 번호는 SetRowEdit label 을 prop 으로 | e2e: 「힘든 정도 — 세트 1 …」 · 「3 — 세트 1 힘든 정도 바꾸기, 여유 3개」 (「목표 2」 칩은 「목표 2 — 세트 1 힘든 정도 적기, 목표 여유 2개」) |
| **CU-6** | 가드를 body 바로 아래로 portal · 다른 body 자식 전부 `inert` · 새로고침 버튼에 초점 · 첫 칠하기 전 저장값으로 먼저 판정(useLayoutEffect, 같은 순수 `decideSchemaGuard` · 확정은 부팅 판정) · busy 때 `disabled:opacity-60`·aria-busy · 「기록은 이 기기에 그대로 있어요.」 한 문장(ko·en) | e2e: 초점 = schema-guard-reload · 가드 밖 자식 전부 inert · Tab 이 밖으로 안 나감 · 누르면 다시 열려 가드 |
| **CU-7** | 낙관 표시 해제를 **이 저장 약속이 끝난 뒤**로: ExerciseBlock `onUpdate` 가 write 약속을 돌려주고, 칩은 저장값 = 고른 값이면 해제, 약속이 끝난 **뒤** 저장 시각이 바뀌면(다른 기기 동기) 해제, 끝나고 5초가 지나도 안 따라오면 해제. 실패하면 해제 + 오류 토스트 | e2e: 무게·횟수 입력 직후(blur 저장이 대기열) 곧바로 「3」 → 3초 동안 3 유지 · 다시 열면 스테퍼 3 에서 시작 → 2.5 · 입력값 보존 |
| CU-4 | 설정을 켠 사람에게는 접기·설정 입구 없이 회색 한 줄 · 기간이 전체가 아니면 「이 기간에 기록이 없어요」 | 기존 e2e(끈 상태 입구 문구) 통과 |
| CU-8 | 워밍업 세트(isWarmup·setType warmup)에는 칩을 숨김(처방 RIR 글자는 꺼짐처럼 그대로) | — |
| CU-9 | 스테퍼 aria `effort.stepDec/stepInc`(「여유 0.5개 줄이기/늘리기」 · en) · 빈 값 「—」 → 회색 「안 적음」 | — |
| CU-10 | ① 「적은 세트」 → 「기록한 세트」 ② 머리 평균 정수면 정수(「2.0개」 → 「2개」) ③ **결정: 기록 상세 열 머리·툴팁은 「RIR」 유지**(「≈RIR」 환산 표시와 같은 체계 · 카드만 쉬운 말) ④ opt4 「4개 이상 남았어요」 | 기존 e2e 기대값 2곳 갱신(opengym-rir) |
| CU-11 | ① 로딩 중 24px 자리 ② 주별 추이 최근 12주까지 ③ **보류**(종목 상세가 전 기간 세트를 읽고 거름 — 성능 문제는 아직 관찰 안 됨, 다음 회차) | — |
| **CU-12** | ① 경합 ② 열린 운동 화면 + 다른 탭에서 켜고 끄기(storage 이벤트로 따라감) ③ IDB 에 rpe 만 있는 세트를 직접 심어 「≈RIR 2.5」·분포 칸·RPE 포함 문구·평균 2.2·67% ④ 막대 줄 높이 비율 ⑤ 가드 초점·inert·버튼 ⑥ 새 테스트는 고정 대기 대신 250ms 간격 3초 유지 검사 | `e2e/opengym-qa1.spec.ts` 6건 + 헬퍼 `idb_행_고치기`·`idb_행` |
| CU-13 | 줄 전체가 `role=switch` 버튼 하나(보이는 스위치는 aria-hidden 모양) — ListRow onPress 는 버튼 안 버튼이 되어 쓰지 않고 같은 모양을 그 파일에서 그림 | 헬퍼 `힘든정도_설정`(testid·aria-checked) 그대로 통과 |

## 남는 것·주의

- **v25 클라이언트 잔여(CD-1)**: v26 입력은 더 이상 흡수 판정을 타지 않지만, v25 기기가 프로필 칸을 고친 시각이 다른 기기가 마지막으로 쓴 이력보다 이르면(시계 차이·동기 순서) 여전히 되돌아간다. 받아들인 경합: pull~push 사이 수 초에 낀 낡은 미러는 이제 흡수될 수 있다(QA 수정안 ②의 대가).
- **표식 줄(weight_kg=0)**: P2/P3 체중 이력 화면을 만들 때 목록은 `sortBodyweightLogs`(유효 행만)를 쓰면 표식이 안 보인다. 「마지막 기록 지우기」 확인 문구(U-9)는 표식과 무관 — 표식이 가장 최근이면 이미 미설정이다.
- **CD-3 오프라인 첫 v26 실행**: 지시대로 오프라인에서는 아무것도 지우지 않는다. 그동안 옛 v25 셸이 남아 있으면(온라인 SWR 재검증을 한 번도 못 탄 기기) 옛 번들이 열릴 수 있는 길은 그대로다 — 다음 온라인 부팅에 덮어쓴다.
- core node 테스트(`shellCache.test.ts`)가 frontend/lib 파일 하나와 sw.template.js 를 읽는다(셸 목록 단일 원천 대조용 · core tsconfig 는 __tests__ 를 타입 검사에서 뺀다).
- 공용 ui 파일 미수정이라 ListRow 줄 모양을 EffortLoggingRow 에 한 번 복제했다(같은 클래스).
- 원래 폴더 병합 주의: `StatsClient.tsx`·`ko.ts`·`en.ts` 는 화면 정리 세션도 만지는 파일 — 이번 변경은 1RM 주석 자리·effort/schemaGuard 키 구역뿐.
