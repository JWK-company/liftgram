# SPDX-License-Identifier: GPL-3.0-or-later
"""가로로 밀기 묶음 계산식(SPEC-040 Phase 5): 누워 밀기·플라이·푸시업·딥스·스벤드 프레스. 변형은 catalog 의 vars 로 고른다.
좌표: X 왼쪽+, -Y 앞, Z 위. Rx(+)=앞으로 숙임, Rx(-90)=누움(머리 +Y), Rx(+90)=엎드림(머리 -Y). t 0=시작, 1=반대쪽 자세(왕복).
동작 근거는 실제 수행 관찰 메모(저장소 밖, 원형별)다."""
import math
from mathutils import Vector as V
from rig import Rx, Ry, Rz, lerp, sstep, sqrt0
from scene import PLATE_R, barbell, box, cyl
from families.reps import (SIDES, timing, dumbbell, hold, rot_to, wire, wire_to, grip_w, jointed, hang, stand_P, plant)
from families.squat_lunge import kettlebell, place_obj, local_pts, W_

def _mesh(ctx):
    import bpy
    ctx.rig.apply(); bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); ob = ctx.h.evaluated_get(dg); me = ob.to_mesh()
    vs = [v.co.copy() for v in me.vertices]; ob.to_mesh_clear(); return vs

# ════ 누워 밀기(벤치·인클라인·디클라인·플로어 프레스) ════
# inc 등판 각(+ 머리 쪽이 올라감), load bar·smith·ez·db·squeeze·closedb·cable·kb, var board·pin·guillotine·larsen·feetup, floor 바닥에 누움
PR = dict(inc=0.0, load='bar', grip=0.44, var='', floor=False, T=0.46, bot=-0.165, gap=0.030)
TOR = (-84.0, -87.0, -91.0, -95.0, -92.0, -86.0)
def pr_torso(r, P, inc, scap=(-1.5, -2.5)):
    a = [Rx(x+inc) for x in TOR]; r.torso(P, *a, scap={s: scap for s, _ in SIDES})
