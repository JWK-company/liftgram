#!/usr/bin/env python3
"""spec-S — PLM-Hub 로컬 ↔ DB 양방향 동기 CLI (ADR-019 동형 JSON 우선).

export: DB → docs/{category}/{CODE}.md (frontmatter + 본문, 레거시). 콘텐츠 해시 스냅샷 기록.
import: docs/*.json(canonical, doc 포함) + docs/*.md(레거시) → POST /import + PUT /doc (upsert, 관계 추가).
        충돌(로컬·DB 양쪽 변경) 해시 비교로 경고.

사용:
  python3 sync_bulk.py export --project plm
  python3 sync_bulk.py import --project plm [--force]
환경: PLM_API_URL(기본 https://jwk-plm.shoi.ch) · PLM_API_TOKEN(import에 writer 필요, `/plm-hub:link`가 자동 발급)
"""
import argparse
import hashlib
import json
import os
import re
import sys
import urllib.request

API = os.environ.get("PLM_API_URL", "https://jwk-plm.shoi.ch")
# 스택 전반이 PLM_API_TOKEN을 씀(link가 자동 발급). PLM_TOKEN은 구 호환 폴백.
TOKEN = os.environ.get("PLM_API_TOKEN") or os.environ.get("PLM_TOKEN", "plmhub-dev-token")
DOCS = os.environ.get("PLM_DOCS_DIR", ".ouroboros/docs")
STATE = ".sync_state_md.json"

CATEGORY = {  # type → 디렉토리
    "URS": "requirements", "UCS": "requirements", "SRS": "requirements",
    "SAD": "design", "ADR": "decisions", "Roadmap": "roadmap", "Code": "code",
    "PRD": "product",  # PRD는 미추적(관계·게이트·trace 없음)이나 대시보드 표시 위해 동기(BS와 동일 취급)
    "BS": "product",   # P0-3: BS 누락 잠복 버그 수정 — bulk 동기·pull 정위치(product/)
    "Business": "product",  # ADR-027: 시장·경쟁·수익화 통합 조사(BIZ-00N — 구 Report 리네임)
    "Report": "product",  # (레거시 → Business — 구 파일 하위호환)
    "MR": "product",   # MR(시장조사)는 비추적 싱글턴이나 대시보드 표시 위해 동기(PRD와 동일 취급)
    "CA": "product",   # CA(경쟁조사)는 비추적 싱글턴이나 대시보드 표시 위해 동기(PRD와 동일 취급)
}


def http(method, path, body=None):
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("content-type", "application/json")
    req.add_header("user-agent", "plm-sync/1.0")  # Cloudflare가 python-urllib 기본 UA 차단(403) → 명시
    # 인증: 서버가 읽기(GET /export 등)도 인증 요구 → 모든 메서드에 토큰 첨부(과거 GET 무인증 가정은 401 유발).
    if TOKEN:
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


def parse_json(text):
    """ADR-019 동형: CODE.json(래퍼 + doc) → (fields, rel_map, doc). plm_sync_one.parse_json과 동일 규약.
    relations는 래퍼의 `relations` 객체(키→리스트/문자열). doc은 ProseMirror JSON(canonical)."""
    obj = json.loads(text)
    rel = obj.get("relations") or {}
    norm = {}
    for k, v in rel.items():
        if v is None:
            continue
        norm[k] = v if isinstance(v, list) else [v]
    return obj, norm, obj.get("doc")


REL_KEYS = ["derives_from", "elaborates", "refs", "realizes", "informs",
            "supersedes", "covers", "part_of", "instance_of", "relates_to", "targets", "generated_from"]


