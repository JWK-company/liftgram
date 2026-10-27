#!/usr/bin/env python3
"""wfanno.py 페이지 스코핑 회귀 테스트 (QA A5 — 원본 페이지 주석 패널 삭제 결함).

재현 조건: penpot 파일에 페이지가 2개 이상이고 한쪽이 다른 쪽의 **복제**(shape id 100% 동일).
과거 `_load_file` 이 전 페이지 objects 를 하나의 dict 로 병합해 `obj_page[oid]` 가 마지막 페이지로
덮였고, render/sync 의 `del-obj` 가 **엉뚱한 페이지의 anno:<CODE> 그룹을 삭제**했다.

검증:
  ① 단일 페이지 파일 → --page 없이 기존과 동일하게 동작(그 페이지에만 del/add).
  ② 다중 페이지 파일 + --page 없음 → **실행 거부**(update-file 0회 · PLM push 0회).
  ③ --page 지정 → 그 페이지만 읽고 그 페이지에만 del-obj/add-obj 가 나간다(반대 페이지 무접촉).
네트워크 없음 — penpot RPC 는 전부 스텁. 라이브 penpot 파일은 건드리지 않는다.
"""
import argparse  # noqa: F401  (main() 이 사용 · import 순서 명시용)
import copy
import importlib.util
import io
import contextlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "scripts")
spec = importlib.util.spec_from_file_location("wa", os.path.join(SCRIPTS, "wfanno.py"))
wa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wa)
wfgen = wa.wfgen

ROOT = wa.ROOT_UUID
P1, P2 = "page-aaaa-0001", "page-bbbb-0002"      # P2 = P1 의 복제(같은 shape id)

P = F = 0


def check(cond, msg):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print(f"  FAIL: {msg}")


# ---------------------------------------------------------------- 픽스처
def page_objects():
    """프레임 `LIST 목록` + 기존 주석 패널 그룹 `anno:LIST`(bg/code/label). 복제 페이지도 **같은 id**."""
    return {
        "F1": {"id": "F1", "name": "LIST 목록", "type": "frame", "parentId": ROOT, "frameId": ROOT,
               "x": 0, "y": 0, "width": 390, "height": 800, "shapes": []},
        "G1": {"id": "G1", "name": "anno:LIST", "type": "group", "parentId": ROOT, "frameId": ROOT,
               "x": 418, "y": 0, "width": 330, "height": 200, "shapes": ["A1", "A2", "A3"]},
        "A1": {"id": "A1", "name": "anno-bg", "type": "rect", "parentId": "G1", "frameId": ROOT,
               "x": 418, "y": 0, "width": 330, "height": 200},
        "A2": {"id": "A2", "name": "anno-code", "type": "text", "parentId": "G1", "frameId": ROOT,
               "x": 436, "y": 54, "width": 62, "height": 14,
               "content": {"children": [{"text": "E1"}]}},
        "A3": {"id": "A3", "name": "anno-label", "type": "text", "parentId": "G1", "frameId": ROOT,
               "x": 502, "y": 53, "width": 228, "height": 16,
               "content": {"children": [{"text": "목록 카드  [list]"}]}},
    }


def fake_file(page_ids):
    names = {P1: "Page 1", P2: "Page 1 (copy)"}
    return {"revn": 7, "vern": 3,
            "data": {"pages": list(page_ids),
                     "pagesIndex": {pid: {"id": pid, "name": names[pid], "objects": copy.deepcopy(page_objects())}
                                    for pid in page_ids}}}


SPEC = {"name": "목록", "route": "/list", "note": "화면 설명", "covers": [],
        "elements": [{"code": "E1", "label": "목록 카드", "type": "list",
                      "state": "로딩", "action": "탭", "effect": "상세로 이동"}]}


LAST_EXIT = None   # run() 이 잡은 sys.exit 코드(가드 중단 검증용 · None = 정상 종료)


