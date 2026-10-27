#!/usr/bin/env python3
"""문서·지시문 ↔ 코드 계약 드리프트 게이트 (재발 방지 장치)

배경 — 2026-07-31 감사. 같은 유형의 사고가 하루에 세 번 났다.
  ① 버전 게이트를 만들었는데 **탐지가 실제 설치 구조를 몰라** 정상 사용자를 막을 뻔했다.
  ② 서버가 `recovering`·`cleanup_needed`를 주는데 **화면이 그 필드를 안 읽어** "정본"이라 단정했다.
  ③ 사본 제자리 수정을 열었는데 **세션 지시문은 "주석만 고쳐라"** 그대로였다.
전부 "구현은 앞서갔는데 그것을 **호출·안내하는 쪽**이 옛 계약에 머문 것"이다.
사람 리뷰로는 매번 놓친다 — 그래서 기계가 막는다.

검사 5종 (전부 근거는 파일:라인):
  A. 문서·지시문이 **없는** 스크립트/서브명령/플래그를 시킨다        (옛 계약 잔존)
  B. 스크립트가 **지원하는데** 소유 문서가 한 번도 안 알린다          (빠진 신규 기능)
  C. hooks.json 등록 ↔ 훅 파일 실존 불일치                          (죽은 등록·미등록 훅)
  D. 문서·지시문이 **없는** 스킬(/ns:name)을 가리킨다                 (사라진 명령)
  E. plugin.json '명령:' 목록 ↔ 실제 commands/*.md                   (발견 불가·유령 광고)

실행:  python3 plugin/tests/doc_contract_check.py
검출력 재증명: python3 plugin/tests/doc_contract_mutation_test.py  (변이 9종)
종료:  0=통과 / 1=위반. CI `template` 잡이 둘 다 돌린다.

주의(설계 의도):
  · CLAUDE.md §3.6 "코드 변경 보존 규칙"에 따라 relay/*.mjs 에는 [원본] 옛 지시문이 **주석으로**
    남는다. 그건 살아있는 계약이 아니므로 줄머리 주석(`//`·`*`)은 검사에서 제외한다.
    → 주석을 해제해 되살리는 순간 검사 대상이 되어, 옛 플래그를 쓰면 그때 잡힌다.
  · 새 플래그를 일부러 문서에 안 쓰는 경우(내부용)는 INTERNAL_FLAGS 에 **사유와 함께** 등재한다.
    등재를 강제함으로써 "그냥 잊어버림"과 "일부러 숨김"을 구분한다.
"""
import os
import re
import sys

