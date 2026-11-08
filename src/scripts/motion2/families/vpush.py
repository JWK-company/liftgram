# SPDX-License-Identifier: GPL-3.0-or-later
"""위로 밀기 묶음 계산식(SPEC-040 Phase 6): 머리 위 프레스(서서·앉아서·바닥)·푸시 프레스·랜드마인·파이크/물구나무. 변형은 catalog 의 vars 로 고른다.
좌표: X 왼쪽+, -Y 앞, Z 위. Rx(+)=앞으로 숙임. t 0=시작(어깨 높이), 1=반대쪽 자세(팔을 편 위)."""
import math
from mathutils import Vector as V, Quaternion
from rig import Rx, Ry, Rz, lerp, sstep, sqrt0
from scene import PLATE_R, barbell, box, cyl
from families.reps import (SIDES, BAR_KG, DB_KG, timing, dumbbell, hold, rot_to, wire, wire_to, grip_w, jointed, hang, stand_P, plant)
from families.squat_lunge import kettlebell, place_obj, local_pts, W_, KB_KG

def kb_place(r, ctx, s, G, F, up=False):
    """케틀벨: 손잡이를 쥐고 종은 손목 바깥쪽 아래(랙) 또는 손 위(보텀스업)."""
    sg = 1 if s == 'l' else -1; Fw, Lw, nw = r.grip_frame(s, F)
    d = Fw.normalized() if up else (-Fw*0.3+V((sg, 0, 0))*0.95).normalized()
    place_obj(ctx.KB[s], G+V((sg*0.06, 0, 0)) if not up else G, None); ctx.KB[s].rotation_mode = 'QUATERNION'; ctx.KB[s].rotation_quaternion = d.to_track_quat('-Z', 'Y')

# ════ 머리 위 프레스 ════
# pose stand·seat·floor, load bar·behind·smith·db·kb·bottomsup·band·cable·arnold·bradford, push 푸시 프레스(무릎 딥)
OP = dict(pose='stand', load='bar', grip=0.26, push=False, T=0.46)
def op_setup(ctx):
    C = dict(OP); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; local_pts(ctx); ld = C['load']
    if C['pose'] == 'seat':
        hip = r.ANK_Z+r.L_S+0.015; off = r.HIP_OFF; ctx.P = V((0, 0.0, hip-off.z)); T = hip-0.105; ctx.T = T
        box("seat", (0.40, 0.40, 0.07), (0, -0.04, T-0.035), M_.PAD, 0.024); box("stem", (0.09, 0.09, T-0.07), (0, -0.04, (T-0.07)/2), M_.FRAME); box("ft", (0.56, 0.09, 0.04), (0, -0.04, 0.02), M_.FRAME)
        box("back", (0.32, 0.07, 0.62), (0, 0.205, T+0.40), M_.PAD, 0.024); box("bstem", (0.08, 0.08, T+0.10), (0, 0.27, (T+0.10)/2), M_.FRAME); box("ft2", (0.56, 0.09, 0.04), (0, 0.27, 0.02), M_.FRAME)
    elif C['pose'] == 'floor':
        off = r.HIP_OFF; ctx.P = V((0, 0.0, 0.105-off.z)); box("mat", (0.70, 1.60, 0.012), (0, -0.40, 0.006), M_.PAD, 0.004)
    if ld in ('bar', 'behind', 'smith', 'bradford'): ctx.BAR = barbell(ctx.col, M_)
    if ld == 'smith':
        ctx.RY = r.head0('upperarm_l').y+(0.07 if C.get('behind') else -0.16)
        for sg in (-1, 1): box("rail", (0.05, 0.05, 2.30), (sg*0.66, ctx.RY, 1.15), M_.FRAME)
    if ld in ('db', 'arnold'): ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
    if ld in ('kb', 'bottomsup'): ctx.KB = {s: kettlebell(ctx, "kb_"+s) for s, _ in SIDES}
    if ld == 'band': ctx.BD = {s: wire(ctx, "band") for s, _ in SIDES}
    if ld == 'cable':
        ctx.W = {s: wire(ctx) for s, _ in SIDES}; ctx.HD = {s: cyl("hdl_"+s, 0.016, 0.13, M_.STEEL, verts=24) for s, _ in SIDES}
        for sg in (-1, 1): box("pulley", (0.16, 0.16, 0.30), (sg*0.62, 0.10, 0.15), M_.FRAME)