def run(argv, page_ids, spec_or_none=SPEC, roles=()):
    """wfanno CLI 를 in-process 실행 → (stdout, 전송된 update-file body 목록, PLM push 횟수).

    `roles` = 역할 대장 스텁(감사 W10). 기본 `()` = 빈 대장 = **모든 페이지가 정본**(기존 동작 보존).
    `None` 을 주면 대장 **조회 실패**를 흉내낸다(정본임을 증명할 수 없는 상태)."""
    global LAST_EXIT
    sent, pushes = [], []
    LAST_EXIT = None

    def fake_rpc(base, tok, cmd, body=None):
        sent.append((cmd, body or {}))
        return {"revn": 8}

    old = (wfgen.get_file, wfgen.penpot_rpc, wa._resolve_ctx, wa._find_files,
           wa.load_sae_spec, wa._plm_push_doc, wa.fetch_page_roles, sys.argv)
    wfgen.get_file = lambda base, tok, fid: fake_file(page_ids)
    wfgen.penpot_rpc = fake_rpc
    wa._resolve_ctx = lambda po, so: ({"penpot_api": "https://x", "penpot_token": "tok",
                                       "plm_api": "https://p", "plm_token": "ptok",
                                       "project": "T", "ouro": None}, "T", None)
    wa._find_files = lambda base, tok, project, fo: [("FILE-1", "와이어프레임")]
    wa.load_sae_spec = lambda d, code: (copy.deepcopy(spec_or_none) if spec_or_none else None)
    wa._plm_push_doc = lambda *a, **k: (pushes.append(a) or "ok")
    wa.fetch_page_roles = (lambda cfg, project: (None, "사본 상태 조회 실패(스텁)")) if roles is None \
        else (lambda cfg, project: (list(roles), None))
    buf = io.StringIO()
    try:
        sys.argv = argv
        with contextlib.redirect_stdout(buf):
            try:
                wa.main()
            except SystemExit as e:      # 가드 중단(exit 3) — 테스트는 계속 진행한다
                LAST_EXIT = e.code
    finally:
        (wfgen.get_file, wfgen.penpot_rpc, wa._resolve_ctx, wa._find_files,
         wa.load_sae_spec, wa._plm_push_doc, wa.fetch_page_roles, sys.argv) = old
    updates = [b for c, b in sent if c == "update-file"]
    return buf.getvalue(), updates, len(pushes)


def working_row(page, src=None, **over):
    """역할 대장 1행(작업용 사본)."""
    r = {"id": 1, "project_id": "T", "penpot_file_id": "FILE-1", "page_id": page, "role": "working",
         "src_page_id": src, "closed_at": None, "promoted_at": None}
    r.update(over)
    return r


def page_ids_of(changes):
    return {c.get("pageId") for c in changes}


# ================================================================ 0. 로더: 페이지 병합 금지
wfgen_get_file_orig = wfgen.get_file
wfgen.get_file = lambda base, tok, fid: fake_file([P1, P2])
revn, vern, pages = wa._load_pages("b", "t", "FILE-1")
wfgen.get_file = wfgen_get_file_orig

check(len(pages) == 2, f"_load_pages: 페이지 2개 유지(병합 금지) — 실제 {len(pages)}")
check([p[0] for p in pages] == [P1, P2], "_load_pages: data.pages 순서 보존")
check(all("F1" in p[2] and "G1" in p[2] for p in pages), "_load_pages: 같은 shape id 가 두 페이지에 각각 살아있다")
check(pages[0][2] is not pages[1][2], "_load_pages: 페이지별 objects dict 분리")
check((revn, vern) == (7, 3), "_load_pages: revn/vern 전달")

# ================================================================ 1. _select_page 규칙
check(wa._select_page([(P1, "Page 1", {})], None)[0] == P1, "_select_page: 단일 페이지 + 미지정 → 그 페이지")
pid, _n, _o, err = wa._select_page(pages, None)
check(pid is None and err and "--page" in err, "_select_page: 다중 페이지 + 미지정 → 거부")
check(wa._select_page(pages, P2)[0] == P2, "_select_page: 페이지 id 지정")
check(wa._select_page(pages, "Page 1 (copy)")[0] == P2, "_select_page: 페이지 이름 지정")
check(wa._select_page(pages, "page 1")[0] == P1, "_select_page: 이름 대소문자 무시")
check(wa._select_page(pages, "없는페이지")[3] is not None, "_select_page: 미존재 이름 → 오류")
dup = [(P1, "같은이름", {}), (P2, "같은이름", {})]
check(wa._select_page(dup, "같은이름")[3] is not None, "_select_page: 이름 중복 → id 요구 오류")
check(wa._select_page([], None)[3] is not None, "_select_page: 페이지 0개 → 오류")

# ================================================================ 2. render — 단일 페이지(기존 동작 보존)
out, updates, _p = run(["wfanno", "render", "--project", "T"], [P1])
check(len(updates) == 1, f"render/단일: update-file 1회 — 실제 {len(updates)}")
ch = updates[0]["changes"] if updates else []
dels = [c for c in ch if c.get("type") == "del-obj"]
adds = [c for c in ch if c.get("type") == "add-obj"]
check({c["id"] for c in dels} == {"G1", "A1", "A2", "A3"}, "render/단일: 기존 anno 그룹 전체가 stale")
check(page_ids_of(ch) == {P1}, f"render/단일: 모든 change 가 그 페이지 — 실제 {page_ids_of(ch)}")
check(len(adds) > 0, "render/단일: 패널 재생성 add-obj 존재")

