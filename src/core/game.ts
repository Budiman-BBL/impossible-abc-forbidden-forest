/**
 * GameCore: the whole v2 campfire loop (fire, light, trees, chopping, feeding, upgrades and the
 * red eyes in the dark) as plain TypeScript. It knows nothing about Phaser or three.js: a
 * renderer calls step() every frame, calls the actions on input, and draws what it reads back.
 * Feedback (toasts, floating "+2 kayu" text, game over) comes back as events, so the 2D and 3D
 * builds show the same messages. Rules and numbers are unchanged from GameScene (v0.2.0).
 */
import { CFG } from "./balance";
import {
  campLightR,
  createFireState,
  doUpgrade,
  feedFire,
  nightIndex,
  stepFire,
  upgradeCost,
  type FireState,
} from "./campfire";
import { isLit, lightAt, type LightSource } from "./light";
import { ang, clamp } from "./math";
import { generateWorld, type Tree, type World } from "./world";

/** v2 drew 2 workers at the start (Afan, Unais), so at most 2 trees are chopped at once. */
export const MAX_CHOPS = 2;

export interface Chop {
  tree: Tree;
  /** 0..1 progress */
  t: number;
}

export interface HudState {
  fuel: number;
  fuelMax: number;
  logs: number;
  level: number;
  night: number;
  time: number;
  upgradeCost: number | null;
  out: boolean;
  chops: number;
}

/** Positions are world units (v2 units, x/y on the forest floor). */
export type CoreEvent =
  | { type: "toast"; text: string }
  | { type: "puff"; x: number; y: number; text: string; color: string }
  | { type: "fed"; used: number }
  | { type: "chopStart"; treeId: number }
  | { type: "chopDone"; treeId: number; logs: number }
  | { type: "chopCancel"; treeId: number }
  | { type: "upgraded"; level: number; unlocks: string | null }
  | { type: "gameover"; time: number };

export type UnlockNamer = (id: string) => string | undefined;

export class GameCore {
  readonly world: World;
  readonly fire: FireState;
  readonly chops: Chop[] = [];
  /** Random source for the eyes' wandering (not part of the seeded layout, like v2). */
  private readonly rand: () => number;

  constructor(seed: number, rand: () => number = Math.random) {
    this.world = generateWorld(seed);
    this.fire = createFireState();
    this.rand = rand;
  }

  get mainCamp() {
    return this.world.camps[0]!;
  }

  lightSources(): LightSource[] {
    const L: LightSource[] = [];
    for (const c of this.world.camps) if (c.lit) L.push({ x: c.x, y: c.y, r: campLightR(this.fire, c) });
    return L;
  }

  lightAt(x: number, y: number): number {
    return lightAt(this.lightSources(), x, y);
  }

  isLit(x: number, y: number): boolean {
    return isLit(this.lightSources(), x, y);
  }

  hud(): HudState {
    return {
      fuel: this.fire.fuel,
      fuelMax: this.fire.fuelMax,
      logs: this.fire.logs,
      level: this.fire.level,
      night: nightIndex(this.fire),
      time: this.fire.time,
      upgradeCost: upgradeCost(this.fire),
      out: this.fire.out,
      chops: this.chops.length,
    };
  }

  // ---------- actions ----------
  feed(): CoreEvent[] {
    const r = feedFire(this.fire, 1);
    if (r.used) {
      const m = this.mainCamp;
      return [
        { type: "fed", used: r.used },
        { type: "puff", x: m.x + 8, y: m.y - 24, text: `+${r.used} kayu`, color: "#ffc878" },
      ];
    }
    if (r.reason === "no-logs") return [{ type: "toast", text: "Tiada kayu. Tebang pokok dulu." }];
    if (r.reason === "full") return [{ type: "toast", text: "Api sudah penuh." }];
    return [];
  }

  chop(t: Tree): CoreEvent[] {
    if (t.logs <= 0) return [{ type: "toast", text: "Pokok ini sudah ditebang. Ia akan tumbuh semula." }];
    if (this.chops.some((c) => c.tree === t)) return [];
    if (!this.isLit(t.x, t.y)) return [{ type: "toast", text: "Terlalu gelap di situ. Besarkan api dulu." }];
    if (this.chops.length >= MAX_CHOPS) return [{ type: "toast", text: `Hanya ${MAX_CHOPS} pokok boleh ditebang serentak.` }];
    this.chops.push({ tree: t, t: 0 });
    return [{ type: "chopStart", treeId: t.id }];
  }

