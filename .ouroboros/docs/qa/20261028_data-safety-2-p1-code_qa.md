# QA code: 기록 보호 2차 P1 — 로그인 유도 + 운동 화면 헤더·순서 버튼 (SRS-086 · v0.49.0)

- 대상: worktree `liftgram-wt-safety` · `git diff d924005 4dac32a` (5de8810 · 4dac32a). 같은 worktree 의 미커밋 P2/P3 변경은 대상 아님.
- 근거: 스펙 `docs/spec/20261028_data-safety-2/spec.md` §4·§11.1 · `SRS-086.json` · 이전 `qa/20261028_data-safety-2-spec_qa.md`(H-3·L-8·L-9)
- 검토자(역할): **모바일 웹 UX·접근성 검토자** · **React/오프라인 우선 프런트엔드 엔지니어**
- 방법: diff 정독 + 관련 코드(AuthProvider·SyncHealthBanner·layout·FinishRoutineSheets·WorkoutSummary·Dialog z-index) 대조 + 로컬 운영 빌드 `127.0.0.1:3200`(v0.49.0)에서 360×640 모바일 에뮬레이션으로 직접 확인(새 격리 컨텍스트 · 비로그인). 코드 수정·빌드·재시작 없음.

## 판정: **조건부 통과** — H 없음. M-1·M-2·M-3 은 다음 패치 권장(배포를 막지는 않음).

스펙 §4.1 판정 함수·§4.2 표시 순서(루틴 질문 뒤)·§11.1 H-3(완료 1회 뒤 띠 · /workout 숨김)·L-8(다시 시작이 시트 닫음)·L-9(미래 시각) 모두 코드와 일치. 브라우저 실측도 일치: 완료 → 「저장 안 함」 질문 → 닫은 뒤에만 권유 시트 → 「나중에」 → 요약 닫기 → 홈에 띠.

### 확인된 정상 동작(실측 · 코드)
- 권유 시트는 `#modal-root`(fixed z-50) 덮개라 sticky 헤더(z-30)·휴식 막대(sticky z-40)보다 위. `ActiveWorkout.tsx:259` `!finishPrompt && loginNudge` 로 루틴 질문과 동시 표시 없음. 공유 시트·「이 운동으로 루틴 만들기」·「그대로 다시 시작」은 사람이 눌러야 열리는데 권유 시트가 덮개라 동시에 못 연다. 다시 시작은 `:244` 에서 시트 상태를 지움.
- 완료 경로는 `confirm-finish` 하나(`completeWorkout` 호출부 1곳)뿐이라 다른 경로에서 셈이 빠지지 않음. 같은 id 는 `lastCountedWorkout` 로 두 번 세지 않음 · 다시 시작한 운동은 새 id 라 새 완료로 세는 것이 맞음.
- prefs 키 3종은 `SYNCED_PREF_KEYS` 밖 → 프로필로 안 올라감 · localStorage 전수 순회 코드(백업 등)에 안 걸림.
- 기존 사용자(완료 수 0)는 띠 예전 기준 5건 유지 → 업데이트 직후 갑자기 띠가 뜨지 않음. 다음 완료부터 1건 기준. 의도대로.
- sticky: `main` 이 `overflow-x-clip`(스크롤 상자 아님)이라 창 기준으로 붙음. 세션 화면에선 GlobalWorkoutBar(`/workout` 숨김)·TabBar 없음 · 휴식 막대는 하단이라 겹침 없음. lg 레이아웃은 560px 컬럼 안이고 TabBar 가 왼쪽 fixed 라 헤더와 안 겹침. 블록 안 absolute 팝오버 없음(⋯ 메뉴·시트는 모두 portal z-50).
- 순서 버튼 실측(360px): ⌃ x=25·⌄ x=61 각 36×44, 휴식 x=112, 가로 넘침 없음(scrollWidth 360). 첫 블록 ⌃ 은 비활성으로 자리 유지.
- e2e 「수정 전 빌드에서 실패」 타당: 헤더(옛 헤더는 스크롤로 y<0 → 실패) · 순서(옛 위치는 오른쪽 끝 → `up.x < rest.x` 실패) · 권유 시트(없음 → 실패) · 띠(완료 1회 뒤 미동기 3행 < 5 → 실패).

---

## H — 없음

## M

