/**
 * Forest layout generator ported from legacy v2 newWorld(). The rng is consumed in the same
 * order as v2 for trees, red eyes, rocks/bushes and critters, so a seed reproduces v2's layout.
 * Characters, boars and fireflies of v2 are not part of Sprint 1.
 */
import { CAMPS, CFG } from "./balance";
import { dist } from "./math";
import { mulberry32 } from "./rng";

export type TreeKind = "coconut" | "rubber" | "bamboo";

export interface Camp {
  id: string;
  name: string;
  x: number;
  y: number;
  main: boolean;
  lit: boolean;
}
export interface Tree {
  id: number;
  x: number;
  y: number;
  logs: number;
  maxLogs: number;
  respawn: number;
  sway: number;
  kind: TreeKind;
  hasOwl: boolean;
}
export interface Eye { x: number; y: number; ph: number; vx: number; vy: number }
export interface Rock { x: number; y: number; s: number }
export interface Bush { x: number; y: number; full: boolean; s: number }
export interface Critter { kind: "ayam" | "kera"; x: number; y: number; facing: 1 | -1; bob: number }

export interface World {
  seed: number;
  camps: Camp[];
  trees: Tree[];
  eyes: Eye[];
  tents: { x: number; y: number }[];
  rocks: Rock[];
  bushes: Bush[];
  critters: Critter[];
}

export function generateWorld(seed: number): World {
  const rng = mulberry32(seed);
  const W = CFG.WORLD;
  const camps: Camp[] = CAMPS.map((c) => ({ ...c, lit: c.main }));
  const trees: Tree[] = [];

  function tryTree(x: number, y: number, minCamp: number): boolean {
    if (x < 70 || y < 70 || x > W - 70 || y > W - 70) return false;
    for (const c of camps) if (dist(x, y, c.x, c.y) < (minCamp || 96)) return false;
    for (const t of trees) if (dist(x, y, t.x, t.y) < 50) return false;
    const sway = rng() * 6;
    const r = rng();
    const kind: TreeKind = r < 0.4 ? "coconut" : r < 0.75 ? "rubber" : "bamboo";
    const hasOwl = rng() < 0.12;
    trees.push({ id: trees.length, x, y, logs: CFG.TREE_LOGS, maxLogs: CFG.TREE_LOGS, respawn: 0, sway, kind, hasOwl });
    return true;
  }
  function ring(cx: number, cy: number, n: number, r0: number, r1: number, minCamp: number): void {
    let g = 0;
    while (n > 0 && g++ < 3000) {
      const a = rng() * Math.PI * 2;
      const r = r0 + rng() * (r1 - r0);
      if (tryTree(cx + Math.cos(a) * r, cy + Math.sin(a) * r, minCamp)) n--;
    }
  }
  const [c0, c1, c2] = camps as [Camp, Camp, Camp];
  ring(c0.x, c0.y, 28, 102, 148, 98);
  ring(c0.x, c0.y, 12, 155, 210, 98);
  ring(c1.x, c1.y, 10, 88, 170, 80);
  ring(c2.x, c2.y, 10, 88, 170, 80);
  let g2 = 0;
  while (trees.length < 64 && g2++ < 3000) {
    tryTree(80 + rng() * (W - 160), 80 + rng() * (W - 160), 130);
  }

  const eyes: Eye[] = [];
  for (let i = 0; i < 36; i++) {
    eyes.push({ x: rng() * W, y: rng() * W, ph: rng() * 6, vx: (rng() - 0.5) * 14, vy: (rng() - 0.5) * 14 });
  }
  const tents = camps.map((c) => ({ x: c.x + (c.main ? -64 : -52), y: c.y - 20 }));
  const rocks: Rock[] = [];
  const bushes: Bush[] = [];
  for (let i = 0; i < 28; i++) {
    const x = 80 + rng() * (W - 160);
    const y = 80 + rng() * (W - 160);
    if (camps.some((c) => dist(x, y, c.x, c.y) < 70)) continue;
    if (trees.some((t) => dist(x, y, t.x, t.y) < 36)) continue;
    if (rng() < 0.55) rocks.push({ x, y, s: 0.75 + rng() * 0.5 });
    else bushes.push({ x, y, full: rng() < 0.55, s: 0.8 + rng() * 0.4 });
  }
  const critters: Critter[] = [];
  const kinds = ["ayam", "ayam", "kera", "kera"] as const;
  for (let i = 0; i < 8; i++) {
    const camp = camps[i % camps.length] as Camp;
    const a = rng() * Math.PI * 2;
    const r = 70 + rng() * 80;
    const x = camp.x + Math.cos(a) * r;
    const y = camp.y + Math.sin(a) * r;
    const facing = rng() < 0.5 ? 1 : -1;
    const bob = rng() * 6;
    rng(); // v2 "wait" timer (critters stay put in Sprint 1)
    critters.push({ kind: kinds[i % kinds.length] as "ayam" | "kera", x, y, facing, bob });
  }
  return { seed, camps, trees, eyes, tents, rocks, bushes, critters };
}
