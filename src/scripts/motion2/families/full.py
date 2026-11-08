# SPDX-License-Identifier: GPL-3.0-or-later
"""역도·전신·유산소 묶음 계산식(SPEC-040 Phase 13). 대부분 루프(cycle)라 t 0 과 1 자세가 같아야 한다 — 위상 φ=2πt 의 주기 함수로 짠다.
좌표: X 왼쪽+, -Y 앞, Z 위. Rx(+)=앞으로 숙임. 제자리 동작(러닝머신처럼 발이 뒤로 미끄러진다)."""
import math
from mathutils import Vector as V
from rig import Rx, Ry, Rz, Rot, lerp, sstep, sqrt0
from scene import PLATE_R, barbell, box, cyl
from families.reps import SIDES, BAR_KG, DB_KG, dumbbell, hold, rot_to, wire, wire_to, grip_w, jointed, hang, stand_P, plant
from families.squat_lunge import kettlebell, place_obj, KB_KG, sq_frame, load_setup, arms, JP

def ph(t, n=1.0, off=0.0): return (t*n+off) % 1.0
def tri(x): return 1-abs(2*(x % 1.0)-1)   # 0→1→0 삼각파

# ════ 걷기·달리기 공용: 제자리 보행 주기 ════
# n 루프당 걸음 주기 수, beta 디딤 비율(걷기 0.6, 달리기 0.38), s 보폭 반(발이 엉덩이 앞뒤로 가는 거리), h 흔드는 발 높이, kick 흔드는 발이 엉덩이 쪽으로 차오르는 정도,
# knee_hi 흔드는 무릎을 앞으로 들어 올리는 정도, lean 몸통 앞 기울기, arm 팔 흔들기 진폭, elbow 팔꿈치 굽힘, k_mid 디딤 중간 다리 펴짐(1=곧음), fly 체공 높이,
# load hang_db·hang_kb·trap·yoke·suit·sled_push·sled_pull·stair·tread·none, back 뒤로 걷기
GT = dict(n=1.0, beta=0.6, s=0.30, h=0.07, kick=0.0, knee_hi=0.0, lean=3.0, arm=22.0, elbow=18.0, k_mid=0.997, k_end=0.993, fly=0.0, load='none', back=False, ax=0.10, yaw=6.0, abd=0.10, lift=24.0, step=0.0)
def gait_setup(ctx):
    C = dict(GT); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; ld = C['load']
    ctx.BALL0 = r.head0('ball_l'); ctx.FLOOR = ctx.BALL0.z; ctx.ZT = gait_ztab(r, ctx, C, Rx(C['lean']), (0.0, r.head0('pelvis').y+C.get('py', 0.0)))
    if ld in ('hang_db', 'suit'): ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES} if ld == 'hang_db' else {'r': dumbbell(ctx, "db_r")}
    if ld == 'hang_kb': ctx.KB = {s: kettlebell(ctx, "kb_"+s) for s, _ in SIDES}
    if ld == 'trap':
        ctx.TR = [cyl("hdl", 0.016, 0.20, M_.STEEL, axis='Y') for _ in range(2)]+[cyl("side", 0.02, 0.62, M_.STEEL, axis='Y') for _ in range(2)]+[cyl("trs", 0.025, 0.40, M_.STEEL) for _ in range(2)]+[cyl("plate", PLATE_R, 0.05, M_.RUBBER) for _ in range(2)]+[cyl("front", 0.02, 0.70, M_.STEEL), cyl("back", 0.02, 0.70, M_.STEEL)]
    if ld == 'yoke': ctx.YK = [cyl("yb", 0.025, 1.30, M_.STEEL)]+[box("yup", (0.07, 0.07, 1.40), (0, 0, 0), M_.FRAME) for _ in range(2)]+[cyl("plate", PLATE_R, 0.06, M_.RUBBER) for _ in range(2)]+[box("yft", (0.08, 0.50, 0.06), (0, 0, 0), M_.FRAME) for _ in range(2)]
    if ld == 'stair':
        for i in range(4): box("stp", (0.70, 0.30, 0.04), (0, r.ANK_Y-0.02-0.30*i, ctx.FLOOR-0.03+C['climb']*i*0.0), M_.PAD, 0.01)
        for sg in (-1, 1): box("upr", (0.06, 0.06, 1.15), (sg*0.42, r.ANK_Y-0.35, 0.575), M_.FRAME); box("rail", (0.05, 0.60, 0.05), (sg*0.42, r.ANK_Y-0.10, 1.12), M_.FRAME)
        box("console", (0.80, 0.14, 0.30), (0, r.ANK_Y-0.60, 1.30), M_.FRAME); box("base", (0.90, 0.90, 0.06), (0, r.ANK_Y-0.10, -0.05), M_.FRAME)
    if ld == 'tread':
        box("belt", (0.70, 1.70, 0.12), (0, r.ANK_Y+0.05, -0.06), M_.PAD, 0.02); box("deck", (0.84, 2.00, 0.06), (0, r.ANK_Y+0.10, -0.15), M_.FRAME)
        for sg in (-1, 1): box("upr", (0.06, 0.06, 1.20), (sg*0.40, r.ANK_Y-0.80, 0.60), M_.FRAME); box("rail", (0.05, 0.50, 0.05), (sg*0.40, r.ANK_Y-0.58, 1.00), M_.FRAME)
        box("console", (0.80, 0.14, 0.30), (0, r.ANK_Y-0.82, 1.28), M_.FRAME)
    if ld in ('sled_push', 'sled_pull'):
        ctx.SLED = [box("sled", (0.70, 0.90, 0.10), (0, 0, 0), M_.FRAME), cyl("sp", 0.025, 0.36, M_.STEEL, axis='Z'), cyl("plate", PLATE_R, 0.06, M_.RUBBER)]
        if ld == 'sled_push': ctx.SLED += [cyl("pole", 0.025, 1.10, M_.STEEL, axis='Z') for _ in range(2)]
        else: ctx.ST = [wire(ctx, "strap") for _ in range(2)]; ctx.HD = [cyl("hdl", 0.016, 0.12, M_.STEEL) for _ in range(2)]
def gait_feet(r, ctx, C, t):
    """두 발의 앞꿈치 위치·발 각도. 디딤 중이면 앞꿈치가 바닥에서 뒤로 미끄러진다(제자리)."""
    out = {}; sgn = -1 if C['back'] else 1
    for s, sg in SIDES:
        p = ph(t, C['n'], 0.0 if s == 'l' else 0.5); b = C['beta']; yc = ctx.BALL0.y+C['step']
        if p < b:   # 디딤: 앞(-y)에서 뒤(+y)로
            q = p/b; y = yc+sgn*lerp(-C['s'], C['s'], q); z = ctx.FLOOR; pitch = C['lift']*sstep(0.55, 1.0, q) if not C['back'] else C['lift']*(1-sstep(0.0, 0.45, q)); st = True
        else:       # 흔들기: 들어서 앞으로
            q = (p-b)/(1-b); y = yc+sgn*lerp(C['s'], -C['s'], sstep(0.0, 1.0, q)); arc = math.sin(math.pi*q)
            z = ctx.FLOOR+C['h']*arc+C['kick']*math.sin(math.pi*min(1.0, q*1.6))**2+C['knee_hi']*math.sin(math.pi*q)**2; y += sgn*C['kick']*0.55*math.sin(math.pi*min(1.0, q*1.6))**2
            pitch = (C['lift']*(1-sstep(0.0, 0.5, q)) if not C['back'] else C['lift']*sstep(0.5, 1.0, q))+C['kick']*120*math.sin(math.pi*min(1.0, q*1.6))**2+C['knee_hi']*60*math.sin(math.pi*q)**2; st = False
        if C.get('climb'):   # 계단 오르기: 디딤 발은 위에서 아래로 내려가고(계단이 내려간다) 흔드는 발은 다음 칸으로 올라간다
            y = yc+(0.03*(p/b if st else 1-q))+C['s']*0; z = ctx.FLOOR+(C['climb']*(1-p/b) if st else C['climb']*sstep(0.0, 1.0, q)+0.06*math.sin(math.pi*q)); pitch = (0.0 if st else 10*math.sin(math.pi*q))
        if not st and pitch > 0: z += 0.07*math.sin(math.radians(min(pitch, 90.0)))   # 발끝이 내려가도 바닥을 긁지 않게(발가락 길이만큼)
        ball = V((sg*C['ax'], y, z)); A = r.ankle_from_ball(s, ball, sg*C['yaw'], pitch); out[s] = (A, pitch, st, p)
    return out
def gait_zc(r, ctx, C, t, R, P_xy):
    """디딤 다리가 닿는 골반 높이의 상한(디딤 중간엔 무릎을 k_mid, 양 끝은 k_end 만큼 편다). 디딤 다리가 없으면 None."""
    L = r.L_T+r.L_S; zs = []; feet = gait_feet(r, ctx, C, t)
    for s, sg in SIDES:
        A, pitch, st, p = feet[s]
        if not st: continue
        q = p/C['beta']; k = lerp(C['k_end'], C['k_mid'], math.sin(math.pi*q))
        off = R@V((sg*abs(r.HIP_OFF.x), r.HIP_OFF.y, r.HIP_OFF.z)); H = V((P_xy[0], P_xy[1], 0))+off
        zs.append(A.z+sqrt0((k*L)**2-(H.x-A.x)**2-(H.y-A.y)**2)-off.z)
    return min(zs) if zs else None
