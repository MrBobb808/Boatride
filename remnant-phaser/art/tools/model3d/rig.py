# Step 2: a skeleton for the prepared body (prepare.py), found from its own shape in A or T pose, bound with automatic
# (bone heat) weights, then lowered into a relaxed rest pose (arms down) so every animation is a turn in the side plane.
#   blender -b body.blend -P rig.py -- rigged.blend [--arms-down 78]
# Joints: the crotch is the lowest point between the legs; the hips sit just above it over each leg; the shoulders are
# where the arms leave the torso; the hands are each arm's farthest point; elbows and knees halfway, bent the way they
# bend. Fingers are not boned: at sprite size a hand is a few pixels; spread fingers in the source keep them apart.
import bpy, sys, math, argparse
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser(); ap.add_argument('output'); ap.add_argument('--arms-down', type=float, default=78)
a = ap.parse_args(argv)

body = bpy.data.objects['body']
co = np.array([v.co[:] for v in body.data.vertices]); x, y, z = co[:, 0], co[:, 1], co[:, 2]
H = z.max()

# ---- landmarks
def slice_(zz, tol=0.012): return co[np.abs(z - zz) < tol * H]
crotch = 0.47 * H
for zz in np.arange(0.25 * H, 0.62 * H, 0.005 * H):
    s = slice_(zz)
    if len(s) and (np.abs(s[:, 0]) < 0.02 * H).any(): crotch = zz; break
hip_z = crotch + 0.04 * H
legs = {s: co[(z < crotch - 0.08 * H) & (s * x > 0)] for s in (-1, 1)}
leg_x = {s: float(np.median(l[:, 0])) if len(l) else s * 0.06 * H for s, l in legs.items()}
# The torso's half width: the inner cluster of a waist slice, before the first gap (arms in A pose stand apart).
ax = np.sort(np.abs(slice_(0.6 * H)[:, 0]))
gaps = np.where(np.diff(ax) > 0.02 * H)[0]
hw = float(ax[gaps[0]] if len(gaps) else ax[-1]) if len(ax) else 0.1 * H
arm = {s: co[(s * x > hw * 1.08) & (z > crotch + 0.18 * H)] for s in (-1, 1)}
sh_z = {}; tips = {}
for s, pts in arm.items():
    if not len(pts): raise SystemExit('rig: no arms found (is the figure in A or T pose, facing -Y?)')
    root = pts[np.abs(pts[:, 0]) < hw + 0.07 * H]
    sh_z[s] = float(np.median(root[:, 2])) if len(root) else 0.8 * H
    sh = np.array([s * hw * 0.85, 0, sh_z[s]])
    tips[s] = pts[np.argmax(np.linalg.norm(pts - sh, axis=1))]
neck_z = max(sh_z.values()) + 0.035 * H
print(f'rig: height {H:.2f}, crotch {crotch / H:.2f}H, torso half-width {hw / H:.3f}H, shoulders {sh_z[-1] / H:.2f}H')

# ---- the armature
arm_data = bpy.data.armatures.new('rig'); rig = bpy.data.objects.new('rig', arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
def bone(name, h, t, parent=None, connect=False):
    b = eb.new(name); b.head = Vector(h); b.tail = Vector(t)
    if parent: b.parent = eb[parent]; b.use_connect = connect
    return b
bone('root', (0, 0, hip_z), (0, 0, hip_z + 0.06 * H))
bone('spine', (0, 0, hip_z), (0, 0, 0.68 * H), 'root')
bone('chest', (0, 0, 0.68 * H), (0, 0, neck_z), 'spine', True)
bone('neck', (0, 0, neck_z), (0, -0.005 * H, 0.885 * H), 'chest', True)
bone('head', (0, -0.005 * H, 0.885 * H), (0, -0.005 * H, H), 'neck', True)
for s, side in ((-1, 'R'), (1, 'L')):
    shp = Vector((s * hw * 0.85, 0, sh_z[s])); tip = Vector(tips[s][:3])
    d = (tip - shp).normalized(); wrist = tip - d * 0.1 * H; elbow = shp.lerp(wrist, 0.5) + Vector((0, 0.012 * H, 0))
    bone(f'upper_arm.{side}', shp, elbow, 'chest')
    bone(f'forearm.{side}', elbow, wrist, f'upper_arm.{side}', True)
    bone(f'hand.{side}', wrist, tip, f'forearm.{side}', True)
    hip = Vector((leg_x[s], 0, hip_z)); ankle = Vector((leg_x[s], 0, 0.05 * H))
    foot_pts = co[(z < 0.08 * H) & (s * x > 0)]
    toe = Vector((leg_x[s], float(foot_pts[:, 1].min()) if len(foot_pts) else -0.08 * H, 0.02 * H))
    knee = hip.lerp(ankle, 0.5) + Vector((0, -0.012 * H, 0))
    bone(f'thigh.{side}', hip, knee, 'root')
    bone(f'shin.{side}', knee, ankle, f'thigh.{side}', True)
    bone(f'foot.{side}', ankle, toe, f'shin.{side}', True)
bpy.ops.object.mode_set(mode='OBJECT')

# ---- automatic weights (bone heat needs the watertight body); any vertex left out goes to its nearest bone
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
groups = {g.index: g.name for g in body.vertex_groups}
segs = {b.name: (b.head_local, b.tail_local) for b in arm_data.bones}
def nearest_bone(p):
    best, bd = None, 1e9
    for n, (h, t) in segs.items():
        ht = t - h; u = max(0.0, min(1.0, (p - h).dot(ht) / max(1e-9, ht.length_squared))); d = (h + ht * u - p).length
        if d < bd: bd, best = d, n
    return best
orphans = 0
for v in body.data.vertices:
    if not any(g.weight > 1e-4 for g in v.groups):
        orphans += 1; n = nearest_bone(v.co)
        (body.vertex_groups.get(n) or body.vertex_groups.new(name=n)).add([v.index], 1.0, 'REPLACE')
print(f'rig: {len(segs)} bones, automatic weights, {orphans} vertices given to their nearest bone')

# ---- rest pose with the arms down: pose them, bake the body into that shape, make it the rest
def world_turn(pb, axis, deg):
    """Turn a pose bone about an armature-space axis, whatever its own rest orientation."""
    R = Matrix.Rotation(math.radians(deg), 3, axis)
    M = pb.bone.matrix_local.to_3x3()
    pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = (M.inverted() @ R @ M).to_quaternion() @ pb.rotation_quaternion
bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
for side, sgn in (('R', -1), ('L', 1)):
    up = rig.pose.bones[f'upper_arm.{side}']
    d = (up.bone.tail_local - up.bone.head_local).normalized()
    slope = math.degrees(math.atan2(-d.z, abs(d.x)))   # an A pose already hangs part of the way
    world_turn(up, 'Y', sgn * (a.arms_down - slope))
bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.objects.active = body
mod = next(m for m in body.modifiers if m.type == 'ARMATURE')
bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.select_all(action='SELECT'); bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode='OBJECT')
m = body.modifiers.new('rig', 'ARMATURE'); m.object = rig
bpy.ops.wm.save_as_mainfile(filepath=a.output)
print(f'rig: arms lowered to {a.arms_down:.0f} degrees, rest pose applied -> {a.output}')
