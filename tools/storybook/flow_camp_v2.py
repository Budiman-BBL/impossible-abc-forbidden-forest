"""Budiman's Flow art for camp v2 (assets/storybook-src/flow_camp_v2/*.jpg, flat grey background).

Cut-outs: Cikgu Nisa walk cycle (6 side frames, feet on one ground line), Nisa seated (front view, stool removed:
the sprite stops at the seat line and the table hides the rest), the table set (top variant, split into
table+back bench and the front bench so depth sorting works), the stump stool, the 4 fence states and the
letter-A stone (dull + the glowing letter as an overlay that is aligned to the dull stone's groove).
All sprites are stored at PX_PER_UNIT atlas pixels per world unit, so the in-game scale is 1 / PX_PER_UNIT.
"""
import os
import numpy as np, cv2
from PIL import Image

SRC = os.path.join(os.path.dirname(__file__), "../../assets/storybook-src/flow_camp_v2")
PX_PER_UNIT = 2.6
NISA_H = 76 * 1.18          # src/storybook/nisa.ts NISA_H (world units)
WALK_FIG_PX = 502           # hijab top to boot soles in nisa_walk_v1.jpg
U_WALK = NISA_H / WALK_FIG_PX
U_SIT = U_WALK * 240 / 255  # matched on head-to-belt length (walk 240 px, seated front view 255 px)
U_TABLE = 170 / 649         # whole top table set ≈ 170 world units wide
U_FENCE = 100 / 404         # standing piece ≈ one 100-unit fence slot
U_STONE = 40 / 671          # A stone ≈ 40 world units tall


def load(name):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert("RGB")).astype(np.int32)


def alpha_mask(a, thr=30, min_blob=60, max_hole=30):
    """Grey-background key: distance from the sheet grey, small specks dropped, tiny holes (highlights) filled."""
    bg = np.median(np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)]), 0)
    d = np.abs(a - bg).sum(2)
    m = (d > thr).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    keep = np.zeros(n, bool); keep[1:] = st[1:, 4] >= min_blob
    m = keep[lab].astype(np.uint8)
    inv = 1 - m
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    small = np.zeros(n, bool); small[1:] = st[1:, 4] <= max_hole
    m[small[lab]] = 1
    return m


def to_rgba(a, m, k):
    """Soft 1px edge, then resample to atlas size."""
    m = cv2.erode(m, np.ones((2, 2), np.uint8))
    al = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.9)
    rgba = np.dstack([np.clip(a, 0, 255).astype(np.uint8), (np.clip(al, 0, 1) * 255).astype(np.uint8)])
    im = Image.fromarray(rgba, "RGBA")
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)


def cut_box(a, box, k, poly=None, poly_keep=True, **kw):
    x0, y0, x1, y1 = box
    sub = a[y0:y1, x0:x1]
    m = alpha_mask(sub, **kw)
    if poly is not None:
        pm = np.zeros_like(m)
        cv2.fillPoly(pm, [np.array([(px - x0, py - y0) for px, py in poly], np.int32)], 1)
        m = m * (pm if poly_keep else 1 - pm)
        # the split leaves slivers of the other piece: keep only real parts
        n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8))
        if n > 2:
            big = st[1:, 4].max()
            keep = np.zeros(n, bool); keep[1:] = st[1:, 4] >= big * 0.03
            m = keep[lab].astype(np.uint8)
    ys, xs = np.nonzero(m)
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return to_rgba(sub[by0:by1, bx0:bx1], m[by0:by1, bx0:bx1], k), (x0 + bx0, y0 + by0, x0 + bx1, y0 + by1)


def walk_frames():
    a = load("nisa_walk_v1.jpg")
    a2 = a.copy()
    ground = 655                      # the drawn ground line is rows 655-662; soles end at 654
    a2[ground:] = np.median(a[:4].reshape(-1, 3), 0)
    m = alpha_mask(a2)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    figs = sorted([i for i in range(1, n) if st[i, 4] > 20000], key=lambda i: st[i, 0])
    assert len(figs) == 6, len(figs)
    top = min(st[i, 1] for i in figs)
    k = PX_PER_UNIT * U_WALK
    out, anchors = [], []
    for i in figs:
        fm = (lab == i).astype(np.uint8)
        x0, w = st[i, 0], st[i, 2]
        head = fm[top:top + 110, x0:x0 + w]
        hx = x0 + float(np.nonzero(head)[1].mean())      # head centre = stable x anchor (no frame jitter)
        anchors.append((hx, x0, x0 + w, fm))
    half = int(max(max(hx - x0, x1 - hx) for hx, x0, x1, _ in anchors)) + 4
    for hx, _, _, fm in anchors:
        cx = int(round(hx))
        sub = a[top:ground, cx - half:cx + half]
        mm = fm[top:ground, cx - half:cx + half]
        out.append(to_rgba(sub, mm, k))
    return out


def sit_front():
    a = load("nisa_sit_v1.jpg")
    seat = 456                         # stool seat top; everything below (stool, shins, boots) is dropped
    im, box = cut_box(a, (515, 60, 900, seat), PX_PER_UNIT * U_SIT)
    return im


TABLE_BOX = (40, 50, 730, 500)
# front bench outline (sheet coords) for the split; overlapping table pixels behind it go with the bench
BENCH_POLY = [(352, 348), (638, 212), (710, 232), (708, 346), (680, 346), (655, 312), (470, 400), (465, 482), (425, 482), (385, 445), (358, 385)]


