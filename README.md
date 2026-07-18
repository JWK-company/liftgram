# jwk-platform — 통합 관리 플랫폼 (infra + auth + db + mcp-server + plugin + workflow)

PLM·Ouroboros·Claude 워크플로우를 **6개 도메인 repo + git submodule 우산**으로 통합 관리한다. 셀프호스트 배포(infra: k0s + terraform + cloudflare)부터 로컬 Claude Code 워크플로우(plugin: plan/code/plm-hub)까지 한 트리에서 재현한다.

세 개의 Claude Code 플러그인을 한 로컬 마켓플레이스(`jwk-platform`)로 제공한다.
- **plan** (`plan:<cmd>`): 요구·설계·의사결정·로드맵 등 **기획 산출물** + 요구→설계 **추적성(G1/G2)**.
- **code** (`code:<cmd>`): 5-Tier 복잡도(spec/execute), 전문가 패널 **QA**, 점진 디버깅(fix), 회고·온보딩·메모리 등 **코딩 워크플로우**.
- **plm-hub** (`plm-hub:<cmd>`): **PLM 거버넌스 브리지** — 원격 PLM MCP(14도구, OAuth) 등록 + 기획 `.md`를 PLM에 자동 동기(Edit hook)·게이트(G1~G3) 표면화(Stop hook).

> **거버넌스 백엔드는 PLM-Hub**(라이브: `jwk-plm.shoi.ch`)가 기본. **Notion 동기화는 선택(레거시).**
> 세 플러그인은 `.ouroboros/` 컨텍스트를 공유한다.

## 구조

```
jwk-platform/                       ← 우산 repo (git submodule로 6 도메인 핀)
├─ infra/                           [submodule] 셀프호스트 인프라 — k0s + terraform(3-state) + cloudflare edge
├─ auth/                            [submodule] Keycloak(인증) 구성·realm
├─ db/                              [submodule] PostgreSQL+Hasura · Neo4j · ClickHouse 스택
├─ mcp-server/                      [submodule] PLM-Hub(Rust) · Ouroboros(Rust) MCP 서버 + 대시보드
│  └─ plm-hub/                      DEPLOY.md · mcp-server(crates) · dashboard · db/migrations
├─ plugin/                          [submodule] Claude 플러그인 3종
│  ├─ plan/                         기획 플러그인 (plan:<cmd>) — commands · templates · seed
│  ├─ code/                         코딩 플러그인 (code:<cmd>) — commands · scripts
│  └─ plm-hub/                      PLM 브리지 (plm-hub:<cmd>) + hooks(plm-sync·plm-gate) + HOOKS.md
├─ workflow/                        [submodule] 워크플로우 템플릿 · installer · docs/guide(HTML 설명서)
├─ .ouroboros/                      ← 기획 산출물·컨텍스트·PLM 바인딩 (프로젝트 상태 · 로컬 SSOT)
├─ .claude-plugin/marketplace.json  로컬 마켓플레이스 'jwk-platform' (source → ./plugin/{plan,code,plm-hub}) → make plugin-install
├─ .gitmodules                      6 submodule 핀(상대 URL `../<repo>.git` — clone 프로토콜 상속)
├─ .mcp.json                        커스텀 MCP 2종: ouroboros(메모리/KG) + plm(거버넌스) — 원격 HTTP OAuth
└─ Makefile · CLAUDE.md · README.md · INSTALL.md
```

> **분리 원칙**: 6 도메인 submodule = 재사용 소스(각자 독립 repo·버전), `.ouroboros/` = 이 우산의 기획·거버넌스 상태(로컬 SSOT). 소스와 프로젝트 상태가 섞이지 않는다.
> **체크아웃**: `git clone --recursive <umbrella>` 또는 clone 후 `git submodule update --init --recursive`.

## 빠른 시작 (A — 호스팅 PLM 사용)

1. **`make setup`** — 기본 MCP 플러그인 3종(chrome·context7·serena) + **plan·code·plm-hub 플러그인**(`make plugin-install`) + `.ouroboros` 시드 + Ouroboros `.env` + 가이드 열기를 한 번에.
2. **Claude 재실행 → 프로젝트 신뢰 승인** → `.mcp.json`의 **ouroboros + plm MCP가 OAuth로 인증**(API Key 불필요).
3. **PLM 프로젝트 바인딩**: `plm-hub:link <project-id>` → `.ouroboros/config/plm.json` 생성(`api_url` 기본 `https://jwk-plm.shoi.ch`). hook 푸시용 쓰기 토큰(`PLM_API_TOKEN`)은 link가 **SSO 인증으로 자동 발급·기입**(본인 realm 역할, 없으면 editor).
4. 기획: `plan:plan` → `plan:requirement` → `plan:design` → `plan:decision` → `plan:trace`.
   코딩: `code:spec` → `code:execute` → `code:qa` → (필요시 `code:fix`) → `code:reflect`.
