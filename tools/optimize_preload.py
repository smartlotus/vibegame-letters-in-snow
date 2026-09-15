"""Optimize preload payload:
1. Convert assets/bg/*.png (1280x720 RGB) to quality-90 progressive JPEG (~10x smaller).
2. Split assets/manifest.json: move `prop-*` keys into assets/manifest-props.json
   (not listed in project.json.manifests, so never preloaded).
3. Rewrite manifest.json paths for converted backgrounds.

Run:  python tools/optimize_preload.py
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets")
MANIFEST = os.path.join(ASSETS, "manifest.json")
PROPS_MANIFEST = os.path.join(ASSETS, "manifest-props.json")

from PIL import Image


def convert_bgs():
    bgdir = os.path.join(ASSETS, "bg")
    converted, skipped, total_before, total_after = [], [], 0, 0
    for name in sorted(os.listdir(bgdir)):
        if not name.lower().endswith(".png"):
            continue
        src = os.path.join(bgdir, name)
        dst = os.path.join(bgdir, name[:-4] + ".jpg")
        before = os.path.getsize(src)
        total_before += before
        im = Image.open(src)
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (5, 7, 12))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert("RGB")
        im.save(dst, "JPEG", quality=90, optimize=True, progressive=True)
        after = os.path.getsize(dst)
        total_after += after
        ratio = after / before if before else 0
        if ratio < 0.9:
            converted.append((name, before, after))
            os.remove(src)
        else:
            skipped.append((name, before, after))
            os.remove(dst)
    return converted, skipped, total_before, total_after


def split_manifest():
    with open(MANIFEST, encoding="utf-8") as f:
        entries = json.load(f)

    props = {}
    main = {}
    for key, entry in entries.items():
        if key.startswith("prop-"):
            props[key] = entry
        else:
            main[key] = entry

    # rewrite bg paths png -> jpg
    for key, entry in main.items():
        p = entry.get("path", "")
        if p.startswith("bg/") and p.endswith(".png"):
            entry["path"] = p[:-4] + ".jpg"

    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(main, f, ensure_ascii=False, indent=2)
    with open(PROPS_MANIFEST, "w", encoding="utf-8") as f:
        json.dump(props, f, ensure_ascii=False, indent=2)

    return len(main), len(props)


def main():
    report = []
    conv, skip, tb, ta = convert_bgs()
    report.append(f"bg PNG->JPG: converted {len(conv)}, skipped {len(skip)}")
    report.append(f"  bytes before {tb} ({tb/1048576:.2f} MB) -> after {ta} ({ta/1048576:.2f} MB)")
    n_main, n_props = split_manifest()
    report.append(f"manifest.json keys: {n_main}")
    report.append(f"manifest-props.json keys: {n_props}")

    # verify: every main manifest path exists
    with open(MANIFEST, encoding="utf-8") as f:
        main = json.load(f)
    missing = []
    for key, entry in main.items():
        p = entry.get("path")
        if not p:
            missing.append((key, "<no path>"))
            continue
        if not os.path.exists(os.path.join(ASSETS, p)):
            missing.append((key, p))
    report.append(f"missing files: {len(missing)}")
    for key, p in missing[:20]:
        report.append(f"  MISSING {key} -> {p}")

    out = "\n".join(report)
    with open(os.path.join(ROOT, "tools", "optimize_report.txt"), "w", encoding="utf-8") as f:
        f.write(out + "\n")


if __name__ == "__main__":
    main()
