# SPDX-License-Identifier: GPL-3.0-or-later
"""머신 묶음 계산식(SPEC-040 Phase 12): 앉아 밀기·당기기·플라이·레그 익스텐션/컬·어브/어덕션·삼두·사이드 레이즈·몸통 회전·누워 컬·썰매(핵 스쿼트 등)·레그 프레스.
좌표: X 왼쪽+, -Y 앞, Z 위. Rx(+)=앞으로 숙임, Rx(-90)=누움(머리 +Y), Rx(+90)=엎드림(머리 -Y). t 0=시작, 1=반대쪽 자세(왕복).
머신의 손잡이·패드는 축(pivot)을 중심으로 도는 강체 레버로 그린다 — 레버 길이가 변하지 않게 손잡이 경로를 축 둘레의 호로 잡는다."""
import math
from mathutils import Vector as V, Quaternion
from rig import Rx, Ry, Rz, lerp, sstep, sqrt0
from scene import PLATE_R, barbell, box, cyl
from families.reps import (SIDES, BAR_KG, DB_KG, timing, dumbbell, hold, rot_to, wire, wire_to, grip_w, jointed, hang, stand_P, plant)
from families.squat_lunge import local_pts, W_, place_obj

def arc(A, B, Pv, f):
    """축 Pv 둘레로 A → B 를 도는 호 위의 점(반지름은 두 끝을 잇는다)."""
    a, b = A-Pv, B-Pv; ra, rb = a.length, b.length; q = a.normalized().rotation_difference(b.normalized())
    ax, ang = q.to_axis_angle(); return Pv+(Quaternion(ax, ang*f)@a.normalized())*lerp(ra, rb, f)
def lever(o, a, b):
    """레버(원기둥)를 a→b 로 놓는다."""
    wire_to(o, a, b)
def mk_lever(ctx, name, r_=0.022):
    return cyl(name, r_, 1.0, ctx.mats.FRAME, axis='Z', verts=16)
def mk_handle(ctx, name, l=0.13):
    return cyl(name, 0.017, l, ctx.mats.STEEL, verts=24)

# ════ 앉는 머신 공용: 좌석·등판·발 ════
# back 등판(없으면 False), seat_y 좌석 중심(골반 기준), seat_d 좌석 깊이, th 몸통 기울기(- 뒤로 기댐)
def seat_setup(ctx, back=True, seat_front=None, th=-6.0, seat_len=0.40, hip_up=0.0):
    r = ctx.rig; M_ = ctx.mats; hip = r.ANK_Z+r.L_S+0.015+hip_up; off = r.HIP_OFF; ctx.P = V((0, 0.0, hip-off.z)); T = hip-0.105; ctx.T = T; ctx.hip = hip; ctx.th = th
    yb = 0.16; yf = -seat_len+0.16 if seat_front is None else seat_front   # 좌석 뒤·앞 끝(y)
    box("seat", (0.42, yb-yf, 0.07), (0, (yb+yf)/2, T-0.035), M_.PAD, 0.024); box("stem", (0.09, 0.09, T-0.07), (0, (yb+yf)/2, (T-0.07)/2), M_.FRAME); box("ft", (0.56, 0.09, 0.04), (0, (yb+yf)/2, 0.02), M_.FRAME)
    if back:   # 등판: 몸통 기울기에 맞춰 눕힌다(등 뒤 면이 판 앞면에 닿게)
        R_ = Rx(th); c = ctx.P+R_@V((0, 0.205, 0.50)); b = box("back", (0.34, 0.07, 0.66), tuple(c), M_.PAD, 0.024); b.rotation_euler = (math.radians(th), 0, 0)
        box("bstem", (0.08, 0.08, max(0.2, c.z-0.30)), (0, c.y+0.07, max(0.2, c.z-0.30)/2), M_.FRAME); box("ft2", (0.56, 0.09, 0.04), (0, c.y+0.07, 0.02), M_.FRAME)
def seat_torso(r, ctx, th=None, scap=(0.0, 0.0), yaw=0.0):
    th = ctx.th if th is None else th; R_ = Rx(th)
    if yaw: r.torso(ctx.P, R_, R_@Rz(yaw*0.35), R_@Rz(yaw*0.7), R_@Rz(yaw), Rx(th*0.5)@Rz(yaw*0.8), Rx(th*0.3)@Rz(yaw*0.6), scap={s: scap for s, _ in SIDES})
    else: r.torso(ctx.P, R_, neck=Rx(th*0.5), head=Rx(th*0.3), scap={s: scap for s, _ in SIDES})
    return R_
def seat_feet(r, ctx, ax=0.20, fy=None, kz=0.0):
    """발을 바닥에(무릎 약 90°)."""
    for s, sg in SIDES:
        H = r.chain_head('thigh_'+s); y = H.y-r.L_T*0.97 if fy is None else fy; r.leg_ik(s, V((sg*ax, y, r.ANK_Z+kz)), V((sg*0.12, -0.5, 1)), Rz(sg*8)@V((0, -1, 0)), sg*8)
def seat_hands_thigh(r, s, sg):
    """손을 허벅지 위에 얹는다(쉬는 손)."""
    H = r.chain_head('thigh_'+s); K = r.chain_head('calf_'+s); G = H.lerp(K, 0.55)+V((sg*0.02, 0, 0.09)); F = (K-H).normalized()
    r.arm(s, G, F, V((sg*0.6, 0.6, -0.4)), V((-sg, 0, 0)), 0.9995); r.fingers(s, 0.3)

# ════ 레그 익스텐션 · 시티드 레그 컬(머신·밴드) ════
# mode ext(펴기)·curl(굽히기), load machine·band
LE = dict(mode='ext', load='machine')
def le_setup(ctx):
    C = dict(LE); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats
    knee_y = -r.L_T+r.HIP_OFF.y   # 골반 기준 무릎 y(대략)
    if C['load'] == 'band':   # 벤치에 앉아 앞 기둥에 건 밴드를 발목에 걸고 뒤로 당긴다 — 무릎은 좌석 앞에 나와 있다
        seat_setup(ctx, back=False, seat_front=knee_y+0.24, th=2.0, hip_up=0.06); ctx.BD = [wire(ctx, "sl_band") for _ in range(2)]; box("post", (0.08, 0.08, 0.60), (0, knee_y-0.75, 0.30), M_.FRAME)
    else:
        seat_setup(ctx, back=True, seat_front=knee_y+(0.16 if C['mode'] == 'curl' else 0.12), th=-10.0, hip_up=0.09)   # 머신 좌석은 발이 바닥에 닿지 않게 높다
        ctx.RL = cyl("roll", 0.045, 0.34, M_.PAD, verts=32); ctx.LV = mk_lever(ctx, "lever"); ctx.ARMB = mk_lever(ctx, "lever2")
        if C['mode'] == 'curl': ctx.TP = box("tpad", (0.40, 0.10, 0.07), (0, 0, 0), M_.PAD, 0.03)
        for sg in (-1, 1): box("hdl", (0.04, 0.16, 0.04), (sg*0.30, -0.02, ctx.T+0.02), M_.STEEL)