def press_setup(ctx):
    C = dict(PR); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; inc = C['inc']; T = 0.0 if C['floor'] else C['T']
    r.reset(); P0 = V((0, 0.0, 1.0)); pr_torso(r, P0, inc); vs = _mesh(ctx); n = Rx(inc)@V((0, 0, 1)); td = Rx(inc)@V((0, 1, 0))
    back = [vs[i] for i, w in enumerate(ctx.weights) if w.get('spine_03', 0)+w.get('spine_02', 0) > 0.6 and abs(ctx.rest_v[i].x) < 0.15]
    pelv = [vs[i] for i, w in enumerate(ctx.weights) if w.get('pelvis', 0) > 0.6 and abs(ctx.rest_v[i].x) < 0.15]
    if inc > 5:   # 인클라인: 엉덩이는 좌석(z=T), 등판은 몸에 맞춘다
        dz = (T-0.012)-min(p.z for p in pelv); P = P0+V((0, 0, dz)); cB = min((p+V((0, 0, dz))).dot(n) for p in back)+0.012
    else:   # 평평·디클라인: 골반 높이 T 를 지나는 한 판
        Tp = T if inc > -5 else 0.62; cB0 = V((0, P0.y, Tp)).dot(n); dz = ((cB0-0.012)-min(p.dot(n) for p in back+pelv))/max(n.z, 0.2); P = P0+V((0, 0, dz)); cB = cB0
    ctx.P = P; ctx.T = T
    r.reset(); pr_torso(r, P, inc); vs = _mesh(ctx); S = r.chain_head('upperarm_l'); Sc = V((0, S.y, S.z)); R3 = Rx(TOR[3]+inc); Nf = R3@V((0, -1, 0)); tz = R3@V((0, 0, 1))
    bot = {'bar': C['bot'], 'smith': C['bot'], 'ez': C['bot']-0.02}.get(C['load'], C['bot'])
    if C['var'] == 'guillotine': bot = 0.03
    Q = Sc+tz*bot; surf = max((v-Q).dot(Nf) for i, v in enumerate(vs) if abs(v.x) < 0.09 and abs((v-Q).dot(tz)) < 0.02)
    ctx.Q, ctx.Nf, ctx.surf, ctx.S = Q, Nf, surf, S
    if not C['floor']:
        base = P+n*0.0; base = base-n*(base.dot(n)-cB)   # 등판 위 골반 아래 점
        if inc > 5:
            pd = box("pad", (0.30, 0.82, 0.07), tuple(base+td*0.50-n*0.035), M_.PAD, 0.024); pd.rotation_euler = (math.radians(inc), 0, 0)
            box("seat", (0.30, 0.40, 0.07), (0, P.y-0.10, T-0.041), M_.PAD, 0.024); box("stem", (0.08, 0.08, T-0.07), (0, P.y-0.05, (T-0.07)/2), M_.FRAME); box("ft", (0.56, 0.09, 0.04), (0, P.y-0.05, 0.02), M_.FRAME)
            top = base+td*0.80-n*0.10; box("brace", (0.08, 0.08, max(top.z-0.04, 0.1)), (0, top.y+0.05, max(top.z-0.04, 0.1)/2), M_.FRAME); box("ft2", (0.56, 0.09, 0.04), (0, top.y+0.05, 0.02), M_.FRAME)
        else:
            pd = box("pad", (0.30, 1.22, 0.07), tuple(base+td*0.42-n*0.035), M_.PAD, 0.024); pd.rotation_euler = (math.radians(inc), 0, 0)
            for k in (-0.02, 0.86):
                q = base+td*k-n*0.07; box("post", (0.07, 0.07, max(q.z-0.02, 0.05)), (0, q.y, max(q.z-0.02, 0.05)/2+0.02), M_.FRAME); box("ft", (0.56, 0.09, 0.04), (0, q.y, 0.02), M_.FRAME)
            if inc < -5:   # 디클라인: 다리 거는 롤러
                ctx.ROLL = cyl("roll", 0.05, 0.30, M_.PAD, verts=32)
    else: box("mat", (0.70, 1.90, 0.012), (0, P.y+0.35, 0.006), M_.PAD, 0.004)
    ld = C['load']
    if ld in ('bar', 'smith', 'ez'): ctx.BAR = barbell(ctx.col, M_)
    if ld == 'smith':
        for sg in (-1, 1): box("rail", (0.05, 0.05, 2.10), (sg*0.66, S.y-0.02, 1.05), M_.FRAME)
    if ld in ('db', 'squeeze', 'closedb', 'cable'):
        if ld == 'cable':
            ctx.HD = {s: cyl("hdl_"+s, 0.016, 0.13, M_.STEEL, verts=24) for s, _ in SIDES}; ctx.W = {s: wire(ctx) for s, _ in SIDES}
            for sg in (-1, 1): box("pulley", (0.16, 0.16, 0.30), (sg*0.95, S.y-0.02, 0.15), M_.FRAME)   # [원본] 높이 1.9 기둥 — 카메라 앞을 가렸다
        else: ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
    if ld == 'kb': ctx.KB = {s: kettlebell(ctx, "kb_"+s) for s, _ in SIDES}
    R3_ = Rx(TOR[3]+inc)
    if C['var'] == 'pin':   # 세이프티 핀: 바가 내려와 멈추는 높이
        zp = (Q+Nf*(surf+C['gap']+0.11)).z-0.035
        for sg in (-1, 1): box("pin", (0.05, 0.90, 0.04), (sg*0.56, Q.y, zp-0.02), M_.STEEL)
    if C['var'] == 'board':   # 가슴 위 보드(바가 닿는 곳) — 이름 sl_: 몸에 얹는 소품이라 관통 판정 제외
        bd = box("sl_board", (0.14, 0.12, 0.09), tuple(Q+Nf*(surf+0.045)), M_.PAD, 0.01); bd.rotation_euler = (math.radians(TOR[3]+inc), 0, 0)
    if C['var'] not in ('feetup', 'larsen', 'fly') and not C['floor'] and inc <= 5 and ld in ('bar', 'ez'):
        for sg in (-1, 1): box("up", (0.07, 0.07, 1.16), (sg*0.56, S.y+0.30, 0.58), M_.FRAME); box("hk", (0.05, 0.14, 0.04), (sg*0.56, S.y+0.24, 1.10), M_.RUBBER); box("bs", (0.08, 0.5, 0.04), (sg*0.56, S.y+0.24, 0.02), M_.FRAME)
def press_legs(r, ctx, C):
    P = ctx.P; H = {s: r.chain_head('thigh_'+s) for s, _ in SIDES}; inc = C['inc']
    for s, sg in SIDES:
        h = H[s]
        if C['floor']: r.leg_ik(s, V((sg*0.20, h.y-0.27, r.ANK_Z)), V((sg*0.15, -0.3, 1)), V((0, -1, 0)), sg*6)
        elif C['var'] == 'feetup':   # 무릎 90°로 다리를 든다
            K = h+V((sg*0.02, -0.06, r.L_T*0.99)); A = K+V((0, -r.L_S, -0.05)).normalized()*r.L_S; r.leg(s, K, A, V((0, 0, 1)), 0.0, -72.0)   # 발끝이 천장
        elif C['var'] == 'larsen':   # 다리를 펴서 바닥에서 띄운다
            d = V((sg*0.10, -1, -0.12)).normalized(); A = h+d*(r.L_T+r.L_S)*0.985; r.leg_ik(s, A, V((0, 0, 1)), V((0, -0.2, 1)).normalized(), 0.0, -58.0)   # 발끝을 세운다
        elif inc < -5:   # 디클라인: 무릎을 패드 끝에 걸고 정강이를 롤러 아래에
            td = Rx(inc)@V((0, -1, 0)); K = h+(td+V((0, 0, 0.10))).normalized()*r.L_T; A = K+V((0, -0.25, -1)).normalized()*r.L_S; r.leg(s, K, A, V((0, -1, 0.2)).normalized(), 0.0, -22.0)
        elif inc > 5: r.leg_ik(s, V((sg*0.26, h.y-0.55, r.ANK_Z)), V((sg*0.22, -0.3, 1)), V((0, -1, 0)), sg*8)
        else: r.leg_ik(s, V((sg*0.27, P.y-0.40, r.ANK_Z)), V((sg*0.22, -0.3, 1)), V((0, -1, 0)), sg*8)
    if inc < -5 and not C['floor']:
        Al, Ar = r.chain_head('foot_l'), r.chain_head('foot_r'); c = (Al+Ar)/2
        ctx.ROLL.location = c+V((0, -0.10, 0.10))
