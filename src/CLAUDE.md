# liftgram `src/` — 웹 스택의 구조와 작업 흐름 (이 파일이 이 디렉터리의 색인이다)

Claude Code가 세션마다 자동으로 읽는 파일이다. **어디에 무엇이 있고, 무엇을 하려면 어디부터 손대는지**를
여기서 찾고, 자세한 내용은 각 디렉터리의 README로 내려간다. 규칙과 실제 코드가 어긋나면 코드가 옳다 —
그런 경우 이 파일을 고쳐 주는 것까지가 작업이다.

> **범위와 우선순위**
> 이 파일은 `src/` 안의 **스택 사용법**만 다룬다. 기획·메모리·거버넌스·행동 규칙은 저장소 루트의
> [`../CLAUDE.md`](../CLAUDE.md)가 단일 권위이며, 충돌하면 **루트가 이긴다**.
>
> **출처**: `tarae-web-stack` 템플릿(2026-08-01 이식). 원본 저장소는 `../../tarae-web-stack`에 그대로 있고
> 이 디렉터리는 `.git` 없이 복사돼 liftgram 저장소의 일부다 — 원본으로 되돌려 보내는 경로는 없다.

---

## 1. 한 장 지도

```
브라우저 ──▶ frontend (Next 16 · :3100)          화면 + /api/* 프록시 + /ws 터널
                  │
                  ▼
              backend (Go · Connect RPC · :3101, 내부 전용)   도메인 규칙 · 실시간의 종단
                  │
                  ▼
              database (PostgreSQL :5434) + broker (Redis :6381)
```

> 포트가 템플릿 기본값(3000/3001/5433/6380)과 다르다 — 같은 머신에서 원본 `tarae-web-stack`이 그 포트로
> 돌고 있어 `.env`에서 옮겼다. 값의 원본은 `.env` 하나다.

| 디렉터리 | 무엇이 있나 | 언제 여는가 |
|---------|------------|------------|
| [`proto/`](proto/README.md) | **contract source**(.proto) — 여기서 Go·TS가 동시 생성된다 | API 모양을 바꿀 때 **가장 먼저** |
| [`backend/`](backend/README.md) | Go 서버 — handler · service · repo · 미들웨어 | 규칙·데이터 접근·실시간을 바꿀 때 |
| [`database/`](database/README.md) | 사람이 쓰는 SQL — 마이그레이션 · 쿼리 · sqlc 설정 | 테이블·쿼리를 바꿀 때 |
| [`frontend/`](frontend/README.md) | Next 앱 — 화면 · 프록시 라우트 · 커스텀 서버 | 화면·입구를 바꿀 때 |
| [`contracts/`](contracts/README.md) | 계약의 TypeScript 면(생성물 + 얇은 재수출) | 손댈 일이 거의 없다(생성물) |
| [`scripts/`](scripts/README.md) | 검증·생성 도구(전부 셸/노드) | 검사를 추가하거나 CI를 고칠 때 |
| [`docs/`](docs/) | 사람이 읽는 설명서 2종(HTML) | 처음 배울 때 · 문서를 갱신할 때 |

**읽는 순서 추천**: 이 파일 → [`docs/source-handbook.html`](docs/source-handbook.html)(소스 트리를 따라가며
읽는 설명서) → 고칠 디렉터리의 README.

---

## 2. 작업별 시작점 (색인)

| 하려는 일 | 순서 | 첫 파일 |
|-----------|------|---------|
| **새 도메인 추가**(주문·게시글…) | `make gen NAME=order` 로 뼈대 생성 → 채우기 | [`scripts/gen-module.mjs`](scripts/gen-module.mjs)가 만드는 6곳 |
| **API 필드·엔드포인트 변경** | `.proto` 수정 → `make proto` → handler·service | [`proto/exercise/v1/exercise.proto`](proto/exercise/v1/exercise.proto) |
| **비즈니스 규칙 변경** | service만 고치고 테스트 | [`backend/internal/exercise/service.go`](backend/internal/exercise/service.go) |
| **테이블 추가·변경** | `make gen-migration NAME=…` → SQL → `make sqlc` → `make migrate` | [`database/migrations/`](database/migrations/) |
| **쿼리 추가** | `.sql`에 쿼리 → `make sqlc` → repo에서 호출 | [`database/queries/exercise.sql`](database/queries/exercise.sql) |
| **화면 추가** | `make gen-page NAME=posts` → 컴포넌트 채우기 | [`frontend/app/`](frontend/app) |
| **실시간 채널 이해** | unary·스트리밍·WS 세 갈래가 **같은 service**를 부른다 | [`backend/internal/exercise/handler.go`](backend/internal/exercise/handler.go) · [`ws.go`](backend/internal/exercise/ws.go) |
| **설정 추가** | 백엔드는 config.go, 화면은 env.ts, 그리고 `.env.example` | [`backend/internal/config/config.go`](backend/internal/config/config.go) |
| **오류 응답 바꾸기** | 도메인 오류 → Connect 코드 매핑 한 곳 | [`backend/internal/middleware/errors.go`](backend/internal/middleware/errors.go) |
| **프록시·헤더 문제** | 화면이 보는 유일한 입구 | [`frontend/app/api/[...path]/route.ts`](frontend/app/api/[...path]/route.ts) |
| **컨테이너·배포** | 두 이미지가 한 Dockerfile에서 나온다 | [`Dockerfile`](Dockerfile) · [`compose.yaml`](compose.yaml) |

