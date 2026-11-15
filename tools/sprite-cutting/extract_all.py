#!/usr/bin/env python3
"""Cut characters, creatures, and props from the official ABC sheets.
Outputs PNGs + contact sheets + sprite_meta.json under /workspace/abc_game/sprites/.
Does not modify the source JPGs.
"""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

OUT = Path("/workspace/abc_game/sprites")
DBG = Path("/tmp/sprite_dbg")
OUT.mkdir(parents=True, exist_ok=True)
DBG.mkdir(parents=True, exist_ok=True)

UP = 4
NISA_BODY_TARGET = 168

SHEETS = {
    "chars": Path("/workspace/abc_game/charsheet/ABC_kem_hutan_lineup_v4.jpg"),
    "creatures": Path("/workspace/abc_game/charsheet/ABC_kem_hutan_binatang_v1.jpg"),
    "props": Path("/workspace/abc_game/charsheet/ABC_kem_hutan_tempat_prop_v1.jpg"),
}

# Exclusive [x0,y0,x1,y1] in source pixels. Labels / titles stay outside.
BOXES = {
    "chars": {
        "nisa":  (14, 84, 228, 598),
        "afan":  (228, 158, 386, 598),
        "ayan":  (386, 110, 564, 598),
        "unais": (564, 144, 758, 598),
        "hanan": (758, 86, 935, 598),
        "asiya": (935, 164, 1102, 598),
        "safiya": (1102, 174, 1269, 598),
    },
    "creatures": {
        "babi_front": (28, 108, 202, 304),
        "babi_side": (208, 108, 412, 304),
        "raja_front": (422, 70, 646, 304),
        "raja_side": (646, 70, 886, 304),
        "ayam_front": (900, 80, 1070, 304),
        "ayam_side": (1070, 80, 1256, 304),
        "kera_front": (26, 376, 224, 608),
        "kera_side": (226, 376, 490, 608),
        "kelip_cluster": (500, 375, 855, 605),
        "owl_front": (876, 386, 1066, 610),
        "owl_side": (1074, 386, 1252, 610),
    },
    "props": {
        "fire_unlit": (248, 88, 400, 196),
        "fire_burning": (548, 52, 712, 196),
        "fire_embers": (808, 90, 968, 196),
        "tent": (40, 226, 278, 414),
        "tree_coconut": (362, 232, 548, 412),
        "coconut": (630, 276, 794, 414),
        "tree_rubber": (980, 186, 1228, 414),
        "bamboo": (28, 452, 218, 636),
        "rocks": (254, 476, 426, 638),
        "berry_full": (464, 472, 636, 638),
        "berry_empty": (664, 472, 838, 638),
        "firewood": (870, 496, 1042, 638),
        # ground_tile is a special opaque crop of the swatch
        "ground_tile": (1092, 506, 1234, 648),
    },
}

# Max output edge (px) after trim. Characters use a shared scale from Nisa instead.
MAX_EDGE = {
    "babi_front": 140, "babi_side": 140,
    "raja_front": 180, "raja_side": 180,
    "ayam_front": 120, "ayam_side": 120,
    "kera_front": 130, "kera_side": 130,
    "kelip_cluster": 200,
    "owl_front": 120, "owl_side": 120,
    "fire_unlit": 120, "fire_burning": 140, "fire_embers": 120,
    "tent": 180,
    "tree_coconut": 180, "coconut": 90, "tree_rubber": 200, "bamboo": 180,
    "rocks": 120, "berry_full": 120, "berry_empty": 120, "firewood": 110,
    "ground_tile": 160,
}

# Empty parchment sample points per sheet (x, y)
PARCH_SAMPLES = {
    "chars": [
        (350, 100), (700, 100), (250, 80), (1000, 100), (200, 80),
        (600, 90), (400, 80), (900, 90), (300, 90), (1100, 200),
    ],
    "creatures": [
        (640, 40), (200, 40), (1000, 40), (400, 340), (800, 340),
        (100, 340), (640, 700), (400, 700), (50, 200), (900, 350),
    ],
    "props": [
        (100, 80), (80, 40), (640, 40), (400, 80), (200, 200),
        (500, 200), (800, 250), (900, 80), (640, 700), (400, 440),
    ],
}


def to_lab(rgb: np.ndarray) -> np.ndarray:
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)


def luma(rgb: np.ndarray) -> np.ndarray:
    return 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]


