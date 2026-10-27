#!/usr/bin/env python3
"""변경 칩(`chg:<CODE>`) 회귀 — **바뀐 프레임을 눈으로 알아보게** 한다. 라이브 penpot 무접촉.

왜 있나(관리자 요구 2026-07-31): "변경한 프레임에 확인할 수 있도록 뭔가 표시를 해주면 좋겠다.
체크박스를 만들거나 별표시, 변경했다는 텍스트박스를 칩처럼 만들어 위에 붙여주거나."
댓글 반영이 끝나도 사본 페이지에는 **어느 프레임이 바뀌었는지**가 어디에도 없었다 — 주석 패널은
프레임마다 항상 있으니 "바뀐 것"의 신호가 못 되고, 목업은 바뀐 뒤 모습만 보여준다.

이 파일이 고정하는 것:
  ① 순수 함수 — 칩 문구 축약(길면 `외 N개`/`N개 요소`) · `--items` 파싱(번호만도 허용) · 배치 좌표
  ② 생성 — `chg:<CODE>` 그룹 1개 + `chg-bg`/`chg-text` 2자식, 프레임 **바로 위 우측 정렬**
  ③ 멱등 — 다시 실행해도 칩이 **정확히 1개**(옛 그룹만 지우고 다시 그린다 · 객체 수 불변)
  ④ 무피해 — 이웃 프레임·이웃 주석 패널·**자기 주석 패널**·자기 목업 도형 삭제 0, 프레임 이름 불변
  ⑤ 겹침 — 위가 막히면 프레임 **우측 상단 내부**로 폴백, 둘 다 막히면 **붙이지 않고 경고**
     (그때 옛 칩도 지우지 않는다 — 지우고 못 붙이면 표시가 통째로 사라진다)
  ⑥ 정리 — `mark --clear` 가 칩만 걷어낸다(`--code` 생략 시 그 페이지 전량)
  ⑦ 가드 — `--expect-page-role` 불일치면 update-file 을 **한 번도 호출하지 않고** exit 3
  ⑧ 문서·지시문 결속 — 릴레이 지시문과 커맨드 문서가 실제 명령을 적고 있는가

penpot RPC 는 전부 스텁이다(update-file 은 캡처만 하고 네트워크로 나가지 않는다).
"""
import contextlib
import copy
import importlib.util
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "scripts")
_s = importlib.util.spec_from_file_location("wa_mark", os.path.join(SCRIPTS, "wfanno.py"))
wa = importlib.util.module_from_spec(_s)
_s.loader.exec_module(wa)
wfgen = wa.wfgen

ROOT = wa.ROOT_UUID
PID = "page-mark-1"

P = F = 0


def check(cond, msg):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print(f"  FAIL: {msg}")


# ---------------------------------------------------------------- 픽스처
def frame(fid, code, name, x, y, w=390, h=800, shapes=()):
    return {"id": fid, "name": f"{code} {name}", "type": "frame", "parentId": ROOT, "frameId": ROOT,
            "x": x, "y": y, "width": w, "height": h, "shapes": list(shapes)}


def leaf(oid, name, parent, x, y, w=200, h=40, typ="rect"):
    return {"id": oid, "name": name, "type": typ, "parentId": parent, "frameId": parent,
            "x": x, "y": y, "width": w, "height": h, "shapes": []}


def spec_of(code, n=4):
    return [{"code": f"{code}.{i:02d}", "label": f"{code} 요소 {i}", "type": "list",
             "state": "기본", "action": "탭", "effect": f"{code} 상세로 이동"} for i in range(1, n + 1)]


def panel_objs(code, fr, n=4):
    """build_anno_panel 로 **실제와 동일한** 주석 패널 객체군(그룹 포함) → {oid: obj}."""
    ops, px, pw, ph = wa.build_anno_panel(PID, code, f"{code} 화면", f"{code} 설명", spec_of(code, n),
                                          fr["x"], fr["y"], fr["width"], fr["height"])
    return {c["obj"]["id"]: copy.deepcopy(c["obj"]) for c in ops}, (px, fr["y"], pw, ph)


