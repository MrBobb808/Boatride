# Step 1 of the 3D pipeline: a generated mesh (TRELLIS.2's GLB, or any GLB/OBJ/FBX/PLY) made into a clean, watertight,
# retopologised body ready to rig.
#   blender -b -P prepare.py -- in.glb out.blend [--faces 9000] [--yaw 0] [--height 1.8] [--voxel 0.008]
# - Every mesh in the file is joined; the figure is turned to face -Y (`--yaw` degrees if it does not), scaled to
#   `--height` metres, its feet set on z = 0 and centred.
# - Voxel remesh (in metres, about 1/225 of the height by default) closes every hole: the result is watertight, which
#   the automatic weights of the rig step need. Loose islands smaller than 1% of it (generation floaters) are dropped.
# - QuadriFlow lays a quad mesh of about `--faces` faces over it (decimation if QuadriFlow cannot).
# - Colour comes across from the original: its colour attribute, or else its base-colour texture through its UVs,
#   sampled at the nearest point of the original surface for every new vertex.
import bpy, bmesh, sys, math, argparse
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.interpolate import poly_3d_calc

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('input'); ap.add_argument('output')
ap.add_argument('--faces', type=int, default=9000)
ap.add_argument('--yaw', type=float, default=0.0)
ap.add_argument('--height', type=float, default=1.8)
ap.add_argument('--voxel', type=float, default=0.0)
a = ap.parse_args(argv)

bpy.ops.wm.read_factory_settings(use_empty=True)
ext = a.input.lower().rsplit('.', 1)[-1]
if ext in ('glb', 'gltf'): bpy.ops.import_scene.gltf(filepath=a.input)
elif ext == 'obj': bpy.ops.wm.obj_import(filepath=a.input)
elif ext == 'fbx': bpy.ops.import_scene.fbx(filepath=a.input)
elif ext == 'ply': bpy.ops.wm.ply_import(filepath=a.input)
else: raise SystemExit(f'prepare: cannot read .{ext}')

# ---- one object, in world space
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
if not meshes: raise SystemExit('prepare: no mesh in the file')
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
for o in meshes:
    o.parent and o.matrix_world  # (evaluated before clearing the parent)
bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshes) > 1: bpy.ops.object.join()
src = bpy.context.view_layer.objects.active
src.name = 'source'
for o in [o for o in bpy.context.scene.objects if o.type != 'MESH']: bpy.data.objects.remove(o)

# ---- face -Y, height, feet on the ground, centred
me = src.data
me.transform(Matrix.Rotation(math.radians(a.yaw), 4, 'Z'))
co = np.array([v.co[:] for v in me.vertices])
lo, hi = co.min(0), co.max(0)
k = a.height / (hi[2] - lo[2])
me.transform(Matrix.Scale(k, 4))
co = np.array([v.co[:] for v in me.vertices]); lo, hi = co.min(0), co.max(0)
me.transform(Matrix.Translation(Vector((-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]))))
me.update()

def stats(m):
    bm = bmesh.new(); bm.from_mesh(m)
    open_edges = sum(1 for e in bm.edges if not e.is_manifold)
    n = (len(bm.verts), len(bm.faces), open_edges); bm.free(); return n

v0, f0, open0 = stats(me)

# ---- watertight: voxel remesh a copy
body = src.copy(); body.data = src.data.copy(); body.name = 'body'
bpy.context.scene.collection.objects.link(body)
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); bpy.context.view_layer.objects.active = body
body.data.remesh_voxel_size = a.voxel or a.height / 225
body.data.use_remesh_fix_poles = True
bpy.ops.object.voxel_remesh()

# Drop floaters: loose islands under 1% of the body.
bm = bmesh.new(); bm.from_mesh(body.data)
seen, islands = set(), []
for v in bm.verts:
    if v.index in seen: continue
    stack, part = [v], []
    seen.add(v.index)
    while stack:
        x = stack.pop(); part.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen: seen.add(y.index); stack.append(y)
    islands.append(part)
big = max(len(p) for p in islands)
drop = [v for p in islands if len(p) < big * 0.01 for v in p]
if drop: bmesh.ops.delete(bm, geom=drop, context='VERTS')
bm.to_mesh(body.data); bm.free()