# 기본은 이 파일 기준 plugin/. 변이 테스트(doc_contract_mutation_test.py)는 픽스처 트리를 가리킨다.
ROOT = os.environ.get("DOC_CONTRACT_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGINS = ("code", "plan", "plm-hub", "plm-channel")

# ── 소유 관계: 스크립트 → 그 사용법을 사람에게 알려야 하는 문서 ─────────────────
#    (여기 없는 스크립트는 훅 내부 전용 = 사용자가 직접 호출하지 않음)
OWNER_DOCS = {
    "plm-hub/scripts/wfanno.py":         ["plm-hub/commands/wfanno.md"],
    "plm-hub/scripts/wfgen.py":          ["plm-hub/commands/wfgen.md"],
    "plm-hub/scripts/wfscan.py":         ["plm-hub/commands/wfscan.md"],
    "plm-hub/scripts/sync_bulk.py":      ["plm-hub/commands/sync.md", "plm-hub/commands/pull.md"],
    "plm-hub/scripts/plm_agent.py":      ["plm-hub/commands/agent.md"],
    "plm-hub/scripts/plm_upload.py":     ["plm-hub/commands/upload.md"],
    "plm-hub/scripts/bpcheck.py":        ["plm-hub/commands/blueprint.md"],
    "plm-hub/scripts/plm_codescan.py":   ["plm-hub/commands/codescan.md"],
    "plm-hub/scripts/plm_token_issue.py": ["plm-hub/commands/link.md"],
    "code/scripts/plm_dag.py":           ["code/commands/autorun.md"],
    "plan/scripts/trace_validate.py":    ["plan/commands/trace.md"],
}

# ── 문서에 싣지 않는 플래그 — 반드시 사유를 적는다(사유 없는 등재 금지) ─────────
INTERNAL_FLAGS = {
    "plm-hub/scripts/plm_upload.py": {
        "--json": "훅·스크립트가 파싱용으로 쓰는 기계 출력 모드. 사람 흐름엔 불필요.",
    },
    "plm-hub/scripts/plm_codescan.py": {
        "--file": "plm-codesync 훅이 변경 파일 1건만 동기할 때 쓰는 내부 경로. 사람은 전체 스캔만 쓴다.",
    },
    "plan/scripts/trace_validate.py": {
        "--file": "trace-validator 훅이 변경 파일 1건을 검증할 때 쓰는 내부 경로.",
    },
}

# ── 등록하지 않는 훅 파일 — 반드시 사유를 적는다 ────────────────────────────────
UNREGISTERED_HOOKS_OK = {
    "plm-channel/hooks/plm-notify.sh": "의도적 비활성(알림은 서버 notify_and_push 로 일원화). 파일은 원복 대비 보존.",
}

# ── plugin/ 바깥의 **살아있는 권위 문서**도 검사 대상 ───────────────────────────
#    (감사 2026-07-31: 게이트가 plugin/ 만 걷던 탓에 CLAUDE.md·_GUIDE.md 가 사각지대였다.
#     실제로 `.ouroboros/docs/_GUIDE.md` 는 없어진 `/plan:dig` 를 "반드시 따르라"며 지시하고 있었다.)
#    시점 고정 문서(report·qa·todo·study·knowledge)는 당시 사실을 보존하는 기록이므로 제외한다.
REPO_ROOT = os.path.dirname(ROOT)
EXTRA_DOCS = []
for _f in ("CLAUDE.md", "README.md", "INSTALL.md"):
    _p = os.path.join(REPO_ROOT, _f)
    if os.path.isfile(_p):
        EXTRA_DOCS.append(_p)
_ouro = os.path.join(REPO_ROOT, ".ouroboros", "docs")
if os.path.isdir(_ouro):
    for _f in sorted(os.listdir(_ouro)):
        # `_` 로 시작하는 것 = 규약·가이드(살아있는 권위). 나머지는 산출물 기록.
        if _f.startswith("_") and _f.endswith(".md"):
            EXTRA_DOCS.append(os.path.join(_ouro, _f))

SCRIPT_RE = re.compile(r"(?:^|[/\s\"'`])([a-z_][a-z0-9_]*\.(?:py|sh))\b")
FLAG_RE = re.compile(r"(--[a-z0-9][a-z0-9\-]*)")
SKILL_RE = re.compile(r"/(code|plan|plm-hub|plm-channel):([a-z][a-z0-9-]*)")

errors = []
checked = {"A": 0, "B": 0, "C": 0, "D": 0, "E": 0}


def rel(p):
    return os.path.relpath(p, ROOT)


def read(p):
    with open(p, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def iter_files(pattern_dirs, exts):
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "__pycache__")]
        for fn in filenames:
            if fn.endswith(exts):
                yield os.path.join(dirpath, fn)


def script_vocab(path):
    """스크립트가 실제로 받아들이는 플래그/서브명령 (소스 리터럴이 진실)."""
    src = read(path)
    flags = set(re.findall(r"""["'](--[a-z0-9][a-z0-9\-]*)["']""", src))
    subs = set(re.findall(r"""add_parser\(\s*["']([a-z0-9\-_]+)""", src))
    subs |= set(re.findall(r"""(?:cmd|sub|action|mode)\s*==\s*["']([a-z][a-z0-9\-_]*)["']""", src))
    subs |= set(re.findall(r"""["']([a-z][a-z0-9\-]*)["']\s*(?:,\s*["'][a-z][a-z0-9\-]*["']\s*)*\)\s*:?\s*$""", ""))
    return flags, subs


def strip_dead_lines(text, is_js):
    """살아있는 줄만 남긴다.

    relay/*.mjs 의 [원본] 보존 블록은 줄머리가 `//`(또는 `*`)다 — 그건 계약이 아니다.
    md 는 그대로 둔다(문서는 전부 살아있는 안내다).
    """
    if not is_js:
        return list(enumerate(text.splitlines(), 1))
    out = []
    for i, line in enumerate(text.splitlines(), 1):
        s = line.lstrip()
        if s.startswith("//") or s.startswith("*") or s.startswith("/*"):
            continue
        out.append((i, line))
    return out


