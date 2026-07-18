# 설치 & 사용 — jwk-platform (plan + code + plm-hub 플러그인)

> 거버넌스 백엔드는 **PLM**(원격 MCP/REST, `jwk-plm.shoi.ch`)이 기본. Notion 동기화는 **선택(레거시)**.

## 1. 설치 — `make setup` 한 번

루트에서 **`make setup`** 이 아래를 일괄 처리한다(개별 타깃도 가능):

| 레이어 | 무엇 | 타깃 |
|--------|------|------|
| MCP 서버 3종 | chrome·context7·serena | `make plugins` |
| **plan 플러그인** | 기획 커맨드 + hook (`plan:<cmd>`) | `make plugin-install` |
| **code 플러그인** | 코딩 커맨드 + hook (`code:<cmd>`) | `make plugin-install` |
| **plm-hub 플러그인** | PLM 거버넌스 브리지 (`plm-hub:<cmd>`) | `make plugin-install` |
| 시드·env | `.ouroboros/` + Ouroboros `.env` | `make ouroboros` · `make env` |
| (선택) Notion MCP | Notion 동기화를 쓸 때만 | `make notion-plugin` |

### Windows — `make` 불필요 (PowerShell 또는 Git Bash 택1)

Windows는 `make`가 없으므로 **동등 기능의 설치 스크립트 2종**을 제공한다. **기반 런타임(git·Node.js/npx·uv/uvx·Claude Code CLI)이 없으면 자동 설치**한다(winget 또는 공식 설치 스크립트).

**① PowerShell** (내장 Windows PowerShell 5.1+ — 추가 설치 불필요):
```powershell
# 저장소 루트에서
powershell -ExecutionPolicy Bypass -File .\setup.ps1     # 또는 pwsh -File .\setup.ps1
```
또는 파일 탐색기에서 **`setup.cmd` 더블클릭**.

**② Git Bash / WSL** (bash):
```bash
bash setup.sh
```

| 스위치 (ps1 / sh) | 동작 |
|-------------------|------|
| (없음) | 전체 설치 — 런타임 자동설치 → MCP·로컬 플러그인 → `.ouroboros` 시드 → `.env` |
| `-Check` / `--check` | 설치 상태(plugins / MCP / **runtimes** / env) |
| `-NotionPlugin` / `--notion` | (선택) Notion MCP 플러그인 |
| `-Channels` / `--channels` | 채널 사용법 안내 |
| `-SkipDeps` / `--skip-deps` | 런타임 자동설치 생략(플러그인/시드/env만) |
| `-DryRun` / `--dry-run` | 실행 없이 수행 작업만 출력(검증) |

- **런타임 자동설치**: Windows는 `winget`(Win10 1809+/11)으로 git·Node.js·uv 설치, Claude Code는 공식 설치본(`irm https://claude.ai/install.ps1 | iex`). Git Bash도 `winget`을 호출(있을 때) — 없으면 공식 설치본. **새로 설치한 직후엔 PATH 반영을 위해 터미널을 새로 열고 재실행**(스크립트가 안내).
- 멱등: 재실행 시 설치된 플러그인은 건너뛰고 **기존 `.env`·`.ouroboros` 편집분을 보존**(no-clobber). `.env`에 `PLM_API_TOKEN`이 있으면 유지.
- 조직 관리형 계정의 채널 정책은 관리자 PowerShell에서 `%ProgramFiles%\ClaudeCode\managed-settings.json` allowlist 등록(개인 Pro/Max는 불필요).

- **plan / code / plm-hub 플러그인**은 루트 `.claude-plugin/marketplace.json`(로컬 마켓플레이스 `jwk-platform`, source → `./plugin/{plan,code,plm-hub}` submodule)을 통해 `make plugin-install` 로 설치된다.
  - **plan** (`plan:<cmd>`): `plan:plan` `plan:requirement` `plan:design` `plan:decision` `plan:trace` `plan:reflect` (+ 레거시 `plan:notion-setup/push/pull`) + hook(gate-check·trace-validator·context-reminder).
  - **code** (`code:<cmd>`): `code:spec` `code:execute` `code:qa` `code:fix` `code:patch` `code:reflect` `code:onboarding` `code:housekeeping` `code:ask` `code:suggest` `code:guide` `code:study` `code:evolve` + hook. `.ouroboros/` 컨텍스트를 plan과 공유.
  - **plm-hub** (`plm-hub:<cmd>`): `plm-hub:link`(바인딩) `plm-hub:sync`(일괄) `plm-hub:pull`(역반영) `plm-hub:codescan`(코드 딥링크) `plm-hub:gates`(게이트) `plm-hub:channel`(웹→세션 push 설정) + hook(plm-sync·plm-gate·context-reminder). 설계: `plugin/plm-hub/HOOKS.md`.
  - 설치 상태는 `~/.claude`(사용자 설정)에 기록 → **머신마다 1회** `make plugin-install` 필요(`.claude/settings.json` 은 커밋하지 않는다).

