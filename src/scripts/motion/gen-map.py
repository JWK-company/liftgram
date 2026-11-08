#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""합격 영상 목록 → 앱 매핑 표(src/core/src/data/exerciseMotion.data.ts). 영상이 있는 종목만 넣는다.
사용: gen-map.py <jobs.json> <publish.json> <출력.ts> <motion_hold.json>  publish.json = {"key": "파일 이름(확장자 제외)"}
motion_hold.json 의 keys 는 검수에서 보류한 영상이다. 표에 넣지 않아 그 종목은 픽토그램으로 돌아간다. 빠뜨리면 보류가 조용히 되살아나므로 필수다."""
import json, sys
# SPEC-040: 새 모션을 합친 뒤에는 이 도구가 표 전체를 다시 만들어 컨펌본을 덮는다. 표는 src/scripts/motion2/publish.py 로만 고친다
raise SystemExit("gen-map.py 는 막혀 있습니다. 표는 src/scripts/motion2/publish.py merge 로 고칩니다(SPEC-040)")
if len(sys.argv) != 5: raise SystemExit(__doc__)
jobs = json.load(open(sys.argv[1])); pub = json.load(open(sys.argv[2])); out = sys.argv[3]
unknown = [k for k in pub if k not in jobs["jobs"]]
if unknown: raise SystemExit(f"제작 목록에 없는 영상: {unknown}")
# [원본] links = {i: pub[k] for i, k in jobs["links"].items() if k in pub}
# [개선] 보류 목록을 뺀다. 오타로 조용히 안 빠지는 일이 없게 모르는 키는 멈춘다
hold = set(json.load(open(sys.argv[4]))["keys"])
stale = [k for k in hold if k not in pub or k not in jobs["links"].values()]
if stale: raise SystemExit(f"보류 목록에 영상이 없는 키: {stale}")
links = {i: pub[k] for i, k in jobs["links"].items() if k in pub and k not in hold}
body = "".join(f'  "{i}": "{links[i]}",\n' for i in sorted(links))
open(out, "w").write(f"""// 생성 파일 — src/scripts/motion/gen-map.py 가 만든다. 손으로 고치지 않는다(SPEC-034).
// 종목 id → 운동 영상 파일 이름(/motion/<이름>.mp4 · .webp). 없는 종목은 픽토그램을 그린다.
export const EXERCISE_MOTION: Readonly<Record<string, string>> = {{
{body}}};
""")
print("종목", len(links), "영상", len(set(links.values())))
