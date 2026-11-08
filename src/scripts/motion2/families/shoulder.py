# SPDX-License-Identifier: GPL-3.0-or-later
"""어깨 고립 묶음 계산식(SPEC-040 Phase 10): 레이즈·리어 델트·페이스 풀·회전근·슈러그·원 그리기, 그리고 위로 밀기 나머지(소츠 프레스·오버헤드 캐리).
좌표: X 왼쪽+, -Y 앞, Z 위. Rx(+)=앞으로 숙임. t 0=시작, 1=반대쪽 자세(왕복) — 순환(cycle) 동작은 t 가 한 바퀴.
팔은 몸통 기준 방향(위팔 d, 아래팔 d2)으로 팔꿈치·손목을 직접 놓는다(jointed). 동작 근거는 실제 수행 관찰 메모(저장소 밖)."""
import math
from mathutils import Vector as V, Matrix
from rig import Rx, Ry, Rz, lerp, sstep, sqrt0
from scene import PLATE_R, barbell, box, cyl
from families.reps import (SIDES, BAR_KG, DB_KG, timing, dumbbell, hold, rot_to, wire, wire_to, grip_w, jointed, hang, stand_P, plant)
from families.squat_lunge import kettlebell, place_obj, local_pts, W_, KB_KG, sq_frame, arms as sq_arms
from families.hinge import stand_frame, load_setup as hg_load, bar_hands
from families.push import _mesh

def adir(sg, a, az, R=None):
    """팔 방향: a 늘어뜨린 자세에서 든 각(도), az 0=옆(벌리기)·90=앞(굽히기). R 은 몸통 회전."""
    a, z = math.radians(a), math.radians(az); d = V((sg*math.sin(a)*math.cos(z), -math.sin(a)*math.sin(z), -math.cos(a))).normalized(); return R@d if R is not None else d
def slerp(a, b, f):
    a, b = a.normalized(), b.normalized(); w = math.acos(max(-1.0, min(1.0, a.dot(b))))
    if w < 1e-4: return a.copy()
    return ((a*math.sin((1-f)*w)+b*math.sin(f*w))/math.sin(w)).normalized()
def bend_of(d, toward, deg):
    """d 를 toward 쪽으로 deg 만큼 꺾은 방향(팔꿈치 굽힘 — 아래팔)."""
    t = toward-d*toward.dot(d)
    if t.length < 1e-6: return d.copy()
    return (d*math.cos(math.radians(deg))+t.normalized()*math.sin(math.radians(deg))).normalized()
def arm_dir(r, s, d, d2, F=None, lat=None, pole=None):
    """위팔 d·아래팔 d2 방향으로 팔을 놓고 쥔 점을 돌려준다."""
    S = r.chain_head('upperarm_'+s); E = S+d*r.L_U; W = E+d2*r.L_F
    p = pole if pole is not None else (E-(S+W)/2 if (E-(S+W)/2).length > 1e-4 else -d2)
    return jointed(r, s, E, W, F if F is not None else d2, lat, p)
def stand(r, ctx, th=0.0, scap=(0.0, 0.0), ax=0.15, side=0.0):
    """곧게 서기. scap 은 (거상cm, 전인cm) 또는 측면별 dict."""
    P = stand_P(r, ax); R = Rx(th); sc = scap if isinstance(scap, dict) else {s: scap for s, _ in SIDES}
    r.torso(P, R, neck=Rx(th*0.4), head=Rx(th*0.3), scap=sc); return P, R, plant(r, ax)
def neutral_lat(d):
    """엄지가 위·앞(중립 그립)인 손 방향: 팔 방향과 X 축에 수직인 쪽."""
    l = d.cross(V((1, 0, 0)))
    return l.normalized() if l.length > 1e-4 else V((0, -1, 0))
def fit_floor(ctx, pose, T, pick):
    """pose(P) 로 몸을 놓고 pick 에 걸리는 정점의 최저 z 가 T 가 되도록 골반 높이를 고친다(벤치 위에 눕기)."""
    r = ctx.rig; P0 = V((0, 0, 1.2)); r.reset(); pose(P0); vs = _mesh(ctx)
    z = min(vs[i].z for i, w in enumerate(ctx.weights) if pick(w, ctx.rest_v[i])); return P0+V((0, 0, T-z))
def side_cam_note(): return None

