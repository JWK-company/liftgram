#!/usr/bin/env python3
"""소스코드의 `@plm <CODE>` 역링크 주석을 스캔 → PLM 딥링크 동기.

요구(딥링크): PLM 아티팩트 → 실제 코드 위치 직접연결 + 소스/문서 역링크.
동작:
  1) CODE_ROOT 하위 소스에서 `@plm SRS-001 [SAD-002 ...] [설명]` 주석 수집.
  2) 각 주석 위치마다 **Code 아티팩트** 생성(code=CODE-<slug>-<line>, body 첫 줄 `loc: `path:line``,
     build_state=as_built, granularity=function) + **realizes**(Code→대상) 관계 → POST /import.
  3) 참조된 기획 아티팩트의 로컬 `.md` frontmatter에 `code_refs: [path:line, ...]` **역기재**(md 명시).
graceful: 실패해도 exit 0. Cloudflare 회피 위해 user-agent 명시.
env: PLM_API_URL · PLM_API_TOKEN · PLM_PROJECT · PLM_CODE_ROOT(기본=CLAUDE_PROJECT_DIR) · CLAUDE_PROJECT_DIR
"""
import json
import os
import re
import urllib.request

REL = re.compile(r"@plm\s+([A-Za-z][A-Za-z]*-\d+(?:\s*,?\s+[A-Za-z][A-Za-z]*-\d+)*)\s*(.*)$")
CODE_ID = re.compile(r"[A-Za-z][A-Za-z]*-\d+")
EXTS = {".rs", ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".kt",
        ".sql", ".sh", ".rb", ".php", ".c", ".cpp", ".h", ".hpp", ".cs", ".swift",
        ".vue", ".svelte", ".html", ".htm", ".css", ".scss", ".dart", ".lua", ".ex", ".exs",
        ".gd"}  # GDScript(Godot)
SKIP_DIRS = {".git", "node_modules", "target", ".next", ".ouroboros", ".target",
             ".final", ".test", "dist", "build", "__pycache__", ".venv", "venv", "vendor",
             # UE 빌드 생성물(긁지 않음)
             "Intermediate", "Binaries", "Saved", "DerivedDataCache", ".vs",
             # Godot 캐시·임포트 + 로컬 도구(엔진 바이너리 등)
             ".godot", ".tools", ".import",
             # 템플릿 자체 머신러리(사용자 코드 아님) — 오탐 방지
             "plm-hub", "guide"}


def load_ignores(root):
    """프로젝트별 스캔 제외 패턴 — 죽은/벤더/구이터레이션 코드가 @plm으로 아티팩트를 오염·재생성하는 것 차단.
    출처: 스캔루트 `<root>/.plmignore` + 프로젝트루트 `<CLAUDE_PROJECT_DIR>/.plmignore`(code_root≠루트 구조 대응) + 환경변수 PLM_CODE_IGNORE(콤마). gitignore식 glob, root 기준 relpath."""
    pats = []
    proj = os.environ.get("CLAUDE_PROJECT_DIR", "")
    for d in {root, proj} - {""}:
        f = os.path.join(d, ".plmignore")
        if os.path.isfile(f):
            try:
                for ln in open(f, encoding="utf-8"):
                    ln = ln.strip()
                    if ln and not ln.startswith("#"):
                        pats.append(ln.rstrip("/"))
            except Exception:
                pass
    env = os.environ.get("PLM_CODE_IGNORE", "")
    pats += [p.strip().rstrip("/") for p in env.split(",") if p.strip()]
    return sorted(set(pats))


def is_ignored(relp, pats):
    import fnmatch
    rp = relp.replace(os.sep, "/")
    for p in pats:
        if fnmatch.fnmatch(rp, p) or fnmatch.fnmatch(rp, p + "/*") or rp == p or rp.startswith(p + "/"):
            return True
    return False
# 기획 아티팩트 type → 로컬 docs 디렉토리 (결정적 doc_path 규약).
CAT = {"URS": "requirements", "UCS": "requirements", "SRS": "requirements",
       "SAD": "design", "ADR": "decisions", "Roadmap": "roadmap"}


