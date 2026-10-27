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

**페이지 스코핑 = 정본만**(감사 G4): penpot 파일은 페이지를 여러 개 가질 수 있고, 와이어프레임 작업용
사본(`POST /wireframe/working-copy`)은 **같은 파일 안에 사본 페이지**를 만든다. 전 페이지를 병합해
스캔하면 사본/보관본 프레임까지 발급 대상이 되어 `WF-<CODE>` 의 `loc` 이 승격 없이 사본으로 뒤집힌다.
그래서 이 스크립트는 PLM `GET /wireframe/working-copy` 역할 대장으로 **사본(working)·보관본(archived)
페이지를 스캔에서 제외**하고, 대장이 놓치는 자리는 penpot 페이지 이름 규약(`보관 · …` / `… (작업본 · …)`)
으로 보완한다(마감된 역할 행은 서버가 `closed_at IS NULL` 로 걸러 대장에 안 나온다 — wf_copy.rs list_roles).
**안전 실패**: 대장 조회에 실패하면 다중 페이지 파일은 스캔하지 않는다(`--page` 로 명시해야 한다).
페이지가 1개면 종전대로 스캔한다. wfanno 와 같은 `--page <id|이름>` 규약.

graceful: 실패해도 exit 0(비차단). Cloudflare 회피 위해 모든 HTTP에 user-agent 명시.

