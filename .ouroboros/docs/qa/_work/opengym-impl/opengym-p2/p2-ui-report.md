<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# openGym P2 화면 — 결과 보고 (2026-10-27)

## 커밋
- `d89ce09` feat(opengym): P2 화면 — 근육 지도(오늘·추천 카드·운동 중 시트)·근육 균형 카드·종목 근육 필터 (SRS-075·076 · 미배포) · 브랜치 feat/opengym-p2 (5a9fb5d 위) · push·merge·배포 안 함
- 경로를 지정해 add 함(`lefthook.yml`·`.ouroboros-work/` 는 넣지 않음). 공용 ui(Dialog·charts·quiet·primitives) 수정 없음.

## 파일 (18개)
- 새 파일: `ui/BodyMap.tsx`(BodyMapFull·BodyMapMini·muscleMapAriaLabel·formatMuscleSets) · `routines/RoutineMuscleMini.tsx`(RoutineMuscleMini·RoutineMuscleFocus) · `session/TodayMuscleSheet.tsx`(TodayMuscleButton+시트) · `analytics/MuscleBalanceCard.tsx` · `profile/MuscleMapRow.tsx` · `lib/muscleMapPref.ts` · `lib/muscleQuery.ts`(?muscle= ↔ 칩) · `e2e/opengym-muscle.spec.ts`
- 기존 파일(최소 diff): RoutinesClient +5(import 1 · 카드마다 글자 줄·그림 2줄) · SessionGuides +3/−1(prop·버튼 한 줄) · ActiveWorkout +2/−1(workoutId 넘김, 옛 호출 주석) · StatsClient(옛 「근육군 분포」 렌더·조회·state·import 를 주석으로 막음 + 카드 한 줄) · CatalogClient +2 · ProfileClient +2 · prefs.ts +1(SYNCED_PREF_KEYS `liftgram.muscleMap`)
- core: `analyticsRepository.getMuscleDistribution(sinceMs, endMs?)` — 끝 시각 인자 추가(주 이동용, 기본 동작 같음) · i18n ko/en 끝 구역 `muscleMap.*` 20키(settingTitle·todayButton·sheetRow·balanceTitle·untrainedTitle·range 등). guideCopy PREFIXES 에 `muscleMap.` 이미 있음(확인) → 게이트 통과.

## 검증
- `bun run test:core` 453/453 · `tsc --noEmit` core·frontend 0 · biome(바꾼 파일) 0 · `make verify` exit 0
  - make verify 1회차는 `exerciseSearch.test.ts` 「500종 검색 50ms」가 50.1ms 로 실패(부하 중 타이밍) → 재실행 통과. 이번 변경과 무관.
- 3400/3401 운영 빌드 e2e(DB e2e_og_p2_10271830)
  - 새 `opengym-muscle.spec.ts` 2/2(+시안 캡처 1, SHOTS 때만): 오늘 카드 mini(가슴 level3·삼두 level2·대퇴 0, aria-hidden, 「가슴…중심」, 그림 1개 = 목록 줄 없음, 슬롯 56px) → 끄면 슬롯·글자·「오늘 근육」 0개 → 켜고 끄며 좌표 → 세트 완료 → 시트 가슴 1·삼두 0.5·어깨 0.5 → 줄 누르면 data-level=sel · Esc 포커스 복귀 → 둘째 세트 → 2·1·1 → 마치기 → 통계 「근육군 분포」 0개·카드 1개·가슴 2/삼두 1·aria「가슴 2세트, 볼륨…」 → ‹ 빈 기간 › 복귀(다음 비활성) · 위쪽 기간 바꿈 → 「안 한 근육」 종아리 칩(높이 ≥44) → /exercises?muscle=calves 칩 눌림 → 칩→주소(back)·끄면 쿼리 없음 · ?muscle=glutes 로 열기 · 모르는 값 무시
  - 관련 기존 26파일 122건: 121 통과 + sync.spec:234 1건 실패 → 단독·파일 단위 재실행 6/6 통과(긴 실행 중 흔들림). declutter-block 4/4(아래 좌표 조치 뒤).
