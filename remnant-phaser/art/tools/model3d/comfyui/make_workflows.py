#!/usr/bin/env python3
# Builds this pipeline's two ComfyUI workflows from Comfy-Org's official templates (MIT, github.com/Comfy-Org/
# workflow_templates), so they follow ComfyUI's own node names as those change:
#   01-pose.json  Qwen-Image-Edit 2511 redraws the reference image as the same character standing in an A pose (or a
#                 T pose with --tpose), palms down, every finger spread apart, on plain white, front on. One input
#                 image (the template's second, the material image, is taken out).
#   02-mesh.json  TRELLIS.2 (built into ComfyUI since August 2026): the posed image to a textured mesh. The template's
#                 switch is set to TRELLIS.2; its own post-processing remeshes, unwraps and bakes the texture.
#   python3 make_workflows.py [--tpose] [--templates DIR]   (DIR holds the two template JSONs; fetched when absent)
import argparse, json, os, urllib.request

BASE = 'https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/'
POSE = 'image_qwen_image_edit_2511.json'
MESH = '3d_pixal3d_trellis2_image_to_model.json'
A_POSE = ('Redraw the character in image 1 as a full-body 3D-modelling reference of the same character: the same face, '
          'hair, clothing, colours and proportions, standing in a neutral A pose facing the viewer, arms straight and '
          'held out and down at 45 degrees from the body, palms facing down, all five fingers spread wide apart, legs '
          'straight and a little apart, feet flat on the ground, nothing held in the hands, no cape covering the arms, '
          'plain white background, even flat lighting, no cast shadows, orthographic front view, whole figure in frame.')
NEGATIVE = ('closed fists, fingers together, holding a weapon, cape over the arms, side view, three-quarter view, cropped '
            'limbs, cast shadows, busy background, extra fingers, extra limbs')
T_POSE = A_POSE.replace('in a neutral A pose', 'in a T pose').replace('held out and down at 45 degrees from the body', 'held straight out to the sides at shoulder height')

ap = argparse.ArgumentParser(); ap.add_argument('--tpose', action='store_true'); ap.add_argument('--templates', default='')
a = ap.parse_args()
here = os.path.dirname(os.path.abspath(__file__))
def template(name):
    p = os.path.join(a.templates, name) if a.templates else ''
    if p and os.path.exists(p): return json.load(open(p))
    with urllib.request.urlopen(BASE + name, timeout=60) as r: return json.loads(r.read())

# ---- 01: pose
w = template(POSE)
loads = [n for n in w['nodes'] if n['type'] == 'LoadImage']
keep, drop = loads[0], loads[1:]
keep['widgets_values'][0] = 'reference.png'
gone = {n['id'] for n in drop}
dead = [l for l in w['links'] if l[1] in gone]
w['links'] = [l for l in w['links'] if l[1] not in gone]
w['nodes'] = [n for n in w['nodes'] if n['id'] not in gone]
for n in w['nodes']:
    for i in n.get('inputs', []):
        if i.get('link') in {l[0] for l in dead}: i['link'] = None
prompts = 0
for sg in w.get('definitions', {}).get('subgraphs', []):
    for n in sg['nodes']:
        if n['type'] == 'TextEncodeQwenImageEditPlus' and isinstance(n.get('widgets_values', [None])[0], str):
            # The template's positive prompt has text; its negative is empty.
            if n['widgets_values'][0].strip(): n['widgets_values'][0] = T_POSE if a.tpose else A_POSE; prompts += 1
            else: n['widgets_values'][0] = NEGATIVE
for n in w['nodes']:
    if n['type'] == 'SaveImage': n['widgets_values'] = ['remnant/posed']
assert prompts == 1, f'expected one edit prompt in the template, found {prompts}'
json.dump(w, open(os.path.join(here, '01-pose.json'), 'w'), indent=1)

# ---- 02: mesh
m = template(MESH)
switches = [n for n in m['nodes'] if n['type'] == 'PrimitiveBoolean' and 'Trellis2' in (n.get('title') or '')]
assert len(switches) == 1, 'the template has changed: no "Switch to Trellis2" boolean'
switches[0]['widgets_values'] = [True]
for n in m['nodes']:
    if n['type'] == 'LoadImage': n['widgets_values'][0] = 'posed.png'
json.dump(m, open(os.path.join(here, '02-mesh.json'), 'w'), indent=1)
print(f'01-pose.json ({"T" if a.tpose else "A"} pose, one input image), 02-mesh.json (TRELLIS.2 on)')
