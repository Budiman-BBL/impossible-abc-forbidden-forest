"""Pack the Sprint 1 camp art into one atlas (Phaser JSON hash): the 16 camp cut-outs from
/workspace/abc_game/camp_assets_v1/objects (0.5x) Cikgu Nisa's two layers and the wolf views/poses (/workspace/abc_game/charsheet/wolf/cut_v1) from
/workspace/abc_game/charsheet/cikgu_nisa/rig_v1. Also writes the title-card background (camp environment)."""
import json, os, sys, numpy as np, cv2
from PIL import Image
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'storybook', 'assets')
CAMP = '/workspace/abc_game/camp_assets_v1'
NISA = '/workspace/abc_game/charsheet/cikgu_nisa/rig_v1'
frames = {}
for f in sorted(os.listdir(f'{CAMP}/objects')):
    if f.endswith('.png'):
        im = Image.open(f'{CAMP}/objects/{f}').convert('RGBA')
        frames[f[:-4]] = im.resize((round(im.width * 0.5), round(im.height * 0.5)), Image.LANCZOS)
meta = json.load(open(f'{NISA}/nisa_meta.json'))
body = Image.open(f'{NISA}/nisa_body.png').convert('RGBA')
head = Image.open(f'{NISA}/nisa_head.png').convert('RGBA')
a = np.array(head)[..., 3]; rows = np.where(a.max(1) > 0)[0]; hb = int(rows.max()) + 2
WOLF = '/workspace/abc_game/charsheet/wolf/cut_v1'
for n in ['side', 'front', 'back', 'growl', 'lunge', 'flinch']:
    frames[f'wolf_{n}'] = Image.open(f'{WOLF}/wolf_{n}.png').convert('RGBA')
frames['nisa_body'] = body; frames['nisa_head'] = head.crop((0, 0, head.width, hb))
items = sorted(frames.items(), key=lambda kv: -kv[1].height)
W = 2048; x = y = rowh = 0; pos = {}; PAD = 2
for k, im in items:
    if x + im.width + PAD > W: x = 0; y += rowh + PAD; rowh = 0
    pos[k] = (x, y); x += im.width + PAD; rowh = max(rowh, im.height)
H = y + rowh; H2 = 1 << (H - 1).bit_length(); assert H2 <= 2048, H
atlas = Image.new('RGBA', (W, H2))
js = {'frames': {}, 'meta': {'image': 'camp.png', 'size': {'w': W, 'h': H2}, 'scale': '1'}}
for k, im in frames.items():
    px, py = pos[k]; atlas.paste(im, (px, py))
    js['frames'][k] = {'frame': {'x': px, 'y': py, 'w': im.width, 'h': im.height}, 'rotated': False, 'trimmed': False,
                       'spriteSourceSize': {'x': 0, 'y': 0, 'w': im.width, 'h': im.height}, 'sourceSize': {'w': im.width, 'h': im.height}}
arr = np.array(atlas); al = arr[..., 3]
arr[..., :3] = np.where((al == 0)[..., None], cv2.dilate(arr[..., :3], np.ones((5, 5), np.uint8)), arr[..., :3])
Image.fromarray(arr).save(f'{OUT}/camp.png', optimize=True)
json.dump(js, open(f'{OUT}/camp.json', 'w'))
json.dump({'height': meta['height'], 'neck': meta['neck'], 'headH': hb}, open(f'{OUT}/nisa.json', 'w'))
Image.open(f'{CAMP}/camp_environment_v1.png').convert('RGB').resize((1280, 720), Image.LANCZOS).save(f'{OUT}/camp_title.jpg', quality=84)
print('atlas', W, H2, len(frames))
