#!/usr/bin/env python3
"""아키텍처 블루프린트(BP-*.json) 검증기 — 모델 계약 v1 (ADR-032 · SRS-047).

`.ouroboros/docs/blueprint/BP-*.json`(CODE.json 래퍼 + doc 안 code_block(language="plm-blueprint"))
을 검사한다. **에러**(계약 위반 — [아키텍처] 탭 렌더 실패·딥링크 깨짐)와 **경고**(품질 저하)를
구분 리포트하고, 에러가 1건이라도 있으면 exit 1(그 외 0). 형식 정본 = BP-001.json ·
`_BLUEPRINT-METHODOLOGY.md`.

검사 항목:
  래퍼   — JSON 파스 · 필수키(id / type=Blueprint / doc) · id↔파일명 일치
  모델   — code_block(language="plm-blueprint") 존재 · 모델 JSON 파스 · version==1
           zones/nodes/edges 필수 리스트 + 원소 필수 필드(zone: id·label / node: id·zone·label / edge: from·to)
  무결성 — node.zone→zones 실존 · edge.from/to→nodes 실존 · scenario steps의 nodes[]/edges[] 실존
           · 중복 id(zones·nodes·edges(id 보유분)·scenarios)
  실존   — nodes[].artifacts[] 코드가 PLM 프로젝트에 실존하는지(GET /export?project= 대조,
           `.ouroboros/env/.env` PLM_API_TOKEN·user-agent 헤더). PLM 미도달 시 경고로 강등·실존 검사만 생략.
  품질   — kind 어휘 밖 값 · role/design/io/basis 전부 빈 노드(빈 껍데기) · hue 범위 · 빈 edges 등 → 경고
           · 프로젝트에 DR(DesignResearch·설계 조사)이 존재하는데 어떤 노드 basis에도 DR 인용이 없으면
             "DR 근거 미인용" 경고 1줄(비차단 — DR 부재 자체는 경고 안 함·신규 프로젝트 초기 허용)

사용:
  python3 bpcheck.py                    # plm.json 바인딩 프로젝트 — docs/blueprint/BP-*.json 전량
  python3 bpcheck.py --project <p>      # 프로젝트 오버라이드(artifacts 실존 대조 대상)
  python3 bpcheck.py --file <path>      # 특정 파일 1개만 검사
설정 해석은 wfscan.py 와 동일 관례 — env > .ouroboros/env/.env > config/plm.json > 기본값.
"""
import glob
import json
import os
import re
import sys
import urllib.error
import urllib.request

UA = "plm-bpcheck/1.0"
NODE_KINDS = {"client", "service", "db", "queue", "external", "llm"}
EDGE_KINDS = {"sync", "async", "data"}


# ---------------------------------------------------------------- 설정 해석 (wfscan.resolve 관례)
def _find_ouro(start):
    """start 에서 상위로 올라가며 가장 가까운 .ouroboros 디렉토리를 찾는다."""
    d = os.path.abspath(start)
    while d and d != os.path.dirname(d):
        cand = os.path.join(d, ".ouroboros")
        if os.path.isdir(cand):
            return cand
        d = os.path.dirname(d)
    return None


def _parse_env(path):
    """.env 의 KEY=VALUE 를 dict 로(따옴표 제거). 비밀은 여기서만 읽고 절대 출력하지 않는다."""
    out = {}
    try:
        for ln in open(path, encoding="utf-8"):
            ln = ln.strip()
            if not ln or ln.startswith("#") or "=" not in ln:
                continue
            k, _, v = ln.partition("=")
            v = v.strip()
            if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
                v = v[1:-1]
            out[k.strip()] = v
    except Exception:
        pass
    return out


