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


def _artifact_meta(path):
    """ADR-019 동형: .json(래퍼+relations 객체) 또는 .md(frontmatter)에서 통합 메타 추출.
    반환은 parse_fm과 동형(rel 필드를 평탄화한 dict) — 하위 로직 변경 없이 .json 지원."""
    if path.endswith(".json"):
        try:
            d = json.load(open(path, encoding="utf-8"))
        except Exception:
            return {}
        meta = {"id": d.get("id"), "type": d.get("type"), "status": d.get("status", "Draft")}
        for k, v in (d.get("relations") or {}).items():
            meta[k] = v  # field → [ids] | str | null (하위 rels 추출이 정규화)
        return meta
    return parse_fm(path)


def load_all():
    """모든 아티팩트 → {id: {type, rels:{field:[ids]}, path}}."""
    nodes = {}
    seen_ids = {}  # GOV-07: 채번 race(max+1 동시작성·브랜치 충돌)로 같은 ID가 둘 이상 파일에 생기는지 감지.
    for t, sub in DIRS.items():
        # ADR-019: .json(canonical) 우선 + .md(이행기). 파일 stem 기준 dedup(.json 우선 — 중복 시 .json 유지).
        files = {}
        for ext in (".json", ".md"):
            for f in glob.glob(os.path.join(DOCS, sub, "*" + ext)):
                files.setdefault(os.path.splitext(os.path.basename(f))[0], f)
        for f in files.values():
            if os.path.basename(f).startswith("_"):
                continue
            fm = _artifact_meta(f)
            if fm.get("type") != t or not fm.get("id"):
                continue
            aid = fm["id"]
            if aid in seen_ids:
                # 비차단 경고 — ID 충돌은 즉시 사람이 재채번해야 추적 정합 유지.
                print(f"⚠ GOV-07 중복 ID: {aid} — {seen_ids[aid]} 와 {f} (채번 충돌·재채번 필요)")
            seen_ids[aid] = f
            # GOV-11: Replaced 아티팩트는 추적 그래프에서 제외(DB v_orphans와 시맨틱 정렬 — 대체된
            # 아티팩트가 추적 링크·매트릭스에 잔존하지 않게).
            if str(fm.get("status", "")).strip().lower() == "superseded":
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
    orphans, dangling, g1_viol, g2_viol, stale_super = [], [], [], [], []
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
        # GOV-05: UCS·Roadmap·ADR도 추적 누락을 침묵하지 않게 orphan 경고(게이트 외 소프트). 비차단.
        if t == "UCS" and not n["rels"].get("elaborates"):
            orphans.append((nid, "UCS: elaborates(→URS) 없음 — 어느 요구를 구체화하는지 불명"))
        if t == "Roadmap" and not n["rels"].get("covers"):
            orphans.append((nid, "Roadmap: covers(→URS/SRS) 없음 — 어느 요구를 커버하는지 불명"))
        if t == "ADR" and not n["rels"].get("informs") and not n["rels"].get("supersedes"):
            orphans.append((nid, "ADR: informs(→SRS/SAD)·supersedes 모두 없음 — 영향 대상 불명"))
        # GOV-03: ADR이 supersedes하는 대상이 아직 추적 그래프에 active로 남아있으면(=Replaced 미전이)
        # 경고 — 피대체 ADR의 status가 PLM에서 Replaced로 전이돼야 함(로컬은 status 미소유·경고만).
        if t == "ADR":
            for tgt in n["rels"].get("supersedes", []):
                if tgt in ids:  # load_all이 Replaced를 제외하므로 ids에 남았으면 = 아직 active
                    stale_super.append((tgt, f"ADR {nid}에 의해 대체됨 — PLM에서 Replaced 전이 필요"))
    srs = [i for i, n in nodes.items() if n["type"] == "SRS"]
    sad = [i for i, n in nodes.items() if n["type"] == "SAD"]
    return {
        "orphans": orphans, "dangling": dangling, "stale_super": stale_super,
        "G1": "pass" if not g1_viol and srs else ("pending" if not srs else "warn"),
        "G2": "pass" if not g2_viol and sad else ("pending" if not sad else "warn"),
        "g1_viol": g1_viol, "g2_viol": g2_viol,
        "counts": {t: sum(1 for n in nodes.values() if n["type"] == t) for t in DIRS},
    }


def report(nodes, a):
    print(f"[trace] 노드 {len(nodes)}: " + ", ".join(f"{t}={a['counts'][t]}" for t in DIRS))
    print(f"[trace] G1(요구)={a['G1']}  G2(설계)={a['G2']}")
    # GOV-02: 게이트 권위는 PLM(v_orphans)이며, 이 로컬 판정은 **예방용 미리보기**다(Replaced 제외·동일
    # 술어로 정합화했으나, status 전이 등 PLM 권위 데이터와 시점차로 다를 수 있음). 승인 판단은 PLM 대시보드 기준.
    print("[trace] ※ 게이트 권위=PLM(/gates). 이 출력은 예방용 미리보기(편집 즉시 확인용).")
    if a["orphans"]:
        print("⚠ orphan:")
        for i, why in a["orphans"]:
            print(f"  - {i}: {why}")
    if a["dangling"]:
        print("⚠ dangling(존재하지 않는 타깃):")
        for src, field, tgt in a["dangling"]:
            print(f"  - {src}.{field} → {tgt}")
    if a.get("stale_super"):
        print("⚠ supersede 미전이(GOV-03 — PLM에서 Replaced 전이 필요):")
        for tgt, why in a["stale_super"]:
            print(f"  - {tgt}: {why}")
    if not a["orphans"] and not a["dangling"] and not a.get("stale_super"):
        print("[trace] orphan 0 · dangling 0 ✓")


