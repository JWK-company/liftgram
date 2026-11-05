#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""검수 시트: 키마다 5프레임(시작·1/4·중간·3/4·끝)과 연결된 종목 이름. 프레임 폴더 안의 PNG 를 쓴다(N/<키> 또는 합성 <키>/frames).
사용: make_sheet.py <폴더> <keys.txt> <출력.jpg> [칸=170] [줄당 키 수=2] [--jobs jobs.json] [--sub frames]"""
import argparse, glob, json
from PIL import Image, ImageDraw
A = argparse.ArgumentParser(); A.add_argument("src"); A.add_argument("keys"); A.add_argument("out"); A.add_argument("W", nargs="?", type=int, default=170); A.add_argument("PER", nargs="?", type=int, default=2); A.add_argument("--jobs"); A.add_argument("--sub", default=""); a = A.parse_args()
keys = [k.strip() for k in open(a.keys) if k.strip()]; W, PER = a.W, a.PER; JOBS = json.load(open(a.jobs))["jobs"] if a.jobs else {}
CN, LAB = 5, 34
rows = (len(keys)+PER-1)//PER
sheet = Image.new("RGB", (PER*(W*CN+8), rows*(W+LAB+4)), (255, 255, 255)); d = ImageDraw.Draw(sheet)
for n, k in enumerate(keys):
    x, y = (n % PER)*(W*CN+8), (n//PER)*(W+LAB+4); fs = sorted(glob.glob(f"{a.src}/{k}/{a.sub}/*.png".replace("//", "/")))
    d.text((x+2, y+2), f"{n} {k}", fill=(170, 20, 20)); d.text((x+2, y+16), " · ".join(JOBS.get(k, {}).get("rows", []))[:150], fill=(60, 60, 60))
    pick = [fs[round(i*(len(fs)-1)/(CN-1))] for i in range(CN)] if len(fs) >= CN else fs
    for i, f in enumerate(pick):
        im = Image.open(f).convert("RGBA"); b = Image.new("RGB", im.size, (246, 246, 244)); b.paste(im, (0, 0), im); sheet.paste(b.resize((W, W), Image.LANCZOS), (x+i*W, y+LAB))
sheet.save(a.out, quality=86); print(a.out, sheet.size)
