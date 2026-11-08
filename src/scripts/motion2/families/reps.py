# SPDX-License-Identifier: GPL-3.0-or-later
"""유형별 대표 동작 계산식(SPEC-040 Phase 2). solve(rig, t, ctx) → dict(bar, load, fixed). t 0=시작, 1=반대쪽 자세.
좌표: X 왼쪽+, -Y 앞, Z 위. Rx(+)=앞으로 숙임, Rx(-90)=누움(머리 +Y), Rx(+90)=엎드림(머리 -Y)."""
import math
from mathutils import Vector as V
from rig import Rx, Rz, lerp, sstep, sqrt0
from scene import PLATE_R, barbell, box, cyl, pbr, srgb
BODY_KG, BAR_KG, DB_KG = 80.0, 40.0, 12.0
SIDES = (('l', 1), ('r', -1))
def timing(t):
    return sstep(0.04, 0.96, t)   # 겹치면 최고 속도가 평균의 2.7배가 되어 Wan 이 못 따라간다
def rot_to(o, axis, up=V((0, 0, 1))):
    # [원본] o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = axis.normalized().to_track_quat('X', 'Z' if abs(axis.normalized().z) < 0.99 else 'Y')
    # [개선] cyl() 로 만든 원기둥(손잡이·원판)은 메시 축이 로컬 Z 라 X 를 맞추면 90° 틀어진다(팔 묶음에서 발견) — 표시가 있으면 Z 를 맞춘다. 덤벨처럼 빈 객체 뿌리는 그대로 X
    a = axis.normalized(); o.rotation_mode = 'QUATERNION'
    if o.get("zaxis"): o.rotation_quaternion = a.to_track_quat('Z', 'Y' if abs(a.y) < 0.99 else 'X')
    else: o.rotation_quaternion = a.to_track_quat('X', 'Z' if abs(a.z) < 0.99 else 'Y')
def dumbbell(ctx, name):
    import bpy
    M_ = ctx.mats; root = bpy.data.objects.new(name, None); ctx.col.objects.link(root); parts = [cyl(name+"_h", 0.014, 0.16, M_.STEEL)]
    for sg in (-1, 1): parts += [cyl(name+"_p", 0.075, 0.035, M_.RUBBER, (sg*0.095, 0, 0)), cyl(name+"_p", 0.060, 0.025, M_.RUBBER, (sg*0.125, 0, 0))]
    for p in parts: p.parent = root
    return root
def dbs(ctx): ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
def hold(ctx, s, G, axis): ctx.DB[s].location = G; rot_to(ctx.DB[s], axis)
def wire(ctx, name="cable"):
    o = cyl(name, 0.004, 1.0, ctx.mats.FRAME, axis='Z', verts=8); return o
def wire_to(o, a, b):
    d = b-a; o.location = (a+b)/2; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.normalized().to_track_quat('Z', 'Y'); o.scale = (1, 1, d.length)
def stand_P(r, ax, dy=0.0, margin=0.994):
    """곧게 선 골반 위치. 다리가 다 펴지기 직전까지만 올린다."""
    P0 = r.head0('pelvis'); y = P0.y+dy; off = r.HIP_OFF; R_ = (r.L_T+r.L_S)*margin
    z = r.ANK_Z+sqrt0(R_**2-(off.x-ax)**2-(y+off.y-r.ANK_Y)**2); return V((0, y, z-off.z))
def plant(r, ax, toe=8.0, knee=None):
    for s, sg in SIDES:
        r.leg_ik(s, V((sg*ax, r.ANK_Y, r.ANK_Z)), knee(sg) if knee else V((sg*0.22, -1, 0)), Rz(sg*toe)@V((0, -1, 0)), sg*toe)
    return ['foot_l', 'foot_r']
def grip_w(r, s, W, F, lat=None):
    """손목 위치 W 를 그대로 두는 쥔 지점."""
    F_, _L, n = r.grip_frame(s, F, lat); return W+F_*r.GRIP_F+n*r.GRIP_N
def jointed(r, s, E, W, F, lat=None, pole=None):
    """팔꿈치와 손목을 직접 정한다. 뼈 길이에 맞게 손목을 다시 놓는다. 곧은 팔에서는 pole 을 꼭 준다."""
    S = r.chain_head('upperarm_'+s); E = S+(E-S).normalized()*r.L_U; W = E+(W-E).normalized()*r.L_F*0.999; p = pole if pole is not None else E-(S+W)/2
    G = grip_w(r, s, W, F, lat); r.arm(s, G, F, p, lat, 0.9995); return G
def hang(r, s, sg, ex=0.02, fwd=-0.015, F=None, lat=None, reach=0.985, curl=1.0):
    """팔을 편하게 늘어뜨린다."""
    S = r.chain_head('upperarm_'+s); F = F or V((0, 0, -1)); W = S+V((sg*ex, fwd, -(r.L_U+r.L_F)*reach)); G = grip_w(r, s, W, F, lat)
    r.arm(s, G, F, V((sg*0.35, 0.8, 0)), lat, 0.9995); r.fingers(s, curl); return G
