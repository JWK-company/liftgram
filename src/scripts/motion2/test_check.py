#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""고의로 망친 표본을 검사가 잡는지, 정상 자세를 잘못 떨어뜨리지 않는지 본다. 합성 뼈대라 어디서든 돌아간다. 사용: python3 test_check.py"""
import json, math, unittest
from check import check_joints, angles
def pose(t, stance=0.0):
    """t=0 선 자세 → t=1 앉은 자세. 좌표는 앱과 같다(X 왼쪽+, -Y 앞, Z 위)."""
    bn = {}; a = math.radians(5+25*t); LS, LT = 0.42, 0.44; pose_ = {}
    for s, sg in (('l', 1), ('r', -1)):
        y0 = stance*sg; A = [sg*0.15, y0, 0.08]; K = [sg*0.15, y0-LS*math.sin(a), 0.08+LS*math.cos(a)]; th = math.radians(5+70*t); H = [sg*0.10, K[1]+LT*math.sin(th), K[2]+LT*math.cos(th)]
        H[0] = sg*0.10; bn['foot_'+s] = [A, [A[0], y0-0.10, 0.03]]; bn['ball_'+s] = [[A[0], y0-0.10, 0.03], [A[0], y0-0.17, 0.02]]; bn['calf_'+s] = [K, A]; bn['thigh_'+s] = [H, K]; pose_[s] = H
    P = mid_(pose_['l'], pose_['r']); lean = math.radians(5+30*t); u = [0, -math.sin(lean), math.cos(lean)]
    def up(d): return [P[0], P[1]+u[1]*d, P[2]+u[2]*d]
    names = (('pelvis', 0, .08), ('spine_01', .08, .2), ('spine_02', .2, .32), ('spine_03', .32, .46), ('neck_01', .46, .55), ('head', .55, .72))
    for n, a_, b_ in names: bn[n] = [up(a_), up(b_)]
    for s, sg in (('l', 1), ('r', -1)):
        C = up(.42); C[0] = sg*.03; S = [sg*.18, C[1], C[2]]; E_ = [sg*.22, S[1]+.04, S[2]-.28]; W = [sg*.22, E_[1]-.26, E_[2]-.02]
        bn['clavicle_'+s] = [C, S]; bn['upperarm_'+s] = [S, E_]; bn['lowerarm_'+s] = [E_, W]; bn['hand_'+s] = [W, [W[0], W[1]-.08, W[2]]]
    return dict(flags=[], bones=bn, bar=None, load=[], fixed=['foot_l', 'foot_r'], grip_err={}, grip_pt={}, zmin=0.0, bar_clear=None, self_pen=0.0, prop_pen=0.0, twist={'upperarm_l': 10.0, 'upperarm_r': -10.0}, front={'pelvis': [0, -1, 0]})
def mid_(a, b): return [(a[i]+b[i])/2 for i in range(3)]
N = 21
def good(**k): return json.loads(json.dumps(dict(nf=N, frames=[pose(i/(N-1), **k) for i in range(N)])))   # 뼈끼리 좌표를 나눠 쓰지 않게
E = dict(solver="x:y", fixed="발", loop="pingpong", asym=False, decl=dict(support=None, rom=dict(knee=30)))
def fails(J, e=E): return check_joints(J, e)
def flip_knee(J, s='l', frames=None):
    for f in J["frames"] if frames is None else [J["frames"][i] for i in frames]:
        b = f["bones"]; K, H, A = b['calf_'+s][0], b['thigh_'+s][0], b['foot_'+s][0]
        # 대칭점으로 옮긴다(길이 유지)
        t = sum((K[i]-H[i])*(A[i]-H[i]) for i in range(3))/sum((A[i]-H[i])**2 for i in range(3)); P = [H[i]+(A[i]-H[i])*t for i in range(3)]; n = [2*P[i]-K[i] for i in range(3)]
        b['calf_'+s][0][:] = n; b['thigh_'+s][1][:] = n
