# SPDX-License-Identifier: GPL-3.0-or-later
"""앉기·런지 묶음 계산식(SPEC-040 Phase 3). 변형은 catalog 의 vars 로 고른다.
좌표: X 왼쪽+, -Y 앞, Z 위. Rx(+)=앞으로 숙임. t 0=시작 자세, 1=반대쪽 자세(왕복 재생).
동작 근거는 실제 수행 관찰 메모(저장소 밖, 원형별)다."""
import math
from mathutils import Vector as V, Matrix
from rig import Rx, Rz, lerp, sstep, sqrt0
from scene import PLATE_R, barbell, box, cyl
from families.reps import (SIDES, BAR_KG, DB_KG, timing, dumbbell, hold, rot_to, wire, wire_to, grip_w, jointed, hang)
KB_KG = 16.0

def kettlebell(ctx, name):
    import bpy
    M_ = ctx.mats; root = bpy.data.objects.new(name, None); ctx.col.objects.link(root)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.095, location=(0, 0, -0.10), segments=48, ring_count=24); b = bpy.context.object; b.name = name+"_b"; b.data.materials.append(M_.RUBBER)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.062, minor_radius=0.013, location=(0, 0, 0.0), rotation=(math.pi/2, 0, 0)); h = bpy.context.object; h.name = name+"_h"; h.data.materials.append(M_.HUB)
    for p in (b, h): p.parent = root; [setattr(q, 'use_smooth', True) for q in p.data.polygons]
    return root
def place_obj(o, loc, R=None):
    o.location = loc; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (R or Rx(0)).to_quaternion()

# ── 공통: 두 발을 딛고 앉았다 일어서는 다리·몸통 풀이 ──
# ax 발 간격(발목 x), toe 발끝 각, a0/a1 정강이 앞 기울기(선 자세/바닥), drop 바닥에서 고관절이 무릎보다 낮은 정도,
# ref 몸통 기준점(뼈대 공간), ty 그 점이 놓일 y(발목 기준), heel 뒤꿈치 각, yA 발목 y 이동
def sq_frame(r, u, ctx, C, heel=0.0, dz=0.0, depth=1.0):
    toe, ax = C['toe'], C['ax']; ar = math.radians(lerp(C['a0'], C['a1'], (u*depth)**0.75)); toe_l = Rz(toe)@V((0, -1, 0))
    if heel:
        ball = V((ax, r.head0('ball_l').y+C.get('yA', 0.0), r.head0('ball_l').z)); A_l = r.ankle_from_ball('l', ball, toe, heel)
    else: A_l = V((ax, r.ANK_Y+C.get('yA', 0.0), r.ANK_Z))
    inw = C.get('in', 0.03)*(1-u)
    K_l = A_l+(V((0, 0, math.cos(ar)))*r.L_S+toe_l*math.sin(ar)*r.L_S+V((-inw, 0, 0))).normalized()*r.L_S
    dxk = r.HIP_OFF.x-K_l.x; top_h = K_l.z+sqrt0(r.L_T**2-dxk**2-C.get('top_back', 0.06)**2)
    Kb = K_l.z-C['drop']; Hz = lerp(top_h, Kb, sstep(0.0, 1.0, u*depth)) if depth != 1.0 else lerp(top_h, Kb, u)
    p0 = r.head0('pelvis'); ref = C['ref']; ty = r.ANK_Y+C['ty']+C.get('yA', 0.0)
    def place(th):
        off = Rx(th)@r.HIP_OFF; dx = off.x-K_l.x; dz_ = Hz-K_l.z
        Hy = K_l.y+sqrt0(r.L_T**2-dx**2-dz_**2); P = V((0, Hy-off.y, Hz-off.z)); return P, (P+Rx(th)@(ref-p0)).y-ty
    lo, hi = C.get('th_min', -6.0), C.get('th_max', 70.0)
    if 'th_fix' in C: th = C['th_fix']
    elif place(lo)[1] <= 0: th = lo
    else:
        for _ in range(40):
            m = (lo+hi)/2
            if place(m)[1] > 0: lo = m
            else: hi = m
        th = (lo+hi)/2
    P, _ = place(th); R = Rx(th); P = P+V((0, 0, dz)); dzv = V((0, 0, dz))
    r.torso(P, R, neck=Rx(th*C.get('neck', 0.62)), head=Rx(th*C.get('head', 0.40)), scap={s: C.get('scap', (0.5, -1.0)) for s, _ in SIDES})
    fixed = []
    for s, sg in SIDES:
        A = V((sg*A_l.x, A_l.y, A_l.z))+dzv; K = V((sg*K_l.x, K_l.y, K_l.z))+dzv
        r.leg(s, K, A, Rz(sg*toe)@V((0, -1, 0)), sg*toe, heel, bool(heel)); fixed.append('ball_'+s if heel else 'foot_'+s)
    return P, R, th, fixed

# ── 팔과 짐: 몸통 회전 R, 골반 P 를 받아 손을 놓는다 ──
def local_pts(ctx):
    r = ctx.rig; back = [p for p in ctx.rest_v if abs(p.x) < 0.04 and 1.40 < p.z < 1.46]
    S = (r.head0('upperarm_l')+r.head0('upperarm_r'))/2
    front = [p for p in ctx.rest_v if abs(p.x) < 0.10 and S.z-0.20 < p.z < S.z-0.10]
    ctx.L_BACK = V((0, max(p.y for p in back)+0.015, 1.438)); ctx.L_SH = S
    ctx.L_FRONT = V((0, S.y-0.105, S.z+0.005))   # 프론트 랙: 쇄골 앞, 어깨 세모근 위
    ctx.L_CHEST = V((0, min(p.y for p in front)-0.075, S.z-0.17))   # 가슴 앞(고블릿 덤벨 중심)
    p0 = r.head0('pelvis'); zw = p0.z+0.13; wv = [p for p in ctx.rest_v if p.x > 0 and abs(p.z-zw) < 0.02 and abs(p.y-p0.y) < 0.05]
    ctx.L_WAIST = V((max(p.x for p in wv)+0.035, p0.y-0.01, zw))   # 허리 옆면(손을 얹는 곳)
def W_(P, R, ctx, L): return P+R@(L-ctx.rig.head0('pelvis'))
def load_setup(ctx, kind):
    M_ = ctx.mats; local_pts(ctx)
    if kind in ('back', 'front', 'overhead', 'zercher', 'smith', 'ssb', 'press_under', 'balance', 'anderson'): ctx.BAR = barbell(ctx.col, M_)
    if kind == 'ssb': ctx.YOKE = [cyl("yoke", 0.016, 1.0, M_.STEEL, axis='Z', verts=24) for _ in range(4)]
    if kind in ('goblet', 'sumo_db'): ctx.DB = {'c': dumbbell(ctx, "db_c")}
    if kind in ('hang_db', 'front_db', 'overhead_db', 'lat_db'): ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
    if kind in ('goblet_kb', 'sumo_kb'): ctx.KB = {'c': kettlebell(ctx, "kb_c")}
    if kind in ('hang_kb', 'front_kb'): ctx.KB = {s: kettlebell(ctx, "kb_"+s) for s, _ in SIDES}
    if kind == 'landmine':
        ctx.LM = cyl("lm", 0.014, 1.0, M_.STEEL, axis='Z', verts=24); ctx.LMP = cyl("lmp", PLATE_R*0.8, 0.05, M_.RUBBER, verts=64); ctx.PIV = V((0, ctx.rig.ANK_Y-1.70, 0.06))
        box("lmbase", (0.20, 0.20, 0.06), tuple(ctx.PIV-V((0, 0, 0.03))), M_.FRAME)
    if kind == 'cable':
        ctx.PUL = V((0, ctx.rig.ANK_Y-0.95, 0.10)); ctx.W = wire(ctx); ctx.H = cyl("handle", 0.014, 0.22, M_.STEEL)
        box("stack", (0.30, 0.20, 1.90), (0, ctx.rig.ANK_Y-1.05, 0.95), M_.FRAME)
    if kind == 'band': ctx.BD = [wire(ctx, "band") for _ in range(2)]
    if kind == 'smith':
        for sg in (-1, 1): box("rail", (0.05, 0.05, 2.10), (sg*0.62, ctx.rig.ANK_Y+ctx.vars.get('smith_dy', -0.06), 1.05), M_.FRAME)
    if kind == 'belt':
        ctx.BELT = box("belt", (0.30, 0.03, 0.07), (0, 0, 0), M_.PAD, 0.01); ctx.CH = wire(ctx, "chain"); y = ctx.rig.ANK_Y
        ctx.GND = V((0, y-0.04, 0.10)); box("pul", (0.16, 0.16, 0.10), (0, y-0.04, 0.05), M_.FRAME)
        for sg in (-1, 1): box("post", (0.05, 0.05, 0.98), (sg*0.42, y-0.36, 0.49), M_.FRAME)
        box("hbar", (0.90, 0.04, 0.04), (0, y-0.36, 0.98), M_.STEEL)
    if kind in ('hips', 'chest', 'arms_fwd', 'swing', 'tuck', 'none'): pass
