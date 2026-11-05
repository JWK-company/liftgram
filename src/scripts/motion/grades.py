#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""export-specs.ts 결과 → 제작 목록·연결표. SPEC-034 등급 규칙.
연결은 (원형, family) 쌍 허용표로만 한다 — 다른 동작을 원형 이름만 보고 잇지 않는다."""
import collections, json, re, sys
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))
CARDIO = "aerobic boxing climb cycle hike jump_rope pilates skate ski snowboard stretch swim yoga sprint run walk row elliptical recumbent skierg stationary_bike stairs treadmill".split()
# 왕복 재생으로 표현할 수 없는 동작: 탄도·순환·이동·다단계
MULTI = "burpee clean clean_jerk snatch muscle_snatch high_pull man_maker muscle_up turkish thruster wall_ball ball_slam sots_press jump_squat box_jump broad_jump jumping_jack battle_rope around_world figure_8 halo windmill renegade crab_walk bear_crawl high_knees butt_kick mountain_climber bicycle flutter farmers_walk overhead_carry yoke_walk sled_pull sled_push bus_driver rope_climb wrist_roller band_walk plate_pinch hand_gripper kb_swing push_press cluster vacuum standing_knee_to_elbow".split()
RISK = "neck_curl neck_ext nordic dragon_flag planche planche_push_up human_flag back_lever front_lever jefferson_curl behind_neck_press handstand handstand_pushup sissy pistol l_sit korean_dip spanish_squat ghr".split()
RISK_FAM = re.compile(r"guillotine|behind_neck|behind_the_neck|planche")
# 시험 렌더에서 2D 자세로 표현이 안 된 원형(평면 밖) — 1차 제외, 수작업 대기
PLANE = "abduction_standing adduction_standing hip_abduction hip_adduction side_leg_raise fire_hydrant clamshell copenhagen torso_rotation russian_twist hatfield_squat landmine_180 lateral_lunge rollout side_plank".split()
GRADE_X = {**{a: "유산소(포괄·순환)" for a in CARDIO}, **{a: "탄도·순환·이동·다단계" for a in MULTI}, **{a: "고위험" for a in RISK}, **{a: "평면 밖 동작(수작업 대기)" for a in PLANE}}
# 원형과 family 가 다른데 같은 영상을 써도 되는 쌍. 눈으로 확인한 것만 적는다.
PAIR = {"air_squat": ["squat"], "arm_extension_machine": ["machine_arm_extension"], "assisted_pull": ["assisted_pull_up"], "behind_back_wrist": ["behind_back_wrist_curl"],
        "bench_press": ["spoto_press"], "bulgarian": ["bulgarian_split_squat"], "calf_raise": ["hack_calf_raise"], "calf_raise_bar": ["calf_raise"], "chest_press": ["seated_cable_chest_press"],
        "chest_supported_t_bar": ["chest_supported_t_bar_row"], "crunch_kneeling": ["crunch"], "donkey_calf": ["donkey_calf_raise"], "fly_lying": ["chest_fly"], "incline_chest_press": ["incline_press"],
        "kickback": ["triceps_kickback"], "kickback_glute": ["glute_kickback"], "knee_push_up": ["kneeling_push_up"], "knee_raise_lying": ["lying_knee_raise"], "lateral_raise_machine": ["lateral_raise"],
        "leg_press_calf": ["leg_press_calf_raise"], "leg_raise_lying": ["lying_leg_raise"], "lunge": ["split_squat", "walking_lunge"], "lunge_bar": ["lunge", "split_squat", "walking_lunge"],
        "overhead_ext": ["overhead_triceps_extension"], "overhead_ext_machine": ["overhead_triceps_extension"], "pallof": ["pallof_press"], "pec_deck": ["chest_fly"], "pike_pushup": ["pike_push_up"],
        "plate_raise": ["front_raise"], "preacher_curl": ["curl"], "pull_apart": ["band_pull_apart"], "push_up_decline": ["decline_push_up"], "push_up_incline": ["incline_push_up"],
        "rear_delt_fly": ["incline_rear_delt_fly"], "reverse_hyper": ["reverse_hyperextension"], "reverse_pec_deck": ["rear_delt_fly"], "seated_calf": ["seated_calf_raise"],
        "shoulder_press_machine": ["overhead_press"], "squat": ["pause_squat"], "squat_dumbbell": ["squat"], "stiff_leg": ["stiff_leg_deadlift"], "svend": ["svend_press"], "t_bar_row": ["landmine_row"]}
# 자세는 같고 값만 다른 변형: 원형 + family 키로 새로 렌더
VAR = {"hammer_curl": {"grip": "neutral"}, "reverse_curl": {"grip": "over"}, "chin_up": {"grip": "under"}, "close_grip_bench_press": {"grip_w": 0.18}, "reverse_wrist_curl": {"grip": "over"}}
EXCL = {"skull_crusher__bodyweight__triceps": "개념 불일치", "hack_squat__barbell__quads": "개념 불일치", "hack_squat__smith__quads": "개념 불일치", "sumo_deadlift__dumbbell__glutes": "동작 안 보임",
        "woodchop__dumbbell__abs": "개념 불일치", "pec_deck__cable__chest": "개념 불일치", "incline_fly__machine__chest": "개념 불일치", "sit_up__machine__abs": "GHD 기구 없음(바닥 싯업과 다른 동작)",
        "pendulum_squat__machine__quads": "기구 표현 안 됨", "v_squat__machine__quads": "기구 표현 안 됨", "kickback_glute__machine__glutes": "기구 표현 안 됨", "goblet_squat__cable__quads": "기구 표현 안 됨", "frog_pump__dumbbell__glutes": "자세 표현 안 됨"}
# 이름에 쓰는 쪽·그립·손잡이가 박힌 행: 전용 키 없이 기본 영상에 잇지 않는다(오안내)
FLAG = re.compile(r"one.?arm|single.?arm|원암|싱글 ?암|rope|로프|reverse grip|리버스 그립|close.?grip|클로즈그립|wide.?grip|와이드", re.I)
FLAG_OK_FAM = {"close_grip_bench_press", "one_arm_row"}
# 기구가 영상에 없거나 자세가 다른 개별 행
EXCL_NAME = {"Standing Cable Chest Press": "서서 미는 동작(영상은 앉은 자세)", "Band Chest Fly": "밴드 라잉 자세 없음", "Dumbbell Close Grip Press": "덤벨 좁은 그립 미지원", "Barbell Incline Close Grip Bench Press": "좁은 그립 영상 없음"}
OTHER_OK = {"svend_press", "front_raise", "plate_curl"}   # equipment=other 인데 소품이 렌더되는 것
rows, jobs, links, reasons, skipped = d["rows"], {}, {}, {}, collections.Counter()
def skip(r, why):
    reasons[r["id"]] = why; skipped[why.split("(")[0]] += 1
for r in rows:
    k = r["key"]
    if not k: skip(r, "제작 키 없음"); continue
    arch = k.split("__")[0]; fam = r["family"]; name = r["nameEn"] or ""; c = d["clips"][k]
    if k in EXCL: skip(r, EXCL[k]); continue
    if fam and RISK_FAM.search(fam): skip(r, "고위험"); continue
    if arch in GRADE_X: skip(r, GRADE_X[arch]); continue
    if name in EXCL_NAME: skip(r, EXCL_NAME[name]); continue
    if r["equip"] == "other" and fam not in OTHER_OK: skip(r, "기구가 영상에 없음(링·짐볼·세이프티바)"); continue
    if FLAG.search(name+" "+r["nameKo"]) and fam not in FLAG_OK_FAM: skip(r, "그립·쓰는 쪽 전용 영상 없음"); continue
    if fam in VAR and fam != arch:
        vk = k.replace(arch+"__", arch+"-"+fam+"__", 1); links[r["id"]] = vk
        j = jobs.setdefault(vk, {**c, "key": vk, "ov": VAR[fam], "rows": [], "prompt": name}); j["rows"].append(r["nameKo"]); continue
    if not (fam == arch or fam in PAIR.get(arch, [])): skip(r, f"변형 동작({fam})"); continue
    links[r["id"]] = k; j = jobs.setdefault(k, {**c, "rows": [], "prompt": name}); j["rows"].append(r["nameKo"])
    if fam == arch and name: j["prompt"] = name   # 연결 행 중 원형과 같은 이름을 프롬프트로
json.dump({"jobs": jobs, "links": links, "reasons": reasons}, open(out, "w"), ensure_ascii=False)
print("rows", len(rows), "linked", len(links), "clips", len(jobs), dict(skipped), "archs", len({j["arch"] for j in jobs.values()}))
print(collections.Counter(j["equip"] for j in jobs.values()))
