#!/usr/bin/env python3
"""목업 **제자리 교체**(사본 페이지 in-place remock) 레시피 회귀 — 라이브 penpot 무접촉.

왜 있나(2026-07-31 실사용 지적): 댓글 피드백 반영 지시문은 **SAE 명세와 주석 패널만** 고치게 했다.
사람이 "카드가 너무 크다 / 툴바를 위로 올려라"라고 적으면 설명만 최신이 되고 **그림은 그대로**다.
사본 페이지가 생긴 뒤로는 정본을 건드리지 않고 **그 자리에서** 목업을 바꿀 수 있으므로 지시문에
`③-c 목업 제자리 수정` 단계를 넣었다(plm-channel `relay/wf-feedback.mjs`).

이 파일은 **그 지시문이 시키는 절차가 실재하는 코드 경로인지** 고정한다:
  ① `wfgen`에는 제자리 갱신 CLI가 없다 — `main()`은 언제나 `create-file`(새 파일). 지시문이 그 제약을
     그대로 적고 있는지까지 검사한다(도구가 생기면 이 테스트가 먼저 깨져 지시문을 고치게 된다).
  ② 대신 **모듈 재사용 + penpot change-ops 직접 조립**으로 제자리 교체가 된다:
     `wfanno._load_pages`/`_frames`/`screen_boards` + `wfgen.load_screen`/`pick_archetype`/`build_screens`
     → del-obj(옛 board 서브트리) + add-obj(새 board) 를 **한 update-file**로.
  ③ board id 를 **재사용**해야 한다 — 댓글 스레드의 `frame-id`, PLM `wireframe_frames.frame_id`,
     Wireframe 아티팩트의 `loc: penpot:<file>:<frame>`이 전부 그 id를 가리킨다. 새 id로 갈아치우면
     댓글이 미매핑으로 떨어지고 추적성이 끊긴다.
  ④ 빌더는 항상 y=0 에 그린다(모든 아키타입 `Screen(..., ox, 0, …)`) → 프레임이 y≠0이면 **y 오프셋**
     보정이 필요하다.
  ⑤ **겹침 사전 검사**: 새 board + (재렌더될) 주석 패널이 이웃 화면/패널을 침범하는지 쓰기 전에 계산.
  ⑥ 삭제 범위가 **자기 화면 board 서브트리로 한정**된다 — 이웃 board·자기 주석 패널·남의 패널 무피해
     (주석 패널은 root 소속이라 board 삭제에 딸려가지 않는다 = ④ 단계 재렌더가 여전히 담당).

전부 픽스처/스텁이다 — penpot RPC 는 `get_file` 스텁 1개뿐이고 `update-file`은 한 번도 호출하지 않는다.
"""
import importlib.util
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

_s = importlib.util.spec_from_file_location("wa_inplace", SCRIPTS / "wfanno.py")
wa = importlib.util.module_from_spec(_s)
_s.loader.exec_module(wa)
wfgen = wa.wfgen

ROOT = wa.ROOT_UUID
PID = "page-copy-1"
FID = "file-1"
OLD_LIST = "board-list-old"
OLD_FORM = "board-form-old"

P = F = 0


def check(cond, msg):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print(f"  FAIL: {msg}")


# ---------------------------------------------------------------- 픽스처
def frame(fid, name, x, y, w, h, shapes):
    return {"id": fid, "name": name, "type": "frame", "parentId": ROOT, "frameId": ROOT,
            "x": x, "y": y, "width": w, "height": h, "shapes": list(shapes),
            "selrect": {"x": x, "y": y, "width": w, "height": h,
                        "x1": x, "y1": y, "x2": x + w, "y2": y + h}}


def leaf(oid, name, parent, x, y, w=40, h=20, typ="rect"):
    return {"id": oid, "name": name, "type": typ, "parentId": parent, "frameId": parent,
            "x": x, "y": y, "width": w, "height": h, "shapes": []}


def anno_group(gid, code, x, y, kids):
    g = {"id": gid, "name": f"anno:{code}", "type": "group", "parentId": ROOT, "frameId": ROOT,
         "x": x, "y": y, "width": wa.PANEL_W, "height": 300, "shapes": [k["id"] for k in kids]}
    return [g] + kids


