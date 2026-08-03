# database/ — 사람이 쓰는 SQL

스키마와 쿼리가 여기 모여 있다. **생성된 Go 코드는 여기 없다** — Go 모듈 안에 있어야 컴파일되므로
[`backend/internal/db/sqlcgen/`](../backend/internal/db/sqlcgen)에 나간다(직접 고치지 않는다).

```
migrations/          schema의 source of truth — 번호순으로 한 번씩 적용된다
  0000_init.sql
  0001_extensions_and_seed.sql
queries/             손으로 쓰는 쿼리 — sqlc가 이걸 읽어 type-safe한 Go를 만든다
  exercise.sql
sqlc.yaml            생성 설정(경로는 이 파일 기준으로 풀린다)
```

## 왜 이 배치인가

- **마이그레이션이 곧 스키마의 single source of truth**이다. sqlc도 `migrations/`를 읽는다
  (`sqlc.yaml`의 `schema: migrations`) — 별도 `schema.sql`을 두어 둘이 어긋나는 일이 구조적으로 없다.
- 마이그레이션 러너는 [`backend/cmd/migrate`](../backend/cmd/migrate)의 바이너리다. **api 이미지의
  두 번째 바이너리**라서 스키마와 코드가 함께 배포된다.
- 한 파일 = 한 트랜잭션. 이미 적용된 파일은 **고치지 않고** 새 파일을 만든다.

## 테이블을 추가하는 순서

```bash
make gen-migration NAME=create_orders   # database/migrations/000N_create_orders.sql 생성
$EDITOR database/migrations/000N_*.sql  # CREATE TABLE IF NOT EXISTS …
$EDITOR database/queries/order.sql      # -- name: GetOrder :one …
make sqlc                                # → backend/internal/db/sqlcgen 갱신
make migrate                             # 적용 (몇 번 돌려도 결과 동일(idempotent))
make migrate-check                       # 2회차가 skip인지 확인
```

`make sqlc`를 건너뛰면 `repo.go`가 없는 함수를 부르게 되어 **빌드가 깨져서 알려 준다**.

## 확인

```bash
make db-status     # 적용된 마이그레이션 · 테이블 목록
make db-shell      # psql 접속
```

관련: [`backend/internal/exercise/repo.go`](../backend/internal/exercise/repo.go)(생성물 → 도메인 변환) ·
[`../CLAUDE.md`](../CLAUDE.md)(전체 흐름)
