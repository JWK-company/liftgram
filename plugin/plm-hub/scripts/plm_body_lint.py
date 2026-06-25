#!/usr/bin/env python3
"""기획 아티팩트 .md 본문 충실도 lint(비차단 경고).

본문이 '제목 한 줄'로 끝나는 문제 방지: 템플릿 `##` 섹션이 실내용으로 채워졌는지 점검.
대상 type: URS·UCS·SRS·SAD·ADR(산문). Code·Roadmap 등은 제외.
graceful: 항상 exit 0. 인자: --file <path>
"""
import os
import re
import sys

PROSE = {"URS", "UCS", "SRS", "SAD", "ADR"}


def _unquote(s):
    # 둘러싼 따옴표 제거 (platform-build A1 — ADR-005)
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
        return s[1:-1].strip()
    return s


def parse(text):
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if not m:
        return {}, text
    fm = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.startswith(" "):
            k, _, v = line.partition(":")
            fm[k.strip()] = _unquote(v)
    return fm, m.group(2)


def lint(path):
    try:
        fm, body = parse(open(path, encoding="utf-8").read())
    except Exception:
        return []
    if fm.get("type") not in PROSE:
        return []
    issues = []
    # 1) 미치환 플레이스홀더
    if "{{" in body:
        issues.append("미치환 플레이스홀더({{...}}) 남음")
    # 2) 섹션 구조
    sections = re.findall(r"^##\s+(.+)$", body, re.M)
    if len(sections) < 2:
        issues.append(f"`##` 섹션 {len(sections)}개(≥2 권장 — 템플릿 섹션 채우기)")
    # 3) 빈 섹션(헤더 바로 뒤 내용 없음)
    blocks = re.split(r"^##\s+.+$", body, flags=re.M)[1:]
    empty = sum(1 for b in blocks if len(b.strip()) < 3)
    if empty:
        issues.append(f"빈 섹션 {empty}개(내용 없음)")
    # 4) 산문 분량(헤더 제외 본문 텍스트)
    prose = re.sub(r"^#+.*$", "", body, flags=re.M).strip()
    if len(prose) < 50:
        issues.append(f"본문 분량 빈약({len(prose)}자 — 구체 내용 보강)")
    return issues


def main():
    if "--file" not in sys.argv:
        return
    path = sys.argv[sys.argv.index("--file") + 1]
    if not os.path.exists(path):
        return
    issues = lint(path)
    if issues:
        code = path.rsplit("/", 1)[-1].replace(".md", "")
        print(f"[body-lint] ⚠ {code} 본문 보강 권장: " + " · ".join(issues)
              + " (스킬 가이드 '본문 작성 규칙' 참고, 비차단)")


if __name__ == "__main__":
    main()
