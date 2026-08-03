# proto/ — contract source (여기서 시작한다)

`frontend`와 `backend`가 **함께 지키는 약속**. 이 한 장에서 두 벌이 동시에 생성되므로,
한쪽이 필드를 바꾸면 다른 쪽의 타입 검사가 깨진다 — 런타임까지 미뤄지지 않는다.

```
counter/v1/counter.proto     메시지 · RPC · 검증 규칙
        │
        ├──▶ backend/gen/…      Go 타입 + Connect 핸들러/클라이언트
        └──▶ contracts/gen/…    TypeScript 타입 + 브라우저 클라이언트
```

## 이 파일이 정하는 것

| 무엇 | 어떻게 |
|------|--------|
| 요청·응답 모양 | `message` |
| 호출 방식 | `rpc` — unary(요청·응답) · `stream` 응답(구독) |
| **검증 규칙** | `[(buf.validate.field)…]` — 서버가 인터셉터로 자동 적용한다 |
| 이벤트 종류 | `enum`(예: `SNAPSHOT`·`DELTA`·`HEARTBEAT`) — 문자열 convention이 계약으로 승격 |

검증을 손으로 쓴 코드는 없다. `name`에 이상한 값을 넣으면 서버가 `invalid_argument`로 거절하는데,
그 근거는 **이 파일의 선언 한 줄**이다.

## 바꾸는 순서

```bash
$EDITOR proto/counter/v1/counter.proto
make proto        # buf lint → 생성 (backend/gen · contracts/gen 동시)
make verify       # 양쪽 타입 검사
```

생성물은 **커밋한다** — 받는 사람이 buf 없이도 빌드된다. CI의 `make proto-check`가 커밋 누락을 잡는다.

## 규칙

- **필드 번호를 재사용하지 않는다** — `buf breaking`(FILE)이 커밋 전에 잡는다.
- 새 도메인은 `proto/<도메인>/v1/<도메인>.proto` (`make gen NAME=order`이 만들어 준다).
- 채널 선택: 요청·응답 → unary · 구독 → 서버 스트리밍 · 양방향 → WebSocket
  (Connect 양방향 스트리밍은 HTTP/2를 요구해 브라우저에서 쓸 수 없다).

설정: [`../buf.yaml`](../buf.yaml)(lint·breaking) · [`../buf.gen.yaml`](../buf.gen.yaml)(생성 플러그인 — 전부 로컬 실행)