5. 기획 `CODE.json` 편집 시 **Edit hook(plm-sync)** 이 메타+본문(doc)+관계(relations)를 PLM에 즉시 upsert, **Stop hook(plm-gate)** 이 게이트(G1~G3 orphan)를 경고. 대시보드 `https://jwk-plm-dash.shoi.ch`에서 확인.
6. **딥링크 추적**: 구현 코드에 `// @plm SRS-NNN` 역링크 주석을 달고 **`plm-hub:codescan`** 실행 → 요구↔코드 양방향 연결(Code 아티팩트·`loc:path:line`·문서 `code_refs` 역기재). 대시보드 편집분은 **`plm-hub:pull`** 로 로컬에 회수.

## 빠른 시작 (B — 자체 PLM 스택 기동, drop-in)

Docker 필요. 자기 인스턴스를 띄우려면:
```bash
cd mcp-server/plm-hub
make bootstrap P=my-app NAME="My App"   # .env 생성 + docker 스택 기동 + 프로젝트 생성
make urls                                # API:16780 · 대시보드:16700 · Hasura:16781
```
이후 `.ouroboros/config/plm.json`의 `api_url`을 `http://localhost:16780`으로 바꾸면 hook/플러그인이 로컬 PLM을 가리킨다. (OIDC 기본 off → dev 토큰으로 즉시 동작.)

> **레이어 구성**: 커스텀 MCP 2종(ouroboros·plm, `.mcp.json`·OAuth) + 플러그인 3종(slash 커맨드·hook, `make plugin-install`) + 공식 MCP 3종(chrome·context7·serena, `make plugins` 런타임 설치). MCP는 도구만 주므로 커맨드·hook은 플러그인이 담당.
> **Notion(선택/레거시)**: `make notion-plugin` + `make notion` → `plan:notion-setup/push/pull`. PLM과 병행 가능.

## 핵심 개념

- **SSOT 분리**: 본문·관계·ID = 로컬 마크다운 frontmatter(권위) / Status·게이트·대시보드 = PLM(레거시 모드는 Notion).
- **추적 백본**: `UCS→URS`, `SRS→URS`, `SAD→SRS`, `ADR→SRS/SAD`, `Roadmap→URS/SRS` (owner=로컬 작성 측).
- **게이트**: G1(모든 SRS가 URS에 연결)·G2(모든 SAD가 SRS에 연결)·G3(구현 갭/재검토) — 소프트 경고.
- **PLM MCP 14도구**: artifact_issue/get/update/delete/links · relation_link/unlink/rules · search · gates · review_queue · project_create · export · import.
- **딥링크 추적(아티팩트↔실제 문서/코드)**: 문서 위치=결정적 규약 `docs/{type→dir}/{code}.md` · 코드 역링크=소스 `@plm <CODE>` 주석 → `plm-hub:codescan`이 Code 아티팩트(`loc:path:line`)+`realizes` 생성 + 대상 `.md`에 `code_refs` 역기재. 양방향: plm-sync(로컬→PLM)·codescan(코드→PLM)·`plm-hub:pull`(PLM→로컬).

## 보안 & 신뢰

- 인증 분리: **hook = token_hash 토큰**(셸, `.env`의 `PLM_API_TOKEN`), **Claude MCP = OAuth**(Keycloak, 사용자 승인). 모든 hook은 exit 0 graceful.
- 민감 기획은 frontmatter `sync: false`로 본문 반출 제외. `.env`는 절대 커밋 금지(.gitignore 포함).
- 상세 설치·보안 범위는 [INSTALL.md](INSTALL.md), **셀프호스트 배포(k0s + terraform + cloudflare edge)** 는 [infra/README.md](infra/README.md), **Keycloak 인증 구성**은 [auth/README.md](auth/README.md), 서버 소스·dev 기동은 [mcp-server/README.md](mcp-server/README.md), hook 설계는 [plugin/plm-hub/HOOKS.md](plugin/plm-hub/HOOKS.md) 참조.
