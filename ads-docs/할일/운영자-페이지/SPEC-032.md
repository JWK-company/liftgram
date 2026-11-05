# SPEC-032 — 운영자 페이지 — 통계와 피드백 분리

> 타입 Spec · 그룹 할일/운영자-페이지 · ADStudio가 `SPEC-032.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-054, SRS-102

### 목표

운영 탭을 없애고 운영자만 보는 `/admin` 을 만든다. 가입, 접속, 활성, 기능 사용, 루틴 사용 방식을 로그인·비로그인·합계로 보여 주고, 운영 피드백과 사용자 피드백을 분리해 우리 DB에 모은다.

### 등급 판정

Project: 탭바·프로필·피드백·백엔드 새 서비스·DB·개인정보처리방침에 걸친다.

### 범위

- 화면: `src/frontend/app/components/ui/TabBar.tsx`, `src/frontend/app/components/staff/StaffClient.tsx`, `src/frontend/app/staff/page.tsx`, 새 `src/frontend/app/admin/page.tsx`, 새 `src/frontend/app/components/admin/`, `src/frontend/app/components/profile/ProfileClient.tsx`, `src/frontend/app/components/FeedbackClient.tsx`, `src/frontend/app/components/ops/OpsClient.tsx`, `src/frontend/app/components/moderation/ModerationQueueClient.tsx`
- 피드백 서버: `src/proto/feedback/v1/feedback.proto`, `src/backend/internal/feedback/`
- 통계 서버: 새 `src/proto/admin/v1/admin.proto`, 새 `src/proto/usage/v1/usage.proto`, 새 `src/backend/internal/admin/`, 새 `src/backend/internal/usage/`, `src/backend/cmd/server/main.go`, `src/backend/internal/config/config.go`
- DB: 새 마이그레이션 `src/database/migrations/0027_feedback_items.sql`, `src/database/migrations/0028_usage.sql`, 새 쿼리 `src/database/queries/`
- 수집: 새 `src/frontend/lib/usage.ts`, 각 기능의 호출 지점
- 문서·배포: `src/frontend/app/privacy/page.tsx`, `src/frontend/app/components/legal/PolicyNoticeBanner.tsx`, `src/compose.yaml`, `src/.env.example`, 화면 지도 `ads-docs/liftgram/wireframe/.screen-map/data.py`
- 바꾸지 않음: 결제, 자동 수정, 코칭, 특정 사용자의 운동 내용을 여는 화면

### 설계

#### 권한

| 역할 | 통계 | 신고 처리 | 운영 상태·광고 미리보기 | 운영 피드백 쓰기·읽기 | 사용자 피드백 읽기 | 작성자 정보 | 상태 변경 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 관리자 | O | O | O | O | O | O | O |
| 협업자 | X | X | X | O | O | X | X |
| 모더레이터 | X | O | X | X | X | X | X |
| 일반 사용자 | X | X | X | X | 자기 것을 보내기만 | X | X |

공용 `RequireRole` 을 만들어 모든 운영 RPC 가 DB의 `users.role` 로 다시 판정한다. 지금 토큰 값만 보는 `src/backend/internal/moderation/service.go`, `src/backend/internal/feedback/service.go` 도 함께 바꾼다. 비관리자는 `/admin` 에서 자기 구역만 보고 `GetOverview` 를 부르지 않는다.

#### 입구

- 프로필 탭의 `profile-me` 카드 바로 아래: 권한이 있는 사람에게 「운영자 페이지」 줄, 그 아래 모두에게 「의견 보내기」 줄
- 운영 상태 경고 점은 이 줄과 프로필 탭 아이콘으로 옮긴다. 업데이트 점이 덮지 않게 `src/frontend/app/components/ui/TabBar.tsx` 의 `[원본]` 조건을 복원한다
- 의견 화면은 새 주소 `/profile/feedback`. 운영 피드백 `/feedback` 은 일반 사용자에게 계속 막는다
- 비로그인이면 로그인 안내 후 돌아오고, 쓰던 글은 이 기기에 남긴다. 화면에 문의 메일도 적어 로그인이 고장 난 사람의 길을 남긴다
- `/staff` 는 `/admin` 으로 넘긴다. `/moderation`, `/ops`, `/feedback` 주소는 유지하고 뒤로 가기만 `/admin` 으로 바꾼다
- `/admin`, `/feedback`, `/moderation`, `/ops` 에서 프로필 탭이 켜지게 한다. `canSeeStaffTab` 은 `canSeeAdmin` 으로 이름을 바꾼다

#### 피드백 저장

```sql
CREATE TABLE feedback_items (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('ops','user')),
  author_id text REFERENCES users(id) ON DELETE SET NULL,
  category text CHECK (category IN ('bug','improvement')),  -- 사용자 의견은 NULL
  title text NOT NULL DEFAULT '',
  body text NOT NULL,
  app_version text NOT NULL DEFAULT '',
  platform text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','approved','rejected','in_progress','done')),
  resolution text NOT NULL DEFAULT '',
  -- 나중의 자동 수정을 위한 예약 칸. 이번에는 값만 저장하고 아무것도 실행하지 않는다.
  approved_body_sha256 text,
  approved_instruction text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON feedback_items (kind, status, created_at);
