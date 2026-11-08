# SPDX-License-Identifier: GPL-3.0-or-later
"""엉덩이 접기 묶음 계산식(SPEC-040 Phase 4). 변형은 catalog 의 vars 로 고른다.
좌표: X 왼쪽+, -Y 앞, Z 위. Rx(+)=앞으로 숙임. t 0=시작 자세, 1=반대쪽 자세(왕복 재생).
선 자세 접기: 정강이 각 al(앞으로), 허벅지 각 ph(무릎에서 위·뒤로), 몸통 각 th 로 골반을 정한다(무릎 굽힘 = al+ph).
동작 근거는 실제 수행 관찰 메모(저장소 밖, 원형별)다."""
import math
from mathutils import Vector as V, Matrix
from rig import Rx, Ry, Rz, lerp, sstep, sqrt0
from scene import PLATE_R, barbell, box, cyl
from families.reps import (SIDES, BAR_KG, DB_KG, timing, dumbbell, hold, rot_to, wire, wire_to, grip_w, jointed, hang)
from families.squat_lunge import kettlebell, place_obj, local_pts, W_, KB_KG

def keys(t, K):
    """[(시각, 값...)] 를 선형 보간(키 사이는 sstep). 값이 여럿이면 튜플."""
    if t <= K[0][0]: return K[0][1:]
    for a, b in zip(K, K[1:]):
        if t <= b[0]:
            f = sstep(a[0], b[0], t); return tuple(lerp(x, y, f) for x, y in zip(a[1:], b[1:]))
    return K[-1][1:]

# ── 선 자세 공통 ──
def stand_frame(r, C, al, ph, th, spine=None, fz=0.0, scap=(0.0, 0.0), single=False):
    """정강이 al, 허벅지 ph, 몸통 th 로 골반·다리를 놓는다. spine=(s1,s2,s3,neck,head) 절대 각을 주면 척추를 따로 만다."""
    ax, toe = C['ax'], C['toe']; A = V((ax, r.ANK_Y+C.get('yA', 0.0), r.ANK_Z+fz)); tv = Rz(toe)@V((0, -1, 0)); a = math.radians(al)
    K = A+(V((0, 0, math.cos(a)))+tv*math.sin(a)).normalized()*r.L_S
    p = math.radians(ph); Lt = sqrt0(r.L_T**2-(r.HIP_OFF.x-K.x)**2); H = V((0, K.y+Lt*math.sin(p), K.z+Lt*math.cos(p)))
    R = Rx(th); off = R@r.HIP_OFF; P = V((0, H.y-off.y, H.z-off.z))
    if spine: r.torso(P, R, Rx(spine[0]), Rx(spine[1]), Rx(spine[2]), Rx(spine[3]), Rx(spine[4]), scap={s: scap for s, _ in SIDES})
    # [원본] else: r.torso(P, R, neck=Rx(th*C.get('neck', 0.55)), head=Rx(th*C.get('head', 0.35)), ...) — 깊게 숙이면 고개를 쳐든 모양(REV-071)
    elif 'neck' in C: r.torso(P, R, neck=Rx(th*C['neck']), head=Rx(th*C.get('head', 0.35)), scap={s: scap for s, _ in SIDES})
    else: r.torso(P, R, neck=Rx(th-min(15.0, th*0.2)), head=Rx(th-min(25.0, th*0.3)), scap={s: scap for s, _ in SIDES})   # [개선] 목은 몸통에 거의 중립, 시선은 바닥 앞
    for s, sg in SIDES:
        if single and s == 'r': continue
        r.leg(s, V((sg*K.x, K.y, K.z)), V((sg*A.x, A.y, A.z)), Rz(sg*toe)@V((0, -1, 0)), sg*toe)
    return P, R, A, K

def free_leg(r, C, R, u, th):
    """한 다리 동작의 오른다리: single 은 몸통과 일직선으로 뒤로, bstance 는 앞꿈치만 뒤에 댄다."""
    if C.get('single'):
        Hr = r.chain_head('thigh_r'); d = (R@V((0, 0, -1))).lerp(V((0, 0.22, -1)).normalized(), 1-sstep(0.0, 0.5, u)).normalized()
        A = Hr+d*(r.L_T+r.L_S)*0.96; A.x = -C['ax']+0.02
        r.leg_ik('r', A, R@V((0, -1, 0.1)), V((0, -1, 0)), 0.0, max(0.0, th*0.85)); return []
    if C.get('bstance'):
        ball = V((-C['ax'], r.head0('ball_r').y+C.get('bs_y', 0.30), r.head0('ball_r').z)); A = r.ankle_from_ball('r', ball, -4.0, 42.0)
        r.leg_ik('r', A, V((-0.1, -1, 0)), Rz(-4)@V((0, -1, 0)), -4.0, 42.0, True); return []
    return None

# ── 짐 ──
def load_setup(ctx, kind):
    M_ = ctx.mats; r = ctx.rig; local_pts(ctx); C = ctx.C
    if kind in ('bar', 'smith', 'back', 'cable', 'band_bar', 'deficit', 'rack'): ctx.BAR = barbell(ctx.col, M_)
    if kind in ('db2', 'db_side'): ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
    if kind in ('db1', 'db1v'): ctx.DB = {'r': dumbbell(ctx, "db_r")}
    if kind == 'kb1': ctx.KB = {'c': kettlebell(ctx, "kb_c")}
    if kind == 'kb1r': ctx.KB = {'r': kettlebell(ctx, "kb_r")}
    if kind == 'smith' or C.get('rails'):
        for sg in (-1, 1): box("rail", (0.05, 0.05, 2.10), (sg*0.62, r.ANK_Y+C.get('smith_dy', C.get('bar_dy', -0.09)), 1.05), M_.FRAME)   # [원본] 기본 -0.09 — 바(bar_dy)와 어긋났다
    if kind == 'cable':
        ctx.PUL = V((0, r.ANK_Y-0.80, 0.10)); ctx.W = wire(ctx); box("stack", (0.30, 0.20, 1.90), (0, r.ANK_Y-0.92, 0.95), M_.FRAME)
    if kind in ('band', 'band_bar', 'band_gm'): ctx.BD = [wire(ctx, "band") for _ in range(2)]
    if kind == 'trap':
        z = C['zb']; ctx.TR = []
        for sg in (-1, 1):
            ctx.TR.append(cyl("hdl", 0.016, 0.24, M_.STEEL, axis='Y')); ctx.TR.append(cyl("side", 0.02, 0.62, M_.STEEL, axis='Y'))
            ctx.TR.append(cyl("sleeve", 0.025, 0.42, M_.STEEL)); ctx.TR.append(cyl("plate", PLATE_R, 0.05, M_.RUBBER))
        ctx.TR.append(cyl("front", 0.02, 0.76, M_.STEEL)); ctx.TR.append(cyl("back", 0.02, 0.76, M_.STEEL))
    if kind in ('landmine', 'landmine1'):
        ctx.PIV = V((0 if kind == 'landmine' else -0.10, r.ANK_Y-1.75, 0.06)); box("lmbase", (0.20, 0.20, 0.06), tuple(ctx.PIV-V((0, 0, 0.03))), M_.FRAME)
        ctx.LM = cyl("lm", 0.014, 1.0, M_.STEEL, axis='Z', verts=24); ctx.LMP = cyl("lmp", PLATE_R*0.8, 0.05, M_.RUBBER, verts=64)
    if kind == 'rack':
        z = C['zb']-0.03
        for sg in (-1, 1):
            for dy in (-0.30, 0.30): box("up", (0.06, 0.06, 2.0), (sg*0.62, r.ANK_Y+C['bar_dy']+dy, 1.0), M_.FRAME)
            box("pin", (0.05, 0.75, 0.035), (sg*0.62, r.ANK_Y+C['bar_dy'], C['zb']-0.0315), M_.STEEL)   # [원본] z-0.032 — 바가 핀에서 3cm 떴다
    if C.get('fz'): box("plat", (0.80, 0.55, C['fz']), (0, r.ANK_Y-0.05, C['fz']/2), M_.PAD, 0.01)

