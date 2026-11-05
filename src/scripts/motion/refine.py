#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Blender 프레임 → Wan 2.2 TI2V-5B 다듬기(vid2vid). 재시작 안전: 입력 지문이 같고 장수가 맞을 때만 건너뛴다. 렌더가 진행 중이면 기다린다(--follow).
사용: refine.py <keys.txt> <렌더폴더> <결과폴더> --port 8192 [--follow] [--denoise 0.4] [--seed 7]"""
import argparse, glob, hashlib, json, os, shutil, sys, time, urllib.request
from PIL import Image
A = argparse.ArgumentParser(); A.add_argument("keys"); A.add_argument("src"); A.add_argument("out"); A.add_argument("--port", type=int, default=8192); A.add_argument("--follow", action="store_true")
A.add_argument("--denoise", type=float, default=.4); A.add_argument("--seed", type=int, default=7); A.add_argument("--jobs", default="jobs.json"); A.add_argument("--timeout", type=int, default=1800); A.add_argument("--nframes", type=int, default=25); A.add_argument("--comfy-out", default="~/ComfyUI/output"); a = A.parse_args()
JOBS = json.load(open(a.jobs))["jobs"]; BG = (248, 248, 246)
NEG = "blurry, deformed hands, extra fingers, extra limbs, beard, long hair, bald, text, watermark, logo, flicker, low quality"
PERSON = "a fit athletic man in his late twenties, natural light skin tone, short neat dark hair with a clean side part and tapered sides, clean-shaven, plain matte black shorts, white socks, black trainers"
TAIL = "realistic 3D render, defined muscles, soft studio light, plain white background"
def api(p, d=None):
    r = urllib.request.Request(f"http://127.0.0.1:{a.port}{p}", data=json.dumps(d).encode() if d else None, headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(r, timeout=30))
for _ in range(100):
    try: api("/system_stats"); break
    except Exception: time.sleep(3)
keys = [k.strip() for k in open(a.keys) if k.strip()]
os.makedirs(a.out, exist_ok=True); pending = list(keys); fails = 0
def src_failed():
    p = f"{a.src}/failed.txt"
    return {l.split("\t")[0].strip() for l in open(p) if l.strip()} if os.path.exists(p) else set()
def bad(k, why):
    global fails
    fails += 1; open(f"{a.out}/failed.txt", "a").write(f"{k}\t{why}\n"); print("WAN", k, "FAIL", why, flush=True)
while pending:
    k = pending.pop(0); d_n = f"{a.src}/N/{k}"; od = os.path.abspath(f"{a.out}/{k}")
    if not os.path.exists(d_n+"/.done"):
        if k in src_failed(): bad(k, "렌더 실패"); continue
        if a.follow: pending.append(k); time.sleep(4 if len(pending) < 3 else 0.3); continue
        bad(k, "렌더 없음"); continue
    j = JOBS[k]; act = f"performing {j.get('prompt') or j['exampleEn'] or j['arch'].replace('_', ' ')}"
    prompt = f"{PERSON}, {act}, {TAIL}"
    # 입력 지문: 렌더·프롬프트·설정이 같고 25장이 있을 때만 건너뛴다
    man = hashlib.sha256(json.dumps([open(d_n+"/.done").read(), prompt, NEG, a.seed, a.denoise, a.nframes]).encode()).hexdigest()
    mark = od+"/.done"
    if os.path.exists(mark) and open(mark).read() == man and len(glob.glob(od+"/*.png")) == a.nframes: continue
    shutil.rmtree(od, ignore_errors=True); os.makedirs(od)
    # 폴더 이름에 지문: ComfyUI 캐시가 옛 입력을 돌려주지 않게
    fl = f"{a.out}/.flat/{k}-{man[:8]}"; shutil.rmtree(fl, ignore_errors=True); os.makedirs(fl)
    for f in sorted(glob.glob(d_n+"/*.png")):
        im = Image.open(f).convert("RGBA"); b = Image.new("RGB", im.size, BG); b.paste(im, (0, 0), im); b.save(f"{fl}/{os.path.basename(f)}")
    g = {"1": {"class_type": "UNETLoader", "inputs": {"unet_name": "wan2.2_ti2v_5B_fp16.safetensors", "weight_dtype": "default"}},
         "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan"}},
         "3": {"class_type": "VAELoader", "inputs": {"vae_name": "wan2.2_vae.safetensors"}},
         "4": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": 8.0}},
         "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
         "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": NEG}},
         "11": {"class_type": "VHS_LoadImagesPath", "inputs": {"directory": os.path.abspath(fl), "image_load_cap": 0, "skip_first_images": 0, "select_every_nth": 1}},
         "7": {"class_type": "VAEEncode", "inputs": {"pixels": ["11", 0], "vae": ["3", 0]}},
         "8": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0], "seed": a.seed, "steps": 20, "cfg": 5.0, "sampler_name": "uni_pc", "scheduler": "simple", "denoise": a.denoise}},
         "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
         "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": f"liftmotion_final/{k}"}}}
    t0 = time.time()
    try:
        pid = api("/prompt", {"prompt": g})["prompt_id"]; h = {}
        while time.time()-t0 < a.timeout:
            h = api(f"/history/{pid}")
            if pid in h: break
            time.sleep(1.5)
        if pid not in h: bad(k, "시간 초과"); continue
        if h[pid]["status"]["status_str"] != "success": bad(k, "ComfyUI 오류"); continue
        imgs = h[pid]["outputs"]["10"]["images"]; root = os.path.expanduser(a.comfy_out)
        if len(imgs) != a.nframes: bad(k, f"프레임 {len(imgs)}장"); continue
        for n, im in enumerate(imgs): os.replace(f"{root}/{im['subfolder']}/{im['filename']}", f"{od}/{n:03d}.png")
        open(mark, "w").write(man); shutil.rmtree(fl, ignore_errors=True)
        print("WAN", k, round(time.time()-t0), "s ok", flush=True)
    except Exception as e: bad(k, repr(e)[:200])
print("END", fails, flush=True)
raise SystemExit(1 if fails else 0)
