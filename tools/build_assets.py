"""
build_assets.py — asset pipeline for "letters-in-snow" (Phaser 3 visual novel).

Turns 69 AI-generated asset sheets in 流年/photos into an engine-ready library:

  assets/bg/      1280x720 RGB scene backgrounds
  assets/char/    busts (tight RGBA crops), repacked walk spritesheets, NPCs
  assets/fx/      horizontal-strip animation spritesheets
  assets/items/   item icons + prop tiles (transparent RGBA)
  assets/ui/      UI elements (transparent RGBA)
  assets/_ref/    character reference sheets (copied verbatim, not in manifest)
  assets/manifest.json
  tools/report.json, tools/debug-walk-<char>.png, tools/walk-contact-*.png

Chroma keying: saturation-based (per spec) + despill + 1px feather.
Usage:  python build_assets.py
"""
import json
import os
import shutil

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

SRC = r"C:\Users\28389\Desktop\grokpet\流年\photos"
ROOT = r"C:\Users\28389\Desktop\grokpet\games\letters-in-snow"
ASSETS = os.path.join(ROOT, "assets")
TOOLS = os.path.join(ROOT, "tools")

PAD = 2          # transparent padding added around every tight bbox crop
FEATHER = 1.0    # gaussian blur radius for alpha feathering
BG_SIZE = (1280, 720)

# ---------------------------------------------------------------- source maps

BUSTS = {
    "lute": ("exec-d6cff0b9-1653-4306-9157-d053132916d7.png", "green",
             ["calm", "open", "ponder", "shocked", "weary", "stern", "smile-closed", "gloom"]),
    "tess": ("exec-e73a6725-5955-477f-bffd-ee0192c1a16f.png", "green",
             ["neutral", "smile", "warm-smile", "pout", "earnest", "dejected", "calm", "resolute"]),
    "heroine": ("exec-918155d9-2465-4001-a67d-5fdd384bbb1e.png", "magenta",
                ["calm", "smile", "angry", "shocked", "weary", "serious", "sad", "worried"]),
}

WALKS = {
    "lute": ("exec-5c3d55a2-c072-4b89-b81e-41fa50f90dca.png", "green"),
    "tess": ("exec-026cf1e7-80cc-4603-90c4-7ccaad96e9ed.png", "green"),
    "heroine": ("exec-2b11f561-f556-4eea-9cc5-f8d849d278fc.png", "magenta"),
}
WALK_ROWS_DEFAULT = ["down", "left", "right", "up"]

NPC_SHEET = ("exec-78ba0816-eedf-4969-9a8c-3e9ca38b985b.png", "magenta")

FX_SHEETS = {
    "exec-12e84d99-cacc-40e0-9d15-0011694a6bc9.png": ("magenta", ["snow", "wind", "footprint", "cross-glow"]),
    "exec-51d9a39b-2656-4648-967d-69fab9bb90d9.png": ("green", ["ring", "wave", "glow", "ink"]),
    "exec-8123af78-b333-477d-8d5b-7ddafc8774cf.png": ("magenta", ["ripple", "splash", "sprout"]),
}

ITEM_SHEET = ("exec-d5931feb-5f77-4456-978a-8a18fb0a1547.png", "magenta",
              ["cross", "cross-snow", "glasses", "boots",
               "satchel", "book", "book-open", "pen",
               "letter-scraps", "envelope", "envelopes", "letters",
               "drawer-letter", "mirror", "lamp", "lamp-dark"])

# extra prop sheets discovered in photos/ but absent from the user's mapping
# table; processed as individual transparent props (connected components).
PROP_SHEETS = {
    "library": ("exec-0b74fb28-df02-4ae5-a160-1f8e47dcff87.png", "magenta"),
    "study": ("exec-2dd40d90-0f69-4fc6-9eba-8d4e0c47c19d.png", "magenta"),
    "dorm": ("exec-9e4d1b20-28af-4f11-a75b-1edde61bd781.png", "green"),
    "desk": ("exec-bf5e4a1a-5c6d-4639-a2d9-16ce531bf9b3.png", "green"),
    "campus": ("exec-c18c751a-f5d9-4ab4-a54a-62fdf0b6d18c.png", "magenta"),
    "school": ("exec-ca8c5824-b974-4fbd-b9ad-3b67c095ab21.png", "magenta"),
}

