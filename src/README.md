# liftgram

liftgram의 웹 스택(`src/`). 사내 표준 템플릿 tarae-web-stack에서 이식했고, **레퍼런스 도메인은 운동 카탈로그**다 —
336종을 unary · 서버 스트리밍 · WebSocket 세 방식으로 다룬다.
새 도메인은 `make gen`이 같은 경계로 찍어 준다 — 구조·convention·검증이 그대로 따라온다.

실행 단위(service)는 **둘**이다(ADR-010 · ADR-011). 브라우저는 `frontend`만 보고, `frontend`는 `backend`에 넘긴다:

```
브라우저 ──▶ frontend (Next 16 · :3000)     화면 + /api/* 프록시 + /ws 터널
                │
                ▼
             backend (Go · Connect RPC · :3001, 내부 전용)   도메인 규칙 · DB · 실시간의 종단 ──▶ db · broker
```

**contract는 proto 한 장이 single source of truth다.** `buf`가 거기서 Go 서버 코드와 TypeScript 클라이언트를
**동시에** 생성하므로, backend가 필드를 바꾸면 frontend의 타입 검사가 깨진다 — 런타임까지 미뤄지지 않는다.

backend를 밖에 열지 않은 것은 설계다 — CORS·인증 경계가 frontend 한 곳으로 모이고, 백엔드는 내부 네트워크에만 있다.

> **문서 두 개를 브라우저로 열면 된다.**
> · [`docs/source-handbook.html`](docs/source-handbook.html) — **소스 트리를 따라가며 읽는 설명서**(파일별 코드 발췌 + 주문 관리 예제로 첫 기능까지)
> · [`docs/development-guide.html`](docs/development-guide.html) — 시작하기 · make 명령 지도 · 확장 레시피 · 환경변수 표

## 필요한 것

