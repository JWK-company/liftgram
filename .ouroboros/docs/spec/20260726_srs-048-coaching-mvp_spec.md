# SRS-048 코칭 마켓 MVP — 구현 스펙 (수직 슬라이스 1)

- 등급: **Project** (서버+클라이언트·DB 마이그레이션) · 근거: SRS-048(Approved)·SAD-022·ADR-028·UCS-019
- 발견: "앱 단독 불가"의 답 = **기존 NestJS 서버**(liftgram/server — auth·소셜·DM·sync 보유, Render 배포). 신규 인프라 불필요 — coaching 모듈 추가로 해결.

## 아키텍처 (SAD-022 실현 방식)
- **권한 모델**: `CoachingGrant`(trainerId·memberId·status pending→active→revoked·scope·consentAt) — 요청(어느 쪽이든)→상대 수락(=동의)→active. 해지 즉시 revoked(회수).
- **3중 조건 중 구독**: SRS-014 결제 미구현 → **스텁**: 트레이너 자격=서버 profile.trainerIntent=true 확인만. TODO 주석+스펙 명기(구독 도입 시 guard 한 줄 교체). 편차 문서화.
- **회원 데이터 접근**: 서버 `SyncRecord`(회원이 동기한 workouts·set_logs·exercises raw payload)를 **서버측 집계**로만 노출(리포트) — 회원 기기 직접 접근 없음(SAD-022 원칙). scope=logView 가드.
- **감사 로그**: `CoachingAudit`(grantId·actorId·action·detail) — accept/revoke/report_view 전 건 기록. 회원 열람 API.
- **처방 편집(M2)**: 이번 슬라이스 제외 — 다음 슬라이스에서 서버가 회원 SyncRecord(routines·routine_exercises.prescription)를 버전 증가로 upsert→회원 앱이 pull(기존 sync 경로 재사용). 이번엔 리포트(M3)+권한(M1)까지.

## Phase A — 서버 (server/)
1. Prisma: User에 `experienceLevel String?`·`trainerIntent Boolean @default(false)`(SRS-045 서버 반영 — 트레이너 탐색) + `CoachingGrant`·`CoachingAudit` 모델 + 마이그레이션.
2. `src/coaching/` 모듈(JwtAuthGuard 관례):
   - GET `/coaching/trainers?q=` — trainerIntent=true 사용자 탐색(표시명 검색·차단 제외)
   - POST `/coaching/requests` {trainerId|memberId} — pending grant(중복 방지 upsert)
   - GET `/coaching/grants` — 내 grants(회원·트레이너 양방향, 상대 프로필 포함)
   - POST `/coaching/grants/:id/accept` — 상대방만 가능 → active·consentAt(동의)
   - POST `/coaching/grants/:id/revoke` — 양쪽 모두 가능 → revoked(즉시)
   - GET `/coaching/members/:memberId/report` — active+logView 가드 → 최근 8주 집계(세션 수·주당 세션·총볼륨·부위별 볼륨·최근 세션 5)
   - GET `/coaching/audit?grantId=` — 그 grant 당사자만
3. users profile 업데이트 API에 experienceLevel·trainerIntent 수용.

## Phase B — 앱 (app/)
1. serverApi: coaching 함수 + updateProfile 확장.
2. ExperienceCard 저장 시 로그인 상태면 서버 profile에도 반영(silent).
3. `CoachingScreen`(신규 라우트·프로필 탭 진입): 내 코치·담당 회원(grant 목록·수락/해지) + 트레이너 찾기(검색→요청) + 회원 리포트(트레이너 view) + 면책 문구.
4. i18n ko/en.

## 검증
- server: `npm run typecheck`(+빌드). migrate는 로컬 docker DB로 생성(불가 시 SQL 수기 — 배포 시 migrate deploy가 적용).
- app: typecheck + 기존 테스트 회귀 없음.
- qa 관점: 가드 우회 경로 없음(모든 coaching 엔드포인트 grant 검증)·차단(Block) 사용자 배제·본인 요청 불가.
- 전 코드 `@plm SRS-048` (profile 확장은 `@plm SRS-045` 병기).