def bar_hands(r, ctx, C, P, R, u, zb=None, by=None):
    """양손을 아래로 늘어뜨려 바·짐을 쥔다. zb 가 있으면 그 높이(바닥 들기), 없으면 팔 길이로 높이를 정한다. 반환 (bar, load, fixed)"""
    kind = C['load']; grip = C.get('grip', {'bar': 0.255, 'smith': 0.255, 'cable': 0.22, 'band_bar': 0.24, 'deficit': 0.255, 'rack': 0.255, 'db2': 0.19, 'trap': 0.29, 'kb1': 0.045, 'band': 0.20, 'db_side': 0.28, 'db1v': 0.045}.get(kind, 0.2))
    S = r.chain_head('upperarm_l'); by = by if by is not None else r.ANK_Y+C['bar_dy'] if not C.get('follow') else S.y+C.get('follow_dy', -0.02); L_ = (r.L_U+r.L_F)*C.get('reach', 0.992)   # follow: 어깨 바로 아래(제퍼슨)
    W_y = by-r.GRIP_N if kind not in ('trap', 'db_side') else by
    z = zb if zb is not None else S.z-sqrt0(L_**2-(S.x-grip)**2-(S.y-W_y)**2)-r.GRIP_F
    bar = V((0, by, z)); load = []
    for s, sg in SIDES:
        if kind in ('trap', 'db_side'):   # 중립 그립: 손잡이가 앞뒤 방향
            G = bar+V((sg*grip, 0, 0)); r.arm(s, G, V((0, 0, -1)), V((sg*0.6, 0.8, 0)), V((0, -1, 0)), 0.9995)
        elif kind in ('kb1', 'db1v'):
            G = bar+V((sg*grip, 0, 0)); r.arm(s, G, V((0, 0, -1)), V((sg*0.4, 0.9, 0)), V((-sg*0.3, -1, 0)).normalized(), 0.9995)
        else: G = bar+V((sg*grip, 0, 0)); r.arm(s, G, V((0, 0, -1)), V((sg*0.35, 0.9, 0)), None, 0.9995)
        r.fingers(s)
    if kind in ('bar', 'smith', 'deficit', 'rack', 'cable', 'band_bar'): ctx.BAR.location = bar; load = [(bar, BAR_KG)]
    if kind == 'cable': wire_to(ctx.W, bar, ctx.PUL)
    if kind in ('band', 'band_bar'):
        for i, (s, sg) in enumerate(SIDES): wire_to(ctx.BD[i], V((sg*(C['ax']-0.02), r.ANK_Y-0.02, r.ANK_Z*0.15)), bar+V((sg*grip, 0, 0)))
    if kind == 'db2':
        for s, sg in SIDES: hold(ctx, s, bar+V((sg*grip, 0, 0)), V((1, 0, 0)))
        load = [(bar, DB_KG*2)]
    if kind == 'db_side':
        for s, sg in SIDES: hold(ctx, s, bar+V((sg*grip, 0, 0)), V((0, 1, 0)))
        load = [(bar, DB_KG*2)]
    if kind == 'kb1': place_obj(ctx.KB['c'], bar+V((0, 0, -0.035))); load = [(bar, KB_KG)]
    if kind == 'db1v': place_obj(ctx.DB['r'], bar+V((0, 0, -0.10))); rot_to(ctx.DB['r'], V((0, 0, 1))); load = [(bar, DB_KG*(1.0 if C.get('follow') else 1.5))]
    if kind == 'trap':
        T = ctx.TR; y0 = by
        for i, sg in enumerate((1, -1)):
            h, sd, sl, pl = T[4*i:4*i+4]; h.location = V((sg*grip, y0, z)); sd.location = V((sg*(grip+0.06), y0, z)); zp = z-(C['zb']-(PLATE_R-0.012)); sl.location = V((sg*(grip+0.06+0.25), y0, zp)); pl.location = V((sg*(grip+0.06+0.20), y0, zp))   # 원판은 바닥 자세에서 바닥에 닿게(손잡이는 높게)
        T[8].location = V((0, y0-0.31, zp)); T[9].location = V((0, y0+0.31, zp)); load = [(bar, BAR_KG)]
    return bar, load

def single_hand(r, ctx, C, P, R, u, by=None):
    """오른손만 짐(반대쪽 다리 지지). 왼손은 늘어뜨리거나 허리에."""
    kind = C['load']; S = r.chain_head('upperarm_r'); L_ = (r.L_U+r.L_F)*0.985; by = r.ANK_Y+C['bar_dy'] if by is None else by; x = {'db1': -0.25, 'landmine1': -0.10}.get(kind, -0.16)
    z = S.z-sqrt0(L_**2-(S.x-x)**2-(S.y-by)**2)-r.GRIP_F; G = V((x, by, z)); load = []
    if kind == 'landmine1':
        r.arm('r', G, V((0, -0.2, -1)).normalized(), V((-0.35, 0.9, 0)), V((0, -1, 0)), 0.9995); end = G+V((0, -0.03, -0.02)); wire_to(ctx.LM, ctx.PIV, end); d = (end-ctx.PIV).normalized(); ctx.LMP.location = end-d*0.16; rot_to(ctx.LMP, d); load = [(G, 20.0)]
    else:
        r.arm('r', G, V((0, 0, -1)), V((-0.35, 0.9, 0)), V((0, -1, 0)), 0.9995)
        if kind == 'db1': hold(ctx, 'r', G, V((0, 1, 0))); load = [(G, DB_KG)]
        if kind == 'kb1r': place_obj(ctx.KB['r'], G+V((0, 0, -0.035))); load = [(G, KB_KG)]
    r.fingers('r')
    Sl = r.chain_head('upperarm_l'); Gl = V((Sl.x+0.03, Sl.y-0.02, Sl.z-L_-r.GRIP_F)) if kind != 'none_out' else Sl+V((0.40, -0.05, -0.55))
    r.arm('l', Gl, V((0, 0, -1)), V((0.35, 0.9, 0)), V((0, -1, 0)), 0.9995); r.fingers('l', 0.4)
    return G, load

# ── 선 자세 접기(RDL·스티프 레그·굿모닝·제퍼슨): al·ph·th 를 키로 준다 ──
HG = dict(ax=0.135, toe=8.0, load='bar', bar_dy=-0.145, K=[(0.0, 1.5, 2.0, 1.0), (1.0, 4.0, 27.0, 62.0)], scap0=(-1.0, 1.0), scap1=(0.0, 3.5))
def hinge_setup(ctx):
    C = dict(HG); C.update(ctx.vars); ctx.C = C; load_setup(ctx, C['load'])
    if C.get('box'): box("box", (0.55, 0.45, C['fz']), (0, ctx.rig.ANK_Y-0.05, C['fz']/2), ctx.mats.PAD, 0.015)
