# SPEC-030 — 피드 발견 탭을 추천 탭으로 바꾼다

> 타입 Spec · 그룹 할일/피드-추천-탭 · ADStudio가 `SPEC-030.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

### 목표

발견 탭은 돋보기 화면과 겹치므로 없앤다. 피드를 팔로잉·추천 두 탭으로 나누고, 추천에는 공개 글을 규칙 점수로 보여 주며 광고 칸을 더 자주 둔다. 낯선 사람에게 글이 가므로 공개 범위 선택, 내 글 추천 끄기, 신고 자동 숨김, 만 14세 확인을 함께 넣는다(사용자 결정 2026-11-05).

### 범위

- `src/proto/feed/v1/feed.proto` · `src/proto/auth/v1/auth.proto` · `src/database/queries/feed.sql` · `src/database/queries/moderation.sql` · `src/database/migrations/0024_feed_recommended.sql`
- `src/backend/internal/feed/service.go` · `src/backend/internal/feed/repo.go` · `src/backend/internal/feed/handler.go` · `src/backend/internal/moderation/service.go` · `src/backend/internal/auth/handler.go`
- `src/frontend/app/components/feed/FeedClient.tsx` · `src/frontend/app/components/feed/RecommendedFeed.tsx` · `src/frontend/app/components/feed/VisibilityPicker.tsx` · `src/frontend/app/components/feed/PostCard.tsx` · `src/frontend/app/components/feed/OwnPostMenu.tsx`
- `src/frontend/app/components/session/ShareWorkout.tsx` · `src/frontend/app/components/profile/RecommendOptOutRow.tsx` · `src/frontend/app/components/profile/AuthClient.tsx` · `src/frontend/app/terms/page.tsx`
- `src/core/src/domain/adPolicy.ts` · `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts`
- `src/frontend/e2e/feed-recommended.spec.ts` 와 가입·발견 탭을 쓰는 기존 e2e

### 설계

- 후보: 공개·승인 글 중 2026-11-12 시행 이후 글(`FEED_RECOMMEND_SINCE`). 내 글, 양방향 차단, 내가 좋아요하거나 신고한 글, 추천을 끈 작성자를 뺀 뒤 최신 2000개. 팔로우한 사람의 글은 빼지 않고 섞는다.
- 점수: (1 + 좋아요) × 관심도 ÷ (경과 시간 + 2)^1.2, 경과 시간 단위는 시간, 음수는 0. 동점은 작성 시각, id 순.
- 관심도: 기본 1. 최근 좋아요 100개·내 글 30개의 해시태그와 겹치면 +0.5, 내 글 30개의 종목과 겹치면 +0.5. 종목 키는 ExerciseID·exerciseId 둘 다 읽고, 배열이 아닌 행은 빈 배열로 본다.
- 다양성: 같은 작성자의 두 번째 글부터 0.7을 거듭 곱한다.
- 쪽 나누기: offset 상한 500, n+1로 다음 쪽 판정, `next_offset` 0이면 끝. 쪽 사이 겹침은 id로 거르고 누락은 받아들인다.
- 탭: 시행일 전에는 팔로잉·발견, 이후 팔로잉·추천. 추천은 `?tab=recommended`로 복귀하고, 한 번 열면 숨겨 두어 목록을 유지한다. 팔로우하면 팔로잉을 돌아올 때 다시 읽는다.
- 공개 범위: 글쓰기·운동 공유·글 수정에서 전체 공개·팔로워만·나만 보기를 고른다. 기본은 전체 공개이고 추천될 수 있다고 안내한다.
- 내 글 추천 끄기: `users.recommend_opt_out`, 프로필 줄 하나. 기본은 켜짐.
- 신고 자동 숨김: 서로 다른 3명의 미처리 신고가 쌓이면 `moderation_status = pending`으로 숨기고 기존 검토 대기열로 보낸다. 삭제하지 않는다. 기각하면 돌아오고 처리된 신고는 다시 세지 않는다.
- 만 14세 확인: 이메일 가입은 확인 칸과 서버 `age_confirmed` 검사. 소셜 시작은 안내 문구. 약관에 조건 추가. 로그인 없는 기록은 나이 제한 없음.
- 광고: 추천은 6번째 글 뒤부터 3개마다(ADR-053), 팔로잉은 6개 그대로. 실광고는 없다.
- 사람 찾기: `/discover` 주소와 빈 팔로잉의 사람 찾기는 유지한다.
- 행동 기록을 새로 모으지 않는다. 체류 시간을 수집하지 않는다. 추천 관심도를 광고에 쓰지 않는다.

### 작업 단계

- [x] proto·SQL·서비스·핸들러와 Go 시험
- [x] 추천 화면, 탭 교체, 팔로우 버튼
- [x] 공개 범위, 추천 끄기, 신고 자동 숨김, 14세 확인
- [x] 광고 간격, e2e

### 수용 기준

- SRS-007: 시행일 뒤 피드 탭은 팔로잉·추천 둘이고 발견이 없다.
- 추천에는 내 글, 차단 관계의 글, 비공개·팔로워 공개 글, 내려간 글, 시행 전 글, 끈 작성자의 글이 없다.
- 서로 다른 작성자이고 관심도가 같을 때 좋아요가 같으면 최근 글이 위, 나이가 같으면 좋아요 많은 글이 위다.
- 추천에서 팔로우하면 버튼이 바뀌고 팔로잉 탭에 그 사람의 글이 나온다.
- 서로 다른 3명이 신고하면 글이 검토 대기로 숨고, 기각하면 돌아온다.
- 만 14세 확인 없이는 이메일 가입이 되지 않는다.
- 추천의 광고 칸은 6번째 글 뒤부터 3개마다이고 운동 중에는 없다.

### 테스트 계획

- `src/backend/internal/feed/repo_pg_test.go`: 제외 조건, 순서, 다양성, 관심도, JSON null. `LIFTGRAM_TEST_DATABASE_URL`을 지정해 실행하고 건너뛰지 않았는지 확인한다.
- `src/backend/internal/moderation/repo_pg_test.go`: 자동 숨김과 복구
- `src/core/src/domain/__tests__/adPolicy.test.ts`
- `src/frontend/e2e/feed-recommended.spec.ts`, 전체 e2e

### 위험·주의

- 시행 직후에는 추천 후보가 적어 탭이 한동안 비어 있을 수 있다.
- 여러 계정으로 신고하면 글을 숨길 수 있다. 숨김만 하고 삭제는 사람이 정하므로 피해를 제한한다. 운영하며 숫자를 조정한다.
- 팔로우가 극단적으로 많은 사용자는 아니어도, 차단·좋아요 조건 때문에 글이 많아지면 실행 시간을 다시 재야 한다. 글 크기가 상한에 가까우면 종목 비교가 느려질 수 있다.
- 사진 자동 검사는 범위 밖이고 사용자 선택을 기다린다.
- 법률 판단은 2차 자료 기준이다.
