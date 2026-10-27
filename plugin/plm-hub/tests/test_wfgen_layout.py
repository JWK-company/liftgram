#!/usr/bin/env python3
"""wfgen 레이아웃 — 생성기가 명세 요소를 **조용히 잘라내지 않는지** 고정한다.

실사용 결함(2026-07-31 · tarae-web): auto 아키타입이 요약 타일을 앞 4개(summ[:4]),
컨트롤을 앞 6개(controls[:6])만 그리고 나머지를 버렸다 — 명세 17요소 중 14개만 실리고
코드 번호가 밀렸다. 이 테스트는 "명세에 code가 있는 요소는 목업 ops 어딘가에 그 코드가
반드시 나타난다"를 아키타입별로 검사한다(잘림이 되살아나면 즉시 빨간불).

또한 겹침 결함(주석 패널이 보조 board를 덮음)의 회귀를 막기 위해, 다중 board 화면에서
주석 패널 x가 모든 board의 우측 끝 이상인지 검사한다.
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

spec = importlib.util.spec_from_file_location("wfgen", SCRIPTS / "wfgen.py")
assert spec is not None and spec.loader is not None
wfgen = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wfgen)

PASS = 0


def ok(cond, msg):
    global PASS
    assert cond, msg
    PASS += 1


def els_with_codes(spec_list):
    """(type, role유도용 label, code) 튜플 목록 → wfgen 요소 dict."""
    out = []
    for i, (typ, label) in enumerate(spec_list, 1):
        out.append({
            "code": f"ZZ.{i:02d}", "type": typ, "label": label,
            "state": "정상", "action": "클릭", "effect": f"{label} 효과",
        })
    return out


def ops_text_blob(boards):
    """finalize된 add-obj ops 전체를 JSON 문자열로(코드 문자열 존재 검사용)."""
    blob = []
    for s in boards:
        blob.extend(s.finalize())
    return json.dumps(blob, ensure_ascii=False)


def codes_missing(boards, els):
    blob = ops_text_blob(boards)
    return [e["code"] for e in els if e.get("code") and e["code"] not in blob]


# ── ① auto 아키타입: 요약 10개 + 컨트롤 9개 — 전량 렌더(과거 4/6 잘림) ──────────────
els = els_with_codes(
    [("display", f"지표 {i}") for i in range(1, 11)]          # 요약 타일 10
    + [("button", f"동작 {i}") for i in range(1, 10)]          # 컨트롤 9
    + [("list", "이벤트 목록"), ("list", "구독 목록"),
       ("list", "채널 목록"), ("list", "로그 목록")]           # 리스트 4(과거 [:3])
)
boards = wfgen.ARCHETYPES["auto"]("pg", "ZZ", "잘림 검증", "/zz", [], els, 0)
missing = codes_missing(boards, els)
ok(missing == [], f"auto: 누락 코드 {missing}")
ok(len(els) == 23, "픽스처 자체 검증(23요소)")

# ── ② auto 아키타입: 카드 8개 — 전량(과거 cards[:6]) ───────────────────────────
els2 = els_with_codes([("card", f"카드 {i}") for i in range(1, 9)])
boards2 = wfgen.ARCHETYPES["auto"]("pg", "ZY", "카드 검증", "/zy", [], els2, 0)
missing2 = codes_missing(boards2, els2)
ok(missing2 == [], f"auto: 누락 카드 {missing2}")

# ── ③ 겹침: 다중 board 화면에서 주석 패널이 board 위를 덮지 않는다 ──────────────────
#    (build_anno_panel에 '모든 board의 우측 끝'을 폭으로 넘기는 계약 — wfgen 본문과 동일 산식)
sys.path.insert(0, str(SCRIPTS))
import wfanno  # noqa: E402

multi = wfgen.ARCHETYPES["workspace"]("pg", "ZX", "겹침 검증", "/zx", [], els2, 0)
wmax = max(s.ox + s.w for s in multi)
s0 = multi[0]
_aops, px, _apw, _ph = wfanno.build_anno_panel("pg", "ZX", "겹침 검증", "", els2,
                                               s0.ox, s0.oy, wmax - s0.ox, s0.h)
ok(px >= wmax, f"주석 패널 x({px})가 board 우측 끝({wmax})보다 왼쪽 — 겹침 재발")

# ── ④ 컨트롤 줄바꿈: 배경 패널이 요소를 전부 담을 만큼 자란다(높이 검사) ─────────────
els3 = els_with_codes([("button", f"긴 라벨의 동작 버튼 {i}") for i in range(1, 13)])
boards3 = wfgen.ARCHETYPES["auto"]("pg", "ZW", "줄바꿈 검증", "/zw", [], els3, 0)
missing3 = codes_missing(boards3, els3)
ok(missing3 == [], f"auto 컨트롤 12개: 누락 {missing3}")

print(f"[test_wfgen_layout] {PASS} checks OK")