# ── 루마니안 데드리프트: 무릎은 살짝 굽힌 채 엉덩이를 뒤로 뺀다 ──
RD = dict(ax=0.135, toe=8.0, bar_dy=-0.145, grip=0.255, al0=1.5, al1=4.0, ph0=2.0, ph1=27.0, th0=1.0, th1=62.0, reach=0.992)
def rdl_setup(ctx): ctx.BAR = barbell(ctx.col, ctx.mats)
def rdl(r, t, ctx):
    u = timing(t); th = lerp(RD['th0'], RD['th1'], u); al = math.radians(lerp(RD['al0'], RD['al1'], u)); ph = math.radians(lerp(RD['ph0'], RD['ph1'], u)); A = V((RD['ax'], r.ANK_Y, r.ANK_Z)); K = A+V((0, -math.sin(al), math.cos(al)))*r.L_S
    Lt = sqrt0(r.L_T**2-(r.HIP_OFF.x-K.x)**2); H = V((0, K.y+Lt*math.sin(ph), K.z+Lt*math.cos(ph))); off = Rx(th)@r.HIP_OFF; P = H-V((0, off.y, off.z)); e, p = lerp(-1.0, 0.0, u), lerp(1.0, 3.5, u)
    r.torso(P, Rx(th), neck=Rx(th*0.62), head=Rx(th*0.45), scap={s: (e, p) for s, _ in SIDES})
    bar_y = r.ANK_Y+RD['bar_dy']; W_y = bar_y-r.GRIP_N; S = r.chain_head('upperarm_l'); dx = S.x-RD['grip']; z = S.z-sqrt0(((r.L_U+r.L_F)*RD['reach'])**2-dx**2-(S.y-W_y)**2)-r.GRIP_F; bar = V((0, bar_y, z)); ctx.BAR.location = bar
    for s, sg in SIDES:
        r.leg(s, V((sg*K.x, K.y, K.z)), V((sg*A.x, A.y, A.z)), Rz(sg*RD['toe'])@V((0, -1, 0)), sg*RD['toe'])
        r.arm(s, bar+V((sg*RD['grip'], 0, 0)), V((0, 0, -1)), V((sg*0.35, 0.9, 0)), None, 0.9995); r.fingers(s)
    return dict(bar=bar, load=[(bar, BAR_KG)], fixed=['foot_l', 'foot_r'])
# ── 오버헤드 프레스 ──
def ohp_setup(ctx): ctx.BAR = barbell(ctx.col, ctx.mats)
def ohp(r, t, ctx):
    u = timing(t); ax = 0.15; P = stand_P(r, ax, lerp(0.0, 0.0, u)); th = lerp(-3.0, 0.5, u); e = lerp(0.0, 3.5, u)
    r.torso(P, Rx(th), neck=Rx(lerp(-10, 1, u)), head=Rx(lerp(-12, 2, u)), scap={s: (e, lerp(1.0, 0.0, u)) for s, _ in SIDES}); fixed = plant(r, ax); S = r.chain_head('upperarm_l')
    grip = 0.26; top = S.z+sqrt0(((r.L_U+r.L_F)*0.992)**2-(grip-S.x)**2)+r.GRIP_F; y0, y1 = S.y-0.135, S.y-0.015; z0 = S.z+0.03; bar = V((0, lerp(y0, y1, u**1.5)-0.035*math.sin(math.pi*u), lerp(z0, top, u))); ctx.BAR.location = bar
    F = V((0, lerp(0.42, 0.0, u), 1)).normalized()
    for s, sg in SIDES:
        r.arm(s, bar+V((sg*grip, 0, 0)), F, V((sg*lerp(0.55, 0.8, u), lerp(-0.55, 0, u), -0.65)), None, 0.9995); r.fingers(s)
    return dict(bar=bar, load=[(bar, BAR_KG)], fixed=fixed)
# ── 덤벨 컬: 위팔은 몸 옆에 두고 팔꿈치만 ──
def curl_setup(ctx): dbs(ctx)
def curl(r, t, ctx):
    u = timing(t); ax = 0.15; P = stand_P(r, ax); r.torso(P, Rx(lerp(0.5, -1.5, u)), neck=Rx(0), head=Rx(1), scap={s: (lerp(-0.5, 0, u), lerp(0, 0.8, u)) for s, _ in SIDES}); fixed = plant(r, ax)
    a = math.radians(lerp(8, 138, u)); load = []
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s); E = S+V((sg*0.05, lerp(0.015, -0.005, u), -r.L_U)); d = V((sg*(0.03+0.16*(1-sstep(0.4, 1.0, u))), -math.sin(a), -math.cos(a))).normalized(); b_ = math.radians(90*sstep(0.0, 0.55, u)); lat = V((sg*math.sin(b_), -math.cos(b_), 0)); G = jointed(r, s, E, E+d*r.L_F, d, lat, V((sg*0.2, 1, 0))); r.fingers(s)
        hold(ctx, s, G, lat); load.append((G, DB_KG))
    return dict(bar=None, load=load, fixed=fixed)
# ── 레터럴 레이즈 ──
def lat_setup(ctx): dbs(ctx)
def lateral(r, t, ctx):
    u = timing(t); ax = 0.15; P = stand_P(r, ax); e = lerp(0.0, 1.5, u); r.torso(P, Rx(lerp(3, 4, u)), neck=Rx(1), head=Rx(1), scap={s: (e, 0.5) for s, _ in SIDES}); fixed = plant(r, ax)
    a = math.radians(lerp(10, 86, u)); load = []
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s); d = V((sg*math.sin(a), -0.10, -math.cos(a))).normalized(); E = S+d*r.L_U; d2 = V((sg*math.sin(a), -0.28, -math.cos(a))).normalized(); lat = V((0, -1, 0)); G = jointed(r, s, E, E+d2*r.L_F, d2, lat, V((sg*math.sin(a)*0.2, 1.0, -math.cos(a)*0.2))); r.fingers(s); hold(ctx, s, G, V((0, 1, 0))); load.append((G, DB_KG))
    return dict(bar=None, load=load, fixed=fixed)