def sample_parchment(sheet_rgb: np.ndarray, pts) -> np.ndarray:
    labs = []
    lu = luma(sheet_rgb)
    for x, y in pts:
        if not (0 <= y < sheet_rgb.shape[0] and 0 <= x < sheet_rgb.shape[1]):
            continue
        if lu[y, x] < 180:
            continue
        labs.append(to_lab(sheet_rgb[y : y + 1, x : x + 1])[0, 0])
    if not labs:
        return np.array([200, 134, 152], dtype=np.float32)
    # median so one off-point cannot pull the key
    return np.median(np.stack(labs, axis=0), axis=0).astype(np.float32)


def build_frame_mask(sheet_rgb: np.ndarray) -> np.ndarray:
    h, w = sheet_rgb.shape[:2]
    lu = luma(sheet_rgb)
    hsv = cv2.cvtColor(sheet_rgb, cv2.COLOR_RGB2HSV)
    sat, val = hsv[..., 1], hsv[..., 2]
    framey = (lu < 110) & ((sat > 20) | (lu < 50))
    framey |= lu < 90
    walk = framey.astype(np.uint8) * 255
    seed = np.zeros((h + 2, w + 2), np.uint8)
    # flood from all four edges
    for x in range(0, w, 8):
        if walk[0, x]:
            cv2.floodFill(walk, seed, (x, 0), 128, flags=4)
        if walk[h - 1, x]:
            cv2.floodFill(walk, seed, (x, h - 1), 128, flags=4)
    for y in range(0, h, 8):
        if walk[y, 0]:
            cv2.floodFill(walk, seed, (0, y), 128, flags=4)
        if walk[y, w - 1]:
            cv2.floodFill(walk, seed, (w - 1, y), 128, flags=4)
    frame = walk == 128
    frame = cv2.dilate(frame.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=2).astype(bool)
    return frame