def base_page(top_y=None, block_inside=False):
    """RDR(대상) + QA(이웃) 두 화면 · 각자 주석 패널.
       top_y      RDR 위에 이웃 프레임을 둔다(위쪽 막기 시나리오)
       block_inside  RDR 우측 상단 **내부**까지 덮는 남의 객체를 둔다(둘 다 막기)"""
    objs = {}
    kids = [leaf("r1", "네비바", "F-RDR", 0, 1000), leaf("r2", "카드", "F-RDR", 20, 1060)]
    rdr = frame("F-RDR", "RDR", "렌더", 0, 1000, shapes=[k["id"] for k in kids])
    objs[rdr["id"]] = rdr
    for k in kids:
        objs[k["id"]] = k
    pa, rect_rdr = panel_objs("RDR", rdr)
    objs.update(pa)

    qkids = [leaf("q1", "표", "F-QA", 920, 1020)]
    qa = frame("F-QA", "QA", "검수", 900, 1000, shapes=[k["id"] for k in qkids])
    objs[qa["id"]] = qa
    for k in qkids:
        objs[k["id"]] = k
    pb, _rect_qa = panel_objs("QA", qa)
    objs.update(pb)

    if top_y is not None:
        top = frame("F-TOP", "TOP", "상단", 0, top_y, 390, 60)
        objs[top["id"]] = top
    if block_inside:
        # 남의 패널이 RDR 우측 상단 **내부**까지 덮은 상태(손배치 파일에서 실제로 나온다)
        objs["X-BLOCK"] = {"id": "X-BLOCK", "name": "anno:XX", "type": "group",
                           "parentId": ROOT, "frameId": ROOT,
                           "x": 200, "y": 1000, "width": 300, "height": 200, "shapes": []}
    return objs, rect_rdr


def apply_changes(objs, changes):
    for c in changes:
        if c.get("type") == "del-obj":
            objs.pop(c["id"], None)
        elif c.get("type") == "add-obj":
            o = copy.deepcopy(c["obj"])
            objs[o["id"]] = o
    return objs


# ---------------------------------------------------------------- 실행 하네스
def run_mark(objs, argv, apply=True, role=None, get_file=None):
    """wfanno mark 를 in-process 실행 → (changes, stdout, exit_code, sent). 네트워크 0."""
    sent = []

    def fake_rpc(base, tok, cmd, body=None):
        sent.append((cmd, body or {}))
        return {"revn": 9}

    def fake_get_file(base, tok, fid):
        if get_file:
            return get_file(base, tok, fid)
        return {"revn": 8, "vern": 2,
                "data": {"pages": [PID],
                         "pagesIndex": {PID: {"id": PID, "name": "렌더 (작업본)",
                                              "objects": copy.deepcopy(objs)}}}}

    old = (wfgen.get_file, wfgen.penpot_rpc, wa._resolve_ctx, wa._find_files,
           wa.recheck_page_role, sys.argv)
    wfgen.get_file = fake_get_file
    wfgen.penpot_rpc = fake_rpc
    wa._resolve_ctx = lambda po, so: ({"penpot_api": "https://x", "penpot_token": "tok",
                                       "plm_api": "https://p", "plm_token": "ptok",
                                       "project": "T", "ouro": None}, "T", None)
    wa._find_files = lambda base, tok, project, fo: [("FILE-1", "와이어프레임")]
    if role is not None:
        wa.recheck_page_role = lambda cfg, project, page, expect: role
    buf = io.StringIO()
    code = 0
    try:
        sys.argv = ["wfanno", "mark", "T"] + list(argv)
        with contextlib.redirect_stdout(buf):
            try:
                wa.main()
            except SystemExit as e:
                code = int(e.code or 0)
    finally:
        (wfgen.get_file, wfgen.penpot_rpc, wa._resolve_ctx, wa._find_files,
         wa.recheck_page_role, sys.argv) = old
    changes = []
    for c, body in sent:
        if c == "update-file":
            changes.extend(body.get("changes") or [])
    if apply:
        apply_changes(objs, changes)
    return changes, buf.getvalue(), code, sent


def dels(changes):
    return {c["id"] for c in changes if c.get("type") == "del-obj"}


