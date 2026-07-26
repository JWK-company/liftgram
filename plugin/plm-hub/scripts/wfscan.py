#!/usr/bin/env python3
"""penpot Wireframes 프로젝트의 프레임을 스캔 → 각 프레임을 PLM `Wireframe` 아티팩트로 멱등 발급.

codescan(plm_codescan.py)의 패턴을 차용한다:
  1) penpot RPC(서버 token)로 팀 `PLM · {project}` → `Wireframes` 프로젝트 → 파일 → 프레임(board) 취득.
  2) 프레임 name 규약 `<CODE> <라벨>`에서 SCREEN_CODE 파싱(앞 토큰이 [A-Z]{2,6}). 미준수는 스킵(경고).
  3) 각 SCREEN_CODE → PLM 아티팩트 `WF-<SCREEN_CODE>` 존재 확인 → 없으면 발급(type=Wireframe,
     title=프레임 name). **본문 = 요소별 SAE 표 자동 채움** — `<sae-dir>/WF-<CODE>.json`(기본
     `.ouroboros/docs/wireframes`) SAE 스펙을 찾으면 loc 딥링크 + screen_code·route + 요소 SAE 표
     (열=요소코드·유형·라벨·상태·액션·이펙트)로 리치 생성(파서=_sae_parse, wfgen 과 규약 공유). 스펙 없으면
     loc+메타만 담는 얇은 폴백. covers(→UCS/SRS)가 스펙에 있으면 발급 시 관계로 실음(dst 미존재 시 안전 스킵).
     이미 있으면 비파괴 스킵 — 단 리치 스펙이 있고 기존 본문이 얇으면 SAE 표로 보강(이미 리치면 회귀 방지).
  4) 스캔/발급/본문보강/스킵 카운트를 표로 보고.

graceful: 실패해도 exit 0(비차단). Cloudflare 회피 위해 모든 HTTP에 user-agent 명시.

토큰/설정(우선순위 env > .ouroboros/env/.env > .ouroboros/config/plm.json > 기본값):
  PLM     — PLM_API_URL(기본 https://jwk-plm.shoi.ch) · PLM_API_TOKEN · PLM_PROJECT
  penpot  — PENPOT_API_URL(기본 https://jwk-wf.shoi.ch) · PENPOT_ACCESS_TOKEN(별칭 PENPOT_API_TOKEN)

인자:
  --dry-run   발급/보강하지 않고 스캔 결과·발급예정·보강예정 목록만 출력(검증용).
  --project X PLM/penpot 팀 프로젝트명 오버라이드(기본 plm.json project).
  --sae-dir D SAE 스펙(WF-<CODE>.json) 디렉토리 오버라이드(기본 <ouro>/docs/wireframes).
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request
from urllib.parse import quote

# SAE 파서는 공용 모듈(_sae_parse) SSOT — wfgen 과 규약 100% 공유(계획서 요구). 스크립트 자기 디렉토리 보장.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _sae_parse import load_sae_spec  # noqa: E402

# penpot 루트 보드(캔버스) uuid — 최상위 프레임은 parentId 가 이 값.
ROOT_UUID = "00000000-0000-0000-0000-000000000000"
# 프레임 name 앞 토큰이 이 패턴이면 SCREEN_CODE. 아니면 규약 미준수 → 스킵.
SCREEN_CODE_RE = re.compile(r"^[A-Z]{2,6}$")
UA = "plm-wfscan/1.0"


# ---------------------------------------------------------------- 설정 해석
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
    """PLM·penpot 설정을 env > .env > plm.json > 기본값 순으로 해석."""
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
    penpot_api = pick(os.environ.get("PENPOT_API_URL"), envf.get("PENPOT_API_URL"),
                      default="https://jwk-wf.shoi.ch").rstrip("/")
    penpot_token = pick(os.environ.get("PENPOT_ACCESS_TOKEN"), os.environ.get("PENPOT_API_TOKEN"),
                        envf.get("PENPOT_ACCESS_TOKEN"), envf.get("PENPOT_API_TOKEN"))
    # SAE 스펙 디렉토리 기본값 = <ouro>/docs/wireframes(wfgen 과 동일). --sae-dir 로 오버라이드.
    sae_dir = None
    if ouro:
        cand = os.path.join(ouro, "docs", "wireframes")
        sae_dir = cand if os.path.isdir(cand) else None
    return {
        "plm_api": plm_api, "plm_token": plm_token, "project": project,
        "penpot_api": penpot_api, "penpot_token": penpot_token, "ouro": ouro,
        "sae_dir": sae_dir,
    }


def _selfheal_penpot_token(plm_api, plm_token, ouro):
    """PENPOT_ACCESS_TOKEN 미설정 시 PLM 인증으로 GET {plm_api}/penpot-token 대행 발급받아
    (ⓐ 이번 실행에 사용 + ⓑ .ouroboros/env/.env 에 한 줄 append·멱등) 토큰 반환. 실패(404/네트워크)시 None.
    ouro-token 자동 프로비저닝(installer·mcp-auth) 미러링. Cloudflare 회피 위해 user-agent 명시."""
    if not plm_api or not plm_token:
        return None
    req = urllib.request.Request(f"{plm_api.rstrip('/')}/penpot-token", method="GET")
    req.add_header("authorization", f"Bearer {plm_token}")
    req.add_header("accept", "application/json")
    req.add_header("user-agent", UA)  # Cloudflare 가 기본 urllib UA 차단(403)
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            raw = r.read().decode()
        tok = (json.loads(raw).get("token") if raw else None)
    except Exception:
        return None
    if not tok:
        return None
    if ouro:  # .env 에 멱등 append (이미 있으면 스킵) — 비밀이라 값은 출력하지 않는다.
        envp = os.path.join(ouro, "env", ".env")
        try:
            existing = open(envp, encoding="utf-8").read() if os.path.isfile(envp) else ""
            if not re.search(r"(?m)^PENPOT_ACCESS_TOKEN=", existing):
                with open(envp, "a", encoding="utf-8") as f:
                    if existing and not existing.endswith("\n"):
                        f.write("\n")
                    f.write(f"PENPOT_ACCESS_TOKEN={tok}\n")
        except Exception:
            pass
    return tok


# ---------------------------------------------------------------- HTTP
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


def penpot_rpc(base, token, cmd, body=None):
    """penpot RPC — POST /api/rpc/command/<cmd>, Authorization: Token <penpot-token>."""
    return _http(f"{base}/api/rpc/command/{cmd}", token, "Token", body or {}, "POST")


def plm_get(api, token, path):
    return _http(f"{api}{path}", token, "Bearer", None, "GET")


def plm_import(api, token, project, arts, rels):
    return _http(f"{api}/import", token, "Bearer",
                 {"project": project, "artifacts": arts, "relations": rels}, "POST")


def plm_put_doc(api, token, project, code, doc):
    """ADR-019 동형: 본문 canonical = doc(ProseMirror). import(메타) 후 PUT /doc 로 저장."""
    return _http(f"{api}/artifacts/{quote(project)}/{quote(code)}/doc", token, "Bearer",
                 {"doc": doc, "schema_version": 1}, "PUT", timeout=15)


def plm_get_doc(api, token, project, code):
    """GET /artifacts/{p}/{c}/doc → 내부 ProseMirror doc(dict) 반환. 실패/부재 시 None(비파괴 판정용)."""
    resp = _http(f"{api}/artifacts/{quote(project)}/{quote(code)}/doc", token, "Bearer", None, "GET", timeout=15)
    return resp.get("doc") if isinstance(resp, dict) else None


def artifact_exists(api, token, project, code):
    """GET /artifacts/{project}/{code} → 200=존재 / 404=미존재 / 그 외=예외(상위에서 경고)."""
    try:
        plm_get(api, token, f"/artifacts/{quote(project)}/{quote(code)}")
        return True
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        raise


# ---------------------------------------------------------------- penpot 파싱
def _pget(obj, *keys, default=None):
    """penpot JSON 응답 키 표기 방어(camelCase/kebab-case 혼재 대비 — accept:json 인코딩 불확실)."""
    if isinstance(obj, dict):
        for k in keys:
            if k in obj:
                return obj[k]
    return default


def find_team(base, token, project):
    """name == `PLM · {project}` 팀 id."""
    wanted = f"PLM · {project}"
    teams = penpot_rpc(base, token, "get-teams", {})
    if not isinstance(teams, list):
        return None
    for t in teams:
        if _pget(t, "name") == wanted:
            return _pget(t, "id")
    return None


def find_project(base, token, team_id, name="Wireframes"):
    """팀 안의 penpot 프로젝트(폴더) name==Wireframes id."""
    projects = penpot_rpc(base, token, "get-projects", {"team-id": team_id})
    if not isinstance(projects, list):
        return None
    for p in projects:
        if _pget(p, "name") == name:
            return _pget(p, "id")
    return None


def list_files(base, token, project_id):
    """프로젝트의 파일 목록 → [(file_id, file_name), ...]."""
    files = penpot_rpc(base, token, "get-project-files", {"project-id": project_id})
    out = []
    if isinstance(files, list):
        for f in files:
            fid, fname = _pget(f, "id"), _pget(f, "name")
            if fid:
                out.append((fid, fname or fid))
    return out


def file_frames(base, token, file_id):
    """파일의 최상위 프레임(board) 목록 → [(frame_id, frame_name), ...].
    data.pagesIndex[*].objects 중 type=='frame' 이고 parentId==ROOT_UUID 인 오브젝트."""
    f = penpot_rpc(base, token, "get-file", {"id": file_id})
    data = _pget(f, "data")
    pages = _pget(data, "pagesIndex", "pages-index") if isinstance(data, dict) else None
    frames = []
    if not isinstance(pages, dict):
        return frames, False  # data 파싱 실패 신호(구조 상이 → 경고)
    for page in pages.values():
        objects = _pget(page, "objects")
        if not isinstance(objects, dict):
            continue
        for oid, o in objects.items():
            if _pget(o, "type") != "frame":
                continue
            parent = _pget(o, "parentId", "parent-id")
            if parent != ROOT_UUID:
                continue
            fid = _pget(o, "id") or oid
            frames.append((fid, (_pget(o, "name") or "").strip()))
    return frames, True


def parse_screen_code(name):
    """프레임 name 앞 토큰이 [A-Z]{2,6} 이면 SCREEN_CODE, 아니면 None(규약 미준수)."""
    if not name:
        return None
    head = name.strip().split()[0] if name.strip().split() else ""
    return head if SCREEN_CODE_RE.match(head) else None


def _codemark(s):
    return {"type": "text", "marks": [{"type": "code"}], "text": s}


def _meta_nodes(frame_name, screen_code, loc, route=None, name=None):
    """공통 상단부 — H2 헤딩 + loc 딥링크 + screen_code(·route) 메타."""
    meta = f"screen_code: {screen_code}"
    if route:
        meta += f" · route: {route}"
    return [
        {"type": "heading", "attrs": {"level": 2},
         "content": [{"type": "text", "text": name or frame_name or screen_code}]},
        {"type": "paragraph",
         "content": [{"type": "text", "text": "loc: "}, _codemark(loc)]},
        {"type": "paragraph",
         "content": [{"type": "text", "text": meta}]},
    ]


def _cell(s, header=False):
    """table_cell/table_header — 셀 본문은 paragraph(block+). 빈 값이면 빈 문단(ProseMirror text 는 비어질 수 없음)."""
    para = {"type": "paragraph"}
    s = (s or "").strip()
    if s:
        para["content"] = [{"type": "text", "text": s}]
    return {"type": "table_header" if header else "table_cell", "content": [para]}


def _row(cells, header=False):
    return {"type": "table_row", "content": [_cell(c, header) for c in cells]}


def _sae_table(elements):
    """요소별 SAE 표 — 열=[요소코드, 유형, 라벨, 상태, 액션, 이펙트]. 상태/액션/이펙트가 시각적으로 분리."""
    rows = [_row(["요소코드", "유형", "라벨", "상태", "액션", "이펙트"], header=True)]
    for el in elements:
        rows.append(_row([
            el.get("code", ""), el.get("type", ""), el.get("label", ""),
            el.get("state", ""), el.get("action", ""), el.get("effect", ""),
        ]))
    return {"type": "table", "content": rows}


def build_thin_doc(frame_name, screen_code, loc):
    """폴백 본문 — 헤딩 + loc + screen_code 메타(SAE 스펙 부재 시). canonical=doc, body 빈 문자열."""
    return {"type": "doc", "content": _meta_nodes(frame_name, screen_code, loc)}


def build_doc(frame_name, screen_code, loc, spec=None):
    """Wireframe 본문(ProseMirror). SAE 스펙(요소 있음)이면 요소별 SAE 표를 채운 **리치 본문**,
    없으면 얇은 폴백(build_thin_doc)."""
    els = (spec or {}).get("elements") or []
    if not els:
        return build_thin_doc(frame_name, screen_code, loc)
    content = _meta_nodes(frame_name, screen_code, loc,
                          route=spec.get("route"), name=spec.get("name"))
    content.append({"type": "heading", "attrs": {"level": 3},
                    "content": [{"type": "text", "text": "화면 요소 (상태·액션·이펙트)"}]})
    content.append(_sae_table(els))
    return {"type": "doc", "content": content}


def _doc_has_rich(doc):
    """본문에 표/미디어(table·image·file) 노드가 있으면 '리치'로 간주(비파괴 판정 — 얇게 덮어쓰기 방지)."""
    found = [False]

    def walk(n):
        if found[0]:
            return
        if isinstance(n, dict):
            if n.get("type") in ("table", "image", "file"):
                found[0] = True
                return
            for c in n.get("content", []) or []:
                walk(c)
        elif isinstance(n, list):
            for c in n:
                walk(c)

    walk(doc)
    return found[0]


# ---------------------------------------------------------------- SAE 커버리지 경고
def _count_sae_specs(sae_dir):
    """sae_dir 안의 SAE 스펙 파일(WF-<CODE>.json) 개수. 부재/오류 시 0."""
    if not sae_dir or not os.path.isdir(sae_dir):
        return 0
    try:
        return len([f for f in os.listdir(sae_dir) if re.match(r"^WF-[A-Z]{2,6}\.json$", f)])
    except Exception:
        return 0


def _warn_empty_sae_dir(sae_dir):
    """SAE 스펙 디렉토리 부재/공백 → 모든 본문이 얇아짐. 최상단 큰 경고(발급 전 조기 알림)."""
    print("\n" + "=" * 66)
    print("  ⚠⚠  SAE 스펙 디렉토리가 비어있음 (.ouroboros/docs/wireframes)")
    print("      → 모든 Wireframe 본문이 얇아집니다 (book-tarae 같은 요소별 SAE 표 없음).")
    print("      먼저 화면별 WF-<CODE>.json 을 저작하세요 (릴레이 플로우 step2 · 요소코드+상태·액션·이펙트).")
    if sae_dir:
        print(f"      스캔 위치: {sae_dir}")
    print("=" * 66)


def _coverage_report(rich_codes, thin_codes, project, dry):
    """SAE 커버리지 리포트 — 눈에 띄는 마커로 요약. 스펙 없는 프레임이 있으면 저작 액션을 크게 안내.

    스펙 있는(리치 발급/보강) vs 스펙 없는(얇게 발급/유지) 프레임을 대조해, 작업자가
    '스펙 없이 조용히 얇은 본문 발급'을 절대 놓치지 않도록 강하게 표면화한다(anyc 근본원인 방지)."""
    total = len(rich_codes) + len(thin_codes)
    r, t = len(rich_codes), len(thin_codes)
    print("\n" + "=" * 66)
    print(f"  ▍SAE 커버리지: {r}/{total} 리치 · {t} 스펙없음")
    if total == 0:
        print("    (발급 대상 프레임 없음 — 커버리지 판정 생략)")
        print("=" * 66)
        return
    if t == 0:
        print("  ✅ 전 프레임 SAE 리치 본문 — book-tarae 수준 요소별(상태·액션·이펙트) 표 완비.")
        print("=" * 66)
        return
    # 스펙 없는 프레임 1개↑ → 강한 경고 + 정확한 액션
    print("  ⚠ 스펙 없이 얇게 발급/유지된 화면 (요소별 SAE 표 없음 — 얇은 폴백 본문):")
    for code in thin_codes:
        print(f"      ✗ {code}   → 스펙 파일 없음: .ouroboros/docs/wireframes/{code}.json")
    print("")
    print("  → 액션: 위 각 화면의 `.ouroboros/docs/wireframes/<CODE>.json`")
    print("    (요소코드 + 상태·액션·이펙트, _WIREFRAME-SAE-METHODOLOGY 준수)을 저작한 뒤")
    print(f"    `python3 plugin/plm-hub/scripts/wfscan.py --project {project}` 를 재실행하면")
    print("    본문이 book-tarae처럼 요소별 SAE 표로 채워집니다.")
    print("    ⚠ 얇은 본문 상태로 완료 보고 금지 — 스펙을 남기지 않으면 다음 사람이 이어서 못 채웁니다.")
    print("=" * 66)


# ---------------------------------------------------------------- main
def main():
    argv = sys.argv[1:]
    dry = "--dry-run" in argv
    override = None
    if "--project" in argv:
        try:
            override = argv[argv.index("--project") + 1]
        except IndexError:
            override = None
    sae_override = None
    if "--sae-dir" in argv:
        try:
            sae_override = argv[argv.index("--sae-dir") + 1]
        except IndexError:
            sae_override = None

    cfg = resolve()
    sae_dir = sae_override or cfg.get("sae_dir")
    project = override or cfg["project"]
    if not project:
        print("[wfscan] PLM 프로젝트 미바인딩(.ouroboros/config/plm.json) — /plm-hub:link 후 재시도")
        return
    if not cfg["penpot_token"]:
        # self-heal: PLM 인증으로 penpot 토큰 대행 발급(ouro-token 미러링) → .env 자동 기입.
        healed = _selfheal_penpot_token(cfg["plm_api"], cfg["plm_token"], cfg["ouro"])
        if healed:
            cfg["penpot_token"] = healed
            print("[wfscan] penpot 토큰 자동 발급(.env) — PLM 인증으로 프로비저닝 완료.")
        else:
            print("[wfscan] penpot 토큰 없음 — .ouroboros/env/.env 에 PENPOT_ACCESS_TOKEN=<penpot 개인 액세스 토큰> 추가 필요.\n"
                  "         (penpot 계정 설정 > Access tokens 에서 발급. Authorization: Token <값> 으로 사용.)")
            return
    if not cfg["plm_token"] and not dry:
        print("[wfscan] PLM 토큰 없음 — .ouroboros/env/.env 의 PLM_API_TOKEN 확인(발급하려면 필요). --dry-run 은 penpot 만으로 가능.")
        return

    base, ptok = cfg["penpot_api"], cfg["penpot_token"]
    api, atok = cfg["plm_api"], cfg["plm_token"]

    # SAE 스펙 디렉토리 부재/공백 → 모든 본문이 얇아짐(최상단 조기 경고 — 발급 전 알림).
    sae_spec_count = _count_sae_specs(sae_dir)
    if sae_spec_count == 0:
        _warn_empty_sae_dir(sae_dir)

    # 1) penpot 팀 → Wireframes 프로젝트 → 파일 → 프레임
    try:
        team_id = find_team(base, ptok, project)
    except Exception as e:
        print(f"[wfscan] penpot get-teams 실패(비차단): {str(e)[:80]}")
        return
    if not team_id:
        print(f"[wfscan] penpot 팀 'PLM · {project}' 없음 — 와이어프레임 탭을 먼저 열어 팀을 생성하세요.")
        return
    try:
        wf_pid = find_project(base, ptok, team_id, "Wireframes")
    except Exception as e:
        print(f"[wfscan] penpot get-projects 실패(비차단): {str(e)[:80]}")
        return
    if not wf_pid:
        print(f"[wfscan] penpot 팀 'PLM · {project}' 안에 'Wireframes' 프로젝트 없음(SRS-044 미분리?).")
        return
    try:
        files = list_files(base, ptok, wf_pid)
    except Exception as e:
        print(f"[wfscan] penpot get-project-files 실패(비차단): {str(e)[:80]}")
        return

    # 2) 각 파일의 프레임 수집 + SCREEN_CODE 파싱
    scanned = []          # (file_id, file_name, frame_id, frame_name, screen_code|None)
    nonconform = []       # (file_name, frame_name) — 규약 미준수
    parse_fail = []       # file_name — data 구조 파싱 실패
    for fid, fname in files:
        try:
            frames, ok = file_frames(base, ptok, fid)
        except Exception as e:
            parse_fail.append(f"{fname} ({str(e)[:40]})")
            continue
        if not ok:
            parse_fail.append(fname)
            continue
        for frame_id, frame_name in frames:
            sc = parse_screen_code(frame_name)
            scanned.append((fid, fname, frame_id, frame_name, sc))
            if not sc:
                nonconform.append((fname, frame_name or "(무명 프레임)"))

    valid = [(fi, fn, frid, frnm, sc) for (fi, fn, frid, frnm, sc) in scanned if sc]

    # 3) 멱등 발급 — SCREEN_CODE 중복(파일 간 충돌)은 첫 것만, 나머지는 경고
    #    SAE 스펙(WF-<CODE>.json)이 있으면 본문을 요소별 SAE 표로 리치하게 채운다. 없으면 얇은 폴백.
    #    이미 존재하는 아티팩트는 (a) 리치 스펙이 있고 (b) 기존 본문이 얇을 때만 비파괴 보강(회귀 방지).
    seen_codes = {}
    issued, existing, collided, enriched = [], [], [], []
    rich_codes, thin_codes = [], []  # SAE 커버리지 추적: 스펙 리치 vs 스펙없음(얇음)
    if sae_dir:
        print(f"[wfscan] SAE 스펙 디렉토리: {sae_dir} (요소별 상태·액션·이펙트 표로 본문 리치화)")
    for fi, fn, frid, frnm, sc in valid:
        code = f"WF-{sc}"
        loc = f"penpot:{fi}:{frid}"
        if sc in seen_codes:
            collided.append((code, seen_codes[sc], loc))
            continue
        seen_codes[sc] = loc
        # SAE 스펙 로딩 → 리치 본문 + covers(→UCS/SRS) 관계
        spec = load_sae_spec(sae_dir, sc) if sae_dir else None
        rich = bool((spec or {}).get("elements"))
        (rich_codes if rich else thin_codes).append(code)  # SAE 커버리지 집계(dry/실발급 공통)
        covers = (spec or {}).get("covers") or []
        rels = [{"src": code, "rel": "covers", "dst": d} for d in covers]
        doc = build_doc(frnm, sc, loc, spec)
        # 존재 확인
        try:
            exists = artifact_exists(api, atok, project, code) if atok else False
        except Exception as e:
            print(f"[wfscan] ⚠ {code} 존재확인 실패(스킵): {str(e)[:60]}")
            continue
        if exists:
            # 비파괴 본문 보강: 리치 스펙 보유 + 기존 본문이 얇음(표/미디어 없음)일 때만 리치로 교체.
            if not rich:
                existing.append((code, frnm))
                continue
            cur = None
            if atok:
                try:
                    cur = plm_get_doc(api, atok, project, code)
                except Exception:
                    cur = None
            if cur is None or _doc_has_rich(cur):
                existing.append((code, frnm))  # 조회불가/이미 리치 → 회귀 방지 스킵
                continue
            if dry:
                enriched.append((code, frnm))  # 보강 예정
                continue
            try:
                if rels:
                    plm_import(api, atok, project, [], rels)  # covers 보강(멱등·비차단)
                plm_put_doc(api, atok, project, code, doc)
                enriched.append((code, frnm))
            except Exception as e:
                print(f"[wfscan] ⚠ {code} 본문 보강 실패(비차단): {str(e)[:70]}")
                existing.append((code, frnm))
            continue
        if dry:
            issued.append((code, frnm, loc, rich))  # 발급 예정으로 집계
            continue
        # 발급: import(메타 + covers 관계) → PUT /doc(본문 canonical)
        art = {"code": code, "type": "Wireframe", "title": (frnm or code)[:200],
               "status": "Draft", "body": ""}
        try:
            plm_import(api, atok, project, [art], rels)
            plm_put_doc(api, atok, project, code, doc)
            issued.append((code, frnm, loc, rich))
        except Exception as e:
            print(f"[wfscan] ⚠ {code} 발급 실패(비차단): {str(e)[:70]}")

    # 4) 보고
    tag = "[wfscan --dry-run]" if dry else "[wfscan]"
    print(f"\n{tag} penpot 'PLM · {project}' / Wireframes — 파일 {len(files)}개 · 프레임 {len(scanned)}개")
    print(f"  {'구분':<16} 수")
    print(f"  {'-'*16} --")
    print(f"  {'규약 준수(발급대상)':<14} {len(valid)}")
    print(f"  {('발급예정' if dry else '발급'):<16} {len(issued)}")
    print(f"  {('보강예정' if dry else '본문보강'):<15} {len(enriched)}")
    print(f"  {'기존(스킵)':<15} {len(existing)}")
    print(f"  {'규약미준수(스킵)':<13} {len(nonconform)}")
    if collided:
        print(f"  {'코드충돌(스킵)':<14} {len(collided)}")
    if parse_fail:
        print(f"  {'파일파싱실패':<14} {len(parse_fail)}")

    if issued:
        print(f"\n  {'발급' if not dry else '발급예정'}:")
        for code, nm, loc, r in issued:
            print(f"    + {code:<10} {nm}   ({loc}){'  [SAE 표]' if r else ''}")
    if enriched:
        print(f"\n  {'본문보강(얇음→SAE 표)' if not dry else '보강예정(얇음→SAE 표)'}:")
        for code, nm in enriched:
            print(f"    ↑ {code:<10} {nm}")
    if existing:
        print("\n  기존(스킵):")
        for code, nm in existing:
            print(f"    = {code:<10} {nm}")
    if nonconform:
        print("\n  ⚠ 규약 미준수(앞 토큰이 [A-Z]{2,6} 아님 → 자동 코드 미부여, 스킵):")
        for fn, nm in nonconform:
            print(f"    - [{fn}] {nm}")
    if collided:
        print("\n  ⚠ SCREEN_CODE 충돌(다른 프레임이 이미 같은 코드 사용 — 첫 것만 발급):")
        for code, first_loc, loc in collided:
            print(f"    ! {code}  이미={first_loc}  중복={loc}")
    if parse_fail:
        print("\n  ⚠ penpot 파일 data 파싱 실패(pagesIndex 구조 상이 가능 — RPC 응답 확인):")
        for fn in parse_fail:
            print(f"    ? {fn}")
    if dry:
        print("\n  (--dry-run: 실제 발급하지 않음. 제거하면 위 '발급예정'을 PLM에 Draft 발급)")

    # SAE 커버리지 리포트(최후 · 가장 눈에 띔) — 스펙없음 프레임을 강하게 표면화(dry-run 포함).
    _coverage_report(rich_codes, thin_codes, project, dry)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[wfscan] 예외(비차단): {str(e)[:100]}")
