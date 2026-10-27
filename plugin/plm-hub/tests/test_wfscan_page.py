#!/usr/bin/env python3
"""wfscan.py 페이지 스코핑 회귀 테스트 (감사 G4 — 사본 프레임까지 WF 아티팩트로 발급하던 결함).

재현 조건: 와이어프레임 파일에 **작업용 사본 페이지**(`POST /wireframe/working-copy`)가 있다.
과거 `file_frames` 가 `pagesIndex` 전 페이지를 하나로 병합해, 사본 페이지의 프레임이
  ① 아직 아티팩트가 없으면 그대로 발급되고,
  ② 이미 있으면 "얇은 본문 + 리치 SAE 스펙" 조건에서 `plm_put_doc` 으로 **loc 째 덮어써** 승격 없이
     `WF-<CODE>` 가 사본을 가리켰다(추적 역전).

검증:
  ① 단일 페이지 파일 → 기존 동작 그대로(그 페이지의 프레임을 정본 loc 으로 발급).
  ② 사본 페이지가 있는 파일 → **사본 프레임 미발급**(정본 loc 만 · 코드충돌도 안 난다).
  ③ 역할 대장 조회 실패 + 다중 페이지 → **실행 거부**(import/put_doc 0회). 단일 페이지면 종전대로.
  ④ `--page` 지정 → 그 페이지만 스캔.
  ⑤ 마감된(closed) 보관본 — 대장에서 사라진 `보관 · …` 페이지도 이름 규약으로 제외.
네트워크 없음 — penpot RPC·PLM HTTP 는 전부 스텁. 라이브 penpot/PLM 은 건드리지 않는다.
"""
import copy
import importlib.util
import io
import contextlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "scripts")
_spec = importlib.util.spec_from_file_location("ws", os.path.join(SCRIPTS, "wfscan.py"))
ws = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ws)

ROOT = ws.ROOT_UUID
FILE = "FILE-1"
CANON, COPY, ARCH = "page-canon-01", "page-copy-02", "page-arch-03"

P = F = 0


def check(cond, msg):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print(f"  FAIL: {msg}")


# ---------------------------------------------------------------- 픽스처
def frame_objs(prefix):
    """루트 프레임 2개(`LIST 목록`·`DETAIL 상세`) + 프레임 자식 1개(발급 대상 아님).
    사본 페이지는 **새 shape id**를 받는다(0083) → prefix 로 구분한다."""
    return {
        f"{prefix}-F1": {"id": f"{prefix}-F1", "name": "LIST 목록", "type": "frame",
                         "parentId": ROOT, "x": 0, "y": 0, "width": 390, "height": 800},
        f"{prefix}-F2": {"id": f"{prefix}-F2", "name": "DETAIL 상세", "type": "frame",
                         "parentId": ROOT, "x": 450, "y": 0, "width": 390, "height": 800},
        f"{prefix}-C1": {"id": f"{prefix}-C1", "name": "NESTED 중첩", "type": "frame",
                         "parentId": f"{prefix}-F1", "x": 10, "y": 10, "width": 100, "height": 100},
    }


PAGE_NAMES = {CANON: "목록", COPY: "목록 (작업본 · 07-31)", ARCH: "보관 · 목록 (07-30)"}


def fake_file(page_ids):
    """get-file 응답 — 페이지마다 같은 SCREEN_CODE 프레임이 **다른 id**로 들어있다."""
    return {"revn": 7, "vern": 3,
            "data": {"pages": list(page_ids),
                     "pagesIndex": {pid: {"id": pid, "name": PAGE_NAMES[pid],
                                          "objects": copy.deepcopy(frame_objs(pid))}
                                    for pid in page_ids}}}


SPEC = {"name": "목록", "route": "/list", "note": "화면 설명", "covers": [],
        "elements": [{"code": "E1", "label": "목록 카드", "type": "list",
                      "state": "로딩", "action": "탭", "effect": "상세로 이동"}]}


def roles(rows):
    """`GET /wireframe/working-copy` 응답 형태(items[] · RoleView flatten)."""
    return {"items": rows}


def role_row(page_id, role, **kw):
    r = {"penpot_file_id": FILE, "page_id": page_id, "role": role,
         "src_page_id": None, "promoted_at": None, "closed_at": None}
    r.update(kw)
    return r


