# SPDX-License-Identifier: GPL-3.0-or-later
"""팔 묶음 계산식(SPEC-040 Phase 9): 컬·익스텐션·킥백·푸시다운·손목·그립. 변형은 catalog 의 vars 로 고른다.
좌표: X 왼쪽+, -Y 앞, Z 위. Rx(+)=앞으로 숙임. t 0=시작 자세, 1=반대쪽 자세(왕복 재생).
팔꿈치 한 관절 동작은 위팔 방향 U·굽힘 방향 Fd·굽힘 각 f 로 아래팔을 정한다(위팔은 고정, 팔꿈치만 움직인다).
손 방향(lat=엄지 쪽)은 중립 Ln(굽힘면 안, 엄지가 굽힘 쪽)과 바깥 Lo(뒤침 때 엄지 방향) 사이 각 β 로 정한다: 90 뒤침(손바닥 위)·0 중립(해머)·-90 엎침(리버스).
동작 근거는 실제 수행 관찰 메모(저장소 밖)다."""
import math
from mathutils import Vector as V
from rig import Rx, Rz, lerp, sstep, sqrt0
from scene import PLATE_R, barbell, box, cyl
from families.reps import (SIDES, BAR_KG, DB_KG, timing, dumbbell, hold, rot_to, wire, wire_to, stand_P, plant, grip_w, jointed)
from families.squat_lunge import kettlebell, place_obj, KB_KG
from families.push import press_setup, pr_torso, press_legs, _mesh
from families.hinge import stand_frame, keys


def zt(o, v):   # cyl() 원기둥은 메시 축이 로컬 Z — rot_to(로컬 X 맞춤)를 쓰면 축이 90° 틀어진다
    v = V(v).normalized(); o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = v.to_track_quat('Z', 'Y' if abs(v.y) < 0.99 else 'X')

def mir(v, sg): return V((v[0]*sg, v[1], v[2]))
def unit(v): return V(v).normalized()

# ════ 몸 자세 ════
# stand 선 자세(th 몸통 기울기) · bent 숙인 자세(킥백) · seat 벤치에 앉음 · conc 앉아 숙임(컨센트레이션) · preacher 앉아 패드에 위팔
# lie 벤치에 누움(inc 등판 각 — 인클라인 컬도 여기) · spider 인클라인 벤치에 엎드림
EL = dict(pose='stand', th=0.0, ax=0.15, dy=0.0, inc=0.0, load='db', U=(0.05, 0.02, -1.0), Uf='t', U1=None, Fd=(0.0, -1.0, 0.0), Ff='t', f0=8.0, f1=135.0, b0=90.0, b1=90.0, w0=0.0, w1=0.0,
          hands='both', pull=None, pc=None, gw=None, seat_T=None)
def seat_bench(ctx, back=False, y=-0.04):
    r = ctx.rig; M_ = ctx.mats; hip = r.ANK_Z+r.L_S+0.015; off = r.HIP_OFF; ctx.P = V((0, 0.0, hip-off.z)); T = hip-0.105; ctx.T = T
    box("seat", (0.40, 0.40, 0.07), (0, y, T-0.035), M_.PAD, 0.024); box("stem", (0.09, 0.09, T-0.07), (0, y, (T-0.07)/2), M_.FRAME); box("ft", (0.56, 0.09, 0.04), (0, y, 0.02), M_.FRAME)
    if back: box("back", (0.32, 0.07, 0.62), (0, 0.205, T+0.40), M_.PAD, 0.024); box("bstem", (0.08, 0.08, T+0.10), (0, 0.27, (T+0.10)/2), M_.FRAME); box("ft2", (0.56, 0.09, 0.04), (0, 0.27, 0.02), M_.FRAME)
