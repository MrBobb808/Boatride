#!/usr/bin/env python3
"""Check delivered art before it is used (ART_DIRECTION.md, "How a piece is approved").

Reads manifest.json and checks each entry's file with the create-game-assets skill's asset_report.py (beside this
script), plus the rules this game's reviews kept finding:

- it reads, and it is under 4 MB;
- its background matches the entry (transparent: real transparency; opaque: none);
- on a sheet, nothing solid sits along the inner cell edges (a figure crossing its cell, or grid lines drawn in).

It also prints how much of a transparent image is empty, for the eye: a glow or matte is judged on the contact sheet
(an effect's soft glow is wanted; V09-b's haze was not, and no alpha measure told them apart).

    python3 tools/review.py                  # the entries still `delivered`
    python3 tools/review.py C01 V08          # these ids, whatever their status
    python3 tools/review.py --all --json
    python3 tools/review.py --sheet /tmp/review.png   # also a labelled contact sheet of them (build_preview_sheet.py)

Exits 1 when any checked file fails. Needs Pillow (requirements.txt). It only reads: Claude records the outcome in the
entry's `validation` and `approval` (README.md).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ART = HERE.parent
sys.dont_write_bytecode = True  # no __pycache__ beside the art
sys.path.insert(0, str(HERE))
from asset_report import inspect  # noqa: E402  (the skill's own report, kept verbatim beside this script)

MAX_BYTES = 4 * 1024 * 1024
# Share of an inner cell edge that may be solid (alpha above 16). V03 shipped at 0.19 (soft glow over the edge);
# C05's wings (0.58) and V08's drawn grid lines (0.96) were rejected.
EDGE_WARN, EDGE_FAIL = 0.05, 0.25


def edge_share(image: Image.Image, grid: list[int]) -> float:
    """The most solid inner cell edge, as a share of its length."""
    cols, rows = grid
    alpha = image.convert("RGBA").getchannel("A")
    w, h = image.size
    worst = 0.0
    for i in range(1, cols):
        x = round(i * w / cols)
        worst = max(worst, sum(1 for y in range(h) if alpha.getpixel((min(x, w - 1), y)) > 16) / h)
    for j in range(1, rows):
        y = round(j * h / rows)
        worst = max(worst, sum(1 for x in range(w) if alpha.getpixel((x, min(y, h - 1))) > 16) / w)
    return worst


def check(entry: dict) -> dict:
    path = ART / entry["file"]
    out: dict = {"id": entry["id"], "file": entry["file"], "status": entry.get("status"), "problems": [], "warnings": []}
    if not path.is_file():
        out["problems"].append("file does not exist")
        return out
    try:
        report = inspect(path, None)
    except (OSError, ValueError) as exc:
        out["problems"].append(f"cannot read image: {exc}")
        return out
    out["size"] = [report["width"], report["height"]]
    out["bytes"] = report["bytes"]
    if report["bytes"] > MAX_BYTES:
        out["problems"].append(f"{report['bytes'] // 1024} KB is over the 4 MB limit")
    background = str(entry.get("background", "transparent"))
    with Image.open(path) as image:
        image.load()
        if background.startswith("transparent"):
            if not report["has_alpha"] or report["alpha_min"] == 255:
                out["problems"].append("the background should be transparent, but no pixel is")
            else:
                out["empty"] = round(report["transparent_pixels"] / (report["width"] * report["height"]), 3)
        elif background.startswith("opaque") and report["has_alpha"] and report["alpha_min"] < 255:
            out["problems"].append("the background should be opaque, but some pixels are transparent")
        grid = entry.get("grid")
        if isinstance(grid, list) and len(grid) == 2 and grid != [1, 1]:
            out["edge"] = round(edge_share(image, grid), 3)
            if out["edge"] > EDGE_FAIL:
                out["problems"].append(f"{out['edge']:.0%} of an inner cell edge is solid (a figure crosses it, or lines are drawn)")
            elif out["edge"] > EDGE_WARN:
                out["warnings"].append(f"{out['edge']:.0%} of an inner cell edge is solid (glow over the edge?)")
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("ids", nargs="*", help="manifest ids to check (default: every entry still delivered)")
    parser.add_argument("--all", action="store_true", help="check every entry with a file")
    parser.add_argument("--json", action="store_true", dest="as_json")
    parser.add_argument("--sheet", type=Path, help="also write a labelled contact sheet of the checked files here")
    args = parser.parse_args()

    entries = [e for e in json.loads((ART / "manifest.json").read_text())["images"] if str(e.get("file", "")).endswith(".png")]
    if args.ids:
        entries = [e for e in entries if e["id"] in args.ids or Path(e["file"]).stem.split("-")[0] in args.ids]
    elif not args.all:
        entries = [e for e in entries if e.get("status") == "delivered"]
    results = [check(e) for e in entries]
    failed = any(r["problems"] for r in results)

    if args.as_json:
        print(json.dumps({"ok": not failed, "assets": results}, indent=2))
    else:
        for r in results:
            state = "FAIL" if r["problems"] else "WARN" if r["warnings"] else "PASS"
            size = "x".join(map(str, r.get("size", []))) or "-"
            print(f"{state} {r['id']:<6} {r['file']} {size} edge={r.get('edge', '-')} empty={r.get('empty', '-')} [{r['status']}]")
            for p in r["problems"]:
                print(f"  - {p}")
            for w in r["warnings"]:
                print(f"  ~ {w}")
        print(f"{len(results)} checked, {sum(1 for r in results if r['problems'])} failed")
    if args.sheet and results:
        files = [str(ART / r["file"]) for r in results if "size" in r]
        subprocess.run([sys.executable, str(HERE / "build_preview_sheet.py"), *files, "--out", str(args.sheet), "--columns", "4", "--cell-size", "320"], check=True)
        if not args.as_json:
            print(f"contact sheet: {args.sheet}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
