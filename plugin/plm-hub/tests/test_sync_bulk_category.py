#!/usr/bin/env python3
"""sync_bulk 타입→디렉터리 매핑 회귀 테스트 (감사 H-4 — Wireframe 왕복 불가).

결함: `CATEGORY` 에 `Wireframe` 이 없었다. 결과는 **양방향 모두 조용한 유실**이었다.
  · export: `CATEGORY.get(type, "misc")` 폴백이 걸려 PLM 의 WF 가 `.ouroboros/docs/misc/WF-*.json`
            이라는 아무도 안 보는 자리에 떨어졌다(정작 SSOT 인 `docs/wireframes/` 는 그대로).
  · import: `if fm["type"] not in CATEGORY: continue` 로 `docs/wireframes/WF-*.json` 이 **통째로 스킵**.
  → 로컬↔PLM 어느 쪽으로도 돌아오지 않는다. 게다가 실패가 조용해서 "불일치 0" 으로 집계됐다.

매핑을 여는 순간 함께 열리는 구멍도 이 파일이 함께 고정한다(감사 W11):
  `os.walk` 가 하위 디렉터리를 전부 걷기 때문에 **사본 작업 스테이징**
  (`docs/wireframes/.working/<사본페이지>/WF-*.json`) 까지 import 대상이 된다 —
  승격 없이 사본 명세가 PLM 정본 본문으로 올라가는 경로다. 점/밑줄 디렉터리는 걷지 않는다.

네트워크 없음 — `http()` 전부 스텁. 라이브 PLM 무접촉.
"""
import importlib.util
import io
import contextlib
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "scripts")
_s = importlib.util.spec_from_file_location("sync_bulk_t", os.path.join(SCRIPTS, "sync_bulk.py"))
sb = importlib.util.module_from_spec(_s)
_s.loader.exec_module(sb)

P = F = 0


def check(cond, msg):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print(f"  FAIL: {msg}")


def wf_wrapper(code="WF-LIST", title="목록 와이어프레임 (SAE)"):
    """로컬 SAE 명세 파일(CODE.json 래퍼) — wfanno/_sae_parse 가 쓰는 형태의 최소본."""
    return {
        "schemaVersion": 1, "id": code, "type": "Wireframe", "title": title, "status": "Draft",
        "screen_code": code.replace("WF-", ""), "route": "/list", "note": "목록 화면",
        "relations": {"covers": ["UCS-001", "SRS-001"]},
        "doc": {"type": "doc", "content": [
            {"type": "heading", "attrs": {"level": 2},
             "content": [{"type": "text", "text": "목록 · LIST · /list"}]}]},
    }


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


# ================================================================ 1. 매핑 자체
check(sb.CATEGORY.get("Wireframe") == "wireframes",
      f"CATEGORY['Wireframe'] == 'wireframes' — 실제 {sb.CATEGORY.get('Wireframe')!r}")
check(sb.CATEGORY.get("Wireframe") != "misc" and "Wireframe" in sb.CATEGORY,
      "Wireframe 이 misc 폴백으로 떨어지지 않는다")
# 이웃 미추적 타입과 같은 대우인지(하나만 빠지는 재발 방지) — Blueprint·DR 이 있으면 WF 도 있어야 한다.
check(all(t in sb.CATEGORY for t in ("Blueprint", "DesignResearch", "Wireframe")),
      "미추적이지만 동기되는 타입 3종(Blueprint·DesignResearch·Wireframe)이 모두 등재")


# ================================================================ 2. export — 제자리(wireframes/)로 내려온다
def run_export(artifacts, relations=()):
    """do_export 를 임시 DOCS 에서 실행 → 만들어진 상대경로 목록."""
    calls = []

    def fake_http(method, path, body=None):
        calls.append((method, path))
        if path.startswith("/export"):
            return {"artifacts": list(artifacts), "relations": list(relations)}
        if path.endswith("/doc"):
            return {"doc": {"type": "doc", "content": []}}
        return {}

    with tempfile.TemporaryDirectory() as tmp:
        old = (sb.http, sb.DOCS, sb.STATE)
        sb.http, sb.DOCS, sb.STATE = fake_http, tmp, os.path.join(tmp, ".sync_state.json")
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                sb.do_export("T")
        finally:
            (sb.http, sb.DOCS, sb.STATE) = old
        made = []
        for root, _d, files in os.walk(tmp):
            for fn in files:
                if fn.endswith(".json") and not fn.startswith(".sync_state"):
                    made.append(os.path.relpath(os.path.join(root, fn), tmp).replace(os.sep, "/"))
        return sorted(made)


made = run_export([
    {"code": "WF-LIST", "type": "Wireframe", "title": "목록", "status": "Draft", "body": ""},
    {"code": "SRS-001", "type": "SRS", "title": "요구", "status": "Draft", "body": ""},
])
check("wireframes/WF-LIST.json" in made, f"export: WF 는 wireframes/ 로 — 실제 {made}")
check(not any(p.startswith("misc/") for p in made), f"export: misc/ 로 떨어지지 않는다 — 실제 {made}")
check("requirements/SRS-001.json" in made, "export: 기존 타입 경로는 그대로(회귀 없음)")


