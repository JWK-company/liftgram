#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""투명 렌더를 시험본과 같은 배경색으로 평탄화해 Wan 입력을 만든다. 사용: flatten.py <N폴더> <F폴더>"""
import glob, os, shutil, sys
from PIL import Image
src, dst = sys.argv[1:3]; shutil.rmtree(dst, ignore_errors=True); os.makedirs(dst)
for f in sorted(glob.glob(f"{src}/*.png")):
    im = Image.open(f).convert("RGBA"); b = Image.new("RGB", im.size, (248, 248, 246)); b.paste(im, (0, 0), im); b.save(f"{dst}/{os.path.basename(f)}")