BACKGROUNDS = {
    "church-steps": "exec-b43b562d-7953-4f17-9375-9f8bf45d9bfe.png",
    "church-courtyard": "exec-ca646a96-2655-4e1f-bd85-5a76a261cbfa.png",
    "church-interior": "exec-ebbb050f-32c9-4459-be90-4e700f55e78d.png",
    "church-alley": "exec-0d09d40c-9518-4345-a500-f06abd157a02.png",
    "library-night": "exec-794823a3-3da8-4cac-b89a-9e691f7430b7.png",
    "library-iso": "exec-816ae174-cb1a-447f-a9d7-e7d4b798c9b3.png",
    "library-hall": "exec-a885910c-b66d-4e2e-9eeb-1a1d46fdb471.png",
    "classroom-empty": "exec-28b361a0-8c6d-4519-b32c-94564ca66b5d.png",
    "classroom-crowd": "exec-192da471-9fc6-479a-af13-3ebf4068d44d.png",
    "corridor": "exec-f33b9635-8d26-43d3-b021-c84c5855a7b2.png",
    "avenue-dusk": "exec-54c21673-8d72-4e6b-948f-b09e381f1b79.png",
    "avenue-night": "exec-f100c508-f19c-4d45-a4c8-dadff59f335e.png",
    "crossroad-dusk": "exec-8d12dcef-fadd-48e5-a2d4-07cf0f6e828f.png",
    "crossroad-autumn": "exec-6c6058da-2a85-4cc7-a2be-fb616905df7e.png",
    "park-stream": "exec-be391d20-7bbc-4217-b02a-fb4dfa47905b.png",
    "park-night": "exec-9ddb6b6f-ea4a-441b-8510-fc4f6d067037.png",
    "lamppost-talk": "exec-ae26bc04-8bf4-4f76-8699-f2be2ae04329.png",
    "canal-path": "exec-80cbd6ac-164f-413a-b87f-7c66d3e2398f.png",
    "heroine-study": "exec-e522b141-daf0-4147-9c4d-2391c2497e52.png",
    "heroine-room": "exec-1b6ad3e0-6a00-48f8-9721-e205106eadad.png",
    "dorm-night": "exec-0f28e2af-1a1e-469a-9471-9811397bddd7.png",
    "dorm-study": "exec-38c99017-58b8-412c-b909-22ee1d1f4b0d.png",
    "dorm-night-alt": "exec-a71b0fb7-8a4c-4fb8-9157-05c3dcc43fb3.png",
    "dorm-night-2": "exec-aa1e93a9-c33c-4f66-a4a7-83641203b91d.png",
    "foyer": "exec-8d7e9eee-eb8f-4b1b-909d-c3d6cde3b0a9.png",
    "foyer-alt": "exec-802b4f62-f7c6-44e8-89e8-80fa86be9abb.png",
    "cabin-fire": "exec-3a2ca748-0c94-4893-a31e-5cdaba8965b0.png",
    "cabin-fire-alt": "exec-4e9f1272-b7c2-49f1-872f-a1c2cfa3cb99.png",
    "hillside-home": "exec-d548eecd-3129-4fa2-9063-45f75cfaf9b9.png",
    "village-return": "exec-a4aa118f-91f7-4415-a023-fcb6260a2da7.png",
    "storyboard-12": "exec-5432481e-2469-4de8-b51d-58ee2e0fd2a0.png",
    "crossroad-autumn-alt": "exec-82308335-dd17-44f5-a2bf-ddb3100bf8e8.png",
}

