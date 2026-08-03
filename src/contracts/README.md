# contracts/ — 계약의 TypeScript 면

`@app/contracts` 워크스페이스. **알맹이는 사람이 쓰지 않는다** — `gen/`은
[`proto/`](../proto/README.md)에서 `make proto`가 만든다.

```
gen/              생성물. 직접 고치지 않는다(고쳐도 다음 make proto에 사라진다)
src/index.ts      생성물 재수출 + 양쪽이 공유하는 경로 상수(routes)
```

## 손으로 쓰는 것은 `src/index.ts` 하나

- 생성된 메시지·service descriptor를 화면이 쓰기 좋게 다시 내보낸다.
- **경로 상수**(`routes`)를 얹는다 — 브라우저는 `/api` 접두사를 지나 backend에 닿고,
  RSC는 프록시를 건너뛰고 직접 부른다. 그 차이가 여기 한 곳에 적혀 있다.

## 빌드하지 않는다

Next가 워크스페이스 TS를 그대로 트랜스파일한다(`transpilePackages`). 그래서
"계약을 먼저 빌드해야 한다"는 순서 의존이 없다. `dist/`가 생기면 옛 계약이 조용히
살아남으므로 `.gitignore`가 막고 있다.

## 화면에서 쓰는 법

```ts
import { ExerciseService, routes } from "@app/contracts";
const api = createClient(ExerciseService, createConnectTransport({ baseUrl: routes.apiPrefix }));
```

계약을 바꾸려면 [`proto/exercise/v1/exercise.proto`](../proto/exercise/v1/exercise.proto)를 고치고 `make proto`.
