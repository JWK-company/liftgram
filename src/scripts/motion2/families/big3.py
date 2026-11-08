# SPDX-License-Identifier: GPL-3.0-or-later
"""3대운동 계산식. solve(rig, t, ctx) → dict(bar=위치, ...). t 는 0(시작 자세)~1(반대쪽 자세)이고 재생은 왕복이다."""
import math
from mathutils import Vector as V
from rig import Rx, Rz, Rot, lerp, sstep, sqrt0
from scene import PLATE_R, barbell, box
def timing(t):
    u = sstep(0.08, 0.92, t); return u*u*(3-2*u)
# 무게중심 계산용: 바의 질량(kg)과 몸 질량
BAR_KG, BODY_KG = 60.0, 80.0
# ── 스쿼트(하이바) ──
SQ = dict(toe=20.0, ax=0.195, top_h=0.921, top_alpha=3.0, bot_alpha=33.0, bot_drop=0.025, top_in=0.040, bar_dy=-0.065, grip=0.40)
def squat_setup(ctx):
    SQ.update(ctx.vars)
    r = ctx.rig; back = [p for p in ctx.rest_v if abs(p.x) < 0.04 and 1.40 < p.z < 1.46]
    ctx.BAR_LOCAL = V((0, max(p.y for p in back)+0.015, 1.438)); ctx.BAR = barbell(ctx.col, ctx.mats)
    ctx.bar_y = r.ANK_Y+SQ['bar_dy']
def squat(r, t, ctx):
    u = timing(t); toe_l = Rz(SQ['toe'])@V((0, -1, 0)); A_l = V((SQ['ax'], r.ANK_Y, r.ANK_Z))
    ar = math.radians(lerp(SQ['top_alpha'], SQ['bot_alpha'], u**0.75)); inw = SQ['top_in']*(1-u)
    K_l = A_l+(V((0, 0, math.cos(ar)))*r.L_S+toe_l*math.sin(ar)*r.L_S+V((-inw, 0, 0))).normalized()*r.L_S
    Kb = r.ANK_Z+r.L_S*math.cos(math.radians(SQ['bot_alpha']))-SQ['bot_drop']
    Hz = lerp(SQ['top_h'], Kb, u); p0 = r.head0('pelvis')
    def place(th):
        off = Rx(th)@r.HIP_OFF; dx = off.x-K_l.x; dz = Hz-K_l.z
        Hy = K_l.y+sqrt0(r.L_T**2-dx**2-dz**2); P = V((0, Hy-off.y, Hz-off.z))
        return P, (P+Rx(th)@(ctx.BAR_LOCAL-p0)).y-ctx.bar_y
    lo, hi = -5.0, 75.0
    for _ in range(40):
        m = (lo+hi)/2
        if place(m)[1] > 0: lo = m
        else: hi = m
    th = (lo+hi)/2; P, _e = place(th); R = Rx(th)
    scap = {s: (lerp(0.5, 0.5, u), -1.0) for s in 'lr'}
    r.torso(P, R, neck=Rx(th*0.62), head=Rx(th*0.40), scap=scap)
    barp = P+R@(ctx.BAR_LOCAL-p0); ctx.BAR.location = barp
    for s, sg in (('l', 1), ('r', -1)):
        A = V((sg*SQ['ax'], r.ANK_Y, r.ANK_Z)); K = V((sg*K_l.x, K_l.y, K_l.z))
        r.leg(s, K, A, Rz(sg*SQ['toe'])@V((0, -1, 0)), sg*SQ['toe'])
        r.arm(s, barp+V((sg*SQ['grip'], 0, 0)), R@V((sg*0.30, 0.12, 1)), R@V((sg*0.75, 0.55, -0.75))); r.fingers(s)
    return dict(bar=barp, load=[(barp, BAR_KG)], lean=th, fixed=['foot_l', 'foot_r'], grips=True)
# ── 데드리프트(컨벤셔널) ──
DL = dict(ax=0.135, toe=10.0, bar_dy=-0.090, grip=0.255, reach=0.997, a0=18.0, a1=1.5, dy0=-0.010, dy1=0.085, top_extra=0.020)
def dl_scap(b): return lerp(-2.5, 0.0, b), lerp(2.5, 0.0, b)   # 바닥에서 어깨가 처지고 앞으로 간다(거상·전인 cm)
def dl_top(r):
    S = r.shoulder_local('l')+V((0, 0, 0.915-r.head0('thigh_l').z))
    return S.z-(r.L_U+r.L_F)*DL['reach']-r.GRIP_F+DL['top_extra']