def op_body(r, ctx, C, u, th):
    """골반과 다리. 푸시 프레스는 무릎을 굽혔다(딥) 튕겨 편다."""
    ax = 0.15; dip = 0.0
    if C['push']: dip = 0.085*math.sin(math.pi*min(1.0, u/0.42))
    if C['pose'] == 'stand':
        P = stand_P(r, ax)-V((0, 0, dip)); r.torso(P, Rx(th), neck=Rx(th*0.5), head=Rx(th*0.3), scap={s: (lerp(0.0, 3.0, u), lerp(1.0, 0.0, u)) for s, _ in SIDES}); fixed = plant(r, ax, knee=(lambda sg: V((sg*0.25, -1, 0))) if C['push'] else None)
    elif C['pose'] == 'seat':
        P = ctx.P; r.torso(P, Rx(th), neck=Rx(th*0.5), head=Rx(th*0.3), scap={s: (lerp(0.0, 3.0, u), lerp(1.0, 0.0, u)) for s, _ in SIDES}); fixed = ['pelvis', 'foot_l', 'foot_r']
        for s, sg in SIDES: r.leg_ik(s, V((sg*0.20, P.y-r.L_T*0.97, r.ANK_Z)), V((sg*0.15, -0.5, 1)), Rz(sg*8)@V((0, -1, 0)), sg*8)
    else:   # 바닥에 앉아 다리를 앞으로 편다(Z 프레스)
        P = ctx.P; r.torso(P, Rx(th), neck=Rx(th*0.5), head=Rx(th*0.3), scap={s: (lerp(0.0, 3.0, u), lerp(1.0, 0.0, u)) for s, _ in SIDES}); fixed = ['pelvis', 'foot_l', 'foot_r']
        for s, sg in SIDES:
            H = r.chain_head('thigh_'+s); L = (r.L_T+r.L_S)*0.985; dz = H.z-0.085; A = V((sg*0.13, H.y-sqrt0(L**2-dz**2-(sg*0.13-H.x)**2), 0.085)); r.leg_ik(s, A, V((0, 0, 1)), V((0, -0.2, 1)).normalized(), 0.0, -58.0)
    return P, dip, fixed