def build_page(form_x):
    """LIST(제자리 교체 대상) + FORM(이웃) 두 화면. FORM 의 x 로 겹침 시나리오를 만든다."""
    objs = {}

    def put(o):
        objs[o["id"]] = o

    lk = [leaf("l1", "네비바", OLD_LIST, 0, 1200), leaf("l2", "카드", OLD_LIST, 20, 1260)]
    put(frame(OLD_LIST, "LIST 목록", 0, 1200, 1180, 800, [k["id"] for k in lk]))
    for k in lk:
        put(k)
    for o in anno_group("anno-list", "LIST", 1180 + wa.GAP, 1200,
                        [leaf("a1", "anno-title", "anno-list", 1226, 1216, 294, 20, "text")]):
        put(o)

    fk = [leaf("f1", "필드", OLD_FORM, form_x + 10, 1210)]
    put(frame(OLD_FORM, "FORM 입력", form_x, 1200, 760, 600, [k["id"] for k in fk]))
    for k in fk:
        put(k)
    for o in anno_group("anno-form", "FORM", form_x + 760 + wa.GAP, 1200,
                        [leaf("a2", "anno-title", "anno-form", form_x + 806, 1216, 294, 20, "text")]):
        put(o)
    return objs


def stub_get_file(objs):
    """penpot get-file 응답 모양(그대로 `wfanno._load_pages` 가 읽는 형태)."""
    return {"revn": 7, "vern": 3, "id": FID,
            "data": {"pages": [PID], "pagesIndex": {PID: {"id": PID, "name": "목록 (작업본)",
                                                          "objects": objs}}}}


SAE = {
    "title": "LIST 목록", "id": "WF-LIST", "type": "Wireframe", "screen_code": "LIST", "route": "/",
    "note": "카드 그리드로 목록을 보여준다.",
    "doc": {"type": "doc", "content": [
        {"type": "heading", "attrs": {"level": 2},
         "content": [{"type": "text", "text": "목록 · LIST · /"}]},
        {"type": "heading", "attrs": {"level": 3},
         "content": [{"type": "text", "text": "SAE — 요소별 상태·액션·이펙트"}]},
        {"type": "bullet_list", "content": [
            {"type": "list_item", "content": [{"type": "paragraph", "content": [
                {"type": "text", "text": f"LIST.0{i} {lab} · 유형: {typ} · 상태: 기본 · "
                                         f"액션: 클릭 · 이펙트: {lab} 동작"}]}]}
            for i, (lab, typ) in enumerate(
                [("검색바", "input"), ("정렬 툴바", "nav"), ("모임 카드", "list"),
                 ("새 모임 버튼", "button")], start=1)
        ]},
    ]},
}


def write_sae(tmp):
    os.makedirs(tmp, exist_ok=True)
    with open(os.path.join(tmp, "WF-LIST.json"), "w", encoding="utf-8") as fh:
        json.dump(SAE, fh, ensure_ascii=False)
    return tmp


# ---------------------------------------------------------------- 레시피(지시문 ③-c 와 같은 순서)
def subtree(objs, root_id):
    """board + 자손 전량(shapes 트리) — del-obj 대상. penpot 은 자식을 자동 삭제하지 않는다."""
    out, stack = [], [root_id]
    while stack:
        cur = stack.pop()
        if cur in out:
            continue
        out.append(cur)
        stack.extend(wfgen._pget(objs.get(cur) or {}, "shapes", default=[]) or [])
    return out


def shift_y(ops, dy):
    """빌더는 언제나 y=0 에 그린다 → 옛 프레임의 y 로 통째로 내린다(절대좌표 3곳 전부)."""
    if not dy:
        return ops
    for op in ops:
        o = op.get("obj") or {}
        if "y" in o:
            o["y"] += dy
        sr = o.get("selrect") or {}
        for k in ("y", "y1", "y2"):
            if k in sr:
                sr[k] += dy
        for p in (o.get("points") or []):
            p["y"] += dy
    return ops


def remock(objs, page_id, fr, frames, sae_dir):
    """옛 board 서브트리 del + 새 board add(같은 id·같은 자리). 반환 (dels, adds, screens)."""
    olds = wa.screen_boards(fr, frames)
    dels = [{"type": "del-obj", "id": oid, "pageId": page_id}
            for b in olds for oid in subtree(objs, b["id"])]
    name, route, covers, els, arch, note = wfgen.load_screen(sae_dir, fr["code"])
    arch = wfgen.pick_archetype(fr["code"], els, None, arch)
    screens, _miss = wfgen.build_screens(page_id, fr["code"], name, route, covers, els,
                                         fr["x"], arch, warn=False)
    adds = []
    for s in screens:
        adds.extend(s.finalize())
    # id 재사용 — 이름 head(`LIST`·`LIST-A`·`LIST-Z`)가 같은 옛 board 의 id 를 그대로 쓴다.
    old_by_head = {}
    for b in olds:
        parts = (b.get("name") or "").split()
        if parts:
            old_by_head[parts[0]] = b["id"]
    blob = json.dumps(adds)
    for s in screens:
        if s.code in old_by_head:
            blob = blob.replace(s.bid, old_by_head[s.code])
    adds = json.loads(blob)
    shift_y(adds, fr["y"])
    return dels, adds, screens


