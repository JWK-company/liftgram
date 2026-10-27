#!/usr/bin/env python3
"""wfanno stale 판정 회귀 테스트 — **이웃 화면 주석 패널 삭제**(실사용 데이터 손실) 결함.

증상(2026-07-31 보고): `wfanno render --code <화면>` 을 화면별로 하나씩 돌리면 **다른 화면의 주석 패널
요소가 사라졌다**(RDR.12·13 / QA.09·10 소실). `--all` 로 한 번에 렌더하면 같은 커밋에서 전부 다시
add 되어 증상이 가려졌다 — 그래서 오래 숨어 있었다.

원인(구 `_panel_region` + `_anno_for_frame`):
  ① 대상 프레임에 anno-bg 가 아직 없으면 region 이 `x: fx+fw-10 … fx+fw+PANEL_W+140`,
     `y: fy-40 … fy+fh+400` 까지 벌어졌다(아래 이웃 클램프는 `|Δx|<60` 인 "같은 열"에만 걸려
     **살짝 엇갈린 열은 그냥 통과**).
  ② anno-bg 가 있는 경로에는 아래 이웃 클램프가 **아예 없었다** — 요소가 많아 패널이 프레임보다 길면
     region 이 아래 화면 패널 위로 그대로 뻗었다.
  ③ 그 region 안의 **모든** anno-* 를 stale 로 넣어 del-obj 했다(패널 소유권 무시).

이 파일이 고정하는 것:
  ① 좌우 인접 — 한쪽만 렌더해도 반대쪽 객체 삭제 0
  ② 상하 인접(엇갈린 열 · 긴 패널) — 아래 화면 패널 삭제 0   ← 구 판정식이면 삭제됐음을 함께 검증
  ③ 자기 패널 교체는 그대로(자기 것은 지우고 다시 그린다 · 멱등)
  ④ **불변식**: `--code` 순차 렌더 결과 == `--all` 일괄 렌더 결과(남는 객체 집합 동일)
  ⑤ 패널이 아직 없는 첫 렌더에서도 이웃 무피해(이웃이 그룹 없는 **레거시 loose 패널**이어도)
  ⑥ 자기 레거시 loose 패널은 여전히 정리된다(= "아무것도 안 지운다" 로 도망가지 않았음)
  ⑦ 긴 레거시 패널의 역추출(anno_texts)이 잘리지 않는다

네트워크 없음 — penpot RPC 전부 스텁. 라이브 penpot 파일 무접촉.
"""
import copy
import contextlib
import importlib.util
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "scripts")
_s = importlib.util.spec_from_file_location("wa_stale", os.path.join(SCRIPTS, "wfanno.py"))
wa = importlib.util.module_from_spec(_s)
_s.loader.exec_module(wa)
wfgen = wa.wfgen

ROOT = wa.ROOT_UUID
PID = "page-0001"

P = F = 0


def check(cond, msg):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print(f"  FAIL: {msg}")


# ---------------------------------------------------------------- 픽스처 빌더
def frame(fid, code, name, x, y, w=390, h=800):
    return {"id": fid, "name": f"{code} {name}", "type": "frame", "parentId": ROOT, "frameId": ROOT,
            "x": x, "y": y, "width": w, "height": h, "shapes": []}


def spec_of(code, n):
    """요소 n 개짜리 SAE 명세 — 요소마다 상태/조작/이펙트가 있어 패널이 프레임보다 길어진다."""
    return {"name": f"{code} 화면", "route": f"/{code.lower()}", "note": f"{code} 화면 설명",
            "covers": [],
            "elements": [{"code": f"{code}.{i:02d}", "label": f"{code} 요소 {i}", "type": "list",
                          "state": "기본", "action": "탭", "effect": f"{code} 상세로 이동"}
                         for i in range(1, n + 1)]}