### M-1. sticky 헤더(높이 92px)가 포커스된 입력칸을 가린다 — `scroll-padding-top` 없음
- 근거: `ActiveWorkout.tsx:289-292`(sticky top-0 z-30). 실측 360×640: 헤더 높이 **92px**(화면의 14%), 루트 글자 200% 에서 **134px**. 2번째 블록 무게칸을 헤더 밑(top 53px)에 둔 채 `focus()` → 브라우저가 스크롤하지 않음(칸이 「화면 안」으로 판정) → `elementFromPoint` 가 헤더 → **입력칸이 가려진 채 키보드가 뜬다.** iOS 에선 키보드로 보이는 높이가 더 줄어 체감이 크다. 이전 화면엔 없던 회귀(헤더가 스크롤로 사라졌으므로).
- 수정안: 세션 화면에서 `html { scroll-padding-top: <헤더 높이> }` (ResizeObserver 로 헤더 높이를 CSS 변수에 넣어 큰 글씨도 대응) 또는 세트 입력칸·메모 textarea 에 `scroll-margin-top: calc(var(--session-header-h) + 8px)`. e2e: 헤더 밑에 걸친 칸을 focus 하면 칸 top ≥ 헤더 bottom.

### M-2. 권유 시트 「나중에」 직후 홈에 같은 내용의 띠(116px · role=alert)가 바로 뜬다 — 연속 이중 권유
- 근거: `LoginNudgeSheet.tsx`(나중에 = 닫기만) · `SyncHealthBanner.tsx:36-44`(완료 1회 + 미동기 1건이면 즉시). 실측: 「나중에」 → 요약 닫기 → `/` 에서 `sync-localonly-banner` 표시(top 8 · 높이 116px · 360×640 화면의 18%). 방금 거절한 사람에게 같은 메시지를 몇 초 만에 다시, 그것도 `role="alert"`(스크린리더 즉시 낭독)로 보인다. 1·3번째 완료마다 반복.
- 수정안: 시트의 「나중에」·바깥 누름이 띠의 `sync_localonly_dismissed_at` 도 now 로 적는다(띠는 하루 뒤부터). 또는 띠 조건에 `now - lastShownAt > 24h` 추가. 띠 `role="alert"` 는 로컬-only 경우 `role="status"`(정중한 알림)로 낮추는 것을 권장(백업 멈춤만 alert). e2e 「시트 나중에 → 홈에 띠 없음 → 25시간 뒤 띠」.

### M-3. 셈은 완료 순간, 표시는 질문이 끝난 뒤 — 사이에 앱을 닫으면 그 회차 권유가 사라진다
- 근거: `ActiveWorkout.tsx:606` 에서 `noteAnonCompletion` 이 즉시 count+1·lastCounted 기록, 시트는 `finishPrompt` 가 닫힌 뒤(`:259`) 렌더되고 `markLoginNudgeShown` 은 시트 mount 때. 실측: 질문이 떠 있는 동안 `anonCompleted=1 · lastShownAt=null`. 빠른 운동은 늘 「루틴으로 저장?」 질문이 먼저 뜨므로, 그 상태에서 PWA 를 닫으면(운동 끝나고 폰을 넣는 흔한 동작) **1번째 권유는 영영 없다**(n=2 는 `n<3 → false`). 3번째에서 같은 일이 생기면 lastShownAt 이 1번째 시각이라 `loginNudge.ts:33` 「3번째에 못 띄웠다면」 구제가 안 걸린다(주석·테스트는 null 경우만 다룸).
- 수정안: 셈과 「띄울 차례」를 분리 — `liftgram.nudge.due = workoutId` 를 남기고 시트가 실제로 보일 때 지운다. 다음 진입(요약·홈)에서 due 가 남아 있으면 띄운다. 또는 판정을 `lastShownCount`(마지막으로 보인 회차) 기준으로 바꿔 「1·3번째 회차를 아직 못 보였으면 다음 완료에」로. 단위 테스트에 「3번째 미표시(lastShownAt=1번째 시각) → 4번째 표시」 추가.

## L

