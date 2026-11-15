"""Pack the cut storybook sprites into one atlas (<=2048) + ground textures for the Phaser storybook PoC."""
import json, os, sys, numpy as np, cv2
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else '/workspace/repos/impossible-abc-forbidden-forest/src/storybook/assets'
os.makedirs(OUT, exist_ok=True)
C = 'cut'; P = 'parts'
def L(p, s=1.0):
    im = Image.open(p).convert('RGBA')
    return im if s == 1 else im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
frames = {
  'tree_oak': L(f'{C}/trees_0.png', 0.8), 'tree_pine1': L(f'{C}/trees_1.png', 0.8), 'tree_pine2': L(f'{C}/trees_2.png', 0.8), 'tree_twisted': L(f'{C}/trees_3.png', 0.8),
  'log': L(f'{C}/props_0.png', 0.5), 'sticks': L(f'{C}/props_1.png', 0.5), 'rocks_cluster': L(f'{C}/props_2.png', 0.6), 'rock_big': L(f'{C}/props_3.png', 0.6),
  'campfire': L(f'{C}/props_4.png', 0.7), 'mushroom': L(f'{C}/props_5.png', 0.5), 'stone': L(f'{C}/props_6.png', 0.8),
  'bush': L(f'{C}/props_7.png', 0.55), 'fern': L(f'{C}/props_8.png', 0.5), 'stump': L(f'{C}/props_9.png', 0.5),
  'flame0': L(f'{C}/flames_0.png', 0.45), 'flame1': L(f'{C}/flames_1.png', 0.45), 'flame2': L(f'{C}/flames_2.png', 0.45),
  'wolf': L(f'{C}/wolf_0.png', 0.55),
  'heart': L(f'{C}/ui_0.png', 0.3), 'heart_empty': L(f'{C}/ui_1.png', 0.3), 'ribbon': L(f'{C}/ui_2.png', 0.8), 'panel': L(f'{C}/ui_3.png', 0.8), 'btn_hand': L(f'{C}/ui_6.png', 0.6),
  'affan_pickup': L(f'{P}/affan_pickup.png'),
}
for f in sorted(os.listdir(P)):
    if f.startswith('affan_') and f.endswith('.png') and f != 'affan_pickup.png':
        frames[f[:-4]] = L(f'{P}/{f}')
# shelf pack
items = sorted(frames.items(), key=lambda kv: -kv[1].height)
W = 2048; x = y = 0; rowh = 0; pos = {}; PAD = 2
for k, im in items:
    if x + im.width + PAD > W: x = 0; y += rowh + PAD; rowh = 0
    pos[k] = (x, y); x += im.width + PAD; rowh = max(rowh, im.height)
H = y + rowh
H2 = 1 << (H - 1).bit_length()
assert H2 <= 2048, H
atlas = Image.new('RGBA', (W, H2))
js = {'frames': {}, 'meta': {'image': 'storybook.png', 'size': {'w': W, 'h': H2}, 'scale': '1'}}
for k, im in frames.items():
    px, py = pos[k]; atlas.paste(im, (px, py))
    js['frames'][k] = {'frame': {'x': px, 'y': py, 'w': im.width, 'h': im.height}, 'rotated': False, 'trimmed': False,
                       'spriteSourceSize': {'x': 0, 'y': 0, 'w': im.width, 'h': im.height}, 'sourceSize': {'w': im.width, 'h': im.height}}
# premultiplied-safe bleed: copy edge colour into fully transparent pixels to avoid dark fringes when filtered
arr = np.array(atlas); a = arr[..., 3]
rgb = arr[..., :3].astype(np.float32)
mask = (a > 0).astype(np.uint8)
inp = cv2.inpaint(arr[..., :3], (1 - mask) * 255, 2, cv2.INPAINT_TELEA) if False else None
blur = cv2.dilate(arr[..., :3], np.ones((5, 5), np.uint8))
arr[..., :3] = np.where((a == 0)[..., None], blur, arr[..., :3])
Image.fromarray(arr).save(f'{OUT}/storybook.png', optimize=True)
json.dump(js, open(f'{OUT}/storybook.json', 'w'))
json.dump(json.load(open(f'{P}/affan_rig.json')), open(f'{OUT}/affan_rig.json', 'w'), indent=1)
print('atlas', W, H2, 'used h', H)
# ground: flatten vignette, make seamless, 512
def flatten(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    lum = a.mean(2); low = cv2.GaussianBlur(lum, (0, 0), 90)
    a = a * (lum.mean() / np.maximum(low, 1))[..., None]
    return np.clip(a, 0, 255)
def seamless(a):
    h, w = a.shape[:2]; r = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)) / (min(h, w) / 2)
    m = np.clip(d * 2.2, 0, 1)[..., None]  # 1 in centre (original), 0 at edges (rolled = seamless)
    return a * m + r * (1 - m)
g = seamless(flatten(Image.open('gen/grass.jpg')))
Image.fromarray(g.astype(np.uint8)).resize((512, 512), Image.LANCZOS).save(f'{OUT}/grass.jpg', quality=86)
# dirt patch: dirt from the path image, soft noisy round mask
dirt = flatten(Image.open('gen/ground.jpg'))[180:820, 260:760]
dirt = cv2.resize(dirt, (512, 512))
rng = np.random.default_rng(7)
noise = cv2.GaussianBlur(rng.random((512, 512)).astype(np.float32), (0, 0), 18); noise = (noise - noise.mean()) / noise.std()
yy, xx = np.mgrid[0:512, 0:512]; rr = np.hypot(xx - 256, yy - 256) / 256
alpha = np.clip((0.82 - rr + noise * 0.08) / 0.22, 0, 1)
Image.fromarray(np.dstack([dirt, alpha * 255]).astype(np.uint8)).save(f'{OUT}/dirt.png', optimize=True)
for f in os.listdir(OUT): print(f, os.path.getsize(f'{OUT}/{f}'))
