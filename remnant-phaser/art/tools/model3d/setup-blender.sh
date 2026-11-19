#!/usr/bin/env bash
# Portable Blender 4.5 LTS for this pipeline (Linux x64), unpacked into $BLENDER_HOME (default ~/tools). On Windows or a
# Mac, download the same version's portable zip/dmg from download.blender.org and point $BLENDER at its executable.
set -euo pipefail
VER=4.5.16
DEST=${BLENDER_HOME:-$HOME/tools}
DIR=$DEST/blender-$VER-linux-x64
if [ -x "$DIR/blender" ]; then echo "$DIR/blender"; exit 0; fi
mkdir -p "$DEST"
curl -fsSL "https://download.blender.org/release/Blender${VER%.*}/blender-$VER-linux-x64.tar.xz" | tar -xJ -C "$DEST"
"$DIR/blender" --version | head -1 >&2
echo "$DIR/blender"