def hinge(r, t, ctx):
    C = ctx.C; u = timing(t); al, ph, th = keys(u, C['K']); fz = C.get('fz', 0.0)
    sc = tuple(lerp(a, b, u) for a, b in zip(C['scap0'], C['scap1'])); spine = None
    if C.get('curl'):   # 제퍼슨: 위에서부터 척추를 차례로 만다(골반은 덜)
        c = u; spine = (th*0.55+18*c, th*0.55+40*c, th*0.55+62*c, th*0.55+75*c, th*0.55+80*c); th = th*0.55
    single = bool(C.get('single'))
    P, R, A, K = stand_frame(r, C, al, ph, th, spine, fz, sc, single)
    fixed = ['foot_l'] if single or C.get('bstance') else ['foot_l', 'foot_r']
    fl = free_leg(r, C, R, u, th)
    if C['load'] in ('back', 'band_gm') or (C['load'] == 'smith' and C.get('gm')):   # 바를 등에
        bar = W_(P, R, ctx, ctx.L_BACK); load = [(bar, BAR_KG)]
        if C['load'] != 'band_gm': ctx.BAR.location = bar
        for s, sg in SIDES:
            if C['load'] == 'band_gm':
                G = r.chain_head('upperarm_'+s)+R@V((-sg*0.02, -0.13, 0.02)); r.arm(s, G, R@V((0, 0.30, 0.95)), R@V((sg*0.45, -0.75, -0.45)), R@V((0, 1, 0)), 0.9995)
                wire_to(ctx.BD[0 if s == 'l' else 1], V((sg*(C['ax']-0.02), r.ANK_Y-0.02, r.ANK_Z*0.15)), bar+R@V((sg*0.10, 0, 0.02)))
            else: r.arm(s, bar+V((sg*0.40, 0, 0)), R@V((sg*0.30, 0.12, 1)), R@V((sg*0.75, 0.55, -0.75)), None, 0.9995)
            r.fingers(s)
        return dict(bar=bar if C['load'] != 'band_gm' else None, load=load, fixed=fixed)
    by = r.ANK_Y+lerp(C['top_dy'], C['bar_dy'], u*u) if 'top_dy' in C else None   # top_dy: 서 있을 때 손이 배·허벅지 앞에 오도록(가운데로 모아 쥐는 짐)
    if single or C['load'] in ('db1', 'kb1r', 'landmine1'):
        G, load = single_hand(r, ctx, C, P, R, u, by); return dict(bar=None, load=load, fixed=fixed)
    if C['load'] == 'landmine':
        S = r.chain_head('upperarm_l'); L_ = (r.L_U+r.L_F)*0.985; z = S.z-sqrt0(L_**2-(S.x-0.04)**2-(S.y-by)**2)-r.GRIP_F; G = V((0, by, z))
        for s, sg in SIDES: r.arm(s, G+V((sg*0.04, 0, 0)), V((-sg*0.2, -0.25, -1)).normalized(), V((sg*0.4, 0.9, 0)), V((0, -1, 0)), 0.9995); r.fingers(s)
        end = G+V((0, -0.04, -0.02)); wire_to(ctx.LM, ctx.PIV, end); d = (end-ctx.PIV).normalized(); ctx.LMP.location = end-d*0.15; rot_to(ctx.LMP, d)
        return dict(bar=None, load=[(G, 20.0)], fixed=fixed)
    bar, load = bar_hands(r, ctx, C, P, R, u, None, by)
    return dict(bar=bar if C['load'] in ('bar', 'smith', 'cable') else None, load=load, fixed=fixed)

# ── 바닥에서 들기(데드리프트 변형): al·ph 를 키로 주고, 손이 zb(u) 에 닿도록 몸통 각 th 를 푼다 ──
# [원본] al·th 를 키로 주고 ph 를 풀었다 — 상체가 서 있을 때 허벅지를 젖히면 어깨가 바에서 멀어져 손이 오히려 올라가
#        (비단조) 앉은 자세 해가 나왔다(무게중심이 발뒤꿈치 뒤 15cm). 상체 숙임은 손 높이를 단조롭게 낮춘다.
FL = dict(ax=0.135, toe=10.0, load='bar', bar_dy=-0.105, zb=PLATE_R-0.012, K=[(0.0, 1.5, 0.0), (0.55, 8.0, 25.0), (1.0, 17.0, 68.0)], reach=0.995)
def floor_setup(ctx):
    C = dict(FL); C.update(ctx.vars); ctx.C = C; load_setup(ctx, C['load'])
def floor_lift(r, t, ctx):
    C = ctx.C; u = timing(t); al, ph = keys(u, C['K']); fz = C.get('fz', 0.0); grip_x = {'trap': 0.29, 'kb1': 0.045, 'db_side': 0.28, 'db2': 0.19, 'db1v': 0.045}.get(C['load'], C.get('grip', 0.255))
    sc = (lerp(0.0, -2.5, u), lerp(0.0, 2.5, u)); by = r.ANK_Y+lerp(C.get('top_dy', C['bar_dy']), C['bar_dy'], u*u); L_ = (r.L_U+r.L_F)*C['reach']; Wy = by-r.GRIP_N if C['load'] not in ('trap', 'db_side') else by   # top_dy: 케틀벨·덤벨 하나는 서면 허벅지 앞, 내려가면 발 사이
    def hand_z(a, p, th):
        stand_frame(r, C, a, p, th, None, fz, sc); S = r.chain_head('upperarm_l'); return S.z-sqrt0(L_**2-(S.x-grip_x)**2-(S.y-Wy)**2)-r.GRIP_F
    if not hasattr(ctx, 'ZT'): ctx.ZT = hand_z(*keys(0.0, C['K']), 0.0)   # 선 자세(키 0)의 손 높이
    zb = lerp(ctx.ZT, C['zb'], u); lo, hi = 0.0, 88.0
    if C['load'] in ('trap', 'db_side') and u > 1e-6:   # 손잡이가 몸 옆: 어깨를 손잡이 바로 위에 두고(몸통 각) 손이 zb 에 닿는 허벅지 각을 푼다
        def th_over(p):
            a_, b_ = 0.0, 80.0
            for _ in range(22):
                m_ = (a_+b_)/2; stand_frame(r, C, al, p, m_, None, fz, sc)
                if r.chain_head('upperarm_l').y > Wy+C.get('sh_dy', -0.03): a_ = m_
                else: b_ = m_
            return (a_+b_)/2
        p0, p1 = 0.0, 130.0
        for _ in range(22):
            pm = (p0+p1)/2
            if hand_z(al, pm, th_over(pm)) > zb: p0 = pm
            else: p1 = pm
        ph = (p0+p1)/2; th = th_over(ph); P, R, A, K = stand_frame(r, C, al, ph, th, None, fz, sc)
        bar, load = bar_hands(r, ctx, C, P, R, u, None, by); return dict(bar=None, load=load, fixed=['foot_l', 'foot_r'])   # 높이는 팔 길이로(풀이가 zb 에 맞춘다)
    for m in range(1, 89):   # 옆으로 쥐는 짐은 너무 숙이면 어깨가 손잡이를 지나 손이 다시 오른다 → 처음 닿는 구간만
        if hand_z(al, ph, float(m)) <= zb: lo, hi = float(m-1), float(m); break
    for _ in range(24):
        m = (lo+hi)/2
        if hand_z(al, ph, m) > zb: lo = m
        else: hi = m
    th = (lo+hi)/2 if u > 1e-6 else 0.0; P, R, A, K = stand_frame(r, C, al, ph, th, None, fz, sc)
    bar, load = bar_hands(r, ctx, C, P, R, u, zb if u > 1e-6 else None, by)
    return dict(bar=bar if C['load'] in ('bar', 'smith', 'deficit', 'rack', 'band_bar') else None, load=load, fixed=['foot_l', 'foot_r'])

# ── 케틀벨 스윙: 하이크(다리 사이 뒤) ↔ 어깨 높이. 팔은 편 채 엉덩이로 ──
def swing_setup(ctx):
    C = dict(ax=0.17, toe=12.0, load='kb1'); C.update(ctx.vars); ctx.C = C; local_pts(ctx); M_ = ctx.mats
    if C['load'] == 'kb1': ctx.KB = {'c': kettlebell(ctx, "kb_c")}
    else: ctx.DB = {'r': dumbbell(ctx, "db_r")}
def kb_swing(r, t, ctx):
    C = ctx.C; u = timing(t)
    al, ph, th, arm = keys(u, [(0.0, 5.0, 25.0, 68.0, -28.0),   # [원본] (9,52,62) 하이크가 스쿼트처럼 보였다(REV-071)
                              (0.45, 5.0, 25.0, 30.0, 35.0), (1.0, 1.0, 1.0, -2.0, 88.0)])
    P, R, A, K = stand_frame(r, C, al, ph, th, None, 0.0, (0.0, lerp(1.0, 2.5, u)))
    a = math.radians(arm); Sl = r.chain_head('upperarm_l'); Sr = r.chain_head('upperarm_r'); Sc = (Sl+Sr)/2; L_ = (r.L_U+r.L_F)*0.98
    d = V((0, -math.sin(a), -math.cos(a))); G = Sc+d*L_; G.x = 0.0
    for s, sg in SIDES:
        Gs = G+V((sg*0.045, 0, 0)); r.arm(s, Gs, d, V((sg*0.5, math.cos(a), -math.sin(a)*0.3)), None, 0.9995); r.fingers(s)
    if C['load'] == 'kb1':
        place_obj(ctx.KB['c'], G+d*0.09, Matrix.Rotation(math.atan2(d.y, -d.z), 3, 'X'))   # [원본] -atan2 — 종이 팔 반대쪽(앞뒤 뒤집힘)으로 매달렸다(REV-071)
    else: place_obj(ctx.DB['r'], G+d*0.10); rot_to(ctx.DB['r'], d)
    return dict(bar=None, load=[(G, KB_KG)], fixed=['foot_l', 'foot_r'])