REF_SHEETS = [
    "exec-006ec7c1-983b-497b-b2e4-979bf0b51655.png",
    "exec-606e1e6e-176d-4877-8a90-c094bbb9d9cb.png",
    "exec-8f56cce6-3146-4ce1-a8f9-79cde12448f7.png",
    "exec-c52a8a37-0683-499d-bdbb-e5e88b5a61bc.png",
    "exec-d537bbbb-fd9e-496e-a4d2-192dd4ecaaec.png",
    "exec-9af703c3-9b5b-48a8-ae39-86d0560396d6.png",
    "exec-c913a01d-44ab-43ff-bbd6-1acd79b5f948.png",
    "exec-9b8fee3e-2457-43a0-8099-fed97e0f6d16.png",
    "exec-cef836e4-56a3-4e81-b7b0-3fd17188606b.png",
    "exec-1f0184d2-d0f4-4626-bc77-de470e11b30b.png",
    "exec-bcccdb07-22de-4f2e-abcc-7f6b66f3b47a.png",
    "exec-c71e4cda-7847-460a-859d-8ae7ed050a40.png",
    "exec-d1acd4e1-9bbb-46a7-a48f-aee5d2793e19.png",
    "exec-0c409797-ae3b-44b3-a7cf-f70df606808e.png",
    "exec-babb0a4f-482d-43ff-a32f-2c637f56f846.png",
    "exec-225d47d7-2028-4710-81de-78baa20141cc.png",
    "exec-7023c2e0-7f8e-4cd8-857e-5a2114e3f73b.png",
    "exec-cbbc7318-6a86-4c64-bf85-018d91f36441.png",
]

# UI element name -> fractional centroid anchors (measured from component
# analysis of these exact two sheets; nearest component wins).
UI_SHEETS = {
    "ui1": ("exec-47d1486a-4ef0-4fc2-a885-5f55b627a34f.png", "green", {
        "panel-lg": (0.500, 0.224),
        "row-idle": (0.260, 0.476),
        "row-hi": (0.259, 0.564),
        "btn-brown-hi": (0.259, 0.626),
        "btn-brown": (0.259, 0.689),
        "panel-md": (0.747, 0.527),
        "bar-diamonds": (0.746, 0.660),
        "divider": (0.746, 0.710),
        "panel-square": (0.145, 0.847),
        "frame-dashed": (0.388, 0.845),
        "arrow-0": (0.570, 0.794),
        "arrow-1": (0.674, 0.794),
        "arrow-2": (0.776, 0.794),
        "arrow-3": (0.873, 0.796),
        "tab": (0.737, 0.894),
    }),
    "ui2": ("exec-d345f585-e890-4c50-8468-c45fe2b80c92.png", "green", {
        "card-dark": (0.241, 0.227),
        "panel-tall-tabs": (0.607, 0.227),
        "note-clip": (0.859, 0.101),
        "btn-sm-0": (0.798, 0.233),
        "btn-sm-1": (0.917, 0.233),
        "btn-sm-2": (0.799, 0.304),
        "btn-sm-3": (0.917, 0.304),
        "progress": (0.858, 0.380),
        "panel-wide": (0.222, 0.563),
        "card-v0": (0.524, 0.543),
        "card-v1": (0.656, 0.543),
        "card-v2": (0.790, 0.543),
        "card-v3": (0.924, 0.543),
        "dropdown": (0.221, 0.707),
        "dropdown-2": (0.139, 0.803),
        "checkbox": (0.325, 0.775),
        "checkbox-2": (0.325, 0.825),
        "checkbox-on": (0.387, 0.775),
        "checkbox-on-green": (0.387, 0.825),
        "panel-xl": (0.720, 0.748),
        "icon-alert": (0.079, 0.924),
        "icon-snow": (0.217, 0.924),
        "icon-sound": (0.352, 0.924),
        "icon-screen": (0.487, 0.924),
        "icon-wheel": (0.626, 0.924),
        "icon-save": (0.761, 0.920),
        "icon-hazard": (0.913, 0.926),
    }),
}

# ---------------------------------------------------------------- helpers

def chroma_alpha(rgb, bg):
    """Saturation-based chroma key -> uint8 alpha (0/255), per spec.
    Extra guard for magenta sheets (g<100) to protect legit pink sprite
    pixels from being keyed out."""
    r = rgb[:, :, 0].astype(np.float32)
    g = rgb[:, :, 1].astype(np.float32)
    b = rgb[:, :, 2].astype(np.float32)
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = mx - mn
    if bg == "green":
        keyed = (g >= r) & (g >= b) & (sat > 60) & (mx > 90)
    else:  # magenta
        keyed = (np.minimum(r, b) >= g) & (g < 100) & (sat > 60) & (mx > 90)
    return np.where(keyed, 0, 255).astype(np.uint8)