def panel_objs(code, fr, n, grouped=True):
    """build_anno_panel 로 **실제와 동일한** 패널 객체군 생성 → {oid: obj}. grouped=False 면 레거시
    loose 패널(그룹 없이 anno-* 만 떠 있는 AnyC 이식 형태)."""
    ops, _px, _pw, ph = wa.build_anno_panel(PID, code, f"{code} 화면", f"{code} 화면 설명",
                                            spec_of(code, n)["elements"],
                                            fr["x"], fr["y"], fr["width"], fr["height"])
    out = {}
    for c in ops:
        o = copy.deepcopy(c["obj"])
        if not grouped:
            if o["type"] == "group" and str(o.get("name", "")).startswith("anno:"):
                continue
            o["parentId"] = ROOT
        out[o["id"]] = o
    return out, ph


def apply_changes(objs, changes):
    for c in changes:
        t = c.get("type")
        if t == "del-obj":
            objs.pop(c["id"], None)
        elif t == "add-obj":
            o = copy.deepcopy(c["obj"])
            objs[o["id"]] = o
    return objs


def sig(objs):
    """uuid 를 배제한 **내용 서명** — (이름·타입·좌표·크기·텍스트). 두 렌더 경로 비교용."""
    out = []
    for o in objs.values():
        out.append((str(o.get("name")), str(o.get("type")),
                    round(float(o.get("x", 0)), 2), round(float(o.get("y", 0)), 2),
                    round(float(o.get("width", 0)), 2), round(float(o.get("height", 0)), 2),
                    wa._text_of(o)))
    return sorted(out)


# ---------------------------------------------------------------- 구 판정식(문서화·픽스처 유효성 검증용)
def old_region(objs, fr, all_frames):
    """구 `_panel_region` 그대로 — 픽스처가 **정말로** 구 코드에서 터졌는지 확인하는 데만 쓴다."""
    fx, fy, fw, fh = fr["x"], fr["y"], fr["w"], fr["h"]
    px = fx + fw + wa.GAP
    for _oid, o in objs.items():
        if wfgen._pget(o, "name") == "anno-bg" and wfgen._pget(o, "type") == "rect":
            if abs(o.get("x", 0) - px) <= 14 and abs(o.get("y", 0) - fy) <= 14:
                return (o["x"] - 4, o["x"] + o.get("width", wa.PANEL_W) + 4,
                        o["y"] - 4, o["y"] + o.get("height", fh) + 4)
    y_hi = fy + fh + 400
    belows = [g["y"] for g in all_frames if g is not fr and abs(g["x"] - fx) < 60 and g["y"] > fy + 20]
    if belows:
        y_hi = min(belows) - 4
    return fx + fw - 10, fx + fw + wa.PANEL_W + 140, fy - 40, y_hi


def old_would_delete(objs, fr, all_frames, ids):
    """구 판정식이 지웠을 id 집합(주어진 ids 중) — region 안의 모든 anno-* (소유권 무시)."""
    x_lo, x_hi, y_lo, y_hi = old_region(objs, fr, all_frames)
    hit = set()
    for oid in ids:
        o = objs.get(oid) or {}
        nm = str(wfgen._pget(o, "name") or "")
        if not (nm == "anno-bg" or nm.startswith("anno-")):
            continue
        x, y = o.get("x", 0), o.get("y", 0)
        if x_lo <= x <= x_hi and y_lo <= y <= y_hi:
            hit.add(oid)
    return hit


