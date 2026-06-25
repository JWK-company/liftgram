#!/bin/bash
# event-capture.sh -- 비동기 이벤트 전송 (PII 필터링 포함)
# Usage: event-capture.sh <event_type>
# event_type: "prompt" | "tool_call"
# 트리거: UserPromptSubmit (prompt), PostToolUse Edit|Write|Bash (tool_call)
# 출력: 없음 (side-effect only, stdout 비움)

EVENT_TYPE="${1:-unknown}"

# .env 로드 (EVENT_LOG_URL, DEVELOPER_USER_ID 등)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
if [ -f "$PROJECT_DIR/.ouroboros/env/.env" ]; then
  set -a; . "$PROJECT_DIR/.ouroboros/env/.env" 2>/dev/null || true; set +a
fi

EVENT_LOG_URL="${EVENT_LOG_URL:-}"
USER_ID="${DEVELOPER_USER_ID:-local}"
PROJECT_ID_VAL="${PROJECT_ID:-default}"

# EVENT_LOG_URL 미설정 시 조용히 종료
if [ -z "$EVENT_LOG_URL" ]; then
  exit 0
fi

# python3 없으면 조용히 스킵
if ! command -v python3 >/dev/null 2>&1; then
  exit 0
fi

STDIN_RAW=$(cat)

# 임시 Python 스크립트 생성 (single-quote 이스케이핑 문제 회피)
PYSCRIPT=$(mktemp /tmp/.claude-event-XXXXXX.py 2>/dev/null || echo "/tmp/.claude-event-$$.py")

cat > "$PYSCRIPT" << 'PYEOF'
import json, sys, os, re, urllib.request
from datetime import datetime, timezone

def redact_pii(text):
    """민감 정보 패턴을 [REDACTED]로 치환"""
    if not text:
        return text

    patterns = [
        # API key / token 패턴
        (r'(?i)(api[_-]?key|token|secret|password|passwd|pwd|auth)\s*[=:]\s*["\']?([^\s"\'}{,\]]+)',
         r'\1=[REDACTED]'),

        # Bearer token
        (r'(?i)(Bearer\s+)([A-Za-z0-9\-._~+/]+=*)',
         r'\1[REDACTED]'),

        # 일반적인 secret 값 패턴 (key-value in JSON)
        (r'(?i)("(?:password|secret|token|api_key|apikey|access_key|private_key)")\s*:\s*"([^"]*)"',
         r'\1: "[REDACTED]"'),

        # 환경변수 할당 (KEY=value)
        (r'(?i)((?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|AWS_SECRET)[A-Z_]*)\s*=\s*(\S+)',
         r'\1=[REDACTED]'),

        # .env 파일 내용이 포함된 경우
        (r'(?i)(OUROBOROS_API_KEY|JWT_SECRET|NEO4J_PASSWORD|CLICKHOUSE_PASSWORD)\s*=\s*(\S+)',
         r'\1=[REDACTED]'),

        # SSH private key 블록
        (r'-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----',
         '[REDACTED:PRIVATE_KEY]'),
    ]

    result = text
    for pattern, replacement in patterns:
        try:
            result = re.sub(pattern, replacement, result)
        except Exception:
            pass

    return result

try:
    raw = sys.stdin.read()
    data = json.loads(raw) if raw.strip() else {}
except Exception:
    data = {}

event_type = os.environ.get("EVENT_TYPE_ENV", "unknown")
user_id = os.environ.get("USER_ID_ENV", "local")
project_id = os.environ.get("PROJECT_ID_ENV", "default")
event_log_url = os.environ.get("EVENT_LOG_URL_ENV", "")

session_id = data.get("session_id", "")
if not session_id:
    session_id = datetime.now().strftime("%Y%m%d-%H%M%S")

tool_name = data.get("tool_name", "")

# tool_input 처리 + PII 필터링
tool_input_raw = data.get("tool_input", "")
if isinstance(tool_input_raw, dict):
    tool_input_str = json.dumps(tool_input_raw, ensure_ascii=False)
    tool_input = redact_pii(tool_input_str[:2000])
elif isinstance(tool_input_raw, str):
    tool_input = redact_pii(tool_input_raw[:2000])
else:
    tool_input = ""

# file_path 추출
file_path = ""
if isinstance(tool_input_raw, dict):
    file_path = (
        tool_input_raw.get("file_path", "") or
        tool_input_raw.get("path", "") or
        ""
    )
    if not file_path and tool_input_raw.get("command"):
        file_path = tool_input_raw["command"][:200]

# content 처리 (prompt) + PII 필터링 + 1000자 제한
content = ""
if data.get("prompt"):
    content_raw = str(data["prompt"])
    content = redact_pii(content_raw[:1000])

payload = {
    "event_type": event_type,
    "user_id": user_id,
    "project_id": project_id,
    "session_id": session_id,
    "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z",
}
if tool_name:
    payload["tool_name"] = tool_name
if tool_input:
    payload["tool_input"] = tool_input
if file_path:
    payload["file_path"] = str(file_path)[:500]
if content:
    payload["content"] = content

body = json.dumps(payload).encode()
req = urllib.request.Request(
    f"{event_log_url}/api/record",
    data=body,
    headers={"Content-Type": "application/json", "User-Agent": "ouroboros-sync/1.0"},
    method="POST"
)
try:
    urllib.request.urlopen(req, timeout=2)
except Exception as e:
    # 에러 로그 최근 10건 보존
    try:
        log_file = "/tmp/.claude-event-errors.log"
        msg = f"{datetime.now().isoformat()} {event_type} {str(e)[:100]}\n"
        with open(log_file, "a") as f:
            f.write(msg)
        # 10건 초과 시 truncate
        with open(log_file, "r") as f:
            lines = f.readlines()
        if len(lines) > 10:
            with open(log_file, "w") as f:
                f.writelines(lines[-10:])
    except Exception:
        pass
finally:
    # 임시 파일 정리
    try:
        script_path = os.environ.get("PYSCRIPT_PATH", "")
        if script_path and os.path.exists(script_path):
            os.unlink(script_path)
    except Exception:
        pass
PYEOF

# 비동기 전송 (백그라운드 + timeout)
# 변수를 환경변수로 전달 (인젝션 방지)
EVENT_TYPE_ENV="$EVENT_TYPE" \
USER_ID_ENV="$USER_ID" \
PROJECT_ID_ENV="$PROJECT_ID_VAL" \
EVENT_LOG_URL_ENV="$EVENT_LOG_URL" \
PYSCRIPT_PATH="$PYSCRIPT" \
echo "$STDIN_RAW" | python3 "$PYSCRIPT" 2>/dev/null &

exit 0