def gait_ztab(r, ctx, C, R, P_xy, N=240):
    """골반 높이 표: 디딤 상한을 최소 필터(폭 2w) 뒤 평균(폭 w)한다 — 어느 시각에도 상한을 넘지 않으면서 부드럽다(디딤 다리가 바뀌는 순간 튀지 않게)."""
    c = [gait_zc(r, ctx, C, i/N, R, P_xy) for i in range(N)]; big = max(x for x in c if x is not None)
    c = [x if x is not None else big for x in c]; w = max(2, int(N*C.get('zw', 0.06)))
    m = [min(c[(i+j) % N] for j in range(-w, w+1)) for i in range(N)]; h = w//2
    return [sum(m[(i+j) % N] for j in range(-h, h+1))/(2*h+1) for i in range(N)]
def gait_P(r, ctx, C, t, R, P_xy):
    feet = gait_feet(r, ctx, C, t); tab = ctx.ZT; N = len(tab); x = (t % 1.0)*N; i = int(x); f = x-i; z = lerp(tab[i % N], tab[(i+1) % N], f)
    z += C['fly']*math.sin(math.pi*ph(t, C['n']*2))**2*0   # 체공은 표의 평균화로 대신한다(값을 더하면 디딤 다리가 닿지 않는다)
    return V((P_xy[0], P_xy[1], z)), feet
def swing_arm(r, s, sg, al, el, C, abd=None):
    """팔 흔들기: al 어깨 굽힘(+앞), el 팔꿈치 굽힘. 주먹은 엄지가 앞."""
    abd = C['abd'] if abd is None else abd; S = r.chain_head('upperarm_'+s); a = math.radians(al); b = math.radians(al+el)
    d = V((sg*abd, -math.sin(a), -math.cos(a))).normalized(); E = S+d*r.L_U; d2 = V((-sg*0.06*min(1, el/60), -math.sin(b), -math.cos(b))).normalized()
    lat = V((0, -math.cos(b), math.sin(b))); G = jointed(r, s, E, E+d2*r.L_F, d2, lat, V((sg*0.2, math.cos(a), -math.sin(a)))); r.fingers(s, 0.75); return G
def gait(r, t, ctx):
    C = ctx.C; ld = C['load']; th = C['lean']; n = C['n']; tw = 4.0*math.sin(2*math.pi*ph(t, n))   # 골반이 앞으로 나오는 다리 쪽으로 조금 돈다
    Rp = Rz(-tw)@Rx(th); P0 = r.head0('pelvis'); P_xy = (0.0, P0.y+C.get('py', 0.0))
    P, feet = gait_P(r, ctx, C, t, Rp, P_xy)
    sc = (0.0, 0.0)
    if ld == 'yoke': sc = (1.5, -1.0)
    r.torso(P, Rp, Rz(-tw*0.5)@Rx(th), Rz(tw*0.2)@Rx(th), Rz(tw*0.6)@Rx(th), Rx(th*0.4+C.get('neck', 0.0)), Rx(th*0.2+C.get('neck', 0.0)), scap={s: sc for s, _ in SIDES})
    for s, sg in SIDES:
        A, pitch, st, p = feet[s]; H = r.chain_head('thigh_'+s); Lm = (r.L_T+r.L_S)*0.99
        if (A-H).length > Lm: A = H+(A-H).normalized()*Lm   # 흔드는 발이 닿지 않으면 들어 올린다(디딤 다리는 표가 보장)
        r.leg_ik(s, A, V((sg*0.12, -1, 0.05 if not C['back'] else 0.05)), Rz(sg*C['yaw'])@V((0, -1, 0)), sg*C['yaw'], pitch, st)
    load = []; bar = None
    if ld == 'stair':   # 손은 양옆 손잡이를 가볍게 쥔다(세계 고정)
        for s, sg in SIDES: G = V((sg*0.42, r.ANK_Y-0.02, 1.15)); r.arm(s, G, V((0, -1, -0.2)).normalized(), V((sg*0.6, 0.6, -0.6)), V((0, 0, 1)), 0.9995); r.fingers(s)
    elif ld in ('none', 'tread'):
        for s, sg in SIDES:
            pl = ph(t, n, 0.0 if s == 'l' else 0.5); al = -C['arm']*math.cos(2*math.pi*pl)*(-1 if C['back'] else 1); swing_arm(r, s, sg, al+C.get('arm0', 0.0), C['elbow'], C)
    elif ld in ('hang_db', 'hang_kb', 'suit'):
        for s, sg in SIDES:
            if ld == 'suit' and s == 'l': pl = ph(t, n, 0.0); swing_arm(r, s, sg, -8*math.cos(2*math.pi*pl), 14.0, C, 0.16); continue
            G = hang(r, s, sg, C.get('hx', 0.11), 0.0, lat=V((0, -1, 0)), reach=0.965, curl=1.0)
            if ld == 'hang_kb': place_obj(ctx.KB[s], G+V((0, 0, -0.005)), None); load.append((G, KB_KG))
            else: hold(ctx, s, G, V((0, 1, 0))); load.append((G, DB_KG*2))
    elif ld == 'trap':
        Gs = {}
        for s, sg in SIDES: Gs[s] = hang(r, s, sg, 0.11, 0.0, lat=V((0, -1, 0)), reach=0.965, curl=1.0)
        c = (Gs['l']+Gs['r'])/2; zc = c.z; yc = c.y; hx = abs(Gs['l'].x-Gs['r'].x)/2
        objs = ctx.TR
        for i, sg in enumerate((1, -1)):
            objs[i].location = V((sg*hx, yc, zc)); objs[2+i].location = V((sg*(hx+0.07), yc, zc-0.02)); objs[4+i].location = V((sg*(hx+0.30), yc, zc-0.02)); objs[6+i].location = V((sg*(hx+0.42), yc, zc-0.02))
        objs[8].location = V((0, yc-0.31, zc-0.02)); objs[9].location = V((0, yc+0.31, zc-0.02)); load.append((c, 80.0))
        for o in objs[2:4]: o.rotation_euler = (math.pi/2, 0, 0)
    elif ld == 'yoke':   # 요크: 바를 등 위(승모)에 올리고 손으로 바깥 기둥을 잡는다
        Sl, Sr = r.chain_head('upperarm_l'), r.chain_head('upperarm_r'); Ns = r.chain_head('neck_01'); bar = Ns+Rp@V((0, 0.07, -0.02)); objs = ctx.YK; objs[0].location = bar
        for i, sg in enumerate((1, -1)):
            objs[1+i].location = V((sg*0.58, bar.y, bar.z-0.66)); objs[3+i].location = V((sg*0.70, bar.y, bar.z-0.95)); objs[5+i].location = V((sg*0.58, bar.y, bar.z-1.33)); objs[3+i].rotation_euler = (0, math.pi/2, 0)
        for s, sg in SIDES: r.arm(s, bar+V((sg*0.50, 0, 0)), Rp@V((sg*0.25, 0.25, 1)).normalized(), Rp@V((sg*0.7, 0.6, -0.7)), None, 0.9995); r.fingers(s)
        load.append((bar, 120.0))
    elif ld == 'sled_push':   # 기둥을 팔 펴서 밀며 몸을 앞으로 기울인다
        S = r.chain_head('upperarm_l'); G0 = V((0, S.y-0.42, S.z-0.22)); o = ctx.SLED; base = V((0, G0.y-0.55, 0.05)); o[0].location = base+V((0, -0.2, 0)); o[1].location = base+V((0, -0.2, 0.22)); o[2].location = base+V((0, -0.2, 0.13)); o[2].rotation_euler = (0, 0, 0)
        for i, (s, sg) in enumerate(SIDES):
            G = V((sg*0.22, G0.y, G0.z)); o[3+i].location = V((sg*0.22, G0.y-0.02, (G0.z+0.10)/2+0.05)); o[3+i].scale = (1, 1, (G0.z+0.10)/1.10)
            r.arm(s, G, V((0, -0.2, 1)).normalized(), V((sg*0.7, 0.5, -0.6)), None, 0.9995); r.fingers(s)
    elif ld == 'sled_pull':   # 뒤로 걸으며 끈을 당긴다(팔은 앞으로 편다)
        S = r.chain_head('upperarm_l'); o = ctx.SLED; base = V((0, S.y-2.4, 0.05)); o[0].location = base; o[1].location = base+V((0, 0, 0.22)); o[2].location = base+V((0, 0, 0.13)); o[2].rotation_euler = (0, 0, 0)
        for i, (s, sg) in enumerate(SIDES):
            G = V((sg*0.16, S.y-0.42, S.z-0.30)); r.arm(s, G, V((sg*0.1, -1, -0.35)).normalized(), V((sg*0.8, 0.4, -0.5)), V((0, 0, 1)), 0.9995); r.fingers(s)
            ctx.HD[i].location = G; wire_to(ctx.ST[i], G+V((0, -0.02, 0)), base+V((sg*0.20, 0.42, 0.06)))
    return dict(bar=bar, load=load, fixed=[])