# ── 케이블 푸시다운 ──
def pd_setup(ctx):
    M_ = ctx.mats; ctx.PUL = V((0, -0.42, 2.05)); box("post", (0.10, 0.10, 2.10), (0, -0.50, 1.05), M_.FRAME); box("arm", (0.10, 0.20, 0.06), (0, -0.44, 2.08), M_.FRAME); box("base", (0.55, 0.50, 0.04), (0, -0.50, 0.02), M_.FRAME); ctx.W = wire(ctx); ctx.H = cyl("handle", 0.014, 0.40, M_.STEEL)
def pushdown(r, t, ctx):
    u = timing(t); ax = 0.17; th = 9.0; P = stand_P(r, ax, 0.035); r.torso(P, Rx(th), neck=Rx(th*0.3), head=Rx(th*0.2), scap={s: (-1.0, 0.8) for s, _ in SIDES}); fixed = plant(r, ax)
    a = math.radians(lerp(102, 7, u)); Gs = []
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s); E = S+V((sg*0.005, 0.025, -r.L_U)); dx = (sg*0.19-E.x)/r.L_F; q = sqrt0(1-dx*dx); d = V((dx, -math.sin(a)*q, -math.cos(a)*q)); G = jointed(r, s, E, E+d*r.L_F, d, None, V((sg*0.25, 1, 0))); r.fingers(s); Gs.append(G)
    m = (Gs[0]+Gs[1])/2; ctx.H.location = m; wire_to(ctx.W, m, ctx.PUL)
    return dict(bar=None, load=[(m, 20.0)], fixed=fixed)
# ── 카프 레이즈: 앞꿈치 고정 ──
def calf_setup(ctx): pass
def calf(r, t, ctx):
    u = timing(t); pitch = lerp(0.0, 36.0, u); ax = 0.13; yaw = 6.0; As = {}
    for s, sg in SIDES:
        ball = r.head0('ball_'+s); ball = V((sg*abs(ball.x), ball.y, ball.z)); As[s] = r.ankle_from_ball(s, ball, sg*yaw, pitch)
    A = As['l']; P0 = r.head0('pelvis'); off = r.HIP_OFF; R_ = (r.L_T+r.L_S)*0.994; y = P0.y-0.012-0.105*sstep(0.0, 0.45, u)+ctx.vars.get('calf_dy', 0.0); z = A.z+sqrt0(R_**2-(off.x-A.x)**2-(y+off.y-A.y)**2); P = V((0, y, z-off.z))
    r.torso(P, Rx(1.0), neck=Rx(0), head=Rx(0)); ctx.calf_P, ctx.calf_R = P, Rx(1.0)
    for s, sg in SIDES:
        r.leg_ik(s, As[s], V((sg*0.2, -1, 0)), Rz(sg*yaw)@V((0, -1, 0)), sg*yaw, pitch, True); hang(r, s, sg, 0.03, -0.01, curl=0.35)
    return dict(bar=None, load=[], fixed=['ball_l', 'ball_r'])
# ── 불가리안 스플릿 스쿼트: 왼발 앞, 오른발 벤치 ──
BG = dict(front_y=-0.33, bench_y=0.45, bench_top=0.44)
def bg_setup(ctx):
    M_ = ctx.mats; y = ctx.rig.ANK_Y+BG['bench_y']; T = BG['bench_top']; dbs(ctx); box("pad", (0.30, 0.46, 0.07), (0, y+0.14, T-0.035), M_.PAD, 0.024); box("leg", (0.08, 0.08, T-0.07), (0, y+0.14, (T-0.07)/2), M_.FRAME); box("ft", (0.42, 0.09, 0.04), (0, y+0.14, 0.02), M_.FRAME)
def bulgarian(r, t, ctx):
    u = timing(t); Af = V((0.11, r.ANK_Y+BG['front_y'], r.ANK_Z)); Ar = V((-0.11, r.ANK_Y+BG['bench_y']-0.02, BG['bench_top']+0.075)); th = lerp(7, 15, u)
    H_top = Af+V((0.0, 0.205, 0)); y = lerp(r.ANK_Y-0.06, r.ANK_Y-0.135, u); off = Rx(th)@r.HIP_OFF; R_ = (r.L_T+r.L_S)*0.985; zt = Af.z+sqrt0(R_**2-(off.x-Af.x)**2-(y+off.y-Af.y)**2); z = lerp(zt, Af.z+r.L_S+0.045, u)
    P = V((0, y-off.y, z-off.z)); r.torso(P, Rx(th), neck=Rx(th*0.6), head=Rx(th*0.4)); ctx.bg_P, ctx.bg_R = P, Rx(th)
    r.leg_ik('l', Af, V((0.15, -1, 0)), Rz(6)@V((0, -1, 0)), 6.0); r.leg_ik('r', Ar, V((-0.05, -1, -0.15)), V((0, 0, -1)), 0.0, 145.0)
    load = []
    for s, sg in SIDES:
        lat = V((0, -1, 0)); G = hang(r, s, sg, 0.105, 0.0, lat=lat, reach=0.965); hold(ctx, s, G, V((0, 1, 0))); load.append((G, DB_KG))
    return dict(bar=None, load=load, fixed=['foot_l', 'foot_r'])
