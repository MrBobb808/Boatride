# A stand-in for a TRELLIS.2 mesh, for testing the pipeline where no GPU can run TRELLIS: a humanoid in T-pose with
# spread fingers, built from metaballs, then made as rough as a generated mesh is: triangulated, lumpy, with holes
# punched through it (so the watertight step has work to do), and coloured by vertex (a robe, skin, trousers, boots).
#   blender -b -P standin.py -- out.glb [--apose]   (arms 45 degrees down instead of straight out)
import bpy, bmesh, sys, random
from mathutils import Vector, noise

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = next((x for x in args if not x.startswith('--')), 'standin.glb')
APOSE = '--apose' in args
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)

mb = bpy.data.metaballs.new('body')
mb.resolution = 0.022
mb.render_resolution = 0.022
obj = bpy.data.objects.new('standin', mb)
bpy.context.scene.collection.objects.link(obj)

def ball(p, r):
    e = mb.elements.new(); e.co = Vector(p); e.radius = r; e.stiffness = 2.0

def line(a, b, r0, r1, n):
    a, b = Vector(a), Vector(b)
    for i in range(n + 1):
        t = i / n; ball(a.lerp(b, t), r0 + (r1 - r0) * t)

H = 1.8
# legs (feet at z = 0), hips, torso, neck, head
for s in (-1, 1):
    line((s * 0.11, 0, 0.90), (s * 0.10, 0, 0.48), 0.10, 0.075, 6)
    line((s * 0.10, 0, 0.48), (s * 0.10, 0.01, 0.08), 0.075, 0.055, 6)
    line((s * 0.10, 0.0, 0.06), (s * 0.10, -0.14, 0.04), 0.055, 0.045, 3)   # feet point forward (-Y)
line((0, 0, 0.88), (0, 0, 1.40), 0.16, 0.17, 8)
line((0, 0, 1.40), (0, 0, 1.52), 0.07, 0.06, 2)
ball((0, -0.01, 1.64), 0.13)
# Arms out (T pose, or 45 degrees down in an A pose) and open hands with spread fingers.
import math
drop = math.radians(45 if APOSE else 0)
def arm_pt(s, r):
    """A point r metres out along the arm from the shoulder."""
    return (s * (0.18 + r * math.cos(drop)), 0, 1.40 - r * math.sin(drop))
for s in (-1, 1):
    line(arm_pt(s, 0), arm_pt(s, 0.30), 0.075, 0.06, 6)
    line(arm_pt(s, 0.30), arm_pt(s, 0.56), 0.06, 0.045, 6)
    ball(arm_pt(s, 0.61), 0.05)
    for k, dz in enumerate((0.05, 0.02, -0.01, -0.04)):
        a0, a1 = arm_pt(s, 0.64), arm_pt(s, 0.74)
        line((a0[0], 0, a0[2] + dz * 0.6), (a1[0], 0, a1[2] + dz * 1.4), 0.016, 0.012, 3)
    t0, t1 = arm_pt(s, 0.62), arm_pt(s, 0.68)
    line((t0[0], -0.03, t0[2] - 0.02), (t1[0], -0.07, t1[2] - 0.07), 0.018, 0.013, 2)   # thumb

bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.convert(target='MESH')
obj = bpy.context.view_layer.objects.active
me = obj.data

# As rough as a generated mesh: triangles, lumps, and holes.
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
for v in bm.verts:
    v.co += v.normal * noise.noise(v.co * 18.0) * 0.006
holes = [f for f in bm.faces if random.random() < 0.004]
bmesh.ops.delete(bm, geom=holes, context='FACES')
bm.to_mesh(me); bm.free()

# Colour by region: boots, trousers, a red robe, skin.
col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
for i, v in enumerate(me.vertices):
    x, y, z = v.co
    if z < 0.16: c = (0.24, 0.15, 0.09)
    elif z < 0.86 and abs(x) < 0.3: c = (0.18, 0.17, 0.22)
    elif z > 1.52 or abs(x) > (0.47 if APOSE else 0.66): c = (0.78, 0.58, 0.44)
    else: c = (0.55, 0.12, 0.08)
    if z > 1.70: c = (0.12, 0.08, 0.06)   # hair
    col.data[i].color = (*c, 1.0)

mat = bpy.data.materials.new('standin'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'
nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
me.materials.append(mat)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_vertex_color='ACTIVE')
print(f'standin: {len(me.vertices)} verts, {len(me.polygons)} faces, {len(holes)} holes -> {out}')