# ════ 서서 팔 들기(레이즈) ════
# az 평면(0 옆·30 스캡션·90 앞), a0/a1 든 각, bend 팔꿈치 굽힘, load db·cable·band·bar·plate·none, grip pron·neutral, one 한 팔(r)
RZ = dict(az=0.0, a0=10.0, a1=86.0, bend=14.0, load='db', grip='pron', th=3.0, e1=1.5, one='', y_off=-0.10, mode='stand', lean=16.0, rise=0.0)
def rz_setup(ctx):
    C = dict(RZ); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; ld = C['load']; local_pts(ctx)
    sides = [('r', -1)] if C['one'] else list(SIDES); ctx.SIDES_ = sides
    if ld == 'db': ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in sides}
    if ld == 'cable':
        ctx.W = {s: wire(ctx) for s, _ in sides}; ctx.HD = {s: cyl("hdl_"+s, 0.016, 0.13, M_.STEEL, verts=24) for s, _ in sides}; ctx.PUL = {}
        for s, sg in sides:
            if C['az'] >= 60: ctx.PUL[s] = V((sg*0.10, r.ANK_Y-0.42, 0.12))   # 앞 들기: 발 앞 낮은 도르래를 마주 보고 선다
            elif C['mode'] == 'lean': ctx.PUL[s] = V((0.55, r.ANK_Y-0.30, 0.12))   # 기댄 레이즈: 기둥 쪽 낮은 도르래에서 몸 앞을 지나 온다
            else: ctx.PUL[s] = V((-sg*0.62, r.ANK_Y-0.35, 0.12))   # 옆 들기: 반대쪽 낮은 도르래에서 몸 앞을 지나 온다
            box("stack_"+s, (0.14, 0.14, 1.95), (ctx.PUL[s].x+(0.10 if ctx.PUL[s].x > 0 else -0.10)*(1 if C['az'] < 60 else 0), ctx.PUL[s].y-(0.10 if C['az'] >= 60 else 0), 0.975), M_.FRAME)
    if ld == 'cable_bar':
        ctx.W = {'c': wire(ctx)}; ctx.HB = cyl("hbar", 0.014, 0.50, M_.STEEL, verts=24); ctx.PUL = {'c': V((0, r.ANK_Y-0.48, 0.12))}; box("stack", (0.30, 0.16, 1.95), (0, r.ANK_Y-0.62, 0.975), M_.FRAME)
    if ld == 'band': ctx.BD = {s: wire(ctx, "band") for s, _ in sides}
    if ld == 'bar': ctx.BAR = barbell(ctx.col, M_)
    if ld == 'plate': ctx.PL = cyl("plate", 0.20, 0.035, M_.RUBBER, axis='Y', verts=96)
    ctx.POSTX = 0.27
    if C['mode'] == 'lean': box("post", (0.05, 0.05, 1.90), (ctx.POSTX, r.ANK_Y-0.02, 0.95), M_.FRAME)
def raise_(r, t, ctx):
    C = ctx.C; u = timing(t); ld = C['load']; load = []
    a = lerp(C['a0'], C['a1'], u); e = lerp(0.0, C['e1'], sstep(0.3, 1.0, u)) if C['a1'] < 120 else lerp(0.0, C['e1'], u)
    if C['mode'] == 'lean':   # 한 손으로 기둥을 잡고 몸을 반대쪽으로 기울인다(발은 기둥 가까이)
        ax = 0.09; lean = C['lean']; Rl = Ry(-lean); L_ = (r.L_T+r.L_S)*0.94
        Hc = V((0, r.ANK_Y-0.01, r.ANK_Z))+Rl@V((0, 0, L_)); P = Hc-Rl@((r.head0('thigh_l')+r.head0('thigh_r'))/2-r.head0('pelvis'))   # 발목 가운데에서 다리 길이만큼 기울인 곳이 고관절 중심
        r.torso(P, Rl, neck=Rl, head=Ry(-lean*0.6), scap={'l': (2.0, 0.0), 'r': (e, 0.5)}); fixed = []
        for s, sg in SIDES: r.leg_ik(s, V((sg*ax+0.02, r.ANK_Y, r.ANK_Z)), Rl@V((sg*0.15, -1, 0)), Rz(sg*6)@V((0, -1, 0)), sg*6.0); fixed.append('foot_'+s)
        R = Rl
        G = V((ctx.POSTX-0.035, r.ANK_Y-0.02, 1.16)); Sl = r.chain_head('upperarm_l'); r.arm('l', G, V((0, -0.15, -1)).normalized(), V((0.2, 0.6, -0.8)), V((0, -1, 0)), 0.9995); r.fingers('l')
    else:
        R = Rx(C['th']); P = stand_P(r, 0.15); sc = {s: (e if (not C['one'] or s == 'r') else 0.0, 0.5) for s, _ in SIDES}
        r.torso(P, R, neck=Rx(1), head=Rx(1), scap=sc); fixed = plant(r, 0.15)
    Gs = {}
    for s, sg in ctx.SIDES_:
        d = R@adir(sg, a, C['az']); dd = R@adir(sg, a+5.0, C['az'])-d
        tow = V((0, -1, 0)) if C['az'] < 45 else dd
        d2 = bend_of(d, tow, C['bend']); pole = bend_of(d, -tow, 30.0)
        if C['grip'] == 'neutral': lat = neutral_lat(d2)
        elif C['az'] < 45: lat = V((0, -1, 0))   # 옆 들기: 엄지가 앞(손등이 위)
        else: lat = None   # 앞 들기 오버그립: 바 축이 좌우
        G = arm_dir(r, s, d, d2, d2, lat, pole); r.fingers(s); Gs[s] = (G, lat)
        if ld == 'db': hold(ctx, s, G, lat if lat is not None else V((1, 0, 0))); load.append((G, DB_KG*0.5))
        if ld == 'cable': ctx.HD[s].location = G; rot_to(ctx.HD[s], lat if lat is not None else V((1, 0, 0))); wire_to(ctx.W[s], G, ctx.PUL[s])
        if ld == 'band': wire_to(ctx.BD[s], G, V((sg*0.10, r.ANK_Y-0.01, 0.025)))
    if C['one'] and C['mode'] != 'lean':   # 쉬는 팔은 허리에
        Lw = ctx.L_WAIST; G = W_(P, R, ctx, V((Lw.x, Lw.y, Lw.z))); jointed(r, 'l', r.chain_head('upperarm_l')+R@V((0.85, 0.45, -0.30)), G, R@V((-0.3, -0.6, -0.7)), R@V((0, 0.6, 0.8)), R@V((1, 0.6, 0))); r.fingers('l', 0.2)
    if ld in ('bar', 'plate', 'cable_bar'):
        m = (Gs['l'][0]+Gs['r'][0])/2
        if ld == 'bar': ctx.BAR.location = m; load = [(m, 20.0)]
        if ld == 'cable_bar': ctx.HB.location = m; wire_to(ctx.W['c'], m, ctx.PUL['c'])
        if ld == 'plate':
            n = (Gs['l'][0]-Gs['r'][0]).cross(V((0, 0, 1)) if a < 150 else V((0, -1, 0))); n = n.normalized() if n.length > 1e-4 else V((0, -1, 0))
            ctx.PL.location = m; ctx.PL.rotation_mode = 'QUATERNION'; ctx.PL.rotation_quaternion = n.to_track_quat('Z', 'X'); load = [(m, 10.0)]
    return dict(bar=None, load=load, fixed=fixed)