def press(r, t, ctx):
    C = ctx.C; u = timing(t); inc = C['inc']; ld = C['load']; pr_torso(r, ctx.P, inc); S = r.chain_head('upperarm_l')
    gx = {'bar': C['grip'], 'smith': C['grip'], 'ez': 0.20, 'db': 0.17, 'cable': 0.17, 'kb': 0.17, 'squeeze': 0.085, 'closedb': 0.13}[ld]
    stop = {'board': 0.09, 'pin': 0.11}.get(C['var'], 0.0)
    if C['floor']: stop = max(stop, 0.10)   # 바닥: 위팔이 바닥에 닿는 높이에서 멈춘다
    Fu = V((0, 0.18*(1-0.3*(1-u)), 1)); lat = None
    if ld in ('squeeze', 'closedb'): lat = V((0, 1, 0)); Fu = V((0, 0.10, 1))
    F0, _L, n0 = r.grip_frame('l', Fu, lat); off = -F0*r.GRIP_F-n0*r.GRIP_N; top_y = S.y-0.015
    reach = sqrt0(((r.L_U+r.L_F)*0.990)**2-(gx-S.x+off.x)**2-(top_y+off.y-S.y)**2)
    top = V((0, top_y, S.z+reach-off.z)); bot = ctx.Q+ctx.Nf*(ctx.surf+C['gap']+stop)
    if ld in ('db', 'cable', 'kb'): bot = bot+V((0, 0, 0.03))
    if ld in ('squeeze', 'closedb'): bot = bot+V((0, 0, 0.05))   # 덤벨이 가슴 위에 얹힐 때까지
    c = V((0, lerp(top.y, bot.y, u**1.25), lerp(top.z, bot.z, u)))
    pole = {'squeeze': (0.45, -0.75, -0.55), 'closedb': (0.50, -0.70, -0.55), 'ez': (0.50, -0.70, -0.55)}.get(ld, None)
    if C['var'] == 'guillotine': pole = (1.0, -0.05, -0.45)
    if C['grip'] < 0.30 and ld in ('bar', 'smith'): pole = (0.50, -0.70, -0.55)
    load = []
    for s, sg in SIDES:
        x = sg*(gx if ld not in ('db', 'cable', 'kb') else lerp(gx, gx+0.09, u)); G = c+V((x, 0, 0))
        pl = V((sg*pole[0], pole[1], pole[2])) if pole else V((sg*lerp(0.90, 0.72, u), -0.42, -0.62))
        r.arm(s, G, Fu, pl, lat, 0.9995); r.fingers(s)
        if ld in ('db', 'squeeze', 'closedb'): hold(ctx, s, G, V((0, 1, 0)) if lat is not None else V((1, 0, 0)))
        if ld == 'cable':
            ctx.HD[s].location = G; rot_to(ctx.HD[s], V((1, 0, 0))); wire_to(ctx.W[s], G+V((sg*0.06, 0, 0)), V((sg*0.86, S.y-0.02, 0.20)))
        if ld == 'kb':
            Fw, Lw, nw = r.grip_frame(s, Fu); d = (-Fw*0.5+V((s == 'l' and 1 or -1, 0, 0))*0.85).normalized(); place_obj(ctx.KB[s], G+V((0.03 if s == 'l' else -0.03, 0, 0)), None); ctx.KB[s].rotation_mode = 'QUATERNION'; ctx.KB[s].rotation_quaternion = d.to_track_quat('-Z', 'Y')   # 종은 손목 바깥쪽. 위 축 X 는 d 와 거의 나란해 회전이 깨졌다
    if ld in ('bar', 'smith', 'ez'): ctx.BAR.location = c
    press_legs(r, ctx, C)
    fixed = ['foot_l', 'foot_r', 'pelvis', 'spine_03']
    return dict(bar=c if ld in ('bar', 'smith', 'ez') else None, load=load, lean=TOR[3]+inc, fixed=fixed, grips=True, support=None)