def http(api, path, token, body, method="POST"):
    data = json.dumps(body).encode()
    req = urllib.request.Request(f"{api}{path}", data=data, method=method)
    req.add_header("content-type", "application/json")
    req.add_header("authorization", f"Bearer {token}")
    req.add_header("user-agent", "plm-codescan/1.0")  # Cloudflare가 기본 urllib UA 차단
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def http_get(api, path, token):
    req = urllib.request.Request(f"{api}{path}")
    req.add_header("authorization", f"Bearer {token}")
    req.add_header("user-agent", "plm-codescan/1.0")
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


LOC_RE = re.compile(r"loc:\s*`([^`:]+):")  # body 첫 줄 loc 경로 추출

def stale_codes(ex, seen, present):
    """스캔된 범위에서 사라진 Code 코드 목록(GC 후보).
    안전: ① 스캔된 파일 내 심볼 사라짐(리네임/삭제) ② 스캔된 디렉토리 내 파일 삭제.
    다른 스코프(스캔 안 한 디렉토리)의 Code 는 보존 — 서브디렉토리 스캔 오삭제 방지."""
    present_dirs = {os.path.dirname(p) for p in present}
    out = []
    for a in ex.get("artifacts", []):
        if a.get("type") != "Code" or a.get("code") in seen or a.get("status") == "Superseded":
            continue
        m = LOC_RE.search(a.get("body", ""))
        if not m:
            continue
        locpath = m.group(1)
        in_scope = locpath in present or os.path.dirname(locpath) in present_dirs
        if in_scope:   # 스캔 범위인데 이번 스캔에 없음 = 리네임/삭제
            out.append((a["code"], a.get("title", a["code"]), a.get("build_state") or "as_built"))
    return out


def slug(rel):
    return re.sub(r"[^A-Za-z0-9]+", "-", rel).strip("-")[:60]


# @plm 주석 다음의 실제 선언에서 심볼명 추출 → 라인보다 안정적인 키.
SYM_SKIP = re.compile(r"^\s*(//|#|/\*|\*|<!--|@|UCLASS|UFUNCTION|UPROPERTY|USTRUCT|UENUM|GENERATED_BODY|#pragma|#include|\{|\}|$)")
SYM_PAT = [
    re.compile(r"^\s*class_name\s+(\w+)"),               # GDScript(Godot) 스크립트 클래스
    # class/struct 선언 — **줄 시작**에만(파라미터의 `struct Foo` 타입 오인 방지). UE export 매크로 \w+_API 건너뜀.
    re.compile(r"^\s*(?:export\s+|public\s+|pub\s+)?(?:class|struct|interface|enum|trait)\s+(?:\w+_API\s+)?(\w+)"),
    re.compile(r"\b(?:fn|def|func|function|sub)\s+(\w+)"),
    re.compile(r"\b(\w+)\s*::\s*(\w+)\s*\("),          # C++ Class::Method(
    re.compile(r"[\w:<>\*&\]]+\s+(\w+)\s*\("),          # 반환형 method(
    re.compile(r"\b(\w+)\s*\("),                         # fallback: ident(
]

# 제어/호출/대입 statement 시작 키워드 — 선언이 아니므로 심볼 추출 안 함(loose 패턴 오인 방지).
CTRL_SKIP = re.compile(r"^\s*(?:for|if|elif|else|while|match|case|switch|return|var|const|let"
                       r"|await|with|yield|raise|throw|emit|assert|print|continue|break|pass|do|when|guard|defer)\b")


def _strip_comment(line):
    """후행 주석(// 또는 #) 제거 — 주석 텍스트(한글 포함)가 심볼로 오인되는 것 방지.
    URL(http://) 오삭제 방지를 위해 공백 뒤 마커만 자른다(줄머리 주석은 SYM_SKIP가 이미 처리)."""
    return re.sub(r"\s(?://|#).*$", "", line)


def next_symbol(lines, idx):
    """idx(0-based, @plm 라인) 다음 **선언** 라인에서 심볼명 추출. 선언이 아니면 None(=path:line만)."""
    for line in lines[idx + 1: idx + 6]:
        if SYM_SKIP.match(line):
            continue
        if CTRL_SKIP.match(line):
            return None                  # 제어/대입문 = 선언 아님 → 깨끗한 심볼 없음
        code = _strip_comment(line)      # 주석 제거 후 매칭(코드부만)
        for pat in SYM_PAT:
            m = pat.search(code)
            if m:
                return m.group(m.lastindex or 1)  # 마지막 캡처 그룹(메서드명)
        break
    return None


