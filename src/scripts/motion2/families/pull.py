# SPDX-License-Identifier: GPL-3.0-or-later
"""당기기 묶음 계산식(SPEC-040 Phase 7·8): 숙여 당기기(로우)·가슴 대고 로우·앉아 당기기·업라이트 로우·하이 풀·턱걸이·랫풀다운·풀오버·인버티드 로우·레니게이드.
좌표: X 왼쪽+, -Y 앞, Z 위. Rx(+)=앞으로 숙임, Rx(-90)=누움(머리 +Y), Rx(+90)=엎드림(머리 -Y). t 0=시작(팔 편 자세), 1=당긴 자세.
동작 근거는 실제 수행 관찰 메모(저장소 밖)다."""
import math
from mathutils import Vector as V, Matrix
from rig import Rx, Ry, Rz, lerp, sstep, sqrt0
from scene import PLATE_R, barbell, box, cyl
from families.reps import (lie_setup, lie_torso, lie_legs, SIDES, BAR_KG, DB_KG, timing, dumbbell, hold, rot_to, wire, wire_to, grip_w, jointed, hang, stand_P, plant)
from families.squat_lunge import kettlebell, place_obj, local_pts, W_, KB_KG
from families.hinge import keys, stand_frame

def front_pt(ctx, z, x=0.0, dy=0.0):
    """차렷 뼈대 공간에서 높이 z 의 몸 앞면 점(배·가슴). dy 만큼 더 앞(-)으로."""
    vs = [p for p in ctx.rest_v if abs(p.x-x) < 0.07 and abs(p.z-z) < 0.02]
    return V((x, min(p.y for p in vs)+dy, z))
def side_pt(ctx, z, dx=0.0):
    """높이 z 의 몸 옆면(왼쪽 +X) 점."""
    vs = [p for p in ctx.rest_v if p.x > 0 and abs(p.z-z) < 0.02 and abs(p.y-ctx.rig.head0('pelvis').y) < 0.08]
    return V((max(p.x for p in vs)+dx, ctx.rig.head0('pelvis').y, z))
def arc(a, b, u, bulge):
    """a→b 직선에 bulge(벡터) 만큼 휘는 호."""
    return a.lerp(b, u)+bulge*math.sin(math.pi*u)

# ════ 숙여 당기기(바벨·스미스·덤벨·케틀벨·밴드·케이블·펜들레이·T바·고릴라·메도우즈) ════
# 다리·몸통은 고정된 엉덩이 접기(al 정강이, ph 허벅지, th 몸통), 팔만 매달린 자세 → 배꼽 위(바)·허리 옆(덤벨)으로 당긴다.
RW = dict(ax=0.15, toe=8.0, al=12.0, ph=40.0, th=52.0, load='bar', grip=0.25, zc=0.98, reach=0.985, scap0=(0.0, 2.5), scap1=(-1.0, -3.0), elb=0.35)
def row_setup(ctx):
    C = dict(RW); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; local_pts(ctx); ld = C['load']
    if ld in ('bar', 'smith', 'cable', 'pendlay'): ctx.BAR = barbell(ctx.col, M_)
    if ld == 'smith':
        ctx.RAILS = [box("rail", (0.05, 0.05, 2.10), (sg*0.62, 0.0, 1.05), M_.FRAME) for sg in (-1, 1)]   # y 는 바를 따라 매 프레임(자세가 고정이라 실제로는 한 값)
    if ld == 'db2': ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
    if ld in ('kb2', 'gorilla'): ctx.KB = {s: kettlebell(ctx, "kb_"+s) for s, _ in SIDES}
    if ld == 'band': ctx.BD = {s: wire(ctx, "band") for s, _ in SIDES}
    if ld == 'cable':
        ctx.PUL = V((0, r.ANK_Y-0.95, 0.12)); ctx.W = wire(ctx); box("stack", (0.30, 0.20, 1.90), (0, r.ANK_Y-1.07, 0.95), M_.FRAME)
    if ld in ('tbar', 'meadows'):
        ctx.LM = cyl("lm", 0.025, 1.0, M_.STEEL, axis='Z', verts=24); ctx.LMP = cyl("lmp", PLATE_R, 0.05, M_.RUBBER, verts=64)
        if ld == 'tbar': ctx.VH = cyl("vh", 0.016, 0.14, M_.STEEL, axis='Y', verts=24)
def row_pose(r, ctx, C, u):
    sc = tuple(lerp(a, b, u) for a, b in zip(C['scap0'], C['scap1']))
    if C['load'] in ('pendlay', 'gorilla') and not hasattr(ctx, 'PY'):   # 바닥 바(발 중간 위)에 팔을 편 채 닿는 허벅지 각을 한 번 푼다 — 몸통은 바닥과 거의 나란히 고정
        Wy = r.ANK_Y+C.get('bar_dy', -0.03); L_ = (r.L_U+r.L_F)*C['reach']; zb = PLATE_R-0.012 if C['load'] == 'pendlay' else 0.195; lo, hi = 0.0, 110.0   # 고릴라: 바닥 케틀벨 손잡이 높이
        for _ in range(26):
            m = (lo+hi)/2; stand_frame(r, C, C['al'], m, C['th'], None, 0.0, sc); S = r.chain_head('upperarm_l')
            if S.z-sqrt0(L_**2-(S.x-C['grip'])**2-(S.y-Wy)**2)-r.GRIP_F > zb: lo = m
            else: hi = m
        C['ph'] = (lo+hi)/2; ctx.PY = Wy-r.GRIP_N
    return stand_frame(r, C, C['al'], C['ph'], C['th'], None, 0.0, sc)