# ════ 플라이(누워서·바닥·밴드·머신·서서 케이블) ════
FL = dict(inc=0.0, load='db', floor=False, mode='lying', a0=0.0, a1=82.0)
def fly_setup(ctx):
    C = dict(FL); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats
    if C['mode'] == 'lying':
        v0 = ctx.vars; ctx.vars = dict(inc=C['inc'], floor=C['floor'], var='fly', load='db' if C['load'] == 'db' else 'none'); press_setup(ctx); ctx.vars = v0; ctx.C = C   # 판·몸 위치만 같이 쓴다
        if C['load'] == 'band': ctx.BD = {s: wire(ctx, "band") for s, _ in SIDES}
        if C['load'] == 'cable':
            ctx.HD = {s: cyl("hdl_"+s, 0.016, 0.13, M_.STEEL, verts=24) for s, _ in SIDES}; ctx.W = {s: wire(ctx) for s, _ in SIDES}
            for sg in (-1, 1): box("pulley", (0.16, 0.16, 0.30), (sg*0.95, ctx.S.y-0.02, 0.15), M_.FRAME)
    elif C['mode'] == 'machine':   # 펙덱: 앉아서 팔을 앞으로 모은다
        hip = r.ANK_Z+r.L_S+0.015; off = r.HIP_OFF; ctx.P = V((0, 0.02, hip-off.z)); T = hip-0.105; ctx.T = T
        box("seat", (0.42, 0.42, 0.07), (0, -0.06, T-0.035), M_.PAD, 0.024); box("stem", (0.10, 0.10, T-0.07), (0, -0.06, (T-0.07)/2), M_.FRAME); box("bpad", (0.36, 0.08, 0.70), (0, 0.19, T+0.42), M_.PAD, 0.03)
        box("tower", (0.12, 0.12, 2.0), (0, 0.32, 1.0), M_.FRAME); ctx.LV = {s: cyl("lever_"+s, 0.022, 1.0, M_.FRAME, axis='Z', verts=16) for s, _ in SIDES}; ctx.HD = {s: cyl("hdl_"+s, 0.018, 0.16, M_.STEEL, axis='Z', verts=24) for s, _ in SIDES}
    else:   # 서서 케이블(크로스오버·로우 투 하이)
        ctx.HD = {s: cyl("hdl_"+s, 0.016, 0.13, M_.STEEL, verts=24) for s, _ in SIDES}; ctx.W = {s: wire(ctx) for s, _ in SIDES}; hz = 1.95 if C['mode'] == 'cross' else 0.20; ctx.PUL = {}
        for s, sg in SIDES: ctx.PUL[s] = V((sg*1.05, r.ANK_Y+0.10, hz)); box("stack_"+s, (0.10, 0.10, 2.10), (sg*1.12, r.ANK_Y+0.10, 1.05), M_.FRAME)
def fly(r, t, ctx):
    C = ctx.C; u = timing(t); m = C['mode']; load = []
    if m == 'lying':
        inc = C['inc']; pr_torso(r, ctx.P, inc, (lerp(-1.0, -1.0, u), lerp(1.0, -2.5, u))); a1 = C['a1'] if not C['floor'] else 64.0; a = math.radians(lerp(C['a0'], a1, u)); Rt = Rx(inc)
        for s, sg in SIDES:
            S = r.chain_head('upperarm_'+s); y_ = 0.03; d = Rt@V((sg*math.sin(a), y_, math.cos(a))).normalized(); E = S+d*r.L_U; b = a-math.radians(lerp(17, 24, u)); d2 = Rt@V((sg*math.sin(b), y_, math.cos(b))).normalized(); lat = Rt@V((0, 1, 0))
            G = jointed(r, s, E, E+d2*r.L_F, d2, lat, Rt@V((sg*math.cos(a), 0.15, -math.sin(a)))); r.fingers(s)
            if C['load'] == 'db': hold(ctx, s, G, lat); load.append((G, 12.0))
            if C['load'] == 'band': wire_to(ctx.BD[s], G, V((0, ctx.P.y+0.05, ctx.T-0.06)) if not C['floor'] else V((sg*0.05, ctx.S.y+0.02, 0.02)))
            if C['load'] == 'cable': ctx.HD[s].location = G; rot_to(ctx.HD[s], lat); wire_to(ctx.W[s], G, V((sg*0.86, ctx.S.y-0.02, 0.20)))
        press_legs(r, ctx, dict(PR, inc=inc, floor=C['floor'], var=''))
        return dict(bar=None, load=load, fixed=['foot_l', 'foot_r', 'pelvis', 'spine_03'])
    if m == 'machine':
        th = -6.0; R_ = Rx(th); r.torso(ctx.P, R_, neck=Rx(th*0.5), head=Rx(th*0.3), scap={s: (0.0, lerp(-1.0, 1.5, u)) for s, _ in SIDES})
        a = math.radians(lerp(80, 8, u)); piv = {}
        for s, sg in SIDES:
            S = r.chain_head('upperarm_'+s); d = V((sg*math.sin(a), -math.cos(a), -0.06)).normalized(); E = S+d*r.L_U; b = a-math.radians(14); d2 = V((sg*math.sin(b), -math.cos(b), -0.04)).normalized(); lat = V((0, 0, 1))
            G = jointed(r, s, E, E+d2*r.L_F, d2, lat, V((sg*math.cos(a)*0.3, 0.3, -1))); r.fingers(s, 0.8); ctx.HD[s].location = G; rot_to(ctx.HD[s], V((0, 0, 1)))
            pv = V((sg*0.20, S.y+0.12, S.z+0.30)); wire_to(ctx.LV[s], G+V((0, 0, 0.08)), pv)
        for s, sg in SIDES: r.leg_ik(s, V((sg*0.16, ctx.P.y-r.L_T*0.97, r.ANK_Z)), V((sg*0.1, -0.5, 1)), Rz(sg*6)@V((0, -1, 0)), sg*6)
        return dict(bar=None, load=[], fixed=['pelvis', 'foot_l', 'foot_r'])
    # 서서 케이블: 한 발 앞으로 엇갈려 딛고 몸통을 조금 숙인다
    lean = 14.0 if m == 'cross' else 6.0; R_ = Rx(lean); off = R_@r.HIP_OFF; Af = V((0.12, r.ANK_Y-0.22, r.ANK_Z)); Ab = V((-0.12, r.ANK_Y+0.22, r.ANK_Z))
    y = r.ANK_Y; Lg = (r.L_T+r.L_S)*0.975; z = r.ANK_Z+sqrt0(Lg**2-0.22**2)-off.z; P = V((0, y-off.y, z)); r.torso(P, R_, neck=Rx(lean*0.5), head=Rx(lean*0.3), scap={s: (0.0, lerp(-1.0, 1.5, u)) for s, _ in SIDES})
    r.leg_ik('l', Af, V((0.1, -1, 0.1)), Rz(6)@V((0, -1, 0)), 6.0); r.leg_ik('r', Ab, V((-0.1, -1, 0)), Rz(-6)@V((0, -1, 0)), -6.0)
    a = math.radians(lerp(78, 6, u)); hz = lerp(0.35, -0.55, u) if m == 'cross' else lerp(-0.75, 0.30, u)   # 로우 투 하이: 엉덩이 옆 → 얼굴 높이(관찰)
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s); d = V((sg*math.sin(a), -math.cos(a), hz)).normalized(); E = S+d*r.L_U; b = a-math.radians(16); d2 = V((sg*math.sin(b), -math.cos(b), hz)).normalized(); lat = V((0, 0, 1)) if abs(hz) < 0.9 else V((0, -1, 0))
        G = jointed(r, s, E, E+d2*r.L_F, d2, lat, V((0, 0.4, -1)) if m == 'cross' else V((sg*0.3, 0.5, -1))); r.fingers(s); ctx.HD[s].location = G; rot_to(ctx.HD[s], V((0, 0, 1))); wire_to(ctx.W[s], G, ctx.PUL[s])
    return dict(bar=None, load=[], fixed=['foot_l', 'foot_r'])

