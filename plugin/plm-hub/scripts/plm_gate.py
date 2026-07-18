#!/usr/bin/env python3
"""PLM 게이트(G1~G3 orphan) + 재검토 큐(needs_review)를 조회해 경고 텍스트 출력.

PLM이 거버넌스 권위 — 로컬 trace 대신 DB 기준 게이트를 표면화(소프트·비차단).
graceful: 실패하면 무출력 종료.
env: PLM_API_URL · PLM_PROJECT · PLM_API_TOKEN (gates/review-queue/export 모두 인증 필요)
"""
import json
import os
import urllib.request
from urllib.parse import quote


def get(url):
    try:
        req = urllib.request.Request(url)
        req.add_header("user-agent", "plm-hook/1.0")  # Cloudflare python-urllib UA 차단 회피
        with urllib.request.urlopen(req, timeout=6) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None


PROSE = {"URS", "UCS", "SRS", "SAD", "ADR"}


def get_auth(url, token, timeout=20):
    """토큰 필요 GET(/export). 토큰 없거나 실패 시 None. export는 대량이라 타임아웃 여유."""
    if not token:
        return None
    try:
        req = urllib.request.Request(url)
        req.add_header("user-agent", "plm-hook/1.0")
        req.add_header("authorization", f"Bearer {token}")
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None


TRACKED = {"URS", "UCS", "SRS", "SAD", "ADR", "Roadmap"}
DOC_DIRS = ("requirements", "design", "decisions", "roadmap")


def _doc_is_thin(api, token, project, code):
    """ADR-019: 본문은 doc에 있음. doc를 fetch해 산문 텍스트로 빈약 판정(/export body가 빈 .json용)."""
    d = get_auth(f"{api}/artifacts/{quote(project)}/{quote(code)}/doc", token, timeout=8)
    doc = (d or {}).get("doc")
    if not doc:
        return True  # doc 없음 → 빈약
    texts, stack = [], [doc]
    while stack:
        n = stack.pop()
        if isinstance(n, dict):
            if n.get("type") == "text":
                texts.append(n.get("text", ""))
            stack.extend(n.get("content") or [])
        elif isinstance(n, list):
            stack.extend(n)
    alltext = "".join(texts)
    return len(alltext.strip()) < 50 or "{{" in alltext


def thin_body_artifacts(data, api=None, token=None, project=None):
    """산문 아티팩트 중 본문 빈약 목록 — 상시 본문 게이트(G_body).
    ADR-019 동형: /export의 body는 .json 아티팩트에서 빈 값이므로, body가 비면 doc를 fetch해 재판정
    (빈 body ≠ 빈약). doc 확인은 latency 위해 80건 캡(초과분은 보수적으로 빈약 표시)."""
    if not data:
        return []
    bad, checked = [], 0
    for a in data.get("artifacts", []):
        if a.get("type") not in PROSE or a.get("status") == "Replaced":
            continue
        if "seed" in (a.get("tags") or []):
            continue  # P1-2: 자동 생성 seed BS — 빈 본문이 정상(G_body 제외·본문 날조 보정 방지)
        body = (a.get("body") or "").strip()
        prose = "\n".join(l for l in body.splitlines() if not l.startswith("#")).strip()
        if prose and len(prose) >= 50 and "{{" not in body:
            continue  # 레거시 .md body 충실 → OK
        # body 빈약/없음 → ADR-019 canonical doc 기준 재판정
        if api and token and project and checked < 80:
            checked += 1
            if not _doc_is_thin(api, token, project, a.get("code", "")):
                continue  # doc 본문 충실 → OK
        bad.append(a.get("code", "?"))
    return bad