def spider_setup(ctx, th):
    """인클라인 벤치에 가슴을 대고 엎드린다: 다리는 뒤로 비스듬히 펴 바닥을 딛고, 패드는 몸통 앞면에 맞춘다."""
    r = ctx.rig; M_ = ctx.mats; Rt = Rx(th); g = math.radians(36.0); Lg = (r.L_T+r.L_S)*0.97
    Az = r.ankle_from_ball('l', V((0.15, 0.0, r.head0('ball_l').z+0.016)), 0.0, 45.0).z; ctx.Az = Az; Hz = Az+Lg*math.cos(g); off = Rt@r.HIP_OFF; P = V((0, 0.30, Hz-off.z)); ctx.P = P; ctx.Rt = Rt; ctx.g = g   # 앞꿈치로 딛고 뒤꿈치를 든다
    r.reset(); r.torso(P, Rt, neck=Rx(th*0.6), head=Rx(th*0.4)); vs = _mesh(ctx); Nf = Rt@V((0, -1, 0)); up = Rt@V((0, 0, 1))
    ch = [vs[i] for i, w in enumerate(ctx.weights) if w.get('spine_03', 0)+w.get('spine_02', 0) > 0.5 and abs(ctx.rest_v[i].x) < 0.12]
    S = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2; surf = max((v-S).dot(Nf) for v in ch)
    c = S+Nf*(surf+0.05)-up*0.37;   # 패드 끝이 겨드랑이 아래(팔이 패드 위로 넘어간다)
    pd = box("pad", (0.32, 0.07, 0.24), tuple(c), M_.PAD, 0.024); pd.rotation_euler = (math.radians(th), 0, 0)   # 가슴만 받친다(길면 허벅지에 닿는다)
    lo = c-up*0.18; box("stem", (0.08, 0.08, max(lo.z, 0.1)), (0, lo.y, max(lo.z, 0.1)/2), M_.FRAME); box("ft", (0.56, 0.09, 0.04), (0, lo.y, 0.02), M_.FRAME)
def el_setup(ctx):
    C = dict(EL); C.update(ctx.vars); r = ctx.rig; M_ = ctx.mats; ps = C['pose']
    if ps == 'lie':
        ctx.vars = dict(inc=C['inc'], load='none', var='fly'); press_setup(ctx); ctx.PC = ctx.C   # 벤치·몸 위치는 누워 밀기와 같은 방법
    elif ps in ('seat', 'conc', 'preacher'): seat_bench(ctx, back=C.get('back', False))
    elif ps == 'spider': spider_setup(ctx, C['th'])
    ctx.C = C; ld = C['load']
    if ld in ('bar', 'ez', 'smith'): ctx.BAR = barbell(ctx.col, M_)
    if ld == 'smith':
        y = C.get('rail_y', 0.0)
        for sg in (-1, 1): box("rail", (0.05, 0.05, 2.10), (sg*0.66, y, 1.05), M_.FRAME)
    if ld == 'db': ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES if C['hands'] == 'both' or s == 'r'}
    if ld == 'db1': ctx.DB = {'c': dumbbell(ctx, "db_c")}
    if ld == 'kb1': ctx.KB = kettlebell(ctx, "kb_c")
    if ld == 'plate': ctx.PL = cyl("plate", PLATE_R*0.82, 0.03, M_.RUBBER, verts=64)
    if ld in ('cable', 'band', 'rope', 'cbar'):
        ctx.W = {s: wire(ctx, "band" if ld == 'band' else "cable") for s, _ in SIDES}; ctx.WC = wire(ctx)
        if ld == 'cable': ctx.HD = {s: cyl("hdl_"+s, 0.016, 0.13, M_.STEEL, verts=24) for s, _ in SIDES}
        if ld == 'cbar': ctx.HB = cyl("hbar", 0.014, C.get('hbar', 0.46), M_.STEEL, verts=24)
        pl = C['pull']
        if pl is not None:
            pts = [V(pl)] if C['pc'] else [mir(pl, 1), mir(pl, -1)]
            for p in pts:
                if ld != 'band': box("pulley", (0.12, 0.12, 0.12), tuple(p), M_.FRAME); box("post", (0.10, 0.10, max(p.z, 0.3)+0.10), (p.x, p.y+0.10, (max(p.z, 0.3)+0.10)/2), M_.FRAME)
    if ld == 'pplate': ctx.PP = {s: cyl("pp_"+s, 0.15, 0.025, M_.RUBBER, verts=64) for s, _ in SIDES}
    if ld == 'roller': ctx.HB = cyl("hbar", 0.018, 0.46, M_.STEEL, verts=24); ctx.WC = wire(ctx); ctx.PL = cyl("plate", 0.11, 0.03, M_.RUBBER, verts=48)
    if ld == 'gripper': ctx.GR = [cyl("grip_a", 0.014, 0.11, M_.HUB, axis='Z', verts=24), cyl("grip_b", 0.006, 0.05, M_.STEEL, axis='Z', verts=12)]; ctx.GRn = (0, 0, 0)
    if ld == 'machine':   # 머신 프리처: 팔꿈치 옆 축에서 손잡이까지 레버
        ctx.LV = {s: cyl("lever_"+s, 0.022, 1.0, M_.FRAME, axis='Z', verts=24) for s, _ in SIDES}; ctx.HB = cyl("hbar", 0.016, 0.52, M_.STEEL, verts=24)
    ctx.PAD_DONE = False

