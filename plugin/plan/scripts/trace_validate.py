#!/usr/bin/env python3
"""trace_validate — 기획 요구→설계 traceability 검증 + G1/G2 게이트.

노드 = {URS, UCS, SRS, SAD, ADR, Roadmap}  (SDS·DO·UT·TP·TC 없음 — 기획 범위)
백본(owner=로컬 작성 측):
  UCS ─elaborates→ URS ; SRS ─derives_from→ URS ; SAD ─refs→ SRS ;
  ADR ─informs→ SRS,SAD ; ADR ─supersedes→ ADR ; Roadmap ─covers→ URS,SRS
게이트(기계조건, 소프트):
  G1 = 모든 SRS 가 derives_from(→URS) 보유 (타깃 존재)
  G2 = 모든 SAD 가 refs(→SRS) 보유 (타깃 존재)

모드:
  trace_validate.py                 # 전수 리포트(기본)
  trace_validate.py --full          # 전수 리포트
  trace_validate.py --file <path>   # 단일 파일 증분(orphan/dangling 경고 1줄)
  trace_validate.py --update-state   # state.json.gates 갱신
  trace_validate.py --matrix <out>  # traceability 매트릭스 마크다운 생성
경로: $CLAUDE_PROJECT_DIR/.ouroboros 기준(없으면 상위로 탐색).
"""
import os, sys, json, glob, re

# owner relation 필드(타입별) + 타깃 허용 타입
REL = {
    "UCS": {"elaborates": {"URS"}},
    "SRS": {"derives_from": {"URS"}},
    "SAD": {"refs": {"SRS"}},
    "ADR": {"informs": {"SRS", "SAD"}, "supersedes": {"ADR"}},
    "Roadmap": {"covers": {"URS", "SRS"}},
    "URS": {},
}
DIRS = {  # 타입 → docs 하위 디렉토리
    "URS": "requirements", "UCS": "requirements", "SRS": "requirements",
    "SAD": "design", "ADR": "decisions", "Roadmap": "roadmap",
}


def find_root():
    env = os.environ.get("CLAUDE_PROJECT_DIR")
    if env and os.path.isdir(os.path.join(env, ".ouroboros")):
        return os.path.join(env, ".ouroboros")
    d = os.path.abspath(os.getcwd())
    while d != "/":
        if os.path.isdir(os.path.join(d, ".ouroboros")):
            return os.path.join(d, ".ouroboros")
        d = os.path.dirname(d)
    return os.path.join(os.getcwd(), ".ouroboros")


ROOT = find_root()
DOCS = os.path.join(ROOT, "docs")


def parse_fm(path):
    """frontmatter dict 추출(yaml 있으면 사용, 없으면 경량 파서)."""
    try:
        t = open(path, encoding="utf-8").read()
    except Exception:
        return {}
    if not t.startswith("---"):
        return {}
    # [원본] frontmatter 안 주석(예: "# --- owner relation ---")의 '---' 에서 잘리는 버그
    #        — 원복 시 아래 2줄 주석 해제하고 [개선] 블록을 주석 처리
    # try:
    #     fm = t.split("---", 2)[1]
    # except IndexError:
    #     return {}
    # [개선] 닫는 '---' 를 '한 줄 전체'로 인식해 frontmatter 만 추출 (본문/주석의 --- 무시)
    mfm = re.match(r"^---\n(.*?)\n---\s*(?:\n|$)", t, re.S)
    if not mfm:
        return {}
    fm = mfm.group(1)
    try:
        import yaml
        return yaml.safe_load(fm) or {}
    except Exception:
        pass
    meta, cur_key = {}, None
    for ln in fm.splitlines():
        if re.match(r"^\s*#", ln) or not ln.strip():
            continue
        m = re.match(r"^([A-Za-z_]+):\s*(.*)$", ln)
        if m:
            k, v = m.group(1), m.group(2).strip()
            if v in ("", "[]"):
                meta[k] = [] if v == "[]" else ""
                cur_key = k
            elif v.startswith("["):
                meta[k] = [x.strip().strip('"\'') for x in v.strip("[]").split(",") if x.strip()]
                cur_key = None
            else:
                meta[k] = v.strip('"\'')
                cur_key = None
        elif cur_key and re.match(r"^\s*-\s+", ln):
            meta.setdefault(cur_key, [])
            meta[cur_key].append(re.sub(r"^\s*-\s+", "", ln).strip().strip('"\''))
    return meta


def load_all():
    """모든 아티팩트 → {id: {type, rels:{field:[ids]}, path}}."""
    nodes = {}
    for t, sub in DIRS.items():
        for f in glob.glob(os.path.join(DOCS, sub, "*.md")):
            if os.path.basename(f).startswith("_"):
                continue
            fm = parse_fm(f)
            if fm.get("type") != t or not fm.get("id"):
                continue
            rels = {}
            for field in REL.get(t, {}):
                v = fm.get(field)
                if isinstance(v, str):
                    v = [v] if v and v != "null" else []
                rels[field] = [x for x in (v or []) if x]
            nodes[fm["id"]] = {"type": t, "rels": rels, "path": f, "status": fm.get("status", "Draft")}
    return nodes