def leg_ext(r, t, ctx):
    C = ctx.C; u = timing(t); m = C['mode']; R_ = seat_torso(r, ctx, scap=(0.0, 0.0))
    # b: 정강이가 수직에서 앞으로 든 각. ext 0(무릎 약 95°) → 75°, curl 75° → -25°(무릎 약 65°)
    if m == 'ext': b = lerp(-2.0, 72.0, u)
    else: b = lerp(72.0, -28.0 if C['load'] == 'machine' else -38.0, u)
    rb = math.radians(b); Ks = {}
    for s, sg in SIDES:
        H = r.chain_head('thigh_'+s); K = H+V((0, -1, -0.04)).normalized()*r.L_T; d2 = V((0, -math.sin(rb), -math.cos(rb))); A = K+d2*r.L_S; Ks[s] = (K, A, d2)
        r.leg(s, K, A, V((0, -math.cos(rb), math.sin(rb))), sg*0.0, -b+(12.0 if m == 'ext' else 8.0))
    Kc = (Ks['l'][0]+Ks['r'][0])/2; Ac = (Ks['l'][1]+Ks['r'][1])/2; d2 = Ks['l'][2]; nf = V((0, -math.cos(rb), math.sin(rb)))
    if C['load'] == 'machine':
        rl = Ac-d2*0.07+(nf*0.095 if m == 'ext' else -nf*0.10); ctx.RL.location = rl; rot_to(ctx.RL, V((1, 0, 0)))
        piv = V((0.27, Kc.y, Kc.z)); lever(ctx.LV, rl+V((0.20, 0, 0)), piv); lever(ctx.ARMB, piv, piv+V((0, 0.05, 0.40)))   # 축은 무릎 높이(무릎과 같은 축으로 돈다)
        if m == 'curl': ctx.TP.location = Kc+V((0, 0.10, 0.135))   # 허벅지 위 누름 패드
        for s, sg in SIDES:
            G = V((sg*0.30, -0.02, ctx.T+0.05)); r.arm(s, G, V((0, -0.3, -1)).normalized(), V((sg*0.8, 0.5, -0.1)), V((0, -1, 0)), 0.9995); r.fingers(s)
    else:
        for i, (s, sg) in enumerate(SIDES):
            K, A, _ = Ks[s]; wire_to(ctx.BD[i], A+V((0, -0.03, 0.02)), V((sg*0.03, Kc.y-0.75, 0.55))); r.arm(s, V((sg*0.24, ctx.P.y+0.02, ctx.T+0.01)), V((0, -0.2, -1)).normalized(), V((sg*0.8, 0.5, 0)), V((0, -1, 0)), 0.9995); r.fingers(s)
    return dict(bar=None, load=[], fixed=['pelvis'])

# ════ 힙 어브덕션·어덕션 머신: 등을 기대고 앉아 무릎을 벌리거나 모은다 ════
AB = dict(mode='abd')
def ab_setup(ctx):
    C = dict(AB); C.update(ctx.vars); ctx.C = C; M_ = ctx.mats; r = ctx.rig
    seat_setup(ctx, back=True, seat_front=-r.L_T*0.55, th=-14.0)
    ctx.KP = {s: box("kpad_"+s, (0.06, 0.14, 0.18), (0, 0, 0), M_.PAD, 0.025) for s, _ in SIDES}; ctx.FB = {s: box("fbar_"+s, (0.12, 0.20, 0.03), (0, 0, 0), M_.STEEL, 0.008) for s, _ in SIDES}
    ctx.LV = {s: mk_lever(ctx, "lever_"+s) for s, _ in SIDES}
    for sg in (-1, 1): box("hdl", (0.04, 0.18, 0.04), (sg*0.30, 0.02, ctx.T+0.03), M_.STEEL)
def abduct(r, t, ctx):
    C = ctx.C; u = timing(t); R_ = seat_torso(r, ctx)
    a = math.radians(lerp(6.0, 38.0, u) if C['mode'] == 'abd' else lerp(38.0, 6.0, u))
    for s, sg in SIDES:
        H = r.chain_head('thigh_'+s); dT = V((sg*math.sin(a), -math.cos(a), 0.10)).normalized(); K = H+dT*r.L_T; A = K+V((sg*math.sin(a)*0.25, -0.18, -1)).normalized()*r.L_S
        r.leg(s, K, A, (Rz(sg*math.degrees(a)*0.7)@V((0, -1, 0))), sg*math.degrees(a)*0.7, -8.0)
        side = 1 if C['mode'] == 'abd' else -1   # 패드: 무릎 바깥(어브) 또는 안쪽(어덕)
        n = V((sg*math.cos(a), sg*math.sin(a)*0.0+math.sin(a)*0.0, 0)); n = V((math.cos(a)*sg, math.sin(a), 0)).normalized()
        pad = K-dT*0.04+n*side*0.115; ctx.KP[s].location = pad; ctx.KP[s].rotation_euler = (0, 0, sg*a)
        ctx.FB[s].location = A+V((0, -0.06, -0.075)); ctx.FB[s].rotation_euler = (0, 0, sg*a*0.7)
        piv = V((sg*0.08, H.y, ctx.T-0.12)); lever(ctx.LV[s], pad+V((0, 0, -0.10)), piv)
        G = V((sg*0.30, 0.02, ctx.T+0.06)); r.arm(s, G, V((0, -0.3, -1)).normalized(), V((sg*0.8, 0.5, -0.1)), V((0, -1, 0)), 0.9995); r.fingers(s)
    return dict(bar=None, load=[], fixed=['pelvis'])

# ════ 앉아 밀기(체스트 프레스·인클라인·디클라인·숄더 프레스·한 팔·케이블·밴드) ════
# dir 손이 나가는 방향(정면 0, + 위로 각도), load machine·cable·band, one 한 팔(오른팔)
MP = dict(dir=0.0, load='machine', one=False, shoulder=False, gx0=0.20, gx1=0.13)
def mp_setup(ctx):
    C = dict(MP); C.update(ctx.vars); ctx.C = C; M_ = ctx.mats; r = ctx.rig
    if C.get('stand'):   # 서서(케이블): 한 발 앞으로 엇갈려 딛고 몸통을 조금 숙인다
        ctx.th = C.get('lean', 8.0); R_ = Rx(ctx.th); off = R_@r.HIP_OFF; Lg = (r.L_T+r.L_S)*0.975; ctx.P = V((0, r.ANK_Y-off.y, r.ANK_Z+sqrt0(Lg**2-0.22**2)-off.z))
    else: seat_setup(ctx, back=True, th=-6.0 if not C['shoulder'] else -4.0)
    ld = C['load']; ctx.sy = 0.45 if not C.get('stand') else r.ANK_Y+0.55
    if ld == 'machine':
        ctx.HD = {s: mk_handle(ctx, "hdl_"+s) for s, _ in SIDES}; ctx.LV = {s: mk_lever(ctx, "lever_"+s, 0.026) for s, _ in SIDES}
    if ld == 'cable':
        ctx.HD = {s: mk_handle(ctx, "hdl_"+s) for s, _ in SIDES}; ctx.W = {s: wire(ctx) for s, _ in SIDES}
        for sg in (-1, 1): box("stack", (0.12, 0.12, 2.0), (sg*0.72, ctx.sy, 1.0), M_.FRAME)
    if ld == 'band': ctx.HD = {s: mk_handle(ctx, "hdl_"+s) for s, _ in SIDES}; ctx.BD = {s: wire(ctx, "sl_band_"+s) for s, _ in SIDES}