# ================================================================ 3. import — 스킵되지 않는다
def run_import(files, db_artifacts=()):
    """files={상대경로: 래퍼dict} 를 임시 DOCS 에 깔고 do_import → POST /import 로 나간 body."""
    sent = {}

    def fake_http(method, path, body=None):
        if method == "GET" and path.startswith("/export"):
            return {"artifacts": list(db_artifacts), "relations": []}
        if method == "POST" and path == "/import":
            sent["import"] = body
            return {"created": 0, "updated": 0}
        if method == "PUT":
            sent.setdefault("docs", []).append(path)
            return {}
        return {}

    with tempfile.TemporaryDirectory() as tmp:
        for rel, obj in files.items():
            write_json(os.path.join(tmp, rel), obj)
        old = (sb.http, sb.DOCS, sb.STATE)
        sb.http, sb.DOCS, sb.STATE = fake_http, tmp, os.path.join(tmp, ".sync_state.json")
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                sb.do_import("T", False)
        finally:
            (sb.http, sb.DOCS, sb.STATE) = old
    return sent


sent = run_import({
    "wireframes/WF-LIST.json": wf_wrapper(),
    "requirements/SRS-001.json": {"schemaVersion": 1, "id": "SRS-001", "type": "SRS",
                                  "title": "요구", "status": "Draft"},
})
codes = [a["code"] for a in sent["import"]["artifacts"]]
check("WF-LIST" in codes, f"import: WF 가 스킵되지 않는다 — 실제 {codes}")
check("SRS-001" in codes, "import: 기존 타입도 그대로(회귀 없음)")
wf = next((a for a in sent["import"]["artifacts"] if a["code"] == "WF-LIST"), None)
check(wf and wf["type"] == "Wireframe", "import: type=Wireframe 그대로 전달")
check(wf and wf.get("doc"), "import: canonical doc 이 함께 실린다(본문 유실 없음)")
rels = [(r["src"], r["rel"], r["dst"]) for r in sent["import"]["relations"]]
check(("WF-LIST", "covers", "UCS-001") in rels and ("WF-LIST", "covers", "SRS-001") in rels,
      f"import: WF 의 covers 관계도 함께 간다 — 실제 {rels}")
check(any(p.endswith("/WF-LIST/doc") for p in sent.get("docs", [])),
      f"import: PUT /doc 로 canonical 본문 저장 — 실제 {sent.get('docs')}")


# ================================================================ 4. 스테이징(.working/)은 여전히 새지 않는다 (W11)
sent = run_import({
    "wireframes/WF-LIST.json": wf_wrapper(),
    "wireframes/.working/page-copy-1/WF-LIST.json": wf_wrapper(title="사본에서 고친 명세"),
    "wireframes/.working/page-copy-1/WF-DTL.json": wf_wrapper(code="WF-DTL", title="사본 전용 화면"),
})
titles = {a["code"]: a["title"] for a in sent["import"]["artifacts"]}
check(titles.get("WF-LIST") == "목록 와이어프레임 (SAE)",
      f"W11: 정본 명세가 사본 스테이징에 덮이지 않는다 — 실제 {titles.get('WF-LIST')!r}")
check("WF-DTL" not in titles,
      f"W11: 스테이징에만 있는 사본 명세는 PLM 으로 안 나간다(승격 없이 정본 반영 차단) — 실제 {sorted(titles)}")

# `_` 디렉터리도 같은 규칙(문서가 선언한 제외 규약과 일치).
sent = run_import({"_scratch/SRS-999.json": {"schemaVersion": 1, "id": "SRS-999", "type": "SRS",
                                             "title": "임시", "status": "Draft"}})
check([a["code"] for a in sent["import"]["artifacts"]] == [],
      "`_` 로 시작하는 디렉터리도 순회 제외(파일 규칙과 동일)")

# 제외는 디렉터리 이름 기준이지 경로 전체가 아니다 — DOCS 자체가 `.ouroboros/` 아래 있어도 걷는다.
with tempfile.TemporaryDirectory() as _t:
    docs = os.path.join(_t, ".ouroboros", "docs")
    write_json(os.path.join(docs, "wireframes", "WF-LIST.json"), wf_wrapper())
    got = {}

    def _http(method, path, body=None):
        if method == "GET" and path.startswith("/export"):
            return {"artifacts": [], "relations": []}
        if method == "POST" and path == "/import":
            got["b"] = body
        return {}

    old = (sb.http, sb.DOCS, sb.STATE)
    sb.http, sb.DOCS, sb.STATE = _http, docs, os.path.join(_t, ".state.json")
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            sb.do_import("T", False)
    finally:
        (sb.http, sb.DOCS, sb.STATE) = old
    check([a["code"] for a in got.get("b", {}).get("artifacts", [])] == ["WF-LIST"],
          "제외 판정은 DOCS 하위 디렉터리 이름 기준(루트의 `.ouroboros` 때문에 전부 막히지 않는다)")

print(f"test_sync_bulk_category: {P} pass, {F} fail")
sys.exit(1 if F else 0)