# ── 벤치 공용 ──
def lie_torso(r, P, scap=(-1.0, -1.5)):
    r.torso(P, Rx(-84), Rx(-87), Rx(-91), Rx(-95), Rx(-92), Rx(-86), scap={s: scap for s, _ in SIDES})
def lie_setup(ctx, T=0.46):
    import bpy
    r = ctx.rig; r.reset(); P0 = V((0, 0, 1.0)); lie_torso(r, P0); r.apply(); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); ob = ctx.h.evaluated_get(dg); me = ob.to_mesh(); pz = []
    for i, w in enumerate(ctx.weights):
        if w.get('spine_03', 0)+w.get('spine_02', 0)+w.get('pelvis', 0) > 0.6 and abs(ctx.rest_v[i].x) < 0.15: pz.append(me.vertices[i].co.z)
    ctx.P = V((0, 0, 1.0-(min(pz)-(T-0.012)))); ob.to_mesh_clear(); y = ctx.P.y; M_ = ctx.mats
    box("pad", (0.30, 1.22, 0.07), (0, y+0.42, T-0.035), M_.PAD, 0.024); box("frame", (0.08, 1.05, 0.05), (0, y+0.42, T-0.095), M_.FRAME)
    for y_ in (y-0.02, y+0.86): box("post", (0.07, 0.07, T-0.12), (0, y_, (T-0.12)/2+0.02), M_.FRAME); box("ft", (0.56, 0.09, 0.04), (0, y_, 0.02), M_.FRAME)
def lie_legs(r, ctx):
    for s, sg in SIDES: r.leg_ik(s, V((sg*0.27, ctx.P.y-0.40, r.ANK_Z)), V((sg*0.22, -0.3, 1)), V((0, -1, 0)), sg*8)
# ── 덤벨 플라이 ──
def fly_setup(ctx): lie_setup(ctx); dbs(ctx)
def fly(r, t, ctx):
    u = timing(t); lie_torso(r, ctx.P, (lerp(-1.0, -1.0, u), lerp(1.0, -2.5, u))); a = math.radians(lerp(0, 82, u)); load = []
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s); y_ = 0.03; d = V((sg*math.sin(a), y_, math.cos(a))).normalized(); E = S+d*r.L_U; b = a-math.radians(lerp(17, 24, u)); d2 = V((sg*math.sin(b), y_, math.cos(b))).normalized(); lat = V((0, 1, 0))
        G = jointed(r, s, E, E+d2*r.L_F, d2, lat, V((sg*math.cos(a), 0.15, -math.sin(a)))); r.fingers(s); hold(ctx, s, G, V((0, 1, 0))); load.append((G, DB_KG))
    lie_legs(r, ctx); return dict(bar=None, load=load, fixed=['foot_l', 'foot_r', 'pelvis', 'spine_03'])
# ── 힙 쓰러스트: 등 위쪽을 벤치 끝에 대고 엉덩이를 든다 ──
HT = dict(top=0.42, th0=-38.0, th1=-92.0, ax=0.17, bar_up=0.172, bar_dy=-0.03, grip=0.30)
def ht_setup(ctx):
    M_ = ctx.mats; r = ctx.rig; ctx.BAR = barbell(ctx.col, M_); ctx.PIV = V((0, 0.0, HT['top']+0.085)); box("pad", (0.70, 0.30, HT['top']-0.02), (0, 0.17, (HT['top']-0.02)/2+0.02), M_.PAD, 0.024)
    s3 = r.head0('spine_03'); ctx.s3 = s3; R1 = Rx(HT['th1']); P1 = ctx.PIV-R1@(s3-r.head0('pelvis')); off = R1@r.HIP_OFF; ctx.Ay = P1.y+off.y-r.L_T*0.97
def hip_thrust(r, t, ctx):
    u = timing(1-t); th = lerp(HT['th1'], HT['th0'], 1-u); R_ = Rx(th); P = ctx.PIV-R_@(ctx.s3-r.head0('pelvis')); head = Rx(lerp(th+36, th+14, 1-u)+0)
    r.torso(P, R_, neck=Rx(th+22), head=head, scap={s: (0.5, 1.0) for s, _ in SIDES})
    fixed = []
    for s, sg in SIDES: r.leg_ik(s, V((sg*HT['ax'], ctx.Ay, r.ANK_Z)), V((sg*0.20, -0.45, 1)), Rz(sg*8)@V((0, -1, 0)), sg*8); fixed.append('foot_'+s)
    Hc = (r.chain_head('thigh_l')+r.chain_head('thigh_r'))/2; n = R_@V((0, -1, 0)); bar = Hc+n*(HT['bar_up']+0.04*(1-u))+R_@V((0, 0, HT['bar_dy'])); bar.x = 0; bar.z = max(bar.z, PLATE_R-0.012); ctx.BAR.location = bar
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s); G = bar+V((sg*HT['grip'], 0, 0)); F = (G-S).normalized(); r.arm(s, G, F, V((sg*0.8, 0, 0))+R_@V((0, 0.7, 0.1)), None, 0.9995); r.fingers(s)   # 팔꿈치는 바깥·등 쪽. 천장 쪽이면 역방향으로 보인다(id=1018)
    return dict(bar=bar, load=[(bar, BAR_KG)], fixed=fixed)