def update_state(a):
    p = os.path.join(ROOT, "context", "state.json")
    # BUG-① (Windows 데이터손실 방지): 명시 utf-8 read/write + 읽기 실패 시 비파괴.
    # 과거: 인코딩 미지정 json.load가 Windows 기본 cp949로 UTF-8(한글 task명) state.json을
    # 못 읽어 UnicodeDecodeError → except st={}로 gates 4키만 남기고 tasks 등 전체 소실.
    # 원칙: "gates 갱신 실패 > 전체 파괴" — read 실패 시 파일 무수정하고 게이트 갱신만 포기.
    if os.path.exists(p):
        try:
            with open(p, encoding="utf-8") as f:
                st = json.load(f)
        except Exception as e:
            print(f"[trace] state.json 읽기 실패 — 게이트 갱신 건너뜀(파일 보존): {e}")
            return
    else:
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
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, indent=2, ensure_ascii=False)
    os.replace(tmp, p)
    print(f"[trace] state.gates 갱신: G1={a['G1']} G2={a['G2']}")


def matrix(nodes, a, out):
    """행=URS, 열=[UCS,SRS,SAD,ADR,Roadmap] 역산 매트릭스."""
    urs = sorted(i for i, n in nodes.items() if n["type"] == "URS")
    def rev(t, field, target_id):
        return sorted(i for i, n in nodes.items()
                      if n["type"] == t and target_id in n["rels"].get(field, []))
    # GOV-06: 헤더에 생성 UTC + 노드 수(드리프트 감지). GOV-08: G3(코드) 게이트는 PLM 권위 안내.
    import datetime as _dt
    _ts = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    _counts = {}
    for _n in nodes.values():
        _counts[_n["type"]] = _counts.get(_n["type"], 0) + 1
    _csum = " / ".join(f"{k} {v}" for k, v in sorted(_counts.items()))
    lines = ["# Traceability Matrix\n",
             f"> G1={a['G1']} · G2={a['G2']} · 생성 {_ts} · 노드: {_csum or '0'}\n",
             "> G3(코드 게이트·구현 추적)은 PLM 권위 — `/plm-hub:gates`로 확인(로컬 매트릭스 범위 밖).\n",
             "| URS | UCS | SRS | SAD(via SRS) | ADR | Roadmap |",
             "|-----|-----|-----|--------------|-----|---------|"]
    for u in urs:
        ucs = rev("UCS", "elaborates", u) or ["⚠"]
        srs = rev("SRS", "derives_from", u)
        sad = sorted({s for sr in srs for s in rev("SAD", "refs", sr)})
        # GOV-01: ADR.informs는 SRS/SAD를 가리킨다(URS 직접 아님) → URS 행에 매핑하려면 그 URS로
        # derives_from된 SRS집합·그 SRS를 refs하는 SAD집합을 informs하는 ADR을 역산. 과거 'u in informs'는
        # 절대 매치 안 돼 ADR 컬럼이 구조적으로 항상 빈값이었음.
        srs_sad = set(srs) | set(sad)
        adr = sorted({i for i, n in nodes.items() if n["type"] == "ADR"
                      and (set(n["rels"].get("informs", [])) & srs_sad)})
        rm = rev("Roadmap", "covers", u)
        lines.append(f"| {u} | {','.join(ucs)} | {','.join(srs) or '⚠'} | "
                     f"{','.join(sad) or '-'} | {','.join(adr) or '-'} | {','.join(rm) or '-'} |")
    # GOV-12: URS 행 매트릭스는 SAD를 "via SRS"로만 역산 → SRS가 orphan(derives_from 없음)인 SAD는
    # 어느 URS 행에도 안 나타나 추적에서 누락. 그런 SAD를 별도 섹션으로 표면화.
    urs_set = set(urs)
    linked_sad = {s for u in urs_set for sr in rev("SRS", "derives_from", u) for s in rev("SAD", "refs", sr)}
    all_sad = {i for i, n in nodes.items() if n["type"] == "SAD"}
    orphan_sad = sorted(all_sad - linked_sad)
    if orphan_sad:
        lines += ["", "## ⚠ URS 미연결 SAD (via SRS 추적 누락)",
                  "> 아래 SAD는 derives_from→URS 사슬에 닿지 않는 SRS만 refs하거나 직접 미연결 — 추적 보강 필요.",
                  *(f"- {s}" for s in orphan_sad)]
    lines += ["", "## 게이트", f"- **G1 요구**: {a['G1']}" + (f" — 위반 {a['g1_viol']}" if a['g1_viol'] else ""),
              f"- **G2 설계**: {a['G2']}" + (f" — 위반 {a['g2_viol']}" if a['g2_viol'] else ""),
              f"- orphan {len(a['orphans'])} · dangling {len(a['dangling'])}"]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print(f"[trace] 매트릭스 → {out}")


def check_file(path, nodes, a):
    fm = _artifact_meta(path)  # ADR-019 동형: .json(래퍼) + .md(frontmatter). parse_fm은 .md 전용이라 .json id 누락됐음.
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
