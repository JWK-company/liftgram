# scripts/ — 검증·생성 도구

전부 셸/노드다(플랫폼 중립 — 러너를 가리지 않는다). 사람이 직접 부르는 것은 대부분
[`Makefile`](../Makefile) 타깃 뒤에 있다.

## 만들어 주는 것

| 스크립트 | make | 하는 일 |
|---------|------|--------|
| [`create-app.mjs`](create-app.mjs) | `make create NAME=x [BARE=1]` | 새 저장소를 세운다 — 이름 치환 · **빈 포트 자동 선택**(짝까지) · `.env` · git 초기화 |
| [`gen-module.mjs`](gen-module.mjs) | `make gen NAME=order` | 도메인 하나(proto · 마이그레이션 · 쿼리 · service · test · repo · handler · 조립 한 줄) |
| [`gen-page.mjs`](gen-page.mjs) | `make gen-page NAME=posts` | 앱 셸 convention을 지킨 화면(RSC · loading · error · Client) |

## 검사하는 것 (CI가 이 순서로 돈다 — [`ci.sh`](ci.sh))

| 스크립트 | 무엇을 확인하나 |
|---------|----------------|
| [`check-docs.mjs`](check-docs.mjs) | **문서 drift** — 설정 키·make 타깃·스크립트가 문서에 있는가, 설정을 한 곳에서만 읽는가 |
| [`env-check.mjs`](env-check.mjs) | 설정 코드 · `.env` · `.env.example` 세 곳의 대조 + 포트 짝 |
| [`check-firstrun.sh`](check-firstrun.sh) | **처음 받는 사람**이 README대로 해서 실제로 도는가 |
| [`check-scaffold.sh`](check-scaffold.sh) | 스캐폴더가 만든 저장소가 검증·빌드를 통과하는가(기본·BARE 2변형) |
| [`check-generator.sh`](check-generator.sh) | 제너레이터 산출물이 타입·테스트를 통과하는가 |
| [`check-contract.sh`](check-contract.sh) | 두 이미지가 runtime contract을 지키는가(non-root · 포트 · entry point · 설정 누락 시 부팅 실패) |
| [`smoke.sh`](smoke.sh) | 뜬 서버에 12종 — 헬스 4 · unary · idempotency · 목록 · **검증 거절** · 스트리밍 · WS |
| [`check-stream.mjs`](check-stream.mjs) · [`check-ws.mjs`](check-ws.mjs) | 스냅샷→델타가 실제로 오는가(채널별) |
| [`check-ratelimit.mjs`](check-ratelimit.mjs) | rate limit이 정말 막는가 · 인스턴스를 늘리면 합산되는가 |
| [`check-concurrency.mjs`](check-concurrency.mjs) · [`check-cross.mjs`](check-cross.mjs) · [`check-shutdown.mjs`](check-shutdown.mjs) | 동시 요청 · 인스턴스 간 propagation · 종료 시 연결 정리 |
| [`runtime-deps.mjs`](runtime-deps.mjs) | 커스텀 서버가 쓰는 런타임 의존의 closure(이미지에 무엇을 실어야 하는가) |

## 전부 한 번에

```bash
make verify    # 빠른 것(lint · 타입 · 테스트 · 문서)
make ci        # 9단계 전량 — 이미지 빌드 · 스캐폴더 · 제너레이터 · smoke test · e2e · 제한
```

새 검사를 추가하면 [`ci.sh`](ci.sh)에 단계를 넣고, 사람이 직접 부를 것이면
[`Makefile`](../Makefile)에 타깃 + `##` 설명을 단다 — `check-docs.mjs`가 문서화 여부를 검사한다.