def ohp2(r, t, ctx):
    C = ctx.C; u = timing(t); ld = C['load']
    if ld == 'bradford': u = math.sin(math.pi*timing(t)/2)   # 앞 → 머리 위 → 뒤(왕복)
    th = {'behind': 4.0, 'bradford': 2.0}.get(ld, lerp(-3.0, 0.5, u)) if C['pose'] == 'stand' else (-4.0 if C['pose'] == 'seat' else 1.0)
    pu = sstep(0.30, 1.0, u) if C['push'] else u   # 푸시 프레스: 딥이 끝난 뒤 민다
    P, dip, fixed = op_body(r, ctx, C, u, th); S = r.chain_head('upperarm_l'); load = []
    if ld in ('bar', 'behind', 'smith', 'bradford'):
        grip = C['grip']; top = S.z+sqrt0(((r.L_U+r.L_F)*0.990)**2-(grip-S.x)**2)+r.GRIP_F
        if ld == 'bar': y0, y1, z0 = S.y-0.135, S.y-0.015, S.z+0.03
        elif ld == 'smith': y0, y1, z0 = ctx.RY, ctx.RY, S.z+0.05; top = S.z+sqrt0(((r.L_U+r.L_F)*0.975)**2-(grip-S.x)**2-(ctx.RY-S.y)**2)+r.GRIP_F*0.8
        else: y0, y1, z0 = S.y+0.10, S.y+0.01, S.z+0.12   # 목 뒤(귀 높이까지)
        if ld == 'bradford':   # 앞 랙 높이 → 머리 위(반쯤) → 목 뒤
            ym = S.y-0.20+0.30*sstep(0.15, 0.85, u); zm = S.z+0.06+0.42*math.sin(math.pi*u); bar = V((0, ym, zm))
        else: bar = V((0, lerp(y0, y1, pu**(1.5 if ld != 'behind' and not C.get('behind') else 2.5))-(0.06*math.sin(math.pi*pu) if ld == 'bar' else 0.0), lerp(z0, top, pu)))   # 얼굴을 비켜 앞으로 호(0.035 는 바가 턱을 스쳤다)
        ctx.BAR.location = bar; load = [(bar, BAR_KG)]
        front = ld == 'bar' or (ld == 'smith' and not C.get('behind'))
        F = V((0, lerp(0.42, 0.0, pu) if front else lerp(0.10, 0.0, pu), 1)).normalized()
        for s, sg in SIDES:
            pole = V((sg*lerp(0.55, 0.8, pu), lerp(-0.55, 0, pu), -0.65)) if front else V((sg*0.6, 0.0, -1.0))
            r.arm(s, bar+V((sg*grip, 0, 0)), F, pole, None, 0.9995); r.fingers(s)
        return dict(bar=bar, load=load, fixed=fixed)
    for s, sg in SIDES:
        Ss = r.chain_head('upperarm_'+s); reach = (r.L_U+r.L_F)*0.985
        if ld == 'arnold':   # 손바닥이 얼굴을 보다가 돌리며 민다(꼭대기에서도 팔을 다 펴지 않는다 — 편 팔은 위팔 비틀림이 튄다)
            reach = (r.L_U+r.L_F)*0.95
            B = Ss+V((-sg*0.06, -0.20, 0.02)); Tp = Ss+V((sg*0.03, -0.02, 0.0)); Tp.z = Ss.z+sqrt0(reach**2-0.03**2-0.02**2)+r.GRIP_F*0.6
            phi = math.radians(lerp(165.0, 0.0, sstep(0.35, 0.85, pu))); L0 = V((-sg, 0, 0)); lat = (L0*math.cos(phi)+V((0, 1, 0))*math.sin(phi)).normalized()   # 두 손 모두 +Y 쪽으로 돈다(sg 를 곱하면 한쪽이 반대로 넘어가 비틀림이 튄다)
            G = B.lerp(Tp, pu); F = V((0, lerp(-0.1, 0.0, pu), 1)).normalized(); pole = V((sg*lerp(0.15, 0.9, pu), lerp(-1, 0, pu), -0.6))
        else:
            B = Ss+V((sg*0.22, -0.06, 0.18)); Tp = Ss+V((-sg*0.04, -0.01, 0.0)); Tp.z = Ss.z+sqrt0(reach**2-0.04**2-0.01**2)+r.GRIP_F*0.6
            G = B.lerp(Tp, pu); F = V((0, 0.0, 1)); lat = None; pole = V((sg*0.9, -0.2, -0.5))
            if ld in ('kb', 'bottomsup'): lat = V((-sg*lerp(1.3, 2.0, pu), -1, 0)).normalized(); B = Ss+V((sg*0.10, -0.16, 0.06)); G = B.lerp(Tp, pu); pole = V((sg*lerp(0.6, 0.9, pu), lerp(-0.6, 0.0, pu), -0.6))   # 랙: 중립 그립, 팔꿈치 앞
        G = G-V((0, 0, dip*(1-pu))) if C['push'] else G
        r.arm(s, G, F, pole, lat, 0.9995); r.fingers(s)
        if ld in ('db', 'arnold'): Fw, Lw, nw = r.grip_frame(s, F, lat); hold(ctx, s, G, Lw); load.append((G, DB_KG))
        if ld in ('kb', 'bottomsup'): kb_place(r, ctx, s, G, F, ld == 'bottomsup'); load.append((G, KB_KG))
        if ld == 'band': wire_to(ctx.BD[s], G, V((sg*0.16, r.ANK_Y-0.02, 0.03)))
        if ld == 'cable': ctx.HD[s].location = G; rot_to(ctx.HD[s], V((1, 0, 0))); wire_to(ctx.W[s], G+V((sg*0.06, 0, 0)), V((sg*0.62, 0.10, 0.28)))
    return dict(bar=None, load=load, fixed=fixed)

# ════ 랜드마인: 바 한쪽 끝이 바닥 축에 꽂혀 호를 그린다 ════
# mode one(한 손)·squeeze(두 손 모음)·viking(손잡이 두 손)·squat(스쿼트 후 프레스)·rot(180 회전)
LM = dict(mode='one', blen=1.95)
def lm_setup(ctx):
    C = dict(LM); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; local_pts(ctx)
    ctx.PIV = V((0, r.ANK_Y-(1.75 if C['mode'] in ('one', 'viking') else 1.84), 0.06)); box("lmbase", (0.22, 0.22, 0.06), tuple(ctx.PIV-V((0, 0, 0.03))), M_.FRAME)   # 두 손·회전은 끝이 가슴·엉덩이에서 떨어지게 축을 멀리
    ctx.LM = cyl("lm", 0.025, 1.0, M_.STEEL, axis='Z', verts=24); ctx.LMP = cyl("lmp", PLATE_R*0.8, 0.05, M_.RUBBER, verts=64)
    if C['mode'] == 'viking': ctx.VH = cyl("vh", 0.016, 0.56, M_.STEEL, verts=24)
