# health-practice 백엔드 (`server/`)

헬스앱 백엔드 — **Node.js / TypeScript 모듈러 모놀리스(NestJS) + PostgreSQL** (ADR-018).
**계정·인증 + 오프라인-우선 동기 토대**(SRS-006 · ADR-002 · SAD-004)부터 시작한다. 앱(`../app`)은 로컬-우선(WatermelonDB)이며, 이 서버가 크로스디바이스 동기·소셜·결제의 백엔드가 된다.

## 아키텍처 (모듈러 모놀리스 — ADR-011 / ADR-018)
도메인 모듈을 한 배포 단위로 묶는다.

| 모듈 | 책임 | 추적 |
|------|------|------|
| `health` | 헬스체크(DB 포함) | — |
| `auth` | 로컬 email/password + JWT (→ 매니지드 인증 어댑터로 교체) | SRS-006 |
| `users` | 프로필 조회(`me`) | SRS-006 |
| `sync` | 오프라인-우선 push/pull · last-write-wins | SRS-006 · ADR-002 · SAD-004 |

후속(설계 완료·미구현): `social`(SAD-011) · `media`(SAD-012) · `payments`(SAD-013) · `notifications`(SRS-020).

## 실행
```bash
cp .env.example .env          # JWT_SECRET 등 확인
npm install
# --- DB 택1 ---
# A) Docker:          npm run db:up   (PostgreSQL :5433)
# B) 로컬 PostgreSQL:  pgAdmin/psql로 DB 'liftgram' 생성 후, .env의 DATABASE_URL을 본인 접속정보로.
#    예: postgresql://postgres:<비번>@localhost:5432/liftgram?schema=public
npm run prisma:migrate        # 스키마 마이그레이션(+ Prisma client 생성)
npm run start:dev             # http://localhost:3000/api
```

## API (토대)
| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| GET | `/api/health` | — | 상태·DB |
| POST | `/api/auth/signup` | — | `{email,password,displayName?}` → `{accessToken}` |
| POST | `/api/auth/login` | — | `{email,password}` → `{accessToken}` |
| GET | `/api/users/me` | Bearer | 내 프로필 |
| GET | `/api/sync/pull?lastPulledAt=<ms>` | Bearer | `{changes:{table:{created,updated,deleted}}, timestamp}` (WatermelonDB) |
| POST | `/api/sync/push` | Bearer | body `{changes:{table:{created,updated,deleted}}}` (WatermelonDB) |

## 동기 모델 (ADR-002)
Phase 0 도메인(운동·루틴·세션)은 서버에서 `SyncRecord.payload`(JSON)로 **불투명 보관** — 스키마 권위는 클라이언트(WatermelonDB). 충돌은 `version` 기준 **last-write-wins**. 추후 서버측 정규화·도메인 검증으로 확장.

## pgAdmin4로 확인
1. pgAdmin → 서버 등록: Host=`localhost`, Port=`5432`(로컬)/`5433`(docker), DB=`liftgram`, User/비번=본인.
2. Schemas → public → Tables: `User`·`Device`·`RefreshToken`·`SyncRecord`.
3. 앱에서 로그인·동기 후 `SyncRecord`(collection·recordId·payload) 행이 쌓이면 → 앱→서버→DB 흐름 검증.

## 앱 연동 (`../app`)
- 서버 URL: 앱 `src/config.ts`(기본 `http://localhost:3000/api`). 실기기는 `EXPO_PUBLIC_SERVER_URL`로 머신 LAN IP.
- 앱 → **프로필 → 서버 동기** 카드: 로그인/가입 → **지금 동기** → WatermelonDB `synchronize()`가 로컬 변경 push + 서버 변경 pull.

## 다음
- refresh token 회전·세션 영속
- 매니지드 인증 어댑터(Clerk/Supabase 등) — ADR-018
- `social`/`media`/`payments` 모듈 (SAD-011/012/013)