# ── 풀 스루: 뒤 낮은 도르래 줄을 다리 사이로 잡고 엉덩이를 접었다 편다 ──
def pt_setup(ctx):
    C = dict(ax=0.20, toe=14.0, load='cable'); C.update(ctx.vars); ctx.C = C; local_pts(ctx); M_ = ctx.mats; r = ctx.rig
    ctx.PUL = V((0, r.ANK_Y+0.95, 0.12)); ctx.W = wire(ctx, "rope")
    if C['load'] == 'cable': box("stack", (0.30, 0.20, 1.90), (0, r.ANK_Y+1.07, 0.95), M_.FRAME)
    else: box("post", (0.08, 0.08, 0.6), (0, r.ANK_Y+0.95, 0.3), M_.FRAME)
def pull_through(r, t, ctx):
    C = ctx.C; u = timing(t); al, ph, th = keys(u, [(0.0, 2.0, 1.0, 1.0), (1.0, 10.0, 34.0, 68.0)])
    P, R, A, K = stand_frame(r, C, al, ph, th, None, 0.0, (lerp(-0.5, -2.0, u), lerp(0.0, 2.5, u)))
    Hc = (r.chain_head('thigh_l')+r.chain_head('thigh_r'))/2; Kc = (r.chain_head('calf_l')+r.chain_head('calf_r'))/2
    G = Hc.lerp(Kc, lerp(0.15, 0.55, u))+V((0, lerp(-0.26, 0.02, u**1.6), lerp(0.0, -0.02, u))); G.x = 0   # [원본] 앞 -0.13(배 관통)
    for s, sg in SIDES: r.arm(s, G+V((sg*0.035, 0, 0)), (G-r.chain_head('upperarm_'+s)).normalized(), V((sg*0.6, 0.6, 0)), V((0, -1, 0)), 0.9995); r.fingers(s)
    wire_to(ctx.W, G, ctx.PUL)
    return dict(bar=None, load=[(G, 15.0)], fixed=['foot_l', 'foot_r'])

# ════ 누워서 엉덩이 들기(브릿지·힙 쓰러스트·프로그 펌프) ════
# 누운 몸: Rx(-90) 이 수평(머리 +Y). |th| 가 90 보다 크면 골반이 어깨보다 높다.
BR = dict(piv_z=0.155, th0=-89.0, th1=-120.0, load='none', ax=0.15, kf=0.0, bench=0.0, toe=6.0)
def br_setup(ctx):
    C = dict(BR); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; local_pts(ctx); ctx.s3 = r.head0('spine_03'); p0 = r.head0('pelvis')
    T = C['bench']; ctx.PIV = V((0, 0.0, (T+0.085) if T else C['piv_z']))
    if T: box("pad", (0.70, 0.30, T), (0, 0.17, T/2), M_.PAD, 0.024)   # [원본] 높이 T-0.02 — 바닥에서 떴다
    R1 = Rx(C['th1']); P1 = ctx.PIV-R1@(ctx.s3-p0); H1 = P1+R1@r.HIP_OFF; K1 = H1+R1@V((0, 0, -1))*r.L_T; ctx.Ay = K1.y-C['kf']
    ld = C['load']
    if ld in ('bar', 'smith'): ctx.BAR = barbell(ctx.col, M_)
    if ld == 'smith':
        for sg in (-1, 1): box("rail", (0.05, 0.05, 2.10), (sg*0.62, H1.y-0.02, 1.05), M_.FRAME)
    if ld == 'db': ctx.DB = {'c': dumbbell(ctx, "db_c")}
    if ld in ('band', 'mini'): ctx.BD = [wire(ctx, "band") for _ in range(2)]
    if ld == 'machine':
        ctx.HP = box("hpad", (0.46, 0.12, 0.08), (0, 0, 0), M_.PAD, 0.03); ctx.ARMS = [cyl("lever", 0.02, 0.5, M_.FRAME, axis='Z') for _ in range(2)]
        box("base", (0.80, 1.40, 0.02), (0, -0.30, 0.0), M_.FRAME)
    if C.get('slide'): ctx.SLD = [cyl("glide", 0.09, 0.012, M_.HUB, axis='Z') for _ in range(2)]
    if C.get('ball'): ctx.BALL = None; import bpy; bpy.ops.mesh.primitive_uv_sphere_add(radius=0.275, segments=64, ring_count=32); ctx.BALL = bpy.context.object; ctx.BALL.name = "ball"; ctx.BALL.data.materials.append(M_.HUB); [setattr(q, 'use_smooth', True) for q in ctx.BALL.data.polygons]