# ---------------------------------------------------------------- 실행 하네스
def run_render(objs, specs, code=None, apply=True):
    """wfanno render 를 in-process 실행 → (changes, stdout). apply=True 면 changes 를 objs 에 반영."""
    sent = []

    def fake_rpc(base, tok, cmd, body=None):
        sent.append((cmd, body or {}))
        return {"revn": 9}

    def fake_get_file(base, tok, fid):
        return {"revn": 8, "vern": 2,
                "data": {"pages": [PID],
                         "pagesIndex": {PID: {"id": PID, "name": "Page 1",
                                              "objects": copy.deepcopy(objs)}}}}

    old = (wfgen.get_file, wfgen.penpot_rpc, wa._resolve_ctx, wa._find_files, wa.load_sae_spec, sys.argv)
    wfgen.get_file = fake_get_file
    wfgen.penpot_rpc = fake_rpc
    wa._resolve_ctx = lambda po, so: ({"penpot_api": "https://x", "penpot_token": "tok",
                                       "plm_api": "https://p", "plm_token": "ptok",
                                       "project": "T", "ouro": None}, "T", None)
    wa._find_files = lambda base, tok, project, fo: [("FILE-1", "와이어프레임")]
    wa.load_sae_spec = lambda d, c: copy.deepcopy(specs.get(c))
    buf = io.StringIO()
    try:
        sys.argv = ["wfanno", "render", "T"] + (["--code", code] if code else ["--all"])
        with contextlib.redirect_stdout(buf):
            wa.main()
    finally:
        (wfgen.get_file, wfgen.penpot_rpc, wa._resolve_ctx, wa._find_files,
         wa.load_sae_spec, sys.argv) = old
    changes = []
    for c, body in sent:
        if c == "update-file":
            changes.extend(body.get("changes") or [])
    if apply:
        apply_changes(objs, changes)
    return changes, buf.getvalue()


def dels(changes):
    return {c["id"] for c in changes if c.get("type") == "del-obj"}


def adds(changes):
    return [c["obj"] for c in changes if c.get("type") == "add-obj"]


# ================================================================== 픽스처: 4화면 그리드
# 열 2 × 행 2. 아래 행은 x 가 80px **엇갈려** 있다(손으로 배치한 실제 파일이 그렇다) — 구 코드의
# "같은 열(|Δx|<60)" 클램프가 걸리지 않는 배치.
FR = {
    "LIST": frame("F-LIST", "LIST", "목록", 0, 0),
    "DTL":  frame("F-DTL", "DTL", "상세", 900, 0),
    "RDR":  frame("F-RDR", "RDR", "렌더", 80, 1000),
    "QA":   frame("F-QA", "QA", "검수", 980, 1000),
}
NEL = {"LIST": 14, "DTL": 12, "RDR": 13, "QA": 10}
SPECS = {c: spec_of(c, n) for c, n in NEL.items()}


def build_page(codes_with_panel, loose=(), frames=("LIST", "DTL", "RDR", "QA")):
    """프레임 + 지정 화면의 패널. loose 에 든 코드는 **그룹 없는 레거시 패널**로 만든다.
    반환 (objs, ids{code:set}, heights{code:h})."""
    objs, ids, hs = {}, {}, {}
    for c in frames:
        f = FR[c]
        objs[f["id"]] = copy.deepcopy(f)
    for c in list(codes_with_panel) + list(loose):
        pobjs, ph = panel_objs(c, FR[c], NEL[c], grouped=(c not in loose))
        objs.update(pobjs)
        ids[c] = set(pobjs.keys())
        hs[c] = ph
    return objs, ids, hs


def fr_dicts(objs):
    return wa._frames(objs)


def frame_of(objs, code):
    return next(f for f in fr_dicts(objs) if f["code"] == code)