def _read_lines(path):
    try:
        return open(path, encoding="utf-8", errors="ignore").read().splitlines()
    except Exception:
        return None


# 확장자 → 마크다운 코드펜스 언어(대시보드 본문 스니펫 하이라이트용).
LANG = {".rs": "rust", ".ts": "ts", ".tsx": "tsx", ".js": "js", ".jsx": "jsx",
        ".py": "python", ".go": "go", ".java": "java", ".kt": "kotlin", ".sql": "sql",
        ".sh": "bash", ".rb": "ruby", ".php": "php", ".c": "c", ".cpp": "cpp", ".h": "cpp",
        ".hpp": "cpp", ".cs": "csharp", ".swift": "swift", ".gd": "gdscript",
        ".lua": "lua", ".ex": "elixir", ".exs": "elixir", ".vue": "vue", ".svelte": "svelte"}


def _snippet(lines, plm_idx, ext, maxlines=7):
    """@plm 위치의 실제 코드 발췌(선언+컨텍스트) → 펜스 코드블록. 본문을 '제목뿐'에서 실코드로."""
    n = len(lines)
    start = None
    for j in range(plm_idx, min(plm_idx + 6, n)):
        if j == plm_idx:                                  # 인라인 @plm: 그 줄 코드부
            code = re.sub(r"\s*(?://|#).*$", "", lines[j])
            if code.strip():
                start = j
                break
            continue
        if SYM_SKIP.match(lines[j]):                      # 빈줄/주석 스킵
            continue
        start = j
        break
    if start is None:
        return ""
    snip = []
    for ln in lines[start:start + maxlines]:
        if snip and not ln.strip():                       # 다음 빈줄(블록 끝)에서 정지
            break
        snip.append(ln.rstrip("\n"))
    while snip and not snip[-1].strip():
        snip.pop()
    if not snip:
        return ""
    indent = min((len(s) - len(s.lstrip()) for s in snip if s.strip()), default=0)
    snip = [s[indent:] if len(s) >= indent else s for s in snip]
    return f"```{LANG.get(ext, '')}\n" + "\n".join(snip) + "\n```"


def _extract(relp, lines, arts, rels, refs):
    """한 파일(relp)의 @plm 주석 → arts/rels/refs 누적."""
    ext = os.path.splitext(relp)[1]
    for i, line in enumerate(lines, 1):
        m = REL.search(line)
        if not m:
            continue
        targets = CODE_ID.findall(m.group(1))
        desc = (m.group(2) or "").strip().rstrip("*/").rstrip("-->").strip()
        sym = next_symbol(lines, i - 1)
        loc = f"{relp}:{i}"
        # 키: 심볼 기반(라인 이동에 안정) → 없으면 라인 폴백.
        ccode = f"CODE-{slug(relp)}-{slug(sym)}" if sym else f"CODE-{slug(relp)}-{i}"
        title = (sym or desc or f"{relp}:{i}")[:120]
        snippet = _snippet(lines, i - 1, ext)
        body = (f"loc: `{loc}`" + (f"\nsymbol: `{sym}`" if sym else "")
                + f"\n\n@plm → {', '.join(targets)}"
                + (f"\n\n{desc}" if desc else "")
                + (f"\n\n{snippet}" if snippet else "")).strip()
        arts.append({"code": ccode, "type": "Code", "title": title,
                     "status": "Draft", "granularity": "function",
                     "build_state": "as_built", "body": body})
        ref = f"{loc}" + (f"#{sym}" if sym else "")
        for t in targets:
            rels.append({"src": ccode, "rel": "realizes", "dst": t})
            refs.setdefault(t, set()).add(ref)


