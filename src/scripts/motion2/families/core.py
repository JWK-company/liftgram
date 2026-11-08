# SPDX-License-Identifier: GPL-3.0-or-later
"""코어 묶음 계산식(SPEC-040 Phase 11): 누워서(크런치·싯업·레그 레이즈·데드버그…), 엎드려·짚고(플랭크·버드독·롤아웃…),
매달려(행잉 레이즈), 서서(팔로프·사이드 벤드·우드찹·윈드밀), 앉아서·기구(러시안 트위스트·크런치 머신·목 운동). 변형은 catalog 의 vars 로 고른다.
좌표: X 왼쪽+, -Y 앞, Z 위. 자세는 '선 자세 기준 몸 회전'(Rot: 굽힘 + 앞으로, 옆 + 왼쪽, 비틀기 + 왼쪽)을 기준 회전 B(누움·엎드림·옆으로 누움)에 곱해 놓는다.
누운 동작은 메시 최저점을 재서 바닥에 붙인다(ground). 동작 근거는 실제 수행 관찰 메모(저장소 밖)."""
import math
from mathutils import Vector as V, Matrix
from rig import Rx, Ry, Rz, Rot, lerp, sstep, sqrt0
from scene import PLATE_R, barbell, box, cyl
from families.reps import (SIDES, BAR_KG, DB_KG, timing, dumbbell, hold, rot_to, wire, wire_to, grip_w, jointed, hang, stand_P, plant)
from families.squat_lunge import kettlebell, place_obj, local_pts, W_, KB_KG

SUP = Rx(-90.0)                 # 바로 누움: 머리 +Y, 몸 앞 +Z
PRN = Rx(90.0)                  # 엎드림: 머리 -Y, 몸 앞 -Z
SIDE_L = Rx(-90.0)@Rz(90.0)     # 왼쪽으로 누움: 머리 +Y, 몸 앞 +X, 왼쪽이 바닥
# 차렷 자세 몸 표면의 기준점(뼈대 공간)과 붙은 뼈
SACRUM = ('pelvis', V((0, 0.085, 0.93)))      # 엉덩이 뒤(누우면 바닥 닿는 곳)
LBACK = ('spine_02', V((0, 0.06, 1.10)))      # 허리 뒤
UBACK = ('spine_03', V((0, 0.085, 1.30)))     # 날개뼈 사이
HIPSIDE = ('pelvis', V((0.18, 0.0, 0.93)))    # 왼 엉덩이 옆(옆으로 누운 받침)
GZ = -0.008                                   # 몸 메시 최저점 목표(바닥면 -0.012 보다 4mm 위)
LIMB = ('hand', 'index', 'middle', 'ring', 'pinky', 'thumb')   # 손만 뺀다(바닥을 짚는 손은 따로 높이를 맞춘다)

def wpt(r, n, p):
    """차렷 자세 점 p(뼈 n 에 붙음)의 지금 위치."""
    return (r.Pose[n] @ r.B[n].matrix_local.inverted() @ p.to_4d()).to_3d()
def rots(B, pel=0.0, c=0.0, side=0.0, tw=0.0, nk=0.0, hd=0.0, ps=0.0, pt=0.0, k=(0.35, 0.7, 1.0)):
    """분절별 절대 회전 6개(골반·척추1~3·목·머리). pel 골반 굽힘, c 척추 굽힘(위로 누적), side·tw 옆굽힘·비틀기(같은 비율), ps·pt 골반 자체의 옆·비틀기."""
    seg = [Rot(pel, ps, pt)]+[Rot(pel+k[i]*c, ps+k[i]*side, pt+k[i]*tw) for i in range(3)]
    seg += [Rot(pel+c+nk, ps+side, pt+tw), Rot(pel+c+nk+hd, ps+side, pt+tw)]
    return [B@m for m in seg]
def put(r, R6, anchor, target, scap=None):
    """몸통을 R6 자세로 두되 기준점 anchor=(뼈, 점) 이 target 에 오게 놓는다. 골반 위치를 돌려준다."""
    r.torso(V((0, 0, 0)), *R6, scap=scap); P = target-wpt(r, *anchor); r.torso(P, *R6, scap=scap); return P
def mesh_min(ctx):
    import bpy
    r = ctx.rig; r.apply(); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); ob = ctx.h.evaluated_get(dg); me = ob.to_mesh(); vs = me.vertices
    z = min(vs[i].co.z for i in ctx.GI); ob.to_mesh_clear()
    for o in bpy.data.objects:   # 신발은 따로 된 물체다 — 발이 바닥 가까이 있는 자세에서는 신발 밑창이 가장 낮다
        if o.name.startswith('shoe_'): oe = o.evaluated_get(dg); mz = oe.to_mesh(); z = min(z, min((oe.matrix_world @ v.co).z for v in mz.vertices)); oe.to_mesh_clear()
    return z
def ground_setup(ctx, fn, n=9):
    """자세 함수 fn(r, t, ctx, dz) 를 여러 t 에서 재서, 어느 프레임도 바닥을 뚫지 않는 일정한 높이 보정을 정한다(고정점이 움직이지 않게)."""
    r = ctx.rig; ctx.GI = [i for i, w in enumerate(ctx.weights) if sum(x for k, x in w.items() if k.startswith(LIMB)) < 0.3]; dz = -9.0
    for i in range(n):
        r.reset(); fn(r, i/(n-1), ctx, 0.0); dz = max(dz, GZ-mesh_min(ctx))
    r.reset(); return dz
def grounded(r, t, ctx, fn):
    """프레임마다 바닥에 붙인다(구르는 동작: 할로우 록·브이 업·싯업)."""
    r.reset(); fn(r, t, ctx, 0.0); dz = GZ-mesh_min(ctx); r.reset(); return fn(r, t, ctx, dz)
F0 = None
def free_leg(r, s, sg, Rp, hf, kf, ab=0.0, ank=125.0, rot=0.0):
    """골반 기준 다리: 엉덩이 굽힘 hf(0 = 몸통과 일직선 아래, 90 = 앞으로 수평), 무릎 굽힘 kf, 벌림 ab, 발목 안쪽 각 ank, 허벅지 바깥 돌림 rot."""
    H = r.chain_head('thigh_'+s); Th = Rp@Ry(-sg*ab)@Rz(sg*rot)@Rx(-hf); K = H+Th@V((0, 0, -1))*r.L_T; Sh = Th@Rx(kf); A = K+Sh@V((0, 0, -1))*r.L_S*0.999
    r.leg(s, K, A, (Th@V((0, -1, 0))).normalized(), 0.0, 0.0); set_foot(r, s, ank)
    return K, A
def set_foot(r, s, ank):
    """발: 정강이 회전을 그대로 따르고 발목 안쪽 각만 ank 로(차렷 약 117°)."""
    Dc = r.Pose['calf_'+s].to_3x3() @ r.R0('calf_'+s).inverted(); r.set_delta('foot_'+s, Dc@Rx(ank-117.0), r.chain_head('foot_'+s)); r.inherit('ball_'+s)
def floor_feet(r, s, sg, A, kpole, yaw=0.0):
    """발바닥을 바닥에 붙인다(발목 A)."""
    r.leg_ik(s, A, kpole, Rz(sg*yaw)@V((0, -1, 0)), sg*yaw)
def hands_head(r, Rh, spread=1.0):
    """깍지 낀 손을 뒤통수에, 팔꿈치는 옆으로 벌린다(spread<1 이면 앞으로 모은다)."""
    C = r.chain_head('head')+Rh@V((0, 0, 0.09))
    for s, sg in SIDES:
        G = C+Rh@V((sg*0.06, 0.115, 0.0)); F = (Rh@V((-sg, 0.0, 0.3))).normalized()
        r.arm(s, G, F, Rh@V((sg*spread, -0.35*(2-spread), 0.1)), Rh@V((0, 0, -1)), 0.9995); r.fingers(s, 0.5)
def arms_cross(r, R3):
    """팔짱(가슴 위에 교차) — hinge 의 팔짱과 같은 식."""
    for s, sg in SIDES:
        So = r.chain_head('upperarm_'+('r' if s == 'l' else 'l')); G = So+R3@V((sg*0.06, -0.32, -0.18)); r.arm(s, G, (R3@V((-sg*1, 0, 0.15))).normalized(), R3@V((sg*0.4, 0.3, -1)), R3@V((0, 0, 1)), 0.9995); r.fingers(s, 0.3)
def arm_dir(r, s, sg, R3, d, k=0.97, pole=None, F=None, lat=None, curl=0.3):
    """어깨에서 몸통 기준 방향 d(선 자세 기준)로 팔을 뻗는다. k 는 팔 길이 비율."""
    S = r.chain_head('upperarm_'+s); dw = (R3@d).normalized(); W = S+dw*(r.L_U+r.L_F)*k; F = F if F is not None else dw
    G = grip_w(r, s, W, F, lat); r.arm(s, G, F, pole if pole is not None else R3@V((sg*1.0, 0.25, 0.0)), lat, 0.9995); r.fingers(s, curl); return G
def palm_floor(r, s, sg, x, y, F=None, pole=None, z=0.0, lat=None):
    """손바닥을 바닥에(손목 높이로 맞춘다)."""
    F = F if F is not None else V((sg*0.2, -1, 0)).normalized(); W = V((x, y, z+0.036+r.GRIP_N)); G = grip_w(r, s, W, F, lat)
    r.arm(s, G, F, pole if pole is not None else V((sg*0.6, 0.8, 0.3)), lat, 0.9995); r.fingers(s, 0.0); return G

# ════ 바닥에 바로·옆으로 누워(크런치·싯업·레그 레이즈·데드버그·플러터·할로우·브이 업·클램셸…) ════
SU = dict(mode='crunch', per_frame=False)
def su_setup(ctx):
    C = dict(SU); C.update(ctx.vars); ctx.C = C; r = ctx.rig; local_pts(ctx); ctx.DZ = 0.0
    if C['mode'] == 'pullthrough': pass
    if not C['per_frame']: ctx.DZ = ground_setup(ctx, su_pose)
    else: ctx.GI = [i for i, w in enumerate(ctx.weights) if sum(x for k, x in w.items() if k.startswith(LIMB)) < 0.3]
def su(r, t, ctx):
    if ctx.C['per_frame']: return grounded(r, t, ctx, su_pose)
    return su_pose(r, t, ctx, ctx.DZ)
def knees_up_feet(r, Rp, P, Ay, x=0.15, kp=None):
    """누워서 무릎 세우고 발바닥을 바닥에."""
    for s, sg in SIDES: floor_feet(r, s, sg, V((sg*x, Ay, r.ANK_Z)), kp or V((sg*0.25, 0, 1)))