def apply_ops(objs, dels, adds):
    """penpot 서버 대신 로컬에서 change-ops 를 적용(검증용 · 순서 = del 먼저)."""
    out = dict(objs)
    for d in dels:
        out.pop(d["id"], None)
    for a in adds:
        out[a["id"]] = a["obj"]
    return out


def new_rects(adds, sae_dir, code, note, els):
    """새 board 사각형 + **재렌더될 주석 패널** 사각형 — 겹침 검사의 좌변."""
    boards = [op["obj"] for op in adds if op["obj"].get("type") == "frame"]
    rects = [(o["name"], o["x"], o["y"], o["width"], o["height"]) for o in boards]
    frs = [{"id": o["id"], "name": o["name"], "code": (code if o["name"].split()[0] == code else None),
            "x": o["x"], "y": o["y"], "w": o["width"], "h": o["height"]} for o in boards]
    main = next(f for f in frs if f["code"])
    afx, afy, afw, afh = wa.panel_anchor(main, frs)
    _ops, px, pw, ph = wa.build_anno_panel(PID, code, "목록", note, els, afx, afy, afw, afh)
    rects.append((f"anno:{code}", px, afy, pw, ph))
    return rects


def overlaps(objs_after, mine_ids, rects, code):
    """쓰기 전 겹침 검사 — 새 도형/패널이 **남의 것** 위로 올라가는지. 반환 [(내이름, 남의이름)].

    내 화면의 옛 주석 패널(`anno:<CODE>`)은 ④ 재렌더가 통째로 교체하므로 제외한다(자기 자신과의 겹침).
    """
    hits = []
    for oid, o in objs_after.items():
        if oid in mine_ids:
            continue
        if str(wfgen._pget(o, "name") or "") == f"anno:{code}":
            continue
        if wfgen._pget(o, "parentId", "parent-id") != ROOT:
            continue    # 루트 소속(board·패널 그룹)만 본다 — 자식은 부모가 대표한다
        ox, oy = o.get("x", 0), o.get("y", 0)
        ow, oh = o.get("width", 0), o.get("height", 0)
        for nm, x, y, w, h in rects:
            if x < ox + ow and ox < x + w and y < oy + oh and oy < y + h:
                hits.append((nm, o.get("name")))
    return hits


# ================================================================== ① wfgen 에는 제자리 CLI 가 없다
src = (SCRIPTS / "wfgen.py").read_text(encoding="utf-8")
main_src = src[src.index("def main():"):]
check("create-file" in main_src, "wfgen.main 에 create-file 이 없다(전제 붕괴 — 레시피 재검토)")
check(not re.search(r'add_argument\("--page"', main_src),
      "wfgen 에 --page 가 생겼다 — 제자리 경로가 생겼으니 지시문을 그 명령으로 바꿔라")
check(not re.search(r'add_argument\("--file"[,)]', main_src),
      "wfgen 에 --file 이 생겼다 — 기존 파일 갱신 경로 확인 후 지시문 갱신")
check(len(re.findall(r'penpot_rpc\([^)]*"create-file"', main_src)) == 1
      and "if " not in main_src[main_src.index("create-file") - 120:main_src.index("create-file")],
      "create-file 이 조건부가 됐다 — 새 파일 강제 전제 재확인")

# 지시문이 그 사실과 대안을 실제로 적고 있는가(문서-코드 결속)
INSTR = (HERE.parent.parent / "plm-channel" / "relay" / "wf-feedback.mjs").read_text(encoding="utf-8")
for api in ["_load_pages", "screen_boards", "build_screens", "load_screen", "pick_archetype",
            "update-file", "del-obj", "add-obj"]:
    check(api in INSTR, f"지시문에 '{api}' 가 없다 — 레시피와 지시문이 갈라졌다")
check("wfgen.py" in INSTR and "새 파일" in INSTR, "지시문이 wfgen 의 '새 파일' 제약을 적지 않았다")

# ================================================================== ② 제자리 교체 조립
tmp = write_sae("/tmp/wf_inplace_sae")
objs = build_page(form_x=3000)                       # 이웃이 멀다 = 겹침 없음
wfgen.get_file = lambda base, tok, fid: stub_get_file(objs)   # penpot 스텁(네트워크 0)
revn, vern, pages = wa._load_pages("http://stub", "tok", FID)
check((revn, vern) == (7, 3), "_load_pages 가 revn/vern 을 못 읽었다")
pid, pname, pobjs = pages[0]
check(pid == PID, "_load_pages 페이지 id 불일치")
frames = wa._frames(pobjs)
fr = next(f for f in frames if f["code"] == "LIST")
check(fr["id"] == OLD_LIST and fr["y"] == 1200, "_frames 가 대상 프레임을 못 잡았다")