def arms(r, ctx, kind, P, R, u, th, fixed):
    """반환: bar(바 위치 또는 None), load[(위치, kg)]"""
    p0 = r.head0('pelvis'); load = []; bar = None
    if kind in ('back', 'smith', 'ssb', 'anderson'):
        bar = W_(P, R, ctx, ctx.L_BACK); ctx.BAR.location = bar; load = [(bar, BAR_KG)]
        if kind == 'ssb':
            for i, (s, sg) in enumerate(SIDES):
                a = bar+R@V((sg*0.12, 0.0, 0.02)); m = bar+R@V((sg*0.13, -0.16, 0.13)); b = bar+R@V((sg*0.16, -0.36, -0.08)); wire_to(ctx.YOKE[2*i], a, m); wire_to(ctx.YOKE[2*i+1], m, b)
                if ctx.vars.get('hatfield'):
                    y = r.ANK_Y-0.36; G = V((sg*0.30, y, 0.97)); r.arm(s, G, V((0, -1, -0.2)), V((sg*0.8, 0.4, -0.4)), None, 0.9995)
                else: F = R@V((0, -0.55, -0.83)); r.arm(s, b+R@V((0, -0.02, 0)), F, R@V((sg*0.6, 0.2, -0.8)), R@V((-sg*0.1, 0, 0)) if False else None, 0.9995)
                r.fingers(s)
            return bar, load
        for s, sg in SIDES: r.arm(s, bar+V((sg*0.40, 0, 0)), R@V((sg*0.30, 0.12, 1)), R@V((sg*0.75, 0.55, -0.75)), None, 0.9995); r.fingers(s)
    elif kind == 'front':
        bar = W_(P, R, ctx, ctx.L_FRONT); ctx.BAR.location = bar; load = [(bar, BAR_KG)]
        for s, sg in SIDES: r.arm(s, bar+V((sg*0.25, 0, 0)), R@V((0, 0.72, 0.70)), R@V((sg*0.55, -0.62, -0.55)), None, 0.9995); r.fingers(s, 0.55)
    elif kind in ('overhead', 'overhead_db', 'press_under', 'balance'):
        S = r.chain_head('upperarm_l'); grip = 0.55 if kind != 'overhead_db' else 0.20; L_ = (r.L_U+r.L_F)*0.985
        top = V((0, r.ANK_Y+ctx.vars.get('oh_dy', -0.07), 0))
        if 'oh_rel' in ctx.vars: top.y = S.y+ctx.vars['oh_rel']   # 몸이 앞뒤로 움직이는 런지는 어깨 기준(REV-070)
        top.z = S.z+sqrt0(L_**2-(grip-S.x)**2-(top.y-S.y)**2)+r.GRIP_F
        if kind in ('press_under', 'balance'):
            lo = W_(P, R, ctx, ctx.L_FRONT if kind == 'press_under' else ctx.L_BACK); w = sstep(0.0, 0.85, u)
            bar = lo.lerp(top, w)
            if kind == 'press_under': bar.y = lerp(lo.y, top.y, sstep(0.70, 1.0, w))-0.13*sstep(0.0, 0.25, w)*(1-sstep(0.70, 1.0, w))   # 얼굴 앞으로 곧게 올렸다가 머리 위에서 뒤로
            else: bar.y = lerp(lo.y, top.y, w)
            Fs = lambda sg: (R@V((0, 0.72, 0.70))).lerp(V((0, 0.05, 1)), w) if kind == 'press_under' else (R@V((sg*0.30, 0.12, 1))).lerp(V((0, 0.05, 1)), w)
            for s, sg in SIDES: r.arm(s, bar+V((sg*(lerp(0.25 if kind == 'press_under' else 0.40, grip, w)), 0, 0)), Fs(sg), V((sg*0.8, 0.30, -0.5)), None, 0.9995); r.fingers(s)
            ctx.BAR.location = bar; return bar, [(bar, BAR_KG)]
        bar = top
        if kind == 'overhead':
            ctx.BAR.location = bar; load = [(bar, BAR_KG)]
            for s, sg in SIDES: r.arm(s, bar+V((sg*grip, 0, 0)), V((0, 0.05, 1)), V((sg*0.8, 0.35, -0.4)), None, 0.9995); r.fingers(s)
        else:
            for s, sg in SIDES:
                G = bar+V((sg*grip, 0, 0)); r.arm(s, G, V((0, 0.02, 1)), V((sg*0.8, 0.35, -0.4)), V((0, -1, 0)), 0.9995); r.fingers(s); hold(ctx, s, G, V((0, 1, 0))); load.append((G, DB_KG))
            bar = None
    elif kind in ('goblet', 'goblet_kb', 'cable', 'landmine'):
        C = W_(P, R, ctx, ctx.L_CHEST)+R@V((0, ctx.vars.get('chest_dy', 0.0), 0))
        for s, sg in SIDES:
            G = C+R@V((sg*0.05, 0.0, 0.075 if kind == 'goblet' else 0.02)); F = R@V((-sg*0.55, -0.25, 0.80)); r.arm(s, G, F, R@V((sg*0.45, 0.25, -1)), R@V((0, -1, 0)), 0.9995); r.fingers(s, 0.6)
        if kind == 'goblet': place_obj(ctx.DB['c'], C, R@Rz(0)@Rx(0)); rot_to(ctx.DB['c'], R@V((0, 0, 1))); load = [(C, DB_KG*1.5)]
        elif kind == 'goblet_kb': place_obj(ctx.KB['c'], C+R@V((0, -0.035, 0.02)), R); load = [(C, KB_KG)]
        elif kind == 'cable': ctx.H.location = C+R@V((0, -0.02, 0.0)); wire_to(ctx.W, C, ctx.PUL); load = [(C, 15.0)]
        else:
            end = C+R@V((0, -0.03, 0.03)); wire_to(ctx.LM, ctx.PIV, end); d = (end-ctx.PIV).normalized(); ctx.LMP.location = end-d*0.18; rot_to(ctx.LMP, d); load = [(C, 20.0)]
    elif kind == 'zercher':
        Es = {}
        for s, sg in SIDES:
            S = r.chain_head('upperarm_'+s); d = (R@V((sg*0.12, -0.78, -0.62))).normalized(); Es[s] = S+d*r.L_U   # 팔꿈치 안쪽에 바
        bar = (Es['l']+Es['r'])/2+V((0, -0.01, 0.035)); bar.x = 0; ctx.BAR.location = bar; load = [(bar, BAR_KG)]
        for s, sg in SIDES:
            E = Es[s]; fa = (R@V((-sg*0.35, -0.15, 0.92))).normalized(); jointed(r, s, E, E+fa*r.L_F, fa, R@V((0, 1, 0)), R@V((sg*0.3, 0.5, -1))); r.fingers(s, 0.9)
    elif kind in ('front_db', 'front_kb'):
        for s, sg in SIDES:
            S = r.chain_head('upperarm_'+s); G = S+R@V((-sg*0.01, -0.12, 0.07)); F = R@V((0, 0.25, 0.97)); r.arm(s, G, F, R@V((sg*0.45, -0.75, -0.45)), R@V((0, 1, 0)), 0.9995); r.fingers(s)
            ax_ = (R@V((0, 0.75, -0.66))).normalized()
            if kind == 'front_db': hold(ctx, s, G-ax_*0.035, ax_); load.append((G, DB_KG))
            else: place_obj(ctx.KB[s], G+R@V((sg*0.05, -0.04, 0.02)), R@Matrix.Rotation(math.radians(sg*80), 3, 'Y')); load.append((G, KB_KG))
    elif kind in ('hang_db', 'hang_kb'):
        for s, sg in SIDES:
            if 'hang_out' in ctx.vars:   # 팔을 비스듬히 벌려 짐이 허벅지 바깥에 오게(길이는 팔 길이 그대로)
                S = r.chain_head('upperarm_'+s); d = V((sg*ctx.vars['hang_out'], ctx.vars.get('hang_fwd', 0.0), -1)).normalized(); W = S+d*(r.L_U+r.L_F)*0.975; G = grip_w(r, s, W, V((0, 0, -1)), V((0, -1, 0))); r.arm(s, G, V((0, 0, -1)), V((sg*0.35, 0.8, 0)), V((0, -1, 0)), 0.9995); r.fingers(s)
            else: G = hang(r, s, sg, ctx.vars.get('hang_ex', 0.085 if kind == 'hang_db' else 0.10), ctx.vars.get('hang_fwd', -0.01), lat=V((0, -1, 0)), reach=0.975)
            if kind == 'hang_db': hold(ctx, s, G, V((0, 1, 0)))
            else: place_obj(ctx.KB[s], G+V((0, 0, -0.035)), Rz(90))   # 손잡이 가로대를 쥔 방향(앞뒤)에 맞춘다(REV-070)
            load.append((G, DB_KG))
    elif kind in ('sumo_db', 'sumo_kb'):
        S = r.chain_head('upperarm_l'); L_ = (r.L_U+r.L_F)*0.975; C = V((0, S.y-0.17, 0)); C.z = S.z-sqrt0(L_**2-(S.x-0.04)**2-0.17**2)
        for s, sg in SIDES: G = C+V((sg*0.04, 0, 0)); r.arm(s, G, V((-sg*0.15, 0, -1)), V((sg*0.8, 0.5, 0)), None if kind == 'sumo_kb' else V((0, -1, 0)), 0.9995); r.fingers(s)   # 케틀벨은 손잡이가 좌우(엎침, REV-070)
        if kind == 'sumo_db': place_obj(ctx.DB['c'], C+V((0, 0, -0.13))); rot_to(ctx.DB['c'], V((0, 0, 1)))
        else: place_obj(ctx.KB['c'], C+V((0, 0, -0.03)))
        load = [(C, DB_KG*1.5)]
    elif kind == 'band':
        for i, (s, sg) in enumerate(SIDES):
            S = r.chain_head('upperarm_'+s); G = S+R@V((-sg*0.02, -0.14, 0.0)); r.arm(s, G, R@V((0, 0.30, 0.95)), R@V((sg*0.45, -0.75, -0.45)), R@V((0, 1, 0)), 0.9995); r.fingers(s)
            f = V((sg*ctx.C.get('ax', 0.13), r.ANK_Y-0.03, 0.005)); wire_to(ctx.BD[i], f, G)
    elif kind == 'belt':
        Hc = (r.chain_head('thigh_l')+r.chain_head('thigh_r'))/2; place_obj(ctx.BELT, Hc+R@V((0, -0.165, 0.07)), R); wire_to(ctx.CH, Hc+R@V((0, -0.18, 0.05)), ctx.GND); load = [(Hc, 40.0)]
        for s, sg in SIDES: r.arm(s, V((sg*0.28, r.ANK_Y-0.36+0.01, 0.98+0.03)), V((0, -0.3, -1)), V((sg*0.8, 0.5, -0.5)), None, 0.9995); r.fingers(s)
    elif kind == 'hips':
        for s, sg in SIDES:
            Lw = ctx.L_WAIST; G = W_(P, R, ctx, V((sg*Lw.x, Lw.y, Lw.z))); jointed(r, s, r.chain_head('upperarm_'+s)+R@V((sg*0.85, 0.45, -0.30)), G, R@V((-sg*0.3, -0.6, -0.7)), R@V((0, 0.6, 0.8)), R@V((sg*1, 0.6, 0))); r.fingers(s, 0.2)
    elif kind == 'thighs':   # 손을 허벅지 위에
        for s, sg in SIDES:
            K = r.chain_head('calf_'+s); H = r.chain_head('thigh_'+s); G = K.lerp(H, 0.35)+V((sg*0.01, 0, 0.075)); r.arm(s, G, (K-H).normalized()+V((0, 0, -0.3)), V((sg*0.8, 0.4, 0)), None, 0.9995); r.fingers(s, 0.15)
    elif kind == 'chest':
        C = W_(P, R, ctx, ctx.L_CHEST)+R@V((0, -0.06, -0.04))
        for s, sg in SIDES: r.arm(s, C+R@V((sg*0.035, 0, 0)), R@V((-sg*0.45, -0.85, 0.15)), R@V((sg*0.6, 0.3, -1)), R@V((0, 0, 1)), 0.9995); r.fingers(s, 0.7)
    elif kind == 'arms_fwd':
        a = math.radians(lerp(ctx.vars.get('arm0', 12), ctx.vars.get('arm1', 85), u))
        for s, sg in SIDES:
            S = r.chain_head('upperarm_'+s); d = V((sg*0.06, -math.sin(a), -math.cos(a))).normalized(); E = S+d*r.L_U; d2 = V((sg*0.03, -math.sin(a+0.10), -math.cos(a+0.10))).normalized()
            jointed(r, s, E, E+d2*r.L_F, d2, V((-sg, 0, 0)), V((sg*0.5, math.cos(a), -math.sin(a)))); r.fingers(s, 0.4)
    elif kind in ('swing', 'tuck'):
        a = math.radians(ctx.swing)
        for s, sg in SIDES:
            S = r.chain_head('upperarm_'+s); d = V((sg*0.16, -math.sin(a), -math.cos(a))).normalized(); E = S+d*r.L_U; b = a+math.radians(14); d2 = V((sg*0.06, -math.sin(b), -math.cos(b))).normalized()
            jointed(r, s, E, E+d2*r.L_F, d2, V((0, -1, 0)) if False else V((-sg, 0, 0)), V((sg*0.5, math.cos(a), -math.sin(a)))); r.fingers(s, 0.5)
    return bar, load

