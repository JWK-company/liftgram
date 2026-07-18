---
description: 이 프로젝트의 기획 워크플로우를 PLM 프로젝트에 바인딩한다 (.md↔PLM 자동 동기 활성화)
---

PLM 거버넌스 백엔드에 이 로컬 워크플로우를 연결한다.

1. 인자(`$ARGUMENTS`)에서 PLM 프로젝트 id(slug)를 파악한다. 없으면 사용자에게 묻는다.
2. `.ouroboros/config/plm.json` 을 생성/갱신한다 — **기존 `api_url`이 있으면 보존**(자가호스팅 인스턴스
   덮어쓰기 방지·ONB-03), 없을 때만 인스턴스 기본값 사용. `project`만 인자로 갱신한다.
3. PLM에 해당 프로젝트가 없으면 `plm` MCP의 `project_create` 도구로 생성한다(또는 REST `POST /projects`).
4. **쓰기 토큰 자동 발급**: `.ouroboros/env/.env`의 `PLM_API_TOKEN`이 비어 있으면
   `python3 ${CLAUDE_PLUGIN_ROOT}/scripts/plm_token_issue.py` 를 실행한다 — 사용자가 이미 승인한
   plm MCP OAuth(SSO JWT)를 재사용해 `POST /tokens`(OIDC 전용)로 **본인 realm 역할**(명시 역할 없으면
   editor) 토큰을 셀프 발급하고 `.env`에 자동 기입한다. `[skip] OAuth 토큰 없음`이 나오면 사용자에게
   `/mcp → plm → Authenticate` 후 재실행을 안내한다. (OIDC 미설정 자가호스팅 서버는 dev 토큰 그대로 사용.)
5. **채널 안내**: 방금 발급한 `.env` 토큰으로 웹 [Sync]→세션 push가 가능하다. 채널은 `plm-channel`
   **플러그인**으로 동작한다(정책 게이트 때문에 마켓플레이스 플러그인 필요 — `server:` 방식은 주입 안 됨).
   미설정 시 사용자에게 1회 설정을 안내한다: ① `claude plugin install plm-channel@jwk-platform`
   ② `make channels`(managed-settings allowlist·sudo) ③ `claude --channels plugin:plm-channel@jwk-platform`.
   (상세는 `/plm-hub:channel`.)
6. 바인딩 후: 기획 `.md` 편집 시 `plm-sync` hook이 자동 upsert하고, Stop 시 `plm-gate` hook이 PLM 게이트를 표면화한다.
7. 결과를 1줄 보고하고 `current.md`를 갱신한다.
