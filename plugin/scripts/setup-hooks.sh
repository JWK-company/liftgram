#!/usr/bin/env bash
# repo 클론 후 1회 실행 — 시크릿 게이트 활성화
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit 2>/dev/null || true
echo "✓ 시크릿 게이트 활성화 (core.hooksPath=.githooks)"
command -v gitleaks >/dev/null 2>&1 || [ -x "$HOME/.local/bin/gitleaks" ] || echo "⚠ gitleaks 미설치 — 설치 권장"
