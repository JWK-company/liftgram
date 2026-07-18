#!/usr/bin/env python3
"""PLM work agent — 대시보드의 빈약 본문 아티팩트를 자동 보정(claude CLI 구동).

업무 할당(assignment) 모델: **G_body 큐**(산문 아티팩트 중 본문 빈약 = '작성 요청').
  사람이 대시보드에서 제목만 있는 골격 아티팩트를 만들면 → agent가 자동으로 본문을 채운다.
동작:
  1. PLM /export 에서 큐 수집(thin body prose) — 또는 --code 로 특정 1건.
  2. 각 아티팩트의 맥락(상류 URS/SRS·구현 Code) 수집.
  3. `claude -p` 로 템플릿 섹션에 맞는 본문 생성(요구서술·수용기준·연결 등).
  4. --apply 면 마크다운 본문 → ProseMirror doc(ADR-019) 변환 → 로컬 CODE.json 갱신 + PLM PUT /doc. 없으면 dry-run.
인증: PLM_API_TOKEN(서비스 토큰). 사람 계정 암호 불필요.
env: PLM_API_URL · PLM_API_TOKEN · PLM_PROJECT · CLAUDE_PROJECT_DIR(로컬 docs 루트)
인자: [--apply] [--limit N] [--code CODE]
"""
import json
import os
import re
import subprocess
import sys
import urllib.request

PROSE = {"URS", "UCS", "SRS", "SAD", "ADR"}
CAT = {"URS": "requirements", "UCS": "requirements", "SRS": "requirements",
       "SAD": "design", "ADR": "decisions"}
SECTIONS = {
    "URS": "## 배경 / 이해관계자\n## 요구 서술\n## 수용 기준",
    "UCS": "## 주 흐름\n## 대안/예외\n## 사전·사후 조건",
    "SRS": "## 요구 서술\n## 수용 기준\n## 연결",
    "SAD": "## 개요 (Summary)\n## 컴포넌트 / 책임\n## 연결",
    "ADR": "## 맥락 (Context)\n## 결정 (Decision)\n## 근거 / 대안\n## 결과 (Consequences)",
}


def http_get(url, token):
    req = urllib.request.Request(url)
    req.add_header("user-agent", "plm-agent/1.0")
    if token:
        req.add_header("authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())


def push(api, token, project, art, body, doc):
    """본문 갱신을 PLM 에 upsert(서비스 토큰). 스크립트 쓰기는 hook 미발화 → agent 가 직접 동기.
    ADR-019 동형: /import(메타)+ PUT /doc(canonical 본문). 대시보드는 doc 를 렌더."""
    from urllib.parse import quote
    payload = {"project": project, "artifacts": [{
        "code": art["code"], "type": art["type"], "title": art.get("title", art["code"]),
        "status": art.get("status", "Draft"), "body": body, "doc": doc,
        "granularity": art.get("granularity"), "build_state": art.get("build_state"),
    }], "relations": []}
    req = urllib.request.Request(f"{api}/import", data=json.dumps(payload).encode(), method="POST")
    req.add_header("content-type", "application/json")
    req.add_header("user-agent", "plm-agent/1.0")
    req.add_header("authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=10) as r:
        r.read()
    # canonical 본문 doc 저장(대시보드 렌더 정합)
    req2 = urllib.request.Request(
        f"{api}/artifacts/{quote(project)}/{quote(art['code'])}/doc",
        data=json.dumps({"doc": doc, "schema_version": 1}).encode(), method="PUT")
    req2.add_header("content-type", "application/json")
    req2.add_header("user-agent", "plm-agent/1.0")
    req2.add_header("authorization", f"Bearer {token}")
    with urllib.request.urlopen(req2, timeout=10) as r:
        return json.loads(r.read().decode() or "{}")


def is_thin(a):
    if "seed" in (a.get("tags") or []):
        return False  # P1-2: seed BS는 보정 대상 아님(사용자 아이디어 없는 본문 날조 방지)
    body = (a.get("body") or "").strip()
    prose = "\n".join(l for l in body.splitlines() if not l.startswith("#")).strip()
    return (not prose) or len(prose) < 50 or "{{" in body


def context_for(code, arts, rels):
    """상류(이 아티팩트가 가리키는)·구현 Code(이 아티팩트를 realizes) 맥락 수집."""
    title = {a["code"]: a.get("title", "") for a in arts}
    up = [f"{r['dst']}({title.get(r['dst'],'')})" for r in rels
          if r["src"] == code and r["rel"] in ("derives_from", "refs", "elaborates", "informs", "covers")]
    code_impl = [title.get(r["src"], r["src"]) for r in rels
                 if r["dst"] == code and r["rel"] == "realizes"][:10]
    return up, code_impl


def gen_body(art, up, code_impl):
    """claude CLI 로 본문 생성. 실패 시 None."""
    t = art.get("type")
    prompt = (
        f"너는 PLM 기획 아티팩트 본문 작성 agent다. 아래 {t} 아티팩트의 **본문(마크다운)** 만 출력하라.\n"
        f"규칙: 정확히 이 섹션들을 쓰고 각 섹션을 구체적 내용으로 채운다(플레이스홀더·빈 섹션 금지). "
        f"전체 한국어. 코드블록/설명문 없이 본문 마크다운만.\n\n"
        f"섹션:\n{SECTIONS.get(t,'## 개요')}\n\n"
        f"제목: {art.get('title')}\n"
        f"상류 연결: {', '.join(up) or '(없음)'}\n"
        f"구현 코드: {', '.join(code_impl) or '(없음)'}\n"
    )
    try:
        r = subprocess.run(["claude", "-p", prompt], capture_output=True, text=True, timeout=180)
        out = (r.stdout or "").strip()
        # 혹시 펜스로 감쌌으면 벗김
        out = re.sub(r"^```[a-z]*\n?|```$", "", out).strip()
        return out if len(out) > 40 else None
    except Exception as e:
        print(f"  [agent] claude 호출 실패: {str(e)[:60]}")
        return None


def md_to_doc(md):
    """마크다운 본문 → 최소 ProseMirror doc(heading/paragraph/bullet_list). 템플릿 섹션 구조 커버(ADR-019)."""
    content, bullets = [], []

    def flush():
        if bullets:
            content.append({"type": "bullet_list", "content": [
                {"type": "list_item", "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": b}]}]}
                for b in bullets]})
            bullets.clear()

    for raw in md.splitlines():
        s = raw.strip()
        if not s:
            flush()
            continue
        hm = re.match(r"^(#{1,6})\s+(.*)$", s)
        if hm:
            flush()
            content.append({"type": "heading", "attrs": {"level": min(len(hm.group(1)), 6)},
                            "content": [{"type": "text", "text": hm.group(2)}]})
            continue
        bm = re.match(r"^[-*]\s+(.*)$", s)
        if bm:
            bullets.append(bm.group(1))
            continue
        flush()
        content.append({"type": "paragraph", "content": [{"type": "text", "text": s}]})
    flush()
    return {"type": "doc", "content": content}