def mpress(r, t, ctx):
    C = ctx.C; u = timing(t); ld = C['load']; sh = C['shoulder']
    R_ = seat_torso(r, ctx, scap=(lerp(0.0, 1.5, u) if sh else 0.0, lerp(-1.5, 2.0, u) if not sh else 0.0)); load = []
    if C.get('stand'): r.leg_ik('l', V((0.12, r.ANK_Y-0.22, r.ANK_Z)), V((0.1, -1, 0.1)), Rz(6)@V((0, -1, 0)), 6.0); r.leg_ik('r', V((-0.12, r.ANK_Y+0.22, r.ANK_Z)), V((-0.1, -1, 0)), Rz(-6)@V((0, -1, 0)), -6.0)
    else: seat_feet(r, ctx)
    for s, sg in SIDES:
        if C['one'] and s == 'l':   # 쉬는 손은 허벅지 위, 왼 손잡이는 시작 자리에 그대로
            seat_hands_thigh(r, 'l', 1); S = r.chain_head('upperarm_l'); Ws = S+V((C['gx0'], -0.10, -0.08)); Pv = (Ws+S+V((0, -0.5, 0)))/2+V((0, 0.0, 0.75)); ctx.HD['l'].location = Ws+V((0, -0.08, 0)); rot_to(ctx.HD['l'], V((0, 0, 1))); lever(ctx.LV['l'], Ws+V((0.08, -0.08, 0)), Pv+V((0.08, 0, 0))); continue
        S = r.chain_head('upperarm_'+s); reach = (r.L_U+r.L_F)*0.95
        if sh:   # 숄더 프레스: 어깨 옆 → 머리 위(덤벨 프레스 경로와 같다)
            F = V((0, 0.0, 1)); lat = None; Ws = S+V((sg*0.20, -0.07, 0.10)); We = S+V((-sg*0.03, -0.04, 0.0)); We.z = S.z+sqrt0(reach**2-0.03**2-0.04**2)
            pole = V((sg*0.9, -0.2, -0.5)); Pv = V((sg*0.10, S.y+0.55, S.z+0.10))
        else:
            a = math.radians(C['dir']); dvec = V((0, -math.cos(a), math.sin(a))); F = dvec.copy(); lat = V((0, 0, 1)) if C.get('neutral', True) else None
            Ws = S+V((sg*C['gx0'], -0.10, -0.08))+V((0, 0, 0.10*math.sin(a))); We = S+(dvec+V((-sg*0.12, 0, 0))).normalized()*reach; We.x = sg*C['gx1']+0.0
            d_ = We-S; We = S+d_.normalized()*min(d_.length, reach)
            pole = V((sg*0.9, 0.35, -0.55)); Pv = (Ws+We)/2+V((0, 0.0, 0.75))
        W = Ws.lerp(We, u) if ld != 'machine' else arc(Ws, We, Pv, u)
        G = grip_w(r, s, W, F, lat); r.arm(s, G, F, pole, lat, 0.9995); r.fingers(s)
        if ld in ('machine', 'cable', 'band'):
            ax_ = lat if lat is not None else V((1, 0, 0)); ctx.HD[s].location = G; rot_to(ctx.HD[s], ax_)
        if ld == 'machine': lever(ctx.LV[s], G+V((sg*0.08, 0, 0)), Pv+V((sg*0.08, 0, 0)))
        if ld == 'cable': wire_to(ctx.W[s], G+V((sg*0.05, 0, 0)), V((sg*0.66, ctx.sy-0.05, S.z)))
        if ld == 'band': wire_to(ctx.BD[s], G+V((sg*0.05, 0, 0)), V((sg*0.26, ctx.P.y+0.30, S.z-0.06)))
    return dict(bar=None, load=load, fixed=['pelvis', 'foot_l', 'foot_r'])


def chest_pad(ctx, th, dy=0.0, dz=0.0, size=(0.34, 0.08, 0.40)):
    """가슴 앞 패드(앉아서 마주 보는 머신). 가슴 앞면에서 판 두께 절반만큼 앞. vars pad_dy·pad_dz·pad_h 로 덮어쓴다."""
    C = getattr(ctx, "C", {}) or {}; dy = C.get("pad_dy", dy); dz = C.get("pad_dz", dz); size = (size[0], size[1], C.get("pad_h", size[2])); local_pts(ctx); R_ = Rx(th); Lc = ctx.L_CHEST+V((0, 0.075-size[1]/2-0.004+dy, 0.04+dz)); c = W_(ctx.P, R_, ctx, Lc)
    b = box("cpad", size, tuple(c), ctx.mats.PAD, 0.03); b.rotation_euler = (math.radians(th), 0, 0); box("cstem", (0.08, 0.08, c.z), (0, c.y-0.10, c.z/2), ctx.mats.FRAME); return c

# ════ 펙덱·리버스 펙덱·앉아 케이블 플라이 ════
# mode pec(앞으로 모은다)·rev(앞 → 옆으로 벌린다, 가슴 패드), load machine·cable
PD = dict(mode='pec', load='machine')
def pd_setup(ctx):
    C = dict(PD); C.update(ctx.vars); ctx.C = C; M_ = ctx.mats; r = ctx.rig
    if C['mode'] == 'rev':
        seat_setup(ctx, back=False, th=4.0); chest_pad(ctx, 4.0)
    else: seat_setup(ctx, back=True, th=-6.0)
    ctx.HD = {s: mk_handle(ctx, "hdl_"+s, 0.15) for s, _ in SIDES}
    if C['load'] == 'machine': ctx.LV = {s: mk_lever(ctx, "lever_"+s) for s, _ in SIDES}; box("tower", (0.12, 0.12, 2.0), (0, 0.42 if C['mode'] != 'rev' else -0.62, 1.0), M_.FRAME)
    else:
        ctx.W = {s: wire(ctx) for s, _ in SIDES}
        for sg in (-1, 1): box("stack", (0.12, 0.12, 2.0), (sg*1.10, 0.20, 1.0), M_.FRAME)
def pec_deck(r, t, ctx):
    C = ctx.C; u = timing(t); rev = C['mode'] == 'rev'
    R_ = seat_torso(r, ctx, scap=(0.0, lerp(-1.0, 1.5, u) if not rev else lerp(1.5, -1.5, u))); seat_feet(r, ctx, ax=0.22 if rev else 0.20)
    a = math.radians(lerp(80, 8, u) if not rev else lerp(8, 88, u)); bend = 14.0 if not rev else 10.0
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s); d = V((sg*math.sin(a), -math.cos(a), -0.06)).normalized(); E = S+d*r.L_U; b = a-math.radians(bend); d2 = V((sg*math.sin(b), -math.cos(b), -0.04)).normalized()
        lat = V((0, 0, 1)); G = jointed(r, s, E, E+d2*r.L_F, d2, lat, V((sg*math.cos(a)*0.3, 0.3, -1))); r.fingers(s, 0.8); ctx.HD[s].location = G; rot_to(ctx.HD[s], V((0, 0, 1)))
        if C['load'] == 'machine': lever(ctx.LV[s], G+V((0, 0, 0.09)), V((sg*0.20, S.y+0.02, S.z+0.40)))
        else: wire_to(ctx.W[s], G+V((sg*0.03, 0, 0)), V((sg*1.04, 0.20, S.z)))
    return dict(bar=None, load=[], fixed=['pelvis', 'foot_l', 'foot_r'])

