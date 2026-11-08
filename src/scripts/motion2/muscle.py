# SPDX-License-Identifier: GPL-3.0-or-later
"""자극 부위 마스크 렌더(시안). 영상 제작 단계(render.py)와 같은 자세로 자극 부위만 발광시켜 R/NNN.png 로 쓴다.
사용: blender -b base.blend --python muscle.py -- <catalog.json> <키> <프레임수> <해상도> <출력폴더> <주동근,..> [<보조근,..>] [--device GPU]
R 채널 = 주동근, G 채널 = 보조근. 다른 몸·소품은 검정(가림 처리용) · 바닥은 숨긴다. Wan 입력에는 쓰지 않는다(빨강이 번진다)."""
import bpy, addon_utils, sys, os, json, importlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector as V
from rig import Rig
import scene as SC
a = sys.argv[sys.argv.index("--")+1:]
CATA, KEY, NF, RES, OUT, PRIM = a[0], a[1], int(a[2]), int(a[3]), a[4], [x for x in a[5].split(",") if x]
SEC = [x for x in a[6].split(",") if x] if len(a) > 6 and not a[6].startswith("--") else []
DEVICE = a[a.index('--device')+1] if '--device' in a else 'CPU'
E = json.load(open(CATA))["keys"][KEY]
if not E.get("solver"): raise SystemExit(f"계산식 없음: {KEY}")
addon_utils.enable("cycles"); os.makedirs(f"{OUT}/R", exist_ok=True)
h = next(o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers))
rig_o = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); scn = bpy.context.scene
class Ctx: pass
ctx = Ctx(); ctx.rig = Rig(rig_o); ctx.h = h; ctx.col = scn.collection; ctx.scn = scn; ctx.vars = E.get("vars", {})
ctx.rest_v = [v.co.copy() for v in h.data.vertices]; gn = {g.index: g.name for g in h.vertex_groups}
ctx.weights = [{gn[g.group]: g.weight for g in v.groups if g.group in gn} for v in h.data.vertices]; ctx.mats = SC.make_mats()
REST_N = [v.normal.copy() for v in h.data.vertices]   # 부풀리기 전 정지 자세 법선
mod, name = E["solver"].split(":"); FAM = importlib.import_module("families."+mod); setup, solve = FAM.SOLVERS[name]
setup(ctx); SC.paint_body(h, ctx.rig, ctx.rest_v, ctx.weights)
fl = SC.stage(scn, ctx.col, E["cam"], RES, 1, DEVICE)

def W(w, *pre): return sum(x for k, x in w.items() if k.startswith(pre))
def sst(e0, e1, x):
    t = min(1.0, max(0.0, (x-e0)/(e1-e0))) if e1 != e0 else float(x >= e0); return t*t*(3-2*t)
def band(x, lo, hi, s=0.02): return sst(lo-s, lo+s, x)*(1-sst(hi-s, hi+s, x))
# 정지 자세(앞 = -Y, 왼쪽 = +X) 기준 근육 자리. 값 0~1(가장자리 부드럽게). 뼈 가중치 + 높이 + 법선 방향으로 고른다.
def region(m, p, n, w):
    ax, fr, bk = abs(p.x), sst(0.15, 0.45, -n.y), sst(0.15, 0.45, n.y)
    out_ = sst(0.1, 0.5, n.x*(1 if p.x >= 0 else -1))
    up = W(w, 'upperarm'); low = W(w, 'lowerarm'); th = W(w, 'thigh'); calf = W(w, 'calf')
    tor = W(w, 'spine', 'pelvis', 'clavicle', 'neck')
    if m == 'chest': return sst(0.3, 0.6, W(w, 'spine_03', 'clavicle'))*fr*band(p.z, 1.22, 1.39)*(1-sst(0.15, 0.19, ax))
    if m == 'abs': return sst(0.3, 0.6, W(w, 'spine_01', 'spine_02', 'pelvis'))*fr*band(p.z, 0.97, 1.21)*(1-sst(0.10, 0.13, ax))
    if m == 'obliques': return sst(0.3, 0.6, W(w, 'spine_01', 'spine_02', 'pelvis'))*band(p.z, 0.97, 1.19)*band(ax, 0.10, 0.17)*(1-bk)
    if m == 'lats': return sst(0.3, 0.6, W(w, 'spine_02', 'spine_03'))*band(p.z, 1.09, 1.31)*sst(0.06, 0.10, ax)*max(bk, out_)*(1-fr)*(1-sst(0.2, 0.5, up))
    if m == 'traps': return sst(0.3, 0.6, W(w, 'spine_03', 'neck', 'clavicle'))*bk*band(p.z, 1.31, 1.50)*(1-sst(0.17, 0.21, ax))
    if m == 'lower_back': return sst(0.3, 0.6, W(w, 'spine_01', 'spine_02', 'pelvis'))*bk*band(p.z, 0.98, 1.13)*(1-sst(0.08, 0.11, ax))
    if m == 'glutes': return sst(0.4, 0.7, W(w, 'pelvis', 'thigh'))*bk*band(p.z, 0.80, 0.99)*(1-sst(0.17, 0.20, ax))
    if m == 'quads': return sst(0.4, 0.7, th)*sst(0.0, 0.35, -n.y+0.15*out_)*band(p.z, 0.53, 0.88)
    if m == 'hamstrings': return sst(0.4, 0.7, th)*bk*band(p.z, 0.53, 0.82)
    if m == 'adductors': return sst(0.4, 0.7, th)*sst(0.1, 0.5, -n.x*(1 if p.x >= 0 else -1))*band(p.z, 0.62, 0.86)
    if m == 'calves': return sst(0.4, 0.7, calf)*bk*band(p.z, 0.14, 0.45)
    if m == 'front_delts': return sst(0.2, 0.5, up+W(w, 'clavicle'))*fr*band(p.z, 1.29, 1.42)*sst(0.13, 0.17, ax)
    if m == 'side_delts': return sst(0.2, 0.5, up+W(w, 'clavicle'))*out_*band(p.z, 1.27, 1.42)*sst(0.15, 0.19, ax)
    if m == 'rear_delts': return sst(0.2, 0.5, up+W(w, 'clavicle'))*bk*band(p.z, 1.29, 1.42)*sst(0.13, 0.17, ax)
    if m == 'biceps': return sst(0.5, 0.8, up)*fr*band(p.z, 1.18, 1.32)
    if m == 'triceps': return sst(0.5, 0.8, up)*bk*band(p.z, 1.18, 1.34)
    if m == 'forearms': return sst(0.5, 0.8, low)*(1-sst(0.3, 0.6, W(w, *SC.HANDS)))
    raise SystemExit(f"모르는 부위: {m}")