# ================================================================ 3. render — 다중 페이지 + --page 없음 → 실행 거부
out, updates, _p = run(["wfanno", "render", "--project", "T"], [P1, P2])
check(len(updates) == 0, "render/다중·미지정: **update-file 0회**(원본 패널 삭제 차단)")
check("실행 거부" in out and "--page" in out, "render/다중·미지정: 거부 사유 + --page 안내 출력")
check(P1 in out and P2 in out, "render/다중·미지정: 페이지 목록(id) 안내")

# ================================================================ 4. render — --page 지정 시 그 페이지에만
for target, other in ((P2, P1), (P1, P2)):
    out, updates, _p = run(["wfanno", "render", "--project", "T", "--page", target], [P1, P2])
    ch = updates[0]["changes"] if updates else []
    check(len(updates) == 1, f"render/--page {target}: update-file 1회")
    check(page_ids_of(ch) == {target}, f"render/--page {target}: 모든 change pageId={target} — 실제 {page_ids_of(ch)}")
    check(other not in {c.get('pageId') for c in ch}, f"render/--page {target}: 반대 페이지({other}) 무접촉")
    check({c["id"] for c in ch if c.get("type") == "del-obj"} == {"G1", "A1", "A2", "A3"},
          f"render/--page {target}: 삭제 대상은 그 페이지의 anno 그룹")

# 이름으로 지정해도 동일
out, updates, _p = run(["wfanno", "render", "--project", "T", "--page", "Page 1 (copy)"], [P1, P2])
check(updates and page_ids_of(updates[0]["changes"]) == {P2}, "render/--page 이름: 복제 페이지에만 반영")

# ================================================================ 5. sync — 같은 규칙(+ PLM push 도 차단)
out, updates, pushes = run(["wfanno", "sync", "--project", "T"], [P1, P2])
check(len(updates) == 0, "sync/다중·미지정: update-file 0회")
check(pushes == 0, "sync/다중·미지정: PLM 본문 push 0회(정본 문서 보호)")
check("실행 거부" in out, "sync/다중·미지정: 거부 출력")

out, updates, pushes = run(["wfanno", "sync", "--project", "T", "--page", P1], [P1, P2])
check(len(updates) == 1 and page_ids_of(updates[0]["changes"]) == {P1}, "sync/--page: 지정 페이지에만 커밋")
check(pushes == 1, "sync/--page: PLM push 는 정상 수행")

out, updates, pushes = run(["wfanno", "sync", "--project", "T"], [P1])
check(len(updates) == 1 and page_ids_of(updates[0]["changes"]) == {P1}, "sync/단일: 기존 동작 보존")

# ================================================================ 6. extract — 읽기전용이지만 명세·PLM 을 덮으므로 동일 가드
out, updates, pushes = run(["wfanno", "extract", "--project", "T"], [P1, P2], spec_or_none=None)
check(len(updates) == 0 and pushes == 0, "extract/다중·미지정: 명세·PLM 쓰기 0(어느 페이지가 정본인지 미확정)")
check("실행 거부" in out, "extract/다중·미지정: 거부 출력")

out, updates, pushes = run(["wfanno", "extract", "--project", "T", "--page", P2, "--sae-dir", "/dev/null/x"],
                           [P1, P2], spec_or_none=None)
check(len(updates) == 0, "extract/--page: penpot 쓰기 0(읽기전용 유지)")
check(pushes == 1, "extract/--page: 지정 페이지의 패널을 PLM 본문으로 push")

# ================================================================ 7. 감사 W10 — sync/extract 역할 가드
#
# 결함: C1 가드(`--expect-page-role`)가 **render 에만** 있었다. 정작 PLM 정본 본문을 쓰는 것은
# sync/extract 인데 이 둘은 역할 대장을 한 번도 조회하지 않아,
#   wfanno.py sync --project P --page <사본페이지>
# 한 줄로 사본 내용이 정본 문서에 올라갔다(유일한 방어가 지시문 텍스트였다).
COPY_ROLES = [working_row(P2, src=P1)]

