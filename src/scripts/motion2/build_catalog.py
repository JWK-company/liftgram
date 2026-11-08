#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""제작 목록(제작 목록 JSON(저장소 밖)) → catalog.json. 빠진 원형이 있으면 멈춘다.
사용: build_catalog.py <jobs2.json> <catalog.json>  이미 있는 catalog.json 의 solver·vars·cam·status 는 유지한다."""
import json, os, re, sys
# 묶음 → 공백으로 구분한 원형. 고정점·구동은 아래 기본값과 예외로 정한다.
F = {
"squat_lunge": "squat front_squat air_squat box_squat belt_squat goblet_squat squat_dumbbell overhead_squat sumo_squat hatfield_squat spanish_squat sissy wall_sit pistol lunge lunge_bar reverse_lunge overhead_lunge lateral_lunge bulgarian step_up step_down calf_raise calf_raise_bar seated_calf donkey_calf tibialis_raise jump_squat band_walk",
"hinge": "deadlift sumo_deadlift romanian_deadlift stiff_leg rack_pull good_morning jefferson_curl hip_thrust glute_bridge frog_pump kneeling_hip_thrust pull_through kb_swing back_extension reverse_hyper ghr nordic kickback_glute abduction_standing adduction_standing standing_leg_curl",
"h_push": "bench_press incline_press decline_press floor_press squeeze_press svend fly_lying incline_fly cable_crossover low_to_high_fly push_up push_up_decline push_up_incline knee_push_up sphinx_push_up planche_push_up korean_dip dips assisted_dip bench_dip",
"v_push": "overhead_press seated_press behind_neck_press push_press landmine_press landmine_180 pike_pushup handstand handstand_pushup sots_press overhead_carry",
"v_pull": "pull_up assisted_pull lat_pulldown straight_arm_pulldown pullover dead_hang muscle_up rope_climb front_lever back_lever human_flag",
"h_pull": "bent_over_row pendlay_row one_arm_row seal_row t_bar_row chest_supported_t_bar seated_row inverted_row renegade high_pull upright_row",
"arms": "curl drag_curl concentration_curl incline_curl spider_curl preacher_curl overhead_cable_curl cable_lying_curl plate_curl skull_crusher overhead_ext kickback pushdown wrist_curl behind_back_wrist wrist_roller hand_gripper plate_pinch",
"shoulder": "lateral_raise leaning_lateral_raise front_raise plate_raise y_raise w_raise lu_raise rear_delt_fly face_pull pull_apart external_rotation internal_rotation shrug overhead_shrug around_world bus_driver halo",
"core": "crunch crunch_kneeling sit_up decline_sit_up reverse_crunch bicycle v_sit toe_touch hollow dead_bug bird_dog superman plank plank_high side_plank copenhagen mountain_climber leg_raise_lying knee_raise_lying flutter side_leg_raise hanging_knee_raise hanging_leg_raise captain_chair toes_to_bar l_sit dragon_flag planche rollout russian_twist side_bend woodchop pallof windmill standing_knee_to_elbow vacuum clamshell fire_hydrant neck_curl neck_ext",
"machine": "chest_press incline_chest_press pec_deck reverse_pec_deck shoulder_press_machine lateral_raise_machine high_row low_row chest_supported_row arm_extension_machine overhead_ext_machine leg_press leg_press_calf seated_leg_press hack_squat v_squat pendulum_squat leg_extension lying_leg_curl seated_leg_curl hip_abduction hip_adduction torso_rotation",
"olympic_full": "clean clean_jerk snatch muscle_snatch thruster cluster man_maker turkish burpee farmers_walk yoke_walk sled_pull sled_push wall_ball ball_slam battle_rope box_jump broad_jump jumping_jack jump_rope high_knees butt_kick bear_crawl crab_walk figure_8 aerobic boxing climb cycle elliptical hike pilates recumbent row run skate ski skierg snowboard sprint stairs stationary_bike stretch swim treadmill walk yoga",
}
ORDER = list(F)
DEF = {"squat_lunge": ("발", "2관절"), "hinge": ("발", "2관절"), "h_push": ("등", "2관절"), "v_push": ("발", "2관절"), "v_pull": ("손", "2관절"), "h_pull": ("발", "2관절"),
       "arms": ("발", "단관절"), "shoulder": ("발", "단관절"), "core": ("등", "척추"), "machine": ("좌석", "2관절"), "olympic_full": ("없음", "2관절")}
EXC = {
 "calf_raise": ("앞꿈치", "2관절"), "calf_raise_bar": ("앞꿈치", "2관절"), "seated_calf": ("앞꿈치", "단관절"), "donkey_calf": ("앞꿈치", "단관절"), "tibialis_raise": ("발", "단관절"), "wall_sit": ("발", "정지"),
 "hip_thrust": ("등", "2관절"), "glute_bridge": ("등", "2관절"), "frog_pump": ("등", "2관절"), "kneeling_hip_thrust": ("무릎", "2관절"), "back_extension": ("좌석", "척추"), "reverse_hyper": ("좌석", "2관절"), "ghr": ("무릎", "2관절"), "nordic": ("무릎", "2관절"),
 "kickback_glute": ("발", "단관절"), "abduction_standing": ("발", "단관절"), "adduction_standing": ("발", "단관절"), "standing_leg_curl": ("발", "단관절"), "jefferson_curl": ("발", "척추"),
 "push_up": ("손", "2관절"), "push_up_decline": ("손", "2관절"), "push_up_incline": ("손", "2관절"), "knee_push_up": ("손", "2관절"), "sphinx_push_up": ("손", "2관절"), "planche_push_up": ("손", "2관절"), "korean_dip": ("손", "2관절"), "dips": ("손", "2관절"), "assisted_dip": ("손", "2관절"), "bench_dip": ("손", "2관절"),
 "fly_lying": ("등", "단관절"), "incline_fly": ("등", "단관절"), "cable_crossover": ("발", "단관절"), "low_to_high_fly": ("발", "단관절"),
 "seated_press": ("좌석", "2관절"), "pike_pushup": ("손", "2관절"), "handstand": ("손", "정지"), "handstand_pushup": ("손", "2관절"), "sots_press": ("발", "2관절"),
 "lat_pulldown": ("좌석", "2관절"), "straight_arm_pulldown": ("발", "단관절"), "pullover": ("등", "단관절"), "dead_hang": ("손", "견갑"), "front_lever": ("손", "정지"), "back_lever": ("손", "정지"), "human_flag": ("손", "정지"),
 "seal_row": ("등", "2관절"), "chest_supported_t_bar": ("등", "2관절"), "seated_row": ("좌석", "2관절"), "inverted_row": ("손", "2관절"), "renegade": ("손", "2관절"),
 "concentration_curl": ("좌석", "단관절"), "incline_curl": ("등", "단관절"), "spider_curl": ("등", "단관절"), "preacher_curl": ("좌석", "단관절"), "cable_lying_curl": ("등", "단관절"), "skull_crusher": ("등", "단관절"), "hand_gripper": ("좌석", "단관절"), "plate_pinch": ("발", "정지"),
 "shrug": ("발", "견갑"), "overhead_shrug": ("발", "견갑"), "pull_apart": ("발", "단관절"),
 "plank": ("손", "정지"), "plank_high": ("손", "2관절"), "side_plank": ("손", "정지"), "copenhagen": ("손", "정지"), "mountain_climber": ("손", "2관절"), "bird_dog": ("손", "단관절"), "superman": ("등", "척추"), "hanging_knee_raise": ("손", "척추"), "hanging_leg_raise": ("손", "척추"), "captain_chair": ("손", "척추"), "toes_to_bar": ("손", "척추"), "l_sit": ("손", "정지"), "dragon_flag": ("등", "척추"), "planche": ("손", "정지"), "rollout": ("무릎", "척추"), "russian_twist": ("좌석", "척추"), "side_bend": ("발", "척추"), "woodchop": ("발", "척추"), "pallof": ("발", "척추"), "windmill": ("발", "척추"), "standing_knee_to_elbow": ("발", "척추"), "vacuum": ("발", "정지"), "clamshell": ("등", "단관절"), "fire_hydrant": ("손", "단관절"), "neck_curl": ("등", "단관절"), "neck_ext": ("등", "단관절"),
 "leg_extension": ("좌석", "단관절"), "lying_leg_curl": ("좌석", "단관절"), "seated_leg_curl": ("좌석", "단관절"), "hip_abduction": ("좌석", "단관절"), "hip_adduction": ("좌석", "단관절"), "pec_deck": ("좌석", "단관절"), "reverse_pec_deck": ("좌석", "단관절"), "lateral_raise_machine": ("좌석", "단관절"), "arm_extension_machine": ("좌석", "단관절"), "overhead_ext_machine": ("좌석", "단관절"), "torso_rotation": ("좌석", "척추"),
 "leg_press": ("좌석", "2관절"), "seated_leg_press": ("좌석", "2관절"), "leg_press_calf": ("좌석", "단관절"), "hack_squat": ("발", "2관절"), "v_squat": ("발", "2관절"), "pendulum_squat": ("발", "2관절"),
}
SYM_OFF = {"bulgarian", "lunge", "lunge_bar", "reverse_lunge", "overhead_lunge", "lateral_lunge", "step_up", "step_down", "pistol", "one_arm_row", "renegade", "side_bend", "windmill", "woodchop", "side_plank", "russian_twist", "concentration_curl"}
CYCLE = {"run", "sprint", "walk", "treadmill", "cycle", "stationary_bike", "recumbent", "elliptical", "row", "skierg", "stairs", "swim", "hike", "ski", "skate", "bear_crawl", "crab_walk", "high_knees", "butt_kick", "jump_rope", "jumping_jack", "aerobic", "boxing", "battle_rope", "mountain_climber", "bicycle", "flutter", "burpee", "clean", "clean_jerk", "snatch", "muscle_snatch", "thruster", "cluster", "man_maker", "turkish", "wall_ball", "ball_slam", "box_jump", "broad_jump", "sled_pull", "sled_push", "farmers_walk", "yoke_walk", "overhead_carry", "rope_climb", "muscle_up"}   # kb_swing 은 왕복(REV-071)
FAM_OF = {}
for fam, s in F.items():
    for a in s.split():
        if a in FAM_OF: raise SystemExit(f"원형이 두 묶음에 있음: {a} {FAM_OF[a]} {fam}")
        FAM_OF[a] = fam
CAMS = {"squat__barbell__quads": [[3.45, -2.30, 1.70], [0, 0.02, 0.78], 70], "deadlift__barbell__back": [[3.05, -2.70, 1.55], [0, 0.02, 0.78], 70], "bench_press__barbell__chest": [[2.30, -2.60, 2.45], [0, 0.18, 0.62], 70]}
SOLVER = {"squat__barbell__quads": "big3:squat", "deadlift__barbell__back": "big3:deadlift", "bench_press__barbell__chest": "big3:bench"}
# 원형 선언: 시작(t=0)·중간(t=0.5)·끝(t=1) 관절각 범위. 값은 코칭 교재의 통상 범위와 시험본 컨펌을 근거로 한다(SPEC-040).
DECL = {
 "squat__barbell__quads": {"rom": {"knee": 100}, "knee": [[160, 180], [85, 145], [45, 75]], "hip": [[150, 180], [70, 150], [40, 85]], "lean": [[5, 25], [15, 50], [20, 50]], "elbow": [[35, 90], [35, 90], [35, 90]], "bar_axis": "z", "bar_z_span": [0.40, 0.60], "hip_knee_ratio": [0.5, 1.3], "support": "feet", "hip_below_knee_end": True},
 "deadlift__barbell__back": {"rom": {"hip": 90}, "knee": [[160, 180], [115, 165], [80, 115]], "hip": [[155, 180], [85, 135], [40, 75]], "lean": [[-3, 12], [25, 60], [45, 68]], "elbow": [[165, 180], [165, 180], [165, 180]], "bar_axis": "z", "bar_z_span": [0.45, 0.65], "hip_knee_ratio": [0.8, 2.2], "support": "feet"},
 "bench_press__barbell__chest": {"rom": {"elbow": 70}, "knee": [[75, 125], [75, 125], [75, 125]], "elbow": [[160, 180], [85, 135], [65, 100]], "bar_axis": "yz", "bar_y_span": [0.06, 0.18], "bar_z_span": [0.28, 0.45], "support": None},
}
# 동작 문구로 원형 값을 바로잡는다(변형이 원형과 다른 경우). 공중·이동이면 고정점 없음, 한쪽 동작은 비대칭, 왕복이 아니면 순환.
RE_AIR = re.compile(r"\b(jump|jumping|pogo|tuck|hop|plyo)", re.I); RE_MOVE = re.compile(r"\b(walk|carry|inchworm|taps?|jack|crawl|climb)", re.I)
RE_ONE = re.compile(r"\b(single|one[- ](arm|leg|hand)|archer|meadows|suitcase|unilateral|alternat)", re.I); RE_LOOP = re.compile(r"\b(walk|carry|figure|around the world|halo|roller|climb)", re.I)
RE_KNEEL = re.compile(r"\bkneeling\b", re.I); RE_LYING = re.compile(r"\b(side lying|lying)\b", re.I); RE_SEAT = re.compile(r"\bseated\b", re.I); RE_STAND = re.compile(r"\bstanding\b", re.I)
KEEP_CYCLE = {"figure_8", "climb", "around_world", "halo", "wrist_roller", "band_walk"}
FIX_BY_FULL = {"clean": "발", "clean_jerk": "발", "snatch": "발", "muscle_snatch": "발", "thruster": "발", "cluster": "발", "wall_ball": "발", "ball_slam": "발", "battle_rope": "발", "cycle": "좌석", "stationary_bike": "좌석", "recumbent": "좌석", "row": "좌석", "elliptical": "발", "skierg": "발"}
STATIC_MOVES = re.compile(r"\b(dip|pull through|crunch|rotation|raise)\b", re.I)
def refine(arch, fx, dr, asym, loop, text):
    fx = FIX_BY_FULL.get(arch, fx)
    if RE_AIR.search(text) or RE_MOVE.search(text): fx = "없음"
    if RE_KNEEL.search(text) and fx == "발": fx = "무릎"
    if RE_LYING.search(text) and fx in ("발", "좌석"): fx = "등"
    if RE_SEAT.search(text) and fx == "발": fx = "좌석"
    if RE_STAND.search(text) and fx == "좌석": fx = "발"
    if dr == "정지" and STATIC_MOVES.search(text): dr = "척추"
    if arch in ("dead_bug", "flutter", "side_leg_raise", "leg_raise_lying", "pallof") and dr == "척추": dr = "단관절"
    if RE_ONE.search(text): asym = True
    if arch in KEEP_CYCLE or RE_LOOP.search(text): loop = "cycle"
    return fx, dr, asym, loop
# 대표 동작(Phase 2): 키 → (계산식, 카메라, 선언)
_S = [[3.05, -2.70, 1.55], [0, 0.0, 0.88], 70]
REPS = {
 "romanian_deadlift__barbell__hamstrings": ("reps:rdl", _S, {"rom": {"hip": 60}, "knee": [[165, 180], [150, 178], [135, 165]], "hip": [[150, 180], [110, 160], [70, 115]], "elbow": [[160, 180], [160, 180], [160, 180]], "bar_axis": "z", "support": "feet"}),
 "overhead_press__barbell__shoulders": ("reps:ohp", [[3.90, -3.40, 1.70], [0, 0.0, 1.20], 70], {"rom": {"elbow": 100}, "elbow": [[30, 90], [50, 150], [160, 180]], "knee": [[165, 180], [165, 180], [165, 180]], "support": "feet", "bar_axis": "yz"}),
 "curl__dumbbell__biceps": ("reps:curl", _S, {"rom": {"elbow": 90}, "elbow": [[160, 180], [90, 130], [35, 60]], "knee": [[165, 180], [165, 180], [165, 180]], "support": "feet"}),
 "lateral_raise__dumbbell__shoulders": ("reps:lateral", _S, {"rom": {"shoulder": 50}, "elbow": [[150, 178], [150, 178], [150, 178]], "knee": [[165, 180], [165, 180], [165, 180]], "support": "feet"}),
 "pushdown__cable__triceps": ("reps:pushdown", [[3.85, -1.45, 1.55], [0, -0.12, 0.95], 70], {"rom": {"elbow": 70}, "elbow": [[70, 90], [110, 150], [165, 180]], "knee": [[165, 180], [165, 180], [165, 180]], "support": "feet"}),
 "calf_raise__bodyweight__calves": ("reps:calf", _S, {"rom": {"ankle": 20}, "ankle_max": 162, "knee": [[165, 180], [165, 180], [165, 180]], "support": "feet", "fixed_bones": ["ball_l", "ball_r"]}),
 "bulgarian__dumbbell__quads": ("reps:bulgarian", [[3.25, -2.30, 1.50], [0, 0.05, 0.75], 70], {"rom": {"knee_l": 50}, "ankle_max_r": 168, "knee_l": [[140, 180], [95, 150], [70, 110]], "knee_r": [[78, 180], [70, 160], [60, 120]], "support": None, "fixed_bones": ["foot_l", "foot_r"]}),
 "fly_lying__dumbbell__chest": ("reps:fly", [[2.30, -2.60, 2.45], [0, 0.18, 0.62], 70], {"rom": {"arms_open": 100}, "elbow": [[150, 178], [130, 170], [125, 165]], "support": None}),
 "hip_thrust__barbell__glutes": ("reps:hip_thrust", [[1.70, -3.30, 1.70], [0, -0.30, 0.50], 70], {"rom": {"hip": 40}, "bar_clear_min": -0.016, "knee": [[80, 110], [65, 110], [60, 110]], "support": None}),
 "push_up__bodyweight__chest": ("reps:push_up", [[3.40, -2.20, 1.35], [0, -0.70, 0.38], 70], {"rom": {"elbow": 80}, "elbow": [[160, 180], [100, 150], [60, 110]], "knee": [[165, 180], [165, 180], [165, 180]], "support": None, "fixed_bones": ["ball_l", "ball_r"]}),
 "pull_up__bodyweight__back": ("reps:pull_up", [[3.40, -3.00, 1.60], [0, 0.08, 1.45], 70], {"rom": {"elbow": 70}, "elbow": [[150, 180], [85, 150], [30, 85]], "support": "hang", "fixed_bones": []}),
 "lat_pulldown__cable__back": ("reps:lat_pulldown", [[3.10, -2.50, 1.60], [0, -0.20, 0.95], 70], {"rom": {"elbow": 70}, "elbow": [[150, 180], [65, 145], [45, 90]], "support": None}),
 "leg_press__machine__quads": ("reps:leg_press", [[3.80, -0.70, 1.60], [0, 0.12, 0.78], 70], {"rom": {"knee": 60}, "knee": [[150, 180], [100, 150], [70, 105]], "support": None, "fixed_bones": ["pelvis"]}),
 "one_arm_row__dumbbell__back": ("reps:one_arm_row", [[-3.00, -2.30, 1.60], [0, -0.20, 0.75], 70], {"rom": {"elbow_r": 30}, "elbow_r": [[160, 180], [95, 170], [70, 115]], "support": None, "fixed_bones": ["foot_r", "calf_l", "hand_l"]}),
 "crunch__bodyweight__abs": ("reps:crunch", [[2.60, -1.60, 1.25], [0, -0.05, 0.32], 70], {"rom": {"lean": 15}, "ankle_max": 155, "knee": [[60, 110], [60, 110], [60, 110]], "support": None, "fixed_bones": ["pelvis", "foot_l", "foot_r"]}),
 "clean-power__barbell__fullBody": ("reps:clean", [[3.45, -3.05, 1.65], [0, 0.0, 0.92], 70], {"rom": {"knee": 40, "elbow": 80, "hip": 50}, "angle_step": 38, "pos_step": 0.14, "twist_step": 28, "bar_clear_min": -0.016, "support": "feet", "fixed_bones": ["ball_l", "ball_r"]}),
}
# 앉기·런지 묶음(Phase 3): 키 → (계산식, vars, 카메라, 선언). 근거는 실제 수행 관찰 메모(저장소 밖)
_SQ = [[3.45, -2.30, 1.70], [0, 0.02, 0.78], 70]; _LU = [[3.70, -2.10, 1.60], [0, 0.0, 0.72], 70]; _JP = [[3.70, -2.60, 1.80], [0, 0.02, 0.95], 70]; _LO = [[2.90, -2.10, 1.15], [0, -0.05, 0.45], 70]
def _sq(load, rom=60, extra=None, **v):
    d = {"rom": {"knee": rom}, "knee": [[150, 180], [75, 165], [35, 115]], "support": "feet"}
    if load in ("front", "zercher", "front_db", "front_kb", "band", "goblet", "goblet_kb", "cable", "landmine"): d["elbow_front"] = 0.8
    d.update(extra or {}); return ("squat_lunge:squat", dict(load=load, **v), _SQ, d)
def _lu(kind, load, extra=None, **v):
    fb = {"front": ["ball_r"], "back": ["foot_l"], "curtsy": ["foot_l"], "split": ["foot_l", "ball_r"]}[kind]
    d = {"rom": {"knee_l": 45}, "knee_l": [[150, 180], [85, 178], [70, 120]], "ankle_max_r": 168, "support": None, "fixed_bones": fb, "pos_step": 0.10}
    if load in ("front", "zercher", "front_db", "front_kb", "goblet", "goblet_kb", "landmine"): d["elbow_front"] = 0.8
    d.update(extra or {}); return ("squat_lunge:lunge", dict(kind=kind, load=load, **v), _LU, d)
_STC = [[4.40, -2.70, 1.95], [0, 0.0, 1.08], 70]   # 상자 위로 올라서면 머리·바가 잘려 멀리·높게(시트 확인)
def _st(load, extra=None, **v):
    d = {"rom": {"knee_l": 30}, "support": None, "fixed_bones": ["foot_l"], "pos_step": 0.08, "ankle_max_r": 168}; d.update(extra or {}); return ("squat_lunge:step", dict(load=load, **v), _STC, d)
_CALF = {"rom": {"ankle": 20}, "ankle_max": 162, "knee": [[165, 180], [165, 180], [165, 180]], "support": "feet", "fixed_bones": ["ball_l", "ball_r"]}
_SCALF = {"rom": {"ankle": 20}, "ankle_max": 165, "support": None, "fixed_bones": ["ball_l", "ball_r"]}
_JD = {"rom": {"knee": 40}, "support": None, "fixed_bones": [], "pos_step": 0.10, "angle_step": 30, "ankle_max": 168}
SL = {
 "squat__smith__quads": _sq("smith", ty=-0.02, smith_dy=-0.02),
 "squat__band__quads": _sq("band", ref="sh", ty=-0.07),
 "squat-anderson__barbell__quads": _sq("anderson", pins=True),
 "air_squat__bodyweight__quads": _sq("arms_fwd", ref="sh", ty=-0.02),
 "air_squat-safety__other__quads": _sq("ssb", ty=-0.06),
 "box_squat__barbell__quads": _sq("back", 45, {"knee": [[150, 180], [85, 165], [65, 110]]}, box=True, a1=16.0, drop=-0.03, ty=-0.09),
 "belt_squat__machine__quads": _sq("belt", 60, {"support": None}, ref="sh", ty=-0.07, a1=36.0),
 "front_squat__barbell__quads": _sq("front", ty=-0.05, a1=38.0, drop=0.03, neck=0.3, head=0.2),
 "front_squat__smith__quads": _sq("front", ty=-0.05, a1=36.0, rails=-0.05, neck=0.3, head=0.2),
 "goblet_squat__dumbbell__quads": _sq("goblet", ref="sh", ty=-0.03, a1=38.0, toe=25.0),
 "goblet_squat__kettlebell__quads": _sq("goblet_kb", ref="sh", ty=-0.03, a1=38.0, toe=25.0),
 "goblet_squat-cable__cable__quads": _sq("cable", ref="sh", ty=-0.03, a1=36.0),
 "goblet_squat-front__dumbbell__quads": _sq("front_db", ref="sh", ty=-0.05, a1=36.0),
 "goblet_squat-front__kettlebell__quads": _sq("front_kb", ref="sh", ty=-0.05, a1=36.0),
 "goblet_squat-landmine__barbell__quads": _sq("landmine", ref="sh", ty=-0.08, a1=32.0),
 "goblet_squat-zercher__barbell__quads": _sq("zercher", ref="sh", ty=-0.03, a1=36.0),
 "hatfield_squat__other__quads": _sq("ssb", 60, {"support": None}, hatfield=True, ty=-0.02, a1=36.0),
 "overhead_squat__barbell__quads": _sq("overhead", ref="sh", ty=0.0, a1=38.0, scap=(2.0, -0.5)),
 "overhead_squat-balance__barbell__fullBody": _sq("balance", 50, {"angle_step": 25, "pos_step": 0.09}, ref="sh", ty=0.0, a1=36.0),
 "overhead_squat-pressunder__barbell__fullBody": _sq("press_under", 50, {"angle_step": 25, "pos_step": 0.09}, ref="sh", ty=0.0, a1=36.0),
 "spanish_squat__band__quads": _sq("chest", 45, {"support": None, "knee": [[150, 180], [85, 165], [65, 120]]}, ref="sh", kband=True, a1=6.0, drop=-0.04, ty=0.05, th_max=25.0),
 "squat_dumbbell__dumbbell__quads": _sq("hang_db", ref="sh", ty=-0.07, hang_out=0.42, hang_fwd=0.06, a1=34.0),
 "sumo_squat__dumbbell__quads": _sq("sumo_db", ref="sh", ty=-0.04, ax=0.33, toe=35.0, a1=22.0, drop=0.0),
 "sumo_squat__kettlebell__quads": _sq("sumo_kb", ref="sh", ty=-0.04, ax=0.33, toe=35.0, a1=22.0, drop=0.0),
 "sumo_squat__barbell__quads": _sq("back", ax=0.33, toe=35.0, a1=22.0, drop=0.0),
 "sumo_squat__smith__quads": _sq("smith", ax=0.33, toe=35.0, a1=22.0, drop=0.0, ty=-0.03, smith_dy=-0.03),
 "wall_sit__bodyweight__quads": _sq("thighs", 1, {"support": None, "knee": [[80, 100], [80, 100], [80, 100]]}, ref="sh", hold=1.0, a1=4.0, drop=0.0, th_fix=0.0, wall="auto"),
 "jump_squat-full__bodyweight__quads": ("squat_lunge:jump", dict(load="swing"), _JP, _JD),
 "jump_squat-bar__barbell__quads": ("squat_lunge:jump", dict(load="back", h=0.16, ty=-0.065), _JP, dict(_JD, rom={"knee": 35})),
 "jump_squat-pogo__bodyweight__calves": ("squat_lunge:jump", dict(load="swing", crouch=0.18, h=0.16), _JP, dict(_JD, rom={"ankle": 20})),
 "jump_squat-tuck__bodyweight__quads": ("squat_lunge:jump", dict(load="tuck", tuck=1.0, h=0.42), _JP, dict(_JD, rom={"knee": 60})),
 "lunge__dumbbell__quads": _lu("front", "hang_db"),
 "lunge__bodyweight__quads": _lu("front", "hips"),
 "lunge__kettlebell__quads": _lu("front", "hang_kb"),
 "lunge-jump__bodyweight__quads": ("squat_lunge:jump_lunge", {}, _LU, {"rom": {"knee_l": 40}, "knee_l": [[70, 125], [55, 180], [55, 180]], "ankle_max_r": 168, "support": None, "fixed_bones": [], "pos_step": 0.12, "angle_step": 32}),   # 공중에서 다리를 바꾼다(REV-070)
 "lunge_bar__barbell__quads": _lu("front", "back"),
 "lunge_bar__smith__quads": _lu("split", "smith", rails=-0.05),
 "lunge_bar-reverse__barbell__quads": _lu("back", "back"),
 "lunge_bar-reverse__smith__quads": _lu("split", "smith", rails=-0.05),
 "overhead_lunge__dumbbell__quads": _lu("front", "overhead_db", oh_rel=-0.02),
 "reverse_lunge__bodyweight__quads": _lu("back", "hips"),
 "reverse_lunge__dumbbell__quads": _lu("back", "hang_db"),
 "reverse_lunge__kettlebell__quads": _lu("back", "hang_kb"),
 "reverse_lunge-landmine__barbell__quads": _lu("back", "landmine"),
 "reverse_lunge-curtsy__bodyweight__quads": _lu("curtsy", "hips"),
 "reverse_lunge-curtsy__dumbbell__quads": _lu("curtsy", "hang_db"),
 "reverse_lunge-curtsy__smith__quads": _lu("split", "smith", rails=-0.05, cross=True),   # 스미스는 제자리 커트시(REV-070)
 "bulgarian__barbell__quads": ("squat_lunge:bg2", dict(load="back"), [[3.25, -2.30, 1.50], [0, 0.05, 0.75], 70], {"rom": {"knee_l": 50}, "ankle_max_r": 168, "knee_l": [[140, 180], [95, 150], [70, 110]], "support": None, "fixed_bones": ["foot_l", "foot_r"]}),
 "bulgarian__smith__quads": ("squat_lunge:bg2", dict(load="smith"), [[3.25, -2.30, 1.50], [0, 0.05, 0.75], 70], {"rom": {"knee_l": 50}, "ankle_max_r": 168, "knee_l": [[140, 180], [95, 150], [70, 110]], "support": None, "fixed_bones": ["foot_l", "foot_r"]}),
 "lateral_lunge-bw__bodyweight__quads": ("squat_lunge:lateral_lunge", dict(load="chest"), _LU, {"rom": {"knee_l": 50}, "support": None, "fixed_bones": ["foot_r"], "pos_step": 0.08}),
 "lateral_lunge-db__dumbbell__quads": ("squat_lunge:lateral_lunge", dict(load="goblet_side"), _LU, {"rom": {"knee_l": 50}, "support": None, "fixed_bones": ["foot_r"], "pos_step": 0.08, "elbow_front": 0.8}),
 "lateral_lunge-squat__bodyweight__quads": ("squat_lunge:lateral_lunge", dict(load="chest", step=False), _LU, {"rom": {"knee_l": 50}, "support": None, "fixed_bones": ["foot_l", "foot_r"]}),
 "step_up__dumbbell__quads": _st("hang_db"),
 "step_up__bodyweight__quads": _st("hips"),
 "step_up__kettlebell__quads": _st("hang_kb"),
 "step_up__barbell__quads": _st("back"),
 "step_up__smith__quads": _st("smith", rails=-0.22),
 "step_up-lateral__bodyweight__quads": _st("hips", lateral=True),
 "step_up-poliquin__bodyweight__quads": _st("hips", {"rom": {"knee_l": 20}}, poliquin=True, h=0.14),
 "step_down__bodyweight__quads": _st("hips", {"rom": {"knee_l": 20}}, down=True, h=0.30),
 "pistol__bodyweight__quads": ("squat_lunge:pistol", dict(kind="pistol"), _LU, {"rom": {"knee_l": 80}, "support": None, "fixed_bones": ["foot_l"], "pos_step": 0.08}),
 "pistol-shrimp__bodyweight__quads": ("squat_lunge:pistol", dict(kind="shrimp", a1=34.0, th1=35.0), _LU, {"rom": {"knee_l": 60}, "support": None, "fixed_bones": ["foot_l"], "pos_step": 0.08}),
 "pistol-skater__bodyweight__quads": ("squat_lunge:pistol", dict(kind="skater", a1=34.0, th1=38.0), _LU, {"rom": {"knee_l": 60}, "support": None, "fixed_bones": ["foot_l"], "pos_step": 0.08}),
 "sissy__bodyweight__quads": ("squat_lunge:sissy", {}, _SQ, {"rom": {"knee": 50}, "ankle_max": 168, "support": None, "fixed_bones": ["ball_l", "ball_r"]}),
 "tibialis_raise__bodyweight__calves": ("squat_lunge:tibialis", {}, _SQ, {"rom": {"ankle": 15}, "ankle_max": 150, "support": None, "fixed_bones": []}),
 "band_walk-walk__band__glutes": ("squat_lunge:band_walk", {}, _LU, {"rom": {"legs_open": 8}, "support": None, "fixed_bones": []}),
 "calf_raise__band__calves": ("squat_lunge:calf2", dict(load="band"), _SQ, _CALF),
 "calf_raise__dumbbell__calves": ("squat_lunge:calf2", dict(load="hang_db"), _SQ, _CALF),
 "calf_raise__machine__calves": ("squat_lunge:calf2", dict(load="machine"), _SQ, _CALF),
 "calf_raise_bar__barbell__calves": ("squat_lunge:calf2", dict(load="back", calf_dy=-0.04), _SQ, _CALF),
 "calf_raise_bar__smith__calves": ("squat_lunge:calf2", dict(load="smith", calf_dy=-0.04), _SQ, _CALF),
 "seated_calf__machine__calves": ("squat_lunge:seated_calf", dict(load="machine"), _LO, _SCALF),
 "seated_calf__barbell__calves": ("squat_lunge:seated_calf", dict(load="back"), _LO, _SCALF),
 "seated_calf__dumbbell__calves": ("squat_lunge:seated_calf", dict(load="hang_db"), _LO, _SCALF),
 "seated_calf__smith__calves": ("squat_lunge:seated_calf", dict(load="smith"), _LO, _SCALF),
 "donkey_calf__machine__calves": ("squat_lunge:donkey", {}, [[3.30, -1.60, 1.40], [0, -0.30, 0.70], 70], dict(_SCALF, fixed_bones=["ball_l", "ball_r", "hand_l", "hand_r"])),
}
# 엉덩이 접기 묶음(Phase 4): 키 → (계산식, vars, 카메라, 선언). 근거는 실제 수행 관찰 메모(저장소 밖)
_HS = [[3.05, -2.70, 1.55], [0, 0.0, 0.80], 70]; _HL = [[2.60, -2.40, 1.25], [0, -0.30, 0.35], 70]; _HB = [[1.70, -3.30, 1.70], [0, -0.30, 0.50], 70]; _HK = [[3.0, -2.3, 1.35], [0, -0.05, 0.55], 70]
_HE = [[3.2, -2.7, 1.7], [0, -0.15, 0.75], 70]; _HF = [[1.3, -4.2, 1.45], [0, 0.0, 0.80], 70]; _HQ = [[2.9, -2.1, 1.15], [0, 0.0, 0.42], 70]
def _hg(load, K=None, extra=None, single=False, **v):
    d = {"rom": {"hip": 40}, "support": None if single or v.get('bstance') else "feet", "fixed_bones": ["foot_l"] if single or v.get('bstance') else ["foot_l", "foot_r"], "pos_step": 0.10, "bar_clear_min": -0.016}
    d.update(extra or {}); vv = dict(load=load, **v)
    if K: vv["K"] = K
    if single: vv["single"] = True
    return ("hinge:hinge", vv, _HS, d)
def _fl(load, K=None, extra=None, **v):
    d = {"rom": {"hip": 50}, "support": "feet", "fixed_bones": ["foot_l", "foot_r"], "pos_step": 0.10, "bar_clear_min": -0.016}; d.update(extra or {}); vv = dict(load=load, **v)
    if K: vv["K"] = K
    return ("hinge:floor", vv, _HS, d)
def _br(load, extra=None, cam=None, **v):
    d = {"rom": {"hip": 20}, "support": None, "bar_clear_min": -0.016, "fixed_bones": ["foot_l", "foot_r"] if not (v.get('slide') or v.get('ball')) else []}; d.update(extra or {}); return ("hinge:bridge", dict(load=load, **v), cam or (_HB if v.get('bench') else _HL), d)
_SL1 = [(0.0, 2.0, 2.0, 1.0), (1.0, 8.0, 22.0, 80.0)]; _SL = [(0.0, 1.0, 1.0, 1.0), (1.0, 1.5, 12.0, 80.0)]; _GM = [(0.0, 2.0, 2.0, 1.0), (1.0, 9.0, 24.0, 76.0)]
_SUMO = dict(ax=0.33, toe=32.0, grip=0.17, bar_dy=-0.075)
HG = {
 "deadlift-deficit__barbell__back": _fl("deficit", fz=0.05, bar_dy=-0.115, K=[(0.0, 1.5, 0.0), (0.55, 9.0, 28.0), (1.0, 19.0, 74.0)]),
 "deadlift__band__back": _fl("band", zb=0.30, grip=0.21, bar_dy=-0.10, K=[(0.0, 1.5, 0.0), (1.0, 12.0, 55.0)]),
 "deadlift__dumbbell__back": _fl("db_side", zb=0.26, reach=0.975, bar_dy=-0.02, K=[(0.0, 1.5, 0.0), (0.55, 14.0, 40.0), (1.0, 30.0, 100.0)]),
 "deadlift__kettlebell__back": _fl("kb1", zb=0.27, bar_dy=-0.03, top_dy=-0.29, ax=0.21, toe=14.0, K=[(0.0, 1.5, 0.0), (1.0, 16.0, 70.0)]),
 "deadlift__smith__back": _fl("smith", bar_dy=-0.115),
 "deadlift__trapbar__back": _fl("trap", zb=0.28, reach=0.975, bar_dy=-0.03, K=[(0.0, 1.5, 0.0), (0.55, 14.0, 40.0), (1.0, 30.0, 100.0)]),
 "sumo_deadlift__barbell__back": _fl("bar", K=[(0.0, 1.5, 0.0), (1.0, 20.0, 66.0)], top_dy=-0.10, **_SUMO),
 "sumo_deadlift__dumbbell__glutes": _fl("db1v", zb=0.24, top_dy=-0.29, K=[(0.0, 1.5, 0.0), (1.0, 22.0, 80.0)], ax=0.33, toe=32.0, bar_dy=-0.04),
 "sumo_deadlift__kettlebell__glutes": _fl("kb1", zb=0.27, top_dy=-0.29, K=[(0.0, 1.5, 0.0), (1.0, 20.0, 72.0)], ax=0.33, toe=32.0, bar_dy=-0.04),
 "rack_pull__barbell__back": _fl("rack", zb=0.50, bar_dy=-0.115, K=[(0.0, 1.5, 0.0), (1.0, 6.0, 40.0)]),
 "romanian_deadlift-bstance__barbell__hamstrings": _hg("bar", bstance=True),
 "romanian_deadlift-bstance__dumbbell__hamstrings": _hg("db2", bstance=True, bar_dy=-0.20),
 "romanian_deadlift-landmine1__barbell__hamstrings": _hg("landmine1", _SL1, single=True, bar_dy=-0.12, top_dy=-0.27),
 "romanian_deadlift-landmine__barbell__hamstrings": _hg("landmine", bar_dy=-0.16, top_dy=-0.30),
 "romanian_deadlift-single__bodyweight__hamstrings": _hg("none", _SL1, single=True, bar_dy=-0.12, top_dy=-0.22),
 "romanian_deadlift-single__dumbbell__hamstrings": _hg("db1", _SL1, single=True, bar_dy=-0.12, top_dy=-0.22),
 "romanian_deadlift-single__kettlebell__hamstrings": _hg("kb1r", _SL1, single=True, bar_dy=-0.12, top_dy=-0.22),
 "romanian_deadlift-sumo__barbell__hamstrings": _hg("bar", [(0.0, 2.0, 2.0, 1.0), (1.0, 10.0, 22.0, 55.0)], top_dy=-0.10, **_SUMO),
 "romanian_deadlift__cable__hamstrings": _hg("cable", bar_dy=-0.16),
 "romanian_deadlift__dumbbell__hamstrings": _hg("db2", bar_dy=-0.20),
 "romanian_deadlift__kettlebell__hamstrings": _hg("kb1", bar_dy=-0.20, top_dy=-0.27),
 "romanian_deadlift__smith__hamstrings": _hg("smith", bar_dy=-0.10, smith_dy=-0.10),
 "stiff_leg__barbell__hamstrings": _hg("bar", _SL, bar_dy=-0.12),
 "stiff_leg__dumbbell__hamstrings": _hg("db2", _SL, bar_dy=-0.18),
 "stiff_leg__smith__hamstrings": _hg("smith", _SL, bar_dy=-0.10, smith_dy=-0.10),
 "good_morning__barbell__back": _hg("back", _GM),
 "good_morning__band__hamstrings": _hg("band_gm", _GM),
 "good_morning-fixed__smith__hamstrings": _hg("smith", _GM, gm=True, smith_dy=0.02),
 "jefferson_curl__barbell__back": _hg("bar", [(0.0, 0.0, 1.0, 1.0), (1.0, 1.0, 5.0, 42.0)], {"rom": {"lean": 30}}, curl=True, box=True, fz=0.30, follow=True),
 "jefferson_curl__dumbbell__back": _hg("db1v", [(0.0, 0.0, 1.0, 1.0), (1.0, 1.0, 5.0, 38.0)], {"rom": {"lean": 30}}, curl=True, box=True, fz=0.30, follow=True, follow_dy=-0.24),
 "kb_swing__kettlebell__glutes": ("hinge:swing", dict(load="kb1"), _HS, {"rom": {"hip": 40}, "support": "feet", "fixed_bones": ["foot_l", "foot_r"], "pos_step": 0.12, "angle_step": 30}),
 "kb_swing__dumbbell__glutes": ("hinge:swing", dict(load="db1"), _HS, {"rom": {"hip": 40}, "support": "feet", "fixed_bones": ["foot_l", "foot_r"], "pos_step": 0.12, "angle_step": 30}),
 "pull_through__cable__glutes": ("hinge:pull_through", dict(load="cable"), _HS, {"rom": {"hip": 40}, "support": "feet", "fixed_bones": ["foot_l", "foot_r"]}),
 "pull_through__band__glutes": ("hinge:pull_through", dict(load="band"), _HS, {"rom": {"hip": 40}, "support": "feet", "fixed_bones": ["foot_l", "foot_r"]}),
 "glute_bridge-ball__other__hamstrings": _br("none", {"ankle_max": 168}, ball=True, th0=-100.0, th1=-118.0),
 "glute_bridge-ham__bodyweight__hamstrings": _br("none", {"ankle_max": 150}, kf=0.30, pitch=-20.0),
 "glute_bridge-slide__bodyweight__hamstrings": _br("none", {"ankle_max": 158, "rom": {"knee": 40}}, slide=True, th0=-112.0, th1=-120.0),
 "glute_bridge__band__glutes": _br("mini"),
 "glute_bridge__barbell__glutes": _br("bar"),
 "glute_bridge__bodyweight__glutes": _br("none"),
 "glute_bridge__dumbbell__glutes": _br("db"),
 "frog_pump__dumbbell__glutes": _br("db", frog=True, th1=-112.0, kf=0.10),
 "hip_thrust-pad__machine__glutes": _br("machine", bench=0.42, th0=-38.0, th1=-92.0),
 "hip_thrust-single__bodyweight__glutes": _br("none", {"ankle_max_r": 170, "fixed_bones": ["foot_l"]}, bench=0.42, th0=-38.0, th1=-92.0, single=True),
 "hip_thrust-single__dumbbell__glutes": _br("db", {"ankle_max_r": 170, "fixed_bones": ["foot_l"]}, bench=0.42, th0=-38.0, th1=-92.0, single=True),
 "hip_thrust__band__glutes": _br("band", bench=0.42, th0=-38.0, th1=-92.0),
 "hip_thrust__bodyweight__glutes": _br("none", bench=0.42, th0=-38.0, th1=-92.0),
 "hip_thrust__dumbbell__glutes": _br("db", bench=0.42, th0=-38.0, th1=-92.0),
 "hip_thrust__smith__glutes": _br("smith", bench=0.42, th0=-38.0, th1=-92.0),
 "kneeling_hip_thrust__band__glutes": ("hinge:kneel", dict(mode="kneel_thrust", load="band"), _HK, {"rom": {"hip": 30}, "support": None, "fixed_bones": ["calf_l", "calf_r"], "ankle_max": 168}),
 "kneeling_hip_thrust__bodyweight__glutes": ("hinge:kneel", dict(mode="kneel_thrust", load="none"), _HK, {"rom": {"hip": 30}, "support": None, "fixed_bones": ["calf_l", "calf_r"], "ankle_max": 168}),
 "kneeling_hip_thrust__smith__glutes": ("hinge:kneel", dict(mode="kneel_thrust", load="smith"), _HK, {"rom": {"hip": 30}, "bar_clear_min": -0.016, "support": None, "fixed_bones": ["calf_l", "calf_r"], "ankle_max": 168}),
 "nordic__bodyweight__hamstrings": ("hinge:kneel", dict(mode="nordic"), _HK, {"rom": {"knee": 40}, "pos_step": 0.09, "support": None, "fixed_bones": ["calf_l", "calf_r"], "ankle_max": 168}),
 "nordic__bodyweight__quads": ("hinge:kneel", dict(mode="reverse_nordic"), _HK, {"rom": {"knee": 30}, "support": None, "fixed_bones": ["calf_l", "calf_r"], "ankle_max": 168}),
 "ghr__machine__hamstrings": ("hinge:kneel", dict(mode="ghr", kz=0.95), _HE, {"rom": {"knee": 50}, "pos_step": 0.11, "support": None, "fixed_bones": ["calf_l", "calf_r"]}),
 "back_extension__bodyweight__back": ("hinge:back_ext", dict(mode="hyper45"), _HE, {"rom": {"hip": 50}, "support": None, "fixed_bones": ["foot_l", "foot_r", "thigh_l", "thigh_r"]}),
 "back_extension__machine__back": ("hinge:back_ext", dict(mode="machine"), _HS, {"rom": {"lean": 30}, "support": None, "fixed_bones": ["pelvis", "foot_l", "foot_r"]}),
 "reverse_hyper__bodyweight__glutes": ("hinge:back_ext", dict(mode="reverse", top=0.46, a=(-22.0, 15.0)), _HE, {"rom": {"hip": 30}, "support": None, "fixed_bones": ["pelvis", "spine_03"]}),
 "reverse_hyper__machine__glutes": ("hinge:back_ext", dict(mode="reverse", top=0.95, a=(-72.0, 6.0), strap=True), _HE, {"rom": {"hip": 50}, "support": None, "fixed_bones": ["pelvis", "spine_03"]}),
 "kickback_glute-pad__machine__glutes": ("hinge:one_leg", dict(mode="kick", load="machine"), _HS, {"rom": {"knee_r": 15}, "support": None, "fixed_bones": ["foot_l"], "ankle_max_r": 170}),
 "kickback_glute__cable__glutes": ("hinge:one_leg", dict(mode="kick", load="cable", lean=32.0), _HS, {"rom": {"legs_open": 20}, "support": None, "fixed_bones": ["foot_l"]}),
 "kickback_glute__band__glutes": ("hinge:quad_kick", dict(load="band"), _HQ, {"rom": {"legs_open": 20}, "support": None, "fixed_bones": ["calf_l", "hand_l", "hand_r"], "ankle_max": 168}),
 "kickback_glute__bodyweight__glutes": ("hinge:quad_kick", dict(load="none"), _HQ, {"rom": {"legs_open": 20}, "support": None, "fixed_bones": ["calf_l", "hand_l", "hand_r"], "ankle_max": 168}),
 "abduction_standing__band__glutes": ("hinge:one_leg", dict(mode="abd", load="band"), _HF, {"rom": {"legs_open": 20}, "support": None, "fixed_bones": ["foot_l"]}),
 "abduction_standing__cable__glutes": ("hinge:one_leg", dict(mode="abd", load="cable"), _HF, {"rom": {"legs_open": 20}, "support": None, "fixed_bones": ["foot_l"]}),
 "adduction_standing__cable__glutes": ("hinge:one_leg", dict(mode="add", load="cable"), _HF, {"rom": {"legs_open": 20}, "support": None, "fixed_bones": ["foot_l"]}),
 "standing_leg_curl__machine__hamstrings": ("hinge:one_leg", dict(mode="curl", load="machine", lean=30.0), _HS, {"rom": {"knee_r": 60}, "support": None, "fixed_bones": ["foot_l"]}),
 "standing_leg_curl__cable__hamstrings": ("hinge:one_leg", dict(mode="curl", load="cable"), _HS, {"rom": {"knee_r": 60}, "support": None, "fixed_bones": ["foot_l"]}),
 "standing_leg_curl-kneeling__machine__hamstrings": ("hinge:quad_kick", dict(load="none", curl=True), _HQ, {"rom": {"knee_r": 60}, "support": None, "fixed_bones": ["calf_l", "hand_l", "hand_r"], "ankle_max": 168}),
}
SL.update(HG)

# 가로로 밀기 묶음(Phase 5): 누워 밀기·플라이·푸시업·딥스·스벤드
_PB = [[2.30, -2.60, 2.45], [0, 0.18, 0.62], 70]; _PI = [[2.60, -2.60, 2.20], [0, 0.10, 0.80], 70]; _PF = [[2.30, -2.40, 1.90], [0, 0.25, 0.25], 70]
_PP = [[3.40, -2.20, 1.35], [0, -0.70, 0.38], 70]; _PD = [[3.20, -2.70, 1.75], [0, 0.0, 1.00], 70]; _PS = [[3.05, -2.70, 1.55], [0, 0.0, 0.95], 70]; _PM = [[2.60, -2.80, 1.70], [0, 0.0, 0.95], 70]
def _pr(load, extra=None, cam=None, **v):
    d = {"rom": {"elbow": 55}, "support": None, "fixed_bones": ["foot_l", "foot_r"], "bar_clear_min": -0.016}; d.update(extra or {})
    inc = v.get("inc", 0.0); c = cam or (_PF if v.get("floor") else _PI if inc > 5 else _PB)
    return ("push:press", dict(load=load, **v), c, d)
def _fy(load="db", extra=None, cam=None, **v):
    d = {"rom": {"arms_open": 70}, "support": None, "fixed_bones": ["foot_l", "foot_r"]}; d.update(extra or {})
    m = v.get("mode", "lying"); c = cam or (_PS if m in ("cross", "low") else _PM if m == "machine" else _PF if v.get("floor") else _PI if v.get("inc", 0) > 5 else _PB)
    return ("push:fly", dict(load=load, **v), c, d)
def _pu(extra=None, **v):
    d = {"rom": {"elbow": 50}, "support": None, "fixed_bones": ["calf_l", "calf_r"] if v.get("knee") else ["ball_l", "ball_r"]}; d.update(extra or {})
    return ("push:push_up", dict(**v), _PP, d)
def _dp(mode, extra=None, **v):
    d = {"rom": {"elbow": 45}, "support": None, "fixed_bones": ["hand_l", "hand_r"]}; d.update(extra or {})
    return ("push:dip", dict(mode=mode, **v), _PD, d)
PUSH = {
 "bench_press-board__barbell__chest": _pr("bar", var="board"),
 "bench_press-close__dumbbell__triceps": _pr("closedb"),
 "bench_press-close_grip_bench_press__barbell__triceps": _pr("bar", grip=0.21),
 "bench_press-close_grip_bench_press__ezbar__triceps": _pr("ez"),
 "bench_press-close_grip_bench_press__smith__triceps": _pr("smith", grip=0.21),
 "bench_press-feetup__barbell__chest": _pr("bar", {"fixed_bones": []}, var="feetup"),
 "bench_press-guillotine__barbell__chest": _pr("bar", grip=0.50, var="guillotine"),
 "bench_press-larsen__barbell__chest": _pr("bar", {"fixed_bones": []}, var="larsen"),
 "bench_press-pin__barbell__chest": _pr("bar", var="pin"),
 "bench_press__cable__chest": _pr("cable"),
 "bench_press__dumbbell__chest": _pr("db"),
 "bench_press__smith__chest": _pr("smith"),
 "decline_press__barbell__chest": _pr("bar", {"fixed_bones": []}, inc=-15.0, bot=-0.20),
 "decline_press__dumbbell__chest": _pr("db", {"fixed_bones": []}, inc=-15.0, bot=-0.20),
 "decline_press__smith__chest": _pr("smith", {"fixed_bones": []}, inc=-15.0, bot=-0.20),
 "floor_press__barbell__chest": _pr("bar", floor=True),
 "floor_press__dumbbell__chest": _pr("db", floor=True),
 "floor_press__kettlebell__chest": _pr("kb", floor=True),
 "incline_press-close__barbell__chest": _pr("bar", grip=0.21, inc=32.0, bot=-0.10),
 "incline_press__barbell__chest": _pr("bar", inc=32.0, bot=-0.10),
 "incline_press__cable__chest": _pr("cable", inc=32.0, bot=-0.10),
 "incline_press__dumbbell__chest": _pr("db", inc=32.0, bot=-0.10),
 "incline_press__smith__chest": _pr("smith", inc=32.0, bot=-0.10),
 "squeeze_press-incline__dumbbell__chest": _pr("squeeze", inc=32.0, bot=-0.12),
 "squeeze_press__dumbbell__chest": _pr("squeeze"),
 "cable_crossover-incline__cable__chest": _fy("cable", inc=32.0),
 "cable_crossover-lying__cable__chest": _fy("cable"),
 "cable_crossover__cable__chest": _fy("cable", {"fixed_bones": ["foot_l", "foot_r"]}, mode="cross"),
 "low_to_high_fly__cable__chest": _fy("cable", mode="low"),
 "fly_lying-decline__dumbbell__chest": _fy("db", {"fixed_bones": []}, inc=-15.0),
 "fly_lying-floor__dumbbell__chest": _fy("db", {"rom": {"arms_open": 50}}, floor=True),
 "fly_lying-lying__band__chest": _fy("band"),
 "incline_fly__dumbbell__chest": _fy("db", inc=32.0),
 "incline_fly-fly__machine__chest": _fy("none", mode="machine"),
 "knee_push_up__bodyweight__chest": _pu({"ankle_max": 170}, knee=True),
 # [보류] "push_up-archer__bodyweight__chest": _pu({"rom": {"elbow_l": 50}}, mode="archer", hand_x=0.30, hand_xr=0.50, gap=0.36),   # 뼈대 검사 불합격(도달·관통) — 기존 영상 유지
 "push_up-clap__bodyweight__chest": _pu({"fixed_bones": ["ball_l", "ball_r"]}, mode="clap"),
 "push_up-deficit__bodyweight__chest": _pu(mode="deficit", hz=0.10, gap=0.13),
 "push_up-diamond__bodyweight__triceps": _pu(mode="diamond", hand_x=0.07),
 "push_up-onearm__bodyweight__chest": _pu({"rom": {"elbow_l": 40}}, mode="onearm", ax=0.34, gap=0.32),
 "push_up-pseudo__bodyweight__chest": _pu(mode="pseudo", hand_x=0.24, hand_dy=0.22),
 "push_up-ring__other__chest": _pu(mode="ring", hand_x=0.24, hz=0.14, gap=0.10),
 "push_up-wide__bodyweight__chest": _pu(mode="wide", hand_x=0.42),
 "push_up_decline__bodyweight__chest": _pu(fz=0.45),
 "push_up_incline__bodyweight__chest": _pu(hz=0.45),
 "sphinx_push_up__bodyweight__triceps": _pu({"elbow_front": 0.8}, mode="sphinx", hand_x=0.12),
 "dips__bodyweight__chest": _dp("bars"),
 "dips-bar__bodyweight__chest": _dp("bar", lean1=35.0),
 "dips-ring__other__chest": _dp("ring"),
 "assisted_dip__machine__triceps": _dp("machine", {"ankle_max": 168}, lean1=10.0),
 "assisted_dip-x__machine__triceps": _dp("machine", {"ankle_max": 168}, lean1=10.0),
 "assisted_dip__band__triceps": _dp("band"),
 "korean_dip__bodyweight__chest": _dp("korean"),
 # [보류] "bench_dip__bodyweight__triceps": _dp("bench", {"fixed_bones": ["hand_l", "hand_r", "foot_l", "foot_r"]}),   # 뼈대 검사 불합격(도달·관통) — 기존 영상 유지
 "svend__other__chest": ("push:svend", {}, _PS, {"angle_step": 18, "rom": {"elbow": 35}, "support": "feet", "fixed_bones": ["foot_l", "foot_r"]}),
}
SL.update(PUSH)

# 위로 밀기 묶음(Phase 6): 머리 위 프레스·푸시 프레스·랜드마인·파이크/물구나무
_VS = [[3.90, -3.40, 1.70], [0, 0.0, 1.20], 70]; _VT = [[3.60, -3.20, 1.50], [0, 0.0, 1.00], 70]; _VF = [[3.20, -2.80, 1.20], [0, -0.30, 0.75], 70]; _VL = [[3.70, -2.90, 1.55], [0, -0.70, 0.95], 70]; _VH = [[3.30, -2.30, 1.30], [0, 0.20, 0.75], 70]
def _op(load, extra=None, pose="stand", **v):
    d = {"rom": {"elbow": 60}, "support": "feet" if pose == "stand" else None, "fixed_bones": ["foot_l", "foot_r"]}; d.update(extra or {})
    return ("vpush:ohp2", dict(load=load, pose=pose, **v), _VS if pose == "stand" else _VT if pose == "seat" else _VF, d)
def _lm(mode, extra=None, **v):
    d = {"rom": {"elbow": 40}, "support": "feet", "fixed_bones": ["foot_l", "foot_r"]}; d.update(extra or {})
    return ("vpush:landmine", dict(mode=mode, **v), _VL, d)
VPUSH = {
 "behind_neck_press__barbell__shoulders": _op("behind", grip=0.32),
 "behind_neck_press__smith__shoulders": _op("smith", {"bar_clear_min": -0.015}, pose="seat", behind=True, grip=0.32),
 "overhead_press-bottomsup__kettlebell__shoulders": _op("bottomsup", {"elbow_front": 0.7}),   # 중립 그립 랙은 팔꿈치가 실제로 앞을 본다
 "overhead_press-bradford__barbell__shoulders": _op("bradford", {"rom": {"elbow": 25}, "elbow_front": 0.7}, grip=0.30),
 "overhead_press__band__shoulders": _op("band"),
 "overhead_press__cable__shoulders": _op("cable"),
 "overhead_press__dumbbell__shoulders": _op("db", pose="seat"),
 "overhead_press__kettlebell__shoulders": _op("kb", {"elbow_front": 0.7}),
 "overhead_press__smith__shoulders": _op("smith", pose="seat"),
 "push_press__barbell__shoulders": _op("bar", {"rom": {"elbow": 60, "knee": 15}, "angle_step": 20, "pos_step": 0.08}, push=True),
 "push_press__dumbbell__shoulders": _op("db", {"rom": {"elbow": 60, "knee": 15}, "angle_step": 20, "pos_step": 0.08}, push=True),
 "push_press__kettlebell__shoulders": _op("kb", {"rom": {"elbow": 60, "knee": 15}, "angle_step": 20, "pos_step": 0.08, "elbow_front": 0.7}, push=True),
 "seated_press-arnold__dumbbell__shoulders": _op("arnold", {"elbow_front": 0.8}, pose="seat"),
 "seated_press-z__barbell__shoulders": _op("bar", pose="floor"),
 "seated_press-z__dumbbell__shoulders": _op("db", pose="floor"),
 "landmine_press__barbell__shoulders": _lm("one", {"elbow_front": 0.7, "rom": {"elbow_r": 50}}),   # 한 손 랜드마인은 팔꿈치가 앞으로 나간다 · 왼손은 허리에 있어 평균 elbow 는 절반만 움직인다
 "landmine_press-squeeze__barbell__chest": _lm("squeeze"),
 "landmine_press-viking__barbell__shoulders": _lm("viking"),
 "landmine_press-squatpress__barbell__fullBody": _lm("squat", {"rom": {"elbow": 40, "knee": 50}, "elbow_front": 0.75}),
 "landmine_180__barbell__abs": _lm("rot", {"rom": {"lean": 0}}),
 "pike_pushup__bodyweight__shoulders": ("vpush:pike", dict(mode="pike"), _VH, {"rom": {"elbow": 50}, "elbow_front": 0.7, "support": None, "fixed_bones": ["ball_l", "ball_r", "hand_l", "hand_r"]}),
 "handstand_pushup__bodyweight__shoulders": ("vpush:pike", dict(mode="hspu"), _VH, {"ankle_max": 170, "rom": {"elbow": 50}, "support": None, "fixed_bones": ["hand_l", "hand_r"]}),
 "handstand-hold__bodyweight__shoulders": ("vpush:pike", dict(mode="hold"), _VH, {"ankle_max": 170, "rom": {"elbow": 0}, "support": None, "fixed_bones": ["hand_l", "hand_r"]}),
}
SL.update(VPUSH)
# 카메라 보정(시트 확인): 머리 위 무게는 위가 잘려 멀리·높게, 옆으로 딛는 동작은 정면 쪽에서
_OH = [[4.10, -2.75, 1.95], [0, 0.02, 1.02], 70]; _LAT = [[1.30, -4.30, 1.45], [0, 0.0, 0.78], 70]
for _k in ("overhead_squat__barbell__quads", "overhead_squat-balance__barbell__fullBody", "overhead_squat-pressunder__barbell__fullBody", "overhead_lunge__dumbbell__quads"): SL[_k] = SL[_k][:2]+(_OH,)+SL[_k][3:]
for _k in ("lateral_lunge-bw__bodyweight__quads", "lateral_lunge-db__dumbbell__quads", "lateral_lunge-squat__bodyweight__quads"): SL[_k] = SL[_k][:2]+(_LAT,)+SL[_k][3:]
HOLD = {"push_up-archer__bodyweight__chest", "bench_dip__bodyweight__triceps"}
FIXO = {"push_up-clap__bodyweight__chest": "앞꿈치", "push_up-onearm__bodyweight__chest": "앞꿈치"}   # 손이 떨어지거나(클랩) 한 손이 등 뒤(한팔) — 쥔 점 고정 판정 제외
LOOP = {"band_walk-walk__band__glutes": "pingpong", "kb_swing__kettlebell__glutes": "pingpong", "kb_swing__dumbbell__glutes": "pingpong"}   # 스윙은 하이크↔어깨 높이 왕복
ASYM = {"landmine_press__barbell__shoulders", "landmine_180__barbell__abs", "sissy__bodyweight__quads", "band_walk-walk__band__glutes", "romanian_deadlift-bstance__barbell__hamstrings", "romanian_deadlift-bstance__dumbbell__hamstrings", "abduction_standing__band__glutes", "abduction_standing__cable__glutes", "adduction_standing__cable__glutes", "standing_leg_curl__machine__hamstrings", "standing_leg_curl__cable__hamstrings", "standing_leg_curl-kneeling__machine__hamstrings", "kickback_glute-pad__machine__glutes", "kickback_glute__cable__glutes", "kickback_glute__band__glutes", "kickback_glute__bodyweight__glutes", "hip_thrust-single__bodyweight__glutes", "hip_thrust-single__dumbbell__glutes"}   # 한 다리 동작   # 한 손은 기둥을 잡는다   # 왕복 재생이 곧 반대 방향 걸음이다
# 팔이 빠른 동작은 Wan 이 움직임을 못 따라가 몸이 지워진다 → 변형 강도를 낮춘다(값은 시험 결과)
DENOISE = {"lat_pulldown__cable__back": 0.25, "lateral_raise__dumbbell__shoulders": 0.25, "curl__dumbbell__biceps": 0.25, "overhead_press__barbell__shoulders": 0.25, "push_up__bodyweight__chest": 0.18, "pull_up__bodyweight__back": 0.25, "clean-power__barbell__fullBody": 0.10, "hip_thrust__barbell__glutes": 0.25, "leg_press__machine__quads": 0.25}
DENOISE.update({'air_squat__bodyweight__quads': 0.22, 'belt_squat__machine__quads': 0.22, 'goblet_squat-front__dumbbell__quads': 0.22, 'goblet_squat-front__kettlebell__quads': 0.22, 'goblet_squat__dumbbell__quads': 0.22, 'hatfield_squat__other__quads': 0.15, 'jump_squat-full__bodyweight__quads': 0.15, 'jump_squat-pogo__bodyweight__calves': 0.15, 'jump_squat-tuck__bodyweight__quads': 0.15, 'lateral_lunge-bw__bodyweight__quads': 0.22, 'lateral_lunge-db__dumbbell__quads': 0.22, 'lateral_lunge-squat__bodyweight__quads': 0.22, 'lunge-jump__bodyweight__quads': 0.15, 'lunge__bodyweight__quads': 0.22, 'lunge__dumbbell__quads': 0.22, 'overhead_lunge__dumbbell__quads': 0.15, 'overhead_squat-balance__barbell__fullBody': 0.22, 'overhead_squat-pressunder__barbell__fullBody': 0.15, 'pistol-shrimp__bodyweight__quads': 0.22, 'pistol-skater__bodyweight__quads': 0.22, 'pistol__bodyweight__quads': 0.15, 'reverse_lunge-curtsy__dumbbell__quads': 0.22, 'reverse_lunge-landmine__barbell__quads': 0.22, 'reverse_lunge__dumbbell__quads': 0.22, 'reverse_lunge__kettlebell__quads': 0.22, 'sissy__bodyweight__quads': 0.15, 'spanish_squat__band__quads': 0.22, 'squat-anderson__barbell__quads': 0.22, 'squat__band__quads': 0.22, 'step_down__bodyweight__quads': 0.22, 'step_up-lateral__bodyweight__quads': 0.15, 'step_up-poliquin__bodyweight__quads': 0.22, 'step_up__barbell__quads': 0.15, 'step_up__bodyweight__quads': 0.15, 'step_up__dumbbell__quads': 0.15, 'step_up__kettlebell__quads': 0.15, 'step_up__smith__quads': 0.15, 'sumo_squat__barbell__quads': 0.22, 'sumo_squat__dumbbell__quads': 0.22})   # Phase 3 1차 불합격(윤곽·지워진 비율) — 몸 윤곽을 덜 바꾸게 낮춤
DENOISE.update({'goblet_squat-front__kettlebell__quads': 0.12, 'sissy__bodyweight__quads': 0.12, 'step_up__barbell__quads': 0.10, 'step_up__smith__quads': 0.10})   # 2차 불합격 4개
# 묶음별 표 파일 tables/<묶음>.py — TABLE(키 → (solver, vars, cam, decl))·ASYM·HOLD·FIXO·DENOISE 를 합친다. 여러 작업자가 이 파일을 동시에 고치지 않게 묶음마다 따로 둔다.
import glob, importlib.util, traceback
for _p in sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), "tables", "*.py"))):
    try:
        _sp = importlib.util.spec_from_file_location("tbl_"+os.path.basename(_p)[:-3], _p); _m = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(_m)
    except Exception:   # [개선] 깨진 표는 그 묶음이 옛 계산식으로 조용히 돌아가므로 멈춘다. 여러 작업자가 동시에 고칠 때만 MOTION_ALLOW_BROKEN_TABLE=1 로 건너뛴다
        # [원본] print("표 읽기 실패(건너뜀):", _p, traceback.format_exc().splitlines()[-1], file=sys.stderr); continue
        if os.environ.get("MOTION_ALLOW_BROKEN_TABLE") != "1": raise SystemExit(f"표 읽기 실패: {_p}: {traceback.format_exc().splitlines()[-1]}")
        print("표 읽기 실패(건너뜀):", _p, traceback.format_exc().splitlines()[-1], file=sys.stderr); continue
    SL.update(getattr(_m, "TABLE", {})); ASYM |= set(getattr(_m, "ASYM", ())); HOLD |= set(getattr(_m, "HOLD", ())); FIXO.update(getattr(_m, "FIXO", {})); DENOISE.update(getattr(_m, "DENOISE", {}))
def main(src, out):
    J = json.load(open(src)); old = json.load(open(out))["keys"] if os.path.exists(out) else {}
    miss = sorted({v["arch"] for v in J["jobs"].values()}-set(FAM_OF))
    if miss: raise SystemExit(f"묶음이 없는 원형: {miss}")
    extra = sorted(set(FAM_OF)-{v["arch"] for v in J["jobs"].values()})
    if extra: raise SystemExit(f"제작 목록에 없는 원형: {extra}")
    keys = {}
    for k, v in sorted(J["jobs"].items()):
        fam = FAM_OF[v["arch"]]; fx, dr = EXC.get(v["arch"], DEF[fam]); o = old.get(k, {})
        text = " ".join([v.get("prompt") or "", v.get("exampleEn") or "", *[str(x) for x in v.get("rows") or []]]); fx, dr, asym, loop = refine(v["arch"], fx, dr, v["arch"] in SYM_OFF, "cycle" if v["arch"] in CYCLE else "pingpong", text)
        keys[k] = dict(arch=v["arch"], equip=v["equip"], family=fam, fixed=fx, drive=dr, asym=asym, loop=loop,
                       motion=v.get("prompt") or v.get("exampleEn"), nameKo=v["exampleKo"], solver=SOLVER.get(k) or (REPS[k][0] if k in REPS else SL[k][0] if k in SL else o.get("solver")), vars=SL[k][1] if k in SL else o.get("vars", {}), cam=CAMS.get(k) or (REPS[k][1] if k in REPS else SL[k][2] if k in SL else o.get("cam")), decl=DECL.get(k) or (REPS[k][2] if k in REPS else SL[k][3] if k in SL else o.get("decl")), status=o.get("status", "todo"))
    for k_, v_ in DENOISE.items(): keys[k_]["denoise"] = v_
    for k_, v_ in LOOP.items(): keys[k_]["loop"] = v_
    for k_ in ASYM: keys[k_]["asym"] = True
    for k_, v_ in FIXO.items(): keys[k_]["fixed"] = v_
    for k_ in HOLD: keys[k_]["solver"] = None   # 계산식 보류 — 기존 영상 유지
    bad = set(SL)-set(keys)
    if bad: raise SystemExit(f"없는 키: {sorted(bad)}")
    json.dump(dict(order=ORDER, keys=keys, links=dict(sorted(J["links"].items()))), open(out, "w"), ensure_ascii=False, indent=0)
    print("영상", len(keys), "종목", len(J["links"]), "묶음", {f: sum(1 for k in keys.values() if k["family"] == f) for f in ORDER})
if __name__ == "__main__": main(*sys.argv[1:3])