def adds(changes):
    return [c["obj"] for c in changes if c.get("type") == "add-obj"]


def chip_group(objs, code="RDR"):
    return [o for o in objs.values()
            if o.get("type") == "group" and o.get("name") == f"chg:{code}"]


def sig_names(objs):
    """프레임 이름 서명 — 칩 작업이 프레임 이름 규약(wfscan 이 읽는다)을 건드리지 않았는가."""
    return sorted((o["id"], o.get("name")) for o in objs.values() if o.get("type") == "frame")


def rects_overlap(a, b):
    return a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]


# ================================================================== ① 순수 함수
check(wa.mark_items("12,13", "RDR") == ["RDR.12", "RDR.13"], "번호만 준 --items 가 화면코드로 안 채워졌다")
check(wa.mark_items("RDR.12, wf-rdr.13 .14", "RDR") == ["RDR.12", "RDR.13", "RDR.14"],
      "혼합 표기(--items) 정규화 실패")
check(wa.mark_items("12, 12 ,RDR.12", "RDR") == ["RDR.12"], "--items 중복이 제거되지 않았다")
check(wa.mark_items("", "RDR") == [] and wa.mark_items(None, "RDR") == [], "빈 --items 처리 실패")

t_short = wa.chip_text("반영됨", "07-31", ["RDR.12", "RDR.13"], 400)
check(t_short == "✱ 반영됨 · 07-31 · RDR.12, RDR.13", f"칩 문구 기본형이 다르다: {t_short}")
check(wa.chip_text("반영됨", "", [], 400) == "✱ 반영됨", "날짜·요소 없는 칩 문구가 다르다")
t_many = wa.chip_text("반영됨", "07-31", [f"RDR.{i:02d}" for i in range(1, 12)], 300)
check("외" in t_many and "개" in t_many, f"긴 목록이 축약되지 않았다: {t_many}")
check(wfgen.text_px(t_many, wa.CHIP_FS) <= 300, f"축약했는데도 최대폭을 넘었다: {t_many}")
t_tiny = wa.chip_text("반영됨", "07-31", [f"RDR.{i:02d}" for i in range(1, 12)], 130)
check(t_tiny.endswith("11개 요소"), f"하나도 못 담을 때 개수 축약이 아니다: {t_tiny}")
check(t_tiny.startswith("✱ 반영됨 · 07-31"), "축약이 머리(별표·라벨·날짜)를 잘랐다 — 그게 신호다")

fr_demo = {"x": 100, "y": 1000, "w": 390, "h": 800, "code": "RDR", "id": "F", "name": "RDR 렌더"}
bx = wa.chip_box(fr_demo, 200, "above")
check(bx == (100 + 390 - 200, 1000 - wa.CHIP_H - wa.CHIP_GAP, 200, wa.CHIP_H),
      f"above 배치 좌표가 규약과 다르다: {bx}")
check(bx[1] + bx[3] <= fr_demo["y"], "above 칩이 프레임 안으로 내려왔다")
check(bx[0] + bx[2] <= fr_demo["x"] + fr_demo["w"] + wa.GAP,
      "above 칩이 주석 패널 열(프레임 우변 +28)을 침범한다")
bi = wa.chip_box(fr_demo, 200, "inside")
check(bi[0] >= fr_demo["x"] and bi[1] >= fr_demo["y"], f"inside 배치가 프레임 밖이다: {bi}")

# ================================================================== ② 생성
objs, panel_rect = base_page()
before_names = sig_names(objs)
before_n = len(objs)
changes, out, rc, _sent = run_mark(objs, ["--code", "WF-RDR", "--page", PID,
                                          "--items", "12,13", "--date", "07-31"])
new = adds(changes)
grp = [o for o in new if o["type"] == "group"]
check(len(grp) == 1 and grp[0]["name"] == "chg:RDR", f"칩 그룹이 1개가 아니다: {[o['name'] for o in grp]}")
check(sorted(o["name"] for o in new if o["type"] != "group") == ["chg-bg", "chg-text"],
      f"칩 자식 구성이 다르다: {[o['name'] for o in new]}")