def row(r, t, ctx):
    C = ctx.C; u = timing(t); ld = C['load']; pu = u; fixed = ['foot_l', 'foot_r']
    if ld == 'pendlay': pu = sstep(0.0, 0.85, u)   # 바닥에서 폭발적으로: 당김이 먼저 끝나고 위에서 잠깐 머문다
    P, R, A, K = row_pose(r, ctx, C, pu); load = []; bar = None
    Sl = r.chain_head('upperarm_l'); L_ = (r.L_U+r.L_F)*C['reach']
    if ld in ('bar', 'smith', 'cable', 'pendlay', 'band'):
        grip = C['grip']; top = W_(P, R, ctx, front_pt(ctx, C['zc'], 0.0, -0.045))   # 바가 배꼽 위 몸 앞에 닿는 점(바 반지름+옷 여유)
        F = (R@V((0, -0.2, -1))).normalized().lerp(V((0, 0, -1)), 0.5).normalized(); Fl, Ll, nl = r.grip_frame('l', F)
        Wb = V((grip, Sl.y, Sl.z-sqrt0(L_**2-(Sl.x-grip)**2))); Gb = Wb+Fl*r.GRIP_F+nl*r.GRIP_N; bot = V((0, Gb.y, Gb.z))   # 손목이 어깨 바로 아래(쥔 점은 손목에서 손바닥 쪽으로)
        if ld == 'pendlay': bot = V((0, ctx.PY, PLATE_R-0.012))
        if ld == 'smith': bot = V((0, top.y, Sl.z-sqrt0(L_**2-(Sl.x-grip)**2-(Sl.y-top.y)**2)-r.GRIP_F)); bar = bot.lerp(top, pu)   # 레일: 수직으로만
        else: bar = arc(bot, top, pu, R@V((0, -0.08, -0.02)))   # 허벅지·무릎 앞을 스치지 않게 몸 앞쪽으로 휜다
        for s, sg in SIDES:
            pole = R@V((sg*C['elb'], 1.0, -0.25)); r.arm(s, bar+V((sg*grip, 0, 0)), F, pole, None, 0.9995); r.fingers(s)
        if ld in ('bar', 'smith', 'cable', 'pendlay'): ctx.BAR.location = bar; load = [(bar, BAR_KG)]
        if ld == 'cable': wire_to(ctx.W, bar, ctx.PUL); load = []
        if ld == 'band':
            for s, sg in SIDES: wire_to(ctx.BD[s], V((sg*(C['ax']-0.03), r.ANK_Y-0.03, r.ANK_Z*0.2)), bar+V((sg*grip, 0, 0)))
            bar = None
        if ld == 'smith':
            for o in ctx.RAILS: o.location.y = bar.y
        return dict(bar=bar if ld in ('bar', 'smith', 'pendlay', 'cable') else None, load=load, fixed=fixed)
    if ld in ('db2', 'kb2'):   # 중립 그립, 팔꿈치를 몸 옆으로 붙여 허리 옆까지
        for s, sg in SIDES:
            Ss = r.chain_head('upperarm_'+s); gx = C.get('gx', 0.22)
            bot = V((sg*gx, Ss.y+C.get('hdy', -0.02), Ss.z-sqrt0(L_**2-(Ss.x-sg*gx)**2-0.02**2)-r.GRIP_F))
            sp = W_(P, R, ctx, side_pt(ctx, C['zc']-0.04, C.get('sdx', 0.07))); top = V((sg*abs(sp.x), sp.y, sp.z))
            G = arc(bot, top, u, V((sg*C.get('bx', 0.04), 0, 0))+R@V((0, -0.04, 0)));   # 허벅지 바깥·앞으로 비켜 올린다
            F = V((0, 0, -1)); lat = V((0, -1, 0))
            r.arm(s, G, F, R@V((sg*0.15, 1.0, -0.2)), lat, 0.9995); r.fingers(s)
            if ld == 'db2': hold(ctx, s, G, V((0, 1, 0)))
            else: place_obj(ctx.KB[s], G+V((0, 0, -0.035)))
            load.append((G, DB_KG if ld == 'db2' else KB_KG))
        return dict(bar=None, load=load, fixed=fixed)
    if ld == 'gorilla':   # 넓게 서서 바닥의 케틀벨 둘: 왼손은 바닥 케틀벨을 누르고 오른손만 허리 옆으로(번갈아 하는 동작의 한쪽)
        gx = C.get('gx', 0.13)
        for s, sg in SIDES:
            Gf = V((sg*gx, ctx.PY+r.GRIP_N, 0.195)); G = Gf
            if s == 'r':
                sp = W_(P, R, ctx, side_pt(ctx, C['zc']-0.04, C.get('sdx', 0.08))); top = V((-abs(sp.x), sp.y, sp.z)); G = arc(Gf, top, u, V((C.get('bxi', 0.04), -C.get('bfy', 0.06), 0)))   # 허벅지 안쪽을 비켜 앞·가운데로 휜다(넓은 자세라 무릎이 바깥에 있다)
            r.arm(s, G, V((0, 0, -1)), R@V((sg*0.3, 1.0, -0.2)), V((0, -1, 0)), 0.9995); r.fingers(s)
            place_obj(ctx.KB[s], G+V((0, 0, -0.035))); load.append((G, KB_KG))
        return dict(bar=None, load=load, fixed=fixed)
    if ld == 'tbar':   # 축은 뒤, 바를 다리 사이에 두고 끝의 V 손잡이를 중립으로 쥐어 가슴 아래로
        B = C.get('blen', 1.70); L2 = L_
        if not hasattr(ctx, 'PIV'):
            zh = Sl.z-sqrt0(L2**2-(Sl.x-0.05)**2)-r.GRIP_F+0.05; ctx.PIV = V((0, Sl.y+sqrt0(B**2-(zh-0.06)**2), 0.06)); ctx.ZH = zh
            box("lmbase", (0.22, 0.22, 0.06), tuple(ctx.PIV-V((0, 0, 0.03))), ctx.mats.FRAME)
        top = W_(P, R, ctx, front_pt(ctx, C['zc']+0.12, 0.0, -0.10)); z = lerp(ctx.ZH, top.z, u)   # 손잡이가 명치 아래에 닿기 직전까지
        E = V((0, ctx.PIV.y-sqrt0(B**2-(z-ctx.PIV.z)**2), z)); Gc = E+V((0, 0, -0.05))
        for s, sg in SIDES: r.arm(s, Gc+V((sg*0.045, 0, 0)), V((0, 0, -1)), R@V((sg*0.7, 1.0, -0.2)), V((0, -1, 0)), 0.9995); r.fingers(s)   # 팔꿈치를 옆으로 조금 벌려 아래팔이 가슴 앞을 지난다
        d = E-ctx.PIV; ctx.LM.location = ctx.PIV+d/2; ctx.LM.rotation_mode = 'QUATERNION'; ctx.LM.rotation_quaternion = d.normalized().to_track_quat('Z', 'Y'); ctx.LM.scale = (1, 1, d.length+0.12)
        ctx.LMP.location = E+d.normalized()*0.12; rot_to(ctx.LMP, d); ctx.LMP.scale = (0.72, 0.72, 1)   # T바는 지름 작은 원판(15kg)이 흔하다 — 큰 원판은 허벅지에 닿는다
        ctx.VH.location = Gc; rot_to(ctx.VH, V((0, 1, 0)))
        return dict(bar=None, load=[(Gc, 30.0)], fixed=fixed)
    if ld == 'meadows':   # 바와 몸이 직각(바가 오른다리 바깥을 앞뒤로 지나고 축은 앞쪽 멀리), 오른손으로 끝(슬리브)을 쥐고 팔꿈치를 바깥으로 벌려 엉덩이 옆까지. 왼팔은 왼무릎 위
        B = C.get('blen', 1.85); Sr = r.chain_head('upperarm_r'); gx = C.get('gx', -0.30)
        if not hasattr(ctx, 'PIV'):
            zh = Sr.z-sqrt0(L_**2-(Sr.x-gx)**2-0.02**2)-r.GRIP_F; ctx.PIV = V((gx, Sr.y+0.02-sqrt0(B**2-(zh-0.06)**2), 0.06)); ctx.ZH = zh
            box("lmbase", (0.22, 0.22, 0.06), tuple(ctx.PIV-V((0, 0, 0.03))), ctx.mats.FRAME)
        sp = W_(P, R, ctx, side_pt(ctx, C['zc']-0.02, 0.12)); z = lerp(ctx.ZH, sp.z, u)
        E = V((gx, ctx.PIV.y+sqrt0(B**2-(z-ctx.PIV.z)**2), z)); bax = (ctx.PIV-E).normalized()
        r.arm('r', E, V((0, 0, -1)), R@V((-1.0, 0.6, 0.0)), -bax, 0.9995); r.fingers('r')
        Kl = r.chain_head('calf_l'); Hl = r.chain_head('thigh_l'); Gl = Kl.lerp(Hl, 0.25)+V((0.0, -0.06, 0.06))
        r.arm('l', Gl, V((-0.2, -1, -0.4)).normalized(), V((0.5, 0.7, 0.0)), None, 0.9995); r.fingers('l', 0.3)
        d = E-ctx.PIV; ctx.LM.location = ctx.PIV+d/2; ctx.LM.rotation_mode = 'QUATERNION'; ctx.LM.rotation_quaternion = d.normalized().to_track_quat('Z', 'Y'); ctx.LM.scale = (1, 1, d.length+0.20)
        ctx.LMP.location = E-d.normalized()*0.14; rot_to(ctx.LMP, d); ctx.LMP.scale = (0.72, 0.72, 1)   # 메도우즈는 작은 원판(10~15kg)을 쓴다 — 손 바로 앞
        return dict(bar=None, load=[(E, 25.0)], fixed=fixed)
    raise ValueError("row: 모르는 load "+ld)

# ── 한 팔 로우(벤치에 왼무릎·왼손, 오른손 케틀벨) — reps.one_arm_row 와 같은 몸, 짐만 케틀벨 ──
OR = dict(top=0.42, th=82.0)
def or_setup(ctx):
    M_ = ctx.mats; T = OR['top']; box("pad", (0.34, 1.08, 0.07), (0.15, -0.09, T-0.035), M_.PAD, 0.024); box("frame", (0.08, 0.90, 0.05), (0.15, -0.09, T-0.095), M_.FRAME); [box("post", (0.07, 0.07, T-0.12), (0.15, y_, (T-0.12)/2+0.02), M_.FRAME) for y_ in (-0.48, 0.30)]; [box("ft", (0.50, 0.09, 0.04), (0.15, y_, 0.02), M_.FRAME) for y_ in (-0.48, 0.30)]; ctx.KB = {'r': kettlebell(ctx, "kb_r")}
def one_arm_row(r, t, ctx):
    u = timing(t); T = OR['top']; th = OR['th']; Kz = T+0.065; Rt = Rx(th); off = Rt@r.HIP_OFF; K = V((0.16, 0.02, Kz)); Hz = Kz+sqrt0(r.L_T**2-(off.x-K.x)**2-0.12**2); P = V((0, K.y+0.12-off.y, Hz-off.z))
    r.torso(P, Rt, Rx(th), Rx(th-1), Rx(th-2), Rx(th-12), Rx(th-22), scap={'l': (0.0, 0.5), 'r': (lerp(-2.0, 0.0, u), lerp(4.0, -3.0, u))})
    r.leg('l', K, K+V((0.0, r.L_S, 0.0)), V((0, 0, -1)), 0.0, 110.0); r.leg_ik('r', V((-0.20, K.y+0.20, r.ANK_Z)), V((-0.25, -1, 0.05)), Rz(-10)@V((0, -1, 0)), -10.0)
    Sl = r.chain_head('upperarm_l'); F = V((0.1, -1, 0)).normalized(); Wl = V((0.19, Sl.y-0.02, T+r.GRIP_N+0.005)); r.arm('l', grip_w(r, 'l', Wl, F), F, V((0.6, 0.6, 0.1)), None, 0.9995); r.fingers('l', 0.0)
    Sr = r.chain_head('upperarm_r'); a = math.radians(lerp(3, 82, u)); d = V((-0.14-0.06*u, math.sin(a), -math.cos(a))).normalized(); fa = V((-0.22-0.08*u, lerp(math.sin(a), 0.06, sstep(0.0, 0.625, u)), -1)).normalized(); E = Sr+d*r.L_U; G = jointed(r, 'r', E, E+fa*r.L_F, V((0, 0.0, -1)), V((0, -1, 0)), V((-0.2, 1, 0))); r.fingers('r'); place_obj(ctx.KB['r'], G+V((0, 0, -0.035)))
    return dict(bar=None, load=[(G, KB_KG)], fixed=['foot_r', 'calf_l'])

