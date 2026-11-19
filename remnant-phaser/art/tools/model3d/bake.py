# Step 3: the rigged figure (rig.py) posed through the game's clips and rendered side-on, facing right, on a clear
# ground: ACTION_STEPS (16) samples a clip, each a square frame at 2x the game's 192 px cell, the feet at the cell's
# foot line. pack.py turns the frames into the game's atlas.
#   blender -b rigged.blend -P bake.py -- frames_dir [--height-px 84] [--clips idle,run,...] [--samples 10]
# Poses are turns in the side plane (about the world X axis): for a hanging limb, minus swings it forward; for the
# spine, plus leans forward; for a shin, plus folds the knee.
import bpy, sys, math, os, argparse, json
from mathutils import Matrix

CELL, FOOT, STEPS, SCALE = 192, 120, 16, 2
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser(); ap.add_argument('out')
ap.add_argument('--height-px', type=float, default=84); ap.add_argument('--clips', default='')
ap.add_argument('--samples', type=int, default=10)
a = ap.parse_args(argv)

rig = bpy.data.objects['rig']; body = bpy.data.objects['body']
H = max((body.matrix_world @ v.co).z for v in body.data.vertices)
sc = bpy.context.scene

# ---- the clips: u in 0..1 -> {bone: degrees, 'dy': metres back, 'dz': metres up, 'pitch': whole-body degrees}
S = math.sin; C = math.cos; P = math.pi
def ease(u): return u * u * (3 - 2 * u)
def strike(u, wind, hit, keep=0.25):
    """A blow's arc: 0 at rest, wind back, snap through to hit, hold, settle."""
    if u < 0.3: return wind * ease(u / 0.3)
    if u < 0.45: return wind + (hit - wind) * ease((u - 0.3) / 0.15)
    if u < 0.45 + keep: return hit
    return hit * (1 - ease((u - 0.45 - keep) / (0.55 - keep)))
def idle(u):
    b = S(2 * P * u)
    return {'spine': 3 + 1.5 * b, 'chest': 1.5 * b, 'neck': -2, 'upper_arm.R': -4, 'upper_arm.L': 3, 'forearm.R': -14, 'forearm.L': -10, 'dz': 0.006 * b}
def run(u):
    s, ph = S(2 * P * u), 2 * P * u
    knee = lambda p: 18 + 62 * max(0.0, S(p + 0.9))
    return {'spine': 12, 'neck': -6, 'thigh.R': -40 * s, 'thigh.L': 40 * s, 'shin.R': knee(ph), 'shin.L': knee(ph + P),
            'foot.R': -10, 'foot.L': -10, 'upper_arm.R': 38 * s, 'upper_arm.L': -38 * s, 'forearm.R': -70, 'forearm.L': -70,
            'dz': 0.035 * abs(C(ph))}
def jump(u):
    e = ease(u)
    return {'spine': 8, 'thigh.R': -55 * e, 'thigh.L': -25 * e, 'shin.R': 80 * e, 'shin.L': 55 * e, 'upper_arm.R': -60 * e, 'upper_arm.L': -40 * e, 'forearm.R': -30, 'forearm.L': -30}
def fall(u):
    w = 3 * S(2 * P * u)
    return {'spine': -4, 'thigh.R': -25 + w, 'thigh.L': -8 - w, 'shin.R': 35, 'shin.L': 20, 'upper_arm.R': -100 + w, 'upper_arm.L': -80 - w, 'forearm.R': -25, 'forearm.L': -25}
def land(u):
    k = 1 - ease(u)
    return {'spine': 22 * k, 'thigh.R': -55 * k, 'thigh.L': -45 * k, 'shin.R': 95 * k, 'shin.L': 85 * k, 'foot.R': -35 * k, 'foot.L': -35 * k,
            'upper_arm.R': -30 * k, 'upper_arm.L': -20 * k, 'forearm.R': -40 * k, 'dz': -0.16 * k}
def airdash(u):
    return {'spine': 34, 'neck': -14, 'thigh.R': 25, 'thigh.L': 45, 'shin.R': 55, 'shin.L': 70, 'upper_arm.R': 55, 'upper_arm.L': 65, 'forearm.R': -15, 'forearm.L': -15}
def hurt(u):
    k = S(P * u)
    return {'spine': -18 * k, 'neck': -16 * k, 'upper_arm.R': 25 * k, 'upper_arm.L': 30 * k, 'forearm.R': -20, 'dy': 0.04 * k}
def death(u):
    e = ease(min(1, u * 1.2))
    return {'pitch': -88 * e, 'dz': -0.47 * H * e, 'neck': -12 * e, 'upper_arm.R': 40 * e, 'upper_arm.L': 60 * e, 'thigh.R': -10 * e, 'shin.R': 25 * e}
def cast(u):
    e = ease(min(1, u * 2))
    return {'spine': 6 * e, 'upper_arm.R': -82 * e, 'forearm.R': -8 * e, 'hand.R': 20 * e, 'upper_arm.L': 18 * e, 'forearm.L': -30 * e, 'thigh.R': -15 * e, 'shin.R': 15 * e}
def invoke(u):
    e = ease(min(1, u * 1.6))
    return {'spine': -8 * e, 'neck': -14 * e, 'upper_arm.R': -150 * e, 'upper_arm.L': -140 * e, 'forearm.R': -10 * e, 'forearm.L': -10 * e}