def table_set():
    a = load("table_set_v1.jpg")
    k = PX_PER_UNIT * U_TABLE
    table, tb = cut_box(a, TABLE_BOX, k, poly=BENCH_POLY, poly_keep=False)
    bench, bb = cut_box(a, TABLE_BOX, k, poly=BENCH_POLY, poly_keep=True)
    stump, _ = cut_box(a, (260, 1020, 510, 1260), PX_PER_UNIT * U_TABLE * 0.62)
    # where the bench sits relative to the table, in world units (table anchor = bottom-centre of its sprite)
    tcx, tby = (tb[0] + tb[2]) / 2, tb[3]
    bcx, bby = (bb[0] + bb[2]) / 2, bb[3]
    rel = {"benchDx": round((bcx - tcx) * U_TABLE, 1), "benchDy": round((bby - tby) * U_TABLE, 1),
           "tableW": round((tb[2] - tb[0]) * U_TABLE, 1), "tableH": round((tb[3] - tb[1]) * U_TABLE, 1),
           "benchW": round((bb[2] - bb[0]) * U_TABLE, 1)}
    return table, bench, stump, rel


def fence_pieces():
    a = load("fence_pieces_v1.jpg")
    k = PX_PER_UNIT * U_FENCE
    return {
        "fence_weak": cut_box(a, (180, 55, 610, 370), k)[0],
        "fence_leaning": cut_box(a, (780, 75, 1110, 370), k)[0],
        "fence_halfbroken": cut_box(a, (185, 385, 610, 712), k)[0],
        "fence_collapsed": cut_box(a, (750, 465, 1195, 700), k)[0],
    }


def a_stone():
    a = load("huruf_A_stone_v1.jpg")
    k = PX_PER_UNIT * U_STONE
    dull, db = cut_box(a, (140, 30, 605, 730), 1.0)
    glow_full, gb = cut_box(a, (745, 30, 1220, 730), 1.0)
    # glowing letter only: warm, bright, saturated pixels (+ a soft bloom), moved onto the dull stone's groove
    g = np.asarray(glow_full).astype(np.float32)
    hsv = cv2.cvtColor(g[..., :3].astype(np.uint8), cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    h, s, v = hsv[..., 0] * 360 / 255, hsv[..., 1], hsv[..., 2]
    letter = ((h > 15) & (h < 60) & (s > 110) & (v > 170)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(letter)
    big = 1 + int(np.argmax(st[1:, 4]))
    lx, ly, lw, lh = st[big, :4]
    lm = cv2.dilate((lab == big).astype(np.uint8), np.ones((5, 5), np.uint8))
    lm = cv2.morphologyEx(lm, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)).astype(np.float32)
    bloom = cv2.GaussianBlur(lm, (0, 0), 10) * 0.7
    al = np.clip(np.maximum(cv2.GaussianBlur(lm, (0, 0), 1.2), bloom), 0, 1)
    rgb = g[..., :3].copy()
    rgb[lm < 0.5] = (255, 170, 70)       # bloom colour outside the letter strokes
    letter_img = Image.fromarray(np.dstack([rgb.astype(np.uint8), (al * 255).astype(np.uint8)]), "RGBA")
    # the dull stone's carved A: dark, low-saturation pixels in its middle
    d = np.asarray(dull).astype(np.int32)
    dark = ((d[..., :3].sum(2) < 200) & (d[..., 3] > 200)).astype(np.uint8)
    H, W = dark.shape
    dark[: int(H * 0.15)] = 0; dark[int(H * 0.8):] = 0; dark[:, : int(W * 0.25)] = 0; dark[:, int(W * 0.8):] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)))
    big = 1 + int(np.argmax(st[1:, 4]))
    dx, dy, dw, dh = st[big, :4]
    # scale/position the glowing letter (with its bloom margin) onto the groove box
    sx, sy = dw / lw, dh / lh
    li = letter_img.resize((max(1, round(letter_img.width * sx)), max(1, round(letter_img.height * sy))), Image.LANCZOS)
    overlay = Image.new("RGBA", dull.size, (0, 0, 0, 0))
    overlay.alpha_composite(li, (int(round(dx - lx * sx)), int(round(dy - ly * sy))) if dx - lx * sx >= 0 and dy - ly * sy >= 0 else (0, 0))
    # keep the overlay inside the stone silhouette
    ov = np.asarray(overlay).copy()
    ov[..., 3] = (ov[..., 3].astype(np.float32) * (d[..., 3] / 255.0)).astype(np.uint8)
    overlay = Image.fromarray(ov, "RGBA")
    rs = lambda im: im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    letter_box = {"y0": round(dy / H, 3), "y1": round((dy + dh) / H, 3)}
    return rs(dull), rs(overlay), letter_box


def flow_frames():
    frames, meta = {}, {"scale": round(1 / PX_PER_UNIT, 4)}
    for i, f in enumerate(walk_frames()):
        frames[f"nisa_walk_{i}"] = f
    frames["nisa_sit"] = sit_front()
    table, bench, stump, rel = table_set()
    frames["table"], frames["bench"], frames["stool"] = table, bench, stump
    meta["table"] = rel
    frames.update(fence_pieces())
    dull, overlay, lb = a_stone()
    frames["a_stone"], frames["a_stone_glow"] = dull, overlay
    meta["aLetter"] = lb
    meta["walkFrames"] = 6
    return frames, meta