# ════ 엎드려(인클라인 벤치에 가슴) 들기: Y 레이즈·W 레이즈·인클라인 슈러그 ════
PR = dict(mode='y', th=45.0, load='db')
def pr_setup(ctx):
    C = dict(PR); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; local_pts(ctx); th = C['th']; R = Rx(th); ctx.R = R
    dyf = 0.34; Lg = (r.L_T+r.L_S)*0.975; Hz = r.ANK_Z+sqrt0(Lg**2-dyf**2); off = R@r.HIP_OFF; ctx.P = V((0, -off.y, Hz-off.z)); ctx.Ay = dyf
    p0 = r.head0('pelvis'); S = r.head0('upperarm_l'); fr = [v for v in ctx.rest_v if abs(v.x) < 0.12 and p0.z+0.05 < v.z < S.z-0.10]; yF = min(v.y for v in fr)
    zc = (p0.z+0.05+S.z-0.12)/2; c = W_(ctx.P, R, ctx, V((0, yF-0.035, zc))); L = (S.z-0.12)-(p0.z+0.05)+0.10
    pad = box("pad", (0.32, 0.07, L), tuple(c), M_.PAD, 0.024); pad.rotation_euler = (math.radians(th), 0, 0)
    low = c+R@V((0, 0.06, -L/2)); box("stem", (0.08, 0.08, max(0.1, c.z-0.10)), (0, c.y+0.06, (c.z-0.10)/2), M_.FRAME); box("ft", (0.50, 0.09, 0.04), (0, c.y+0.06, 0.02), M_.FRAME)   # 기둥은 패드 가운데 아래(허벅지에서 떨어지게)
    ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
def prone(r, t, ctx):
    C = ctx.C; u = timing(t); R = ctx.R; m = C['mode']; th = C['th']; load = []
    sc = {'y': (lerp(0.0, 3.5, u), lerp(1.0, -1.0, u)), 'w': (lerp(0.0, -0.5, u), lerp(1.0, -3.0, u)), 'shrug': (lerp(-0.5, 4.5, u), lerp(1.0, -2.5, u))}[m]
    r.torso(ctx.P, R, neck=Rx(th-12), head=Rx(th-22), scap={s: sc for s, _ in SIDES}); fixed = ['spine_03']
    for s, sg in SIDES:
        A = V((sg*0.13, ctx.P.y+ctx.Ay+r.HIP_OFF.y, r.ANK_Z)); r.leg_ik(s, A, V((sg*0.1, -1, 0)), Rz(sg*6)@V((0, -1, 0)), sg*6.0); fixed.append('foot_'+s)
    up = R@V((0, 0, 1)); down = V((0, 0, -1))
    for s, sg in SIDES:
        if m == 'y':   # 늘어뜨린 팔 → 몸통 연장선에서 30° 벌린 Y
            end = (up*math.cos(math.radians(32))+V((sg*math.sin(math.radians(32)), 0, 0))).normalized(); d = slerp(V((sg*0.05, -0.02, -1)), end, u); d2 = bend_of(d, V((0, 0, 1)), 6.0)
            lat = neutral_lat(d2) if u < 0.5 else (R@V((0, 0, 1))).cross(V((sg, 0, 0))).normalized()
            lat = neutral_lat(d2); pole = bend_of(d, V((0, 0, -1)), 30.0)
        elif m == 'w':   # 팔꿈치를 몸통 옆 아래로 당기며 아래팔을 세운다(W)
            d = slerp(V((sg*0.06, -0.05, -1)), R@V((sg*0.75, 0.45, -0.48)), u); fa = slerp(V((sg*0.02, -0.15, -1)), R@V((sg*0.35, 0.10, 0.93)), u); d2 = fa; lat = neutral_lat(d2); pole = None
        else:
            d = V((sg*0.06, -0.02, -1)).normalized(); d2 = d; lat = V((0, -1, 0)); pole = V((sg*0.3, 0.9, 0))
        G = arm_dir(r, s, d, d2, d2, lat, pole); r.fingers(s); hold(ctx, s, G, lat); load.append((G, DB_KG*0.6))
    return dict(bar=None, load=load, fixed=fixed)

# ════ 옆으로 누워(벤치) 위쪽 팔: 사이드 레터럴·사이드 리어 델트·외회전 ════
SD = dict(mode='lat', T=0.46)
def sd_setup(ctx):
    C = dict(SD); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; T = C['T']; R = Ry(90.0); ctx.R = R
    pick = lambda w, v: sum(x for k, x in w.items() if k.startswith(('upperarm', 'lowerarm', 'hand', 'index', 'middle', 'ring', 'pinky', 'thumb', 'head', 'neck'))) < 0.3   # 팔·머리를 뺀 몸 전체(엉덩이·허벅지가 몸통보다 낮다)
    ctx.P = fit_floor(ctx, lambda P: sd_torso(r, P, R, 0.0), T, pick)
    box("pad", (1.25, 0.30, 0.07), (ctx.P.x+0.05, ctx.P.y, T-0.035), M_.PAD, 0.024); box("frame", (1.05, 0.08, 0.05), (ctx.P.x+0.05, ctx.P.y, T-0.095), M_.FRAME)
    for x_ in (ctx.P.x-0.42, ctx.P.x+0.52): box("post", (0.07, 0.07, T-0.12), (x_, ctx.P.y, (T-0.12)/2+0.02), M_.FRAME); box("ft", (0.09, 0.56, 0.04), (x_, ctx.P.y, 0.02), M_.FRAME)
    ctx.DB = {'r': dumbbell(ctx, "db_r")}