### 커스텀 MCP 2종 (ouroboros · plm)
- 루트 `.mcp.json` 에 `ouroboros`(jwk-ouro.shoi.ch/mcp)·`plm`(jwk-plm.shoi.ch/mcp) MCP 서버가 선언돼 있다. 둘 다 **HTTP + OAuth** — **Claude 재실행 → 프로젝트 신뢰 승인 → OAuth 인증**으로 연결. **API Key를 `.env`에 넣을 필요 없다**.
- `ouroboros` = 글로벌 메모리/KG 백엔드. `plm` = PLM 거버넌스(14도구: artifact·relation·search·gates·export/import 등). 둘 다 도구만 제공 — 커맨드·hook은 플러그인이 담당.

## 2. 시드 초기화

기획 산출물·상태는 **프로젝트 로컬 `.ouroboros/`** 에 쌓인다(플러그인은 읽기전용). 처음 한 번:

- **권장**: 루트에서 `make setup`(또는 시드만 `make ouroboros`) — `plugin/plan/seed/` 를 프로젝트 `.ouroboros/` 로 복사(기존 파일 보존) + env 생성.
- 또는 수동: `cp -rn plugin/plan/seed/. ./.ouroboros/`

복사되는 것: `docs/`(빈 디렉토리), `env/.env.example`, `config/`, `context/`, `.gitignore`. **실제 `.env` 는 시드에 없다(토큰 누수 불가)** — `make env` 로 생성.

## 3. PLM 거버넌스 연동 (기본)

로컬 `.ouroboros/docs/*.md` = **본문·관계 SSOT**, PLM = **동기 대상 + 게이트(G1~G3)·추적·영향전파 권위**.

1. **plm MCP 연결**: `.mcp.json` 의 `plm` 서버 → Claude 재실행 → OAuth 승인(Keycloak). 이후 `artifact_issue`·`gates`·`search` 등 14도구를 대화 중 직접 사용.
2. **프로젝트 바인딩**: `/plm-hub:link <project-id>` — `.ouroboros/config/plm.json`(`{ "project": "...", "api_url": "https://jwk-plm.shoi.ch" }`)을 생성. 없는 프로젝트면 MCP `project_create`로 생성.
3. **쓰기 토큰(hook용)**: `plm-hub:link` 실행 시 **자동 발급·기입**(SSO JWT 재사용 → `POST /tokens` 셀프 발급, 본인 realm 역할·없으면 editor). 수동 기입도 가능: `.ouroboros/env/.env` 의 `PLM_API_TOKEN`.
4. 이후 **기획 `.md` 를 편집할 때마다** Edit hook(`plm-sync`)이 frontmatter+본문+owner 관계를 PLM에 즉시 upsert하고, **Stop hook(`plm-gate`)** 이 게이트 위반(orphan)·재검토 큐를 소프트 경고한다. 모두 비차단·graceful.
5. 일괄 동기는 `/plm-hub:sync`, 게이트 조회는 `/plm-hub:gates`.
6. **딥링크(요구↔코드)**: 구현 코드에 `// @plm SRS-NNN` 역링크 주석 → `/plm-hub:codescan` 실행 시 Code 아티팩트(`loc: path:line`)+`realizes` 생성 + 대상 `.md`에 `code_refs` 역기재. 아티팩트→문서는 결정적 규약 `docs/{type→dir}/{code}.md`.
7. **역반영(대시보드→로컬)**: 대시보드에서 편집했으면 `/plm-hub:pull`로 Status·관계·본문을 로컬 `.md`에 회수(plm-sync는 로컬→PLM 단방향). SSOT: 본문·관계=로컬, Status=PLM.
8. **채널 push(선택 — 웹 [Sync] 버튼 → 이 터미널 세션)**: `plm-channel` **플러그인**으로 동작한다(Claude Code가 커스텀 채널 주입을 정책 게이트로 막으므로 마켓플레이스 플러그인+managed-settings allowlist가 정식 경로 — `server:` raw MCP·dev 플래그로는 주입 안 됨, 검증됨). **1회 설정 3단계**: ① `claude plugin install plm-channel@jwk-platform`(또는 `make setup`) ② **`make channels`**(sudo — managed-settings에 `channelsEnabled`+`allowedChannelPlugins` 멱등 병합) ③ `/plm-hub:link <project>`(영속 `plmhub-` 토큰 발급). **편의**: `make setup` 마지막에 채널 설치 여부를 묻고(터미널일 때만) **Y 입력 시 ②를 자동 실행**한다(비대화형/CI는 자동 스킵). **사용**: `claude --channels plugin:plm-channel@jwk-platform` 로 세션을 띄우면, 웹에서 나를 assignee로 [Sync] enqueue 시 세션에 `<channel>` 태그로 작업이 도착하고 `report` 도구로 회신된다(work state→done). 토큰은 시작 시 1회 로드(만료 없는 영속 토큰). 단독 안내는 `/plm-hub:channel`. (channels=연구 프리뷰·Claude Code v2.1.80+·Node ≥18. 설계: `plugin/plm-channel/README.md`.)

