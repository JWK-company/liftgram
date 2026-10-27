#!/usr/bin/env python3
"""와이어프레임 도구 **불변식 5종** — 빌드 게이트(전수 감사 2026-07-31).

반복 발견된 결함은 전부 한 가지 병이었다: **결과가 명세보다 작아지는데 아무도 경고하지 않는다.**
  · wfgen  요약 타일 summ[:4] · 컨트롤 controls[:6] · 카드 cards[:6] · 리스트 lists[:3]
           섹션 [:2] · 툴바 토글 [:7] · 사이드바 [:6] · 패널 [:2] · 폼 버튼 [:3] · 네비 [:4] …
  · wfanno _panel_region 과도 확장 → **이웃 화면 패널 삭제**(RDR.12·13 / QA.09·10 실제 소실)
  · _sae_parse  코드 규약 미준수 요소 무단 폐기 · 첫 bullet_list 만 · 라벨 속 [..] 오인
  · wfscan _doc_has_rich 가 bullet_list 를 '얇음'으로 봐 **정본 SAE 본문을 통째 덮어씀**

여기서 고정하는 5개가 깨지면 그 병이 되살아난 것이다:
  ① 명세 요소 수 == 렌더 결과에 나타난 코드 수 (전 아키타입 · 20요소 이상 픽스처)
  ② `--code` 순차 == `--all` (wfanno) · 배치 구성과 무관한 렌더 (wfgen)
  ③ 다른 화면 객체 삭제 0
  ④ 재실행 멱등 (같은 입력 2회 → 결과 동일)
  ⑤ 왕복 무손실 (elements → doc/패널 → 역추출 → elements)

네트워크 없음 — 전부 인메모리. 라이브 penpot/PLM 무접촉.
"""
import importlib.util
import io
import json
import os
import re
import sys
import contextlib

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "scripts")
sys.path.insert(0, SCRIPTS)


def _load(name, fn):
    s = importlib.util.spec_from_file_location(name, os.path.join(SCRIPTS, fn))
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


wfgen = _load("inv_wfgen", "wfgen.py")
sys.modules.setdefault("wfgen", wfgen)
wfanno = _load("inv_wfanno", "wfanno.py")
sp = _load("inv_sae", "_sae_parse.py")

PASS = 0
FAIL = 0


def ok(cond, msg):
    global PASS, FAIL
    if cond:
        PASS += 1
    else:
        FAIL += 1
        print(f"  ✖ {msg}")


def quiet(fn, *a, **k):
    """경고 출력을 삼키고 실행(테스트 로그 청결)."""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        r = fn(*a, **k)
    return r, buf.getvalue()


# ── 픽스처: 요소 20개 이상 · 전 역할 버킷 혼합 ──────────────────────────────
MIX = [
    ("nav", "로고 홈"), ("input", "검색"), ("button", "검색 실행"),
    ("display", "모드 배지"), ("display", "섹션 A"), ("display", "섹션 B"),
    ("display", "섹션 C"), ("nav", "카드 아이템"), ("nav", "카드 아이템2"),
    ("display", "커버 이미지"), ("display", "메타 정보"), ("display", "태그라인 고지"),
    ("toggle", "탭 하나"), ("toggle", "토글2"), ("toggle", "토글3"), ("toggle", "토글4"),
    ("toggle", "토글5"), ("toggle", "토글6"), ("toggle", "토글7"), ("toggle", "토글8"),
    ("container", "패널1"), ("container", "패널2"), ("container", "패널3"),
    ("overlay", "오버레이1"), ("overlay", "오버레이2"),
    ("button", "버튼A"), ("button", "버튼B"), ("button", "버튼C"), ("button", "버튼D"),
    ("input", "입력2"), ("input", "입력3"), ("input", "입력4"),
    ("list", "리스트1"), ("list", "리스트2"), ("list", "리스트3"), ("list", "리스트4"),
    ("nav", "유저 메뉴"), ("button", "뒤로"), ("button", "업로드"),
    ("display", "안내1"), ("display", "안내2"), ("box", "본문 박스"),
    ("nav", "네비항목1"), ("nav", "네비항목2"), ("nav", "네비항목3"),
    ("nav", "네비항목4"), ("nav", "네비항목5"), ("display", "플로우 단계"),
]
ELS = [{"code": f"ZZ.{i:02d}", "type": t, "label": l,
        "state": "정상 / 진행(warn)", "action": "클릭", "effect": f"{l} 효과"}
       for i, (t, l) in enumerate(MIX, 1)]


def ops_of(screens):
    out = []
    for s in screens:
        out.extend(s.finalize())
    return out