# ════ 푸시업 변형: 앞꿈치(또는 무릎) 고정, 몸은 한 직선 ════
# hand_x 손 간격(반), hz 손 받침 높이, fz 발 받침 높이, knee 무릎 대고, gap 바닥 자세 어깨-손 높이, hand_dy 손을 발 쪽으로(의사 플란체)
PU = dict(ax=0.12, hand_x=0.28, hz=0.0, fz=0.0, knee=False, gap=0.25, hand_dy=0.0, pitch=55.0, ball_up=0.016, mode='', F_out=0.20)
def pu_pose(r, e, ctx):
    A = ctx.A_l; d = V((0, -math.cos(e), math.sin(e))); L = ctx.Lb; Rt = Rx(90-math.degrees(e)); off = Rt@r.HIP_OFF; hx = off.x-A.x; Lh = sqrt0(L**2-hx**2); H = V((A.x+hx, A.y+d.y*Lh, A.z+d.z*Lh)); return H-off, Rt
def pu_setup(ctx):
    C = dict(PU); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; yaw = 4.0; ctx.yaw = yaw
    if C['knee']:   # 무릎이 받침점: 무릎 → 고관절 직선
        ctx.A_l = V((r.HIP_OFF.x, 0.0, 0.055)); ctx.Lb = r.L_T
    else:
        ball = V((C['ax'], 0.0, r.head0('ball_l').z+C['ball_up']+C['fz'])); ctx.ball = ball; ctx.A_l = r.ankle_from_ball('l', ball, yaw, C['pitch']); ctx.Lb = (r.L_T+r.L_S)*(0.990 if C['mode'] == 'archer' else 0.997)
    W_z = C['hz']+0.036+r.GRIP_N; ctx.Wz = W_z; S0 = r.shoulder_local('l')-r.head0('pelvis'); ctx.S0 = S0
    def sh(e):
        P, Rt = pu_pose(r, e, ctx); return P+Rt@S0
    arm = (r.L_U+r.L_F)*1.004
    lo, hi = -0.8, 1.2
    for _ in range(50):
        m = (lo+hi)/2
        q = sh(m); dxs = q.x-C['hand_x'] if C['mode'] != 'onearm' else q.x-0.06
        if math.hypot(q.z-W_z, dxs) < arm: lo = m
        else: hi = m
    e0 = (lo+hi)/2; ctx.Wy = sh(e0).y-0.01+C['hand_dy']
    if C['hand_dy'] or C['mode'] == 'sphinx':   # 손이 어깨 아래가 아니면 거리로 다시 푼다
        lo, hi = -0.8, 1.2; Wp = lambda: V((C['hand_x'], ctx.Wy, W_z))
        for _ in range(50):
            m = (lo+hi)/2
            if (sh(m)-Wp()).length < arm*0.995: lo = m
            else: hi = m
        e0 = (lo+hi)/2
    ctx.e_top = e0
    want = W_z+C['gap']
    if C['mode'] == 'sphinx':   # 아래 자세: 팔꿈치가 바닥에 닿고 아래팔이 바닥에 눕는다
        want = 0.05+r.L_U*0.97
    lo2, hi2 = -0.8, ctx.e_top
    for _ in range(50):
        m = (lo2+hi2)/2
        if sh(m).z < want: lo2 = m
        else: hi2 = m
    ctx.e_bot = (lo2+hi2)/2
    if C['mode'] == 'sphinx':
        ctx.Wy = sh(ctx.e_bot).y-r.L_F*0.98; lo, hi = ctx.e_bot, 1.2; Wp = V((C['hand_x'], ctx.Wy, W_z))
        for _ in range(50):
            m = (lo+hi)/2
            if (sh(m)-Wp).length < arm*0.97: lo = m
            else: hi = m
        ctx.e_top = (lo+hi)/2
    if C['hz'] > 0.05 and C['mode'] != 'ring':   # 벤치(손 받침)
        box("bench", (0.70, 0.36, C['hz']-0.01), (0, ctx.Wy, (C['hz']-0.01)/2), M_.PAD, 0.02)
    if C['fz'] > 0.05: box("bench", (0.50, 0.36, C['fz']-0.01), (0, ctx.ball.y+0.04, (C['fz']-0.01)/2), M_.PAD, 0.02)
    if C['mode'] == 'deficit':
        for sg in (-1, 1): box("blk", (0.14, 0.22, C['hz']), (sg*C['hand_x'], ctx.Wy, C['hz']/2), M_.RUBBER, 0.01)
    if C['mode'] == 'ring':
        ctx.RG = {}
        for s, sg in SIDES: ctx.RG[s] = cyl("ring_"+s, 0.10, 0.03, M_.STEEL, (sg*C['hand_x'], ctx.Wy, C['hz']), axis='Y', verts=32); wire_to(wire(ctx, "strap_"+s), V((sg*C['hand_x'], ctx.Wy, C['hz']+0.10)), V((sg*C['hand_x'], ctx.Wy, 2.6)))
    if C['knee']: box("mat", (0.70, 1.60, 0.012), (0, -0.25, 0.006), M_.PAD, 0.004)