# ════ 업라이트 로우(바벨·EZ·스미스·덤벨·케이블·밴드)·쿠반 프레스 ════
# 바를 몸 앞에 붙여 허벅지 → 가슴(명치~쇄골 아래)까지 수직으로, 팔꿈치가 손보다 먼저·높게 옆으로 올라간다(팔꿈치가 먼저, 가슴 높이에서 멈춤).
UR = dict(ax=0.15, load='bar', grip=0.13, z1=-0.10, th=1.0)
def ur_setup(ctx):
    C = dict(UR); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; local_pts(ctx); ld = C['load']
    if ld in ('bar', 'smith', 'cable', 'band', 'ez'): ctx.BAR = barbell(ctx.col, M_) if ld in ('bar', 'smith') else cyl("shaft", 0.014, 1.20 if ld == 'ez' else 0.80, M_.STEEL)
    if ld == 'smith': ctx.RAILS = [box("rail", (0.05, 0.05, 2.10), (sg*0.62, 0.0, 1.05), M_.FRAME) for sg in (-1, 1)]
    if ld in ('db', 'cuban'): ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
    if ld == 'cable': ctx.PUL = V((0, r.ANK_Y-0.70, 0.10)); ctx.W = wire(ctx); box("stack", (0.30, 0.16, 0.70), (0, r.ANK_Y-0.80, 0.35), M_.FRAME)   # 낮은 도르래 기둥(높으면 앞 카메라에서 몸을 가린다)
    if ld == 'band': ctx.BD = {s: wire(ctx, "band") for s, _ in SIDES}
def upright(r, t, ctx):
    C = ctx.C; u = timing(t); ld = C['load']; ax = C['ax']; P = stand_P(r, ax); th = C['th']; R = Rx(th)
    r.torso(P, R, neck=Rx(th*0.5), head=Rx(th*0.3), scap={s: (lerp(0.0, 3.5, u), lerp(0.5, 0.0, u)) for s, _ in SIDES}); fixed = plant(r, ax)
    if ld == 'cuban': return cuban(r, ctx, C, u, P, R, fixed)
    S = r.chain_head('upperarm_l'); grip = C['grip'] if ld != 'db' else 0.11; L_ = (r.L_U+r.L_F)*0.975; gap = -0.085 if ld == 'db' else -0.045
    def yat(zz):   # 그 높이의 몸 앞면(바는 옷 여유 4.5cm, 덤벨은 원판 반지름만큼)
        Lz = zz-P.z+r.head0('pelvis').z; return W_(P, R, ctx, front_pt(ctx, Lz, 0.0, gap)).y
    z0 = S.z-L_
    for _ in range(3): z0 = S.z-sqrt0(L_**2-(S.x-grip)**2-(S.y-yat(z0))**2)-r.GRIP_F*0.8   # 매달린 높이: 바가 허벅지 앞이라 어깨보다 앞에 있다
    z1 = S.z+C['z1']; z = lerp(z0, z1, u)
    if ld == 'smith':   # 레일: 바 앞뒤가 고정 — 가장 앞으로 나온 몸(가슴) 앞에 두고 매달린 높이를 다시 잡는다
        by = min(yat(zz) for zz in (z0, (z0+z1)/2, z1)); z0 = S.z-sqrt0(L_**2-(S.x-grip)**2-(S.y-by)**2)-r.GRIP_F*0.8; z = lerp(z0, z1, u)
    else: by = min(yat(z), yat(z+0.03))
    bar = V((0, by, z)); load = []
    F = V((0, 0.25, -1)).normalized()
    for s, sg in SIDES:
        pole = V((sg*lerp(0.45, 1.0, u), lerp(0.75, 0.15, u), lerp(-0.1, 0.55, u))); G = bar+V((sg*grip, 0, 0)); r.arm(s, G, F, pole, None, 0.9995); r.fingers(s)
        if ld == 'db': hold(ctx, s, G, V((1, 0, 0))); load.append((G, DB_KG))
        if ld == 'band': wire_to(ctx.BD[s], V((sg*(ax-0.03), r.ANK_Y-0.03, r.ANK_Z*0.2)), G)
    if ld in ('bar', 'smith', 'ez', 'cable', 'band'): ctx.BAR.location = bar; load = [(bar, BAR_KG*0.5)]
    if ld == 'smith':
        for o in ctx.RAILS: o.location.y = bar.y
    if ld == 'cable': wire_to(ctx.W, bar, ctx.PUL)
    return dict(bar=bar if ld in ('bar', 'smith', 'ez') else None, load=load, fixed=fixed)
def cuban(r, ctx, C, u, P, R, fixed):
    """쿠반 프레스: 업라이트 로우(팔꿈치 어깨 높이) → 위팔을 그대로 두고 아래팔을 위로 세움(외회전) → 머리 위로 밀기."""
    a1 = sstep(0.0, 0.26, u); a2 = 0.5-0.5*math.cos(math.pi*max(0.0, min(1.0, (u-0.26)/0.50))); a3 = sstep(0.76, 1.0, u); load = []   # 외회전 구간을 가장 길게(아래팔 반 바퀴)
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s)
        dU0 = V((sg*0.22, -0.12, -1)).normalized(); dU1 = V((sg*0.96, -0.20, 0.05)).normalized(); dU2 = V((sg*0.22, -0.04, 1)).normalized()
        dU = dU0.lerp(dU1, a1).lerp(dU2, a3).normalized(); E = S+dU*r.L_U
        ph = math.radians(lerp(180.0, 8.0, a2)); dF = V((sg*0.06*(1-a1), -math.sin(ph)*a1-0.45*(1-a1), math.cos(ph))).normalized().lerp(dU2, a3).normalized()   # 매달린 덤벨은 허벅지 앞으로 띄운다
        W = E+dF*r.L_F*0.999; pe = E-(S+W)/2; pe = pe.normalized() if pe.length > 1e-4 else V((sg, 0, 0)); G = jointed(r, s, E, W, dF, V((-sg, 0, 0)), (pe*(1-a3)+V((sg*1.0, 0.1, -0.35)).normalized()*a3))   # 팔꿈치 방향: 직접 정한 E 에서 펴는 동안 바깥 아래로 매끄럽게 넘긴다
        r.fingers(s); hold(ctx, s, G, r.grip_frame(s, dF, V((-sg, 0, 0)))[1]); load.append((G, DB_KG*0.5))   # 손잡이를 실제 손바닥 축에 맞춘다
    return dict(bar=None, load=load, fixed=fixed)

# ════ 하이 풀(클린 풀·스내치 풀·데드리프트 하이 풀·케틀벨 하이 풀) ════
# 바닥에서 데드리프트처럼 일어서고(몸통 각은 손이 바 높이에 닿게 풀어 낸다) → 발끝으로 서며 어깨를 으쓱(트리플 익스텐션).
# 하이 풀은 그 뒤 팔꿈치를 높이 들어 바를 가슴까지, 클린·스내치 풀은 팔을 편 채 끝난다.
HP = dict(ax=0.14, toe=10.0, load='bar', grip=0.27, bar_dy=-0.10, K=[(0.0, 17.0, 68.0), (0.55, 1.5, 0.0)], arm=False, heel=11.0, ext=0.55, top=-0.10, reach=0.99)
def hp_setup(ctx):
    C = dict(HP); C.update(ctx.vars); ctx.C = C; local_pts(ctx); M_ = ctx.mats
    if C['load'] == 'bar': ctx.BAR = barbell(ctx.col, M_)
    else: ctx.KB = {'c': kettlebell(ctx, "kb_c")}