def sd_torso(r, P, R, e):
    r.torso(P, R, neck=Ry(80.0), head=Ry(72.0), scap={'l': (1.0, 0.5), 'r': (e, 0.0)})
def side(r, t, ctx):
    C = ctx.C; u = timing(t); R = ctx.R; m = C['mode']; sd_torso(r, ctx.P, R, lerp(0.0, 1.5, u) if m == 'lat' else 0.0)
    for s, sg in SIDES:   # 다리는 포개고 무릎을 살짝 굽힌다(위 다리 = 오른쪽)
        H = r.chain_head('thigh_'+s); A = H+(R@V((0, -0.32, -1))).normalized()*(r.L_T+r.L_S)*0.965
        r.leg_ik(s, A, R@V((0, -1, 0.0)), V((0, -1, 0)), 0.0)
        r.set_delta('foot_'+s, R@Rx(8.0), r.chain_head('foot_'+s)); r.inherit('ball_'+s)
    Sl = r.chain_head('upperarm_l'); El = Sl+V((0.9, -0.25, 0.20)).normalized()*r.L_U; jointed(r, 'l', El, El+V((-0.25, -0.55, 0.80)).normalized()*r.L_F, V((-0.25, -0.55, 0.80)).normalized(), None, V((0, 0.3, -1))); r.fingers('l', 0.5)   # 아래 팔: 머리 앞에 접어 둔다
    if m == 'lat':   # 엉덩이 앞에 둔 팔을 천장까지
        d = slerp(V((-0.88, -0.45, -0.05)), V((0.0, -0.06, 1)), u); d2 = bend_of(d, V((0, -1, 0)), 12.0); lat = V((0, -1, 0)); pole = bend_of(d, V((0, 1, 0)), 30)
    elif m == 'rear':   # 가슴 앞 바닥 쪽으로 늘어뜨린 팔을 앞으로 돌려 천장까지
        b = math.radians(lerp(-45.0, 80.0, u)); d = V((-0.05, -math.cos(b), math.sin(b))).normalized(); dd = V((0, math.sin(b), math.cos(b))); d2 = bend_of(d, -dd, 14.0); lat = V((1, 0, 0)); pole = bend_of(d, dd, 30)   # 팔꿈치가 앞장서고 손이 따라온다(엄지는 머리 쪽)
    else:   # 외회전: 위팔은 옆구리에, 팔꿈치 90°, 아래팔이 배 앞에서 위로
        d = V((-1, -0.05, 0.02)).normalized(); c = math.radians(lerp(-25.0, 50.0, u)); d2 = V((0, -math.cos(c), math.sin(c))).normalized(); lat = V((1, 0, 0)); pole = None   # 엄지가 머리 쪽(중립 그립)
    G = arm_dir(r, 'r', d, d2, d2, lat, pole); r.fingers('r'); hold(ctx, 'r', G, lat)
    return dict(bar=None, load=[(G, DB_KG*0.5)], fixed=['spine_03', 'pelvis'])

# ════ 숙여 들기(벤트오버): 리어 델트 플라이·덤벨 리어 델트 로우 ════
BO = dict(mode='fly', al=8.0, ph=32.0, th=58.0, ax=0.15, toe=8.0)
def bo_setup(ctx):
    C = dict(BO); C.update(ctx.vars); ctx.C = C; local_pts(ctx); ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
def bent(r, t, ctx):
    C = ctx.C; u = timing(t); m = C['mode']; th = C['th']
    P, R, A, K = stand_frame(r, C, C['al'], C['ph'], th, scap=(0.0, lerp(1.5, -2.5, u))); fixed = ['foot_l', 'foot_r']; load = []
    for s, sg in SIDES:
        if m == 'fly':   # 팔꿈치를 살짝 굽힌 채 옆으로(바닥과 수평까지)
            a = lerp(6.0, 82.0, u); d = V((sg*math.sin(math.radians(a)), 0.02, -math.cos(math.radians(a)))).normalized(); d2 = bend_of(d, V((0, -1, 0)), 16.0); lat = V((0, -1, 0)); pole = bend_of(d, V((0, 1, 0)), 30)
        else:   # 리어 델트 로우: 팔꿈치를 옆으로 벌려 어깨 높이까지 당긴다(아래팔은 바닥을 향함)
            d = slerp(V((sg*0.06, -0.04, -1)), V((sg*0.90, 0.10, 0.22)), u); d2 = slerp(V((sg*0.02, -0.08, -1)), V((-sg*0.10, -0.15, -1)), u); lat = V((-1, 0, 0)) if s == 'l' else V((1, 0, 0)); pole = None
        G = arm_dir(r, s, d.normalized(), d2.normalized(), d2.normalized(), lat, pole); r.fingers(s); hold(ctx, s, G, lat); load.append((G, DB_KG*0.6))
    return dict(bar=None, load=load, fixed=fixed)