# ================================================================== ① 좌우 인접
def t_side_by_side():
    objs, ids, _hs = build_page(["LIST", "DTL"])
    changes, _out = run_render(objs, SPECS, code="LIST", apply=False)
    d = dels(changes)
    check(d & ids["DTL"] == set(), f"① 좌우 인접: DTL 패널 객체가 삭제됐다 ({len(d & ids['DTL'])}개)")
    check(d == ids["LIST"], f"① 좌우 인접: 삭제 집합이 LIST 패널과 정확히 일치해야 한다 "
                            f"(초과 {len(d - ids['LIST'])} · 누락 {len(ids['LIST'] - d)})")
    # loose 잔재가 DTL 쪽에 있어도 건드리면 안 된다(DTL 패널 앵커에 그룹 밖 텍스트 1개)
    stray = {"S1": {"id": "S1", "name": "anno-label", "type": "text", "parentId": ROOT, "frameId": ROOT,
                    "x": FR["DTL"]["x"] + 390 + wa.GAP + wa.PAD, "y": 60, "width": 228, "height": 16,
                    "content": {"children": [{"text": "DTL 잔재"}]}}}
    objs2 = dict(objs, **stray)
    changes2, _ = run_render(objs2, SPECS, code="LIST", apply=False)
    check("S1" not in dels(changes2), "① 좌우 인접: 이웃 앵커의 loose 잔재를 삭제했다")


# ================================================================== ② 상하 인접(엇갈린 열 · 긴 패널)
def t_stacked():
    objs, ids, hs = build_page(["LIST", "RDR"])
    lf = frame_of(objs, "LIST")
    # 픽스처 유효성: LIST 패널이 아래 행(y=1000)까지 뻗을 만큼 길어야 재현이 성립한다.
    check(hs["LIST"] > 1000, f"② 픽스처: LIST 패널 높이가 아래 행을 덮어야 한다(h={hs['LIST']})")
    # 구 판정식이라면 RDR 패널이 지워졌다 — 이 테스트가 헛돌지 않음을 증명
    would = old_would_delete(objs, lf, fr_dicts(objs), ids["RDR"])
    check(len(would) > 0, "② 픽스처: 구 판정식에서 RDR 패널이 삭제되지 않는다면 재현이 아니다")
    changes, _out = run_render(objs, SPECS, code="LIST", apply=False)
    d = dels(changes)
    check(d & ids["RDR"] == set(), f"② 상하 인접: RDR 패널 객체가 삭제됐다 ({len(d & ids['RDR'])}개)")
    check(d == ids["LIST"], "② 상하 인접: 삭제 집합이 LIST 패널과 정확히 일치해야 한다")
    # 반대 방향(아래 화면 렌더 → 위 화면 무피해)
    changes2, _ = run_render(objs, SPECS, code="RDR", apply=False)
    d2 = dels(changes2)
    check(d2 & ids["LIST"] == set(), "② 상하 인접(역방향): LIST 패널 객체가 삭제됐다")
    check(d2 == ids["RDR"], "② 상하 인접(역방향): 삭제 집합이 RDR 패널과 정확히 일치해야 한다")


# ================================================================== ③ 자기 패널 교체(멱등)
def t_replace_own():
    objs, ids, _hs = build_page(["LIST"])
    before = sig(objs)
    changes, _out = run_render(objs, SPECS, code="LIST", apply=True)
    check(dels(changes) == ids["LIST"], "③ 교체: 기존 anno:LIST 그룹+자손을 정확히 지워야 한다")
    grp = [o for o in adds(changes) if o["type"] == "group" and o["name"] == "anno:LIST"]
    check(len(grp) == 1, f"③ 교체: 새 anno:LIST 그룹 1개를 그려야 한다({len(grp)})")
    codes = [o for o in adds(changes) if o.get("name") == "anno-code"]
    check(len(codes) == NEL["LIST"], f"③ 교체: 요소 수만큼 anno-code({NEL['LIST']}) — 실제 {len(codes)}")
    check(sig(objs) == before, "③ 교체: 같은 명세를 다시 렌더하면 결과가 동일해야 한다(멱등)")
    # 두 번째 렌더도 동일 결과(멱등 · 누적 없음)
    changes2, _ = run_render(objs, SPECS, code="LIST", apply=True)
    check(sig(objs) == before, "③ 교체: 2회차 렌더 후에도 결과 동일해야 한다(객체 누적 없음)")
    check(len(dels(changes2)) == len(ids["LIST"]), "③ 교체: 2회차도 자기 패널만 지워야 한다")


