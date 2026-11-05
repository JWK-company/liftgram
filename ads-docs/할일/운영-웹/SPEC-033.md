# SPEC-033 — 앱과 분리된 운영 웹

> 타입 Spec · 그룹 할일/운영-웹 · ADStudio가 `SPEC-033.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-057, SRS-102, SRS-103

### 목표

운영 기능을 `liftgram-admin.tarae.org` 의 독립 웹으로 옮기고, 앱에는 사용자 기능만 남긴다. 판정 근거: 새 워크스페이스, 컨테이너, 배포, 여러 화면과 앱 정리에 걸쳐 Project 등급이다.

### 결정(사용자 확정)

- 입구 보호: Cloudflare Access 와 비밀번호를 함께 쓴다.
- 운영 경고 전달: 경고가 새로 생기면 관리자에게 메일을 보낸다.

### 범위

- 새로 만듦: `src/admin/`(Next 앱, `src/admin/proxy.ts`, `src/admin/app/api/`, `src/admin/e2e/`), `src/scripts/deploy-admin-h2500-3.sh`.
- 설정 고침: `src/package.json`, `src/Dockerfile`, `src/compose.yaml`, `src/compose.prod.yaml`, `src/.env.example`, `src/Makefile`, `src/biome.json`, `src/scripts/deploy-h2500-3.sh`, `src/scripts/check-docs.mjs`, `src/scripts/check-contract.sh`, `src/scripts/env-check.mjs`, `src/scripts/ci.sh`, `src/deploy/README.md`, `src/CLAUDE.md`, `CLAUDE.md`.
- 지움(Phase 5): `src/frontend/app/admin/`, `src/frontend/app/staff/`, `src/frontend/app/feedback/`, `src/frontend/app/moderation/`, `src/frontend/app/ops/`, `src/frontend/app/components/admin/`, `src/frontend/app/components/ops/`, `src/frontend/app/components/FeedbackClient.tsx`, `src/frontend/app/components/moderation/ModerationQueueClient.tsx`, `src/frontend/lib/opsAlert.ts`, `src/frontend/lib/adminClient.ts`. 사용자가 분리와 제거를 요청했고 git 에 남으므로 `[원본]` 주석으로 보존하지 않는다.
- 고침(Phase 5): `src/frontend/app/components/profile/ProfileClient.tsx`, `src/frontend/app/components/ui/TabBar.tsx`, `src/frontend/app/components/AuthProvider.tsx`, `src/frontend/app/components/ads/AdSlot.tsx`, `src/frontend/lib/staffRoles.ts`, `src/frontend/lib/adPreview.ts`, `src/frontend/lib/native.ts`, `src/frontend/lib/opsClient.ts`, `src/frontend/next.config.ts`, `src/frontend/sw/sw.template.js`, `src/frontend/app/api/[...path]/route.ts`, `src/core/src/i18n/locales/ko.ts`, `src/core/src/i18n/locales/en.ts`, `ads-docs/liftgram/wireframe/.screen-map/data.py`, 앱 e2e.
- 앱에 남김: `src/frontend/lib/clientHealth.ts`, `src/core/src/domain/syncStall.ts`, `src/frontend/lib/moderationClient.ts`, `src/frontend/app/components/moderation/ReportSheet.tsx`, `src/frontend/app/components/moderation/BlockedUsersClient.tsx`, `src/frontend/lib/feedbackClient.ts`, `src/frontend/app/components/profile/UserFeedbackClient.tsx`, `src/frontend/lib/usage.ts`, `src/frontend/app/components/UsageTracker.tsx`, `src/frontend/app/components/ExerciseAdminBar.tsx`, 이름에 admin 이 있어도 사용자 기능이다.
- 백엔드: 운영 경고 메일을 고르면 그 코드만 더한다. 나머지 RPC 와 DB 는 바꾸지 않는다.

### 설계

#### 구조

- 의존: `next`, `react`, `react-dom`, `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `@app/contracts`, `@bufbuild/protobuf`, `@connectrpc/*`, `jose`. 프런트와 같은 버전 범위를 쓴다. 차트는 지금 코드의 막대 표현을 옮긴다. `@app/core`, `src/frontend` 는 가져오지 않고 시험으로 막는다.
- 커스텀 서버 없이 Next standalone `server.js` 를 쓴다. `/ws`, `/readyz` 오류 노출, `/downloads` 를 따라오지 않게 하기 위해서다. 헬스는 `/healthz`(생존), `/readyz`(백엔드까지, 내용 없이 상태만)다.
- `src/admin/app/api/[...path]/route.ts`: POST 만, 전체 문자열 일치, `%` 포함 경로 거절. 허용 RPC: AuthService `Me`, AdminService 전체 6개, FeedbackService `Submit`, `List`, `ListEntries`, `SetStatus`, ModerationService `ListQueue`, `Resolve`, `GetReviewMedia`, OpsService `GetOpsStatus`, `GetOpsAlert`. 나머지는 404. 요청 헤더는 허용 목록(`authorization`, `content-type`, `connect-*`)만 넘기고 응답 `set-cookie` 는 버린다.
- 클라이언트 IP: 공용 함수가 받은 `x-forwarded-for` 를 버리고 `TRUST_CF_CONNECTING_IP=1` 일 때만 `cf-connecting-ip` 로 다시 세운다. 프록시와 세션 라우트가 모두 이 함수를 쓴다.