def bridge(r, t, ctx):
    C = ctx.C; u = timing(t); th = lerp(C['th0'], C['th1'], u); R_ = Rx(th); P = ctx.PIV-R_@(ctx.s3-r.head0('pelvis'))
    if C['bench']: r.torso(P, R_, neck=Rx(th+22), head=Rx(th+20), scap={s: (0.0, 0.0) for s, _ in SIDES})
    else:   # 바닥 브릿지: 날개뼈(위 등)는 바닥에 붙이고 허리·골반만 말아 올린다 — [원본] 몸통 통째 회전(위 등이 바닥 관통)
        s3 = max(th, -96.0); sp = (Rx(th), Rx((th+s3)/2), Rx(s3), Rx(lerp(-84, -88, u)), Rx(lerp(-82, -76, u)))
        for _ in range(2):
            r.torso(P, R_, *sp, scap={s: (0.0, 0.0) for s, _ in SIDES}); P = P+(ctx.PIV-r.chain_head('spine_03'))
        r.torso(P, R_, *sp, scap={s: (0.0, 0.0) for s, _ in SIDES})
    fixed = []; Ay = ctx.Ay; feet = []
    for s, sg in SIDES:
        if C.get('single') and s == 'r':   # 한 다리: 오른다리는 무릎을 굽혀 들어 둔다
            H = r.chain_head('thigh_r'); f = math.radians(95); d1 = (R_@V((0, -math.sin(f), -math.cos(f)))).normalized(); K = H+d1*r.L_T; A = K+(R_@V((0, 0, -1))).normalized()*r.L_S*0.999
            r.leg('r', K, A, R_@V((0, -1, 0)), 0.0, th+15.0); continue   # 발 각은 몸통을 따라간다
        if C.get('frog'):   # 발바닥을 맞대고 무릎을 벌린다
            A = V((sg*0.10, Ay, r.ANK_Z+0.04)); r.leg_ik(s, A, V((sg*1.0, 0, 0.35)), Rz(sg*45)@V((0, -1, 0)), sg*45.0, 0.0); fixed.append('foot_'+s); continue
        if C.get('slide'):   # 슬라이딩 컬: 엉덩이를 든 채 뒤꿈치를 끌어온다
            y = lerp(Ay-0.42, Ay, u); A = V((sg*C['ax'], y, r.ANK_Z+0.075*math.sin(math.radians(25.0*(1-u))))); r.leg_ik(s, A, V((sg*0.15, -0.2, 1)), V((0, -1, 0)), 0.0, -25.0*(1-u)); ctx.SLD[0 if s == 'l' else 1].location = V((sg*C['ax'], y-0.03, 0.006)); feet.append(A); continue   # 발끝을 들면 뒤꿈치가 내려가 발목을 올린다
        if C.get('ball'):
            y = lerp(Ay-0.32, Ay-0.10, u); A = V((sg*0.10, y, 0.66)); r.leg_ik(s, A, V((sg*0.1, -0.2, 1)), V((0, -0.5, 0.87)), 0.0, -62.0); feet.append(A); continue   # 뒤꿈치를 공에, 발끝은 위로
        A = V((sg*C['ax'], Ay, r.ANK_Z+0.075*math.sin(math.radians(max(0.0, -C.get('pitch', 0.0)))))); r.leg_ik(s, A, V((sg*0.20, -0.45, 1)), Rz(sg*C['toe'])@V((0, -1, 0)), sg*C['toe'], C.get('pitch', 0.0)); fixed.append('foot_'+s)
    if C.get('ball') and feet: c = (feet[0]+feet[1])/2; ctx.BALL.location = V((0, c.y-0.03, 0.275))   # 55cm 공, 뒤꿈치 바로 아래
    Hc = (r.chain_head('thigh_l')+r.chain_head('thigh_r'))/2; n = R_@V((0, -1, 0)); ld = C['load']; load = []; bar = None
    if ld in ('bar', 'smith', 'db', 'machine', 'band'):
        top = Hc+n*({'bar': 0.19, 'smith': 0.19, 'db': 0.25}.get(ld, 0.13))+R_@V((0, 0, 0.05 if ld == 'db' else -0.03)); top.x = 0   # 덤벨은 허벅지 원판과 겹치지 않게 배 쪽으로
        if ld in ('bar', 'smith'): top.z = max(top.z, PLATE_R-0.012); ctx.BAR.location = top; bar = top; load = [(top, BAR_KG)]
        if ld in ('machine', 'db'):   # 패드·덤벨은 엉덩이 접힌 곳(허벅지 위)에: 몸통·허벅지 법선의 가운데로
            td = ((r.chain_head('calf_l')+r.chain_head('calf_r'))/2-Hc).normalized(); tn = (td.cross(V((1, 0, 0)))); tn = tn if tn.dot(n) > 0 else -tn; m = (n+tn).normalized()
            top = Hc+td*0.05+m*(0.20 if ld == 'machine' else 0.27); top.x = 0
        if ld == 'db': place_obj(ctx.DB['c'], top); rot_to(ctx.DB['c'], V((1, 0, 0))); load = [(top, DB_KG*1.5)]
        if ld == 'machine':
            place_obj(ctx.HP, top, R_); [wire_to(ctx.ARMS[i], top+V((sg*0.26, 0, 0)), V((sg*0.40, top.y-0.45, 0.30))) for i, sg in enumerate((1, -1))]
        if ld == 'band':
            for i, sg in enumerate((1, -1)): wire_to(ctx.BD[i], top+V((sg*0.16, 0, 0.02)), V((sg*0.42, top.y, 0.01)))
        gx = {'bar': 0.30, 'smith': 0.30, 'db': 0.24, 'machine': 0.30, 'band': 0.20}[ld]
        for s, sg in SIDES:
            S = r.chain_head('upperarm_'+s); G = top+V((sg*gx, 0, 0.02 if ld == 'band' else 0)); F = (G-S).normalized(); r.arm(s, G, F, V((sg*0.8, 0, 0))+R_@V((0, 0.7, 0.1)), None, 0.9995); r.fingers(s, 0.8 if ld != 'band' else 0.4)
    else:   # 손: 바닥(브릿지) 또는 벤치 위(힙 쓰러스트)
        for s, sg in SIDES:
            if C['bench']: G = V((sg*0.34, ctx.PIV.y+0.02, C['bench']+0.012)); F = V((sg*0.2, -1, 0)).normalized()
            else: S = r.chain_head('upperarm_'+s); G = V((sg*0.30, S.y-0.42, 0.045)); F = V((sg*0.1, -1, 0)).normalized()   # [원본] z 0.012(손이 바닥 관통)
            r.arm(s, G, F, V((sg*1, 0.2, 0.3)), None, 0.9995); r.fingers(s, 0.1)
        if ld == 'mini':
            Kl = r.chain_head('calf_l'); Kr = r.chain_head('calf_r'); wire_to(ctx.BD[0], Kl+V((0.06, 0, 0.0)), Kr+V((-0.06, 0, 0.0))); ctx.BD[1].location = V((0, 0, -3))
    return dict(bar=bar, load=load, fixed=fixed+(['spine_03'] if not C['bench'] else []))

# ════ 무릎 꿇고 엉덩이 접기(닐링 힙 쓰러스트·노르딕·리버스 노르딕·GHR) ════
KN = dict(kz=0.07, kx=0.13, mode='kneel_thrust', load='none')
def kn_setup(ctx):
    C = dict(KN); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; local_pts(ctx); kz = C['kz']
    ctx.K0 = V((C['kx'], r.ANK_Y-0.10, kz))
    if C['mode'] in ('nordic', 'reverse_nordic'): box("mat", (0.60, 0.70, 0.03), (0, ctx.K0.y+0.20, 0.015), M_.PAD, 0.01)
    if C['mode'] == 'nordic': box("roll", (0.50, 0.10, 0.10), (0, ctx.K0.y+r.L_S-0.03, 0.21), M_.PAD, 0.03)   # 리뷰가 3cm 뜬다고 봤으나 내리면 발목을 4cm 관통(REV-071 기각)
    if C['mode'] == 'ghr':
        y = ctx.K0.y; box("kpad", (0.42, 0.24, 0.10), (0, y-0.16, kz-0.16), M_.PAD, 0.04); box("fplate", (0.42, 0.04, 0.30), (0, y+r.L_S+0.11, kz+0.02), M_.FRAME); box("frame", (0.10, 1.10, 0.06), (0, y+0.20, kz-0.40), M_.FRAME); box("leg", (0.08, 0.08, kz-0.43), (0, y+0.20, (kz-0.43)/2), M_.FRAME)
    if C['load'] == 'band': ctx.BD = [wire(ctx, "band") for _ in range(2)]; box("post", (0.08, 0.08, 0.7), (0, ctx.K0.y+0.95, 0.35), M_.FRAME)
    if C['load'] == 'smith':
        ctx.BAR = barbell(ctx.col, M_)
        for sg in (-1, 1): box("rail", (0.05, 0.05, 2.10), (sg*0.62, ctx.K0.y-0.30, 1.05), M_.FRAME)
