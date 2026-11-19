"""Camp v2 art: atlas `camp2` + seamless ground tiles.

Sources (all project art, nothing third-party):
  /workspace/abc_game/map_ref/objects_raw/  belukar_objects_v1/v2.jpg, hutan_objects_v1.jpg, tex_grass_v1.jpg, tex_dirt_v1.jpg
  /workspace/abc_game/camp_assets_v1/objects/  tent.png, fence_segment.png
Procedural (storybook-style placeholders until proper art): table, bench, stool.
Output: src/storybook/assets/camp2.png/json, ground_grass.jpg, ground_dirt.jpg.
"""
import json, os, sys
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFilter

RAW = "/workspace/abc_game/map_ref/objects_raw"
OBJ = "/workspace/abc_game/camp_assets_v1/objects"
OUT = os.path.join(os.path.dirname(__file__), "../../src/storybook/assets")
PREVIEW = sys.argv[1] if len(sys.argv) > 1 else None


def cutout(path, box, scale):
    """Cut one object off the flat grey sheet background with a clean alpha edge."""
    im = Image.open(path).convert("RGB")
    x, y, w, h = box
    pad = 12
    a = np.asarray(im).astype(np.int32)[max(0, y - pad):y + h + pad, max(0, x - pad):x + w + pad]
    bg = np.array([207, 207, 207])
    d = np.abs(a - bg).sum(2)
    hard = (d > 34).astype(np.uint8)
    hard = cv2.morphologyEx(hard, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    # keep the biggest blob, fill its holes (light highlights inside the object stay opaque)
    n, lab, st, _ = cv2.connectedComponentsWithStats(hard)
    keep = 1 + int(np.argmax(st[1:, 4]))
    hard = (lab == keep).astype(np.uint8)
    ff = hard.copy() * 255
    m2 = np.zeros((ff.shape[0] + 2, ff.shape[1] + 2), np.uint8)
    cv2.floodFill(ff, m2, (0, 0), 128)
    hard = (ff != 128).astype(np.uint8)
    hard = cv2.erode(hard, np.ones((3, 3), np.uint8), iterations=1)
    alpha = cv2.GaussianBlur(hard.astype(np.float32), (0, 0), 1.1)
    rgba = np.dstack([a.astype(np.uint8), (np.clip(alpha, 0, 1) * 255).astype(np.uint8)])
    img = Image.fromarray(rgba, "RGBA")
    img = img.crop(img.getbbox())
    return img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)


