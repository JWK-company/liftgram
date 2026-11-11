# SPEC-058 — 탭별 ? 사용법 안내 — 실제 화면 짚기 + 연습 블록

> 타입 Spec · 그룹 할일/탭-사용법-안내 · ADStudio가 `SPEC-058.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → SRS-054, SRS-111

## 목표

피드·운동·기록·분석 탭 머리 오른쪽에 ? 버튼을 두고, 누르면 그 탭의 기능과 사용법을 단계별 안내로 보여 준다. 화면만 봐서는 알기 힘든 기능(변형·조합 선택, 세트 방식, 세트 종류, 이전 값 채우기, 길게 눌러 이 종목만, 여유, 한쪽 무게)은 **기록이 남지 않는 연습 블록**에서 직접 눌러 보게 해서, 사용자가 앱의 기능을 최대한 쓰게 한다. 프로필의 「안내 다시 보기」 줄은 뺀다.

사용자 결정: 메시지 id=1828(요청)·1831(「추천대로 진행」).

- 방식은 섞기: 위치와 버튼은 실제 화면에서 짚고(booktarae 방식), 눌러야 이해되는 기능은 연습 블록에서 해 본다.
- 첫 안내 3개(이전 칩·세트 번호·길게 눌러 이 종목만)는 지금처럼 처음 한 번만 뜨고, 다시 보기는 운동 탭 ? 안내가 맡는다.
- ? 버튼은 탭 머리 오른쪽에 둔다.
- 순서는 주요 기능 → 눈으로 봐선 모르는 기능이다.
- 처음에는 ? 에 작은 점만 붙이고 안내를 자동으로 띄우지 않는다.

참고 구현: booktarae `TutorialOverlay`(~/Desktop/tarae/booktarae/src/frontend/app/components/ui/TutorialOverlay.tsx — 실물 위 스포트라이트 + 손짓 시연 + 이전/다음 + 우상단 ×).

## 범위(바꿀 파일)

- 새 파일: `src/frontend/lib/tabGuide.ts`(탭별 대본·본 표식) · `src/frontend/app/components/guide/GuideButton.tsx`(? 버튼 + 점) · `src/frontend/app/components/guide/GuideOverlay.tsx`(스포트라이트 덮개·설명 띠) · `src/frontend/app/components/guide/PracticeBlock.tsx`(연습 블록 9종) · `src/frontend/e2e/tab-guide.spec.ts`
- 기존 파일(한두 줄씩): `src/frontend/app/components/routines/RoutinesClient.tsx`(운동 탭 머리 actions) · `src/frontend/app/components/feed/FeedClient.tsx`(피드 머리) · `src/frontend/app/components/analytics/RecordsHeader.tsx`(기록 머리 — 목록·달력 공용) · `src/frontend/app/components/analytics/StatsClient.tsx`(분석 머리) · `src/frontend/app/components/profile/ProfileClient.tsx`(「안내 다시 보기」 줄 막기) · `src/frontend/e2e/coach-marks.spec.ts`(다시 보기 시험을 ? 안내 기준으로)
- 고치지 않음: `src/frontend/lib/coachMarks.ts`(첫 안내 동작 그대로 — `resetCoachMarks` 는 남김) · `src/frontend/app/components/profile/HintsResetRow.tsx`(파일은 남기고 쓰는 곳만 막는다)

## 설계

**대본(`src/frontend/lib/tabGuide.ts`)**

```ts
type GuideTab = "workout" | "records" | "stats" | "feed";
type GuideStep = {
  title: string;            // 짧은 제목
  body: string;             // 한두 문장
  targets?: string[];       // 짚을 실제 요소 data-testid 후보(앞에서부터 보이는 첫 것)
  practice?: PracticeKind;  // 연습 블록 — 있으면 실제 화면 대신 연습 판을 띄운다
};
type PracticeKind = "prevFill" | "setType" | "scheme" | "variant" | "done" | "longDone" | "rir" | "prFill" | "plate";
```

- 대상(targets)이 지금 화면에 없으면 그 단계는 **설명만**(가운데 띠) 보여 준다 — 빼지 않는다. 사용자가 「그런 기능이 있다」를 알게 하는 것이 목적이다.
- 문구는 한국어로 대본 파일에 직접 둔다. 웹 i18n 이 ko 고정이고, 대본이 길어 core 사전에 넣으면 앱(옛 Expo)과 갈라진 키만 늘어난다. 영어가 붙을 때 사전으로 옮긴다(남은 일).
- 본 표식은 `liftgram.guide.<tab>` = "seen"(이 기기 사실, 동기하지 않음)이다. 한 번 열면 점이 사라진다. `liftgram.hint.suppressed`(e2e 기본)가 있으면 점을 그리지 않는다.

**탭별 대본 — 주요 기능 → 숨은 기능**

| 탭 | 실제 화면 짚기 | 연습 블록 |
| --- | --- | --- |
| 운동 | 오늘 할 운동·시작 · 빠른 운동 · 주간 스케줄·블록 주기 편집 · 새 루틴 · 루틴 가져오기(영상·글) · 프로그램 만들기 · 종목 찾기 · 헬스장 | 이전 값 채우기 · 세트 번호 → 세트 종류(W·D·F·T·B) · 세트 방식(일반·탑+백오프·5×5·피라미드·역피라미드·드롭) · 조합(변형) 선택 — 기록은 조합별로 · 완료 체크 → 휴식 · 슈퍼세트에서 길게 눌러 이 종목만 · 여유(RIR) · 금색 PR 누르면 채움 · 원판 한쪽 무게 |
| 기록 | 목록/달력 전환 · 지난 운동 목록(누르면 상세에서 세트 고치기) · 달력 점·고른 날 · 주간 목표 · 한 달 자랑하기 | — |
| 분석 | 기간 고르기 · 요약 숫자와 지난 기간 대비 · 추정 1RM(Epley) · 최근 PR · 근육 균형 지도 | — |
| 피드 | 추천/팔로잉 · 찾기(해시태그·사람) · 사람 · 메시지 · 알림 · 글쓰기(운동 기록 붙이기) · 글 카드(좋아요·댓글·저장·신고) | — |

**덮개(`GuideOverlay`)**

- `createPortal` 로 body 에 붙인다. 화면 전체를 덮는 투명 판이 **모든 누름을 막는다** — 짚은 실제 버튼도 눌리지 않는다. 운동 시작 같은 실제 기록이 생기지 않게 하기 위해서다(booktarae 와 다른 점).
- 대상 둘레는 어둡게 덮고(SVG 마스크 한 장), 대상에는 강조색 테두리 링과 손짓 물결(탭 1회)을 둔다. 대상이 화면 밖이면 `scrollIntoView({block:"center"})` 뒤 잰다. 크기가 바뀌거나 스크롤되면 다시 잰다.
- 설명 띠는 대상이 위 절반이면 아래, 아래 절반이면 위에 둔다. 구성은 제목 · 본문 · 「n / N」 · [이전] [다음](마지막은 [마치기]) · 우상단 ×(갇히지 않게)이다. Esc 와 뒤로 가기는 닫기로 동작한다.
- `role="dialog" aria-modal="true"` 를 달아 첫 안내(CoachMark)가 위로 뜨지 않게 한다(`src/frontend/lib/overlayPresence.ts` 규칙). 열 때 설명 띠에 초점을 두고, 닫으면 ? 버튼으로 돌려준다.
- 모양은 SPEC-057 규칙을 따른다. 누르는 것은 `--radius-sm`, 떠 있는 띠는 `--radius-lg`, 원형은 아이콘 버튼과 점만.
- (REV-140 반영) 뒤로 가기 닫기는 `src/frontend/lib/useBackToClose.ts` 규약을 쓴다. Tab 초점은 설명 띠 안에서 돈다. `prefers-reduced-motion` 이면 물결·연습 시계 움직임을 끈다. 대상이 sticky 머리(56px)에 가리면 그만큼 스크롤을 보정한다.

**연습 블록(`PracticeBlock`)**

- 설명 띠 안에 그리는 작은 가짜 운동 블록이다. 상태는 컴포넌트 안에만 두고 저장소(repo)·서버를 부르지 않는다. 그래서 기록이 남지 않는다.
- 해내면 「잘했어요」 한 줄이 나오고, 자동으로 넘어가지 않는다(booktarae 규칙). 해내지 않아도 [다음]으로 넘어갈 수 있다.

| 종류 | 해 보는 것 | 해냄 판정 |
| --- | --- | --- |
| prevFill | 「이전 60×10」을 누르면 무게·횟수 칸이 채워진다 | 칸이 채워짐 |
| setType | 세트 번호 「1」 → 종류 목록 → W·D·F·T·B 표시 | 일반이 아닌 종류 |
| scheme | 「세트 방식: 일반 ▾」 → 방식 목록(설명 포함) → 표가 다시 짜임 | 일반이 아닌 방식 |
| variant | 「조합 ▾」 → 브랜드·부착물 → 이전 칸이 그 조합 기록으로 바뀜(없으면 –). 문구는 ADR-034 기준: 조합 키는 브랜드·적재·부착물·그립, 세트 옵션에서 팔·그립은 이 세트만·부착물은 종목 전체, 기구를 바꾸면 다른 종목 | 조합이 바뀜 |
| done | ✓ 를 누르면 줄이 완료되고 휴식 막대가 흐른다(연습용 빠른 시계) | 완료 |
| longDone | 슈퍼세트 두 종목 — 짧게 누르면 묶음 전체, 길게(0.5초) 누르면 이 종목만. 키보드는 Enter/Space 를 0.5초 이상 누르고 있으면 길게로 본다(REV-140) | 길게 눌러 한 종목만 |
| rir | 여유 칸 → 0·1·2·3·4+ | 값을 고름 |
| prFill | 금색 「PR 80kg×5」를 누르면 다음 세트에 채워짐 | 채워짐 |
| plate | 한쪽 무게 켜기/끄기 — 칸에는 적은 한쪽 20kg 이 남고, 볼륨·PR 은 양쪽(×2) 40kg 로 계산됨을 보여 줌(앱 문구 `variant.plateOneSideHint` 와 같은 말) | 켜고 끔 |

**? 버튼(`GuideButton`)**

- `AppBarAction` 과 같은 44px 원형 아이콘 버튼(`help-circle-outline`, R3 아이콘 버튼)이다. 라벨은 「이 탭 사용법」, testId 는 `guide-<tab>` 이다.
- 안 본 탭이면 오른쪽 위에 6px 강조색 점을 둔다(R3 점).
- (REV-140) 피드는 로그인 뒤 화면에만 둔다(로그인 전 가입 안내 화면에는 설명할 기능이 없다). 기록 머리는 달력이 넘기는 actions 뒤에 ? 를 붙여 목록·달력 모두 맨 오른쪽에 둔다.

## 작업 단계

### Phase 1 — 대본·덮개·? 버튼(실제 화면 짚기)

- [x] `src/frontend/lib/tabGuide.ts` 대본 4탭 + 본 표식 + 점 숨김(suppressed)
- [x] `src/frontend/app/components/guide/GuideOverlay.tsx` 스포트라이트·설명 띠·이전/다음/×·Esc·초점·누름 차단
- [x] `src/frontend/app/components/guide/GuideButton.tsx` 를 피드·운동·기록·분석 머리에 단다

완료 기준: 타입 검사 통과, 4탭에서 ? → 첫 단계 링이 대상 위에 그려지고, 마지막 단계에서 닫힌다

### Phase 2 — 연습 블록

- [x] `src/frontend/app/components/guide/PracticeBlock.tsx` 9종(위 표) — 저장소 호출 없음
- [x] 운동 탭 대본에 연습 단계 연결, 해냄 표시

완료 기준: 9종 각각 해냄 판정이 e2e 로 확인되고, 연습 중 서버 요청(/api 쓰기)이 0건이다

### Phase 3 — 「안내 다시 보기」 빼기·시험

- [x] `src/frontend/app/components/profile/ProfileClient.tsx` 의 `HintsResetRow` 를 `[원본]` 주석으로 막는다
- [x] `src/frontend/e2e/coach-marks.spec.ts` 의 다시 보기 시험을 「프로필에 줄 없음」으로 바꾼다(첫 안내 시험은 그대로)
- [x] `src/frontend/e2e/tab-guide.spec.ts` — 4탭 ? 존재·점·열기·이전/다음·Esc·누름 차단(짚은 실제 버튼을 눌러도 화면이 안 바뀜)·연습 9종·360px 넘침 없음

완료 기준: 새 시험·관련 기존 시험(coach-marks·피드 머리 한 줄) 통과 → 메인 세션에 합치기 보고(배포는 메인이 SPEC-057 과 묶어서)

## 수용 기준

- SRS-111(숨은 동작 안내): 숨은 동작 셋(이전 칩·세트 번호·길게 눌러 이 종목만)과 변형·세트 방식·여유·한쪽 무게를 운동 탭 ? 안내에서 언제든 다시 볼 수 있고, 연습 블록에서 해 볼 수 있다.
- SRS-054(앱바 2형): 탭 첫 화면 머리 오른쪽에 ? 아이콘이 있고, 피드 머리는 360px 에서 제목과 한 줄을 유지한다.
- 안내 중에는 실제 화면이 눌리지 않고, 연습 블록은 기록을 남기지 않는다.
- 프로필에 「안내 다시 보기」가 없다.

## 테스트 계획

- `cd src/frontend && bunx tsc --noEmit` · biome 검사.
- 로컬 운영 빌드(새 DB · 웹 3310 · API 3311 — 3100·3200 은 메인 세션)에서 `BASE=http://127.0.0.1:3310 bunx playwright test e2e/tab-guide.spec.ts e2e/coach-marks.spec.ts` 와 피드 머리 시험을 돌린다.
- 연습 중 기록이 남지 않는지: `page.on("request")` 로 POST·PUT 을 센다.

## 위험·주의

- 피드 머리 아이콘이 5개가 된다(🔍·👤·💬·🔔·?). 360px 한 줄 시험이 깨지면 ? 를 머리 대신 피드 탭 줄 오른쪽에 둔다(대안을 EXE 에 적는다).
- 대상 testId 가 바뀌면 안내가 「설명만」으로 조용히 떨어진다 → e2e 에서 탭마다 「짚기 단계 중 대상이 보인 단계 수 ≥ 1」을 확인한다.
- SPEC-057(모양 통일)이 같은 머리·버튼 파일을 고친다 → 기존 파일 변경은 actions 한 줄씩으로 줄이고, 합칠 때 메인 세션이 겹침을 푼다.
- 연습 블록이 실제 블록과 모양이 어긋나 헷갈릴 수 있다 → 실제와 같은 칸 이름·순서(세트·이전·kg·횟수·여유·✓)와 SPEC-057 모양을 쓰고, 띠 위에 「연습 — 기록되지 않아요」를 늘 표시한다.
