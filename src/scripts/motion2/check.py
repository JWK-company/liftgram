#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""자동 검사(SPEC-040). 표준 라이브러리만 쓴다. 사용: check.py <catalog.json> <키> <joints.json>"""
import hashlib, json, math, sys
MAIN = ('pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'ball_l', 'ball_r')
def sub(a, b): return [a[i]-b[i] for i in range(3)]
def norm(a): return math.sqrt(sum(x*x for x in a))
def dist(a, b): return norm(sub(a, b))
def dot(a, b): return sum(a[i]*b[i] for i in range(3))
def mid(a, b): return [(a[i]+b[i])/2 for i in range(3)]
def unit(a): n = norm(a) or 1e-9; return [x/n for x in a]
def perp(a, u): d = dot(a, u); return [a[i]-u[i]*d for i in range(3)]
def angle(a, b, c):
    u, v = sub(a, b), sub(c, b); x = dot(u, v)/max(norm(u)*norm(v), 1e-9); return math.degrees(math.acos(max(-1, min(1, x))))
def between(u, v): return math.degrees(math.acos(max(-1, min(1, dot(unit(u), unit(v))))))
# 질량 비율(de Leva 1996 근사, 합으로 나눈다). 분절 중심은 근위부터의 비율.
MASS = [('head', .081, .5), ('spine_03', .22, .9), ('spine_02', .08, .5), ('spine_01', .08, .5), ('pelvis', .11, .5), ('upperarm_l', .027, .45), ('upperarm_r', .027, .45), ('lowerarm_l', .016, .43), ('lowerarm_r', .016, .43), ('hand_l', .006, .5), ('hand_r', .006, .5), ('thigh_l', .142, .43), ('thigh_r', .142, .43), ('calf_l', .043, .43), ('calf_r', .043, .43), ('foot_l', .014, .5), ('foot_r', .014, .5)]
MSUM = sum(m for _, m, _ in MASS)
# 바닥면은 z=-0.012 이므로 -0.017 이 5mm 관통이다. 푹신한 패드는 살이 눌리는 깊이까지 봐서 소품 관통은 1.5cm 로 둔다.
LIM = dict(angle_step=12.0, pos_step=0.06, fixed=0.005, grip=0.008, bar_clear=-0.01, floor=-0.017, self_pen=0.01, prop_pen=0.015, length=0.001, sym=8.0, knee_hyper=5.0, hip_ext=30.0, spine_seg=35.0, ankle=(50.0, 140.0), twist=150.0, elbow_front=0.5, elbow_in=0.6, knee_plane=35.0, forearm_twist=(-105.0, 80.0), twist_step=25.0, hang_com=0.12)
# 항목별 완화의 절대 상한. 넘으면 불합격이다.
CAPS = dict(ankle_max=170.0, ankle_max_l=170.0, ankle_max_r=170.0, bar_clear_min=-0.02, angle_step=40.0, pos_step=0.18, elbow_front=0.8, twist_step=30.0)
RANGE_KEYS = ('knee', 'knee_l', 'knee_r', 'hip', 'elbow', 'elbow_l', 'elbow_r', 'lean', 'shoulder', 'ankle', 'arms_open', 'legs_open')
DECL_KEYS = set(RANGE_KEYS)|set(CAPS)|{"twist_step", 'support', 'fixed_bones', 'bar_axis', 'bar_y_span', 'bar_z_span', 'hip_knee_ratio', 'hip_below_knee_end', 'rom'}
ROM_KEYS = set(RANGE_KEYS)
FIXED = {"발": ('foot_l', 'foot_r', 'ball_l', 'ball_r'), "앞꿈치": ('ball_l', 'ball_r'), "등": ('spine_03',), "좌석": ('pelvis',), "무릎": ('calf_l', 'calf_r')}
def knee_sign(b, f, s):
    """+ 면 앞으로 정상 굽힘, - 면 뒤로 꺾임. 정강이의 앞쪽(발끝)을 기준으로 재므로 눕거나 무릎 꿇어도 된다."""
    A, K, H = b['foot_'+s][0], b['calf_'+s][0], b['thigh_'+s][0]; u = unit(sub(K, A)); fr = perp(unit(sub(b['ball_'+s][0], A)), u)
    if norm(fr) < 0.2: return None   # 발끝을 다리와 나란히 편 자세는 판정하지 않는다
    t = sub(H, K); side = dot(unit(fr), t); up = dot(u, t); return math.degrees(math.atan2(-side, up))
def knee_plane(b, s):
    """무릎이 경첩면(발끝-정강이)에서 옆으로 벗어난 각도."""
    A, K, H = b['foot_'+s][0], b['calf_'+s][0], b['thigh_'+s][0]; u = unit(sub(K, A)); fr = perp(unit(sub(b['ball_'+s][0], A)), u)
    if norm(fr) < 0.2: return 0.0
    fr = unit(fr); ax = [u[1]*fr[2]-u[2]*fr[1], u[2]*fr[0]-u[0]*fr[2], u[0]*fr[1]-u[1]*fr[0]]; t = unit(sub(H, K)); return abs(math.degrees(math.asin(max(-1, min(1, dot(t, ax))))))
def angles(f):
    b = f["bones"]; r = {}
    for s in 'lr':
        r['knee_'+s] = angle(b['thigh_'+s][0], b['calf_'+s][0], b['foot_'+s][0]); r['elbow_'+s] = angle(b['upperarm_'+s][0], b['lowerarm_'+s][0], b['hand_'+s][0])
    hc = mid(b['thigh_l'][0], b['thigh_r'][0]); kc = mid(b['calf_l'][0], b['calf_r'][0]); r['hip'] = angle(b['neck_01'][0], hc, kc)
    dn = sub(b['spine_03'][0], b['neck_01'][0])
    for s in 'lr':
        r['shoulder_'+s] = between(sub(b['lowerarm_'+s][0], b['upperarm_'+s][0]), dn); r['ankle_'+s] = between(sub(b['thigh_'+s][1], b['foot_'+s][0]), sub(b['ball_'+s][0], b['foot_'+s][0]))
    r['legs_open'] = between(sub(b['calf_l'][0], b['thigh_l'][0]), sub(b['calf_r'][0], b['thigh_r'][0]))   # 두 허벅지 사이 각(옆으로 걷기)
    r['arms_open'] = between(sub(b['lowerarm_l'][0], b['upperarm_l'][0]), sub(b['lowerarm_r'][0], b['upperarm_r'][0]))   # 양 위팔 사이 각(플라이처럼 어깨 높이에서 벌리는 동작)
    r['shoulder'] = (r['shoulder_l']+r['shoulder_r'])/2; r['ankle'] = (r['ankle_l']+r['ankle_r'])/2
    r['knee'] = (r['knee_l']+r['knee_r'])/2; r['elbow'] = (r['elbow_l']+r['elbow_r'])/2
    t = sub(b['neck_01'][0], b['spine_01'][0]); r['lean'] = math.degrees(math.atan2(-t[1], t[2]))   # 뼈에서 잰다: + 앞으로 숙임
    return r
def com(f):
    b = f["bones"]; M = 0.0; c = [0.0, 0.0, 0.0]
    for n, m, u in MASS:
        h, t = b[n]; p = [h[i]+(t[i]-h[i])*u for i in range(3)]; m *= 80.0/MSUM; M += m
        for i in range(3): c[i] += p[i]*m
    for p, m in f.get("load", []):
        M += m
        for i in range(3): c[i] += p[i]*m
    return [x/M for x in c]
def check_joints(J, E):
    F = J["frames"]; fails = []; D = E.get("decl") or {}
    if not F: return ["프레임 없음"]
    if E.get("solver") and not D: return ["동작 선언 없음(decl)"]
    if E.get("solver") and "support" not in D: fails.append("지지 선언 없음(support)")
    if E.get("solver"):
        bad = set(D)-DECL_KEYS
        if bad: fails.append(f"모르는 선언 {sorted(bad)}")
        for k_, cap in CAPS.items():
            if k_ in D and (D[k_] < cap if k_ == "bar_clear_min" else D[k_] > cap): fails.append(f"완화 상한 초과 {k_}={D[k_]}")
        for k_ in RANGE_KEYS:
            if k_ in D and len(D[k_]) != 3: fails.append(f"{k_} 범위는 시작·중간·끝 3개여야 함")
        if not D.get("rom"): fails.append("주 동작 범위 선언 없음(rom)")
        elif set(D["rom"])-ROM_KEYS: fails.append(f"모르는 rom {sorted(set(D['rom'])-ROM_KEYS)}")
        missing = [k_ for k_ in ("flags", "front", "twist", "zmin", "self_pen", "prop_pen", "grip_err") if k_ not in F[0]]
        if missing: fails.append(f"뼈대 측정값 빠짐 {missing}")
    f0 = F[0]; rest_len = {n: dist(*f0["bones"][n]) for n in MAIN}; ws = worst = wa = wp = wf = wg = 0.0; ang_prev = pos_prev = None; tw_prev = None; flags = set(); seq = F+[F[0]] if E.get("loop") == "cycle" else F
    # 카탈로그 고정점은 계산식이 돌려준 값이 아니라 뼈로 직접 대조한다
    must = D["fixed_bones"] if "fixed_bones" in D else FIXED.get(E.get("fixed"), ())
    for fi, f in enumerate(seq):
        b = f["bones"]; flags |= set(f.get("flags", []))
        for n in MAIN: worst = max(worst, abs(dist(*b[n])-rest_len[n]))
        for a, c in (('calf_l', 'thigh_l'), ('calf_r', 'thigh_r'), ('lowerarm_l', 'upperarm_l'), ('lowerarm_r', 'upperarm_r'), ('hand_l', 'lowerarm_l'), ('hand_r', 'lowerarm_r'), ('foot_l', 'calf_l'), ('foot_r', 'calf_r')):
            worst = max(worst, dist(b[a][0], b[c][1]))
        for n in set(f.get("fixed", []))|set(must): wf = max(wf, dist(b[n][0], f0["bones"][n][0]))
        if E.get("fixed") == "손" and f0.get("grip_pt"):
            for s, p in f.get("grip_pt", {}).items(): wf = max(wf, dist(p, f0["grip_pt"][s]))
        wg = max([wg]+list(f.get("grip_err", {}).values())); an = angles(f)
        for s in 'lr':
            if 'spine_03' in f.get("front", {}):   # 굽힌 팔꿈치 끝이 몸 앞쪽(누우면 천장)을 향하면 역방향으로 보인다(힙 쓰러스트에서 실제로 났다)
                S_, E_, W_ = b['upperarm_'+s][0], b['lowerarm_'+s][0], b['hand_'+s][0]
                if angle(S_, E_, W_) < 150:
                    e_ = unit(sub(E_, mid(S_, W_))); fr_ = f["front"]['spine_03']; fc = dot(e_, fr_)
                    if fc > D.get("elbow_front", LIM["elbow_front"]): fails.append(f"팔꿈치 방향 역방향 의심({s}, 프레임 {fi}, {fc:.2f})")
                    up_ = unit(sub(b['neck_01'][0], b['spine_03'][0])); out_ = [up_[1]*fr_[2]-up_[2]*fr_[1], up_[2]*fr_[0]-up_[0]*fr_[2], up_[0]*fr_[1]-up_[1]*fr_[0]]; ic = -dot(e_, out_)*(1 if s == 'l' else -1)
                    if ic > LIM["elbow_in"]: fails.append(f"팔꿈치가 몸 안쪽을 향함({s}, 프레임 {fi}, {ic:.2f})")
            kp = knee_plane(b, s)
            if kp > LIM["knee_plane"]: fails.append(f"무릎이 경첩면에서 벗어남({s}, 프레임 {fi}, {kp:.0f}°)")
            k = knee_sign(b, f, s)
            if k is not None and k < -LIM["knee_hyper"]: fails.append(f"무릎 경첩 반대({s}, 프레임 {fi}, {k:.0f}°)")
            a_ = between(sub(b['thigh_'+s][1], b['foot_'+s][0]), sub(b['ball_'+s][0], b['foot_'+s][0]))
            if not (LIM["ankle"][0] <= a_ <= D.get("ankle_max_"+s, D.get("ankle_max", LIM["ankle"][1]))): fails.append(f"발목 각도 {a_:.0f}°({s}, 프레임 {fi})")
            if "front" in f:
                pf = f["front"]['pelvis']; pu = unit(sub(b['spine_01'][0], b['pelvis'][0])); d_ = unit(sub(b['calf_'+s][0], b['thigh_'+s][0])); ext = math.degrees(math.atan2(-dot(d_, pf), -dot(d_, pu)))
                if ext > LIM["hip_ext"]: fails.append(f"고관절 과신전 {ext:.0f}°({s}, 프레임 {fi})")
        for n, tw in (f.get("twist") or {}).items():
            if abs(tw) > LIM["twist"]: fails.append(f"{n} 비틀림 {tw:.0f}°(프레임 {fi}) — 팔꿈치가 반대로 꺾였을 수 있음")
            if n.startswith('lowerarm') and not (LIM["forearm_twist"][0] <= (tw if n.endswith('_l') else -tw) <= LIM["forearm_twist"][1]): fails.append(f"{n} 비틀림 범위 밖 {tw:.0f}°(프레임 {fi})")
            if tw_prev is not None and abs(tw-tw_prev.get(n, tw)) > D.get("twist_step", LIM["twist_step"]): fails.append(f"{n} 비틀림이 튐 {abs(tw-tw_prev[n]):.0f}°(프레임 {fi})")
        tw_prev = f.get("twist") or None
        if D.get("support") == "hang":
            c_ = com(f); gy = mid(b['hand_l'][0], b['hand_r'][0])[1]
            if abs(c_[1]-gy) > LIM["hang_com"]: fails.append(f"매달린 무게중심이 손에서 벗어남 {abs(c_[1]-gy)*100:.0f}cm(프레임 {fi})")
        chain = ('spine_01', 'spine_02', 'spine_03', 'neck_01', 'head')
        for u_, v_ in zip(chain, chain[1:]):
            g = between(sub(*b[u_][::-1]), sub(*b[v_][::-1]))
            if J.get("rest"): g = abs(g-between(sub(*J["rest"][u_][::-1]), sub(*J["rest"][v_][::-1])))   # 차렷 자세의 굽음을 뺀 값
            if g > LIM["spine_seg"]: fails.append(f"척추 {u_}-{v_} {g:.0f}°(프레임 {fi})")
        if not E.get("asym"):
            for k_ in ('knee', 'elbow'):
                dlt = abs(an[k_+'_l']-an[k_+'_r'])
                if dlt > LIM["sym"]: ws = max(ws, dlt)
        if ang_prev:
            for k in an:
                if k not in ('arms_open', 'legs_open'): wa = max(wa, abs(an[k]-ang_prev[k]))   # 양팔 사이 각은 한쪽 팔 움직임의 합이라 프레임 기준에 넣지 않는다
        if pos_prev:
            for n in MAIN: wp = max(wp, dist(b[n][0], pos_prev[n][0]))
        ang_prev, pos_prev = an, b
        if f.get("bar_clear") is not None and f["bar_clear"] < D.get("bar_clear_min", LIM["bar_clear"]): fails.append(f"바 관통 {f['bar_clear']*100:.1f}cm(프레임 {fi})")
        if f.get("zmin") is not None and f["zmin"] < LIM["floor"]: fails.append(f"바닥 관통 {f['zmin']*100:.1f}cm(프레임 {fi})")
        if f.get("self_pen", 0) > LIM["self_pen"]: fails.append(f"아래팔·몸통 관통 {f['self_pen']*100:.1f}cm(프레임 {fi})")
        if f.get("prop_pen", 0) > LIM["prop_pen"]: fails.append(f"소품 관통 {f['prop_pen']*100:.1f}cm {f.get('prop_pen_name')}(프레임 {fi})")
        if D.get("support") == "feet":
            c = com(f); xs = [b[n][0][0] for n in ('foot_l', 'foot_r', 'ball_l', 'ball_r')]; ys = []
            for s in 'lr':
                ys.append(b['ball_'+s][1][1]); lifted = (b['foot_'+s][0][2]-b['ball_'+s][0][2])-(f0["bones"]['foot_'+s][0][2]-f0["bones"]['ball_'+s][0][2]) > 0.03
                ys.append(b['ball_'+s][0][1]+0.03 if lifted else b['foot_'+s][0][1]+0.06)
            if not (min(xs)-0.05 <= c[0] <= max(xs)+0.05 and min(ys)-0.01 <= c[1] <= max(ys)+0.01): fails.append(f"무게중심이 지지면 밖 ({c[0]:.3f},{c[1]:.3f}, 프레임 {fi})")
    if worst > LIM["length"]: fails.append(f"뼈 길이·이음새 오차 {worst*1000:.2f}mm")
    if wa > D.get("angle_step", LIM["angle_step"]): fails.append(f"프레임당 관절각 {wa:.1f}°")
    if wp > D.get("pos_step", LIM["pos_step"]): fails.append(f"프레임당 위치 {wp*100:.1f}cm")
    if wf > LIM["fixed"]: fails.append(f"고정점 이동 {wf*1000:.1f}mm")
    if wg > LIM["grip"]: fails.append(f"손과 바 간격 {wg*1000:.1f}mm")
    if ws: fails.append(f"좌우 차이 {ws:.0f}°")
    if flags: fails.append("도달 제한: "+",".join(sorted(flags)))
    bars = [f["bar"] for f in F if f.get("bar")]
    if bars and D.get("bar_axis"):
        sx = max(b[0] for b in bars)-min(b[0] for b in bars); sy = max(b[1] for b in bars)-min(b[1] for b in bars); sz = max(b[2] for b in bars)-min(b[2] for b in bars)
        if sx > 0.01: fails.append(f"바 좌우 이동 {sx*100:.1f}cm")
        if D["bar_axis"] == "z" and sy > 0.01: fails.append(f"바 수직 궤적 이탈 {sy*100:.1f}cm")
        if D.get("bar_y_span") and not (D["bar_y_span"][0] <= sy <= D["bar_y_span"][1]): fails.append(f"바 앞뒤 이동 {sy*100:.1f}cm 선언 밖")
        if D.get("bar_z_span") and not (D["bar_z_span"][0] <= sz <= D["bar_z_span"][1]): fails.append(f"바 높이 이동 {sz*100:.1f}cm 선언 밖")
    idx = [0, len(F)//2, len(F)-1]; A_ = [angles(F[i]) for i in idx]
    AF = [angles(f) for f in F]
    for k_, need in (D.get("rom") or {}).items():
        if k_ in ROM_KEYS:
            got = max(a[k_] for a in AF)-min(a[k_] for a in AF)
            if got < need: fails.append(f"{k_} 움직임 {got:.0f}° 선언 최소 {need}°보다 작음")
    for name in RANGE_KEYS:
        if name not in D: continue
        for j, rng in enumerate(D[name][:3]):
            v = A_[j].get(name)
            if not (rng[0] <= v <= rng[1]): fails.append(f"{name} {('시작','중간','끝')[j]} {v:.0f}° 선언 {rng} 밖")
    if D.get("hip_knee_ratio"):
        lo, hi = D["hip_knee_ratio"]
        for a_, b_, nm in ((0, 1, "앞"), (1, 2, "뒤")):
            dk = abs(A_[a_]['knee']-A_[b_]['knee']); dh = abs(A_[a_]['hip']-A_[b_]['hip'])
            if dk > 5 and not (lo <= dh/dk <= hi): fails.append(f"고관절/무릎 비율 {nm} 구간 {dh/dk:.2f} 선언 {D['hip_knee_ratio']} 밖")
    if D.get("hip_below_knee_end"):
        b = F[-1]["bones"]
        if b['thigh_l'][0][2] >= b['calf_l'][0][2]: fails.append("끝 자세에서 고관절이 무릎보다 높음")
    return fails
def fingerprint(J):
    """렌더 지문: 관절 좌표(0.1mm 반올림)와 소품의 해시."""
    r = [[[round(x, 4) for x in pt] for n in sorted(f["bones"]) for pt in f["bones"][n]]+[[round(x, 4) for x in (f.get("bar") or [])]] for f in J["frames"]]
    return hashlib.sha256(json.dumps([r, J.get("props")]).encode()).hexdigest()
if __name__ == "__main__":
    cat, key, jp = sys.argv[1:4]; E = json.load(open(cat))["keys"][key]; J = json.load(open(jp)); fl = check_joints(J, E); pick = ('knee', 'hip', 'elbow', 'lean')
    a0, a1 = angles(J["frames"][0]), angles(J["frames"][-1]); f_ = J["frames"]
    print(key, "시작", {k: round(a0[k]) for k in pick}, "끝", {k: round(a1[k]) for k in pick}, "관통 몸통", round(max(x.get("self_pen", 0) for x in f_)*100, 1), "소품", round(max(x.get("prop_pen", 0) for x in f_)*100, 1), "비틀림", round(max(abs(v) for x in f_ for v in (x.get("twist") or {"":0}).values())), "바닥", round(min(x.get("zmin", 0) for x in f_)*100, 1))
    print("불합격" if fl else "합격", fl[:8], ("… 외 %d건" % (len(fl)-8)) if len(fl) > 8 else "")
    sys.exit(1 if fl else 0)
