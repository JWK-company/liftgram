<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# openGym P3 /qa code 조치 보고 (커밋 84df4b5 · 브랜치 feat/opengym-p3 · 미배포)

대상 보고서: `liftgram/.ouroboros/docs/qa/_work/20261027_opengym-p3-code.md` P3-1~P3-13 — **13건 전부 처리**

## 지적별 처리

| ID | 처리 | 내용 |
|---|---|---|
| P3-1 | 고침 | 화면: 고치기 날짜를 바꾸면 `min(withDate, Date.now())`(날짜를 안 바꾸면 원래 값 그대로). core: `isFutureMeasuredAt`(지금+1분 초과) → `addBodyweightLog`·`updateBodyweightLog` 가 「측정 시각이 지금보다 뒤예요」로 거부. 테스트: repo 1건(어제 늦은 시각 → 오늘로 옮기면 거부 · 1분 안은 받음 · 자른 뒤 새 기록 = 내 체중) + domain 1건 + e2e(어제 23:59 줄을 오늘로 고침 → measured_at ≤ 지금 · 다음 기록 80 = 내 체중) |
| P3-2 | 고침 | 주간 변화 기준 시각 = `max(nowMs, 가장 최근 측정)`. e2e ④: 서로 다른 날 2개 → 「한 번 더」 → 카드 머리 「기록」으로 세 번째 → 새로고침 없이 「주간 변화 −」 |
| P3-3 | 고침(결정대로) | `bodyweightUnitOf` 가 늘 `'kg'`([원본] 주석 보존 · lb 스텝·왕복 로직은 core에 남김). e2e ⑦ 을 「예전 프로필 단위 lb 여도 75.0kg · kg 스텝 · 그대로 저장하면 원값 · 통계도 kg」로 바꿈. lb 왕복·스텝은 core weighIn.test 가 계속 지킨다 |
| P3-4 | 고침 | 고치기·지우기 `aria-label` = 「81.0kg · 2026. 10. 27. 고치기/지우기」. 마지막 기록 확인창에도 값·날짜 한 줄. e2e로 확인 |
| P3-5 | 고침 | 스크림 `tabIndex=-1`+`aria-hidden`. Tab/Shift+Tab 을 패널 안에서 돌림. 열 때 포커스를 기억했다가 닫을 때 돌려줌. e2e: 14회 Tab 동안 포커스가 패널 안 · Esc 뒤 포커스 = 「기록」 버튼. 공용 Overlay `maxHeight` prop 은 공용 ui 수정 금지라 남김(다음 단계) |
| P3-6 | 고침 | 직접 입력 하한 20kg(`WEIGH_IN_MIN_ENTRY_KG`) — 범위 밖이면 저장 안 하고 「20~300kg 사이 숫자를 적어 주세요」(role=alert). 지난 값(고치기는 원래 값) ±30% 넘으면 「지난 기록 72.0kg에서 많이 바뀌었어요 — 맞으면 한 번 더 눌러 주세요」 + 버튼 「그대로 저장」(목표 시트는 확인 안 함). core `isLargeBodyweightJump` 테스트 + e2e |
| P3-7 | 고침(실기기 미확인) | 입력 중 스크림을 누르면 입력만 확정하고 닫지 않음(pointerdown 때 입력 중이었는지 기억 — blur 가 먼저 와서). 다음 누름에 닫힘. `enterKeyHint="done"` + 입력칸 옆 「확인」 버튼. e2e로 확인. iOS PWA 실기기는 못 돌렸다(환경 없음) |
| P3-8 | 고침(결정대로) | 「체중 미설정으로 두기」를 테두리 버튼(높이 44)으로, 조건 `bodyweightKg != null && userId`(이력 0 + 프로필 값만 있어도). 통계 빈 상태도 「프로필 값 75.0kg · 기록하면 곡선이 그려져요」. repo 테스트(로그인 안 한 기기 · 이력 0 → 미설정 → 정리 2회 뒤에도 null) + e2e |
| P3-9 | 고침 | 판정 **시작할 때** 표시를 먼저 남기고, 띄우지 않기로 하면·판정 실패·판정 도중 끊김(StrictMode 재실행 포함)이면 지움 → 다른 탭은 표시를 보고 멈춘다. 두 탭 e2e는 넣지 않음(판정 타이밍을 맞추기 어려움 · 기존 ①②③ 회귀로 표시 흐름 확인) |
| P3-10 | 고침(일부) | 쓰이지 않던 `ignorePop` 제거, 우리 칸이 맨 위일 때만 back. 처음엔 back 을 한 틱 미뤄 StrictMode 칸 남음(ⓑ)까지 막으려 했는데, **e2e ②에서 바로 뒤의 reload 가 ERR_ABORTED** → 즉시 back 으로 되돌림. ⓐ는 back 과 뒤의 pushState 가 브라우저 세션 기록 순회 큐에서 순서대로 처리되어 실제로 생기지 않는다고 판단(주석). replaceState 안은 버튼으로 닫을 때마다 빈 뒤로 칸이 남아 택하지 않음. ⓑ(개발 전용)는 남김 |
| P3-11 | 고침 | 합치기는 값↔값끼리만(`w > 0 && top.weightKg > 0`) — 미설정은 늘 새 표식 줄([원본] 주석). repo 테스트(1분 안 값 줄 + 미설정 = 2줄 [81, 0] · 값 연타 합치기는 그대로 1줄) |
| P3-12 | 고침 | ⓐ 점 key = `p{x}-{같은 x 안 순번}`(biome noArrayIndexKey 때문에 `dotKeys` 함수). LineChart 는 P3 에서 새로 만든 파일이라 공용 ui 가 아니라고 봤다. ⓑ `weeklyRateDaysNeeded`(28일 안 서로 다른 날) — 1이면 「한 번 더 적으면 추세가 보여요」, 2 이상이면 「최근 4주에 n번 더 적으면 추세가 보여요」(e2e ④ 첫 기대값도 바꿈). ⓒ 읽기 전에는 높이 96px 빈 자리(aria-busy) |
| P3-13 | 고침 | en: skip=「Skip for now」 · directInput=「Enter value」 · historyCount=「{count} entries」 |

