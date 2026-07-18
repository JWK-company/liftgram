# plan-db -- install automation (plan + code plugins)
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

# --- this repo's local marketplace + plugins (plan / code / plm-hub) ---
MP          := plan-db
PLAN_PLUGIN := plan
CODE_PLUGIN := code
PLM_PLUGIN  := plm-hub

# --- .ouroboros paths ---
SEED       := .template/plugins/plan/seed
OURO       := .ouroboros
ENV_FILE   := $(OURO)/env/.env
ENV_SCRIPT := .template/scripts/setup-env.sh
NOTION_SCRIPT := .template/scripts/notion-token.sh

.PHONY: setup plugins plugin-install marketplaces ouroboros env notion guide check deps help

setup: deps marketplaces plugins plugin-install ouroboros env ## full install (MCP + planning plugin + env)
	@echo ""
	@echo "[OK] setup done."
	@echo "   - MCP plugins (chrome/context7/serena) + plan & code & plm-hub plugins installed"
	@echo "   - $(OURO)/ seed + Ouroboros .env created"
	@echo "   - ouroboros + plm MCP: restart Claude -> approve -> OAuth login (.mcp.json)"
	@echo "   - PLM 거버넌스: /plm-hub:link <project> 로 바인딩 (plm.shoi.ch)"
	@echo "   - (선택) Notion 동기화: 'make notion-plugin' + 'make notion' -> /notion-setup"
	@echo "   verify: make check"
	@echo ""
	@echo "Opening guide (make guide)..."
	@"$(MAKE)" --no-print-directory guide || true

deps: ## check required runtimes (claude/npx/uvx)
	@command -v claude >/dev/null || { echo "[X] 'claude' CLI not found. Install Claude Code."; exit 1; }
	@command -v npx    >/dev/null || { echo "[X] 'npx' (Node.js) not found. Needed for context7."; exit 1; }
	@command -v uvx    >/dev/null || { echo "[X] 'uvx' (uv) not found. Needed for serena."; exit 1; }
	@echo "[OK] runtimes: claude, npx, uvx"

marketplaces: ## register marketplaces (notion). official is built-in.
	@echo "-> registering marketplaces"
	@claude plugin marketplace add $(NOTION_MP_SRC) 2>/dev/null \
		&& echo "  + $(NOTION_MP) added" \
		|| echo "  = $(NOTION_MP) already registered (or built-in)"

plugins: ## install the default MCP plugins (chrome/context7/serena — Notion은 make notion-plugin)
	@echo "-> installing MCP plugins"
	@for p in $(PLUGINS); do \
		echo "  * $$p"; \
		claude plugin install "$$p" 2>&1 | sed 's/^/    /'; \
	done

notion-plugin: ## (선택) Notion MCP 플러그인 설치 — PLM 대신 Notion 동기화를 쓸 때만
	@echo "-> installing Notion MCP plugin (optional — PLM이 기본 백엔드)"
	@claude plugin install "$(NOTION_PLUGIN)" 2>&1 | sed 's/^/    /'

plugin-install: ## install this repo's plan + code + plm-hub plugins (local marketplace)
	@echo "-> plan-db plugins (local marketplace: $(MP))"
	@claude plugin marketplace add "$(CURDIR)" 2>/dev/null \
		&& echo "  + marketplace $(MP) registered" \
		|| echo "  = marketplace $(MP) already registered"
	@for p in $(PLAN_PLUGIN) $(CODE_PLUGIN) $(PLM_PLUGIN); do \
		echo "  * $$p@$(MP)"; \
		claude plugin install "$$p@$(MP)" 2>&1 | sed 's/^/    /'; \
	done
	@echo "  사용: plan:<command> (기획) / code:<command> (코딩) / plm-hub:<command> (PLM 거버넌스)"

ouroboros: ## copy the .ouroboros seed dir (keeps existing files, excludes .env)
	@echo "-> creating $(OURO) seed"
	@if [ ! -d "$(SEED)" ]; then echo "[X] seed dir ($(SEED)) not found."; exit 1; fi
	@mkdir -p $(OURO)/env
	@cp -rn $(SEED)/. $(OURO)/ 2>/dev/null || cp -r $(SEED)/. $(OURO)/
	@echo "  [OK] $(OURO)/ ready (docs/env/config/context). .env -> 'make env'."

env: ## generate Ouroboros .env (interactive; API key optional -> MCP auth)
	@if [ ! -f "$(ENV_SCRIPT)" ]; then echo "[X] $(ENV_SCRIPT) not found."; exit 1; fi
	@mkdir -p $(OURO)/env
	@bash $(ENV_SCRIPT) $(ENV_FILE)

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

guide: ## open the HTML guide in a browser (.template/guide/index.html)
	@f="$(CURDIR)/.template/guide/index.html"; url="file://$$f"; \
	[ -f "$$f" ] || { echo "[X] $$f not found"; exit 1; }; \
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