# ── 스쿼트 계열 ──
SQD = dict(toe=20.0, ax=0.195, a0=3.0, a1=33.0, drop=0.025, ref=None, ty=-0.065, load='back')
def sq_setup(ctx):
    C = dict(SQD); C.update(ctx.vars); ctx.C = C; load_setup(ctx, C['load']); r = ctx.rig
    if C['ref'] is None: C['ref'] = {'back': ctx.L_BACK, 'smith': ctx.L_BACK, 'ssb': ctx.L_BACK, 'anderson': ctx.L_BACK, 'front': ctx.L_FRONT}.get(C['load'], ctx.L_SH)
    elif isinstance(C['ref'], str): C['ref'] = {'back': ctx.L_BACK, 'front': ctx.L_FRONT, 'sh': ctx.L_SH, 'chest': ctx.L_CHEST}[C['ref']]
    M_ = ctx.mats
    if C.get('box'):   # 박스: 바닥 자세 골반 아래
        r.reset(); P, R, th, _ = sq_frame(r, 1.0, ctx, C); Hc = P+R@r.HIP_OFF; Hc.x = 0; z = Hc.z-0.115; box("box", (0.42, 0.40, z), (0, Hc.y+0.10, z/2), M_.PAD, 0.02)
    if C.get('pins'):   # 앤더슨: 바닥 자세 바 높이에 안전바
        r.reset(); P, R, th, _ = sq_frame(r, 1.0, ctx, C); b = W_(P, R, ctx, ctx.L_BACK); ctx.PINZ = b.z-0.03
        for sg in (-1, 1): box("up", (0.06, 0.06, 2.0), (sg*0.62, b.y+0.30, 1.0), M_.FRAME); box("up", (0.06, 0.06, 2.0), (sg*0.62, b.y-0.30, 1.0), M_.FRAME); box("pin", (0.05, 0.75, 0.035), (sg*0.62, b.y, ctx.PINZ-0.032), M_.STEEL)
    if C.get('rails'):
        for sg in (-1, 1): box("rail", (0.05, 0.05, 2.10), (sg*0.62, r.ANK_Y+C['rails'], 1.05), M_.FRAME)
    if C.get('wall') == 'auto':
        r.reset(); P, R, th, _ = sq_frame(r, C.get('hold', 1.0), ctx, C); p0 = r.head0('pelvis'); zs = (p0.z, r.head0('neck_01').z)
        by = max((R@(v-p0)).y for v in ctx.rest_v[::5] if abs(v.x) < 0.14 and zs[0] < v.z < zs[1]); C['wall'] = P.y+by-r.ANK_Y+0.06
    if C.get('wall'): box("wall", (1.6, 0.10, 2.2), (0, r.ANK_Y+C['wall'], 1.1), M_.FRAME, 0.01)
    if C.get('hatfield'):   # 앞 손잡이(손이 허공을 잡지 않게, REV-070)
        y = r.ANK_Y-0.36
        for sg in (-1, 1): box("post", (0.05, 0.05, 0.98), (sg*0.42, y, 0.49), M_.FRAME)
        box("hbar", (0.90, 0.04, 0.04), (0, y, 0.97), M_.STEEL)
    if C.get('kband'): ctx.KB_W = [wire(ctx, "kband") for _ in range(2)]; box("post", (0.08, 0.08, 1.0), (0, r.ANK_Y-0.95, 0.5), M_.FRAME)
    if C.get('mini'): ctx.MB = wire(ctx, "mini")
    if C['load'] in ('hang_db', 'hang_kb', 'overhead_db') and not hasattr(ctx, 'DB') and C['load'] != 'hang_kb': pass
    r.reset()