- 좌표(390, 첫 블록): 끔 = rir y100 h36 · 첫 세트 목록 y281 / 켬 = 같음(100·36·281) / 다시 끔 = 같음. 360·390 × 라이트·다크: 카드(그림↔버튼·글자 겹침 0, 카드 안, 가로 스크롤 없음) · 가이드 세 버튼 겹침 0 · 시트 줄 ≥44·겹침 0 · 통계 줄 ≥44·‹›44·칩 겹침 0 · 카탈로그 고른 칩 화면 안.
- 대비(화면에서 계산된 색 · e2e 로그 / 토큰 계산 scratchpad contrast.txt):
  | | 칠 100%(ink2) | 칠 60% | 30% 윤곽(ink2) | 0단계 윤곽(line-strong) | 선택(brand-vivid) |
  |---|---|---|---|---|---|
  | 라이트 카드·시트(surface) | 9.99 | 3.29 | 9.99 | 4.67 | 3.10 |
  | 라이트 오늘 카드(brand-muted) | 9.00 | 3.15 | 9.00 | 4.21 | 2.79(+윤곽 brand 5.2) |
  | 다크 surface | 10.19 | 4.69 | 10.19 | 5.95 | 4.56 |
  | 다크 오늘 카드(brand-muted) | 10.10 | 4.64 | 10.10 | 5.90 | 4.52 |
  - 30% 칠 자체는 1.70(라이트)·2.24(다크)라 스펙대로 ink2 윤곽선이 3:1 을 맡는다. 글자: 「가슴…중심」 ink2 on brand-muted 9.00 · 줄 글자 ink ≥16 · 볼륨 보조 ink3 on surface 4.83/5.42(선택 줄 바탕 surface-alt 다크 4.35 라 선택 때는 ink2 로 바꿈).
- 캡처(`.ouroboros-work/shots/p2/`, 커밋 안 함): proposal-{light,dark}(시안 2안 × surface·brand-muted·bg) · home-todaycard · session-sheet · stats-balance · catalog-filter 각 360/390 × light/dark (16)

## 채택 시안: 무채 농도(ink2 100·60·30%) + 선택한 근육만 brand-vivid
근거
1. 화면 정리 공용 규칙 1: 빨강 = 주 행동·완료·선택 상태. 「얼마나 했나」는 상태 메타라 회색 계열이다. 빨강 농도안은 오늘 카드(이미 brand 테두리·brand-muted 바탕) 위에 또 빨강 면을 얹어 홈의 빨강 종류가 3종(빠른 시작 채움·카드 테두리·그림)이 되어 ≤2종을 넘는다.
2. 빨강 60%·30% 는 바탕 대비 2.03·1.42(라이트)로 3:1 미달 — 60% 에도 윤곽이 필요해진다. 무채는 60% 도 3.15~4.69 로 통과.
3. 다크에서 빨강 30% 가 탁한 갈색(proposal-dark.png 2행)으로 보이고, 몸 전체가 빨갛게 칠해지면 통증·부상 지도처럼 읽힌다(UX U-4 우려 그대로 확인).
4. 무채안은 「선택」에만 빨강을 써서 규칙과 같은 뜻이 된다(목록 줄을 누르면 그 근육이 brand). 선택이 없으면 화면에 그림 쪽 빨강이 0.
- 빨강안 코드는 `tone="brand"` prop 으로 남겨 둠(시안 재현용 — 화면에서 쓰는 곳 없음).

