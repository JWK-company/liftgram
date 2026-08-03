# frontend/ — 화면과 입구 (Next 16)

브라우저가 보는 **유일한 주소**. 화면을 그리고, `/api/*`를 [`backend/`](../backend/README.md)로
넘기고, `/ws` 업그레이드를 터널링한다.

```
server.mjs             ⬅ 프로세스 입구. HTTP는 Next에, /ws는 backend로 터널
                          (프레임 종류를 보존한다 — text를 binary로 바꾸면 브라우저에서만 깨진다)
app/
  layout.tsx              앱 셸(헤더·푸터·토스트 루트)
  page.tsx                RSC — 서버에서 backend를 직접 불러 초기값을 확정해 내린다
  error.tsx           오류 경계 (loading.tsx는 라우트별로 — 루트에 두면 하위가 404를 못 낸다)
  api/[...path]/route.ts  ⬅ 프록시. 헤더 함정이 모여 있는 곳(아래)
  components/
    CounterClient.tsx     채널 3종(unary · 스트리밍 · WS) 전환 데모
    States.tsx            로딩·빈·오류 3종 표준 표시
    Toast.tsx             알림
lib/
  api.ts                  backend 주소를 아는 유일한 곳
  env.ts                  화면·프록시가 읽는 설정(하나뿐)
e2e/                      브라우저 시나리오(Playwright)
```

## 프록시에서 실제로 겪은 함정 두 개

`app/api/[...path]/route.ts`에 주석과 함께 남아 있다.

1. **`cache-control`을 안 붙이면 스트리밍이 버퍼링된다** → 없을 때 `no-transform`을 넣는다.
2. **`content-encoding`·`content-length`를 그대로 넘기면 브라우저가 깨진다** — 본문은 이미
   해제됐는데 "gzip"이라고 말하는 셈이다. curl은 멀쩡하고 **브라우저만** 실패해서 e2e가 잡았다.

## 자주 하는 일

| 하려는 일 | 여기부터 |
|-----------|---------|
| 새 화면 | `make gen-page NAME=posts` → [`app/`](app) |
| 초기 데이터 방식 | [`app/page.tsx`](app/page.tsx) (RSC가 서버에서 직접 호출) |
| 실시간 채널 붙이기 | [`app/components/CounterClient.tsx`](app/components/CounterClient.tsx) |
| 프록시·헤더 | [`app/api/[...path]/route.ts`](app/api/%5B...path%5D/route.ts) |
| WS 터널·헬스 | [`server.mjs`](server.mjs) — `/healthz`는 **자기 자신**, `/api/healthz`는 건너편 |
| 설정 추가 | [`lib/env.ts`](lib/env.ts) + `../.env.example` |

## 실행

```bash
make dev-frontend   # 화면만 (backend가 떠 있어야 한다)
make e2e            # 브라우저 시나리오
```
