# SPDX-License-Identifier: GPL-3.0-or-later
"""회색 재질, 조명, 카메라, 소품, 마스크. 마스크: 흰색 = Wan 적용(머리·손·신발 제외한 몸), 검은색 = Blender 유지."""
import bpy, math
from mathutils import Vector as V
BODY, CLOTH = "BFC3C8", "24272C"
def srgb(hx):
    f = lambda c: c/12.92 if c < 0.04045 else ((c+0.055)/1.055)**2.4
    return tuple(f(int(hx[i:i+2], 16)/255) for i in (0, 2, 4))
def lerp(a, b, t): return a+(b-a)*t
def sstep(a, b, x):
    u = max(0.0, min(1.0, (x-a)/(b-a))); return u*u*(3-2*u)
def pbr(name, rgb, rough=0.55, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1); b.inputs["Roughness"].default_value = rough; b.inputs["Metallic"].default_value = metal; return m
class Mats: pass
def make_mats():
    M_ = Mats(); M_.STEEL = pbr("steel", (0.62, 0.63, 0.65), 0.3, 1.0); M_.RUBBER = pbr("rubber", srgb("1B1D21"), 0.55); M_.HUB = pbr("hub", srgb("3A3E45"), 0.4, 0.3)
    M_.PAD = pbr("pad", srgb("30343A"), 0.5); M_.FRAME = pbr("frame", srgb("5A5F67"), 0.4, 0.5); return M_
def cyl(name, r, l, m_, loc=(0, 0, 0), axis='X', verts=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=l, location=loc); o = bpy.context.object; o.name = name; o.data.materials.append(m_)
    for p in o.data.polygons: p.use_smooth = len(p.vertices) == 4
    if axis == 'X': o.rotation_euler = (0, math.pi/2, 0)
    if axis == 'Y': o.rotation_euler = (math.pi/2, 0, 0)
    o["zaxis"] = 1   # 메시 축은 로컬 Z — rot_to 가 이 표시를 보고 Z 를 맞춘다
    return o
def box(name, size, loc, m_, bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True, location=False, rotation=False)
    b = o.modifiers.new("b", 'BEVEL'); b.width = bevel; b.segments = 3; o.data.materials.append(m_)
    for p in o.data.polygons: p.use_smooth = True
    return o
PLATE_R = 0.225
def barbell(col, mats):
    root = bpy.data.objects.new("bar", None); col.objects.link(root)
    parts = [cyl("shaft", 0.014, 2.2, mats.STEEL)]
    for s in (-1, 1):
        for off, r, th, m_ in ((0.72, PLATE_R, 0.05, mats.RUBBER), (0.775, PLATE_R, 0.05, mats.RUBBER), (0.815, 0.1, 0.03, mats.HUB), (0.86, 0.03, 0.04, mats.STEEL)):
            parts.append(cyl("p", r, th, m_, (s*off, 0, 0), verts=96))
        parts.append(cyl("sl", 0.025, 0.42, mats.STEEL, (s*0.91, 0, 0)))
    for p in parts: p.parent = root
    return root
