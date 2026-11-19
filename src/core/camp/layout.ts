/**
 * Bab 1 map, camp v2 (approved sketch: /workspace/abc_game/map_ref/layout_bab1_v2.png + .md).
 * One FIXED, hand-placed layout and the single source of every coordinate: world 4800×4000, the camp hub
 * on a flat round clearing at (2400, 2000), three dirt trails out to Belukar Kayu (WSW), Lembah Batu (SE)
 * and Hutan Larangan (NE). Only the camp is finished; the zones are rough walkable areas that hold the
 * resources until their own sprint. Forest fill uses a constant seed, so every run is identical.
 * Positions and shapes only; renderers decide how to draw them.
 */
import { mulberry32 } from "../rng";
import type { Res } from "./config";

export interface Pt { x: number; y: number }
export type PropKind =
  | "tree_oak" | "tree_pine1" | "tree_pine2" | "fern" | "stump" | "rock_big" | "rocks_cluster"
  | "bush" | "grass_tuft" | "flowers" | "boulder" | "rocks_moss" | "stump2";
export interface Prop extends Pt { kind: PropKind; s: number; flip: boolean; r: number }
export interface ResNode extends Pt { id: number; kind: Res; amount: number; max: number; respawnAt: number | null }
export interface CampObject extends Pt { kind: string; s: number; flip?: boolean; r: number }
export interface Blocker extends Pt { r: number }

/** Night-1 fence is weak on purpose; Day 2 repairs it (later). "missing" = an empty slot that can be rebuilt. */
export type FenceState = "missing" | "damaged" | "weak" | "solid";
export interface FenceSeg { id: number; a: Pt; b: Pt; state: FenceState; gate: boolean }

export type NisaAct = "sit" | "stand" | "pass";
export interface NisaStop extends Pt { act: NisaAct; hold: number }

export interface Trail { id: "belukar" | "batu" | "larangan"; pts: Pt[]; w0: number; w1: number }
export interface Area extends Pt { rx: number; ry: number; id: string; ground: "dirt" | "grass" | "stony" }

export interface CampLayout {
  worldW: number;
  worldH: number;
  fire: Pt;
  letterSlot: Pt;
  /** Cikgu Nisa's tent (kept as `tent` for older callers) */
  tent: Pt;
  tents: CampObject[];
  furniture: CampObject[];
  /** where Cikgu Nisa starts (her table seat) */
  nisa: Pt;
  nisaRoute: NisaStop[];
  nisaLantern: Pt;
  storage: Pt;
  /** fixed lantern slots: reserved, empty until Sprint 2 */
  lanternSlots: Pt[];
  /** reserved growth space, nothing built yet */
  reserved: { craftTable: Pt; fenceR: number; growR: number };
  clearingR: number;
  fence: FenceSeg[];
  decor: CampObject[];
  trails: Trail[];
  areas: Area[];
  /** trail mouths (one per trail, just outside the growth ring) */
  exits: Pt[];
  wolfSpawn: Pt[];
  spawn: Pt;
  props: Prop[];
  nodes: ResNode[];
  blockers: Blocker[];
}

export const WORLD_W = 4800;
export const WORLD_H = 4000;
export const CAMP_C: Pt = { x: 2400, y: 2000 };
const at = (dx: number, dy: number): Pt => ({ x: CAMP_C.x + dx, y: CAMP_C.y + dy });

export const CLEARING_R = 360;
export const FENCE_R = 430;
export const GROW_R = 600;

/** Trails from the fire (world coords from layout_bab1_v2.json; the zone ends stop at the zones for now). */
export const TRAILS: Trail[] = [
  { id: "belukar", pts: [at(0, 0), at(-300, 190), at(-560, 330), at(-850, 470), at(-1100, 540), at(-1300, 520)], w0: 150, w1: 95 },
  { id: "batu", pts: [at(0, 0), at(300, 200), at(560, 380), at(800, 560), at(1050, 720), at(1300, 880)], w0: 150, w1: 95 },
  { id: "larangan", pts: [at(0, 0), at(260, -230), at(480, -440), at(700, -700), at(900, -900), at(1150, -1060)], w0: 140, w1: 80 },
];

export const AREAS: Area[] = [
  { id: "belukar", ...at(-1350, 560), rx: 560, ry: 420, ground: "grass" },
  { id: "lembah", ...at(1150, 880), rx: 470, ry: 330, ground: "stony" },
  { id: "glade_w", ...at(-720, 250), rx: 150, ry: 120, ground: "grass" },
  { id: "glade_e", ...at(730, 270), rx: 130, ry: 105, ground: "grass" },
  { id: "larangan_end", ...at(1170, -1065), rx: 140, ry: 110, ground: "dirt" },
];

