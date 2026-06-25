#!/usr/bin/env python3
"""spec-S — PLM-Hub .md ↔ DB 양방향 동기 CLI.

export: DB → docs/{category}/{CODE}.md (frontmatter + 본문). 콘텐츠 해시 스냅샷 기록.
import: docs/*.md → POST /import (upsert, 관계 추가). 충돌(로컬·DB 양쪽 변경) 해시 비교로 경고.

사용:
  python3 sync.py export --project plm
  python3 sync.py import --project plm [--force]
환경: PLM_API_URL(기본 http://localhost:16780) · PLM_TOKEN(기본 plmhub-dev-token, import에 writer 필요)
"""
import argparse
import hashlib
import json
import os
import re
import sys
import urllib.request

API = os.environ.get("PLM_API_URL", "http://localhost:16780")
TOKEN = os.environ.get("PLM_TOKEN", "plmhub-dev-token")
DOCS = os.environ.get("PLM_DOCS_DIR", ".ouroboros/docs")
STATE = ".sync_state_md.json"

CATEGORY = {  # type → 디렉토리
    "URS": "requirements", "UCS": "requirements", "SRS": "requirements",
    "SAD": "design", "ADR": "decisions", "Roadmap": "roadmap", "Code": "code",
}


def http(method, path, body=None):
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("content-type", "application/json")
    req.add_header("user-agent", "plm-sync/1.0")  # Cloudflare가 python-urllib 기본 UA 차단(403) → 명시
    if method != "GET":
        req.add_header("authorization", f"Bearer {TOKEN}")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())


def content_hash(a, out_rels):
    h = hashlib.sha256()
    h.update(json.dumps([a["title"], a["body"], a["status"], a.get("granularity"),
                         a.get("build_state"), sorted(out_rels)], ensure_ascii=False).encode())
    return h.hexdigest()[:16]


def fm_value(v):
    if isinstance(v, list):
        return "[" + ", ".join(v) + "]"
    return str(v)


def write_md(path, fm, body):
    lines = ["---"]
    for k, v in fm.items():
        if v is None or v == [] or v == "":
            continue
        lines.append(f"{k}: {fm_value(v)}")
    lines.append("---\n")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + (body or "") + "\n")


def _unquote(s):
    # 둘러싼 따옴표 제거 (platform-build A1 — ADR-005)
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
        k, v = k.strip(), v.strip()
        if v.startswith("[") and v.endswith("]"):
            fm[k] = [_unquote(x) for x in v[1:-1].split(",") if x.strip()]
        else:
            fm[k] = _unquote(v)
    return fm, m.group(2)


REL_KEYS = ["derives_from", "elaborates", "refs", "realizes", "informs",
            "supersedes", "covers", "part_of", "instance_of"]


def do_export(project):
    d = http("GET", f"/export?project={project}")
    arts, rels = d["artifacts"], d["relations"]
    # 아티팩트별 outgoing 관계 (frontmatter = owner/작성 관계).
    out = {}
    for r in rels:
        out.setdefault(r["src"], {}).setdefault(r["rel"], []).append(r["dst"])
    state = {}
    for a in arts:
        cat = CATEGORY.get(a["type"], "misc")
        rels_for = out.get(a["code"], {})
        flat = [f"{k}:{v}" for k, vs in rels_for.items() for v in vs]
        fm = {"id": a["code"], "type": a["type"], "status": a["status"]}
        if a.get("granularity"):
            fm["granularity"] = a["granularity"]
        if a.get("build_state"):
            fm["build_state"] = a["build_state"]
        fm["title"] = a["title"]
        for rk in REL_KEYS:
            if rk in rels_for:
                fm[rk] = rels_for[rk]
        path = os.path.join(DOCS, cat, f"{a['code'].replace('::', '__')}.md")
        write_md(path, fm, a["body"])
        state[a["code"]] = {"path": path, "file": file_hash(path), "db": content_hash(a, flat)}
    json.dump(state, open(STATE, "w"), ensure_ascii=False, indent=2)
    print(f"export: {len(arts)} artifacts → {DOCS}/  ({len(rels)} relations) · 스냅샷 {STATE}")


def file_hash(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()[:16] if os.path.exists(path) else ""


def do_import(project, force):
    state = json.load(open(STATE)) if os.path.exists(STATE) else {}
    # DB 현재 상태(충돌 감지용).
    db = {a["code"]: a for a in http("GET", f"/export?project={project}")["artifacts"]}
    db_rels = http("GET", f"/export?project={project}")["relations"]
    db_out = {}
    for r in db_rels:
        db_out.setdefault(r["src"], {}).setdefault(r["rel"], []).append(r["dst"])

    artifacts, relations, conflicts = [], [], []
    for root, _, files in os.walk(DOCS):
        for fn in files:
            if not fn.endswith(".md") or fn.startswith("_"):
                continue
            path = os.path.join(root, fn)
            fm, body = parse_md(open(path, encoding="utf-8").read())
            code = fm.get("id")
            if not code or "type" not in fm:
                continue
            # 충돌: 로컬 파일 변경 ∩ DB 변경 (export 이후 둘 다 바뀜).
            snap = state.get(code)
            if snap and code in db:
                local_changed = file_hash(path) != snap["file"]
                flat = [f"{k}:{v}" for k in REL_KEYS for v in db_out.get(code, {}).get(k, [])]
                db_changed = content_hash(db[code], flat) != snap["db"]
                if local_changed and db_changed:
                    conflicts.append(code)
            artifacts.append({
                "code": code, "type": fm["type"], "title": fm.get("title", code),
                "status": fm.get("status", "Draft"),
                "granularity": fm.get("granularity"), "build_state": fm.get("build_state"),
                "body": body.strip("\n"),
            })
            for rk in REL_KEYS:
                for dst in (fm.get(rk) or []):
                    relations.append({"src": code, "rel": rk, "dst": dst})

    if conflicts and not force:
        print("⚠ 충돌(로컬·DB 양쪽 변경):", ", ".join(conflicts))
        print("  로컬(.md)을 권위로 덮어쓰려면 --force, 아니면 먼저 export로 DB 변경을 받으세요.")
        sys.exit(2)

    summary = http("POST", "/import", {"project": project, "artifacts": artifacts, "relations": relations})
    print(f"import: {summary}  (충돌 {len(conflicts)}{' · --force 덮어씀' if force and conflicts else ''})")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="PLM-Hub .md ↔ DB 동기 (spec-S)")
    sub = p.add_subparsers(dest="cmd", required=True)
    for c in ("export", "import"):
        sp = sub.add_parser(c)
        sp.add_argument("--project", required=True)
        if c == "import":
            sp.add_argument("--force", action="store_true", help="충돌 시 로컬(.md) 권위로 덮어쓰기")
    args = p.parse_args()
    if args.cmd == "export":
        do_export(args.project)
    else:
        do_import(args.project, args.force)
