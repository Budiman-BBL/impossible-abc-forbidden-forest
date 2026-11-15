# Changelog

All notable changes to this project. Dates are Malaysia time (MYT, UTC+8).

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