def write_local(docs_root, code, new_body, doc):
    """로컬 본문 교체. ADR-019 동형: CODE.json(doc) canonical 우선 + .md(frontmatter 보존) 레거시. 경로 반환."""
    sub = CAT.get(code.split("-")[0])
    if not sub:
        return None
    jpath = os.path.join(docs_root, sub, f"{code}.json")
    mpath = os.path.join(docs_root, sub, f"{code}.md")
    if os.path.exists(jpath):  # canonical — 래퍼의 doc 교체
        try:
            obj = json.load(open(jpath, encoding="utf-8"))
        except Exception:
            return None
        obj["doc"] = doc
        with open(jpath, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.write("\n")
        return jpath
    if os.path.exists(mpath):  # 레거시 .md
        txt = open(mpath, encoding="utf-8").read()
        m = re.match(r"^(---\n.*?\n---\n)(.*)$", txt, re.S)
        if not m:
            return None
        open(mpath, "w", encoding="utf-8").write(m.group(1) + new_body.rstrip() + "\n")
        return mpath
    return None


def main():
    api = os.environ.get("PLM_API_URL", "").rstrip("/")
    token = os.environ.get("PLM_API_TOKEN", "")
    project = os.environ.get("PLM_PROJECT", "")
    docs_root = os.path.join(os.environ.get("CLAUDE_PROJECT_DIR", "."), ".ouroboros", "docs")
    apply = "--apply" in sys.argv
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 5
    only = sys.argv[sys.argv.index("--code") + 1] if "--code" in sys.argv else None
    if not (api and project):
        print("[agent] PLM 미바인딩")
        return

    data = http_get(f"{api}/export?project={project}", token)
    arts, rels = data.get("artifacts", []), data.get("relations", [])
    if only:
        queue = [a for a in arts if a["code"] == only]
    else:
        queue = [a for a in arts if a.get("type") in PROSE
                 and a.get("status") != "Replaced" and is_thin(a)]
    queue = queue[:limit]
    mode = "APPLY" if apply else "DRY-RUN"
    print(f"[agent] 큐 {len(queue)}건 ({mode}) · project={project}")
    done = 0
    for a in queue:
        code = a["code"]
        up, impl = context_for(code, arts, rels)
        print(f"  ▸ {code} ({a.get('type')}) '{a.get('title')}' — 상류 {len(up)}·구현코드 {len(impl)}")
        if not apply:
            continue
        body = gen_body(a, up, impl)
        if not body:
            print("    본문 생성 실패 — 스킵")
            continue
        doc = md_to_doc(body)  # ADR-019: 마크다운 → ProseMirror doc(canonical)
        p = write_local(docs_root, code, body, doc)
        synced = ""
        try:
            push(api, token, project, a, body, doc)
            synced = " → PLM 동기✓"
        except Exception as e:
            synced = f" (PLM 동기 실패: {str(e)[:40]})"
        if p:
            print(f"    ✓ 본문 {len(body)}자 작성 → {os.path.relpath(p, docs_root)}{synced}")
            done += 1
        else:
            print("    로컬 아티팩트 파일 없음(.json/.md) — 스킵")
    if apply:
        print(f"[agent] 완료: {done}/{len(queue)}건 보정. /plm-hub:pull 또는 plm-sync 로 PLM 정합.")


if __name__ == "__main__":
    main()
