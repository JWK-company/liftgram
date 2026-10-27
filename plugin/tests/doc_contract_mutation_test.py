#!/usr/bin/env python3
"""doc_contract_check.py 변이 테스트 — **게이트가 실제로 잡는가**를 증명한다.

게이트를 만들고 "통과했으니 됐다"고 넘어가면, 아무것도 검사하지 않는 게이트도 통과한다.
(오늘 감사의 사고 ①이 정확히 그 형태였다 — 게이트가 있었으나 실제 구조를 몰라 무의미했다.)
그래서 계약을 **일부러 깨뜨린 픽스처 트리**를 만들어 4종 검사가 각각 그 위반을 잡아내는지,
그리고 정상 트리에선 조용한지(오탐 0)를 확인한다.

실행:  python3 plugin/tests/doc_contract_mutation_test.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CHECKER = os.path.join(HERE, "doc_contract_check.py")

# ── 정상(baseline) 픽스처 — 계약이 맞는 최소 트리 ────────────────────────────────
BASE = {
    "plm-hub/scripts/wfanno.py": (
        "import sys\n"
        "def main():\n"
        "    argv = sys.argv[1:]\n"
        "    cmd = argv[0]\n"
        "    if cmd == 'render': pass\n"
        "    if cmd == 'stage-apply': pass\n"
        "    page = '--page' in argv\n"
        "    proj = '--project' in argv\n"
    ),
    "plm-hub/commands/wfanno.md": (
        "# wfanno\n"
        "```bash\n"
        "python3 scripts/wfanno.py render --project <P> --page <PG>\n"
        "python3 scripts/wfanno.py stage-apply --project <P>\n"
        "```\n"
        "연계: /plm-hub:wfscan\n"
    ),
    "plm-hub/commands/wfscan.md": "# wfscan\n",
    "plm-hub/hooks/hooks.json": json.dumps({
        "hooks": {"Stop": [{"matcher": "", "hooks": [
            {"type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/hooks/plm-gate.sh"}]}]}
    }),
    "plm-hub/hooks/plm-gate.sh": "#!/usr/bin/env bash\nexit 0\n",
    "plm-hub/.claude-plugin/plugin.json": json.dumps({
        "name": "plm-hub", "version": "0.0.0",
        "description": "테스트용. 명령: plm-hub:wfanno/wfscan. 설계: HOOKS.md.",
    }, ensure_ascii=False),
}

# 픽스처에 맞춘 소유표/면제표 오버라이드
OWNER_PATCH = "OWNER_DOCS = {'plm-hub/scripts/wfanno.py': ['plm-hub/commands/wfanno.md']}"

# ── 변이 목록: (이름, 파일 조작, 기대 검사코드) ──────────────────────────────────
MUTATIONS = [
    ("A 옛 계약 — 문서가 없는 옵션을 지시",
     lambda t: _append(t, "plm-hub/commands/wfanno.md",
                       "python3 scripts/wfanno.py render --project <P> --expect-page-role canonical\n"),
     "[A"),
    ("A 옛 계약 — 문서가 사라진 스크립트 옵션을 지시",
     lambda t: _write(t, "plm-hub/commands/wfanno.md",
                      "python3 scripts/wfanno.py render --project <P> --page <PG> --force\n"
                      "python3 scripts/wfanno.py stage-apply --project <P>\n"),
     "[A"),
    ("B 미고지 — 코드에 새 옵션이 생겼는데 문서가 모른다",
     lambda t: _append(t, "plm-hub/scripts/wfanno.py", "    role = '--expect-page-role' in argv\n"),
     "[B"),
    ("B 미고지 — 코드에 새 서브명령이 생겼는데 문서가 모른다",
     lambda t: _append(t, "plm-hub/scripts/wfanno.py", "    if cmd == 'page-role': pass\n"),
     "[B"),
    ("C 죽은 등록 — hooks.json이 없는 훅 파일을 가리킨다",
     lambda t: os.remove(os.path.join(t, "plm-hub/hooks/plm-gate.sh")),
     "[C"),
    ("C 미등록 — 훅 파일이 있는데 hooks.json에 없다(영원히 실행 안 됨)",
     lambda t: _write(t, "plm-hub/hooks/plm-idle.sh", "#!/usr/bin/env bash\nexit 0\n"),
     "[C"),
    ("D 없는 스킬 — 사라진 명령을 안내한다",
     lambda t: _append(t, "plm-hub/commands/wfanno.md", "먼저 /plm-hub:wfsync 를 실행하세요.\n"),
     "[D"),
    ("E 미고지 — 새 스킬을 추가했는데 매니페스트가 모른다(사용자가 발견 못 함)",
     lambda t: _write(t, "plm-hub/commands/wfgen.md", "# wfgen\n"),
     "[E"),
    ("E 유령명령 — 사라진 스킬을 매니페스트가 계속 광고한다",
     lambda t: os.remove(os.path.join(t, "plm-hub/commands/wfscan.md")),
     "[E"),
]


def _write(root, relp, text):
    p = os.path.join(root, relp)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(text)


def _append(root, relp, text):
    with open(os.path.join(root, relp), "a", encoding="utf-8") as fh:
        fh.write(text)


def build(tmp):
    root = os.path.join(tmp, "plugin")
    for relp, text in BASE.items():
        _write(root, relp, text)
    # 픽스처 전용 체커 사본(소유표만 픽스처에 맞게 치환 — 검사 로직은 원본 그대로)
    src = open(CHECKER, encoding="utf-8").read()
    start = src.index("OWNER_DOCS = {")
    end = src.index("}", src.index("plan/scripts/trace_validate.py")) + 1
    src = src[:start] + OWNER_PATCH + src[end:]
    src = src.replace("INTERNAL_FLAGS = {", "INTERNAL_FLAGS = {} or {", 1)
    src = src.replace("UNREGISTERED_HOOKS_OK = {", "UNREGISTERED_HOOKS_OK = {} or {", 1)
    shutil.copy(CHECKER, os.path.join(tmp, "_orig.py"))
    with open(os.path.join(tmp, "checker.py"), "w", encoding="utf-8") as fh:
        fh.write(src)
    return root


def run(tmp, root):
    env = dict(os.environ, DOC_CONTRACT_ROOT=root)
    r = subprocess.run([sys.executable, os.path.join(tmp, "checker.py")],
                       capture_output=True, text=True, env=env)
    return r.returncode, r.stdout + r.stderr


def main():
    fails = 0
    print("═══ 계약 게이트 변이 테스트 ═══")

    # 0) 정상 트리에서 조용한가 (오탐 0)
    with tempfile.TemporaryDirectory() as tmp:
        root = build(tmp)
        rc, out = run(tmp, root)
        if rc == 0:
            print("  ✓ 기준선(정상 계약) — 통과, 오탐 0")
        else:
            fails += 1
            print(f"  ✗ 기준선에서 오탐 발생 (rc={rc})\n{out}")

    # 1) 각 변이를 잡는가
    for name, mutate, want in MUTATIONS:
        with tempfile.TemporaryDirectory() as tmp:
            root = build(tmp)
            mutate(root)
            rc, out = run(tmp, root)
            if rc != 0 and want in out:
                print(f"  ✓ 잡음: {name}")
            else:
                fails += 1
                print(f"  ✗ 놓침: {name} (rc={rc}, 기대코드 {want})\n{out}")

    print("─────────────────────────────")
    if fails:
        print(f"❌ 변이 {fails}건을 게이트가 놓쳤다 — 게이트가 무의미하다.")
        return 1
    print(f"✅ 변이 {len(MUTATIONS)}종 전건 검출 + 오탐 0 — 게이트가 실제로 작동한다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