def su_pose(r, t, ctx, dz):
    C = ctx.C; m = C['mode']; u = timing(t); T0 = V((0, 0, dz)); fixed = []; Ay = -0.60
    if m == 'crunch_double':   # 상체를 말아 올리며 무릎을 가슴으로(골반도 살짝 말린다)
        R6 = rots(SUP, pel=lerp(0, -12, u), c=lerp(0, 44, u), nk=lerp(8, 14, u)); put(r, R6, LBACK, T0+V((0, 0.0, 0)))
        hands_head(r, R6[5], 0.9)
        for s, sg in SIDES: free_leg(r, s, sg, R6[0], lerp(62, 118, u), lerp(85, 120, u), 4.0, 125.0)
        fixed = []
    elif m == 'heeltap':   # 어깨를 들고 옆으로 굽혀 같은 쪽 손끝을 뒤꿈치로
        sd = lerp(18.0, -18.0, u); R6 = rots(SUP, c=24.0, side=sd, nk=10.0); put(r, R6, SACRUM, T0)
        knees_up_feet(r, R6[0], None, Ay+0.04, 0.16); fixed = ['foot_l', 'foot_r', 'pelvis']
        for s, sg in SIDES:
            S = r.chain_head('upperarm_'+s); reach = (r.L_U+r.L_F)*0.97; dzh = S.z-0.07; dx = 0.15; dy = sqrt0(reach**2-dzh**2-dx**2)
            W = V((S.x+sg*dx, S.y-dy, 0.11)); F = V((0, -1, 0.05)).normalized(); G = grip_w(r, s, W, F); r.arm(s, G, F, V((sg*1, 0, -0.2)), None, 0.9995); r.fingers(s, 0.2)
    elif m == 'side':   # 왼쪽으로 누워 위쪽 옆구리로 어깨를 엉덩이 쪽으로 들어 올린다
        R6 = rots(SIDE_L, side=lerp(0, -32, u), nk=0.0, k=(0.3, 0.65, 1.0)); put(r, R6, HIPSIDE, T0)
        for s, sg in SIDES: free_leg(r, s, sg, R6[0], 40.0, 75.0, 0.0, 125.0)
        Rh = R6[5]; C_ = r.chain_head('head')+Rh@V((0, 0, 0.09))
        G = C_+Rh@V((-0.10, 0.08, 0.0)); r.arm('r', G, (Rh@V((0.5, 0.2, 0.8))).normalized(), Rh@V((-1, -0.2, 0.3)), Rh@V((0, -1, 0)), 0.9995); r.fingers('r', 0.5)   # 위쪽 손은 머리 뒤
        S = r.chain_head('upperarm_l'); palm_floor(r, 'l', 1, S.x+0.30, S.y-0.12, V((1, -0.3, 0)), V((0.0, 1.0, 0.25)), lat=V((-0.3, -1, 0)))   # 아래쪽 손은 가슴 앞 바닥
        fixed = ['pelvis']
    elif m == 'dead_bug':   # 팔 수직·다리 테이블탑에서 반대쪽 팔과 다리를 뻗는다(t0 왼팔·오른다리, t1 반대)
        R6 = rots(SUP, c=6.0, nk=6.0); put(r, R6, SACRUM, T0); a = 1-u
        for s, sg in SIDES:
            e = a if s == 'l' else u   # 팔 뻗는 정도
            el = math.radians(lerp(90, 172, sstep(0.0, 1.0, e)))
            arm_dir(r, s, sg, R6[3], V((sg*0.06, -math.sin(el), -math.cos(el))), 0.97, R6[3]@V((sg*1, 0.1, 0)))   # 90° = 천장, 180° = 머리 위
        for s, sg in SIDES:
            e = u if s == 'l' else a
            free_leg(r, s, sg, R6[0], lerp(90, 18, e), lerp(90, 3, e), 3.0, 135.0)
        fixed = ['pelvis']
    elif m in ('flutter', 'scissor'):   # 다리를 곧게 들고(손은 엉덩이 옆) 위아래(플러터)·좌우로 엇갈려(시저)
        R6 = rots(SUP, c=12.0, nk=10.0); put(r, R6, SACRUM, T0); ph = 2*math.pi*t
        for s, sg in SIDES:
            if m == 'flutter': hf = 24.0+10.0*math.sin(ph+(0 if s == 'l' else math.pi)); ab = 4.0
            else: hf = 31.0 if s == 'l' else 23.0; ab = 4.0+10.0*math.cos(ph)   # 두 다리가 함께 벌렸다 엇갈린다(왼 다리가 위)
            free_leg(r, s, sg, R6[0], hf, 2.0, ab, 135.0)
            S = r.chain_head('upperarm_'+s); palm_floor(r, s, sg, sg*0.22, S.y-0.45, V((0, -1, 0)), V((sg*1, 0, -0.3)))
        fixed = ['pelvis']
    elif m in ('legraise', 'kneeraise'):   # 곧은 다리(레그 레이즈) 또는 무릎을 굽혀(니 레이즈) 엉덩이를 굽힌다, 손은 몸 옆 바닥
        R6 = rots(SUP, pel=lerp(0, -6, u), c=lerp(0, 6, u), nk=6.0); put(r, R6, UBACK, T0+V((0, 0.0, 0)))
        for s, sg in SIDES:
            if m == 'legraise': free_leg(r, s, sg, R6[0], lerp(10, 92, u), 3.0, 3.0, 135.0)
            else: free_leg(r, s, sg, R6[0], lerp(12, 120, u), lerp(8, 120, u), 3.0, 135.0)
            S = r.chain_head('upperarm_'+s); palm_floor(r, s, sg, sg*0.26, S.y-0.50, V((0, -1, 0)), V((sg*1, 0, -0.3)))
        fixed = ['spine_03']
    elif m == 'wiper':   # 다리를 수직으로 세운 채 골반째 좌우로 넘긴다, 팔은 옆으로 벌려 바닥
        rw = lerp(-55.0, 55.0, u); R6 = rots(SUP, pt=rw, tw=-rw, k=(0.45, 0.8, 1.0)); put(r, R6, UBACK, T0)
        for s, sg in SIDES: free_leg(r, s, sg, R6[0], 88.0, 3.0, 2.0, 135.0)
        for s, sg in SIDES:
            S = r.chain_head('upperarm_'+s); F = V((sg, -0.45, 0)).normalized(); palm_floor(r, s, sg, S.x+sg*0.46, S.y-0.18, F, V((0, 0.5, -0.4)), lat=V((sg*F.y, -sg*F.x, 0)))   # 손바닥 아래로, 팔은 비스듬히 아래로 벌림
        fixed = ['spine_03']
    elif m == 'revcrunch':   # 무릎 굽힌 테이블탑에서 골반을 말아 엉덩이를 바닥에서 띄운다
        R6 = rots(SUP, pel=lerp(0, -42, u), c=lerp(0, 42, u), nk=6.0); put(r, R6, UBACK, T0)
        for s, sg in SIDES:
            free_leg(r, s, sg, R6[0], lerp(88, 118, u), 95.0, 3.0, 130.0)
            S = r.chain_head('upperarm_'+s); palm_floor(r, s, sg, sg*0.26, S.y-0.50, V((0, -1, 0)), V((sg*1, 0, -0.3)))
        fixed = ['spine_03']
    elif m == 'bicycle':   # 어깨를 든 채 몸통을 돌려 팔꿈치를 반대 무릎으로, 다리는 번갈아 굽혔다 편다
        ph = 2*math.pi*t; tw = 26.0*math.sin(ph); R6 = rots(SUP, c=28.0, tw=tw, nk=8.0, k=(0.3, 0.7, 1.0)); put(r, R6, SACRUM, T0)
        hands_head(r, R6[5], 0.8)
        for s, sg in SIDES:
            w = 0.5-0.5*math.sin(ph)*sg   # 1 = 굽힘(가슴 쪽): 몸통이 왼쪽(+tw)으로 돌 때 오른 무릎이 들어온다
            free_leg(r, s, sg, R6[0], lerp(30, 100, w), lerp(5, 105, w), 3.0, 135.0)
        fixed = ['pelvis']
    elif m in ('hollow_rock', 'vup', 'toetouch', 'situp'):
        if m == 'hollow_rock':   # 팔은 머리 위, 다리는 든 할로우 자세로 등을 굴린다
            rk = lerp(-14.0, 14.0, u); R6 = rots(SUP@Rx(rk), pel=-10.0, c=30.0, nk=6.0); put(r, R6, LBACK, T0)
            for s, sg in SIDES: free_leg(r, s, sg, R6[0], 32.0, 2.0, 3.0, 135.0); arm_dir(r, s, sg, R6[3], V((sg*0.10, 0.10, 1)), 0.97, R6[3]@V((sg*1, 0.3, 0)))
        elif m == 'vup':   # 누워 팔을 머리 위로 → 상체와 다리를 함께 들어 손끝이 발끝으로
            R6 = rots(SUP, pel=lerp(0, 38, u), c=lerp(0, 34, u), nk=lerp(0, 4, u)); put(r, R6, SACRUM, T0)
            for s, sg in SIDES:
                free_leg(r, s, sg, R6[0], lerp(4, 110, u), 2.0, 3.0, 135.0)
                arm_dir(r, s, sg, R6[3], V((sg*0.10, lerp(0.05, -1.0, u), lerp(1.0, -0.15, u))), 0.97, R6[3]@V((sg*1, 0.3, 0)))
        elif m == 'toetouch':   # 다리를 수직으로 들고 어깨를 말아 손끝을 발끝 쪽으로
            R6 = rots(SUP, c=lerp(4, 36, u), nk=lerp(4, 12, u)); put(r, R6, SACRUM, T0)
            for s, sg in SIDES:
                free_leg(r, s, sg, R6[0], 86.0, 4.0, 3.0, 135.0)
                arm_dir(r, s, sg, R6[3], V((sg*0.05, lerp(-0.55, -1.0, u), lerp(0.85, 0.35, u))), 0.97, R6[3]@V((sg*1, 0.3, 0)))
        else:   # 싯업: 무릎 세우고 발 고정, 상체를 바닥에서 무릎 쪽으로(팔짱)
            R6 = rots(SUP, pel=lerp(0, 52, u), c=lerp(0, 30, u), nk=lerp(4, 8, u)); put(r, R6, SACRUM, T0)
            knees_up_feet(r, R6[0], None, Ay+0.02, 0.15); arms_cross(r, R6[3]); fixed = ['foot_l', 'foot_r']
    elif m in ('clamshell', 'sideleg'):   # 왼쪽으로 누워 무릎 굽혀(클램셸) 위 무릎을 연다 / 곧은 위 다리를 든다
        R6 = rots(SIDE_L, nk=-4.0); put(r, R6, HIPSIDE, T0)
        if m == 'clamshell':
            free_leg(r, 'l', 1, R6[0], 45.0, 85.0, 0.0, 120.0); K0, A0 = free_leg(r, 'r', -1, R6[0], 45.0, 85.0, 0.0, 120.0)   # 위 다리: 발은 붙인 채 무릎만 엉덩이-발목 축으로 연다
            H = r.chain_head('thigh_r'); ax_ = (A0-H).normalized(); p0 = K0-(H+A0)/2; ang = math.radians(lerp(0, 40, u)); Rm = Matrix.Rotation(ang, 3, ax_); Rm2 = Matrix.Rotation(-ang, 3, ax_); p1 = Rm@p0 if (Rm@p0).z >= (Rm2@p0).z else Rm2@p0
            r.leg_ik('r', A0, p1, p1.normalized(), 0.0); set_foot(r, 'r', 120.0)
        else:
            free_leg(r, 'l', 1, R6[0], 12.0, 20.0, 0.0, 120.0); free_leg(r, 'r', -1, R6[0], 2.0, 2.0, lerp(4, 42, u), 120.0)
        Rh = R6[3]; S = r.chain_head('upperarm_l'); G = S+Rh@V((-0.02, 0.0, 0.40)); r.arm('l', G, (Rh@V((-1, 0, 0.3))).normalized(), Rh@V((1, 0.2, -0.2)), Rh@V((0, -1, 0)), 0.9995); r.fingers('l', 0.4)   # 아래 팔은 머리 밑 베개
        G = wpt(r, 'pelvis', V((-0.215, -0.02, 1.02))); r.arm('r', G, (Rh@V((0.2, -0.3, -1))).normalized(), Rh@V((-1, 0.3, 0)), None, 0.9995); r.fingers('r', 0.2)   # 위 손은 엉덩이 위
        fixed = ['pelvis', 'foot_l']
    elif m in ('russian', 'kneetuck', 'vhold'):   # 바닥에 앉아 상체를 뒤로 기울인다(엉덩이·꼬리뼈로 받침)
        if m == 'russian':   # 무릎 굽혀 발을 살짝 든 채 모은 손을 몸통째 좌우로 돌린다
            tw = 34.0*math.sin(2*math.pi*t); R6 = rots(Rx(-42.0), pel=0.0, c=14.0, tw=tw, nk=6.0, k=(0.3, 0.65, 1.0)); put(r, R6, SACRUM, T0)
            for s, sg in SIDES: free_leg(r, s, sg, R6[0], 93.0, 72.0, 6.0, 130.0)   # 허벅지 45° 위, 정강이는 바닥과 거의 나란히(발이 살짝 뜬다)
            R3 = R6[3]; C_ = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2+R3@V((0, -0.36, -0.16))
            for s, sg in SIDES: G = C_+R3@V((sg*0.035, 0, 0)); F = (R3@V((0, -0.2, -1))).normalized(); r.arm(s, G, F, R3@V((sg*1, 0.3, -0.6)), R3@V((0, -1, 0)), 0.9995); r.fingers(s, 0.6)
        elif m == 'kneetuck':   # 손을 엉덩이 뒤 바닥에 짚고, 모은 무릎을 가슴으로 당겼다 다리를 앞으로 뻗는다
            ln = lerp(-34.0, -46.0, u); R6 = rots(Rx(ln), c=8.0, nk=8.0); put(r, R6, SACRUM, T0)
            for s, sg in SIDES: free_leg(r, s, sg, R6[0], lerp(124, 52, u), lerp(122, 6, u), 3.0, 140.0)
            fixed = []
            for s, sg in SIDES:
                S = r.chain_head('upperarm_'+s); wz = 0.036+r.GRIP_N; h = S.z-wz; dy = sqrt0(((r.L_U+r.L_F)*0.96)**2-h**2-0.03**2); palm_floor(r, s, sg, S.x+sg*0.03, S.y+dy, V((sg*0.1, -1, 0)), V((sg*0.3, 1, 0.2)))
        else:   # V 홀드: 곧은 다리를 들고 상체를 기울여 팔을 다리와 나란히 앞으로
            R6 = rots(Rx(-44.0), c=10.0, nk=6.0); put(r, R6, SACRUM, T0)
            for s, sg in SIDES: free_leg(r, s, sg, R6[0], lerp(98, 104, u), 3.0, 3.0, 145.0); arm_dir(r, s, sg, R6[3], V((sg*0.08, -1.0, -0.55)), 0.97, R6[3]@V((sg*1, 0.4, 0)))
        if m != 'kneetuck': fixed = ['pelvis']   # 니 턱은 상체를 기울이며 엉덩이가 굴러 고정점이 아니다
    elif m == 'superman':   # 엎드려 팔을 머리 위로 뻗고, 등을 젖히며 팔·가슴·다리를 함께 든다(배·골반은 바닥)
        R6 = rots(PRN, c=lerp(-2, -26, u), nk=lerp(0, -8, u), k=(0.3, 0.65, 1.0)); put(r, R6, ('pelvis', V((0, -0.10, 0.92))), T0+V((0, 0, 0.0)))
        for s, sg in SIDES:
            free_leg(r, s, sg, R6[0], lerp(0, -16, u), 2.0, 4.0, 160.0); arm_dir(r, s, sg, R6[3], V((sg*0.22, lerp(-0.05, 0.12, u), 1.0)), 0.97, R6[3]@V((sg*1, 0.3, 0)))
        fixed = ['pelvis']
    elif m in ('birddog', 'hydrant'):   # 네발 기기(손은 어깨 아래, 무릎은 엉덩이 아래)에서
        KZ = 0.105; Hz = KZ+r.L_T*0.998; Wz = 0.036+r.GRIP_N; Sz = Wz+(r.L_U+r.L_F)*0.975; Lh = 0.47; e = math.degrees(math.asin(max(-0.5, min(0.5, (Sz-Hz-0.02)/Lh))))   # 무릎 관절 10.5cm(굽힌 무릎뼈가 아래로 나온다)
        H0 = r.HIP_OFF+r.head0('pelvis')
        for _ in range(3):   # 어깨가 손 짚는 높이에 오도록 몸통 기울기를 맞춘다
            R6 = rots(Rx(90.0-e), nk=-10.0, hd=-6.0); put(r, R6, ('pelvis', V((0, H0.y, H0.z))), V((0, 0, Hz))); Sm = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2; e += math.degrees(math.asin(max(-0.3, min(0.3, (Sz-Sm.z)/Lh))))
        R6 = rots(Rx(90.0-e), nk=-10.0, hd=-6.0); put(r, R6, ('pelvis', V((0, H0.y, H0.z))), V((0, 0, Hz)))
        Rp = R6[0]
        for s, sg in SIDES:
            H = r.chain_head('thigh_'+s); kneel = V((H.x, H.y, KZ)); A_ = kneel+V((0, r.L_S*0.985, 0.02))
            moving = (m == 'birddog' and s == 'r') or (m == 'hydrant' and s == 'r')
            if not moving:   # 발끝을 세워(앞꿈치를 바닥에) 꿇는다 — 정강이 길이가 맞는 앞꿈치 자리를 이분법으로
                bz = r.head0('ball_'+s).z+0.016; lo, hi = kneel.y, kneel.y+r.L_S*1.3
                for _ in range(30):
                    yb = (lo+hi)/2; Ab = r.ankle_from_ball(s, V((kneel.x, yb, bz)), 0.0, 62.0)
                    if (Ab-kneel).length < r.L_S*0.999: lo = yb
                    else: hi = yb
                r.leg(s, kneel, Ab, V((0, -1, 0)), 0.0, 62.0, True); continue
            if m == 'birddog': free_leg(r, s, sg, Rp, lerp(78-e, 4, u), lerp(96, 4, u), 2.0, lerp(160, 150, u))   # 무릎을 막 띄운 자세에서 오른 다리를 뒤로 곧게 뻗는다(골반이 90-e 만큼 기울어 허벅지 수직 = 90-e)
            else: free_leg(r, s, sg, Rp, 90-e, 92.0, 0.0, 160.0, lerp(10, 58, u))   # 무릎 굽힌 채 옆으로 연다(몸통 축으로 바깥 돌림)
        for s, sg in SIDES:
            S = r.chain_head('upperarm_'+s)
            if m == 'birddog' and s == 'l':   # 왼팔을 앞으로 곧게 뻗는다
                el = u; W0 = V((S.x+sg*0.01, S.y+0.01, 0.036+r.GRIP_N)); W1 = S+V((sg*0.05, -1, 0.08)).normalized()*(r.L_U+r.L_F)*0.97; W = W0.lerp(W1, el)+V((0, 0, 0.10*math.sin(math.pi*el)))   # 바닥 짚은 손을 들어 앞으로 곧게 뻗는다
                F = V((sg*0.15, -1, 0)).lerp(V((0, -1, 0.08)), el).normalized(); lat = V((-sg, 0, 0)).lerp(V((0, 0, 1)), el); G = grip_w(r, s, W, F, lat); r.arm(s, G, F, V((sg*0.6, 0.8, 0.3)).lerp(V((sg*0.6, 0.2, 0.6)), el), lat, 0.9995); r.fingers(s, 0.1); continue
            palm_floor(r, s, sg, S.x+sg*0.01, S.y+0.01, V((sg*0.15, -1, 0)), V((sg*0.6, 0.8, 0.3)))
        fixed = ['calf_l']
    else: raise ValueError(m)
    return dict(bar=None, load=[], fixed=fixed)

