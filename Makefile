# jwk-platform -- install automation (plan + code + plm-hub plugins)
#
#   make setup    install MCP plugins (chrome/notion/context7/serena) + plan & code plugins + .ouroboros env
#   make plugins  install the 4 MCP plugins only
#   make ouroboros copy the .ouroboros seed only
#   make check    show install status (MCP / plugins / env)
#   make help     this help
#
# NOTE: output is intentionally ASCII-only so it never garbles on non-UTF-8
#       terminals / older make builds (e.g. GnuWin32 make on Windows).
#       Korean text lives in the .md / .html docs and the shell scripts.
# Idempotent: safe to re-run (skips already-installed/existing). Keeps existing .env/state.

SHELL := /bin/bash
.DEFAULT_GOAL := help   # bare `make` shows help

# --- plugin identifiers (plugin@marketplace) ---
OFFICIAL        := claude-plugins-official
NOTION_MP       := notion-plugin-marketplace
NOTION_MP_SRC   := makenotion/claude-code-notion-plugin

# 기본 MCP 플러그인 (PLM이 거버넌스 백엔드 — Notion은 선택: `make notion-plugin`)
PLUGINS := \
	chrome-devtools-mcp@$(OFFICIAL) \
	context7@$(OFFICIAL) \
	serena@$(OFFICIAL)
NOTION_PLUGIN := notion-workspace-plugin@$(NOTION_MP)

# --- this repo's local marketplace + plugins (plan / code / plm-hub / plm-channel) ---
MP          := jwk-platform
PLAN_PLUGIN := plan
CODE_PLUGIN := code
PLM_PLUGIN  := plm-hub
CHAN_PLUGIN := plm-channel
CHAN_SETUP  := plugin/plm-channel/scripts/setup-channels.sh

# --- .ouroboros paths ---
# P8 installer로 대체 예정. (인라인 주석 금지 — :=가 주석 앞 공백까지 변수에 포함하는 Make 함정)
SEED       := plugin/plan/seed
OURO       := .ouroboros
ENV_FILE   := $(OURO)/env/.env
ENV_SCRIPT := workflow/installer-legacy/scripts/setup-env.sh
NOTION_SCRIPT := workflow/installer-legacy/scripts/notion-token.sh

.PHONY: setup update plugins plugin-install marketplaces ouroboros env notion guide check deps help channels channels-prompt

setup: deps marketplaces plugins plugin-install ouroboros env channels-prompt ## full install (MCP + planning plugin + env)
	@echo ""
	@echo "[OK] setup done."
	@echo "   - MCP plugins (chrome/context7/serena) + plan & code & plm-hub & plm-channel plugins installed"
	@echo "   - 채널(웹 [Sync]→세션): 위에서 Y 선택 시 설치됨 / 아니면 'make channels' 후 claude --dangerously-skip-permissions --channels plugin:plm-channel@jwk-platform"
	@echo "   - $(OURO)/ seed + Ouroboros .env created"
	@echo "   - ouroboros + plm MCP: restart Claude -> approve (headersHelper 토큰 인증 — 헤드리스 OK; ouro 는 .env OURO_MCP_TOKEN 필요)"
	@echo "   - PLM 거버넌스: /plm-hub:link <project> 로 바인딩 (plm.shoi.ch)"
	@echo "   - (선택) Notion 동기화: 'make notion-plugin' + 'make notion' -> /notion-setup"
	@echo "   verify: make check"
	@echo ""
	@echo "Opening guide (make guide)..."
	@"$(MAKE)" --no-print-directory guide || true

update: ## 재설치 없이 최신화 — 플러그인(스킬·훅) + 스캐폴딩 instruction. 사용자 데이터(.env·docs/*.json·state) 보존
	@MP="$(MP)" bash update.sh

deps: ## check required runtimes (claude/npx/uvx)
	@command -v claude >/dev/null || { echo "[X] 'claude' CLI not found. Install Claude Code."; exit 1; }
	@command -v npx    >/dev/null || { echo "[X] 'npx' (Node.js) not found. Needed for context7."; exit 1; }
	@command -v uvx    >/dev/null || { echo "[X] 'uvx' (uv) not found. Needed for serena."; exit 1; }
	@echo "[OK] runtimes: claude, npx, uvx"

