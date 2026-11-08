# SPDX-License-Identifier: GPL-3.0-or-later
"""어깨 고립 묶음 표(SPEC-040 Phase 10) — build_catalog 가 합친다. 키 → (solver, vars, cam, decl)."""
_S = [[3.05, -2.70, 1.55], [0, 0.0, 0.88], 70]; _OH = [[3.90, -3.40, 1.70], [0, 0.0, 1.20], 70]; _BO = [[3.10, -2.70, 1.45], [0, -0.05, 0.80], 70]
_PRN = [[3.30, -2.40, 1.55], [0, -0.05, 0.85], 70]; _SIDE = [[0.50, -3.40, 1.60], [0.05, 0.0, 0.62], 70]; _LIE = [[2.30, -2.60, 2.45], [0, 0.18, 0.62], 70]; _SOT = [[3.60, -2.90, 1.60], [0, 0.02, 0.95], 70]
_FEET = {"support": "feet"}
def _rz(rom, extra=None, cam=None, **v):
    d = {"rom": rom, "support": "feet"}; d.update(extra or {}); return ("shoulder:raise", dict(**v), cam or _S, d)
def _sh(load, extra=None, cam=None, **v):
    d = {"rom": {"elbow": 0}, "support": "feet"}; d.update(extra or {}); return ("shoulder:shrug", dict(load=load, **v), cam or _S, d)   # 견갑 거상은 rom 관절각으로 잴 수 없다(어깨각 0°) — 시트로 확인