class Bad(unittest.TestCase):
    def has(self, J, word, e=E): fl = fails(J, e); self.assertTrue(any(w in x for w in word.split("|") for x in fl), f"{word} 를 못 잡음: {fl[:4]}")
    def _bent_elbow(self, front):
        J = good(); f = J["frames"][5]; b = f["bones"]; S = b['upperarm_l'][0]; E_ = [S[0], S[1]-.3, S[2]]; W = [S[0], S[1]-.3, S[2]-.27]; b['upperarm_l'][1] = list(E_); b['lowerarm_l'] = [list(E_), list(W)]; b['hand_l'][0] = list(W); f["front"]['spine_03'] = front; return J
    def test_elbow_front(self): self.has(self._bent_elbow([0, -1, 0]), "의심(l")
    def test_elbow_back_ok(self): self.assertFalse([x for x in fails(self._bent_elbow([0, 1, 0])) if "역방향" in x and "(l," in x])
    def _e(self, **d): return dict(E, decl=dict(E["decl"], **d))
    def test_rom_missing(self): self.has(good(), "rom", dict(E, decl=dict(support=None)))
    def test_rom_static(self):
        J = good(); F0 = J["frames"][0]; J["frames"] = [json.loads(json.dumps(F0)) for _ in J["frames"]]; self.has(J, "움직임")
    def test_unknown_decl(self): self.has(good(), "모르는 선언", self._e(ankel_max=160))
    def test_cap(self): self.has(good(), "완화 상한", self._e(bar_clear_min=-9))
    def test_range_three(self): self.has(good(), "3개", self._e(knee=[[0, 180]]))
    def test_missing_measure(self):
        J = good(); [f.pop("zmin") for f in J["frames"]]; self.has(J, "측정값 빠짐")
    def test_cycle_still_symmetric(self):
        J = good(); b = J["frames"][5]["bones"]; b['hand_l'][0][2] += 0.25; self.has(J, "좌우", dict(E, loop="cycle"))
    def test_foot_yaw(self):
        J = good()
        for f in J["frames"][3:]: f["bones"]['ball_l'][0][0] += 0.05
        self.has(J, "고정점")
    def test_ankle_max_side(self):
        J = good(); self.assertEqual([x for x in fails(J, self._e(ankle_max_r=170)) if "발목" in x], [x for x in fails(J) if "발목" in x])
    def test_knee_flip(self): J = good(); flip_knee(J); self.has(J, "경첩")
    def test_knee_flip_deep_only_right(self): J = good(); flip_knee(J, 'r', [N-1]); self.has(J, "경첩|발목")   # 깊게 뒤집히면 발목 각도에서 먼저 드러난다
    def test_foot_slide(self):
        J = good()
        for i, f in enumerate(J["frames"]):
            for n in ('foot_l', 'ball_l'):
                for pt in f["bones"][n]: pt[1] += 0.001*i
            f["bones"]['calf_l'][1][1] += 0.001*i
        self.has(J, "고정점")
    def test_catalog_fixed_used_when_solver_omits(self):
        J = good()
        for i, f in enumerate(J["frames"]):
            f["fixed"] = []
            for n in ('foot_l', 'ball_l'):
                for pt in f["bones"][n]: pt[1] += 0.001*i
            f["bones"]['calf_l'][1][1] += 0.001*i
        self.has(J, "고정점")
    def test_jump_frame(self):
        J = good()
        for n in ('pelvis', 'spine_01', 'spine_02', 'spine_03'):
            for pt in J["frames"][N//2]["bones"][n]: pt[1] += 0.15
        self.has(J, "프레임당")
    def test_bone_stretch(self): J = good(); J["frames"][5]["bones"]['thigh_l'][1][2] -= 0.02; self.has(J, "뼈 길이")
    def test_reach(self): J = good(); J["frames"][5]["flags"] = ["reach_arm_l"]; self.has(J, "도달")
    def test_bar_through(self): J = good(); J["frames"][5]["bar_clear"] = -0.03; self.has(J, "바 관통")
    def test_floor(self): J = good(); J["frames"][5]["zmin"] = -0.03; self.has(J, "바닥")
    def test_self_pen(self): J = good(); J["frames"][5]["self_pen"] = 0.02; self.has(J, "몸통 관통")
    def test_prop_pen(self): J = good(); J["frames"][5]["prop_pen"] = 0.03; self.has(J, "소품 관통")
    def test_elbow_flip_by_twist(self): J = good(); J["frames"][5]["twist"]['upperarm_l'] = 178.0; self.has(J, "비틀림")
    def test_spine_kink(self):
        J = good(); b = J["frames"][N//2]["bones"]; b['spine_03'][1][:] = [b['spine_03'][0][0], b['spine_03'][0][1]-0.14, b['spine_03'][0][2]]; self.has(J, "척추")
    def test_hip_hyperext(self): J = good(); J["frames"][0]["front"]['pelvis'] = [0, 1, 0]; J2 = J; f = J2["frames"][0]; b = f["bones"]; b['spine_01'][0][:] = [0, b['pelvis'][0][1], b['pelvis'][0][2]+.1]; b['calf_l'][0][:] = [b['thigh_l'][0][0], b['thigh_l'][0][1]-.3, b['thigh_l'][0][2]-.3]; self.has(J2, "과신전")
    def test_sym(self):
        J = good(); b = J["frames"][N//2]["bones"]; b['lowerarm_l'][1][:] = [b['lowerarm_l'][0][0], b['lowerarm_l'][0][1]+.1, b['lowerarm_l'][0][2]-.24]; b['hand_l'][0][:] = b['lowerarm_l'][1]; self.has(J, "좌우")
    def test_no_decl_fails(self): self.has(good(), "선언 없음", dict(E, decl=None))
    def test_decl_range(self): self.has(good(), "knee 끝", dict(E, decl=dict(support=None, knee=[[0, 180], [0, 180], [150, 180]])))
    def test_ratio(self): self.has(good(), "비율", dict(E, decl=dict(support=None, hip_knee_ratio=[3.0, 5.0])))
    def test_com_out(self):
        J = good()
        for f in J["frames"]: f["load"] = [[[0, -2.0, 1.0], 200]]
        self.has(J, "무게중심", dict(E, decl=dict(support="feet")))
    def test_com_side(self):
        J = good()
        for f in J["frames"]: f["load"] = [[[2.0, 0, 1.0], 200]]
        self.has(J, "무게중심", dict(E, decl=dict(support="feet")))
    def test_cycle_seam(self):
        J = good()
        self.has(J, "프레임당", dict(E, loop="cycle"))
class Good(unittest.TestCase):
    def test_squat_passes(self): self.assertEqual(fails(good()), [])
    def test_lying_knee_ok(self):
        J = good()
        for f in J["frames"]:
            for pts in f["bones"].values():
                for p in pts: p[1], p[2] = p[2], -p[1]   # 뒤로 눕힌 같은 자세
            f["front"]['pelvis'] = [0, 0, 1]
        fl = [x for x in fails(J) if "경첩" in x]; self.assertEqual(fl, [])
    def test_split_stance_com(self):
        J = good(stance=0.12); fl = [x for x in fails(J, dict(E, asym=True, decl=dict(support="feet"))) if "무게중심" in x]; self.assertEqual(fl, [])
unittest.main()