---

## 3. 표준 작업 흐름

```
① 계약        proto/…/*.proto 수정
② 생성        make proto          → backend/gen · contracts/gen 동시 갱신
③ 데이터      make gen-migration → SQL 작성 → make sqlc → make migrate
④ 규칙        backend/internal/<도메인>/service.go (+ service_test.go)
⑤ 노출        handler.go(unary·스트리밍) · ws.go(양방향)
⑥ 조립        backend/cmd/server/main.go 에 네 줄
⑦ 화면        frontend/app/…
⑧ 검증        make verify → make smoke → make ci
```

**생성 단계를 건너뛰면 컴파일이 깨져서 알려 준다** — 이것이 이 스택의 안전장치다.
`make proto`·`make sqlc`의 산출물은 **커밋한다**(받는 사람이 도구 없이 빌드되도록). CI의
`proto-check`가 커밋 누락을 잡는다.

### 이름 규칙 (헷갈리기 쉬운 곳)

| 층위 | 이름 | 예 |
|------|------|-----|
| 디렉터리 · compose 서비스 · 이미지 · make 타깃 | **frontend · backend** | `make dev-backend` · `docker compose logs frontend` |
| URL 경로 · 설정 키 | **api** (서비스가 아니라 *역할*) | `/api/*` · `API_URL` · `API_PORT` |

`/api/*`는 브라우저가 보는 **공개 경로**라 바꾸지 않는다. "backend가 제공하는 API"로 읽으면 된다.

---

## 4. 지켜야 하는 경계

| 규칙 | 왜 |
|------|-----|
| `service.go`는 connect·proto·pgx를 **import하지 않는다** | 규칙만 남아야 DB·서버 없이 2ms에 테스트된다 |
| `repo.go`만 SQL(생성물)을 안다 | 데이터 접근이 한 겹에 모인다 |
| 설정을 읽는 곳은 **각 단위에 하나** (`config.go` · `lib/env.ts`) | 누락이 부팅 시점에 잡힌다 |
| propagation(`bus.Publish`)는 **이름만** 보낸다 · 커밋 뒤에 | 수신자가 최신값을 다시 읽어 순서 문제가 사라진다 |
| Status·상태 전이는 **PLM 대시보드 소유** | 로컬에서 바꾸지 않는다 |
| 알고리즘을 교체할 때 기존 함수는 **지우지 않고** 새 함수를 추가, 기존 호출은 주석 처리 | 원복 가능성을 남긴다 |

---

## 5. 자주 쓰는 명령

```bash
make doctor        # 필요한 도구 확인(Docker · Bun · Go · buf)
make bootstrap     # 처음 클론했을 때 한 줄
make dev           # 개발 서버(backend + frontend 동시)
make verify        # lint + 타입 + 테스트 + 문서 drift
make smoke         # 뜬 서버에 12종 실검증
make ci            # CI 전 과정 9단계(러너에서도 이 한 줄)
make help          # 전체 타깃 목록
```

포트가 점유돼 있으면 **프로세스를 죽이지 말고** `.env`의 포트를 바꾸거나 그 터미널에서 Ctrl-C로 끈다
(패턴 종료가 무관한 프로세스까지 죽인 사고가 있었다 — `make down-all`은 이제 알려만 준다).

---

## 6. 추적성 — `@plm` 주석

