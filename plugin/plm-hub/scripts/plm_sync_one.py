#!/usr/bin/env python3
"""변경된 기획 아티팩트 .md 1개를 PLM에 upsert (POST /import).

frontmatter(id·type·status·owner-relations) + 본문을 읽어 단건 import.
관계는 frontmatter의 owner(작성) 관계만(SSOT). 무효 관계는 서버가 skip.
graceful: 실패해도 종료코드 0 (hook 비차단). 한 줄 결과 출력.

env: PLM_API_URL · PLM_API_TOKEN · PLM_PROJECT
인자: --file <path>
"""
import json
import os
import re
import subprocess
import sys
import urllib.request

REL_KEYS = ["derives_from", "elaborates", "refs", "realizes", "informs",
            "supersedes", "covers", "part_of", "instance_of"]


def git_branch(path):
    """파일이 속한 git repo의 현재 브랜치 → PLM branch(브랜치별 문서 격리, SRS-019).
    PLM_BRANCH env가 있으면 우선. detached/오류는 main."""
    env = os.environ.get("PLM_BRANCH")
    if env:
        return env
    try:
        d = os.path.dirname(os.path.abspath(path))
        out = subprocess.run(["git", "-C", d, "rev-parse", "--abbrev-ref", "HEAD"],
                             capture_output=True, text=True, timeout=3)
        b = out.stdout.strip()
        return b if b and b != "HEAD" else "main"
    except Exception:
        return "main"


def _unquote(s):
    # frontmatter 스칼라/리스트원소의 둘러싼 따옴표 제거 (platform-build A1 — ADR-005).
    # 미제거 시 PLM code가 "RM-001"(따옴표 포함)로 오염돼 관계 dst(무따옴표)와 불일치.
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
        return s[1:-1].strip()
    return s


def parse_md(text):
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if not m:
        return {}, text
    fm = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        # 인라인 주석(# ...) 제거 — 단 따옴표 안의 #는 보존하지 않음(frontmatter 단순 규약)
        k, v = k.strip(), v.strip()
        if v.startswith("[") and v.endswith("]"):
            fm[k] = [_unquote(x) for x in v[1:-1].split(",") if x.strip()]
        else:
            fm[k] = _unquote(v)
    return fm, m.group(2)


def main():
    args = sys.argv
    path = args[args.index("--file") + 1] if "--file" in args else None
    api = os.environ.get("PLM_API_URL", "").rstrip("/")
    token = os.environ.get("PLM_API_TOKEN", "")
    project = os.environ.get("PLM_PROJECT", "")
    if not (path and api and project) or not os.path.exists(path):
        return
    try:
        fm, body = parse_md(open(path, encoding="utf-8").read())
    except Exception:
        return
    code = fm.get("id")
    if not code or "type" not in fm:
        return
    artifact = {
        "code": code, "type": fm["type"], "title": fm.get("title", code),
        "status": fm.get("status", "Draft"),
        "granularity": fm.get("granularity"), "build_state": fm.get("build_state"),
        "body": body.strip("\n"),
        "branch": git_branch(path),  # 현재 git branch → PLM branch (브랜치별 격리)
    }
    relations = [{"src": code, "rel": rk, "dst": dst}
                 for rk in REL_KEYS for dst in (fm.get(rk) or [])]
    payload = json.dumps({"project": project, "artifacts": [artifact], "relations": relations}).encode()
    req = urllib.request.Request(f"{api}/import", data=payload, method="POST")
    req.add_header("content-type", "application/json")
    req.add_header("authorization", f"Bearer {token}")
    req.add_header("user-agent", "plm-hook/1.0")  # Cloudflare가 python-urllib UA 차단 → 명시
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            s = json.loads(r.read().decode())
        skipped = s.get('relations_skipped', 0)
        msg = f"[plm-sync] {code} → PLM (생성 {s.get('created',0)}·수정 {s.get('updated',0)}·관계+{s.get('relations_added',0)})"
        if skipped:  # A3: 관계 silent skip 표면화 — dst 미존재 시 2-pass 재동기 필요
            msg += f" ⚠ 관계 {skipped}건 skip(dst 미존재 — 일괄 2-pass 동기 또는 dst 선동기)"
        print(msg)
    except Exception as e:
        print(f"[plm-sync] {code} 동기 실패(비차단): {str(e)[:60]}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
