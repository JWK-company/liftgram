#!/usr/bin/env python3
"""변경된 기획 아티팩트 .md 1개를 PLM에 upsert (POST /import).

frontmatter(id·type·status·owner-relations) + 본문을 읽어 단건 import.
관계는 frontmatter의 owner(작성) 관계만(SSOT). 무효 관계는 서버가 skip.
graceful: 실패해도 종료코드 0 (hook 비차단). 한 줄 결과 출력.

env: PLM_API_URL · PLM_API_TOKEN · PLM_PROJECT
인자: --file <path>
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

REL_KEYS = ["derives_from", "elaborates", "refs", "realizes", "informs",
            "supersedes", "covers", "part_of", "instance_of", "relates_to", "targets", "generated_from"]


def _drift_file(path):
    """path에서 상위로 올라가며 .ouroboros를 찾아 드리프트 마커 파일 경로를 돌려준다(plm-gate가 읽는 위치)."""
    d = os.path.dirname(os.path.abspath(path))
    while d and d != os.path.dirname(d):
        cand = os.path.join(d, ".ouroboros")
        if os.path.isdir(cand):
            return os.path.join(cand, "context", "sync-drift.json")
        d = os.path.dirname(d)
    return None


def record_drift_marker(path, code, reason):
    """⑤ doc PUT 영구 실패 → sync-drift.json에 마커 기록. stdout 경고는 사라지므로 파일로 남겨
    다음 Stop의 plm-gate가 표면화(침묵 desync 차단). 항상 graceful."""
    f = _drift_file(path)
    if not f:
        return
    try:
        os.makedirs(os.path.dirname(f), exist_ok=True)
        data = json.load(open(f, encoding="utf-8")) if os.path.exists(f) else {}
        if not isinstance(data, dict):
            data = {}
        data[code] = {"reason": reason, "at": int(time.time())}
        json.dump(data, open(f, "w", encoding="utf-8"), ensure_ascii=False)
    except Exception:
        pass


def clear_drift_marker(path, code):
    """doc PUT 성공 → 해당 code 마커 해제(비면 파일 제거). graceful."""
    f = _drift_file(path)
    if not f or not os.path.exists(f):
        return
    try:
        data = json.load(open(f, encoding="utf-8"))
        if isinstance(data, dict) and code in data:
            del data[code]
            if data:
                json.dump(data, open(f, "w", encoding="utf-8"), ensure_ascii=False)
            else:
                os.remove(f)
    except Exception:
        pass


def git_branch(path):
    """파일이 속한 git repo의 현재 브랜치 → PLM branch(브랜치별 문서 격리, SRS-019).
    PLM_BRANCH env가 있으면 우선. detached/오류는 main."""
    env = os.environ.get("PLM_BRANCH")
    if env:
        return env
    try:
        d = os.path.dirname(os.path.abspath(path))
        out = subprocess.run(["git", "-C", d, "rev-parse", "--abbrev-ref", "HEAD"],
                             capture_output=True, text=True, timeout=3)
        b = out.stdout.strip()
        return b if b and b != "HEAD" else "main"
    except Exception:
        return "main"


def _unquote(s):
    # frontmatter 스칼라/리스트원소의 둘러싼 따옴표 제거 (platform-build A1 — ADR-005).
    # 미제거 시 PLM code가 "RM-001"(따옴표 포함)로 오염돼 관계 dst(무따옴표)와 불일치.
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
        return s[1:-1].strip()
    return s


def parse_md(text):
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if not m:
        return {}, text
    fm = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        # 인라인 주석(# ...) 제거 — 단 따옴표 안의 #는 보존하지 않음(frontmatter 단순 규약)
        k, v = k.strip(), v.strip()
        if v.startswith("[") and v.endswith("]"):
            fm[k] = [_unquote(x) for x in v[1:-1].split(",") if x.strip()]
        else:
            fm[k] = _unquote(v)
    return fm, m.group(2)


def parse_json(text):
    """ADR-019 동형: CODE.json(래퍼 + doc) 파싱 → (fields, doc). 변환기 없음 — doc을 그대로 전송.
    relations는 래퍼의 `relations` 객체(키→리스트/문자열). doc은 ProseMirror JSON."""
    obj = json.loads(text)
    rel = obj.get("relations") or {}
    # 단일 문자열/None도 리스트로 정규화(supersedes 등)
    norm = {}
    for k, v in rel.items():
        if v is None:
            continue
        norm[k] = v if isinstance(v, list) else [v]
    return obj, norm, obj.get("doc")


def main():
    args = sys.argv
    path = args[args.index("--file") + 1] if "--file" in args else None
    api = os.environ.get("PLM_API_URL", "").rstrip("/")
    token = os.environ.get("PLM_API_TOKEN", "")
    project = os.environ.get("PLM_PROJECT", "")
    if not (path and api and project) or not os.path.exists(path):
        return
    doc = None
    try:
        raw = open(path, encoding="utf-8").read()
        if path.endswith(".json"):
            fm, rel_map, doc = parse_json(raw)          # ADR-019 동형 JSON
            body = ""                                    # canonical=doc, body 미사용
        else:
            fm, body = parse_md(raw)                     # 레거시 .md(이행기)
            rel_map = {rk: (fm.get(rk) or []) for rk in REL_KEYS}
    except Exception:
        return
    code = fm.get("id")
    if not code or "type" not in fm:
        return
    artifact = {
        "code": code, "type": fm["type"], "title": fm.get("title", code),
        "status": fm.get("status", "Draft"),
        "granularity": fm.get("granularity"), "build_state": fm.get("build_state"),
        "kind": fm.get("kind"),
        "tags": fm.get("tags") or [],  # ③ 자유 태그
        "body": body.strip("\n") if isinstance(body, str) else "",
        # doc은 아래 PUT /doc(canonical writer)로만 저장한다. 서버 /import는 doc 필드를 받지 않으므로
        # 여기 페이로드엔 넣지 않는다(불필요한 전송 제거·단일 writer 명확화).
        "comments": fm.get("comments"),                   # #5: 댓글/토의(있으면) → 서버 replace-all 동기. None=미변경.
        "branch": git_branch(path),  # 현재 git branch → PLM branch (브랜치별 격리)
    }
    relations = [{"src": code, "rel": rk, "dst": dst}
                 for rk in REL_KEYS for dst in (rel_map.get(rk) or [])]
    payload = json.dumps({"project": project, "artifacts": [artifact], "relations": relations}).encode()
    req = urllib.request.Request(f"{api}/import", data=payload, method="POST")
    req.add_header("content-type", "application/json")
    req.add_header("authorization", f"Bearer {token}")
    req.add_header("user-agent", "plm-hook/1.0")  # Cloudflare가 python-urllib UA 차단 → 명시
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            s = json.loads(r.read().decode())
        skipped = s.get('relations_skipped', 0)
        msg = f"[plm-sync] {code} → PLM (생성 {s.get('created',0)}·수정 {s.get('updated',0)}·관계+{s.get('relations_added',0)})"
        if skipped:  # A3: 관계 silent skip 표면화 — dst 미존재 시 2-pass 재동기 필요
            msg += f" ⚠ 관계 {skipped}건 skip(dst 미존재 — 일괄 2-pass 동기 또는 dst 선동기)"
        # ADR-019 동형: import(메타+관계) 후 doc JSON을 N5 엔드포인트(PUT /doc, canonical writer)로 저장.
        # ① 일시 실패(타임아웃·네트워크)가 조용한 영구 드리프트("json은 최신인데 대시보드는 옛버전")로 굳는 것을
        #    막기 위해 3회 backoff 재시도 + 타임아웃 상향(8→15s). ⑤ 최종 실패 시 마커를 남겨 다음 Stop의 plm-gate가 표면화.
        if doc is not None:
            from urllib.parse import quote
            durl = f"{api}/artifacts/{quote(project)}/{quote(code)}/doc"
            dpayload = json.dumps(
                {"doc": doc, "schema_version": int(float(fm.get("schemaVersion", 1) or 1))}
            ).encode()
            ok, last_err = False, ""
            for attempt in range(3):
                try:
                    dreq = urllib.request.Request(durl, data=dpayload, method="PUT")
                    dreq.add_header("content-type", "application/json")
                    dreq.add_header("authorization", f"Bearer {token}")
                    dreq.add_header("user-agent", "plm-hook/1.0")
                    urllib.request.urlopen(dreq, timeout=15).read()
                    ok = True
                    break
                except Exception as de:
                    last_err = str(de)[:60]
                    if attempt < 2:
                        time.sleep(1.5 * (attempt + 1))
            if ok:
                msg += " ·doc✓"
                clear_drift_marker(path, code)              # ⑤ 성공 → 마커 해제
            else:
                msg += f" ⚠ doc 저장 실패(재시도 3회): {last_err}"
                record_drift_marker(path, code, last_err)   # ⑤ 영구 실패 → 마커 기록(Stop hook 표면화)
        print(msg)
    except urllib.error.HTTPError as e:
        # TOP-01: 403 = 멤버십 없음(자동동기 침묵 desync 방지 — 실행가능 안내).
        if e.code == 403:
            print(
                f"[plm-sync] ⚠ {code} 동기 거부(403): 토큰 사용자가 '{project}' 프로젝트 멤버가 아닙니다. "
                f"대시보드 멤버 탭에서 contributor+ 로 추가하거나 plm.json 바인딩을 확인하세요(자동동기 중단됨).",
                file=sys.stderr,
            )
        else:
            print(f"[plm-sync] {code} 동기 실패(비차단·HTTP {e.code}): {str(e)[:50]}", file=sys.stderr)
    except Exception as e:
        print(f"[plm-sync] {code} 동기 실패(비차단): {str(e)[:60]}", file=sys.stderr)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