def squat(r, t, ctx):
    C = ctx.C; u = timing(t); dz = 0.0; heel = 0.0
    if C.get('hold'): u = C['hold']+0.012*math.sin(2*math.pi*t)   # 정지 자세: 숨쉬기만
    P, R, th, fixed = sq_frame(r, u, ctx, C, heel, dz)
    bar, load = arms(r, ctx, C['load'], P, R, u, th, fixed)
    if C.get('kband'):   # 스페니시: 무릎 뒤 밴드를 앞 기둥에 건다
        for i, (s, sg) in enumerate(SIDES): K = r.chain_head('calf_'+s); wire_to(ctx.KB_W[i], K+V((0, 0.06, 0)), V((sg*0.05, r.ANK_Y-0.95, 0.40)))
    if C.get('mini'):
        Kl = r.chain_head('calf_l'); Kr = r.chain_head('calf_r'); wire_to(ctx.MB, Kl+V((0.06, 0, 0.06)), Kr+V((-0.06, 0, 0.06)))
    return dict(bar=bar, load=load, fixed=fixed)

# ── 점프 스쿼트: 앉은 자세(t=0)에서 뛰어 최고점(t=1). 왕복 재생이 곧 착지다 ──
JP = dict(toe=12.0, ax=0.16, a0=3.0, a1=30.0, drop=-0.10, ref=None, ty=-0.03, load='swing', h=0.30, crouch=0.85, tuck=0.0, toff=0.42)
def jump_setup(ctx):
    C = dict(JP); C.update(ctx.vars); ctx.C = C; load_setup(ctx, C['load'] if C['load'] != 'tuck' else 'none'); C['ref'] = ctx.L_BACK if C['load'] == 'back' else ctx.L_SH; ctx.swing = 0.0
def jump(r, t, ctx):
    C = ctx.C; to = C['toff']
    if t <= to:
        s_ = sstep(0.0, to, t); u = C['crouch']*(1-s_); heel = 32.0*sstep(0.55, 1.0, s_); dz = 0.0
    else:
        s_ = (t-to)/(1-to); u = 0.0; heel = 32.0+6.0*sstep(0.0, 0.3, s_); dz = C['h']*(1-(1-s_)**2)
    ctx.swing = lerp(-12, 120 if C['load'] == 'swing' else 70, sstep(0.0, to+0.35, t))
    P, R, th, fixed = sq_frame(r, u, ctx, C, heel, dz)
    if C['tuck'] and t > to:   # 턱 점프: 최고점에서 무릎을 가슴으로
        k = sstep(0.1, 1.0, s_)*C['tuck']
        for s, sg in (SIDES if k > 0.02 else ()):
            H = r.chain_head('thigh_'+s); K0 = r.chain_head('calf_'+s); A0 = r.chain_head('foot_'+s)
            a1 = math.radians(95); K1 = H+V((sg*0.03, -math.sin(a1), -math.cos(a1)))*r.L_T; A1 = K1+V((0, 0.55, -0.83)).normalized()*r.L_S
            K = H+(K0.lerp(K1, k)-H).normalized()*r.L_T; A = K+(A0.lerp(A1, k)-K).normalized()*r.L_S
            r.leg(s, K, A, Rz(sg*12)@V((0, -1, 0)), sg*12, 38.0)
    bar, load = arms(r, ctx, C['load'] if C['load'] != 'tuck' else 'swing', P, R, u, th, fixed)
    return dict(bar=bar, load=load, fixed=[])

# ── 런지: 왼발이 앞. kind=front(앞으로 내딛기)·back(뒤로)·curtsy(뒤로 교차)·split(제자리)·jump ──
LU = dict(kind='front', stride=0.66, load='hang_db', th0=3.0, th1=8.0, knee_z=0.09, ax=0.11, cx=0.0)
def lunge_setup(ctx):
    C = dict(LU); C.update(ctx.vars); ctx.C = C; load_setup(ctx, C['load']); ctx.swing = 0.0
def foot_arc(a, b, s, lift=0.07):
    p = a.lerp(b, sstep(0.0, 1.0, s)); p.z += lift*math.sin(math.pi*min(1.0, max(0.0, s))); return p
def lunge(r, t, ctx):
    C = ctx.C; kind = C['kind']; ax = C['ax']; st = C['stride']; yF = r.ANK_Y-st*0.55; yB = r.ANK_Y+st*0.45
    stand_y = {'front': yB, 'back': yF, 'curtsy': yF, 'split': yB}.get(kind, yF)
    s1 = sstep(0.0, 0.42, t) if kind != 'split' else 1.0; s2 = sstep(0.30, 1.0, t) if kind != 'split' else timing(t)
    jz = 0.0
    if C.get('jump'): ctx.swing = lerp(8, 60, sstep(0.0, 0.8, t)); s2 = 1-sstep(0.0, 0.45, t); jz = C['jump']*(1-(1-max(0.0, (t-0.45)/0.55))**2) if t > 0.45 else 0.0
    cur = kind == 'curtsy' or C.get('cross')   # cross = 제자리 커트시(스미스는 골반이 앞뒤로 못 간다, REV-070)
    bx = -ax if not cur else (lerp(-ax, 0.16, s1) if kind == 'curtsy' else 0.16)
    Af = V((ax, yF, r.ANK_Z)) if kind != 'front' else foot_arc(V((ax, stand_y, r.ANK_Z)), V((ax, yF, r.ANK_Z)), s1)
    ball_b0 = V((-ax, (stand_y if kind != 'split' else yB)-0.0, 0)); ball_b1 = V((bx, yB+0.0, 0))
    pitch_b = 0.0
    # 뒷발: 앞꿈치를 축으로 뒤꿈치가 든다
    if kind == 'front':
        pitch_b = 48.0*sstep(0.15, 0.55, t); Ab = r.ankle_from_ball('r', V((-ax, yB+r.head0('ball_l').y-r.ANK_Y, r.head0('ball_l').z)), -6.0, pitch_b)
    else:
        b0 = V((-ax, stand_y, r.ANK_Z)); pitch_b = 48.0*sstep(0.25, 0.60, t) if kind != 'split' else 48.0
        Ab1 = r.ankle_from_ball('r', V((bx, yB+r.head0('ball_l').y-r.ANK_Y, r.head0('ball_l').z)), -6.0 if not cur else 25.0, 48.0)
        Ab = foot_arc(b0, Ab1, sstep(0.0, 0.55, t), 0.08) if kind != 'split' else Ab1
        if kind != 'split': Ab = b0.lerp(Ab1, sstep(0.0, 0.55, t)); Ab.z = lerp(r.ANK_Z, Ab1.z, sstep(0.0, 0.55, t))+0.06*math.sin(math.pi*sstep(0.0, 0.55, t))*(1-sstep(0.45, 0.55, t))
    # 골반: 선 자세 → 앞발 위 바닥 자세
    th = lerp(C['th0'], C['th1'], s2); Rt = Rx(th); off = Rt@r.HIP_OFF
    a_f = math.radians(lerp(2.0, 10.0, s2)); Kf = Af+V((0, -math.sin(a_f), math.cos(a_f)))*r.L_S
    zb = Kf.z+0.045; yb = Kf.y+sqrt0(r.L_T**2-(off.x-Kf.x)**2-(zb-Kf.z)**2)
    cx = C['cx']
    y0 = (Af.y+Ab.y)/2 if kind == 'split' else stand_y
    Hy = lerp(lerp(y0, (Af.y+Ab.y)/2, s1), yb, s2); Hz = lerp(r.ANK_Z+(r.L_T+r.L_S)*0.985, zb, s2)
    P = V((cx*math.sin(math.pi*s1)*(1-s2), Hy-off.y, Hz-off.z)); lim = (r.L_T+r.L_S)*0.993
    for _ in range(3):
        for A_, sg in ((Af, 1), (Ab, -1)):
            o_ = Rt@V((sg*abs(r.HIP_OFF.x), r.HIP_OFF.y, r.HIP_OFF.z)); d_ = P+o_-A_
            if d_.length > lim: P = A_+d_.normalized()*lim-o_
    if jz: dz_ = V((0, 0, jz)); P = P+dz_; Af = Af+dz_; Ab = Ab+dz_
    r.torso(P, Rt, neck=Rx(th*0.5), head=Rx(th*0.3), scap={s: (0.3, -0.5) for s, _ in SIDES})
    r.leg_ik('l', Af, V((0.05, -1, 0.1)), Rz(6)@V((0, -1, 0)), 6.0)
    r.leg_ik('r', Ab, V((-0.05, -1, -0.2)), Rz(-6 if not cur else 25)@V((0, -1, 0)), -6.0 if not cur else 25.0, pitch_b, pitch_b > 3)
    fixed = []
    if kind in ('back', 'curtsy', 'split') and not jz: fixed.append('foot_l')
    if kind == 'front': fixed.append('ball_r')
    bar, load = arms(r, ctx, C['load'], P, Rt, s2, th, fixed)
    return dict(bar=bar, load=load, fixed=fixed)

