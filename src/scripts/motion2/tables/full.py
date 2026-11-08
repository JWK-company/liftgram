# SPDX-License-Identifier: GPL-3.0-or-later
"""역도·전신·유산소 묶음 표(SPEC-040 Phase 13). 키 → (solver, vars, cam, decl). build_catalog.py 가 합친다."""
_SIDE = [[3.75, -2.35, 1.40], [0, -0.05, 0.92], 70]   # 보행: 옆에서 조금 앞
_F34 = [[3.45, -3.05, 1.65], [0, 0.0, 0.92], 70]      # 역도: 클린과 같은 3/4
_LOW = [[3.40, -2.60, 1.10], [0, -0.20, 0.55], 70]    # 바닥 동작
def _g(extra=None, **v):
    d = {"rom": {"knee_l": 35}, "support": None, "fixed_bones": [], "angle_step": 22, "pos_step": 0.10}; d.update(extra or {})
    return ("full:gait", dict(**v), _SIDE, d)
_RUN = dict(n=2.0, beta=0.38, s=0.34, h=0.10, kick=0.22, lean=6.0, arm=32.0, elbow=88.0, k_mid=0.955, k_end=0.99, lift=30.0)
_RUND = {"rom": {"knee_l": 80}, "angle_step": 32, "pos_step": 0.18}
def _r(extra=None, **v):
    d = dict(_RUN); d.update(v); e = dict(_RUND); e.update(extra or {}); return _g(e, **d)
TABLE = {
 "walk__bodyweight__cardio": _g(h=0.09),
 "hike__bodyweight__cardio": _g({"rom": {"knee_l": 35}}, lean=7.0, h=0.10, s=0.27, arm=18.0, elbow=25.0),
 "run__bodyweight__cardio": _g({"rom": {"knee_l": 80}, "angle_step": 32, "pos_step": 0.18}, n=2.0, beta=0.38, s=0.36, h=0.10, kick=0.22, lean=7.0, arm=34.0, elbow=88.0, k_mid=0.955, k_end=0.99, fly=0.05, lift=30.0),
 "treadmill__machine__cardio": _g({"rom": {"knee_l": 80}, "angle_step": 32, "pos_step": 0.18}, n=2.0, beta=0.38, s=0.34, h=0.10, kick=0.22, lean=6.0, arm=32.0, elbow=88.0, k_mid=0.955, k_end=0.99, fly=0.04, lift=30.0, load='tread'),
 "sprint__bodyweight__cardio": _r(s=0.35, lean=10.0, arm=38.0, kick=0.22, h=0.12, k_mid=0.97, k_end=0.995, lift=24.0),
 "high_knees__bodyweight__fullBody": _r({"rom": {"knee_l": 70}}, s=0.06, kick=0.0, knee_hi=0.30, h=0.06, lean=2.0, arm=40.0, elbow=85.0, k_mid=0.97),
 "butt_kick-kick__bodyweight__fullBody": _r({"rom": {"knee_l": 70}, "angle_step": 40}, s=0.06, kick=0.28, h=0.04, lean=3.0, arm=30.0, elbow=85.0, k_mid=0.97),
 "farmers_walk-walk__dumbbell__forearms": _g(s=0.24, load='hang_db', lean=1.0),
 "farmers_walk-walk__kettlebell__forearms": _g(s=0.24, load='hang_kb', lean=1.0),
 "farmers_walk-walk__trapbar__forearms": _g(s=0.22, load='trap', lean=1.0),
 "farmers_walk-suitcase__dumbbell__fullBody": _g(s=0.24, load='suit', lean=1.0),
 "yoke_walk__other__fullBody": _g(s=0.17, load='yoke', lean=4.0, ax=0.13),
 "sled_push__other__fullBody": _g({"rom": {"knee_l": 45}}, s=0.32, h=0.10, knee_hi=0.08, lean=38.0, load='sled_push', k_mid=0.975, k_end=0.99, neck=-22.0),
 "sled_pull__other__fullBody": _g(s=0.24, load='sled_pull', lean=-4.0, back=True, k_mid=0.985),
 "stairs__machine__cardio": _g({"rom": {"knee_l": 40}, "twist_step": 30}, s=0.0, climb=0.20, load='stair', lean=6.0, beta=0.5, ax=0.11),
 "stairs-stepper__machine__cardio": _g({"rom": {"knee_l": 40}, "twist_step": 30}, s=0.0, climb=0.20, load='stair', lean=6.0, beta=0.5, ax=0.11),
 "aerobic__bodyweight__cardio": _r({"rom": {"knee_l": 40}}, s=0.08, kick=0.0, knee_hi=0.14, h=0.06, lean=1.0, arm=52.0, elbow=30.0, k_mid=0.985),
}
# ── 역도(full:oly) ── 키 열: t, by, bz, th, heel, w(랙), o(머리 위), sx(스플릿), sh(으쓱)
_LD = {"rom": {"knee": 40, "elbow": 80, "hip": 50}, "angle_step": 40, "pos_step": 0.14, "twist_step": 30, "bar_clear_min": -0.016, "support": "feet", "fixed_bones": ["ball_l", "ball_r"]}
def _o(keys, extra=None, cam=None, **v):
    d = dict(_LD); d.update(extra or {}); return ("full:oly", dict(keys=keys, **v), cam or _F34, d)