SHORT = {'delts': ['front_delts', 'side_delts', 'rear_delts']}
def expand(ms): return [y for x in ms for y in SHORT.get(x, [x])]
PRIM, SEC = expand(PRIM), expand(SEC)
# [원본] mm = h.data.color_attributes.new("musmask", 'FLOAT_COLOR', 'POINT'); mm = h.data.color_attributes["musmask"]
if "musmask" in h.data.color_attributes: h.data.color_attributes.remove(h.data.color_attributes["musmask"])   # [개선] REV-073: 같은 이름이 있으면 새 것이 .001 이 되어 빈 옛 속성을 읽는다
mm = h.data.color_attributes.new("musmask", 'FLOAT_COLOR', 'POINT')
for i, p in enumerate(ctx.rest_v):
    w = ctx.weights[i]; n = REST_N[i]
    if w.get('body', 0) <= 0: mm.data[i].color = (0, 0, 0, 1); continue
    r_ = max([region(m, p, n, w) for m in PRIM] or [0]); g_ = max([region(m, p, n, w) for m in SEC] or [0])
    mm.data[i].color = (r_, g_*(1-r_), 0, 1)
em = bpy.data.materials.new("mus"); em.use_nodes = True; nn = em.node_tree; nn.nodes.clear(); o_ = nn.nodes.new("ShaderNodeOutputMaterial"); e_ = nn.nodes.new("ShaderNodeEmission"); a_ = nn.nodes.new("ShaderNodeAttribute"); a_.attribute_name = "musmask"
nn.links.new(a_.outputs["Color"], e_.inputs["Color"]); nn.links.new(e_.outputs[0], o_.inputs[0]); h.data.materials.clear(); h.data.materials.append(em)
bk_ = bpy.data.materials.new("bk"); bk_.use_nodes = True; bb = bk_.node_tree; bb.nodes.clear(); o2 = bb.nodes.new("ShaderNodeOutputMaterial"); e2 = bb.nodes.new("ShaderNodeEmission"); e2.inputs["Color"].default_value = (0, 0, 0, 1); bb.links.new(e2.outputs[0], o2.inputs[0])
for ob in bpy.data.objects:
    if ob.type == 'MESH' and ob is not h:
        if not ob.data.materials: ob.data.materials.append(bk_)
        for ii in range(len(ob.data.materials)): ob.data.materials[ii] = bk_
fl.hide_render = True; scn.cycles.samples = 1; scn.cycles.use_denoising = False; scn.view_settings.view_transform = 'Standard'
ts = [i/(NF-1) for i in range(NF)]
for i, t in enumerate(ts):
    ctx.rig.reset(); solve(ctx.rig, t, ctx); ctx.rig.apply(); bpy.context.view_layer.update()
    scn.render.filepath = f"{OUT}/R/{i:03d}.png"; bpy.ops.render.render(write_still=True)