#### 입구, 로그인, 권한

- Cloudflare Access 정책이 먼저 운영자 메일을 확인한다. `src/admin/proxy.ts` 가 `Cf-Access-Jwt-Assertion` 의 서명, `aud`, `iss` 를 검증해 터널 설정 실수로 Access 가 빠져도 열리지 않게 한다. 운영 환경에서 `CF_ACCESS_AUD` 나 `CF_ACCESS_TEAM_DOMAIN` 이 비면 모든 요청을 거절한다. `CF_Authorization` 쿠키는 백엔드로 넘기지 않는다. `/healthz` 와 `/readyz` 는 원본 확인을 위해 예외다.
- `POST /api/session/login`: 서버가 백엔드 `LogIn` 과 `Me` 를 부른다. 역할이 coworker, moderator, admin 이 아니면 그 자리에서 `LogOut` 하고 쿠키를 굽지 않은 채 403 을 준다. 맞으면 쿠키를 굽고 access 만 돌려준다. refresh 는 브라우저 자바스크립트를 지나지 않는다.
- `POST /api/session/refresh`, `DELETE /api/session`: 헤더 `x-liftgram-admin-session`, `Origin` 정확 일치, `Sec-Fetch-Site: same-origin` 을 필수로 한다. 갱신 때 역할을 다시 확인해 회수됐으면 쿠키를 지우고 403.
- 쿠키: `__Host-liftgram_admin_refresh`(httpOnly, Secure, SameSite=Strict, Path=/, Domain 없음). 절대 수명은 12시간이고 회전해도 늘지 않는다. 시작 시각을 httpOnly 쿠키에 함께 둔다.
- 탭 경합: Web Locks 와 대체 잠금, 401 뒤 600ms 재시도 1회, 401 과 503 구분을 앱 `src/frontend/lib/session.ts` 규칙대로 옮긴다.
- 로그인 안내: 비밀번호가 없는 계정은 앱 `/account` 에 소셜로 로그인한 뒤 10분 안에 비밀번호를 만들라고 안내한다. 재설정 메일로는 만들 수 없다.
- 보안 헤더: 요청마다 nonce 를 만드는 동적 렌더링. `default-src self`, `script-src self nonce strict-dynamic`, `style-src self unsafe-inline`, `img-src self blob:`, `connect-src self`, `frame-ancestors none`, `base-uri none`, `form-action self`, `object-src none`. 그리고 `X-Robots-Tag: noindex`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, HSTS, HTML 과 API 의 `Cache-Control: no-store`. `dangerouslySetInnerHTML` 금지. 서비스 워커와 매니페스트 없음. 사용자가 쓴 글은 글자로만 그리고 링크로 만들지 않는다.
- 사진 열람과 처리, 로그인 성공·거부를 누구·언제·IP 로 구조화 로그에 남긴다.

#### 화면과 역할