# ── 레터럴 런지: 왼발을 옆으로 내딛고 그쪽 무릎만 굽힌다 ──
LL = dict(load='chest', w=0.62, a1=28.0, lean1=32.0, step=True)
def ll_setup(ctx):
    C = dict(LL); C.update(ctx.vars); ctx.C = C; load_setup(ctx, C['load'] if C['load'] != 'goblet_side' else 'goblet')
def lateral_lunge(r, t, ctx):
    C = ctx.C; u = timing(t); s1 = sstep(0.0, 0.45, t) if C['step'] else 1.0; s2 = sstep(0.25, 1.0, t) if C['step'] else u
    xr = -0.12 if C['step'] else -C['w']/2; xl0 = 0.12 if C['step'] else C['w']/2; xl1 = xr+C['w']
    Al = foot_arc(V((xl0, r.ANK_Y, r.ANK_Z)), V((xl1, r.ANK_Y, r.ANK_Z)), s1, 0.06) if C['step'] else V((xl1, r.ANK_Y, r.ANK_Z)); Ar = V((xr, r.ANK_Y, r.ANK_Z))
    th = lerp(4.0, C['lean1'], s2); Rt = Rx(th); off_l = Rt@r.HIP_OFF; off_r = Rt@V((-r.HIP_OFF.x, r.HIP_OFF.y, r.HIP_OFF.z))
    a = math.radians(lerp(2, C['a1'], s2)); Kl = Al+V((0.02*s2, -math.sin(a), math.cos(a))).normalized()*r.L_S
    zb = Kl.z+0.10; Hx = lerp((Al.x+Ar.x)/2, Kl.x-off_l.x-0.03, s2)
    dxy = sqrt0(r.L_T**2-(zb-Kl.z)**2-(Hx+off_l.x-Kl.x)**2); Hy_b = Kl.y+dxy
    Hy = lerp(r.ANK_Y+0.0, Hy_b, s2); Hz = lerp(r.ANK_Z+(r.L_T+r.L_S)*0.99, zb, s2)
    P = V((Hx, Hy-off_l.y, Hz-off_l.z)); lim = (r.L_T+r.L_S)*0.995
    for _ in range(3):
        for A_, o_ in ((Al, off_l), (Ar, off_r)):
            d_ = P+o_-A_
            if d_.length > lim: P = A_+d_.normalized()*lim-o_
    rz = Rz(lerp(0, -8, s2)); r.torso(P, rz@Rt, neck=rz@Rx(th*0.5), head=rz@Rx(th*0.3), scap={s: (0.3, 0.0) for s, _ in SIDES})
    r.leg_ik('l', Al, V((0.35, -1, 0)), Rz(15)@V((0, -1, 0)), 15.0); r.leg_ik('r', Ar, V((-0.2, -1, 0)), Rz(-10)@V((0, -1, 0)), -10.0)
    kind = C['load']
    if kind == 'goblet_side':
        bar, load = arms(r, ctx, 'goblet', P, rz@Rt, s2, th, [])
    else: bar, load = arms(r, ctx, kind, P, rz@Rt, s2, th, [])
    return dict(bar=bar, load=load, fixed=['foot_r'] if C['step'] else ['foot_l', 'foot_r'])

# ── 스텝 업: 왼발은 박스 위에 고정, 오른발이 바닥에서 올라온다(t=1 박스 위에 섬). step_down 은 높은 데서 오른발을 내린다 ──
ST = dict(h=0.45, dy=-0.30, load='hang_db', lateral=False, down=False, poliquin=False)
def step_setup(ctx):
    C = dict(ST); C.update(ctx.vars); ctx.C = C; load_setup(ctx, C['load']); r = ctx.rig; M_ = ctx.mats
    if C['lateral']: box("box", (0.45, 0.55, C['h']), (0.22, r.ANK_Y-0.02, C['h']/2), M_.PAD, 0.02)
    elif C['poliquin']: o = box("wedge", (0.40, 0.42, C['h']), (0.11, r.ANK_Y+C['dy']+0.02, C['h']/2), M_.PAD, 0.02)
    else: box("box", (0.55, 0.45, C['h']), (0.05, r.ANK_Y+C['dy']+(0.13 if C['down'] else 0.0), C['h']/2), M_.PAD, 0.02)   # 스텝 다운은 앞 모서리에 선다
def step(r, t, ctx):
    C = ctx.C; h = C['h']; u = timing(t) if C['down'] else timing(t)
    if C['lateral']:
        Al = V((0.24, r.ANK_Y, r.ANK_Z+h)); Ar0 = V((-0.12, r.ANK_Y, r.ANK_Z)); Ar1 = V((0.02, r.ANK_Y+0.02, r.ANK_Z+h+0.05))
    else:
        y = r.ANK_Y+C['dy']; Al = V((0.11, y, r.ANK_Z+h)); Ar0 = V((-0.11, r.ANK_Y+0.20, r.ANK_Z)); Ar1 = V((-0.13, y+0.05, r.ANK_Z+h+0.06))
    heel_r = 0.0
    if C['down']:   # 위에 서 있다가 오른발을 내려 바닥을 톡 친다
        T_ = V((-0.11, Al.y-0.30, r.ANK_Z+0.005)); Ar = Ar1.lerp(T_, sstep(0.0, 0.45, u)); Ar.z = lerp(Ar1.z+0.04, T_.z, sstep(0.35, 1.0, u)); heel_r = lerp(10.0, 25.0, u)
        s_ = 1-u
    else:
        s_ = u; lift = sstep(0.15, 0.40, t); Ar = Ar0.lerp(Ar1, sstep(0.40, 0.95, t)); Ar.z = lerp(r.ANK_Z, Ar1.z+0.05, sstep(0.12, 0.60, t))-0.05*sstep(0.80, 1.0, t); heel_r = lerp(0.0, 30.0, lift)*(1-sstep(0.6, 1.0, t))+10*sstep(0.6, 1.0, t)
    # 왼다리 무릎각: 바닥(s_=0)에서 박스 높이만큼 굽힘 → 위(s_=1)에서 편다
    Hx0 = 0.03; th = lerp(14.0, 4.0, s_); Rt = Rx(th); off = Rt@r.HIP_OFF
    top = Al.z+(r.L_T+r.L_S)*0.988; kz = Al.z+r.L_S*math.cos(math.radians(lerp(22, 2, s_)))
    a = math.radians(lerp(22, 2, s_)); K = Al+V((0, -math.sin(a), math.cos(a)))*r.L_S
    Hz = lerp(r.ANK_Z+(r.L_T+r.L_S)*0.95 if not C['down'] else K.z+0.25, top, s_)
    Hy = K.y+sqrt0(r.L_T**2-(off.x-K.x)**2-(Hz-K.z)**2) if Hz-K.z < r.L_T else K.y
    P = V((lerp(0.0, Hx0, 1-s_) if not C['lateral'] else lerp(0.0, 0.10, s_), Hy-off.y, Hz-off.z)); lim = (r.L_T+r.L_S)*0.993
    o_ = Rt@r.HIP_OFF; d_ = P+o_-Al
    if d_.length > lim: P = Al+d_.normalized()*lim-o_
    r.torso(P, Rt, neck=Rx(th*0.5), head=Rx(th*0.3), scap={s: (0.3, -0.5) for s, _ in SIDES})
    r.leg_ik('l', Al, V((0.10, -1, 0)), Rz(6)@V((0, -1, 0)), 6.0)
    Hr = r.chain_head('thigh_r'); dA = Ar-Hr
    if dA.length > (r.L_T+r.L_S)*0.99: Ar = Hr+dA.normalized()*(r.L_T+r.L_S)*0.99
    r.leg_ik('r', Ar, V((-0.05, -1, 0.2)), Rz(-6)@V((0, -1, 0)), -6.0, heel_r, False)
    bar, load = arms(r, ctx, C['load'], P, Rt, s_, th, [])
    return dict(bar=bar, load=load, fixed=['foot_l'])

