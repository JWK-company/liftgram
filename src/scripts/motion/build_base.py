import bpy, addon_utils, os, bmesh
# SPDX-License-Identifier: GPL-3.0-or-later
addon_utils.enable("bl_ext.user_default.mpfb", default_set=False)
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("cycles"); addon_utils.enable("bl_ext.user_default.mpfb", default_set=False)
macro = TargetService.get_default_macro_info_dict()
macro.update(gender=1.0, age=0.45, muscle=1.0, weight=0.62, proportions=0.8, height=0.55)
macro["race"] = {"asian":0.34,"caucasian":0.33,"african":0.33}
h = HumanService.create_human(macro_detail_dict=macro, scale=0.1)
rig = HumanService.add_builtin_rig(h, "game_engine", import_weights=True)
bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode != 'OBJECT' else None
bpy.ops.object.select_all(action='DESELECT'); h.select_set(True); bpy.context.view_layer.objects.active = h
bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
for m in list(h.modifiers):
    if m.type == 'MASK': h.modifiers.remove(m)
vg = h.vertex_groups["body"].index
bm = bmesh.new(); bm.from_mesh(h.data)
dl = bm.verts.layers.deform.verify()
bmesh.ops.delete(bm, geom=[v for v in bm.verts if vg not in v[dl]], context='VERTS')
bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=1, use_grid_fill=True)
bm.to_mesh(h.data); bm.free(); h.data.update()
n0 = sum(1 for v in h.data.vertices if len(v.groups) == 0)
print("DIM", h.dimensions, "VERTS", len(h.data.vertices), "NOWEIGHT", n0)
bpy.ops.wm.save_as_mainfile(filepath=os.path.expanduser("~/liftgram_motion/base.blend"))