# ════ 어깨 높이 당기기: 페이스 풀·케이블 리어 델트 로우·밴드 풀 어파트·케이블/밴드 리어 델트 플라이 ════
FP = dict(mode='face', load='cable', th=-3.0)
def fp_setup(ctx):
    C = dict(FP); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; local_pts(ctx); r.reset(); P = stand_P(r, 0.15); r.torso(P, Rx(C['th'])); S = r.chain_head('upperarm_l'); ctx.S0 = S.copy(); m = C['mode']
    ld = C['load']; z = S.z+(0.10 if m == 'face' else 0.0)
    if m in ('face', 'row'):
        ctx.ANC = V((0, S.y-1.45, z)); ctx.W = wire(ctx, "cable" if ld == 'cable' else "band"); ctx.RP = {s: wire(ctx, "rope") for s, _ in SIDES}
        if ld == 'cable': box("stack", (0.30, 0.18, 2.0), (0, ctx.ANC.y-0.12, 1.0), M_.FRAME)
        else: box("post", (0.08, 0.08, 2.0), (0, ctx.ANC.y-0.05, 1.0), M_.FRAME)
    if m == 'fly':
        ctx.W = {s: wire(ctx, "cable" if ld == 'cable' else "band") for s, _ in SIDES}; ctx.HD = {s: cyl("hdl_"+s, 0.016, 0.13, M_.STEEL, verts=24) for s, _ in SIDES}
        if ld == 'cable':
            ctx.ANCS = {s: V((-sg*0.75, S.y-0.80, S.z)) for s, sg in SIDES}
            for s, sg in SIDES: box("stack_"+s, (0.14, 0.14, 2.0), (-sg*0.85, S.y-0.80, 1.0), M_.FRAME)
        else: ctx.ANCS = {s: V((0, S.y-1.30, S.z)) for s, _ in SIDES}; box("post", (0.08, 0.08, 2.0), (0, S.y-1.35, 1.0), M_.FRAME)
    if m == 'apart': ctx.BD = wire(ctx, "band")
def facepull(r, t, ctx):
    C = ctx.C; u = timing(t); m = C['mode']; th = C['th']; ld = C['load']
    P, R, fixed = stand(r, ctx, th, scap=(lerp(0.0, 0.5, u), lerp(2.0, -3.0, u))); Gs = {}
    for s, sg in SIDES:
        if m == 'face':   # 눈높이 로프: 팔꿈치를 높고 넓게, 끝에서 손이 귀 옆(외회전)
            d = slerp(V((sg*0.12, -1, 0.10)), V((sg*0.82, 0.28, 0.18)), u); d2 = slerp(V((sg*0.05, -1, 0.14)), V((-sg*0.10, -0.42, 0.90)), u); lat = slerp(V((0, 0, 1)), V((0, 0.85, 0.30)), u); pole = None
        elif m == 'row':   # 리어 델트 로우: 팔꿈치를 어깨 높이로 벌려 몸통 선까지(손은 가슴 앞)
            d = slerp(V((sg*0.12, -1, 0.0)), V((sg*0.86, 0.36, -0.02)), u); d2 = slerp(V((sg*0.05, -1, 0.0)), V((-sg*0.12, -1, -0.02)), u); lat = V((-1, 0, 0)) if s == 'l' else V((1, 0, 0)); pole = None
        elif m == 'fly':   # 리어 델트 플라이: 앞으로 뻗은 팔을 어깨 높이에서 옆으로(T)
            b = math.radians(lerp(8.0, 86.0, u)); d = V((sg*math.sin(b), -math.cos(b), 0.0)); d2 = bend_of(d, V((0, -1, 0)), 10.0); lat = V((0, 0, 1)); pole = bend_of(d, V((0, 1, 0)), 30)
        else:   # 풀 어파트: 오버그립 곧은 팔을 어깨 높이에서 옆으로
            b = math.radians(lerp(10.0, 84.0, u)); d = V((sg*math.sin(b), -math.cos(b), -0.04)).normalized(); d2 = bend_of(d, V((0, -1, 0)), 5.0); lat = V((-sg*math.cos(b), -math.sin(b), 0)) if False else None; lat = V((-1, 0, 0)) if s == 'l' else V((1, 0, 0)); pole = bend_of(d, V((0, 0, -1)), 30)
        G = arm_dir(r, s, d.normalized(), d2.normalized(), d2.normalized(), lat.normalized() if lat is not None else None, pole); r.fingers(s); Gs[s] = G
        if m == 'fly': ctx.HD[s].location = G; rot_to(ctx.HD[s], V((0, 0, 1))); wire_to(ctx.W[s], G, ctx.ANCS[s])
    if m in ('face', 'row'):
        c = (Gs['l']+Gs['r'])/2+V((0, -0.10*(1-u)-0.05, 0)); wire_to(ctx.W, c, ctx.ANC)
        for s, _ in SIDES: wire_to(ctx.RP[s], Gs[s], c)
    if m == 'apart': wire_to(ctx.BD, Gs['l'], Gs['r'])
    return dict(bar=None, load=[], fixed=fixed)

# ════ 회전근(서서): 팔꿈치를 옆구리에 붙이고 아래팔만 돌린다 ════
RT = dict(dir='ext', load='cable')
def rt_setup(ctx):
    C = dict(RT); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; local_pts(ctx); r.reset(); P = stand_P(r, 0.15); r.torso(P, Rx(0)); S = r.chain_head('upperarm_r')
    z = S.z-r.L_U+0.02; side = 1 if C['dir'] == 'ext' else -1   # 외회전: 반대쪽(왼쪽)에서 당긴다, 내회전: 같은 쪽(오른쪽)
    ctx.ANC = V((side*0.85, S.y-0.25, z)); ctx.W = wire(ctx, "cable" if C['load'] == 'cable' else "band"); ctx.HD = cyl("hdl", 0.016, 0.13, M_.STEEL, axis='Z', verts=24)
    box("stack" if C['load'] == 'cable' else "post", (0.14, 0.14, 2.0), (side*0.95, S.y-0.25, 1.0), M_.FRAME)