# ════ 엎드려 짚고(플랭크·하이 플랭크·마운틴 클라이머·잭·숄더 탭·업다운·인치웜·풀스루) ════
PL = dict(mode='plank', ax=0.11, hx=0.20, pitch=55.0)
def pl_line(r, A, Lb, e):
    """앞꿈치 쪽 발목 A 에서 다리·몸통이 한 직선으로 e(라디안) 만큼 들린 엎드린 자세의 골반 위치와 회전."""
    d = V((0, -math.cos(e), math.sin(e))); Rt = Rx(90-math.degrees(e)); off = Rt@r.HIP_OFF; hx = off.x-A.x; Lh = sqrt0(Lb**2-hx**2); H = V((A.x+hx, A.y+d.y*Lh, A.z+d.z*Lh)); return H-off, Rt
def pl_solve_e(r, A, Lb, S0, shz):
    lo, hi = -0.2, 1.2
    for _ in range(50):
        m = (lo+hi)/2; P, Rt = pl_line(r, A, Lb, m)
        if (P+Rt@S0).z < shz: lo = m
        else: hi = m
    return (lo+hi)/2
def pl_setup(ctx):
    C = dict(PL); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; local_pts(ctx)
    ctx.S0 = r.shoulder_local('l')-r.head0('pelvis'); ctx.S0.x = 0.0; ctx.Lb = (r.L_T+r.L_S)*0.995
    ctx.ball = V((C['ax'], 0.0, r.head0('ball_l').z+0.016)); ctx.A = r.ankle_from_ball('l', ctx.ball, 4.0, C['pitch'])
    ctx.Wz = 0.036+r.GRIP_N; ctx.SH_HI = ctx.Wz+(r.L_U+r.L_F)*0.975; ctx.SH_LO = 0.055+r.L_U*0.985   # 하이 플랭크(손) / 팔꿈치 플랭크 어깨 높이
    m = C['mode']
    if m == 'hipdip': ctx.Lb = (r.L_T+r.L_S)*0.975   # 골반을 돌리면 엉덩이-발끝 거리가 늘어난다 — 무릎에 여유
    if m == 'pullthrough': ctx.KB = kettlebell(ctx, "kb")
def pl_arm(r, s, sg, S, w, ctx, lift=0.0, dy=0.0, x=None):
    """w 0 = 팔꿈치·아래팔을 바닥에(팔꿈치 어깨 아래), 1 = 손바닥을 어깨 아래에 짚고 팔을 편다."""
    x = (S.x+sg*0.02) if x is None else x
    Wlo = V((x, S.y-r.L_F*0.93+dy, 0.075)); Whi = V((x, S.y+0.01+dy, ctx.Wz)); W = Wlo.lerp(Whi, w)+V((0, 0, lift))
    F = (V((-sg*0.25, -1, -0.05))).lerp(V((sg*0.15, -1, 0)), w).normalized(); lat = V((0, 0, 1)).lerp(V((-sg, 0, 0)), w); G = grip_w(r, s, W, F, lat)   # 팔꿈치로 받칠 땐 주먹을 세운다(엄지 위), 손으로 짚으면 손바닥 아래
    pole = V((sg*0.15, 0.4, -1)).lerp(V((sg*0.6, 0.8, 0.3)), w); r.arm(s, G, F, pole, lat, 0.9995); r.fingers(s, lerp(0.7, 0.0, w)); return G
def foot_rel(r, s):
    """지금 발의 정강이 기준 각(set_foot 의 ank 값으로)."""
    Dc = r.Pose['calf_'+s].to_3x3()@r.R0('calf_'+s).inverted(); Df = r.Pose['foot_'+s].to_3x3()@r.R0('foot_'+s).inverted(); M_ = Dc.inverted()@Df
    return 117.0+math.degrees(math.atan2(M_[2][1], M_[1][1]))
def pl_legs(r, ctx, ab=0.0, wl=0.0, wr=0.0, spider=False):
    """앞꿈치로 받친 다리. w>0 이면 그 다리 무릎을 가슴(spider 면 같은 쪽 팔꿈치 바깥)으로 당긴다."""
    fixed = []
    for s, sg in SIDES:
        w = wl if s == 'l' else wr; ball = V((sg*(ctx.C['ax']+ab), ctx.ball.y, ctx.ball.z)); Ab = r.ankle_from_ball(s, ball, sg*4.0, ctx.C['pitch'])
        if w <= 1e-4:
            r.leg_ik(s, Ab, V((sg*0.08, -0.2, -1)), Rz(sg*4.0)@V((0, -1, 0)), sg*4.0, ctx.C['pitch'], True); fixed.append('ball_'+s); continue
        Rp = r.Pose['pelvis'].to_3x3()@r.R0('pelvis').inverted(); H = r.chain_head('thigh_'+s)
        wk = sstep(0.0, 0.7, w)   # 무릎이 조금 먼저 접혀 발이 뜬 뒤 무릎이 가슴(스파이더는 같은 쪽 팔꿈치 바깥) 아래로
        if spider: Th = Rp@Rx(-lerp(0, 128, w))@Ry(-sg*lerp(0, 62, w)); kf = lerp(0, 115, wk)   # 먼저 옆으로 벌린 허벅지를 앞으로 굽힌다(엎드려 벌리면 바닥과 나란히 움직인다)
        else: Th = Rp@Rx(-lerp(0, 118, w)); kf = lerp(0, 140, wk)
        K = H+Th@V((0, 0, -1))*r.L_T; Af = K+Th@Rx(kf)@V((0, 0, -1))*r.L_S
        k = sstep(0.0, 0.35, w); A = Ab.lerp(Af, k) if k < 1 else Af; A.z = max(A.z, Ab.z+0.10*sstep(0.0, 0.35, w))
        r.leg_ik(s, Ab, V((sg*0.08, -0.2, -1)), Rz(sg*4.0)@V((0, -1, 0)), sg*4.0, ctx.C['pitch'], True); a0 = foot_rel(r, s)   # 딛던 발목 각에서 시작해 들면서 편한 각으로 푼다(앞꿈치가 바닥을 긁지 않게)
        kp = K-(H+A)/2; kp = kp if kp.length > 1e-3 else Th@V((0, -1, 0)); r.leg_ik(s, A, kp, kp.normalized(), 0.0, 0.0); set_foot(r, s, lerp(a0, 152.0, sstep(0.3, 0.8, w)))   # 무릎은 계산한 무릎 쪽으로(벌린 허벅지에서 허벅지 앞면을 극으로 쓰면 무릎이 천장으로 뒤집힌다)
        Df = r.Pose['foot_'+s].to_3x3()@r.R0('foot_'+s).inverted(); q = Rz(sg*4.0).to_quaternion().slerp(Df.to_quaternion(), sstep(0.2, 0.7, w)); r.set_delta('ball_'+s, q.to_matrix())   # 발가락은 바닥에 펴 있던 각에서 천천히 발을 따라간다
    return fixed
def pl(r, t, ctx):
    C = ctx.C; m = C['mode']; u = timing(t); S0 = ctx.S0; A = ctx.A; Lb = ctx.Lb; fixed = []; load = []
    hi = m not in ('plank', 'hipdip', 'updown')
    if m == 'updown':   # 팔꿈치 플랭크 → 왼손·오른손 차례로 짚어 하이 플랭크
        wl = sstep(0.0, 0.5, u); wr = sstep(0.5, 1.0, u); shz = lerp(ctx.SH_LO, ctx.SH_HI, (wl+wr)/2)
    else: wl = wr = 1.0 if hi else 0.0; shz = ctx.SH_HI if hi else ctx.SH_LO
    if m == 'scap': shz = shz+lerp(-0.025, 0.02, u)
    if m == 'pullthrough': shz = ctx.SH_HI-0.03
    if m == 'jack':   # 발을 벌린 만큼 발목에서 몸 선을 다시 푼다(다리 길이 그대로)
        abx = lerp(0.0, 0.24, u); A = r.ankle_from_ball('l', V((C['ax']+abx, ctx.ball.y, ctx.ball.z)), 4.0, C['pitch'])
    e = pl_solve_e(r, A, Lb, S0, shz); P, Rt = pl_line(r, A, Lb, e); deg = 90-math.degrees(e)
    scap = (0.0, lerp(-2.5, 3.0, u) if m == 'scap' else 0.5); tw = 0.0; side = 0.0; pt = 0.0
    if m == 'hipdip': pt = lerp(-32.0, 32.0, u); tw = -pt*0.8
    if m == 'tap': side = lerp(4.0, -4.0, u)
    if m in ('climber', 'spider'): pass
    R6 = rots(Rt, pt=pt, tw=tw, side=side, nk=-8.0, hd=-6.0)
    if m in ('climber', 'spider'):
        ph = 2*math.pi*t; wl_ = 0.5-0.5*math.cos(ph); wr_ = 0.5+0.5*math.cos(ph)   # 두 다리가 쉬지 않고 엇갈려 달린다
    r.torso(P, *R6, scap={s: scap for s, _ in SIDES})
    if m == 'hipdip':   # 골반이 돌아도 발끝은 바닥에 — 골반 회전 뒤 다리를 다시 푼다
        P = P+(V((0, 0, shz))-V((0, 0, (r.chain_head('upperarm_l').z+r.chain_head('upperarm_r').z)/2))); r.torso(P, *R6, scap={s: scap for s, _ in SIDES})
    if m in ('climber', 'spider'): pl_legs(r, ctx, 0.0, wl_, wr_, m == 'spider'); fixed = []
    elif m == 'jack': pl_legs(r, ctx, abx); fixed = []
    else: fixed = pl_legs(r, ctx)
    if m == 'hipdip' and not hasattr(ctx, 'SREF'):   # 골반을 돌려도 아래팔은 바닥에 그대로 — 돌리기 전 어깨 자리를 기준으로 짚는다
        R0_ = rots(Rt, nk=-8.0, hd=-6.0); r.torso(P, *R0_, scap={s: scap for s, _ in SIDES}); ctx.SREF = {s: r.chain_head('upperarm_'+s).copy() for s, _ in SIDES}; r.torso(P, *R6, scap={s: scap for s, _ in SIDES})
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s); w = wl if s == 'l' else wr; S = ctx.SREF[s] if m == 'hipdip' else V((S.x, S.y, S.z))
        if m == 'tap':   # t0 왼손이 오른 어깨, t1 오른손이 왼 어깨(가운데에서 두 손 다 바닥)
            lift = (1-sstep(0.0, 0.5, t)) if s == 'l' else sstep(0.5, 1.0, t)   # 시간에 바로 맞춰(이중 감속 없이) 손이 고르게 움직인다
            if lift > 0.02:
                So = r.chain_head('upperarm_'+('r' if s == 'l' else 'l')); Wd = V((S.x+sg*0.02, S.y+0.01, ctx.Wz)); Gt = So+V((-sg*0.01, -0.09, -0.03)); Fd = V((sg*0.15, -1, 0)).normalized(); Ft = V((-sg, 0.3, 0.0)).normalized()   # 얼굴 아래(머리 쪽)로 건너가 반대 어깨 앞을 손바닥으로 친다
                k_ = sstep(0.0, 1.0, lift); G = grip_w(r, s, Wd, Fd).lerp(Gt, k_)+V((0, -0.12, 0.0))*math.sin(math.pi*k_); F = Fd.lerp(Ft, k_).normalized(); lat = V((-sg, 0, 0)).lerp(V((0, 0, 1)), k_)
                r.arm(s, G, F, V((sg*0.6, 0.8, 0.3)).lerp(V((sg*0.7, -0.7, -0.2)), k_), lat, 0.9995); r.fingers(s, 0.2*k_); continue
            pl_arm(r, s, sg, S, 1.0, ctx); continue
        if m == 'pullthrough' and s == 'l':   # 왼손이 몸 아래로 케틀벨을 오른쪽에서 왼쪽으로 끌어온다
            Sy = S.y-0.01; kx = lerp(-0.10, 0.24, u); kz = 0.197+0.01*math.sin(math.pi*u); G = V((kx, Sy, kz+0.062)); F = V((0, -0.3, -1)).normalized()   # 케틀벨 손잡이 윗부분(뿌리 +6.2cm)을 쥐고, 가운데에서 살짝 든다
            r.arm(s, G, F, V((0.8, 0.4, -0.2)), V((-1, 0, 0)), 0.9995); r.fingers(s, 0.9); place_obj(ctx.KB, V((kx, Sy, kz))); load.append((G, KB_KG)); continue   # 손등이 머리 쪽, 손바닥이 발 쪽으로 손잡이를 위에서 감싼다
        if m == 'updown':
            ww = w; lift = 0.06*math.sin(math.pi*ww); pl_arm(r, s, sg, S, ww, ctx, lift); continue
        pl_arm(r, s, sg, S, w, ctx)
    return dict(bar=None, load=load, fixed=fixed)