def run(argv, page_ids, role_resp="auto", exists=(), thin=True, spec=SPEC):
    """wfscan CLI 를 in-process 실행 → (stdout, imports, put_docs).

    role_resp: dict(=/wireframe/working-copy 응답) · Exception(=조회 실패) · "auto"(사본/보관본 자동 구성).
    exists   : 이미 존재하는 아티팩트 코드 집합(존재하면 본문 보강 경로를 탄다).
    thin     : 기존 본문이 얇은가(True 면 보강 = loc 덮어쓰기 경로).
    """
    if role_resp == "auto":
        rows = []
        if COPY in page_ids:
            rows.append(role_row(COPY, "working", src_page_id=CANON))
        if ARCH in page_ids:
            rows.append(role_row(ARCH, "archived", src_page_id=CANON, promoted_at="2026-07-30T00:00:00Z"))
        role_resp = roles(rows)

    imports, put_docs = [], []

    def fake_rpc(base, token, cmd, body=None):
        if cmd == "get-teams":
            return [{"id": "T1", "name": f"PLM · {'T'}"}]
        if cmd == "get-projects":
            return [{"id": "PP1", "name": "Wireframes"}]
        if cmd == "get-project-files":
            return [{"id": FILE, "name": "와이어프레임"}]
        if cmd == "get-file":
            return fake_file(page_ids)
        return {}

    def fake_plm_get(api, token, path):
        if path.startswith("/wireframe/working-copy"):
            if isinstance(role_resp, Exception):
                raise role_resp
            return role_resp
        raise AssertionError(f"예상 못한 plm_get: {path}")

    def fake_exists(api, token, project, code):
        return code in exists

    def fake_get_doc(api, token, project, code):
        return {"type": "doc", "content": [{"type": "paragraph"}]} if thin else \
               {"type": "doc", "content": [{"type": "table", "content": []}]}

    old = (ws.penpot_rpc, ws.plm_get, ws.plm_import, ws.plm_put_doc, ws.artifact_exists,
           ws.plm_get_doc, ws.load_sae_spec, ws.resolve, ws._count_sae_specs, sys.argv)
    ws.penpot_rpc = fake_rpc
    ws.plm_get = fake_plm_get
    ws.plm_import = lambda api, tok, proj, arts, rels: imports.append((arts, rels)) or {}
    ws.plm_put_doc = lambda api, tok, proj, code, doc: put_docs.append((code, doc)) or {}
    ws.artifact_exists = fake_exists
    ws.plm_get_doc = fake_get_doc
    ws.load_sae_spec = lambda d, code: (copy.deepcopy(spec) if spec else None)
    ws.resolve = lambda: {"plm_api": "https://p", "plm_token": "ptok", "project": "T",
                          "penpot_api": "https://x", "penpot_token": "tok",
                          "ouro": None, "sae_dir": "/tmp/sae"}
    ws._count_sae_specs = lambda d: 1
    buf = io.StringIO()
    try:
        sys.argv = argv
        with contextlib.redirect_stdout(buf):
            ws.main()
    finally:
        (ws.penpot_rpc, ws.plm_get, ws.plm_import, ws.plm_put_doc, ws.artifact_exists,
         ws.plm_get_doc, ws.load_sae_spec, ws.resolve, ws._count_sae_specs, sys.argv) = old
    return buf.getvalue(), imports, put_docs


def locs_of(doc):
    """본문 doc 에서 loc 코드마크 텍스트 추출."""
    out = []
    for node in doc.get("content", []):
        for ch in node.get("content", []) or []:
            t = ch.get("text") or ""
            if t.startswith("penpot:"):
                out.append(t)
    return out


# ================================================================ 0. file_pages — 페이지 병합 금지
ws_rpc = ws.penpot_rpc
ws.penpot_rpc = lambda b, t, cmd, body=None: fake_file([CANON, COPY])
pages, ok = ws.file_pages("b", "t", FILE)
ws.penpot_rpc = ws_rpc

check(ok and len(pages) == 2, f"file_pages: 페이지 2개 유지(병합 금지) — 실제 {len(pages)}")
check([p[0] for p in pages] == [CANON, COPY], "file_pages: data.pages 순서 보존")
check([p[1] for p in pages] == [PAGE_NAMES[CANON], PAGE_NAMES[COPY]], "file_pages: 페이지 이름 전달")
check(all(len(p[2]) == 2 for p in pages), "file_pages: 루트 프레임만 수집(프레임 자식 제외)")
check({f[0] for f in pages[0][2]} == {f"{CANON}-F1", f"{CANON}-F2"}, "file_pages: 페이지별 프레임 id 분리")

