#!/usr/bin/env python3
"""셀프 PLM 쓰기 토큰 발급 → .env 자동 기입 (plm-hub:link Step에서 호출).

원리: 사용자가 이미 승인한 Claude MCP OAuth(JWT, ~/.claude/.credentials.json)를 재사용해
PLM `POST /tokens`(OIDC 전용)를 호출 → 본인 realm 역할(없으면 editor)로 발급된 토큰을
`.ouroboros/env/.env`의 PLM_API_TOKEN에 기입. 평문 토큰은 서버가 1회만 반환(해시 저장).

사용: python3 plm_token_issue.py [--force]   (기본: PLM_API_TOKEN이 비어있을 때만 발급)
graceful: 실패해도 비파괴 — 안내만 출력하고 exit 0 (수동 발급 경로 안내).
"""
import json, os, re, sys, urllib.error, urllib.request

UA = {"User-Agent": "plm-hub-token-issue/1.0", "Content-Type": "application/json"}
ROOT = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
ENV_PATH = os.path.join(ROOT, ".ouroboros", "env", ".env")
PLM_JSON = os.path.join(ROOT, ".ouroboros", "config", "plm.json")
CREDS = os.path.expanduser("~/.claude/.credentials.json")


def out(msg: str) -> None:
    print(msg)


def read_env_token() -> str:
    try:
        for line in open(ENV_PATH, encoding="utf-8"):
            m = re.match(r"^PLM_API_TOKEN=(.*)$", line.strip())
            if m:
                return m.group(1).strip()
    except OSError:
        pass
    return ""


def write_env_token(token: str) -> None:
    os.makedirs(os.path.dirname(ENV_PATH), exist_ok=True)
    lines, found = [], False
    if os.path.exists(ENV_PATH):
        for line in open(ENV_PATH, encoding="utf-8"):
            if re.match(r"^PLM_API_TOKEN=", line.strip()):
                lines.append(f"PLM_API_TOKEN={token}\n")
                found = True
            else:
                lines.append(line)
    if not found:
        lines.append(f"PLM_API_TOKEN={token}\n")
    open(ENV_PATH, "w", encoding="utf-8").write("".join(lines))


def main() -> int:
    force = "--force" in sys.argv
    cur = read_env_token()
    if cur and not cur.startswith("plmhub-xxxx") and not force:
        out(f"[OK] PLM_API_TOKEN 이미 설정됨 — 유지. (재발급: --force)")
        return 0
    try:
        cfg = json.load(open(PLM_JSON, encoding="utf-8"))
        api_url = cfg["api_url"].rstrip("/")
    except Exception:
        out("[skip] .ouroboros/config/plm.json 없음 — 먼저 plm-hub:link 로 바인딩하세요.")
        return 0
    # Claude MCP OAuth JWT 탐색 (사용자가 /mcp에서 이미 승인한 토큰 재사용)
    jwt = ""
    try:
        creds = json.load(open(CREDS, encoding="utf-8"))
        want = api_url + "/mcp"
        for v in creds.get("mcpOAuth", {}).values():
            if v.get("serverUrl") == want and v.get("accessToken"):
                jwt = v["accessToken"]
                break
    except Exception:
        pass
    if not jwt:
        out(f"[skip] {api_url}/mcp 의 Claude OAuth 토큰 없음 — Claude에서 `/mcp → plm → Authenticate` 후 재실행.")
        out(f"       (또는 대시보드 로그인 후 수동 발급: curl -X POST {api_url}/tokens -H 'Authorization: Bearer <SSO JWT>')")
        return 0
    req = urllib.request.Request(f"{api_url}/tokens", data=b"{}", method="POST",
                                 headers={**UA, "Authorization": f"Bearer {jwt}"})
    try:
        r = json.loads(urllib.request.urlopen(req, timeout=12).read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        out(f"[fail] POST /tokens HTTP {e.code}: {body}")
        out("       SSO 토큰 만료면 Claude에서 plm 재인증 후 다시 실행하세요.")
        return 0
    except Exception as e:
        out(f"[fail] POST /tokens: {e}")
        return 0
    token = r.get("token", "")
    if not token:
        out(f"[fail] 응답에 token 없음: {json.dumps(r)[:200]}")
        return 0
    write_env_token(token)
    # 검증: /me
    try:
        req2 = urllib.request.Request(f"{api_url}/me", headers={**UA, "Authorization": f"Bearer {token}"})
        me = json.loads(urllib.request.urlopen(req2, timeout=8).read())
        out(f"[OK] PLM 쓰기 토큰 발급·기입 완료 — user={me.get('id')} role={me.get('role')} → {ENV_PATH}")
    except Exception:
        out(f"[OK] 토큰 기입 완료(검증 호출 실패 — 네트워크 확인) → {ENV_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