# ── 푸시업: 손과 앞꿈치 고정, 몸은 한 직선 ──
PU = dict(ax=0.12, hand_x=0.28, e_bot=0.5, chest=0.075, pitch=55.0, ball_up=0.016)
def pu_pose(r, e, ctx):
    A = ctx.A_l; d = V((0, -math.cos(e), math.sin(e))); L = (r.L_T+r.L_S)*0.997; Rt = Rx(90-math.degrees(e)); off = Rt@r.HIP_OFF; hx = off.x-A.x; Lh = sqrt0(L**2-hx**2); H = V((A.x+hx, A.y+d.y*Lh, A.z+d.z*Lh)); return H-off, Rt
def pu_setup(ctx):
    r = ctx.rig; yaw = 4.0; ball = V((PU['ax'], 0.0, r.head0('ball_l').z+PU['ball_up'])); ctx.ball = ball; ctx.A_l = r.ankle_from_ball('l', ball, yaw, PU['pitch']); ctx.yaw = yaw; W_z = 0.036+r.GRIP_N; ctx.Wz = W_z; S0 = r.shoulder_local('l')-r.head0('pelvis'); ctx.S0 = S0
    def sh(e):
        P, Rt = pu_pose(r, e, ctx); return P+Rt@S0
    lo, hi = 0.05, 0.75; top = (r.L_U+r.L_F)*1.008
    for _ in range(40):
        m = (lo+hi)/2
        if sh(m).z-W_z < top: lo = m
        else: hi = m
    ctx.e_top = (lo+hi)/2; ctx.Wy = sh(ctx.e_top).y-0.01
    lo2, hi2 = 0.02, ctx.e_top; want = W_z+0.25
    for _ in range(40):
        m = (lo2+hi2)/2
        if sh(m).z < want: lo2 = m
        else: hi2 = m
    ctx.e_bot = (lo2+hi2)/2
def push_up(r, t, ctx):
    u = timing(t); e = lerp(ctx.e_top, ctx.e_bot, u); P, Rt = pu_pose(r, e, ctx); deg = 90-math.degrees(e); r.torso(P, Rt, neck=Rx(deg-8), head=Rx(deg-14), scap={s: (0.0, lerp(1.5, -1.5, u)) for s, _ in SIDES}); fixed = []
    for s, sg in SIDES:
        ball = V((sg*PU['ax'], 0.0, ctx.ball.z)); A = r.ankle_from_ball(s, ball, sg*ctx.yaw, PU['pitch']); r.leg_ik(s, A, V((sg*0.08, -0.2, -1)), Rz(sg*ctx.yaw)@V((0, -1, 0)), sg*ctx.yaw, PU['pitch'], True); fixed.append('ball_'+s)
        F = V((sg*0.20, -1, 0)).normalized(); W = V((sg*PU['hand_x'], ctx.Wy, ctx.Wz)); G = grip_w(r, s, W, F); r.arm(s, G, F, V((sg*0.6, 0.8, 0.3)), None, 0.9995); r.fingers(s, 0.0)
    return dict(bar=None, load=[], fixed=fixed)
# ── 풀업 ──
PL = dict(bar_z=2.42, grip=0.34, th0=1.0, th1=-10.0)
def pl_setup(ctx):
    M_ = ctx.mats; z = PL['bar_z']; ctx.BARP = V((0, 0, z)); cyl("shaft", 0.014, 1.5, M_.STEEL, (0, 0, z)); [box("up", (0.07, 0.07, z+0.04), (sg*0.72, 0.02, (z+0.04)/2), M_.FRAME) for sg in (-1, 1)]; [box("ft", (0.09, 0.9, 0.04), (sg*0.72, 0.02, 0.02), M_.FRAME) for sg in (-1, 1)]
def pull_up(r, t, ctx):
    u = timing(t); th = lerp(PL['th0'], PL['th1'], u); e = lerp(3.5, -2.0, u); p = lerp(1.0, -2.5, u); G = {s: ctx.BARP+V((sg*PL['grip'], 0, 0)) for s, sg in SIDES}; F = V((0, lerp(0.0, -0.35, u), 1)).normalized(); Wl = G['l']-r.grip_frame('l', F)[0]*r.GRIP_F-r.grip_frame('l', F)[2]*r.GRIP_N
    S0 = r.shoulder_local('l', e, p); Rt = Rx(th); dS = Rt@(S0-r.head0('pelvis')); yS = lerp(Wl.y-0.02, Wl.y+0.10, u)
    hang_z = Wl.z-sqrt0(((r.L_U+r.L_F)*0.985)**2-(Wl.x-S0.x)**2-(yS-Wl.y)**2); top_z = Wl.z-0.175; zS = lerp(hang_z, top_z, u); P = V((0, yS-dS.y, zS-dS.z))
    r.torso(P, Rt, neck=Rx(lerp(th, th-14, u)), head=Rx(lerp(th+3, th-20, u)), scap={s: (e, p) for s, _ in SIDES})
    for s, sg in SIDES:
        H = r.chain_head('thigh_'+s); a1 = math.radians(lerp(5, 18, u)); a2 = math.radians(lerp(10, 32, u)); K = H+V((sg*0.012, -math.sin(a1), -math.cos(a1)))*r.L_T; A = K+V((0, math.sin(a2), -math.cos(a2)))*r.L_S
        r.leg(s, K, A, V((0, -math.cos(a2)*0.6, -0.8)).normalized(), 0.0, math.degrees(a2)+18.0); r.arm(s, G[s], F, V((sg*lerp(0.8, 0.9, u), lerp(0.10, 0.45, u), -0.7)), None, 0.9995); r.fingers(s)
    return dict(bar=ctx.BARP.copy(), load=[], fixed=[])
