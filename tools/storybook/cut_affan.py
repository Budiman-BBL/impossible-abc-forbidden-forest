import numpy as np, cv2, json
from PIL import Image, ImageDraw
S = 0.5  # output scale
def poly_mask(shape, pts):
    im = Image.new('L', (shape[1], shape[0]), 0); ImageDraw.Draw(im).polygon(pts, fill=255)
    return np.array(im) > 0
views = {
  'front': dict(src='cut/affan_turn_0.png', hem=486, split=122,
      arms=[[(14,282),(58,282),(56,380),(48,448),(0,448),(0,330)], [(186,282),(232,282),(244,330),(244,448),(196,448),(188,380)]],
      armPivot=[(38,282),(208,282)]),
  'back': dict(src='cut/affan_turn_2.png', hem=490, split=122,
      arms=[[(6,288),(50,288),(52,380),(48,445),(0,445),(0,330)], [(192,288),(238,288),(243,330),(243,445),(196,445),(192,380)]],
      armPivot=[(28,288),(214,288)]),
  'side': dict(src='cut/affan_turn_1.png', hem=480, split=None,
      arms=[[(96,288),(152,288),(152,392),(150,442),(98,442),(94,392)]], armPivot=[(124,280)]),
}
meta = {}
for name, v in views.items():
    im = np.array(Image.open(v['src']).convert('RGBA')); h, w = im.shape[:2]
    feet = (w / 2, h - 4)
    parts = {}
    a = im[..., 3] > 0
    armmasks = [poly_mask(im.shape, p) & a for p in v['arms']]
    hem = v['hem']; yy = np.arange(h)[:, None] * np.ones((1, w))
    xx = np.ones((h, 1)) * np.arange(w)[None, :]
    legzone = (yy >= hem - 8)
    if v['split']:
        legs = [legzone & (xx < v['split']) & a, legzone & (xx >= v['split']) & a]
    else:
        legs = [legzone & a]
    torso = im.copy()
    for m in armmasks:
        if name == 'side':
            rgb = cv2.inpaint(torso[..., :3].copy(), (cv2.dilate(m.astype(np.uint8), np.ones((3, 3)))) * 255, 6, cv2.INPAINT_TELEA)
            torso[..., :3] = np.where(m[..., None], rgb, torso[..., :3])
            # darken the inpainted patch slightly so it reads as the body behind the arm
            torso[..., :3] = np.where(m[..., None], (torso[..., :3] * 0.85).astype(np.uint8), torso[..., :3])
        else:
            torso[..., 3] = np.where(m, 0, torso[..., 3])
    torso[..., 3] = np.where(yy >= hem, 0, torso[..., 3])
    def emit(key, mask, pivot):
        p = im.copy(); p[..., 3] = np.where(mask, p[..., 3], 0) if mask is not None else p[..., 3]
        ys, xs = np.nonzero(p[..., 3] > 4)
        x0, y0, x1, y1 = xs.min() - 2, ys.min() - 2, xs.max() + 3, ys.max() + 3
        x0, y0 = max(x0, 0), max(y0, 0)
        crop = Image.fromarray(p[y0:y1, x0:x1]); crop = crop.resize((max(1, round(crop.width * S)), max(1, round(crop.height * S))), Image.LANCZOS)
        crop.save(f'parts/affan_{name}_{key}.png')
        parts[key] = dict(ox=(pivot[0] - x0) / (x1 - x0), oy=(pivot[1] - y0) / (y1 - y0), x=(pivot[0] - feet[0]) * S, y=(pivot[1] - feet[1]) * S)
    # torso: use the edited torso image
    tmp = im; im = torso; emit('torso', None, (w / 2, hem)); im = tmp
    for i, m in enumerate(armmasks): emit(f'arm{i}', m, v['armPivot'][i])
    for i, m in enumerate(legs):
        ys, xs = np.nonzero(m); emit(f'leg{i}', m, (xs.mean(), hem - 8))
    meta[name] = parts
# pick-up pose (whole sprite), feet at bottom centre of the boots
pk = Image.open('cut/pickup_0.png'); pk = pk.resize((round(pk.width * S * 0.86), round(pk.height * S * 0.86)), Image.LANCZOS); pk.save('parts/affan_pickup.png')
meta['pickup'] = dict(ox=0.62, oy=0.98)
json.dump(meta, open('parts/affan_rig.json', 'w'), indent=1)
print(json.dumps(meta)[:600])
