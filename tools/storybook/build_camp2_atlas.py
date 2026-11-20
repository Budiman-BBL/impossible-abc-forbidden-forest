"""Camp v2 art: atlas `camp2` + seamless ground tiles.

Sources (all project art, nothing third-party):
  /workspace/abc_game/map_ref/objects_raw/  belukar_objects_v1/v2.jpg, hutan_objects_v1.jpg, tex_grass_v1.jpg, tex_dirt_v1.jpg
  /workspace/abc_game/camp_assets_v1/objects/  tent.png, fence_segment.png
Flow art (assets/storybook-src/flow_camp_v2, see flow_camp_v2.py): Nisa walk + seated, table set, stump stool,
fence states, letter-A stone.
Output: src/storybook/assets/camp2.png/json, camp2_meta.json, ground_grass.jpg, ground_dirt.jpg.
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from flow_camp_v2 import flow_frames
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
    }
    flow, flow_meta = flow_frames()
    frames.update(flow)
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
    json.dump(flow_meta, open(os.path.join(OUT, "camp2_meta.json"), "w"), indent=1)
    tile(f"{RAW}/tex_grass_v1.jpg", hue=-62, sat=0.62, val=0.86).save(os.path.join(OUT, "ground_grass.jpg"), quality=88)
    tile(f"{RAW}/tex_dirt_v1.jpg", hue=6, sat=0.8, val=1.2, calm=0.55).save(os.path.join(OUT, "ground_dirt.jpg"), quality=88)
    print("atlas", W, H, {k: frames[k].size for k in frames})
    if PREVIEW:
        bg = Image.new("RGBA", atlas.size, (60, 90, 60, 255))
        bg.alpha_composite(atlas)
        bg.convert("RGB").save(PREVIEW)


if __name__ == "__main__":
    main()