# ════ 앉아 당기기(하이 로우·로우 로우·가슴 지지 로우 머신) ════
# mode high(앞 위에서 어깨 아래로)·low(앞 아래에서 허리로)·chest(가슴 패드에 기대 정면에서), load machine·cable
MR = dict(mode='chest', load='machine')
def mr_setup(ctx):
    C = dict(MR); C.update(ctx.vars); ctx.C = C; M_ = ctx.mats; r = ctx.rig; m = C['mode']
    th = {'high': 2.0, 'low': 8.0, 'chest': 10.0}[m]; seat_setup(ctx, back=False, th=th)
    if m in ('low', 'chest'): chest_pad(ctx, th, dz=-0.10, size=(0.30, 0.08, 0.20))   # 가슴 아래(배)는 앞으로 덜 나와 판이 낮으면 배를 뚫는다 — m2 변수 탐색
    if m == 'high':   # 허벅지 누름 패드
        H = r.head0('thigh_l'); box("kpad", (0.42, 0.10, 0.09), (0, -0.32, ctx.hip+0.17), M_.PAD, 0.03); box("kstem", (0.07, 0.07, ctx.hip+0.13), (0, -0.62, (ctx.hip+0.13)/2), M_.FRAME); box("kx", (0.07, 0.30, 0.05), (0, -0.47, ctx.hip+0.17), M_.FRAME)
    ctx.HD = {s: mk_handle(ctx, "hdl_"+s) for s, _ in SIDES}
    if C['load'] == 'machine': ctx.LV = {s: mk_lever(ctx, "lever_"+s, 0.026) for s, _ in SIDES}
    else: ctx.W = {s: wire(ctx) for s, _ in SIDES}; box("tower", (0.14, 0.14, 2.4), (0, -1.25, 1.2), M_.FRAME)
def mrow(r, t, ctx):
    C = ctx.C; u = timing(t); m = C['mode']
    R_ = seat_torso(r, ctx, scap=(lerp(1.5, -1.0, u) if m == 'high' else 0.0, lerp(2.0, -2.5, u))); seat_feet(r, ctx, ax=0.22)
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s); reach = (r.L_U+r.L_F)*0.95
        a = math.radians({'high': 38.0, 'low': -22.0, 'chest': -4.0}[m]); ds = V((sg*0.10, -math.cos(a), math.sin(a))).normalized(); Ws = S+ds*reach
        We = S+{'high': V((sg*0.16, -0.10, -0.12)), 'low': V((sg*0.17, -0.05, -0.30)), 'chest': V((sg*0.16, -0.08, -0.17))}[m]
        F = (Ws-S).normalized().lerp(V((0, -1, 0.0)), sstep(0.2, 1.0, u)).normalized(); lat = V((0, 0, 1)) if m != 'high' else V((-sg*0.2, 0, 1)).normalized()
        if C['load'] == 'machine': Pv = (Ws+We)/2+V((0, 0, 0.75 if m != 'low' else -0.75)); W = arc(Ws, We, Pv, u)
        else: W = Ws.lerp(We, u)
        pole = V((sg*0.45, 0.6, -1.0)) if m != 'high' else V((sg*0.7, 0.4, -1.0))
        G = grip_w(r, s, W, F, lat); r.arm(s, G, F, pole, lat, 0.9995); r.fingers(s); ctx.HD[s].location = G; rot_to(ctx.HD[s], lat)
        if C['load'] == 'machine': lever(ctx.LV[s], G+V((sg*0.08, 0, 0)), Pv+V((sg*0.08, 0, 0)))
        else: wire_to(ctx.W[s], G, V((sg*0.06, -1.15, 2.30)))
    return dict(bar=None, load=[], fixed=['pelvis', 'foot_l', 'foot_r'])

# ════ 머신 사이드 레이즈: 가슴 패드를 마주 보고 앉아 팔꿈치 패드를 옆으로 든다 ════
def lr_setup(ctx):
    ctx.C = dict(ctx.vars); M_ = ctx.mats; seat_setup(ctx, back=False, th=4.0); chest_pad(ctx, 4.0, dz=0.08, size=(0.24, 0.08, 0.16))   # 앞으로 내민 아래팔 위, 가슴 위쪽에만
    ctx.RL = {s: cyl("roll_"+s, 0.04, 0.16, M_.PAD, axis='Y', verts=32) for s, _ in SIDES}; ctx.LV = {s: mk_lever(ctx, "lever_"+s) for s, _ in SIDES}; ctx.LX = {s: mk_lever(ctx, "lx_"+s, 0.018) for s, _ in SIDES}
    ctx.HD = {s: mk_handle(ctx, "hdl_"+s, 0.12) for s, _ in SIDES}
def lat_machine(r, t, ctx):
    u = timing(t); R_ = seat_torso(r, ctx, scap=(lerp(0.0, 1.5, u), 0.0)); seat_feet(r, ctx, ax=0.22)
    a = math.radians(lerp(14.0, 86.0, u)); sp = math.radians(20.0)
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s); d = V((sg*math.sin(a)*math.cos(sp), -math.sin(a)*math.sin(sp), -math.cos(a))).normalized(); E = S+d*r.L_U
        d2 = V((0, -1, 0)); d2 = (d2-d*d2.dot(d)).normalized(); d2 = (d2+V((0, 0, 0.15))).normalized(); G = jointed(r, s, E, E+d2*r.L_F, d2, V((0, 0, 1)), None)   # pole 없음 = 정한 팔꿈치 쪽
        r.fingers(s, 0.6); ctx.HD[s].location = G; rot_to(ctx.HD[s], V((0, 0, 1)))
        nout = V((sg*math.cos(a), 0, math.sin(a))); rl = E-d*0.05+nout*ctx.C.get('roll_off', 0.10)+V((0, -0.02, 0)); ctx.RL[s].location = rl
        ax_y = S.y-0.42; fr = V((rl.x, ax_y, rl.z)); lever(ctx.LV[s], fr, V((S.x, ax_y, S.z))); lever(ctx.LX[s], fr, rl+V((0, -0.08, 0)))   # 축은 어깨와 같은 선(앞뒤 방향)에 있다
    return dict(bar=None, load=[], fixed=['pelvis', 'foot_l', 'foot_r'])

# ════ 삼두 머신: 팔 받침(arm)·머리 위(over) ════
TX = dict(mode='arm')
def tx_setup(ctx):
    C = dict(TX); C.update(ctx.vars); ctx.C = C; M_ = ctx.mats; r = ctx.rig
    if C['mode'] == 'arm':
        seat_setup(ctx, back=False, th=10.0); R_ = Rx(10.0); S = W_(ctx.P, R_, ctx, r.head0('upperarm_l')); tl = C.get('arm_tilt', 25.0); ctx.du = V((0, -math.cos(math.radians(tl)), -math.sin(math.radians(tl)))); up = V((0, -math.sin(math.radians(tl)), math.cos(math.radians(tl)))); ctx.up = up   # 위팔은 앞으로 tl도 아래 — 패드가 배가 아니라 팔 밑에 오게
        c = V((0, S.y, S.z))+ctx.du*r.L_U*C.get('apad_k', 0.75)-up*C.get('apad_off', 0.12); ex = r.head0('upperarm_l').x-r.head0('pelvis').x
        for sg in (-1, 1):   # 팔마다 따로 놓인 위팔 패드 — 가슴 앞은 비워 둔다
            ca = c+V((sg*(abs(ex)+r.L_U*C.get('apad_k', 0.75)*0.10), 0, 0)); b = box("apad", (C.get('apad_w', 0.13), C.get('apad_len', 0.20), 0.06), tuple(ca), M_.PAD, 0.025); b.rotation_euler = (math.radians(tl), 0, 0)
        box("abar", (abs(ex)*2+0.20, 0.05, 0.05), tuple(c+ctx.du*(C.get('apad_len', 0.20)/2+0.03)-up*0.02), M_.FRAME); box("astem", (0.08, 0.08, c.z-0.10), (0, c.y-0.30, (c.z-0.10)/2), M_.FRAME); box("ax", (0.08, 0.26, 0.05), (0, c.y-0.17, c.z-0.12), M_.FRAME)
    else: seat_setup(ctx, back=True, th=-4.0)
    ctx.HD = {s: mk_handle(ctx, "hdl_"+s, 0.12) for s, _ in SIDES}; ctx.LV = {s: mk_lever(ctx, "lever_"+s) for s, _ in SIDES}