# ════ 매달려·받쳐 다리 들기(행잉 니·레그 레이즈·토즈 투 바·니즈 투 엘보·캡틴 체어·L-싯) ════
HG = dict(mode='knee', bar_z=2.25, grip=0.25)
HGM = {   # 끝 자세: 몸 전체 뒤로 기울기, 골반 뒤로 말기, 척추 굽힘, 엉덩이 굽힘, 무릎 굽힘
    'knee': (-6.0, -18.0, 16.0, 100.0, 105.0), 'leg': (-10.0, -22.0, 20.0, 92.0, 4.0),
    't2b': (-30.0, -40.0, 32.0, 112.0, 12.0), 'k2e': (-24.0, -34.0, 30.0, 118.0, 118.0),
    'cc_knee': (0.0, -12.0, 12.0, 92.0, 105.0), 'cc_leg': (0.0, -12.0, 12.0, 84.0, 4.0)}
def hg_rots(u, m):
    ln, p, c, hf, kf = HGM[m]; return rots(Rx(lerp(0, ln, u)), pel=lerp(0, p, u), c=lerp(0, c, u), nk=lerp(0, -4, u)), lerp(4, hf, u), lerp(4, kf, u)
def sh_place(r, R6, target, scap):
    """두 어깨 가운데가 target 에 오게 몸통을 놓는다."""
    P = put(r, R6, ('spine_03', V((0, -0.017, 1.368))), target, scap); Sm = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2; P = P+(target-Sm); r.torso(P, *R6, scap=scap); return P
def hg_setup(ctx):
    C = dict(HG); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; m = C['mode']; local_pts(ctx)
    if m in ('cc_knee', 'cc_leg'):   # 캡틴 체어: 등 패드·팔꿈치 패드·손잡이
        ctx.SH = V((0, 0.0, 1.55)); sc = {s: (3.0, 0.0) for s, _ in SIDES}; R6, _, _ = hg_rots(0.0, m); sh_place(r, R6, ctx.SH, sc)
        yb = max(wpt(r, *UBACK).y, wpt(r, *SACRUM).y)+0.012; ctx.ELZ = ctx.SH.z-r.L_U*0.995
        box("back", (0.40, 0.06, 0.80), (0, yb+0.03, 1.05), M_.PAD, 0.02); box("bframe", (0.08, 0.05, 1.55), (0, yb+0.085, 0.775), M_.FRAME)
        for sg in (-1, 1):
            Sx = abs(r.chain_head('upperarm_l').x)+0.04; box("apad", (0.11, 0.32, 0.06), (sg*Sx, -0.12, ctx.ELZ-0.055-0.03), M_.PAD, 0.02); cyl("handle", 0.016, 0.12, M_.STEEL, (sg*Sx, -0.30, ctx.ELZ-0.02), 'Z')   # 팔꿈치는 어깨보다 4cm 바깥(무릎이 패드 사이로 올라온다)
            box("arm", (0.06, 0.40, 0.05), (sg*(Sx+0.04), -0.08, ctx.ELZ-0.115), M_.FRAME); box("post", (0.06, 0.06, ctx.ELZ-0.14), (sg*(Sx+0.10), yb+0.06, (ctx.ELZ-0.14)/2), M_.FRAME)
        r.reset(); return
    if m == 'lsit':   # 패럴렛(낮은 평행 손잡이) 위에서 — 바닥보다 엉덩이·다리가 뜬 것이 분명히 보인다
        ctx.PZ = 0.26; ctx.PX = 0.27
        for sg in (-1, 1): cyl("pbar", 0.017, 0.42, M_.STEEL, (sg*ctx.PX, -0.05, ctx.PZ), 'Y'); [box("pleg", (0.03, 0.03, ctx.PZ), (sg*ctx.PX, y_, ctx.PZ/2), M_.FRAME) for y_ in (-0.22, 0.12)]; box("pfoot", (0.05, 0.42, 0.02), (sg*ctx.PX, -0.05, 0.01), M_.FRAME)
        r.reset(); return
    z = C['bar_z']; ctx.BARP = V((0, 0, z)); cyl("shaft", 0.016, 1.4, M_.STEEL, (0, 0, z)); [box("up", (0.07, 0.07, z+0.04), (sg*0.68, 0.0, (z+0.04)/2), M_.FRAME) for sg in (-1, 1)]; [box("ft", (0.09, 0.9, 0.04), (sg*0.68, 0.0, 0.02), M_.FRAME) for sg in (-1, 1)]
def hg(r, t, ctx):
    C = ctx.C; m = C['mode']; u = timing(t)
    if m == 'lsit':   # 바닥에 손을 짚고 팔을 펴 어깨를 내려 엉덩이를 들고, 곧은 다리를 수평으로 든다
        sc = {s: (-3.0, 0.5) for s, _ in SIDES}; R6 = rots(Rx(8.0), pel=-6.0, c=4.0, nk=-6.0); Wz = ctx.PZ+0.017+0.036+r.GRIP_N; shz = Wz+(r.L_U+r.L_F)*0.955
        sh_place(r, R6, V((0, -0.02, shz)), sc)
        for s, sg in SIDES:   # 손바닥을 손잡이 위에 얹어 짚는다(손가락은 앞)
            S = r.chain_head('upperarm_'+s); palm_floor(r, s, sg, sg*ctx.PX, S.y+0.02, V((sg*0.15, -1, 0)), V((sg*0.2, 1, 0)), ctx.PZ+0.017); r.fingers(s, 0.5)
            free_leg(r, s, sg, R6[0], lerp(90, 97, u), 1.5, 0.0, 150.0)
        return dict(bar=None, load=[], fixed=[])
    R6, hf, kf = hg_rots(u, m)
    if m in ('cc_knee', 'cc_leg'):   # 등을 패드에 대고 팔꿈치로 받친 채 손잡이를 쥔다
        sc = {s: (3.0, 0.0) for s, _ in SIDES}; sh_place(r, R6, ctx.SH, sc)
        for s, sg in SIDES:
            S = r.chain_head('upperarm_'+s); E = V((S.x+sg*0.04, S.y-0.02, ctx.ELZ)); W = E+V((0, -r.L_F*0.97, 0.02)); F = V((0, -0.3, 1)).normalized(); jointed(r, s, E, W, F, V((-sg, 0, 0)), V((sg*0.2, 1, -0.3))); r.fingers(s, 0.9)
    else:   # 바를 어깨너비로 쥐고 매달린다
        G = {s: ctx.BARP+V((sg*C['grip'], 0, 0)) for s, sg in SIDES}; F = V((0, 0, 1)); Wz = G['l'].z-r.GRIP_F; sc = {s: (lerp(4.0, 2.0, u), 0.0) for s, _ in SIDES}
        sh_place(r, R6, V((0, 0.01, Wz-(r.L_U+r.L_F)*0.975)), sc)
        for s, sg in SIDES: r.arm(s, G[s], F, V((sg*0.9, 0.3, -0.2)), None, 0.9995); r.fingers(s)
    for s, sg in SIDES: free_leg(r, s, sg, R6[0], hf, kf, 3.0, 140.0)
    return dict(bar=None, load=[], fixed=[])

# ════ 옆으로 받친 플랭크(사이드 플랭크·크런치·회전) ════
SP = dict(mode='hold')
def sp_body(r, ctx, e, R_extra):
    """왼 아래팔로 받친 옆 플랭크: 몸 선을 e(도) 만큼 든 기준 회전으로, 왼 어깨가 팔꿈치 위에 오게 놓는다."""
    B = Rx(e)@SIDE_L; R6 = R_extra(B); sc = {s: (0.0, 1.0) for s, _ in SIDES}
    P = put(r, R6, ('spine_03', V((0, -0.017, 1.368))), V((0, 0, 0)), sc); Sl = r.chain_head('upperarm_l'); P = P+(ctx.SL-Sl); r.torso(P, *R6, scap=sc); return R6
def sp_solve(r, ctx, R_extra):
    """왼 발목이 바닥(옆 날)에 닿도록 몸 선의 각을 이분법으로 찾는다."""
    lo, hi = 0.0, 40.0
    for _ in range(30):
        e = (lo+hi)/2; r.reset(); R6 = sp_body(r, ctx, e, R_extra); free_leg(r, 'l', 1, R6[0], 2.0, 2.0, 1.0, 118.0)
        if r.chain_head('foot_l').z > ctx.AZ: lo = e
        else: hi = e
    return (lo+hi)/2
def sp_setup(ctx):
    C = dict(SP); C.update(ctx.vars); ctx.C = C; r = ctx.rig; local_pts(ctx)
    ctx.SL = V((0.0, 0.0, 0.055+r.L_U*0.99)); ctx.AZ = 0.082   # 팔꿈치(바닥 위 5.5cm) 바로 위 왼 어깨 · 옆 날로 선 발목 높이(신발 반폭)
    if C['mode'] == 'copen':   # 코펜하겐: 위(오른) 다리 발목 안쪽을 벤치 위에 — 그 높이에 맞는 몸 선 각을 이분법으로
        lo, hi = -35.0, 25.0
        for _ in range(30):
            e = (lo+hi)/2; r.reset(); R6 = sp_body(r, ctx, e, lambda B: rots(B, nk=4.0)); free_leg(r, 'r', -1, R6[0], 2.0, 2.0, 1.0, 118.0)
            if r.chain_head('foot_r').z > 0.50: lo = e
            else: hi = e
        ctx.E0 = (lo+hi)/2; Ar = r.chain_head('foot_r'); M_ = ctx.mats
        box("bench", (1.10, 0.30, 0.06), (0, Ar.y-0.02, 0.50-0.052-0.03), M_.PAD, 0.02); [box("bleg", (0.06, 0.06, 0.42), (sg*0.50, Ar.y-0.02, 0.21), M_.FRAME) for sg in (-1, 1)]
        r.reset(); return
    ctx.E0 = sp_solve(r, ctx, lambda B: rots(B, nk=4.0)); r.reset()
