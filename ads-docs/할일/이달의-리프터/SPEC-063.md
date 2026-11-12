# SPEC-063 — 이달의 리프터 — 월간 시상(꾸준상·인기상·운영진 픽)·쿠폰 전달·앱 진입점·운영 웹

> 타입 Spec · 그룹 할일/이달의-리프터 · ADStudio가 `SPEC-063.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → SRS-117

### 목표

매달 꾸준히 운동한 사람과 피드에서 응원을 많이 받은 사람에게 상품권(개당 5만 원 이하)을 주고, 앱에서 수상자를 공개한다(URS-034 · SRS-117 · 기획 보고서 결정 2519).

- 서버가 자격·운동한 날·인정 좋아요를 세고, 꾸준상을 결정적으로 추첨하고, 확정·알림·쿠폰 전달을 맡는다.
- 앱: `/awards` 화면과 진입점 다섯 곳(피드 띠 · 운동 요약 줄 · 프로필 줄 · 배지 · 알림).
- 운영 웹: `/awards`에서 후보 보기 → 추첨 미리보기 → 확정 → 쿠폰 등록.
- **아직 수상자가 없으므로** 수상자 자리에 「예시」라고 적은 보기 카드를 보여 준다. 보기 내용은 앱 코드 안의 고정 글이다. DB에 가짜 사용자나 가짜 수상 행을 만들지 않는다.

### 범위

| 파일 | 무엇을 |
| --- | --- |
| `src/database/migrations/0037_awards.sql` | `award_months`(달·씨앗·상태) · `awards`(수상·쿠폰·공개·받음) |
| `src/database/queries/award.sql` | 운동한 날 집계 · 인정 좋아요 집계 · 자격 · 수상 읽기·쓰기 |
| `src/proto/award/v1/award.proto` | `AwardService`(사용자) · `AwardAdminService`(운영) |
| `src/backend/internal/award/{service.go,repo.go,handler.go,service_test.go}` | 규칙(달 경계·자격·추첨·확정·권한) · 데이터 · RPC |
| `src/backend/cmd/server/main.go` | 조립 |
| `src/proto/notification/v1/notification.proto` · `src/backend/internal/notification/{service.go,handler.go}` | `NOTIFICATION_KIND_AWARD = 11` · `KindAward` · `NotifySelf` |
| `src/frontend/app/api/[...path]/route.ts` | `award.v1.awardadminservice` 통째로 차단 |
| `src/frontend/app/awards/page.tsx` · `src/frontend/app/awards/[id]/page.tsx` · `src/frontend/app/components/awards/*` · `src/frontend/lib/awardClient.ts` | 앱 화면 |
| `src/frontend/app/components/feed/FeedClient.tsx` · `src/frontend/app/components/session/WorkoutSummary.tsx` · `src/frontend/app/components/ui/TabBar.tsx` · `src/frontend/app/components/profile/ProfileClient.tsx` · `src/frontend/app/components/feed/UserProfileClient.tsx` · `src/frontend/app/components/dm/NotificationsClient.tsx` | 진입점 |
| `src/core/src/data/workoutRepository.ts` | `countWorkoutDaysInRange(fromMs, toMs)` — 운동 요약 줄(기기 기록 기준) |
| `src/core/src/i18n/locales/ko.ts` · `src/core/src/i18n/locales/en.ts` | 문구 |
| `src/admin/app/(console)/awards/{page.tsx,AwardsScreen.tsx}` · `src/admin/lib/rpcAllow.ts` · `src/admin/lib/rpc.ts` · 운영 웹 메뉴 | 운영 웹 |
| `src/frontend/e2e/awards.spec.ts` · `src/admin/e2e/*` | 시험 |
| `src/frontend/package.json` · `src/admin/package.json` | 웹 0.102.0 · 운영 웹 minor |

### 설계

(REV-153 반영)

#### 1. 데이터

```sql
award_months(month text PK /* 'YYYY-MM' KST */, seed text NOT NULL, seed_hash text NOT NULL,
             status text NOT NULL CHECK (status IN ('open','announced')),
             candidates_hash text, announced_at timestamptz,
             announced_by text REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz DEFAULT now())
