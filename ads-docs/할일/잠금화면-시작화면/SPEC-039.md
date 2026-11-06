# SPEC-039 — 공식 계정 예시 글 20개와 피드 탭·스토리 재배치

> 타입 Spec · 그룹 할일/잠금화면-시작화면 · ADStudio가 `SPEC-039.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-060, SRS-091

### 목표

공식 계정의 AI 사진 예시 글 20개를 운영에 올리고, 글에서 루틴을 실제로 가져오게 한다. 추천 탭을 앞에 두고 스토리 줄을 두 탭에 보인다.

### 범위

- src/database/migrations/0032_post_official_meta.sql
- src/proto/feed/v1/feed.proto와 생성물
- src/backend/internal/feed/repo.go, src/backend/internal/feed/service.go, src/backend/internal/feed/handler.go와 sqlc 생성물
- src/frontend/app/components/feed/FeedClient.tsx, src/frontend/app/components/feed/PostCard.tsx, src/frontend/app/components/feed/OfficialRoutineCard.tsx
- src/frontend/app/components/routines/CreatorRoutineSheet.tsx
- src/core/src/i18n/locales/ko.ts, src/core/src/i18n/locales/en.ts
- src/scripts/feed-seed/ 와 src/scripts/seed-official-feed.mjs
- src/frontend/e2e/ 의 피드 시험

### 설계

- posts에 official_meta jsonb를 더한다. 값은 ai_notice(virtual_person, ai_photo)와 creator_routine_id다. 사용자 요청으로는 쓸 수 없고 시드만 넣는다.
- Post 응답에 official을 더한다. 있으면 카드가 배지와 AI 고지, 루틴 칸을 그린다.
- 「루틴 가져오기」는 기존 크리에이터 시트를 연다. 출처, 고지, 종목, 저장, 중복 확인을 그대로 쓴다. 숨긴 루틴이나 모르는 id면 칸을 그리지 않는다.
- 시드는 한 번 실행하는 스크립트다. 고정 id라 다시 돌려도 겹치지 않고 --remove로 걷는다. 공식 계정은 비밀번호 없이 만들어 로그인할 수 없고 통계에서 뺀다.
- 루틴 데이터가 큰 만큼 카드는 공식 글이 있을 때만 불러온다.

### 작업 단계

- [ ] 사진 고르기와 글 20개 작성
- [ ] 마이그레이션, proto, sqlc, 서버
- [ ] 화면과 저장 흐름, 탭·스토리
- [ ] 시드 스크립트와 로컬 확인
- [ ] 시험, 코드 리뷰, 커밋, 배포, 운영 시드

### 수용 기준

- SRS-007: 피드를 열면 추천이 먼저 보이고, 공식 글 20개가 나오며 스토리 줄이 두 탭에 있다.
- SRS-091: 글에서 루틴을 가져오면 내 루틴에 저장되고 저장 이름에 실명이 없다.
- ADR-060: 모든 공식 글에 AI 고지가 있고, 체험담·쿠팡 칩·지어낸 숫자가 없다.
- 기존 글의 표시는 그대로이고 일반 사용자는 official_meta를 쓸 수 없다.

### 테스트 계획

src/backend/internal/feed/repo_pg_test.go, src/frontend/e2e/feed-official.spec.ts, 피드 관련 e2e 전체, node scripts/check-creator-routines.mjs, make verify.

### 위험·주의

운영 DB에 직접 넣는 일이므로 트랜잭션으로 묶고 --remove를 함께 둔다. 앱 구버전은 새 필드를 무시해 배지와 고지 없이 사진이 보일 수 있으나, 웹 앱은 배포 즉시 갱신된다. 네이티브 앱은 웹 껍데기라 같은 화면을 쓰는지 확인한다.