def deadlift_setup(ctx):
    DL.update(ctx.vars); r = ctx.rig; ctx.BAR = barbell(ctx.col, ctx.mats); ctx.bar_y = r.ANK_Y+DL['bar_dy']; ctx.ZT = dl_top(r); ctx.ZB = PLATE_R-0.012
def deadlift(r, t, ctx):
    u = timing(t); zb = lerp(ctx.ZT, ctx.ZB, u); b = (zb-ctx.ZB)/(ctx.ZT-ctx.ZB)
    bk = (r.ANK_Z+r.L_S-ctx.ZB)/(ctx.ZT-ctx.ZB)
    alpha = lerp(DL['a0'], DL['a1'], sstep(0, bk, b))*(1-sstep(bk, 1, b)); S_dy = lerp(DL['dy0'], DL['dy1'], sstep(0.1, 1.0, b))
    ar = math.radians(alpha); toe_l = Rz(DL['toe'])@V((0, -1, 0)); A_l = V((DL['ax'], r.ANK_Y, r.ANK_Z))
    K_l = A_l+V((0, 0, math.cos(ar)))*r.L_S+toe_l*math.sin(ar)*r.L_S
    W = V((DL['grip'], ctx.bar_y, zb))+V((0, 0, r.GRIP_F))-V((0, 1, 0))*r.GRIP_N
    e, p = dl_scap(b); S0 = r.shoulder_local('l', e, p); Lr = (r.L_U+r.L_F)*DL['reach']
    Sy = ctx.bar_y+S_dy; dx = S0.x-W.x; Sz = W.z+sqrt0(Lr**2-dx**2-(Sy-W.y)**2)
    tr = S0-r.head0('thigh_l'); trv = (tr.y, tr.z); Ltr = math.hypot(*trv)
    Lt = sqrt0(r.L_T**2-(r.HIP_OFF.x-K_l.x)**2); k = (K_l.y, K_l.z); sp = (Sy, Sz); dv = (sp[0]-k[0], sp[1]-k[1]); D = math.hypot(*dv)
    a = (Lt**2-Ltr**2+D**2)/(2*D); hh = sqrt0(Lt**2-a**2); ev = (dv[0]/D, dv[1]/D); n = (ev[1], -ev[0])
    if n[0] < 0: n = (-n[0], -n[1])
    H = (k[0]+ev[0]*a+n[0]*hh, k[1]+ev[1]*a+n[1]*hh); v = (sp[0]-H[0], sp[1]-H[1])
    th = -(math.degrees(math.atan2(v[0], v[1]))-math.degrees(math.atan2(trv[0], trv[1])))
    off = Rx(th)@r.HIP_OFF; P = V((0, H[0]-off.y, H[1]-off.z)); R = Rx(th)
    r.torso(P, R, neck=Rx(th*0.55), head=Rx(th*0.30), scap={s: (e, p) for s in 'lr'})
    barp = V((0, ctx.bar_y, zb)); ctx.BAR.location = barp
    for s, sg in (('l', 1), ('r', -1)):
        A = V((sg*DL['ax'], r.ANK_Y, r.ANK_Z)); K = V((sg*K_l.x, K_l.y, K_l.z))
        r.leg(s, K, A, Rz(sg*DL['toe'])@V((0, -1, 0)), sg*DL['toe'])
        r.arm(s, barp+V((sg*DL['grip'], 0, 0)), V((0, 0, -1)), V((sg*0.35, 0.9, 0.0))); r.fingers(s)
    return dict(bar=barp, load=[(barp, BAR_KG)], lean=th, fixed=['foot_l', 'foot_r'], grips=True)