def push_up(r, t, ctx):
    C = ctx.C; u = timing(t); m = C['mode']; e = lerp(ctx.e_top, ctx.e_bot, u); P, Rt = pu_pose(r, e, ctx); deg = 90-math.degrees(e); fixed = []; dx = 0.0
    pop = 0.0
    if m == 'clap':   # 맨 위에서 몸이 떠오르고(발목 축으로 더 돌림) 손이 바닥에서 떨어진다
        pop = 1-sstep(0.0, 0.30, u); P, Rt = pu_pose(r, e+pop*0.07, ctx)
    if m == 'archer':   # 굽히는 팔 쪽(왼쪽)으로 몸 전체를 발목 축으로 돌리고, 몸통을 왼쪽으로 굴린다
        yw = lerp(0.0, 2.5, u); c0 = V((0, ctx.ball.y, ctx.ball.z)); P = c0+Rz(yw)@(P-c0); Rt = Rz(yw)@Rt@Ry(lerp(0.0, -20.0, u))
    r.torso(P, Rt, neck=Rx(deg-8), head=Rx(deg-14), scap={s: (0.0, lerp(1.5, -1.5, u)) for s, _ in SIDES})
    for s, sg in SIDES:
        if C['knee']:
            K = V((sg*r.HIP_OFF.x, 0.0, 0.055)); A = K+V((sg*0.01, 0.30, 0.30)).normalized()*r.L_S; r.leg(s, K, A, V((0, 0, -1)), 0.0, 180.0); fixed.append('calf_'+s)
        else:
            ax = C['ax']; ball = V((sg*ax, 0.0, ctx.ball.z)); A = r.ankle_from_ball(s, ball, sg*ctx.yaw, C['pitch']); r.leg_ik(s, A, V((sg*0.08, -0.2, -1)), Rz(sg*ctx.yaw)@V((0, -1, 0)), sg*ctx.yaw, C['pitch'], True); fixed.append('ball_'+s)
    for s, sg in SIDES:
        hx = C['hand_x'] if not (m == 'archer' and s == 'r') else C.get('hand_xr', C['hand_x']); F = V((sg*C['F_out'], -1, 0)).normalized(); W = V((sg*hx, ctx.Wy, ctx.Wz)); pole = V((sg*0.6, 0.8, 0.3)); lat = None
        if m == 'onearm' and s == 'r':   # 다른 손은 허리 뒤
            S = r.chain_head('upperarm_'+s); G = S+Rt@V((sg*0.02, 0.16, -0.38)); r.arm(s, G, Rt@V((-sg*1, 0, 0)), Rt@V((sg*1, 0.6, 0)), Rt@V((0, 0, 1)), 0.9995); r.fingers(s, 0.3); continue
        if m == 'onearm': W = V((0.06, ctx.Wy, ctx.Wz))
        if m == 'diamond': F = V((-sg*0.5, -1, 0)).normalized(); pole = V((sg*0.9, 0.5, 0.3))
        if m == 'pseudo': F = V((sg*0.8, -0.6, 0)).normalized(); pole = V((sg*0.4, 1, 0.3))
        if m == 'ring': F = V((0, -1, 0)); lat = V((0, 0, 1)) if False else None
        if m == 'archer' and s == 'r': pole = V((sg*0.2, 0.3, 1)); F = V((sg*1, -0.3, 0)).normalized()   # 편 팔: 손가락이 바깥
        if m == 'sphinx':   # 아래팔이 바닥에 누웠다가 손바닥으로 밀어 편다
            pole = V((sg*0.2, 1, -0.3)).normalized()
        if m == 'clap':
            Wc = V((sg*0.05, ctx.Wy-0.02, ctx.Wz+0.18)); W = W.lerp(Wc, pop)
        G = grip_w(r, s, W, F); r.arm(s, G, F, pole, None, 0.9995); r.fingers(s, 0.0)
        if m == 'ring': ctx.RG[s].location = G+V((0, 0, -0.02))
        if m != 'clap': fixed.append('hand_'+s)
    return dict(bar=None, load=[], fixed=fixed)