def el_body(r, ctx, C, u):
    """몸통·다리를 놓고 (Rt 몸통 회전, fixed) 를 돌려준다."""
    ps = C['pose']; th = C['th']
    if ps == 'stand':
        ax = C['ax']; P = stand_P(r, ax, C['dy']); Rt = Rx(th); r.torso(P, Rt, neck=Rx(th*0.4), head=Rx(th*0.3), scap={s: (C.get('se', 0.0), C.get('sp', 0.5)) for s, _ in SIDES}); return Rt, plant(r, ax)
    if ps == 'bent':
        P, R, A, K = stand_frame(r, dict(ax=C['ax'], toe=8.0), C.get('al', 9.0), C.get('ph', 40.0), th, scap=(0.0, 1.0)); return R, ['foot_l', 'foot_r']
    if ps in ('seat', 'conc', 'preacher'):
        P = ctx.P; Rt = Rx(th); r.torso(P, Rt, neck=Rx(th*0.5), head=Rx(th*0.4), scap={s: (0.0, C.get('sp', 0.5)) for s, _ in SIDES})
        kx = 0.30 if ps == 'conc' else 0.20
        for s, sg in SIDES: r.leg_ik(s, V((sg*kx, P.y-r.L_T*0.95, r.ANK_Z)), V((sg*(0.6 if ps == 'conc' else 0.15), -0.5, 1)), Rz(sg*14)@V((0, -1, 0)), sg*14)
        return Rt, ['pelvis', 'foot_l', 'foot_r']
    if ps == 'lie':
        inc = C['inc']; pr_torso(r, ctx.P, inc, (C.get('se', -0.5), C.get('sp', -1.0))); press_legs(r, ctx, ctx.PC); return Rx(-92.0+inc), ['pelvis', 'spine_03', 'foot_l', 'foot_r']
    if ps == 'spider':
        Rt = ctx.Rt; r.torso(ctx.P, Rt, neck=Rx(th*0.6), head=Rx(th*0.4), scap={s: (0.0, 1.0) for s, _ in SIDES})
        for s, sg in SIDES:
            H = r.chain_head('thigh_'+s); Lg = (r.L_T+r.L_S)*0.97; dx = sg*0.15-H.x; A = V((sg*0.15, H.y+sqrt0(Lg**2-(H.z-ctx.Az)**2-dx**2), ctx.Az)); r.leg_ik(s, A, V((0, -1, -0.2)), V((0, -1, 0)), 0.0, 45.0, True)   # 발목 높이를 앞꿈치 딛은 높이에 맞춘다
        return Rt, ['pelvis', 'foot_l', 'foot_r']
    raise ValueError(ps)

def frame(v, f, Rt, sg):
    v = mir(v, sg); return (Rt@v if f == 't' else v).normalized()
def el_arm(r, ctx, C, s, sg, Rt, u, f, beta, w, Uv=None):
    """위팔 방향 고정, 팔꿈치 굽힘 f(도). 돌려줌: 쥔 점 G, lat, 아래팔 방향 d."""
    U = Uv if Uv is not None else frame(C['U'], C['Uf'], Rt, sg)
    if C['U1'] is not None and Uv is None: U = U.lerp(frame(C['U1'], C['Uf'], Rt, sg), u).normalized()
    Fd = frame(C['Fd'], C['Ff'], Rt, sg); Fd = (Fd-U*Fd.dot(U)).normalized()
    a = math.radians(f); d = U*math.cos(a)+Fd*math.sin(a); Ln = -U*math.sin(a)+Fd*math.cos(a); Lo = (Fd.cross(U)*sg).normalized()
    b = math.radians(beta); lat = (Ln*math.cos(b)+Lo*math.sin(b)).normalized()
    S = r.chain_head('upperarm_'+s); E = S+U*r.L_U; W = E+d*r.L_F*0.999
    F = d
    if abs(w) > 0.01:   # 손목 굽힘: 손끝을 손바닥 쪽(+)으로
        _F, _L, n = r.grip_frame(s, d, lat); F = (d*math.cos(math.radians(w))+n*math.sin(math.radians(w))).normalized()
    G = jointed(r, s, E, W, F, lat, -Fd+U*0.0); return G, lat, d

