/**
 * Sprint 1 "The Living Camp" (2D storybook, 3/4 top-down, follow camera).
 * Rules live in the shared renderer-free CampSim (src/core/camp); this scene draws the camp, moves
 * Affan, and turns sim events into feedback. The HUD is a separate overlay scene (CampHud).
 */
import Phaser from "phaser";
import { CAMP_CFG, CampSim, RES_LABEL, SAVE_KEY, toSave, walkable, walkDist, type Action, type CampEvent, type CampLayout, type FenceSeg, type FenceState, type PropKind, type Pt, type Res } from "../core/camp";
import { seedFromUrl } from "../core/game";
import { Affan, ATLAS_KEY, preloadAffan, type Facing } from "./affan";
import { CAMP_ATLAS, Nisa } from "./nisa";
import { WolfSprite } from "./wolfSprite";
import { makeTextures } from "./textures";
import atlasPng from "./assets/storybook.png";
import atlasJson from "./assets/storybook.json";
import campPng from "./assets/camp.png";
import campJson from "./assets/camp.json";
import camp2Png from "./assets/camp2.png";
import camp2Json from "./assets/camp2.json";
import camp2Meta from "./assets/camp2_meta.json";
import groundGrass from "./assets/ground_grass.jpg";
import groundDirt from "./assets/ground_dirt.jpg";
import titleJpg from "./assets/camp_title.jpg";
import { POC_VERSION } from "./version";

const WALK = 118;
const D_DARK = 100000;
const NIGHT = new Phaser.Display.Color(10, 18, 40);
const DUSK = new Phaser.Display.Color(70, 34, 18);

export interface CampInput { x: number; y: number; action: boolean }

export const CAMP2_ATLAS = "camp2";
/** Flow-art sprites are stored at a fixed pixels-per-world-unit, so they all share this scale */
export const FLOW_S = camp2Meta.scale;
/** world units per mask pixel (soft masks are drawn small and scaled up) */
const DIRT_M = 6;
const SHADE_M = 16;

const NODE_FRAME: Record<Res, { key: string; s: number; atlas: string }> = {
  kayu: { key: "log", s: 0.3, atlas: ATLAS_KEY },
  batu: { key: "stone", s: 0.34, atlas: ATLAS_KEY },
  dahan: { key: "sticks", s: 0.32, atlas: ATLAS_KEY },
  beri: { key: "berry_bush", s: 0.42, atlas: CAMP2_ATLAS },
};

