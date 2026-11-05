# SPEC-030 — 피드 발견 탭을 추천 탭으로 바꾼다

> 타입 Spec · 그룹 할일/피드-추천-탭 · ADStudio가 `SPEC-030.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

### 목표

발견 탭은 돋보기 화면과 기능이 겹치므로 없앤다. 피드를 팔로잉·추천 두 탭으로 나누고, 추천에는 팔로우하지 않은 사람의 공개 글을 규칙 점수로 보여 주며 광고 칸을 팔로잉보다 자주 둔다(사용자 결정 2026-11-05: 규칙 기반, 실광고는 나중).

### 범위

- `src/proto/feed/v1/feed.proto` · `src/database/queries/feed.sql` — `ListRecommended`
- `src/backend/internal/feed/service.go` · `src/backend/internal/feed/repo.go` · `src/backend/internal/feed/handler.go` 와 시험
- `src/frontend/app/components/feed/FeedClient.tsx` · 새 `src/frontend/app/components/feed/RecommendedFeed.tsx` · `src/frontend/app/components/feed/PostCard.tsx`
- `src/core/src/domain/adPolicy.ts` 와 시험, `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts`
- `src/frontend/e2e/feed.spec.ts` · `src/frontend/e2e/history-replay.spec.ts` · `src/frontend/e2e/declutter-p3.spec.ts`
- `ads-docs/liftgram/wireframe/.screen-map/data.py` — 화면 지도

### 설계

- 후보: 공개·승인 글 중 최신 2000개에서 내 글, 팔로우한 사람의 글, 양방향 차단을 뺀다.
- 점수: (1 + 좋아요) × 관심도 ÷ (경과 시간 + 2)^1.2. 댓글 수는 내려간 댓글까지 세므로 쓰지 않는다(`ListExplore`와 같은 판단).
- 관심도: 기본 1. 내가 최근 쓰거나 좋아요한 글의 해시태그와 겹치면 +0.5, 내 최근 글의 종목과 겹치면 +0.5.
- 다양성: 같은 작성자의 두 번째 글부터 점수에 0.7을 거듭 곱한다.
- 쪽 나누기: offset. 점수가 움직여 겹칠 수 있으므로 앱에서 id로 거른다. offset 상한 500.
- 화면: 탭은 팔로잉·추천, 첫 화면은 팔로잉. 추천은 처음 열 때 받는다. 글 머리에 팔로우 버튼을 둔다.
- 사람 찾기: 팔로잉이 비었을 때의 사람 찾기와 `/discover` 주소는 유지한다.
- 광고: 추천은 글 3개마다 광고 칸, 팔로잉은 6개 그대로. 실광고는 없어 관리자 미리 보기로만 보인다.
- 행동 기록은 새로 모으지 않는다. 체류 시간을 수집하지 않는다.

### 작업 단계

- [ ] proto·SQL·서비스·핸들러와 Go 시험
- [ ] 추천 화면, 탭 교체, 팔로우 버튼
- [ ] 광고 간격
- [ ] e2e·화면 지도 갱신, `make verify`

### 수용 기준

- SRS-007: 피드 탭은 팔로잉·추천 둘이고 발견이 없다.
- 추천에는 내 글, 팔로우한 사람의 글, 차단 관계의 글, 비공개·팔로워 공개 글, 내려간 글이 없다.
- 좋아요가 같으면 최근 글이 위, 나이가 같으면 좋아요 많은 글이 위다.
- 추천에서 팔로우하면 버튼이 바뀌고 팔로잉 탭에 그 사람의 글이 나온다.
- 추천의 광고 칸은 글 3개마다이고 운동 중에는 없다.
- 팔로잉이 빈 사용자는 그 자리에서 사람을 찾을 수 있다.

### 테스트 계획

- `src/backend/internal/feed/` 저장소 시험: 제외 조건과 순서
- `src/core/src/domain/__tests__/adPolicy.test.ts`
- `src/frontend/e2e/feed.spec.ts`: 탭, 추천, 팔로우
- `make verify`

### 위험·주의

- 글이 적은 지금은 추천 효과가 작다.
- SQL이 글 수에 비례해 느려질 수 있어 후보를 2000개로 자른다. 운영 규모에서 실행 계획을 확인한다.
- 사용자별 종목 근거는 글에 실린 종목뿐이다. 기기 운동 기록은 쓰지 않는다.
- `/discover` 입구가 줄어 사람 찾기는 돋보기로 간다. 돋보기에 사람 검색이 있다.