# ── 피스톨: 왼발로 앉고 오른다리는 앞으로 뻗는다. shrimp=뒤로 접어 손으로 잡기, skater=뒤 무릎이 바닥 근처 ──
PI = dict(kind='pistol', a1=40.0, th1=40.0, drop=-0.02)
def pistol_setup(ctx):
    C = dict(PI); C.update(ctx.vars); ctx.C = C; local_pts(ctx)
def pistol(r, t, ctx):
    C = ctx.C; u = timing(t); kind = C['kind']; ax = 0.07
    Al = V((ax, r.ANK_Y, r.ANK_Z)); a = math.radians(lerp(3, C['a1'], u**0.8)); Kl = Al+V((0.0, -math.sin(a), math.cos(a)))*r.L_S
    th = lerp(4, C['th1'], u); Rt = Rx(th); off = Rt@r.HIP_OFF; top = Kl.z+sqrt0(r.L_T**2-(off.x-Kl.x)**2-0.05**2)
    Hz = lerp(top, Kl.z-C['drop'], u); Hy = Kl.y+sqrt0(r.L_T**2-(off.x-Kl.x)**2-(Hz-Kl.z)**2); P = V((0.0, Hy-off.y, Hz-off.z))
    r.torso(P, Rt, neck=Rx(th*0.5), head=Rx(th*0.3), scap={s: (0.5, 1.5*u) for s, _ in SIDES})
    r.leg('l', Kl, Al, Rz(8)@V((0, -1, 0)), 8.0)
    H = r.chain_head('thigh_r')
    if kind == 'pistol':
        b = math.radians(lerp(30, 82, u**0.6)); K = H+V((-0.02, -math.sin(b), -math.cos(b)))*r.L_T; c = b-math.radians(lerp(14, 4, u)); A = K+V((0, -math.sin(c), -math.cos(c)))*r.L_S
        r.leg('r', K, A, V((0, -math.cos(c-0.26), math.sin(c-0.26))), 0.0, -max(0.0, math.degrees(c)-15.0))   # 발 회전은 절대값: 다리가 앞으로 들리면 발끝도 같이 든다
    else:
        b = math.radians(lerp(-5, -40 if kind == 'skater' else -25, u)); K = H+V((-0.02, -math.sin(b), -math.cos(b)))*r.L_T
        c = math.radians(lerp(55, 115 if kind == 'shrimp' else 100, u)); A = K+V((0, math.sin(c), -math.cos(c)))*r.L_S
        r.leg('r', K, A, V((0, -0.2, -1)).normalized(), 0.0, 52.0)
    for s, sg in SIDES:
        if False and kind == 'shrimp' and s == 'r':
            A = r.chain_head('foot_r'); G = A+V((0, 0.06, 0.03)); r.arm(s, G, V((0, 0.2, -1)), V((-0.6, 0.6, -0.3)), V((1, 0, 0)), 0.9995); r.fingers(s); continue
        a2 = math.radians(lerp(20, 90, u)); S = r.chain_head('upperarm_'+s); d = V((sg*0.08, -math.sin(a2), -math.cos(a2))).normalized(); E = S+d*r.L_U; d2 = V((sg*0.05, -math.sin(a2+0.1), -math.cos(a2+0.1))).normalized()
        jointed(r, s, E, E+d2*r.L_F, d2, V((-sg, 0, 0)), V((sg*0.5, math.cos(a2), -math.sin(a2)))); r.fingers(s, 0.4)
    return dict(bar=None, load=[], fixed=['foot_l'])

# ── 시시 스쿼트: 앞꿈치로 서서 무릎을 앞으로, 무릎~머리는 한 직선으로 뒤로 기운다 ──
def sissy_setup(ctx): local_pts(ctx); box("post", (0.08, 0.08, 1.2), (-0.615, ctx.rig.ANK_Y-0.12, 0.60), ctx.mats.FRAME)   # 가는 기둥은 Wan 이 지운다
def sissy(r, t, ctx):
    u = timing(t); pitch = lerp(10, 48, u); fixed = []
    a = math.radians(lerp(4, 58, u)); b = math.radians(lerp(2, 35, u))
    for s, sg in SIDES:
        ball = V((sg*0.12, r.head0('ball_l').y, r.head0('ball_l').z)); A = r.ankle_from_ball(s, ball, sg*6, pitch); K = A+V((0, -math.sin(a), math.cos(a)))*r.L_S
        if s == 'l': Kl, Al = K, A
        fixed.append('ball_'+s)
    off = Rx(-math.degrees(b))@r.HIP_OFF; H = Kl+V((0, math.sin(b), math.cos(b)))*r.L_T; P = H-off; P.x = 0
    Rt = Rx(-math.degrees(b)*0.95); r.torso(P, Rt, neck=Rx(-math.degrees(b)*0.6), head=Rx(-math.degrees(b)*0.4+5))
    for s, sg in SIDES:
        A = r.ankle_from_ball(s, V((sg*0.12, r.head0('ball_l').y, r.head0('ball_l').z)), sg*6, pitch); K = A+V((0, -math.sin(a), math.cos(a)))*r.L_S
        r.leg(s, V((sg*Kl.x, K.y, K.z)), A, Rz(sg*6)@V((0, -1, 0)), sg*6, pitch, True)
    S = r.chain_head('upperarm_r'); G = V((-0.57, r.ANK_Y-0.12, S.z-0.38)); r.arm('r', G, V((0, -0.2, -1)), V((-0.6, 0.6, -0.5)), None, 0.9995); r.fingers('r')
    a2 = math.radians(lerp(30, 75, u)); S = r.chain_head('upperarm_l'); d = V((0.10, -math.sin(a2), -math.cos(a2))).normalized(); E = S+d*r.L_U
    jointed(r, 'l', E, E+d*r.L_F, d, V((-1, 0, 0)), V((0.5, math.cos(a2), -math.sin(a2)))); r.fingers('l', 0.4)
    return dict(bar=None, load=[], fixed=fixed)

# ── 티비알리스 레이즈: 벽에 기대고 뒤꿈치를 축으로 발끝을 든다 ──
def tib_setup(ctx):
    local_pts(ctx); r = ctx.rig; ctx.WY = r.ANK_Y+0.62; box("wall", (1.6, 0.10, 2.2), (0, ctx.WY+0.05, 1.1), ctx.mats.FRAME, 0.01); p0 = r.head0('pelvis')
    ctx.BK = [v-p0 for v in ctx.rest_v[::7] if abs(v.x) < 0.14 and p0.z-0.10 < v.z < r.head0('head').z]
