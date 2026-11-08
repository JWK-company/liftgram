# SPDX-License-Identifier: GPL-3.0-or-later
"""사용: blender -b base.blend --python render.py -- <catalog.json> <키> <프레임수> <샘플> <해상도> <출력폴더> [--probe] [--device GPU] [--only t0,t1]
--probe: 렌더 없이 전 프레임 관절·메시 지표를 <출력폴더>/joints.json 에 쓴다. 렌더: N/NNN.png, M/NNN.png."""
import bpy, addon_utils, sys, os, json, math, importlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mathutils import Vector as V
from mathutils.bvhtree import BVHTree
from rig import Rig
import scene as SC
a = sys.argv[sys.argv.index("--")+1:]
CATA, KEY, NF, SAMPLES, RES, OUT = a[0], a[1], int(a[2]), int(a[3]), int(a[4]), a[5]
rest = a[6:]; PROBE = '--probe' in rest; DEVICE = rest[rest.index('--device')+1] if '--device' in rest else 'CPU'; ONLY = [float(x) for x in rest[rest.index('--only')+1].split(',')] if '--only' in rest else None
E = json.load(open(CATA))["keys"][KEY]
if not E.get("solver"): raise SystemExit(f"계산식 없음: {KEY}")
addon_utils.enable("cycles"); os.makedirs(OUT, exist_ok=True)
h = next(o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers))
rig_o = next(o for o in bpy.data.objects if o.type == 'ARMATURE'); scn = bpy.context.scene
class Ctx: pass
ctx = Ctx(); ctx.rig = Rig(rig_o); ctx.h = h; ctx.col = scn.collection; ctx.scn = scn; ctx.vars = E.get("vars", {})
ctx.rest_v = [v.co.copy() for v in h.data.vertices]; gn = {g.index: g.name for g in h.vertex_groups}
ctx.weights = [{gn[g.group]: g.weight for g in v.groups if g.group in gn} for v in h.data.vertices]; ctx.mats = SC.make_mats()
mod, name = E["solver"].split(":"); FAM = importlib.import_module("families."+mod); setup, solve = FAM.SOLVERS[name]
setup(ctx)
SC.paint_body(h, ctx.rig, ctx.rest_v, ctx.weights)
fl = SC.stage(scn, ctx.col, E["cam"], RES, SAMPLES, DEVICE)
ts = ONLY if ONLY else [i/(NF-1) for i in range(NF)]
NONARM = [sum(x for k, x in w.items() if k.startswith(SC.ARM)) < 0.05 for w in ctx.weights]
PROPS = [o for o in bpy.data.objects if o.type == 'MESH' and o is not h and o is not fl]
# [원본] SOLID = [o for o in PROPS if not o.name.startswith(("shoe_", "shaft", "sl"))] — "sleeve"·"slider"·"slant" 까지 빠졌다(REV-071)
SOLID = [o for o in PROPS if not (o.name.startswith(("shoe_", "shaft", "sl_", "sl.")) or o.name == "sl")]   # 판정 제외: 신발·바 축·바 슬리브(sl)·몸에 감는 소품(sl_ 접두)
SHOES = [o for o in PROPS if o.name.startswith("shoe_")]
LOW = [i for i, w in enumerate(ctx.weights) if w.get('body', 0) > 0 and sum(x for k, x in w.items() if k.startswith(('lowerarm', 'hand'))) > 0.5]
TORSO = {i for i, w in enumerate(ctx.weights) if w.get('body', 0) > 0 and sum(x for k, x in w.items() if k.startswith(('spine', 'pelvis'))) > 0.5}
HANDV = {i for i, w in enumerate(ctx.weights) if sum(x for k, x in w.items() if k.startswith(SC.HANDS)) > 0.3}
BODYV = [i for i, w in enumerate(ctx.weights) if w.get('body', 0) > 0 and i not in HANDV][::3]
if PROBE and "smooth" in h.modifiers: h.modifiers["smooth"].show_viewport = False   # 정점 번호를 원본 그대로 쓴다
def pen(bvh, inv, co):
    """정점이 표면 안쪽으로 들어간 깊이(없으면 0)."""
    p = inv @ co; hit = bvh.find_nearest(p, 0.06)
    if hit[0] is None: return 0.0
    return max(0.0, -(p-hit[0]).dot(hit[1]))
def twist_deg(n):
    b = rig_o.data.bones[n]; pb = rig_o.pose.bones[n]; par = pb.parent
    rel = (par.matrix.to_3x3().inverted() @ pb.matrix.to_3x3()) @ (b.parent.matrix_local.to_3x3().inverted() @ b.matrix_local.to_3x3()).inverted()
    ax = b.parent.matrix_local.to_3x3().inverted() @ (b.tail_local-b.head_local).normalized()
    return math.degrees(importlib.import_module("rig").twist_of(rel, ax))