# ════════════════════════════════════════════════════════════════════ A
def check_a():
    """문서·지시문이 없는 스크립트/플래그를 시키지 않는가."""
    vocab = {}
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "__pycache__")]
        for fn in filenames:
            if fn.endswith((".py", ".sh")) and os.path.basename(dirpath) == "scripts":
                p = os.path.join(dirpath, fn)
                vocab[fn] = script_vocab(p)

    targets = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "__pycache__")]
        for fn in filenames:
            if fn.endswith(".md") or (fn.endswith(".mjs") and os.path.basename(dirpath) == "relay"):
                targets.append(os.path.join(dirpath, fn))
    targets += EXTRA_DOCS

    for path in sorted(targets):
        is_js = path.endswith(".mjs")
        for lineno, line in strip_dead_lines(read(path), is_js):
            scripts = set(SCRIPT_RE.findall(line))
            if not scripts:
                continue
            # 한 줄에 스크립트가 둘 이상이면 어느 쪽 플래그인지 확정할 수 없다 → 건너뛴다(오탐 방지).
            known = [s for s in scripts if s in vocab]
            if len(known) != 1:
                continue
            s = known[0]
            # 플래그는 **스크립트 이름 뒤**에 온 것만 그 스크립트의 인자다.
            # (앞에 온 `--dry`는 스킬 자신의 옵션을 설명하는 산문일 뿐 — 오탐의 주원인.)
            after = line[line.index(s) + len(s):]
            flags = FLAG_RE.findall(after)
            if not flags:
                continue
            sup_flags, _ = vocab[s]
            checked["A"] += 1
            for f in sorted(set(flags)):
                if f not in sup_flags:
                    errors.append(
                        f"[A 옛 계약] {rel(path)}:{lineno} — `{s}` 에 없는 옵션 `{f}` 를 지시한다.\n"
                        f"         실제 지원: {sorted(sup_flags) or '(없음)'}\n"
                        f"         → 문서/지시문을 실제 인터페이스로 고치거나, 스크립트에 그 옵션을 추가하라."
                    )


# ════════════════════════════════════════════════════════════════════ B
def check_b():
    """스크립트가 지원하는 기능을 소유 문서가 알리고 있는가 (빠진 신규 기능)."""
    for spath, docs in sorted(OWNER_DOCS.items()):
        full = os.path.join(ROOT, spath)
        if not os.path.isfile(full):
            errors.append(f"[B 소유표] {spath} — OWNER_DOCS 에 있으나 파일이 없다(이동/삭제 시 표를 갱신하라).")
            continue
        flags, subs = script_vocab(full)
        blob = ""
        for d in docs:
            dp = os.path.join(ROOT, d)
            if not os.path.isfile(dp):
                errors.append(f"[B 소유표] {spath} 의 소유 문서 {d} 가 없다.")
                continue
            blob += read(dp)
        internal = INTERNAL_FLAGS.get(spath, {})
        checked["B"] += 1
        for f in sorted(flags):
            if f in blob:
                continue
            if f in internal:
                continue
            errors.append(
                f"[B 미고지] {spath} 는 `{f}` 를 지원하는데 {', '.join(docs)} 어디에도 없다.\n"
                f"         → 문서에 사용법을 싣거나, 내부 전용이면 INTERNAL_FLAGS 에 **사유와 함께** 등재하라."
            )
        for sc in sorted(subs):
            if sc not in blob:
                errors.append(
                    f"[B 미고지] {spath} 는 서브명령 `{sc}` 를 지원하는데 {', '.join(docs)} 어디에도 없다.\n"
                    f"         → 사용자는 그 기능이 있는 줄도 모른다. 문서에 실어라."
                )
        for f, why in internal.items():
            if not why.strip():
                errors.append(f"[B 사유누락] {spath} `{f}` — INTERNAL_FLAGS 등재에 사유가 비었다.")
            if f not in flags:
                errors.append(f"[B 유령면제] {spath} `{f}` — 더 이상 없는 옵션이 INTERNAL_FLAGS 에 남아 있다. 지워라.")


# ════════════════════════════════════════════════════════════════════ C
def check_c():
    """hooks.json 등록 ↔ 훅 파일 실존."""
    import json

    for pl in PLUGINS:
        hj = os.path.join(ROOT, pl, "hooks", "hooks.json")
        hdir = os.path.join(ROOT, pl, "hooks")
        if not os.path.isfile(hj):
            continue
        checked["C"] += 1
        data = json.loads(read(hj))
        registered = set()
        for _event, groups in data.get("hooks", {}).items():
            for g in groups:
                for h in g.get("hooks", []):
                    cmd = h.get("command", "")
                    m = re.search(r"hooks/([a-z0-9_.-]+\.sh)", cmd)
                    if not m:
                        continue
                    name = m.group(1)
                    registered.add(name)
                    if not os.path.isfile(os.path.join(hdir, name)):
                        errors.append(
                            f"[C 죽은등록] {pl}/hooks/hooks.json — `{name}` 을 등록했으나 파일이 없다. "
                            f"훅은 조용히 실패한다(exit 0 규약) → 아무도 모른다."
                        )
        for fn in sorted(os.listdir(hdir)):
            if not fn.endswith(".sh"):
                continue
            if fn in registered:
                continue
            key = f"{pl}/hooks/{fn}"
            if key in UNREGISTERED_HOOKS_OK:
                continue
            errors.append(
                f"[C 미등록] {key} 가 존재하나 hooks.json 에 없다 — 절대 실행되지 않는다.\n"
                f"         → 등록하거나, 의도적 비활성이면 UNREGISTERED_HOOKS_OK 에 사유와 함께 등재하라."
            )
        for key in UNREGISTERED_HOOKS_OK:
            if key.startswith(pl + "/") and not os.path.isfile(os.path.join(ROOT, key)):
                errors.append(f"[C 유령면제] {key} — 파일이 없는데 면제 목록에 남아 있다. 지워라.")