# ════ 역도 공용(클린·저크·스내치·스러스터): reps.clean 의 키 표 방식을 넓힌다 ════
# 키 = [t, by(발목 기준 바 y), bz(바 z 또는 'F'바닥·'C'받기·'S'선 랙·'B'블록, 'S-0.1'처럼 더하기), th 몸통 기울기, heel 뒤꿈치, w 랙 무게(0 팔 편 당기기·1 어깨 앞),
#        o 머리 위 무게(1 이면 bz 는 골반을 정하는 가상의 랙 높이), sx 스플릿 폭, sh 으쓱]
# load bar·db·kb·db1·kb1(오른손 하나)·ball, g [당기기, 랙, 머리 위] 손 간격(반), oh 머리 위 바의 y(어깨 기준)
OL = dict(ax=0.14, yaw=8.0, g=[0.27, 0.27, 0.27], oh=0.03, load='bar', zF=None, blocks=None, reach=0.985, ball_r=0.17)
def oly_setup(ctx):
    C = dict(OL); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; ld = C['load']
    if ld == 'bar': ctx.BAR = barbell(ctx.col, M_)
    if ld in ('db', 'db1'): ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES if ld == 'db' or s == 'r'}
    if ld in ('kb', 'kb1'): ctx.KB = {s: kettlebell(ctx, "kb_"+s) for s, _ in SIDES if ld == 'kb' or s == 'r'}
    if ld == 'ball':
        import bpy
        bpy.ops.mesh.primitive_uv_sphere_add(radius=C['ball_r'], location=(0, 0, 0), segments=48, ring_count=24); ctx.BALL = bpy.context.object; ctx.BALL.data.materials.append(M_.RUBBER)
        [setattr(q, 'use_smooth', True) for q in ctx.BALL.data.polygons]
        if C.get('wall'): box("wall", (1.6, 0.10, 3.4), (0, r.ANK_Y+C['wall'], 1.7), M_.FRAME, 0.01); box("target", (0.5, 0.04, 0.5), (0, r.ANK_Y+C['wall']+0.07, C['tz']), M_.PAD, 0.01)
    P = stand_P(r, C['ax']); ds = r.shoulder_local('l')-r.head0('pelvis'); zs = P.z+ds.z
    zF = C['zF'] if C['zF'] is not None else {'bar': PLATE_R-0.012, 'db': 0.075, 'db1': 0.075, 'kb': 0.20, 'kb1': 0.20, 'ball': C['ball_r']}[ld]
    ctx.Z = {'F': zF, 'C': zs-0.11, 'S': zs+0.03, 'B': C['blocks'] or 0.5}
    if C['blocks'] and ld == 'bar':
        h = C['blocks']-PLATE_R
        for sg in (-1, 1): box("block", (0.40, 0.55, h), (sg*0.75, r.ANK_Y-0.145, h/2), M_.PAD, 0.01)
    def zv(v):
        if not isinstance(v, str): return v
        return ctx.Z[v[0]]+(float(v[1:]) if len(v) > 1 else 0.0)
    ctx.K = [[k[0], k[1], zv(k[2])]+list(k[3:]) for k in C['keys']]
def oly_val(ctx, t, i):
    K = ctx.K
    def lin(q):
        q = q % 1.0
        for a, b in zip(K, K[1:]):
            if q <= b[0]: f_ = (q-a[0])/max(1e-6, b[0]-a[0]); return lerp(a[i], b[i], f_)
        return K[-1][i]
    w = ctx.C.get('smw', 0.016); return sum(lin(t+(j-3)*w) for j in range(7))/7
def oly(r, t, ctx):
    C = ctx.C; ld = C['load']; ax, yaw = C['ax'], C['yaw']
    by = r.ANK_Y+oly_val(ctx, t, 1); bz = oly_val(ctx, t, 2); th = oly_val(ctx, t, 3); heel = max(0.0, oly_val(ctx, t, 4)); w = min(1, max(0, oly_val(ctx, t, 5))); o = min(1, max(0, oly_val(ctx, t, 6)))
    sx = max(0.0, oly_val(ctx, t, 7)); sh = oly_val(ctx, t, 8)+3.0*o; pp = 1.5*min(1.0, max(0.0, (th-15)/35))*(1-w)
    g = lerp(lerp(C['g'][0], C['g'][1], w), C['g'][2], o)
    Rt = Rx(th); ball0 = r.head0('ball_l'); off = Rt@r.HIP_OFF; S0 = r.shoulder_local('l', sh, pp); ds = Rt@(S0-r.head0('pelvis'))
    feet = {}
    for s, sg in SIDES:   # 스플릿: 왼발 앞, 오른발 뒤(뒤꿈치 듦)
        dy = -0.55*sx if s == 'l' else 0.50*sx; hl = heel if s == 'l' else heel+70*min(1.0, sx/0.7)
        feet[s] = (r.ankle_from_ball(s, V((sg*ax, ball0.y+dy, ball0.z)), sg*yaw, hl), hl)
    Wp = V((g, by-r.GRIP_N, bz+r.GRIP_F)); Sy = by+0.03*min(1.0, max(0.0, th)/40); L_ = (r.L_U+r.L_F)*C['reach']; Sz = Wp.z+sqrt0(L_**2-(S0.x-g)**2-(Sy-Wp.y)**2); P1 = V((0, Sy-ds.y, Sz-ds.z))
    P2 = V((0, by+lerp(C.get('rk', 0.11), C.get('rko', 0.11), o)-ds.y, bz-0.03-ds.z)); P = P1.lerp(P2, w); lim = (r.L_T+r.L_S)*0.992
    for s, sg in SIDES:   # 두 다리 모두 닿게(높이만 낮춘다)
        A = feet[s][0]; o_s = Rt@V((sg*abs(r.HIP_OFF.x), r.HIP_OFF.y, r.HIP_OFF.z)); H = P+o_s; d_ = H-A
        if d_.length > lim: P.z = A.z+sqrt0(lim**2-(H.x-A.x)**2-(H.y-A.y)**2)-o_s.z
    r.torso(P, Rt, neck=Rx(th*0.45-6*o), head=Rx(th*0.25-4*o), scap={s: (sh, pp) for s, _ in SIDES})
    for s, sg in SIDES:
        A, hl = feet[s]; r.leg_ik(s, A, V((sg*0.25, -1, 0)), Rz(sg*yaw)@V((0, -1, 0)), sg*yaw, hl, True)
    S = r.chain_head('upperarm_l'); bar = V((0, by, bz))
    if o > 0:
        top = V((0, S.y+C['oh'], 0)); top.z = S.z+sqrt0(((r.L_U+r.L_F)*0.985)**2-(C['g'][2]-S.x)**2-C['oh']**2)+r.GRIP_F; bar = bar.lerp(top, sstep(0.0, 1.0, o))
    phi = lerp(C.get('phr', 225)*w, C.get('pho', 205), o); ph_ = math.radians(phi); F = V((0, -math.sin(ph_), -math.cos(ph_)))
    pw = lerp(C.get('pw', 1.0), 1.0, sstep(C['pwt'][0], C['pwt'][1], t) if C.get('pwt') else 0.0)*w; up = C.get('pup', 0.0)*math.sin(math.pi*o); pole = lambda sg: V((sg*0.8, lerp(lerp(1.0, -0.1, pw), 0.35, o), lerp(lerp(0.0, -0.9, pw), -0.4, o)+up))   # 스내치(pw 0)는 랙 팔꿈치를 거치지 않는다 · pwt 구간 뒤(머리 위에서 내릴 때)는 랙 길
    load = []; m = max(w, o)
    for s, sg in SIDES:
        if ld in ('db1', 'kb1', 'ball') and s == 'l' and ld != 'ball': hang(r, s, sg, 0.16, -0.02, reach=0.97, curl=0.4); continue
        G = bar+V((sg*g, 0, 0))
        if ld == 'bar': r.arm(s, G, F, pole(sg), None, 0.9995); r.fingers(s)
        elif ld == 'ball': r.arm(s, G, V((-sg*0.4, -math.sin(ph_)*0.9, -math.cos(ph_)*0.9)).normalized(), pole(sg), V((0, 0, 1)) if False else None, 0.9995); r.fingers(s, 0.3)
        else:
            lat = V((0, -math.cos(ph_), math.sin(ph_))); r.arm(s, G, F, pole(sg), lat, 0.9995); r.fingers(s)
            if ld in ('db', 'db1'): hold(ctx, s, G, lat); load.append((G, DB_KG))
            else:   # 당기기: 손 아래로 매달림 · 랙·머리 위: 종(bell)이 아래팔 바깥에 얹힘
                d = V((0, 0, -1)).lerp(V((sg*0.9, 0.35, -0.25)), sstep(0.0, 1.0, m)).normalized(); Rk = V((0, 0, -1)).rotation_difference(d).to_matrix()@Rz(90)
                place_obj(ctx.KB[s], G+F*0.035*(1-m)+V((sg*0.11, 0.02, 0))*m, Rk); load.append((G, KB_KG))
    if ld == 'bar': ctx.BAR.location = bar; load = [(bar, BAR_KG)]
    if ld == 'ball':
        bl = bar.copy(); fl = C.get('fly'); raw = lambda tq: V((0, r.ANK_Y+oly_val(ctx, tq, 1), oly_val(ctx, tq, 2)))
        if fl and fl[0] == 'wall' and fl[1] <= t <= fl[2]:   # 벽 표적까지 던졌다 받는다
            q = (t-fl[1])/(fl[2]-fl[1]); A_, B_ = raw(fl[1]), raw(fl[2]); bl = A_.lerp(B_, q); bl.z += 4*(fl[3]-(A_.z+B_.z)/2)*q*(1-q); bl.y += 4*(r.ANK_Y+fl[4]-(A_.y+B_.y)/2)*q*(1-q)
        if fl and fl[0] == 'slam' and fl[1] <= t <= fl[3]:   # 바닥에 내리꽂고 튀었다가 집는다
            Fp = raw(fl[3]); A_ = raw(fl[1])
            if t < fl[2]: bl = A_.lerp(Fp, ((t-fl[1])/(fl[2]-fl[1]))**1.6)
            else: bl = Fp+V((0, 0, 0.06*math.sin(math.pi*min(1.0, (t-fl[2])/(fl[3]-fl[2])*1.5))))
        ctx.BALL.location = bl; load = [(bar, 6.0)]
    return dict(bar=bar if ld == 'bar' else None, load=load, fixed=['ball_l', 'ball_r'] if sx < 0.01 else [])

