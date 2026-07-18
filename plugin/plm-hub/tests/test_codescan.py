#!/usr/bin/env python3
"""plm_codescan.py 단위 테스트 — 심볼추출·slug·@plm파싱·포맷·GC 로직."""
import importlib.util, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("cs", os.path.join(HERE, "..", "scripts", "plm_codescan.py"))
cs = importlib.util.module_from_spec(spec); spec.loader.exec_module(cs)

P = F = 0
def check(cond, msg):
    global P, F
    if cond: P += 1
    else: F += 1; print(f"  FAIL: {msg}")

# --- next_symbol: 언어별 심볼 추출 ---
cases = [
    (["# @plm SRS-1", "class_name Combo", "extends RefCounted"], "Combo", "GDScript class_name"),
    (["# @plm SRS-1", "func attack(w: bool) -> int:"], "attack", "GDScript func"),
    (["// @plm SRS-1", "static func nearest(a, b):"], "nearest", "static func"),
    (["// @plm SRS-1", "class FooBar {"], "FooBar", "C++ class"),
    (["// @plm SRS-1", "void DoThing(int x) {"], "DoThing", "C++ method"),
    (["// @plm SRS-1", "fn handle_request(req: Req) -> Res {"], "handle_request", "Rust fn"),
    (["// @plm SRS-1", "def process_data(self):"], "process_data", "Python def"),
    (["// @plm SRS-1", "IMPLEMENT_MODULE(FX, Mod);"], "IMPLEMENT_MODULE", "UE 매크로(fallback)"),
    (["// @plm SRS-1", "void Cast(const FAIStimulus& s) {"], "Cast", "struct 파라미터 오인 방지(줄시작 앵커)"),
    # 회귀(SRS-023 사이클 발견): 후행 주석 텍스트(한글)·제어/대입문은 심볼로 오인하면 안 됨 → None(path:line만).
    (["# @plm SRS-1", "var _burn_dur := 3.0  # 화상 지속시간(초)"], None, "var 대입문 → None(필드)"),
    (["# @plm SRS-1", "for e in get_tree().get_nodes():"], None, "for 루프 → None(호출 오인 방지)"),
    (["# @plm SRS-1", "if e.take_hit(edmg):"], None, "if 호출문 → None"),
    (["# @plm SRS-1", "func ignite(d: float) -> void:  # 점화(초)"], "ignite", "후행 한글주석 무시 → func명"),
    (["# @plm SRS-1", "fetch(url)  // load http://x"], "fetch", "URL 후행주석 안전 스트립"),
]
for lines, exp, label in cases:
    check(cs.next_symbol(lines, 0) == exp, f"next_symbol {label}: 기대 {exp}, 실제 {cs.next_symbol(lines,0)}")

# --- slug ---
check(cs.slug("scripts/core/combo.gd") == "scripts-core-combo-gd", "slug 경로")
check(len(cs.slug("a/"*60)) <= 60, "slug 60자 제한")

# --- @plm REL 정규식: 단일/다중/설명 ---
m = cs.REL.search("# @plm SRS-001  피드 생성")
check(m and m.group(1).strip() == "SRS-001", "@plm 단일")
m = cs.REL.search("// @plm SRS-001, SAD-002  설명")
check(m and "SRS-001" in m.group(1) and "SAD-002" in m.group(1), "@plm 다중")
check(cs.CODE_ID.findall("SRS-1 SAD-22") == ["SRS-1", "SAD-22"], "CODE_ID 추출")

# --- EXTS / SKIP_DIRS ---
for e in [".gd", ".cs", ".rs", ".ts", ".cpp", ".html"]:
    check(e in cs.EXTS, f"EXTS 포함 {e}")
for d in [".godot", ".tools", "Intermediate", "Binaries", "plm-hub", "node_modules"]:
    check(d in cs.SKIP_DIRS, f"SKIP_DIRS 포함 {d}")

# --- LOC_RE: body 첫 줄 loc 경로 추출 ---
m = cs.LOC_RE.search("loc: `scripts/player.gd:18`")
check(m and m.group(1) == "scripts/player.gd", "LOC_RE 경로(라인 제외)")

# --- stale_codes: 스캔범위 내 사라진 Code만 GC ---
ex = {"artifacts": [
    {"code": "CODE-a-gone", "type": "Code", "status": "Draft", "body": "loc: `scripts/a.gd:1`"},
    {"code": "CODE-other", "type": "Code", "status": "Draft", "body": "loc: `far/b.gd:1`"},
    {"code": "CODE-sup", "type": "Code", "status": "Replaced", "body": "loc: `scripts/c.gd:1`"},
]}
stale = cs.stale_codes(ex, seen=set(), present={"scripts/x.gd"})  # present_dir=scripts
codes = {c for c, _, _ in stale}
check("CODE-a-gone" in codes, "GC: 스캔디렉토리 내 사라진 Code 포함")
check("CODE-other" not in codes, "GC: 다른 스코프 Code 보존")
check("CODE-sup" not in codes, "GC: 이미 Replaced 제외")

print(f"test_codescan: {P} pass, {F} fail")
sys.exit(1 if F else 0)