# ════════════════════════════════════════════════════════════════════ D
def check_d():
    """문서·지시문이 가리키는 스킬이 실제로 있는가."""
    paths = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "__pycache__")]
        for fn in filenames:
            if fn.endswith((".md", ".mjs", ".sh")):
                paths.append(os.path.join(dirpath, fn))
    paths += EXTRA_DOCS
    for path in paths:
            fn = os.path.basename(path)
            is_js = fn.endswith(".mjs")
            for lineno, line in strip_dead_lines(read(path), is_js):
                for ns, name in SKILL_RE.findall(line):
                    checked["D"] += 1
                    if not os.path.isfile(os.path.join(ROOT, ns, "commands", f"{name}.md")):
                        errors.append(
                            f"[D 없는스킬] {rel(path)}:{lineno} — `/{ns}:{name}` 를 안내하나 "
                            f"{ns}/commands/{name}.md 가 없다(사라졌거나 오타·네임스페이스 오기)."
                        )


# ════════════════════════════════════════════════════════════════════ E
def check_e():
    """plugin.json 이 **열거한** 명령 목록 ↔ 실제 commands/*.md.

    이 설명문은 마켓플레이스·`claude plugin` 목록에서 사용자가 읽는 유일한 기능 안내다.
    새 스킬을 추가하고 여기를 안 고치면 사용자는 **그 기능이 있는 줄도 모른다**.
    (감사 시점 실제 사례: plm-hub 17개 중 7개 — verify·agent·blueprint·update·wf* — 가 빠져 있었다.)
    "명령: ns:a/b/c" 형태로 **열거한 경우에만** 검사한다(`ns:<command>` 같은 총칭은 대상 아님).
    """
    import json

    for pl in PLUGINS:
        mf = os.path.join(ROOT, pl, ".claude-plugin", "plugin.json")
        cdir = os.path.join(ROOT, pl, "commands")
        if not (os.path.isfile(mf) and os.path.isdir(cdir)):
            continue
        desc = json.loads(read(mf)).get("description", "")
        m = re.search(r"명령:\s*([^.]+)", desc)
        if not m:
            continue
        # `ns:a/b/c` 축약(접두는 한 번만) 과 `ns:a, ns:b` 를 모두 받는다.
        segment = m.group(1)
        listed = set()
        for run in re.findall(rf"{re.escape(pl)}:((?:[a-z][a-z0-9-]*\*?)(?:/[a-z][a-z0-9-]*\*?)*)", segment):
            listed |= {x for x in run.split("/") if x}
        if not listed:
            continue
        checked["E"] += 1
        actual = {f[:-3] for f in os.listdir(cdir) if f.endswith(".md")}
        # `artifact-*` 같은 와일드카드 표기는 접두 일치로 소진시킨다.
        wild = {w[:-1] for w in listed if w.endswith("*")}
        listed = {w for w in listed if not w.endswith("*")}
        covered = set(listed)
        for w in wild:
            covered |= {a for a in actual if a.startswith(w)}
        for missing in sorted(actual - covered):
            errors.append(
                f"[E 미고지] {pl}/.claude-plugin/plugin.json 의 '명령:' 목록에 `{pl}:{missing}` 가 없다.\n"
                f"         → 마켓플레이스·plugin 목록에서 사용자가 이 기능을 발견할 길이 없다. 목록에 추가하라."
            )
        for ghost in sorted(listed - actual):
            errors.append(
                f"[E 유령명령] {pl}/.claude-plugin/plugin.json 이 `{pl}:{ghost}` 를 알리나 "
                f"{pl}/commands/{ghost}.md 가 없다 — 사라진 명령을 광고하고 있다."
            )


def main():
    check_a()
    check_b()
    check_c()
    check_d()
    check_e()
    print("═══ 문서·지시문 ↔ 코드 계약 게이트 ═══")
    print(f"  A 옛 계약(문서→코드) 대조 {checked['A']}줄 · B 미고지(코드→문서) 스크립트 {checked['B']}개 · "
          f"C 훅 등록 플러그인 {checked['C']}개 · D 스킬 참조 {checked['D']}건 · "
          f"E 매니페스트 명령목록 {checked['E']}개")
    if errors:
        print(f"\n❌ 계약 드리프트 {len(errors)}건\n")
        for e in errors:
            print("  " + e.replace("\n", "\n  "))
            print()
        print("계약이 어긋난 채 배포되면 사용자는 **문서대로 했는데 안 되는** 상태가 된다.")
        return 1
    print("✅ 드리프트 없음")
    return 0


if __name__ == "__main__":
    sys.exit(main())
