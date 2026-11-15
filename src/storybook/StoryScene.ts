/**
 * Storybook vertical slice (2D, painted, 3/4 top-down with a free follow camera).
 * Game rules come from the shared GameCore (fire, light radius, red eyes) plus the slice quest.
 */
import Phaser from "phaser";
import { GameCore, seedFromUrl, type CoreEvent } from "../core/game";
import { CFG } from "../core/balance";
import { lightAt } from "../core/light";
import { Affan, ATLAS_KEY, preloadAffan, type Facing } from "./affan";
import { makeLayout, type Pickup, type StoryLayout } from "./layout";
import { addStone, addWood, canLight, createQuest, questDone, WOOD_GOAL, type QuestState } from "./quest";
import { makeTextures } from "./textures";
import atlasPng from "./assets/storybook.png";
import atlasJson from "./assets/storybook.json";
import grassJpg from "./assets/grass.jpg";
import dirtPng from "./assets/dirt.png";
import { POC_VERSION } from "./version";

const WALK = 118; // world units / s
const PICK_R = 52;
const NIGHT = 0x0a1224;
const D_DARK = 100000;

export interface StoryInput { x: number; y: number; action: boolean }
export type Action = { kind: "pick"; p: Pickup } | { kind: "light" } | { kind: "feed" } | null;

export class StoryScene extends Phaser.Scene {
  core!: GameCore;
  quest!: QuestState;
  lay!: StoryLayout;
  affan!: Affan;
  input2: StoryInput = { x: 0, y: 0, action: false };
  hearts = CFG.CHAR_HP;
  private vel = new Phaser.Math.Vector2();
  private camPos = new Phaser.Math.Vector2();
  private pickSprites = new Map<number, Phaser.GameObjects.Image>();
  private colliders: { x: number; y: number; r: number }[] = [];
  private trees: Phaser.GameObjects.Image[] = [];
  private dark!: Phaser.GameObjects.RenderTexture;
  private brush!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Image;
  private flames: Phaser.GameObjects.Image[] = [];
  private eyes!: Phaser.GameObjects.Graphics;
  private flies: { s: Phaser.GameObjects.Image; x: number; y: number; ph: number; sp: number }[] = [];
  private fog: Phaser.GameObjects.TileSprite[] = [];
  private wolf?: Phaser.GameObjects.Image;
  private wolfState: "none" | "eyes" | "stalk" | "flee" | "gone" = "none";
  private wolfT = 0;
  private t = 0;
  private facingCandidate: Facing = "down";
  private facingHold = 0;
  private respawnQ: { id: number; at: number }[] = [];
  private frames = 0;
  private fpsT = 0;
  fps = 0;
  over = false;

  constructor() {
    super("story");
  }

  preload(): void {
    this.load.atlas(ATLAS_KEY, atlasPng, atlasJson);
    preloadAffan(this);
    this.load.image("sbGrass", grassJpg);
    this.load.image("sbDirt", dirtPng);
  }

