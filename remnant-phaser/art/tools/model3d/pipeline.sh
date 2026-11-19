#!/usr/bin/env bash
# The Blender half of the pipeline in one go: a generated mesh (TRELLIS.2's GLB) to the game's sprite atlas.
#   ./pipeline.sh model.glb name [work_dir]      -> work_dir/name.png, name.json, name.preview.png
# Options go through the environment: YAW (degrees, if the figure does not face front), FACES (retopology target,
# default 9000), HEIGHT_PX (the figure's height in the 192 px cell, default 84), CLIPS (comma list; all by default),
# COLORS (palette size, default 20), BLENDER (the executable; ./setup-blender.sh fetches one).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
IN=$1; NAME=$2; WORK=${3:-$HERE/out/$NAME}
BLENDER=${BLENDER:-$("$HERE/setup-blender.sh")}
mkdir -p "$WORK"
run() { "$BLENDER" -b "$@" 2>&1 | grep -E '^(prepare|rig|bake):|Error|Traceback' || true; }
run -P "$HERE/prepare.py" -- "$IN" "$WORK/body.blend" --yaw "${YAW:-0}" --faces "${FACES:-9000}"
[ -f "$WORK/body.blend" ] || { echo "pipeline: prepare failed" >&2; exit 1; }
run "$WORK/body.blend" -P "$HERE/rig.py" -- "$WORK/rigged.blend"
[ -f "$WORK/rigged.blend" ] || { echo "pipeline: rig failed" >&2; exit 1; }
rm -rf "$WORK/frames"
run "$WORK/rigged.blend" -P "$HERE/bake.py" -- "$WORK/frames" --height-px "${HEIGHT_PX:-84}" ${CLIPS:+--clips "$CLIPS"}
python3 "$HERE/pack.py" "$WORK/frames" "$WORK/$NAME" --colors "${COLORS:-20}"
