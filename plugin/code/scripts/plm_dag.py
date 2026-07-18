#!/usr/bin/env python3
"""plm_dag — autorun root DAG 산출 (SRS-031 · P1-4).

root(RM|PRD|BS)에서 ①전개(수집)와 ②실행 큐를 2단 분리로 산출한다.
  ①전개: 계보 역방향(BS→Business·BS→PRD·PRD→RM) + 하위 방향(covers·derives_from역·refs역·realizes역) BFS.
  ②실행 큐: 전개 노드 중 SRS만, 하위 방향 에지(계보 불참)로 위상정렬(동순위=code 오름차순).
targets·relates_to는 순회 제외(소프트 참조 — 순환 원천 차단). 순환·고아는 실행 전 보고.

사용: python3 plm_dag.py <ROOT_CODE> [--project P] [--api URL]
바인딩 기본값: .ouroboros/config/plm.json + .ouroboros/env/.env(PLM_API_TOKEN). 출력: JSON(stdout).
"""
import json
import os
import sys
import urllib.request
from collections import defaultdict, deque

# 하위 방향 에지(실행 큐 위상정렬 참여): (rel, 순방향 그대로인가) — export의 (src, rel, dst) 기준.
#   covers: RM─covers→URS|SRS  → 하위 = dst (순방향)
#   derives_from: SRS─→URS     → 하위 = src (역방향)
#   elaborates: UCS─→URS       → 하위 = src (역방향 — 컨텍스트 수집용)
#   refs: SAD─→SRS             → 하위 = src (역방향)
#   informs: ADR─→SRS|SAD      → 하위 = src (역방향 — 컨텍스트)
#   realizes: Code─→SRS|SAD    → 하위 = src (역방향)
#   implemented_by: SRS|SAD─→Code → 하위 = dst (순방향)
DOWN_FORWARD = {"covers", "implemented_by"}
DOWN_REVERSE = {"derives_from", "elaborates", "refs", "informs", "realizes"}
# 계보(전개에만 참여·위상정렬 불참): generated_from — Business(구 Report)→BS·PRD→BS·RM→PRD. 진행 방향 = 역방향(BS→…→RM).
LINEAGE = {"generated_from"}
EXCLUDE = {"targets", "relates_to"}  # 소프트 — 순회 제외

QUEUE_TYPE = "SRS"  # 실행 대상(구현 단위). 나머지는 컨텍스트.


def load_binding(project=None, api=None):
    root = os.environ.get("CLAUDE_PROJECT_DIR", ".")
    cfg = os.path.join(root, ".ouroboros", "config", "plm.json")
    if (not project or not api) and os.path.exists(cfg):
        c = json.load(open(cfg))
        project = project or c.get("project")
        api = api or c.get("api_url")
    token = os.environ.get("PLM_API_TOKEN", "")
    envf = os.path.join(root, ".ouroboros", "env", ".env")
    if not token and os.path.exists(envf):
        for line in open(envf):
            if line.startswith("PLM_API_TOKEN="):
                token = line.strip().split("=", 1)[1]
    return project, (api or "").rstrip("/"), token


def fetch_export(api, token, project):
    req = urllib.request.Request(
        f"{api}/export?project={project}",
        headers={"authorization": f"Bearer {token}", "user-agent": "plm-dag/1.0"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def build(export, root_code):
    arts = {a["code"]: a for a in export.get("artifacts", []) if a.get("status") != "Replaced"}
    if root_code not in arts:
        return {"error": f"root '{root_code}' 없음(또는 Replaced)", "kind": "not_found"}
    rt = arts[root_code]["type"]
    if rt not in ("Roadmap", "PRD", "BS"):
        return {"error": f"root 타입 {rt} 불가 — RM|PRD|BS만(SRS-031)", "kind": "validation"}

    down = defaultdict(set)     # 하위 방향(위상정렬 참여)
    expand = defaultdict(set)   # 전개 전용(하위 + 계보 역방향)
    for r in export.get("relations", []):
        rel, s, d = r["rel"], r["src"], r["dst"]
        if rel in EXCLUDE or s not in arts or d not in arts:
            continue
        if rel in DOWN_FORWARD:
            down[s].add(d)
            expand[s].add(d)
        elif rel in DOWN_REVERSE:
            down[d].add(s)
            expand[d].add(s)
        elif rel in LINEAGE:
            expand[d].add(s)  # 진행 방향: dst(기원) → src(산출) — BS→PRD·PRD→RM

    # ① 전개(수집) BFS
    seen = {root_code}
    q = deque([root_code])
    while q:
        for n in expand.get(q.popleft(), ()):
            if n not in seen:
                seen.add(n)
                q.append(n)
    expansion = sorted(seen)

    # ② 실행 큐: SRS만·down 에지 위상정렬(Kahn — 동순위 code 오름차순), 전개 부분그래프로 제한.
    sub = {n: {m for m in down.get(n, ()) if m in seen} for n in seen}
    indeg = defaultdict(int)
    for n, outs in sub.items():
        indeg.setdefault(n, 0)
        for m in outs:
            indeg[m] += 1
    ready = sorted([n for n, d in indeg.items() if d == 0])
    topo = []
    while ready:
        n = ready.pop(0)
        topo.append(n)
        for m in sorted(sub.get(n, ())):
            indeg[m] -= 1
            if indeg[m] == 0:
                ready.append(m)
        ready.sort()
    cycles = sorted(set(indeg) - set(topo))  # 위상정렬 잔여 = 순환 참여 노드
    queue = [n for n in topo if arts[n]["type"] == QUEUE_TYPE]
    # 미구현 필터(참고): realizes 역참조 없는 SRS 표시 — autorun --all 동작과의 접점.
    realized = set()
    for r in export.get("relations", []):
        if r["rel"] == "realizes" and r["dst"] in arts:
            realized.add(r["dst"])
    return {
        "root": root_code,
        "root_type": rt,
        "expansion": [{"code": c, "type": arts[c]["type"], "title": arts[c]["title"], "status": arts[c]["status"]} for c in expansion],
        "queue": queue,
        "queue_unrealized": [c for c in queue if c not in realized],
        "cycles": cycles,
        "context": [c for c in expansion if arts[c]["type"] != QUEUE_TYPE],
        "empty_queue": len(queue) == 0,
    }


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    opts = {a.split("=")[0].lstrip("-"): (a.split("=", 1)[1] if "=" in a else True) for a in sys.argv[1:] if a.startswith("--")}
    if not args:
        print(json.dumps({"error": "root code 필요 — plm_dag.py <RM-00N|PRD|BS-00N>", "kind": "validation"}, ensure_ascii=False))
        sys.exit(1)
    project, api, token = load_binding(opts.get("project"), opts.get("api"))
    if not (project and api and token):
        print(json.dumps({"error": "바인딩/토큰 없음 — /plm-hub:link 또는 --project/--api", "kind": "config"}, ensure_ascii=False))
        sys.exit(1)
    try:
        out = build(fetch_export(api, token, project), args[0])
    except Exception as e:  # 서버 미도달 등 — graceful
        out = {"error": str(e), "kind": "unreachable"}
    print(json.dumps(out, ensure_ascii=False, indent=1))
    sys.exit(1 if out.get("error") else 0)


if __name__ == "__main__":
    main()
