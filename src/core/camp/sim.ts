/**
 * CampSim: Sprint 1 "The Living Camp" rules as plain TypeScript (no Phaser, no DOM).
 * Day clock, the one main campfire (fuel, shrinking light, can go out), gathering Kayu/Batu/Dahan/Beri
 * with carry limits, storage, the Bina menu (fire upgrade; fence locked until Sprint 2), hearts,
 * wolves that fear the light, Cikgu Nisa's short guidance and the pass condition (survive to morning).
 * The renderer moves Affan, writes `player`, calls step() and the actions, and draws what it reads back.
 */
import { CAMP_CFG, emptyInv, RESOURCES, type Inventory, type Res } from "./config";
import { makeCampLayout, type CampLayout, type Pt, type ResNode } from "./layout";
import { darknessAt, phaseAt, sunStrength, T_MALAM, T_PAGI, type Phase } from "./clock";

export const RES_LABEL: Record<Res, string> = { kayu: "Kayu", batu: "Batu", dahan: "Dahan", getah: "Getah", beri: "Beri" };

export interface FireState { lit: boolean; everLit: boolean; fuel: number; level: number }
export type WolfMode = "prowl" | "chase" | "retreat" | "leave" | "gone";
export interface Wolf { id: number; x: number; y: number; mode: WolfMode; t: number; cd: number; orbit: number; dir: 1 | -1; vx: number; vy: number; moving: number; flinch: number; lunge: number }
export type Outcome = "playing" | "won" | "lost";

export type CampEvent =
  | { type: "toast"; text: string }
  | { type: "nisa"; text: string }
  | { type: "gain"; res: Res; n: number; x: number; y: number }
  | { type: "fire"; what: "lit" | "fed" | "relit" | "low" | "out" | "upgraded" }
  | { type: "phase"; phase: Phase }
  | { type: "wolves"; what: "spawn" | "edge" | "inside" | "leave" }
  | { type: "bite"; hearts: number; fromX: number; fromY: number }
  | { type: "heal"; hearts: number }
  | { type: "store"; moved: number }
  | { type: "won" }
  | { type: "lost" };

export type Action =
  | { kind: "pick"; node: ResNode; full: boolean }
  | { kind: "light"; ready: boolean }
  | { kind: "feed"; has: boolean }
  | { kind: "store" }
  | { kind: "talk" }
  | { kind: "slot"; index: number }
  | null;

export interface BuildOption { id: "upgrade" | "fence"; label: string; cost: string; enabled: boolean; note: string }