marketplaces: ## register required marketplaces. official is built-in; Notion은 선택(make notion-plugin).
	# ONB-05: Notion 마켓플레이스는 선택 의존이므로 기본 setup에서 무조건 등록하지 않는다(불필요 네트워크 의존 제거).
	#         Notion 동기화가 필요하면 `make notion-plugin`이 등록+설치를 함께 수행한다.
	@echo "-> marketplaces: official built-in (Notion은 선택 — make notion-plugin)"

plugins: ## install the default MCP plugins (chrome/context7/serena — Notion은 make notion-plugin)
	@echo "-> installing MCP plugins"
	# 신규 claude 설치엔 공식 마켓플레이스가 미등록 → add 선행(멱등).
	@claude plugin marketplace add anthropics/claude-plugins-official 2>&1 | sed 's/^/  /' || true
	@for p in $(PLUGINS); do \
		echo "  * $$p"; \
		claude plugin install "$$p" 2>&1 | sed 's/^/    /'; \
	done

notion-plugin: ## (선택) Notion MCP 플러그인 설치 — PLM 대신 Notion 동기화를 쓸 때만
	@echo "-> installing Notion MCP plugin (optional — PLM이 기본 백엔드)"
	# ONB-05: opt-in 시점에 Notion 마켓플레이스를 등록(기본 setup에서 이동) → 선택한 사용자만 네트워크 의존.
	@claude plugin marketplace add $(NOTION_MP_SRC) 2>/dev/null \
		&& echo "  + $(NOTION_MP) added" \
		|| echo "  = $(NOTION_MP) already registered (or built-in)"
	@claude plugin install "$(NOTION_PLUGIN)" 2>&1 | sed 's/^/    /'

plugin-install: ## install plan+code+plm-hub+plm-channel — project scope(프로젝트별 최신·user scope 오버라이드)
	@echo "-> jwk-platform plugins (project scope — 이 프로젝트 plugin/ 기준 최신)"
	# 마켓플레이스를 이 프로젝트 dir로 project-scope 등록(.claude/settings.json). user-scope 옛 경로 고정 회피.
	@claude plugin marketplace add "$(CURDIR)" --scope project 2>&1 | sed 's/^/  /' \
		|| claude plugin marketplace update $(MP) 2>&1 | sed 's/^/  /' || true
	@for p in $(PLAN_PLUGIN) $(CODE_PLUGIN) $(PLM_PLUGIN) $(CHAN_PLUGIN); do \
		echo "  * $$p@$(MP) (project)"; \
		claude plugin install "$$p@$(MP)" --scope project 2>&1 | sed 's/^/    /'; \
	done
	@echo "  사용: plan:<command> / code:<command> / plm-hub:<command>"
	@echo "  채널: 'make channels' 후 claude --dangerously-skip-permissions --channels plugin:$(CHAN_PLUGIN)@$(MP)"
	@echo "  ※ project scope가 user scope 옛 설치본보다 우선. 옛 user-scope 정리(선택·1회):"
	@echo "     claude plugin uninstall plm-hub@$(MP) --scope user"

refresh-plugins: ## 마켓플레이스+플러그인 최신화(이 프로젝트 기준·세션 후 /reload-plugins)
	@claude plugin marketplace update $(MP) 2>&1 | sed 's/^/  /' || true
	@for p in $(PLAN_PLUGIN) $(CODE_PLUGIN) $(PLM_PLUGIN) $(CHAN_PLUGIN); do \
		claude plugin update "$$p@$(MP)" --scope project 2>&1 | sed 's/^/  /' || true; \
	done
	@echo "  세션 내 적용: /reload-plugins"

channels: ## 채널 사용 안내 (개인 Pro/Max는 sudo 불필요 — 바로 --channels)
	@bash $(CHAN_SETUP)

channels-policy: ## [조직 관리형 전용] managed-settings allowlist 등록 (sudo 1회)
	@bash $(CHAN_SETUP) --policy
	@echo "  다음: /plm-hub:link <project> (토큰) → claude --dangerously-skip-permissions --channels plugin:$(CHAN_PLUGIN)@$(MP)"

