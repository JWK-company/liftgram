# SPDX-License-Identifier: GPL-3.0-or-later
"""뼈대 계산. Blender IK 를 쓰지 않는다: 관절 위치를 뼈 길이로 풀고, 경첩축까지 직접 정한다(SPEC-040)."""
import math
from mathutils import Vector as V, Matrix as M, Quaternion as Q

def Rx(d): return M.Rotation(math.radians(d), 3, 'X')
def Ry(d): return M.Rotation(math.radians(d), 3, 'Y')
def Rz(d): return M.Rotation(math.radians(d), 3, 'Z')
def Rot(flex=0.0, side=0.0, twist=0.0):
    """몸 기준 회전. flex + = 앞으로 숙임(-Y 쪽), side + = 왼쪽(+X)으로 기움, twist + = 왼쪽으로 돌림."""
    return Rz(twist) @ Ry(side) @ Rx(flex)
def lerp(a, b, t): return a+(b-a)*t
def sstep(a, b, x):
    u = max(0.0, min(1.0, (x-a)/(b-a))); return u*u*(3-2*u)
def sqrt0(x): return math.sqrt(max(x, 0.0))
def solve_two_bone(base, tip, l1, l2, pole, max_reach=0.998):
    """base→tip 2관절. 돌려주는 값: (중간 관절, 실제 끝점, 닿지 않아 당겼는지). pole 은 관절이 나가는 방향."""
    d = tip-base; c0 = d.length; d = d/c0
    reach = (l1+l2)*max_reach; clamped = c0 > reach+1e-4
    c = max(min(c0, reach), abs(l1-l2)+1e-3)
    x = (l1*l1-l2*l2+c*c)/(2*c); y = sqrt0(l1*l1-x*x)
    p = (pole-d*pole.dot(d))
    if p.length < 1e-6: raise ValueError("pole 이 뼈 방향과 평행")
    p = p.normalized()
    return base+d*x+p*y, base+d*c, clamped, p

def frame3(d, s):
    if d.length < 1e-6: raise ValueError("frame3: 방향이 0")
    d = d.normalized(); s = s-d*s.dot(d)
    if s.length < 1e-6: raise ValueError("frame3: 두 방향이 평행")
    s = s.normalized(); return M((d, s, d.cross(s))).transposed()
def aim_delta(d_r, s_r, d, s): return frame3(d, s) @ frame3(d_r, s_r).transposed()
def twist_of(R, axis):
    q = R.to_quaternion(); v = V((q.x, q.y, q.z)).dot(axis.normalized()); a = 2*math.atan2(v, q.w)
    return (a+math.pi) % (2*math.pi)-math.pi

