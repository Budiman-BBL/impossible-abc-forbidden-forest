# Decisions log

Project owner: **Budiman** (final approval authority). Dates in MYT (UTC+8).

| # | Date | Decision | Decided by |
|---|---|---|---|
| D1 | 15 Nov 2026 | Approve the audit and plan "Impossible ABC: The Forbidden Forest — Audit & Pelan v1.0": migrate to Phaser 3 + TypeScript + Vite, carry over v2 logic, balance values and sprites; keep the HTML prototypes in `legacy/` unchanged. | Budiman |
| D2 | 15 Nov 2026 | Official character names: **Cikgu Nisa, Affan, Ayan, Unais, Hannan, Asiya, Safiya**. Spelling **Affan** and **Hannan** is official (replaces "Afan"/"Hanan" of the prototype and lineup v4). Names live only in `src/data/characters.json`. | Budiman |
| D3 | 15 Nov 2026 | Roles: Cikgu Nisa = Expedition Leader, Affan = Resource Collector, Ayan = Guardian, **Unais = Builder** (was worker in v2), Hannan = Torchbearer, Asiya & Safiya = Shamans. | Budiman |
| D4 | 15 Nov 2026 | Repository `Budiman-BBL/impossible-abc-forbidden-forest` is **public for now**; may become private later. | Budiman |
| D5 | 15 Nov 2026 | Official visual style = `docs/art-reference/ABC_forbidden_forest_official_style_v1.png` (lineup, expressions, animation poses Idle/Walk/Run/Action/Interact/Hurt/Die, environment, animals, props, buildings, UI elements, day & night). | Budiman |
| D6 | 15 Nov 2026 | **Superseded D5 the same day:** `docs/art-reference/ABC_forbidden_forest_official_style_v2.png` is now the **PRIMARY art reference** (lineup with roles, turnaround, expressions, animation poses, equipment/props, animals, monsters, environment tiles, UI elements, colour palette). v1 kept as history. Sprint 1 UI uses its palette and UI style (bars, round buttons, parchment panels). | Budiman |
| D7 | 15 Nov 2026 | UI layout target = `docs/art-reference/ABC_forbidden_forest_ui_mockup_v1.png` (layout reference only, nothing cut from it). Orientation: **landscape**. | Budiman |
| D8 | 15 Nov 2026 | Platform: browser build first (GitHub Pages), Android APK via Capacitor only after the MVP passes in the browser (Sprint 5). | Plan, approved by Budiman |

## Technical decisions (Sprint 1, by the AI Game Architect)

| # | Date | Decision | Why |
|---|---|---|---|
| T1 | 15 Nov 2026 | Phaser 3.90.0 (latest 3.x), not Phaser 4. | The approved plan says Phaser 3; Phaser 4 is a new major with API changes. |
| T2 | 15 Nov 2026 | Base resolution 1280×720, `Scale.FIT`, world units = v2 units drawn at 2×. | Keeps v2 balance numbers (speeds, radii) unchanged while filling a landscape screen. |
| T3 | 15 Nov 2026 | Game logic (fire, light, world) as pure TypeScript with no Phaser import. | Testable in Node; unit tests compare it to the legacy v2 file itself. |
| T4 | 15 Nov 2026 | Game time uses real elapsed time capped at 0.08 s (v2 rule), not Phaser's smoothed delta. | Phaser's smoothed delta slowed game time on low frame rates, so the fire burned slower than v2. |
| T5 | 15 Nov 2026 | Darkness = half-resolution render texture with radial "holes"; warm glow as additive sprites. | Mirrors v2's look; half resolution limits cost on cheap phones (plan risk E). |
| T6 | 15 Nov 2026 | Interim sprites packed into one atlas with foot anchors; replaced when official v2-style art is cut. | Plan Sprint 1 scope ("aset sedia ada sebagai atlas"). |
| T7 | 15 Nov 2026 | Until worker AI exists, tapping a lit tree chops it directly (max 2 at once, v2 timings). | Keeps the core loop playable in Sprint 1 without pulling Sprint 6 work forward. |
| T8 | 15 Nov 2026 | Reference sheets live in `docs/art-reference/` (plan draft said `assets/source/`). | They are references, not game assets; owner brief asked for `docs/art-reference/`. |
| T9 | 15 Nov 2026 | GitHub Pages deploy runs only after all CI checks pass on `main`. | Always keep a known-working build online. |