def kneel(r, t, ctx):
    C = ctx.C; u = timing(t); mode = C['mode']; K0 = ctx.K0
    if mode == 'kneel_thrust': ph, th = keys(u, [(0.0, 0.0, 2.0), (1.0, 52.0, 35.0)])   # 허벅지 뒤로 기울기, 몸통 숙임
    elif mode == 'nordic': ph, th = keys(u, [(0.0, 0.0, 0.0), (1.0, -68.0, 72.0)])   # 허벅지·몸통이 함께 앞으로
    elif mode == 'reverse_nordic': ph, th = keys(u, [(0.0, 0.0, 0.0), (1.0, 42.0, -42.0)])
    else: ph, th = keys(u, [(0.0, -88.0, 88.0), (1.0, 0.0, 0.0)])   # GHR: 엎드린 수평 → 무릎 꿇고 선 자세
    if mode in ('nordic', 'ghr', 'reverse_nordic'): th = -ph
    p = math.radians(ph); d = V((0, math.sin(p), math.cos(p))); R_ = Rx(th); off = R_@r.HIP_OFF
    Lt = sqrt0(r.L_T**2-(r.HIP_OFF.x-K0.x)**2); H = K0+V((0, d.y, d.z))*Lt; P = V((0, H.y-off.y, H.z-off.z))
    r.torso(P, R_, neck=Rx(th*0.6), head=Rx(th*0.5), scap={s: (0.0, 0.0) for s, _ in SIDES})
    for s, sg in SIDES:
        K = V((sg*K0.x, K0.y, K0.z)); A = K+V((0, r.L_S, 0.015 if mode != 'ghr' else 0.03)).normalized()*r.L_S
        # [원본] r.leg(s, K, A, V((0, 0, -1)), 0.0, 95.0) — 발끝이 바닥 아래로 꽂혔다(-11cm)
        r.leg(s, K, A, V((0, 0, -1)), 0.0, 138.0 if mode != 'ghr' else 95.0)   # [개선] 발등을 바닥에 눕힌다
    ld = C['load']; load = []
    if ld == 'band':
        Hc = (r.chain_head('thigh_l')+r.chain_head('thigh_r'))/2; n = R_@V((0, -1, 0)); fr = Hc+n*0.13
        for i, sg in enumerate((1, -1)): wire_to(ctx.BD[i], fr+V((sg*0.17, 0, 0)), V((sg*0.05, K0.y+0.95, 0.60)))
    if ld == 'smith':
        Hc = (r.chain_head('thigh_l')+r.chain_head('thigh_r'))/2; n = R_@V((0, -1, 0)); bar = Hc+n*0.20; bar.x = 0; ctx.BAR.location = bar; load = [(bar, BAR_KG)]
        for s, sg in SIDES: r.arm(s, bar+V((sg*0.32, 0, 0)), V((0, -0.2, -1)).normalized(), R_@V((sg*0.8, 0.7, 0)), None, 0.9995); r.fingers(s)
        return dict(bar=bar, load=load, fixed=['calf_l', 'calf_r'])
    for s, sg in SIDES:
        if mode == 'nordic':   # 팔은 받을 준비(가슴 앞)
            S = r.chain_head('upperarm_'+s); G = S+R_@V((sg*0.06, -0.28, -0.05)); r.arm(s, G, R_@V((0, -0.3, 1)).normalized(), R_@V((sg*0.6, 0.6, -0.4)), None, 0.9995); r.fingers(s, 0.2)
        elif mode == 'reverse_nordic':   # 손을 허벅지 위에 얹는다
            Hs = r.chain_head('thigh_'+s); Ks = r.chain_head('calf_'+s); fn = V((0, -math.cos(p), math.sin(p))); G = Hs.lerp(Ks, 0.12)+fn*0.13+V((sg*0.07, 0, 0)); r.arm(s, G, V((0, -0.35, -1)).normalized(), V((sg*0.7, 0.6, 0)), None, 0.9995); r.fingers(s, 0.2)
        elif mode in ('ghr', 'kneel_thrust') or ld == 'cross':   # 팔짱(가슴 위에 교차) — [원본] mode == 'ghr' or ld == 'cross' (닐링 힙 쓰러스트는 허리에 손이었다)
            So = r.chain_head('upperarm_'+('r' if s == 'l' else 'l')); G = So+R_@(V((sg*0.06, -0.28, -0.12)) if mode == 'kneel_thrust' else V((sg*0.06, -0.32, -0.18))); r.arm(s, G, R_@V((-sg*1, 0, 0.15)).normalized(), R_@V((sg*0.4, 0.3, -1)), R_@V((0, 0, 1)), 0.9995); r.fingers(s, 0.3)   # [원본] 앞 -0.12(가슴 관통) · 선 자세(닐링 힙 쓰러스트)는 가슴에 붙게 -0.20
        else:   # 허리에 손
            Lw = ctx.L_WAIST; G = W_(P, R_, ctx, V((sg*Lw.x, Lw.y, Lw.z))); jointed(r, s, r.chain_head('upperarm_'+s)+R_@V((sg*0.85, 0.45, -0.30)), G, R_@V((-sg*0.3, -0.6, -0.7)), R_@V((0, 0.6, 0.8)), R_@V((sg*1, 0.6, 0))); r.fingers(s, 0.2)
    return dict(bar=None, load=load, fixed=['calf_l', 'calf_r'])

# ════ 패드에 기대 척추·엉덩이 펴기(45° 백 익스텐션·머신 백 익스텐션·리버스 하이퍼) ════
BE = dict(mode='hyper45', load='cross')
def be_setup(ctx):
    C = dict(BE); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; local_pts(ctx)
    if C['mode'] == 'hyper45':
        a = math.radians(45); dl = V((0, -math.cos(a), math.sin(a))); A = V((0, r.ANK_Y+0.55, 0.20)); ctx.A = A; ctx.dl = dl; H = A+dl*(r.L_T+r.L_S)*0.997; ctx.H = H   # [원본] 0.985 — 무릎이 패드 쪽으로 굽어 허벅지가 패드를 뚫었다
        n = V((0, -math.sin(a), -math.cos(a)))   # 몸 앞쪽(패드 쪽)
        pd = box("hpad", (0.40, 0.30, 0.10), tuple(H-dl*0.33+n*0.17), M_.PAD, 0.04); pd.rotation_euler = (math.radians(-45), 0, 0)   # [원본] H+dl*0.06+n*0.16 — dl 은 발목→엉덩이라 + 쪽은 몸통 쪽이었다(숙이면 배가 패드 관통). 패드는 허벅지 쪽(-dl)에
        fp = box("fpad", (0.36, 0.08, 0.08), tuple(A+dl*0.10-n*0.10), M_.PAD, 0.03); fp.rotation_euler = (math.radians(-45), 0, 0)
        pl = box("fplate", (0.40, 0.30, 0.03), tuple(A-dl*0.10+n*0.07), M_.FRAME); pl.rotation_euler = (math.radians(45), 0, 0)   # [원본] -45 — 발판 면이 다리와 나란했다(REV-071)
        pc = H-dl*0.33+n*0.17; box("post", (0.08, 0.08, max(pc.z-0.10, 0.05)), (0, pc.y+0.12, max(pc.z-0.10, 0.05)/2), M_.FRAME); box("post2", (0.08, 0.08, max(A.z-0.05, 0.05)), (0, A.y+0.10, max(A.z-0.05, 0.05)/2), M_.FRAME); box("base", (0.60, 1.20, 0.02), (0, (A.y+H.y)/2, 0.0), M_.FRAME)   # [원본] -45 — 긴 축이 다리에 수직(REV-071)
    elif C['mode'] == 'machine':
        hip = r.ANK_Z+r.L_S+0.015; off = r.HIP_OFF; ctx.P = V((0, 0.0, hip-off.z)); T = hip-0.105; box("seat", (0.44, 0.44, 0.07), (0, -0.04, T-0.035), M_.PAD, 0.024); box("stem", (0.10, 0.10, T-0.07), (0, -0.04, (T-0.07)/2), M_.FRAME)
        box("foot", (0.50, 0.30, 0.02), (0, -0.48, -0.002), M_.FRAME); ctx.BP = box("bpad", (0.40, 0.08, 0.22), (0, 0, 0), M_.PAD, 0.03); ctx.LV = cyl("lever", 0.025, 1.0, M_.FRAME, axis='Z', verts=24); ctx.PV = V((0, 0.12, hip+0.02))
    else:   # 리버스 하이퍼: 엎드려 골반은 패드 끝, 다리를 뒤로 든다
        T = C.get('top', 0.95); ctx.T = T; box("pad", (0.40, 0.62, 0.08), (0, -0.37, T-0.04), M_.PAD, 0.03); box("post", (0.10, 0.10, T-0.08), (0, -0.30, (T-0.08)/2), M_.FRAME)
        box("hdl", (0.60, 0.04, 0.04), (0, -0.66, T-0.10), M_.STEEL); box("base", (0.70, 1.0, 0.05), (0, -0.20, 0.025), M_.FRAME)
        if C.get('strap'): ctx.STR = cyl("pend", 0.025, 0.6, M_.FRAME, axis='Z', verts=24); box("pv", (0.12, 0.12, 0.12), (0, 0.40, T-0.30), M_.FRAME)
