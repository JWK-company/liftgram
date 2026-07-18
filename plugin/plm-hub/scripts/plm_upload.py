#!/usr/bin/env python3
"""로컬 파일(스크린샷·GIF·PDF·데이터 등)을 PLM 대시보드 스토리지(MinIO)에 업로드한다.

Claude Code(CLI)가 작업 중 필요한 증거·분석 자료를 아티팩트 본문에 임베드할 때 사용.
업로드 → 대시보드 /api/upload(MinIO) → { key, mime, isImage } → 삽입용 doc 노드 JSON 출력.
  · 이미지(png/jpeg/gif/webp/svg/avif) → image 노드 {"type":"image","attrs":{"src":"/api/files/<key>",...}}
  · 그 외(pdf·문서 등)         → file  노드 {"type":"file","attrs":{"key":"<key>",...}}
반환된 노드를 편집 중인 아티팩트 .json 의 doc.content 에 삽입하면 plm-sync 가 동기한다.

원칙: **필요한 자료만** 업로드(불필요한 파일 금지). 서빙은 대시보드 /api/files/<key>.

env(우선순위: 환경변수 > .ouroboros/env/.env):
  PLM_API_TOKEN (필수) · PLM_DASH_URL (대시보드 base; 없으면 PLM_API_URL host 의 plm.→plm-dash. 로 유도)

사용:  python3 plm_upload.py <file> [file2 ...]
       python3 plm_upload.py --json <file>     # 노드 JSON 만 출력(파이프용)
한도: 25MB / 파일. 지원 외 타입은 서버가 415 로 거부.
"""
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
import uuid

TIMEOUT = 30


def _find_env():
    """cwd 에서 위로 올라가며 .ouroboros/env/.env 탐색."""
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
    """환경변수 우선, 없으면 .ouroboros/env/.env 파싱. config/plm.json 에서 api_url 보강."""
    env = {k: os.environ.get(k, "") for k in ("PLM_API_TOKEN", "PLM_DASH_URL", "PLM_API_URL")}
    envf, root = _find_env()
    if envf:
        try:
            for line in open(envf, encoding="utf-8"):
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k in env and not env[k]:
                    env[k] = v
        except OSError:
            pass
    # api_url·project 보강: config/plm.json (project는 SRS-030 파일 레지스트리 등록용)
    env.setdefault("PLM_PROJECT", os.environ.get("PLM_PROJECT", ""))
    if root:
        cfg = os.path.join(root, ".ouroboros", "config", "plm.json")
        if os.path.isfile(cfg):
            try:
                j = json.load(open(cfg, encoding="utf-8"))
                if not env["PLM_API_URL"]:
                    env["PLM_API_URL"] = (j.get("api_url") or "").strip()
                if not env["PLM_PROJECT"]:
                    env["PLM_PROJECT"] = (j.get("project") or "").strip()
            except (OSError, ValueError):
                pass
    return env


def _dash_url(env):
    """대시보드 base URL. PLM_DASH_URL 우선, 없으면 PLM_API_URL host 의 첫 'plm.'→'plm-dash.'."""
    d = (env.get("PLM_DASH_URL") or "").rstrip("/")
    if d:
        return d
    api = (env.get("PLM_API_URL") or "").rstrip("/")
    if api and "plm." in api:
        # https://jwk-plm.shoi.ch → https://jwk-plm-dash.shoi.ch · https://plm.jungmin.kim → https://plm-dash.jungmin.kim
        return api.replace("plm.", "plm-dash.", 1)
    return ""


def _multipart(field, filename, data, mime, extra=None):
    """extra: 텍스트 필드 dict(예: project — SRS-030 레지스트리 등록)."""
    boundary = "----plmupload" + uuid.uuid4().hex
    parts = []
    for k, v in (extra or {}).items():
        parts.append(
            (f"--{boundary}\r\n" f'Content-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n').encode("utf-8")
        )
    parts.append(
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
            f"Content-Type: {mime}\r\n\r\n"
        ).encode("utf-8")
    )
    parts.append(data)
    parts.append(f"\r\n--{boundary}--\r\n".encode("utf-8"))
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def upload_one(path, dash, token, project=""):
    if not os.path.isfile(path):
        return None, f"파일 없음: {path}"
    data = open(path, "rb").read()
    if len(data) > 25 * 1024 * 1024:
        return None, f"25MB 초과({len(data)//1024//1024}MB): {path}"
    name = os.path.basename(path)
    mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
    body, ctype = _multipart("file", name, data, mime, extra={"project": project} if project else None)
    req = urllib.request.Request(f"{dash}/api/upload", data=body, method="POST")
    req.add_header("content-type", ctype)
    req.add_header("authorization", f"Bearer {token}")
    req.add_header("user-agent", "mozilla/5.0")  # Cloudflare 가 python-urllib UA 차단 → 명시
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            j = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:200]
        hint = {413: "25MB 초과", 415: "미지원 타입", 401: "authorization 헤더/토큰 확인"}.get(e.code, "")
        return None, f"HTTP {e.code} {hint}: {detail}"
    except urllib.error.URLError as e:
        return None, f"네트워크: {e.reason} ({dash})"
    key = j.get("key", "")
    if project and not j.get("registered"):
        sys.stderr.write(f"[warn] 레지스트리 미등록({j.get('registerError','?')}) — file_get 사용 불가: {key}\n")
    if j.get("isImage"):
        node = {"type": "image", "attrs": {"src": f"/api/files/{key}", "alt": j.get("name", name)}}
    else:
        node = {"type": "file", "attrs": {"key": key, "name": j.get("name", name),
                                          "mime": j.get("mime", mime), "size": j.get("size", len(data))}}
    return {"key": key, "mime": j.get("mime", mime), "isImage": bool(j.get("isImage")),
            "size": j.get("size", len(data)), "node": node}, None


def main():
    args = [a for a in sys.argv[1:] if a != "--json"]
    json_only = "--json" in sys.argv[1:]
    if not args:
        print((__doc__ or "").split("사용:")[0].strip())
        print("\n사용: python3 plm_upload.py <file> [file2 ...]  (--json: 노드 JSON만)")
        sys.exit(0)
    env = _load_env()
    token = env.get("PLM_API_TOKEN", "")
    dash = _dash_url(env)
    if not token:
        sys.stderr.write("[error] PLM_API_TOKEN 없음 — .ouroboros/env/.env 확인(/plm-hub:link 로 발급).\n")
        sys.exit(1)
    if not dash:
        sys.stderr.write("[error] 대시보드 URL 미확인 — .env 의 PLM_DASH_URL 또는 PLM_API_URL 설정.\n")
        sys.exit(1)
    project = env.get("PLM_PROJECT", "")
    if not project:
        sys.stderr.write("[warn] project 미확인(plm.json) — 파일 레지스트리 미등록(file_get 사용 불가, 임베드는 정상).\n")
    nodes, rc = [], 0
    for path in args:
        res, err = upload_one(path, dash, token, project)
        if err or res is None:
            sys.stderr.write(f"[fail] {path}: {err or 'unknown'}\n")
            rc = 1
            continue
        nodes.append(res["node"])
        if not json_only:
            kind = "image" if res["isImage"] else "file"
            sys.stderr.write(f"[ok] {os.path.basename(path)} → {kind} 노드 (key={res['key']}, {res['mime']}, {res['size']}B)\n")
    # stdout: 삽입용 노드 JSON (여러 개면 배열, 하나면 단일 객체)
    if nodes:
        print(json.dumps(nodes[0] if len(nodes) == 1 else nodes, ensure_ascii=False))
    sys.exit(rc)


if __name__ == "__main__":
    main()