def tibialis(r, t, ctx):
    u = timing(t); pitch = lerp(0, -28, u); fixed = []; lean = -11.0; Rt = Rx(lean)
    for s, sg in SIDES:
        heel = V((sg*0.11, r.ANK_Y+0.035, 0.017)); A = heel+(Rz(sg*6)@Rx(pitch))@V((0, -0.035, r.ANK_Z))
        if s == 'l': Al = A
    off = Rt@r.HIP_OFF; L = (r.L_T+r.L_S)*0.99; by = max((Rt@v).y for v in ctx.BK); Py = ctx.WY-0.004-by
    for _ in range(2): Hy = Py+off.y; dy = Hy-Al.y; Hz = Al.z+sqrt0(L**2-dy**2-(off.x-Al.x)**2)
    P = V((0, Py, Hz-off.z)); r.torso(P, Rt, neck=Rx(lean+8), head=Rx(lean+12))
    for s, sg in SIDES:
        heel = V((sg*0.11, r.ANK_Y+0.035, 0.017)); A = heel+(Rz(sg*6)@Rx(pitch))@V((0, -0.035, r.ANK_Z)); r.leg_ik(s, A, V((sg*0.1, -1, 0)), Rz(sg*6)@V((0, -1, 0)), sg*6, pitch); fixed.append('foot_'+s)
        hang(r, s, sg, 0.07, -0.05, curl=0.3)
    return dict(bar=None, load=[], fixed=[])

# ── 밴드 레터럴 워크: 반쯤 앉아 왼발이 옆으로 나가고 오른발이 따라온다(왕복 재생이 반대 방향 걸음) ──
def bw_setup(ctx):
    local_pts(ctx); ctx.MB = wire(ctx, "mini")
def band_walk(r, t, ctx):
    k = 0.42; th = 22.0; Rt = Rx(th); s1 = sstep(0.0, 0.5, t); s2 = sstep(0.5, 1.0, t); st = 0.20
    Al = foot_arc(V((0.13, r.ANK_Y, r.ANK_Z)), V((0.13+st, r.ANK_Y, r.ANK_Z)), s1, 0.05); Ar = foot_arc(V((-0.13, r.ANK_Y, r.ANK_Z)), V((-0.13+st, r.ANK_Y, r.ANK_Z)), s2, 0.05)
    cx = (Al.x+Ar.x)/2; off = Rt@r.HIP_OFF; a = math.radians(22); Kz = r.ANK_Z+r.L_S*math.cos(a); Hz = Kz+0.24; Hy = r.ANK_Y-r.L_S*math.sin(a)+sqrt0(r.L_T**2-0.24**2-0.01)
    P = V((cx, Hy-off.y, Hz-off.z)); r.torso(P, Rt, neck=Rx(th*0.5), head=Rx(th*0.3), scap={s: (0.3, 0.5) for s, _ in SIDES})
    r.leg_ik('l', Al, V((0.3, -1, 0)), Rz(8)@V((0, -1, 0)), 8.0); r.leg_ik('r', Ar, V((-0.3, -1, 0)), Rz(-8)@V((0, -1, 0)), -8.0)
    Kl = r.chain_head('calf_l'); Kr = r.chain_head('calf_r'); wire_to(ctx.MB, Kl+V((0.05, -0.02, 0.07)), Kr+V((-0.05, -0.02, 0.07)))
    arms(r, ctx, 'hips', P, Rt, 0.0, th, [])
    return dict(bar=None, load=[], fixed=[])

# ── 카프 레이즈 변형: 대표 계산식에 짐만 바꿔 얹는다 ──
def calf2_setup(ctx):
    import families.reps as RP
    C = dict(load='hang_db', ax=0.13); C.update(ctx.vars); ctx.C = C; load_setup(ctx, C['load']); ctx.RP = RP
    if C.get('block'): box("block", (0.60, 0.16, 0.05), (0, ctx.rig.head0('ball_l').y-0.02, 0.025), ctx.mats.RUBBER, 0.008)
    if C['load'] == 'machine':
        ctx.PAD = [box("spad", (0.12, 0.20, 0.08), (0, 0, 0), ctx.mats.PAD, 0.03) for _ in range(2)]; ctx.ARMB = [box("lever", (0.26, 0.06, 0.06), (0, 0, 0), ctx.mats.FRAME) for _ in range(2)]
def calf2(r, t, ctx):
    C = ctx.C; info = ctx.RP.calf(r, t, ctx); P, R = ctx.calf_P, ctx.calf_R; load = []; bar = None
    if C['load'] in ('back', 'smith'): bar, load = arms(r, ctx, 'back', P, R, timing(t), 0.0, [])
    elif C['load'] == 'machine':
        for i, (s, sg) in enumerate(SIDES): S = r.chain_head('upperarm_'+s); place_obj(ctx.PAD[i], S+V((-sg*0.03, 0.0, 0.12)))
        S = r.chain_head('upperarm_l')
        for i, (s, sg) in enumerate(SIDES): S_ = r.chain_head('upperarm_'+s); ctx.ARMB[i].location = V((sg*(abs(S_.x)+0.10), S_.y, S_.z+0.19))
        load = [(V((0, S.y, S.z)), 40.0)]
        for s, sg in SIDES: S = r.chain_head('upperarm_'+s); r.arm(s, S+V((sg*0.10, -0.06, 0.20)), V((0, 0.3, 1)), V((sg*0.6, -0.2, -1)), V((0, 1, 0)), 0.9995); r.fingers(s)
    elif C['load'] == 'band': bar, load = arms(r, ctx, 'band', P, R, timing(t), 0.0, [])
    elif C['load'] == 'hang_db': bar, load = arms(r, ctx, 'hang_db', P, R, timing(t), 0.0, [])
    if C.get('block'): info['fixed'] = ['ball_l', 'ball_r']
    return dict(bar=bar, load=load, fixed=info['fixed'])

# ── 시티드 카프: 앉아서 앞꿈치 고정, 무릎 위 짐이 뒤꿈치와 함께 오르내린다 ──
SC_ = dict(load='machine')
def scalf_setup(ctx):
    C = dict(SC_); C.update(ctx.vars); ctx.C = C; local_pts(ctx); M_ = ctx.mats; r = ctx.rig
    ctx.Hz = r.ANK_Z+r.L_S+0.02; box("seat", (0.42, 0.40, 0.06), (0, r.ANK_Y+r.L_T*0.82, ctx.Hz-0.11), M_.PAD, 0.02); box("stem", (0.08, 0.08, ctx.Hz-0.14), (0, r.ANK_Y+r.L_T*0.82, (ctx.Hz-0.14)/2), M_.FRAME)
    box("block", (0.50, 0.16, 0.05), (0, r.head0('ball_l').y-0.02, 0.025), M_.RUBBER, 0.008)
    if C['load'] == 'machine': ctx.KP = box("kpad", (0.46, 0.14, 0.07), (0, 0, 0), M_.PAD, 0.03); box("col", (0.08, 0.08, 1.0), (0, r.ANK_Y-0.20, 0.50), M_.FRAME)
    if C['load'] in ('back', 'smith'): ctx.BAR = barbell(ctx.col, M_)
    if C['load'] == 'smith':
        for sg in (-1, 1): box("rail", (0.05, 0.05, 2.10), (sg*0.62, r.ANK_Y-0.02, 1.05), M_.FRAME)
    if C['load'] == 'hang_db': ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
def seated_calf(r, t, ctx):
    C = ctx.C; u = timing(t); pitch = lerp(-12, 26, u); th = 6.0; Rt = Rx(th); off = Rt@r.HIP_OFF
    P = V((0, r.ANK_Y+r.L_T*0.80-off.y, ctx.Hz-off.z)); r.torso(P, Rt, neck=Rx(4), head=Rx(2)); fixed = []
    for s, sg in SIDES:
        ball = V((sg*0.13, r.head0('ball_l').y, r.head0('ball_l').z+0.07)); A = r.ankle_from_ball(s, ball, sg*4, pitch); r.leg_ik(s, A, V((0, -1, 1)), Rz(sg*4)@V((0, -1, 0)), sg*4, pitch, True); fixed.append('ball_'+s)
    Kl = r.chain_head('calf_l'); Kr = r.chain_head('calf_r'); top = (Kl+Kr)/2+V((0, 0.07, 0.105)); bar = None; load = []
    if C['load'] == 'machine': ctx.KP.location = top; load = [(top, 40.0)]
    elif C['load'] in ('back', 'smith'): bar = top+V((0, 0, 0.0)); ctx.BAR.location = bar; load = [(bar, BAR_KG)]
    for s, sg in SIDES:
        K = r.chain_head('calf_'+s)
        if C['load'] == 'hang_db': G = K+V((sg*0.0, 0.05, 0.13)); r.arm(s, G, V((0, -1, 0)), V((sg*0.8, 0.5, 0)), None, 0.9995); hold(ctx, s, G, V((1, 0, 0))); load.append((G, DB_KG))
        else: r.arm(s, top+V((sg*0.20, 0.0, 0.0)), V((0, -0.6, -0.8)), V((sg*0.8, 0.6, 0)), None, 0.9995)
        r.fingers(s)
    return dict(bar=bar, load=load, fixed=fixed)

