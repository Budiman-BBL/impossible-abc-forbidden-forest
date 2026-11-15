#!/usr/bin/env python3
"""Cut front-row characters from the lineup sheet, matte parchment to alpha, export sprites."""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SHEET = Path("/workspace/abc_game/charsheet/ABC_kem_hutan_lineup_sheet_v2.jpg")
OUT = Path("/workspace/abc_game/sprites")
DBG = Path("/tmp/sprite_dbg")
OUT.mkdir(parents=True, exist_ok=True)
DBG.mkdir(parents=True, exist_ok=True)

# (x0, y0, x1, y1) exclusive, original 1280x720 sheet pixels. Front row only.
# Names match corrected roles: Ayan = spear guard, Unais = suspenders worker.
BOXES = {
    "afan":  (16,  90, 197, 407),
    "ayan":  (196, 66, 358, 407),
    "unais": (372, 90, 554, 407),
    "nisa":  (554, 66, 728, 407),
    "hanan": (726, 66, 888, 407),
    "asiya": (888, 85, 1078, 407),
    "safiya":(1076, 85, 1252, 407),
}

UP = 4  # work at 4x for cleaner mattes

# Lab of the cream parchment, from empty gaps on the sheet (RGB ~240,224,196).
# Computed in main() from the loaded sheet and stored here for matte().
PARCHMENT_LAB = np.array([227.7, 129.5, 145.5], dtype=np.float32)
FRAME_CROP = None  # set per character at upscale in main()
FRAME_MASK_SRC = None

# Final scale: Nisa body height target in output pixels (~3x a ~48px on-screen size).
NISA_BODY_TARGET = 168


def fill_holes(fg_u8: np.ndarray, max_area: int = 700) -> np.ndarray:
    """Fill only SMALL enclosed holes (basket weave, AA gaps).

    Large parchment pockets — the gap between the legs, the space inside a
    lantern handle — must stay transparent, so they are left alone.
    Seeds come from background pixels on the border, never from the frame.
    """
    h, w = fg_u8.shape
    inv = 255 - fg_u8
    ff = inv.copy()
    mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
    seeds = []
    for x in range(w):
        if inv[0, x] == 255:
            seeds.append((x, 0))
        if inv[h - 1, x] == 255:
            seeds.append((x, h - 1))
    for y in range(h):
        if inv[y, 0] == 255:
            seeds.append((0, y))
        if inv[y, w - 1] == 255:
            seeds.append((w - 1, y))
    if not seeds:
        return fg_u8
    for x, y in seeds:
        if mask[y + 1, x + 1]:
            continue
        if ff[y, x] != 255:
            continue
        cv2.floodFill(ff, mask, (x, y), 128)
    holes = ((inv == 255) & (ff != 128)).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(holes, connectivity=8)
    out = fg_u8.copy()
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] <= max_area:
            out[labels == i] = 255
    return out



def drop_strays(fg_u8: np.ndarray, flame: np.ndarray | None = None, min_keep_frac: float = 0.03) -> np.ndarray:
    """Keep the main character (and nearby medium pieces like flames). Drop
    far-away leftovers: sheet frame, a neighbour's ponytail, title specks.
    Also drop any non-flame component that touches the left/right crop edge.
    """
    n, labels, stats, centroids = cv2.connectedComponentsWithStats((fg_u8 > 0).astype(np.uint8), 8)
    if n <= 2:
        return fg_u8
    areas = stats[:, cv2.CC_STAT_AREA]
    main = 1 + int(np.argmax(areas[1:]))
    main_area = areas[main]
    mx, my = centroids[main]
    keep = np.zeros(n, dtype=bool)
    keep[main] = True
    h, w = fg_u8.shape
    diag = (h * h + w * w) ** 0.5
    for i in range(1, n):
        if i == main:
            continue
        a = areas[i]
        if a < 40:
            continue
        cx, cy = centroids[i]
        dist = ((cx - mx) ** 2 + (cy - my) ** 2) ** 0.5
        comp = labels == i
        xs = np.where(comp)[1]
        touches_side = xs.min() < 0.10 * w or xs.max() > 0.90 * w
        is_flame = bool(flame is not None and flame[comp].mean() > 0.15)
        if touches_side and not is_flame:
            continue
        # flames and other close attachments only
        if is_flame and dist < 0.62 * diag:
            keep[i] = True
        elif (not touches_side) and a >= min_keep_frac * main_area and dist < 0.40 * diag:
            keep[i] = True
    return (keep[labels] * 255).astype(np.uint8)


