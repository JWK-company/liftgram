#!/usr/bin/env python3
"""wfanno `sync --force` 전달 회귀 테스트 (감사 H-6).

결함: `sync` 는 프레임마다 두 갈래로 흐른다 —
  ① 로컬 SAE 명세가 **있으면** render + PLM 본문 push   (`--force` 전달됨)
  ② 로컬 SAE 명세가 **없으면** extract(읽기전용) + PLM 본문 push (`--force` **누락**)
`--force` 의 뜻은 "PLM 본문이 이미 리치여도 덮어쓴다" 하나뿐인데, ②로 흐른 화면만 조용히
비파괴로 남아 **같은 한 줄의 명령이 화면마다 다른 계약**을 따랐다. 사용자는 "--force 를 줬는데
어떤 화면은 안 덮였다"를 로그로 구분할 수 없다(둘 다 성공 출력).

이 파일이 고정하는 것:
  ① `sync --force` → 명세 **없는** 프레임(extract 갈래)의 push 에도 force=True 가 도달
  ② `sync --force` → 명세 **있는** 프레임(render 갈래)도 종전대로 force=True
  ③ `--force` 없으면 두 갈래 모두 force=False (비파괴 기본값 유지 — 과잉 수정 방지)
  ④ `extract --force` 서브커맨드도 종전대로 전달
  ⑤ `--force` 는 push **여부**를 바꾸지 않는다 — 사본 페이지 가드(W10)를 뚫지 못한다

네트워크 없음 — penpot RPC·PLM 전부 스텁.
"""
import contextlib
import copy
import importlib.util
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "scripts")
_s = importlib.util.spec_from_file_location("wa_force", os.path.join(SCRIPTS, "wfanno.py"))
wa = importlib.util.module_from_spec(_s)
_s.loader.exec_module(wa)
wfgen = wa.wfgen

ROOT = wa.ROOT_UUID
PID = "page-0001"
PID2 = "page-0002"

P = F = 0


def check(cond, msg):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print(f"  FAIL: {msg}")


# ---------------------------------------------------------------- 픽스처
# 프레임 2개: LIST(로컬 명세 있음 → render 갈래) · DTL(로컬 명세 없음 → extract 갈래).
# extract 갈래가 실제로 push 하려면 penpot 에 anno-* 패널이 있어야 한다(요소 0이면 skip).
def objects():
    o = {
        "F1": {"id": "F1", "name": "LIST 목록", "type": "frame", "parentId": ROOT, "frameId": ROOT,
               "x": 0, "y": 0, "width": 390, "height": 800, "shapes": []},
        "F2": {"id": "F2", "name": "DTL 상세", "type": "frame", "parentId": ROOT, "frameId": ROOT,
               "x": 900, "y": 0, "width": 390, "height": 800, "shapes": []},
    }
    # DTL 프레임 우측의 주석 패널(그룹 없는 레거시 배치 — extract 대상)
    px = 900 + 390 + 28
    o.update({
        "B1": {"id": "B1", "name": "anno-bg", "type": "rect", "parentId": ROOT, "frameId": ROOT,
               "x": px, "y": 0, "width": 330, "height": 200},
        "C1": {"id": "C1", "name": "anno-code", "type": "text", "parentId": ROOT, "frameId": ROOT,
               "x": px + 18, "y": 54, "width": 62, "height": 14,
               "content": {"children": [{"text": "DTL.01"}]}},
        "L1": {"id": "L1", "name": "anno-label", "type": "text", "parentId": ROOT, "frameId": ROOT,
               "x": px + 84, "y": 53, "width": 228, "height": 16,
               "content": {"children": [{"text": "잔액 카드  [card]"}]}},
        "S1": {"id": "S1", "name": "anno-state", "type": "text", "parentId": ROOT, "frameId": ROOT,
               "x": px + 84, "y": 70, "width": 228, "height": 16,
               "content": {"children": [{"text": "상태: 로딩/완료"}]}},
    })
    return o


def fake_file(page_ids):
    names = {PID: "Page 1", PID2: "Page 1 (copy)"}
    return {"revn": 7, "vern": 3,
            "data": {"pages": list(page_ids),
                     "pagesIndex": {pid: {"id": pid, "name": names[pid], "objects": copy.deepcopy(objects())}
                                    for pid in page_ids}}}


LIST_SPEC = {"name": "목록", "route": "/list", "note": "목록 화면", "covers": [],
             "elements": [{"code": "LIST.01", "label": "목록 카드", "type": "list",
                           "state": "로딩", "action": "탭", "effect": "상세로 이동"}]}