def blob_of(screens):
    return json.dumps(ops_of(screens), ensure_ascii=False)


print("═══ 와이어프레임 불변식 5종 ═══")

# ── ① 명세 요소 수 == 렌더 결과 코드 수 (전 아키타입) ───────────────────────
print("① 명세 요소 == 렌더 코드 (전 아키타입)")
ok(len(ELS) >= 20, f"픽스처 요소 20개 이상이어야 한다(현재 {len(ELS)})")
for arch in wfgen.ARCHETYPES:
    (scr, miss), _ = quiet(wfgen.build_screens, "PG", "ZZ", "테스트", "/z", [], ELS, 0, arch, False)
    blob = blob_of(scr)
    lost = [e["code"] for e in ELS if e["code"] not in blob]
    ok(not lost, f"[{arch}] 명세 {len(ELS)}개 중 {len(lost)}개가 렌더 결과에 없다: {lost[:10]}")
    # 잔여 sweep 이 실제로 '미배치' board 를 붙였는지(경고 경로가 죽지 않았는지)
    ok(not miss or any(s.code.endswith("-Z") for s in scr),
       f"[{arch}] 미배치 {len(miss)}개인데 '미배치 요소' board 가 없다")

# 아키타입이 슬롯을 가진 요소는 잔여 board 가 아니라 **본 화면**에 있어야 한다(sweep 이
# 레이아웃 개선을 가리는 눈속임으로 전락하지 않도록 하한선을 고정).
(scr_auto, miss_auto), _ = quiet(wfgen.build_screens, "PG", "ZZ", "T", "/z", [], ELS, 0, "auto", False)
ok(len(miss_auto) <= 12,
   f"[auto] 범용 아키타입이 {len(miss_auto)}개나 미배치 — 레이아웃이 퇴행했다(허용 12)")

# ── ② 배치 구성과 무관 / --code 순차 == --all ──────────────────────────────
print("② 순차 == 일괄")
# wfgen: 같은 화면을 단독으로 만들든 다른 화면과 같이 만들든 **코드 집합**이 같아야 한다.
(a1, _), _ = quiet(wfgen.build_screens, "PG", "ZZ", "T", "/z", [], ELS, 0, "auto", False)
(a2, _), _ = quiet(wfgen.build_screens, "PG", "ZZ", "T", "/z", [], ELS, 9999, "auto", False)


def codes_in(screens):
    b = blob_of(screens)
    return {e["code"] for e in ELS if e["code"] in b}


ok(codes_in(a1) == codes_in(a2), "wfgen: ox 오프셋이 달라지면 렌더되는 코드 집합이 달라진다")
# wfanno 의 순차==일괄 은 test_wfanno_stale 이 37건으로 고정(불변식 ④ 항목) — 여기선 배치 SSOT 로 재확인.
FR = [
    {"id": "f1", "name": "AA 화면1", "code": "AA", "x": 0, "y": 0, "w": 1180, "h": 800},
    {"id": "f2", "name": "AA-A 오버레이", "code": None, "x": 1220, "y": 0, "w": 420, "h": 560},
    {"id": "f3", "name": "BB 화면2", "code": "BB", "x": 0, "y": 1000, "w": 1180, "h": 800},
]
an_seq = wfanno.panel_anchor(FR[0], FR)
an_all = wfanno.panel_anchor(FR[0], list(reversed(FR)))
ok(an_seq == an_all, f"panel_anchor 가 프레임 순서에 의존한다: {an_seq} vs {an_all}")

# ── ③ 다른 화면 객체 삭제 0 ─────────────────────────────────────────────────
print("③ 이웃 화면 객체 삭제 0")
objs = {}


def _mk(oid, name, x, y, w=330, h=400, typ="rect", parent=wfanno.ROOT_UUID):
    objs[oid] = {"id": oid, "name": name, "type": typ, "x": x, "y": y,
                 "width": w, "height": h, "parentId": parent, "shapes": []}


# AA 패널(보조 board 우측 = 배치 SSOT 기준) / BB 패널
aa_x = an_seq[0] + an_seq[2] + wfanno.GAP
_mk("gAA", "anno:AA", aa_x, 0, typ="group")
objs["gAA"]["shapes"] = ["aa1", "aa2"]
_mk("aa1", "anno-bg", aa_x, 0, parent="gAA")
_mk("aa2", "anno-code", aa_x + 18, 60, parent="gAA")
bb_an = wfanno.panel_anchor(FR[2], FR)
bb_x = bb_an[0] + bb_an[2] + wfanno.GAP
_mk("gBB", "anno:BB", bb_x, 1000, typ="group")
objs["gBB"]["shapes"] = ["bb1", "bb2"]
_mk("bb1", "anno-bg", bb_x, 1000, parent="gBB")
_mk("bb2", "anno-code", bb_x + 18, 1060, parent="gBB")