def lm_end(ctx, Sref, reach, a0, frac):
    """끝점: 축에서 blen 거리. 시작은 어깨 앞(a0 고도각), 끝은 어깨에서 reach 거리가 되는 고도각까지."""
    B = ctx.C['blen']; Pv = ctx.PIV
    def at(el, yaw=0.0):
        return Pv+V((math.sin(yaw)*math.cos(el), math.cos(yaw)*math.cos(el), math.sin(el)))*B
    lo, hi = a0, math.radians(85)
    for _ in range(40):
        m = (lo+hi)/2
        if (at(m)-Sref).length < reach: lo = m
        else: hi = m
    return at(lerp(a0, (lo+hi)/2, frac))
def landmine(r, t, ctx):
    C = ctx.C; u = timing(t); m = C['mode']; load = []
    if m == 'rot':   # 팔을 편 채 끝을 좌우 엉덩이 옆으로(몸통 회전)
        ax = 0.20; P = stand_P(r, ax, 0.02); ya = C.get('yaw_a', 20.0); yaw = lerp(-ya, ya, u); r.torso(P, Rx(6.0)@Rz(yaw*0.35), Rx(6.0)@Rz(yaw*0.6), Rx(6.0)@Rz(yaw*0.8), Rx(6.0)@Rz(yaw), Rx(3.0)@Rz(yaw*0.8), Rx(2.0)@Rz(yaw*0.6), scap={s: (0.0, 2.0) for s, _ in SIDES}); fixed = plant(r, ax)
        S = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2; B = C['blen']; el = math.radians(C.get('el', 39.0)); yw = math.radians(yaw*0.55)
        E = ctx.PIV+V((math.sin(yw)*math.cos(el), math.cos(yw)*math.cos(el), math.sin(el)))*B; Ec = E
        dB = (E-ctx.PIV).normalized()   # 주먹 두 개로 바 끝을 감싼다: 바 축이 주먹을 지나고(엄지 쪽이 축 방향) 손등은 바깥 아래
        for s, sg in SIDES:
            r.arm(s, E+V((sg*0.035, 0, 0.02)), dB*C.get('f_sign', -1.0), V((sg*0.8, C.get('pole_y', 0.3), -0.6)), Rz(yaw*C.get('lat_k', 1.0))@V((-sg, C.get('lat_y'+s, 0.12), C.get('lat_z', 0.0))), 0.9995); r.fingers(s)   # 손끝은 바 축 쪽(앞 아래), 손 방향은 몸통 회전을 그대로 따른다 — m2b 변수 탐색으로 고른 값
    else:
        ax = 0.17 if m != 'squat' else 0.21; sq = 0.0
        if m == 'squat': sq = 1-sstep(0.0, 0.45, u)   # 0: 앉은 자세 → 일어서며 민다
        pu = sstep(0.40, 1.0, u) if m == 'squat' else u
        P = stand_P(r, ax, 0.02); th = lerp(8.0, 14.0, pu)
        if sq > 0: P = P+V((0, 0.10*sq, -0.30*sq)); th = th+18*sq
        r.torso(P, Rx(th), neck=Rx(th*0.5), head=Rx(th*0.3), scap={s: (lerp(0.0, 2.0, pu), lerp(0.5, 2.5, pu)) for s, _ in SIDES})
        fixed = plant(r, ax, toe=14.0 if m == 'squat' else 8.0, knee=lambda sg: V((sg*0.35, -1, 0)))
        Sl, Sr = r.chain_head('upperarm_l'), r.chain_head('upperarm_r'); reach = (r.L_U+r.L_F)*(1.0 if m == 'one' else 0.95)
        if m == 'one': Sref = Sr; E0 = Sr+V((0.05, -0.12, -0.02))
        else: Sref = (Sl+Sr)/2; E0 = Sref+V((0, -0.28, 0.0 if m == 'squat' else -0.10))
        a0 = math.asin(max(-1, min(1, (E0.z-ctx.PIV.z)/C['blen'])))
        if m == 'squat': a0 = math.acos(max(-1, min(1, (Sref.y-0.30-ctx.PIV.y)/C['blen'])))   # 앉은 자세: 끝이 가슴 앞 30cm 에 오도록(높이로 잡으면 몸 쪽으로 파고든다)
        E = lm_end(ctx, Sref+V((0, 0, 0)), reach, a0, pu)
        Ec = E
        if m == 'one':
            r.arm('r', E, V((0, -0.3, 1)).normalized(), V((-0.7, 0.3, -0.8)), V((1, 0.4, 0)).normalized(), 0.9995); r.fingers('r')
            Lw = ctx.L_WAIST; G = W_(P, Rx(th), ctx, V((Lw.x, Lw.y, Lw.z))); jointed(r, 'l', r.chain_head('upperarm_l')+Rx(th)@V((0.85, 0.45, -0.30)), G, Rx(th)@V((-0.3, -0.6, -0.7)), Rx(th)@V((0, 0.6, 0.8)), Rx(th)@V((1, 0.6, 0))); r.fingers('l', 0.2)
        elif m == 'viking':
            d = (E-ctx.PIV).normalized()
            for s, sg in SIDES: r.arm(s, E+V((sg*0.24, 0, 0)), V((0, -0.2, 1)).normalized(), V((sg*0.9, 0.2, -0.5)), None, 0.9995); r.fingers(s)
            ctx.VH.location = E; rot_to(ctx.VH, V((1, 0, 0)))
        else:   # 두 손을 겹쳐 끝을 감싼다
            for s, sg in SIDES: r.arm(s, E+V((sg*0.04, 0.02, 0)), V((0, -0.3, 1)).normalized(), V((sg*0.8, -0.1, -0.6)), (V((sg*lerp(0.5, 3.5, pu), -1, 0)).normalized() if m != 'squat' else None), 0.9995); r.fingers(s)
    d = (Ec-ctx.PIV); d = d.normalized()*(d.length-0.05) if m != 'one' else d; ctx.LM.location = ctx.PIV+d/2; ctx.LM.rotation_mode = 'QUATERNION'; ctx.LM.rotation_quaternion = d.normalized().to_track_quat('Z', 'Y'); ctx.LM.scale = (1, 1, d.length)
    ctx.LMP.location = ctx.PIV+d.normalized()*(d.length-0.45); rot_to(ctx.LMP, d)   # 원판 면이 바에 수직(옛 X 맞춤은 원판이 바를 따라 누웠다)
    return dict(bar=None, load=[(Ec, 20.0)], fixed=fixed)