## 스펙과 다른 점·판단
1. **「오늘 근육」 버튼 높이**: 보이는 높이는 GuideButton 과 같은 36, 누르는 자리만 `::before` 로 위 8px(줄의 pt-sm 자리)를 더해 44. 처음엔 min-h 44 로 했더니 가이드 줄 전체가 44 가 되어 첫 세트가 8px 내려가 declutter-block 의 「360 첫 세트 ≤320」(325)를 깼다. 아래로 넓히면 바로 아래 블록 목록이 위에 그려져 눌리지 않아(elementFromPoint 확인) 위로만 넓혔다. 덕분에 켬·끔 좌표가 같다. RIR·웜업 가이드 버튼(36)은 범위 밖이라 그대로.
2. **오늘/추천 카드 글자 줄**: 「가슴·삼두 중심」을 그림 옆(오른쪽 열)에 두면 360 에서 폭이 모자라(카드 안 ≈294px − 시작 버튼 − 그림 48) 글자 열의 이름이 거의 다 잘린다. 그래서 글자 열 맨 아래 새 caption 줄로 넣었다 → 켠 상태 카드 높이 +약 20px(끈 상태 = 기준선 그대로). 읽는 중엔 빈 줄로 자리를 지키고, 근육 0 이면 그림·줄 둘 다 숨김(이때 카드는 원래 높이). 그림 자체는 오른쪽 열 56px 고정이라 카드 높이에 영향 없음.
3. mini 의 보조근은 30% 가 아니라 60%(2단계) — 56px 에서 30% 가 바탕에 묻힌다.
4. 주 이동 ‹ › 는 「한 주」가 아니라 **위쪽 기간 길이만큼**(7·30·90일) 옮긴다(이번주면 주 이동). 「전체」면 화살표 없음. 범위 표시는 「10/20 ~ 10/27」(지금 기간은 끝이 열려 있어 위쪽 숫자들과 같은 「지금 − N일」 기준). 위쪽 기간을 바꾸면 지금 기간으로 돌아온다.
5. 카드 제목은 「근육 균형」(muscleMap.balanceTitle). 옛 「근육군 분포」 렌더·조회(getMuscleDistribution 호출·dist state·import)는 주석으로 막음 — 카드가 기간에 맞춰 직접 읽는다(볼륨 kg = 줄마다 보조 숫자, 주근육 기준의 같은 집계).
6. 목록 줄을 누르면 그 근육을 그림에 brand 로 표시(aria-pressed). 시트·카드 둘 다. 스펙에 명시는 없지만 채택 시안 「선택만 brand」의 「선택」을 실제로 만든 것.
7. full 그림 안쪽 구역에 aria-hidden 을 따로 달지 않았다 — biome a11y 규칙(noAriaHiddenOnFocusable)이 막고, role="img" 의 자식은 표시용이라 보조기기가 따로 읽지 않는다. `<title>` 은 마우스 툴팁용으로만.
8. 카탈로그: ?muscle 쿼리는 처음 한 번 칩에 적용 + 고른 칩을 가로로 굴려 보이게, 칩을 바꾸면 replaceState(기록 안 늘림), popstate 도 따름. 모르는 값은 무시.
9. 「안 한 근육」 칩은 기록이 있는 기간에만(기록 0 이면 12개 전부라 「센 근육이 없어요」 한 줄만).
10. 앞 그림의 「종아리」 구역은 정강이 쪽 아랫다리로 그렸다(앞에서 보이는 종아리 자리). 어깨·전완·종아리는 앞·뒤 모두에 있다.

## 위험·후속
- 카드 caption 줄 추가로 켠 상태 홈 첫 화면이 약 20px 길어진다(기본 켬). 홈 주 버튼(M-2) 작업과 합칠 때 RoutinesClient 충돌 가능 — 이쪽 변경은 TodayCard·RecoCard 글자 열 끝 1줄·그 뒤 1줄씩뿐.
- 루틴 근육 요약은 짧은 공유 캐시(2초)라, 루틴을 고친 직후 2초 안에 홈으로 돌아오면 옛 그림이 한 번 보일 수 있다.
- 통계 카드 요소 캡처는 하단 탭 막대가 아래를 덮은 채 찍혔다(stats-balance-*) — 화면 자체 문제 아님.
- 그림 품질은 렌더 시트 육안으로만 확인(프로 일러스트 수준 아님). 56px mini 에서 전완·종아리는 몇 px 라 「대략」 수준.
- 추천 카드(RecoCard)는 e2e 로 따로 띄우지 않았다(오늘 카드와 같은 두 조각을 같은 자리에 끼움 — 코드만 확인).
- `/plm-hub:codescan` 미실행(`@plm SRS-075/076` 주석만).
- 정리: 3400·3401 종료 · DB e2e_og_p2_10271830 삭제 · `.media/`·`test-results/`·next-env.d.ts 원복. 시안 렌더 스크립트·시트는 scratchpad(p2/)에만.
