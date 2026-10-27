# Project Spec — 화면 정리(정보는 그대로, 소음은 덜어 내기)

> 생성일: 2026-10-27 · 등급: **Feature × 4 Phase**(프론트 위주 · 공용 조각 + 화면 6종 + 나머지 점검 · 스키마 변경 없음)
> 추적: URS-023 · SRS-069(P1) · SRS-070(P2) · SRS-071(P3) · SRS-072(P4)
> 근거: 전수 검사 보고서(claude.ai artifact ADULRE6tUBr8wuSUGRA6w7 · 요약 `.ouroboros/docs/report/20261027_declutter-proposal_report.md` · 캡처 scratchpad `declutter/shots/`)
> 사용자 결정(2026-10-27): **전부 권장안** — D1 C+A · D2 표 머리 · D3 금색 글자 한 줄 · D4 회색 숫자 · D5 종목 줄에 합치기 · D6 정리 · D7 2칸 버튼 · D8 카드 없애고 막대만 · D9 최근+작은 칩(이름 없는 커스텀 숨김) + 결함 7건

## 작업 의도
최근 두 주 동안 기능이 크게 늘며(PR 칩 2·kg/lb·기록 칸 조합·처방 근거·픽토그램·완료 시트·총평·다시 시작) 화면마다 같은 무게의 상자·빨강·반복 문구가 쌓였다. **데이터·동작·기능은 그대로 두고**, 무엇을 늘 보이게 하고 어떻게 보이게 할지만 바꾼다.

## 기준선(2026-10-27 점수표 · 390×844 첫 화면 육안 집계)
| 화면 | 정보 요소 | 칩·배지 | 강조색 | 글자 단계 | 비고 |
|---|---|---|---|---|---|
| 운동 블록 | 52 | 9 | 7 | 6 | 360×640 첫 세트 체크 top 486px |
| 완료 요약 | 34 | 2 | 4 | 6 | PR 8줄 반복 |
| 기록 상세 | 41 | 3 | 2 | 5 | 배지·주석 반복 |
| 피드 운동 카드 | 18 | 3 | 4 | 5 | 버튼 글자 꺾임 |
| 운동 탭 홈 | 27 | 3 | 5 | 5 | 진행 중 2번 |
| 변형 시트 | 28 | 24 | 3 | 3 | 브랜드 칩 16 |
| 분석 | 30 | 7 | 2 | 5 | 1RM 두 섹션 |
| 종목 탭 | 26 | 14 | 2 | 3 | EZ바 맨 위 |

## 확정 결정
| # | 결정 | Phase |
|---|------|-------|
| D1 | **C(위계 재정렬)를 전 화면 공통 규칙**, A(접기)는 블록 부가 행동·요약 PR(→D5 로 대체)·시트 브랜드(→D9) 에만 | 전부 |
| D2 | kg/lb 는 세트 표 머리 「무게」 칸 안(`무게 kg│lb`) | P1 |
| D3 | PR = 금색 글자 한 줄 「PR 100kg×10 · 볼륨 PR 60kg×10」 — 각 조각 누르면 채우기(지금 동작), ⓘ(기록으로) 유지 | P1 |
| D4 | 이전 기록 칸 = 테두리 없는 회색 숫자(누르면 채우기 그대로) | P1 |
| D5 | 요약 PR 목록 → 종목별 기록 줄 오른쪽 금색 「PR n」 | P2 |
| D6 | 기록 상세: 「한쪽 입력(볼륨 ×2)」 종목 머리 1회 · 빈 RPE 열 숨김 · 추정 주석 1회 | P2 |
| D7 | 피드 운동 카드: 숫자 한 줄 메타 + 「종목 n개 보기」 링크 + 2칸 버튼 [바로 시작(채움)][루틴 가져오기] · 「운동」 배지·자동 문구 제거 | P3 |
| D8 | 홈 진행 중 카드 제거 → 하단 진행 막대(열기·취소) 하나 | P3 |
| D9 | 칸 시트: 최근 쓴 브랜드(≤3) 위 줄 + 나머지 작은 무채 칩 · 라벨 없는 custom1~3 숨김 · 순서 브랜드→적재→한쪽→기구 바꾸기 | P3 |
| F1 | 피드 카드 버튼 글자 꺾임 | P3 |
| F2 | 피드 + 버튼(FAB)이 마지막 글을 가림 — 목록 끝 여백 | P3 |
| F3 | 블록 순서 화살표가 픽토그램과 겹침 | P1 |
| F4 | 휴식 막대가 시트 배경(스크림) 위로 뜸 | P3 |
| F5 | lb 종목 1RM 이 kg 로 표시(요약·기록 상세) | P2 |
| F6 | 종목 탭 기본 정렬에서 「EZ바 …」가 맨 위 | P3 |
| F7 | 빠른 운동 이름이 모두 「빠른 운동」 | P3 |