_PULL = [[0.00, -0.145, 'F', 55, 0, 0, 0, 0, 0], [0.05, -0.145, 'F', 55, 0, 0, 0, 0, 0], [0.17, -0.145, 0.58, 38, 0, 0, 0, 0, 0.5], [0.26, -0.135, 0.84, 14, 0, 0.1, 0, 0, 2.5], [0.34, -0.15, 1.12, -2, 20, 0.45, 0, 0, 3.5]]
_HANG = [[0.00, -0.13, 0.74, 3, 0, 0, 0, 0, 0], [0.08, -0.13, 0.74, 3, 0, 0, 0, 0, 0], [0.20, -0.14, 0.60, 30, 0, 0, 0, 0, 0], [0.30, -0.135, 0.84, 12, 0, 0.1, 0, 0, 2.5], [0.38, -0.15, 1.12, -2, 20, 0.45, 0, 0, 3.5]]
_BLOCK = [[0.00, -0.145, 'B', 34, 0, 0, 0, 0, 0], [0.08, -0.145, 'B', 34, 0, 0, 0, 0, 0], [0.24, -0.135, 0.84, 14, 0, 0.1, 0, 0, 2.5], [0.32, -0.15, 1.12, -2, 20, 0.45, 0, 0, 3.5]]
_RACK = lambda t0, t1: [[t0, -0.095, 'S', 2, 0, 1, 0, 0, 0], [t1, -0.095, 'S', 2, 0, 1, 0, 0, 0]]
def _jerk(t0, sx=0.0, dip=0.10, catch=0.12):   # 랙에서 무릎 굽혀 내렸다(dip) 밀어 올려 받는다
    d = 0.40
    return [[t0, -0.095, 'S', 2, 0, 1, 0, 0, 0], [t0+d*0.25, -0.095, 'S-%.2f' % dip, 4, 0, 1, 0, 0, 0], [t0+d*0.45, -0.095, 'S+0.02', 0, 25, 1, 0.35, 0, 0],
            [t0+d*0.65, -0.095, 'S-%.2f' % catch, 3, 0, 1, 1, sx, 0], [t0+d*1.0, -0.095, 'S', 1, 0, 1, 1, sx*0.3, 0]]
_LOWER = [[0.82, -0.135, 0.83, 4, 0, 0.1, 0, 0, 0], [0.95, -0.145, 'F', 55, 0, 0, 0, 0, 0], [1.00, -0.145, 'F', 55, 0, 0, 0, 0, 0]]
TABLE.update({
 "clean-hang__barbell__fullBody": _o(_HANG+[[0.52, -0.095, 'C', 8, 0, 1, 0, 0, 0], [0.60, -0.095, 'S', 2, 0, 1, 0, 0, 0], [0.70, -0.095, 'S', 2, 0, 1, 0, 0, 0], [0.86, -0.13, 0.74, 3, 0, 0.05, 0, 0, 0], [1.00, -0.13, 0.74, 3, 0, 0, 0, 0, 0]], {"rom": {"knee": 40, "elbow": 80, "hip": 35}}),
 "clean-block__barbell__fullBody": _o(_BLOCK+[[0.48, -0.095, 'C', 8, 0, 1, 0, 0, 0], [0.56, -0.095, 'S', 2, 0, 1, 0, 0, 0], [0.66, -0.095, 'S', 2, 0, 1, 0, 0, 0], [0.82, -0.135, 0.80, 8, 0, 0.1, 0, 0, 0], [0.94, -0.145, 'B', 34, 0, 0, 0, 0, 0], [1.00, -0.145, 'B', 34, 0, 0, 0, 0, 0]], {"twist_step": 30}, blocks=0.52, smw=0.02),
 "clean-muscle__barbell__fullBody": _o(_PULL+[[0.50, -0.095, 'S-0.01', 3, 0, 1, 0, 0, 0], [0.58, -0.095, 'S', 2, 0, 1, 0, 0, 0], [0.66, -0.095, 'S', 2, 0, 1, 0, 0, 0]]+_LOWER, {"twist_step": 30}, smw=0.02),
 "clean_jerk-power__barbell__fullBody": _o(_RACK(0.0, 0.08)+_jerk(0.12)+[[0.62, -0.095, 'S', 1, 0, 1, 1, 0, 0], [0.86, -0.095, 'S', 2, 0, 1, 0, 0, 0], [1.00, -0.095, 'S', 2, 0, 1, 0, 0, 0]], {"rom": {"knee": 25, "elbow": 80, "hip": 10}, "pos_step": 0.16}, oh=-0.04, smw=0.022),
 "thruster__barbell__fullBody": _o(_RACK(0.0, 0.08)+[[0.32, -0.095, 'C-0.36', 18, 0, 1, 0, 0, 0], [0.38, -0.095, 'C-0.35', 18, 0, 1, 0, 0, 0], [0.56, -0.095, 'S', 0, 10, 1, 0.55, 0, 0], [0.66, -0.095, 'S', 0, 0, 1, 1, 0, 0], [0.76, -0.095, 'S', 0, 0, 1, 1, 0, 0], [0.92, -0.095, 'S', 2, 0, 1, 0, 0, 0], [1.00, -0.095, 'S', 2, 0, 1, 0, 0, 0]], {"pos_step": 0.16}, oh=-0.04),
})

def _sc(keys, a, b, t0, t1):   # 키 표의 시각 a..b 를 t0..t1 로 옮긴다
    return [[t0+(k[0]-a)*(t1-t0)/(b-a)]+list(k[1:]) for k in keys]