def sp(r, t, ctx):
    C = ctx.C; m = C['mode']; u = timing(t)
    if m == 'hold': fn = lambda B: rots(B, nk=lerp(2.0, 6.0, u))   # 버티기(팔꿈치·발이 고정이라 몸통은 그대로, 고개만 살짝)
    elif m == 'crunch': fn = lambda B: rots(B, c=lerp(0, 26, u), side=lerp(0, -10, u), nk=lerp(4, 10, u))   # 위 팔꿈치와 위 무릎을 몸 앞에서 만나게
    else: fn = lambda B: rots(B, tw=lerp(0, 40, u), c=lerp(0, 10, u), nk=4.0, k=(0.25, 0.6, 1.0))   # 가슴을 바닥 쪽으로 돌리며 위 팔을 몸 아래로
    if m == 'copen': fn = lambda B: rots(B, nk=lerp(3.0, 6.0, u))   # 몸은 버티고 아래 다리를 벤치 밑으로 끌어 올린다(모음근)
    R6 = sp_body(r, ctx, ctx.E0 if m in ('hold', 'copen') else sp_solve(r, ctx, fn), fn)   # 몸통이 굽거나 돌면 발 높이가 바뀐다 — 프레임마다 아래 발을 바닥에 다시 맞춘다
    if m == 'copen': free_leg(r, 'l', 1, R6[0], lerp(6, 3, u), lerp(10, 3, u), lerp(13, 4, u), 120.0)
    else: free_leg(r, 'l', 1, R6[0], 2.0, 2.0, 1.0, 118.0)
    if m == 'crunch': free_leg(r, 'r', -1, R6[0], lerp(4, 88, u), lerp(4, 100, u), lerp(1, 12, u), 125.0)   # 위 무릎은 아래 다리 위로 지나간다
    else: free_leg(r, 'r', -1, R6[0], 2.0, 2.0, 1.0, 118.0)
    S = r.chain_head('upperarm_l'); E = V((S.x, S.y, 0.055)); W = E+V((r.L_F*0.97, -0.02, 0.025)); jointed(r, 'l', E, W, V((1, -0.05, 0)).normalized(), V((0, 0, 1)), None); r.fingers('l', 0.7)   # 아래팔을 몸 앞쪽 바닥에, 주먹은 엄지를 위로 세운다
    if m in ('hold', 'copen'):
        G = wpt(r, 'pelvis', V((-0.215, -0.02, 1.02))); r.arm('r', G, (R6[3]@V((0.2, -0.3, -1))).normalized(), R6[3]@V((-1, 0.3, 0)), None, 0.9995); r.fingers('r', 0.2)   # 위 손은 엉덩이 위
    elif m == 'crunch':
        Rh = R6[5]; C_ = r.chain_head('head')+Rh@V((0, 0, 0.09)); G = C_+Rh@V((-0.10, 0.08, 0.0)); r.arm('r', G, (Rh@V((0.5, 0.2, 0.8))).normalized(), Rh@V((-1, -0.2, 0.3)), Rh@V((0, -1, 0)), 0.9995); r.fingers('r', 0.5)   # 위 손은 머리 뒤
    else:
        Sr = r.chain_head('upperarm_r'); d0 = V((0, 0, 1)); d1 = V((0.45, 0.10, -0.88)).normalized(); d = d0.slerp(d1, u)
        G = Sr+d*(r.L_U+r.L_F)*0.86; F = d; lat = V((0, 1, 0)); G = grip_w(r, 'r', G, F, lat); r.arm('r', G, F, V((-0.3, -1, 0.2)), lat, 0.9995); r.fingers('r', 0.1)   # 천장 → 몸 아래로 실 꿰기
    return dict(bar=None, load=[], fixed=[])

# ════ 서서(사이드 벤드·팔로프 프레스·스탠딩 니 투 엘보·배큠·우드찹) ════
ST = dict(mode='sidebend', equip='db', ax=0.15)
I3 = Matrix.Identity(3)
def st_setup(ctx):
    C = dict(ST); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; m = C['mode']; e = C['equip']; local_pts(ctx)
    if e == 'db': ctx.DB = {'r': dumbbell(ctx, "db_r")}
    if m == 'sidebend' and e == 'cable':   # 오른쪽 아래 도르래
        ctx.PUL = V((-0.62, -0.02, 0.14)); box("stack", (0.26, 0.30, 1.90), (-0.80, -0.02, 0.95), M_.FRAME); box("pulley", (0.08, 0.08, 0.08), (-0.66, -0.02, 0.14), M_.FRAME); ctx.W = wire(ctx); ctx.H = cyl("handle", 0.016, 0.13, M_.STEEL)
    if m == 'pallof':   # 왼쪽 가슴 높이 고정점(케이블 도르래 또는 밴드를 맨 기둥)
        ctx.PUL = V((1.00, -0.40, 1.22)); box("stack" if e == 'cable' else "post", (0.26 if e == 'cable' else 0.10, 0.30 if e == 'cable' else 0.10, 1.90), (1.16 if e == 'cable' else 1.05, -0.40, 0.95), M_.FRAME); ctx.W = wire(ctx); ctx.H = cyl("handle", 0.016, 0.12, M_.STEEL, axis='Z')
    if m == 'chop':
        if e != 'db': ctx.PUL = V((-0.95, -0.55, 2.00)); box("stack" if e == 'cable' else "post", (0.26 if e == 'cable' else 0.10, 0.30 if e == 'cable' else 0.10, 2.10), (-1.10, -0.55, 1.05), M_.FRAME); ctx.W = wire(ctx); ctx.H = cyl("handle", 0.016, 0.14, M_.STEEL)
def st(r, t, ctx):
    C = ctx.C; m = C['mode']; e = C['equip']; u = timing(t); ax = C['ax']; load = []
    if m == 'sidebend':   # 무게 쪽(오른쪽)으로 옆구리를 굽혔다가 반대쪽으로 살짝 넘어 세운다
        sd = lerp(-24.0, 6.0, u); R6 = rots(I3, side=sd, nk=0.0, hd=-sd*0.25); P = stand_P(r, ax); P.x += -sd*0.0015; r.torso(P, *R6); fixed = plant(r, ax)
        G = hang(r, 'r', -1, min(0.11, max(0.03, r.chain_head('upperarm_r').x+0.31)) if e == 'db' else 0.03, 0.0, V((0, 0, -1)), V((0, -1, 0)), 0.97)   # 덤벨은 허벅지 바깥 x=-0.31 에 늘어뜨린다(원판이 허벅지에 닿지 않게)
        if e == 'db': hold(ctx, 'r', G, V((0, -1, 0))); load.append((G, DB_KG))
        else: ctx.H.location = G; ctx.H.rotation_euler = (math.pi/2, 0, 0); wire_to(ctx.W, G, ctx.PUL); load.append((G, 15.0))
        Gl = wpt(r, 'pelvis', V((0.215, -0.02, 1.02))); r.arm('l', Gl, (R6[0]@V((-0.2, -0.3, -1))).normalized(), R6[3]@V((1, 0.3, 0)), None, 0.9995); r.fingers('l', 0.2)   # 반대 손은 엉덩이 위
    elif m == 'pallof':   # 옆에서 당기는 손잡이를 가슴 앞에서 앞으로 밀어 버틴다(몸통이 돌지 않게)
        P = stand_P(r, 0.17, 0.0, 0.985); R6 = rots(I3, c=2.0); r.torso(P, *R6, scap={s: (0.0, lerp(0.5, 2.0, u)) for s, _ in SIDES}); fixed = plant(r, 0.17, 10.0)
        Sm = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2; Gm = V((0.0, Sm.y-lerp(0.27, 0.49, u), Sm.z-lerp(0.20, 0.13, u))); F = V((0, -1, 0))
        for s, sg in SIDES: G = Gm+V((sg*0.012, 0, sg*0.035)); r.arm(s, G, F, V((sg*0.6, 0.3, -1)), V((0, 0, 1)), 0.9995); r.fingers(s, 0.9)   # 세운 손잡이를 두 손으로 위아래 겹쳐 쥔다
        ctx.H.location = Gm; wire_to(ctx.W, Gm, ctx.PUL); load.append((Gm, 10.0))
    elif m == 'kte':   # 깍지 낀 손을 머리 뒤에, 오른 무릎을 들며 몸통을 돌려 왼 팔꿈치를 무릎으로
        R6 = rots(I3, c=lerp(0, 20, u), tw=lerp(0, -26, u), side=lerp(0, -8, u), nk=lerp(0, 8, u)); P = stand_P(r, 0.12); r.torso(P, *R6)
        r.leg_ik('l', V((0.12, r.ANK_Y, r.ANK_Z)), V((0.22, -1, 0)), Rz(6.0)@V((0, -1, 0)), 6.0); fixed = ['foot_l', 'ball_l']
        free_leg(r, 'r', -1, R6[0], lerp(10, 96, u), lerp(26, 100, u), lerp(1, -4, u), lerp(100, 130, u)); hands_head(r, R6[5], 1.0)   # 오른발은 바닥에서 막 뗀 자세(발바닥 수평)에서 시작
    elif m == 'vacuum':   # 손을 허리에 얹고 숨을 내쉬며 배를 등 쪽으로 끌어당겨 버틴다
        R6 = rots(I3, c=lerp(0, 3, u), nk=lerp(0, 2, u)); P = stand_P(r, ax); r.torso(P, *R6, scap={s: (lerp(0, 1.0, u), 0.5) for s, _ in SIDES}); fixed = plant(r, ax)
        for s, sg in SIDES: G = wpt(r, 'pelvis', V((sg*0.205, 0.0, 1.03))); r.arm(s, G, V((-sg*0.3, -0.5, -1)).normalized(), V((sg*1, 0.3, 0)), None, 0.9995); r.fingers(s, 0.2)
    else:   # 우드찹: 오른쪽 위에서 왼쪽 아래로 몸통을 돌리며 두 손으로 비스듬히 내려친다(무릎·엉덩이를 굽혀 따라간다)
        ax = 0.22; tw = lerp(-38.0, 38.0, u); R6 = rots(I3, pel=lerp(4, 20, u), c=lerp(0, 18, u), tw=tw, side=lerp(-6, 8, u), nk=lerp(-6, 6, u), k=(0.3, 0.65, 1.0))
        P = stand_P(r, ax, 0.0, 0.985); P = P+V((0, lerp(0.0, 0.06, u), -lerp(0.0, 0.10, u))); r.torso(P, *R6)
        for s, sg in SIDES: r.leg_ik(s, V((sg*ax, r.ANK_Y, r.ANK_Z)), V((sg*0.35, -1, 0)), Rz(sg*12.0)@V((0, -1, 0)), sg*12.0)
        fixed = ['foot_l', 'foot_r']; R3 = R6[3]; Sm = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2
        d0 = V((-0.55, -0.55, 0.62)).normalized(); d1 = V((0.30, -0.80, -0.52)).normalized(); dw = d0.slerp(d1, u); Gm = Sm+dw*0.44; ax_ = (R3@V((1, 0, 0))-dw*(R3@V((1, 0, 0))).dot(dw)).normalized()
        for s, sg in SIDES: G = Gm+ax_*sg*0.04; r.arm(s, G, dw, R3@V((sg*0.5, 0.3, -1)), -ax_*sg, 0.9995); r.fingers(s, 0.9)
        if e == 'db': hold(ctx, 'r', Gm, ax_); load.append((Gm, DB_KG))
        else: ctx.H.location = Gm; rot_to(ctx.H, ax_); wire_to(ctx.W, Gm, ctx.PUL); load.append((Gm, 12.0))
    return dict(bar=None, load=load, fixed=fixed)

# ════ 벤치·공·GHD 위에 누워(디클라인 싯업·크런치·레그 레이즈, 넥 컬·익스텐션, 짐볼 크런치, GHD 싯업) ════
BN = dict(mode='dsit', ang=25.0)
HJ = ('pelvis', V((0, 0.010, 0.920)))   # 고관절 중심(골반 회전의 축)
def pad(name, size, center, ang, M_):
    o = box(name, size, center, M_.PAD, 0.02); o.rotation_euler = (math.radians(ang), 0, 0); return o
def bn_rots(C, u, m):
    a = C['ang']
    if m == 'dsit': return rots(Rx(-a)@SUP, pel=lerp(0, 72, u), c=lerp(0, 20, u), nk=lerp(4, 10, u))
    if m == 'dcrunch': return rots(Rx(-a)@SUP, pel=lerp(0, 6, u), c=lerp(0, 40, u), nk=lerp(4, 14, u))
    if m == 'dlegraise': return rots(Rx(a)@SUP, pel=lerp(0, -16, u), c=lerp(0, 16, u), nk=6.0)
    if m == 'neckcurl': return rots(SUP, nk=lerp(-28, 34, u), hd=lerp(-8, 8, u))
    if m == 'neckext': return rots(PRN, nk=lerp(32, -26, u), hd=lerp(6, -10, u))
    if m == 'neckside': R6 = rots(SIDE_L); ns = lerp(22, -28, u); R6[4] = SIDE_L@Rot(0, ns, 0); R6[5] = SIDE_L@Rot(0, ns*1.35, 0); return R6
    if m == 'ball': return rots(SUP, pel=36.0, c=lerp(-44, 10, u), nk=lerp(-6, 16, u))
    if m == 'ghd': return rots(Rx(lerp(-12, -92, u)), c=lerp(6, -4, u), nk=lerp(6, 2, u))
    raise ValueError(m)
BN_ANCH = {'dsit': SACRUM, 'dcrunch': SACRUM, 'dlegraise': UBACK, 'neckcurl': UBACK, 'neckext': ('spine_03', V((0, -0.11, 1.30))), 'neckside': ('spine_03', V((0.17, 0.0, 1.30))), 'ball': LBACK}
def ball_put(r, ctx, R6):
    """허리(LBACK)를 공 표면에 — 등 방향으로 공 중심에서 반지름만큼."""
    b = (R6[2]@V((0, 1, 0))).normalized(); put(r, R6, LBACK, ctx.BALLC-b*0.375)