def resolve():
    """PLM 설정을 env > .env > plm.json > 기본값 순으로 해석(wfscan 과 동일 관례)."""
    proj_dir = os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()
    ouro = _find_ouro(proj_dir) or _find_ouro(os.getcwd())
    envf, cfg = {}, {}
    if ouro:
        envf = _parse_env(os.path.join(ouro, "env", ".env"))
        cfgp = os.path.join(ouro, "config", "plm.json")
        if os.path.isfile(cfgp):
            try:
                cfg = json.load(open(cfgp, encoding="utf-8"))
            except Exception:
                cfg = {}

    def pick(*vals, default=""):
        for v in vals:
            if v:
                return v
        return default

    plm_api = pick(os.environ.get("PLM_API_URL"), envf.get("PLM_API_URL"),
                   cfg.get("api_url"), default="https://jwk-plm.shoi.ch").rstrip("/")
    plm_token = pick(os.environ.get("PLM_API_TOKEN"), envf.get("PLM_API_TOKEN"))
    project = pick(os.environ.get("PLM_PROJECT"), cfg.get("project"))
    bp_dir = os.path.join(ouro, "docs", "blueprint") if ouro else None
    return {"plm_api": plm_api, "plm_token": plm_token, "project": project,
            "ouro": ouro, "bp_dir": bp_dir}


# ---------------------------------------------------------------- HTTP (wfscan._http 관례)
def _http(url, token, scheme, body=None, method="GET", timeout=20):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("content-type", "application/json")
    req.add_header("accept", "application/json")
    if token:
        req.add_header("authorization", f"{scheme} {token}")
    req.add_header("user-agent", UA)  # Cloudflare 가 기본 urllib UA 차단(403)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else {}


def plm_export_codes(api, token, project):
    """GET /export?project= → {code: (type, title)} 맵. 실패 시 None(실존 검사 생략 신호).
    membership(`in`)은 dict 키로 기존과 동일하게 동작 — 커버리지 리포트가 type/title을 함께 쓴다."""
    from urllib.parse import quote
    try:
        d = _http(f"{api}/export?project={quote(project)}", token, "Bearer")
        arts = d.get("artifacts") if isinstance(d, dict) else None
        if not isinstance(arts, list):
            return None
        return {a.get("code"): (a.get("type", ""), a.get("title", ""))
                for a in arts if isinstance(a, dict) and a.get("code")}
    except Exception:
        return None


# ---------------------------------------------------------------- 모델 추출
def extract_model_text(doc):
    """doc(ProseMirror)을 재귀 탐색해 첫 code_block(attrs.language=="plm-blueprint")의 텍스트를 반환.
    없으면 None."""
    found = [None]

    def walk(n):
        if found[0] is not None:
            return
        if isinstance(n, dict):
            if n.get("type") == "code_block" and (n.get("attrs") or {}).get("language") == "plm-blueprint":
                texts = [c.get("text", "") for c in (n.get("content") or []) if isinstance(c, dict)]
                found[0] = "".join(texts)
                return
            for c in n.get("content") or []:
                walk(c)
        elif isinstance(n, list):
            for c in n:
                walk(c)

    walk(doc)
    return found[0]


# ---------------------------------------------------------------- 검사
def _dup(seq):
    """리스트에서 중복된 값 집합."""
    seen, dups = set(), set()
    for x in seq:
        (dups if x in seen else seen).add(x)
    return dups


