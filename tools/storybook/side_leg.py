import sys, json; sys.path.insert(0, __import__('os').path.dirname(__file__))
from key import *
from PIL import Image
rgba, _ = key('gen/side_parts.jpg'); comps = components(rgba, merge=4)
x, y, leg = comps[0]
im = Image.fromarray(leg); ys, xs = np.nonzero(leg[..., 3] > 8)
im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
S = 0.5; target = 186 * S
im = im.resize((round(im.width * target / im.height), round(target)), Image.LANCZOS)
im.save('parts/affan_side_leg0.png')
meta = json.load(open('parts/affan_rig.json'))
# pivot at top of shin, horizontally at shin centre (shin occupies left ~40% of the piece)
a = np.array(im)[..., 3]; top = np.nonzero(a[2] > 8)[0]
cx = (top.min() + top.max()) / 2 / im.width
hem = 480; feetY = 659 - 4
meta['side']['leg0'] = dict(ox=cx, oy=0.0, x=-4.0, y=(hem - 8 - feetY) * S)
json.dump(meta, open('parts/affan_rig.json', 'w'), indent=1)
print(im.size, cx, meta['side']['leg0'])