HANDS = ('hand', 'index', 'middle', 'ring', 'pinky', 'thumb')
ARM = ('upperarm', 'lowerarm')+HANDS
def make_shoes(h, rig, rest_v, weights, margin=0.006):
    """맨발 메시의 발가락이 비쳐 발 크기를 재서 매끈한 신발을 따로 만든다. 발목·발끝 뼈를 그대로 따른다."""
    arm = next(m.object for m in h.modifiers if m.type == 'ARMATURE'); ank = rig.ANK_Z; mat = pbr("shoe", srgb(CLOTH), 0.62); N, M = 26, 18
    for s_, sg in (('l', 1), ('r', -1)):
        pts = [rest_v[i] for i, w in enumerate(weights) if rest_v[i].x*sg > 0 and rest_v[i].z < ank+0.012 and w.get('foot_'+s_, 0)+w.get('ball_'+s_, 0) > 0.3]
        y0, y1 = min(p.y for p in pts), max(p.y for p in pts); z0 = min(p.z for p in pts); sec = []
        for j in range(N):
            y = lerp(y0, y1, j/(N-1)); sl = [p for p in pts if abs(p.y-y) < (y1-y0)/N*1.2] or pts
            sec.append([min(p.x for p in sl), max(p.x for p in sl), max(p.z for p in sl)])
        for _ in range(6):   # 발가락 굴곡을 없앤다
            sec = [[sum(sec[max(0, j+d)][c] if j+d < N else sec[N-1][c] for d in (-1, 0, 1))/3 for c in range(3)] for j in range(N)]
        vs, fs = [], []
        for j in range(N):
            v_ = j/(N-1); y = lerp(y0, y1, v_); xa, xb, zt = sec[j]; cx = (xa+xb)/2
            f_ = max(0.0, 1-min(1.0, v_/0.30)); r_ = max(0.0, 1-min(1.0, (1-v_)/0.16)); end = max(0.15, max(0.0, 1-f_**2.6)**(1/2.6)*max(0.0, 1-r_**2.2)**(1/2.2))   # 앞코·뒤꿈치를 둥글게
            hw = ((xb-xa)/2+margin)*end; H = max(0.012, (zt-z0+margin)*(0.35+0.65*end))
            for k in range(M):
                a_ = 2*math.pi*k/M; c_, s2 = math.cos(a_), math.sin(a_)
                vs.append((cx+hw*math.copysign(abs(c_)**0.8, c_), y, z0-0.011+(H*abs(s2)**0.85 if s2 > 0 else 0.0)))
        for j in range(N-1):
            for k in range(M): fs.append((j*M+k, (j+1)*M+k, (j+1)*M+(k+1) % M, j*M+(k+1) % M))
        fs.append(tuple(range(M-1, -1, -1))); fs.append(tuple((N-1)*M+k for k in range(M)))
        me = bpy.data.meshes.new("shoe_"+s_); me.from_pydata(vs, [], fs); me.update(); ob = bpy.data.objects.new("shoe_"+s_, me); h.users_collection[0].objects.link(ob); me.materials.append(mat)
        for p_ in me.polygons: p_.use_smooth = True
        gf, gb = ob.vertex_groups.new(name='foot_'+s_), ob.vertex_groups.new(name='ball_'+s_); by = rig.head0('ball_'+s_).y
        for i, v in enumerate(vs):
            t_ = sstep(by-0.012, by+0.012, v[1]); gf.add([i], t_, 'REPLACE'); gb.add([i], 1-t_, 'REPLACE')
        ma = ob.modifiers.new("a", 'ARMATURE'); ma.object = arm; sb = ob.modifiers.new("s", 'SUBSURF'); sb.levels = sb.render_levels = 1
def paint_body(h, rig, rest_v, weights):
    """옷·신발 칠하기와 살짝 부풀리기, 마스크 값. 머리카락은 칠하지 않는다(조소 마네킹)."""
    head0 = rig.head0; tail0 = rig.tail0
    hip_z = head0('thigh_l').z; knee_z = tail0('thigh_l').z; ank = rig.ANK_Z
    ca = h.data.color_attributes.new("paint", 'FLOAT_COLOR', 'POINT'); h.data.color_attributes.new("wanmask", 'FLOAT_COLOR', 'POINT')
    ca = h.data.color_attributes["paint"]; mk = h.data.color_attributes["wanmask"]   # 층을 추가하면 앞 참조가 끊길 수 있어 이름으로 다시 얻는다
    disp = []
    for i, p in enumerate(rest_v):
        w = weights[i]
        arm_ = sum(v for k, v in w.items() if k.startswith(ARM)) > 0.15
        hem = lerp(knee_z, hip_z, 0.60)
        sh = 0 if arm_ else sstep(hem-0.003, hem+0.003, p.z)*(1-sstep(hip_z+0.125, hip_z+0.13, p.z))
        shoe = 0 if arm_ else 1-sstep(ank+0.012, ank+0.018, p.z)
        ca.data[i].color = (sh, shoe, 0, 1); disp.append(0.008*sh+0.012*shoe)
        hand = sum(v for k, v in w.items() if k.startswith(HANDS)) > 0.4
        head = w.get('head', 0) > 0.35
        keep = 0.0 if (hand or head or shoe > 0.3 or sh > 0.3) else 1.0   # 옷은 Wan 이 줄무늬·글자를 그려 넣어 뺀다
        mk.data[i].color = (keep, keep, keep, 1)
    nrm = [v.normal.copy() for v in h.data.vertices]
    for i, v in enumerate(h.data.vertices): v.co = rest_v[i]+nrm[i]*disp[i]
    hide = h.vertex_groups.new(name="shoehide"); hide.add([i for i in range(len(rest_v)) if ca.data[i].color[1] > 0.5 and rest_v[i].z < rig.ANK_Z-0.004], 1.0, 'REPLACE')   # 잘린 끝은 신발 안에 숨는다
    mm = h.modifiers.new("hideshoe", 'MASK'); mm.vertex_group = "shoehide"; mm.invert_vertex_group = True; mm.show_viewport = False; mm.show_render = True   # 뼈대 측정은 정점 번호를 그대로 쓴다
    make_shoes(h, rig, rest_v, weights)
    ss = h.modifiers.new("smooth", 'SUBSURF'); ss.levels = ss.render_levels = 1
    for poly in h.data.polygons: poly.use_smooth = True
    mat = pbr("body", srgb(BODY), 0.5); nt = mat.node_tree; bs = nt.nodes["Principled BSDF"]
    at = nt.nodes.new("ShaderNodeAttribute"); at.attribute_name = "paint"; sp = nt.nodes.new("ShaderNodeSeparateColor"); nt.links.new(at.outputs["Color"], sp.inputs[0])
    def mix(a, col_, fac):
        n = nt.nodes.new("ShaderNodeMix"); n.data_type = 'RGBA'
        if isinstance(a, tuple): n.inputs["A"].default_value = (*a, 1)
        else: nt.links.new(a, n.inputs["A"])
        n.inputs["B"].default_value = (*col_, 1); nt.links.new(fac, n.inputs["Factor"]); return n.outputs["Result"]
    c = mix(srgb(BODY), srgb(CLOTH), sp.outputs[0]); c = mix(c, srgb(CLOTH), sp.outputs[1])
    nt.links.new(c, bs.inputs["Base Color"]); h.data.materials.clear(); h.data.materials.append(mat)