def tri_machine(r, t, ctx):
    C = ctx.C; u = timing(t); R_ = seat_torso(r, ctx, scap=(0.0, 0.5)); seat_feet(r, ctx, ax=0.22)
    phi = math.radians(lerp(125.0, 10.0, u))   # 팔꿈치 굽힘(180-팔꿈치각)
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s)
        if C['mode'] == 'arm': d = (ctx.du+V((sg*0.10, 0, 0))).normalized(); up = ctx.up; pole = d
        else: d = V((sg*C.get('ov_dx', 0.12), C.get('ov_dy', -0.22), 1)).normalized(); up = V((-sg*C.get('ov_ux', 0.0), 1, 0.22)).normalized(); up = (up-d*up.dot(d)).normalized(); pole = None if C.get('ov_pole0', True) else V((sg*0.3, -1, 0.2))   # 기본 pole 이면 팔꿈치가 정한 E 에 그대로 남는다
        E = S+d*r.L_U; v = (d*math.cos(phi)+up*math.sin(phi)).normalized(); lat = V((-sg, 0, 0)) if C['mode'] == 'arm' else V((0, 0, 1)) if False else V((-sg, 0, 0))
        G = jointed(r, s, E, E+v*r.L_F, v, lat, pole); r.fingers(s); ctx.HD[s].location = G; rot_to(ctx.HD[s], V((1, 0, 0)))
        off = V((sg*(0.13 if C['mode'] == 'over' else 0.09), 0, 0)); lever(ctx.LV[s], G+off, E+off)   # 축은 팔꿈치와 같은 선(좌우 방향) — 레버는 아래팔과 나란히 바깥쪽
    return dict(bar=None, load=[], fixed=['pelvis', 'foot_l', 'foot_r'])

# ════ 토르소 로테이션: 골반은 좌석에 두고 가슴 패드·손잡이와 함께 몸통만 돈다 ════
def rot_setup(ctx):
    M_ = ctx.mats; seat_setup(ctx, back=False, th=0.0); local_pts(ctx)
    ctx.CP = box("cpad", (0.30, 0.08, 0.30), (0, 0, 0), M_.PAD, 0.03); ctx.HD = {s: mk_handle(ctx, "hdl_"+s, 0.12) for s, _ in SIDES}; box("col", (0.10, 0.10, 1.10), (0, -0.55, 0.55), M_.FRAME)
    ky = ctx.rig.HIP_OFF.y-ctx.rig.L_T
    for sg in (-1, 1): box("kpad", (0.12, 0.08, 0.14), (sg*0.17, ky-0.12, ctx.hip-0.17), M_.PAD, 0.03)   # 정강이 앞 고정 패드
def torso_rot(r, t, ctx):
    u = timing(t); yaw = lerp(-34.0, 34.0, u); R_ = seat_torso(r, ctx, scap=(0.0, 1.0), yaw=yaw); seat_feet(r, ctx, ax=0.17)
    Ry_ = Rz(yaw); Sc = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2; ax0 = V((0, ctx.P.y, 0))
    cp = V((0, ctx.L_CHEST.y+0.075-0.044, ctx.L_CHEST.z+0.02))-r.head0('pelvis')+ctx.P; cp = ax0+Ry_@(cp-ax0); ctx.CP.location = cp; ctx.CP.rotation_euler = (0, 0, math.radians(yaw))
    for s, sg in SIDES:
        G = Sc+Ry_@V((sg*0.17, -0.30, -0.10)); F = Ry_@V((0, -1, 0)); r.arm(s, G, F, Ry_@V((sg*0.8, 0.3, -0.5)), V((0, 0, 1)), 0.9995); r.fingers(s); ctx.HD[s].location = G; rot_to(ctx.HD[s], V((0, 0, 1)))
    return dict(bar=None, load=[], fixed=['pelvis', 'foot_l', 'foot_r'])

# ════ 엎드려 레그 컬(머신·덤벨): 몸통·허벅지는 패드 위, 정강이만 무릎 둘레로 든다 ════
LC = dict(load='machine', T=0.72, b1=105.0, pa=8.0, ax=0.11)
def lc_setup(ctx):
    C = dict(LC); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; T = C['T']; p0 = r.head0('pelvis'); nz = r.head0('neck_01').z
    fy = min(v.y for v in ctx.rest_v if abs(v.x) < 0.17 and p0.z-0.10 < v.z < nz)   # 몸 앞면(엎드리면 아래)
    ctx.P = V((0, 0.0, T+0.004-(fy-p0.y))); ctx.R = Rx(90.0)
    r.reset(); r.torso(ctx.P, ctx.R, neck=Rx(76.0), head=Rx(66.0)); H = r.chain_head('thigh_l'); S = r.chain_head('upperarm_l')
    kz = T+C.get('kz', 0.07); e = math.asin(max(-0.5, min(0.5, (H.z-kz)/r.L_T))); ctx.e = e; ky = H.y+r.L_T*math.cos(e); ctx.ky = ky
    y0, y1 = S.y-0.30, ky-C.get('pad_gap', 0.06); box("pad", (0.34, y1-y0, 0.07), (0, (y0+y1)/2, T-0.035), M_.PAD, 0.024)
    for y_ in (y0+0.10, y1-0.10): box("post", (0.08, 0.08, T-0.07), (0, y_, (T-0.07)/2), M_.FRAME); box("ft", (0.56, 0.09, 0.04), (0, y_, 0.02), M_.FRAME)
    ctx.HG = [V((sg*0.24, S.y-0.24, T-0.03)) for sg in (1, -1)]
    for g in ctx.HG: box("hdl", (0.03, 0.03, 0.14), tuple(g+V((0, 0, -0.04))), M_.STEEL)
    if C['load'] == 'machine': ctx.RL = cyl("roll", 0.045, 0.34, M_.PAD, verts=32); ctx.LV = mk_lever(ctx, "lever"); ctx.ARMB = mk_lever(ctx, "lever2")
    else: ctx.DB = {'c': dumbbell(ctx, "db_c")}