| 주소 | 내용 | 관리자 | 협업자 | 모더레이터 |
| --- | --- | --- | --- | --- |
| `/` | 운영 경고 이유, 신고 대기, 미처리 의견, 현재 접속·오늘 활성. 칸마다 기준 시각과 개별 실패 | 전부 | 미처리 의견 | 신고 대기 |
| `/stats` | 접속·활성·재방문, 가입 누적·일별, 메일 확인률, 가입 경로, 첫 운동 완료율, 기능·행동 순위, 플랫폼, 루틴 분포·시작 비율·주당 횟수·운동 시간, 콘텐츠, 이용 기록 표 크기. 합계·로그인·비로그인을 함께 표시. 기간은 RPC 가 주는 일별 30일, 기능 7/30일 고정 | O | — | — |
| `/user-feedback` | 미처리 우선 표, 상태·분류·검색, 작성자·플랫폼·버전·KST 시각, 처리 메모, 전이 동작, 승인은 메모 필수, 완료는 확인 창 | 처리 가능 | 읽기 전용(작성자 없음) | — |
| `/ops-feedback` | 작성(분류·제목·본문, 3자·5자 검증), `ListEntries(OPS)` 표와 처리, `List` 와 id 로 합쳐 내가 쓴 글 표시. 승격 코드는 PLM 폐기로 뺀다 | O | 작성·읽기 | — |
| `/moderation` | 종류·글쓴이·자동 감지·사유·건수 표. 썸네일, 클릭 시 원본 비율 라이트박스. 모든 장이 그려져야 승인 가능. 제거는 확인 창과 고정 사유, 문구는 「제거(숨김)」 | O | — | O |
| `/ops` | 판단 한 줄, 동기 멈춤과 기기 정보·오류, 연락 끊긴 기기(회색), 백업·복원 시험·디스크, 사용자 목록, 새로고침. 이메일 전체 노출 금지, 빨강은 경고에만 | O | — | — |
| `/settings` | 광고 미리 보기 켜기·끄기 링크. 상태는 표시하지 않는다(Phase 5) | O | — | — |

신고 대기는 `ListQueue(limit:200)` 줄 수를 쓴다. `GetOperationsStats` 수는 대상별 묶음과 자동 보류가 달라 쓰지 않는다. 미처리 의견은 `ListEntries(USER)` 를 세고 200 이면 「200+」로 표시한다. 권한 없는 주소는 안내를 보이고 RPC 를 부르지 않는다. 왼쪽 메뉴 「운영 상태」에 경고 점을 달고 `src/frontend/lib/opsAlert.ts` 의 10분 폴링, 화면 복귀 재확인, 실패 시 직전 값 유지 규칙을 옮긴다.

#### 공통 UI와 표 규격

- 왼쪽 고정 메뉴와 넓은 본문(최대 1400px). 768px 아래는 위쪽 접는 메뉴. 공통 부품(`Button`, 입력칸, 태그, 표, 거르기, 페이지, 확인 창, 알림)을 이 프로젝트에서 새로 만든다.
- 거르기와 페이지는 브라우저에서 처리하고 URL 쿼리에 저장한다. 50줄씩, 처리 후 페이지와 스크롤 유지, 건수 표시, 상한 도달 시 「최근 N건만 표시」 고지. 머리글 고정, 동작 열 오른쪽 고정, 시각은 KST 날짜+시각.
- 빈 상태: 데이터 없음, 거르기 결과 없음(지우기 포함), 집계 시행 전, 처리할 일 없음을 구분한다.
- 오류: 로그인 만료는 원래 주소로 복귀, 권한 회수 안내, 요청 제한은 대기 안내, 충돌은 다시 읽기, 502 는 백엔드 장애 안내. 재로드 실패 시 기존 데이터를 유지하고 「n분 전 데이터」로 표시한다. 화면마다 갱신 시각과 새로고침, 탭이 보일 때만 자동 갱신.
- 사진: 보이는 줄만 불러오고 동시 3개, binary 전송, 요청 제한 표시. `/media` 경로는 쓰지 않고 `GetReviewMedia` 로 받아 `blob:` 로 그린다.
- 운영 문구는 이 프로젝트에 한국어로 둔다. 통계 이름표는 접두 단위로 옮기고 서버 이벤트 이름 전체에 이름표가 있는지 시험한다.

#### 배포