def check_file(path, plm_codes):
    """파일 1개 검사 → (errors[], warnings[], stats{}). plm_codes=None 이면 artifacts 실존 검사 생략."""
    E, W = [], []
    stats = {}
    fname = os.path.basename(path)

    # 1) 래퍼
    try:
        wrapper = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        return [f"래퍼 JSON 파스 실패: {str(e)[:80]}"], W, stats
    if not isinstance(wrapper, dict):
        return ["래퍼가 JSON 객체가 아님"], W, stats
    bid = wrapper.get("id")
    if not bid:
        E.append("래퍼 필수키 누락: id")
    if wrapper.get("type") != "Blueprint":
        E.append(f"래퍼 type != Blueprint (현재: {wrapper.get('type')!r})")
    doc = wrapper.get("doc")
    if not isinstance(doc, dict):
        E.append("래퍼 필수키 누락: doc (ProseMirror 본문)")
    if bid and fname.endswith(".json") and fname[:-5] != bid:
        E.append(f"id↔파일명 불일치: id={bid} · 파일={fname} (규약: docs/blueprint/{bid}.json)")
    if not wrapper.get("title"):
        W.append("title 비어있음 — 탭 목록·딥링크 표시용 제목 권장")

    # 2) 모델 code_block
    if not isinstance(doc, dict):
        return E, W, stats
    text = extract_model_text(doc)
    if text is None:
        E.append('doc 안에 code_block(attrs.language="plm-blueprint") 없음 — 탭이 렌더할 모델 부재')
        return E, W, stats
    try:
        model = json.loads(text)
    except Exception as e:
        E.append(f"모델 JSON 파스 실패: {str(e)[:80]}")
        return E, W, stats
    if not isinstance(model, dict):
        E.append("모델이 JSON 객체가 아님")
        return E, W, stats

    # 3) 스키마 v1 필수 필드
    if model.get("version") != 1:
        E.append(f"모델 version != 1 (현재: {model.get('version')!r}) — 계약 v1 필수")
    zones = model.get("zones")
    nodes = model.get("nodes")
    edges = model.get("edges")
    if not isinstance(zones, list) or not zones:
        E.append("zones 누락/비어있음 — 최소 1개 존 필요")
        zones = zones if isinstance(zones, list) else []
    if not isinstance(nodes, list) or not nodes:
        E.append("nodes 누락/비어있음 — 최소 1개 노드 필요")
        nodes = nodes if isinstance(nodes, list) else []
    if not isinstance(edges, list):
        E.append("edges 누락(리스트 아님)")
        edges = []
    elif not edges:
        W.append("edges 비어있음 — 연결 없는 설계도(의도 확인)")

    zone_ids, node_ids, edge_ids = [], [], []
    for i, z in enumerate(zones):
        if not isinstance(z, dict):
            E.append(f"zones[{i}] 객체 아님")
            continue
        if not z.get("id"):
            E.append(f"zones[{i}] 필수 필드 누락: id")
        else:
            zone_ids.append(z["id"])
        if not z.get("label"):
            E.append(f"zone {z.get('id', i)!r} 필수 필드 누락: label")
        hue = z.get("hue")
        if hue is not None and not (isinstance(hue, (int, float)) and 0 <= hue <= 360):
            W.append(f"zone {z.get('id', i)!r} hue 범위 밖(0~360): {hue!r}")

    for i, n in enumerate(nodes):
        if not isinstance(n, dict):
            E.append(f"nodes[{i}] 객체 아님")
            continue
        nid = n.get("id")
        if not nid:
            E.append(f"nodes[{i}] 필수 필드 누락: id")
        else:
            node_ids.append(nid)
        for req in ("zone", "label"):
            if not n.get(req):
                E.append(f"node {nid or i!r} 필수 필드 누락: {req}")
        if n.get("zone") and zone_ids and n["zone"] not in zone_ids:
            E.append(f"node {nid or i!r} → 존재하지 않는 zone {n['zone']!r} 참조")
        kind = n.get("kind")
        if kind is not None and kind not in NODE_KINDS:
            W.append(f"node {nid or i!r} kind 어휘 밖: {kind!r} (허용: {'/'.join(sorted(NODE_KINDS))})")
        # 빈 껍데기 — role·design·io·basis 전부 빈 노드는 설계도 가치가 없다(저작 원칙 위반).
        if not (n.get("role") or n.get("design") or n.get("io") or n.get("basis")):
            W.append(f"node {nid or i!r} 빈 껍데기 — role/design/io/basis 전부 없음(실근거로 채울 것)")
        pos = n.get("pos")
        if pos is not None:
            if not isinstance(pos, dict) or not isinstance(pos.get("x"), (int, float)) \
                    or not isinstance(pos.get("y"), (int, float)):
                E.append(f"node {nid or i!r} pos 형식 오류 — {{x,y[,w,h]}} 숫자 필요: {pos!r}")
        arts = n.get("artifacts")
        if arts is not None and not isinstance(arts, list):
            E.append(f"node {nid or i!r} artifacts 리스트 아님: {arts!r}")

    node_set = set(node_ids)
    for i, e in enumerate(edges):
        if not isinstance(e, dict):
            E.append(f"edges[{i}] 객체 아님")
            continue
        eid = e.get("id")
        if eid:
            edge_ids.append(eid)
        for req in ("from", "to"):
            if not e.get(req):
                E.append(f"edge {eid or i!r} 필수 필드 누락: {req}")
            elif node_set and e[req] not in node_set:
                E.append(f"edge {eid or i!r} → 존재하지 않는 node {e[req]!r} 참조({req})")
        kind = e.get("kind")
        if kind is not None and kind not in EDGE_KINDS:
            W.append(f"edge {eid or i!r} kind 어휘 밖: {kind!r} (허용: {'/'.join(sorted(EDGE_KINDS))})")

    # 4) 시나리오 참조 무결성 (+ v1.1 persona/covers — ADR-033 여정 표준)
    scenarios = model.get("scenarios") or []
    scen_ids = []
    no_covers = []  # covers 없는 시나리오 — 커버리지 리포트에서 표면화(여정↔요구 미연결)
    if not isinstance(scenarios, list):
        E.append("scenarios 리스트 아님")
        scenarios = []
    edge_set = set(edge_ids)
    for i, s in enumerate(scenarios):
        if not isinstance(s, dict):
            E.append(f"scenarios[{i}] 객체 아님")
            continue
        sid = s.get("id")
        if not sid:
            E.append(f"scenarios[{i}] 필수 필드 누락: id")
        else:
            scen_ids.append(sid)
        if not s.get("label"):
            E.append(f"scenario {sid or i!r} 필수 필드 누락: label")
        persona = s.get("persona")
        if persona is not None and not isinstance(persona, str):
            E.append(f"scenario {sid or i!r} persona 문자열 아님: {persona!r}")
        note = s.get("note")
        if note is not None and not isinstance(note, str):
            E.append(f"scenario {sid or i!r} note 문자열 아님: {note!r}")
        covers = s.get("covers")
        if covers is not None and (not isinstance(covers, list)
                                   or not all(isinstance(c, str) for c in covers)):
            E.append(f"scenario {sid or i!r} covers 문자열 리스트 아님: {covers!r}")
            covers = None
        if not covers:
            no_covers.append((sid or f"[{i}]", s.get("label") or ""))
        steps = s.get("steps")
        if not isinstance(steps, list) or not steps:
            E.append(f"scenario {sid or i!r} steps 누락/비어있음")
            continue
        for j, st in enumerate(steps):
            if not isinstance(st, dict) or not st.get("text"):
                E.append(f"scenario {sid or i!r} steps[{j}] text 누락")
                continue
            for ref in st.get("nodes") or []:
                if node_set and ref not in node_set:
                    E.append(f"scenario {sid or i!r} steps[{j}] → 존재하지 않는 node {ref!r} 참조")
            for ref in st.get("edges") or []:
                if edge_set and ref not in edge_set:
                    E.append(f"scenario {sid or i!r} steps[{j}] → 존재하지 않는 edge {ref!r} 참조(id 보유 edge 만 참조 가능)")

    # 5) 중복 id
    for name, ids in (("zone", zone_ids), ("node", node_ids), ("edge", edge_ids), ("scenario", scen_ids)):
        for d in sorted(_dup(ids)):
            E.append(f"{name} id 중복: {d!r}")

    # 6) artifacts[]·covers[] 실존 대조 (PLM /export 코드 집합) — 딥링크 칩 무결성(둘 다 같은 규율)
    referenced = []
    for n in nodes:
        if isinstance(n, dict) and isinstance(n.get("artifacts"), list):
            for a in n["artifacts"]:
                referenced.append(("node", n.get("id"), a))
    for s in scenarios:
        if isinstance(s, dict) and isinstance(s.get("covers"), list):
            for c in s["covers"]:
                if isinstance(c, str):
                    referenced.append(("scenario", s.get("id"), c))
    if referenced and plm_codes is not None:
        for kind, rid, a in referenced:
            if a not in plm_codes:
                field = "artifacts" if kind == "node" else "covers"
                E.append(f"{kind} {rid!r} {field} → PLM에 실존하지 않는 코드 {a!r} (딥링크 깨짐 — 실존 코드만)")
    elif referenced and plm_codes is None:
        W.append(f"PLM 미도달 — artifacts/covers 실존 검사 생략({len(referenced)}건 미대조)")

    # 7) DR 근거 인용(비차단) — 설계 조사→BP 파이프라인: 프로젝트에 DR(DesignResearch)이 존재하는데
    #    어떤 노드도 DR을 인용하지 않으면 경고 1줄. DR 부재 자체는 경고 안 함(신규 프로젝트 초기 허용).
    if plm_codes:
        dr_codes = {c for c, (t, _) in plm_codes.items() if t == "DesignResearch"}
        if dr_codes:
            cited = False
            for n in nodes:
                if not isinstance(n, dict):
                    continue
                design = n.get("design")
                design_txt = " ".join(str(d) for d in design if d) if isinstance(design, list) else str(design or "")
                arts_l = n.get("artifacts")
                arts_txt = " ".join(str(a) for a in arts_l if a) if isinstance(arts_l, list) else ""
                hay = " ".join([
                    str(n.get("basis") or ""), str(n.get("io") or ""), str(n.get("role") or ""),
                    design_txt, arts_txt,
                ])
                if any(c in hay for c in dr_codes):
                    cited = True
                    break
            if not cited:
                W.append(
                    f"DR 근거 미인용 — 프로젝트에 설계 조사({', '.join(sorted(dr_codes))})가 있는데 "
                    "어떤 노드 basis에도 인용이 없음(DR의 수치·선택지·근거를 design·basis에 인용할 것)")

    stats = {
        "zones": len(zones), "nodes": len(nodes), "edges": len(edges), "scenarios": len(scenarios),
        # BP 커버리지 리포트(집계용): 이 모델이 참조하는 전체 코드(노드 artifacts ∪ 시나리오 covers)
        # + covers 없는 시나리오 목록(여정↔요구 미연결).
        "refs": {a for _, _, a in referenced},
        "no_covers": no_covers,
    }
    return E, W, stats


