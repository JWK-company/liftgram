#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""SPEC-036 기존 제작 목록(289개)을 그대로 두고 extra_motions.py 의 행을 더한다. 기존 키의 입력·프롬프트는 바꾸지 않는다.
사용: grades_extra.py <specs.json> <base jobs.json> <출력 jobs.json> <새 키 25.txt> <새 키 49.txt> [held.json]
held.json = {"nameEn": "사유"} 는 만들지 않고 사유만 남긴다(publish 가 멈추지 않게)."""
import json, os, sys, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extra_motions import M
spec, base, out, k25, k49 = sys.argv[1:6]; held = json.load(open(sys.argv[6])) if len(sys.argv) > 6 else {}
d = json.load(open(spec)); b = json.load(open(base)); jobs, links, reasons = b["jobs"], b["links"], b["reasons"]
frozen = set(jobs); rows = {r["id"]: r for r in d["rows"]}; miss = []; new = {}; clash = []
for i, why in list(reasons.items()):
    r = rows[i]; name = r["nameEn"]; m = M.get(name)
    if name in held: reasons[i] = held[name]; continue
    if not m: miss.append(name); continue
    if "link" in m:
        if m["link"] not in jobs: raise SystemExit(f"연결 대상 없음 {m['link']}")
        links[i] = m["link"]; reasons.pop(i); continue
    c = d["clips"][r["key"]]; arch = r["key"].split("__")[0]
    k = r["key"].replace(arch+"__", arch+"-"+m["slug"]+"__", 1) if m["slug"] else r["key"]
    if k in frozen: k = k.replace(arch+"__", arch+"-x__", 1)   # 기존 영상과 다른 정의: 기존 키를 건드리지 않는다
    j = new.get(k)
    if j and json.dumps(j["ov"], sort_keys=True) != json.dumps(m["ov"], sort_keys=True): clash.append((k, name)); continue
    if not j:
        j = {**c, "key": k, "ov": m["ov"], "rows": [], "prompt": m.get("prompt") or name}
        for f in ("nf", "loop", "thumb"):
            if f in m: j[f] = m[f]
        new[k] = j
    j["rows"].append(r["nameKo"]); links[i] = k; reasons.pop(i)
if clash: raise SystemExit(f"같은 키에 다른 정의 {len(clash)}: {clash}")
jobs.update(new)
if miss: print("정의 없음", len(miss), miss)
names = {r["nameEn"] for r in d["rows"]}; dead = sorted(n for n in M if n not in names)
if dead: print("카탈로그에 없는 정의", dead)
with open(out, "w") as f: json.dump(dict(jobs=jobs, links=links, reasons=reasons), f, ensure_ascii=False)
for p, nf in ((k25, None), (k49, 49)):
    with open(p, "w") as f: f.write("".join(k+"\n" for k, j in new.items() if j.get("nf") == nf))
c = collections.Counter(j.get("nf", 25) for j in new.values())
print("행", len(rows), "연결", len(links), "영상", len(jobs), "새 영상", len(new), dict(c), "남은 사유", len(reasons))
