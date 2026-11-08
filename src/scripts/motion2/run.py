#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""제작 대기열. 뼈대 검사 → 렌더(N·M) → Wan → 합성·검사. 세 단계 지문이 같으면 건너뛴다.
사용: run.py --keys a,b | --family 이름  [--gpus 0,1,2,3] [--out DIR] [--check-only] [--dry-fail 키]
GPU 규칙: 키마다 다른 프로세스 점유를 확인하고, 연속 2회 실패하면 그 워커를 멈추고, 끝나면 직접 띄운 ComfyUI 만 끄고 해제를 확인한다."""
import argparse, glob, hashlib, json, os, shutil, signal, socket, subprocess, sys, threading, time, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__)); HOME = os.path.expanduser("~"); sys.path.insert(0, HERE)
import check as CK
# 도구·작업 위치는 저장소 밖 설정(paths.local.json, git 무시)에서 읽는다 — {"blender", "base_blend", "comfy", "ffmpeg", "work"}
_P = json.load(open(f"{HERE}/paths.local.json")) if os.path.exists(f"{HERE}/paths.local.json") else {}
def _p(k): return os.path.expanduser(_P.get(k) or os.environ.get("MOTION_" + k.upper(), "")) or None
BL = _p("blender"); BASE = _p("base_blend"); COMFY = _p("comfy") or ""; PY = f"{COMFY}/.venv/bin/python"; FF = _p("ffmpeg") or "ffmpeg"; WORK = _p("work") or os.path.join(HERE, "work")
NF, SAMPLES, RES = 41, 48, 704; MIN_DISK_GB = 150; WAN_TIMEOUT = 600; BLENDER_TIMEOUT = 900
BG = (248, 248, 246)
def sha_files(*ps):
    h = hashlib.sha256()
    for p in ps:
        with open(p, "rb") as f:
            for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
    return h.hexdigest()
def sha_obj(o): return hashlib.sha256(json.dumps(o, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
def model_hash(prof):
    """모델 파일 해시. 크기·수정 시각이 같으면 저장해 둔 값을 쓴다."""
    cp = f"{WORK}/model_hash.json"; c = json.load(open(cp)) if os.path.exists(cp) else {}; out = {}
    for sub, n in (("diffusion_models", prof["unet"]), ("text_encoders", prof["clip"]), ("vae", prof["vae"])):
        p = next((x for x in glob.glob(f"{COMFY}/models/*/{n}")), None)
        if not p: raise SystemExit(f"모델 없음: {n}")
        st = os.stat(p); k = f"{n}:{st.st_size}:{int(st.st_mtime)}"
        if k not in c: c[k] = sha_files(p)
        out[n] = c[k]
    json.dump(c, open(cp, "w"), indent=0); return out
def code_hash(E):
    fam = E["solver"].split(":")[0]; return sha_files(*[f"{HERE}/{n}" for n in ("rig.py", "scene.py", "render.py", f"families/{fam}.py")])
def st_load(d):
    p = f"{d}/state.json"; return json.load(open(p)) if os.path.exists(p) else {}
def st_save(d, s): json.dump(s, open(f"{d}/state.json.tmp", "w"), indent=1); os.replace(f"{d}/state.json.tmp", f"{d}/state.json")
def sh(cmd, env=None, timeout=None, log=None):
    with open(log or os.devnull, "w") as f: return subprocess.run(cmd, env=env, timeout=timeout, stdout=f, stderr=subprocess.STDOUT).returncode
def blender(*a): return [BL, "-b", BASE, "--python-exit-code", "1", *a]
def graph(key, E, P, F):
    return {"1": {"class_type": "UNETLoader", "inputs": {"unet_name": P["unet"], "weight_dtype": "default"}}, "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": P["clip"], "type": "wan"}}, "3": {"class_type": "VAELoader", "inputs": {"vae_name": P["vae"]}},
            "4": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["1", 0], "shift": P["shift"]}}, "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": P["prompt"].format(motion=E["motion"])}}, "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": P["negative"]}},
            "11": {"class_type": "VHS_LoadImagesPath", "inputs": {"directory": F, "image_load_cap": 0, "skip_first_images": 0, "select_every_nth": 1}}, "7": {"class_type": "VAEEncode", "inputs": {"pixels": ["11", 0], "vae": ["3", 0]}},
            "8": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0], "seed": P["seed"], "steps": P["steps"], "cfg": P["cfg"], "sampler_name": P["sampler"], "scheduler": P["scheduler"], "denoise": E.get("denoise", P["denoise"])}},
            "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}}, "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": f"{key}/W/f"}}}
def code_now():
    ps = sorted(glob.glob(f"{HERE}/*.py")+glob.glob(f"{HERE}/families/*.py")+glob.glob(f"{HERE}/*.json")); return sha_files(*ps)
def probe(args, key, E):
    try:
        d = f"{args.out}/{key}"; os.makedirs(d, exist_ok=True); st = st_load(d); ck = code_hash(E); ent = sha_obj({k: E.get(k) for k in ("solver", "vars", "cam")})
        pk = sha_obj([ck, ent, args._base, NF])
        if st.get("probe") != pk or not os.path.exists(f"{d}/p/joints.json"):
            shutil.rmtree(f"{d}/p", ignore_errors=True)
            rc = sh(["nice", *blender("-t", "2", "--python", f"{HERE}/render.py", "--", args.catalog, key, str(NF), "1", "64", f"{d}/p", "--probe")], log=f"{d}/probe.log", timeout=BLENDER_TIMEOUT)
            if rc or not os.path.exists(f"{d}/p/joints.json"): return f"{key}: 뼈대 계산 실패(rc={rc})", None
            st["probe"] = pk; st_save(d, st)
        J = json.load(open(f"{d}/p/joints.json")); fl = CK.check_joints(J, E)
        if fl: return f"{key}: 뼈대 불합격 {fl[:4]}", None
        # 렌더 지문: 좌표·소품이 같으면 공통 코드를 고쳐도 다시 만들지 않는다(그림을 그리는 scene.py·render.py 만 넣는다)
        rfp = sha_obj([CK.fingerprint(J), sha_files(f"{HERE}/scene.py", f"{HERE}/render.py"), E.get("cam"), args._base, SAMPLES, RES, NF])
        # 소품 회전·리그처럼 위 지문에 안 들어가는 것이 바뀌면 렌더를 무효로 한다. 기록이 없던 옛 결과는 이번 값을 받아들인다.
        psig = sha_obj([[f.get("prop_sig") for f in J["frames"]], sha_files(f"{HERE}/rig.py")])
        if st.get("props") != psig:
            if st.get("props") is not None or st.get("render") != rfp: st.pop("render", None); st.pop("wan", None); st.pop("comp", None)
            st["props"] = psig; st_save(d, st)
        return None, rfp
    except Exception as e: return f"{key}: 뼈대 단계 오류 {type(e).__name__}: {e}", None
class Jobs:
    """대기열. 실패한 키는 다른 GPU 로만 넘기고, 처리 중인 키가 있으면 워커를 끝내지 않는다."""
    def __init__(s, items=()): s.cv = threading.Condition(); s.items = [dict(key=k, E=E, rfp=f, failed=[]) for k, E, f in items]; s.inflight = 0
    def get(s, g, stop):
        with s.cv:
            while not stop.is_set():
                for i, j in enumerate(s.items):
                    if g not in j["failed"]: s.inflight += 1; return s.items.pop(i)
                if s.inflight == 0: return None
                s.cv.wait(2)
            return None
    def done(s, j=None, back=False):
        with s.cv:
            s.inflight -= 1
            if back: s.items.append(j)
            s.cv.notify_all()
    def left(s):
        with s.cv: return [j["key"] for j in s.items]
class Worker(threading.Thread):
    def __init__(s, g, args, jobs, prof, res, stop): super().__init__(daemon=True); s.g, s.args, s.jobs, s.prof, s.res, s.stop_all = g, args, jobs, prof, res, stop; s.cp = None; s.port = 8200+g; s.fails = 0
    def env(s): e = dict(os.environ); e["CUDA_DEVICE_ORDER"] = "PCI_BUS_ID"; e["CUDA_VISIBLE_DEVICES"] = str(s.g); return e
    def foreign(s):
        """이 워커 말고 그 GPU 를 쓰는 프로세스(pid 만 본다 — 인자를 출력하지 않는다). 확인이 안 되면 점유로 친다."""
        r = subprocess.run(["nvidia-smi", "-i", str(s.g), "--query-compute-apps=pid", "--format=csv,noheader"], capture_output=True, text=True, timeout=60); o = r.stdout.split()
        if r.returncode or not all(x.isdigit() for x in o): return ["확인 불가"]
        return [p for p in o if not (s.cp and int(p) == s.cp.pid)]
    def comfy(s):
        if s.cp and s.cp.poll() is None: return
        with socket.socket() as k:
            if k.connect_ex(("127.0.0.1", s.port)) == 0: raise RuntimeError(f"포트 {s.port} 를 다른 프로세스가 쓰는 중")
        lg = open(f"{s.args.out}/comfy{s.g}.log", "a"); s.cp = subprocess.Popen([PY, "main.py", "--listen", "127.0.0.1", "--port", str(s.port), "--output-directory", s.args.out], cwd=COMFY, env=s.env(), stdout=lg, stderr=lg)
        for _ in range(100):
            if s.cp.poll() is not None: raise RuntimeError("ComfyUI 가 시작 중에 죽음")
            try: s.api("/system_stats"); return
            except Exception: time.sleep(3)
        raise RuntimeError("ComfyUI 시작 실패")
    def api(s, p, d=None):
        r = urllib.request.Request(f"http://127.0.0.1:{s.port}{p}", data=json.dumps(d).encode() if d else None, headers={"Content-Type": "application/json"})
        return json.load(urllib.request.urlopen(r, timeout=30))
    def wan(s, key, E, d):
        shutil.rmtree(f"{d}/W", ignore_errors=True); pid = s.api("/prompt", {"prompt": graph(key, E, s.prof, f"{d}/F")})["prompt_id"]; t0 = time.time()
        while True:
            h = s.api(f"/history/{pid}")
            if pid in h:
                if h[pid]["status"]["status_str"] != "success": raise RuntimeError("Wan 실패")
                break
            if time.time()-t0 > WAN_TIMEOUT: raise RuntimeError("Wan 시간 초과")
            time.sleep(1.5)
        return len(glob.glob(f"{d}/W/*.png"))
    def one(s, key, E, rfp):
        d = f"{s.args.out}/{key}"; st = st_load(d); P = s.prof
        if st.get("render") != rfp or len(glob.glob(f"{d}/N/*.png")) != NF or len(glob.glob(f"{d}/M/*.png")) != NF:
            shutil.rmtree(f"{d}/N", ignore_errors=True); shutil.rmtree(f"{d}/M", ignore_errors=True)
            rc = sh(blender("--python", f"{HERE}/render.py", "--", s.args.catalog, key, str(NF), str(SAMPLES), str(RES), d, "--device", "GPU"), env=s.env(), timeout=BLENDER_TIMEOUT, log=f"{d}/render.log")
            if rc or len(glob.glob(f"{d}/N/*.png")) != NF or len(glob.glob(f"{d}/M/*.png")) != NF: raise RuntimeError(f"렌더 실패(rc={rc})")
            st["render"] = rfp; st.pop("wan", None); st.pop("comp", None); st_save(d, st)
        wfp = sha_obj([rfp, graph(key, E, P, "F"), s.args._models, s.args._comfy, sha_files(f"{HERE}/flatten.py")])
        if st.get("wan") != wfp or len(glob.glob(f"{d}/W/*.png")) != NF:
            r = subprocess.run([PY, f"{HERE}/flatten.py", f"{d}/N", f"{d}/F"]); 
            if r.returncode: raise RuntimeError("평탄화 실패")
            s.comfy(); n = s.wan(key, E, d)
            if n != NF: raise RuntimeError(f"Wan 프레임 수 {n}")
            shutil.rmtree(f"{d}/F", ignore_errors=True); st["wan"] = wfp; st.pop("comp", None); st_save(d, st)
        cfp = sha_obj([rfp, wfp, sha_files(f"{HERE}/comp.py"), E.get("loop")])
        if st.get("comp") != cfp or not os.path.exists(f"{d}/{key}.mp4"):
            st.pop("comp", None); st_save(d, st)
            rc = sh([PY, f"{HERE}/comp.py", key, d, f"{d}/W", d, FF, E.get("loop", "pingpong")], log=f"{d}/comp.log", timeout=300)
            if rc: raise RuntimeError(f"합성 실패(rc={rc})")
            st["comp"] = cfp; st_save(d, st)
        shutil.rmtree(f"{d}/frames", ignore_errors=True)
        info = json.load(open(f"{d}/info.json"))
        if info.get("sha8") != sha_files(f"{d}/{key}.mp4")[:8]: st.pop("comp", None); st_save(d, st); raise RuntimeError("영상과 검사 기록의 해시가 다름")
        return info
    def run(s):
        try:
            while not s.stop_all.is_set():
                j = s.jobs.get(s.g, s.stop_all)
                if j is None: return
                key = j["key"]
                try:
                    free = shutil.disk_usage(s.args.out).free/1e9
                    if free < MIN_DISK_GB: s.stop_all.set(); s.res.event(key, f"디스크 여유 {free:.0f}GB — 전체 정지"); s.jobs.done(j, True); return
                    if code_now() != s.args._code: s.stop_all.set(); s.res.event(key, "실행 중 코드가 바뀜 — 전체 정지(검사받지 않은 자세가 합격 처리되는 것을 막는다)"); s.jobs.done(j, True); return
                    fr = s.foreign()
                    if fr: s.res.event(key, f"GPU{s.g} 다른 프로세스 {len(fr)}개 — 이 워커 정지"); s.jobs.done(j, True); return
                    t0 = time.time(); info = s.one(key, j["E"], j["rfp"]); s.fails = 0; s.res.final(key, "불합격" if info["fail"] else "합격", info); s.jobs.done(); print(f"[GPU{s.g}] {key} {time.time()-t0:.0f}초 iou={info['iou_min']:.3f} hole={info['hole_max']*100:.2f}% skin={info['skin_max']*100:.2f}% {info['kb']}KB {info['fail'] or ''}", flush=True)
                except Exception as e:
                    s.fails += 1; print(f"[GPU{s.g}] {key} 실패: {type(e).__name__}: {e}", flush=True); j["failed"].append(s.g); s.close()
                    if len(j["failed"]) < 2: s.jobs.done(j, True)
                    else: s.res.final(key, "실패", str(e)); s.jobs.done()
                    if s.fails >= 2: print(f"[GPU{s.g}] 연속 2회 실패 — 워커 정지", flush=True); return
        finally: s.close()
    def close(s):
        if s.cp and s.cp.poll() is None:
            s.cp.terminate()
            try: s.cp.wait(30)
            except subprocess.TimeoutExpired: s.cp.kill(); s.cp.wait()
        s.cp = None
class Results:
    """키별 최종 상태. 반납·정지는 결과가 아니라 사건으로 따로 적는다."""
    def __init__(s): s.lock = threading.Lock(); s.by = {}; s.events = []
    def final(s, k, st, x):
        with s.lock: s.by[k] = (st, x)
    def event(s, k, m):
        with s.lock: s.events.append([k, m])
def main():
    a = argparse.ArgumentParser(); a.add_argument("--keys"); a.add_argument("--family"); a.add_argument("--gpus", default="0,1,2,3"); a.add_argument("--out", default=f"{WORK}/out"); a.add_argument("--catalog", default=f"{HERE}/catalog.json"); a.add_argument("--check-only", action="store_true"); args = a.parse_args()
    if not args.keys and not args.family: a.error("--keys 또는 --family 가 필요합니다")
    C = json.load(open(args.catalog))["keys"]; keys = args.keys.split(",") if args.keys else [k for k, v in C.items() if v["family"] == args.family and v.get("solver")]
    unknown = [k for k in keys if k not in C]
    if unknown: a.error(f"제작 목록에 없는 키: {unknown[:5]}")
    if args.family: print(f"묶음 {args.family}: 계산식 있는 키 {len(keys)} · 없는 키 {sum(1 for v in C.values() if v['family'] == args.family and not v.get('solver'))}", flush=True)
    args._code = code_now()
    os.makedirs(args.out, exist_ok=True); args._base = sha_files(BASE); prof = json.load(open(f"{HERE}/wan_profile.json"))
    res, bad = Results(), []; ok = []
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(6) as ex: pr = list(ex.map(lambda k: probe(args, k, C[k]), keys))
    for k, (er, rfp) in zip(keys, pr):
        if er: bad.append(er); print(er, flush=True)
        else: ok.append((k, C[k], rfp))
    print(f"뼈대 합격 {len(ok)} / {len(keys)}", flush=True)
    if args.check_only: sys.exit(1 if bad else 0)
    jobs = Jobs(ok); ws = []
    if ok:
        args._models = model_hash(prof); args._comfy = subprocess.run(["git", "-C", COMFY, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip(); stop = threading.Event()
        ws = [Worker(int(g), args, jobs, prof, res, stop) for g in args.gpus.split(",")]
        def bye(*_): stop.set()
        for sg in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP): signal.signal(sg, bye)
        try:
            for w in ws: w.start()
            for w in ws:
                while w.is_alive(): w.join(1)
        finally:
            for w in ws: w.close()
        time.sleep(4); print(subprocess.run(["nvidia-smi", "--query-gpu=index,memory.used", "--format=csv,noheader"], capture_output=True, text=True).stdout, flush=True)
    summ = dict(ok=[k for k, (st, _) in res.by.items() if st == "합격"], rejected=[[k, x["fail"]] for k, (st, x) in res.by.items() if st == "불합격"], failed=[[k, x] for k, (st, x) in res.by.items() if st == "실패"], joints_failed=bad, events=res.events, left=jobs.left())
    json.dump(summ, open(f"{args.out}/last_run.json", "w"), ensure_ascii=False, indent=1); json.dump(summ, open(f"{args.out}/run_{int(time.time())}.json", "w"), ensure_ascii=False, indent=1); print(json.dumps({k: len(v) for k, v in summ.items()}, ensure_ascii=False), flush=True)
    sys.exit(1 if summ["rejected"] or summ["failed"] or bad or summ["left"] else 0)
if __name__ == "__main__": main()
