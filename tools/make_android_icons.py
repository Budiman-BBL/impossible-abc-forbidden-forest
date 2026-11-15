#!/usr/bin/env python3
"""Generate the Android launcher icons and splash images (INTERIM art) from the interim
fire sprite on the parchment/ink palette of style sheet v2. Re-run after `npx cap add android`
or when the official app icon art exists. Requires Pillow."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
FIRE = Image.open(os.path.join(ROOT, "assets", "sprites", "interim-v2", "fire_burning.png")).convert("RGBA")
INK = (26, 15, 8, 255)
PARCH = (240, 198, 154, 255)
NIGHT = (13, 8, 6, 255)

DENS = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def fire_fit(box: int) -> Image.Image:
    f = FIRE.copy()
    f.thumbnail((box, box), Image.LANCZOS)
    return f


def badge(size: int, round_: bool) -> Image.Image:
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = max(1, size // 24)
    w = max(2, size // 16)
    if round_:
        d.ellipse([pad, pad, size - pad, size - pad], fill=PARCH, outline=INK, width=w)
    else:
        d.rounded_rectangle([pad, pad, size - pad, size - pad], radius=size // 5, fill=PARCH, outline=INK, width=w)
    f = fire_fit(int(size * 0.62))
    im.alpha_composite(f, ((size - f.width) // 2, (size - f.height) // 2))
    return im


def main() -> None:
    for name, k in DENS.items():
        folder = os.path.join(RES, f"mipmap-{name}")
        legacy = int(48 * k)
        badge(legacy, False).save(os.path.join(folder, "ic_launcher.png"))
        badge(legacy, True).save(os.path.join(folder, "ic_launcher_round.png"))
        fg_size = int(108 * k)
        fg = Image.new("RGBA", (fg_size, fg_size), (0, 0, 0, 0))
        f = fire_fit(int(fg_size * 0.5))  # adaptive icon safe zone = inner 66 dp
        fg.alpha_composite(f, ((fg_size - f.width) // 2, (fg_size - f.height) // 2))
        fg.save(os.path.join(folder, "ic_launcher_foreground.png"))
    with open(os.path.join(RES, "values", "ic_launcher_background.xml"), "w") as fh:
        fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#F0C69A</color>\n</resources>\n')
    for root, _dirs, files in os.walk(RES):
        if "splash.png" in files:
            p = os.path.join(root, "splash.png")
            w, h = Image.open(p).size
            s = Image.new("RGBA", (w, h), NIGHT)
            f = fire_fit(int(min(w, h) * 0.28))
            s.alpha_composite(f, ((w - f.width) // 2, (h - f.height) // 2))
            s.convert("RGB").save(p, optimize=True)
    print("icons and splash written")


if __name__ == "__main__":
    main()