def lying_curl(r, t, ctx):
    C = ctx.C; u = timing(t); r.torso(ctx.P, ctx.R, neck=Rx(76.0), head=Rx(66.0), scap={s: (0.0, 0.5) for s, _ in SIDES})
    b = lerp(4.0, C['b1'], u); rb = math.radians(b); d2 = V((0, math.cos(rb), math.sin(rb))); nb = V((0, -math.sin(rb), math.cos(rb))); toe = V((0, math.sin(rb), -math.cos(rb))); As = {}
    for s, sg in SIDES:
        H = r.chain_head('thigh_'+s); K = V((sg*C['ax'], ctx.ky, H.z-r.L_T*math.sin(ctx.e))); K = H+(K-H).normalized()*r.L_T; A = K+d2*r.L_S; As[s] = (K, A)
        r.leg(s, K, A, toe, 0.0, 90.0+b+C['pa'])
    Kc = (As['l'][0]+As['r'][0])/2; Ac = (As['l'][1]+As['r'][1])/2
    if C['load'] == 'machine':
        rl = Ac-d2*0.07+nb*0.095; ctx.RL.location = rl; rot_to(ctx.RL, V((1, 0, 0))); piv = V((0.27, Kc.y, Kc.z)); lever(ctx.LV, rl+V((0.20, 0, 0)), piv); lever(ctx.ARMB, piv, V((0.27, Kc.y-0.05, 0.05)))
    else:
        Fv = Rx(90.0+b+C['pa'])@V((0, -1, 0)); c = Ac+d2*C.get('db_d', 0.16)+Fv*C.get('db_f', 0.05); c.x = 0.0; hold(ctx, 'c', c, V((1, 0, 0)))
    for i, (s, sg) in enumerate(SIDES):
        G = ctx.HG[i]; r.arm(s, G, V((0, 0, -1)), V((sg*1.0, 0.3, -0.15)), V((0, -1, 0)), 0.9995); r.fingers(s)
    return dict(bar=None, load=[], fixed=['pelvis', 'spine_03', 'thigh_l', 'thigh_r'])

# ════ 누워 머신 체스트 프레스: 벤치 몸 자세는 push.press 와 같고, 손잡이는 머리 쪽 축을 도는 레버 ════
from families import push as PSH
LY = dict(gx=0.25)
def ly_setup(ctx):
    v0 = ctx.vars; ctx.vars = dict(inc=0.0, var='fly', load='none'); PSH.press_setup(ctx); ctx.vars = v0
    C = dict(PSH.PR, inc=0.0, var='', floor=False); C.update(LY); C.update(v0); ctx.C = C; M_ = ctx.mats; S = ctx.S
    ctx.HD = {s: mk_handle(ctx, "hdl_"+s) for s, _ in SIDES}; ctx.LV = {s: mk_lever(ctx, "lever_"+s, 0.026) for s, _ in SIDES}
    ctx.PVz = S.z+0.62; ctx.PVy = S.y+0.78
    for sg in (-1, 1): box("post", (0.08, 0.08, ctx.PVz), (sg*(C['gx']+0.16), ctx.PVy, ctx.PVz/2), M_.FRAME); box("ft", (0.09, 0.56, 0.04), (sg*(C['gx']+0.16), ctx.PVy, 0.02), M_.FRAME)
def lying_press(r, t, ctx):
    C = ctx.C; u = timing(t); PSH.pr_torso(r, ctx.P, 0.0); S = r.chain_head('upperarm_l'); gx = C['gx']; Fu = V((0, 0.18*(1-0.3*(1-u)), 1))
    F0, _L, n0 = r.grip_frame('l', Fu, None); off = -F0*r.GRIP_F-n0*r.GRIP_N; top_y = S.y-0.015
    reach = sqrt0(((r.L_U+r.L_F)*0.985)**2-(gx-S.x+off.x)**2-(top_y+off.y-S.y)**2); top = V((0, top_y, S.z+reach-off.z)); bot = ctx.Q+ctx.Nf*(ctx.surf+C['gap'])+V((0, 0, 0.02))
    for s, sg in SIDES:
        Pv = V((sg*gx, ctx.PVy, ctx.PVz)); G = arc(top+V((sg*gx, 0, 0)), bot+V((sg*gx, 0, 0)), Pv, u)
        r.arm(s, G, Fu, V((sg*lerp(0.90, 0.72, u), -0.42, -0.62)), None, 0.9995); r.fingers(s)
        ctx.HD[s].location = G; rot_to(ctx.HD[s], V((1, 0, 0))); lever(ctx.LV[s], G+V((sg*0.08, 0, 0)), Pv+V((sg*0.08, 0, 0)))
    PSH.press_legs(r, ctx, C)
    return dict(bar=None, load=[], fixed=['foot_l', 'foot_r', 'pelvis', 'spine_03'])

# ════ 체스트 서포티드 덤벨 로우: 인클라인 벤치에 가슴을 대고 발끝은 바닥, 덤벨을 당긴다 ════
CR = dict(th=50.0, hz=0.80, fy=0.30, a1=70.0, ex=0.22)
def cr_setup(ctx):
    C = dict(CR); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; th = C['th']; R_ = Rx(th); ctx.R = R_; off = R_@r.HIP_OFF
    ctx.P = V((0, 0.0, C['hz']-off.z)); r.reset(); r.torso(ctx.P, R_, neck=Rx(th*0.55), head=Rx(th*0.35)); vs = PSH._mesh(ctx); Nf = R_@V((0, -1, 0)); up = R_@V((0, 0, 1))
    Hc = ctx.P+off; Hc.x = 0.0; Sz = (r.chain_head('upperarm_l')-Hc).dot(up)
    fr = [v for i, v in enumerate(vs) if abs(ctx.rest_v[i].x) < 0.13 and 0.02 < (v-Hc).dot(up) < Sz-0.05 and sum(w for k, w in ctx.weights[i].items() if k.startswith(('spine', 'pelvis'))) > 0.5]
    dmax = max((v-Hc).dot(Nf) for v in fr)+0.004; L0, L1 = C.get('L0', 0.14), Sz-0.02; c = Hc+Nf*(dmax+0.035)+up*((L0+L1)/2)
    b = box("pad", (0.26, 0.07, L1-L0+0.06), tuple(c), M_.PAD, 0.024); b.rotation_euler = (math.radians(th), 0, 0)
    lo = Hc+Nf*(dmax+0.07)+up*L0; box("stem", (0.08, 0.08, max(0.2, lo.z-0.02)), (0, lo.y, max(0.2, lo.z-0.02)/2), M_.FRAME); box("ft", (0.56, 0.09, 0.04), (0, lo.y, 0.02), M_.FRAME)
    ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
def cs_row(r, t, ctx):
    C = ctx.C; u = timing(t); th = C['th']; r.torso(ctx.P, ctx.R, neck=Rx(th*0.55), head=Rx(th*0.35), scap={s: (lerp(-1.0, 0.0, u), lerp(3.0, -3.0, u)) for s, _ in SIDES}); load = []
    for s, sg in SIDES:
        H = r.chain_head('thigh_'+s); r.leg_ik(s, V((sg*0.13, H.y+C['fy'], r.ANK_Z)), V((sg*0.15, -1, 0.1)), Rz(sg*6)@V((0, -1, 0)), sg*6.0)
        S = r.chain_head('upperarm_'+s); a = math.radians(lerp(4.0, C['a1'], u)); d = V((sg*(C['ex']+0.06*u), math.sin(a), -math.cos(a))).normalized()
        fa = V((sg*(C['ex']-0.04+0.06*u), lerp(math.sin(a), 0.06, sstep(0.0, 0.625, u)), -1)).normalized(); E = S+d*r.L_U
        G = jointed(r, s, E, E+fa*r.L_F, V((0, 0, -1)), V((0, -1, 0)), V((sg*0.2, 1, 0))); r.fingers(s); hold(ctx, s, G, V((0, 1, 0))); load.append((G, DB_KG))
    return dict(bar=None, load=load, fixed=['foot_l', 'foot_r', 'pelvis'])

