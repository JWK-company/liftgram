# backend/ — Go API (Connect RPC)

도메인 규칙·데이터 접근·실시간의 **종단**. 브라우저는 이곳을 직접 보지 않는다
([`frontend/`](../frontend/README.md)의 프록시를 지나 들어온다).

```
cmd/
  server/main.go     ⬅ composition root — 여기 한 곳에서 모든 것이 연결된다
  migrate/main.go       마이그레이션 러너(one-shot · 같은 소스의 두 번째 바이너리)
internal/
  <도메인>/            ⬅ 기능 하나가 파일 다섯 개
    service.go          규칙만. connect·proto·pgx를 import하지 않는다
    service_test.go     가짜 저장소로 규칙만 검증(DB·서버 없이 2ms)
    repo.go             sqlc 생성물 → 도메인 타입 변환(SQL은 database/가 소유)
    handler.go          Connect — unary + 서버 스트리밍
    ws.go               raw WebSocket — 양방향(같은 service를 부른다)
  config/             설정을 읽는 **유일한** 곳. 누락이면 부팅 실패
  db/                 연결 풀 · 마이그레이션 실행 · sqlcgen(생성물)
  errs/               도메인 오류 타입(프로토콜을 모른다)
  middleware/         요청 로그 · rate limit · 오류 매핑
  idempotency/        idempotency key 저장(memory | redis)
  realtime/           propagation bus — **이름만** 발행한다
gen/                  proto 생성물 (직접 고치지 않는다 · make proto)
```

## 규칙 (이게 이 구조의 전부다)

1. **`service.go`는 프로토콜을 모른다** — connect·proto·pgx를 import하지 않는다.
   그래서 테스트가 DB도 서버도 없이 2ms에 끝난다.
2. **`repo.go`만 생성된 SQL을 안다** — 쿼리 자체는 [`database/queries/`](../database/queries)에 있다.
3. **propagation은 커밋 뒤에, 이름만** — 수신자가 최신값을 다시 읽으므로 순서 문제가 없다.
4. **설정은 [`internal/config/config.go`](internal/config/config.go) 한 곳** — `os.Getenv`를 다른 데서 부르지 않는다.

## 자주 하는 일

| 하려는 일 | 여기부터 |
|-----------|---------|
| 새 도메인 | `make gen NAME=order` → 생성된 다섯 파일을 채운다 |
| 규칙 변경 | [`internal/exercise/service.go`](internal/exercise/service.go) + `service_test.go` |
| 엔드포인트 추가 | [`../proto/`](../proto/README.md) 먼저 → `make proto` → `handler.go` |
| 오류 코드 매핑 | [`internal/middleware/errors.go`](internal/middleware/errors.go) |
| 부팅 순서·인터셉터 | [`cmd/server/main.go`](cmd/server/main.go) — 로그 → 제한 → 검증 → 오류변환 |
| 설정 추가 | [`internal/config/config.go`](internal/config/config.go) + `../.env.example` |

## 실행

```bash
make dev-backend    # 이 단위만 개발 서버로
cd backend && go test ./...
make go-vet         # 빌드 + vet
```