def rotate(r, t, ctx):
    C = ctx.C; u = timing(t); P, R, fixed = stand(r, ctx, 1.0, scap={'l': (0.0, 0.0), 'r': (0.0, lerp(1.0, -1.5, u) if C['dir'] == 'ext' else lerp(-1.0, 1.0, u))})
    c = math.radians(lerp(-28.0, 62.0, u) if C['dir'] == 'ext' else lerp(55.0, -32.0, u))
    d = V((-0.08, -0.04, -1)).normalized(); d2 = V((-math.sin(c), -math.cos(c), 0.03)).normalized(); lat = V((0, 0, 1))
    G = arm_dir(r, 'r', d, d2, d2, lat, None); r.fingers('r'); ctx.HD.location = G; wire_to(ctx.W, G, ctx.ANC)
    Lw = ctx.L_WAIST; Gl = W_(P, R, ctx, V((Lw.x, Lw.y, Lw.z))); jointed(r, 'l', r.chain_head('upperarm_l')+R@V((0.85, 0.45, -0.30)), Gl, R@V((-0.3, -0.6, -0.7)), R@V((0, 0.6, 0.8)), R@V((1, 0.6, 0))); r.fingers('l', 0.2)
    return dict(bar=None, load=[], fixed=fixed)

# ════ 슈러그: 팔은 편 채 견갑만 올린다 ════
SH = dict(load='bar', ax=0.135, toe=8.0, bar_dy=-0.145, zb=0.24, e1=5.5, p0=0.5, p1=0.0, oh=False)
def sh_setup(ctx):
    C = dict(SH); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; ld = C['load']
    if C['oh']:
        local_pts(ctx)
        if ld == 'bar': ctx.BAR = barbell(ctx.col, M_)
        else: ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
        return
    if ld == 'machine':
        local_pts(ctx); ctx.HD = {s: cyl("hdl_"+s, 0.017, 0.14, M_.STEEL, axis='Y', verts=24) for s, _ in SIDES}; ctx.LV = {s: cyl("lever_"+s, 0.022, 1.0, M_.FRAME, axis='Z', verts=16) for s, _ in SIDES}
        box("frame", (0.90, 0.12, 1.70), (0, r.ANK_Y+0.42, 0.85), M_.FRAME); box("base", (0.95, 0.40, 0.05), (0, r.ANK_Y+0.55, 0.025), M_.FRAME)   # 발판은 발 뒤(신발이 파고들지 않게)
        return
    hg_load(ctx, {'db': 'db_side', 'trap': 'trap', 'cable': 'cable', 'smith': 'smith', 'bar': 'bar'}[ld])
def shrug(r, t, ctx):
    C = ctx.C; u = timing(t); ld = C['load']; e = lerp(-0.5, C['e1'], u); p = lerp(C['p0'], C['p1'], u)
    if C['oh']:   # 머리 위로 편 팔(스내치 그립) 그대로 어깨를 귀 쪽으로
        P, R, fixed = stand(r, ctx, 0.5, scap=(lerp(1.0, C['e1'], u), 0.0)); S = r.chain_head('upperarm_l'); load = []
        grip = 0.48 if ld == 'bar' else 0.24; L_ = (r.L_U+r.L_F)*0.990; y = S.y+0.01; z = S.z+sqrt0(L_**2-(grip-S.x)**2-(y-S.y)**2)+r.GRIP_F*0.95; bar = V((0, y, z))
        for s, sg in SIDES:
            G = bar+V((sg*grip, 0, 0)); lat = None if ld == 'bar' else V((0, -1, 0)); r.arm(s, G, V((sg*0.25, 0.02, 1)).normalized(), V((sg*0.8, 0.35, -0.4)), lat, 0.9995); r.fingers(s)
            if ld != 'bar': hold(ctx, s, G, V((0, 1, 0))); load.append((G, DB_KG))
        if ld == 'bar': ctx.BAR.location = bar; load = [(bar, BAR_KG)]
        return dict(bar=bar if ld == 'bar' else None, load=load, fixed=fixed)
    if ld == 'machine':
        P, R, fixed = stand(r, ctx, 1.0, scap=(e, p)); S = r.chain_head('upperarm_l'); L_ = (r.L_U+r.L_F)*0.970; x = 0.30; y = S.y+0.02; z = S.z-sqrt0(L_**2-(x-S.x)**2)-r.GRIP_F
        for s, sg in SIDES:
            G = V((sg*x, y, z)); r.arm(s, G, V((0, 0, -1)), V((sg*0.6, 0.8, 0)), V((0, -1, 0)), 0.9995); r.fingers(s); ctx.HD[s].location = G; wire_to(ctx.LV[s], G+V((sg*0.03, 0.06, 0)), V((sg*0.32, r.ANK_Y+0.40, 1.55)))
        return dict(bar=None, load=[], fixed=fixed)
    P, R, A, K = stand_frame(r, C, 1.5, 2.0, 1.0, scap=(e, p)); bar, load = bar_hands(r, ctx, C, P, R, u)
    if ld == 'db':
        for s, sg in SIDES: hold(ctx, s, bar+V((sg*C.get('grip', 0.28), C.get('db_dy', 0.0), 0)), V((0, 1, 0)))   # 손잡이 위 손 자리를 앞뒤로 맞춘다(엄지가 원판에 닿지 않게)
    return dict(bar=bar if ld in ('bar', 'smith', 'cable') else None, load=load, fixed=['foot_l', 'foot_r'])

# ════ 점프 슈러그: 쿼터 딥 → 발목·무릎·엉덩이를 펴며 뛰고 어깨를 으쓱 ════
JS = dict(ax=0.135, toe=8.0, load='bar', bar_dy=-0.145, follow=True, follow_dy=-0.10)
def js_setup(ctx):
    C = dict(JS); C.update(ctx.vars); ctx.C = C; hg_load(ctx, 'bar')
