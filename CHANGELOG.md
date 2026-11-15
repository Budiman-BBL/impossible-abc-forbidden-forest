# Changelog

All notable changes to this project. Dates are Malaysia time (MYT, UTC+8).

## [0.2.0] — 2026-11-15 — first Android APK

### Fixed
- **Game was small on phones.** v0.1 rendered a fixed 1280×720 (16:9) canvas scaled with `Scale.FIT`: on a 20:9 phone
  (2400×1080, DPR 2.625 → 914×411 CSS px) that left black bars at the sides, the browser bars shrank it further
  (e.g. 631×355 CSS px), the HUD shrank to ~57 % (text ~8–11 CSS px) and the canvas was blurry (1280×720 backing store
  stretched over ~2400×1080 physical px).
- Now the game always uses the full screen: canvas backing store = screen CSS size × DPR (capped at 2), shown at CSS size;
  the camera keeps the same world height and shows more forest on wider screens; the HUD is anchored to the screen
  corners and scaled so the smallest button is ≥ 51 dp on phones; everything re-lays out on rotation/resize.
- Web build on phones goes fullscreen (hides browser bars) and tries to lock landscape on the first tap.

### Added
- Capacitor 8 Android app `com.budimanbbl.impossibleabc` ("Impossible ABC"), minSdk 24 (Android 7.0), target 36.
- Landscape locked (`sensorLandscape`), immersive fullscreen (system bars hidden), screen kept on, draws under the camera cutout.
- Interim launcher icon and dark splash generated from the fire sprite (`tools/make_android_icons.py`).
- GitHub Actions `android.yml`: builds a release APK signed with the project key (GitHub secrets), uploads it as an
  artifact on every push to `main`, and publishes a GitHub Release for `v*` tags.
- E2E projects for 1920×1080 and Budiman's phone shape (914×411 @ DPR 2.625, with and without the address bar); they check the canvas fills the viewport.

## [0.1.0-sprint1] — 2026-11-15

### Added
- Repository scaffold: Phaser 3.90, TypeScript 5.9 (strict), Vite 8, Vitest, ESLint, Playwright.
- Scenes: Boot, Preload (atlas + light textures), Game (v2 campfire loop), UI (HUD).
- `src/data/balance.json`: all 30 `CFG` values plus inline constants of legacy v2, unchanged.
- `src/data/characters.json`: 7 characters with official names (Affan, Hannan spelling) and roles.
- Campfire, light and seeded-world systems ported from v2 as pure TypeScript.
- Unit tests that load `legacy/kem-api-unggun-v2.html` and compare formulas value-for-value.
- Playwright smoke tests (desktop 1280×720, Pixel 7 landscape emulation).
- Interim texture atlas built from the 31 v2 sprites (`npm run atlas`), clearly marked interim.
- HUD styled after official style sheet v2 (parchment panels, ink outlines, bars, round buttons).
- GitHub Actions CI (typecheck, lint, unit, build, e2e) and GitHub Pages deploy.
- Legacy prototypes v1 and v2 kept unchanged in `legacy/`; reference sheets in `docs/art-reference/`.
- Docs: README (BM + EN), DECISIONS, architecture, art bible, audit summary, sprint 1 report.

### Changed vs legacy v2 (interim, until later sprints)
- Portrait 360×640 → landscape 1280×720 (world drawn at 2× so sizes feel the same).
- No worker AI yet: tapping a lit tree chops it directly (max 2 at once, same 3.8 s / 2 logs as v2).
- Fire upgrades keep v2 costs and light gain but do not unlock characters yet.
