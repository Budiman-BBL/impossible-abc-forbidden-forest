# 2D Storybook style test (branch `poc-2d-storybook`)

Status: **proof of concept**, not merged. Direction change after the 3D PoC: Budiman picked a 2D
storybook / graphic-novel look like his reference video (`anim_ref_20261116.mp4`). The existing 2D game
(`/`, `com.budimanbbl.impossibleabc`) and the 3D PoC (branch `poc-3d`) are untouched.
Separate web entry `storybook/` (→ `/storybook/` on Pages after a merge) and separate app
`com.budimanbbl.impossibleabc.storybook` ("ABC Storybook PoC").

## Perspective: 3/4 top-down painted forest, free follow camera
The video is a side-on cinematic (camera behind/in front of Affan on a single path). A pure side-on or
pseudo-depth single path would lock movement to one line, which fights a free joystick. A 3/4 top-down
view keeps the video's ingredients — front, back and side views of Affan, a dirt path, big trees with
roots, campfire, fog, fireflies, red eyes — while letting him roam in any direction. Sprites are drawn
upright (y-sorted), the ground is painted top-down; trees in front of Affan fade so he stays visible.

## What is in the slice
- Joystick (floating, left half) + keyboard (WASD/arrows, E/Space). Eased start/stop (exponential
  velocity smoothing), eased camera follow with a small look-ahead, facing changes with a 70 ms hold
  and a 120 ms cross-fade (left↔right: squash-flip).
- **Affan cut-out puppet**: front / back / side views cut into torso, arms and legs; walk cycle (side: leg
  and arm swing with a far leg; front/back: alternating step-lift, arm swing), body bob, idle breathing,
  squash on start/stop, a separate pick-up pose sprite.
- Quest panel (parchment, serif): **Kumpul kayu (0/5)**, **Cari batu (0/2)**, **Hidupkan unggun api**;
  "+1 Kayu" / "+1 Batu" floaters; logs respawn after 30 s.
- Campfire: unlit stone ring → lit with 5 wood + 2 stones; then GameCore runs the real fire (fuel decay,
  light radius `campLightR`, "Masuk kayu" feeds via `GameCore.feed`, game over when it goes out).
- Darkness: half-res render texture erased by the GameCore light sources + a soft moonlight circle around
  Affan; warm additive glow at the fire.
- "Hari 1" ribbon drops from the top; 4 hearts (CFG.CHAR_HP); low rolling fog band; drifting fireflies;
  red eyes in the dark (GameCore eyes) and in the twisted tree's roots; after the fire is lit a **wolf**
  emerges from the roots with a camera shake, stalks to the edge of the firelight and retreats (no combat).

## Assets and licences
| Asset | Method | Licence / ownership |
|---|---|---|
| Affan turnaround, pick-up pose, side leg piece | Grok Bot GenerateImage, refs: video frames + style sheet v2 | AI-generated for Budiman's project |
| Trees, props, ground textures, flames, wolf, UI kit (hearts, ribbon, panel, hand button) | same | same |
| Chroma key, cut-out, puppet parts, atlas packing | `tools/storybook/*.py` (numpy, scipy, OpenCV, Pillow) | our code (MIT/BSD/Apache tool deps) |
| Light brush, glow, fog, firefly textures | drawn at runtime (canvas gradients) | our code |
| Phaser 3.90 | — | MIT |

Sources are kept in `assets/storybook-src/gen/`. Atlas: one 2048×1024 PNG (all sprites), + 512² grass tile
and 512² dirt decal. No external/third-party art.

## Budgets (headless SwiftShader, CPU — not representative of a phone GPU)
| viewport | avg fps | canvas | textures | JS heap |
|---|---|---|---|---|
| 914×411 @2.625 (DPR cap 2) | 29 | 1828×822 | 21 | 71 MB |
| 914×411 `?dpr=1` | 60 | 914×411 | 21 | 64 MB |

DPR cap 2 (web `?dpr=` override); ~240 game objects, single atlas so sprites batch.

## Honest gaps
- Puppet animation, not hand-drawn frames: the walk is smooth but "paper cut-out"; front/back legs step
  rather than swing; arms are rigid; no head turn. AI frame-by-frame sheets were not used because separate
  generations do not stay consistent frame to frame.
- The side leg piece was generated separately, so its boot is slightly smaller and cleaner than the
  turnaround's; the side torso area behind the arm is inpainted.
- Pick-up uses one side pose for every facing; no carry-a-log pose; no turn-around animation like the video.
- 3/4 top-down ground with upright sprites: perspective is stylised, not the video's camera-behind framing.
- Wolf is a single sprite (slides, no walk cycle). Hearts are static (no damage yet).
- No audio, no title card, no save.

## Build / run
```bash
npm run dev                          # 2D at /, storybook at /storybook/
ABC_TARGET=storybook npm run build   # storybook only -> dist-storybook/
ABC_TARGET=2d npm run build          # 2D only (used by the 2D APK workflow)
CAP_TARGET=storybook ABC_TARGET=storybook npm run build && CAP_TARGET=storybook npx cap sync android
```
CI: `.github/workflows/android-storybook.yml` builds the signed APK on pushes to `poc-2d-storybook`;
tags `storybook-v*` publish a GitHub pre-release.