# ════ 앉아서 하는 기구 유산소 ════
def _hipw(r, P, R, sg): return P+R@V((sg*abs(r.HIP_OFF.x), r.HIP_OFF.y, r.HIP_OFF.z))
# ── 자전거: 골반은 안장에 고정, 앞꿈치가 크랭크 원을 돈다. kind road·spin·assault·recumbent ──
# th 몸통 기울기, ca 엉덩이→크랭크 방향(수평 아래로 몇 도), k 맨 아래에서 다리 펴짐, rc 크랭크 반지름, n 루프당 바퀴 수, ha 손잡이 방향(어깨에서 수평 아래로 몇 도), hr 팔 뻗음, fp 발 각도(앞꿈치 기준, -=앞꿈치 들림)
BK = dict(kind='spin', th=28.0, ca=72.0, k=0.955, rc=0.17, n=2.0, ha=38.0, hr=0.80, fp=-8.0, fa=12.0, pz=0.92, cx=0.115, neck=-14.0)
def bike_setup(ctx):
    C = dict(BK); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; R = Rx(C['th']); P0 = r.head0('pelvis'); P = V((0, P0.y, C['pz'])); ctx.P = P
    H = _hipw(r, P, R, 1); a = math.radians(C['ca']); d = V((0, -math.cos(a), -math.sin(a))); L = r.L_T+r.L_S
    def far(D):   # 크랭크 중심이 엉덩이에서 D 만큼일 때 가장 먼 발목 거리
        Cc = H+d*D; m = 0.0
        for i in range(24):
            ph_ = 2*math.pi*i/24; B = Cc+V((C['cx']-H.x, 0, 0))+V((0, -math.sin(ph_), math.cos(ph_)))*C['rc']; pt = C['fp']+C['fa']*math.sin(ph_)
            m = max(m, (r.ankle_from_ball('l', B, 0.0, pt)-H).length)
        return m
    lo, hi = 0.2, 1.2
    for _ in range(40):
        mid = (lo+hi)/2
        if far(mid) > C['k']*L: hi = mid
        else: lo = mid
    ctx.CR = V((0, (H+d*lo).y, (H+d*lo).z)); cr = ctx.CR
    # 기구: 크랭크·안장·손잡이·몸체
    ctx.CK = [box("crank", (0.03, 0.04, 2*C['rc']), (0, 0, 0), M_.STEEL) for _ in range(2)]; cyl("bb", 0.05, 0.16, M_.FRAME, tuple(cr))
    seat = P+R@V((0, 0.02, -0.185))
    if C['kind'] == 'recumbent':
        box("seat", (0.40, 0.42, 0.06), (0, seat.y+0.02, seat.z-0.04), M_.PAD, 0.02); bk = P+Rx(C['th'])@V((0, 0.20, 0.30)); box("back", (0.42, 0.06, 0.60), tuple(bk), M_.PAD, 0.02)
        box("frame", (0.10, abs(cr.y-seat.y)+0.2, 0.08), (0, (cr.y+seat.y)/2, min(cr.z, seat.z)-0.25), M_.FRAME)
        box("post", (0.08, 0.08, seat.z-0.1), (0, seat.y, (seat.z-0.1)/2), M_.FRAME); box("cpost", (0.08, 0.08, cr.z), (0, cr.y, cr.z/2), M_.FRAME)
    else:
        box("seat", (0.14, 0.18, 0.05), (0, seat.y+0.01, seat.z-0.04), M_.PAD, 0.02); box("post", (0.05, 0.05, seat.z-0.08), (0, seat.y+0.02, (seat.z-0.08)/2), M_.FRAME)
        box("down", (0.06, 0.06, 0.05), tuple(cr), M_.FRAME)
        if C['kind'] in ('spin', 'assault'): box("base", (0.55, 1.10, 0.04), (0, (cr.y+seat.y)/2, 0.02), M_.FRAME); cyl("fly", 0.24 if C['kind'] == 'spin' else 0.34, 0.06 if C['kind'] == 'spin' else 0.10, M_.FRAME, (0, cr.y-0.30, 0.42))
        else:   # 야외 자전거: 바퀴 둘
            for yy in (cr.y-0.62, seat.y+0.40): cyl("wheel", 0.34, 0.03, M_.RUBBER, (0, yy, 0.34)); cyl("hub", 0.04, 0.10, M_.FRAME, (0, yy, 0.34))
    ctx.HB = None
    if C['kind'] == 'assault': ctx.AH = [cyl("ah", 0.016, 0.85, M_.STEEL, axis='Z') for _ in range(2)]
def bike(r, t, ctx):
    C = ctx.C; R = Rx(C['th']); P = ctx.P; n = C['n']; ph0 = 2*math.pi*ph(t, n)
    r.torso(P, R, neck=Rx(C['th']*0.5+C['neck']), head=Rx(C['th']*0.3+C['neck']), scap={s: (0.0, 1.0) for s, _ in SIDES})
    for i, (s, sg) in enumerate(SIDES):
        a = ph0+(0 if s == 'l' else math.pi); B = ctx.CR+V((sg*C['cx'], -math.sin(a)*C['rc'], math.cos(a)*C['rc'])); pt = C['fp']+C['fa']*math.sin(a)
        A = r.ankle_from_ball(s, B, 0.0, pt); r.leg_ik(s, A, V((sg*0.10, -1, 0.35 if C['kind'] != 'recumbent' else 1.0)).normalized(), V((0, -1, 0)), 0.0, pt, False)
        cr = ctx.CK[i]; cr.location = ctx.CR+V((sg*(C['cx']-0.05), -math.sin(a)*C['rc']/2, math.cos(a)*C['rc']/2)); cr.rotation_euler = (-a, 0, 0)
    for s, sg in SIDES:
        S = r.chain_head('upperarm_'+s); b = math.radians(C['ha']); Lr = (r.L_U+r.L_F)*C['hr']
        if C['kind'] == 'assault':   # 손잡이가 페달과 엇갈려 앞뒤로
            a = ph0+(math.pi if s == 'l' else 0); Lr *= 1+0.10*math.sin(a)
        if C['kind'] == 'recumbent':   # 손은 의자 옆 손잡이
            G = _hipw(r, P, R, sg)+V((sg*0.16, -0.02, 0.06))
        else: G = S+V((sg*0.04, -math.cos(b), -math.sin(b))).normalized()*Lr
        r.arm(s, G, V((0, -0.6, -0.2)).normalized() if C['kind'] != 'assault' else V((0, -0.15, 1)).normalized(), V((sg*0.8, 0.3, -0.5)), V((0, 0, 1)) if C['kind'] != 'assault' else V((-sg, 0, 0)), 0.9995); r.fingers(s)
        if C['kind'] == 'assault': wire_to(ctx.AH[0 if s == 'l' else 1], G+V((0, 0, -0.02)), V((sg*0.20, ctx.CR.y-0.10, 0.25))); ctx.AH[0 if s == 'l' else 1].scale[0] = ctx.AH[0 if s == 'l' else 1].scale[1] = 1.6
        elif s == 'l' and C['kind'] != 'recumbent' and ctx.HB is None: ctx.HB = cyl("hbar", 0.016, 0.50, ctx.mats.STEEL, tuple(V((0, G.y, G.z)))); box("stem", (0.05, 0.05, max(0.05, G.z-ctx.CR.z)), (0, G.y+0.12, (G.z+ctx.CR.z)/2), ctx.mats.FRAME)
    return dict(bar=None, load=[], fixed=['pelvis'])