def back_ext(r, t, ctx):
    C = ctx.C; u = timing(t); mode = C['mode']
    if mode == 'hyper45':
        th = lerp(132.0, 47.0, u); R_ = Rx(th); off = R_@r.HIP_OFF; H = ctx.H; P = V((0, H.y-off.y, H.z-off.z))
        r.torso(P, R_, neck=Rx(th-lerp(10, 5, u)), head=Rx(th-lerp(14, 8, u)), scap={s: (0.0, 0.5) for s, _ in SIDES})
        for s, sg in SIDES:
            A = V((sg*0.12, ctx.A.y, ctx.A.z)); r.leg_ik(s, A, V((0, -0.7, -0.7)), V((0, -0.7, -0.7)).normalized(), 0.0, 45.0)
        fixed = ['foot_l', 'foot_r', 'thigh_l', 'thigh_r']   # 엉덩이 관절을 축으로 돈다
    elif mode == 'machine':
        th = lerp(38.0, -8.0, u); R_ = Rx(th); r.torso(ctx.P, R_, neck=Rx(th*0.6), head=Rx(th*0.4), scap={s: (0.0, 0.0) for s, _ in SIDES})
        for s, sg in SIDES: H = r.chain_head('thigh_'+s); r.leg_ik(s, V((sg*0.16, H.y-r.L_T*0.97, r.ANK_Z)), V((sg*0.1, -0.5, 1)), Rz(sg*6)@V((0, -1, 0)), sg*6)
        b = W_(ctx.P, R_, ctx, ctx.L_BACK)+R_@V((0, 0.08, -0.08)); place_obj(ctx.BP, b, R_); wire_to(ctx.LV, b, ctx.PV); fixed = ['pelvis', 'foot_l', 'foot_r']
    else:
        T = ctx.T; R_ = Rx(88.0); P0 = r.head0('pelvis'); P = V((0, 0.02, T+0.15)); r.torso(P, R_, neck=Rx(70), head=Rx(62), scap={s: (0.5, 1.0) for s, _ in SIDES})
        lo, hi = C.get('a', (-70.0, 8.0)); a = math.radians(lerp(lo, hi, u))   # 다리 각: 수평 아래 - , 위 +
        for s, sg in SIDES:
            H = r.chain_head('thigh_'+s); d = V((sg*0.03, math.cos(a), math.sin(a))).normalized(); A = H+d*(r.L_T+r.L_S)*0.985
            r.leg_ik(s, A, V((0, 0, -1)), V((0, 0, -1)) if a < 0.3 else V((0, -0.3, -1)).normalized(), 0.0, 90.0+math.degrees(a)*0.6)
        if C.get('strap'):
            Ac = (r.chain_head('foot_l')+r.chain_head('foot_r'))/2; wire_to(ctx.STR, Ac+V((0, 0, 0.04)), V((0, 0.40, T-0.30)))
        for s, sg in SIDES: r.arm(s, V((sg*0.28, -0.66, T-0.10)), V((0, -1, -0.2)).normalized(), V((sg*0.8, 0.3, 0.2)), None, 0.9995); r.fingers(s)
        fixed = ['pelvis', 'spine_03']; R_ = R_
    if mode == 'hyper45' and C.get('hands') == 'head':   # 손을 귀 옆(변형) — 기본은 팔짱(관찰·REV-071, 패드 위치를 고친 뒤 겹치지 않음)
        Hd = r.chain_head('head')
        for s, sg in SIDES:
            G = Hd+R_@V((sg*0.10, 0.03, 0.06)); r.arm(s, G, R_@V((0, 0.2, 1)).normalized(), R_@V((sg*1, 0.2, -0.3)), R_@V((-sg*1, 0, 0)), 0.9995); r.fingers(s, 0.3)
    elif mode != 'reverse':
        for s, sg in SIDES:   # 팔짱
            So = r.chain_head('upperarm_'+('r' if s == 'l' else 'l')); G = So+R_@V((sg*0.06, -0.32, -0.18)); r.arm(s, G, R_@V((-sg*1, 0, 0.15)).normalized(), R_@V((sg*0.4, 0.3, -1)), R_@V((0, 0, 1)), 0.9995); r.fingers(s, 0.3)   # [원본] 앞 -0.12(가슴 관통)
    return dict(bar=None, load=[], fixed=fixed)

# ════ 한 다리로 서서(킥백·어브덕션·어덕션·스탠딩 레그 컬) ════
OL = dict(mode='abd', load='cable', lean=4.0, hold='post')
def ol_setup(ctx):
    C = dict(OL); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; local_pts(ctx); ld = C['load']; m = C['mode']
    if ld == 'cable':
        side = {'abd': 1, 'add': -1}.get(m, 0); ctx.PUL = V((side*0.95, r.ANK_Y+(-0.90 if m in ('kick', 'curl') else -0.15), 0.10)); ctx.W = wire(ctx)   # [원본] 킥백 도르래가 몸 뒤(+0.90) — 스택을 마주 보고 선다(REV-071)
        box("stack", (0.24, 0.24, 1.90), (ctx.PUL.x+side*0.10, ctx.PUL.y+(-0.10 if m in ('kick', 'curl') else 0), 0.95), M_.FRAME); ctx.CUF = cyl("sl_cuff", 0.05, 0.07, M_.PAD, axis='Z', verts=32)   # 이름 sl_: 발목을 감싸는 끈이라 관통 판정 제외
    if ld == 'band': ctx.BD = [wire(ctx, "band")]
    if ld == 'machine':
        if m == 'curl':
            box("upright", (0.10, 0.10, 1.20), (0, r.ANK_Y-0.55, 0.60), M_.FRAME); box("tpad", (0.30, 0.10, 0.22), (-0.10, r.ANK_Y-0.22, 0.58), M_.PAD, 0.03); box("hdl", (0.60, 0.04, 0.04), (0, r.ANK_Y-0.45, 1.20), M_.STEEL)
            ctx.RP = cyl("roll", 0.05, 0.22, M_.PAD, verts=32); ctx.LV = cyl("lever", 0.02, 1.0, M_.FRAME, axis='Z', verts=16); ctx.PV = V((-0.30, r.ANK_Y-0.20, 0.55))
        else:   # 킥백 머신: 가슴 패드 + 발바닥 판
            box("cpad", (0.40, 0.10, 0.40), (0, r.ANK_Y-0.62, 1.15), M_.PAD, 0.03); box("upright", (0.10, 0.10, 1.40), (0, r.ANK_Y-0.75, 0.70), M_.FRAME); box("hdl", (0.70, 0.04, 0.04), (0, r.ANK_Y-0.66, 1.05), M_.STEEL)
            ctx.FP = box("fplate", (0.20, 0.04, 0.24), (0, 0, 0), M_.FRAME); ctx.LV = cyl("lever", 0.02, 1.0, M_.FRAME, axis='Z', verts=16); ctx.PV = V((-0.24, r.ANK_Y-0.10, 0.95))
    if C['hold'] == 'post' and ld != 'machine': box("post", (0.06, 0.06, 1.25), (0.42 if m != 'add' else -0.42, r.ANK_Y-0.30, 0.625), M_.FRAME)