const C = CAMP_CFG;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export class CampSim {
  readonly layout: CampLayout;
  readonly fire: FireState = { lit: false, everLit: false, fuel: 0, level: 1 };
  readonly inv: Inventory = emptyInv();
  readonly store: Inventory = emptyInv();
  readonly player = { x: 0, y: 0, facing: "up" as "up" | "down" | "left" | "right" };
  readonly lanternSlots: boolean[] = new Array<boolean>(C.lanternSlots).fill(false);
  wolves: Wolf[] = [];
  hearts: number = C.hearts;
  day = 1;
  t = 0;
  phase: Phase = "siang";
  outcome: Outcome = "playing";
  fenceParts = 0;
  lettersFound: string[] = [];
  private said = new Set<string>();
  private lowNagAt = -999;
  private hurtCd = 0;

  constructor(seed: number) {
    this.layout = makeCampLayout(seed);
    this.player.x = this.layout.spawn.x;
    this.player.y = this.layout.spawn.y;
  }

  get nodes(): ResNode[] { return this.layout.nodes; }
  get darkness(): number { return darknessAt(this.t); }
  get sun(): number { return sunStrength(this.day); }
  get burning(): boolean { return this.fire.lit && this.fire.fuel > 0; }

  /** Firelight radius: shrinks with fuel, 0 when out. */
  fireRadius(): number {
    if (!this.burning) return 0;
    const f = Math.min(1, this.fire.fuel / C.fire.fuelMax);
    const r = C.fire.lightMin + (C.fire.lightMax - C.fire.lightMin) * Math.sqrt(f);
    return r * (this.fire.level >= 2 ? C.upgrade.radiusMul : 1);
  }

  lights(): { x: number; y: number; r: number }[] {
    const L: { x: number; y: number; r: number }[] = [{ x: this.layout.nisaLantern.x, y: this.layout.nisaLantern.y - 30, r: C.nisaLanternR }];
    const r = this.fireRadius();
    if (r > 0) L.unshift({ x: this.layout.fire.x, y: this.layout.fire.y, r });
    return L;
  }

  /** True inside the firelight (the safe zone). */
  safeAt(x: number, y: number): boolean {
    const r = this.fireRadius();
    return r > 0 && Math.hypot(x - this.layout.fire.x, y - this.layout.fire.y) < r - 6;
  }

  inCamp(): boolean { return dist(this.player, this.layout.fire) < C.campR; }
  total(res: Res): number { return this.inv[res] + this.store[res]; }

  // ------------------------------------------------------------------ actions
  currentAction(): Action {
    if (this.outcome !== "playing") return null;
    const p = this.player;
    let best: ResNode | null = null, bd: number = C.pickR;
    for (const n of this.layout.nodes) {
      if (n.amount <= 0) continue;
      const d = dist(n, p);
      if (d < bd) { bd = d; best = n; }
    }
    if (best) return { kind: "pick", node: best, full: this.inv[best.kind] >= C.carry[best.kind] };
    const L = this.layout;
    if (dist(p, L.fire) < C.fireUseR) {
      if (!this.fire.everLit) return { kind: "light", ready: this.total("kayu") >= C.fire.firstKayu && this.total("batu") >= C.fire.firstBatu };
      return { kind: "feed", has: this.total("kayu") > 0 };
    }
    if (dist(p, L.storage) < C.storageUseR) return { kind: "store" };
    if (dist(p, L.nisa) < C.nisaTalkR) return { kind: "talk" };
    for (let i = 0; i < L.lanternSlots.length; i++) if (dist(p, L.lanternSlots[i]!) < 46) return { kind: "slot", index: i };
    return null;
  }

  /** Run the action at Affan's position. Gathering is split: `act()` checks, `collect()` applies (after the pose). */
  act(): CampEvent[] {
    const a = this.currentAction();
    if (!a) return [];
    switch (a.kind) {
      case "pick":
        return a.full ? [{ type: "toast", text: `Beg penuh: ${RES_LABEL[a.node.kind]} maksimum ${C.carry[a.node.kind]}. Simpan di stor kem.` }] : [];
      case "light": return this.lightFire();
      case "feed": return this.feed();
      case "store": return this.deposit();
      case "talk": return [{ type: "nisa", text: this.hint() }];
      case "slot": return [{ type: "toast", text: "Tapak lantera kosong. Lantera dibuka dalam Sprint 2." }];
    }
  }

  collect(nodeId: number): CampEvent[] {
    const n = this.layout.nodes[nodeId];
    if (!n || n.amount <= 0 || this.outcome !== "playing") return [];
    if (this.inv[n.kind] >= C.carry[n.kind]) return [{ type: "toast", text: `Beg penuh: ${RES_LABEL[n.kind]} maksimum ${C.carry[n.kind]}.` }];
    n.amount -= 1;
    if (n.amount <= 0) n.respawnAt = this.t + C.respawn[n.kind];
    this.inv[n.kind] += 1;
    const ev: CampEvent[] = [{ type: "gain", res: n.kind, n: 1, x: n.x, y: n.y }];
    if (!this.fire.everLit && this.total("kayu") >= C.fire.firstKayu && this.total("batu") >= C.fire.firstBatu) {
      ev.push(...this.sayOnce("ready", "Bahan cukup! Bawa ke unggun di tengah kem dan hidupkan api."));
    }
    if (n.kind === "dahan") ev.push(...this.sayOnce("dahan", "Dahan itu untuk pagar nanti. Simpan dulu di stor."));
    return ev;
  }

  private take(res: Res, n: number): void {
    const a = Math.min(this.inv[res], n);
    this.inv[res] -= a;
    this.store[res] -= n - a;
  }

  lightFire(): CampEvent[] {
    if (this.fire.everLit) return [];
    const k = C.fire.firstKayu, b = C.fire.firstBatu;
    if (this.total("kayu") < k || this.total("batu") < b) {
      return [{ type: "toast", text: `Perlu ${k} Kayu dan ${b} Batu untuk hidupkan api (ada ${this.total("kayu")} Kayu, ${this.total("batu")} Batu).` }];
    }
    this.take("kayu", k);
    this.take("batu", b);
    this.fire.lit = true;
    this.fire.everLit = true;
    this.fire.fuel = Math.min(C.fire.fuelMax, k * C.fire.logFuel);
    return [{ type: "fire", what: "lit" }, { type: "toast", text: "Api menyala! Cahaya melindungi kem." }, ...this.sayOnce("lit", "Bagus, Affan! Jaga api ini. Tambah Kayu sebelum ia mengecil.")];
  }

  feed(): CampEvent[] {
    if (!this.fire.everLit) return this.lightFire();
    if (this.total("kayu") <= 0) return [{ type: "toast", text: "Tiada Kayu. Kutip kayu di tepi hutan." }];
    if (this.burning && this.fire.fuel > C.fire.fuelMax - C.fire.logFuel * 0.5) return [{ type: "toast", text: "Api sudah penuh." }];
    this.take("kayu", 1);
    const relit = !this.burning;
    this.fire.lit = true;
    this.fire.fuel = Math.min(C.fire.fuelMax, this.fire.fuel + C.fire.logFuel);
    return relit ? [{ type: "fire", what: "relit" }, { type: "toast", text: "Api hidup semula!" }] : [{ type: "fire", what: "fed" }];
  }

  deposit(): CampEvent[] {
    let moved = 0;
    for (const r of RESOURCES) {
      if (r === "beri") continue; // berries stay in the bag (food)
      moved += this.inv[r];
      this.store[r] += this.inv[r];
      this.inv[r] = 0;
    }
    if (!moved) return [{ type: "toast", text: "Tiada bahan untuk disimpan." }];
    return [{ type: "store", moved }, { type: "toast", text: `${moved} bahan disimpan di stor. Unggun boleh guna Kayu dari stor.` }];
  }

  eatBerry(): CampEvent[] {
    if (this.inv.beri <= 0) return [{ type: "toast", text: "Tiada Beri dalam beg." }];
    if (this.hearts >= C.hearts) return [{ type: "toast", text: "Nyawa sudah penuh." }];
    this.inv.beri -= 1;
    this.hearts = Math.min(C.hearts, this.hearts + C.berryHeal);
    return [{ type: "heal", hearts: this.hearts }];
  }

  buildOptions(): BuildOption[] {
    const lv = this.fire.level;
    const up: BuildOption = {
      id: "upgrade",
      label: "Naik taraf unggun",
      cost: `${C.upgrade.batu} Batu`,
      enabled: this.inCamp() && this.fire.everLit && lv < C.upgrade.maxLevel && this.total("batu") >= C.upgrade.batu,
      note: lv >= C.upgrade.maxLevel ? "Sudah dinaik taraf" : !this.fire.everLit ? "Hidupkan api dulu" : "Api lebih tahan, cahaya lebih luas",
    };
    const fence: BuildOption = { id: "fence", label: "Pagar", cost: `${C.fence.partialDahan} Dahan`, enabled: false, note: `Dibuka dalam Sprint ${C.fence.unlockSprint}` };
    return [up, fence];
  }

  build(id: BuildOption["id"]): CampEvent[] {
    const o = this.buildOptions().find((b) => b.id === id);
    if (!o) return [];
    if (!this.inCamp()) return [{ type: "toast", text: "Bina hanya di kem." }];
    if (!o.enabled) return [{ type: "toast", text: o.id === "upgrade" && this.fire.level < C.upgrade.maxLevel && this.fire.everLit ? `Perlu ${o.cost}.` : o.note }];
    this.take("batu", C.upgrade.batu);
    this.fire.level += 1;
    return [{ type: "fire", what: "upgraded" }, { type: "toast", text: "Unggun dinaik taraf! Api kurang cepat padam." }];
  }

  // ------------------------------------------------------------------ loop
  step(dt: number): CampEvent[] {
    const ev: CampEvent[] = [];
    if (this.outcome === "won") {
      // epilogue only: dawn keeps brightening and the wolves keep walking away
      this.t += dt;
      this.stepWolves(dt, ev);
      return [];
    }
    if (this.outcome !== "playing") return ev;
    const prevT = this.t;
    this.t += dt;
    const ph = phaseAt(this.t);
    if (ph !== this.phase) {
      this.phase = ph;
      ev.push({ type: "phase", phase: ph });
      if (ph === "petang") ev.push(...this.sayOnce("petang", this.fire.everLit ? "Dah petang, Affan. Balik ke kem dan tambah Kayu." : "Dah petang! Cepat hidupkan api sebelum gelap."));
      if (ph === "malam") { this.spawnWolves(); ev.push({ type: "wolves", what: "spawn" }, ...this.sayOnce("malam", "Malam dah tiba. Jangan jauh dari cahaya api.")); }
      if (ph === "pagi") {
        this.outcome = "won";
        for (const w of this.wolves) if (w.mode !== "gone") { w.mode = "leave"; w.t = 0; }
        ev.push({ type: "wolves", what: "leave" }, { type: "nisa", text: "Syabas, Affan! Kita selamat sampai pagi." }, { type: "won" });
        return ev;
      }
    }
    if (prevT < 3 && this.t >= 3) ev.push(...this.sayOnce("start", "Affan, kita kena hidupkan api sebelum gelap. Kutip 5 Kayu dan 2 Batu."));
    // fire
    if (this.burning) {
      const night = ph === "malam" || ph === "petang";
      const burn = (night ? C.fire.burnNight : C.fire.burnDay) * (this.fire.level >= 2 ? C.upgrade.burnMul : 1);
      const before = this.fire.fuel;
      this.fire.fuel = Math.max(0, this.fire.fuel - burn * dt);
      if (before > C.fire.low && this.fire.fuel <= C.fire.low) ev.push({ type: "fire", what: "low" });
      if (this.fire.fuel <= C.fire.low && this.t - this.lowNagAt > 30) {
        this.lowNagAt = this.t;
        ev.push({ type: "nisa", text: "Api makin kecil! Masukkan Kayu." });
      }
      if (this.fire.fuel <= 0) {
        this.fire.lit = false;
        ev.push({ type: "fire", what: "out" }, { type: "toast", text: ph === "malam" ? "Api padam! Serigala boleh masuk ke kem!" : "Api padam. Tambah Kayu untuk hidupkan semula." });
      }
    }
    // resources regrow when Affan is not standing on them
    for (const n of this.layout.nodes) {
      if (n.respawnAt !== null && this.t >= n.respawnAt && dist(n, this.player) > 160) { n.amount = n.max; n.respawnAt = null; }
    }
    this.hurtCd = Math.max(0, this.hurtCd - dt);
    this.stepWolves(dt, ev);
    return ev;
  }

  // ------------------------------------------------------------------ wolves (fear the light)
  private spawnWolves(): void {
    const E = this.layout.exits;
    this.wolves = [];
    for (let i = 0; i < C.wolf.count; i++) {
      const e = E[i % E.length]!;
      this.wolves.push({ id: i, x: e.x + (i * 37) % 60, y: e.y, mode: "prowl", t: 0, cd: 0, orbit: Math.atan2(e.y - this.layout.fire.y, e.x - this.layout.fire.x), dir: i % 2 ? -1 : 1, vx: 0, vy: 0, moving: 0, flinch: 0, lunge: 0 });
    }
  }

  private stepWolves(dt: number, ev: CampEvent[]): void {
    const F = this.layout.fire, P = this.player, W = C.wolf;
    const R = this.fireRadius();
    const edge = R > 0 ? R + W.edgePad : 0;
    let anyInside = false;
    for (const w of this.wolves) {
      if (w.mode === "gone") continue;
      w.t += dt;
      w.cd = Math.max(0, w.cd - dt);
      w.flinch = Math.max(0, w.flinch - dt);
      w.lunge = Math.max(0, w.lunge - dt);
      let tx: number, ty: number, sp: number = W.prowl;
      const dP = Math.hypot(P.x - w.x, P.y - w.y);
      const playerSafe = this.safeAt(P.x, P.y);
      if (w.mode === "leave") {
        const a = Math.atan2(w.y - F.y, w.x - F.x);
        tx = w.x + Math.cos(a) * 100; ty = w.y + Math.sin(a) * 100; sp = 95;
        if (w.t > 4) w.mode = "gone";
      } else if (w.mode === "retreat") {
        const a = Math.atan2(w.y - P.y, w.x - P.x);
        tx = w.x + Math.cos(a) * 100; ty = w.y + Math.sin(a) * 100; sp = 90;
        if (w.t > W.retreat) { w.mode = "prowl"; w.t = 0; }
      } else {
        if (!playerSafe && dP < W.sight) { if (w.mode !== "chase") { w.mode = "chase"; w.t = 0; } }
        else if (w.mode === "chase") { w.mode = "prowl"; w.t = 0; }
        if (w.mode === "chase") { tx = P.x; ty = P.y; sp = W.chase; }
        else {
          // circle the camp just outside the light, drifting towards Affan's side
          const aP = Math.atan2(P.y - F.y, P.x - F.x);
          let da = aP - w.orbit; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
          w.orbit += (Math.sign(da) * 0.25 + w.dir * 0.08) * dt;
          const ring = Math.max(edge + 20, 150);
          tx = F.x + Math.cos(w.orbit) * ring; ty = F.y + Math.sin(w.orbit) * ring * 0.8;
        }
      }
      const dx = tx - w.x, dy = ty - w.y, d = Math.hypot(dx, dy);
      const ox = w.x, oy = w.y;
      if (w.flinch > 0.3) sp *= 0.3;
      if (d > 1) { const s = Math.min(d, sp * dt); w.x += (dx / d) * s; w.y += (dy / d) * s; w.vx = dx / d; w.vy = dy / d; }
      if (w.mode === "chase" && dP < 95) w.lunge = 0.35;
      // the light pushes wolves out: they never stand inside the firelight
      if (edge > 0 && w.mode !== "gone") {
        const dF = Math.hypot(w.x - F.x, w.y - F.y);
        if (dF < edge) {
          // caught by the light (fire fed / relit / grew): flinch and back off
          if (dF < edge - 4 && w.flinch <= 0 && w.mode !== "leave") { w.flinch = 0.8; w.mode = "retreat"; w.t = 0; ev.push({ type: "wolves", what: "edge" }); }
          const k = edge / Math.max(dF, 0.001); w.x = F.x + (w.x - F.x) * k; w.y = F.y + (w.y - F.y) * k;
        }
      }
      w.moving = Math.hypot(w.x - ox, w.y - oy) / Math.max(dt, 1e-4);
      if (R === 0 && Math.hypot(w.x - F.x, w.y - F.y) < C.campR) anyInside = true;
      // bite
      if (w.mode === "chase" && dP < W.biteR && w.cd <= 0 && this.hurtCd <= 0 && !playerSafe) {
        this.hearts -= 1;
        this.hurtCd = 1.2;
        w.cd = W.biteCd;
        w.mode = "retreat"; w.t = 0;
        ev.push({ type: "bite", hearts: this.hearts, fromX: w.x, fromY: w.y });
        if (this.hearts <= 0) { this.outcome = "lost"; ev.push({ type: "lost" }); return; }
        ev.push(...this.sayOnce("bitten", "Affan! Lari ke dalam cahaya api!"));
      }
    }
    if (anyInside) ev.push(...this.sayOnce("inside", "Serigala masuk ke kem! Hidupkan api semula!"));
  }

  // ------------------------------------------------------------------ Cikgu Nisa
  private sayOnce(key: string, text: string): CampEvent[] {
    if (this.said.has(key)) return [];
    this.said.add(key);
    return [{ type: "nisa", text }];
  }

  hint(): string {
    if (!this.fire.everLit) {
      const k = Math.max(0, C.fire.firstKayu - this.total("kayu")), b = Math.max(0, C.fire.firstBatu - this.total("batu"));
      return k || b ? `Kita perlukan ${k ? `${k} Kayu lagi` : ""}${k && b ? " dan " : ""}${b ? `${b} Batu lagi` : ""} untuk hidupkan api.` : "Bahan dah cukup. Hidupkan api di unggun!";
    }
    if (!this.burning) return "Api dah padam! Masukkan Kayu cepat.";
    if (this.fire.fuel < C.fire.low + 10) return "Api makin kecil. Tambah Kayu.";
    if (this.phase === "siang") return this.fire.level < 2 ? "Kumpul Batu. Tiga Batu boleh naik taraf unggun (butang Bina)." : "Simpan Kayu di stor untuk malam nanti.";
    return "Jaga api sampai pagi. Cahaya melindungi kita.";
  }

  /** Test/screenshot helper: jump the clock (phase events fire on the next step). */
  setClock(t: number): void {
    this.t = Math.max(0, Math.min(t, T_PAGI + 10));
  }
}

export { T_MALAM, T_PAGI };