  create(): void {
    makeTextures(this);
    const seed = seedFromUrl(location.search);
    this.core = new GameCore(seed);
    this.core.fire.logs = 0;
    for (const c of this.core.world.camps) c.lit = false;
    this.quest = createQuest();
    const camp = this.core.mainCamp;
    this.lay = makeLayout(seed, camp);
    const W = CFG.WORLD;

    // ground: painted grass tile + dirt path and clearing decals
    this.add.tileSprite(W / 2, W / 2, W + 1200, W + 1200, "sbGrass").setTileScale(0.5).setDepth(-20000);
    const dirt = (x: number, y: number, s: number, a = 1) =>
      this.add.image(x, y, "sbDirt").setScale(s * 0.5).setAlpha(a).setDepth(-19000).setRotation(((x * 13 + y * 7) % 628) / 100);
    dirt(camp.x, camp.y, 1.9);
    const P = this.lay.path;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i]!, b = P[i + 1]!;
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 45);
      for (let k = 0; k < n; k++) dirt(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, 0.42, 0.9);
    }

    // props, y-sorted
    for (const p of this.lay.props) {
      const isTree = p.kind.startsWith("tree");
      const img = this.add.image(p.x, p.y, ATLAS_KEY, p.kind).setOrigin(0.5, isTree ? 0.93 : 0.85).setFlipX(p.flip);
      const base = isTree ? 0.46 : p.kind === "mushroom" ? 0.34 : p.kind === "fern" || p.kind === "bush" ? 0.5 : 0.55;
      img.setScale(base * p.s).setDepth(p.y);
      if (isTree) this.trees.push(img);
      if (p.r > 0) this.colliders.push({ x: p.x, y: p.y, r: p.r * p.s });
    }
    const tw = this.lay.twisted;
    this.trees.push(this.add.image(tw.x, tw.y, ATLAS_KEY, "tree_twisted").setOrigin(0.5, 0.92).setScale(0.6).setDepth(tw.y));
    this.colliders.push({ x: tw.x, y: tw.y, r: 40 });

    // campfire
    this.add.image(camp.x, camp.y, ATLAS_KEY, "campfire").setOrigin(0.5, 0.7).setScale(0.42).setDepth(camp.y);
    this.colliders.push({ x: camp.x, y: camp.y, r: 34 });
    for (let i = 0; i < 3; i++) {
      this.flames.push(this.add.image(camp.x, camp.y - 4, ATLAS_KEY, `flame${i}`).setOrigin(0.5, 0.95).setScale(0.36).setDepth(camp.y + 1).setVisible(false));
    }

    // pickups
    for (const p of this.lay.pickups) this.spawnPickup(p);

    // Affan
    this.affan = new Affan(this, this.lay.spawn.x, this.lay.spawn.y);
    this.affan.setFacing("up", this);
    this.camPos.set(this.lay.spawn.x, this.lay.spawn.y - 40);

    // darkness (half-res render texture, erased by light brushes), glow, eyes, fireflies, fog
    const { width: w, height: h } = this.scale;
    this.dark = this.add.renderTexture(w / 2, h / 2, Math.ceil(w / 2), Math.ceil(h / 2)).setScrollFactor(0).setDepth(D_DARK);
    this.brush = this.make.image({ key: "sbLight", add: false });
    this.glow = this.add.image(camp.x, camp.y, "sbGlow").setBlendMode(Phaser.BlendModes.ADD).setDepth(D_DARK + 1).setVisible(false);
    this.eyes = this.add.graphics().setDepth(D_DARK + 4);
    for (let i = 0; i < 28; i++) {
      const s = this.add.image(0, 0, "sbFly").setBlendMode(Phaser.BlendModes.ADD).setDepth(D_DARK + 2).setScale(0.32);
      this.flies.push({ s, x: camp.x + (Math.random() - 0.5) * 1500, y: camp.y + (Math.random() - 0.4) * 1300, ph: Math.random() * 6.28, sp: 0.5 + Math.random() });
    }
    for (let i = 0; i < 2; i++) {
      this.fog.push(this.add.tileSprite(0, 0, w, h * 0.45, "sbFog").setOrigin(0, 1).setScrollFactor(0).setDepth(D_DARK + 3).setAlpha(i ? 0.25 : 0.45));
    }

    const cam = this.cameras.main;
    this.applyZoom();
    cam.centerOn(this.camPos.x, this.camPos.y);
    this.scale.on("resize", () => this.onResize());

    this.scene.launch("storyHud");
    this.exposeTestHooks();
  }

  private spawnPickup(p: Pickup): void {
    const key = p.kind === "log" ? "log" : "stone";
    const img = this.add.image(p.x, p.y, ATLAS_KEY, key).setOrigin(0.5, 0.7).setScale(p.kind === "log" ? 0.3 : 0.32).setDepth(p.y);
    if (p.kind === "log") img.setRotation(((p.id * 37) % 60 - 30) / 100);
    // a gentle bob so pickups read as interactive
    this.tweens.add({ targets: img, y: p.y - 3, duration: 900 + p.id * 40, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.pickSprites.set(p.id, img);
  }

  private applyZoom(): void {
    const h = this.scale.height;
    this.cameras.main.setZoom(h / 310);
  }

  private onResize(): void {
    const { width: w, height: h } = this.scale;
    this.cameras.main.setSize(w, h);
    this.applyZoom();
    this.dark.resize(Math.ceil(w / 2), Math.ceil(h / 2));
    for (const f of this.fog) f.setSize(w, h * 0.45);
  }

  /** What the action button would do right now. */
  currentAction(): Action {
    if (this.over) return null;
    const ax = this.affan.x, ay = this.affan.y;
    let best: Pickup | null = null, bd = PICK_R;
    for (const p of this.lay.pickups) {
      if (p.taken) continue;
      const d = Math.hypot(p.x - ax, p.y - ay);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) return { kind: "pick", p: best };
    const camp = this.core.mainCamp;
    if (Math.hypot(camp.x - ax, camp.y - ay) < 95) {
      if (canLight(this.quest, this.core.fire.logs)) return { kind: "light" };
      if (this.quest.lit && this.core.fire.logs > 0) return { kind: "feed" };
    }
    return null;
  }

  doAction(): void {
    const a = this.currentAction();
    if (!a || this.affan.posing) return;
    if (a.kind === "pick") {
      const p = a.p;
      p.taken = true;
      this.affan.setFacing(p.x < this.affan.x ? "left" : "right", this);
      this.affan.pose(this, 520, () => {
        const img = this.pickSprites.get(p.id);
        if (img) {
          this.tweens.killTweensOf(img);
          this.tweens.add({ targets: img, x: this.affan.x, y: this.affan.y - 30, scale: 0.05, alpha: 0, duration: 220, onComplete: () => img.destroy() });
          this.pickSprites.delete(p.id);
        }
        if (p.kind === "log") {
          this.core.fire.logs += 1;
          addWood(this.quest);
          this.floater("+1 Kayu");
          this.respawnQ.push({ id: p.id, at: this.t + 30 });
        } else {
          addStone(this.quest);
          this.floater("+1 Batu");
        }
        this.events.emit("quest");
      });
    } else if (a.kind === "light") {
      this.core.fire.logs -= WOOD_GOAL;
      this.quest.lit = true;
      this.core.mainCamp.lit = true;
      this.affan.pose(this, 600, () => {
        this.floater("Api menyala!", "#ffd27a");
        this.cameras.main.flash(260, 255, 190, 110);
        this.events.emit("quest");
        this.events.emit("toast", "Unggun api menyala! Cahaya menghalau kegelapan.");
        this.time.delayedCall(3500, () => this.startWolf());
      });
    } else if (a.kind === "feed") {
      this.handle(this.core.feed());
      this.floater("-1 Kayu", "#ffb070");
    }
  }

  private floater(text: string, color = "#ffeaa8"): void {
    const t = this.add
      .text(this.affan.x, this.affan.y - 78, text, { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "15px", fontStyle: "bold", color, stroke: "#2a1608", strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(D_DARK + 6)
      .setResolution(3);
    this.tweens.add({ targets: t, y: t.y - 34, alpha: { from: 1, to: 0 }, duration: 1300, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }

  private handle(events: CoreEvent[]): void {
    for (const e of events) {
      if (e.type === "toast") this.events.emit("toast", e.text);
      if (e.type === "gameover") {
        this.over = true;
        this.events.emit("gameover", e.time);
      }
    }
  }

  private startWolf(): void {
    if (this.wolfState !== "none") return;
    this.wolfState = "eyes";
    this.wolfT = 0;
  }

  private stepWolf(dt: number): void {
    const tw = this.lay.twisted;
    this.wolfT += dt;
    if (this.wolfState === "eyes" && this.wolfT > 2.2) {
      this.wolfState = "stalk";
      this.wolfT = 0;
      this.wolf = this.add.image(tw.x + 20, tw.y + 30, ATLAS_KEY, "wolf").setOrigin(0.5, 0.92).setScale(0.0).setAlpha(0).setFlipX(true);
      this.tweens.add({ targets: this.wolf, scale: 0.25, alpha: 1, duration: 600, ease: "Back.easeOut" });
      this.cameras.main.shake(420, 0.006);
      this.events.emit("toast", "Grrr... seekor serigala muncul dari akar pokok!");
    }
    if (!this.wolf) return;
    const camp = this.core.mainCamp;
    const r = this.core.lightSources()[0]?.r ?? 0;
    if (this.wolfState === "stalk") {
      // walk toward the camp but stop at the edge of the firelight
      const d = Math.hypot(camp.x - this.wolf.x, camp.y - this.wolf.y);
      if (d > r - 15) {
        const a = Math.atan2(camp.y - this.wolf.y, camp.x - this.wolf.x);
        this.wolf.x += Math.cos(a) * 42 * dt;
        this.wolf.y += Math.sin(a) * 42 * dt;
        this.wolf.setFlipX(Math.cos(a) > 0);
      } else if (this.wolfT > 1) {
        this.wolfState = "flee";
        this.wolfT = 0;
        this.cameras.main.shake(260, 0.004);
        this.events.emit("toast", "Serigala takut cahaya api... ia berundur.");
      }
      if (this.wolfT > 9) { this.wolfState = "flee"; this.wolfT = 0; }
    } else if (this.wolfState === "flee") {
      const a = Math.atan2(this.wolf.y - camp.y, this.wolf.x - camp.x);
      this.wolf.x += Math.cos(a) * 80 * dt;
      this.wolf.y += Math.sin(a) * 80 * dt;
      this.wolf.setFlipX(Math.cos(a) > 0);
      if (this.wolfT > 3) {
        this.tweens.add({ targets: this.wolf, alpha: 0, duration: 500, onComplete: () => this.wolf?.destroy() });
        this.wolfState = "gone";
      }
    }
    this.wolf?.setDepth(this.wolf.y);
  }

  update(_t: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.08);
    this.t += dt;
    this.frames++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) { this.fps = this.frames / this.fpsT; this.frames = 0; this.fpsT = 0; }

    if (this.quest.lit && !this.over) this.handle(this.core.step(dt));

    // movement with eased start/stop
    const inp = this.input2;
    const len = Math.min(1, Math.hypot(inp.x, inp.y));
    const tx = this.affan.posing || this.over ? 0 : (len > 0.01 ? (inp.x / Math.hypot(inp.x, inp.y)) * len * WALK : 0);
    const ty = this.affan.posing || this.over ? 0 : (len > 0.01 ? (inp.y / Math.hypot(inp.x, inp.y)) * len * WALK : 0);
    const k = 1 - Math.exp(-dt * (len > 0.01 ? 9 : 12));
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.y += (ty - this.vel.y) * k;
    let nx = this.affan.x + this.vel.x * dt;
    let ny = this.affan.y + this.vel.y * dt;
    for (const c of this.colliders) {
      const dx = nx - c.x, dy = (ny - c.y) * 1.6, d = Math.hypot(dx, dy), m = c.r + 14;
      if (d < m && d > 0.001) { nx = c.x + (dx / d) * m; ny = c.y + (dy / d) * m / 1.6; }
    }
    const b = this.lay.bounds, bd = Math.hypot(nx - b.cx, ny - b.cy);
    if (bd > b.r) { nx = b.cx + ((nx - b.cx) / bd) * b.r; ny = b.cy + ((ny - b.cy) / bd) * b.r; }
    nx = Phaser.Math.Clamp(nx, 80, CFG.WORLD - 80);
    ny = Phaser.Math.Clamp(ny, 80, CFG.WORLD - 80);
    this.affan.root.setPosition(nx, ny).setDepth(ny);
    const speed = Math.hypot(this.vel.x, this.vel.y);
    // facing with a short hold so diagonals don't flicker
    if (speed > 14 && !this.affan.posing) {
      const f: Facing = Math.abs(this.vel.x) > Math.abs(this.vel.y) * 1.15 ? (this.vel.x < 0 ? "left" : "right") : this.vel.y < 0 ? "up" : "down";
      if (f !== this.facingCandidate) { this.facingCandidate = f; this.facingHold = 0; }
      this.facingHold += dt;
      if (this.facingHold > 0.07) this.affan.setFacing(f, this);
    }
    this.affan.update(dt, speed / WALK);
    // trees in front of Affan fade so he stays visible (storybook look keeps trees big)
    for (const tr of this.trees) {
      const behind = ny < tr.y - 4 && ny > tr.y - tr.displayHeight * 0.95 && Math.abs(nx - tr.x) < tr.displayWidth * 0.42;
      const a = behind ? 0.42 : 1;
      if (tr.alpha !== a) tr.setAlpha(tr.alpha + (a - tr.alpha) * (1 - Math.exp(-dt * 10)));
    }
    if (inp.action) { inp.action = false; this.doAction(); }

    // pickups respawn so the fire can be fed later
    for (const r of [...this.respawnQ]) {
      if (this.t < r.at) continue;
      const p = this.lay.pickups[r.id]!;
      if (Math.hypot(p.x - this.affan.x, p.y - this.affan.y) < 160) continue;
      p.taken = false;
      this.spawnPickup(p);
      this.respawnQ.splice(this.respawnQ.indexOf(r), 1);
    }

    // eased camera with a small look-ahead
    const cam = this.cameras.main;
    const kc = 1 - Math.exp(-dt * 4.5);
    this.camPos.x += (nx + this.vel.x * 0.45 - this.camPos.x) * kc;
    this.camPos.y += (ny - 34 + this.vel.y * 0.35 - this.camPos.y) * kc;
    cam.centerOn(this.camPos.x, this.camPos.y);

    if (this.wolfState !== "none" && this.wolfState !== "gone") this.stepWolf(dt);
    this.drawFire(dt);
    this.drawLight();
    this.drawFx(dt);
  }

  private drawFire(dt: number): void {
    const lit = this.quest.lit && !this.core.fire.out;
    const lvl = this.core.fire.fuel / this.core.fire.fuelMax;
    const cur = Math.floor(this.t * 9) % 3;
    this.flames.forEach((f, i) => {
      f.setVisible(lit);
      if (!lit) return;
      const target = i === cur ? 1 : 0;
      f.setAlpha(f.alpha + (target - f.alpha) * (1 - Math.exp(-dt * 20)));
      const s = (0.22 + 0.16 * lvl) * (1 + Math.sin(this.t * 13 + i) * 0.04);
      f.setScale(s * (1 + Math.sin(this.t * 7 + i * 2) * 0.03), s);
    });
  }

  private drawLight(): void {
    const cam = this.cameras.main, z = cam.zoom, view = cam.worldView;
    this.dark.setPosition(cam.width / 2, cam.height / 2).setScale(2 / z);
    this.dark.clear().fill(NIGHT, 0.5);
    const erase = (x: number, y: number, r: number, a: number) => {
      this.brush.setPosition((x - view.x) * z * 0.5, (y - view.y) * z * 0.5).setScale((r * 2 * z * 0.5) / 256).setAlpha(a);
      this.dark.erase(this.brush);
    };
    const lights = this.core.lightSources();
    for (const L of lights) erase(L.x, L.y, L.r * (1 + Math.sin(this.t * 9) * 0.015), 1);
    // moonlight around Affan so he never vanishes in the dark
    erase(this.affan.x, this.affan.y - 30, 105, 0.55);
    const L0 = lights[0];
    this.glow.setVisible(!!L0);
    if (L0) this.glow.setPosition(L0.x, L0.y - 10).setScale((L0.r * 1.3) / 256).setAlpha(0.85 + Math.sin(this.t * 11) * 0.08);
  }

  private drawFx(dt: number): void {
    const lights = this.core.lightSources();
    const view = this.cameras.main.worldView;
    // red eyes in the dark (GameCore eyes) + a pair in the twisted tree's roots
    this.eyes.clear();
    const pair = (x: number, y: number, s: number) => {
      this.eyes.fillStyle(0xff3010, 0.3).fillCircle(x - 4 * s, y, 4.5 * s).fillCircle(x + 4 * s, y, 4.5 * s);
      this.eyes.fillStyle(0xff2a22, 1).fillEllipse(x - 4 * s, y, 4 * s, 2.2 * s).fillEllipse(x + 4 * s, y, 4 * s, 2.2 * s);
    };
    for (const e of this.core.world.eyes) {
      if (lightAt(lights, e.x, e.y) > 0.2) continue;
      if (Math.sin(this.t * 2.2 + e.ph) < -0.85) continue;
      if (!Phaser.Geom.Rectangle.Contains(view, e.x, e.y)) continue;
      pair(e.x, e.y, 1);
    }
    const tw = this.lay.twisted;
    const show = this.wolfState === "none" || this.wolfState === "eyes";
    if (show && Math.sin(this.t * 1.7) > -0.8) pair(tw.x + 4, tw.y - 34, this.wolfState === "eyes" ? 1.4 : 1);

    // fireflies drift, flicker, and wrap around the camera
    for (const f of this.flies) {
      f.ph += dt * f.sp;
      f.x += Math.cos(f.ph * 0.9) * 10 * dt;
      f.y += Math.sin(f.ph * 1.3) * 7 * dt;
      if (f.x < view.x - 40) f.x += view.width + 80;
      if (f.x > view.right + 40) f.x -= view.width + 80;
      if (f.y < view.y - 40) f.y += view.height + 80;
      if (f.y > view.bottom + 40) f.y -= view.height + 80;
      f.s.setPosition(f.x, f.y).setAlpha(0.35 + 0.65 * Math.max(0, Math.sin(f.ph * 3)));
    }
    // low rolling fog at the bottom of the screen
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
      get quest() { return { ...scene.quest }; },
      get logs() { return scene.core.fire.logs; },
      get fire() { return { ...scene.core.fire }; },
      get player() { return { x: scene.affan.x, y: scene.affan.y, facing: scene.affan.facing }; },
      get wolf() { return scene.wolfState; },
      get busy() { return scene.affan.posing; },
      get wolfPos() { return scene.wolf && scene.wolf.active ? { x: scene.wolf.x, y: scene.wolf.y, scale: scene.wolf.scale, alpha: scene.wolf.alpha, depth: scene.wolf.depth } : null; },
      get fps() { return scene.fps; },
      pickups: () => scene.lay.pickups.map((p) => ({ ...p })),
      camp: () => ({ x: scene.core.mainCamp.x, y: scene.core.mainCamp.y }),
      /** Move Affan next to the nearest pickup of a kind (or the camp) for tests and screenshots. */
      goTo: (x: number, y: number) => { scene.affan.root.setPosition(x, y); scene.camPos.set(x, y - 34); },
      act: () => scene.doAction(),
      setInput: (x: number, y: number) => { scene.input2.x = x; scene.input2.y = y; },
    };
  }

  questDone(): boolean {
    return questDone(this.quest);
  }
}