# ── 로잉 머신: 발판 고정, 좌석이 레일을 미끄러진다. 다리 → 몸통 → 팔 순서로 당기고 거꾸로 돌아온다 ──
RW = dict(sz=0.36, k0=0.52, k1=0.975, th0=24.0, th1=-16.0, fp=-38.0, hz=0.0, ax=0.11)
def row_setup(ctx):
    C = dict(RW); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; y0 = r.head0('ball_l').y-0.55; ctx.BALL = {s: V((sg*C['ax'], y0, 0.20)) for s, sg in SIDES}
    box("rail", (0.12, 2.3, 0.05), (0, y0+0.95, 0.12), M_.FRAME); box("foot", (0.42, 0.06, 0.30), (0, y0-0.10, 0.20), M_.PAD, 0.01); box("fly", (0.42, 0.40, 0.45), (0, y0-0.42, 0.30), M_.FRAME)
    ctx.SEAT = box("seat", (0.32, 0.30, 0.05), (0, 0, 0), M_.PAD, 0.02); ctx.HD = cyl("hdl", 0.016, 0.50, M_.STEEL); ctx.CH = wire(ctx, "chain"); ctx.FLY = V((0, y0-0.30, 0.42))
def row(r, t, ctx):
    C = ctx.C; p = t % 1.0
    if p < 0.40: lg = sstep(0.0, 0.24, p); bd = sstep(0.08, 0.30, p); am = sstep(0.18, 0.40, p)   # 당기기
    else: am = 1-sstep(0.42, 0.56, p); bd = 1-sstep(0.50, 0.70, p); lg = 1-sstep(0.62, 0.98, p)   # 돌아오기
    th = lerp(C['th0'], C['th1'], bd); R = Rx(th); L = r.L_T+r.L_S; k = lerp(C['k0'], C['k1'], lg); pt = C['fp']+18*(1-lg)
    A = r.ankle_from_ball('l', ctx.BALL['l'], 0.0, pt); off = R@V((abs(r.HIP_OFF.x), r.HIP_OFF.y, r.HIP_OFF.z)); P0 = r.head0('pelvis')
    Pz = C['sz']+(P0.z-r.chain_head('thigh_l').z if False else 0.10); Hz = Pz+off.z; dy = sqrt0((k*L)**2-(Hz-A.z)**2-(off.x-A.x)**2); P = V((0, A.y+dy-off.y, Pz))
    r.torso(P, R, neck=Rx(th*0.4-6), head=Rx(th*0.2-6), scap={s: (0.0, lerp(2.0, -1.0, am)) for s, _ in SIDES})
    ctx.SEAT.location = P+V((0, 0.02, -0.12))
    for s, sg in SIDES:
        As = r.ankle_from_ball(s, ctx.BALL[s], 0.0, pt); r.leg_ik(s, As, V((sg*0.18, -0.3, 1)).normalized(), V((0, -1, 0)), 0.0, pt, False)
    S = r.chain_head('upperarm_l'); hz = 0.62+C['hz']; Lr = (r.L_U+r.L_F)*0.86; yc = S.y-sqrt0(Lr**2-(S.z-hz)**2-(S.x-0.17)**2); yf = S.y-0.15; gy = lerp(yc, yf, am); G0 = V((0, gy, hz))
    for s, sg in SIDES: r.arm(s, G0+V((sg*0.17, 0, 0)), V((0, 0.5, -0.4)).normalized(), V((sg*0.9, 0.5, -0.2)).normalized(), V((0, 0, 1)), 0.9995); r.fingers(s)
    ctx.HD.location = G0; wire_to(ctx.CH, G0, ctx.FLY)
    return dict(bar=None, load=[(G0, 20.0)], fixed=['ball_l', 'ball_r'])
# ── 일립티컬: 발판이 타원을 돈다(좌우 반대), 손잡이는 발과 엇갈려 앞뒤로 ──
EL = dict(a=0.20, b=0.07, n=1.0, k=0.975, ax=0.12, th=6.0, fp=4.0, hz=1.05)
def ellip_setup(ctx):
    C = dict(EL); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; b0 = r.head0('ball_l'); ctx.B0 = V((0, b0.y, b0.z+0.22)); y = b0.y
    for sg in (-1, 1): box("rail", (0.08, 1.0, 0.04), (sg*C['ax'], y+0.10, 0.05), M_.FRAME)
    box("base", (0.6, 1.5, 0.05), (0, y+0.05, 0.025), M_.FRAME); box("front", (0.25, 0.25, 1.1), (0, y-0.70, 0.55), M_.FRAME); box("console", (0.4, 0.12, 0.25), (0, y-0.66, 1.25), M_.FRAME)
    ctx.PD = [box("pedal", (0.13, 0.36, 0.04), (0, 0, 0), M_.PAD, 0.01) for _ in range(2)]; ctx.HP = [cyl("hp", 0.02, 1.0, M_.STEEL, axis='Z') for _ in range(2)]
    R = Rx(C['th']); off = R@V((abs(r.HIP_OFF.x), r.HIP_OFF.y, r.HIP_OFF.z)); L = r.L_T+r.L_S; zs = []
    for i in range(48):
        a = 2*math.pi*i/48; B = ctx.B0+V((C['ax'], -C['a']*math.cos(a), C['b']*math.sin(a))); A = r.ankle_from_ball('l', B, 0.0, C['fp']+6*math.sin(a))
        zs.append(A.z+sqrt0((C['k']*L)**2-(off.x-A.x)**2-(r.head0('pelvis').y+off.y-A.y)**2)-off.z)
    ctx.PZ = min(zs)
def ellip(r, t, ctx):
    C = ctx.C; a0 = 2*math.pi*ph(t, C['n']); R = Rx(C['th']); P0 = r.head0('pelvis'); P = V((0, P0.y, ctx.PZ+0.008*math.cos(2*a0)))
    r.torso(P, Rz(3*math.sin(a0))@R, neck=Rx(C['th']*0.4), head=Rx(C['th']*0.2), scap={s: (0.0, 0.5) for s, _ in SIDES})
    for i, (s, sg) in enumerate(SIDES):
        a = a0+(0 if s == 'l' else math.pi); B = ctx.B0+V((sg*C['ax'], -C['a']*math.cos(a), C['b']*math.sin(a))); pt = C['fp']+6*math.sin(a)
        A = r.ankle_from_ball(s, B, 0.0, pt); r.leg_ik(s, A, V((sg*0.12, -1, 0.1)).normalized(), V((0, -1, 0)), 0.0, pt, False)
        ctx.PD[i].location = B+V((0, 0.10, -0.075)); ctx.PD[i].rotation_euler = (math.radians(-pt), 0, 0)
        S = r.chain_head('upperarm_'+s); G = V((sg*0.24, S.y-0.24+0.09*math.cos(a), S.z-0.28+0.03*math.cos(a)))
        r.arm(s, G, V((0, -0.2, 1)).normalized(), V((sg*0.8, 0.5, -0.4)).normalized(), V((-sg, 0, 0)) if False else None, 0.9995); r.fingers(s)
        wire_to(ctx.HP[i], G+V((0, 0, -0.04)), V((sg*0.20, ctx.B0.y-0.55, 0.30))); ctx.HP[i].scale[0] = ctx.HP[i].scale[1] = 1.0
    return dict(bar=None, load=[], fixed=[])