# ================================================================== ④ 불변식: 순차(--code) == 일괄(--all)
def t_invariant():
    base, ids, _hs = build_page(["LIST", "DTL", "RDR", "QA"])
    orig_ids = set(base.keys())

    seq = copy.deepcopy(base)
    for c in ("LIST", "DTL", "RDR", "QA"):
        run_render(seq, SPECS, code=c, apply=True)

    allr = copy.deepcopy(base)
    run_render(allr, SPECS, code=None, apply=True)

    check(sig(seq) == sig(allr),
          f"④ 불변식: 순차 렌더 결과 != 일괄 렌더 결과 (순차 {len(seq)}객체 / 일괄 {len(allr)}객체)")
    surv_seq, surv_all = orig_ids & set(seq.keys()), orig_ids & set(allr.keys())
    check(surv_seq == surv_all, "④ 불변식: 살아남은 **기존** 객체 집합이 두 경로에서 달라졌다")
    # 순서를 뒤집어도 같아야 한다(경로 무관)
    rev = copy.deepcopy(base)
    for c in ("QA", "RDR", "DTL", "LIST"):
        run_render(rev, SPECS, code=c, apply=True)
    check(sig(rev) == sig(allr), "④ 불변식: 역순 순차 렌더 결과가 일괄과 달라졌다")
    # 각 화면 패널이 정확히 1벌씩 남아야 한다(중복 누적 없음)
    for c in NEL:
        n = sum(1 for o in allr.values() if o.get("name") == f"anno:{c}")
        check(n == 1, f"④ 불변식: anno:{c} 그룹이 {n}개(1개여야 한다)")


# ================================================================== ⑤ 첫 렌더 + 이웃 레거시 loose 패널
def t_first_render_neighbor_loose():
    # LIST 는 패널 없음(첫 렌더) · RDR 은 **그룹 없는 레거시 패널**(소유권으로 못 막는 최악 조건)
    objs, ids, _hs = build_page([], loose=["RDR"])
    lf = frame_of(objs, "LIST")
    would = old_would_delete(objs, lf, fr_dicts(objs), ids["RDR"])
    check(len(would) > 0, "⑤ 픽스처: 구 판정식에서 RDR 레거시 패널이 지워지지 않으면 재현이 아니다")
    changes, _out = run_render(objs, SPECS, code="LIST", apply=False)
    d = dels(changes)
    check(d & ids["RDR"] == set(), f"⑤ 첫 렌더: 이웃 레거시 패널을 삭제했다 ({len(d & ids['RDR'])}개)")
    check(d == set(), f"⑤ 첫 렌더: 지울 자기 패널이 없으므로 삭제 0이어야 한다({len(d)})")
    check(len([o for o in adds(changes) if o.get("name") == "anno:LIST"]) == 1,
          "⑤ 첫 렌더: LIST 패널은 정상적으로 그려져야 한다")


# ================================================================== ⑥ 자기 레거시 loose 패널은 정리된다
def t_own_loose_cleaned():
    # 아래 행 없음(한 줄 배치 = AnyC 실물 형태) → 자기 레거시 패널은 꼬리까지 정리된다.
    objs, ids, hs = build_page([], loose=["LIST"], frames=("LIST", "DTL"))
    check(hs["LIST"] > 800, f"⑥ 픽스처: 레거시 패널이 프레임보다 길어야 한다(h={hs['LIST']})")
    changes, _out = run_render(objs, SPECS, code="LIST", apply=True)
    d = dels(changes)
    check(ids["LIST"] <= d, f"⑥ 레거시 정리: 자기 loose 패널을 전부 지워야 한다 "
                            f"(남김 {len(ids['LIST'] - d)}/{len(ids['LIST'])})")
    check(sum(1 for o in objs.values() if o.get("name") == "anno-bg") == 1,
          "⑥ 레거시 정리: anno-bg 가 1개만 남아야 한다(레거시 잔재 누적 없음)")


