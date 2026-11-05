#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""품질 판정. 렌더 지표(<폴더>/<키>/<키>.json)와 합성 지표(report.json)를 임계값과 비교해 합격·경고·불량으로 나눈다.
사용: qc.py <지표폴더 N 또는 P> <keys.txt> [--report report.json] [--out qc.json] | qc.py --selftest
임계값 표는 초깃값이다. 불량이 아닌 클립도 시트 눈 검수를 거친다."""
import argparse, json, os
HOLD = {"plank", "plank_high", "dead_hang", "wall_sit", "hollow", "v_sit", "captain_chair", "superman_hold", "glute_bridge_hold"}
LOAD = {"deadlift", "rack_pull", "romanian_deadlift", "stiff_leg", "shrug", "overhead_press", "bent_over_row", "pendlay_row"}
SMALL = {"shrug", "overhead_shrug", "behind_back_wrist", "wrist_curl", "calf_raise", "calf_raise_bar", "seated_calf", "donkey_calf", "leg_press_calf", "scapular", "dead_hang"}   # 원래 움직임이 작은 동작
SLIP_OK = {"bird_dog", "kickback_glute", "reverse_hyper", "standing_leg_curl", "step_up", "step_down", "dead_bug"}   # 다리·팔을 떼는 동작: 접촉 이동이 아니다
NOPEN = {"column", "post", "foot", "base", "Sphere", "Torus", "gr", "dbl", "dbr", "db", "kb", "plate", "piv", "pulley", "roller", "stack", "guide", "rail", "sfoot", "lat", "hndl", "pullbar", "dipbar", "tb", "wheel", "barbell", "shaft", "collar", "Cylinder"}  # 손에 쥐거나 몸에 닿게 만든 것, 눈으로 본다
# (지표, 방향, 경고, 불량) 방향 hi=클수록 나쁨, lo=작을수록 나쁨
RULES = [("pen_max", "hi", 3.5, 6), ("sink", "hi", 1, 2), ("contact_slip_cm", "hi", 2, 4), ("elbow_min", "lo", 15, 5), ("knee_min", "lo", 20, 10), ("screen_max", "hi", .97, 1.0), ("body_frac", "lo", .45, .35),
         ("expo_mean", "lo", .25, .12), ("exposure_min", "lo", .12, .05), ("motion_proj", "lo", .5, .35), ("motion_frac", "lo", .10, .05), ("ik_err", "hi", .05, .12), ("load_off_cm", "hi", 12, 20), ("iou_min", "lo", .90, .85), ("hole_max", "hi", .01, .02), ("flicker_p95", "hi", .02, .035)]
def facts(k, m, rep):
    arch = k.split("__")[0].split("-")[0]; f = {x: m.get(x) for x in ("contact_slip_cm", "elbow_min", "knee_min", "screen_max", "body_frac", "exposure_min", "motion_proj", "motion_frac", "ik_err")}
    f["expo_mean"] = m.get("exposure"); pen = {a: b for a, b in (m.get("penetration") or {}).items() if a not in NOPEN}; f["pen_max"] = max(pen.values(), default=0); f["pen_at"] = max(pen, key=pen.get) if pen else None
    f["sink"] = -m["floor_min"]*100 if m.get("floor_min", 0) < 0 else 0
    if arch in LOAD and k.split("__")[1] in ("barbell", "trapbar", "smith", "ezbar"): f["load_off_cm"] = m.get("load_off_cm")
    if arch in HOLD: f["motion_proj"] = f["motion_frac"] = None
    if arch in SMALL: f["motion_frac"] = None
    if arch in SLIP_OK: f["contact_slip_cm"] = None
    for x in ("iou_min", "hole_max", "flicker_p95"): f[x] = (rep or {}).get(x)
    return f
def judge(f):
    warn, fail = [], []
    for n, d, w, b in RULES:
        v = f.get(n)
        if v is None: continue
        if (d == "hi" and v >= b) or (d == "lo" and v <= b): fail.append(f"{n}={v}")
        elif (d == "hi" and v >= w) or (d == "lo" and v <= w): warn.append(f"{n}={v}")
    return warn, fail
def selftest():
    good = dict(contact_slip_cm=0, elbow_min=70, knee_min=70, screen_max=.9, body_frac=.7, expo_mean=.6, exposure_min=.4, motion_proj=.8, motion_frac=.3, ik_err=0, load_off_cm=3, pen_max=0, sink=0, iou_min=.95, hole_max=0, flicker_p95=.01)
    assert judge(good) == ([], []), judge(good)
    bad = dict(contact_slip_cm=9, elbow_min=3, knee_min=5, screen_max=1.2, body_frac=.2, expo_mean=.05, exposure_min=.01, motion_proj=.2, motion_frac=.01, ik_err=.2, load_off_cm=50, pen_max=30, sink=5, iou_min=.5, hole_max=.2, flicker_p95=.2)
    for n in bad:
        w, fl = judge({**good, n: bad[n]})
        assert any(x.startswith(n+"=") for x in fl), f"불량 못 잡음 {n}"
    print("selftest 통과", len(bad), "개 지표")
if __name__ == "__main__":
    A = argparse.ArgumentParser(); A.add_argument("metrics", nargs="?"); A.add_argument("keys", nargs="?"); A.add_argument("--report"); A.add_argument("--out"); A.add_argument("--selftest", action="store_true"); a = A.parse_args()
    if a.selftest: selftest(); raise SystemExit(0)
    rep = {r["key"]: r for r in json.load(open(a.report))} if a.report else {}
    res = {}; cnt = dict(ok=0, warn=0, fail=0)
    for k in [x.strip() for x in open(a.keys) if x.strip()]:
        p = f"{a.metrics}/{k}/{k}.json"
        if not os.path.exists(p): res[k] = dict(v="fail", fail=["지표 없음"], warn=[]); cnt["fail"] += 1; continue
        r = rep.get(k) or {}
        if a.report and ("error" in r or not r): res[k] = dict(v="fail", fail=[r.get("error", "합성 없음")], warn=[]); cnt["fail"] += 1; continue
        f = facts(k, json.load(open(p)), r); w, fl = judge(f); v = "fail" if fl else "warn" if w else "ok"; cnt[v] += 1; res[k] = dict(v=v, warn=w, fail=fl, facts=f)
    if a.out: json.dump(res, open(a.out, "w"), ensure_ascii=False, indent=0)
    print(cnt)
    for k, r in sorted(res.items()):
        if r["v"] == "fail": print("불량", k, r["fail"], r["warn"])