def one_leg(r, t, ctx):
    C = ctx.C; u = timing(t); m = C['mode']; ld = C['load']; lean = C['lean'] if ld != 'machine' or m == 'curl' else 28.0
    R_ = Rx(lean); off = R_@r.HIP_OFF; A = V((0.10, r.ANK_Y, r.ANK_Z)); L_ = (r.L_T+r.L_S)*0.985; P = V((A.x-off.x, A.y-off.y+math.sin(math.radians(lean))*0.10, A.z+sqrt0(L_**2-0.0)-off.z))
    if m == 'abd': rz = lerp(0, -4, u)   # [원본] +4 — 일하는 다리 쪽으로 기울었다. 보상은 디딤발 쪽
    elif m == 'add': rz = lerp(-3, 0, u)
    else: rz = 0
    r.torso(P, R_@Ry(-rz), neck=Rx(lean*0.5), head=Rx(lean*0.3), scap={s: (0.0, 0.0) for s, _ in SIDES})
    r.leg_ik('l', A, V((0.1, -1, 0)), Rz(6)@V((0, -1, 0)), 6.0)
    H = r.chain_head('thigh_r'); load = []
    if m in ('abd', 'add'):
        a = math.radians(lerp(2, 38, u) if m == 'abd' else lerp(30, -5, u)); d = V((-math.sin(a), -0.06, -math.cos(a))).normalized(); Ar = H+d*(r.L_T+r.L_S)*0.99   # [원본] 어덕션 끝 -14 — 디딤발을 지나갔다
        r.leg_ik('r', Ar, V((-math.cos(a)*0.2, -1, 0)), Rz(-4)@V((0, -1, 0)), -4.0)
    elif m == 'kick':
        if ld == 'machine': a = math.radians(lerp(-5, 22, u)); kb = lerp(55, 25, u)
        elif lean >= 10: a = math.radians(lerp(-12, lean+12, u)-lean); kb = lerp(40.0, 34.0, u)   # [원본] 끝 24° — 몸통 기준 고관절이 펴지지 않았다(REV-071) [개선] 몸통을 30° 넘게 숙인 케이블 킥백: 허벅지 각은 바닥 기준 -12→24°(아래 식이 lean 을 더하므로 뺀다), 무릎 약 140°(관찰)
        else: a = math.radians(lerp(-4, 20, u)); kb = lerp(22.0, 14.0, u)
        d = (R_@V((0, math.sin(a), -math.cos(a)))).normalized() if False else V((0, math.sin(a+math.radians(lean)), -math.cos(a+math.radians(lean)))).normalized()
        K = H+d*r.L_T; ka = math.radians(kb); d2 = V((0, math.sin(a+math.radians(lean)+ka), -math.cos(a+math.radians(lean)+ka))).normalized(); Ar = K+d2*r.L_S   # [원본] -ka(무릎이 앞으로 꺾임)
        r.leg('r', K, Ar, V((0, -1, 0)), 0.0, lerp(30.0, 35.0, u) if ld == 'machine' else lerp(0.0, 25.0, u))
        if ld == 'machine': place_obj(ctx.FP, Ar+V((0, 0.12, -0.03)), Rx(lean)); wire_to(ctx.LV, Ar+V((-0.11, 0.12, -0.03)), ctx.PV)
    else:   # curl: 허벅지는 거의 수직, 무릎을 굽힌다
        K = H+V((0, -0.15, -1)).normalized()*r.L_T; b = math.radians(lerp(25, 105, u)); d2 = V((-0.02, math.sin(b), -math.cos(b))).normalized(); Ar = K+d2*r.L_S
        r.leg('r', K, Ar, V((0, -1, 0)), 0.0, lerp(0, 40, u))
        rp = Ar-d2*0.04+V((0, math.cos(b), math.sin(b)))*0.10   # 정강이 뒤쪽(아킬레스)에 패드
        if ld == 'machine': ctx.RP.location = rp; wire_to(ctx.LV, rp+V((-0.11, 0, 0)), ctx.PV)
    Ac = r.chain_head('foot_r')
    if ld == 'cable': ctx.CUF.location = Ac+V((0, 0, 0.03)); wire_to(ctx.W, Ac+V((0, 0, 0.03)), ctx.PUL)
    if ld == 'band':
        Al = r.chain_head('foot_l'); wire_to(ctx.BD[0], Al+V((-0.04, 0, 0.04)), Ac+V((0.04, 0, 0.04)))
    # 손: 기둥·손잡이를 잡는다
    for s, sg in SIDES:
        if ld == 'machine' and m == 'kick': G = V((sg*0.28, r.ANK_Y-0.58, 1.10)); F = V((0, -0.3, -1)).normalized()
        elif ld == 'machine': G = V((sg*0.28, r.ANK_Y-0.45, 1.20)); F = V((0, -0.3, 1)).normalized()
        elif (s == 'l') == (m != 'add'): G = V((sg*0.42+(-0.065 if sg > 0 else 0.065), r.ANK_Y-0.30, 1.02)); F = V((0, -0.2, -1)).normalized()
        else:
            Lw = ctx.L_WAIST; G = W_(P, R_, ctx, V((sg*Lw.x, Lw.y, Lw.z))); jointed(r, s, r.chain_head('upperarm_'+s)+R_@V((sg*0.85, 0.45, -0.30)), G, R_@V((-sg*0.3, -0.6, -0.7)), R_@V((0, 0.6, 0.8)), R_@V((sg*1, 0.6, 0))); r.fingers(s, 0.2); continue
        r.arm(s, G, F, V((sg*0.8, 0.5, -0.3)), None, 0.9995); r.fingers(s)
    return dict(bar=None, load=load, fixed=['foot_l'])

# ════ 네발 킥백(맨몸·밴드) ════
def quad_setup(ctx):
    C = dict(load='none'); C.update(ctx.vars); ctx.C = C; local_pts(ctx)
    if C['load'] == 'band': ctx.BD = [wire(ctx, "band") for _ in range(2)]
    if C.get('curl'): ctx.RP = cyl("roll", 0.05, 0.22, ctx.mats.PAD, verts=32); ctx.LV = cyl("lever", 0.02, 1.0, ctx.mats.FRAME, axis='Z', verts=16); ctx.PV = V((0, 0.30, 0.45))
    box("mat", (0.70, 1.40, 0.02), (0, -0.10, 0.01), ctx.mats.PAD, 0.005)
def quad_kick(r, t, ctx):
    C = ctx.C; u = timing(t); r_ = ctx.rig; R_ = Rx(86.0); off = R_@r.HIP_OFF; kz = 0.07; K = V((0.13, 0.10, kz))
    Hz = kz+sqrt0(r.L_T**2-(off.x-K.x)**2); P = V((0, K.y-off.y-0.02, Hz-off.z)); r.torso(P, R_, neck=Rx(76), head=Rx(70), scap={s: (0.0, 0.5) for s, _ in SIDES})
    r.leg('l', K, K+V((0, r.L_S, 0.02)).normalized()*r.L_S, V((0, 0, -1)), 0.0, 138.0)   # [원본] 발끝 95°(바닥 관통)
    H = r.chain_head('thigh_r')
    if C.get('curl'):   # 닐링 레그 컬: 허벅지는 아래로 두고 정강이를 뒤 수평 → 위로
        a = math.radians(-62); d = V((0, math.cos(a), math.sin(a))).normalized(); Kr = H+d*r.L_T; b = math.radians(lerp(5, 80, u)); Ar = Kr+V((0, math.cos(b), math.sin(b))).normalized()*r.L_S
        r.leg('r', Kr, Ar, V((0, 0, -1)), 0.0, 140.0+math.degrees(b)); rp = Ar-V((0, math.cos(b), math.sin(b)))*0.04+V((0, -math.sin(b), math.cos(b)))*0.13; ctx.RP.location = rp; wire_to(ctx.LV, rp, ctx.PV)
    else:
        a = math.radians(lerp(-82, 8, u))   # 오른 허벅지: 아래 → 수평 뒤, 무릎은 90° 로 발바닥이 천장
        d = V((0, math.cos(a), math.sin(a))).normalized(); Kr = H+d*r.L_T; b = a+math.radians(90); Ar = Kr+V((0, math.cos(b), math.sin(b))).normalized()*r.L_S
        r.leg('r', Kr, Ar, V((0, -0.2, -1)).normalized(), 0.0, 140.0+math.degrees(b))   # [원본] lerp(60, 0) — 시작에 발끝이 바닥 관통
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s); G = V((sg*0.17, S.y-0.02, 0.035)); r.arm(s, G+V((0, 0, 0.0)), V((sg*0.1, -1, 0)).normalized(), V((sg*0.4, 0.9, 0)), None, 0.9995); r.fingers(s, 0.0)
    if C['load'] == 'band':
        Gl = r.chain_head('hand_l'); Gr = r.chain_head('hand_r'); Ac = r.chain_head('ball_r'); wire_to(ctx.BD[0], Gr+V((0, 0, 0.0)), Ac); ctx.BD[1].location = V((0, 0, -3))
    return dict(bar=None, load=[], fixed=['calf_l', 'hand_l', 'hand_r'])

SOLVERS = {'hinge': (hinge_setup, hinge), 'floor': (floor_setup, floor_lift), 'swing': (swing_setup, kb_swing), 'pull_through': (pt_setup, pull_through), 'bridge': (br_setup, bridge), 'kneel': (kn_setup, kneel), 'back_ext': (be_setup, back_ext), 'one_leg': (ol_setup, one_leg), 'quad_kick': (quad_setup, quad_kick)}