# ════ 파이크 푸시업·물구나무(벽 핸드스탠드 푸시업·홀드) ════
PK = dict(mode='pike', hand_x=0.24)
def pk_setup(ctx):
    C = dict(PK); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats
    if C['mode'] in ('hspu', 'hold'): box("wall", (1.6, 0.10, 2.6), (0, 0.36, 1.30), M_.FRAME, 0.005)
    box("mat", (0.80, 1.80, 0.012), (0, 0.30 if C['mode'] == 'pike' else 0.0, 0.006), M_.PAD, 0.004)
def pk_fit(r, P, tor, Ws, k, dy=0.0):
    """몸통을 놓은 뒤 어깨가 손목 위(앞뒤 dy)에서 손목까지 팔 길이×k 가 되게 골반을 옮겨 다시 놓는다(어깨를 근사로 잡으면 팔이 모자라거나 남는다)."""
    tor(P); Ld = (r.L_U+r.L_F)*k
    Sh = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2; W = (Ws['l']+Ws['r'])/2; hx = abs(r.chain_head('upperarm_l').x-Ws['l'].x)
    tz = W.z+sqrt0(Ld**2-hx**2-dy**2); P = P+V((-Sh.x, (W.y+dy)-Sh.y, tz-Sh.z)); tor(P); return P
