/**
 * Sprint 1 "The Living Camp" (2D storybook, 3/4 top-down, follow camera).
 * Rules live in the shared renderer-free CampSim (src/core/camp); this scene draws the camp, moves
 * Affan, and turns sim events into feedback. The HUD is a separate overlay scene (CampHud).
 */
import Phaser from "phaser";
import { CAMP_CFG, CampSim, RES_LABEL, SAVE_KEY, toSave, type Action, type CampEvent, type Res } from "../core/camp";
import { seedFromUrl } from "../core/game";
import { Affan, ATLAS_KEY, preloadAffan, type Facing } from "./affan";
import { CAMP_ATLAS, Nisa } from "./nisa";
import { WolfSprite } from "./wolfSprite";
import { makeTextures } from "./textures";
import atlasPng from "./assets/storybook.png";
import atlasJson from "./assets/storybook.json";
import campPng from "./assets/camp.png";
import campJson from "./assets/camp.json";
import grassJpg from "./assets/grass.jpg";
import dirtPng from "./assets/dirt.png";
import titleJpg from "./assets/camp_title.jpg";
import { POC_VERSION } from "./version";

const WALK = 118;
const D_DARK = 100000;
const NIGHT = new Phaser.Display.Color(10, 18, 40);
const DUSK = new Phaser.Display.Color(70, 34, 18);

export interface CampInput { x: number; y: number; action: boolean }

const NODE_FRAME: Record<Res, { key: string; s: number; atlas: string }> = {
  kayu: { key: "log", s: 0.3, atlas: ATLAS_KEY },
  batu: { key: "stone", s: 0.34, atlas: ATLAS_KEY },
  dahan: { key: "sticks", s: 0.32, atlas: ATLAS_KEY },
  getah: { key: "stone", s: 0.3, atlas: ATLAS_KEY },
  beri: { key: "bush", s: 0.42, atlas: ATLAS_KEY },
};

export class CampScene extends Phaser.Scene {
  sim!: CampSim;
  affan!: Affan;
  nisa!: Nisa;
  input2: CampInput = { x: 0, y: 0, action: false };
  started = false;
  fps = 0;
  private vel = new Phaser.Math.Vector2();
  private camPos = new Phaser.Math.Vector2();
  private nodeSprites = new Map<number, Phaser.GameObjects.Image>();
  private berryDots = new Map<number, Phaser.GameObjects.Image>();
  private colliders: { x: number; y: number; r: number }[] = [];
  private trees: Phaser.GameObjects.Image[] = [];
  private fireImgs!: { lit: Phaser.GameObjects.Image; unlit: Phaser.GameObjects.Image; embers: Phaser.GameObjects.Image };
  private rack!: Phaser.GameObjects.Image;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dark!: Phaser.GameObjects.RenderTexture;
  private brush!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Image;
  private lanternGlow!: Phaser.GameObjects.Image;
  private shroomGlows: Phaser.GameObjects.Image[] = [];
  private eyes!: Phaser.GameObjects.Graphics;
  private wolves = new Map<number, WolfSprite>();
  private flies: { s: Phaser.GameObjects.Image; x: number; y: number; ph: number; sp: number }[] = [];
  private fog: Phaser.GameObjects.TileSprite[] = [];
  private facingCandidate: Facing = "up";
  private facingHold = 0;
  private knock = new Phaser.Math.Vector2();
  private t = 0;
  private frames = 0;
  private fpsT = 0;
  private outsideEyes: { x: number; y: number; ph: number }[] = [];

  constructor() { super("camp"); }

  preload(): void {
    this.load.atlas(ATLAS_KEY, atlasPng, atlasJson);
    this.load.atlas(CAMP_ATLAS, campPng, campJson);
    preloadAffan(this);
    this.load.image("sbGrass", grassJpg);
    this.load.image("sbDirt", dirtPng);
    this.load.image("campTitle", titleJpg);
  }