def key_sheet(path, bg):
    """Load sheet -> RGBA with keyed, feathered, de-fringed alpha.

    Pipeline:
      1. saturation chroma key (per spec) + a high-threshold 'contaminated'
         kill for opaque rim pixels the key can't catch (heavily bg-tinted
         anti-aliasing ring);
      2. 1px feather;
      3. un-premultiply: edge pixels are blends of sprite colour and the flat
         chroma bg, and the bg colour is known exactly, so recover
         true = (observed - (1-a)*bg) / a on semi-transparent pixels;
      4. zero RGB of fully transparent pixels (prevents scaler bleed);
      5. residual despill clamp on still chroma-dominant pixels only.
    """
    im = Image.open(path).convert("RGB")
    rgb = np.asarray(im).astype(np.float32)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    mx = np.maximum(np.maximum(r, g), b)
    keyed0 = chroma_alpha(rgb, bg) == 0
    if keyed0.sum() < 100:
        raise ValueError(f"chroma key found almost nothing in {path}")
    if bg == "magenta":
        contaminated = (np.minimum(r, b) - g > 100) & (mx > 90)
    else:
        contaminated = (g - np.maximum(r, b) > 100) & (mx > 90)
    kill = keyed0 | contaminated
    # Feather in PREMULTIPLIED space: blurring raw alpha over unassociated
    # RGB gives partial alpha to pure-bg pixels whose RGB is still chroma,
    # which any compositor then renders as a bright halo. Blurring rgb*cov
    # and cov together and un-premultiplying is the correct matte feather.
    cov = (~kill).astype(np.float32)
    pm = rgb * cov[:, :, None]
    pm_b = np.dstack([ndimage.gaussian_filter(pm[:, :, c], FEATHER) for c in range(3)])
    a01 = np.clip(ndimage.gaussian_filter(cov, FEATHER), 0.0, 1.0)
    alpha = (a01 * 255.0).astype(np.uint8)
    m = a01 > 0.004
    for c in range(3):
        rgb[:, :, c] = np.where(m, np.clip(pm_b[:, :, c] / np.maximum(a01, 0.004), 0, 255), 0.0)
    # residual despill: only pixels still strongly chroma-dominant
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    if bg == "magenta":
        res = (np.minimum(r, b) > g + 80) & (alpha > 0)
        rgb[:, :, 0] = np.where(res, np.minimum(r, (g + b) * 0.5), r)
        rgb[:, :, 2] = np.where(res, np.minimum(b, (r + g) * 0.5), b)
    else:
        res = (g > np.maximum(r, b) + 80) & (alpha > 0)
        rgb[:, :, 1] = np.where(res, np.minimum(g, (r + b) * 0.5), g)
    rgba = np.dstack([rgb, alpha]).astype(np.float32)
    return rgba.astype(np.uint8), im


def tight_bbox(alpha, x0, y0, x1, y1, pad=PAD):
    """Tight content bbox inside cell (x0,y0,x1,y1), expanded by pad."""
    sub = alpha[y0:y1, x0:x1]
    ys, xs = np.where(sub > 8)
    if len(xs) == 0:
        return None
    bx0 = max(0, x0 + int(xs.min()) - pad)
    by0 = max(0, y0 + int(ys.min()) - pad)
    bx1 = min(alpha.shape[1], x0 + int(xs.max()) + 1 + pad)
    by1 = min(alpha.shape[0], y0 + int(ys.max()) + 1 + pad)
    return bx0, by0, bx1, by1


def find_bands(occupied, min_gap=8, min_size=20):
    """Contiguous True-runs in a 1-D boolean occupancy array."""
    idx = np.where(occupied)[0]
    if len(idx) == 0:
        return []
    runs = []
    s = p = int(idx[0])
    for i in idx[1:]:
        i = int(i)
        if i - p <= min_gap:
            p = i
        else:
            runs.append((s, p + 1))
            s = p = i
    runs.append((s, p + 1))
    return [(a, b) for a, b in runs if b - a >= min_size]


def merge_bands(bands, target):
    """Merge adjacent bands (smallest gap first) until len == target."""
    bands = list(bands)
    while len(bands) > target:
        gaps = [(bands[i + 1][0] - bands[i][1], i) for i in range(len(bands) - 1)]
        _, i = min(gaps)
        bands[i] = (bands[i][0], bands[i + 1][1])
        del bands[i + 1]
    return bands