_DBG = [0.30, 0.25, 0.20]   # 당기기는 허벅지 바깥
_KBG = [0.29, 0.22, 0.20]
_THR = lambda: _RACK(0.0, 0.08)+[[0.32, -0.095, 'C-0.36', 18, 0, 1, 0, 0, 0], [0.38, -0.095, 'C-0.35', 18, 0, 1, 0, 0, 0], [0.56, -0.095, 'S', 0, 10, 1, 0.55, 0, 0], [0.66, -0.095, 'S', 0, 0, 1, 1, 0, 0], [0.76, -0.095, 'S', 0, 0, 1, 1, 0, 0], [0.92, -0.095, 'S', 2, 0, 1, 0, 0, 0], [1.00, -0.095, 'S', 2, 0, 1, 0, 0, 0]]
_HANGC = lambda c='C': _HANG+[[0.52, -0.095, c, 8, 0, 1, 0, 0, 0], [0.60, -0.095, 'S', 2, 0, 1, 0, 0, 0], [0.70, -0.095, 'S', 2, 0, 1, 0, 0, 0], [0.86, -0.13, 0.74, 3, 0, 0.05, 0, 0, 0], [1.00, -0.13, 0.74, 3, 0, 0, 0, 0, 0]]
_PRESS = lambda t0, t1: [[t0, -0.095, 'S', 2, 0, 1, 0, 0, 0], [t0+(t1-t0)*0.3, -0.095, 'S', -1, 0, 1, 1, 0, 0], [t0+(t1-t0)*0.4, -0.095, 'S', -1, 0, 1, 1, 0, 0], [t1, -0.095, 'S', 2, 0, 1, 0, 0, 0]]   # 내릴 때 팔꿈치가 랙으로 돌아오는 데 시간이 필요(비틀림)
_HD = {"rom": {"knee": 30, "elbow": 80, "hip": 30}}
_SN = [0.50, 0.40, 0.50]
_SNP = [[0.00, -0.145, 'F', 58, 0, 0, 0, 0, 0], [0.05, -0.145, 'F', 58, 0, 0, 0, 0, 0], [0.17, -0.145, 0.56, 42, 0, 0, 0, 0, 0.5], [0.26, -0.135, 0.80, 16, 0, 0, 0, 0, 2.5], [0.34, -0.15, 1.05, -3, 22, 0.25, 0.15, 0, 3.5]]
def _snc(c, th=12, t0=0.34, tail=None):   # 받기(머리 위) → 일어섬 → 랙으로 내림 → 바닥. 뒤집기는 위팔이 크게 돌아 9프레임 이상 쓴다
    return [[t0+0.14, -0.13, 1.10, 2, 6, 0.6, 0.45, 0, 2.0], [t0+0.27, -0.12, c, th, 0, 1, 1, 0, 0], [t0+0.31, -0.12, 'S', 2, 0, 1, 1, 0, 0], [t0+0.32, -0.12, 'S', 2, 0, 1, 1, 0, 0], [0.79, -0.095, 'S', 2, 0, 1, 0, 0, 0]]+(tail or [[0.91, -0.135, 0.80, 6, 0, 0.1, 0, 0, 0], [0.98, -0.145, 'F', 58, 0, 0, 0, 0, 0], [1.00, -0.145, 'F', 58, 0, 0, 0, 0, 0]])
