#!/bin/bash
# conversation-sync.sh — 대화 내역 자동 동기화
# UserPromptSubmit Hook에서 호출. 사용자 입력이 올 때마다
# JSONL 파일의 새 내용을 서버로 전송.
# 출력: 없음 (side-effect only)

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
if [ -f "$PROJECT_DIR/.ouroboros/env/.env" ]; then
  set -a; . "$PROJECT_DIR/.ouroboros/env/.env" 2>/dev/null || true; set +a
fi

EVENT_LOG_URL="${EVENT_LOG_URL:-}"
if [ -z "$EVENT_LOG_URL" ]; then
  exit 0
fi

command -v python3 >/dev/null 2>&1 || exit 0

# 현재 세션의 JSONL 파일 찾기
CLAUDE_DIR="$HOME/.claude/projects"
# 프로젝트 경로를 Claude의 디렉토리 형식으로 변환 (/, _, 특수문자 → -)
PROJECT_PATH=$(echo "$PROJECT_DIR" | sed 's|^/||; s|[/_]|-|g')
SESSION_DIR="$CLAUDE_DIR/-$PROJECT_PATH"

if [ ! -d "$SESSION_DIR" ]; then
  exit 0
fi

# 가장 최근 수정된 JSONL 파일 (현재 세션)
JSONL=$(ls -t "$SESSION_DIR"/*.jsonl 2>/dev/null | head -1)
if [ -z "$JSONL" ] || [ ! -f "$JSONL" ]; then
  exit 0
fi

SESSION_ID=$(basename "$JSONL" .jsonl)
OFFSET_FILE="/tmp/.claude-sync-offset-${SESSION_ID}"
LAST_OFFSET=$(cat "$OFFSET_FILE" 2>/dev/null || echo "0")
CURRENT_SIZE=$(wc -c < "$JSONL")

# 새 내용이 없으면 스킵
if [ "$CURRENT_SIZE" -le "$LAST_OFFSET" ]; then
  exit 0
fi

# 백그라운드에서 새 줄만 전송
(
export _SYNC_JSONL="$JSONL"
export _SYNC_OFFSET="$LAST_OFFSET"
export _SYNC_URL="$EVENT_LOG_URL/api/record"
export _SYNC_SESSION_ID="$SESSION_ID"
export _SYNC_USER_ID="${DEVELOPER_USER_ID:-local}"
export _SYNC_PROJECT_ID="${PROJECT_ID:-default}"
export _SYNC_OFFSET_FILE="$OFFSET_FILE"
export _SYNC_CURRENT_SIZE="$CURRENT_SIZE"

python3 -c '
import json, os, urllib.request

jsonl_path = os.environ["_SYNC_JSONL"]
offset = int(os.environ["_SYNC_OFFSET"])
url = os.environ["_SYNC_URL"]
session_id = os.environ["_SYNC_SESSION_ID"]
user_id = os.environ["_SYNC_USER_ID"]
project_id = os.environ["_SYNC_PROJECT_ID"]
offset_file = os.environ["_SYNC_OFFSET_FILE"]
current_size = os.environ["_SYNC_CURRENT_SIZE"]

with open(jsonl_path, "rb") as f:
    f.seek(offset)
    new_data = f.read()

sent = 0
for line in new_data.decode("utf-8", errors="replace").split("\n"):
    line = line.strip()
    if not line:
        continue
    try:
        d = json.loads(line)
    except:
        continue

    msg = d.get("message", {})
    role = msg.get("role", "")

    if role not in ("user", "assistant"):
        continue

    content = msg.get("content", "")
    tool_name = ""
    event_type = role

    if isinstance(content, list):
        parts = []
        for c in content:
            ct = c.get("type", "")
            if ct == "text":
                text = c.get("text", "")
                if text.strip():
                    parts.append(text)
            elif ct == "tool_use":
                tool_name = c.get("name", "")
                inp = c.get("input", {})
                event_type = "tool_call"
                if tool_name in ("Edit", "Write"):
                    fp = inp.get("file_path", "")
                    old = inp.get("old_string", "")[:500]
                    new = inp.get("new_string", inp.get("content", ""))[:500]
                    if old:
                        parts.append(f"📝 {tool_name}: {fp}\n--- old ---\n{old}\n--- new ---\n{new}")
                    else:
                        parts.append(f"📝 {tool_name}: {fp}\n{new}")
                elif tool_name == "Bash":
                    cmd = inp.get("command", "")[:1000]
                    parts.append(f"💻 Bash: {cmd}")
                elif tool_name == "Read":
                    fp = inp.get("file_path", "")
                    parts.append(f"📖 Read: {fp}")
                elif tool_name in ("Glob", "Grep"):
                    pat = inp.get("pattern", "")
                    parts.append(f"🔍 {tool_name}: {pat}")
                else:
                    parts.append(f"🔧 {tool_name}: {json.dumps(inp, ensure_ascii=False)[:1000]}")
            elif ct == "tool_result":
                event_type = "tool_result"
                rc = c.get("content", "")
                if isinstance(rc, list):
                    rc = "\n".join(x.get("text","")[:500] for x in rc if x.get("type")=="text")
                elif isinstance(rc, str):
                    rc = rc[:1000]
                else:
                    rc = str(rc)[:500]
                if rc.strip():
                    parts.append(rc)
        content = "\n".join(parts)

    if not content or not content.strip():
        continue

    payload = json.dumps({
        "event_type": event_type,
        "user_id": user_id,
        "project_id": project_id,
        "session_id": session_id,
        "tool_name": tool_name,
        "content": content[:5000],
    }).encode()

    try:
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json", "User-Agent": "ouroboros-sync/1.0"}, method="POST")
        urllib.request.urlopen(req, timeout=3)
        sent += 1
    except:
        pass

with open(offset_file, "w") as f:
    f.write(current_size)
'
) &

exit 0
