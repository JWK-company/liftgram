# SPDX-License-Identifier: GPL-3.0-or-later
# 사용: blender -b base.blend --python motion3d.py -- <jobs.json> <영상 키> <프레임수> <샘플> <해상도> <출력폴더> [t0,t1,...]
# 환경값: PASS=beauty|mask|probe. 결과: <출력폴더>/<키>_NNN.png 와 지표 <출력폴더>/<키>.json
import bpy, addon_utils, sys, os, math, json, time
from mathutils import Vector as V, Matrix as M, Quaternion as Q
argv = sys.argv[sys.argv.index("--")+1:]
JOBS, KEY, NF, SAMPLES, RES, OUT = argv[0], argv[1], int(argv[2]), int(argv[3]), int(argv[4]), argv[5]
ONLY = [float(x) for x in argv[6].split(",")] if len(argv) > 6 else None
JOB = json.load(open(JOBS))["jobs"][KEY]
ARCH, EQUIP, PRIM, DATA = JOB["arch"], JOB["equip"], JOB["primary"], JOB["data"]
_ovp = os.path.join(os.path.dirname(os.path.abspath(JOBS)), "overrides.json")
OV_ALL = json.load(open(_ovp))   # 없으면 멈춘다: 조정값 없는 영상이 조용히 나오면 안 된다
OV = {}
for _k in (ARCH, ARCH+"__"+EQUIP, KEY):
    OV.update(OV_ALL.get(_k, {}))
OV.update(JOB.get("ov") or {})
for _f in ("start", "end"):
    if _f in OV: DATA[_f] = {**DATA[_f], **OV[_f]}
for _f in ("scene", "machine", "other", "hold", "cable", "band"):
    if _f in OV: DATA[_f] = OV[_f]
# 시험에서 손으로 짠 10종목
HAND = {"bench_press__barbell__chest": "bench", "squat__barbell__quads": "squat", "pushdown__cable__triceps": "pushdown", "deadlift__barbell__back": "deadlift",
        "lat_pulldown__cable__back": "pulldown", "lat_pulldown__machine__back": "pulldown", "curl__dumbbell__biceps": "curl", "overhead_press__dumbbell__shoulders": "press",
        "push_up__bodyweight__chest": "pushup", "lunge__dumbbell__quads": "lunge", "seated_row__cable__back": "row"}
EX = HAND.get(KEY, "generic")
os.makedirs(OUT, exist_ok=True)
addon_utils.enable("cycles")
h = next(o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers))
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
scn = bpy.context.scene
col = scn.collection
ease = lambda t: t*t*(3-2*t)
lerp = lambda a, b, t: a+(b-a)*t
sstep = lambda a, b, x: (lambda u: u*u*(3-2*u))(max(0, min(1, (x-a)/(b-a))))
# ── 뼈 기준값 ──
B = rig.data.bones
head = lambda n: B[n].head_local.copy()
tail = lambda n: B[n].tail_local.copy()
rot3 = lambda n: B[n].matrix_local.to_3x3()
L_UP, L_FO = (tail('upperarm_l')-head('upperarm_l')).length, (tail('lowerarm_l')-head('lowerarm_l')).length

# ── 정지 자세 좌표(근육·옷 칠하기용) ──
rest = [v.co.copy() for v in h.data.vertices]
PASS = os.environ.get("PASS", "beauty"); PRESET = "B"; RED = True
gn = {g.index: g.name for g in h.vertex_groups}
w = [{gn[g.group]: g.weight for g in v.groups if g.group in gn} for v in h.data.vertices]
wsum = lambda i, *names: sum(w[i].get(n, 0) for n in names)

def seg_pt(p, a, b):
    ab = b-a; u = max(0, min(1, (p-a).dot(ab)/ab.dot(ab))); return a+ab*u, u
def seg_u(p, a, b):
    ab = b-a; return (p-a).dot(ab)/ab.dot(ab)
def limb(i, p, base, u0, u1, ang, width, minw=0.2):
    # 뼈를 축으로 방추형(가운데가 넓고 양 끝이 좁은) 근육 영역. ang: 0=앞 · 180=뒤 · 양수=바깥쪽
    out = 0
    for s_, sg in (('l', 1), ('r', -1)):
        n = base+'_'+s_
        if wsum(i, n) < minw: continue
        a_, b_ = head(n), tail(n); u = seg_u(p, a_, b_)
        if u <= u0 or u >= u1: continue
        axis = (b_-a_).normalized(); fwd = V((0, -1, 0)); fwd = (fwd-axis*fwd.dot(axis)).normalized(); side = axis.cross(fwd)
        d = p-(a_+(b_-a_)*u); th = math.degrees(math.atan2(-sg*d.dot(side), d.dot(fwd)))
        diff = abs((th-ang+180) % 360-180)
        v = (u-u0)/(u1-u0); sp = math.sin(math.pi*v)**0.55
        wd = width*sp
        out = max(out, (1-sstep(wd*0.8, wd, diff))*sstep(0, 0.06, v)*(1-sstep(0.94, 1, v)))
    return out
biceps = lambda i, p: limb(i, p, 'upperarm', 0.12, 0.93, 12, 82)
triceps = lambda i, p: limb(i, p, 'upperarm', 0.10, 0.97, 180, 68)
quads = lambda i, p: limb(i, p, 'thigh', 0.12, 0.95, 8, 72)
hams = lambda i, p: limb(i, p, 'thigh', 0.10, 0.92, 180, 62)
calves = lambda i, p: limb(i, p, 'calf', 0.03, 0.62, 180, 85)
def is_arm(i): return sum(v for k, v in w[i].items() if k.startswith(('upperarm', 'lowerarm', 'hand'))) > 0.5
def chest(i, p):
    if is_arm(i): return 0
    z0 = head('clavicle_l').z; out = 0
    for sg in (1, -1):
        x = p.x*sg
        dx, dz = (x-0.092)/0.092, (p.z-(z0-0.105))/0.082
        dz2 = dz+0.25*dx
        out = max(out, (1-sstep(0.82, 1.02, math.hypot(dx, dz2)))*sstep(0.006, 0.016, x))
    return out*sstep(0.0, -0.05, p.y-head('spine_03').y)*sstep(-0.25, -0.6, h.data.vertices[i].normal.y)
def front_delt(i, p):
    out = 0
    for n in ('upperarm_l', 'upperarm_r'):
        d = (p-head(n)-V((0, -0.022, -0.012))).length
        out = max(out, (1-sstep(0.05, 0.078, d))*sstep(0.03, -0.015, p.y-head(n).y))
    return out
def side_delt(i, p):
    out = 0
    for n, sg in (('upperarm_l', 1), ('upperarm_r', -1)):
        d = (p-head(n)-V((sg*0.016, 0, -0.022))).length
        out = max(out, (1-sstep(0.062, 0.088, d))*sstep(0.0, 0.02, p.x*sg-head(n).x*sg+0.03))
    return out
def lats(i, p):
    if is_arm(i): return 0
    z0, z1 = head('spine_01').z+0.02, head('clavicle_l').z-0.075
    v = (p.z-z0)/(z1-z0)
    if v < 0 or v > 1: return 0
    lim = 0.07+0.135*v; x = abs(p.x)
    return (1-sstep(lim-0.018, lim, x))*sstep(0.016, 0.032, x)*sstep(0.0, 0.03, p.y-head('spine_02').y+0.015)*sstep(0, 0.08, v)*(1-sstep(0.9, 1, v))
def midback(i, p):
    if is_arm(i): return 0
    z = head('clavicle_l').z; v = (p.z-(z-0.19))/0.21
    if v < 0 or v > 1: return 0
    lim = 0.05+0.075*v
    return (1-sstep(lim-0.016, lim, abs(p.x)))*sstep(0.0, 0.03, p.y-head('spine_03').y)*sstep(0, 0.1, v)*(1-sstep(0.88, 1, v))
def erector(i, p):
    if is_arm(i): return 0
    z0, z1 = head('pelvis').z+0.03, head('spine_03').z+0.05; v = (p.z-z0)/(z1-z0)
    if v < 0 or v > 1: return 0
    x = abs(p.x)
    return (1-sstep(0.045, 0.062, x))*sstep(0.005, 0.014, x)*sstep(0.0, 0.03, p.y-head('spine_01').y)*sstep(0, 0.1, v)*(1-sstep(0.88, 1, v))
def glutes(i, p):
    hip = head('thigh_l')
    d = min(math.hypot((abs(p.x)-0.082)/0.085, (p.z-(hip.z+0.0))/0.092) for _ in (0,))
    return (1-sstep(0.8, 1.02, d))*sstep(0.0, 0.03, p.y-head('pelvis').y)
# ── 추가 근육 ──
def forearms(i, p): return limb(i, p, 'lowerarm', 0.04, 0.72, 90, 150)
def abs_(i, p):
    if is_arm(i): return 0
    z0, z1 = head('pelvis').z+0.015, head('spine_03').z+0.075; v = (p.z-z0)/(z1-z0)
    if v < 0 or v > 1: return 0
    return (1-sstep(0.078, 0.094, abs(p.x)))*sstep(0.0, -0.03, p.y-head('spine_02').y)*sstep(0, 0.07, v)*(1-sstep(0.93, 1, v))
def obliques(i, p):
    if is_arm(i): return 0
    z0, z1 = head('pelvis').z+0.02, head('spine_03').z+0.02; v = (p.z-z0)/(z1-z0)
    if v < 0 or v > 1: return 0
    return sstep(0.085, 0.105, abs(p.x))*sstep(0.03, -0.01, p.y-head('spine_02').y)*sstep(0, 0.1, v)*(1-sstep(0.9, 1, v))
def traps(i, p):
    if is_arm(i): return 0
    z = head('clavicle_l').z; v = (p.z-(z-0.11))/0.2
    if v < 0 or v > 1: return 0
    lim = 0.15-0.1*v
    return (1-sstep(lim-0.016, lim, abs(p.x)))*sstep(0.0, 0.025, p.y-head('neck_01').y+0.035)*sstep(0, 0.1, v)*(1-sstep(0.9, 1, v))
def rear_delt(i, p):
    out = 0
    for n, sg in (('upperarm_l', 1), ('upperarm_r', -1)):
        d = (p-head(n)-V((sg*0.006, 0.024, -0.016))).length
        out = max(out, (1-sstep(0.05, 0.078, d))*sstep(-0.03, 0.015, p.y-head(n).y))
    return out
def tibialis(i, p): return limb(i, p, 'calf', 0.05, 0.75, 22, 42)
def adductors(i, p): return limb(i, p, 'thigh', 0.05, 0.68, -95, 42)
BY_MUSCLE = {'chest': (chest,), 'biceps': (biceps,), 'triceps': (triceps,), 'forearms': (forearms,), 'quads': (quads,), 'hamstrings': (hams,), 'calves': (calves,), 'abs': (abs_,),
             'traps': (traps,), 'shoulders': (side_delt, front_delt), 'back': (lats, midback), 'glutes': (), 'other': (), 'cardio': (), 'fullBody': ()}
# 원형별 세부 주동근(카탈로그 값이 넓거나 틀린 곳). G = 둔근(반바지 위)
AM = {'bench_press': 'chest triceps front_delt', 'incline_press': 'chest front_delt triceps', 'decline_press': 'chest triceps', 'floor_press': 'chest triceps', 'chest_press': 'chest triceps front_delt', 'incline_chest_press': 'chest front_delt triceps',
      'squeeze_press': 'chest triceps', 'svend': 'chest', 'push_up': 'chest triceps front_delt', 'push_up_decline': 'chest front_delt', 'push_up_incline': 'chest triceps', 'knee_push_up': 'chest triceps', 'sphinx_push_up': 'triceps', 'dips': 'chest triceps', 'assisted_dip': 'chest triceps', 'bench_dip': 'triceps',
      'overhead_press': 'front_delt side_delt triceps', 'pike_pushup': 'front_delt side_delt triceps', 'landmine_press': 'front_delt chest', 'shoulder_press_machine': 'front_delt side_delt', 'lateral_raise': 'side_delt', 'front_raise': 'front_delt', 'y_raise': 'side_delt traps', 'upright_row': 'side_delt traps', 'face_pull': 'rear_delt midback', 'pull_apart': 'rear_delt midback',
      'shrug': 'traps', 'deadlift': 'hams erector G', 'rack_pull': 'erector traps G', 'romanian_deadlift': 'hams G', 'stiff_leg': 'hams G', 'good_morning': 'hams erector', 'back_extension': 'erector G', 'superman': 'erector G', 'reverse_hyper': 'G hams', 'bird_dog': 'erector G',
      'squat': 'quads G', 'front_squat': 'quads G', 'goblet_squat': 'quads G', 'air_squat': 'quads G', 'box_squat': 'quads G', 'belt_squat': 'quads G', 'hack_squat': 'quads G', 'v_squat': 'quads G', 'pendulum_squat': 'quads G', 'squat_dumbbell': 'quads G', 'overhead_squat': 'quads G front_delt', 'sumo_squat': 'adductors G quads', 'leg_press': 'quads G', 'seated_leg_press': 'quads G', 'wall_sit': 'quads',
      'lunge': 'quads G', 'lunge_bar': 'quads G', 'reverse_lunge': 'quads G', 'overhead_lunge': 'quads G', 'bulgarian': 'quads G', 'step_up': 'quads G', 'leg_extension': 'quads', 'lying_leg_curl': 'hams', 'seated_leg_curl': 'hams', 'standing_leg_curl': 'hams',
      'hip_thrust': 'G', 'glute_bridge': 'G', 'frog_pump': 'G', 'kneeling_hip_thrust': 'G', 'kickback_glute': 'G', 'pull_through': 'G hams', 'calf_raise': 'calves', 'calf_raise_bar': 'calves', 'seated_calf': 'calves', 'donkey_calf': 'calves', 'leg_press_calf': 'calves', 'tibialis_raise': 'tibialis',
      'pull_up': 'lats biceps', 'assisted_pull': 'lats biceps', 'lat_pulldown': 'lats biceps', 'straight_arm_pulldown': 'lats', 'pullover': 'lats chest', 'bent_over_row': 'lats midback', 'pendlay_row': 'lats midback', 'one_arm_row': 'lats midback', 'seal_row': 'lats midback', 't_bar_row': 'lats midback', 'chest_supported_row': 'lats midback', 'chest_supported_t_bar': 'lats midback', 'seated_row': 'lats midback', 'low_row': 'lats midback', 'high_row': 'lats midback', 'inverted_row': 'lats midback',
      'crunch': 'abs_', 'crunch_kneeling': 'abs_', 'sit_up': 'abs_', 'decline_sit_up': 'abs_', 'reverse_crunch': 'abs_', 'leg_raise_lying': 'abs_', 'knee_raise_lying': 'abs_', 'hanging_knee_raise': 'abs_', 'hanging_leg_raise': 'abs_', 'toes_to_bar': 'abs_', 'plank': 'abs_', 'dead_bug': 'abs_', 'toe_touch': 'abs_',
      'wrist_curl': 'forearms', 'behind_back_wrist': 'forearms', 'plate_curl': 'biceps', 'thruster': 'quads G front_delt side_delt', 'kb_swing': 'G hams', 'rear_delt_fly': 'rear_delt midback', 'reverse_pec_deck': 'rear_delt midback', 'sumo_deadlift': 'G hams erector', 'push_press': 'front_delt side_delt triceps', 'mountain_climber': 'abs_', 'fly_lying': 'chest', 'incline_fly': 'chest', 'pec_deck': 'chest', 'cable_crossover': 'chest', 'low_to_high_fly': 'chest', 'side_bend': 'obliques', 'woodchop': 'obliques', 'pallof': 'obliques abs_', 'plate_raise': 'front_delt', 'overhead_shrug': 'traps', 'farmers_walk': 'forearms traps', 'overhead_carry': 'side_delt front_delt'}