## 공용 규칙(P1 에서 만들고 이후 Phase 가 따른다)
1. **색 의미 2개**: `--color-brand`(빨강) = 주 행동·완료·선택 상태, `--color-pr`(금색) = PR. 그 밖의 상태·메타는 `--color-ink2`/`--color-ink3`. 경고(`--color-warn`)·오류(`--color-bad`)는 의미 색으로 예외 유지. **새 색 토큰을 만들지 않는다**(원본 `src/core/src/theme/tokens.ts` 변경 없음).
2. **글자 4단계**: 한 화면 안에서 `title`·`heading`·`body`·`caption` 만. `label` 변형은 `caption` + `font-semibold` 로 흡수(기존 호출은 그대로 두고 새 코드에서 쓰지 않음 — primitives.tsx 의 `label` 정의는 보존). `display` 는 요약 큰 숫자 전용.
3. **조각(새 공용 컴포넌트 · `src/frontend/app/components/ui/quiet.tsx`)**
   - `MetaLine` — 회색 caption 한 줄, 조각을 「 · 」로 잇는다. 조각은 텍스트·누를 수 있는 텍스트(`MetaAction`, 최소 높이 32px, `aria-label`) 혼용.
   - `QuietChip` — 무테·무채(배경 `--color-surface-alt`) 작은 칩. 선택 상태만 브랜드 테두리.
   - `Fold` — 「▸ 라벨」 한 줄 접기. 펼침 상태는 **기기 로컬 기억**(localStorage `fold:<scope>:<key>`, 실패 시 접힘), 동기 대상 아님.
   - `PrText` — 금색 caption 조각(누르면 콜백). 다크는 `--p-pr` #FFD23F.
4. **testid 유지 원칙**: 기존 `data-testid` 는 지우지 않는다. 요소의 생김새가 바뀌어도 같은 역할의 요소에 같은 testid 를 단다. 접힌 곳 안으로 들어간 요소는 e2e 가 `Fold` 를 펼친 뒤 찾도록 **e2e 를 바꾼다**(아래 목록). 새 요소는 새 testid.

## Phase 1 — 공용 조각 + 운동 블록 (v0.39.0 · SRS-069)
- `ui/quiet.tsx`(신규) · `ui/UnitToggle.tsx`(표 머리용 `compact` 모양 추가) · `ui/RecordSlotSelector.tsx`(트리거를 `MetaAction` 모양으로 — `variant-trigger` 유지)
- `session/ExerciseBlock.tsx`
  - 머리: [▲▼(F3: 픽토그램 왼쪽 별도 열, 겹침 없음)] [픽토그램] [이름] [오른쪽: 회색 볼륨 숫자 `ex-volume`(신규 testid) · ⋯]
  - 이름 아래 `MetaLine`: 기록 칸 조합(누르면 칸 시트) · 슈퍼셋 표시 · 체중 미설정 경고(경고색 유지)
  - 그 아래 `PrText` 한 줄: 「PR 100kg×10」(`pr-chip-weight`) · 「볼륨 PR 60kg×10」(`pr-chip-volume`) · 같은 세트면 `pr-chip-both` · 각 ⓘ(`pr-chip-*-history`) 유지
  - `prev-slot` 줄(「이전 기록 · 조합」)은 **지운다** — 이전 기록은 늘 지금 칸에서 읽으므로 「다를 때」가 일어나지 않는다(/qa code L-4 정정)
  - `Fold`(scope=block, key=exerciseId): 운동 방법(ExerciseTipPanel) · 다른 조합(`btn-other-slots`) · 이전기록 지우기(`prev-clear`)
  - 표 머리 「무게」 칸에 `UnitToggle compact`(`unit-toggle` 유지). 한쪽 입력이면 「한쪽 kg│lb」
- `session/SetRowEdit.tsx`: 이전 칸 테두리·배경 제거 → 회색 숫자(`set-prev` 유지, 누를 수 있음 표시는 밑줄 점선)
- 빨강 정리: 블록 안 브랜드색은 세트 체크(완료)·「＋ 세트 추가」 텍스트 버튼만. 슈퍼셋 컨테이너 테두리는 `--color-line-strong` + 「슈퍼셋」 caption.
- 측정(좌표 e2e `declutter-block.spec.ts`): 360×640·390×844 에서 첫 세트 `set-done` top ≤ 320(360)·≤ 300(390), 블록 머리 안 `border-color == brand` 요소 0, 픽토그램·화살표 사각형 겹침 0.