# ════ 썰매 스쿼트(핵·리버스 핵·V 스쿼트·펜듈럼): 발은 발판에 고정, 고관절은 레일(직선) 또는 축 둘레 호를 따라 움직이고 몸통 각은 패드가 정한다 ════
# th 몸통 기울기, rail 레일 방향(수직에서 + 뒤로), c 레일이 발목에서 비켜난 거리, kb 바닥 무릎각, zp 발판 높이, pad back·chest
SL = dict(mode='hack', th=-35.0, rail=-35.0, c=-0.10, kb=82.0, zp=0.14, ax=0.17, toe=12.0, pad='back', top=0.972)
def sl_local(ctx):
    r = ctx.rig; p0 = r.head0('pelvis'); nz = r.head0('neck_01').z; S0 = r.head0('upperarm_l')
    ctx.LB = max(v.y for v in ctx.rest_v if abs(v.x) < 0.14 and p0.z+0.02 < v.z < nz)-p0.y
    ctx.LF = min(v.y for v in ctx.rest_v if abs(v.x) < 0.14 and p0.z+0.05 < v.z < S0.z-0.04)-p0.y
    ctx.LS = max(v.z for v in ctx.rest_v if 0.08 < abs(v.x) < 0.18 and abs(v.y-S0.y) < 0.06 and v.z > S0.z-0.05)-p0.z
    ctx.Lmid = ((p0.z+0.05+nz)/2)-p0.z; ctx.Llen = nz-p0.z-0.08; ctx.LSy = S0.y-p0.y; ctx.LCz = S0.z-p0.z-0.17   # 가슴 패드(리버스): 가슴만 — 깊이 앉으면 허벅지가 배 앞까지 온다
def sl_setup(ctx):
    C = dict(SL); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; sl_local(ctx); local_pts(ctx)
    ctx.A = V((C['ax'], 0.0, C['zp']+r.ANK_Z)); w = math.radians(C['rail']); ctx.w = V((0, math.sin(w), -math.cos(w))); ctx.n = V((0, -ctx.w.z, ctx.w.y))
    box("plat", (0.80, 0.52, 0.05), (0, ctx.A.y-0.05, C['zp']-0.025), M_.FRAME); box("platb", (0.60, 0.40, max(0.04, C['zp']-0.05)), (0, ctx.A.y-0.05, max(0.04, C['zp']-0.05)/2), M_.FRAME)
    ctx.PD = box("bpad", (0.40, 0.07, ctx.Llen if C['pad'] == 'back' else 0.30), (0, 0, 0), M_.PAD, 0.024); ctx.SP = [box("spad", (0.11, 0.16, 0.06), (0, 0, 0), M_.PAD, 0.025) for _ in range(2)]
    ctx.HDL = [mk_handle(ctx, "hdl", 0.12) for _ in range(2)]; ctx.CAR = box("carr", (0.30, 0.06, 0.40 if C['pad'] == 'back' else 0.20), (0, 0, 0), M_.FRAME)
    if C['mode'] == 'pend':
        ctx.Pv = V((0, ctx.A.y+C.get('pv_y', 1.10), ctx.A.z+C.get('pv_z', 0.80))); box("pvp", (0.10, 0.10, ctx.Pv.z), (0, ctx.Pv.y+0.05, ctx.Pv.z/2), M_.FRAME); ctx.ARMS = mk_lever(ctx, "lever", 0.035)
    else:
        r.reset(); P, R, _ = sl_pose(r, 0.0, ctx); q0 = sl_pad_c(r, ctx, P, R); P1, R1, _ = sl_pose(r, 1.0, ctx); q1 = sl_pad_c(r, ctx, P1, R1); sd = 1 if C['pad'] == 'back' else -1
        nb = R@V((0, sd*1.0, 0)); mid = (q0+q1)/2+nb*0.13+(R@V((0, 0, 1)))*(0.0 if sd > 0 else 0.25); L_ = (q1-q0).length+C.get('rail_ext', 0.6 if sd > 0 else 0.3); o = box("rail", (0.30, 0.06, L_), tuple(mid+nb*0.0), M_.FRAME); dv = (q0-q1).normalized(); o.rotation_euler = (math.atan2(-dv.y, dv.z), 0, 0)
        lo = mid-dv*(L_/2); box("rleg", (0.10, 0.10, max(0.1, lo.z)), (0, lo.y, max(0.1, lo.z)/2), M_.FRAME)
def sl_dist(r, C, u):
    kb = math.radians(C['kb']); D0 = (r.L_T+r.L_S)*C['top']; D1 = math.sqrt(r.L_T**2+r.L_S**2-2*r.L_T*r.L_S*math.cos(kb)); return lerp(D0, D1, u)
def sl_pose(r, u, ctx):
    C = ctx.C; D = sl_dist(r, C, u); dx = r.HIP_OFF.x-ctx.A.x; Dyz = sqrt0(D**2-dx**2); Ayz = V((0, ctx.A.y, ctx.A.z))
    if C['mode'] == 'pend':
        H0 = Ayz+V((0, C.get('h0y', 0.26), 0)); H0.z = Ayz.z+sqrt0(((r.L_T+r.L_S)*C['top'])**2-dx**2-C.get('h0y', 0.26)**2)
        def at(ph): return ctx.Pv+Rx(ph)@(H0-ctx.Pv)
        lo, hi = 0.0, C.get('ph_max', 70.0); sgn = C.get('ph_sgn', 1.0)
        for _ in range(40):
            m = (lo+hi)/2
            if (at(sgn*m)-Ayz).length > Dyz: lo = m
            else: hi = m
        ph = sgn*(lo+hi)/2; Hc = at(ph); th = C['th']+ph*C.get('ph_k', 1.0)
    else:
        c = C['c']; s_ = -sqrt0(Dyz**2-c**2); Hc = Ayz+ctx.n*c+ctx.w*s_; th = C['th']; ph = 0.0
    R = Rx(th); off = R@r.HIP_OFF; P = V((0, Hc.y-off.y, Hc.z-off.z)); return P, R, ph
def sl_pad_c(r, ctx, P, R):
    p0 = r.head0('pelvis'); g = ctx.C.get('pad_g', 0.004 if ctx.C['pad'] == 'back' else 0.014); y = (ctx.LB+0.035+g) if ctx.C['pad'] == 'back' else (ctx.LF-0.035-g); return P+R@V((0, y, ctx.Lmid if ctx.C['pad'] == 'back' else ctx.LCz))