HAND_M = {'bench': 'bench_press', 'squat': 'squat', 'pushdown': '', 'deadlift': 'deadlift', 'pulldown': 'lat_pulldown', 'curl': '', 'press': 'overhead_press', 'pushup': 'push_up', 'lunge': 'lunge', 'row': 'seated_row'}
_names = AM.get(ARCH) or None
if _names: TN = _names.split()
else:
    TN = None
GLUTE = (TN is not None and 'G' in TN) or ('glutes' in PRIM and TN is None)
if TN is not None: TARGET = tuple(globals()[n] for n in TN if n != 'G')
else: TARGET = tuple(f for m in PRIM for f in BY_MUSCLE.get(m, ()))
if not TARGET: TARGET = (lambda i, p: 0,)
ca = h.data.color_attributes.new("paint", 'FLOAT_COLOR', 'POINT'); cb = h.data.color_attributes.new("paint2", 'FLOAT_COLOR', 'POINT'); cc = h.data.color_attributes.new("paint3", 'FLOAT_COLOR', 'POINT')
hip_z = head('thigh_l').z; knee_z = tail('thigh_l').z; ankle_z = head('foot_l').z
ARM = ('upperarm', 'lowerarm', 'hand', 'index', 'middle', 'ring', 'pinky', 'thumb')
hz, hy = head('head').z, head('head').y
disp = []
for i, p in enumerate(rest):
    m = max(f(i, p) for f in TARGET)
    arm = sum(v for k, v in w[i].items() if k.startswith(ARM)) > 0.15
    hem = lerp(knee_z, hip_z, 0.66)
    shorts = 0 if arm else sstep(hem-0.003, hem+0.003, p.z)*(1-sstep(hip_z+0.125, hip_z+0.13, p.z))
    shoe = 0 if arm else 1-sstep(ankle_z+0.012, ankle_z+0.018, p.z)
    sock = 0 if arm else (1-sstep(ankle_z+0.075, ankle_z+0.08, p.z))*(1-shoe)
    sole = 0 if arm else 1-sstep(0.004, 0.012, p.z)
    hair = sstep(0.5, 0.8, wsum(i, 'head'))*sstep(-0.004, 0.004, p.z-(hz+0.052+(hy-p.y)*0.32-max(0, p.y-hy-0.02)*1.1))
    m = m*(1-shorts)*(1-shoe)*(1-sock)
    if GLUTE: m = max(m, glutes(i, p)*shorts)
    ca.data[i].color = (m, shorts, shoe, 1)
    cb.data[i].color = (hair, sole, sock, 1)
    hand_flag = 1.0 if sum(v for k, v in w[i].items() if k.startswith(('hand', 'index', 'middle', 'ring', 'pinky', 'thumb'))) > 0.4 else 0.0
    cc.data[i].color = (hand_flag, 0, 0, 1)
    disp.append(0.008*shorts+0.012*shoe+0.0025*hair+0.003*sock)