## Phase 2 — 요약·기록 상세·분석 (v0.40.0 · SRS-070)
- `session/WorkoutSummary.tsx`: 큰 숫자 4개 유지(`summary-volume`·`summary-prs` 등) → 종목별 줄 목록(`summary-breakdown`, 종목·세트 수·볼륨·회색 1RM·오른쪽 금색 「PR n」) — **`summary-pr-list` testid 는 이 종목 줄 목록 컨테이너로 옮긴다**(workout.spec 의 「벤치프레스」 포함 검사 유지). 부가 행동 한 줄(`btn-summary-make-routine`·`btn-summary-replay`·공유) + 주 버튼 「완료」(`btn-summary-close`). 공유 한마디 입력은 공유 시트 안으로, 총평(`WorkoutNoteField`)은 유지.
- `analytics/WorkoutDetailClient.tsx`: 종목 머리 MetaLine(조합 · 「한쪽 입력(볼륨 ×2)」 1회 · 볼륨 · 1RM 입력 단위) · 세트 줄에서 「한쪽 ×2」 배지 제거 · RPE 전부 null 인 종목은 RPE 열 숨김 · Epley 주석은 화면 끝 1회
- F5: 1RM 표시를 블록 단위 기준으로 — `displayWeight`(blockUnit) 경유. 요약·상세·분석의 1RM 표시 경로 전수(grep `oneRm|e1rm|estimated1RM`).
- `analytics/StatsClient.tsx`·`ExerciseProgress.tsx`: 「추정 1RM」·「최근 PR」 중복 → 한 섹션, 「추정치」 태그 7개 → 섹션 주석 1줄.

## Phase 3 — 홈·피드·칸 시트 + 결함 (v0.41.0 · SRS-071)
- D8 `routines/RoutinesClient.tsx`: 진행 중 카드(`resume-card`·`btn-resume`·`btn-active-menu`) 렌더 중단(코드 보존 — 주석 처리). 하단 `GlobalWorkoutBar` 가 홈에서도 보이는지 확인(지금 `/workout` 외 전 화면 표시). `WeekSummary.tsx` 한 줄 막대+숫자.
- D7·F1 `feed/WorkoutBox.tsx`·`PostCard.tsx`: 숫자 한 줄 MetaLine · `post-routine-toggle` → 「종목 n개 보기」 링크 · `post-start-now`(채움)·`post-routine-import`(외곽) 2칸 그리드(`grid-cols-2`, `whitespace-nowrap`) · 「운동」 배지·자동 본문(공유 시 자동 생성 문구) 표시 제거(저장 데이터는 그대로).
- F2 `feed/FeedClient.tsx`: 목록 하단 패딩 = FAB 높이(56)+여백+`--shell-workout-bar`.
- D9 `ui/RecordSlotSelector.tsx`: 최근 브랜드 = 그 종목 완료 블록의 variant brand 최근순 ≤3(저장소 함수 `getRecentBrands(exerciseId)` 신규 — `workoutRepository`), 나머지 `QuietChip`; custom1~3 은 `machineVariantLabels[i]` 가 빈 값이면 숨김(지금 선택된 칸이면 예외로 보임); 순서 브랜드→적재→한쪽→기구 바꾸기(`swap-equipment` 맨 아래).
- F4 휴식 막대 겹침: 원인 확인 후 수정(아래 QA Q4 — `RestBar` sticky z-40 이 `main` 안, 스크림은 `#modal-root` fixed z-50 인데 겹친다는 관찰 → 쌓임 맥락(stacking context) 확인. 시트가 열리면 RestBar 숨김 또는 modal-root 를 최상위 쌓임 맥락으로).
- F6 `CatalogClient.tsx`: 기본 정렬 `localeCompare(nameKo, 'ko')` + 한글이 영문 접두보다 먼저(표시 이름 기준).
- F7 빠른 운동 이름: 완료 시 이름이 비었거나 기본값이면 `suggestRoutineName` 규칙(`core/src/domain/routineDiff.ts`)으로 「등 · 3종목」 — 사용자가 이름을 바꿨으면 유지.

## Phase 4 — 나머지 화면 점검 (v0.41.x · SRS-072)
- 대상: 종목 탭·종목 상세·피커·검색·루틴 편집·분석·프로필·설정·장비함·코칭·DM·알림.
- 선택형 칩(필터·세트 타입)은 테두리 유지, 상태 칩은 MetaLine 으로. 화면별 빨강 ≤ 2종.
- 전 화면 재캡처(390 라이트·다크·360) + 기준선 점수표 대비 리포트 `.ouroboros/docs/report/2026MMDD_declutter-after_report.md`.