awards(id text PK, month text NOT NULL REFERENCES award_months(month),
       category text NOT NULL CHECK (category IN ('steady','popular','pick')),
       user_id text REFERENCES users(id) ON DELETE SET NULL, rank int NOT NULL DEFAULT 1, reason text,
       days int, likes int, public boolean NOT NULL DEFAULT true,
       coupon_code text, coupon_item text, coupon_expires date, coupon_set_by text REFERENCES users(id) ON DELETE SET NULL,
       coupon_set_at timestamptz, claimed_at timestamptz, created_at timestamptz DEFAULT now(),
       UNIQUE(month, user_id), UNIQUE(month, category, rank))
CREATE INDEX post_likes_created_idx ON post_likes(created_at)
```

- **씨앗은 미리 정해 두고 해시만 공개한다(커밋-공개).** 그 달의 `award_months` 행은 그 달 `GetMonth`를 처음 부를 때 서버가 만든다(`ON CONFLICT DO NOTHING`, status `open`). 씨앗은 32바이트 난수이고, 앱 규칙 화면에는 `seed_hash = sha256(seed)`만 보인다. 확정한 뒤에 씨앗 원문을 공개한다. 운영 웹에는 씨앗 입력 칸이 없다.
- 쿠폰 번호에는 UNIQUE를 걸지 않는다. 오류 상세에 번호가 찍히지 않게 하기 위해서다. 탈퇴하면 `user_id`가 NULL이 되고, 화면에는 「탈퇴한 수상자」로 보인다(지급 기록은 남는다).

#### 2. 규칙(service.go — DB 없이 시험)

- `MonthBounds(month)`: 한국 시간 1일 0시부터 다음 달 1일 0시까지를 ms로 계산한다. Go에서 계산해 SQL에 넘긴다. 형식이 `YYYY-MM`이 아니면 오류다.
- **운동한 날**:

  - 대상은 `sync_records`에서 collection이 `workouts`이고 지워지지 않은 행이다.
  - 조건을 모두 맞춰야 한다: `state = '"completed"'::jsonb`, `source`가 null, `jsonb_typeof` 검사를 거친 `started_at`이 달 안, `duration_seconds ≥ 600`.
  - **서버 수신 시각 검사**: `sync_records.created_at`이 `started_at − 1시간` 이후이고 `started_at + 3일` 이전이어야 한다. 지난 날짜를 한꺼번에 올린 기록은 세지 않는다. 인덱스를 타도록 `created_at ≥ 달 시작 − 1시간`도 건다.
  - 이렇게 고른 기록의 서로 다른 KST 날짜 수를 센다.
  - 읽기 전용 트랜잭션에 5초 상한을 둔다(`src/backend/internal/admin/repo.go` 패턴).
- **인정 좋아요**: `post_likes` × `posts`에서 센다. 글 조건은 작성자 = 대상, 공개, 승인, `official_meta` null이다. 좋아요는 다음을 모두 맞춰야 한다.

  - 좋아요 시각이 달 안이다.
  - 누른 사람 ≠ 작성자.
  - 누른 사람은 role user, 통계 제외 아님, `email_verified_at ≤ 좋아요 시각`, 그 시각에 가입 7일이 지났다.
  - 작성자와 누른 사람 사이에 차단(양방향)이 없다.
  - **누른 사람 한 명이 같은 작성자에게 준 좋아요는 그 달 최대 5개까지만** 센다.
  - 결과로 인정 좋아요 수와 고유 누른 사람 수를 함께 준다.
- **자격** `Eligible(u, monthEnd)`:

  - 조건: role user · `stats_excluded` false · `email_verified_at` 있음 · `age_confirmed_at` 있음 · `created_at ≤ monthEnd − 7일`.
  - 자격이 없으면 이유 목록(`new`·`email`·`age`·`role`·`excluded`)을 준다.
- **추첨** `Draw(seed, candidates, exclude, n=3)`:

  - 후보는 자격이 있고 days ≥ 12인 사람 중 exclude(인기상·픽 수상자)를 뺀 사람이다.
  - 후보마다 sha256(seed + ":" + userId)를 구하고, 16진수 사전순으로 작은 n명을 뽑는다.
  - 순서는 **인기상·픽을 먼저 고르고, 그 둘을 뺀 뒤 추첨**이다. 미리보기도 고른 두 사람을 빼고 계산한다.
- **확정** `Confirm(month, popularId?, pickId?, pickReason)`:

  - **admin 역할만** 할 수 있다(`access.Require` — DB 역할을 다시 읽는다).
  - **끝난 달만** 확정한다. 지금이 다음 달 3일 0시(KST) 이후여야 한다. 동기 유예를 두기 위해서다.
  - 고른 사람은 자격이 있어야 한다. 인기상과 픽이 같은 사람이면 Validation 오류다. 픽은 이유를 꼭 적는다.
  - 처리 순서:
  - 한 트랜잭션 안에서 `UPDATE award_months SET status='announced' … WHERE month=$1 AND status='open' RETURNING`을 실행한다.
  - 행이 나오지 않으면 이미 확정된 것이다. 기존 결과와 `already_confirmed = true`를 돌려주고, 쓰기와 알림을 모두 건너뛴다.
  - 행이 나오면 `awards`를 삽입하고 `candidates_hash`(정렬한 후보 id의 sha256)를 기록한다.
  - **커밋한 뒤 처음 쓴 요청만** 수상자에게 알림을 보낸다.
- **쿠폰** `SetCoupon(awardId, code, item, expires)`:

  - admin만 할 수 있다. `coupon_set_by`와 `coupon_set_at`을 기록한다.
  - 받음 표시는 번호가 실제로 바뀐 경우에만 지운다: `claimed_at = CASE WHEN coupon_code IS DISTINCT FROM @code THEN NULL ELSE claimed_at END`.
  - 번호는 로그에 남기지 않는다.
- **사용자 동작**:

  - `MarkClaimed(awardId)`는 본인만 할 수 있고, 번호가 있어야 한다. 되돌리기도 된다(`claimed` 참·거짓).
  - `SetPublic(awardId, on)`은 본인만 할 수 있다.
  - 다른 사람의 수상이면 not found다.
- **알림**: 새 종류 `KindAward = "award"`를 둔다. `notification.Service.NotifySelf(userID, kind, refID)`가 actor를 받는 사람 자신으로 기록한다.

  - 이렇게 하면 운영자 이름이 나오지 않고, 차단 필터와 운영 계정 삭제의 영향을 받지 않는다.
  - 화면은 award 알림에서 actor를 쓰지 않는다.
  - `toProtoKind`에 분기를 더한다.

#### 3. 계약(award.v1)

- 공개용 메시지 `PublicAward`에는 쿠폰 필드가 아예 없다. 공개를 끈 수상자는 이름·아바타·id·days·likes가 비어 있고 `hidden = true`다. 탈퇴한 수상자는 `withdrawn = true`다.
- `AwardService`(앱):

  - `GetMonth(month?)`는 다음을 돌려준다.
  - 달
  - 내 운동한 날(동기 기준) · 문턱 12
  - 내 인정 좋아요
  - 내 자격(이유)
  - `seed_hash` · 발표 여부 · 발표됐으면 씨앗 원문
  - 수상자 목록(PublicAward)
  - `ListMonths(limit)`: 발표된 달과 수상자를 돌려준다.
  - `ListMyAwards`: 내 수상 목록이다. 쿠폰은 **있음·없음만** 알려 준다.
  - `GetMyAward(id)`: 내 수상 하나다. **쿠폰 번호는 여기서만** 나간다.
  - `MarkClaimed` · `SetPublic`.
  - `GetUserBadges(userId)`: 공개 수상만 돌려준다. 서로 차단한 사이면 빈 목록이다.
- `AwardAdminService`(운영 웹, admin만):

  - `Candidates(month)`: 꾸준 후보와 인기 상위 20을 돌려준다. 자격 이유, 고유 누른 사람 수, 의심 지표(늦게 올라와 뺀 기록 수)를 함께 준다.
  - `DrawPreview(month, excludeIds)`: 저장된 씨앗으로만 계산한다.
  - `Confirm`.
  - `ListAwards(month)`: 쿠폰 번호는 뒤 4자리만 보인다.
  - `SetCoupon`.
- 앱 프록시 `OPS_SERVICES`에서 `award.v1.awardadminservice`를 빈 집합으로 둔다. 대소문자와 % 인코딩 경로도 시험한다. 운영 웹 `ALLOWED_RPCS`에는 운영 RPC 5개만 넣는다.

#### 4. 앱 화면

- `/awards`는 피드 탭 구역에 둔다. `TabBar` match에 넣고, ← 기본 경로는 `/feed`다.

  - **머리**: 「이달의 리프터 · <달 이름>」(`Intl` 달 이름).
  - **내 현황 카드**(로그인했을 때만):
  - 「이번 달 운동한 날 n / 12」 막대(`role=progressbar`)와 인정 좋아요 n을 보여 준다.
  - 자격이 모자라면 모자란 것만 한 줄씩 적는다.
  - 기기 기록 수 m이 서버 수 n보다 크면 「동기된 기록 n일 · 이 기기 m일(동기 대기)」을 함께 적는다.
  - **수상자**:
  - 발표된 달이 하나라도 있으면 가장 최근 발표 달의 실제 수상자를 보인다.
  - 지난 달이 아직 집계 중이면(다음 달 1~2일) 「<지난 달> 발표 준비 중」을 적는다.
  - **발표된 달이 하나도 없을 때만** 「예시」 구역을 보인다. 이 구역은 이렇게 만든다.
  - 구역 머리: 「예시 — 실제 수상자가 아니에요」.
  - 카드 3장: 꾸준상 예시(이름 3개를 한 카드에) · 인기상 예시 · 운영진 픽 예시.
  - 이름 글 자체가 「예시 리프터 A」처럼 「예시」를 담는다.
  - 아바타는 실루엣이고 테두리는 점선이다. PR 금색은 쓰지 않는다.
  - `aria-label`은 「예시 카드, 실제 수상자 아님」이다. 링크·누르기는 없다.
  - **내 상**: 상이 있으면 쿠폰 화면으로 가는 줄을 둔다.
  - **규칙 접기**:
  - 기준(운동한 날 12일 · 10분 이상 · 동기 기준 · 지난 날짜를 몰아 올린 기록 제외)
  - 인정 좋아요 기준
  - 추첨 방식(씨앗 해시 공개 · 발표 때 씨앗 공개)
  - 고지 문구 전부: 주최(liftgram 운영진) · 문의(앱 「의견 보내기」) · 기간(매달 1일~말일, KST) · 발표(다음 달 3일 이후, 앱과 알림) · 경품(개당 5만 원 이하 상품권 · 상별 인원) · 수령 기한(발표 후 60일, 지나면 소멸) · 부정 참여가 드러나면 취소·회수 · 운영진과 관계자 제외 · 따로 모으는 개인정보 없음(쿠폰은 앱 안에서 전달) · 수상하면 닉네임이 공개됨(쿠폰 화면에서 끌 수 있음) · 「Apple과 Google은 이 행사의 후원사가 아닙니다」
  - **지난 달**: 발표된 달 목록이다. 없으면 숨긴다.
  - **비로그인**: `GetMonth`를 부르지 않는다. 예시·규칙과 「로그인하면 내 현황을 볼 수 있어요」만 보인다.
  - **오프라인·오류**: 예시와 규칙은 고정 글이라 늘 그린다. 서버 부분만 `ListState`의 오류와 다시 시도로 처리한다. 판단은 `loaded`가 된 뒤에 한다.
- **`/awards/[id]`**:

  - 상 · 상품 · 쿠폰 번호를 보인다. 번호는 가려 두고 「번호 보기」를 눌러야 보이며, 복사할 수 있다(실패하면 길게 눌러 선택하라고 안내한다).
  - 유효 기한 · 「받았어요」(되돌릴 수 있음) · 「수상자 목록에 이름 공개」 스위치를 둔다.
  - 번호가 아직 없으면 「번호를 준비 중이에요」를 보인다.
- **진입점**:

  - **피드 띠**:
  - 추천·팔로잉 탭에서 StoryTray 아래에 한 줄로 둔다.
  - 문구: 「이달의 리프터 · 이번 달 운동한 날 n일」(서버 수). 로그인 상태이고 n ≥ 1일 때만 보인다.
  - 닫기 ×는 44px이고 이름은 「이달의 리프터 띠 닫기」다. 닫은 달에는 다시 보이지 않는다(`localStorage` `awards-banner-dismissed:<YYYY-MM>`, try/catch로 감싼다).
  - `localStorage`를 읽기 전에는 그리지 않는다.
  - **운동 끝 화면** `src/frontend/app/components/session/WorkoutSummary.tsx`:
  - `summary-actions` 아래에 약한 글자 줄로 둔다: 「이번 달 운동한 날 n일 · 꾸준상 문턱 12일」(기기 기록 기준).
  - 누르면 `/awards`로 간다.
  - 숫자는 `countWorkoutDaysInRange(fromMs, toMs)`로 센다. 서버와 같은 필터(completed · source null · 600초 이상 · KST 날짜)를 쓴다.
  - 코칭 요약 `SummaryView`에는 넣지 않는다.
  - **내 프로필**: 「이달의 리프터」 줄과 받은 상 배지(공개를 끈 상도 본인에게는 보임).
  - **남 프로필**: 공개 수상 배지만 보인다. 받기 전에는 자리를 비우지 않는다.
  - **알림**:
  - `AWARD` 분기를 `coachingTarget`보다 먼저 두고 `/awards/<refId>`로 보낸다.
  - 문구는 「이달의 리프터에 뽑혔어요」다. 아바타 자리에는 트로피 아이콘을 둔다.
  - 옛 앱은 일반 문구로 보인다.
- 모양은 SPEC-061·SPEC-062의 규칙을 따른다(누르는 것은 직사각형 단추, 정보는 바탕 없는 글자). 색 규칙 가드도 지킨다.

#### 5. 운영 웹 `/awards`

- 달을 고른다. 지난 달이 기본이다. 확정은 다음 달 3일 이후에만 켜진다.
- 상태를 보여 준다: `seed_hash` · 발표 여부.
- **꾸준 후보 표**: 이름 · 날 · 늦게 올라와 뺀 기록 수 · 자격(이유 칩).
- **인기 순위 표**: 상위 20 · 인정 좋아요 · 고유 누른 사람 · 자격.
- **고르기**: 인기상을 고른다. 운영진 픽은 사용자를 검색하고 이유를 꼭 적는다. 그다음 「추첨 미리보기」(고른 두 사람은 뺌)를 본다.
- **확정**: 「확정」을 누르면 화면 안 확인 단계가 나온다(요약 + 「정말 확정」, `confirm()`은 쓰지 않는다). 이미 확정된 달이면 기존 결과를 알린다.
- **확정된 달**: 수상 표와 쿠폰 등록 칸(번호·상품·기한 — 등록된 번호는 뒤 4자리만)을 두고, 받음 상태를 보여 준다. 화면에 cacheKey를 쓰지 않는다.

### 작업 단계

#### Phase 1 — DB·계약·서버

- [x] `src/database/migrations/0037_awards.sql` · `src/database/queries/award.sql` · `make sqlc`(카탈로그 판 제외 사본)
- [x] `src/proto/award/v1/award.proto` · 알림 종류 11 · `make proto`
- [x] `src/backend/internal/award` service·repo·handler + `service_test.go`(달 경계 · 자격 이유 · 추첨 결정성·제외 · 확정 멱등(already_confirmed·알림 한 번)·끝나지 않은 달 거부·인기=픽 거부 · admin 아닌 역할 거부 · 숨김·탈퇴 규칙 · 쿠폰 번호는 GetMyAward 에서만)
- [x] `src/backend/cmd/server/main.go` 조립 · 앱 프록시 차단 · 운영 웹 허용 목록
- 완료 기준: `go test ./...` 통과 · 새 DB에 마이그레이션 적용 · 앱 주소로 운영 RPC를 부르면 404.

#### Phase 2 — 앱 화면

- [x] `src/frontend/lib/awardClient.ts` · `/awards` · `/awards/[id]` · 예시 카드
- [x] 피드 띠 · 운동 요약 줄(`countWorkoutDaysInRange`) · 프로필 줄·배지 · 알림 글·이동
- [x] 문구 ko·en
- 완료 기준: 타입 검사 통과 · e2e `src/frontend/e2e/awards.spec.ts`(새 DB · `page.clock` 고정 · 발표 없음 → 예시 구역(링크 없음) · 비로그인 /awards · 내 현황 숫자(시험 DB에 시험 사용자의 sync_records 를 psql 로 넣음) · 피드 띠 닫기 유지 · 운동 끝 화면 줄 · 프록시 차단(대소문자·인코딩)).

#### Phase 3 — 운영 웹

- [x] `src/admin/app/(console)/awards` 화면 · 메뉴 · 클라이언트 · 허용 목록
- 완료 기준: 운영 웹 타입 검사·빌드 · e2e 시험 DB 안에서 시험 사용자로 후보→미리보기→확정→쿠폰 등록 → 앱에서 쿠폰 보임·받음(시험 DB만 · 운영 DB에는 쓰지 않음).

#### Phase 4 — 마무리·배포

- [ ] 전체 e2e · qa code · EXE · 버전(웹 0.102.0 · 운영 웹 minor) · 이 작업 파일만 커밋 · 앱·운영 웹 배포 · 운영에서 `/awards` 예시 화면 확인

### 수용 기준

| SRS | 확인 |
| --- | --- |
| SRS-117 집계 | 시험: 달 경계(10월 31일 23:59 KST는 10월) · 10분 미만·가져온 기록 제외 · 자기 좋아요·새 계정 좋아요 제외 |
| SRS-117 자격 | 시험: 이유 5종 |
| SRS-117 추첨 | 시험: 같은 씨앗 같은 3명 · 제외한 사람은 안 뽑힘 · 후보가 3명보다 적으면 있는 만큼 |
| SRS-117 확정 | 시험: 두 번 확정해도 행 하나 · 알림 한 번 · 미래 달 거부 · 일반 계정 거부 |
| SRS-117 쿠폰·공개 | 시험: 남의 수상은 not found · 비공개면 목록에서 이름이 비고 배지가 숨음 |
| SRS-117 예시 | e2e: 발표 없음 → 「예시」 구역(카드 3장 · 링크 없음) · DB의 `awards` 행 0 |
| SRS-117 공정성 | 시험: 씨앗 해시가 확정 전부터 보이고 확정 뒤 sha256(씨앗)=해시 · 지난 날짜 몰아 올린 기록 제외 · 같은 작성자에게 6번째 좋아요부터 안 셈 |
| SRS-117 운영 분리 | e2e: 앱 주소 `/api/award.v1.AwardAdminService/Confirm` → 404 |

### 테스트 계획

- Go 단위: `src/backend/internal/award/service_test.go`(가짜 저장소).
- SQL: e2e 시험 DB에서 집계 쿼리를 손으로 만든 시험 사용자로 확인(운영 DB 아님).
- 앱 e2e: `src/frontend/e2e/awards.spec.ts`. 운영 웹 e2e: 확정·쿠폰 흐름.
- 전체 e2e 회귀.

### 위험·주의

- 운동 기록은 기기가 올리는 값이라 완전히 막을 수는 없다. 서버 수신 시각 검사와 의심 지표로 줄이고, 드러나면 취소·회수한다(규칙에 고지). 상품권이 소액이라 남는 위험은 감수한다.
- 옛 앱은 수상 알림을 일반 문구로 보인다.
- 집계는 서버에 동기된 기록 기준이라 기기에만 있는 기록은 늦게 반영된다. 화면에 「동기된 기록 기준」이라고 적는다. 운동 요약 줄은 기기 기준이라 숫자가 잠깐 다를 수 있다.
- 쿠폰 번호는 비밀값이라 로그에 남기지 않는다. 본인 RPC에서만 내보낸다.
- 운영 DB에 시험 행을 쓰지 않는다. 배포 뒤 확인은 읽기만 한다.
- 경품 고시: 상품권 한도와 「Apple 후원 아님」 문구를 규칙에 둔다. 세금 문제는 소액 경품이라 제외한다(보고서의 판단).