txt = next(o for o in new if o["name"] == "chg-text")
check(wa._text_of(txt) == "✱ 반영됨 · 07-31 · RDR.12, RDR.13", f"칩 문구가 다르다: {wa._text_of(txt)}")
bgo = next(o for o in new if o["name"] == "chg-bg")
check(bgo["fills"][0]["fillColor"] == wa.CHG_COL["bg"], "칩 배경색이 규약과 다르다")
check(bgo["r1"] == wa.CHIP_R, "칩이 알약(pill) 라운드가 아니다")
check(bgo["y"] + bgo["height"] <= 1000, f"칩이 프레임 위가 아니다: y={bgo['y']}")
check(bgo["x"] + bgo["width"] <= 390, "칩이 프레임 우변을 넘었다(패널 열 침범 위험)")
check(all(o["frameId"] == ROOT for o in new), "칩 객체가 root 소속이 아니다(프레임에 딸려 삭제된다)")
check("above" in out, f"배치 모드가 출력에 안 찍혔다: {out}")
check(dels(changes) == set(), "첫 부착인데 삭제가 있다")

# 무피해 — 이웃/자기 주석 패널·목업 도형 그대로, 프레임 이름 불변
check(sig_names(objs) == before_names, "프레임 이름이 바뀌었다(wfscan 아티팩트 규약 파손)")
check("F-QA" in objs and "q1" in objs, "이웃 화면이 지워졌다")
check(any(o.get("name") == "anno:QA" for o in objs.values()), "이웃 주석 패널이 지워졌다")
check(any(o.get("name") == "anno:RDR" for o in objs.values()), "자기 주석 패널이 지워졌다")
check("r1" in objs and "r2" in objs, "자기 목업 도형이 지워졌다")
check(len(objs) == before_n + 3, f"객체 증가분이 칩 3개가 아니다: {len(objs) - before_n}")

# 주석 패널 사각형과 실제로 안 겹치는가(기하 검증)
chip_rect = (bgo["x"], bgo["y"], bgo["width"], bgo["height"])
check(not rects_overlap(chip_rect, panel_rect), f"칩이 주석 패널과 겹친다: {chip_rect} vs {panel_rect}")

# ================================================================== ③ 멱등(재실행)
old_ids = {o["id"] for o in new}
n_after_first = len(objs)
changes2, out2, _rc2, _s2 = run_mark(objs, ["--code", "WF-RDR", "--page", PID,
                                            "--items", "12,13", "--date", "07-31"])
check(dels(changes2) == old_ids, f"재실행이 옛 칩만 지우지 않았다: {dels(changes2) - old_ids}")
check(len(chip_group(objs)) == 1, f"칩 그룹이 중복됐다: {len(chip_group(objs))}")
check(len(objs) == n_after_first, f"재실행으로 객체 수가 늘었다: {len(objs)} vs {n_after_first}")
check(sum(1 for o in objs.values() if o.get("name") == "chg-bg") == 1, "chg-bg 가 중복 누적됐다")
check(sig_names(objs) == before_names, "재실행이 프레임 이름을 바꿨다")

# 자손 회수 — 그룹 shapes 목록이 낡아도(에디터 편집) 고아 도형을 남기지 않는다
stale_objs = copy.deepcopy(objs)
gid = chip_group(stale_objs)[0]["id"]
live_ids = {gid} | {o["id"] for o in stale_objs.values() if o.get("parentId") == gid}
stale_objs[gid]["shapes"] = []                     # 에디터가 손댄 그룹(자식 목록이 낡음)
got = wa.chg_stale_ids(stale_objs, "RDR")
check(got == live_ids, f"parentId 사슬 회수 실패(고아 도형이 남는다): {got} vs {live_ids}")
check(len(got) == 3, f"칩 객체가 그룹+2자식이 아니다: {len(got)}")
check(wa.chg_stale_ids(stale_objs, "QA") == set(), "남의 화면 칩을 자기 것으로 회수했다")