## 4. Notion 연동 (선택 — 레거시)

PLM 대신/병행으로 Notion 동기화를 쓸 때만. **하이브리드**: 감지 = `NOTION_TOKEN`(read-only), push/pull/provision = Notion MCP 플러그인(OAuth).

1. **MCP 플러그인 설치**: `make notion-plugin` → 최초 1회 OAuth 승인.
2. **감지용 토큰(read-only)**: `make notion` — my-integrations에서 **Read content 만** 가진 integration 생성 → 토큰·root page URL 입력 → `.ouroboros/env/.env`에 자동 기입(권한 600). integration은 **root page 한 곳에만** 공유.
3. `/notion-setup` → dry-run 확인 → 동의 시 root page 아래 섹션 페이지 + 6 DB(URS·UCS·SRS·SAD·ADR·Roadmap) 생성. 동기화는 `/notion-push`·`/notion-pull`.

> PLM과 Notion을 함께 쓰면 둘 다 동기 대상이 된다. 한쪽만 쓰려면 다른 쪽 hook/토큰을 비활성(미설정)으로 둔다.

## 5. 사용 흐름

```
# 기획 (plan 플러그인)
plan:plan          → PRD(비추적) + Roadmap(RM)
plan:requirement   → URS · UCS · SRS
plan:design        → SAD
plan:decision      → ADR
plan:trace         → 추적·G1/G2·매트릭스
plan:reflect

# PLM 거버넌스 (plm-hub 플러그인)
plm-hub:link <p>   → 프로젝트 바인딩
plm-hub:sync       → 로컬 .md → PLM 일괄 동기
plm-hub:pull       → PLM/대시보드 → 로컬 .md 역반영
plm-hub:codescan   → 소스 @plm 주석 → 코드↔요구 딥링크
plm-hub:gates      → 게이트(G1~G3)·재검토 큐
plm-hub:channel    → 웹 [Sync] 버튼 → 이 터미널 세션 push 설정(claude --channels)

# 코딩 (code 플러그인)
code:spec → code:execute → code:qa → code:fix → ...
```
기획 `.md` 편집 시 **Edit hook(plm-sync)** 이 PLM에 즉시 반영, **Stop hook(plm-gate)** 이 게이트 경고. (레거시 Notion 모드는 `notion-detect` 감지 → `/notion-push`.)

## 6. Security & Trust

plm-hub 플러그인 hook(모두 비차단·exit 0·graceful):
- **PostToolUse(Edit|Write)**: `plm-sync.sh` → 변경된 기획 `.md` 1건을 PLM `/import`로 upsert(token_hash 쓰기). 미바인딩/미도달이면 조용히 skip.
- **Stop**: `plm-gate.sh` → PLM `/gates`·`/review-queue`(public GET, 토큰 불필요) 경고(디바운스 45s).
- **UserPromptSubmit**: `context-reminder.sh` → 바인딩 환기(외부 호출 없음).

plan 플러그인 hook: `gate-check.sh`(로컬 추적 검증)·`trace-validator.sh`(로컬)·`context-reminder.sh`(로컬). 레거시 `notion-detect.sh`는 Notion 모드에서만.

- **비밀**: `PLM_API_TOKEN`·`NOTION_TOKEN`은 `.ouroboros/env/.env`(gitignore, 600). hook은 token_hash로 REST 호출, MCP 도구는 OAuth 세션(사용자 승인).
- **민감 기획**: frontmatter `sync: false` 로 본문 반출 제외(PLM·Notion 양쪽 detect/push에서 제외).
- Cloudflare 뒤 PLM 호출 시 hook 스크립트는 `user-agent` 헤더를 명시(기본 python-urllib UA는 403 차단됨).

## 7. 트러블슈팅

| 증상 | 원인 / 조치 |
|------|-------------|
| plm-sync 동기 안 됨 | `/plm-hub:link` 바인딩 확인(`config/plm.json`) + `.env` `PLM_API_TOKEN` 확인. 403이면 토큰 권한(writer) 점검 |
| plm MCP 도구 안 보임 | Claude 재실행 → `.mcp.json` plm OAuth 승인했는지 확인 |
| 게이트 경고 안 뜸 | `jwk-plm.shoi.ch/gates?project=` 도달 확인(public). 디바운스 45s 후 재시도 |
| 토큰 없이 동작? | 동기화만 graceful skip — 로컬 기획·추적은 정상 |
| (Notion) 동기화 안 됨 | `401`/`404` = integration을 root page에 공유했는지 확인 |
| 충돌(pull) | 로컬·원격 양쪽 Status 변경 시 자동 미적용 → 안내 따라 수동 선택 |