def hpull(r, t, ctx):
    C = ctx.C; u = timing(t); ld = C['load']; e0 = C['ext']; grip = C['grip']; L_ = (r.L_U+r.L_F)*C['reach']
    by = r.ANK_Y+C['bar_dy']; Wy = by-r.GRIP_N if ld == 'bar' else by; zf = PLATE_R-0.012 if ld == 'bar' else 0.195
    v = sstep(0.0, e0, u); al, ph = keys(u, C['K']); w = sstep(e0, e0+0.22, u); a = sstep(e0+0.05, 1.0, u) if C['arm'] else 0.0
    heel = C['heel']*w; sc = (lerp(0.0, 4.0, w), lerp(1.5, 0.0, w)); fz = 0.0; yA = 0.0
    if heel > 0:   # 앞꿈치는 바닥에 둔 채 뒤꿈치를 든다 → 발목이 오르고 조금 앞으로
        A2 = r.ankle_from_ball('l', V((C['ax'], r.head0('ball_l').y, r.head0('ball_l').z)), 0.0, heel); fz = A2.z-r.ANK_Z; yA = A2.y-r.ANK_Y
    C['yA'] = yA
    def hand_z(th, al_=None, ph_=None, sc_=None):
        stand_frame(r, C, al if al_ is None else al_, ph if ph_ is None else ph_, th, None, fz, sc if sc_ is None else sc_); S = r.chain_head('upperarm_l'); return S.z-sqrt0(L_**2-(S.x-grip)**2-(S.y-Wy)**2)-r.GRIP_F
    if not hasattr(ctx, 'ZT'):   # 다 선 자세(마지막 키 · 뒤꿈치 0)의 손 높이
        a1, p1 = keys(1.0, C['K']); f0 = fz; fz = 0.0; ctx.ZT = hand_z(0.0, a1, p1, (0.0, 1.5)); fz = f0
    if v < 0.999:   # 바닥 → 선 자세: 손이 zb 에 닿는 몸통 각(처음 닿는 구간)
        zb = lerp(zf, ctx.ZT, v); lo, hi = -5.0, 88.0
        for m in range(0, 89):
            if hand_z(float(m)) <= zb: lo, hi = float(m-1), float(m); break
        for _ in range(24):
            m = (lo+hi)/2
            if hand_z(m) > zb: lo = m
            else: hi = m
        th = (lo+hi)/2
    else: th = lerp(0.0, -4.0, w)   # 다 펴면 살짝 젖힌다
    P, R, A, K = stand_frame(r, C, al, ph, th, None, fz, sc)
    for s, sg in SIDES:   # 뒤꿈치 각을 실은 발
        r.leg(s, V((sg*K.x, K.y, K.z)), V((sg*A.x, A.y, A.z)), Rz(sg*C['toe'])@V((0, -1, 0)), sg*C['toe'], heel, heel > 0)
    S = r.chain_head('upperarm_l'); zh = S.z-sqrt0(L_**2-(S.x-grip)**2-(S.y-Wy)**2)-r.GRIP_F
    if a > 0:   # 하이 풀: 팔꿈치를 높이(업라이트 로우처럼) — 바는 몸 앞면을 따라 가슴 높이까지
        z = lerp(zh, S.z+C['top'], a); Lz = z-P.z+r.head0('pelvis').z; yb = min(by, W_(P, R, ctx, front_pt(ctx, Lz, 0.0, -0.07 if ld == 'bar' else -0.12)).y)
        bar = V((0, lerp(by, yb, sstep(0.0, 0.2, a)), z))
    else: bar = V((0, by, zh))
    F = V((0, 0.25*a, -1)).normalized(); load = []
    for s, sg in SIDES:
        pole = V((sg*lerp(0.35, 1.0, a), lerp(0.9, 0.15, a), lerp(0.0, 0.55, a))); gx = grip if ld == 'bar' else C.get('kgx', 0.045)
        if ld == 'bar': r.arm(s, bar+V((sg*gx, 0, 0)), F, pole, None, 0.9995)
        else: r.arm(s, bar+V((sg*gx, 0, 0)), F, pole, V((-sg*0.3, -1, 0)).normalized(), 0.9995)
        r.fingers(s)
    if ld == 'bar': ctx.BAR.location = bar; load = [(bar, BAR_KG)]
    else: place_obj(ctx.KB['c'], bar+V((0, 0, -0.035))); load = [(bar, KB_KG)]
    return dict(bar=bar if ld == 'bar' else None, load=load, fixed=['ball_l', 'ball_r'])

# ════ 풀업 묶음(친업·비하인드 넥·스터넘·코만도·아처·타이프라이터·한 팔·링·키핑·어시스트·데드 행) ════
# reps.pull_up 과 같은 틀: 손목에서 어깨까지 거리로 매달린 높이를 풀고, 맨 위는 손 아래 top 만큼. 몸을 옆으로 옮기는 변형은 dx.
PUV = dict(bar_z=2.42, grip=0.34, th0=1.0, th1=-10.0, sup=False, mode='std', top=0.175, dy0=-0.02, dy1=0.10, prop='bar', assist=None, pole0=(0.8, 0.10, -0.7), pole1=(0.9, 0.45, -0.7), e0=3.5, e1=-2.0, p0=1.0, p1=-2.5, dx=0.0, legs=None, thk=None, hz=None)
def puv_setup(ctx):
    C = dict(PUV); C.update(ctx.vars); ctx.C = C; M_ = ctx.mats; z = C['bar_z']; ctx.BARP = V((0, 0, z))
    if C['prop'] == 'ring':   # 링: 손잡이는 Y 축, 끈은 천장 빔까지
        for s, sg in SIDES: cyl("shaft_ring_"+s, 0.016, 0.15, M_.STEEL, (sg*C['grip'], 0, z), 'Y'); box("sl_strap_"+s, (0.035, 0.006, 0.86), (sg*C['grip'], 0, z+0.51), M_.FRAME, 0.002)
        box("beam", (1.4, 0.08, 0.08), (0, 0, z+0.98), M_.FRAME)
    elif C['prop'] == 'ybar':   # 코만도: 바가 앞뒤로 놓인다
        cyl("shaft", 0.014, 1.5, M_.STEEL, (0, 0, z), 'Y'); [box("up", (0.07, 0.07, z+0.04), (0.02, sg*0.72, (z+0.04)/2), M_.FRAME) for sg in (-1, 1)]; [box("ft", (0.9, 0.09, 0.04), (0.02, sg*0.72, 0.02), M_.FRAME) for sg in (-1, 1)]
    else:
        cyl("shaft", 0.014, 1.5, M_.STEEL, (0, 0, z)); [box("up", (0.07, 0.07, z+0.04), (sg*0.72, 0.02, (z+0.04)/2), M_.FRAME) for sg in (-1, 1)]; [box("ft", (0.09, 0.9, 0.04), (sg*0.72, 0.02, 0.02), M_.FRAME) for sg in (-1, 1)]
    if C['assist'] == 'machine':   # 무릎 받침이 몸과 함께 오르내린다
        ctx.KP = box("kpad", (0.40, 0.26, 0.07), (0, 0, 0), M_.PAD, 0.02); ctx.KS = box("kstem", (0.07, 0.07, 1.0), (0, 0, 0), M_.FRAME, 0.004)
        box("base", (0.6, 0.6, 0.05), (0, 0.32, 0.025), M_.FRAME)
    if C['assist'] == 'band': ctx.BD = [cyl("sl_band", 0.010, 1.0, M_.RUBBER, axis='Z', verts=10) for _ in range(2)]
def puv(r, t, ctx):
    C = ctx.C; u = timing(t); md = C['mode']; z = C['bar_z']; g = C['grip']
    G = {'l': V((g, 0, z)), 'r': V((-g, 0, z))}; lat = {'l': None, 'r': None}
    if C['sup']: sl = C.get('slat', 0.0); lat = {'l': V((1, sl, 0)).normalized(), 'r': V((-1, sl, 0)).normalized()}   # slat: 손바닥을 조금 안쪽으로(완전 회외는 아래팔 비틀림 한계 밖)
    if C['prop'] in ('ring', 'ybar'): cl = C.get('clat', 0.0); lat = {'l': V((cl, -1, 0)).normalized(), 'r': V((-cl, -1, 0)).normalized()}
    if md == 'commando': G = {'l': V((0, -0.06, z)), 'r': V((0, 0.06, z))}
    if md == 'onearm': G = {'l': V((0.03, 0, z))}
    F = V((0, lerp(0.0, -C.get('ftilt', 0.35), u), 1)).normalized()
    if C['prop'] == 'ybar': F = V((0, 0, 1))
    if md == 'typewriter': ur = sstep(0.0, 0.6, u); dx = C['dx']*sstep(0.6, 1.0, u)
    elif md == 'hang': ur = 0.0; dx = 0.0
    else: ur = u; dx = C['dx']*u
    th = lerp(C['th0'], C['th1'], ur) if C['thk'] is None else keys(u, C['thk'])[0]
    e = lerp(C['e0'], C['e1'], u if md == 'hang' else ur); p = lerp(C['p0'], C['p1'], u if md == 'hang' else ur); Rt = Rx(th); P0 = r.head0('pelvis'); Lr = (r.L_U+r.L_F)*0.985
    W = {}
    for s in G: Fs, Ls, ns = r.grip_frame(s, F, lat[s]); W[s] = G[s]-Fs*r.GRIP_F-ns*r.GRIP_N
    Wc = sum(W.values(), V((0, 0, 0)))/len(W); yS = lerp(Wc.y+C['dy0'], Wc.y+C['dy1'], ur)
    def zfor(s):   # 그 손이 닿는 가장 낮은 어깨 높이
        S0 = r.shoulder_local(s, e, p); dS = Rt@(S0-P0); return W[s].z-sqrt0(Lr**2-(W[s].x-(dx+dS.x))**2-(yS-W[s].y)**2)
    hang_z = max(zfor(s) for s in W); top_z = W['l'].z-C['top']; zS = lerp(hang_z, max(top_z, hang_z), ur)
    S0 = r.shoulder_local('l', e, p); dS = Rt@(S0-P0); P = V((dx, yS-dS.y, zS-dS.z))
    r.torso(P, Rt, neck=Rx(lerp(th, th-14, ur) if md != 'neck' else th+lerp(0, 24, ur)), head=Rx(lerp(th+3, th-20, ur) if md != 'neck' else th+lerp(3, 30, ur)), scap={s: (e, p) for s, _ in SIDES})
    if C['legs']: a1d, a2d = keys(u, C['legs'])
    elif C['assist']: a1d, a2d = 8.0, 92.0
    else: a1d, a2d = lerp(5, 18, ur), lerp(10, 32, ur)
    KK = {}
    for s, sg in SIDES:
        H = r.chain_head('thigh_'+s); a1 = math.radians(a1d); a2 = math.radians(a2d); K = H+V((sg*0.012, -math.sin(a1), -math.cos(a1)))*r.L_T; A = K+V((0, math.sin(a2), -math.cos(a2)))*r.L_S; KK[s] = (K, A)
        r.leg(s, K, A, V((0, -math.cos(a2)*0.6, -0.8)).normalized(), 0.0, a2d+18.0)
    p0, p1 = C['pole0'], C['pole1']
    for s, sg in SIDES:
        if s not in G: hang(r, s, sg, 0.03, -0.03); r.targets.pop('G_'+s, None); r.targets.pop('Gnow_'+s, None); continue   # 빈손은 쥔 점이 아니다
        pole = V((sg*lerp(p0[0], p1[0], ur), lerp(p0[1], p1[1], ur), lerp(p0[2], p1[2], ur)))
        r.arm(s, G[s], F, pole, lat[s], 0.9995); r.fingers(s)
    if C['assist'] == 'machine':
        K = (KK['l'][0]+KK['r'][0])/2; A = (KK['l'][1]+KK['r'][1])/2; m = (K+A)/2; top = min(K.z, A.z)-0.075; ctx.KP.location = V((0, m.y, top-0.035)); ctx.KS.location = V((0, m.y+0.10, top/2)); ctx.KS.scale = (1, 1, max(0.05, top-0.07))
    if C['assist'] == 'band':
        for o, (s, sg) in zip(ctx.BD, SIDES):
            K, A = KK[s]; wire_to(o, V((sg*0.03, 0.0, z)), K+(A-K)*0.25+V((sg*0.02, 0, -0.065)))
    return dict(bar=ctx.BARP.copy() if C['prop'] == 'bar' else None, load=[], fixed=[])