def pike(r, t, ctx):
    C = ctx.C; u = timing(t); m = C['mode']; hx = C['hand_x']; W_z = 0.036+r.GRIP_N; fixed = []
    if m == 'pike':   # 손·앞꿈치 고정, 엉덩이를 높이 든 V 자에서 머리를 손 앞 바닥 쪽으로
        S0 = r.shoulder_local('l')-r.head0('pelvis'); S0.x = 0.0; Wy = 0.0   # 왼 어깨 x 를 빼야 몸이 가운데에 선다
        Ws = {s: V((sg*hx, Wy, W_z)) for s, sg in SIDES}
        def pose(uu):
            th = lerp(140.0, 155.0, uu); Rt = Rx(th); reach = (r.L_U+r.L_F)*lerp(0.92, 0.66, uu); Sy = Wy-lerp(0.02, 0.10, uu)
            tor = lambda P_: r.torso(P_, Rt, neck=Rx(th-10), head=Rx(th-20), scap={s: (lerp(2.0, 0.0, uu), 0.0) for s, _ in SIDES})
            return pk_fit(r, V((0, Sy, W_z+reach))-Rt@S0, tor, Ws, lerp(0.92, 0.66, uu), Sy-Wy)
        Lg = (r.L_T+r.L_S)*0.96; Hs = []
        for uu in (0.0, 1.0): pose(uu); Hs.append(r.chain_head('thigh_l'))
        lo, hi = 0.30, 1.20   # 앞꿈치 위치: 양 끝 자세 모두에서 다리가 닿는 가장 먼 곳(고정점이라 프레임마다 같아야 한다)
        for _ in range(30):
            mid = (lo+hi)/2; ok = all((r.ankle_from_ball('l', V((0.12, mid, r.head0('ball_l').z+0.016)), 0.0, 45.0)-H).length <= Lg for H in Hs)
            if ok: lo = mid
            else: hi = mid
        ball_y = lo; pose(u)
        for s, sg in SIDES:
            ball = V((sg*0.12, ball_y, r.head0('ball_l').z+0.016)); A = r.ankle_from_ball(s, ball, 0.0, 45.0); r.leg_ik(s, A, V((0, -1, 0.3)), V((0, -1, 0)), 0.0, 45.0, True); fixed.append('ball_'+s)
            F = V((sg*0.15, -1, 0)).normalized(); G = grip_w(r, s, Ws[s], F); r.arm(s, G, F, V((sg*0.8, 0.6, 0.0)), None, 0.9995); r.fingers(s, 0.0); fixed.append('hand_'+s)
        return dict(bar=None, load=[], fixed=fixed)
    # 물구나무: 몸을 거꾸로 세워 손으로 짚는다(hold 는 거의 정지, hspu 는 머리를 바닥 가까이)
    th = 180.0-4.0; Rt = Rx(th); S0 = r.shoulder_local('l', 2.5, 0.0)-r.head0('pelvis'); S0.x = 0.0; Wy = 0.12
    k = 0.965 if m == 'hold' else lerp(0.965, 0.68, u); sway = 0.004*math.sin(2*math.pi*u) if m == 'hold' else 0.0   # 거의 편 팔은 좌우 몇 mm 차이로 팔꿈치 각이 크게 갈린다
    Ws = {s: V((sg*hx, Wy, W_z)) for s, sg in SIDES}
    Sz = W_z+(r.L_U+r.L_F)*k; P = V((0, Wy+sway, Sz))-Rt@S0
    P = pk_fit(r, P, lambda P_: r.torso(P_, Rt, neck=Rx(th-8), head=Rx(th-18), scap={s: (2.5, 0.0) for s, _ in SIDES}), Ws, k)
    for s, sg in SIDES:
        H = r.chain_head('thigh_'+s); d = Rt@V((0, 0, -1)); A = H+(d+V((sg*0.02, 0.0, 0.0))+Rt@V((0, 0.04, 0))).normalized()*(r.L_T+r.L_S)*0.985; r.leg_ik(s, A, Rt@V((0, 1, 0)), Rt@V((0, -1, 0.0)), 0.0, -82.0)   # 발끝을 다리 방향(위)으로 편다
        F = V((sg*0.15, -1, 0)).normalized(); G = grip_w(r, s, Ws[s], F); r.arm(s, G, F, V((sg*0.9, -0.2, 0.4)), None, 0.9995); r.fingers(s, 0.0); fixed.append('hand_'+s)
    return dict(bar=None, load=[], fixed=fixed)

SOLVERS = {'ohp2': (op_setup, ohp2), 'landmine': (lm_setup, landmine), 'pike': (pk_setup, pike)}