새 i18n 키(ko/en · `bodyweight.` 접두): editAria · deleteAria · entryOutOfRange · jumpConfirm · saveAnyway · weeklyNeedMoreN · cardEmptyProfile · done.

## 검증
- `bun run test:core` **478/478**(+6: repo 3 · weighIn 3 · 기존 lb 기대 1건 kg로 갱신)
- `tsc` frontend·core 0 · biome 오류 0(기존 경고 3·정보 2) · `make verify` exit 0
- 3400/3401 운영 빌드(DB `e2e_og_p3fix_<시각>` · 끝나고 삭제)
  - `opengym-bodyweight` **11/11**(기존 8 + 새 3: P3-1 · P3-6/7/5 · P3-8)
  - analytics · data-safety · opengym-muscle · opengym-qa1 · opengym-rir · profile · profile-edit · session · session-assist · session-cookie · session-refresh-race · sync · declutter-p4 → **61 통과 · 1 건너뜀 · 실패 0**
  - backup 전용 spec 은 없다 — 백업 왕복은 opengym-bodyweight ⑧ · data-safety 가 다룬다
- 캡처 `.ouroboros-work/shots/p3-fix/` 20장(360·390 × 라이트·다크): stats-one(「최근 4주에 2번 더」) · sheet-error · sheet-jump(「그대로 저장」) · history(테두리 버튼 미설정) · checkin-typing(「확인」 버튼 · 타이머 보임)

## 남은 것
- P3-5 공용 Overlay `maxHeight` 로 옮기기 — 공용 ui 수정 금지라 다음 단계.
- P3-7 iOS PWA 실기기 확인.
- P3-10 ⓑ 개발 StrictMode 의 한 칸 남음(운영 무관).
- P3-9 두 탭 e2e 없음.

## 정리
3400·3401 종료 · DB 삭제 · 임시 캡처 spec 삭제 · test-results·.media 삭제 · next-env.d.ts 원복. 커밋은 본인 파일 12개만(push·merge·배포 안 함). 다른 폴더·포트 안 건드림.