# ---------------------------------------------------------------- BP 커버리지 경고 (wfscan SAE 커버리지 동형)
def _coverage_report(all_refs, no_covers_all, plm_codes, project):
    """BP 커버리지 리포트 — 프로젝트 UCS·SRS 중 어떤 노드 artifacts/시나리오 covers도 참조하지 않는
    코드와, covers 없는 시나리오를 크게 표면화한다(ADR-033 — 얇은 설계도 근본 차단).
    에러 아님(비차단·exit 코드 무관) — 하지만 놓칠 수 없게 wfscan SAE 커버리지와 동형 마커로 출력."""
    if plm_codes is None:
        print("\n[bpcheck] ⚠ PLM 미도달 — BP 커버리지 판정 생략(UCS·SRS 대조 불가)")
        return
    ucs_srs = {c for c, (t, _) in plm_codes.items() if t in ("UCS", "SRS")}
    if not ucs_srs and not no_covers_all:
        return  # 대조할 요구도, 지적할 시나리오도 없음 — 침묵
    uncovered = sorted(ucs_srs - all_refs)
    covered = len(ucs_srs) - len(uncovered)
    print("\n" + "=" * 66)
    print(f"  ▍BP 커버리지: UCS·SRS {covered}/{len(ucs_srs)} 커버 · 미커버 {len(uncovered)}"
          f" · covers 없는 시나리오 {len(no_covers_all)}")
    if not uncovered and not no_covers_all:
        print("  ✅ 전 UCS·SRS가 설계도에 연결 · 전 시나리오가 covers 보유 — 여정↔요구 완전 연결.")
        print("=" * 66)
        return
    if uncovered:
        print("  ⚠ 어떤 노드 artifacts/시나리오 covers도 참조하지 않는 요구(설계도 밖):")
        for c in uncovered:
            title = plm_codes.get(c, ("", ""))[1]
            print(f"      ✗ {c}   {title[:44]}")
    if no_covers_all:
        print("  ⚠ covers 없는 시나리오(여정↔요구 연결 없음 — v1.1 persona·covers 표준):")
        for fname, sid, label in no_covers_all:
            print(f"      ✗ {fname} {sid}   {label[:40]}")
    print("")
    print("  → 액션: 페르소나별 E2E 여정 시나리오를 저작해 covers(→UCS/SRS)로 연결하거나,")
    print("    해당 요구를 다루는 노드에 artifacts로 참조하세요(_BLUEPRINT-METHODOLOGY §3.6).")
    print(f"    경고(비차단) — 요구와 연결되지 않은 설계도는 검증 불가한 그림일 뿐입니다. (project={project})")
    print("=" * 66)