  create(): void {
    makeTextures(this);
    const seed = seedFromUrl(location.search);
    this.sim = new CampSim(seed);
    const L = this.sim.layout, F = L.fire, W = L.world;

    // ground: painted grass, a worn clearing around the fire, dirt paths out of the three exits
    this.add.tileSprite(W / 2, W / 2, W + 1400, W + 1400, "sbGrass").setTileScale(0.5).setDepth(-20000);
    const dirt = (x: number, y: number, s: number, a = 1) =>
      this.add.image(x, y, "sbDirt").setScale(s * 0.5).setAlpha(a).setDepth(-19000).setRotation(((x * 13 + y * 7) % 628) / 100);
    dirt(F.x, F.y + 10, 2.6, 0.95);
    dirt(F.x - 200, F.y - 120, 1.3, 0.8);
    dirt(F.x + 210, F.y - 120, 1.3, 0.8);
    for (const e of L.exits) {
      const n = Math.ceil(Math.hypot(e.x - F.x, e.y - F.y) * 1.5 / 50);
      for (let k = 3; k <= n; k++) {
        const t = k / n * 1.5;
        dirt(F.x + (e.x - F.x) * t + Math.sin(k) * 14, F.y + (e.y - F.y) * t, 0.42, 0.9);
      }
    }
    // forest props
    for (const p of L.props) {
      const isTree = p.kind.startsWith("tree");
      const img = this.add.image(p.x, p.y, ATLAS_KEY, p.kind).setOrigin(0.5, isTree ? 0.93 : 0.85).setFlipX(p.flip);
      const base = isTree ? 0.46 : p.kind === "fern" ? 0.5 : 0.55;
      img.setScale(base * p.s).setDepth(p.y);
      if (isTree) this.trees.push(img);
      if (p.r > 0) this.colliders.push({ x: p.x, y: p.y, r: p.r * p.s });
    }
    // camp objects (Camp Object art, placed per the approved blueprint)
    const obj = (x: number, y: number, frame: string, s: number, oy = 0.88, flip = false) =>
      this.add.image(x, y, CAMP_ATLAS, frame).setOrigin(0.5, oy).setScale(s).setFlipX(flip).setDepth(y);
    obj(L.tent.x, L.tent.y, "tent", 0.44, 0.86);
    this.colliders.push({ x: L.tent.x - 30, y: L.tent.y - 6, r: 48 }, { x: L.tent.x + 40, y: L.tent.y - 6, r: 40 });
    this.rack = obj(L.storage.x, L.storage.y, "storage_rack_empty", 0.36, 0.9);
    this.colliders.push({ x: L.storage.x, y: L.storage.y - 8, r: 40 });
    obj(L.nisaLantern.x, L.nisaLantern.y, "lantern_post_lit", 0.3, 0.97);
    this.colliders.push({ x: L.nisaLantern.x - 14, y: L.nisaLantern.y, r: 8 });
    for (const s of L.lanternSlots) {
      obj(s.x, s.y, "lantern_post_empty", 0.3, 0.97);
      this.colliders.push({ x: s.x - 14, y: s.y, r: 9 });
    }
    for (const f of L.fence) {
      const im = obj(f.x, f.y, f.kind, f.s, 0.85, !!f.flip);
      for (let k = -1; k <= 1; k++) this.colliders.push({ x: f.x + k * im.displayWidth * 0.33, y: f.y - 4, r: 12 });
    }
    for (const d of L.decor) {
      obj(d.x, d.y, d.kind, d.s, 0.85);
      if (d.r > 0) this.colliders.push({ x: d.x, y: d.y, r: d.r });
      if (d.kind === "glowing_mushroom_cluster") {
        this.shroomGlows.push(this.add.image(d.x, d.y - 22, "sbGlowW").setTint(0x70ffc8).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_DARK + 1).setScale(0.9).setAlpha(0));
      }
    }
    // the one main campfire
    this.fireImgs = {
      unlit: obj(F.x, F.y, "campfire_unlit", 0.34, 0.6),
      embers: obj(F.x, F.y, "campfire_embers", 0.34, 0.6).setVisible(false),
      lit: obj(F.x, F.y, "campfire_lit", 0.34, 0.72).setVisible(false),
    };
    this.colliders.push({ x: F.x, y: F.y, r: 40 });
    this.sparks = this.add.particles(F.x, F.y - 26, "sbSpark", {
      speedY: { min: -70, max: -30 }, speedX: { min: -16, max: 16 }, lifespan: { min: 700, max: 1500 },
      scale: { start: 0.9, end: 0 }, alpha: { start: 1, end: 0 }, frequency: 70, blendMode: "ADD", gravityY: -10,
    }).setDepth(D_DARK + 2);
    this.sparks.stop();
    // gathering nodes
    for (const n of L.nodes) {
      const f = NODE_FRAME[n.kind];
      const img = this.add.image(n.x, n.y, f.atlas, f.key).setOrigin(0.5, n.kind === "beri" ? 0.85 : 0.7).setScale(f.s).setDepth(n.y);
      if (n.kind === "kayu") img.setRotation(((n.id * 37) % 60 - 30) / 100);
      if (n.kind === "beri") {
        this.colliders.push({ x: n.x, y: n.y, r: 18 });
        this.berryDots.set(n.id, this.add.image(n.x + 6, n.y - 26, "sbBerry").setScale(0.55).setDepth(n.y + 1));
      } else {
        this.tweens.add({ targets: img, y: n.y - 3, duration: 900 + n.id * 40, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }
      this.nodeSprites.set(n.id, img);
    }
    // characters
    this.nisa = new Nisa(this, L.nisa.x, L.nisa.y);
    this.colliders.push({ x: L.nisa.x, y: L.nisa.y, r: 14 });
    this.affan = new Affan(this, L.spawn.x, L.spawn.y);
    this.affan.setFacing("up", this);
    this.camPos.set(L.spawn.x, L.spawn.y - 40);

    // night: half-res darkness erased by light brushes; glows, eyes, fireflies, fog above it
    const { width: w, height: h } = this.scale;
    this.dark = this.add.renderTexture(w / 2, h / 2, Math.ceil(w / 2), Math.ceil(h / 2)).setScrollFactor(0).setDepth(D_DARK);
    this.brush = this.make.image({ key: "sbLight", add: false });
    this.glow = this.add.image(F.x, F.y, "sbGlow").setBlendMode(Phaser.BlendModes.ADD).setDepth(D_DARK + 1).setVisible(false);
    this.lanternGlow = this.add.image(L.nisaLantern.x + 22, L.nisaLantern.y - 62, "sbGlow").setBlendMode(Phaser.BlendModes.ADD).setDepth(D_DARK + 1).setScale(0.4);
    this.eyes = this.add.graphics().setDepth(D_DARK + 4);
    for (let i = 0; i < 26; i++) {
      const s = this.add.image(0, 0, "sbFly").setBlendMode(Phaser.BlendModes.ADD).setDepth(D_DARK + 2).setScale(0.32);
      this.flies.push({ s, x: F.x + (Math.random() - 0.5) * 1500, y: F.y + (Math.random() - 0.4) * 1300, ph: Math.random() * 6.28, sp: 0.5 + Math.random() });
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      this.outsideEyes.push({ x: F.x + Math.cos(a) * (620 + (i % 3) * 120), y: F.y + Math.sin(a) * (520 + (i % 2) * 110), ph: i * 1.7 });
    }
    for (let i = 0; i < 2; i++) {
      this.fog.push(this.add.tileSprite(0, 0, w, h * 0.45, "sbFog").setOrigin(0, 1).setScrollFactor(0).setDepth(D_DARK + 3).setAlpha(i ? 0.25 : 0.45));
    }
    this.applyZoom();
    this.cameras.main.centerOn(this.camPos.x, this.camPos.y);
    this.scale.on("resize", () => this.onResize());
    this.scene.launch("campHud");
    this.exposeTestHooks();
  }

  private applyZoom(): void { this.cameras.main.setZoom(this.scale.height / 310); }

  private onResize(): void {
    const { width: w, height: h } = this.scale;
    this.cameras.main.setSize(w, h);
    this.applyZoom();
    this.dark.resize(Math.ceil(w / 2), Math.ceil(h / 2));
    for (const f of this.fog) f.setSize(w, h * 0.45);
  }

  /** Called by the HUD when the title card is dismissed. */
  start(): void {
    if (this.started) return;
    this.started = true;
  }

  currentAction(): Action { return this.started ? this.sim.currentAction() : null; }

  doAction(): void {
    if (!this.started || this.affan.posing || this.sim.outcome !== "playing") return;
    const a = this.sim.currentAction();
    if (!a) return;
    if (a.kind === "pick" && !a.full) {
      const n = a.node;
      this.affan.setFacing(n.x < this.affan.x ? "left" : "right", this);
      this.affan.pose(this, 520, () => this.handle(this.sim.collect(n.id)));
      return;
    }
    if (a.kind === "light" && a.ready) {
      this.affan.setFacing(this.sim.layout.fire.x < this.affan.x ? "left" : "right", this);
      this.affan.pose(this, 600, () => this.handle(this.sim.act()));
      return;
    }
    this.handle(this.sim.act());
  }

  /** Bina menu / Beg actions from the HUD. */
  build(id: "upgrade" | "fence"): void { this.handle(this.sim.build(id)); }
  eatBerry(): void { this.handle(this.sim.eatBerry()); }

  private floater(text: string, x: number, y: number, color = "#ffeaa8"): void {
    const t = this.add.text(x, y, text, { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "15px", fontStyle: "bold", color, stroke: "#2a1608", strokeThickness: 4 })
      .setOrigin(0.5).setDepth(D_DARK + 6).setResolution(3);
    this.tweens.add({ targets: t, y: y - 34, alpha: { from: 1, to: 0 }, duration: 1300, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }

  private handle(events: CampEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case "toast": this.events.emit("toast", e.text); break;
        case "nisa": this.events.emit("nisa", e.text); break;
        case "gain": {
          const img = this.nodeSprites.get(this.sim.nodes.findIndex((n) => n.x === e.x && n.y === e.y));
          if (img && e.res !== "beri") {
            this.tweens.killTweensOf(img);
            this.tweens.add({ targets: img, x: this.affan.x, y: this.affan.y - 30, scale: 0.05, alpha: 0, duration: 220 });
          }
          this.floater(`+${e.n} ${RES_LABEL[e.res]}`, this.affan.x, this.affan.y - 82);
          this.events.emit("inv");
          break;
        }
        case "fire":
          if (e.what === "lit" || e.what === "relit") { this.cameras.main.flash(260, 255, 190, 110); this.floater("Api menyala!", this.affan.x, this.affan.y - 82, "#ffd27a"); }
          if (e.what === "fed") this.floater("-1 Kayu", this.affan.x, this.affan.y - 82, "#ffb070");
          if (e.what === "upgraded") { this.cameras.main.flash(200, 255, 220, 140); this.floater("Unggun tahap 2!", this.sim.layout.fire.x, this.sim.layout.fire.y - 60, "#ffe08a"); }
          if (e.what === "out") this.cameras.main.shake(300, 0.004);
          this.events.emit("inv");
          break;
        case "phase": this.events.emit("phase", e.phase); this.saveNow(); break;
        case "wolves":
          if (e.what === "spawn") { this.cameras.main.shake(420, 0.005); this.events.emit("toast", "Auuu... serigala keluar dari hutan!"); }
          break;
        case "bite": {
          const a = Math.atan2(this.affan.y - e.fromY, this.affan.x - e.fromX);
          this.knock.set(Math.cos(a) * 320, Math.sin(a) * 320);
          this.cameras.main.shake(260, 0.008);
          this.cameras.main.flash(180, 120, 20, 20);
          this.events.emit("hearts");
          break;
        }
        case "heal": this.floater("+1 Nyawa", this.affan.x, this.affan.y - 82, "#ff9aa8"); this.events.emit("hearts"); this.events.emit("inv"); break;
        case "store": this.events.emit("inv"); break;
        case "won": this.saveNow(); this.events.emit("won"); break;
        case "lost": this.events.emit("lost"); break;
      }
    }
  }

  private saveNow(): void {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(toSave(this.sim))); } catch { /* storage may be unavailable */ }
  }

  update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.08);
    this.t += dt;
    this.frames++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) { this.fps = this.frames / this.fpsT; this.frames = 0; this.fpsT = 0; }
    const sim = this.sim;
    if (this.started) this.handle(sim.step(dt));

    // movement with eased start/stop + bite knockback
    const inp = this.input2;
    const busy = this.affan.posing || !this.started || sim.outcome !== "playing";
    const len = Math.min(1, Math.hypot(inp.x, inp.y));
    const tx = busy || len < 0.01 ? 0 : (inp.x / Math.hypot(inp.x, inp.y)) * len * WALK;
    const ty = busy || len < 0.01 ? 0 : (inp.y / Math.hypot(inp.x, inp.y)) * len * WALK;
    const k = 1 - Math.exp(-dt * (len > 0.01 ? 9 : 12));
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.y += (ty - this.vel.y) * k;
    this.knock.scale(Math.exp(-dt * 6));
    let nx = this.affan.x + (this.vel.x + this.knock.x) * dt;
    let ny = this.affan.y + (this.vel.y + this.knock.y) * dt;
    for (const c of this.colliders) {
      const dx = nx - c.x, dy = (ny - c.y) * 1.6, d = Math.hypot(dx, dy), m = c.r + 14;
      if (d < m && d > 0.001) { nx = c.x + (dx / d) * m; ny = c.y + (dy / d) * m / 1.6; }
    }
    const b = sim.layout.bounds, bd = Math.hypot(nx - b.cx, ny - b.cy);
    if (bd > b.r) { nx = b.cx + ((nx - b.cx) / bd) * b.r; ny = b.cy + ((ny - b.cy) / bd) * b.r; }
    this.affan.root.setPosition(nx, ny).setDepth(ny);
    sim.player.x = nx; sim.player.y = ny;
    const speed = Math.hypot(this.vel.x, this.vel.y);
    if (speed > 14 && !this.affan.posing) {
      const f: Facing = Math.abs(this.vel.x) > Math.abs(this.vel.y) * 1.15 ? (this.vel.x < 0 ? "left" : "right") : this.vel.y < 0 ? "up" : "down";
      if (f !== this.facingCandidate) { this.facingCandidate = f; this.facingHold = 0; }
      this.facingHold += dt;
      if (this.facingHold > 0.07) this.affan.setFacing(f, this);
    }
    sim.player.facing = this.affan.facing;
    this.affan.update(dt, speed / WALK);
    this.nisa.update(dt, nx, ny);
    for (const tr of this.trees) {
      const behind = ny < tr.y - 4 && ny > tr.y - tr.displayHeight * 0.95 && Math.abs(nx - tr.x) < tr.displayWidth * 0.42;
      const a = behind ? 0.42 : 1;
      if (tr.alpha !== a) tr.setAlpha(tr.alpha + (a - tr.alpha) * (1 - Math.exp(-dt * 10)));
    }
    if (inp.action) { inp.action = false; this.doAction(); }

    // nodes: hide taken pickups, bare berry bushes
    for (const n of sim.nodes) {
      const img = this.nodeSprites.get(n.id);
      if (!img) continue;
      if (n.kind === "beri") {
        this.berryDots.get(n.id)?.setVisible(n.amount > 0);
      } else if (n.amount > 0 && (!img.visible || img.alpha < 1)) {
        this.tweens.killTweensOf(img);
        img.setVisible(true).setAlpha(1).setPosition(n.x, n.y).setScale(NODE_FRAME[n.kind].s);
        this.tweens.add({ targets: img, y: n.y - 3, duration: 900 + n.id * 40, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      } else if (n.amount <= 0 && img.visible && !this.tweens.isTweening(img)) {
        img.setVisible(false);
      }
    }
    this.rack.setFrame(sim.store.kayu + sim.store.batu + sim.store.dahan > 0 ? "storage_rack_full" : "storage_rack_empty");

    // wolves
    for (const w of sim.wolves) {
      let s = this.wolves.get(w.id);
      if (!s && w.mode !== "gone") { s = new WolfSprite(this, w); this.wolves.set(w.id, s); }
      s?.update(dt, w, Math.hypot(w.x - nx, w.y - ny), sim.darkness);
    }
    if (!sim.wolves.length && this.wolves.size) { for (const s of this.wolves.values()) s.destroy(); this.wolves.clear(); }

    const cam = this.cameras.main;
    const kc = 1 - Math.exp(-dt * 4.5);
    this.camPos.x += (nx + this.vel.x * 0.45 - this.camPos.x) * kc;
    this.camPos.y += (ny - 34 + this.vel.y * 0.35 - this.camPos.y) * kc;
    cam.centerOn(this.camPos.x, this.camPos.y);

    this.drawFire(dt);
    this.drawLight();
    this.drawFx(dt);
  }

  private drawFire(dt: number): void {
    const f = this.sim.fire, burning = this.sim.burning;
    const lvl = f.fuel / CAMP_CFG.fire.fuelMax;
    const low = burning && f.fuel < 10;
    this.fireImgs.lit.setVisible(burning && !low);
    this.fireImgs.embers.setVisible(low || (!burning && f.everLit && this.t % 1 < 2));
    this.fireImgs.unlit.setVisible(!burning && !f.everLit);
    if (!burning && f.everLit) this.fireImgs.embers.setVisible(true).setAlpha(0.6);
    else this.fireImgs.embers.setAlpha(1);
    if (burning) {
      const s = 0.34 * (0.85 + 0.2 * Math.min(1, lvl * 1.4));
      this.fireImgs.lit.setScale(s * (1 + Math.sin(this.t * 9) * 0.015), s * (1 + Math.sin(this.t * 13) * 0.035));
      if (!this.sparks.emitting) this.sparks.start();
      this.sparks.frequency = 160 - 120 * lvl;
    } else if (this.sparks.emitting) this.sparks.stop();
    void dt;
  }

  private drawLight(): void {
    const cam = this.cameras.main, z = cam.zoom, view = cam.worldView;
    const dk = this.sim.darkness;
    this.dark.setPosition(cam.width / 2, cam.height / 2).setScale(2 / z);
    this.dark.setVisible(dk > 0.01);
    this.lanternGlow.setAlpha(0.25 + dk * 0.9 + Math.sin(this.t * 7) * 0.05);
    for (const g of this.shroomGlows) g.setAlpha(dk * 0.8 + Math.sin(this.t * 1.3 + g.x) * 0.05 * dk);
    const L0 = this.sim.lights()[0];
    const fireR = this.sim.fireRadius();
    this.glow.setVisible(fireR > 0);
    if (fireR > 0) this.glow.setPosition(this.sim.layout.fire.x, this.sim.layout.fire.y - 10).setScale((fireR * 1.3) / 256).setAlpha((0.35 + dk * 0.6) + Math.sin(this.t * 11) * 0.06);
    if (dk <= 0.01) return;
    const night = Math.min(1, Math.max(0, (dk - 0.3) / 0.4));
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(DUSK, NIGHT, 100, night * 100);
    this.dark.clear().fill(Phaser.Display.Color.GetColor(c.r, c.g, c.b), Math.min(0.92, dk));
    const erase = (x: number, y: number, r: number, a: number) => {
      this.brush.setPosition((x - view.x) * z * 0.5, (y - view.y) * z * 0.5).setScale((r * 2 * z * 0.5) / 256).setAlpha(a);
      this.dark.erase(this.brush);
    };
    for (const L of this.sim.lights()) erase(L.x, L.y, L.r * (L === L0 && fireR > 0 ? 1 + Math.sin(this.t * 9) * 0.015 : 1), 1);
    // a little moonlight around Affan so he never vanishes
    erase(this.affan.x, this.affan.y - 30, 95, 0.45);
  }

  private drawFx(dt: number): void {
    const view = this.cameras.main.worldView;
    const dk = this.sim.darkness;
    this.eyes.clear();
    const pair = (x: number, y: number, s: number, a = 1) => {
      this.eyes.fillStyle(0xff3010, 0.3 * a).fillCircle(x - 4 * s, y, 4.5 * s).fillCircle(x + 4 * s, y, 4.5 * s);
      this.eyes.fillStyle(0xff2a22, a).fillEllipse(x - 4 * s, y, 4 * s, 2.2 * s).fillEllipse(x + 4 * s, y, 4 * s, 2.2 * s);
    };
    if (dk > 0.3) {
      // red eyes deep in the forest
      for (const e of this.outsideEyes) {
        if (Math.sin(this.t * 1.6 + e.ph) < -0.6) continue;
        if (!Phaser.Geom.Rectangle.Contains(view, e.x, e.y)) continue;
        pair(e.x, e.y, 0.9, Math.min(1, (dk - 0.3) * 2));
      }
      // the wolves' own eyes glow in the dark
      for (const s of this.wolves.values()) for (const p of s.eyes()) {
        this.eyes.fillStyle(0xff3010, 0.35 * dk).fillCircle(p.x, p.y, 4);
        this.eyes.fillStyle(0xffb040, dk).fillCircle(p.x, p.y, 1.6);
      }
    }
    for (const f of this.flies) {
      f.ph += dt * f.sp;
      f.x += Math.cos(f.ph * 0.9) * 10 * dt;
      f.y += Math.sin(f.ph * 1.3) * 7 * dt;
      if (f.x < view.x - 40) f.x += view.width + 80;
      if (f.x > view.right + 40) f.x -= view.width + 80;
      if (f.y < view.y - 40) f.y += view.height + 80;
      if (f.y > view.bottom + 40) f.y -= view.height + 80;
      f.s.setPosition(f.x, f.y).setAlpha((0.15 + 0.85 * dk) * (0.35 + 0.65 * Math.max(0, Math.sin(f.ph * 3))));
    }
    this.fog.forEach((f, i) => {
      f.tilePositionX += dt * (i ? 9 : 5);
      f.setPosition(0, this.scale.height + (i ? 10 : 30));
    });
  }

  private exposeTestHooks(): void {
    const scene = this; // eslint-disable-line @typescript-eslint/no-this-alias
    const w = window as unknown as { __ABC_SB__?: unknown };
    w.__ABC_SB__ = {
      version: POC_VERSION,
      ready: true,
      get started() { return scene.started; },
      get phase() { return scene.sim.phase; },
      get clock() { return scene.sim.t; },
      get outcome() { return scene.sim.outcome; },
      get hearts() { return scene.sim.hearts; },
      get inv() { return { ...scene.sim.inv }; },
      get store() { return { ...scene.sim.store }; },
      get fire() { return { ...scene.sim.fire, radius: scene.sim.fireRadius() }; },
      get player() { return { x: scene.affan.x, y: scene.affan.y, facing: scene.affan.facing }; },
      get wolves() { return scene.sim.wolves.map((x) => ({ x: x.x, y: x.y, mode: x.mode })); },
      get busy() { return scene.affan.posing; },
      get fps() { return scene.fps; },
      nodes: () => scene.sim.nodes.map((n) => ({ id: n.id, kind: n.kind, x: n.x, y: n.y, amount: n.amount })),
      camp: () => ({ ...scene.sim.layout.fire }),
      places: () => ({ fire: scene.sim.layout.fire, tent: scene.sim.layout.tent, nisa: scene.sim.layout.nisa, storage: scene.sim.layout.storage, slots: scene.sim.layout.lanternSlots, exits: scene.sim.layout.exits }),
      start: () => scene.events.emit("startGame"),
      goTo: (x: number, y: number) => { scene.affan.root.setPosition(x, y); scene.sim.player.x = x; scene.sim.player.y = y; scene.camPos.set(x, y - 34); },
      act: () => scene.doAction(),
      setInput: (x: number, y: number) => { scene.input2.x = x; scene.input2.y = y; },
      setClock: (t: number) => scene.sim.setClock(t),
      build: (id: "upgrade" | "fence") => scene.build(id),
      save: () => toSave(scene.sim),
    };
  }
}