TABLE.update({
 "clean-full__dumbbell__fullBody": _o(_HANGC('C-0.05'), _HD, load='db', g=_DBG, rk=0.17, phr=180, pho=180),
 "clean-full__kettlebell__fullBody": _o(_HANGC('C-0.05'), _HD, load='kb', g=_KBG, rk=0.15, phr=180, pho=180),
 "clean_jerk-split__barbell__fullBody": _o(_RACK(0.0, 0.08)+_jerk(0.12, sx=0.75)+[[0.62, -0.095, 'S', 1, 0, 1, 1, 0, 0], [0.86, -0.095, 'S', 2, 0, 1, 0, 0, 0], [1.00, -0.095, 'S', 2, 0, 1, 0, 0, 0]], {"rom": {"knee": 25, "elbow": 80, "hip": 10}, "pos_step": 0.16, "support": None, "fixed_bones": []}, oh=-0.04, smw=0.022),
 "clean_jerk-press__barbell__fullBody": _o(_sc(_PULL+[[0.50, -0.095, 'C', 8, 0, 1, 0, 0, 0], [0.58, -0.095, 'S', 2, 0, 1, 0, 0, 0]], 0, 0.58, 0, 0.32)+_PRESS(0.35, 0.78)+[[0.81, -0.095, 'S', 2, 0, 1, 0, 0, 0], [0.91, -0.135, 0.83, 4, 0, 0.1, 0, 0, 0], [0.98, -0.145, 'F', 55, 0, 0, 0, 0, 0], [1.00, -0.145, 'F', 55, 0, 0, 0, 0, 0]], {"pos_step": 0.18, "angle_step": 40}, oh=-0.04, smw=0.026),
 "clean_jerk-press__dumbbell__fullBody": _o(_sc(_HANGC()[:6], 0, 0.60, 0, 0.38)+_PRESS(0.42, 0.80)+[[0.83, -0.095, 'S', 2, 0, 1, 0, 0, 0], [0.94, -0.13, 0.74, 3, 0, 0.05, 0, 0, 0], [1.00, -0.13, 0.74, 3, 0, 0, 0, 0, 0]], dict(_HD, pos_step=0.18, angle_step=40), smw=0.02, load='db', g=_DBG, rk=0.175, phr=180, pho=180, oh=-0.02),
 "clean_jerk-press__kettlebell__fullBody": _o(_sc(_HANGC()[:6], 0, 0.60, 0, 0.38)+_PRESS(0.42, 0.80)+[[0.83, -0.095, 'S', 2, 0, 1, 0, 0, 0], [0.94, -0.13, 0.74, 3, 0, 0.05, 0, 0, 0], [1.00, -0.13, 0.74, 3, 0, 0, 0, 0, 0]], dict(_HD, pos_step=0.18, angle_step=40), smw=0.02, load='kb', g=_KBG, rk=0.15, phr=180, pho=180, oh=-0.02),
 "clean_jerk-full__barbell__fullBody": _o(_sc(_PULL+[[0.52, -0.095, 'C-0.34', 16, 0, 1, 0, 0, 0], [0.62, -0.095, 'S', 2, 0, 1, 0, 0, 0]], 0, 0.62, 0, 0.29)+_sc(_jerk(0.0, sx=0.75), 0, 0.40, 0.31, 0.54)+[[0.58, -0.095, 'S', 1, 0, 1, 1, 0, 0], [0.73, -0.095, 'S', 2, 0, 1, 0, 0, 0], [0.75, -0.095, 'S', 2, 0, 1, 0, 0, 0], [0.90, -0.135, 0.83, 4, 0, 0.1, 0, 0, 0], [0.97, -0.145, 'F', 55, 0, 0, 0, 0, 0], [1.00, -0.145, 'F', 55, 0, 0, 0, 0, 0]], {"pos_step": 0.18, "angle_step": 40, "support": None, "fixed_bones": []}, oh=-0.04, smw=0.026),
 "thruster__dumbbell__fullBody": _o(_THR(), {"pos_step": 0.16}, load='db', g=_DBG, rk=0.17, reach=0.98, phr=180, pho=180, oh=-0.02),
 "thruster__kettlebell__fullBody": _o(_THR(), {"pos_step": 0.16}, load='kb', g=_KBG, rk=0.16, phr=180, pho=180, oh=-0.04),
 "cluster__barbell__fullBody": _o(_sc(_PULL, 0, 0.34, 0, 0.25)+[[0.33, -0.095, 'C-0.34', 16, 0, 1, 0, 0, 0], [0.35, -0.095, 'C-0.33', 16, 0, 1, 0, 0, 0], [0.49, -0.095, 'S', 0, 10, 1, 0.55, 0, 0], [0.56, -0.095, 'S', 0, 0, 1, 1, 0, 0], [0.57, -0.095, 'S', 0, 0, 1, 1, 0, 0], [0.72, -0.095, 'S', 2, 0, 1, 0, 0, 0], [0.74, -0.095, 'S', 2, 0, 1, 0, 0, 0], [0.89, -0.135, 0.83, 4, 0, 0.1, 0, 0, 0], [0.97, -0.145, 'F', 55, 0, 0, 0, 0, 0], [1.00, -0.145, 'F', 55, 0, 0, 0, 0, 0]], {"pos_step": 0.18, "angle_step": 40}, oh=-0.04, smw=0.022),   # 랙→허벅지에서 위팔이 크게 돈다(시간 넉넉히)
 "snatch-full__barbell__fullBody": _o(_sc(_SNP, 0, 0.34, 0, 0.30)+_snc('C-0.40', 10, 0.30), {"pos_step": 0.18}, g=_SN, oh=0.0, pw=0.0, pwt=[0.565, 0.620]),
 "snatch-power__barbell__fullBody": _o(_sc(_SNP, 0, 0.34, 0, 0.30)+_snc('C-0.06', 6, 0.30), {"pos_step": 0.18}, g=_SN, oh=0.0, pw=0.0, pwt=[0.565, 0.620]),
 "snatch-hang__barbell__fullBody": _o([[0.00, -0.13, 0.70, 4, 0, 0, 0, 0, 0], [0.08, -0.13, 0.70, 4, 0, 0, 0, 0, 0], [0.18, -0.14, 0.58, 30, 0, 0, 0, 0, 0], [0.27, -0.135, 0.80, 14, 0, 0, 0, 0, 2.5], [0.34, -0.15, 1.05, -3, 22, 0.25, 0.15, 0, 3.5]]+_snc('C-0.30', 10, 0.34, [[0.98, -0.13, 0.70, 4, 0, 0.0, 0, 0, 0], [1.00, -0.13, 0.70, 4, 0, 0, 0, 0, 0]]), {"pos_step": 0.18, "angle_step": 40, "rom": {"knee": 40, "elbow": 80, "hip": 35}}, g=_SN, oh=0.0, pw=0.0, pwt=[0.615, 0.660]),
 "snatch-block__barbell__fullBody": _o([[0.00, -0.145, 'B', 36, 0, 0, 0, 0, 0], [0.08, -0.145, 'B', 36, 0, 0, 0, 0, 0], [0.24, -0.135, 0.80, 16, 0, 0, 0, 0, 2.5], [0.32, -0.15, 1.05, -3, 22, 0.25, 0.15, 0, 3.5]]+_snc('C-0.30', 10, 0.32, [[0.91, -0.135, 0.78, 8, 0, 0.1, 0, 0, 0], [0.97, -0.145, 'B', 36, 0, 0, 0, 0, 0], [1.00, -0.145, 'B', 36, 0, 0, 0, 0, 0]]), {"pos_step": 0.16, "twist_step": 30}, g=_SN, oh=0.0, pw=0.0, pwt=[0.585, 0.640], blocks=0.52),
 "muscle_snatch__barbell__fullBody": _o(_sc(_SNP, 0, 0.34, 0, 0.30)+_snc('S-0.01', 2, 0.30), {"pos_step": 0.18}, g=_SN, oh=0.0, pw=0.0, pwt=[0.565, 0.620]),
 "snatch-one__dumbbell__fullBody": _o(_sc(_SNP, 0, 0.34, 0, 0.30)+_snc('C-0.06', 6, 0.30), {"pos_step": 0.18}, load='db1', g=[0.08, 0.20, 0.20], oh=0.0, pw=0.0, pwt=[0.565, 0.620], ax=0.23, phr=180),
 "snatch-one__kettlebell__fullBody": _o(_sc(_SNP, 0, 0.34, 0, 0.30)+_snc('C-0.06', 6, 0.30), {"pos_step": 0.18}, load='kb1', g=[0.08, 0.20, 0.20], oh=0.0, pw=0.0, pwt=[0.565, 0.620], ax=0.23, phr=190),
})

