# Sprint 1 · Camp v2 (new camp, camp-first)

Branch `sprint1-camp-v2` (from `sprint1-living-camp` @ 1811891). Based on the approved sketch
`layout_bab1_v2.png` (+ `.md/.json`). Only the camp is finished; the zones are rough walkable areas.

## What changed
- **One fixed map** (`src/core/camp/layout.ts` is the only place with coordinates): world 4800×4000,
  fire at (2400, 2000). No per-run random layout; forest fill uses a constant seed so every run is identical.
- **Flat camp clearing** (r 360) of packed dirt, soft worn rim; meadow ring to r 600 kept empty for camp growth.
- **Three dirt trails** (tapering) to Belukar Kayu (WSW), Lembah Batu (SE) and Hutan Larangan (NE).
  Walkable ground = camp disc + trails + zone areas; Affan slides along the forest edge.
- **Three tents** (Cikgu Nisa / boys / girls), same art recoloured (khaki / slate blue / terracotta).
- **Camp table (with back bench) + front bench + stump stool.** Cikgu Nisa follows a routine (`src/core/camp/nisa.ts`):
  sits at the table → walks → stands at the boys' tent → storage → loops south of the fire → girls' tent → back
  to her seat. She stops and turns to Affan when he comes near; talking works anywhere on her route.
- **Storage rack** kept (east side), lantern post at Nisa's tent, 4 empty lantern slots kept.
- **Night-1 fence**: 27 ring slots at r 430; trail gates always open; the rest follow a fixed weak pattern
  (`weak` = leaning posts + one sagging rail, `damaged` = rail on the ground, `missing` = gap).
  `FenceSeg.state` + `CampSim.fenceStates` (saved in `camp.fence`) are ready for the Day-2 repair. Wolves ignore the fence.
- **Letter-A stone** beside the fire: carved A that glows as the fire progresses.
- **Resources** (counts unchanged: Kayu 12, Batu 7, Dahan 10, Beri 5) placed per the sketch:
  west glade 3 Kayu + 1 Beri, east glade 2 Dahan, Belukar Kayu 9 Kayu / 8 Dahan / 2 Beri,
  Lembah Batu 7 Batu (2 of them wait here until the river bank exists) + 1 Beri, Larangan trail end 1 Beri.
- **Wolves** come from the Hutan Larangan trail.
- **Audit fixes**: `getah` removed everywhere; Interaksi / E / SPACE do nothing while Beg or Bina is open.

## Art
- Repo/project art: tents (recoloured `tent`), fence posts/rails (cut from `fence_segment`), storage rack, lanterns,
  campfire, trees; cut-outs from `map_ref/objects_raw/` (berry bush full/empty, bush, boulder, moss rocks, stump,
  flowers, grass tuft); ground tiles from `tex_grass_v1` / `tex_dirt_v1` (one repeat, recoloured, made seamless).
  Build: `python3 tools/storybook/build_camp2_atlas.py`.
- **Flow art (Budiman, `assets/storybook-src/flow_camp_v2/`, cut by `tools/storybook/flow_camp_v2.py`):**
  Nisa walk cycle (6 side frames, advanced by distance walked, mirrored for left), Nisa seated (front view, cut at
  the seat line, behind the table on its back bench), table set (top variant split into table+back bench and front
  bench), stump stool, fence pieces v2 (pure-green sheets `fence_front_v2.jpg` / `fence_side_v2.jpg`, chroma-keyed with
  despill; front view on mostly horizontal ring slots, side view on mostly vertical ones, mirrored on the west; no
  tilting beyond ±4°; weak = standing, damaged = leaning / half-broken, missing = collapsed pile on the ground and
  walkable, solid = original camp fence art; open trail gates stay empty), letter-A stone (dull stone +
  glowing letter overlay that fills bottom-up with `CampSim.letterGlow()`: gathering for the first fire fills it
  halfway, then it follows the fire's fuel; no letter is "found" yet, ABC stays 0/13).