- Dockerfile: `frontend-deps` 에 `admin/package.json` 복사 추가. admin 빌드는 `package.json`, `tsconfig.json`, `contracts`, `admin` 만 복사해 앱 변경으로 재빌드되지 않게 한다. 최종 단계에 `LABEL project=liftgram`.
- compose: 서비스 `admin`, 기본 포트는 개발용 3102, `compose.prod.yaml` 은 `127.0.0.1:${ADMIN_PORT:?}:3000` 과 `restart: unless-stopped`, `mem_limit: 512m`. `depends_on` 없음. 운영 값 3411 은 서버 `.env` 에 넣는다.
- `src/scripts/deploy-admin-h2500-3.sh`: 앱 소스 사본을 덮지 않는 별도 경로, 3411 점유 확인(남의 프로세스면 멈춤, 죽이지 않음), `build admin`, `up -d --no-deps --wait admin`, health 직접 검사, `DEPLOYED_ADMIN_REF` 기록, `src/proto`·`src/contracts` 가 앱 배포 기록과 다르면 멈춤. `ADMIN_SITE` 가 있으면 공개 주소에서 Access 응답을 확인한다.
- `src/scripts/deploy-h2500-3.sh`: admin 을 재시작하지 않는다. `--remove-orphans` 가 admin 을 지우지 않게 하고, 커밋에 `src/admin` 이 없는 옛 커밋 되돌리기를 시험한다. 앱 운영 화면이 없는 커밋은 서버 표식 `ADMIN_LOGIN_CONFIRMED=1` 이 있어야 rsync 전에 통과한다.
- 버전: `src/admin/package.json` 은 앱과 따로 올린다(첫 판 0.1.0). 앱은 Phase 5 배포 때 0.70.0.

#### 사람 작업

- Cloudflare 터널 공개 호스트명 `liftgram-admin.tarae.org` → `http://localhost:3411`. 다른 항목은 건드리지 않는다.
- Access 애플리케이션과 운영자 메일 허용 정책, 그리고 받은 `aud` 값을 서버 `.env` 의 `CF_ACCESS_AUD` 에 넣는다.
- Google 전용 관리자 계정: 앱 `/account` 에서 비밀번호를 만든다.

### 작업 단계

#### Phase 1 — 골격, 입구, 로그인, 단독 배포

- [x] `src/admin` 워크스페이스, 프록시, 세션, Access 검증, CSP, 헤더
- [x] `/login`, 역할 판정, 메뉴 틀
- [x] Dockerfile, compose, 단독 배포 스크립트, 검사 스크립트 편입
- [x] 시험: 역할 4종, Set-Cookie 없음, CSRF 거절, 위조 XFF, Access 토큰 없음·위조 거절, 허용 밖 RPC 404, CSP 위반 0건, 탭 2개 동시 갱신
- 완료 기준: 로컬 운영 빌드에서 시험과 `make verify` 가 통과하고, 앱 이미지와 앱 재시작에 영향이 없다.

#### Phase 2 — 공통 UI, 요약, 운영 상태

- [ ] 공통 부품과 표 규격
- [ ] 역할별 `/`, `/ops`, 메뉴 경고 점
- [ ] 운영 경고 메일(결정 시)
- [ ] `ops-status` 운영 시험 이전
- 완료 기준: 협업자와 모더레이터가 빈 화면이나 오류를 보지 않고, 관리자는 경고 이유를 맨 위에서 본다.

#### Phase 3 — 통계

- [ ] `/stats` 전체, 구역별 로드·실패·재시도, 시행 전 안내, 집계 시각
- [ ] 통계 항목 대조표, `admin-stats` 의 표시 시험(42, 68, 133, 345줄) 이전
- 완료 기준: SRS-102 항목과 지금 화면의 항목이 전부 있다.

#### Phase 4 — 처리 화면과 첫 공개

- [ ] `/moderation`, `/user-feedback`, `/ops-feedback`
- [ ] `feedback`, `moderation`(98, 144), `user-feedback`(138), `photo-scan`(96 이후) 시험 이전. 데이터는 SQL·RPC 로 준비하고 건너뛰기 없이 실행
- [ ] PC와 휴대폰 폭 확인, 운영 웹 배포
- 완료 기준: 앱 없이 운영 웹만으로 모든 운영 작업을 끝낸다. 여기서 사람 작업과 실제 계정 로그인을 기다리며, 이 확인 전에는 Phase 5 를 내보내지 않는다.

#### Phase 5 — 앱 정리