I4 = M.Identity(4)
class Rig:
    GRIP_F, GRIP_N = 0.078, 0.024   # 손목 → 쥔 지점(손바닥 가운데)
    FTW = 0.75                       # 손 비틀림 중 아래팔이 나눠 갖는 비율
    def __init__(self, obj):
        self.obj = obj; self.B = obj.data.bones; self.PB = obj.pose.bones
        self.Pose = {}; self.flags = []; self.targets = {}
        h = self.head0; t = self.tail0
        self.L_T, self.L_S = self.leng('thigh_l'), self.leng('calf_l')
        self.L_U, self.L_F = self.leng('upperarm_l'), self.leng('lowerarm_l')
        self.ANK_Z, self.ANK_Y = h('foot_l').z, h('foot_l').y
        self.HIP_OFF = h('thigh_l')-h('pelvis')
        self._er = {}
        for s in 'lr':
            S_, E_, W_ = h('upperarm_'+s), h('lowerarm_'+s), h('hand_'+s)
            d = (W_-S_).normalized(); p = E_-S_; p = (p-d*p.dot(d)).normalized(); self._er[s] = p.cross(d)
    def head0(self, n): return self.B[n].head_local.copy()
    def tail0(self, n): return self.B[n].tail_local.copy()
    def R0(self, n): return self.B[n].matrix_local.to_3x3()
    def leng(self, n): return (self.tail0(n)-self.head0(n)).length
    def reset(self): self.Pose.clear(); self.flags = []; self.targets = {}
    def chain_head(self, n):
        b = self.B[n]
        if not b.parent: return self.head0(n)
        return (self.Pose[b.parent.name] @ b.parent.matrix_local.inverted() @ b.matrix_local).translation.copy()
    def set_delta(self, n, D, p=None):
        m = (D @ self.R0(n)).to_4x4(); m.translation = p if p is not None else self.chain_head(n); self.Pose[n] = m
    def inherit(self, n):
        b = self.B[n]; self.Pose[n] = self.Pose[b.parent.name] @ b.parent.matrix_local.inverted() @ b.matrix_local
    # ── 몸통 ──
    def torso(self, P, pelvis, spine1=None, spine2=None, spine3=None, neck=None, head=None, scap=None):
        """각 분절의 절대 회전(Rot). 어깨 위치는 이 결과를 순방향으로 읽는다. scap = {'l':(거상cm,전인cm),...}"""
        spine1 = spine1 if spine1 is not None else pelvis; spine2 = spine2 if spine2 is not None else spine1; spine3 = spine3 if spine3 is not None else spine2
        neck = neck if neck is not None else spine3; head = head if head is not None else neck
        self.Pose['Root'] = self.B['Root'].matrix_local.copy()
        self.set_delta('pelvis', pelvis, P); self.set_delta('spine_01', spine1); self.set_delta('spine_02', spine2); self.set_delta('spine_03', spine3)
        for s in 'lr':
            e, p = (scap or {}).get(s, (0.0, 0.0)); self.set_delta('clavicle_'+s, spine3 @ self.clav_delta(s, e, p))
        self.set_delta('neck_01', neck); self.set_delta('head', head)
    def clav_delta(self, s, elev_cm, prot_cm):
        """쇄골 회전으로 견갑을 표현한다. 거상 + = 어깨가 올라감, 전인 + = 어깨가 앞으로 감. 단위 cm(어깨 끝 이동량 근사)."""
        L = self.leng('clavicle_'+s)
        e = math.degrees(math.asin(max(-1, min(1, elev_cm/100/L)))); p = math.degrees(math.asin(max(-1, min(1, prot_cm/100/L))))
        return (Rz(-p) @ Ry(-e)) if s == 'l' else (Rz(p) @ Ry(e))
    def shoulder_local(self, s, elev_cm=0.0, prot_cm=0.0):
        """몸통이 차렷일 때 견갑 값을 넣은 어깨 위치(뼈대 공간). 몸통 강체 풀이의 입력."""
        c = self.head0('clavicle_'+s); return c+self.clav_delta(s, elev_cm, prot_cm)@(self.head0('upperarm_'+s)-c)
    # ── 다리 ──
    def leg(self, s, K, A, toe, yaw, foot_pitch=0.0, ball_on_floor=False):
        """무릎 K, 발목 A 를 그대로 쓴다. toe = 발끝 방향. foot_pitch + = 뒤꿈치가 들림."""
        Hp = self.chain_head('thigh_'+s)
        dr1 = self.tail0('thigh_'+s)-self.head0('thigh_'+s); dr2 = self.tail0('calf_'+s)-self.head0('calf_'+s)
        hr = V((0, -1, 0)).cross((dr1+dr2).normalized())
        p = (K-Hp)+(K-A); w = min(1.0, p.length/0.08)
        p = (p.normalized()*w+toe*(1-w)).normalized() if p.length > 1e-5 else toe
        hn = p.cross((A-Hp).normalized())
        if hn.length < 1e-6: raise ValueError("leg: 무릎 경첩축을 정할 수 없음 — toe 가 다리와 평행")
        self.set_delta('thigh_'+s, aim_delta(dr1, hr, K-Hp, hn), Hp)
        self.set_delta('calf_'+s, aim_delta(dr2, hr, A-K, hn), K)
        self.set_delta('foot_'+s, Rz(yaw) @ Rx(foot_pitch), A)   # + = 뒤꿈치가 들린다(발끝이 아래로)
        if ball_on_floor: self.set_delta('ball_'+s, Rz(yaw))
        else: self.inherit('ball_'+s)
        self.targets['A_'+s] = A.copy(); self.targets['K_'+s] = K.copy()
    def leg_ik(self, s, A, pole, toe, yaw, foot_pitch=0.0, ball_on_floor=False):
        Hp = self.chain_head('thigh_'+s)
        K, A2, cl, _ = solve_two_bone(Hp, A, self.L_T, self.L_S, pole)
        if cl: self.flags.append('reach_leg_'+s)
        self.leg(s, K, A2, toe, yaw, foot_pitch, ball_on_floor)
    def ankle_from_ball(self, s, ball, yaw, pitch):
        """앞꿈치 고정: 앞꿈치 위치와 뒤꿈치 각도로 발목을 구한다."""
        return ball-(Rz(yaw) @ Rx(pitch))@(self.head0('ball_'+s)-self.head0('foot_'+s))
    # ── 팔 ──
    def hand_frames(self, s):
        h0 = self.head0('hand_'+s); F = (self.head0('middle_01_'+s)-h0).normalized()
        L = self.head0('index_01_'+s)-self.head0('pinky_01_'+s); L = (L-F*L.dot(F)).normalized()
        n = F.cross(L) if s == 'l' else L.cross(F); return F, L, n
    def grip_frame(self, s, F, lat=None):
        F = F.normalized(); L = lat.copy() if lat is not None else (V((-1, 0, 0)) if s == 'l' else V((1, 0, 0)))
        L = L-F*L.dot(F)
        if L.length < 1e-6: raise ValueError("grip_frame: 손 방향과 바 축이 평행 — lat 을 지정할 것")
        L = L.normalized(); n = F.cross(L) if s == 'l' else L.cross(F); return F, L, n
    def arm(self, s, G, F, pole, lat=None, max_reach=0.998):
        """G = 쥔 지점, F = 손목→손끝 방향, pole = 팔꿈치가 나가는 방향, lat = 검지→소지 반대(바 축)."""
        F, L, n = self.grip_frame(s, F, lat)
        W = G-F*self.GRIP_F-n*self.GRIP_N
        Sh = self.chain_head('upperarm_'+s)
        E, W2, cl, p = solve_two_bone(Sh, W, self.L_U, self.L_F, pole, max_reach)
        if cl: self.flags.append('reach_arm_'+s)
        d = (W2-Sh).normalized(); hn = p.cross(d); hr = self._er[s]
        dr1 = self.tail0('upperarm_'+s)-self.head0('upperarm_'+s); dr2 = self.tail0('lowerarm_'+s)-self.head0('lowerarm_'+s)
        self.set_delta('upperarm_'+s, aim_delta(dr1, hr, E-Sh, hn), Sh)
        Df = aim_delta(dr2, hr, W2-E, hn)
        Fr, Lr, nr = self.hand_frames(s); Dh = M((F, L, n)).transposed() @ M((Fr, Lr, nr))
        tw = twist_of(Df.inverted() @ Dh, dr2)
        self.set_delta('lowerarm_'+s, Df @ Q(dr2.normalized(), self.FTW*tw).to_matrix(), E)
        self.set_delta('hand_'+s, Dh, W2)
        self.targets['G_'+s] = G.copy(); self.targets['Gnow_'+s] = W2+F*self.GRIP_F+n*self.GRIP_N
    def fingers(self, s, curl=1.0):
        Fr, Lr, nr = self.hand_frames(s); a = -Lr if s == 'l' else Lr
        def bend(bn, axis, ang):
            b = self.B[bn]
            self.Pose[bn] = self.Pose[b.parent.name] @ b.parent.matrix_local.inverted() @ b.matrix_local @ Q(self.R0(bn).transposed() @ axis, math.radians(ang)).to_matrix().to_4x4()
        for name, k in (('index', 1.0), ('middle', 1.02), ('ring', 1.04), ('pinky', 1.06)):
            for j, ang in ((1, 58), (2, 72), (3, 46)): bend(f"{name}_0{j}_{s}", a, ang*k*curl)
        t_ax = (a*0.55+nr*0.2-Fr*0.8).normalized()
        for j, ang in ((1, 28), (2, 34), (3, 40)): bend(f"thumb_0{j}_{s}", t_ax, ang*curl)
    # ── 적용 ──
    def apply(self):
        for pb in self.PB: pb.matrix_basis = I4   # 이전 프레임 자세가 남지 않게
        for b in self.obj.data.bones:      # 부모 먼저(목록 순서)
            n = b.name
            if n not in self.Pose: continue
            par = (self.Pose[b.parent.name] @ b.parent.matrix_local.inverted() @ b.matrix_local) if b.parent else b.matrix_local
            self.PB[n].matrix_basis = par.inverted() @ self.Pose[n]