const PROP_ART: Record<PropKind, { atlas: string; frame: string; s: number; oy: number }> = {
  tree_oak: { atlas: ATLAS_KEY, frame: "tree_oak", s: 0.46, oy: 0.93 },
  tree_pine1: { atlas: ATLAS_KEY, frame: "tree_pine1", s: 0.46, oy: 0.93 },
  tree_pine2: { atlas: ATLAS_KEY, frame: "tree_pine2", s: 0.46, oy: 0.93 },
  fern: { atlas: ATLAS_KEY, frame: "fern", s: 0.5, oy: 0.85 },
  stump: { atlas: ATLAS_KEY, frame: "stump", s: 0.55, oy: 0.85 },
  rock_big: { atlas: ATLAS_KEY, frame: "rock_big", s: 0.55, oy: 0.85 },
  rocks_cluster: { atlas: ATLAS_KEY, frame: "rocks_cluster", s: 0.55, oy: 0.85 },
  bush: { atlas: CAMP2_ATLAS, frame: "bush", s: 0.45, oy: 0.88 },
  grass_tuft: { atlas: CAMP2_ATLAS, frame: "grass_tuft", s: 0.33, oy: 0.85 },
  flowers: { atlas: CAMP2_ATLAS, frame: "flowers", s: 0.36, oy: 0.85 },
  boulder: { atlas: CAMP2_ATLAS, frame: "boulder", s: 0.5, oy: 0.86 },
  rocks_moss: { atlas: CAMP2_ATLAS, frame: "rocks_moss", s: 0.45, oy: 0.82 },
  stump2: { atlas: CAMP2_ATLAS, frame: "stump2", s: 0.45, oy: 0.85 },
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
  private colliders: { x: number; y: number; r: number }[] = [];
  private trees: Phaser.GameObjects.Image[] = [];
  private fireImgs!: { lit: Phaser.GameObjects.Image; unlit: Phaser.GameObjects.Image; embers: Phaser.GameObjects.Image };
  private rack!: Phaser.GameObjects.Image;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dark!: Phaser.GameObjects.RenderTexture;
  private brush!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Image;
  private aStone!: { glow: Phaser.GameObjects.Image; halo: Phaser.GameObjects.Image; level: number };
  private lanternGlow!: Phaser.GameObjects.Image;
  private shroomGlows: Phaser.GameObjects.Image[] = [];
  private eyes!: Phaser.GameObjects.Graphics;
  private wolves = new Map<number, WolfSprite>();
  private flies: { s: Phaser.GameObjects.Image; x: number; y: number; ph: number; sp: number }[] = [];
  fog: Phaser.GameObjects.TileSprite[] = [];
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
    this.load.atlas(CAMP2_ATLAS, camp2Png, camp2Json);
    this.load.image("gGrass", groundGrass);
    this.load.image("gDirt", groundDirt);
    this.load.image("campTitle", titleJpg);
  }

  create(): void {
    makeTextures(this);
    const seed = seedFromUrl(location.search);
    this.sim = new CampSim(seed);
    const L = this.sim.layout, F = L.fire, W = L.worldW, H = L.worldH;

    // ground: painted grass everywhere, darker forest floor away from the paths, and ONE flat packed-dirt
    // layer (clearing + trails + stony valley) cut out by a soft mask drawn from the shared layout
    this.add.tileSprite(W / 2, H / 2, W + 1600, H + 1600, "gGrass").setTileScale(0.62).setDepth(-20000);
    this.add.image(0, 0, this.makeShadeMask(L)).setOrigin(0).setScale(SHADE_M).setDepth(-19900);
    const dirt = this.add.tileSprite(W / 2, H / 2, W, H, "gDirt").setTileScale(0.34).setDepth(-19000);
    const maskImg = this.make.image({ x: 0, y: 0, key: this.makeDirtMask(L), add: false }).setOrigin(0).setScale(DIRT_M);
    dirt.setMask(new Phaser.Display.Masks.BitmapMask(this, maskImg));

    // forest + zone props
    for (const p of L.props) {
      const isTree = p.kind.startsWith("tree");
      const def = PROP_ART[p.kind];
      const img = this.add.image(p.x, p.y, def.atlas, def.frame).setOrigin(0.5, def.oy).setFlipX(p.flip);
      img.setScale(def.s * p.s).setDepth(p.y);
      if (isTree) this.trees.push(img);
      if (p.kind === "grass_tuft") img.setTint(0xa8c890); // the source tuft is near-black; keep it a grass green
    }
    for (const b of L.blockers) this.colliders.push(b);

    // camp objects
    const obj = (x: number, y: number, frame: string, s: number, oy = 0.88, flip = false, atlas = CAMP_ATLAS) =>
      this.add.image(x, y, atlas, frame).setOrigin(0.5, oy).setScale(s).setFlipX(flip).setDepth(y);
    for (const t of L.tents) obj(t.x, t.y, t.kind, t.s, 0.86, !!t.flip, CAMP2_ATLAS);
    for (const f of L.furniture) obj(f.x, f.y, f.kind, FLOW_S * f.s, 1, false, CAMP2_ATLAS);
    this.makeLetterStone(L.letterSlot);
    this.rack = obj(L.storage.x, L.storage.y, "storage_rack_empty", 0.36, 0.9);
    obj(L.nisaLantern.x, L.nisaLantern.y, "lantern_post_lit", 0.3, 0.97);
    for (const s of L.lanternSlots) obj(s.x, s.y, "lantern_post_empty", 0.3, 0.97);
    this.drawFence(L.fence, this.sim.fenceStates);
    for (const d of L.decor) obj(d.x, d.y, d.kind, d.s, 0.85);
    for (const p of L.props) {
      if (p.kind === "flowers" && Math.hypot(p.x - F.x, p.y - F.y) < 900 && (p.x * 7 + p.y) % 3 < 1) {
        this.shroomGlows.push(this.add.image(p.x, p.y - 8, "sbGlowW").setTint(0x9fe8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_DARK + 1).setScale(0.45).setAlpha(0));
      }
    }
    // the one main campfire
    this.fireImgs = {
      unlit: obj(F.x, F.y, "campfire_unlit", 0.34, 0.6),
      embers: obj(F.x, F.y, "campfire_embers", 0.34, 0.6).setVisible(false),
      lit: obj(F.x, F.y, "campfire_lit", 0.34, 0.72).setVisible(false),
    };
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
      } else {
        this.tweens.add({ targets: img, y: n.y - 3, duration: 900 + n.id * 40, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }
      this.nodeSprites.set(n.id, img);
    }
    // characters
    this.nisa = new Nisa(this, this.sim.nisa);
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
      // red eyes sit in the forest, never on the open ground
      let r = 640 + (i % 3) * 110, x = F.x + Math.cos(a) * r, y = F.y + Math.sin(a) * r * 0.85;
      while (walkDist({ x, y }) < 60 && r < 1400) { r += 40; x = F.x + Math.cos(a) * r; y = F.y + Math.sin(a) * r * 0.85; }
      this.outsideEyes.push({ x, y, ph: i * 1.7 });
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

  /** test/screenshot hook: a fixed camera zoom (null = normal) */
  zoomOverride: number | null = null;
  applyZoom(): void { this.cameras.main.setZoom(this.zoomOverride ?? this.scale.height / 310); }

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

  /** Darker forest floor away from the open ground (low-res, scaled up = soft). */
  private makeShadeMask(L: CampLayout): string {
    const key = "campShade", w = Math.ceil(L.worldW / SHADE_M), h = Math.ceil(L.worldH / SHADE_M);
    if (this.textures.exists(key)) this.textures.remove(key);
    const t = this.textures.createCanvas(key, w, h)!;
    const ctx = t.getContext(), img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const d = walkDist({ x: (x + 0.5) * SHADE_M, y: (y + 0.5) * SHADE_M });
      const a = Math.max(0, Math.min(0.62, (d + 20) / 420)) + Math.max(0, Math.min(0.2, (d - 700) / 1200));
      const i = (y * w + x) * 4;
      img.data[i] = 8; img.data[i + 1] = 22; img.data[i + 2] = 14; img.data[i + 3] = Math.round(a * 255);
    }
    ctx.putImageData(img, 0, 0);
    t.refresh();
    return key;
  }

  /** Where the packed dirt shows: the flat camp clearing, the three trails, the stony valley. */
  private makeDirtMask(L: CampLayout): string {
    const key = "campDirtMask", w = Math.ceil(L.worldW / DIRT_M), h = Math.ceil(L.worldH / DIRT_M);
    if (this.textures.exists(key)) this.textures.remove(key);
    const t = this.textures.createCanvas(key, w, h)!;
    const ctx = t.getContext();
    const k = 1 / DIRT_M;
    ctx.filter = "blur(2px)";
    // clearing: solid, with a soft worn rim
    const F = L.fire, R = L.clearingR;
    const g = ctx.createRadialGradient(F.x * k, F.y * k, 0, F.x * k, F.y * k, (R + 34) * k);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(R / (R + 34) - 0.04, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(F.x * k, F.y * k, (R + 34) * k, 0, Math.PI * 2); ctx.fill();
    // trails: a tapering band of dirt, slightly softer deeper in
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const tr of L.trails) {
      const n = tr.pts.length - 1;
      for (let i = 0; i < n; i++) {
        const a = tr.pts[i]!, b = tr.pts[i + 1]!;
        ctx.strokeStyle = `rgba(255,255,255,${(1 - (i / n) * 0.25).toFixed(2)})`;
        ctx.lineWidth = (tr.w0 + (tr.w1 - tr.w0) * ((i + 0.5) / n)) * 0.86 * k;
        ctx.beginPath(); ctx.moveTo(a.x * k, a.y * k); ctx.lineTo(b.x * k, b.y * k); ctx.stroke();
      }
    }
    for (const a of L.areas) {
      const alpha = a.ground === "stony" ? 0.9 : a.ground === "dirt" ? 0.75 : 0;
      if (alpha <= 0) continue;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath(); ctx.ellipse(a.x * k, a.y * k, a.rx * 0.92 * k, a.ry * 0.92 * k, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.filter = "none";
    t.refresh();
    return key;
  }

  /** Letter-A stone beside the fire (Flow art): dull stone + its glowing letter, filled bottom-up by sim.letterGlow(). */
  private makeLetterStone(p: Pt): void {
    this.add.image(p.x, p.y, CAMP2_ATLAS, "a_stone").setOrigin(0.5, 0.96).setScale(FLOW_S).setDepth(p.y);
    const glow = this.add.image(p.x, p.y, CAMP2_ATLAS, "a_stone_glow").setOrigin(0.5, 0.96).setScale(FLOW_S).setDepth(p.y + 0.5);
    const halo = this.add.image(p.x, p.y - 20, "sbGlowW").setTint(0xffa040).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_DARK + 1).setScale(0.5).setAlpha(0);
    this.aStone = { glow, halo, level: 0 };
  }

  private drawLetterStone(dt: number): void {
    const S = this.aStone, want = this.sim.letterGlow();
    S.level += (want - S.level) * (1 - Math.exp(-dt * 3));
    const fr = S.glow.frame, { y0, y1 } = camp2Meta.aLetter;
    // fill the carved letter from its foot upwards; above half, the whole letter burns brighter
    const fill = Math.min(1, S.level * 2);
    const top = fr.height * (y1 - (y1 - y0) * fill);
    S.glow.setCrop(0, top, fr.width, fr.height - top).setVisible(fill > 0.01);
    const flick = 1 + Math.sin(this.t * 9) * 0.04 + Math.sin(this.t * 23) * 0.02;
    S.glow.setAlpha(Math.min(1, 0.55 + S.level * 0.6) * flick);
    S.halo.setAlpha(Math.max(0, S.level - 0.1) * (0.35 + this.sim.darkness * 0.6) * flick).setScale(0.35 + S.level * 0.35);
  }

  /**
   * Fence pieces (Flow art): weak = standing, damaged = leaning or half-broken, missing = collapsed on the ground
   * (walkable), solid = the original camp fence. The art runs low-left to high-right; it is mirrored/tilted to
   * follow each ring slot. Trail gates stay empty.
   */
  private drawFence(segs: FenceSeg[], states: FenceState[]): void {
    const ART_ANG = -0.31; // slope of the pieces as drawn
    segs.forEach((f, i) => {
      const st = states[i];
      if (st === undefined || (st === "missing" && f.gate)) return;
      const frame = st === "weak" ? "fence_weak" : st === "damaged" ? (Math.floor(f.id / 4) % 2 ? "fence_leaning" : "fence_halfbroken") : st === "missing" ? "fence_collapsed" : "fence_segment";
      const atlas = st === "solid" ? CAMP_ATLAS : CAMP2_ATLAS;
      const dx = f.b.x - f.a.x, dy = f.b.y - f.a.y;
      const mid = { x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 };
      let ang = Math.atan2(dy, dx);
      if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI; // left-to-right
      const flip = ang > 0;
      const base = st === "solid" ? 0 : flip ? -ART_ANG : ART_ANG;
      const rot = Phaser.Math.Clamp(ang - base, -0.45, 0.45);
      const sx = Phaser.Math.Clamp(Math.abs(dx) / 95 + 0.3, 0.6, 1.1);
      const s = st === "solid" ? 0.32 : FLOW_S;
      const img = this.add.image(mid.x, mid.y, atlas, frame).setOrigin(0.5, st === "missing" ? 0.6 : 0.85).setFlipX(flip).setRotation(rot);
      img.setScale(s * sx, s).setDepth(st === "missing" ? mid.y - 40 : mid.y);
    });
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
    if (sim.nisa.mode !== "sit") {
      const dx = nx - sim.nisa.x, dy = (ny - sim.nisa.y) * 1.6, d = Math.hypot(dx, dy), m = 26;
      if (d < m && d > 0.001) { nx = sim.nisa.x + (dx / d) * m; ny = sim.nisa.y + (dy / d) * m / 1.6; }
    }
    // stay on open ground (camp, trails, zones); slide along the forest edge
    const ox = this.affan.x, oy = this.affan.y;
    if (!walkable(nx, ny) && walkable(ox, oy)) {
      if (walkable(nx, oy)) ny = oy;
      else if (walkable(ox, ny)) nx = ox;
      else { nx = ox; ny = oy; }
    }
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
    this.nisa.update(dt);
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
        const fr = n.amount > 0 ? "berry_bush" : "bush";
        if (img.frame.name !== fr) img.setFrame(fr);
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
    this.drawLetterStone(dt);
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
      places: () => {
        const L = scene.sim.layout;
        return { world: { w: L.worldW, h: L.worldH }, fire: L.fire, letterSlot: L.letterSlot, tent: L.tent, tents: L.tents, furniture: L.furniture, nisa: L.nisa, storage: L.storage, slots: L.lanternSlots, exits: L.exits, fence: L.fence.map((f, i) => ({ ...f, state: scene.sim.fenceStates[i] })) };
      },
      get nisa() { return { x: scene.sim.nisa.x, y: scene.sim.nisa.y, mode: scene.sim.nisa.mode, toGo: Math.hypot(scene.sim.nisa.target.x - scene.sim.nisa.x, scene.sim.nisa.target.y - scene.sim.nisa.y) }; },
      zoom: (z: number | null) => { scene.zoomOverride = z; scene.applyZoom(); for (const f of scene.fog) f.setVisible(z === null); },
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
