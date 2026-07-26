#!/usr/bin/env python3
"""wfgen.py — SAE 와이어프레임을 penpot에 **헤드리스**(에디터·플러그인 0) 생성.

v2 (2026-07-20 재설계): 요소를 세로로 나열하던 v1의 "태그 리스트"를 폐기하고, 화면을
**실제 앱 목업**으로 그린다. 두 축:
  1) **시각유형 헬퍼**(navbar/searchbar/field/button/toggle/card/grid/sidebar/panel/text/badge)
     — 요소의 `유형`(nav·input·button·toggle·display·list·container·overlay)을 각각의 UI 프리미티브로 렌더.
  2) **화면유형(archetype) 레이아웃 빌더** — 요소를 x/y/w/h 로 **공간 배치**한다.
       list_grid  : 상단 네비바 + 검색 툴바 + **카드 그리드**(목록/컬렉션형).
       workspace  : 상단 바 + 좌/중 큰 본문 패널 + 우 사이드바 + 하단 컨트롤(문서/작업형).
       console    : 상단 바 + 컨트롤 + **가로 단계 플로우** + 단계 카드/결과(파이프라인/절차형).
       form       : 상단 바 + 제목 + 라벨·입력 필드 세로 스택 + 제출 버튼(폼/입력형).
       auto       : 범용 폴백 — 역할별 세로 섹션(요약 타일·컨트롤·리스트·패널·카드). 도메인 중립.
SAE 스펙(WF-<CODE>.json)에서 요소코드·라벨·유형·상태·이펙트를 읽어 **내용**을 채우되,
**배치는 화면유형 템플릿**이 결정한다(요소코드 role 추론: 유형 + 라벨 키워드 + 순서).

v2.1 (2026-07-26 시나리오 재편성): 스펙 wrapper 의 선택 필드 4종을 읽어 캔버스를 구성한다.
  - order(number)  : 앱 사용 시나리오 순서(오름차순 정렬 · 없으면 뒤로+코드순).
  - phase(string)  : 시나리오 단계 라벨 — 같은 phase 끼리 한 행(row)으로 배치 + 행 좌상단 헤더.
  - impl(string)   : implemented|partial|planned — board 테두리(초록 실선/주황 실선/보라 점선)·
                     설명 패널 배지. 캔버스 좌상단에 범례 자동 표시(IMPL_STYLE).
  - desc(string)   : 화면 설명 — board 우측 설명 패널(제목·상태 배지·라우트·설명·covers)로 렌더.
  ※ 4필드 전부 없으면 종전과 동일한 단일 행(코드순) — 하위호환.
표시 텍스트는 전적으로 SAE(라벨·상태·이펙트)에서 유도하거나 도메인 중립 placeholder로 채운다
(빌더에 특정 제품 도메인 문자열을 하드코딩하지 않는다 — 어떤 제품 SAE든 그 도메인으로 정확히 렌더).

penpot 제어는 `update-file` RPC change-ops(에디터가 내부적으로 쓰는 change API)를 서버측에서
호출(memory: penpot-headless-generation). board(frame) + 자식 rect/text 를 flat 로 emit(절대좌표).

동작:
  1) 설정/토큰 해석(env > .ouroboros/env/.env > config/plm.json > 기본값).
  2) penpot 팀 `PLM · {project}` → `Wireframes` 프로젝트 id(또는 --penpot-project-id).
  3) (--delete-file) 기존 파일 삭제 → create-file 새 파일 → get-file 로 revn·vern·pageId.
  4) 각 화면: SAE 파싱 → archetype 빌더가 board+요소를 공간 배치한 add-obj change-ops 조립.
  5) update-file(id,revn,vern,sessionId,changes[]) 커밋(**vern 필수** — 빠지면 400).
  6) get-file 재조회로 board·자식 수 검증·보고.

재사용 계약:
  python wfgen.py --project <PLM프로젝트> [--file-name N] [--screens CODE,CODE,...]
                  [--sae-dir DIR] [--penpot-project-id ID] [--archetype list_grid|workspace|console|form|auto]
                  [--delete-file FILE_ID] [--dry-run]
  - --project             PLM/penpot 팀 프로젝트명(기본 config/plm.json project). 팀 `PLM · {project}`.
  - --file-name           penpot 파일명(기본 "{project} 와이어프레임 (SAE)").
  - --screens             생성할 화면코드 CSV(기본: SAE 디렉토리의 WF-*.json 전량 · 개수 제한 없음). 스펙도 코드도 없으면 안내 후 종료(고정 샘플 폴백 없음).
  - --sae-dir             WF-*.json 디렉토리(기본 <ouro>/docs/wireframes).
  - --penpot-project-id   penpot Wireframes 프로젝트 id 직접 지정(팀/프로젝트명 해석 생략).
  - --archetype           전 화면 강제 레이아웃(미지정 시 화면코드/휴리스틱으로 자동 선택).
  - --delete-file         생성 전 이 penpot 파일 id 를 삭제(나쁜 파일 교체용).
  - --dry-run             네트워크 없이 파싱·조립만, change-op 수·샘플 출력.

graceful: 예외 시에도 exit 0(비차단). Cloudflare 회피 위해 모든 HTTP 에 user-agent 명시.
"""
import argparse
import json
import os
import re
import sys
import uuid
import urllib.error
import urllib.request

# SAE 파서는 공용 모듈(_sae_parse) SSOT — wfscan 과 규약 100% 공유(계획서 요구). 스크립트 자기 디렉토리 보장.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _sae_parse import (  # noqa: E402
    CODE_RE,
    parse_sae_doc,
    doc_covers as _doc_covers,
    find_bullet_list as _find_bullet_list,
    heading_name_route as _heading_name_route,
)

ROOT_UUID = "00000000-0000-0000-0000-000000000000"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/150 Safari/537.36 plm-wfgen/2.0"

# ------------------------------------------------------------------ 팔레트
C = {
    "bg": "#F4F5F7", "card": "#FFFFFF", "border": "#D0D5DD", "line": "#EAECF0",
    "ink": "#1D2939", "ink2": "#475467", "ink3": "#98A2B3", "head": "#101828",
    "accent": "#4F46E5", "soft": "#E7E9FE", "ok": "#12B76A", "warn": "#F79009",
    "ph": "#F2F4F7", "ph2": "#E4E7EC", "scrim": "#101828",
}

# 구현상태(스펙 wrapper `impl`) → board 테두리·설명패널 배지 스타일 (v2.1 · 시나리오 재편성)
IMPL_STYLE = {
    "implemented": {"stroke": "#12B76A", "dashed": False, "label": "구현됨", "mark": "●"},
    "partial":     {"stroke": "#F79009", "dashed": False, "label": "부분 구현 · 확장 예정", "mark": "◐"},
    "planned":     {"stroke": "#4F46E5", "dashed": True,  "label": "계획 (미구현)", "mark": "○"},
}
PANEL_W = 330      # 화면 우측 설명 패널 폭
ROW_GAP = 150      # phase 행 간 간격
SCREEN_GAP = 110   # 행 내 화면(보드+패널) 간 간격

# 이 코드들에 한해 이름·archetype 힌트를 주는 선택적 사전(book-tarae 예시 화면).
# ※ 화면의 "기본 집합"이 아니다 — 화면은 프로젝트의 WF-*.json SAE 스펙에서 나오며 개수 제한이 없다.
#   --screens 로 이 코드를 명시했을 때만 이름/archetype 힌트로 쓰인다(스펙 없으면 이름=코드 골격).
DEFAULT_SCREENS = {
    "LIB": ("서재 (Library)", "/", "list_grid"),
    "RDR": ("리더 (Reader)", "/books/[code]/[pdfPage]", "workspace"),
    "PIPE": ("파이프라인 콘솔 (Pipeline)", "/pipeline", "console"),
}
# 화면코드 → archetype 매핑(스크린-타입 템플릿 선택. 없으면 휴리스틱)
CODE_ARCHETYPE = {"LIB": "list_grid", "RDR": "workspace", "PIPE": "console"}


# ================================================================== 설정 해석
def _find_ouro(start):
    d = os.path.abspath(start)
    while d and d != os.path.dirname(d):
        cand = os.path.join(d, ".ouroboros")
        if os.path.isdir(cand):
            return cand
        d = os.path.dirname(d)
    return None


def _parse_env(path):
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

    penpot_api = pick(os.environ.get("PENPOT_API_URL"), envf.get("PENPOT_API_URL"),
                      default="https://jwk-wf.shoi.ch").rstrip("/")
    penpot_token = pick(os.environ.get("PENPOT_ACCESS_TOKEN"), os.environ.get("PENPOT_API_TOKEN"),
                        envf.get("PENPOT_ACCESS_TOKEN"), envf.get("PENPOT_API_TOKEN"))
    project = pick(os.environ.get("PLM_PROJECT"), cfg.get("project"))
    # PLM(토큰 self-heal /penpot-token 대행발급용) — env > .env > plm.json > 기본값.
    plm_api = pick(os.environ.get("PLM_API_URL"), envf.get("PLM_API_URL"),
                   cfg.get("api_url"), default="https://jwk-plm.shoi.ch").rstrip("/")
    plm_token = pick(os.environ.get("PLM_API_TOKEN"), envf.get("PLM_API_TOKEN"))
    return {"penpot_api": penpot_api, "penpot_token": penpot_token,
            "project": project, "ouro": ouro, "plm_api": plm_api, "plm_token": plm_token}


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


# ================================================================== HTTP / RPC
def _http(url, token, scheme, body=None, method="GET", timeout=60):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("content-type", "application/json")
    req.add_header("accept", "application/json")
    if token:
        req.add_header("authorization", f"{scheme} {token}")
    req.add_header("user-agent", UA)  # Cloudflare 가 기본 urllib UA 차단(403)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body_txt = ""
        try:
            body_txt = e.read().decode(errors="replace")
        except Exception:
            pass
        cmd = url.split("/command/")[-1] if "/command/" in url else url
        raise RuntimeError(f"HTTP {e.code} [{cmd}]: {body_txt[:600]}")


def penpot_rpc(base, token, cmd, body=None):
    return _http(f"{base}/api/rpc/command/{cmd}", token, "Token", body or {}, "POST")


def _pget(obj, *keys, default=None):
    if isinstance(obj, dict):
        for k in keys:
            if k in obj:
                return obj[k]
    return default


# ================================================================== penpot 조회
def find_team(base, token, project):
    wanted = f"PLM · {project}"
    teams = penpot_rpc(base, token, "get-teams", {})
    if isinstance(teams, list):
        for t in teams:
            if _pget(t, "name") == wanted:
                return _pget(t, "id")
    return None


def find_wf_project(base, token, team_id, name="Wireframes"):
    projects = penpot_rpc(base, token, "get-projects", {"team-id": team_id})
    if isinstance(projects, list):
        for p in projects:
            if _pget(p, "name") == name:
                return _pget(p, "id")
    return None


def get_file(base, token, file_id):
    return penpot_rpc(base, token, "get-file", {"id": file_id})


def delete_file(base, token, file_id):
    return penpot_rpc(base, token, "delete-file", {"id": file_id})