def do_export(project):
    """PLM → 로컬 CODE.json (ADR-019 canonical). 래퍼(메타)+relations(owner)+doc(본문 fetch)."""
    from urllib.parse import quote
    d = http("GET", f"/export?project={project}")
    arts, rels = d["artifacts"], d["relations"]
    # 아티팩트별 outgoing 관계 (owner/작성 방향만).
    out = {}
    for r in rels:
        out.setdefault(r["src"], {}).setdefault(r["rel"], []).append(r["dst"])
    state = {}
    for a in arts:
        cat = CATEGORY.get(a["type"], "misc")
        rels_for = out.get(a["code"], {})
        flat = [f"{k}:{v}" for k, vs in rels_for.items() for v in vs]
        # ADR-019 동형 래퍼
        wrapper = {"schemaVersion": 1, "id": a["code"], "type": a["type"],
                   "title": a["title"], "status": a["status"]}
        if a.get("granularity"):
            wrapper["granularity"] = a["granularity"]
        if a.get("build_state"):
            wrapper["build_state"] = a["build_state"]
        relations = {rk: rels_for[rk] for rk in REL_KEYS if rk in rels_for}
        if relations:
            wrapper["relations"] = relations
        # canonical 본문 doc fetch (실패 시 doc 생략 — 비차단)
        try:
            doc = http("GET", f"/artifacts/{quote(project)}/{quote(a['code'])}/doc").get("doc")
            if doc is not None:
                wrapper["doc"] = doc
        except Exception:
            pass
        code_fs = a["code"].replace("::", "__")
        path = os.path.join(DOCS, cat, f"{code_fs}.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(wrapper, f, ensure_ascii=False, indent=2)
            f.write("\n")
        # 레거시 .md 잔재 제거(같은 code의 .json·.md 중복 방지)
        legacy = os.path.join(DOCS, cat, f"{code_fs}.md")
        if os.path.exists(legacy):
            try:
                os.remove(legacy)
            except Exception:
                pass
        state[a["code"]] = {"path": path, "file": file_hash(path), "db": content_hash(a, flat)}
    json.dump(state, open(STATE, "w"), ensure_ascii=False, indent=2)
    print(f"export: {len(arts)} artifacts → {DOCS}/ (.json canonical, {len(rels)} relations) · 스냅샷 {STATE}")


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

    # ADR-019 동형: .json(canonical) 우선, .md는 이행기 레거시. doc_map=code→doc(import 후 PUT /doc).
    artifacts, relations, conflicts, doc_map, schema_map = [], [], [], {}, {}
    for root, _, files in os.walk(DOCS):
        for fn in files:
            if fn.startswith("_") or not (fn.endswith(".json") or fn.endswith(".md")):
                continue
            path = os.path.join(root, fn)
            raw = open(path, encoding="utf-8").read()
            doc = None
            if fn.endswith(".json"):
                try:
                    fm, rel_map, doc = parse_json(raw)   # ADR-019 동형 JSON
                except Exception:
                    continue
                body = ""                                 # canonical=doc, body 미사용
            else:
                fm, body = parse_md(raw)                  # 레거시 .md
                rel_map = {rk: (fm.get(rk) or []) for rk in REL_KEYS}
            code = fm.get("id")
            if not code or "type" not in fm:
                continue
            # 스킵: CATEGORY에 없는 타입(Research 등 서버 미수용)·sync:false 본문(민감).
            # PRD는 미추적 싱글턴이나 대시보드 표시 위해 CATEGORY(product)에 포함 — 동기됨(BS와 동일).
            if fm["type"] not in CATEGORY or str(fm.get("sync")).lower() == "false":
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
                "kind": fm.get("kind"),
                "tags": fm.get("tags") or [],
                "body": body.strip("\n") if isinstance(body, str) else "",
                "doc": doc,                               # ADR-019: 동형 doc JSON(서버 /import 수용)
                "comments": fm.get("comments"),           # #5: 댓글/토의 → 서버 replace-all(None=미변경)
            })
            if doc is not None:
                doc_map[code] = doc
                schema_map[code] = int(float(fm.get("schemaVersion", 1) or 1))  # i32 강제(1.0 등 float/문자 방어)
            for rk in REL_KEYS:
                for dst in (rel_map.get(rk) or []):
                    relations.append({"src": code, "rel": rk, "dst": dst})

    if conflicts and not force:
        print("⚠ 충돌(로컬·DB 양쪽 변경):", ", ".join(conflicts))
        print("  로컬을 권위로 덮어쓰려면 --force, 아니면 먼저 export로 DB 변경을 받으세요.")
        sys.exit(2)

    summary = http("POST", "/import", {"project": project, "artifacts": artifacts, "relations": relations})
    # ADR-019 동형: import(메타+관계) 후 doc JSON을 N5 엔드포인트(PUT /doc)로 저장(canonical 본문).
    from urllib.parse import quote
    doc_ok = 0
    for code, doc in doc_map.items():
        try:
            http("PUT", f"/artifacts/{quote(project)}/{quote(code)}/doc",
                 {"doc": doc, "schema_version": schema_map.get(code, 1)})
            doc_ok += 1
        except Exception as e:
            print(f"  ⚠ {code} doc 저장 실패: {str(e)[:50]}")
    print(f"import: {summary}  (충돌 {len(conflicts)}{' · --force 덮어씀' if force and conflicts else ''} · doc {doc_ok}/{len(doc_map)})")


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