# ── 앉아서 하는 기구(full:bike·row·ellip·skierg) ──
_SEAT = {"rom": {"knee_l": 45}, "support": None, "fixed_bones": ["pelvis"], "angle_step": 30, "pos_step": 0.12}
def _b(extra=None, **v):
    d = dict(_SEAT); d.update(extra or {}); return ("full:bike", dict(**v), _SIDE, d)
TABLE.update({
 "cycle__other__cardio": _b(kind='road', th=48.0, ca=68.0, ha=30.0, hr=0.86, pz=1.00, neck=-26.0, fp=4.0, fa=14.0),
 "stationary_bike__machine__cardio": _b(kind='spin', th=30.0, ca=72.0, ha=36.0, hr=0.80, pz=0.98, fp=6.0, fa=14.0),
 "stationary_bike-assault__machine__cardio": _b(kind='assault', th=12.0, ca=70.0, ha=12.0, hr=0.74, neck=-4.0, pz=0.98, fp=6.0, fa=14.0),
 "row__machine__cardio": ("full:row", {}, _SIDE, {"rom": {"knee": 70, "elbow": 55, "hip": 35}, "support": None, "fixed_bones": ["ball_l", "ball_r"], "angle_step": 30, "pos_step": 0.14}),
 "elliptical__machine__cardio": ("full:ellip", {}, _SIDE, {"rom": {"knee_l": 25}, "support": None, "fixed_bones": [], "angle_step": 26, "pos_step": 0.12}),
 "skierg__machine__cardio": ("full:skierg", {}, _F34, {"rom": {"knee": 15, "hip": 40, "shoulder": 70}, "support": "feet", "fixed_bones": ["foot_l", "foot_r"], "angle_step": 30, "pos_step": 0.17}),
 "recumbent__machine__cardio": _b(kind='recumbent', th=-22.0, ca=12.0, pz=0.62, fp=-55.0, fa=10.0, neck=18.0),
})

# ── 공·뛰기 ──
_BALL = {"rom": {"knee": 30, "elbow": 40, "hip": 20}, "angle_step": 40, "pos_step": 0.16, "twist_step": 30, "support": "feet", "fixed_bones": ["ball_l", "ball_r"]}
_JMP = {"rom": {"knee": 15}, "support": None, "fixed_bones": [], "angle_step": 30, "pos_step": 0.14, "twist_step": 30}
TABLE.update({
 "wall_ball__other__fullBody": _o([[0.00, -0.30, 'S-0.02', 4, 0, 1, 0, 0, 0], [0.24, -0.30, 'C-0.36', 18, 0, 1, 0, 0, 0], [0.30, -0.30, 'C-0.35', 18, 0, 1, 0, 0, 0], [0.46, -0.30, 'S+0.02', 0, 15, 1, 0.3, 0, 0], [0.54, -0.30, 'S+0.02', -2, 12, 1, 0.75, 0, 0],
                                    [0.70, -0.30, 'S', 0, 0, 1, 0.45, 0, 0], [0.80, -0.30, 'S+0.05', 0, 0, 1, 0.0, 0, 0], [1.00, -0.30, 'S-0.02', 4, 0, 1, 0, 0, 0]], dict(_BALL, rom={"knee": 30, "elbow": 30, "hip": 20}), load='ball', g=[0.15, 0.15, 0.15], rk=0.36, rko=0.30, oh=-0.24, phr=150, pho=180, ball_r=0.16,
                                   fly=['wall', 0.52, 0.80, 2.85, -1.12], wall=-1.25, tz=2.85),
 "boxing__bodyweight__cardio": ("full:st2", dict(kind='boxing', n=2.0), _F34, {"rom": {"elbow": 30}, "elbow_front": 0.8, "support": "feet", "fixed_bones": ["foot_l", "foot_r"], "angle_step": 40, "pos_step": 0.16, "twist_step": 30}),
 "battle_rope-wave__other__fullBody": ("full:st2", dict(kind='rope', n=1.0), _SIDE, {"rom": {"elbow": 6}, "support": "feet", "fixed_bones": ["foot_l", "foot_r"], "angle_step": 30, "pos_step": 0.14, "twist_step": 30}),
 "jumping_jack__bodyweight__fullBody": ("full:jj", dict(kind='jack', n=2.0), _F34, dict(_JMP, rom={"knee": 10, "shoulder": 100, "legs_open": 15})),
 "jump_rope__other__cardio": ("full:jj", dict(kind='rope', n=4.0, H=0.06, ax0=0.10), _F34, dict(_JMP, rom={"knee": 8})),
})