def mask_mode(h):
    """모든 재질을 마스크용 발광으로 바꾼다."""
    em = bpy.data.materials.new("mk"); em.use_nodes = True; nn = em.node_tree; nn.nodes.clear(); o_ = nn.nodes.new("ShaderNodeOutputMaterial"); e_ = nn.nodes.new("ShaderNodeEmission"); a2 = nn.nodes.new("ShaderNodeAttribute"); a2.attribute_name = "wanmask"
    nn.links.new(a2.outputs["Color"], e_.inputs["Color"]); nn.links.new(e_.outputs[0], o_.inputs[0]); h.data.materials.clear(); h.data.materials.append(em)
    bk = bpy.data.materials.new("bk"); bk.use_nodes = True; bb = bk.node_tree; bb.nodes.clear(); o2 = bb.nodes.new("ShaderNodeOutputMaterial"); e2 = bb.nodes.new("ShaderNodeEmission"); e2.inputs["Color"].default_value = (0, 0, 0, 1); bb.links.new(e2.outputs[0], o2.inputs[0])
    for ob in bpy.data.objects:
        if ob.type == 'MESH' and ob is not h:
            if not ob.data.materials: ob.data.materials.append(bk)
            for ii in range(len(ob.data.materials)): ob.data.materials[ii] = bk
def stage(scn, col, cam_spec, res, samples, device):
    cam = bpy.data.cameras.new("c"); co = bpy.data.objects.new("c", cam); col.objects.link(co); scn.camera = co
    loc, tgt, lens = V(cam_spec[0]), V(cam_spec[1]), cam_spec[2]
    co.location = loc; co.rotation_euler = (tgt-loc).to_track_quat('-Z', 'Y').to_euler(); cam.lens = lens
    def light(kind, en, l, sz):
        d = bpy.data.lights.new(kind, 'AREA'); d.energy = en; d.size = sz; o = bpy.data.objects.new(kind, d); col.objects.link(o); o.location = l; o.rotation_euler = (V((0, 0, 0.9))-V(l)).to_track_quat('-Z', 'Y').to_euler()
    light("key", 165, (3.0, -2.5, 3.6), 3.0); light("fill", 45, (2.6, 2.6, 1.6), 3.0); light("rim", 70, (-2.8, 0.4, 2.6), 2.5)
    wd = bpy.data.worlds.new("w"); scn.world = wd; wd.use_nodes = True; wd.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1); wd.node_tree.nodes["Background"].inputs[1].default_value = 0.30
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.012)); fl = bpy.context.object; fl.is_shadow_catcher = True; fl.name = "floor"
    scn.render.engine = 'CYCLES'; scn.cycles.samples = samples; scn.cycles.use_denoising = True; scn.cycles.device = device
    if device == 'GPU':
        pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'OPTIX'; pr.get_devices()
        used = 0
        for d in pr.devices:
            d.use = d.type == 'OPTIX'; used += d.use
        if not used: raise SystemExit("OPTIX 장치 없음: CPU 로 조용히 넘어가지 않는다")
    scn.render.resolution_x = scn.render.resolution_y = res; scn.render.film_transparent = True; scn.render.image_settings.file_format = 'PNG'; scn.render.image_settings.color_mode = 'RGBA'
    scn.view_settings.view_transform = 'Standard'; scn.view_settings.look = 'None'
    return fl