def el_load(r, ctx, C, Gs, lats, ds, u):
    ld = C['load']; load = []; bar = None
    if ld in ('db',):
        for s in Gs: hold(ctx, s, Gs[s], lats[s]); load.append((Gs[s], DB_KG))
    elif ld in ('bar', 'ez', 'smith'):
        bar = (Gs['l']+Gs['r'])/2; ctx.BAR.location = bar; load.append((bar, BAR_KG*0.6))
    elif ld == 'db1':   # 덤벨 하나를 두 손으로(손잡이는 손 사이, 아래팔 방향으로 세운다)
        c = (Gs['l']+Gs['r'])/2; dd = (ds['l']+ds['r']).normalized(); place = c+dd*C.get('db_off', 0.06); hold(ctx, 'c', place, dd); load.append((c, DB_KG))
    elif ld == 'kb1':
        c = (Gs['l']+Gs['r'])/2; dd = (ds['l']+ds['r']).normalized(); place_obj(ctx.KB, c, None); ctx.KB.rotation_mode = 'QUATERNION'; ctx.KB.rotation_quaternion = dd.to_track_quat('-Z', 'X' if abs(dd.x) < 0.9 else 'Y'); load.append((c, KB_KG))   # 종은 손 너머(아래팔 방향) — 주석에 묻혀 무게가 빠져 있던 것을 되살림
    elif ld == 'plate':
        c = (Gs['l']+Gs['r'])/2; n = (ds['l']+ds['r']).normalized().cross(V((1, 0, 0))).normalized(); ctx.PL.location = c+(ds['l']+ds['r']).normalized()*0.02; zt(ctx.PL, n); load.append((c, 10.0))
    elif ld in ('cable', 'band', 'rope', 'cbar'):
        pl = C['pull']
        if ld == 'cable':
            for s, sg in SIDES:
                if s not in Gs: continue
                ctx.HD[s].location = Gs[s]; zt(ctx.HD[s], lats[s]); wire_to(ctx.W[s], Gs[s], V(pl) if C['pc'] else mir(pl, sg)); load.append((Gs[s], 10.0))
            ctx.WC.location = V((0, 0, -5))
        elif ld == 'band':
            for s, sg in SIDES:
                if s not in Gs: continue
                a = V(pl) if C['pc'] else mir(pl, sg); wire_to(ctx.W[s], Gs[s], a); load.append((Gs[s], 6.0))
            ctx.WC.location = V((0, 0, -5))
        else:   # rope·cbar: 가운데 한 줄이 도르래로
            m = (Gs['l']+Gs['r'])/2; P_ = V(pl)
            if ld == 'rope':
                k = m+(P_-m).normalized()*0.16
                for s in Gs: wire_to(ctx.W[s], Gs[s], k)
                wire_to(ctx.WC, k, P_)
            else:
                ctx.HB.location = m; zt(ctx.HB, V((1, 0, 0))); wire_to(ctx.WC, m, P_)
                for s in Gs: ctx.W[s].location = V((0, 0, -5))
            load.append((m, 20.0))
    elif ld == 'pplate':   # 원판을 손가락으로 집어 옆에 든다(원판 면은 몸 옆면과 나란)
        for s in Gs: ctx.PP[s].location = Gs[s]+ds[s]*0.12; zt(ctx.PP[s], V((1, 0, 0))); load.append((Gs[s], 10.0))
    elif ld == 'roller':
        m = (Gs['l']+Gs['r'])/2; ctx.HB.location = m; rot_to(ctx.HB, V((1, 0, 0))); ctx.HB.rotation_mode = 'XYZ'; ctx.HB.rotation_euler = (0, math.pi/2, 0)
        k = m+V((0, 0, -0.03)); low = V((0, m.y, 0.30+0.20*u)); wire_to(ctx.WC, k, low); ctx.PL.location = low; zt(ctx.PL, V((0, 1, 0))); load.append((m, 5.0))
    elif ld == 'gripper':
        G = Gs['r']; ctx.GR[0].location = G+lats['r']*0.0; zt(ctx.GR[0], lats['r']); ctx.GR[1].location = G+ds['r']*0.0-V(ctx.GRn)*0.0; load.append((G, 1.0))
    elif ld == 'machine':
        m = (Gs['l']+Gs['r'])/2; ctx.HB.location = m; zt(ctx.HB, V((1, 0, 0)))
        for s, sg in SIDES:
            piv = ctx.PIVOT[s]; wire_to(ctx.LV[s], piv, Gs[s]+V((sg*0.05, 0, 0)))
        load.append((m, 20.0))
    return load, bar

