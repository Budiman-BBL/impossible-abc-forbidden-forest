# Sprint 1 — The Living Camp (storybook build)

Build: `/storybook/` (Phaser), app `com.budimanbbl.impossibleabc.storybook`, version 0.5.0-sprint1.
Spec: World & UI Design v1.0 + Kitab Cerita v1.1 (Hari 1 / Bab 1).

## Structure
- `src/core/camp/` — renderer-free rules: `config.ts` (all tuning numbers), `layout.ts` (seeded camp map, fixed lantern slots),
  `clock.ts` (siang 170 s / petang 60 s / malam 180 s → pagi), `sim.ts` (CampSim: fire, carry/storage, Bina, wolves, hearts, outcome),
  `save.ts` (SaveDataV1 shape, written to `localStorage["impossibleabc.save.v1"]` on phase change and win; loading comes later).
- `src/storybook/CampScene.ts` renders the world; `CampHud.ts` is the UI overlay scene; `nisa.ts`, `wolfSprite.ts`, `affan.ts` are characters.
- Art: camp objects from `camp_assets_v1`, Cikgu Nisa and wolf cut from their turnarounds (`tools/storybook/build_camp_atlas.py`).

## Rules (Hari 1)
- First fire: 5 Kayu + 2 Batu. Feed with Kayu (from the bag or the storage rack). Fire burns faster at night; radius shrinks with fuel.
- Naik taraf unggun: 3 Batu → slower burn, bigger light. Pagar: visible, locked until Sprint 2.
- Wolves arrive at malam, stay outside the light, chase in the dark, bite = −1 heart and retreat; pushed out by growing light (flinch).
- Beri heals 1 heart. 0 hearts = "Affan pengsan…" (Cuba lagi). Reaching pagi = win.

## Placeholders (not final)
Peta button (toast), ABC 0/13 counter, locked fence, 4 empty lantern slots, no audio.

## Test hooks
`window.__ABC_SB__` (start, goTo, act, setClock, nodes, wolves, …) — used by `tests/e2e/storybook.spec.ts` and the screenshot script.