_texts, stale_aa = wfanno._anno_for_frame(objs, FR[0], FR)
ok("bb1" not in stale_aa and "bb2" not in stale_aa and "gBB" not in stale_aa,
   f"AA 렌더가 BB 패널 객체를 지운다: {sorted(stale_aa)}")
ok("aa1" in stale_aa and "aa2" in stale_aa, "AA 렌더가 자기 패널을 교체하지 않는다(멱등 깨짐)")
_texts, stale_bb = wfanno._anno_for_frame(objs, FR[2], FR)
ok("aa1" not in stale_bb and "aa2" not in stale_bb and "gAA" not in stale_bb,
   f"BB 렌더가 AA 패널 객체를 지운다: {sorted(stale_bb)}")

# 배치 SSOT: wfgen 최초 생성과 wfanno 재렌더의 패널 x 가 **정확히 같아야** 한다(겹침 결함).
(scr_ws, _m), _ = quiet(wfgen.build_screens, "PG", "AA", "화면1", "/a", [], ELS, 0, "workspace", False)
gen_anchor = wfgen.anno_anchor(scr_ws)
gen_frames = [{"id": s.bid, "name": f"{s.code} {s.name}",
               "code": (s.code if i == 0 else None),
               "x": s.ox, "y": s.oy, "w": s.w, "h": s.h} for i, s in enumerate(scr_ws)]
anno_anchor2 = wfanno.panel_anchor(gen_frames[0], gen_frames)
ok(gen_anchor == anno_anchor2,
   f"wfgen 생성 좌표 != wfanno 재렌더 좌표 — 패널이 board 위를 덮는다: {gen_anchor} vs {anno_anchor2}")
ok(len(scr_ws) > 1 and gen_anchor[0] + gen_anchor[2] >= max(s.ox + s.w for s in scr_ws),
   "패널 앵커가 이 화면의 모든 board 우측 끝을 넘지 못한다(보조 board 를 덮는다)")

# ── ④ 재실행 멱등 ───────────────────────────────────────────────────────────
print("④ 재실행 멱등")


def shape_of(screens):
    """id(랜덤 uuid) 제외한 구조 지문 — 이름·좌표·크기·텍스트."""
    out = []
    for ch in ops_of(screens):
        o = ch.get("obj") or {}
        txt = json.dumps(o.get("content", ""), ensure_ascii=False, sort_keys=True)
        out.append((o.get("name"), o.get("x"), o.get("y"),
                    o.get("width"), o.get("height"), o.get("type"), txt))
    return out


for arch in wfgen.ARCHETYPES:
    (s1, m1), _ = quiet(wfgen.build_screens, "PG", "ZZ", "T", "/z", [], ELS, 0, arch, False)
    (s2, m2), _ = quiet(wfgen.build_screens, "PG", "ZZ", "T", "/z", [], ELS, 0, arch, False)
    ok(shape_of(s1) == shape_of(s2), f"[{arch}] 같은 입력 2회 실행 결과가 다르다(비멱등)")
    ok(m1 == m2, f"[{arch}] 미배치 목록이 실행마다 다르다")

# 주석 패널도 멱등(요소 순서·wrap 계산 안정)
p1, _px, _pw, _ph = wfanno.build_anno_panel("PG", "ZZ", "T", "노트", ELS, 0, 0, 1180, 800)
p2, _px, _pw, _ph = wfanno.build_anno_panel("PG", "ZZ", "T", "노트", ELS, 0, 0, 1180, 800)


def anno_shape(ops):
    return [(c["obj"].get("name"), c["obj"].get("x"), c["obj"].get("y"),
             json.dumps(c["obj"].get("content", ""), ensure_ascii=False, sort_keys=True))
            for c in ops]


ok(anno_shape(p1) == anno_shape(p2), "주석 패널이 비멱등")