  upgrade(nameOf?: UnlockNamer): CoreEvent[] {
    const r = doUpgrade(this.fire);
    if (r.ok) {
      const m = this.mainCamp;
      const who = r.unlocks ? nameOf?.(r.unlocks) : undefined;
      return [
        { type: "upgraded", level: r.level, unlocks: r.unlocks },
        { type: "puff", x: m.x, y: m.y - 40, text: `Api tahap ${r.level}!`, color: "#ffe08a" },
        {
          type: "toast",
          text: who
            ? `Cahaya makin luas. (${who} akan sertai kem dalam sprint akan datang.)`
            : "Cahaya api semakin luas. Cikgu Nisa merestui kem.",
        },
      ];
    }
    if (r.reason === "max") return [{ type: "toast", text: "Api sudah di tahap maksimum." }];
    if (r.reason === "logs") return [{ type: "toast", text: `Perlu ${r.cost} kayu untuk naik taraf.` }];
    return [];
  }

  /** The tree nearest to the main camp (used by the e2e hooks). */
  nearestTreeToCamp(): Tree | undefined {
    const m = this.mainCamp;
    return [...this.world.trees].sort((a, b) => Math.hypot(a.x - m.x, a.y - m.y) - Math.hypot(b.x - m.x, b.y - m.y))[0];
  }

  // ---------- loop ----------
  /** Advance the game by dt seconds (callers cap dt at 0.08 s like v2). */
  step(dt: number): CoreEvent[] {
    const events: CoreEvent[] = [];
    if (!this.fire.out) {
      for (const ev of stepFire(this.fire, dt)) {
        if (ev === "low") events.push({ type: "toast", text: "Api semakin kecil! Masukkan kayu!" });
        if (ev === "out") events.push({ type: "gameover", time: this.fire.time });
      }
    }
    const lights = this.lightSources();
    if (!this.fire.out) {
      this.stepTrees(dt);
      this.stepChops(dt, lights, events);
    }
    this.stepEyes(dt, lights);
    return events;
  }

  private stepTrees(dt: number): void {
    for (const t of this.world.trees) {
      if (t.logs > 0) continue;
      t.respawn += dt;
      if (t.respawn >= CFG.TREE_RESPAWN) {
        t.logs = t.maxLogs;
        t.respawn = 0;
      }
    }
  }

  private stepChops(dt: number, lights: LightSource[], events: CoreEvent[]): void {
    for (const c of [...this.chops]) {
      if (!isLit(lights, c.tree.x, c.tree.y)) {
        this.chops.splice(this.chops.indexOf(c), 1);
        events.push({ type: "chopCancel", treeId: c.tree.id }, { type: "toast", text: "Pokok itu sudah gelap. Tebangan dibatalkan." });
        continue;
      }
      c.t += dt / CFG.CHOP;
      if (c.t >= 1) {
        this.chops.splice(this.chops.indexOf(c), 1);
        const logs = c.tree.logs;
        this.fire.logs += logs;
        events.push(
          { type: "chopDone", treeId: c.tree.id, logs },
          { type: "puff", x: c.tree.x, y: c.tree.y - 50, text: `+${logs} kayu`, color: "#ffc878" },
        );
        c.tree.logs = 0;
        c.tree.respawn = 0;
      }
    }
  }

  private stepEyes(dt: number, lights: LightSource[]): void {
    const W = CFG.WORLD;
    const main = this.mainCamp;
    for (const e of this.world.eyes) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (this.rand() < 0.012) {
        e.vx = (this.rand() - 0.5) * 16;
        e.vy = (this.rand() - 0.5) * 16;
      }
      if (isLit(lights, e.x, e.y)) {
        const a = ang(main.x, main.y, e.x, e.y);
        e.x += Math.cos(a) * 40 * dt;
        e.y += Math.sin(a) * 40 * dt;
      }
      if (e.x < 20 || e.x > W - 20) e.vx *= -1;
      if (e.y < 20 || e.y > W - 20) e.vy *= -1;
      e.x = clamp(e.x, 10, W - 10);
      e.y = clamp(e.y, 10, W - 10);
    }
  }
}

/** Seed from `?seed=` or a random one (same rule as v0.2.0). */
export function seedFromUrl(search: string): number {
  const p = new URLSearchParams(search).get("seed");
  return p != null && !Number.isNaN(Number(p)) ? Number(p) : (Date.now() & 0xffff) ^ 0x9e37;
}