def run(argv, page_ids=(PID,), roles=()):
    """wfanno CLI 를 in-process 실행 → _plm_push_doc 호출 목록 [(code, force)].

    스텁은 **kwargs 까지** 받는다 — 기존 러너(test_wfanno_page)가 위치인자만 모아서
    `force` 누락을 구조적으로 못 보던 것이 이 결함이 오래 숨은 이유다."""
    pushes = []

    def fake_push(cfg, project, code, frame_name, loc, spec, dry, force=False):
        pushes.append((code, force))
        return "ok"

    old = (wfgen.get_file, wfgen.penpot_rpc, wa._resolve_ctx, wa._find_files,
           wa.load_sae_spec, wa._plm_push_doc, wa.fetch_page_roles, sys.argv)
    wfgen.get_file = lambda base, tok, fid: fake_file(page_ids)
    wfgen.penpot_rpc = lambda base, tok, cmd, body=None: {"revn": 8}
    wa._resolve_ctx = lambda po, so: ({"penpot_api": "https://x", "penpot_token": "tok",
                                       "plm_api": "https://p", "plm_token": "ptok",
                                       "project": "T", "ouro": None}, "T", None)
    wa._find_files = lambda base, tok, project, fo: [("FILE-1", "와이어프레임")]
    # LIST 만 로컬 명세 보유 → DTL 은 extract 갈래로 흐른다.
    wa.load_sae_spec = lambda d, code: (copy.deepcopy(LIST_SPEC) if code == "LIST" else None)
    wa._plm_push_doc = fake_push
    wa.fetch_page_roles = (lambda cfg, project: (None, "조회 실패(스텁)")) if roles is None \
        else (lambda cfg, project: (list(roles), None))
    try:
        sys.argv = argv
        with contextlib.redirect_stdout(io.StringIO()):
            try:
                wa.main()
            except SystemExit:
                pass
    finally:
        (wfgen.get_file, wfgen.penpot_rpc, wa._resolve_ctx, wa._find_files,
         wa.load_sae_spec, wa._plm_push_doc, wa.fetch_page_roles, sys.argv) = old
    return pushes


# ================================================================ 0. 픽스처 전제 — 두 갈래가 모두 push 한다
base = dict(run(["wfanno", "sync", "--project", "T"]))
check(set(base) == {"LIST", "DTL"},
      f"전제: 명세 있는 LIST(render 갈래)·없는 DTL(extract 갈래) 둘 다 PLM push — 실제 {sorted(base)}")

# ================================================================ 1. H-6 — sync --force 가 extract 갈래까지 간다
forced = dict(run(["wfanno", "sync", "--project", "T", "--force"]))
check(forced.get("DTL") is True,
      f"H-6: `sync --force` 가 **명세 없는 프레임**(extract 갈래)의 PLM push 에 도달 — 실제 force={forced.get('DTL')!r}")
check(forced.get("LIST") is True,
      f"H-6: render 갈래도 종전대로 force 전달 — 실제 force={forced.get('LIST')!r}")
check(set(forced.values()) == {True},
      f"H-6: 한 명령의 두 갈래가 같은 계약을 따른다(화면마다 다르지 않다) — 실제 {forced}")

# ================================================================ 2. 기본값은 여전히 비파괴
check(base.get("DTL") is False and base.get("LIST") is False,
      f"`--force` 없으면 두 갈래 모두 비파괴(force=False) — 실제 {base}")

# ================================================================ 3. extract 서브커맨드(회귀 없음)
ex = dict(run(["wfanno", "extract", "--project", "T", "--force"]))
check(ex.get("DTL") is True, f"extract --force: 종전대로 전달 — 실제 {ex}")
ex0 = dict(run(["wfanno", "extract", "--project", "T"]))
check(ex0.get("DTL") is False, f"extract(기본): 비파괴 — 실제 {ex0}")

# ================================================================ 4. --force 는 가드를 뚫지 않는다 (W10)
#   force 는 "이미 리치인 본문을 덮어쓸지"만 정한다. **어느 페이지에서 쓰는지**의 판정(사본=정본 쓰기 금지)은
#   별개이며 force 로 우회되면 안 된다 — 그러면 이번 수정이 W10 을 되돌리는 셈이 된다.
copy_roles = [{"id": 1, "project_id": "T", "penpot_file_id": "FILE-1", "page_id": PID2,
               "role": "working", "src_page_id": PID, "closed_at": None, "promoted_at": None}]
guarded = run(["wfanno", "sync", "--project", "T", "--page", PID2, "--force"], (PID, PID2), roles=copy_roles)
check(guarded == [],
      f"W10: 사본 페이지에서는 `--force` 를 줘도 PLM 정본 push 0회 — 실제 {guarded}")

print(f"test_wfanno_force: {P} pass, {F} fail")
sys.exit(1 if F else 0)
