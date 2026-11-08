# SPDX-License-Identifier: GPL-3.0-or-later
"""팔 묶음 표(SPEC-040 Phase 9) — build_catalog.py 가 합친다. 키 → (solver, vars, cam, decl).
U 위팔 방향·Fd 굽힘 방향(왼팔 기준, 오른팔은 X 반전), Uf/Ff 't' 몸통 기준·'w' 세계 기준, f0→f1 팔꿈치 굽힘(도), b0→b1 손 방향(90 뒤침·0 중립·-90 엎침), w 손목 굽힘."""
_AS = [[3.05, -2.70, 1.55], [0, 0.0, 0.95], 70]; _AT = [[3.05, -2.70, 1.35], [0, -0.10, 0.80], 70]; _AB = [[3.30, -2.30, 1.40], [0, 0.0, 0.85], 70]
_AL = [[2.30, -2.60, 2.45], [0, 0.18, 0.62], 70]; _AI = [[2.60, -2.60, 2.20], [0, 0.10, 0.80], 70]; _AP = [[3.00, -2.60, 1.60], [0, 0.10, 0.75], 70]
_AW = [[2.40, -2.40, 1.45], [0, -0.20, 0.80], 60]
_AO = [[3.60, -3.20, 1.75], [0, 0.0, 1.12], 70]   # 머리 위 바벨이 잘리지 않게 더 멀고 높게
_CAM = {'stand': _AS, 'bent': _AB, 'seat': _AT, 'conc': _AT, 'preacher': _AT, 'lie': _AL, 'spider': _AP}
_FIX = {'stand': ["foot_l", "foot_r"], 'bent': ["foot_l", "foot_r"], 'seat': ["pelvis"], 'conc': ["pelvis"], 'preacher': ["pelvis"], 'lie': ["pelvis"], 'spider': ["pelvis", "foot_l", "foot_r"]}
def _el(pose="stand", rom=70, extra=None, cam=None, **v):
    v["pose"] = pose; rk = "elbow_r" if v.get("hands") == "one" else "elbow"
    if v.get("pose") == "lie" and v.get("inc", 0.0) > 5 and cam is None: cam = _AI
    d = {"rom": {rk: rom} if rom else {"elbow": 0}, "support": "feet" if pose in ("stand", "bent") else None, "fixed_bones": _FIX[pose]}; d.update(extra or {})
    return ("arms:elbow", v, cam or _CAM[pose], d)
