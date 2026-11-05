#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""합격 영상 목록 → 앱 매핑 표(src/core/src/data/exerciseMotion.data.ts). 영상이 있는 종목만 넣는다.
사용: gen-map.py <jobs.json> <publish.json> <출력.ts>  publish.json = {"key": "파일 이름(확장자 제외)"}"""
import json, sys
jobs = json.load(open(sys.argv[1])); pub = json.load(open(sys.argv[2])); out = sys.argv[3]
unknown = [k for k in pub if k not in jobs["jobs"]]
if unknown: raise SystemExit(f"제작 목록에 없는 영상: {unknown}")
links = {i: pub[k] for i, k in jobs["links"].items() if k in pub}
body = "".join(f'  "{i}": "{links[i]}",\n' for i in sorted(links))
open(out, "w").write(f"""// 생성 파일 — src/scripts/motion/gen-map.py 가 만든다. 손으로 고치지 않는다(SPEC-034).
// 종목 id → 운동 영상 파일 이름(/motion/<이름>.mp4 · .webp). 없는 종목은 픽토그램을 그린다.
export const EXERCISE_MOTION: Readonly<Record<string, string>> = {{
{body}}};
""")
print("종목", len(links), "영상", len(set(links.values())))
