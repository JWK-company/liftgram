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
import json, os, re, urllib.request

jsonl_path = os.environ["_SYNC_JSONL"]
offset = int(os.environ["_SYNC_OFFSET"])
url = os.environ["_SYNC_URL"]
session_id = os.environ["_SYNC_SESSION_ID"]
user_id = os.environ["_SYNC_USER_ID"]
project_id = os.environ["_SYNC_PROJECT_ID"]
offset_file = os.environ["_SYNC_OFFSET_FILE"]
current_size = os.environ["_SYNC_CURRENT_SIZE"]

# OBS-02: PII 레닥션(event-capture.sh와 동일 패턴) — 대화 본문/Bash/diff의 시크릿 평문 적재 차단.
_PII = [
    (re.compile(r"(?i)(Bearer\s+)([A-Za-z0-9\-._~+/]+=*)"), r"\1[REDACTED]"),
    (re.compile(r"(?i)(\"(?:password|secret|token|api_key|apikey|access_key|private_key)\")\s*:\s*\"([^\"]*)\""), r"\1: \"[REDACTED]\""),
    (re.compile(r"(?i)((?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|AWS_SECRET)[A-Z_]*)\s*=\s*(\S+)"), r"\1=[REDACTED]"),
    (re.compile(r"-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----"), "[REDACTED:PRIVATE_KEY]"),
]
def redact(t):
    if not t:
        return t
    for rx, rep in _PII:
        t = rx.sub(rep, t)
    return t

with open(jsonl_path, "rb") as f:
    f.seek(offset)
    new_data = f.read()

sent = 0
# OBS-02: 라인별 바이트 위치 추적 — 전송 성공한 마지막 라인까지만 오프셋 전진(실패 시 그 지점에서
# 멈춰 다음 실행 재시도 → 이벤트 서버 다운 시 대화 영구소실 방지). raw 바이트 라인으로 분할.
raw_lines = new_data.split(b"\n")
last_ok = offset            # 성공 전송한 마지막 라인의 끝 바이트(없으면 시작 오프셋 유지)
cursor = offset             # 현재 라인 시작 바이트
failed = False
for raw in raw_lines:
    line_end = cursor + len(raw) + 1  # +1 = "\n"
    cursor = line_end
    line = raw.decode("utf-8", errors="replace").strip()
    if not line:
        last_ok = min(line_end, int(current_size))  # 빈 라인은 건너뛰되 위치는 전진
        continue
    try:
        d = json.loads(line)
    except:
        last_ok = min(line_end, int(current_size))   # 파싱불가 라인도 스킵(전송대상 아님)
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
        "content": redact(content)[:5000],  # OBS-02: PII 레닥션
    }).encode()

    try:
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json", "User-Agent": "ouroboros-sync/1.0"}, method="POST")
        urllib.request.urlopen(req, timeout=3)
        sent += 1
        last_ok = min(line_end, int(current_size))  # 이 라인까지 성공 → 오프셋 전진 허용
    except Exception:
        # OBS-02: 전송 실패 → 오프셋을 더 전진시키지 않고 중단(다음 실행에서 이 라인부터 재시도).
        failed = True
        break

# OBS-02: 전부 성공 시 current_size까지, 실패 시 last_ok(마지막 성공 라인)까지만 전진.
new_offset = str(int(current_size)) if (not failed) else str(int(last_ok))
with open(offset_file, "w") as f:
    f.write(new_offset)
'
) &

exit 0
