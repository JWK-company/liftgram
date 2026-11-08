#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""자극 부위 칠하기(시안). 합성이 끝난 무채색 프레임에 muscle.py 의 R 마스크를 얹어 주동근은 빨강, 보조근은 옅은 빨강으로 칠한다.
명암(휘도)은 그대로 두고 색만 입혀 Wan 재질감이 남는다. 사용: tint.py <키> <프레임폴더> <R폴더> <출력.mp4> <ffmpeg> [loop=pingpong]"""
import glob, os, shutil, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageFilter
arr = lambda im: np.asarray(im, dtype=np.float32)/255
RED = np.array([1.0, 0.16, 0.13]); SOFT = 0.32   # 주동근 색 · 보조근 세기(주동근이 가려진 구도에서 보조근이 더 눈에 띄지 않게)
def tint(fr, mk):
    o = arr(Image.open(fr).convert("RGB")); m = Image.open(mk).convert("RGB").resize((o.shape[1], o.shape[0]), Image.BILINEAR)
    r = arr(m.getchannel("R").filter(ImageFilter.GaussianBlur(1.2))); g = arr(m.getchannel("G").filter(ImageFilter.GaussianBlur(1.2)))
    a = np.clip(np.maximum(r, g*SOFT), 0, 1)[..., None]*0.85
    l = (o*[.299, .587, .114]).sum(axis=2, keepdims=True)
    col = np.clip(l*1.55*RED+0.04, 0, 1)   # 어두운 면은 짙은 빨강, 밝은 면은 밝은 빨강
    return o*(1-a)+col*a
def main(key, frames, rdir, out, ff, loop="pingpong"):
    Fs, Rs = sorted(glob.glob(f"{frames}/*.png")), sorted(glob.glob(f"{rdir}/*.png"))
    if len(Fs) != len(Rs) or not Fs: raise SystemExit(f"{key}: 프레임 수 {len(Fs)},{len(Rs)}")
    if loop not in ("pingpong", "cycle"): raise SystemExit(f"{key}: 모르는 반복 방식 {loop}")
    t = tempfile.mkdtemp(); outs = []
    try:   # [개선] REV-073: 실패해도 임시 폴더를 지우고, 잘린 mp4 가 남지 않게 임시 이름으로 쓴 뒤 바꿔 넣는다. 썸네일 원본(png)은 마지막에
        for i, (f, m) in enumerate(zip(Fs, Rs)):
            p = f"{t}/f{i:03d}.png"; Image.fromarray((np.clip(tint(f, m), 0, 1)*255).astype(np.uint8)).save(p); outs.append(p)
        seq = outs[:-1] if loop == "cycle" else outs+outs[-2:0:-1]
        for j, p in enumerate(seq): os.symlink(p, f"{t}/s{j:03d}.png")
        # [원본] subprocess.run([ff, ..., "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], check=True)
        subprocess.run([ff, "-y", "-loglevel", "error", "-framerate", "24", "-i", f"{t}/s%03d.png", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", f"{out}.tmp.mp4"], check=True)
        os.replace(f"{out}.tmp.mp4", out); Image.open(outs[len(outs)//2]).save(out[:-4]+".png")
    finally: shutil.rmtree(t, ignore_errors=True)
if __name__ == "__main__": main(*sys.argv[1:])