# ---------------------------------------------------------------- main
def main():
    argv = sys.argv[1:]

    def arg(flag):
        if flag in argv:
            try:
                return argv[argv.index(flag) + 1]
            except IndexError:
                return None
        return None

    cfg = resolve()
    project = arg("--project") or cfg["project"]
    single = arg("--file")

    if single:
        files = [single]
    else:
        bp_dir = cfg.get("bp_dir")
        if not bp_dir or not os.path.isdir(bp_dir):
            print(f"[bpcheck] 블루프린트 디렉토리 없음: {bp_dir or '.ouroboros/docs/blueprint'} — 검사 대상 0건")
            return 0
        files = sorted(glob.glob(os.path.join(bp_dir, "BP-*.json")))
        if not files:
            print(f"[bpcheck] {bp_dir} 에 BP-*.json 없음 — 검사 대상 0건")
            return 0

    # PLM 아티팩트 코드 집합(1회) — artifacts[] 실존 대조. 토큰/프로젝트 없으면 경고로 강등.
    plm_codes = None
    if project and cfg["plm_token"]:
        plm_codes = plm_export_codes(cfg["plm_api"], cfg["plm_token"], project)
        if plm_codes is None:
            print(f"[bpcheck] ⚠ PLM /export 조회 실패({cfg['plm_api']} · project={project}) — artifacts 실존 검사 생략")
    else:
        print("[bpcheck] ⚠ PLM 토큰/프로젝트 미설정 — artifacts 실존 검사 생략(.ouroboros/env/.env PLM_API_TOKEN · plm.json project)")

    total_e = total_w = 0
    all_refs = set()  # 전 BP의 노드 artifacts ∪ 시나리오 covers — 커버리지 판정(프로젝트 단위 합집합)
    no_covers_all = []  # (파일, 시나리오 id, label)
    print(f"[bpcheck] project={project or '(미바인딩)'} — 파일 {len(files)}개 검사")
    for path in files:
        if not os.path.isfile(path):
            print(f"\n  {os.path.basename(path)}\n    ✗ [E] 파일 없음: {path}")
            total_e += 1
            continue
        E, W, stats = check_file(path, plm_codes)
        total_e += len(E)
        total_w += len(W)
        all_refs |= stats.get("refs") or set()
        for sid, label in stats.get("no_covers") or []:
            no_covers_all.append((os.path.basename(path), sid, label))
        dims = f"(존 {stats.get('zones', '?')} · 노드 {stats.get('nodes', '?')} · 엣지 {stats.get('edges', '?')} · 시나리오 {stats.get('scenarios', '?')})" if stats else ""
        print(f"\n  {os.path.basename(path)} {dims}")
        if not E and not W:
            print("    ✓ 에러 0 · 경고 0")
        for m in E:
            print(f"    ✗ [E] {m}")
        for m in W:
            print(f"    ⚠ [W] {m}")

    # BP 커버리지 리포트(최후 · 가장 눈에 띔 — wfscan SAE 커버리지 동형). 경고 전용(비차단).
    _coverage_report(all_refs, no_covers_all, plm_codes, project)

    verdict = "FAIL" if total_e else "PASS"
    print(f"\n[bpcheck] 합계: 에러 {total_e} · 경고 {total_w} → {verdict}")
    if total_e:
        print("  → 에러를 0으로 만든 뒤 저장(plm-sync 자동 동기) — 에러 상태로 탭 확인 안내 금지.")
    return 1 if total_e else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"[bpcheck] 예외: {str(e)[:120]}")
        sys.exit(1)