소스 곳곳의 `// @plm SRS-001` 주석은 그 코드가 **어떤 요구사항을 구현하는지** 가리킨다.
새 코드를 쓸 때 관련 요구가 있으면 같은 형식으로 달아 둔다 — 도구가 요구↔코드 딥링크를 만든다.
생성물(`*/gen/`)은 [`.plmignore`](.plmignore)로 제외한다(계약의 source of truth는 `proto/` 한 곳이다).

---

## 7. 더 읽을 것

- [`README.md`](README.md) — 5분 퀵스타트 · 필요한 도구
- [`docs/source-handbook.html`](docs/source-handbook.html) — 파일별 코드 발췌와 함께 트리를 따라가는 설명서
- [`docs/development-guide.html`](docs/development-guide.html) — 명령 지도 · 확장 레시피 · 환경변수 · 함정 모음

---

## 용어 해설

기술 용어는 **원어 그대로** 쓴다 — 검색하고 질문할 때 쓰는 말과 문서의 말이 같아야 하기 때문이다.

| 용어 | 우리말 | 뜻 | 이 저장소에서 |
|------|--------|-----|--------------|
| **contract** | 계약 | 주고받을 데이터의 모양·동작·검증을 못 박은 것. 여기서는 `.proto` 한 장 | `proto/` |
| **single source of truth (SSOT)** | 단일 원본 | 같은 사실이 두 곳에 적히지 않게 하는 원칙. contract는 proto, schema는 migrations | `proto/ · database/migrations/` |
| **unary / server streaming** | 단항 / 서버 스트리밍 | 요청 하나에 응답 하나 / 요청 하나에 응답이 계속 흘러오는 구독 | `backend/internal/exercise/handler.go` |
| **idempotency** | 멱등성 | 같은 요청을 여러 번 보내도 결과가 한 번 보낸 것과 같다. 재시도가 안전해진다 | `CreateCustomExercise의 idempotency_key` |
| **rate limit** | 요청 제한 | 정해진 시간에 허용하는 요청 수. 넘으면 429와 Retry-After | `backend/internal/middleware/ratelimit.go` |
| **propagation (pub/sub)** | 전파 | 값이 바뀐 사실을 다른 구독자·다른 인스턴스에 알리는 것. 이름만 싣는다 | `backend/internal/realtime/bus.go` |
| **snapshot → delta** | 스냅샷 → 변화분 | 구독하면 현재 상태를 통째로 한 번(snapshot), 이후에는 변화만(delta) | `WatchCatalog · ws.go` |
| **composition root** | 조립 지점 | 의존을 실제로 만들어 끼우는 단 한 곳. 나머지는 인터페이스만 안다 | `backend/cmd/server/main.go` |
| **entry point** | 진입점 | 프로세스가 실제로 시작되는 파일 | `frontend/server.mjs · backend/cmd/server` |
| **runtime contract** | 실행 규약 | 이미지가 지켜야 하는 약속 — non-root · 포트 · entry point · 설정 누락 시 부팅 실패 | `scripts/check-contract.sh` |
| **one-shot** | 원샷 | 떠 있는 서비스가 아니라 한 번 돌고 끝나는 실행 단위. 마이그레이션이 그렇다 | `compose의 migrate` |
| **drift** | 드리프트 | 문서·생성물·PLM이 코드와 어긋난 상태. CI가 매번 확인한다 | `make docs-check · make proto-check` |
| **smoke test** | 스모크 테스트 | 떠 있는 서버에 대고 최소한의 핵심 경로를 실제로 두드려 보는 검사 | `scripts/smoke.sh` |
| **scaffold / generator** | 스캐폴더 / 제너레이터 | 새 저장소를 세우는 도구 / 도메인·화면의 뼈대를 찍어내는 도구 | `make create · make gen` |
| **RSC (React Server Component)** | 서버 컴포넌트 | 서버에서 렌더되어 내려오는 컴포넌트. 첫 값을 props로 확정해 준다 | `frontend/app/page.tsx` |
| **proxy / tunnel** | 프록시 / 터널 | frontend가 /api/*를 backend로 넘기고, /ws 업그레이드를 그대로 이어 준다 | `app/api/[...path]/route.ts · server.mjs` |
| **cursor pagination** | 커서 페이지네이션 | 페이지 번호 대신 '다음 시작 위치'를 주고받는 목록 조회 | `ListExercises` |
| **closure** | 폐포 | 어떤 코드가 실제로 필요로 하는 의존의 전체 집합 | `scripts/runtime-deps.mjs` |
