# 3D PoC (branch `poc-3d`) — approach C (careful)

Status: **proof of concept**, not merged. The Phaser 2D game is unchanged in behaviour and stays the default
(web root `/`, app id `com.budimanbbl.impossibleabc`). The 3D build lives at `/3d/` and in a separate
app id `com.budimanbbl.impossibleabc.poc3d` ("ABC 3D PoC"), so both apps can be installed side by side.

## What is in it
- **P1 — shared core**: `src/core/` (campfire, light, world, rng, math, balance + new `GameCore`).
  Phaser `GameScene` and the three.js game both drive the same `GameCore` and only render its events.
  Old import paths (`src/systems/*`, `src/utils/*`, `src/data/balance.ts`) are re-export shims, so the
  original 14 unit tests run unchanged. 5 new core tests (19 total).
- **P2 — three.js build** (`3d/index.html`, `src/three/`): seeded forest (64 trees, 3 camps, rocks,
  bushes, tents as InstancedMesh), campfire with real light radius (same `clamp(1-d/r)` rule as the core,
  injected via `onBeforeCompile`) and darkness, chop trees (+2 kayu, stump, respawn), feed fire,
  fire upgrades, red eyes in the dark, v2 parchment DOM HUD (Tebang / Masuk kayu / Naik taraf),
  virtual joystick, drag-orbit camera, pinch/wheel zoom. Keyboard: WASD, Shift run, E chop, F feed, U upgrade.
- **Character**: Budiman's own character from `charsheet/budiman_character_ref_v1.jpg`.

## Mobile budget (measured, see below)
DPR cap 1.5 (`?dpr=` override on web), no real-time shadows (blob shadow), fog, WebGL2 renderer,
textures ≤1024, ~19–23 draw calls, ~22k triangles total, character 11,416 tris / one 1024² JPEG.

| Headless (SwiftShader CPU, 8 cores) | avg fps | draw calls | tris | JS heap |
|---|---|---|---|---|
| phone 914×411 @2.625 → DPR 1.5 | 21.8 | 23 | 22.5k | 10.4 MB |
| phone 914×411, `?dpr=1` | 35.8 | 23 | 22.5k | 21.6 MB* |
| desktop 1280×720 @1 | 19.7 | 19 | 21.7k | 11.2 MB |

Software rendering is CPU-bound and **not** representative of a phone GPU; real-phone numbers come
from the on-screen stats line (top-right). *heap varies with GC timing.

## Character creation method
1. Front/side/back views cropped from the reference sheet; background removed with rembg (MIT; u2net weights Apache-2.0).
2. Image → mesh with **TripoSR** (MIT; weights MIT) on CPU.
3. **Blender 4.2** (GPL tool — outputs are ours, not GPL): decimate/clean, manual cap brim, Smart-UV,
   texture baked by projecting the front/side/back reference views (Cycles emit bake) into a 1024² albedo.
4. Custom humanoid armature (`DEF-*` bones), automatic weights, exported GLB (`src/three/assets/budiman.glb`).
5. Animations: **Quaternius Universal Animation Library** (CC0), trimmed with gltf-transform (MIT),
   retargeted at load time in `src/three/retarget.ts` (world-space rest-pose retarget).
Scripts: `tools/character-3d/` (paths are local to the build box).

Likeness (honest): recognisable outfit — orange cap with brim, goatee, denim jacket with rolled sleeves,
white graphic tee, dark ripped jeans, brown/white sneakers, brown leather backpack. Weak: face is low-detail,
side/inner-leg projection smears, backpack sides stretched, no wristwatch detail, auto-weights deform the
shoulders a little. It is a scanned-from-sheet PoC, not a hand-made production model.

## Reused third-party code / assets
| Item | License | Used for |
|---|---|---|
| three.js 0.187 | MIT | renderer |
| norio/vrm-game-starter (BVHEcctrl joystick idea/code) | MIT | `src/three/joystick.ts` (header attribution) |
| Quaternius UAL animations | CC0 | `ual-anims.glb` |
| TripoSR | MIT | image→mesh (tool) |
| rembg / u2net | MIT / Apache-2.0 | background removal (tool) |
| Blender | GPL-3 (tool only) | modelling, bake, rig |
| gltf-transform | MIT | animation trimming (tool) |

## Build / run
```bash
npm run dev                      # 2D at /, 3D at /3d/
ABC_TARGET=2d npm run build      # 2D only -> dist/
ABC_TARGET=3d npm run build      # 3D only -> dist-3d/
npm run build                    # both (dist/ + dist/3d/) — what Pages deploys from main
CAP_TARGET=poc3d ABC_TARGET=3d npm run build && CAP_TARGET=poc3d npx cap sync android   # 3D APK project in android-poc3d/
```
CI: `.github/workflows/android-poc3d.yml` builds the signed 3D APK on pushes to `poc-3d`; tags `poc3d-v*`
publish a GitHub **pre-release**. The 2D `android.yml` now builds `ABC_TARGET=2d` so the 2D APK does not carry the 3D files.

## Known gaps
No critters/NPCs/combat, no tree sway, no real shadows, simple low-poly props, no audio in 3D,
no save/load, character face detail low, likeness moderate. `/3d/` on GitHub Pages goes live only when
the PR is merged (the `github-pages` environment only allows `main`).