def probe_frame(info):
    r = ctx.rig; PB = rig_o.pose.bones; out = dict(flags=list(r.flags), bones={n: [list(PB[n].head), list(PB[n].tail)] for n in PB.keys()})
    out["bar"] = list(info["bar"]) if info.get("bar") is not None else None
    out["load"] = [[list(p), m] for p, m in info.get("load", [])]; out["fixed"] = info.get("fixed", [])
    out["grip_err"] = {s: (r.targets['G_'+s]-r.targets['Gnow_'+s]).length for s in 'lr' if 'G_'+s in r.targets}
    out["grip_pt"] = {s: list(r.targets['G_'+s]) for s in 'lr' if 'G_'+s in r.targets}
    F = lambda n: list((PB[n].matrix.to_3x3() @ rig_o.data.bones[n].matrix_local.to_3x3().inverted()) @ V((0, -1, 0)))
    out["front"] = {n: F(n) for n in ('pelvis', 'spine_03', 'foot_l', 'foot_r')}
    out["twist"] = {n: twist_deg(n) for n in ('upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r')}
    dg = bpy.context.evaluated_depsgraph_get(); ob = h.evaluated_get(dg); me = ob.to_mesh()
    zmin = min(v.co.z for v in me.vertices); clear = None
    if out["bar"] is not None:
        by, bz = info["bar"].y, info["bar"].z; d = 9.0
        for i in range(len(NONARM)):
            if NONARM[i]:
                v = me.vertices[i].co
                if abs(v.x) < 0.42: d = min(d, math.hypot(v.y-by, v.z-bz))
        clear = d-0.014
    # 아래팔·손과 몸통, 몸과 소품의 관통을 메시로 잰다
    tv = [me.vertices[i].co.copy() for i in range(len(me.vertices))]; tp = [tuple(q.vertices) for q in me.polygons if all(j in TORSO for j in q.vertices)]
    tb = BVHTree.FromPolygons(tv, tp, all_triangles=False); 
    sp = 0.0
    for i in LOW[::2]:
        hit = tb.find_nearest(tv[i], 0.06)
        if hit[0] is not None: sp = max(sp, -(tv[i]-hit[0]).dot(hit[1]))
    pp = 0.0; pn = ""
    for o in SOLID:
        oe = o.evaluated_get(dg); bv = BVHTree.FromObject(oe, dg); inv = oe.matrix_world.inverted()
        for i in BODYV:
            dp = pen(bv, inv, tv[i])
            if dp > pp: pp, pn = dp, o.name
    shz = 9.0
    for o in SHOES:
        oe = o.evaluated_get(dg); mz = oe.to_mesh(); shz = min(shz, min((oe.matrix_world @ v.co).z for v in mz.vertices)); oe.to_mesh_clear()
    ob.to_mesh_clear(); out["zmin"] = min(zmin, shz) if SHOES else zmin; out["shoe_z"] = shz; out["bar_clear"] = clear; out["self_pen"] = max(0.0, sp); out["prop_pen"] = pp; out["prop_pen_name"] = pn
    return out
log = []; SIG = []
def pose_sig(): return [round(x, 5) for n in ('hand_l', 'hand_r', 'ball_l', 'ball_r', 'head', 'pelvis') for x in rig_o.pose.bones[n].tail]
def prop_sig():
    import hashlib
    return hashlib.sha256(json.dumps(sorted((o.name, [round(x, 4) for r_ in o.matrix_world for x in r_]) for o in PROPS)).encode()).hexdigest()[:16]
for i, t in enumerate(ts):
    ctx.rig.reset(); info = solve(ctx.rig, t, ctx); ctx.rig.apply(); bpy.context.view_layer.update()
    if PROBE: log.append(dict(t=t, prop_sig=prop_sig(), **probe_frame(info)))
    else:
        SIG.append(pose_sig()); scn.render.filepath = f"{OUT}/N/{i:03d}.png"; bpy.ops.render.render(write_still=True)
if PROBE:
    props = sorted([o.name, [round(x, 4) for x in o.location], [round(x, 4) for x in o.dimensions], o.data.materials[0].name if o.data.materials else ""] for o in PROPS)
    rest = {n: [list(b.head_local), list(b.tail_local)] for n, b in rig_o.data.bones.items() if n in ("spine_01", "spine_02", "spine_03", "neck_01", "head")}
    json.dump(dict(key=KEY, nf=len(ts), props=props, rest=rest, frames=log), open(f"{OUT}/joints.tmp", "w")); os.replace(f"{OUT}/joints.tmp", f"{OUT}/joints.json")
elif not os.environ.get("NOMASK"):
    SC.mask_mode(h); fl.hide_render = True; scn.cycles.samples = 1; scn.cycles.use_denoising = False
    for i, t in enumerate(ts):
        ctx.rig.reset(); solve(ctx.rig, t, ctx); ctx.rig.apply(); bpy.context.view_layer.update()
        if pose_sig() != SIG[i]: raise SystemExit(f"렌더와 마스크의 자세가 다름: 프레임 {i}")
        scn.render.filepath = f"{OUT}/M/{i:03d}.png"; bpy.ops.render.render(write_still=True)
