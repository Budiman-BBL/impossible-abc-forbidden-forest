# Storybook PoC asset pipeline

Source art: `assets/storybook-src/gen/*.jpg` — AI-generated (Grok Bot GenerateImage) from frames of
Budiman's reference video and the official style sheet v2, on a flat magenta background.

Run from a scratch folder that contains `gen/` (copy `assets/storybook-src/gen`), with Python 3 +
numpy, scipy, opencv-python-headless and Pillow:

```bash
mkdir -p cut parts
python tools/storybook/cut_sheets.py   # chroma-key (Lab distance + magenta-spill guard, colour unmixing) and split sheets into sprites -> cut/
python tools/storybook/cut_affan.py    # cut Affan's turnaround into puppet parts (torso / arms / legs per view) + pick-up pose -> parts/
python tools/storybook/side_leg.py     # side-view single leg from affan_side_parts / side_parts.jpg
python tools/storybook/build_assets.py src/storybook/assets   # pack the 2048x1024 atlas, grass tile, dirt decal
```
Part coordinates in `cut_affan.py` are hand-picked for these exact source images.
