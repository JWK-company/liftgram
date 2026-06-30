# Liftgram

운동 기록 + 소셜을 통합한 피트니스 앱. **Hevy식 운동 트래킹**(루틴·세션·점진 과부하)에 **인스타그램식 소셜**(피드·DM·스토리·탐색·PT 문의/만남)을 결합한다. **오프라인-우선**(로컬에서 즉시 동작 후 서버 동기), **한국어/영어**, **웹(PWA) 우선** 멀티플랫폼.

> 이 저장소는 **모노레포**다: 실제 제품(`app/` 앱 · `server/` 백엔드) + 기획·거버넌스 워크플로우(`.ouroboros/`, `plugin/` — [§기획·거버넌스](#기획거버넌스) 참고).

---

## 구조

```
health-practice/
├─ app/         Expo / React Native (TypeScript) 앱 — WatermelonDB(로컬-우선), web-first
├─ server/      NestJS + PostgreSQL + Prisma 백엔드 — 계정·인증(JWT)·동기
├─ .ouroboros/  기획 산출물(URS/UCS/SRS/SAD/ADR/Roadmap)·컨텍스트·PLM 바인딩
├─ plugin/      Claude Code 기획/거버넌스 플러그인 (plan · plm-hub)
├─ reference/   리서치·리스크 노트
└─ CLAUDE.md    기획 워크플로우 가이드(거버넌스 권위 문서)
```

핵심 흐름: **앱(로컬 WatermelonDB)** 에서 모든 기능이 오프라인으로 동작 → **프로필 → 서버 동기** 로 `server/`(NestJS)에 push/pull → **PostgreSQL**에 적재. 충돌은 last-write-wins (ADR-002).

---

## 사전 준비

| 도구 | 버전 | 비고 |
|------|------|------|
| Node.js | ≥ 20 | app·server 공통 |
| npm | ≥ 9 | |
| PostgreSQL | 16 | 로컬 설치 **또는** Docker |
| pgAdmin 4 | (선택) | DB 시각 확인 |

---

## 1. 백엔드 세팅 & 실행 (`server/`)

### 1-1. 데이터베이스 준비 (택1)

**A) 로컬 PostgreSQL (권장 — pgAdmin 확인 쉬움)**

pgAdmin 또는 psql로 **`postgres` 슈퍼유저** 접속 후, 롤과 DB를 **각각 따로** 생성한다 (`CREATE DATABASE`는 다른 문과 같은 트랜잭션에서 못 돈다):

```sql
CREATE ROLE wbi WITH LOGIN PASSWORD 'wbi' SUPERUSER CREATEDB;
```
```sql
CREATE DATABASE liftgram OWNER wbi;
```

**B) Docker**

```bash
cd server && npm run db:up      # docker compose — PostgreSQL :5433
```

### 1-2. 환경변수

```bash
cd server
cp .env.example .env
```
`.env`의 `DATABASE_URL`을 본인 환경에 맞춘다:
- 로컬 PG: `postgresql://wbi:wbi@127.0.0.1:5432/liftgram?schema=public`
- Docker:  `postgresql://liftgram:liftgram@localhost:5433/liftgram?schema=public`

`JWT_SECRET`은 임의 문자열로 바꾼다(개발 기본값 `dev-change-me`).

### 1-3. 설치 · 마이그레이션 · 기동

```bash
npm install
npx prisma migrate deploy      # 기존 마이그레이션 적용(테이블 생성). 신규 변경 개발 시엔 npm run prisma:migrate
npm run start:dev              # http://localhost:3000/api  (watch 모드)
```

확인:
```bash
curl http://localhost:3000/api/health      # → {"status":"ok","db":"up",...}
```

---

## 2. 앱 세팅 & 실행 (`app/`)

```bash
cd app
npm install
npm run web                    # 웹(PWA) — http://localhost:8081
```

기타 실행:
- `npm start` — Expo Dev 서버(QR·기기 선택)
- `npm run ios` / `npm run android` — 네이티브 빌드(추가 정비 필요 — 후순위 옵션)
- `npm run typecheck` — 타입 점검 · `npm test` — 도메인 단위 테스트

