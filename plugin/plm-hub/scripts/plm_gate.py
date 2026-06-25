#!/usr/bin/env python3
"""PLM 게이트(G1~G3 orphan) + 재검토 큐(needs_review)를 조회해 경고 텍스트 출력.

PLM이 거버넌스 권위 — 로컬 trace 대신 DB 기준 게이트를 표면화(소프트·비차단).
graceful: 실패하면 무출력 종료.
env: PLM_API_URL · PLM_PROJECT (게이트는 public GET — 토큰 불필요)
"""
import json
import os
import urllib.request


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


def thin_body_artifacts(data):
    """산문 아티팩트 중 본문 빈약(제목 수준) 목록 — 상시 본문 게이트(G_body)."""
    if not data:
        return []
    bad = []
    for a in data.get("artifacts", []):
        if a.get("type") not in PROSE or a.get("status") == "Superseded":
            continue
        body = (a.get("body") or "").strip()
        prose = "\n".join(l for l in body.splitlines() if not l.startswith("#")).strip()
        if not prose or len(prose) < 50 or "{{" in body:
            bad.append(a.get("code", "?"))
    return bad


def _local_doc_codes(proj_dir):
    """로컬 추적 문서 코드 집합(파일명 stem). _접두/sync:false 제외."""
    import glob
    codes = set()
    for d in DOC_DIRS:
        for f in glob.glob(os.path.join(proj_dir, ".ouroboros", "docs", d, "*.md")):
            stem = os.path.basename(f)[:-3]
            if stem.startswith("_"):
                continue
            try:  # sync:false 프론트매터 제외(본문 반출 안 함)
                head = open(f, encoding="utf-8").read(600)
                if "sync: false" in head or "sync:false" in head:
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
        if a.get("type") in TRACKED and a.get("status") != "Superseded":
            plm.add(a.get("code", "?"))
    local = _local_doc_codes(proj_dir)
    if not local and not plm:
        return [], []
    local_only = sorted(local - plm)   # 로컬에 있으나 PLM 미반영(동기 필요)
    plm_only = sorted(plm - local)     # PLM에 있으나 로컬 파일 없음(드리프트/잔여)
    return local_only, plm_only


def main():
    api = os.environ.get("PLM_API_URL", "").rstrip("/")
    project = os.environ.get("PLM_PROJECT", "")
    token = os.environ.get("PLM_API_TOKEN", "")
    if not (api and project):
        return
    proj_dir = os.environ.get("CLAUDE_PROJECT_DIR", "")
    gates = get(f"{api}/gates?project={project}")
    review = get(f"{api}/review-queue?project={project}")
    export = get_auth(f"{api}/export?project={project}", token)
    thin = thin_body_artifacts(export)
    local_only, plm_only = sync_drift(export, proj_dir)
    if gates is None and review is None and not thin and not local_only and not plm_only:
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
    if gates:
        by = {}
        for o in gates:
            by.setdefault(o.get("gate", "?"), []).append(o.get("code", "?"))
        for g in ("G1", "G2", "G3"):
            if g in by:
                lines.append(f"  {g} orphan: {', '.join(by[g][:8])}")
    if review:
        # @plm  재검토 표시 정제 — Superseded 잔여 + 기계생성 Code(사람 검토 비대상) 제외, 산문 아티팩트만.
        skip = set()
        if export:
            for a in export.get("artifacts", []):
                if a.get("status") == "Superseded" or a.get("type") == "Code":
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
