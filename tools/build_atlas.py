#!/usr/bin/env python3
"""Pack the interim v2 sprites into one texture atlas (Phaser JSON-hash format).

Input : assets/sprites/interim-v2/*.png + sprite_meta.json (foot anchors ax/ay)
Output: public/atlases/interim-v2.png, public/atlases/interim-v2.json
        public/atlases/ground_tile_interim.png (kept separate so it can tile)

The foot anchor of every sprite is written as the frame "anchor" (normalised 0..1),
which Phaser uses as the default origin. Requires Pillow. Deterministic output.
"""
import json
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "sprites", "interim-v2")
OUT = os.path.join(ROOT, "public", "atlases")
PAD = 2
MAX_W = 1024
SEPARATE = {"ground_tile"}


def main() -> None:
    meta = json.load(open(os.path.join(SRC, "sprite_meta.json")))["sprites"]
    os.makedirs(OUT, exist_ok=True)
    names = sorted(n[:-4] for n in os.listdir(SRC) if n.endswith(".png"))
    imgs = {}
    for n in names:
        im = Image.open(os.path.join(SRC, n + ".png")).convert("RGBA")
        if n in SEPARATE:
            im.save(os.path.join(OUT, n + "_interim.png"), optimize=True)
            continue
        imgs[n] = im
    # Shelf packing, tallest first.
    order = sorted(imgs, key=lambda k: (-imgs[k].height, k))
    x = y = shelf_h = 0
    pos = {}
    for n in order:
        w, h = imgs[n].size
        if x + w + PAD > MAX_W:
            x, y, shelf_h = 0, y + shelf_h + PAD, 0
        pos[n] = (x, y)
        x += w + PAD
        shelf_h = max(shelf_h, h)
    height = y + shelf_h
    sheet = Image.new("RGBA", (MAX_W, height), (0, 0, 0, 0))
    frames = {}
    for n in sorted(pos):
        im = imgs[n]
        px, py = pos[n]
        sheet.paste(im, (px, py))
        w, h = im.size
        m = meta.get(n, {})
        ax = m.get("ax", w / 2)
        ay = m.get("ay", h)
        frames[n] = {
            "frame": {"x": px, "y": py, "w": w, "h": h},
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h},
            "sourceSize": {"w": w, "h": h},
            "anchor": {"x": round(ax / w, 4), "y": round(ay / h, 4)},
        }
    sheet.save(os.path.join(OUT, "interim-v2.png"), optimize=True)
    atlas = {
        "frames": frames,
        "meta": {
            "app": "tools/build_atlas.py",
            "image": "interim-v2.png",
            "format": "RGBA8888",
            "size": {"w": MAX_W, "h": height},
            "scale": "1",
            "note": "INTERIM sprites from legacy prototype v2; will be replaced by official style v2 art.",
        },
    }
    with open(os.path.join(OUT, "interim-v2.json"), "w") as f:
        json.dump(atlas, f, indent=1, sort_keys=True)
        f.write("\n")
    print(f"packed {len(frames)} frames into {MAX_W}x{height}")


if __name__ == "__main__":
    main()
