#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""키 목록을 GPU 여러 장에 나눠 렌더한다. 재시작 안전 — 입력(동작·조정값·코드·설정) 지문이 같고 파일 수가 맞을 때만 건너뛴다.
사용: render_queue.py <keys.txt> <출력폴더> <프레임수> <샘플> <해상도> [--t 0,1] [--mask] [--probe] [--gpus 0,1,2] [--timeout 1800] [--loose-code]
--loose-code: 코드 지문은 비교하지 않는다(코드를 고쳤지만 영향이 일부뿐이라 나머지를 다시 만들 필요가 없을 때만)."""
import argparse, glob, hashlib, json, os, queue, shutil, subprocess, threading, time
A = argparse.ArgumentParser(); A.add_argument("keys"); A.add_argument("out"); A.add_argument("nf", type=int); A.add_argument("spp", type=int); A.add_argument("res", type=int)
A.add_argument("--t"); A.add_argument("--mask", action="store_true"); A.add_argument("--probe", action="store_true"); A.add_argument("--gpus", default="0,1,2"); A.add_argument("--timeout", type=int, default=1800); A.add_argument("--jobs", default="jobs.json"); A.add_argument("--loose-code", action="store_true"); a = A.parse_args()
ROOT = os.path.dirname(os.path.abspath(__file__)); BL = f"{ROOT}/blender-4.5.15-linux-x64/blender"
OUT, JOBS_P = os.path.abspath(a.out), os.path.abspath(a.jobs)
JOBS = json.load(open(JOBS_P))["jobs"]; OV_ALL = json.load(open(os.path.join(os.path.dirname(JOBS_P), "overrides.json")))
sha = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
CODE = sha(f"{ROOT}/motion3d.py")+sha(f"{ROOT}/base.blend")
def manifest(k, mode):
    j = JOBS[k]; ov = {}
    for n in (j["arch"], j["arch"]+"__"+j["equip"], k): ov[n] = OV_ALL.get(n)
    return dict(input=hashlib.sha256(json.dumps([j["data"], j["primary"], j.get("ov"), ov], sort_keys=True).encode()).hexdigest(), mode=mode, nf=a.nf, spp=a.spp if mode == "beauty" else 8, res=a.res, t=a.t, code=CODE)
def same(old, new):
    if a.loose_code: old, new = {**old, "code": 0}, {**new, "code": 0}
    return old == new
Q = queue.Queue(); keys = [x.strip() for x in open(a.keys) if x.strip()]
for k in keys: Q.put(k)
lock = threading.Lock(); N = Q.qsize(); done = [0]; failed = [0]
DIRS = {"beauty": "N", "mask": "M", "probe": "P"}
want = 0 if a.probe else (len(a.t.split(",")) if a.t else a.nf)
def run(gpu):
    while True:
        try: k = Q.get_nowait()
        except queue.Empty: return
        t0 = time.time()
        for mode in (["probe"] if a.probe else ["beauty", "mask"] if a.mask else ["beauty"]):
            d = f"{OUT}/{DIRS[mode]}/{k}"; mark = d+"/.done"; man = manifest(k, mode); pngs = lambda: glob.glob(d+"/*.png")
            if os.path.exists(mark) and len(pngs()) == want:
                try:
                    if same(json.load(open(mark)), man): continue
                except ValueError: pass
            shutil.rmtree(d, ignore_errors=True); os.makedirs(d)
            env = dict(os.environ, CUDA_VISIBLE_DEVICES=gpu, BLENDER_USER_RESOURCES=f"{ROOT}/bl_user", PASS=mode)
            cmd = [BL, "-b", f"{ROOT}/base.blend", "--python", f"{ROOT}/motion3d.py", "--", JOBS_P, k, str(a.nf), str(a.spp if mode == "beauty" else 8), str(a.res), d]+([a.t] if a.t else [])
            log = "timeout"; ok = False
            for _try in range(2):
                try:
                    r = subprocess.run(cmd, cwd=ROOT, env=env, timeout=a.timeout, capture_output=True, text=True)
                    log = r.stdout[-4000:]+r.stderr[-1000:]
                    ok = r.returncode == 0 and r.stdout.count("RENDERED") == want and len(pngs()) == want and os.path.exists(f"{d}/{k}.json")
                except subprocess.TimeoutExpired: log = "timeout"
                except Exception as e: log = repr(e)
                if ok: break
            if ok:
                with open(mark+".tmp", "w") as f: json.dump(man, f)
                os.replace(mark+".tmp", mark)
            else:
                with lock:
                    failed[0] += 1
                    open(f"{OUT}/failed.txt", "a").write(f"{k}\t{mode}\n"); open(f"{OUT}/fail_{k}.log", "w").write(log)
        with lock:
            done[0] += 1; print(f"{done[0]}/{N} {k} gpu{gpu} {round(time.time()-t0)}s", flush=True)
ts = [threading.Thread(target=run, args=(g,)) for g in a.gpus.split(",")]
[t.start() for t in ts]; [t.join() for t in ts]
print("END", failed[0], flush=True)
raise SystemExit(1 if failed[0] else 0)