def grid_cells(alpha, rows_expected, cols_expected):
    """Locate grid cells via occupancy projections. Returns list of
    (row_idx, col_idx, bbox) and falls back to an even split if detection
    disagrees with the expected grid."""
    H, W = alpha.shape
    rb = find_bands(alpha.max(axis=1) > 8)
    cb = find_bands(alpha.max(axis=0) > 8)
    fallback = False
    if len(rb) != rows_expected or len(cb) != cols_expected:
        fallback = True
        rb = [(round(i * H / rows_expected), round((i + 1) * H / rows_expected))
              for i in range(rows_expected)]
        cb = [(round(j * W / cols_expected), round((j + 1) * W / cols_expected))
              for j in range(cols_expected)]
    cells = []
    for i, (y0, y1) in enumerate(rb):
        for j, (x0, x1) in enumerate(cb):
            bb = tight_bbox(alpha, x0, y0, x1, y1)
            cells.append((i, j, bb))
    return cells, rb, cb, fallback


def save_rgba(arr, path):
    Image.fromarray(arr, "RGBA").save(path)


# ---------------------------------------------------------------- steps

def do_busts(manifest, report):
    for char, (fn, bg, moods) in BUSTS.items():
        rgba, _ = key_sheet(os.path.join(SRC, fn), bg)
        cells, rb, cb, fb = grid_cells(rgba[:, :, 3], 2, 4)
        if fb:
            report["warnings"].append(f"bust {char}: grid fallback used")
        n = 0
        for i, j, bb in cells:
            if bb is None:
                continue
            if n >= len(moods):
                break
            mood = moods[n]
            x0, y0, x1, y1 = bb
            crop = rgba[y0:y1, x0:x1]
            key = f"bust-{char}-{mood}"
            p = os.path.join(ASSETS, "char", f"{key}.png")
            save_rgba(crop, p)
            manifest[key] = {"type": "image", "path": f"char/{key}.png", "pivot": [0.5, 1]}
            n += 1
        report["busts"][char] = n


def do_walks(manifest, report):
    layouts = {}
    for char, (fn, bg) in WALKS.items():
        rgba, rgb_im = key_sheet(os.path.join(SRC, fn), bg)
        alpha = rgba[:, :, 3]
        cells, rb, cb, fb = grid_cells(alpha, 4, 4)
        if fb:
            report["warnings"].append(f"walk {char}: grid fallback used")

        # debug contact sheet with indices + bbox outlines
        dbg = rgb_im.copy()
        dr = ImageDraw.Draw(dbg)
        for (y0, y1) in rb:
            dr.line([(0, y0), (dbg.width, y0)], fill=(0, 0, 255), width=3)
        dr.line([(0, dbg.height - 1), (dbg.width, dbg.height - 1)], fill=(0, 0, 255), width=3)
        for (x0, x1) in cb:
            dr.line([(x0, 0), (x0, dbg.height)], fill=(0, 0, 255), width=3)
        for i, j, bb in cells:
            if bb:
                dr.rectangle([bb[0], bb[1], bb[2] - 1, bb[3] - 1], outline=(255, 0, 0), width=3)
            dr.text((cb[j][0] + 8, rb[i][0] + 8), f"r{i}c{j}", fill=(255, 255, 0))
        dbg.save(os.path.join(TOOLS, f"debug-walk-{char}.png"))

        # collect frames
        frames = []
        for i, j, bb in cells:
            if bb is None:
                report["warnings"].append(f"walk {char}: empty cell r{i}c{j}")
                continue
            x0, y0, x1, y1 = bb
            frames.append((i, j, rgba[y0:y1, x0:x1]))
        fw = max(f[2].shape[1] for f in frames)
        fh = max(f[2].shape[0] for f in frames)
        canvas = np.zeros((4 * fh, 4 * fw, 4), dtype=np.uint8)
        for i, j, fr in frames:
            h, w = fr.shape[:2]
            px = j * fw + (fw - w) // 2
            py = (i + 1) * fh - h
            canvas[py:py + h, px:px + w] = fr
        key = f"walk-{char}"
        save_rgba(canvas, os.path.join(ASSETS, "char", f"{key}.png"))
        manifest[key] = {"type": "spritesheet", "path": f"char/{key}.png",
                         "frameWidth": fw, "frameHeight": fh, "pivot": [0.5, 1]}
        layouts[key] = {"rows": WALK_ROWS_DEFAULT, "columns": 4,
                        "frameWidth": fw, "frameHeight": fh,
                        "frameCount": len(frames), "mirror": {}}
    with open(os.path.join(ASSETS, "char", "walk-layout.json"), "w") as f:
        json.dump(layouts, f, indent=2, ensure_ascii=False)
    report["walk_layouts"] = layouts