out, updates, pushes = run(["wfanno", "sync", "--project", "T", "--page", P2], [P1, P2], roles=COPY_ROLES)
check(pushes == 0, "W10/sync 사본 페이지: **PLM 정본 본문 push 0회**(예전엔 그대로 올라갔다)")
check(len(updates) == 1 and page_ids_of(updates[0]["changes"]) == {P2},
      "W10/sync 사본 페이지: penpot 렌더는 그대로(사본 모드의 본체라 막으면 안 된다)")
check("생략" in out, "W10/sync 사본 페이지: 무엇을 건너뛰었는지 출력에 남는다")

out, updates, pushes = run(["wfanno", "extract", "--project", "T", "--page", P2, "--sae-dir", "/dev/null/x"],
                           [P1, P2], spec_or_none=None, roles=COPY_ROLES)
check(pushes == 0, "W10/extract 사본 페이지: PLM 정본 본문 push 0회")

out, updates, pushes = run(["wfanno", "sync", "--project", "T", "--page", P1], [P1, P2], roles=COPY_ROLES)
check(pushes == 1, "W10/sync 정본 페이지: 정상 push(정상 절차를 막지 않는다)")

# 대장 조회 실패 + 페이지 2개↑ = 정본임을 증명할 수 없다 → 정본 쓰기만 생략(wfscan G4와 같은 규약).
out, updates, pushes = run(["wfanno", "sync", "--project", "T", "--page", P1], [P1, P2], roles=None)
check(pushes == 0, "W10/대장 조회 실패 + 다중 페이지: PLM push 0회(증명 불가 → 안전 실패)")
check(len(updates) == 1, "W10/대장 조회 실패: penpot 렌더는 계속된다(파일 전체를 죽이지 않는다)")
out, updates, pushes = run(["wfanno", "sync", "--project", "T"], [P1], roles=None)
check(pushes == 1, "W10/대장 조회 실패 + 단일 페이지: 사본이 있을 수 없으므로 정상 push")

# `--expect-page-role` 이 sync/extract 에도 붙는다 — 기대와 다르면 아무것도 쓰지 않고 exit 3.
out, updates, pushes = run(["wfanno", "sync", "--project", "T", "--page", P2, "--expect-page-role", "canonical"],
                           [P1, P2], roles=COPY_ROLES)
check(LAST_EXIT == 3, f"W10/expect 불일치: exit 3 — 실제 {LAST_EXIT}")
check(pushes == 0 and len(updates) == 0, "W10/expect 불일치: penpot·PLM 모두 무접촉")
check("⛔ 중단" in out, "W10/expect 불일치: 중단 사유 출력")

out, updates, pushes = run(["wfanno", "sync", "--project", "T", "--page", P1, "--expect-page-role", "canonical"],
                           [P1, P2], roles=COPY_ROLES)
check(LAST_EXIT is None and pushes == 1, "W10/expect 일치: 정상 수행")

check(wa.expect_matches("promoted", "canonical"), "W10/expect: 승격된 사본(promoted)도 canonical 로 본다")
check(not wa.expect_matches("promoting", "canonical"), "W10/expect: 중단된 승격은 canonical 이 아니다")
check(wa.expect_matches("working", "working") and not wa.expect_matches("canonical", "working"),
      "W10/expect: working 기대는 그대로")

# ================================================================ 8. 감사 W11 — 사본 작업의 SAE 명세는 스테이징으로
#
# 결함: 사본 모드 지시문이 `.ouroboros/docs/wireframes/WF-<CODE>.json`(SSOT)을 고치고 **커밋**시켜,
# 승격 없이도 정본이 갱신될 수 있었다(이후 wfscan 이 그 명세로 정본 PLM 본문을 보강하거나,
# 사본을 버려 단일 페이지가 되면 다음 render 가 정본 penpot 페이지에 그대로 그린다).
check(wa.stage_dir_for("/x/docs/wireframes", P2) == os.path.join("/x/docs/wireframes", ".working", P2),
      "W11/스테이징 경로 = 정본 디렉터리 안의 `.working/<사본페이지>`")
check(wa.stage_dir_for(None, P2) is None and wa.stage_dir_for("/x", None) is None,
      "W11/스테이징 경로: 근거가 없으면 None(추측하지 않는다)")