# ════ 랫풀다운 변형(클로즈 V 손잡이·비하인드 넥·한 팔·밴드·머신) + 스트레이트 암 풀다운 ════
LPV = dict(grip=0.40, th0=4.0, th1=17.0, load='bar', y0=-0.12, y1=-0.20, z1=-0.03, pole0=(0.85, 0.0, -0.6), pole1=(0.85, 0.5, -0.6), ftilt=0.25)
def lpv_setup(ctx):
    C = dict(LPV); C.update(ctx.vars); ctx.C = C; M_ = ctx.mats; r = ctx.rig; ld = C['load']
    hip = r.ANK_Z+r.L_S+0.015; off = r.HIP_OFF; ctx.P = V((0, 0.0, hip-off.z)); T = hip-0.105; ctx.T = T
    box("seat", (0.40, 0.42, 0.07), (0, -0.05, T-0.035), M_.PAD, 0.024); box("stem", (0.09, 0.09, T-0.07), (0, -0.05, (T-0.07)/2), M_.FRAME); box("rail", (0.09, 0.75, 0.05), (0, -0.40, 0.03), M_.FRAME)
    box("kpad", (0.42, 0.10, 0.09), (0, -0.40, hip+0.17), M_.PAD, 0.03); box("kstem", (0.07, 0.07, hip+0.13), (0, -0.70, (hip+0.13)/2), M_.FRAME); box("kx", (0.07, 0.34, 0.05), (0, -0.55, hip+0.17), M_.FRAME)
    if ld == 'band':   # 밴드: 머리 위 랙 빔에 건다
        [box("rk", (0.07, 0.07, 2.36), (sg*0.62, -0.28, 1.18), M_.FRAME) for sg in (-1, 1)]; box("beam", (1.31, 0.07, 0.07), (0, -0.28, 2.33), M_.FRAME); ctx.AN = V((0, -0.28, 2.29))
        ctx.BD = [cyl("sl_band", 0.009, 1.0, M_.RUBBER, axis='Z', verts=10) for _ in range(2)]
    elif ld == 'machine':   # 플레이트 머신: 손잡이 둘이 뒤쪽 위 축에서 호를 그린다
        box("tower", (0.10, 0.10, 2.10), (0, 0.45, 1.05), M_.FRAME); ctx.PV = V((0, 0.45, 2.05)); ctx.LV = {s: box("lever_"+s, (0.05, 1.0, 0.05), (0, 0, 0), M_.FRAME, 0.004) for s, _ in SIDES}; ctx.HD = {s: cyl("shaft_h_"+s, 0.016, 0.14, M_.STEEL, axis='Y') for s, _ in SIDES}
    else:
        box("tower", (0.10, 0.10, 2.30), (0, -0.70, 1.15), M_.FRAME); box("top", (0.10, 0.60, 0.06), (0, -0.42, 2.30), M_.FRAME); ctx.PUL = V((0, -0.18, 2.28)); ctx.W = wire(ctx)
        if ld == 'v': ctx.BAR = cyl("shaft", 0.014, 0.20, M_.STEEL, axis='Y')
        elif ld == 'd': ctx.BAR = cyl("shaft", 0.016, 0.13, M_.STEEL)
        else: ctx.BAR = cyl("shaft", 0.014, 1.15, M_.STEEL)
def lpv(r, t, ctx):
    C = ctx.C; u = timing(t); ld = C['load']; th = lerp(C['th0'], C['th1'], u); e = lerp(3.0, -2.0, u); p = lerp(1.5, -2.5, u)
    neck = C.get('neck', False); one = ld == 'd'
    r.torso(ctx.P, Rx(-th), neck=Rx(-th*0.7+(lerp(0, 22, u) if neck else 0)), head=Rx(-th*0.4-3+(lerp(0, 30, u) if neck else 0)), scap={s: ((e, p) if not one or s == 'l' else (0.5, 0.5)) for s, _ in SIDES})
    for s, sg in SIDES:
        H = r.chain_head('thigh_'+s); r.leg_ik(s, V((sg*0.20, H.y-r.L_T*0.97, r.ANK_Z)), V((sg*0.12, -0.5, 1)), Rz(sg*8)@V((0, -1, 0)), sg*8)
    S = r.chain_head('upperarm_l'); gx = C['grip']; Lr = (r.L_U+r.L_F)*0.985
    top_z = S.z+sqrt0(Lr**2-(gx-S.x)**2-(C['y0'])**2)+r.GRIP_F
    bar = V((0, lerp(S.y+C['y0'], S.y+C['y1'], u), lerp(top_z, S.z+C['z1'], u)))
    lat = None; F = V((0, lerp(-0.12, C['ftilt'], u), 1)).normalized()
    if ld in ('v', 'machine') or C.get('neutral'): lat = V((0, 1, 0))   # 손바닥이 마주 본다(엄지가 뒤쪽)
    G = {}
    for s, sg in SIDES:
        if one and s == 'r': continue
        G[s] = bar+V((sg*gx, 0, 0))
    if one: G['l'] = bar.copy()+V((gx, 0, 0))
    for s, sg in SIDES:
        if s not in G:   # 한 팔: 반대 손은 허벅지 위
            Sr = r.chain_head('upperarm_r'); E = Sr+V((-0.06, -0.12, -1)).normalized()*r.L_U; W = r.chain_head('thigh_r')+V((-0.02, -0.26, 0.10)); jointed(r, 'r', E, W, V((0, -1, -0.3)).normalized(), None, V((-0.3, 1, 0))); r.fingers('r', 0.3); continue
        pole = V((sg*lerp(C['pole0'][0], C['pole1'][0], u), lerp(C['pole0'][1], C['pole1'][1], u), lerp(C['pole0'][2], C['pole1'][2], u)))
        r.arm(s, G[s], F, pole, lat, 0.9995); r.fingers(s)
    if ld == 'band':
        for o, (s, sg) in zip(ctx.BD, SIDES): wire_to(o, ctx.AN+V((sg*0.03, 0, 0)), G.get(s, bar))
    elif ld == 'machine':
        for s, sg in SIDES:
            h = G[s]; ctx.HD[s].location = h; a = ctx.PV+V((sg*gx, 0, 0)); d = h-a; o = ctx.LV[s]; o.location = (a+h)/2; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.normalized().to_track_quat('Y', 'Z'); o.scale = (1, d.length, 1)
    else:
        ctx.BAR.location = G['l']-V((gx, 0, 0)) if not one else G['l']; wire_to(ctx.W, ctx.BAR.location, ctx.PUL)
    return dict(bar=bar if ld in ('bar', 'band') else None, load=[], fixed=['foot_l', 'foot_r', 'pelvis'])