# ── 스키에르그: 머리 위 손잡이를 엉덩이를 접으며 허벅지 옆까지 당긴다 ──
SK = dict(ax=0.14, th1=48.0, k1=0.94, n=1.0)
def skierg_setup(ctx):
    C = dict(SK); C.update(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; y = r.ANK_Y-0.62
    box("tower", (0.50, 0.14, 2.20), (0, y-0.08, 1.10), M_.FRAME); box("base", (0.70, 0.90, 0.012), (0, y+0.30, 0.0), M_.FRAME); ctx.TOP = V((0, y, 2.10))
    ctx.HD = [cyl("hdl", 0.018, 0.13, M_.STEEL, axis='Z') for _ in range(2)]; ctx.RP = [wire(ctx, "rope") for _ in range(2)]
def skierg(r, t, ctx):
    C = ctx.C; p = ph(t, C['n'])
    u = sstep(0.0, 0.42, p) if p < 0.45 else 1-sstep(0.48, 0.98, p)   # 0 섬(손 위) → 1 접음(손 허벅지)
    th = C['th1']*sstep(0.1, 1.0, u); ax = C['ax']; P0 = stand_P(r, ax); kn = lerp(0.994, C['k1'], u)
    off = Rx(th)@r.HIP_OFF; A = V((ax, r.ANK_Y, r.ANK_Z)); L = (r.L_T+r.L_S)*kn; H0 = V((ax, 0, 0)); dzv = sqrt0(L**2-(abs(off.x)-ax)**2-(0.08*u)**2)
    P = V((0, A.y+0.08*u+0.0-off.y, A.z+dzv-off.z)); r.torso(P, Rx(th), neck=Rx(th*0.4-8*u), head=Rx(th*0.2-8*u), scap={s: (lerp(3.0, 0.0, u), lerp(0.0, 1.5, u)) for s, _ in SIDES})
    fixed = plant(r, ax, 8.0, lambda sg: V((sg*0.22, -1, 0)))
    for i, (s, sg) in enumerate(SIDES):
        S = r.chain_head('upperarm_'+s); a = math.radians(lerp(160, 12, sstep(0.0, 1.0, u**0.8))); d = V((sg*0.10, -math.sin(a), -math.cos(a))).normalized(); Lr = (r.L_U+r.L_F)*lerp(0.93, 0.95, u)
        G = S+d*Lr; F = d; r.arm(s, G, F, V((sg*0.8, 0.4, -0.3)).normalized(), V((-sg, 0, 0)), 0.9995); r.fingers(s)
        ctx.HD[i].location = G; wire_to(ctx.RP[i], G+V((0, 0, 0.06)), ctx.TOP+V((sg*0.12, 0, 0)))
    return dict(bar=None, load=[], fixed=fixed)

# ════ 제자리 뛰기: 점핑 잭·줄넘기 ════
# kind jack(벌렸다 모음)·rope, n 루프당 뛰기 수, H 뛰는 높이, air 체공 비율, dip 착지 무릎 굽힘(m)
JJ = dict(kind='jack', n=2.0, H=0.08, air=0.55, dip=0.035, ax0=0.11, ax1=0.34, k=0.985)
def jj_setup(ctx):
    C = dict(JJ); C.update(ctx.vars); ctx.C = C
    if C['kind'] == 'rope': ctx.RP = [wire(ctx, "rope") for _ in range(16)]; ctx.HD = [cyl("hdl", 0.018, 0.14, ctx.mats.PAD, axis='Z') for _ in range(2)]
def jj(r, t, ctx):
    C = ctx.C; q = ph(t, C['n']); a = C['air']
    hop = C['H']*math.sin(math.pi*q/a) if q < a else 0.0; dip = 0.0 if q < a else C['dip']*math.sin(math.pi*(q-a)/(1-a)); heel = 22.0 if q < a else 22.0*(1-math.sin(math.pi*(q-a)/(1-a)))
    op = 0.5-0.5*math.cos(2*math.pi*t) if C['kind'] == 'jack' else 0.0; ax = lerp(C['ax0'], C['ax1'], op)
    b0 = r.head0('ball_l'); L = r.L_T+r.L_S; P0 = r.head0('pelvis'); off = r.HIP_OFF; A = {}
    for s, sg in SIDES: A[s] = r.ankle_from_ball(s, V((sg*ax, b0.y, b0.z+hop)), sg*8.0, heel)
    Al = A['l']; z = Al.z+sqrt0((C['k']*L)**2-(abs(off.x)-Al.x)**2-(P0.y+off.y-Al.y)**2)-off.z-dip
    P = V((0, P0.y, z)); r.torso(P, Rx(2.0), neck=Rx(1), head=Rx(0), scap={s: (2.5*op, 0.0) for s, _ in SIDES})
    for s, sg in SIDES: r.leg_ik(s, A[s], V((sg*0.25, -1, 0)), Rz(sg*8)@V((0, -1, 0)), sg*8.0, heel, hop < 0.04)
    for i, (s, sg) in enumerate(SIDES):
        S = r.chain_head('upperarm_'+s)
        if C['kind'] == 'jack':
            ab = math.radians(lerp(14, 168, op)); d = V((sg*math.sin(ab), -0.10, -math.cos(ab))).normalized(); G = S+d*(r.L_U+r.L_F)*0.96
            r.arm(s, G, d, V((0, 1, 0.2*(1-2*op))).normalized(), V((0, -1, 0)), 0.9995); r.fingers(s, 0.3)
        else:
            w = 2*math.pi*ph(t, C['n']); G = S+V((sg*0.18, -0.14, -0.36))+V((0, -math.sin(w), math.cos(w)))*0.03
            r.arm(s, G, V((0, -0.3, 1)).normalized(), V((sg*0.8, 0.6, 0)).normalized(), V((-sg, 0, 0)), 0.9995); r.fingers(s); ctx.HD[i].location = G
            A[s+'G'] = G
    if C['kind'] == 'rope':   # 줄: 두 손 사이 U 자가 몸 둘레(앞뒤 평면)를 돈다. 발이 떠 있을 때 발밑을 지난다
        GL, GR = A['lG']+V((0, 0, -0.07)), A['rG']+V((0, 0, -0.07)); w = 2*math.pi*(ph(t, C['n'])-a/2)+math.pi; Rr = GL.z+0.02
        pts = [GL.lerp(GR, k/16)+V((0, -math.sin(w), math.cos(w)))*Rr*math.sin(math.pi*k/16)**0.35 for k in range(17)]
        for k in range(16): wire_to(ctx.RP[k], pts[k], pts[k+1])
    return dict(bar=None, load=[], fixed=[])
# ── 박스 점프: 앉았다 박스 위로 뛰어 착지 → 일어섬 → 뒤로 뛰어 내려옴 ──
BJ = dict(toe=12.0, ax=0.16, a0=3.0, a1=30.0, drop=-0.10, ref=None, ty=-0.03, load='swing', bh=0.50, by=-0.62)
def bj_setup(ctx):
    C = dict(JP); C.update(BJ); C.update(ctx.vars); ctx.C = C; load_setup(ctx, 'none'); C['ref'] = ctx.L_SH; ctx.swing = 0.0; r = ctx.rig
    box("box", (0.70, 0.55, C['bh']), (0, r.ANK_Y+C['by']+0.04, C['bh']/2), ctx.mats.PAD, 0.02)
def bjump(r, t, ctx):
    C = ctx.C; bh, by = C['bh'], C['by']; p = t % 1.0
    def seg(a, b): return min(1.0, max(0.0, (p-a)/(b-a)))
    if p < 0.28: s_ = sstep(0.08, 0.28, p); u = 0.65*s_; yA = 0.0; dz = 0.0; heel = 0.0; sw = lerp(-10, -55, s_)
    elif p < 0.52: s_ = seg(0.28, 0.52); u = lerp(0.65, 0.05, sstep(0, 0.3, s_))+0.5*sstep(0.55, 1.0, s_); yA = by*sstep(0.22, 0.85, s_); dz = bh*min(1.0, s_/0.6)+0.15*math.sin(math.pi*s_); heel = 25*math.sin(math.pi*s_); sw = lerp(-55, 95, min(1.0, s_/0.9))
    elif p < 0.68: s_ = seg(0.52, 0.68); u = lerp(0.55, 0.0, sstep(0.0, 0.8, s_)); yA = by; dz = bh; heel = 0.0; sw = lerp(95, 0, sstep(0, 0.8, s_))
    elif p < 0.88: s_ = seg(0.68, 0.88); u = 0.15*math.sin(math.pi*s_); yA = by*(1-sstep(0.0, 0.5, s_)); dz = bh+0.08*math.sin(math.pi*s_)-bh*sstep(0.35, 1.0, s_); heel = 20*math.sin(math.pi*s_); sw = lerp(0, 25, s_)
    else: s_ = seg(0.88, 1.0); u = 0.40*math.sin(math.pi*s_); yA = 0.0; dz = 0.0; heel = 0.0; sw = lerp(25, -10, s_)
    C['yA'] = yA; ctx.swing = sw
    P, R, th, fixed = sq_frame(r, u, ctx, C, heel, dz)
    arms(r, ctx, 'swing', P, R, u, th, fixed)
    return dict(bar=None, load=[], fixed=[])

# ════ 선 자세 팔 동작: 복싱(잽·크로스)·배틀 로프(번갈아 물결) ════
ST2 = dict(kind='boxing', ax=0.17, drop=0.06, th=8.0, n=2.0)
def st2_setup(ctx):
    C = dict(ST2); C.update(ctx.vars); ctx.C = C; r = ctx.rig
    if C['kind'] == 'rope':
        ctx.AN = V((0, r.ANK_Y-3.2, 0.12)); box("anchor", (0.20, 0.20, 0.24), tuple(ctx.AN-V((0, 0, 0.0))), ctx.mats.FRAME); ctx.RW = [[wire(ctx, "brope") for _ in range(18)] for _ in range(2)]
        for w_ in ctx.RW:
            for o in w_: o.scale[0] = o.scale[1] = 4.0
def st2(r, t, ctx):
    C = ctx.C; ax = C['ax']; n = C['n']; P = stand_P(r, ax)-V((0, 0, C['drop'])); P.y += 0.02
    if C['kind'] == 'boxing':
        q_ = ph(t, n); pl = math.sin(math.pi*q_/0.40)**2 if q_ < 0.40 else 0.0; pr = math.sin(math.pi*(q_-0.5)/0.40)**2 if 0.5 <= q_ < 0.90 else 0.0
        tw = 14*pr-8*pl; bob = 0.015*math.sin(4*math.pi*t*n); P.z -= bob
        r.torso(P, Rz(tw*0.3)@Rx(C['th']), Rz(tw*0.6)@Rx(C['th']), Rz(tw)@Rx(C['th']), Rz(tw)@Rx(C['th']), Rz(-tw*0.7)@Rx(C['th']*0.3), Rz(-tw*0.9)@Rx(-2), scap={'l': (0.5, 1.5*pl), 'r': (0.5, 1.5*pr)})
        fixed = plant(r, ax, 10.0, lambda sg: V((sg*0.25, -1, 0)))
        for s, sg in SIDES:
            S = r.chain_head('upperarm_'+s); Hd = r.chain_head('head'); k = pl if s == 'l' else pr
            guard = Hd+V((sg*0.09, -0.13, -0.10)); punch = S+V((-sg*0.06, -(r.L_U+r.L_F)*0.93, 0.02)); G = guard.lerp(punch, sstep(0.0, 1.0, k))
            F = V((-sg*0.65, -0.05, 1)).normalized().lerp(V((0, -1, 0)), k).normalized(); r.arm(s, G, F, V((sg*0.5, lerp(-0.3, 0.3, k), -1)).normalized(), None, 0.9995); r.fingers(s, 1.0)
        return dict(bar=None, load=[], fixed=fixed)
    th = 14.0; r.torso(P-V((0, 0, 0.06)), Rx(th), neck=Rx(th*0.3-6), head=Rx(th*0.2-6), scap={s: (0.5, 1.0) for s, _ in SIDES}); fixed = plant(r, ax, 10.0, lambda sg: V((sg*0.25, -1, 0)))
    for i, (s, sg) in enumerate(SIDES):
        S = r.chain_head('upperarm_'+s); w = 2*math.pi*ph(t, n*2, 0.0 if s == 'l' else 0.5); G = S+V((sg*0.02, -0.26, -0.33+0.13*math.sin(w)))
        r.arm(s, G, V((0, -1, -0.15*math.cos(w))).normalized(), V((sg*0.9, 0.4, -0.4)).normalized(), V((-sg, 0, 0)), 0.9995); r.fingers(s)
        a0 = G+V((0, -0.06, 0)); end = ctx.AN+V((sg*0.06, 0, 0.05)); pts = []
        for k in range(19):
            q = k/18; p_ = a0.lerp(end, q); p_.z = lerp(a0.z, end.z, q**0.6)+0.16*(1-q)**1.5*math.sin(w-2*math.pi*2.2*q)*min(1.0, q*6); pts.append(p_)
        for k in range(18): wire_to(ctx.RW[i][k], pts[k], pts[k+1])
    return dict(bar=None, load=[], fixed=fixed)

# ════ 키 자세 공용(버피·크롤·요가·멀리뛰기…): 키마다 바뀌는 값만 적고 나머지는 앞 키를 잇는다 ════
# px·py 골반 이동, kk 다리 펴짐(골반 높이를 발에서 구한다), air 1 이면 pz(절대 높이)를 쓴다, th 골반 기울기(+앞으로), c 척추 굽힘, nk 목, tw 비틀기, sd 옆 기울기
# shz 있으면 어깨 높이가 이 값이 되게 th 를 찾는다, shy 있으면 어깨 y 가 이 값(발 기준)이 되게 py 를 찾는다
# f [x, y, z, 뒤꿈치] 앞꿈치(왼발 기준 x, 오른발은 거울, y 는 선 자세 앞꿈치 기준), fl/fr 한쪽만, kp 무릎 방향
# h 손: ['d', 앞으로 각, 옆 각, 뻗음] 몸통 기준 방향 · ['f', x, y] 바닥 짚기 · ['w', x, y, z] 세계 점 · hl/hr 한쪽만
KD = dict(px=0.0, py=0.0, kk=0.99, air=0.0, pz=1.0, th=2.0, c=0.0, nk=0.0, tw=0.0, sd=0.0, shz=None, shy=None, f=[0.12, 0.0, 0.0, 0.0], kp=[0.2, -1.0, 0.0], h=['d', 8.0, 8.0, 0.97], hz=0.0, curl=0.3)
def kf_setup(ctx):
    C = dict(ctx.vars); ctx.C = C; r = ctx.rig; M_ = ctx.mats; ks = []; cur = dict(KD)
    for k in C['keys']:
        cur = dict(cur); cur.pop('fl', None) if 'f' in k else None; cur.pop('fr', None) if 'f' in k else None; cur.pop('hl', None) if 'h' in k else None; cur.pop('hr', None) if 'h' in k else None
        for n_ in ('shz', 'shy'): cur[n_] = k.get(n_)   # 자동 맞춤은 그 키에만
        cur.update(k); ks.append(cur)
    ctx.K = ks; ctx.B0 = r.head0('ball_l'); ctx.P0 = r.head0('pelvis'); ctx.LAT = {}
    ld = C.get('load')
    if ld == 'db': ctx.DB = {s: dumbbell(ctx, "db_"+s) for s, _ in SIDES}
    if ld == 'kb': ctx.KB = {s: kettlebell(ctx, "kb_"+s) for s, _ in SIDES}
    for bx in C.get('boxes', []): box("box", tuple(bx[3:6]), (bx[0], r.ANK_Y+bx[1], bx[2]), M_.PAD, 0.02)
    if C.get('bar'): b = barbell(ctx.col, M_); b.location = V((C['bar'][0], r.ANK_Y+C['bar'][1], PLATE_R-0.012)); b.rotation_euler = (0, 0, math.pi/2) if C['bar'][2] else (0, 0, 0)
def _kseg(ctx, t):
    K = ctx.K; q = min(1.0, max(0.0, t)) if ctx.C.get('clamp') else t % 1.0   # 왕복(pingpong)은 끝에서 감싸지 않는다
    for a, b in zip(K, K[1:]):
        if q <= b['t']: u = (q-a['t'])/max(1e-6, b['t']-a['t']); return a, b, lerp(u, sstep(0.0, 1.0, u), ctx.C.get('ease', 1.0))   # ease 1 = 키마다 멈춤, 0 = 등속(빠른 연속 동작)
    return K[-1], K[-1], 0.0
def _kv(ctx, t, fn):
    w = ctx.C.get('smw', 0.012); tot = 0.0
    for j in range(5):
        a, b, f = _kseg(ctx, t+(j-2)*w); tot += lerp(fn(a), fn(b), f)
    return tot/5
def _side(k, n, s, sg):
    v = k.get(n+s)
    if v is not None: return list(v)
    v = list(k[n]); return v
def kf_feet(r, ctx, t):
    out = {}
    for s, sg in SIDES:
        x = _kv(ctx, t, lambda k: _side(k, 'f', s, sg)[0]); y = _kv(ctx, t, lambda k: _side(k, 'f', s, sg)[1]); z = _kv(ctx, t, lambda k: _side(k, 'f', s, sg)[2]); hl = _kv(ctx, t, lambda k: _side(k, 'f', s, sg)[3])
        px = _kv(ctx, t, lambda k: k['px']); B = V((px+sg*x, ctx.B0.y+y, ctx.B0.z+z)); out[s] = (r.ankle_from_ball(s, B, sg*8.0, hl), hl, B)
    return out
def kf_R6(th, c, nk, tw, sd):
    return [Rot(th, sd*0.3, tw*0.2), Rot(th+0.35*c, sd*0.6, tw*0.5), Rot(th+0.7*c, sd*0.85, tw*0.8), Rot(th+c, sd, tw), Rot(th+c+nk, sd, tw), Rot(th+c+nk*1.3, sd, tw)]
def kf_place(r, ctx, t, feet):
    L = r.L_T+r.L_S
    def place(th_, py_, feet_, tt):
        g = lambda n: _kv(ctx, tt, lambda k: k[n])
        c, nk, tw, sd, kk, air, pz, px = g('c'), g('nk'), g('tw'), g('sd'), g('kk'), g('air'), g('pz'), g('px'); R = Rot(th_, sd*0.3, tw*0.2); zs = []
        for s, sg in SIDES:
            A = feet_[s][0]; o = R@V((sg*abs(r.HIP_OFF.x), r.HIP_OFF.y, r.HIP_OFF.z)); H = V((px, ctx.P0.y+py_, 0))+o
            zs.append(A.z+sqrt0((kk*L)**2-(H.x-A.x)**2-(H.y-A.y)**2)-o.z)
        R6 = kf_R6(th_, c, nk, tw, sd); P = V((px, ctx.P0.y+py_, lerp(min(zs), pz, air))); r.torso(P, *R6, scap={s: (0.0, 0.0) for s, _ in SIDES}); return P, R6
    def Sm(): return (r.chain_head('upperarm_l')+r.chain_head('upperarm_r'))/2
    def fit(k):   # 키 시점에서 어깨 높이(shz)·앞뒤(shy)를 맞춘 th·py
        th_, py_ = k['th'], k['py']; tt = k['t']; ft = kf_feet(r, ctx, tt)
        if k.get('shz') is None and k.get('shy') is None: return th_, py_
        if k.get('shz') is not None and k.get('shy') is not None:   # 어깨 점과 발목 사이 두 마디(다리·몸통) 풀이 — 엉덩이는 위쪽 해
            A = (ft['l'][0]+ft['r'][0])/2; Ho = V((0, r.HIP_OFF.y, r.HIP_OFF.z)); S0 = r.shoulder_local('l')-ctx.P0; sv = V((0, S0.y, S0.z))-Ho; d1 = sv.length
            r1 = sqrt0((_kv(ctx, tt, lambda kk_: kk_['kk'])*L)**2-(abs(r.HIP_OFF.x)-A.x)**2); St = V((0, ctx.B0.y+k['shy'], k['shz'])); A2 = V((0, A.y, A.z)); D = (St-A2).length
            D = min(D, r1+d1-1e-4); x = (r1*r1-d1*d1+D*D)/(2*D); h = sqrt0(r1*r1-x*x); e = (St-A2).normalized(); nrm = V((0, -e.z, e.y))
            H = A2+e*x+nrm*h
            if (A2+e*x-nrm*h).z > H.z: H = A2+e*x-nrm*h
            u = (St-H).normalized(); th_ = math.degrees(math.atan2(-u.y, u.z)-math.atan2(-sv.y, sv.z)); Pp = H-Rx(th_)@Ho; return th_, Pp.y-ctx.P0.y
        for _ in range(3):
            if k.get('shz') is not None:
                lo, hi = -30.0, 110.0
                for _ in range(22):
                    m = (lo+hi)/2; place(m, py_, ft, tt)
                    if Sm().z > k['shz']: lo = m
                    else: hi = m
                th_ = (lo+hi)/2
            if k.get('shy') is not None: place(th_, py_, ft, tt); py_ += (ctx.B0.y+k['shy'])-Sm().y
        return th_, py_
    cache = ctx.__dict__.setdefault('FIT', {})
    def fitc(k):
        if id(k) not in cache: cache[id(k)] = fit(k)
        return cache[id(k)]
    w = ctx.C.get('smw', 0.012); th = 0.0; py = 0.0
    for j in range(5):
        a_, b_, f_ = _kseg(ctx, t+(j-2)*w); ta, pa = fitc(a_); tb, pb = fitc(b_); th += lerp(ta, tb, f_)/5; py += lerp(pa, pb, f_)/5
    return place(th, py, feet, t)
def kf_hand(r, ctx, k, s, sg, R3):
    h = _side(k, 'h', s, sg); S = r.chain_head('upperarm_'+s)
    if h[0] == 'd':
        a, b = math.radians(h[1]), math.radians(h[2]); d = (R3@V((sg*math.sin(b), -math.sin(a)*math.cos(b), -math.cos(a)*math.cos(b)))).normalized(); W = S+d*(r.L_U+r.L_F)*h[3]
        M3 = R3@Rx(-h[1])@Ry(-sg*h[2]); ctx.LAT[s] = (M3@V((0, -1, 0))).normalized()   # 손 방향도 팔과 같이 돈다(엄지 앞으로 늘어뜨린 손 기준)
        return W, d, (M3@V((sg*0.15, 1.0, 0.0))).normalized(), 0.3   # 팔꿈치 끝: 팔과 같이 돈 '뒤쪽'
    if h[0] == 'f':
        W = V((k['px']+sg*h[1], ctx.B0.y+h[2], 0.036+r.GRIP_N+k['hz'])); return W, V((sg*0.2, -1, 0)).normalized(), V((sg*0.6, 0.8, 0.3)), 0.0
    W = V((sg*h[1], ctx.B0.y+h[2], h[3]))
    if h[3] < 0.3: return W, V((sg*0.2, -1, 0)).normalized(), V((sg*0.6, 0.8, 0.3)), 0.0   # 바닥 가까이 든 손은 바닥 짚는 손 모양 그대로
    return W, V((0, 0, -1)), V((sg*0.8, 0.5, 0)), 1.0
_KJ = ('head', 'hand_l', 'hand_r', 'pelvis', 'ball_l', 'calf_l', 'lowerarm_l')
def kf_retime(r, ctx):   # 키 사이 시간을 가장 많이 움직이는 관절의 거리에 비례하게 다시 나눈다(41 프레임 안에서 프레임당 이동을 고르게)
    K = ctx.K; sm = ctx.C.get('smw', 0.012); ctx.C['smw'] = 0.0; pts = []
    for k in K:
        kf(r, k['t'], ctx); pts.append([r.chain_head(n) if n != 'head' else r.chain_head('head') for n in _KJ])
    ctx.C['smw'] = sm; ctx.FIT = {}
    d = [max((p-q).length for p, q in zip(a, b))+0.04 for a, b in zip(pts, pts[1:])]; tot = sum(d); acc = 0.0
    for k, dd in zip(K[1:], d): acc += dd; k['t'] = acc/tot
def kf(r, t, ctx):
    if ctx.C.get('retime') and not getattr(ctx, 'RT', False): ctx.RT = True; kf_retime(r, ctx)
    ctx.T = t; feet = kf_feet(r, ctx, t); P, R6 = kf_place(r, ctx, t, feet)
    for s, sg in SIDES:
        A, hl, B = feet[s]; kp = V((sg*_kv(ctx, t, lambda k: k['kp'][0]), _kv(ctx, t, lambda k: k['kp'][1]), _kv(ctx, t, lambda k: k['kp'][2]))).normalized()
        r.leg_ik(s, A, kp, Rz(sg*8)@V((0, -1, 0)), sg*8.0, hl, (B.z-ctx.B0.z < 0.035 or ctx.C.get('toe')) and hl > 1.0)   # toe: 든 발도 발끝을 젖힌 채(네발 걷기)
    a, b, f = _kseg(ctx, t); load = []
    for s, sg in SIDES:
        ha, hb = _side(a, 'h', s, sg), _side(b, 'h', s, sg)
        if ha[0] == 'd' and hb[0] == 'd':   # 둘 다 몸통 기준 방향이면 각도를 섞는다(팔이 호를 그린다 — 직선으로 섞으면 팔꿈치가 접혔다 뒤집힌다)
            km = dict(a); km['h'+s] = ['d']+[lerp(x, y, f) for x, y in zip(ha[1:], hb[1:])]; Wa, Fa, pa, ca = kf_hand(r, ctx, km, s, sg, R6[3]); Wb, Fb, pb, cb = Wa, Fa, pa, ca; lat = ctx.LAT[s]
        else: Wa, Fa, pa, ca = kf_hand(r, ctx, a, s, sg, R6[3]); Wb, Fb, pb, cb = kf_hand(r, ctx, b, s, sg, R6[3]); lat = None
        if lat is None:   # 바닥·세계 점은 손등이 위(검지→소지 반대 = 안쪽), 방향 모드는 팔과 같이 돈 값
            la = ctx.LAT[s] if ha[0] == 'd' else V((-sg, 0, 0)); lb = ctx.LAT[s] if hb[0] == 'd' else V((-sg, 0, 0)); lat = la.lerp(lb, f).normalized()
        W = Wa.lerp(Wb, f)
        if ha[0] != hb[0]:   # 방향↔바닥 사이는 어깨 기준 방향·길이를 따로 섞고 길이를 팔 길이 안에 둔다(직선으로 섞으면 팔이 펴졌다 접힌다)
            Sh = r.chain_head('upperarm_'+s); va, vb = Wa-Sh, Wb-Sh; ln = min(lerp(va.length, vb.length, f), 0.96*(r.L_U+r.L_F)); W = Sh+va.normalized().lerp(vb.normalized(), f).normalized()*ln
        F = Fa.lerp(Fb, f).normalized(); pole = pa.lerp(pb, f); lat = (lat-F*lat.dot(F)).normalized(); G = grip_w(r, s, W, F, lat)
        r.arm(s, G, F, pole, lat, 0.9995); r.fingers(s, lerp(ca, cb, f))
        if ctx.C.get('load') == 'db': hold(ctx, s, G, V((0, 1, 0))); load.append((G, DB_KG))
        if ctx.C.get('load') == 'kb': place_obj(ctx.KB[s], G+V((0, 0, -0.035)), Rz(90)); load.append((G, KB_KG))
    return dict(bar=None, load=load, fixed=[])

SOLVERS = {'gait': (gait_setup, gait), 'oly': (oly_setup, oly), 'bike': (bike_setup, bike), 'row': (row_setup, row), 'ellip': (ellip_setup, ellip), 'skierg': (skierg_setup, skierg), 'jj': (jj_setup, jj), 'bjump': (bj_setup, bjump), 'st2': (st2_setup, st2), 'kf': (kf_setup, kf)}