ws.penpot_rpc = lambda b, t, cmd, body=None: {"revn": 1, "data": {}}
_p, _ok = ws.file_pages("b", "t", FILE)
ws.penpot_rpc = ws_rpc
check(_ok is False and _p == [], "file_pages: pagesIndex 없으면 ok=False(파싱 실패 신호)")

# ================================================================ 1. role_page_ids — 대장 해석
items = [role_row(COPY, "working"), role_row(ARCH, "archived"),
         role_row("page-other", "working", penpot_file_id="OTHER-FILE"),
         role_row("page-closed", "archived", closed_at="2026-07-31T00:00:00Z"),
         "쓰레기행"]
w, a = ws.role_page_ids(items, FILE)
check(w == {COPY}, f"role_page_ids: working 수집(다른 파일 제외) — 실제 {w}")
check(a == {ARCH}, f"role_page_ids: archived 수집(마감 행 제외) — 실제 {a}")
check(ws.role_page_ids(None, FILE) == (set(), set()), "role_page_ids: items None → 빈 집합")

# ================================================================ 2. classify_page — 대장 + 이름 보완
rs = ({COPY}, {ARCH})
check(ws.classify_page(CANON, PAGE_NAMES[CANON], rs)[0] == "canonical", "classify: 정본")
check(ws.classify_page(COPY, "이름무관", rs)[0] == "working", "classify: 대장의 working")
check(ws.classify_page(ARCH, "이름무관", rs)[0] == "archived", "classify: 대장의 archived")
# 마감된 보관본은 대장에 없다(list_roles 가 closed_at IS NULL 로 거른다) → 이름 규약이 막는다.
check(ws.classify_page("page-x", "보관 · 목록 (07-30)", rs)[0] == "archived",
      "classify: 마감된 보관본도 이름(보관 · )으로 제외")
check(ws.classify_page("page-y", "목록 (작업본 · 07-31)", rs)[0] == "working",
      "classify: 사본 이름 규약으로 제외")
check(ws.classify_page("page-z", "설계 메모", None)[0] == "canonical", "classify: 대장 없어도 이름 판정은 동작")

# ================================================================ 3. select_scan_pages — 선택 규칙
pg = [(CANON, PAGE_NAMES[CANON], []), (COPY, PAGE_NAMES[COPY], []), (ARCH, PAGE_NAMES[ARCH], [])]
sel, skp, err = ws.select_scan_pages(pg, None, ({COPY}, {ARCH}))
check(err is None and [s[0] for s in sel] == [CANON], f"select: 대장 있음 → 정본만 — 실제 {[s[0] for s in sel]}")
check({s[0] for s in skp} == {COPY, ARCH}, "select: 사본·보관본은 skipped 로 보고")

sel, skp, err = ws.select_scan_pages(pg[:1], None, None)
check(err is None and sel[0][0] == CANON, "select: 대장 없음 + 페이지 1개 → 종전대로")

sel, skp, err = ws.select_scan_pages(pg, None, None)
check(sel == [] and err and "--page" in err, "select: 대장 없음 + 페이지 2개↑ → 실행 거부")

sel, skp, err = ws.select_scan_pages(pg, COPY, None)
check(err is None and sel[0][0] == COPY, "select: --page 지정은 대장 없이도 그 페이지")
check({s[0] for s in skp} == {CANON, ARCH}, "select: --page 미선택 페이지는 skipped")
check(ws.select_scan_pages(pg, "목록", None)[0][0][0] == CANON, "select: --page 이름 일치")
check(ws.select_scan_pages(pg, "없는페이지", None)[2] is not None, "select: --page 미존재 → 오류")
dup = [(CANON, "같은이름", []), (COPY, "같은이름", [])]
check(ws.select_scan_pages(dup, "같은이름", None)[2] is not None, "select: 이름 중복 → id 요구 오류")
check(ws.select_scan_pages([], None, None)[2] is not None, "select: 페이지 0개 → 오류")
sel, skp, err = ws.select_scan_pages([(COPY, PAGE_NAMES[COPY], [])], None, ({COPY}, set()))
check(err is None and sel == [] and len(skp) == 1, "select: 전부 사본이면 선택 0(파일 스킵)")