def file_revn_vern_page(f):
    revn = _pget(f, "revn", default=0)
    vern = _pget(f, "vern", default=0)
    data = _pget(f, "data")
    page_id = None
    if isinstance(data, dict):
        pages = _pget(data, "pages")
        if isinstance(pages, list) and pages:
            page_id = pages[0]
        if not page_id:
            pidx = _pget(data, "pagesIndex", "pages-index")
            if isinstance(pidx, dict) and pidx:
                page_id = next(iter(pidx.keys()))
    return revn, vern, page_id


def board_child_counts(f):
    out = {}
    data = _pget(f, "data")
    pages = _pget(data, "pagesIndex", "pages-index") if isinstance(data, dict) else None
    if not isinstance(pages, dict):
        return out
    for page in pages.values():
        objects = _pget(page, "objects")
        if not isinstance(objects, dict):
            continue
        for oid, o in objects.items():
            if _pget(o, "type") != "frame":
                continue
            if _pget(o, "parentId", "parent-id") != ROOT_UUID:
                continue
            shapes = _pget(o, "shapes", default=[]) or []
            out[_pget(o, "id") or oid] = (_pget(o, "name") or "", len(shapes))
    return out


# ================================================================== shape 모델
def geom(x, y, w, h):
    return {
        "selrect": {"x": x, "y": y, "width": w, "height": h,
                    "x1": x, "y1": y, "x2": x + w, "y2": y + h},
        "points": [{"x": x, "y": y}, {"x": x + w, "y": y},
                   {"x": x + w, "y": y + h}, {"x": x, "y": y + h}],
        "transform": {"a": 1, "b": 0, "c": 0, "d": 1, "e": 0, "f": 0},
        "transformInverse": {"a": 1, "b": 0, "c": 0, "d": 1, "e": 0, "f": 0},
    }


def rect_obj(oid, name, x, y, w, h, board_id, fill=None, stroke=None, radius=0,
             dashed=False, opacity=1.0, stroke_w=1):
    o = {
        "id": oid, "name": name, "type": "rect",
        "x": x, "y": y, "width": w, "height": h, "rotation": 0,
        "parentId": board_id, "frameId": board_id,
        "fills": ([{"fillColor": fill, "fillOpacity": opacity}] if fill else []),
        "strokes": ([{"strokeColor": stroke, "strokeStyle": ("dashed" if dashed else "solid"),
                      "strokeWidth": stroke_w, "strokeAlignment": "center", "strokeOpacity": 1}]
                    if stroke else []),
        "proportion": 1, "proportionLock": False,
        "constraintsH": "left", "constraintsV": "top",
        "r1": radius, "r2": radius, "r3": radius, "r4": radius,
    }
    o.update(geom(x, y, w, h))
    return o


def _text_attrs(size, weight, color, align):
    return {
        "fontId": "sourcesanspro", "fontFamily": "sourcesanspro", "fontVariantId": "regular",
        "fontSize": str(size), "fontWeight": str(weight), "fontStyle": "normal",
        "lineHeight": "1.2", "letterSpacing": "0", "textAlign": align,
        "textDecoration": "none", "textTransform": "none", "textDirection": "ltr",
        "typographyRefId": None, "typographyRefFile": None,
        "fills": [{"fillColor": color, "fillOpacity": 1}],
    }


def text_obj(oid, name, x, y, w, h, board_id, s, color="#1D2939", size: float = 12, weight=400, align="left"):
    leaf = dict(_text_attrs(size, weight, color, align))
    leaf["text"] = s
    para = dict(_text_attrs(size, weight, color, align))
    para.pop("fills", None)
    para["type"] = "paragraph"
    para["children"] = [leaf]
    content = {"type": "root", "children": [{"type": "paragraph-set", "children": [para]}]}
    o = {
        "id": oid, "name": name, "type": "text",
        "x": x, "y": y, "width": w, "height": h, "rotation": 0,
        "parentId": board_id, "frameId": board_id,
        "growType": "fixed", "content": content,
        "constraintsH": "left", "constraintsV": "top",
    }
    o.update(geom(x, y, w, h))
    return o


def board_obj(bid, name, x, y, w, h, child_ids, fill="#F4F5F7", stroke=None, dashed=False, stroke_w=3):
    o = {
        "id": bid, "name": name, "type": "frame",
        "x": x, "y": y, "width": w, "height": h, "rotation": 0,
        "parentId": ROOT_UUID, "frameId": ROOT_UUID,
        "fills": [{"fillColor": fill, "fillOpacity": 1}],
        "strokes": ([{"strokeColor": stroke, "strokeStyle": ("dashed" if dashed else "solid"),
                      "strokeWidth": stroke_w, "strokeAlignment": "inner", "strokeOpacity": 1}]
                    if stroke else []),
        "proportion": 1, "proportionLock": False,
        "constraintsH": "left", "constraintsV": "top",
        "r1": 0, "r2": 0, "r3": 0, "r4": 0, "shapes": child_ids,
    }
    o.update(geom(x, y, w, h))
    return o


def group_obj(gid, name, x, y, w, h, board_id, child_ids, parent_id=None, hidden=False):
    """penpot group — 트리 직접구성(memory: penpot-headless-generation).
    shapes=[자식들], parentId=board(또는 상위그룹), frameId=board, selrect=자식 bbox.
    add-obj 는 부모먼저(pre-order) — group_end 가 [group_add]+children_ops 순으로 emit."""
    o = {
        "id": gid, "name": name, "type": "group",
        "x": x, "y": y, "width": w, "height": h, "rotation": 0,
        "parentId": parent_id or board_id, "frameId": board_id,
        "proportion": 1, "proportionLock": False,
        "constraintsH": "left", "constraintsV": "top",
        "shapes": list(child_ids),
    }
    if hidden:
        o["hidden"] = True
    o.update(geom(x, y, w, h))
    return o


def _bbox_of(objs):
    """자식 obj 리스트의 합집합 bbox(x,y,w,h) — 축정렬(회전0) 가정."""
    xs = [o["x"] for o in objs]
    ys = [o["y"] for o in objs]
    xe = [o["x"] + o["width"] for o in objs]
    ye = [o["y"] + o["height"] for o in objs]
    x, y = min(xs), min(ys)
    return x, y, max(xe) - x, max(ye) - y


def add_change(page_id, obj):
    return {"type": "add-obj", "id": obj["id"], "pageId": page_id,
            "frameId": obj["frameId"], "parentId": obj["parentId"], "obj": obj}


def _uid():
    return str(uuid.uuid4())


def _trunc(s, n):
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def _gname(el, default):
    """요소 그룹 이름 = '요소코드 역할'(코드 있으면) 또는 역할명. 예: 'LIB.01 검색바'.
    penpot 레이어 패널에서 접히는 요소 그룹의 표시 이름."""
    if not isinstance(el, dict):
        return default
    code = el.get("code")
    return f"{code} {default}" if code else default


def text_px(s, size):
    """대략적 텍스트 픽셀폭 — CJK/전각은 ~size, ASCII 는 ~size*0.56."""
    w = 0.0
    for ch in (s or ""):
        w += size * (1.0 if ord(ch) > 0x2E7F else 0.56)
    return w


