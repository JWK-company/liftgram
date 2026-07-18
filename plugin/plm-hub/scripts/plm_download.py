#!/usr/bin/env python3
"""PLM 첨부 파일 다운로드 (SRS-030 file_get 2단 계약의 2단 — plm_upload.py 페어).

문서 file/image 노드의 key(또는 메신저 첨부 key)로 파일을 로컬에 저장한다.
흐름: GET {PLM_API}/files/<key>/url (Bearer, 멤버 View 가드) → 단기 서명 URL 수신 → 다운로드.

사용:  python3 plm_download.py <key> [--out <path|dir>]
env:   PLM_API_TOKEN(필수) · PLM_API_URL(없으면 config/plm.json)

안전 규약: 저장만 한다 — HTML 등 문서형 파일을 자동 실행·열기하지 않는다(내용 분석은 텍스트로).
미등록 키는 404(레거시 업로드 — 재업로드 필요, SRS-030 백필 정책).
"""
import json
import os
import sys
import urllib.error
import urllib.request

TIMEOUT = 60


def _find_env():
    d = os.getcwd()
    for _ in range(8):
        p = os.path.join(d, ".ouroboros", "env", ".env")
        if os.path.isfile(p):
            return p, d
        nd = os.path.dirname(d)
        if nd == d:
            break
        d = nd
    return None, None


def _load_env():
    env = {k: os.environ.get(k, "") for k in ("PLM_API_TOKEN", "PLM_API_URL")}
    envf, root = _find_env()
    if envf:
        try:
            for line in open(envf, encoding="utf-8"):
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip().strip("'\"")
                    if k in env and not env[k]:
                        env[k] = v
        except OSError:
            pass
    if not env["PLM_API_URL"] and root:
        cfg = os.path.join(root, ".ouroboros", "config", "plm.json")
        if os.path.isfile(cfg):
            try:
                env["PLM_API_URL"] = (json.load(open(cfg, encoding="utf-8")).get("api_url") or "").strip()
            except (OSError, ValueError):
                pass
    return env


def main():
    args = sys.argv[1:]
    out = None
    if "--out" in args:
        i = args.index("--out")
        out = args[i + 1] if i + 1 < len(args) else None
        del args[i : i + 2]
    if len(args) != 1:
        print((__doc__ or "").strip())
        sys.exit(0 if not args else 1)
    key = args[0].strip()

    env = _load_env()
    token, api = env["PLM_API_TOKEN"], (env["PLM_API_URL"] or "").rstrip("/")
    if not token or not api:
        sys.stderr.write("[error] PLM_API_TOKEN/PLM_API_URL 없음 — .ouroboros/env/.env·config/plm.json 확인.\n")
        sys.exit(1)

    # 1단: 서명 URL 발급 (멤버 인가는 서버가 레지스트리 기반으로 판정)
    req = urllib.request.Request(f"{api}/files/{key}/url")
    req.add_header("authorization", f"Bearer {token}")
    req.add_header("user-agent", "plm-download/1.0")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            meta = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        hint = {404: "미등록/없는 키(레거시는 재업로드)", 403: "프로젝트 멤버 아님", 401: "토큰 확인"}.get(e.code, "")
        sys.stderr.write(f"[error] 서명 URL 발급 실패 HTTP {e.code} {hint}\n")
        sys.exit(1)

    # 2단: 서명 URL로 본체 다운로드
    name = meta.get("name") or key
    dest = out or name
    if os.path.isdir(dest):
        dest = os.path.join(dest, name)
    dreq = urllib.request.Request(meta["url"])
    dreq.add_header("user-agent", "plm-download/1.0")
    try:
        with urllib.request.urlopen(dreq, timeout=TIMEOUT) as r, open(dest, "wb") as f:
            while True:
                chunk = r.read(1 << 16)
                if not chunk:
                    break
                f.write(chunk)
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"[error] 다운로드 실패 HTTP {e.code} (서명 만료 시 재시도)\n")
        sys.exit(1)

    size = os.path.getsize(dest)
    sys.stderr.write(f"[ok] {key} → {dest} ({meta.get('mime','?')}, {size}B, project={meta.get('project','?')})\n")
    print(os.path.abspath(dest))


if __name__ == "__main__":
    main()