| 도구 | 왜 |
|------|-----|
| **Docker** | db(PostgreSQL)·broker(Redis)·프로덕션 이미지 |
| **Bun** | 화면(frontend)의 의존 설치·빌드 |
| **Go 1.26+** | 백엔드(backend) — `asdf install golang 1.26.5` 또는 [go.dev/dl](https://go.dev/dl/) |
| buf *(선택)* | **계약(proto)을 고칠 때만.** 생성물은 커밋돼 있어 받자마자 빌드된다 |

```bash
make doctor      # 네 가지가 다 있는지 확인 — 없으면 설치 방법을 알려준다
```

## 5분 퀵스타트

**새 프로젝트를 시작한다면** — 스캐폴더가 이름·포트·설정·git까지 채워 준다.

```bash
make create NAME=my-app          # 옆 디렉터리에 새 저장소 (BARE=1이면 레퍼런스 도메인 없이)
cd ../my-app
make bootstrap                    # 의존 설치 → db·broker 기동 → 마이그레이션
make dev                          # 스캐폴더가 고른 포트로 (기본 http://localhost:3000)
```

**이 템플릿 자체를 손보려면** — 그냥 복제해서 쓴다.

```bash
git clone <this> my-app && cd my-app
make bootstrap     # .env 생성 → 의존 설치 → db·broker 기동 → 마이그레이션
make dev           # http://localhost:3000
```

전부 컨테이너로 띄우고 내리는 건 각각 한 줄이다:

```bash
make up-all        # 이미지 빌드 → db·broker·migrate(one-shot)·frontend 기동 → 헬스 대기 → smoke test
make status        # 지금 뭐가 떠 있나 (컨테이너·포트·헬스)
make down-all      # 전부 내린다 (스택 · 개발 인프라 · 추가 인스턴스 · 남은 프로세스)
make nuke          # 데이터 볼륨까지 삭제
```

## 파트별 실행 — `make`

파트는 넷으로 나뉘고 각각 독립적으로 올리고 내린다. `make` 만 치면 전체 목록이 나온다.

| 파트 | 명령 | 하는 일 |
|------|------|---------|
| **한 번에** | `make up-all` / `make down-all` / `make restart-all` / `make status` / `make nuke` | 전부 올리고 내린다 (`make all` = `up-all`) |
| | `make bootstrap` / `make clean` | 처음 클론했을 때 / 빌드 산출물 삭제 |
| 0 전제조건 | `make doctor` | docker·bun·go·buf가 있는지 확인(없으면 설치 방법 안내) |
| 1 인프라 | `make infra-up` / `make infra-down` / `make infra-reset` | db(PG18+pgvector)·broker(Redis)만 기동·종료·초기화 |
| 1.5 환경변수 | `make env-init` / `make env-check` / `make env-diff` / `make env-print` | .env 생성 · 스키마 대조 검증 · 키 차이 · 현재 적용값 |
| | `make db-shell` / `make redis-cli` / `make infra-logs` / `make infra-ps` | 접속 · 로그 · 상태 |
| 2 계약·데이터 | `make proto` | **proto → Go + TypeScript 동시 생성**(contract가 source of truth) |
| | `make sqlc` | SQL 쿼리 → type-safe한 Go(호스트 설치 불필요 — `go run`) |
| | `make gen-migration NAME=…` → `make migrate` | 새 SQL 파일 → 적용(one-shot·idempotency) |
| | `make migrate-check` / `make db-status` | idempotency 확인(두 번 실행) · 적용 이력 조회 |
| | `make gen-exercise-seed` | **운동 카탈로그 시드 SQL 재생성** — 원본은 `app/`의 TypeScript 시드다(이행 기간 한정). 시드가 줄거나 키가 겹치면 파일을 쓰지 않고 죽는다 |
| 2.6 계층 이전 | `make sync-core` / `make core-check` | **도메인·정적데이터·문자열을 `app/`에서 `core/`로 이전**(ADR-032 — 재작성이 아니라 복사) · 어긋나면 `make verify`가 실패한다 |
| 2.4 새 프로젝트 | `make create NAME=my-app [DIR=…] [BARE=1]` | **이 템플릿에서 새 저장소를 만든다** — 이름 치환·포트 자동 선택·`.env`·git 초기화까지 (`bun run create:app`도 같음) |
| 2.5 생성 | `make gen-page NAME=posts [MODULE=post]` | **새 화면 생성** — RSC·loading·error·클라이언트 4파일(`bun run gen:page`) |
| | `make gen NAME=order` | **새 도메인 모듈 생성** — 스키마·repository·service·테스트·라우트·조립까지 |
| 3 앱 | `make dev` / `make dev-container` / `make build` / `make start` | `make dev`는 **backend와 frontend를 함께** 띄운다. `make dev-container`는 컨테이너 안에서 핫리로드(오버레이 — base 이미지는 프로덕션 그대로) |
| | `make dev-backend` / `make dev-frontend` | 한쪽만 띄운다 — 백엔드만 만질 때 / 화면만 만질 때(backend는 떠 있어야 한다) |
| | `make install` / `make hooks` | 의존 설치(+ **lefthook** git 훅) · `make hooks`로 훅만 재설치 |
| 4 검증 | `make verify` (= `make lint` + `make typecheck` + `make test` + `make core-check` + `make docs-check`) | 커밋 전에 도는 것 |
| | `make test` (= Go 테스트 + `bun run test:core`) | `test:core`는 **이관해 온 도메인 단위테스트 154건**(core/src/domain/__tests__) — 규칙이 app과 같은지 기계가 증명한다 |
| | `make go-vet` / `make proto-check` | Go 빌드·vet / **계약 생성물이 proto와 일치하는가**(커밋 누락 탐지) |
| | `make docs-check` | **문서 drift 검사** — 설정 키·make 타깃·스크립트가 문서에 있는지 |
| | `make ratelimit-check` | rate limit이 실제로 막는지(429·Retry-After·합산 한도) |
| | `make smoke` / `make contract` / `make ci` | 10종 smoke test · **두 이미지(frontend·backend)** runtime contract · CI 전 과정 |
| | `make e2e` / `make e2e-install` | **브라우저 e2e 94종**(역할·제휴 설정이 필요한 2종은 `MOD_EMAIL`·`GEAR_ON` 없으면 건너뜀) — 화면·채널 전환·토스트·두 탭·두 인스턴스 간 propagation (`e2e-install`은 브라우저 최초 설치) |
| 5 컨테이너 | `make image` / `make up` / `make down` / `make restart` / `make ps` | 전부 이미지로 (`make restart`는 backend·frontend만 — 인프라는 그대로) |
| | `make logs` / `make logs-backend` / `make logs-frontend` | 두 로그를 함께 보거나 따로 본다(같은 요청이 `x-request-id`로 이어진다) |
| | `make backend-shell PATH_=/api/meta` | **호스트에 열려 있지 않은** backend를 같은 네트워크에서 직접 두드려 본다 |
| | `make image-free` | **무료 호스트용 합본 이미지**(화면+API 한 컨테이너) — 무료 티어는 상시 프로세스를 하나만 준다. 절차는 `deploy/README.md` |
| | `make scale-2` / `make unscale` | 두 번째 인스턴스(**backend+frontend 한 벌**, :3002)로 broker propagation를 눈으로 확인 |

**앱은 마이그레이션을 스스로 돌리지 않는다.** 순서는 언제나 인프라 → 마이그레이션 → 앱이다.
컨테이너에서는 `migrate` 서비스가 one-shot으로 돌고 끝난 뒤에 `frontend`가 뜬다(compose의 `service_completed_successfully`).

## 확정 스택

| 층 | 선택 | 이유 |
|----|------|------|
| 런타임 | **Node 24 LTS** (툴체인은 Bun) | 실행은 검증된 LTS, 개발 속도는 Bun (ADR-001) |
| 화면 | **Next 16** + 커스텀 서버 | RSC·앱 셸. 커스텀 서버는 `/ws` 업그레이드를 받기 위해서다 (ADR-002) |
| 백엔드 | **Go 1.26 + Connect RPC** | gRPC 호환이면서 브라우저가 평범한 HTTP POST+JSON으로 부른다. 정적 바이너리라 런타임 의존이 없다 (ADR-011) |
| 계약 | **Protocol Buffers + buf** | proto 한 장 → Go·TS 동시 생성. 검증 규칙(protovalidate)도 계약에 선언한다 |
| 데이터 접근 | **pgx + sqlc** | 쿼리는 `.sql`에 쓰고 type-safe한 Go를 생성한다 — "repository는 SQL만"이 코드생성으로 강제된다 |
| 스타일 | **Tailwind v4** (`@theme` 토큰) | 색·간격을 토큰 한 곳에서 (SRS-007) |
| DB | **PostgreSQL 18 + pgvector** | 임베딩까지 한 DB에서 (ADR-004) |
| propagation | **Redis** (인메모리 폴백) | 인스턴스가 늘어도 같은 코드 (ADR-003) |
| 언어 | **Go**(백엔드) · **TypeScript 5.9**(화면) | TS 7.x는 Next 16과 호환되지 않는다 (아래 참고) |

## 세 채널을 언제 쓰는가

| 채널 | 방향 | 이 템플릿에서의 위치 | 쓸 때 |
|------|------|--------------------|-------|
| unary | 요청→응답 | backend `internal/exercise/handler.go` | 쓰기, 조회, idempotency가 필요한 것 |
| 서버 스트리밍 | 서버→클라 | 같은 파일의 `WatchCatalog` | 알림·진행률·읽기 전용 실시간. **타입이 있다**(브라우저는 `for await`) |
| WebSocket | 양방향 | backend `internal/exercise/ws.go` | 커서·협업·저지연 양방향 |

Connect의 **양방향 스트리밍은 HTTP/2가 필요**해 브라우저에서 쓸 수 없다 — 그래서 양방향만 raw WebSocket이다.

브라우저에서 보이는 주소는 셋 다 web이다 — `/api/*`는 프록시가, `/ws`는 커스텀 서버의 터널이 api로 넘긴다.

셋 다 **스냅샷 먼저, 그다음 델타**로 통일돼 있다. 클라이언트는 첫 메시지로 전체 상태를 받고 이후엔 변화만 받는다.

## 소스 트리 — 무엇이 어디에 있고, 왜 거기에 있나

> 디렉터리마다 README가 있다. 클릭해서 바로 내려갈 수 있다 —
> [proto](proto/README.md) · [backend](backend/README.md) · [database](database/README.md) ·
> [frontend](frontend/README.md) · [contracts](contracts/README.md) · [scripts](scripts/README.md).
> Claude Code로 작업한다면 [`CLAUDE.md`](CLAUDE.md)가 색인 역할을 한다.

```
liftgram/
├─ CLAUDE.md                   ⬅ 구조·작업 흐름 색인 (Claude Code가 자동으로 읽는다)
├─ Makefile                    파트별 실행 entry point (make help 로 목록)
├─ compose.yaml                전부 컨테이너 (frontend·backend·db·migrate·broker)
├─ Dockerfile                  한 파일 · 두 이미지(--target frontend / --target backend) · non-root
├─ buf.yaml · buf.gen.yaml     계약 생성 설정 — proto 한 장에서 Go·TS를 동시에 낸다
│
├─ proto/<도메인>/v1/*.proto   ① 계약 — **여기가 single source of truth**(검증 규칙도 여기 선언)
│
├─ frontend/                   ② 화면과 입구 — 브라우저가 보는 유일한 주소(:3000)
│  ├─ server.mjs                 프로세스 입구. HTTP는 Next에, /ws 업그레이드는 backend로 터널링
│  ├─ app/
│  │  ├─ layout.tsx              앱 셸 — 헤더·푸터·토스트/모달 루트
│  │  ├─ page.tsx                RSC — 서버에서 backend를 직접 불러 초기값을 확정해 내려보낸다
│  │  ├─ components/             화면 조각 (States = 로딩·빈·오류 3종 표준)
│  │  └─ api/[...path]/route.ts  ③ 프록시 — /api/* 를 backend로 그대로 넘긴다
│  └─ lib/api.ts · lib/env.ts    backend 주소를 아는 유일한 곳 · 화면 설정
│
├─ backend/                    ④ 도메인 — 밖에서 보이지 않는다(:3001, Go)
│  ├─ cmd/server/main.go         composition root — 인터셉터 체인(로그→제한→검증→오류변환)
│  ├─ cmd/migrate/main.go        one-shot 마이그레이션 러너(같은 소스에서 나온 두 번째 바이너리)
│  ├─ gen/                       proto 생성물(Go) — 커밋한다
│  └─ internal/
│     ├─ config/                 설정을 읽는 유일한 곳. 누락이면 부팅 실패
│     ├─ <도메인>/               ⑤ 도메인 — 이 템플릿의 심장 (exercise가 레퍼런스)
│     │  ├─ service.go             규칙만. connect도 proto도 pgx도 모른다
│     │  ├─ service_test.go        가짜 저장소 주입 — DB·서버 없이 도는 테스트
│     │  ├─ repo.go                sqlc 생성물 → 도메인 타입 변환
│     │  ├─ handler.go             Connect 핸들러(unary + 서버 스트리밍)
│     │  └─ ws.go                  WebSocket(양방향이 필요한 도메인만)
│     ├─ db/                      연결 풀 · 마이그레이션 실행 · sqlcgen(생성물)
│     ├─ realtime/bus.go          ⑥ propagation 추상화 — publish/subscribe
│     ├─ errs · idempotency       공통 convention(도메인 밖에 산다)
│     └─ middleware/              request-id · rate limit · 오류 매핑
│
├─ database/                   ⑦ 사람이 쓰는 SQL — 스키마와 쿼리가 한곳에
│  ├─ migrations/*.sql           schema의 source of truth · **sqlc도 이걸 읽는다**(정의가 두 곳에 안 생긴다)
│  ├─ queries/*.sql              쿼리는 여기만 → sqlc가 type-safe한 Go 생성
│  └─ sqlc.yaml                  생성 설정
│
├─ contracts/                  ⑧ 계약의 TypeScript 면 — gen/ 은 생성물, src/ 는 재노출 + 경로 상수
├─ scripts/                    smoke test · CI · runtime contract 검증 (전부 셸/노드 — 플랫폼 중립)
└─ docs/                       설명서 2종(HTML) — 소스 핸드북 · 개발 가이드
```

### 이 경계를 고른 이유

**의존은 한 방향으로만 흐른다.** `frontend → handler → service → repo → database`.
반대 방향 화살표가 하나도 없어서 안쪽을 바꿔도 바깥이 안 깨지고, 안쪽은 바깥 없이 테스트된다.

| 층 | 아는 것 | 모르는 것 | 그래서 얻는 것 |
|----|--------|----------|--------------|
| `frontend` | HTTP·React·Next | 규칙·SQL·DB | 화면 프레임워크를 바꿔도 도메인은 그대로다 |
| `handler.go`·`ws.go` | Connect·WebSocket | 규칙·SQL | 전송 방식이 늘어도 규칙은 한 벌이다 |
| `service.go` | 규칙 | Connect·proto·SQL·propagation 구현 | RPC·WS·배치가 같은 함수를 부른다. 테스트가 **2ms** |
| `repo.go` + `database/queries/*.sql` | SQL | 규칙 | 쿼리는 `.sql`에만 — 규칙이 스며들 자리가 없다(sqlc 생성) |
| `bus.go` | propagation | 도메인 | 인메모리↔Redis 교체에 도메인 코드가 0줄 바뀐다 |
| `proto/` | 요청·응답의 모양 + 검증 규칙 | 규칙·구현 | frontend와 backend가 어긋나면 **타입 검사**에서 걸린다 |

**세 채널이 하나의 convention을 공유한다** — 스냅샷 먼저, 그다음 델타. propagation에는 값이 아니라 **이름만** 싣고
받는 쪽이 최신값을 다시 읽는다. 그래서 메시지가 뒤바뀌거나 유실돼도 화면에 낡은 값이 남지 않고,
브로커에 영속성이 필요 없다.

**서버 상태를 전역 스토어에 넣지 않는다.** 첫 값은 RSC가 props로 주고, 이후 변화는 구독으로 온다.
"언제 무효화하나"라는 문제 자체를 만들지 않는 선택이다.

각 파일 머리에 **책임 · 지킬 것 · 확장하는 법**이 주석으로 적혀 있다. 새 작업을 시작하기 전에
그 파일의 머리 주석을 먼저 읽으면 패턴에서 벗어나지 않는다.

## 레퍼런스 도메인을 걷어내고 내 도메인 넣기

```bash
make gen NAME=order SRS=SRS-014   # 계약(proto)·SQL·Go 모듈·마이그레이션·조립을 한 번에
# → proto/order/v1/order.proto 와 migrations/NNNN_create_orders.sql 을 도메인에 맞게 고치고
make proto && make sqlc && make migrate   # 계약 생성 → type-safe한 쿼리 → 테이블 반영
make gen-page NAME=orders MODULE=orders   # 필요하면 화면까지(frontend)
make verify                        # lint·타입·테스트·문서
```

`SRS=`는 이 모듈이 구현하는 요구 번호다. 생략하면 파일에 `@plm <SRS-코드>` placeholder가 남고
**`make verify`가 그것을 잡아 실패한다** — 추적되지 않는 코드가 조용히 늘어나는 것을 막기 위해서다.

제너레이터가 만드는 것은 **운동 카탈로그 모듈과 같은 경계**를 따른다(CI가 매번 생성해 빌드·테스트로 확인한다).
손으로 할 때의 순서도 같다: 계약(proto) → 마이그레이션 → 쿼리(.sql) → service(규칙만) → 테스트 →
repo(변환) → handler(Connect) → `cmd/server/main.go`에 네 줄.
실시간이 필요하면 `bus.Publish(ctx, name)` 한 줄이면 된다 — 채널 3종은 그대로 붙는다.

세부 절차(무엇을 어느 순서로 고치는가)는 각 파일 머리 주석의 "…추가하는 법"에 있다:
새 모듈 → `backend/cmd/server/main.go` · 새 동작 → `backend/internal/exercise/service.go` ·
새 채널/새 버튼 → `frontend/app/components/CatalogClient.tsx` · 새 버스 → `backend/internal/realtime/bus.go` ·
새 설정 → `backend/internal/config/config.go`(백엔드) 또는 `frontend/lib/env.ts`(화면) · 새 계약 → `proto/`.

## 컨테이너 runtime contract

이 템플릿의 산출 경계는 **이미지 + 아래 runtime contract**까지다. 인프라(k8s·CI 플랫폼)는 프로젝트마다 따로 관리한다.

| 항목 | 약속 |
|------|------|
| 실행 사용자 | non-root (두 이미지 모두) |
| 포트 | frontend 3000 (HTTP + WS 동일 포트) · backend 3001 (**호스트에 노출하지 않는다**) |
| 설정 | 환경변수만 — 누락 시 **부팅 실패**하고 누락 항목을 알린다 |
| 상태 | 로컬 디스크에 쓰지 않는다(스케일 아웃 가능) |
| 마이그레이션 | 앱 부팅과 분리된 one-shot 실행 (backend 이미지의 두 번째 바이너리 `/app/migrate`) |
| 헬스 | frontend `/healthz`·`/readyz`(자기 자신 · readyz는 backend 도달성 포함) · backend `/api/healthz`·`/api/readyz`(DB 연결) |
| 종료 | SIGTERM → 실시간 연결을 1001로 닫고 정해진 시간 안에 종료 |

**헬스 경로가 둘인 이유**: `/api/*`는 프록시라 `/api/healthz`는 api의 상태를 답한다. 그것을 web의 헬스체크로 쓰면
backend가 아플 때 오케스트레이터가 멀쩡한 frontend를 재시작한다 — 장애가 옆으로 번진다. 그래서 frontend는 자기 경로를 따로 가진다.

`make contract`로 **두 이미지**가 이 약속을 지키는지 검사한다.
backend 이미지는 **정적 바이너리 하나**라 런타임 의존이 없다(62MB) — 헬스체크도 `server -healthcheck`로 자기 자신이 한다.

## API 입력 convention

입력 규격은 **`.proto`에 선언**한다(protovalidate). 서버는 인터셉터가 자동으로 적용하므로
핸들러에 검증 코드가 한 줄도 없고, 화면은 같은 계약에서 생성된 타입을 쓴다.

| 대상 | 규칙 | 어길 때 |
|------|------|--------|
| 리소스 이름(`:name`) | 1~64자 · 영문/숫자/`-`/`_`/`.` (앞뒤 공백 제거) | 400 problem+json |
| `limit` | 1~50 정수(기본 20) | 400 — **조용히 고치지 않는다** |
| `cursor` | 이름과 같은 규칙 | 400 |
| 요청 본문 | 없거나 빈 문자열이면 기본값, **깨진 JSON은 거절** | 400 |

이름을 좁게 잡은 이유: 이름은 URL과 propagation 메시지에 그대로 실린다. 공백·슬래시·제어문자가 섞이면 로그·라우팅·구독 키에서 사고가 난다.
한글 등으로 넓혀야 하면 `.proto`의 `pattern` 한 곳만 고치고 `make proto` 하면 frontend·backend가 함께 따라온다.

모든 응답에는 `x-request-id`가 실리고, **frontend와 backend 두 로그에서 같은 값**으로 한 요청을 따라갈 수 있다(frontend가 붙이고 backend가 이어받는다).
rate limit도 backend에서 건다 — frontend가 `x-forwarded-for`로 클라이언트 주소를 넘겨 주므로 프록시 뒤에서도 사람별로 센다.

## 환경변수

값을 읽는 곳은 각 단위에 **하나씩**이다 — `backend/internal/config/config.go`(백엔드) · `frontend/lib/env.ts`(화면).
언어가 달라도 규칙은 같고, `make docs-check`가 **Go 파일까지 검사해** 그 규칙을 지킨다.
코드 어디서도 `process.env`를 직접 읽지 않는다(`make docs-check`가 이 규칙을 기계로 지킨다).
우선순위는 **실제 환경변수 > `.env` 파일 > 스키마 기본값**이며, 컨테이너에는 `.env`가 없고 환경변수만 들어온다.

| 키 | 필수 | 기본값 | 컨테이너에서 |
|----|------|--------|-------------|
| `DATABASE_URL` | **필수** | — | `postgres://app:app@db:5432/app` |
| `JWT_SECRET` | **필수**(api 서버) | — | access 토큰 서명 키. **32자 이상.** 없으면 서버가 뜨지 않는다(마이그레이션 러너는 필요 없다). 배포에서는 호스트가 생성한 랜덤 값을 쓴다 |
| `REALTIME_BUS` | 선택 | `memory` | `redis` |
| `IDEMPOTENCY_STORE` | 선택 | `REALTIME_BUS`를 따름 | `redis` — **인스턴스가 둘 이상이면 반드시 redis**(메모리면 재시도가 두 번 반영될 수 있다) |
| `REDIS_URL` | 선택 | `redis://localhost:6379` | `redis://broker:6379` |
| `PORT` | 선택 | `3000` | `3000` — frontend가 듣는 포트 |
| `API_PORT` | 선택 | `3001` | `3001` — api가 듣는 포트(**호스트에 노출하지 않는다**) |
| `API_URL` | 선택 | `http://127.0.0.1:3001` | `http://api:3001` — web이 api를 찾아가는 주소 |
| `APP_URL` | 선택 | `http://localhost:3000` | **도메인이 생기면 여기만 바꾼다** — 런타임에 절대 URL이 필요한 곳(인증 콜백·이메일 링크·OG 라우트)이 이 값을 읽는다 |
| `SHUTDOWN_TIMEOUT_MS` | 선택 | `10000` | 동일 |
| `MIGRATIONS_DIR` | 선택 | `migrations` | 마이그레이션 SQL 위치 — 실행 위치가 다를 때만 조정한다 |
| `INSTANCE_ID` | 선택 | 호스트명 | 컨테이너 ID |
| `RATE_LIMIT` · `RATE_LIMIT_WINDOW_SEC` | 선택 | `120` · `60` | 창당 허용 횟수(IP별) — **0 이하면 비활성**. 브라우저 e2e를 돌릴 땐 넉넉히 올린다(한 세션이 만드는 요청이 생각보다 많다 — CI는 `RATE_LIMIT=2000`으로 띄우고 제한 검증만 낮은 한도로 따로 한다) |
| `RATE_LIMIT_STORE` | 선택 | `REALTIME_BUS`를 따름 | 인스턴스가 둘 이상이면 `redis`여야 합산된다 |
| `GEAR_AFFILIATE_ENABLED` | 선택 | 비어 있음(꺼짐) | 착용장비 제휴 링크 사용(ADR-027). **`true` 정확 일치일 때만 켜진다** — 미등록 매체 광고 노출은 제재 대상이라 오타로 켜지면 안 된다. 파트너스 승인 전에는 켜지 않는다 |
| `GEAR_AFFILIATE_LINKS` | 선택 | 비어 있음 | 카테고리→딥링크 JSON. **사람이 파트너스 생성기로 미리 만든 링크만** 넣는다(서버는 조립하지 않는다). 8종 밖의 키는 버려지고, 깨진 JSON은 조용히 "링크 없음"으로 수렴한다(검색 폴백) |
| `STORAGE_PROVIDER` | 선택 | `disk` | 올라온 사진을 어디에 두는가 — `disk` 또는 `s3`. **그 밖의 값이면 부팅하지 않는다**(오타로 조용히 disk가 되면 사진이 사라지는 걸 모른다) |
| `MEDIA_DIR` | 선택 | 컨테이너 `/app/media` · 로컬 `../.media` | `STORAGE_PROVIDER=disk`일 때 사진이 놓이는 폴더. compose는 볼륨에 둔다 — **무료 호스트의 디스크는 재배포에서 비워진다** |
| `S3_ENDPOINT` · `S3_BUCKET` | s3일 때 필수 | — | R2는 `https://<account_id>.r2.cloudflarestorage.com` · 버킷은 **공개로 열지 않는다**(서버가 `/media/file/<key>`로 대신 서브한다) |
| `S3_REGION` | 선택 | `auto` | R2는 `auto`, AWS S3는 실제 리전 |
| `S3_ACCESS_KEY_ID` · `S3_SECRET_ACCESS_KEY` | s3일 때 필수 | — | 비어 있으면 **부팅이 멈춘다** — 조용히 디스크로 되돌아가지 않는다 |
| `PLM_API_URL` | 선택 | `https://jwk-plm.shoi.ch` | 개발 피드백을 등록하는 아이디어보드 주소(SRS-006). 로컬 e2e는 가짜 보드를 띄워 여기를 돌려놓는다 — 테스트 글이 진짜 보드에 쌓이지 않게 |
| `PLM_API_TOKEN` | 선택 | 비어 있음 | 보드 토큰. **서버에만 둔다**(앱 번들에 들어가면 회수할 수 없다). 비면 개발 피드백 탭만 "지금 안 된다"고 답하고 나머지는 그대로 동작한다 |
| `PLM_PROJECT` | 선택 | `liftgram` | 보드에서 이 앱의 아이디어가 속하는 프로젝트 이름 |
| `NODE_ENV` | 선택 | `development` | 세션 쿠키에 `Secure`를 붙일지 정한다 — **로컬은 http라 붙이면 쿠키가 아예 저장되지 않는다**. 컨테이너 이미지는 `production`으로 뜬다 |
| `POSTGRES_*` · `DB_PORT` · `BROKER_PORT` · `WEB_PORT` | 선택 | app / 5433 / 6380 / 3000 | compose 전용(앱은 읽지 않음) |

직접 부르는 스크립트도 같은 이름으로 있다 — `bun run db:migrate`(= `make migrate`) · `bun run gen:module <이름>`(= `make gen NAME=<이름>`).

```bash
make env-init    # .env가 없으면 .env.example에서 만든다
make env-check   # 스키마·.env·.env.example 세 곳 대조 + 지금 설정으로 실제 검증
make env-diff    # 내 .env와 예시의 키 차이
make env-print   # 지금 적용되는 값 (비밀번호는 가림)
```

**포트를 바꿀 땐 짝을 함께 바꾼다** — `DB_PORT` ↔ `DATABASE_URL`, `BROKER_PORT` ↔ `REDIS_URL`, `API_PORT` ↔ `API_URL`.
하나만 바꾸면 컨테이너는 새 포트로 뜨는데 앱은 옛 포트로 붙어 **다른 DB에 조용히 연결된다**(에러가 아니라 잘못된 성공이라 더 위험하다).
`make env-check`가 이 짝을 검사한다.

설정을 추가할 땐 **세 곳을 함께** 고친다 — 해당 단위의 설정(`backend/internal/config/config.go` 또는
`frontend/lib/env.ts`) · `.env.example` · (필요하면) `compose.yaml`.

`.env`는 **이미지에 들어가지 않는다**(`.dockerignore`+빌드 단계에서 제거). 컨테이너 설정은 오직 실행 시 환경변수로만 들어오고,
빌드는 설정 없이도 된다 — 같은 이미지를 개발·스테이징·운영에 그대로 올릴 수 있어야 하기 때문이다.

## 도메인이 생기면 바꿀 것

지금은 **로컬호스트 전용**이다. 코드 어디에도 도메인을 박지 않았으므로, 도메인을 사면 아래만 손대면 된다.

| # | 무엇을 | 어디서 |
|---|--------|--------|
| 1 | `APP_URL`을 `https://실제도메인`으로 | `.env`(운영 환경변수) — **재빌드 없이** 적용된다 |
| 2 | HTTPS 종료를 앞단(프록시·로드밸런서)에 둔다 | 인프라 — 앱은 평문 3000을 그대로 듣는다(runtime contract) |
| 3 | HSTS 헤더를 켠다 | `next.config.ts`의 headers — **HTTPS로 서비스할 때만** 켤 것 |
| 4 | 쿠키에 `Secure`·`SameSite`를 건다 | 인증 도입(P2) 시점에 함께 — ADR-008 |
| 5 | WebSocket은 자동으로 `wss://`가 된다 | 코드 변경 불필요 — 클라이언트가 `location.protocol`로 판단한다 |
| 6 | CORS가 필요하면 그때 연다 | 지금은 동일 출처만 쓰므로 설정이 없다 |

로컬 개발에서는 아무것도 안 해도 된다 — 기본값이 `http://localhost:3000`이다.

**빌드 산출물에는 도메인이 들어가지 않는다.** 그래서 같은 이미지를 개발·스테이징·운영에 그대로 올린다.
(그 때문에 `metadataBase`를 두지 않았다 — 정적 페이지의 메타데이터는 빌드 시점에 확정되기 때문이다.
OG 이미지가 필요해지면 런타임 라우트로 만들고 거기서 `APP_URL`을 읽는다.)

## 검증

```bash
make verify     # lint + 타입 + 유닛 테스트 (커밋 전)
make smoke      # 헬스 4 + unary 3 + 계약검증·메타·스트림·WS = 8단계 (서버가 떠 있어야 함)
make ci         # 위 전부 + 마이그레이션 + 이미지 빌드 + runtime contract
```

커밋할 때는 **lefthook**이 먼저 본다 — pre-commit에서 스테이지된 파일의 포맷·타입·유닛 테스트,
pre-push에서 타입·테스트. 오래 걸리는 것(이미지·smoke test·e2e)은 CI의 몫이다.
급할 때는 `LEFTHOOK=0 git commit`으로 건너뛸 수 있지만, CI가 같은 것을 다시 본다.

`scripts/ci.sh`는 **플랫폼 중립**이다. GitHub Actions든 GitLab CI든 Jenkins든 이 한 줄을 부르면 된다 —
CI 플랫폼을 템플릿이 정하지 않기로 했기 때문이다(ADR-006).

## 알려진 제약

- **TypeScript는 5.x에 핀**한다. 최신 7.x는 Go 포팅판이라 Next 16이 요구하는 JS 컴파일러 API가 없어 부팅이 실패한다(6은 아직 beta).
- `output: standalone` 빌드에서 Next가 `next start` 관련 경고를 남기지만, entry point은 `server.mjs`이므로 무해하다.
- **Next 파일 트레이싱은 `app/` 코드만 따라간다.** 빌드 밖 entry point(`frontend/server.mjs`)이 쓰는 의존(`ws`·`zod`)은
  standalone에 안 들어가므로 Dockerfile이 명시적으로 복사한다. 의존이 늘면 `node scripts/runtime-deps.mjs`로
  목록을 다시 뽑아 Dockerfile의 COPY와 맞춘다. (api는 워크스페이스 단위 프로덕션 설치를 그대로 싣는다 — 이 문제가 없다.)
- 커스텀 서버는 프로덕션에서 `.next/required-server-files.json`의 설정을 주입해 뜬다 —
  standalone 이미지에는 `next.config`를 읽는 로더가 없기 때문이다(`server.mjs` 상단 주석 참고).
- idempotency key 저장소의 기본값은 **프로세스 메모리**다. 인스턴스가 여럿이면 `IDEMPOTENCY_STORE=redis`로 공유해야
  재시도가 두 번 반영되지 않는다(구현은 `backend/src/lib/idempotency.ts`에 이미 있다).
- **모듈 최상단에서 설정을 읽지 않는다.** `next build`가 라우트 모듈을 불러 분석하고, Nest도 모듈을 먼저 로드하므로,
  최상단에서 `env.*`를 읽으면 빌드가 런타임 설정을 요구하게 된다. db·bus·idempotency 저장소는 전부 첫 사용 시점(Nest는 `useFactory`)에
  만들어진다. (이 규칙을 어기면 `make image`가 즉시 실패해 알려 준다.)
- **PostgreSQL 18부터 데이터 볼륨은 `/var/lib/postgresql`에 건다**(`.../data` 아님).
  옛 경로로 걸면 컨테이너가 `unused mount/volume` 오류로 뜨지 않는다.

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