channels-prompt: ## (setup 중) 채널 사용법 안내 — sudo 없음
	@bash $(CHAN_SETUP)

ouroboros: ## copy the .ouroboros seed dir (keeps existing files, excludes .env)
	@echo "-> creating $(OURO) seed"
	@if [ ! -d "$(SEED)" ]; then echo "[X] seed dir ($(SEED)) not found."; exit 1; fi
	@mkdir -p $(OURO)/env
	@cp -rn $(SEED)/. $(OURO)/ 2>/dev/null || cp -r $(SEED)/. $(OURO)/
	@echo "  [OK] $(OURO)/ ready (docs/env/config/context). .env -> 'make env'."

env: ## ensure Ouroboros .env (온보딩 설치 스크립트/installer가 채움; 레거시 스크립트는 선택)
	@mkdir -p $(OURO)/env
	@if grep -qE '^PLM_API_TOKEN=.+' "$(ENV_FILE)" 2>/dev/null; then \
		echo "  [=] .env 이미 구성됨(PLM_API_TOKEN 존재) — 건너뜀"; \
	elif [ -f "$(ENV_SCRIPT)" ]; then \
		bash $(ENV_SCRIPT) $(ENV_FILE); \
	else \
		touch "$(ENV_FILE)"; \
		echo "  [!] env 스크립트 없음 — .env는 온보딩 설치 스크립트 또는 /plm-hub:link 가 채웁니다 ($(ENV_FILE))"; \
	fi

notion: ## Notion detect token (read-only) onboarding -> writes .env (interactive)
	@if [ ! -f "$(NOTION_SCRIPT)" ]; then echo "[X] $(NOTION_SCRIPT) not found."; exit 1; fi
	@mkdir -p $(OURO)/env
	@bash $(NOTION_SCRIPT) $(ENV_FILE)

check: ## show install status
	@echo "=== plugins ==="
	@claude plugin list 2>/dev/null | grep -iE "chrome|context7|serena|notion|^plan|plan@|code@| plan | code " || echo "  (none)"
	@echo "=== MCP ==="
	@claude mcp list 2>/dev/null | grep -iE "chrome|context7|serena|notion|ouroboros" || echo "  (none)"
	@echo "=== ouroboros env ==="
	@[ -d "$(OURO)/docs" ] && echo "  [OK] $(OURO)/docs" || echo "  [X] $(OURO)/docs missing (make ouroboros)"
	@if [ -f "$(ENV_FILE)" ]; then \
		echo "  [OK] $(ENV_FILE)"; \
		for k in OUROBOROS_URL DEVELOPER_USER_ID PROJECT_ID; do \
			grep -q "^$$k=" $(ENV_FILE) && echo "    [OK] $$k" || echo "    [X] $$k missing"; \
		done; \
	else \
		echo "  [X] $(ENV_FILE) missing (make env)"; \
	fi

guide: ## open the HTML guide in a browser (있을 때만; 온보딩 템플릿엔 미포함 — graceful)
	@f="$(CURDIR)/workflow/docs/guide/index.html"; url="file://$$f"; \
	[ -f "$$f" ] || { echo "  (가이드 HTML 없음 — 'make help' 또는 plugin/plm-hub/HOOKS.md 참고)"; exit 0; }; \
	echo "Guide: $$url"; \
	if   command -v xdg-open      >/dev/null 2>&1; then setsid xdg-open "$$url" >/dev/null 2>&1 </dev/null & \
	elif command -v open          >/dev/null 2>&1; then open "$$url"; \
	elif command -v cygstart      >/dev/null 2>&1; then cygstart "$$f"; \
	elif command -v wslview       >/dev/null 2>&1; then wslview "$$url" >/dev/null 2>&1 </dev/null & \
	elif command -v powershell.exe >/dev/null 2>&1; then powershell.exe -NoProfile -Command start "\"$$url\"" >/dev/null 2>&1; \
	elif command -v explorer.exe  >/dev/null 2>&1; then explorer.exe "$$f" >/dev/null 2>&1 || true; \
	elif command -v python3       >/dev/null 2>&1; then python3 -m webbrowser "$$url" >/dev/null 2>&1; \
	else echo "  Open the URL above in your browser."; fi; true

help: ## this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