/** Resource clusters per the approved distribution; counts must equal config (Kayu 12, Batu 7, Dahan 10, Beri 5). */
export const RES_CLUSTERS: { kind: Res; c: Pt; r: number; n: number; max?: number }[] = [
  { kind: "kayu", c: at(-740, 215), r: 105, n: 3 },
  { kind: "beri", c: at(-690, 330), r: 55, n: 1, max: 2 },
  { kind: "dahan", c: at(740, 270), r: 95, n: 2 },
  { kind: "kayu", c: at(-1420, 470), r: 300, n: 9 },
  { kind: "dahan", c: at(-1180, 760), r: 230, n: 8 },
  { kind: "beri", c: at(-1640, 760), r: 120, n: 2, max: 2 },
  { kind: "batu", c: at(1180, 820), r: 260, n: 5 },
  // the sketch puts these 2 on the far river bank; river + bridge are not built yet, so they wait in Lembah Batu
  { kind: "batu", c: at(1330, 980), r: 90, n: 2 },
  { kind: "beri", c: at(820, 960), r: 90, n: 1, max: 2 },
  { kind: "beri", c: at(1170, -1065), r: 70, n: 1, max: 2 },
];

// ------------------------------------------------------------------ geometry helpers (shared with renderers)
function segDist(p: Pt, a: Pt, b: Pt): { d: number; t: number } {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  return { d: Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y), t };
}
/** Signed distance (approx.) to the trail band; < 0 = on the trail. */
export function trailDist(p: Pt, tr: Trail): number {
  let best = Infinity;
  const n = tr.pts.length - 1;
  for (let i = 0; i < n; i++) {
    const { d, t } = segDist(p, tr.pts[i]!, tr.pts[i + 1]!);
    const w = tr.w0 + (tr.w1 - tr.w0) * ((i + t) / n);
    best = Math.min(best, d - w / 2);
  }
  return best;
}
function areaDist(p: Pt, a: Area): number {
  const k = Math.hypot((p.x - a.x) / a.rx, (p.y - a.y) / a.ry);
  return (k - 1) * Math.min(a.rx, a.ry);
}
/** Signed distance to the walkable ground (camp disc + trails + zones); < 0 = walkable. */
export function walkDist(p: Pt): number {
  let d = Math.hypot(p.x - CAMP_C.x, p.y - CAMP_C.y) - GROW_R;
  for (const t of TRAILS) d = Math.min(d, trailDist(p, t));
  for (const a of AREAS) d = Math.min(d, areaDist(p, a));
  return d;
}
export function walkable(x: number, y: number, margin = 0): boolean {
  if (x < 40 || y < 40 || x > WORLD_W - 40 || y > WORLD_H - 40) return false;
  return walkDist({ x, y }) < -margin;
}
/** Point at distance `d` along a trail polyline. */
export function alongTrail(tr: Trail, d: number): Pt {
  let left = d;
  for (let i = 0; i < tr.pts.length - 1; i++) {
    const a = tr.pts[i]!, b = tr.pts[i + 1]!, L = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= L) return { x: a.x + ((b.x - a.x) * left) / L, y: a.y + ((b.y - a.y) * left) / L };
    left -= L;
  }
  return { ...tr.pts[tr.pts.length - 1]! };
}

// ------------------------------------------------------------------ the camp (offsets from the fire)
function campFence(): FenceSeg[] {
  const slots = 27;
  const trailAng = TRAILS.map((t) => Math.atan2(t.pts[1]!.y - t.pts[0]!.y, t.pts[1]!.x - t.pts[0]!.x));
  // fixed Night-1 pattern: mostly weak pieces, some broken, some missing (wolves get through the gaps)
  const pattern: FenceState[] = ["weak", "weak", "missing", "weak", "damaged", "weak", "missing", "weak", "damaged"];
  const segs: FenceSeg[] = [];
  for (let i = 0; i < slots; i++) {
    const a0 = (i / slots) * Math.PI * 2, a1 = ((i + 1) / slots) * Math.PI * 2, am = (a0 + a1) / 2;
    const gate = trailAng.some((t) => Math.abs(Math.atan2(Math.sin(am - t), Math.cos(am - t))) < 0.27);
    segs.push({
      id: i,
      a: at(Math.cos(a0) * FENCE_R, Math.sin(a0) * FENCE_R),
      b: at(Math.cos(a1) * FENCE_R, Math.sin(a1) * FENCE_R),
      state: gate ? "missing" : pattern[i % pattern.length]!,
      gate,
    });
  }
  return segs;
}