# ---- retopology: QuadriFlow, else decimation
before = len(body.data.polygons)
try:
    r = bpy.ops.object.quadriflow_remesh(mode='FACES', target_faces=a.faces, use_mesh_symmetry=False, use_preserve_sharp=False,
                                         use_preserve_boundary=False, preserve_attributes=False, smooth_normals=False, seed=0)
    quad = 'FINISHED' in r and len(body.data.polygons) != before
except Exception as e:
    print('prepare: QuadriFlow failed:', e); quad = False
if not quad:
    m = body.modifiers.new('decimate', 'DECIMATE'); m.ratio = min(1.0, a.faces / max(1, len(body.data.polygons)))
    bpy.ops.object.modifier_apply(modifier=m.name)
m = body.modifiers.new('smooth', 'CORRECTIVE_SMOOTH'); m.factor = 0.4; m.iterations = 4; m.smooth_type = 'LENGTH_WEIGHTED'
bpy.ops.object.modifier_apply(modifier=m.name)
for p in body.data.polygons: p.use_smooth = True

# ---- colour from the original surface
sbm = bmesh.new(); sbm.from_mesh(src.data); bmesh.ops.triangulate(sbm, faces=sbm.faces[:]); sbm.faces.ensure_lookup_table()
tree = BVHTree.FromBMesh(sbm)
# Colours are read through the mesh API, which gives them linear whatever their storage (bmesh layers give byte colours
# raw, still in sRGB); corner colours are averaged onto their vertices.
scol = src.data.color_attributes.active_color or next(iter(src.data.color_attributes), None)
vcol = None
if scol is not None:
    n = len(src.data.vertices); acc = np.zeros((n, 3)); cnt = np.zeros(n)
    if scol.domain == 'POINT':
        for i, d in enumerate(scol.data): acc[i] = d.color[:3]; cnt[i] = 1
    else:
        for li, d in enumerate(scol.data):
            vi = src.data.loops[li].vertex_index; acc[vi] += d.color[:3]; cnt[vi] += 1
    vcol = acc / np.maximum(cnt, 1)[:, None]
def lin(c):
    """A texture's sRGB value made linear (Blender's pixels are its stored values)."""
    c = np.asarray(c, dtype=np.float64); return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
pix = None; pix_srgb = True; uvl = sbm.loops.layers.uv.active
for mat in src.data.materials:
    if not mat or not mat.use_nodes: continue
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    link = bsdf and bsdf.inputs['Base Color'].links
    if link and link[0].from_node.type == 'TEX_IMAGE' and link[0].from_node.image:
        img = link[0].from_node.image
        pix = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
        pix_srgb = img.colorspace_settings.name.lower().startswith('srgb') and not img.is_float; break

def colour_at(p):
    loc, _n, fi, _d = tree.find_nearest(p)
    f = sbm.faces[fi]; w = poly_3d_calc([l.vert.co for l in f.loops], loc)
    if pix is not None and uvl is not None:
        uv = sum((l[uvl].uv * wi for l, wi in zip(f.loops, w)), Vector((0, 0)))
        h, wd = pix.shape[:2]
        c = pix[min(h - 1, max(0, int((uv.y % 1) * h))), min(wd - 1, max(0, int((uv.x % 1) * wd)))][:3]
        return tuple(lin(c)) if pix_srgb else tuple(c)
    if vcol is not None:
        return tuple(sum(vcol[l.vert.index] * wi for l, wi in zip(f.loops, w)))
    return (0.6, 0.6, 0.6)

bme = body.data
for c in list(bme.color_attributes): bme.color_attributes.remove(c)
out = bme.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
for v in bme.vertices: out.data[v.index].color = (*colour_at(v.co), 1.0)
sbm.free()

mat = bpy.data.materials.new('body'); mat.use_nodes = True
nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value = 0.85
vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
bme.materials.clear(); bme.materials.append(mat)

v1, f1, open1 = stats(bme)
bpy.data.objects.remove(src)
bpy.ops.wm.save_as_mainfile(filepath=a.output)
print(f'prepare: {v0} verts / {f0} faces / {open0} open edges -> {v1} verts / {f1} faces / {open1} open edges '
      f'({"QuadriFlow" if quad else "decimated"}), {len(drop)} floater verts dropped -> {a.output}')
if open1: raise SystemExit('prepare: the body is still not watertight')
