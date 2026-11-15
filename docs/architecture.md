# Architecture (Sprint 1)

```
Boot ──► Preload ──► Game ══ UI (parallel HUD scene)
         atlas,       world,   reads registry "hud",
         light        fire,    emits ui:upgrade / ui:recenter / ui:restart
         textures     input
```
Menu and CharacterSelect scenes come in Sprint 2 (not created yet, on purpose).

- **Rendering:** Phaser WebGL (Canvas fallback), base 1280×720, `Scale.FIT`, centred. World is 2400×2400 v2 units, camera zoom = 2 × player zoom (0.55–1.6).
- **Pure logic (no Phaser):** `systems/campfire.ts`, `systems/light.ts`, `systems/world.ts`, `utils/*`. Unit-tested in Node.
- **Data:** `data/balance.json`, `data/characters.json` (typed wrappers in `.ts`).
- **Scene communication:** Game → UI via `registry.set("hud", …)` each frame and `toast` / `gameover` events; UI → Game via events on the UI scene.
- **Lighting:** half-res RenderTexture filled with night colour (0.93 alpha); each light erases a radial brush; additive glow sprites in world space.
- **Testing hooks:** `window.__ABC__` (version, ready, fire state, seed, helpers) for Playwright.
- **Build:** Vite, `base: "./"`, Phaser split into its own chunk. CI deploys `dist/` to GitHub Pages.