# ================================================================== ⑦ 긴 레거시 패널 역추출 무손실
def t_extract_not_truncated():
    objs, ids, _hs = build_page([], loose=["LIST"], frames=("LIST", "DTL"))
    lf = frame_of(objs, "LIST")
    texts, _stale = wa._anno_for_frame(objs, lf, fr_dicts(objs))
    _note, els = wa.extract_elements(texts)
    check(len(els) == NEL["LIST"], f"⑦ 역추출: 요소 {NEL['LIST']}개가 모두 복원돼야 한다(실제 {len(els)})")
    codes = [e["code"] for e in els]
    check(codes[-1] == f"LIST.{NEL['LIST']:02d}", f"⑦ 역추출: 마지막 요소까지 복원돼야 한다({codes[-1:]})")
    # 이웃 패널 텍스트가 섞여 들어오면 안 된다
    objs2, _ids2, _ = build_page(["RDR"], loose=["LIST"])
    texts2, _ = wa._anno_for_frame(objs2, frame_of(objs2, "LIST"), fr_dicts(objs2))
    check(all(not wa._text_of(o).startswith("RDR") for o in texts2),
          "⑦ 역추출: 이웃(RDR) 패널 텍스트가 LIST 명세로 섞여 들어왔다")


# ================================================================== ⑧ 겹치는 레거시 — 모호하면 남긴다
def t_ambiguous_overlap_is_kept():
    """레거시 loose 패널이 **아래 행 위로 물리적으로 겹쳐** 있으면, 겹친 꼬리는 소유가 모호하다.
    설계 규약(보수적): 이웃 침범 금지가 최우선 — 겹친 구간은 **지우지 않는다**(지우느니 남긴다).
    사람이 penpot 에서 정리하면 되지만, 지워진 남의 명세는 되살릴 수 없다."""
    objs, ids, hs = build_page([], loose=["LIST", "RDR"])
    check(hs["LIST"] > 1000, "⑧ 픽스처: LIST 레거시 패널이 아래 행과 겹쳐야 한다")
    changes, _out = run_render(objs, SPECS, code="LIST", apply=False)
    d = dels(changes)
    check(d & ids["RDR"] == set(), f"⑧ 겹침: 아래 행 레거시 패널을 삭제했다({len(d & ids['RDR'])}개)")
    kept = ids["LIST"] - d
    check(0 < len(kept) < len(ids["LIST"]),
          f"⑧ 겹침: 이웃 행 위로 넘어간 꼬리만 남아야 한다(남김 {len(kept)}/{len(ids['LIST'])})")
    _owner, bands = wa._anno_ctx(objs, fr_dicts(objs))
    y_hi = bands[FR["LIST"]["id"]][3]
    check(y_hi < FR["RDR"]["y"], f"⑧ 겹침: LIST 밴드가 아래 행 상단 앞에서 끊겨야 한다(y_hi={y_hi})")
    rb = bands[FR["RDR"]["id"]]

    def _in(b, o):
        return b[0] <= o.get("x", 0) <= b[1] and b[2] <= o.get("y", 0) <= b[3]

    check(all(objs[i].get("y", 0) > y_hi or _in(rb, objs[i]) for i in kept),
          "⑧ 겹침: 남은 것은 밴드 밖(아래 행 위로 넘어감) 또는 아래 행 밴드와 겹치는 모호 구간이어야 한다")


def main():
    for t in (t_side_by_side, t_stacked, t_replace_own, t_invariant,
              t_first_render_neighbor_loose, t_own_loose_cleaned, t_extract_not_truncated,
              t_ambiguous_overlap_is_kept):
        t()
    print(f"test_wfanno_stale: {P} pass, {F} fail")
    return 1 if F else 0


if __name__ == "__main__":
    sys.exit(main())
