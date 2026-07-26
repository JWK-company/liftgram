#!/usr/bin/env python3
"""wfgen_mobile — liftgram 전용 모바일 와이어프레임 생성기.

wfgen.py(플러그인)의 RPC·Screen 프리미티브를 재사용하되,
- 배포 앱(comforting-empanada…netlify)의 실제 모습에 맞춘 **다크 테마 · 390px 모바일 프레임**
- archetype 슬롯 대신 **SAE 스펙의 요소 순서 그대로 세로 스택**(실화면 구조 보존)
- 탭 화면(WKT·FEED·HIST·CAL·STAT·PRF)에 하단 6탭 바
- "(계획)" 화면은 헤더에 계획 배지
보드명 규약(`<CODE> <이름>`)·SAE 코드태그·컴포넌트 승격은 wfgen과 동일 → wfscan 호환.

사용: python3 .ouroboros/scripts/wfgen_mobile.py [--delete-file <ID>] [--dry-run]
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "..", "..", "plugin", "plm-hub", "scripts"))
import wfgen  # noqa: E402
from wfgen import (Screen, _pget, _trunc, _uid, board_child_counts,  # noqa: E402
                   delete_file, find_team, find_wf_project, file_revn_vern_page,
                   get_file, penpot_rpc, resolve, state_variants)
from _sae_parse import load_sae_spec  # noqa: E402

# ---------------------------------------------------------------- 다크 팔레트(배포 앱 근사)
DARK = {
    "bg": "#0D1117", "card": "#171E27", "border": "#2A3441", "line": "#202934",
    "ink": "#E8EDF4", "ink2": "#9AA6B5", "ink3": "#5F6B78", "head": "#FFFFFF",
    "accent": "#4C8DFF", "soft": "#1C2B47", "ok": "#2DD4A0", "warn": "#F5A623",
    "ph": "#1B232E", "ph2": "#27313D", "scrim": "#000000",
}
wfgen.C.update(DARK)
C = wfgen.C

W = 390
L = 16              # 좌우 여백
INNER = W - 2 * L
TABS = ["운동", "피드", "기록", "캘린더", "분석", "프로필"]
TAB_OF = {"WKT": "운동", "FEED": "피드", "HIST": "기록", "CAL": "캘린더",
          "STAT": "분석", "PRF": "프로필"}
PRIMARY_KW = ("시작", "게시", "저장", "완료", "생성", "전송", "로그인", "가입",
              "공유", "추가", "매칭", "충전", "인증", "신청", "구독")


def _is_tabbar(el):
    return el["type"] == "nav" and "탭바" in el.get("label", "")


def _is_brand(el):
    lab = el.get("label", "")
    return el["type"] == "nav" and any(k in lab for k in ("로고", "브랜드"))


def _is_back(el):
    lab = el.get("label", "")
    return any(k in lab for k in ("뒤로", "←", "취소", "최소화"))


def _first_chip(s, x, y, el, fallback_tone="muted"):
    vs = state_variants(el.get("state", ""), limit=3)
    cx = x
    for lb, tone in vs[:3]:
        cx += s.chip(cx, y, lb or "—", tone=tone) + 6
    return cx > x


def build_mobile(page, code, name, route, covers, elements, ox, planned=False):
    s = Screen(page, code, name, ox, 0, W, 100)
    tab = TAB_OF.get(code)

    # ---- 상태바 + 헤더 -------------------------------------------------
    s.group_start("상태바")
    s.bar(0, 0, W, 22, fill=C["bg"])
    s.text(L, 4, 60, 14, "9:41", size=10.5, color=C["ink2"], weight=600)
    s.rect(W - 40, 8, 22, 9, fill=C["ph2"], radius=3, name="battery")
    s.group_end()

    back_el = next((e for e in elements if e["type"] == "button" and _is_back(e)), None)
    brand_el = next((e for e in elements if _is_brand(e)), None)
    hx = L
    s.group_start("헤더 배경")
    s.bar(0, 22, W, 48, fill=C["bg"])
    s.line(0, 70, W, C["line"])
    s.group_end()
    if back_el:
        s.group_start(f"{back_el['code']} 뒤로")
        s.text(hx, 36, 26, 22, "←", size=17, color=C["ink"], weight=600)
        tw = s.code_tag_left(hx + 26, 34, back_el["code"])
        s.group_end()
        hx += 26 + tw + 10
    title = name if not planned else name  # 이름에 (계획) 포함됨
    s.group_start("헤더 제목" if not brand_el else f"{brand_el['code']} 헤더 제목")
    s.text(hx, 34, 250, 24, _trunc(title, 18), size=17, color=C["head"], weight=700)
    if brand_el:
        s.code_tag_left(hx + min(250, 18 + len(title) * 15), 28, brand_el["code"])
    s.group_end()
    if planned:
        s.group_start("계획 배지")
        s.chip(W - 66, 32, "계획", tone="warn")
        s.group_end()
    # 헤더 우측 아이콘(nav — 로고·탭바 제외)
    icon_navs = [e for e in elements
                 if e["type"] == "nav" and not _is_brand(e) and not _is_tabbar(e)]
    ix = W - L
    for i, e in enumerate(reversed(icon_navs[:4])):
        ix -= 30
        s.group_start(f"{e['code']} {_trunc(e['label'], 12)}")
        s.rect(ix, 32, 24, 24, fill=C["card"], stroke=C["border"], radius=12, name="icon")
        s.code_tag(ix + 26, 58 + (i % 2) * 18, e["code"])  # 지그재그 — 인접 칩 겹침 방지
        s.group_end()
    y = 102 if icon_navs else 84  # 아이콘 코드칩(58~94)과 본문 겹침 방지

    # ---- 본문: 스펙 요소 순서 그대로 -----------------------------------
    for el in elements:
        t, lab, cd = el["type"], el.get("label", ""), el["code"]
        if el is back_el or el is brand_el or el in icon_navs or _is_tabbar(el):
            continue

        if t == "display":
            s.group_start(f"{cd} {_trunc(lab, 20)}")
            s.text(L, y, INNER - 60, 18, _trunc(lab, 34), size=12.5, color=C["ink"], weight=600)
            s.code_tag(W - L, y - 2, cd)
            if _first_chip(s, L, y + 22, el):
                y += 50
            else:
                s.placeholder(L, y + 24, int(INNER * 0.5), 8)
                y += 46
            s.group_end()

        elif t == "input":
            s.group_start(f"{cd} 입력")
            s.field(L, y, INNER, 44, placeholder=_trunc(lab, 40))
            s.code_tag(W - L, y - 10, cd)
            s.group_end()
            y += 54

        elif t == "button":
            primary = any(k in lab for k in PRIMARY_KW)
            s.group_start(f"{cd} 버튼")
            s.button(L, y, INNER, 46, _trunc(lab, 26), primary=primary)
            s.code_tag(W - L, y - 10, cd)
            s.group_end()
            y += 56

        elif t == "toggle":
            s.group_start(f"{cd} {_trunc(lab, 20)}")
            s.text(L, y, INNER - 60, 16, _trunc(lab, 30), size=11.5, color=C["ink2"], weight=600)
            s.code_tag(W - L, y - 2, cd)
            vs = state_variants(el.get("state", ""), limit=4)
            opts = [lb for lb, _t2 in vs] or [_trunc(lab, 8)]
            cx = L
            for i, op in enumerate(opts[:4]):
                ow = max(58, 18 + len(op) * 11)
                if cx + ow > W - L:
                    break
                if i == 0:
                    s.rect(cx, y + 20, ow, 32, fill=C["soft"], radius=16, name="seg")
                    s.text(cx, y + 28, ow, 14, _trunc(op, 8), size=11, color=C["accent"],
                           weight=600, align="center")
                else:
                    s.toggle(cx, y + 20, ow, 32, _trunc(op, 8))
                cx += ow + 8
            s.group_end()
            y += 64

        elif t == "container":
            s.group_start(f"{cd} {_trunc(lab, 20)}")
            s.panel(L, y, INNER, 96, title=_trunc(lab, 36), dashed=True)
            for k in range(2):
                s.placeholder(L + 14, y + 40 + k * 20, INNER - 28 - (k % 2) * 60, 9)
            s.code_tag(W - L, y - 2, cd)
            s.group_end()
            y += 108

        elif t == "list":
            s.group_start(f"{cd} {_trunc(lab, 22)}")
            s.text(L, y, INNER - 40, 18, _trunc(lab, 34), size=12.5, color=C["ink"], weight=700)
            s.code_tag(W - L, y - 2, cd)
            yy = y + 24
            lvs = state_variants(el.get("state", ""), limit=3)
            for r in range(3):
                s.rect(L, yy, INNER, 54, fill=C["card"], stroke=C["line"], radius=10, name="row")
                s.rect(L + 10, yy + 12, 30, 30, fill=C["ph2"], radius=15, name="avatar")
                s.placeholder(L + 50, yy + 13, int(INNER * 0.42), 9)
                s.placeholder(L + 50, yy + 30, int(INNER * 0.28), 7, color=C["ph"])
                if lvs:
                    lb, tone = lvs[r % len(lvs)]
                    s.chip(W - L - 14 - len(str(lb)) * 6.6, yy + 17, lb or "—", tone=tone)
                yy += 60
            s.group_end()
            y = yy + 6

        elif t == "overlay":
            s.group_start(f"{cd} {_trunc(lab, 22)}")
            s.rect(L, y, INNER, 46, fill=C["soft"], radius=10, name="sheet")
            s.text(L + 12, y + 15, INNER - 24, 16, "▤  " + _trunc(lab, 30), size=11.5,
                   color=C["accent"], weight=600)
            s.code_tag(W - L, y - 2, cd)
            s.group_end()
            y += 56

    # ---- 하단 탭바 -----------------------------------------------------
    tabbar_el = next((e for e in elements if _is_tabbar(e)), None)
    if tab or tabbar_el:
        y += 6
        gname = f"{tabbar_el['code']} 하단 탭바" if tabbar_el else "하단 탭바"
        s.group_start(gname)
        s.bar(0, y, W, 58, fill=C["card"])
        s.line(0, y, W, C["line"])
        tw = W / len(TABS)
        for i, tb in enumerate(TABS):
            active = (tb == tab)
            cxx = int(i * tw + tw / 2)
            s.rect(cxx - 9, y + 9, 18, 18, fill=C["accent"] if active else C["ph2"],
                   radius=5, name="tabicon")
            s.text(int(i * tw), y + 33, int(tw), 14, tb, size=9.5,
                   color=C["accent"] if active else C["ink3"],
                   weight=700 if active else 500, align="center")
        if tabbar_el:
            s.code_tag(W - 6, y + 2, tabbar_el["code"])
        s.group_end()
        y += 58

    s.h = y + 14
    return s


# ---------------------------------------------------------------- main
AS_IS = ["WKT", "RTN", "GEN", "ACT", "SUM", "EXL", "FIND", "EXD", "EXF",
         "HIST", "WDT", "CAL", "STAT",
         "FEED", "CMT", "XPL", "DISC", "UPRF", "DMS", "DMC", "NTF",
         "PRF", "AUTH", "GYM", "GEAR"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--delete-file", dest="delete_file_id")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--file-name", default="liftgram 와이어프레임 (SAE)")
    args = ap.parse_args()

    cfg = resolve()
    base, tok, project = cfg["penpot_api"], cfg["penpot_token"], cfg["project"]
    sae_dir = os.path.join(cfg["ouro"], "docs", "wireframes")
    codes = sorted(m.group(1) for f in os.listdir(sae_dir)
                   for m in [re.match(r"WF-([A-Z]{2,6})\.json$", f)] if m)
    # as-is 먼저(앱 흐름 순), 나머지(계획)는 코드순 뒤에
    ordered = [c for c in AS_IS if c in codes] + [c for c in codes if c not in AS_IS]

    specs = []
    for sc in ordered:
        spec = load_sae_spec(sae_dir, sc)
        if not spec or not spec["elements"]:
            print(f"[mobile] ⚠ WF-{sc}.json 없음/빈 스펙 — 스킵")
            continue
        specs.append((sc, spec))

    if args.dry_run:
        for sc, spec in specs:
            planned = "(계획)" in spec["name"]
            print(f"  {sc:5s} {'계획' if planned else 'as-is':5s} '{spec['name']}' 요소 {len(spec['elements'])}")
        print(f"총 {len(specs)}화면")
        return

    team_id = find_team(base, tok, project)
    pp_pid = find_wf_project(base, tok, team_id, "Wireframes")
    if args.delete_file_id:
        try:
            delete_file(base, tok, args.delete_file_id)
            print(f"[mobile] 기존 파일 삭제: {args.delete_file_id}")
        except Exception as e:
            print(f"[mobile] delete-file 경고(계속): {str(e)[:100]}")

    created = penpot_rpc(base, tok, "create-file", {"name": args.file_name, "project-id": pp_pid})
    file_id = _pget(created, "id")
    f = get_file(base, tok, file_id)
    revn, vern, page_id = file_revn_vern_page(f)
    print(f"[mobile] 파일 생성 id={file_id} revn={revn} vern={vern}")

    all_ops, comp_ops, plan = [], [], []
    ox = 0
    for sc, spec in specs:
        planned = "(계획)" in spec["name"]
        scr = build_mobile(page_id, sc, spec["name"], spec["route"], spec["covers"],
                           spec["elements"], ox, planned=planned)
        all_ops.extend(scr.finalize())
        comp_ops.extend(scr.component_changes(file_id))
        plan.append((sc, scr.bid, len(spec["elements"]), len(scr.kids)))
        ox += W + 50
    all_ops.extend(comp_ops)
    print(f"[mobile] change-ops {len(all_ops)}개 (board {len(plan)} · 컴포넌트 {len(comp_ops)})")

    res = penpot_rpc(base, tok, "update-file", {
        "id": file_id, "revn": revn, "vern": vern,
        "sessionId": _uid(), "changes": all_ops})
    print(f"[mobile] update-file OK — revn {revn} → {_pget(res, 'revn', default='?')}")

    got = board_child_counts(get_file(base, tok, file_id))
    ok_all = True
    for sc, bid, nel, nch in plan:
        gname, gcnt = got.get(bid, ("(없음)", -1))
        if gcnt != nch:
            ok_all = False
        print(f"  {sc:<6} 요소 {nel:>2} 자식 {nch:>2} 실제 {gcnt:>2} {'OK' if gcnt == nch else 'MISMATCH'}")
    print(f"총 board {len(got)} / 요청 {len(plan)} · {'전부 일치' if ok_all else '불일치'}")
    print(f"FILE_ID={file_id}")


if __name__ == "__main__":
    main()