def _local_doc_codes(proj_dir):
    """로컬 추적 문서 코드 집합(파일명 stem). _접두/sync:false 제외.
    ADR-019 동형: .json(canonical) + .md(이행기 레거시) 모두 스캔, stem 기준 dedup."""
    import glob
    codes = set()
    for d in DOC_DIRS:
        base = os.path.join(proj_dir, ".ouroboros", "docs", d)
        # .json 우선(canonical), .md는 레거시. 같은 stem이 양쪽 있으면 한 번만.
        for ext in ("*.json", "*.md"):
            for f in glob.glob(os.path.join(base, ext)):
                stem = os.path.splitext(os.path.basename(f))[0]
                if stem.startswith("_"):
                    continue
                try:  # sync:false 제외(본문 반출 안 함) — .json("sync": false)·.md(sync: false) 공통 감지
                    head = open(f, encoding="utf-8").read(600)
                    if "sync: false" in head or "sync:false" in head or '"sync":false' in head or '"sync": false' in head:
                        continue
                except Exception:
                    pass
                codes.add(stem)
    return codes


def sync_drift(data, proj_dir):
    """로컬 문서 ↔ PLM 아티팩트 집합 비교. (미동기 local-only, 잔여 plm-only) 반환.
    per-edit 동기가 조용히 실패해도 누적 desync를 매 세션 표면화 — 모든 프로젝트 공통 안전망."""
    if not data or not proj_dir:
        return [], []
    plm = set()
    for a in data.get("artifacts", []):
        if a.get("type") in TRACKED and a.get("status") != "Replaced":
            if "seed" in (a.get("tags") or []):
                continue  # P1-2: seed BS는 PLM 태생 — 로컬 부재가 정상(드리프트 감사 제외)
            plm.add(a.get("code", "?"))
    local = _local_doc_codes(proj_dir)
    if not local and not plm:
        return [], []
    local_only = sorted(local - plm)   # 로컬에 있으나 PLM 미반영(동기 필요)
    plm_only = sorted(plm - local)     # PLM에 있으나 로컬 파일 없음(드리프트/잔여)
    return local_only, plm_only


def _norm_doc(doc):
    return json.dumps(doc, sort_keys=True, ensure_ascii=False)


def _local_json_docs(proj_dir):
    """로컬 추적 .json 문서 {code: path}(canonical만 — 본문 해시 비교용). _접두/sync:false 제외."""
    import glob
    out = {}
    for d in DOC_DIRS:
        base = os.path.join(proj_dir, ".ouroboros", "docs", d)
        for f in glob.glob(os.path.join(base, "*.json")):
            stem = os.path.splitext(os.path.basename(f))[0]
            if stem.startswith("_"):
                continue
            try:
                head = open(f, encoding="utf-8").read(600)
                if '"sync":false' in head or '"sync": false' in head:
                    continue
            except Exception:
                pass
            out[stem] = f
    return out


def content_drift(proj_dir, api, project, token, limit=25):
    """④ 로컬 .json doc ↔ PLM doc 내용(정규화 비교) → 다른 코드 목록.
    존재 비교(sync_drift)가 못 잡는 '메타 최신·본문 옛버전' 침묵 드리프트를 탐지(doc PUT 조용한 실패의 잔재).
    per-doc GET·상한·graceful. 첫 GET 실패(서버 미도달)면 전체 중단해 Stop hook 지연을 막는다."""
    if not (proj_dir and api and token):
        return []
    drifted = []
    for i, (code, path) in enumerate(sorted(_local_json_docs(proj_dir).items())[:limit]):
        try:
            local_doc = json.load(open(path, encoding="utf-8")).get("doc")
        except Exception:
            continue
        if local_doc is None:
            continue
        remote = get_auth(f"{api}/artifacts/{quote(project)}/{quote(code)}/doc", token, timeout=6)
        if not remote:
            if i == 0:
                break   # 첫 조회부터 미도달 = 서버 다운 추정 → 25회 타임아웃 누적 방지(전체 중단)
            continue
        if _norm_doc(local_doc) != _norm_doc(remote.get("doc")):
            drifted.append(code)
    return drifted


def drift_markers(proj_dir):
    """⑤ plm-sync가 남긴 doc PUT 영구실패 마커(sync-drift.json) 조회 → 다음 Stop에서 표면화."""
    if not proj_dir:
        return {}
    f = os.path.join(proj_dir, ".ouroboros", "context", "sync-drift.json")
    if not os.path.exists(f):
        return {}
    try:
        return json.load(open(f, encoding="utf-8"))
    except Exception:
        return {}