def do_npcs(manifest, report):
    fn, bg = NPC_SHEET
    rgba, _ = key_sheet(os.path.join(SRC, fn), bg)
    cells, rb, cb, fb = grid_cells(rgba[:, :, 3], 4, 4)
    if fb:
        report["warnings"].append("npc: grid fallback used")
    n = 0
    for i, j, bb in cells:
        if bb is None:
            report["warnings"].append(f"npc: empty cell r{i}c{j}")
            continue
        x0, y0, x1, y1 = bb
        key = f"npc-{n:02d}"
        save_rgba(rgba[y0:y1, x0:x1], os.path.join(ASSETS, "char", f"{key}.png"))
        manifest[key] = {"type": "image", "path": f"char/{key}.png", "pivot": [0.5, 1]}
        n += 1
    report["npcs"] = n


def do_fx(manifest, report):
    for fn, (bg, row_names) in FX_SHEETS.items():
        rgba, _ = key_sheet(os.path.join(SRC, fn), bg)
        alpha = rgba[:, :, 3]
        H, W = alpha.shape
        rb = find_bands(alpha.max(axis=1) > 8)
        if len(rb) > len(row_names):
            rb = merge_bands(rb, len(row_names))
        if len(rb) != len(row_names):
            report["warnings"].append(
                f"fx {fn}: found {len(rb)} rows, expected {len(row_names)}")
        for ri, (y0, y1) in enumerate(rb):
            if ri >= len(row_names):
                break
            name = row_names[ri]
            row = alpha[y0:y1]
            cbs = find_bands(row.max(axis=0) > 8)
            if len(cbs) > 8:
                cbs = merge_bands(cbs, 8)
            frames = []
            for (x0, x1) in cbs:
                bb = tight_bbox(alpha, x0, y0, x1, y1)
                if bb:
                    frames.append(rgba[bb[1]:bb[3], bb[0]:bb[2]])
            if not frames:
                report["warnings"].append(f"fx {name}: empty row {ri}")
                continue
            fw = max(f.shape[1] for f in frames) + 2 * PAD
            fh = max(f.shape[0] for f in frames) + 2 * PAD
            strip = np.zeros((fh, len(frames) * fw, 4), dtype=np.uint8)
            for k, fr in enumerate(frames):
                h, w = fr.shape[:2]
                px = k * fw + (fw - w) // 2
                py = (fh - h) // 2
                strip[py:py + h, px:px + w] = fr
            key = f"fx-{name}"
            save_rgba(strip, os.path.join(ASSETS, "fx", f"{name}.png"))
            manifest[key] = {"type": "spritesheet", "path": f"fx/{name}.png",
                             "frameWidth": fw, "frameHeight": fh, "pivot": [0.5, 0.5]}
            report["fx"][name] = {"frameWidth": fw, "frameHeight": fh,
                                  "frameCount": len(frames), "source": fn, "row": ri}


def do_items(manifest, report):
    fn, bg, names = ITEM_SHEET
    rgba, _ = key_sheet(os.path.join(SRC, fn), bg)
    cells, rb, cb, fb = grid_cells(rgba[:, :, 3], 4, 4)
    if fb:
        report["warnings"].append("items: grid fallback used")
    n = 0
    for i, j, bb in cells:
        if bb is None:
            report["warnings"].append(f"items: empty cell r{i}c{j}")
            continue
        if n >= len(names):
            break
        name = names[n]
        x0, y0, x1, y1 = bb
        key = f"item-{name}"
        save_rgba(rgba[y0:y1, x0:x1], os.path.join(ASSETS, "items", f"{name}.png"))
        manifest[key] = {"type": "image", "path": f"items/{name}.png"}
        n += 1
    report["items"] = n