def clear_parchment_pockets(fg_u8, dist, ink, flame, lab_ok=20.0):
    """Remove enclosed cream pockets beside the body (spear gap, lantern handle)
    without eating cream clothes that sit on the body axis."""
    h, w = fg_u8.shape
    pocket = (fg_u8 > 0) & (dist < lab_ok) & ~ink & ~(flame if flame is not None else False)
    if not pocket.any():
        return fg_u8
    # body axis from the lowest solid row (feet)
    rows = np.where((fg_u8 > 0).sum(axis=1) > 8)[0]
    if len(rows) == 0:
        return fg_u8
    ay = int(rows[-1])
    band = fg_u8[max(0, ay - max(8, h // 12)) : ay + 1] > 0
    xs = np.where(band)[1]
    ax = int(np.round(xs.mean())) if len(xs) else w // 2
    n, labels, stats, cents = cv2.connectedComponentsWithStats(pocket.astype(np.uint8), 8)
    out = fg_u8.copy()
    for i in range(1, n):
        area = stats[i, cv2.CC_STAT_AREA]
        if area < 30:
            out[labels == i] = 0
            continue
        cx, cy = cents[i]
        # pockets whose centre sits clearly off the stance axis
        if abs(cx - ax) > 0.16 * w and area < 0.08 * h * w:
            out[labels == i] = 0
    return out


def build_frame_mask(sheet_rgb: np.ndarray) -> np.ndarray:
    """Mask the decorative dark-green page frame, flooded from the sheet edges."""
    h, w = sheet_rgb.shape[:2]
    lu = 0.299 * sheet_rgb[..., 0] + 0.587 * sheet_rgb[..., 1] + 0.114 * sheet_rgb[..., 2]
    hsv = cv2.cvtColor(sheet_rgb, cv2.COLOR_RGB2HSV)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    # dark green / black painted border
    framey = (lu < 110) & ((sat > 20) | (lu < 50))
    # also catch the brown-green scuffed edge
    framey |= (lu < 90)
    walk = framey.astype(np.uint8) * 255
    mask = np.zeros((h + 2, w + 2), np.uint8)
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        if walk[y, x] == 0:
            # look for a nearby frame pixel
            found = False
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    yy, xx = min(h - 1, max(0, y + dy)), min(w - 1, max(0, x + dx))
                    if walk[yy, xx]:
                        x, y = xx, yy
                        found = True
                        break
                if found:
                    break
            if not found:
                continue
        if mask[y + 1, x + 1]:
            continue
        cv2.floodFill(walk, mask, (int(x), int(y)), 128)
    frame = (mask[1:-1, 1:-1] != 0) | (walk == 128)
    # dilate slightly to catch antialias fringe of the frame
    frame = cv2.dilate(frame.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=2).astype(bool)
    return frame


def to_lab(rgb: np.ndarray) -> np.ndarray:
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)

def luma(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0].astype(np.float32), rgb[..., 1].astype(np.float32), rgb[..., 2].astype(np.float32)
    return 0.299 * r + 0.587 * g + 0.114 * b

def matte(rgb: np.ndarray) -> np.ndarray:
    """Return 0-255 alpha, same HxW as rgb (already upscaled)."""
    h, w = rgb.shape[:2]
    lab = to_lab(rgb)
    lu = luma(rgb)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    sat = hsv[..., 1].astype(np.float32)
    val = hsv[..., 2].astype(np.float32)

    # Parchment colour is sampled once from known empty gaps on the sheet (global),
    # and refined with this crop's border (rejecting outliers such as the dark frame).
    border = np.zeros((h, w), dtype=bool)
    m = 8
    border[:m, :] = True
    border[-m:, :] = True
    border[:, :m] = True
    border[:, -m:] = True
    pmean = PARCHMENT_LAB
    dist = np.linalg.norm(lab - pmean, axis=2)

    ink = lu < 92
    # close tiny outline gaps
    ink_w = cv2.dilate(ink.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1).astype(bool)
    # decorative page frame is never part of a character
    frame = FRAME_CROP
    if frame is not None:
        ink = ink & ~frame
        ink_w = ink_w & ~frame

    # Wispy flames / magic. Parchment itself is a weakly saturated orange
    # (S ~45-65), so warm "flame" must be much more saturated than paper.
    hue = hsv[..., 0].astype(np.int32)
    warm_fire = (hue < 28) & (sat > 110) & (val > 120)  # torch yellow/orange
    cool_magic = (hue > 80) & (hue < 165) & (sat > 55) & (val > 80)  # purple/blue
    flame_core = warm_fire | cool_magic
    # grow into paler wisp / highlight pixels of a similar hue
    flame = flame_core.copy()
    if flame_core.any():
        grow = cv2.dilate(flame_core.astype(np.uint8), np.ones((5, 5), np.uint8), iterations=2).astype(bool)
        pale_warm = (hue < 28) & (sat > 70) & (val > 150) & (dist > 20)
        pale_cool = (hue > 80) & (hue < 165) & (sat > 35) & (val > 80)
        flame = flame_core | (grow & (pale_warm | pale_cool) & ~ink_w)

    parchment = (dist < 22) & ~ink_w & ~flame
    # slightly looser parchment for flood walking, still blocked by ink
    parch_walk = (dist < 28) & ~ink_w & ~flame

    # Flood from border parchment
    seeds = parchment & border
    # also any border pixel that is not ink and not clearly colorful
    seeds |= border & ~ink_w & ~flame & (dist < 36)

    bg = np.zeros((h, w), dtype=np.uint8)
    # OpenCV floodFill needs a mask 2px larger
    ff_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
    # We'll flood on a binary image of walkable parchment
    walk = parch_walk.astype(np.uint8) * 255
    # Block ink as 0
    walk[ink_w] = 0
    ys, xs = np.where(seeds)
    for x, y in zip(xs.tolist(), ys.tolist()):
        if bg[y, x]:
            continue
        if walk[y, x] == 0:
            continue
        cv2.floodFill(walk, ff_mask, (x, y), 128, loDiff=0, upDiff=0, flags=4)
    bg = (ff_mask[1:-1, 1:-1] != 0) | (walk == 128)
    if frame is not None:
        bg = bg | frame

    # Everything not reached and not clearly empty is foreground
    fg = ~bg

    # Remove tiny edge speckles from paper texture
    fg_u8 = fg.astype(np.uint8) * 255
    # close small holes inside character (shirt gaps, basket weave)
    fg_u8 = cv2.morphologyEx(fg_u8, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
    # open to drop specks
    fg_u8 = cv2.morphologyEx(fg_u8, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), iterations=1)

    # Keep decent-sized components (character + flames that may be weakly attached)
    nlab, labels, stats, _ = cv2.connectedComponentsWithStats(fg_u8, connectivity=8)
    keep = np.zeros(nlab, dtype=bool)
    areas = stats[:, cv2.CC_STAT_AREA] if nlab else []
    min_area = max(80, int(0.002 * h * w))
    for i in range(1, nlab):
        if areas[i] >= min_area:
            keep[i] = True
    fg_u8 = (keep[labels] * 255).astype(np.uint8) if nlab else fg_u8

    fg_u8 = fill_holes(fg_u8)
    fg_u8 = drop_strays(fg_u8, flame=flame)

    # GrabCut refine — but cream clothes / beige hijab look like parchment,
    # so never let GrabCut reclassify the flooded background core as foreground.
    gc_mask = np.full((h, w), cv2.GC_PR_BGD, dtype=np.uint8)
    gc_mask[fg_u8 > 0] = cv2.GC_PR_FGD
    sure_bg = bg & border
    er = cv2.erode(fg_u8, np.ones((5, 5), np.uint8), iterations=2)
    gc_mask[er > 0] = cv2.GC_FGD
    gc_mask[sure_bg] = cv2.GC_BGD
    dist_fg = cv2.distanceTransform((fg_u8 > 0).astype(np.uint8), cv2.DIST_L2, 3)
    gc_mask[(bg) & (dist_fg > 6)] = cv2.GC_BGD
    gc_mask[(ink | flame) & (fg_u8 > 0)] = cv2.GC_FGD
    # core of the flood-fill background must stay background
    bg_core = cv2.erode(bg.astype(np.uint8), np.ones((5, 5), np.uint8), iterations=2).astype(bool)

    bgd = np.zeros((1, 65), np.float64)
    fgd = np.zeros((1, 65), np.float64)
    initial_fg = fg_u8.copy()
    try:
        cv2.grabCut(rgb, gc_mask, None, bgd, fgd, 5, cv2.GC_INIT_WITH_MASK)
        gc_fg = np.isin(gc_mask, (cv2.GC_FGD, cv2.GC_PR_FGD))
        gc_fg |= (er > 0) | ((ink | flame) & (initial_fg > 0))
        # allow only a thin rim around the original silhouette to change
        allow = cv2.dilate(initial_fg, np.ones((5, 5), np.uint8), iterations=2) > 0
        gc_fg &= allow
        gc_fg &= ~bg_core
        gc_fg &= ~sure_bg
        fg_u8 = gc_fg.astype(np.uint8) * 255
    except cv2.error:
        pass

    # Close/fill again after grabcut
    fg_u8 = cv2.morphologyEx(fg_u8, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=1)
    fg_u8 = fill_holes(fg_u8)
    fg_u8 = drop_strays(fg_u8, flame=flame)

    # --- remove ground shadow + parchment between the legs ---
    # Foot line: lowest row with a meaningful amount of dark ink inside current fg.
    ink_in = ink & (fg_u8 > 0)
    row_ink = ink_in.sum(axis=1)
    # require at least a few ink pixels (shoe outline is a short horizontal stroke)
    candidates = np.where(row_ink >= 6)[0]
    if len(candidates):
        foot_row = int(candidates[-1])
    else:
        rows = np.where(fg_u8.sum(axis=1) > 0)[0]
        foot_row = int(rows[-1]) if len(rows) else h - 1

    # Zero everything clearly below the sole (plus a tiny slack for AA).
    slack = 3
    if foot_row + slack + 1 < h:
        fg_u8[foot_row + slack + 1 :, :] = 0

    # From mid-shin down, drop parchment-coloured pixels (between the legs and
    # the drawn ground shadow). Never drop ink — that is the shoe outline.
    y0s = max(0, foot_row - int(0.22 * h))
    y1s = min(h, foot_row + slack + 1)
    band = slice(y0s, y1s)
    parch_gap = (
        (dist[band] < 26)
        & ~ink[band]
        & ~flame[band]
        & (fg_u8[band] > 0)
    )
    fg_u8[band][parch_gap] = 0
    # also drop the darker scribbled shadow (same hue family, darker)
    shadow = (
        (dist[band] < 45)
        & (lu[band] < 175)
        & ~ink[band]
        & ~flame[band]
        & (sat[band] < 100)
        & (fg_u8[band] > 0)
    )
    fg_u8[band][shadow] = 0

    # Restore ink so soles / stick tips are not eaten
    fg_u8[ink_w & (np.arange(h)[:, None] <= foot_row + slack)] = 255
    if foot_row + slack + 1 < h:
        fg_u8[foot_row + slack + 1 :, :] = 0

    # Second parchment flood now that the feet are open, so leg gaps empty,
    # then drop off-axis cream pockets (spear gap, lantern handle).
    walk2 = ((dist < 22) & ~ink_w & ~flame).astype(np.uint8) * 255
    # already-bg pixels are seeds
    bg_now = fg_u8 == 0
    ff = np.zeros((h + 2, w + 2), np.uint8)
    ys, xs = np.where(bg_now & (walk2 > 0))
    # only seed from a subset (border-ish / already bg walk pixels)
    for x, y in zip(xs[::8].tolist(), ys[::8].tolist()):
        if ff[y + 1, x + 1] or walk2[y, x] == 0:
            continue
        cv2.floodFill(walk2, ff, (x, y), 128)
    reached = (ff[1:-1, 1:-1] != 0) | (walk2 == 128)
    fg_u8[reached & ~ink] = 0
    fg_u8 = clear_parchment_pockets(fg_u8, dist, ink, flame, lab_ok=12.0)
    fg_u8[ink & (np.arange(h)[:, None] <= foot_row + slack)] = 255

    # Feather: blur alpha and ramp near the edge, but keep interiors solid.
    binary = (fg_u8 > 127).astype(np.uint8) * 255
    # distance from edge, in px
    dt_in = cv2.distanceTransform(binary, cv2.DIST_L2, 3)
    dt_out = cv2.distanceTransform(255 - binary, cv2.DIST_L2, 3)
    feather = 2.2
    alpha = np.zeros((h, w), dtype=np.float32)
    alpha[binary > 0] = 255
    # soft outside: fade over `feather` px
    edge = (binary == 0) & (dt_out <= feather)
    alpha[edge] = np.clip(255 * (1.0 - dt_out[edge] / feather), 0, 255)
    # slightly soften the first interior pixel so outlines aren't crunchy
    inner = (binary > 0) & (dt_in < 1.2)
    alpha[inner] = np.maximum(alpha[inner], 255 * (0.7 + 0.3 * dt_in[inner] / 1.2))

    return np.clip(alpha, 0, 255).astype(np.uint8)



def drop_separated_edge_runs(fg_u8, flame=None, max_frac=0.14, min_gap=2, skip_feet=True):
    """Row-wise: drop a short run on the left or right edge if a gap separates
    it from the rest of the character (frame strip, neighbour ponytail)."""
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
        # left
        # first contiguous run
        x0 = int(xs[0])
        x1 = x0
        while x1 + 1 < w and row[x1 + 1]:
            x1 += 1
        # gap after this run?
        g = x1 + 1
        while g < w and not row[g]:
            g += 1
        if x1 < lim and g < w and (g - x1 - 1) >= min_gap:
            if not fl[y, x0:x1+1].any():
                out[y, x0:x1+1] = 0
        # right
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
            if not fl[y, x0:x1+1].any():
                out[y, x0:x1+1] = 0
    return out


def drop_edge_components(fg_u8, flame=None, side_frac=0.12, min_main=0.02):
    """Drop leftover components that live on the left/right margin or are tiny."""
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
        ww = stats[i, cv2.CC_STAT_WIDTH]
        x1 = x + ww
        comp = labels == i
        is_flame = bool(fl[comp].mean() > 0.15)
        entirely_left = x1 <= max(4, int(side_frac * w))
        entirely_right = x >= w - max(4, int(side_frac * w))
        if is_flame:
            keep[i] = True
            continue
        if entirely_left or entirely_right:
            continue
        if areas[i] >= min_main * areas[main]:
            keep[i] = True
    return (keep[labels] * 255).astype(np.uint8)


def split_thin_bridges(fg_u8, flame=None):
    """Erode to break 1-2px bridges, drop resulting edge leftovers, restore."""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    core = cv2.erode(fg_u8, k, iterations=1)
    n, labels, stats, cents = cv2.connectedComponentsWithStats((core > 0).astype(np.uint8), 8)
    if n <= 1:
        return fg_u8
    areas = stats[:, cv2.CC_STAT_AREA]
    # main core may have been split; keep the largest and any flame cores
    order = 1 + np.argsort(-areas[1:])
    h, w = fg_u8.shape
    fl = flame if flame is not None else np.zeros((h, w), dtype=bool)
    keep = np.zeros(n, dtype=bool)
    if len(order):
        keep[order[0]] = True
    for i in order[1:]:
        comp = labels == i
        # restore a core only if it is not an edge leftover
        x = stats[i, cv2.CC_STAT_LEFT]
        x1 = x + stats[i, cv2.CC_STAT_WIDTH]
        is_flame = bool(fl[comp].mean() > 0.15) if comp.any() else False
        entirely_left = x1 <= max(4, int(0.12 * w))
        entirely_right = x >= w - max(4, int(0.12 * w))
        if is_flame or (not entirely_left and not entirely_right and areas[i] > 80):
            keep[i] = True
    kept_core = (keep[labels] * 255).astype(np.uint8)
    # dilate back and intersect with original, plus keep flames from original
    restored = cv2.dilate(kept_core, k, iterations=2)
    out = np.where((restored > 0) & (fg_u8 > 0), fg_u8, 0).astype(np.uint8)
    if flame is not None:
        out = np.where(flame & (fg_u8 > 0), fg_u8, out).astype(np.uint8)
    return out


def restore_enclosed_holes(rgba, dist, max_area=400, min_parchment=14.0):
    """Put back small fully-enclosed holes whose RGB is not parchment
    (e.g. dark croc interior that shadow-clear punched through)."""
    a = rgba[..., 3]
    h, w = a.shape
    hole = (a < 16).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(hole, 8)
    out = rgba.copy()
    for i in range(1, n):
        area = stats[i, cv2.CC_STAT_AREA]
        x, y, ww, hh = stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_TOP], stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT]
        # skip holes that touch the image border (true background)
        if x <= 0 or y <= 0 or x + ww >= w or y + hh >= h:
            continue
        if area < 3 or area > max_area:
            continue
        comp = labels == i
        # only restore if the original RGB is not parchment-like
        if dist[comp].mean() < min_parchment:
            continue
        # and the hole is mostly surrounded by opaque pixels
        dil = cv2.dilate(comp.astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1).astype(bool)
        ring = dil & ~comp
        if ring.sum() == 0:
            continue
        if (a[ring] > 80).mean() < 0.7:
            continue
        out[comp, 3] = np.maximum(out[comp, 3], 220)
    return out