def recolor_tent(hue_shift, sat_mul, val_mul):
    """Same tent art, different canvas colour: only the fabric (olive/khaki hues) is shifted."""
    im = Image.open(os.path.join(OBJ, "tent.png")).convert("RGBA")
    a = np.asarray(im).copy()
    hsv = cv2.cvtColor(a[..., :3], cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    h, s, v = hsv[..., 0] * 360 / 255, hsv[..., 1], hsv[..., 2]
    fabric = ((h > 33) & (h < 75) & (s > 40) & (v > 60)).astype(np.float32)
    fabric = cv2.GaussianBlur(fabric, (0, 0), 1.2)
    h2 = (h + hue_shift) % 360
    s2 = np.clip(s * sat_mul, 0, 255)
    v2 = np.clip(v * val_mul, 0, 255)
    out = np.dstack([h2 * 255 / 360, s2, v2]).astype(np.uint8)
    rgb2 = cv2.cvtColor(out, cv2.COLOR_HSV2RGB_FULL).astype(np.float32)
    rgb = a[..., :3].astype(np.float32) * (1 - fabric[..., None]) + rgb2 * fabric[..., None]
    a[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    img = Image.fromarray(a, "RGBA")
    return img.resize((img.width // 2, img.height // 2), Image.LANCZOS)


INK = (43, 27, 15, 255)
WOOD = [(150, 98, 52), (128, 82, 42), (170, 115, 64)]


def plank(d, box, base, lw, lines=0, horizontal=True):
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, radius=lw * 2, fill=base + (255,), outline=INK, width=lw)
    dark = tuple(max(0, c - 34) for c in base) + (255,)
    for i in range(1, lines + 1):
        if horizontal:
            y = y0 + (y1 - y0) * i / (lines + 1)
            d.line([(x0 + lw * 2, y), (x1 - lw * 2, y)], fill=dark, width=max(2, lw // 2))
        else:
            x = x0 + (x1 - x0) * i / (lines + 1)
            d.line([(x, y0 + lw * 2), (x, y1 - lw * 2)], fill=dark, width=max(2, lw // 2))
    # grain flecks
    rng = np.random.default_rng(int(x0 + y0))
    if x1 - x0 < lw * 8 or y1 - y0 < lw * 8:
        return
    for _ in range(int((x1 - x0) * (y1 - y0) / 1800)):
        gx, gy = rng.uniform(x0 + lw * 3, x1 - lw * 3), rng.uniform(y0 + lw * 3, y1 - lw * 3)
        d.line([(gx, gy), (gx + rng.uniform(8, 22), gy + rng.uniform(-1, 1))], fill=dark, width=2)


def draw_table():
    """3/4-view camp table: plank top, front apron, four legs. Drawn at 4x, saved at 1x (≈2 px per world unit)."""
    S = 4
    W, H = 250 * S, 150 * S
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    lw = 4 * S
    # shadow
    d.ellipse([18 * S, 118 * S, 232 * S, 146 * S], fill=(0, 0, 0, 70))
    # back legs
    for x in (40, 200):
        plank(d, (x * S, 40 * S, (x + 12) * S, 118 * S), WOOD[1], lw)
    # top (seen from above at an angle)
    plank(d, (14 * S, 20 * S, 236 * S, 82 * S), WOOD[2], lw, lines=3)
    # front apron
    plank(d, (14 * S, 76 * S, 236 * S, 96 * S), WOOD[1], lw)
    # front legs
    for x in (26, 212):
        plank(d, (x * S, 88 * S, (x + 14) * S, 134 * S), WOOD[0], lw)
    # a lantern-less cup and a book for life
    d.rounded_rectangle([60 * S, 34 * S, 92 * S, 56 * S], radius=3 * S, fill=(196, 64, 52, 255), outline=INK, width=3 * S)
    d.line([(62 * S, 45 * S), (90 * S, 45 * S)], fill=(240, 228, 200, 255), width=2 * S)
    d.ellipse([168 * S, 36 * S, 186 * S, 52 * S], fill=(110, 140, 170, 255), outline=INK, width=3 * S)
    return im.resize((W // S, H // S), Image.LANCZOS)


def draw_bench():
    S = 4
    W, H = 230 * S, 70 * S
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    lw = 4 * S
    d.ellipse([14 * S, 50 * S, 216 * S, 68 * S], fill=(0, 0, 0, 70))
    for x in (30, 186):
        plank(d, (x * S, 26 * S, (x + 14) * S, 62 * S), WOOD[0], lw)
    plank(d, (10 * S, 10 * S, 220 * S, 34 * S), WOOD[2], lw, lines=1)
    return im.resize((W // S, H // S), Image.LANCZOS)


def draw_stool():
    """A sawn log round to sit on."""
    S = 4
    W, H = 70 * S, 70 * S
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    lw = 4 * S
    d.ellipse([6 * S, 50 * S, 64 * S, 66 * S], fill=(0, 0, 0, 70))
    d.rectangle([10 * S, 22 * S, 60 * S, 56 * S], fill=WOOD[1] + (255,))
    d.ellipse([10 * S, 46 * S, 60 * S, 62 * S], fill=WOOD[1] + (255,), outline=INK, width=lw)
    d.rectangle([10 * S + lw, 24 * S, 60 * S - lw, 54 * S], fill=WOOD[1] + (255,))
    d.line([(10 * S + lw // 2, 22 * S), (10 * S + lw // 2, 54 * S)], fill=INK, width=lw)
    d.line([(60 * S - lw // 2, 22 * S), (60 * S - lw // 2, 54 * S)], fill=INK, width=lw)
    for x in (22, 38, 50):
        d.line([(x * S, 34 * S), (x * S, 50 * S)], fill=(96, 60, 30, 255), width=2 * S)
    d.ellipse([10 * S, 12 * S, 60 * S, 32 * S], fill=(212, 170, 112, 255), outline=INK, width=lw)
    for r in (8, 15):
        d.ellipse([(35 - r) * S, (22 - r * 0.4) * S, (35 + r) * S, (22 + r * 0.4) * S], outline=(160, 112, 60, 255), width=2 * S)
    return im.resize((W // S, H // S), Image.LANCZOS)


def fence_parts():
    im = Image.open(os.path.join(OBJ, "fence_segment.png")).convert("RGBA")
    post = im.crop((36, 12, 94, 300))           # left post
    rail = im.crop((92, 78, 306, 128))          # a clean piece of the top rail, between posts
    post = post.crop(post.getbbox())
    rail = rail.crop(rail.getbbox())
    return post.resize((post.width // 2, post.height // 2), Image.LANCZOS), rail.resize((rail.width // 2, rail.height // 2), Image.LANCZOS)


def tile(path, hue=0.0, sat=1.0, val=1.0, size=512, calm=0.0):
    """One exact repeat of the painted texture (688x768 period), recoloured and made POT."""
    im = Image.open(path).convert("RGB").crop((0, 0, 688, 768))
    a = np.asarray(im)
    hsv = cv2.cvtColor(a, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    hsv[..., 0] = (hsv[..., 0] + hue * 255 / 360) % 255
    hsv[..., 1] = np.clip(hsv[..., 1] * sat, 0, 255)
    hsv[..., 2] = np.clip(hsv[..., 2] * val, 0, 255)
    out = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB_FULL).astype(np.float32)
    out = cv2.resize(out, (size, size), interpolation=cv2.INTER_AREA)
    if calm > 0:  # flatten the busy pebbles towards the base colour (packed, trodden dirt)
        base = cv2.GaussianBlur(np.tile(out, (3, 3, 1)), (0, 0), 40)[size:2 * size, size:2 * size]
        out = out * (1 - calm) + base * calm
    # seamless: blend with a half-offset copy whose middle covers the tile edges
    off = np.roll(np.roll(out, size // 2, 0), size // 2, 1)
    r = np.abs(np.linspace(-1, 1, size))
    w = np.clip((1 - np.maximum(r[None, :], r[:, None])) * 3.0, 0, 1)[..., None]
    return Image.fromarray(np.clip(out * w + off * (1 - w), 0, 255).astype(np.uint8))


def main():
    B1, B2, HU = f"{RAW}/belukar_objects_v1.jpg", f"{RAW}/belukar_objects_v2.jpg", f"{RAW}/hutan_objects_v1.jpg"
    frames = {
        "berry_bush": cutout(B1, (135, 171, 555, 484), 0.28),
        "bush": cutout(B1, (853, 171, 556, 485), 0.28),
        "fern2": cutout(B1, (829, 891, 638, 582), 0.22),
        "grass_tuft": cutout(B2, (65, 816, 290, 194), 0.42),
        "flowers": cutout(B2, (463, 829, 228, 180), 0.42),
        "boulder": cutout(HU, (87, 118, 419, 393), 0.34),
        "rocks_moss": cutout(HU, (640, 253, 327, 233), 0.34),
        "stump2": cutout(HU, (76, 721, 422, 393), 0.26),
        "tent_nisa": recolor_tent(0, 1.0, 1.0),
        "tent_boys": recolor_tent(150, 0.75, 1.0),     # slate blue canvas
        "tent_girls": recolor_tent(-40, 1.05, 1.08),   # warm terracotta canvas
        "table": draw_table(),
        "bench": draw_bench(),
        "stool": draw_stool(),
    }
    post, rail = fence_parts()
    frames["fence_post"] = post
    frames["fence_rail"] = rail
    # simple shelf packer
    order = sorted(frames, key=lambda k: -frames[k].height)
    W, x, y, rowh, pos = 2048, 2, 2, 0, {}
    for k in order:
        im = frames[k]
        if x + im.width + 2 > W:
            x, y, rowh = 2, y + rowh + 2, 0
        pos[k] = (x, y)
        x += im.width + 2
        rowh = max(rowh, im.height)
    H = 1
    while H < y + rowh + 2:
        H *= 2
    atlas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    meta = {"frames": {}, "meta": {"image": "camp2.png", "size": {"w": W, "h": H}, "scale": "1"}}
    for k, (px, py) in pos.items():
        im = frames[k]
        atlas.alpha_composite(im, (px, py))
        meta["frames"][k] = {"frame": {"x": px, "y": py, "w": im.width, "h": im.height}, "rotated": False, "trimmed": False,
                             "spriteSourceSize": {"x": 0, "y": 0, "w": im.width, "h": im.height}, "sourceSize": {"w": im.width, "h": im.height}}
    atlas.save(os.path.join(OUT, "camp2.png"), optimize=True)
    json.dump(meta, open(os.path.join(OUT, "camp2.json"), "w"), indent=1)
    tile(f"{RAW}/tex_grass_v1.jpg", hue=-62, sat=0.62, val=0.86).save(os.path.join(OUT, "ground_grass.jpg"), quality=88)
    tile(f"{RAW}/tex_dirt_v1.jpg", hue=6, sat=0.8, val=1.2, calm=0.55).save(os.path.join(OUT, "ground_dirt.jpg"), quality=88)
    print("atlas", W, H, {k: frames[k].size for k in frames})
    if PREVIEW:
        bg = Image.new("RGBA", atlas.size, (60, 90, 60, 255))
        bg.alpha_composite(atlas)
        bg.convert("RGB").save(PREVIEW)


if __name__ == "__main__":
    main()