def bn_setup(ctx):
    C = dict(BN); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; m = C['mode']; a = C['ang']; local_pts(ctx); r.reset()
    if m == 'ghd':
        ctx.H = V((0, 0.0, 1.00)); R6 = bn_rots(C, 0.0, m); put(r, R6, HJ, ctx.H)
        ctx.A = {s: V((sg*0.12, -0.74, 1.06)) for s, sg in SIDES}
        box("gpad", (0.36, 0.34, 0.08), (0, 0.02, 0.86), M_.PAD, 0.03); box("gframe", (0.08, 1.30, 0.06), (0, -0.30, 0.78), M_.FRAME); box("gpost", (0.08, 0.08, 0.78), (0, 0.02, 0.39), M_.FRAME); box("gpost2", (0.08, 0.08, 0.98), (0, -0.85, 0.49), M_.FRAME)
        for s, sg in SIDES: pass
        cyl("roll_f", 0.045, 0.34, M_.PAD, (0, -0.66, 1.165)); cyl("roll_b", 0.045, 0.34, M_.PAD, (0, -0.60, 0.95)); box("gplate", (0.40, 0.03, 0.30), (0, -0.88, 1.12), M_.FRAME); r.reset(); return   # 정강이 위·종아리 아래 롤러 사이에 발목을 끼우고 발바닥은 발판에
    if m == 'ball':
        ctx.BALLC = V((0, 0.05, 0.33)); import bpy; bpy.ops.mesh.primitive_uv_sphere_add(radius=0.33, location=ctx.BALLC, segments=48, ring_count=24); b = bpy.context.object; b.name = "ball"; b.data.materials.append(M_.RUBBER); [setattr(q, 'use_smooth', True) for q in b.data.polygons]
        R6 = bn_rots(C, 0.0, m); ball_put(r, ctx, R6); H = wpt(r, *HJ); ctx.FT = {s: V((sg*0.22, H.y-0.46, r.ANK_Z)) for s, sg in SIDES}; r.reset(); return
    if m in ('dsit', 'dcrunch'):   # 머리 쪽이 낮은 디클라인 벤치, 무릎을 굽혀 발목을 롤러에 건다
        ctx.O = V((0, 0, 0.72)); R6 = bn_rots(C, 0.0, m); put(r, R6, SACRUM, ctx.O); ctx.H = wpt(r, *HJ)
        al = Rx(-a)@V((0, 1, 0)); n = Rx(-a)@V((0, 0, 1)); pad("bpad", (0.30, 1.25, 0.06), ctx.O+al*0.48-n*0.031, -a, M_)
        ctx.K = {}; ctx.A = {}
        for s, sg in SIDES: K, A = free_leg(r, s, sg, R6[0], 35.0, 100.0, 3.0, 117.0); ctx.K[s] = K; ctx.A[s] = A
        Am = (ctx.A['l']+ctx.A['r'])/2; cyl("roll", 0.045, 0.34, M_.PAD, (0, Am.y, Am.z+0.15))   # 롤러는 발등과 정강이 사이 오목한 곳 위
        zr = Am.z+0.15; box("bframe", (0.08, 1.3, 0.05), (0, -0.05, 0.45), M_.FRAME); box("bpost", (0.06, 0.06, zr), (0.20, Am.y, zr/2), M_.FRAME); box("bpost3", (0.06, 0.06, zr), (-0.20, Am.y, zr/2), M_.FRAME); box("bpost2", (0.07, 0.07, 0.45), (0, 0.55, 0.22), M_.FRAME); r.reset(); return
    if m == 'dlegraise':   # 머리 쪽이 높은 벤치, 머리 뒤 손잡이를 쥔다
        ctx.O = V((0, 0, 0.62)); R6 = bn_rots(C, 0.0, m); put(r, R6, UBACK, ctx.O)
        al = Rx(a)@V((0, 1, 0)); n = Rx(a)@V((0, 0, 1)); pad("bpad", (0.30, 1.30, 0.06), ctx.O-al*0.45-n*0.031, a, M_)
        Sm = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2; ctx.HG = Sm+al*0.36+n*0.02; cyl("hbar", 0.016, 0.40, M_.STEEL, ctx.HG); box("hpost", (0.05, 0.05, ctx.HG.z), (0.22, ctx.HG.y, ctx.HG.z/2), M_.FRAME); box("hpost2", (0.05, 0.05, ctx.HG.z), (-0.22, ctx.HG.y, ctx.HG.z/2), M_.FRAME); box("bpost", (0.07, 0.07, 0.30), (0, -0.55, 0.15), M_.FRAME); r.reset(); return
    # 평평한 벤치(머리·목은 끝 밖으로)
    ctx.O = V((0, 0, {'neckcurl': 0.46, 'neckext': 0.485}.get(m, 0.54))); R6 = bn_rots(C, 0.0, m); put(r, R6, BN_ANCH[m], ctx.O); ctx.H = wpt(r, *HJ)
    if m == 'neckext': box("bpad", (0.30, 1.20, 0.06), (0, 0.48, 0.43), M_.PAD, 0.02)
    elif m == 'neckside': box("bpad", (0.30, 1.30, 0.06), (0, -0.55, 0.43), M_.PAD, 0.02)
    else: box("bpad", (0.30, 1.20, 0.06), (0, -0.48, 0.43), M_.PAD, 0.02)
    yc = 0.48 if m == 'neckext' else -0.55; box("bframe", (0.08, 1.1, 0.05), (0, yc, 0.375), M_.FRAME); [box("bpost", (0.07, 0.07, 0.35), (0, yc+d_, 0.175), M_.FRAME) for d_ in (-0.45, 0.45)]
    r.reset()
def bn(r, t, ctx):
    C = ctx.C; m = C['mode']; u = timing(t); R6 = bn_rots(C, u, m); fixed = []
    if m == 'ghd':   # GHD: 발을 롤러에 걸고 엉덩이를 패드에 둔 채 상체를 뒤로 수평까지 눕혔다 일으킨다
        put(r, R6, HJ, ctx.H)
        for s, sg in SIDES: r.leg_ik(s, ctx.A[s], V((sg*0.1, -0.3, 1)), V((0, -1, 0)), 0.0); set_foot(r, s, 112.0)
        arms_cross(r, R6[3]); return dict(bar=None, load=[], fixed=['foot_l', 'foot_r'])
    if m == 'ball':   # 짐볼에 등허리를 대고 젖혔다가 말아 올린다, 발은 바닥
        ball_put(r, ctx, R6); hands_head(r, R6[5], 0.9)
        for s, sg in SIDES: floor_feet(r, s, sg, ctx.FT[s], V((sg*0.3, -0.4, 1)))
        return dict(bar=None, load=[], fixed=['foot_l', 'foot_r'])
    if m in ('dsit', 'dcrunch'):
        put(r, R6, HJ, ctx.H)
        for s, sg in SIDES: r.leg_ik(s, ctx.A[s], ctx.K[s]-(ctx.H+ctx.A[s])/2, V((0, -1, 0)), 0.0); set_foot(r, s, 117.0)
        if m == 'dsit': arms_cross(r, R6[3])
        else: hands_head(r, R6[5], 0.9)
        return dict(bar=None, load=[], fixed=['foot_l', 'foot_r'])
    if m == 'dlegraise':   # 곧은 다리를 들어 엉덩이를 말아 올린다
        put(r, R6, UBACK, ctx.O)
        for s, sg in SIDES:
            free_leg(r, s, sg, R6[0], lerp(8, 98, u), 4.0, 3.0, 140.0); G = ctx.HG+V((sg*0.13, 0, 0)); F = (R6[3]@V((0, 0.3, 1))).normalized(); r.arm(s, G, F, R6[3]@V((sg*1, -0.3, 0.2)), None, 0.9995); r.fingers(s)
        return dict(bar=None, load=[], fixed=['spine_03'])
    put(r, R6, BN_ANCH[m], ctx.O); H = wpt(r, *HJ)
    if m == 'neckcurl':   # 바로 누워 머리를 벤치 끝 밖으로, 턱을 가슴으로 당긴다
        for s, sg in SIDES: floor_feet(r, s, sg, V((sg*0.22, H.y-0.50, r.ANK_Z)), V((sg*0.3, -0.4, 1)))
        arms_cross(r, R6[3]); fixed = ['pelvis', 'foot_l', 'foot_r']
    elif m == 'neckext':   # 엎드려 머리를 벤치 끝 밖으로, 숙인 머리를 뒤로 젖혀 든다
        for s, sg in SIDES:
            free_leg(r, s, sg, R6[0], 2.0, 4.0, 3.0, 150.0); S = r.chain_head('upperarm_'+s); G = S+V((sg*0.08, 0.02, -(r.L_U+r.L_F)*0.80)); F = V((0, 0, -1)); r.arm(s, G, F, V((sg*0.4, 0.8, 0)), V((0, -1, 0)), 0.9995); r.fingers(s, 0.8)
        fixed = ['pelvis']
    else:   # 옆으로 누워 머리를 벤치 끝 밖으로, 아래로 떨군 머리를 천장 쪽으로 옆으로 든다
        free_leg(r, 'l', 1, R6[0], 4.0, 6.0, 0.0, 125.0); free_leg(r, 'r', -1, R6[0], 4.0, 6.0, 0.0, 125.0)
        G = wpt(r, 'pelvis', V((-0.215, -0.02, 1.02))); r.arm('r', G, (R6[3]@V((0.2, -0.3, -1))).normalized(), R6[3]@V((-1, 0.3, 0)), None, 0.9995); r.fingers('r', 0.2)
        S = r.chain_head('upperarm_l'); G = S+V((0.30, 0.16, 0.02)); r.arm('l', G, V((0.2, 1, 0)).normalized(), V((1, -0.3, 0.3)), V((0, 0, 1)), 0.9995); r.fingers('l', 0.4)   # 아래 팔은 가슴 앞 벤치 가장자리를 짚는다
        fixed = ['pelvis']
    return dict(bar=None, load=[], fixed=fixed)

# ════ 무릎 꿇고(롤아웃 휠·바벨, 케이블 크런치, 앱 코스터) ════
KN = dict(mode='rollout', equip='wheel')
KZ_ = 0.105   # 꿇은 무릎 관절 높이
def kn_legs(r):
    """무릎을 바닥에 꿇고 발끝을 세운다(앞꿈치 자리를 정강이 길이로 이분법)."""
    for s, sg in SIDES:
        H = r.chain_head('thigh_'+s); kneel = r.KN[s]; bz = r.head0('ball_'+s).z+0.016; lo, hi = kneel.y, kneel.y+r.L_S*1.3
        for _ in range(30):
            yb = (lo+hi)/2; Ab = r.ankle_from_ball(s, V((kneel.x, yb, bz)), 0.0, 62.0)
            if (Ab-kneel).length < r.L_S*0.999: lo = yb
            else: hi = yb
        r.leg(s, kneel, Ab, V((0, -1, 0)), 0.0, 62.0, True)
def kn_body(r, phi, R6):
    """허벅지를 앞으로 phi 기울여 엉덩이를 무릎 위에 두고 몸통을 놓는다."""
    H0 = r.HIP_OFF+r.head0('pelvis'); Hc = V((0, 0, KZ_))+V((0, -math.sin(math.radians(phi)), math.cos(math.radians(phi))))*r.L_T*0.998
    put(r, R6, ('pelvis', V((0, H0.y, H0.z))), Hc)
    if not hasattr(r, 'KN'): r.KN = {s: V((r.chain_head('thigh_'+s).x, 0, KZ_)) for s, _ in SIDES}
    th = V((0, -math.sin(math.radians(phi)), math.cos(math.radians(phi))))
    for s, sg in SIDES:   # 무릎 자리는 고정, 엉덩이 너비만 맞춘다
        r.KN[s] = V((r.chain_head('thigh_'+s).x, 0, KZ_))
    kn_legs(r)
def kn_setup(ctx):
    C = dict(KN); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; m = C['mode']; local_pts(ctx); r.reset()
    if hasattr(r, 'KN'): del r.KN
    if m == 'rollout':
        if C['equip'] == 'wheel': ctx.GZ_ = 0.095; ctx.WH = cyl("wheel", 0.095, 0.07, M_.RUBBER); ctx.WA = cyl("whandle", 0.016, 0.36, M_.STEEL); ctx.HUBo = cyl("whub", 0.035, 0.09, M_.HUB)
        else: ctx.GZ_ = PLATE_R; ctx.BAR = barbell(ctx.col, M_)
    elif m == 'cablecrunch':
        ctx.PUL = V((0, -0.72, 2.05)); box("stack", (0.30, 0.26, 2.20), (0, -0.98, 1.10), M_.FRAME); box("pulley", (0.08, 0.10, 0.08), (0, -0.80, 2.05), M_.FRAME); ctx.W = wire(ctx); ctx.H = cyl("rope", 0.014, 0.16, M_.RUBBER)
    else:   # 앱 코스터: 손잡이 기둥, 곡선 레일, 무릎 받침(움직임)
        ctx.SM = V((0, -0.35, 1.02)); ctx.CAR = box("carriage", (0.36, 0.42, 0.06), (0, 0, 0.5), M_.PAD, 0.02)
        for sg in (-1, 1): box("post", (0.05, 0.05, 0.62), (sg*0.21, -0.48, 0.31), M_.FRAME); box("grip", (0.05, 0.14, 0.04), (sg*0.21, -0.44, 0.62), M_.FRAME)
        box("rail", (0.10, 1.10, 0.05), (0, 0.20, 0.08), M_.FRAME)
    r.reset()