def elbow(r, t, ctx):
    C = ctx.C; u = timing(t); Rt, fixed = el_body(r, ctx, C, u)
    f = keys(t, C['fk'])[0] if C.get('fk') else lerp(C['f0'], C['f1'], u); beta = keys(t, C['bk'])[0] if C.get('bk') else lerp(C['b0'], C['b1'], u); w = lerp(C['w0'], C['w1'], u)
    Gs, lats, ds = {}, {}, {}
    for s, sg in SIDES:
        if C['hands'] == 'one' and s == 'l':
            continue
        ws = w
        if C.get('roll'): ws = C['roll']*math.sin(2*math.pi*t)*(1 if s == 'l' else -1)   # 손목 롤러: 두 손목을 번갈아 굽혔다 편다
        cu = lerp(C['cu0'], C['cu1'], u) if 'cu0' in C else C.get('curl', 1.0)
        Gs[s], lats[s], ds[s] = el_arm(r, ctx, C, s, sg, Rt, u, f, beta, ws); r.fingers(s, cu)
        if C.get('press') and t > C['press']: press_up(r, ctx, C, s, sg, sstep(C['press'], 1.0, t), Gs, lats, ds)
    if C['hands'] == 'one': idle_arm(r, ctx, C, Rt)
    if C['pose'] == 'preacher' and not ctx.PAD_DONE: preacher_pad(ctx, C, Rt)
    load, bar = el_load(r, ctx, C, Gs, lats, ds, u)
    return dict(bar=bar, load=load, fixed=fixed)

def idle_arm(r, ctx, C, Rt):
    """한 팔 동작에서 쉬는 왼손: 앉으면 왼무릎 위, 서면 허리."""
    sg = 1
    if C['pose'] in ('conc', 'seat'):
        K = r.chain_head('calf_l'); W = K+V((0.02, 0.10, 0.06)); F = V((0, -1, -0.4)).normalized()
        jointed(r, 'l', r.chain_head('upperarm_l')+V((0.12, -0.10, -0.22)), W, F, V((-1, 0, 0)), V((0.6, 0.6, 0))); r.fingers('l', 0.4)
    else:
        S = r.chain_head('upperarm_l'); W = S+V((0.06, -0.02, -(r.L_U+r.L_F)*0.97)); G = grip_w(r, 'l', W, V((0, 0, -1)), V((0, -1, 0))); r.arm('l', G, V((0, 0, -1)), V((0.35, 0.8, 0)), V((0, -1, 0)), 0.9995); r.fingers('l', 0.5)

def preacher_pad(ctx, C, Rt):
    """위팔 아래에 비스듬한 패드(한 번만). 패드 윗면이 위팔 뒤쪽에 닿게 둔다."""
    r = ctx.rig; M_ = ctx.mats; ctx.PAD_DONE = True; S = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2
    U = frame(C['U'], C['Uf'], Rt, 1); U = V((0, U.y, U.z)).normalized(); Fd = frame(C['Fd'], C['Ff'], Rt, 1); Fd = V((0, Fd.y, Fd.z)); Fd = (Fd-U*Fd.dot(U)).normalized()
    c = S+U*(r.L_U*0.62)-Fd*(0.052+0.035); pd = box("pad", (0.58, 0.07, 0.30), tuple(c), M_.PAD, 0.024); pd.rotation_euler = (math.atan2(Fd.z, Fd.y), 0, 0)   # 상자 두께 축(Y)을 패드 법선 Fd 에 맞춘다
    lo = c-Fd*0.04; box("pstem", (0.08, 0.08, max(lo.z-0.1, 0.1)), (0, lo.y+0.06, max(lo.z-0.1, 0.1)/2), M_.FRAME)
    if C['load'] == 'machine':
        ctx.PIVOT = {s: r.chain_head('upperarm_'+s)+U*r.L_U+mir(V((0.13, 0, 0)), sg) for s, sg in SIDES}   # 팔꿈치 바로 바깥이 회전축