# ── 랫풀다운 ──
LP = dict(seat=0.50, grip=0.40, th0=4.0, th1=17.0)
def lp_setup(ctx):
    M_ = ctx.mats; r = ctx.rig; hip = r.ANK_Z+r.L_S+0.015; off = r.HIP_OFF; ctx.P = V((0, 0.0, hip-off.z)); T = hip-0.105; ctx.T = T; box("seat", (0.40, 0.42, 0.07), (0, -0.05, T-0.035), M_.PAD, 0.024); box("stem", (0.09, 0.09, T-0.07), (0, -0.05, (T-0.07)/2), M_.FRAME); box("rail", (0.09, 0.75, 0.05), (0, -0.40, 0.03), M_.FRAME)
    box("kpad", (0.42, 0.10, 0.09), (0, -0.40, hip+0.17), M_.PAD, 0.03); box("kstem", (0.07, 0.07, hip+0.13), (0, -0.70, (hip+0.13)/2), M_.FRAME); box("kx", (0.07, 0.34, 0.05), (0, -0.55, hip+0.17), M_.FRAME); box("tower", (0.10, 0.10, 2.30), (0, -0.70, 1.15), M_.FRAME); box("top", (0.10, 0.60, 0.06), (0, -0.42, 2.30), M_.FRAME)
    ctx.BAR = cyl("shaft", 0.014, 1.15, M_.STEEL); ctx.PUL = V((0, -0.18, 2.28)); ctx.W = wire(ctx)
def lat_pulldown(r, t, ctx):
    u = timing(t); th = lerp(LP['th0'], LP['th1'], u); e = lerp(3.0, -2.0, u); p = lerp(1.5, -2.5, u); r.torso(ctx.P, Rx(-th), neck=Rx(-th*0.7), head=Rx(-th*0.4-3), scap={s: (e, p) for s, _ in SIDES})
    for s, sg in SIDES:
        H = r.chain_head('thigh_'+s); r.leg_ik(s, V((sg*0.20, H.y-r.L_T*0.97, r.ANK_Z)), V((sg*0.12, -0.5, 1)), Rz(sg*8)@V((0, -1, 0)), sg*8)
    S = r.chain_head('upperarm_l'); G_x = LP['grip']; top_z = S.z+sqrt0(((r.L_U+r.L_F)*0.985)**2-(G_x-S.x)**2-0.12**2)+r.GRIP_F; bar = V((0, lerp(S.y-0.12, S.y-0.20, u), lerp(top_z, S.z-0.03, u))); ctx.BAR.location = bar; wire_to(ctx.W, bar, ctx.PUL); F = V((0, lerp(-0.12, 0.25, u), 1)).normalized()
    for s, sg in SIDES: r.arm(s, bar+V((sg*G_x, 0, 0)), F, V((sg*0.85, lerp(0, 0.5, u), -0.6)), None, 0.9995); r.fingers(s)
    return dict(bar=bar, load=[], fixed=['foot_l', 'foot_r', 'pelvis'])
# ── 레그 프레스: 45도 썰매, 등과 골반 고정 ──
LG = dict(ang=45.0, th=-68.0, ax=0.13, d0=0.835, d1=0.51, off=0.10, hip_z=0.50)
def lg_setup(ctx):
    M_ = ctx.mats; r = ctx.rig; th = LG['th']; ctx.Rt = Rx(th); off = ctx.Rt@r.HIP_OFF; ctx.P = V((0, 0.42, LG['hip_z']-off.z)); a = math.radians(LG['ang']); ctx.d = V((0, -math.cos(a), math.sin(a))); ctx.u_ = V((0, math.sin(a), math.cos(a)))
    n = ctx.Rt@V((0, 1, 0)); up_ = ctx.Rt@V((0, 0, 1)); c = ctx.P+n*0.155+up_*0.30; b = box("back", (0.44, 0.08, 0.72), tuple(c), M_.PAD, 0.024); b.rotation_euler = (math.radians(th), 0, 0)
    s = box("seat", (0.44, 0.44, 0.08), (0, ctx.P.y+0.13, LG['hip_z']-0.165), M_.PAD, 0.024); box("seatb", (0.20, 0.46, LG['hip_z']-0.205), (0, ctx.P.y+0.16, (LG['hip_z']-0.205)/2), M_.FRAME)
    Hc = ctx.P+off; Hc.x = 0; ctx.Hc = Hc; mid = Hc+ctx.d*0.62-ctx.u_*0.14; o = box("rail", (0.34, 1.75, 0.06), tuple(mid), M_.FRAME); o.rotation_euler = (-a, 0, 0); box("ped", (0.16, 0.16, max(0.2, mid.z)), (0, mid.y, max(0.2, mid.z)/2), M_.FRAME)
    [box("hdl", (0.10, 0.03, 0.03), (sg*0.36, ctx.P.y+0.02, LG['hip_z']-0.02), M_.STEEL) for sg in (-1, 1)]; ctx.PLT = box("plate", (0.70, 0.05, 0.56), (0, 0, 0), M_.FRAME); ctx.PLT.rotation_euler = (-a, 0, 0)