def kn(r, t, ctx):
    C = ctx.C; m = C['mode']; u = timing(t); load = []; bar = None
    if m == 'rollout':   # 꿇어앉아 어깨 아래의 바퀴(바벨)를 앞으로 굴려 몸을 길게 폈다가 배로 끌어당긴다
        phi = lerp(0.0, 58.0, u); R6 = rots(I3, pel=lerp(66, 80, u), c=lerp(10, 2, u), nk=lerp(-14, -22, u)); kn_body(r, phi, R6)
        Sm = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2; Rch = (r.L_U+r.L_F)*0.985+0.06; Gz = ctx.GZ_; dz = Sm.z-Gz; Gy = Sm.y-sqrt0(Rch*Rch-dz*dz)
        Gm = V((0, Gy, Gz)); gw = 0.10 if C['equip'] == 'wheel' else 0.24
        for s, sg in SIDES:
            G = Gm+V((sg*gw, 0, 0)); ad = (G-r.chain_head('upperarm_'+s)).normalized(); F = (ad+V((0, -0.9, 0))).normalized(); r.arm(s, G, F, V((sg*1, 0.5, 0)), V((-sg, 0, 0)), 0.9995); r.fingers(s, 0.9)
        if C['equip'] == 'wheel':
            for o in (ctx.WH, ctx.WA, ctx.HUBo): o.location = Gm
            ctx.WH.rotation_euler = (-Gy/0.095, math.pi/2, 0); load.append((Gm, 1.0))
        else: ctx.BAR.location = Gm; bar = Gm; load.append((Gm, BAR_KG))
        return dict(bar=bar, load=load, fixed=['calf_l', 'calf_r', 'ball_l', 'ball_r'])
    if m == 'cablecrunch':   # 머리 옆에 로프를 쥐고 엉덩이는 둔 채 척추를 말아 팔꿈치를 허벅지 쪽으로
        R6 = rots(I3, pel=lerp(18, 30, u), c=lerp(4, 64, u), nk=lerp(6, 14, u)); kn_body(r, lerp(4.0, -2.0, u), R6); Rh = R6[5]; Hd = r.chain_head('head')+Rh@V((0, 0, 0.09))
        for s, sg in SIDES: G = Hd+Rh@V((sg*0.11, -0.05, -0.08)); r.arm(s, G, Rh@V((0, -0.25, 1)).normalized(), Rh@V((sg*1.2, 0.0, -0.8)), Rh@V((0, 1, 0)), 0.9995); r.fingers(s, 0.9)
        Gm = Hd+Rh@V((0, -0.07, -0.02)); ctx.H.location = Gm; wire_to(ctx.W, Gm, ctx.PUL); load.append((Gm, 25.0))
        return dict(bar=None, load=load, fixed=['calf_l', 'calf_r', 'ball_l', 'ball_r'])
    # 앱 코스터: 손잡이를 쥐고 어깨는 둔 채, 무릎 받침을 레일 따라 가슴 쪽으로 끌어올린다
    R6 = rots(I3, pel=lerp(62, 92, u), c=lerp(4, 40, u), nk=lerp(-20, -36, u)); sh_place(r, R6, ctx.SM, None)
    K = {}
    for s, sg in SIDES: K[s], A = free_leg(r, s, sg, R6[0], lerp(20, 112, u), 92.0, 2.0, 135.0)
    for s, sg in SIDES:
        G = V((sg*0.21, -0.44, 0.645)); r.arm(s, G, V((0, -0.6, -1)).normalized(), V((sg*1, 0.6, 0)), V((-sg, 0, 0)), 0.9995); r.fingers(s, 0.9)
    Km = (K['l']+K['r'])/2; sh = (A-K['l']).normalized(); a_ = math.atan2(sh.z, sh.y); nrm = V((0, -math.sin(a_), math.cos(a_)))   # 받침 윗면이 정강이 아래에 나란히
    ctx.CAR.location = Km+sh*0.16-nrm*0.085; ctx.CAR.rotation_euler = (a_, 0, 0)
    return dict(bar=None, load=[], fixed=[])

# ════ 서서 옆으로(윈드밀 덤벨·케틀벨, 케틀벨 벤트 프레스, 케이블 사이드 크런치) ════
WM = dict(mode='windmill', equip='kb', ax=0.22, yaw=35.0)
def kb_over(o, G, F, lat):
    """머리 위로 든 케틀벨: 손잡이 윗부분을 쥐고 공은 아래팔 뒤에 얹힌다."""
    n = F.cross(lat).normalized(); d = (-F*0.45-n).normalized(); z = -d; x = (lat-z*lat.dot(z)).normalized(); y = z.cross(x)
    R = Matrix((x, y, z)).transposed(); place_obj(o, G-R@V((0, 0, 0.062)), R)
def wm_setup(ctx):
    C = dict(WM); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; m = C['mode']; local_pts(ctx)
    if m == 'sidecrunch':   # 오른쪽 높은 도르래
        ctx.PUL = V((-0.70, -0.04, 2.15)); box("stack", (0.26, 0.30, 2.25), (-0.90, -0.04, 1.12), M_.FRAME); box("pulley", (0.08, 0.08, 0.08), (-0.74, -0.04, 2.15), M_.FRAME); ctx.W = wire(ctx); ctx.H = cyl("handle", 0.016, 0.13, M_.STEEL, axis='Z')
    elif C['equip'] == 'db': ctx.DB = {'r': dumbbell(ctx, "db_r")}
    else: ctx.KB = kettlebell(ctx, "kb")
def wm(r, t, ctx):
    C = ctx.C; m = C['mode']; u = timing(t); load = []
    if m == 'sidecrunch':   # 오른쪽 위 도르래 손잡이를 귀 옆에 쥐고 오른쪽으로 옆구리를 접어 내린다
        sd = lerp(6.0, -26.0, u); R6 = rots(I3, side=sd, nk=lerp(0, -4, u), hd=-sd*0.2); P = stand_P(r, 0.15); P.x += -sd*0.0015; r.torso(P, *R6); fixed = plant(r, 0.15)
        Rh = R6[5]; Hd = r.chain_head('head')+Rh@V((0, 0, 0.09)); G = Hd+Rh@V((-0.13, -0.02, 0.02)); F = (ctx.PUL-G).normalized()
        r.arm('r', G, F, R6[3]@V((-1, 0.2, -0.6)), V((0, -1, 0)), 0.9995); r.fingers('r', 0.9); ctx.H.location = G; wire_to(ctx.W, G, ctx.PUL); load.append((G, 15.0))
        Gl = wpt(r, 'pelvis', V((0.215, -0.02, 1.02))); r.arm('l', Gl, (R6[0]@V((-0.2, -0.3, -1))).normalized(), R6[3]@V((1, 0.3, 0)), None, 0.9995); r.fingers('l', 0.2)
        return dict(bar=None, load=load, fixed=fixed)
    # 윈드밀: 두 발끝을 왼쪽으로 돌려 서서, 오른손 무게를 머리 위에 곧게 둔 채 엉덩이를 오른쪽 뒤로 빼며 왼손을 왼다리 안쪽으로 내린다
    ax = C['ax']; yw = C['yaw']; bp = m == 'bentpress'; w = u
    B = Rz(lerp(12, 48, w))   # 골반을 왼발 쪽으로 돌리며 접고, 가슴은 비틀어 앞(무게 쪽)을 연다
    R6 = rots(B, pel=lerp(0, 52, w), c=lerp(0, 12, w), side=lerp(0, 16, w), tw=lerp(-12, -40, w), nk=lerp(0, -8, w), hd=lerp(0, -8, w), k=(0.3, 0.65, 1.0))
    P = stand_P(r, ax, 0.0, 0.985); P = P+V((-0.11*w, 0.10*w, -0.09*w)); r.torso(P, *R6)
    for s, sg in SIDES: r.leg_ik(s, V((sg*ax, r.ANK_Y, r.ANK_Z)), Rz(yw)@V((sg*0.25, -1, 0)), Rz(yw)@V((0, -1, 0)), yw)
    fixed = ['foot_l', 'foot_r']
    S = r.chain_head('upperarm_r'); Rch = (r.L_U+r.L_F)*0.97
    if bp: G = S+V((0.03, -0.04, lerp(0.20, Rch, sstep(0.05, 0.9, u))))   # 벤트 프레스: 랙에서 시작해 몸이 무게 아래로 내려가며 팔이 펴진다
    F = V((0, 0.15, 1)).normalized(); lat = R6[3]@V((1, -0.6, 0)); lat = (lat-F*lat.dot(F)).normalized()
    if not bp: G = grip_w(r, 'r', S+V((0, 0, (r.L_U+r.L_F)*0.993)), F, lat)   # 윈드밀은 팔을 끝까지 편다
    pole = R6[3]@(V((-0.6, 0.4, -1)).lerp(V((0.2, 1, 0)), sstep(0.05, 0.9, u)) if bp else V(C.get('pole', (-1, 0.3, 0))))
    r.arm('r', G, F, pole, lat, 0.9995); r.fingers('r', 0.9)
    if C['equip'] == 'db': hold(ctx, 'r', G, lat); load.append((G, DB_KG))
    else: kb_over(ctx.KB, G, F, lat); load.append((G, KB_KG))
    Hl = r.chain_head('thigh_l'); Kl = r.chain_head('calf_l'); Al = r.chain_head('foot_l'); fw = Rz(yw)@V((0, -1, 0)); q = lerp(0.62, 1.55, w)
    Sl = r.chain_head('upperarm_l'); Rl = (r.L_U+r.L_F)*0.95
    while True:   # 왼손은 왼다리 앞쪽을 따라 미끄러져 내려간다(닿는 데까지)
        Pt = Hl.lerp(Kl, q) if q <= 1 else Kl.lerp(Al, q-1); Gl = Pt+fw*0.02+V((0.125, 0, 0))
        if (Gl-Sl).length <= Rl or q <= 0.0: break
        q -= 0.02
    r.arm('l', Gl, (V((0, 0, -1))+fw*0.2).normalized(), V((1, 0.25, 0.1)), None, 0.9995); r.fingers("l", 0.3)
    return dict(bar=None, load=load, fixed=fixed)

# ════ 앉아서(복근 크런치 머신, 목 신전 머신, 머리 하네스 넥 익스텐션) ════
SE = dict(mode='crunchm')
def link(ctx, name, r_=0.022):
    return cyl(name, r_, 1.0, ctx.mats.FRAME, axis='Z', verts=16)
def se_setup(ctx):
    C = dict(SE); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; m = C['mode']; local_pts(ctx); r.reset()
    hip = r.ANK_Z+r.L_S+0.015; ctx.HZ = hip; ctx.P = V((0, 0.0, hip-r.HIP_OFF.z)); T = hip-0.105; ctx.T = T
    box("seat", (0.40, 0.42, 0.07), (0, 0.0 if m != 'harness' else 0.10, T-0.035), M_.PAD, 0.024); box("stem", (0.09, 0.09, T-0.07), (0, 0.0, (T-0.07)/2), M_.FRAME); box("ft", (0.56, 0.09, 0.04), (0, 0.0, 0.02), M_.FRAME)
    if m == 'crunchm':   # 등받이 + 엉덩이 옆 축에서 도는 손잡이 팔
        box("back", (0.34, 0.07, 0.62), (0, 0.21, T+0.42), M_.PAD, 0.024); box("bstem", (0.08, 0.08, T+0.12), (0, 0.27, (T+0.12)/2), M_.FRAME)
        ctx.PIV = {s: V((sg*0.37, 0.02, hip+0.02)) for s, sg in SIDES}; [box("piv", (0.06, 0.06, hip+0.02), (sg*0.37, 0.02, (hip+0.02)/2), M_.FRAME) for s, sg in SIDES]
        ctx.LK = {s: link(ctx, "arm_"+s) for s, _ in SIDES}; ctx.HD = {s: cyl("hdl_"+s, 0.017, 0.16, M_.RUBBER) for s, _ in SIDES}
    elif m == 'neckm':   # 머리 뒤 패드가 목 높이 뒤 축에서 돈다
        box("back", (0.34, 0.07, 0.50), (0, 0.21, T+0.32), M_.PAD, 0.024); box("bstem", (0.08, 0.08, T+0.12), (0, 0.27, (T+0.12)/2), M_.FRAME)
        ctx.PIV = V((0, 0.32, 1.30)); box("tower", (0.10, 0.10, 1.34), (0, 0.36, 0.67), M_.FRAME); ctx.LK = link(ctx, "lever"); ctx.HP = box("hpad", (0.20, 0.06, 0.14), (0, 0, 1), M_.PAD, 0.024)
        [box("hdl", (0.04, 0.12, 0.04), (sg*0.27, -0.16, T+0.16), M_.RUBBER) for sg in (-1, 1)]; [box("hpost", (0.04, 0.04, T+0.14), (sg*0.27, -0.10, (T+0.14)/2), M_.FRAME) for sg in (-1, 1)]
    else:   # 머리 하네스에 원판을 매단다
        ctx.PLT = cyl("plate", 0.14, 0.03, M_.RUBBER, axis='Y'); ctx.CH = link(ctx, "chain", 0.005)
    r.reset()