# ── 동키 카프: 상체를 숙여 손은 받침, 앞꿈치는 블록 위 ──
def donkey_setup(ctx):
    local_pts(ctx); M_ = ctx.mats; r = ctx.rig; box("block", (0.50, 0.16, 0.06), (0, r.head0('ball_l').y-0.02, 0.03), M_.RUBBER, 0.008)
    box("rest", (0.60, 0.35, 0.06), (0, r.ANK_Y-0.82, 0.86), M_.PAD, 0.02); box("rstem", (0.08, 0.08, 0.83), (0, r.ANK_Y-0.82, 0.415), M_.FRAME)
    ctx.BP = box("hpad", (0.40, 0.18, 0.08), (0, 0, 0), M_.PAD, 0.03)
def donkey(r, t, ctx):
    u = timing(t); pitch = lerp(-10, 30, u); th = 80.0; Rt = Rx(th); fixed = []; As = {}
    for s, sg in SIDES: As[s] = r.ankle_from_ball(s, V((sg*0.12, r.head0('ball_l').y, r.head0('ball_l').z+0.08)), sg*4, pitch)
    off = Rt@r.HIP_OFF; A = As['l']; L = (r.L_T+r.L_S)*0.985; Hy = A.y+0.08; Hz = A.z+sqrt0(L**2-(Hy-A.y)**2-(off.x-A.x)**2); P = V((0, Hy-off.y, Hz-off.z))
    r.torso(P, Rt, neck=Rx(th-20), head=Rx(th-35))
    for s, sg in SIDES: r.leg_ik(s, As[s], V((0, -1, 0)), Rz(sg*4)@V((0, -1, 0)), sg*4, pitch, True); fixed.append('ball_'+s)
    for s, sg in SIDES: r.arm(s, V((sg*0.20, r.ANK_Y-0.80, 0.89+r.GRIP_N)), V((0, -1, 0)), V((sg*0.6, 0.6, 0)), None, 0.9995); r.fingers(s, 0.1)
    Hc = (r.chain_head('thigh_l')+r.chain_head('thigh_r'))/2; place_obj(ctx.BP, Hc+V((0, 0.03, 0.21)), Rt)
    return dict(bar=None, load=[(Hc, 30.0)], fixed=fixed+['hand_l', 'hand_r'])

# ── 불가리안 변형: 대표 계산식에 짐만 바꾼다 ──
def bg2_setup(ctx):
    import families.reps as RP
    RP.bg_setup(ctx); C = dict(load='back'); C.update(ctx.vars); ctx.C = C; ctx.RP = RP; db = ctx.DB; local_pts(ctx)
    ctx.BAR = barbell(ctx.col, ctx.mats)
    if C['load'] == 'smith':
        for sg in (-1, 1): box("rail", (0.05, 0.05, 2.10), (sg*0.62, ctx.rig.ANK_Y+0.07, 1.05), ctx.mats.FRAME)
def bg2(r, t, ctx):
    info = ctx.RP.bulgarian(r, t, ctx)
    for o in ctx.DB.values(): o.location = V((0, 0, -5))
    bar, load = arms(r, ctx, 'back', ctx.bg_P, ctx.bg_R, timing(t), 0.0, []); return dict(bar=bar, load=load, fixed=info['fixed'])

# ── 점프 런지: 왼발 앞 바닥 → 뛰어올라 공중에서 다리를 바꿈 → 오른발 앞 바닥(왕복 재생이 다시 바꾼다, REV-070) ──
JL = dict(stride=0.62, ax=0.11, h=0.20, th=7.0, knee_b=0.10)
def jl_setup(ctx):
    C = dict(JL); C.update(ctx.vars); ctx.C = C; load_setup(ctx, 'swing'); ctx.swing = 0.0
def jump_lunge(r, t, ctx):
    C = ctx.C; ax = C['ax']; st = C['stride']; yF = r.ANK_Y-st*0.55; yB = r.ANK_Y+st*0.45; sw = sstep(0.34, 0.66, t)
    bz = r.head0('ball_l').z; dyb = r.head0('ball_l').y-r.ANK_Y
    def feet(front_s):   # (앞발 발목, 뒷발 발목) — 뒷발은 앞꿈치를 딛고 뒤꿈치를 든다
        sgf = 1 if front_s == 'l' else -1; Af = V((sgf*ax, yF, r.ANK_Z)); Ab = r.ankle_from_ball('r' if front_s == 'l' else 'l', V((-sgf*ax, yB+dyb, bz)), -sgf*6.0, 48.0); return Af, Ab
    Af0, Ab0 = feet('l'); Af1, Ab1 = feet('r')
    Al = Af0.lerp(Ab1, sw); Ar = Ab0.lerp(Af1, sw); pl = lerp(0.0, 48.0, sw); pr = lerp(48.0, 0.0, sw)
    # 골반 높이: 바닥(무릎 약 90°) → 이륙(다리 거의 폄) → 최고점 → 착지 → 바닥
    a_f = math.radians(10.0); Kf = Af0+V((0, -math.sin(a_f), math.cos(a_f)))*r.L_S; zb = Kf.z+0.045
    zs = r.ANK_Z+sqrt0(((r.L_T+r.L_S)*0.97)**2-(st*0.5)**2)
    hz, = keys1(t, [(0.0, zb), (0.30, zs), (0.50, zs+C['h']), (0.70, zs), (1.0, zb)])
    lift = max(0.0, hz-zs)*0.85 if 0.30 < t < 0.70 else 0.0
    Al = Al+V((0, 0, lift+0.10*math.sin(math.pi*sw))); Ar = Ar+V((0, 0, lift+0.10*math.sin(math.pi*sw)))
    th = C['th']; Rt = Rx(th); off = Rt@r.HIP_OFF; yb = Kf.y+sqrt0(r.L_T**2-(off.x-Kf.x)**2-(zb-Kf.z)**2); rise = min(1.0, max(0.0, (hz-zb)/(zs-zb)))
    P = V((0, lerp(yb, (yF+yB)/2, rise)-off.y, hz-off.z)); lim = (r.L_T+r.L_S)*0.993
    for _ in range(3):
        for A_, sg in ((Al, 1), (Ar, -1)):
            o_ = Rt@V((sg*abs(r.HIP_OFF.x), r.HIP_OFF.y, r.HIP_OFF.z)); d_ = P+o_-A_
            if d_.length > lim: P = A_+d_.normalized()*lim-o_
    r.torso(P, Rt, neck=Rx(th*0.5), head=Rx(th*0.3), scap={s: (0.3, -0.5) for s, _ in SIDES})
    r.leg_ik('l', Al, V((0.05, -1, lerp(0.1, -0.2, sw))), Rz(lerp(6, -6, sw))@V((0, -1, 0)), lerp(6.0, -6.0, sw), pl, pl > 3)
    r.leg_ik('r', Ar, V((-0.05, -1, lerp(-0.2, 0.1, sw))), Rz(lerp(-6, 6, sw))@V((0, -1, 0)), lerp(-6.0, 6.0, sw), pr, pr > 3)
    ctx.swing = keys1(t, [(0.0, 10.0), (0.30, 70.0), (0.50, 60.0), (0.70, 40.0), (1.0, 10.0)])[0]
    bar, load = arms(r, ctx, 'swing', P, Rt, 0.0, th, [])
    return dict(bar=None, load=load, fixed=[])
def keys1(t, K):
    if t <= K[0][0]: return K[0][1:]
    for a, b in zip(K, K[1:]):
        if t <= b[0]:
            f = sstep(a[0], b[0], t); return tuple(lerp(x, y, f) for x, y in zip(a[1:], b[1:]))
    return K[-1][1:]

SOLVERS = {'squat': (sq_setup, squat), 'jump': (jump_setup, jump), 'lunge': (lunge_setup, lunge), 'lateral_lunge': (ll_setup, lateral_lunge), 'step': (step_setup, step),
           'pistol': (pistol_setup, pistol), 'sissy': (sissy_setup, sissy), 'tibialis': (tib_setup, tibialis), 'band_walk': (bw_setup, band_walk), 'calf2': (calf2_setup, calf2),
           'seated_calf': (scalf_setup, seated_calf), 'donkey': (donkey_setup, donkey), 'bg2': (bg2_setup, bg2), 'jump_lunge': (jl_setup, jump_lunge)}