CURL = dict(U=(0.05, -0.10, -1.0), Fd=(0.0, -1.0, 0.0), f0=15.0, f1=135.0)   # 바벨: 위팔은 몸 옆, 팔꿈치만
DBC = dict(CURL, U=(0.19, -0.06, -1.0), f0=10.0)   # 덤벨은 원판이 허벅지에 닿지 않게 팔꿈치를 조금 벌린다
SKULL = dict(U=(0.06, -1.0, 0.0), Fd=(0.0, 0.0, 1.0), f0=4.0, f1=100.0, b0=-90.0, b1=-90.0)   # 누워 위팔은 천장보다 조금 머리 쪽, 바를 이마로
EF = {"elbow_front": 0.8}   # 누우면 팔꿈치가 천장(=몸 앞)을 본다 — 실제 동작
OHE = dict(th=-3.0, U=(0.0, 0.10, 1.0), Fd=(-1.2, 1.0, 0.0), f0=8.0, f1=140.0, b0=0.0, b1=0.0)   # 머리 위: 위팔 세우고 손을 머리 뒤로(팔꿈치 약간 벌림)
OHF = {"elbow_front": 0.7}   # 머리 위로 든 팔은 팔꿈치가 앞·위를 본다 — 실제 동작
KB = dict(ax=0.09, th=75.0, U=(0.25, 0.35, -1.0), Fd=(0.0, 0.0, -1.0), Ff='w', f0=95.0, f1=5.0, b0=0.0, b1=0.0)   # 킥백: 상체를 거의 눕히고 위팔은 몸통 옆에 붙여 뒤로, 아래팔만 편다
PD = dict(th=8.0, dy=0.035, U=(0.02, 0.03, -1.0), f0=100.0, f1=6.0)   # 푸시다운: 팔꿈치 옆구리에 고정
PREA = dict(th=10.0, U=(0.06, -0.78, -0.62), Fd=(0.0, -0.62, 0.78), f0=25.0, f1=125.0)   # 프리처: 위팔을 비스듬한 패드에
SPID = dict(th=45.0, U=(0.05, -0.05, -1.0), Uf='w', Fd=(0.0, -1.0, 0.0), Ff='w', f0=5.0, f1=135.0)   # 스파이더: 인클라인 벤치에 엎드려 팔을 수직으로
INC = dict(inc=55.0, U=(0.30, 0.50, -1.0), Uf='w', Fd=(0.0, -1.0, 0.0), Ff='w', f0=5.0, f1=110.0, b0=40.0, b1=90.0)   # 인클라인 컬: 팔을 몸통 뒤로 늘어뜨린 채
WR = dict(th=32.0, U=(0.02, -0.25, -1.0), Uf='w', Fd=(0.0, -1.0, 0.0), Ff='w', f0=78.0, f1=78.0)   # 손목 컬: 앉아 아래팔을 허벅지에 얹고 손목만
TABLE = {
 # ── 서서 컬 ──
 "curl__barbell__biceps": _el("stand", 100, load="bar", **CURL),
 "curl__ezbar__biceps": _el("stand", 100, load="ez", b0=70.0, b1=70.0, **CURL),
 "curl__cable__biceps": _el("stand", 100, load="cbar", pull=(0.0, -0.60, 0.12), pc=True, **CURL),
 "curl__band__biceps": _el("stand", 100, load="band", pull=(0.12, -0.02, 0.03), **DBC),
 "curl-c21__barbell__biceps": _el("stand", 100, load="bar", fk=[(0.0, 15.0), (0.30, 75.0), (0.42, 45.0), (1.0, 135.0)], **CURL),   # 21s: 아래 절반 → 반쯤 내림 → 끝까지
 "curl-crossbody__dumbbell__biceps": _el("stand", 100, load="db", b0=0.0, b1=0.0, **dict(DBC, U=(0.24, -0.06, -1.0), Fd=(-0.40, -0.90, 0.0))),   # 몸 가로질러 반대 어깨로
 "curl-curlpress__dumbbell__biceps": _el("stand", 100, {"elbow_front": 0.7, "angle_step": 16, "pos_step": 0.08}, load="db", b0=0.0, b1=0.0, press=0.4, fk=[(0.0, 10.0), (0.4, 140.0), (1.0, 140.0)], **DBC),
 "curl-hammer_curl__cable__biceps": _el("stand", 100, load="rope", b0=0.0, b1=0.0, pull=(0.0, -0.55, 0.12), **dict(CURL, U=(0.0, -0.10, -1.0))),
 "curl-hammer_curl__dumbbell__biceps": _el("stand", 100, load="db", b0=0.0, b1=0.0, **DBC),
 "curl-reverse_curl__barbell__forearms": _el("stand", 90, load="bar", b0=-90.0, b1=-90.0, **dict(CURL, f1=125.0)),
 "curl-reverse_curl__ezbar__forearms": _el("stand", 90, load="ez", b0=-70.0, b1=-70.0, **dict(CURL, f1=125.0)),
 "curl-reverse_curl__dumbbell__forearms": _el("stand", 90, load="db", b0=-90.0, b1=-90.0, **dict(DBC, f1=125.0)),
 "curl-reverse_curl__cable__forearms": _el("stand", 90, load="cbar", b0=-90.0, b1=-90.0, pull=(0.0, -0.60, 0.12), pc=True, **dict(CURL, f1=125.0)),
 "curl-waiter__dumbbell__biceps": _el("stand", 100, load="db1", db_off=0.10, **dict(CURL, U=(-0.10, -0.22, -1.0), Fd=(-0.15, -1.0, 0.0), f0=28.0)),   # 덤벨 하나를 세워 두 손바닥으로 받친다
 "curl-zottman__dumbbell__biceps": _el("stand", 100, {"angle_step": 15, "pos_step": 0.07}, load="db", fk=[(0.0, 10.0), (0.34, 135.0), (0.66, 135.0), (1.0, 10.0)], bk=[(0.0, 90.0), (0.34, 90.0), (0.66, -90.0), (1.0, -90.0)], **DBC),   # 뒤침으로 올리고 위에서 엎침으로 돌려 내린다
 "curl-behindback__cable__biceps": _el("stand", 90, load="cable", pull=(0.20, 0.75, 0.12), **dict(CURL, U=(0.10, 0.30, -1.0), f0=8.0, f1=120.0)),   # 도르래를 등지고 팔을 몸 뒤로
 "drag_curl__barbell__biceps": _el("stand", 80, load="bar", U1=(0.05, 0.75, -1.0), **dict(CURL, f1=115.0)),   # 바를 몸에 붙여 끌어올리며 팔꿈치는 뒤로
 "drag_curl__dumbbell__biceps": _el("stand", 80, load="db", U1=(0.19, 0.75, -1.0), **dict(DBC, f1=115.0)),
 "overhead_cable_curl__cable__biceps": _el("stand", 90, load="cable", pull=(1.05, -0.05, 1.95), **dict(U=(1.0, -0.08, 0.10), Fd=(0.0, 0.0, 1.0), f0=15.0, f1=120.0)),   # 양쪽 높은 도르래, 팔을 옆으로 뻗어 머리 쪽으로
 "plate_curl__other__biceps": _el("stand", 100, load="plate", b0=0.0, b1=0.0, **dict(CURL, U=(0.08, -0.10, -1.0), f1=125.0)),   # 원판 3·9시 테두리를 쥔다
 # ── 앉아·누워·엎드려 컬 ──
 "preacher_curl__barbell__biceps": _el("preacher", 80, load="bar", **PREA),
 "preacher_curl__ezbar__biceps": _el("preacher", 80, load="ez", b0=70.0, b1=70.0, **PREA),
 "preacher_curl__dumbbell__biceps": _el("preacher", 80, load="db", **dict(PREA, U=(0.12, -0.78, -0.62))),
 "preacher_curl__cable__biceps": _el("preacher", 80, load="cbar", pull=(0.0, -0.95, 0.15), pc=True, **PREA),
 "preacher_curl__machine__biceps": _el("preacher", 80, load="machine", **PREA),
 "concentration_curl__dumbbell__biceps": _el("conc", 100, load="db", hands="one", th=30.0, U=(-0.05, -0.05, -1.0), Uf='w', Fd=(-0.3, -1.0, 0.0), Ff='w', f0=8.0, f1=135.0),
 "concentration_curl__cable__biceps": _el("conc", 100, load="cable", hands="one", pull=(0.10, -0.75, 0.12), th=30.0, U=(-0.05, -0.05, -1.0), Uf='w', Fd=(-0.3, -1.0, 0.0), Ff='w', f0=8.0, f1=135.0),
 "incline_curl__dumbbell__biceps": _el("lie", 100, load="db", **INC),
 "incline_curl__cable__biceps": _el("lie", 100, load="cable", pull=(0.35, -1.10, 0.15), **INC),
 "spider_curl__dumbbell__biceps": _el("spider", 100, load="db", **dict(SPID, U=(0.15, -0.05, -1.0))),
 "spider_curl__barbell__biceps": _el("spider", 100, load="bar", **SPID),
 "spider_curl__ezbar__biceps": _el("spider", 100, load="ez", b0=70.0, b1=70.0, **SPID),
 "cable_lying_curl__cable__biceps": _el("lie", 80, EF, load="cbar", pull=(0.0, 1.55, 1.85), pc=True, U=(0.06, -1.0, 0.0), Fd=(0.0, 0.0, 1.0), f0=10.0, f1=100.0),   # 머리 쪽 높은 도르래, 팔을 머리 위로 비스듬히
 # ── 삼두 ──
 "skull_crusher__barbell__triceps": _el("lie", 80, EF, load="bar", **SKULL),
 "skull_crusher__ezbar__triceps": _el("lie", 80, EF, load="ez", **dict(SKULL, b0=-70.0, b1=-70.0)),
 "skull_crusher__dumbbell__triceps": _el("lie", 80, EF, load="db", **dict(SKULL, U=(0.14, -1.0, 0.0), b0=0.0, b1=0.0)),
 "skull_crusher__cable__triceps": _el("lie", 80, EF, load="cbar", pull=(0.0, 1.50, 0.20), pc=True, **SKULL),
 "skull_crusher-decline__ezbar__triceps": _el("lie", 80, EF, load="ez", inc=-20.0, **dict(SKULL, b0=-70.0, b1=-70.0)),
 "skull_crusher-incline__barbell__triceps": _el("lie", 80, EF, load="bar", inc=30.0, **SKULL),
 "skull_crusher-incline__ezbar__triceps": _el("lie", 80, EF, load="ez", inc=30.0, **dict(SKULL, b0=-70.0, b1=-70.0)),
 "skull_crusher-incline__dumbbell__triceps": _el("lie", 80, EF, load="db", inc=30.0, **dict(SKULL, U=(0.14, -1.0, 0.0), b0=0.0, b1=0.0)),
 "skull_crusher-jm__barbell__triceps": _el("lie", 70, EF, load="bar", **dict(SKULL, U=(0.08, -1.0, 0.0), U1=(0.10, -0.75, -0.65), f1=100.0)),   # JM: 팔꿈치를 발 쪽으로 내리며 바를 목 위로
 "skull_crusher-jm__smith__triceps": _el("lie", 70, EF, load="smith", rail_y=0.0, **dict(SKULL, U=(0.08, -1.0, 0.0), U1=(0.10, -0.75, -0.65), f1=100.0)),
 "skull_crusher-wide__dumbbell__triceps": _el("lie", 70, EF, load="db", U=(0.55, -1.0, 0.0), Fd=(-1.0, 0.0, 0.0), f0=5.0, f1=110.0, b0=-90.0, b1=-90.0),   # 테이트 프레스: 팔꿈치를 옆으로 벌리고 덤벨을 가슴 가운데로
 "overhead_ext__dumbbell__triceps": _el("stand", 100, OHF, load="db1", db_off=0.12, **dict(OHE, f1=118.0)),
 "overhead_ext__barbell__triceps": _el("stand", 100, OHF, cam=_AO, load="bar", **dict(OHE, th=4.0, U=(0.06, 0.10, 1.0), Fd=(-1.0, 1.0, 0.0), b0=-90.0, b1=-90.0)),
 "overhead_ext__ezbar__triceps": _el("stand", 100, OHF, cam=_AO, load="ez", **dict(OHE, th=4.0, U=(0.04, 0.10, 1.0), Fd=(-1.0, 1.0, 0.0), b0=-70.0, b1=-70.0)),
 "overhead_ext__kettlebell__triceps": _el("stand", 100, OHF, load="kb1", **dict(OHE, f1=120.0)),
 "overhead_ext__band__triceps": _el("stand", 100, OHF, load="band", pull=(0.10, 0.12, 0.03), **dict(OHE, U=(0.06, 0.10, 1.0), Fd=(-1.0, 1.0, 0.0))),
 "overhead_ext__cable__triceps": _el("stand", 100, {"elbow_front": 0.8}, load="rope", pull=(0.0, 0.80, 0.45), **dict(OHE, th=18.0, U=(0.0, -0.10, 1.0))),   # 도르래를 등지고 몸을 숙여 로프를 머리 뒤에서 앞으로
 "kickback__dumbbell__triceps": _el("bent", 70, load="db", **KB),
 "kickback__band__triceps": _el("bent", 70, load="band", pull=(0.12, -0.30, 0.03), **KB),
 "kickback__cable__triceps": _el("bent", 70, load="cable", pull=(0.30, -0.80, 0.15), **KB),
 "pushdown-rope__cable__triceps": _el("stand", 70, load="rope", b0=0.0, b1=-20.0, pull=(0.0, -0.42, 2.05), **PD),
 "pushdown-reverse__cable__triceps": _el("stand", 70, load="cbar", b0=90.0, b1=90.0, pull=(0.0, -0.42, 2.05), pc=True, **PD),
 "pushdown__band__triceps": _el("stand", 70, load="band", b0=-90.0, b1=-90.0, pull=(0.0, -0.42, 2.05), pc=True, **PD),
 "pushdown-cross__cable__triceps": _el("stand", 70, load="cable", pull=(-0.95, -0.15, 2.0), U=(0.35, -0.55, -0.55), Fd=(-1.0, 0.0, 0.3), f0=110.0, f1=8.0, b0=-60.0, b1=-60.0),   # 양쪽 높은 도르래를 엇갈려 잡고 바깥 아래로 편다
 # ── 손목·그립 ──
 "wrist_curl__barbell__forearms": _el("seat", 0, {"rom": {"elbow": 0}}, load="bar", w0=-50.0, w1=40.0, **WR),
 "wrist_curl__dumbbell__forearms": _el("seat", 0, {"rom": {"elbow": 0}}, load="db", w0=-50.0, w1=40.0, **dict(WR, U=(0.08, -0.25, -1.0))),
 "wrist_curl__cable__forearms": _el("seat", 0, {"rom": {"elbow": 0}}, load="cbar", pull=(0.0, -0.85, 0.12), pc=True, w0=-50.0, w1=40.0, **WR),
 "wrist_curl-reverse_wrist_curl__barbell__forearms": _el("seat", 0, {"rom": {"elbow": 0}}, load="bar", b0=-90.0, b1=-90.0, w0=45.0, w1=-35.0, **WR),
 "wrist_curl-reverse_wrist_curl__dumbbell__forearms": _el("seat", 0, {"rom": {"elbow": 0}}, load="db", b0=-90.0, b1=-90.0, w0=45.0, w1=-35.0, **dict(WR, U=(0.08, -0.25, -1.0))),
 "behind_back_wrist__barbell__forearms": _el("stand", 0, {"rom": {"elbow": 0}}, load="bar", U=(0.06, 0.28, -1.0), Uf='w', Fd=(0.0, -1.0, 0.0), Ff='w', f0=3.0, f1=3.0, b0=-90.0, b1=-90.0, w0=-30.0, w1=45.0, cu0=0.6, cu1=1.0),   # 바를 등 뒤에 손바닥이 뒤를 보게 들고 손목만 말아 올린다
 "hand_gripper__other__forearms": _el("seat", 0, {"rom": {"elbow": 0}}, cam=_AW, load="gripper", hands="one", th=5.0, U=(0.05, -0.30, -1.0), Uf='w', Fd=(0.0, -1.0, 0.0), Ff='w', f0=85.0, f1=85.0, b0=0.0, b1=0.0, cu0=0.25, cu1=1.0),
 "plate_pinch__other__forearms": _el("stand", 0, {"rom": {"elbow": 0}}, load="pplate", U=(0.20, 0.0, -1.0), Fd=(0.0, -1.0, 0.0), f0=4.0, f1=6.0, b0=0.0, b1=0.0, curl=0.35),   # 원판 두 장을 손가락으로 집어 옆에 든 채 버틴다
 "wrist_roller__other__forearms": _el("stand", 0, {"rom": {"elbow": 0}}, load="roller", U=(0.10, -1.0, -0.05), Fd=(0.0, 0.0, 1.0), f0=5.0, f1=5.0, b0=-90.0, b1=-90.0, roll=35.0),   # 팔을 앞으로 뻗고 두 손목을 번갈아 감는다
 "skull_crusher-floor__bodyweight__triceps": ("arms:bwext", {"k1": 0.62}, [[3.40, -2.20, 1.40], [0, -0.40, 0.75], 70], {"rom": {"elbow": 60}, "support": None, "fixed_bones": ["foot_l", "foot_r", "hand_l", "hand_r"]}),   # 낮은 바 맨몸 익스텐션(몸을 곧게 기울여 이마를 바 아래로)
}
ASYM = {"concentration_curl__dumbbell__biceps", "concentration_curl__cable__biceps", "hand_gripper__other__forearms", "wrist_roller__other__forearms"}
HOLD = set()