def detect_flame_glow(rgb: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    # campfire / torch: warm, high sat (parchment sat can be ~60-95, so stay strict)
    warm = (sat > 130) & (val > 90) & (hue < 20)
    # firefly cores: almost-white yellow, val essentially clipped
    glow = (val >= 245) & (hue >= 22) & (hue <= 36) & (rgb[..., 1] > 200)
    core = warm | glow
    # grow pale wisps / glow halo only from cores (not across the page)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    dil = cv2.dilate(core.astype(np.uint8), k, iterations=3).astype(bool)
    pale = (val > 200) & (hue >= 18) & (hue <= 40) & (rgb[..., 1] > 180)
    return core | (dil & pale)


def fill_holes(fg_u8: np.ndarray, max_area: int = 700) -> np.ndarray:
    h, w = fg_u8.shape
    inv = (fg_u8 == 0).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(inv, 8)
    out = fg_u8.copy()
    for i in range(1, n):
        x, y, ww, hh, area = (
            stats[i, cv2.CC_STAT_LEFT],
            stats[i, cv2.CC_STAT_TOP],
            stats[i, cv2.CC_STAT_WIDTH],
            stats[i, cv2.CC_STAT_HEIGHT],
            stats[i, cv2.CC_STAT_AREA],
        )
        if x <= 0 or y <= 0 or x + ww >= w or y + hh >= h:
            continue
        if 3 <= area <= max_area:
            out[labels == i] = 255
    return out


def drop_edge_components(fg_u8, flame=None, side_frac=0.12, min_main=0.02):
    n, labels, stats, cents = cv2.connectedComponentsWithStats((fg_u8 > 0).astype(np.uint8), 8)
    if n <= 2:
        return fg_u8
    areas = stats[:, cv2.CC_STAT_AREA]
    main = 1 + int(np.argmax(areas[1:]))
    h, w = fg_u8.shape
    keep = np.zeros(n, dtype=bool)
    keep[main] = True
    fl = flame if flame is not None else np.zeros((h, w), dtype=bool)
    for i in range(1, n):
        if i == main:
            continue
        x = stats[i, cv2.CC_STAT_LEFT]
        y = stats[i, cv2.CC_STAT_TOP]
        ww = stats[i, cv2.CC_STAT_WIDTH]
        hh = stats[i, cv2.CC_STAT_HEIGHT]
        x1 = x + ww
        y1 = y + hh
        comp = labels == i
        is_fl = bool(fl[comp].mean() > 0.12) if comp.any() else False
        if is_fl:
            keep[i] = True
            continue
        entirely_left = x1 <= max(4, int(side_frac * w))
        entirely_right = x >= w - max(4, int(side_frac * w))
        entirely_top = y1 <= max(4, int(0.18 * h))
        entirely_bot = y >= h - max(4, int(0.12 * h))
        # isolated corner / title / label blobs
        if entirely_left or entirely_right or entirely_top or entirely_bot:
            continue
        cx, cy = cents[i]
        # small detached blotches sitting in a corner of the crop
        if areas[i] < 0.08 * areas[main] and (cx < 0.18 * w or cx > 0.82 * w or cy < 0.18 * h):
            continue
        if areas[i] >= min_main * areas[main]:
            keep[i] = True
    return (keep[labels] * 255).astype(np.uint8)


def drop_separated_edge_runs(fg_u8, flame=None, max_frac=0.14, min_gap=2, skip_feet=True):
    h, w = fg_u8.shape
    out = fg_u8.copy()
    lim = max(3, int(max_frac * w))
    fl = flame if flame is not None else np.zeros((h, w), dtype=bool)
    y_last = int(h * 0.78) if skip_feet else h
    for y in range(y_last):
        row = out[y] > 0
        if not row.any():
            continue
        xs = np.where(row)[0]
        x0 = int(xs[0])
        x1 = x0
        while x1 + 1 < w and row[x1 + 1]:
            x1 += 1
        g = x1 + 1
        while g < w and not row[g]:
            g += 1
        if x1 < lim and g < w and (g - x1 - 1) >= min_gap:
            if not fl[y, x0 : x1 + 1].any():
                out[y, x0 : x1 + 1] = 0
        row = out[y] > 0
        if not row.any():
            continue
        xs = np.where(row)[0]
        x1 = int(xs[-1])
        x0 = x1
        while x0 - 1 >= 0 and row[x0 - 1]:
            x0 -= 1
        g = x0 - 1
        while g >= 0 and not row[g]:
            g -= 1
        if x0 > w - 1 - lim and g >= 0 and (x0 - g - 1) >= min_gap:
            if not fl[y, x0 : x1 + 1].any():
                out[y, x0 : x1 + 1] = 0
    return out


def feather_alpha(fg_u8: np.ndarray) -> np.ndarray:
    """Soft 1-2px edge. Interior stays opaque."""
    fg = fg_u8 > 0
    dist_in = cv2.distanceTransform(fg.astype(np.uint8), cv2.DIST_L2, 3)
    alpha = np.zeros(fg_u8.shape, np.float32)
    alpha[fg] = np.clip(dist_in[fg] / 2.0, 0, 1)
    alpha[dist_in >= 2] = 1
    return (alpha * 255).astype(np.uint8)


def matte(rgb: np.ndarray, parchment_lab: np.ndarray, frame_crop: np.ndarray | None) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    lab = to_lab(rgb)
    dist = np.linalg.norm(lab - parchment_lab, axis=2)
    lu = luma(rgb)
    ink = lu < 92
    ink_w = cv2.dilate(ink.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1).astype(bool)
    flame = detect_flame_glow(rgb)
    # walkable parchment, blocked by ink and flames
    walk = ((dist < 28) & ~ink_w & ~flame).astype(np.uint8) * 255
    h, w = walk.shape
    seed = np.zeros((h + 2, w + 2), np.uint8)
    # flood from every border parchment pixel
    for x in range(w):
        if walk[0, x]:
            cv2.floodFill(walk, seed, (x, 0), 128, flags=4)
        if walk[h - 1, x]:
            cv2.floodFill(walk, seed, (x, h - 1), 128, flags=4)
    for y in range(h):
        if walk[y, 0]:
            cv2.floodFill(walk, seed, (0, y), 128, flags=4)
        if walk[y, w - 1]:
            cv2.floodFill(walk, seed, (w - 1, y), 128, flags=4)
    bg = walk == 128
    if frame_crop is not None:
        bg |= frame_crop
    fg = (~bg) | flame
    # keep ink that sits inside/near fg so soles and outlines survive
    near = cv2.dilate(fg.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1).astype(bool)
    fg = fg | (ink & near)
    fg_u8 = (fg.astype(np.uint8) * 255)
    fg_u8 = fill_holes(fg_u8, max_area=600)
    fg_u8 = drop_separated_edge_runs(fg_u8, flame, skip_feet=True)
    fg_u8 = drop_edge_components(fg_u8, flame)
    # second parchment flood after feet may have opened
    walk2 = ((dist < 26) & ~ink_w & ~flame).astype(np.uint8) * 255
    seed2 = np.zeros((h + 2, w + 2), np.uint8)
    for x in range(w):
        if walk2[0, x] and fg_u8[0, x] == 0:
            cv2.floodFill(walk2, seed2, (x, 0), 128, flags=4)
        if walk2[h - 1, x] and fg_u8[h - 1, x] == 0:
            cv2.floodFill(walk2, seed2, (x, h - 1), 128, flags=4)
    bg2 = walk2 == 128
    fg_u8[bg2] = 0
    fg_u8[flame] = 255
    alpha = feather_alpha(fg_u8)
    return alpha, dist, ink, flame


def clear_tight_parchment(rgba, dist, ink=None, flame=None, lab_ok=9.5):
    a = rgba[..., 3]
    h, w = a.shape
    fl = flame if flame is not None else np.zeros((h, w), dtype=bool)
    ik = ink if ink is not None else np.zeros((h, w), dtype=bool)
    rows = np.where((a > 80).sum(axis=1) >= 4)[0]
    if len(rows) == 0:
        return rgba
    ay = int(rows[-1])
    mid = int(ay * 0.90)
    cand = (a > 16) & (dist < lab_ok) & ~ik & ~fl
    out = rgba.copy()
    under = cand.copy()
    under[:mid] = False
    out[under, 3] = 0
    return out


def trim(rgba: np.ndarray, pad: int = 4, thr: int = 8):
    a = rgba[..., 3]
    ys, xs = np.where(a > thr)
    if len(xs) == 0:
        return rgba, (0, 0)
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(rgba.shape[1], x1 + pad)
    y1 = min(rgba.shape[0], y1 + pad)
    return rgba[y0:y1, x0:x1].copy(), (x0, y0)


def foot_anchor(rgba: np.ndarray):
    a = rgba[..., 3]
    h, w = a.shape
    rows = np.where((a > 80).sum(axis=1) >= 4)[0]
    if len(rows) == 0:
        rows = np.where(a.sum(axis=1) > 0)[0]
    ay = int(rows[-1]) if len(rows) else h - 1
    band_h = max(6, int(0.08 * h))
    y0 = max(0, ay - band_h)
    band = a[y0 : ay + 1] > 80
    xs = np.where(band)[1]
    ax = int(np.round(xs.mean())) if len(xs) else w // 2
    return ax, ay


def body_top(rgba: np.ndarray, ax: int):
    a = rgba[..., 3]
    h, w = a.shape
    half = max(8, int(0.12 * w))
    x0, x1 = max(0, ax - half), min(w, ax + half)
    col = (a[:, x0:x1] > 128).any(axis=1)
    ys = np.where(col)[0]
    return int(ys[0]) if len(ys) else 0


def checker(rgba: np.ndarray, cell: int = 12) -> Image.Image:
    h, w = rgba.shape[:2]
    yy, xx = np.indices((h, w))
    chk = np.where(((xx // cell) + (yy // cell)) % 2 == 0, 210, 245).astype(np.uint8)
    bg = np.stack([chk, chk, chk], axis=2)
    a = rgba[..., 3:4].astype(np.float32) / 255.0
    out = (rgba[..., :3].astype(np.float32) * a + bg.astype(np.float32) * (1 - a)).astype(np.uint8)
    return Image.fromarray(out)


def crop_ground_tile(sheet: Image.Image, box) -> np.ndarray:
    """Opaque crop of the painted dirt swatch, tightened to its dark border."""
    x0, y0, x1, y1 = box
    crop = np.array(sheet.crop((x0, y0, x1, y1)).convert("RGB"))
    lu = luma(crop)
    # the tile has a dark rectangular outline
    dark = lu < 80
    ys, xs = np.where(dark)
    if len(xs) < 20:
        rgba = np.dstack([crop, np.full(crop.shape[:2], 255, np.uint8)])
        return rgba
    tx0, tx1 = int(xs.min()), int(xs.max()) + 1
    ty0, ty1 = int(ys.min()), int(ys.max()) + 1
    # include the outline
    tile = crop[ty0:ty1, tx0:tx1]
    rgba = np.dstack([tile, np.full(tile.shape[:2], 255, np.uint8)])
    return rgba


def process_one(sheet: Image.Image, box, parchment_lab, frame_src, name: str) -> np.ndarray:
    x0, y0, x1, y1 = box
    crop = sheet.crop((x0, y0, x1, y1))
    crop_u = crop.resize((crop.width * UP, crop.height * UP), Image.Resampling.LANCZOS)
    rgb = np.array(crop_u)
    fr = frame_src[y0:y1, x0:x1]
    frame_u = (
        np.array(
            Image.fromarray(fr.astype(np.uint8) * 255).resize(crop_u.size, Image.Resampling.NEAREST)
        )
        > 127
    )
    alpha, dist, ink, flame = matte(rgb, parchment_lab, frame_u)
    rgba = np.dstack([rgb, alpha])
    rgba = np.dstack([rgb, alpha])
    # cleanup leftovers
    fg = (rgba[..., 3] > 16).astype(np.uint8) * 255
    feet = np.zeros_like(fg, dtype=bool)
    feet[int(fg.shape[0] * 0.78) :] = fg[int(fg.shape[0] * 0.78) :] > 0
    fg = drop_separated_edge_runs(fg, flame, skip_feet=True)
    fg = drop_edge_components(fg, flame)
    rgba[fg == 0, 3] = 0
    rgba = clear_tight_parchment(rgba, dist, ink=ink, flame=flame)
    # restore protected feet if we accidentally cleared them
    lost = feet & (rgba[..., 3] == 0)
    if lost.any():
        rgba[..., 3] = np.where(lost, alpha, rgba[..., 3])
    Image.fromarray(rgb).save(DBG / f"{name}_rgb.png")
    mag = rgba.copy()
    mag[rgba[..., 3] < 16] = (255, 0, 255, 255)
    Image.fromarray(mag).save(DBG / f"{name}_mag4x.png")
    return rgba


def make_contact(sprites: dict, order: list[str], path: Path, title: str = ""):
    items = [(n, sprites[n]) for n in order if n in sprites]
    if not items:
        return
    pad_x, pad_y = 16, 28
    max_ay = max(s["ay"] for _, s in items)
    max_above = max(s["ay"] for _, s in items)
    max_below = max(s["h"] - s["ay"] for _, s in items)
    total_w = pad_x + sum(s["w"] + pad_x for _, s in items)
    total_h = pad_y + max_above + max_below + 36
    yy, xx = np.indices((total_h, total_w))
    c = np.where(((xx // 10) + (yy // 10)) % 2 == 0, 200, 236).astype(np.uint8)
    chk = np.stack([c, c, c], axis=2)
    contact = Image.fromarray(chk)
    dr = ImageDraw.Draw(contact)
    baseline = pad_y + max_ay
    x = pad_x
    for name, s in items:
        im = Image.open(s["png"])
        py = baseline - s["ay"]
        contact.paste(im, (x, py), im)
        dr.ellipse((x + s["ax"] - 2, baseline - 2, x + s["ax"] + 2, baseline + 2), outline=(255, 0, 0))
        dr.text((x, baseline + 8), name, fill=(20, 20, 20))
        x += s["w"] + pad_x
    dr.line([(0, baseline), (total_w, baseline)], fill=(220, 0, 0), width=1)
    contact.save(path, "PNG", optimize=True)
    print("contact", path, contact.size, path.stat().st_size)


def main():
    all_meta = {"up": UP, "sheets": {}, "sprites": {}}
    up_rgba = {}
    src_metrics = {}

    for group, sheet_path in SHEETS.items():
        sheet = Image.open(sheet_path).convert("RGB")
        arr = np.array(sheet)
        parch = sample_parchment(arr, PARCH_SAMPLES[group])
        frame = build_frame_mask(arr)
        Image.fromarray((frame * 255).astype(np.uint8)).save(DBG / f"{group}_frame.png")
        print(f"\n== {group}  parchment={parch}  frame={frame.mean():.4f}  {sheet.size}")
        # guide
        vis = sheet.copy()
        d = ImageDraw.Draw(vis)
        for name, box in BOXES[group].items():
            x0, y0, x1, y1 = box
            d.rectangle([x0, y0, x1 - 1, y1 - 1], outline=(0, 180, 0), width=2)
            d.text((x0 + 3, y0 + 3), name, fill=(0, 140, 0))
        vis.save(DBG / f"{group}_crop_boxes.png")

        for name, box in BOXES[group].items():
            if name == "ground_tile":
                rgba = crop_ground_tile(sheet, box)
                # fake 1x as already final-ish; store as "up" for a uniform pipeline
                up_rgba[name] = rgba
                print(f"  {name}: swatch {rgba.shape[1]}x{rgba.shape[0]}")
                continue
            rgba = process_one(sheet, box, parch, frame, name)
            up_rgba[name] = rgba
            trimmed, _ = trim(rgba, pad=0)
            print(f"  {name}: crop {box} up {rgba.shape[1]}x{rgba.shape[0]} "
                  f"alpha>8 { (rgba[...,3]>8).mean():.3f} trim {trimmed.shape[1]}x{trimmed.shape[0]}")

    # Character scale from Nisa body height
    nisa = trim(up_rgba["nisa"], pad=0)[0]
    ax, ay = foot_anchor(nisa)
    bt = body_top(nisa, ax)
    nisa_body_up = max(1, ay - bt)
    char_scale = NISA_BODY_TARGET / nisa_body_up
    print(f"\nNisa body_up={nisa_body_up}  char_scale={char_scale:.5f}  target={NISA_BODY_TARGET}")

    CHAR_NAMES = list(BOXES["chars"].keys())
    sprites = {}

    def export(name: str, rgba: np.ndarray, scale: float):
        # ground tile is already 1:1 source, not 4x
        is_tile = name == "ground_tile"
        if is_tile:
            trimmed = rgba
            scale = 1.0
            # maybe downscale if huge
            max_e = MAX_EDGE.get(name, 160)
            m = max(trimmed.shape[0], trimmed.shape[1])
            if m > max_e:
                scale = max_e / m
        else:
            trimmed, _ = trim(rgba, pad=6)
        new_w = max(2, int(round(trimmed.shape[1] * scale)))
        new_h = max(2, int(round(trimmed.shape[0] * scale)))
        im = Image.fromarray(trimmed).resize((new_w, new_h), Image.Resampling.LANCZOS)
        arr = np.array(im)
        arr, _ = trim(arr, pad=2 if is_tile else 3, thr=8 if is_tile else 8)
        # tile should stay fully opaque
        if is_tile:
            arr[..., 3] = 255
        im = Image.fromarray(arr)
        ax, ay = foot_anchor(arr)
        bt = body_top(arr, ax)
        body_h = ay - bt
        out_png = OUT / f"{name}.png"
        im.save(out_png, "PNG", optimize=True)
        # webp compare
        wp = DBG / f"{name}.webp"
        im.save(wp, "WEBP", quality=90, method=6)
        rec = {
            "png": str(out_png),
            "w": im.size[0],
            "h": im.size[1],
            "ax": ax,
            "ay": ay,
            "body_h": body_h,
            "png_bytes": out_png.stat().st_size,
            "webp_bytes": wp.stat().st_size,
            "scale": scale,
        }
        sprites[name] = rec
        checker(arr, cell=8).save(DBG / f"{name}_check.png")
        mag = arr.copy()
        mag[arr[..., 3] < 16] = (255, 0, 255, 255)
        Image.fromarray(mag).save(DBG / f"{name}_mag.png")
        print(f"  wrote {name}.png {im.size} body_h={body_h} foot=({ax},{ay}) "
              f"png={rec['png_bytes']} webp={rec['webp_bytes']}")
        return rec

    print("\n-- characters (shared scale) --")
    for name in CHAR_NAMES:
        export(name, up_rgba[name], char_scale)

    print("\n-- creatures & props (per-sprite max edge) --")
    for group in ("creatures", "props"):
        for name in BOXES[group]:
            rgba = up_rgba[name]
            if name == "ground_tile":
                export(name, rgba, 1.0)
                continue
            trimmed, _ = trim(rgba, pad=0)
            max_e = MAX_EDGE.get(name, 140)
            m = max(trimmed.shape[0], trimmed.shape[1])
            scale = min(1.0, max_e / m)
            export(name, rgba, scale)

    make_contact(sprites, CHAR_NAMES, OUT / "contact.png")
    make_contact(sprites, list(BOXES["creatures"].keys()), OUT / "contact_creatures.png")
    make_contact(sprites, list(BOXES["props"].keys()), OUT / "contact_props.png")

    all_meta["char_scale"] = char_scale
    all_meta["nisa_body_up"] = int(nisa_body_up)
    all_meta["sprites"] = sprites
    (OUT / "sprite_meta.json").write_text(json.dumps(all_meta, indent=2))
    print("\nmeta written", len(sprites), "sprites")
    total = sum(s["png_bytes"] for s in sprites.values())
    print("total PNG bytes", total)


if __name__ == "__main__":
    main()