def charge(u):
    e = ease(min(1, u * 2)); w = 2 * S(4 * P * u)
    return {'spine': 14 * e, 'thigh.R': -25 * e, 'thigh.L': -10 * e, 'shin.R': 40 * e, 'shin.L': 30 * e, 'dz': -0.05 * e,
            'upper_arm.R': -45 * e + w, 'upper_arm.L': -40 * e - w, 'forearm.R': -85 * e, 'forearm.L': -85 * e}
def b1(u):
    t = strike(u, 30, -92)
    return {'spine': 4 + 0.1 * -t, 'upper_arm.R': t, 'forearm.R': -12 if t < 0 else -60, 'upper_arm.L': 15, 'forearm.L': -35}
def b2(u):
    t = strike(u, 30, -92)
    return {'spine': 4 + 0.1 * -t, 'upper_arm.L': t, 'forearm.L': -12 if t < 0 else -60, 'upper_arm.R': 18, 'forearm.R': -40}
def b3(u):
    t = strike(u, 35, -88); k = max(0.0, -t / 88)
    return {'spine': 14 * k, 'upper_arm.R': t, 'upper_arm.L': t + 8, 'forearm.R': -10, 'forearm.L': -14, 'thigh.R': -32 * k, 'shin.R': 25 * k, 'thigh.L': 18 * k}
def heavy(u):
    if u < 0.4: e = ease(u / 0.4); arms, sp = 55 * e, -12 * e
    elif u < 0.55: e = ease((u - 0.4) / 0.15); arms, sp = 55 - 165 * e, -12 + 40 * e
    elif u < 0.8: arms, sp = -110, 28
    else: e = ease((u - 0.8) / 0.2); arms, sp = -110 * (1 - e), 28 * (1 - e)
    k = max(0.0, -arms / 110)
    return {'spine': sp, 'upper_arm.R': arms, 'upper_arm.L': arms + 6, 'forearm.R': -20, 'forearm.L': -24, 'thigh.R': -40 * k, 'shin.R': 30 * k, 'thigh.L': 20 * k, 'dz': -0.05 * k}
CLIPS = {'idle': (idle, True), 'run': (run, True), 'jump': (jump, False), 'fall': (fall, True), 'land': (land, False),
         'airdash': (airdash, False), 'hurt': (hurt, False), 'death': (death, False), 'cast': (cast, False), 'invoke': (invoke, False),
         'charge': (charge, False), 'b1': (b1, False), 'b2': (b2, False), 'b3': (b3, False), 'heavy': (heavy, False)}
names = [n for n in (a.clips.split(',') if a.clips else CLIPS) if n in CLIPS]

# ---- posing
rest = {pb.name: pb.bone.matrix_local.to_3x3() for pb in rig.pose.bones}
base_loc = rig.location.copy()
def pose(p):
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    for n, deg in p.items():
        if n in rest:
            M = rest[n]; R = Matrix.Rotation(math.radians(deg), 3, 'X')
            rig.pose.bones[n].rotation_quaternion = (M.inverted() @ R @ M).to_quaternion()
    if 'pitch' in p:
        M = rest['root']; R = Matrix.Rotation(math.radians(p['pitch']), 3, 'X')
        rig.pose.bones['root'].rotation_quaternion = (M.inverted() @ R @ M).to_quaternion()
    rig.location = base_loc + __import__('mathutils').Vector((0, p.get('dy', 0), p.get('dz', 0)))
    bpy.context.view_layer.update()

# ---- camera, light, film
px = CELL * SCALE
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = a.samples; sc.cycles.use_denoising = False
sc.render.resolution_x = sc.render.resolution_y = px; sc.render.film_transparent = True
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'
world_h = H * CELL / a.height_px          # the world height the cell shows
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = world_h
cam.location = (-10, 0, (FOOT - CELL / 2) * world_h / CELL)          # the feet (z=0) land on the cell's foot line
cam.rotation_euler = (math.radians(90), 0, math.radians(-90))           # looking along +X: the figure faces screen right
key = bpy.data.objects.new('key', bpy.data.lights.new('key', 'SUN')); sc.collection.objects.link(key)
key.data.energy = 2.3; key.rotation_euler = (math.radians(50), 0, math.radians(-60))   # from the front, above, camera side
rim = bpy.data.objects.new('rim', bpy.data.lights.new('rim', 'SUN')); sc.collection.objects.link(rim)
rim.data.energy = 1.3; rim.rotation_euler = (math.radians(75), 0, 0)                     # low across the front edge
if not sc.world: sc.world = bpy.data.worlds.new('w')
sc.world.use_nodes = True; sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.45

os.makedirs(a.out, exist_ok=True)
meta = {'cell': CELL, 'foot': FOOT, 'steps': STEPS, 'scale': SCALE, 'clips': {}}
for n in names:
    fn, loop = CLIPS[n]
    for i in range(STEPS):
        u = i / (STEPS if loop else STEPS - 1)
        pose(fn(u))
        sc.render.filepath = os.path.join(a.out, f'{n}_{i:02d}.png')
        bpy.ops.render.render(write_still=True)
    meta['clips'][n] = {'loop': loop}
    print(f'bake: {n} ({STEPS} frames)')
pose({})
with open(os.path.join(a.out, 'frames.json'), 'w') as f: json.dump(meta, f, indent=1)
