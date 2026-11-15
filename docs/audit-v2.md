# Audit of HTML prototype v2 (summary)

Full audit and plan (approved 15 Nov 2026): Page "Impossible ABC: The Forbidden Forest — Audit & Pelan v1.0".

- File: `legacy/kem-api-unggun-v2.html` (1.23 MB; ~81 KB code / ~2,400 lines, rest = 31 base64 images).
- Genre mismatch: v2 is a tap-to-command strategy game in portrait; the project wants a landscape adventure with a controlled character, inventory and crafting. Decision: migrate to Phaser, carry over the good parts.

## Carried over in Sprint 1
| v2 part | Where now |
|---|---|
| `CFG` balance values (30) + inline constants | `src/data/balance.json` |
| `decayMul`, `mainLightMax`, `mainLightR`, `campLightR`, `feedFire`, `doUpgrade`, fuel update | `src/systems/campfire.ts` (tested against v2) |
| `lightAt`, `isLit` | `src/systems/light.ts` |
| `mulberry32`, `newWorld` layout | `src/utils/rng.ts`, `src/systems/world.ts` (same rng order) |
| 31 sprites + `sprite_meta.json` | `assets/sprites/interim-v2/` → `public/atlases/interim-v2.*` |
| Darkness with radial holes + warm glow | `GameScene.drawLighting` |
| Red eyes in the dark | `GameScene.updateEyes` / `drawLighting` |
| Camera drag / pinch, zoom 0.55×–1.6× | `GameScene.setupInput` |

## Not carried over yet
Worker/guard/Hannan AI, boars and Raja Babi Hutan, torch and magic, side camps, win condition, fireflies, audio, HTML overlays (replaced by the Phaser HUD).

## Technical debt still open
Interim sprites: single pose, low resolution, cream fringe, ground tile seams, old style. No save. Performance on a real low-end Android phone not measured yet.