# ════ 시티드 로우(케이블·밴드·머신) · 스탠딩 케이블 로우 ════
# 앉아(또는 서서) 몸통을 앞 → 곧게 세우며 손잡이를 배꼽 앞까지 당긴다. 손잡이는 세로 V 손잡이(손바닥이 마주 봄).
SR = dict(load='cable', toe=8.0, th0=14.0, th1=-4.0, zc=1.02, gx=0.07, dy=-0.10, reach=0.975, hz=-0.20, pole0=(0.25, 0.6, -1.0), pole1=(0.3, 1.0, -0.4), ax=0.15, al=10.0, ph=8.0)
def sr_setup(ctx):
    C = dict(SR); C.update(ctx.vars); ctx.C = C; M_ = ctx.mats; r = ctx.rig; local_pts(ctx); ld = C['load']
    if ld == 'standing':
        ctx.STAND = True; ctx.PUL = V((0, -1.30, 1.00)); box("tower", (0.12, 0.12, 2.1), (0, -1.40, 1.05), M_.FRAME); box("base", (0.6, 0.5, 0.05), (0, -1.40, 0.025), M_.FRAME)
    else:
        ctx.STAND = False; hip = r.ANK_Z+r.L_S+0.015; off = r.HIP_OFF; ctx.P = V((0, 0.0, hip-off.z)); T = hip-0.105-C.get('drop', 0.025); ctx.T = T
        box("seat", (0.34, 1.2 if ld != 'machine' else 0.42, 0.07), (0, 0.10 if ld != 'machine' else -0.02, T-0.035), M_.PAD, 0.024); box("stem", (0.09, 0.09, T-0.07), (0, -0.02, (T-0.07)/2), M_.FRAME)
        H = r.head0('thigh_l'); ctx.AY = H.y-(r.L_T+r.L_S)*0.86; ctx.AZ = hip-0.24
        if ld == 'machine':   # 가슴 받침 + 앞쪽에서 오는 손잡이 레버
            ctx.AY = H.y-r.L_T*0.97; ctx.AZ = r.ANK_Z
            ctx.CP = box("cpad", (0.30, 0.07, 0.30), (0, 0, 0), M_.PAD, 0.024); box("cstem", (0.07, 0.07, 1.0), (0, -0.60, 0.5), M_.FRAME); box("cx", (0.07, 0.40, 0.05), (0, -0.40, 0.98), M_.FRAME)
            ctx.HD = {s: cyl("shaft_h_"+s, 0.016, 0.24, M_.STEEL, axis='Z') for s, _ in SIDES}; ctx.LV = {s: box("lever_"+s, (0.04, 1.0, 0.04), (0, 0, 0), M_.FRAME, 0.004) for s, _ in SIDES}; ctx.PV = V((0, -0.95, 0.55))
        else:
            box("plate", (0.40, 0.04, 0.34), (0, ctx.AY-0.25, ctx.AZ-0.02), M_.FRAME); box("rail", (0.09, 1.2, 0.05), (0, ctx.AY+0.35, 0.03), M_.FRAME)
            ctx.PUL = V((0, ctx.AY-0.18, ctx.AZ+0.02)); box("tower", (0.12, 0.12, 0.50), (0, ctx.AY-0.24, 0.25), M_.FRAME)
    if ld in ('cable', 'standing'):
        ctx.HV = cyl("shaft_v", 0.015, 0.18, M_.STEEL, axis='X'); ctx.W = wire(ctx)
    if ld == 'band': ctx.BD = [cyl("sl_band", 0.009, 1.0, M_.RUBBER, axis='Z', verts=10) for _ in range(2)]
def srow(r, t, ctx):
    C = ctx.C; u = timing(t); ld = C['load']; th = lerp(C['th0'], C['th1'], u); R = Rx(th)
    if ctx.STAND:   # 무릎 살짝 굽혀 선 자세
        P, R, A, K = stand_frame(r, dict(C), C['al'], C['ph'], th, None, 0.0, (lerp(2.0, -1.0, u), lerp(2.5, -3.0, u)))
        fixed = ['foot_l', 'foot_r']
    else:
        P = ctx.P; r.torso(P, R, neck=Rx(th*0.6), head=Rx(th*0.3), scap={s: (lerp(1.0, -1.0, u), lerp(3.0, -3.5, u)) for s, _ in SIDES})
        for s, sg in SIDES: r.leg_ik(s, V((sg*0.14, ctx.AY, ctx.AZ)), V((sg*0.15, -0.2, 1)), V((0, -1, 0)) if ld == 'machine' else Rz(sg*6)@V((0, -0.55, 0.85)).normalized(), sg*6, 0.0 if ld == 'machine' else -50.0)
        fixed = ['foot_l', 'foot_r', 'pelvis']
    F = V((0, -1, -0.1)).normalized(); lat = V((0, 0, 1)); Lr = (r.L_U+r.L_F)*C['reach']; G = {}
    zc = C['zc']; W1 = {}; W0 = {}
    for s, sg in SIDES:
        Sh = r.chain_head('upperarm_'+s); z0 = W_(P, R, ctx, V((0, 0, zc))).z+C['hz']*0.0; zh = Sh.z+C['hz']
        W0[s] = V((sg*C['gx'], Sh.y-sqrt0(Lr**2-(Sh.x-sg*C['gx'])**2-(Sh.z-zh)**2), zh))
        W1[s] = W_(P, R, ctx, front_pt(ctx, zc, sg*C['gx'], C['dy']))
    for s, sg in SIDES:
        Wt = arc(W0[s], W1[s], u, V((0, 0, 0.03))); G[s] = grip_w(r, s, Wt, F, lat)
        pole = V((sg*lerp(C['pole0'][0], C['pole1'][0], u), lerp(C['pole0'][1], C['pole1'][1], u), lerp(C['pole0'][2], C['pole1'][2], u)))
        r.arm(s, G[s], F, pole, lat, 0.9995); r.fingers(s)
    c = (G['l']+G['r'])/2
    if ld in ('cable', 'standing'): ctx.HV.location = c+V((0, -0.03, 0)); wire_to(ctx.W, c+V((0, -0.03, 0)), ctx.PUL)
    elif ld == 'band':
        for o, (s, sg) in zip(ctx.BD, SIDES): wire_to(o, G[s], V((sg*0.10, ctx.AY-0.13, ctx.AZ+0.02)))
    else:
        for s, sg in SIDES:
            ctx.HD[s].location = G[s]; h = G[s]+V((0, 0, 0.12)); lv = C.get('lvd', (0.0, -0.70, 0.25)); a = h+V((sg*lv[0], lv[1], lv[2])); d = h-a; o = ctx.LV[s]; o.location = (a+h)/2; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.normalized().to_track_quat('Y', 'Z'); o.scale = (1, d.length*C.get('lev', 1.0), 1)
        if not hasattr(ctx, 'CPY'): ctx.CPY = W_(P, R, ctx, front_pt(ctx, 1.25, 0.0, -0.045))
        ctx.CP.location = ctx.CPY
    return dict(bar=None, load=[], fixed=fixed)

# ════ 스트레이트 암 풀다운(케이블·밴드) — 살짝 숙여 선 채 편 팔을 앞 위에서 허벅지까지 ════
SA = dict(load='cable', ax=0.14, toe=8.0, al=8.0, ph=12.0, th=24.0, grip=0.24, f0=28.0, f1=-62.0, reach=0.965, pole=(0.8, -0.3))
def sa_setup(ctx):
    C = dict(SA); C.update(ctx.vars); ctx.C = C; M_ = ctx.mats
    box("tower", (0.12, 0.12, 2.3), (0, -1.05, 1.15), M_.FRAME); box("base", (0.6, 0.5, 0.05), (0, -1.05, 0.025), M_.FRAME); ctx.PUL = V((0, -0.98, 2.10))
    if C['load'] == 'band': ctx.BD = [cyl("sl_band", 0.009, 1.0, M_.RUBBER, axis='Z', verts=10) for _ in range(2)]
    else: ctx.BAR = cyl("shaft", 0.014, 0.80, M_.STEEL); ctx.W = wire(ctx)