def jump_shrug(r, t, ctx):
    C = ctx.C; u = timing(t); w = sstep(0.0, 0.7, u); air = 0.08*sstep(0.55, 1.0, u); pitch = lerp(0.0, 26.0, sstep(0.35, 0.9, u))
    th = lerp(14.0, 0.0, w); dip = lerp(0.105, 0.0, w); ax = C['ax']; R = Rx(th); off = R@r.HIP_OFF
    Ball = {}
    for s, sg in SIDES:
        b0 = r.head0('ball_'+s); Ball[s] = V((sg*abs(b0.x), b0.y, b0.z+air+0.02*pitch/26.0))   # 발끝으로 설 때 발가락이 바닥에 파고들지 않게
    A_ = {s: r.ankle_from_ball(s, Ball[s], sg*C['toe'], pitch) for s, sg in SIDES}
    L_ = (r.L_T+r.L_S)*0.992; Al = A_['l']; y = r.head0('pelvis').y+0.06*(1-w)-0.03*w
    z = Al.z+sqrt0(L_**2-(off.x-Al.x)**2-(y+off.y-Al.y)**2)-off.z-dip; P = V((0, y, z))
    r.torso(P, R, neck=Rx(th*0.5), head=Rx(th*0.3), scap={s: (lerp(-0.5, 5.5, sstep(0.45, 1.0, u)), 0.5) for s, _ in SIDES})
    for s, sg in SIDES: r.leg_ik(s, A_[s], V((sg*0.22, -1, 0)), Rz(sg*C['toe'])@V((0, -1, 0)), sg*C['toe'], pitch, False)
    C['follow_dy'] = -0.15; bar, load = bar_hands(r, ctx, C, P, R, u)   # 딥에서는 무릎이 앞으로 나와 바를 조금 앞에
    return dict(bar=bar, load=load, fixed=[])

# ════ 원 그리기: 케틀벨 헤일로·허리 둘레 돌리기·누워서 어라운드 더 월드·플레이트 버스 드라이버 ════
HL = dict(mode='halo')
def hl_setup(ctx):
    C = dict(HL); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; local_pts(ctx); m = C['mode']
    if m in ('halo', 'waist'): ctx.KB = kettlebell(ctx, "kb")
    if m == 'bus': ctx.PL = cyl("plate", 0.20, 0.035, M_.RUBBER, axis='Y', verts=96)
    if m == 'atw':
        import families.reps as RP
        RP.lie_setup(ctx); ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
def circle(r, t, ctx):
    C = ctx.C; m = C['mode']; load = []
    if m == 'atw':   # 누워서 허벅지 옆 → 옆으로 크게 → 머리 위(팔은 거의 편 채, 손바닥 위)
        import families.reps as RP
        u = 0.5-0.5*math.cos(2*math.pi*t); RP.lie_torso(ctx.rig, ctx.P, (lerp(-1.0, 1.5, u), -1.0)); R = Rx(-90)   # 순환 재생: 같은 호로 올라갔다 돌아온다
        for s, sg in SIDES:
            b = math.radians(lerp(18.0, 168.0, u)); dl = V((sg*math.sin(b), 0.10, -math.cos(b))).normalized(); d = R@dl; d2 = bend_of(d, R@V((0, -1, 0)), 10.0); lat = R@V((0, 0, 1)) if False else None
            lat = (d2.cross(R@V((0, -1, 0)))*sg).normalized()
            G = arm_dir(r, s, d, d2, d2, lat, bend_of(d, R@V((0, 1, 0)), 30)); r.fingers(s); hold(ctx, s, G, lat); load.append((G, DB_KG*0.5))
        RP.lie_legs(r, ctx); return dict(bar=None, load=load, fixed=['foot_l', 'foot_r', 'pelvis', 'spine_03'])
    if m == 'bus':   # 플레이트를 어깨 높이로 뻗어 들고 핸들처럼 좌우로 돌린다
        u = timing(t); P, R, fixed = stand(r, ctx, -2.0, scap=(0.5, 2.0)); S = r.chain_head('upperarm_l'); g = math.radians(lerp(-55.0, 55.0, u))
        c = V((0, S.y-(r.L_U+r.L_F)*0.80, S.z-0.03)); Gs = {}
        for s, sg in SIDES:
            h = c+V((sg*0.20*math.cos(g), 0, sg*0.20*math.sin(g))); F = (h-r.chain_head('upperarm_'+s)).normalized(); lat = V((-sg*math.sin(g), 0, math.cos(g))) if True else None
            lat = V((math.sin(g)*0.0-sg*math.sin(g), 0.0, math.cos(g))).normalized()
            r.arm(s, h, F, V((sg*0.8, 0.2, -0.6)), lat, 0.9995); r.fingers(s); Gs[s] = h
        ctx.PL.location = c; ctx.PL.rotation_mode = 'XYZ'; ctx.PL.rotation_euler = (math.pi/2, g, 0)   # 판 면은 앞을 보고 Y 축으로 돈다
        return dict(bar=None, load=[(c, 10.0)], fixed=fixed)
    ph = 2*math.pi*t
    if m == 'halo':   # 케틀벨을 거꾸로(손잡이 양옆) 들고 머리 둘레를 돈다: 앞(턱) → 왼쪽 → 뒤(목) → 오른쪽
        P, R, fixed = stand(r, ctx, 0.0, scap=(1.5, 0.0)); Hd = r.chain_head('head'); c = V((0, Hd.y+0.02, Hd.z+0.07)); w = (1-math.cos(ph))/2; rx, ry = 0.21, 0.20   # w 0=얼굴 앞, 1=머리 뒤
        K = c+V((rx*math.sin(ph), -ry*math.cos(ph), -0.03*math.cos(ph))); tang = V((math.cos(ph), math.sin(ph), 0)); rad = (K-c); rad.z = 0; rad = rad.normalized()
        for s, sg in SIDES:
            G = K+tang*(sg*0.045)-V((0, 0, 0.02)); F = (V((0, 0, 1))*0.6-rad*0.4).normalized(); lat = (tang*sg-rad*0.5).normalized()
            k = 0.0*max(0.0, -sg*rad.x); pole = V((sg*0.8*(1-k), lerp(0.2-0.9*w, -0.35, k), lerp(-0.6+0.7*w, -0.85, k)))   # 머리 뒤로 갈수록 팔꿈치가 앞·위, 반대편으로 건너간 팔은 팔꿈치가 얼굴 앞
            r.arm(s, G, F, pole, lat, 0.9995); r.fingers(s, 0.8)
        place_obj(ctx.KB, K+V((0, 0, 0.06)), Rx(180)); return dict(bar=None, load=[(K, KB_KG)], fixed=fixed)
    # 허리 둘레: 왼손이 앞→왼쪽→뒤, 뒤에서 오른손이 받아 오른쪽→앞
    P, R, fixed = stand(r, ctx, 2.0, scap=(0.0, 0.0)); p0 = ctx.rig.head0('pelvis'); zc = P.z+0.07; ky = P.y
    def ring(a): return V((0.30*math.sin(a), ky-(0.30 if math.cos(a) > 0 else 0.25)*math.cos(a), zc))
    K = ring(ph)
    for s, sg in SIDES:
        hold_ = (s == 'l' and ph <= math.pi) or (s == 'r' and ph > math.pi)
        a = ph if hold_ else 2*math.pi-ph; H = ring(a); rad = V((H.x, H.y-ky, 0)).normalized()
        G = H-rad*0.03; F = (V((0, 0, -1))*0.6-rad*0.4).normalized(); lat = V((rad.y, -rad.x, 0))*sg
        r.arm(s, G, F, V((sg*0.6, 0.6, 0)), lat, 0.9995); r.fingers(s, 0.9 if hold_ else 0.4)
    place_obj(ctx.KB, K+V((0, 0, -0.05))); return dict(bar=None, load=[(K, KB_KG)], fixed=fixed)