def leg_press(r, t, ctx):
    u = timing(t); dist = lerp(LG['d0'], LG['d1'], u); r.torso(ctx.P, ctx.Rt, Rx(LG['th']-2), Rx(LG['th']-3), Rx(LG['th']-3), Rx(LG['th']+8), Rx(LG['th']+16)); a = LG['ang']; pitch = -(90+a)
    for s, sg in SIDES:
        Hp = r.chain_head('thigh_'+s); A = V((sg*LG['ax'], 0, 0))+V((0, ctx.Hc.y, ctx.Hc.z))+ctx.d*dist+ctx.u_*LG['off']; r.leg_ik(s, A, V((sg*0.22, 0, 0))+ctx.u_, ctx.u_, sg*0, pitch)
        G = V((sg*0.36, ctx.P.y+0.02, LG['hip_z']-0.02)); F = ctx.d*0.7+V((0, 0, -0.5)); r.arm(s, G, F, V((sg*0.9, 0.3, 0.2)), None, 0.9995); r.fingers(s)
    ctx.PLT.location = V((0, 0, 0))+V((0, ctx.Hc.y, ctx.Hc.z))+ctx.d*(dist+0.10)+ctx.u_*(LG['off']-0.10)
    return dict(bar=None, load=[], fixed=['pelvis', 'spine_03'])
# ── 원암 덤벨 로우: 왼무릎·왼손은 벤치, 오른발은 바닥, 오른팔을 당긴다 ──
OR = dict(top=0.42, th=82.0, knee_y=0.0)
def or_setup(ctx):
    M_ = ctx.mats; T = OR['top']; box("pad", (0.34, 1.08, 0.07), (0.15, -0.09, T-0.035), M_.PAD, 0.024); box("frame", (0.08, 0.90, 0.05), (0.15, -0.09, T-0.095), M_.FRAME); [box("post", (0.07, 0.07, T-0.12), (0.15, y_, (T-0.12)/2+0.02), M_.FRAME) for y_ in (-0.48, 0.30)]; [box("ft", (0.50, 0.09, 0.04), (0.15, y_, 0.02), M_.FRAME) for y_ in (-0.48, 0.30)]; ctx.DB = {'r': dumbbell(ctx, "db_r")}
def one_arm_row(r, t, ctx):
    u = timing(t); T = OR['top']; th = OR['th']; Kz = T+0.065; Rt = Rx(th); off = Rt@r.HIP_OFF; K = V((0.16, 0.02, Kz)); Hz = Kz+sqrt0(r.L_T**2-(off.x-K.x)**2-0.12**2); P = V((0, K.y+0.12-off.y, Hz-off.z))
    r.torso(P, Rt, Rx(th), Rx(th-1), Rx(th-2), Rx(th-12), Rx(th-22), scap={'l': (0.0, 0.5), 'r': (lerp(-2.0, 0.0, u), lerp(4.0, -3.0, u))})
    r.leg('l', K, K+V((0.0, r.L_S, 0.0)), V((0, 0, -1)), 0.0, 110.0); r.leg_ik('r', V((-0.20, K.y+0.20, r.ANK_Z)), V((-0.25, -1, 0.05)), Rz(-10)@V((0, -1, 0)), -10.0)
    Sl = r.chain_head('upperarm_l'); F = V((0.1, -1, 0)).normalized(); Wl = V((0.19, Sl.y-0.02, T+r.GRIP_N+0.005)); r.arm('l', grip_w(r, 'l', Wl, F), F, V((0.6, 0.6, 0.1)), None, 0.9995); r.fingers('l', 0.0)
    Sr = r.chain_head('upperarm_r'); a = math.radians(lerp(3, 82, u)); d = V((-0.14-0.06*u, math.sin(a), -math.cos(a))).normalized(); fa = V((-0.22-0.08*u, lerp(math.sin(a), 0.06, sstep(0.0, 0.625, u)), -1)).normalized(); E = Sr+d*r.L_U; G = jointed(r, 'r', E, E+fa*r.L_F, V((0, 0.0, -1)), V((0, -1, 0)), V((-0.2, 1, 0))); r.fingers('r'); hold(ctx, 'r', G, V((0, 1, 0)))
    return dict(bar=None, load=[(G, DB_KG)], fixed=['foot_r', 'calf_l'])
# ── 크런치: 골반·허리는 바닥, 등 위쪽만 말아 올린다 ──
def cr_setup(ctx): ctx.Pz = 0.095
def crunch(r, t, ctx):
    u = timing(t); P = V((0, 0.0, ctx.Pz)); s1 = lerp(-88, -82, u); s2 = lerp(-91, -75, u); s3 = lerp(-93, -60, u); n = lerp(-88, -50, u); h = lerp(-84, -46, u); r.torso(P, Rx(-82), Rx(s1), Rx(s2), Rx(s3), Rx(n), Rx(h), scap={s: (0.0, 1.0) for s, _ in SIDES})
    for s, sg in SIDES:
        H = r.chain_head('thigh_'+s); r.leg_ik(s, V((sg*0.15, H.y-0.52, r.ANK_Z)), V((sg*0.15, -0.3, 1)), Rz(sg*6)@V((0, -1, 0)), sg*6)
        Hd = r.chain_head('head'); R_h = Rx(h); G = Hd+R_h@V((sg*0.10, 0.06, 0.09)); F = R_h@V((-sg*0.75, 0.55, 0.1)); r.arm(s, G, F, V((sg*1.0, -0.1, 0.15)), R_h@V((0, 0, -1)), 0.9995); r.fingers(s, 0.25)
    return dict(bar=None, load=[], fixed=['foot_l', 'foot_r', 'pelvis'])
