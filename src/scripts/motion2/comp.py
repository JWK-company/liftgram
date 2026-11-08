#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""합성·인코딩·합성 뒤 지표. 사용: comp.py <키> <프레임폴더(N,M)> <Wan폴더> <출력폴더> <ffmpeg> [loop=pingpong]
몸(머리·손·신발 제외)만 Wan, 나머지는 Blender, 전체 무채색. 결과: <키>.mp4, thumb.webp, info.json"""
import glob, hashlib, json, os, shutil, subprocess, sys
import numpy as np
from PIL import Image, ImageFilter
BG = (248, 248, 246); BGF = np.array(BG, dtype=np.float32)/255; TINT = np.array([.985, .995, 1.0])
arr = lambda im: np.asarray(im, dtype=np.float32)/255
LIM = dict(iou=0.94, hole=0.01, skin=0.02, lum=(0.62, 0.80), seam=0.03)   # 윤곽: Wan 을 쓰는 몸 자리만 재며 3대운동 실측 0.945~0.956. 휘도: 기준본 0.69~0.72 주변
def one(key, src, wan, out, ff, loop="pingpong"):
    Ns, Ms, Ws = sorted(glob.glob(f"{src}/N/*.png")), sorted(glob.glob(f"{src}/M/*.png")), sorted(glob.glob(f"{wan}/*.png"))
    if not (len(Ns) == len(Ms) == len(Ws) and Ns): raise SystemExit(f"{key}: 프레임 수 {len(Ns)},{len(Ms)},{len(Ws)}")
    fr = f"{out}/frames"; shutil.rmtree(fr, ignore_errors=True); os.makedirs(fr); ious, holes, skins, lums, flick = [], [], [], [], []; pv = None
    for i, (n, m, w) in enumerate(zip(Ns, Ms, Ws)):
        im = Image.open(n).convert("RGBA"); b = Image.new("RGB", im.size, BG); b.paste(im, (0, 0), im); base = arr(b)
        wa = arr(Image.open(w).convert("RGB").resize(im.size, Image.LANCZOS))
        mk = Image.open(m).convert("RGBA"); mb = Image.new("L", im.size, 0); mb.paste(mk.convert("L"), (0, 0), mk.split()[3])
        k0 = arr(mb); k = arr(mb.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.3)))
        fg = np.abs(wa-BGF).sum(axis=2) > .15; bfg = np.abs(base-BGF).sum(axis=2) > .15; near = (arr(mb.filter(ImageFilter.MaxFilter(15))) > .5) & ~((arr(mk.split()[3]) > .5) & (k0 < .5))   # Blender 를 그대로 쓰는 머리·손·옷·소품 자리는 재지 않는다
        ious.append(float((fg & bfg & near).sum()/max(((fg | bfg) & near).sum(), 1)))
        use = k > .5; hole = use & ~fg; holes.append(float(hole.sum()/max(use.sum(), 1)))
        # 살색 비율: 변환 전 Wan 몸 영역에서 R>G>B 이고 채도가 있는 픽셀
        if use.sum():
            px = wa[use]; sat = px.max(axis=1)-px.min(axis=1); skins.append(float(((px[:, 0] > px[:, 1]) & (px[:, 1] > px[:, 2]) & (sat > .10)).mean()))
            lums.append(float((px*[.299, .587, .114]).sum(axis=1).mean()))
        k2 = k*(1-arr(Image.fromarray((hole*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.5))))
        o = base*(1-k2[..., None])+wa*k2[..., None]
        l = (o*[.299, .587, .114]).sum(axis=2, keepdims=True); o = l*TINT
        if pv is not None:
            both = use & pv[1]
            if both.sum() > 50: flick.append(float(np.percentile(np.abs((l[..., 0]-pv[0])-((base*[.299, .587, .114]).sum(axis=2)-pv[2]))[both], 95)))
        pv = (l[..., 0], use, (base*[.299, .587, .114]).sum(axis=2))
        Image.fromarray((np.clip(o, 0, 1)*255).astype(np.uint8)).save(f"{fr}/{i:03d}.png")
    fs = sorted(glob.glob(fr+"/*.png")); t = f"{out}/seq"; shutil.rmtree(t, ignore_errors=True); os.makedirs(t)
    seq = fs[:-1] if loop == "cycle" else fs+fs[-2:0:-1]
    for j, f in enumerate(seq): os.symlink(os.path.abspath(f), f"{t}/{j:03d}.png")
    mp4 = f"{out}/{key}.mp4"
    subprocess.run([ff, "-y", "-loglevel", "error", "-framerate", "24", "-i", f"{t}/%03d.png", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", f"{mp4}.tmp.mp4"], check=True); os.replace(f"{mp4}.tmp.mp4", mp4)
    Image.open(fs[len(fs)//2]).convert("RGB").resize((192, 192), Image.LANCZOS).save(f"{out}/thumb.webp", quality=78)
    seam = None
    if loop == "cycle": seam = float(np.abs(arr(Image.open(fs[0]).convert("L"))-arr(Image.open(fs[-1]).convert("L"))).mean())
    sha = hashlib.sha256(open(mp4, "rb").read()).hexdigest()
    info = dict(key=key, frames=len(fs), iou_min=min(ious), hole_max=max(holes), skin_max=max(skins or [0]), lum_mean=float(np.mean(lums)) if lums else None, lum_std=float(np.std(lums)) if lums else None, flicker_p95=max(flick or [0]), seam=seam, kb=os.path.getsize(mp4)//1024, sha256=sha, sha8=sha[:8])
    fl = []
    if info["iou_min"] < LIM["iou"]: fl.append(f"윤곽 일치도 {info['iou_min']:.3f}")
    if info["hole_max"] > LIM["hole"]: fl.append(f"지워진 비율 {info['hole_max']*100:.1f}%")
    if info["skin_max"] > LIM["skin"]: fl.append(f"살색 비율 {info['skin_max']*100:.1f}%")
    if lums and not (LIM["lum"][0] <= info["lum_mean"] <= LIM["lum"][1]): fl.append(f"재질 밝기 {info['lum_mean']:.3f}")
    if seam is not None and seam > LIM["seam"]: fl.append(f"순환 이음새 {seam:.3f}")
    info["fail"] = fl; json.dump(info, open(f"{out}/info.json", "w"), indent=1); shutil.rmtree(t, ignore_errors=True); return info
if __name__ == "__main__":
    a = sys.argv[1:]; print(json.dumps(one(*a), ensure_ascii=False))