def sapd(r, t, ctx):
    C = ctx.C; u = timing(t); P, R, A, K = stand_frame(r, C, C['al'], C['ph'], C['th'], None, 0.0, (lerp(1.5, -1.0, u), lerp(2.0, -2.5, u)))
    f = math.radians(lerp(C['f0'], C['f1'], u)); d = V((0, -math.cos(f), math.sin(f))); dp = V((0, math.sin(f), math.cos(f))); Lr = (r.L_U+r.L_F)*C['reach']; G = {}
    Sc = (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2
    for s, sg in SIDES:
        Sh = r.chain_head('upperarm_'+s); dd = V((sg*C['grip']-Sh.x, 0, 0))+d*Lr; W = Sh+dd.normalized()*Lr
        F = (W-Sh).normalized(); G[s] = grip_w(r, s, W, F); r.arm(s, G[s], F, V((sg*C['pole'][0], 0, 0))+dp*C['pole'][1], None, 0.9995); r.fingers(s)
    c = (G['l']+G['r'])/2; c.x = 0
    if C['load'] == 'band':
        for o, (s, sg) in zip(ctx.BD, SIDES): wire_to(o, G[s], ctx.PUL+V((sg*0.03, 0, 0)))
        bar = None
    else: ctx.BAR.location = c; wire_to(ctx.W, c, ctx.PUL); bar = c
    return dict(bar=bar, load=[], fixed=['foot_l', 'foot_r'])
# ════ 풀오버(바벨·EZ바·덤벨 둘) — 벤치에 누워 편 팔을 가슴 위에서 머리 뒤로 ════
PO = dict(load='bar', grip=0.17, f0=88.0, f1=-6.0, reach=0.955, pole=(0.8, -0.35))
def po_setup(ctx):
    C = dict(PO); C.update(ctx.vars); ctx.C = C; lie_setup(ctx)
    if C['load'] == 'db': from families.reps import dbs; dbs(ctx)
    elif C['load'] == 'ez': ctx.BAR = cyl("shaft", 0.014, 1.20, ctx.mats.STEEL)
    else: ctx.BAR = barbell(ctx.col, ctx.mats)
def pullover(r, t, ctx):
    C = ctx.C; u = timing(t); lie_torso(r, ctx.P, (lerp(-1.0, 1.5, u), lerp(0.5, -0.5, u))); f = math.radians(lerp(C['f0'], C['f1'], u))
    d = V((0, math.cos(f), math.sin(f))); dp = V((0, -math.sin(f), math.cos(f))); Lr = (r.L_U+r.L_F)*C['reach']; G = {}; load = []
    for s, sg in SIDES:
        Sh = r.chain_head('upperarm_'+s); gx = sg*C['grip']; dd = (V((gx-Sh.x, 0, 0))+d*Lr); W = Sh+dd.normalized()*Lr
        F = dd.normalized(); lat = None if C['load'] != 'db' else V((0, 0, 0))+dp*(1.0)
        G[s] = grip_w(r, s, W, F, lat); r.arm(s, G[s], F, V((sg*C['pole'][0], 0, 0))+dp*C['pole'][1], lat, 0.9995); r.fingers(s)
        if C['load'] == 'db': hold(ctx, s, G[s], dp); load.append((G[s], DB_KG))
    lie_legs(r, ctx); bar = None
    if C['load'] != 'db':
        bar = (G['l']+G['r'])/2; bar.x = 0; ctx.BAR.location = bar; load = [(bar, BAR_KG)]
    return dict(bar=bar, load=load, fixed=['foot_l', 'foot_r', 'pelvis', 'spine_03'])

# ════ 인버티드 로우(맨몸 바·스미스·링) — 뒤꿈치를 축으로 곧은 몸을 바 쪽으로 당긴다 ════
IR = dict(prop='bar', bar_z=1.02, grip=0.30, ax=0.13, Az=0.095, top=0.22, reach=1.05, pole0=(0.8, 0.0, -0.5), pole1=(0.7, 0.3, -0.7))
def ir_pose(r, e, ctx):
    A = V((ctx.C['ax'], ctx.Ay, ctx.C['Az'])); d = V((0, math.cos(e), math.sin(e))); Rt = Rx(-(90-math.degrees(e))); off = Rt@r.HIP_OFF; L = (r.L_T+r.L_S)*0.997
    hx = off.x-A.x; Lh = sqrt0(L**2-hx**2); H = V((A.x+hx, A.y+d.y*Lh, A.z+d.z*Lh)); return H-off, Rt
def ir_calib(r, ctx):
    """맨 위(어깨가 바보다 top 아래)·맨 아래(팔을 다 편 거리) 몸 각과 바 y 를 실제 몸통을 놓아 잰다(첫 프레임에서 한 번)."""
    C = ctx.C; z = C['bar_z']; Lr = (r.L_U+r.L_F)*C['reach']
    def sh(e):
        P, Rt = ir_pose(r, e, ctx); r.torso(P, Rt); return (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2
    lo, hi = 0.05, 1.2
    for _ in range(40):
        m = (lo+hi)/2
        if sh(m).z < z-C['top']: lo = m
        else: hi = m
    ctx.e1 = (lo+hi)/2; ctx.By = sh(ctx.e1).y+0.02; lo, hi = 0.0, ctx.e1
    for _ in range(40):
        m = (lo+hi)/2; S = sh(m)
        if ((S.z-z)**2+(S.y-ctx.By)**2+(C['grip']-0.19)**2)**0.5-r.GRIP_F > Lr: lo = m
        else: hi = m
    ctx.e0 = hi
    for o in ctx.PROPS: o.location.y += ctx.By
def ir_setup(ctx):
    C = dict(IR); C.update(ctx.vars); ctx.C = C; M_ = ctx.mats; z = C['bar_z']; ctx.Ay = -1.05; import bpy; n0 = set(bpy.data.objects)
    if C['prop'] == 'ring':
        for s, sg in SIDES: cyl("shaft_ring_"+s, 0.016, 0.15, M_.STEEL, (sg*C['grip'], 0, z), 'Y'); box("sl_strap_"+s, (0.035, 0.006, 2.4-z), (sg*C['grip'], 0, (z+2.4)/2+0.08), M_.FRAME, 0.002)
        box("beam", (1.4, 0.08, 0.08), (0, 0, 2.5), M_.FRAME)
    else:
        cyl("shaft", 0.014, 1.5, M_.STEEL, (0, 0, z)); [box("up", (0.07, 0.07, 2.2), (sg*0.72, 0, 1.1), M_.FRAME) for sg in (-1, 1)]; [box("ft", (0.09, 0.9, 0.04), (sg*0.72, 0, 0.02), M_.FRAME) for sg in (-1, 1)]
        if C['prop'] == 'smith': [box("rail", (0.05, 0.05, 2.2), (sg*0.62, 0.06, 1.1), M_.STEEL) for sg in (-1, 1)]; [box("hook", (0.06, 0.05, 0.08), (sg*0.62, 0.03, z), M_.FRAME) for sg in (-1, 1)]
    ctx.PROPS = [o for o in bpy.data.objects if o not in n0]
def inv_row(r, t, ctx):
    if not hasattr(ctx, 'e0'): ir_calib(r, ctx)
    C = ctx.C; u = timing(t); e = lerp(ctx.e0, ctx.e1, u); P, Rt = ir_pose(r, e, ctx); deg = 90-math.degrees(e); z = C['bar_z']
    r.torso(P, Rt, neck=Rx(-deg+10), head=Rx(-deg+18), scap={s: (lerp(1.0, -1.0, u), lerp(3.0, -3.5, u)) for s, _ in SIDES}); fixed = []
    for s, sg in SIDES:
        A = V((sg*C['ax'], ctx.Ay, C['Az'])); d = V((0, math.cos(e), math.sin(e))); H = r.chain_head('thigh_'+s); K = A+(H-A)*(r.L_S/(r.L_S+r.L_T))
        r.leg_ik(s, A, V((sg*0.1, -math.sin(e), math.cos(e))), V((0, -math.sin(e), math.cos(e))), 0.0, -(90.0-math.degrees(e))); fixed.append('foot_'+s)
    lat = V((0, 1, 0)) if C['prop'] == 'ring' else None
    for s, sg in SIDES:
        G = V((sg*C['grip'], ctx.By, z)); Sh = r.chain_head('upperarm_'+s); F = (G-Sh).normalized()
        pole = V((sg*lerp(C['pole0'][0], C['pole1'][0], u), lerp(C['pole0'][1], C['pole1'][1], u), lerp(C['pole0'][2], C['pole1'][2], u)))
        r.arm(s, G, F, pole, lat, 0.9995); r.fingers(s)
    return dict(bar=V((0, ctx.By, z)) if C['prop'] != 'ring' else None, load=[], fixed=fixed)

# ════ 실 로우(수평 벤치에 엎드림)·인클라인 실 로우·체스트 서포티드 T바 — 가슴을 패드에 대고 늘어뜨린 팔로 당긴다 ════
SL = dict(load='bar', inc=0.0, T=0.82, grip=0.26, zH=0.86, up=0.20, back=0.06, reach=0.975, pole0=(0.4, 0.3, 1.0), pole1=(0.6, 0.4, 1.0), ax=0.15)
def sl_setup(ctx):
    C = dict(SL); C.update(ctx.vars); ctx.C = C; M_ = ctx.mats; r = ctx.rig; inc = math.radians(C['inc']); R = Rx(90-C['inc']); ctx.R = R
    n = V((0, math.sin(inc), math.cos(inc))); p0 = r.head0('pelvis')
    ch = [v for v, w in zip(ctx.rest_v, ctx.weights) if w.get('spine_03', 0)+w.get('spine_02', 0)+w.get('spine_01', 0) > 0.5 and abs(v.x) < 0.12]
    if C['inc'] == 0: P0 = V((0, 0, 0)); d0 = C['T']
    else: P0 = V((0, 0, C['zH']-r.HIP_OFF.z)); d0 = None
    m = min(n.dot(P0+R@(v-p0)) for v in ch)
    if d0 is None: d0 = m   # 인클라인: 골반 높이를 정하고 패드 면을 몸에 맞춘다
    P = P0+n*(d0-m); ctx.P = P
    cpt = P+R@(V((0, 0, p0.z+0.28))-p0); cpt = cpt-n*(n.dot(cpt)-d0)-n*0.035
    pad = box("pad", (0.26 if C['inc'] == 0 else C.get('pw', 0.26), 1.35 if C['inc'] == 0 else C.get('pl', 0.62), 0.07), cpt+(R@V((0, 0, -0.375)) if C['inc'] == 0 else V((0, 0, 0))), M_.PAD, 0.024); pad.rotation_euler = (-inc, 0, 0)   # 수평 벤치는 다리까지 받친다(발목 앞에서 끝)
    if C['inc'] == 0:
        for y_ in (cpt.y-0.20, cpt.y+0.95): box("post", (0.07, 0.07, C['T']-0.08), (0, y_, (C['T']-0.08)/2), M_.FRAME); box("ft", (0.50, 0.09, 0.04), (0, y_, 0.02), M_.FRAME)
    else:
        box("post", (0.07, 0.07, cpt.z-0.05), (0, cpt.y+0.10, (cpt.z-0.05)/2), M_.FRAME); box("ft", (0.50, 0.09, 0.04), (0, cpt.y+0.10, 0.02), M_.FRAME)
    ld = C['load']
    if ld == 'bar': ctx.BAR = barbell(ctx.col, M_)
    elif ld == 'db': from families.reps import dbs; dbs(ctx)
    else:   # T바: 앞쪽 바닥 축에서 오는 레버 + 넓은 중립 손잡이
        ctx.LM = box("lm", (0.05, 1.0, 0.05), (0, 0, 0), M_.FRAME, 0.004); ctx.HB = cyl("shaft_hb", 0.016, 2*C['grip']+0.10, M_.STEEL); ctx.PIV = V((0, cpt.y-1.05, 0.10)); box("base", (0.30, 0.30, 0.06), (0, cpt.y-1.05, 0.03), M_.FRAME)
def seal(r, t, ctx):
    C = ctx.C; u = timing(t); P = ctx.P; R = ctx.R; inc = C['inc']; ld = C['load']
    r.torso(P, R, neck=Rx(90-inc-25), head=Rx(90-inc-45), scap={s: (lerp(2.5, -1.0, u), lerp(3.0, -3.5, u)) for s, _ in SIDES}); fixed = ['pelvis', 'spine_03']
    for s, sg in SIDES:
        H = r.chain_head('thigh_'+s)
        if inc == 0:
            d = R@V((0, 0, -1)); A = V((sg*0.11, 0, 0))+H+d*(r.L_T+r.L_S)*0.99; A.x = sg*0.11; r.leg_ik(s, A, V((sg*0.1, 0, -1)), V((0, 0, -1)), 0.0, 80.0); fixed.append('foot_'+s)
        else:
            L = (r.L_T+r.L_S)*0.96; dz = H.z-r.ANK_Z-0.03; ball = V((sg*C['ax'], H.y+sqrt0(L**2-dz**2)+0.10, r.head0('ball_l').z)); A = r.ankle_from_ball(s, ball, 0.0, 50.0)
            r.leg_ik(s, A, V((sg*0.1, -0.3, -1)), V((0, -1, 0)), 0.0, 50.0, True); fixed.append('ball_'+s)
    F = V((0, 0, -1)); lat = V((0, -1, 0)) if ld in ('db', 'tbar') else None; Lr = (r.L_U+r.L_F)*C['reach']; G = {}; load = []
    for s, sg in SIDES:
        Sh = r.chain_head('upperarm_'+s); gx = sg*C['grip']; W0 = V((gx, Sh.y, Sh.z-sqrt0(Lr**2-(gx-Sh.x)**2))); W1 = V((gx, Sh.y+C['back'], Sh.z-C['up']))
        W = arc(W0, W1, u, V((0, 0.03, 0))); G[s] = grip_w(r, s, W, F, lat)
        pole = V((sg*lerp(C['pole0'][0], C['pole1'][0], u), lerp(C['pole0'][1], C['pole1'][1], u), lerp(C['pole0'][2], C['pole1'][2], u)))
        r.arm(s, G[s], F, pole, lat, 0.9995); r.fingers(s)
        if ld == 'db': hold(ctx, s, G[s], V((0, 1, 0))); load.append((G[s], DB_KG))
    bar = None; c = (G['l']+G['r'])/2; c.x = 0
    if ld == 'bar': ctx.BAR.location = c; bar = c; load = [(c, BAR_KG)]
    elif ld == 'tbar':
        ctx.HB.location = c; d = c-ctx.PIV; ctx.LM.location = ctx.PIV+d/2; ctx.LM.rotation_mode = 'QUATERNION'; ctx.LM.rotation_quaternion = d.normalized().to_track_quat('Y', 'Z'); ctx.LM.scale = (1, d.length, 1); load = [(c, BAR_KG)]
    return dict(bar=bar, load=load, fixed=fixed)

# ════ 레니게이드 로우(덤벨·케틀벨) — 손잡이 위 플랭크에서 오른손만 엉덩이 옆으로 당긴다 ════
RG = dict(load='db', ax=0.22, hand_x=0.20, Wz=0.075, pitch=55.0, top=1.012, up=0.30, back=0.16)
def rg_setup(ctx):
    from families.reps import pu_pose
    C = dict(RG); C.update(ctx.vars); ctx.C = C; r = ctx.rig; yaw = 6.0; ball = V((C['ax'], 0.0, r.head0('ball_l').z+0.016)); ctx.ball = ball; ctx.A_l = r.ankle_from_ball('l', ball, yaw, C['pitch']); ctx.yaw = yaw
    W_z = C['Wz']+r.GRIP_F; ctx.Wz = W_z; S0 = r.shoulder_local('l')-r.head0('pelvis')
    def sh(e):
        P, Rt = pu_pose(r, e, ctx); return P+Rt@S0
    lo, hi = 0.05, 0.75; top = (r.L_U+r.L_F)*C['top']
    for _ in range(40):
        m = (lo+hi)/2
        if sh(m).z-W_z < top: lo = m
        else: hi = m
    ctx.e = (lo+hi)/2; ctx.Wy = sh(ctx.e).y-0.01
    if C['load'] == 'db': from families.reps import dbs; dbs(ctx)
    else: ctx.KB = {s: kettlebell(ctx, "kb_"+s) for s, _ in SIDES}
def renegade(r, t, ctx):
    from families.reps import pu_pose
    C = ctx.C; u = timing(t); e = ctx.e; P, Rt = pu_pose(r, e, ctx); deg = 90-math.degrees(e)
    r.torso(P, Rt, neck=Rx(deg-8), head=Rx(deg-14), scap={'l': (0.0, 1.0), 'r': (lerp(0.0, -1.0, u), lerp(1.5, -3.5, u))}); fixed = []
    for s, sg in SIDES:
        ball = V((sg*C['ax'], 0.0, ctx.ball.z)); A = r.ankle_from_ball(s, ball, sg*ctx.yaw, C['pitch']); r.leg_ik(s, A, V((sg*0.08, -0.2, -1)), Rz(sg*ctx.yaw)@V((0, -1, 0)), sg*ctx.yaw, C['pitch'], True); fixed.append('ball_'+s)
    F = V((0, -1, 0)); lat = V((0, 0, 1)); load = []
    for s, sg in SIDES:   # 손잡이는 앞뒤(Y)로 놓인다 — 손바닥이 안쪽(중립)
        W0 = V((sg*C['hand_x'], ctx.Wy, ctx.Wz))
        if s == 'r':
            Sh = r.chain_head('upperarm_r'); W1 = V((-C['hand_x']-0.02, Sh.y+C['back'], Sh.z-C['up'])); W = arc(W0, W1, u, V((-0.02, 0.0, 0.0)))
        else: W = W0
        Fz = V((0, 0, -1)); G = grip_w(r, s, W, Fz, V((0, -1, 0)))
        r.arm(s, G, Fz, V((sg*0.4, 0.5, 0.6)) if s == 'l' else V((-0.35, 0.35, 1.0)), V((0, -1, 0)), 0.9995); r.fingers(s)
        if s == 'r': r.targets.pop('G_r', None); r.targets.pop('Gnow_r', None)   # 들어 올리는 손은 고정 쥔 점이 아니다
        if C['load'] == 'db': hold(ctx, s, G, V((0, 1, 0)))
        else: place_obj(ctx.KB[s], G+V((0, 0, -0.035)))
        load.append((G, DB_KG if C['load'] == 'db' else KB_KG))
    fixed.append('hand_l')
    return dict(bar=None, load=load, fixed=fixed)

SOLVERS = {'row': (row_setup, row), 'one_arm_row': (or_setup, one_arm_row), 'upright': (ur_setup, upright), 'hpull': (hp_setup, hpull), 'puv': (puv_setup, puv), 'lpv': (lpv_setup, lpv), 'srow': (sr_setup, srow), 'sapd': (sa_setup, sapd), 'pullover': (po_setup, pullover), 'inv_row': (ir_setup, inv_row), 'seal': (sl_setup, seal), 'renegade': (rg_setup, renegade)}
