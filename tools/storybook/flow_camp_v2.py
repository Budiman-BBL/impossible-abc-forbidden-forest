"""Budiman's Flow art for camp v2 (assets/storybook-src/flow_camp_v2/*.jpg, flat grey background).

Cut-outs: Cikgu Nisa walk cycle (6 side frames, feet on one ground line), Nisa seated (front view, stool removed:
the sprite stops at the seat line and the table hides the rest), the table set (top variant, split into
table+back bench and the front bench so depth sorting works), the stump stool, the 4 fence states in front and side view (pure-green sheets, chroma-keyed) and the
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
U_FENCE = 92 / 290          # front standing piece (≈290 px wide on the v2 sheet) ≈ 92 world units
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


FENCE_STATES = ("weak", "leaning", "halfbroken", "collapsed")


def chroma_key(a):
    """Pure-green key: alpha from green dominance (soft 2-step ramp), green spill pulled out of the edge pixels."""
    a = a.astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    key = g - np.maximum(r, b)                      # wood/rope/ink: <= ~10, screen: ~240
    al = np.clip(1 - (key - 18) / (110 - 18), 0, 1)
    # despill: no pixel may stay greener than its red/blue allow (wood is never green-dominant)
    g2 = np.minimum(g, np.maximum(r, b) * 1.0 + 4)
    out = np.dstack([r, g2, b]).clip(0, 255)
    # semi-transparent edge pixels are mixes with the green: unmix towards the ink/wood colour
    edge = (al > 0) & (al < 1)
    for c in range(3):
        bgc = (0.0, 248.0, 0.0)[c]
        ch = a[..., c]
        un = (ch - (1 - al) * bgc) / np.maximum(al, 1e-3)
        out[..., c] = np.where(edge, np.clip(un, 0, 255), out[..., c])
    # wood/ink green sits between red and blue: clamp both ways (no green fringe, no magenta from over-unmixing)
    out[..., 1] = np.clip(out[..., 1], np.minimum(out[..., 0], out[..., 2]), np.maximum(out[..., 0], out[..., 2]) + 4)
    return out, al


def keyed_pieces(name, kill_rows=None, n=4):
    a = load(name)
    rgb, al = chroma_key(a)
    if kill_rows:  # thin ground line: drop it wherever there is screen right above and below it
        y0, y1 = kill_rows
        above, below = al[y0 - 3], al[y1 + 3]
        for y in range(y0, y1 + 1):
            al[y] = np.where((above < 0.5) | (below < 0.5), 0, al[y])
    m = (al > 0.5).astype(np.uint8)
    nl, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    for i in range(1, nl):                          # specks (jpeg noise) go
        if st[i, 4] < 40:
            al[lab == i] = 0
    cols = (al > 0.5).sum(0)
    spans, ins = [], False
    for x in range(len(cols)):
        if cols[x] > 0 and not ins: s0, ins = x, True
        if cols[x] == 0 and ins: spans.append((s0, x)); ins = False
    spans = [sp for sp in spans if sp[1] - sp[0] > 6]
    # merge nearest spans until there are n pieces (a piece can have a detached rope end)
    while len(spans) > n:
        gaps = [spans[i + 1][0] - spans[i][1] for i in range(len(spans) - 1)]
        i = int(np.argmin(gaps)); spans[i:i + 2] = [(spans[i][0], spans[i + 1][1])]
    assert len(spans) == n, spans
    out = []
    for x0, x1 in spans:
        sub_al = al[:, x0:x1]
        ys, xs = np.nonzero(sub_al > 0.02)
        by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        piece_rgb = rgb[by0:by1, x0 + bx0:x0 + bx1]
        piece_al = sub_al[by0:by1, bx0:bx1]
        out.append((piece_rgb, piece_al, (x0 + bx0, by0, x0 + bx1, by1)))
    return out


def vertical_sheet():
    """fence_vertical_v3.jpg: pieces stacked top to bottom -> (rgb, alpha) crops, top to bottom."""
    rgb, al = chroma_key(load("fence_vertical_v3.jpg"))
    m = (al > 0.5).astype(np.uint8)
    nl, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    for i in range(1, nl):
        if st[i, 4] < 40: al[lab == i] = 0
    mains = sorted([i for i in range(1, nl) if st[i, 4] >= 2500], key=lambda i: st[i, 1])
    assert len(mains) == 4, [tuple(st[i]) for i in mains]
    owner = np.zeros(nl, int)
    for i in range(1, nl):
        if st[i, 4] < 40: continue
        cy = st[i, 1] + st[i, 3] / 2
        owner[i] = min(mains, key=lambda j: 0 if j == i else abs(cy - (st[j, 1] + st[j, 3] / 2)))
    out = []
    for j in mains:
        pm = np.isin(lab, [i for i in range(1, nl) if owner[i] == j]) | (lab == j)
        pal = np.where(pm, al, 0)
        ys, xs = np.nonzero(pal > 0.02)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        out.append((rgb[y0:y1, x0:x1].copy(), pal[y0:y1, x0:x1].copy()))
    return out


def near_post_x(al):
    """x (0..1) of the near post: centre of the opaque pixels in the bottom 8% of the piece."""
    h = al.shape[0]
    xs = np.nonzero(al[int(h * 0.92):] > 0.5)[1]
    return float(xs.mean()) / al.shape[1]


def ink_cut(rgb, al, keep):
    """Erase where keep==0 and draw a 2px ink edge along the new break so it matches the line art."""
    keep = keep.astype(np.float32)
    al2 = al * keep
    solid = (al2 > 0.5).astype(np.uint8)
    cut = (cv2.dilate((1 - keep).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0) & (solid > 0)
    rgb2 = rgb.copy()
    rgb2[cut] = rgb2[cut] * 0.25 + np.array([43, 27, 15], np.float32) * 0.75
    return rgb2, al2


def vertical_variants():
    """Vertical-run pieces: weak = piece 1 (post line going away), leaning = piece 1 sheared a little,
    half-broken = piece 1 with the far posts and rails snapped off (jagged, inked break), collapsed = piece 4.
    Pieces 2 and 3 of the sheet are still sideways (comb look when stacked), so they are not used."""
    p1, _p2, _p3, p4 = vertical_sheet()
    rgb, al = p1
    h, w = al.shape
    res = {"weak": (rgb, al)}
    # leaning: shear the top towards the outside by ~10 degrees, feet stay put
    pad = int(h * 0.18)
    big_rgb = np.zeros((h, w + pad, 3), np.float32); big_al = np.zeros((h, w + pad), np.float32)
    big_rgb[:, :w] = rgb; big_al[:, :w] = al
    M = np.float32([[1, -pad / h, pad], [0, 1, 0]])  # x' = x + pad*(1 - y/h)
    lr = cv2.warpAffine(big_rgb, M, (w + pad, h), flags=cv2.INTER_LINEAR)
    la = cv2.warpAffine(big_al, M, (w + pad, h), flags=cv2.INTER_LINEAR)
    xs = np.nonzero(la.max(0) > 0.02)[0]
    res["leaning"] = (lr[:, xs.min():xs.max() + 1], la[:, xs.min():xs.max() + 1])
    # half-broken: everything right of the near post above a jagged line is gone; the near post loses its tip
    npx = near_post_x(al) * w
    yy, xx = np.mgrid[0:h, 0:w]
    rng = np.random.default_rng(7)
    jag = np.interp(xx[0], np.linspace(0, w, 9), rng.uniform(-0.06, 0.06, 9) * h)
    line = np.where(xx > npx + w * 0.12, h * 0.30 + jag[None, :] + (xx - npx) * 0.25, h * 0.10 + jag[None, :] * 0.6)
    keep = yy >= line
    rgb_b, al_b = ink_cut(rgb, al, keep)
    ys = np.nonzero(al_b.max(1) > 0.02)[0]
    res["halfbroken"] = (rgb_b[ys.min():], al_b[ys.min():])
    # the sheet's pile is drawn much bigger than the posts; bring it to ~ the front-view pile's size
    f = 0.56
    r4, a4 = p4
    res["collapsed"] = (cv2.resize(r4, None, fx=f, fy=f, interpolation=cv2.INTER_AREA), cv2.resize(a4, None, fx=f, fy=f, interpolation=cv2.INTER_AREA))
    return res


def fence_pieces():
    """Front view (north/south runs) and vertical-run pieces (east/west), 4 states each, keyed off pure green."""
    k = PX_PER_UNIT * U_FENCE
    frames, meta = {}, {}
    for view, name, kill in (("front", "fence_front_v2.jpg", None),):
        pieces = keyed_pieces(name, kill)
        ground = max(p[2][3] for p in pieces[:3])     # shared ground (feet of the standing pieces)
        for st, (rgb, al, box) in zip(FENCE_STATES, pieces):
            im = Image.fromarray(np.dstack([rgb.astype(np.uint8), (al * 255).astype(np.uint8)]), "RGBA")
            im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
            frames[f"fence_{view}_{st}"] = im
            # origin y so that the sheet's ground line lands on the segment line
            meta[f"{view}_{st}"] = round(min(1.0, (ground - box[1]) / (box[3] - box[1])), 3)
    for st, (rgb, al) in vertical_variants().items():
        im = Image.fromarray(np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), (np.clip(al, 0, 1) * 255).astype(np.uint8)]), "RGBA")
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        frames[f"fence_vert_{st}"] = im
        meta[f"vert_{st}"] = 0.78 if st == "collapsed" else 1.0
        meta[f"vertX_{st}"] = round(near_post_x(al), 3)
    return frames, meta


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
    fence, fence_origin = fence_pieces()
    frames.update(fence)
    meta["fenceOriginY"] = fence_origin
    dull, overlay, lb = a_stone()
    frames["a_stone"], frames["a_stone_glow"] = dull, overlay
    meta["aLetter"] = lb
    meta["walkFrames"] = 6
    return frames, meta