def se(r, t, ctx):
    C = ctx.C; m = C['mode']; u = timing(t); P = ctx.P; load = []
    if m == 'crunchm': R6 = rots(I3, pel=lerp(0, 10, u), c=lerp(0, 44, u), nk=lerp(0, 10, u)); kx = 0.17
    elif m == 'neckm': R6 = rots(I3, pel=2.0, c=2.0, nk=lerp(22, -26, u), hd=lerp(6, -8, u)); kx = 0.18
    else: R6 = rots(I3, pel=36.0, c=12.0, nk=lerp(33, -12, u), hd=lerp(18, -10, u)); kx = 0.30
    r.torso(P, *R6)
    K = {}
    for s, sg in SIDES: r.leg_ik(s, V((sg*kx, P.y-r.L_T*0.95, r.ANK_Z)), V((sg*0.15, -0.5, 1)), Rz(sg*14)@V((0, -1, 0)), sg*14); K[s] = r.chain_head('calf_'+s)
    R3 = R6[3]; Rh = R6[5]
    if m == 'crunchm':   # 머리 옆 손잡이를 쥐고 등을 둥글게 말아 가슴을 골반 쪽으로
        for s, sg in SIDES:
            S = r.chain_head('upperarm_'+s); G = S+R3@V((sg*0.05, -0.14, 0.08)); F = (R3@V((0, -0.3, 1))).normalized(); r.arm(s, G, F, R3@V((sg*0.5, 0.1, -1)), R3@V((-sg, 0, 0)), 0.9995); r.fingers(s, 0.9)   # 어깨 앞 손잡이를 쥐고 팔꿈치는 아래로
            E = G+R3@V((sg*0.13, 0, 0)); ctx.HD[s].location = (G+E)/2; rot_to(ctx.HD[s], R3@V((1, 0, 0))); wire_to(ctx.LK[s], ctx.PIV[s], E); load.append((G, 20.0))
        return dict(bar=None, load=load, fixed=['pelvis', 'foot_l', 'foot_r'])
    Hd = r.chain_head('head')+Rh@V((0, 0, 0.09))
    if m == 'neckm':   # 숙인 머리로 뒤 패드를 밀어 목을 뒤로 젖힌다, 손은 옆 손잡이
        pd = Hd+Rh@V((0, 0.135, 0.01)); ctx.HP.location = pd; ctx.HP.rotation_euler = Rh.to_euler(); wire_to(ctx.LK, ctx.PIV, pd+Rh@V((0, 0.03, 0)))
        for s, sg in SIDES: G = V((sg*0.27, -0.16, ctx.T+0.205)); r.arm(s, G, V((0, -1, -0.2)).normalized(), V((sg*0.6, 0.6, -0.3)), V((0, 0, 1)), 0.9995); r.fingers(s, 0.9)
        load.append((pd, 15.0)); return dict(bar=None, load=load, fixed=['pelvis', 'foot_l', 'foot_r'])
    # 하네스: 무릎에 손을 짚고 숙여 앉아, 아래로 떨군 머리를 뒤로 든다(원판은 다리 사이로 늘어진다)
    fh = Hd+Rh@V((0, -0.10, 0.03)); pc = fh+V((0, 0, -0.42)); ctx.PLT.location = pc+V((0, 0, -0.0)); wire_to(ctx.CH, fh, pc+V((0, 0, 0.14))); load.append((pc, 10.0))
    for s, sg in SIDES: G = K[s]+V((sg*0.02, -0.01, 0.075)); r.arm(s, G, V((0, -0.4, -1)).normalized(), V((sg*1, 0.5, 0)), V((-sg, 0, 0)), 0.9995); r.fingers(s, 0.6)
    return dict(bar=None, load=load, fixed=['pelvis', 'foot_l', 'foot_r'])

# ════ 그 밖(45도 사이드 벤드, 리버스 플랭크, 인치웜) ════
MS = dict(mode='roman')
def ms_setup(ctx):
    C = dict(MS); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; m = C['mode']; local_pts(ctx); r.reset()
    if m == 'roman':   # 45도 기구: 오른 엉덩이 옆을 패드에, 발은 발판에 — 몸 선이 오른쪽으로 45도 기운다
        ctx.B = Ry(-45.0); ctx.HT = V((0, 0, 1.02)); R6 = rots(ctx.B); put(r, R6, ('pelvis', V((-0.18, 0.0, 0.93))), ctx.HT); n = ctx.B@V((-1, 0, 0)); ax = ctx.B@V((0, 0, 1))
        p = box("hpad", (0.08, 0.36, 0.26), tuple(ctx.HT+n*0.05-ax*0.10), M_.PAD, 0.02); p.rotation_euler = (0, math.radians(-45.0), 0)
        for s, sg in SIDES: free_leg(r, s, sg, R6[0], 2.0, 2.0, 2.0, 117.0)
        Am = (r.chain_head('foot_l')+r.chain_head('foot_r'))/2; fp = box("plat", (0.40, 0.42, 0.03), tuple(Am-ax*0.095+V((0, -0.06, 0))), M_.FRAME); fp.rotation_euler = (0, math.radians(-45.0), 0)
        rl = cyl("roll", 0.045, 0.34, M_.PAD, tuple(Am+ax*0.03+(ctx.B@V((0, 1, 0)))*0.10), axis='Y'); rl.rotation_euler = (math.pi/2, math.radians(-45.0), 0)
        box("post", (0.07, 0.07, 0.80), (ctx.HT.x-0.10, 0.12, 0.40), M_.FRAME); box("rail", (0.07, 0.07, 0.95), tuple((ctx.HT+Am)/2+V((0.10, 0.10, -0.10))), M_.FRAME).rotation_euler = (0, math.radians(-45.0), 0)
    elif m == 'revplank':   # 발뒤꿈치와 곧은 팔로 받친 뒤집은 플랭크 — 끝 자세(몸이 일직선)의 각을 미리 구한다
        Wz = 0.036+r.GRIP_N; ctx.SM = V((0, 0, Wz+(r.L_U+r.L_F)*0.975)); ctx.AZ = 0.085
        lo, hi = 0.0, 40.0
        for _ in range(30):
            a = (lo+hi)/2; R6 = rots(Rx(-90.0+a)); sh_place(r, R6, ctx.SM, None); H = (r.chain_head('thigh_l')+r.chain_head('thigh_r'))/2; d = (H-ctx.SM).normalized(); A = H+d*(r.L_T+r.L_S)*0.985
            if A.z > ctx.AZ: lo = a
            else: hi = a
        ctx.A0 = (lo+hi)/2; ctx.AY = A.y; ctx.HL = H.copy(); ctx.LG = (H-A).length; ctx.LS = (ctx.SM-H).length; ctx.RA = ctx.SM.z-Wz-0.02
        ctx.WP = {s: V((r.chain_head('upperarm_'+s).x+sg*0.01, r.chain_head('upperarm_'+s).y, 0.0)) for s, sg in SIDES}
    else:   # 인치웜: 끝 자세(높은 플랭크)를 미리 구한다
        ax = 0.10; ctx.BALL = {s: V((sg*ax, r.head0('ball_'+s).y, r.head0('ball_'+s).z)) for s, sg in SIDES}; ctx.AX = ax
        Wz = 0.036+r.GRIP_N; Sz = Wz+(r.L_U+r.L_F)*0.975; ctx.SZ = Sz; Ab = r.ankle_from_ball('l', ctx.BALL['l'], 0.0, 55.0); ctx.P0 = stand_P(r, ax)
        r.torso(ctx.P0, *rots(I3)); H0 = (r.chain_head('thigh_l')+r.chain_head('thigh_r'))/2; Sm0 = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2; Ls = (Sm0-H0).length; Lg = (r.L_T+r.L_S)*0.99
        lam = math.asin(max(0.0, min(0.9, (Sz-Ab.z)/(Lg+Ls)))); ctx.LAM = math.degrees(lam); ctx.H2 = V((0, Ab.y-math.cos(lam)*Lg, Ab.z+math.sin(lam)*Lg)); ctx.H0 = H0; ctx.YE = ctx.H2.y-Ls*math.cos(lam)
    r.reset()
def iw_hip_body(r, H, th, nk=0.0):
    H0 = r.HIP_OFF+r.head0('pelvis'); R6 = rots(I3, pel=th, c=0.0, nk=nk); put(r, R6, ('pelvis', V((0, H0.y, H0.z))), H); return R6
def ms(r, t, ctx):
    C = ctx.C; m = C['mode']; u = timing(t)
    if m == 'roman':   # 엉덩이 옆을 축으로 몸통을 바닥 쪽으로 옆으로 내렸다가 반대쪽으로 들어 올린다
        sd = lerp(-34.0, 14.0, u); R6 = rots(ctx.B, side=sd, nk=lerp(-4, 4, u)); put(r, R6, ('pelvis', V((-0.18, 0.0, 0.93))), ctx.HT)
        for s, sg in SIDES: free_leg(r, s, sg, R6[0], 2.0, 2.0, 2.0, 117.0)
        arms_cross(r, R6[3]); return dict(bar=None, load=[], fixed=['pelvis', 'foot_l', 'foot_r'])
    if m == 'revplank':   # 바로 누워 곧은 팔로 바닥을 짚고, 처진 엉덩이를 들어 어깨~발뒤꿈치를 일직선으로
        A = V((0, ctx.AY, ctx.AZ)); hz = ctx.HL.z-lerp(0.17, 0.0, u); Hy = A.y+sqrt0(ctx.LG**2-(hz-A.z)**2); H = V((0, Hy, hz))   # 다리는 곧게 발뒤꿈치에서, 엉덩이 높이만 처졌다가 오른다
        W = V((0, ctx.SM.y, ctx.SM.z-ctx.RA-0.02)); dv = W-H; D = dv.length; x_ = (D*D+ctx.LS**2-ctx.RA**2)/(2*D); h_ = sqrt0(ctx.LS**2-x_*x_); e_ = dv/D; nrm = V((0, -e_.z, e_.y)); S2 = H+e_*x_+nrm*h_; S1 = H+e_*x_-nrm*h_; Sx = S1 if S1.z > S2.z else S2   # 손 짚은 곳을 중심으로 팔이 돈다(어깨 = 두 원의 교점)
        a = math.degrees(math.atan2(Sx.z-H.z, Sx.y-H.y)); R6 = rots(Rx(-90.0+a), nk=lerp(10, 4, u)); H0 = r.HIP_OFF+r.head0('pelvis'); put(r, R6, ('pelvis', V((0, H0.y, H0.z))), H)
        for s, sg in SIDES:
            A = V((r.chain_head('thigh_'+s).x*0+sg*0.11, ctx.AY, ctx.AZ)); r.leg_ik(s, A, V((sg*0.1, 0.0, 1.0)), V((0, -0.3, 1)).normalized(), 0.0); set_foot(r, s, 134.0)
        for s, sg in SIDES: palm_floor(r, s, sg, ctx.WP[s].x, ctx.WP[s].y, V((sg*0.15, -1, 0)).normalized(), V((sg*0.4, 1, 0)))
        return dict(bar=None, load=[], fixed=['foot_l', 'foot_r'])
    # 인치웜: 선 자세에서 접어 손을 발 앞 바닥에 짚고, 손을 앞으로 걸어 나가 높은 플랭크까지
    A1 = u <= 0.5; v = sstep(0.0, 1.0, u/0.5) if A1 else sstep(0.0, 1.0, (u-0.5)/0.5)
    H1 = ctx.H0+V((0, 0.08, -0.21)); th1 = 128.0; th2 = 90.0-ctx.LAM
    if A1: H = ctx.H0.lerp(H1, v); th = lerp(0, th1, v); pitch = 0.0
    else: H = H1.lerp(ctx.H2, v); H.z += 0.10*math.sin(math.pi*v); th = lerp(th1, th2, v); pitch = lerp(0, 55, v)
    A = {s: r.ankle_from_ball(s, ctx.BALL[s], 0.0, pitch) for s, _ in SIDES}; Lg = (r.L_T+r.L_S)*0.993
    Hm = V((0, H.y, H.z)); Am = (A['l']+A['r'])/2
    if (Hm-Am).length > Lg: Hm = Am+(Hm-Am).normalized()*Lg
    R6 = iw_hip_body(r, Hm, th, lerp(0, -20, u))
    for s, sg in SIDES: r.leg_ik(s, A[s], V((sg*0.1, -1, 0)), V((0, -1, 0)), 0.0, pitch, True)
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s); Rr = (r.L_U+r.L_F)*0.975; Wz = 0.036+r.GRIP_N; dz = S.z-Wz
        yw = -0.42 if A1 else lerp(-0.42, ctx.YE, v); hz_ = sqrt0(Rr*Rr-dz*dz)*0.96; yw = max(min(yw, S.y-0.02), S.y-hz_)   # 발 앞 바닥(y=-0.42)에 짚고, 손을 걸어 나가 어깨 아래까지(팔 길이 안에서)
        Wf = V((S.x+sg*0.01, yw, Wz)) if dz < Rr*0.97 else V((S.x+sg*0.01, S.y-0.02, S.z-Rr*0.97))
        Wd = S+(R6[3]@V((0, -0.25, -1))).normalized()*Rr*0.99; Wd.z = max(Wd.z, Wz)   # 늘어뜨린 손 → 바닥 짚기를 같은 손 방향 규칙으로 섞는다
        wg = 1.0 if not A1 else sstep(0.0, 1.0, v)
        W = Wd.lerp(Wf, wg); F = V((sg*0.15, -1, -0.6)).lerp(V((sg*0.15, -1, 0.0)), wg).normalized()
        G = grip_w(r, s, W, F, None); r.arm(s, G, F, V((sg*0.6, 0.8, 0.3)), None, 0.9995); r.fingers(s, lerp(0.1, 0.0, wg))
    return dict(bar=None, load=[], fixed=['ball_l', 'ball_r'])

SOLVERS = {'su': (su_setup, su), 'pl': (pl_setup, pl), 'hg': (hg_setup, hg), 'sp': (sp_setup, sp), 'st': (st_setup, st), 'bn': (bn_setup, bn), 'kn': (kn_setup, kn), 'wm': (wm_setup, wm), 'se': (se_setup, se), 'ms': (ms_setup, ms)}