# ── ⑤ 왕복 무손실 ───────────────────────────────────────────────────────────
print("⑤ 왕복 무손실")
# (a) _sae_parse: elements → doc → elements. 적대적 입력(라벨 속 [..] · 하이픈 유형 · 빈 필드 · name 속 ·)
HOSTILE = [
    {"code": "ZZ.01", "type": "button", "label": "[신규] 저장",
     "state": "", "action": "클릭", "effect": "저장됨"},
    {"code": "ZZ.02", "type": "text-input", "label": "검색어",
     "state": "비었음 / 입력중", "action": "", "effect": ""},
    {"code": "ZZ.03", "type": "", "label": "제목",
     "state": "—표시", "action": "없음", "effect": "다중 · 구분자 · 포함"},
]
doc = sp.serialize_sae_doc("이름 · 중간점 포함", "/a/b", "ZZ", "노트 본문", HOSTILE)
back, _ = quiet(sp.parse_sae_doc, doc)
ok(len(back) == len(HOSTILE), f"요소 수 왕복 손실: {len(HOSTILE)} → {len(back)}")
ok(back == HOSTILE, f"필드 왕복 손실:\n    보낸것={HOSTILE}\n    받은것={back}")
nm, rt = sp.heading_name_route(doc, "fb", "/fb")
ok(nm == "이름 · 중간점 포함", f"name 안의 '·' 가 잘렸다: {nm!r}")
ok(rt == "/a/b", f"route 왕복 손실: {rt!r}")
# 전량 왕복(48요소)
doc_all = sp.serialize_sae_doc("T", "/z", "ZZ", "", ELS)
back_all, _ = quiet(sp.parse_sae_doc, doc_all)
ok(len(back_all) == len(ELS), f"48요소 왕복 손실: {len(ELS)} → {len(back_all)}")
ok([e["code"] for e in back_all] == [e["code"] for e in ELS], "왕복 시 요소 **순서**가 바뀌었다")
# 두 그룹으로 나뉜 bullet_list 도 전량 회수(구 find_bullet_list 는 뒤 그룹을 통째로 잃었다)
two = {"type": "doc", "content": [
    {"type": "bullet_list", "content": [sp._sae_list_item(e) for e in ELS[:5]]},
    {"type": "heading", "attrs": {"level": 3}, "content": [sp._txt("보조 요소")]},
    {"type": "bullet_list", "content": [sp._sae_list_item(e) for e in ELS[5:]]},
]}
back_two, _ = quiet(sp.parse_sae_doc, two)
ok(len(back_two) == len(ELS), f"bullet_list 가 2개면 뒤 그룹이 유실된다: {len(back_two)}/{len(ELS)}")
# 규약 미준수 요소는 버리되 **반드시 경고**한다(조용한 폐기 금지)
bad = {"type": "doc", "content": [{"type": "bullet_list", "content": [
    sp._sae_list_item({"code": "nope", "label": "x", "type": "", "state": "", "action": "", "effect": ""})]}]}
_r, out = quiet(sp.parse_sae_doc, bad)
ok("⚠" in out and "미준수" in out, f"코드 규약 미준수 요소를 조용히 버린다(경고 없음): {out!r}")

# (b) wfanno: elements → 주석 패널 → 역추출 → elements
ops, _px, _pw, _ph = wfanno.build_anno_panel("PG", "ZZ", "화면", "노트", ELS, 0, 0, 1180, 800)
anno_objs = [c["obj"] for c in ops if (c.get("obj") or {}).get("name", "").startswith("anno-")]
note_rt, els_rt = wfanno.extract_elements(anno_objs)
ok(len(els_rt) == len(ELS), f"패널 왕복 요소 수 손실: {len(ELS)} → {len(els_rt)}")
ok([e["code"] for e in els_rt] == [e["code"] for e in ELS], "패널 왕복에서 요소 순서가 바뀌었다")
diff = [(a["code"], k, a.get(k, ""), b.get(k, ""))
        for a, b in zip(ELS, els_rt) for k in ("label", "type", "state", "action", "effect")
        if (a.get(k) or "").strip() != (b.get(k) or "").strip()]
ok(not diff, f"패널 왕복 필드 손실: {diff[:6]}")
ok(note_rt == "노트", f"note 왕복 손실: {note_rt!r}")

# (c) 삼중 왕복 — 패널 역추출 결과를 다시 doc 으로 직렬화해도 같은가(SSOT 두 파서 규약 일치)
doc_rt = sp.serialize_sae_doc("화면", "/z", "ZZ", note_rt, els_rt)
els_rt2, _ = quiet(sp.parse_sae_doc, doc_rt)
ok([e["code"] for e in els_rt2] == [e["code"] for e in ELS],
   "penpot 역추출 → doc 직렬화 → 재파싱 삼중 왕복에서 요소가 어긋난다")
ok(len(els_rt2) == len(ELS), f"삼중 왕복 요소 수 손실: {len(ELS)} → {len(els_rt2)}")

# ── 결과 ────────────────────────────────────────────────────────────────────
print(f"[test_wf_invariants] {PASS} pass, {FAIL} fail")
sys.exit(1 if FAIL else 0)