# ================================================================== ④ 겹침 — 위가 막히면 안쪽으로
objs2, _pr = base_page(top_y=950)          # 위 이웃이 950..1010 → above 밴드(964..990) 침범
changes3, out3, _rc3, _s3 = run_mark(objs2, ["--code", "WF-RDR", "--page", PID, "--items", "12"])
bg3 = next((o for o in adds(changes3) if o["name"] == "chg-bg"), None)
check(bg3 is not None, "위가 막혔다고 칩을 아예 안 붙였다(안쪽 폴백이 없다)")
check("inside" in out3, f"폴백 모드가 출력에 안 찍혔다: {out3}")
if bg3:
    check(bg3["y"] >= 1000, f"폴백인데 프레임 안이 아니다: y={bg3['y']}")
    check(not rects_overlap((bg3["x"], bg3["y"], bg3["width"], bg3["height"]),
                            (0, 950, 390, 60)), "폴백 칩이 위 이웃을 침범한다")
check("F-TOP" in objs2, "위 이웃 프레임이 지워졌다")

# 둘 다 막히면 — 붙이지 않고 경고 · **옛 칩도 지우지 않는다**
objs3, _pr3 = base_page(top_y=950, block_inside=True)
changes4, out4, _rc4, _s4 = run_mark(objs3, ["--code", "WF-RDR", "--page", PID, "--items", "12"])
check(adds(changes4) == [], f"침범하는데 칩을 붙였다: {[o['name'] for o in adds(changes4)]}")
check(dels(changes4) == set(), "붙이지도 못하면서 옛 칩을 지웠다(표시가 통째로 사라진다)")
check("붙이지 않음" in out4 and "침범" in out4, f"침범 경고가 없다: {out4}")
check("X-BLOCK" in objs3 and "F-TOP" in objs3, "침범 상대를 지우거나 밀어냈다")

# 이미 칩이 있는 화면이 막히면 그 칩은 **남는다**(경고만)
objs4, _pr4 = base_page()
run_mark(objs4, ["--code", "WF-RDR", "--page", PID, "--items", "12"])
kept = {o["id"] for o in chip_group(objs4)}
objs4["X-BLOCK"] = {"id": "X-BLOCK", "name": "anno:XX", "type": "group", "parentId": ROOT,
                    "frameId": ROOT, "x": 0, "y": 940, "width": 500, "height": 260, "shapes": []}
changes5, out5, _rc5, _s5 = run_mark(objs4, ["--code", "WF-RDR", "--page", PID, "--items", "12,13"])
check(adds(changes5) == [] and dels(changes5) == set(), "막힌 화면에서 칩을 갈아치웠다")
check({o["id"] for o in chip_group(objs4)} == kept, "막혔을 때 기존 칩이 사라졌다")

# ================================================================== ⑤ 정리(--clear)
objs5, _pr5 = base_page()
run_mark(objs5, ["--code", "WF-RDR", "--page", PID, "--items", "12"])
run_mark(objs5, ["--code", "WF-QA", "--page", PID, "--items", "9"])
check(len(chip_group(objs5, "RDR")) == 1 and len(chip_group(objs5, "QA")) == 1, "칩 2개 준비 실패")
n_before_clear = len(objs5)
names_before_clear = sig_names(objs5)
changes6, out6, _rc6, _s6 = run_mark(objs5, ["--code", "WF-RDR", "--page", PID, "--clear"])
check(len(dels(changes6)) == 3 and adds(changes6) == [], f"--clear 가 3개만 지우지 않았다: {changes6}")
check(chip_group(objs5, "RDR") == [] and len(chip_group(objs5, "QA")) == 1,
      "--code 지정 clear 가 남의 칩까지 지웠다")
check(len(objs5) == n_before_clear - 3, "clear 가 칩 외 객체를 지웠다")
check(sig_names(objs5) == names_before_clear, "clear 가 프레임 이름을 바꿨다")

changes7, out7, _rc7, _s7 = run_mark(objs5, ["--page", PID, "--clear"])
check(len(dels(changes7)) == 3, f"--code 없는 clear 가 남은 칩 전량을 안 지웠다: {dels(changes7)}")
check(chip_group(objs5, "QA") == [], "--code 없는 clear 후에도 칩이 남았다")
check(any(o.get("name") == "anno:QA" for o in objs5.values()), "clear 가 주석 패널을 지웠다")
check("F-QA" in objs5 and "q1" in objs5 and "r1" in objs5, "clear 가 프레임·목업을 지웠다")

