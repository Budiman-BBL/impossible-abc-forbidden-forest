# Sprint 1 — Asas repo dan gelung teras

**Goal (plan):** repo ready, and the v2 campfire loop running in Phaser in the browser.
**Scope (plan):** Vite + TypeScript + Phaser, GitHub Actions CI, scenes Boot/Preload/Game, existing assets as an atlas, fire and light logic from v2, `balance.json`.
**Dates:** 15 Nov 2026.

## Delivered
- Scenes Boot, Preload, Game, plus UI (HUD) scene.
- Fire/light/world logic ported; `balance.json`, `characters.json`.
- Interim atlas; legacy v1/v2 in `legacy/`; reference sheets in `docs/art-reference/`.
- CI (typecheck, lint, unit, build, e2e) and GitHub Pages deploy.

## Exit criteria
| Criterion | Status | Evidence |
|---|---|---|
| CI green | see GitHub Actions badge/run | `.github/workflows/ci.yml` |
| Unit tests of fire formula pass with the same values as v2 | Pass | `tests/unit/campfire.test.ts` compares against `legacy/kem-api-unggun-v2.html` |
| Opens in Chrome Android without errors | Pass in emulation (Pixel 7 landscape, Playwright); **real phone not yet tested by Budiman** | `tests/e2e/smoke.spec.ts` |

## Not in Sprint 1 (by plan)
Menu, CharacterSelect, joystick, inventory, day/night, save, monsters, followers, audio, Android packaging.

## Known issues
- Interim sprites (old style, single pose, ground tile seams, stray line above the fire sprite).
- On narrow phones `Scale.FIT` leaves black side bars (e.g. 20:9 screens). Consider `Scale.EXPAND` in Sprint 2.
- Headless software rendering runs at ~27 fps; real-device fps not measured yet.
