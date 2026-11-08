# SPDX-License-Identifier: GPL-3.0-or-later
"""머신 묶음 표(SPEC-040 Phase 12): 키 → (계산식, vars, 카메라, 선언). build_catalog.py 가 합친다. 근거는 실제 수행 관찰 메모(저장소 밖)."""
_MS = [[3.60, -3.20, 1.50], [0, -0.05, 1.00], 70]   # 앉은 상체(밀기·당기기)
_ML = [[3.30, -2.90, 1.30], [0, -0.20, 0.65], 70]   # 앉은 다리
_MA = [[2.40, -3.40, 1.45], [0, -0.20, 0.70], 70]   # 어브/어덕션(정면 쪽)
_LY = [[3.40, -1.10, 1.60], [0, 0.15, 0.62], 70]   # 엎드리거나 누운 몸(옆에서)
_SQ = [[3.45, -2.30, 1.70], [0, 0.20, 0.80], 70]   # 선 썰매 스쿼트
_LP = [[3.80, -0.70, 1.60], [0, 0.12, 0.78], 70]   # 레그 프레스(reps 와 같은 시점)
def _ft(solver, extra=None, cam=_SQ, **v):
    d = {"support": "feet"}; d.update(extra or {}); return ("machine:"+solver, dict(**v), cam, d)
def _seat(solver, extra=None, cam=_MS, **v):
    d = {"support": None, "fixed_bones": ["pelvis"]}; d.update(extra or {}); return ("machine:"+solver, dict(**v), cam, d)
TABLE = {
 "leg_extension__machine__quads": _seat("leg_ext", {"rom": {"knee": 60}}, _ML, mode="ext"),
 "seated_leg_curl__machine__hamstrings": _seat("leg_ext", {"rom": {"knee": 70}}, _ML, mode="curl"),
 "seated_leg_curl__band__hamstrings": _seat("leg_ext", {"rom": {"knee": 70}}, _ML, mode="curl", load="band"),
 "hip_abduction__machine__glutes": _seat("abduct", {"rom": {"legs_open": 40}}, _MA, mode="abd"),
 "hip_adduction__machine__glutes": _seat("abduct", {"rom": {"legs_open": 40}}, _MA, mode="add"),
 "chest_press__machine__chest": _seat("mpress", {"rom": {"elbow": 60}}),
 "incline_chest_press__machine__chest": _seat("mpress", {"rom": {"elbow": 60}}, dir=35.0),
 "chest_press-decline__machine__chest": _seat("mpress", {"rom": {"elbow": 60}}, dir=-25.0),
 "chest_press-onearm__machine__chest": _seat("mpress", {"rom": {"elbow_r": 60}}, one=True),
 "chest_press__cable__chest": _seat("mpress", {"rom": {"elbow": 60}}, load="cable"),
 "chest_press__band__chest": _seat("mpress", {"rom": {"elbow": 60}}, load="band"),
 "shoulder_press_machine__machine__shoulders": _seat("mpress", {"rom": {"elbow": 60}}, shoulder=True),
 "pec_deck__machine__chest": _seat("pec_deck", {"rom": {"arms_open": 60}}),
 "pec_deck-seated__cable__chest": _seat("pec_deck", {"rom": {"arms_open": 60}}, load="cable"),
 "reverse_pec_deck__machine__shoulders": _seat("pec_deck", {"rom": {"arms_open": 60}}, mode="rev"),
 "high_row__machine__back": _seat("mrow", {"rom": {"elbow": 50}}, mode="high"),
 "high_row__cable__back": _seat("mrow", {"rom": {"elbow": 50}}, mode="high", load="cable"),
 "low_row__machine__back": _seat("mrow", {"rom": {"elbow": 50}}, mode="low"),
 "chest_supported_row__machine__back": _seat("mrow", {"rom": {"elbow": 50}}, mode="chest"),
 "lateral_raise_machine__machine__shoulders": _seat("lat_machine", {"rom": {"shoulder": 50}}),
 "arm_extension_machine__machine__triceps": _seat("tri_machine", {"rom": {"elbow": 80}, "elbow_front": 0.8}, mode="arm"),   # 위팔을 앞 패드에 얹어 팔꿈치가 앞을 본다
 "overhead_ext_machine__machine__triceps": _seat("tri_machine", {"rom": {"elbow": 80}, "elbow_front": 0.8}, mode="over", ov_ux=0.80, ov_dy=-0.14, ov_dx=0.25),   # 머리 위로 든 위팔에서 팔꿈치는 실제로 앞·위를 본다
 "torso_rotation__machine__abs": _seat("torso_rot", {"rom": {"elbow": 0}}),
 "lying_leg_curl__machine__hamstrings": _seat("lying_curl", {"rom": {"knee": 70}}, _LY),
 "lying_leg_curl__dumbbell__hamstrings": _seat("lying_curl", {"rom": {"knee": 70}}, _LY, load="dumbbell", ax=0.10),
 "chest_press-lying__machine__chest": _seat("lying_press", {"rom": {"elbow": 60}}, _LY),
 "chest_press-stand__cable__chest": _ft("mpress", {"rom": {"elbow": 60}}, _MS, load="cable", stand=True),
 "chest_supported_row__dumbbell__back": _seat("cs_row", {"rom": {"elbow": 50}}, _LY),
 "hack_squat__machine__quads": _ft("sled", {"rom": {"knee": 60}, "support": None}, _SQ),
 "hack_squat-reverse__machine__quads": _ft("sled", {"rom": {"knee": 50}, "support": None}, _SQ, mode="rev", th=28.0, rail=28.0, c=0.50, kb=95.0, pad="chest"),   # 가슴을 대면 깊이 앉을수록 허벅지가 패드에 닿아 무릎 95°까지
 "v_squat-frame__machine__quads": _ft("sled", {"rom": {"knee": 60}, "support": None}, _SQ, mode="vsq", th=12.0, rail=25.0, c=0.40),
 "pendulum_squat-frame__machine__quads": _ft("sled", {"rom": {"knee": 60}, "support": None}, _SQ, mode="pend", th=-14.0),
 "hack_squat-bar__barbell__quads": _ft("bar_hack", {"rom": {"knee": 60}, "bar_clear_min": -0.02}, _SQ, ty=-0.10, by=0.16),   # 바가 허벅지·종아리 뒤를 스치며 오르내린다
 "hack_squat-smith__smith__quads": ("squat_lunge:squat", dict(load="smith", ty=0.14, smith_dy=0.14), _SQ, {"rom": {"knee": 60}, "support": None}),   # 발을 앞에 둬 무게중심이 발 뒤 — 레일에 걸린 바에 기대는 동작이라 지지면 검사 제외
 "seated_leg_press__machine__quads": _seat("lpress", {"rom": {"knee": 60}, "fixed_bones": ["pelvis", "spine_03"]}, _LP),
 "leg_press_calf__machine__calves": _seat("lpress", {"rom": {"ankle": 20}, "fixed_bones": ["pelvis", "spine_03"]}, _LP, ang=45.0, th=-68.0, hip_z=0.50, d0=0.835, off=0.10, calf=True),
}
ASYM = {"chest_press-onearm__machine__chest"}   # 한 팔만 민다