# ================================================================== Screen 빌더
class Screen:
    """한 board(frame) + flat 자식. 좌표는 (ox,oy) 오프셋의 절대좌표(penpot 규약)."""

    def __init__(self, page_id, code, name, ox, oy, w, h):
        self.page = page_id
        self.code = code
        self.name = name
        self.ox, self.oy, self.w, self.h = ox, oy, w, h
        # 구현상태 테두리(impl) — finalize 시 board_obj 에 전달. main 이 스펙 meta 로 세팅.
        self.board_stroke, self.board_dashed = None, False
        self.bid = _uid()
        self.kids = []          # board 직접 자식 id(그룹 · 소수 board-direct · 코드그룹)
        self.body_ops = []      # board 다음 emit 되는 add-change(그룹+자식 · board-direct)
        self._stack = []        # 활성(중첩 가능) 그룹 캡처 프레임
        # 코드태그 전용 버킷 — 화면당 하나의 "🏷 코드" 그룹으로 finalize 시 묶음
        self._code = {"id": _uid(), "name": "🏷 코드", "hidden": False,
                      "child_ids": [], "objs": [], "ops": []}
        self._code_on = False   # code_tag 실행 중이면 코드버킷으로 라우팅
        # 요소 그룹→컴포넌트 승격 레코드: {gobj(참조), change(add-component)}.
        # group_end 로 닫히는 요소 역할 그룹만 적재('🏷 코드' 그룹은 group_end 미경유 → 제외).
        # componentFile 은 file_id 확정 후 component_changes()에서 주입.
        self.components = []

    def _add(self, obj):
        # 라우팅: 코드태그 > 활성그룹 > board-direct. 그룹/코드 소속이면 parentId 재지정(frameId=board 유지).
        if self._code_on:
            frame = self._code
        elif self._stack:
            frame = self._stack[-1]
        else:
            frame = None
        if frame is not None:
            obj["parentId"] = frame["id"]
            frame["child_ids"].append(obj["id"])
            frame["objs"].append(obj)
            frame["ops"].append(add_change(self.page, obj))
        else:
            self.kids.append(obj["id"])
            self.body_ops.append(add_change(self.page, obj))
        return obj

    # -- 그룹 캡처(요소=접히는 그룹) -------------------------------
    def group_start(self, name, hidden=False):
        """이후 그려지는 프리미티브를 이 그룹의 자식으로 캡처. group_end 와 짝."""
        self._stack.append({"id": _uid(), "name": name, "hidden": hidden,
                            "child_ids": [], "objs": [], "ops": []})
        return self._stack[-1]["id"]

    def group_end(self):
        """현재 그룹 종료 — bbox 계산 후 [group_add]+children_ops 를 부모(상위그룹 or board)에 pre-order emit.
        그룹 shape 을 penpot 컴포넌트 메인 인스턴스로 '승격'(Assets 등록) — 좌표·자식·타입(group)·렌더는 불변."""
        if not self._stack:
            return None
        g = self._stack.pop()
        if not g["child_ids"]:
            return None  # 빈 그룹(요소 부재) → 스킵
        x, y, w, h = _bbox_of(g["objs"])
        parent = self._stack[-1] if self._stack else None
        gobj = group_obj(g["id"], g["name"], x, y, w, h, self.bid, g["child_ids"],
                         parent_id=(parent["id"] if parent else None), hidden=g["hidden"])
        self._promote_component(gobj, g["name"])  # 요소 역할 그룹 → 컴포넌트(🏷코드 그룹은 미경유)
        if parent:       # 중첩 — 상위 그룹의 자식으로
            parent["child_ids"].append(g["id"])
            parent["objs"].append(gobj)
            parent["ops"].append(add_change(self.page, gobj))
            parent["ops"].extend(g["ops"])
        else:            # 최상위 — board 직접 자식
            self.kids.append(g["id"])
            self.body_ops.append(add_change(self.page, gobj))
            self.body_ops.extend(g["ops"])
        return g["id"]

    def _promote_component(self, gobj, name):
        """요소 그룹 shape 을 penpot 컴포넌트 메인 인스턴스로 승격(검증된 참조 패턴과 동형 —
        단 main instance 가 frame 이 아닌 group).
        - shape 에 componentRoot/componentId/mainInstance 부여(componentFile 은 나중 주입).
        - 대응 add-component change 를 self.components 에 적재 → main 이 모든 add-obj 뒤에 append.
        컴포넌트 name=그룹명(예 'LIB.02 검색바'), path=화면코드(예 '/LIB')로 Assets 구분."""
        cid = _uid()
        gobj["componentRoot"] = True
        gobj["componentId"] = cid
        gobj["mainInstance"] = True
        self.components.append({
            "gobj": gobj,  # componentFile 주입용 참조(add_change 가 같은 dict 를 물고 있음)
            "change": {"type": "add-component", "id": cid, "name": name,
                       "path": f"/{self.code}", "mainInstanceId": gobj["id"],
                       "mainInstancePage": self.page},
        })

    def component_changes(self, file_id):
        """file_id 확정 후 호출 — 승격 그룹마다 componentFile 주입 후 add-component change 리스트 반환.
        반드시 finalize() 이후 호출(finalize 의 미종료그룹 안전망 group_end 까지 self.components 반영 뒤)."""
        for c in self.components:
            c["gobj"]["componentFile"] = file_id
        return [c["change"] for c in self.components]

    # -- 프리미티브 --------------------------------------------------
    def rect(self, x, y, w, h, fill=None, stroke=None, radius=0, dashed=False,
             opacity=1.0, stroke_w=1, name="rect"):
        return self._add(rect_obj(_uid(), name, self.ox + x, self.oy + y, w, h, self.bid,
                                   fill, stroke, radius, dashed, opacity, stroke_w))

    def text(self, x, y, w, h, s, size: float = 12, color=None, weight=400, align="left", name=None):
        return self._add(text_obj(_uid(), name or _trunc(s, 24), self.ox + x, self.oy + y,
                                   w, h, self.bid, s, color or C["ink"], size, weight, align))

    def line(self, x, y, w, color=None, h=1):
        return self.rect(x, y, w, h, fill=color or C["line"], name="line")

    # -- 시각유형 헬퍼(요소 유형 → UI 프리미티브) -------------------
    def bar(self, x, y, w, h, fill=None):
        """상단/툴바 배경."""
        return self.rect(x, y, w, h, fill=fill or C["card"], name="bar")

    def field(self, x, y, w, h, placeholder="", icon=None, fill=None):
        """input — 테두리 필드 + 회색 placeholder."""
        self.rect(x, y, w, h, fill=fill or C["card"], stroke=C["border"], radius=8, name="field")
        tx = x + 12
        if icon:
            self.text(x + 11, y + h / 2 - 8, 20, 16, icon, size=13, color=C["ink3"])
            tx = x + 32
        if placeholder:
            self.text(tx, y + h / 2 - 8, w - (tx - x) - 10, 16, _trunc(placeholder, 46),
                      size=12.5, color=C["ink3"])
        return self

    def button(self, x, y, w, h, label, primary=True):
        """button — 채운 라운드rect + 중앙 라벨."""
        if primary:
            self.rect(x, y, w, h, fill=C["accent"], radius=8, name="btn")
            self.text(x, y + h / 2 - 8, w, 16, _trunc(label, 22), size=12.5, color="#FFFFFF",
                      weight=600, align="center")
        else:
            self.rect(x, y, w, h, fill=C["card"], stroke=C["border"], radius=8, name="btn")
            self.text(x, y + h / 2 - 8, w, 16, _trunc(label, 22), size=12.5, color=C["ink2"],
                      weight=500, align="center")
        return self

    def toggle(self, x, y, w, h, label):
        """toggle — 작은 pill + 라벨."""
        self.rect(x, y, w, h, fill=C["card"], stroke=C["border"], radius=max(6, h // 2), name="toggle")
        self.text(x, y + h / 2 - 7, w, 14, _trunc(label, 16), size=11, color=C["ink2"],
                  weight=500, align="center")
        return self

    def chip(self, x, y, label, tone="soft"):
        """작은 배지/칩."""
        w = 12 + len(str(label)) * 6.6
        bg, fg = (C["soft"], C["accent"])
        if tone == "ok":
            bg, fg = ("#DCFAE6", C["ok"])
        elif tone == "warn":
            bg, fg = ("#FEF0C7", "#B54708")
        elif tone == "muted":
            bg, fg = (C["ph2"], C["ink2"])
        self.rect(x, y, w, 19, fill=bg, radius=9, name="chip")
        self.text(x + 6, y + 3, w - 8, 13, _trunc(label, 18), size=10, color=fg, weight=600)
        return w

    def code_tag(self, right_x, y, code):
        """요소 코드 배지(mono 보조표기 · 우상단 우측정렬 — right_x 가 우변).
        _code_on 로 이 rect+text 는 board의 '🏷 코드' 그룹으로 라우팅(활성 요소그룹 무관)."""
        tw = 9 + len(code) * 6.4
        self._code_on = True
        self.rect(right_x - tw, y, tw, 15, fill=C["soft"], radius=4, name="tag")
        self.text(right_x - tw + 5, y + 2, tw, 12, code, size=9.5, color=C["accent"], weight=600)
        self._code_on = False
        return tw

    def code_tag_left(self, x, y, code):
        """요소 코드 배지 — x 를 좌변으로 우향 배치(텍스트 뒤 표기용). '🏷 코드' 그룹으로 라우팅."""
        tw = 9 + len(code) * 6.4
        self._code_on = True
        self.rect(x, y, tw, 15, fill=C["soft"], radius=4, name="tag")
        self.text(x + 5, y + 2, tw, 12, code, size=9.5, color=C["accent"], weight=600)
        self._code_on = False
        return tw

    def placeholder(self, x, y, w, h=8, color=None):
        """텍스트 자리 회색 바."""
        return self.rect(x, y, w, h, fill=color or C["ph2"], radius=3, name="ph")

    def panel(self, x, y, w, h, title=None, dashed=False, fill=None):
        """container/sidebar — 구획 배경(+제목)."""
        self.rect(x, y, w, h, fill=fill if fill is not None else C["card"],
                  stroke=C["border"], radius=10, dashed=dashed, name="panel")
        if title:
            self.text(x + 12, y + 10, w - 24, 16, _trunc(title, 40), size=11.5,
                      color=C["ink3"], weight=600)
        return self

    def card(self, x, y, w, h, title="", meta="", badge=None, badge_tone="soft", cover_hint="이미지"):
        """카드 — 커버(이미지) rect + 제목 + 메타 + 상태 배지."""
        self.rect(x, y, w, h, fill=C["card"], stroke=C["border"], radius=10, name="card")
        cov_h = int(h * 0.56)
        self.rect(x + 12, y + 12, w - 24, cov_h - 12, fill=C["ph"], stroke=C["border"], radius=6, name="cover")
        self.text(x + 12, y + cov_h // 2 - 4, w - 24, 14, cover_hint, size=10.5,
                  color=C["ink3"], align="center")
        if badge:
            self.chip(x + 18, y + 18, badge, tone=badge_tone)
        ty = y + cov_h + 8
        if title:
            self.text(x + 14, ty, w - 28, 16, _trunc(title, 22), size=12.5, color=C["ink"], weight=600)
        else:
            self.placeholder(x + 14, ty + 2, int((w - 28) * 0.7), 9)
        my = ty + 22
        if meta:
            self.text(x + 14, my, w - 28, 14, _trunc(meta, 26), size=10.5, color=C["ink3"])
        else:
            self.placeholder(x + 14, my + 1, int((w - 28) * 0.45), 7, color=C["ph"])
        return self

    def finalize(self):
        # 안전망: 짝 안 맞는 미종료 그룹 정리(pre-order 유지).
        while self._stack:
            self.group_end()
        body = list(self.body_ops)
        # 코드태그 그룹 — 맨 뒤(z 최상단)에 board 자식으로 추가. 자식 있을 때만.
        if self._code["child_ids"]:
            x, y, w, h = _bbox_of(self._code["objs"])
            cobj = group_obj(self._code["id"], self._code["name"], x, y, w, h, self.bid,
                             self._code["child_ids"], hidden=self._code["hidden"])
            self.kids.append(self._code["id"])
            body = body + [add_change(self.page, cobj)] + self._code["ops"]
        board = board_obj(self.bid, f"{self.code} {self.name}", self.ox, self.oy,
                          self.w, self.h, self.kids, fill=C["bg"],
                          stroke=self.board_stroke, dashed=self.board_dashed)
        return [add_change(self.page, board)] + body


# ================================================================== role 추론
KW = {
    "brand": ("로고", "logo", "브랜드", "홈"),
    "search": ("검색", "search", "찾", "query"),
    "user": ("유저", "user", "메뉴", "menu", "계정", "account", "프로필", "profile"),
    "back": ("뒤로", "back", "←", "이전"),
    "section": ("시리즈", "섹션", "헤더", "series", "section", "header", "카테고리", "그룹"),
    "mode": ("모드", "mode", "배지", "badge"),
    "card": ("카드", "card", "아이템", "item", "책", "타일", "tile", "결과"),
    "cover": ("cover", "썸네일", "커버", "이미지", "image", "thumb"),
    "meta": ("메타", "meta", "쪽", "블록", "정보", "수량"),
    "title": ("제목", "title", "이름", "name"),
    "pager": ("‹", "›", "다음", "이전", "네비", "점프", "prev", "next", "pager"),
    "tab": ("탭", "tab"),
    "flow": ("플로우", "flow", "단계", "진행", "스텝", "step"),
    "stage": ("스테이지", "stage", "카드"),
    "run": ("실행", "run", "start"),
    "tagline": ("태그라인", "tagline", "고지", "안내"),
    "upload": ("업로드", "upload", "첨부"),
}


def _has(label, key):
    lab = (label or "").lower()
    return any(k.lower() in lab for k in KW[key])


def role_of(el):
    """요소 → 대략 role(유형 + 키워드). archetype 빌더가 slot 배치에 사용."""
    t = (el.get("type") or "").lower()
    lab = el.get("label") or ""
    if t == "nav" and _has(lab, "brand"):
        return "brand"
    if _has(lab, "back"):
        return "back"
    if t == "input" and _has(lab, "search"):
        return "search"
    if t == "button" and _has(lab, "search"):
        return "search_btn"
    if _has(lab, "user"):
        return "usermenu"
    if _has(lab, "upload"):
        return "upload"
    if t == "display" and _has(lab, "section"):
        return "section"
    if t == "display" and _has(lab, "mode"):
        return "modebadge"
    if _has(lab, "cover"):
        return "cover"
    if _has(lab, "meta"):
        return "meta"
    if _has(lab, "tagline"):
        return "tagline"
    if t in ("nav", "container", "list") and _has(lab, "card"):
        return "card"
    if _has(lab, "pager"):
        return "pager"
    if t == "toggle" and _has(lab, "tab"):
        return "sidebar_tab"
    if t == "toggle":
        return "toggle"
    if t == "input":
        return "input"
    if t == "button":
        return "button"
    if t == "container":
        return "panel"
    if t == "overlay":
        return "overlay"
    if t == "nav":
        return "navitem"
    return "display"


def bucket(elements):
    b = {}
    for el in elements:
        b.setdefault(role_of(el), []).append(el)
    return b


# ------------------------------------------------------------------ 상태 토큰
_OK_KW = ("ok", "done", "완료", "success", "정산", "받을", "+", "analyzed",
          "loaded", "active", "enabled", "settled", "filled")
_WARN_KW = ("warn", "pending", "진행", "settling", "error", "보낼", "−", "raw",
            "loading", "saving", "running", "off", "disabled", "locked", "empty")


def state_variants(state, limit=4):
    """SAE 상태 토큰('a / b(tone) / c') → [(label, tone)] — 배지·샘플 상태를 **도메인 중립**으로 유도.
    괄호 안 힌트/키워드로 톤(ok·warn·muted) 추정. 어떤 제품이든 상태 토큰만으로 배지 톤 결정."""
    out = []
    for tok in re.split(r"\s*/\s*", state or ""):
        tok = tok.strip()
        if not tok or tok == "—":
            continue
        m = re.search(r"\(([^)]*)\)", tok)
        hint = m.group(1) if m else ""
        label = re.sub(r"\([^)]*\)", "", tok).strip() or hint
        probe = (hint + " " + label).lower()
        tone = "muted"
        if any(k in probe for k in _WARN_KW):
            tone = "warn"
        if any(k in probe for k in _OK_KW):
            tone = "ok"
        out.append((_trunc(label, 14), tone))
        if len(out) >= limit:
            break
    return out


def first_state(elements):
    """요소들 중 상태 토큰이 있는 첫 요소의 상태 문자열(배지 유도 폴백)."""
    for e in elements:
        if e.get("state"):
            return e.get("state")
    return ""


# ================================================================== archetype: list_grid (서재형)
def build_list_grid(page, code, name, route, covers, elements, ox, oy=0):
    W = 1180
    b = bucket(elements)
    s = Screen(page, code, name, ox, oy, W, 100)  # 높이는 나중에 세팅

    # 상단 네비바
    s.group_start("네비바 배경")
    s.bar(0, 0, W, 64)
    s.line(0, 64, W, C["line"])
    s.group_end()
    brand = (b.get("brand") or [{}])[0]
    s.group_start(_gname(brand, "로고"))
    s.rect(24, 16, 44, 32, fill=C["accent"], radius=8, name="logo")
    blab = _trunc(brand.get("label", name), 22)
    s.text(78, 22, 300, 20, blab, size=15, color=C["head"], weight=700)
    if brand.get("code"):
        s.code_tag_left(78 + text_px(blab, 15) + 10, 16, brand["code"])
    s.group_end()
    um = (b.get("usermenu") or [{}])[0]
    s.group_start(_gname(um, "유저 메뉴"))
    s.rect(W - 24 - 132, 16, 132, 32, fill=C["card"], stroke=C["border"], radius=16, name="user")
    s.text(W - 24 - 120, 24, 110, 16, _trunc(um.get("label", "유저 메뉴 ▾"), 16), size=12, color=C["ink2"], weight=500)
    if um.get("code"):
        s.code_tag(W - 24, 4, um["code"])
    s.group_end()

    # 검색 툴바
    ty = 88
    sf = (b.get("search") or [{}])[0]
    s.group_start(_gname(sf, "검색바"))
    s.field(24, ty, 720, 42, placeholder=_trunc(sf.get("label", "검색"), 44), icon="⌕")
    if sf.get("code"):
        s.code_tag(24 + 700, ty - 12, sf["code"])
    s.group_end()
    sb = (b.get("search_btn") or [{}])[0]
    s.group_start(_gname(sb, "검색 버튼"))
    s.button(760, ty, 96, 42, _trunc(sb.get("label", "검색"), 8), primary=True)
    if sb.get("code"):
        s.code_tag(760 + 96, ty - 12, sb["code"])
    s.group_end()
    mb = (b.get("modebadge") or [{}])[0]
    if mb:
        s.group_start(_gname(mb, "모드 배지"))
        s.rect(W - 24 - 150, ty + 3, 150, 36, fill=C["soft"], radius=8, name="mode")
        s.text(W - 24 - 138, ty + 13, 130, 16, _trunc(mb.get("label", "모드"), 16), size=12, color=C["accent"], weight=600)
        if mb.get("code"):
            s.code_tag(W - 24, ty - 10, mb["code"])
        s.group_end()

    # 섹션 헤더 + 카드 그리드 — 표시 내용은 전적으로 SAE(라벨·상태)에서 유도
    sect_els = b.get("section") or []
    card_el = (b.get("card") or [{}])[0]
    cover_el = (b.get("cover") or [{}])[0]
    meta_el = (b.get("meta") or [{}])[0]
    # 카드 배지 변형 = 카드/배지 요소의 상태 토큰(없으면 화면 내 첫 상태) → 톤 사이클
    variants = (state_variants(card_el.get("state", ""))
                or state_variants(first_state(elements)))
    if not variants:
        variants = [(None, "muted")]
    # 카드 제목/메타/커버 힌트 — 요소 라벨에서(없으면 회색 placeholder)
    card_title = _trunc(card_el.get("label", ""), 22)  # 반복 카드의 컨텍스트 라벨(없으면 ""→placeholder)
    meta_txt = _trunc(meta_el.get("label", "") or meta_el.get("effect", ""), 26)
    if not meta_txt:
        extra = [e for e in b.get("display", []) if e is not card_el]
        meta_txt = _trunc(extra[0].get("label", ""), 26) if extra else ""
    cover_hint = _trunc(cover_el.get("label", ""), 18) if cover_el else ""

    cols, cw, ch, gx, gy = 4, 268, 300, 24, 24
    left = 24
    grid_top = 156
    if sect_els:
        sections = [(_trunc(se.get("label", ""), 30), se) for se in sect_els[:2]]
    else:
        sections = [("", None)]      # 섹션 요소 없으면 헤더 없는 단일 그리드
    cy = grid_top
    first_card_tagged = False
    for si, (slabel, sel) in enumerate(sections):
        rows = 2 if len(sections) == 1 else 1
        if slabel:
            s.group_start(_gname(sel or {}, "섹션 헤더"))
            s.text(left, cy, 400, 20, slabel, size=14, color=C["head"], weight=700)
            if sel and sel.get("code"):
                s.code_tag_left(left + text_px(slabel, 14) + 10, cy + 1, sel["code"])
            s.line(left, cy + 26, W - 48, C["border"])
            s.group_end()
            cy += 40
        for r in range(rows):
            for cidx in range(cols):
                cx = left + cidx * (cw + gx)
                blabel, tone = variants[(si * cols + r * cols + cidx) % len(variants)]
                s.group_start(_gname(card_el if not first_card_tagged else {}, "카드"))
                s.card(cx, cy, cw, ch, title=card_title, meta=meta_txt,
                       badge=blabel, badge_tone=tone, cover_hint=cover_hint)
                if not first_card_tagged:
                    if card_el.get("code"):
                        s.code_tag(cx + cw - 4, cy + 6, card_el["code"])
                    if cover_el.get("code"):
                        s.code_tag(cx + cw - 4, cy + int(ch * 0.56) - 16, cover_el["code"])
                    if meta_el.get("code"):
                        s.code_tag(cx + cw - 4, cy + ch - 22, meta_el["code"])
                    first_card_tagged = True
                s.group_end()
            cy += ch + gy

    # 태그라인(하단 고지)
    tl = (b.get("tagline") or [{}])[0]
    if tl:
        s.group_start(_gname(tl, "태그라인"))
        s.text(left, cy - 6, W - 48, 16, "ⓘ  " + _trunc(tl.get("effect") or tl.get("label", ""), 70),
               size=11, color=C["ink3"])
        s.group_end()
        cy += 22
    s.h = cy + 8
    return [s]


# ================================================================== archetype: workspace (리더형)
def build_workspace(page, code, name, route, covers, elements, ox, oy=0):
    W, H = 1180, 812
    b = bucket(elements)
    s = Screen(page, code, name, ox, oy, W, H)

    # 상단 툴바
    s.group_start("툴바 배경")
    s.bar(0, 0, W, 52)
    s.line(0, 52, W, C["line"])
    s.group_end()
    brand = (b.get("brand") or [{}])[0]
    s.group_start(_gname(brand, "로고"))
    s.rect(16, 10, 40, 32, fill=C["accent"], radius=8, name="logo")
    blab = _trunc(brand.get("label", name), 20)
    s.text(64, 16, 220, 20, blab, size=13.5, color=C["head"], weight=700)
    if brand.get("code"):
        s.code_tag_left(64 + text_px(blab, 13.5) + 8, 12, brand["code"])
    s.group_end()
    # 제목(첫 display) + 모드배지
    title_el = (b.get("display") or [None])[0]
    if title_el:
        s.group_start(_gname(title_el, "제목"))
        tlab = _trunc(title_el.get("label", ""), 26)
        s.text(300, 16, 300, 20, tlab, size=13, color=C["ink"], weight=600)
        if title_el.get("code"):
            s.code_tag_left(300 + text_px(tlab, 13) + 8, 12, title_el["code"])
        s.group_end()
    mb = (b.get("modebadge") or [{}])[0]
    if mb:
        s.group_start(_gname(mb, "모드 배지"))
        s.rect(560, 12, 78, 28, fill=C["soft"], radius=8, name="mode")
        s.text(560, 18, 78, 16, _trunc(mb.get("label", "모드"), 8), size=11, color=C["accent"], weight=600, align="center")
        s.group_end()
    # 툴바 토글 그룹(오른쪽) — pager 제외
    toggles = [t for t in b.get("toggle", []) if not _has(t.get("label", ""), "pager")]
    tx = W - 16
    for t in reversed(toggles[:7]):
        tw = max(46, 20 + len(_trunc(t.get("label", ""), 10)) * 8)
        tx -= tw + 8
        s.group_start(_gname(t, "토글"))
        s.toggle(tx, 10, tw, 32, _trunc(t.get("label", ""), 10))
        s.group_end()
    # 본문 3열: 좌 미리보기 패널 / 중 본문 패널 / 우 사이드바
    panels = b.get("panel", [])
    top = 66
    ph = H - top - 60
    lp_w, cp_w, sb_w, gap = 392, 392, 328, 16
    lx = 16
    cx = lx + lp_w + gap
    sx = cx + cp_w + gap
    # 좌: 미리보기 패널(첫 container) — 제목·프리뷰 라벨 모두 SAE에서
    lp = panels[0] if panels else {}
    s.group_start(_gname(lp, "미리보기 패널"))
    s.panel(lx, top, lp_w, ph, title=_trunc(lp.get("label", "패널"), 34))
    s.rect(lx + 20, top + 40, lp_w - 40, ph - 90, fill=C["ph"], stroke=C["border"], radius=6, name="preview")
    s.text(lx + 20, top + ph // 2 - 8, lp_w - 40, 16, "미리보기", size=12, color=C["ink3"], align="center")
    if lp.get("code"):
        s.code_tag(lx + lp_w - 8, top + 8, lp["code"])
    s.group_end()
    # 중: 본문 패널(둘째 container)
    cp = panels[1] if len(panels) > 1 else {}
    s.group_start(_gname(cp, "본문 패널"))
    s.panel(cx, top, cp_w, ph, title=_trunc(cp.get("label", "본문"), 30))
    # 하이라이트 본문 블록(box) + placeholder 텍스트
    box_el = None
    for el in elements:
        if (el.get("type") or "") == "box":
            box_el = el
            break
    s.rect(cx + 16, top + 44, cp_w - 32, 92, fill="#FFFBEB", stroke=C["warn"], radius=8, name="hl")
    for i in range(3):
        s.placeholder(cx + 28, top + 58 + i * 18, cp_w - 60 - (i * 40), 8, color=C["ph2"])
    if box_el and box_el.get("code"):
        s.code_tag(cx + cp_w - 24, top + 50, box_el["code"])
    for i in range(6):
        s.placeholder(cx + 16, top + 156 + i * 18, cp_w - 40 - (i % 3) * 30, 8,
                      color=C["ph"] if i % 2 else C["ph2"])
    s.group_end()
    # 인라인 칩(button 중 검색·닫기 제외) — 중앙 하단. 라벨은 SAE에서.
    CLOSE_KW = ("닫기", "close", "✕")
    inline_btns = [el for el in b.get("button", [])
                   if not _has(el.get("label", ""), "search")
                   and not any(k in (el.get("label", "") or "") for k in CLOSE_KW)]
    concept_lbls = [_trunc(e.get("label", ""), 12) for e in inline_btns[:3]] or ["항목"]
    while len(concept_lbls) < 3:
        concept_lbls.append(concept_lbls[-1])
    s.group_start(_gname(inline_btns[0] if inline_btns else {}, "인라인 칩"))
    chx = cx + 16
    chy = top + 280
    for i, lbl in enumerate(concept_lbls):
        cw = self_chip_w(lbl)
        s.rect(chx, chy, cw, 24, fill=C["soft"] if i == 0 else C["ph"], radius=12, name="concept")
        s.text(chx + 8, chy + 5, cw - 10, 14, lbl, size=10.5,
               color=C["accent"] if i == 0 else C["ink3"], weight=600)
        chx += cw + 8
    if inline_btns and inline_btns[0].get("code"):
        s.code_tag(cx + cp_w - 24, top + 274, inline_btns[0]["code"])
    s.group_end()
    # 우: 사이드바
    s.group_start(_gname((b.get("sidebar_tab") or [{}])[0], "사이드바 패널"))
    s.panel(sx, top, sb_w, ph, fill=C["card"])
    tab_el = (b.get("sidebar_tab") or [{}])[0]
    s.rect(sx + 12, top + 12, sb_w - 24, 34, fill=C["ph"], radius=8, name="tabs")
    s.text(sx + 20, top + 20, sb_w - 40, 16, _trunc(tab_el.get("label", "탭"), 26), size=11.5, color=C["ink2"], weight=600, align="center")
    if tab_el.get("code"):
        s.code_tag(sx + sb_w - 12, top + 4, tab_el["code"])
    s.group_end()
    # 사이드 검색 입력(search 역할, 없으면 비-pager input)
    si0 = (b.get("search") or [None])[0] or next(
        (el for el in b.get("input", []) if not _has(el.get("label", ""), "pager")), None)
    sy = top + 56
    if si0:
        s.group_start(_gname(si0, "사이드 검색"))
        s.field(sx + 12, sy, sb_w - 24, 34, placeholder=_trunc(si0.get("label", "검색"), 24), icon="⌕")
        if si0.get("code"):
            s.code_tag(sx + sb_w - 12, sy - 12, si0["code"])
        s.group_end()
        sy += 46
    # 사이드 리스트 아이템(navitem·card·list 버킷 병합 — 워크스페이스엔 카드 그리드 없음)
    listitems = b.get("navitem", []) + b.get("card", []) + b.get("list", [])
    for it in listitems[:6]:
        s.group_start(_gname(it, "리스트 아이템"))
        s.rect(sx + 12, sy, sb_w - 24, 40, fill=C["card"], stroke=C["line"], radius=6, name="li")
        s.text(sx + 22, sy + 6, sb_w - 44, 14, _trunc(it.get("label", ""), 30), size=11.5, color=C["ink"], weight=500)
        s.text(sx + 22, sy + 22, sb_w - 44, 12, _trunc(it.get("effect", ""), 34), size=9.5, color=C["ink3"])
        if it.get("code") and it is listitems[0]:
            s.code_tag(sx + sb_w - 12, sy + 2, it["code"])
        s.group_end()
        sy += 46
    # 하단 페이지 컨트롤
    fy = H - 50
    s.group_start("페이지 컨트롤 배경")
    s.bar(0, fy, W, 50, fill=C["card"])
    s.line(0, fy, W, C["line"])
    s.group_end()
    pagers = [el for el in elements if _has(el.get("label", ""), "pager")]
    s.group_start(_gname(pagers[0] if pagers else {}, "페이지 네비"))
    s.button(16, fy + 8, 100, 34, "‹   ›", primary=False)
    s.field(126, fy + 8, 150, 34, placeholder="1  /  N")
    if pagers and pagers[0].get("code"):
        s.code_tag(116, fy - 4, pagers[0]["code"])
    s.group_end()

    screens = [s]
    # 오버레이 패널 — 별도 board 로 우측에 배치. 제목·섹션 라벨 모두 SAE에서.
    ov = (b.get("overlay") or [{}])[0]
    if ov:
        btns = b.get("button", [])
        CLOSE_KW2 = ("닫기", "close", "✕")
        close_el = next((el for el in btns
                         if any(w in (el.get("label", "") or "") for w in CLOSE_KW2)), {})
        # 오버레이 섹션 = 검색·닫기 제외 버튼(라벨을 섹션 헤더로) — 없으면 중립 단일 섹션
        sec_btns = [el for el in btns if el is not close_el
                    and not _has(el.get("label", ""), "search")][:3]
        sec_defs = [(_trunc(el.get("label", ""), 24), el) for el in sec_btns] or [("항목", {})]
        subtitle = _trunc(ov.get("effect", ""), 40)
        o = Screen(page, code + "-A", _trunc(ov.get("label", "오버레이 패널"), 24), ox + W + 40, oy, 420, 560)
        o.group_start("오버레이 배경")
        o.rect(0, 0, 420, 560, fill=C["scrim"], opacity=0.12, name="scrim")
        o.group_end()
        o.group_start(_gname(ov, "오버레이 패널"))
        o.panel(24, 24, 372, 512, fill=C["card"])
        if subtitle:
            o.text(44, 46, 320, 16, subtitle, size=10.5, color=C["accent"], weight=600)
        o.text(44, 66, 320, 24, _trunc(ov.get("label", "패널"), 20), size=19, color=C["ink"], weight=700)
        if ov.get("code"):
            o.code_tag(372, 34, ov["code"])
        o.group_end()
        o.group_start(_gname(close_el, "닫기 버튼"))
        o.rect(358, 42, 30, 28, fill=C["ph"], radius=6, name="close")
        o.text(358, 48, 30, 16, "✕", size=13, color=C["ink2"], align="center")
        if close_el.get("code"):
            o.code_tag(358, 74, close_el["code"])
        o.group_end()
        ovy = 110
        for si, (sec, sel) in enumerate(sec_defs):
            o.group_start(_gname(sel, "섹션 " + str(si + 1)))
            o.text(44, ovy, 320, 16, sec, size=12.5, color=C["ink"], weight=600)
            if sel.get("code"):
                o.code_tag(388, ovy - 2, sel["code"])
            ovy += 26
            for j in range(2):
                cwid = 150
                px = 44 + j * (cwid + 12)
                o.rect(px, ovy, cwid, 34, fill=C["soft"] if si == 0 else C["card"],
                       stroke=None if si == 0 else C["border"], radius=8, name="ochip")
                o.placeholder(px + 12, ovy + 9, 88, 8, color=C["accent"] if si == 0 else C["ph2"])
                o.placeholder(px + 12, ovy + 21, 52, 6, color=C["ph2"])
            ovy += 52
            o.group_end()
        screens.append(o)
    return screens


def self_chip_w(label):
    return max(52, 20 + len(_trunc(label, 12)) * 8)


# ================================================================== archetype: console (파이프라인형)
def build_console(page, code, name, route, covers, elements, ox, oy=0):
    W = 1180
    b = bucket(elements)
    s = Screen(page, code, name, ox, oy, W, 100)

    # 헤더 — 큰 제목은 화면명(SAE), eyebrow 는 flow/display 요소 라벨 또는 중립
    flow_el = (b.get("flow") or b.get("display") or [{}])[0]
    s.group_start("헤더")
    s.text(24, 14, 400, 14, _trunc(flow_el.get("label", "") or "콘솔", 40), size=10.5, color=C["accent"], weight=600)
    s.text(24, 30, 700, 24, _trunc(name, 40), size=19, color=C["head"], weight=700)
    s.group_end()
    back = (b.get("back") or [{}])[0]
    s.group_start(_gname(back, "뒤로 버튼"))
    s.button(W - 24 - 116, 20, 116, 34, _trunc(back.get("label", "← 뒤로"), 12), primary=False)
    if back.get("code"):
        s.code_tag(W - 24, 6, back["code"])
    s.group_end()

    # 컨트롤 바 — 입력·업로드·범위 라벨 모두 SAE에서(없으면 중립)
    cty = 78
    s.group_start("컨트롤 바 배경")
    s.panel(24, cty, W - 48, 62, fill=C["card"])
    s.group_end()
    inputs = b.get("input", [])
    up = (b.get("upload") or [{}])[0]
    ix = 40
    if inputs:
        s.group_start(_gname(inputs[0], "소스 입력"))
        s.field(ix, cty + 11, 320, 40, placeholder=_trunc(inputs[0].get("label", "입력"), 30) + "  ▾", icon="▤")
        if inputs[0].get("code"):
            s.code_tag(ix + 300, cty - 2, inputs[0]["code"])
        s.group_end()
        ix += 336
    if up:
        s.group_start(_gname(up, "업로드 버튼"))
        s.button(ix, cty + 11, 176, 40, _trunc(up.get("label", "⬆ 업로드"), 16), primary=False)
        if up.get("code"):
            s.code_tag(ix + 176, cty - 2, up["code"])
        s.group_end()
        ix += 192
    if len(inputs) > 1:
        s.group_start(_gname(inputs[1], "범위 입력"))
        s.field(ix, cty + 11, 180, 40, placeholder=_trunc(inputs[1].get("label", "범위"), 18))
        if inputs[1].get("code"):
            s.code_tag(ix + 180, cty - 2, inputs[1]["code"])
        s.group_end()

    # 단계 수·상태 = 단계 컨테이너(container→panel, 라벨에 '카드'면 card 역할) 또는 flow 상태 토큰에서.
    stage_el = (b.get("panel") or b.get("card") or [{}])[0]
    run_el = (b.get("button") or [{}])[0]
    disp = b.get("display", [])
    result_el = next((d for d in disp if d is not flow_el), {})
    st_var = state_variants(stage_el.get("state", "")) or state_variants(flow_el.get("state", ""))
    n = max(3, min(5, len(st_var) or 4))
    NUM = ["①", "②", "③", "④", "⑤"]
    tones = [t for (_, t) in st_var][:n]
    while len(tones) < n:
        tones.append("muted")

    # 가로 단계 플로우(박스 + 화살표)
    fy = 156
    nx = 24
    node_w = (W - 48 - (n - 1) * 40) // n
    s.group_start(_gname(flow_el, "단계 플로우"))
    for i in range(n):
        tone = tones[i]
        fill = {"ok": "#DCFAE6", "warn": C["soft"], "muted": C["ph"]}[tone]
        strk = {"ok": C["ok"], "warn": C["accent"], "muted": C["border"]}[tone]
        s.rect(nx, fy, node_w, 46, fill=fill, stroke=strk, radius=8, name="flownode")
        s.text(nx, fy + 15, node_w, 16, f"{NUM[i]} 단계", size=12.5, color=C["ink"], weight=600, align="center")
        if i < n - 1:
            ax = nx + node_w + 12
            s.text(ax, fy + 12, 16, 20, "→", size=18, color=C["ink3"], align="center")
        nx += node_w + 40
    if flow_el.get("code"):
        s.code_tag(W - 24, fy - 12, flow_el["code"])
    s.group_end()

    # 단계 카드(세로 스택) — 제목=번호+container 라벨, 결과 행=SAE 결과 라벨 or 회색 placeholder
    stage_label = _trunc(stage_el.get("label", "") or "단계", 20)
    run_label = _trunc(run_el.get("label", "실행"), 12)
    result_txt = _trunc(result_el.get("label", "") or result_el.get("effect", ""), 80)
    sy = 224
    for i in range(n):
        tone = tones[i]
        s.group_start(_gname(stage_el if i == 0 else {}, "단계 카드 " + str(i + 1)))
        s.panel(24, sy, W - 48, 92, fill=C["card"])
        s.text(44, sy + 16, 700, 18, f"{NUM[i]} {stage_label}", size=13.5, color=C["ink"], weight=600)
        s.button(W - 24 - 140, sy + 12, 128, 32, run_label, primary=(tone == "warn"))
        s.rect(W - 24 - 280, sy + 12, 120, 32, fill=C["card"], stroke=C["border"], radius=8, name="code")
        s.text(W - 24 - 280, sy + 19, 120, 16, "{ } 코드", size=11, color=C["ink2"], align="center")
        s.rect(44, sy + 52, W - 48 - 40, 28, fill=C["ph"], radius=6, name="resbg")
        if i == 0 and result_txt:
            s.text(56, sy + 58, W - 140, 16, result_txt, size=11, color=C["ink2"])
        else:
            s.placeholder(56, sy + 62, int((W - 200) * 0.5), 9)
        if i == 0:
            if stage_el.get("code"):
                s.code_tag(W - 24 - 288, sy + 2, stage_el["code"])
            if run_el.get("code"):
                s.code_tag(W - 24, sy + 2, run_el["code"])
            if result_el and result_el.get("code"):
                s.code_tag(W - 60, sy + 46, result_el["code"])
        s.group_end()
        sy += 104
    s.h = sy + 8
    return [s]


# ================================================================== archetype: auto (범용)
def build_auto(page, code, name, route, covers, elements, ox, oy=0):
    """범용 폴백 · 도메인 중립 — 역할별 세로 섹션(상단바 → 요약 타일 → 컨트롤 → 리스트 → 패널 → 카드).
    상세/요약형 화면(뒤로+헤더+리스트 반복)에 적합. 모든 표시 텍스트는 SAE 라벨·상태에서."""
    W = 1180
    b = bucket(elements)
    s = Screen(page, code, name, ox, oy, W, 100)
    left, right = 24, W - 24
    inner = W - 48

    # 상단 바: back/brand(좌) + user/nav(우)
    s.group_start("상단 바 배경")
    s.bar(0, 0, W, 60)
    s.line(0, 60, W, C["line"])
    s.group_end()
    lead_list = (b.get("back") or [])[:1] or (b.get("brand") or [])[:1]
    lead = lead_list[0] if lead_list else {"label": name}
    is_back = _has(lead.get("label", ""), "back")
    s.group_start(_gname(lead, "뒤로" if is_back else "로고"))
    if is_back:
        s.button(24, 14, 96, 32, _trunc(lead.get("label", "← 뒤로"), 12), primary=False)
        blab = _trunc(name, 26)
        s.text(136, 20, 360, 20, blab, size=14.5, color=C["head"], weight=700)
        if lead.get("code"):
            s.code_tag_left(136 + text_px(blab, 14.5) + 8, 14, lead["code"])
    else:
        s.rect(24, 14, 40, 32, fill=C["accent"], radius=8, name="logo")
        blab = _trunc(lead.get("label", name), 24)
        s.text(72, 20, 360, 20, blab, size=14.5, color=C["head"], weight=700)
        if lead.get("code"):
            s.code_tag_left(72 + text_px(blab, 14.5) + 8, 14, lead["code"])
    s.group_end()
    rx = right
    for it in reversed((b.get("usermenu", []) + b.get("navitem", []))[:4]):
        tw = max(70, 20 + len(_trunc(it.get("label", ""), 12)) * 7.5)
        rx -= tw + 10
        s.group_start(_gname(it, "네비 항목"))
        s.text(rx, 22, tw, 16, _trunc(it.get("label", ""), 12), size=12, color=C["ink2"], weight=500, align="center")
        s.group_end()

    y = 84

    # list 요소는 role_of 가 'list' 를 돌려주지 않으므로 **요소 유형(type=='list')** 으로 직접 판별.
    def _is_list(el):
        return (el.get("type") or "") == "list"
    lists = [el for el in elements if _is_list(el)]

    # 요약 타일(가로) — 리스트 아닌 display/badge/section/modebadge, 값은 상태 배지 또는 회색 바
    summ = [el for el in elements if not _is_list(el)
            and (el.get("type") in ("display", "badge")
                 or role_of(el) in ("display", "section", "modebadge"))]
    if summ:
        tiles = summ[:4]
        gapp = 16
        tw = (inner - gapp * (len(tiles) - 1)) // len(tiles)
        for i, el in enumerate(tiles):
            tx = left + i * (tw + gapp)
            s.group_start(_gname(el, "요약"))
            s.panel(tx, y, tw, 76, fill=C["card"])
            s.text(tx + 14, y + 14, tw - 28, 14, _trunc(el.get("label", ""), 22),
                   size=11, color=C["ink3"], weight=600)
            vs = state_variants(el.get("state", ""))
            if vs:
                bl, bt = vs[0]
                s.chip(tx + 14, y + 38, bl or "—", tone=bt)
            else:
                s.placeholder(tx + 14, y + 42, int((tw - 28) * 0.6), 10)
            if el.get("code"):
                s.code_tag(tx + tw - 8, y + 6, el["code"])
            s.group_end()
        y += 92

    # 컨트롤 바 — search/input/toggle/button 가로 흐름
    controls = (b.get("search", []) + b.get("input", []) + b.get("search_btn", []) +
                b.get("toggle", []) + b.get("button", []))
    if controls:
        s.group_start("컨트롤 바 배경")
        s.panel(left, y, inner, 60, fill=C["card"])
        s.group_end()
        x = left + 16
        for el in controls[:6]:
            r = role_of(el)
            lbl = el.get("label", "")
            nm = {"search": "검색", "input": "입력", "toggle": "토글",
                  "button": "버튼", "search_btn": "버튼"}.get(r, "컨트롤")
            s.group_start(_gname(el, nm))
            if r in ("search", "input"):
                w = 260 if r == "search" else 190
                s.field(x, y + 11, w, 38, placeholder=_trunc(lbl, 30), icon="⌕" if r == "search" else None)
            elif r == "toggle":
                w = max(90, 20 + len(_trunc(lbl, 12)) * 8)
                s.toggle(x, y + 11, w, 38, _trunc(lbl, 12))
            else:
                w = max(110, 20 + len(_trunc(lbl, 12)) * 8)
                s.button(x, y + 11, w, 38, _trunc(lbl, 14), primary=(r == "search_btn"))
            if el.get("code"):
                s.code_tag(x + w, y - 2, el["code"])
            x += w + 12
            s.group_end()
        y += 76

    # 리스트 섹션 — list 요소(type=='list')마다 헤더(라벨) + N 반복 행(중립 스켈레톤)
    for le in lists[:3]:
        s.group_start(_gname(le, "리스트"))
        s.text(left, y, 500, 18, _trunc(le.get("label", ""), 40), size=13, color=C["head"], weight=700)
        if le.get("code"):
            s.code_tag(right, y - 2, le["code"])
        yy = y + 26
        lvs = state_variants(le.get("state", ""))
        for r in range(3):
            s.rect(left, yy, inner, 44, fill=C["card"], stroke=C["line"], radius=8, name="row")
            s.placeholder(left + 16, yy + 13, int(inner * 0.28), 9)
            s.placeholder(left + 16, yy + 27, int(inner * 0.18), 7, color=C["ph"])
            if lvs:
                bl, bt = lvs[r % len(lvs)]
                s.chip(right - 96, yy + 12, bl or "—", tone=bt)
            else:
                s.placeholder(right - 96, yy + 17, 80, 10)
            yy += 50
        s.group_end()
        y = yy + 8

    # 패널/컨테이너
    panels = b.get("panel", [])
    if panels:
        ncol = min(2, len(panels))
        pw = (inner - (ncol - 1) * 16) // ncol
        for i, p in enumerate(panels[:2]):
            px = left + (i % ncol) * (pw + 16)
            s.group_start(_gname(p, "패널"))
            s.panel(px, y, pw, 150, title=_trunc(p.get("label", ""), 30), dashed=True)
            for k in range(4):
                s.placeholder(px + 16, y + 44 + k * 20, pw - 40 - (k % 2) * 40, 9)
            if p.get("code"):
                s.code_tag(px + pw - 8, y + 8, p["code"])
            s.group_end()
        y += 166

    # 카드 그리드 — card 요소만(section/display 는 요약 타일에서 이미 처리)
    cards = b.get("card", [])
    if cards:
        cols, cw, chh, gx, gy = 3, 372, 150, 16, 16
        for i, el in enumerate(cards[:6]):
            cx = left + (i % cols) * (cw + gx)
            cyy = y + (i // cols) * (chh + gy)
            s.group_start(_gname(el, "카드"))
            s.card(cx, cyy, cw, chh, title=_trunc(el.get("label", ""), 24),
                   meta=_trunc(el.get("effect", ""), 30), cover_hint="")
            if el.get("code"):
                s.code_tag(cx + cw - 8, cyy + 8, el["code"])
            s.group_end()
        rows = (min(len(cards), 6) + cols - 1) // cols
        y += rows * (chh + gy)

    # 오버레이(있으면 힌트 행)
    for o in b.get("overlay", [])[:1]:
        s.group_start(_gname(o, "오버레이"))
        s.panel(left, y, inner, 56, fill=C["soft"])
        s.text(left + 16, y + 20, inner - 32, 16, "▤  " + _trunc(o.get("label", ""), 40),
               size=12, color=C["accent"], weight=600)
        if o.get("code"):
            s.code_tag(right, y + 6, o["code"])
        s.group_end()
        y += 72

    s.h = y + 16
    return [s]


# ================================================================== archetype: form (폼/입력형)
def build_form(page, code, name, route, covers, elements, ox, oy=0):
    """폼/입력형 · 도메인 중립 — 상단 바 + 제목 + 라벨·입력 필드 세로 스택 + 제출 버튼.
    field(input/search)·select(toggle=세그먼트)·button(제출) 역할을 세로 폼으로 배치.
    표시 텍스트는 SAE 라벨·상태에서. 값 없는 필드는 회색 placeholder."""
    W = 760
    b = bucket(elements)
    s = Screen(page, code, name, ox, oy, W, 100)
    left = 40
    inner = W - 80

    # 상단 바: 취소/뒤로(좌) + 제목
    s.group_start("상단 바 배경")
    s.bar(0, 0, W, 56)
    s.line(0, 56, W, C["line"])
    s.group_end()
    back = (b.get("back") or [{}])[0]
    tx0 = left
    if back:
        s.group_start(_gname(back, "취소"))
        s.button(left, 12, 88, 32, _trunc(back.get("label", "← 뒤로"), 12), primary=False)
        if back.get("code"):
            s.code_tag_left(left + 96, 14, back["code"])
        s.group_end()
        # 코드칩(left+96~)이 있으면 제목을 그 뒤로 밀어 겹침 방지
        tx0 = (left + 160) if back.get("code") else (left + 104)
    title_el = (b.get("display") or [{}])[0]
    tlab = _trunc(title_el.get("label", "") or name, 30)
    s.group_start(_gname(title_el if title_el.get("label") else {}, "제목"))
    s.text(tx0, 18, 400, 20, tlab, size=15, color=C["head"], weight=700)
    s.group_end()

    y = 84
    # 필드(입력·토글)·버튼·안내 구분 — 요소 순서 보존
    fields = [el for el in elements if role_of(el) in ("search", "input", "toggle")]
    buttons = [el for el in elements if role_of(el) in ("button", "search_btn")]
    infos = b.get("display", [])[1:]     # 제목 제외 나머지 display → 안내/미리보기 행

    # 폼 카드 배경(대략 높이 = 필드·안내 수 기반)
    row_h = 66
    body_h = 20 + len(fields) * row_h + len(infos) * 44 + 20
    s.group_start("폼 카드")
    s.panel(left, y, inner, body_h, fill=C["card"])
    s.group_end()
    fy = y + 20
    for el in fields:
        r = role_of(el)
        lbl = el.get("label", "")
        s.group_start(_gname(el, "필드"))
        s.text(left + 20, fy, inner - 40, 14, _trunc(lbl, 34), size=11.5, color=C["ink2"], weight=600)
        if r == "toggle":
            # 세그먼트 컨트롤 — 상태 토큰을 옵션으로(도메인 중립)
            opts = [lb for (lb, _t) in state_variants(el.get("state", ""), limit=4)] or ["옵션"]
            ox2 = left + 20
            for i, op in enumerate(opts):
                ow = max(72, 16 + len(op) * 9)
                s.rect(ox2, fy + 20, ow, 34, fill=C["soft"] if i == 0 else C["card"],
                       stroke=None if i == 0 else C["border"], radius=8, name="seg")
                s.text(ox2, fy + 28, ow, 16, _trunc(op, 10), size=11,
                       color=C["accent"] if i == 0 else C["ink2"], weight=600, align="center")
                ox2 += ow + 8
        else:
            s.field(left + 20, fy + 20, inner - 40, 38, placeholder=_trunc(lbl, 40),
                    icon="⌕" if r == "search" else None)
        if el.get("code"):
            s.code_tag(left + inner - 20, fy - 2, el["code"])
        s.group_end()
        fy += row_h
    # 안내/미리보기 행(display)
    for el in infos:
        s.group_start(_gname(el, "안내"))
        s.rect(left + 20, fy, inner - 40, 34, fill=C["ph"], radius=6, name="info")
        s.text(left + 32, fy + 9, inner - 64, 16, "ⓘ  " + _trunc(el.get("label", ""), 42),
               size=11, color=C["ink2"])
        if el.get("code"):
            s.code_tag(left + inner - 20, fy - 2, el["code"])
        s.group_end()
        fy += 44
    y += body_h + 16
    # 버튼 — 마지막 = primary 제출, 나머지 = secondary(우측 정렬)
    if buttons:
        bx = left + inner
        for bel in buttons[:3]:
            primary = (bel is buttons[-1])
            bw = 150
            bx -= bw + 12
            s.group_start(_gname(bel, "버튼"))
            s.button(bx, y, bw, 44, _trunc(bel.get("label", "제출"), 16), primary=primary)
            if bel.get("code"):
                s.code_tag(bx + bw, y - 2, bel["code"])
            s.group_end()
        y += 60
    s.h = y + 16
    return [s]


ARCHETYPES = {
    "list_grid": build_list_grid,
    "workspace": build_workspace,
    "console": build_console,
    "form": build_form,
    "auto": build_auto,
}


def pick_archetype(code, elements, forced=None, spec_arch=None):
    if forced and forced in ARCHETYPES:
        return forced
    if spec_arch and spec_arch in ARCHETYPES:
        return spec_arch
    if code in CODE_ARCHETYPE:
        return CODE_ARCHETYPE[code]
    if code in DEFAULT_SCREENS:
        return DEFAULT_SCREENS[code][2]
    # 휴리스틱(우선순위: 카드그리드 → 폼 → 파이프라인 → 워크스페이스 → 범용)
    b = bucket(elements)
    labels = " ".join(el.get("label", "") for el in elements).lower()
    pipeline_kw = ("스테이지", "stage", "파이프라인", "pipeline", "단계", "잡", "실행 로그")
    inputs = b.get("input", []) + b.get("search", [])
    if b.get("card") or (b.get("navitem") and (b.get("search") or b.get("input"))):
        return "list_grid"
    # 폼: 입력 필드 다수 + 제출 버튼, 카드/리스트 그리드 없음
    if len(inputs) >= 3 and b.get("button") and not b.get("card"):
        return "form"
    if any(k in labels for k in pipeline_kw):
        return "console"
    if len(b.get("panel", [])) >= 2 or len(b.get("toggle", [])) >= 4:
        return "workspace"
    return "auto"


# ================================================================== SAE 파싱
# 파서(_find_bullet_list·_heading_name_route·_doc_covers·parse_sae_doc·CODE_RE)는 공용 모듈
# _sae_parse 로 추출 — wfscan 과 규약을 100% 공유한다(상단 import 참조).


def load_screen(sae_dir, screen_code):
    """WF-<CODE>.json 있으면 SAE 파싱, 없으면 폴백. 반환 (name,route,covers,els,arch,meta).
    meta = 스펙 wrapper 의 재편성 필드(order·phase·impl·desc — 없으면 None)."""
    fb = DEFAULT_SCREENS.get(screen_code)
    fb_name = fb[0] if fb else screen_code
    fb_route = fb[1] if fb else "/"
    path = os.path.join(sae_dir, f"WF-{screen_code}.json") if sae_dir else None
    if path and os.path.isfile(path):
        try:
            art = json.load(open(path, encoding="utf-8"))
            doc = art.get("doc") or {}
            name, route = _heading_name_route(doc, art.get("title") or fb_name, art.get("route") or fb_route)
            covers = _doc_covers(art)
            els = parse_sae_doc(doc)
            meta = {k: art.get(k) for k in ("order", "phase", "impl", "desc")}
            return name, route, covers, els, art.get("archetype"), meta
        except Exception as e:
            print(f"[wfgen] ⚠ WF-{screen_code}.json 파싱 실패 → 골격 생성: {str(e)[:80]}")
    return fb_name, fb_route, [], [], None, {}


# ================================================================== 재편성 v2.1 — 범례·설명 패널·행 배치
def _wrap_px(s, size, maxw):
    """픽셀폭(text_px 추정) 기준 줄바꿈 — CJK 안전. 개행 유지."""
    lines = []
    for raw in (s or "").split("\n"):
        cur = ""
        for ch in raw:
            cur += ch
            if text_px(cur, size) > maxw:
                sp = cur.rfind(" ")
                if sp > 6:
                    lines.append(cur[:sp])
                    cur = cur[sp + 1:]
                else:
                    lines.append(cur[:-1])
                    cur = ch
        if cur.strip():
            lines.append(cur)
    return lines


def legend_ops(page_id, project):
    """캔버스 최상단 제목 + 구현상태 범례(페이지 루트 객체)."""
    ops = []

    def emit(o):
        ops.append(add_change(page_id, o))

    emit(text_obj(_uid(), "문서 제목", 0, 0, 1100, 32, ROOT_UUID,
                  f"{project} 와이어프레임 — 앱 사용 시나리오 순서", color=C["head"], size=23, weight=700))
    x = 0
    for key in ("implemented", "partial", "planned"):
        st = IMPL_STYLE[key]
        emit(rect_obj(_uid(), "범례 스와치", x, 46, 26, 16, ROOT_UUID,
                      fill=C["card"], stroke=st["stroke"], dashed=st["dashed"], radius=4, stroke_w=2))
        emit(text_obj(_uid(), "범례", x + 34, 46, 300, 16, ROOT_UUID,
                      f"{st['mark']} {st['label']}", color=C["ink2"], size=12, weight=600))
        x += 34 + int(text_px(f"{st['mark']} {st['label']}", 12)) + 44
    return ops


def desc_panel_ops(page_id, x, y, code, name, route, covers, meta):
    """화면 board 우측 설명 패널(페이지 루트 객체) — 제목·구현상태 배지·라우트·설명·covers.
    반환 (ops, 패널폭, 패널높이)."""
    impl = (meta.get("impl") or "planned").lower()
    st = IMPL_STYLE.get(impl, IMPL_STYLE["planned"])
    inner = PANEL_W - 48
    lines = _wrap_px((meta.get("desc") or "").strip(), 12, inner)
    cov_lines = _wrap_px("covers: " + " · ".join(covers), 10.5, inner) if covers else []
    h = max(170, 20 + 26 + 22 + 24 + len(lines) * 19 + (8 + len(cov_lines) * 15 if cov_lines else 0) + 22)
    ops = []

    def emit(o):
        ops.append(add_change(page_id, o))

    emit(rect_obj(_uid(), f"{code} 설명 패널", x, y, PANEL_W, h, ROOT_UUID,
                  fill=C["card"], stroke=st["stroke"], dashed=st["dashed"], radius=12, stroke_w=2))
    yy = y + 20
    emit(text_obj(_uid(), "패널 제목", x + 24, yy, inner, 20, ROOT_UUID,
                  f"{code} · {name}", color=C["head"], size=14.5, weight=700))
    yy += 26
    emit(text_obj(_uid(), "구현상태", x + 24, yy, inner, 16, ROOT_UUID,
                  f"{st['mark']} {st['label']}", color=st["stroke"], size=12, weight=700))
    yy += 22
    emit(text_obj(_uid(), "라우트", x + 24, yy, inner, 14, ROOT_UUID,
                  route or "", color=C["ink3"], size=10.5))
    yy += 24
    for ln in lines:
        emit(text_obj(_uid(), "설명", x + 24, yy, inner, 16, ROOT_UUID, ln, color=C["ink2"], size=12))
        yy += 19
    if cov_lines:
        yy += 8
        for ln in cov_lines:
            emit(text_obj(_uid(), "covers", x + 24, yy, inner, 13, ROOT_UUID, ln, color=C["ink3"], size=10.5))
            yy += 15
    return ops, PANEL_W, h


def assemble(page_id, screens_data, project):
    """정렬된 screens_data 를 phase 행으로 배치해 change-ops 조립(범례·phase 헤더·board 테두리·설명 패널 포함).
    반환 (all_ops, screens_objs, plan, stats) — components 는 file_id 확정 후 별도 emit."""
    all_ops = list(legend_ops(page_id, project))
    plan, screens_objs, stats = [], [], []
    row_y, cur_phase, first_row = 96, object(), True
    ox, row_max_h = 0, 0
    for (sc, name, route, covers, els, arch, meta) in screens_data:
        ph = (meta.get("phase") or "").strip() or "화면"
        if ph != cur_phase:
            if not first_row:
                row_y += row_max_h + ROW_GAP
            first_row, cur_phase, ox, row_max_h = False, ph, 0, 0
            all_ops.append(add_change(page_id, text_obj(
                _uid(), "단계 헤더", 0, row_y, 1400, 28, ROOT_UUID, ph,
                color=C["head"], size=17, weight=700)))
        oy = row_y + 46
        builder = ARCHETYPES[arch]
        scr = builder(page_id, sc, name, route, covers, els, ox, oy)
        st = IMPL_STYLE.get((meta.get("impl") or "planned").lower(), IMPL_STYLE["planned"])
        wmax, nops, ncomp = ox, 0, 0
        for s in scr:
            s.board_stroke, s.board_dashed = st["stroke"], st["dashed"]
            sops = s.finalize()
            all_ops.extend(sops)
            nops += len(sops)
            ncomp += len(s.components)
            plan.append((f"{s.code}", s.bid, len(els), len(s.kids), arch))
            wmax = max(wmax, s.ox + s.w)
            row_max_h = max(row_max_h, (s.oy - row_y) + s.h)
            screens_objs.append(s)
        pops, pw, ph_h = desc_panel_ops(page_id, wmax + 28, oy, sc, name, route, covers, meta)
        all_ops.extend(pops)
        row_max_h = max(row_max_h, (oy - row_y) + ph_h)
        ox = wmax + 28 + pw + SCREEN_GAP
        stats.append((sc, arch, len(els), len(scr), nops, ncomp))
    return all_ops, screens_objs, plan, stats


def _order_key(t):
    o = t[6].get("order")
    return (o if isinstance(o, (int, float)) else 10 ** 6, t[0])


# ================================================================== main
def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--project")
    ap.add_argument("--file-name", dest="file_name")
    ap.add_argument("--screens")
    ap.add_argument("--sae-dir", dest="sae_dir")
    ap.add_argument("--penpot-project-id", dest="pp_pid")
    ap.add_argument("--archetype", choices=list(ARCHETYPES.keys()))
    ap.add_argument("--delete-file", dest="delete_file_id")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    cfg = resolve()
    project = args.project or cfg["project"]
    if not project and not args.pp_pid:
        print("[wfgen] PLM 프로젝트 미지정(--project 또는 config/plm.json). 중단.")
        return

    sae_dir = args.sae_dir
    if not sae_dir and cfg["ouro"]:
        cand = os.path.join(cfg["ouro"], "docs", "wireframes")
        sae_dir = cand if os.path.isdir(cand) else None

    if args.screens:
        codes = [c.strip().upper() for c in args.screens.split(",") if c.strip()]
    elif sae_dir and os.path.isdir(sae_dir):
        # SAE 디렉토리의 WF-*.json 전량(개수 제한 없음 — 이 제품에 필요한 만큼).
        codes = sorted(m.group(1) for f in os.listdir(sae_dir)
                       if (m := re.match(r"WF-([A-Z]{2,6})\.json$", f)))
    else:
        codes = []

    # 고정 샘플(LIB/RDR/PIPE) 폴백 금지 — 화면은 이 프로젝트의 SAE 스펙에서 나온다.
    if not codes:
        print("[wfgen] ✖ 생성할 화면이 없습니다. 이 제품에 필요한 화면의 SAE 스펙을 먼저 저작하세요(개수 제한 없음):")
        print(f"          {sae_dir or '<프로젝트>/.ouroboros/docs/wireframes'}/WF-<SCREEN_CODE>.json  (화면마다 1개)")
        print("          포맷=_WIREFRAME-SAE-METHODOLOGY.md. 계획(BS/Roadmap/URS·UCS·SRS)에서 필요한 화면을 도출해 스펙을 만든 뒤 다시 실행.")
        print("          (스펙 없이 골격만 빠르게 보려면 --screens <CODE,...> 로 명시.)")
        sys.exit(2)

    screens_data = []
    for sc in codes:
        name, route, covers, els, spec_arch, meta = load_screen(sae_dir, sc)
        arch = pick_archetype(sc, els, forced=args.archetype, spec_arch=spec_arch)
        screens_data.append((sc, name, route, covers, els, arch, meta))
    # 시나리오 순서 정렬(스펙 wrapper `order` 오름차순 · 없으면 뒤로+코드순)
    screens_data.sort(key=_order_key)

    file_name = args.file_name or f"{project} 와이어프레임 (SAE)"

    # --dry-run
    if args.dry_run:
        print(f"[wfgen --dry-run] file='{file_name}' · sae_dir={sae_dir}")
        all_ops, screens_objs, plan, stats = assemble(_uid(), screens_data, project or "?")
        total = len(all_ops) + sum(st[5] for st in stats)
        for (sc, arch, nels, nb, nops, ncomp) in stats:
            print(f"  {sc:<5} [{arch:<9}] 요소 {nels:>2} · board {nb} · "
                  f"ops {nops:>3} · 컴포넌트 {ncomp:>2}")
        print(f"  합계 change-ops(컴포넌트·범례·패널 포함): {total}")
        return

    if not cfg["penpot_token"]:
        # self-heal: PLM 인증으로 penpot 토큰 대행 발급(ouro-token 미러링) → .env 자동 기입.
        healed = _selfheal_penpot_token(cfg["plm_api"], cfg["plm_token"], cfg["ouro"])
        if healed:
            cfg["penpot_token"] = healed
            print("[wfgen] penpot 토큰 자동 발급(.env) — PLM 인증으로 프로비저닝 완료.")
        else:
            print("[wfgen] penpot 토큰 없음 — .ouroboros/env/.env 의 PENPOT_ACCESS_TOKEN 확인. 중단.")
            return
    base, tok = cfg["penpot_api"], cfg["penpot_token"]

    pp_pid = args.pp_pid
    if not pp_pid:
        try:
            team_id = find_team(base, tok, project)
        except Exception as e:
            print(f"[wfgen] penpot get-teams 실패: {str(e)[:120]}")
            return
        if not team_id:
            print(f"[wfgen] penpot 팀 'PLM · {project}' 없음 — 와이어프레임 탭을 먼저 열어 팀 생성.")
            return
        try:
            pp_pid = find_wf_project(base, tok, team_id, "Wireframes")
        except Exception as e:
            print(f"[wfgen] penpot get-projects 실패: {str(e)[:120]}")
            return
        if not pp_pid:
            print(f"[wfgen] penpot 팀 'PLM · {project}' 안 'Wireframes' 프로젝트 없음.")
            return

    # 0) 기존 나쁜 파일 삭제(옵션)
    if args.delete_file_id:
        try:
            delete_file(base, tok, args.delete_file_id)
            print(f"[wfgen] 기존 파일 삭제: {args.delete_file_id}")
        except Exception as e:
            print(f"[wfgen] delete-file 경고(계속 진행): {str(e)[:120]}")

    # 1) create-file
    try:
        created = penpot_rpc(base, tok, "create-file", {"name": file_name, "project-id": pp_pid})
    except Exception as e:
        print(f"[wfgen] create-file 실패: {str(e)[:200]}")
        return
    file_id = _pget(created, "id")
    if not file_id:
        print(f"[wfgen] create-file 응답에 file id 없음: {json.dumps(created)[:200]}")
        return
    print(f"[wfgen] 파일 생성: id={file_id}  name='{file_name}'  (project-id={pp_pid})")

    # 2) get-file → revn·vern·pageId
    try:
        f = get_file(base, tok, file_id)
    except Exception as e:
        print(f"[wfgen] get-file 실패: {str(e)[:200]}")
        return
    revn, vern, page_id = file_revn_vern_page(f)
    if not page_id:
        print("[wfgen] pageId 취득 실패 — get-file data 구조 확인 필요. 중단.")
        return
    print(f"[wfgen] revn={revn} vern={vern} pageId={page_id}")

    # 3) change-ops 조립 — 시나리오 순서·phase 행·구현상태 테두리·설명 패널(assemble)
    all_ops, screens_objs, plan, stats = assemble(page_id, screens_data, project)
    comp_ops = []   # add-component — 모든 add-obj 뒤에 append(레지스트리 등록 · 참조패턴 순서)
    for s in screens_objs:
        comp_ops.extend(s.component_changes(file_id))  # add-component(승격 그룹만)
    all_ops.extend(comp_ops)  # 메인 인스턴스 add-obj 모두 emit 후 컴포넌트 등록(Assets)
    print(f"[wfgen] change-ops 조립: {len(all_ops)}개 "
          f"(board {len(plan)} · 화면 {len(screens_data)} · 컴포넌트 {len(comp_ops)})")

    # 4) update-file
    session_id = _uid()
    try:
        res = penpot_rpc(base, tok, "update-file", {
            "id": file_id, "revn": revn, "vern": vern,
            "sessionId": session_id, "changes": all_ops})
    except Exception as e:
        print(f"[wfgen] update-file 실패: {str(e)[:400]}")
        print(f"        (file_id={file_id} — penpot 대시보드에서 확인/삭제 가능)")
        return
    print(f"[wfgen] update-file OK — revn {revn} → {_pget(res, 'revn', default='?')}")

    # 5) 검증
    try:
        f2 = get_file(base, tok, file_id)
    except Exception as e:
        print(f"[wfgen] 검증 get-file 실패(생성은 완료): {str(e)[:120]}")
        return
    got = board_child_counts(f2)
    print(f"\n[wfgen] 검증 — 파일 {file_id}")
    print(f"  {'board':<8} {'archetype':<10} {'예상자식':>8} {'실제자식':>8}")
    ok_all = True
    for sc, bid, nel, nch, arch in plan:
        gname, gcnt = got.get(bid, ("(없음)", -1))
        mark = "OK" if gcnt == nch else "MISMATCH"
        if gcnt != nch:
            ok_all = False
        print(f"  {sc:<8} {arch:<10} {nch:>8} {gcnt:>8}  {mark}")
    print(f"  총 board {len(got)}개 / 요청 {len(plan)}개 · {'전부 일치' if ok_all else '불일치 있음'}")
    print(f"\n[wfgen] penpot 파일 열기: {base}/#/workspace?file-id={file_id}")
    print(f"FILE_ID={file_id}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"[wfgen] 예외(비차단): {str(e)[:200]}")