# ════ 딥스(평행봉·스트레이트 바·링·보조 머신·밴드·벤치·코리안) ════
DP = dict(mode='bars', bar_z=1.32, grip=0.26, lean0=4.0, lean1=22.0, drop=0.30, assist='')
def dip_setup(ctx):
    C = dict(DP); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; m = C['mode']; z = C['bar_z']; g = C['grip']
    if m in ('bars', 'ring', 'machine', 'band'):
        if m == 'ring':
            for sg in (-1, 1): wire_to(wire(ctx, "strap"), V((sg*g, 0.0, z+0.10)), V((sg*g, 0.0, 2.8)))
            ctx.RG = {s: cyl("ring_"+s, 0.10, 0.03, M_.STEEL, axis='X', verts=32) for s, _ in SIDES}
        else:
            for sg in (-1, 1):
                cyl("shaft_"+str(sg), 0.022, 0.80, M_.STEEL, (sg*(g+0.01), 0.0, z), axis='Y'); box("up", (0.07, 0.07, z), (sg*(g+0.01), -0.38, z/2), M_.FRAME); box("up2", (0.07, 0.07, z), (sg*(g+0.01), 0.38, z/2), M_.FRAME)
        if m == 'machine': ctx.KP = box("kpad", (0.40, 0.30, 0.08), (0, 0, 0), M_.PAD, 0.03); ctx.LV = cyl("lever", 0.025, 1.0, M_.FRAME, axis='Z', verts=16)
        if m == 'band': ctx.BD = wire(ctx, "band")
    elif m == 'bar':   # 스트레이트 바: 몸 앞의 가로 바
        cyl("shaft", 0.016, 1.2, M_.STEEL, (0, -0.18, z)); [box("up", (0.07, 0.07, z), (sg*0.62, -0.18, z/2), M_.FRAME) for sg in (-1, 1)]
    elif m == 'korean':   # 몸 뒤의 가로 바
        cyl("shaft", 0.016, 1.2, M_.STEEL, (0, 0.10, z)); [box("up", (0.07, 0.07, z), (sg*0.62, 0.10, z/2), M_.FRAME) for sg in (-1, 1)]
    else:   # bench: 뒤 벤치에 손, 앞 바닥에 발뒤꿈치
        T = 0.46; ctx.T = T; box("bench", (0.90, 0.30, T-0.02), (0, 0.34, (T-0.02)/2+0.01), M_.PAD, 0.024)