dels, adds, screens = remock(pobjs, PID, fr, frames, tmp)

# 삭제 범위 = 내 board 서브트리뿐
check(sorted(d["id"] for d in dels) == sorted([OLD_LIST, "l1", "l2"]),
      f"삭제 범위가 board 서브트리를 벗어났다: {[d['id'] for d in dels]}")
check(all(d["pageId"] == PID for d in dels), "del-obj 에 pageId(사본 페이지)가 안 붙었다")
check(all(op.get("pageId") == PID for op in adds), "add-obj 에 pageId(사본 페이지)가 안 붙었다")

# board id 재사용 + 제자리(같은 x·y)
board_adds = [op for op in adds if op["obj"].get("type") == "frame"]
main_board = next(op for op in board_adds if op["obj"]["name"].split()[0] == "LIST")
check(main_board["id"] == OLD_LIST, "board id 를 재사용하지 않았다 — 댓글 frame-id·loc 이 끊긴다")
check(main_board["obj"]["x"] == fr["x"] and main_board["obj"]["y"] == fr["y"],
      f"새 board 가 제자리에 없다: ({main_board['obj']['x']},{main_board['obj']['y']})")
check(main_board["obj"]["selrect"]["y1"] == fr["y"]
      and main_board["obj"]["points"][0]["y"] == fr["y"], "y 오프셋 보정이 selrect/points 에 안 실렸다")
kid = next(op for op in adds if op["obj"].get("parentId") == OLD_LIST)
check(kid["obj"]["y"] >= fr["y"], "자식 도형이 옛 프레임 y 아래로 안 내려왔다")
check(all(op["obj"].get("frameId") != main_board["obj"]["id"] or op["obj"]["y"] >= fr["y"]
          for op in adds), "일부 자식이 y 보정에서 빠졌다")

# 명세 요소가 실제로 그림에 들어간다(설명만 최신 = 이번 결함의 본질)
blob = json.dumps(adds, ensure_ascii=False)
for code in ("LIST.01", "LIST.02", "LIST.03", "LIST.04"):
    check(code in blob, f"{code} 가 새 목업에 없다 — 명세는 고쳤는데 그림이 안 바뀐 상태")
check("정렬 툴바" in blob, "명세 라벨이 목업 텍스트로 안 들어갔다")

# 적용 결과 — 이웃·주석 패널 무피해, LIST board 는 정확히 1개
after = apply_ops(pobjs, dels, adds)
check(OLD_FORM in after and "f1" in after, "이웃 화면이 지워졌다")
check("anno-list" in after and "anno-form" in after,
      "주석 패널이 board 삭제에 딸려갔다 — 패널은 root 소속이어야 한다(④ 재렌더가 담당)")
roots = [o for o in after.values()
         if o.get("type") == "frame" and wfgen._pget(o, "parentId", "parent-id") == ROOT]
check(sum(1 for o in roots if (o.get("name") or "").split()[0] == "LIST") == 1,
      "LIST board 가 1개가 아니다(중복 목업)")

# ================================================================== ③ 겹침 사전 검사
name, route, covers, els, arch, note = wfgen.load_screen(tmp, "LIST")
rects = new_rects(adds, tmp, "LIST", note, els)
mine = set(d["id"] for d in dels) | set(op["id"] for op in adds)
check(overlaps(after, mine, rects, "LIST") == [],
      f"겹침이 없어야 하는데 잡혔다: {overlaps(after, mine, rects, 'LIST')}")

objs2 = build_page(form_x=1400)                      # 이웃이 새 board(폭 1180) 바로 옆
wfgen.get_file = lambda base, tok, fid: stub_get_file(objs2)
_r, _v, pages2 = wa._load_pages("http://stub", "tok", FID)
pobjs2 = pages2[0][2]
frames2 = wa._frames(pobjs2)
fr2 = next(f for f in frames2 if f["code"] == "LIST")
dels2, adds2, _s2 = remock(pobjs2, PID, fr2, frames2, tmp)
after2 = apply_ops(pobjs2, dels2, adds2)
rects2 = new_rects(adds2, tmp, "LIST", note, els)
mine2 = set(d["id"] for d in dels2) | set(op["id"] for op in adds2)
hits = overlaps(after2, mine2, rects2, "LIST")
check(hits != [], "이웃을 침범하는데 겹침 검사가 통과했다(쓰기 전에 못 막는다)")
check(any("FORM" in str(h[1]) for h in hits), f"겹침 상대가 이웃 화면이 아니다: {hits}")

print(f"[test_wf_inplace] {P} pass, {F} fail")
sys.exit(1 if F else 0)