def main():
    api = os.environ.get("PLM_API_URL", "").rstrip("/")
    project = os.environ.get("PLM_PROJECT", "")
    token = os.environ.get("PLM_API_TOKEN", "")
    if not (api and project):
        return
    proj_dir = os.environ.get("CLAUDE_PROJECT_DIR", "")
    gates = get_auth(f"{api}/gates?project={project}", token)
    review = get_auth(f"{api}/review-queue?project={project}", token)
    export = get_auth(f"{api}/export?project={project}", token)
    thin = thin_body_artifacts(export, api, token, project)
    local_only, plm_only = sync_drift(export, proj_dir)
    markers = drift_markers(proj_dir)                       # ⑤ doc PUT 영구실패 마커
    content = content_drift(proj_dir, api, project, token)  # ④ 본문 해시 드리프트(메타 최신·doc 옛버전)
    if (gates is None and review is None and not thin and not local_only
            and not plm_only and not markers and not content):
        return  # 서버 미도달 — 조용히

    lines = []
    # @plm  토큰 미설정/무효 경고 — hook 자동동기(plm-sync/codesync)가 침묵 skip되는 상태를 표면화.
    if not token or token.startswith("plmhub-xxxx"):
        lines.append("  ⚠ PLM_API_TOKEN 미설정 — hook 자동 동기(plm-sync·codesync) 비활성. `plm-hub:link` 재실행(자동 발급) 또는 .ouroboros/env/.env에 토큰 기입")
    elif export is None and get(f"{api}/health"):
        # 서버는 살아있는데 /export(토큰 필요)만 실패 → 토큰 무효 가능성
        lines.append("  ⚠ PLM_API_TOKEN 무효 의심(/export 인증 실패) — `plm-hub:link` 재실행으로 재발급 권장")
    # @plm  동기 드리프트(local↔PLM) — desync 조용한 누적 차단(모든 프로젝트 공통 안전망)
    if local_only:
        lines.append(f"  ⚠ 미동기 {len(local_only)}건(로컬→PLM): {', '.join(local_only[:8])} — `/plm-hub:sync` 필요")
    if plm_only:
        lines.append(f"  ⚠ 드리프트 {len(plm_only)}건(PLM엔 있으나 로컬 파일 없음): {', '.join(plm_only[:8])} — `/plm-hub:pull` 또는 정리")
    # @plm  ⑤ doc PUT 영구실패 마커 — 재시도까지 실패한 본문 미반영을 명시 표면화
    if markers:
        lines.append(f"  ⚠ doc 저장 실패 {len(markers)}건: {', '.join(sorted(markers)[:8])} — 파일 재저장 또는 `/plm-hub:sync`로 재동기")
    # @plm  ④ 본문 드리프트(메타 최신·doc 옛버전) — 존재 비교로는 못 잡던 침묵 desync
    if content:
        lines.append(f"  ⚠ 본문 드리프트 {len(content)}건(로컬 doc ≠ PLM doc): {', '.join(content[:8])} — `/plm-hub:sync`로 재동기")
    if gates:
        by = {}
        for o in gates:
            by.setdefault(o.get("gate", "?"), []).append(o.get("code", "?"))
        for g in ("G1", "G2", "G3"):
            if g in by:
                lines.append(f"  {g} orphan: {', '.join(by[g][:8])}")
    if review:
        # @plm  재검토 표시 정제 — Replaced 잔여 + 기계생성 Code(사람 검토 비대상) 제외, 산문 아티팩트만.
        skip = set()
        if export:
            for a in export.get("artifacts", []):
                if a.get("status") == "Replaced" or a.get("type") == "Code":
                    skip.add(a.get("code"))
        codes = [r.get("code", "?") for r in review if r.get("code") not in skip][:8]
        if codes:
            lines.append(f"  재검토 대기(needs_review): {', '.join(codes)}")
    if thin:
        lines.append(f"  본문 빈약(G_body, {len(thin)}건): {', '.join(thin[:8])} — 본문 보강 필요(agent 자동 보정 대상)")

    if lines:
        print(f"[plm-gate] PLM 거버넌스 경고 (project={project}, 소프트 — 작업 계속):")
        print("\n".join(lines))
    # 통과 시 무출력(조용)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass
