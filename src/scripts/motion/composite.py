#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""합성·인코딩·지표. 몸(손·옷 제외)만 Wan · 나머지는 Blender 원본 · 주동근은 음영을 살려 빨강. 재시작 안전(입력 지문).
사용: composite.py <keys.txt> <렌더폴더> <Wan폴더> <출력폴더> [--ffmpeg 경로] [--workers 8] [--force]"""
import argparse, glob, hashlib, json, os, shutil, subprocess, traceback
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from PIL import Image, ImageFilter
A = argparse.ArgumentParser(); A.add_argument("keys"); A.add_argument("src"); A.add_argument("wan"); A.add_argument("out"); A.add_argument("--ffmpeg", default=os.environ.get("MOTION_FFMPEG", "ffmpeg")); A.add_argument("--workers", type=int, default=8); A.add_argument("--force", action="store_true"); A.add_argument("--jobs", default="jobs.json"); a = A.parse_args()
# [원본] JOBS = json.load(open(a.jobs))["jobs"] if os.path.exists(a.jobs) else {}
# [개선] 경로가 틀리면 cycle 영상이 조용히 왕복으로 인코딩되므로 멈춘다
JOBS = json.load(open(a.jobs))["jobs"]
BG = (248, 248, 246); BGF = np.array(BG, dtype=np.float32)/255
CODE = hashlib.sha256(open(__file__, "rb").read()).hexdigest()
arr = lambda im: np.asarray(im, dtype=np.float32)/255
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
        if n_m.get("red") or m_m.get("red"): return dict(key=k, error="검수용 빨강 렌더는 합성하지 않는다")
        if os.path.getmtime(f"{a.wan}/{k}/.done") < os.path.getmtime(f"{a.src}/N/{k}/.done"): return dict(key=k, error="Wan 이 렌더보다 오래됨(refine 을 먼저 돌린다)")
        man = hashlib.sha256(json.dumps([CODE, n_m, m_m, open(f"{a.wan}/{k}/.done").read()], sort_keys=True).encode()).hexdigest()
        if os.path.exists(info) and not a.force:
            d = json.load(open(info))
            if d.get("manifest") == man and os.path.exists(f"{out}/{k}.mp4") and os.path.exists(f"{out}/thumb.webp") and len(glob.glob(f"{out}/frames/*.png")) == len(Ws): return d
        fr = f"{out}/frames"; shutil.rmtree(fr, ignore_errors=True); os.makedirs(fr)
        ious, holes, flick, backs, chroma, jumps = [], [], [], [], [], []; pv = None
        for i, (n, m, w) in enumerate(zip(Ns, Ms, Ws)):
            im = Image.open(n).convert("RGBA"); b = Image.new("RGB", im.size, BG); b.paste(im, (0, 0), im); base = arr(b); alpha = arr(im)[..., 3]
            wan = arr(Image.open(w).convert("RGB").resize(im.size, Image.LANCZOS)); mk = arr(Image.open(m).convert("RGB").resize(im.size))   # 저장값 그대로: 승인된 v3 의 빨강 범위
            c = np.clip(blurch(mk[..., 1], 3, 1.4)*(1-blurch(mk[..., 2], 5, 1.6)), 0, 1)
            c0 = c
            # Wan 이 믿을 수 없는 자리는 Blender 로 되돌린다: 팔다리를 배경으로 지운 곳(유령 팔·흰 띠), 반바지를 살 위로 그린 곳(찢어진 밑단)
            lw0, lb0 = wan.mean(axis=2), base.mean(axis=2)
            lost = np.abs(wan-BGF).sum(axis=2) <= .18; dark = (lw0 < .2) & (lb0 > .4)
            c = c*(1-blurch(((lost | dark)*1.0).astype(np.float32), 5, 1.6)*1.3).clip(0, 1)
            o = base*(1-c[..., None])+wan*c[..., None]
            # 빨강은 몸 실루엣 안에서만: 흰 배경으로 번지면 붉은 테두리가 된다
            o0 = o
            r = (np.clip(blurch(mk[..., 0], 0, 1.8)*1.08, 0, 1)*blurch(alpha, 0, .8))[..., None]
            l = (o*[.3, .59, .11]).sum(axis=2, keepdims=True); l2 = np.clip(l*1.2, .2, 1)**1.1; cl = blurch(mk[..., 2], 0, 1.6)[..., None]; l2 = l2*(1-cl)+np.maximum(l2, .5+.3*l)*cl   # 옷 위에서만 하한: 검은 반바지 위에서도 빨강이 보이게. 살은 음영 유지
            red = l2*np.array([1.5, .24, .22]); o = o*(1-r*.8)+red*(r*.8)
            Image.fromarray((np.clip(o, 0, 1)*255).astype(np.uint8)).save(f"{fr}/{i:03d}.png")
            # 지표는 Wan 을 실제로 쓰는 영역(c)에서만 잰다
            use = c0 > .5; near = blurch(c0, 15, 4) > .02; backs.append(float((use & (c <= .5)).sum()/max(use.sum(), 1)))
            wfg = np.abs(wan-BGF).sum(axis=2) > .18; bfg = np.abs(base-BGF).sum(axis=2) > .18
            ious.append(float((wfg & bfg & near).sum()/max(((wfg | bfg) & near).sum(), 1)))
            holes.append(float((use & ~wfg).sum()/max(use.sum(), 1)))
            # 떨림은 화면에 실제로 나간 합성(빨강 전)에서: Blender 변화와 다른 만큼만 잰다. 되돌리기 칸이 깜빡이는지도 본다
            lw, lb = o0.mean(axis=2), base.mean(axis=2); on = c > .5
            if on.sum() > 50:
                d_ = (wan-wan.mean(axis=2, keepdims=True))-(base-base.mean(axis=2, keepdims=True))   # 색 변질(자주빛 등)
                chroma.append(float(np.percentile(np.sqrt((d_**2).sum(axis=2))[on], 95)))
            if pv is not None:
                both = on & pv[2]
                if both.sum() > 50: flick.append(float(np.percentile(np.abs((lw-pv[0])-(lb-pv[1]))[both], 95)))
                jumps.append(float(np.abs(c-pv[3]).mean()))
            pv = (lw, lb, on, c)
        fs = sorted(glob.glob(fr+"/*.png")); loop = (JOBS.get(k) or {}).get("loop") or "pingpong"
        # [원본] seq = fs+fs[-2:0:-1]  왕복만. [개선] cycle 은 앞으로만(끝 자세 = 첫 자세라 마지막 장은 뺀다)
        seq = fs[:-1] if loop == "cycle" else fs+fs[-2:0:-1]; t = out+"/seq"; shutil.rmtree(t, ignore_errors=True); os.makedirs(t)
        for i, f in enumerate(seq): os.link(f, f"{t}/{i:03d}.png")
        mp4 = f"{out}/{k}.mp4"; tmp = mp4+".tmp.mp4"
        subprocess.run([a.ffmpeg, "-y", "-loglevel", "error", "-framerate", "20", "-i", f"{t}/%03d.png", "-vf", "scale=704:704:flags=lanczos:out_color_matrix=bt709:out_range=tv", "-c:v", "libx264", "-crf", "24", "-preset", "slow", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-bsf:v", "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1", "-movflags", "+faststart", "-an", tmp], check=True)
        os.replace(tmp, mp4); shutil.rmtree(t)
        sha = hashlib.sha256(open(mp4, "rb").read()).hexdigest()
        Image.open(fs[round((JOBS.get(k) or {}).get("thumb", 1)*(len(fs)-1))]).resize((192, 192), Image.LANCZOS).save(f"{out}/thumb.webp", quality=78, method=6)
        d = dict(key=k, manifest=man, bytes=os.path.getsize(mp4), sha8=sha[:8], sha256=sha, iou_min=round(min(ious), 3), hole_max=round(max(holes), 4), fallback_max=round(max(backs), 4), chroma_p95=round(max(chroma, default=0), 4), fallback_jump=round(max(jumps, default=0), 4), flicker_p95=round(max(flick), 4) if flick else 0)
        if loop == "cycle":
            # SPEC-036 이음새: 끝→처음 변화량이 평소 프레임 변화량의 몇 배인가(1 근처면 이음새가 안 보인다)
            _im = lambda f_: np.asarray(Image.open(f_).convert("RGB"), dtype=np.float32)
            # [원본] d["loop_seam"] = round(float(np.abs(_im(fs[-2])-_im(fs[0])).mean())/max(float(np.median(jumps)), 1e-3), 2)
            # [개선] 분자는 화소(0~255), jumps 는 마스크(0~1)라 단위가 달라 수백 배로 나왔다. 분모도 완성 프레임 사이 변화량으로 잰다
            _ims = [_im(f_) for f_ in fs[:-1]]; _steps = [float(np.abs(y-x).mean()) for x, y in zip(_ims, _ims[1:])]
            # 정지 구간이 많은 동작은 중앙값이 0 에 가까워 부풀므로 이음새 양옆 변화량과 눈에 안 띄는 하한(.25)도 함께 본다
            d["loop_seam"] = round(float(np.abs(_ims[-1]-_ims[0]).mean())/max(float(np.median(_steps)), _steps[0], _steps[-1], .25), 2)
        with open(info+".tmp", "w") as f: json.dump(d, f)
        os.replace(info+".tmp", info); return d
    except Exception as e:
        return dict(key=k, error=repr(e)[:300], trace=traceback.format_exc()[-800:])
if __name__ == "__main__":
    keys = [k.strip() for k in open(a.keys) if k.strip()]
    with ProcessPoolExecutor(a.workers) as ex: res = list(ex.map(one, keys))
    # 일부 키만 돌려도 나머지 기록을 지우지 않는다. 쓰기는 원자적으로
    rp = f"{a.out}/report.json"; old = {r["key"]: r for r in json.load(open(rp))} if os.path.exists(rp) else {}
    old.update({r["key"]: r for r in res})
    with open(rp+".tmp", "w") as f: json.dump(list(old.values()), f, ensure_ascii=False, indent=0)
    os.replace(rp+".tmp", rp)
    ok = [r for r in res if "error" not in r]; er = [r for r in res if "error" in r]
    print("완료", len(ok), "오류", len(er), [(r["key"], r["error"]) for r in er]); print("합계MB", round(sum(r["bytes"] for r in ok)/1e6, 1), "최대KB", max((r["bytes"] for r in ok), default=0)//1024)
    raise SystemExit(1 if er else 0)