def clear_tight_parchment(rgba, dist, ink=None, flame=None, lab_ok=9.5):
    """Clear remaining true-parchment under feet and in off-axis prop gaps."""
    a = rgba[..., 3]
    h, w = a.shape
    fl = flame if flame is not None else np.zeros((h, w), dtype=bool)
    ik = ink if ink is not None else np.zeros((h, w), dtype=bool)
    # foot row
    rows = np.where((a > 80).sum(axis=1) >= 4)[0]
    if len(rows) == 0:
        return rgba
    ay = int(rows[-1])
    mid = int(ay * 0.90)  # only the sliver under the soles, never the shoes
    cand = (a > 16) & (dist < lab_ok) & ~ik & ~fl
    out = rgba.copy()
    # under mid-shin: always clear tight parchment
    under = cand.copy()
    under[:mid] = False
    out[under, 3] = 0
    # off-axis pockets above that (spear / lantern)
    band = a[max(0, ay - max(8, h // 12)): ay + 1] > 80
    xs = np.where(band)[1]
    ax = int(np.round(xs.mean())) if len(xs) else w // 2
    pocket = cand.copy()
    pocket[under] = False
    n, labels, stats, cents = cv2.connectedComponentsWithStats(pocket.astype(np.uint8), 8)
    for i in range(1, n):
        cx, cy = cents[i]
        area = stats[i, cv2.CC_STAT_AREA]
        if area < 8:
            out[labels == i, 3] = 0
            continue
        if abs(cx - ax) > 0.18 * w and area < 0.06 * h * w:
            out[labels == i, 3] = 0
    return out


def _protect_feet(fg_u8):
    """Mask of the bottom 22% (shoes / ankles) that must not be morph-opened."""
    h, w = fg_u8.shape
    y0 = int(h * 0.78)
    prot = np.zeros_like(fg_u8, dtype=bool)
    prot[y0:] = fg_u8[y0:] > 0
    return prot


def cleanup_rgba(rgba, flame=None, ink=None, dist=None, aggressive=True):
    """Final stray / parchment sweep. aggressive=True is for the 4x matte;
    after downscale, skip morphological opening so thin ankles/shoes survive."""
    a = rgba[..., 3]
    fg = (a > 16).astype(np.uint8) * 255
    feet = _protect_feet(fg)
    fg = drop_separated_edge_runs(fg, flame, skip_feet=True)
    fg = drop_edge_components(fg, flame)
    if aggressive:
        opened = split_thin_bridges(fg, flame)
        # never let opening eat shoes / ankles
        fg = np.where(feet, fg, opened).astype(np.uint8)
        fg = drop_edge_components(fg, flame)
    out = rgba.copy()
    out[fg == 0, 3] = 0
    if dist is not None:
        # parchment under feet only: a thin bottom sliver, not the shoes
        out = clear_tight_parchment(out, dist, ink=ink, flame=flame)
        out = restore_enclosed_holes(out, dist)
    fg = (out[..., 3] > 16).astype(np.uint8) * 255
    # keep any foot pixels we already had
    fg = np.where(feet, np.maximum(fg, feet.astype(np.uint8) * 255), fg).astype(np.uint8)
    fg = drop_edge_components(fg, flame)
    # drop_edge_components can still drop a protruding leftover but must not
    # drop a whole shoe that was marked as feet
    fg = np.where(feet, np.maximum(fg, feet.astype(np.uint8) * 255), fg).astype(np.uint8)
    out[fg == 0, 3] = 0
    # restore original foot alpha if we just zeroed protected pixels
    prot_lost = feet & (out[..., 3] == 0)
    if prot_lost.any():
        out[..., 3] = np.where(prot_lost, rgba[..., 3], out[..., 3])
    return out


def trim(rgba: np.ndarray, pad: int = 4):
    a = rgba[..., 3]
    ys, xs = np.where(a > 8)
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
    """Return (ax, ay) in sprite pixels: feet at bottom-center of the stance."""
    a = rgba[..., 3]
    h, w = a.shape
    # lowest reasonably opaque row
    rows = np.where((a > 80).sum(axis=1) >= 4)[0]
    if len(rows) == 0:
        rows = np.where(a.sum(axis=1) > 0)[0]
    ay = int(rows[-1]) if len(rows) else h - 1
    # horizontal centroid of the bottom band (the two feet)
    band_h = max(6, int(0.08 * h))
    y0 = max(0, ay - band_h)
    band = a[y0 : ay + 1] > 80
    xs = np.where(band)[1]
    ax = int(np.round(xs.mean())) if len(xs) else w // 2
    return ax, ay


def body_top(rgba: np.ndarray, ax: int):
    """Highest opaque pixel in a vertical band around the body axis (excludes side props)."""
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


def main():
    sheet = Image.open(SHEET).convert("RGB")
    sheet_arr = np.array(sheet)
    global PARCHMENT_LAB
    # known empty parchment gaps (x, y) — avoid title, labels, characters, frame
    gap_xy = [
        (365, 180), (365, 300), (560, 120), (735, 200), (890, 120),
        (1080, 150), (200, 80), (400, 70), (800, 80), (1000, 90),
        (50, 150), (300, 90), (500, 90), (640, 200), (200, 300),
    ]
    labs = []
    for x, y in gap_xy:
        px = sheet_arr[y, x]
        if px.astype(int).mean() < 180:
            continue
        bgr = cv2.cvtColor(sheet_arr[y:y+1, x:x+1], cv2.COLOR_RGB2BGR)
        labs.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)[0, 0].astype(np.float32))
    PARCHMENT_LAB = np.mean(labs, axis=0).astype(np.float32)
    print("PARCHMENT_LAB", PARCHMENT_LAB, "n", len(labs))
    global FRAME_MASK_SRC, FRAME_CROP
    FRAME_MASK_SRC = build_frame_mask(sheet_arr)
    Image.fromarray((FRAME_MASK_SRC * 255).astype(np.uint8)).save(DBG / "sheet_frame.png")
    print("frame fraction", float(FRAME_MASK_SRC.mean()))
    results = {}
    raw_mattes = {}  # at UP scale, untrimmed, for measuring source-relative sizes

    # guide image
    vis = sheet.copy()
    d = ImageDraw.Draw(vis)
    colors = {
        "afan": (0, 180, 0),
        "ayan": (200, 40, 40),
        "unais": (40, 80, 200),
        "nisa": (160, 0, 160),
        "hanan": (0, 160, 160),
        "asiya": (200, 120, 0),
        "safiya": (80, 80, 80),
    }
    for name, (x0, y0, x1, y1) in BOXES.items():
        d.rectangle([x0, y0, x1 - 1, y1 - 1], outline=colors[name], width=2)
        d.text((x0 + 3, y0 + 3), name, fill=colors[name])
    vis.save(DBG / "crop_boxes.png")

    upscaled_rgba = {}
    for name, box in BOXES.items():
        x0, y0, x1, y1 = box
        crop = sheet.crop((x0, y0, x1, y1))
        crop_u = crop.resize((crop.width * UP, crop.height * UP), Image.Resampling.LANCZOS)
        rgb = np.array(crop_u)
        fr = FRAME_MASK_SRC[y0:y1, x0:x1]
        FRAME_CROP = np.array(
            Image.fromarray(fr.astype(np.uint8) * 255).resize(crop_u.size, Image.Resampling.NEAREST)
        ) > 127
        alpha = matte(rgb)
        rgba = np.dstack([rgb, alpha])
        # post-matte stray cleanup (frame strip, neighbour props, cream pockets)
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
        dist = np.linalg.norm(lab - PARCHMENT_LAB, axis=2)
        lu = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
        ink = lu < 92
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        # reuse a loose flame hint for cleanup (don't drop real fire)
        hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
        flame = ((sat > 100) & (val > 80) & ((hue < 22) | (hue > 150) | ((hue > 100) & (hue < 145))))
        rgba = cleanup_rgba(rgba, flame=flame, ink=ink, dist=dist)
        upscaled_rgba[name] = rgba
        # debug
        Image.fromarray(rgb).save(DBG / f"{name}_rgb.png")
        Image.fromarray(alpha).save(DBG / f"{name}_alpha.png")
        checker(rgba).save(DBG / f"{name}_check_full.png")
        print(f"{name}: crop {crop.size}  up {crop_u.size}  alpha>8 {(alpha>8).mean():.3f}")

    # Measure body heights in *source* pixels via the upscaled mattes (divide by UP).
    src_metrics = {}
    for name, rgba in upscaled_rgba.items():
        trimmed, (tx, ty) = trim(rgba, pad=0)
        ax, ay = foot_anchor(trimmed)
        bt = body_top(trimmed, ax)
        body_h_up = ay - bt
        # also full prop height
        prop_h_up = trimmed.shape[0]
        src_metrics[name] = {
            "body_h_src": body_h_up / UP,
            "prop_h_src": prop_h_up / UP,
            "body_h_up": body_h_up,
            "ax_up": ax,
            "ay_up": ay,
            "bt_up": bt,
        }
        print(f"{name}: body_h_src={body_h_up/UP:.1f}  prop_h_src={prop_h_up/UP:.1f}  foot=({ax},{ay}) top={bt}")

    nisa_body_up = src_metrics["nisa"]["body_h_up"]
    scale = NISA_BODY_TARGET / nisa_body_up  # uniform
    print(f"\nCommon scale (up -> out): {scale:.5f}  (Nisa body {NISA_BODY_TARGET}px)")

    sprites = {}
    for name, rgba in upscaled_rgba.items():
        trimmed, _ = trim(rgba, pad=6)
        # downscale uniformly
        new_w = max(2, int(round(trimmed.shape[1] * scale)))
        new_h = max(2, int(round(trimmed.shape[0] * scale)))
        im = Image.fromarray(trimmed)
        im = im.resize((new_w, new_h), Image.Resampling.LANCZOS)
        # re-trim a little after resize (feather may add faint halo)
        arr = np.array(im)
        bgr = cv2.cvtColor(arr[..., :3], cv2.COLOR_RGB2BGR)
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB).astype(np.float32)
        dist = np.linalg.norm(lab - PARCHMENT_LAB, axis=2)
        lu = 0.299 * arr[..., 0] + 0.587 * arr[..., 1] + 0.114 * arr[..., 2]
        ink = lu < 92
        hsv = cv2.cvtColor(arr[..., :3], cv2.COLOR_RGB2HSV)
        hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
        flame = ((sat > 100) & (val > 80) & ((hue < 22) | (hue > 150) | ((hue > 100) & (hue < 145))))
        arr = cleanup_rgba(arr, flame=flame, ink=ink, dist=dist, aggressive=False)
        arr, _ = trim(arr, pad=3)
        im = Image.fromarray(arr)
        ax, ay = foot_anchor(arr)
        bt = body_top(arr, ax)
        body_h = ay - bt
        out_png = OUT / f"{name}.png"
        im.save(out_png, "PNG", optimize=True)
        # also webp for size compare
        out_webp = DBG / f"{name}.webp"
        im.save(out_webp, "WEBP", quality=90, method=6, lossless=False)
        lossless = DBG / f"{name}_ll.webp"
        im.save(lossless, "WEBP", lossless=True, method=6)
        sprites[name] = {
            "png": str(out_png),
            "w": im.size[0],
            "h": im.size[1],
            "ax": ax,
            "ay": ay,
            "body_h": body_h,
            "body_h_src": src_metrics[name]["body_h_src"],
            "prop_h_src": src_metrics[name]["prop_h_src"],
            "png_bytes": out_png.stat().st_size,
            "webp_bytes": out_webp.stat().st_size,
            "webp_ll_bytes": lossless.stat().st_size,
        }
        checker(arr, cell=8).save(DBG / f"{name}_check.png")
        print(f"  wrote {name}.png {im.size} body_h={body_h} ax,ay=({ax},{ay}) "
              f"png={out_png.stat().st_size} webp={out_webp.stat().st_size} ll={lossless.stat().st_size}")

    # contact sheet of cut sprites on checker + labels
    pad_x, pad_y = 16, 36
    max_h = max(s["h"] for s in sprites.values())
    # align by feet
    total_w = pad_x + sum(s["w"] + pad_x for s in sprites.values())
    total_h = pad_y + max_h + 40
    contact = Image.new("RGBA", (total_w, total_h), (0, 0, 0, 0))
    # checker bg
    chk = np.zeros((total_h, total_w, 4), dtype=np.uint8)
    yy, xx = np.indices((total_h, total_w))
    c = np.where(((xx // 10) + (yy // 10)) % 2 == 0, 200, 236).astype(np.uint8)
    chk[..., 0] = c
    chk[..., 1] = c
    chk[..., 2] = c
    chk[..., 3] = 255
    contact = Image.fromarray(chk)
    dr = ImageDraw.Draw(contact)
    x = pad_x
    # feet line
    # we'll place each so ay lands on the same baseline
    baseline = pad_y + max(s["ay"] for s in sprites.values())
    for name, s in sprites.items():
        im = Image.open(s["png"])
        px = x + 0  # images already trimmed; place so foot ay hits baseline
        py = baseline - s["ay"]
        contact.paste(im, (px, py), im)
        # foot mark
        dr.ellipse((px + s["ax"] - 2, baseline - 2, px + s["ax"] + 2, baseline + 2), outline=(255, 0, 0))
        dr.text((px, baseline + 8), name, fill=(20, 20, 20))
        x += s["w"] + pad_x
    dr.line([(0, baseline), (total_w, baseline)], fill=(220, 0, 0), width=1)
    contact_path = OUT / "contact.png"
    contact.save(contact_path, "PNG", optimize=True)
    print("contact", contact_path, contact.size, contact_path.stat().st_size)

    meta_path = OUT / "sprite_meta.json"
    meta_path.write_text(json.dumps({"scale_up_to_out": scale, "up": UP, "sprites": sprites}, indent=2))
    print("meta written")


if __name__ == "__main__":
    main()