def sled(r, t, ctx):
    C = ctx.C; u = timing(t); P, R, ph = sl_pose(r, u, ctx); th = math.degrees(math.atan2(-(R@V((0, 0, 1))).y, (R@V((0, 0, 1))).z))
    r.torso(P, R, neck=Rx(th*0.5), head=Rx(th*0.3), scap={s: (1.0, 0.0) for s, _ in SIDES})
    for s, sg in SIDES:
        A = V((sg*ctx.A.x, ctx.A.y, ctx.A.z)); r.leg_ik(s, A, V((sg*0.30, -1, 0.1)), Rz(sg*C['toe'])@V((0, -1, 0)), sg*C['toe'])
    q = sl_pad_c(r, ctx, P, R); ctx.PD.location = q; ctx.PD.rotation_euler = (math.radians(th), 0, 0)
    sd = 1 if C['pad'] == 'back' else -1; ctx.CAR.location = q+R@V((0, sd*0.07, 0.0 if sd > 0 else 0.06)); ctx.CAR.rotation_euler = (math.radians(th), 0, 0)
    for i, (s, sg) in enumerate(SIDES):
        sp = P+R@V((sg*0.135, ctx.LSy, ctx.LS+0.034)); ctx.SP[i].location = sp; ctx.SP[i].rotation_euler = (math.radians(th), 0, 0)
        S = r.chain_head('upperarm_'+s); W = S+R@V((sg*C.get('hx', 0.13), -0.08, 0.10)); F = R@V((0, 0, 1)); G = grip_w(r, s, W, F, None); r.arm(s, G, F, R@V((sg*0.9, -0.2, -0.5)), None, 0.9995); r.fingers(s)
        ctx.HDL[i].location = G; rot_to(ctx.HDL[i], R@V((0, -1, 0)))
    if C['mode'] == 'pend': lever(ctx.ARMS, q+R@V((0, 0.07, 0)), ctx.Pv)
    return dict(bar=None, load=[], fixed=['foot_l', 'foot_r'])

# ════ 바벨 핵 스쿼트: 바를 다리 뒤로 늘어뜨려 쥐고 앉았다 일어선다 ════
from families.squat_lunge import sq_frame, SQD
BH = dict(ty=0.03, a1=30.0, toe=12.0, ax=0.17, gx=0.25, by=0.05)
def bh_setup(ctx):
    C = dict(SQD); C.update(BH); C.update(ctx.vars); ctx.C = C; local_pts(ctx); C['ref'] = ctx.L_SH; ctx.BAR = barbell(ctx.col, ctx.mats); ctx.rig.reset()
def bar_hack(r, t, ctx):
    C = ctx.C; u = timing(t); P, R, th, fixed = sq_frame(r, u, ctx, C); Sl, Sr = r.chain_head('upperarm_l'), r.chain_head('upperarm_r'); Sc = (Sl+Sr)/2; gx = C['gx']
    F = V((0, 0.0, -1)); L_ = (r.L_U+r.L_F)*0.975+r.GRIP_F; bz = Sc.z-sqrt0(L_**2-(gx-Sl.x)**2-C['by']**2); bar = V((0, Sc.y+C['by'], bz)); ctx.BAR.location = bar
    for s, sg in SIDES: r.arm(s, bar+V((sg*gx, 0, 0)), F, V((sg*0.6, 1.0, 0.0)), V((-sg*0.0, -1, 0)) if False else None, 0.9995); r.fingers(s)
    return dict(bar=bar, load=[(bar, BAR_KG)], fixed=fixed)

# ════ 레그 프레스(앉아 수평·45도 카프): 등·골반은 등판, 발판이 레일을 따라 움직인다 ════
LP = dict(ang=0.0, th=-38.0, hip_z=0.56, ax=0.13, d0=0.84, d1=0.52, off=0.08, calf=False, p0=-2.0, p1=22.0)
def lp_setup(ctx):
    C = dict(LP); C.update(ctx.vars); ctx.C = C; M_ = ctx.mats; r = ctx.rig; th = C['th']; ctx.Rt = Rx(th); off = ctx.Rt@r.HIP_OFF; ctx.P = V((0, 0.42, C['hip_z']-off.z)); a = math.radians(C['ang']); ctx.d = V((0, -math.cos(a), math.sin(a))); ctx.u_ = V((0, math.sin(a), math.cos(a)))
    n = ctx.Rt@V((0, 1, 0)); up_ = ctx.Rt@V((0, 0, 1)); c = ctx.P+n*0.155+up_*0.30; b = box("back", (0.44, 0.08, 0.72), tuple(c), M_.PAD, 0.024); b.rotation_euler = (math.radians(th), 0, 0)
    box("seat", (0.44, 0.44, 0.08), (0, ctx.P.y+0.13, C['hip_z']-0.165), M_.PAD, 0.024); box("seatb", (0.20, 0.46, C['hip_z']-0.205), (0, ctx.P.y+0.16, (C['hip_z']-0.205)/2), M_.FRAME)
    Hc = ctx.P+off; Hc.x = 0; ctx.Hc = Hc; mid = Hc+ctx.d*0.62-ctx.u_*0.14; o = box("rail", (0.34, 1.75, 0.06), tuple(mid), M_.FRAME); o.rotation_euler = (-a, 0, 0); box("ped", (0.16, 0.16, max(0.2, mid.z)), (0, mid.y, max(0.2, mid.z)/2), M_.FRAME)
    [box("hdl", (0.10, 0.03, 0.03), (sg*0.36, ctx.P.y+0.02, C['hip_z']-0.02), M_.STEEL) for sg in (-1, 1)]; ctx.PLT = box("plate", (0.70, 0.05, 0.56), (0, 0, 0), M_.FRAME); ctx.PLT.rotation_euler = (-a, 0, 0)
def lpress(r, t, ctx):
    C = ctx.C; u = timing(t); th = C['th']; r.torso(ctx.P, ctx.Rt, Rx(th-2), Rx(th-3), Rx(th-3), Rx(th+8), Rx(th+16)); a = C['ang']; pf = -(90+a)
    base = V((0, ctx.Hc.y, ctx.Hc.z)); dist = C['d0'] if C['calf'] else lerp(C['d0'], C['d1'], u); pd = dist+0.10
    for s, sg in SIDES:
        A = V((sg*C['ax'], 0, 0))+base+ctx.d*dist+ctx.u_*C['off']
        if C['calf']:   # 무릎은 거의 편 채 발목만: 앞꿈치가 판을 민다
            p = lerp(C['p0'], C['p1'], u); fv = r.head0('ball_'+s)-r.head0('foot_'+s); b0 = (Rx(pf)@fv).dot(ctx.d); b1 = (Rx(pf+p)@fv).dot(ctx.d); pd = dist+0.10+max(0.0, b1-b0)+C.get('pgap', 0.022)
            r.leg_ik(s, A, V((sg*0.22, 0, 0))+ctx.u_, ctx.u_, 0.0, pf+p)
        else: r.leg_ik(s, A, V((sg*0.22, 0, 0))+ctx.u_, ctx.u_, 0.0, pf)
        G = V((sg*0.36, ctx.P.y+0.02, C['hip_z']-0.02)); F = ctx.d*0.7+V((0, 0, -0.5)); r.arm(s, G, F, V((sg*0.9, 0.3, 0.2)), None, 0.9995); r.fingers(s)
    ctx.PLT.location = base+ctx.d*pd+ctx.u_*(C['off']-0.10)
    return dict(bar=None, load=[], fixed=['pelvis', 'spine_03'])

SOLVERS = {'leg_ext': (le_setup, leg_ext), 'abduct': (ab_setup, abduct), 'mpress': (mp_setup, mpress), 'pec_deck': (pd_setup, pec_deck), 'mrow': (mr_setup, mrow), 'lat_machine': (lr_setup, lat_machine), 'tri_machine': (tx_setup, tri_machine), 'torso_rot': (rot_setup, torso_rot),
           'lying_curl': (lc_setup, lying_curl), 'lying_press': (ly_setup, lying_press), 'cs_row': (cr_setup, cs_row), 'sled': (sl_setup, sled), 'bar_hack': (bh_setup, bar_hack), 'lpress': (lp_setup, lpress)}