def scan(root):
    """전체 트리 스캔 → (arts, rels, refs, present_paths). 풀스캔(GC 가능)."""
    arts, rels, refs, present = [], [], {}, set()
    ignores = load_ignores(root)   # @plm  .plmignore/PLM_CODE_IGNORE — 죽은/벤더 코드 제외
    for dirpath, dirnames, files in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS
                       and not is_ignored(os.path.relpath(os.path.join(dirpath, d), root), ignores)]
        for fn in files:
            if os.path.splitext(fn)[1] not in EXTS:
                continue
            relp = os.path.relpath(os.path.join(dirpath, fn), root)
            if is_ignored(relp, ignores):
                continue
            lines = _read_lines(os.path.join(dirpath, fn))
            if lines is None:
                continue
            present.add(relp)
            _extract(relp, lines, arts, rels, refs)
    return arts, rels, refs, present


def scan_file(root, abspath):
    """단일 파일 스캔(hook용) → (arts, rels, refs). GC 미수행."""
    arts, rels, refs = [], [], {}
    relp = os.path.relpath(abspath, root)
    lines = _read_lines(abspath)
    if lines is not None:
        _extract(relp, lines, arts, rels, refs)
    return arts, rels, refs


def write_code_refs(docs_root, code, locs, scope_path=None):
    """대상 아티팩트 .md frontmatter 에 code_refs 역기재.
    scope_path 주어지면(단일 파일 모드) 그 파일 경로의 ref 만 교체하고 다른 파일 ref 는 보존(merge)."""
    pref = code.split("-")[0]
    sub = CAT.get(pref)
    if not sub:
        return False
    path = os.path.join(docs_root, sub, f"{code}.md")
    if not os.path.exists(path):
        return False
    txt = open(path, encoding="utf-8").read()
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", txt, re.S)
    if not m:
        return False
    fm, body = m.group(1), m.group(2)
    final = set(locs)
    if scope_path:  # 다른 파일의 기존 ref 보존
        cur = re.search(r"^code_refs:\s*\[(.*?)\]\s*$", fm, re.M)
        if cur:
            for r in cur.group(1).split(","):
                r = r.strip()
                if r and not r.startswith(scope_path + ":"):
                    final.add(r)
    arr = "[" + ", ".join(sorted(final)) + "]"
    if re.search(r"^code_refs:.*$", fm, re.M):
        fm = re.sub(r"^code_refs:.*$", f"code_refs: {arr}", fm, flags=re.M)
    else:
        fm = fm.rstrip("\n") + f"\ncode_refs: {arr}"
    open(path, "w", encoding="utf-8").write(f"---\n{fm}\n---\n{body}")
    return True