# ════ 소츠 프레스: 스쿼트 바닥 자세 그대로 목 뒤에서 머리 위로 ════
SO = dict(toe=20.0, ax=0.195, a0=3.0, a1=36.0, drop=0.025, ty=0.0, scap=(2.0, -0.5), load='balance')
def so_setup(ctx):
    C = dict(SO); C.update(ctx.vars); ctx.C = C; local_pts(ctx); ctx.BAR = barbell(ctx.col, ctx.mats); C['ref'] = ctx.L_SH
def sots(r, t, ctx):
    C = ctx.C; u = timing(t); P, R, th, fixed = sq_frame(r, 1.0, ctx, C); bar, load = sq_arms(r, ctx, 'balance', P, R, u, th, fixed)
    return dict(bar=bar, load=load, fixed=fixed)

# ════ 오버헤드 캐리: 덤벨을 머리 위로 편 채 걷기(제자리 걸음 — 발이 뒤로 미끄러지는 러닝머신식) ════
OC = dict(stride=0.28, ax=0.11)
def oc_setup(ctx):
    C = dict(OC); C.update(ctx.vars); ctx.C = C; ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
def carry(r, t, ctx):
    C = ctx.C; ph = 2*math.pi*t; st = C['stride']; ax = C['ax']; P0 = stand_P(r, ax); bob = 0.012*math.cos(2*ph); P = P0+V((0, 0, -0.045+bob)); R = Rx(1.0)@Rz(3.0*math.sin(ph))
    r.torso(P, R, neck=Rx(1.0), head=Rx(1.0), scap={s: (3.0, 0.0) for s, _ in SIDES})
    for s, sg in SIDES:
        q = ph if s == 'l' else ph+math.pi; c = math.cos(q); sn = math.sin(q)
        y = r.ANK_Y-(st/2)*c; lift = max(0.0, sn)**1.5*0.07
        pitch = 14.0*max(0.0, -c)*(1 if sn < 0 else 0)+(-10.0*sn if sn > 0 else 0.0)
        A = V((sg*ax, y, r.ANK_Z+lift)); r.leg_ik(s, A, V((sg*0.15, -1, 0)), Rz(sg*6)@V((0, -1, 0)), sg*6.0, pitch*0.0)
    S = r.chain_head('upperarm_l'); L_ = (r.L_U+r.L_F)*0.985; grip = 0.22; top = V((0, S.y+0.01, S.z+sqrt0(L_**2-(grip-S.x)**2)+r.GRIP_F*0.9)); load = []
    for s, sg in SIDES:
        G = top+V((sg*grip, 0, 0)); r.arm(s, G, V((0, 0.02, 1)), V((sg*0.8, 0.35, -0.4)), V((0, -1, 0)), 0.9995); r.fingers(s); hold(ctx, s, G, V((0, 1, 0))); load.append((G, DB_KG))
    return dict(bar=None, load=load, fixed=[])

SOLVERS = {'raise': (rz_setup, raise_), 'prone': (pr_setup, prone), 'side': (sd_setup, side), 'bent': (bo_setup, bent), 'face': (fp_setup, facepull), 'rotate': (rt_setup, rotate),
           'shrug': (sh_setup, shrug), 'jump_shrug': (js_setup, jump_shrug), 'circle': (hl_setup, circle), 'sots': (so_setup, sots), 'carry': (oc_setup, carry)}