export function makeCampLayout(): CampLayout {
  const rng = mulberry32(0xb4b1); // constant: the map is fixed, not per-run random
  const fire = at(0, 0);
  const tents: CampObject[] = [
    { ...at(-170, -215), kind: "tent_nisa", s: 0.44, r: 0 },
    { ...at(35, -292), kind: "tent_boys", s: 0.44, r: 0 },
    { ...at(-300, -62), kind: "tent_girls", s: 0.44, r: 0, flip: true },
  ];
  const table = at(-125, -95);
  const furniture: CampObject[] = [
    { ...table, kind: "table", s: 0.5, r: 0 },
    { ...at(-125, -140), kind: "bench", s: 0.5, r: 0 },
    { ...at(-125, -47), kind: "bench", s: 0.5, r: 0 },
    { ...at(-38, -98), kind: "stool", s: 0.5, r: 0 },
  ];
  const nisaSeat = at(-125, -146);
  const nisaRoute: NisaStop[] = [
    { ...nisaSeat, act: "sit", hold: 16 },
    { ...at(-40, -152), act: "pass", hold: 0 },
    { ...at(60, -160), act: "stand", hold: 7 },
    { ...at(190, -70), act: "pass", hold: 0 },
    { ...at(170, 40), act: "stand", hold: 6 },
    { ...at(150, 92), act: "pass", hold: 0 },
    { ...at(-60, 100), act: "pass", hold: 0 },
    { ...at(-222, 18), act: "stand", hold: 7 },
    { ...at(-222, -150), act: "pass", hold: 0 },
  ];
  const nisaLantern = at(-70, -168);
  const storage = at(250, -40);
  const lanternSlots = [at(-330, 60), at(335, -130), at(125, 300), at(-200, 285)];
  const decor: CampObject[] = [{ ...at(300, 40), kind: "log_bundle", s: 0.24, r: 18 }];
  const fence = campFence();
  const exits = TRAILS.map((t) => alongTrail(t, GROW_R + 60));
  const larangan = TRAILS[2]!;
  const wolfSpawn = [alongTrail(larangan, 760), alongTrail(larangan, 860)];
  const spawn = at(40, 130);

  // obstacles (Affan collides with these; wolves ignore them)
  const blockers: Blocker[] = [{ ...fire, r: 40 }];
  for (const t of tents) blockers.push({ x: t.x - 34, y: t.y - 8, r: 50 }, { x: t.x + 38, y: t.y - 8, r: 44 });
  blockers.push({ x: table.x - 40, y: table.y, r: 26 }, { x: table.x + 40, y: table.y, r: 26 }, { x: table.x, y: table.y, r: 26 });
  for (const f of furniture) {
    if (f.kind === "bench") blockers.push({ x: f.x - 34, y: f.y, r: 12 }, { x: f.x + 34, y: f.y, r: 12 }, { x: f.x, y: f.y, r: 12 });
    if (f.kind === "stool") blockers.push({ x: f.x, y: f.y, r: 11 });
  }
  blockers.push({ ...storage, y: storage.y - 8, r: 40 }, { x: nisaLantern.x - 14, y: nisaLantern.y, r: 8 });
  for (const d of decor) if (d.r > 0) blockers.push({ x: d.x, y: d.y, r: d.r });
  for (const f of fence) {
    if (f.state !== "weak" && f.state !== "solid") continue;
    for (let k = 0; k <= 3; k++) blockers.push({ x: f.a.x + ((f.b.x - f.a.x) * k) / 3, y: f.a.y + ((f.b.y - f.a.y) * k) / 3, r: 10 });
  }

  // ---------------------------------------------------------------- forest + zone props (fixed seed)
  const props: Prop[] = [];
  const nearTrailCore = (p: Pt, pad: number) => TRAILS.some((t) => trailDist(p, t) < pad);
  const trees: PropKind[] = ["tree_pine1", "tree_oak", "tree_pine2", "tree_pine1", "tree_pine2"];
  const step = 96;
  for (let gy = 0; gy <= WORLD_H; gy += step) {
    for (let gx = 0; gx <= WORLD_W; gx += step) {
      const x = gx + (rng() - 0.5) * step * 0.9, y = gy + (rng() - 0.5) * step * 0.9;
      const r1 = rng(), r2 = rng(), r3 = rng();
      const d = walkDist({ x, y });
      if (d < 26 || d > 760) continue;
      if (r1 > (d < 260 ? 0.97 : 0.8)) continue;
      // darker conifers towards Hutan Larangan (NE), more oaks towards Belukar (W)
      const kind: PropKind = x > CAMP_C.x + 300 && y < CAMP_C.y - 200 ? (r2 < 0.75 ? "tree_pine2" : "tree_pine1") : trees[Math.floor(r2 * trees.length)]!;
      props.push({ kind, x, y, s: 0.85 + r3 * 0.4, flip: r2 > 0.5, r: 20 });
    }
  }
  const scatter = (kind: PropKind, n: number, ok: (p: Pt) => boolean, s0: number, s1: number, r: number, gap: number) => {
    let k = 0, guard = 0;
    while (k < n && guard++ < n * 60) {
      const p = { x: 200 + rng() * (WORLD_W - 400), y: 200 + rng() * (WORLD_H - 400) };
      if (!ok(p)) continue;
      if (props.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < (q.r > 0 || r > 0 ? gap : 30))) continue;
      props.push({ kind, ...p, s: s0 + rng() * (s1 - s0), flip: rng() < 0.5, r });
      k++;
    }
  };
  const inArea = (id: string, k: number) => (p: Pt) => { const a = AREAS.find((x) => x.id === id)!; return Math.hypot((p.x - a.x) / a.rx, (p.y - a.y) / a.ry) < k; };
  const camp = (p: Pt) => Math.hypot(p.x - CAMP_C.x, p.y - CAMP_C.y);
  // soften the forest edge: ferns and grass along the walkable border
  scatter("fern", 150, (p) => { const d = walkDist(p); return d > -40 && d < 24 && !nearTrailCore(p, 10); }, 0.8, 1.15, 0, 40);
  scatter("grass_tuft", 40, (p) => { const d = walkDist(p); return d > -60 && d < 10 && !nearTrailCore(p, 6); }, 0.8, 1.1, 0, 40);
  // the meadow ring around camp (reserved growth space stays open: only flowers/grass, nothing solid)
  scatter("flowers", 26, (p) => camp(p) > FENCE_R + 30 && camp(p) < GROW_R - 30 && !nearTrailCore(p, 20), 0.8, 1.1, 0, 60);
  // Belukar Kayu: shrubs and old stumps; Lembah Batu: boulders and moss rocks
  scatter("bush", 16, (p) => inArea("belukar", 0.85)(p) && !nearTrailCore(p, 50), 0.85, 1.15, 26, 110);
  scatter("stump2", 5, (p) => inArea("belukar", 0.85)(p) && !nearTrailCore(p, 40), 0.8, 1.1, 18, 120);
  scatter("flowers", 10, inArea("belukar", 0.9), 0.8, 1.2, 0, 60);
  scatter("boulder", 13, (p) => inArea("lembah", 0.88)(p) && !nearTrailCore(p, 50), 0.8, 1.25, 30, 120);
  scatter("rocks_moss", 18, (p) => inArea("lembah", 0.9)(p) && !nearTrailCore(p, 30), 0.8, 1.2, 16, 90);
  scatter("flowers", 4, inArea("glade_w", 0.8), 0.8, 1.0, 0, 50);
  scatter("flowers", 3, inArea("glade_e", 0.8), 0.8, 1.0, 0, 50);
  for (const p of props) if (p.r > 0 && !p.kind.startsWith("tree")) blockers.push({ x: p.x, y: p.y, r: p.r * p.s });

  // ---------------------------------------------------------------- resource nodes (fixed spiral per cluster)
  const nodes: ResNode[] = [];
  const free = (p: Pt) =>
    walkable(p.x, p.y, 22) &&
    camp(p) > FENCE_R + 40 &&
    !blockers.some((b) => Math.hypot(b.x - p.x, b.y - p.y) < b.r + 34) &&
    !props.some((q) => q.kind.startsWith("tree") && q.y - p.y > -20 && q.y - p.y < 200 && Math.abs(q.x - p.x) < 80) &&
    !nodes.some((n) => Math.hypot(n.x - p.x, n.y - p.y) < 62);
  for (const cl of RES_CLUSTERS) {
    let k = 0;
    for (let i = 0; i < 400 && k < cl.n; i++) {
      const a = i * 2.39996, rr = cl.r * Math.sqrt((i + 0.5) / Math.max(4, cl.n * 3));
      if (rr > cl.r * 2) break;
      const p = { x: Math.round(cl.c.x + Math.cos(a) * rr), y: Math.round(cl.c.y + Math.sin(a) * rr * 0.85) };
      if (!free(p)) continue;
      const max = cl.max ?? 1;
      nodes.push({ id: nodes.length, kind: cl.kind, ...p, amount: max, max, respawnAt: null });
      k++;
    }
    if (k < cl.n) throw new Error(`layout: cluster ${cl.kind}@${cl.c.x},${cl.c.y} placed ${k}/${cl.n}`);
  }

  return {
    worldW: WORLD_W, worldH: WORLD_H, fire, letterSlot: at(78, -6), tent: { x: tents[0]!.x, y: tents[0]!.y }, tents, furniture,
    nisa: nisaSeat, nisaRoute, nisaLantern, storage, lanternSlots,
    reserved: { craftTable: at(-35, 250), fenceR: FENCE_R, growR: GROW_R }, clearingR: CLEARING_R,
    fence, decor, trails: TRAILS, areas: AREAS, exits, wolfSpawn, spawn, props, nodes, blockers,
  };
}
