# SPDX-License-Identifier: GPL-3.0-or-later
"""코어 묶음 표(SPEC-040 Phase 11) — build_catalog.py 가 합친다. 키 → (solver, vars, cam, decl)."""
_CL = [[3.40, -2.20, 1.60], [0, -0.05, 0.25], 70]    # 바닥에 누운 동작(옆 앞에서)
_CS = [[3.30, -1.10, 0.80], [0, 0.10, 0.30], 70]     # 옆으로 누운 동작(몸 앞 낮은 곳에서 — 높이 보면 바로 누운 것처럼 보인다)
_CF = [[0.90, -3.60, 1.90], [0, 0.05, 0.35], 70]     # 다리를 좌우로 넘기는 동작(발쪽에서)
_CP = [[3.40, -2.20, 1.35], [0, -0.70, 0.38], 70]    # 엎드려 짚은 동작(푸시업과 같은 자리)
def _pl(mode, extra=None, cam=None, fixed=("ball_l", "ball_r"), **v):
    d = {"rom": {"elbow": 0}, "support": None, "fixed_bones": list(fixed)}; d.update(extra or {})
    return ("core:pl", dict(mode=mode, **v), cam or _CP, d)
_CH = [[3.40, -3.00, 1.60], [0, 0.08, 1.45], 70]    # 매달린 동작(턱걸이와 같은 자리)
_CC = [[3.20, -2.80, 1.45], [0, 0.0, 1.10], 70]     # 캡틴 체어
_CLS = [[2.90, -2.60, 1.20], [0, -0.10, 0.50], 70]  # 바닥 L-싯
def _hg(mode, extra=None, cam=None, **v):
    d = {"rom": {"hip": 60}, "support": None, "fixed_bones": []}; d.update(extra or {})
    return ("core:hg", dict(mode=mode, **v), cam or _CH, d)
_CSP = [[3.30, -2.70, 1.25], [0, -0.60, 0.35], 70]   # 옆 플랭크(몸 앞쪽에서)
def _sp(mode, extra=None, cam=None, **v):
    d = {"rom": {"lean": 0}, "support": None, "fixed_bones": ["foot_l", "lowerarm_l"]}; d.update(extra or {})
    return ("core:sp", dict(mode=mode, **v), cam or _CSP, d)
_CFR = [[0.90, -3.80, 1.45], [0, 0.0, 0.95], 70]   # 선 동작(정면 가까이서)
_CST = [[2.60, -3.10, 1.50], [0, -0.05, 0.95], 70]  # 선 동작(앞 옆에서)
def _st(mode, equip="db", extra=None, cam=None, fixed=("foot_l", "foot_r"), **v):
    d = {"rom": {"lean": 0}, "support": "feet", "fixed_bones": list(fixed)}; d.update(extra or {})
    return ("core:st", dict(mode=mode, equip=equip, **v), cam or _CST, d)
_CQ = [[3.00, -2.10, 1.35], [0, 0.0, 0.35], 70]     # 바닥에 엎드리거나 네발로 선 동작(몸 가운데가 원점)
_CB = [[3.30, -2.30, 1.55], [0, -0.10, 0.60], 70]   # 벤치·GHD 위 동작
def _bn(mode, extra=None, cam=None, fixed=("pelvis",), **v):
    d = {"rom": {"lean": 0}, "support": None, "fixed_bones": list(fixed)}; d.update(extra or {})
    return ("core:bn", dict(mode=mode, **v), cam or _CB, d)
_CK = [[3.20, -2.40, 1.30], [0, -0.45, 0.50], 70]   # 꿇은 동작
def _kn(mode, extra=None, cam=None, fixed=("calf_l", "calf_r", "ball_l", "ball_r"), **v):
    d = {"rom": {"lean": 0}, "support": None, "fixed_bones": list(fixed)}; d.update(extra or {})
    return ("core:kn", dict(mode=mode, **v), cam or _CK, d)
_CW = [[0.60, -3.70, 1.40], [0, 0.0, 0.85], 70]   # 윈드밀(정면)
def _wm(mode, equip="kb", extra=None, cam=None, **v):
    d = {"rom": {"lean": 30}, "support": "feet", "fixed_bones": ["foot_l", "foot_r"]}; d.update(extra or {})
    return ("core:wm", dict(mode=mode, equip=equip, **v), cam or _CW, d)