nrm = [v.normal.copy() for v in h.data.vertices]
for i, v in enumerate(h.data.vertices): v.co = rest[i]+nrm[i]*disp[i]
ss = h.modifiers.new("smooth", 'SUBSURF'); ss.levels = ss.render_levels = 1
for poly in h.data.polygons: poly.use_smooth = True
def pbr(name, rgb, rough=0.55, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal
    return m
def srgb(hexs):
    f = lambda c: c/12.92 if c < 0.04045 else ((c+0.055)/1.055)**2.4
    return tuple(f(int(hexs[i:i+2], 16)/255) for i in (0, 2, 4))
# 몸 재질 — B: 구릿빛 피부 · A: 무채색 몸. 강조색은 둘 다 빨강.
SKIN = {"B": "D2A17E", "A": "C9C7C4"}[PRESET]
mat = pbr("body", srgb(SKIN), 0.42)
nt = mat.node_tree; bsdf = nt.nodes["Principled BSDF"]
attr = nt.nodes.new("ShaderNodeAttribute"); attr.attribute_name = "paint"
sep = nt.nodes.new("ShaderNodeSeparateColor"); nt.links.new(attr.outputs["Color"], sep.inputs[0])
attr2 = nt.nodes.new("ShaderNodeAttribute"); attr2.attribute_name = "paint2"
sep2 = nt.nodes.new("ShaderNodeSeparateColor"); nt.links.new(attr2.outputs["Color"], sep2.inputs[0])
def mix(a, b, fac):
    n = nt.nodes.new("ShaderNodeMix"); n.data_type = 'RGBA'
    if isinstance(a, tuple): n.inputs["A"].default_value = (*a, 1)
    else: nt.links.new(a, n.inputs["A"])
    n.inputs["B"].default_value = (*b, 1); nt.links.new(fac, n.inputs["Factor"])
    return n.outputs["Result"]
c = mix(srgb(SKIN), srgb("E0202A"), sep.outputs[0]) if RED else mix(srgb(SKIN), srgb(SKIN), sep.outputs[0])
c = mix(c, srgb("17181B"), sep.outputs[1])
c = mix(c, srgb("EDEDED"), sep2.outputs[2])
c = mix(c, srgb("1C1E22"), sep.outputs[2])
c = mix(c, srgb("F2F2F2"), sep2.outputs[1])
c = mix(c, srgb("1E1A17"), sep2.outputs[0])
ao = nt.nodes.new("ShaderNodeAmbientOcclusion"); ao.inputs["Distance"].default_value = 0.05; ao.samples = 16
gam = nt.nodes.new("ShaderNodeMix"); gam.data_type = 'RGBA'; gam.blend_type = 'MULTIPLY'; gam.inputs["Factor"].default_value = 0.85
nt.links.new(c, gam.inputs["A"]); nt.links.new(ao.outputs["AO"], gam.inputs["B"])
nt.links.new(gam.outputs["Result"], bsdf.inputs["Base Color"])
def mx(a, b):
    n = nt.nodes.new("ShaderNodeMath"); n.operation = 'MAXIMUM'; nt.links.new(a, n.inputs[0]); nt.links.new(b, n.inputs[1]); return n.outputs[0]
cloth = mx(mx(sep.outputs[1], sep.outputs[2]), sep2.outputs[0])
mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs["To Min"].default_value = 0.42; mr.inputs["To Max"].default_value = 0.92
nt.links.new(cloth, mr.inputs["Value"]); nt.links.new(mr.outputs[0], bsdf.inputs["Roughness"])
bsdf.inputs["Subsurface Weight"].default_value = 0.05; bsdf.inputs["Subsurface Radius"].default_value = (0.03, 0.012, 0.008)
bsdf.inputs["Specular IOR Level"].default_value = 0.42
h.data.materials.clear(); h.data.materials.append(mat)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o is not h: bpy.data.objects.remove(o)

STEEL = pbr("steel", (0.62, 0.63, 0.65), 0.28, 1.0); DARK = pbr("dark", srgb("24272C"), 0.62)
RUBBER = pbr("rubber", srgb("16181B"), 0.5); PAD = pbr("pad", srgb("32363C"), 0.45); FRAME = pbr("frame", srgb("50555C"), 0.4, 0.6)
ACC = pbr("rope", srgb("3A3D42"), 0.8); CABLE = pbr("cable", (0.05, 0.05, 0.06), 0.3, 0.6)
def smooth(o): 
    for p in o.data.polygons: p.use_smooth = True
def cyl(name, r, l, mat_, loc=(0, 0, 0), axis='Z', parent=None, verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=l, location=loc)
    o = bpy.context.object; o.name = name; o.data.materials.append(mat_); smooth(o)
    for p_ in o.data.polygons: p_.use_smooth = len(p_.vertices) == 4
    if axis == 'X': o.rotation_euler = (0, math.pi/2, 0)
    if axis == 'Y': o.rotation_euler = (math.pi/2, 0, 0)
    return o
def box(name, size, loc, mat_, bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True, location=False, rotation=False)
    b = o.modifiers.new("b", 'BEVEL'); b.width = bevel; b.segments = 3; o.data.materials.append(mat_); smooth(o)
    return o
def barbell(axis='Y', length=2.1):
    root = bpy.data.objects.new("bar", None); col.objects.link(root)
    parts = [cyl("shaft", 0.0135, length, STEEL, axis=axis)]
    for s in (-1, 1):
        for off, r, th, m_ in ((0.66, 0.2, 0.04, RUBBER), (0.705, 0.2, 0.04, RUBBER), (0.745, 0.12, 0.028, DARK), (0.775, 0.035, 0.03, STEEL)):
            loc = V((0, s*off, 0)) if axis == 'Y' else V((s*off, 0, 0))
            parts.append(cyl("plate", r, th, m_, loc, axis, verts=72))
        loc = V((0, s*0.84, 0)) if axis == 'Y' else V((s*0.84, 0, 0))
        parts.append(cyl("sleeve", 0.025, 0.42, STEEL, loc, axis))
    for p in parts: p.parent = root
    return root
def link_cyl(name, r, m_):
    return cyl(name, r, 1.0, m_, verts=16)
def set_link(o, a, b, f):
    d = b-a; o.location = (a+b)/2; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = V((0, 0, 1)).rotation_difference(d.normalized()); o.scale = (1, 1, d.length)
    for path in ('location', 'rotation_quaternion', 'scale'): o.keyframe_insert(path, frame=f)
def empty(name):
    e = bpy.data.objects.new(name, None); col.objects.link(e); e.rotation_mode = 'QUATERNION'; return e
def key_e(e, loc, f, q=None):
    e.location = loc; e.keyframe_insert('location', frame=f)
    if q is not None: e.rotation_quaternion = q; e.keyframe_insert('rotation_quaternion', frame=f)

# ── IK ──
PB = rig.pose.bones
for pb in PB: pb.rotation_mode = 'QUATERNION'
def pole_angle(base, tip, pole_rest):
    b, t = B[base], B[tip]
    n = (t.tail_local-b.head_local).cross(pole_rest-b.head_local)
    proj = n.cross(b.tail_local-b.head_local)
    x = b.matrix_local.to_3x3().col[0]
    ax = (b.tail_local-b.head_local).normalized()
    ang = x.angle(proj)
    return -ang if x.cross(proj).dot(ax) > 0 else ang
EMP = {}
def ik(tip, base, pole_dir_rest):
    tgt, pol = empty(tip+"_t"), empty(tip+"_p"); EMP[tip] = (tgt, pol)
    c = PB[tip].constraints.new('IK'); c.target = tgt; c.pole_target = pol; c.chain_count = 2
    c.pole_angle = pole_angle(base, tip, B[tip].head_local+V(pole_dir_rest)); c.use_rotation = False
for s in 'lr':
    ik('lowerarm_'+s, 'upperarm_'+s, (0, 0.5, 0))
    ik('calf_'+s, 'thigh_'+s, (0, -0.5, 0))
ROT = {}
def rotc(bone):
    e = empty(bone+"_r"); ROT[bone] = e
    c = PB[bone].constraints.new('COPY_ROTATION'); c.target = e; c.target_space = 'WORLD'; c.owner_space = 'WORLD'
for s in 'lr': rotc('hand_'+s); rotc('foot_'+s)

def hand_frames(s):
    h0 = head('hand_'+s); F = (head('middle_01_'+s)-h0).normalized()
    L = head('index_01_'+s)-head('pinky_01_'+s); L = (L-F*L.dot(F)).normalized()
    n = F.cross(L) if s == 'l' else L.cross(F)
    return F, L, n
def frame_mat(a, b, c): return M((a, b, c)).transposed()
def hand_q(s, F, n):
    F = F.normalized(); n = (n-F*n.dot(F)).normalized()
    L = n.cross(F) if s == 'l' else F.cross(n)
    Fr, Lr, nr = hand_frames(s)
    R = frame_mat(F, L, n) @ frame_mat(Fr, Lr, nr).transposed()
    return (R @ rot3('hand_'+s)).to_quaternion()
def foot_q(s, yaw): return (M.Rotation(yaw, 3, 'Z') @ rot3('foot_'+s)).to_quaternion()
def bend(bone, axis, ang, f):
    a = rot3(bone).transposed() @ V(axis)
    PB[bone].rotation_quaternion = Q(a, ang); PB[bone].keyframe_insert('rotation_quaternion', frame=f)
def fingers(s, c1=1.0):
    F, L, n = hand_frames(s)
    a = -L if s == 'l' else L
    for name in ('index', 'middle', 'ring', 'pinky'):
        for j, ang in ((1, 62), (2, 78), (3, 42)):
            bn = f"{name}_0{j}_{s}"; PB[bn].rotation_quaternion = Q(rot3(bn).transposed() @ a, math.radians(ang*c1))
    t = (n+a*0.6).normalized()
    for j, ang in ((1, 22), (2, 30), (3, 30)):
        bn = f"thumb_0{j}_{s}"; PB[bn].rotation_quaternion = Q(rot3(bn).transposed() @ a, math.radians(ang))
def body(R, P, f):
    # P = 골반 세계 좌표, R = 몸 회전
    p0 = head('pelvis'); rig.rotation_mode = 'QUATERNION'; rig.rotation_quaternion = R.to_quaternion(); rig.location = P-R@p0
    rig.keyframe_insert('location', frame=f); rig.keyframe_insert('rotation_quaternion', frame=f)
def world(R, P, local): return P+R@(local-head('pelvis'))
GRIP_F, GRIP_N = 0.088, 0.026   # 손목 → 쥔 지점
def arm(s, wr, F, n, pole, k):
    tg, pl = EMP['lowerarm_'+s]; key_e(tg, wr, k); key_e(pl, pole, k); key_e(ROT['hand_'+s], V(), k, hand_q(s, F, n))
def leg(s, ank, pole, yaw, k, q=None):
    ft, fp = EMP['calf_'+s]; key_e(ft, ank, k); key_e(fp, pole, k); key_e(ROT['foot_'+s], V(), k, q if q is not None else foot_q(s, yaw))
def wrist_of(grip, F, n): return grip-F.normalized()*GRIP_F-n.normalized()*GRIP_N
def dumbbell(name, axis):
    root = bpy.data.objects.new(name, None); col.objects.link(root)
    parts = [cyl("h", 0.015, 0.16, STEEL, axis=axis)]
    for sg in (-1, 1):
        for off, r_, th in ((0.095, 0.058, 0.038), (0.132, 0.05, 0.036)):
            loc = V((sg*off, 0, 0)) if axis == 'X' else V((0, sg*off, 0))
            parts.append(cyl("p", r_, th, RUBBER, loc, axis, verts=8 if False else 48))
    for p_ in parts: p_.parent = root
    return root
def seat(y, top, w_=0.34, d=0.42):
    box("seat", (w_, d, 0.08), (0, y, top-0.04), PAD, 0.025); box("seatpost", (0.08, 0.08, top-0.1), (0, y, (top-0.1)/2+0.02), FRAME); box("seatbase", (0.5, 0.09, 0.04), (0, y, 0.02), FRAME)
def set_cam(c, l, ln):
    global CAMV
    CAMV = (V(c), V(l), ln)
p0_ = head('pelvis'); ank0_ = head('foot_l'); ARM_ = L_UP+L_FO+GRIP_F
def ex_deadlift():
    bar = barbell('X')
    for k in range(1, NF+1):
        t = ease((k-1)/(NF-1)); lean = math.radians(lerp(62, 3, t)); RR = M.Rotation(lean, 3, 'X')
        pz = lerp(0.60, p0_.z-0.012, t); by = ank0_.y-0.075
        shl = RR@(head('upperarm_l')-p0_); P = V((0, by-shl.y-0.012, pz)); body(RR, P, k)
        bend('neck_01', (1, 0, 0), -lean*0.42, k); bend('head', (1, 0, 0), -lean*0.3, k)
        sh = world(RR, P, head('upperarm_l')); barp = V((0, by, sh.z-ARM_*0.992)); key_e(bar, barp, k)
        for s, sg in (('l', 1), ('r', -1)):
            F = V((0, 0, -1)); n = V((0, 1, 0)); grip = barp+V((sg*0.235, 0, 0)); wr = wrist_of(grip, F, n)
            sh = world(RR, P, head('upperarm_'+s)); arm(s, wr, F, n, sh+V((sg*0.5, 0.8, -0.25)), k)
            leg(s, V((sg*0.165, ank0_.y, ankle_z)), V((sg*0.3, -1.0, 0.5)), math.radians(sg*8), k)
    set_cam((2.75, -3.1, 1.2), (0, 0.04, 0.78), 66)
def ex_pulldown():
    pz = 0.60; sy = 0.0; seat(sy, pz-0.115); cy = -0.86
    box("column", (0.09, 0.09, 2.3), (0, cy, 1.15), FRAME); box("base", (0.6, 0.5, 0.04), (0, cy+0.1, 0.02), FRAME)
    box("beam", (0.07, 0.86, 0.07), (0, cy+0.42, 2.27), FRAME); pul = V((0, -0.13, 2.235)); cyl("pulley", 0.05, 0.03, DARK, pul, 'X')
    box("padpost", (0.05, 0.05, 0.28), (0, -0.32, 0.56), FRAME); box("thighpad", (0.34, 0.09, 0.08), (0, -0.32, 0.77), PAD, 0.03)
    stack = box("stack", (0.26, 0.12, 0.42), (0, cy-0.11, 0.3), DARK); cable = link_cyl("cable", 0.0035, CABLE)
    bar_ = cyl("lat", 0.012, 1.14, STEEL, axis='X'); bar_.rotation_mode = 'XYZ'
    for sg in (-1, 1): cyl("gr", 0.016, 0.14, RUBBER, (0, 0, sg*0.42), 'Z').parent = bar_
    RR = M.Rotation(math.radians(-13), 3, 'X'); P = V((0, sy+0.03, pz))
    sh0 = world(RR, P, head('upperarm_l'))
    for k in range(1, NF+1):
        t = ease((k-1)/(NF-1)); body(RR, P, k); bend('neck_01', (1, 0, 0), math.radians(-5), k); bend('head', (1, 0, 0), math.radians(-6), k)
        barp = V((0, lerp(sh0.y-0.05, sh0.y-0.11, t), lerp(sh0.z+ARM_*0.92, sh0.z+0.015, t))); bar_.location = barp; bar_.keyframe_insert('location', frame=k)
        set_link(cable, barp, pul, k); stack.location.z = 0.3+lerp(0, 0.55, t); stack.keyframe_insert('location', frame=k)
        for s, sg in (('l', 1), ('r', -1)):
            F = V((sg*lerp(0.16, 0.46, t), 0, 1)).normalized(); n = V((0, -1, 0)); grip = barp+V((sg*0.42, 0, 0)); wr = wrist_of(grip, F, n)
            sh = world(RR, P, head('upperarm_'+s)); arm(s, wr, F, n, sh+V((sg*1.0, 0.45, -0.55)), k)
            leg(s, V((sg*0.2, -0.47, ankle_z)), V((sg*0.26, -1.2, 0.6)), 0, k)
    set_cam((3.1, 2.9, 1.5), (0, -0.12, 1.08), 58)
def ex_curl():
    RR = M.Rotation(math.radians(1), 3, 'X'); P = V((0, 0, p0_.z-0.012)); db = [dumbbell("dl", 'X'), dumbbell("dr", 'X')]
    for k in range(1, NF+1):
        t = ease((k-1)/(NF-1)); body(RR, P, k); phi = math.radians(lerp(8, 128, t))
        for j, (s, sg) in enumerate((('l', 1), ('r', -1))):
            sh = world(RR, P, head('upperarm_'+s)); el = sh+V((sg*0.018, 0.012, -L_UP*0.995))
            F = V((sg*0.03, -math.sin(phi), -math.cos(phi))).normalized(); n = V((0, -math.cos(phi), math.sin(phi)))
            wr = el+F*L_FO; grip = wr+F*GRIP_F+n*GRIP_N; arm(s, wr, F, n, el+V((sg*0.2, 1.0, 0)), k)
            db[j].location = grip; db[j].keyframe_insert('location', frame=k)
            leg(s, V((sg*0.16, ank0_.y, ankle_z)), V((sg*0.24, -1.0, 0.5)), math.radians(sg*7), k)
    set_cam((2.5, -3.3, 1.15), (0, -0.04, 0.98), 64)
def ex_press():
    pz = 0.60; sy = 0.0; seat(sy, pz-0.115); box("back", (0.32, 0.07, 0.72), (0, sy+0.2, pz+0.36), PAD, 0.025); box("bpost", (0.07, 0.07, 1.0), (0, sy+0.27, 0.5), FRAME)
    RR = M.Rotation(math.radians(-3), 3, 'X'); P = V((0, sy, pz)); db = [dumbbell("dl", 'X'), dumbbell("dr", 'X')]
    for k in range(1, NF+1):
        t = ease((k-1)/(NF-1)); body(RR, P, k)
        for j, (s, sg) in enumerate((('l', 1), ('r', -1))):
            sh = world(RR, P, head('upperarm_'+s)); F = V((sg*lerp(-0.05, -0.06, t), 0, 1)).normalized(); n = V((0, -1, 0))
            grip = V((sg*lerp(0.41, 0.26, t), sh.y-0.03, lerp(sh.z+0.09, sh.z+ARM_*0.965, t))); wr = wrist_of(grip, F, n)
            arm(s, wr, F, n, sh+V((sg*1.0, 0.25, -0.6)), k); db[j].location = grip; db[j].keyframe_insert('location', frame=k)
            leg(s, V((sg*0.23, -0.44, ankle_z)), V((sg*0.3, -1.2, 0.6)), math.radians(sg*6), k)
    set_cam((2.25, -3.4, 1.2), (0, 0, 1.08), 58)
def ex_pushup():
    ball = head('ball_l'); By = 0.72
    for k in range(1, NF+1):
        t = ease((k-1)/(NF-1)); al = math.radians(lerp(23, 9, t)); ang = math.pi/2-al; RR = M.Rotation(ang, 3, 'X')
        P = V((0, By, 0.03))-RR@(V((0, ball.y, ball.z))-p0_); body(RR, P, k)
        bend('neck_01', (1, 0, 0), math.radians(-14), k); bend('head', (1, 0, 0), math.radians(-12), k)
        for s, sg in (('l', 1), ('r', -1)):
            sh = world(RR, P, head('upperarm_'+s)); F = V((sg*-0.06, -1, 0)).normalized(); n = V((0, 0, -1))
            arm(s, V((sg*0.31, -0.60, 0.05)), F, n, sh+V((sg*0.7, 0.55, 0.5)), k)
            anw = world(RR, P, V((sg*0.13, head('foot_l').y, ankle_z)))
            q = (M.Rotation(ang-math.radians(35), 3, 'X')@rot3('foot_'+s)).to_quaternion()
            leg(s, anw, world(RR, P, V((sg*0.16, -1.0, 0.5))), 0, k, q)
    set_cam((3.4, -1.25, 0.72), (0, 0.02, 0.33), 60)
def ex_lunge():
    db = [dumbbell("dl", 'Y'), dumbbell("dr", 'Y')]
    for k in range(1, NF+1):
        t = ease((k-1)/(NF-1)); RR = M.Rotation(math.radians(lerp(2, 5, t)), 3, 'X'); P = V((0, 0.03, lerp(0.83, 0.52, t))); body(RR, P, k)
        for j, (s, sg) in enumerate((('l', 1), ('r', -1))):
            sh = world(RR, P, head('upperarm_'+s)); F = V((sg*0.05, 0, -1)).normalized(); n = V((-sg, 0, 0))
            wr = sh+V((sg*0.075, 0, -(L_UP+L_FO)*0.985)); grip = wr+F*GRIP_F+n*GRIP_N
            arm(s, wr, F, n, sh+V((sg*0.2, 1.0, -0.2)), k); db[j].location = grip; db[j].keyframe_insert('location', frame=k)
            if s == 'l':
                leg(s, V((0.13, -0.47, ankle_z)), V((0.18, -1.3, 0.6)), 0, k)
            else:
                q = (M.Rotation(math.radians(48), 3, 'X')@rot3('foot_r')).to_quaternion()
                leg(s, V((-0.13, 0.52, 0.135)), V((-0.16, -0.6, 0.35)), 0, k, q)
    set_cam((3.9, -1.0, 1.0), (0, 0.0, 0.84), 70)
def ex_row():
    pz = 0.42; box("rail", (0.22, 1.5, 0.05), (0, -0.25, 0.08), FRAME); box("seat", (0.34, 0.36, 0.09), (0, 0.06, pz-0.16), PAD, 0.025)
    box("riser", (0.1, 0.1, pz-0.26), (0, 0.06, (pz-0.26)/2+0.08), FRAME)
    fy = -0.8; box("plate", (0.5, 0.05, 0.3), (0, fy-0.05, 0.28), DARK); box("col", (0.09, 0.09, 1.5), (0, fy-0.22, 0.75), FRAME); box("cbase", (0.55, 0.45, 0.04), (0, fy-0.14, 0.02), FRAME)
    pul = V((0, fy-0.03, 0.40)); cyl("pulley", 0.045, 0.03, DARK, pul, 'X'); stack = box("stack", (0.26, 0.12, 0.42), (0, fy-0.33, 0.3), DARK)
    cable = link_cyl("cable", 0.0035, CABLE); hb = cyl("vbar", 0.014, 0.2, STEEL, axis='X')
    for k in range(1, NF+1):
        t = ease((k-1)/(NF-1)); lean = math.radians(lerp(16, -7, t)); RR = M.Rotation(lean, 3, 'X'); P = V((0, 0.07, pz)); body(RR, P, k)
        bend('neck_01', (1, 0, 0), -lean*0.4, k)
        sh = world(RR, P, head('upperarm_l')); grp = V((0, lerp(sh.y-ARM_*0.94, sh.y-0.13, t), lerp(sh.z-0.2, 0.75, t))); hb.location = grp; hb.keyframe_insert('location', frame=k)
        set_link(cable, grp, pul, k); stack.location.z = 0.3+lerp(0, 0.5, t); stack.keyframe_insert('location', frame=k)
        for s, sg in (('l', 1), ('r', -1)):
            sh = world(RR, P, head('upperarm_'+s)); F = V((sg*-0.1, -1, lerp(-0.2, 0.05, t))).normalized(); n = V((-sg, 0, 0)); gr = grp+V((sg*0.07, 0, 0)); wr = wrist_of(gr, F, n)
            arm(s, wr, F, n, sh+V((sg*0.3, 1.0, lerp(-0.4, -0.6, t))), k)
            leg(s, V((sg*0.16, fy+0.055, 0.31)), V((sg*0.22, -0.5, 1.3)), 0, k, (M.Rotation(math.radians(-12), 3, 'X')@rot3('foot_'+s)).to_quaternion())
    set_cam((3.7, -1.6, 1.1), (0, -0.3, 0.68), 58)
NEWEX = {'deadlift': ex_deadlift, 'pulldown': ex_pulldown, 'curl': ex_curl, 'press': ex_press, 'pushup': ex_pushup, 'lunge': ex_lunge, 'row': ex_row}
CAMV = None
def hand_bench():
    global CAMV
    TOP = 0.46
    back_y = max(p.y for i, p in enumerate(rest) if head('spine_01').z < p.z < head('neck_01').z and abs(p.x) < 0.14)
    R = M.Rotation(math.radians(90), 3, 'Z') @ M.Rotation(math.radians(-90), 3, 'X')
    P = V((-0.08, 0, TOP+back_y-head('pelvis').y-0.012))
    sh = world(R, P, head('upperarm_l'))
    box("pad", (1.22, 0.30, 0.07), (-0.42, 0, TOP-0.035), PAD, 0.025)
    box("frame", (1.05, 0.08, 0.05), (-0.42, 0, TOP-0.095), FRAME)
    for x in (-0.86, 0.02):
        box("post", (0.07, 0.07, TOP-0.12), (x, 0, (TOP-0.12)/2+0.02), FRAME)
        box("foot", (0.09, 0.56, 0.04), (x, 0, 0.02), FRAME)
    for s in (-1, 1):
        box("up", (0.07, 0.07, 1.22), (sh.x-0.28, s*0.56, 0.61), FRAME)
        box("hook", (0.14, 0.05, 0.04), (sh.x-0.22, s*0.56, 1.14), DARK)
        box("base", (0.5, 0.08, 0.04), (sh.x-0.2, s*0.56, 0.02), FRAME)
    bar = barbell('Y')
    chest_top = P.z+0.215
    for k in range(1, NF+1):
        t = ease((k-1)/(NF-1))
        body(R, P, k)
        # 위: 어깨 위 팔 폄 → 아래: 가슴 아래쪽
        barp = V((lerp(sh.x+0.03, sh.x+0.135, t), 0, lerp(sh.z+L_UP+L_FO+GRIP_F-0.015, chest_top+0.035, t)))
        key_e(bar, barp, k)
        for s, sg in (('l', 1), ('r', -1)):
            grip = barp+V((0, sg*0.40, 0))
            F = V((lerp(-0.03, -0.12, t), 0, 1)).normalized(); n = V((1, 0, 0))
            wr = grip-F*GRIP_F-n*GRIP_N
            tg, pl = EMP['lowerarm_'+s]; key_e(tg, wr, k)
            key_e(pl, V((wr.x+0.15, sg*0.95, -0.6)), k)
            key_e(ROT['hand_'+s], V(), k, hand_q(s, F, n))
            ank = V((P.x+0.40, sg*0.26, ankle_z)); ft, fp = EMP['calf_'+s]; key_e(ft, ank, k)
            key_e(fp, V((P.x+0.45, sg*0.34, 1.5)), k); key_e(ROT['foot_'+s], V(), k, foot_q(s, math.radians(90)))
    CAMV = (V((1.7, -3.7, 1.05)), V((-0.2, 0, 0.66)), 72)
def hand_squat():
    global CAMV
    bar = barbell('X')
    rack_y = 0.0
    p0 = head('pelvis'); ank0 = head('foot_l')
    for k in range(1, NF+1):
        t = ease((k-1)/(NF-1))
        lean = math.radians(lerp(4, 38, t))
        R = M.Rotation(lean, 3, 'X')
        pz = lerp(p0.z-0.012, 0.56, t)
        barloc = V((0, 0.125, 1.405))-p0
        midfoot = ank0.y-0.055
        py = midfoot-(R@barloc).y
        P = V((0, py, pz))
        body(R, P, k)
        bend('neck_01', (1, 0, 0), -lean*0.45, k); bend('head', (1, 0, 0), -lean*0.35, k)
        barp = world(R, P, barloc+p0); key_e(bar, barp, k)
        for s, sg in (('l', 1), ('r', -1)):
            grip = barp+V((sg*0.34, 0, 0))
            sh = world(R, P, head('upperarm_'+s))
            n = R@V((0, -1, 0.15)); F = R@V((-sg*0.42, 0.15, 1))
            wr = grip-F.normalized()*GRIP_F-n.normalized()*GRIP_N
            tg, pl = EMP['lowerarm_'+s]; key_e(tg, wr, k)
            key_e(pl, sh+R@V((sg*0.75, 0.55, -0.75)), k)
            key_e(ROT['hand_'+s], V(), k, hand_q(s, F, n))
            ank = V((sg*0.205, ank0.y, ankle_z)); ft, fp = EMP['calf_'+s]; key_e(ft, ank, k)
            key_e(fp, V((sg*0.42, -1.0, 0.55)), k); key_e(ROT['foot_'+s], V(), k, foot_q(s, math.radians(sg*18)))
    CAMV = (V((2.75, -3.1, 1.25)), V((0, 0.0, 0.88)), 66)
def hand_pushdown():
    global CAMV
    TY = -0.62
    box("column", (0.09, 0.09, 2.2), (0, TY-0.06, 1.1), FRAME); box("base", (0.62, 0.42, 0.04), (0, TY-0.06, 0.02), FRAME)
    box("arm", (0.07, 0.34, 0.07), (0, TY+0.06, 2.17), FRAME)
    cyl("pulley", 0.05, 0.03, DARK, (0, TY+0.2, 2.1), 'X', verts=48)
    stack = box("stack", (0.26, 0.12, 0.42), (0, TY-0.17, 0.3), DARK)
    for s in (-1, 1): cyl("guide", 0.008, 2.0, STEEL, (s*0.09, TY-0.17, 1.06))
    cable = link_cyl("cable", 0.0035, CABLE); ropes = [link_cyl("rope", 0.011, ACC) for _ in range(2)]
    ferr = cyl("ferrule", 0.018, 0.05, STEEL, verts=24)
    knots = [bpy.data.objects.new("x", None)]
    p0 = head('pelvis'); ank0 = head('foot_l')
    R = M.Rotation(math.radians(9), 3, 'X'); P = V((0, 0.035, p0.z-0.012))
    pul = V((0, TY+0.2, 2.05))
    for k in range(1, NF+1):
        t = ease((k-1)/(NF-1)); body(R, P, k)
        bend('neck_01', (1, 0, 0), math.radians(-7), k); bend('head', (1, 0, 0), math.radians(-5), k)
        phi = math.radians(lerp(96, 8, t))
        hands = []
        for s, sg in (('l', 1), ('r', -1)):
            sh = world(R, P, head('upperarm_'+s))
            el = sh+V((sg*0.012, -0.01, -L_UP*0.995))
            F = V((-sg*lerp(0.34, 0.18, t), -math.sin(phi), -math.cos(phi))).normalized()
            wr = el+F*L_FO
            tg, pl = EMP['lowerarm_'+s]; key_e(tg, wr, k)
            key_e(pl, el+V((sg*0.25, 1.0, 0)), k)
            n = V((-sg, 0, 0))
            key_e(ROT['hand_'+s], V(), k, hand_q(s, F, n))
            hands.append(wr+F*GRIP_F+n.normalized()*GRIP_N)
            ank = V((sg*0.15, ank0.y, ankle_z)); ft, fp = EMP['calf_'+s]; key_e(ft, ank, k)
            key_e(fp, V((sg*0.22, -1.0, 0.5)), k); key_e(ROT['foot_'+s], V(), k, foot_q(s, math.radians(sg*7)))
        mid = (hands[0]+hands[1])/2; to = (pul-mid).normalized(); att = mid+to*0.17
        set_link(cable, att+to*0.03, pul, k)
        ferr.rotation_mode = 'QUATERNION'; ferr.location = att; ferr.rotation_quaternion = V((0, 0, 1)).rotation_difference(to)
        ferr.keyframe_insert('location', frame=k); ferr.keyframe_insert('rotation_quaternion', frame=k)
        set_link(ropes[0], att, hands[0], k); set_link(ropes[1], att, hands[1], k)
        stack.location.z = 0.3+lerp(0, 0.42, t); stack.keyframe_insert('location', frame=k)
    CAMV = (V((3.9, -1.6, 1.15)), V((0, -0.22, 1.08)), 62)
# ── 범용: 픽토그램 자세 → 3D ──
K = 0.0113   # 픽토그램 1px = 약 1.13cm
GROUND = 188
L_TH, L_SH = (tail('thigh_l')-head('thigh_l')).length, (tail('calf_l')-head('calf_l')).length
REACH = L_UP+L_FO
p0g = head('pelvis')
LEN2D = dict(torso=58, neck=19, upper=30, fore=27, thigh=38, shin=37, foot=12)
rad = math.radians
BACK_OFF = max(p.y for p in rest if head('spine_01').z < p.z < head('neck_01').z and abs(p.x) < 0.14)-p0g.y-0.012  # 누울 때 골반 중심 ~ 등 표면
CHEST_OFF = -min(p.y for p in rest if head('spine_01').z < p.z < head('neck_01').z and abs(p.x) < 0.14)+p0g.y-0.012
SEAT_OFF = 0.115
BENCH_TOP = OV.get("bench_top", 0.46)
UNDER = "curl preacher_curl incline_curl concentration_curl spider_curl drag_curl cable_lying_curl plate_curl wrist_curl".split()
NEUTRAL = "kickback one_arm_row seated_row low_row squeeze_press svend behind_back_wrist".split()
ONE_ARM = "one_arm_row concentration_curl kickback".split()
GRIP_W = {"bench_press": .40, "incline_press": .38, "decline_press": .40, "floor_press": .36, "curl": .20, "drag_curl": .2, "preacher_curl": .19, "spider_curl": .19, "skull_crusher": .13, "overhead_ext": .08, "deadlift": .235, "rack_pull": .235, "romanian_deadlift": .235, "stiff_leg": .235, "bent_over_row": .27, "pendlay_row": .27, "seal_row": .27, "overhead_press": .28, "pullover": .15, "shrug": .25, "upright_row": .18, "front_raise": .25, "squat": .34, "front_squat": .2, "good_morning": .34, "lunge_bar": .34, "box_squat": .34, "hack_squat": .34, "calf_raise_bar": .34, "hip_thrust": .34, "glute_bridge": .34, "frog_pump": .34, "kneeling_hip_thrust": .34, "overhead_squat": .55, "overhead_lunge": .5, "wrist_curl": .15, "squeeze_press": .05, "svend": .05, "t_bar_row": .09, "high_row": .22, "low_row": .1, "seated_row": .1, "lat_pulldown": .42, "straight_arm_pulldown": .24, "pushdown": .1, "face_pull": .13, "chest_press": .28, "incline_chest_press": .26, "shoulder_press_machine": .28}
STANCE = {"sumo_squat": .32, "squat": .2, "front_squat": .19, "goblet_squat": .2, "air_squat": .19, "box_squat": .22, "overhead_squat": .22, "belt_squat": .2, "deadlift": .165, "leg_press": .16, "hack_squat": .17, "squat_dumbbell": .19}
FLARE = {"bench_press": .55, "incline_press": .55, "decline_press": .55, "floor_press": .45, "chest_press": .45, "incline_chest_press": .45, "overhead_press": .6, "push_up": .4, "shoulder_press_machine": .6, "dips": .3, "bent_over_row": .25, "lat_pulldown": .6, "pull_up": .6}
pose_view = lambda p: p.get('view', 'side')
def lerp_ang(a, b, t): return a+(((b-a)+180) % 360-180)*t
def pair(a, b, t): return [lerp_ang(a[i] if a[i] is not None else 0, b[i] if b[i] is not None else 0, t) for i in range(len(a))]
def norm3(x): return (list(x)+[0])[:3] if x else None
def dir2d(a): r = rad(a); return (math.cos(r), math.sin(r))
def joints2d(p):
    # rig.ts sideJoints·frontJoints 이식(접촉 판정·장면 기준용)
    J = {}
    add = lambda o, a, ln: (o[0]+ln*math.cos(rad(a)), o[1]+ln*math.sin(rad(a)))
    if pose_view(p) == 'side':
        hip = (0, 0); sh = add(hip, p['t'], 58); J.update(hip=hip, sh=sh, sh2=sh, head=add(sh, p.get('hd', p['t']), 19), neck=add(sh, p.get('hd', p['t']), 4))
        J['el'] = add(sh, p['a'][0], 30); J['wr'] = add(J['el'], p['a'][1], 27); a2 = p.get('a2') or p['a']; J['el2'] = add(sh, a2[0], 30); J['wr2'] = add(J['el2'], a2[1], 27)
        l = p['l']; J['kn'] = add(hip, l[0], 38); J['an'] = add(J['kn'], l[1], 37); J['toe'] = add(J['an'], (l[2] if len(l) > 2 and l[2] is not None else 0), 12)
        l2 = p.get('l2') or l; J['kn2'] = add(hip, l2[0], 38); J['an2'] = add(J['kn2'], l2[1], 37); J['toe2'] = add(J['an2'], (l2[2] if len(l2) > 2 and l2[2] is not None else 0), 12)
        J['chest'] = add(hip, p['t'], 58*.72); J['mid'] = add(hip, p['t'], 58*.45)
    else:
        tilt = p.get('tilt') or 0; up = -90+tilt; hip = (0, 0); nb = add(hip, up, 58); s = p.get('shrug') or 0
        c, si = math.cos(rad(tilt)), math.sin(rad(tilt)); r = (nb[0]+17*c, nb[1]+17*si-s); l = (nb[0]-17*c, nb[1]-17*si-s)
        J.update(hip=hip, sh=r, sh2=l, neck=nb, head=add(nb, up, 19)); J['el'] = add(r, p['ar'][0], 30); J['wr'] = add(J['el'], p['ar'][1], 27)
        al = p.get('al') or [180-p['ar'][0], 180-p['ar'][1]]; J['el2'] = add(l, al[0], 30); J['wr2'] = add(J['el2'], al[1], 27)
        ts = .35 if p.get('seated') else 1; J['kn'] = add((9, 0), p['lr'][0], 38*ts); J['an'] = add(J['kn'], p['lr'][1], 37)
        ll = p.get('ll') or [180-p['lr'][0], 180-p['lr'][1]]; J['kn2'] = add((-9, 0), ll[0], 38*ts); J['an2'] = add(J['kn2'], ll[1], 37)
        J['toe'] = (J['an'][0]+5, J['an'][1]+3); J['toe2'] = (J['an2'][0]-5, J['an2'][1]+3); J['chest'] = add(hip, up, 58*.72); J['mid'] = add(hip, up, 58*.45)
    at = p['at']; dx, dy = at[1]-J[at[0]][0], at[2]-J[at[0]][1]
    return {k: (v[0]+dx, v[1]+dy) for k, v in J.items()}
def pose_at(t):
    a, b = DATA['start'], DATA['end']; bref = (b['at'][1], b['at'][2]) if a['at'][0] == b['at'][0] else joints2d(b)[a['at'][0]]
    at = [a['at'][0], lerp(a['at'][1], bref[0], t), lerp(a['at'][2], bref[1], t)]
    if pose_view(a) == 'side':
        def l3(u, v):
            u2 = list(u)+[0]*(3-len(u)); v2 = list(v)+[0]*(3-len(v)); return pair([x or 0 for x in u2], [x or 0 for x in v2], t)
        o = dict(view='side', at=at, t=lerp_ang(a['t'], b['t'], t), a=pair(a['a'], b['a'], t), l=l3(a['l'], b['l']))
        if 'hd' in a or 'hd' in b: o['hd'] = lerp_ang(a.get('hd', a['t']), b.get('hd', b['t']), t)
        if a.get('a2') or b.get('a2'): o['a2'] = pair(a.get('a2') or a['a'], b.get('a2') or b['a'], t)
        if a.get('l2') or b.get('l2'): o['l2'] = l3(a.get('l2') or a['l'], b.get('l2') or b['l'])
        return o
    o = dict(view='front', at=at, tilt=lerp_ang(a.get('tilt') or 0, b.get('tilt') or 0, t), ar=pair(a['ar'], b['ar'], t), lr=pair(a['lr'], b['lr'], t), seated=a.get('seated'), shrug=lerp(a.get('shrug') or 0, b.get('shrug') or 0, t))
    if a.get('al') or b.get('al'): o['al'] = pair(a.get('al') or [180-a['ar'][0], 180-a['ar'][1]], b.get('al') or [180-b['ar'][0], 180-b['ar'][1]], t)
    if a.get('ll') or b.get('ll'): o['ll'] = pair(a.get('ll') or [180-a['lr'][0], 180-a['lr'][1]], b.get('ll') or [180-b['lr'][0], 180-b['lr'][1]], t)
    return o
def fk(p, d_ang=0.0):
    """골반=원점 3D 관절. near(2D 가까운 쪽)=l, far=r. 실제 뼈 길이."""
    J = {}
    if pose_view(p) == 'side':
        d = lambda a: V((0, -math.cos(rad(a+d_ang)), -math.sin(rad(a+d_ang))))
        t = p['t']+d_ang; th = math.atan2(math.cos(rad(t)), -math.sin(rad(t))); R = M.Rotation(th, 3, 'X')
        rel = lambda n: R@(head(n)-p0g)
        a2 = p.get('a2') or p['a']; l2 = p.get('l2') or p['l']
        for s, sfx, aa, ll in (('l', '', p['a'], p['l']), ('r', '2', a2, l2)):
            sh = rel('upperarm_'+s); el = sh+d(aa[0])*L_UP; wr = el+d(aa[1])*L_FO; hp = rel('thigh_'+s); kn = hp+d(ll[0])*L_TH; an = kn+d(ll[1])*L_SH
            J.update({'sh'+sfx: sh, 'el'+sfx: el, 'wr'+sfx: wr, 'hp'+sfx: hp, 'kn'+sfx: kn, 'an'+sfx: an})
            J['fa'+sfx] = (ll[2] if len(ll) > 2 else 0)+d_ang
        J['R'] = R; J['Fw'] = R@V((0, -1, 0))
    else:
        tilt = rad(p.get('tilt') or 0); R = M.Rotation(tilt, 3, 'Y'); rel = lambda n: R@(head(n)-p0g)
        d = lambda a: V((math.cos(rad(a)), 0, -math.sin(rad(a))))
        al = p.get('al') or [180-p['ar'][0], 180-p['ar'][1]]; ll = p.get('ll') or [180-p['lr'][0], 180-p['lr'][1]]
        for s, sfx, aa, lg in (('l', '', p['ar'], p['lr']), ('r', '2', al, ll)):
            sh = rel('upperarm_'+s)+V((0, 0, (p.get('shrug') or 0)*K)); el = sh+d(aa[0])*L_UP; wr = el+d(aa[1])*L_FO; hp = rel('thigh_'+s)
            if p.get('seated'): kn = hp+V((0, -1, 0))*L_TH; an = kn+V((0, 0, -1))*L_SH
            else: kn = hp+d(lg[0])*L_TH; an = kn+d(lg[1])*L_SH
            J.update({'sh'+sfx: sh, 'el'+sfx: el, 'wr'+sfx: wr, 'hp'+sfx: hp, 'kn'+sfx: kn, 'an'+sfx: an, 'fa'+sfx: 0})
        J['R'] = R; J['Fw'] = R@V((0, -1, 0))
    R = J['R']; J['hip'] = (J['hp']+J['hp2'])/2; J['neck'] = R@(head('neck_01')-p0g); J['head'] = R@(head('head')-p0g+V((0, 0, .1)))
    J['chest'] = R@(head('spine_03')-p0g+V((0, -0.06, 0.05))); J['mid'] = R@(head('spine_02')-p0g); J['toe'] = J['an']+V((0, -.14, -.05)); J['toe2'] = J['an2']+V((0, -.14, -.05))
    return J
def foot_quat(s, a): return (M.Rotation(rad(a), 3, 'X')@rot3('foot_'+s)).to_quaternion()
BALL = head('ball_l')-head('foot_l')
def ankle_floor(a):
    v = M.Rotation(rad(a), 3, 'X')@BALL; heel = M.Rotation(rad(a), 3, 'X')@V((0, .05, -ankle_z))
    return max(ankle_z, -v.z+.018, -heel.z+.002)+OV.get("floor_z", 0)
def abs2w(x, y, ox=120): return V((0, -(x-ox)*K, (GROUND-y)*K))
def clamp_reach(base, tgt, reach, mg=.992):
    d = tgt-base
    return base+d.normalized()*reach*mg if d.length > reach*mg else tgt
def bench_supports(ps, j2):
    # 몸을 받치는 벤치(엉덩이·몸통 아래). 반환 (벤치 y 2D 평균) 또는 None
    hx, hy = j2['hip']; sx, sy = j2['sh']
    for it in (DATA.get('scene') or [])+((DATA.get('machine') or []) if EQUIP == 'machine' else []):
        if it['k'] != 'bench': continue
        a, b = it['a'], it['b']; x0, x1 = min(a[0], b[0])-10, max(a[0], b[0])+10
        if x0 <= hx <= x1 and -6 < lerp(a[1], b[1], .5)-hy < 44: return it
    return None
METRIC = {}
def solve_frame(t, first):
    p = pose_at(t); j2 = joints2d(p); J = fk(p); side = pose_view(p) == 'side'
    A = p['at']; wA = abs2w(A[1], A[2])
    an0 = fk(p)
    sup = bench_supports(p, j2) if side else None
    horiz = side and abs(math.sin(rad(p['t']))) < .5
    gnd = GROUND-11
    fn = max(j2['an'][1], j2['toe'][1]) >= gnd; ff = max(j2['an2'][1], j2['toe2'][1]) >= gnd
    if OV.get("no_foot_floor"): fn = ff = False
    hn = j2['wr'][1] >= GROUND-15; hf = j2['wr2'][1] >= GROUND-15
    supine = side and math.cos(rad(p['t'])) < -.3
    if supine or OV.get("no_hand_floor") or sup is not None: hn = hf = False
    kn = j2['kn'][1] >= GROUND-9; kf = j2['kn2'][1] >= GROUND-9
    hipg = j2['hip'][1] >= GROUND-26 and horiz; elg = j2['el'][1] >= GROUND-8
    shg = supine and j2['sh'][1] >= GROUND-30
    if supine: elg = False
    # 팔꿈치/손 + 발 접촉이면 몸 전체를 기준 관절로 돌려 바닥에 맞춘다(플랭크·푸시업류)
    d = 0.0
    if OV.get("hand_anchor") and side and (fn or ff) and not OV.get("no_rotate"):
        def res2(dd):
            Jq = fk(p, dd); dz = wA.z-Jq[A[0]].z
            return Jq['an'].z+dz-ankle_floor(Jq['fa'])
        best, be = 0, 1e9
        for q in range(-30, 31):
            e = abs(res2(q))
            if e < be: be, best = e, q
        d = best; J = fk(p, d)
    if side and (hn or elg) and (fn or ff or kn) and not sup:
        hz = .05 if hn else .075
        ref = 'wr' if hn else 'el'
        def res(dd):
            Jq = fk(p, dd); dz = hz-Jq[ref].z
            if fn or ff: return Jq['an'].z+dz-ankle_floor(Jq['fa'])
            return Jq['kn'].z+dz-.05
        best, be = 0, 1e9
        for q in range(-28, 29):
            e = abs(res(q))
            if e < be: be, best = e, q
        d = best; J = fk(p, d)
    # 골반 위치
    Pp = V((0, wA.y-J[A[0]].y if A[0] in J else wA.y, 0))
    if OV.get("hand_anchor"):
        Pp.z = wA.z-J[A[0]].z
    elif OV.get("hip_z") is not None:
        Pp.z = OV["hip_z"]
    elif shg:
        # 어깨로 받친 자세(브리지): 어깨가 바닥(또는 지정 높이)에 닿는다
        Pp.z = OV.get("sh_z", BACK_OFF)-J['sh'].z
    elif sup is not None:
        Pp.z = BENCH_TOP+(SEAT_OFF if not horiz else (BACK_OFF if math.cos(rad(p['t'])) < 0 else CHEST_OFF))
    elif hipg:
        Pp.z = (BACK_OFF if math.cos(rad(p['t'])) < 0 else CHEST_OFF)+.005
    elif hn and not (DATA.get('hold') == 'x'):
        Pp.z = .05-J['wr'].z
    elif elg:
        Pp.z = .075-J['el'].z
    elif fn or ff:
        cand = []
        if fn: cand.append(ankle_floor(J['fa'])-J['an'].z)
        if ff: cand.append(ankle_floor(J['fa2'])-J['an2'].z)
        Pp.z = max(cand) if not (kn or kf) else max(cand)
    elif kn or kf:
        Pp.z = .05-(J['kn'].z if kn else J['kn2'].z)
    else:
        Pp.z = wA.z-J[A[0]].z
    if not side: Pp.x = 0
    # 바닥 아래 팔꿈치 금지(플로어 프레스 등): 위팔을 들어 올린다
    if side and supine:
        for sfx in ('', '2'):
            lift = .065-(Pp.z+J['el'+sfx].z)
            if lift > 0:
                J['el'+sfx] = J['el'+sfx]+V((0, 0, lift)); J['wr'+sfx] = J['wr'+sfx]+V((0, 0, lift))
    return dict(p=p, j2=j2, J=J, P=Pp, sup=sup, fn=fn, ff=ff, hn=hn, hf=hf, side=side, horiz=horiz)
FRM = [solve_frame(ease((k-1)/(NF-1)), k == 1) for k in range(1, NF+1)]
if OV.get("zlift"):
    # 사전 점검에서 잰 파묻힘만큼 몸 전체를 프레임별로 올린다(zlift.py 가 적는다: 첫·1/4·중간·3/4·끝)
    _zl = OV["zlift"]
    for _i, _f in enumerate(FRM):
        _u = _i/(NF-1)*4; _a = min(int(_u), 3); _f['P'] = _f['P']+V((0, 0, lerp(_zl[_a], _zl[_a+1], _u-_a)))
GRIP = OV.get("grip") or ("under" if ARCH in UNDER else "neutral" if (ARCH in NEUTRAL or EQUIP in ("dumbbell", "kettlebell")) else "over")
if FRM[0]['side'] is False and GRIP == 'neutral' and ARCH not in NEUTRAL: GRIP = 'nfront'
def grip_n(F, sg, gr, side):
    F = F.normalized(); xa = V((1, 0, 0))
    if gr == 'over': n = xa.cross(F)
    elif gr == 'under': n = -xa.cross(F)
    elif gr == 'nfront': n = V((sg*F.z, 0, -sg*F.x))
    else: n = V((-sg, 0, 0))
    if n.length < .15: n = V((0, 1, 0))
    n = (n-F*n.dot(F))
    return n.normalized()
FREE = ('barbell', 'smith', 'ezbar', 'trapbar', 'dumbbell', 'kettlebell')
HOLD = DATA.get('hold') or 'wr'
def px_world(pt, f0):
    q = abs2w(pt[0], pt[1])+f0['mapd']
    if not f0['side']: q = V(((pt[0]-120)*K, 0, q.z))
    return q
def jw(fr, name):
    J, P = fr['J'], fr['P']
    return P+J[name]
ST = STANCE.get(ARCH, .16)
OBJ = {}
def along_y(d):
    # 국소 Y 를 d 로, 폭(국소 X)은 가능한 한 세계 X 로. rotation_difference 는 정반대(-Y)에서 축이 임의로 잡혀 패드가 칼날로 선다
    y_ = d.normalized() if d.length > 1e-4 else V((0, 1, 0))
    ref = V((1, 0, 0)) if abs(y_.x) < .9 else V((0, 1, 0))
    x_ = (ref-y_*ref.dot(y_)).normalized(); z_ = x_.cross(y_)
    return M(((x_.x, y_.x, z_.x), (x_.y, y_.y, z_.y), (x_.z, y_.z, z_.z))).to_quaternion()
def slab(name, a, b, wid, thick, m_=None):
    d = b-a; o = box(name, (wid, max(d.length, .01), thick), (a+b)/2, m_ or PAD, .018)
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = along_y(d)
    return o
def key_link(o, a, b, k): set_link(o, a, b, k)
def bench3d(it, f0, y_top):
    a, b = px_world(it['a'], f0), px_world(it['b'], f0)
    tilted = abs(it['a'][1]-it['b'][1]) > 6
    if not tilted: a.z = b.z = y_top-.035
    a.z = max(a.z, .1); b.z = max(b.z, .1)
    slab("pad", a, b, .3, .07)
    if it.get('legs') is not False:
        for q in (a, b):
            box("post", (.07, .07, max(q.z-.05, .02)), (0, q.y, max(q.z-.05, .02)/2+.02), FRAME); box("foot", (.5, .08, .04), (0, q.y, .02), FRAME)
def generic():
    f0 = FRM[0]; J0, P0 = f0['J'], f0['P']
    hip2 = f0['j2']['hip']; wh = P0+J0['hip']
    ab = abs2w(*hip2)
    dz = (wh.z-ab.z) if f0['sup'] is not None or f0['horiz'] else 0
    f0['mapd'] = V((0, wh.y-ab.y, dz))
    mp = f0['mapd']
    # 정적 장면
    items = list(DATA.get('scene') or [])
    if EQUIP == 'machine': items += DATA.get('machine') or []
    if EQUIP == 'other': items += DATA.get('other') or []
    dyn = []
    top = BENCH_TOP
    for it in items:
        k_ = it['k']
        if k_ == 'bench': bench3d(it, f0, top)
        elif k_ == 'pad':
            if isinstance(it['a'], str) or isinstance(it['b'], str): dyn.append(it); continue
            a, b = px_world(it['a'], f0), px_world(it['b'], f0)
            w_ = it.get('w', 9)
            if w_ >= 20: slab("back", a, b, .34, min(w_*K, .1))
            else: slab("pad", a, b, .3, max(w_*K, .06))
        elif k_ == 'box' and it.get('under'):
            q = P0+J0[it['under']]; z1 = q.z-OV.get("under_gap", .1)
            box("box", (.56, .5, max(z1, .02)), (0, q.y+it.get('dy', 0), max(z1, .02)/2), PAD, .012)
        elif k_ == 'box':
            q0 = abs2w(it['x'], it['y']+it['h']); q1 = abs2w(it['x']+it['w'], it['y'])
            cy = (q0.y+q1.y)/2+mp.y; z1 = q1.z+mp.z
            box("box", (.56, abs(q1.y-q0.y), max(z1, .02)), (0, cy, max(z1, .02)/2), PAD, .012)
        elif k_ == 'stack' or k_ == 'column':
            q = px_world((it['x'], it.get('top', 60)), f0); qx = 0
            if abs(q.y-wh.y) < .55: qx = .62
            box("column", (.09, .09, max(q.z, 1.9)), (qx, q.y, max(q.z, 1.9)/2), FRAME); box("base", (.6, .44, .04), (qx, q.y, .02), FRAME)
            if k_ == 'stack': OBJ['stack'] = box("stack", (.26, .12, .42), (qx, q.y+.11, .3), DARK); OBJ['stack_z'] = .3
        elif k_ == 'line':
            if isinstance(it['a'], str) or isinstance(it['b'], str): dyn.append(it); continue
            a, b = px_world(it['a'], f0), px_world(it['b'], f0)
            for sg_ in (-1, 1): slab("guide", a+V((sg_*.26, 0, 0)), b+V((sg_*.26, 0, 0)), .05, .05, FRAME)
        elif k_ in ('lever', 'plate', 'ball', 'dbl', 'kb', 'barbell', 'cable', 'band', 'rope'): dyn.append(it)
        elif k_ == 'wheel':
            q = px_world(it['at'], f0); cyl("wheel", it['r']*K, .08, RUBBER, q, 'X')
        elif k_ == 'bar':
            q = px_world(it['at'], f0); cyl("pullbar", .016, 1.2, STEEL, q, 'X')
            for sg in (-1, 1): box("post", (.07, .07, q.z), (sg*.62, q.y, q.z/2), FRAME); box("foot", (.08, .6, .04), (sg*.62, q.y, .02), FRAME)
        elif k_ == 'barF':
            OBJ['barF'] = it
    free = EQUIP in FREE and HOLD != 'none'
    one = ARCH in ONE_ARM
    # 기구
    bar = None; dbs = []; handle = None
    if free and EQUIP in ('barbell', 'smith', 'trapbar', 'ezbar'):
        bar = barbell('X')
        if EQUIP == 'trapbar':
            for sg in (-1, 1): cyl("tb", .012, .6, STEEL, V((sg*.3, 0, 0)), 'Y').parent = bar
        if EQUIP == 'smith':
            for sg in (-1, 1): cyl("rail", .018, 2.2, STEEL, V((sg*.72, 0, 1.1))); box("sfoot", (.1, .7, .04), (sg*.72, 0, .02), FRAME)
    if free and EQUIP in ('dumbbell', 'kettlebell'):
        for s in (('l',) if (one or HOLD == 'chest') else ('l', 'r')):
            if EQUIP == 'kettlebell':
                root = bpy.data.objects.new("kb", None); col.objects.link(root); bpy.ops.mesh.primitive_uv_sphere_add(radius=.085, segments=48, ring_count=24); o = bpy.context.object; o.data.materials.append(RUBBER); smooth(o); o.location = (0, 0, -.1); o.parent = root
                bpy.ops.mesh.primitive_torus_add(major_radius=.05, minor_radius=.012); o = bpy.context.object; o.data.materials.append(STEEL); smooth(o); o.rotation_euler = (math.pi/2, 0, 0); o.parent = root
                root.rotation_mode = 'QUATERNION'; dbs.append((s, root))
            else:
                root = dumbbell("db"+s, 'X'); root.rotation_mode = 'QUATERNION'; dbs.append((s, root))
    plate_it = next((i for i in dyn if i['k'] == 'plate'), None)
    if plate_it:
        OBJ['plate'] = cyl("plate", (plate_it.get('r') or 16)*K*.9, .03, RUBBER, axis=OV.get("plate_axis", 'X')); OBJ['plate'].rotation_mode = 'XYZ'
    levers = {id(i): link_cyl("lever", .018, FRAME) for i in dyn if i['k'] == 'lever'}
    levers2 = {id(i): link_cyl("lever", .018, FRAME) for i in dyn if i['k'] == 'lever' and i['to'] in ('wr', 'an', 'el') and not i.get('mid')}
    for i in dyn:
        if i['k'] == 'lever': q = px_world(i['pivot'], f0); cyl("piv", .03, .06, DARK, q, 'X')
    pads = {}
    for i in dyn:
        if i['k'] != 'pad': continue
        if i['a'] == i['b']: pads[id(i)] = cyl("roller", max(i.get('w', 9)*K*.45, .045), .34, PAD, axis='X')
        else: pads[id(i)] = box("dpad", (.34, 1, max(i.get('w', 9)*K, .05)), (0, 0, 0), PAD, .012); pads[id(i)].rotation_mode = 'QUATERNION'
    lines_ = {id(i): link_cyl("line", (i.get('w', 4))*K*.6, FRAME) for i in dyn if i['k'] == 'line'}
    # 케이블
    cb = None; c_spec = None; pul = None; cables = []; bands = []
    if EQUIP == 'cable':
        c_spec = DATA.get('cable') or {"from": [206, 60], "col": 212}
        pul = px_world(c_spec['from'], f0); colx = c_spec.get('col', c_spec['from'][0]+6)
        cq = px_world((colx, 40), f0); colh = max(pul.z+.25, 1.15)
        FRONT_ = not f0['side']; CX_ = 0
        if FRONT_:
            # 앞모습: 옆 기둥은 X 로, 가운데면 몸 앞으로
            CX_ = cq.x if abs(cq.x) > .3 else 0
            if abs(cq.x) <= .3: cq = V((0, -.75, cq.z)); pul = V((0, -.68, pul.z))
            else: pul = V((pul.x, 0, pul.z))
        for sg in ((-1, 1) if c_spec.get('both') else (0,)):
            X_ = sg*.95 if sg else (CX_ if FRONT_ else 0)
            box("column", (.09, .09, colh), (X_, cq.y, colh/2), FRAME); box("base", (.56, .44, .04), (X_, cq.y, .02), FRAME)
            if pose_view(DATA['start']) == 'front' and not c_spec.get('both') and c_spec['from'][0] != 120: pass
            cyl("pulley", .045, .03, DARK, (X_, pul.y, pul.z), 'X')
            cables.append((X_, link_cyl("cable", .0035, CABLE)))
        OBJ['stack'] = box("stack", (.26, .12, .42), (CX_ if FRONT_ else 0, cq.y+.11 if cq.y < 0 else cq.y-.11, .3), DARK); OBJ['stack_z'] = .3
        handle = link_cyl("handle", .014, STEEL)
    if EQUIP == 'machine' and not DATA.get('machine') and HOLD != 'none':
        c_spec = {"from": [209, 62], "col": 210}; pul = px_world(c_spec['from'], f0); cq = pul
        box("column", (.09, .09, 2.2), (0, cq.y, 1.1), FRAME); box("base", (.56, .44, .04), (0, cq.y, .02), FRAME); cyl("pulley", .045, .03, DARK, (0, pul.y, pul.z), 'X')
        cables.append((0, link_cyl("cable", .0035, CABLE))); OBJ['stack'] = box("stack", (.26, .12, .42), (0, cq.y-.11, .3), DARK); OBJ['stack_z'] = .3; handle = link_cyl("handle", .014, STEEL)
    if EQUIP == 'band':
        bm = pbr("band", srgb("2F6E86"), .55)
        bands = [link_cyl("band", .009, bm), link_cyl("band", .009, bm)]
        _bf = (DATA.get('band') or {}).get('from')
        if isinstance(_bf, list):
            # 밴드 고정점이 허공에 뜨지 않게 기둥을 세운다
            _q = px_world(_bf, f0); box("anchor", (.06, .06, _q.z+.08), (_q.x, _q.y, (_q.z+.08)/2), FRAME); box("base", (.4, .4, .04), (_q.x, _q.y, .02), FRAME)
    if OV.get("dipbars"):
        hz = max(FRM[0]['P'].z+FRM[0]['J']['wr'].z, FRM[-1]['P'].z+FRM[-1]['J']['wr'].z); yy = FRM[0]['P'].y+FRM[0]['J']['wr'].y; bz = min(FRM[0]['P'].z+FRM[0]['J']['wr'].z, FRM[-1]['P'].z+FRM[-1]['J']['wr'].z)-.03
        for sg in (-1, 1):
            cyl("dipbar", .018, 1.0, STEEL, V((sg*OV["wr_x"], yy, bz)), 'Y')
            for dy in (-.42, .42): box("post", (.05, .05, bz), (sg*(OV["wr_x"]+.02), yy+dy, bz/2), FRAME)
    if 'barF' in OBJ:
        y_ = OBJ['barF']['y']; OBJ['barF_y'] = y_
    fingers_open = [(HOLD == 'none' and (f0['hn'] or f0['hf'] or not free)) and not OV.get("closed_hands")]
    zb0 = None; WRP = {'l': [], 'r': []}; ANP = {'l': [], 'r': []}; HOLDP = []; CONTACT = []; LOADOFF = []
    an_fix = {}; wr_fix = {}
    for ki, fr in enumerate(FRM):
        k = ki+1; J, P, p = fr['J'], fr['P'], fr['p']; R = J['R']; side = fr['side']
        if EQUIP == 'smith' and HOLD == 'sh':
            # 스미스 바는 레일을 따라 위아래로만: 어깨 앞뒤 흔들림만큼 몸을 민다
            _y = (P+R@(V((0, .125, 1.405))-p0g)).y
            if 'smith_y' not in OBJ: OBJ['smith_y'] = _y
            P = P.copy(); P.y -= _y-OBJ['smith_y']
        body(R, P, k)
        # 머리
        if side:
            t = p['t']; lean = (t+90+180) % 360-180  # 0=곧게 서서, +앞으로
            if -100 < lean < 100:
                bend('neck_01', (1, 0, 0), -rad(lean)*.42, k); bend('head', (1, 0, 0), -rad(lean)*.3, k)
            else:
                bend('neck_01', (1, 0, 0), 0, k); bend('head', (1, 0, 0), 0, k)
            if p.get('hd') is not None:
                pass
        wrs = {}; grips = {}; Fs = {}; ns = {}
        for s, sfx, sg in (('l', '', 1), ('r', '2', -1)):
            sh = P+J['sh'+sfx]; wr = P+J['wr'+sfx]; el = P+J['el'+sfx]
            if OV.get("wr_line") or (EQUIP == 'smith' and HOLD == 'wr'):
                # 바벨 경로는 곧게(팔 각도 보간의 호를 따라 앞으로 나가지 않게). 스미스는 앞뒤로 움직이지 않는다
                _w0, _w1 = FRM[0]['P']+FRM[0]['J']['wr'+sfx], FRM[-1]['P']+FRM[-1]['J']['wr'+sfx]; _e = ease(ki/(NF-1))
                wr.z = lerp(_w0.z, _w1.z, _e); wr.y = (_w0.y+_w1.y)/2 if EQUIP == 'smith' else lerp(_w0.y, _w1.y, _e)
            F = (wr-el).normalized()
            # 손 너비
            if side and (free and EQUIP in ('barbell', 'smith', 'ezbar', 'trapbar') or EQUIP in ('cable', 'machine', 'band', 'other')) and not one:
                wr.x = sg*(OV.get("grip_w") or GRIP_W.get(ARCH, .22 if EQUIP in ('cable', 'band', 'machine') else .3))
            elif side:
                wr.x = sg*max(abs(sh.x)*(1.15 if HOLD == 'wr' else 1), .03)
                if OV.get("wr_x") is not None: wr.x = sg*OV["wr_x"]
                if EQUIP == 'bodyweight' and (fr['hn'] or fr['hf']): wr.x = sg*.30
            gr = GRIP if not (one and s == 'r') else 'neutral'
            on_floor = (fr['hn'] if s == 'l' else fr['hf'])
            if OV.get("palm_down"):
                pd_ = OV["palm_down"]; F = V((sg*-.05, -pd_, 0)).normalized(); n = V((0, 0, -1))
                if OV.get("wr_x") is not None: wr.x = sg*OV["wr_x"]
            elif on_floor:
                F = V((sg*-.06, -1, 0)).normalized(); n = V((0, 0, -1)); wr.z = .05
            else:
                n = grip_n(F, sg, gr, side)
            wr = clamp_reach(sh, wr, REACH)
            if OV.get("hands_lock"):
                if s in wr_fix: wr = wr_fix[s].copy()
                else: wr_fix[s] = wr.copy()
            wrs[s] = wr; Fs[s] = F; ns[s] = n; grips[s] = wr+F*GRIP_F+n*GRIP_N
        # 프리웨이트 위치·손 조정
        hold_pt = None
        if free and EQUIP in ('barbell', 'smith', 'ezbar', 'trapbar'):
            if HOLD == 'wr': hold_pt = (grips['l']+grips['r'])/2; hold_pt.x = 0
            else:
                if HOLD == 'sh':
                    fr_ = ARCH in ('front_squat',)
                    hold_pt = P+R@(V((0, -.13 if fr_ else .125, 1.405 if not fr_ else 1.42))-p0g)
                elif HOLD == 'hip': hold_pt = P+R@(V((0, -.14, p0g.z+.02))-p0g)
                elif HOLD == 'kn': hold_pt = P+J['kn']+V((0, 0, .08))
                else: hold_pt = P+J[HOLD]; hold_pt.x = 0
                for s, sg in (('l', 1), ('r', -1)):
                    sh = P+J['sh'+('' if s == 'l' else '2')]
                    g = hold_pt+V((sg*GRIP_W.get(ARCH, .32), 0, 0))
                    F = (g-sh); 
                    if HOLD == 'sh': F = R@V((-sg*.42, .15, 1))
                    if HOLD == 'sh' and ARCH == 'front_squat': F = R@V((-sg*.12, .55, .8))
                    F = F.normalized(); n = R@V((0, -1, .15)) if HOLD == 'sh' else grip_n(F, sg, 'over', side)
                    if HOLD == 'sh' and ARCH == 'front_squat': n = R@V((0, -.8, .55))
                    n = (n-F*n.dot(F)).normalized()
                    wrs[s] = clamp_reach(sh, g-F*GRIP_F-n*GRIP_N, REACH); Fs[s] = F; ns[s] = n; grips[s] = g
            key_e(bar, hold_pt, k)
        elif free and EQUIP in ('dumbbell', 'kettlebell') and HOLD == 'chest':
            hold_pt = P+R@(head('spine_03')-p0g+V((0, -.27, .02)))
            for s, sg in (('l', 1), ('r', -1)):
                sh = P+J['sh'+('' if s == 'l' else '2')]; F = R@V((-sg*.35, -.25, 1)); F = F.normalized(); n = R@V((-sg*.5, .1, -.2)); n = (n-F*n.dot(F)).normalized()
                g = hold_pt+R@V((sg*.03, 0, -.03)); wrs[s] = clamp_reach(sh, g-F*GRIP_F-n*GRIP_N, REACH); Fs[s] = F; ns[s] = n; grips[s] = g
            for s_, root in dbs:
                root.location = hold_pt; root.rotation_quaternion = (R@M.Rotation(math.pi/2, 3, 'Y')).to_quaternion() if EQUIP == 'dumbbell' else R.to_quaternion()
                root.keyframe_insert('location', frame=k); root.keyframe_insert('rotation_quaternion', frame=k)
        elif free and EQUIP in ('dumbbell', 'kettlebell'):
            hold_pt = (grips['l']+grips['r'])/2
            for s, root in dbs:
                F = Fs[s]; n = ns[s]; L = (n.cross(F) if s == 'l' else F.cross(n)).normalized()
                # 원판 축(X)을 손잡이 방향(L)으로
                if EQUIP == 'kettlebell':
                    # 손잡이(국소 +Z .05)를 쥔 점에, 공(국소 -Z)을 늘어뜨리면 팔뚝 끝 쪽 · 들어 올리면 손등 쪽으로
                    w_ = max(0., min(1., (F.z+.5)/.7)); w_ = w_*w_*(3-2*w_); down = (F*(1-w_)+(-n*.9-F*.25)*w_)
                    down = (down-L*down.dot(L)).normalized(); Z_ = -down; Y_ = Z_.cross(L).normalized()
                    q = M(((L.x, Y_.x, Z_.x), (L.y, Y_.y, Z_.y), (L.z, Y_.z, Z_.z))).to_quaternion(); root.location = grips[s]+down*.05
                else:
                    q = V((1, 0, 0)).rotation_difference(L); root.location = grips[s]
                root.rotation_quaternion = q
                root.keyframe_insert('location', frame=k); root.keyframe_insert('rotation_quaternion', frame=k)
        for i in dyn:
            if i['k'] == 'plate':
                pp_ = (grips['l']+grips['r'])/2 if i['at'] == 'wr' else P+J[i['at']] if isinstance(i['at'], str) else px_world(i['at'], f0)
                key_e(OBJ['plate'], pp_, k)
        # 케이블·밴드
        if cables:
            to = (c_spec.get('to') or 'wr') if c_spec else 'wr'
            for X_, cc in cables:
                pu = V((X_, pul.y, pul.z))
                if X_ != 0 and c_spec.get('both'): tgt = grips['r' if X_ < 0 else 'l']
                elif X_ != 0: tgt = grips['l' if X_ < 0 else 'r']   # 한쪽 기둥: 반대편 손을 가로질러
                elif to == 'wr': tgt = (grips['l']+grips['r'])/2
                else: tgt = P+J[to]
                set_link(cc, tgt, pu, k)
            if len(cables) == 1 and to == 'wr': set_link(handle, grips['l'], grips['r'], k)
            elif handle: set_link(handle, grips['l'], grips['l']+V((.001, 0, 0)), k)
        if bands:
            b = DATA.get('band') or {"from": "an"}
            for bo, s, sfx in ((bands[0], 'l', ''), (bands[1], 'r', '2')):
                frm = b['from']; to = (b.get('to') or 'wr')
                a_ = P+J[frm+sfx if frm in ('an', 'el', 'wr', 'sh', 'kn', 'toe') else frm] if isinstance(frm, str) else px_world(frm, f0)
                if isinstance(frm, list): a_ = a_+V(((1 if s == 'l' else -1)*.05, 0, 0))
                t_ = grips[s] if to == 'wr' else P+J[to+sfx if to in ('an', 'el', 'wr', 'sh', 'kn', 'toe') else to]
                set_link(bo, a_, t_, k)
        for i in dyn:
            res = lambda q: (P+J[q] if isinstance(q, str) else px_world(q, f0))
            if i['k'] == 'lever':
                pv = px_world(i['pivot'], f0)
                if i.get('mid'): set_link(levers[id(i)], pv, (wrs['l']+wrs['r'])/2, k)
                elif id(i) in levers2:
                    tl = wrs['l'] if i['to'] == 'wr' else P+J[i['to']]; tr = wrs['r'] if i['to'] == 'wr' else P+J[i['to']+'2']
                    if i['to'] == 'an': tl = tl.copy(); tr = tr.copy(); tl.x = ST; tr.x = -ST
                    set_link(levers[id(i)], pv+V((.2, 0, 0)), tl, k); set_link(levers2[id(i)], pv+V((-.2, 0, 0)), tr, k)
                else: set_link(levers[id(i)], pv, res(i['to']), k)
            if i['k'] == 'line': set_link(lines_[id(i)], res(i['a']), res(i['b']), k)
            if i['k'] == 'pad':
                a, b = res(i['a']), res(i['b']); o = pads[id(i)]
                if i['a'] == i['b']:
                    rr = OV.get("roller_off", [0, 0])
                    o.location = a+V((0, rr[0], rr[1])); o.keyframe_insert('location', frame=k); continue
                L = max((b-a).length, .22); d = (b-a).normalized() if (b-a).length > 1e-3 else V((0, 1, 0))
                if i.get('off'):
                    a = a+V((0, d.z, -d.y))*(i['off']*K); b = b+V((0, d.z, -d.y))*(i['off']*K)
                o.location = (a+b)/2; o.scale = (1, L, 1); o.rotation_quaternion = along_y(d)
                for path in ('location', 'scale', 'rotation_quaternion'): o.keyframe_insert(path, frame=k)
        # 팔·다리 적용
        for s, sfx, sg in (('l', '', 1), ('r', '2', -1)):
            sh = P+J['sh'+sfx]; wr = wrs[s]; el = P+J['el'+sfx]
            mid = (sh+wr)/2; pdir = el-mid
            back = J['R']@V((0, 1, -.2))
            pdir = pdir+back*.03+V((sg*FLARE.get(ARCH, .12)*max(pdir.length, .06), 0, 0))
            arm(s, wr, Fs[s], ns[s], mid+pdir.normalized()*1.0, k)
            WRP[s].append(wr.copy())
            ank = P+J['an'+sfx]; kn = P+J['kn'+sfx]; hp = P+J['hp'+sfx]
            ank.x = sg*ST if side or True else ank.x
            contact = (fr['fn'] if s == 'l' else fr['ff']); fa = J['fa'+sfx]; lock_ = OV.get("feet_lock")
            if lock_: contact = True
            if contact:
                ank.z = ankle_floor(fa)
                if s not in an_fix: an_fix[s] = (FRM[-1]['P']+FRM[-1]['J']['an'+sfx]).y if lock_ == "end" else ank.y
                if lock_ or (EQUIP == 'smith' and HOLD == 'sh') or abs(ank.y-an_fix[s]) < .03: ank.y = an_fix[s]
            if pose_view(p) == 'front' and p.get('seated'): ank.z = ankle_z
            ank = clamp_reach(hp, ank, L_TH+L_SH, .995)
            m2 = (hp+ank)/2; pd = kn-m2; pd = pd+J['Fw']*.03+V((sg*.12*max(pd.length, .05), 0, 0))
            leg(s, ank, m2+pd.normalized()*1.0, 0, k, foot_quat(s, fa))
            ANP[s].append(ank.copy())
            if contact: CONTACT.append(('foot'+s, ank.copy()))
            if (fr['hn'] if s == 'l' else fr['hf']): CONTACT.append(('hand'+s, wr.copy()))
        if OBJ.get('stack') and (cables):
            d = (grips['l']+grips['r'])/2
            if zb0 is None: zb0 = (d-pul).length
            OBJ['stack'].location.z = OBJ['stack_z']+abs((d-pul).length-zb0)*.8; OBJ['stack'].keyframe_insert('location', frame=k)
        elif OBJ.get('stack'):
            lv = next((i for i in dyn if i['k'] == 'lever'), None)
            q_ = (wrs['l']+wrs['r'])/2 if lv is None or lv['to'] == 'wr' else P+J[lv['to']]
            if zb0 is None: zb0 = q_.copy()
            OBJ['stack'].location.z = OBJ['stack_z']+min((q_-zb0).length*.5, .5); OBJ['stack'].keyframe_insert('location', frame=k)
        if EQUIP == 'smith' and bar is not None:
            pass
        HOLDP.append(hold_pt.copy() if hold_pt is not None else None)
        if hold_pt is not None and fr['fn'] and fr['ff']: LOADOFF.append(abs(hold_pt.y-((ANP['l'][-1].y+ANP['r'][-1].y)/2-.05)))
    # barF: 손 높이에 고정
    if 'barF' in OBJ:
        g = (FRM[0]['P']+FRM[0]['J']['wr']+FRM[0]['P']+FRM[0]['J']['wr2'])/2
        z = g.z+.09; y = g.y
        cyl("pullbar", .016, 1.5, STEEL, V((0, y, z)), 'X')
        for sg in (-1, 1):
            box("post", (.07, .07, z), (sg*.78, y, z/2), FRAME); box("foot", (.08, .7, .04), (sg*.78, y, .02), FRAME)
    if EQUIP == 'smith' and HOLDP[0] is not None:
        rails_y = HOLDP[0].y
        for o in bpy.data.objects:
            if o.name.startswith(("rail", "sfoot")): o.location.y = rails_y
    # 손가락
    for s in 'lr': fingers(s, -0.22 if fingers_open[0] else 1.0)
    METRIC['wrists'] = WRP; METRIC['ankles'] = ANP; METRIC['hold'] = HOLDP; METRIC['contact'] = CONTACT; METRIC['loadoff'] = LOADOFF
def lie_down():
    # 앞모습으로 푼 동작을 통째로 눕히거나 기울인다(플라이류). ang: -90=누움, -55=경사 벤치, +50=가슴 받침
    ang = OV["lie"]; root = bpy.data.objects.new("W", None); col.objects.link(root)
    for o in bpy.data.objects:
        if o is root or o is h or o.parent is not None or o.type in ('CAMERA', 'LIGHT'): continue
        o.parent = root
    P_ = FRM[0]['P']; RX = M.Rotation(rad(ang), 3, 'X'); top = OV.get("bench_top", BENCH_TOP); off = BACK_OFF if ang < 0 else CHEST_OFF
    n_ = RX@V((0, 1 if ang < 0 else -1, 0))   # 몸에서 벤치 쪽(국소 등/가슴) 방향
    pz = OV.get("lie_z", top+off); root.rotation_euler = (rad(ang), 0, 0); root.location = V((0, 0, pz))-RX@P_
    # 벤치: 골반 → 머리 쪽 패드
    Ax = RX@V((0, 0, 1)); hipw = V((0, 0, pz)); base = hipw+n_*off
    if ang == -90:
        a_, b_ = base+Ax*.72, base-Ax*.62
    else:
        a_, b_ = base+Ax*.72, base-Ax*.1
    slab("pad", a_+n_*.035, b_+n_*.035, .3, .07)
    for q in (a_, b_):
        z_ = q.z-.02
        if z_ > .06: box("post", (.07, .07, z_), (0, q.y, z_/2), FRAME); box("foot", (.5, .08, .04), (0, q.y, .02), FRAME)
    bpy.context.view_layer.update()
# ── 실행 ──
if EX == 'generic': generic()
else:
    for s in 'lr': fingers(s, -0.22 if EX == 'pushup' else 1.0)
    {'bench': hand_bench, 'squat': hand_squat, 'pushdown': hand_pushdown}.get(EX, NEWEX.get(EX))()
if OV.get("lie") is not None: lie_down()
# ── 무대·카메라 ──
bpy.ops.mesh.primitive_plane_add(size=40); fl = bpy.context.object; fl.is_shadow_catcher = True
deps = bpy.context.evaluated_depsgraph_get
ss.show_viewport = False
def eval_verts():
    dg = deps(); ev = h.evaluated_get(dg); me = ev.to_mesh(); mw = ev.matrix_world.copy()
    vs = [mw@v.co for v in me.vertices]; ev.to_mesh_clear(); return vs
def equip_points():
    out = {}; dg = deps()
    for o in bpy.data.objects:
        if o.type != 'MESH' or o is h or o is fl: continue
        ev = o.evaluated_get(dg); out[o.name] = [ev.matrix_world@V(c) for c in o.bound_box]
    return out
idx = [i for i in range(len(rest)) if ca.data[i].color[0] > .5]
step_ = max(1, len(idx)//240); idx = idx[::step_]
SAMPLE_F = [1, (NF+1)//2, NF]
SNAP = {}
floor_min = 9; pen = {}
HANDV = {i for i in range(len(rest)) if sum(x for n_, x in w[i].items() if n_.startswith(('hand', 'index', 'middle', 'ring', 'pinky', 'thumb'))) > .3}
FOOTV = {i for i in range(len(rest)) if sum(x for n_, x in w[i].items() if n_.startswith(('foot', 'ball', 'toe'))) > .3}
LOWV = [i for i in range(0, len(rest), 3) if i not in HANDV and i not in FOOTV]; SINK = {}
for f in SAMPLE_F+[(NF+3)//4, (3*NF+1)//4]:
    scn.frame_set(f); vs = eval_verts(); eq = equip_points(); SNAP[f] = (vs, eq)
    SINK[f] = min(vs[i].z for i in LOWV); floor_min = min(floor_min, SINK[f])
    for o in bpy.data.objects:
        if o.type != 'MESH' or o is h or o is fl or o.name.split('.')[0] in ('cable', 'band', 'shaft', 'lever', 'line', 'handle'): continue
        im = o.matrix_world.inverted(); bb = [V(c) for c in o.bound_box]; lo = V((min(c[i] for c in bb) for i in range(3))); hi = V((max(c[i] for c in bb) for i in range(3)))
        sc_ = o.matrix_world.to_scale(); dep = 0
        for ii, v in enumerate(vs):
            if ii % 8 or ii in HANDV or ii in FOOTV: continue
            q = im@v; d_ = min(min(q[i]-lo[i], hi[i]-q[i])*abs(sc_[i]) for i in range(3))
            if d_ > dep: dep = d_
        nm = o.name.split('.')[0]; pen[nm] = max(pen.get(nm, 0), round(dep*100, 1))
def proj_rect(pts, right, up, vd):
    rs = [p.dot(right) for p in pts]; us = [p.dot(up) for p in pts]; return min(rs), max(rs), min(us), max(us)
def cam_for(az, el, lens=60):
    a, e = rad(az), rad(el); d = V((math.sin(a)*math.cos(e), -math.cos(a)*math.cos(e), math.sin(e)))  # 물체→카메라
    vd = -d; right = vd.cross(V((0, 0, 1))).normalized(); up = right.cross(vd).normalized()
    pts = [v for f in SNAP for v in SNAP[f][0][::25]]+[c for f in SNAP for cs in SNAP[f][1].values() for c in cs]
    # 큰 틀(기둥 등)이 사람을 너무 작게 만들지 않게: 몸 + 몸에서 가까운 기구만 맞춘다
    x0, x1, y0, y1 = proj_rect(pts, right, up, vd)
    center_r, center_u = (x0+x1)/2, (y0+y1)/2; half = max(x1-x0, y1-y0)/2/.93
    dmin = max(p.dot(d) for p in pts)
    D = half/(18/lens)+dmin
    look = right*center_r+up*center_u; c = look+d*D
    # 시선 축이 시점에 맞도록 깊이 보정(원근 때문에 앞쪽이 더 크게 보임)
    for _ in range(4):
        m = 0
        for p in pts:
            rel = p-c; dp = rel.dot(vd)
            if dp <= .1: m = 2; continue
            m = max(m, abs((rel.dot(right)))/dp/(18/lens), abs(rel.dot(up))/dp/(18/lens))
        c = c+d*((m-.93)*D*.8); D = (c-look).dot(d)
    return c, look, vd, right, up, lens
def exposure(c, frames=SAMPLE_F):
    if not idx: return 0.0
    vis = tot = 0; dg = deps()
    for f in frames:
        scn.frame_set(f); vs = SNAP[f][0]; dg = deps()
        for i in idx:
            v = vs[i]; d = v-c; L = d.length; hit, loc, nor, _, ob, _m = scn.ray_cast(dg, c, d/L, distance=L+.1)
            tot += 1
            if hit and ob.name == h.name and (loc-v).length < .03: vis += 1
    return vis/max(tot, 1)
def motion_proj(vd):
    a, b = SNAP[1][0], SNAP[NF][0]; tot = pr = 0
    for i in range(0, len(a), 40):
        m = b[i]-a[i]; L = m.length; tot += L; pr += (m-vd*m.dot(vd)).length
    return pr/max(tot, 1e-6)
if CAMV and not OV.get("az"):
    cam, look, lens = CAMV; camera_info = dict(hand=True); vd_ = (look-cam).normalized(); expo = exposure(cam)
else:
    best = None; rows_ = []
    # 몸 정면 기준 방향 규칙: 앞쪽 근육은 앞 3/4 ~ 옆, 뒤쪽 근육은 뒤 3/4 ~ 옆
    BACKSIDE = {'lats', 'midback', 'erector', 'hams', 'G', 'calves', 'triceps', 'rear_delt', 'traps'}
    names_ = set(TN or []) or {m for m in PRIM}
    if 'hamstrings' in names_: names_.add('hams')
    if 'back' in names_: names_.add('lats')
    if 'glutes' in names_: names_.add('G')
    nback = len(names_ & BACKSIDE); wants_back = nback*2 > len(names_) if ARCH not in ('pushdown', 'skull_crusher', 'overhead_ext', 'bench_dip', 'dips', 'kickback') else False
    fw_ = FRM[len(FRM)//2]['J']['Fw'] if EX == 'generic' else V((0, -1, 0)); fh = V((fw_.x, fw_.y, 0)); upright = fh.length > .55
    azs = OV.get("az") or (-150, -120, -90, -60, -35, 0, 35, 60, 90, 120, 150, 180)
    for az in azs:
        for el in OV.get("el") or (9, 20):
            c_, l_, vd_, _r, _u, ln = cam_for(az, el)
            ex_ = exposure(c_); mp_ = motion_proj(vd_)
            face = 1.0 if 25 < abs(az) < 155 else .6
            sc = ex_+.8*mp_+.12*face+(.04 if az > 0 else 0)+(.02 if el == 9 else 0)
            if upright and not OV.get("az"):
                cd_ = -vd_; cos_ = V((cd_.x, cd_.y, 0)).normalized().dot(fh.normalized())
                if wants_back: sc += -1.2*max(0, cos_-.15)   # 앞쪽에서 보면 감점
                else: sc += -1.2*max(0, -cos_+.1)        # 뒤쪽에서 보면 감점
            rows_.append((round(sc, 3), az, el, round(ex_, 3), round(mp_, 3)))
            if best is None or sc > best[0]: best = (sc, az, el, c_, l_, ln, ex_, mp_)
    _, az_, el_, cam, look, lens, expo, mp_ = best
    camera_info = dict(az=az_, el=el_, top=sorted(rows_, reverse=True)[:3], motion=round(mp_, 3))
ss.show_viewport = True
# 지표
m = dict(key=KEY, ex=EX, exposure=round(expo, 3), floor_min=round(floor_min, 3), sink_frames=[round(SINK[f_], 3) for f_ in sorted(SINK)], penetration=pen, camera=camera_info)
if EX == 'generic':
    W_ = METRIC['wrists']; A_ = METRIC['ankles']; ik = []; PB2 = rig.pose.bones
    ROOTM = bpy.data.objects['W'].matrix_world.copy() if 'W' in bpy.data.objects else M.Identity(4)
    for f in (1, (NF+1)//2, NF):
        scn.frame_set(f); dg = deps(); ev = rig.evaluated_get(dg)
        for s in 'lr':
            ik.append((ev.matrix_world@ev.pose.bones['hand_'+s].head-ROOTM@W_[s][f-1]).length); ik.append((ev.matrix_world@ev.pose.bones['foot_'+s].head-ROOTM@A_[s][f-1]).length)
    m['ik_err'] = round(max(ik), 3)
    if METRIC['loadoff']: m['load_off_cm'] = round(max(METRIC['loadoff'])*100, 1)
    fixed = {}
    for nm_, q_ in METRIC['contact']: fixed.setdefault(nm_, []).append(q_)
    m['contact_slip_cm'] = round(max((max((q_-qs[0]).length for q_ in qs) for qs in fixed.values()), default=0)*100, 1)
    hp = [q for q in METRIC['hold'] if q is not None]
    if hp: m['hold_range'] = [round(max(q[i] for q in hp)-min(q[i] for q in hp), 3) for i in range(3)]
    m['ankle_slip'] = round(max(max((q-A_[s][0]).length for q in A_[s]) for s in 'lr'), 3)
    # FK(자세표) vs 해 — 접촉·손 너비 조정으로 멀어진 정도
    m['wrist_travel'] = round(max((W_['l'][-1]-W_['l'][0]).length, (W_['r'][-1]-W_['r'][0]).length), 3)
# 품질 지표: 구도(화면 안·크기)·동작 크기·프레임별 노출·관절 각도 — 판정은 qc.py
_vd = (look-cam).normalized(); _r = _vd.cross(V((0, 0, 1))).normalized(); _u = _r.cross(_vd).normalized(); _t = 18/lens
def ndc(p):
    rel = p-cam; dp = max(rel.dot(_vd), .01); return rel.dot(_r)/dp/_t, rel.dot(_u)/dp/_t
_bx, _by = [], []
for f_ in SNAP:
    for v_ in SNAP[f_][0][::25]:
        a_, b_ = ndc(v_); _bx.append(a_); _by.append(b_)
m['screen_max'] = round(max(max(map(abs, _bx)), max(map(abs, _by))), 3)
_mid = [ndc(v_) for v_ in SNAP[(NF+1)//2][0][::25]]
m['body_frac'] = round(max(max(a_ for a_, _ in _mid)-min(a_ for a_, _ in _mid), max(b_ for _, b_ in _mid)-min(b_ for _, b_ in _mid))/2, 3)
_a, _b = SNAP[1][0], SNAP[NF][0]
m['motion_frac'] = round(max(math.hypot(ndc(_a[i])[0]-ndc(_b[i])[0], ndc(_a[i])[1]-ndc(_b[i])[1]) for i in range(0, len(_a), 25))/2, 3)
m['motion_proj'] = round(motion_proj(_vd), 3)
m['exposure_min'] = round(min(exposure(cam, [f_]) for f_ in SAMPLE_F), 3)
def _ang(p, q, r):
    u_, v_ = (p-q).normalized(), (r-q).normalized(); return math.degrees(math.acos(max(-1, min(1, u_.dot(v_)))))
_el = []; _kn = []
for f_ in SAMPLE_F:
    scn.frame_set(f_); ev = rig.evaluated_get(deps())
    for s_ in 'lr':
        B_ = ev.pose.bones; mw_ = ev.matrix_world
        _el.append(_ang(mw_@B_['upperarm_'+s_].head, mw_@B_['lowerarm_'+s_].head, mw_@B_['hand_'+s_].head))
        _kn.append(_ang(mw_@B_['thigh_'+s_].head, mw_@B_['calf_'+s_].head, mw_@B_['foot_'+s_].head))
m['elbow_min'] = round(min(_el)); m['knee_min'] = round(min(_kn))
print("METRIC "+json.dumps(m, ensure_ascii=False), flush=True)
json.dump(m, open(os.path.join(OUT, KEY+".json"), "w"), ensure_ascii=False)
if PASS == "probe": sys.exit(0)
cd = bpy.data.cameras.new("c"); cd.lens = lens; co = bpy.data.objects.new("c", cd); col.objects.link(co); co.location = cam
co.rotation_mode = 'QUATERNION'; co.rotation_quaternion = (look-cam).to_track_quat('-Z', 'Y'); scn.camera = co
def area(loc, power, size, aim=look):
    d = bpy.data.lights.new("l", 'AREA'); d.energy = power; d.size = size; d.color = (1, 0.98, 0.96)
    o = bpy.data.objects.new("l", d); col.objects.link(o); o.location = loc; o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = (aim-V(loc)).to_track_quat('-Z', 'Y')
vdn = (look-cam).normalized(); rgt = vdn.cross(V((0, 0, 1))).normalized()
area(cam-rgt*1.4+V((0, 0, 3.8)), 360, 3.2); area(cam+rgt*2.6+V((0, 0, .2)), 55, 3.0); area(look+vdn*3.6+V((0, 0, 3.0)), 130, 2.4)
w_ = bpy.data.worlds.new("w"); w_.use_nodes = True; w_.node_tree.nodes["Background"].inputs[0].default_value = (0.9, 0.9, 0.92, 1); w_.node_tree.nodes["Background"].inputs[1].default_value = 0.42; scn.world = w_
c_ = scn.cycles; scn.render.engine = 'CYCLES'; c_.device = 'GPU'; c_.samples = SAMPLES; c_.use_denoising = True; c_.seed = 7
c_.max_bounces = 6
pr = bpy.context.preferences.addons["cycles"].preferences; pr.compute_device_type = 'OPTIX'; pr.get_devices()
for d in pr.devices: d.use = d.type == 'OPTIX'
scn.render.film_transparent = True; scn.render.resolution_x = scn.render.resolution_y = RES; scn.render.resolution_percentage = 100
scn.render.image_settings.file_format = 'PNG'; scn.render.image_settings.color_mode = 'RGBA'
scn.view_settings.view_transform = 'Standard'; scn.view_settings.look = 'None'
scn.frame_start, scn.frame_end = 1, NF
if PASS == "mask":
    for m_ in bpy.data.materials:
        t_ = m_.node_tree; out = next(n for n in t_.nodes if n.type == 'OUTPUT_MATERIAL')
        em = t_.nodes.new("ShaderNodeEmission"); em.inputs["Color"].default_value = (0, 0, 0, 1)
        t_.links.new(em.outputs[0], out.inputs[0])
    t_ = mat.node_tree; em = [n for n in t_.nodes if n.type == 'EMISSION'][-1]
    a3 = t_.nodes.new("ShaderNodeAttribute"); a3.attribute_name = "paint3"; sp3 = t_.nodes.new("ShaderNodeSeparateColor"); t_.links.new(a3.outputs["Color"], sp3.inputs[0])
    # G = Wan 을 쓸 곳(손·반바지·양말·신발 제외) · B = Blender 를 그대로 둘 곳
    m1 = t_.nodes.new("ShaderNodeMath"); m1.operation = 'MAXIMUM'; t_.links.new(cloth, m1.inputs[0]); t_.links.new(sep2.outputs[2], m1.inputs[1])
    m2 = t_.nodes.new("ShaderNodeMath"); m2.operation = 'MAXIMUM'; t_.links.new(m1.outputs[0], m2.inputs[0]); t_.links.new(sp3.outputs[0], m2.inputs[1])
    # 머리카락(cloth 에 포함) 은 Wan 쪽으로 돌린다: 반바지·신발·양말·손만 제외
    m3 = t_.nodes.new("ShaderNodeMath"); m3.operation = 'MAXIMUM'; t_.links.new(sep.outputs[1], m3.inputs[0]); t_.links.new(sep.outputs[2], m3.inputs[1])
    m4 = t_.nodes.new("ShaderNodeMath"); m4.operation = 'MAXIMUM'; t_.links.new(m3.outputs[0], m4.inputs[0]); t_.links.new(sep2.outputs[2], m4.inputs[1])
    m5 = t_.nodes.new("ShaderNodeMath"); m5.operation = 'MAXIMUM'; t_.links.new(m4.outputs[0], m5.inputs[0]); t_.links.new(sp3.outputs[0], m5.inputs[1])
    inv = t_.nodes.new("ShaderNodeMath"); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; t_.links.new(m5.outputs[0], inv.inputs[1])
    cmb = t_.nodes.new("ShaderNodeCombineColor"); t_.links.new(sep.outputs[0], cmb.inputs[0]); t_.links.new(inv.outputs[0], cmb.inputs[1]); t_.links.new(m5.outputs[0], cmb.inputs[2])
    t_.links.new(cmb.outputs[0], em.inputs["Color"])
    fl.hide_render = True; scn.render.film_transparent = False; w_.node_tree.nodes["Background"].inputs[1].default_value = 0
    for o in list(bpy.data.objects):
        if o.type == 'LIGHT': bpy.data.objects.remove(o)
    c_.samples = 8; c_.use_denoising = False
frames = range(1, NF+1) if ONLY is None else [1+round(x*(NF-1)) for x in ONLY]
for f in frames:
    t0 = time.time(); scn.frame_set(f); scn.render.filepath = os.path.join(OUT, f"{KEY}_mask_{f:03d}.png" if PASS == "mask" else f"{KEY}_{f:03d}.png"); bpy.ops.render.render(write_still=True)
    print(f"RENDERED {KEY} {f} {time.time()-t0:.1f}s", flush=True)
