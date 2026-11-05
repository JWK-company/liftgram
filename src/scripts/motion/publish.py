#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""합격 영상만 release/ 로 내보내고 publish.json 을 쓴다. 조건: jobs 의 키 · qc 합격(불량은 waivers 에 사유가 있을 때만) · 합성 해시 일치.
사용: publish.py <jobs.json> <qc.json> <합성폴더> <waivers.json> <release폴더> <publish.json>
하나라도 조건을 못 맞추면 아무것도 쓰지 않고 멈춘다. release 는 추가 전용이다."""
import hashlib, json, os, shutil, sys
jobs, qc, comp, waivers, rel, out = sys.argv[1:7]
keys = list(json.load(open(jobs))["jobs"]); q = json.load(open(qc)); w = json.load(open(waivers)); pub = {}; bad = []
for k in keys:
    r = q.get(k)
    if not r: bad.append((k, "판정 없음")); continue
    if r["v"] == "fail" and (k not in w or not all(x.split("=")[0] in w[k]["metrics"] for x in r["fail"])): bad.append((k, r["fail"])); continue
    info = json.load(open(f"{comp}/{k}/info.json")); mp4 = f"{comp}/{k}/{k}.mp4"
    if hashlib.sha256(open(mp4, "rb").read()).hexdigest() != info["sha256"]: bad.append((k, "합성 해시 불일치")); continue
    pub[k] = k.replace("+", "-")+"."+info["sha8"]
stale = [k for k in w if k not in keys]
if stale: bad.append(("waivers", stale))
if bad:
    print("내보내기 중단", bad); raise SystemExit(1)
os.makedirs(rel, exist_ok=True)
for k, n in pub.items():
    for src, ext in ((f"{comp}/{k}/{k}.mp4", ".mp4"), (f"{comp}/{k}/thumb.webp", ".webp")):
        if not os.path.exists(f"{rel}/{n}{ext}"): shutil.copy(src, f"{rel}/{n}{ext}.tmp"); os.replace(f"{rel}/{n}{ext}.tmp", f"{rel}/{n}{ext}")
with open(out, "w") as f: json.dump(pub, f, ensure_ascii=False, indent=0)
print("내보냄", len(pub), "예외 승인", sum(1 for k in pub if q[k]["v"] == "fail"))