# ── 벤치프레스 ──
BN = dict(top=0.46, grip=0.44, tp=-81.0, t1=-85.0, t2=-91.0, t3=-97.0, tn=-92.0, th=-84.0, scap=(-1.5, -2.5), ax=0.27, ank_dy=-0.40, bot_dy=-0.165, chest_gap=0.030)
def bn_torso(r, P):
    sc = {s: BN['scap'] for s in 'lr'}
    r.torso(P, Rx(BN['tp']), Rx(BN['t1']), Rx(BN['t2']), Rx(BN['t3']), Rx(BN['tn']), Rx(BN['th']), scap=sc)
def bench_setup(ctx):
    import bpy
    BN.update(ctx.vars); r = ctx.rig; r.reset(); P0 = V((0, 0.0, 1.0)); bn_torso(r, P0); r.apply(); bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); ob = ctx.h.evaluated_get(dg); me = ob.to_mesh(); pz = []
    for i, w in enumerate(ctx.weights):
        if w.get('spine_03', 0)+w.get('spine_02', 0)+w.get('pelvis', 0) > 0.6 and abs(ctx.rest_v[i].x) < 0.15: pz.append(me.vertices[i].co.z)
    ctx.P = V((0, 0.0, 1.0-(min(pz)-(BN['top']-0.012)))); ob.to_mesh_clear()
    r.reset(); bn_torso(r, ctx.P); r.apply(); bpy.context.view_layer.update()
    S = r.chain_head('upperarm_l'); dg = bpy.context.evaluated_depsgraph_get(); ob = ctx.h.evaluated_get(dg); me = ob.to_mesh()
    ctx.chest = max(v.co.z for v in me.vertices if abs(v.co.x) < 0.09 and abs(v.co.y-(S.y+BN['bot_dy'])) < 0.02); ob.to_mesh_clear()
    ctx.S = S; ctx.BAR = barbell(ctx.col, ctx.mats); y = ctx.P.y; T = BN['top']; M_ = ctx.mats
    box("pad", (0.30, 1.22, 0.07), (0, y+0.42, T-0.035), M_.PAD, 0.024); box("frame", (0.08, 1.05, 0.05), (0, y+0.42, T-0.095), M_.FRAME)
    for y_ in (y-0.02, y+0.86):
        box("post", (0.07, 0.07, T-0.12), (0, y_, (T-0.12)/2+0.02), M_.FRAME); box("ft", (0.56, 0.09, 0.04), (0, y_, 0.02), M_.FRAME)
    for sg in (-1, 1):
        box("up", (0.07, 0.07, 1.16), (sg*0.56, S.y+0.30, 0.58), M_.FRAME); box("hk", (0.05, 0.14, 0.04), (sg*0.56, S.y+0.24, 1.10), M_.RUBBER); box("bs", (0.08, 0.5, 0.04), (sg*0.56, S.y+0.24, 0.02), M_.FRAME)
def bench(r, t, ctx):
    u = timing(t); bn_torso(r, ctx.P); S = r.chain_head('upperarm_l'); Gx = BN['grip']
    F0, _L, n0 = r.grip_frame('l', V((0, 0.126, 1))); off = -F0*r.GRIP_F-n0*r.GRIP_N; top_y = S.y-0.015
    reach = sqrt0(((r.L_U+r.L_F)*0.996)**2-(Gx-S.x+off.x)**2-(top_y+off.y-S.y)**2)
    top = V((0, top_y, S.z+reach-off.z)); bot = V((0, S.y+BN['bot_dy'], ctx.chest+BN['chest_gap']))
    barp = V((0, lerp(top.y, bot.y, u**1.25), lerp(top.z, bot.z, u))); ctx.BAR.location = barp
    for s, sg in (('l', 1), ('r', -1)):
        r.arm(s, barp+V((sg*Gx, 0, 0)), V((0, 0.18*(1-0.3*(1-u)), 1)), V((sg*lerp(0.90, 0.72, u), -0.42, -0.62))); r.fingers(s)
        A = V((sg*BN['ax'], ctx.P.y+BN['ank_dy'], r.ANK_Z))
        r.leg_ik(s, A, V((sg*0.22, -0.3, 1)), V((0, -1, 0)), sg*8)
    return dict(bar=barp, load=[], lean=BN['t3'], fixed=['foot_l', 'foot_r', 'pelvis', 'spine_03'], grips=True, support=None)
SOLVERS = {'squat': (squat_setup, squat), 'deadlift': (deadlift_setup, deadlift), 'bench': (bench_setup, bench)}