def do_props(manifest, report):
    total = 0
    for alias, (fn, bg) in PROP_SHEETS.items():
        rgba, _ = key_sheet(os.path.join(SRC, fn), bg)
        m = rgba[:, :, 3] > 8
        st = ndimage.generate_binary_structure(2, 2)
        md = ndimage.binary_dilation(m, structure=st, iterations=6)
        lab, _ = ndimage.label(md, structure=st)
        objs = ndimage.find_objects(lab)
        comps = []
        for li, sl in enumerate(objs, start=1):
            if sl is None:
                continue
            cmask = (lab[sl] == li) & m[sl]
            area = int(cmask.sum())
            if area < 200:
                continue
            h = sl[0].stop - sl[0].start
            w = sl[1].stop - sl[1].start
            if w < 14 or h < 14:
                continue
            comps.append((sl[0].start, sl[1].start, sl[0].stop, sl[1].stop))
        # reading order
        comps.sort(key=lambda c: (c[0], c[1]))
        bands = []
        for c in comps:
            cy = (c[0] + c[2]) / 2
            for band in bands:
                if abs(cy - band[0]) < 40:
                    band[1].append(c)
                    break
            else:
                bands.append([cy, [c]])
        ordered = []
        for band in sorted(bands, key=lambda b: b[0]):
            ordered.extend(sorted(band[1], key=lambda c: c[1]))
        for k, (y0, x0, y1, x1) in enumerate(ordered):
            bb = tight_bbox(rgba[:, :, 3], max(0, x0 - 4), max(0, y0 - 4),
                            min(rgba.shape[1], x1 + 4), min(rgba.shape[0], y1 + 4), pad=0)
            if bb is None:
                continue
            bx0, by0, bx1, by1 = bb
            name = f"prop-{alias}-{k:02d}"
            save_rgba(rgba[by0:by1, bx0:bx1], os.path.join(ASSETS, "items", f"{name}.png"))
            manifest[name] = {"type": "image", "path": f"items/{name}.png"}
            total += 1
        report["props"][alias] = len(ordered)
    report["props_total"] = total


def do_ui(manifest, report):
    for sheet, (fn, bg, anchors) in UI_SHEETS.items():
        rgba, _ = key_sheet(os.path.join(SRC, fn), bg)
        m = rgba[:, :, 3] > 8
        lab, _ = ndimage.label(m, structure=np.ones((3, 3), bool))
        n = lab.max()
        cents = ndimage.center_of_mass(m, lab, range(1, n + 1))
        comps = []
        for i, (cy, cx) in enumerate(cents, start=1):
            ys, xs = np.where(lab == i)
            area = len(xs)
            if area < 80:
                continue
            comps.append({"cx": cx, "cy": cy,
                          "bbox": (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)})
        H, W = m.shape
        used = set()
        for name, (fx_, fy_) in anchors.items():
            tx, ty = fx_ * W, fy_ * H
            best, bd = None, 1e18
            for idx, c in enumerate(comps):
                d = (c["cx"] - tx) ** 2 + (c["cy"] - ty) ** 2
                if d < bd:
                    bd, best = d, idx
            if best is None or bd > (60 * 60) ** 2:
                report["warnings"].append(f"ui {sheet}: no component for {name}")
                continue
            used.add(best)
            bx0, by0, bx1, by1 = comps[best]["bbox"]
            bb = tight_bbox(rgba[:, :, 3], bx0, by0, bx1, by1)
            if bb is None:
                continue
            bx0, by0, bx1, by1 = bb
            key = f"ui-{name}"
            save_rgba(rgba[by0:by1, bx0:bx1], os.path.join(ASSETS, "ui", f"{name}.png"))
            manifest[key] = {"type": "image", "path": f"ui/{name}.png"}
        report["ui"][sheet] = len(used)


def do_bgs(manifest, report):
    tw, th = BG_SIZE
    for name, fn in BACKGROUNDS.items():
        im = Image.open(os.path.join(SRC, fn)).convert("RGB")
        w, h = im.size
        scale = max(tw / w, th / h)
        nw, nh = round(w * scale), round(h * scale)
        im2 = im.resize((nw, nh), Image.LANCZOS)
        left = (nw - tw) // 2
        top = (nh - th) // 2
        im2 = im2.crop((left, top, left + tw, top + th))
        key = f"bg-{name}"
        im2.save(os.path.join(ASSETS, "bg", f"{name}.png"))
        manifest[key] = {"type": "image", "path": f"bg/{name}.png"}
    report["backgrounds"] = len(BACKGROUNDS)


