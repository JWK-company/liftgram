#!/usr/bin/env python3
"""PLM work agent — 대시보드의 빈약 본문 아티팩트를 자동 보정(claude CLI 구동).

업무 할당(assignment) 모델: **G_body 큐**(산문 아티팩트 중 본문 빈약 = '작성 요청').
  사람이 대시보드에서 제목만 있는 골격 아티팩트를 만들면 → agent가 자동으로 본문을 채운다.
동작:
  1. PLM /export 에서 큐 수집(thin body prose) — 또는 --code 로 특정 1건.
  2. 각 아티팩트의 맥락(상류 URS/SRS·구현 Code) 수집.
  3. `claude -p` 로 템플릿 섹션에 맞는 본문 생성(요구서술·수용기준·연결 등).
  4. --apply 면 로컬 .md 본문 갱신 → plm-sync hook 이 PLM upsert. 없으면 dry-run.
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


def push(api, token, project, art, body):
    """본문 갱신을 PLM 에 upsert(서비스 토큰). 스크립트 쓰기는 hook 미발화 → agent 가 직접 동기."""
    payload = {"project": project, "artifacts": [{
        "code": art["code"], "type": art["type"], "title": art.get("title", art["code"]),
        "status": art.get("status", "Draft"), "body": body,
        "granularity": art.get("granularity"), "build_state": art.get("build_state"),
    }], "relations": []}
    data = json.dumps(payload).encode()
    req = urllib.request.Request(f"{api}/import", data=data, method="POST")
    req.add_header("content-type", "application/json")
    req.add_header("user-agent", "plm-agent/1.0")
    req.add_header("authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())


def is_thin(a):
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


def write_local(docs_root, code, new_body):
    """로컬 .md 본문 교체(frontmatter 보존). 성공 시 경로 반환."""
    sub = CAT.get(code.split("-")[0])
    if not sub:
        return None
    path = os.path.join(docs_root, sub, f"{code}.md")
    if not os.path.exists(path):
        return None
    txt = open(path, encoding="utf-8").read()
    m = re.match(r"^(---\n.*?\n---\n)(.*)$", txt, re.S)
    if not m:
        return None
    open(path, "w", encoding="utf-8").write(m.group(1) + new_body.rstrip() + "\n")
    return path


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
                 and a.get("status") != "Superseded" and is_thin(a)]
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
        p = write_local(docs_root, code, body)
        synced = ""
        try:
            push(api, token, project, a, body)
            synced = " → PLM 동기✓"
        except Exception as e:
            synced = f" (PLM 동기 실패: {str(e)[:40]})"
        if p:
            print(f"    ✓ 본문 {len(body)}자 작성 → {os.path.relpath(p, docs_root)}{synced}")
            done += 1
        else:
            print("    로컬 .md 없음 — 스킵")
    if apply:
        print(f"[agent] 완료: {done}/{len(queue)}건 보정. /plm-hub:pull 또는 plm-sync 로 PLM 정합.")


if __name__ == "__main__":
    main()