# 붙일 때 --code 를 빼면 실행하지 않는다(칩은 화면 단위 표시)
_c8, out8, _rc8, sent8 = run_mark(objs5, ["--page", PID, "--items", "12"])
check(not [c for c, _b in sent8 if c == "update-file"], "--code 없이 부착을 강행했다")
check("--code" in out8, f"--code 필요 안내가 없다: {out8}")

# ================================================================== ⑥ dry-run · 역할 가드
objs9, _pr9 = base_page()
n9 = len(objs9)
_c9, out9, _rc9, sent9 = run_mark(objs9, ["--code", "WF-RDR", "--page", PID, "--items", "12", "--dry-run"])
check(not [c for c, _b in sent9 if c == "update-file"], "dry-run 인데 update-file 을 보냈다")
check(len(objs9) == n9 and "dry-run" in out9, "dry-run 이 파일을 바꿨거나 표시가 없다")

objs10, _pr10 = base_page()
_c10, out10, rc10, sent10 = run_mark(objs10, ["--code", "WF-RDR", "--page", PID, "--items", "12",
                                              "--expect-page-role", "working"],
                                     role=("stop", "이 사본이 그사이 정본으로 승격됐습니다"))
check(rc10 == 3, f"역할 불일치인데 exit 3 이 아니다: {rc10}")
check(not [c for c, _b in sent10 if c == "update-file"], "역할 불일치인데 update-file 을 보냈다")
check("⛔ 중단" in out10, f"중단 사유가 안 찍혔다: {out10}")

objs11, _pr11 = base_page()
_c11, out11, rc11, sent11 = run_mark(objs11, ["--code", "WF-RDR", "--page", PID, "--items", "12",
                                              "--expect-page-role", "working"], role=("ok", "사본"))
check(rc11 == 0 and [c for c, _b in sent11 if c == "update-file"], "역할 ok 인데 쓰지 않았다")
check("사본 재확인 ok" in out11, "재확인 통과 표시가 없다")

# 다중 페이지 · --page 미지정 = 실행 거부(기존 안전장치가 mark 에도 걸리는가)
def two_page_get_file(base, tok, fid):
    return {"revn": 8, "vern": 2,
            "data": {"pages": [PID, "page-2"],
                     "pagesIndex": {PID: {"id": PID, "name": "정본", "objects": {}},
                                    "page-2": {"id": "page-2", "name": "작업본", "objects": {}}}}}


objs12, _pr12 = base_page()
_c12, out12, _rc12, sent12 = run_mark(objs12, ["--code", "WF-RDR", "--items", "12"],
                                      apply=False, get_file=two_page_get_file)
check(not [c for c, _b in sent12 if c == "update-file"], "다중 페이지인데 --page 없이 썼다")
check("실행 거부" in out12, f"다중 페이지 거부 메시지가 없다: {out12}")

# ================================================================== ⑦ 문서·지시문 결속
INSTR = open(os.path.join(HERE, "..", "..", "plm-channel", "relay", "wf-feedback.mjs"),
             encoding="utf-8").read()
check("wfanno.py mark" in INSTR, "릴레이 지시문이 변경 칩 명령을 시키지 않는다(자동 부착 경로 없음)")
check("--items" in INSTR, "지시문이 --items(바뀐 요소)를 안 넘긴다 — 칩에 무엇이 바뀐지 안 남는다")
check("--clear" in INSTR, "지시문이 정리 경로(mark --clear)를 안 알린다")
DOC = open(os.path.join(HERE, "..", "commands", "wfanno.md"), encoding="utf-8").read()
for tokn in ("mark", "--items", "--clear", "--label", "--date", "chg:"):
    check(tokn in DOC, f"커맨드 문서에 `{tokn}` 가 없다 — 계약 게이트(B)가 잡는다")

print(f"[test_wf_mark] {P} pass, {F} fail")
sys.exit(1 if F else 0)
