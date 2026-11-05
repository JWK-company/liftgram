#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""합성·인코딩·지표. 몸(손·옷 제외)만 Wan · 나머지는 Blender 원본 · 주동근은 음영을 살려 빨강. 재시작 안전(입력 지문).
사용: composite.py <keys.txt> <렌더폴더> <Wan폴더> <출력폴더> [--ffmpeg 경로] [--workers 8] [--force]"""
import argparse, glob, hashlib, json, os, shutil, subprocess, traceback
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from PIL import Image, ImageFilter
A = argparse.ArgumentParser(); A.add_argument("keys"); A.add_argument("src"); A.add_argument("wan"); A.add_argument("out"); A.add_argument("--ffmpeg", default=os.environ.get("MOTION_FFMPEG", "ffmpeg")); A.add_argument("--workers", type=int, default=8); A.add_argument("--force", action="store_true"); a = A.parse_args()
BG = (248, 248, 246); BGF = np.array(BG, dtype=np.float32)/255
CODE = hashlib.sha256(open(__file__, "rb").read()).hexdigest()
arr = lambda im: np.asarray(im, dtype=np.float32)/255
def linear(c):   # 마스크는 Standard(sRGB) 로 저장된다 → 칠한 면적 값으로 되돌린다
    return np.where(c <= .04045, c/12.92, ((c+.055)/1.055)**2.4)
def blurch(c, mf, g):
    im = Image.fromarray((np.clip(c, 0, 1)*255).astype(np.uint8))
    if mf: im = im.filter(ImageFilter.MaxFilter(mf))
    return arr(im.filter(ImageFilter.GaussianBlur(g)))
def one(k):
    out = f"{a.out}/{k}"; info = out+"/info.json"
    try:
        Ns = sorted(glob.glob(f"{a.src}/N/{k}/{k}_0*.png")); Ms = sorted(glob.glob(f"{a.src}/M/{k}/{k}_mask_*.png")); Ws = sorted(glob.glob(f"{a.wan}/{k}/*.png"))
        if not (len(Ns) == len(Ms) == len(Ws) and Ns): return dict(key=k, error=f"프레임 수 {len(Ns)},{len(Ms)},{len(Ws)}")
        for p in (f"{a.src}/N/{k}/.done", f"{a.src}/M/{k}/.done", f"{a.wan}/{k}/.done"):
            if not os.path.exists(p): return dict(key=k, error=f"완료 표시 없음 {p}")
        n_m = json.load(open(f"{a.src}/N/{k}/.done")); m_m = json.load(open(f"{a.src}/M/{k}/.done"))
        if n_m["input"] != m_m["input"] or n_m["code"] != m_m["code"]: return dict(key=k, error="beauty·mask 입력이 다름")
        man = hashlib.sha256(json.dumps([CODE, n_m, m_m, open(f"{a.wan}/{k}/.done").read()], sort_keys=True).encode()).hexdigest()
        if os.path.exists(info) and not a.force:
            d = json.load(open(info))
            if d.get("manifest") == man: return d
        fr = f"{out}/frames"; shutil.rmtree(fr, ignore_errors=True); os.makedirs(fr)
        ious, holes, flick = [], [], []; pv = None
        for i, (n, m, w) in enumerate(zip(Ns, Ms, Ws)):
            im = Image.open(n).convert("RGBA"); b = Image.new("RGB", im.size, BG); b.paste(im, (0, 0), im); base = arr(b); alpha = arr(im)[..., 3]
            wan = arr(Image.open(w).convert("RGB").resize(im.size, Image.LANCZOS)); mk = linear(arr(Image.open(m).convert("RGB").resize(im.size)))
            c = np.clip(blurch(mk[..., 1], 3, 1.4)*(1-blurch(mk[..., 2], 5, 1.6)), 0, 1)
            o = base*(1-c[..., None])+wan*c[..., None]
            # 빨강은 몸 실루엣 안에서만: 흰 배경으로 번지면 붉은 테두리가 된다
            r = (np.clip(blurch(mk[..., 0], 0, 1.8)*1.08, 0, 1)*blurch(alpha, 0, .8))[..., None]
            l = (o*[.3, .59, .11]).sum(axis=2, keepdims=True); l2 = np.clip(l*1.2, .2, 1)**1.1
            red = l2*np.array([1.5, .24, .22]); o = o*(1-r*.8)+red*(r*.8)
            Image.fromarray((np.clip(o, 0, 1)*255).astype(np.uint8)).save(f"{fr}/{i:03d}.png")
            # 지표는 Wan 을 실제로 쓰는 영역(c)에서만 잰다
            use = c > .5; near = blurch(c, 15, 4) > .02
            wfg = np.abs(wan-BGF).sum(axis=2) > .18; bfg = np.abs(base-BGF).sum(axis=2) > .18
            ious.append(float((wfg & bfg & near).sum()/max(((wfg | bfg) & near).sum(), 1)))
            holes.append(float((use & ~wfg).sum()/max(use.sum(), 1)))
            lw, lb = wan.mean(axis=2), base.mean(axis=2)
            if pv is not None:
                both = use & pv[2]
                if both.sum() > 50: flick.append(float(np.percentile(np.abs((lw-pv[0])-(lb-pv[1]))[both], 95)))
            pv = (lw, lb, use)
        fs = sorted(glob.glob(fr+"/*.png")); seq = fs+fs[-2:0:-1]; t = out+"/seq"; shutil.rmtree(t, ignore_errors=True); os.makedirs(t)
        for i, f in enumerate(seq): os.link(f, f"{t}/{i:03d}.png")
        mp4 = f"{out}/{k}.mp4"; tmp = mp4+".tmp.mp4"
        subprocess.run([a.ffmpeg, "-y", "-loglevel", "error", "-framerate", "20", "-i", f"{t}/%03d.png", "-vf", "scale=704:704:flags=lanczos:out_color_matrix=bt709:out_range=tv", "-c:v", "libx264", "-crf", "24", "-preset", "slow", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-bsf:v", "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1", "-movflags", "+faststart", "-an", tmp], check=True)
        os.replace(tmp, mp4); shutil.rmtree(t)
        sha = hashlib.sha256(open(mp4, "rb").read()).hexdigest()
        Image.open(fs[-1]).resize((192, 192), Image.LANCZOS).save(f"{out}/thumb.webp", quality=78, method=6)
        d = dict(key=k, manifest=man, bytes=os.path.getsize(mp4), sha8=sha[:8], sha256=sha, iou_min=round(min(ious), 3), hole_max=round(max(holes), 4), flicker_p95=round(max(flick), 4) if flick else 0)
        with open(info+".tmp", "w") as f: json.dump(d, f)
        os.replace(info+".tmp", info); return d
    except Exception as e:
        return dict(key=k, error=repr(e)[:300], trace=traceback.format_exc()[-800:])
if __name__ == "__main__":
    keys = [k.strip() for k in open(a.keys) if k.strip()]
    with ProcessPoolExecutor(a.workers) as ex: res = list(ex.map(one, keys))
    with open(f"{a.out}/report.json", "w") as f: json.dump(res, f, ensure_ascii=False, indent=0)
    ok = [r for r in res if "error" not in r]; er = [r for r in res if "error" in r]
    print("완료", len(ok), "오류", len(er), [(r["key"], r["error"]) for r in er]); print("합계MB", round(sum(r["bytes"] for r in ok)/1e6, 1), "최대KB", max((r["bytes"] for r in ok), default=0)//1024)
    raise SystemExit(1 if er else 0)