_CSE = [[2.90, -2.40, 1.45], [0, 0.0, 0.85], 70]   # 앉은 동작(옆 앞)
def _se(mode, extra=None, cam=None, **v):
    d = {"rom": {"lean": 0}, "support": None, "fixed_bones": ["pelvis", "foot_l", "foot_r"]}; d.update(extra or {})
    return ("core:se", dict(mode=mode, **v), cam or _CSE, d)
def _ms(mode, extra=None, cam=None, fixed=("pelvis", "foot_l", "foot_r"), support=None, **v):
    d = {"rom": {"lean": 0}, "support": support, "fixed_bones": list(fixed)}; d.update(extra or {})
    return ("core:ms", dict(mode=mode, **v), cam or _CB, d)
def _su(mode, extra=None, cam=None, per_frame=False, fixed=("pelvis",), **v):
    d = {"rom": {"lean": 20}, "support": None, "fixed_bones": list(fixed)}; d.update(extra or {})
    return ("core:su", dict(mode=mode, per_frame=per_frame, **v), cam or _CL, d)
TABLE = {
 "crunch-double__bodyweight__abs": _su("crunch_double", {"rom": {"hip": 40}}, fixed=()),
 "crunch-heeltap__bodyweight__abs": _su("heeltap", {"rom": {"elbow": 0}, "ankle_max": 165}, fixed=("foot_l", "foot_r", "pelvis")),
 "crunch-side__bodyweight__abs": _su("side", {"rom": {"lean": 0}}, _CS),
 "dead_bug__bodyweight__abs": _su("dead_bug", {"rom": {"knee": 0, "shoulder": 0}}),
 "flutter-kick__bodyweight__abs": _su("flutter", {"rom": {"hip": 0}}),
 "flutter-scissor__bodyweight__abs": _su("scissor", {"rom": {"legs_open": 10}}),
 "leg_raise_lying__bodyweight__abs": _su("legraise", {"rom": {"hip": 60}, "pos_step": 0.08}, fixed=("spine_03",)),
 "knee_raise_lying__bodyweight__abs": _su("kneeraise", {"rom": {"hip": 60, "knee": 60}}, fixed=("spine_03",)),
 "leg_raise_lying-wiper__bodyweight__abs": _su("wiper", {"rom": {"hip": 0}, "pos_step": 0.09}, _CF, fixed=("spine_03",)),   # 곧은 다리 끝이 좌우로 큰 호를 그린다(발끝 이동이 큼)
 "reverse_crunch__bodyweight__abs": _su("revcrunch", {"rom": {"hip": 20}}, fixed=("spine_03",)),
 "bicycle-cycle__bodyweight__abs": _su("bicycle", {"rom": {"knee_l": 60}}),
 "hollow-rock__bodyweight__abs": _su("hollow_rock", {"rom": {"lean": 0}}, per_frame=True, fixed=()),
 "v_sit-up__bodyweight__abs": _su("vup", {"rom": {"hip": 60}, "pos_step": 0.11}, per_frame=True, fixed=()),   # 브이 업은 손발이 한 박자에 크게 접히는 빠른 동작(손끝 이동이 큼)
 "toe_touch__bodyweight__abs": _su("toetouch", {"rom": {"lean": 20}}),
 "sit_up__bodyweight__abs": _su("situp", {"rom": {"lean": 50}, "ankle_max": 165}, per_frame=True, fixed=("foot_l", "foot_r")),
 "clamshell__bodyweight__glutes": _su("clamshell", {"rom": {"legs_open": 15}}, _CS, fixed=("pelvis", "foot_l")),
 "side_leg_raise__bodyweight__glutes": _su("sideleg", {"rom": {"legs_open": 25}}, _CS),
 "plank__bodyweight__abs": _pl("plank", {"elbow_front": 0.75}),
 "plank-hipdip__bodyweight__abs": _pl("hipdip", {"rom": {"lean": 0}, "elbow_front": 0.75}),
 "plank_high-push__bodyweight__chest": _pl("updown", {"rom": {"elbow": 60}, "elbow_front": 0.75}),
 "plank_high-scap__bodyweight__chest": _pl("scap"),
 "plank-pullthrough__kettlebell__abs": _pl("pullthrough", {"rom": {"elbow": 0}, "elbow_front": 0.6}),
 "plank_high-tap__bodyweight__abs": _pl("tap", {"rom": {"elbow": 0}, "elbow_front": 0.8, "pos_step": 0.09, "angle_step": 20}),
 "mountain_climber__bodyweight__abs": _pl("climber", {"rom": {"knee_l": 60}, "ankle_max": 165, "pos_step": 0.12, "angle_step": 18}, fixed=()),
 "mountain_climber-spider__bodyweight__abs": _pl("spider", {"rom": {"knee_l": 60}, "ankle_max": 165, "pos_step": 0.12, "angle_step": 18}, fixed=()),
 "plank_high-jack__bodyweight__abs": _pl("jack", {"rom": {"legs_open": 10}}, fixed=()),
 "hanging_knee_raise__bodyweight__abs": _hg("knee", {"rom": {"hip": 60, "knee": 60}}),
 "hanging_leg_raise__bodyweight__abs": _hg("leg", {"pos_step": 0.09}),
 "toes_to_bar__bodyweight__abs": _hg("t2b", {"rom": {"hip": 80}, "pos_step": 0.13}),
 "toes_to_bar-knees__bodyweight__abs": _hg("k2e", {"rom": {"hip": 80, "knee": 60}, "pos_step": 0.08}),
 "captain_chair-knee__other__abs": _hg("cc_knee", {"rom": {"hip": 60, "knee": 60}}, _CC),
 "captain_chair-leg__other__abs": _hg("cc_leg", {"pos_step": 0.07}, _CC),
 "l_sit__bodyweight__abs": _hg("lsit", {"rom": {"hip": 0}, "ankle_max": 165}, _CLS),   # L-싯은 발등을 편다
 "side_plank__bodyweight__abs": _sp("hold"),
 "side_plank-crunch__bodyweight__abs": _sp("crunch", {"rom": {"knee_r": 60}, "fixed_bones": ["lowerarm_l"]}),
 "side_plank-rot__bodyweight__abs": _sp("rot", {"rom": {"lean": 0}, "fixed_bones": ["lowerarm_l"], "pos_step": 0.07}),   # 위 팔이 천장에서 몸 아래까지 큰 호를 그린다
 "russian_twist__bodyweight__abs": _su("russian", {"rom": {"lean": 0}, "ankle_max": 165}),   # 발을 든 채 발등을 편다
 "v_sit-tuck__bodyweight__abs": _su("kneetuck", {"rom": {"knee": 60, "hip": 40}, "ankle_max": 165}, fixed=()),
 "hollow-hold__bodyweight__abs": _su("vhold", {"rom": {"lean": 0}, "ankle_max": 165}),
 "side_bend__dumbbell__abs": _st("sidebend", "db", None, _CFR),
 "side_bend__cable__abs": _st("sidebend", "cable", None, _CFR),
 "pallof__band__abs": _st("pallof", "band", {"rom": {"elbow": 50}}),
 "pallof__cable__abs": _st("pallof", "cable", {"rom": {"elbow": 50}}),
 "standing_knee_to_elbow__bodyweight__abs": _st("kte", "none", {"rom": {"knee_r": 60}, "support": None}, _CFR, fixed=("foot_l", "ball_l")),
 "vacuum__bodyweight__abs": _st("vacuum", "none", None, _CFR),
 "woodchop-db__dumbbell__abs": _st("chop", "db", {"rom": {"lean": 10}, "elbow_front": 0.78}, _CFR),
 "woodchop__band__abs": _st("chop", "band", {"rom": {"lean": 10}, "elbow_front": 0.78}, _CFR),
 "woodchop__cable__abs": _st("chop", "cable", {"rom": {"lean": 10}, "elbow_front": 0.78}, _CFR),
 "superman__bodyweight__back": _su("superman", {"rom": {"lean": 0}, "ankle_max": 165}, _CQ),   # 엎드려 발등을 편다
 "bird_dog__bodyweight__glutes": _su("birddog", {"rom": {"knee_r": 60}, "ankle_max": 165}, _CQ, fixed=("calf_l",)),
 "fire_hydrant__bodyweight__glutes": _su("hydrant", {"rom": {"legs_open": 20}, "ankle_max": 165}, [[-3.00, -1.60, 1.60], [0, 0.0, 0.35], 70], fixed=("calf_l",)),
 "decline_sit_up-bench__bodyweight__abs": _bn("dsit", {"rom": {"lean": 40}}, fixed=("foot_l", "foot_r")),
 "decline_sit_up-crunch__bodyweight__abs": _bn("dcrunch", {"rom": {"lean": 20}}, fixed=("foot_l", "foot_r")),
 "leg_raise_lying-decline__bodyweight__abs": _bn("dlegraise", {"rom": {"hip": 60}, "pos_step": 0.08}, [[3.30, -2.70, 1.60], [0, -0.45, 0.70], 70], fixed=("spine_03",)),   # 평지 레그 레이즈와 같이 곧은 다리 끝이 90도 호를 그린다
 "neck_curl__bodyweight__other": _bn("neckcurl", {"rom": {"lean": 0}}, fixed=("pelvis", "foot_l", "foot_r")),
 "neck_ext__bodyweight__other": _bn("neckext", {"rom": {"lean": 0}, "ankle_max": 165}),
 "neck_curl-side__bodyweight__other": _bn("neckside", {"rom": {"lean": 0}}),
 "crunch-ball__other__abs": _bn("ball", {"rom": {"lean": 20}}, fixed=("foot_l", "foot_r")),
 "sit_up-ghd__machine__abs": _bn("ghd", {"rom": {"lean": 50}}, [[3.40, -2.40, 1.90], [0, -0.10, 0.95], 70], fixed=("foot_l", "foot_r")),
 "rollout__other__abs": _kn("rollout", {"rom": {"shoulder": 40}}, [[3.30, -2.60, 1.30], [0, -0.70, 0.40], 70], equip="wheel"),
 "rollout__barbell__abs": _kn("rollout", {"rom": {"shoulder": 30}}, [[3.30, -2.60, 1.30], [0, -0.70, 0.40], 70], equip="barbell"),
 "crunch_kneeling__cable__abs": _kn("cablecrunch", {"rom": {"lean": 30}, "elbow_front": 0.8}, [[3.40, -0.90, 1.50], [0, -0.30, 0.80], 70]),   # 로프를 귀 옆에 쥐면 팔꿈치가 실제로 몸 앞(허벅지 쪽)을 향한다
 "crunch-coaster__machine__abs": _kn("coaster", {"rom": {"hip": 50}}, fixed=()),
 "windmill__kettlebell__abs": _wm("windmill", "kb", cam=[[0.60, -4.30, 1.55], [0, 0.0, 1.05], 70], pole=(0.2, 1, 0)),
 "windmill__dumbbell__abs": _wm("windmill", "db", cam=[[0.60, -4.30, 1.55], [0, 0.0, 1.05], 70], pole=(0.2, 1, 0)),
 "windmill__kettlebell__shoulders": _wm("bentpress", "kb", {"rom": {"lean": 30, "elbow": 40}}, [[0.60, -4.30, 1.55], [0, 0.0, 1.05], 70]),
 "crunch-side__cable__abs": _wm("sidecrunch", "cable", {"rom": {"lean": 0}}),
 "crunch-seat__machine__abs": _se("crunchm", {"rom": {"lean": 25}}),
 "neck_ext__machine__other": _se("neckm"),
 "neck_ext__other__other": _se("harness"),
 "side_bend-roman__bodyweight__abs": _ms("roman", None, [[0.80, -3.90, 1.30], [0, 0.0, 0.95], 70]),
 "plank-reverse__bodyweight__abs": _ms("revplank", {"rom": {"hip": 25}}, [[3.40, -1.10, 1.20], [0, -0.70, 0.35], 70], fixed=("foot_l", "foot_r")),
 "plank_high-inch__bodyweight__abs": _ms("inchworm", {"rom": {"hip": 60}, "pos_step": 0.18, "angle_step": 24.0, "elbow_front": 0.65}, [[3.60, -1.90, 1.40], [0, -0.45, 0.60], 70], fixed=("ball_l", "ball_r")),   # 선 자세에서 바닥까지 접고 손을 플랭크 자리까지 걸어 나가는 큰 동작을 한 번에 담는다(머리·손 이동이 큼), 바닥을 짚으려 팔을 내리는 순간 팔꿈치가 살짝 앞
 "copenhagen__bodyweight__glutes": _sp("copen", {"rom": {"lean": 0}, "fixed_bones": ["foot_r", "lowerarm_l"]}),
}   # 네발 기기 ankle_max 165: 무릎 꿇고 발등을 바닥에 댄다. 우드찹 elbow_front 0.78: 위에서 두 팔을 거의 편 채 몸 앞으로 비스듬히 가로질러 내릴 때 팔꿈치가 몸통 앞쪽을 향한다. 행잉·캡틴 체어 레그 레이즈·토즈 투 바 pos_step: 곧은 다리 끝(발)이 매달린 어깨에서 먼 큰 호를 그린다. 풀스루 elbow_front 0.6: 몸 아래로 손을 뻗어 케틀벨을 끌 때 팔꿈치가 바닥 쪽으로 굽는다. 마운틴 클라이머·숄더 탭 pos_step·angle_step: 달리듯 다리를 바꾸고 손을 빠르게 들어 치는 빠른 동작. 숄더 탭 elbow_front 0.8: 손이 가슴 아래로 건너가 반대 어깨를 칠 때 팔꿈치가 바닥 쪽을 향한다. 마운틴 클라이머 ankle_max 165: 무릎을 당길 때 발등을 펴 발끝이 정강이를 따른다. 팔꿈치 플랭크의 elbow_front 0.75: 어깨를 90° 굽혀 아래팔을 바닥에 대면 팔꿈치가 몸통 앞(바닥) 쪽을 향하는 것이 실제 자세
FIXO = {"bird_dog__bodyweight__glutes": "없음", "fire_hydrant__bodyweight__glutes": "없음", "superman__bodyweight__back": "없음",   # 손·무릎이 하나씩 떨어진다(버드 독)·엎드린 몸은 좌석 고정이 아니다
 "side_plank__bodyweight__abs": "없음", "side_plank-crunch__bodyweight__abs": "없음", "side_plank-rot__bodyweight__abs": "없음",   # 옆 플랭크: 받친 팔꿈치·발은 fixed_bones 로 재고, 위 손은 움직인다
 "plank_high-push__bodyweight__chest": "앞꿈치", "plank-pullthrough__kettlebell__abs": "앞꿈치"}   # 한 손씩 바닥에서 떨어진다 — 쥔 점 고정 판정 제외
