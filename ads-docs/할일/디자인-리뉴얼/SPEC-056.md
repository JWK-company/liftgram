# SPEC-056 — 디자인 리뉴얼 — 전 화면 「평평한 기록지」(상자·버튼 나열 걷기)

> 타입 Spec · 그룹 할일/디자인-리뉴얼 · ADStudio가 `SPEC-056.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → SRS-069, SRS-072

## 목표

「AI가 만든 듯한」 모습(모든 것을 둥근 상자에 담고 같은 무게의 버튼을 나열)을 걷어 내고, 전 화면을 **평평한 기록지** 방향으로 바꾼다. 색(주황 브랜드·금색 PR·초록 완료)과 글꼴(Pretendard)은 지킨다. 근거: 디자인 진단 보고서(2026-11-10, claude.ai/artifact/MFP1myxi9nK9D9Ks1AjdpV)와 그 6절 시험판 1단계(운동 화면 · e2e 27/28, 실패 1은 기존 실패). 사용자 승인: 「권장대로 전체 앱 모든 화면 리뉴얼 진행해」(id=1678).

## 디자인 규칙(전 화면 공통 — 이 스펙의 계약)

- **F1 상자는 떠 있는 것에만.** 시트·확인창·토스트·알림 띠·떠 있는 막대만 테두리+둥근 모서리. 화면 안 구역(종목·목표·루틴 목록·카드형 묶음)은 상자 없이 **아래 가는 선(1px `--color-line`)** 으로 나눈다. 상자 안의 상자 금지.
- **F2 둥근 정도 3단계.** 토큰 `--radius-sm` 4 · `--radius-md` 6 · `--radius-lg` 8(시트 위 모서리) · `--radius-pill` 은 칩·태그·토글·원형 아바타에만. 큰 버튼을 알약으로 만들지 않는다.
- **F3 바탕은 한 장.** 라이트 `--color-bg` 를 카드와 같은 흰색으로(회색 바탕 위 흰 카드 구조 폐지). 다크는 지금 값 유지(평평한 구역은 바탕이 투명).
- **F4 채운 버튼은 화면에 하나.** 빨강 채움(primary)은 그 화면의 주 행동 하나(떠 있는 막대의 채움도 센다). 회색 채움 막대(secondary)는 테두리만 있는 중립 버튼으로. 반복되는 보조 행동(세트 추가·운동 추가)은 회색 글자(quiet). 예외(사용자 피드백 11-09): 루틴 「▶ 시작」은 빨강 글자(판만 걷음), 홈 「새 루틴 · 빠른 운동」은 빨강 테두리(outline) 유지. 루틴 줄 누르기는 미리보기 그대로.
- **F5 위계는 글자로.** 구역 제목은 굵기·위 여백으로, 숫자(kg·횟수·시간)는 크고 굵게(tabular-nums), 라벨은 작고 흐리게. 아이콘을 담은 회색 원·회색 네모 판은 걷는다(아이콘만).
- **F6 채운 줄 금지.** 완료·선택 상태를 줄 배경 채움으로 보이지 않는다. 완료 = 왼쪽 3px 초록 강조선 + 굵은 초록 ✓, 미완료 = 빈 테두리 칸(✓ 없음) — 색만으로 가르지 않는다.
- **F7 지키는 것.** 누르는 자리 44px(IconButton 은 ::before) · 글자 대비 4.5:1 · 누르는 것의 경계(버튼·입력칸·체크칸)는 `--color-line-strong`(3:1 이상) · 빨강 채움 하나 규칙 · 360px 넘침 없음 · 기존 testid 유지 · 다크 모드. 선은 두 단계 — 줄 사이 1px `--color-line`, 운동 화면 종목 사이는 폭 전체 8px 옅은 띠.

## 범위(바꿀 파일)

- 토큰: `src/core/src/theme/tokens.ts` → `src/frontend/app/theme.generated.css`(make sync-core)
- 공용 부품: `src/frontend/app/components/ui/primitives.tsx`(Card·StatTile·EmptyState·Tag) · `src/frontend/app/components/ui/rows.tsx`(묶음 목록) · `src/frontend/app/components/ui/Button.tsx`(secondary) · `src/frontend/app/components/ui/IconButton.tsx`(filled) · `src/frontend/app/components/ui/Chip.tsx` · `src/frontend/app/components/ui/ValueChip.tsx` · `src/frontend/app/components/ui/quiet.tsx`
- 화면 묶음: `src/frontend/app/components/session/` · `src/frontend/app/components/summary/` · `src/frontend/app/components/routines/` · `src/frontend/app/components/analytics/` · `src/frontend/app/components/feed/` · `src/frontend/app/components/dm/` · `src/frontend/app/components/profile/` · `src/frontend/app/components/auth/` · `src/frontend/app/components/sync/` · `src/frontend/app/components/appdist/` · `src/frontend/app/components/coaching/` · `src/frontend/app/components/moderation/` · `src/frontend/app/components/notfound/` · `src/frontend/app/components/ads/` 와 각 경로의 `page.tsx`
- 시험: `src/frontend/e2e/` 의 색·모양 가드 중 이 규칙과 부딪히는 기대값(완료 줄 바탕·카드 테두리 등)과 새 가드 `src/frontend/e2e/flat-design.spec.ts`
- 추가(REV-122): `src/frontend/app/components/ExercisePicker.tsx` · `src/frontend/app/components/NearbyGymsClient.tsx` · `src/frontend/app/components/States.tsx` · `src/frontend/app/exercise/[id]/page.tsx` · `src/frontend/app/components/ui/Skeleton.tsx` · `src/frontend/app/layout.tsx` · `src/frontend/app/globals.css` · `src/frontend/public/manifest.json`
- 범위 밖: 운영 웹 `src/admin` · 네이티브 잠금화면 · 아이콘·로고·색 팔레트(브랜드)

## 설계

- **Card**: 기본을 평평한 구역으로 — `border-b border-(--color-line) bg-transparent py-[var(--spacing-lg)]`(둥근 모서리·좌우·위 테두리·좌우 안쪽 여백 없음). 떠 있는 곳·강조가 필요한 곳은 `boxed` 속성으로 옛 상자(테두리 + `--radius-md`). `alt` 는 옅은 판(테두리 없음 · `--radius-md`)으로 강조 띠에만.
- **StatTile**: 상자 없이 라벨·값만(가로로 놓이면 사이 세로선).
- **EmptyState**: 아이콘 회색 원 판을 걷는다(오류 톤은 유지).
- **묶음 목록(rows.tsx)**: 바깥 상자 대신 위·아래 가는 선 + 줄 사이 선. 줄 앞 아이콘 회색 네모 판을 걷는다.
- **Button secondary**: 회색 채움 → 투명 바탕 + `--color-line-strong` 테두리 + `--color-ink` 글자. `outline`(빨강 테두리)은 화면 정리 때 줄이거나 secondary 로.
- **IconButton filled**: 회색 원 판 → 판 없이(누르면 옅은 판).
- 각 화면 묶음은 F1~F7 로 손본다: 카드 겹침 제거, 버튼 나열 줄이기(줄 누르기·글자 버튼), 채운 줄·회색 판 제거. 기능·문구·testid 는 바꾸지 않는다(문구는 SPEC-055 에서 정리됨).
- 옛 className 은 `[원본]` 주석으로 막고 바로 아래 `[개선]`(ADStudio 기준 5절).

## 작업 단계

### Phase 1 — 토큰·공용 부품

- [ ] radius 4/6/8 · 라이트 bg=흰색 → sync-core
- [ ] Card(평평 · boxed · alt) · StatTile · EmptyState · rows 묶음 목록 · Button secondary · IconButton filled
- [ ] `!` 덮어쓰기 Card 대응(REV-122): 피커 선택·근처 헬스장=boxed, 디로드·오늘 할 운동·슈퍼셋=왼쪽 강조선. 시트 안 Card 는 평평 그대로. IconButton 44px. 바탕색 직접 적은 곳(`src/frontend/app/layout.tsx` themeColor · `src/frontend/app/globals.css` 부팅 덮개 · `src/frontend/public/manifest.json`) 흰색
- [ ] 새 가드 `src/frontend/e2e/flat-design.spec.ts`(REV-122): main 안에서 「radius>0 이고 3면 이상 테두리」 요소 없음(예외 dialog·fixed·sticky·data-card=boxed·알약) · 채운 빨강 ≤1(빈 화면·루틴 있음·운동 중) · 완료 세트 줄 불투명 바탕 없음 · 360px scrollWidth ≤ clientWidth · 라이트·다크
- 완료 기준: 전체 e2e — 이전 기준선(실패 12건: declutter-block:139 · motion-video 4 · opengym-import 3 · auth-formal 2 메일 서버 · 흔들림 2) 외 새 실패 0

### Phase 2 — 운동 중·마친 뒤

- [ ] 시험판 1단계 반영(운동 화면 흰 종이·종목 구분선·세트 줄 선·✓·입력칸 흰 바탕)
- [ ] 「세트 추가」「운동 추가」 글자 버튼(회색 quiet) · 여유 칸·휴식/메모 칩 판 걷기 · 머리 원형 버튼 판 걷기
- [ ] 마친 뒤 요약(WorkoutSummary · FinishRoutineSheets · ShareWorkout) · 몸 지도 시트 · 체중 시트
- 완료 기준: 운동 관련 e2e 전부 + 360px 넘침 없음(배포는 Phase 3 과 묶음)

### Phase 3 — 운동 홈·루틴·종목

- [ ] 운동 홈: 스케줄·목표·오늘 할 운동을 구역으로(상자·분홍 판 걷기 · 오늘 할 운동은 왼쪽 강조선), 루틴 줄 「▶ 시작」은 판 없는 빨강 글자, 코치 루틴 왼쪽 띠는 평평 Card 안쪽 여백으로
- [ ] 루틴 편집·불러오기·프로그램 생성·종목 탭·종목 상세·피커·기구/헬스장
- 완료 기준: 루틴·종목 e2e 전부 + 나머지 화면 360px 라이트·다크 사진 훑어 깨진 곳만 막기 → **배포(minor, Phase 1~3 묶음)**

### Phase 4 — 기록·분석

- [ ] 달력·기록 상세·분석 카드 묶음(체중·근육 균형·주간·변화·힘든 정도)
- 완료 기준: 기록·분석 e2e 전부 → **배포(minor)**

### Phase 5 — 피드·사람·DM·알림

- [ ] 피드 글 카드 → 구분선 글 목록 · 추천·사람·해시태그·북마크·DM·알림·신고
- 완료 기준: 피드·DM e2e 전부

### Phase 6 — 프로필·설정·인증·코칭·기타

- [ ] 프로필·설정 줄 묶음·인증·백업/가져오기·앱 배포·코칭(회원·처방·요약)·404·약관
- 완료 기준: 전체 e2e(기준선 외 새 실패 0) → **배포(minor)** · 화면 지도 보고서 사진 갱신

## 수용 기준

- SRS-069 공용 시각 규칙(색 의미 2 · 빨강은 주 행동·완료에만)이 그대로 지켜진다 — 기존 색 가드 통과.
- SRS-072 나머지 화면 공용 규칙 — 전 화면에 F1~F7 적용, 새 가드 `flat-design.spec.ts` 통과.
- 360px 에서 가로 넘침 없음, 누르는 자리 44px 시험 통과, 다크 모드 사진 확인.

## 테스트 계획

- 단계마다 그 묶음 e2e(`scratchpad/rest-e2e.sh` · 웹 3220 · API 3221) + 끝에 전체 e2e.
- 새 가드 `src/frontend/e2e/flat-design.spec.ts` — 화면 안 Card 의 계산된 border-left-width 0 · border-radius 0, primary 채움 버튼 수 ≤1, 운동 중 완료 세트 줄 배경 투명.
- 단계마다 360px 라이트·다크 사진을 찍어 눈으로 확인(겹침·잘림·대비).

## 위험·주의

- **e2e 색·모양 기대값**: 완료 줄 `--color-ok-soft` 같은 옛 기대가 깨진다 → 규칙이 바뀐 것만 고치고 이유를 적는다(기능 시험은 건드리지 않는다).
- **Card 를 쓰는 떠 있는 곳**(시트 안 카드)이 평평해지면 시트 바탕과 구분이 없어질 수 있다 → Phase 1 에서 시트·확인창 안 Card 를 찾아 boxed.
- 가로로 나란한 Card(flex-1 두 개)는 평평해지면 사이가 사라진다 → 세로선 또는 간격.
- 다른 세션이 같은 파일을 고칠 수 있다 → worktree(wt2)에서 하고 단계마다 main 최신 위로 합친다.
- 라이트 bg 흰색으로 바뀌면 바탕색을 직접 비교하는 시험(coach-bubble 등)이 바뀔 수 있다 → 기대값 확인.
