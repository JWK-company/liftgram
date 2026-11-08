# SPDX-License-Identifier: GPL-3.0-or-later
"""당기기 묶음(SPEC-040 Phase 7·8) 카탈로그 표: 키 → (solver, vars, cam, decl). build_catalog.py 가 합친다."""
_RS = [[3.30, -2.30, 1.45], [0, -0.10, 0.80], 70]   # 숙여 당기기: 옆 앞에서 팔꿈치 길이 보이게
def _rw(load, extra=None, cam=None, **v):
    d = {"rom": {"elbow": 55}, "support": "feet", "bar_clear_min": -0.016, "fixed_bones": ["foot_l", "foot_r"]}; d.update(extra or {})   # 바가 허벅지를 스치고 위에서 배에 닿는 동작(바를 몸 가까이)
    return ("pull:row", dict(load=load, **v), cam or _RS, d)
_US = [[3.10, -3.00, 1.55], [0, 0.0, 1.10], 70]   # 업라이트 로우: 앞 옆에서 팔꿈치 높이 보이게
def _ur(load, extra=None, **v):
    d = {"rom": {"elbow": 60}, "support": "feet", "bar_clear_min": -0.016, "fixed_bones": ["foot_l", "foot_r"]}; d.update(extra or {})   # 바가 몸 앞을 스치며 올라간다
    return ("pull:upright", dict(load=load, **v), _US, d)
_HPC = [[3.20, -2.60, 1.45], [0, -0.05, 0.85], 70]
def _hp(load, extra=None, **v):
    d = {"rom": {"knee": 50, "hip": 60}, "support": "feet", "bar_clear_min": -0.016, "angle_step": 20, "pos_step": 0.09, "fixed_bones": ["ball_l", "ball_r"]}; d.update(extra or {})   # 바가 정강이·허벅지를 스치며 올라가는 폭발 동작
    return ("pull:hpull", dict(load=load, **v), _HPC, d)
_PUC = [[3.40, -3.00, 1.60], [0, 0.08, 1.45], 70]
def _pu(extra=None, **v):
    d = {"rom": {"elbow": 70}, "support": "hang", "fixed_bones": []}; d.update(extra or {})
    return ("pull:puv", v, _PUC, d)
_LPC = [[3.10, -2.50, 1.60], [0, -0.20, 0.95], 70]
def _lp(extra=None, **v):
    d = {"rom": {"elbow": 70}, "support": None}; d.update(extra or {})
    return ("pull:lpv", v, _LPC, d)
_SRC = [[3.20, -1.90, 1.40], [0, -0.30, 0.80], 70]
def _sr(extra=None, **v):
    d = {"rom": {"elbow": 60}, "support": None}; d.update(extra or {})
    return ("pull:srow", v, _SRC, d)
_SAC = [[3.20, -2.40, 1.50], [0, -0.30, 1.10], 70]
_POC = [[2.90, 0.20, 1.80], [0, 0.20, 0.70], 70]
_IRC = [[3.10, -1.60, 1.30], [0, -0.30, 0.55], 70]
def _ir(**v): return ("pull:inv_row", v, _IRC, {"rom": {"elbow": 60}, "support": None, "bar_clear_min": -0.016, "fixed_bones": ["foot_l", "foot_r"]})
_SLC = [[3.10, -1.40, 1.50], [0, 0.10, 0.65], 70]
def _sl(extra=None, **v):
    d = {"rom": {"elbow": 60}, "support": None, "bar_clear_min": -0.016}; d.update(extra or {})
    return ("pull:seal", v, _SLC, d)