# ── 키 자세(full:kf) ──
_CB = [[3.70, -2.40, 1.55], [0, 0.35, 0.55], 70]   # 서기↔엎드리기(몸이 앞뒤로 길다)
_KFD = {"rom": {"knee": 50}, "support": None, "fixed_bones": [], "angle_step": 40, "pos_step": 0.18, "twist_step": 30}
def _k(keys, extra=None, cam=None, **v):
    d = dict(_KFD); d.update(extra or {}); return ("full:kf", dict(keys=keys, **v), cam or _CB, d)
_STAND = dict(f=[0.12, 0.0, 0.0, 0.0], kk=0.995, th=2.0, c=0.0, nk=0.0, h=['d', 8.0, 8.0, 0.97], kp=[0.2, -1.0, 0.0], air=0.0)
def _burpee(push=True, jump=True, hy=-0.28, fy=0.98):
    k = [dict(t=0.0, **_STAND),
         dict(t=0.06, kk=0.75, th=40.0, h=['d', 30.0, 10.0, 0.85], kp=[0.2, -1.0, 0.1], nk=2.0),   # 쪼그려 앉으며 손을 내림
         dict(t=0.13, kk=0.55, shz=0.45, h=['f', 0.22, hy], kp=[0.25, -1.0, 0.25], f=[0.13, 0.0, 0.0, 15.0], nk=4.0),
         dict(t=0.19, f=[0.12, 0.52, 0.14, 45.0], kk=0.92, shz=0.45, shy=hy, kp=[0.15, -0.6, -0.6], nk=0.0),
         dict(t=0.26, f=[0.12, fy, 0.012, 55.0], kk=0.995, shz=0.46, shy=hy, kp=[0.1, -0.3, -1.0], nk=-8.0)]
    if push: k += [dict(t=0.35, shz=0.34, shy=hy-0.04), dict(t=0.43, shz=0.46, shy=hy)]
    tt = 0.43 if push else 0.30
    k += [dict(t=tt+0.06, f=[0.12, 0.52, 0.14, 45.0], kk=0.92, shz=0.45, shy=hy, kp=[0.15, -0.6, -0.6], nk=0.0),
          dict(t=tt+0.12, f=[0.13, 0.05, 0.0, 15.0], kk=0.55, shz=0.45, kp=[0.25, -1.0, 0.25], nk=4.0),
          dict(t=tt+0.19, f=[0.13, 0.03, 0.0, 0.0], kk=0.72, th=45.0, h=["d", 25.0, 10.0, 0.85], kp=[0.2, -1.0, 0.1], nk=2.0),   # 손을 떼고 반쯤 일어남
          dict(t=tt+0.27, **dict(_STAND, kk=0.93, h=['d', 60.0, 12.0, 0.95] if jump else _STAND['h'])), dict(t=tt+0.33, **dict(_STAND, kk=0.96, f=[0.12, 0.0, 0.03, 25.0], h=['d', 70.0, 14.0, 0.97] if jump else _STAND['h']))]
    if jump: k += [dict(t=tt+0.40, air=1.0, pz=0.97, f=[0.12, 0.0, 0.11, 18.0], h=['d', 85.0, 14.0, 0.97]), dict(t=tt+0.48, air=0.0, kk=0.90, f=[0.12, 0.0, 0.0, 0.0], h=['d', 40.0, 12.0, 0.97])]
    sc = 0.90/k[-1]['t']
    for x in k: x['t'] = round(x['t']*sc, 4)   # 마지막 착지를 0.90 에 맞춰 시간을 고르게 편다
    k += [dict(t=1.0, **_STAND)]; return k
TABLE.update({
 "burpee-full__bodyweight__fullBody": _k(_burpee(), ease=0.05, smw=0.022, retime=1),
 "burpee-hiit__bodyweight__cardio": _k(_burpee(push=False, fy=1.07), ease=0.05, smw=0.022, retime=1),
})

# 네발(곰 자세): 손은 어깨 밑, 무릎은 엉덩이 밑에서 바닥 위로 살짝 뜬다
def _bear(crawl):
    B = dict(hz=0.03, f=[0.13, 0.30, 0.012, 70.0], kk=0.60, shz=0.50, shy=-0.52, h=['f', 0.20, -0.52], kp=[0.1, -1.0, -0.15], nk=-12.0, air=0.0)
    if not crawl:   # 베어 플랭크: 무릎을 뜬 채 버티며 한 손씩 반대 어깨를 짚는다
        tap = lambda s: dict(B, **{'h'+s: ['w', 0.22, -0.60, 0.17]})
        return [dict(t=0.0, **B), dict(t=0.18, **tap('l')), dict(t=0.32, **B), dict(t=0.50, **B), dict(t=0.68, **tap('r')), dict(t=0.82, **B), dict(t=1.0, **B)]
    k = [dict(t=0.0, **B)]; y = 0.0; t = 0.0; st = 0.20
    for i, (hs, fs, d) in enumerate((('r', 'l', -1), ('l', 'r', -1), ('r', 'l', 1), ('l', 'r', 1))):   # 앞으로 두 걸음(반대 손·발), 뒤로 두 걸음
        y2 = y+d*st; t += 0.125
        mid = dict(B, kk=0.66, shy=-0.52+(y+y2)/2, **{'h'+hs: ['w', 0.20, -0.52+(y+y2)/2+d*0.02, 0.15], 'h'+('l' if hs == 'r' else 'r'): ['f', 0.20, -0.52+y], 'f'+fs: [0.13, 0.30+(y+y2)/2, 0.08, 70.0], 'f'+('l' if fs == 'r' else 'r'): [0.13, 0.30+y, 0.03, 70.0]})
        k.append(dict(t=t, **mid)); t += 0.125; y = y2
        k.append(dict(t=t, **dict(B, shy=-0.52+y, h=['f', 0.20, -0.52+y], f=[0.13, 0.30+y, 0.012, 70.0])))
    return k