def main():
    import sys
    api = os.environ.get("PLM_API_URL", "").rstrip("/")
    token = os.environ.get("PLM_API_TOKEN", "")
    project = os.environ.get("PLM_PROJECT", "")
    root = os.environ.get("PLM_CODE_ROOT") or os.environ.get("CLAUDE_PROJECT_DIR") or "."
    docs_root = os.path.join(os.environ.get("CLAUDE_PROJECT_DIR", "."), ".ouroboros", "docs")
    if not (api and project):
        print("[codescan] PLM 미바인딩 — 스킵")
        return

    # --file <path>: 단일 파일 모드(hook용·자동) — 그 파일의 @plm 만 동기, GC·풀스캔 없음.
    if "--file" in sys.argv:
        fpath = sys.argv[sys.argv.index("--file") + 1]
        if os.path.splitext(fpath)[1] not in EXTS or not os.path.exists(fpath):
            return
        relp = os.path.relpath(os.path.abspath(fpath), root)
        if is_ignored(relp, load_ignores(root)):   # @plm  .plmignore — 죽은/벤더 파일 단일 동기도 제외
            return
        arts, rels, refs = scan_file(root, os.path.abspath(fpath))
        if not arts:
            return
        try:
            s = http(api, "/import", token, {"project": project, "artifacts": arts, "relations": rels})
            # 경로-스코프 merge: 이 파일 ref 만 교체, 다른 파일 ref 보존.
            wrote = sum(1 for t, locs in refs.items() if write_code_refs(docs_root, t, locs, scope_path=relp))
            print(f"[codescan] {os.path.relpath(fpath, root)} → Code {len(arts)}·realizes {len(rels)} "
                  f"(생성 {s.get('created',0)}·수정 {s.get('updated',0)}) · code_refs {wrote} "
                  "(전체 GC는 /plm-hub:codescan)")
        except Exception as e:
            print(f"[codescan] 단일 동기 실패(비차단): {str(e)[:60]}")
        return

    arts, rels, refs, present = scan(root)
    if not arts:
        print(f"[codescan] @plm 역링크 주석 없음 (root={root})")
        return
    try:
        s = http(api, "/import", token, {"project": project, "artifacts": arts, "relations": rels})
        wrote = sum(1 for t, locs in refs.items() if write_code_refs(docs_root, t, locs))
        # export 1회 — 미존재 대상 경고 + GC 양쪽에 재사용.
        seen = {a["code"] for a in arts}
        ex = {}
        try:
            ex = http_get(api, f"/export?project={project}", token)
        except Exception:
            pass
        # 미존재 @plm 대상 경고(오타·미발급 — G0/추적 끊김 조기 감지).
        existing = {a["code"] for a in ex.get("artifacts", [])}
        missing = sorted(t for t in refs if t not in existing)
        if missing:
            print(f"[codescan] ⚠ @plm 대상 미존재(오타/미발급?): {', '.join(missing)} — 해당 Code는 orphan(G3). /requirement로 발급 또는 오타 수정.")
        # realizes reconcile: 스캔된 Code 의 @plm 이 바뀌면(다른 요구로 재태깅) 구 realizes 를 삭제.
        # /import 는 관계 머지(추가)만 하므로 재태깅 시 구 링크가 잔존 → 삭제로 정합.
        desired = {(r["src"], r["dst"]) for r in rels}
        recon = 0
        for r in ex.get("relations", []):
            if r.get("rel") != "realizes" or r.get("src") not in seen:
                continue
            if (r["src"], r["dst"]) not in desired:   # 스캔된 Code 인데 현재 @plm 에 없는 realizes
                try:
                    http(api, "/relations", token,
                         {"project": project, "src": r["src"], "rel": "realizes", "dst": r["dst"]},
                         method="DELETE")
                    recon += 1
                except Exception:
                    pass
        # GC: 스캔된 파일에서 사라진 심볼의 구 Code 를 Superseded 로 표시(추적 정합).
        stale = stale_codes(ex, seen, present)
        gc = 0
        if stale:
            sup = [{"code": c, "type": "Code", "title": t, "status": "Superseded",
                    "granularity": "function", "build_state": bs} for c, t, bs in stale]
            try:
                http(api, "/import", token, {"project": project, "artifacts": sup, "relations": []})
                gc = len(sup)
            except Exception:
                pass
        # 비파괴 경고: 활성 Code 의 loc 실파일이 root 아래 없음 = 이동/PLM_CODE_ROOT 변경 고아(중복 발생원).
        # 자동 삭제 안 함(서브디렉토리 스캔 오삭제 위험) — 표면화만. 정리는 사람이 확인 후.
        gc_codes = {c for c, _, _ in stale}
        orphans = []
        for a in ex.get("artifacts", []):
            if a.get("type") != "Code" or a.get("code") in seen or a.get("code") in gc_codes \
               or a.get("status") == "Superseded":
                continue
            m = LOC_RE.search(a.get("body", ""))
            if m and not os.path.isfile(os.path.join(root, m.group(1))):
                orphans.append(a["code"])
        if orphans:
            print(f"[codescan] ⚠ 활성 Code {len(orphans)}건의 loc 파일이 root 아래 없음"
                  f"(이동/PLM_CODE_ROOT 변경 의심 — 구 prefix 중복 위험): "
                  f"{', '.join(orphans[:5])}{'…' if len(orphans) > 5 else ''}. "
                  "PLM_CODE_ROOT은 프로젝트 루트로 고정하세요.")
        print(f"[codescan] Code {len(arts)}개·realizes {len(rels)}건 → PLM "
              f"(생성 {s.get('created',0)}·수정 {s.get('updated',0)}·관계+{s.get('relations_added',0)}) "
              f"· 문서 code_refs {wrote}건"
              + (f" · GC superseded {gc}건" if gc else "")
              + (f" · 관계 reconcile -{recon}" if recon else ""))
    except Exception as e:
        print(f"[codescan] 동기 실패(비차단): {str(e)[:80]}")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