_RGC = [[3.40, -2.20, 1.45], [0, -0.70, 0.42], 70]
TABLE = {
 "renegade__dumbbell__back": ("pull:renegade", {}, _RGC, {"rom": {"elbow_r": 60}, "support": None, "fixed_bones": ["ball_l", "ball_r", "hand_l"]}),
 "renegade__kettlebell__back": ("pull:renegade", {"load": "kb", "Wz": 0.195}, _RGC, {"rom": {"elbow_r": 60}, "support": None, "fixed_bones": ["ball_l", "ball_r", "hand_l"]}),
 "seal_row__barbell__back": _sl(),
 "seal_row__dumbbell__back": _sl(load="db", grip=0.24),
 "seal_row-incline__barbell__back": _sl(inc=40.0, up=0.24, back=0.10),
 "chest_supported_t_bar__barbell__back": _sl(load="tbar", inc=40.0, grip=0.22, up=0.24, back=0.10),
 "inverted_row__bodyweight__back": _ir(),
 "inverted_row__smith__back": _ir(prop="smith"),
 "inverted_row-ring__other__back": _ir(prop="ring", grip=0.24, pole0=(0.5, 0.2, -0.8), pole1=(0.4, 0.6, -0.7)),
 "straight_arm_pulldown__cable__back": ("pull:sapd", {}, _SAC, {"rom": {"shoulder": 70}, "support": "feet", "fixed_bones": ["foot_l", "foot_r"]}),
 "straight_arm_pulldown__band__back": ("pull:sapd", {"load": "band"}, _SAC, {"rom": {"shoulder": 70}, "support": "feet", "fixed_bones": ["foot_l", "foot_r"]}),
 "pullover__barbell__back": ("pull:pullover", {}, _POC, {"rom": {"shoulder": 60}, "support": None, "bar_clear_min": -0.016}),
 "pullover__ezbar__back": ("pull:pullover", {"load": "ez", "grip": 0.13}, _POC, {"rom": {"shoulder": 60}, "support": None, "bar_clear_min": -0.016}),
 "pullover__dumbbell__back": ("pull:pullover", {"load": "db", "grip": 0.16}, _POC, {"rom": {"shoulder": 60}, "support": None}),
 "seated_row__cable__back": _sr({"rom": {"elbow": 45}}, gx=0.10, pole1=(0.6, 1.0, -0.2)),
 "seated_row__band__back": _sr({"rom": {"elbow": 45}}, load="band", gx=0.10, pole1=(0.6, 1.0, -0.2)),
 "seated_row__machine__back": _sr(load="machine", th0=4.0, th1=2.0, gx=0.20, dy=-0.02, hz=-0.12, pole1=(0.5, 1.0, -0.3)),
 "seated_row-standing__cable__back": _sr({"rom": {"elbow": 50}, "support": "feet"}, load="standing", th0=12.0, th1=4.0, dy=-0.13, zc=1.10, gx=0.10, pole1=(0.45, 1.0, -0.4)),
 "lat_pulldown-close__cable__back": _lp(load="v", grip=0.06, y1=-0.27, z1=-0.10, pole1=(0.5, 0.8, -0.3)),
 "lat_pulldown-neck__cable__back": _lp({"rom": {"elbow": 70}, "bar_clear_min": -0.016}, neck=True, grip=0.42, th0=0.0, th1=-10.0, y0=-0.06, y1=0.06, z1=0.03, pole1=(0.9, 0.35, -0.6)),
 "lat_pulldown-onearm__cable__back": _lp({"rom": {"elbow_l": 70}}, load="d", grip=0.12, y1=-0.20, z1=-0.06, ftilt=0.1, neutral=True, pole1=(0.7, 0.6, -0.4)),
 "lat_pulldown__band__back": _lp(load="band"),
 "lat_pulldown__machine__back": _lp(load="machine", grip=0.30, y0=-0.18, y1=-0.10, z1=-0.06),
 "pull_up-chin_up__bodyweight__back": _pu({"rom": {"elbow": 70}, "bar_clear_min": -0.016}, sup=True, grip=0.20, slat=-0.9, pole0=(0.5, 0.6, -0.7), pole1=(0.4, 0.9, -0.4)),
 "pull_up-neck__bodyweight__back": _pu(mode="neck", grip=0.42, th1=12.0, dy1=-0.10, top=0.13, pole0=(0.9, 0.05, -0.6), pole1=(1.0, 0.10, -0.5)),
 "pull_up-sternum__bodyweight__back": _pu({"rom": {"elbow": 80}}, th1=-38.0, dy1=0.24, top=0.05, pole1=(0.7, 0.8, -0.4)),
 "pull_up-archer__bodyweight__back": _pu({"rom": {"elbow_l": 70}, "bar_clear_min": -0.016}, mode="archer", grip=0.50, dx=0.17),
 "pull_up-typewriter__bodyweight__back": _pu({"rom": {"elbow": 50}}, mode="typewriter", grip=0.50, dx=0.16),
 "pull_up-onearm__bodyweight__back": _pu({"rom": {"elbow_l": 70}}, mode="onearm"),
 "pull_up-ring__other__back": _pu(prop="ring", grip=0.25, pole0=(0.6, -0.1, -0.8), pole1=(0.6, 0.45, -0.7)),
 "pull_up-kip__bodyweight__back": _pu({"angle_step": 20, "pos_step": 0.12}, thk=[(0.0, 8.0), (0.4, -15.0), (1.0, -8.0)], legs=[(0.0, -12.0, 24.0), (0.4, 45.0, -10.0), (0.75, 25.0, -5.0), (1.0, 12.0, 10.0)]),
 "assisted_pull__machine__back": _pu(assist="machine"),
 "assisted_pull-chinup__machine__biceps": _pu({"rom": {"elbow": 70}, "bar_clear_min": -0.016}, assist="machine", sup=True, grip=0.20, slat=-0.9, pole0=(0.5, 0.6, -0.7), pole1=(0.4, 0.9, -0.4)),
 "assisted_pull__band__back": _pu(assist="band"),
 "dead_hang__bodyweight__back": _pu({"rom": {"elbow": 0}}, mode="hang", e1=2.5, p1=0.5),
 "dead_hang-scap__bodyweight__back": _pu({"rom": {"elbow": 0}}, mode="hang", e1=-4.0, p1=-2.5),
 "high_pull-clean__barbell__fullBody": _hp("bar", {"pos_step": 0.12}),
 "high_pull-snatch__barbell__back": _hp("bar", {"pos_step": 0.13}, grip=0.45, K=[(0.0, 19.0, 74.0), (0.55, 1.5, 0.0)]),
 "high_pull-dl__barbell__fullBody": _hp("bar", {"rom": {"knee": 50, "hip": 60, "elbow": 60}}, arm=True, ext=0.45, grip=0.20),
 "upright_row__barbell__shoulders": _ur("bar"),
 "upright_row__ezbar__shoulders": _ur("ez"),
 "upright_row__smith__shoulders": _ur("smith"),
 "upright_row__dumbbell__shoulders": _ur("db"),
 "upright_row__cable__shoulders": _ur("cable"),
 "upright_row__band__shoulders": _ur("band"),
 "upright_row-cuban__dumbbell__shoulders": _ur("cuban", {"rom": {"elbow": 60, "shoulder": 90}, "twist_step": 30, "angle_step": 20, "pos_step": 0.11}),   # 아래팔 반 바퀴 외회전이 한 동작 안에 들어간다
 "bent_over_row__barbell__back": _rw("bar"),
 "bent_over_row__smith__back": _rw("smith"),
 "bent_over_row__dumbbell__back": _rw("db2", gx=0.25, hdy=-0.06, sdx=0.11, bx=0.06),
 "bent_over_row__kettlebell__back": _rw("kb2", sdx=0.12, bx=0.07),
 "bent_over_row__band__back": _rw("band", grip=0.22, reach=0.975),
 "bent_over_row__cable__back": _rw("cable", grip=0.22, reach=0.975),
 "t_bar_row__barbell__back": _rw("tbar", ax=0.26, toe=14.0, al=14.0, ph=45.0, th=56.0),
 "t_bar_row-meadows__barbell__back": _rw("meadows", {"rom": {"elbow_r": 55}}, al=12.0, ph=38.0, th=55.0),
 "one_arm_row__kettlebell__back": ("pull:one_arm_row", {}, [[-3.0, -2.3, 1.6], [0, -0.2, 0.75], 70], {"rom": {"elbow_r": 30}, "support": None, "fixed_bones": ["foot_r", "calf_l", "hand_l"]}),
 "pendlay_row__barbell__back": _rw("pendlay", {"angle_step": 20}, al=16.0, th=82.0, bar_dy=-0.06, grip=0.27, reach=0.975),   # 바닥에서 폭발적으로 당기는 동작이라 프레임당 각을 조금 푼다
}
ASYM = {"renegade__dumbbell__back", "renegade__kettlebell__back", "lat_pulldown-onearm__cable__back", "pull_up-archer__bodyweight__back", "pull_up-typewriter__bodyweight__back", "pull_up-onearm__bodyweight__back", "t_bar_row-meadows__barbell__back", "one_arm_row__kettlebell__back"}   # 한 팔로 당긴다
_X = None; FIXO = {}; DENOISE = {}
HOLD_WHY = {   # 보류 사유(계산식 없음 — 기존 영상 유지)
 "bent_over_row-gorilla__kettlebell__back": "바닥 케틀벨 두 개 사이에서 번갈아 당길 때 몸통 각·궤적을 바꿔 봐도 케틀벨 몸통이 아래팔·허벅지를 약 2cm 관통",
 "front_lever__bodyweight__back": "몸 전체가 수평으로 매달린 정지 자세 — 지금 매달림 계산(어깨 아래 수직)으로는 무게중심 판정·몸 회전을 못 만든다",
 "front_lever-raise__bodyweight__back": "프런트 레버 자세에서 몸을 들어 올리는 동작 — 위와 같은 이유",
 "back_lever__bodyweight__back": "엎드린 수평 매달림·어깨 과신전 — 팔 비틀림 한계 밖, 전용 계산식 필요",
 "human_flag__bodyweight__abs": "옆으로 누운 몸을 세로 기둥에 수평으로 — 옆 매달림 좌표계가 없다",
 "muscle_up__bodyweight__back": "당기기→바 위로 넘어가는 전환(손목 회전·가슴이 바를 지남)에서 바 관통을 피하는 궤적 미해결",
 "rope_climb__other__back": "줄을 번갈아 잡아 오르는 순환 동작(쥔 점이 계속 바뀜) — 고정 쥔 점 판정과 맞지 않음",
 "pullover__machine__back": "팔꿈치 패드를 미는 회전 머신 — 패드·축 소품 설계가 필요해 이번 범위에서 제외",
 "pull_up-commando__bodyweight__back": "앞뒤로 놓인 바에 손을 앞뒤로 엇갈려 쥐면 맨 위에서 아래팔 비틀림 한계(80°) 초과·팔꿈치 역방향 — 몸통을 옆으로 돌린 전용 자세 필요",
 "high_pull-kb__kettlebell__fullBody": "가운데 모은 두 손을 편 팔로 올리면 아래팔이 배·골반을 6cm 관통 — 스윙형 궤적 전용 계산식 필요",
}
HOLD = set(HOLD_WHY)