# 뛰어오르기: 반동(팔 뒤로) → 공중(팔 위로) → 착지
def _dip(**v): return dict(dict(_STAND, kk=0.80, th=32.0, h=['d', -15.0, 10.0, 0.97], kp=[0.2, -1.0, 0.1]), **v)
def _air(fx, fy, fz, pz, px=0.0, py=0.0, **v): return dict(dict(_STAND, air=1.0, pz=pz, px=px, py=py, f=[fx, fy, fz, 25.0], kk=0.9, th=10.0, h=['d', 80.0, 14.0, 0.97]), **v)
def _land(fy, fz=0.0, px=0.0, py=0.0, **v): return dict(dict(_STAND, air=0.0, px=px, py=py, f=[0.12, fy, fz, 0.0], kk=0.80, th=28.0, h=['d', 45.0, 12.0, 0.95], kp=[0.2, -1.0, 0.1]), **v)
def _up(fy, fz=0.0, px=0.0, py=0.0): return dict(_STAND, px=px, py=py, f=[0.12, fy, fz, 0.0])
_BH = 0.50; _BY = -0.62   # 박스 높이·앞쪽 위치(앞꿈치 기준)
_boxk = [dict(t=0.0, **_STAND), dict(t=0.14, **_dip()), dict(t=0.22, **_air(0.12, -0.22, _BH+0.12, 1.30, py=_BY*0.3, kk=0.75, kp=[0.2, -1.0, 0.4])), dict(t=0.29, **_air(0.12, _BY-0.02, _BH+0.10, 1.36, py=_BY*0.75, kk=0.80)), dict(t=0.36, **_land(_BY-0.08, _BH, py=_BY-0.08, kk=0.72)),
         dict(t=0.50, **_up(_BY-0.08, _BH, py=_BY-0.08)), dict(t=0.62, **_dip(f=[0.12, _BY-0.08, _BH, 0.0], py=_BY-0.08, kk=0.88, th=12.0, h=['d', 30.0, 12.0, 0.95])),
         dict(t=0.72, **_air(0.12, -0.18, _BH+0.12, 1.28, py=_BY*0.30, h=['d', 55.0, 14.0, 0.95])), dict(t=0.84, **_land(0.0, kk=0.82)), dict(t=1.0, **_STAND)]
_BX = 0.62
_latk = [dict(t=0.0, **_STAND), dict(t=0.14, **_dip()), dict(t=0.22, **_air(0.12, 0.0, _BH+0.14, 1.30, px=0.20, kk=0.75, kp=[0.2, -1.0, 0.4])), dict(t=0.29, **_air(0.12, 0.0, _BH+0.10, 1.36, px=_BX*0.85, kk=0.80)), dict(t=0.36, **_land(0.0, _BH, px=_BX, kk=0.72)),
         dict(t=0.50, **_up(0.0, _BH, px=_BX)), dict(t=0.62, **_dip(f=[0.12, 0.0, _BH, 0.0], px=_BX, kk=0.88, th=12.0, h=['d', 30.0, 12.0, 0.95])),
         dict(t=0.72, **_air(0.12, 0.0, _BH+0.14, 1.28, px=0.22, h=['d', 55.0, 14.0, 0.95])), dict(t=0.84, **_land(0.0, kk=0.82)), dict(t=1.0, **_STAND)]
def _broad(D=0.70, frog=False):   # 앞으로 멀리 뛰고 두 걸음씩 걸어 돌아온다
    dp = _dip(kk=0.62, th=50.0, h=['f', 0.16, -0.30], shz=0.66) if frog else _dip(kk=0.72, th=40.0, h=['d', -20.0, 12.0, 0.97])
    ld = _land(-D, py=-D, kk=0.62, th=45.0, h=['f', 0.16, -D-0.30]) if frog else _land(-D, py=-D, kk=0.70, th=35.0)
    k = [dict(t=0.0, **_STAND), dict(t=0.14, **dp), dict(t=0.30, **_air(0.12, -D*0.5, 0.16 if frog else 0.18, 1.0 if frog else 1.07, py=-D*0.5, h=['d', 50.0 if frog else 80.0, 14.0, 0.97])), dict(t=0.42, **ld), dict(t=0.52, **_up(-D, py=-D))]
    y = -D; t = 0.52
    for i, s in enumerate('lrlr'):
        y2 = min(0.0, -D+(i+1)*D/3) if i < 3 else 0.0; o = 'r' if s == 'l' else 'l'; t += 0.06
        k.append(dict(t=t, **dict(_STAND, py=(y+y2)/2+0.0, **{'f'+s: [0.12, (y+y2)/2, 0.08, 10.0], 'f'+o: [0.12, y if i == 0 else y, 0.0, 15.0]})))
        t += 0.06; k.append(dict(t=min(t, 1.0), **dict(_STAND, py=y2 if i == 3 else (y2+y)/2+0.05, **{'f'+s: [0.12, y2, 0.0, 0.0], 'f'+o: [0.12, y, 0.0, 0.0]}))); y = y2
    k[-1]['t'] = 1.0; return k