def stage_apply(page, roles, stage_files=("WF-LIST.json",), extra=()):
    """stage-apply 를 임시 디렉터리에서 실행 → (stdout, exit, 정본 디렉터리 파일 목록)."""
    import tempfile
    global LAST_EXIT
    LAST_EXIT = None
    with tempfile.TemporaryDirectory() as tmp:
        sae = os.path.join(tmp, "wireframes")
        stage = os.path.join(sae, ".working", page)
        os.makedirs(stage, exist_ok=True)
        for nm in stage_files:
            with open(os.path.join(stage, nm), "w", encoding="utf-8") as f:
                f.write('{"code":"WF-LIST"}')
        old = (wa._resolve_ctx, wa.fetch_page_roles, sys.argv)
        wa._resolve_ctx = lambda po, so: ({"plm_api": "https://p", "plm_token": "ptok"}, "T", sae)
        wa.fetch_page_roles = (lambda cfg, project: (None, "조회 실패(스텁)")) if roles is None \
            else (lambda cfg, project: (list(roles), None))
        buf = io.StringIO()
        try:
            sys.argv = ["wfanno", "stage-apply", "--project", "T", "--page", page, *extra]
            with contextlib.redirect_stdout(buf):
                try:
                    wa.main()
                except SystemExit as e:
                    LAST_EXIT = e.code
        finally:
            (wa._resolve_ctx, wa.fetch_page_roles, sys.argv) = old
        landed = sorted(f for f in os.listdir(sae) if f.endswith(".json"))
        return buf.getvalue(), LAST_EXIT, landed


out, code, landed = stage_apply(P2, COPY_ROLES)
check(code == 3 and landed == [], "W11/승격 전 stage-apply: 중단(exit 3) · 정본 명세 무접촉")
check("승격" in out, "W11/승격 전: 승격이 반영 시점이라고 말해 준다")

promoted_roles = [{"id": 2, "penpot_file_id": "FILE-1", "page_id": P1, "role": "archived",
                   "src_page_id": P2, "promoted_at": "2026-07-31T01:00:00Z", "closed_at": None}]
out, code, landed = stage_apply(P2, promoted_roles)
check(code is None and landed == ["WF-LIST.json"], f"W11/승격 후 stage-apply: 정본 명세로 반영 — 실제 {landed}")

out, code, landed = stage_apply(P2, None)
check(code == 3 and landed == [], "W11/대장 조회 실패: 반영하지 않는다(안전 실패)")

out, code, landed = stage_apply(P2, COPY_ROLES, extra=["--dry-run", "--force"])
check(code is None and landed == [], "W11/--dry-run: 무엇을 옮길지 보여주기만 한다")

# ── 감사 X3(R3 높음): `[보관 완료]`(closed_at) 뒤에도 반영 경로가 살아 있어야 한다 ────────────
#
# `close`는 되돌리기 창을 닫을 뿐 "승격됐다"는 사실을 취소하지 않는다. 예전엔 `page_role_of`가
# `closed_at` 행을 통째로 걸러내 승격된 정본을 `canonical`로 읽었고, `stage-apply`는 `promoted`가
# 아니면 exit 3 → **승격이 끝났는데 도구가 아니라고 말하는** 데드엔드였다(남는 길은 `--force`).
closed_roles = [{"id": 2, "penpot_file_id": "FILE-1", "page_id": P1, "role": "archived",
                 "src_page_id": P2, "promoted_at": "2026-07-31T01:00:00Z",
                 "closed_at": "2026-07-31T02:00:00Z"}]
check(wa.page_role_of(closed_roles, P2) == "promoted", "X3/마감된 승격도 promoted로 읽는다")
check(wa.page_role_of(closed_roles, P1) == "canonical",
      "X3/마감된 보관본 페이지 자신은 살아 있는 행이 아니다(직접 일치 갈래는 종전대로)")
out, code, landed = stage_apply(P2, closed_roles)
check(code is None and landed == ["WF-LIST.json"],
      f"X3/[보관 완료] 뒤에도 stage-apply가 동작한다(--force 불필요) — 실제 {landed}")
# 감사 X4 — 마무리 안내가 `--page`를 반드시 달고 나온다(안 그러면 sync가 항상 실행 거부된다).
check("sync --project T --page " + P2 in out, f"X4/마무리 안내에 --page가 있다 — 실제:\n{out}")

# 마감된 **사본**(working) 행은 여전히 살아 있는 사본이 아니다 — 과잉 확장 방지.
closed_working = [{"id": 3, "penpot_file_id": "FILE-1", "page_id": P2, "role": "working",
                   "src_page_id": P1, "promoted_at": None, "closed_at": "2026-07-31T02:00:00Z"}]
check(wa.page_role_of(closed_working, P2) == "canonical", "X3/마감된 working 행은 사본으로 안 친다")

print(f"test_wfanno_page: {P} pass, {F} fail")
sys.exit(1 if F else 0)
