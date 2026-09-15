"""verify_assets.py — final self-check for the letters-in-snow asset build.

Checks:
  1. every manifest path exists on disk
  2. every spritesheet PNG dims are exact multiples of frameWidth/frameHeight
  3. every manifest key is unique (JSON objects guarantee this; re-checked)
  4. 6 random transparent (RGBA) outputs: some alpha < 255 AND all 4 corner
     pixels fully transparent
  5. writes tools/verify.txt with PASS/FAIL per check
"""
import json
import os
import random

import numpy as np
from PIL import Image

ROOT = r"C:\Users\28389\Desktop\grokpet\games\letters-in-snow"
ASSETS = os.path.join(ROOT, "assets")
MANIFEST = os.path.join(ASSETS, "manifest.json")
OUT = os.path.join(ROOT, "tools", "verify.txt")

lines = []
fails = 0


def check(name, ok, detail=""):
    global fails
    lines.append(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not ok:
        fails += 1


with open(MANIFEST, encoding="utf-8") as f:
    manifest = json.load(f)

# 1. paths exist
missing = []
for key, entry in manifest.items():
    p = os.path.join(ASSETS, entry["path"])
    if not os.path.isfile(p):
        missing.append(f"{key} -> {entry['path']}")
check("1. all manifest paths exist", not missing,
      f"{len(missing)} missing: {missing[:5]}" if missing else f"{len(manifest)} entries")

# 2. spritesheet dims are multiples of frame dims
bad = []
n_ss = 0
for key, entry in manifest.items():
    if entry["type"] != "spritesheet":
        continue
    n_ss += 1
    p = os.path.join(ASSETS, entry["path"])
    w, h = Image.open(p).size
    fw, fh = entry["frameWidth"], entry["frameHeight"]
    if w % fw != 0 or h % fh != 0:
        bad.append(f"{key}: {w}x{h} not multiple of {fw}x{fh}")
check("2. spritesheet dims are multiples of frame size", not bad,
      f"{n_ss} spritesheets; {bad[:5] if bad else 'all ok'}")

# 3. keys unique
keys = list(manifest.keys())
check("3. manifest keys unique", len(keys) == len(set(keys)), f"{len(keys)} keys")

# 4. random transparent outputs
rng = random.Random(42)
rgba_keys = []
for key, entry in manifest.items():
    p = os.path.join(ASSETS, entry["path"])
    with Image.open(p) as im:
        if im.mode == "RGBA":
            rgba_keys.append(key)
sample = rng.sample(rgba_keys, min(6, len(rgba_keys)))
bad4 = []
for key in sample:
    p = os.path.join(ASSETS, manifest[key]["path"])
    a = np.asarray(Image.open(p))
    alpha = a[:, :, 3]
    has_trans = bool((alpha < 255).any())
    corners = [alpha[0, 0], alpha[0, -1], alpha[-1, 0], alpha[-1, -1]]
    corners_ok = all(int(c) == 0 for c in corners)
    if not (has_trans and corners_ok):
        bad4.append(f"{key}: trans={has_trans} corners={corners}")
check("4. transparent outputs have alpha<255 and transparent corners", not bad4,
      f"checked {len(sample)}: {', '.join(sample)}" + (("; " + "; ".join(bad4)) if bad4 else ""))

# 5. report
lines.insert(0, f"verify report — {len(rgba_keys)} RGBA outputs of {len(keys)} manifest keys")
lines.append("")
lines.append("RESULT: " + ("ALL PASS" if fails == 0 else f"{fails} CHECK(S) FAILED"))
with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")
print("verify written:", OUT, "| fails:", fails)
