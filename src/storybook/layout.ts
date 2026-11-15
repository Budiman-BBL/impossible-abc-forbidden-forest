/**
 * Seeded layout of the storybook clearing around GameCore's main camp (world units = v2 units).
 * Pure TypeScript: positions only, the scene decides how to draw them.
 */
import { mulberry32 } from "../core/rng";

export type PropKind = "tree_oak" | "tree_pine1" | "tree_pine2" | "bush" | "fern" | "mushroom" | "rock_big" | "rocks_cluster" | "stump";
export interface Prop { kind: PropKind; x: number; y: number; s: number; flip: boolean; r: number }
export interface Pickup { id: number; kind: "log" | "stone"; x: number; y: number; taken: boolean }
export interface StoryLayout {
  spawn: { x: number; y: number };
  path: { x: number; y: number }[];
  twisted: { x: number; y: number };
  props: Prop[];
  pickups: Pickup[];
  bounds: { cx: number; cy: number; r: number };
}

export const LOGS_PLACED = 7;
export const STONES_PLACED = 3;

function distToPath(path: { x: number; y: number }[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!, b = path[i + 1]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.y + dy * t - y));
  }
  return best;
}

export function makeLayout(seed: number, camp: { x: number; y: number }): StoryLayout {
  const rng = mulberry32((seed ^ 0x5b0c) >>> 0);
  const R = 900;
  const spawn = { x: camp.x + 60, y: camp.y + 430 };
  // winding dirt path from the spawn up to the camp clearing
  const path: { x: number; y: number }[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    path.push({ x: spawn.x + (camp.x - spawn.x) * t + Math.sin(t * Math.PI * 1.6) * 70, y: spawn.y + (camp.y - spawn.y) * t });
  }
  path.push({ x: camp.x - 330, y: camp.y - 200 });
  const twisted = { x: camp.x + 270, y: camp.y - 100 };

  const props: Prop[] = [];
  const blocked = (x: number, y: number, minD: number) =>
    Math.hypot(x - camp.x, y - camp.y) < 230 ||
    distToPath(path, x, y) < 100 ||
    Math.hypot(x - twisted.x, y - twisted.y) < 170 ||
    props.some((p) => p.r > 0 && Math.hypot(p.x - x, p.y - y) < minD);
  const trees: PropKind[] = ["tree_oak", "tree_pine1", "tree_pine2", "tree_pine1"];
  let guard = 0;
  while (props.length < 60 && guard++ < 6000) {
    const a = rng() * Math.PI * 2, r = 240 + Math.sqrt(rng()) * (R - 240);
    const x = camp.x + Math.cos(a) * r, y = camp.y + Math.sin(a) * r;
    if (blocked(x, y, 130)) continue;
    props.push({ kind: trees[Math.floor(rng() * trees.length)]!, x, y, s: 0.85 + rng() * 0.35, flip: rng() < 0.5, r: 20 });
  }
  const small: [PropKind, number, number][] = [["bush", 26, 0], ["fern", 40, 0], ["mushroom", 14, 0], ["rock_big", 8, 26], ["rocks_cluster", 10, 18], ["stump", 6, 16]];
  for (const [kind, n, rad] of small) {
    let k = 0; guard = 0;
    while (k < n && guard++ < 3000) {
      const a = rng() * Math.PI * 2, r = 170 + rng() * (R - 170);
      const x = camp.x + Math.cos(a) * r, y = camp.y + Math.sin(a) * r;
      if (distToPath(path, x, y) < 40 || Math.hypot(x - camp.x, y - camp.y) < 150) continue;
      if (props.some((p) => Math.hypot(p.x - x, p.y - y) < (p.r > 0 ? 60 : 30))) continue;
      props.push({ kind, x, y, s: 0.8 + rng() * 0.4, flip: rng() < 0.5, r: rad });
      k++;
    }
  }
  const pickups: Pickup[] = [];
  const place = (kind: Pickup["kind"], n: number, r0: number, r1: number) => {
    let k = 0; guard = 0;
    while (k < n && guard++ < 3000) {
      const a = rng() * Math.PI * 2, r = r0 + rng() * (r1 - r0);
      const x = camp.x + Math.cos(a) * r, y = camp.y + Math.sin(a) * r;
      if (props.some((p) => p.r > 0 && Math.hypot(p.x - x, p.y - y) < p.r + 50)) continue;
      // keep pickups out from behind tree crowns and bushes so they stay visible
      if (props.some((p) => p.kind.startsWith("tree") && p.y - y > -20 && p.y - y < 230 && Math.abs(p.x - x) < 90)) continue;
      if (props.some((p) => (p.kind === "bush" || p.kind === "fern") && Math.hypot(p.x - x, p.y - y) < 60)) continue;
      if (pickups.some((p) => Math.hypot(p.x - x, p.y - y) < 90)) continue;
      pickups.push({ id: pickups.length, kind, x, y, taken: false });
      k++;
    }
  };
  place("log", LOGS_PLACED, 140, 470);
  place("stone", STONES_PLACED, 180, 430);
  return { spawn, path, twisted, props, pickups, bounds: { cx: camp.x, cy: camp.y, r: R - 60 } };
}
