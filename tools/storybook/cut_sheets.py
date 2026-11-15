import sys; sys.path.insert(0, __import__('os').path.dirname(__file__))
from key import *
for name in ['props', 'trees', 'ui', 'flames', 'wolf', 'pickup', 'affan_turn']:
    rgba, bg = key(f'gen/{name}.jpg')
    comps = components(rgba, merge=10 if name in ('props','ui') else 4)
    print(name, bg.astype(int), [(x, y, c.shape[:2]) for x, y, c in comps])
    for i, (x, y, c) in enumerate(comps): save(c, f'cut/{name}_{i}.png')