# ================================================================ 4. ① 단일 페이지 = 기존 동작
out, imports, docs = run(["wfscan", "--project", "T"], [CANON])
check(len(imports) == 2 and len(docs) == 2, f"단일: WF-LIST·WF-DETAIL 발급 — import {len(imports)} doc {len(docs)}")
check({c for c, _d in docs} == {"WF-LIST", "WF-DETAIL"}, "단일: 두 프레임 모두 발급")
check(all(l.startswith(f"penpot:{FILE}:{CANON}-") for _c, d in docs for l in locs_of(d)),
      "단일: loc 이 정본 페이지 프레임")
check("코드충돌" not in out, "단일: 코드충돌 없음")

# ================================================================ 5. ② 사본 페이지 = 사본 미발급
out, imports, docs = run(["wfscan", "--project", "T"], [CANON, COPY])
issued_locs = [l for _c, d in docs for l in locs_of(d)]
check(len(docs) == 2, f"사본존재: 정본 프레임 2개만 발급 — 실제 {len(docs)}")
check(all(f"{COPY}-" not in l for l in issued_locs), f"사본존재: **사본 loc 미발급** — 실제 {issued_locs}")
check(all(f"{CANON}-" in l for l in issued_locs), "사본존재: 정본 loc 만 발급")
check("코드충돌" not in out, "사본존재: 사본이 코드충돌로 잡히지도 않는다(애초에 스캔 안 함)")
check("제외한 페이지" in out and PAGE_NAMES[COPY] in out, "사본존재: 제외 페이지를 보고에 표면화")

# 보관본(승격 후 옛 정본)도 같은 규칙
out, imports, docs = run(["wfscan", "--project", "T"], [CANON, COPY, ARCH])
issued_locs = [l for _c, d in docs for l in locs_of(d)]
check(len(docs) == 2 and all(f"{CANON}-" in l for l in issued_locs), "보관본존재: 정본만 발급")

# ★ 사본이 **먼저** 오는 순서 — 병합 스캔이 실제로 해를 끼치는 배치다.
#   `seen_codes` 는 먼저 만난 것이 이기므로(순회 순서 의존 · 감사 G4) 승격이 사본을 앞 index 로 옮기거나
#   pagesIndex 키 순서가 뒤집히면 **사본 loc 이 발급된다**. 아래 두 케이스가 그 회귀를 잡는 핵심 가드다.
out, imports, docs = run(["wfscan", "--project", "T"], [COPY, CANON])
issued_locs = [l for _c, d in docs for l in locs_of(d)]
check(len(docs) == 2, f"사본우선: 정본 프레임 2개만 발급 — 실제 {len(docs)}")
check(all(f"{COPY}-" not in l for l in issued_locs),
      f"사본우선: **사본 loc 미발급**(순서 뒤집혀도) — 실제 {issued_locs}")
check(all(f"{CANON}-" in l for l in issued_locs), "사본우선: 정본 loc 만 발급")

# 기존 아티팩트 본문 보강 경로(얇은 본문 + 리치 스펙)에서도 사본 loc 으로 덮어쓰지 않는다
out, imports, docs = run(["wfscan", "--project", "T"], [CANON, COPY],
                         exists={"WF-LIST", "WF-DETAIL"}, thin=True)
issued_locs = [l for _c, d in docs for l in locs_of(d)]
check(len(docs) == 2, f"보강경로: 기존 2건 보강 — 실제 {len(docs)}")
check(all(f"{COPY}-" not in l for l in issued_locs), "보강경로: **사본 loc 로 덮어쓰지 않는다**(G4 핵심)")

out, imports, docs = run(["wfscan", "--project", "T"], [COPY, CANON],
                         exists={"WF-LIST", "WF-DETAIL"}, thin=True)
issued_locs = [l for _c, d in docs for l in locs_of(d)]
check(all(f"{COPY}-" not in l for l in issued_locs),
      f"보강경로/사본우선: 얇은 본문을 **사본 loc 으로 갈아끼우지 않는다** — 실제 {issued_locs}")
check(all(f"{CANON}-" in l for l in issued_locs), "보강경로/사본우선: 정본 loc 유지")

# 이미 리치한 본문은 건드리지 않는다(기존 회귀 방지 계약 그대로)
out, imports, docs = run(["wfscan", "--project", "T"], [CANON],
                         exists={"WF-LIST", "WF-DETAIL"}, thin=False)
check(docs == [], "보강경로: 이미 리치한 본문은 무수정(회귀 방지 계약 유지)")