def do_refs(report):
    for fn in REF_SHEETS:
        shutil.copyfile(os.path.join(SRC, fn), os.path.join(ASSETS, "_ref", fn))
    report["refs"] = len(REF_SHEETS)


def main():
    for d in ["bg", "char", "fx", "items", "ui", "_ref"]:
        os.makedirs(os.path.join(ASSETS, d), exist_ok=True)
    os.makedirs(TOOLS, exist_ok=True)

    manifest = {}
    report = {"warnings": [], "busts": {}, "fx": {}, "props": {}, "ui": {}}

    do_bgs(manifest, report)
    do_busts(manifest, report)
    do_walks(manifest, report)
    do_npcs(manifest, report)
    do_fx(manifest, report)
    do_items(manifest, report)
    do_props(manifest, report)
    do_ui(manifest, report)
    do_refs(report)

    # sanity: brown button brightness ordering (btn-brown-hi must be brighter)
    try:
        a = np.asarray(Image.open(os.path.join(ASSETS, "ui", "btn-brown.png")).convert("RGB"), float).mean()
        b = np.asarray(Image.open(os.path.join(ASSETS, "ui", "btn-brown-hi.png")).convert("RGB"), float).mean()
        if b <= a:
            report["warnings"].append(
                f"btn-brown-hi ({b:.0f}) not brighter than btn-brown ({a:.0f}) - check mapping")
    except Exception as e:
        report["warnings"].append(f"brightness sanity check failed: {e!r}")

    with open(os.path.join(ASSETS, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    report["manifest_keys"] = len(manifest)
    report["decisions"] = {
        "interpreter": "WorkBuddy python 3.13 env 'default' (vibegame.exe python "
                       "sandbox blocks filesystem writes; documented fallback used)",
        "chroma_key": "saturation rule per spec; extra guard g<100 on magenta "
                      "sheets to protect legit pink sprite pixels; extra "
                      "high-threshold 'contaminated' kill (chroma dominance > 100) "
                      "for opaque anti-aliased rim pixels; feather done in "
                      "premultiplied space + un-premultiply to kill bg halos; "
                      "residual despill clamp only on still chroma-dominant pixels",
        "walk_rows": "determined empirically from debug contact sheets: row order "
                     "is down/left/right/up for all three characters; no mirrored "
                     "duplicates (left and right are distinct drawings)",
        "fx_frames": "rows detected by occupancy bands, merged to expected row "
                     "count; columns merged to 8 when over-split by sparse "
                     "particles; glow and ink sheets genuinely have 7 frames",
        "extra_sheets": "6 chroma prop/tileset sheets present in photos/ but absent "
                        "from the mapping table (library/study/dorm/desk/campus/"
                        "school) -> sliced into individual props in assets/items/ "
                        "as prop-<sheet>-<nn>",
        "ui_extras": "beyond the requested 22 UI elements, also extracted: "
                     "bar-diamonds, note-clip, panel-tall-tabs, btn-sm-0..3, "
                     "panel-wide, card-v0..3, dropdown, dropdown-2, checkbox-2, "
                     "checkbox-on-green, panel-xl",
        "items_naming": "item icon names follow the mapping table order (row-major)",
        "props_naming": "prop-<sheet>-<nn> in reading order (top-to-bottom, left-to-right)",
    }
    report["counts"] = {
        "bg": len([k for k in manifest if k.startswith("bg-")]),
        "char_busts": len([k for k in manifest if k.startswith("bust-")]),
        "char_walks": len([k for k in manifest if k.startswith("walk-")]),
        "char_npcs": len([k for k in manifest if k.startswith("npc-")]),
        "fx": len([k for k in manifest if k.startswith("fx-")]),
        "items": len([k for k in manifest if k.startswith("item-")]),
        "props": len([k for k in manifest if k.startswith("prop-")]),
        "ui": len([k for k in manifest if k.startswith("ui-")]),
    }
    with open(os.path.join(TOOLS, "report.json"), "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print("build done:", report["counts"], "keys:", len(manifest))


if __name__ == "__main__":
    main()