- **L-1. 로그인 판정 경계** — `ActiveWorkout.tsx:606` `!authLoading && !authUser`. 세션 깃발은 있으나 캐시된 me 가 없는 기기가 오프라인이면 `load()` catch 에서 user=null·loading=false 로 끝나(`AuthProvider` restoring 경로) 로그인한 사람이 비로그인으로 세져 시트를 본다. 드묾. 수정안: 조건에 `!hasSession()`(lib/session) 추가. loading 중엔 안 세는 현 처리는 맞음.
- **L-2. 슈퍼셋 머리 순서 버튼과 비일관** — 블록 도구 줄은 맨 왼쪽·붙임(36×44·사이 0)인데 슈퍼셋 머리(`ActiveWorkout.tsx:830-833`)는 여전히 오른쪽 끝·28px 보이는 자리·사이 16px(「해제」 옆). 피드백 이유(⌄ 가 펼치기로 읽힘)는 머리 줄에도 해당. 다음 정리에서 머리도 왼쪽(묶음 아이콘 앞)으로 옮기거나, 차이를 의도로 BlockTools 주석에 적는다.
- **L-3. 순서 버튼 36px·사이 0** — WCAG 2.5.8(AA, 24px)는 충족하나 이전 44×44 기준(화면 정리 규칙)에서 후퇴하고, 두 버튼 경계가 맞닿아 엄지 경계 오탭 시 반대 방향 이동. 이동은 되돌릴 수 있어 L. e2e 기준을 44→36 으로 낮춘 것(`feedback-62-64.spec.ts:305-307`)은 의도 변경으로 기록돼 있어 수용. `-ml-[8px]` 로 ⌃ 가 카드 안쪽 여백으로 8px 나가지만 가로 넘침 없음(실측).
- **L-4. 접근 이름** — `aria-label` 이 「위로 이동」「아래로 이동」뿐이라 스크린리더로는 어느 종목인지 모른다(블록 수만큼 같은 이름). 기존부터의 문제지만 버튼이 줄 맨 앞으로 와 먼저 읽힌다. 수정안: `「벤치프레스」 위로 이동`.
- **L-5. 권유 시트 접근성** — 실측: `role=dialog aria-modal=true` 이나 접근 이름(aria-labelledby) 없음 · 열릴 때 포커스가 BODY 에 남음. 공용 `SheetShell` 문제라 이 변경 범위 밖이지만, 「이 기록은 이 폰에만 있어요」가 낭독되지 않는다. SheetShell 에 title id 연결·첫 버튼 포커스 권장.
- **L-6. e2e 기본 표식 `liftgram.nudge.suppressed`** — 제품 영향은 「값이 있으면 세지도 띄우지도 않음」뿐이고 실제 사용자가 가질 수 없는 키라 안전. 다만 부작용: 다른 모든 e2e 는 완료 수 0 → **띠 예전 기준(5건)** 으로 돈다. 실제 사용자는 첫 완료 뒤 모든 화면 위에 116px 띠를 보는데, 홈·기록 등 레이아웃 측정 e2e(화면 정리)는 그 상태를 한 번도 거치지 않는다. 최소 하나의 레이아웃 e2e 를 표식 없이(띠 있는 상태) 돌리거나, 표식을 「시트만 억제」로 좁히는 것을 권장. 표식 키를 상수로 core 나 e2e fixture 와 공유해 오타 위험을 없앨 것.
- **L-7. 문구** — 제목 「이 **폰**에만」은 데스크톱 브라우저 사용자에게 어긋남(본문도 「폰을 바꿔도」). 「이 기기에만」 권장(띠 문구 `syncHealth.localOnly*` 와도 일치). en 제목 "This workout is only…"은 ko(「이 기록은」)와 대상이 다르다.
- **L-8. e2e 범위** — §4.3 「루틴 운동 완료: 반영 질문 먼저」는 빠른 운동의 「저장?」 질문으로만 확인(같은 `finishPrompt` 경로라 수용). 헤더 e2e 는 390 폭만 — 360 폭·큰 글씨에서 헤더 높이 상한(예: ≤ 화면 20%) 검사 하나 추가 권장(M-1 과 함께).
- **L-9. 헤더 `backdrop-blur`** — AppBar 와 같은 방식이라 일관되나, 세트 표가 긴 화면을 계속 스크롤하는 세션 화면에서 저사양 안드로이드 스크롤 비용이 있다. 불투명 `bg-(--color-surface)` 로 충분하면 blur 제거 고려.

## 권장 조치 순서
1. M-2(시트 「나중에」가 띠도 하루 접기) — 한 줄 수정 + e2e.
2. M-1(scroll-padding-top) — 입력 가림 회귀.
3. M-3(권유 「차례」 보존) — 판정 함수 + 단위 테스트.
4. L-1·L-7 은 같은 패치에 곁들이기 쉬움.