- [ ] 범위의 지움·고침, 212개 문구 삭제(`moderation.actionFailed` 는 유지)
- [ ] 앱 프록시에서 운영 RPC 차단(`Report`, `SubmitUserFeedback`, `ReportClientHealth` 유지), 옛 PWA 가 조용히 넘어가는지 확인
- [ ] 옛 주소 307: `/admin`·`/staff`→`/`, `/admin/stats`→`/stats`, `/admin/feedback`→`/user-feedback`, `/feedback`→`/ops-feedback`, `/moderation`, `/ops`. 목적지는 빌드 값 `ADMIN_URL`
- [ ] 서비스 워커가 옛 주소를 캐시하지 않게 하고 청소
- [ ] 광고 미리 보기: `/?adPreview=on|off`, `adPreviewOn()` 첫 줄에서 처리 후 주소에서 지움, 관리자 역할 확인과 `adGuard` 유지, `/settings` 링크
- [ ] 앱 e2e 분할(남김: `admin-stats` 177, 227, 256, 306, 404 · `moderation` 35, 66, 113 · `ops-status` 99 앞부분 · `user-feedback` 45, 74, 87, 105, 131), `staff-tab`, `ad-slots`, `declutter-shots` 교체
- [ ] 번들 금지 목록 스크립트(`.next/static/**`), 화면 지도 보고서·와이어프레임 갱신
- [ ] `src/scripts/deploy-h2500-3.sh` 에 `ADMIN_LOGIN_CONFIRMED=1` 검사, 옛 커밋 되돌리기 시험(REV-049 에서 옮김)
- 완료 기준: 앱 어디에도 운영 입구가 없고 옛 주소는 운영 웹으로 간다. 신고, 차단, 의견, 기기 상태 보고, 이용 기록 시험이 통과한다.

### 수용 기준

- SRS-103 의 수용 기준을 만족한다.
- SRS-102 의 통계 항목과 로그인·비로그인·합계 분리를 유지한다.
- 운영 역할이 아닌 계정과 앱 주소로는 어떤 운영 데이터도 볼 수 없다.
- 역할별 실제 계정이 공개 주소에서 로그인된 뒤에만 앱에서 운영 화면이 사라진다.
- [ ] `src/scripts/deploy-h2500-3.sh` 에 `ADMIN_LOGIN_CONFIRMED=1` 검사, 옛 커밋 되돌리기 시험(REV-049 에서 옮김)
- 예외: 앱의 잠금화면 진단(`src/frontend/app/components/profile/LockScreenRow.tsx`)은 기기 안 정보라 옮길 수 없어 남기고, 광고 미리 보기 저장값 처리도 앱에 남는다.

### 테스트 계획

- 운영 웹 Playwright: 로컬 운영 빌드, 새 DB, 웹 3320·API 3321(3200·3201·3300 과 겹치지 않게). `FEEDBACK_EMAIL`, `MOD_EMAIL` 없이도 건너뛰지 않게 계정을 SQL 로 만든다.
- 백엔드 `go test ./...`, 타입 검사, 빌드, 운영 웹에 `@app/core` 가져오기가 없는지 검사.
- 앱 전체 e2e 는 Phase 5 에서 기준선(`dm.spec.ts:158`, `opengym-import.spec.ts:196,269,576` 실패 4건)과 대조.
- [ ] `src/scripts/deploy-h2500-3.sh` 에 `ADMIN_LOGIN_CONFIRMED=1` 검사, 옛 커밋 되돌리기 시험(REV-049 에서 옮김)
- 실기기: 옛 번들에서 운영 줄 누름, 앱 링크로 미리 보기 켜기, 안드로이드와 iOS 외부 브라우저 넘김. 앱 안에서 켜지지 않으면 예외로 보고한다.

### 위험·주의

- 터널과 Access 설정은 동업자와 공유하는 대시보드에서 한다. 이 호스트명 외의 항목은 건드리지 않는다.
- Google 전용 관리자에게 비밀번호가 생기면 앱 로그인 경로가 늘어난다. 앱 프록시 차단과 Access 가 함께 있어야 운영 데이터가 막힌다. 두 겹이 다 들어가기 전에는 공개하지 않는다.
- 옛 번들 앱에서 운영 줄을 누르면 외부 브라우저로 나간 뒤 앱이 멈춘 듯 보일 수 있다(소스 추론, 미확인). Phase 5 전에 운영진에게 업데이트를 안내한다.
- `Resolve` 는 현재 상태를 보지 않아, 낡은 탭의 승인이 다른 운영자가 제거한 글을 되살릴 수 있다. 기존 동작이고 이번 범위 밖이라 할 일로 등록한다.
- 큐는 200건에서 최신순으로 잘려 오래된 건이 안 보일 수 있다. 화면에 고지한다.
- 운영 웹도 백엔드 요청 제한(읽기 IP당 분당 120회)을 앱과 같이 받는다. 사진 동시 수를 묶는다.
- [ ] `src/scripts/deploy-h2500-3.sh` 에 `ADMIN_LOGIN_CONFIRMED=1` 검사, 옛 커밋 되돌리기 시험(REV-049 에서 옮김)
- 운영 도메인을 `src/mobile/capacitor.config.ts` 허용 목록에 넣지 않는다. 운영 웹이 앱 브리지 안에서 열리면 안 된다.