CREATE INDEX ON feedback_items (author_id, created_at);
CREATE TABLE feedback_events (
  id bigserial PRIMARY KEY,
  item_id bigint NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  note text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now()
);
```

- 옛 `Submit`, `List` 는 운영진 전용·`kind=ops` 고정으로 그대로 둔다(옛 설치본 호환). 사용자 의견은 새 RPC `SubmitUserFeedback` 으로만 받는다. 새 상태는 옛 `FeedbackState` 로 바꿔 내려 준다
- 사용자 의견: 본문 2,000자, 메일 확인된 계정, 하루 5건(트랜잭션 안에서 사용자 잠금으로 센다). 초과해도 쓰던 글을 지우지 않는다
- 본문은 일반 텍스트로만 표시한다. 링크 자동 변환과 Markdown 은 쓰지 않는다. 입력 화면에 「개인정보를 적지 마세요」를 넣는다
- 작성자 정보는 관리자에게만 보낸다. 이메일은 싣지 않는다
- 상태 변경은 전이표로 제한하고 `feedback_events` 에 남긴다. 본문을 고치는 RPC 는 없다
- `approved` 는 승인 당시 본문 해시와 승인자가 쓴 지시를 함께 저장한다. 나중의 자동 수정은 승인자의 지시를 입력으로 삼고 원문은 데이터로만 다룬다
- 탈퇴하면 그 사람의 `kind=user` 행을 삭제 트랜잭션에서 지운다(`kind=ops` 는 작성자만 비운다). 처리 끝난 사용자 의견은 1년 뒤 지운다
- PLM 전송은 `[원본]` 주석으로 막는다. PLM 옛 항목은 옮기지 않고, `PLM_API_TOKEN` 폐기는 안정된 뒤로 미룬다

#### 이용 기록

```sql
CREATE TABLE usage_events (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL,          -- 시간 단위로 내림
  actor_kind text NOT NULL CHECK (actor_kind IN ('user','guest')),
  actor_id text NOT NULL,
  client_event_id uuid NOT NULL,
  event text NOT NULL,
  platform text NOT NULL DEFAULT 'unknown' CHECK (platform IN ('web','android','ios','unknown')),
  app_version text NOT NULL DEFAULT '',
  UNIQUE (actor_kind, actor_id, client_event_id)
);
CREATE INDEX ON usage_events (at);
CREATE INDEX ON usage_events (event, at);
CREATE TABLE usage_presence (
  actor_kind text NOT NULL, actor_id text NOT NULL,
  first_seen timestamptz NOT NULL, last_seen timestamptz NOT NULL,
  PRIMARY KEY (actor_kind, actor_id)
);
CREATE INDEX ON usage_presence (last_seen);
CREATE TABLE usage_active_days (
  day date NOT NULL, actor_kind text NOT NULL, actor_id text NOT NULL,
  PRIMARY KEY (day, actor_kind, actor_id)
);
CREATE INDEX ON usage_active_days (actor_kind, actor_id);
CREATE TABLE usage_daily (
  day date NOT NULL, actor_kind text NOT NULL, metric text NOT NULL,
  actors integer NOT NULL, events bigint NOT NULL,
  PRIMARY KEY (day, actor_kind, metric)
);
```

- **받기:** `UsageService.Report(device_id, events[])`. 본문 64KB, 요청당 50건. 인증 헤더가 있는데 무효면 401(비로그인으로 넘기지 않는다). 사용자는 저장 때 계정 존재를 확인한다
- **비로그인:** 로그인 중에는 `device_id` 를 **보내지 않는다**. 키는 `liftgram.usage.deviceId` 로 건강 보고의 `liftgram.device_id` 와 분리하고, 저장할 수 없는 환경이면 전송하지 않는다
- **형식:** 이벤트는 허용 목록의 이름만, 플랫폼은 enum, 버전은 semver. 모르는 항목은 그 건만 건너뛰고 응답에 알린다. 나이가 7일을 넘으면 버린다
- **멱등:** 기기가 `client_event_id` 를 달아 재전송해도 한 번만 쌓인다. `USAGE_SINCE` 는 계산된 `at` 으로 판정한다
- **기기 큐:** 항목마다 주체(계정 또는 비로그인)를 적고, 보낼 때 현재 신원과 다르면 버린다. 30초마다 또는 `pagehide` 때 저장하고, 토큰이 있으면 `fetch keepalive` 로 보낸다(sendBeacon 은 인증 헤더를 못 실는다). 토큰이 없거나 401 이면 갱신하지 않고 다음 실행으로 미룬다. 탭이 여럿이면 Web Locks 로 한 탭만 보낸다. 최대 200건, 4xx 는 큐에서 뺀다
- **접속 신호:** 화면이 보이는 동안 60초마다. `usage_presence` 는 2분이 지났을 때만 갱신하고, `usage_active_days` 는 하루 한 번 넣는다. 현재 접속 = 최근 5분
- **세션:** `app_open` 은 시작 또는 30분 뒤 복귀 때 보낸다. 앱은 `appStateChange` 도 함께 본다
- **끄기:** 프로필 설정에 「사용 통계 보내기」를 두고 끄면 전송과 접속 신호를 모두 멈춘다
- **밤 작업:** `Asia/Seoul` 일 경계. `pg_try_advisory_xact_lock` 으로 한 대만. 늦게 온 기록을 위해 최근 7일을 다시 계산하고 빠진 날을 채운다. 7일·30일 활성은 `usage_active_days` 로 계산해 `usage_daily` 에 넣는다. 집계 성공 뒤 `usage_events`, `usage_presence`, `usage_active_days` 의 90일 지난 행을 배치로 지운다
- **삭제:** 계정 삭제 트랜잭션에서 세 표를 지우고, 밤 작업이 없는 계정의 행을 한 번 더 청소한다
- **차단 스위치:** `USAGE_ENABLED`. `USAGE_SINCE` 전에는 저장하지 않는다

이벤트 허용 목록(첫 판): `app_open`, `workout_start`, `workout_start_routine`, `workout_finish`, `routine_create`, `routine_edit`, `routine_import`, `exercise_search`, `exercise_finder`, `rest_timer`, `feed_tab_following`, `feed_tab_recommended`, `gym_search`, `data_import`, `data_export`, `feedback_send`, `ad_click`, 그리고 라우트에서 자동으로 뽑는 `screen_<구역>`. 글, 댓글, 좋아요, 팔로우, DM, 코칭은 도메인 표로 세므로 넣지 않는다. 순위는 화면과 행동을 나눠 보여 준다.

#### 통계

| 화면 구역 | 지표 | 원본 | 로그인/비로그인/합계 |
| --- | --- | --- | --- |
| 사용자 | 현재 접속, 일·주·월 활성, 재방문(가입 또는 첫 접속 뒤 1·7·30일째 활성) | `usage_presence`, `usage_active_days`, `usage_daily` | O |
| 가입 | 신규 일별 추이(`users.created_at`), 누적 가입, 가입 경로, 메일 확인 비율, 가입 7일 안에 첫 운동 | `users`, `auth_identities`, `sync_records` | 로그인만 |
| 기능 | 화면 순위, 행동 순위(7·30일), 플랫폼 비율 | `usage_events`, 도메인 표 | O |
| 루틴·운동 | 사용자당 루틴 수 분포(0, 1, 2~3, 4~6, 7+), 루틴으로 시작한 운동 비율, 주당 운동 횟수, 운동 시간 중앙값 | `sync_records` | 로그인만(비로그인은 서버에 없음) |
| 콘텐츠 | 글, 댓글, 좋아요, 팔로우, 스토리, DM 건수(내용 없음), 장비 클릭. 실광고가 붙으면 광고 클릭 | 도메인 표, `gear_clicks`, `usage_events` | 로그인만 |
| 운영 | 검토 대기, 미처리 피드백, 운영 상태 요약, 이용 기록 표 크기와 하루 행 수 | `reports`, `feedback_items`, 기존 `/ops` | — |

- 합계 = 로그인 + 비로그인 단순 합. 화면에 그 뜻과 「비로그인 숫자는 추세로만」을 한 줄로 적는다
- 역할이 `user` 가 아닌 계정과 `users.stats_excluded = true` 계정을 뺀다. 이미 굳은 일 집계에는 소급되지 않는다는 점과 삭제된 글이 건수에서 빠진다는 점도 적는다
- `sync_records` 집계: `collection` 은 `routines`, `workouts` 만 쓰고 `bodyweight_logs` 등 다른 기록은 읽지 않는다. `deleted=false`, `state=completed`, `source IS NULL`(가져온 기록 제외), 비정상 시간 제외, `src/backend/internal/coaching/` 선례처럼 형 검사. `created_at >= USAGE_SINCE` 인 행만 쓴다
- 부분 인덱스(`collection` 별), 5분 캐시, 동시 조회 묶기, `statement_timeout`. 구역별로 따로 부르고 구역별 로드, 실패, 빈 상태, 「시행 전」, 집계 시각을 표시한다
- 폭은 앱 칸(560px) 안에서 2열로 그린다
- `AdminService` 는 집계 숫자만 돌려준다. 이메일, 이름, 운동 내용은 싣지 않는다

#### 개인정보처리방침

- 수집 항목에 이용 기록(기능 이름, 시간 단위 시각, 앱 버전, 플랫폼, 비로그인 기기 무작위 ID)과 사용자 의견 추가
- `src/frontend/app/privacy/page.tsx:34` 의 「서버로 전송되지 않습니다」를 「운동 기록은 전송되지 않고, 끌 수 있는 이용 통계만 전송됩니다」로 고친다
- 이용 목적에 「서비스 개선을 위한 집계 통계」 추가. 시행일 뒤의 운동·루틴 기록을 집계에 쓴다는 것과 체중 기록은 쓰지 않는다는 것도 적는다
- 보관: 이용 기록 원본 90일 뒤 집계 숫자만. 사용자 의견은 처리 후 1년 또는 탈퇴 시 삭제
- 시행일은 배포일 + 7일로 `USAGE_SINCE` 와 맞춘다. `src/frontend/app/components/legal/PolicyNoticeBanner.tsx` 의 닫기 키와 종료일을 새 값으로 바꾼다
- **출시 전 법률 확인 항목(배포를 막지는 않지만 출시 체크리스트 BS-008 에 넣는다):** 고지만으로 수집해도 되는지, 비로그인 기기 ID 가 개인정보인지, 14세 미만이 쓰는 비로그인 사용, 운동 기록의 민감정보 해당 여부

### 작업 단계

#### Phase 1 — 입구 정리와 피드백 분리

- [ ] 운영 탭 제거, `/admin` 틀, `/staff` 넘김, 뒤로 가기, 프로필 입구 2개, 경고 점 이동, 탭 켜짐
- [ ] 공용 `RequireRole`, moderation·feedback 전환
- [ ] `src/database/migrations/0027_feedback_items.sql`, 피드백을 우리 DB로 전환, 옛 RPC 호환, 상태 전이와 감사 기록
- [ ] `/profile/feedback` 과 `SubmitUserFeedback`, 제한, 탈퇴 삭제, `/admin` 피드백 목록
- [ ] `src/frontend/e2e/staff-tab.spec.ts`, `src/frontend/e2e/feedback.spec.ts`, `src/frontend/e2e/ops-status.spec.ts`, `src/frontend/e2e/moderation.spec.ts`, `src/frontend/e2e/ad-slots.spec.ts` 를 새 입구로 교체하고, 항상 통과하게 된 `nav-staff` 0개 검사를 새 입구 검사로 바꾼다

완료 기준: 운영 탭이 없고 역할별 권한표 전체를 Go·브라우저 시험으로 확인한다. 역할 회수 직후 호출이 막히고, 일반 사용자 의견과 운영 피드백이 섞이지 않는다.

#### Phase 2 — 있는 데이터로 통계

- [ ] `src/database/migrations/0028_stats_excluded.sql`, `USAGE_SINCE` 설정
- [ ] `src/proto/admin/v1/admin.proto`, `src/backend/internal/admin/`, 집계 쿼리와 인덱스
- [ ] `/admin` 대시보드: 가입, 루틴·운동, 콘텐츠, 운영 구역과 구역별 상태
- [ ] 개인정보처리방침, 공지, 화면 지도

완료 기준: 표본 데이터로 각 숫자를 손계산과 대조하는 PostgreSQL 시험 통과(삭제·가져온 기록·시행 전 기록 제외 포함), 비관리자 호출 거절, 운영진 계정 제외 확인.

#### Phase 3 — 이용 기록 수집과 활성 지표

- [ ] `src/database/migrations/0029_usage.sql`, `src/backend/internal/usage/`, 전용 횟수 제한, 밤 작업, 계정 삭제 연결
- [ ] `src/frontend/lib/usage.ts`, 라우트 자동 매핑과 호출 지점, 접속 신호, 끄기 설정
- [ ] 대시보드 사용자·기능 구역(로그인, 비로그인, 합계), 표 크기 경보
- [ ] 배포 검사에 `TRUST_CF_CONNECTING_IP` 추가, 전체 시험

완료 기준: 비로그인 기기와 로그인 계정이 따로 세고 합계가 맞다. 재전송 중복 없음, 계정 전환 시 대기 기록 폐기, 무효 토큰 401, 허용 목록 밖 건너뛰기, 시행일 전 미저장, 90일 삭제, 계정 삭제 시 제거, 끄기 설정을 시험으로 확인한다.

### 수용 기준

- SRS-102: 운영 탭이 없다
- 일반 사용자는 `/admin` 과 통계 RPC 에 접근할 수 없다
- 협업자는 피드백만, 모더레이터는 신고 처리만 쓸 수 있다
- 사용자 수 지표가 로그인, 비로그인, 합계로 나온다
- 운영진·제외 계정은 통계에 들어가지 않는다
- 이용 기록에 내용, 종목, 무게, 주소, IP 가 없다
- 사용자 의견은 운영 피드백과 분리되어 쌓이고 `approved` 로 표시할 수 있다

### 테스트 계획

- Go 단위·PostgreSQL 시험: 권한표 전체, 집계 숫자, 허용 목록, 시행일, 삭제
- 브라우저: 역할별 입구, 의견 보내기, 대시보드 표시, 비로그인 기록 전송(요청 본문에 금지 항목 없음)
- 이미 있는 전체 브라우저 시험과 `make verify`

### 위험·주의

- 피드백 본문은 **신뢰할 수 없는 입력**이다. 나중에 자동 수정으로 이을 때 본문 속 지시를 그대로 따르면 안 되고, 승인자의 지시만 입력으로 삼는다
- 비로그인 기록은 인증이 없어 위조할 수 있다. usage 전용 횟수 제한(IP 를 저장하지 않음, IPv6 은 /64), IP당 새 기기 상한, 기기당·전체 하루 행 상한을 둔다. 운영 서버 디스크 사용률이 94%이므로 표 크기를 `/ops` 경보에 넣는다
- 이용 기록 전송 실패가 운동 기록 화면을 막으면 안 된다
- 같은 기기가 하루 안에 비로그인과 로그인을 모두 쓰면 합계에 두 번 잡힌다
- 법률 검토는 받지 않았다
- **되돌리기:** 표 변경은 추가만 한다. 옛 커밋으로 내리면 PLM 경로가 되살아나 DB에 쌓인 의견이 화면에서 사라지지만 데이터는 남는다. 그래서 `PLM_API_TOKEN` 은 안정된 뒤에 폐기한다. 수집은 `USAGE_ENABLED=false` 로 바로 멈춘다

### 스펙 리뷰 반영(REV-043)

개인정보, 백엔드, 화면, 보안 리뷰의 채택 항목을 위 절에 반영했다. 분류는 `ads-docs/할일/운영자-페이지/REV-043.json` 에 있다.