def analyze(nodes):
    ids = set(nodes)
    orphans, dangling, g1_viol, g2_viol = [], [], [], []
    for nid, n in nodes.items():
        t = n["type"]
        for field, targets in n["rels"].items():
            allowed = REL[t][field]
            for tgt in targets:
                if tgt not in ids:
                    dangling.append((nid, field, tgt))
                elif nodes[tgt]["type"] not in allowed:
                    dangling.append((nid, field, tgt + f"(타입 불일치:{nodes[tgt]['type']})"))
        if t == "SRS" and not n["rels"].get("derives_from"):
            g1_viol.append(nid); orphans.append((nid, "SRS: derives_from 없음(G1)"))
        if t == "SAD" and not n["rels"].get("refs"):
            g2_viol.append(nid); orphans.append((nid, "SAD: refs 없음(G2)"))
    srs = [i for i, n in nodes.items() if n["type"] == "SRS"]
    sad = [i for i, n in nodes.items() if n["type"] == "SAD"]
    return {
        "orphans": orphans, "dangling": dangling,
        "G1": "pass" if not g1_viol and srs else ("pending" if not srs else "warn"),
        "G2": "pass" if not g2_viol and sad else ("pending" if not sad else "warn"),
        "g1_viol": g1_viol, "g2_viol": g2_viol,
        "counts": {t: sum(1 for n in nodes.values() if n["type"] == t) for t in DIRS},
    }


def report(nodes, a):
    print(f"[trace] 노드 {len(nodes)}: " + ", ".join(f"{t}={a['counts'][t]}" for t in DIRS))
    print(f"[trace] G1(요구)={a['G1']}  G2(설계)={a['G2']}")
    if a["orphans"]:
        print("⚠ orphan:")
        for i, why in a["orphans"]:
            print(f"  - {i}: {why}")
    if a["dangling"]:
        print("⚠ dangling(존재하지 않는 타깃):")
        for src, field, tgt in a["dangling"]:
            print(f"  - {src}.{field} → {tgt}")
    if not a["orphans"] and not a["dangling"]:
        print("[trace] orphan 0 · dangling 0 ✓")


def update_state(a):
    p = os.path.join(ROOT, "context", "state.json")
    try:
        st = json.load(open(p)) if os.path.exists(p) else {}
    except Exception:
        st = {}
    st.setdefault("gates", {})
    st["gates"]["G1"] = a["G1"]
    st["gates"]["G2"] = a["G2"]
    try:
        import time
        st["last_gate_check"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    except Exception:
        pass
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    json.dump(st, open(tmp, "w"), indent=2, ensure_ascii=False)
    os.replace(tmp, p)
    print(f"[trace] state.gates 갱신: G1={a['G1']} G2={a['G2']}")


def matrix(nodes, a, out):
    """행=URS, 열=[UCS,SRS,SAD,ADR,Roadmap] 역산 매트릭스."""
    urs = sorted(i for i, n in nodes.items() if n["type"] == "URS")
    def rev(t, field, target_id):
        return sorted(i for i, n in nodes.items()
                      if n["type"] == t and target_id in n["rels"].get(field, []))
    lines = ["# Traceability Matrix\n", f"> G1={a['G1']} · G2={a['G2']} · 생성: trace_validate\n",
             "| URS | UCS | SRS | SAD(via SRS) | ADR | Roadmap |",
             "|-----|-----|-----|--------------|-----|---------|"]
    for u in urs:
        ucs = rev("UCS", "elaborates", u) or ["⚠"]
        srs = rev("SRS", "derives_from", u)
        sad = sorted({s for sr in srs for s in rev("SAD", "refs", sr)})
        adr = sorted({i for i, n in nodes.items() if n["type"] == "ADR"
                      and (u in n["rels"].get("informs", []))})
        rm = rev("Roadmap", "covers", u)
        lines.append(f"| {u} | {','.join(ucs)} | {','.join(srs) or '⚠'} | "
                     f"{','.join(sad) or '-'} | {','.join(adr) or '-'} | {','.join(rm) or '-'} |")
    lines += ["", "## 게이트", f"- **G1 요구**: {a['G1']}" + (f" — 위반 {a['g1_viol']}" if a['g1_viol'] else ""),
              f"- **G2 설계**: {a['G2']}" + (f" — 위반 {a['g2_viol']}" if a['g2_viol'] else ""),
              f"- orphan {len(a['orphans'])} · dangling {len(a['dangling'])}"]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print(f"[trace] 매트릭스 → {out}")


def check_file(path, nodes, a):
    fm = parse_fm(path)
    nid = fm.get("id")
    if not nid:
        return
    issues = [w for i, w in a["orphans"] if i == nid] + \
             [f"{f}→{t}(없음)" for s, f, t in a["dangling"] if s == nid]
    if issues:
        print(f"⚠ {nid}: " + "; ".join(issues))


def main():
    args = sys.argv[1:]
    nodes = load_all()
    a = analyze(nodes)
    if "--file" in args:
        check_file(args[args.index("--file") + 1], nodes, a)
        return
    if "--matrix" in args:
        out = args[args.index("--matrix") + 1]
        matrix(nodes, a, out)
    if "--update-state" in args:
        update_state(a)
    if "--file" not in args and "--matrix" not in args or "--full" in args:
        report(nodes, a)


if __name__ == "__main__":
    main()