토큰/설정(우선순위 env > .ouroboros/env/.env > .ouroboros/config/plm.json > 기본값):
  PLM     — PLM_API_URL(기본 https://jwk-plm.shoi.ch) · PLM_API_TOKEN · PLM_PROJECT
  penpot  — PENPOT_API_URL(기본 https://jwk-wf.shoi.ch) · PENPOT_ACCESS_TOKEN(별칭 PENPOT_API_TOKEN)

인자:
  --dry-run   발급/보강하지 않고 스캔 결과·발급예정·보강예정 목록만 출력(검증용).
  --project X PLM/penpot 팀 프로젝트명 오버라이드(기본 plm.json project).
  --sae-dir D SAE 스펙(WF-<CODE>.json) 디렉토리 오버라이드(기본 <ouro>/docs/wireframes).
  --file F    penpot 파일 id 로 스캔 대상을 좁힌다(기본 Wireframes 프로젝트의 모든 파일).
  --page P    스캔할 페이지를 **명시**(페이지 id 또는 이름 · wfanno 와 동일 규약). 지정하면 그 페이지만
              스캔한다(사본 대장 조회 없이도 동작 — 사람이 스코프를 확정한 것이므로).
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


# [원본] 전 페이지 병합 프레임 수집 — 감사 G4 로 폐기. 원복 시 main() 의 file_pages 블록을 주석 처리하고
#        아래 함수를 다시 호출한다(사본/보관본 프레임까지 발급 대상이 되는 동작으로 되돌아간다).
def file_frames(base, token, file_id):
    """파일의 최상위 프레임(board) 목록 → [(frame_id, frame_name), ...].
    data.pagesIndex[*].objects 중 type=='frame' 이고 parentId==ROOT_UUID 인 오브젝트.

    ⚠ **전 페이지를 병합**한다 — 작업용 사본 페이지가 있으면 같은 SCREEN_CODE 프레임이 페이지 수만큼
    담겨 `코드충돌(스킵)`/사본 loc 발급이 된다(감사 G4). 호출부는 `file_pages`(페이지 경계 보존)로
    이관됐다. 이 함수는 비교·원복용으로만 남긴다."""
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


# [개선] 페이지 **경계 보존** 로더 — 병합하지 않는다(wfanno._load_pages 와 같은 규약).
def file_pages(base, token, file_id):
    """파일 → ([(page_id, page_name, [(frame_id, frame_name), ...]), ...], ok).

    페이지 순서는 `data.pages`(페이지 id 배열) 우선, 누락분은 `pagesIndex` 키 순서로 보강한다.
    ok=False 는 data 구조 파싱 실패 신호(구조 상이 → 경고) — 기존 `file_frames` 계약과 동일."""
    f = penpot_rpc(base, token, "get-file", {"id": file_id})
    data = _pget(f, "data")
    pidx = _pget(data, "pagesIndex", "pages-index") if isinstance(data, dict) else None
    order = _pget(data, "pages") if isinstance(data, dict) else None
    if not isinstance(pidx, dict):
        return [], False
    keys = [k for k in order if k in pidx] if isinstance(order, list) else []
    keys += [k for k in pidx.keys() if k not in keys]     # order 누락분 보강
    pages = []
    for pid in keys:
        page = pidx.get(pid) or {}
        objects = _pget(page, "objects")
        frames = []
        nested = []
        if isinstance(objects, dict):
            for oid, o in objects.items():
                if _pget(o, "type") != "frame":
                    continue
                if _pget(o, "parentId", "parent-id") != ROOT_UUID:
                    # [원본] 조용한 continue — 중첩 board(board 안의 board)는 카운터도 경고도 없이
                    #   스캔에서 사라져, 그렇게 만든 화면은 아티팩트가 영영 발급되지 않았다.
                    nested.append((_pget(o, "name") or "").strip())
                    continue
                frames.append((_pget(o, "id") or oid, (_pget(o, "name") or "").strip(),
                               o.get("y", 0), o.get("x", 0)))
        # [개선] 프레임 순서를 (y, x) 로 확정 — dict 삽입순서 의존이던 발급 순서·코드충돌 승자가
        #   실행마다 달라지던 비결정성을 제거한다.
        frames.sort(key=lambda t: (t[2], t[3]))
        if nested:
            named = [n for n in nested if n]
            print(f"[wfscan] ⚠ 페이지 '{(_pget(page, 'name') or '').strip()}': 루트가 아닌 중첩 프레임 "
                  f"{len(nested)}개 제외(화면으로 스캔되지 않음)"
                  + (f" — {', '.join(named[:5])}{' …' if len(named) > 5 else ''}" if named else ""))
        pages.append((pid, (_pget(page, "name") or "").strip(),
                      [(fid, fnm) for fid, fnm, _y, _x in frames]))
    return pages, True


# ================================================================== 사본/보관본 페이지 제외 (감사 G4)
#
# 왜 있나: 작업용 사본은 **같은 파일 안의 새 페이지**다(`POST /wireframe/working-copy`). 전 페이지를
# 병합해 스캔하면 사본 프레임이 발급 대상이 되고, 기존 아티팩트라도 "본문이 얇고 SAE 스펙이 리치"하면
# `plm_put_doc` 으로 **loc 째 덮어쓴다** → 승격 없이 `WF-<CODE>` 가 사본을 가리킨다(추적 역전).
#
# 판정 근거는 두 축이다:
#   ① **역할 대장**(권위) — `GET /wireframe/working-copy?project=P` 의 role='working'|'archived' 행.
#   ② **페이지 이름**(보완) — 서버가 붙이는 결정적 규약(penpot_write.rs working_name/archived_name).
#      대장은 서버가 `closed_at IS NULL` 로 거르므로(wf_copy.rs list_roles) **마감된 보관본 행이 없다**.
#      `[보관 완료]`(close_promotion) 는 penpot 을 건드리지 않아 `보관 · …` 페이지는 파일에 그대로 남는다
#      → 대장만 믿으면 그 페이지가 정본으로 오인돼 다시 스캔 대상이 된다. ②가 그 구멍을 막는다.

# penpot_write.rs: working_name = "<원본> (작업본 · MM-DD)" · archived_name = "보관 · <원본> (MM-DD)".
# 날짜 서식은 바뀔 수 있으므로(감사 R6 권고) **표식 문자열만** 본다.
ARCHIVED_PREFIX = "보관 · "
WORKING_MARK = "(작업본 · "


def fetch_page_roles(cfg, project):
    """PLM `GET /wireframe/working-copy?project=P&include_closed=1` → (items, None) / (None, 사유).
    조회 실패는 **성공으로 치지 않는다** — 확인되지 않은 상태로 정본 아티팩트를 건드리지 않기 위해서다.
    (wfanno.fetch_page_roles 가 이 함수에 위임한다 — 판정 근거 SSOT.)

    ★ 감사 X3(R3 높음) — `include_closed=1`. 대시보드 `[보관 완료]`(= `POST …/close`)는 `closed_at`만
      찍고 penpot 페이지를 지우지 않는데, 서버 기본 응답은 마감된 행을 **빼고** 준다. 그러면
      `page_role_of`가 승격된 정본을 `canonical`로 읽어 `stage-apply`가 **영구 거부**됐다(남는 길은
      `--force` = 무가드). 배너는 마감된 행을 볼 이유가 없지만 **도구는 봐야 한다.**
      구서버는 모르는 쿼리 파라미터를 무시하므로(serde 기본) 이 인자는 하위호환이다."""
    api, atok = cfg.get("plm_api"), cfg.get("plm_token")
    if not api or not atok:
        return None, "PLM 설정 부족(api/token) — 사본 상태를 확인할 수 없습니다"
    try:
        # [원본] r = plm_get(api, atok, f"/wireframe/working-copy?project={quote(str(project))}")
        # [개선] 마감된 승격까지 받는다(감사 X3).
        r = plm_get(api, atok, f"/wireframe/working-copy?project={quote(str(project))}&include_closed=1")
    except Exception as e:
        return None, f"사본 상태 조회 실패({str(e)[:80]})"
    items = r.get("items") if isinstance(r, dict) else None
    if not isinstance(items, list):
        return None, "사본 상태 응답 형식이 예상과 다릅니다(items 없음)"
    return items, None


def role_page_ids(items, file_id):
    """역할 대장 items[] + 파일 id → (working:set, archived:set). **순수 함수** · I/O 없음.

    - `penpot_file_id` 가 있는 행만 파일로 거른다(대장은 프로젝트 스코프 — 1회 조회해 파일별로 나눈다).
    - `closed_at` 이 있는 행은 제외(서버가 이미 거르지만 방어적으로 한 번 더 — 계약을 코드에 남긴다).
    - 승격이 커밋되면 사본의 working 행은 **삭제**되고(commit_promotion) 옛 정본에 archived 행이 생긴다
      → 승격된(=이제 정본인) 페이지는 여기 안 잡힌다. 제외가 정본을 삼키지 않는 이유다."""
    working, archived = set(), set()
    for r in items or []:
        if not isinstance(r, dict):
            continue
        rf = str(r.get("penpot_file_id") or "")
        if file_id and rf and rf != str(file_id):
            continue
        if r.get("closed_at"):
            continue
        pid = str(r.get("page_id") or "")
        if not pid:
            continue
        role = str(r.get("role") or "")
        if role == "working":
            working.add(pid)
        elif role == "archived":
            archived.add(pid)
    return working, archived


def classify_page(page_id, page_name, role_sets):
    """이 페이지가 정본인가 사본/보관본인가 → (kind, 사유). kind ∈ canonical|working|archived.

    role_sets = (working:set, archived:set) 또는 None(대장 조회 실패 → 이름 판정만)."""
    name = (page_name or "").strip()
    if role_sets:
        working, archived = role_sets
        if page_id in working:
            return "working", "작업용 사본(역할 대장)"
        if page_id in archived:
            return "archived", "보관본(역할 대장)"
    if name.startswith(ARCHIVED_PREFIX):
        return "archived", "보관본(페이지 이름 — 마감된 승격일 수 있음)"
    if WORKING_MARK in name:
        return "working", "작업용 사본(페이지 이름)"
    return "canonical", "정본"


def resolve_page(pages, page_arg):
    """`--page` 해석 → ((page_id, page_name, frames), None) / (None, 사유).
    wfanno._select_page 와 **같은 규약**: id 완전일치 → 이름 완전일치 → 이름 대소문자 무시 일치."""
    want = str(page_arg).strip()
    for p in pages:
        if p[0] == want:
            return p, None
    hits = [p for p in pages if p[1] == want] or [p for p in pages if p[1].casefold() == want.casefold()]
    if len(hits) == 1:
        return hits[0], None
    if len(hits) > 1:
        return None, f"페이지 이름 '{want}' 이 {len(hits)}개다 — 이름 대신 **페이지 id**로 지정하라."
    return None, f"--page '{want}' 에 해당하는 페이지가 없다."


def select_scan_pages(pages, page_arg, role_sets):
    """스캔할 페이지를 고른다 → (selected, skipped, err).

    selected = [(page_id, page_name, frames), ...]   실제로 스캔할 정본 페이지
    skipped  = [(page_id, page_name, 사유), ...]      사본/보관본 등 제외한 페이지
    err      = 실행 거부 사유(문자열) 또는 None       — err 가 있으면 이 파일은 **아무것도 스캔하지 않는다**

    규칙:
      ① `--page` 지정 → 그 페이지만(사람이 스코프를 확정 — 대장 없이도 동작). 사본이면 사유를 함께 돌려준다.
      ② 대장 있음 → 사본·보관본 제외한 정본 페이지 전부.
      ③ 대장 없음(조회 실패) + 페이지 1개 → 그 페이지(종전 동작 · 사본이 있을 수 없다).
      ④ 대장 없음 + 페이지 2개↑ + `--page` 없음 → **실행 거부**(안전 실패 — 사본을 정본으로 발급하느니 멈춘다).
    """
    if not pages:
        return [], [], "페이지가 없다(get-file data.pagesIndex 비어있음)."
    if page_arg:
        hit, err = resolve_page(pages, page_arg)
        if err:
            return [], [], err
        skipped = [(p[0], p[1], "--page 미선택") for p in pages if p[0] != hit[0]]
        return [hit], skipped, None
    if role_sets is None:
        if len(pages) == 1:
            return [pages[0]], [], None
        return [], [], (f"페이지가 {len(pages)}개인데 **사본 대장 조회에 실패**했다 — 어느 페이지가 정본인지 "
                        "확인할 수 없다. `--page <id|이름>` 로 명시해야 한다. "
                        "(추측하면 작업용 사본 프레임을 정본 아티팩트로 발급할 수 있다)")
    selected, skipped = [], []
    for p in pages:
        kind, why = classify_page(p[0], p[1], role_sets)
        if kind == "canonical":
            selected.append(p)
        else:
            skipped.append((p[0], p[1], why))
    return selected, skipped, None


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


def _note_node(note):
    """화면 수준 자유서술(note) → paragraph(`노트:` strong 라벨 + 본문). 없으면 None.
    _sae_parse.serialize_sae_doc·penpot 주석 패널의 note 블록과 대칭(양쪽 동일 서술 노출)."""
    note = (note or "").strip()
    if not note:
        return None
    return {"type": "paragraph",
            "content": [{"type": "text", "text": "노트: ", "marks": [{"type": "strong"}]},
                        {"type": "text", "text": note}]}


def build_thin_doc(frame_name, screen_code, loc, note=None, route=None, name=None):
    """폴백 본문 — 헤딩 + loc + screen_code 메타(+note)(SAE 스펙 부재 시). canonical=doc, body 빈 문자열.

    [원본] route·name 을 받지 않아, 스펙에 route/name 이 있어도 **요소가 0개면 그 둘까지 함께 유실**됐다
      (리치 분기 build_doc 만 넘겼다). 원복 시 시그니처에서 route/name 을 지운다.
    """
    content = _meta_nodes(frame_name, screen_code, loc, route=route, name=name)
    nn = _note_node(note)
    if nn:
        content.append(nn)
    return {"type": "doc", "content": content}


def build_doc(frame_name, screen_code, loc, spec=None):
    """Wireframe 본문(ProseMirror). SAE 스펙(요소 있음)이면 요소별 SAE 표 + note 를 채운 **리치 본문**,
    없으면 얇은 폴백(build_thin_doc, note 포함)."""
    note = (spec or {}).get("note")
    els = (spec or {}).get("elements") or []
    if not els:
        return build_thin_doc(frame_name, screen_code, loc, note=note,
                              route=(spec or {}).get("route"), name=(spec or {}).get("name"))
    content = _meta_nodes(frame_name, screen_code, loc,
                          route=spec.get("route"), name=spec.get("name"))
    nn = _note_node(note)
    if nn:
        content.append(nn)
    content.append({"type": "heading", "attrs": {"level": 3},
                    "content": [{"type": "text", "text": "화면 요소 (상태·액션·이펙트)"}]})
    content.append(_sae_table(els))
    return {"type": "doc", "content": content}


# '리치' 판정 노드 — 사람이 쓴 내용이 담길 수 있는 구조 노드 전부.
# [원본] `("table", "image", "file")` 3종뿐이었다 — **가장 파괴적인 결함**(감사 2026-07-31):
#   이 프로젝트의 SSOT 포맷인 _sae_parse.serialize_sae_doc 자체가 heading+paragraph+**bullet_list** 를
#   만들고 table 을 절대 만들지 않는다. 그래서 정본 SAE 본문·손으로 쓴 분석 산문·코드블록이
#   전부 '얇음'으로 판정돼 wfscan 의 6열 표로 **통째 덮어써졌다**(plm_put_doc = 전체 교체).
#   원복 시 아래 RICH_NODES 를 ("table", "image", "file") 로 되돌린다.
RICH_NODES = ("table", "image", "file", "bullet_list", "ordered_list",
              "blockquote", "code_block")


def _doc_node_count(doc):
    """doc 안 노드 총수 — 교체 전후 크기 비교(축소 감지)용."""
    n = [0]

    def walk(x):
        if isinstance(x, dict):
            n[0] += 1
            for c in x.get("content", []) or []:
                walk(c)
        elif isinstance(x, list):
            for c in x:
                walk(c)

    walk(doc)
    return n[0]


def _count_doc_rows(doc):
    """본문의 요소 행 수 — SAE 표(헤더 제외) 또는 bullet_list 항목 수. 판단 불가면 None.
    '본문이 명세보다 작아졌는데 아무도 모른다'를 감지하기 위한 눈금."""
    n = [None]

    def walk(x):
        if n[0] is not None:
            return
        if isinstance(x, dict):
            t = x.get("type")
            if t == "table":
                n[0] = max(0, len(x.get("content", []) or []) - 1)
                return
            if t == "bullet_list":
                n[0] = len(x.get("content", []) or [])
                return
            for c in x.get("content", []) or []:
                walk(c)
        elif isinstance(x, list):
            for c in x:
                walk(c)

    walk(doc)
    return n[0]


def _doc_has_rich(doc):
    """본문에 사람이 쓴 구조 노드(RICH_NODES)가 있으면 '리치'로 간주(비파괴 판정 — 얇게 덮어쓰기 방지)."""
    found = [False]

    def walk(n):
        if found[0]:
            return
        if isinstance(n, dict):
            if n.get("type") in RICH_NODES:
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
def _argval(argv, flag):
    """`--flag VALUE` 의 VALUE(없으면 None) — 기존 --project/--sae-dir 파싱과 동일 계약."""
    if flag in argv:
        try:
            return argv[argv.index(flag) + 1]
        except IndexError:
            return None
    return None


def main():
    argv = sys.argv[1:]
    dry = "--dry-run" in argv
    override = _argval(argv, "--project")
    sae_override = _argval(argv, "--sae-dir")
    page_arg = _argval(argv, "--page")
    file_arg = _argval(argv, "--file")

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
    if file_arg:
        files = [(fi, fn) for fi, fn in files if fi == file_arg]
        if not files:
            print(f"[wfscan] --file '{file_arg}' 에 해당하는 파일이 'Wireframes' 프로젝트에 없다.")
            return

    # 1.5) 사본 역할 대장 1회 조회(프로젝트 스코프 · 파일별로 나눠 쓴다 — 감사 G4).
    #      `--page` 로 사람이 스코프를 확정했으면 대장 없이도 진행한다(조회는 해도 판정에 안 쓴다).
    role_items, role_err = (None, None)
    if page_arg:
        print(f"[wfscan] --page '{page_arg}' — 이 페이지만 스캔한다(사본 대장 판정 생략).")
    else:
        role_items, role_err = fetch_page_roles(cfg, project)
        if role_err:
            print(f"[wfscan] ⚠ 작업용 사본 상태 조회 실패 — {role_err}")
            print("         → 페이지가 2개 이상인 파일은 **스캔하지 않는다**(사본 프레임을 정본으로 발급하는 것 방지).")
            print("         → 스캔하려면 `--page <페이지 id|이름>` 으로 정본 페이지를 명시하라.")

    # 2) 각 파일의 **정본 페이지** 프레임 수집 + SCREEN_CODE 파싱
    scanned = []          # (file_id, file_name, frame_id, frame_name, screen_code|None)
    nonconform = []       # (file_name, frame_name) — 규약 미준수
    parse_fail = []       # file_name — data 구조 파싱 실패
    refused = []          # (file_name, 사유) — 페이지 확정 불가 → 파일 전체 스킵
    skipped_pages = []    # (file_name, page_name, page_id, 사유) — 사본/보관본 등 제외한 페이지
    for fid, fname in files:
        try:
            # [원본] 전 페이지 병합 — 원복 시 아래를 주석 해제하고 file_pages 블록을 주석 처리.
            # frames, ok = file_frames(base, ptok, fid)
            # [개선] 페이지 경계 보존 → 정본 페이지만 선택(사본·보관본 제외 · 감사 G4).
            pages, ok = file_pages(base, ptok, fid)
        except Exception as e:
            parse_fail.append(f"{fname} ({str(e)[:40]})")
            continue
        if not ok:
            parse_fail.append(fname)
            continue
        role_sets = role_page_ids(role_items, fid) if role_items is not None else None
        selected, skipped, err = select_scan_pages(pages, page_arg, role_sets)
        for spid, spname, why in skipped:
            skipped_pages.append((fname, spname or "(이름없음)", spid, why))
        if err:
            refused.append((fname, err))
            print(f"\n[wfscan] ✖ 실행 거부 — file='{fname}' ({fid}): {err}")
            print("    이 파일은 **아무것도 발급/보강하지 않고** 스킵한다. 페이지 목록:")
            for ppid, ppname, pfr in pages:
                print(f"      - {(ppname or '(이름없음)'):<24} {ppid}   (루트 프레임 {len(pfr)})")
            continue
        if not selected:
            print(f"[wfscan] file='{fname}': 스캔할 정본 페이지가 없다(전부 사본/보관본) — 스킵.")
            continue
        if page_arg:
            kind, why = classify_page(selected[0][0], selected[0][1], role_sets)
            if kind != "canonical":
                print(f"[wfscan] ⚠ --page 로 지정한 페이지가 정본이 아니다 — {why}. "
                      "지정대로 진행하지만 발급되는 loc 이 사본을 가리킨다.")
        for page_id, page_name, frames in selected:
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
    failed = []   # 어느 칸에도 못 들어간 프레임 — 요약에서 반드시 드러난다(회계 구멍 방지)
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
        covers = (spec or {}).get("covers") or []
        rels = [{"src": code, "rel": "covers", "dst": d} for d in covers]
        doc = build_doc(frnm, sc, loc, spec)
        # 존재 확인
        try:
            exists = artifact_exists(api, atok, project, code) if atok else False
        except Exception as e:
            # [원본] 여기서 continue 하는데 커버리지 집계(rich_codes/thin_codes)는 **이미 위에서** 끝나 있어,
            #   손도 못 댄 프레임이 '리치'로 보고됐고 buckets 합계도 len(valid) 와 어긋났다.
            #   원복 시 위 (rich_codes if rich else thin_codes).append(code) 를 doc 조립 앞으로 되돌린다.
            print(f"[wfscan] ⚠ {code} 존재확인 실패(스킵): {str(e)[:60]}")
            failed.append((code, frnm, "존재확인 실패"))
            continue
        # [개선] 결과가 확정된 뒤에 커버리지 집계 — 실패 프레임이 커버리지를 부풀리지 않는다.
        (rich_codes if rich else thin_codes).append(code)
        if exists:
            # 비파괴 본문 보강: 리치 스펙 보유 + 기존 본문이 얇음(표/미디어 없음)일 때만 리치로 교체.
            if not rich:
                existing.append((code, frnm))
                continue
            cur = None
            if atok:
                try:
                    cur = plm_get_doc(api, atok, project, code)
                except Exception as e:
                    # [원본] `except Exception: cur = None` — 조회 실패가 '이미 리치'와 **같은 칸**에
                    #   조용히 들어가, 일시적 HTTP 오류로 보강이 통째 누락돼도 아무도 몰랐다.
                    print(f"[wfscan] ⚠ {code} 기존 본문 조회 실패 — 보강 보류(재실행 필요): {str(e)[:90]}")
                    cur = None
            if cur is None:
                existing.append((code, frnm))
                continue
            if _doc_has_rich(cur):
                # 이미 리치 → 회귀 방지로 덮어쓰지 않는다. 다만 **스펙이 자란 경우**(요소가 늘었는데
                # 본문은 옛날 그대로)를 조용히 넘기면 PLM 이 명세보다 작아진다 → 불일치를 표면화.
                n_spec = len((spec or {}).get("elements") or [])
                n_doc = _count_doc_rows(cur)
                if n_doc is not None and n_spec and n_doc != n_spec:
                    print(f"[wfscan] ⚠ {code} 본문 {n_doc}요소 vs 로컬 스펙 {n_spec}요소 — 불일치. "
                          f"기존 본문 보존(덮어쓰지 않음). 갱신하려면 대시보드에서 본문을 비우고 재실행.")
                existing.append((code, frnm))
                continue
            if dry:
                enriched.append((code, frnm))  # 보강 예정
                continue
            try:
                if rels:
                    plm_import(api, atok, project, [], rels)  # covers 보강(멱등·비차단)
                # plm_put_doc 은 **전체 교체**(merge 아님) — 교체로 본문이 줄어들면 반드시 보이게 한다.
                n_before, n_after = _doc_node_count(cur), _doc_node_count(doc)
                if n_after < n_before:
                    print(f"[wfscan] ⚠ {code} 본문 교체로 노드 {n_before}→{n_after} 축소 "
                          f"(기존 본문에 손으로 쓴 내용이 있었다면 대시보드 이력에서 확인)")
                plm_put_doc(api, atok, project, code, doc)
                enriched.append((code, frnm))
            except Exception as e:
                print(f"[wfscan] ⚠ {code} 본문 보강 실패(비차단): {str(e)[:70]}")
                failed.append((code, frnm, "본문 보강 실패"))
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
            failed.append((code, frnm, "발급 실패"))

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
    if skipped_pages:
        print(f"  {'제외페이지(사본등)':<12} {len(skipped_pages)}")
    if refused:
        print(f"  {'파일 실행거부':<14} {len(refused)}")
    if failed:
        print(f"  {'실패(어느 칸에도 없음)':<11} {len(failed)}")
        for c, n, why in failed:
            print(f"      ✖ {c:<10} {why} — {n}")
    # 회계 항등식 — 규약 준수 프레임은 반드시 어느 칸 하나에 정확히 들어간다(조용한 증발 금지).
    _acct = len(issued) + len(enriched) + len(existing) + len(collided) + len(failed)
    if _acct != len(valid):
        print(f"  ⚠ 회계 불일치 — 발급대상 {len(valid)} ≠ 집계합 {_acct}. "
              f"어느 프레임이 조용히 빠졌는지 위 경고를 확인하세요.")
    if parse_fail:
        print(f"  {'파일파싱실패':<14} {len(parse_fail)}")

    if skipped_pages:
        print("\n  제외한 페이지(정본이 아니라 스캔 대상에서 뺐다 — 감사 G4):")
        for fn, pnm, ppid, why in skipped_pages:
            print(f"    ⊘ [{fn}] {pnm:<24} {ppid}   — {why}")
    if refused:
        print("\n  ⚠ 페이지 확정 불가로 스캔하지 않은 파일(`--page` 로 정본 페이지를 명시하라):")
        for fn, why in refused:
            print(f"    ✖ {fn}: {why}")

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