# ================================================================ 6. ③ 대장 조회 실패 = 안전 실패
out, imports, docs = run(["wfscan", "--project", "T"], [CANON, COPY], role_resp=RuntimeError("503"))
check(imports == [] and docs == [], "대장실패/다중: **발급 0 · 본문 0**(안전 실패)")
check("실행 거부" in out and "--page" in out, "대장실패/다중: 거부 사유 + --page 안내")
check(CANON in out and COPY in out, "대장실패/다중: 페이지 목록(id) 안내")

out, imports, docs = run(["wfscan", "--project", "T"], [CANON], role_resp=RuntimeError("503"))
check(len(docs) == 2, "대장실패/단일: 페이지가 1개면 종전대로 스캔")

out, imports, docs = run(["wfscan", "--project", "T"], [CANON, COPY], role_resp={"nope": 1})
check(imports == [] and docs == [], "대장 응답형식 이상/다중: 발급 0(안전 실패)")

out, imports, docs = run(["wfscan", "--project", "T", "--dry-run"], [CANON, COPY],
                         role_resp=RuntimeError("503"))
check(imports == [] and docs == [] and "실행 거부" in out, "대장실패/dry-run: 보고도 거부(잘못된 예정 목록 금지)")

# ================================================================ 7. ④ --page 지정 = 그 페이지만
out, imports, docs = run(["wfscan", "--project", "T", "--page", CANON], [CANON, COPY],
                         role_resp=RuntimeError("503"))
issued_locs = [l for _c, d in docs for l in locs_of(d)]
check(len(docs) == 2 and all(f"{CANON}-" in l for l in issued_locs),
      "--page 정본: 그 페이지만 스캔(대장 없이도)")

out, imports, docs = run(["wfscan", "--project", "T", "--page", PAGE_NAMES[COPY]], [CANON, COPY])
issued_locs = [l for _c, d in docs for l in locs_of(d)]
check(len(docs) == 2 and all(f"{COPY}-" in l for l in issued_locs), "--page 이름: 지정한 페이지만 스캔")
check("정본이 아니다" in out, "--page 로 사본을 지정하면 경고(지정대로 진행하되 침묵하지 않는다)")

out, imports, docs = run(["wfscan", "--project", "T", "--page", "없는페이지"], [CANON, COPY])
check(imports == [] and docs == [] and "실행 거부" in out, "--page 미존재: 발급 0 + 거부")

# ================================================================ 8. ⑤ 마감된 보관본(대장에 없음)
out, imports, docs = run(["wfscan", "--project", "T"], [CANON, ARCH], role_resp=roles([]))
issued_locs = [l for _c, d in docs for l in locs_of(d)]
check(len(docs) == 2 and all(f"{CANON}-" in l for l in issued_locs),
      f"마감 보관본: 대장에 없어도 이름으로 제외 — 실제 {issued_locs}")
check("마감된 승격일 수 있음" in out, "마감 보관본: 제외 사유를 이름 판정으로 표시")

# ================================================================ 9. --file 스코프
out, imports, docs = run(["wfscan", "--project", "T", "--file", FILE], [CANON])
check(len(docs) == 2, "--file 일치: 스캔 수행")
out, imports, docs = run(["wfscan", "--project", "T", "--file", "NOPE"], [CANON])
check(imports == [] and docs == [] and "해당하는 파일이" in out, "--file 불일치: 스캔 없음")

# ================================================================ 10. 감사 X3 — 대장 조회에 include_closed
#
# `[보관 완료]`(closed_at) 뒤에도 도구가 승격 사실을 읽어야 `stage-apply`가 산다(wfanno X3).
# 두 스크립트의 조회는 이 함수 하나가 SSOT이므로 여기서 계약을 고정한다.
_seen = []


def _spy_get(api, token, path):
    _seen.append(path)
    return {"items": []}


_old_get = ws.plm_get
ws.plm_get = _spy_get
try:
    items, err = ws.fetch_page_roles({"plm_api": "https://p", "plm_token": "t"}, "T")
finally:
    ws.plm_get = _old_get
check(items == [] and err is None, "X3/정상 응답은 그대로 통과")
check(_seen and "include_closed=1" in _seen[0], f"X3/조회에 include_closed=1이 붙는다 — 실제 {_seen}")
check(_seen and "project=T" in _seen[0], "X3/프로젝트 스코프는 그대로")

print(f"test_wfscan_page: {P} pass, {F} fail")
sys.exit(1 if F else 0)