TABLE = {
 # 옆 들기
 "lateral_raise__band__shoulders": _rz({"shoulder": 50}, load="band"),
 "lateral_raise__cable__shoulders": _rz({"shoulder": 30}, load="cable", one="r"),
 "leaning_lateral_raise__cable__shoulders": _rz({"shoulder": 30}, {"support": None}, load="cable", one="r", mode="lean"),
 "leaning_lateral_raise__dumbbell__shoulders": _rz({"shoulder": 30}, {"support": None}, load="db", one="r", mode="lean"),
 "lu_raise__dumbbell__shoulders": _rz({"shoulder": 120}, cam=_OH, a1=168.0, bend=8.0, e1=4.0),
 # 앞 들기
 "front_raise__dumbbell__shoulders": _rz({"shoulder": 60}, az=90.0, a0=18.0, a1=90.0, bend=8.0),
 "front_raise__barbell__shoulders": _rz({"shoulder": 60}, az=90.0, a1=88.0, bend=6.0, load="bar"),
 "front_raise__cable__shoulders": _rz({"shoulder": 60}, az=90.0, a1=88.0, bend=6.0, load="cable_bar"),
 "front_raise__band__shoulders": _rz({"shoulder": 60}, az=90.0, a1=88.0, bend=8.0, load="band"),
 "front_raise-scaption__dumbbell__shoulders": _rz({"shoulder": 60}, az=30.0, a1=92.0, bend=8.0, grip="neutral"),
 "plate_raise__other__shoulders": _rz({"shoulder": 60}, az=90.0, a1=95.0, bend=10.0, load="plate", grip="neutral"),
 "plate_raise-overhead__other__shoulders": _rz({"shoulder": 120}, cam=_OH, az=90.0, a1=165.0, bend=10.0, load="plate", grip="neutral", e1=4.0),
 "y_raise__cable__shoulders": _rz({"shoulder": 100}, cam=_OH, az=55.0, a1=150.0, bend=6.0, load="cable", grip="neutral", e1=3.5),
 # 엎드려
 "y_raise__dumbbell__shoulders": ("shoulder:prone", dict(mode="y"), _PRN, {"rom": {"shoulder": 90}, "support": None}),
 "w_raise__dumbbell__shoulders": ("shoulder:prone", dict(mode="w"), _PRN, {"rom": {"elbow": 50}, "support": None}),
 "shrug-incline__dumbbell__traps": ("shoulder:prone", dict(mode="shrug"), _PRN, {"rom": {"elbow": 0}, "support": None}),
 # 옆으로 누워
 "lateral_raise-sidelying__dumbbell__shoulders": ("shoulder:side", dict(mode="lat"), _SIDE, {"rom": {"elbow_r": 0, "shoulder": 25}, "support": None, "fixed_bones": ["spine_03", "pelvis"]}),
 "rear_delt_fly-sidelying__dumbbell__shoulders": ("shoulder:side", dict(mode="rear"), _SIDE, {"rom": {"elbow_r": 0}, "support": None, "fixed_bones": ["spine_03", "pelvis"]}),   # 수평 벌림이라 shoulder(굽힘각)는 거의 그대로 — 시트로 확인
 "external_rotation__dumbbell__shoulders": ("shoulder:side", dict(mode="ext"), _SIDE, {"rom": {"elbow_r": 0}, "support": None, "fixed_bones": ["spine_03", "pelvis"]}),   # 회전은 관절각(rom 키)으로 잴 수 없다 — 아래팔 궤적은 시트로 확인
 # 숙여서
 "rear_delt_fly__dumbbell__shoulders": ("shoulder:bent", dict(mode="fly"), _BO, {"rom": {"arms_open": 100}, "support": "feet"}),
 "face_pull-rear__dumbbell__shoulders": ("shoulder:bent", dict(mode="row"), _BO, {"rom": {"elbow": 50}, "support": "feet"}),
 # 어깨 높이 당기기
 "face_pull__cable__shoulders": ("shoulder:face", dict(mode="face", load="cable"), _S, {"rom": {"elbow": 60}, "support": "feet"}),
 "face_pull__band__shoulders": ("shoulder:face", dict(mode="face", load="band"), _S, {"rom": {"elbow": 60}, "support": "feet"}),
 "face_pull-rear__cable__shoulders": ("shoulder:face", dict(mode="row", load="cable"), _S, {"rom": {"elbow": 50}, "support": "feet"}),
 "rear_delt_fly__cable__shoulders": ("shoulder:face", dict(mode="fly", load="cable"), [[2.60, 3.10, 1.80], [0, -0.10, 1.05], 70], {"rom": {"arms_open": 100}, "support": "feet"}),   # 앞쪽 양옆 케이블 기둥이 몸을 가려 뒤에서 본다(후면 삼각근)
 "rear_delt_fly__band__shoulders": ("shoulder:face", dict(mode="fly", load="band"), _S, {"rom": {"arms_open": 100}, "support": "feet"}),
 "pull_apart__band__shoulders": ("shoulder:face", dict(mode="apart", load="band"), _S, {"rom": {"arms_open": 100}, "support": "feet"}),
 # 회전근
 "external_rotation__band__shoulders": ("shoulder:rotate", dict(dir="ext", load="band"), _S, {"rom": {"elbow_r": 0}, "support": "feet"}),
 "external_rotation__cable__shoulders": ("shoulder:rotate", dict(dir="ext", load="cable"), _S, {"rom": {"elbow_r": 0}, "support": "feet"}),
 "internal_rotation__cable__shoulders": ("shoulder:rotate", dict(dir="int", load="cable"), _S, {"rom": {"elbow_r": 0}, "support": "feet"}),
 # 슈러그
 "shrug__barbell__traps": _sh("bar"),
 "shrug__smith__traps": _sh("smith"),
 "shrug__dumbbell__traps": _sh("db", follow=True, follow_dy=0.0, grip=0.335),
 "shrug__trapbar__traps": _sh("trap", follow=True, follow_dy=0.0, reach=0.975),
 "shrug__cable__traps": _sh("cable"),
 "shrug__machine__traps": _sh("machine"),
 "overhead_shrug__barbell__traps": _sh("bar", cam=_OH, oh=True),
 "overhead_shrug__dumbbell__traps": _sh("db", cam=_OH, oh=True),
 "shrug-jump__barbell__traps": ("shoulder:jump_shrug", dict(), _S, {"rom": {"knee": 20}, "support": None, "fixed_bones": [], "pos_step": 0.08}),
 # 원 그리기
 "halo__kettlebell__shoulders": ("shoulder:circle", dict(mode="halo"), _OH, {"rom": {"elbow": 30}, "support": "feet", "elbow_front": 0.8}),   # 턱 앞을 지날 때 팔꿈치가 실제로 앞·아래를 본다
 "halo-around__kettlebell__fullBody": ("shoulder:circle", dict(mode="waist"), _S, {"rom": {"shoulder": 20}, "support": "feet", "angle_step": 16}),   # 등 뒤·앞에서 손을 바꿔 잡는 순간 팔이 빨리 돈다
 "around_world-arc__dumbbell__chest": ("shoulder:circle", dict(mode="atw"), _LIE, {"rom": {"shoulder": 100}, "support": None, "pos_step": 0.12}),   # 편 팔로 큰 호(약 1.5m)를 반 바퀴에 지난다
 "bus_driver-turn__other__shoulders": ("shoulder:circle", dict(mode="bus"), _S, {"rom": {"elbow_l": 5}, "support": "feet"}),
 # 위로 밀기 나머지
 "sots_press__barbell__shoulders": ("shoulder:sots", dict(), _SOT, {"rom": {"elbow": 70}, "support": "feet", "elbow_front": 0.65, "bar_clear_min": -0.015}),   # 목 뒤에서 머리 뒤를 바짝 지난다 · 스쿼트 바닥에서 몸통이 숙어 가슴 앞 방향이 아래를 향해, 아래로 내린 팔꿈치가 앞으로 잡힌다
 "overhead_carry__dumbbell__shoulders": ("shoulder:carry", dict(), _OH, {"rom": {"knee": 15}, "support": None, "fixed_bones": []}),
}
ASYM = {"lateral_raise__cable__shoulders", "leaning_lateral_raise__cable__shoulders", "leaning_lateral_raise__dumbbell__shoulders", "lateral_raise-sidelying__dumbbell__shoulders", "rear_delt_fly-sidelying__dumbbell__shoulders",
        "external_rotation__dumbbell__shoulders", "external_rotation__band__shoulders", "external_rotation__cable__shoulders", "internal_rotation__cable__shoulders", "bus_driver-turn__other__shoulders", "halo-around__kettlebell__fullBody", "halo__kettlebell__shoulders", "overhead_carry__dumbbell__shoulders"}   # 한 팔 동작·핸들 돌리기·손 바꿔 넘기기·걷기
HOLD = {"halo__kettlebell__shoulders"}   # 반대편으로 건너간 팔의 팔꿈치 방향·아래팔 비틀림이 검사 한도를 넘는다(팔꿈치 방향 0.84 > 상한 0.8) — 기존 영상 유지
FIXO = {}
DENOISE = {}