서버 주소 바꾸기: 환경변수 **`EXPO_PUBLIC_SERVER_URL`**(기본 `http://localhost:3000/api`).
실기기에서 접속하려면 `localhost` 대신 **개발 머신의 LAN IP**로 지정한다. 예:
```bash
EXPO_PUBLIC_SERVER_URL=http://192.168.0.10:3000/api npm run web
```

---

## 3. 앱 ↔ 서버 동기

1. `server`를 기동(§1-3)하고 `app`을 실행(§2)한다.
2. 앱에서 **프로필 → 서버 동기** 카드 → **가입/로그인**(이메일·비밀번호) → **지금 동기**.
3. WatermelonDB `synchronize()`가 로컬 변경을 서버로 **push**, 서버 변경을 **pull** 한다(오프라인-우선, last-write-wins).
4. 데이터는 PostgreSQL `SyncRecord` 테이블에 `payload`(JSONB)로 적재된다.

---

## 4. DB 확인 (pgAdmin 4)

서버 등록 → 연결 탭:

| 필드 | 값 |
|------|-----|
| 호스트 | `127.0.0.1` (또는 `localhost`) |
| 포트 | `5432` (Docker면 `5433`) |
| 데이터베이스 | `liftgram` |
| 사용자 | `wbi` |
| 비밀번호 | `wbi` |

테이블(**Databases → liftgram → Schemas → public → Tables**):
- **`User`** — 계정(비밀번호는 bcrypt 해시)
- **`SyncRecord`** — 동기 핵심: `userId · collection · recordId · payload(JSONB) · version · deleted · updatedAt`, 유니크 `(userId, collection, recordId)`
- `Device` · `RefreshToken` — 기기·토큰
- 행 보기: `SyncRecord` 우클릭 → **데이터 보기/편집 → 모든 행**

---

## API (요약)

베이스: `http://localhost:3000/api`

| 메서드 | 경로 | 인증 | 설명 |
|--------|------|------|------|
| GET | `/health` | — | 상태·DB |
| POST | `/auth/signup` | — | `{email,password,displayName?}` → `{accessToken}` |
| POST | `/auth/login` | — | `{email,password}` → `{accessToken}` |
| GET | `/users/me` | Bearer | 내 프로필 |
| GET | `/sync/pull?lastPulledAt=<ms>` | Bearer | `{changes:{table:{created,updated,deleted}}, timestamp}` (WatermelonDB) |
| POST | `/sync/push` | Bearer | body `{changes:{...}}` (WatermelonDB) |

상세: [server/README.md](server/README.md)

---

## 아키텍처 메모

- **오프라인-우선 (ADR-002 · SAD-004)**: 스키마 권위는 **앱(WatermelonDB)**. 서버는 도메인(운동·루틴·세션)을 `SyncRecord.payload`로 **불투명 보관**하고 충돌은 **last-write-wins** — 앱 도메인이 확장돼도 서버 스키마 변경 없이 흡수.
- **앱**: web-first PWA(LokiJS/IndexedDB) + 네이티브(SQLite) 어댑터 분기 · i18n(ko/en) · 온디바이스 결정적 프로그램 생성/점진 과부하(SRS-009/010).
- **백엔드**: NestJS 모듈러 모놀리스(ADR-018) — `health · auth · users · sync` 모듈. 인증은 현재 로컬 email/password + JWT(추후 매니지드 인증 어댑터로 교체).
- **후속(백엔드 페이즈)**: refresh 토큰 회전 · 소셜(SAD-011) · 미디어/스토리(SAD-012) · 결제(SAD-013) · 알림(SRS-020).

---

## 기획·거버넌스

제품 코드와 별개로, 이 repo는 **ouroboros/PLM 기획 워크플로우**로 관리된다. 요구·설계·의사결정·로드맵 산출물은 `.ouroboros/docs/`에 있고, 추적성(요구→설계→코드)·게이트(G1~G3)는 PLM(`jwk-plm.shoi.ch`)이 거버넌스한다. 규칙·스킬 전문은 **[CLAUDE.md](CLAUDE.md)** 참고. (이 워크플로우는 제품 실행과 무관 — 위 §1~4만으로 앱·서버가 구동된다.)