# ── 레그 익스텐션 등 2관절 머신 공용은 다음 묶음에서 ──
# ── 파워 클린: 팔을 편 당기기와 받는 자세를 섞어 끊기지 않게 한다 ──
# (시각, 바 y(발목 기준), 바 z, 몸통 기울기, 뒤꿈치 각). z 는 'F' 바닥, 'C' 받기, 'S' 일어섬
CL = [(0.00, -0.145, 'F', 55, 0), (0.05, -0.145, 'F', 55, 0), (0.17, -0.145, 0.58, 38, 0), (0.26, -0.135, 0.84, 14, 0), (0.34, -0.15, 1.12, -2, 20),
      (0.50, -0.095, 'C', 8, 0), (0.58, -0.095, 'S', 2, 0), (0.66, -0.095, 'S', 2, 0), (0.82, -0.135, 0.83, 4, 0), (0.95, -0.145, 'F', 55, 0), (1.00, -0.145, 'F', 55, 0)]
def cl_setup(ctx):
    r = ctx.rig; ctx.BAR = barbell(ctx.col, ctx.mats); P = stand_P(r, 0.14); ds = r.shoulder_local('l')-r.head0('pelvis'); zs = P.z+ds.z; ctx.Z = {'F': PLATE_R-0.012, 'C': zs-0.11, 'S': zs+0.03}
def clean(r, t, ctx):
    ax, grip, yaw = 0.14, 0.27, 8.0
    z_ = lambda v: ctx.Z[v] if isinstance(v, str) else v
    def lin(q, c):
        q = q % 1.0
        for a, b in zip(CL, CL[1:]):
            if q <= b[0]: f_ = (q-a[0])/(b[0]-a[0]); return lerp(c(a), c(b), f_)
        return c(CL[-1])
    def sm(c): return sum(lin(t+(i-3)*0.016, c) for i in range(7))/7   # 키마다 멈추지 않게 평활화
    by = r.ANK_Y+sm(lambda k: k[1]); bz = sm(lambda k: z_(k[2])); th = sm(lambda k: k[3]); heel = max(0.0, sm(lambda k: k[4]))
    w = sstep(0.20, 0.54, t)*(1-sstep(0.64, 0.90, t)); sh = 3.5*sstep(0.20, 0.32, t)*(1-sstep(0.36, 0.48, t)); pp = 1.5*(1-sstep(0.06, 0.24, t))+1.5*sstep(0.86, 1.0, t)
    Rt = Rx(th); ball = V((ax, r.head0('ball_l').y, r.head0('ball_l').z)); A = r.ankle_from_ball('l', ball, yaw, heel); off = Rt@r.HIP_OFF; S0 = r.shoulder_local('l', sh, pp); ds = Rt@(S0-r.head0('pelvis'))
    # 팔을 편 자세의 골반
    W_ = V((grip, by-r.GRIP_N, bz+r.GRIP_F)); Sy = by+0.03*min(1.0, max(0.0, th)/40); L_ = (r.L_U+r.L_F)*0.985; Sz = W_.z+sqrt0(L_**2-(S0.x-grip)**2-(Sy-W_.y)**2); P1 = V((0, Sy-ds.y, Sz-ds.z)); d_ = P1+off-A; lim = (r.L_T+r.L_S)*0.992
    if d_.length > lim: P1 = A+d_.normalized()*lim-off; P1.x = 0
    # 받는 자세의 골반: 바는 어깨 앞
    P2 = V((0, by+0.11-ds.y, lerp(bz, ctx.Z['S'], sstep(0.54, 0.60, t))-0.03-ds.z)); P = P1.lerp(P2, w); d_ = P+off-A
    if d_.length > lim: P = A+d_.normalized()*lim-off; P.x = 0
    r.torso(P, Rt, neck=Rx(th*0.45), head=Rx(th*0.25), scap={s: (sh, pp) for s, _ in SIDES}); bar = V((0, by, bz)); ctx.BAR.location = bar; ph_ = math.radians(225*w); F = V((0, -math.sin(ph_), -math.cos(ph_)))   # 손가락 마디는 앞→위→뒤로 돈다. 뒤로 돌리면 손목이 180도 꼬인다
    for s, sg in SIDES:
        As = r.ankle_from_ball(s, V((sg*ax, ball.y, ball.z)), sg*yaw, heel); r.leg_ik(s, As, V((sg*0.25, -1, 0)), Rz(sg*yaw)@V((0, -1, 0)), sg*yaw, heel, True)
        r.arm(s, bar+V((sg*grip, 0, 0)), F, V((sg*0.8, 1-1.1*w, -0.9*w)), None, 0.9995); r.fingers(s)
    return dict(bar=bar, load=[(bar, BAR_KG)], fixed=['ball_l', 'ball_r'])
SOLVERS = {'rdl': (rdl_setup, rdl), 'ohp': (ohp_setup, ohp), 'curl': (curl_setup, curl), 'lateral': (lat_setup, lateral), 'pushdown': (pd_setup, pushdown), 'calf': (calf_setup, calf), 'bulgarian': (bg_setup, bulgarian), 'fly': (fly_setup, fly), 'hip_thrust': (ht_setup, hip_thrust), 'push_up': (pu_setup, push_up), 'pull_up': (pl_setup, pull_up), 'lat_pulldown': (lp_setup, lat_pulldown), 'leg_press': (lg_setup, leg_press), 'one_arm_row': (or_setup, one_arm_row), 'crunch': (cr_setup, crunch), 'clean': (cl_setup, clean)}
