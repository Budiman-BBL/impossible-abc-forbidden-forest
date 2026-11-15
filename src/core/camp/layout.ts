/**
 * Padang Kem layout (Camp Layout Blueprint v1): one central fire, tent top-left (Cikgu Nisa),
 * storage top-right, four fixed lantern slots around the fire, an unfinished fence at the front and
 * three forest exits (bottom-left, bottom-right, top-right). Gathering nodes are seeded around it.
 * Positions only; renderers decide how to draw them.
 */
import { mulberry32 } from "../rng";
import type { Res } from "./config";

export interface Pt { x: number; y: number }
export type PropKind = "tree_oak" | "tree_pine1" | "tree_pine2" | "fern_bush" | "mushroom_glow" | "rock_big" | "rocks_cluster" | "stump" | "fern";
export interface Prop extends Pt { kind: PropKind; s: number; flip: boolean; r: number }
export interface ResNode extends Pt { id: number; kind: Res; amount: number; max: number; respawnAt: number | null }
export interface CampObject extends Pt { kind: string; s: number; flip?: boolean; r: number }

export interface CampLayout {
  world: number;
  fire: Pt;
  tent: Pt;
  nisa: Pt;
  nisaLantern: Pt;
  storage: Pt;
  lanternSlots: Pt[];
  fence: CampObject[];
  decor: CampObject[];
  exits: Pt[];
  spawn: Pt;
  props: Prop[];
  nodes: ResNode[];
  bounds: { cx: number; cy: number; r: number };
}

export const WORLD = 2400;

export function makeCampLayout(seed: number): CampLayout {
  const rng = mulberry32((seed ^ 0x1c4a) >>> 0);
  const C = { x: WORLD / 2, y: WORLD / 2 };
  const at = (dx: number, dy: number): Pt => ({ x: C.x + dx, y: C.y + dy });
  const fire = at(0, 0);
  const tent = at(-245, -175);
  const nisa = at(-150, -120);
  const nisaLantern = at(-128, -182);
  const storage = at(235, -185);
  const lanternSlots = [at(-320, -25), at(330, -35), at(-150, 85), at(160, 80)];
  const fence: CampObject[] = [
    { ...at(-205, 185), kind: "fence_segment", s: 0.3, r: 0 },
    { ...at(-50, 200), kind: "fence_segment", s: 0.3, r: 0 },
    { ...at(165, 190), kind: "fence_corner", s: 0.3, flip: true, r: 0 },
  ];
  const decor: CampObject[] = [
    { ...at(150, -170), kind: "wooden_crate", s: 0.26, r: 16 },
    { ...at(318, -150), kind: "log_bundle", s: 0.24, r: 18 },
    { ...at(195, -120), kind: "branch_bundle", s: 0.22, r: 0 },
    { ...at(-390, 120), kind: "glowing_mushroom_cluster", s: 0.2, r: 0 },
    { ...at(420, -95), kind: "glowing_mushroom_cluster", s: 0.17, r: 0 },
    { ...at(-430, -230), kind: "glowing_mushroom_cluster", s: 0.18, r: 0 },
    { ...at(-360, -150), kind: "fern_bush", s: 0.24, r: 0 },
    { ...at(390, 210), kind: "fern_bush", s: 0.22, r: 0 },
    { ...at(-60, -300), kind: "fern_bush", s: 0.2, r: 0 },
  ];
  const exits = [at(-520, 420), at(540, 400), at(470, -470)];
  const spawn = at(40, 130);

  const props: Prop[] = [];
  const nearExitPath = (x: number, y: number) =>
    exits.some((e) => {
      // corridor from the fire out through the exit
      const dx = e.x - fire.x, dy = e.y - fire.y, L2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1.6, ((x - fire.x) * dx + (y - fire.y) * dy) / L2));
      return Math.hypot(fire.x + dx * t - x, fire.y + dy * t - y) < 95;
    });
  const R = 1000;
  const trees: PropKind[] = ["tree_oak", "tree_pine1", "tree_pine2", "tree_pine1"];
  let guard = 0;
  while (props.length < 70 && guard++ < 8000) {
    const a = rng() * Math.PI * 2, r = 470 + Math.sqrt(rng()) * (R - 470);
    const x = C.x + Math.cos(a) * r, y = C.y + Math.sin(a) * r * 0.85;
    if (nearExitPath(x, y)) continue;
    if (props.some((p) => Math.hypot(p.x - x, p.y - y) < 120)) continue;
    props.push({ kind: trees[Math.floor(rng() * trees.length)]!, x, y, s: 0.85 + rng() * 0.35, flip: rng() < 0.5, r: 20 });
  }
  const small: [PropKind, number, number][] = [["fern", 26, 0], ["rock_big", 7, 24], ["rocks_cluster", 8, 16], ["stump", 6, 14]];
  for (const [kind, n, rad] of small) {
    let k = 0; guard = 0;
    while (k < n && guard++ < 3000) {
      const a = rng() * Math.PI * 2, r = 420 + rng() * (R - 420);
      const x = C.x + Math.cos(a) * r, y = C.y + Math.sin(a) * r * 0.85;
      if (props.some((p) => Math.hypot(p.x - x, p.y - y) < (p.r > 0 ? 70 : 34))) continue;
      props.push({ kind, x, y, s: 0.8 + rng() * 0.4, flip: rng() < 0.5, r: rad });
      k++;
    }
  }
  const nodes: ResNode[] = [];
  const place = (kind: Res, n: number, r0: number, r1: number, max = 1) => {
    let k = 0; guard = 0;
    while (k < n && guard++ < 4000) {
      const a = rng() * Math.PI * 2, r = r0 + rng() * (r1 - r0);
      const x = C.x + Math.cos(a) * r, y = C.y + Math.sin(a) * r * 0.85;
      if (props.some((p) => p.r > 0 && Math.hypot(p.x - x, p.y - y) < p.r + 50)) continue;
      // stay out from behind tree crowns so pickups are visible
      if (props.some((p) => p.kind.startsWith("tree") && p.y - y > -20 && p.y - y < 230 && Math.abs(p.x - x) < 90)) continue;
      if (nodes.some((p) => Math.hypot(p.x - x, p.y - y) < 85)) continue;
      nodes.push({ id: nodes.length, kind, x, y, amount: max, max, respawnAt: null });
      k++;
    }
  };
  place("kayu", 12, 380, 860);
  place("batu", 7, 400, 820);
  place("dahan", 10, 420, 880);
  place("beri", 5, 450, 820, 2);
  return { world: WORLD, fire, tent, nisa, nisaLantern, storage, lanternSlots, fence, decor, exits, spawn, props, nodes, bounds: { cx: C.x, cy: C.y, r: R - 40 } };
}