## e2e 영향(바꿔야 하는 것)
| 파일 | 지금 기대 | 바뀜 |
|---|---|---|
| `record-slots.spec.ts` | `btn-other-slots` 가 바로 보임 | `Fold` 펼침 후 클릭(헬퍼 `블록_더보기()`) |
| `record-slots.spec.ts` | `prev-slot` 에 「일자바」 | `prev-slot` 제거 → `variant-trigger` 로 검증(/qa code L-4) |
| `routines.spec.ts`·`unit-toggle.spec.ts` | `resume-card` 보임/없음 | P3 후 홈엔 늘 없음 → 하단 막대(`global-workout-bar` 계열) 로 검사 |
| `workout.spec.ts` | `summary-pr-list` 에 종목명 | testid 가 종목 줄 목록으로 이동 — 그대로 통과해야 함 |
| `session.spec.ts`·`session-assist.spec.ts` | `pr-chip-*` | 같은 testid(글자 모양) — 통과해야 함 |
| `history-replay.spec.ts` | `post-start-now` | 같은 testid — 통과해야 함 |
| 운동 방법·`prev-clear` 사용 e2e | 바로 보임 | `Fold` 펼침 |

## 시각 회귀 검증(Phase 마다)
1. 새 DB 로컬 운영 빌드 + 시드(보고서 때의 시드 스크립트 재사용·정비 — `frontend/.declutter` 는 지워졌으니 `e2e/fixtures/declutter-seed.ts` 로 저장소에 둔다).
2. 대상 화면을 390 라이트·다크·360×640 캡처 → `.ouroboros/docs/spec/20261027_declutter/shots/p{n}/` 전후 비교.
3. 좌표 e2e(측정 기준)와 계산 스타일 검사(브랜드색 사용처 카운트)를 커밋.
4. 운영 배포 후 390 라이트·다크 육안 확인.

## 리스크
| 리스크 | 대응 |
|---|---|
| 정보가 접혀 「기능이 사라졌다」고 느낌 | 접는 곳은 3곳만 · 「▸ 더 보기」 한 줄은 늘 보임 · 펼침 기억 |
| 금색 글자가 눌러지는 것으로 안 보임 | `MetaAction` 점선 밑줄 + 최소 32px 높이 + aria-label |
| e2e 대량 실패 | testid 유지 원칙 · 바뀌는 e2e 목록을 Phase 별 선반영 |
| 홈 진행 중 카드 제거로 이어서 하기 경로가 약해짐 | 하단 막대가 홈에서 보이는지 e2e · 막대에 「열기」 |
| 공용 조각 교체로 다른 화면 회귀 | P1 은 블록만 적용, 나머지는 P4 에서 화면별로 |

## /qa spec 반영 (2026-10-27 — 조건부 통과 · 아래가 위 본문보다 우선)
근거: `.ouroboros/docs/qa/20261027_declutter-spec_qa.md`

| QA | 바뀐 결정 | 적용 |
|----|-----------|------|
| Q1 | `QuietChip` 글자 = `--color-ink2`(ink3 는 surface-alt 위 4.31:1 미달) · `MetaLine` ink3 는 카드(흰) 바탕에서만 · 대비 ≥4.5 계산 스타일 검사 | P1 |
| Q2 | D7 「자동 문구 제거」 = 공유 시 `autoCaption()` 을 만들지 않음(빈 한마디 = 본문 없음, 서버 빈 본문 허용 확인) · 기존 게시물 불변 | P3 |
| Q3 | e2e 표에 `tip-toggle`(pictogram.spec) 추가 · 공용 헬퍼 `블록_더보기()` 를 `e2e/helpers` 로 | P1 |
| Q4 | F4 는 쌓임 맥락 재현 e2e(`elementFromPoint`) 먼저 → 재현 시 수정 / 미재현 시 닫음 | P3 |
| Q5 | 홈 막대·이번 주 요약 겹침 좌표 검사 · `routines.spec` resume 시나리오 → `global-workout-bar` · 카드 폐기는 `global-workout-cancel` 로 대체 | P3 |
| Q6 | `Fold` 기억은 블록 전체가 하나 — 종목별 기억 안 함. **이번 운동 동안만**(`fold:block:<운동 id>` · /qa code M-1 보완) | P1 |
| Q7 | PR 조각 간격 8px·높이 ≥32px · ⓘ 는 조각 안 아이콘이며 **누르면 기록으로**(길게 누르기 안 씀) · 넘치면 두 줄 | P1 |
| Q8 | 표 머리 토글은 라벨 없는 「kg│lb」(`compact`) · 한쪽이면 칸 라벨 위 caption 「한쪽」 · 360 좌표 검사 | P1 |
| L1~L3 | `label` 미사용은 리뷰 체크리스트 · EZ바는 정렬만 · F7 자동 이름은 새 완료분부터 | P1·P3 |