def _skater():   # 한 발로 옆으로 뛰어 착지, 다른 발은 뒤로 엇갈려 든다
    X = 0.42
    def one(s, px):   # s 발로 선 자세
        o = 'r' if s == 'l' else 'l'; sg = 1 if s == 'l' else -1
        return dict(_STAND, px=px, kk=0.80, th=35.0, **{'f'+s: [0.12, 0.0, 0.0, 0.0], 'f'+o: [-0.05, 0.38, 0.14, 40.0], 'h'+s: ['d', 30.0, -2.0, 0.95], 'h'+o: ['d', -25.0, 10.0, 0.95]})
    def fly(px, pz): return dict(_STAND, air=1.0, pz=pz, px=px, kk=0.92, th=18.0, f=[0.12, 0.10, 0.12, 25.0], h=['d', 10.0, 10.0, 0.95])
    return [dict(t=0.0, **one('r', -X)), dict(t=0.10, **dict(one('r', -X), kk=0.72)), dict(t=0.25, **fly(0.0, 1.0)), dict(t=0.40, **dict(one('l', X), kk=0.72)), dict(t=0.50, **one('l', X)),
            dict(t=0.60, **dict(one('l', X), kk=0.72)), dict(t=0.75, **fly(0.0, 1.0)), dict(t=0.90, **dict(one('r', -X), kk=0.72)), dict(t=1.0, **one('r', -X))]
_stretch = [dict(t=0.0, **_STAND), dict(t=0.35, **dict(_STAND, th=40.0, c=10.0, h=['d', 20.0, 6.0, 0.97])), dict(t=1.0, **dict(_STAND, th=88.0, c=22.0, nk=8.0, kk=0.995, py=0.10, h=['w', 0.10, -0.14, 0.18]))]   # 서서 상체를 숙여 발목을 잡는다(햄스트링)
_yoga = [dict(t=0.0, **dict(_STAND, h=['w', 0.04, -0.20, 1.20])), dict(t=0.10, **dict(_STAND, h=['d', 55.0, 45.0, 0.90])), dict(t=0.25, **dict(_STAND, th=-6.0, c=-8.0, nk=-10.0, h=['d', 140.0, 45.0, 0.99])),   # 합장 → 팔 올려 뒤로 젖힘
         dict(t=0.65, **dict(_STAND, th=88.0, c=20.0, nk=6.0, py=0.08, h=['f', 0.16, -0.28])), dict(t=1.0, **dict(_STAND, th=62.0, c=-4.0, nk=-14.0, py=0.06, h=['w', 0.14, -0.22, 0.40]))]   # 전굴 → 반쯤 들어 등 펴기
TABLE.update({
 "bear_crawl-plank__bodyweight__abs": _k(_bear(False), {"rom": {"elbow": 5}}, [[3.10, -2.70, 1.30], [0, -0.30, 0.35], 70]),
 "bear_crawl-crawl__bodyweight__fullBody": _k(_bear(True), {"rom": {"shoulder": 10}}, [[3.10, -2.70, 1.30], [0, -0.30, 0.35], 70], toe=1),
 "box_jump-jump__bodyweight__quads": _k(_boxk, {"rom": {"knee": 35}}, [[3.90, -3.10, 1.75], [0, -0.35, 1.00], 70], boxes=[[0.0, _BY-0.06, _BH/2, 0.70, 0.50, _BH]], retime=1, ease=0.3, smw=0.018),
 "box_jump-lateral__bodyweight__quads": _k(_latk, {"rom": {"knee": 35}}, [[2.40, -4.10, 1.75], [0.30, 0.0, 1.00], 70], boxes=[[_BX, 0.0, _BH/2, 0.50, 0.70, _BH]], retime=1, ease=0.3, smw=0.018),
 "broad_jump-broad__bodyweight__quads": _k(_broad(), None, [[3.80, -2.40, 1.55], [0, -0.45, 0.80], 70], retime=1, ease=0.3, smw=0.018),
 "broad_jump-frog__bodyweight__quads": _k(_broad(0.45, True), None, [[3.80, -2.40, 1.55], [0, -0.40, 0.70], 70], retime=1, ease=0.3, smw=0.018),
 "skate__bodyweight__glutes": _k(_skater(), {"rom": {"knee": 30}}, [[0.6, -4.2, 1.50], [0, 0.0, 0.80], 70], retime=1, ease=0.4, smw=0.018),
 "stretch__bodyweight__cardio": _k(_stretch, {"rom": {"hip": 40}}, [[3.40, -2.20, 1.45], [0, 0.0, 0.75], 70], clamp=1),
 "yoga__bodyweight__cardio": _k(_yoga, {"rom": {"hip": 40}, "elbow_front": 0.8}, [[3.40, -2.20, 1.45], [0, 0.0, 0.85], 70], clamp=1, retime=1, ease=0.5),
 "pilates__bodyweight__cardio": ("core:su", dict(mode='vhold', per_frame=False), [[3.40, -2.20, 1.60], [0, -0.05, 0.25], 70], {"rom": {"lean": 0}, "ankle_max": 165, "support": None, "fixed_bones": ["pelvis"]}),
})

ASYM = {k for k, v in TABLE.items() if v[0] in ('full:gait', 'full:bike', 'full:ellip', 'full:st2')}|{"snatch-one__dumbbell__fullBody", "snatch-one__kettlebell__fullBody", "bear_crawl-plank__bodyweight__abs", "bear_crawl-crawl__bodyweight__fullBody", "skate__bodyweight__glutes", "broad_jump-broad__bodyweight__quads", "broad_jump-frog__bodyweight__quads", "clean_jerk-split__barbell__fullBody", "clean_jerk-full__barbell__fullBody"}   # 보행은 좌우가 엇갈린다·한 팔·스플릿
HOLD = set()
FIXO = {}
DENOISE = {}