def press_up(r, ctx, C, s, sg, p, Gs, lats, ds):
    """컬 앤 프레스의 뒤 절반: 어깨 앞(컬 끝)에서 머리 위로 민다. 중립 그립 유지."""
    S = r.chain_head('upperarm_'+s); reach = (r.L_U+r.L_F)*0.975; Tp = S+V((-sg*0.03, -0.01, 0.0)); Tp.z = S.z+sqrt0(reach**2-0.03**2-0.01**2)+r.GRIP_F*0.6
    G0 = Gs[s]; G = G0.lerp(Tp, p); F = ds[s].lerp(V((0, 0, 1)), sstep(0.0, 0.5, p)).normalized(); lat = lats[s].lerp(V((0, 1, 0)), p); lat = (lat-F*lat.dot(F)).normalized()   # 컬 끝 손 방향에서 이어서 엄지가 뒤를 보게
    r.arm(s, G, F, V((sg*lerp(0.2, 0.9, p), lerp(-0.9, 0.0, p), -0.5)), lat, 0.9995); r.fingers(s); Gs[s], lats[s], ds[s] = G, lat, F

# ════ 맨몸 트라이셉스 익스텐션: 낮은 바를 잡고 몸을 곧게 기울여 팔꿈치만 굽혀 이마를 바 아래로 ════
BW = dict(bar_z=0.92, phi0=32.0, k0=0.975, k1=0.58, ax=0.14)
def bw_setup(ctx):
    C = dict(BW); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats
    A = V((0, r.ANK_Y, r.ANK_Z)); P0 = r.head0('pelvis'); P0.x = 0.0; ctx.A = A; ctx.dP = P0-A
    r.reset(); bw_pose(r, ctx, math.radians(C['phi0'])); S = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2
    Ld = (r.L_U+r.L_F)*C['k0']; dz = S.z-(C['bar_z']+0.02); dy = sqrt0(Ld**2-dz**2-0.02**2); ctx.Wy = S.y-dy; ctx.Wz = C['bar_z']+0.02
    for sg in (-1, 1): box("up", (0.07, 0.07, C['bar_z']+0.10), (sg*0.62, ctx.Wy, (C['bar_z']+0.10)/2), M_.FRAME); box("ft", (0.09, 0.50, 0.04), (sg*0.62, ctx.Wy, 0.02), M_.FRAME)
    ctx.BAR = cyl("hbar", 0.016, 1.30, M_.STEEL, verts=32); ctx.BAR.location = V((0, ctx.Wy, C['bar_z'])); zt(ctx.BAR, V((1, 0, 0)))
def bw_pose(r, ctx, phi):
    Rt = Rx(math.degrees(phi)); P = ctx.A+Rt@ctx.dP; r.torso(P, Rt, neck=Rx(math.degrees(phi)*0.7), head=Rx(math.degrees(phi)*0.5), scap={s: (1.0, 1.5) for s, _ in SIDES})
    ax = ctx.C['ax']
    for s, sg in SIDES: r.leg_ik(s, V((sg*ax, ctx.A.y, ctx.A.z)), Rt@V((sg*0.1, -1, 0)), V((0, -1, 0)), 0.0, 0.0)
    return Rt
def bwext(r, t, ctx):
    C = ctx.C; u = timing(t); k = lerp(C['k0'], C['k1'], u); Ld = (r.L_U+r.L_F)*k; W = {s: V((sg*0.20, ctx.Wy, ctx.Wz)) for s, sg in SIDES}
    lo, hi = math.radians(5.0), math.radians(70.0)
    for _ in range(36):   # 몸 기울기 φ: 어깨-손목 거리가 팔 길이×k 가 되는 각(앞으로 기울수록 어깨가 바에 가까워진다)
        m = (lo+hi)/2; bw_pose(r, ctx, m); S = r.chain_head('upperarm_l')
        if (S-W['l']).length > Ld: lo = m
        else: hi = m
    bw_pose(r, ctx, (lo+hi)/2); F = V((0, -1, -0.25)).normalized()
    for s, sg in SIDES:
        G = grip_w(r, s, W[s], F); r.arm(s, G, F, V((sg*0.3, 0.2, -1)), None, 0.9995); r.fingers(s)
    return dict(bar=None, load=[], fixed=['foot_l', 'foot_r', 'hand_l', 'hand_r'])

SOLVERS = {'elbow': (el_setup, elbow), 'bwext': (bw_setup, bwext)}