ASYM = {"side_bend-roman__bodyweight__abs", "copenhagen__bodyweight__glutes", "windmill__kettlebell__abs", "windmill__dumbbell__abs", "windmill__kettlebell__shoulders", "crunch-side__cable__abs", "crunch-coaster__machine__abs", "neck_curl-side__bodyweight__other", "bird_dog__bodyweight__glutes", "fire_hydrant__bodyweight__glutes", "side_bend__dumbbell__abs", "side_bend__cable__abs", "pallof__band__abs", "pallof__cable__abs", "standing_knee_to_elbow__bodyweight__abs", "woodchop-db__dumbbell__abs", "woodchop__band__abs", "woodchop__cable__abs", "russian_twist__bodyweight__abs", "side_plank__bodyweight__abs", "side_plank-crunch__bodyweight__abs", "side_plank-rot__bodyweight__abs", "plank_high-push__bodyweight__chest", "plank-pullthrough__kettlebell__abs", "plank_high-tap__bodyweight__abs", "mountain_climber__bodyweight__abs", "mountain_climber-spider__bodyweight__abs", "plank-hipdip__bodyweight__abs", "dead_bug__bodyweight__abs", "flutter-kick__bodyweight__abs", "flutter-scissor__bodyweight__abs", "bicycle-cycle__bodyweight__abs", "crunch-side__bodyweight__abs", "clamshell__bodyweight__glutes", "side_leg_raise__bodyweight__glutes", "crunch-heeltap__bodyweight__abs", "leg_raise_lying-wiper__bodyweight__abs"}   # 좌우 번갈아·한쪽 동작
