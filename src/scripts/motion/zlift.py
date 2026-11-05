#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""사전 점검 지표의 파묻힘(sink_frames)을 overrides.json 의 zlift 로 옮긴다. 수렴할 때까지 점검과 번갈아 돌린다.
사용: zlift.py <P 폴더> <keys.txt> <overrides.json>"""
import json, os, sys
P, keys, ovp = sys.argv[1:4]; o = json.load(open(ovp)); n = 0
for k in [x.strip() for x in open(keys) if x.strip()]:
    m = json.load(open(f"{P}/{k}/{k}.json")); s = [max(0, -z-.003) for z in m.get("sink_frames", [])]
    if m.get("ex") != "generic" or len(s) != 5 or max(s) < .007: continue
    old = o.get(k, {}).get("zlift", [0]*5); o.setdefault(k, {})["zlift"] = [round(min(a+b, .35), 3) for a, b in zip(old, s)]; n += 1
json.dump(o, open(ovp, "w"), ensure_ascii=False, indent=0); print("조정", n)