def dip(r, t, ctx):
    C = ctx.C; u = timing(t); m = C['mode']; z = C['bar_z']; g = C['grip']; fixed = []
    if m == 'bench':
        T = ctx.T; lean = lerp(4.0, 10.0, u); Rt = Rx(lean); G = {s: V((sg*0.20, 0.21, T+0.03)) for s, sg in SIDES}   # [원본] lean 4→10 — 엉덩이가 벤치 모서리에 닿았다
        S0 = r.shoulder_local('l', 0, 0)-r.head0('pelvis'); dS = Rt@S0; Sy = G['l'].y-0.18; Sz = lerp(G['l'].z+(r.L_U+r.L_F)*0.95, G['l'].z+0.34, u); P = V((0, Sy-dS.y, Sz-dS.z))
        r.torso(P, Rt, neck=Rx(lean*0.5), head=Rx(lean*0.3), scap={s: (lerp(0.0, 2.5, u), lerp(-1.5, -3.0, u)) for s, _ in SIDES})
        for s, sg in SIDES:
            A = V((sg*0.14, -0.80, r.ANK_Z)); r.leg_ik(s, A, V((0, -0.3, 1)), V((0, -0.2, 1)).normalized(), 0.0, -60.0); fixed.append('foot_'+s)
            F = V((0, -1, 0)); r.arm(s, G[s], F, V((sg*0.25, 1, 0.1)), None, 0.9995); r.fingers(s, 0.5); fixed.append('hand_'+s)
        return dict(bar=None, load=[], fixed=fixed)
    lean = lerp(C['lean0'], C['lean1'], u)
    if m == 'korean': lean = lerp(6.0, 30.0, u)
    Rt = Rx(lean); S0 = r.shoulder_local('l', lerp(0.0, 2.5, u), lerp(-1.0, -2.0, u))-r.head0('pelvis'); dS = Rt@S0
    if m in ('bars', 'ring', 'machine', 'band'): G = {s: V((sg*g, 0.0, z)) for s, sg in SIDES}; Gy = 0.0
    elif m == 'bar': G = {s: V((sg*0.24, -0.18, z)) for s, sg in SIDES}; Gy = -0.18
    else: G = {s: V((sg*0.22, 0.10, z)) for s, sg in SIDES}; Gy = 0.10
    arm = (r.L_U+r.L_F)*0.975
    if m in ('bars', 'ring', 'machine', 'band'): Sy = lerp(Gy+0.02, Gy-0.07, u)
    elif m == 'bar': Sy = lerp(Gy+0.13, Gy+0.08, u)
    else: Sy = lerp(Gy-0.12, Gy-0.26, u)
    S_top = G['l'].z+sqrt0(arm**2-(G['l'].x-S0.x)**2-(Sy-Gy)**2)
    Sz = lerp(S_top, G['l'].z+(0.18 if m != 'bar' else 0.20), u)   # 바닥 자세: 위팔이 수평쯤(팔꿈치 약 90°)
    if m == 'korean': Sz = lerp(S_top, G['l'].z+0.08, u)
    P = V((0, Sy-dS.y, Sz-dS.z)); r.torso(P, Rt, neck=Rx(lean*0.6), head=Rx(lean*0.4), scap={s: (lerp(0.0, 2.5, u), lerp(-1.0, -2.0, u)) for s, _ in SIDES})
    for s, sg in SIDES:   # 다리: 무릎을 굽혀 뒤로(평행봉), 바는 앞으로 조금
        H = r.chain_head('thigh_'+s); a1 = math.radians(-lean+(8 if m != 'bar' else 25)); K = H+V((sg*0.02, -math.sin(a1), -math.cos(a1)))*r.L_T; b = math.radians(-lean+(-55 if m in ('bars', 'ring', 'band', 'korean') else -50)); A = K+V((0, -math.sin(b), -math.cos(b)))*r.L_S
        if m == 'machine': b = math.radians(-lean-80); A = K+V((0, -math.sin(b), -math.cos(b)))*r.L_S
        if m == 'bar': A = A+V((0, 0, 0))
        r.leg(s, K, A, V((0, -math.cos(b)*0.6, -0.8)).normalized() if m != 'machine' else V((0, 0, -1)), 0.0, 30.0 if m != 'machine' else 122.0)
    for s, sg in SIDES:
        if m == 'bar': F = V((0, -0.25, -1)).normalized(); lat = None; pole = V((sg*0.4, 1, 0.1))   # 손이 손목 아래(바를 눌러 짚음)
        elif m == 'korean': F = V((0, 0.3, -1)).normalized(); lat = None; pole = V((sg*0.2, 1, 0.2))
        else: F = V((0, -0.05, -1)).normalized(); lat = V((0, -1, 0)); pole = V((sg*0.30, 1, 0.1))
        r.arm(s, G[s], F, pole, lat, 0.9995); r.fingers(s); fixed.append('hand_'+s)
        if m == 'ring': ctx.RG[s].location = G[s]
    if m == 'machine':   # 무릎 패드가 무릎 아래에서 받쳐 준다
        Kc = (r.chain_head('calf_l')+r.chain_head('calf_r'))/2; place_obj(ctx.KP, Kc+V((0, 0.06, -0.10))); wire_to(ctx.LV, Kc+V((0, 0.20, -0.12)), V((0, 0.55, 0.30)))
    if m == 'band':
        Kc = (r.chain_head('calf_l')+r.chain_head('calf_r'))/2; wire_to(ctx.BD, Kc+V((0, 0, -0.05)), V((0, 0.0, z)))
    return dict(bar=None, load=[], fixed=fixed)

# ════ 스벤드 프레스: 원판 두 장을 손바닥으로 눌러 가슴 앞에서 앞으로 민다 ════
def sv_setup(ctx):
    M_ = ctx.mats; ctx.PL = cyl("plate", 0.11, 0.05, M_.RUBBER, axis='X', verts=48); local_pts(ctx)
def svend(r, t, ctx):
    u = timing(t); ax = 0.15; P = stand_P(r, ax); r.torso(P, Rx(2.0), neck=Rx(0), head=Rx(0), scap={s: (0.0, lerp(-0.5, 2.0, u)) for s, _ in SIDES}); fixed = plant(r, ax)
    S = r.chain_head('upperarm_l'); c = V((0, lerp(S.y-0.28, S.y-0.44, u), S.z-lerp(0.16, 0.10, u))); ctx.PL.location = c
    for s, sg in SIDES:
        F = V((0, -0.15, 1)).normalized(); lat = V((0, 1, 0)); G = c+V((sg*0.045, 0, 0)); r.arm(s, G, F, V((sg*0.8, 0.3, -1)), lat, 0.9995); r.fingers(s, 0.1)
    return dict(bar=None, load=[(c, 20.0)], fixed=fixed)

SOLVERS = {'press': (press_setup, press), 'fly': (fly_setup, fly), 'push_up': (pu_setup, push_up), 'dip': (dip_setup, dip), 'svend': (sv_setup, svend)}
